const { socketEvents } = require('../../lib/constants/socket');
const activeUsersService = require('../services/activeUsersService');

/**
 * Active Users Socket Event Handlers
 *
 * Provides user counts and details for chatrooms.
 *
 * Usage:
 *   1. Frontend emits 'activeUsers' with { chatroomId, chatroomType }
 *   2. Server responds with 'activeUsersSuccess' containing:
 *      - chatroomId: string
 *      - chatroomType: 'hashtag' | 'private'
 *      - totalUsers: number (total participants)
 *      - onlineCount: number (currently online count)
 *      - users: Array of { _id, userName, fullName, profilePicture, lastActive, isOnline }
 *        (sorted: online users first, then by lastActive descending)
 */

/**
 * Handle request for active users in a chatroom
 * Event: activeUsers
 * Payload: {
 *   chatroomId: string,    // Required: ID of the chatroom
 *   chatroomType: string   // Required: 'hashtag' or 'private'
 * }
 */
exports.handleActiveUsers = async (socket, data) => {
  try {
    const { userId } = socket;

    if (!userId) {
      socket.emit(socketEvents.ACTIVE_USERS_FAILED, {
        message: 'Authentication required',
      });
      return;
    }

    const { chatroomId, chatroomType } = data || {};

    if (!chatroomId) {
      socket.emit(socketEvents.ACTIVE_USERS_FAILED, {
        message: 'chatroomId is required',
      });
      return;
    }

    if (!chatroomType || !['hashtag', 'private'].includes(chatroomType)) {
      socket.emit(socketEvents.ACTIVE_USERS_FAILED, {
        message: 'chatroomType must be "hashtag" or "private"',
      });
      return;
    }

    // Get active user counts
    const result = await activeUsersService.getActiveUsers(chatroomId, chatroomType);

    socket.emit(socketEvents.ACTIVE_USERS_SUCCESS, result);
  } catch (error) {
    console.error('[ActiveUsers] handleActiveUsers error:', error.message);
    socket.emit(socketEvents.ACTIVE_USERS_FAILED, {
      message: error.message || 'Failed to get active users',
    });
  }
};

/**
 * Handle user coming online (called from onConnection)
 * @param {string} userId - User ID
 */
exports.handleUserOnline = async (userId) => {
  try {
    await activeUsersService.markUserOnline(userId);
    console.log(`[ActiveUsers] User ${userId} marked online`);
  } catch (error) {
    console.error('[ActiveUsers] handleUserOnline error:', error.message);
  }
};

/**
 * Handle user going offline (called from onDisconnect)
 * @param {string} userId - User ID
 */
exports.handleUserOffline = async (userId) => {
  try {
    await activeUsersService.markUserOffline(userId);
    console.log(`[ActiveUsers] User ${userId} marked offline`);
  } catch (error) {
    console.error('[ActiveUsers] handleUserOffline error:', error.message);
  }
};
