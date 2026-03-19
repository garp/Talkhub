const mongoose = require('mongoose');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { responseHandler, errorHandler } = require('../../lib/helpers/responseHandler');
const followServices = require('../services/followServices');
const userServices = require('../services/userServices');
const notificationService = require('../services/notificationService');
const pushNotificationService = require('../services/pushNotificationService');

// Follow a user
exports.followUser = asyncHandler(async (req, res) => {
  const { userId: followingId } = req.value;
  const followerId = req.user.userId;

  // Prevent self-following
  if (followerId === followingId) {
    return errorHandler('ERR-131', res);
  }

  // Check if target user exists
  const targetUser = await userServices.findById({ id: followingId });
  if (!targetUser) {
    return errorHandler('ERR-109', res);
  }

  // Check if already following
  const existingFollow = await followServices.findOne({
    filter: { followerId, followingId },
  });

  if (existingFollow) {
    return errorHandler('ERR-132', res);
  }

  // Check if either user has blocked the other
  const isBlocked = await userServices.findOne({
    filter: {
      $or: [
        { _id: followerId, 'blockedUsers.userId': followingId },
        { _id: followingId, 'blockedUsers.userId': followerId },
      ],
    },
  });

  if (isBlocked) {
    return errorHandler('ERR-133', res);
  }

  // Create follow relationship
  await followServices.create({
    body: { followerId, followingId, status: 'accepted' },
  });

  // Update counters
  await Promise.all([
    userServices.findByIdAndUpdate({
      id: followerId,
      body: { $inc: { following: 1 } },
    }),
    userServices.findByIdAndUpdate({
      id: followingId,
      body: { $inc: { followers: 1 } },
    }),
  ]);

  // In-app + push notification
  const followerUser = await userServices.findById({ id: followerId });
  const summary = `${followerUser.fullName || followerUser.userName || 'Someone'} started following you`;
  await notificationService.create({
    body: {
      userId: followingId,
      senderId: followerId,
      category: 'follows',
      type: 'follow',
      summary,
      meta: { followerId, followingId },
    },
  });
  if (targetUser.fcmToken) {
    await pushNotificationService.sendPrivateMessageNotification({
      fcmToken: targetUser.fcmToken,
      title: 'New follower',
      body: summary,
      type: 'follow',
      data: { userId: String(followerId) },
    });
  }

  return responseHandler({ message: 'Successfully followed user' }, res);
});

// Unfollow a user
exports.unfollowUser = asyncHandler(async (req, res) => {
  const { userId: followingId } = req.value;
  const followerId = req.user.userId;

  // Check if follow relationship exists
  const follow = await followServices.findOne({
    filter: { followerId, followingId },
  });

  if (!follow) {
    return errorHandler('ERR-134', res);
  }

  // Delete follow relationship
  await followServices.deleteOne({
    filter: { followerId, followingId },
  });

  // Update counters
  await Promise.all([
    userServices.findByIdAndUpdate({
      id: followerId,
      body: { $inc: { following: -1 } },
    }),
    userServices.findByIdAndUpdate({
      id: followingId,
      body: { $inc: { followers: -1 } },
    }),
  ]);

  // Skip notification if either user has blocked the other
  const isBlocked = await userServices.findOne({
    filter: {
      $or: [
        { _id: followerId, 'blockedUsers.userId': followingId },
        { _id: followingId, 'blockedUsers.userId': followerId },
      ],
    },
    projection: { _id: 1 },
  });

  if (!isBlocked) {
    const [targetUser, followerUser] = await Promise.all([
      userServices.findById({ id: followingId }),
      userServices.findById({ id: followerId }),
    ]);
    const summary = `${followerUser.fullName || followerUser.userName || 'Someone'} unfollowed you`;
    await notificationService.create({
      body: {
        userId: followingId,
        senderId: followerId,
        category: 'follows',
        type: 'unfollow',
        summary,
        meta: { followerId, followingId },
      },
    });
    if (targetUser && targetUser.fcmToken) {
      await pushNotificationService.sendPrivateMessageNotification({
        fcmToken: targetUser.fcmToken,
        title: 'Unfollowed',
        body: summary,
        type: 'unfollow',
        data: { userId: String(followerId) },
      });
    }
  }

  return responseHandler({ message: 'Successfully unfollowed user' }, res);
});

