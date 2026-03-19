const mongoose = require('mongoose');
const userServices = require('../services/userServices');
const postServices = require('../services/postServices');
const likeServices = require('../services/likeServices');
const userMediaServices = require('../services/userMediaServices');
const followServices = require('../services/followServices');
// const highlightCollectionServices = require('../services/highlightCollectionServices');
// const storiesServices = require('../services/storiesServices');
const HighlightCollection = require('../models/highlightCollection.model');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { responseHandler, errorHandler } = require('../../lib/helpers/responseHandler');

const { ObjectId } = mongoose.Types;

// Get user information
exports.getUserInfo = asyncHandler(async (req, res) => {
  const id = req.user.userId;
  const userId = req.params.userId || id;

  // Run all initial checks in parallel for better performance
  const [user, isAlreadyBlocked, isBeenBlocked] = await Promise.all([
    userServices.findById({ id: userId }),
    userServices.findOne({
      filter: {
        _id: id,
        'blockedUsers.userId': userId,
      },
    }),
    userServices.findOne({
      filter: {
        _id: userId,
        'blockedUsers.userId': id,
      },
    }),
  ]);

  if (!user) {
    return errorHandler('ERR-109', res);
  }

  if (isAlreadyBlocked) {
    const userInfo = {
      fullName: user.fullName,
      username: user.userName,
      fullLocation: user.fullLocation,
      profilePicture: user.profilePicture,
      bannerPicture: user.bannerPicture,
      description: user.description,
      followers: user.followers,
      following: user.following,
      isBlocked: true,
    };
    return responseHandler({ userInfo }, res);
  }

  if (isBeenBlocked) {
    const userInfo = {
      fullName: 'TalkHub User',
      username: null,
      fullLocation: null,
      profilePicture: null,
      bannerPicture: null,
      description: null,
      followers: 0,
      following: 0,
      isBeenBlocked: true,
    };
    return responseHandler({ userInfo }, res);
  }

  // Use aggregation to get collections with stories in one query - more efficient

  const highlightCollectionsAggregation = [
    {
      $match: {
        userId: new ObjectId(userId),
      },
    },
    {
      $sort: { createdAt: -1 },
    },
    {
      $lookup: {
        from: 'stories',
        localField: '_id',
        foreignField: 'highlightCollectionId',
        as: 'stories',
        pipeline: [
          {
            $sort: { createdAt: -1 },
          },
          {
            $project: {
              _id: 1,
              storyUrl: 1,
              thumbnailUrl: 1,
              type: 1,
              createdAt: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        storyCount: { $size: '$stories' },
        coverThumbnail: {
          $cond: {
            if: { $gt: [{ $size: '$stories' }, 0] },
            then: { $arrayElemAt: ['$stories.thumbnailUrl', 0] },
            else: '$coverUrl',
          },
        },
      },
    },
    {
      $project: {
        _id: 1,
        name: 1,
        coverUrl: 1,
        coverStoryId: 1,
        createdAt: 1,
        updatedAt: 1,
        storyCount: 1,
        coverThumbnail: 1,
        stories: 1,
      },
    },
  ];

  // Check follow status, highlight collections, and story mute/notify preferences in parallel
  const [followStatus, followerStatus, collectionsWithStories, viewerPrefs] = await Promise.all([
    followServices.findOne({
      filter: { followerId: id, followingId: userId },
    }),
    followServices.findOne({
      filter: { followerId: userId, followingId: id },
    }),
    HighlightCollection.aggregate(highlightCollectionsAggregation),
    userServices.findOne({
      filter: { _id: id },
      projection: { storyMutedUsers: 1, storyNotifyUsers: 1 },
    }),
  ]);

  const profileIdStr = String(userId);
  const isStoryMuted = (viewerPrefs?.storyMutedUsers || []).some(
    (m) => String(m?.userId) === profileIdStr,
  );
  const isStoryNotifyEnabled = (viewerPrefs?.storyNotifyUsers || []).some(
    (n) => String(n?.userId) === profileIdStr,
  );

  const userInfo = {
    fullName: user.fullName,
    username: user.userName,
    fullLocation: user.fullLocation,
    profilePicture: user.profilePicture,
    bannerPicture: user.bannerPicture,
    description: user.description,
    followers: user.followers,
    following: user.following,
    url: user.url,
    languages: user.languages,
    occupation: user.occupation,
    education: user.education,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    email: user.email,
    phoneNumber: user.phoneNumber,
    countryCode: user.countryCode,
    dateOfBirth: user.dateOfBirth,
    location: user.location,
    blockedUsers: user.blockedUsers,
    isBlocked: false,
    isFollowing: !!followStatus,
    followsYou: !!followerStatus,
    isStoryMuted,
    isStoryNotifyEnabled,
    highlightCollections: collectionsWithStories,
  };

  return responseHandler({ userInfo }, res);
});

exports.updateUserInfo = asyncHandler(async (req, res) => {
  const { userId } = req.user;

  const {
    url,
    languages,
    occupation,
    education,
  } = req.value;

  const body = {};

  if (url) body.url = url;
  if (languages) {
    // Append unique languages to existing array if present, otherwise create a new array
    const user = await userServices.findById({ id: userId });
    const existingLanguages = user.languages || [];
    const updatedLanguages = [...new Set([...existingLanguages, ...languages])];
    body.languages = updatedLanguages;
  }
  if (occupation) body.occupation = occupation;
  if (education) body.education = education;

  await userServices.findByIdAndUpdate({
    id: userId,
    body,
  });

  return responseHandler({ message: 'Profile updated successfully.' }, res);
});

exports.getUserMedia = asyncHandler(async (req, res) => {
  const { userId: profileId } = req.value;

  const result = await userMediaServices.find({
    filter: { userId: profileId },
    sort: { createdAt: -1 },
  });

  return responseHandler({ result }, res);
});

exports.addUserMedia = asyncHandler(async (req, res) => {
  const { userId } = req.user;

  const { mediaUrl } = req.value;

  const body = {
    userId,
    mediaUrl,
  };

  const media = await userMediaServices.create({
    body,
  });

  return responseHandler({ message: 'Media added successfully.', media }, res);
});

// Get user feed based on type
exports.getUserFeed = asyncHandler(async (req, res) => {
  let { userId } = req.user;
  userId = new mongoose.Types.ObjectId(userId);

  let { userId: profileId } = req.params;
  profileId = new mongoose.Types.ObjectId(profileId);

  const { type, pageNum, pageSize } = req.value;

  let aggregationPipeline = [];

  const page = Number(pageNum);
  const limit = Number(pageSize);
  const skip = (page - 1) * limit;

  let result = {};

  if (type === 'replies' || type === 'chits') {
    aggregationPipeline = [
      {
        $match: {
          userId: profileId,
          parentPostId: type === 'replies' ? { $ne: null } : null,
        },
      },
      {
        $facet: {
          feed: [
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit },
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
              $lookup: {
                from: 'likes',
                let: { postId: '$_id' },
                pipeline: [
                  { $match: { $expr: { $and: [{ $eq: ['$postId', '$$postId'] }, { $eq: ['$userId', userId] }] } } },
                  { $project: { _id: 1 } },
                ],
                as: 'likedByCurrentUser',
              },
            },
            // Lookup reposts for this post
            {
              $lookup: {
                from: 'reposts',
                localField: '_id',
                foreignField: 'postId',
                as: 'reposts',
              },
            },
            {
              $addFields: {
                isLiked: { $gt: [{ $size: '$likedByCurrentUser' }, 0] }, // true if liked
                type: 'post',
                viewCount: { $ifNull: ['$viewCount', 0] },
                repostCount: { $size: '$reposts' },
                isReposted: { $in: [userId, '$reposts.repostedBy'] },
              },
            },
            {
              $project: {
                hashtags: 1,
                content: 1,
                viewCount: 1,
                likeCount: 1,
                repliesCount: 1,
                repostCount: 1,
                isReposted: 1,
                parentPostId: 1,
                createdAt: 1,
                updatedAt: 1,
                'user._id': 1,
                'user.userName': 1,
                'user.profilePicture': 1,
                'user.fullName': 1,
                isLiked: 1,
                type: 1,
              },
            },
          ],
          totalCount: [
            { $count: 'count' },
          ],
        },
      },
    ];

    result = await postServices.aggregate({ query: aggregationPipeline });
  } else if (type === 'likes') {
    aggregationPipeline = [
      {
        $match: { userId: profileId },
      },
      {
        $facet: {
          feed: [
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit },
            {
              $lookup: {
                from: 'posts',
                localField: 'postId',
                foreignField: '_id',
                as: 'post',
                pipeline: [
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
                    $lookup: {
                      from: 'likes',
                      let: { postId: '$_id' },
                      pipeline: [
                        {
                          $match: {
                            $expr: { $and: [{ $eq: ['$postId', '$$postId'] }, { $eq: ['$userId', userId] }] },
                          },
                        },
                        { $project: { _id: 1 } },
                      ],
                      as: 'likedByCurrentUser',
                    },
                  },
                  // Lookup reposts for this post
                  {
                    $lookup: {
                      from: 'reposts',
                      localField: '_id',
                      foreignField: 'postId',
                      as: 'reposts',
                    },
                  },
                  {
                    $addFields: {
                      isLiked: { $gt: [{ $size: '$likedByCurrentUser' }, 0] },
                      type: 'post',
                      repostCount: { $size: '$reposts' },
                      isReposted: { $in: [userId, '$reposts.repostedBy'] },
                    },
                  },
                  {
                    $project: {
                      _id: 1,
                      hashtags: 1,
                      content: 1,
                      likeCount: 1,
                      repliesCount: 1,
                      repostCount: 1,
                      isReposted: 1,
                      parentPostId: 1,
                      createdAt: 1,
                      updatedAt: 1,
                      isLiked: 1,
                      type: 1,
                      'user._id': 1,
                      'user.userName': 1,
                      'user.profilePicture': 1,
                      'user.fullName': 1,
                    },
                  },
                ],
              },
            },
            { $unwind: '$post' },
            {
              $project: {
                _id: '$post._id',
                hashtags: '$post.hashtags',
                content: '$post.content',
                viewCount: { $ifNull: ['$post.viewCount', 0] },
                likeCount: '$post.likeCount',
                repliesCount: '$post.repliesCount',
                repostCount: '$post.repostCount',
                isReposted: '$post.isReposted',
                parentPostId: '$post.parentPostId',
                createdAt: '$post.createdAt',
                updatedAt: '$post.updatedAt',
                isLiked: '$post.isLiked',
                type: '$post.type',
                user: {
                  _id: '$post.user._id',
                  userName: '$post.user.userName',
                  profilePicture: '$post.user.profilePicture',
                  fullName: '$post.user.fullName',
                },
              },
            },
          ],
          totalCount: [{ $count: 'count' }],
        },
      },
    ];

    result = await likeServices.aggregate({ query: aggregationPipeline });
  } else {
    return errorHandler('ERR-121', res);
  }

  // Extract the feed and total count from the result
  const feed = result[0].feed || []; // Feed for the current page
  const totalDocuments = (result[0].totalCount.length > 0 ? result[0].totalCount[0].count : 0);

  // Calculate total pages
  const totalPages = Math.ceil(totalDocuments / limit);

  // Respond with the feed and pagination info
  return responseHandler({
    metadata: {
      totalDocuments,
      totalPages,
      pageNum,
      pageSize,
    },
    feed,
  }, res);
});

