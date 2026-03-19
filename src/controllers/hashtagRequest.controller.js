const { default: mongoose } = require('mongoose');
const hashtagRequestServices = require('../services/hashtagRequestServices');
const hashtagServices = require('../services/hashtagServices');
const chatroomServices = require('../services/chatroomServices');
const participantServices = require('../services/participantServices');
const notificationService = require('../services/notificationService');
const pushNotificationService = require('../services/pushNotificationService');
const userServices = require('../services/userServices');
const hashtagRoleServices = require('../services/hashtagRoleServices');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { responseHandler } = require('../../lib/helpers/responseHandler');
const { userRoles } = require('../../lib/constants/userConstants');
const { resolveHashtagRole, assignRoleByKey } = require('../helpers/hashtagRoleResolver');

const toObjectId = (v) => (v instanceof mongoose.Types.ObjectId ? v : new mongoose.Types.ObjectId(String(v)));

const normalizeRequestedRoleKey = (roleKey) => {
  const k = String(roleKey || '').trim().toUpperCase();
  if (k === 'ADMIN') return 'SUPER_ADMIN';
  return k;
};

// Role levels (cached from DB, fallback to static values)
const ROLE_LEVELS = {
  SUPER_ADMIN: 5,
  MASTER: 4,
  MODERATOR: 3,
  MEMBER: 2,
  GUEST: 1,
  GAZER: 0,
};

async function getRoleLevelMap() {
  const defs = await hashtagRoleServices.find({
    filter: { hashtagId: null, isActive: true },
    projection: { key: 1, level: 1 },
  });
  const map = new Map();
  (defs || []).forEach((r) => {
    if (r && r.key) map.set(String(r.key).toUpperCase(), Number(r.level));
  });
  // Fallback to static levels if DB is empty
  if (map.size === 0) {
    Object.entries(ROLE_LEVELS).forEach(([k, v]) => map.set(k, v));
  }
  return map;
}

/**
 * Resolves the inviter's effective context for a hashtag invite.
 * Returns all info needed to check permissions in one place.
 */
async function resolveInviterContext({ inviterUserId, hashtagId }) {
  const [inviter, hashtag, chatroom, rbac] = await Promise.all([
    userServices.findById({ id: inviterUserId }),
    hashtagServices.findById({ id: hashtagId }),
    chatroomServices.findOne({
      filter: { hashtagId: toObjectId(hashtagId) },
      projection: { _id: 1, admins: 1, moderators: 1 },
    }),
    resolveHashtagRole({ userId: inviterUserId, hashtagId, fallbackRoleKey: 'GUEST' }),
  ]);

  const uid = String(inviterUserId);
  const isGod = inviter && inviter.role === userRoles.GOD;
  const isCreator = hashtag && String(hashtag.creatorId) === uid;
  const isChatroomAdmin = chatroom && Array.isArray(chatroom.admins)
    && chatroom.admins.some((a) => String(a.userId) === uid);
  const isChatroomModerator = chatroom && Array.isArray(chatroom.moderators)
    && chatroom.moderators.some((m) => String(m.userId) === uid);

  const rbacRoleKey = (rbac && rbac.roleKey) ? String(rbac.roleKey).toUpperCase() : 'GUEST';
  const rbacPermissions = rbac && Array.isArray(rbac.permissions) ? rbac.permissions : [];

  return {
    inviter,
    hashtag,
    chatroom,
    isGod,
    isCreator,
    isChatroomAdmin,
    isChatroomModerator,
    rbacRoleKey,
    rbacPermissions,
  };
}

/**
 * Check if inviter can invite users to this hashtag (permission to invite at all).
 */
function canInviteToHashtag(ctx, requestedRoleKey) {
  const {
    isGod, isCreator, isChatroomAdmin, isChatroomModerator, rbacPermissions,
  } = ctx;

  // GOD, creator, chatroom admin/moderator can always invite
  if (isGod || isCreator || isChatroomAdmin || isChatroomModerator) return true;

  // RBAC permissions
  if (rbacPermissions.includes('members:invite') || rbacPermissions.includes('members:welcome')) return true;

  // MEMBERs can invite as MEMBER if they have guests:invite_to_member
  const normalized = normalizeRequestedRoleKey(requestedRoleKey);
  if (normalized === 'MEMBER' && rbacPermissions.includes('guests:invite_to_member')) return true;

  return false;
}

