const { default: mongoose } = require('mongoose');
const privateChatroomServices = require('../services/privateChatroomServices');
const privateMessageServices = require('../services/privateMessageServices');
const userServices = require('../services/userServices');
const listServices = require('../services/listServices');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { responseHandler } = require('../../lib/helpers/responseHandler');
const pollVoteServices = require('../services/pollVoteServices');
const { userRoles } = require('../../lib/constants/userConstants');
const notificationService = require('../services/notificationService');
const pushNotificationService = require('../services/pushNotificationService');

/** Create one system message (member_left or member_removed) so it appears in message history. One message per action. */
const createPrivateSystemMessage = async ({
  chatroomId,
  type,
  actorUserId,
  targetUserId = null,
  targetUserIds = null,
}) => {
  const actorId = new mongoose.Types.ObjectId(String(actorUserId));
  const actor = await userServices.findOne({
    filter: { _id: actorId },
    projection: { _id: 1, fullName: 1, userName: 1 },
  });
  const actorName = (actor && (actor.fullName || actor.userName)) || 'Someone';
  let content;
  const systemEvent = { type, actorUserId: actorId };
  if (type === 'member_left') {
    content = `${actorName} left the group`;
  } else {
    const ids = targetUserIds && targetUserIds.length
      ? targetUserIds.map((id) => new mongoose.Types.ObjectId(String(id)))
      : (targetUserId ? [new mongoose.Types.ObjectId(String(targetUserId))] : []);
    systemEvent.targetUserIds = ids;
    systemEvent.targetUserId = ids[0] || null;
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
  await privateMessageServices.create({
    body: {
      chatroomId,
      senderId: actorId,
      messageType: 'system',
      content,
      systemEvent,
      status: 'sent',
      readBy: [],
      deliveredTo: [],
    },
  });
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

const normalizeMuteDuration = (raw) => String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');

const computeMute = (rawDuration) => {
  const durationKey = normalizeMuteDuration(rawDuration);
  const now = new Date();
  if (durationKey === 'always') {
    return {
      durationKey: 'always',
      mutedAt: now,
      mutedUntil: null,
      isPermanent: true,
    };
  }
  if (durationKey === '8_hours') {
    return {
      durationKey: '8_hours',
      mutedAt: now,
      mutedUntil: new Date(now.getTime() + (8 * 60 * 60 * 1000)),
      isPermanent: false,
    };
  }
  if (durationKey === '1_day') {
    return {
      durationKey: '1_day',
      mutedAt: now,
      mutedUntil: new Date(now.getTime() + (24 * 60 * 60 * 1000)),
      isPermanent: false,
    };
  }
  return {
    durationKey,
    mutedAt: now,
    mutedUntil: null,
    isPermanent: false,
  };
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

async function assertPrivateGroupAdminOrGod({ actorUserId, chatroomId }) {
  const chatroom = await privateChatroomServices.findById({ id: new mongoose.Types.ObjectId(String(chatroomId)) });
  if (!chatroom) return { chatroom: null, isGod: false, isAdmin: false };

  if (!chatroom.isGroupChat) {
    throw new Error('This action can only be performed on group chats.');
  }

  const actor = await userServices.findById({ id: actorUserId });
  const isGod = actor && actor.role === userRoles.GOD;
  const isAdmin = (chatroom.admins || []).some((a) => a && a.userId && a.userId.toString() === String(actorUserId));
  const isParticipant = (chatroom.participants || []).some((p) => p && p.userId && p.userId.toString() === String(actorUserId));

  if (!isGod && !isAdmin) {
    throw new Error('Only God or admin can perform this action.');
  }
  if (!isGod && !isParticipant) {
    throw new Error('Only participants can manage this group.');
  }

  return { chatroom, isGod, isAdmin };
}

exports.getPrivateChatroomList = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { page = 1, limit = 20 } = req.query;

  const aggregationPipeline = [
    // Match chatrooms where the user is a participant
    {
      $match: {
        participants: {
          $elemMatch: {
            userId: new mongoose.Types.ObjectId(userId),
            deletedForMe: { $ne: true },
          },
        },
      },
    },
    // Hide 1:1 chats until at least one message exists (so recipients
    // don't see empty chats they never initiated).
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
    // Extract per-user clear marker for this chatroom
    {
      $addFields: {
        _currentUserParticipant: {
          $arrayElemAt: [
            {
              $filter: {
                input: '$participants',
                as: 'p',
                cond: { $eq: ['$$p.userId', new mongoose.Types.ObjectId(userId)] },
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
        let: { chatroomId: '$_id', clearedAt: '$_clearedAt', currentUserId: new mongoose.Types.ObjectId(userId) },
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
        let: { chatroomId: '$_id', clearedAt: '$_clearedAt', currentUserId: new mongoose.Types.ObjectId(userId) },
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
    // Lookup participants' profile details
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
        chatrooms: [{ $skip: (page - 1) * limit }, { $limit: parseInt(limit, 10) }],
        totalCount: [{ $count: 'count' }],
      },
    },
  ];

  const result = await privateChatroomServices.aggregate({ query: aggregationPipeline });

  const chatrooms = result[0].chatrooms || [];
  const totalChatrooms = result[0].totalCount.length > 0 ? result[0].totalCount[0].count : 0;

  // Calculate total pages
  const totalPages = Math.ceil(totalChatrooms / limit);

  return responseHandler({
    metadata: {
      totalChatrooms,
      totalPages,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    },
    chatrooms,
  }, res);
});

exports.exitPrivateChatroom = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { chatroomId, deleteForMe = false } = req.value;

  const chatroomObjectId = new mongoose.Types.ObjectId(String(chatroomId));
  const userObjectId = new mongoose.Types.ObjectId(String(userId));

  const chatroom = await privateChatroomServices.findById({ id: chatroomObjectId });
  if (!chatroom) return responseHandler({ message: 'Chatroom not found' }, res, 404);

  const participant = (chatroom.participants || []).find((p) => p && p.userId && p.userId.toString() === userObjectId.toString());
  if (!participant) return responseHandler({ message: 'You are not a participant of this chatroom' }, res, 400);

  const now = new Date();

  // For 1:1 chat, treat "exit" as delete for me (hide from list), since leaving doesn't make sense.
  const effectiveDeleteForMe = chatroom.isGroupChat ? !!deleteForMe : true;

  // If group chat: remove admin/moderator role from exiting user and ensure at least one admin remains among present members.
  const isAdmin = (chatroom.admins || []).some((a) => a && a.userId && a.userId.toString() === userObjectId.toString());

  // Compute admin promotion if needed (only for group chats)
  let promotedAdminUserId = null;
  if (chatroom.isGroupChat && isAdmin) {
    const remainingPresent = (chatroom.participants || [])
      .filter((p) => p && p.userId && p.userId.toString() !== userObjectId.toString())
      .filter((p) => p.isPresent !== false) // default true means present
      .map((p) => p.userId);

    // Remove exiting admin and check if any admins remain besides them
    const remainingAdmins = (chatroom.admins || [])
      .map((a) => (a && a.userId ? a.userId.toString() : null))
      .filter(Boolean)
      .filter((aid) => aid !== userObjectId.toString());

    if (remainingAdmins.length === 0 && remainingPresent.length > 0) {
      promotedAdminUserId = remainingPresent[0].toString();
    }
  }

  // Update participant flags (WhatsApp-like)
  await privateChatroomServices.findOneAndUpdate({
    filter: { _id: chatroomObjectId, 'participants.userId': userObjectId },
    body: {
      $set: {
        'participants.$.isPresent': false,
        'participants.$.exitedAt': now,
        'participants.$.deletedForMe': effectiveDeleteForMe,
        'participants.$.deletedAt': effectiveDeleteForMe ? now : null,
      },
      $pull: {
        admins: { userId: userObjectId },
        moderators: { userId: userObjectId },
        exParticipants: { userId: userObjectId },
      },
    },
  });

  // Store ex participant record with reason (separate update from $pull to avoid ConflictingUpdateOperators)
  await privateChatroomServices.findByIdAndUpdate({
    id: chatroomObjectId,
    body: { $push: { exParticipants: { userId: userObjectId, exitedAt: now, reason: 'left' } } },
  });

  // If exiting admin was the last admin, promote a remaining present participant.
  // Must be a separate update from $pull admins to avoid "ConflictingUpdateOperators" on 'admins'.
  if (promotedAdminUserId) {
    await privateChatroomServices.findByIdAndUpdate({
      id: chatroomObjectId,
      body: { $addToSet: { admins: { userId: new mongoose.Types.ObjectId(String(promotedAdminUserId)) } } },
    });
  }

  const updatedChatroom = await privateChatroomServices.findById({ id: chatroomObjectId });

  // System message "X left the group" so it appears in message history (group only)
  if (chatroom.isGroupChat) {
    try {
      await createPrivateSystemMessage({
        chatroomId: chatroomObjectId,
        type: 'member_left',
        actorUserId: userId,
      });
    } catch (e) {
      // don't fail response
    }
  }

  return responseHandler(
    {
      message: effectiveDeleteForMe ? 'Exited chatroom and deleted for me' : 'Exited chatroom',
      chatroomId,
      isGroupChat: !!chatroom.isGroupChat,
      isPresent: false,
      deleteForMe: effectiveDeleteForMe,
      promotedAdminUserId,
      chatroom: updatedChatroom,
    },
    res,
  );
});

// Update private group details (name, description, groupPicture). Admin or GOD only.
exports.updatePrivateGroupChatDetails = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { chatroomId } = req.params;
  const { name, description, groupPicture } = req.value;

  let chatroom;
  try {
    ({ chatroom } = await assertPrivateGroupAdminOrGod({ actorUserId: userId, chatroomId }));
  } catch (e) {
    const msg = e && e.message ? e.message : 'Unauthorized';
    const httpStatus = msg.includes('Only God or admin') ? 403 : 400;
    return responseHandler({ message: msg }, res, httpStatus);
  }
  if (!chatroom) return responseHandler({ message: 'Chatroom not found' }, res, 404);

  const updateBody = {};
  if (typeof name !== 'undefined') updateBody.name = name;
  if (typeof description !== 'undefined') updateBody.description = description;
  if (typeof groupPicture !== 'undefined') updateBody.groupPicture = groupPicture;

  const updated = await privateChatroomServices.findByIdAndUpdate({
    id: chatroom._id,
    body: { $set: updateBody },
  });

  return responseHandler({ chatroom: updated }, res);
});

exports.getPrivateChatroomInfo = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { chatroomId } = req.params;

  const chatroomObjectId = new mongoose.Types.ObjectId(String(chatroomId));
  const userObjectId = new mongoose.Types.ObjectId(String(userId));

  const chatroom = await privateChatroomServices.findOne({
    filter: {
      _id: chatroomObjectId,
      isGroupChat: true,
      participants: { $elemMatch: { userId: userObjectId, deletedForMe: { $ne: true } } },
    },
  });
  if (!chatroom) return responseHandler({ message: 'Chatroom not found or you are not a participant' }, res, 404);

  const participantIds = (chatroom.participants || []).map((p) => (p && p.userId ? p.userId : null)).filter(Boolean);
  const adminIds = (chatroom.admins || []).map((a) => (a && a.userId ? a.userId : null)).filter(Boolean);
  const moderatorIds = (chatroom.moderators || []).map((m) => (m && m.userId ? m.userId : null)).filter(Boolean);
  const createdById = chatroom.createdBy ? new mongoose.Types.ObjectId(String(chatroom.createdBy)) : null;

  const uniqIds = [
    ...new Set(
      [...participantIds, ...adminIds, ...moderatorIds, ...(createdById ? [createdById] : [])]
        .map((x) => String(x)),
    ),
  ].map((x) => new mongoose.Types.ObjectId(String(x)));

  const users = await userServices.find({
    filter: { _id: { $in: uniqIds } },
    projection: {
      _id: 1, fullName: 1, userName: 1, profilePicture: 1, onlineStatus: 1,
    },
  });
  const userMap = new Map((users || []).map((u) => [String(u._id), u]));

  const participants = (chatroom.participants || []).map((p) => ({
    userId: p.userId,
    user: userMap.get(String(p.userId)) || null,
    isPresent: p.isPresent !== false,
    exitedAt: p.exitedAt || null,
    deletedForMe: !!p.deletedForMe,
    deletedAt: p.deletedAt || null,
    clearedAt: p.clearedAt || null,
    pinnedAt: p.pinnedAt || null,
    notificationMutedAt: p.notificationMutedAt || null,
    notificationMutedUntil: p.notificationMutedUntil || null,
    notificationMutePermanent: !!p.notificationMutePermanent,
    notificationMuteDuration: p.notificationMuteDuration || null,
  }));

  const admins = (chatroom.admins || []).map((a) => ({
    userId: a.userId,
    user: userMap.get(String(a.userId)) || null,
  }));
  const moderators = (chatroom.moderators || []).map((m) => ({
    userId: m.userId,
    user: userMap.get(String(m.userId)) || null,
  }));

  const currentUserParticipant = (chatroom.participants || []).find(
    (p) => p && p.userId && p.userId.toString() === userObjectId.toString(),
  );
  const now = new Date();
  const isMute = !!(
    currentUserParticipant
        && (
          currentUserParticipant.notificationMutePermanent
            || (currentUserParticipant.notificationMutedUntil
                && new Date(currentUserParticipant.notificationMutedUntil).getTime() > now.getTime())
        )
  );
  const durationKey = currentUserParticipant ? (currentUserParticipant.notificationMuteDuration || null) : null;
  const muteDuration = durationKey === 'always'
    ? 'always'
    : (durationKey === '8_hours' ? '8 hours' : (durationKey === '1_day' ? '1 day' : null));

  const presentCount = participants.filter((p) => p.isPresent).length;
  const exitedCount = participants.length - presentCount;
  const activeCount = participants.filter((p) => p.user && p.user.onlineStatus === true).length;

  return responseHandler(
    {
      chatroom: {
        _id: chatroom._id,
        isGroupChat: true,
        name: chatroom.name || null,
        description: typeof chatroom.description === 'undefined' ? null : chatroom.description,
        groupPicture: typeof chatroom.groupPicture === 'undefined' ? null : chatroom.groupPicture,
        isMute,
        muteDuration,
        createdAt: chatroom.createdAt,
        updatedAt: chatroom.updatedAt,
        createdBy: createdById ? (userMap.get(String(createdById)) || { _id: createdById }) : null,
        counts: {
          totalParticipants: participants.length,
          presentCount,
          exitedCount,
          adminsCount: admins.length,
          activeCount,
        },
        admins,
        moderators,
        participants,
      },
    },
    res,
  );
});

