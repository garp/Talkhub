const router = require('express').Router();
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');
const { globalSearchQuerySchema } = require('../validators/globalSearch.validators');
const { globalSearch } = require('../controllers/globalSearch.controller');

/**
 * GET /global-search
 *
 * Global Search API - Search across chats, chits, people, and topics
 *
 * Query Parameters:
 * - keyword (required): Search term (1-200 chars)
 * - type: Search type - 'all' | 'chats' | 'chits' | 'people' | 'topic' (default: 'all')
 * - pageNum: Page number for pagination (default: 1)
 * - pageSize: Results per page (default: 20, max: 100)
 * - allSize: When type='all', limits results per category (default: 5, max: 20)
 *
 * Requires authentication via JWT token
 */
router.route('/')
  .get(
    verifyToken,
    validateRequest(globalSearchQuerySchema, 'query'),
    globalSearch,
  );

module.exports = router;