/**
 * Check if inviter can assign the specific role to the invitee.
 */
async function canAssignRoleWithContext(ctx, requestedRoleKey) {
  const {
    isGod, isCreator, isChatroomAdmin, isChatroomModerator, rbacRoleKey,
  } = ctx;
  const normalized = normalizeRequestedRoleKey(requestedRoleKey);

  // GOD can assign any role
  if (isGod) return true;

  // Creator can assign any role (including SUPER_ADMIN for their own hashtag)
  if (isCreator) {
    return true;
  }

  // Chatroom admins can assign up to MODERATOR level
  if (isChatroomAdmin) {
    const allowedForAdmin = ['MODERATOR', 'MEMBER', 'GUEST', 'GAZER'];
    if (allowedForAdmin.includes(normalized)) return true;
  }

  // Chatroom moderators can assign MEMBER, GUEST, GAZER
  if (isChatroomModerator) {
    const allowedForModerator = ['MEMBER', 'GUEST', 'GAZER'];
    if (allowedForModerator.includes(normalized)) return true;
  }

  // RBAC-based role assignment
  const levelMap = await getRoleLevelMap();
  const inviterLevel = levelMap.get(rbacRoleKey) ?? ROLE_LEVELS.GUEST;
  const requestedLevel = levelMap.get(normalized);

  // Invalid role key
  if (requestedLevel === undefined) return false;

  // Only SUPER_ADMIN can assign SUPER_ADMIN
  if (normalized === 'SUPER_ADMIN' && rbacRoleKey !== 'SUPER_ADMIN') return false;

  // MEMBER can invite as MEMBER (special case for guest -> member flow)
  if (normalized === 'MEMBER' && rbacRoleKey === 'MEMBER') return true;

  // Default: can only assign roles strictly below your own level
  return requestedLevel < inviterLevel;
}

exports.inviteToHashtag = asyncHandler(async (req, res) => {
  const { userId: inviterId } = req.user;
  const { hashtagId } = req.params;
  const { targetUserId, roleKey } = req.value;
  const requestedRoleKey = normalizeRequestedRoleKey(roleKey);

  // Resolve all inviter context in one go (parallel DB calls)
  const ctx = await resolveInviterContext({ inviterUserId: inviterId, hashtagId });

  if (!ctx.hashtag) return responseHandler({ message: 'Hashtag not found' }, res, 404);

  // Check invite permission
  const canInvite = canInviteToHashtag(ctx, requestedRoleKey);
  if (!canInvite) {
    return responseHandler({ message: 'Not authorized to invite users to this hashtag' }, res, 403);
  }

  // Check role assignment permission
  const allowedToAssign = await canAssignRoleWithContext(ctx, requestedRoleKey);
  if (!allowedToAssign) {
    return responseHandler({ message: 'Not authorized to assign this role' }, res, 403);
  }

  const { hashtag, chatroom, inviter } = ctx;

  const targetUser = await userServices.findById({ id: targetUserId });
  if (!targetUser) return responseHandler({ message: 'Target user not found' }, res, 404);

  // Prevent inviting existing participants (use chatroom from ctx)
  if (chatroom) {
    const existingParticipant = await participantServices.findOne({
      filter: { userId: toObjectId(targetUserId), chatroomId: chatroom._id },
      projection: { _id: 1 },
    });
    if (existingParticipant) {
      return responseHandler({ message: 'User is already a participant' }, res, 400);
    }
  }

  // Check if a pending request already exists for this user and hashtag
  const existingRequest = await hashtagRequestServices.findOne({
    filter: {
      hashtagId: toObjectId(hashtagId),
      targetUserId: toObjectId(targetUserId),
      status: 'pending',
    },
    projection: { _id: 1 },
  });
  if (existingRequest) {
    return responseHandler({ message: 'An invite request is already pending for this user' }, res, 400);
  }

  // Create request
  const request = await hashtagRequestServices.create({
    body: {
      hashtagId: toObjectId(hashtagId),
      invitedBy: toObjectId(inviterId),
      targetUserId: toObjectId(targetUserId),
      status: 'pending',
      roleKey: requestedRoleKey,
    },
  });

  // Create notification (Updates category) + push (use inviter from ctx)
  const inviterName = (inviter && (inviter.fullName || inviter.userName)) || 'Someone';
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
      senderId: toObjectId(inviterId),
      category: 'updates',
      type: 'update',
      summary,
      meta: {
        kind: 'hashtag_invite',
        requestId: request && request._id ? request._id : null,
        hashtagId: toObjectId(hashtagId),
        hashtag: hashtagMeta,
        targetUserId: toObjectId(targetUserId),
        invitedBy: toObjectId(inviterId),
        status: 'pending',
        actionable: true,
        roleKey: requestedRoleKey,
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
        invitedBy: String(inviterId),
      },
    });
  }

  return responseHandler({ request, notification }, res);
});

