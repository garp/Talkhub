const { default: mongoose } = require('mongoose');
const { socketEvents } = require('../../lib/constants/socket');
const privateChatroomServices = require('../services/privateChatroomServices');
const privateMessageServices = require('../services/privateMessageServices');
const storiesServices = require('../services/storiesServices');
const userServices = require('../services/userServices');
const pushNotificationService = require('../services/pushNotificationService');
const notificationService = require('../services/notificationService');
const notificationSettingsServices = require('../services/notificationSettingsServices');
const listServices = require('../services/listServices');
const mediaModerationService = require('../services/mediaModerationService');
const { parseS3Url } = require('../../lib/helpers/s3UrlParser');
const { contentIncludesEveryoneMention } = require('../../lib/helpers/mentionParser');
const pollVoteServices = require('../services/pollVoteServices');
const { pushUnreadCountsUpdate, pushUnreadCountsUpdateToUsers } = require('./unreadCountsEvents');

const toObjectId = (value) => (value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(value));

const allowedMessageTypes = new Set(['text', 'image', 'video', 'audio', 'location', 'file', 'poll', 'sharedcontent']);

const inferMessageType = ({ messageType, isAudio, media }) => {
  const mt = typeof messageType === 'string' ? messageType.trim().toLowerCase() : '';
  if (mt && allowedMessageTypes.has(mt)) return mt;
  if (isAudio) return 'audio';
  if (media) {
    const url = typeof media === 'string' ? media.toLowerCase() : '';
    const isVideo = /\.(mp4|mov|m4v|webm|mkv|avi|3gp)(\?|$)/.test(url);
    return isVideo ? 'video' : 'image';
  }
  return 'text';
};

const validateAndNormalizeLocation = (location) => {
  if (!location || typeof location !== 'object') throw new Error('Location object is required for location messages');
  const latitude = typeof location.latitude === 'string' ? Number(location.latitude) : location.latitude;
  const longitude = typeof location.longitude === 'string' ? Number(location.longitude) : location.longitude;
  const { address } = location;
  if (typeof latitude !== 'number' || Number.isNaN(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('Invalid latitude');
  }
  if (typeof longitude !== 'number' || Number.isNaN(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('Invalid longitude');
  }
  if (!address || typeof address !== 'string' || !address.trim()) throw new Error('Address is required');
  if (address.trim().length > 500) throw new Error('Address is too long (max 500 chars)');
  return { latitude, longitude, address: address.trim() };
};

const validateAndNormalizePoll = (poll) => {
  if (!poll || typeof poll !== 'object') throw new Error('Poll object is required for poll messages');
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

  if (isQuiz && allowsMultipleAnswers) {
    throw new Error('Quiz polls cannot allow multiple answers');
  }

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

const publicPoll = (poll) => {
  if (!poll) return null;
  const obj = poll.toObject ? poll.toObject() : poll;
  return {
    question: obj.question,
    allowsMultipleAnswers: !!obj.allowsMultipleAnswers,
    expiresAt: obj.expiresAt || null,
    isAnonymous: !!obj.isAnonymous,
    isQuiz: !!obj.isQuiz,
    totalVotes: obj.totalVotes || 0,
    options: (obj.options || []).map((o) => ({
      optionId: o.optionId,
      text: o.text,
      voteCount: o.voteCount || 0,
    })),
  };
};

/**
 * Create one system message (member_left or member_removed) in the private chatroom so it appears in message history.
 * For member_removed, pass targetUserIds (array) and one message is created for the whole action.
 * Returns { message, senderDetails } for emitting as NEW_PRIVATE_MESSAGE.
 */
const createPrivateSystemMessage = async ({
  chatroomId,
  type,
  actorUserId,
  targetUserId = null,
  targetUserIds = null,
}) => {
  const actorId = toObjectId(actorUserId);
  const actor = await userServices.findOne({
    filter: { _id: actorId },
    projection: {
      _id: 1, fullName: 1, userName: 1, profilePicture: 1,
    },
  });
  const actorName = (actor && (actor.fullName || actor.userName)) || 'Someone';

  let content;
  const systemEvent = { type, actorUserId: actorId };

  if (type === 'member_left') {
    content = `${actorName} left the group`;
  } else {
    const ids = targetUserIds && targetUserIds.length
      ? targetUserIds.map((id) => toObjectId(id))
      : (targetUserId ? [toObjectId(targetUserId)] : []);
    systemEvent.targetUserIds = ids;
    systemEvent.targetUserId = ids[0] || null; // backward compat
    if (ids.length === 0) {
      content = `${actorName} removed someone from the group`;
    } else {
      const targets = await userServices.find({
        filter: { _id: { $in: ids } },
        projection: { _id: 1, fullName: 1, userName: 1 },
      });
      const names = (targets || []).map((t) => (t && (t.fullName || t.userName)) || 'A member');
      content = names.length === 1
        ? `${actorName} removed ${names[0]} from the group`
        : `${actorName} removed ${names.join(', ')} from the group`;
    }
  }

  const body = {
    chatroomId,
    senderId: actorId,
    messageType: 'system',
    content,
    systemEvent,
    status: 'sent',
    readBy: [],
    deliveredTo: [],
  };

  const message = await privateMessageServices.create({ body });
  const senderDetails = actor
    ? {
      _id: actor._id, fullName: actor.fullName, userName: actor.userName, profilePicture: actor.profilePicture,
    }
    : {
      _id: actorId, fullName: null, userName: null, profilePicture: null,
    };

  return { message, senderDetails };
};

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

exports.handlePrivatePollVote = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const { chatroomId, messageId, selectedOptionIds } = data || {};

    if (!userId || !chatroomId || !messageId) throw new Error('Invalid data. chatroomId, messageId and userId are required.');

    const chatroom = await privateChatroomServices.findById({ id: new mongoose.Types.ObjectId(String(chatroomId)) });
    if (!chatroom) throw new Error('Chatroom not found');

    const userObjectId = toObjectId(userId);
    const isParticipant = (chatroom.participants || []).some((p) => p && p.userId && p.userId.toString() === userObjectId.toString());
    if (!isParticipant && !socket.isGod) throw new Error('User is not a participant of this chatroom');

    const message = await privateMessageServices.findOne({
      filter: { _id: new mongoose.Types.ObjectId(String(messageId)), chatroomId: new mongoose.Types.ObjectId(String(chatroomId)), isDeleted: false },
      projection: { _id: 1, messageType: 1, poll: 1 },
    });
    if (!message) throw new Error('Message not found');
    if (String(message.messageType) !== 'poll') throw new Error('Message is not a poll');
    if (!message.poll) throw new Error('Poll data missing');

    const expiresAt = message.poll.expiresAt ? new Date(message.poll.expiresAt) : null;
    if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
      throw new Error('Poll has expired');
    }

    const normalizedSelected = normalizeStringIds(selectedOptionIds);
    const isUnvote = normalizedSelected.length === 0;

    if (!isUnvote) {
      const optionIdSet = new Set(((message.poll.options || [])).map((o) => String(o.optionId)));
      const invalid = normalizedSelected.find((id) => !optionIdSet.has(String(id)));
      if (invalid) throw new Error('Invalid poll option');

      if (!message.poll.allowsMultipleAnswers && normalizedSelected.length !== 1) {
        throw new Error('This poll allows only one option');
      }
    }

    const voteFilter = {
      chatType: 'private',
      messageId: message._id,
      voterId: new mongoose.Types.ObjectId(String(userId)),
    };

    if (isUnvote) {
      await pollVoteServices.findOneAndDelete({ filter: voteFilter });
    } else {
      await pollVoteServices.findOneAndUpsert({
        filter: voteFilter,
        body: {
          $set: {
            chatType: 'private',
            messageId: message._id,
            voterId: voteFilter.voterId,
            chatroomId: new mongoose.Types.ObjectId(String(chatroomId)),
            selectedOptionIds: normalizedSelected,
          },
        },
      });
    }

    const { totalVotes, optionCountMap } = await recomputePollCounts({ chatType: 'private', messageId: message._id });
    const newOptions = (message.poll.options || []).map((o) => ({
      ...o.toObject ? o.toObject() : o,
      voteCount: optionCountMap.get(String(o.optionId)) || 0,
    }));

    const updated = await privateMessageServices.findByIdAndUpdate({
      id: message._id,
      body: { $set: { 'poll.totalVotes': totalVotes, 'poll.options': newOptions } },
    });

    const pollPayload = publicPoll(updated.poll);
    const broadcastPayload = {
      messageId: String(messageId),
      chatroomId: String(chatroomId),
      poll: pollPayload,
    };
    const quizResult = (updated.poll && updated.poll.isQuiz && updated.poll.correctOptionId && !isUnvote)
      ? {
        isQuiz: true,
        isCorrect: !isUnvote && normalizedSelected.includes(String(updated.poll.correctOptionId)),
        correctOptionId: String(updated.poll.correctOptionId),
      }
      : null;
    const ackPayload = {
      ...broadcastPayload,
      myVote: normalizedSelected,
      quizResult,
    };

    socket.to(chatroomId).emit(socketEvents.POLL_UPDATED, broadcastPayload);
    socket.to(chatroomId).emit(socketEvents.POLL_UPDATE_VOTES, broadcastPayload);
    if (updated.poll && !updated.poll.isAnonymous) {
      const voter = await userServices.findOne({
        filter: { _id: new mongoose.Types.ObjectId(String(userId)) },
        projection: {
          _id: 1, userName: 1, fullName: 1, profilePicture: 1,
        },
      });
      const optionIdToTitle = new Map((updated.poll.options || []).map((o) => [String(o.optionId), String(o.text)]));
      const selectedOptionTitles = (normalizedSelected || []).map((oid) => optionIdToTitle.get(String(oid))).filter(Boolean);
      socket.to(chatroomId).emit(socketEvents.POLL_VOTE_SCORE_UPDATED, {
        chatroomId: String(chatroomId),
        messageId: String(messageId),
        voter,
        selectedOptionIds: normalizedSelected,
        selectedOptionTitles,
      });
    }
    socket.emit(isUnvote ? socketEvents.POLL_UNVOTE_SUCCESS : socketEvents.POLL_VOTE_SUCCESS, ackPayload);
  } catch (error) {
    socket.emit(socketEvents.POLL_VOTE_FAILED, { message: error.message });
    socket.emit(socketEvents.POLL_UNVOTE_FAILED, { message: error.message });
  }
};

exports.handlePrivatePollVoteScoreGet = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const { chatroomId, messageId } = data || {};
    if (!userId || !chatroomId || !messageId) throw new Error('Invalid data. chatroomId, messageId and userId are required.');

    const chatroom = await privateChatroomServices.findById({ id: new mongoose.Types.ObjectId(String(chatroomId)) });
    if (!chatroom) throw new Error('Chatroom not found');

    const userObjectId = toObjectId(userId);
    const isParticipant = (chatroom.participants || []).some((p) => p && p.userId && p.userId.toString() === userObjectId.toString());
    if (!isParticipant && !socket.isGod) throw new Error('User is not a participant of this chatroom');

    const message = await privateMessageServices.findOne({
      filter: { _id: new mongoose.Types.ObjectId(String(messageId)), chatroomId: new mongoose.Types.ObjectId(String(chatroomId)), isDeleted: false },
      projection: { _id: 1, messageType: 1, poll: 1 },
    });
    if (!message) throw new Error('Message not found');
    if (String(message.messageType) !== 'poll' || !message.poll) throw new Error('Message is not a poll');
    if (message.poll.isAnonymous) throw new Error('This poll is anonymous');

    const options = (message.poll.options || []).map((o) => (o.toObject ? o.toObject() : o));
    const optionIdToText = new Map(options.map((o) => [String(o.optionId), String(o.text)]));

    const agg = await pollVoteServices.aggregate({
      query: [
        {
          $match: {
            chatType: 'private',
            messageId: new mongoose.Types.ObjectId(String(messageId)),
          },
        },
        { $unwind: '$selectedOptionIds' },
        {
          $lookup: {
            from: 'users',
            localField: 'voterId',
            foreignField: '_id',
            as: 'voter',
          },
        },
        { $unwind: { path: '$voter', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            optionId: '$selectedOptionIds',
            voter: {
              _id: '$voter._id',
              userName: '$voter.userName',
              fullName: '$voter.fullName',
              profilePicture: '$voter.profilePicture',
            },
          },
        },
        {
          $group: {
            _id: '$optionId',
            users: { $push: '$voter' },
          },
        },
      ],
    });

    const voteScore = {};
    options.forEach((o) => {
      voteScore[String(o.text)] = [];
    });
    (agg || []).forEach((row) => {
      const optionId = String(row._id);
      const title = optionIdToText.get(optionId) || optionId;
      const users = (row.users || []).filter((u) => u && u._id);
      voteScore[title] = users;
    });

    socket.emit(socketEvents.POLL_VOTE_SCORE_SUCCESS, {
      chatroomId: String(chatroomId),
      messageId: String(messageId),
      voteScore,
    });
  } catch (error) {
    socket.emit(socketEvents.POLL_VOTE_SCORE_FAILED, { message: error.message });
  }
};

const normalizeObjectIds = (ids = []) => {
  const unique = new Set();
  (Array.isArray(ids) ? ids : []).forEach((id) => {
    if (!id) return;
    const str = String(id).trim();
    if (!str) return;
    if (!mongoose.Types.ObjectId.isValid(str)) return;
    unique.add(str);
  });
  return [...unique].map((id) => new mongoose.Types.ObjectId(id));
};

