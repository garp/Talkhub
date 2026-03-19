const { ObjectId } = require('mongoose').Types;

exports.getSavedHashtagsQuery = (filter = {}, sort = {}, pagination = {}, userId = null) => [
  {
    $match: {
      ...filter,
    },
  },
  {
    $lookup: {
      from: 'hashtags',
      localField: 'hashtagId',
      foreignField: '_id',
      as: 'hashtag',
      pipeline: [
        {
          $lookup: {
            from: 'hashtag-likes',
            localField: '_id',
            foreignField: 'hashtagId',
            as: 'likeDetails',
          },
        },
        // Lookup chatroom for this hashtag
        {
          $lookup: {
            from: 'chatrooms',
            localField: '_id',
            foreignField: 'hashtagId',
            as: 'chatroom',
          },
        },
        {
          $unwind: {
            path: '$chatroom',
            preserveNullAndEmptyArrays: true,
          },
        },
        // Count messages in the chatroom
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
          $addFields: {
            likes: { $size: '$likeDetails' },
            isLiked: {
              $in: [
                new ObjectId(userId),
                {
                  $map: {
                    input: '$likeDetails',
                    as: 'like',
                    in: '$$like.userId',
                  },
                },
              ],
            },
            viewCount: { $ifNull: ['$viewCount', 0] },
            totalMessages: { $ifNull: ['$messageCountData.totalMessages', 0] },
          },
        },
        {
          $project: {
            likeDetails: 0,
            chatroom: 0,
            messageCountData: 0,
          },
        },
      ],
    },
  },
  {
    $unwind: {
      path: '$hashtag',
      preserveNullAndEmptyArrays: false,
    },
  },
  {
    $sort: {
      ...sort,
    },
  },
  {
    $skip: pagination.skip,
  },
  {
    $limit: pagination.limit,
  },
];

exports.findOneHashTagQuery = (hashtagId, scope = null) => [
  {
    $match: {
      _id: new ObjectId(hashtagId),
      ...(scope ? { scope } : {}),
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
      welcomePage: { $arrayElemAt: ['$welcomePage', 0] },
      viewCount: { $ifNull: ['$viewCount', 0] },
    },
  },
  {
    $lookup: {
      from: 'subchathashtags',
      localField: '_id',
      foreignField: 'hashtagId',
      as: 'subchathashtags',
      pipeline: [
        {
          $project: {
            _id: 1,
            name: 1,
            hashtagPicture: 1,
          },
        },
      ],

    },
  },
  {
    $lookup: {
      from: 'stories',
      localField: '_id',
      foreignField: 'hashtagId',
      as: 'stories',
    },
  },
];
