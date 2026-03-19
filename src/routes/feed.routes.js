const router = require('express').Router();
const {
  paginationSchema,
  paginationAroundMeSchema,
  newFeedPaginationSchema,
  // searchSchema,
} = require('../validators/feed.validators');
const {
  getFeed,
  getNewFeed,
  getAroundMeFeed,
  getPeopleFeed,
} = require('../controllers/feed.controller');
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');

router.route('/').get(
  verifyToken,
  validateRequest(paginationSchema, 'query'),
  getFeed,
);

router.route('/get-new-feed').get(
  verifyToken,
  validateRequest(newFeedPaginationSchema, 'query'),
  getNewFeed,
);
router.route('/get-around-me-feed').get(
  verifyToken,
  validateRequest(paginationAroundMeSchema, 'query'),
  getAroundMeFeed,
);
router.route('/get-people-feed').get(
  verifyToken,
  validateRequest(paginationSchema, 'query'),
  getPeopleFeed,
);
module.exports = router;
