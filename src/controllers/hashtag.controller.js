const { ObjectId } = require('mongodb');
const services = require('../services/hashtagServices');
const ChatroomService = require('../services/chatroomServices');
const participantServices = require('../services/participantServices');
const userServices = require('../services/userServices');
const userRoleServices = require('../services/userRoleServices');
const hashtagRoleServices = require('../services/hashtagRoleServices');
const messageServices = require('../services/messageServices');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { responseHandler, errorHandler } = require('../../lib/helpers/responseHandler');
const welcomePageServices = require('../services/welcomePageServices');
const storiesServices = require('../services/storiesServices');
const { getSavedHashtagsQuery, findOneHashTagQuery } = require('../queries/hashtag.queries');
const hashtagLikeServices = require('../services/hashtagLikeServices');
const subHashTagServices = require('../services/subHashTagServices');
const hiddenHashtagServices = require('../services/hiddenHashtagServices');
const hashtagPolicyAcceptanceServices = require('../services/hashtagPolicyAcceptanceServices');
const hiddenHashtagChatListServices = require('../services/hiddenHashtagChatListServices');
const { assignRoleByKey } = require('../helpers/hashtagRoleResolver');
const hashtagRequestServices = require('../services/hashtagRequestServices');
const notificationService = require('../services/notificationService');
const pushNotificationService = require('../services/pushNotificationService');
const { emitNewFeedHashtag } = require('../events/feedEvents');

const toObjectId = (v) => (v instanceof ObjectId ? v : new ObjectId(String(v)));

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
  // Fallback (should be blocked by Joi)
  return {
    durationKey,
    mutedAt: now,
    mutedUntil: null,
    isPermanent: false,
  };
};

