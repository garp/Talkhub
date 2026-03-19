const Joi = require('joi');
const { ObjectId } = require('./common.validators');

exports.listNotificationsQuerySchema = Joi.object({
  // UI category filter: all | chat_summaries | follows | alerts | messages
  // Also supports stored categories: ai | follows | alerts | news | updates | chats
  category: Joi.string().trim().optional().allow('', null),
  // today | week | month | all
  timeRange: Joi.string().trim().valid('today', 'week', 'month', 'all')
    .default('all'),
  chatroomId: Joi.string().optional().allow('', null).custom(ObjectId),
});

// Mark single notification as read - params validation
exports.markNotificationReadParamsSchema = Joi.object({
  notificationId: Joi.string().required().custom(ObjectId),
});

// Mark multiple notifications as read - body validation
exports.markNotificationsReadBodySchema = Joi.object({
  notificationIds: Joi.array()
    .items(Joi.string().custom(ObjectId))
    .optional()
    .min(1)
    .max(100),
  type: Joi.string()
    .trim()
    .valid('follow', 'unfollow', 'hashtag_message', 'ai_summary', 'alert', 'news', 'update', 'mention')
    .optional(),
  category: Joi.string()
    .trim()
    .valid('ai', 'follows', 'alerts', 'news', 'updates', 'chats')
    .optional(),
  markAll: Joi.boolean().optional().default(false),
}).or('notificationIds', 'type', 'category', 'markAll');

// Get unread count - query validation
exports.getUnreadCountQuerySchema = Joi.object({
  type: Joi.string()
    .trim()
    .valid('follow', 'unfollow', 'hashtag_message', 'ai_summary', 'alert', 'news', 'update', 'mention')
    .optional(),
  category: Joi.string()
    .trim()
    .valid('ai', 'follows', 'alerts', 'news', 'updates', 'chats')
    .optional(),
});
