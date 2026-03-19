const mongoose = require('mongoose');

const highlightCollectionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  coverUrl: {
    type: String,
    default: '',
  },
  coverStoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'stories',
  },
}, { timestamps: true });

// Indexes for performance optimization
highlightCollectionSchema.index({ userId: 1, createdAt: -1 }); // User's highlight collections sorted
highlightCollectionSchema.index({ name: 'text' }); // Text search on collection name
highlightCollectionSchema.index({ coverStoryId: 1 }); // Lookup by cover story

const HighlightCollection = mongoose.model('highlightcollections', highlightCollectionSchema);

module.exports = HighlightCollection;
