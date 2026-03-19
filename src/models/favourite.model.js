const mongoose = require('mongoose');

const favouriteTypes = ['people', 'hashtag', 'cafe', 'restaurant', 'hotel', 'museum', 'hospital'];

const favouriteSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    // Place/item identifier (Google Place ID for places, or internal ID for people/hashtags)
    placeId: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: favouriteTypes,
      required: true,
      index: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    location: {
      latitude: {
        type: Number,
        default: null,
      },
      longitude: {
        type: Number,
        default: null,
      },
    },
    rating: {
      type: Number,
      default: null,
    },
    userRatingCount: {
      type: Number,
      default: 0,
    },
    photos: {
      type: [String],
      default: [],
    },
    distance: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true },
);

// Indexes for performance optimization
favouriteSchema.index({ userId: 1, placeId: 1 }, { unique: true }); // Unique favourite per user per place
favouriteSchema.index({ userId: 1, type: 1 }); // User's favourites by type
favouriteSchema.index({ userId: 1, createdAt: -1 }); // User's favourites sorted by date
favouriteSchema.index({ placeId: 1 }); // Favourites by place

module.exports = mongoose.model('favourites', favouriteSchema);
