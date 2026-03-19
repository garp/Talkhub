const router = require('express').Router();
const {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  checkFollowStatus,
} = require('../controllers/follow.controller');
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');
const {
  followUserSchema,
  unfollowUserSchema,
  getFollowListSchema,
  checkFollowStatusSchema,
} = require('../validators/follow.validators');

router.post('/follow', verifyToken, validateRequest(followUserSchema, 'body'), followUser);
router.post('/unfollow', verifyToken, validateRequest(unfollowUserSchema, 'body'), unfollowUser);
router.get('/followers', verifyToken, validateRequest(getFollowListSchema, 'query'), getFollowers);
router.get('/following', verifyToken, validateRequest(getFollowListSchema, 'query'), getFollowing);
router.get('/status', verifyToken, validateRequest(checkFollowStatusSchema, 'query'), checkFollowStatus);

module.exports = router;
