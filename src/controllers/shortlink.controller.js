const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { errorHandler, responseHandler } = require('../../lib/helpers/responseHandler');
const shortlinkServices = require('../services/shortlinkServices');
const env = require('../../lib/configs/env.config');

/**
 * Create a short link
 * POST /shortlink
 * Creates a new short link and returns the short URL
 */
exports.createShortlink = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const {
    screen,
    id,
    type,
    name,
    expiresIn,
    extra,
  } = req.value;

  try {
    // Generate unique code
    const code = await shortlinkServices.generateUniqueCode();

    // Calculate expiration date if provided
    let expiresAt = null;
    if (expiresIn && typeof expiresIn === 'number') {
      expiresAt = new Date(Date.now() + expiresIn * 60 * 60 * 1000);
    }

    // Create the short link
    const shortlink = await shortlinkServices.create({
      body: {
        code,
        data: {
          screen: screen.toLowerCase(),
          id,
          type: type || null,
          name: name || null,
          extra: extra || null,
        },
        createdBy: userId,
        expiresAt,
      },
    });

    const baseUrl = env.SHORT_LINK_BASE_URL || 'https://talkhub.co/s';

    return responseHandler({
      code: shortlink.code,
      shortUrl: `${baseUrl}/${shortlink.code}`,
      expiresAt: shortlink.expiresAt,
    }, res, 201);
  } catch (error) {
    console.error('Error creating short link:', error);
    return errorHandler('ERR-400', res);
  }
});

/**
 * Resolve a short link
 * GET /shortlink/:code
 * Retrieves the original data for a short code (public endpoint)
 * Returns { success: true, data: {...} } format for frontend compatibility
 */
exports.resolveShortlink = asyncHandler(async (req, res) => {
  const { code } = req.params;

  try {
    // Find and increment click count atomically
    const shortlink = await shortlinkServices.findOneAndUpdate({
      filter: { code },
      body: { $inc: { clickCount: 1 } },
    });

    if (!shortlink) {
      return res.status(404).json({
        success: false,
        code: 'ERR-SHORTLINK-404',
        message: 'Link not found',
      });
    }

    // Check if link has expired
    if (shortlink.expiresAt && shortlink.expiresAt < new Date()) {
      return res.status(410).json({
        success: false,
        code: 'ERR-SHORTLINK-410',
        message: 'This link has expired',
      });
    }

    // Build response data for frontend deep linking
    const responseData = {
      screen: shortlink.data.screen,
      id: shortlink.data.id,
    };

    if (shortlink.data.type) {
      responseData.type = shortlink.data.type;
    }

    if (shortlink.data.name) {
      responseData.name = shortlink.data.name;
    }

    if (shortlink.data.extra) {
      Object.assign(responseData, shortlink.data.extra);
    }

    // Return in { success, data } format for frontend compatibility
    return res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    console.error('Error resolving short link:', error);
    return res.status(400).json({
      success: false,
      code: 'ERR-400',
      message: 'Failed to resolve link',
    });
  }
});

/**
 * Get short link statistics
 * GET /shortlink/:code/stats
 * Get click statistics for a short link (requires auth)
 */
exports.getShortlinkStats = asyncHandler(async (req, res) => {
  const { code } = req.params;
  const { userId } = req.user;

  try {
    const shortlink = await shortlinkServices.findOne({
      filter: { code },
      projection: {
        code: 1,
        clickCount: 1,
        createdAt: 1,
        expiresAt: 1,
        createdBy: 1,
        data: 1,
      },
    });

    if (!shortlink) {
      return res.status(404).json({
        code: 'ERR-SHORTLINK-404',
        message: 'Link not found',
      });
    }

    // Only allow the creator to see stats
    if (shortlink.createdBy && shortlink.createdBy.toString() !== userId) {
      return res.status(403).json({
        code: 'ERR-SHORTLINK-403',
        message: 'You can only view stats for your own links',
      });
    }

    return responseHandler({
      code: shortlink.code,
      clickCount: shortlink.clickCount,
      screen: shortlink.data.screen,
      createdAt: shortlink.createdAt,
      expiresAt: shortlink.expiresAt,
    }, res);
  } catch (error) {
    console.error('Error getting short link stats:', error);
    return errorHandler('ERR-400', res);
  }
});

/**
 * Get user's short links
 * GET /shortlink
 * Get all short links created by the authenticated user
 */
