const router = require('express').Router();
const {
  hashtagIdSchema,
} = require('../validators/hashtagLike.validators');
const {
  likeHashtag,
  unlikeHashtag,
} = require('../controllers/hashtagLike.controller');
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');

// "posts/like"
// router.route('/:postId').get(
//   verifyToken,
//   validateRequest(hashtagIdSchema, 'params'),
//   validateRequest(paginationSchema, 'query'),
//   getAllHashtagLikes,
// );

router.route('/:hashtagId').post(verifyToken, validateRequest(hashtagIdSchema, 'params'), likeHashtag);
router.route('/:hashtagId').delete(verifyToken, validateRequest(hashtagIdSchema, 'params'), unlikeHashtag);

module.exports = router;
