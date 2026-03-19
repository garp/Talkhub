/**
 * Active Users Service
 *
 * Tracks which users are currently connected to the socket server
 * and provides methods to count active users in chatrooms.
 *
 * Redis Structure:
 *   - online:users (SET) - Set of all currently connected userIds
 */

const redisHelper = require('../../lib/helpers/connectRedis');
const participantServices = require('./participantServices');
const privateChatroomServices = require('./privateChatroomServices');
const chatroomServices = require('./chatroomServices');
const userServices = require('./userServices');

const ONLINE_USERS_KEY = 'online:users';
const ONLINE_TTL_SECONDS = 60 * 60 * 24; // 24 hours (failsafe)

/**
 * Get Redis client
 */
const getRedisClient = async () => {
  try {
    return redisHelper.getClient() || (await redisHelper.connectRedis());
  } catch {
    return null;
  }
};

// ─────────────────────────────────────────────────────────────
// User Online/Offline Tracking
// ─────────────────────────────────────────────────────────────

/**
 * Mark a user as online (add to Redis SET)
 * @param {string} userId - User ID to mark as online
 */
const markUserOnline = async (userId) => {
  if (!userId) return false;

  try {
    const client = await getRedisClient();
    if (!client) return false;

    await client.sadd(ONLINE_USERS_KEY, userId.toString());
    // Refresh TTL on the set
    await client.expire(ONLINE_USERS_KEY, ONLINE_TTL_SECONDS);
    return true;
  } catch (error) {
    console.error('[ActiveUsers] Error marking user online:', error.message);
    return false;
  }
};

/**
 * Mark a user as offline (remove from Redis SET)
 * @param {string} userId - User ID to mark as offline
 */
const markUserOffline = async (userId) => {
  if (!userId) return false;

  try {
    const client = await getRedisClient();
    if (!client) return false;

    await client.srem(ONLINE_USERS_KEY, userId.toString());
    return true;
  } catch (error) {
    console.error('[ActiveUsers] Error marking user offline:', error.message);
    return false;
  }
};

/**
 * Check if a user is online
 * @param {string} userId - User ID to check
 * @returns {Promise<boolean>}
 */
const isUserOnline = async (userId) => {
  if (!userId) return false;

  try {
    const client = await getRedisClient();
    if (!client) return false;

    const result = await client.sismember(ONLINE_USERS_KEY, userId.toString());
    return result === 1;
  } catch {
    return false;
  }
};

/**
 * Get all online user IDs
 * @returns {Promise<string[]>}
 */
const getOnlineUserIds = async () => {
  try {
    const client = await getRedisClient();
    if (!client) return [];

    const userIds = await client.smembers(ONLINE_USERS_KEY);
    return userIds || [];
  } catch {
    return [];
  }
};

/**
 * Get count of all online users
 * @returns {Promise<number>}
 */
const getOnlineUserCount = async () => {
  try {
    const client = await getRedisClient();
    if (!client) return 0;

    const count = await client.scard(ONLINE_USERS_KEY);
    return count || 0;
  } catch {
    return 0;
  }
};

// ─────────────────────────────────────────────────────────────
// Chatroom Active Users
// ─────────────────────────────────────────────────────────────

/**
 * Get user counts and details for a hashtag chatroom
 * @param {string} hashtagId - Hashtag ID (not chatroomId!)
 * @returns {Promise<{ totalUsers: number, onlineCount: number, users: Array }>}
 */
