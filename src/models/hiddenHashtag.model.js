const mongoose = require('mongoose');

const { Schema } = mongoose;

const hiddenHashtagSchema = new Schema(
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
hiddenHashtagSchema.index({ userId: 1, hashtagId: 1 }, { unique: true }); // Unique hidden hashtag per user
hiddenHashtagSchema.index({ userId: 1, reason: 1 }); // User's hidden hashtags by reason

module.exports = mongoose.model('hiddenHashtags', hiddenHashtagSchema);