const getTimezoneOffsetMinutes = (data = {}) => {
  const raw = data.timezoneOffsetMinutes ?? data.tzOffsetMinutes ?? data.tzOffset ?? data.timezoneOffset ?? 0;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : 0;
};

const dayKeyFromDate = (value, timezoneOffsetMinutes) => {
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) return null;
  const shifted = ms - timezoneOffsetMinutes * 60 * 1000;
  const d = new Date(shifted);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const buildMessageTimeline = (messages = [], timezoneOffsetMinutes = 0) => {
  const todayKey = dayKeyFromDate(new Date(), timezoneOffsetMinutes);
  const yesterdayKey = dayKeyFromDate(Date.now() - 24 * 60 * 60 * 1000, timezoneOffsetMinutes);
  const labelFor = (key) => {
    if (key === todayKey) return 'Today';
    if (key === yesterdayKey) return 'Yesterday';
    return key;
  };

  const timeline = [];
  let lastKey = null;
  (messages || []).forEach((msg) => {
    const key = dayKeyFromDate(msg && msg.createdAt, timezoneOffsetMinutes);
    if (key && key !== lastKey) {
      timeline.push({ type: 'date', date: key, label: labelFor(key) });
      lastKey = key;
    }
    timeline.push({ type: 'message', ...(msg || {}) });
  });
  return timeline;
};

const aggregatePrivateChatrooms = async ({
  userObjectId,
  page,
  limit,
  allowedParticipantIds = [],
  allowedChatroomIds = [],
  groupOnly = false,
}) => {
  const skip = Math.max(0, (page - 1) * limit);
  const pipeline = [
    // Match chatrooms where the user is a participant and not deleted for them
    {
      $match: {
        participants: {
          $elemMatch: {
            userId: userObjectId,
            deletedForMe: { $ne: true },
          },
        },
      },
    },
  ];

  if (groupOnly) {
    pipeline.push({
      $match: {
        isGroupChat: true,
      },
    });
  }

  // Hide 1:1 chats until at least one message exists (so recipients
  // don't see empty chats they never initiated).
  if (!groupOnly) {
    pipeline.push(
      {
        $lookup: {
          from: 'privatemessages',
          let: { chatroomId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$chatroomId', '$$chatroomId'] } } },
            { $limit: 1 },
            { $project: { _id: 1 } },
          ],
          as: '_msgCheck',
        },
      },
      {
        $match: {
          $or: [
            { isGroupChat: true },
            { '_msgCheck.0': { $exists: true } },
          ],
        },
      },
    );
  }

  if (allowedParticipantIds.length) {
    pipeline.push({
      $match: {
        'participants.userId': { $in: allowedParticipantIds },
      },
    });
  }

  if (allowedChatroomIds.length) {
    pipeline.push({
      $match: {
        _id: { $in: allowedChatroomIds },
      },
    });
  }

  pipeline.push(
    // Extract per-user clear marker for this chatroom
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
    // Unread count: messages from others that haven't been read, respecting clearedAt + delete-for-me
    {
      $lookup: {
        from: 'privatemessages',
        let: { chatroomId: '$_id', clearedAt: '$_clearedAt', currentUserId: userObjectId },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$chatroomId', '$$chatroomId'] },
                  { $ne: ['$senderId', '$$currentUserId'] },
                  { $not: { $in: ['$$currentUserId', { $ifNull: ['$deletedFor', []] }] } },
                  { $ne: ['$status', 'read'] },
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
          { $count: 'count' },
        ],
        as: '_unreadAgg',
      },
    },
    {
      $addFields: {
        unreadCount: { $ifNull: [{ $arrayElemAt: ['$_unreadAgg.count', 0] }, 0] },
      },
    },
    // Latest message: only the single most recent visible message (uses chatroomId+createdAt index)
    {
      $lookup: {
        from: 'privatemessages',
        let: { chatroomId: '$_id', clearedAt: '$_clearedAt', currentUserId: userObjectId },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$chatroomId', '$$chatroomId'] },
                  { $not: { $in: ['$$currentUserId', { $ifNull: ['$deletedFor', []] }] } },
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
          { $sort: { createdAt: -1 } },
          { $limit: 1 },
        ],
        as: '_latestMsgArr',
      },
    },
    {
      $addFields: {
        isPinned: { $ne: ['$_pinnedAt', null] },
        pinnedAt: '$_pinnedAt',
        lastActivityAt: {
          $ifNull: [
            { $arrayElemAt: ['$_latestMsgArr.createdAt', 0] },
            '$createdAt',
          ],
        },
      },
    },
    { $sort: { pinnedAt: -1, lastActivityAt: -1, _id: -1 } },
    {
      $lookup: {
        from: 'users',
        localField: 'participants.userId',
        foreignField: '_id',
        as: 'participantDetails',
      },
    },
    {
      $addFields: {
        participants: {
          $map: {
            input: '$participants',
            as: 'participant',
            in: {
              $mergeObjects: [
                '$$participant',
                {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: '$participantDetails',
                        cond: { $eq: ['$$this._id', '$$participant.userId'] },
                      },
                    },
                    0,
                  ],
                },
              ],
            },
          },
        },
      },
    },
    {
      $project: {
        _id: 1,
        isGroupChat: 1,
        name: 1,
        groupPicture: 1,
        createdAt: 1,
        lastActivityAt: 1,
        participants: {
          userId: 1,
          fullName: 1,
          userName: 1,
          profilePicture: 1,
          onlineStatus: 1,
        },
        latestMessage: {
          $map: {
            input: '$_latestMsgArr',
            as: 'msg',
            in: {
              _id: '$$msg._id',
              content: '$$msg.content',
              media: '$$msg.media',
              messageType: '$$msg.messageType',
              createdAt: '$$msg.createdAt',
              status: '$$msg.status',
              senderId: '$$msg.senderId',
              senderDetails: {
                $let: {
                  vars: {
                    sender: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$participants',
                            as: 'participant',
                            cond: { $eq: ['$$participant.userId', '$$msg.senderId'] },
                          },
                        },
                        0,
                      ],
                    },
                  },
                  in: {
                    fullName: '$$sender.fullName',
                    userName: '$$sender.userName',
                    profilePicture: '$$sender.profilePicture',
                  },
                },
              },
            },
          },
        },
        unreadCount: 1,
        isPinned: 1,
      },
    },
    {
      $facet: {
        chatrooms: [{ $skip: skip }, { $limit: limit }],
        totalCount: [{ $count: 'count' }],
      },
    },
  );

  const result = await privateChatroomServices.aggregate({ query: pipeline });

  return {
    chatrooms: result[0].chatrooms || [],
    totalChatrooms: result[0].totalCount.length > 0 ? result[0].totalCount[0].count : 0,
  };
};

const emitPrivateChatListUpdate = async (io, recipientUserId, { page = 1, limit = 20 } = {}) => {
  if (!io || !recipientUserId) return;
  const userObjectId = toObjectId(recipientUserId);
  const pageNumber = Math.max(1, parseInt(page, 10) || 1);
  const limitNumber = Math.max(1, parseInt(limit, 10) || 20);
  const { chatrooms, totalChatrooms } = await aggregatePrivateChatrooms({
    userObjectId,
    page: pageNumber,
    limit: limitNumber,
  });
  const totalPages = Math.ceil(totalChatrooms / limitNumber);
  io.to(recipientUserId.toString()).emit(socketEvents.PRIVATE_CHAT_LIST_SUCCESS, {
    metadata: {
      totalChatrooms,
      totalPages,
      page: pageNumber,
      limit: limitNumber,
    },
    chatrooms,
  });
};

exports.getPrivateChatroomList = async (socket, data = {}) => {
  try {
    const { userId } = socket.handshake.query;
    const { page = 1, limit = 20 } = data;
    if (!userId) {
      throw new Error('User ID is required.');
    }

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const limitNumber = Math.max(1, parseInt(limit, 10) || 20);
    const userObjectId = toObjectId(userId);

    const [
      { chatrooms, totalChatrooms },
      { chatrooms: groupChats },
    ] = await Promise.all([
      aggregatePrivateChatrooms({
        userObjectId,
        page: pageNumber,
        limit: limitNumber,
      }),
      aggregatePrivateChatrooms({
        userObjectId,
        page: 1,
        limit: 50,
        groupOnly: true,
      }),
    ]);

    const totalPages = Math.ceil(totalChatrooms / limitNumber);

    const lists = await listServices.find({
      filter: { createdBy: userObjectId },
      sort: { createdAt: -1 },
    });

    socket.emit(socketEvents.PRIVATE_CHAT_LIST_SUCCESS, {
      metadata: {
        totalChatrooms,
        totalPages,
        page: pageNumber,
        limit: limitNumber,
      },
      chatrooms,
      groupChats,
      lists,
    });
  } catch (error) {
    socket.emit(socketEvents.PRIVATE_CHAT_LIST_FAILED, { message: error.message });
  }
};

exports.getGroupList = async (socket, data = {}) => {
  try {
    const { userId } = socket.handshake.query;
    const {
      listId,
      page = 1,
      limit = 20,
    } = data;

    if (!userId) {
      throw new Error('User ID is required.');
    }

    const userObjectId = toObjectId(userId);
    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const limitNumber = Math.max(1, parseInt(limit, 10) || 20);

    // Special virtual list: "groups" => all group chats for this user
    if (listId === 'groups') {
      const { chatrooms, totalChatrooms } = await aggregatePrivateChatrooms({
        userObjectId,
        page: pageNumber,
        limit: limitNumber,
        groupOnly: true,
      });
      const totalPages = Math.ceil(totalChatrooms / limitNumber);

      const lists = await listServices.find({
        filter: { createdBy: userObjectId },
        sort: { createdAt: -1 },
      });

      socket.emit(socketEvents.GROUP_LIST_SUCCESS, {
        metadata: {
          totalChatrooms,
          totalPages,
          page: pageNumber,
          limit: limitNumber,
        },
        chatrooms,
        lists,
        selectedListId: 'groups',
      });
      return;
    }

    if (!listId) {
      throw new Error('List ID is required.');
    }

    const list = await listServices.findOne({ filter: { _id: toObjectId(listId) } });
    if (!list) {
      throw new Error('List not found.');
    }

    const isOwner = list.createdBy?.toString() === userObjectId.toString();
    const isMember = (list.participantIds || []).some(
      (participantId) => participantId.toString() === userObjectId.toString(),
    );
    if (!isOwner && !isMember) {
      throw new Error('List not found.');
    }

    const listChatroomIds = (list.chatroomIds || []).map((chatroomId) => toObjectId(chatroomId));

    const lists = await listServices.find({
      filter: { createdBy: userObjectId },
      sort: { createdAt: -1 },
    });

    if (!listChatroomIds.length) {
      socket.emit(socketEvents.GROUP_LIST_SUCCESS, {
        metadata: {
          totalChatrooms: 0,
          totalPages: 0,
          page: pageNumber,
          limit: limitNumber,
        },
        chatrooms: [],
        lists,
        selectedListId: listId,
      });
      return;
    }

    const { chatrooms, totalChatrooms } = await aggregatePrivateChatrooms({
      userObjectId,
      page: pageNumber,
      limit: limitNumber,
      allowedChatroomIds: listChatroomIds,
    });
    const totalPages = Math.ceil(totalChatrooms / limitNumber);
    // For list-based group chatrooms, return the full chatroom participant list.
    // (Previously this was filtered to list.participantIds, which could hide chatrooms unexpectedly.)
    const filteredChatrooms = chatrooms;

    let latestMessageMap = {};
    if (filteredChatrooms.length) {
      const chatroomIds = filteredChatrooms.map((chatroom) => chatroom._id);
      const latestMessages = await privateMessageServices.aggregate({
        query: [
          {
            $match: {
              chatroomId: { $in: chatroomIds },
            },
          },
          {
            $sort: { createdAt: -1 },
          },
          {
            $group: {
              _id: '$chatroomId',
              latest: { $first: '$$ROOT' },
            },
          },
          {
            $lookup: {
              from: 'users',
              localField: 'latest.senderId',
              foreignField: '_id',
              as: 'sender',
            },
          },
          {
            $set: {
              sender: { $arrayElemAt: ['$sender', 0] },
            },
          },
          {
            $project: {
              _id: 0,
              chatroomId: '$_id',
              message: {
                _id: '$latest._id',
                content: '$latest.content',
                media: '$latest.media',
                createdAt: '$latest.createdAt',
                status: '$latest.status',
                senderId: '$latest.senderId',
                senderDetails: {
                  fullName: '$sender.fullName',
                  userName: '$sender.userName',
                  profilePicture: '$sender.profilePicture',
                },
              },
            },
          },
        ],
      });

      latestMessageMap = latestMessages.reduce((acc, item) => {
        acc[item.chatroomId.toString()] = item.message ? [item.message] : [];
        return acc;
      }, {});
    }

    const chatroomsWithLatest = filteredChatrooms.map((chatroom) => ({
      ...chatroom,
      latestMessage: latestMessageMap[chatroom._id.toString()] || [],
    }));

    socket.emit(socketEvents.GROUP_LIST_SUCCESS, {
      metadata: {
        totalChatrooms,
        totalPages,
        page: pageNumber,
        limit: limitNumber,
      },
      chatrooms: chatroomsWithLatest,
      lists,
      selectedListId: listId,
    });
  } catch (error) {
    socket.emit(socketEvents.GROUP_LIST_FAILED, { message: error.message });
  }
};