const getHashtagActiveUsers = async (hashtagId) => {
  try {
    const chatroom = await chatroomServices.findOne({
      filter: { hashtagId, parentChatroomId: null },
      projection: { _id: 1 },
    });

    if (!chatroom) {
      console.log(`[ActiveUsers] No chatroom found for hashtagId: ${hashtagId}`);
      return { totalUsers: 0, onlineCount: 0, users: [] };
    }

    const chatroomId = chatroom._id;

    const participants = await participantServices.find({
      filter: { chatroomId },
      projection: { userId: 1 },
    });

    const participantUserIds = participants
      .map((p) => p.userId?.toString())
      .filter(Boolean);

    const totalUsers = participantUserIds.length;

    if (totalUsers === 0) {
      return { totalUsers: 0, onlineCount: 0, users: [] };
    }

    const onlineUserIds = await getOnlineUserIds();
    const onlineSet = new Set(onlineUserIds);

    const allUsers = await userServices.find({
      filter: { _id: { $in: participantUserIds } },
      projection: {
        _id: 1,
        userName: 1,
        fullName: 1,
        profilePicture: 1,
        lastActive: 1,
      },
    });

    const users = (allUsers || []).map((u) => ({
      _id: u._id,
      userName: u.userName,
      fullName: u.fullName,
      profilePicture: u.profilePicture,
      lastActive: u.lastActive,
      isOnline: onlineSet.has(u._id.toString()),
    }));

    // Sort: online users first, then by lastActive descending
    users.sort((a, b) => {
      if (a.isOnline !== b.isOnline) return b.isOnline - a.isOnline;
      const aTime = a.lastActive ? new Date(a.lastActive).getTime() : 0;
      const bTime = b.lastActive ? new Date(b.lastActive).getTime() : 0;
      return bTime - aTime;
    });

    const onlineCount = users.filter((u) => u.isOnline).length;

    return { totalUsers, onlineCount, users };
  } catch (error) {
    console.error('[ActiveUsers] Error getting hashtag active users:', error.message);
    return { totalUsers: 0, onlineCount: 0, users: [] };
  }
};

/**
 * Get user counts and details for a private chatroom
 * @param {string} chatroomId - Private chatroom ID
 * @returns {Promise<{ totalUsers: number, onlineCount: number, users: Array }>}
 */
const getPrivateActiveUsers = async (chatroomId) => {
  try {
    const chatroom = await privateChatroomServices.findById({ id: chatroomId });

    if (!chatroom) {
      return { totalUsers: 0, onlineCount: 0, users: [] };
    }

    const participantUserIds = (chatroom.participants || [])
      .filter((p) => p.isPresent !== false)
      .map((p) => p.userId?.toString())
      .filter(Boolean);

    const totalUsers = participantUserIds.length;

    if (totalUsers === 0) {
      return { totalUsers: 0, onlineCount: 0, users: [] };
    }

    const onlineUserIds = await getOnlineUserIds();
    const onlineSet = new Set(onlineUserIds);

    const allUsers = await userServices.find({
      filter: { _id: { $in: participantUserIds } },
      projection: {
        _id: 1,
        userName: 1,
        fullName: 1,
        profilePicture: 1,
        lastActive: 1,
      },
    });

    const users = (allUsers || []).map((u) => ({
      _id: u._id,
      userName: u.userName,
      fullName: u.fullName,
      profilePicture: u.profilePicture,
      lastActive: u.lastActive,
      isOnline: onlineSet.has(u._id.toString()),
    }));

    // Sort: online users first, then by lastActive descending
    users.sort((a, b) => {
      if (a.isOnline !== b.isOnline) return b.isOnline - a.isOnline;
      const aTime = a.lastActive ? new Date(a.lastActive).getTime() : 0;
      const bTime = b.lastActive ? new Date(b.lastActive).getTime() : 0;
      return bTime - aTime;
    });

    const onlineCount = users.filter((u) => u.isOnline).length;

    return { totalUsers, onlineCount, users };
  } catch (error) {
    console.error('[ActiveUsers] Error getting private active users:', error.message);
    return { totalUsers: 0, onlineCount: 0, users: [] };
  }
};

/**
 * Get user counts and details for any chatroom type
 * @param {string} chatroomId - Chatroom ID
 * @param {string} chatroomType - 'hashtag' or 'private'
 * @returns {Promise<{ chatroomId: string, chatroomType: string, totalUsers: number, onlineCount: number, users: Array }>}
 */
const getActiveUsers = async (chatroomId, chatroomType) => {
  let result;

  switch (chatroomType) {
    case 'hashtag':
      result = await getHashtagActiveUsers(chatroomId);
      break;
    case 'private':
      result = await getPrivateActiveUsers(chatroomId);
      break;
    default:
      result = { totalUsers: 0, onlineCount: 0, users: [] };
  }

  return {
    chatroomId,
    chatroomType,
    ...result,
  };
};

// ─────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────

module.exports = {
  markUserOnline,
  markUserOffline,
  isUserOnline,
  getOnlineUserIds,
  getOnlineUserCount,
  getHashtagActiveUsers,
  getPrivateActiveUsers,
  getActiveUsers,
};
