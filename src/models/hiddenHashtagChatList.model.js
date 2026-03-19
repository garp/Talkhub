const mongoose = require('mongoose');

const { Schema } = mongoose;

// Per-user hidden state for hashtag chat list (chat screen "remove").
// This does NOT delete the hashtag or messages; it only hides the chat list entry until the next new message.
const hiddenHashtagChatListSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    hashtagId: {
      type: Schema.Types.ObjectId,
      ref: 'hashtags',
      required: true,
      index: true,
    },
    hiddenAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true },
);

// Indexes for performance optimization
hiddenHashtagChatListSchema.index({ userId: 1, hashtagId: 1 }, { unique: true }); // Unique hidden chat per user
hiddenHashtagChatListSchema.index({ userId: 1, hiddenAt: -1 }); // User's hidden chats sorted

module.exports = mongoose.model('hiddenHashtagChatLists', hiddenHashtagChatListSchema);
