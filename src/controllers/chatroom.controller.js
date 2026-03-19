const { default: mongoose } = require('mongoose');
const chatroomServices = require('../services/chatroomServices');
const participantServices = require('../services/participantServices');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const messageServices = require('../services/messageServices');
const { responseHandler, errorHandler } = require('../../lib/helpers/responseHandler');
const hashtagServices = require('../services/hashtagServices');
const hashtagRequestServices = require('../services/hashtagRequestServices');
const pollVoteServices = require('../services/pollVoteServices');
const userServices = require('../services/userServices');
const { userRoles } = require('../../lib/constants/userConstants');
const { resolveHashtagRole } = require('../helpers/hashtagRoleResolver');

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeStringIds = (ids = []) => {
  const set = new Set();
  (Array.isArray(ids) ? ids : []).forEach((v) => {
    if (!v) return;
    const s = String(v).trim();
    if (!s) return;
    set.add(s);
  });
  return [...set];
};

const validateAndNormalizePoll = (poll) => {
  if (!poll || typeof poll !== 'object') throw new Error('Poll object is required');
  const question = typeof poll.question === 'string' ? poll.question.trim() : '';
  if (!question) throw new Error('Poll question is required');
  if (question.length > 300) throw new Error('Poll question is too long (max 300 chars)');

  const rawOptions = Array.isArray(poll.options) ? poll.options : [];
  if (rawOptions.length < 2 || rawOptions.length > 12) throw new Error('Poll must have between 2 and 12 options');

  const options = rawOptions.map((o) => {
    const text = typeof o === 'string' ? o.trim() : (o && typeof o.text === 'string' ? o.text.trim() : '');
    return text;
  }).filter(Boolean);

  if (options.length < 2) throw new Error('Poll must have at least 2 valid options');
  if (options.some((t) => t.length > 100)) throw new Error('Poll option text is too long (max 100 chars)');

  const uniq = new Set(options.map((t) => t.toLowerCase()));
  if (uniq.size !== options.length) throw new Error('Poll options must be unique');

  const isQuiz = !!poll.isQuiz;
  const allowsMultipleAnswers = !!poll.allowsMultipleAnswers;
  const isAnonymous = !!poll.isAnonymous;

  if (isQuiz && allowsMultipleAnswers) throw new Error('Quiz polls cannot allow multiple answers');

  let expiresAt = null;
  if (poll.expiresAt) {
    const d = new Date(poll.expiresAt);
    if (Number.isNaN(d.getTime())) throw new Error('Invalid expiresAt');
    expiresAt = d;
  }

  const normalizedOptions = options.map((text) => ({
    optionId: new mongoose.Types.ObjectId().toString(),
    text,
    voteCount: 0,
  }));

  let correctOptionId = null;
  if (isQuiz) {
    const rawIndex = poll.correctOptionIndex;
    const idx = typeof rawIndex === 'string' ? parseInt(rawIndex, 10) : rawIndex;
    if (!Number.isInteger(idx)) throw new Error('correctOptionIndex is required for quiz polls');
    if (idx < 0 || idx >= normalizedOptions.length) throw new Error('Invalid correctOptionIndex');
    correctOptionId = normalizedOptions[idx].optionId;
  }

  return {
    question,
    options: normalizedOptions,
    allowsMultipleAnswers,
    expiresAt,
    isAnonymous,
    isQuiz,
    correctOptionId,
    totalVotes: 0,
  };
};

const recomputePollCounts = async ({ chatType, messageId }) => {
  const objectId = new mongoose.Types.ObjectId(String(messageId));
  const agg = await pollVoteServices.aggregate({
    query: [
      { $match: { chatType, messageId: objectId } },
      {
        $facet: {
          totals: [{ $count: 'totalVotes' }],
          optionCounts: [
            { $unwind: '$selectedOptionIds' },
            { $group: { _id: '$selectedOptionIds', count: { $sum: 1 } } },
          ],
        },
      },
    ],
  });
  const totalVotes = (agg && agg[0] && agg[0].totals && agg[0].totals[0]) ? agg[0].totals[0].totalVotes : 0;
  const optionCounts = (agg && agg[0] && agg[0].optionCounts) ? agg[0].optionCounts : [];
  const map = new Map(optionCounts.map((x) => [String(x._id), x.count]));
  return { totalVotes, optionCountMap: map };
};

