const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { errorHandler, responseHandler } = require('../../lib/helpers/responseHandler');
const favouriteServices = require('../services/favouriteServices');

/**
 * Create a favourite
 * POST /favourite
 * Saves a place/location as favourite for the authenticated user
 */
exports.createFavourite = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const {
    placeId,
    type,
    displayName,
    address,
    location,
    rating,
    userRatingCount,
    photos,
    distance,
  } = req.value;

  try {
    // Check if favourite already exists
    const existingFavourite = await favouriteServices.findOne({
      filter: { userId, placeId },
    });

    if (existingFavourite) {
      return res.status(409).json({
        code: 'ERR-FAVOURITE-EXISTS',
        message: 'This place is already in your favourites',
      });
    }

    // Create the favourite
    const favourite = await favouriteServices.create({
      body: {
        userId,
        placeId,
        type,
        displayName,
        address,
        location,
        rating,
        userRatingCount,
        photos,
        distance,
      },
    });

    return responseHandler({
      message: 'Favourite added successfully',
      favourite: {
        _id: favourite._id,
        placeId: favourite.placeId,
        type: favourite.type,
        displayName: favourite.displayName,
        address: favourite.address,
        location: favourite.location,
        rating: favourite.rating,
        userRatingCount: favourite.userRatingCount,
        photos: favourite.photos,
        distance: favourite.distance,
        createdAt: favourite.createdAt,
      },
    }, res, 201);
  } catch (error) {
    console.error('Error creating favourite:', error);
    return errorHandler('ERR-400', res);
  }
});

/**
 * Get user's favourites
 * GET /favourite
 * Retrieves all favourites for the authenticated user with optional type filter
 */
exports.getFavourites = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { type, page, limit } = req.value;

  try {
    // Build filter
    const filter = { userId };
    if (type && type !== 'all') {
      filter.type = type;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get favourites
    const favourites = await favouriteServices.find({
      filter,
      pagination: { skip, limit },
      sort: { createdAt: -1 },
      projection: {
        _id: 1,
        placeId: 1,
        type: 1,
        displayName: 1,
        address: 1,
        location: 1,
        rating: 1,
        userRatingCount: 1,
        photos: 1,
        distance: 1,
        createdAt: 1,
      },
    });

    // Get total count for pagination
    const totalCount = await favouriteServices.countDocuments({ filter });

    return responseHandler({
      favourites,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        limit,
        hasNextPage: page * limit < totalCount,
        hasPrevPage: page > 1,
      },
    }, res);
  } catch (error) {
    console.error('Error fetching favourites:', error);
    return errorHandler('ERR-400', res);
  }
});

/**
 * Delete a favourite
 * DELETE /favourite/:placeId
 * Removes a place from user's favourites
 */
exports.deleteFavourite = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { placeId } = req.params;

  try {
    const deletedFavourite = await favouriteServices.findOneAndDelete({
      filter: { userId, placeId },
    });

    if (!deletedFavourite) {
      return res.status(404).json({
        code: 'ERR-FAVOURITE-NOT-FOUND',
        message: 'Favourite not found',
      });
    }

    return responseHandler({
      message: 'Favourite removed successfully',
      placeId,
    }, res);
  } catch (error) {
    console.error('Error deleting favourite:', error);
    return errorHandler('ERR-400', res);
  }
});

/**
 * Check if a place is favourited
 * GET /favourite/check/:placeId
 * Checks if a specific place is in user's favourites
 */
exports.checkFavourite = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { placeId } = req.params;

  try {
    const favourite = await favouriteServices.findOne({
      filter: { userId, placeId },
    });

    return responseHandler({
      isFavourite: !!favourite,
      placeId,
    }, res);
  } catch (error) {
    console.error('Error checking favourite:', error);
    return errorHandler('ERR-400', res);
  }
});
