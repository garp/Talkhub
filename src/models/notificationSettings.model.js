const mongoose = require('mongoose');

const notificationSettingsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      unique: true,
      index: true,
    },
    // Message Notifications
    messageNotifications: {
      privateChats: { type: Boolean, default: true },
      publicChats: { type: Boolean, default: true },
    },
    // Track last public chat notification sent (for "once daily" logic)
    lastPublicChatNotificationSentAt: {
      type: Date,
      default: null,
    },
    // In-App Notifications
    inAppNotifications: {
      sounds: { type: Boolean, default: true },
      vibrate: { type: Boolean, default: true },
      preview: { type: Boolean, default: true },
    },
    // Locked Screen Notifications
    lockedScreenNotifications: {
      showTopics: { type: Boolean, default: true },
      showNames: { type: Boolean, default: true },
      showMessages: { type: Boolean, default: true },
    },
    // Badge Notifications
    badgeNotifications: {
      enabled: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
);

// Indexes for performance optimization
// userId already has unique: true which creates an index
notificationSettingsSchema.index({ updatedAt: -1 }); // Sort by last update

module.exports = mongoose.model('notificationSettings', notificationSettingsSchema);
