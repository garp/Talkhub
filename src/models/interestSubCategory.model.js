const mongoose = require('mongoose');

const { Schema } = mongoose;

const interestSubCategorySchema = new Schema(
  {
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'interestCategories',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      unique: true,
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
    aliases: {
      type: [String],
      default: [],
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
  },
  {
    timestamps: true,
  },
);

// Indexes for performance optimization
interestSubCategorySchema.index({ categoryId: 1, name: 1 }, { unique: true }); // Unique subcategory name per category
interestSubCategorySchema.index({ categoryId: 1, isActive: 1, order: 1 }); // Active subcategories in category sorted
interestSubCategorySchema.index({ name: 'text', aliases: 'text' }); // Text search on name and aliases

module.exports = mongoose.model('interestSubCategories', interestSubCategorySchema);
