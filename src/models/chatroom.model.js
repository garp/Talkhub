const mongoose = require('mongoose');

const ModeratorSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
    },
  },
  { _id: false },
  {
    timestamps: true,
  },
);

const AdminSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
    },
  },
  { _id: false },
);

const chatRoomSchema = new mongoose.Schema(
  {
    hashtagId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'hashtags',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    parentChatroomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'chatrooms',
      default: null, // If null, this chatroom is for a parent hashtag
      index: true,
    },
    admins: {
      type: [AdminSchema],
    },
    moderators: {
      type: [ModeratorSchema],
    },
    // Track ex members who exited this hashtag chatroom
    exParticipants: [
      {
        _id: false,
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'users',
          required: true,
        },
        exitedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Indexes for performance optimization
chatRoomSchema.index({ createdAt: -1 }); // Sort by creation date
chatRoomSchema.index({ hashtagId: 1, parentChatroomId: 1 }); // Hashtag chatrooms
chatRoomSchema.index({ 'admins.userId': 1 }); // Find chatrooms by admin
chatRoomSchema.index({ 'moderators.userId': 1 }); // Find chatrooms by moderator
chatRoomSchema.index({ 'exParticipants.userId': 1 }); // Find ex-participants

module.exports = mongoose.model('chatrooms', chatRoomSchema);
