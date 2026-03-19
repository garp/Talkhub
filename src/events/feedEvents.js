const { getIO } = require('./socketInstance');
const { socketEvents } = require('../../lib/constants/socket');

/**
 * Emit new feed event to all connected users except the creator.
 * This broadcasts when a user creates:
 * - A new post
 * - A new public hashtag
 * - A new repost
 *
 * @param {Object} params
 * @param {string} params.type - Type of feed item: 'post' | 'hashtag' | 'repost'
 * @param {string} params.creatorUserId - User ID of the creator (to exclude from broadcast)
 * @param {Object} params.data - The feed item data (post, hashtag, or repost)
 * @param {Object} [params.originalPost] - Original post data (for reposts only)
 * @param {Object} [params.creator] - Optional creator user info
 */
exports.emitNewFeed = ({
  type,
  creatorUserId,
  data,
  originalPost = null,
  creator = null,
}) => {
  const io = getIO();
  if (!io) {
    console.warn('Socket.IO not initialized, cannot emit newFeed');
    return;
  }

  const payload = {
    type,
    data,
    creator,
    createdAt: new Date().toISOString(),
  };

  // Add originalPost for reposts
  if (type === 'repost' && originalPost) {
    payload.originalPost = originalPost;
  }

  // Broadcast to all connected sockets except the creator
  // Each connected user joins their own "user room" on connection (userId as room name)
  // We emit to all sockets and let client-side filter, OR we can use rooms

  // Option 1: Broadcast to all (clients filter by userId)
  // This is simpler and works for feed updates

  // Get all connected sockets
  const { sockets } = io.sockets;

  sockets.forEach((socket) => {
    // Skip if this socket belongs to the creator
    if (socket.userId && String(socket.userId) === String(creatorUserId)) {
      return;
    }

    // Emit the appropriate event
    socket.emit(socketEvents.NEW_FEED, payload);

    // Also emit specific event based on type
    if (type === 'post') {
      socket.emit(socketEvents.NEW_FEED_POST, payload);
    } else if (type === 'hashtag') {
      socket.emit(socketEvents.NEW_FEED_HASHTAG, payload);
    } else if (type === 'repost') {
      socket.emit(socketEvents.NEW_FEED_REPOST, payload);
    }
  });
};

/**
 * Emit new post to feed
 * @param {Object} params
 * @param {string} params.creatorUserId - Creator's user ID
 * @param {Object} params.post - The created post
 * @param {Object} [params.creator] - Creator user info
 */
exports.emitNewFeedPost = ({ creatorUserId, post, creator = null }) => {
  exports.emitNewFeed({
    type: 'post',
    creatorUserId,
    data: post,
    creator,
  });
};

/**
 * Emit new public hashtag to feed
 * @param {Object} params
 * @param {string} params.creatorUserId - Creator's user ID
 * @param {Object} params.hashtag - The created hashtag
 * @param {Object} [params.creator] - Creator user info
 */
exports.emitNewFeedHashtag = ({ creatorUserId, hashtag, creator = null }) => {
  // Only emit for public hashtags
  if (hashtag && hashtag.access !== 'public') {
    return;
  }

  exports.emitNewFeed({
    type: 'hashtag',
    creatorUserId,
    data: hashtag,
    creator,
  });
};

/**
 * Emit new repost to feed
 * @param {Object} params
 * @param {string} params.creatorUserId - Reposter's user ID
 * @param {Object} params.repost - The created repost
 * @param {Object} params.originalPost - The original post being reposted
 * @param {Object} [params.creator] - Reposter user info
 */
exports.emitNewRepost = ({
  creatorUserId, repost, originalPost, creator = null,
}) => {
  exports.emitNewFeed({
    type: 'repost',
    creatorUserId,
    data: repost,
    originalPost,
    creator,
  });
};