// Extract http(s) URLs from text. Used for shared-media "links" from text messages.
const SHARED_MEDIA_MESSAGE_LIMIT = 1000;
const SHARED_MEDIA_ARRAY_CAP = 100;
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

function extractUrlsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(URL_REGEX);
  return matches ? [...new Set(matches)] : [];
}

// GET shared media: basicDetails + media (images/video/audio) + links (from text) + docs (file messages).
exports.getPrivateChatroomSharedMedia = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { chatroomId } = req.params;

  const chatroomObjectId = new mongoose.Types.ObjectId(String(chatroomId));
  const userObjectId = new mongoose.Types.ObjectId(String(userId));

  const chatroom = await privateChatroomServices.findOne({
    filter: {
      _id: chatroomObjectId,
      isGroupChat: true,
      participants: { $elemMatch: { userId: userObjectId, deletedForMe: { $ne: true } } },
    },
  });
  if (!chatroom) return responseHandler({ message: 'Chatroom not found or you are not a participant' }, res, 404);

  const participantIds = (chatroom.participants || []).map((p) => (p && p.userId ? p.userId : null)).filter(Boolean);
  const adminIds = (chatroom.admins || []).map((a) => (a && a.userId ? a.userId : null)).filter(Boolean);
  const moderatorIds = (chatroom.moderators || []).map((m) => (m && m.userId ? m.userId : null)).filter(Boolean);
  const createdById = chatroom.createdBy ? new mongoose.Types.ObjectId(String(chatroom.createdBy)) : null;

  const uniqIds = [
    ...new Set(
      [...participantIds, ...adminIds, ...moderatorIds, ...(createdById ? [createdById] : [])]
        .map((x) => String(x)),
    ),
  ].map((x) => new mongoose.Types.ObjectId(String(x)));

  const users = await userServices.find({
    filter: { _id: { $in: uniqIds } },
    projection: {
      _id: 1, fullName: 1, userName: 1, profilePicture: 1, onlineStatus: 1,
    },
  });
  const userMap = new Map((users || []).map((u) => [String(u._id), u]));

  const participants = (chatroom.participants || []).map((p) => ({
    userId: p.userId,
    user: userMap.get(String(p.userId)) || null,
    isPresent: p.isPresent !== false,
    exitedAt: p.exitedAt || null,
    deletedForMe: !!p.deletedForMe,
    deletedAt: p.deletedAt || null,
    clearedAt: p.clearedAt || null,
    pinnedAt: p.pinnedAt || null,
    notificationMutedAt: p.notificationMutedAt || null,
    notificationMutedUntil: p.notificationMutedUntil || null,
    notificationMutePermanent: !!p.notificationMutePermanent,
    notificationMuteDuration: p.notificationMuteDuration || null,
  }));

  const admins = (chatroom.admins || []).map((a) => ({
    userId: a.userId,
    user: userMap.get(String(a.userId)) || null,
  }));
  const moderators = (chatroom.moderators || []).map((m) => ({
    userId: m.userId,
    user: userMap.get(String(m.userId)) || null,
  }));

  const currentUserParticipant = (chatroom.participants || []).find(
    (p) => p && p.userId && p.userId.toString() === userObjectId.toString(),
  );
  const now = new Date();
  const isMute = !!(
    currentUserParticipant
        && (
          currentUserParticipant.notificationMutePermanent
            || (currentUserParticipant.notificationMutedUntil
                && new Date(currentUserParticipant.notificationMutedUntil).getTime() > now.getTime())
        )
  );
  const durationKey = currentUserParticipant ? (currentUserParticipant.notificationMuteDuration || null) : null;
  const muteDuration = durationKey === 'always'
    ? 'always'
    : (durationKey === '8_hours' ? '8 hours' : (durationKey === '1_day' ? '1 day' : null));

  const presentCount = participants.filter((p) => p.isPresent).length;
  const exitedCount = participants.length - presentCount;
  const activeCount = participants.filter((p) => p.user && p.user.onlineStatus === true).length;

  const basicDetails = {
    _id: chatroom._id,
    isGroupChat: true,
    name: chatroom.name || null,
    description: typeof chatroom.description === 'undefined' ? null : chatroom.description,
    groupPicture: typeof chatroom.groupPicture === 'undefined' ? null : chatroom.groupPicture,
    isMute,
    muteDuration,
    createdAt: chatroom.createdAt,
    updatedAt: chatroom.updatedAt,
    createdBy: createdById ? (userMap.get(String(createdById)) || { _id: createdById }) : null,
    counts: {
      totalParticipants: participants.length,
      presentCount,
      exitedCount,
      adminsCount: admins.length,
      activeCount,
    },
    admins,
    moderators,
    participants,
  };

  const messageFilter = {
    chatroomId: chatroomObjectId,
    isDeleted: { $ne: true },
    deletedFor: { $nin: [userObjectId] },
  };

  const messages = await privateMessageServices.find({
    filter: messageFilter,
    sort: { createdAt: -1 },
    pagination: { limit: SHARED_MEDIA_MESSAGE_LIMIT },
    projection: {
      _id: 1, senderId: 1, messageType: 1, content: 1, media: 1, createdAt: 1, sharedContent: 1,
    },
  });

  const media = [];
  const links = [];
  const docs = [];

  (messages || []).forEach((msg) => {
    const item = {
      messageId: msg._id,
      senderId: msg.senderId,
      createdAt: msg.createdAt,
    };

    if (['image', 'video', 'audio'].includes(msg.messageType) && msg.media) {
      media.push({ ...item, type: msg.messageType, url: msg.media });
    } else if (msg.messageType === 'sharedcontent' && msg.sharedContent && msg.sharedContent.mediaUrl) {
      const type = (msg.sharedContent.mediaType === 'video' || msg.sharedContent.mediaType === 'image')
        ? msg.sharedContent.mediaType
        : 'image';
      media.push({ ...item, type, url: msg.sharedContent.mediaUrl });
    } else if (msg.messageType === 'text' && msg.content) {
      const urlList = extractUrlsFromText(msg.content);
      urlList.forEach((url) => links.push({ ...item, url }));
    } else if (msg.messageType === 'file' && msg.media) {
      docs.push({ ...item, url: msg.media });
    }
  });

  const cappedMedia = media.slice(0, SHARED_MEDIA_ARRAY_CAP);
  const cappedLinks = links.slice(0, SHARED_MEDIA_ARRAY_CAP);
  const cappedDocs = docs.slice(0, SHARED_MEDIA_ARRAY_CAP);

  return responseHandler(
    {
      basicDetails,
      media: cappedMedia,
      links: cappedLinks,
      docs: cappedDocs,
    },
    res,
  );
});

