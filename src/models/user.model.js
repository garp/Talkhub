const mongoose = require('mongoose');

const { Schema } = mongoose;
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../../lib/configs/env.config');
const { userStatus, userRoles, onboardingStep } = require('../../lib/constants/userConstants');

const userSchema = new Schema(
  {
    sequenceNumber: { type: Number, unique: true, index: true },
    trackingCode: { type: String, trim: true },
    fullName: { type: String, trim: true },
    userName: {
      type: String, trim: true, unique: true, sparse: true,
    },
    email: {
      type: String, trim: true, unique: true, sparse: true,
    },
    password: { type: String, trim: true, select: false },
    dateOfBirth: { type: Date },
    phoneNumber: {
      type: String, trim: true, unique: true, sparse: true,
    },
    countryCode: { type: String, trim: true },
    fullLocation: { type: String, trim: true },
    location: {
      type: { type: String, default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    profilePicture: { type: String, trim: true },
    bannerPicture: { type: String, trim: true },
    description: { type: String, trim: true },
    status: {
      type: String,
      trim: true,
      enum: [userStatus.CREATED, userStatus.INFO_ADDED, userStatus.VERIFIED],
      default: userStatus.CREATED,
    },
    mode: {
      type: String,
      trim: true,
      enum: ['email', 'google', 'phone', 'apple'],
      default: null,
    },
    appleUserId: {
      type: String,
      trim: true,
      default: null,
    },
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    followers: {
      type: Number,
      default: 0,
    },
    following: {
      type: Number,
      default: 0,
    },
    // Account privacy (Instagram-like)
    isPrivateAccount: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Story settings (Instagram-like)
    closeFriends: [
      {
        type: Schema.Types.ObjectId,
        ref: 'users',
      },
    ],
    storyHiddenFrom: [
      {
        type: Schema.Types.ObjectId,
        ref: 'users',
      },
    ],
    url: {
      type: String,
      default: null,
    },
    languages: {
      type: [String],
      default: [],
    },
    occupation: {
      type: String,
      default: null,
    },
    education: {
      type: String,
      default: null,
    },
    religion: {
      type: String,
      default: null,
      trim: true,
    },
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
    onboarding: {
      type: Boolean,
      default: false,
    },
    lastOnboardingStep: {
      type: String,
      enum: Object.values(onboardingStep),
      default: null,
    },
    role: {
      type: String,
      trim: true,
      enum: [userRoles.GOD, userRoles.USER],
      default: 'user',
      required: true,
    },
    blockedUsers: [
      {
        _id: false,
        userId: {
          type: Schema.Types.ObjectId,
          ref: 'users',
          required: true,
        },
      },
    ],
    mutedUsers: [
      {
        _id: false,
        userId: {
          type: Schema.Types.ObjectId,
          ref: 'users',
          required: true,
        },
        mutedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    storyMutedUsers: [
      {
        _id: false,
        userId: {
          type: Schema.Types.ObjectId,
          ref: 'users',
          required: true,
        },
        mutedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    storyNotifyUsers: [
      {
        _id: false,
        userId: {
          type: Schema.Types.ObjectId,
          ref: 'users',
          required: true,
        },
        enabledAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    mutedHashtags: [
      {
        _id: false,
        hashtagId: {
          type: Schema.Types.ObjectId,
          ref: 'hashtags',
          required: true,
        },
        mutedAt: {
          type: Date,
          default: Date.now,
        },
        mutedUntil: {
          type: Date,
          default: null,
        },
        isPermanent: {
          type: Boolean,
          default: false,
        },
        duration: {
          // '8_hours' | '1_day' | 'always'
          type: String,
          default: null,
        },
      },
    ],
    // Interest categories the user does NOT want to see (preference list)
    notInterestedInterestCategories: [
      {
        type: Schema.Types.ObjectId,
        ref: 'interestCategories',
      },
    ],
    fcmToken: {
      type: String,
      trim: true,
      default: null,
      nullable: true,
    },
    onlineStatus: {
      type: Boolean,
      default: false,
    },
    lastActive: {
      type: Date,
      default: null,
    },
    // Token version for invalidating all tokens (incremented on force logout)
    tokenVersion: {
      type: Number,
      default: 0,
    },
    deleteInfo: {
      status: {
        type: String,
        enum: ['none', 'temporary'],
        default: 'none',
      },
      reason: {
        type: String,
        trim: true,
        default: null,
      },
      requestedAt: {
        type: Date,
        default: null,
      },
      restoredAt: {
        type: Date,
        default: null,
      },
    },
    rulesAcceptedAt: { type: Date, default: null },

    // Referral system fields
    referralCode: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
      uppercase: true,
      maxlength: 6,
      minlength: 6,
      match: /^[0-9A-Z]{6}$/,
    },
    inviteCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 6,
      minlength: 6,
      match: /^[0-9A-Z]{6}$/,
      default: null,
    },
    // Referral settings for expiration and usage limits
    referralSettings: {
      expireAfter: {
        type: String,
        enum: ['never', '12h', '1d', '7d'],
        default: 'never',
      },
      maxUses: {
        type: Number,
        default: null, // null = unlimited
        min: 1,
      },
      createdAt: {
        type: Date,
        default: null, // When the code was generated/reset
      },
      expiresAt: {
        type: Date,
        default: null, // Calculated: createdAt + expireAfter (null if "never")
      },
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for performance optimization
userSchema.index({ location: '2dsphere' }); // Geospatial queries
userSchema.index({ createdAt: -1 }); // Sort by creation date
userSchema.index({ active: 1, status: 1 }); // Filter active users by status
userSchema.index({ fullName: 'text', userName: 'text' }); // Text search on names
userSchema.index({ 'blockedUsers.userId': 1 }); // Query blocked users
userSchema.index({ 'mutedUsers.userId': 1 }); // Query muted users
userSchema.index({ 'storyMutedUsers.userId': 1 }); // Query story-muted users
userSchema.index({ 'storyNotifyUsers.userId': 1 }); // Query story-notify users
userSchema.index({ interestCategories: 1 }); // Filter by interest categories
userSchema.index({ interestSubCategories: 1 }); // Filter by interest subcategories
userSchema.index({ inviteCode: 1 }); // Lookup by invite code

userSchema.pre('save', async function saveMiddleware(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, Number(env.SALT_ROUNDS));
  }
  if (this.isNew) {
    // Find the highest existing sequence number and add 1
    // This avoids collisions when users are deleted
    const lastUser = await mongoose.model('users')
      .findOne({}, { sequenceNumber: 1 })
      .sort({ sequenceNumber: -1 });
    this.sequenceNumber = (lastUser?.sequenceNumber || 0) + 1;
  }
  // Ensure at least one of email or phoneNumber is provided
  if (!this.email && !this.phoneNumber) {
    return next(new Error('Either email or phoneNumber must be provided'));
  }

  next();
});

userSchema.methods.generateAccessToken = function generateAccessToken() {
  const { _id: userId, tokenVersion = 0 } = this;
  return jwt.sign(
    {
      userId,
      tokenVersion,
    },
    env.ACCESS_TOKEN_SECRET,
    {},
  );
};

module.exports = mongoose.model('users', userSchema);