// Get followers list
exports.getFollowers = asyncHandler(async (req, res) => {
  const { userId, pageNum = 1, pageSize = 20 } = req.value;
  const currentUserId = req.user.userId;

  const page = Number(pageNum);
  const limit = Number(pageSize);
  const skip = (page - 1) * limit;

  const aggregationPipeline = [
    {
      $match: { followingId: new mongoose.Types.ObjectId(userId) },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'followerId',
        foreignField: '_id',
        as: 'follower',
      },
    },
    {
      $unwind: '$follower',
    },
    // Check if current user follows this follower
    {
      $lookup: {
        from: 'follows',
        let: { followerId: '$follower._id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$followingId', '$$followerId'] },
                  { $eq: ['$followerId', new mongoose.Types.ObjectId(currentUserId)] },
                ],
              },
            },
          },
        ],
        as: 'currentUserFollows',
      },
    },
    {
      $facet: {
        followers: [
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: '$follower._id',
              fullName: '$follower.fullName',
              userName: '$follower.userName',
              profilePicture: '$follower.profilePicture',
              description: '$follower.description',
              followers: '$follower.followers',
              following: '$follower.following',
              isFollowing: { $gt: [{ $size: '$currentUserFollows' }, 0] },
              followedAt: '$createdAt',
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ];

  const result = await followServices.aggregate({ query: aggregationPipeline });
  const followers = result[0].followers || [];
  const totalCount = result[0].totalCount.length > 0 ? result[0].totalCount[0].count : 0;

  return responseHandler({
    metadata: {
      totalDocuments: totalCount,
      totalPages: Math.ceil(totalCount / limit),
      pageNum,
      pageSize,
    },
    data: followers,
  }, res);
});

// Get following list
exports.getFollowing = asyncHandler(async (req, res) => {
  const { userId, pageNum = 1, pageSize = 20 } = req.value;
  const currentUserId = req.user.userId;

  const page = Number(pageNum);
  const limit = Number(pageSize);
  const skip = (page - 1) * limit;

  const aggregationPipeline = [
    {
      $match: { followerId: new mongoose.Types.ObjectId(userId) },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'followingId',
        foreignField: '_id',
        as: 'following',
      },
    },
    {
      $unwind: '$following',
    },
    // Check if current user follows this person
    {
      $lookup: {
        from: 'follows',
        let: { followingId: '$following._id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$followingId', '$$followingId'] },
                  { $eq: ['$followerId', new mongoose.Types.ObjectId(currentUserId)] },
                ],
              },
            },
          },
        ],
        as: 'currentUserFollows',
      },
    },
    {
      $facet: {
        following: [
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: '$following._id',
              fullName: '$following.fullName',
              userName: '$following.userName',
              profilePicture: '$following.profilePicture',
              description: '$following.description',
              followers: '$following.followers',
              following: '$following.following',
              isFollowing: { $gt: [{ $size: '$currentUserFollows' }, 0] },
              followedAt: '$createdAt',
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ];

  const result = await followServices.aggregate({ query: aggregationPipeline });
  const following = result[0].following || [];
  const totalCount = result[0].totalCount.length > 0 ? result[0].totalCount[0].count : 0;

  return responseHandler({
    metadata: {
      totalDocuments: totalCount,
      totalPages: Math.ceil(totalCount / limit),
      pageNum,
      pageSize,
    },
    data: following,
  }, res);
});

// Check if current user follows another user
exports.checkFollowStatus = asyncHandler(async (req, res) => {
  const { userId: targetUserId } = req.value;
  const currentUserId = req.user.userId;

  const [isFollowing, isFollower] = await Promise.all([
    followServices.findOne({
      filter: { followerId: currentUserId, followingId: targetUserId },
    }),
    followServices.findOne({
      filter: { followerId: targetUserId, followingId: currentUserId },
    }),
  ]);

  return responseHandler({
    isFollowing: !!isFollowing,
    followsYou: !!isFollower,
  }, res);
});
