const { mongoose } = require('mongoose');
const { socketEvents } = require('../../lib/constants/socket');
const chatroomServices = require('../services/chatroomServices');
const participantServices = require('../services/participantServices');
const userServices = require('../services/userServices');
const messageServices = require('../services/messageServices');
const mediaModerationService = require('../services/mediaModerationService');
const { parseS3Url } = require('../../lib/helpers/s3UrlParser');
const { contentIncludesHashtagMentionEveryone } = require('../../lib/helpers/mentionParser');
const { logInfo } = require('../../lib/helpers/logger');
const userInteractionService = require('../services/userInterationService');
const pushNotificationService = require('../services/pushNotificationService');
const notificationService = require('../services/notificationService');
const notificationSettingsServices = require('../services/notificationSettingsServices');
const hashtagPolicyAcceptanceServices = require('../services/hashtagPolicyAcceptanceServices');
const hiddenHashtagChatListServices = require('../services/hiddenHashtagChatListServices');
const hashtagServices = require('../services/hashtagServices');
const hashtagRequestServices = require('../services/hashtagRequestServices');
const userRoleServices = require('../services/userRoleServices');
const hashtagRoleServices = require('../services/hashtagRoleServices');
const messageCommentServices = require('../services/messageCommentServices');
const messageReactionServices = require('../services/messageReactionServices');
const pollVoteServices = require('../services/pollVoteServices');
const { pushUnreadCountsUpdate, pushUnreadCountsUpdateToUsers } = require('./unreadCountsEvents');

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

// Returns YYYY-MM-DD based on client timezone offset (minutes) if provided.
// If client sends `new Date().getTimezoneOffset()`, this will correctly bucket dates in the client's local day.
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

const allowedMessageTypes = new Set(['text', 'image', 'video', 'audio', 'location', 'file', 'poll']);

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
          // current-user handled separately
        },
      },
    ],
  });
  const totalVotes = (agg && agg[0] && agg[0].totals && agg[0].totals[0]) ? agg[0].totals[0].totalVotes : 0;
  const optionCounts = (agg && agg[0] && agg[0].optionCounts) ? agg[0].optionCounts : [];
  const map = new Map(optionCounts.map((x) => [String(x._id), x.count]));
  return { totalVotes, optionCountMap: map };
};

exports.handleHashtagPollVote = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const {
      hashtagId, messageId, selectedOptionIds,
    } = data || {};

    if (!userId || !hashtagId || !messageId) throw new Error('Invalid data. hashtagId, messageId and userId are required.');

    const chatroom = await chatroomServices.findOne({ filter: { hashtagId: new mongoose.Types.ObjectId(String(hashtagId)) } });
    if (!chatroom) throw new Error('Chatroom not found');

    const message = await messageServices.findOne({
      filter: { _id: new mongoose.Types.ObjectId(String(messageId)), chatroomId: chatroom._id, isDeleted: false },
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

    // Unvote support: empty selection clears user's vote (WhatsApp-like toggle behavior)
    const isUnvote = normalizedSelected.length === 0;

    if (!isUnvote) {
      const optionIdSet = new Set(((message.poll.options || [])).map((o) => String(o.optionId)));
      const invalid = normalizedSelected.find((id) => !optionIdSet.has(String(id)));
      if (invalid) throw new Error('Invalid poll option');

      if (!message.poll.allowsMultipleAnswers && normalizedSelected.length !== 1) {
        throw new Error('This poll allows only one option');
      }
    }

    // Upsert vote (WhatsApp-like: user can change vote, one vote doc per user per poll message)
    const voteFilter = {
      chatType: 'hashtag',
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
            chatType: 'hashtag',
            messageId: message._id,
            voterId: voteFilter.voterId,
            hashtagId: new mongoose.Types.ObjectId(String(hashtagId)),
            chatroomId: chatroom._id,
            selectedOptionIds: normalizedSelected,
          },
        },
      });
    }

    // Recompute counts from votes (correct under concurrency)
    const { totalVotes, optionCountMap } = await recomputePollCounts({ chatType: 'hashtag', messageId: message._id });

    const newOptions = (message.poll.options || []).map((o) => ({
      ...o.toObject ? o.toObject() : o,
      voteCount: optionCountMap.get(String(o.optionId)) || 0,
    }));

    const updated = await messageServices.findByIdAndUpdate({
      id: message._id,
      body: {
        $set: {
          'poll.totalVotes': totalVotes,
          'poll.options': newOptions,
        },
      },
    });

    const pollPayload = publicPoll(updated.poll);
    const broadcastPayload = {
      messageId: String(messageId),
      hashtagId: String(hashtagId),
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

    // Broadcast to room (never include voter's selection)
    socket.to(hashtagId).emit(socketEvents.POLL_UPDATED, broadcastPayload);
    socket.to(hashtagId).emit(socketEvents.POLL_UPDATE_VOTES, broadcastPayload);
    // If UI has a "who voted for what" screen open, update it in realtime (only for non-anonymous polls)
    if (updated.poll && !updated.poll.isAnonymous) {
      const voter = await userServices.findOne({
        filter: { _id: new mongoose.Types.ObjectId(String(userId)) },
        projection: {
          _id: 1, userName: 1, fullName: 1, profilePicture: 1,
        },
      });
      const optionIdToTitle = new Map((updated.poll.options || []).map((o) => [String(o.optionId), String(o.text)]));
      const selectedOptionTitles = (normalizedSelected || []).map((oid) => optionIdToTitle.get(String(oid))).filter(Boolean);
      socket.to(hashtagId).emit(socketEvents.POLL_VOTE_SCORE_UPDATED, {
        hashtagId: String(hashtagId),
        messageId: String(messageId),
        voter,
        selectedOptionIds: normalizedSelected,
        selectedOptionTitles,
      });
    }
    // Ack to voter includes myVote (+ quizResult if quiz)
    socket.emit(isUnvote ? socketEvents.POLL_UNVOTE_SUCCESS : socketEvents.POLL_VOTE_SUCCESS, ackPayload);
  } catch (error) {
    // If caller emitted pollUnvote, frontend can also listen to POLL_UNVOTE_FAILED;
    // for backwards compatibility we keep emitting POLL_VOTE_FAILED for validation errors too.
    socket.emit(socketEvents.POLL_VOTE_FAILED, { message: error.message });
    socket.emit(socketEvents.POLL_UNVOTE_FAILED, { message: error.message });
  }
};

exports.handleHashtagPollVoteScoreGet = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const { hashtagId, messageId } = data || {};
    if (!userId || !hashtagId || !messageId) throw new Error('Invalid data. hashtagId, messageId and userId are required.');

    const chatroom = await chatroomServices.findOne({
      filter: { hashtagId: new mongoose.Types.ObjectId(String(hashtagId)) },
      projection: { _id: 1 },
    });
    if (!chatroom) throw new Error('Chatroom not found');

    const message = await messageServices.findOne({
      filter: { _id: new mongoose.Types.ObjectId(String(messageId)), chatroomId: chatroom._id, isDeleted: false },
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
            chatType: 'hashtag',
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
    // initialize all options with empty arrays (stable keys)
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
      hashtagId: String(hashtagId),
      messageId: String(messageId),
      voteScore,
    });
  } catch (error) {
    socket.emit(socketEvents.POLL_VOTE_SCORE_FAILED, { message: error.message });
  }
};

