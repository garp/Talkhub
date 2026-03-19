const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    // Recipient user
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    // Actor/sender (optional: for follow/unfollow/message)
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      default: null,
      index: true,
    },
    // Optional chatroom context (hashtag chats)
    chatroomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'chatrooms',
      default: null,
      index: true,
    },
    // Category for UI tabs (All is just no filter)
    category: {
      type: String,
      enum: ['ai', 'follows', 'alerts', 'news', 'updates', 'chats'],
      default: 'updates',
      index: true,
    },
    type: {
      type: String,
      enum: ['follow', 'unfollow', 'hashtag_message', 'ai_summary', 'alert', 'news', 'update', 'mention'],
      required: true,
      index: true,
    },
    summary: {
      type: String,
      required: true,
      trim: true,
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    meta: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true },
);

// Indexes for performance optimization
notificationSchema.index({ userId: 1, createdAt: -1 }); // User's notifications sorted
notificationSchema.index({ userId: 1, category: 1, createdAt: -1 }); // User's notifications by category
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 }); // Unread notifications
notificationSchema.index({ userId: 1, type: 1, createdAt: -1 }); // Notifications by type
notificationSchema.index({ senderId: 1, createdAt: -1 }); // Notifications sent by user

module.exports = mongoose.model('notifications', notificationSchema);
