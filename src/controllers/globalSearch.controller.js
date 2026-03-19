const mongoose = require('mongoose');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { responseHandler } = require('../../lib/helpers/responseHandler');

const hashtagServices = require('../services/hashtagServices');
const userServices = require('../services/userServices');
const messageServices = require('../services/messageServices');
const participantServices = require('../services/participantServices');
const interestCategoryServices = require('../services/interestCategoryServices');
const postServices = require('../services/postServices');

/**
 * Escape special regex characters in a string
 * @param {string} value - The string to escape
 * @returns {string} Escaped string safe for use in RegExp
 */
const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Search for hashtags (chats) matching the keyword
 * @param {Object} params - Search parameters
 * @param {string} params.keyword - Search term
 * @param {mongoose.Types.ObjectId} params.userId - Current user's ObjectId
 * @param {number} params.skip - Number of results to skip
 * @param {number} params.limit - Maximum number of results to return
 * @returns {Promise<{results: Array, totalCount: number}>}
 */
const searchHashtags = async ({
  keyword, userId, skip, limit,
}) => {
  const regex = new RegExp(escapeRegex(keyword.trim()), 'i');

  // Get blocked users to filter out their hashtags
  const meUser = await userServices.findById({
    id: userId,
    projection: { blockedUsers: 1 },
  });
  const blockedIds = ((meUser && meUser.blockedUsers) || [])
    .map((b) => (b && b.userId ? b.userId : null))
    .filter(Boolean);

  const filter = {
    name: { $regex: regex },
  };

  if (blockedIds.length > 0) {
    filter.creatorId = { $nin: blockedIds };
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);

  const pipeline = [
    { $match: filter },
    {
      $lookup: {
        from: 'chatrooms',
        localField: '_id',
        foreignField: 'hashtagId',
        as: 'chatrooms',
      },
    },
    {
      $lookup: {
        from: 'saves',
        let: { hashtagId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$hashtagId', '$$hashtagId'] },
                  { $eq: ['$userId', userObjectId] },
                ],
              },
            },
          },
          { $project: { _id: 1, createdAt: 1 } },
        ],
        as: 'savedByCurrentUser',
      },
    },
    {
      $addFields: {
        isSaved: { $gt: [{ $size: '$savedByCurrentUser' }, 0] },
        isPinned: { $gt: [{ $size: '$savedByCurrentUser' }, 0] },
        pinnedAt: { $arrayElemAt: ['$savedByCurrentUser.createdAt', 0] },
        chatroomId: { $arrayElemAt: ['$chatrooms._id', 0] },
      },
    },
    { $sort: { pinnedAt: -1, createdAt: -1 } },
    {
      $facet: {
        results: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              name: 1,
              description: 1,
              creatorId: 1,
              access: 1,
              scope: 1,
              fullLocation: 1,
              location: 1,
              parentHashtagId: 1,
              profilePicture: 1,
              hashtagPhoto: 1,
              hashtagBanner: 1,
              likeCount: 1,
              viewCount: 1,
              chatroomId: 1,
              isSaved: 1,
              isPinned: 1,
              createdAt: 1,
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ];

  const agg = await hashtagServices.aggregate({ query: pipeline });
  const results = (agg[0] && agg[0].results) || [];
  const totalCount = (agg[0] && agg[0].totalCount && agg[0].totalCount[0] && agg[0].totalCount[0].count) || 0;

  return { results, totalCount };
};

/**
 * Search for messages (chits) matching the keyword
 * Similar to searchHashtagChits but for global search
 * @param {Object} params - Search parameters
 * @param {string} params.keyword - Search term
 * @param {mongoose.Types.ObjectId} params.userId - Current user's ObjectId
 * @param {number} params.skip - Number of results to skip
 * @param {number} params.limit - Maximum number of results to return
 * @returns {Promise<{results: Array, totalCount: number}>}
 */