exports.listMyHashtagRequests = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { status = 'pending' } = req.query;
  const allowed = new Set(['pending', 'accepted', 'rejected', 'cancelled']);
  const s = allowed.has(status) ? status : 'pending';

  const requests = await hashtagRequestServices.find({
    filter: { targetUserId: toObjectId(userId), status: s },
    sort: { createdAt: -1 },
    populate: [
      { path: 'hashtagId', select: 'name hashtagPicture fullLocation access' },
      { path: 'invitedBy', select: 'userName fullName profilePicture' },
    ],
  });

  return responseHandler({ requests }, res);
});

async function respondToRequest({
  req, res, action, statusOverride = null,
}) {
  const { userId } = req.user;
  const { requestId } = req.params;

  const request = await hashtagRequestServices.findById({ id: requestId });
  if (!request) return responseHandler({ message: 'Request not found' }, res, 404);
  if (String(request.targetUserId) !== String(userId)) {
    return responseHandler({ message: 'Not authorized for this request' }, res, 403);
  }
  if (request.status !== 'pending') {
    return responseHandler({ message: `Request already ${request.status}` }, res, 400);
  }

  const desiredStatus = statusOverride || (action === 'reject' ? 'rejected' : 'accepted');

  if (desiredStatus === 'rejected') {
    const updated = await hashtagRequestServices.findByIdAndUpdate({
      id: requestId,
      body: { $set: { status: 'rejected', respondedAt: new Date() } },
    });

    // Update matching notification so UI can disable buttons
    await notificationService.findOneAndUpdate({
      filter: {
        userId: toObjectId(userId),
        type: 'update',
        'meta.kind': 'hashtag_invite',
        'meta.requestId': toObjectId(requestId),
      },
      body: {
        $set: {
          'meta.status': 'rejected',
          'meta.actionable': false,
        },
      },
    });
    return responseHandler({ request: updated }, res);
  }

  // accept
  const chatroom = await chatroomServices.findOne({
    filter: { hashtagId: toObjectId(request.hashtagId) },
    projection: { _id: 1, hashtagId: 1 },
  });
  if (!chatroom) return responseHandler({ message: 'Chatroom not found for hashtag' }, res, 404);

  // Join as participant (idempotent)
  await participantServices.findOneAndUpsert({
    filter: { userId: toObjectId(userId), chatroomId: chatroom._id },
    body: { $set: { userId: toObjectId(userId), chatroomId: chatroom._id } },
  });

  // Assign requested role on accept (stored in notification meta), fallback MEMBER
  let acceptedRoleKey = 'MEMBER';
  try {
    const notifs = await notificationService.find({
      filter: {
        userId: toObjectId(userId),
        type: 'update',
        'meta.kind': 'hashtag_invite',
        'meta.requestId': toObjectId(requestId),
      },
      projection: { meta: 1 },
      pagination: { skip: 0, limit: 1 },
      sort: { createdAt: -1 },
    });
    const n = Array.isArray(notifs) ? notifs[0] : null;
    const rk = n && n.meta && n.meta.roleKey ? String(n.meta.roleKey).trim().toUpperCase() : null;
    if (rk) acceptedRoleKey = normalizeRequestedRoleKey(rk);
  } catch (e) {
    // ignore
  }
  await assignRoleByKey({ userId, hashtagId: request.hashtagId, roleKey: acceptedRoleKey });

  const updated = await hashtagRequestServices.findByIdAndUpdate({
    id: requestId,
    body: { $set: { status: 'accepted', respondedAt: new Date() } },
  });

  await notificationService.findOneAndUpdate({
    filter: {
      userId: toObjectId(userId),
      type: 'update',
      'meta.kind': 'hashtag_invite',
      'meta.requestId': toObjectId(requestId),
    },
    body: {
      $set: {
        'meta.status': 'accepted',
        'meta.actionable': false,
      },
    },
  });

  return responseHandler({ request: updated }, res);
}