exports.createHashtag = asyncHandler(async (req, res) => {
  const {
    hashtagPicture,
    scope,
    fullLocation,
    coordinates,
    name: rawName,
    description,
    access,
    parentHashtagId = null,
    stories = [],
    welcomeText = '',
    subHashtags = [],
    invites = [],
  } = req.value;

  const { userId } = req.user;
  if (parentHashtagId) {
    const parentHashtag = await services.findById({ id: parentHashtagId });
    if (!parentHashtag) {
      return errorHandler('ERR-117', res);
    }
  }

  const name = rawName.replace(/^#+/, '');
  let hashtag = await services.findOne({
    filter: { name: new RegExp(name, 'i'), parentHashtagId },
  });

  if (hashtag) {
    return errorHandler('ERR-101', res);
  }

  hashtag = await services.create({
    body: {
      creatorId: userId,
      hashtagPicture,
      welcomeText,
      scope,
      fullLocation,
      location: {
        type: 'Point',
        coordinates: [coordinates[1], coordinates[0]], // [longitude, latitude]
      },
      name,
      description,
      access,
      parentHashtagId,
    },
  });

  const { _id: hashtagId } = hashtag;

  let parentChatroomId = null;

  if (parentHashtagId) {
    // Find the parent chatroom if parentHashtagId is provided
    const parentChatroom = await ChatroomService.findOne({
      filter: { hashtagId: parentHashtagId },
    });

    if (parentChatroom) {
      parentChatroomId = parentChatroom.id;
    }
  }
  if (stories.length > 0) {
    await storiesServices.hashtagStories({ hashtagId, stories });
  }
  const chatroom = await ChatroomService.create({
    body: {
      hashtagId,
      name: hashtag.name,
      parentChatroomId,
      admins: [{ userId }],
    },
  });
  const { _id: chatroomId } = chatroom;
  await participantServices.create({
    body: {
      userId: hashtag.creatorId,
      chatroomId,
    },
  });

  // RBAC: creator becomes MASTER of this hashtag (best-effort; roles may not be seeded yet)
  try {
    await assignRoleByKey({ userId, hashtagId, roleKey: 'MASTER' });
  } catch (e) {
    // ignore
  }
  await welcomePageServices.create({
    body: {
      hashtagId,
      title: `Welcome to #${hashtag.name}`,
      description: hashtag.description,
      location: {
        type: 'Point',
        coordinates: [coordinates[1], coordinates[0]], // [longitude, latitude]
      },
      fullLocation,
    },
  });

  subHashtags.forEach(async (subHashtag) => {
    await subHashTagServices.findByIdAndUpdate(
      {
        id: subHashtag,
        body: {
          hashtagId,
        },
      },
    );
  });

  // Optional: invite members at hashtag creation time (creates pending hashtag-requests + notifications)
  const inviteSummary = { created: [], skipped: [], failed: [] };
  const inviteList = Array.isArray(invites) ? invites : [];
  const deduped = new Map();
  inviteList.forEach((inv) => {
    if (!inv || !inv.targetUserId) return;
    deduped.set(String(inv.targetUserId), { targetUserId: String(inv.targetUserId), roleKey: inv.roleKey || 'MEMBER' });
  });

  const uniqueInvites = Array.from(deduped.values()).slice(0, 50);
  // eslint-disable-next-line no-restricted-syntax
  for (const inv of uniqueInvites) {
    try {
      const { targetUserId, roleKey } = inv;
      if (String(targetUserId) === String(userId)) {
        inviteSummary.skipped.push({ targetUserId, reason: 'cannot_invite_self' });
        // eslint-disable-next-line no-continue
        continue;
      }

      const targetUser = await userServices.findById({ id: targetUserId });
      if (!targetUser) {
        inviteSummary.failed.push({ targetUserId, reason: 'target_user_not_found' });
        // eslint-disable-next-line no-continue
        continue;
      }

      // Prevent inviting existing participants (creator is already a participant; others could be added by side-effects)
      const existingParticipant = await participantServices.findOne({
        filter: { userId: toObjectId(targetUserId), chatroomId: toObjectId(chatroomId) },
        projection: { _id: 1 },
      });
      if (existingParticipant) {
        inviteSummary.skipped.push({ targetUserId, reason: 'already_participant' });
        // eslint-disable-next-line no-continue
        continue;
      }

      const request = await hashtagRequestServices.create({
        body: {
          hashtagId: toObjectId(hashtagId),
          invitedBy: toObjectId(userId),
          targetUserId: toObjectId(targetUserId),
          status: 'pending',
          roleKey,
        },
      });

      const inviterUser = await userServices.findById({ id: userId });
      const inviterName = (inviterUser && (inviterUser.fullName || inviterUser.userName)) || 'Someone';
      const hashtagName = hashtag && (hashtag.name || hashtag.slug) ? (hashtag.name || hashtag.slug) : 'a hashtag';
      const summary = `${inviterName} invited you to #${hashtagName}`;
      const hashtagMeta = hashtag ? {
        _id: hashtag && hashtag._id ? toObjectId(hashtag._id) : toObjectId(hashtagId),
        name: hashtag.name || null,
        slug: hashtag.slug || null,
        hashtagPicture: hashtag.hashtagPicture || hashtag.hashtagPhoto || null,
        hashtagBanner: hashtag.hashtagBanner || null,
        fullLocation: hashtag.fullLocation || null,
        access: hashtag.access || null,
        scope: hashtag.scope || null,
      } : { _id: toObjectId(hashtagId) };

      const notification = await notificationService.create({
        body: {
          userId: toObjectId(targetUserId),
          senderId: toObjectId(userId),
          category: 'updates',
          type: 'update',
          summary,
          meta: {
            kind: 'hashtag_invite',
            requestId: request && request._id ? request._id : null,
            hashtagId: toObjectId(hashtagId),
            hashtag: hashtagMeta,
            targetUserId: toObjectId(targetUserId),
            invitedBy: toObjectId(userId),
            status: 'pending',
            actionable: true,
            roleKey,
          },
        },
      });

      if (targetUser && targetUser.fcmToken) {
        await pushNotificationService.sendPrivateMessageNotification({
          fcmToken: targetUser.fcmToken,
          title: 'Hashtag invite',
          body: summary,
          type: 'hashtag_invite',
          data: {
            hashtagId: String(hashtagId),
            requestId: request && request._id ? String(request._id) : '',
            invitedBy: String(userId),
          },
        });
      }

      inviteSummary.created.push({
        targetUserId,
        requestId: request && request._id ? request._id.toString() : null,
        notificationId: notification && notification._id ? notification._id.toString() : null,
      });
    } catch (e) {
      // Handle duplicate pending invite (unique partial index)
      const targetUserId = inv && inv.targetUserId ? inv.targetUserId : null;
      const msg = e && e.message ? String(e.message) : '';
      if (msg.includes('duplicate key') || (e && e.code === 11000)) {
        inviteSummary.skipped.push({ targetUserId, reason: 'duplicate_pending_invite' });
      } else {
        inviteSummary.failed.push({ targetUserId, reason: 'invite_failed' });
      }
    }
  }

  // Emit newFeed socket event for public hashtags (to all connected users except creator)
  if (access === 'public') {
    try {
      const creator = await userServices.findById({ id: userId });
      emitNewFeedHashtag({
        creatorUserId: userId,
        hashtag,
        creator: creator ? {
          _id: creator._id,
          userName: creator.userName,
          fullName: creator.fullName,
          profilePicture: creator.profilePicture,
        } : null,
      });
    } catch (e) {
      // Non-blocking: don't fail hashtag creation if socket emit fails
      console.error('Failed to emit newFeedHashtag:', e.message);
    }
  }

  return responseHandler({ hashtag, chatroom, invites: inviteSummary }, res);
});

exports.muteHashtagNotifications = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { hashtagId, duration } = req.value;

  const hashtag = await services.findById({ id: hashtagId });
  if (!hashtag) return errorHandler('ERR-114', res);

  const meId = toObjectId(userId);
  const hId = toObjectId(hashtagId);
  const {
    durationKey, mutedAt, mutedUntil, isPermanent,
  } = computeMute(duration);

  // Update if exists, else add
  const updated = await userServices.findOneAndUpdate({
    filter: { _id: meId, 'mutedHashtags.hashtagId': hId },
    body: {
      $set: {
        'mutedHashtags.$.mutedAt': mutedAt,
        'mutedHashtags.$.mutedUntil': mutedUntil,
        'mutedHashtags.$.isPermanent': isPermanent,
        'mutedHashtags.$.duration': durationKey,
      },
    },
  });

  if (!updated) {
    await userServices.findByIdAndUpdate({
      id: meId,
      body: {
        $push: {
          mutedHashtags: {
            hashtagId: hId,
            mutedAt,
            mutedUntil,
            isPermanent,
            duration: durationKey,
          },
        },
      },
    });
  }

  return responseHandler(
    {
      message: 'hashtag muted successfully',
      hashtagId,
      duration: durationKey,
      mutedUntil,
      isPermanent,
    },
    res,
  );
});

