const mongoose = require('mongoose');

const { Schema } = mongoose;

const hashtagRequestSchema = new Schema(
  {
    hashtagId: {
      type: Schema.Types.ObjectId,
      ref: 'hashtags',
      required: true,
      index: true,
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    targetUserId: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected', 'cancelled'],
      default: 'pending',
      index: true,
    },
    roleKey: {
      type: String,
      default: 'MEMBER',
      trim: true,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Indexes for performance optimization
hashtagRequestSchema.index(
  { hashtagId: 1, targetUserId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
); // Prevent duplicate pending invites
hashtagRequestSchema.index({ invitedBy: 1, createdAt: -1 }); // Invites sent by user sorted
hashtagRequestSchema.index({ targetUserId: 1, status: 1, createdAt: -1 }); // User's invites by status
hashtagRequestSchema.index({ hashtagId: 1, status: 1, createdAt: -1 }); // Hashtag invites by status

module.exports = mongoose.model('hashtag-requests', hashtagRequestSchema);
