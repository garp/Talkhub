const router = require('express').Router();
const {
  authStepOne,
  authStepTwo,
  authStepThree,
  authStepFour,
  authStepFourVerifyOtp,
  getStageFourPrompt,
  verifyOtp,
  login,
  resendOtp,
  oauthSuccess,
  userLocation,
  blockUser,
  unblockUser,
  getAllBlockedUsers,
  getAllStoryMutedUsers,
  muteUser,
  unmuteUser,
  userNameSuggBasedOnFullName,
  userNameSuggestions,
  googleAuth,
  appleAuth,
  getUserChits,
  getSuggestedUsers,
  onboarding,
  continueAuth,
  addInterest,
  followInterestSubCategory,
  unfollowInterestSubCategory,
  getUserInterestCategories,
  addNotInterestedCategory,
  removeNotInterestedCategory,
  getNotInterestedCategories,
  replaceNotInterestedCategories,
  clearNotInterestedCategories,
  temporaryDeleteAccount,
  updatePassword,
  forgotPassword,
  resetPassword,
  forceLogoutUser,
  getStoriesUpdate,
  getStorySettings,
  updateStorySettings,
  validateInviteCode,
  requestInvitation,
  reserveWaitlistUsername,
  permanentDeleteAccount,
  inviteSms,
  accountExists,
} = require('../controllers/user.controller');
const {
  getOnboardingProgress,
  createOnboardingProgress,
  updateOnboardingProgress,
} = require('../controllers/onboardingProgress.controller');
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const { upload } = require('../../lib/middlewares/imageUpload.middleware');
const mediaModerationService = require('../services/mediaModerationService');
const {
  authStepOneSchema,
  authStepTwoSchema,
  authStepThreeSchema,
  authStepFourQuerySchema,
  authStepFourSchema,
  authStepFourVerifyOtpSchema,
  verifyOtpSchema,
  loginSchema,
  resendOtpSchema,
  userNameSuggestionsSchema,
  blockUserSchema,
  muteUserSchema,
  getAllBlockedUsersSchema,
  getAllStoryMutedUsersSchema,
  googleAuthSchema,
  appleAuthSchema,
  getUserChitsSchema,
  onboardingSchema,
  continueAuthSchema,
  addInterestSchema,
  followInterestSubCategorySchema,
  notInterestedCategoryParamsSchema,
  replaceNotInterestedCategoriesSchema,
  deleteAccountParamsSchema,
  deleteAccountBodySchema,
  updatePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  forceLogoutSchema,
  storySettingsSchema,
  validateInviteCodeSchema,
  requestInvitationSchema,
  reserveWaitlistUsernameSchema,
  permanentDeleteAccountSchema,
  inviteSmsSchema,
  onboardingProgressUserIdParamsSchema,
  onboardingProgressPutBodySchema,
  accountExistsBodySchema,
} = require('../validators/user.validators');
const passport = require('../services/oauthServices');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');
const { uploadVideo } = require('../controllers/uploadVideo.controller');
const { uploadAudio } = require('../controllers/uploadAudio.controller');
const thumbnailGenerator = require('../../lib/helpers/thumbnailGenerator');
const { toCloudFrontUrl } = require('../../lib/helpers/cloudfront');

const pushNotificationService = require('../services/pushNotificationService');

router.route('/notification').post(pushNotificationService.pushNotication);
router.route('/auth/stage-one').post(validateRequest(authStepOneSchema, 'body'), authStepOne);
router.route('/auth/stage-two').post(validateRequest(authStepTwoSchema, 'body'), authStepTwo);
router.route('/auth/stage-three').post(validateRequest(authStepThreeSchema, 'body'), authStepThree);
router.route('/auth/stage-four')
  .get(validateRequest(authStepFourQuerySchema, 'query'), getStageFourPrompt)
  .post(validateRequest(authStepFourSchema, 'body'), authStepFour);
router.route('/auth/stage-four/verify-otp').post(validateRequest(authStepFourVerifyOtpSchema, 'body'), authStepFourVerifyOtp);
router.route('/auth/verify-otp').post(validateRequest(verifyOtpSchema, 'body'), verifyOtp);
router.route('/auth/login').post(validateRequest(loginSchema, 'body'), login);
router.route('/auth/continue').post(validateRequest(continueAuthSchema, 'body'), continueAuth);
router.route('/auth/google').post(validateRequest(googleAuthSchema, 'body'), googleAuth);
router.route('/auth/apple').post(validateRequest(appleAuthSchema, 'body'), appleAuth);
router.route('/auth/resend-otp').post(validateRequest(resendOtpSchema, 'body'), resendOtp);
router.route('/auth/forgot-password').post(validateRequest(forgotPasswordSchema, 'body'), forgotPassword);
router.route('/auth/reset-password').post(validateRequest(resetPasswordSchema, 'body'), resetPassword);

