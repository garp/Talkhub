const mongoose = require('mongoose');

const { Schema } = mongoose;

const welcomePageSchema = new Schema(
  {
    hashtagId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    language: {
      type: String,
      required: true,
      trim: true,
      default: 'English',
    },
    rules: {
      type: [String],
      default: [],
    },
    ageRange: {
      type: String,
      enum: ['All', '7+', '12+', '16+', '18+'],
      default: 'All',
    },
    fullLocation: { type: String, trim: true },
    location: {
      type: { type: String, default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
  },
  {
    timestamps: true,
  },
);
// Indexes for performance optimization
welcomePageSchema.index({ hashtagId: 1 }, { unique: true }); // One welcome page per hashtag
welcomePageSchema.index({ location: '2dsphere' }); // Geospatial queries
welcomePageSchema.index({ ageRange: 1 }); // Filter by age range

module.exports = mongoose.model('welcomePage', welcomePageSchema);
