const router = require('express').Router();
const {
  userIdSchema,
  updateUserInfoSchema,
} = require('../validators/profile.validators');
const {
  getUserInfo,
  updateUserInfo,
} = require('../controllers/profile.controller');

const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');

router.route('/:userId').get(verifyToken, validateRequest(userIdSchema, 'params'), getUserInfo);
router.route('/:userId').post(
  verifyToken,
  validateRequest(updateUserInfoSchema, 'body'),
  updateUserInfo,
);
module.exports = router;