const searchChits = async ({
  keyword, userId, skip, limit,
}) => {
  const me = new mongoose.Types.ObjectId(userId);

  // Only search within chatrooms where user is a participant
  const myParticipants = await participantServices.find({
    filter: { userId: me },
    projection: { chatroomId: 1 },
  });
  const myChatroomIds = (myParticipants || []).map((p) => p.chatroomId).filter(Boolean);

  if (!myChatroomIds.length) {
    return { results: [], totalCount: 0 };
  }

  const safe = escapeRegex(keyword.trim());
  const regex = new RegExp(safe, 'i');

  const messageMatch = {
    chatroomId: { $in: myChatroomIds },
    isDeleted: false,
    content: { $regex: regex },
  };

  const pipeline = [
    { $match: messageMatch },

    // Respect "clear messages" per user+chatroom
    {
      $lookup: {
        from: 'participants',
        let: { chatroomId: '$chatroomId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$chatroomId', '$$chatroomId'] },
                  { $eq: ['$userId', me] },
                ],
              },
            },
          },
          { $project: { _id: 0, clearedAt: 1 } },
        ],
        as: 'participant',
      },
    },
    {
      $addFields: {
        clearedAt: { $arrayElemAt: ['$participant.clearedAt', 0] },
      },
    },
    {
      $match: {
        $expr: {
          $or: [
            { $eq: ['$clearedAt', null] },
            { $gt: ['$createdAt', '$clearedAt'] },
          ],
        },
      },
    },

    // Join chatroom -> hashtag
    {
      $lookup: {
        from: 'chatrooms',
        localField: 'chatroomId',
        foreignField: '_id',
        pipeline: [{ $project: { _id: 1, hashtagId: 1, name: 1 } }],
        as: 'chatroom',
      },
    },
    { $unwind: { path: '$chatroom', preserveNullAndEmptyArrays: false } },
    {
      $lookup: {
        from: 'hashtags',
        localField: 'chatroom.hashtagId',
        foreignField: '_id',
        pipeline: [
          {
            $project: {
              _id: 1,
              name: 1,
              fullLocation: 1,
              location: 1,
              profilePicture: 1,
            },
          },
        ],
        as: 'hashtag',
      },
    },
    { $unwind: { path: '$hashtag', preserveNullAndEmptyArrays: false } },

    // Join sender details
    {
      $lookup: {
        from: 'users',
        localField: 'senderId',
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
        as: 'sender',
      },
    },
    { $unwind: { path: '$sender', preserveNullAndEmptyArrays: false } },

    { $sort: { createdAt: -1 } },
    {
      $facet: {
        results: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              content: 1,
              media: 1,
              isAudio: 1,
              messageType: 1,
              createdAt: 1,
              chatroomId: 1,
              hashtag: {
                _id: '$hashtag._id',
                name: '$hashtag.name',
                fullLocation: '$hashtag.fullLocation',
                location: '$hashtag.location',
                hashtagPicture: '$hashtag.hashtagPicture',
              },
              senderDetails: '$sender',
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ];

  const agg = await messageServices.aggregate({ query: pipeline });
  const results = (agg[0] && agg[0].results) || [];
  const totalCount = (agg[0] && agg[0].totalCount && agg[0].totalCount[0] && agg[0].totalCount[0].count) || 0;

  return { results, totalCount };
};

/**
 * Search for users (people) matching the keyword
 * @param {Object} params - Search parameters
 * @param {string} params.keyword - Search term
 * @param {mongoose.Types.ObjectId} params.userId - Current user's ObjectId
 * @param {number} params.skip - Number of results to skip
 * @param {number} params.limit - Maximum number of results to return
 * @returns {Promise<{results: Array, totalCount: number}>}
 */
const searchPeople = async ({
  keyword, userId, skip, limit,
}) => {
  const me = new mongoose.Types.ObjectId(userId);

  // Users I have blocked + users who have blocked me (exclude both from search)
  const [meUser, blockedByMeList] = await Promise.all([
    userServices.findById({ id: userId, projection: { blockedUsers: 1 } }),
    userServices.find({
      filter: { 'blockedUsers.userId': me },
      projection: { _id: 1 },
    }),
  ]);
  const blockedIds = ((meUser && meUser.blockedUsers) || [])
    .map((b) => (b && b.userId ? new mongoose.Types.ObjectId(b.userId) : null))
    .filter(Boolean);
  const blockedMeIds = (blockedByMeList || []).map((u) => u._id).filter(Boolean);
  const excludeUserIds = [...new Set([me.toString(), ...blockedIds.map((id) => id.toString()), ...blockedMeIds.map((id) => id.toString())])].map((id) => new mongoose.Types.ObjectId(id));

  const regex = new RegExp(escapeRegex(keyword.trim()), 'i');

  const searchFilter = {
    _id: { $nin: excludeUserIds },
    active: true,
    $or: [
      { fullName: { $regex: regex } },
      { userName: { $regex: regex } },
    ],
  };

  const [totalCount, users] = await Promise.all([
    userServices.countDocuments({ filter: searchFilter }),
    userServices.find({
      filter: searchFilter,
      projection: {
        _id: 1,
        fullName: 1,
        userName: 1,
        profilePicture: 1,
        description: 1,
        fullLocation: 1,
        location: 1,
        followers: 1,
        following: 1,
      },
      pagination: { skip, limit },
      sort: { followers: -1, createdAt: -1 },
    }),
  ]);

  const results = (users || []).map((u) => (u && typeof u.toObject === 'function' ? u.toObject() : u));

  return { results, totalCount };
};

