const mongoose = require('mongoose');
const { logError, logInfo } = require('../../lib/helpers/logger');
const mediaAssetServices = require('./mediaAssetServices');
const messageServices = require('./messageServices');
const privateMessageServices = require('./privateMessageServices');

const PostModel = require('../models/post.model');

const {
  detectImageModeration,
  startVideoModeration,
  getVideoModeration,
} = require('../../lib/helpers/rekognitionModeration');

const isEnabled = () => String(process.env.MEDIA_MODERATION_ENABLED || 'true').toLowerCase() !== 'false';

const mapToDenorm = (asset) => {
  const m = (asset && asset.moderation) || {};
  const ban = (m && m.ban) || {};
  return {
    status: m.status || 'unknown',
    isBanned: !!ban.isBanned,
    primaryReason: ban.primaryReason || null,
    reasons: ban.reasons || [],
    checkedAt: m.checkedAt || null,
    provider: m.provider || 'rekognition',
  };
};

const propagateToMessagesAndPosts = async (asset) => {
  const assetId = asset && asset._id ? asset._id : null;
  if (!assetId) return;

  const denorm = mapToDenorm(asset);

  await Promise.allSettled([
    messageServices.updateMany({
      filter: { mediaAssetId: new mongoose.Types.ObjectId(assetId) },
      body: { $set: { mediaModeration: denorm } },
    }),
    privateMessageServices.updateMany({
      filter: { mediaAssetId: new mongoose.Types.ObjectId(assetId) },
      body: { $set: { mediaModeration: denorm } },
    }),
  ]);

  // Update post media items using arrayFilters (must use model directly).
  await PostModel.updateMany(
    { 'media.assetId': new mongoose.Types.ObjectId(assetId) },
    {
      $set: {
        'media.$[m].moderation': denorm,
        mediaModeration: {
          status: denorm.status,
          isBanned: denorm.isBanned,
          checkedAt: denorm.checkedAt,
        },
      },
    },
    {
      arrayFilters: [{ 'm.assetId': new mongoose.Types.ObjectId(assetId) }],
    },
  );
};

const claimOne = async (filter, update) => mediaAssetServices.findOneAndUpdate({
  filter,
  body: update,
  customOptions: { sort: { createdAt: 1 } },
});

exports.ensureAssetForS3Object = async ({
  ownerUserId = null,
  bucket,
  key,
  url = null,
  etag = null,
  contentType = null,
  size = null,
  mediaType = 'other',
}) => {
  const safeMediaType = ['image', 'video', 'audio'].includes(mediaType) ? mediaType : 'other';
  const doc = await mediaAssetServices.findOneAndUpsert({
    filter: { bucket, key },
    body: {
      $setOnInsert: {
        ownerUserId: ownerUserId ? new mongoose.Types.ObjectId(ownerUserId) : null,
        bucket,
        key,
        mediaType: safeMediaType,
        moderation: {
          provider: 'rekognition',
          status: safeMediaType === 'audio' ? 'skipped' : 'pending',
          checkedAt: null,
          requestId: null,
          jobId: null,
          labels: [],
          ban: {
            isBanned: false,
            primaryReason: {
              label: null,
              parentLabel: null,
              confidence: null,
              threshold: null,
            },
            reasons: [],
            policyVersion: String(process.env.MEDIA_MODERATION_POLICY_VERSION || 'v1'),
          },
          error: { message: null, code: null },
        },
      },
      // Keep URL/metadata up to date if re-uploaded
      $set: {
        url: url || undefined,
        etag: etag || undefined,
        contentType: contentType || undefined,
        size: typeof size === 'number' ? size : undefined,
      },
    },
  });
  return doc;
};

