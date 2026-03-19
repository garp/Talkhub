const mongoose = require('mongoose');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const services = require('../services/hashtagServices');
const { responseHandler } = require('../../lib/helpers/responseHandler');

exports.getRecentChatList = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const aggregationPipeline = [
    {
      $lookup: {
        from: 'chatrooms',
        let: { hashtagId: '$_id' },
        pipeline: [
          {
            $match: { $expr: { $eq: ['$hashtagId', '$$hashtagId'] } },
          },
          {
            $project: {
              _id: 1,
              name: 1,
              createdAt: 1,
            },
          },
        ],
        as: 'chatroom',
      },
    },
    {
      $unwind: {
        path: '$chatroom',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: 'userinteractions',
        let: { hashtagId: '$_id', userId: new mongoose.Types.ObjectId(userId) },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$hashtagId', '$$hashtagId'] },
                  { $eq: ['$userId', '$$userId'] },
                ],
              },
            },
          },
          {
            $sort: { lastHashtagClick: -1 },
          },
          {
            $limit: 1,
          },
          {
            $project: {
              _id: 0,
              lastHashtagClick: 1,
            },
          },
        ],
        as: 'userInteraction',
      },
    },
    {
      $addFields: {
        lastHashtagClick: {
          $ifNull: [{ $arrayElemAt: ['$userInteraction.lastHashtagClick', 0] }, null],
        },
      },
    },
    {
      $lookup: {
        from: 'messages',
        let: { chatroomId: '$chatroom._id' },
        pipeline: [
          {
            $match: { $expr: { $eq: ['$chatroomId', '$$chatroomId'] } },
          },
          {
            $sort: { createdAt: -1 },
          },
          {
            $limit: 2,
          },
          {
            $project: {
              _id: 1,
              content: 1,
              createdAt: 1,
              senderId: 1,
            },
          },
        ],
        as: 'latestMessages',
      },
    },

    {
      $addFields: {
        latestMessageCreatedAt: {
          $ifNull: [{ $arrayElemAt: ['$latestMessages.createdAt', 0] }, null],
        },
      },
    },

    {
      $addFields: {
        latestTimestamp: {
          $max: ['$latestMessageCreatedAt', '$lastHashtagClick'],
        },
      },
    },
    { $sort: { latestTimestamp: -1 } },
    {
      $project: {
        _id: 1,
        chatroom: 1,
        userInteraction: 1,
        latestMessages: 1,
        lastHashtagClick: 1,
        latestMessageCreatedAt: 1,
        latestTimestamp: 1,
      },
    },
  ];
  const response = await services.aggregate({ query: aggregationPipeline });
  return responseHandler({
    message: 'User Updated successfully',
    response,
  }, res);
});
