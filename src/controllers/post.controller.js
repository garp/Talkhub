const { ObjectId } = require('mongodb');
const postServices = require('../services/postServices');
const chatroomServices = require('../services/chatroomServices');
const messageServices = require('../services/messageServices');
const likeServices = require('../services/likeServices');
const userServices = require('../services/userServices');
const hiddenPostServices = require('../services/hiddenPostServices');
const interestCategoryServices = require('../services/interestCategoryServices');
const interestSubCategoryServices = require('../services/interestSubCategoryServices');
const mediaModerationService = require('../services/mediaModerationService');
const notificationService = require('../services/notificationService');
const pushNotificationService = require('../services/pushNotificationService');
const { parseS3Url } = require('../../lib/helpers/s3UrlParser');
const { extractMentions } = require('../../lib/helpers/mentionParser');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { errorHandler, responseHandler } = require('../../lib/helpers/responseHandler');
const { getAllPostsQuery, getSavedPostsQuery, getPostRepliesByUserQuery } = require('../queries/post.queries');
const commentService = require('../services/commentService');
const { emitNewFeedPost } = require('../events/feedEvents');

exports.createPost = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const {
    location,
    text,
    media,
    labels,
    replySettings,
    extraReplySetting,
    interestCategories,
    interestSubCategories,
  } = req.value;

  // Validate interest categories if provided
  if (interestCategories && interestCategories.length) {
    const categories = await interestCategoryServices.find({
      filter: { _id: { $in: interestCategories }, isActive: true },
      projection: { _id: 1 },
    });

    if (!categories || categories.length !== interestCategories.length) {
      return errorHandler('ERR-136', res);
    }
  }

  // Validate interest subcategories if provided
  if (interestSubCategories && interestSubCategories.length) {
    const subCategories = await interestSubCategoryServices.find({
      filter: { _id: { $in: interestSubCategories }, isActive: true },
      projection: { _id: 1 },
    });

    if (!subCategories || subCategories.length !== interestSubCategories.length) {
      return errorHandler('ERR-137', res);
    }
  }

  const resolvedMedia = await Promise.all(
    (media || []).map(async (m) => {
      const out = { ...m };

      // If client sent an assetId, trust it (moderation worker will update later).
      if (m && m.assetId) {
        out.assetId = new ObjectId(String(m.assetId));
        out.moderation = {
          status: 'pending',
          isBanned: false,
          checkedAt: null,
          provider: 'rekognition',
          primaryReason: null,
          reasons: [],
        };
        return out;
      }

      // Backward compatibility: infer bucket+key from S3 URL and create asset record.
      const parsed = parseS3Url(m && m.url);
      if (!parsed) {
        out.moderation = { status: 'unknown', isBanned: false };
        return out;
      }

      const asset = await mediaModerationService.ensureAssetForS3Object({
        ownerUserId: userId,
        bucket: parsed.bucket,
        key: parsed.key,
        url: m.url,
        mediaType: m.mediaType,
      });

      out.assetId = asset && asset._id ? asset._id : null;
      out.moderation = asset && asset.moderation
        ? {
          status: asset.moderation.status || 'pending',
          isBanned: !!(asset.moderation.ban && asset.moderation.ban.isBanned),
          checkedAt: asset.moderation.checkedAt || null,
          provider: asset.moderation.provider || 'rekognition',
          primaryReason: (asset.moderation.ban && asset.moderation.ban.primaryReason) || null,
          reasons: (asset.moderation.ban && asset.moderation.ban.reasons) || [],
        }
        : { status: 'pending', isBanned: false };

      return out;
    }),
  );

  const statuses = (resolvedMedia || []).map((m) => (m && m.moderation && m.moderation.status) || 'unknown');
  const anyRejected = (resolvedMedia || []).some((m) => m && m.moderation && m.moderation.isBanned);
  const anyReview = statuses.includes('needs_review');
  const anyPending = statuses.some((s) => s === 'pending' || s === 'processing');

  const postMediaModeration = {
    status: anyRejected ? 'rejected' : (anyReview ? 'needs_review' : (anyPending ? 'pending' : (statuses.length ? 'approved' : 'unknown'))),
    isBanned: anyRejected,
    checkedAt: new Date(),
  };

  // Extract @mentions from post text
  const mentionedUsernames = extractMentions(text);
  let mentionedUserIds = [];
  let mentionedUsers = [];

  if (mentionedUsernames.length > 0) {
    // Look up users by username (case-insensitive)
    // Support both with and without @ prefix in database
    const usernameVariants = mentionedUsernames.flatMap((u) => [u, `@${u}`]);
    mentionedUsers = await userServices.find({
      filter: {
        $or: [
          { userName: { $in: usernameVariants } },
          { userName: { $regex: `^@?(${mentionedUsernames.join('|')})$`, $options: 'i' } },
        ],
      },
      projection: {
        _id: 1, userName: 1, fullName: 1, fcmToken: 1,
      },
    });

    // Filter out self-mentions and extract user IDs
    mentionedUserIds = (mentionedUsers || [])
      .filter((u) => u._id.toString() !== userId.toString())
      .map((u) => u._id);
  }

  const post = await postServices.create({
    body: {
      userId,
      location,
      text,
      media: resolvedMedia || [],
      mediaModeration: postMediaModeration,
      labels: labels || [],
      replySettings,
      extraReplySetting,
      interestCategories: interestCategories || [],
      interestSubCategories: interestSubCategories || [],
      mentions: mentionedUserIds,
    },
  });

  // Get creator info for notifications
  const creator = await userServices.findById({ id: userId });
  const creatorName = (creator && (creator.fullName || creator.userName)) || 'Someone';

  // Emit newFeed socket event to all connected users (except creator)
  try {
    emitNewFeedPost({
      creatorUserId: userId,
      post,
      creator: creator ? {
        _id: creator._id,
        userName: creator.userName,
        fullName: creator.fullName,
        profilePicture: creator.profilePicture,
      } : null,
    });
  } catch (e) {
    // Non-blocking: don't fail post creation if socket emit fails
    console.error('Failed to emit newFeedPost:', e.message);
  }

  // Send notifications to mentioned users (non-blocking)
  if (mentionedUserIds.length > 0) {
    const postPreview = text && text.length > 50 ? `${text.substring(0, 50)}...` : (text || '');

    // Create in-app notifications and push notifications for each mentioned user
    const notificationPromises = mentionedUsers
      .filter((u) => u._id.toString() !== userId.toString())
      .map(async (mentionedUser) => {
        try {
          // Create in-app notification
          await notificationService.create({
            body: {
              userId: mentionedUser._id,
              senderId: new ObjectId(userId),
              category: 'updates',
              type: 'mention',
              summary: `${creatorName} mentioned you in a post`,
              meta: {
                kind: 'post_mention',
                postId: post._id,
                postPreview,
                mentionedBy: {
                  _id: creator._id,
                  userName: creator.userName,
                  fullName: creator.fullName,
                  profilePicture: creator.profilePicture,
                },
              },
            },
          });

          // Send push notification if user has FCM token
          if (mentionedUser.fcmToken) {
            await pushNotificationService.sendMentionNotification({
              fcmToken: mentionedUser.fcmToken,
              mentionedByName: creatorName,
              postPreview,
              postId: post._id,
              userId,
            });
          }
        } catch (err) {
          // Non-blocking: don't fail post creation if notification fails
          console.error(`Failed to send mention notification to ${mentionedUser._id}:`, err.message);
        }
      });

    // Fire and forget - don't await to avoid blocking response
    Promise.allSettled(notificationPromises).catch(() => { });
  }

  return responseHandler({ post }, res);
});

