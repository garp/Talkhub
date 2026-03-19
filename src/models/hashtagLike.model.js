const mongoose = require('mongoose');

const { Schema } = mongoose;

const hashtagLikeSchema = new Schema(
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
  },
  {
    timestamps: true,
  },
);

// Indexes for performance optimization
hashtagLikeSchema.index({ hashtagId: 1, userId: 1 }, { unique: true }); // Unique index to ensure a user can like a hashtag only once
hashtagLikeSchema.index({ createdAt: -1 }); // Sort by creation date
hashtagLikeSchema.index({ userId: 1, createdAt: -1 }); // User's hashtag likes sorted
hashtagLikeSchema.index({ hashtagId: 1, createdAt: -1 }); // Likes on a hashtag sorted

module.exports = mongoose.model('hashtag-likes', hashtagLikeSchema);
