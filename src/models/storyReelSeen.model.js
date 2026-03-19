const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * Reel-level "seen" tracking for a viewer against an owner's story reel.
 * Used to power unseen-first ordering in story feed.
 */
const storyReelSeenSchema = new Schema(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    viewerId: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    lastSeenAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

storyReelSeenSchema.index({ ownerId: 1, viewerId: 1 }, { unique: true });
storyReelSeenSchema.index({ viewerId: 1, lastSeenAt: -1 });

module.exports = mongoose.model('storyreelseens', storyReelSeenSchema);
