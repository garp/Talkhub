const mongoose = require('mongoose');

const { Schema } = mongoose;

const pollVoteSchema = new Schema(
  {
    chatType: {
      type: String,
      enum: ['hashtag', 'private'],
      required: true,
      index: true,
    },
    messageId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    voterId: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    // For convenience / validation (not strictly required, but helpful for debugging and access checks)
    hashtagId: {
      type: Schema.Types.ObjectId, ref: 'hashtags', default: null, index: true,
    },
    chatroomId: { type: Schema.Types.ObjectId, default: null, index: true },
    selectedOptionIds: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true },
);

// Indexes for performance optimization
pollVoteSchema.index({ chatType: 1, messageId: 1, voterId: 1 }, { unique: true }); // One vote per user per poll
pollVoteSchema.index({ messageId: 1, createdAt: -1 }); // Poll votes sorted by date
pollVoteSchema.index({ voterId: 1, createdAt: -1 }); // User's votes sorted

module.exports = mongoose.model('poll-votes', pollVoteSchema);
