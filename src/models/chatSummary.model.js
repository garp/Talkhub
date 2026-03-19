const mongoose = require('mongoose');

const { Schema } = mongoose;

const chatSummarySchema = new Schema(
  {
    chatroomType: {
      type: String,
      enum: ['hashtag', 'private'],
      required: true,
      index: true,
    },
    chatroomId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    // YYYY-MM-DD (UTC) key for "daily" summaries
    dateKey: {
      type: String,
      required: true,
      index: true,
    },
    summary: {
      type: String,
      required: true,
    },
    meta: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true },
);

// Indexes for performance optimization
chatSummarySchema.index({ chatroomType: 1, chatroomId: 1, dateKey: 1 }, { unique: true }); // One summary per chatroom per day
chatSummarySchema.index({ chatroomId: 1, createdAt: -1 }); // Chatroom summaries sorted

module.exports = mongoose.model('chatSummaries', chatSummarySchema);