exports.createPrivateChat = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const { recipientId } = data;
    if (!userId || !recipientId) {
      throw new Error('Both userId and recipientId are required.');
    }

    let chatroom = await privateChatroomServices.findOne({
      filter: {
        isGroupChat: false,
        participants: {
          $all: [{ $elemMatch: { userId } }, { $elemMatch: { userId: recipientId } }],
        },
      },
    });

    if (chatroom) {
      socket.emit(socketEvents.PRIVATE_CHAT_CREATE_FAILED, {
        message: 'chatroom already exists',
        chatroom,
      });
      return;
    }

    chatroom = await privateChatroomServices.create({
      body: {
        isGroupChat: false,
        participants: [{ userId }, { userId: recipientId }],
      },
    });

    socket.emit(socketEvents.PRIVATE_CHAT_CREATE_SUCCESS, {
      chatroom,
    });

    // Emit a notification to all participants
    const io = socket.server; // Access the socket.io instance
    const participantIds = [userId, recipientId];

    participantIds.forEach((participantId) => {
      io.to(participantId).emit(socketEvents.NEW_PRIVATE_CHAT, {
        chatroom,
      });
    });
  } catch (error) {
    socket.emit(socketEvents.PRIVATE_CHAT_CREATE_FAILED, {
      message: error.message,
    });
  }
};

exports.createPrivateGroupChat = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const { name, participants } = data;

    if (!userId || !name || !Array.isArray(participants) || participants.length === 0) {
      throw new Error('User ID, group name, and participants are required.');
    }

    // Add the creator to the participants if not already included
    const participantIds = [...new Set([userId, ...participants])].map((id) => ({
      userId: id,
    }));

    const participantObjectIds = participantIds.map((p) => toObjectId(p.userId));
    const participantSetKey = participantObjectIds.map((id) => id.toString()).sort().join(',');

    const adminIds = [{ userId }]; // Creator becomes the admin

    const chatroom = await privateChatroomServices.create({
      body: {
        isGroupChat: true,
        name,
        participants: participantIds,
        admins: adminIds,
        moderators: [],
        createdBy: userId,
        participantSetKey,
      },
    });

    socket.emit(socketEvents.GROUP_CHAT_CREATE_SUCCESS, {
      chatroom,
    });

    // Notify all participants about the new group chat
    const io = socket.server; // Access the socket.io instance
    participantIds.forEach(({ userId: participantId }) => {
      io.to(participantId.toString()).emit(socketEvents.NEW_GROUP_CHAT, {
        chatroom,
      });
    });
  } catch (error) {
    socket.emit(socketEvents.GROUP_CHAT_CREATE_FAILED, {
      message: error.message,
    });
  }
};

