const mongoose = require('mongoose');

const { Schema } = mongoose;

const messageReactionSchema = new Schema(
  {
    hashtagId: {
      type: Schema.Types.ObjectId,
      ref: 'hashtags',
      required: true,
      index: true,
    },
    chatroomId: {
      type: Schema.Types.ObjectId,
      ref: 'chatrooms',
      required: true,
      index: true,
    },
    messageId: {
      type: Schema.Types.ObjectId,
      ref: 'messages',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    emoji: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true },
);

// Indexes for performance optimization
messageReactionSchema.index({ messageId: 1, userId: 1 }, { unique: true }); // One reaction per user per message
messageReactionSchema.index({ messageId: 1, emoji: 1 }); // Reactions by emoji
messageReactionSchema.index({ userId: 1, createdAt: -1 }); // User's reactions sorted
messageReactionSchema.index({ chatroomId: 1, createdAt: -1 }); // Chatroom reactions sorted

module.exports = mongoose.model('message-reactions', messageReactionSchema);
