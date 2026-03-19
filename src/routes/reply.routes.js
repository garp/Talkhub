const router = require('express').Router();
const {
  paginationSchema,
  postIdSchema,
  createReplySchema,
} = require('../validators/reply.validators');
const {
  getAllReplies,
  createReply,
} = require('../controllers/reply.controller');
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');

// "post/reply/:postId"
router.route('/:postId').post(
  verifyToken,
  validateRequest(postIdSchema, 'params'),
  validateRequest(createReplySchema, 'body'),
  createReply,
);

// "post/reply/:postId"
router.route('/:postId').get(
  verifyToken,
  validateRequest(postIdSchema, 'params'),
  validateRequest(paginationSchema, 'query'),
  getAllReplies,
);

module.exports = router;
