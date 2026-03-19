const router = require('express').Router();
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const { generateImageSchema } = require('../validators/ai.validators');
const { generateImage } = require('../controllers/ai.controller');
// const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');

// Generate AI image and upload to S3 (with local fallback)
// Note: verifyToken temporarily disabled for testing
router.route('/generate-image').post(
  // verifyToken,
  validateRequest(generateImageSchema, 'body'),
  generateImage,
);

module.exports = router;
