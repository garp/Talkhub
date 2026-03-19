const userServices = require('../services/userServices');
const notificationSettingsServices = require('../services/notificationSettingsServices');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { errorHandler, responseHandler } = require('../../lib/helpers/responseHandler');

/**
 * Generates a unique 6-character referral code using 0-9 and A-Z
 * @returns {string} A 6-character alphanumeric code
 */
const generateUniqueCode = () => {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

/**
 * Generates a unique referral code that doesn't exist in the database
 * @returns {Promise<string>} A unique 6-character alphanumeric code
 */
const generateUniqueReferralCode = async () => {
  let code;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;

  while (!isUnique && attempts < maxAttempts) {
    code = generateUniqueCode();
    // Check if this code already exists
    const existingUser = await userServices.findOne({
      filter: { referralCode: code },
      projection: { _id: 1 },
    });
    if (!existingUser) {
      isUnique = true;
    }
    attempts += 1;
  }

  if (!isUnique) {
    throw new Error('Failed to generate unique referral code. Please try again.');
  }

  return code;
};

/**
 * Duration mapping for expireAfter values
 */
const EXPIRE_DURATIONS = {
  never: null,
  '12h': 12 * 60 * 60 * 1000, // 12 hours in ms
  '1d': 24 * 60 * 60 * 1000, // 1 day in ms
  '7d': 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

/**
 * Calculate expiresAt based on expireAfter value
 * @param {string} expireAfter - "never" | "12h" | "1d" | "7d"
 * @param {Date} fromDate - The date to calculate from (defaults to now)
 * @returns {Date|null} The expiration date or null if "never"
 */
const calculateExpiresAt = (expireAfter, fromDate = new Date()) => {
  const duration = EXPIRE_DURATIONS[expireAfter];
  if (!duration) return null;
  return new Date(fromDate.getTime() + duration);
};

/**
 * Count how many users have used a specific referral code
 * @param {string} referralCode - The referral code to count usages for
 * @returns {Promise<number>} The number of users who applied this code
 */
const countReferralCodeUsage = async (referralCode) => {
  const result = await userServices.aggregate({
    query: [
      { $match: { inviteCode: referralCode } },
      { $count: 'count' },
    ],
  });
  return (result[0] && result[0].count) || 0;
};

/**
 * Generate a referral code for the authenticated user
 * POST /settings/generate-referral-code
 *
 * - If user already has a referral code, returns the existing one with current settings
 * - If not, generates a new unique 6-character code and saves it with settings
 * - Accepts optional expireAfter ("never" | "12h" | "1d" | "7d") and maxUses (number | null)
 */
exports.generateReferralCode = asyncHandler(async (req, res) => {
  const { userId: tokenUserId } = req.user;
  const {
    userId: bodyUserId,
    expireAfter = 'never',
    maxUses = null,
  } = req.value || {};

  // Use userId from body if provided, otherwise use authenticated user's ID
  const targetUserId = bodyUserId || tokenUserId;

  // Security check: users can only generate codes for themselves (unless admin)
  if (bodyUserId && bodyUserId !== tokenUserId.toString()) {
    return errorHandler('ERR-005', res); // Unauthorized
  }

  // Fetch the user
  const user = await userServices.findById({ id: targetUserId });

  if (!user) {
    return errorHandler('ERR-109', res); // User not found
  }

  // If user already has a referral code, return it with current settings
  if (user.referralCode) {
    const currentUses = await countReferralCodeUsage(user.referralCode);
    const settings = user.referralSettings || {};
    const isExpired = settings.expiresAt && new Date() > new Date(settings.expiresAt);
    const isMaxedOut = settings.maxUses && currentUses >= settings.maxUses;

    return responseHandler(
      {
        message: 'Referral code already exists',
        userId: user._id,
        referralCode: user.referralCode,
        fullName: user.fullName,
        userName: user.userName,
        profilePicture: user.profilePicture,
        expireAfter: settings.expireAfter || 'never',
        maxUses: settings.maxUses || null,
        expiresAt: settings.expiresAt || null,
        currentUses,
        isExpired,
        isMaxedOut,
        isActive: !isExpired && !isMaxedOut,
      },
      res,
    );
  }

  // Generate a unique referral code
  const referralCode = await generateUniqueReferralCode();
  const now = new Date();
  const expiresAt = calculateExpiresAt(expireAfter, now);

  // Update user with the new referral code and settings
  const updatedUser = await userServices.findByIdAndUpdate({
    id: targetUserId,
    body: {
      $set: {
        referralCode,
        referralSettings: {
          expireAfter,
          maxUses,
          createdAt: now,
          expiresAt,
        },
      },
    },
  });

  if (!updatedUser) {
    return errorHandler('ERR-102', res); // Update failed
  }

  return responseHandler(
    {
      message: 'Referral code generated successfully',
      userId: updatedUser._id,
      referralCode: updatedUser.referralCode,
      fullName: updatedUser.fullName,
      userName: updatedUser.userName,
      profilePicture: updatedUser.profilePicture,
      expireAfter,
      maxUses,
      expiresAt,
      currentUses: 0,
    },
    res,
  );
});

/**
 * Get user's referral code (without generating)
 * GET /settings/referral-code
 *
 * Returns referral code with settings and status flags
 */
exports.getReferralCode = asyncHandler(async (req, res) => {
  const { userId } = req.user;

  const user = await userServices.findById({
    id: userId,
    projection: {
      referralCode: 1,
      referralSettings: 1,
      fullName: 1,
      userName: 1,
      profilePicture: 1,
    },
  });

  if (!user) {
    return errorHandler('ERR-109', res);
  }

  // If no referral code, return minimal response
  if (!user.referralCode) {
    return responseHandler(
      {
        userId: user._id,
        referralCode: null,
        fullName: user.fullName,
        userName: user.userName,
        profilePicture: user.profilePicture,
        hasReferralCode: false,
      },
      res,
    );
  }

  // Get current usage count
  const currentUses = await countReferralCodeUsage(user.referralCode);
  const settings = user.referralSettings || {};

  // Calculate status flags
  const isExpired = settings.expiresAt && new Date() > new Date(settings.expiresAt);
  const isMaxedOut = settings.maxUses && currentUses >= settings.maxUses;
  const isActive = !isExpired && !isMaxedOut;

  return responseHandler(
    {
      userId: user._id,
      referralCode: user.referralCode,
      fullName: user.fullName,
      userName: user.userName,
      profilePicture: user.profilePicture,
      hasReferralCode: true,
      expireAfter: settings.expireAfter || 'never',
      maxUses: settings.maxUses || null,
      expiresAt: settings.expiresAt || null,
      currentUses,
      isExpired,
      isMaxedOut,
      isActive,
    },
    res,
  );
});

/**
 * Apply an invite code to a user
 * POST /settings/apply-invite-code
 *
 * No authentication required - userId is passed in body
 * This allows applying invite code during signup flow
 *
 * - Validates the invite code exists (belongs to another user)
 * - Validates the code is not expired
 * - Validates the code has not reached max usage limit
 * - Saves it to the user's inviteCode field
 * - Cannot be changed once set
 */
exports.applyInviteCode = asyncHandler(async (req, res) => {
  const { userId, inviteCode } = req.value;

  // Fetch the user to check if they already have an invite code
  const currentUser = await userServices.findById({ id: userId });

  if (!currentUser) {
    return errorHandler('ERR-109', res);
  }

  // Check if user already has an invite code
  if (currentUser.inviteCode) {
    return responseHandler(
      {
        message: 'Invite code already applied',
        inviteCode: currentUser.inviteCode,
        alreadyApplied: true,
      },
      res,
    );
  }

  // Validate that the invite code belongs to another user
  const referrer = await userServices.findOne({
    filter: { referralCode: inviteCode.toUpperCase() },
    projection: {
      _id: 1,
      fullName: 1,
      userName: 1,
      referralCode: 1,
      referralSettings: 1,
    },
  });

  if (!referrer) {
    return errorHandler('ERR-143', res); // Invalid invite code
  }

  // Cannot use your own referral code
  if (referrer._id.toString() === userId.toString()) {
    return errorHandler('ERR-144', res); // Cannot use own referral code
  }

  // Check expiration
  const settings = referrer.referralSettings || {};
  if (settings.expiresAt && new Date() > new Date(settings.expiresAt)) {
    return errorHandler('ERR-145', res); // Referral code has expired
  }

  // Check max uses
  if (settings.maxUses) {
    const currentUses = await countReferralCodeUsage(referrer.referralCode);
    if (currentUses >= settings.maxUses) {
      return errorHandler('ERR-146', res); // Referral code reached max uses
    }
  }

  // Apply the invite code
  const updatedUser = await userServices.findByIdAndUpdate({
    id: userId,
    body: { $set: { inviteCode: inviteCode.toUpperCase() } },
  });

  if (!updatedUser) {
    return errorHandler('ERR-102', res);
  }

  return responseHandler(
    {
      message: 'Invite code applied successfully',
      userId: updatedUser._id,
      inviteCode: updatedUser.inviteCode,
      referredBy: {
        userId: referrer._id,
        fullName: referrer.fullName,
        userName: referrer.userName,
      },
    },
    res,
  );
});

/**
 * Get list of users who signed up using the current user's referral code
 * GET /settings/referred-users
 */
exports.getReferredUsers = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { pageNum = 1, pageSize = 20 } = req.value || {};

  const limit = Number(pageSize);
  const page = Number(pageNum);
  const skip = (page - 1) * limit;

  // First, get the current user's referral code
  const currentUser = await userServices.findById({
    id: userId,
    projection: { referralCode: 1 },
  });

  if (!currentUser) {
    return errorHandler('ERR-109', res);
  }

  // If user doesn't have a referral code, return empty list
  if (!currentUser.referralCode) {
    return responseHandler(
      {
        metadata: {
          totalDocuments: 0,
          pageNum: page,
          pageSize: limit,
          totalPages: 0,
        },
        referralCode: null,
        referredUsers: [],
      },
      res,
    );
  }

  // Query users who have this user's referral code as their inviteCode
  const query = [
    {
      $match: {
        inviteCode: currentUser.referralCode,
      },
    },
    {
      $facet: {
        users: [
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              fullName: 1,
              userName: 1,
              profilePicture: 1,
              createdAt: 1,
            },
          },
        ],
        totalCount: [
          {
            $count: 'count',
          },
        ],
      },
    },
  ];

  const result = await userServices.aggregate({ query });
  const totalCountArray = result[0] && result[0].totalCount;
  const total = (totalCountArray && totalCountArray[0] && totalCountArray[0].count) || 0;
  const referredUsers = result[0].users || [];

  return responseHandler(
    {
      metadata: {
        totalDocuments: total,
        pageNum: page,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      },
      referralCode: currentUser.referralCode,
      referredUsers,
    },
    res,
  );
});

