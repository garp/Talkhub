const mongoose = require('mongoose');

const listSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    participantIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'users',
        },
      ],
      required: true,
      validate: {
        validator(v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: 'At least one participant ID is required',
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
    },
    chatroomIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'privateChatrooms',
    }],
  },
  {
    timestamps: true,
  },
);

// Indexes for performance optimization
listSchema.index({ createdBy: 1 }); // Lists by creator
listSchema.index({ createdBy: 1, createdAt: -1 }); // Creator's lists sorted by date
listSchema.index({ participantIds: 1 }); // Find lists containing a user
listSchema.index({ chatroomIds: 1 }); // Find lists containing a chatroom
listSchema.index({ name: 'text' }); // Text search on list name

module.exports = mongoose.model('lists', listSchema);
