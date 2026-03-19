const mongoose = require('mongoose');

const { Schema } = mongoose;

const userMediaSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    mediaUrl: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for performance optimization
userMediaSchema.index({ userId: 1, createdAt: -1 }); // User's media sorted by date
userMediaSchema.index({ createdAt: -1 }); // Sort by creation date

module.exports = mongoose.model('userMedia', userMediaSchema);