// REST: Send a poll message in a private chat (for curl/postman testing)
exports.sendPrivatePoll = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const {
    chatroomId, poll, content = '', parentMessageId = null,
  } = req.value;

  const chatroom = await privateChatroomServices.findById({ id: new mongoose.Types.ObjectId(String(chatroomId)) });
  if (!chatroom) return responseHandler({ message: 'Chatroom not found' }, res, 404);

  const isParticipant = (chatroom.participants || []).some((p) => p && p.userId && p.userId.toString() === userId.toString());
  if (!isParticipant) return responseHandler({ message: 'User is not a participant of this chatroom' }, res, 403);

  const normalizedPoll = validateAndNormalizePoll(poll);

  const body = {
    senderId: userId,
    chatroomId: new mongoose.Types.ObjectId(String(chatroomId)),
    status: 'sent',
    readBy: [],
    deliveredTo: [],
    messageType: 'poll',
    poll: normalizedPoll,
    content: (typeof content === 'string' && content.trim()) ? content.trim() : normalizedPoll.question,
    media: '',
    isAudio: false,
    location: null,
  };

  if (parentMessageId) {
    const parent = await privateMessageServices.findOne({ filter: { _id: new mongoose.Types.ObjectId(String(parentMessageId)) } });
    if (!parent) return responseHandler({ message: 'Parent message not found' }, res, 404);
    body.parentMessageId = parent._id;
    body.parentMessageContent = parent.content;
    body.parentMessageMedia = parent.media;
    body.parentMessageSenderId = parent.senderId;
  }

  const message = await privateMessageServices.create({ body });
  return responseHandler({ status: 'sent', newMessage: message }, res);
});

