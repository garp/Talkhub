const { socketEvents } = require('../../lib/constants/socket');
const { getIO } = require('./socketInstance');
const unreadCountsService = require('../services/unreadCountsService');

/**
 * Handle client request for unread counts (e.g. on app launch, Inbox focus, pull-to-refresh).
 * Emits unreadCountsSuccess to the requesting socket.
 */
async function handleGetUnreadCounts(socket) {
  try {
    const userId = socket.handshake?.query?.userId;
    if (!userId) {
      socket.emit(socketEvents.UNREAD_COUNTS_SUCCESS, {
        privateChatUnreadCount: 0,
        publicChatUnreadCount: 0,
        privateChats: [],
        publicChats: [],
      });
      return;
    }

    const payload = await unreadCountsService.getUnreadCountsForUser(userId);
    socket.emit(socketEvents.UNREAD_COUNTS_SUCCESS, payload);
  } catch (err) {
    socket.emit(socketEvents.UNREAD_COUNTS_SUCCESS, {
      privateChatUnreadCount: 0,
      publicChatUnreadCount: 0,
      privateChats: [],
      publicChats: [],
    });
  }
}

/**
 * Push unreadCountsUpdate to a user (by userId room). Call after new message, read receipt,
 * or participant add/remove so the client can refresh badges without re-requesting.
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 */
async function pushUnreadCountsUpdate(userId) {
  if (!userId) return;
  const io = getIO();
  if (!io) return;

  try {
    const payload = await unreadCountsService.getUnreadCountsForUser(userId);
    const room = String(userId);
    io.to(room).emit(socketEvents.UNREAD_COUNTS_UPDATE, payload);
  } catch (_) {
    // no-op on error; client can refetch via getUnreadCounts
  }
}

/**
 * Push unread counts update to multiple users (e.g. all participants of a chatroom).
 * @param {Array<string|import('mongoose').Types.ObjectId>} userIds
 */
async function pushUnreadCountsUpdateToUsers(userIds) {
  if (!Array.isArray(userIds) || userIds.length === 0) return;
  const seen = new Set();
  const list = userIds.map((id) => (id && id.toString ? id.toString() : String(id))).filter(Boolean);
  list.forEach((id) => seen.add(id));
  await Promise.all([...seen].map((uid) => pushUnreadCountsUpdate(uid)));
}

module.exports = {
  handleGetUnreadCounts,
  pushUnreadCountsUpdate,
  pushUnreadCountsUpdateToUsers,
};
