const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { errorHandler, responseHandler } = require('../../lib/helpers/responseHandler');
const searchService = require('../services/searchService');

/**
 * Search nearby endpoint
 * POST /search-nearby
 * Searches for people, hashtags, or places based on location and search type
 */
exports.searchNearby = asyncHandler(async (req, res) => {
  const {
    searchType, latitude, longitude, radius,
  } = req.value;

  try {
    const results = await searchService.searchNearby(
      searchType,
      latitude,
      longitude,
      radius,
    );

    // Return unified response format as array
    return responseHandler(results, res);
  } catch (error) {
    // Handle Google Places API errors as 502 Bad Gateway
    if (error.message.includes('Google Places API')) {
      return errorHandler('ERR-502', res);
    }

    // Handle other errors as 400 Bad Request
    return errorHandler('ERR-400', res);
  }
});

/**
 * Get place details endpoint
 * GET /search-places-details/:placeId
 * Retrieves detailed information about a specific place using Google Places API
 */
exports.getPlaceDetails = asyncHandler(async (req, res) => {
  const { placeId } = req.params;

  try {
    const placeDetails = await searchService.getPlaceDetails(placeId);

    // Return formatted place details
    return responseHandler(placeDetails, res);
  } catch (error) {
    // Handle Google Places API 404 errors
    if (error.message.includes('404') || error.message.includes('not found')) {
      return res.status(404).json({
        code: 'ERR-PLACE-404',
        message: 'Place not found',
      });
    }

    // Handle Google Places API errors as 502 Bad Gateway
    if (error.message.includes('Google Places API')) {
      return errorHandler('ERR-502', res);
    }

    // Handle other errors as 400 Bad Request
    return errorHandler('ERR-400', res);
  }
});