// REST: Vote in a private poll (for curl/postman testing)
exports.votePrivatePoll = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { chatroomId, messageId, selectedOptionIds } = req.value;

  const chatroom = await privateChatroomServices.findById({ id: new mongoose.Types.ObjectId(String(chatroomId)) });
  if (!chatroom) return responseHandler({ message: 'Chatroom not found' }, res, 404);

  const isParticipant = (chatroom.participants || []).some((p) => p && p.userId && p.userId.toString() === userId.toString());
  if (!isParticipant) return responseHandler({ message: 'User is not a participant of this chatroom' }, res, 403);

  const message = await privateMessageServices.findOne({
    filter: { _id: new mongoose.Types.ObjectId(String(messageId)), chatroomId: new mongoose.Types.ObjectId(String(chatroomId)), isDeleted: false },
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
    chatType: 'private',
    messageId: message._id,
    voterId: new mongoose.Types.ObjectId(String(userId)),
  };
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

  const { totalVotes, optionCountMap } = await recomputePollCounts({ chatType: 'private', messageId: message._id });
  const newOptions = (message.poll.options || []).map((o) => ({
    ...(o.toObject ? o.toObject() : o),
    voteCount: optionCountMap.get(String(o.optionId)) || 0,
  }));
  const updated = await privateMessageServices.findByIdAndUpdate({
    id: message._id,
    body: { $set: { 'poll.totalVotes': totalVotes, 'poll.options': newOptions } },
  });

  return responseHandler({
    messageId: String(messageId),
    chatroomId: String(chatroomId),
    poll: updated.poll,
    myVote: normalizedSelected,
  }, res);
});