// Processes mediaAssets in moderation.status=pending. Images are fully decided here.
// Videos are started here (jobId is stored); completion is handled by poller.
exports.processPendingMediaAssets = async ({ limit = 10 } = {}) => {
  if (!isEnabled()) return;

  let processed = 0;
  for (let i = 0; i < limit; i += 1) {
    const asset = await claimOne(
      {
        'moderation.status': 'pending',
        mediaType: { $in: ['image', 'video'] },
      },
      { $set: { 'moderation.status': 'processing', 'moderation.error': { message: null, code: null } } },
    );

    if (!asset) break;

    try {
      if (asset.mediaType === 'image') {
        const { resp, labels, decision } = await detectImageModeration({
          bucket: asset.bucket,
          key: asset.key,
        });

        const requestId = (resp && resp.$metadata && resp.$metadata.requestId) || null;

        const updated = await mediaAssetServices.findByIdAndUpdate({
          id: asset._id,
          body: {
            $set: {
              'moderation.status': decision.status,
              'moderation.checkedAt': new Date(),
              'moderation.requestId': requestId,
              'moderation.labels': labels,
              'moderation.ban': decision.ban,
            },
          },
        });

        await propagateToMessagesAndPosts(updated);
      } else if (asset.mediaType === 'video') {
        const { resp, jobId } = await startVideoModeration({
          bucket: asset.bucket,
          key: asset.key,
        });

        const requestId = (resp && resp.$metadata && resp.$metadata.requestId) || null;
        if (!jobId) {
          throw new Error('Rekognition StartContentModeration returned no jobId');
        }

        await mediaAssetServices.findByIdAndUpdate({
          id: asset._id,
          body: {
            $set: {
              'moderation.status': 'processing',
              'moderation.requestId': requestId,
              'moderation.jobId': jobId,
            },
          },
        });
      }

      processed += 1;
    } catch (err) {
      const code = err && (err.name || err.Code || err.code) ? String(err.name || err.Code || err.code) : null;
      const message = err && err.message ? String(err.message) : 'Unknown error';

      const updated = await mediaAssetServices.findByIdAndUpdate({
        id: asset._id,
        body: {
          $set: {
            'moderation.status': 'error',
            'moderation.checkedAt': new Date(),
            'moderation.error': { message, code },
          },
        },
      });

      await propagateToMessagesAndPosts(updated);
      logError('[mediaModeration] pending processing failed:', message);
    }
  }

  if (processed) {
    logInfo(`[mediaModeration] processed pending assets: ${processed}`);
  }
};

// Polls in-progress video jobs and finalizes status/ban reasons.
exports.processInProgressVideoModeration = async ({ limit = 5 } = {}) => {
  if (!isEnabled()) return;

  let processed = 0;
  for (let i = 0; i < limit; i += 1) {
    const asset = await claimOne(
      {
        mediaType: 'video',
        'moderation.status': 'processing',
        'moderation.jobId': { $ne: null },
      },
      { $set: { 'moderation.error': { message: null, code: null } } },
    );

    if (!asset) break;

    try {
      const { jobStatus, labels, decision } = await getVideoModeration({ jobId: asset.moderation.jobId });

      if (jobStatus === 'IN_PROGRESS') {
        // Keep processing; do not overwrite labels yet to avoid huge writes.
        continue;
      }

      if (jobStatus !== 'SUCCEEDED') {
        throw new Error(`Rekognition GetContentModeration status: ${jobStatus || 'unknown'}`);
      }

      const updated = await mediaAssetServices.findByIdAndUpdate({
        id: asset._id,
        body: {
          $set: {
            'moderation.status': decision.status,
            'moderation.checkedAt': new Date(),
            'moderation.labels': labels,
            'moderation.ban': decision.ban,
          },
        },
      });

      await propagateToMessagesAndPosts(updated);
      processed += 1;
    } catch (err) {
      const code = err && (err.name || err.Code || err.code) ? String(err.name || err.Code || err.code) : null;
      const message = err && err.message ? String(err.message) : 'Unknown error';

      const updated = await mediaAssetServices.findByIdAndUpdate({
        id: asset._id,
        body: {
          $set: {
            'moderation.status': 'error',
            'moderation.checkedAt': new Date(),
            'moderation.error': { message, code },
          },
        },
      });

      await propagateToMessagesAndPosts(updated);
      logError('[mediaModeration] video poll failed:', message);
    }
  }

  if (processed) {
    logInfo(`[mediaModeration] finalized video assets: ${processed}`);
  }
};