exports.unmuteHashtagNotifications = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { hashtagId } = req.value;

  const meId = toObjectId(userId);
  const hId = toObjectId(hashtagId);

  await userServices.findByIdAndUpdate({
    id: meId,
    body: { $pull: { mutedHashtags: { hashtagId: hId } } },
  });

  return responseHandler(
    {
      message: 'hashtag unmuted successfully',
      hashtagId,
    },
    res,
  );
});

exports.exitHashtagChatroom = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { hashtagId, deleteForMe = false } = req.value;

  const hashtag = await services.findById({ id: hashtagId });
  if (!hashtag) return errorHandler('ERR-114', res);

  const chatroom = await ChatroomService.findOne({
    filter: { hashtagId: new ObjectId(String(hashtagId)) },
  });
  if (!chatroom) return errorHandler('ERR-116', res);

  const uId = new ObjectId(String(userId));

  const participant = await participantServices.findOne({
    filter: { userId: uId, chatroomId: chatroom._id },
    projection: { _id: 1 },
  });
  if (!participant) {
    return responseHandler({ message: 'You are not a participant of this hashtag chatroom' }, res, 400);
  }

  // If exiting admin: remove from admins/moderators and ensure at least one admin remains
  const isAdmin = (chatroom.admins || []).some((a) => a && a.userId && a.userId.toString() === uId.toString());

  // Remove participant (leaves hashtag chat)
  await participantServices.deleteOne({
    filter: { userId: uId, chatroomId: chatroom._id },
  });

  // Track ex member (best-effort) + adjust admin list
  const updateOps = {
    $pull: {
      admins: { userId: uId },
      moderators: { userId: uId },
      exParticipants: { userId: uId },
    },
    $push: {
      exParticipants: { userId: uId, exitedAt: new Date() },
    },
  };

  const updatedChatroom = await ChatroomService.findByIdAndUpdate({
    id: chatroom._id,
    body: updateOps,
  });

  let promotedAdminUserId = null;
  if (isAdmin) {
    const adminsLeft = (updatedChatroom.admins || []).map((a) => (a && a.userId ? a.userId.toString() : null)).filter(Boolean);
    if (adminsLeft.length === 0) {
      // Promote first remaining participant to admin
      const remaining = await participantServices.find({
        filter: { chatroomId: chatroom._id },
        pagination: { skip: 0, limit: 1 },
        projection: { userId: 1 },
      });
      const promote = remaining && remaining[0] && remaining[0].userId ? remaining[0].userId : null;
      if (promote) {
        promotedAdminUserId = promote.toString();
        await ChatroomService.findByIdAndUpdate({
          id: chatroom._id,
          body: { $addToSet: { admins: { userId: promote } } },
        });
      }
    }
  }

  // Optional: hide from chat list for this user (keeps membership exit state separate)
  if (deleteForMe) {
    await hiddenHashtagChatListServices.findOneAndUpsert({
      filter: { userId: uId, hashtagId: new ObjectId(String(hashtagId)) },
      body: {
        $set: { hiddenAt: new Date() },
        $setOnInsert: { userId: uId, hashtagId: new ObjectId(String(hashtagId)) },
      },
    });
  }

  return responseHandler(
    {
      message: deleteForMe ? 'Exited hashtag chatroom and deleted for me' : 'Exited hashtag chatroom',
      hashtagId,
      chatroomId: updatedChatroom._id,
      deleteForMe: !!deleteForMe,
      promotedAdminUserId,
    },
    res,
  );
});

exports.updateHashtag = asyncHandler(async (req, res) => {
  const { hashtagId } = req.params;
  const {
    name, description, access, fullLocation, hashtagPicture, hashtagPhoto, hashtagBanner, scope, parentHashtagId, subHashtags, stories,
  } = req.value;
  const updateData = {
    name,
    description,
    access,
    fullLocation,
    hashtagPicture,
    hashtagPhoto,
    hashtagBanner,
    scope,
    parentHashtagId,
  };
  if (subHashtags) {
    subHashtags.forEach(async (subHashtag) => {
      await subHashTagServices.findByIdAndUpdate({ id: subHashtag, body: { hashtagId } });
    });
  }

  // Handle stories if provided
  if (stories && stories.length > 0) {
    await storiesServices.hashtagStories({ hashtagId, stories });
  }

  // Remove undefined fields
  Object.keys(updateData).forEach((key) => updateData[key] === undefined && delete updateData[key]);

  const hashtag = await services.findByIdAndUpdate({ id: hashtagId, body: updateData });
  return responseHandler({ hashtag }, res);
});