exports.handleJoinPrivateChat = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const { chatroomId, page = 1, limit = 20 } = data;

    if (!chatroomId || !userId) {
      throw new Error('Invalid data');
    }
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const chatroom = await privateChatroomServices.findById({
      id: chatroomId,
    });

    // console.log(chatroom);

    if (!chatroom) {
      throw new Error('Chatroom not found');
    }

    // Allow join only if user is in participants (active or exited) or in exParticipants (removed)
    const currentParticipant = (chatroom.participants || []).find(
      (p) => p && p.userId && p.userId.toString() === userId.toString(),
    );
    const exEntry = (chatroom.exParticipants || [])
      .filter((e) => e && e.userId && e.userId.toString() === userId.toString())
      .sort((a, b) => (new Date(b.exitedAt || 0) - new Date(a.exitedAt || 0)))[0];
    const isInParticipants = !!currentParticipant;
    const isInExParticipants = !!exEntry;
    if (!isInParticipants && !isInExParticipants) {
      throw new Error('You are not a participant of this chatroom.');
    }

    const isPresent = isInParticipants ? (currentParticipant.isPresent !== false) : false;
    const exitReason = !isPresent && exEntry && exEntry.reason ? exEntry.reason : null;
    const exitedAt = !isPresent && exEntry && exEntry.exitedAt ? exEntry.exitedAt : null;
    const removedById = !isPresent && exEntry && exEntry.removedBy ? exEntry.removedBy : null;

    // Resolve admin name if user was removed
    let removedByUser = null;
    if (removedById) {
      const admin = await userServices.findOne({
        filter: { _id: new mongoose.Types.ObjectId(String(removedById)) },
        projection: {
          _id: 1, fullName: 1, userName: 1, profilePicture: 1,
        },
      });
      if (admin) {
        removedByUser = {
          _id: admin._id,
          fullName: admin.fullName || null,
          userName: admin.userName || null,
          profilePicture: admin.profilePicture || null,
        };
      }
    }

    socket.join(chatroomId);

    /* eslint-disable no-param-reassign */
    socket.privateChatroom = chatroom;
    /* eslint-enable no-param-reassign */

    // Apply per-user clear marker (hide messages created at/before clearedAt)
    const clearedAt = currentParticipant && currentParticipant.clearedAt ? currentParticipant.clearedAt : null;

    // When user opens/joins the chat, mark all messages in this room as read for them (fixes stale unread badge per UNREAD_COUNTS_BACKEND_SPEC)
    if (isPresent) {
      const unreadFilter = {
        chatroomId: new mongoose.Types.ObjectId(chatroomId),
        senderId: { $ne: userObjectId },
        'readBy.userId': { $ne: userObjectId },
        messageType: { $ne: 'system' },
        isDeleted: { $ne: true },
        deletedFor: { $ne: userObjectId },
      };
      if (clearedAt) {
        unreadFilter.createdAt = { $gt: clearedAt };
      }
      const messagesToMark = await privateMessageServices.find({ filter: unreadFilter });
      const participantCount = (chatroom.participants || []).length;
      await Promise.all(messagesToMark.map(async (message) => {
        await privateMessageServices.findByIdAndUpdate({
          id: message._id,
          body: {
            $addToSet: {
              readBy: { userId: userObjectId, readAt: new Date() },
              deliveredTo: { userId: userObjectId, deliveredAt: new Date() },
            },
          },
        });
        const newReadCount = (message.readBy || []).length + 1;
        if (participantCount >= 2 && newReadCount >= participantCount - 1) {
          await privateMessageServices.findByIdAndUpdate({
            id: message._id,
            body: { status: 'read' },
          });
        }
      }));
      if (messagesToMark.length > 0) {
        pushUnreadCountsUpdate(userId).catch(() => {});
      }
    }

    const user = await userServices.findById({ id: userId });

    // Build exitInfo for non-present users (frontend uses this for system message + keyboard restriction)
    const exitInfo = !isPresent ? {
      reason: exitReason,
      exitedAt,
      removedByUser: removedByUser || undefined,
      systemMessage: exitReason === 'removed'
        ? `You were removed by ${(removedByUser && (removedByUser.fullName || removedByUser.userName)) || 'an admin'}`
        : 'You left the chat',
    } : undefined;

    socket.to(chatroomId).emit(socketEvents.USER_JOINED_PRIVATE_CHAT, {
      user: {
        _id: userId,
        fullName: user.fullName,
        username: user.username,
        profilePicture: user.profilePicture,
      },
      message: `User ${userId} has joined the chatroom.`,
    });
    socket.emit(socketEvents.USER_JOINED_PRIVATE_CHAT, {
      message: 'You have joined the chatroom.',
      isPresent,
      exitReason: exitReason || undefined,
      exitInfo,
    });
    // For users who left or were removed: only show messages up to their exitedAt
    const messageTimeCap = !isPresent && exitedAt ? { createdAt: { $lte: new Date(exitedAt) } } : {};
    const aggregationPipeline = [
      {
        $match: {
          chatroomId: new mongoose.Types.ObjectId(chatroomId),
          ...(clearedAt ? { createdAt: { $gt: clearedAt } } : {}),
          ...messageTimeCap,
          deletedFor: { $ne: userObjectId },
          $or: [
            { sentWhileBlocked: { $ne: true } },
            { senderId: userObjectId, sentWhileBlocked: true },
          ],
        },
      },
      {
        $facet: {
          messages: [
            { $sort: { createdAt: -1 } },
            { $skip: (page - 1) * limit },
            { $limit: parseInt(limit, 10) },
            {
              $lookup: {
                from: 'users',
                let: { senderUserId: '$senderId' },
                pipeline: [
                  { $match: { $expr: { $eq: ['$_id', '$$senderUserId'] } } },
                  {
                    $project: {
                      _id: 1, userName: 1, fullName: 1, profilePicture: 1,
                    },
                  },
                ],
                as: 'senderDetails',
              },
            },
            { $unwind: { path: '$senderDetails', preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: 'privatemessages',
                localField: 'parentMessageId',
                foreignField: '_id',
                as: 'parentMessage',
              },
            },
            { $unwind: { path: '$parentMessage', preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: 'users',
                let: { parentSenderId: '$parentMessage.senderId' },
                pipeline: [
                  { $match: { $expr: { $eq: ['$_id', '$$parentSenderId'] } } },
                  {
                    $project: {
                      _id: 1, userName: 1, fullName: 1, profilePicture: 1,
                    },
                  },
                ],
                as: 'parentMessageSenderDetails',
              },
            },
            {
              $unwind: {
                path: '$parentMessageSenderDetails',
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $addFields: {
                emojiCounts: {
                  $arrayToObject: {
                    $map: {
                      input: { $setUnion: '$reactions.emoji' },
                      as: 'emoji',
                      in: {
                        k: '$$emoji',
                        v: {
                          $size: {
                            $filter: {
                              input: '$reactions',
                              cond: { $eq: ['$$this.emoji', '$$emoji'] },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                currentUserReaction: {
                  $filter: {
                    input: '$reactions',
                    as: 'reaction',
                    cond: { $eq: ['$$reaction.userId', userObjectId] },
                  },
                },
              },
            },
            {
              $addFields: {
                reactedByCurrentUser: { $gt: [{ $size: '$currentUserReaction' }, 0] },
                currentUserEmoji: {
                  $cond: {
                    if: { $gt: [{ $size: '$currentUserReaction' }, 0] },
                    then: { $arrayElemAt: ['$currentUserReaction.emoji', 0] },
                    else: null,
                  },
                },
              },
            },
            // Poll: include current user's selection (WhatsApp-style)
            {
              $lookup: {
                from: 'poll-votes',
                let: { messageId: '$_id' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ['$chatType', 'private'] },
                          { $eq: ['$messageId', '$$messageId'] },
                          { $eq: ['$voterId', userObjectId] },
                        ],
                      },
                    },
                  },
                  { $project: { selectedOptionIds: 1 } },
                ],
                as: '_myPollVote',
              },
            },
            {
              $addFields: {
                myPollVote: { $ifNull: [{ $arrayElemAt: ['$_myPollVote.selectedOptionIds', 0] }, []] },
              },
            },
            {
              $project: {
                _id: 1,
                senderId: 1,
                isDeleted: 1,
                deletedBy: 1,
                deletedAt: 1,
                content: 1,
                messageType: 1,
                systemEvent: 1,
                location: 1,
                poll: 1,
                sharedContent: 1,
                image: 1,
                media: 1,
                mediaAssetId: 1,
                mediaModeration: 1,
                storyReply: 1,
                createdAt: 1,
                updatedAt: 1,
                sentWhileBlocked: 1,
                status: 1,
                deliveredTo: 1,
                readBy: 1,
                isEdited: 1,
                editedAt: 1,
                isForwarded: 1,
                isMultipleTimesForwarded: 1,
                senderDetails: {
                  _id: '$senderDetails._id',
                  userName: '$senderDetails.userName',
                  fullName: '$senderDetails.fullName',
                  profilePicture: '$senderDetails.profilePicture',
                },
                emojiCounts: 1,
                reactedByCurrentUser: 1,
                currentUserEmoji: 1,
                myPollVote: 1,
                parentMessage: {
                  _id: '$parentMessage._id',
                  senderId: '$parentMessage.senderId',
                  content: '$parentMessage.content',
                  messageType: '$parentMessage.messageType',
                  location: '$parentMessage.location',
                  poll: '$parentMessage.poll',
                  media: '$parentMessage.media',
                  createdAt: '$parentMessage.createdAt',
                },
                parentMessageSenderDetails: {
                  _id: '$parentMessageSenderDetails._id',
                  userName: '$parentMessageSenderDetails.userName',
                  fullName: '$parentMessageSenderDetails.fullName',
                  profilePicture: '$parentMessageSenderDetails.profilePicture',
                },
              },
            },
            // Do not expose quiz correctOptionId in history payloads
            { $unset: ['poll.correctOptionId', 'parentMessage.poll.correctOptionId'] },
          ],
          totalCount: [{ $count: 'count' }],
        },
      },
    ];

    const result = await privateMessageServices.aggregate({ query: aggregationPipeline });
    const rawMessages = result[0].messages || [];
    const totalMessages = result[0].totalCount.length > 0 ? result[0].totalCount[0].count : 0;
    const totalPages = Math.ceil(totalMessages / limit);

    // Post-process: ensure each message has correct senderDetails from its own senderId
    const senderIds = [...new Set(rawMessages.map((m) => m.senderId).filter(Boolean))];
    const parentSenderIds = [...new Set(
      rawMessages
        .filter((m) => m.parentMessage && m.parentMessage.senderId)
        .map((m) => m.parentMessage.senderId),
    )];
    const allUserIds = [...new Set([...senderIds, ...parentSenderIds].map((id) => id.toString()))];

    let userMap = {};
    if (allUserIds.length > 0) {
      const users = await userServices.find({
        filter: { _id: { $in: allUserIds.map((id) => new mongoose.Types.ObjectId(id)) } },
        projection: {
          _id: 1, userName: 1, fullName: 1, profilePicture: 1,
        },
      });
      userMap = (users || []).reduce((acc, u) => {
        acc[u._id.toString()] = {
          _id: u._id,
          userName: u.userName,
          fullName: u.fullName,
          profilePicture: u.profilePicture,
        };
        return acc;
      }, {});
    }

    const messages = rawMessages.map((msg) => {
      const senderIdStr = msg.senderId ? msg.senderId.toString() : null;
      const senderUser = senderIdStr ? userMap[senderIdStr] : null;
      const updatedMsg = {
        ...msg,
        senderDetails: senderUser || msg.senderDetails || {
          _id: msg.senderId, userName: null, fullName: null, profilePicture: null,
        },
      };
      // Also fix parentMessageSenderDetails if present
      if (msg.parentMessage && msg.parentMessage.senderId) {
        const parentSenderIdStr = msg.parentMessage.senderId.toString();
        const parentSenderUser = userMap[parentSenderIdStr];
        if (parentSenderUser) {
          updatedMsg.parentMessageSenderDetails = parentSenderUser;
        }
      }
      return updatedMsg;
    });

    const timeline = buildMessageTimeline(messages, getTimezoneOffsetMinutes(data));

    // For non-present users on page 1, append a system message at the end of the timeline
    if (!isPresent && exitInfo && page <= 1) {
      timeline.push({
        type: 'system',
        messageType: 'system',
        content: exitInfo.systemMessage,
        reason: exitReason,
        removedByUser: removedByUser || undefined,
        createdAt: exitedAt,
      });
    }

    // Frontend: use isPresent to enable/restrict keyboard; use exitReason ('left'|'removed') or exitInfo for UI copy
    socket.emit(socketEvents.PRIVATE_MESSAGE_HISTORY, {
      chatroomId,
      isPresent,
      exitReason: exitReason || undefined,
      exitInfo,
      metadata: {
        totalMessages,
        totalPages,
        page,
        limit,
      },
      messages,
      timeline,
    });
  } catch (error) {
    socket.emit(socketEvents.PRIVATE_CHAT_JOIN_FAILED, {
      message: error.message,
    });
  }
};

exports.handleSendPrivateMessage = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const {
      chatroomId, content, media, mediaAssetId, parentMessageId, messageType, location, isAudio, poll,
      sharedContent, forward, isMultipleTimesForwarded,
    } = data;

    if (!chatroomId || !userId) {
      throw new Error('Invalid data. Either hashtagId or userId is missing.');
    }

    const normalizedType = inferMessageType({ messageType, isAudio, media });
    // For poll messages we can derive `content` from poll.question, so don't fail early.
    // For sharedcontent messages, content is optional (fallback text).
    if (normalizedType !== 'poll' && normalizedType !== 'sharedcontent' && !content && !media) {
      throw new Error('Either one of content or media is required.');
    }
    const chatroom = await privateChatroomServices.findById({
      id: new mongoose.Types.ObjectId(chatroomId),
    });
    if (!chatroom) {
      throw new Error('Chatroom is missing.');
    }
    const senderParticipant = (chatroom.participants || []).find(
      (p) => p && p.userId && p.userId.toString() === userId.toString(),
    );
    if (!senderParticipant || senderParticipant.isPresent === false) {
      throw new Error('You cannot send messages in this chat. You have left or were removed.');
    }
    const body = {
      senderId: userId,
      chatroomId,
      status: 'sent',
      readBy: [],
      deliveredTo: [],
      isForwarded: !!forward,
      isMultipleTimesForwarded: !!(forward && isMultipleTimesForwarded),
    };

    if (chatroom.isBlocked) {
      body.sentWhileBlocked = true;
    }

    body.messageType = normalizedType;
    if (isAudio) {
      body.isAudio = isAudio;
    }

    if (normalizedType === 'poll') {
      if (isAudio) throw new Error('isAudio must be false for poll messages');
      if (media && String(media).trim()) throw new Error('media must be empty for poll messages');
      body.poll = validateAndNormalizePoll(poll);
      body.content = (typeof content === 'string' && content.trim()) ? content.trim() : body.poll.question;
      body.location = null;
    } else if (content) {
      body.content = content;
    }

    if (media) {
      body.media = media;
    }

    if (normalizedType === 'location') {
      if (isAudio) throw new Error('isAudio must be false for location messages');
      if (media && String(media).trim()) throw new Error('media must be empty for location messages');
      body.location = validateAndNormalizeLocation(location);
    } else {
      body.location = null;
    }
    if (normalizedType !== 'poll') {
      body.poll = null;
    }

    // Handle sharedcontent message type (Instagram-style shared hashtag/post cards)
    if (normalizedType === 'sharedcontent') {
      if (!sharedContent || typeof sharedContent !== 'object') {
        throw new Error('sharedContent object is required for sharedContent messages');
      }
      body.sharedContent = sharedContent;
    } else {
      body.sharedContent = null;
    }

    // Media moderation (image/video only) - do not block send; we store moderation state and update later.
    if (media || mediaAssetId) {
      const mediaTypeFromUrl = () => {
        const url = typeof media === 'string' ? media.toLowerCase() : '';
        const isVideo = /\.(mp4|mov|m4v|webm|mkv|avi|3gp)(\?|$)/.test(url);
        return isVideo ? 'video' : 'image';
      };

      if (mediaAssetId) {
        body.mediaAssetId = new mongoose.Types.ObjectId(String(mediaAssetId));
        body.mediaModeration = { status: 'pending', isBanned: false, provider: 'rekognition' };
      } else {
        const parsed = parseS3Url(media);
        if (parsed) {
          const asset = await mediaModerationService.ensureAssetForS3Object({
            ownerUserId: userId,
            bucket: parsed.bucket,
            key: parsed.key,
            url: media,
            mediaType: mediaTypeFromUrl(),
          });
          body.mediaAssetId = asset && asset._id ? asset._id : null;
          body.mediaModeration = asset && asset.moderation
            ? {
              status: asset.moderation.status || 'pending',
              isBanned: !!(asset.moderation.ban && asset.moderation.ban.isBanned),
              provider: asset.moderation.provider || 'rekognition',
              checkedAt: asset.moderation.checkedAt || null,
              primaryReason: (asset.moderation.ban && asset.moderation.ban.primaryReason) || null,
              reasons: (asset.moderation.ban && asset.moderation.ban.reasons) || [],
            }
            : { status: 'pending', isBanned: false, provider: 'rekognition' };
        } else {
          body.mediaModeration = { status: 'unknown', isBanned: false, provider: 'rekognition' };
        }
      }
    }

    let parentMessageSenderDetails = null;
    let parentMessage = null;

    if (parentMessageId) {
      parentMessage = await privateMessageServices.findOne({
        filter: { _id: parentMessageId },
        populate: { path: 'senderId', select: 'userName fullName' },
      });

      if (!parentMessage) {
        throw new Error('Parent message not found');
      }

      body.parentMessageId = parentMessageId;
      body.parentMessageContent = parentMessage.content;
      body.parentMessageMedia = parentMessage.media;
      body.parentMessageSenderId = parentMessage.senderId;

      // Capture sender details of the parent message
      parentMessageSenderDetails = {
        userName: parentMessage.senderId.userName,
        fullName: parentMessage.senderId.fullName,
        profilePicture: parentMessage.senderId.profilePicture,
      };
    }

    const message = await privateMessageServices.create({
      body,
    });

    // Populate sender details from the users collection
    const senderDetails = await userServices.findOne({
      filter: { _id: userId },
      projection: {
        _id: 1,
        userName: 1,
        fullName: 1,
        profilePicture: 1,
      },
    });

    const { _id: id } = message;

    // Combine message and sender details
    const newMessage = {
      _id: id,
      chatroomId: message.chatroomId,
      senderDetails,
      content: message.content ? message.content : null,
      messageType: message.messageType || 'text',
      location: message.location || null,
      poll: message.poll ? publicPoll(message.poll) : null,
      sharedContent: message.sharedContent || null,
      media: message.media ? message.media : null,
      mediaAssetId: message.mediaAssetId || null,
      mediaModeration: message.mediaModeration || null,
      storyReply: message.storyReply || null,
      status: message.status || 'sent',
      deliveredTo: message.deliveredTo || [],
      readBy: message.readBy || [],
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      isForwarded: !!message.isForwarded,
      isMultipleTimesForwarded: !!message.isMultipleTimesForwarded,
    };

    if (message.parentMessageId) {
      const parentMessageDetails = {
        parentMessageId: message.parentMessageId,
        parentMessageContent: parentMessage.content,
        parentMessageMedia: parentMessage.media,
        parentMessageSenderId: parentMessage.senderId,
        senderDetails: parentMessageSenderDetails,
      };

      newMessage.parentMessageDetails = parentMessageDetails;
    }
    if (!chatroom.isBlocked) {
      socket.to(chatroomId).emit(socketEvents.NEW_PRIVATE_MESSAGE, {
        newMessage,
      });
    }

    // Emit success with 'sent' status (single tick)
    socket.emit(socketEvents.SEND_PRIVATE_MESSAGE_SUCCESS, {
      message: 'Message sent successfully.',
      newMessage,
      status: 'sent',
    });

    // Get chatroom participants and determine 1:1 vs group
    const chatRoomData = await privateChatroomServices.findById({ id: chatroomId });
    const { participants } = chatRoomData;
    const isGroupChat = !!chatroom.isGroupChat;
    const messageContent = (message.content || '').trim();
    const io = socket.server;

    const getNotificationBody = () => {
      if (newMessage.content) return 'Sent a message';
      const url = typeof newMessage.media === 'string' ? newMessage.media.toLowerCase() : '';
      const isVideo = /\.(mp4|mov|m4v|webm|mkv|avi|3gp)(\?|$)/.test(url);
      return isVideo ? 'Sent a video' : 'Sent a photo';
    };
    const notifBody = getNotificationBody();
    const senderName = (senderDetails && (senderDetails.fullName || senderDetails.userName)) || 'Someone';
    const isSystemMessage = normalizedType === 'system';

    if (isGroupChat && contentIncludesEveryoneMention(messageContent)) {
      // Group chat with @everyone: notify all participants (except sender) with in-app + push
      const now = new Date();
      const otherParticipants = (participants || []).filter((p) => p && p.userId && p.userId.toString() !== userId.toString());
      const unmutedRecipients = otherParticipants.filter((p) => {
        if (p.notificationMutePermanent) return false;
        if (p.notificationMutedUntil && new Date(p.notificationMutedUntil).getTime() > now.getTime()) return false;
        return true;
      });
      const recipientIds = unmutedRecipients.map((p) => p.userId);

      if (recipientIds.length > 0) {
        const notifSummary = `${senderName}: ${message.content || notifBody}`;
        await Promise.allSettled(
          recipientIds.map((rid) => notificationService.create({
            body: {
              userId: rid,
              senderId: new mongoose.Types.ObjectId(userId),
              category: 'chats',
              type: 'update',
              summary: notifSummary,
              meta: {
                kind: 'private_group_mention_everyone',
                privateChatroomId: chatroomId,
                chatroomId,
                messageId: message._id,
                messagePreview: message.content || notifBody,
              },
            },
          })),
        );

        if (!isSystemMessage) {
          const recipientUsers = await userServices.find({
            filter: { _id: { $in: recipientIds } },
            projection: { _id: 1, fcmToken: 1 },
          });

          await Promise.allSettled(
            (recipientUsers || [])
              .filter((u) => u && u.fcmToken)
              .map(async (u) => {
                const canReceive = await notificationSettingsServices
                  .canReceivePrivateChatNotification({ userId: u._id });
                if (!canReceive) return { userId: u._id, success: false };
                return pushNotificationService.sendPrivateMessageNotification({
                  fcmToken: u.fcmToken,
                  title: chatroom.name ? chatroom.name : senderName,
                  body: `${senderName}: ${message.content || notifBody}`,
                  type: 'group_message',
                  data: {
                    chatroomId: String(chatroomId),
                    chatName: chatroom.name || '',
                    chatProfilePicture: chatroom.groupPicture || '',
                    isGroupChat: 'true',
                    senderId: String(userId),
                    messageId: String(message._id),
                  },
                }).then((res) => ({ userId: u._id, success: res.success }));
              }),
          );
        }
      }

      await Promise.all(
        otherParticipants
          .map((p) => (p.userId && p.userId.toString()) || null)
          .filter(Boolean)
          .map((uid) => emitPrivateChatListUpdate(io, uid, { page: 1, limit: 20 })),
      );
      await emitPrivateChatListUpdate(io, userId, { page: 1, limit: 20 });
      pushUnreadCountsUpdateToUsers(
        otherParticipants.map((p) => p.userId).filter(Boolean),
      ).catch(() => {});
    } else if (!isGroupChat) {
      // One-to-one chat: single recipient, send push and update chat list (no @everyone needed)
      const recipientParticipant = (participants || []).find((p) => p.userId.toString() !== userId.toString());
      if (recipientParticipant) {
        const receivingUser = await userServices.findById({ id: recipientParticipant.userId });
        const now = new Date();
        const recipientIsMuted = !!(
          recipientParticipant.notificationMutePermanent
          || (recipientParticipant.notificationMutedUntil && new Date(recipientParticipant.notificationMutedUntil).getTime() > now.getTime())
        );
        const canReceivePrivateNotification = await notificationSettingsServices
          .canReceivePrivateChatNotification({ userId: recipientParticipant.userId });

        if (!isSystemMessage && !recipientIsMuted && canReceivePrivateNotification && receivingUser && receivingUser.fcmToken) {
          const pushResult = await pushNotificationService.sendPrivateMessageNotification({
            fcmToken: receivingUser.fcmToken,
            title: senderName,
            body: newMessage.content || notifBody,
            type: 'private_message',
            data: {
              chatroomId: String(chatroomId),
              chatName: senderName,
              chatProfilePicture: (senderDetails && senderDetails.profilePicture) || '',
              isGroupChat: 'false',
              senderId: String(userId),
              messageId: String(message._id),
            },
          });

          if (pushResult.success) {
            await privateMessageServices.findByIdAndUpdate({
              id: message._id,
              body: {
                status: 'delivered',
                $addToSet: {
                  deliveredTo: {
                    userId: recipientParticipant.userId,
                    deliveredAt: new Date(),
                  },
                },
              },
            });
            socket.emit(socketEvents.MESSAGE_DELIVERED_UPDATE, {
              messageId: message._id,
              chatroomId,
              status: 'delivered',
              deliveredTo: [{
                userId: recipientParticipant.userId,
                deliveredAt: new Date(),
              }],
            });
          }
        }
        const recipientUserId = recipientParticipant.userId.toString();
        await emitPrivateChatListUpdate(io, recipientUserId, { page: 1, limit: 20 });
        pushUnreadCountsUpdate(recipientUserId).catch(() => {});
      }
      await emitPrivateChatListUpdate(io, userId, { page: 1, limit: 20 });
    } else {
      // Group chat without @everyone: in-app + push to other participants (respect mute and settings)
      const otherParticipants = (participants || []).filter((p) => p && p.userId && p.userId.toString() !== userId.toString());
      const now = new Date();
      const unmutedRecipients = otherParticipants.filter((p) => {
        if (p.notificationMutePermanent) return false;
        if (p.notificationMutedUntil && new Date(p.notificationMutedUntil).getTime() > now.getTime()) return false;
        return true;
      });
      const recipientIds = unmutedRecipients.map((p) => p.userId);

      if (recipientIds.length > 0) {
        const notifSummary = `${senderName}: ${message.content || notifBody}`;
        await Promise.allSettled(
          recipientIds.map((rid) => notificationService.create({
            body: {
              userId: rid,
              senderId: new mongoose.Types.ObjectId(userId),
              category: 'chats',
              type: 'update',
              summary: notifSummary,
              meta: {
                kind: 'private_group_message',
                privateChatroomId: chatroomId,
                chatroomId,
                messageId: message._id,
                messagePreview: message.content || notifBody,
              },
            },
          })),
        );

        if (!isSystemMessage) {
          const recipientUsers = await userServices.find({
            filter: { _id: { $in: recipientIds } },
            projection: { _id: 1, fcmToken: 1 },
          });

          await Promise.allSettled(
            (recipientUsers || [])
              .filter((u) => u && u.fcmToken)
              .map(async (u) => {
                const canReceive = await notificationSettingsServices
                  .canReceivePrivateChatNotification({ userId: u._id });
                if (!canReceive) return { userId: u._id, success: false };
                return pushNotificationService.sendPrivateMessageNotification({
                  fcmToken: u.fcmToken,
                  title: chatroom.name ? chatroom.name : senderName,
                  body: `${senderName}: ${message.content || notifBody}`,
                  type: 'group_message',
                  data: {
                    chatroomId: String(chatroomId),
                    chatName: chatroom.name || '',
                    chatProfilePicture: chatroom.groupPicture || '',
                    isGroupChat: 'true',
                    senderId: String(userId),
                    messageId: String(message._id),
                  },
                }).then((res) => ({ userId: u._id, success: res.success }));
              }),
          );
        }
      }

      await Promise.all(
        otherParticipants
          .map((p) => (p.userId && p.userId.toString()) || null)
          .filter(Boolean)
          .map((uid) => emitPrivateChatListUpdate(io, uid, { page: 1, limit: 20 })),
      );
      await emitPrivateChatListUpdate(io, userId, { page: 1, limit: 20 });
      pushUnreadCountsUpdateToUsers(
        otherParticipants.map((p) => p.userId).filter(Boolean),
      ).catch(() => {});
    }
  } catch (error) {
    socket.emit(socketEvents.SEND_PRIVATE_MESSAGE_FAILED, {
      message: error.message,
    });
  }
};

