const mongoose = require('mongoose');

const { Schema } = mongoose;

const participantSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    chatroomId: {
      type: Schema.Types.ObjectId,
      ref: 'chatrooms',
      required: true,
      index: true,
    },
    // Per-user "clear chat" marker: hide messages created at/before this time for this user+chatroom.
    clearedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for performance optimization
participantSchema.index({ userId: 1, chatroomId: 1 }, { unique: true }); // Unique participant per chatroom
participantSchema.index({ createdAt: -1 }); // Sort by join date
participantSchema.index({ chatroomId: 1, createdAt: -1 }); // Chatroom participants sorted

module.exports = mongoose.model('participants', participantSchema);