exports.respondHashtagRequest = asyncHandler(async (req, res) => {
  const { status } = req.value;
  return respondToRequest({
    req, res, action: status === 'rejected' ? 'reject' : 'accept', statusOverride: status,
  });
});

exports.acceptHashtagRequest = asyncHandler(async (req, res) => respondToRequest({
  req, res, action: 'accept', statusOverride: 'accepted',
}));
exports.rejectHashtagRequest = asyncHandler(async (req, res) => respondToRequest({
  req, res, action: 'reject', statusOverride: 'rejected',
}));

/**
 * Get invite activity log for a hashtag.
 * Returns a list of invite activities as human-readable sentences.
 */
exports.getHashtagInviteActivity = asyncHandler(async (req, res) => {
  const { hashtagId } = req.params;
  const { page = 1, limit = 20, status = 'all' } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  // Build filter
  const filter = { hashtagId: toObjectId(hashtagId) };
  if (status && status !== 'all') {
    filter.status = status;
  }

  // Get all invite requests for this hashtag
  const requests = await hashtagRequestServices.find({
    filter,
    populate: [
      { path: 'invitedBy', select: 'userName fullName profilePicture' },
      { path: 'targetUserId', select: 'userName fullName profilePicture' },
      { path: 'hashtagId', select: 'name slug hashtagPicture' },
    ],
    sort: { updatedAt: -1 },
    pagination: { skip: (pageNum - 1) * limitNum, limit: limitNum },
  });

  // Transform to activity sentences
  const activities = (requests || []).map((r) => {
    const inviterName = (r.invitedBy && (r.invitedBy.fullName || r.invitedBy.userName)) || 'Someone';
    const targetName = (r.targetUserId && (r.targetUserId.fullName || r.targetUserId.userName)) || 'a user';
    const role = r.roleKey || 'Member';
    const hashtagName = (r.hashtagId && (r.hashtagId.name || r.hashtagId.slug)) || 'hashtag';

    let sentence = '';
    let action = '';

    switch (r.status) {
      case 'pending':
        sentence = `${inviterName} sent invite to ${targetName} for ${hashtagName} as ${role}`;
        action = 'invited';
        break;
      case 'accepted':
        sentence = `${targetName} accepted the invite for ${hashtagName} as ${role} from ${inviterName}`;
        action = 'accepted';
        break;
      case 'rejected':
        sentence = `${targetName} rejected the invite for ${hashtagName} from ${inviterName}`;
        action = 'rejected';
        break;
      case 'cancelled':
        sentence = `${inviterName} cancelled the invite to ${targetName} for ${hashtagName}`;
        action = 'cancelled';
        break;
      default:
        sentence = `${inviterName} invited ${targetName} to ${hashtagName}`;
        action = 'unknown';
    }

    return {
      _id: r._id,
      sentence,
      action,
      status: r.status,
      roleKey: r.roleKey || 'MEMBER',
      hashtag: {
        _id: r.hashtagId && r.hashtagId._id ? r.hashtagId._id : hashtagId,
        name: (r.hashtagId && r.hashtagId.name) || null,
        slug: (r.hashtagId && r.hashtagId.slug) || null,
        hashtagPicture: (r.hashtagId && r.hashtagId.hashtagPicture) || null,
      },
      inviter: {
        _id: r.invitedBy && r.invitedBy._id ? r.invitedBy._id : null,
        name: inviterName,
        userName: (r.invitedBy && r.invitedBy.userName) || null,
        fullName: (r.invitedBy && r.invitedBy.fullName) || null,
        profilePicture: (r.invitedBy && r.invitedBy.profilePicture) || null,
      },
      target: {
        _id: r.targetUserId && r.targetUserId._id ? r.targetUserId._id : null,
        name: targetName,
        userName: (r.targetUserId && r.targetUserId.userName) || null,
        fullName: (r.targetUserId && r.targetUserId.fullName) || null,
        profilePicture: (r.targetUserId && r.targetUserId.profilePicture) || null,
      },
      createdAt: r.createdAt,
      respondedAt: r.respondedAt || null,
      updatedAt: r.updatedAt,
    };
  });

  return responseHandler({
    activities,
    page: pageNum,
    limit: limitNum,
    total: activities.length,
  }, res);
});
