const mongoose = require('mongoose');
const privateChatroomModel = require('../models/privateChatroom.model');
const participantModel = require('../models/participant.model');

const toObjectId = (id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id));

/**
 * Private/DM chats: chatrooms where user is active participant (not left, not in exParticipants).
 * Unread = messages not by user, not read by user, not system, not deleted, not in deletedFor, after clearedAt.
 */
async function getPrivateUnreadCounts(userObjectId) {
  const pipeline = [
    {
      $match: {
        'participants.userId': userObjectId,
        'participants.isPresent': { $ne: false },
        'exParticipants.userId': { $ne: userObjectId },
      },
    },
    {
      $addFields: {
        _clearedAt: {
          $let: {
            vars: {
              p: {
                $arrayElemAt: [
                  {
                    $filter: {
                      input: '$participants',
                      as: 'elem',
                      cond: { $eq: ['$$elem.userId', userObjectId] },
                    },
                  },
                  0,
                ],
              },
            },
            in: '$$p.clearedAt',
          },
        },
      },
    },
    {
      $lookup: {
        from: 'privatemessages',
        let: { roomId: '$_id', clearedAt: '$_clearedAt' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$chatroomId', '$$roomId'] },
                  { $ne: ['$senderId', userObjectId] },
                  { $ne: ['$messageType', 'system'] },
                  { $ne: ['$isDeleted', true] },
                  { $not: { $in: [userObjectId, { $ifNull: ['$deletedFor', []] }] } },
                  { $not: { $in: [userObjectId, '$readBy.userId'] } },
                  {
                    $or: [
                      { $eq: ['$$clearedAt', null] },
                      { $gt: ['$createdAt', '$$clearedAt'] },
                    ],
                  },
                ],
              },
            },
          },
          { $count: 'count' },
        ],
        as: '_unread',
      },
    },
    {
      $project: {
        chatroomId: '$_id',
        unreadCount: { $ifNull: [{ $arrayElemAt: ['$_unread.count', 0] }, 0] },
      },
    },
  ];

  const result = await privateChatroomModel.aggregate(pipeline);
  return result.map((r) => ({ chatroomId: r.chatroomId, unreadCount: r.unreadCount || 0 }));
}

/**
 * Public/hashtag chats: participant records give chatroomId + clearedAt. Unread = messages
 * in those rooms not by user, not read by user, not deleted, after clearedAt.
 */
async function getPublicUnreadCounts(userObjectId) {
  const pipeline = [
    { $match: { userId: userObjectId } },
    {
      $lookup: {
        from: 'messages',
        let: { chatroomId: '$chatroomId', clearedAt: '$clearedAt' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$chatroomId', '$$chatroomId'] },
                  { $ne: ['$senderId', userObjectId] },
                  { $ne: ['$isDeleted', true] },
                  { $not: { $in: [userObjectId, '$readBy.userId'] } },
                  {
                    $or: [
                      { $eq: ['$$clearedAt', null] },
                      { $gt: ['$createdAt', '$$clearedAt'] },
                    ],
                  },
                ],
              },
            },
          },
          { $count: 'count' },
        ],
        as: '_unread',
      },
    },
    {
      $project: {
        chatroomId: '$chatroomId',
        unreadCount: { $ifNull: [{ $arrayElemAt: ['$_unread.count', 0] }, 0] },
      },
    },
  ];

  const result = await participantModel.aggregate(pipeline);
  return result.map((r) => ({ chatroomId: r.chatroomId, unreadCount: r.unreadCount || 0 }));
}

/**
 * Compute server-side unread message counts for a user (private/DM and public/hashtag chats).
 * Follows UNREAD_COUNTS_BACKEND_SPEC: excludes own messages, read messages, system messages,
 * messages in left/removed chats, and respects clearedAt.
 *
 * @param {string|mongoose.Types.ObjectId} userId
 * @returns {Promise<{ privateChatUnreadCount: number, publicChatUnreadCount: number, privateChats: Array<{ chatroomId: string, unreadCount: number }>, publicChats: Array<{ chatroomId: string, unreadCount: number }> }>}
 */
async function getUnreadCountsForUser(userId) {
  const userObjectId = toObjectId(userId);

  const [privateChats, publicChats] = await Promise.all([
    getPrivateUnreadCounts(userObjectId),
    getPublicUnreadCounts(userObjectId),
  ]);

  const privateChatUnreadCount = privateChats.filter((c) => c.unreadCount > 0).length;
  const publicChatUnreadCount = publicChats.filter((c) => c.unreadCount > 0).length;

  return {
    privateChatUnreadCount,
    publicChatUnreadCount,
    privateChats: privateChats.filter((c) => c.unreadCount > 0).map((c) => ({
      chatroomId: c.chatroomId.toString(),
      unreadCount: c.unreadCount,
    })),
    publicChats: publicChats.filter((c) => c.unreadCount > 0).map((c) => ({
      chatroomId: c.chatroomId.toString(),
      unreadCount: c.unreadCount,
    })),
  };
}

module.exports = {
  getUnreadCountsForUser,
};
