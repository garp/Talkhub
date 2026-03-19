const router = require('express').Router();
const {
  postIdSchema,
  paginationSchema,
} = require('../validators/like.validators');
const {
  likePost,
  getAllLikes,
} = require('../controllers/like.controller');
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');

// "posts/like"
router.route('/:postId').get(
  verifyToken,
  validateRequest(postIdSchema, 'params'),
  validateRequest(paginationSchema, 'query'),
  getAllLikes,
);
router.route('/:postId').post(verifyToken, likePost);

module.exports = router;
