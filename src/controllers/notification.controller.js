const mongoose = require('mongoose');
const { responseHandler, errorHandler } = require('../../lib/helpers/responseHandler');
const notificationService = require('../services/notificationService');
const { notificationWithUser } = require('../queries/notifications.queries');
const { getIO } = require('../events/socketInstance');
const { socketEvents } = require('../../lib/constants/socket');

const startOfUtcDay = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const startOfUtcWeek = (d) => {
  // Monday as start of week
  const day = d.getUTCDay(); // 0..6 (Sun..Sat)
  const diff = (day + 6) % 7; // days since Monday
  const start = new Date(d);
  start.setUTCDate(d.getUTCDate() - diff);
  return startOfUtcDay(start);
};
const startOfUtcMonth = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

const VALID_TYPES = ['follow', 'unfollow', 'hashtag_message', 'ai_summary', 'alert', 'news', 'update', 'mention'];
const VALID_CATEGORIES = ['ai', 'follows', 'alerts', 'news', 'updates', 'chats'];

const getAllNotifications = async (req, res) => {
  try {
    const { userId } = req.user;
    const { chatroomId, category, timeRange = 'all' } = req.value || req.query;

    const matchExtras = {};

    // Category filter (UI + stored categories)
    const c = category && typeof category === 'string' ? category.trim().toLowerCase() : null;
    if (c && c !== 'all') {
      if (c === 'chat_summaries' || c === 'chat summaries') {
        matchExtras.type = 'ai_summary';
      } else if (c === 'messages') {
        matchExtras.type = 'hashtag_message';
      } else if (c === 'follows') {
        matchExtras.type = { $in: ['follow', 'unfollow'] };
      } else if (['ai', 'alerts', 'news', 'updates', 'chats', 'follows'].includes(c)) {
        matchExtras.category = c;
      } else {
        // unknown category value -> ignore (treat as All)
      }
    }

    // Time range filter
    const now = new Date();
    if (timeRange === 'today') {
      matchExtras.createdAt = { $gte: startOfUtcDay(now) };
    } else if (timeRange === 'week') {
      matchExtras.createdAt = { $gte: startOfUtcWeek(now) };
    } else if (timeRange === 'month') {
      matchExtras.createdAt = { $gte: startOfUtcMonth(now) };
    }

    const query = notificationWithUser(userId, { chatroomId, matchExtras });
    const notifications = await notificationService.aggregate({ query });
    responseHandler(notifications, res);
  } catch (error) {
    errorHandler('ERR-004', res);
  }
};

/**
 * Mark a single notification as read
 * PATCH /notifications/:notificationId/read
 */
const markNotificationRead = async (req, res) => {
  try {
    const { userId } = req.user;
    const { notificationId } = req.params;

    if (!notificationId || !mongoose.Types.ObjectId.isValid(notificationId)) {
      return errorHandler('ERR-002', res, 'Valid notification ID is required.');
    }

    const updated = await notificationService.findOneAndUpdate({
      filter: {
        _id: new mongoose.Types.ObjectId(notificationId),
        userId: new mongoose.Types.ObjectId(userId),
        read: false,
      },
      body: { $set: { read: true } },
    });

    if (!updated) {
      return responseHandler({
        notificationId,
        alreadyRead: true,
        message: 'Notification already read or not found.',
      }, res);
    }

    // Broadcast read update to all user's connected devices
    const io = getIO();
    if (io) {
      io.to(userId).emit(socketEvents.NOTIFICATION_READ_UPDATE, {
        notificationId,
        read: true,
      });
    }

    return responseHandler({
      notificationId,
      read: true,
    }, res);
  } catch (error) {
    return errorHandler('ERR-004', res);
  }
};

/**
 * Mark multiple notifications as read (bulk operation)
 * POST /notifications/mark-read
 * Body: { notificationIds?: string[], type?: string, category?: string, markAll?: boolean }
 */
const markNotificationsRead = async (req, res) => {
  try {
    const { userId } = req.user;
    const {
      notificationIds, type, category, markAll,
    } = req.body;

    // Build filter
    const filter = {
      userId: new mongoose.Types.ObjectId(userId),
      read: false,
    };

    // If specific notification IDs provided
    if (notificationIds && Array.isArray(notificationIds) && notificationIds.length > 0) {
      const validIds = notificationIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (validIds.length === 0) {
        return errorHandler('ERR-002', res, 'No valid notification IDs provided.');
      }
      filter._id = { $in: validIds.map((id) => new mongoose.Types.ObjectId(id)) };
    }

    // Optional type filter
    if (type && typeof type === 'string' && VALID_TYPES.includes(type.toLowerCase())) {
      filter.type = type.toLowerCase();
    }

    // Optional category filter
    if (category && typeof category === 'string' && VALID_CATEGORIES.includes(category.toLowerCase())) {
      filter.category = category.toLowerCase();
    }

    // Safety check: if no specific filter provided and markAll is not true, reject
    if (!notificationIds && !type && !category && !markAll) {
      return errorHandler('ERR-002', res, 'Provide notificationIds, type, category, or set markAll to true.');
    }

    const result = await notificationService.updateMany({
      filter,
      body: { $set: { read: true } },
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

    return responseHandler({
      modifiedCount: result.modifiedCount || 0,
      filter: {
        notificationIds: notificationIds || null,
        type: type || null,
        category: category || null,
      },
    }, res);
  } catch (error) {
    return errorHandler('ERR-004', res);
  }
};

/**
 * Get unread notification count
 * GET /notifications/unread-count
 * Query: { type?: string, category?: string }
 */
const getUnreadNotificationCount = async (req, res) => {
  try {
    const { userId } = req.user;
    const { type, category } = req.query;

    // Build filter
    const filter = {
      userId: new mongoose.Types.ObjectId(userId),
      read: false,
    };

    // Optional type filter
    if (type && typeof type === 'string' && VALID_TYPES.includes(type.toLowerCase())) {
      filter.type = type.toLowerCase();
    }

    // Optional category filter
    if (category && typeof category === 'string' && VALID_CATEGORIES.includes(category.toLowerCase())) {
      filter.category = category.toLowerCase();
    }

    const count = await notificationService.countDocuments({ filter });

    return responseHandler({
      count,
      filter: {
        type: type || null,
        category: category || null,
      },
    }, res);
  } catch (error) {
    return errorHandler('ERR-004', res);
  }
};

module.exports = {
  getAllNotifications,
  markNotificationRead,
  markNotificationsRead,
  getUnreadNotificationCount,
};
