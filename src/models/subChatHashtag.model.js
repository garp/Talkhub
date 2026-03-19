const mongoose = require('mongoose');

const subChatHashtagSchema = new mongoose.Schema(
  {
    hashtagId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'hashtags',
    },
    name: {
      type: String,
      required: true,
    },
    hashtagPicture: {
      type: String,
      default: '',
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for performance optimization
subChatHashtagSchema.index({ hashtagId: 1 }); // Sub-chats for a hashtag
subChatHashtagSchema.index({ userId: 1 }); // Sub-chats created by user
subChatHashtagSchema.index({ hashtagId: 1, createdAt: -1 }); // Sub-chats sorted by date
subChatHashtagSchema.index({ name: 'text' }); // Text search on name

module.exports = mongoose.model('subChatHashtags', subChatHashtagSchema);
