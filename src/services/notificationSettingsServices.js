const model = require('../models/notificationSettings.model');
const dal = require('../../lib/dal/dal');

const create = async ({ body, session = null }) => dal.create(model, { body, session });

const findOne = async ({ filter, projection = {}, session = null }) => dal.findOne(model, { filter, projection, session });

const findById = async ({ id, projection = {}, session = null }) => dal.findById(model, { id, projection, session });

const findByIdAndUpdate = async ({ id, body, session = null }) => dal.findByIdAndUpdate(model, { id, body, session });

const findOneAndUpdate = async ({
  filter, body, session = null, customOptions = {},
}) => dal.findOneAndUpdate(model, {
  filter,
  body,
  session,
  customOptions,
});

const findByUserId = async ({ userId, projection = {} }) => dal.findOne(model, { filter: { userId }, projection });

/**
 * Upsert notification settings by userId
 * Creates if not exists, updates if exists
 */
const upsertByUserId = async ({ userId, body, session = null }) => dal.findOneAndUpdate(model, {
  filter: { userId },
  body: { $set: body, $setOnInsert: { userId } },
  session,
  customOptions: { upsert: true, new: true },
});

/**
 * Get notification settings with defaults if not found
 * Returns default settings object if user has no saved settings
 */
const getSettingsWithDefaults = async ({ userId }) => {
  const settings = await findByUserId({ userId });

  if (settings) {
    return settings;
  }

  // Return default settings object (not saved to DB)
  return {
    userId,
    messageNotifications: {
      privateChats: true,
      publicChats: true,
    },
    lastPublicChatNotificationSentAt: null,
    inAppNotifications: {
      sounds: true,
      vibrate: true,
      preview: true,
    },
    lockedScreenNotifications: {
      showTopics: true,
      showNames: true,
      showMessages: true,
    },
    badgeNotifications: {
      enabled: true,
    },
  };
};

/**
 * Check if user can receive private chat push notification
 */
const canReceivePrivateChatNotification = async ({ userId }) => {
  const settings = await findByUserId({ userId });
  // Default to true if no settings exist
  return settings?.messageNotifications?.privateChats ?? true;
};

/**
 * Check if user can receive public chat push notification (once daily)
 * Returns true if publicChats is enabled AND no notification sent today
 */
const canReceivePublicChatNotification = async ({ userId }) => {
  const settings = await findByUserId({ userId });

  // Check if publicChats is enabled (default to true)
  const publicChatsEnabled = settings?.messageNotifications?.publicChats ?? true;
  if (!publicChatsEnabled) {
    return false;
  }

  // Check if we already sent a notification today
  const lastSentAt = settings?.lastPublicChatNotificationSentAt;
  if (!lastSentAt) {
    return true; // No notification sent yet
  }

  // Compare dates (check if it's a new day)
  const lastSentDate = new Date(lastSentAt).toDateString();
  const todayDate = new Date().toDateString();

  return lastSentDate !== todayDate;
};

/**
 * Mark that a public chat notification was sent today
 */
const markPublicChatNotificationSent = async ({ userId, session = null }) => upsertByUserId({
  userId,
  body: { lastPublicChatNotificationSentAt: new Date() },
  session,
});

module.exports = {
  create,
  findOne,
  findById,
  findByIdAndUpdate,
  findOneAndUpdate,
  findByUserId,
  upsertByUserId,
  getSettingsWithDefaults,
  canReceivePrivateChatNotification,
  canReceivePublicChatNotification,
  markPublicChatNotificationSent,
};
