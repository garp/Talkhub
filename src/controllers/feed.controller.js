const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');
const hashtagServices = require('../services/hashtagServices');
const userServices = require('../services/userServices');
const postServices = require('../services/postServices');
const hiddenHashtagServices = require('../services/hiddenHashtagServices');
const hiddenPostServices = require('../services/hiddenPostServices');
// Note: hashtag policy acceptance + welcome page are joined via aggregation lookups in getNewFeed.
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const {
  // errorHandler,
  responseHandler,
} = require('../../lib/helpers/responseHandler');

exports.getFeed = asyncHandler(async (req, res) => {
  try {
    const { searchText, pageNum, pageSize } = req.value; // Access validated pagination parameters
    let { userId } = req.user;
    userId = new mongoose.Types.ObjectId(userId);
    const page = Number(pageNum);
    const limit = Number(pageSize);
    const skip = (page - 1) * limit;
    const filter = { access: 'public' };
    const blockedUserIds = await userServices.find({
      filter: { _id: userId },
      projection: { blockedUsers: 1 },
    });
    if (blockedUserIds && blockedUserIds[0] && blockedUserIds[0].blockedUsers) {
      const blockedUserIdArray = blockedUserIds[0].blockedUsers.map((user) => user.userId);
      if (blockedUserIdArray.length > 0) {
        filter.creatorId = { $nin: blockedUserIdArray };
      }
    }

    if (searchText && searchText.trim()) {
      filter.name = { $regex: new RegExp(searchText, 'i') }; // Case-insensitive name search
    }

    // Aggregation pipeline for fetching the feed
    const aggregationPipeline = [
      {
        $match: filter,
      },
      {
        $facet: {
          feed: [
            {
              $match: {
                access: 'public',
              },
            },
            {
              $lookup: {
                from: 'chatrooms',
                localField: '_id',
                foreignField: 'hashtagId',
                as: 'chatroom',
                pipeline: [
                  { $project: { _id: 1, hashtagId: 1 } }, // Retrieve only necessary fields
                ],
              },
            },
            {
              $unwind: {
                path: '$chatroom',
                preserveNullAndEmptyArrays: false,
              },
            },
            // Get latest 2 messages
            {
              $lookup: {
                from: 'messages',
                localField: 'chatroom._id',
                foreignField: 'chatroomId',
                as: 'latestMessages',
                pipeline: [
                  {
                    $sort: {
                      createdAt: -1,
                    },
                  },
                  {
                    $limit: 2,
                  },
                  {
                    $lookup: {
                      from: 'users',
                      localField: 'senderId',
                      foreignField: '_id',
                      as: 'user',
                      pipeline: [
                        {
                          $project: {
                            profilePicture: 1,
                            fullLocation: 1,
                          },
                        },
                      ],
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
                      content: 1,
                      createdAt: 1,
                      user: 1,
                      messageType: 1,
                      location: 1,
                    },
                  },
                ],
              },
            },
            {
              $sort: {
                'latestMessages.0.createdAt': -1, // Sort by the last message's createdAt in descending order
              },
            },
            {
              $skip: skip,
            },
            {
              $limit: limit,
            },
            {
              $lookup: {
                from: 'messages',
                let: { chatroomId: '$chatroom._id' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $eq: ['$chatroomId', '$$chatroomId'],
                      },
                    },
                  },
                  {
                    $group: {
                      _id: '$chatroomId',
                      totalMessages: { $sum: 1 },
                    },
                  },
                ],
                as: 'messageCountData',
              },
            },
            {
              $unwind: {
                path: '$messageCountData',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $lookup: {
                from: 'hashtag-likes',
                let: { hashtagId: '$_id' },
                pipeline: [
                  { $match: { $expr: { $and: [{ $eq: ['$hashtagId', '$$hashtagId'] }, { $eq: ['$userId', userId] }] } } },
                  { $project: { _id: 1 } },
                ],
                as: 'isLikedByCurrentUser',
              },
            },
            {
              $addFields: {
                isLiked: { $gt: [{ $size: '$isLikedByCurrentUser' }, 0] }, // true if liked
                createdAt: {
                  $ifNull: [{ $arrayElemAt: ['$latestMessages.createdAt', 0] }, '$createdAt'],
                },
                type: 'hashtag', // Indicate the type of the post
                viewCount: { $ifNull: ['$viewCount', 0] },
              },
            },
            {
              $project: {
                scope: 1,
                name: 1,
                likeCount: 1,
                viewCount: 1,
                isLiked: 1,
                createdAt: 1,
                type: 1,
                hashtagId: '$chatroom.hashtagId',
                latestMessages: 1,
                totalMessages: { $ifNull: ['$messageCountData.totalMessages', 0] },
                fullLocation: 1,
              },
            },
          ],
          totalCount: [
            {
              $match: {
                access: 'public',
              },
            },
            { $count: 'count' },
          ],
        },
      },
    ];

    // Execute the aggregation
    const result = await hashtagServices.aggregate({ query: aggregationPipeline });

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
  } catch (err) {
    return responseHandler({
      error: err.message,
    });
  }
});

