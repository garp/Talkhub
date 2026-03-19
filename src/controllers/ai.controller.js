const aiImageService = require('../services/aiImageService');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { responseHandler } = require('../../lib/helpers/responseHandler');

/**
 * Generate an AI image based on the prompt and upload to S3 (with local fallback)
 * POST /ai/generate-image
 */
exports.generateImage = asyncHandler(async (req, res) => {
  const {
    prompt, size, quality, style,
  } = req.value;

  // Get userId from auth (if available) or use 'anonymous'
  const userId = (req.user && req.user.userId) ? req.user.userId : 'anonymous';

  // Generate image and upload to S3 (falls back to local if S3 fails)
  const result = await aiImageService.generateAndUploadImage({
    prompt,
    userId,
    size,
    quality,
    style,
  });

  return responseHandler({
    message: 'Image generated successfully',
    image: result,
  }, res);
});