exports.updateUserProfile = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const {
    userName,
    fullName,
    dateOfBirth,
    fullLocation,
    description,
    profilePicture,
    bannerPicture,
    coordinates,
    phoneNumber,
    countryCode,
    url,
  } = req.value;

  const updateFields = {};
  if (userName) updateFields.userName = userName;
  if (fullName) updateFields.fullName = fullName;
  if (dateOfBirth) updateFields.dateOfBirth = dateOfBirth;
  if (fullLocation) updateFields.fullLocation = fullLocation;
  if (description !== undefined) updateFields.description = description;
  if (profilePicture !== undefined) updateFields.profilePicture = profilePicture;
  if (bannerPicture !== undefined) updateFields.bannerPicture = bannerPicture;
  if (coordinates) {
    updateFields.location = { type: 'Point', coordinates };
  }
  if (phoneNumber) updateFields.phoneNumber = phoneNumber;
  if (countryCode) updateFields.countryCode = countryCode;
  if (url) updateFields.url = url;
  if (Object.keys(updateFields).length === 0) {
    return errorHandler('ERR-122', res);
  }

  if (userName) {
    const existingByUserName = await userServices.findOne({
      filter: { userName },
      projection: { _id: 1 },
    });
    if (existingByUserName && existingByUserName._id.toString() !== userId.toString()) {
      return errorHandler('ERR-123', res);
    }
  }

  if (phoneNumber) {
    const existingByPhone = await userServices.findOne({
      filter: { phoneNumber },
      projection: { _id: 1 },
    });
    if (existingByPhone && existingByPhone._id.toString() !== userId.toString()) {
      return errorHandler('ERR-148', res);
    }
  }

  await userServices.findOneAndUpdate({
    filter: { _id: userId },
    body: updateFields,
  });

  // Re-fetch user to ensure all expected fields (e.g. phoneNumber) are present in response
  const updatedUser = await userServices.findById({ id: userId });

  return responseHandler(
    {
      message: 'User Updated successfully',
      response: updatedUser,
    },
    res,
  );
});
