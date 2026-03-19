const mongoose = require('mongoose');
const crypto = require('crypto');

const validScreens = ['publicchat', 'privatechat', 'post', 'profile', 'topic', 'hashtag', 'referral', 'story', 'message'];

const shortlinkSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },
    data: {
      screen: {
        type: String,
        required: true,
        enum: validScreens,
        lowercase: true,
      },
      id: {
        type: String,
        required: true,
        trim: true,
      },
      type: {
        type: String,
        trim: true,
        default: null,
      },
      name: {
        type: String,
        trim: true,
        default: null,
      },
      extra: {
        type: Object,
        default: null,
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
    },
    clickCount: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

// Indexes for performance optimization
shortlinkSchema.index({ code: 1 }); // Fast lookup by code
shortlinkSchema.index({ createdBy: 1, createdAt: -1 }); // User's links sorted by date
shortlinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index for auto-deletion

/**
 * Generate unique 6-character code
 * @returns {Promise<string>} Unique code
 */
shortlinkSchema.statics.generateUniqueCode = async function generateCode() {
  let code;
  let exists = true;
  let attempts = 0;

  while (exists && attempts < 10) {
    code = crypto.randomBytes(4).toString('base64url').substring(0, 6);
    // eslint-disable-next-line no-await-in-loop
    exists = await this.findOne({ code });
    attempts += 1;
  }

  if (exists) {
    throw new Error('Failed to generate unique code after 10 attempts');
  }

  return code;
};

// Export valid screens for use in validators
module.exports = mongoose.model('shortlinks', shortlinkSchema);
module.exports.validScreens = validScreens;
