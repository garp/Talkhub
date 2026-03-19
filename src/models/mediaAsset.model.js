const mongoose = require('mongoose');

const { Schema } = mongoose;

// Stores 1:1 mapping for an uploaded S3 object and its moderation results.
// This lets you moderate once and reuse the result across posts/messages/stories/etc.
const mediaAssetSchema = new Schema(
  {
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      index: true,
      default: null,
    },

    bucket: { type: String, required: true, index: true },
    key: { type: String, required: true, index: true },
    etag: { type: String, default: null },
    url: { type: String, default: null },

    mediaType: {
      type: String,
      enum: ['image', 'video', 'audio', 'other'],
      required: true,
      index: true,
    },
    contentType: { type: String, default: null },
    size: { type: Number, default: null },

    moderation: {
      provider: { type: String, default: 'rekognition' },
      status: {
        type: String,
        enum: ['pending', 'processing', 'approved', 'rejected', 'needs_review', 'error', 'skipped'],
        default: 'pending',
        index: true,
      },
      checkedAt: { type: Date, default: null },
      requestId: { type: String, default: null },

      // Video-specific
      jobId: { type: String, default: null, index: true },

      // Raw-ish labels (normalized for storage).
      labels: [{
        name: { type: String, required: true },
        parentName: { type: String, default: null },
        confidence: { type: Number, default: null },
        // For videos we may store max timestamp seen for the label (optional)
        timestampMs: { type: Number, default: null },
      }],

      ban: {
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
        policyVersion: { type: String, default: 'v1' },
      },

      error: {
        message: { type: String, default: null },
        code: { type: String, default: null },
      },
    },
  },
  { timestamps: true },
);

// Indexes for performance optimization
mediaAssetSchema.index({ bucket: 1, key: 1 }, { unique: true }); // Idempotency: one mediaAsset per S3 object
mediaAssetSchema.index({ ownerUserId: 1, createdAt: -1 }); // User's media assets sorted
mediaAssetSchema.index({ 'moderation.status': 1, 'moderation.ban.isBanned': 1 }); // Moderation filtering
mediaAssetSchema.index({ createdAt: -1 }); // Sort by creation date

module.exports = mongoose.model('mediaAssets', mediaAssetSchema);
