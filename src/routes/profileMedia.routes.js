const router = require('express').Router();
const {
  userIdSchema,
  addUserMediaSchema,
} = require('../validators/profile.validators');
const {
  getUserMedia,
  addUserMedia,
} = require('../controllers/profile.controller');
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');

router.route('/:userId').get(verifyToken, validateRequest(userIdSchema, 'params'), getUserMedia);
router.route('/:userId').post(verifyToken, validateRequest(addUserMediaSchema, 'body'), addUserMedia);

module.exports = router;