/**
 * Update referral settings without regenerating the code
 * PUT /settings/referral-settings
 *
 * - Allows updating expireAfter and/or maxUses
 * - Recalculates expiresAt from current time when expireAfter is updated
 * - User must have an existing referral code
 */
exports.updateReferralSettings = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { expireAfter, maxUses } = req.value;

  // Fetch the user
  const user = await userServices.findById({
    id: userId,
    projection: {
      referralCode: 1,
      referralSettings: 1,
    },
  });

  if (!user) {
    return errorHandler('ERR-109', res);
  }

  // Check if user has a referral code
  if (!user.referralCode) {
    return errorHandler('ERR-147', res); // No referral code exists
  }

  const now = new Date();

  // Build update object
  const updateFields = {};

  // Update expireAfter if provided
  if (expireAfter !== undefined) {
    updateFields['referralSettings.expireAfter'] = expireAfter;
    // Recalculate expiresAt from current time
    updateFields['referralSettings.expiresAt'] = calculateExpiresAt(expireAfter, now);
    // Update createdAt to current time when expiry is changed
    updateFields['referralSettings.createdAt'] = now;
  }

  // Update maxUses if provided
  if (maxUses !== undefined) {
    updateFields['referralSettings.maxUses'] = maxUses;
  }

  // Perform the update
  const updatedUser = await userServices.findByIdAndUpdate({
    id: userId,
    body: { $set: updateFields },
  });

  if (!updatedUser) {
    return errorHandler('ERR-102', res);
  }

  // Get current usage count
  const currentUses = await countReferralCodeUsage(updatedUser.referralCode);
  const settings = updatedUser.referralSettings || {};

  return responseHandler(
    {
      message: 'Referral settings updated successfully',
      referralCode: updatedUser.referralCode,
      expireAfter: settings.expireAfter || 'never',
      maxUses: settings.maxUses || null,
      expiresAt: settings.expiresAt || null,
      currentUses,
    },
    res,
  );
});