/**
 * Search for topics (interest categories) matching the keyword
 * @param {Object} params - Search parameters
 * @param {string} params.keyword - Search term
 * @param {number} params.skip - Number of results to skip
 * @param {number} params.limit - Maximum number of results to return
 * @returns {Promise<{results: Array, totalCount: number}>}
 */
const searchTopics = async ({ keyword, skip, limit }) => {
  const regex = new RegExp(escapeRegex(keyword.trim()), 'i');

  // Search interest categories
  const categoryFilter = {
    isActive: true,
    $or: [
      { name: { $regex: regex } },
      { description: { $regex: regex } },
    ],
  };

  const categories = await interestCategoryServices.find({
    filter: categoryFilter,
    projection: {
      _id: 1,
      name: 1,
      slug: 1,
      description: 1,
      icon: 1,
      backgroundImage: 1,
      order: 1,
    },
    sort: { order: 1, name: 1 },
  });

  // Format results
  const allResults = (categories || []).map((cat) => (
    cat && typeof cat.toObject === 'function' ? cat.toObject() : cat
  ));

  const totalCount = allResults.length;

  // Apply pagination
  const paginatedResults = allResults.slice(skip, skip + limit);

  return { results: paginatedResults, totalCount };
};

/**
 * Search for posts (media) matching the keyword
 * Returns posts that have media (image/video), optionally filtered by subtype.
 * When keyword is empty, returns all media posts (no text filter).
 * @param {Object} params - Search parameters
 * @param {string} params.keyword - Search term (optional for media)
 * @param {mongoose.Types.ObjectId} params.userId - Current user's ObjectId
 * @param {string} params.subtype - 'all' | 'image' | 'video'
 * @param {number} params.skip - Number of results to skip
 * @param {number} params.limit - Maximum number of results to return
 * @returns {Promise<{results: Array, totalCount: number}>}
 */
const searchMedia = async ({
  keyword = '', userId, subtype = 'all', skip, limit,
}) => {
  const me = new mongoose.Types.ObjectId(userId);
  const trimmedKeyword = (keyword || '').trim();

  // Get blocked users to filter out their posts
  const meUser = await userServices.findById({
    id: userId,
    projection: { blockedUsers: 1 },
  });
  const blockedIds = ((meUser && meUser.blockedUsers) || [])
    .map((b) => (b && b.userId ? new mongoose.Types.ObjectId(b.userId) : null))
    .filter(Boolean);

  const match = {
    // Must have media
    media: { $exists: true, $ne: [] },
    // Only original posts (not replies)
    parentPostId: null,
  };

  // Only apply keyword filter when a keyword is provided
  if (trimmedKeyword) {
    const regex = new RegExp(escapeRegex(trimmedKeyword), 'i');
    match.$or = [
      { text: { $regex: regex } },
      { labels: { $regex: regex } },
    ];
  }

  // Filter out blocked users' posts
  if (blockedIds.length > 0) {
    match.userId = { $nin: blockedIds };
  }

  // Filter by subtype (image or video)
  const normalizedSubtype = String(subtype || 'all').toLowerCase();
  if (normalizedSubtype === 'image' || normalizedSubtype === 'video') {
    match['media.mediaType'] = normalizedSubtype;
  }

  const pipeline = [
    { $match: match },
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        results: [
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'users',
              localField: 'userId',
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
              as: 'user',
            },
          },
          { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
          // Check if current user liked this post
          {
            $lookup: {
              from: 'likes',
              let: { postId: '$_id' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$postId', '$$postId'] },
                        { $eq: ['$userId', me] },
                      ],
                    },
                  },
                },
                { $project: { _id: 1 } },
              ],
              as: 'likedByCurrentUser',
            },
          },
          {
            $addFields: {
              isLiked: { $gt: [{ $size: '$likedByCurrentUser' }, 0] },
            },
          },
          {
            $project: {
              _id: 1,
              userId: 1,
              user: 1,
              text: 1,
              location: 1,
              media: 1,
              labels: 1,
              isLiked: 1,
              viewCount: { $ifNull: ['$viewCount', 0] },
              createdAt: 1,
              updatedAt: 1,
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ];

  const agg = await postServices.aggregate({ query: pipeline });
  const results = (agg[0] && agg[0].results) || [];
  const totalCount = (agg[0] && agg[0].totalCount && agg[0].totalCount[0] && agg[0].totalCount[0].count) || 0;

  return { results, totalCount };
};

