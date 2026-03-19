const mongoose = require('mongoose');

const storiesSchema = new mongoose.Schema({
  storyFrom: {
    type: String,
    enum: ['user', 'hashtag'],
    required: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  hashtagId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'hashtags',
  },
  // Story lifecycle: active in feed until expiresAt; afterwards may remain archived for highlights/archive UI.
  expiresAt: {
    type: Date,
    default: null,
    index: true,
  },
  isArchived: {
    type: Boolean,
    default: false,
  },
  storyUrl: {
    type: String,
    required: true,
  },
  thumbnailUrl: {
    type: String,
  },
  // Audience / privacy
  // - followers: visible to accepted followers (and self)
  // - close_friends: visible only to users in owner's closeFriends (and self)
  audience: {
    type: String,
    enum: ['followers', 'close_friends'],
    default: 'followers',
    index: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isHighlight: {
    type: Boolean,
    default: false,
  },
  type: {
    type: String,
    enum: ['image', 'video'],
    required: true,
  },
  // Optional metadata
  caption: {
    type: String,
    default: null,
    trim: true,
  },
  // Mentions (lightweight): store mentioned userIds.
  // If you need exact positions later, migrate to [{ userId, start, end }]
  mentionUserIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
  }],
  linkSticker: {
    url: { type: String, default: null, trim: true },
    label: { type: String, default: null, trim: true },
  },
  // Interactive stickers (phase-able). Keep schema flexible.
  interactive: {
    polls: { type: Array, default: [] },
    questions: { type: Array, default: [] },
    sliders: { type: Array, default: [] },
  },
  // Moderation tracking (reuses mediaAssets pipeline)
  mediaAssetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'mediaAssets',
    default: null,
  },
  // Insights (denormalized counters)
  viewCount: { type: Number, default: 0 },
  replyCount: { type: Number, default: 0 },
  reactionCount: { type: Number, default: 0 },
  likeCount: { type: Number, default: 0 },
  collectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'storycollections',
  },
  highlightCollectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'highlightcollections',
  },
}, { timestamps: true });

// Indexes for performance optimization
storiesSchema.index({ userId: 1 }); // User's stories
storiesSchema.index({ hashtagId: 1 }); // Hashtag stories
storiesSchema.index({ storyFrom: 1 }); // Filter by source type
storiesSchema.index({ isActive: 1 }); // Active stories
storiesSchema.index({ isHighlight: 1 }); // Highlight stories
storiesSchema.index({ audience: 1 }); // Audience filter
storiesSchema.index({ collectionId: 1 }); // Stories by collection
storiesSchema.index({ highlightCollectionId: 1 }); // Stories by highlight collection
storiesSchema.index({ userId: 1, isActive: 1, createdAt: -1 }); // User's active stories sorted
storiesSchema.index({ hashtagId: 1, isActive: 1, createdAt: -1 }); // Hashtag active stories sorted
storiesSchema.index({ userId: 1, isActive: 1, expiresAt: -1 }); // Fast expiry checks per user
storiesSchema.index({ createdAt: -1 }); // Sort by creation date
storiesSchema.index({ userId: 1, isHighlight: 1 }); // User's highlight stories

const stories = mongoose.model('stories', storiesSchema);

module.exports = stories;
