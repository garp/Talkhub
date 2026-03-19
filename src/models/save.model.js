const mongoose = require('mongoose');

const saveSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'posts' },
    hashtagId: { type: mongoose.Schema.Types.ObjectId, ref: 'hashtags' },
  },
  { timestamps: true },
);

// Indexes for performance optimization
saveSchema.index({ userId: 1 }); // User's saved items
saveSchema.index({ postId: 1 }); // Saves on a post
saveSchema.index({ hashtagId: 1 }); // Saves on a hashtag
saveSchema.index({ userId: 1, postId: 1 }, { unique: true, sparse: true }); // Unique post saves per user
saveSchema.index({ userId: 1, hashtagId: 1 }, { unique: true, sparse: true }); // Unique hashtag saves per user
saveSchema.index({ userId: 1, createdAt: -1 }); // User's saves sorted by date

// Ensure at least one of postId or hashtagId is present
saveSchema.pre('save', function validateSave(next) {
  if (!this.postId && !this.hashtagId) {
    next(new Error('Either postId or hashtagId must be provided'));
  } else {
    next();
  }
});

module.exports = mongoose.model('Save', saveSchema);
