const router = require('express').Router();
const {
  generateReferralCode,
  getReferralCode,
  applyInviteCode,
  getReferredUsers,
  updateReferralSettings,
  getNotificationSettings,
  updateNotificationSettings,
} = require('../controllers/settings.controller');
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');
const {
  generateReferralCodeSchema,
  applyInviteCodeSchema,
  getReferredUsersSchema,
  updateReferralSettingsSchema,
} = require('../validators/settings.validators');
const {
  updateNotificationSettingsSchema,
} = require('../validators/notificationSettings.validators');

/**
 * @route   POST /settings/generate-referral-code
 * @desc    Generate a unique 6-character referral code for the authenticated user
 * @access  Private (requires authentication)
 * @body    { userId?: string } - Optional, defaults to authenticated user
 * @returns { userId, referralCode, fullName, userName, profilePicture }
 */
router.route('/generate-referral-code').post(
  verifyToken,
  validateRequest(generateReferralCodeSchema, 'body'),
  generateReferralCode,
);

/**
 * @route   GET /settings/referral-code
 * @desc    Get the current user's referral code (without generating)
 * @access  Private (requires authentication)
 * @returns { userId, referralCode, fullName, userName, profilePicture, hasReferralCode }
 */
router.route('/referral-code').get(
  verifyToken,
  getReferralCode,
);

/**
 * @route   POST /settings/apply-invite-code
 * @desc    Apply an invite code to a user's account (no auth required)
 * @access  Public - can be called during signup flow
 * @body    { userId: string, inviteCode: string }
 * @returns { message, userId, inviteCode, referredBy }
 */
router.route('/apply-invite-code').post(
  validateRequest(applyInviteCodeSchema, 'body'),
  applyInviteCode,
);

/**
 * @route   GET /settings/referred-users
 * @desc    Get list of users who signed up using the current user's referral code
 * @access  Private (requires authentication)
 * @query   { pageNum?: number, pageSize?: number } - Pagination options
 * @returns { metadata, referralCode, referredUsers[] }
 */
router.route('/referred-users').get(
  verifyToken,
  validateRequest(getReferredUsersSchema, 'query'),
  getReferredUsers,
);

/**
 * @route   PUT /settings/referral-settings
 * @desc    Update referral code settings (expiration, max uses) without regenerating the code
 * @access  Private (requires authentication)
 * @body    { expireAfter?: "never"|"12h"|"1d"|"7d", maxUses?: number|null }
 * @returns { message, referralCode, expireAfter, maxUses, expiresAt, currentUses }
 */
router.route('/referral-settings').put(
  verifyToken,
  validateRequest(updateReferralSettingsSchema, 'body'),
  updateReferralSettings,
);

/**
 * @route   GET /settings/notification-settings
 * @desc    Get user's notification preferences
 * @access  Private (requires authentication)
 * @returns { message, settings: { messageNotifications, inAppNotifications, ... } }
 */
router.route('/notification-settings').get(
  verifyToken,
  getNotificationSettings,
);

/**
 * @route   PUT /settings/notification-settings
 * @desc    Update user's notification preferences
 * @access  Private (requires authentication)
 * @body    { messageNotifications?: {...}, inAppNotifications?: {...}, ... }
 * @returns { message, settings: { messageNotifications, inAppNotifications, ... } }
 */
router.route('/notification-settings').put(
  verifyToken,
  validateRequest(updateNotificationSettingsSchema, 'body'),
  updateNotificationSettings,
);

module.exports = router;