exports.handleSendStoryReply = async (socket, data = {}) => {
  try {
    const { userId } = socket.handshake.query;
    const {
      storyId, content, media, mediaAssetId,
    } = data || {};

    if (!userId || !storyId) {
      throw new Error('Invalid data. Either storyId or userId is missing.');
    }

    if (!content && !media) {
      throw new Error('Either one of content or media is required.');
    }

    const storyObjectId = toObjectId(storyId);
    const story = await storiesServices.findById({ id: storyObjectId });
    if (!story || !story.isActive) {
      throw new Error('Story not found.');
    }

    if (story.storyFrom !== 'user' || !story.userId) {
      throw new Error('Cannot reply to this story.');
    }

    const storyOwnerId = story.userId.toString();
    if (storyOwnerId.toString() === userId.toString()) {
      throw new Error('You cannot reply to your own story.');
    }

    let chatroom = await privateChatroomServices.findOne({
      filter: {
        isGroupChat: false,
        participants: {
          $all: [
            { $elemMatch: { userId: toObjectId(userId) } },
            { $elemMatch: { userId: toObjectId(storyOwnerId) } },
          ],
        },
      },
    });

    const io = socket.server;
    let createdChatroom = false;

    if (!chatroom) {
      createdChatroom = true;
      chatroom = await privateChatroomServices.create({
        body: {
          isGroupChat: false,
          participants: [{ userId }, { userId: storyOwnerId }],
        },
      });

      // Notify both users that a new 1:1 chat exists (same behavior as createPrivateChat).
      [userId, storyOwnerId].forEach((participantId) => {
        io.to(participantId.toString()).emit(socketEvents.NEW_PRIVATE_CHAT, { chatroom });
      });
    }

    const chatroomId = chatroom._id.toString();

    const body = {
      senderId: userId,
      chatroomId,
      status: 'sent',
      readBy: [],
      deliveredTo: [],
      storyReply: {
        storyId: storyObjectId,
        storyOwnerId: toObjectId(storyOwnerId),
        storyUrl: story.storyUrl || null,
        thumbnailUrl: story.thumbnailUrl || null,
        storyType: story.type || null,
      },
    };

    if (chatroom.isBlocked) {
      body.sentWhileBlocked = true;
    }

    if (content) body.content = content;
    if (media) body.media = media;

    // Media moderation (image/video only) - do not block send; we store moderation state and update later.
    if (media || mediaAssetId) {
      const mediaTypeFromUrl = () => {
        const url = typeof media === 'string' ? media.toLowerCase() : '';
        const isVideo = /\.(mp4|mov|m4v|webm|mkv|avi|3gp)(\?|$)/.test(url);
        return isVideo ? 'video' : 'image';
      };

      if (mediaAssetId) {
        body.mediaAssetId = new mongoose.Types.ObjectId(String(mediaAssetId));
        body.mediaModeration = { status: 'pending', isBanned: false, provider: 'rekognition' };
      } else {
        const parsed = parseS3Url(media);
        if (parsed) {
          const asset = await mediaModerationService.ensureAssetForS3Object({
            ownerUserId: userId,
            bucket: parsed.bucket,
            key: parsed.key,
            url: media,
            mediaType: mediaTypeFromUrl(),
          });
          body.mediaAssetId = asset && asset._id ? asset._id : null;
          body.mediaModeration = asset && asset.moderation
            ? {
              status: asset.moderation.status || 'pending',
              isBanned: !!(asset.moderation.ban && asset.moderation.ban.isBanned),
              provider: asset.moderation.provider || 'rekognition',
              checkedAt: asset.moderation.checkedAt || null,
              primaryReason: (asset.moderation.ban && asset.moderation.ban.primaryReason) || null,
              reasons: (asset.moderation.ban && asset.moderation.ban.reasons) || [],
            }
            : { status: 'pending', isBanned: false, provider: 'rekognition' };
        } else {
          body.mediaModeration = { status: 'unknown', isBanned: false, provider: 'rekognition' };
        }
      }
    }

    const message = await privateMessageServices.create({ body });

    const senderDetails = await userServices.findOne({
      filter: { _id: userId },
      projection: {
        _id: 1,
        userName: 1,
        fullName: 1,
        profilePicture: 1,
      },
    });

    const newMessage = {
      _id: message._id,
      chatroomId: message.chatroomId,
      senderDetails,
      content: message.content ? message.content : null,
      messageType: message.messageType || 'text',
      location: message.location || null,
      poll: message.poll ? publicPoll(message.poll) : null,
      sharedContent: message.sharedContent || null,
      media: message.media ? message.media : null,
      mediaAssetId: message.mediaAssetId || null,
      mediaModeration: message.mediaModeration || null,
      storyReply: message.storyReply || null,
      status: message.status || 'sent',
      deliveredTo: message.deliveredTo || [],
      readBy: message.readBy || [],
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };

    // Real-time message event for chat participants who have joined the chatroom room.
    if (!chatroom.isBlocked) {
      socket.to(chatroomId).emit(socketEvents.NEW_PRIVATE_MESSAGE, { newMessage });
    }

    // Ack to sender (includes chatroom so client can navigate to it immediately)
    socket.emit(socketEvents.SEND_STORY_REPLY_SUCCESS, {
      message: 'Story reply sent successfully.',
      chatroom,
      createdChatroom,
      newMessage,
      status: 'sent',
    });

    // Push notification (best effort)
    const receivingUser = await userServices.findById({ id: storyOwnerId });
    const sendingUser = await userServices.findById({ id: userId });

    const now = new Date();
    const storyOwnerParticipant = (chatroom && chatroom.participants)
      ? chatroom.participants.find((p) => p && p.userId && p.userId.toString() === String(storyOwnerId))
      : null;
    const recipientIsMuted = !!(
      storyOwnerParticipant
      && (
        storyOwnerParticipant.notificationMutePermanent
        || (storyOwnerParticipant.notificationMutedUntil && new Date(storyOwnerParticipant.notificationMutedUntil).getTime() > now.getTime())
      )
    );

    // Check global notification settings for private chats (story replies are private messages)
    const canReceivePrivateNotification = await notificationSettingsServices
      .canReceivePrivateChatNotification({ userId: storyOwnerId });

    if (!recipientIsMuted && canReceivePrivateNotification && receivingUser && receivingUser.fcmToken) {
      const notifBody = newMessage.content || 'Replied to your story';
      const pushResult = await pushNotificationService.sendPrivateMessageNotification({
        fcmToken: receivingUser.fcmToken,
        title: sendingUser.fullName,
        body: notifBody,
        type: 'private_message',
        data: {
          chatroomId: String(chatroomId),
          chatName: (sendingUser && sendingUser.fullName) || '',
          chatProfilePicture: (sendingUser && sendingUser.profilePicture) || '',
          isGroupChat: 'false',
          senderId: String(userId),
          messageId: String(message._id),
        },
      });

      if (pushResult.success) {
        await privateMessageServices.findByIdAndUpdate({
          id: message._id,
          body: {
            status: 'delivered',
            $addToSet: {
              deliveredTo: {
                userId: storyOwnerId,
                deliveredAt: new Date(),
              },
            },
          },
        });

        socket.emit(socketEvents.MESSAGE_DELIVERED_UPDATE, {
          messageId: message._id,
          chatroomId,
          status: 'delivered',
          deliveredTo: [{
            userId: storyOwnerId,
            deliveredAt: new Date(),
          }],
        });
      }
    }

    // Update recipient's chat list (so the thread appears / bumps to top)
    await emitPrivateChatListUpdate(io, storyOwnerId, { page: 1, limit: 20 });
  } catch (error) {
    socket.emit(socketEvents.SEND_STORY_REPLY_FAILED, { message: error.message });
  }
};