exports.getHashtagChatroomList = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const { page = 1, limit = 20, type } = data || {};
    if (!userId) {
      throw new Error('User ID is required.');
    }
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Optional filter: return hashtag chat list by access type or ownership
    // - public -> access === 'public'
    // - private -> access === 'private'
    // - broadcast -> access === 'broadcast'
    // - myhashtags -> only hashtags created by the current user
    // If omitted/empty, keep legacy behavior (no access filtering).
    const normalizedType = (typeof type === 'string' ? type.trim().toLowerCase() : '');
    const allowedTypes = new Set(['public', 'private', 'broadcast', 'myhashtags']);
    if (normalizedType && !allowedTypes.has(normalizedType)) {
      throw new Error('Invalid type. Must be one of: public, private, broadcast, myhashtags');
    }

    // Hide-from-chat-list support (chat screen "remove")
    const hidden = await hiddenHashtagChatListServices.find({
      filter: { userId: userObjectId },
      projection: { hashtagId: 1 },
    });
    const hiddenHashtagIds = (hidden || []).map((h) => h && h.hashtagId).filter(Boolean);

    const aggregationPipeline = [
      {
        $lookup: {
          from: 'participants',
          localField: '_id',
          foreignField: 'chatroomId',
          as: 'participants',
        },
      },
      {
        $match: {
          'participants.userId': userObjectId,
        },
      },
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
        },
      },
      // Compute unreadCount for current user (per chatroom), respecting clearedAt + delete-for-me
      {
        $lookup: {
          from: 'messages',
          let: { chatroomId: '$_id', clearedAt: '$_clearedAt', currentUserId: userObjectId },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$chatroomId', '$$chatroomId'] },
                    { $ne: ['$senderId', '$$currentUserId'] },
                    { $eq: ['$isDeleted', false] },
                    // WhatsApp-style "delete for me"
                    { $not: { $in: ['$$currentUserId', { $ifNull: ['$deletedFor', []] }] } },
                    // Not read by current user
                    {
                      $not: {
                        $in: [
                          '$$currentUserId',
                          {
                            $map: {
                              input: { $ifNull: ['$readBy', []] },
                              as: 'rb',
                              in: '$$rb.userId',
                            },
                          },
                        ],
                      },
                    },
                    // Respect per-user clearedAt
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
      // Lookup latest message
      {
        $lookup: {
          from: 'messages',
          let: { chatroomId: '$_id', clearedAt: '$_clearedAt', currentUserId: userObjectId },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$chatroomId', '$$chatroomId'] },
                    // WhatsApp-style "delete for me"
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
          ],
          as: 'messages',
        },
      },
      {
        $unwind: {
          path: '$messages',
          preserveNullAndEmptyArrays: true,
        },
      },
      // Sort messages within each chatroom to find the latest one
      { $sort: { 'messages.createdAt': -1 } },
      {
        $group: {
          _id: '$_id',
          name: { $first: '$name' },
          hashtagId: { $first: '$hashtagId' },
          latestMessage: { $first: '$messages' },
          unreadCount: { $first: '$unreadCount' },
          createdAt: { $first: '$createdAt' },
        },
      },
      // Deterministic sort key: fall back to chatroom createdAt if no latestMessage exists
      {
        $addFields: {
          lastActivityAt: { $ifNull: ['$latestMessage.createdAt', '$createdAt'] },
        },
      },
      // Remove hidden chats from list for this user (until next message is posted)
      ...(hiddenHashtagIds.length ? [{ $match: { hashtagId: { $nin: hiddenHashtagIds } } }] : []),
      // Pin for hashtag chat list is modeled as "saved hashtag" for the current user.
      // Join the saves collection to compute isSaved and sort pinned-first.
      {
        $lookup: {
          from: 'saves',
          let: { hashtagId: '$hashtagId' },
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
          pinnedAt: { $arrayElemAt: ['$savedByCurrentUser.createdAt', 0] },
          isPinned: { $gt: [{ $size: '$savedByCurrentUser' }, 0] },
        },
      },
      // Sort chatrooms pinned-first, then by last activity (latest message or chatroom createdAt).
      // Add a stable tie-breaker (_id) so repeated refetches don't reshuffle results.
      { $sort: { pinnedAt: -1, lastActivityAt: -1, _id: -1 } },
      // Lookup sender details for the latest message
      {
        $lookup: {
          from: 'users',
          localField: 'latestMessage.senderId',
          foreignField: '_id',
          as: 'senderDetails',
        },
      },
      {
        $unwind: {
          path: '$senderDetails',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          'latestMessage.senderDetails': {
            fullName: '$senderDetails.fullName',
            userName: '$senderDetails.userName',
            profilePicture: '$senderDetails.profilePicture',
          },
        },
      },
      // Lookup hashtag details
      {
        $lookup: {
          from: 'hashtags',
          localField: 'hashtagId',
          foreignField: '_id',
          as: 'hashtagDetails',
        },
      },
      {
        $unwind: {
          path: '$hashtagDetails',
          preserveNullAndEmptyArrays: true,
        },
      },
      // Optional: filter by hashtag access type or ownership, based on socket payload.
      ...(normalizedType === 'myhashtags'
        ? [{ $match: { 'hashtagDetails.creatorId': userObjectId } }]
        : normalizedType
          ? [{ $match: { 'hashtagDetails.access': normalizedType } }]
          : []),
      // Shape final output
      {
        $project: {
          _id: 1,
          chatroomId: '$_id',
          name: '$hashtagDetails.name',
          hashtagId: 1,
          isSaved: 1,
          isPinned: 1,
          pinnedAt: 1,
          unreadCount: 1,
          lastActivityAt: 1,
          access: '$hashtagDetails.access',
          type: '$hashtagDetails.access',
          hashtagPhoto: '$hashtagDetails.hashtagPhoto',
          fullLocation: '$hashtagDetails.fullLocation',
          hashtagPicture: '$hashtagDetails.hashtagPicture',
          description: '$hashtagDetails.description',
          createdAt: 1,
          latestMessage: {
            content: '$latestMessage.content',
            media: '$latestMessage.media',
            messageType: '$latestMessage.messageType',
            createdAt: '$latestMessage.createdAt',
            status: '$latestMessage.status',
            isDeleted: '$latestMessage.isDeleted',
            deletedBy: '$latestMessage.deletedBy',
            deletedAt: '$latestMessage.deletedAt',
            deliveredTo: '$latestMessage.deliveredTo',
            readBy: '$latestMessage.readBy',
            senderDetails: '$latestMessage.senderDetails',
            updatedAt: '$latestMessage.updatedAt',
          },
        },
      },
      {
        $facet: {
          chatrooms: [{ $skip: (page - 1) * limit }, { $limit: parseInt(limit, 10) }],
          totalCount: [{ $count: 'count' }],
        },
      },
    ];
    const result = await chatroomServices.aggregate({ query: aggregationPipeline });
    let chatrooms = result[0].chatrooms || [];
    const totalChatrooms = result[0].totalCount.length > 0 ? result[0].totalCount[0].count : 0;

    const totalPages = Math.ceil(totalChatrooms / limit);

    // Enrich chat list with hashtag isPolicyAccepted:
    // - If current user is the creator of the hashtag => isPolicyAccepted=true always
    // - If current user is an admin for that hashtag chatroom => isPolicyAccepted=true always
    // - Else => isPolicyAccepted=true only if user has accepted the hashtag policy
    try {
      const chatroomIds = (chatrooms || [])
        .map((c) => (c && (c.chatroomId || c._id) ? new mongoose.Types.ObjectId(String(c.chatroomId || c._id)) : null))
        .filter(Boolean);

      // Get all hashtag IDs from the chatrooms
      const allHashtagIds = (chatrooms || [])
        .map((c) => (c && c.hashtagId ? new mongoose.Types.ObjectId(String(c.hashtagId)) : null))
        .filter(Boolean);

      // Which hashtags is the user the creator of?
      const createdHashtags = allHashtagIds.length
        ? await hashtagServices.find({
          filter: { _id: { $in: allHashtagIds }, creatorId: userObjectId },
          projection: { _id: 1 },
        })
        : [];
      const creatorHashtagIds = new Set((createdHashtags || []).map((h) => String(h._id)));

      // Which of these chatrooms is the user an admin of?
      const adminRooms = await chatroomServices.find({
        filter: { _id: { $in: chatroomIds }, 'admins.userId': userObjectId },
        projection: { _id: 1 },
      });
      const adminRoomIds = new Set((adminRooms || []).map((r) => String(r._id)));

      // For non-admin and non-creator rooms, check policy acceptance in bulk
      const nonPrivilegedHashtagIds = (chatrooms || [])
        .filter((c) => {
          const roomId = String(c.chatroomId || c._id);
          const hashtagId = c.hashtagId ? String(c.hashtagId) : null;
          return c && !adminRoomIds.has(roomId) && !creatorHashtagIds.has(hashtagId);
        })
        .map((c) => (c && c.hashtagId ? new mongoose.Types.ObjectId(String(c.hashtagId)) : null))
        .filter(Boolean);

      const acceptanceDocs = nonPrivilegedHashtagIds.length
        ? await hashtagPolicyAcceptanceServices.find({
          filter: { userId: userObjectId, hashtagId: { $in: nonPrivilegedHashtagIds } },
          projection: { hashtagId: 1 },
        })
        : [];
      const acceptedHashtagIds = new Set((acceptanceDocs || []).map((a) => (a && a.hashtagId ? String(a.hashtagId) : null)).filter(Boolean));

      chatrooms = (chatrooms || []).map((c) => {
        const roomId = String(c.chatroomId || c._id);
        const hashtagId = c.hashtagId ? String(c.hashtagId) : null;
        const isCreator = creatorHashtagIds.has(hashtagId);
        const isAdmin = adminRoomIds.has(roomId);
        const accepted = isCreator || isAdmin || acceptedHashtagIds.has(hashtagId);
        return {
          ...c,
          isPolicyAccepted: accepted,
        };
      });
    } catch (e) {
      // don't fail chat list if enrichment fails
      console.error('Policy enrichment failed:', e.message, e.stack);
    }

    const payload = {
      metadata: {
        totalChatrooms,
        totalPages,
        page,
        limit,
        // Echo back the requested type (or null for legacy/unfiltered callers)
        type: normalizedType || null,
      },
      chatrooms,
    };
    socket.emit(socketEvents.HASHTAG_CHAT_LIST_SUCCESS, payload);
    // Legacy / alias emit for older clients
    socket.emit(socketEvents.HASHTAG_CHAT_LIST_SUCCESS_LEGACY, payload);
  } catch (error) {
    socket.emit(socketEvents.HASHTAG_CHAT_LIST_FAILED, { message: error.message });
    socket.emit(socketEvents.HASHTAG_CHAT_LIST_FAILED_LEGACY, { message: error.message });
  }
};

exports.getBroadcastList = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const { page = 1, limit = 20 } = data || {};
    if (!userId) {
      throw new Error('User ID is required.');
    }
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Hide-from-chat-list support (chat screen "remove")
    const hidden = await hiddenHashtagChatListServices.find({
      filter: { userId: userObjectId },
      projection: { hashtagId: 1 },
    });
    const hiddenHashtagIds = (hidden || []).map((h) => h && h.hashtagId).filter(Boolean);

    const aggregationPipeline = [
      {
        $lookup: {
          from: 'participants',
          localField: '_id',
          foreignField: 'chatroomId',
          as: 'participants',
        },
      },
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
          isParticipant: { $ne: ['$_currentUserParticipant', null] },
        },
      },
      // Compute unreadCount for current user (per chatroom), respecting clearedAt + delete-for-me
      {
        $lookup: {
          from: 'messages',
          let: {
            chatroomId: '$_id',
            clearedAt: '$_clearedAt',
            currentUserId: userObjectId,
            isParticipant: '$isParticipant',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    // Only compute unread count when the user is actually a participant.
                    { $eq: ['$$isParticipant', true] },
                    { $eq: ['$chatroomId', '$$chatroomId'] },
                    { $ne: ['$senderId', '$$currentUserId'] },
                    { $eq: ['$isDeleted', false] },
                    { $not: { $in: ['$$currentUserId', { $ifNull: ['$deletedFor', []] }] } },
                    {
                      $not: {
                        $in: [
                          '$$currentUserId',
                          {
                            $map: {
                              input: { $ifNull: ['$readBy', []] },
                              as: 'rb',
                              in: '$$rb.userId',
                            },
                          },
                        ],
                      },
                    },
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
      // Lookup latest message
      {
        $lookup: {
          from: 'messages',
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
          ],
          as: 'messages',
        },
      },
      {
        $unwind: {
          path: '$messages',
          preserveNullAndEmptyArrays: true,
        },
      },
      { $sort: { 'messages.createdAt': -1 } },
      {
        $group: {
          _id: '$_id',
          name: { $first: '$name' },
          hashtagId: { $first: '$hashtagId' },
          latestMessage: { $first: '$messages' },
          unreadCount: { $first: '$unreadCount' },
          createdAt: { $first: '$createdAt' },
        },
      },
      {
        $addFields: {
          lastActivityAt: { $ifNull: ['$latestMessage.createdAt', '$createdAt'] },
        },
      },
      ...(hiddenHashtagIds.length ? [{ $match: { hashtagId: { $nin: hiddenHashtagIds } } }] : []),
      // Pin for hashtag chat list is modeled as "saved hashtag" for the current user.
      {
        $lookup: {
          from: 'saves',
          let: { hashtagId: '$hashtagId' },
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
          pinnedAt: { $arrayElemAt: ['$savedByCurrentUser.createdAt', 0] },
          isPinned: { $gt: [{ $size: '$savedByCurrentUser' }, 0] },
        },
      },
      { $sort: { pinnedAt: -1, lastActivityAt: -1, _id: -1 } },
      // Lookup sender details for the latest message
      {
        $lookup: {
          from: 'users',
          localField: 'latestMessage.senderId',
          foreignField: '_id',
          as: 'senderDetails',
        },
      },
      {
        $unwind: {
          path: '$senderDetails',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          'latestMessage.senderDetails': {
            fullName: '$senderDetails.fullName',
            userName: '$senderDetails.userName',
            profilePicture: '$senderDetails.profilePicture',
          },
        },
      },
      // Lookup hashtag details + filter broadcast
      {
        $lookup: {
          from: 'hashtags',
          localField: 'hashtagId',
          foreignField: '_id',
          as: 'hashtagDetails',
        },
      },
      {
        $unwind: {
          path: '$hashtagDetails',
          preserveNullAndEmptyArrays: true,
        },
      },
      { $match: { 'hashtagDetails.access': 'broadcast' } },
      {
        $project: {
          _id: 1,
          chatroomId: '$_id',
          name: '$hashtagDetails.name',
          hashtagId: 1,
          isSaved: 1,
          isPinned: 1,
          pinnedAt: 1,
          unreadCount: 1,
          lastActivityAt: 1,
          hashtagPhoto: '$hashtagDetails.hashtagPhoto',
          fullLocation: '$hashtagDetails.fullLocation',
          hashtagPicture: '$hashtagDetails.hashtagPicture',
          description: '$hashtagDetails.description',
          createdAt: 1,
          latestMessage: {
            content: '$latestMessage.content',
            media: '$latestMessage.media',
            messageType: '$latestMessage.messageType',
            createdAt: '$latestMessage.createdAt',
            status: '$latestMessage.status',
            isDeleted: '$latestMessage.isDeleted',
            deletedBy: '$latestMessage.deletedBy',
            deletedAt: '$latestMessage.deletedAt',
            deliveredTo: '$latestMessage.deliveredTo',
            readBy: '$latestMessage.readBy',
            senderDetails: '$latestMessage.senderDetails',
            updatedAt: '$latestMessage.updatedAt',
          },
        },
      },
      {
        $facet: {
          chatrooms: [{ $skip: (page - 1) * limit }, { $limit: parseInt(limit, 10) }],
          totalCount: [{ $count: 'count' }],
        },
      },
    ];

    const result = await chatroomServices.aggregate({ query: aggregationPipeline });
    const chatrooms = result[0].chatrooms || [];
    const totalChatrooms = result[0].totalCount.length > 0 ? result[0].totalCount[0].count : 0;

    const totalPages = Math.ceil(totalChatrooms / limit);
    socket.emit(socketEvents.BROADCAST_LIST_SUCCESS, {
      metadata: {
        totalChatrooms,
        totalPages,
        page,
        limit,
      },
      chatrooms,
      // keep same overall shape as privateChatList as well (extra fields are harmless)
      groupChats: [],
      lists: [],
    });
  } catch (error) {
    socket.emit(socketEvents.BROADCAST_LIST_FAILED, { message: error.message });
  }
};