exports.findOneHashtag = asyncHandler(async (req, res) => {
  const { hashtagId, scope } = req.value;
  const query = findOneHashTagQuery(hashtagId, scope);
  const hashtag = await services.aggregate({ query });

  if (!hashtag || hashtag.length === 0) return errorHandler('ERR-114', res);

  return responseHandler(hashtag[0], res);
});

exports.findHashtagUsers = asyncHandler(async (req, res) => {
  const { hashtagId } = req.params;
  const { search = '' } = req.value || {};
  const currentUserId = req.user?.userId;

  const hashtag = await services.findById({ id: hashtagId });
  if (!hashtag) {
    return errorHandler('ERR-114', res);
  }

  const chatroom = await ChatroomService.findOne({ filter: { hashtagId } });
  if (!chatroom) {
    return responseHandler({ users: [] }, res);
  }

  const participants = await participantServices.find({
    filter: { chatroomId: chatroom._id },
    projection: { userId: 1 },
  });

  if (!participants.length) {
    return responseHandler({ users: [] }, res);
  }

  let userIds = participants.map((participant) => participant.userId);
  // Exclude users who have blocked the current user (so they don't appear when viewer searches)
  if (currentUserId) {
    const blockedByMeList = await userServices.find({
      filter: { 'blockedUsers.userId': toObjectId(currentUserId) },
      projection: { _id: 1 },
    });
    const blockedMeSet = new Set((blockedByMeList || []).map((u) => u._id.toString()));
    userIds = userIds.filter((id) => id && !blockedMeSet.has(id.toString()));
  }

  const userFilter = { _id: { $in: userIds } };
  const trimmedSearch = typeof search === 'string' ? search.trim() : '';

  if (trimmedSearch) {
    const regex = new RegExp(escapeRegex(trimmedSearch), 'i');
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
  });

  return responseHandler({ users }, res);
});

exports.findHashtagUsersWithRoles = asyncHandler(async (req, res) => {
  const { hashtagId } = req.params;
  const { search = '' } = req.value || {};
  const currentUserId = req.user?.userId;

  const hashtag = await services.findById({ id: hashtagId });
  if (!hashtag) {
    return errorHandler('ERR-114', res);
  }

  const chatroom = await ChatroomService.findOne({ filter: { hashtagId } });
  if (!chatroom) {
    return responseHandler({ users: [] }, res);
  }

  const participants = await participantServices.find({
    filter: { chatroomId: chatroom._id },
    projection: { userId: 1 },
  });

  if (!participants.length) {
    return responseHandler({ users: [] }, res);
  }

  let userIds = participants.map((participant) => participant.userId);
  // Exclude users who have blocked the current user (so they don't appear when viewer searches)
  if (currentUserId) {
    const blockedByMeList = await userServices.find({
      filter: { 'blockedUsers.userId': toObjectId(currentUserId) },
      projection: { _id: 1 },
    });
    const blockedMeSet = new Set((blockedByMeList || []).map((u) => u._id.toString()));
    userIds = userIds.filter((id) => id && !blockedMeSet.has(id.toString()));
  }

  const userFilter = { _id: { $in: userIds } };
  const trimmedSearch = typeof search === 'string' ? search.trim() : '';

  if (trimmedSearch) {
    const regex = new RegExp(escapeRegex(trimmedSearch), 'i');
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
  });

  // Load role assignments in bulk
  const [hashtagAssignments, globalAssignments] = await Promise.all([
    userRoleServices.find({
      filter: { userId: { $in: userIds }, hashtagId: new ObjectId(hashtagId) },
      projection: { userId: 1, hashtagRoleId: 1 },
    }),
    userRoleServices.find({
      filter: { userId: { $in: userIds }, hashtagId: null },
      projection: { userId: 1, hashtagRoleId: 1 },
    }),
  ]);

  const roleIds = [
    ...(hashtagAssignments || []).map((a) => a.hashtagRoleId).filter(Boolean),
    ...(globalAssignments || []).map((a) => a.hashtagRoleId).filter(Boolean),
  ];

  const roleDocs = roleIds.length
    ? await hashtagRoleServices.find({
      filter: { _id: { $in: roleIds }, isActive: true },
      projection: { key: 1, name: 1, level: 1 },
    })
    : [];

  const roleById = new Map((roleDocs || []).map((r) => [r._id.toString(), r]));

  const globalByUser = new Map(
    (globalAssignments || []).map((a) => [a.userId.toString(), a.hashtagRoleId && a.hashtagRoleId.toString()]),
  );
  const hashtagByUser = new Map(
    (hashtagAssignments || []).map((a) => [a.userId.toString(), a.hashtagRoleId && a.hashtagRoleId.toString()]),
  );

  const usersWithRoles = (users || []).map((u) => {
    const uid = u._id.toString();

    // SUPER_ADMIN override if the global assignment resolves to SUPER_ADMIN
    const globalRoleId = globalByUser.get(uid);
    const globalRoleDoc = globalRoleId ? roleById.get(globalRoleId) : null;
    if (globalRoleDoc && globalRoleDoc.key === 'SUPER_ADMIN') {
      return {
        ...u.toObject(),
        role: {
          key: 'SUPER_ADMIN',
          name: globalRoleDoc.name,
          level: globalRoleDoc.level,
          source: 'global',
        },
      };
    }

    // Hashtag assignment
    const hashtagRoleId = hashtagByUser.get(uid);
    const hashtagRoleDoc = hashtagRoleId ? roleById.get(hashtagRoleId) : null;
    if (hashtagRoleDoc && hashtagRoleDoc.key) {
      return {
        ...u.toObject(),
        role: {
          key: hashtagRoleDoc.key,
          name: hashtagRoleDoc.name,
          level: hashtagRoleDoc.level,
          source: 'hashtag',
        },
      };
    }

    // Fallback
    return {
      ...u.toObject(),
      role: {
        key: 'GUEST',
        name: 'Guest',
        level: 1,
        source: 'fallback',
      },
    };
  });

  return responseHandler({ users: usersWithRoles }, res);
});

