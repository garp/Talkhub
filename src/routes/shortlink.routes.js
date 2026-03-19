const router = require('express').Router();
const {
  createShortlinkSchema,
  resolveShortlinkParamsSchema,
  getShortlinksQuerySchema,
  getUrlDetailsSchema,
} = require('../validators/shortlink.validators');
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');
const {
  createShortlink,
  resolveShortlink,
  getShortlinkStats,
  getUserShortlinks,
  deleteShortlink,
  getUrlDetails,
} = require('../controllers/shortlink.controller');

/**
 * POST /shortlink
 * Create a new short link
 * Requires authentication
 */
router.route('/')
  .post(
    verifyToken,
    validateRequest(createShortlinkSchema, 'body'),
    createShortlink,
  )
  .get(
    verifyToken,
    validateRequest(getShortlinksQuerySchema, 'query'),
    getUserShortlinks,
  );

/**
 * GET /shortlink/get-url-details?url=https://talkhub.co/s/xK9mPq
 * Get details from a full short URL (public endpoint)
 * Accepts full URL like https://talkhub.co/s/xK9mPq or just the code
 */
router.route('/get-url-details')
  .get(
    validateRequest(getUrlDetailsSchema, 'query'),
    getUrlDetails,
  );

/**
 * GET /shortlink/:code/stats
 * Get statistics for a short link
 * Requires authentication
 */
router.route('/:code/stats')
  .get(
    verifyToken,
    validateRequest(resolveShortlinkParamsSchema, 'params'),
    getShortlinkStats,
  );

/**
 * GET /shortlink/:code
 * Resolve a short link (public endpoint)
 *
 * DELETE /shortlink/:code
 * Delete a short link (requires authentication)
 */
router.route('/:code')
  .get(
    validateRequest(resolveShortlinkParamsSchema, 'params'),
    resolveShortlink,
  )
  .delete(
    verifyToken,
    validateRequest(resolveShortlinkParamsSchema, 'params'),
    deleteShortlink,
  );

module.exports = router;
