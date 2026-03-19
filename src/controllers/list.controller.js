const { default: mongoose } = require('mongoose');
const listServices = require('../services/listServices');
const privateChatroomServices = require('../services/privateChatroomServices');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { responseHandler } = require('../../lib/helpers/responseHandler');

// Create a new list
exports.createList = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const {
    name,
    participantIds,
    chatroomId,
    chatroomIds,
  } = req.value;

  const userObjectId = new mongoose.Types.ObjectId(userId);

  const chatroomIdsToUse = [
    ...(chatroomId ? [chatroomId] : []),
    ...(Array.isArray(chatroomIds) ? chatroomIds : []),
  ];

  // If creating by chatroomIds, validate and derive participantIds from those chatrooms.
  if (chatroomIdsToUse.length) {
    const uniqueChatroomIds = [...new Set(chatroomIdsToUse.map((id) => id.toString()))];

    const rooms = await privateChatroomServices.find({
      filter: { _id: { $in: uniqueChatroomIds }, 'participants.userId': userObjectId },
      projection: { _id: 1, participants: 1 },
    });

    if (!rooms || rooms.length !== uniqueChatroomIds.length) {
      return res.status(404).json({
        success: false,
        message: 'One or more chatrooms not found or you are not a participant',
      });
    }

    const participantIdSet = new Set();
    rooms.forEach((r) => {
      (r.participants || []).forEach((p) => {
        if (p && p.userId) participantIdSet.add(p.userId.toString());
      });
    });
    participantIdSet.delete(userId.toString());
    const derivedParticipantIds = [...participantIdSet];

    if (!derivedParticipantIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Cannot create a list with no other participants',
      });
    }

    const list = await listServices.create({
      body: {
        name,
        participantIds: derivedParticipantIds,
        createdBy: userId,
        chatroomIds: uniqueChatroomIds,
      },
    });

    return responseHandler({ list }, res);
  }

  // Otherwise, fall back to old behavior: create using participantIds (create 1:1 chatrooms).
  const normalizedParticipantIds = [...new Set((participantIds || []).map((id) => id.toString()))].filter(
    (participantId) => participantId !== userId.toString(),
  );

  if (!normalizedParticipantIds.length) {
    return res.status(400).json({
      success: false,
      message: 'participantIds is required if chatroomId(s) is not provided',
    });
  }

  const createdChatroomIds = await Promise.all(
    normalizedParticipantIds.map(async (participantId) => {
      const existingChatroom = await privateChatroomServices.findOne({
        filter: {
          isGroupChat: false,
          participants: {
            $all: [
              { $elemMatch: { userId } },
              { $elemMatch: { userId: participantId } },
            ],
          },
        },
      });

      if (existingChatroom) {
        return existingChatroom._id;
      }

      const chatroom = await privateChatroomServices.create({
        body: {
          isGroupChat: false,
          participants: [{ userId }, { userId: participantId }],
          createdBy: userId,
        },
      });

      return chatroom._id;
    }),
  );

  const list = await listServices.create({
    body: {
      name,
      participantIds: normalizedParticipantIds,
      createdBy: userId,
      chatroomIds: createdChatroomIds,
    },
  });

  return responseHandler({ list }, res);
});