exports.handleJoinRoom = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const {
      hashtagId, page = 1, limit = 20,
    } = data;
    if (
      !hashtagId
      || typeof hashtagId !== 'string'
      || hashtagId.trim().toLowerCase() === 'undefined'
      || hashtagId.length !== 24
    ) {
      socket.emit(socketEvents.JOIN_ROOM_FAILED, { message: 'Invalid hashtagId' });
      return;
    }
    let chatroom;
    try {
      chatroom = await chatroomServices.findOne({
        filter: { hashtagId: new mongoose.Types.ObjectId(hashtagId) },
        projection: { _id: 1, parentChatroomId: 1, name: 1 },
      });
    } catch (dbError) {
      socket.emit(socketEvents.JOIN_ROOM_FAILED, { message: 'Database error' });
      return;
    }

    if (!chatroom) {
      socket.emit(socketEvents.JOIN_ROOM_FAILED, { message: 'Chatroom not found' });
      return;
    }
    const { parentChatroomId, _id: chatroomId } = chatroom;
    const isParentChatroom = !parentChatroomId;

    // Check if hashtag is private - require accepted invite or existing participation
    const hashtag = await hashtagServices.findById({ id: hashtagId });
    if (!hashtag) {
      socket.emit(socketEvents.JOIN_ROOM_FAILED, { message: 'Hashtag not found' });
      return;
    }

    const userObjectIdForCheck = new mongoose.Types.ObjectId(userId);
    const isCreator = hashtag.creatorId && String(hashtag.creatorId) === String(userId);

    // Check if user is already a participant
    const existingParticipant = await participantServices.findOne({
      filter: { userId: userObjectIdForCheck, chatroomId },
      projection: { _id: 1, clearedAt: 1 },
    });

    let canJoin = true;
    let participant = existingParticipant;

    // If user is not already a participant and not the creator, check invite status
    if (!isCreator && !existingParticipant) {
      // Check if user has a pending invite - they must accept it first (for any hashtag type)
      const pendingInvite = await hashtagRequestServices.findOne({
        filter: {
          hashtagId: new mongoose.Types.ObjectId(hashtagId),
          targetUserId: userObjectIdForCheck,
          status: 'pending',
        },
        projection: { _id: 1 },
      });

      if (pendingInvite) {
        // User was invited but hasn't accepted - don't auto-add as participant
        socket.emit(socketEvents.JOIN_ROOM_FAILED, {
          message: 'You have a pending invite. Please accept it first.',
          pendingInvite: true,
          requestId: pendingInvite._id,
        });
        return;
      }

      // For private hashtags, also check if user has an accepted invite
      if (hashtag.access === 'private') {
        const acceptedInvite = await hashtagRequestServices.findOne({
          filter: {
            hashtagId: new mongoose.Types.ObjectId(hashtagId),
            targetUserId: userObjectIdForCheck,
            status: 'accepted',
          },
          projection: { _id: 1 },
        });

        if (!acceptedInvite) {
          canJoin = false;
          socket.emit(socketEvents.JOIN_ROOM_FAILED, {
            message: 'This is a private hashtag. You need an invite to join.',
            isPrivate: true,
          });
          return;
        }
      }
    }

    // Only create participant if not already existing and allowed to join
    if (canJoin && !existingParticipant) {
      await participantServices.findOneAndUpsert({
        filter: { userId, chatroomId },
        body: { userId, chatroomId },
      });
      participant = await participantServices.findOne({
        filter: { userId, chatroomId },
        projection: { clearedAt: 1 },
      });
    }
    const clearedAt = participant && participant.clearedAt ? participant.clearedAt : null;
    const userObjectId = userObjectIdForCheck;
    await userInteractionService.findOneAndUpsert({
      filter: { userId, hashtagId },
      body: {
        $set: { lastHashtagClick: new Date() },
        $setOnInsert: { userId, hashtagId, name: chatroom.name },
      },
    });

    // Hashtag policy acceptance flag (per user)
    // - Creator always has policy accepted
    // - Admins always have policy accepted
    // - Others need explicit acceptance record
    let isPolicyAccepted = isCreator; // Creator always accepted

    if (!isPolicyAccepted) {
      // Check if user is an admin of this chatroom
      const chatroomWithAdmins = await chatroomServices.findOne({
        filter: { _id: chatroomId, 'admins.userId': userObjectIdForCheck },
        projection: { _id: 1 },
      });
      if (chatroomWithAdmins) {
        isPolicyAccepted = true;
      }
    }

    if (!isPolicyAccepted) {
      // Check explicit policy acceptance record
      const acceptance = await hashtagPolicyAcceptanceServices.findOne({
        filter: {
          userId: new mongoose.Types.ObjectId(userId),
          hashtagId: new mongoose.Types.ObjectId(hashtagId),
        },
        projection: { _id: 1 },
      });
      isPolicyAccepted = !!acceptance;
    }

    socket.join(hashtagId);
    socket.to(hashtagId).emit(socketEvents.USER_JOINED, {
      participant,
      message: `User ${userId} has joined the chatroom.`,
    });
    const aggregationPipeline = [
      {
        $match: {
          chatroomId: isParentChatroom
            ? {
              $in: await chatroomServices
                .find({
                  filter: { $or: [{ _id: chatroomId }, { parentChatroomId: chatroomId }] },
                  projection: { _id: 1 },
                })
                .then((chatrooms) => chatrooms.map(({ _id }) => _id)),
            }
            : chatroomId,
          ...(clearedAt ? { createdAt: { $gt: clearedAt } } : {}),
          // WhatsApp-style "delete for me": exclude messages hidden by this user
          deletedFor: { $ne: userObjectId },
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
                localField: 'senderId',
                foreignField: '_id',
                as: 'senderDetails',
              },
            },
            { $unwind: '$senderDetails' },
            {
              $lookup: {
                from: 'messages',
                localField: 'parentMessageId',
                foreignField: '_id',
                as: 'parentMessage',
              },
            },
            { $unwind: { path: '$parentMessage', preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: 'users',
                localField: 'parentMessage.senderId',
                foreignField: '_id',
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
                          { $eq: ['$chatType', 'hashtag'] },
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
                isDeleted: 1,
                deletedBy: 1,
                deletedAt: 1,
                content: 1,
                messageType: 1,
                location: 1,
                poll: 1,
                media: 1,
                mediaAssetId: 1,
                mediaModeration: 1,
                status: 1,
                deliveredTo: 1,
                readBy: 1,
                isAudio: 1,
                isEdited: 1,
                editedAt: 1,
                subHashtagId: 1,
                isForwarded: 1,
                isMultipleTimesForwarded: 1,
                createdAt: 1,
                updatedAt: 1,
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
    // console.log('aggregationPipeline ===>', JSON.stringify(aggregationPipeline, null, 2));
    // Execute the aggregation
    const result = await messageServices.aggregate({ query: aggregationPipeline });
    const messages = result[0].messages || [];
    const totalMessages = result[0].totalCount.length > 0 ? result[0].totalCount[0].count : 0;
    // Calculate total pages
    const totalPages = Math.ceil(totalMessages / limit);
    const timeline = buildMessageTimeline(messages, getTimezoneOffsetMinutes(data));
    socket.emit(socketEvents.MESSAGE_HISTORY, {
      chatroomId,
      metadata: {
        totalMessages,
        totalPages,
        page,
        limit,
        isGuest: false,
      },
      policy: {
        isPolicyAccepted,
      },
      messages,
      timeline,
    });
    // const user = await participantServices.findOneAndUpsert({
    //   filter: { userId, chatroomId },
    //   body: { userId, chatroomId },
    // });

    // if (!user) {
    //   throw new Error('User is not a participant of this chatroom');
    // }

    // socket.join(hashtagId);
    // socket.to(hashtagId).emit(socketEvents.USER_JOINED, {
    //   user,
    //   message: `User ${userId} has joined the chatroom.`,
    // });
    // Consolidated aggregation pipeline for messages and sender details
    // const pagination = {
    //   skip: (page - 1) * limit,
    //   limit: parseInt(limit, 10),
    // };
    // const sort = { createdAt: -1 };
    // let messageHistory = [];

    // if (isParentChatroom) {
    //   const subChatroomIds = await chatroomServices.find({
    //     filter: { $or: [{ _id: chatroomId }, { parentChatroomId: chatroomId }] },
    //     projection: { _id: 1 },
    //   });

    //   const chatroomIds = subChatroomIds.map(({ _id: id }) => id);

    //   messageHistory = await messageServices.find({
    //     filter: { chatroomId: { $in: chatroomIds } },
    //     pagination,
    //     sort,
    //   });
    // } else {
    //   messageHistory = await messageServices.find({
    //     filter: { chatroomId },
    //     pagination,
    //     sort,
    //   });
    // }
    // socket.emit(socketEvents.MESSAGE_HISTORY, {
    //   chatroomId,
    //   messages: messageHistory,
    //   page,
    //   limit,
    // });
    socket.emit(socketEvents.JOIN_ROOM_SUCCESS, {
      message: 'Joined the chatroom successfully',
    });
  } catch (error) {
    socket.emit(socketEvents.JOIN_ROOM_FAILED, {
      message: error.message,
    });
  }
};

exports.handleSubHashtagJoinRoom = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const {
      hashtagId, subHashtagId, page = 1, limit = 20,
    } = data;
    const userObjectId = new mongoose.Types.ObjectId(userId);
    if (
      !hashtagId
      || typeof hashtagId !== 'string'
      || hashtagId.trim().toLowerCase() === 'undefined'
      || hashtagId.length !== 24
    ) {
      socket.emit(socketEvents.SUB_HASHTAG_JOIN_ROOM_FAILED, { message: 'Invalid hashtagId' });
      return;
    }
    if (
      !subHashtagId
      || typeof subHashtagId !== 'string'
      || subHashtagId.trim().toLowerCase() === 'undefined'
      || subHashtagId.length !== 24
    ) {
      socket.emit(socketEvents.SUB_HASHTAG_JOIN_ROOM_FAILED, { message: 'Invalid subHashtagId' });
      return;
    }
    let chatroom;
    try {
      chatroom = await chatroomServices.findOne({
        filter: { hashtagId: new mongoose.Types.ObjectId(hashtagId) },
        projection: { _id: 1, parentChatroomId: 1, name: 1 },
      });
    } catch (dbError) {
      socket.emit(socketEvents.SUB_HASHTAG_JOIN_ROOM_FAILED, { message: 'Database error' });
      return;
    }

    if (!chatroom) {
      socket.emit(socketEvents.SUB_HASHTAG_JOIN_ROOM_FAILED, { message: 'Chatroom not found' });
      return;
    }
    const { parentChatroomId, _id: chatroomId } = chatroom;
    const isParentChatroom = !parentChatroomId;

    const user = await participantServices.findOneAndUpsert({
      filter: { userId, chatroomId },
      body: { userId, chatroomId },
    });
    await userInteractionService.findOneAndUpsert({
      filter: { userId, hashtagId },
      body: {
        $set: { lastHashtagClick: new Date() },
        $setOnInsert: { userId, hashtagId, name: chatroom.name },
      },
    });
    console.log('Doing here');
    // const user = await participantServices.findOneAndUpsert({
    //   filter: { userId, chatroomId },
    //   body: { userId, chatroomId },
    // });
    socket.join(hashtagId);
    socket.to(hashtagId).emit(socketEvents.USER_JOINED, {
      user,
      message: `User ${userId} has joined the chatroom.`,
    });
    const aggregationPipeline = [
      {
        $match: {
          chatroomId: isParentChatroom
            ? {
              $in: await chatroomServices
                .find({
                  filter: { $or: [{ _id: chatroomId }, { parentChatroomId: chatroomId }] },
                  projection: { _id: 1 },
                })
                .then((chatrooms) => chatrooms.map(({ _id }) => _id)),
            }
            : chatroomId,
          subHashtagId: new mongoose.Types.ObjectId(subHashtagId),
          // WhatsApp-style "delete for me"
          deletedFor: { $ne: userObjectId },
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
                localField: 'senderId',
                foreignField: '_id',
                as: 'senderDetails',
              },
            },
            { $unwind: '$senderDetails' },
            {
              $lookup: {
                from: 'messages',
                localField: 'parentMessageId',
                foreignField: '_id',
                as: 'parentMessage',
              },
            },
            { $unwind: { path: '$parentMessage', preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: 'users',
                localField: 'parentMessage.senderId',
                foreignField: '_id',
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
                          { $eq: ['$chatType', 'hashtag'] },
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
                isDeleted: 1,
                deletedBy: 1,
                deletedAt: 1,
                content: 1,
                messageType: 1,
                location: 1,
                poll: 1,
                media: 1,
                mediaAssetId: 1,
                mediaModeration: 1,
                status: 1,
                deliveredTo: 1,
                readBy: 1,
                isAudio: 1,
                isEdited: 1,
                editedAt: 1,
                subHashtagId: 1,
                isForwarded: 1,
                isMultipleTimesForwarded: 1,
                createdAt: 1,
                updatedAt: 1,
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
    // console.log('aggregationPipeline ===>', JSON.stringify(aggregationPipeline, null, 2));
    // Execute the aggregation
    const result = await messageServices.aggregate({ query: aggregationPipeline });
    console.log('result ===>', JSON.stringify(result, null, 2));
    const messages = result[0].messages || [];
    const totalMessages = result[0].totalCount.length > 0 ? result[0].totalCount[0].count : 0;
    // Calculate total pages
    const totalPages = Math.ceil(totalMessages / limit);
    const timeline = buildMessageTimeline(messages, getTimezoneOffsetMinutes(data));
    socket.emit(socketEvents.SUB_HASHTAG_JOIN_ROOM_SUCCESS, {
      chatroomId,
      subHashtagId,
      metadata: {
        totalMessages,
        totalPages,
        page,
        limit,
        isGuest: false,
      },
      messages,
      timeline,
    });
    // const user = await participantServices.findOneAndUpsert({
    //   filter: { userId, chatroomId },
    //   body: { userId, chatroomId },
    // });

    // if (!user) {
    //   throw new Error('User is not a participant of this chatroom');
    // }

    // socket.join(hashtagId);
    // socket.to(hashtagId).emit(socketEvents.USER_JOINED, {
    //   user,
    //   message: `User ${userId} has joined the chatroom.`,
    // });
    // Consolidated aggregation pipeline for messages and sender details
    // const pagination = {
    //   skip: (page - 1) * limit,
    //   limit: parseInt(limit, 10),
    // };
    // const sort = { createdAt: -1 };
    // let messageHistory = [];

    // if (isParentChatroom) {
    //   const subChatroomIds = await chatroomServices.find({
    //     filter: { $or: [{ _id: chatroomId }, { parentChatroomId: chatroomId }] },
    //     projection: { _id: 1 },
    //   });

    //   const chatroomIds = subChatroomIds.map(({ _id: id }) => id);

    //   messageHistory = await messageServices.find({
    //     filter: { chatroomId: { $in: chatroomIds } },
    //     pagination,
    //     sort,
    //   });
    // } else {
    //   messageHistory = await messageServices.find({
    //     filter: { chatroomId },
    //     pagination,
    //     sort,
    //   });
    // }
    // socket.emit(socketEvents.MESSAGE_HISTORY, {
    //   chatroomId,
    //   messages: messageHistory,
    //   page,
    //   limit,
    // });
  } catch (error) {
    socket.emit(socketEvents.SUB_HASHTAG_JOIN_ROOM_FAILED, {
      message: error.message,
    });
  }
};

exports.handleGuestSeeMessages = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const { hashtagId, page = 1, limit = 20 } = data;
    if (!hashtagId || !userId) {
      throw new Error('Invalid data');
    }
    const chatroom = await chatroomServices.findOne({
      filter: { hashtagId },
      projection: { _id: 1, parentChatroomId: 1, name: 1 },
    });
    if (!chatroom) {
      logInfo('No chatroom found');
      return;
    }

    const { parentChatroomId, _id: chatroomId } = chatroom;
    const isParentChatroom = !parentChatroomId;
    const user = await participantServices.findOne({
      filter: { userId, chatroomId },
      body: { userId, chatroomId },
    });

    await userInteractionService.findOneAndUpsert({
      filter: { userId, hashtagId },
      body: {
        $set: { lastHashtagClick: new Date() },
        $setOnInsert: { userId, hashtagId, name: chatroom.name },
      },
    });
    if (user) {
      socket.join(hashtagId);
      socket.to(hashtagId).emit(socketEvents.USER_JOINED, {
        user,
        message: `User ${userId} has joined the chatroom.`,
      });

      const aggregationPipeline = [
        {
          $match: {
            chatroomId: isParentChatroom
              ? {
                $in: await chatroomServices
                  .find({
                    filter: { $or: [{ _id: chatroomId }, { parentChatroomId: chatroomId }] },
                    projection: { _id: 1 },
                  })
                  .then((chatrooms) => chatrooms.map(({ _id }) => _id)),
              }
              : chatroomId,
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
                  localField: 'senderId',
                  foreignField: '_id',
                  as: 'senderDetails',
                },
              },
              { $unwind: '$senderDetails' },
              {
                $lookup: {
                  from: 'messages',
                  localField: 'parentMessageId',
                  foreignField: '_id',
                  as: 'parentMessage',
                },
              },
              { $unwind: { path: '$parentMessage', preserveNullAndEmptyArrays: true } },
              {
                $lookup: {
                  from: 'users',
                  localField: 'parentMessage.senderId',
                  foreignField: '_id',
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
                      cond: { $eq: ['$$reaction.userId', new mongoose.Types.ObjectId(userId)] },
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
              {
                $project: {
                  _id: 1,
                  isDeleted: 1,
                  deletedBy: 1,
                  deletedAt: 1,
                  content: 1,
                  image: 1,
                  media: 1,
                  mediaAssetId: 1,
                  mediaModeration: 1,
                  status: 1,
                  deliveredTo: 1,
                  readBy: 1,
                  isAudio: 1,
                  isEdited: 1,
                  editedAt: 1,
                  subHashtagId: 1,
                  isForwarded: 1,
                  isMultipleTimesForwarded: 1,
                  createdAt: 1,
                  updatedAt: 1,
                  senderDetails: {
                    _id: '$senderDetails._id',
                    userName: '$senderDetails.userName',
                    fullName: '$senderDetails.fullName',
                    profilePicture: '$senderDetails.profilePicture',
                  },
                  emojiCounts: 1,
                  reactedByCurrentUser: 1,
                  currentUserEmoji: 1,
                  parentMessage: {
                    _id: '$parentMessage._id',
                    content: '$parentMessage.content',
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
            ],
            totalCount: [{ $count: 'count' }],
          },
        },
      ];

      const result = await messageServices.aggregate({ query: aggregationPipeline });
      const messages = result[0].messages || [];
      const totalMessages = result[0].totalCount.length > 0 ? result[0].totalCount[0].count : 0;

      const totalPages = Math.ceil(totalMessages / limit);
      const timeline = buildMessageTimeline(messages, getTimezoneOffsetMinutes(data));

      socket.emit(socketEvents.GUEST_MESSAGE_HISTORY_SUCCESS, {
        chatroomId: hashtagId,
        metadata: {
          totalMessages,
          totalPages,
          page,
          limit,
          isGuest: false,
        },
        messages,
        timeline,
      });
    } else {
      const aggregationPipeline = [
        {
          $match: {
            chatroomId: isParentChatroom
              ? {
                $in: await chatroomServices
                  .find({
                    filter: { $or: [{ _id: chatroomId }, { parentChatroomId: chatroomId }] },
                    projection: { _id: 1 },
                  })
                  .then((chatrooms) => chatrooms.map(({ _id }) => _id)),
              }
              : chatroomId,
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
                  localField: 'senderId',
                  foreignField: '_id',
                  as: 'senderDetails',
                },
              },
              { $unwind: '$senderDetails' },
              {
                $lookup: {
                  from: 'messages',
                  localField: 'parentMessageId',
                  foreignField: '_id',
                  as: 'parentMessage',
                },
              },
              { $unwind: { path: '$parentMessage', preserveNullAndEmptyArrays: true } },
              {
                $lookup: {
                  from: 'users',
                  localField: 'parentMessage.senderId',
                  foreignField: '_id',
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
                      cond: { $eq: ['$$reaction.userId', new mongoose.Types.ObjectId(userId)] },
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
              {
                $project: {
                  _id: 1,
                  isDeleted: 1,
                  deletedBy: 1,
                  deletedAt: 1,
                  content: 1,
                  image: 1,
                  media: 1,
                  mediaAssetId: 1,
                  mediaModeration: 1,
                  status: 1,
                  deliveredTo: 1,
                  readBy: 1,
                  isAudio: 1,
                  isEdited: 1,
                  editedAt: 1,
                  subHashtagId: 1,
                  isForwarded: 1,
                  isMultipleTimesForwarded: 1,
                  createdAt: 1,
                  updatedAt: 1,
                  senderDetails: {
                    _id: '$senderDetails._id',
                    userName: '$senderDetails.userName',
                    fullName: '$senderDetails.fullName',
                    profilePicture: '$senderDetails.profilePicture',
                  },
                  emojiCounts: 1,
                  reactedByCurrentUser: 1,
                  currentUserEmoji: 1,
                  parentMessage: {
                    _id: '$parentMessage._id',
                    content: '$parentMessage.content',
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
            ],
            totalCount: [{ $count: 'count' }],
          },
        },
      ];

      const result = await messageServices.aggregate({ query: aggregationPipeline });
      const messages = result[0].messages || [];
      const totalMessages = result[0].totalCount.length > 0 ? result[0].totalCount[0].count : 0;

      const totalPages = Math.ceil(totalMessages / limit);
      const timeline = buildMessageTimeline(messages, getTimezoneOffsetMinutes(data));

      socket.emit(socketEvents.GUEST_MESSAGE_HISTORY_SUCCESS, {
        chatroomId: hashtagId,
        metadata: {
          totalMessages,
          totalPages,
          page,
          limit,
          isGuest: true,
        },
        messages,
        timeline,
      });
    }
  } catch (error) {
    socket.emit(socketEvents.GUEST_MESSAGE_HISTORY_FAILED, {
      message: error.message,
    });
  }
};

exports.handleSendMessage = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const {
      hashtagId, content, media, mediaAssetId, parentMessageId, isAudio, subHashtagId, messageType, location, poll,
      forward, isMultipleTimesForwarded,
    } = data;

    if (!hashtagId || !userId) {
      throw new Error('Invalid data. Either hashtagId or userId is missing.');
    }

    const normalizedType = inferMessageType({ messageType, isAudio, media });
    // For poll messages we can derive `content` from poll.question, so don't fail early.
    if (normalizedType !== 'poll' && !content && !media) {
      throw new Error('Either one of content or media is required.');
    }

    const chatroom = await chatroomServices.findOne({ filter: { hashtagId } });

    if (!chatroom) {
      throw new Error('Chatroom not found');
    }

    const { _id: chatroomId } = chatroom;

    // Broadcast hashtag: only permitted roles can send. Everyone else can only view/comment/react.
    const hashtagDoc = await hashtagServices.findById({ id: hashtagId });
    if (!hashtagDoc) throw new Error('Hashtag not found');
    if (String(hashtagDoc.access) === 'broadcast') {
      const canSendBroadcast = !!(
        socket.isGod
        || socket.isAdmin
        || socket.isModerator
        || (typeof socket.can === 'function' && socket.can('chat:broadcast_send'))
      );
      if (!canSendBroadcast) {
        throw new Error('This is a broadcast hashtag. You can only view, comment, or react.');
      }
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

    body.messageType = normalizedType;

    // Poll messages: validate + store poll object, and set content = question (keeps existing schema validation intact).
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
    if (isAudio) {
      body.isAudio = isAudio;
    }

    if (normalizedType === 'location') {
      // Location messages: require location payload and do not allow audio/media
      if (isAudio) throw new Error('isAudio must be false for location messages');
      if (media && String(media).trim()) throw new Error('media must be empty for location messages');
      body.location = validateAndNormalizeLocation(location);
    } else {
      body.location = null;
    }
    if (normalizedType !== 'poll') {
      body.poll = null;
    }

    // Media moderation (image/video only) - do not block send; we store moderation state and update later.
    if (media || mediaAssetId) {
      const mediaTypeFromUrl = () => {
        const url = typeof media === 'string' ? media.toLowerCase() : '';
        const isVideo = /\.(mp4|mov|m4v|webm|mkv|avi|3gp)(\?|$)/.test(url);
        return isVideo ? 'video' : 'image';
      };

      if (isAudio) {
        body.mediaModeration = { status: 'skipped', isBanned: false, provider: 'rekognition' };
      } else if (mediaAssetId) {
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
    if (subHashtagId) {
      body.subHashtagId = subHashtagId;
    }
    let parentMessageSenderDetails = null;
    let parentMessage = null;

    if (parentMessageId) {
      parentMessage = await messageServices.findOne({
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

    const message = await messageServices.create({
      body,
    });

    // If any users hid this hashtag chat from their chat list, a new message should make it visible again.
    // We do this by clearing the hidden-chat-list markers for the hashtag.
    await hiddenHashtagChatListServices.deleteMany({
      filter: { hashtagId: new mongoose.Types.ObjectId(String(hashtagId)) },
    });

    // Populate sender details from the users collection
    const senderDetails = await userServices.findOne({
      filter: { _id: userId },
      projection: {
        _id: 1, userName: 1, fullName: 1, profilePicture: 1,
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
      media: message.media ? message.media : null,
      mediaAssetId: message.mediaAssetId || null,
      mediaModeration: message.mediaModeration || null,
      status: message.status || 'sent',
      deliveredTo: message.deliveredTo || [],
      readBy: message.readBy || [],
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      isAudio: message.isAudio ? message.isAudio : null,
      subHashtagId: message.subHashtagId ? message.subHashtagId : null,
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

    // Emit the new message to all other participants in the chatroom
    socket.to(hashtagId).emit(socketEvents.NEW_MESSAGE, {
      newMessage,
    });

    // Emit success with 'sent' status (single tick)
    socket.emit(socketEvents.SEND_MESSAGE_SUCCESS, {
      message: 'Message sent successfully.',
      newMessage,
      status: 'sent',
    });

    // Push unread counts update to all participants except sender (so badges update)
    const participantsForUnread = await participantServices.find({ filter: { chatroomId } });
    const otherUserIds = (participantsForUnread || [])
      .map((p) => p.userId)
      .filter((uid) => uid && uid.toString() !== userId.toString());
    pushUnreadCountsUpdateToUsers(otherUserIds).catch(() => {});

    // Only notify all participants when message contains @hashtag or @<hashtagName> (mention everyone)
    const messageContent = message.content || '';
    const shouldNotifyAll = contentIncludesHashtagMentionEveryone(messageContent, hashtagDoc.name);

    if (shouldNotifyAll) {
    // Get all participants except sender
      const participants = await participantServices.find({
        filter: { chatroomId },
      });

      // Get user details with FCM tokens for participants
      const participantUserIds = participants
        .map((p) => p.userId)
        .filter((pUserId) => pUserId.toString() !== userId.toString());

      if (participantUserIds.length > 0) {
        const getNotificationBody = () => {
          if (message.content) return 'Sent a message';
          if (message.isAudio) return 'Sent a voice note';
          const url = typeof message.media === 'string' ? message.media.toLowerCase() : '';
          const isVideo = /\.(mp4|mov|m4v|webm|mkv|avi|3gp)(\?|$)/.test(url);
          return isVideo ? 'Sent a video' : 'Sent a photo';
        };
        const notifBody = getNotificationBody();

        // Respect block rules in bulk:
        // - skip recipients who have blocked the sender
        // - skip recipients blocked by the sender
        const [blockedByRecipients, senderDoc] = await Promise.all([
          userServices.find({
            filter: { _id: { $in: participantUserIds }, 'blockedUsers.userId': new mongoose.Types.ObjectId(userId) },
            projection: { _id: 1 },
          }),
          userServices.findOne({
            filter: { _id: new mongoose.Types.ObjectId(userId) },
            projection: { blockedUsers: 1 },
          }),
        ]);
        const blockedByRecipientIds = new Set((blockedByRecipients || []).map((u) => u._id.toString()));
        const blockedBySenderIds = new Set(
          ((senderDoc && senderDoc.blockedUsers) || []).map((b) => b.userId.toString()),
        );

        const eligibleRecipientIds = participantUserIds.filter(
          (rid) => !blockedByRecipientIds.has(rid.toString()) && !blockedBySenderIds.has(rid.toString()),
        );

        // Respect hashtag notification mutes in bulk
        const now = new Date();
        const mutedDocs = await userServices.find({
          filter: {
            _id: { $in: eligibleRecipientIds },
            mutedHashtags: {
              $elemMatch: {
                hashtagId: new mongoose.Types.ObjectId(String(hashtagId)),
                $or: [
                  { isPermanent: true },
                  { mutedUntil: { $gt: now } },
                ],
              },
            },
          },
          projection: { _id: 1 },
        });
        const mutedRecipientIds = new Set((mutedDocs || []).map((u) => u && u._id && u._id.toString()).filter(Boolean));
        const finalRecipientIds = (eligibleRecipientIds || []).filter((rid) => !mutedRecipientIds.has(String(rid)));

        const participantUsers = await userServices.find({
          filter: { _id: { $in: finalRecipientIds } },
          projection: { _id: 1, fcmToken: 1 },
        });

        // Create in-app notifications for recipients
        const notifSummary = `${senderDetails.fullName || senderDetails.userName || 'Someone'}: ${message.content || notifBody}`;
        await Promise.allSettled(
          (finalRecipientIds || []).map((rid) => notificationService.create({
            body: {
              userId: rid,
              senderId: new mongoose.Types.ObjectId(userId),
              chatroomId,
              category: 'chats',
              type: 'hashtag_message',
              summary: notifSummary,
              meta: { hashtagId, chatroomId, messageId: message._id },
            },
          })),
        );

        // Send push notifications to all participants (except sender)
        // Check global notification settings for public chats (once daily)
        const pushPromises = participantUsers
          .filter((user) => user.fcmToken)
          .map(async (user) => {
          // Check if user can receive public chat notification (enabled + once daily)
            const canReceive = await notificationSettingsServices
              .canReceivePublicChatNotification({ userId: user._id });

            if (!canReceive) {
              return { userId: user._id, success: false, skipped: true };
            }

            const result = await pushNotificationService.sendHashtagMessageNotification({
              fcmToken: user.fcmToken,
              title: hashtagDoc.name ? `#${hashtagDoc.name}` : senderDetails.fullName,
              body: `${senderDetails.fullName || senderDetails.userName || 'Someone'}: ${message.content || notifBody}`,
              imageUrl: hashtagDoc.hashtagPicture || null,
              hashtagId,
              chatroomId,
              chatName: hashtagDoc.name || '',
              chatProfilePicture: hashtagDoc.hashtagPicture || '',
              senderId: String(userId),
              messageId: String(message._id),
            });

            if (result.success) {
            // Mark that we sent a public chat notification today
              await notificationSettingsServices.markPublicChatNotificationSent({ userId: user._id });
              return { userId: user._id, success: true };
            }
            return { userId: user._id, success: false };
          });

        const pushResults = await Promise.allSettled(pushPromises);

        // Track successful deliveries
        const successfulDeliveries = pushResults
          .filter((r) => r.status === 'fulfilled' && r.value && r.value.success)
          .map((r) => ({
            userId: r.value.userId,
            deliveredAt: new Date(),
          }));

        // If at least one push succeeded, update message status
        if (successfulDeliveries.length > 0) {
          await messageServices.findByIdAndUpdate({
            id: message._id,
            body: {
              status: 'delivered',
              $addToSet: {
                deliveredTo: { $each: successfulDeliveries },
              },
            },
          });

          // Emit delivery update to sender (double tick)
          socket.emit(socketEvents.HASHTAG_MESSAGE_DELIVERED_UPDATE, {
            messageId: message._id,
            hashtagId,
            chatroomId,
            status: 'delivered',
            deliveredTo: successfulDeliveries,
          });
        }
      }
    }
  } catch (error) {
    socket.emit(socketEvents.SEND_MESSAGE_FAILED, {
      message: error.message,
    });
  }
};

exports.handleEditMessage = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const {
      messageId, content, media, hashtagId,
    } = data;

    // Validation
    if (!messageId || !userId || !hashtagId) {
      throw new Error('Invalid data. messageId, userId, or hashtagId is missing.');
    }

    if (!content && !media) {
      throw new Error('Either content or media is required.');
    }

    // Find the message and verify ownership
    const message = await messageServices.findOne({
      filter: { _id: messageId, senderId: userId },
    });

    if (!message) {
      throw new Error('Message not found or you do not have permission to edit this message.');
    }

    // Check if message is deleted
    if (message.isDeleted) {
      throw new Error('Cannot edit a deleted message.');
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

      // Re-run moderation for media edits (image/video only). Do not block edit.
      if (message.isAudio) {
        updateBody.mediaModeration = { status: 'skipped', isBanned: false, provider: 'rekognition' };
      } else {
        const parsed = parseS3Url(media);
        if (parsed) {
          const url = typeof media === 'string' ? media.toLowerCase() : '';
          const isVideo = /\.(mp4|mov|m4v|webm|mkv|avi|3gp)(\?|$)/.test(url);
          const asset = await mediaModerationService.ensureAssetForS3Object({
            ownerUserId: userId,
            bucket: parsed.bucket,
            key: parsed.key,
            url: media,
            mediaType: isVideo ? 'video' : 'image',
          });
          updateBody.mediaAssetId = asset && asset._id ? asset._id : null;
          updateBody.mediaModeration = { status: 'pending', isBanned: false, provider: 'rekognition' };
        } else {
          updateBody.mediaModeration = { status: 'unknown', isBanned: false, provider: 'rekognition' };
        }
      }
    }

    // Update the message
    const updatedMessage = await messageServices.findOneAndUpdate({
      filter: { _id: messageId },
      body: updateBody,
    });

    // Fetch sender details
    const senderDetails = await userServices.findOne({
      filter: { _id: userId },
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
      messageType: updatedMessage.messageType || 'text',
      location: updatedMessage.location || null,
      poll: updatedMessage.poll ? publicPoll(updatedMessage.poll) : null,
      media: updatedMessage.media || null,
      mediaAssetId: updatedMessage.mediaAssetId || null,
      mediaModeration: updatedMessage.mediaModeration || null,
      status: updatedMessage.status || 'sent',
      deliveredTo: updatedMessage.deliveredTo || [],
      readBy: updatedMessage.readBy || [],
      isEdited: updatedMessage.isEdited,
      editedAt: updatedMessage.editedAt,
      createdAt: updatedMessage.createdAt,
      updatedAt: updatedMessage.updatedAt,
      isAudio: updatedMessage.isAudio || null,
      subHashtagId: updatedMessage.subHashtagId || null,
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

    // Emit to all participants in the room
    socket.to(hashtagId).emit(socketEvents.MESSAGE_EDITED, {
      editedMessage,
    });

    // Confirm to sender
    socket.emit(socketEvents.EDIT_MESSAGE_SUCCESS, {
      message: 'Message edited successfully.',
      editedMessage,
    });
  } catch (error) {
    socket.emit(socketEvents.EDIT_MESSAGE_FAILED, {
      message: error.message,
    });
  }
};

exports.handleDeleteMessage = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const { messageId } = data;
    if (!messageId || !userId) {
      throw new Error('Invalid data. messageId or userId is missing.');
    }

    const message = await messageServices.findOne({
      filter: { _id: messageId },
    });

    if (!message) {
      throw new Error('Message not found');
    }

    if (message.senderId.toString() !== userId.toString()) {
      throw new Error('You do not have the permission to delete this message');
    }

    await messageServices.findByIdAndUpdate({
      id: messageId,
      body: {
        isDeleted: true,
        deletedBy: 'author',
        deletedAt: new Date(),
      },
    });

    socket.emit(socketEvents.DELETE_MESSAGE_SUCCESS, {
      message: 'Message deleted successfully.',
    });
  } catch (error) {
    socket.emit(socketEvents.DELETE_MESSAGE_FAILED, {
      message: error.message,
    });
  }
};

exports.handleEmojiReact = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const { hashtagId, messageId, emoji } = data;

    if (!messageId || !userId || !emoji) {
      throw new Error('Invalid data. messageId, userId, and emoji are required.');
    }

    const hashtagDoc = await hashtagServices.findById({ id: hashtagId });
    if (!hashtagDoc) throw new Error('Hashtag not found');

    // Broadcast hashtags store reactions in message-reactions collection (not embedded on messages)
    if (String(hashtagDoc.access) === 'broadcast') {
      const chatroom = await chatroomServices.findOne({ filter: { hashtagId } });
      if (!chatroom) throw new Error('Chatroom not found');

      const msg = await messageServices.findOne({
        filter: { _id: new mongoose.Types.ObjectId(messageId), chatroomId: chatroom._id },
        projection: { _id: 1 },
      });
      if (!msg) throw new Error('Message not found');

      await messageReactionServices.findOneAndUpsert({
        filter: { messageId: msg._id, userId: new mongoose.Types.ObjectId(userId) },
        body: {
          $set: {
            hashtagId: new mongoose.Types.ObjectId(hashtagId),
            chatroomId: chatroom._id,
            messageId: msg._id,
            userId: new mongoose.Types.ObjectId(userId),
            emoji,
          },
        },
      });
    } else {
      // Legacy behavior: reactions embedded in messages.reactions[]
      const message = await messageServices.findOneAndUpdate({
        filter: { _id: messageId, 'reactions.userId': { $ne: userId } },
        body: { $push: { reactions: { userId, emoji } } },
      });

      // If the user has already reacted, update the emoji instead of pushing a new reaction
      if (!message) {
        await messageServices.findOneAndUpdate({
          filter: { _id: messageId, 'reactions.userId': userId },
          body: { $set: { 'reactions.$.emoji': emoji } },
        });
      }
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
    socket.to(hashtagId).emit(socketEvents.EMOJI_REACT, {
      messageId,
      reaction: reactionDetails,
    });

    socket.emit(socketEvents.EMOJI_REACT_SUCCESS, {
      message: 'Emoji reaction added successfully.',
      messageId,
      reaction: reactionDetails,
    });
  } catch (error) {
    socket.emit(socketEvents.EMOJI_REACT_FAILED, {
      message: error.message,
    });
  }
};

// Broadcast hashtag message comments (Telegram-style)
exports.handleMessageCommentAdd = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const {
      hashtagId, messageId, content, parentCommentId = null, media = [],
    } = data || {};

    if (!userId || !hashtagId || !messageId) throw new Error('Invalid data. hashtagId, messageId and userId are required.');
    if (!content || typeof content !== 'string' || !content.trim()) throw new Error('Comment content is required.');

    const hashtagDoc = await hashtagServices.findById({ id: hashtagId });
    if (!hashtagDoc) throw new Error('Hashtag not found');
    if (String(hashtagDoc.access) !== 'broadcast') throw new Error('Message comments are supported only for broadcast hashtags.');

    const chatroom = await chatroomServices.findOne({ filter: { hashtagId } });
    if (!chatroom) throw new Error('Chatroom not found');

    const msg = await messageServices.findOne({
      filter: { _id: new mongoose.Types.ObjectId(messageId), chatroomId: chatroom._id },
      projection: { _id: 1 },
    });
    if (!msg) throw new Error('Message not found');

    // Validate parent comment (if provided) belongs to same message
    let parentId = null;
    if (parentCommentId) {
      if (!mongoose.Types.ObjectId.isValid(String(parentCommentId))) throw new Error('Invalid parentCommentId');
      const parent = await messageCommentServices.findOne({
        filter: { _id: new mongoose.Types.ObjectId(parentCommentId), messageId: msg._id },
        projection: { _id: 1 },
      });
      if (!parent) throw new Error('Parent comment not found');
      parentId = parent._id;
    }

    const comment = await messageCommentServices.create({
      body: {
        hashtagId: new mongoose.Types.ObjectId(hashtagId),
        chatroomId: chatroom._id,
        messageId: msg._id,
        commentBy: new mongoose.Types.ObjectId(userId),
        content: content.trim(),
        parentCommentId: parentId,
        media: Array.isArray(media) ? media : [],
      },
    });

    const commenterDetails = await userServices.findOne({
      filter: { _id: new mongoose.Types.ObjectId(userId) },
      projection: {
        _id: 1, userName: 1, fullName: 1, profilePicture: 1,
      },
    });

    const payload = {
      messageId: msg._id,
      comment: {
        _id: comment._id,
        hashtagId: comment.hashtagId,
        chatroomId: comment.chatroomId,
        messageId: comment.messageId,
        parentCommentId: comment.parentCommentId || null,
        content: comment.content,
        media: comment.media || [],
        commenterDetails,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      },
    };

    socket.to(hashtagId).emit(socketEvents.MESSAGE_COMMENT_ADDED, payload);
    socket.emit(socketEvents.MESSAGE_COMMENT_ADD_SUCCESS, payload);
  } catch (error) {
    socket.emit(socketEvents.MESSAGE_COMMENT_ADD_FAILED, { message: error.message });
  }
};

exports.handleMessageCommentList = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const {
      hashtagId, messageId, parentCommentId = null, page = 1, limit = 20,
    } = data || {};

    if (!userId || !hashtagId || !messageId) throw new Error('Invalid data. hashtagId, messageId and userId are required.');

    const hashtagDoc = await hashtagServices.findById({ id: hashtagId });
    if (!hashtagDoc) throw new Error('Hashtag not found');
    if (String(hashtagDoc.access) !== 'broadcast') throw new Error('Message comments are supported only for broadcast hashtags.');

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const limitNumber = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNumber - 1) * limitNumber;

    const match = {
      hashtagId: new mongoose.Types.ObjectId(hashtagId),
      messageId: new mongoose.Types.ObjectId(messageId),
      parentCommentId: parentCommentId ? new mongoose.Types.ObjectId(parentCommentId) : null,
    };

    const result = await messageCommentServices.aggregate({
      query: [
        { $match: match },
        { $sort: { createdAt: -1 } },
        {
          $facet: {
            data: [
              { $skip: skip },
              { $limit: limitNumber },
              {
                $lookup: {
                  from: 'users',
                  localField: 'commentBy',
                  foreignField: '_id',
                  as: 'commenter',
                },
              },
              { $unwind: { path: '$commenter', preserveNullAndEmptyArrays: true } },
              {
                $project: {
                  _id: 1,
                  hashtagId: 1,
                  chatroomId: 1,
                  messageId: 1,
                  parentCommentId: 1,
                  content: 1,
                  media: 1,
                  createdAt: 1,
                  updatedAt: 1,
                  commenterDetails: {
                    _id: '$commenter._id',
                    userName: '$commenter.userName',
                    fullName: '$commenter.fullName',
                    profilePicture: '$commenter.profilePicture',
                  },
                },
              },
            ],
            totalCount: [{ $count: 'count' }],
          },
        },
      ],
    });

    const comments = (result && result[0] && result[0].data) ? result[0].data : [];
    const total = (result && result[0] && result[0].totalCount && result[0].totalCount[0])
      ? result[0].totalCount[0].count
      : 0;
    const totalPages = Math.ceil(total / limitNumber);

    socket.emit(socketEvents.MESSAGE_COMMENT_LIST_SUCCESS, {
      messageId,
      parentCommentId,
      metadata: {
        total,
        totalPages,
        page: pageNumber,
        limit: limitNumber,
      },
      comments,
    });
  } catch (error) {
    socket.emit(socketEvents.MESSAGE_COMMENT_LIST_FAILED, { message: error.message });
  }
};
exports.getHashtagChatroomParticipantsList = async (socket, data) => {
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
      // Lookup participants in the chatroom
      {
        $lookup: {
          from: 'participants',
          localField: '_id',
          foreignField: 'chatroomId',
          as: 'participants',
        },
      },
      // Unwind the participants array to process each participant separately
      {
        $unwind: {
          path: '$participants',
          preserveNullAndEmptyArrays: false,
        },
      },
      // Lookup user details for each participant
      {
        $lookup: {
          from: 'users',
          localField: 'participants.userId',
          foreignField: '_id',
          as: 'userDetails',
        },
      },
      // Unwind the userDetails array to simplify processing
      {
        $unwind: {
          path: '$userDetails',
          preserveNullAndEmptyArrays: false,
        },
      },
      // Add isAdmin and isModerator fields by checking chatroom admins and moderators
      {
        $addFields: {
          'userDetails.isAdmin': {
            $in: ['$participants.userId', '$admins.userId'],
          },
          'userDetails.isModerator': {
            $in: ['$participants.userId', '$moderators.userId'],
          },
        },
      },
      // Group the results to simplify the structure
      {
        $group: {
          _id: '$_id',
          participants: {
            $push: {
              userId: '$userDetails._id',
              fullName: '$userDetails.fullName',
              userName: '$userDetails.userName',
              profilePicture: '$userDetails.profilePicture',
              isAdmin: '$userDetails.isAdmin',
              isModerator: '$userDetails.isModerator',
            },
          },
        },
      },
      // Add total participant count after grouping participants
      {
        $addFields: {
          totalParticipants: { $size: '$participants' }, // Count the total participants
        },
      },
      // Pagination: Limit the number of participants shown
      {
        $facet: {
          participants: [
            { $skip: (page - 1) * limit },
            { $limit: parseInt(limit, 10) },
          ],
          totalCount: [{ $count: 'count' }],
        },
      },
      // Project the final structure, including the total count
      {
        $project: {
          participants: 1,
          totalParticipants: 1,
        },
      },
    ];

    // Execute aggregation query
    const chatroom = await chatroomServices.aggregate({ query: aggregationPipeline });

    if (!chatroom || !chatroom.length) {
      throw new Error('Chatroom not found.');
    }

    const { participants: participantsList } = chatroom[0];
    const { participants } = participantsList[0];
    const { totalParticipants } = participantsList[0];
    const totalPages = Math.ceil(totalParticipants / limit);

    // RBAC role flags (ADMIN/MASTER/MODERATOR/MEMBER/GUEST) for each participant
    // - Uses user-roles assignments + hashtag-roles definitions
    // - SUPER_ADMIN global assignment overrides per-hashtag roles
    const participantIds = (participants || []).map((p) => p && p.userId).filter(Boolean);
    const hashtagIdForRoom = await chatroomServices.findOne({
      filter: { _id: new mongoose.Types.ObjectId(chatroomId) },
      projection: { hashtagId: 1 },
    });
    const hashtagId = hashtagIdForRoom && hashtagIdForRoom.hashtagId ? hashtagIdForRoom.hashtagId : null;

    const [roleDefs, globalAssignments, hashtagAssignments] = await Promise.all([
      hashtagRoleServices.find({
        filter: { hashtagId: null, isActive: true },
        projection: { _id: 1, key: 1, level: 1 },
      }),
      userRoleServices.find({
        filter: { userId: { $in: participantIds }, hashtagId: null },
        projection: { userId: 1, hashtagRoleId: 1 },
      }),
      hashtagId ? userRoleServices.find({
        filter: { userId: { $in: participantIds }, hashtagId },
        projection: { userId: 1, hashtagRoleId: 1 },
      }) : [],
    ]);

    const roleById = new Map((roleDefs || []).map((r) => [r._id.toString(), r]));
    const globalRoleIdByUser = new Map((globalAssignments || []).map((a) => [a.userId.toString(), a.hashtagRoleId && a.hashtagRoleId.toString()]));
    const hashtagRoleIdByUser = new Map((hashtagAssignments || []).map((a) => [a.userId.toString(), a.hashtagRoleId && a.hashtagRoleId.toString()]));

    const roleKeyForUser = (uid) => {
      const globalRoleId = globalRoleIdByUser.get(uid);
      const globalRoleDoc = globalRoleId ? roleById.get(globalRoleId) : null;
      if (globalRoleDoc && String(globalRoleDoc.key).toUpperCase() === 'SUPER_ADMIN') return 'SUPER_ADMIN';
      const hashtagRoleId = hashtagRoleIdByUser.get(uid);
      const hashtagRoleDoc = hashtagRoleId ? roleById.get(hashtagRoleId) : null;
      if (hashtagRoleDoc && hashtagRoleDoc.key) return String(hashtagRoleDoc.key).toUpperCase();
      return 'GUEST';
    };

    const withRoleFlags = (participants || []).map((p) => {
      const uid = p && p.userId ? p.userId.toString() : null;
      const roleKey = uid ? roleKeyForUser(uid) : 'GUEST';
      // Preserve existing chatroom-based flags from aggregation (admins/moderators arrays),
      // and also expose RBAC-derived role flags.
      const chatroomIsAdmin = !!(p && p.isAdmin);
      const chatroomIsModerator = !!(p && p.isModerator);

      const isAdmin = chatroomIsAdmin || roleKey === 'SUPER_ADMIN';
      const isMaster = roleKey === 'MASTER';
      const isModerator = chatroomIsModerator || roleKey === 'MODERATOR';
      const isMember = roleKey === 'MEMBER';
      const isGuest = roleKey === 'GUEST' || roleKey === 'GAZER';
      return {
        ...(p || {}),
        roleKey,
        isAdmin,
        isMaster,
        isModerator,
        isMember,
        isGuest,
      };
    });

    socket.emit(socketEvents.HASHTAG_CHATROOM_PARTICIPANTS_LIST_SUCCESS, {
      metadata: {
        totalParticipants,
        totalPages,
        page,
        limit,
      },
      participants: withRoleFlags,
    });
  } catch (error) {
    socket.emit(socketEvents.HASHTAG_CHATROOM_PARTICIPANTS_LIST_FAILED, {
      message: error.message,
    });
  }
};

exports.hashtagChatAddAdmin = async (socket, data) => {
  try {
    // check if the user is god or admin or not
    if (!socket.isGod && !socket.isAdmin) {
      throw new Error('Only God or admin can perform this action.');
    }

    const { hashtagId, adminToAdd } = data;

    if (!adminToAdd) {
      throw new Error('User id to add admin is required.');
    }

    const user = await userServices.findById({ id: adminToAdd });
    if (!user) {
      throw new Error(`User having id ${adminToAdd} doesnt exist.`);
    }

    // prepare the admin object
    const newAdmin = { userId: new mongoose.Types.ObjectId(adminToAdd) };

    // Destructure properties safely with default empty arrays
    const { admins = [] } = socket.hashtagChatroom;
    const { participants = [] } = socket;

    // Check if the user is a participant in the chatroom
    const isParticipant = participants.some(
      (participant) => participant.userId.toString() === adminToAdd.toString(),
    );

    if (!isParticipant) {
      throw new Error('The user must be a participant in the chatroom to be made an admin.');
    }

    // check if the user is already admin
    const isAlreadyAdmin = admins.some(
      (admin) => admin.userId.toString() === adminToAdd.toString(),
    );

    if (isAlreadyAdmin) {
      throw new Error('The user is already admin.');
    }

    // Add the new admin to the chatroom's admins list
    const updatedChatroom = await chatroomServices.findByIdAndUpdate({
      id: socket.hashtagChatroom._id,
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

    updatedSocket.hashtagChatroom = updatedChatroom;
    updatedSocket.participants = participants;

    socket.to(hashtagId).emit(socketEvents.HASHTAG_CHAT_ADMIN_ADDED, {
      newAdmin: {
        userId: adminToAdd,
        userName: user.userName,
        fullName: user.fullName,
        profilePicture: user.profilePicture,
      },
    });

    socket.emit(socketEvents.HASHTAG_CHAT_ADD_ADMIN_SUCCESS, {
      message: 'User added as admin successfully.',
    });
  } catch (error) {
    socket.emit(socketEvents.HASHTAG_CHAT_ADD_ADMIN_FAILED, {
      message: error.message,
    });
  }
};

exports.hashtagChatRemoveAdmin = async (socket, data) => {
  try {
    // check if the user is god or admin or not
    if (!socket.isGod && !socket.isAdmin) {
      throw new Error('Only God or admin can perform this action.');
    }

    const { hashtagId, adminToRemove } = data;

    // check if the user id to be removed as admin is provided or not
    if (!adminToRemove) {
      throw new Error('User id to remove admin is required.');
    }

    // Destructure properties safely with default empty arrays
    const { admins = [] } = socket.hashtagChatroom;

    // Check if the user is currently an admin in the chatroom
    const isAdmin = admins.some(
      (admin) => admin.userId.toString() === adminToRemove.toString(),
    );

    if (!isAdmin) {
      throw new Error('The user is not an admin in this chatroom.');
    }

    // Ensure that there is at least one admin left in the chatroom
    if (admins.length <= 1) {
      throw new Error('Cannot remove amdin. There must be at least one admin in the chatroom.');
    }

    const user = await userServices.findById({ id: adminToRemove });
    if (!user) {
      throw new Error(`User having id ${adminToRemove} doesnt exist.`);
    }

    const removeAdmin = new mongoose.Types.ObjectId(adminToRemove);

    // Add the new admin to the chatroom's admins list
    const updatedChatroom = await chatroomServices.findByIdAndUpdate({
      id: socket.hashtagChatroom._id,
      body: {
        $pull: { admins: { userId: removeAdmin } }, // Remove the admin
      },
    });

    // Handle the case where the update was unsuccessful
    if (!updatedChatroom) {
      throw new Error('Failed to update chatroom admins.');
    }

    const updatedSocket = socket;
    const { participants } = socket.hashtagChatroom;

    updatedSocket.hashtagChatroom = updatedChatroom;
    updatedSocket.participants = participants;

    socket.to(hashtagId).emit(socketEvents.HASHTAG_CHAT_ADMIN_REMOVED, {
      newAdmin: {
        userId: adminToRemove,
        userName: user.userName,
        fullName: user.fullName,
        profilePicture: user.profilePicture,
      },
    });

    socket.emit(socketEvents.HASHTAG_CHAT_REMOVE_ADMIN_SUCCESS, {
      message: 'User removed as admin successfully.',
    });
  } catch (error) {
    socket.emit(socketEvents.HASHTAG_CHAT_REMOVE_ADMIN_FAILED, {
      message: error.message,
    });
  }
};

exports.hashtagChatAddModerator = async (socket, data) => {
  try {
    // Check if the user is god or admin
    if (!socket.isGod && !socket.isAdmin) {
      throw new Error('Only God or admin can perform this action.');
    }

    const { hashtagId, moderatorToAdd } = data;
    if (!moderatorToAdd) {
      throw new Error('User id to add moderator is required.');
    }

    const user = await userServices.findById({ id: moderatorToAdd });
    if (!user) {
      throw new Error(`User having id ${moderatorToAdd} doesn't exist.`);
    }

    // Check if chatroom exists
    if (!socket.hashtagChatroom) {
      throw new Error('Chatroom data is not available.');
    }

    // Destructure properties safely with default empty arrays
    const { admins = [], moderators = [] } = socket.hashtagChatroom;
    const { participants = [] } = socket;

    // Check if the user is a participant in the chatroom
    const isParticipant = participants.some(
      (participant) => participant.userId.toString() === moderatorToAdd.toString(),
    );

    if (!isParticipant) {
      throw new Error('The user must be a participant in the chatroom to be made a moderator.');
    }

    // Check if the user is already an admin
    const isAlreadyAdmin = admins.some(
      (admin) => admin.userId.toString() === moderatorToAdd.toString(),
    );

    if (isAlreadyAdmin) {
      throw new Error('The user is already an admin hence cannot be made a moderator.');
    }

    // Check if the user is already a moderator
    const isAlreadyModerator = moderators.some(
      (moderator) => moderator.userId.toString() === moderatorToAdd.toString(),
    );

    if (isAlreadyModerator) {
      throw new Error('The user is already a moderator.');
    }

    // Prepare the moderator object
    const newModerator = { userId: new mongoose.Types.ObjectId(moderatorToAdd) };

    // Add the new moderator to the chatroom's moderators list
    const updatedChatroom = await chatroomServices.findByIdAndUpdate({
      id: socket.hashtagChatroom._id,
      body: {
        $addToSet: { moderators: newModerator }, // Add the new moderator if not already present
      },
    });

    // Handle the case where the update was unsuccessful
    if (!updatedChatroom) {
      throw new Error('Failed to update chatroom moderators.');
    }

    // Update socket data with the updated chatroom and existing participants
    const updatedSocket = socket;
    updatedSocket.hashtagChatroom = updatedChatroom;
    updatedSocket.participants = participants;

    // Emit success events
    socket.to(hashtagId).emit(socketEvents.HASHTAG_CHAT_MODERATOR_ADDED, {
      newModerator: {
        userId: moderatorToAdd,
        userName: user.userName,
        fullName: user.fullName,
        profilePicture: user.profilePicture,
      },
    });

    socket.emit(socketEvents.HASHTAG_CHAT_ADD_MODERATOR_SUCCESS, {
      message: 'User added as moderator successfully.',
    });
  } catch (error) {
    socket.emit(socketEvents.HASHTAG_CHAT_ADD_MODERATOR_FAILED, {
      message: error.message,
    });
  }
};

exports.hashtagChatRemoveModerator = async (socket, data) => {
  try {
    // check if the user is god or admin or not
    if (!socket.isGod && !socket.isAdmin) {
      throw new Error('Only God or admin can perform this action.');
    }

    const { hashtagId, moderatorToRemove } = data;

    // check if the user id to be removed as moderator is provided or not
    if (!moderatorToRemove) {
      throw new Error('User id to remove moderator is required.');
    }

    // Destructure properties safely with default empty arrays
    const { moderators = [] } = socket.hashtagChatroom;

    // Check if the user is currently an moderator in the chatroom
    const isModerator = moderators.some(
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
    const updatedChatroom = await chatroomServices.findByIdAndUpdate({
      id: socket.hashtagChatroom._id,
      body: {
        $pull: { moderators: { userId: removeModerator } }, // Remove the admin
      },
    });

    // Handle the case where the update was unsuccessful
    if (!updatedChatroom) {
      throw new Error('Failed to update chatroom moderators.');
    }

    const updatedSocket = socket;
    const { participants } = socket.hashtagChatroom;

    updatedSocket.hashtagChatroom = updatedChatroom;
    updatedSocket.participants = participants;

    socket.to(hashtagId).emit(socketEvents.HASHTAG_CHAT_MODERATOR_REMOVED, {
      newAdmin: {
        userId: moderatorToRemove,
        userName: user.userName,
        fullName: user.fullName,
        profilePicture: user.profilePicture,
      },
    });

    socket.emit(socketEvents.HASHTAG_CHAT_REMOVE_MODERATOR_SUCCESS, {
      message: 'User removed as moderator successfully.',
    });
  } catch (error) {
    socket.emit(socketEvents.HASHTAG_CHAT_REMOVE_MODERATOR_FAILED, {
      message: error.message,
    });
  }
};

exports.hashtagChatAddParticipants = async (socket, data) => {
  try {
    // Check if the user is God or admin
    if (!socket.isGod && !socket.isAdmin) {
      throw new Error('Only God or admin can perform this action.');
    }

    const { hashtagId, participantsToAdd } = data;

    if (!Array.isArray(participantsToAdd) || participantsToAdd.length === 0) {
      throw new Error('A list of user ids to add participants is required.');
    }

    // Check if chatroom exists
    if (!socket.hashtagChatroom || !socket.participants) {
      throw new Error('Chatroom or Participants data is not available.');
    }

    // Validate users existence and check if they are not already participants
    const users = await userServices.find({
      filter: { _id: { $in: participantsToAdd.map((id) => new mongoose.Types.ObjectId(id)) } },
      projection: {
        _id: 1, userName: 1, fullName: 1, profilePicture: 1,
      },
    });

    const validUsers = users.map((user) => user._id.toString());
    const nonExistentUsers = participantsToAdd.filter((id) => !validUsers.includes(id));

    if (nonExistentUsers.length > 0) {
      throw new Error(`The following user(s) do not exist: ${nonExistentUsers.join(', ')}`);
    }

    const { participants = [] } = socket;

    // Check for participants who are already in the chatroom
    const existingParticipants = participants.map((p) => p.userId.toString());
    const newParticipants = participantsToAdd.filter((id) => !existingParticipants.includes(id));

    if (newParticipants.length === 0) {
      throw new Error('All users are already participants.');
    }

    const insertPromises = newParticipants.map((userId) => participantServices.create(
      {
        body: {
          userId: new mongoose.Types.ObjectId(userId),
          chatroomId: socket.hashtagChatroom._id,
        },
      },
    ));

    await Promise.all(insertPromises);

    socket.to(hashtagId).emit(socketEvents.HASHTAG_CHAT_PARTICIPANTS_ADDED, {
      newParticipants: users.filter((user) => newParticipants.includes(user._id.toString())),
    });

    socket.emit(socketEvents.HASHTAG_CHAT_ADD_PARTICIPANTS_SUCCESS, {
      message: 'Users added as participants successfully.',
    });
    pushUnreadCountsUpdateToUsers(newParticipants).catch(() => {});

    const updatedParticipants = await participantServices.find({
      filter: { chatroomId: socket.hashtagChatroom._id },
    });

    const updatedSocket = socket;
    updatedSocket.participants = updatedParticipants;
  } catch (error) {
    socket.emit(socketEvents.HASHTAG_CHAT_ADD_PARTICIPANTS_FAILED, {
      message: error.message,
    });
  }
};

exports.hashtagChatRemoveParticipants = async (socket, data) => {
  try {
    // Check if the user is God or Admin
    if (!socket.isGod && !socket.isAdmin && !socket.isModerator) {
      throw new Error('Only God or admin can perform this action.');
    }

    const { hashtagId, participantsToRemove } = data;

    if (!Array.isArray(participantsToRemove) || participantsToRemove.length === 0) {
      throw new Error('A list of user ids to remove participants is required.');
    }

    // Check if chatroom exists
    if (!socket.hashtagChatroom || !socket.participants) {
      throw new Error('Chatroom or Participants data is not available.');
    }

    // Check if participants exist in the chatroom
    const participantsInChatroom = socket.participants.map((p) => p.userId.toString());
    const participantsNotInChatroom = participantsToRemove.filter(
      (id) => !participantsInChatroom.includes(id),
    );

    if (participantsNotInChatroom.length > 0) {
      throw new Error(`The following user(s) are not participants in the chatroom: ${participantsNotInChatroom.join(', ')}`);
    }

    // Remove participants from the chatroom
    const deletePromises = participantsToRemove.map((userId) => participantServices.deleteOne(
      {
        filter: {
          userId: new mongoose.Types.ObjectId(userId),
          chatroomId: socket.hashtagChatroom._id,
        },
      },
    ));

    await Promise.all(deletePromises); // Wait for all delete operations to complete

    // Emit event to notify others about participant removal
    socket.to(hashtagId).emit(socketEvents.HASHTAG_CHAT_PARTICIPANTS_REMOVED, {
      removedParticipants: participantsToRemove,
    });

    socket.emit(socketEvents.HASHTAG_CHAT_REMOVE_PARTICIPANTS_SUCCESS, {
      message: 'Users removed from the chatroom successfully.',
    });
    const remainingIds = participantsInChatroom.filter((id) => !participantsToRemove.includes(id));
    pushUnreadCountsUpdateToUsers([...participantsToRemove, ...remainingIds]).catch(() => {});

    // Fetch the updated participants list from the database
    const updatedParticipants = await participantServices.find({
      filter: { chatroomId: socket.hashtagChatroom._id },
    });

    const updatedSocket = socket;
    updatedSocket.participants = updatedParticipants;
  } catch (error) {
    socket.emit(socketEvents.HASHTAG_CHAT_REMOVE_PARTICIPANTS_FAILED, {
      message: error.message,
    });
  }
};

exports.hashtagChatDeleteMessage = async (socket, data) => {
  try {
    const { messageId, hashtagId } = data;
    // Ensure handshake.query is available before accessing userId
    const { userId } = socket.handshake.query;
    if (!userId) {
      throw new Error('UserId is missing in the handshake query');
    }

    const message = await messageServices.findOne(
      {
        filter:
          { _id: messageId, chatroomId: socket.hashtagChatroom._id, isDeleted: false },
      },
    );

    if (!message) {
      throw new Error('Message not found in this chatroom');
    }
    // Check if the user is God or Admin
    if (!socket.isGod
      && !socket.isAdmin
      && !socket.isModerator
      && message.senderId.toString() !== userId.toString()) {
      throw new Error('You do not have the permission to delete this message');
    }

    let deletedBy = '';
    if (message.senderId.toString() === userId.toString()) {
      deletedBy = 'author';
    } else if (socket.isAdmin) {
      deletedBy = 'admin';
    } else if (socket.isModerator) {
      deletedBy = 'moderator';
    } else if (socket.isGod) {
      deletedBy = 'god';
    }

    const result = await messageServices.findOneAndUpdate({
      filter: {
        _id: messageId,
        chatroomId: socket.hashtagChatroom._id,
      },
      body: {
        $set:
        {
          isDeleted: true,
          deletedBy,
          deletedAt: new Date(),
          content: null,
          image: null,
          reactions: [],
          parentMessageId: null,
          parentMessageSenderId: null,
          parentMessageContent: null,
          parentMessageImage: null,
        },
      },
    });

    if (!result) {
      throw new Error('Either message not found or you do not permission to delete this message');
    }

    socket.to(hashtagId).emit(socketEvents.HASHTAG_CHAT_MESSAGE_DELETED, {
      messageId,
      deletedBy,
    });

    socket.emit(socketEvents.HASHTAG_CHAT_MESSAGE_DELETE_SUCCESS, {
      messageId,
    });
  } catch (error) {
    socket.emit(socketEvents.HASHTAG_CHAT_MESSAGE_DELETE_FAILED, {
      message: error.message,
    });
  }
};

// WhatsApp-style multi delete for hashtag chat messages.
// Supports:
// - scope: "self" (delete for me) -> hides messages only for current user
// - scope: "everyone" (delete for everyone) -> tombstones messages for everyone (author/admin/mod/god only)
exports.hashtagChatDeleteMessages = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const {
      hashtagId,
      messageIds,
      scope: rawScope = 'self',
    } = data || {};

    if (!userId) throw new Error('UserId is missing in the handshake query');
    if (!hashtagId) throw new Error('hashtagId is required');

    const scope = String(rawScope || 'self').toLowerCase();
    const resolvedScope = scope === 'everyone' || scope === 'all' ? 'everyone' : 'self';

    const ids = normalizeObjectIds(messageIds);
    if (!ids.length) throw new Error('messageIds is required');

    if (!socket.hashtagChatroom || !socket.hashtagChatroom._id) {
      throw new Error('Chatroom context missing; ensure checkPermissionForHashtagChat ran');
    }

    const chatroomId = socket.hashtagChatroom._id;
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Ensure the user is a participant
    const isParticipant = Array.isArray(socket.participants)
      && socket.participants.some((p) => p && p.userId && p.userId.toString() === userObjectId.toString());
    if (!isParticipant && !socket.isGod) {
      throw new Error('You are not a participant of this chatroom');
    }

    const found = await messageServices.find({
      filter: { _id: { $in: ids }, chatroomId },
      projection: { _id: 1, senderId: 1 },
    });

    const foundById = new Map((found || []).map((m) => [m._id.toString(), m]));
    const notFound = ids
      .map((oid) => oid.toString())
      .filter((id) => !foundById.has(id));

    // Delete for me (self) - can include own + others + mixed
    if (resolvedScope === 'self') {
      const updateIds = [...foundById.keys()].map((id) => new mongoose.Types.ObjectId(id));
      if (updateIds.length) {
        await messageServices.updateMany({
          filter: { _id: { $in: updateIds }, chatroomId },
          body: { $addToSet: { deletedFor: userObjectId } },
        });
      }

      socket.emit(socketEvents.HASHTAG_CHAT_DELETE_MESSAGES_SUCCESS, {
        hashtagId,
        scope: 'self',
        deletedForUserId: userId,
        deletedMessageIds: updateIds.map((x) => x.toString()),
        notFoundMessageIds: notFound,
      });
      return;
    }

    // Delete for everyone - per-message permission & per-message deletedBy
    const now = new Date();
    const deletions = [];
    const denied = [];
    const ops = [];

    [...foundById.values()].forEach((msg) => {
      const isAuthor = msg.senderId && msg.senderId.toString() === userObjectId.toString();
      const canDeleteForEveryone = isAuthor || socket.isGod || socket.isAdmin || socket.isModerator;
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
          filter: { _id: msg._id, chatroomId },
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
            },
          },
        },
      });
    });

    if (ops.length) {
      await messageServices.bulkWrite(ops);
    }

    if (deletions.length) {
      socket.to(hashtagId).emit(socketEvents.HASHTAG_CHAT_MESSAGES_DELETED, {
        hashtagId,
        scope: 'everyone',
        deletions,
      });
    }

    socket.emit(socketEvents.HASHTAG_CHAT_DELETE_MESSAGES_SUCCESS, {
      hashtagId,
      scope: 'everyone',
      deletions,
      denied,
      notFoundMessageIds: notFound,
    });
  } catch (error) {
    socket.emit(socketEvents.HASHTAG_CHAT_DELETE_MESSAGES_FAILED, {
      message: error.message,
    });
  }
};

