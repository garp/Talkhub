const Joi = require('joi');

/**
 * Schema for updating notification settings
 * All fields are optional - only update what's provided
 */
exports.updateNotificationSettingsSchema = Joi.object({
  messageNotifications: Joi.object({
    privateChats: Joi.boolean(),
    publicChats: Joi.boolean(),
  }),
  inAppNotifications: Joi.object({
    sounds: Joi.boolean(),
    vibrate: Joi.boolean(),
    preview: Joi.boolean(),
  }),
  lockedScreenNotifications: Joi.object({
    showTopics: Joi.boolean(),
    showNames: Joi.boolean(),
    showMessages: Joi.boolean(),
  }),
  badgeNotifications: Joi.object({
    enabled: Joi.boolean(),
  }),
}).min(1);