exports.getNewFeed = asyncHandler(async (req, res) => {
  try {
    let { userId } = req.user;
    userId = new mongoose.Types.ObjectId(userId);
    const {
      searchText, pageNum, pageSize, sortType, sortOrder,
    } = req.value; // Access validated pagination parameters
    const page = Number(pageNum);
    const limit = Number(pageSize);
    const skip = (page - 1) * limit; // Calculate skip for pagination

    // Build dynamic sort object based on query parameters
    const sortField = sortType || 'createdAt';
    const sortDirection = sortOrder || -1;
    const dynamicSort = { [sortField]: sortDirection };

    // Separate filters for hashtags, posts, and reposts
    const hashtagFilter = { access: 'public' };
    const postFilter = { parentPostId: null };
    const repostFilter = {};

    // Fetch current user's blocked and muted users
    const currentUserData = await userServices.find({
      filter: { _id: userId },
      projection: { blockedUsers: 1, mutedUsers: 1 },
    });
    const blockedUserIdArray = (currentUserData && currentUserData[0] && currentUserData[0].blockedUsers)
      ? currentUserData[0].blockedUsers.map((user) => user.userId)
      : [];
    const mutedUserIdArray = (currentUserData && currentUserData[0] && currentUserData[0].mutedUsers)
      ? currentUserData[0].mutedUsers.map((user) => user.userId)
      : [];

    // Also fetch users who have blocked the current user (reverse block)
    const blockedByOthers = await userServices.find({
      filter: { 'blockedUsers.userId': userId },
      projection: { _id: 1 },
    });
    const blockedByOthersIdArray = (blockedByOthers || []).map((u) => u._id);

    // Merge both directions into a single exclusion list
    const allBlockedIdArray = [...blockedUserIdArray, ...blockedByOthersIdArray];
    // Combine blocked and muted users for feed exclusion
    const allExcludedIdArray = [...new Set([
      ...allBlockedIdArray.map((id) => id.toString()),
      ...mutedUserIdArray.map((id) => id.toString()),
    ])].map((id) => new mongoose.Types.ObjectId(id));

    if (allExcludedIdArray.length > 0) {
      hashtagFilter.creatorId = { $nin: allExcludedIdArray };
      postFilter.userId = { $nin: allExcludedIdArray };
      repostFilter.repostedBy = { $nin: allExcludedIdArray };
    }
    if (searchText && searchText.trim()) {
      hashtagFilter.name = { $regex: new RegExp(searchText, 'i') }; // Case-insensitive name search
      postFilter.text = { $regex: new RegExp(searchText, 'i') }; // Search in post text
      repostFilter.text = { $regex: new RegExp(searchText, 'i') }; // Search in repost text
    }

    // Exclude hashtags marked as "not interested" by the user
    const hiddenHashtags = await hiddenHashtagServices.find({
      filter: { userId, reason: 'not_interested' },
      projection: { hashtagId: 1 },
    });
    const hiddenHashtagIds = (hiddenHashtags || []).map((h) => h.hashtagId).filter(Boolean);
    if (hiddenHashtagIds.length) {
      hashtagFilter._id = { $nin: hiddenHashtagIds };
    }

    // Exclude posts marked as "not interested" by the user
    const hiddenPosts = await hiddenPostServices.find({
      filter: { userId, reason: 'not_interested' },
      projection: { postId: 1 },
    });
    const hiddenPostIds = (hiddenPosts || []).map((p) => p.postId).filter(Boolean);
    if (hiddenPostIds.length) {
      postFilter._id = { $nin: hiddenPostIds };
    }

    // Aggregation pipeline for fetching the feed
    const aggregationPipeline = [
      // Match hashtags based on filter and access level
      {
        $match: hashtagFilter,
      },
      // Lookup associated chatrooms for each hashtag
      {
        $lookup: {
          from: 'chatrooms',
          localField: '_id',
          foreignField: 'hashtagId',
          as: 'chatroom',
          pipeline: [
            { $project: { _id: 1, hashtagId: 1 } }, // Retrieve only necessary fields
          ],
        },
      },
      // Unwind the chatroom array to work with individual chatrooms
      {
        $unwind: {
          path: '$chatroom',
          preserveNullAndEmptyArrays: true,
        },
      },
      // Lookup the latest two messages for each chatroom
      {
        $lookup: {
          from: 'messages',
          localField: 'chatroom._id',
          foreignField: 'chatroomId',
          as: 'latestMessages',
          pipeline: [
            {
              $sort: {
                createdAt: -1, // Sort messages by newest first
              },
            },
            {
              $limit: 2, // Limit to the latest two messages
            },
            {
              $lookup: {
                from: 'users',
                localField: 'senderId',
                foreignField: '_id',
                as: 'user',
                pipeline: [
                  {
                    $project: {
                      profilePicture: 1,
                      fullLocation: 1,
                      fullName: 1,
                    },
                  },
                ],
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
                content: 1,
                createdAt: 1,
                user: 1,
                media: 1,
                isAudio: 1,
                messageType: 1,
                location: 1,
              },
            },
          ],
        },
      },
      {
        $addFields: {
          chatroomId: {
            $ifNull: [{ $arrayElemAt: ['$latestMessages.chatroomId', 0] }, '$chatroom._id'],
          },
        },
      },
      {
        $lookup: {
          from: 'messages',
          let: { chatroomId: '$chatroom._id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$chatroomId', '$$chatroomId'],
                },
              },
            },
            {
              $group: {
                _id: '$chatroomId',
                totalMessages: { $sum: 1 },
              },
            },
          ],
          as: 'messageCountData',
        },
      },
      {
        $unwind: {
          path: '$messageCountData',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'hashtag-likes',
          let: { hashtagId: '$_id' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$hashtagId', '$$hashtagId'] }, { $eq: ['$userId', userId] }] } } },
            { $project: { _id: 1 } },
          ],
          as: 'isLikedByCurrentUser',
        },
      },
      {
        $lookup: {
          from: 'saves',
          let: { hashtagId: '$_id' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$hashtagId', '$$hashtagId'] }, { $eq: ['$userId', userId] }] } } },
            { $project: { _id: 1 } },
          ],
          as: 'savedByCurrentUser',
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'creatorId',
          foreignField: '_id',
          as: 'creator',
          pipeline: [
            {
              $project: {
                _id: 1,
                fullName: 1,
                profilePicture: 1,
                userName: 1,
                followers: 1,
                following: 1,
                location: 1,
                fullLocation: 1,
              },
            },
          ],
        },
      },
      {
        $unwind: {
          path: '$creator',
          preserveNullAndEmptyArrays: false,
        },
      },
      // Lookup follow status for hashtag creator
      {
        $lookup: {
          from: 'follows',
          let: { creatorId: '$creatorId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$followerId', userId] },
                    { $eq: ['$followingId', '$$creatorId'] },
                  ],
                },
              },
            },
            { $project: { _id: 1, status: 1 } },
            { $limit: 1 },
          ],
          as: 'creatorFollowData',
        },
      },
      {
        $addFields: {
          isLiked: { $gt: [{ $size: '$isLikedByCurrentUser' }, 0] }, // true if liked
          isSaved: { $gt: [{ $size: '$savedByCurrentUser' }, 0] }, // true if saved
          createdAt: {
            $ifNull: [{ $arrayElemAt: ['$latestMessages.createdAt', 0] }, '$createdAt'],
          },
          type: 'hashtag', // Indicate the type of the post
          viewCount: { $ifNull: ['$viewCount', 0] },
          // Follow and mute status for hashtag creator
          creatorFollowStatus: { $gt: [{ $size: '$creatorFollowData' }, 0] },
          creatorMuteStatus: { $in: ['$creatorId', mutedUserIdArray] },
        },
      },
      // Hashtag policy acceptance (per user)
      {
        $lookup: {
          from: 'hashtagpolicyacceptances',
          let: { hashtagId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$hashtagId', '$$hashtagId'] },
                    { $eq: ['$userId', userId] },
                  ],
                },
              },
            },
            { $project: { _id: 1 } },
            { $limit: 1 },
          ],
          as: 'policyAcceptance',
        },
      },
      // Welcome / policy details for this hashtag (welcome page)
      {
        $lookup: {
          from: 'welcomepages',
          let: { hashtagId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$hashtagId', '$$hashtagId'] },
              },
            },
            {
              $project: {
                _id: 1,
                hashtagId: 1,
                title: 1,
                description: 1,
                language: 1,
                rules: 1,
                ageRange: 1,
                fullLocation: 1,
                location: 1,
                createdAt: 1,
                updatedAt: 1,
              },
            },
            { $limit: 1 },
          ],
          as: 'welcomePage',
        },
      },
      {
        $addFields: {
          isPolicyAccepted: { $gt: [{ $size: '$policyAcceptance' }, 0] },
          welcomePage: { $arrayElemAt: ['$welcomePage', 0] },
        },
      },
      {
        $project: {
          scope: 1,
          name: 1,
          likeCount: 1,
          viewCount: 1,
          isLiked: 1,
          isSaved: 1,
          isPolicyAccepted: 1,
          welcomePage: 1,
          createdAt: 1,
          type: 1,
          chatroomId: 1,
          hashtagId: '$chatroom.hashtagId',
          hashtagPhoto: 1,
          hashtagPicture: 1,
          latestMessages: 1,
          totalMessages: { $ifNull: ['$messageCountData.totalMessages', 0] },
          fullLocation: 1,
          description: 1,
          createdBy: {
            _id: '$creator._id',
            userName: '$creator.userName',
            profilePicture: '$creator.profilePicture',
            fullName: '$creator.fullName',
            followers: '$creator.followers',
            following: '$creator.following',
            location: '$creator.location',
            fullLocation: '$creator.fullLocation',
            followStatus: '$creatorFollowStatus',
            muteStatus: '$creatorMuteStatus',
          },
        },
      },

      {
        $unionWith: {
          coll: 'posts',
          pipeline: [
            {
              $match: postFilter,
            },
            // Lookup user information for each post (userDetails to match getAllPosts)
            {
              $lookup: {
                from: 'users',
                localField: 'userId',
                foreignField: '_id',
                as: 'userDetails',
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      location: 1,
                      email: 1,
                      fullName: 1,
                      userName: 1,
                      profilePicture: 1,
                      description: 1,
                      bannerPicture: 1,
                    },
                  },
                ],
              },
            },
            {
              $unwind: {
                path: '$userDetails',
                preserveNullAndEmptyArrays: false,
              },
            },
            // Lookup interest category details
            {
              $lookup: {
                from: 'interestcategories',
                localField: 'interestCategories',
                foreignField: '_id',
                as: 'interestCategoryDetails',
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      name: 1,
                      slug: 1,
                      icon: 1,
                      backgroundImage: 1,
                    },
                  },
                ],
              },
            },
            // Lookup interest subcategory details
            {
              $lookup: {
                from: 'interestsubcategories',
                localField: 'interestSubCategories',
                foreignField: '_id',
                as: 'interestSubCategoryDetails',
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      name: 1,
                      slug: 1,
                      categoryId: 1,
                      icon: 1,
                      backgroundImage: 1,
                    },
                  },
                ],
              },
            },
            // Lookup all likes for this post
            {
              $lookup: {
                from: 'likes',
                localField: '_id',
                foreignField: 'postId',
                as: 'likes',
              },
            },
            {
              $addFields: {
                isLiked: {
                  $in: [userId, '$likes.userId'],
                },
              },
            },
            // Lookup saves for this post
            {
              $lookup: {
                from: 'saves',
                localField: '_id',
                foreignField: 'postId',
                as: 'saveDetails',
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
            // Lookup follow status for post creator
            {
              $lookup: {
                from: 'follows',
                let: { postUserId: '$userId' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ['$followerId', userId] },
                          { $eq: ['$followingId', '$$postUserId'] },
                        ],
                      },
                    },
                  },
                  { $project: { _id: 1, status: 1 } },
                  { $limit: 1 },
                ],
                as: 'creatorFollowData',
              },
            },
            {
              $addFields: {
                isSaved: {
                  $in: [userId, '$saveDetails.userId'],
                },
                viewCount: { $ifNull: ['$viewCount', 0] },
                repostCount: { $size: '$reposts' },
                isReposted: {
                  $in: [userId, '$reposts.repostedBy'],
                },
                // Follow and mute status for post creator
                creatorFollowStatus: { $gt: [{ $size: '$creatorFollowData' }, 0] },
                creatorMuteStatus: { $in: ['$userId', mutedUserIdArray] },
              },
            },
            // Lookup comments for this post (top 3 parent comments)
            {
              $lookup: {
                from: 'comments',
                localField: '_id',
                foreignField: 'postId',
                let: { postId: '$_id', currentUserId: userId },
                as: 'comments',
                pipeline: [
                  {
                    $match: {
                      parentCommentId: null,
                    },
                  },
                  {
                    $lookup: {
                      from: 'users',
                      localField: 'commentBy',
                      foreignField: '_id',
                      pipeline: [
                        {
                          $project: {
                            _id: 1,
                            fullName: 1,
                            userName: 1,
                            profilePicture: 1,
                          },
                        },
                      ],
                      as: 'commentBy',
                    },
                  },
                  {
                    $unwind: {
                      path: '$commentBy',
                    },
                  },
                  {
                    $lookup: {
                      from: 'comment-likes',
                      localField: '_id',
                      foreignField: 'commentId',
                      as: 'commentLikes',
                    },
                  },
                  {
                    $lookup: {
                      from: 'comments',
                      localField: '_id',
                      foreignField: 'parentCommentId',
                      as: 'replies',
                    },
                  },
                  {
                    $addFields: {
                      likeCount: { $size: '$commentLikes' },
                      replyCount: { $size: '$replies' },
                      isLiked: {
                        $cond: {
                          if: { $eq: ['$$currentUserId', null] },
                          then: false,
                          else: {
                            $in: ['$$currentUserId', '$commentLikes.userId'],
                          },
                        },
                      },
                    },
                  },
                  {
                    $project: {
                      _id: 1,
                      commentBy: 1,
                      content: 1,
                      postId: 1,
                      likeCount: 1,
                      replyCount: 1,
                      isLiked: 1,
                      createdAt: 1,
                      updatedAt: 1,
                    },
                  },
                  {
                    $sort: { createdAt: -1 },
                  },
                  {
                    $limit: 3,
                  },
                ],
              },
            },
            // Add necessary fields and type
            {
              $addFields: {
                type: 'post', // Indicate the type of the post
              },
            },
            // Project all fields to match getAllPosts structure
            {
              $project: {
                _id: 1,
                userId: 1,
                location: 1,
                text: 1,
                media: 1,
                mediaModeration: 1,
                labels: 1,
                interestCategories: 1,
                interestSubCategories: 1,
                replySettings: 1,
                extraReplySetting: 1,
                viewCount: 1,
                parentPostId: 1,
                mentions: 1,
                createdAt: 1,
                updatedAt: 1,
                __v: 1,
                userDetails: {
                  _id: '$userDetails._id',
                  location: '$userDetails.location',
                  email: '$userDetails.email',
                  fullName: '$userDetails.fullName',
                  userName: '$userDetails.userName',
                  profilePicture: '$userDetails.profilePicture',
                  description: '$userDetails.description',
                  bannerPicture: '$userDetails.bannerPicture',
                  followStatus: '$creatorFollowStatus',
                  muteStatus: '$creatorMuteStatus',
                },
                interestCategoryDetails: 1,
                interestSubCategoryDetails: 1,
                likes: 1,
                isLiked: 1,
                saveDetails: 1,
                isSaved: 1,
                comments: 1,
                type: 1,
                repostCount: 1,
                isReposted: 1,
              },
            },
          ],
        },
      },

      // Union with reposts collection
      {
        $unionWith: {
          coll: 'reposts',
          pipeline: [
            {
              $match: repostFilter,
            },
            // Lookup repostedBy user details
            {
              $lookup: {
                from: 'users',
                localField: 'repostedBy',
                foreignField: '_id',
                as: 'repostedByDetails',
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      fullName: 1,
                      userName: 1,
                      profilePicture: 1,
                      location: 1,
                      email: 1,
                      description: 1,
                      bannerPicture: 1,
                    },
                  },
                ],
              },
            },
            {
              $unwind: {
                path: '$repostedByDetails',
                preserveNullAndEmptyArrays: false,
              },
            },
            // Lookup follow status for repostedBy user
            {
              $lookup: {
                from: 'follows',
                let: { reposterId: '$repostedBy' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ['$followerId', userId] },
                          { $eq: ['$followingId', '$$reposterId'] },
                        ],
                      },
                    },
                  },
                  { $project: { _id: 1, status: 1 } },
                  { $limit: 1 },
                ],
                as: 'repostedByFollowData',
              },
            },
            {
              $addFields: {
                repostedByFollowStatus: { $gt: [{ $size: '$repostedByFollowData' }, 0] },
                repostedByMuteStatus: { $in: ['$repostedBy', mutedUserIdArray] },
              },
            },
            // Lookup original post with full details
            {
              $lookup: {
                from: 'posts',
                localField: 'postId',
                foreignField: '_id',
                as: 'originalPost',
                pipeline: [
                  // Exclude replies (only top-level posts)
                  {
                    $match: { parentPostId: null },
                  },
                  // Lookup post author
                  {
                    $lookup: {
                      from: 'users',
                      localField: 'userId',
                      foreignField: '_id',
                      as: 'userDetails',
                      pipeline: [
                        {
                          $project: {
                            _id: 1,
                            location: 1,
                            email: 1,
                            fullName: 1,
                            userName: 1,
                            profilePicture: 1,
                            description: 1,
                            bannerPicture: 1,
                          },
                        },
                      ],
                    },
                  },
                  {
                    $unwind: {
                      path: '$userDetails',
                      preserveNullAndEmptyArrays: false,
                    },
                  },
                  // Lookup interest category details
                  {
                    $lookup: {
                      from: 'interestcategories',
                      localField: 'interestCategories',
                      foreignField: '_id',
                      as: 'interestCategoryDetails',
                      pipeline: [
                        {
                          $project: {
                            _id: 1,
                            name: 1,
                            slug: 1,
                            icon: 1,
                            backgroundImage: 1,
                          },
                        },
                      ],
                    },
                  },
                  // Lookup interest subcategory details
                  {
                    $lookup: {
                      from: 'interestsubcategories',
                      localField: 'interestSubCategories',
                      foreignField: '_id',
                      as: 'interestSubCategoryDetails',
                      pipeline: [
                        {
                          $project: {
                            _id: 1,
                            name: 1,
                            slug: 1,
                            categoryId: 1,
                            icon: 1,
                            backgroundImage: 1,
                          },
                        },
                      ],
                    },
                  },
                  // Lookup all likes for original post
                  {
                    $lookup: {
                      from: 'likes',
                      localField: '_id',
                      foreignField: 'postId',
                      as: 'likes',
                    },
                  },
                  {
                    $addFields: {
                      isLiked: {
                        $in: [userId, '$likes.userId'],
                      },
                    },
                  },
                  // Lookup saves for original post
                  {
                    $lookup: {
                      from: 'saves',
                      localField: '_id',
                      foreignField: 'postId',
                      as: 'saveDetails',
                    },
                  },
                  // Lookup reposts for original post
                  {
                    $lookup: {
                      from: 'reposts',
                      localField: '_id',
                      foreignField: 'postId',
                      as: 'reposts',
                    },
                  },
                  // Lookup follow status for original post author
                  {
                    $lookup: {
                      from: 'follows',
                      let: { originalPostUserId: '$userId' },
                      pipeline: [
                        {
                          $match: {
                            $expr: {
                              $and: [
                                { $eq: ['$followerId', userId] },
                                { $eq: ['$followingId', '$$originalPostUserId'] },
                              ],
                            },
                          },
                        },
                        { $project: { _id: 1, status: 1 } },
                        { $limit: 1 },
                      ],
                      as: 'originalPostCreatorFollowData',
                    },
                  },
                  {
                    $addFields: {
                      isSaved: {
                        $in: [userId, '$saveDetails.userId'],
                      },
                      viewCount: { $ifNull: ['$viewCount', 0] },
                      repostCount: { $size: '$reposts' },
                      isReposted: {
                        $in: [userId, '$reposts.repostedBy'],
                      },
                      creatorFollowStatus: { $gt: [{ $size: '$originalPostCreatorFollowData' }, 0] },
                      creatorMuteStatus: { $in: ['$userId', mutedUserIdArray] },
                    },
                  },
                  // Lookup comments for original post (top 3 parent comments)
                  {
                    $lookup: {
                      from: 'comments',
                      localField: '_id',
                      foreignField: 'postId',
                      let: { postId: '$_id', currentUserId: userId },
                      as: 'comments',
                      pipeline: [
                        {
                          $match: {
                            parentCommentId: null,
                          },
                        },
                        {
                          $lookup: {
                            from: 'users',
                            localField: 'commentBy',
                            foreignField: '_id',
                            pipeline: [
                              {
                                $project: {
                                  _id: 1,
                                  fullName: 1,
                                  userName: 1,
                                  profilePicture: 1,
                                },
                              },
                            ],
                            as: 'commentBy',
                          },
                        },
                        {
                          $unwind: {
                            path: '$commentBy',
                          },
                        },
                        {
                          $lookup: {
                            from: 'comment-likes',
                            localField: '_id',
                            foreignField: 'commentId',
                            as: 'commentLikes',
                          },
                        },
                        {
                          $lookup: {
                            from: 'comments',
                            localField: '_id',
                            foreignField: 'parentCommentId',
                            as: 'replies',
                          },
                        },
                        {
                          $addFields: {
                            likeCount: { $size: '$commentLikes' },
                            replyCount: { $size: '$replies' },
                            isLiked: {
                              $cond: {
                                if: { $eq: ['$$currentUserId', null] },
                                then: false,
                                else: {
                                  $in: ['$$currentUserId', '$commentLikes.userId'],
                                },
                              },
                            },
                          },
                        },
                        {
                          $project: {
                            _id: 1,
                            commentBy: 1,
                            content: 1,
                            postId: 1,
                            likeCount: 1,
                            replyCount: 1,
                            isLiked: 1,
                            createdAt: 1,
                            updatedAt: 1,
                          },
                        },
                        {
                          $sort: { createdAt: -1 },
                        },
                        {
                          $limit: 3,
                        },
                      ],
                    },
                  },
                  // Project all fields for original post
                  {
                    $project: {
                      _id: 1,
                      userId: 1,
                      location: 1,
                      text: 1,
                      media: 1,
                      mediaModeration: 1,
                      labels: 1,
                      interestCategories: 1,
                      interestSubCategories: 1,
                      replySettings: 1,
                      extraReplySetting: 1,
                      viewCount: 1,
                      parentPostId: 1,
                      mentions: 1,
                      createdAt: 1,
                      updatedAt: 1,
                      userDetails: {
                        _id: '$userDetails._id',
                        location: '$userDetails.location',
                        email: '$userDetails.email',
                        fullName: '$userDetails.fullName',
                        userName: '$userDetails.userName',
                        profilePicture: '$userDetails.profilePicture',
                        description: '$userDetails.description',
                        bannerPicture: '$userDetails.bannerPicture',
                        followStatus: '$creatorFollowStatus',
                        muteStatus: '$creatorMuteStatus',
                      },
                      interestCategoryDetails: 1,
                      interestSubCategoryDetails: 1,
                      likes: 1,
                      isLiked: 1,
                      saveDetails: 1,
                      isSaved: 1,
                      comments: 1,
                      repostCount: 1,
                      isReposted: 1,
                    },
                  },
                ],
              },
            },
            {
              $unwind: {
                path: '$originalPost',
                preserveNullAndEmptyArrays: false,
              },
            },
            // Add type field for reposts
            {
              $addFields: {
                type: 'repost',
              },
            },
            // Project repost fields
            {
              $project: {
                _id: 1,
                text: 1,
                createdAt: 1,
                updatedAt: 1,
                type: 1,
                repostedBy: {
                  _id: '$repostedByDetails._id',
                  fullName: '$repostedByDetails.fullName',
                  userName: '$repostedByDetails.userName',
                  profilePicture: '$repostedByDetails.profilePicture',
                  location: '$repostedByDetails.location',
                  email: '$repostedByDetails.email',
                  description: '$repostedByDetails.description',
                  bannerPicture: '$repostedByDetails.bannerPicture',
                  followStatus: '$repostedByFollowStatus',
                  muteStatus: '$repostedByMuteStatus',
                },
                originalPost: 1,
              },
            },
          ],
        },
      },
      {
        $sort: dynamicSort,
      },
      {
        $facet: {
          feed: [
            { $skip: skip },
            { $limit: limit },
          ],
          totalCount: [
            { $count: 'count' },
          ],
        },
      },
    ];

    // Execute the aggregation
    const result = await hashtagServices.aggregate({ query: aggregationPipeline });

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
  } catch (err) {
    return responseHandler({
      error: err.message,
    });
  }
});