// List only group chats (isGroupChat: true) for the authenticated user
exports.getPrivateGroupChatList = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { page = 1, limit = 20 } = req.query;

  const aggregationPipeline = [
    // Match chatrooms where the user is a participant
    {
      $match: {
        participants: {
          $elemMatch: {
            userId: new mongoose.Types.ObjectId(userId),
            deletedForMe: { $ne: true },
          },
        },
      },
    },
    // Only group chats
    {
      $match: {
        isGroupChat: true,
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
                cond: { $eq: ['$$p.userId', new mongoose.Types.ObjectId(userId)] },
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
    // Join with privatechatrooms collection to fetch chatroom details
    {
      $lookup: {
        from: 'privatechatrooms',
        localField: '_id',
        foreignField: '_id',
        as: 'chatroomDetails',
      },
    },
    {
      $unwind: {
        path: '$chatroomDetails',
        preserveNullAndEmptyArrays: true,
      },
    },
    // Lookup messages for the chatroom from privatemessages collection
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
    // Sort messages by creation date (latest first)
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
    // Prepare preview message and filter messages sent by other participants
    {
      $addFields: {
        previewMessage: { $arrayElemAt: ['$sortedMessages', 0] },
        otherMessages: {
          $filter: {
            input: '$sortedMessages',
            as: 'msg',
            cond: { $ne: ['$$msg.senderId', new mongoose.Types.ObjectId(userId)] },
          },
        },
      },
    },
    // Find the index of the first read message from other participants
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
    // Group by chatroom ID
    {
      $group: {
        _id: '$_id',
        isGroupChat: { $first: '$isGroupChat' },
        name: { $first: '$name' },
        participants: { $first: '$participants' },
        latestMessage: { $first: '$latestMessage' },
        unreadCount: { $first: '$unreadCount' },
        createdAt: { $first: '$chatroomDetails.createdAt' },
        firstMessage: { $first: { $arrayElemAt: ['$sortedMessages', 0] } },
        pinnedAt: { $first: '$_pinnedAt' },
      },
    },
    {
      $addFields: {
        isPinned: { $ne: ['$pinnedAt', null] },
        // Use latest message time, fall back to chatroom creation date if no messages
        lastActivityAt: { $ifNull: ['$firstMessage.createdAt', '$createdAt'] },
      },
    },
    // Sort: pinned first, then by last activity (message or creation), then stable tie-breaker
    {
      $sort: { pinnedAt: -1, lastActivityAt: -1, _id: -1 },
    },
    // Lookup participants' profile details
    {
      $lookup: {
        from: 'users',
        localField: 'participants.userId',
        foreignField: '_id',
        as: 'participantDetails',
      },
    },
    // Add participant profile details to participants array
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
    // Final projection to shape the output
    {
      $project: {
        _id: 1,
        isGroupChat: 1,
        name: 1,
        createdAt: 1,
        participants: {
          userId: 1,
          fullName: 1,
          userName: 1,
          profilePicture: 1,
          onlineStatus: 1,
        },
        latestMessage: {
          $map: {
            input: '$latestMessage',
            as: 'msg',
            in: {
              _id: '$$msg._id',
              content: '$$msg.content',
              media: '$$msg.media',
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
    // Apply pagination after sorting
    {
      $facet: {
        chatrooms: [{ $skip: (page - 1) * limit }, { $limit: parseInt(limit, 10) }],
        totalCount: [{ $count: 'count' }],
      },
    },
  ];

  const result = await privateChatroomServices.aggregate({ query: aggregationPipeline });
  const chatrooms = result[0].chatrooms || [];
  const totalChatrooms = result[0].totalCount.length > 0 ? result[0].totalCount[0].count : 0;
  const totalPages = Math.ceil(totalChatrooms / limit);

  return responseHandler({
    metadata: {
      totalChatrooms,
      totalPages,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    },
    chatrooms,
  }, res);
});

exports.clearPrivateChatroomMessages = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { chatroomId } = req.value;

  const now = new Date();
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const updated = await privateChatroomServices.findOneAndUpdate({
    filter: { _id: chatroomId, 'participants.userId': userObjectId },
    body: { $set: { 'participants.$[p].clearedAt': now } },
    customOptions: {
      arrayFilters: [{ 'p.userId': userObjectId }],
    },
  });

  return responseHandler(
    {
      message: 'Messages cleared successfully',
      clearedAt: now,
      chatroomId,
      updated: !!updated,
    },
    res,
  );
});

exports.pinPrivateChatroom = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { chatroomId } = req.value;

  const now = new Date();
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const updated = await privateChatroomServices.findOneAndUpdate({
    filter: { _id: chatroomId, 'participants.userId': userObjectId },
    body: { $set: { 'participants.$[p].pinnedAt': now } },
    customOptions: {
      arrayFilters: [{ 'p.userId': userObjectId }],
    },
  });

  return responseHandler(
    {
      message: 'Chat pinned successfully',
      pinnedAt: now,
      chatroomId,
      updated: !!updated,
    },
    res,
  );
});

exports.unpinPrivateChatroom = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { chatroomId } = req.value;

  const userObjectId = new mongoose.Types.ObjectId(userId);

  const updated = await privateChatroomServices.findOneAndUpdate({
    filter: { _id: chatroomId, 'participants.userId': userObjectId },
    body: { $set: { 'participants.$[p].pinnedAt': null } },
    customOptions: {
      arrayFilters: [{ 'p.userId': userObjectId }],
    },
  });

  return responseHandler(
    {
      message: 'Chat unpinned successfully',
      pinnedAt: null,
      chatroomId,
      updated: !!updated,
    },
    res,
  );
});

