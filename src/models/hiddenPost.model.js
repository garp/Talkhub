const mongoose = require('mongoose');

const { Schema } = mongoose;

const hiddenPostSchema = new Schema(
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
    reason: {
      type: String,
      enum: ['not_interested'],
      default: 'not_interested',
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for performance optimization
hiddenPostSchema.index({ userId: 1, postId: 1 }, { unique: true }); // Unique hidden post per user
hiddenPostSchema.index({ userId: 1, reason: 1 }); // User's hidden posts by reason

module.exports = mongoose.model('hiddenPosts', hiddenPostSchema);