// Controller to view latest 20 messages
exports.view = asyncHandler(async (req, res) => {
  const { hashtagId } = req.value;
  const { userId } = req.user;

  // Find the parent chatroom by hashtagId
  const chatroom = await chatroomServices.findOne({ filter: { hashtagId } });

  if (!chatroom) {
    return errorHandler('ERR-116', res); // Chatroom not found
  }

  const { parentChatroomId, _id: chatroomId } = chatroom;
  const isParentChatroom = !parentChatroomId;

  const participant = await participantServices.findOne({
    filter: { userId, chatroomId },
    projection: { clearedAt: 1 },
  });
  const clearedAt = participant && participant.clearedAt ? participant.clearedAt : null;
  const createdAtFilter = clearedAt ? { createdAt: { $gt: clearedAt } } : {};

  let messageHistory = [];

  if (isParentChatroom) {
    // If it's a parent chatroom, fetch messages from all its sub-chatrooms
    const subChatroomIds = await chatroomServices.find({
      filter: { $or: [{ _id: chatroomId }, { parentChatroomId: chatroomId }] },
      projection: { _id: 1 },
    });

    const chatroomIds = subChatroomIds.map(({ _id }) => _id);

    // Fetch latest 20 messages across parent and sub-chatrooms combined
    messageHistory = await messageServices.find({
      filter: { chatroomId: { $in: chatroomIds }, ...createdAtFilter },
      sort: { createdAt: -1 },
      pagination: { limit: 20 },
    });
    console.log('messageHistory ===>', messageHistory);
  } else {
    // Fetch latest 20 messages from the single chatroom
    messageHistory = await messageServices.find({
      filter: { chatroomId, ...createdAtFilter },
      sort: { createdAt: -1 },
      pagination: { limit: 20 },
    });
    console.log('messageHistory ===>', messageHistory);
  }

  return responseHandler({ chatroom, messages: messageHistory }, res);
});

// REST: Send a poll message in a hashtag chat (for curl/postman testing)
exports.sendHashtagPoll = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const {
    hashtagId,
    poll,
    content = '',
    parentMessageId = null,
    subHashtagId = null,
  } = req.value;

  const hashtag = await hashtagServices.findById({ id: hashtagId });
  if (!hashtag) return errorHandler('ERR-117', res);

  // Broadcast hashtag send restriction (mirror socket behavior)
  if (String(hashtag.access) === 'broadcast') {
    const user = await userServices.findById({ id: userId });
    const isGod = user && user.role === userRoles.GOD;
    let canSend = isGod;
    if (!canSend) {
      const rbac = await resolveHashtagRole({ userId, hashtagId, fallbackRoleKey: 'GUEST' });
      canSend = Array.isArray(rbac.permissions) && rbac.permissions.includes('chat:broadcast_send');
    }
    if (!canSend) {
      return responseHandler({ message: 'This is a broadcast hashtag. You can only view, comment, or react.' }, res, 403);
    }
  }

  const chatroom = await chatroomServices.findOne({ filter: { hashtagId: new mongoose.Types.ObjectId(String(hashtagId)) } });
  if (!chatroom) return errorHandler('ERR-116', res);

  const normalizedPoll = validateAndNormalizePoll(poll);

  const body = {
    senderId: userId,
    chatroomId: chatroom._id,
    status: 'sent',
    readBy: [],
    deliveredTo: [],
    messageType: 'poll',
    poll: normalizedPoll,
    content: (typeof content === 'string' && content.trim()) ? content.trim() : normalizedPoll.question,
    media: '',
    isAudio: false,
    location: null,
    subHashtagId: subHashtagId ? new mongoose.Types.ObjectId(String(subHashtagId)) : undefined,
  };

  if (parentMessageId) {
    const parent = await messageServices.findOne({ filter: { _id: new mongoose.Types.ObjectId(String(parentMessageId)) } });
    if (!parent) return responseHandler({ message: 'Parent message not found' }, res, 404);
    body.parentMessageId = parent._id;
    body.parentMessageContent = parent.content;
    body.parentMessageMedia = parent.media;
    body.parentMessageSenderId = parent.senderId;
  }

  const message = await messageServices.create({ body });
  return responseHandler({
    status: 'sent',
    newMessage: message,
  }, res);
});