exports.handleEditPrivateMessage = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const {
      messageId, content, media, chatroomId,
    } = data;

    // Validation
    if (!messageId || !userId || !chatroomId) {
      throw new Error('Invalid data. messageId, userId, or chatroomId is missing.');
    }

    // Require at least one of content or media to be provided in the edit payload.
    // (If client wants to keep media unchanged, it can omit media and only send content.)
    if (typeof content === 'undefined' && typeof media === 'undefined') {
      throw new Error('Either content or media is required.');
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const messageObjectId = new mongoose.Types.ObjectId(messageId);
    const chatroomObjectId = new mongoose.Types.ObjectId(chatroomId);

    // Find the message and verify ownership
    const message = await privateMessageServices.findOne({
      filter: { _id: messageObjectId, senderId: userObjectId, chatroomId: chatroomObjectId },
    });

    if (!message) {
      throw new Error('Message not found or you do not have permission to edit this message.');
    }

    // Prepare update body
    const updateBody = {
      isEdited: true,
      editedAt: new Date(),
    };

    if (content !== undefined) {
      updateBody.content = content;
    }

    if (media !== undefined) {
      updateBody.media = media;
    }

    // Update the message
    const updatedMessage = await privateMessageServices.findOneAndUpdate({
      filter: { _id: messageObjectId, senderId: userObjectId, chatroomId: chatroomObjectId },
      body: updateBody,
    });

    // Fetch sender details
    const senderDetails = await userServices.findOne({
      filter: { _id: userObjectId },
      projection: {
        _id: 1, userName: 1, fullName: 1, profilePicture: 1,
      },
    });

    // Prepare edited message response
    const editedMessage = {
      _id: updatedMessage._id,
      chatroomId: updatedMessage.chatroomId,
      senderDetails,
      content: updatedMessage.content || null,
      media: updatedMessage.media || null,
      storyReply: updatedMessage.storyReply || null,
      status: updatedMessage.status || 'sent',
      deliveredTo: updatedMessage.deliveredTo || [],
      readBy: updatedMessage.readBy || [],
      isEdited: updatedMessage.isEdited,
      editedAt: updatedMessage.editedAt,
      createdAt: updatedMessage.createdAt,
      updatedAt: updatedMessage.updatedAt,
    };

    // Include parent message details if it's a reply
    if (updatedMessage.parentMessageId) {
      editedMessage.parentMessageDetails = {
        parentMessageId: updatedMessage.parentMessageId,
        parentMessageContent: updatedMessage.parentMessageContent,
        parentMessageMedia: updatedMessage.parentMessageMedia,
        parentMessageSenderId: updatedMessage.parentMessageSenderId,
      };
    }

    // Emit to all participants in the private chatroom
    socket.to(chatroomId.toString()).emit(socketEvents.PRIVATE_MESSAGE_EDITED, {
      editedMessage,
    });

    // Confirm to sender
    socket.emit(socketEvents.EDIT_PRIVATE_MESSAGE_SUCCESS, {
      message: 'Message edited successfully.',
      editedMessage,
    });
  } catch (error) {
    socket.emit(socketEvents.EDIT_PRIVATE_MESSAGE_FAILED, {
      message: error.message,
    });
  }
};

// WhatsApp-style multi delete for private chat messages.
// Supports:
// - scope: "self" (delete for me) -> hides messages only for current user
// - scope: "everyone" (delete for everyone) -> tombstones messages for everyone (author/admin/mod/god in group)
exports.privateChatDeleteMessages = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const {
      chatroomId,
      messageIds,
      scope: rawScope = 'self',
    } = data || {};

    if (!userId) throw new Error('UserId is missing in the handshake query');
    if (!chatroomId) throw new Error('chatroomId is required');

    const scope = String(rawScope || 'self').toLowerCase();
    const resolvedScope = scope === 'everyone' || scope === 'all' ? 'everyone' : 'self';

    const ids = normalizeObjectIds(messageIds);
    if (!ids.length) throw new Error('messageIds is required');

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const chatroomObjectId = new mongoose.Types.ObjectId(chatroomId);

    if (!socket.privateChatroom || !socket.privateChatroom._id) {
      throw new Error('Chatroom context missing; ensure checkPermissionForPrivateChat ran');
    }

    // Ensure the user is a participant
    const isParticipant = Array.isArray(socket.privateChatroom.participants)
      && socket.privateChatroom.participants.some((p) => p && p.userId && p.userId.toString() === userObjectId.toString());
    if (!isParticipant && !socket.isGod) {
      throw new Error('You are not a participant of this chatroom');
    }

    const found = await privateMessageServices.find({
      filter: { _id: { $in: ids }, chatroomId: chatroomObjectId },
      projection: { _id: 1, senderId: 1 },
    });

    const foundById = new Map((found || []).map((m) => [m._id.toString(), m]));
    const notFound = ids
      .map((oid) => oid.toString())
      .filter((id) => !foundById.has(id));

    if (resolvedScope === 'self') {
      const updateIds = [...foundById.keys()].map((id) => new mongoose.Types.ObjectId(id));
      if (updateIds.length) {
        await privateMessageServices.updateMany({
          filter: { _id: { $in: updateIds }, chatroomId: chatroomObjectId },
          body: { $addToSet: { deletedFor: userObjectId } },
        });
      }

      socket.emit(socketEvents.PRIVATE_CHAT_DELETE_MESSAGES_SUCCESS, {
        chatroomId,
        scope: 'self',
        deletedForUserId: userId,
        deletedMessageIds: updateIds.map((x) => x.toString()),
        notFoundMessageIds: notFound,
      });
      return;
    }

    const now = new Date();
    const isGroupChat = !!socket.privateChatroom.isGroupChat;
    const deletions = [];
    const denied = [];
    const ops = [];

    [...foundById.values()].forEach((msg) => {
      const isAuthor = msg.senderId && msg.senderId.toString() === userObjectId.toString();
      const canDeleteForEveryone = isAuthor
        || socket.isGod
        || (isGroupChat && (socket.isAdmin || socket.isModerator));

      if (!canDeleteForEveryone) {
        denied.push({ messageId: msg._id.toString(), reason: 'forbidden' });
        return;
      }

      let deletedByValue = 'author';
      if (!isAuthor) {
        if (socket.isGod) deletedByValue = 'god';
        else if (socket.isAdmin) deletedByValue = 'admin';
        else if (socket.isModerator) deletedByValue = 'moderator';
      }

      deletions.push({ messageId: msg._id.toString(), deletedBy: deletedByValue, deletedAt: now });
      ops.push({
        updateOne: {
          filter: { _id: msg._id, chatroomId: chatroomObjectId },
          update: {
            $set: {
              isDeleted: true,
              deletedBy: deletedByValue,
              deletedAt: now,
              content: null,
              media: null,
              reactions: [],
              parentMessageId: null,
              parentMessageSenderId: null,
              parentMessageContent: null,
              parentMessageMedia: null,
              storyReply: null,
            },
          },
        },
      });
    });

    if (ops.length) {
      await privateMessageServices.bulkWrite(ops);
    }

    if (deletions.length) {
      socket.to(chatroomId).emit(socketEvents.PRIVATE_CHAT_MESSAGES_DELETED, {
        chatroomId,
        scope: 'everyone',
        deletions,
      });
    }

    socket.emit(socketEvents.PRIVATE_CHAT_DELETE_MESSAGES_SUCCESS, {
      chatroomId,
      scope: 'everyone',
      deletions,
      denied,
      notFoundMessageIds: notFound,
    });
  } catch (error) {
    socket.emit(socketEvents.PRIVATE_CHAT_DELETE_MESSAGES_FAILED, {
      message: error.message,
    });
  }
};

exports.handlePrivateEmojiReact = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const { chatroomId, messageId, emoji } = data;

    if (!messageId || !userId || !emoji) {
      throw new Error('Invalid data. messageId, userId, and emoji are required.');
    }

    // Update the message's reactions array with the new reaction or update an existing one
    const message = await privateMessageServices.findOneAndUpdate({
      filter: { _id: messageId, 'reactions.userId': { $ne: userId } },
      body: { $push: { reactions: { userId, emoji } } },
    });

    // If the user has already reacted, update the emoji instead of pushing a new reaction
    if (!message) {
      await privateMessageServices.findOneAndUpdate({
        filter: { _id: messageId, 'reactions.userId': userId },
        body: { $set: { 'reactions.$.emoji': emoji } },
      });
    }

    // Retrieve the user details of the sender for the specific reaction
    const senderDetails = await userServices.findOne({
      filter: { _id: userId },
      projection: { userName: 1, fullName: 1, profilePicture: 1 },
    });

    // Emit only the specific reaction details along with the sender details
    const reactionDetails = {
      userId,
      emoji,
      senderDetails,
    };

    // Send the specific reaction to all clients in the chatroom
    socket.to(chatroomId).emit(socketEvents.PRIV_EMOJI_REACT, {
      messageId,
      reaction: reactionDetails,
    });

    socket.emit(socketEvents.PRIV_EMOJI_REACT_SUCCESS, {
      message: 'Emoji reaction added successfully.',
      messageId,
      reaction: reactionDetails,
    });
  } catch (error) {
    socket.emit(socketEvents.PRIV_EMOJI_REACT_FAILED, {
      message: error.message,
    });
  }
};

exports.privGroupAddParticipants = async (socket, data) => {
  try {
    // Group-only
    if (!socket.privateChatroom || socket.privateChatroom.isGroupChat === false) {
      throw new Error('This action can only be performed on group chats.');
    }

    // Admin-only (or God)
    if (!socket.isGod && !socket.isAdmin) {
      throw new Error('Only God or admin can perform this action.');
    }

    const { userId } = socket.handshake.query;
    const { chatroomId } = data || {};
    const participantsToAdd = (data && Array.isArray(data.participantsToAdd) ? data.participantsToAdd : []);

    if (!chatroomId) throw new Error('chatroomId is required.');
    if (!participantsToAdd.length) throw new Error('A list of user ids to add participants is required.');

    // Ensure chatroom matches (refresh from DB)
    const chatroom = await privateChatroomServices.findById({ id: chatroomId });
    if (!chatroom) throw new Error('Chatroom not found.');
    if (!chatroom.isGroupChat) throw new Error('This action can only be performed on group chats.');

    const actorObjectId = new mongoose.Types.ObjectId(String(userId));
    const isActorParticipant = (chatroom.participants || []).some((p) => p && p.userId && p.userId.toString() === actorObjectId.toString());
    if (!isActorParticipant && !socket.isGod) throw new Error('Only participants can manage this group.');

    const existingParticipantIds = (chatroom.participants || [])
      .map((p) => (p && p.userId ? p.userId.toString() : null))
      .filter(Boolean);

    const requestedIds = [...new Set(participantsToAdd.map((x) => String(x)))];
    const newIds = requestedIds.filter((id) => !existingParticipantIds.includes(id));
    if (!newIds.length) throw new Error('All users are already participants.');

    // Validate users exist (public fields only)
    const users = await userServices.find({
      filter: { _id: { $in: newIds.map((id) => new mongoose.Types.ObjectId(String(id))) } },
      projection: {
        _id: 1, userName: 1, fullName: 1, profilePicture: 1,
      },
    });

    const foundIds = new Set(users.map((u) => u._id.toString()));
    const nonExistent = newIds.filter((id) => !foundIds.has(String(id)));
    if (nonExistent.length) {
      throw new Error(`The following user(s) do not exist: ${nonExistent.join(', ')}`);
    }

    const updatedChatroom = await privateChatroomServices.findByIdAndUpdate({
      id: chatroomId,
      body: {
        $addToSet: {
          participants: {
            $each: newIds.map((id) => ({ userId: new mongoose.Types.ObjectId(String(id)) })),
          },
        },
      },
    });
    if (!updatedChatroom) throw new Error('Failed to add participants.');

    // In-app notifications + push notifications (only to newly added users)
    try {
      const actor = await userServices.findOne({
        filter: { _id: new mongoose.Types.ObjectId(String(userId)) },
        projection: { _id: 1, fullName: 1, userName: 1 },
      });
      const actorName = (actor && (actor.fullName || actor.userName)) || 'Someone';
      const groupName = (updatedChatroom && updatedChatroom.name) ? updatedChatroom.name : 'a group';
      const summary = `${actorName} added you to "${groupName}"`;

      await Promise.allSettled(
        newIds.map((rid) => notificationService.create({
          body: {
            userId: toObjectId(rid),
            senderId: toObjectId(userId),
            category: 'updates',
            type: 'update',
            summary,
            meta: {
              kind: 'private_group_participant_added',
              privateChatroomId: toObjectId(chatroomId),
              addedBy: toObjectId(userId),
            },
          },
        })),
      );

      // Push: fetch fcm tokens separately to avoid leaking them in any payloads
      const recipients = await userServices.find({
        filter: { _id: { $in: newIds.map((rid) => new mongoose.Types.ObjectId(String(rid))) } },
        projection: { _id: 1, fcmToken: 1 },
      });

      await Promise.allSettled(
        (recipients || [])
          .filter((u) => u && u.fcmToken)
          .map((u) => pushNotificationService.sendPrivateMessageNotification({
            fcmToken: u.fcmToken,
            title: 'Group update',
            body: summary,
            type: 'group_message',
            data: {
              chatroomId: String(chatroomId),
              chatName: groupName,
              chatProfilePicture: (updatedChatroom && updatedChatroom.groupPicture) || '',
              isGroupChat: 'true',
            },
          })),
      );
    } catch (e) {
      // Never fail the action if notification/push fails
    }

    /* eslint-disable no-param-reassign */
    socket.privateChatroom = updatedChatroom;
    /* eslint-enable no-param-reassign */

    socket.to(chatroomId).emit(socketEvents.PRIVATE_GROUP_PARTICIPANTS_ADDED, {
      chatroomId,
      addedBy: String(userId),
      newParticipants: users,
    });

    socket.emit(socketEvents.PRIVATE_GROUP_ADD_PARTICIPANTS_SUCCESS, {
      message: 'Users added as participants successfully.',
      chatroomId,
      addedParticipants: users,
    });
    pushUnreadCountsUpdateToUsers(newIds).catch(() => {});
  } catch (error) {
    socket.emit(socketEvents.PRIVATE_GROUP_ADD_PARTICIPANTS_FAILED, {
      message: error && error.message ? error.message : 'Failed to add participants.',
    });
  }
};