// Update an existing list
exports.updateList = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { listId } = req.params;
  const {
    name,
    participantIds,
    chatroomId,
    chatroomIds,
  } = req.value;

  // Check if list exists and belongs to the user
  const existingList = await listServices.findOne({
    filter: {
      _id: listId,
      createdBy: userId,
    },
  });

  if (!existingList) {
    return res.status(404).json({
      success: false,
      message: 'List not found or you do not have permission to update it',
    });
  }

  const updateBody = {};

  // Update name / participants (optional)
  if (typeof name !== 'undefined') updateBody.name = name;
  if (typeof participantIds !== 'undefined') updateBody.participantIds = participantIds;

  const updateOps = {};
  if (Object.keys(updateBody).length) {
    updateOps.$set = updateBody;
  }

  // chatroomId: add a single chatroom (append behavior)
  // chatroomIds: replace with exact set (sync behavior, supports removals)
  const hasReplaceChatroomIds = Array.isArray(chatroomIds);
  const hasAddChatroomId = !!chatroomId;

  if (hasReplaceChatroomIds) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const uniqueChatroomIds = [...new Set((chatroomIds || []).map((id) => id.toString()))];

    // Ensure all chatrooms exist and the user is a participant in each
    const found = await privateChatroomServices.find({
      filter: { _id: { $in: uniqueChatroomIds }, 'participants.userId': userObjectId },
      projection: { _id: 1, participants: 1 },
    });

    if (!found || found.length !== uniqueChatroomIds.length) {
      return res.status(404).json({
        success: false,
        message: 'One or more chatrooms not found or you are not a participant',
      });
    }

    // Recompute participantIds from the selected chatrooms (excluding current user)
    const participantIdSet = new Set();
    (found || []).forEach((r) => {
      (r.participants || []).forEach((p) => {
        if (p && p.userId) participantIdSet.add(p.userId.toString());
      });
    });
    participantIdSet.delete(userId.toString());
    const derivedParticipantIds = [...participantIdSet];
    if (!derivedParticipantIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update a list to have no other participants',
      });
    }

    updateOps.$set = {
      ...(updateOps.$set || {}),
      chatroomIds: uniqueChatroomIds,
      participantIds: derivedParticipantIds,
    };
  } else if (hasAddChatroomId) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const idToAdd = chatroomId.toString();

    const found = await privateChatroomServices.findOne({
      filter: { _id: idToAdd, 'participants.userId': userObjectId },
      projection: { _id: 1 },
    });

    if (!found) {
      return res.status(404).json({
        success: false,
        message: 'Chatroom not found or you are not a participant',
      });
    }

    updateOps.$addToSet = {
      ...(updateOps.$addToSet || {}),
      chatroomIds: idToAdd,
    };
  }

  if (!Object.keys(updateOps).length) {
    return responseHandler({ list: existingList }, res);
  }

  const updatedList = await listServices.update({
    filter: { _id: listId },
    body: updateOps,
  });

  return responseHandler({ list: updatedList }, res);
});

// Delete a list
exports.deleteList = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { listId } = req.params;

  // Check if list exists and belongs to the user
  const existingList = await listServices.findOne({
    filter: {
      _id: listId,
      createdBy: userId,
    },
  });

  if (!existingList) {
    return res.status(404).json({
      success: false,
      message: 'List not found or you do not have permission to delete it',
    });
  }

  await listServices.delete({
    filter: { _id: listId },
  });

  return responseHandler({ message: 'List deleted successfully' }, res);
});

// Get all lists for the authenticated user
exports.getAllLists = asyncHandler(async (req, res) => {
  const { userId } = req.user;

  const query = req.value || req.query || {};
  const listId = query.id || query.listId || null;

  // Optional: fetch a single list by id (still scoped to createdBy)
  if (listId) {
    const list = await listServices.findOne({
      filter: { _id: listId, createdBy: userId },
    });

    // Backward compatible: keep `lists` array, also provide `list`
    return responseHandler({ list: list || null, lists: list ? [list] : [] }, res);
  }

  const lists = await listServices.find({
    filter: { createdBy: userId },
    sort: { createdAt: -1 },
  });

  return responseHandler({ lists }, res);
});