exports.getAllPosts = asyncHandler(async (req, res) => {
  const {
    postId,
    postBy,
    pageNum,
    pageSize,
    interestCategoryId,
    interestSubCategoryId,
  } = req.query;
  const { userId } = req.user;
  const filter = {};
  const sort = { createdAt: -1 };
  const pagination = { skip: 0, limit: 10 };

  const userObjectId = new ObjectId(userId);
  const me = await userServices.findOne({
    filter: { _id: userId },
    projection: { blockedUsers: 1 },
  });
  const blockedUserIds = (me && Array.isArray(me.blockedUsers))
    ? me.blockedUsers.map((b) => b.userId).filter(Boolean)
    : [];
  const excludedCreatorIds = [...new Set(blockedUserIds.map((id) => id.toString()))]
    .map((id) => new ObjectId(id));

  // If user requests a specific creator and they're blocked, return empty
  if (postBy && excludedCreatorIds.some((id) => id.toString() === postBy.toString())) {
    return responseHandler({
      metadata: {
        totalCount: 0, totalPages: 0, pageNum, pageSize,
      },
      posts: [],
    }, res);
  }

  if (postId) {
    // If this post is hidden by "not interested", return empty
    const hidden = await hiddenPostServices.findOne({
      filter: { userId: new ObjectId(userId), postId: new ObjectId(postId) },
      projection: { _id: 1 },
    });
    if (hidden) {
      return responseHandler({
        metadata: {
          totalCount: 0, totalPages: 0, pageNum, pageSize,
        },
        posts: [],
      }, res);
    }
    // If post author has blocked the current user, return TalkHub User only (no post content)
    const postDoc = await postServices.findOne({
      filter: { _id: new ObjectId(postId) },
      projection: { userId: 1 },
    });
    if (postDoc && postDoc.userId) {
      const authorHasBlockedViewer = await userServices.findOne({
        filter: {
          _id: postDoc.userId,
          'blockedUsers.userId': new ObjectId(userId),
        },
        projection: { _id: 1 },
      });
      if (authorHasBlockedViewer) {
        return responseHandler({
          message: 'TalkHub User',
          metadata: {
            totalCount: 0, totalPages: 0, pageNum, pageSize,
          },
          posts: [],
        }, res);
      }
    }
    filter._id = new ObjectId(postId);
  }

  if (postBy) {
    filter.userId = new ObjectId(postBy);
  }

  if (!postBy && !postId && excludedCreatorIds.length) {
    filter.userId = { $nin: excludedCreatorIds };
  }

  if (interestCategoryId) {
    filter.interestCategories = new ObjectId(interestCategoryId);
  }

  if (interestSubCategoryId) {
    filter.interestSubCategories = new ObjectId(interestSubCategoryId);
  }

  if (pageNum && pageSize) {
    pagination.skip = (Number(pageNum) - 1) * Number(pageSize);
    pagination.limit = Number(pageSize);
  }

  // Exclude posts the user marked as "not interested"
  const hiddenPosts = await hiddenPostServices.find({
    filter: { userId: new ObjectId(userId), reason: 'not_interested' },
    projection: { postId: 1 },
  });
  const hiddenPostIds = (hiddenPosts || []).map((h) => h.postId).filter(Boolean);
  if (!postId && hiddenPostIds.length) {
    filter._id = { $nin: hiddenPostIds };
  }

  const query = getAllPostsQuery(filter, sort, pagination, userId);
  // Also enforce not-interested exclusion inside aggregation to avoid ObjectId/$nin edge cases.
  // Model name 'hiddenPosts' => default Mongo collection 'hiddenposts'.
  if (Array.isArray(query) && query.length && query[0] && query[0].$match) {
    query.splice(
      1,
      0,
      {
        $lookup: {
          from: 'hiddenposts',
          let: { postId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$postId', '$$postId'] },
                    { $eq: ['$userId', userObjectId] },
                    { $eq: ['$reason', 'not_interested'] },
                  ],
                },
              },
            },
            { $project: { _id: 1 } },
          ],
          as: '_hiddenForUser',
        },
      },
      {
        $match: {
          _hiddenForUser: { $eq: [] },
        },
      },
      {
        $project: {
          _hiddenForUser: 0,
        },
      },
    );
  }
  const posts = await postServices.aggregate({ query });
  const totalPosts = posts.length;
  const totalPages = Math.ceil(totalPosts / pagination.limit);
  return responseHandler({
    metadata: {
      totalCount: totalPosts, totalPages, pageNum, pageSize,
    },
    posts,
  }, res);
});

