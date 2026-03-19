const mongoose = require('mongoose');

const { Schema } = mongoose;

const interestCategorySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    description: {
      type: String,
      trim: true,
      default: null,
    },
    icon: {
      type: String,
      trim: true,
      default: null,
    },
    backgroundImage: {
      type: String,
      trim: true,
      default: null,
    },
    order: {
      type: Number,
      default: 0,
      index: true,
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
interestCategorySchema.index({ isActive: 1, order: 1 }); // Active categories sorted by order
interestCategorySchema.index({ name: 'text', description: 'text' }); // Text search

module.exports = mongoose.model('interestCategories', interestCategorySchema);