exports.privGroupRemoveParticipants = async (socket, data) => {
  try {
    // Group-only
    if (!socket.privateChatroom || socket.privateChatroom.isGroupChat === false) {
      throw new Error('This action can only be performed on group chats.');
    }

    // Admin-only (or God)
    if (!socket.isGod && !socket.isAdmin) {
      throw new Error('Only God or admin can perform this action.');
    }

    const { userId } = socket.handshake.query;
    const { chatroomId } = data || {};
    const participantsToRemove = (data && Array.isArray(data.participantsToRemove) ? data.participantsToRemove : []);

    if (!chatroomId) throw new Error('chatroomId is required.');
    if (!participantsToRemove.length) throw new Error('A list of user ids to remove participants is required.');

    const chatroom = await privateChatroomServices.findById({ id: chatroomId });
    if (!chatroom) throw new Error('Chatroom not found.');
    if (!chatroom.isGroupChat) throw new Error('This action can only be performed on group chats.');

    const actorObjectId = new mongoose.Types.ObjectId(String(userId));
    const isActorParticipant = (chatroom.participants || []).some((p) => p && p.userId && p.userId.toString() === actorObjectId.toString());
    if (!isActorParticipant && !socket.isGod) throw new Error('Only participants can manage this group.');

    const requestedIds = [...new Set(participantsToRemove.map((x) => String(x)))];
    if (requestedIds.includes(String(userId))) {
      throw new Error('You cannot remove yourself using this action. Use leave group flow instead.');
    }

    const participantIds = (chatroom.participants || []).map((p) => (p && p.userId ? p.userId.toString() : null)).filter(Boolean);
    const notParticipants = requestedIds.filter((id) => !participantIds.includes(id));
    if (notParticipants.length) {
      throw new Error(`The following user(s) are not participants in the chatroom: ${notParticipants.join(', ')}`);
    }

    const remainingParticipantIds = participantIds.filter((id) => !requestedIds.includes(id));
    if (!remainingParticipantIds.length) {
      throw new Error('Cannot remove all participants from a group chat.');
    }

    const adminIds = (chatroom.admins || []).map((a) => (a && a.userId ? a.userId.toString() : null)).filter(Boolean);
    const removingAdminIds = adminIds.filter((id) => requestedIds.includes(id));
    const remainingAdminIds = adminIds.filter((id) => !requestedIds.includes(id));

    // Ensure at least one admin remains; if needed, auto-promote a remaining participant.
    let promotedAdminUserId = null;
    if (chatroom.isGroupChat && remainingAdminIds.length === 0) {
      promotedAdminUserId = remainingParticipantIds[0] || null;
      if (!promotedAdminUserId) {
        throw new Error('Cannot remove last admin. There must be at least one admin in the chatroom.');
      }
      await privateChatroomServices.findByIdAndUpdate({
        id: chatroomId,
        body: { $addToSet: { admins: { userId: new mongoose.Types.ObjectId(String(promotedAdminUserId)) } } },
      });
    }

    const updatedChatroom = await privateChatroomServices.findByIdAndUpdate({
      id: chatroomId,
      body: {
        $pull: {
          participants: { userId: { $in: requestedIds.map((id) => new mongoose.Types.ObjectId(String(id))) } },
          admins: { userId: { $in: removingAdminIds.map((id) => new mongoose.Types.ObjectId(String(id))) } },
          moderators: { userId: { $in: requestedIds.map((id) => new mongoose.Types.ObjectId(String(id))) } },
        },
      },
    });
    if (!updatedChatroom) throw new Error('Failed to remove participants.');

    // Add removed users to exParticipants with reason 'removed' and who removed them
    const now = new Date();
    const removedByObjectId = new mongoose.Types.ObjectId(String(userId));
    await privateChatroomServices.findByIdAndUpdate({
      id: chatroomId,
      body: {
        $push: {
          exParticipants: {
            $each: requestedIds.map((id) => ({
              userId: new mongoose.Types.ObjectId(String(id)),
              exitedAt: now,
              reason: 'removed',
              removedBy: removedByObjectId,
            })),
          },
        },
      },
    });

    // In-app notifications + push notifications to removed users
    try {
      const actor = await userServices.findOne({
        filter: { _id: new mongoose.Types.ObjectId(String(userId)) },
        projection: { _id: 1, fullName: 1, userName: 1 },
      });
      const actorName = (actor && (actor.fullName || actor.userName)) || 'Someone';
      const groupName = (chatroom && chatroom.name) ? chatroom.name : 'a group';
      const summary = `${actorName} removed you from "${groupName}"`;

      await Promise.allSettled(
        requestedIds.map((rid) => notificationService.create({
          body: {
            userId: toObjectId(rid),
            senderId: toObjectId(userId),
            category: 'updates',
            type: 'update',
            summary,
            meta: {
              kind: 'private_group_participant_removed',
              privateChatroomId: toObjectId(chatroomId),
              removedBy: toObjectId(userId),
            },
          },
        })),
      );

      const removedUsers = await userServices.find({
        filter: { _id: { $in: requestedIds.map((rid) => new mongoose.Types.ObjectId(String(rid))) } },
        projection: { _id: 1, fcmToken: 1 },
      });
      await Promise.allSettled(
        (removedUsers || [])
          .filter((u) => u && u.fcmToken)
          .map((u) => pushNotificationService.sendPrivateMessageNotification({
            fcmToken: u.fcmToken,
            title: 'Group update',
            body: summary,
            type: 'group_message',
            data: {
              chatroomId: String(chatroomId),
              chatName: groupName,
              chatProfilePicture: (chatroom && chatroom.groupPicture) || '',
              isGroupChat: 'true',
            },
          })),
      );
    } catch (e) {
      // Never fail the action if notification fails
    }

    // One system message for the whole action so it appears in message history
    try {
      const io = socket.server;
      const { message: sysMsg, senderDetails: sysSenderDetails } = await createPrivateSystemMessage({
        chatroomId: toObjectId(chatroomId),
        type: 'member_removed',
        actorUserId: userId,
        targetUserIds: requestedIds,
      });
      const newMessage = {
        _id: sysMsg._id,
        chatroomId: sysMsg.chatroomId,
        senderDetails: sysSenderDetails,
        content: sysMsg.content,
        messageType: 'system',
        systemEvent: sysMsg.systemEvent,
        status: sysMsg.status || 'sent',
        deliveredTo: sysMsg.deliveredTo || [],
        readBy: sysMsg.readBy || [],
        createdAt: sysMsg.createdAt,
        updatedAt: sysMsg.updatedAt,
      };
      io.to(String(chatroomId)).emit(socketEvents.NEW_PRIVATE_MESSAGE, { newMessage });
    } catch (e) {
      // Never fail the action if system message fails
    }

    /* eslint-disable no-param-reassign */
    socket.privateChatroom = updatedChatroom;
    /* eslint-enable no-param-reassign */

    pushUnreadCountsUpdateToUsers([...requestedIds, ...remainingParticipantIds]).catch(() => {});

    socket.to(chatroomId).emit(socketEvents.PRIVATE_GROUP_PARTICIPANTS_REMOVED, {
      chatroomId,
      removedBy: String(userId),
      removedParticipants: requestedIds,
      promotedAdminUserId,
    });

    socket.emit(socketEvents.PRIVATE_GROUP_REMOVE_PARTICIPANTS_SUCCESS, {
      message: 'Users removed from the chatroom successfully.',
      chatroomId,
      removedParticipants: requestedIds,
      promotedAdminUserId,
    });
  } catch (error) {
    socket.emit(socketEvents.PRIVATE_GROUP_REMOVE_PARTICIPANTS_FAILED, {
      message: error && error.message ? error.message : 'Failed to remove participants.',
    });
  }
};

exports.privGroupAddAdmin = async (socket, data) => {
  try {
    // check if the chatroom is group or not
    if (socket.privateChatroom.isGroupChat === false) {
      throw new Error('This action can only be performed on group chats.');
    }

    // check if the user is god or admin or not
    if (!socket.isGod && !socket.isAdmin) {
      throw new Error('Only God or admin can perform this action.');
    }

    const { chatroomId, adminToAdd } = data;

    if (!adminToAdd) {
      throw new Error('User id to add admin is required.');
    }

    const user = await userServices.findById({ id: adminToAdd });
    if (!user) {
      throw new Error(`User having id ${adminToAdd} doesnt exist.`);
    }

    // prepare the admin object
    const newAdmin = { userId: new mongoose.Types.ObjectId(adminToAdd) };

    // Check if the user is a participant in the chatroom
    const isParticipant = socket.privateChatroom.participants.some(
      (participant) => participant.userId.toString() === adminToAdd.toString(),
    );

    if (!isParticipant) {
      throw new Error('The user must be a participant in the chatroom to be made an admin.');
    }

    // check if the user is already admin
    const isAlreadyAdmin = socket.privateChatroom.admins.some(
      (admin) => admin.userId.toString() === adminToAdd.toString(),
    );

    if (isAlreadyAdmin) {
      throw new Error('The user is already admin.');
    }

    // Add the new admin to the chatroom's admins list
    const updatedChatroom = await privateChatroomServices.findByIdAndUpdate({
      id: chatroomId,
      body: {
        $addToSet: { admins: newAdmin }, // Add the new admin if not already present
        $pull: { moderators: { userId: newAdmin.userId } }, // Remove from moderators if they exist
      },
    });

    // Handle the case where the update was unsuccessful
    if (!updatedChatroom) {
      throw new Error('Failed to update chatroom admins.');
    }

    const updatedSocket = socket;
    updatedSocket.privateChatroom = updatedChatroom;
    socket.to(chatroomId).emit(socketEvents.PRIVATE_GROUP_ADMIN_ADDED, {
      newAdmin: {
        userId: adminToAdd,
        userName: user.userName,
        fullName: user.fullName,
        profilePicture: user.profilePicture,
      },
    });

    socket.emit(socketEvents.PRIVATE_GROUP_ADD_ADMIN_SUCCESS, {
      message: 'User added as admin successfully.',
    });
  } catch (error) {
    socket.emit(socketEvents.PRIVATE_GROUP_ADD_ADMIN_FAILED, {
      message: error.message,
    });
  }
};

exports.privGroupRemoveAdmin = async (socket, data) => {
  try {
    // check if the chatroom is group or not
    if (socket.privateChatroom.isGroupChat === false) {
      throw new Error('This action can only be performed on group chats.');
    }

    // check if the user is god or admin or not
    if (!socket.isGod && !socket.isAdmin) {
      throw new Error('Only God or admin can perform this action.');
    }

    const { chatroomId, adminToRemove } = data;

    // check if the user id to be removed as admin is provided or not
    if (!adminToRemove) {
      throw new Error('User id to remove admin is required.');
    }

    // Check if the user is currently an admin in the chatroom
    const isAdmin = socket.privateChatroom.admins.some(
      (admin) => admin.userId.toString() === adminToRemove.toString(),
    );

    if (!isAdmin) {
      throw new Error('The user is not an admin in this chatroom.');
    }

    // Ensure that there is at least one admin left in the chatroom
    if (socket.privateChatroom.admins.length <= 1) {
      throw new Error('Cannot remove amdin. There must be at least one admin in the chatroom.');
    }

    const user = await userServices.findById({ id: adminToRemove });
    if (!user) {
      throw new Error(`User having id ${adminToRemove} doesnt exist.`);
    }

    const removeAdmin = new mongoose.Types.ObjectId(adminToRemove);

    // Add the new admin to the chatroom's admins list
    const updatedChatroom = await privateChatroomServices.findByIdAndUpdate({
      id: chatroomId,
      body: {
        $pull: { admins: { userId: removeAdmin } }, // Remove the admin
      },
    });

    // Handle the case where the update was unsuccessful
    if (!updatedChatroom) {
      throw new Error('Failed to update chatroom admins.');
    }

    const updatedSocket = socket;
    updatedSocket.privateChatroom = updatedChatroom;
    socket.to(chatroomId).emit(socketEvents.PRIVATE_GROUP_ADMIN_REMOVED, {
      newAdmin: {
        userId: adminToRemove,
        userName: user.userName,
        fullName: user.fullName,
        profilePicture: user.profilePicture,
      },
    });

    socket.emit(socketEvents.PRIVATE_GROUP_REMOVE_ADMIN_SUCCESS, {
      message: 'User removed as admin successfully.',
    });
  } catch (error) {
    socket.emit(socketEvents.PRIVATE_GROUP_REMOVE_ADMIN_FAILED, {
      message: error.message,
    });
  }
};

