const mongoose = require('mongoose');

const { Schema } = mongoose;

const messageCommentSchema = new Schema(
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
    commentBy: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    // Optional threaded replies (Telegram-style comments)
    parentCommentId: {
      type: Schema.Types.ObjectId,
      ref: 'message-comments',
      default: null,
      index: true,
    },
    // Optional media, aligned to post comments shape (future-proof)
    media: [{
      url: { type: String, trim: true, required: true },
      mediaType: { type: String, enum: ['image', 'video'], required: true },
    }],
  },
  { timestamps: true },
);

// Indexes for performance optimization
messageCommentSchema.index({ messageId: 1, createdAt: -1 }); // Message comments sorted
messageCommentSchema.index({ commentBy: 1, createdAt: -1 }); // User's comments sorted
messageCommentSchema.index({ messageId: 1, parentCommentId: 1, createdAt: -1 }); // Threaded comments
messageCommentSchema.index({ content: 'text' }); // Text search on comment content

module.exports = mongoose.model('message-comments', messageCommentSchema);