exports.findHashtagsByRadius = asyncHandler(async (req, res) => {
  const { longitude, latitude, radius } = req.value;
  const pipeline = [
    {
      $match: {
        location: {
          $geoWithin: {
            $centerSphere: [
              [parseFloat(longitude), parseFloat(latitude)],
              parseFloat(radius) / 6378100,
            ],
          },
        },
      },
    },
    {
      $lookup: {
        from: 'chatrooms',
        localField: '_id',
        foreignField: 'hashtagId',
        as: 'chatrooms',
      },
    },
    {
      $project: {
        _id: 1,
        name: 1,
        description: 1,
        location: 1,
        createdAt: 1,
        updatedAt: 1,
        likeCount: 1,
        hashtagPhoto: 1,
        hashtagPicture: 1,
        chatroomId: { $arrayElemAt: ['$chatrooms._id', 0] },
      },
    },
    {
      $sort: { createdAt: -1 },
    },
  ];

  const hashtags = await services.aggregate({ query: pipeline });

  return responseHandler(
    {
      hashtags,
    },
    res,
  );
});

exports.trendingChatsList = asyncHandler(async (req, res) => {
  try {
    const { pageNum = 1, pageSize = 20 } = req.value;
    const skip = (pageNum - 1) * pageSize;

    const aggregationPipeline = [
      {
        $lookup: {
          from: 'messages',
          localField: '_id',
          foreignField: 'chatroomId',
          as: 'messages',
        },
      },
      {
        $addFields: {
          messageCount: { $size: { $ifNull: ['$messages', []] } },
        },
      },
      {
        $sort: { messageCount: -1 },
      },
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
      {
        $match: {
          'hashtagDetails.access': 'public',
        },
      },
      {
        $facet: {
          chatrooms: [
            { $skip: skip },
            { $limit: parseInt(pageSize, 10) },
            {
              $project: {
                _id: 1,
                name: 1,
                hashtagId: 1,
                createdAt: 1,
                updatedAt: 1,
                messageCount: 1,
                hashtagPhoto: '$hashtagDetails.hashtagPhoto',
                hashtagName: '$hashtagDetails.name',
              },
            },
          ],
          totalCount: [{ $count: 'count' }],
        },
      },
    ];

    const result = await ChatroomService.aggregate({ query: aggregationPipeline });
    const chatrooms = result[0].chatrooms || [];
    return responseHandler({ chatrooms }, res);
  } catch (err) {
    return errorHandler(err.code, res);
  }
});

