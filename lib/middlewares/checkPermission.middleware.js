const userServices = require('../../src/services/userServices');
const { userRoles } = require('../constants/userConstants');
const privateChatroomServices = require('../../src/services/privateChatroomServices');
const chatroomServices = require('../../src/services/chatroomServices');
const participantServices = require('../../src/services/participantServices');
const { resolveHashtagRole } = require('../../src/helpers/hashtagRoleResolver');

exports.checkPermissionForHashtagChat = async (socket, data) => {
  const { userId } = socket.handshake.query;
  const socketInfo = socket;

  // Check if user is God (superuser)
  const user = await userServices.findById({ id: userId });
  socketInfo.user = user;

  if (user.role === userRoles.GOD) {
    socketInfo.isGod = true;
  }

  // Check if user is admin or moderator of the chatroom (legacy) + RBAC via user-roles/hashtag-roles
  if (data.hashtagId) {
    let chatroom = {};
    if (socketInfo.hashtagChatroom) {
      if (socketInfo.hashtagChatroom.hashtagId.toString() === data.hashtagId.toString()) {
        chatroom = socketInfo.hashtagChatroom;
      } else {
        chatroom = await chatroomServices.findOne({ filter: { hashtagId: data.hashtagId } });
        socketInfo.hashtagChatroom = chatroom.toObject();
        const participants = await participantServices.find(
          { filter: { chatroomId: chatroom._id } },
        );
        socketInfo.participants = participants;
      }
    } else {
      chatroom = await chatroomServices.findOne({ filter: { hashtagId: data.hashtagId } });
      socketInfo.hashtagChatroom = chatroom.toObject();
      const participants = await participantServices.find(
        { filter: { chatroomId: chatroom._id } },
      );
      socketInfo.participants = participants;
    }

    if (!socket.participants) {
      const participants = await participantServices.find(
        { filter: { chatroomId: chatroom._id } },
      );
      socketInfo.participants = participants;
    }

    // RBAC role resolution (safe fallback to legacy admin/mod lists if roles aren't seeded yet)
    try {
      const rbac = await resolveHashtagRole({
        userId,
        hashtagId: data.hashtagId,
        // Preserve current behavior: if no explicit role assignment exists, treat users as GUEST
        fallbackRoleKey: 'GUEST',
      });

      socketInfo.hashtagRoleKey = rbac.roleKey;
      socketInfo.hashtagRoleKeys = rbac.expandedRoleKeys;
      socketInfo.hashtagPermissions = rbac.permissions;
      socketInfo.can = (permissionKey) => (
        socketInfo.isGod
        || (Array.isArray(socketInfo.hashtagPermissions)
          && socketInfo.hashtagPermissions.includes(permissionKey))
      );

      const keys = rbac.expandedRoleKeys || [];
      // Map role keys onto existing flags so current event handlers keep working
      if (keys.includes('SUPER_ADMIN') || keys.includes('MASTER')) socketInfo.isAdmin = true;
      if (keys.includes('MODERATOR')) socketInfo.isModerator = true;
    } catch (e) {
      // Ignore RBAC failures and fall back to legacy behavior below.
    }

    // Legacy fallback: derive admin/moderator flags from chatroom document
    if (chatroom) {
      if (chatroom.admins && chatroom.admins.find((admin) => String(admin.userId) === String(userId))) {
        socketInfo.isAdmin = true;
      }
      if (chatroom.moderators && chatroom.moderators.find((moderator) => String(moderator.userId) === String(userId))) {
        socketInfo.isModerator = true;
      }
    }
  }
};

exports.checkPermissionForPrivateChat = async (socket, data) => {
  const { userId } = socket.handshake.query;
  const socketInfo = socket;

  // check if user is god of the app
  const user = await userServices.findById({ id: userId });
  socketInfo.user = user;

  if (user.role === userRoles.GOD) {
    socketInfo.isGod = true;
  }

  // check if user is admin of chatroom or not if chatroomId provided in socketInfo
  if (data.chatroomId) {
    let chatroom = {};
    if (socketInfo.privateChatroom) {
      const { _id: chatroomId } = socketInfo.privateChatroom;
      if (chatroomId.toString() === data.chatroomId.toString()) {
        chatroom = socketInfo.privateChatroom;
      } else {
        chatroom = await privateChatroomServices.findById({ id: data.chatroomId });
        socketInfo.privateChatroom = chatroom;
      }
    } else {
      chatroom = await privateChatroomServices.findById({ id: data.chatroomId });
      socketInfo.privateChatroom = chatroom;
    }

    if (chatroom.isGroupChat) {
      if (chatroom.admins.find((admin) => String(admin.userId) === String(userId))) {
        socketInfo.isAdmin = true;
      }
      if (chatroom.moderators.find((moderator) => String(moderator.userId) === String(userId))) {
        socketInfo.isModerator = true;
      }
    }
  }
};
