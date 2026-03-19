const router = require('express').Router();
const {
  postCreationSchema,
  getChatPostSchema,
  postEditSchema,
  postEditBodySchema,
  savePostSchema,
  removeSavedPostSchema,
  postDeletionSchema,
  notInterestedSchema,
  notInterestedParamsSchema,
  postRepliesParamsSchema,
  postRepliesQuerySchema,
} = require('../validators/post.validators');
const {
  createPost,
  getChatPost,
  editPost,
  getAllPosts,
  savePost,
  removeSavedPost,
  getSavedPosts,
  deletePost,
  markNotInterested,
  undoNotInterested,
  getPostRepliesByUser,
} = require('../controllers/post.controller');

const likeRoutes = require('./like.routes');
const replyRoutes = require('./reply.routes');
const commentRoutes = require('./comment.routes');
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');

router.route('/').post(verifyToken, validateRequest(postCreationSchema, 'body'), createPost);
router.route('/').get(verifyToken, getAllPosts);
router.route('/not-interested').post(verifyToken, validateRequest(notInterestedSchema, 'body'), markNotInterested);
router.route('/not-interested/:postId').delete(verifyToken, validateRequest(notInterestedParamsSchema, 'params'), undoNotInterested);
router.route('/get-chat-post/:hashtagId').get(verifyToken, validateRequest(getChatPostSchema, 'params'), getChatPost);
router.route('/save').post(verifyToken, validateRequest(savePostSchema, 'body'), savePost);
router.route('/save/:postId').delete(verifyToken, validateRequest(removeSavedPostSchema, 'params'), removeSavedPost);
router.route('/save').get(verifyToken, getSavedPosts);
router.use('/like', likeRoutes);
router.use('/reply', replyRoutes);
router.use('/comment', commentRoutes);
router.route('/:postId').delete(verifyToken, validateRequest(postDeletionSchema, 'params'), deletePost);
router.route('/:postId/edit').put(verifyToken, validateRequest(postEditSchema, 'params'), validateRequest(postEditBodySchema, 'body'), editPost);

// Get all posts where a user has replied to comments (for viewing user profile)
router.route('/replies/:userId').get(
  verifyToken,
  validateRequest(postRepliesParamsSchema, 'params'),
  validateRequest(postRepliesQuerySchema, 'query'),
  getPostRepliesByUser,
);

module.exports = router;