exports.getPrivateGroupChatUsers = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { chatroomId } = req.params;
  const { search = '' } = req.query || {};

  const userObjectId = new mongoose.Types.ObjectId(userId);

  const chatroom = await privateChatroomServices.findOne({
    filter: { _id: chatroomId, 'participants.userId': userObjectId },
    projection: { participants: 1, isGroupChat: 1 },
  });

  if (!chatroom) {
    return responseHandler({ users: [] }, res);
  }

  // This API is intended for private GROUP chats; for 1:1 we still return the other participant if needed.
  const participantIds = (chatroom.participants || [])
    .map((p) => p.userId)
    .filter(Boolean);

  if (!participantIds.length) {
    return responseHandler({ users: [] }, res);
  }

  const trimmedSearch = typeof search === 'string' ? search.trim() : '';
  const userFilter = { _id: { $in: participantIds } };

  if (trimmedSearch) {
    const regex = new RegExp(trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    userFilter.$or = [
      { fullName: { $regex: regex } },
      { userName: { $regex: regex } },
    ];
  }

  const users = await userServices.find({
    filter: userFilter,
    projection: {
      profilePicture: 1,
      fullName: 1,
      userName: 1,
      email: 1,
    },
    sort: { fullName: 1 },
  });

  return responseHandler(
    {
      isGroupChat: !!chatroom.isGroupChat,
      users,
    },
    res,
  );
});

exports.deletePrivateChatrooms = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { chatroomIds } = req.value;

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const ids = (chatroomIds || []).map((id) => new mongoose.Types.ObjectId(id));

  const results = [];

  // Process sequentially to keep logic simple and deterministic.
  // (If you want, we can optimize with bulk ops later.)
  /* eslint-disable no-restricted-syntax */
  for (const chatroomId of ids) {
    const chatroom = await privateChatroomServices.findOne({
      filter: { _id: chatroomId, 'participants.userId': userObjectId },
      projection: {
        isGroupChat: 1, participants: 1, admins: 1, moderators: 1,
      },
    });

    if (!chatroom) {
      results.push({
        chatroomId,
        action: 'skipped',
        reason: 'not_found_or_not_participant',
      });
      continue;
    }

    // 1:1 chat -> delete from DB (for everyone)
    if (!chatroom.isGroupChat) {
      await privateMessageServices.deleteMany({ filter: { chatroomId } });
      await privateChatroomServices.deleteOne({ filter: { _id: chatroomId } });
      await listServices.updateMany({
        filter: { chatroomIds: chatroomId },
        body: { $pull: { chatroomIds: chatroomId } },
      });

      results.push({
        chatroomId,
        action: 'deleted',
      });
      continue;
    }

    // Group chat -> user leaves (chatroom should not be listed for them)
    const participantIds = (chatroom.participants || []).map((p) => p.userId).filter(Boolean);
    const otherParticipantIds = participantIds.filter((id) => id.toString() !== userObjectId.toString());

    const adminIds = (chatroom.admins || []).map((a) => a.userId).filter(Boolean);
    const isLeavingAdmin = adminIds.some((id) => id.toString() === userObjectId.toString());
    const isLastAdmin = isLeavingAdmin && adminIds.length <= 1;

    // If leaving admin is the last admin but there are other participants, promote one to admin.
    const promotionUserId = (isLastAdmin && otherParticipantIds.length) ? otherParticipantIds[0] : null;

    // If this user is the only participant, delete the group chat from DB.
    if (!otherParticipantIds.length) {
      await privateMessageServices.deleteMany({ filter: { chatroomId } });
      await privateChatroomServices.deleteOne({ filter: { _id: chatroomId } });
      await listServices.updateMany({
        filter: { chatroomIds: chatroomId },
        body: { $pull: { chatroomIds: chatroomId } },
      });

      results.push({
        chatroomId,
        action: 'deleted',
        reason: 'last_participant_left',
      });
      continue;
    }

    const update = {
      $pull: {
        participants: { userId: userObjectId },
        admins: { userId: userObjectId },
        moderators: { userId: userObjectId },
      },
    };
    // NOTE: MongoDB doesn't allow updating the same path (admins) with multiple operators
    // in a single update document (e.g. $pull + $addToSet). If we need to promote a new
    // admin, do it in a separate update before removing the leaving admin.
    if (promotionUserId) {
      await privateChatroomServices.findByIdAndUpdate({
        id: chatroomId,
        body: { $addToSet: { admins: { userId: promotionUserId } } },
      });
    }

    // Keep validators on; if promotion happened, the group still has at least one admin.
    await privateChatroomServices.findByIdAndUpdate({
      id: chatroomId,
      body: update,
    });

    // Ensure this chatroom id is removed from any lists (if present)
    await listServices.updateMany({
      filter: { chatroomIds: chatroomId },
      body: { $pull: { chatroomIds: chatroomId } },
    });

    // System message "X left the group" so it appears in message history
    try {
      await createPrivateSystemMessage({
        chatroomId,
        type: 'member_left',
        actorUserId: userObjectId,
      });
    } catch (e) {
      // don't fail response
    }

    results.push({
      chatroomId,
      action: 'left',
      promotedAdminUserId: promotionUserId || null,
    });
  }
  /* eslint-enable no-restricted-syntax */

  return responseHandler({ results }, res);
});