exports.markNotInterested = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { postId } = req.value;

  await hiddenPostServices.findOneAndUpsert({
    filter: { userId: new ObjectId(userId), postId: new ObjectId(postId) },
    body: {
      $set: { reason: 'not_interested' },
      $setOnInsert: { userId: new ObjectId(userId), postId: new ObjectId(postId) },
    },
  });

  return responseHandler({ message: 'Post marked as not interested' }, res);
});

exports.undoNotInterested = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { postId } = req.value;

  await hiddenPostServices.findOneAndDelete({
    filter: { userId: new ObjectId(userId), postId: new ObjectId(postId) },
  });

  return responseHandler({ message: 'Not interested removed' }, res);
});

exports.deletePost = asyncHandler(async (req, res) => {
  const { postId } = req.value;
  const { userId } = req.user;

  const post = await postServices.findOneAndDelete({ filter: { _id: postId, userId } });

  if (!post) {
    return errorHandler('ERR-115', res);
  }

  await likeServices.deleteMany({ filter: { postId } });

  return responseHandler({ message: 'Post deleted successfully' }, res);
});

exports.editPost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const {
    location,
    text,
    media,
    labels,
    replySettings,
    extraReplySetting,
    interestCategories,
    interestSubCategories,
  } = req.value;
  const { userId } = req.user;

  const updateBody = {
    location,
    text,
    labels,
    replySettings,
    extraReplySetting,
  };

  if (typeof media !== 'undefined') {
    const resolvedMedia = await Promise.all(
      (media || []).map(async (m) => {
        const out = { ...m };
        if (m && m.assetId) {
          out.assetId = new ObjectId(String(m.assetId));
          out.moderation = {
            status: 'pending',
            isBanned: false,
            checkedAt: null,
            provider: 'rekognition',
            primaryReason: null,
            reasons: [],
          };
          return out;
        }

        const parsed = parseS3Url(m && m.url);
        if (!parsed) {
          out.moderation = { status: 'unknown', isBanned: false };
          return out;
        }

        const asset = await mediaModerationService.ensureAssetForS3Object({
          ownerUserId: userId,
          bucket: parsed.bucket,
          key: parsed.key,
          url: m.url,
          mediaType: m.mediaType,
        });

        out.assetId = asset && asset._id ? asset._id : null;
        out.moderation = asset && asset.moderation
          ? {
            status: asset.moderation.status || 'pending',
            isBanned: !!(asset.moderation.ban && asset.moderation.ban.isBanned),
            checkedAt: asset.moderation.checkedAt || null,
            provider: asset.moderation.provider || 'rekognition',
            primaryReason: (asset.moderation.ban && asset.moderation.ban.primaryReason) || null,
            reasons: (asset.moderation.ban && asset.moderation.ban.reasons) || [],
          }
          : { status: 'pending', isBanned: false };

        return out;
      }),
    );

    const statuses = (resolvedMedia || []).map((m) => (m && m.moderation && m.moderation.status) || 'unknown');
    const anyRejected = (resolvedMedia || []).some((m) => m && m.moderation && m.moderation.isBanned);
    const anyReview = statuses.includes('needs_review');
    const anyPending = statuses.some((s) => s === 'pending' || s === 'processing');

    updateBody.media = resolvedMedia;
    updateBody.mediaModeration = {
      status: anyRejected ? 'rejected' : (anyReview ? 'needs_review' : (anyPending ? 'pending' : (statuses.length ? 'approved' : 'unknown'))),
      isBanned: anyRejected,
      checkedAt: new Date(),
    };
  }

  if (typeof interestCategories !== 'undefined') {
    if (interestCategories && interestCategories.length) {
      const categories = await interestCategoryServices.find({
        filter: { _id: { $in: interestCategories }, isActive: true },
        projection: { _id: 1 },
      });

      if (!categories || categories.length !== interestCategories.length) {
        return errorHandler('ERR-136', res);
      }
    }
    updateBody.interestCategories = interestCategories || [];
  }

  if (typeof interestSubCategories !== 'undefined') {
    if (interestSubCategories && interestSubCategories.length) {
      const subCategories = await interestSubCategoryServices.find({
        filter: { _id: { $in: interestSubCategories }, isActive: true },
        projection: { _id: 1 },
      });

      if (!subCategories || subCategories.length !== interestSubCategories.length) {
        return errorHandler('ERR-137', res);
      }
    }
    updateBody.interestSubCategories = interestSubCategories || [];
  }

  const updatedPost = await postServices.findOneAndUpdate({
    filter: { _id: postId, userId },
    body: updateBody,
  });

  if (!updatedPost) {
    return errorHandler('ERR-120', res);
  }

  return responseHandler({ updatedPost }, res);
});

