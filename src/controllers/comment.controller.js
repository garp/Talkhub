const { ObjectId } = require('mongodb');
const commentService = require('../services/commentService');
const postService = require('../services/postServices');
const userServices = require('../services/userServices');
const notificationService = require('../services/notificationService');
const pushNotificationService = require('../services/pushNotificationService');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { responseHandler, errorResponse } = require('../../lib/helpers/responseHandler');
const { getCommentsQuery, getRepliesQuery } = require('../queries/post.queries');

exports.createComment = asyncHandler(async (req, res) => {
  const data = req.value;
  const { userId } = req.user;

  const post = await postService.findById({ id: data.postId });
  if (!post) {
    return errorResponse('Post not found', res);
  }

  const body = {
    commentBy: userId,
    content: data.content,
    postId: data.postId,
    media: data.media || [],
  };

  if (data.parentCommentId && data.replyTo) {
    const parentComment = await commentService.findById({ id: data.parentCommentId });
    if (!parentComment) {
      return errorResponse('Parent comment not found', res);
    }
    body.parentCommentId = data.parentCommentId;
    body.replyTo = data.replyTo;
  } else if (data.parentCommentId) {
    const parentComment = await commentService.findById({ id: data.parentCommentId });
    if (!parentComment) {
      return errorResponse('Parent comment not found', res);
    }
    body.parentCommentId = data.parentCommentId;
  } else {
    body.parentCommentId = null;
    body.replyTo = null;
  }

  const comment = await commentService.create({ body });

  // Notify post owner (non-blocking)
  Promise.resolve().then(async () => {
    try {
      const postOwnerId = post.userId && post.userId.toString ? post.userId.toString() : String(post.userId || '');
      if (!postOwnerId || postOwnerId === String(userId)) return;

      const [postOwner, actor] = await Promise.all([
        userServices.findById({ id: postOwnerId }),
        userServices.findById({ id: userId }),
      ]);
      if (!postOwner) return;

      const actorName = (actor && (actor.fullName || actor.userName)) || 'Someone';
      const preview = (data.content || '').length > 80 ? `${data.content.substring(0, 80)}...` : (data.content || '');
      const summary = `${actorName} commented on your post`;
      const firstMedia = post.media && post.media[0];
      const imageLink = firstMedia && firstMedia.url ? firstMedia.url : null;
      const thumbnailUrl = (firstMedia && (firstMedia.thumbnailUrl || firstMedia.url)) || null;

      await notificationService.create({
        body: {
          userId: postOwnerId,
          senderId: userId,
          category: 'updates',
          type: 'update',
          summary,
          meta: {
            kind: 'post_comment',
            postId: String(data.postId),
            commentId: comment && comment._id ? String(comment._id) : null,
            commentPreview: preview,
            commentedBy: String(userId),
            imageLink,
            thumbnailUrl,
          },
        },
      });

      if (postOwner.fcmToken) {
        await pushNotificationService.sendPrivateMessageNotification({
          fcmToken: postOwner.fcmToken,
          title: 'New comment',
          body: preview ? `${summary}: "${preview}"` : summary,
          type: 'comment',
          data: {
            postId: String(data.postId),
            userId: String(userId),
          },
        });
      }
    } catch (e) {
      // non-blocking
    }
  }).catch(() => {});

  return responseHandler({ comment }, res);
});

exports.getComments = asyncHandler(async (req, res) => {
  const {
    pageNum = 1, pageSize = 10, sortBy = 'createdAt', ...reqQuery
  } = req.query;
  const { userId } = req.user;
  const page = Number(pageNum);
  const limit = Number(pageSize);
  const skip = (page - 1) * limit;
  const filter = {};
  const sort = sortBy === 'top' ? { likeCount: -1, createdAt: -1 } : { createdAt: -1 };
  const pagination = { skip, limit };

  if (reqQuery.postId) {
    filter.postId = new ObjectId(reqQuery.postId);
  }

  const query = getCommentsQuery(filter, sort, pagination, userId);
  const comments = await commentService.aggregate({ query });
  return responseHandler({
    comments, page, limit, total: comments.length,
  }, res);
});

exports.getReplies = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const { pageNum = 1, pageSize = 20 } = req.query;
  const { userId } = req.user;
  const page = Number(pageNum);
  const limit = Number(pageSize);
  const skip = (page - 1) * limit;

  const parentCommentQuery = [
    {
      $match: { _id: new ObjectId(commentId) },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'commentBy',
        foreignField: '_id',
        pipeline: [
          {
            $project: {
              _id: 1,
              fullName: 1,
              userName: 1,
              profilePicture: 1,
            },
          },
        ],
        as: 'commentBy',
      },
    },
    {
      $unwind: { path: '$commentBy' },
    },
    {
      $lookup: {
        from: 'comment-likes',
        localField: '_id',
        foreignField: 'commentId',
        as: 'likes',
      },
    },
    {
      $lookup: {
        from: 'comments',
        localField: '_id',
        foreignField: 'parentCommentId',
        as: 'replies',
      },
    },
    {
      $addFields: {
        likeCount: { $size: '$likes' },
        replyCount: { $size: '$replies' },
        isLiked: {
          $in: [new ObjectId(userId), '$likes.userId'],
        },
      },
    },
    {
      $project: {
        likes: 0,
        replies: 0,
      },
    },
  ];

  const parentCommentResult = await commentService.aggregate({ query: parentCommentQuery });
  if (!parentCommentResult || parentCommentResult.length === 0) {
    return errorResponse('Comment not found', res);
  }

  const filter = { parentCommentId: new ObjectId(commentId) };
  const sort = { createdAt: 1 };
  const pagination = { skip, limit };

  const query = getRepliesQuery(filter, sort, pagination, userId);
  const replies = await commentService.aggregate({ query });
  return responseHandler({
    parentComment: parentCommentResult[0], replies, page, limit, total: replies.length,
  }, res);
});

exports.likeComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const { userId } = req.user;

  const comment = await commentService.findById({ id: commentId });
  if (!comment) {
    return errorResponse('Comment not found', res);
  }

  const result = await commentService.likeComment({ filter: { userId, commentId } });
  return responseHandler(result, res);
});

exports.deleteComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const { userId } = req.user;

  const comment = await commentService.findById({ id: commentId });
  if (!comment) {
    return errorResponse('Comment not found', res);
  }

  if (comment.commentBy.toString() !== userId.toString()) {
    return errorResponse('Unauthorized to delete this comment', res, 403);
  }

  await commentService.deleteMany({ filter: { parentCommentId: commentId } });
  await commentService.findOneAndDelete({ filter: { _id: commentId } });

  return responseHandler({ message: 'Comment deleted successfully' }, res);
});

exports.updateComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;
  const { userId } = req.user;
  const { content } = req.value;

  const comment = await commentService.findById({ id: commentId });
  if (!comment) {
    return errorResponse('Comment not found', res);
  }

  if (comment.commentBy.toString() !== userId.toString()) {
    return errorResponse('Unauthorized to update this comment', res, 403);
  }

  const updatedComment = await commentService.findByIdAndUpdate({
    id: commentId,
    body: { content },
  });

  return responseHandler({ comment: updatedComment }, res);
});
