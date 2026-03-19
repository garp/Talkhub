const mongoose = require('mongoose');
const notificationService = require('../services/notificationService');
const { socketEvents } = require('../../lib/constants/socket');
const { notificationsByTypeWithUser } = require('../queries/notifications.queries');
const { getIO } = require('./socketInstance');

const ALLOWED_TYPES = new Set([
  'follow',
  'unfollow',
  'hashtag_message',
  'ai_summary',
  'alert',
  'news',
  'update',
  'mention',
]);

/**
 * Mark a single notification as read
 * @param {Socket} socket - Socket.io socket instance
 * @param {Object} data - { notificationId: string }
 */
exports.markNotificationRead = async (socket, data = {}) => {
  try {
    const { userId } = socket.handshake.query;
    if (!userId) {
      socket.emit(socketEvents.MARK_NOTIFICATION_READ_FAILED, { message: 'User ID is required.' });
      return;
    }

    const { notificationId } = data;
    if (!notificationId || !mongoose.Types.ObjectId.isValid(notificationId)) {
      socket.emit(socketEvents.MARK_NOTIFICATION_READ_FAILED, { message: 'Valid notification ID is required.' });
      return;
    }

    const updated = await notificationService.findOneAndUpdate({
      filter: {
        _id: new mongoose.Types.ObjectId(notificationId),
        userId: new mongoose.Types.ObjectId(userId),
        read: false, // Only update if not already read
      },
      body: { $set: { read: true } },
    });

    if (!updated) {
      // Either notification doesn't exist, doesn't belong to user, or already read
      socket.emit(socketEvents.MARK_NOTIFICATION_READ_SUCCESS, {
        notificationId,
        alreadyRead: true,
        message: 'Notification already read or not found.',
      });
      return;
    }

    // Emit success to the requesting socket
    socket.emit(socketEvents.MARK_NOTIFICATION_READ_SUCCESS, {
      notificationId,
      read: true,
    });

    // Broadcast read update to all user's connected devices
    const io = getIO();
    if (io) {
      io.to(userId).emit(socketEvents.NOTIFICATION_READ_UPDATE, {
        notificationId,
        read: true,
      });
    }
  } catch (error) {
    socket.emit(socketEvents.MARK_NOTIFICATION_READ_FAILED, {
      message: error.message || 'Failed to mark notification as read.',
    });
  }
};

/**
 * Mark multiple notifications as read
 * @param {Socket} socket - Socket.io socket instance
 * @param {Object} data - { notificationIds: string[] } or { type?: string, category?: string } for bulk operations
 */
exports.markAllNotificationsRead = async (socket, data = {}) => {
  try {
    const { userId } = socket.handshake.query;
    if (!userId) {
      socket.emit(socketEvents.MARK_ALL_NOTIFICATIONS_READ_FAILED, { message: 'User ID is required.' });
      return;
    }

    const { notificationIds, type, category } = data;

    // Build filter for bulk update
    const filter = {
      userId: new mongoose.Types.ObjectId(userId),
      read: false,
    };

    // If specific notification IDs provided
    if (notificationIds && Array.isArray(notificationIds) && notificationIds.length > 0) {
      const validIds = notificationIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (validIds.length === 0) {
        socket.emit(socketEvents.MARK_ALL_NOTIFICATIONS_READ_FAILED, { message: 'No valid notification IDs provided.' });
        return;
      }
      filter._id = { $in: validIds.map((id) => new mongoose.Types.ObjectId(id)) };
    }

    // Optional type filter
    if (type && typeof type === 'string' && ALLOWED_TYPES.has(type.toLowerCase())) {
      filter.type = type.toLowerCase();
    }

    // Optional category filter
    if (category && typeof category === 'string') {
      const validCategories = ['ai', 'follows', 'alerts', 'news', 'updates', 'chats'];
      if (validCategories.includes(category.toLowerCase())) {
        filter.category = category.toLowerCase();
      }
    }

    const result = await notificationService.updateMany({
      filter,
      body: { $set: { read: true } },
    });

    // Emit success to the requesting socket
    socket.emit(socketEvents.MARK_ALL_NOTIFICATIONS_READ_SUCCESS, {
      modifiedCount: result.modifiedCount || 0,
      filter: {
        notificationIds: notificationIds || null,
        type: type || null,
        category: category || null,
      },
    });

    // Broadcast read update to all user's connected devices
    const io = getIO();
    if (io) {
      io.to(userId).emit(socketEvents.NOTIFICATION_READ_UPDATE, {
        bulkUpdate: true,
        modifiedCount: result.modifiedCount || 0,
        filter: {
          notificationIds: notificationIds || null,
          type: type || null,
          category: category || null,
        },
      });
    }
  } catch (error) {
    socket.emit(socketEvents.MARK_ALL_NOTIFICATIONS_READ_FAILED, {
      message: error.message || 'Failed to mark notifications as read.',
    });
  }
};

