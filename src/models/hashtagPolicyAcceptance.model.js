const mongoose = require('mongoose');

const { Schema } = mongoose;

// Tracks when a user accepted a hashtag's policy.
// One record per (userId, hashtagId).
const hashtagPolicyAcceptanceSchema = new Schema(
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
  { timestamps: true },
);

// Indexes for performance optimization
hashtagPolicyAcceptanceSchema.index({ userId: 1, hashtagId: 1 }, { unique: true }); // Unique acceptance per user-hashtag
hashtagPolicyAcceptanceSchema.index({ createdAt: -1 }); // Sort by acceptance date

module.exports = mongoose.model('hashtagPolicyAcceptances', hashtagPolicyAcceptanceSchema);
