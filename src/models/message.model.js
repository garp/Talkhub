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

const messageSchema = new mongoose.Schema(
  {
    chatroomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'chatrooms',
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    content: {
      type: String,
    },
    messageType: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'location', 'file', 'poll'],
      default: 'text',
      index: true,
    },
    location: {
      type: LocationSchema,
      default: null,
    },
    poll: {
      type: PollSchema,
      default: null,
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
    isAudio: {
      type: Boolean,
      default: false,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
    },
    subHashtagId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'subchathashtags',
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
  },
  {
    timestamps: true,
  },
);

// Custom validation to ensure that both `content` and `media` are empty when `isDeleted` is true
messageSchema.pre('validate', function checkContentAndMedia(next) {
  if (this.isDeleted) {
    if (this.content || this.media) {
      next(new Error('When the message is deleted, both content and media should be empty.'));
    }
    if (!this.deletedBy) {
      next(new Error('DeletedBy must be specified when a message is deleted.'));
    }
  } else {
    next();
  }
});

// Custom validation to ensure at least one of `content` or `media` is present
// if `isDeleted` is false
messageSchema.pre('validate', function checkContentOrMedia(next) {
  if (!this.isDeleted && !this.content && !this.media) {
    next(new Error('Either content or media is required when the message is not deleted.'));
  } else {
    next();
  }
});

// Indexes for performance optimization
messageSchema.index({ createdAt: -1 }); // Sort by creation date
messageSchema.index({ chatroomId: 1, createdAt: -1 }); // Chat history sorted by date
messageSchema.index({ chatroomId: 1, isDeleted: 1, createdAt: -1 }); // Non-deleted messages
messageSchema.index({ senderId: 1, createdAt: -1 }); // User's messages
messageSchema.index({ parentMessageId: 1 }); // Thread/reply lookups
messageSchema.index({ subHashtagId: 1, createdAt: -1 }); // Sub-hashtag messages
// Note: deletedFor already has index: true in field definition
messageSchema.index({ content: 'text' }); // Text search on message content

module.exports = mongoose.model('messages', messageSchema);
