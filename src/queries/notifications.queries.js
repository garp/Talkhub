const { ObjectId } = require('mongoose').Types;

const senderLookupStages = [
  {
    $lookup: {
      from: 'users',
      localField: 'senderId',
      foreignField: '_id',
      as: 'sender',
      pipeline: [
        {
          $project: {
            _id: 1, userName: 1, fullName: 1, profilePicture: 1,
          },
        },
      ],
    },
  },
  { $unwind: { path: '$sender', preserveNullAndEmptyArrays: true } },
];

const chatroomLookupStages = [
  {
    $lookup: {
      from: 'chatrooms',
      localField: 'chatroomId',
      foreignField: '_id',
      as: 'chatroom',
      pipeline: [
        { $project: { _id: 1, hashtagId: 1, name: 1 } },
      ],
    },
  },
  { $unwind: { path: '$chatroom', preserveNullAndEmptyArrays: true } },
];

// Lookup hashtag details for hashtag_message notifications (to get hashtagPicture as iconUrl)
const hashtagLookupStages = [
  {
    $lookup: {
      from: 'hashtags',
      localField: 'chatroom.hashtagId',
      foreignField: '_id',
      as: 'hashtag',
      pipeline: [
        { $project: { _id: 1, name: 1, hashtagPicture: 1 } },
      ],
    },
  },
  { $unwind: { path: '$hashtag', preserveNullAndEmptyArrays: true } },
];

// Check if the notification recipient (userId) follows the sender (senderId)
// This is useful for follow notifications to show "Follow Back" or "Following"
const followBackLookupStages = [
  {
    $lookup: {
      from: 'follows',
      let: { recipientId: '$userId', senderId: '$senderId' },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ['$followerId', '$$recipientId'] },
                { $eq: ['$followingId', '$$senderId'] },
              ],
            },
          },
        },
        { $limit: 1 },
      ],
      as: 'followBackStatus',
    },
  },
  {
    $addFields: {
      isFollowingBack: { $gt: [{ $size: '$followBackStatus' }, 0] },
    },
  },
];

// For update-type notifications with meta.postId: lookup post and get first media for imageLink/thumbnailUrl
// (enriches old notifications that were created before we stored these in meta)
const postPreviewLookupStage = {
  $lookup: {
    from: 'posts',
    let: { postId: '$meta.postId' },
    pipeline: [
      {
        $match: {
          $expr: {
            $and: [
              { $ne: ['$$postId', null] },
              { $eq: ['$_id', { $cond: [{ $eq: [{ $type: '$$postId' }, 'string'] }, { $toObjectId: '$$postId' }, '$$postId'] }] },
            ],
          },
        },
      },
      { $project: { media: { $slice: ['$media', 1] } } },
      { $limit: 1 },
    ],
    as: 'postForPreview',
  },
};

const notificationProjectStage = {
  $project: {
    _id: 1,
    userId: 1,
    senderId: 1,
    chatroomId: 1,
    category: 1,
    type: 1,
    summary: 1,
    read: 1,
    // Merge stored meta with imageLink/thumbnailUrl from post when missing (for post_like, post_comment, repost)
    meta: {
      $mergeObjects: [
        '$meta',
        {
          $cond: {
            if: {
              $and: [
                { $eq: ['$type', 'update'] },
                { $gt: [{ $size: { $ifNull: ['$postForPreview', []] } }, 0] },
                {
                  $gt: [
                    {
                      $size: {
                        $ifNull: [
                          { $getField: { input: { $arrayElemAt: ['$postForPreview', 0] }, field: 'media' } },
                          [],
                        ],
                      },
                    },
                    0,
                  ],
                },
              ],
            },
            then: {
              $let: {
                vars: {
                  postDoc: { $arrayElemAt: ['$postForPreview', 0] },
                },
                in: {
                  $let: {
                    vars: {
                      firstMedia: {
                        $arrayElemAt: [
                          { $ifNull: [{ $getField: { input: '$$postDoc', field: 'media' } }, []] },
                          0,
                        ],
                      },
                    },
                    in: {
                      imageLink: { $getField: { input: '$$firstMedia', field: 'url' } },
                      thumbnailUrl: {
                        $ifNull: [
                          { $getField: { input: '$$firstMedia', field: 'thumbnailUrl' } },
                          { $getField: { input: '$$firstMedia', field: 'url' } },
                        ],
                      },
                    },
                  },
                },
              },
            },
            else: {},
          },
        },
      ],
    },
    createdAt: 1,
    sender: 1,
    chatroom: 1,
    hashtag: 1,
    isFollowingBack: 1,
    // iconUrl: use hashtag hashtagPicture for hashtag_message, sender profilePicture for others
    iconUrl: {
      $cond: {
        if: { $eq: ['$type', 'hashtag_message'] },
        then: '$hashtag.hashtagPicture',
        else: '$sender.profilePicture',
      },
    },
  },
};

// Fetch notifications for the recipient user, optionally filtered by chatroomId/category/type/time range.
// `matchExtras` is merged into base match.
const notificationWithUser = (userId, {
  chatroomId = null,
  matchExtras = {},
} = {}) => {
  const recipientId = new ObjectId(userId);
  const match = { userId: recipientId, ...(matchExtras || {}) };
  if (chatroomId) match.chatroomId = new ObjectId(chatroomId);

  return [
    { $match: match },
    { $sort: { createdAt: -1 } },
    ...senderLookupStages,
    ...chatroomLookupStages,
    ...hashtagLookupStages,
    ...followBackLookupStages,
    postPreviewLookupStage,
    notificationProjectStage,
  ];
};

// Paginated list filtered by notification type (or type='all' for no type filter)
const notificationsByTypeWithUser = ({
  userId,
  type = 'all',
  page = 1,
  limit = 20,
}) => {
  const recipientId = new ObjectId(userId);
  const match = { userId: recipientId };
  if (type && type !== 'all') match.type = type;

  const skip = Math.max(0, (page - 1) * limit);

  return [
    { $match: match },
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        notifications: [
          { $skip: skip },
          { $limit: limit },
          ...senderLookupStages,
          ...chatroomLookupStages,
          ...hashtagLookupStages,
          ...followBackLookupStages,
          postPreviewLookupStage,
          notificationProjectStage,
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ];
};

// Fetch one notification enriched with sender/chatroom and follow back status
const notificationByIdWithUser = (notificationId) => [
  { $match: { _id: new ObjectId(notificationId) } },
  ...senderLookupStages,
  ...chatroomLookupStages,
  ...hashtagLookupStages,
  ...followBackLookupStages,
  postPreviewLookupStage,
  notificationProjectStage,
];

module.exports = {
  notificationWithUser,
  notificationsByTypeWithUser,
  notificationByIdWithUser,
};