exports.getChatPost = asyncHandler(async (req, res) => {
  const { hashtagId } = req.value;

  const chatroom = await chatroomServices.findOne({ filter: { hashtagId } });
  if (!chatroom) {
    return errorHandler('ERR-116', res);
  }

  const { _id: chatroomId } = chatroom;
  let messages = await messageServices.find({
    filter: { chatroomId },
    sort: { createdAt: -1 },
    pagination: { limit: 2 },
  });

  messages = messages.reverse();

  return responseHandler({
    latestMessages: messages,
  }, res);
});

exports.getLikeCount = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  const post = await postServices.findById({ id: postId });
  if (!post) {
    return errorHandler('ERR-115', res);
  }

  return responseHandler({ likeCount: post.likeCount }, res);
});

exports.getViewsCount = asyncHandler(async (req, res) => {
  const { postId } = req.params;

  const post = await postServices.findById({ id: postId });
  if (!post) {
    return errorHandler('ERR-POST-404', res, 'Post not found.');
  }

  return responseHandler({ viewCount: post.viewCount || 0 }, res);
});

exports.savePost = asyncHandler(async (req, res) => {
  const { postId } = req.value;
  const { userId } = req.user;

  const post = await postServices.findById({ id: postId });
  if (!post) {
    return errorHandler('ERR-115', res);
  }

  const isSaved = await postServices.findOne({ filter: { userId, postId } });
  if (isSaved) {
    return responseHandler({ message: 'Post already saved' }, res);
  }

  const save = await postServices.createSave({
    body: {
      userId,
      postId,
    },
  });

  if (save) {
    return responseHandler({ message: 'Post saved successfully' }, res);
  }

  return errorHandler('ERR-115', res);
});