// REST: Broadcast hashtag chat list (same shape as socket broadcastListSuccess)
exports.getBroadcastList = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { page = 1, limit = 20 } = req.value || req.query || {};

  const pageNumber = Math.max(1, parseInt(page, 10) || 1);
  const limitNumber = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const userObjectId = new ObjectId(userId);

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
    // Shape final output
    {
      $project: {
        _id: 1,
        chatroomId: '$_id',
        name: 1,
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
        chatrooms: [{ $skip: (pageNumber - 1) * limitNumber }, { $limit: limitNumber }],
        totalCount: [{ $count: 'count' }],
      },
    },
  ];

  const result = await ChatroomService.aggregate({ query: aggregationPipeline });
  const chatrooms = result[0].chatrooms || [];
  const totalChatrooms = result[0].totalCount.length > 0 ? result[0].totalCount[0].count : 0;
  const totalPages = Math.ceil(totalChatrooms / limitNumber);

  return responseHandler({
    metadata: {
      totalChatrooms,
      totalPages,
      page: pageNumber,
      limit: limitNumber,
    },
    chatrooms,
    groupChats: [],
    lists: [],
  }, res);
});
exports.getAllHashtags = asyncHandler(async (req, res) => {
  const { pageNum = 1, pageSize = 20 } = req.value;
  const { userId } = req.user;
  const userObjectId = new ObjectId(userId);
  // Calculate pagination options
  const skip = (pageNum - 1) * pageSize;
  const filter = { access: 'public' };
  const blockedUserIds = await userServices.find({
    filter: { _id: userId },
    projection: { blockedUsers: 1 },
  });
  if (blockedUserIds && blockedUserIds[0] && blockedUserIds[0].blockedUsers) {
    const blockedUserIdArray = blockedUserIds[0].blockedUsers.map((user) => user.userId);
    if (blockedUserIdArray.length > 0) {
      filter.creatorId = { $nin: blockedUserIdArray };
    }
  }
  // Aggregation pipeline for fetching hashtags
  const aggregationPipeline = [
    {
      $match: filter,
    },
    {
      $facet: {
        hashtags: [
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
              // "Pin" for hashtags is modeled as "saved" for the current user.
              isSaved: { $gt: [{ $size: '$savedByCurrentUser' }, 0] },
              pinnedAt: { $arrayElemAt: ['$savedByCurrentUser.createdAt', 0] },
              isPinned: { $gt: [{ $size: '$savedByCurrentUser' }, 0] },
            },
          },
          // Pinned-first (saved-first), then newest
          { $sort: { pinnedAt: -1, createdAt: -1 } },
          { $skip: skip },
          { $limit: pageSize }, // Apply pagination limit
          {
            $project: {
              _id: 1,
              name: 1,
              access: 1,
              scope: 1,
              isSaved: 1,
              isPinned: 1,
              pinnedAt: 1,
            },
          },
        ],
        totalCount: [
          { $count: 'count' }, // Count total public hashtags
        ],
      },
    },
  ];

  // Execute the aggregation
  const result = await services.aggregate({ query: aggregationPipeline });

  // Extract hashtags and total count from the result
  const hashtags = result[0].hashtags || []; // Hashtags for the current page
  const totalHashtags = result[0].totalCount.length > 0 ? result[0].totalCount[0].count : 0;
  // Calculate total pages
  const totalPages = Math.ceil(totalHashtags / pageSize);

  // Respond with hashtags and pagination info
  return responseHandler({
    metadata: {
      totalHashtags,
      totalPages,
      pageNum,
      pageSize,
    },
    hashtags,
  }, res);
});

exports.search = asyncHandler(async (req, res) => {
  const {
    searchText,
    longitude,
    latitude,
    radius,
    type,
    pageNum,
    pageSize,
  } = req.value;
  const { userId } = req.user;
  const userObjectId = new ObjectId(userId);
  const limit = Number(pageSize);
  const page = Number(pageNum);
  // Calculate pagination options
  const skip = (page - 1) * limit;

  // Initialize the filter object
  const filter = {};
  const blockedUserIds = await userServices.find({
    filter: { _id: userId },
    projection: { blockedUsers: 1 },
  });
  if (blockedUserIds && blockedUserIds[0] && blockedUserIds[0].blockedUsers) {
    const blockedUserIdArray = blockedUserIds[0].blockedUsers.map((user) => user.userId);
    if (blockedUserIdArray.length > 0) {
      filter.creatorId = { $nin: blockedUserIdArray };
    }
  }
  // Search by name if searchText is provided
  if (searchText) {
    filter.name = { $regex: new RegExp(searchText, 'i') }; // Case-insensitive name search
  }

  // Filter by access type if provided
  if (type) {
    filter.access = type;
  }

  // Search by location if longitude, latitude, and radius are provided
  if (longitude && latitude && radius) {
    filter.location = {
      $geoWithin: {
        $centerSphere: [[longitude, latitude], radius / 6378100], // Earth's radius in meters
      },
    };
  }

  // Define the aggregation pipeline
  const aggregationPipeline = [
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
      $facet: {
        hashtags: [
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
              // "Pin" for hashtags is modeled as "saved" for the current user.
              isSaved: { $gt: [{ $size: '$savedByCurrentUser' }, 0] },
              pinnedAt: { $arrayElemAt: ['$savedByCurrentUser.createdAt', 0] },
              isPinned: { $gt: [{ $size: '$savedByCurrentUser' }, 0] },
            },
          },
          // Pinned-first (saved-first), then newest
          { $sort: { pinnedAt: -1, createdAt: -1 } }, // Sort by pinned time + creation date
          { $skip: skip }, // Pagination skip
          { $limit: limit }, // Pagination limit
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
              hashtagPicture: 1,
              hashtagPhoto: 1,
              hashtagBanner: 1,
              chatroomId: { $arrayElemAt: ['$chatrooms._id', 0] },
              isSaved: 1,
              isPinned: 1,
              pinnedAt: 1,
            },
          },
        ],
        totalCount: [
          { $count: 'count' }, // Count total hashtags that match
        ],
      },
    },
  ];

  // Execute the aggregation
  const result = await services.aggregate({ query: aggregationPipeline });

  // Extract hashtags and total count from the result
  const hashtags = result[0].hashtags || [];
  const totalHashtags = result[0].totalCount.length > 0 ? result[0].totalCount[0].count : 0;

  // Calculate total pages
  const totalPages = Math.ceil(totalHashtags / pageSize);

  // Respond with matching hashtags and pagination info
  return responseHandler({
    metadata: {
      totalHashtags,
      totalPages,
      pageNum,
      pageSize,
    },
    hashtags,
  }, res);
});

