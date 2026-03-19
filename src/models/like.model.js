const mongoose = require('mongoose');

const { Schema } = mongoose;

const likeSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    postId: {
      type: Schema.Types.ObjectId,
      ref: 'posts',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for performance optimization
likeSchema.index({ postId: 1, userId: 1 }, { unique: true }); // Unique index to ensure a user can like a post only once
likeSchema.index({ createdAt: -1 }); // Sort by creation date
likeSchema.index({ userId: 1, createdAt: -1 }); // User's likes sorted
likeSchema.index({ postId: 1, createdAt: -1 }); // Likes on a post sorted

module.exports = mongoose.model('likes', likeSchema);