exports.createPrivateGroupChat = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { name, participants } = req.value;

  // Add the creator to the participants if not already included
  const participantIds = [...new Set([userId, ...participants])].map((id) => ({
    userId: id,
  }));

  const participantObjectIds = participantIds.map((p) => new mongoose.Types.ObjectId(String(p.userId)));
  const participantSetKey = participantObjectIds.map((id) => id.toString()).sort().join(',');

  const adminIds = [{ userId }];

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

  return responseHandler({ chatroom }, res);
});

exports.mutePrivateChatroomNotifications = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { chatroomId, duration } = req.value;

  const chatroomObjectId = new mongoose.Types.ObjectId(String(chatroomId));
  const userObjectId = new mongoose.Types.ObjectId(String(userId));

  const chatroom = await privateChatroomServices.findOne({
    filter: { _id: chatroomObjectId, 'participants.userId': userObjectId },
    projection: { _id: 1 },
  });
  if (!chatroom) return responseHandler({ message: 'Chatroom not found or you are not a participant' }, res, 404);

  const {
    durationKey, mutedAt, mutedUntil, isPermanent,
  } = computeMute(duration);

  await privateChatroomServices.findOneAndUpdate({
    filter: { _id: chatroomObjectId, 'participants.userId': userObjectId },
    body: {
      $set: {
        'participants.$.notificationMutedAt': mutedAt,
        'participants.$.notificationMutedUntil': mutedUntil,
        'participants.$.notificationMutePermanent': isPermanent,
        'participants.$.notificationMuteDuration': durationKey,
      },
    },
  });

  return responseHandler(
    {
      message: 'private chatroom muted successfully',
      chatroomId,
      duration: durationKey,
      mutedUntil,
      isPermanent,
    },
    res,
  );
});

exports.unmutePrivateChatroomNotifications = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { chatroomId } = req.value;

  const chatroomObjectId = new mongoose.Types.ObjectId(String(chatroomId));
  const userObjectId = new mongoose.Types.ObjectId(String(userId));

  const chatroom = await privateChatroomServices.findOne({
    filter: { _id: chatroomObjectId, 'participants.userId': userObjectId },
    projection: { _id: 1 },
  });
  if (!chatroom) return responseHandler({ message: 'Chatroom not found or you are not a participant' }, res, 404);

  await privateChatroomServices.findOneAndUpdate({
    filter: { _id: chatroomObjectId, 'participants.userId': userObjectId },
    body: {
      $set: {
        'participants.$.notificationMutedAt': null,
        'participants.$.notificationMutedUntil': null,
        'participants.$.notificationMutePermanent': false,
        'participants.$.notificationMuteDuration': null,
      },
    },
  });

  return responseHandler(
    {
      message: 'private chatroom unmuted successfully',
      chatroomId,
    },
    res,
  );
});

exports.addPrivateGroupParticipants = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { chatroomId } = req.params;
  const { participantIds } = req.value;

  const { chatroom } = await assertPrivateGroupAdminOrGod({ actorUserId: userId, chatroomId });
  if (!chatroom) return responseHandler({ message: 'Chatroom not found' }, res, 404);

  const existingIds = (chatroom.participants || []).map((p) => (p && p.userId ? p.userId.toString() : null)).filter(Boolean);
  const requestedIds = [...new Set((participantIds || []).map((x) => String(x)))];
  const newIds = requestedIds.filter((id) => !existingIds.includes(id));
  if (!newIds.length) return responseHandler({ message: 'All users are already participants.' }, res, 400);

  const users = await userServices.find({
    filter: { _id: { $in: newIds.map((id) => new mongoose.Types.ObjectId(String(id))) } },
    projection: {
      _id: 1, userName: 1, fullName: 1, profilePicture: 1,
    },
  });
  const found = new Set(users.map((u) => u._id.toString()));
  const missing = newIds.filter((id) => !found.has(String(id)));
  if (missing.length) return responseHandler({ message: `The following user(s) do not exist: ${missing.join(', ')}` }, res, 400);

  const updated = await privateChatroomServices.findByIdAndUpdate({
    id: chatroom._id,
    body: { $addToSet: { participants: { $each: newIds.map((id) => ({ userId: new mongoose.Types.ObjectId(String(id)) })) } } },
  });

  // Add: send in-app notification + push to newly added users
  try {
    const actor = await userServices.findOne({
      filter: { _id: new mongoose.Types.ObjectId(String(userId)) },
      projection: { _id: 1, fullName: 1, userName: 1 },
    });
    const actorName = (actor && (actor.fullName || actor.userName)) || 'Someone';
    const groupName = (updated && updated.name) ? updated.name : 'a group';
    const summary = `${actorName} added you to "${groupName}"`;

    await Promise.allSettled(
      newIds.map((rid) => notificationService.create({
        body: {
          userId: new mongoose.Types.ObjectId(String(rid)),
          senderId: new mongoose.Types.ObjectId(String(userId)),
          category: 'updates',
          type: 'update',
          summary,
          meta: {
            kind: 'private_group_participant_added',
            privateChatroomId: new mongoose.Types.ObjectId(String(chatroomId)),
            addedBy: new mongoose.Types.ObjectId(String(userId)),
          },
        },
      })),
    );

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
            chatProfilePicture: (updated && updated.groupPicture) || '',
            isGroupChat: 'true',
          },
        })),
    );
  } catch (e) {
    // don't fail REST response on notification errors
  }

  return responseHandler({ chatroom: updated, addedParticipants: users }, res);
});

