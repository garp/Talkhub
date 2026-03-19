const mongoose = require('mongoose');
const { deletedBy } = require('../../lib/constants/messageConstants');

const LocationSchema = new mongoose.Schema({
  latitude: { type: Number, min: -90, max: 90 },
  longitude: { type: Number, min: -180, max: 180 },
  address: { type: String, trim: true, maxlength: 500 },
}, { _id: false });

const PollOptionSchema = new mongoose.Schema({
  optionId: { type: String, required: true, trim: true },
  text: {
    type: String, required: true, trim: true, maxlength: 100,
  },
  voteCount: { type: Number, default: 0, min: 0 },
}, { _id: false });

const PollSchema = new mongoose.Schema({
  question: {
    type: String, required: true, trim: true, maxlength: 300,
  },
  options: {
    type: [PollOptionSchema],
    validate: [
      (arr) => Array.isArray(arr) && arr.length >= 2 && arr.length <= 12,
      'Poll must have between 2 and 12 options',
    ],
  },
  allowsMultipleAnswers: { type: Boolean, default: false },
  expiresAt: { type: Date, default: null, index: true },
  isAnonymous: { type: Boolean, default: false },
  // Quiz mode: one correct option (server stores correctOptionId but does not expose it in public payloads)
  isQuiz: { type: Boolean, default: false },
  correctOptionId: { type: String, default: null },
  totalVotes: { type: Number, default: 0, min: 0 },
}, { _id: false });

const ReactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  emoji: { type: String, required: true }, // E.g., 👍, ❤️
}, { _id: false });

const ReadBySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true,
  },
  readAt: {
    type: Date,
    default: Date.now,
  },
}, { _id: false });

const DeliveredToSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true,
  },
  deliveredAt: {
    type: Date,
    default: Date.now,
  },
}, { _id: false });

const privateMessageSchema = new mongoose.Schema(
  {
    chatroomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'privateChatrooms',
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    sentWhileBlocked: {
      type: Boolean,
    },
    content: {
      type: String,
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'location', 'file', 'poll', 'sharedcontent', 'system'],
      default: 'text',
      index: true,
    },
    // System messages: member_left, member_removed (show in message history as notice). One message per action.
    systemEvent: {
      type: {
        type: String,
        enum: ['member_left', 'member_removed'],
      },
      actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
      targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'users', default: null },
      targetUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'users' }], // for member_removed (multiple)
    },
    location: {
      type: LocationSchema,
      default: null,
    },
    poll: {
      type: PollSchema,
      default: null,
    },
    // Shared content: Instagram-style shared hashtag/post/story cards in DMs
    sharedContent: {
      type: {
        type: String,
        enum: ['hashtag', 'post', 'topic', 'user', 'story'],
      },
      id: { type: String },
      hashtagId: { type: String },
      postId: { type: String },
      topicId: { type: String },
      categoryId: { type: String },
      userId: { type: String },
      // Story-specific fields
      storyId: { type: String },
      mediaUrl: { type: String },
      mediaType: { type: String, enum: ['image', 'video', null] },
      thumbnailUrl: { type: String },
      // Common fields
      name: { type: String },
      userName: { type: String },
      description: { type: String },
      profilePicture: { type: String },
      bannerImage: { type: String },
      createdBy: { type: mongoose.Schema.Types.Mixed, default: null },
      memberCount: { type: Number },
      followersCount: { type: Number },
      followingCount: { type: Number },
      likeCount: { type: Number },
      scope: { type: String },
      fullLocation: { type: String },
    },
    media: {
      type: String,
    },
    // Optional: links media to a central mediaAssets doc (moderate once, reuse everywhere).
    mediaAssetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'mediaAssets',
      index: true,
      default: null,
    },
    // Denormalized moderation summary for convenience in queries/responses.
    mediaModeration: {
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
    reactions: [ReactionSchema],
    parentMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'messages',
    },
    parentMessageSenderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
    },
    parentMessageContent: {
      type: String,
    },
    parentMessageMedia: {
      type: String,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      required: true,
    },
    deletedBy: {
      type: String,
      enum: [deletedBy.AUTHOR, deletedBy.ADMIN, deletedBy.MODERATOR, deletedBy.GOD],
    },
    deletedAt: {
      type: Date,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent',
      index: true,
    },
    readBy: [ReadBySchema],
    deliveredTo: [DeliveredToSchema],
    isForwarded: {
      type: Boolean,
      default: false,
      index: true,
    },
    isMultipleTimesForwarded: {
      type: Boolean,
      default: false,
      index: true,
    },
    // WhatsApp-style "delete for me": userIds who hid this message from their own view.
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        index: true,
      },
    ],
    // Instagram-style story reply: this message is linked to a story (with a denormalized preview snapshot).
    storyReply: {
      storyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'stories',
        index: true,
        default: null,
      },
      storyOwnerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        index: true,
        default: null,
      },
      storyUrl: { type: String, default: null },
      thumbnailUrl: { type: String, default: null },
      storyType: {
        type: String,
        enum: ['image', 'video'],
        default: null,
      },
    },
  },
  {
    timestamps: true,
  },
);

// When message is deleted-for-everyone, enforce tombstone fields consistency.
privateMessageSchema.pre('validate', function checkDeletedFields(next) {
  if (this.isDeleted) {
    if (this.content || this.media) {
      next(new Error('When the message is deleted, both content and media should be empty.'));
      return;
    }
    if (!this.deletedBy) {
      next(new Error('DeletedBy must be specified when a message is deleted.'));
      return;
    }
  }
  next();
});

// Custom validation to ensure at least one of `content` or `media` is present
// Skip for sharedcontent and system messages
privateMessageSchema.pre('validate', function checkContentOrMedia(next) {
  if (this.messageType === 'sharedcontent') {
    return next();
  }
  if (this.messageType === 'system') {
    return next();
  }
  if (!this.isDeleted && !this.content && !this.media) {
    next(new Error('Either content or media is required'));
  } else {
    next();
  }
});

// Indexes for performance optimization
privateMessageSchema.index({ createdAt: -1 }); // Sort by creation date
privateMessageSchema.index({ chatroomId: 1, createdAt: -1 }); // Chat history sorted by date
privateMessageSchema.index({ chatroomId: 1, isDeleted: 1, createdAt: -1 }); // Non-deleted messages
privateMessageSchema.index({ senderId: 1, createdAt: -1 }); // User's messages
privateMessageSchema.index({ parentMessageId: 1 }); // Thread/reply lookups
// Note: deletedFor and storyReply.storyId already have index: true in field definitions
privateMessageSchema.index({ content: 'text' }); // Text search on message content

module.exports = mongoose.model('privateMessages', privateMessageSchema);