exports.removeSavedPost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { userId } = req.user;
  const save = await postServices.removeSavedPost({ filter: { userId, postId } });
  if (!save) {
    return errorHandler('ERR-115', res);
  }

  return responseHandler({ message: 'Post removed from saved successfully' }, res);
});

exports.getSavedPosts = asyncHandler(async (req, res) => {
  const { userId, pageNum = 1, pageSize = 10 } = req.query;
  const filter = {};
  if (userId) {
    filter.userId = new ObjectId(userId);
  } else {
    filter.userId = new ObjectId(req.user.userId);
  }
  const sort = { createdAt: -1 };
  const pagination = { skip: 0, limit: 10 };

  if (pageNum && pageSize) {
    pagination.skip = (Number(pageNum) - 1) * Number(pageSize);
    pagination.limit = Number(pageSize);
  }

  const query = getSavedPostsQuery(filter, sort, pagination, userId);
  const saves = await postServices.aggregateSave({ query });
  const totalSaves = saves.length;
  const totalPages = Math.ceil(totalSaves / pagination.limit);

  return responseHandler({
    metadata: {
      totalCount: totalSaves, totalPages, pageNum, pageSize,
    },
    saves,
  }, res);
});

/**
 * Get all posts where a specific user has replied to comments.
 * When viewing User C's profile, this shows all posts where User C has replied,
 * with the comment being replied to and User C's reply attached.
 *
 * GET /post-replies/:userId
 */
exports.getPostRepliesByUser = asyncHandler(async (req, res) => {
  const { userId: targetUserId } = req.params;
  const { pageNum = 1, pageSize = 20 } = req.query;
  const currentUserId = req.user.userId;

  const page = Math.max(1, Number(pageNum) || 1);
  const limit = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const skip = (page - 1) * limit;

  // Validate target user exists
  const targetUser = await userServices.findById({ id: targetUserId });
  if (!targetUser) {
    return errorHandler('ERR-114', res); // User not found
  }

  // Build the aggregation query
  const query = getPostRepliesByUserQuery(
    targetUserId,
    currentUserId,
    { createdAt: -1 },
    { skip, limit },
  );

  // Execute aggregation on comments collection
  const results = await commentService.aggregate({ query });

  // Get total count for pagination
  const totalCountResult = await commentService.aggregate({
    query: [
      {
        $match: {
          commentBy: new ObjectId(targetUserId),
          parentCommentId: { $ne: null },
        },
      },
      { $count: 'total' },
    ],
  });

  const totalCount = (totalCountResult && totalCountResult[0] && totalCountResult[0].total) || 0;
  const totalPages = Math.ceil(totalCount / limit);

  return responseHandler({
    metadata: {
      totalCount,
      totalPages,
      currentPage: page,
      pageSize: limit,
    },
    targetUser: {
      _id: targetUser._id,
      userName: targetUser.userName,
      fullName: targetUser.fullName,
      profilePicture: targetUser.profilePicture,
    },
    postReplies: results,
  }, res);
});
