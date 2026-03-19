const mongoose = require('mongoose');

const { Schema } = mongoose;

const hashtagRoleSchema = new Schema(
  {
    hashtagId: {
      type: Schema.Types.ObjectId,
      ref: 'hashtags',
      default: null,
      index: true,
    },
    key: {
      type: String,
      trim: true,
      required: true,
      index: true,
    },
    name: {
      type: String,
      trim: true,
      required: true,
    },
    level: {
      type: Number,
      required: true,
      index: true,
    },
    scope: {
      type: String,
      trim: true,
      enum: ['global', 'hashtag'],
      required: true,
      index: true,
    },
    inherits: {
      type: [String],
      default: [],
    },
    details: {
      type: [String],
      default: [],
    },
    permissions: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for performance optimization
hashtagRoleSchema.index({ hashtagId: 1, key: 1 }, { unique: true }); // One role key per hashtag
hashtagRoleSchema.index({ scope: 1, isActive: 1 }); // Active roles by scope
// Note: level already has index: true in field definition

module.exports = mongoose.model('hashtag-roles', hashtagRoleSchema);
