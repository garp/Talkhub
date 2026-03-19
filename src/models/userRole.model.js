const mongoose = require('mongoose');

const { Schema } = mongoose;

const userRoleSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    hashtagRoleId: {
      type: Schema.Types.ObjectId,
      ref: 'hashtag-roles',
      required: true,
      index: true,
    },
    hashtagId: {
      type: Schema.Types.ObjectId,
      ref: 'hashtags',
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for performance optimization
userRoleSchema.index({ userId: 1, hashtagRoleId: 1, hashtagId: 1 }, { unique: true }); // Prevent duplicate assignments
userRoleSchema.index({ hashtagId: 1, hashtagRoleId: 1 }); // Users with role in hashtag
userRoleSchema.index({ createdAt: -1 }); // Sort by assignment date

module.exports = mongoose.model('user-roles', userRoleSchema);