exports.getUserShortlinks = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { page, limit } = req.value;

  try {
    const skip = (page - 1) * limit;

    const shortlinks = await shortlinkServices.find({
      filter: { createdBy: userId },
      pagination: { skip, limit },
      sort: { createdAt: -1 },
      projection: {
        code: 1,
        data: 1,
        clickCount: 1,
        createdAt: 1,
        expiresAt: 1,
      },
    });

    const totalCount = await shortlinkServices.countDocuments({
      filter: { createdBy: userId },
    });

    const baseUrl = env.SHORT_LINK_BASE_URL || 'https://talkhub.co/s';

    const formattedLinks = shortlinks.map((link) => ({
      code: link.code,
      shortUrl: `${baseUrl}/${link.code}`,
      screen: link.data.screen,
      id: link.data.id,
      name: link.data.name,
      clickCount: link.clickCount,
      createdAt: link.createdAt,
      expiresAt: link.expiresAt,
    }));

    return responseHandler({
      shortlinks: formattedLinks,
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
    console.error('Error getting user short links:', error);
    return errorHandler('ERR-400', res);
  }
});

/**
 * Get URL details from a full short URL
 * POST /shortlink/get-url-details
 * Accepts a full short URL and returns the details (public endpoint)
 */
exports.getUrlDetails = asyncHandler(async (req, res) => {
  const { url } = req.value;

  try {
    // Extract code from URL
    // Supports: https://talkhub.co/s/xK9mPq or just xK9mPq
    let code = url;

    // If it's a full URL, extract the code
    if (url.includes('/')) {
      // Get the last segment of the URL path
      const urlParts = url.split('/');
      code = urlParts[urlParts.length - 1];

      // Remove any query parameters
      if (code.includes('?')) {
        [code] = code.split('?');
      }
    }

    // Validate code length
    if (!code || code.length !== 6) {
      return res.status(400).json({
        code: 'ERR-SHORTLINK-400',
        message: 'Invalid short URL or code. Code must be 6 characters.',
      });
    }

    // Find the shortlink (don't increment click count for this endpoint)
    const shortlink = await shortlinkServices.findOne({
      filter: { code },
    });

    if (!shortlink) {
      return res.status(404).json({
        code: 'ERR-SHORTLINK-404',
        message: 'Link not found',
      });
    }

    // Check if link has expired
    if (shortlink.expiresAt && shortlink.expiresAt < new Date()) {
      return res.status(410).json({
        code: 'ERR-SHORTLINK-410',
        message: 'This link has expired',
      });
    }

    const baseUrl = env.SHORT_LINK_BASE_URL || 'https://talkhub.co/s';

    // Return flat response (not wrapped in data) for frontend compatibility
    // Frontend checks: if (!response.ok || !result.code)
    return res.status(200).json({
      code: shortlink.code,
      shortUrl: `${baseUrl}/${shortlink.code}`,
      screen: shortlink.data.screen,
      id: shortlink.data.id,
      type: shortlink.data.type || null,
      name: shortlink.data.name || null,
      clickCount: shortlink.clickCount,
      createdAt: shortlink.createdAt,
      expiresAt: shortlink.expiresAt,
      extra: shortlink.data.extra || null,
    });
  } catch (error) {
    console.error('Error getting URL details:', error);
    return errorHandler('ERR-400', res);
  }
});

/**
 * Delete a short link
 * DELETE /shortlink/:code
 * Delete a short link (only by creator)
 */
exports.deleteShortlink = asyncHandler(async (req, res) => {
  const { code } = req.params;
  const { userId } = req.user;

  try {
    const shortlink = await shortlinkServices.findOne({
      filter: { code },
    });

    if (!shortlink) {
      return res.status(404).json({
        code: 'ERR-SHORTLINK-404',
        message: 'Link not found',
      });
    }

    // Only allow the creator to delete
    if (shortlink.createdBy && shortlink.createdBy.toString() !== userId) {
      return res.status(403).json({
        code: 'ERR-SHORTLINK-403',
        message: 'You can only delete your own links',
      });
    }

    await shortlinkServices.deleteOne({
      filter: { code },
    });

    return responseHandler({
      message: 'Short link deleted successfully',
      code,
    }, res);
  } catch (error) {
    console.error('Error deleting short link:', error);
    return errorHandler('ERR-400', res);
  }
});
