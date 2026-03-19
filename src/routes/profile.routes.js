const router = require('express').Router();
const {
  userIdSchema,
  getUserFeedSchema,
} = require('../validators/profile.validators');
const {
  getUserFeed,
  updateUserProfile,
} = require('../controllers/profile.controller');
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');

const infoRoutes = require('./profileInfo.routes');
const mediaRoutes = require('./profileMedia.routes');
const { updateProfileSchema } = require('../validators/profile.validators');

router.use('/info', infoRoutes);
router.use('/media', mediaRoutes);

router.route('/feed/:userId').get(verifyToken, validateRequest(userIdSchema, 'params'), validateRequest(getUserFeedSchema, 'query'), getUserFeed);
router.route('/update-profile').put(verifyToken, validateRequest(updateProfileSchema, 'body'), updateUserProfile);
module.exports = router;
