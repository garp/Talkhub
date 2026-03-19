const router = require('express').Router();
const {
  addRepostSchema,
  removeRepostSchema,
  getRepostParamsSchema,
  getRepostsQuerySchema,
  updateRepostParamsSchema,
  updateRepostBodySchema,
} = require('../validators/repost.validators');
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');
const {
  addRepost,
  removeRepost,
  getRepost,
  getReposts,
  updateRepost,
} = require('../controllers/repost.controller');

// POST /repost/add-repost - Create a new repost
router.route('/add-repost')
  .post(
    verifyToken,
    validateRequest(addRepostSchema, 'body'),
    addRepost,
  );

// DELETE /repost/remove-repost - Remove a repost
router.route('/remove-repost')
  .delete(
    verifyToken,
    validateRequest(removeRepostSchema, 'body'),
    removeRepost,
  );

// GET /repost - Get all reposts by a user
router.route('/')
  .get(
    verifyToken,
    validateRequest(getRepostsQuerySchema, 'query'),
    getReposts,
  );

// GET /repost/:repostId - Get a single repost by ID
router.route('/:repostId')
  .get(
    verifyToken,
    validateRequest(getRepostParamsSchema, 'params'),
    getRepost,
  );

// PUT /repost/:repostId - Update repost text
router.route('/:repostId')
  .put(
    verifyToken,
    validateRequest(updateRepostParamsSchema, 'params'),
    validateRequest(updateRepostBodySchema, 'body'),
    updateRepost,
  );

module.exports = router;