exports.privGroupAddModerator = async (socket, data) => {
  try {
    // check if the chatroom is group or not
    if (socket.privateChatroom.isGroupChat === false) {
      throw new Error('This action can only be performed on group chats.');
    }

    // check if the user is god or admin or not
    if (!socket.isGod && !socket.isAdmin) {
      throw new Error('Only God or admin can perform this action.');
    }

    const { chatroomId, moderatorToAdd } = data;

    if (!moderatorToAdd) {
      throw new Error('User id to add moderator is required.');
    }

    const user = await userServices.findById({ id: moderatorToAdd });
    if (!user) {
      throw new Error(`User having id ${moderatorToAdd} doesnt exist.`);
    }

    // prepare the moderator object
    const newModerator = { userId: new mongoose.Types.ObjectId(moderatorToAdd) };

    // Check if the user is a participant in the chatroom
    const isParticipant = socket.privateChatroom.participants.some(
      (participant) => participant.userId.toString() === moderatorToAdd.toString(),
    );

    if (!isParticipant) {
      throw new Error('The user must be a participant in the chatroom to be made an moderator.');
    }

    // check if the user is already moderator
    const isAlreadyAdmin = socket.privateChatroom.admins.some(
      (admin) => admin.userId.toString() === moderatorToAdd.toString(),
    );

    if (isAlreadyAdmin) {
      throw new Error('The user is already admin hence cant be made moderator.');
    }

    // check if the user is already moderator
    const isAlreadyModerator = socket.privateChatroom.moderators.some(
      (moderator) => moderator.userId.toString() === moderatorToAdd.toString(),
    );

    if (isAlreadyModerator) {
      throw new Error('The user is already moderator.');
    }

    // Add the new admin to the chatroom's moderators list
    const updatedChatroom = await privateChatroomServices.findByIdAndUpdate({
      id: chatroomId,
      body: {
        $addToSet: { moderators: newModerator }, // Add the new moderator if not already present
      },
    });

    // Handle the case where the update was unsuccessful
    if (!updatedChatroom) {
      throw new Error('Failed to update chatroom admins.');
    }

    const updatedSocket = socket;
    updatedSocket.privateChatroom = updatedChatroom;
    socket.to(chatroomId).emit(socketEvents.PRIVATE_GROUP_MODERATOR_ADDED, {
      newAdmin: {
        userId: moderatorToAdd,
        userName: user.userName,
        fullName: user.fullName,
        profilePicture: user.profilePicture,
      },
    });

    socket.emit(socketEvents.PRIVATE_GROUP_ADD_MODERATOR_SUCCESS, {
      message: 'User added as moderator successfully.',
    });
  } catch (error) {
    socket.emit(socketEvents.PRIVATE_GROUP_ADD_MODERATOR_FAILED, {
      message: error.message,
    });
  }
};

exports.privGroupRemoveModerator = async (socket, data) => {
  try {
    // check if the chatroom is group or not
    if (socket.privateChatroom.isGroupChat === false) {
      throw new Error('This action can only be performed on group chats.');
    }

    // check if the user is god or admin or not
    if (!socket.isGod && !socket.isAdmin) {
      throw new Error('Only God or admin can perform this action.');
    }

    const { chatroomId, moderatorToRemove } = data;

    // check if the user id to be removed as moderator is provided or not
    if (!moderatorToRemove) {
      throw new Error('User id to remove moderator is required.');
    }

    // Check if the user is currently an moderator in the chatroom
    const isModerator = socket.privateChatroom.moderators.some(
      (moderator) => moderator.userId.toString() === moderatorToRemove.toString(),
    );

    if (!isModerator) {
      throw new Error('The user is not a moderator in this chatroom.');
    }

    const user = await userServices.findById({ id: moderatorToRemove });
    if (!user) {
      throw new Error(`User having id ${moderatorToRemove} doesnt exist.`);
    }

    const removeModerator = new mongoose.Types.ObjectId(moderatorToRemove);

    // Add the new moderator to the chatroom's admins list
    const updatedChatroom = await privateChatroomServices.findByIdAndUpdate({
      id: chatroomId,
      body: {
        $pull: { moderators: { userId: removeModerator } }, // Remove the admin
      },
    });

    // Handle the case where the update was unsuccessful
    if (!updatedChatroom) {
      throw new Error('Failed to update chatroom moderators.');
    }

    const updatedSocket = socket;
    updatedSocket.privateChatroom = updatedChatroom;
    socket.to(chatroomId).emit(socketEvents.PRIVATE_GROUP_MODERATOR_REMOVED, {
      newAdmin: {
        userId: moderatorToRemove,
        userName: user.userName,
        fullName: user.fullName,
        profilePicture: user.profilePicture,
      },
    });

    socket.emit(socketEvents.PRIVATE_GROUP_REMOVE_MODERATOR_SUCCESS, {
      message: 'User removed as moderator successfully.',
    });
  } catch (error) {
    socket.emit(socketEvents.PRIVATE_GROUP_REMOVE_MODERATOR_FAILED, {
      message: error.message,
    });
  }
};

exports.getPrivateChatroomParticipantsList = async (socket, data) => {
  try {
    // const { userId } = socket.handshake.query;
    const { chatroomId, page = 1, limit = 20 } = data;

    if (!chatroomId) {
      throw new Error('Chatroom ID is required.');
    }

    // Aggregation pipeline to get participants list with admin and moderator status
    const aggregationPipeline = [
      {
        $match: { _id: new mongoose.Types.ObjectId(chatroomId) }, // Match the chatroom by ID
      },
      {
        $lookup: {
          from: 'users', // Lookup user details for participants
          localField: 'participants.userId',
          foreignField: '_id',
          as: 'participantDetails',
        },
      },
      {
        $addFields: {
          participants: {
            $map: {
              input: '$participants',
              as: 'participant',
              in: {
                $mergeObjects: [
                  '$$participant',
                  {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: '$participantDetails',
                          as: 'detail',
                          cond: { $eq: ['$$detail._id', '$$participant.userId'] },
                        },
                      },
                      0, // Get the first matching user details for the participant
                    ],
                  },
                ],
              },
            },
          },
        },
      },
      {
        $addFields: {
          participants: {
            $map: {
              input: '$participants',
              as: 'participant',
              in: {
                $mergeObjects: [
                  '$$participant',
                  {
                    isAdmin: {
                      $in: [
                        '$$participant.userId',
                        { $map: { input: '$admins', as: 'admin', in: '$$admin.userId' } },
                      ],
                    },
                    isModerator: {
                      $in: [
                        '$$participant.userId',
                        {
                          $map: { input: '$moderators', as: 'moderator', in: '$$moderator.userId' },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
      {
        $project: {
          participants: {
            userId: 1,
            isAdmin: 1,
            isModerator: 1,
            userName: 1,
            fullName: 1,
            profilePicture: 1,
          },
        },
      },
      {
        $facet: {
          participants: [{ $skip: (page - 1) * limit }, { $limit: parseInt(limit, 10) }],
          totalCount: [{ $count: 'count' }],
        },
      },
    ];

    // Execute aggregation query
    const chatroom = await privateChatroomServices.aggregate({ query: aggregationPipeline });

    if (!chatroom || !chatroom.length) {
      throw new Error('Chatroom not found.');
    }

    const { participants } = chatroom[0];
    const { totalCount } = chatroom[0];
    const totalParticipants = totalCount.length > 0 ? totalCount[0].count : 0;
    const totalPages = Math.ceil(totalParticipants / limit);

    socket.emit(socketEvents.PRIVATE_CHATROOM_PARTICIPANTS_LIST_SUCCESS, {
      participants,
      metadata: {
        totalParticipants,
        totalPages,
        page,
        limit,
      },
    });
  } catch (error) {
    socket.emit(socketEvents.PRIVATE_CHATROOM_PARTICIPANTS_LIST_FAILED, {
      message: error.message,
    });
  }
};

exports.handleUserTyping = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const { chatroomId, isTyping } = data;

    if (!chatroomId) {
      throw new Error('Chatroom ID is required.');
    }

    const user = await userServices.findById({ id: userId });
    if (!user) {
      throw new Error('User not found.');
    }

    // Emit typing status to all other participants in the chatroom
    socket.to(chatroomId).emit(socketEvents.USER_TYPING_UPDATE, {
      userId,
      fullName: user.fullName,
      userName: user.userName,
      profilePicture: user.profilePicture,
      isTyping,
      chatroomId,
    });

    // Also emit to the sender for confirmation (optional - for debugging)
    socket.emit(socketEvents.USER_TYPING_UPDATE, {
      userId,
      fullName: user.fullName,
      userName: user.userName,
      profilePicture: user.profilePicture,
      isTyping,
      chatroomId,
      self: true, // Flag to indicate this is your own typing status
    });
  } catch (error) {
    socket.emit(socketEvents.USER_TYPING_FAILED, {
      message: error.message,
    });
  }
};

exports.handleMessageDelivered = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const { messageId, chatroomId } = data;

    if (!messageId || !chatroomId) {
      throw new Error('Message ID and Chatroom ID are required.');
    }

    const message = await privateMessageServices.findOne({
      filter: { _id: messageId },
    });

    if (!message) {
      throw new Error('Message not found.');
    }

    // Check if already delivered to this user
    const alreadyDelivered = message.deliveredTo.some(
      (delivery) => delivery.userId.toString() === userId.toString(),
    );

    if (!alreadyDelivered) {
      // Add user to deliveredTo array
      const updatedMessage = await privateMessageServices.findByIdAndUpdate({
        id: messageId,
        body: {
          $addToSet: {
            deliveredTo: {
              userId,
              deliveredAt: new Date(),
            },
          },
        },
      });

      // Check if message should be marked as delivered
      const chatroom = await privateChatroomServices.findById({ id: chatroomId });
      const participantCount = chatroom.participants.length;
      const deliveredCount = updatedMessage.deliveredTo.length + 1;

      let newStatus = message.status;
      if (deliveredCount >= participantCount - 1 && message.status === 'sent') {
        newStatus = 'delivered';
        await privateMessageServices.findByIdAndUpdate({
          id: messageId,
          body: { status: 'delivered' },
        });
      }

      // Emit success to the user
      socket.emit(socketEvents.MESSAGE_DELIVERED_SUCCESS, {
        messageId,
        chatroomId,
      });

      // Notify message sender about delivery
      const io = socket.server;
      io.to(chatroomId).emit(socketEvents.MESSAGE_DELIVERED_UPDATE, {
        messageId,
        deliveredTo: updatedMessage.deliveredTo,
        status: newStatus,
        chatroomId,
      });
    }
  } catch (error) {
    socket.emit(socketEvents.MESSAGE_DELIVERED_FAILED, {
      message: error.message,
    });
  }
};

exports.handleMessageRead = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const { messageId, chatroomId } = data;

    if (!messageId || !chatroomId) {
      throw new Error('Message ID and Chatroom ID are required.');
    }

    const message = await privateMessageServices.findOne({
      filter: { _id: messageId },
    });

    if (!message) {
      throw new Error('Message not found.');
    }

    // Don't allow sender to mark their own message as read
    if (message.senderId.toString() === userId.toString()) {
      return;
    }

    // Check if already read by this user
    const alreadyRead = message.readBy.some(
      (read) => read.userId.toString() === userId.toString(),
    );

    if (!alreadyRead) {
      // Add user to readBy array
      const updatedMessage = await privateMessageServices.findByIdAndUpdate({
        id: messageId,
        body: {
          $addToSet: {
            readBy: {
              userId,
              readAt: new Date(),
            },
          },
        },
      });

      // Also mark as delivered if not already
      await privateMessageServices.findByIdAndUpdate({
        id: messageId,
        body: {
          $addToSet: {
            deliveredTo: {
              userId,
              deliveredAt: new Date(),
            },
          },
        },
      });

      // Check if message should be marked as read
      const chatroom = await privateChatroomServices.findById({ id: chatroomId });
      const participantCount = chatroom.participants.length;
      const readCount = updatedMessage.readBy.length + 1;

      let newStatus = message.status;
      if (readCount >= participantCount - 1) {
        newStatus = 'read';
        await privateMessageServices.findByIdAndUpdate({
          id: messageId,
          body: { status: 'read' },
        });
      }

      // Emit success to the user
      socket.emit(socketEvents.MESSAGE_READ_SUCCESS, {
        messageId,
        chatroomId,
      });

      // Notify message sender and other participants about read status
      const io = socket.server;
      io.to(chatroomId).emit(socketEvents.MESSAGE_READ_UPDATE, {
        messageId,
        readBy: updatedMessage.readBy,
        status: newStatus,
        chatroomId,
      });
      pushUnreadCountsUpdate(userId).catch(() => {});
    }
  } catch (error) {
    socket.emit(socketEvents.MESSAGE_READ_FAILED, {
      message: error.message,
    });
  }
};

exports.handleMarkChatroomAsRead = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const { chatroomId } = data;

    if (!chatroomId) {
      throw new Error('Chatroom ID is required.');
    }

    // Find all unread messages in the chatroom
    const messages = await privateMessageServices.find({
      filter: {
        chatroomId,
        senderId: { $ne: userId },
        'readBy.userId': { $ne: userId },
      },
    });

    const messageIds = messages.map((message) => message._id);

    // Get chatroom details once
    const chatroom = await privateChatroomServices.findById({ id: chatroomId });
    const participantCount = chatroom.participants.length;

    // Mark all messages as read in parallel
    await Promise.all(
      messages.map(async (message) => {
        await privateMessageServices.findByIdAndUpdate({
          id: message._id,
          body: {
            $addToSet: {
              readBy: {
                userId,
                readAt: new Date(),
              },
              deliveredTo: {
                userId,
                deliveredAt: new Date(),
              },
            },
          },
        });

        // Update status to read if all participants have read
        const readCount = message.readBy.length + 1;

        if (readCount >= participantCount - 1) {
          await privateMessageServices.findByIdAndUpdate({
            id: message._id,
            body: { status: 'read' },
          });
        }
      }),
    );

    // Emit success
    socket.emit(socketEvents.MARK_CHATROOM_AS_READ_SUCCESS, {
      chatroomId,
      count: messageIds.length,
    });

    // Notify other participants
    const io = socket.server;
    io.to(chatroomId).emit(socketEvents.CHATROOM_MESSAGES_READ, {
      chatroomId,
      messageIds,
      userId,
      count: messageIds.length,
    });
    pushUnreadCountsUpdate(userId).catch(() => {});
  } catch (error) {
    socket.emit(socketEvents.MARK_CHATROOM_AS_READ_FAILED, {
      message: error.message,
    });
  }
};