exports.getAroundMeFeed = asyncHandler(async (req, res) => {
  try {
    let { userId } = req.user;
    userId = new mongoose.Types.ObjectId(userId);
    const {
      searchText, pageNum, pageSize, latitude, longitude,
    } = req.value;
    const page = Number(pageNum);
    const limit = Number(pageSize);
    const skip = (page - 1) * limit;

    const filter = { access: 'public' };
    const blockedUserIds = await userServices.find({
      filter: { _id: userId },
      projection: { blockedUsers: 1 },
    });
    if (blockedUserIds && blockedUserIds[0] && blockedUserIds[0].blockedUsers) {
      const blockedUserIdArray = blockedUserIds[0].blockedUsers.map((user) => user.userId);
      if (blockedUserIdArray.length > 0) {
        filter.creatorId = { $nin: blockedUserIdArray };
      }
    }
    if (searchText && searchText.trim()) {
      filter.name = { $regex: new RegExp(searchText, 'i') };
    }
    const aggregationPipeline = [
      {
        $match: filter,
      },
      {
        $lookup: {
          from: 'chatrooms',
          localField: '_id',
          foreignField: 'hashtagId',
          as: 'chatroom',
          pipeline: [
            { $project: { _id: 1, hashtagId: 1 } }, // Retrieve only necessary fields
          ],
        },
      },
      // Unwind the chatroom array to work with individual chatrooms
      {
        $unwind: {
          path: '$chatroom',
          preserveNullAndEmptyArrays: false,
        },
      },
      // Lookup the latest two messages for each chatroom
      {
        $lookup: {
          from: 'messages',
          localField: 'chatroom._id',
          foreignField: 'chatroomId',
          as: 'latestMessages',
          pipeline: [
            {
              $sort: {
                createdAt: -1, // Sort messages by newest first
              },
            },
            {
              $limit: 2, // Limit to the latest two messages
            },
            {
              $lookup: {
                from: 'users',
                localField: 'senderId',
                foreignField: '_id',
                as: 'user',
                pipeline: [
                  {
                    $project: {
                      profilePicture: 1,
                      fullLocation: 1,
                    },
                  },
                ],
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
                content: 1,
                createdAt: 1,
                user: 1,
                media: 1,
                isAudio: 1,
                messageType: 1,
                location: 1,
              },
            },
          ],
        },
      },
      {
        $addFields: {
          chatroomId: {
            $ifNull: [{ $arrayElemAt: ['$latestMessages.chatroomId', 0] }, '$chatroom._id'],
          },
        },
      },
      {
        $lookup: {
          from: 'messages',
          let: { chatroomId: '$chatroom._id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$chatroomId', '$$chatroomId'],
                },
              },
            },
            {
              $group: {
                _id: '$chatroomId',
                totalMessages: { $sum: 1 },
              },
            },
          ],
          as: 'messageCountData',
        },
      },
      {
        $unwind: {
          path: '$messageCountData',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'hashtag-likes',
          let: { hashtagId: '$_id' },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ['$hashtagId', '$$hashtagId'] }, { $eq: ['$userId', userId] }] } } },
            { $project: { _id: 1 } },
          ],
          as: 'isLikedByCurrentUser',
        },
      },
      {
        $addFields: {
          isLiked: { $gt: [{ $size: '$isLikedByCurrentUser' }, 0] }, // true if liked
          createdAt: {
            $ifNull: [{ $arrayElemAt: ['$latestMessages.createdAt', 0] }, '$createdAt'],
          },
          type: 'hashtag', // Indicate the type of the post
          viewCount: { $ifNull: ['$viewCount', 0] },
          distance: {
            $sqrt: {
              $add: [
                { $pow: [{ $subtract: [{ $arrayElemAt: ['$location.coordinates', 0] }, latitude] }, 2] },
                { $pow: [{ $subtract: [{ $arrayElemAt: ['$location.coordinates', 1] }, longitude] }, 2] },
              ],
            },
          },
        },
      },
      {
        $sort: { distance: 1 },
      },
      {
        $project: {
          scope: 1,
          name: 1,
          likeCount: 1,
          viewCount: 1,
          isLiked: 1,
          createdAt: 1,
          type: 1,
          chatroomId: 1,
          hashtagId: '$chatroom.hashtagId',
          latestMessages: 1,
          totalMessages: { $ifNull: ['$messageCountData.totalMessages', 0] },
          distance: 1,
          fullLocation: 1,
        },
      },
      {
        $facet: {
          feed: [
            { $skip: skip },
            { $limit: limit },
          ],
          totalCount: [
            { $count: 'count' },
          ],
        },
      },
    ];

    // Execute the aggregation
    const result = await hashtagServices.aggregate({ query: aggregationPipeline });

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
  } catch (err) {
    return responseHandler({
      error: err.message,
    });
  }
});