// REST: Vote in a hashtag poll (for curl/postman testing)
exports.voteHashtagPoll = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { hashtagId, messageId, selectedOptionIds } = req.value;

  const chatroom = await chatroomServices.findOne({ filter: { hashtagId: new mongoose.Types.ObjectId(String(hashtagId)) } });
  if (!chatroom) return errorHandler('ERR-116', res);

  const message = await messageServices.findOne({
    filter: { _id: new mongoose.Types.ObjectId(String(messageId)), chatroomId: chatroom._id, isDeleted: false },
    projection: { _id: 1, messageType: 1, poll: 1 },
  });
  if (!message) return responseHandler({ message: 'Message not found' }, res, 404);
  if (String(message.messageType) !== 'poll' || !message.poll) return responseHandler({ message: 'Message is not a poll' }, res, 400);

  const expiresAt = message.poll.expiresAt ? new Date(message.poll.expiresAt) : null;
  if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
    return responseHandler({ message: 'Poll has expired' }, res, 400);
  }

  const normalizedSelected = normalizeStringIds(selectedOptionIds);
  const optionIdSet = new Set(((message.poll.options || [])).map((o) => String(o.optionId)));
  const invalid = normalizedSelected.find((id) => !optionIdSet.has(String(id)));
  if (invalid) return responseHandler({ message: 'Invalid poll option' }, res, 400);
  if (!message.poll.allowsMultipleAnswers && normalizedSelected.length !== 1) {
    return responseHandler({ message: 'This poll allows only one option' }, res, 400);
  }

  const voteFilter = {
    chatType: 'hashtag',
    messageId: message._id,
    voterId: new mongoose.Types.ObjectId(String(userId)),
  };
  await pollVoteServices.findOneAndUpsert({
    filter: voteFilter,
    body: {
      $set: {
        chatType: 'hashtag',
        messageId: message._id,
        voterId: voteFilter.voterId,
        hashtagId: new mongoose.Types.ObjectId(String(hashtagId)),
        chatroomId: chatroom._id,
        selectedOptionIds: normalizedSelected,
      },
    },
  });

  const { totalVotes, optionCountMap } = await recomputePollCounts({ chatType: 'hashtag', messageId: message._id });
  const newOptions = (message.poll.options || []).map((o) => ({
    ...(o.toObject ? o.toObject() : o),
    voteCount: optionCountMap.get(String(o.optionId)) || 0,
  }));
  const updated = await messageServices.findByIdAndUpdate({
    id: message._id,
    body: { $set: { 'poll.totalVotes': totalVotes, 'poll.options': newOptions } },
  });

  return responseHandler({
    messageId: String(messageId),
    hashtagId: String(hashtagId),
    poll: updated.poll,
    myVote: normalizedSelected,
  }, res);
});

exports.clearMessages = asyncHandler(async (req, res) => {
  const { hashtagId } = req.value;
  const { userId } = req.user;

  const chatroom = await chatroomServices.findOne({
    filter: { hashtagId: new mongoose.Types.ObjectId(hashtagId) },
    projection: { _id: 1, parentChatroomId: 1 },
  });

  if (!chatroom) {
    return errorHandler('ERR-116', res); // Chatroom not found
  }

  if (chatroom.parentChatroomId) {
    return errorHandler('ERR-118', res); // chatroom is a subchatroom
  }

  const now = new Date();
  const subChatrooms = await chatroomServices.find({
    filter: { $or: [{ _id: chatroom._id }, { parentChatroomId: chatroom._id }] },
    projection: { _id: 1 },
  });
  const chatroomIds = subChatrooms.map(({ _id }) => _id);

  const operations = chatroomIds.map((id) => ({
    updateOne: {
      filter: { userId, chatroomId: id },
      update: { $set: { userId, chatroomId: id, clearedAt: now } },
      upsert: true,
    },
  }));

  await participantServices.bulkWrite({ operations });

  return responseHandler(
    {
      message: 'Messages cleared successfully',
      clearedAt: now,
      hashtagId,
    },
    res,
  );
});

exports.deleteHashtagChats = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { hashtagIds } = req.value;

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const hashtagObjectIds = (hashtagIds || []).map((id) => new mongoose.Types.ObjectId(id));

  // Find parent chatrooms for these hashtags
  const parentChatrooms = await chatroomServices.find({
    filter: { hashtagId: { $in: hashtagObjectIds } },
    projection: { _id: 1 },
  });
  const parentChatroomIds = (parentChatrooms || []).map((c) => c._id);

  if (!parentChatroomIds.length) {
    return responseHandler({ removed: 0, chatroomIds: [] }, res);
  }

  const subChatrooms = await chatroomServices.find({
    filter: { parentChatroomId: { $in: parentChatroomIds } },
    projection: { _id: 1 },
  });
  const subChatroomIds = (subChatrooms || []).map((c) => c._id);

  const chatroomIds = [...parentChatroomIds, ...subChatroomIds];

  const result = await participantServices.deleteMany({
    filter: { userId: userObjectId, chatroomId: { $in: chatroomIds } },
  });

  return responseHandler(
    {
      removed: (result && result.deletedCount) || 0,
      chatroomIds,
    },
    res,
  );
});

