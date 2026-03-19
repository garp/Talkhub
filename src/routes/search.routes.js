const router = require('express').Router();
const { searchNearbySchema, placeDetailsParamsSchema } = require('../validators/search.validators');
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');
const { searchNearby, getPlaceDetails } = require('../controllers/search.controller');

/**
 * POST /search-nearby
 * Location-based unified search API
 * Requires authentication
 */
router.route('/search-nearby')
  .post(
    verifyToken,
    validateRequest(searchNearbySchema, 'body'),
    searchNearby,
  );

/**
 * GET /search-places-details/:placeId
 * Get detailed information about a specific place using Google Places API
 * Requires authentication
 */
router.route('/search-places-details/:placeId')
  .get(
    verifyToken,
    validateRequest(placeDetailsParamsSchema, 'params'),
    getPlaceDetails,
  );

module.exports = router;
