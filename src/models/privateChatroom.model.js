const mongoose = require('mongoose');

const ParticipantSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
    },
    // WhatsApp-like group exit:
    // - isPresent=false means user exited but can still see past messages (and can still see the group in list unless deletedForMe=true)
    isPresent: {
      type: Boolean,
      default: true,
    },
    exitedAt: {
      type: Date,
      default: null,
    },
    // "Exit group and delete it for me" (hide from list for this user)
    deletedForMe: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    // Per-user "clear chat" marker: hide private messages created at/before this time for this user in this chatroom.
    clearedAt: {
      type: Date,
      default: null,
    },
    // Per-user "pin chat" marker: pinned chats should appear at top for this user.
    pinnedAt: {
      type: Date,
      default: null,
    },
    // Per-user notification mute state for this private chatroom.
    notificationMutedAt: {
      type: Date,
      default: null,
    },
    notificationMutedUntil: {
      type: Date,
      default: null,
    },
    notificationMutePermanent: {
      type: Boolean,
      default: false,
    },
    notificationMuteDuration: {
      // '8_hours' | '1_day' | 'always'
      type: String,
      default: null,
    },
  },
  { _id: false },
  {
    timestamps: true,
  },
);

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

const privateChatRoomSchema = new mongoose.Schema(
  {
    isGroupChat: {
      type: Boolean,
      required: true,
    },
    name: {
      type: String,
      index: true,
    },
    description: {
      type: String,
      default: null,
    },
    groupPicture: {
      type: String,
      default: null,
    },
    participants: {
      type: [ParticipantSchema],
    },
    admins: {
      type: [AdminSchema],
    },
    moderators: {
      type: [ModeratorSchema],
    },
    // Track ex members who exited or were removed from this private chatroom (audit + keyboard restriction)
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
        reason: {
          type: String,
          enum: ['left', 'removed'],
          default: 'left',
        },
        removedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'users',
          default: null,
        },
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    // Deterministic key for group chats: sorted participant userIds joined, used for unique index to prevent duplicate groups (race-safe).
    participantSetKey: {
      type: String,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Validation for group chat admin
privateChatRoomSchema.pre('validate', function validateAdminForGroupChat(next) {
  if (this.isGroupChat && (!this.admins || this.admins.length === 0)) {
    next(new Error('At least one admin is required for group chats'));
    return;
  }
  next();
});

// Indexes for performance optimization
privateChatRoomSchema.index({ isGroupChat: 1 }); // Filter by group/1:1
privateChatRoomSchema.index({ createdAt: -1 }); // Sort by creation date
privateChatRoomSchema.index({ createdBy: 1 }); // Chatrooms created by user
privateChatRoomSchema.index({ 'participants.userId': 1 }); // Find chatrooms by participant
privateChatRoomSchema.index({ 'participants.userId': 1, 'participants.isPresent': 1 }); // Active participants
privateChatRoomSchema.index({ 'participants.userId': 1, 'participants.deletedForMe': 1 }); // Visible chatrooms
privateChatRoomSchema.index({ 'participants.userId': 1, 'participants.pinnedAt': 1 }); // Pinned chats
privateChatRoomSchema.index({ 'admins.userId': 1 }); // Find by admin
privateChatRoomSchema.index({ 'moderators.userId': 1 }); // Find by moderator
privateChatRoomSchema.index({ 'exParticipants.userId': 1 }); // Find ex-participants
privateChatRoomSchema.index({ updatedAt: -1 }); // Sort by last activity
// Index for querying by participant set (non-unique: multiple groups allowed with same participants, different names)
privateChatRoomSchema.index({ participantSetKey: 1 }, { sparse: true });

module.exports = mongoose.model('privateChatrooms', privateChatRoomSchema);
