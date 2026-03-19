const router = require('express').Router();
const {
  createComment,
  getComments,
  getReplies,
  likeComment,
  deleteComment,
  updateComment,
} = require('../controllers/comment.controller');
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');
const { createCommentSchema, updateCommentSchema } = require('../validators/comment.validators');

router.route('/').post(verifyToken, validateRequest(createCommentSchema, 'body'), createComment);
router.route('/').get(verifyToken, getComments);
router.route('/:commentId/replies').get(verifyToken, getReplies);
router.route('/:commentId/like').post(verifyToken, likeComment);
router.route('/:commentId').patch(verifyToken, validateRequest(updateCommentSchema, 'body'), updateComment);
router.route('/:commentId').delete(verifyToken, deleteComment);

module.exports = router;