exports.saveHashtag = asyncHandler(async (req, res) => {
  const { hashtagId } = req.value;
  const { userId } = req.user;

  const hashtag = await services.findById({ id: hashtagId });
  if (!hashtag) {
    return errorHandler('ERR-114', res);
  }

  const isSaved = await services.findOneSave({ filter: { userId, hashtagId } });

  if (isSaved) {
    // If already saved, remove it
    await services.removeSavedHashtag({ filter: { userId, hashtagId } });
    return responseHandler({ message: 'Hashtag removed from saved successfully', isSaved: false }, res);
  }

  // If not saved, save it
  const save = await services.createSave({
    body: {
      userId,
      hashtagId,
    },
  });

  if (save) {
    return responseHandler({ message: 'Hashtag saved successfully', isSaved: true }, res);
  }

  return errorHandler('ERR-006', res);
});

// Pin/unpin hashtag endpoints to match private-chatroom pin/unpin routes.
// Internally, a "pinned hashtag" is represented as a record in the `saves` collection.
exports.pinHashtag = asyncHandler(async (req, res) => {
  const { hashtagId } = req.value;
  const { userId } = req.user;

  const hashtag = await services.findById({ id: hashtagId });
  if (!hashtag) {
    return errorHandler('ERR-114', res);
  }

  const existing = await services.findOneSave({ filter: { userId, hashtagId } });
  if (existing) {
    return responseHandler(
      {
        message: 'Hashtag pinned successfully',
        pinnedAt: existing.createdAt || null,
        hashtagId,
        updated: false,
      },
      res,
    );
  }

  const save = await services.createSave({
    body: {
      userId,
      hashtagId,
    },
  });

  if (!save) {
    return errorHandler('ERR-006', res);
  }

  return responseHandler(
    {
      message: 'Hashtag pinned successfully',
      pinnedAt: save.createdAt || null,
      hashtagId,
      updated: true,
    },
    res,
  );
});

exports.unpinHashtag = asyncHandler(async (req, res) => {
  const { hashtagId } = req.value;
  const { userId } = req.user;

  const hashtag = await services.findById({ id: hashtagId });
  if (!hashtag) {
    return errorHandler('ERR-114', res);
  }

  const removed = await services.removeSavedHashtag({ filter: { userId, hashtagId } });

  return responseHandler(
    {
      message: 'Hashtag unpinned successfully',
      pinnedAt: null,
      hashtagId,
      updated: !!removed,
    },
    res,
  );
});

exports.removeSavedHashtag = asyncHandler(async (req, res) => {
  const { hashtagId } = req.params;
  const { userId } = req.user;

  const save = await services.removeSavedHashtag({ filter: { userId, hashtagId } });
  if (!save) {
    return errorHandler('ERR-006', res);
  }

  return responseHandler({ message: 'Hashtag removed from saved successfully' }, res);
});

exports.markHashtagNotInterested = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { hashtagId } = req.value;

  await hiddenHashtagServices.findOneAndUpsert({
    filter: { userId: new ObjectId(userId), hashtagId: new ObjectId(hashtagId) },
    body: {
      $set: { reason: 'not_interested' },
      $setOnInsert: { userId: new ObjectId(userId), hashtagId: new ObjectId(hashtagId) },
    },
  });

  return responseHandler({ message: 'Hashtag marked as not interested' }, res);
});

exports.undoHashtagNotInterested = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { hashtagId } = req.params;

  await hiddenHashtagServices.findOneAndDelete({
    filter: { userId: new ObjectId(userId), hashtagId: new ObjectId(hashtagId) },
  });

  return responseHandler({ message: 'Not interested removed for hashtag' }, res);
});

// Remove hashtag from chat screen (only hides it from hashtagChatList for this user).
// It will re-appear automatically when a new message is posted in that hashtag chat.
exports.removeHashtagFromChatList = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { hashtagId } = req.value;

  const hashtag = await services.findById({ id: hashtagId });
  if (!hashtag) {
    return errorHandler('ERR-114', res);
  }

  const chatroom = await ChatroomService.findOne({
    filter: { hashtagId: new ObjectId(hashtagId) },
    projection: { _id: 1 },
  });
  if (!chatroom) {
    return errorHandler('ERR-006', res);
  }

  const participant = await participantServices.findOne({
    filter: { userId: new ObjectId(userId), chatroomId: chatroom._id },
    projection: { _id: 1 },
  });
  if (!participant) {
    return errorHandler('ERR-129', res);
  }

  await hiddenHashtagChatListServices.findOneAndUpsert({
    filter: { userId: new ObjectId(userId), hashtagId: new ObjectId(hashtagId) },
    body: {
      $set: { hiddenAt: new Date() },
      $setOnInsert: { userId: new ObjectId(userId), hashtagId: new ObjectId(hashtagId) },
    },
  });

  return responseHandler(
    { message: 'Hashtag removed from chat list', hashtagId, removed: true },
    res,
  );
});