/**
 * Get user's notification settings
 * GET /settings/notification-settings
 *
 * Returns the user's notification preferences with defaults if not set
 */
exports.getNotificationSettings = asyncHandler(async (req, res) => {
  const { userId } = req.user;

  const settings = await notificationSettingsServices.getSettingsWithDefaults({ userId });

  return responseHandler(
    {
      message: 'Notification settings retrieved successfully',
      settings: {
        messageNotifications: settings.messageNotifications,
        inAppNotifications: settings.inAppNotifications,
        lockedScreenNotifications: settings.lockedScreenNotifications,
        badgeNotifications: settings.badgeNotifications,
      },
    },
    res,
  );
});

/**
 * Update user's notification settings
 * PUT /settings/notification-settings
 *
 * Body can include any of:
 * - messageNotifications: { privateChats: boolean, publicChats: boolean }
 * - inAppNotifications: { sounds: boolean, vibrate: boolean, preview: boolean }
 * - lockedScreenNotifications: { showTopics: boolean, showNames: boolean, showMessages: boolean }
 * - badgeNotifications: { enabled: boolean }
 */
exports.updateNotificationSettings = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const updateData = req.value;

  // Build the update object with dot notation for nested fields
  const updateBody = {};

  if (updateData.messageNotifications) {
    if (typeof updateData.messageNotifications.privateChats === 'boolean') {
      updateBody['messageNotifications.privateChats'] = updateData.messageNotifications.privateChats;
    }
    if (typeof updateData.messageNotifications.publicChats === 'boolean') {
      updateBody['messageNotifications.publicChats'] = updateData.messageNotifications.publicChats;
    }
  }

  if (updateData.inAppNotifications) {
    if (typeof updateData.inAppNotifications.sounds === 'boolean') {
      updateBody['inAppNotifications.sounds'] = updateData.inAppNotifications.sounds;
    }
    if (typeof updateData.inAppNotifications.vibrate === 'boolean') {
      updateBody['inAppNotifications.vibrate'] = updateData.inAppNotifications.vibrate;
    }
    if (typeof updateData.inAppNotifications.preview === 'boolean') {
      updateBody['inAppNotifications.preview'] = updateData.inAppNotifications.preview;
    }
  }

  if (updateData.lockedScreenNotifications) {
    if (typeof updateData.lockedScreenNotifications.showTopics === 'boolean') {
      updateBody['lockedScreenNotifications.showTopics'] = updateData.lockedScreenNotifications.showTopics;
    }
    if (typeof updateData.lockedScreenNotifications.showNames === 'boolean') {
      updateBody['lockedScreenNotifications.showNames'] = updateData.lockedScreenNotifications.showNames;
    }
    if (typeof updateData.lockedScreenNotifications.showMessages === 'boolean') {
      updateBody['lockedScreenNotifications.showMessages'] = updateData.lockedScreenNotifications.showMessages;
    }
  }

  if (updateData.badgeNotifications) {
    if (typeof updateData.badgeNotifications.enabled === 'boolean') {
      updateBody['badgeNotifications.enabled'] = updateData.badgeNotifications.enabled;
    }
  }

  // Upsert the settings (create if not exists, update if exists)
  const updatedSettings = await notificationSettingsServices.upsertByUserId({
    userId,
    body: updateBody,
  });

  return responseHandler(
    {
      message: 'Notification settings updated successfully',
      settings: {
        messageNotifications: updatedSettings.messageNotifications,
        inAppNotifications: updatedSettings.inAppNotifications,
        lockedScreenNotifications: updatedSettings.lockedScreenNotifications,
        badgeNotifications: updatedSettings.badgeNotifications,
      },
    },
    res,
  );
});
