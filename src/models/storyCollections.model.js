const mongoose = require('mongoose');

const storyCollectionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
}, { timestamps: true });

// Indexes for performance optimization
storyCollectionSchema.index({ name: 1 }); // Lookup by name
storyCollectionSchema.index({ createdAt: -1 }); // Sort by creation date

const storyCollection = mongoose.model('storycollections', storyCollectionSchema);

module.exports = storyCollection;