exports.getPeopleFeed = asyncHandler(async (req, res) => {
  try {
    const { pageNum, pageSize, searchText } = req.value;
    const currentUserId = req.user.userId;
    const page = Number(pageNum);
    const limit = Number(pageSize);
    const skip = (page - 1) * limit;
    const currentUser = await userServices.findById({
      id: new mongoose.Types.ObjectId(req.user.userId),
    });
    const userLongitude = (currentUser && currentUser.location && currentUser.location.coordinates
      && currentUser.location.coordinates[0]) || 0;
    const userLatitude = (currentUser && currentUser.location && currentUser.location.coordinates
      && currentUser.location.coordinates[1]) || 0;
    const postFilter = {};
    const blockedUserIds = currentUser.blockedUsers;
    if (blockedUserIds.length > 0) {
      const blockedUserIdArray = blockedUserIds.map((user) => user.userId);
      if (blockedUserIdArray.length > 0) {
        postFilter.userId = { $nin: blockedUserIdArray };
      }
    }
    if (searchText && searchText.trim()) {
      postFilter['content.text'] = { $regex: new RegExp(searchText, 'i') };
    }

    const pipeline = [
      {
        $match: postFilter,
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
          pipeline: [
            {
              $project: {
                _id: 1,
                userName: 1,
                fullName: 1,
                profilePicture: 1,
                location: 1,
                fullLocation: 1,
              },
            },
          ],
        },
      },
      {
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $match: {
          'user.location.coordinates': { $exists: true, $ne: null },
        },
      },
      {
        $addFields: {
          distance: {
            $sqrt: {
              $add: [
                {
                  $pow: [
                    { $subtract: [{ $arrayElemAt: ['$user.location.coordinates', 1] }, userLatitude] },
                    2,
                  ],
                },
                {
                  $pow: [
                    { $subtract: [{ $arrayElemAt: ['$user.location.coordinates', 0] }, userLongitude] },
                    2,
                  ],
                },
              ],
            },
          },
        },
      },
      {
        $addFields: {
          hashtagInfo: { $arrayElemAt: ['$hashtags', 0] },
        },
      },
      {
        $lookup: {
          from: 'chatrooms',
          localField: 'hashtagInfo.hashtagId',
          foreignField: 'hashtagId',
          as: 'chatroom',
        },
      },
      {
        $addFields: {
          chatroomId: {
            $arrayElemAt: ['$chatroom._id', 0],
          },
        },
      },
      {
        $lookup: {
          from: 'messages',
          localField: 'chatroomId',
          foreignField: 'chatroomId',
          as: 'latestMessages',
          pipeline: [
            {
              $sort: {
                createdAt: -1, // Sort messages by newest first
              },
            },
            {
              $limit: 2, // Limit to the latest two messages
            },
            {
              $lookup: {
                from: 'users',
                localField: 'senderId',
                foreignField: '_id',
                as: 'user',
                pipeline: [
                  {
                    $project: {
                      profilePicture: 1,
                      fullLocation: 1,
                    },
                  },
                ],
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
                content: 1,
                createdAt: 1,
                user: 1,
                media: 1,
                isAudio: 1,
                messageType: 1,
                location: 1,
              },
            },
          ],
        },
      },
      {
        $lookup: {
          from: 'messages',
          let: { chatroomId: '$chatroomId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$chatroomId', '$$chatroomId'],
                },
              },
            },
            {
              $group: {
                _id: '$chatroomId',
                totalMessages: { $sum: 1 },
              },
            },
          ],
          as: 'messageCountData',
        },
      },
      {
        $unwind: {
          path: '$messageCountData',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'hashtags',
          localField: 'hashtagInfo.hashtagId',
          foreignField: '_id',
          as: 'hashtags',
        },
      },
      {
        $addFields: {
          hashtagInfo: {
            $cond: [
              { $ifNull: ['$chatroomId', false] },
              {
                $mergeObjects: [
                  '$hashtagInfo',
                  { chatroomId: '$chatroomId' },
                  { latestMessages: '$latestMessages' },
                  { messageCount: '$messageCountData.totalMessages' },
                  { hashtags: '$hashtags' },
                ],
              },
              '$hashtagInfo',
            ],
          },
        },
      },
      {
        $lookup: {
          from: 'likes',
          let: { postId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $eq: [
                        '$userId',
                        new ObjectId(currentUserId),
                      ],
                    },
                    {
                      $eq: [
                        '$postId',
                        '$$postId',
                      ],
                    },
                  ],
                },
              },
            },
          ],
          as: 'isLikedByCurrentUser',
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
          isLiked: {
            $gt: [
              { $size: '$isLikedByCurrentUser' },
              0,
            ],
          },
          viewCount: { $ifNull: ['$viewCount', 0] },
          repostCount: { $size: '$reposts' },
          isReposted: {
            $in: [new ObjectId(currentUserId), '$reposts.repostedBy'],
          },
        },
      },
      {
        $project: {
          _id: 1,
          content: 1,
          hashtagInfo: 1,
          createdAt: 1,
          likeCount: 1,
          isLiked: 1,
          repliesCount: 1,
          viewCount: 1,
          repostCount: 1,
          isReposted: 1,
          parentPostId: 1,
          user: 1,
          distance: 1,
        },
      },
      {
        $sort: { likeCount: -1, distance: 1 },
      },
      {
        $facet: {
          posts: [{ $skip: skip }, { $limit: limit }],
          totalCount: [{ $count: 'count' }],
        },
      },
    ];
    const result = await postServices.aggregate({ query: pipeline });

    const posts = result[0].posts || [];
    const totalDocuments = result[0].totalCount.length > 0 ? result[0].totalCount[0].count : 0;
    const totalPages = Math.ceil(totalDocuments / limit);

    return responseHandler(
      {
        metadata: {
          totalDocuments,
          totalPages,
          pageNum,
          pageSize,
        },
        posts,
      },
      res,
    );
  } catch (err) {
    return responseHandler({
      error: err.message,
    });
  }
});
