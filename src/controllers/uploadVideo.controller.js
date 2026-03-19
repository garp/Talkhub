// controllers/uploadVideo.controller.js
const multer = require('multer');
const { upload } = require('../../lib/middlewares/mediaUpload.middleware');
const mediaModerationService = require('../services/mediaModerationService');
const thumbnailGenerator = require('../../lib/helpers/thumbnailGenerator');
const { toCloudFrontUrl } = require('../../lib/helpers/cloudfront');

const uploadVideo = (req, res) => {
  const runUpload = upload.single('video');

  runUpload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No video file uploaded.' });
    }

    const {
      location, key, bucket, etag, mimetype, size,
    } = req.file;

    console.log('[VideoUpload] ====== Video file received ======');
    console.log('[VideoUpload] location:', location);
    console.log('[VideoUpload] key:', key);
    console.log('[VideoUpload] bucket:', bucket);
    console.log('[VideoUpload] etag:', etag);
    console.log('[VideoUpload] mimetype:', mimetype);
    console.log('[VideoUpload] size:', size ? `${(size / (1024 * 1024)).toFixed(2)} MB` : 'N/A');
    console.log('[VideoUpload] originalname:', req.file.originalname || 'N/A');
    console.log('[VideoUpload] path (local):', req.file.path || 'N/A (uploaded to S3 directly)');

    // Generate thumbnail for the video
    let thumbnailUrl = null;
    try {
      console.log('[VideoUpload] Starting thumbnail generation...');
      const thumbStart = Date.now();
      const rawThumbnailUrl = await thumbnailGenerator.generateAndUploadThumbnail(req.file);
      console.log(`[VideoUpload] Raw thumbnail URL from generator: ${rawThumbnailUrl}`);
      thumbnailUrl = toCloudFrontUrl(rawThumbnailUrl);
      console.log(`[VideoUpload] CloudFront thumbnail URL: ${thumbnailUrl}`);
      console.log(`[VideoUpload] Thumbnail generation took ${Date.now() - thumbStart}ms`);
    } catch (thumbnailError) {
      console.error('[VideoUpload] Thumbnail generation FAILED:', thumbnailError.message);
      console.error('[VideoUpload] Thumbnail error stack:', thumbnailError.stack);
      // Continue without thumbnail - don't fail the upload
    }

    // Create/update mediaAssets record for this upload (moderate once, reuse everywhere).
    // Moderation is processed asynchronously by cron.
    const ownerUserId = (req.user && req.user.userId) || null;

    // Fire-and-forget; response should not block on Rekognition.
    mediaModerationService.ensureAssetForS3Object({
      ownerUserId,
      bucket,
      key,
      url: location,
      etag,
      contentType: mimetype,
      size,
      mediaType: 'video',
    }).then((asset) => {
      res.status(201).json({
        success: true,
        message: 'Video uploaded successfully.',
        file: {
          location: toCloudFrontUrl(location),
          thumbnailUrl,
          key,
          bucket,
          etag,
          mimetype,
          size,
          assetId: asset && asset._id ? asset._id : null,
          moderationStatus: (asset && asset.moderation && asset.moderation.status) || 'pending',
        },
      });
    }).catch((e) => {
      // Upload succeeded even if moderation record creation fails.
      res.status(201).json({
        success: true,
        message: 'Video uploaded successfully (moderation pending).',
        file: {
          location: toCloudFrontUrl(location),
          thumbnailUrl,
          key,
          bucket,
          etag,
          mimetype,
          size,
          assetId: null,
          moderationStatus: 'pending',
          moderationError: e && e.message ? e.message : 'unknown',
        },
      });
    });

    return null;
  });
};

module.exports = { uploadVideo };