exports.getSavedHashtags = asyncHandler(async (req, res) => {
  const { userId, pageNum = 1, pageSize = 10 } = req.query;
  const filter = {};
  if (userId) {
    filter.userId = new ObjectId(userId);
  } else {
    filter.userId = new ObjectId(req.user.userId);
  }
  const sort = { createdAt: -1 };
  const pagination = { skip: 0, limit: 10 };

  if (pageNum && pageSize) {
    pagination.skip = (Number(pageNum) - 1) * Number(pageSize);
    pagination.limit = Number(pageSize);
  }

  const query = getSavedHashtagsQuery(filter, sort, pagination, filter.userId);
  const saves = await services.aggregateSave({ query });
  const totalSaves = saves.length;
  const totalPages = Math.ceil(totalSaves / pagination.limit);
  return responseHandler({
    metadata: {
      totalCount: totalSaves, totalPages, pageNum, pageSize,
    },
    saves,
  }, res);
});

exports.deleteHashtag = asyncHandler(async (req, res) => {
  const { hashtagId } = req.params;
  const { userId } = req.user;

  // Find the hashtag and verify ownership
  const hashtag = await services.findById({ id: hashtagId });

  if (!hashtag) {
    return errorHandler('ERR-114', res);
  }

  // Check if user is the creator or has admin rights
  if (hashtag.creatorId.toString() !== userId) {
    return errorHandler('ERR-129', res); // Not authorized
  }

  const hashtagObjectId = toObjectId(hashtagId);

  // Find associated chatroom
  const chatroom = await ChatroomService.findOne({ filter: { hashtagId: hashtagObjectId } });

  if (chatroom) {
    const { _id: chatroomId } = chatroom;

    // Delete chatroom messages
    await messageServices.deleteMany({ filter: { chatroomId } });

    // Delete participants
    await participantServices.deleteMany({ filter: { chatroomId } });

    // Delete the chatroom
    await ChatroomService.deleteOne({ filter: { _id: chatroomId } });
  }

  // Delete hashtag likes
  await hashtagLikeServices.deleteMany({ filter: { hashtagId: hashtagObjectId } });

  // Delete saved hashtags
  await services.deleteManySave({ filter: { hashtagId: hashtagObjectId } });

  // Delete hashtag requests (invites)
  await hashtagRequestServices.deleteMany({ filter: { hashtagId: hashtagObjectId } });

  // Delete hidden hashtag records (not interested)
  await hiddenHashtagServices.deleteMany({ filter: { hashtagId: hashtagObjectId } });

  // Delete hidden hashtag chat list records (removed from chat list)
  await hiddenHashtagChatListServices.deleteMany({ filter: { hashtagId: hashtagObjectId } });

  // Delete hashtag policy acceptance records
  await hashtagPolicyAcceptanceServices.deleteMany({ filter: { hashtagId: hashtagObjectId } });

  // Delete user role assignments for this hashtag
  await userRoleServices.deleteMany({ filter: { hashtagId: hashtagObjectId } });

  // Delete welcome page
  await welcomePageServices.deleteOne({ filter: { hashtagId: hashtagObjectId } });

  // Delete stories associated with hashtag
  await storiesServices.deleteMany({ filter: { hashtagId: hashtagObjectId } });

  // Finally, delete the hashtag itself
  await services.findOneAndDelete({ filter: { _id: hashtagObjectId } });

  return responseHandler({ message: 'Hashtag deleted successfully' }, res);
});

exports.createSubHashTag = asyncHandler(async (req, res) => {
  const { name, hashtagPicture = '' } = req.value;
  const { userId } = req.user;

  const subHashTag = await subHashTagServices.create({
    body: {
      name,
      hashtagPicture,
      userId,
    },
  });

  return responseHandler({ data: subHashTag, message: 'SubHashtag created successfully' }, res);
});

exports.getAllSubHashtags = asyncHandler(async (req, res) => {
  const subHashTags = await subHashTagServices.find({});
  return responseHandler({ data: subHashTags, message: 'SubHashtags fetched successfully' }, res);
});

exports.deleteSubHashtag = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const subHashTag = await subHashTagServices.deleteOne({ _id: id });
  if (!subHashTag) return errorHandler('ERR-135', res);
  return responseHandler({ message: 'SubHashtag Deleted successfully' }, res);
});

exports.updateSubHashTag = asyncHandler(async (req, res) => {
  const data = req.value;
  const { id } = req.params;
  const subHashtag = await subHashTagServices.findByIdAndUpdate({
    id,
    body: data,
  });
  if (!subHashtag) return errorHandler('ERR-135', res);
  return responseHandler({ data: subHashtag, message: 'Hashtag updated successfully' }, res);
});

// Stores when a user accepted hashtag policy.
exports.acceptHashtagPolicy = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { hashtagId } = req.value;

  const hashtag = await services.findById({ id: hashtagId });
  if (!hashtag) {
    return errorHandler('ERR-114', res);
  }

  const acceptance = await hashtagPolicyAcceptanceServices.findOneAndUpsert({
    filter: {
      userId: new ObjectId(userId),
      hashtagId: new ObjectId(hashtagId),
    },
    body: {
      $setOnInsert: {
        userId: new ObjectId(userId),
        hashtagId: new ObjectId(hashtagId),
      },
    },
  });

  return responseHandler(
    {
      accepted: true,
      hashtagId,
      userId,
      createdAt: acceptance.createdAt,
      updatedAt: acceptance.updatedAt,
    },
    res,
  );
});
