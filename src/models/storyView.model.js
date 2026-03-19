const mongoose = require('mongoose');

const { Schema } = mongoose;

const storyViewSchema = new Schema(
  {
    storyId: {
      type: Schema.Types.ObjectId,
      ref: 'stories',
      required: true,
      index: true,
    },
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
    viewedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    // Instagram-like quick reaction (emoji)
    reaction: {
      type: String,
      default: null,
      trim: true,
    },
    // Like (heart) on a story – separate from emoji reaction
    liked: {
      type: Boolean,
      default: false,
    },
    // Optional: if reply creates a message, store its id for insights
    replyMessageId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true },
);

// Prevent duplicate views per user per story
storyViewSchema.index({ storyId: 1, viewerId: 1 }, { unique: true });
storyViewSchema.index({ ownerId: 1, viewedAt: -1 });
storyViewSchema.index({ storyId: 1, viewedAt: -1 });

module.exports = mongoose.model('storyviews', storyViewSchema);