// Account exists by phone (public, bulk body)
router.route('/account-exists').post(validateRequest(accountExistsBodySchema, 'body'), accountExists);

// Invite-only / Waitlist
router.route('/auth/validate-invite-code').post(validateRequest(validateInviteCodeSchema, 'body'), validateInviteCode);
router.route('/auth/request-invitation').post(validateRequest(requestInvitationSchema, 'body'), requestInvitation);
router.route('/auth/reserve-username').post(validateRequest(reserveWaitlistUsernameSchema, 'body'), reserveWaitlistUsername);

router.route('/onboarding')
  .put(
    validateRequest(onboardingSchema, 'body'),
    onboarding,
  )
  .post(verifyToken, createOnboardingProgress);

// Onboarding progress (separate collection) — GET/PUT /onboarding/:userId (no auth; userId in params)
router.route('/onboarding/:userId')
  .get(
    validateRequest(onboardingProgressUserIdParamsSchema, 'params'),
    getOnboardingProgress,
  )
  .put(
    validateRequest(onboardingProgressUserIdParamsSchema, 'params'),
    validateRequest(onboardingProgressPutBodySchema, 'body'),
    updateOnboardingProgress,
  );

router.route('/add-interest/:categoryId')
  .put(
    verifyToken,
    validateRequest(addInterestSchema, 'params'),
    addInterest,
  );

router.route('/interest-subcategories/:subCategoryId/follow')
  .post(
    verifyToken,
    validateRequest(followInterestSubCategorySchema, 'params'),
    followInterestSubCategory,
  )
  .delete(
    verifyToken,
    validateRequest(followInterestSubCategorySchema, 'params'),
    unfollowInterestSubCategory,
  );

router.route('/interests')
  .get(
    verifyToken,
    getUserInterestCategories,
  );