exports.join = asyncHandler(async (req, res) => {
  const { hashtagId } = req.value;
  const { userId } = req.user;

  const chatroom = await chatroomServices.findOne({ filter: { hashtagId } });

  if (!chatroom) {
    return errorHandler('ERR-116', res); // Chatroom not found
  }

  const { _id: chatroomId, parentChatroomId } = chatroom;

  if (parentChatroomId) {
    return errorHandler('ERR-118', res); // chatroom is a subchatroom
  }

  // Check if hashtag is private - require accepted invite or existing participation
  const hashtag = await hashtagServices.findById({ id: hashtagId });
  if (!hashtag) {
    return errorHandler('ERR-117', res); // Hashtag not found
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const isCreator = hashtag.creatorId && String(hashtag.creatorId) === String(userId);

  // Check if user is already a participant
  const existingParticipant = await participantServices.findOne({
    filter: { userId: userObjectId, chatroomId },
    projection: { _id: 1 },
  });

  // If user is not already a participant and not the creator, check invite status
  if (!isCreator && !existingParticipant) {
    // Check if user has a pending invite - they must accept it first (for any hashtag type)
    const pendingInvite = await hashtagRequestServices.findOne({
      filter: {
        hashtagId: new mongoose.Types.ObjectId(hashtagId),
        targetUserId: userObjectId,
        status: 'pending',
      },
      projection: { _id: 1 },
    });

    if (pendingInvite) {
      // User was invited but hasn't accepted - don't auto-add as participant
      return responseHandler({
        message: 'You have a pending invite. Please accept it first.',
        pendingInvite: true,
        requestId: pendingInvite._id,
      }, res, 403);
    }

    // For private hashtags, also check if user has an accepted invite
    if (hashtag.access === 'private') {
      const acceptedInvite = await hashtagRequestServices.findOne({
        filter: {
          hashtagId: new mongoose.Types.ObjectId(hashtagId),
          targetUserId: userObjectId,
          status: 'accepted',
        },
        projection: { _id: 1 },
      });

      if (!acceptedInvite) {
        return responseHandler({
          message: 'This is a private hashtag. You need an invite to join.',
          isPrivate: true,
        }, res, 403);
      }
    }
  }

  // Prepare operations for bulk insert/upsert
  const operations = [
    {
      updateOne: {
        filter: { userId, chatroomId },
        update: { $set: { userId, chatroomId } },
        upsert: true,
      },
    },
  ];

  // Find all sub-chatrooms for the parent chatroom
  const subChatrooms = await chatroomServices.find({
    filter: { parentChatroomId: chatroomId },
    projection: { _id: 1 },
  });

  // Add operations for sub-chatrooms
  subChatrooms.forEach(({ _id: subChatroomId }) => {
    operations.push({
      updateOne: {
        filter: { userId, chatroomId: subChatroomId },
        update: { $set: { userId, chatroomId: subChatroomId } },
        upsert: true,
      },
    });
  });

  // Perform bulk operation
  await participantServices.bulkWrite({ operations });

  return responseHandler({ chatroom }, res);
});

// Search messages like WhatsApp search, but only for hashtag chatrooms the user is part of.
// Returns: content, media, createdAt, hashtag (+ location), senderDetails.
exports.searchHashtagChits = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const {
    keyword,
    hashtagId,
    pageNum = 1,
    pageSize = 20,
  } = req.value;

  const me = new mongoose.Types.ObjectId(userId);
  const page = Number(pageNum);
  const limit = Number(pageSize);
  const skip = (page - 1) * limit;

  // Only search within chatrooms where I'm a participant
  const myParticipants = await participantServices.find({
    filter: { userId: me },
    projection: { chatroomId: 1 },
  });
  const myChatroomIds = (myParticipants || []).map((p) => p.chatroomId).filter(Boolean);

  if (!myChatroomIds.length) {
    return responseHandler(
      {
        metadata: {
          page,
          pageSize: limit,
          totalDocuments: 0,
          totalPages: 0,
        },
        results: [],
      },
      res,
    );
  }

  const safe = escapeRegex(keyword.trim());
  const regex = new RegExp(safe, 'i');

  const messageMatch = {
    chatroomId: { $in: myChatroomIds },
    isDeleted: false,
    content: { $regex: regex },
  };

  const hashtagMatchStage = hashtagId
    ? [{
      $match: {
        'chatroom.hashtagId': new mongoose.Types.ObjectId(hashtagId),
      },
    }]
    : [];

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
    ...hashtagMatchStage,
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
              createdAt: 1,
              chatroomId: 1,
              hashtag: {
                _id: '$hashtag._id',
                name: '$hashtag.name',
                fullLocation: '$hashtag.fullLocation',
                location: '$hashtag.location',
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
  const totalDocuments = (agg[0] && agg[0].totalCount && agg[0].totalCount[0] && agg[0].totalCount[0].count) || 0;
  const totalPages = Math.ceil(totalDocuments / limit) || 1;

  return responseHandler(
    {
      metadata: {
        page,
        pageSize: limit,
        totalDocuments,
        totalPages,
      },
      results,
    },
    res,
  );
});
