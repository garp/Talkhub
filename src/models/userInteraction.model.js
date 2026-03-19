const mongoose = require('mongoose');

const { Schema } = mongoose;

const userInteractionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, index: true },
  hashtagId: { type: Schema.Types.ObjectId, index: true },
  name: { type: String },
  lastHashtagClick: { type: Date, index: true },
});

// Indexes for performance optimization
userInteractionSchema.index({ userId: 1, hashtagId: 1 }, { unique: true }); // One interaction record per user-hashtag
userInteractionSchema.index({ userId: 1, lastHashtagClick: -1 }); // User's recent interactions
userInteractionSchema.index({ hashtagId: 1, lastHashtagClick: -1 }); // Hashtag interactions sorted

module.exports = mongoose.model('userInteraction', userInteractionSchema);