/**
 * Global Search API Controller
 *
 * Searches across multiple entities based on type:
 * - 'all': Returns limited results from all categories (chats, chits, people, topic, media)
 * - 'chats': Search hashtags (chat rooms)
 * - 'chits': Search messages within user's chatrooms
 * - 'people': Search users
 * - 'topic': Search interest categories
 * - 'media': Search posts with media (image/video), filterable by subtype
 *
 * @route GET /global-search
 */
exports.globalSearch = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const {
    keyword,
    type = 'all',
    subtype = 'all',
    pageNum = 1,
    pageSize = 20,
    allSize = 5,
  } = req.value;

  const page = Number(pageNum);
  const limit = Number(pageSize);
  const skip = (page - 1) * limit;
  const allLimit = Number(allSize);

  // For 'all' type, search all categories with limited results
  if (type === 'all') {
    const [chatsResult, chitsResult, peopleResult, topicResult, mediaResult] = await Promise.all([
      searchHashtags({
        keyword, userId, skip: 0, limit: allLimit,
      }),
      searchChits({
        keyword, userId, skip: 0, limit: allLimit,
      }),
      searchPeople({
        keyword, userId, skip: 0, limit: allLimit,
      }),
      searchTopics({
        keyword, skip: 0, limit: allLimit,
      }),
      searchMedia({
        keyword, userId, subtype, skip: 0, limit: allLimit,
      }),
    ]);

    // Add type to each result for frontend differentiation
    const chats = chatsResult.results.map((item) => ({ ...item, type: 'chats' }));
    const chits = chitsResult.results.map((item) => ({ ...item, type: 'chits' }));
    const people = peopleResult.results.map((item) => ({ ...item, type: 'people' }));
    const topic = topicResult.results.map((item) => ({ ...item, type: 'topic' }));
    const media = mediaResult.results.map((item) => ({ ...item, type: 'media' }));

    return responseHandler(
      {
        metadata: {
          keyword,
          type: 'all',
          allSize: allLimit,
          totals: {
            chats: chatsResult.totalCount,
            chits: chitsResult.totalCount,
            people: peopleResult.totalCount,
            topic: topicResult.totalCount,
            media: mediaResult.totalCount,
          },
        },
        results: {
          chats,
          chits,
          people,
          topic,
          media,
        },
      },
      res,
    );
  }

  // For specific type searches with full pagination
  let searchResult = { results: [], totalCount: 0 };

  switch (type) {
    case 'chats':
      searchResult = await searchHashtags({
        keyword, userId, skip, limit,
      });
      break;
    case 'topic':
      searchResult = await searchTopics({
        keyword, skip, limit,
      });
      break;
    case 'chits':
      searchResult = await searchChits({
        keyword, userId, skip, limit,
      });
      break;
    case 'people':
      searchResult = await searchPeople({
        keyword, userId, skip, limit,
      });
      break;
    case 'media':
      searchResult = await searchMedia({
        keyword, userId, subtype, skip, limit,
      });
      break;
    default:
      break;
  }

  const totalPages = Math.ceil(searchResult.totalCount / limit) || 1;

  // Add type to each result
  const results = searchResult.results.map((item) => ({
    ...item,
    type: type === 'topic' ? 'topic' : type,
  }));

  return responseHandler(
    {
      metadata: {
        keyword,
        type,
        page,
        pageSize: limit,
        totalDocuments: searchResult.totalCount,
        totalPages,
      },
      results,
    },
    res,
  );
});
