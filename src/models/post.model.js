const mongoose = require('mongoose');

const { Schema } = mongoose;

const postSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    location: {
      type: String,
      default: null,
    },
    text: {
      type: String,
      default: null,
    },
    media: [{
      url: String,
      thumbnailUrl: {
        type: String,
        default: null,
      },
      mediaType: {
        type: String,
        enum: ['image', 'video'],
      },
      // Optional: links to a central mediaAssets doc (moderate once, reuse everywhere).
      assetId: {
        type: Schema.Types.ObjectId,
        ref: 'mediaAssets',
        index: true,
        default: null,
      },
      // Denormalized moderation summary for this media item.
      moderation: {
        status: {
          type: String,
          enum: ['pending', 'processing', 'approved', 'rejected', 'needs_review', 'error', 'skipped', 'unknown'],
          default: 'unknown',
          index: true,
        },
        isBanned: { type: Boolean, default: false, index: true },
        primaryReason: {
          label: { type: String, default: null },
          parentLabel: { type: String, default: null },
          confidence: { type: Number, default: null },
          threshold: { type: Number, default: null },
        },
        reasons: [{
          label: { type: String, required: true },
          parentLabel: { type: String, default: null },
          confidence: { type: Number, default: null },
          threshold: { type: Number, default: null },
        }],
        checkedAt: { type: Date, default: null },
        provider: { type: String, default: null },
      },
    }],
    // Optional overall summary for the post (if any media is banned/pending/etc).
    mediaModeration: {
      status: {
        type: String,
        enum: ['pending', 'processing', 'approved', 'rejected', 'needs_review', 'error', 'skipped', 'unknown'],
        default: 'unknown',
        index: true,
      },
      isBanned: { type: Boolean, default: false, index: true },
      checkedAt: { type: Date, default: null },
    },
    labels: [{
      type: String,
    }],
    interestCategories: [
      {
        type: Schema.Types.ObjectId,
        ref: 'interestCategories',
      },
    ],
    interestSubCategories: [
      {
        type: Schema.Types.ObjectId,
        ref: 'interestSubCategories',
      },
    ],
    replySettings: {
      type: String,
      enum: ['everyone', 'nobody'],
    },
    extraReplySetting: {
      type: String,
      default: null,
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    parentPostId: {
      type: Schema.Types.ObjectId,
      ref: 'posts',
      default: null, // If null, this is an original post (not a reply)
      index: true,
    },
    // Users mentioned in the post text via @username
    mentions: [{
      type: Schema.Types.ObjectId,
      ref: 'users',
      index: true,
    }],
  },
  {
    timestamps: true,
  },
);

// Indexes for performance optimization
postSchema.index({ createdAt: -1 }); // Sort by creation date (feed queries)
postSchema.index({ userId: 1, createdAt: -1 }); // User's posts sorted by date
postSchema.index({ interestCategories: 1 }); // Filter by interest categories
postSchema.index({ interestSubCategories: 1 }); // Filter by interest subcategories
postSchema.index({ parentPostId: 1, createdAt: -1 }); // Replies sorted by date
postSchema.index({ 'mediaModeration.status': 1, 'mediaModeration.isBanned': 1 }); // Moderation filtering
postSchema.index({ text: 'text' }); // Text search on post content

module.exports = mongoose.model('posts', postSchema);