/**
 * Get unread notification count
 * @param {Socket} socket - Socket.io socket instance
 * @param {Object} data - { type?: string, category?: string }
 */
exports.getUnreadNotificationCount = async (socket, data = {}) => {
  try {
    const { userId } = socket.handshake.query;
    if (!userId) {
      socket.emit(socketEvents.GET_UNREAD_NOTIFICATION_COUNT_FAILED, { message: 'User ID is required.' });
      return;
    }

    const { type, category } = data;

    // Build filter
    const filter = {
      userId: new mongoose.Types.ObjectId(userId),
      read: false,
    };

    // Optional type filter
    if (type && typeof type === 'string' && ALLOWED_TYPES.has(type.toLowerCase())) {
      filter.type = type.toLowerCase();
    }

    // Optional category filter
    if (category && typeof category === 'string') {
      const validCategories = ['ai', 'follows', 'alerts', 'news', 'updates', 'chats'];
      if (validCategories.includes(category.toLowerCase())) {
        filter.category = category.toLowerCase();
      }
    }

    const count = await notificationService.countDocuments({ filter });

    socket.emit(socketEvents.GET_UNREAD_NOTIFICATION_COUNT_SUCCESS, {
      count,
      filter: {
        type: type || null,
        category: category || null,
      },
    });
  } catch (error) {
    socket.emit(socketEvents.GET_UNREAD_NOTIFICATION_COUNT_FAILED, {
      message: error.message || 'Failed to get unread notification count.',
    });
  }
};

exports.getNotificationsByType = async (socket, data = {}) => {
  try {
    const { userId } = socket.handshake.query;
    if (!userId) {
      socket.emit(socketEvents.GET_NOTIFICATION_FAILED, { message: 'User ID is required.' });
      return;
    }

    const page = Math.max(1, parseInt(data.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(data.limit, 10) || 20));
    const typeRaw = typeof data.type === 'string' ? data.type.trim() : '';
    const type = typeRaw ? typeRaw.toLowerCase() : 'all';

    if (type !== 'all' && !ALLOWED_TYPES.has(type)) {
      socket.emit(socketEvents.GET_NOTIFICATION_FAILED, { message: 'Invalid notification type.' });
      return;
    }

    const query = notificationsByTypeWithUser({
      userId: new mongoose.Types.ObjectId(userId),
      type,
      page,
      limit,
    });

    const result = await notificationService.aggregate({ query });
    const facet = (result && result[0]) || {};
    const notifications = facet.notifications || [];
    const totalCount = (facet.totalCount && facet.totalCount[0] && facet.totalCount[0].count) || 0;
    const totalPages = Math.ceil(totalCount / limit);

    socket.emit(socketEvents.GET_NOTIFICATION_SUCCESS, {
      metadata: {
        totalDocuments: totalCount,
        totalPages,
        page,
        limit,
      },
      notifications,
      filter: { type },
    });
  } catch (error) {
    socket.emit(socketEvents.GET_NOTIFICATION_FAILED, { message: error.message || 'Failed to get notifications.' });
  }
};