exports.handleHashtagUserTyping = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const { hashtagId, isTyping } = data;

    if (!hashtagId) {
      throw new Error('Hashtag ID is required.');
    }

    const user = await userServices.findById({ id: userId });
    if (!user) {
      throw new Error('User not found.');
    }

    // Emit typing status to all other participants in the hashtag chatroom
    socket.to(hashtagId).emit(socketEvents.HASHTAG_USER_TYPING_UPDATE, {
      userId,
      fullName: user.fullName,
      userName: user.userName,
      profilePicture: user.profilePicture,
      isTyping,
      hashtagId,
    });

    // Also emit to the sender for confirmation (optional - for debugging)
    socket.emit(socketEvents.HASHTAG_USER_TYPING_UPDATE, {
      userId,
      fullName: user.fullName,
      userName: user.userName,
      profilePicture: user.profilePicture,
      isTyping,
      hashtagId,
      self: true, // Flag to indicate this is your own typing status
    });
  } catch (error) {
    socket.emit(socketEvents.HASHTAG_USER_TYPING_FAILED, {
      message: error.message,
    });
  }
};

exports.handleHashtagMessageDelivered = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const { messageId, hashtagId } = data;

    if (!messageId || !hashtagId) {
      throw new Error('Message ID and Hashtag ID are required.');
    }

    const message = await messageServices.findOne({
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
      const updatedMessage = await messageServices.findByIdAndUpdate({
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

      // Update status to 'delivered' if still 'sent'
      let newStatus = message.status;
      if (message.status === 'sent') {
        newStatus = 'delivered';
        await messageServices.findByIdAndUpdate({
          id: messageId,
          body: { status: 'delivered' },
        });
      }

      // Emit success to the user
      socket.emit(socketEvents.HASHTAG_MESSAGE_DELIVERED_SUCCESS, {
        messageId,
        hashtagId,
      });

      // Notify message sender about delivery
      const io = socket.server;
      io.to(hashtagId).emit(socketEvents.HASHTAG_MESSAGE_DELIVERED_UPDATE, {
        messageId,
        hashtagId,
        chatroomId: message.chatroomId,
        status: newStatus,
        deliveredTo: updatedMessage.deliveredTo,
      });
    }
  } catch (error) {
    socket.emit(socketEvents.HASHTAG_MESSAGE_DELIVERED_FAILED, {
      message: error.message,
    });
  }
};

exports.handleHashtagMessageRead = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const { messageId, hashtagId } = data;

    if (!messageId || !hashtagId) {
      throw new Error('Message ID and Hashtag ID are required.');
    }

    const message = await messageServices.findOne({
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
      const updatedMessage = await messageServices.findByIdAndUpdate({
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
      const finalMessage = await messageServices.findByIdAndUpdate({
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

      // Update status to 'read' if not already
      let newStatus = message.status;
      if (message.status !== 'read') {
        newStatus = 'read';
        await messageServices.findByIdAndUpdate({
          id: messageId,
          body: { status: 'read' },
        });
      }

      // Emit success to the user
      socket.emit(socketEvents.HASHTAG_MESSAGE_READ_SUCCESS, {
        messageId,
        hashtagId,
      });

      // Notify message sender and other participants about read status
      const io = socket.server;
      io.to(hashtagId).emit(socketEvents.HASHTAG_MESSAGE_READ_UPDATE, {
        messageId,
        hashtagId,
        chatroomId: message.chatroomId,
        status: newStatus,
        readBy: updatedMessage.readBy,
        deliveredTo: finalMessage.deliveredTo,
      });
      pushUnreadCountsUpdate(userId).catch(() => {});
    }
  } catch (error) {
    socket.emit(socketEvents.HASHTAG_MESSAGE_READ_FAILED, {
      message: error.message,
    });
  }
};

exports.handleMarkHashtagChatroomAsRead = async (socket, data) => {
  try {
    const { userId } = socket.handshake.query;
    const { hashtagId } = data;

    if (!hashtagId) {
      throw new Error('Hashtag ID is required.');
    }

    // Find the chatroom
    const chatroom = await chatroomServices.findOne({
      filter: { hashtagId },
    });

    if (!chatroom) {
      throw new Error('Chatroom not found.');
    }

    // Find all unread messages in the chatroom
    const messages = await messageServices.find({
      filter: {
        chatroomId: chatroom._id,
        senderId: { $ne: userId },
        'readBy.userId': { $ne: userId },
      },
    });

    const messageIds = messages.map((message) => message._id);

    // Mark all messages as read in parallel
    await Promise.all(
      messages.map(async (message) => {
        await messageServices.findByIdAndUpdate({
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
      }),
    );

    // Emit success
    socket.emit(socketEvents.MARK_HASHTAG_CHATROOM_AS_READ_SUCCESS, {
      hashtagId,
      count: messageIds.length,
    });

    // Notify other participants
    const io = socket.server;
    io.to(hashtagId).emit(socketEvents.HASHTAG_CHATROOM_MESSAGES_READ, {
      hashtagId,
      messageIds,
      userId,
      count: messageIds.length,
    });
    pushUnreadCountsUpdate(userId).catch(() => {});
  } catch (error) {
    socket.emit(socketEvents.MARK_HASHTAG_CHATROOM_AS_READ_FAILED, {
      message: error.message,
    });
  }
};
