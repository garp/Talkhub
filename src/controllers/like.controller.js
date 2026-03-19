const mongoose = require('mongoose');
const postServices = require('../services/postServices');
const likeServices = require('../services/likeServices');
const userServices = require('../services/userServices');
const notificationService = require('../services/notificationService');
const pushNotificationService = require('../services/pushNotificationService');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { errorHandler, responseHandler } = require('../../lib/helpers/responseHandler');

exports.likePost = asyncHandler(async (req, res) => {
  const { postId } = req.params;
  const { userId } = req.user;

  const post = await postServices.findById({
    id: postId,
  });

  if (!post) {
    return errorHandler('ERR-115', res);
  }

  const existingLike = await likeServices.findOne({ filter: { userId, postId } });
  if (existingLike) {
    await likeServices.findOneAndDelete({ filter: { userId, postId } });
    return responseHandler({ message: 'Post like removed successfully' }, res);
  }

  await likeServices.findOneAndUpsert({
    filter: { postId, userId },
    body: { postId, userId },
  });

  // Notify post owner (non-blocking)
  try {
    const postOwnerId = post.userId && post.userId.toString ? post.userId.toString() : String(post.userId || '');
    if (postOwnerId && postOwnerId !== String(userId)) {
      const [postOwner, actor] = await Promise.all([
        userServices.findById({ id: postOwnerId }),
        userServices.findById({ id: userId }),
      ]);

      if (postOwner) {
        const actorName = (actor && (actor.fullName || actor.userName)) || 'Someone';
        const summary = `${actorName} liked your post`;
        const firstMedia = post.media && post.media[0];
        const imageLink = firstMedia && firstMedia.url ? firstMedia.url : null;
        const thumbnailUrl = (firstMedia && (firstMedia.thumbnailUrl || firstMedia.url)) || null;

        // In-app notification (best-effort)
        await notificationService.create({
          body: {
            userId: postOwnerId,
            senderId: userId,
            category: 'updates',
            type: 'update',
            summary,
            meta: {
              kind: 'post_like',
              postId,
              likedBy: userId,
              imageLink,
              thumbnailUrl,
            },
          },
        });

        // Push notification (best-effort)
        if (postOwner.fcmToken) {
          await pushNotificationService.sendPrivateMessageNotification({
            fcmToken: postOwner.fcmToken,
            title: 'New like',
            body: summary,
            type: 'like',
            data: { postId: String(postId), userId: String(userId) },
          });
        }
      }
    }
  } catch (e) {
    // non-blocking
  }

  return responseHandler({ message: 'Post liked successfully' }, res);
});

exports.getAllLikes = asyncHandler(async (req, res) => {
  let { postId } = req.params;
  postId = new mongoose.Types.ObjectId(postId);
  const { pageNum, pageSize } = req.value;
  const page = Number(pageNum);
  const limit = Number(pageSize);
  const skip = (page - 1) * limit;

  // Aggregation pipeline to get likes and count
  const aggregationPipeline = [
    {
      $match: { postId }, // Match likes for the specific post
    },
    {
      $facet: {
        likes: [
          { $sort: { createdAt: -1 } }, // Sort likes by createdAt descending
          { $skip: skip }, // Apply pagination skip
          { $limit: limit }, // Apply pagination limit
          {
            $lookup: {
              from: 'users',
              localField: 'userId',
              foreignField: '_id',
              as: 'user',
            },
          },
          {
            $unwind: {
              path: '$user',
              preserveNullAndEmptyArrays: false,
            },
          },
          {
            $project: {
              _id: 1,
              postId: 1,
              createdAt: 1,
              updatedAt: 1,
              'user._id': 1,
              'user.userName': 1,
              'user.fullName': 1,
              'user.profilePicture': 1,
            },
          },
        ],
        totalCount: [
          { $count: 'count' }, // Count the total likes
        ],
      },
    },
  ];

  // Execute the aggregation
  const result = await likeServices.aggregate({ query: aggregationPipeline });

  // Extract likes and count from the result
  const likes = result[0].likes || []; // Likes for the current page
  const totalLikes = result[0] && result[0].totalCount[0] ? result[0].totalCount[0].count : 0;

  // Calculate total pages
  const totalPages = Math.ceil(totalLikes / limit);

  // Respond with likes and pagination info
  return responseHandler({
    metadata: {
      totalLikes,
      totalPages,
      pageNum,
      pageSize,
    },
    likes,
  }, res);
});