// Get a single list's private chatrooms (pinned-first ordering for the current user)
exports.getListChatrooms = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { listId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const list = await listServices.findOne({
    filter: { _id: listId, createdBy: userId },
    projection: { chatroomIds: 1, name: 1 },
  });

  if (!list) {
    return responseHandler({
      chatrooms: [],
      metadata: {
        totalChatrooms: 0, totalPages: 0, page, limit,
      },
    }, res);
  }

  const chatroomIds = Array.isArray(list.chatroomIds) ? list.chatroomIds : [];
  if (!chatroomIds.length) {
    return responseHandler({
      chatrooms: [],
      metadata: {
        totalChatrooms: 0, totalPages: 0, page, limit,
      },
    }, res);
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const pageNum = Number(page);
  const limitNum = Number(limit);

  const aggregationPipeline = [
    {
      $match: {
        _id: { $in: chatroomIds },
        'participants.userId': userObjectId,
      },
    },
    {
      $addFields: {
        _currentUserParticipant: {
          $arrayElemAt: [
            {
              $filter: {
                input: '$participants',
                as: 'p',
                cond: { $eq: ['$$p.userId', userObjectId] },
              },
            },
            0,
          ],
        },
      },
    },
    {
      $addFields: {
        _clearedAt: '$_currentUserParticipant.clearedAt',
        _pinnedAt: '$_currentUserParticipant.pinnedAt',
      },
    },
    {
      $lookup: {
        from: 'privatemessages',
        let: { chatroomId: '$_id', clearedAt: '$_clearedAt' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$chatroomId', '$$chatroomId'] },
                  {
                    $or: [
                      { $eq: [{ $ifNull: ['$$clearedAt', null] }, null] },
                      { $gt: ['$createdAt', '$$clearedAt'] },
                    ],
                  },
                ],
              },
            },
          },
        ],
        as: 'messages',
      },
    },
    {
      $addFields: {
        sortedMessages: {
          $sortArray: {
            input: '$messages',
            sortBy: { createdAt: -1 },
          },
        },
      },
    },
    {
      $addFields: {
        previewMessage: { $arrayElemAt: ['$sortedMessages', 0] },
        otherMessages: {
          $filter: {
            input: '$sortedMessages',
            as: 'msg',
            cond: { $ne: ['$$msg.senderId', userObjectId] },
          },
        },
      },
    },
    {
      $addFields: {
        firstOtherMessageStatus: { $arrayElemAt: ['$otherMessages.status', 0] },
        firstReadIndex: {
          $indexOfArray: [
            {
              $map: {
                input: '$otherMessages',
                as: 'msg',
                in: { $eq: ['$$msg.status', 'read'] },
              },
            },
            true,
          ],
        },
      },
    },
    {
      $addFields: {
        pendingSource: {
          $cond: {
            if: { $gt: [{ $size: '$otherMessages' }, 0] },
            then: {
              $cond: {
                if: { $eq: ['$firstOtherMessageStatus', 'read'] },
                then: [],
                else: {
                  $cond: {
                    if: { $gt: ['$firstReadIndex', 0] },
                    then: { $slice: ['$otherMessages', 0, '$firstReadIndex'] },
                    else: {
                      $cond: {
                        if: { $eq: ['$firstReadIndex', 0] },
                        then: [],
                        else: '$otherMessages',
                      },
                    },
                  },
                },
              },
            },
            else: [],
          },
        },
      },
    },
    {
      $addFields: {
        unreadCount: { $size: '$pendingSource' },
        latestMessage: {
          $cond: {
            if: { $gt: ['$unreadCount', 0] },
            then: {
              $map: {
                input: '$pendingSource',
                as: 'msg',
                in: {
                  _id: '$$msg._id',
                  content: '$$msg.content',
                  media: '$$msg.media',
                  createdAt: '$$msg.createdAt',
                  status: '$$msg.status',
                  senderId: '$$msg.senderId',
                },
              },
            },
            else: {
              $cond: {
                if: { $gt: [{ $size: '$sortedMessages' }, 0] },
                then: [
                  {
                    _id: '$previewMessage._id',
                    content: '$previewMessage.content',
                    media: '$previewMessage.media',
                    createdAt: '$previewMessage.createdAt',
                    status: '$previewMessage.status',
                    senderId: '$previewMessage.senderId',
                  },
                ],
                else: [],
              },
            },
          },
        },
      },
    },
    {
      $group: {
        _id: '$_id',
        isGroupChat: { $first: '$isGroupChat' },
        name: { $first: '$name' },
        participants: { $first: '$participants' },
        latestMessage: { $first: '$latestMessage' },
        unreadCount: { $first: '$unreadCount' },
        createdAt: { $first: '$createdAt' },
        firstMessage: { $first: { $arrayElemAt: ['$sortedMessages', 0] } },
        pinnedAt: { $first: '$_pinnedAt' },
      },
    },
    { $sort: { pinnedAt: -1, 'firstMessage.createdAt': -1 } },
    {
      $facet: {
        chatrooms: [
          { $skip: (pageNum - 1) * limitNum },
          { $limit: limitNum },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ];

  const result = await privateChatroomServices.aggregate({ query: aggregationPipeline });
  const chatrooms = result[0].chatrooms || [];
  const totalChatrooms = result[0].totalCount.length > 0 ? result[0].totalCount[0].count : 0;
  const totalPages = Math.ceil(totalChatrooms / limitNum);

  return responseHandler({
    metadata: {
      totalChatrooms,
      totalPages,
      page: pageNum,
      limit: limitNum,
    },
    chatrooms,
  }, res);
});