exports.removePrivateGroupParticipants = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { chatroomId } = req.params;
  const { participantIds } = req.value;

  const { chatroom } = await assertPrivateGroupAdminOrGod({ actorUserId: userId, chatroomId });
  if (!chatroom) return responseHandler({ message: 'Chatroom not found' }, res, 404);

  const requestedIds = [...new Set((participantIds || []).map((x) => String(x)))];
  if (requestedIds.includes(String(userId))) {
    return responseHandler({ message: 'You cannot remove yourself using this action. Use leave group flow instead.' }, res, 400);
  }

  const participantIdsInRoom = (chatroom.participants || []).map((p) => (p && p.userId ? p.userId.toString() : null)).filter(Boolean);
  const notInRoom = requestedIds.filter((id) => !participantIdsInRoom.includes(id));
  if (notInRoom.length) {
    return responseHandler({ message: `The following user(s) are not participants in the chatroom: ${notInRoom.join(', ')}` }, res, 400);
  }

  const remainingParticipantIds = participantIdsInRoom.filter((id) => !requestedIds.includes(id));
  if (!remainingParticipantIds.length) {
    return responseHandler({ message: 'Cannot remove all participants from a group chat.' }, res, 400);
  }

  const adminIds = (chatroom.admins || []).map((a) => (a && a.userId ? a.userId.toString() : null)).filter(Boolean);
  const removingAdminIds = adminIds.filter((id) => requestedIds.includes(id));
  const remainingAdminIds = adminIds.filter((id) => !requestedIds.includes(id));

  let promotedAdminUserId = null;
  if (remainingAdminIds.length === 0) {
    promotedAdminUserId = remainingParticipantIds[0] || null;
    if (!promotedAdminUserId) {
      return responseHandler({ message: 'Cannot remove last admin. There must be at least one admin in the chatroom.' }, res, 400);
    }
    await privateChatroomServices.findByIdAndUpdate({
      id: chatroom._id,
      body: { $addToSet: { admins: { userId: new mongoose.Types.ObjectId(String(promotedAdminUserId)) } } },
    });
  }

  const updated = await privateChatroomServices.findByIdAndUpdate({
    id: chatroom._id,
    body: {
      $pull: {
        participants: { userId: { $in: requestedIds.map((id) => new mongoose.Types.ObjectId(String(id))) } },
        admins: { userId: { $in: removingAdminIds.map((id) => new mongoose.Types.ObjectId(String(id))) } },
        moderators: { userId: { $in: requestedIds.map((id) => new mongoose.Types.ObjectId(String(id))) } },
      },
    },
  });

  // Remove: send in-app notification + push notification to removed users
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
          userId: new mongoose.Types.ObjectId(String(rid)),
          senderId: new mongoose.Types.ObjectId(String(userId)),
          category: 'updates',
          type: 'update',
          summary,
          meta: {
            kind: 'private_group_participant_removed',
            privateChatroomId: new mongoose.Types.ObjectId(String(chatroomId)),
            removedBy: new mongoose.Types.ObjectId(String(userId)),
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
    // don't fail REST response on notification errors
  }

  // One system message for the whole action so it appears in message history
  try {
    const chatroomObjectId = new mongoose.Types.ObjectId(String(chatroomId));
    await createPrivateSystemMessage({
      chatroomId: chatroomObjectId,
      type: 'member_removed',
      actorUserId: userId,
      targetUserIds: requestedIds,
    });
  } catch (e) {
    // don't fail REST response
  }

  return responseHandler({ chatroom: updated, removedParticipants: requestedIds, promotedAdminUserId }, res);
});

exports.addPrivateGroupAdmin = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { chatroomId } = req.params;
  const { userId: adminToAdd } = req.value;

  const { chatroom } = await assertPrivateGroupAdminOrGod({ actorUserId: userId, chatroomId });
  if (!chatroom) return responseHandler({ message: 'Chatroom not found' }, res, 404);

  const isParticipant = (chatroom.participants || []).some((p) => p && p.userId && p.userId.toString() === String(adminToAdd));
  if (!isParticipant) return responseHandler({ message: 'The user must be a participant in the chatroom to be made an admin.' }, res, 400);

  const alreadyAdmin = (chatroom.admins || []).some((a) => a && a.userId && a.userId.toString() === String(adminToAdd));
  if (alreadyAdmin) return responseHandler({ message: 'The user is already admin.' }, res, 400);

  const updated = await privateChatroomServices.findByIdAndUpdate({
    id: chatroom._id,
    body: {
      $addToSet: { admins: { userId: new mongoose.Types.ObjectId(String(adminToAdd)) } },
      $pull: { moderators: { userId: new mongoose.Types.ObjectId(String(adminToAdd)) } },
    },
  });

  return responseHandler({ chatroom: updated }, res);
});

exports.removePrivateGroupAdmin = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { chatroomId } = req.params;
  const { userId: adminToRemove } = req.value;

  const { chatroom } = await assertPrivateGroupAdminOrGod({ actorUserId: userId, chatroomId });
  if (!chatroom) return responseHandler({ message: 'Chatroom not found' }, res, 404);

  const adminIds = (chatroom.admins || []).map((a) => (a && a.userId ? a.userId.toString() : null)).filter(Boolean);
  const isAdmin = adminIds.includes(String(adminToRemove));
  if (!isAdmin) return responseHandler({ message: 'The user is not an admin in this chatroom.' }, res, 400);
  if (adminIds.length <= 1) return responseHandler({ message: 'Cannot remove admin. There must be at least one admin in the chatroom.' }, res, 400);

  const updated = await privateChatroomServices.findByIdAndUpdate({
    id: chatroom._id,
    body: { $pull: { admins: { userId: new mongoose.Types.ObjectId(String(adminToRemove)) } } },
  });

  return responseHandler({ chatroom: updated }, res);
});
