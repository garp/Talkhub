const mongoose = require('mongoose');

const commentLikeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true,
  },
  commentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'comments',
    required: true,
  },
}, {
  timestamps: true,
});

const commentSchema = new mongoose.Schema({
  commentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  media: [{
    url: {
      type: String,
      required: true,
    },
    mediaType: {
      type: String,
      enum: ['image', 'video'],
      required: true,
    },
  }],
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'posts',
    required: true,
  },
  parentCommentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'comments',
    default: null,
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
    default: null,
  },
}, {
  timestamps: true,
});

// Indexes for comment-likes
commentLikeSchema.index({ userId: 1 }); // User's likes
commentLikeSchema.index({ commentId: 1 }); // Likes on a comment
commentLikeSchema.index({ commentId: 1, userId: 1 }, { unique: true }); // Prevent duplicate likes

// Indexes for comments
commentSchema.index({ commentBy: 1 }); // User's comments
commentSchema.index({ postId: 1 }); // Comments on a post
commentSchema.index({ parentCommentId: 1 }); // Replies to a comment
commentSchema.index({ postId: 1, createdAt: -1 }); // Post comments sorted by date
commentSchema.index({ postId: 1, parentCommentId: 1, createdAt: -1 }); // Threaded comments
commentSchema.index({ commentBy: 1, createdAt: -1 }); // User's comments sorted
commentSchema.index({ content: 'text' }); // Text search on comment content

const Comment = mongoose.model('comments', commentSchema);
const CommentLike = mongoose.model('comment-likes', commentLikeSchema);

module.exports = { Comment, CommentLike };
