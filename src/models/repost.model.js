const mongoose = require('mongoose');

const repostSchema = new mongoose.Schema(
  {
    repostedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'posts',
      required: true,
      index: true,
    },
    text: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
  },
  { timestamps: true },
);

// Indexes for performance optimization
repostSchema.index({ repostedBy: 1, postId: 1 }, { unique: true }); // Prevent duplicate reposts by same user
repostSchema.index({ repostedBy: 1, createdAt: -1 }); // User's reposts sorted by date
repostSchema.index({ createdAt: -1 }); // Feed sorting

module.exports = mongoose.model('reposts', repostSchema);