router.post('/upload', upload.single('image'), async (req, res) => {
  // Use single upload for simplicity
  const { file } = req;
  if (!file) {
    return res.status(400).send('No file uploaded.');
  }
  let mediaType = 'image';
  let folder = 'images';

  if (file.mimetype.startsWith('video/')) {
    mediaType = 'video';
    folder = 'videos';
  } else if (file.mimetype.startsWith('audio/')) {
    mediaType = 'audio';
    folder = 'audios';
  }

  // Generate thumbnail for video uploads
  let thumbnailUrl = null;
  if (mediaType === 'video') {
    try {
      console.log('[Upload] Video detected, generating thumbnail...');
      const rawThumbnailUrl = await thumbnailGenerator.generateAndUploadThumbnail(file);
      thumbnailUrl = toCloudFrontUrl(rawThumbnailUrl);
      console.log('[Upload] Thumbnail generated:', thumbnailUrl);
    } catch (thumbnailError) {
      console.error('[Upload] Thumbnail generation failed:', thumbnailError.message);
      // Continue without thumbnail
    }
  }

  const ownerUserId = (req.user && req.user.userId) || null;

  // Create/update mediaAssets record for this upload (moderate once, reuse everywhere).
  // Moderation is processed asynchronously by cron.
  return mediaModerationService.ensureAssetForS3Object({
    ownerUserId,
    bucket: file.bucket,
    key: file.key,
    url: file.location,
    etag: file.etag,
    contentType: file.mimetype,
    size: file.size,
    mediaType,
  }).then((asset) => res.send({
    message: 'File uploaded successfully',
    file: toCloudFrontUrl(file.location),
    thumbnailUrl,
    assetId: asset && asset._id ? asset._id : null,
    moderationStatus: (asset && asset.moderation && asset.moderation.status) || (mediaType === 'audio' ? 'skipped' : 'pending'),
    mediaType,
    contentType: file.mimetype,
    originalName: file.originalname,
    size: file.size,
    folder,
  })).catch((e) => res.send({
    message: 'File uploaded successfully (moderation pending)',
    file: toCloudFrontUrl(file.location),
    thumbnailUrl,
    assetId: null,
    moderationStatus: mediaType === 'audio' ? 'skipped' : 'pending',
    moderationError: e && e.message ? e.message : 'unknown',
    mediaType,
    contentType: file.mimetype,
    originalName: file.originalname,
    size: file.size,
    folder,
  }));
});
router.post('/upload/video', uploadVideo);
router.post('/upload/audio', uploadAudio);
// router.
router.route('/userLocation').get(verifyToken, userLocation);
router.route('/availableUserNameBasedOnFullName').get(validateRequest(userNameSuggestionsSchema, 'query'), userNameSuggBasedOnFullName);
router.route('/availableUserName').get(validateRequest(userNameSuggestionsSchema, 'query'), userNameSuggestions);
router.route('/blockUser').post(validateRequest(blockUserSchema, 'body'), verifyToken, blockUser);
router.route('/unblockUser').post(validateRequest(blockUserSchema, 'body'), verifyToken, unblockUser);
router.route('/muteUser').post(validateRequest(muteUserSchema, 'body'), verifyToken, muteUser);
router.route('/unmuteUser').post(validateRequest(muteUserSchema, 'body'), verifyToken, unmuteUser);
router.route('/not-interested/categories').get(verifyToken, getNotInterestedCategories);
router.route('/not-interested/categories').put(
  verifyToken,
  validateRequest(replaceNotInterestedCategoriesSchema, 'body'),
  replaceNotInterestedCategories,
);
router.route('/not-interested/categories').delete(verifyToken, clearNotInterestedCategories);
router.route('/not-interested/categories/:categoryId').post(
  verifyToken,
  validateRequest(notInterestedCategoryParamsSchema, 'params'),
  addNotInterestedCategory,
);
router.route('/not-interested/categories/:categoryId').delete(
  verifyToken,
  validateRequest(notInterestedCategoryParamsSchema, 'params'),
  removeNotInterestedCategory,
);
router.route('/getBlockedUsers').get(validateRequest(getAllBlockedUsersSchema, 'query'), verifyToken, getAllBlockedUsers);
router.route('/getStoryMutedUsers').get(validateRequest(getAllStoryMutedUsersSchema, 'query'), verifyToken, getAllStoryMutedUsers);
router.route('/chits').get(validateRequest(getUserChitsSchema, 'query'), getUserChits);
router.route('/suggested').get(verifyToken, getSuggestedUsers);

// Stories feed - Get stories from logged-in user + followed users (like Instagram)
router.route('/stories-update').get(verifyToken, getStoriesUpdate);

// Story privacy/settings (Instagram-like)
router.route('/story-settings')
  .get(verifyToken, getStorySettings)
  .patch(
    verifyToken,
    validateRequest(storySettingsSchema, 'body'),
    updateStorySettings,
  );

// Delete account routes
router.route('/:userId/delete-account/temp').delete(
  verifyToken,
  validateRequest(deleteAccountParamsSchema, 'params'),
  validateRequest(deleteAccountBodySchema, 'body'),
  temporaryDeleteAccount,
);

// Send invite SMS to contacts
router.route('/invite-sms').post(
  verifyToken,
  validateRequest(inviteSmsSchema, 'body'),
  inviteSms,
);

// Permanent delete by phone number (no auth required)
router.route('/delete-account/permanent').delete(
  validateRequest(permanentDeleteAccountSchema, 'body'),
  permanentDeleteAccount,
);

// Update password route
router.route('/update-password').put(
  verifyToken,
  validateRequest(updatePasswordSchema, 'body'),
  updatePassword,
);

// Admin: Force logout a user (disconnect all their socket connections)
router.route('/admin/force-logout/:userId').post(
  verifyToken,
  validateRequest(forceLogoutSchema, 'params'),
  forceLogoutUser,
);

router.route('/auth/google').get(passport.authenticate('google', { scope: ['profile', 'email'] }));
router.route('/auth/google/callback').get(passport.authenticate('google', { failureRedirect: '/auth/google/failure' }), oauthSuccess);
router.route('/auth/google/failure').get((_, res) => {
  res.status(401).json({ message: 'Google OAuth failed' });
});

router.route('/auth/facebook').get(passport.authenticate('facebook', { scope: ['email'] }));
router.route('/auth/facebook/callback').get(passport.authenticate('facebook', { failureRedirect: '/auth/facebook/failure' }), oauthSuccess);
router.route('/auth/facebook/failure').get((_, res) => {
  res.status(401).json({ message: 'Facebook OAuth failed' });
});

module.exports = router;
