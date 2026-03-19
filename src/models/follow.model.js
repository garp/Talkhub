const mongoose = require('mongoose');

const { Schema } = mongoose;

const followSchema = new Schema(
  {
    followerId: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    followingId: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted'],
      default: 'accepted',
    },
    notificationsEnabled: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for performance optimization
followSchema.index({ followerId: 1, followingId: 1 }, { unique: true }); // Prevent duplicate follows
followSchema.index({ followingId: 1, followerId: 1 }); // Reverse lookup
followSchema.index({ followerId: 1, status: 1 }); // Follower's follows by status
followSchema.index({ followingId: 1, status: 1 }); // Following's followers by status
followSchema.index({ createdAt: -1 }); // Sort by creation date
followSchema.index({ followerId: 1, createdAt: -1 }); // User's follows sorted
followSchema.index({ followingId: 1, createdAt: -1 }); // User's followers sorted

module.exports = mongoose.model('follows', followSchema);
