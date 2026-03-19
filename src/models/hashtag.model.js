const mongoose = require('mongoose');
const { hashtagScope, hashtagAccess } = require('../../lib/constants/hashtagConstants');

const { Schema } = mongoose;

const hashtagSchema = new Schema(
  {
    creatorId: {
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true,
      index: true,
    },
    hashtagPicture: {
      type: String,
      trim: true,
    },
    scope: {
      type: String,
      enum: [hashtagScope.GLOBAL, hashtagScope.LOCAL],
      required: true,
    },
    fullLocation: { type: String, trim: true },
    location: {
      type: { type: String, default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      trim: true,
    },
    hashtagPhoto: { type: String, trim: true },
    hashtagBanner: { type: String, trim: true },
    access: {
      type: String,
      enum: [hashtagAccess.PUBLIC, hashtagAccess.PRIVATE, hashtagAccess.BROADCAST],
      // required: true,
    },
    parentHashtagId: {
      type: Schema.Types.ObjectId,
      ref: 'hashtags',
      default: null, // If null, this hashtag is a parent hashtag
      index: true,
    },
    likeCount: { // like through the dynamic post
      type: Number,
      default: 0,
    },
    viewCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for performance optimization
hashtagSchema.index({ location: '2dsphere' }); // Geospatial queries
hashtagSchema.index({ access: 1 }); // Filter by access type (public/private/broadcast)
hashtagSchema.index({ createdAt: -1 }); // Sort by creation date
hashtagSchema.index({ scope: 1, access: 1 }); // Filter by scope and access
hashtagSchema.index({ name: 'text', description: 'text' }); // Text search
hashtagSchema.index({ likeCount: -1 }); // Sort by popularity
hashtagSchema.index({ viewCount: -1 }); // Sort by views
hashtagSchema.index({ creatorId: 1, createdAt: -1 }); // Creator's hashtags sorted

module.exports = mongoose.model('hashtags', hashtagSchema);
