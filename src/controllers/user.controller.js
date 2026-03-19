const { v4: uuidv4 } = require('uuid');
const { default: mongoose } = require('mongoose');
const bcrypt = require('bcryptjs');
const appleSignin = require('apple-signin-auth');
const services = require('../services/userServices');
const waitlistRequestServices = require('../services/waitlistRequestServices');
const env = require('../../lib/configs/env.config');
const interestCategoryServices = require('../services/interestCategoryServices');
const interestSubCategoryServices = require('../services/interestSubCategoryServices');
const postServices = require('../services/postServices');
const likeServices = require('../services/likeServices');
const hashtagServices = require('../services/hashtagServices');
const hashtagLikeServices = require('../services/hashtagLikeServices');
const privateChatroomServices = require('../services/privateChatroomServices');
const chatroomServices = require('../services/chatroomServices');
const followServices = require('../services/followServices');
const storiesServices = require('../services/storiesServices');
const UserModel = require('../models/user.model');
const smsService = require('../services/smsService');
const emailService = require('../services/emailService');
const onboardingProgressService = require('../services/onboardingProgressService');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { errorHandler, responseHandler } = require('../../lib/helpers/responseHandler');
const { userStatus, deleteStatus, waitlistStatus } = require('../../lib/constants/userConstants');
const { logInfo } = require('../../lib/helpers/logger');
const { getIO } = require('../events/socketInstance');

// ─────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────

const generateUniqueCode = () => {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

const generateUniqueReferralCode = async () => {
  let code;
  let isUnique = false;
  let attempts = 0;
  while (!isUnique && attempts < 10) {
    code = generateUniqueCode();
    // eslint-disable-next-line no-await-in-loop
    const existing = await services.findOne({
      filter: { referralCode: code },
      projection: { _id: 1 },
    });
    if (!existing) isUnique = true;
    attempts += 1;
  }
  if (!isUnique) throw new Error('Could not generate unique referral code');
  return code;
};

/**
 * Validate invite code — shared logic used by authStepOne and the standalone endpoint.
 * Returns the referrer user if valid, or throws/returns error token.
 */
const validateInviteCodeHelper = async (inviteCode) => {
  const referrer = await services.findOne({
    filter: { referralCode: inviteCode.toUpperCase() },
    projection: { _id: 1, referralCode: 1, referralSettings: 1 },
  });
  if (!referrer) return { valid: false, error: 'ERR-143' };

  const settings = referrer.referralSettings || {};
  if (settings.expiresAt && new Date() > new Date(settings.expiresAt)) {
    return { valid: false, error: 'ERR-145' };
  }

  if (settings.maxUses) {
    const usageResult = await services.aggregate({
      query: [
        { $match: { inviteCode: referrer.referralCode } },
        { $count: 'count' },
      ],
    });
    const currentUses = (usageResult[0] && usageResult[0].count) || 0;
    if (currentUses >= settings.maxUses) {
      return { valid: false, error: 'ERR-146' };
    }
  }

  return { valid: true, referrer };
};

const hasCompletedRequiredOnboardingForLogin = async (userId) => {
  const onboardingProgress = await onboardingProgressService.findOne({
    filter: { userId },
    projection: { rulesAccepted: 1 },
  });

  if (!onboardingProgress) {
    return true;
  }

  return onboardingProgress.rulesAccepted === true;
};

exports.accountExists = asyncHandler(async (req, res) => {
  const { contacts } = req.value;
  const users = await services.find({
    filter: {
      $or: contacts.map(({ phoneNumber, countryCode }) => ({ phoneNumber, countryCode })),
    },
    projection: { _id: 1, phoneNumber: 1, countryCode: 1 },
  });

  const existingSet = new Set(
    users.map((user) => `${user.phoneNumber}:${user.countryCode}`),
  );
  const userIdByContact = new Map(
    users.map((user) => [`${user.phoneNumber}:${user.countryCode}`, user._id.toString()]),
  );

  const results = contacts.map((contact) => {
    const key = `${contact.phoneNumber}:${contact.countryCode}`;
    const exists = existingSet.has(key);
    const item = {
      phoneNumber: contact.phoneNumber,
      countryCode: contact.countryCode,
      exists,
    };
    if (exists) {
      item.userId = userIdByContact.get(key);
    }
    return item;
  });

  return responseHandler({ results }, res);
});

exports.authStepOne = asyncHandler(async (req, res) => {
  const {
    email, phoneNumber, countryCode, inviteCode,
  } = req.value;

  // Determine mode and build filter
  let filter = {};
  let mode = 'email';

  if (phoneNumber && countryCode) {
    mode = 'phone';
    filter = { phoneNumber, countryCode };
  } else if (email) {
    filter = { email };
  } else {
    return errorHandler('ERR-001', res); // Missing data
  }

  // If inviteCode is provided, validate it using shared helper
  let validatedInviteCode = null;
  if (inviteCode && inviteCode.trim()) {
    const result = await validateInviteCodeHelper(inviteCode);
    if (!result.valid) {
      return errorHandler(result.error, res);
    }
    validatedInviteCode = inviteCode.toUpperCase();
  }

  // Find or create user
  let user = await services.findOne({
    filter,
    projection: { _id: 1, status: 1, inviteCode: 1 },
  });

  if (!user) {
    // Create new user with provided identifier and invite code
    const userData = email ? { email } : { phoneNumber, countryCode };
    if (validatedInviteCode) {
      userData.inviteCode = validatedInviteCode;
    }
    user = await services.create({ body: userData });
  } else if (validatedInviteCode && !user.inviteCode) {
    // User exists but doesn't have invite code yet, apply it
    await services.findByIdAndUpdate({
      id: user._id,
      body: { $set: { inviteCode: validatedInviteCode } },
    });
  }

  if (user.status === userStatus.VERIFIED) {
    const canLogin = await hasCompletedRequiredOnboardingForLogin(user._id);
    if (canLogin) {
      return errorHandler('ERR-101', res);
    }
  }

  // Send OTP
  const otpBody = mode === 'email'
    ? { email, mode: 'email', purpose: 'auth' }
    : {
      phone: phoneNumber, countryCode, mode: 'phone', purpose: 'auth',
    };

  const otp = await services.sendOtp(otpBody);

  const message = mode === 'email'
    ? 'OTP has been sent to your email address'
    : 'OTP has been sent to your mobile number';

  return responseHandler(
    {
      identifierCode: otp.identifierCode,
      message,
      ...(validatedInviteCode && { inviteCodeApplied: validatedInviteCode }),
    },
    res,
  );
});

exports.verifyOtp = asyncHandler(async (req, res) => {
  const {
    email,
    phoneNumber,
    countryCode,
    identifierCode,
    code,
    fcmToken,
  } = req.value;

  // Determine mode and build OTP filter
  let mode = 'email';
  let otpFilter = {
    email, identifierCode, code, mode: 'email', purpose: 'auth',
  };
  let userFilter = { email };

  if (phoneNumber && countryCode) {
    mode = 'phone';
    otpFilter = {
      phone: phoneNumber, countryCode, identifierCode, code, mode: 'phone', purpose: 'auth',
    };
    userFilter = { phoneNumber, countryCode };
  }

  const otpExist = await services.verifyOtp(otpFilter);
  if (!otpExist) return errorHandler('ERR-104', res);

  // Check if user account was temporarily deleted
  const existingUser = await services.findOne({ filter: userFilter });
  const wasTemporarilyDeleted = existingUser && existingUser.deleteInfo
    && existingUser.deleteInfo.status === deleteStatus.TEMPORARY;

  // Update user with fcmToken and verification status
  const updateData = {
    $set: {
      trackingCode: uuidv4(),
    },
  };

  // Set verification status based on mode
  if (mode === 'email') {
    updateData.$set.emailVerified = true;
  } else {
    updateData.$set.phoneVerified = true;
  }

  if (fcmToken !== null) {
    updateData.$set.fcmToken = fcmToken;
  } else {
    updateData.$unset = { fcmToken: '' };
  }

  // If account was temporarily deleted, restore it
  if (wasTemporarilyDeleted) {
    updateData.$set['deleteInfo.status'] = deleteStatus.NONE;
    updateData.$set['deleteInfo.restoredAt'] = new Date();
    updateData.$set.active = true;
  }

  const user = await services.findOneAndUpdate({
    filter: userFilter,
    body: updateData,
  });

  logInfo(user);
  if (!user) return errorHandler('ERR-102', res);

  const {
    _id: userId,
    fullName,
    userName,
    profilePicture,
    fullLocation,
    email: userEmail,
    phoneNumber: userPhone,
  } = user;

  if (user.status === userStatus.VERIFIED) {
    const canLogin = await hasCompletedRequiredOnboardingForLogin(userId);
    if (canLogin) {
      return responseHandler(
        {
          userId,
          fullName,
          userName,
          profilePicture,
          fullLocation,
          email: userEmail,
          phoneNumber: userPhone,
          accessToken: user.generateAccessToken(),
          status: user.status,
          accountRestored: wasTemporarilyDeleted,
        },
        res,
      );
    }
  }

  const onboardingProgress = await onboardingProgressService.findOne({
    filter: { userId },
  });

  const onboardingDetails = onboardingProgress
    ? {
      userId: onboardingProgress.userId,
      nameAdded: onboardingProgress.nameAdded,
      userNameAdded: onboardingProgress.userNameAdded,
      dobAdded: onboardingProgress.dobAdded,
      profilePhotoAdded: onboardingProgress.profilePhotoAdded,
      descriptionAdded: onboardingProgress.descriptionAdded,
      interestsAdded: onboardingProgress.interestsAdded,
      rulesAccepted: onboardingProgress.rulesAccepted,
    }
    : {
      userId,
      nameAdded: false,
      userNameAdded: false,
      dobAdded: false,
      profilePhotoAdded: false,
      descriptionAdded: false,
      interestsAdded: false,
      rulesAccepted: false,
    };
  const freshUser = !(
    onboardingDetails.descriptionAdded
    || onboardingDetails.dobAdded
    || onboardingDetails.interestsAdded
    || onboardingDetails.nameAdded
    || onboardingDetails.profilePhotoAdded
    || onboardingDetails.userNameAdded
  );

  return responseHandler(
    {
      userId,
      trackingCode: user.trackingCode,
      status: user.status,
      accessToken: user.generateAccessToken(),
      freshUser,
      onboardingDetails,
    },
    res,
  );
});

exports.authStepTwo = asyncHandler(async (req, res) => {
  const {
    userId, trackingCode, fullName, dateOfBirth, userName,
  } = req.value;

  // First, check if user exists and get current state
  const user = await services.findById({ id: userId });
  if (!user) return errorHandler('ERR-109', res);

  // Check if already verified
  if (user.status === userStatus.VERIFIED) {
    return errorHandler('ERR-101', res); // Already verified
  }

  // Check if trackingCode matches
  if (user.trackingCode !== trackingCode) {
    logInfo(`Tracking code mismatch for user ${userId}. Expected: ${user.trackingCode}, Got: ${trackingCode}`);
    return errorHandler('ERR-102', res);
  }

  // Check if phone or email is verified
  if (!user.emailVerified && !user.phoneVerified) {
    logInfo(`User ${userId} has not verified email or phone`);
    return errorHandler('ERR-102', res);
  }

  const filter = {
    _id: userId,
    trackingCode,
    $or: [{ emailVerified: true }, { phoneVerified: true }],
    status: { $ne: userStatus.VERIFIED },
  };
  // Preserve existing fullName/userName when not sent (e.g. returning user sending only dateOfBirth)
  const body = { status: userStatus.INFO_ADDED };
  const setFullName = (fullName !== undefined && fullName !== null && String(fullName).trim() !== '')
    ? fullName.trim()
    : (user.fullName && String(user.fullName).trim());
  const setUserName = (userName !== undefined && userName !== null && String(userName).trim() !== '')
    ? userName.trim()
    : (user.userName && String(user.userName).trim());
  if (setFullName) body.fullName = setFullName;
  if (setUserName) body.userName = setUserName;
  if (dateOfBirth !== undefined) {
    body.dateOfBirth = dateOfBirth;
  }
  const updatedUser = await services.findOneAndUpdate({
    filter,
    body,
  });
  if (!updatedUser) {
    logInfo(`Failed to update user ${userId} in authStepTwo. Filter: ${JSON.stringify(filter)}`);
    return errorHandler('ERR-102', res);
  }
  const { _id: updatedUserId } = updatedUser;
  return responseHandler(
    {
      userId: updatedUserId,
      trackingCode: updatedUser.trackingCode,
      status: updatedUser.status,
    },
    res,
  );
});

exports.authStepThree = asyncHandler(async (req, res) => {
  const {
    userId, trackingCode, coordinates, profilePicture, description, fullLocation,
  } = req.value;

  // First, check if user exists and get current state
  const user = await services.findById({ id: userId });
  if (!user) return errorHandler('ERR-109', res);

  // Check if already verified
  if (user.status === userStatus.VERIFIED) {
    return errorHandler('ERR-101', res); // Already verified
  }

  // Check if trackingCode matches
  if (user.trackingCode !== trackingCode) {
    logInfo(`Tracking code mismatch for user ${userId}. Expected: ${user.trackingCode}, Got: ${trackingCode}`);
    return errorHandler('ERR-102', res);
  }

  // Check if phone or email is verified
  if (!user.emailVerified && !user.phoneVerified) {
    logInfo(`User ${userId} has not verified email or phone`);
    return errorHandler('ERR-102', res);
  }

  const filter = {
    _id: userId,
    trackingCode,
    $or: [{ emailVerified: true }, { phoneVerified: true }],
    status: { $ne: userStatus.VERIFIED },
  };
  const body = {
    status: userStatus.VERIFIED,
    onboarding: false,
  };
  if (profilePicture !== undefined && profilePicture !== null && String(profilePicture).trim() !== '') {
    body.profilePicture = profilePicture.trim();
  } else if (user.profilePicture) {
    body.profilePicture = user.profilePicture;
  }
  if (description !== undefined && description !== null) {
    body.description = typeof description === 'string' ? description.trim() : description;
  } else if (user.description) {
    body.description = user.description;
  }
  if (coordinates && coordinates.length === 2) {
    body.fullLocation = fullLocation || null;
    body.location = { type: 'Point', coordinates };
  } else if (fullLocation !== undefined && fullLocation !== null && String(fullLocation).trim() !== '') {
    body.fullLocation = fullLocation.trim();
  } else if (user.fullLocation) {
    body.fullLocation = user.fullLocation;
  }

  const updatedUser = await services.findOneAndUpdate({
    filter,
    body,
  });
  if (!updatedUser) {
    logInfo(`Failed to update user ${userId} in authStepThree. Filter: ${JSON.stringify(filter)}`);
    return errorHandler('ERR-102', res);
  }

  // Auto-generate referral code so new user can immediately invite friends
  const { referralCode: existingReferralCode } = updatedUser;
  let referralCode = existingReferralCode;
  if (!referralCode) {
    try {
      referralCode = await generateUniqueReferralCode();
      await services.findByIdAndUpdate({
        id: updatedUser._id,
        body: {
          $set: {
            referralCode,
            referralSettings: {
              expireAfter: 'never',
              maxUses: null,
              createdAt: new Date(),
              expiresAt: null,
            },
          },
        },
      });
    } catch (e) {
      logInfo(`Failed to auto-generate referral code for user ${userId}: ${e.message}`);
      referralCode = null;
    }
  }

  const { _id: updatedUserId } = updatedUser;
  const onboardingProgress = await onboardingProgressService.findOne({
    filter: { userId: updatedUserId },
  });
  const onboardingDetails = onboardingProgress
    ? {
      userId: onboardingProgress.userId,
      nameAdded: onboardingProgress.nameAdded,
      userNameAdded: onboardingProgress.userNameAdded,
      dobAdded: onboardingProgress.dobAdded,
      profilePhotoAdded: onboardingProgress.profilePhotoAdded,
      descriptionAdded: onboardingProgress.descriptionAdded,
      interestsAdded: onboardingProgress.interestsAdded,
      rulesAccepted: onboardingProgress.rulesAccepted,
    }
    : {
      userId: updatedUserId,
      nameAdded: !!updatedUser.fullName,
      userNameAdded: !!updatedUser.userName,
      dobAdded: !!updatedUser.dateOfBirth,
      profilePhotoAdded: !!updatedUser.profilePicture,
      descriptionAdded: !!updatedUser.description,
      interestsAdded: Array.isArray(updatedUser.interestSubCategories)
        && updatedUser.interestSubCategories.length > 0,
      rulesAccepted: !!updatedUser.rulesAcceptedAt,
    };
  return responseHandler(
    {
      userId: updatedUserId,
      status: updatedUser.status,
      accessToken: updatedUser.generateAccessToken(),
      fullName: updatedUser.fullName,
      userName: updatedUser.userName,
      profilePicture: updatedUser.profilePicture || profilePicture || null,
      fullLocation: updatedUser.fullLocation || fullLocation || null,
      email: updatedUser.email || null,
      phoneNumber: updatedUser.phoneNumber || null,
      countryCode: updatedUser.countryCode || null,
      referralCode: referralCode || null,
      onboarding: false,
      description: updatedUser.description || null,
      userDetails: {
        userId: updatedUserId,
        status: updatedUser.status,
        fullName: updatedUser.fullName,
        userName: updatedUser.userName,
        profilePicture: updatedUser.profilePicture || profilePicture || null,
        fullLocation: updatedUser.fullLocation || fullLocation || null,
        email: updatedUser.email || null,
        phoneNumber: updatedUser.phoneNumber || null,
        countryCode: updatedUser.countryCode || null,
        referralCode: referralCode || null,
        onboarding: false,
        description: updatedUser.description || null,
      },
      onboardingDetails,
    },
    res,
  );
});

/**
 * GET stage-four: returns what to ask (email or phone) based on what is missing in DB.
 * Query: userId, trackingCode.
 */
exports.getStageFourPrompt = asyncHandler(async (req, res) => {
  const { userId, trackingCode } = req.value;

  const user = await services.findById({ id: userId });
  if (!user) return errorHandler('ERR-109', res);
  if (user.status === userStatus.VERIFIED) return errorHandler('ERR-101', res);
  if (user.trackingCode !== trackingCode) {
    logInfo(`Tracking code mismatch for user ${userId}`);
    return errorHandler('ERR-102', res);
  }
  if (!user.fullName || !user.userName) {
    return errorHandler('ERR-112', res);
  }

  const hasEmail = !!(user.email && String(user.email).trim());
  const hasPhone = !!(user.phoneNumber && user.countryCode
    && String(user.phoneNumber).trim() && String(user.countryCode).trim());

  if (hasEmail && hasPhone) {
    return responseHandler(
      {
        askFor: null,
        needsEmail: false,
        needsPhone: false,
        complete: true,
        message: 'Both email and phone are present; nothing to ask',
      },
      res,
    );
  }
  if (hasEmail && !hasPhone) {
    return responseHandler(
      {
        askFor: 'phone',
        needsEmail: false,
        needsPhone: true,
        complete: false,
        message: 'Ask for phone number (email is already present)',
      },
      res,
    );
  }
  if (!hasEmail && hasPhone) {
    return responseHandler(
      {
        askFor: 'email',
        needsEmail: true,
        needsPhone: false,
        complete: false,
        message: 'Ask for email (phone is already present)',
      },
      res,
    );
  }
  // Neither email nor phone (edge case)
  return responseHandler(
    {
      askFor: null,
      needsEmail: true,
      needsPhone: true,
      complete: false,
      message: 'Neither email nor phone present',
    },
    res,
  );
});

/**
 * Stage-four: optional secondary contact.
 * - If user signed up with phone → optionally add & verify email.
 * - If user signed up with email → optionally add & verify phone.
 * - If no value provided (or empty), step is skipped and success is returned.
 */
exports.authStepFour = asyncHandler(async (req, res) => {
  const {
    userId, trackingCode, email, phoneNumber, countryCode,
  } = req.value;

  const user = await services.findById({ id: userId });
  if (!user) return errorHandler('ERR-109', res);
  if (user.status === userStatus.VERIFIED) return errorHandler('ERR-101', res);
  if (user.trackingCode !== trackingCode) {
    logInfo(`Tracking code mismatch for user ${userId}`);
    return errorHandler('ERR-102', res);
  }
  if (!user.emailVerified && !user.phoneVerified) {
    return errorHandler('ERR-102', res);
  }
  if (!user.fullName || !user.userName) {
    return errorHandler('ERR-112', res);
  }

  const emailProvided = email && String(email).trim() !== '';
  const phoneProvided = phoneNumber && String(phoneNumber).trim() !== '' && countryCode && String(countryCode).trim() !== '';

  // Skip: no secondary contact provided
  if (!emailProvided && !phoneProvided) {
    return responseHandler(
      {
        userId: user._id,
        trackingCode: user.trackingCode,
        skipped: true,
        message: 'Secondary contact step skipped',
      },
      res,
    );
  }

  // Provide only one: email OR phone, not both
  if (emailProvided && phoneProvided) {
    return responseHandler(
      { error: true, message: 'Provide either email or phone, not both' },
      res,
      400,
    );
  }

  // Determine what user already has
  const hasEmail = !!(user.email && String(user.email).trim());
  const hasPhone = !!(user.phoneNumber && user.countryCode);

  // If user already has both, nothing to add
  if (hasEmail && hasPhone) {
    return responseHandler(
      { error: true, message: 'Both email and phone are already present' },
      res,
      400,
    );
  }

  // User has email → must provide phone (not email)
  if (hasEmail && emailProvided) {
    return responseHandler(
      { error: true, message: 'You already have an email. Please provide phone number instead.' },
      res,
      400,
    );
  }

  // User has phone → must provide email (not phone)
  if (hasPhone && phoneProvided) {
    return responseHandler(
      { error: true, message: 'You already have a phone number. Please provide email instead.' },
      res,
      400,
    );
  }

  // User has email but didn't provide phone
  if (hasEmail && !phoneProvided) {
    return responseHandler(
      { error: true, message: 'You already have an email. Please provide phoneNumber and countryCode.' },
      res,
      400,
    );
  }

  // User has phone but didn't provide email
  if (hasPhone && !emailProvided) {
    return responseHandler(
      { error: true, message: 'You already have a phone number. Please provide email.' },
      res,
      400,
    );
  }

  // Check secondary contact is not already used by another user
  if (emailProvided) {
    const existing = await services.findOne({
      filter: { email: email.trim() },
      projection: { _id: 1 },
    });
    if (existing && !existing._id.equals(userId)) {
      return errorHandler('ERR-001', res); // Email already in use
    }
  } else {
    const existing = await services.findOne({
      filter: { phoneNumber: phoneNumber.trim(), countryCode: countryCode.trim() },
      projection: { _id: 1 },
    });
    if (existing && !existing._id.equals(userId)) {
      return errorHandler('ERR-001', res); // Phone already in use
    }
  }

  const purpose = 'secondaryContact';
  const otpBody = emailProvided
    ? { email: email.trim(), mode: 'email', purpose }
    : {
      phone: phoneNumber.trim(), countryCode: countryCode.trim(), mode: 'phone', purpose,
    };

  const otp = await services.sendOtp(otpBody);

  const message = emailProvided
    ? 'OTP has been sent to your email address'
    : 'OTP has been sent to your mobile number';

  return responseHandler(
    {
      identifierCode: otp.identifierCode,
      message,
    },
    res,
  );
});

/**
 * Verify OTP for stage-four (secondary contact) and save email/phone on user.
 */
exports.authStepFourVerifyOtp = asyncHandler(async (req, res) => {
  const {
    userId, trackingCode, identifierCode, code, email, phoneNumber, countryCode,
  } = req.value;

  const user = await services.findById({ id: userId });
  if (!user) return errorHandler('ERR-109', res);
  if (user.status === userStatus.VERIFIED) return errorHandler('ERR-101', res);
  if (user.trackingCode !== trackingCode) {
    logInfo(`Tracking code mismatch for user ${userId}`);
    return errorHandler('ERR-102', res);
  }

  const mode = email ? 'email' : 'phone';
  const otpFilter = email
    ? {
      email, identifierCode, code, mode, purpose: 'secondaryContact',
    }
    : {
      phone: phoneNumber, countryCode, identifierCode, code, mode, purpose: 'secondaryContact',
    };

  const otpValid = await services.verifyOtp(otpFilter);
  if (!otpValid) return errorHandler('ERR-104', res);

  const updateData = {};
  if (mode === 'email') {
    updateData.email = email;
    updateData.emailVerified = true;
  } else {
    updateData.phoneNumber = phoneNumber;
    updateData.countryCode = countryCode;
    updateData.phoneVerified = true;
  }

  const updatedUser = await services.findByIdAndUpdate({
    id: userId,
    body: { $set: updateData },
  });

  if (!updatedUser) return errorHandler('ERR-102', res);

  return responseHandler(
    {
      userId: updatedUser._id,
      trackingCode: updatedUser.trackingCode,
      ...(mode === 'email' ? { email: updatedUser.email } : { phoneNumber: updatedUser.phoneNumber, countryCode: updatedUser.countryCode }),
      message: 'Secondary contact verified successfully',
    },
    res,
  );
});

exports.googleAuth = asyncHandler(async (req, res) => {
  const {
    email, name, photo, fcmToken,
  } = req.value;
  const user = await services.findOne({
    filter: { email },
  });

  // if user does not exist, create a new user
  if (!user) {
    const newUser = await services.create({
      body: {
        email,
        status: userStatus.CREATED,
        trackingCode: uuidv4(),
        fullName: name,
        emailVerified: true,
        mode: 'google',
        profilePicture: photo,
        fcmToken,
      },
    });
    if (!newUser) return errorHandler('ERR-102', res);
    const accessToken = newUser.generateAccessToken();
    return responseHandler(
      {
        userId: newUser._id,
        fullName: newUser.fullName,
        profilePicture: newUser.profilePicture,
        email: newUser.email,
        accessToken,
        status: newUser.status,
        reqType: 'signup',
      },
      res,
    );
  }

  // Check if account was temporarily deleted - restore it
  const wasTemporarilyDeleted = user.deleteInfo
    && user.deleteInfo.status === deleteStatus.TEMPORARY;

  // if user exists, update the user with the new fcmToken
  const updateBody = {
    $set: {
      fcmToken: fcmToken || null,
    },
  };

  // Restore temporarily deleted account
  if (wasTemporarilyDeleted) {
    updateBody.$set['deleteInfo.status'] = deleteStatus.NONE;
    updateBody.$set['deleteInfo.restoredAt'] = new Date();
    updateBody.$set.active = true;
  }

  const updatedUser = await services.findOneAndUpdate({
    filter: { _id: user._id },
    body: updateBody,
  });
  if (!updatedUser) return errorHandler('ERR-102', res);
  const accessToken = updatedUser.generateAccessToken();
  return responseHandler(
    {
      userId: updatedUser._id,
      fullName: updatedUser.fullName,
      userName: updatedUser.userName,
      profilePicture: updatedUser.profilePicture,
      email: updatedUser.email,
      accessToken,
      status: updatedUser.status,
      reqType: 'signin',
      accountRestored: wasTemporarilyDeleted,
    },
    res,
  );
});

exports.appleAuth = asyncHandler(async (req, res) => {
  const {
    identityToken,
    appleUserId,
    fullName,
    email,
    fcmToken,
  } = req.value;

  // Verify identity token with Apple
  let applePayload;
  try {
    applePayload = await appleSignin.verifyIdToken(identityToken, {
      audience: 'com.openone.talkhub',
      ignoreExpiration: false,
    });
  } catch (err) {
    logInfo(`Apple token verification failed: ${err.message}`);
    return errorHandler('ERR-003', res);
  }

  // Ensure token subject matches the appleUserId from the client
  if (applePayload.sub !== appleUserId) {
    logInfo(`Apple token sub mismatch: ${applePayload.sub} !== ${appleUserId}`);
    return errorHandler('ERR-003', res);
  }

  const appleEmail = email || applePayload.email || null;

  // Look up user by appleUserId first, then fall back to email
  let user = await services.findOne({ filter: { appleUserId } });

  if (!user && appleEmail) {
    user = await services.findOne({ filter: { email: appleEmail } });
  }

  if (!user) {
    // New user — Apple only sends name/email on first sign-in
    const newUser = await services.create({
      body: {
        appleUserId,
        email: appleEmail,
        fullName: fullName || 'Apple User',
        emailVerified: !!appleEmail,
        status: userStatus.CREATED,
        trackingCode: uuidv4(),
        mode: 'apple',
        fcmToken: fcmToken || null,
      },
    });
    if (!newUser) return errorHandler('ERR-102', res);

    const accessToken = newUser.generateAccessToken();
    return responseHandler(
      {
        userId: newUser._id,
        fullName: newUser.fullName,
        profilePicture: newUser.profilePicture || null,
        email: newUser.email,
        accessToken,
        status: newUser.status,
        reqType: 'signup',
      },
      res,
    );
  }

  // Existing user — update fcmToken + appleUserId if not set yet
  const wasTemporarilyDeleted = user.deleteInfo
    && user.deleteInfo.status === deleteStatus.TEMPORARY;

  const updateBody = {
    $set: {
      fcmToken: fcmToken || null,
    },
  };

  if (!user.appleUserId) {
    updateBody.$set.appleUserId = appleUserId;
  }

  if (wasTemporarilyDeleted) {
    updateBody.$set['deleteInfo.status'] = deleteStatus.NONE;
    updateBody.$set['deleteInfo.restoredAt'] = new Date();
    updateBody.$set.active = true;
  }

  const updatedUser = await services.findOneAndUpdate({
    filter: { _id: user._id },
    body: updateBody,
  });
  if (!updatedUser) return errorHandler('ERR-102', res);

  const accessToken = updatedUser.generateAccessToken();
  return responseHandler(
    {
      userId: updatedUser._id,
      fullName: updatedUser.fullName,
      userName: updatedUser.userName,
      profilePicture: updatedUser.profilePicture,
      email: updatedUser.email,
      accessToken,
      status: updatedUser.status,
      reqType: 'signin',
      accountRestored: wasTemporarilyDeleted,
    },
    res,
  );
});

exports.login = asyncHandler(async (req, res) => {
  const { email, phoneNumber, countryCode } = req.value;

  // Determine mode and build filter
  let filter = {};
  let mode = 'email';

  if (phoneNumber && countryCode) {
    mode = 'phone';
    filter = { phoneNumber, countryCode };
  } else if (email) {
    filter = { email };
  } else {
    return errorHandler('ERR-001', res); // Missing data
  }

  const user = await services.findOne({
    filter,
    projection: {
      _id: 1,
      status: 1,
      emailVerified: 1,
      phoneVerified: 1,
      fullName: 1,
      userName: 1,
      phoneNumber: 1,
      countryCode: 1,
    },
  });

  if (!user) return errorHandler('ERR-109', res);

  // Check if user is verified (either status is verified OR has verified contact and basic profile)
  const isVerified = user.status === userStatus.VERIFIED
    || ((user.emailVerified || user.phoneVerified) && user.fullName && user.userName);

  if (!isVerified) {
    // Check what's missing
    if (!user.emailVerified && !user.phoneVerified) {
      return errorHandler('ERR-112', res); // Not verified
    }
    if (!user.fullName || !user.userName) {
      return errorHandler('ERR-112', res); // Profile incomplete
    }
    return errorHandler('ERR-112', res); // Generic incomplete signup
  }

  const canLogin = await hasCompletedRequiredOnboardingForLogin(user._id);
  if (!canLogin) {
    return errorHandler('ERR-112', res);
  }

  // Send OTP
  const otpBody = mode === 'email'
    ? {
      email,
      mode: 'email',
      purpose: 'auth',
      // If user already has phone saved, also send same OTP via SMS
      ...(user.phoneNumber && user.countryCode
        ? { alsoSendPhone: user.phoneNumber, alsoSendCountryCode: user.countryCode }
        : {}),
    }
    : {
      phone: phoneNumber, countryCode, mode: 'phone', purpose: 'auth',
    };

  const otp = await services.sendOtp(otpBody);

  const message = mode === 'email'
    ? 'OTP has been sent to your email address'
    : 'OTP has been sent to your mobile number';

  return responseHandler(
    {
      identifierCode: otp.identifierCode,
      message,
    },
    res,
  );
});

exports.continueAuth = asyncHandler(async (req, res) => {
  const { email } = req.value;

  const user = await services.findOne({
    filter: { email },
  });

  if (!user) {
    return errorHandler('ERR-109', res);
  }

  if (user.status !== userStatus.VERIFIED) {
    return errorHandler('ERR-112', res);
  }

  const canLogin = await hasCompletedRequiredOnboardingForLogin(user._id);
  if (!canLogin) {
    return errorHandler('ERR-112', res);
  }

  // Check if account was temporarily deleted - restore it
  const wasTemporarilyDeleted = user.deleteInfo
    && user.deleteInfo.status === deleteStatus.TEMPORARY;

  if (wasTemporarilyDeleted) {
    await services.findByIdAndUpdate({
      id: user._id,
      body: {
        $set: {
          'deleteInfo.status': deleteStatus.NONE,
          'deleteInfo.restoredAt': new Date(),
          active: true,
        },
      },
    });
  }

  const accessToken = user.generateAccessToken();

  return responseHandler(
    {
      userId: user._id,
      fullName: user.fullName,
      userName: user.userName,
      fullLocation: user.fullLocation,
      email: user.email,
      accessToken,
      status: user.status,
      accountRestored: wasTemporarilyDeleted,
    },
    res,
  );
});

exports.addInterest = asyncHandler(async (req, res) => {
  const { categoryId } = req.value; // from params (interestCategoryId)
  const { userId } = req.user;

  // Ensure interest category exists & is active
  const category = await interestCategoryServices.findById({ id: categoryId });
  if (!category || !category.isActive) {
    return errorHandler('ERR-136', res);
  }

  // Fetch user to check if interest already exists
  const user = await services.findById({ id: userId });

  if (!user) {
    return errorHandler('ERR-102', res);
  }

  const alreadyFollowing = Array.isArray(user.interestCategories)
    && user.interestCategories.some((id) => id.toString() === categoryId);

  const updateBody = alreadyFollowing
    ? { $pull: { interestCategories: categoryId } }
    : { $addToSet: { interestCategories: categoryId } };

  const updatedUser = await services.findByIdAndUpdate({
    id: userId,
    body: updateBody,
  });

  if (!updatedUser) {
    return errorHandler('ERR-102', res);
  }

  return responseHandler(
    {
      message: alreadyFollowing
        ? 'Interest category removed successfully'
        : 'Interest category added successfully',
      interestCategories: updatedUser.interestCategories,
    },
    res,
  );
});

exports.followInterestSubCategory = asyncHandler(async (req, res) => {
  const { subCategoryId } = req.value; // from params
  const { userId } = req.user;

  // Ensure interest subcategory exists & is active
  const subCategory = await interestSubCategoryServices.findById({ id: subCategoryId });
  if (!subCategory || !subCategory.isActive) {
    return errorHandler('ERR-137', res);
  }

  const updatedUser = await services.findByIdAndUpdate({
    id: userId,
    body: { $addToSet: { interestSubCategories: subCategoryId } },
  });

  if (!updatedUser) {
    return errorHandler('ERR-102', res);
  }

  return responseHandler(
    {
      message: 'Interest subcategory followed successfully',
      interestSubCategories: updatedUser.interestSubCategories,
    },
    res,
  );
});

exports.unfollowInterestSubCategory = asyncHandler(async (req, res) => {
  const { subCategoryId } = req.value; // from params
  const { userId } = req.user;

  // Ensure interest subcategory exists (active check optional for unfollow, but keep consistent)
  const subCategory = await interestSubCategoryServices.findById({ id: subCategoryId });
  if (!subCategory) {
    return errorHandler('ERR-137', res);
  }

  const updatedUser = await services.findByIdAndUpdate({
    id: userId,
    body: { $pull: { interestSubCategories: subCategoryId } },
  });

  if (!updatedUser) {
    return errorHandler('ERR-102', res);
  }

  return responseHandler(
    {
      message: 'Interest subcategory unfollowed successfully',
      interestSubCategories: updatedUser.interestSubCategories,
    },
    res,
  );
});

exports.getUserInterestCategories = asyncHandler(async (req, res) => {
  const { userId } = req.user;

  const user = await services.findOne({
    filter: { _id: userId },
    projection: { interestCategories: 1, interestSubCategories: 1 },
  });

  if (!user) {
    return errorHandler('ERR-102', res);
  }

  let ids = user.interestCategories || [];

  // Derive category IDs from subcategories when interestCategories is empty
  if (!ids.length && Array.isArray(user.interestSubCategories) && user.interestSubCategories.length > 0) {
    const subCatDocs = await interestSubCategoryServices.find({
      filter: { _id: { $in: user.interestSubCategories }, isActive: true },
      projection: { categoryId: 1 },
    });
    const derivedSet = new Set(subCatDocs.map((sc) => sc.categoryId.toString()));
    ids = [...derivedSet];
  }

  if (!ids.length) {
    return responseHandler([], res);
  }

  const categories = await interestCategoryServices.find({
    filter: { _id: { $in: ids }, isActive: true },
    sort: { order: 1, name: 1 },
  });

  return responseHandler(categories, res);
});

// ... rest of file unchanged ...

exports.resendOtp = asyncHandler(async (req, res) => {
  const { email, phoneNumber, countryCode } = req.value;

  // Determine mode and build filter
  let filter = {};
  let mode = 'email';

  if (phoneNumber && countryCode) {
    mode = 'phone';
    filter = { phoneNumber, countryCode };
  } else if (email) {
    filter = { email };
  } else {
    return errorHandler('ERR-001', res); // Missing data
  }

  const user = await services.findOne({
    filter,
    projection: {
      _id: 1,
      status: 1,
      phoneNumber: 1,
      countryCode: 1,
    },
  });

  if (!user) return errorHandler('ERR-109', res);

  // Send OTP
  const otpBody = mode === 'email'
    ? {
      email,
      mode: 'email',
      purpose: 'auth',
      ...(user.phoneNumber && user.countryCode
        ? { alsoSendPhone: user.phoneNumber, alsoSendCountryCode: user.countryCode }
        : {}),
    }
    : {
      phone: phoneNumber, countryCode, mode: 'phone', purpose: 'auth',
    };

  const otp = await services.sendOtp(otpBody);

  const message = mode === 'email'
    ? 'OTP has been resent to your email address'
    : 'OTP has been resent to your mobile number';

  return responseHandler(
    {
      identifierCode: otp.identifierCode,
      message,
    },
    res,
  );
});

exports.oauthSuccess = asyncHandler(async (req, res) => {
  const { user } = req;
  if (!user) {
    return errorHandler('ERR-113', res);
  }

  const { _id: userId } = user;
  if (user.status === userStatus.VERIFIED) {
    // return responseHandler(
    //   {
    //     userId,
    //     accessToken: user.generateAccessToken(),
    //     status: user.status,
    //   },
    //   res,
    // );
    return res.redirect(
      `myapp://auth?userId=${userId}&accessToken=${user.generateAccessToken()}&status=${user.status}`,
    );
  }
  // return responseHandler(
  //   {
  //     userId,
  //     trackingCode: user.trackingCode,
  //     status: user.status,
  //   },
  //   res,
  // );
  return res.redirect(
    `myapp://auth?userId=${userId}&trackingCode=${user.trackingCode}&status=${user.status}`,
  );
});

exports.userLocation = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.user;
    const result = await services.findOne({
      filter: { _id: userId },
      projection: { location: 1, fullLocation: 1 },
    });
    if (!result) return errorHandler('ERR-102', res);
    return responseHandler(result, res);
  } catch (error) {
    return errorHandler('ERR-102', res);
  }
});

exports.userNameSuggBasedOnFullName = asyncHandler(async (req, res) => {
  const { fullName } = req.value;
  const suggestions = services.generateUsernameSuggestions(fullName);
  try {
    const existingUsers = await services.find({
      filter: { userName: { $in: suggestions } },
    });

    const existingUsernames = new Set(existingUsers.map((user) => user.userName));

    const availableSuggestions = suggestions.filter(
      (username) => !existingUsernames.has(username),
    );

    const limitedSuggestions = availableSuggestions.slice(0, 5);
    const data = { suggestions: limitedSuggestions };
    if (limitedSuggestions.length > 0) {
      return responseHandler(data, res);
    }
  } catch (error) {
    return errorHandler('ERR-006', res);
  }
  return responseHandler('Try another username', res);
});

exports.userNameSuggestions = asyncHandler(async (req, res) => {
  const { userName } = req.value;
  const trimmedUserName = userName.slice(1);
  const existingUser = await services.findOne({ filter: { userName: `@${trimmedUserName}` } });
  const suggestions = services.generateUsernameSuggestions(trimmedUserName);
  try {
    const existingUsers = await services.find({
      filter: { userName: { $in: suggestions } },
    });

    const existingUsernames = new Set(existingUsers.map((user) => user.userName));

    const availableSuggestions = suggestions.filter(
      (username) => !existingUsernames.has(username),
    );

    const limitedSuggestions = availableSuggestions.slice(0, 5);
    const data = { suggestions: limitedSuggestions, isUsed: false };
    if (existingUser) {
      data.isUsed = true;
    }
    if (limitedSuggestions.length > 0) {
      return responseHandler(data, res);
    }
  } catch (error) {
    return errorHandler('ERR-006', res);
  }
  return responseHandler('Try another username', res);
});

exports.blockUser = asyncHandler(async (req, res) => {
  const { userId } = req.value;
  const id = req.user.userId;
  const blockedUserId = new mongoose.Types.ObjectId(userId);
  const blockingUserId = new mongoose.Types.ObjectId(id);
  if (blockedUserId.equals(blockingUserId)) {
    return errorHandler('ERR-125', res);
  }
  const blockUser = await services.findById({ id: blockedUserId });

  if (!blockUser) {
    return errorHandler('ERR-109', res);
  }
  const isAlreadyBlocked = await services.findOne({
    filter: {
      _id: blockingUserId,
      'blockedUsers.userId': blockedUserId,
    },
  });

  if (isAlreadyBlocked) {
    return errorHandler('ERR-124', res);
  }

  // Remove follow relationships both ways (block should remove from followers/following)
  const [iFollowThem, theyFollowMe] = await Promise.all([
    followServices.findOne({ filter: { followerId: blockingUserId, followingId: blockedUserId } }),
    followServices.findOne({ filter: { followerId: blockedUserId, followingId: blockingUserId } }),
  ]);

  const incForBlockingUser = { followers: 0, following: 0 };
  const incForBlockedUser = { followers: 0, following: 0 };

  if (iFollowThem) {
    await followServices.findOneAndDelete({ filter: { followerId: blockingUserId, followingId: blockedUserId } });
    incForBlockingUser.following -= 1;
    incForBlockedUser.followers -= 1;
  }

  if (theyFollowMe) {
    await followServices.findOneAndDelete({ filter: { followerId: blockedUserId, followingId: blockingUserId } });
    incForBlockingUser.followers -= 1;
    incForBlockedUser.following -= 1;
  }

  if (incForBlockingUser.followers || incForBlockingUser.following) {
    await services.findByIdAndUpdate({
      id: blockingUserId,
      body: { $inc: incForBlockingUser },
    });
  }

  if (incForBlockedUser.followers || incForBlockedUser.following) {
    await services.findByIdAndUpdate({
      id: blockedUserId,
      body: { $inc: incForBlockedUser },
    });
  }

  const blockedUserData = {
    userId: blockedUserId,
  };

  const postIds = await postServices.find({
    filter: {
      userId: blockedUserId,
    },
    projection: {
      _id: 1,
    },
  });
  const postIdArray = postIds.map((post) => post._id);

  await likeServices.deleteMany({
    filter: {
      postId: { $in: postIdArray },
      userId: blockingUserId,
    },
  });
  const hashtagIds = await hashtagServices.find({
    filter: { creatorId: blockedUserId },
    projection: { _id: 1 },
  });
  const hashtagIdArray = hashtagIds.map((hashtag) => hashtag._id);

  await hashtagLikeServices.deleteMany({
    filter: {
      hashtagId: { $in: hashtagIdArray },
      userId: blockingUserId,
    },
  });
  await services.findByIdAndUpdate({
    id: blockingUserId,
    body: {
      $push: { blockedUsers: blockedUserData },
    },
  });

  await privateChatroomServices.findOneAndUpdate(
    {
      filter: {
        participants: {
          $all: [
            { userId: blockedUserId },
            { userId: blockingUserId },
          ],
        },
        isGroupChat: false,
      },
      body: {
        $set: {
          isBlocked: true,
        },
      },
    },
  );
  return responseHandler('user blocked successfully', res);
});

exports.unblockUser = asyncHandler(async (req, res) => {
  const { userId } = req.value;
  const id = req.user.userId;
  const blockedUser = await services.findById({ id: userId });
  if (!blockedUser) {
    return errorHandler('ERR-109', res);
  }
  const user = await services.findById({ id });

  if (!user) {
    return errorHandler('ERR-109', res);
  }
  await privateChatroomServices.findOneAndUpdate(
    {
      filter: {
        participants: {
          $all: [
            { userId },
            { userId: id },
          ],
        },
        isGroupChat: false,
      },
      body: {
        $set: {
          isBlocked: false,
        },
      },
    },
  );
  await services.findByIdAndUpdate({
    id,
    body: {
      $pull: {
        blockedUsers: { userId },
      },
    },
  });
  return responseHandler('user unblocked successfully', res);
});

exports.muteUser = asyncHandler(async (req, res) => {
  const { userId } = req.value;
  const id = req.user.userId;
  const mutedUserId = new mongoose.Types.ObjectId(userId);
  const mutingUserId = new mongoose.Types.ObjectId(id);

  if (mutedUserId.equals(mutingUserId)) {
    return errorHandler('ERR-125', res);
  }

  const targetUser = await services.findById({ id: mutedUserId });
  if (!targetUser) {
    return errorHandler('ERR-109', res);
  }

  const alreadyMuted = await services.findOne({
    filter: { _id: mutingUserId, 'mutedUsers.userId': mutedUserId },
    projection: { _id: 1 },
  });
  if (alreadyMuted) {
    return responseHandler('user already muted', res);
  }

  await services.findByIdAndUpdate({
    id: mutingUserId,
    body: {
      $push: { mutedUsers: { userId: mutedUserId, mutedAt: new Date() } },
    },
  });

  return responseHandler('user muted successfully', res);
});

exports.unmuteUser = asyncHandler(async (req, res) => {
  const { userId } = req.value;
  const id = req.user.userId;
  const mutedUserId = new mongoose.Types.ObjectId(userId);
  const mutingUserId = new mongoose.Types.ObjectId(id);

  await services.findByIdAndUpdate({
    id: mutingUserId,
    body: {
      $pull: { mutedUsers: { userId: mutedUserId } },
    },
  });

  return responseHandler('user unmuted successfully', res);
});

exports.addNotInterestedCategory = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { categoryId } = req.value;

  const updated = await services.findByIdAndUpdate({
    id: userId,
    body: {
      $addToSet: { notInterestedInterestCategories: categoryId },
    },
  });

  return responseHandler(
    {
      message: 'Category added to not interested list',
      notInterestedInterestCategories: updated.notInterestedInterestCategories || [],
    },
    res,
  );
});

exports.removeNotInterestedCategory = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { categoryId } = req.value;

  const updated = await services.findByIdAndUpdate({
    id: userId,
    body: {
      $pull: { notInterestedInterestCategories: categoryId },
    },
  });

  return responseHandler(
    {
      message: 'Category removed from not interested list',
      notInterestedInterestCategories: updated.notInterestedInterestCategories || [],
    },
    res,
  );
});

exports.getNotInterestedCategories = asyncHandler(async (req, res) => {
  const { userId } = req.user;

  const user = await services.findById({
    id: userId,
    projection: { notInterestedInterestCategories: 1 },
  });

  return responseHandler(
    {
      categoryIds: (user && user.notInterestedInterestCategories) || [],
    },
    res,
  );
});

exports.replaceNotInterestedCategories = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { categoryIds } = req.value;

  const updated = await services.findByIdAndUpdate({
    id: userId,
    body: {
      $set: { notInterestedInterestCategories: categoryIds || [] },
    },
  });

  return responseHandler(
    {
      message: 'Not interested categories updated',
      notInterestedInterestCategories: updated.notInterestedInterestCategories || [],
    },
    res,
  );
});

exports.clearNotInterestedCategories = asyncHandler(async (req, res) => {
  const { userId } = req.user;

  const updated = await services.findByIdAndUpdate({
    id: userId,
    body: {
      $set: { notInterestedInterestCategories: [] },
    },
  });

  return responseHandler(
    {
      message: 'Not interested categories cleared',
      notInterestedInterestCategories: updated.notInterestedInterestCategories || [],
    },
    res,
  );
});

exports.getAllBlockedUsers = asyncHandler(async (req, res) => {
  const id = req.user.userId;
  const { pageNum = 1, pageSize = 20 } = req.value;
  const limit = Number(pageSize);
  const page = Number(pageNum);
  const skip = (page - 1) * limit;

  const user = await services.findById({ id });

  if (!user) {
    return errorHandler('ERR-109', res);
  }

  const blockedUser = user.blockedUsers;
  const blockedUserIds = blockedUser.map((blockedUsers) => blockedUsers.userId);
  const query = [
    {
      $match: {
        _id: { $in: blockedUserIds },
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
              email: 1,
              profilePicture: 1,
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

  const response = await services.aggregate({ query });
  const totalCountArray = response[0] && response[0].totalCount;
  const total = (totalCountArray && totalCountArray[0] && totalCountArray[0].count) || 0;
  const blockedUsersDetails = response[0].users;
  return responseHandler({
    metadata: {
      totalDocumnets: total,
      pageNum,
      pageSize,
    },
    data: blockedUsersDetails,
  }, res);
});

exports.getAllStoryMutedUsers = asyncHandler(async (req, res) => {
  const id = req.user.userId;
  const { pageNum = 1, pageSize = 20 } = req.value;
  const limit = Number(pageSize);
  const page = Number(pageNum);
  const skip = (page - 1) * limit;

  const user = await services.findById({ id });

  if (!user) {
    return errorHandler('ERR-109', res);
  }

  const storyMutedList = user.storyMutedUsers || [];
  const storyMutedUserIds = storyMutedList.map((m) => m?.userId).filter(Boolean);
  const mutedAtByUserId = new Map(
    storyMutedList
      .filter((m) => m?.userId)
      .map((m) => [m.userId.toString(), m.mutedAt]),
  );

  const query = [
    {
      $match: {
        _id: { $in: storyMutedUserIds },
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
              email: 1,
              profilePicture: 1,
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

  const response = await services.aggregate({ query });
  const totalCountArray = response[0] && response[0].totalCount;
  const total = (totalCountArray && totalCountArray[0] && totalCountArray[0].count) || 0;
  const storyMutedUsersDetails = (response[0] && response[0].users) || [];
  const data = storyMutedUsersDetails.map((u) => ({
    ...u,
    mutedAt: mutedAtByUserId.get(u._id.toString()) || null,
  }));

  return responseHandler({
    metadata: {
      totalDocumnets: total,
      pageNum,
      pageSize,
    },
    data,
  }, res);
});

exports.getUserChits = asyncHandler(async (req, res) => {
  const {
    userId,
    page = 1,
    limit = 20,
    createdOnly = false,
    type = 'chits',
    subtype = 'all',
  } = req.value;

  if (!userId) {
    return errorHandler('ERR-102', res);
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);

  // type=media: return user's posts (with subtype filter: all|video|image)
  if (String(type).toLowerCase() === 'media') {
    const pageNum = Number(page) || 1;
    const pageSize = Number(limit) || 20;
    const skip = (pageNum - 1) * pageSize;

    const normalizedSubtype = String(subtype || 'all').toLowerCase();

    const match = {
      userId: userObjectId,
      // Media tab: only posts having at least one media item
      media: { $exists: true, $ne: [] },
      // Ignore replies by default (consistent with typical profile grid)
      parentPostId: null,
    };

    if (normalizedSubtype === 'video' || normalizedSubtype === 'image') {
      match['media.mediaType'] = normalizedSubtype;
    }

    const pipeline = [
      { $match: match },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          posts: [
            { $skip: skip },
            { $limit: pageSize },
            {
              $lookup: {
                from: 'users',
                localField: 'userId',
                foreignField: '_id',
                pipeline: [
                  {
                    $project: {
                      _id: 1,
                      fullName: 1,
                      userName: 1,
                      profilePicture: 1,
                    },
                  },
                ],
                as: 'user',
              },
            },
            { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
            {
              $project: {
                _id: 1,
                userId: 1,
                user: 1,
                text: 1,
                location: 1,
                media: 1,
                mediaModeration: 1,
                labels: 1,
                mentions: 1,
                parentPostId: 1,
                createdAt: 1,
                updatedAt: 1,
              },
            },
          ],
          totalCount: [{ $count: 'count' }],
        },
      },
    ];

    const result = await postServices.aggregate({ query: pipeline });
    const posts = (result && result[0] && result[0].posts) || [];
    const totalDocuments = (result && result[0] && result[0].totalCount && result[0].totalCount[0] && result[0].totalCount[0].count) || 0;
    const totalPages = Math.ceil(totalDocuments / pageSize) || 1;

    return responseHandler({
      metadata: {
        type: 'media',
        subtype: normalizedSubtype,
        totalDocuments,
        totalPages,
        page: pageNum,
        limit: pageSize,
      },
      posts,
    }, res);
  }

  const aggregationPipeline = [
    // Find chatrooms where this user is a participant (and bring per-user clearedAt)
    {
      $lookup: {
        from: 'participants',
        let: { chatroomId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$chatroomId', '$$chatroomId'] },
                  { $eq: ['$userId', userObjectId] },
                ],
              },
            },
          },
          { $project: { _id: 0, userId: 1, clearedAt: 1 } },
          { $limit: 1 },
        ],
        as: 'participant',
      },
    },
    { $unwind: { path: '$participant', preserveNullAndEmptyArrays: false } },

    // Fetch latest 2 messages with sender details (no sound fields; app handles sound)
    {
      $lookup: {
        from: 'messages',
        let: { chatroomId: '$_id', clearedAt: '$participant.clearedAt' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$chatroomId', '$$chatroomId'] },
                  {
                    $or: [
                      { $eq: ['$$clearedAt', null] },
                      { $gt: ['$createdAt', '$$clearedAt'] },
                    ],
                  },
                  {
                    $not: {
                      $in: [userObjectId, { $ifNull: ['$deletedFor', []] }],
                    },
                  },
                ],
              },
            },
          },
          { $sort: { createdAt: -1 } },
          { $limit: 2 },
          {
            $lookup: {
              from: 'users',
              localField: 'senderId',
              foreignField: '_id',
              pipeline: [
                {
                  $project: {
                    _id: 1,
                    fullName: 1,
                    userName: 1,
                    profilePicture: 1,
                  },
                },
              ],
              as: 'senderDetails',
            },
          },
          { $unwind: { path: '$senderDetails', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              _id: 1,
              content: 1,
              media: 1,
              messageType: 1,
              isAudio: 1,
              isDeleted: 1,
              createdAt: 1,
              updatedAt: 1,
              senderDetails: 1,
            },
          },
        ],
        as: 'latestMessages',
      },
    },

    // Count total messages for this user in this chatroom
    {
      $lookup: {
        from: 'messages',
        let: { chatroomId: '$_id', clearedAt: '$participant.clearedAt' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$chatroomId', '$$chatroomId'] },
                  {
                    $or: [
                      { $eq: ['$$clearedAt', null] },
                      { $gt: ['$createdAt', '$$clearedAt'] },
                    ],
                  },
                  {
                    $not: {
                      $in: [userObjectId, { $ifNull: ['$deletedFor', []] }],
                    },
                  },
                ],
              },
            },
          },
          { $count: 'count' },
        ],
        as: 'totalMessagesAgg',
      },
    },
    {
      $addFields: {
        totalMessages: {
          $ifNull: [{ $arrayElemAt: ['$totalMessagesAgg.count', 0] }, 0],
        },
        latestMessageTime: { $arrayElemAt: ['$latestMessages.createdAt', 0] },
      },
    },
    { $project: { totalMessagesAgg: 0, participant: 0 } },
    { $sort: { latestMessageTime: -1 } },

    // Lookup hashtag details
    {
      $lookup: {
        from: 'hashtags',
        localField: 'hashtagId',
        foreignField: '_id',
        as: 'hashtagDetails',
      },
    },
    {
      $unwind: {
        path: '$hashtagDetails',
        preserveNullAndEmptyArrays: true,
      },
    },
    // Lookup hashtag creator details (createdBy)
    {
      $lookup: {
        from: 'users',
        localField: 'hashtagDetails.creatorId',
        foreignField: '_id',
        pipeline: [
          {
            $project: {
              _id: 1,
              fullName: 1,
              userName: 1,
              profilePicture: 1,
              followers: 1,
              following: 1,
              location: 1,
              fullLocation: 1,
            },
          },
        ],
        as: 'createdBy',
      },
    },
    {
      $unwind: {
        path: '$createdBy',
        preserveNullAndEmptyArrays: true,
      },
    },
    // If requested, return only hashtags created by this userId
    ...(createdOnly ? [{
      $match: {
        'hashtagDetails.creatorId': userObjectId,
      },
    }] : []),
    // Lookup hashtag likes to check if user has liked
    {
      $lookup: {
        from: 'hashtag-likes',
        let: { hashtagId: '$hashtagId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$hashtagId', '$$hashtagId'] },
                  { $eq: ['$userId', userObjectId] },
                ],
              },
            },
          },
        ],
        as: 'userLike',
      },
    },
    // Shape final output
    {
      $project: {
        _id: 1,
        name: '$hashtagDetails.name',
        hashtagId: 1,
        hashtagPhoto: '$hashtagDetails.hashtagPhoto',
        fullLocation: '$hashtagDetails.fullLocation',
        hashtagPicture: '$hashtagDetails.hashtagPicture',
        description: '$hashtagDetails.description',
        createdBy: 1,
        likes: { $ifNull: ['$hashtagDetails.likeCount', 0] },
        viewCount: { $ifNull: ['$hashtagDetails.viewCount', 0] },
        isLiked: { $gt: [{ $size: '$userLike' }, 0] },
        totalMessages: { $ifNull: ['$totalMessages', 0] },
        createdAt: 1,
        latestMessages: {
          $map: {
            input: '$latestMessages',
            as: 'msg',
            in: {
              _id: '$$msg._id',
              content: '$$msg.content',
              media: '$$msg.media',
              messageType: '$$msg.messageType',
              isAudio: '$$msg.isAudio',
              isDeleted: '$$msg.isDeleted',
              createdAt: '$$msg.createdAt',
              updatedAt: '$$msg.updatedAt',
              senderDetails: '$$msg.senderDetails',
            },
          },
        },
      },
    },
    // Pagination
    {
      $facet: {
        chatrooms: [{ $skip: (page - 1) * limit }, { $limit: parseInt(limit, 10) }],
        totalCount: [{ $count: 'count' }],
      },
    },
  ];

  try {
    const result = await chatroomServices.aggregate({ query: aggregationPipeline });
    const chatrooms = result[0].chatrooms || [];
    const totalChatrooms = result[0].totalCount.length > 0 ? result[0].totalCount[0].count : 0;
    const totalPages = Math.ceil(totalChatrooms / limit);

    // Record impressions for all returned hashtags (fire and forget)
    const returnedHashtagIds = chatrooms
      .map((c) => c.hashtagId)
      .filter(Boolean)
      .map((id) => String(id));
    if (returnedHashtagIds.length > 0) {
      Promise.all(
        returnedHashtagIds.map((hashtagId) => hashtagServices.incrementViewCount({ hashtagId }).catch(() => null)),
      ).catch(() => { });
    }

    return responseHandler({
      metadata: {
        totalChatrooms,
        totalPages,
        page,
        limit,
      },
      chatrooms,
    }, res);
  } catch (error) {
    return errorHandler('ERR-006', res);
  }
});

exports.getSuggestedUsers = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { page = 1, limit = 20 } = req.query;

  const skip = (page - 1) * limit;

  const aggregationPipeline = [
    {
      $match: {
        _id: new mongoose.Types.ObjectId(userId),
      },
    },
    // Get users I follow
    {
      $lookup: {
        from: 'follows',
        localField: '_id',
        foreignField: 'followerId',
        as: 'myFollowing',
      },
    },
    // Get users who follow me
    {
      $lookup: {
        from: 'follows',
        localField: '_id',
        foreignField: 'followingId',
        as: 'myFollowers',
      },
    },
    // Get hashtag chatrooms I'm part of
    {
      $lookup: {
        from: 'participants',
        localField: '_id',
        foreignField: 'userId',
        as: 'myChatrooms',
      },
    },
    // Add field to extract chatroom IDs
    {
      $addFields: {
        myChatroomIds: '$myChatrooms.chatroomId',
      },
    },
    // Get all participants from those chatrooms
    {
      $lookup: {
        from: 'participants',
        let: { chatroomIds: '$myChatroomIds' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $in: ['$chatroomId', '$$chatroomIds'] },
                  { $ne: ['$userId', new mongoose.Types.ObjectId(userId)] },
                ],
              },
            },
          },
        ],
        as: 'commonChatroomParticipants',
      },
    },
    // Combine all suggested user IDs and keep myChatroomIds for later use
    {
      $project: {
        myChatroomIds: 1,
        suggestedUserIds: {
          $setUnion: [
            '$myFollowing.followingId',
            '$myFollowers.followerId',
            '$commonChatroomParticipants.userId',
          ],
        },
      },
    },
    // Unwind to get individual user IDs
    {
      $unwind: {
        path: '$suggestedUserIds',
        preserveNullAndEmptyArrays: false,
      },
    },
    // Lookup user details
    {
      $lookup: {
        from: 'users',
        localField: 'suggestedUserIds',
        foreignField: '_id',
        as: 'userDetails',
      },
    },
    {
      $unwind: {
        path: '$userDetails',
        preserveNullAndEmptyArrays: false,
      },
    },
    // Filter out blocked users
    {
      $match: {
        $and: [
          { 'userDetails.blockedUsers.userId': { $ne: new mongoose.Types.ObjectId(userId) } },
          { 'userDetails._id': { $ne: new mongoose.Types.ObjectId(userId) } },
        ],
      },
    },
    // Check if current user follows this suggested user
    {
      $lookup: {
        from: 'follows',
        let: { suggestedUserId: '$userDetails._id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$followerId', new mongoose.Types.ObjectId(userId)] },
                  { $eq: ['$followingId', '$$suggestedUserId'] },
                ],
              },
            },
          },
        ],
        as: 'followStatus',
      },
    },
    // Check if suggested user follows current user
    {
      $lookup: {
        from: 'follows',
        let: { suggestedUserId: '$userDetails._id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$followerId', '$$suggestedUserId'] },
                  { $eq: ['$followingId', new mongoose.Types.ObjectId(userId)] },
                ],
              },
            },
          },
        ],
        as: 'followerStatus',
      },
    },
    // Count common hashtag chatrooms
    {
      $lookup: {
        from: 'participants',
        let: { suggestedUserId: '$userDetails._id', myChatroomIds: '$myChatroomIds' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$userId', '$$suggestedUserId'] },
                  { $in: ['$chatroomId', '$$myChatroomIds'] },
                ],
              },
            },
          },
        ],
        as: 'commonChatrooms',
      },
    },
    // Group by user to avoid duplicates and add relevance score
    {
      $group: {
        _id: '$userDetails._id',
        user: { $first: '$userDetails' },
        isFollowing: { $first: { $gt: [{ $size: '$followStatus' }, 0] } },
        followsYou: { $first: { $gt: [{ $size: '$followerStatus' }, 0] } },
        commonChatroomsCount: { $first: { $size: '$commonChatrooms' } },
      },
    },
    // Calculate relevance score
    {
      $addFields: {
        relevanceScore: {
          $add: [
            { $cond: [{ $eq: ['$followsYou', true] }, 3, 0] },
            { $cond: [{ $eq: ['$isFollowing', true] }, 2, 0] },
            { $multiply: ['$commonChatroomsCount', 1] },
          ],
        },
      },
    },
    // Sort by relevance score
    {
      $sort: { relevanceScore: -1, 'user.followers': -1 },
    },
    // Apply pagination
    {
      $facet: {
        users: [
          { $skip: skip },
          { $limit: parseInt(limit, 10) },
          // Attach 1:1 private chatroomId between current user and this suggested user (if exists)
          {
            $lookup: {
              from: 'privatechatrooms',
              let: { suggestedUserId: '$_id' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$isGroupChat', false] },
                        { $in: [new mongoose.Types.ObjectId(userId), '$participants.userId'] },
                        { $in: ['$$suggestedUserId', '$participants.userId'] },
                      ],
                    },
                  },
                },
                { $project: { _id: 1 } },
                { $limit: 1 },
              ],
              as: 'directChatroom',
            },
          },
          {
            $project: {
              _id: '$user._id',
              fullName: '$user.fullName',
              userName: '$user.userName',
              profilePicture: '$user.profilePicture',
              description: '$user.description',
              followers: '$user.followers',
              following: '$user.following',
              isFollowing: 1,
              followsYou: 1,
              commonChatroomsCount: 1,
              relevanceScore: 1,
              chatroomId: { $ifNull: [{ $arrayElemAt: ['$directChatroom._id', 0] }, null] },
            },
          },
        ],
        totalCount: [{ $count: 'count' }],
      },
    },
  ];

  const result = await services.aggregate({ query: aggregationPipeline });

  const users = result[0].users || [];
  const totalUsers = result[0].totalCount.length > 0 ? result[0].totalCount[0].count : 0;
  const totalPages = Math.ceil(totalUsers / limit);

  // If chatroomId is missing, create a 1:1 private chatroom for that user (only for current page results)
  const usersWithChatrooms = await Promise.all(
    users.map(async (u) => {
      if (!u || u.chatroomId) return u;

      const suggestedUserId = u._id;
      if (!suggestedUserId) return u;

      const existing = await privateChatroomServices.findOne({
        filter: {
          isGroupChat: false,
          participants: {
            $all: [
              { $elemMatch: { userId } },
              { $elemMatch: { userId: suggestedUserId } },
            ],
          },
        },
        projection: { _id: 1 },
      });

      if (existing && existing._id) {
        return { ...u, chatroomId: existing._id };
      }

      const created = await privateChatroomServices.create({
        body: {
          isGroupChat: false,
          participants: [{ userId }, { userId: suggestedUserId }],
          createdBy: userId,
        },
      });

      return { ...u, chatroomId: created ? created._id : null };
    }),
  );

  return responseHandler({
    metadata: {
      totalUsers,
      totalPages,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    },
    users: usersWithChatrooms,
  }, res);
});

exports.onboarding = asyncHandler(async (req, res) => {
  const requestUserId = req.user && req.user.userId ? req.user.userId : null;
  const {
    userId,
    step,
    description,
    language,
    occupation,
    school,
    religion,
    interestSubCategories,
  } = req.value;
  const targetUserId = requestUserId || userId;

  const update = {};

  if (step === 'describe') {
    update.description = description;
  } else if (step === 'details') {
    update.languages = language ? [language] : [];
    update.occupation = occupation || null;
    update.education = school || null;
    update.religion = religion || null;
  } else if (step === 'interests') {
    const subCategories = await interestSubCategoryServices.find({
      filter: { _id: { $in: interestSubCategories }, isActive: true },
    });

    if (!subCategories || subCategories.length !== interestSubCategories.length) {
      return errorHandler('ERR-137', res);
    }

    // Derive parent category IDs from selected subcategories
    const categoryIdSet = new Set(
      subCategories.map((sc) => sc.categoryId.toString()),
    );
    update.interestSubCategories = interestSubCategories;
    update.interestCategories = [...categoryIdSet];
  } else if (step === 'communityRules') {
    update.rulesAcceptedAt = new Date();
  }

  if (!Object.keys(update).length) {
    return errorHandler('ERR-006', res);
  }

  const user = await services.findByIdAndUpdate({
    id: targetUserId,
    body: { $set: update },
  });

  if (!user) {
    return errorHandler('ERR-102', res);
  }

  // Sync onboarding progress for interest & community-rules steps
  if (step === 'interests' || step === 'communityRules') {
    const progressUpdate = {};
    if (step === 'interests') progressUpdate.interestsAdded = true;
    if (step === 'communityRules') progressUpdate.rulesAccepted = true;

    const existingProgress = await onboardingProgressService.findOne({
      filter: { userId: targetUserId },
    });
    if (existingProgress) {
      await onboardingProgressService.findOneAndUpdate({
        filter: { userId: targetUserId },
        body: { $set: progressUpdate },
      });
    } else {
      await onboardingProgressService.create({
        body: { userId: targetUserId, ...progressUpdate },
      });
    }
  }

  return responseHandler(
    {
      step,
      user: {
        _id: user._id,
        description: user.description,
        languages: user.languages,
        occupation: user.occupation,
        education: user.education,
        religion: user.religion,
        interestCategories: user.interestCategories,
        interestSubCategories: user.interestSubCategories,
      },
    },
    res,
  );
});

/**
 * Temporary delete account - sets deleteInfo.status to 'temporary'
 * User can restore account by logging in again
 */
exports.temporaryDeleteAccount = asyncHandler(async (req, res) => {
  const { userId: paramUserId } = req.value;
  const { userId: tokenUserId } = req.user;
  const { reason } = req.body;

  // Ensure user can only delete their own account
  if (paramUserId !== tokenUserId.toString()) {
    return errorHandler('ERR-005', res);
  }

  const user = await services.findById({ id: paramUserId });

  if (!user) {
    return errorHandler('ERR-109', res);
  }

  // Check if already deleted
  if (user.deleteInfo && user.deleteInfo.status !== deleteStatus.NONE) {
    return errorHandler('ERR-138', res);
  }

  const updatedUser = await services.findByIdAndUpdate({
    id: paramUserId,
    body: {
      $set: {
        'deleteInfo.status': deleteStatus.TEMPORARY,
        'deleteInfo.reason': reason || null,
        'deleteInfo.requestedAt': new Date(),
        'deleteInfo.restoredAt': null,
        active: false,
      },
    },
  });

  if (!updatedUser) {
    return errorHandler('ERR-140', res);
  }

  return responseHandler(
    {
      message: 'Account temporarily deleted. Login again to restore your account.',
      deleteInfo: updatedUser.deleteInfo,
    },
    res,
  );
});

/**
 * Forgot password - sends OTP to user's email or phone for password reset
 */
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email, phoneNumber, countryCode } = req.value;

  // Determine mode and build filter
  let filter = {};
  let mode = 'email';

  if (phoneNumber && countryCode) {
    mode = 'phone';
    filter = { phoneNumber, countryCode };
  } else if (email) {
    filter = { email };
  } else {
    return errorHandler('ERR-001', res);
  }

  // Check if user exists
  const user = await services.findOne({
    filter,
    projection: { _id: 1, status: 1 },
  });

  if (!user) {
    return errorHandler('ERR-109', res);
  }

  // Send OTP for password reset
  const otpBody = mode === 'email'
    ? { email, mode: 'email', purpose: 'forgotPassword' }
    : {
      phone: phoneNumber, countryCode, mode: 'phone', purpose: 'forgotPassword',
    };

  const otp = await services.sendOtp(otpBody);

  const message = mode === 'email'
    ? 'OTP has been sent to your email address'
    : 'OTP has been sent to your mobile number';

  return responseHandler(
    {
      identifierCode: otp.identifierCode,
      code: otp.code, // TODO: Remove this in production - only for testing without email service
      message,
    },
    res,
  );
});

/**
 * Reset password - verifies OTP and sets new password
 */
exports.resetPassword = asyncHandler(async (req, res) => {
  const {
    email, phoneNumber, countryCode, identifierCode, code, newPassword,
  } = req.value;

  // Determine mode and build filter
  let otpFilter = {
    email, identifierCode, code, mode: 'email', purpose: 'forgotPassword',
  };
  let userFilter = { email };

  if (phoneNumber && countryCode) {
    otpFilter = {
      phone: phoneNumber, countryCode, identifierCode, code, mode: 'phone', purpose: 'forgotPassword',
    };
    userFilter = { phoneNumber, countryCode };
  }

  // Verify OTP
  const otpExist = await services.verifyOtp(otpFilter);
  if (!otpExist) {
    return errorHandler('ERR-104', res);
  }

  // Find the user
  const user = await services.findOne({
    filter: userFilter,
    projection: { _id: 1 },
  });

  if (!user) {
    return errorHandler('ERR-109', res);
  }

  // Hash the new password
  const hashedPassword = await bcrypt.hash(newPassword, Number(env.SALT_ROUNDS));

  // Update the password
  const updatedUser = await services.findByIdAndUpdate({
    id: user._id,
    body: { $set: { password: hashedPassword } },
  });

  if (!updatedUser) {
    return errorHandler('ERR-142', res);
  }

  return responseHandler(
    {
      message: 'Password reset successfully',
    },
    res,
  );
});

/**
 * Update password - user provides currentPassword and newPassword
 * Compares currentPassword with stored hash, if correct, hashes newPassword and updates
 */
exports.updatePassword = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { currentPassword, newPassword } = req.value;

  // Fetch user with password field (since it's excluded by default with select: false)
  const user = await services.findOne({
    filter: { _id: userId },
    projection: { password: 1 },
  });

  if (!user) {
    return errorHandler('ERR-109', res);
  }

  // Check if user has a password set (might be Google OAuth user without password)
  if (!user.password) {
    return errorHandler('ERR-141', res);
  }

  // Compare current password with stored hash
  const isPasswordValid = await services.comparePassword(currentPassword, user.password);

  if (!isPasswordValid) {
    return errorHandler('ERR-141', res);
  }

  // Hash the new password
  const hashedNewPassword = await bcrypt.hash(newPassword, Number(env.SALT_ROUNDS));

  // Update password in the database
  const updatedUser = await services.findByIdAndUpdate({
    id: userId,
    body: { $set: { password: hashedNewPassword } },
  });

  if (!updatedUser) {
    return errorHandler('ERR-142', res);
  }

  return responseHandler(
    {
      message: 'Password updated successfully',
    },
    res,
  );
});

/**
 * Force logout a user by disconnecting all their socket connections.
 * This is an admin operation to forcefully log out a user.
 */
exports.forceLogoutUser = asyncHandler(async (req, res) => {
  const { userId: targetUserId } = req.params;

  // Verify target user exists
  const targetUser = await services.findById({ id: targetUserId });
  if (!targetUser) {
    return errorHandler('ERR-109', res); // User not found
  }

  const io = getIO();
  if (!io) {
    return responseHandler(
      {
        success: false,
        message: 'Socket server not initialized',
      },
      res,
      500,
    );
  }

  // Get all sockets in the user's room (users join a room with their userId on connection)
  const socketsInRoom = await io.in(targetUserId).fetchSockets();
  const disconnectedCount = socketsInRoom.length;

  // Disconnect all sockets for this user
  console.log('Target userId:', targetUserId);
  console.log('Sockets found:', socketsInRoom.length);
  console.log('Socket IDs:', socketsInRoom.map((s) => s.id));

  socketsInRoom.forEach((socket) => {
    console.log('Disconnecting socket:', socket.id, 'for user:', socket.handshake?.query?.userId);
    socket.emit('forceLogout', {
      message: 'You have been logged out by an administrator',
      reason: 'admin_force_logout',
    });
    socket.disconnect(true);
  });

  // Increment tokenVersion to invalidate all existing tokens for this user
  // This ensures the user cannot access API with their old token
  await services.findOneAndUpdate({
    id: targetUserId,
    body: {
      onlineStatus: false,
      $inc: { tokenVersion: 1 },
    },
  });

  logInfo(`Admin force logout: User ${targetUserId} disconnected (${disconnectedCount} sockets), token invalidated`);

  return responseHandler(
    {
      success: true,
      message: `User ${targetUserId} has been logged out successfully`,
      disconnectedSockets: disconnectedCount,
      userId: targetUserId,
    },
    res,
  );
});

/**
 * Get stories feed for the logged-in user
 * Returns stories from the user + users they follow (like Instagram)
 * Stories are grouped by user and sorted with own stories first, then by recency
 */
exports.getStoriesUpdate = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Get the logged-in user to check for blocked/muted users
  const currentUser = await services.findById({
    id: userId,
    projection: { blockedUsers: 1, mutedUsers: 1 },
  });

  const blockedUsers = currentUser?.blockedUsers || [];
  const mutedUsers = currentUser?.mutedUsers || [];

  // Get list of users that the logged-in user follows
  const followingList = await followServices.find({
    filter: {
      followerId: userObjectId,
      status: 'accepted',
    },
    projection: { followingId: 1 },
  });

  // Extract following user IDs and filter out blocked/muted users
  const followingIds = followingList
    .map((follow) => follow.followingId)
    .filter((id) => {
      const idStr = id.toString();
      return !blockedUsers.some((b) => b.toString() === idStr)
        && !mutedUsers.some((m) => m.toString() === idStr);
    });

  // Get stories feed (own stories + following users' stories)
  const storiesFeed = await storiesServices.getStoriesFeed({
    userId: userObjectId,
    followingIds,
  });

  // Separate own stories and others' stories for the response
  const ownStories = storiesFeed.find((item) => item.isOwnStory) || null;
  const othersStories = storiesFeed.filter((item) => !item.isOwnStory);

  return responseHandler(
    {
      success: true,
      ownStories,
      stories: othersStories,
      totalUsers: storiesFeed.length,
      hasOwnStory: !!ownStories,
    },
    res,
  );
});

/**
 * Get story privacy/settings for the logged-in user (Instagram-like)
 */
exports.getStorySettings = asyncHandler(async (req, res) => {
  const { userId } = req.user;

  const user = await services.findOne({
    filter: { _id: userId },
    projection: {
      isPrivateAccount: 1,
      closeFriends: 1,
      storyHiddenFrom: 1,
    },
  });

  return responseHandler(
    {
      success: true,
      settings: {
        isPrivateAccount: !!user?.isPrivateAccount,
        closeFriends: user?.closeFriends || [],
        storyHiddenFrom: user?.storyHiddenFrom || [],
      },
    },
    res,
  );
});

/**
 * Update story privacy/settings for the logged-in user (Instagram-like)
 * Body can contain any subset of: isPrivateAccount, closeFriends, storyHiddenFrom
 */
exports.updateStorySettings = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { isPrivateAccount, closeFriends, storyHiddenFrom } = req.body || {};

  const $set = {};
  if (isPrivateAccount !== undefined) $set.isPrivateAccount = isPrivateAccount;
  if (closeFriends !== undefined) $set.closeFriends = closeFriends;
  if (storyHiddenFrom !== undefined) $set.storyHiddenFrom = storyHiddenFrom;

  const updated = await services.findByIdAndUpdate({
    id: userId,
    body: { $set },
  });

  return responseHandler(
    {
      success: true,
      message: 'Story settings updated successfully',
      settings: {
        isPrivateAccount: !!updated?.isPrivateAccount,
        closeFriends: updated?.closeFriends || [],
        storyHiddenFrom: updated?.storyHiddenFrom || [],
      },
    },
    res,
  );
});

// ─────────────────────────────────────────────────────────────
// Invite-only / Waitlist endpoints
// ─────────────────────────────────────────────────────────────

/**
 * DELETE /user/delete-account/permanent
 * Permanently delete a user account by phone number.
 * Cascades: removes follows, posts, likes, comments, notifications, stories, OTPs.
 * No authentication required (phone number acts as identity proof).
 */
exports.permanentDeleteAccount = asyncHandler(async (req, res) => {
  const { phoneNumber, countryCode, reason } = req.value;

  const user = await services.findOne({
    filter: { phoneNumber, countryCode },
    projection: {
      _id: 1,
      fullName: 1,
      email: 1,
      phoneNumber: 1,
    },
  });

  if (!user) return errorHandler('ERR-109', res);

  const userId = user._id;

  // Cascade: remove all related data in parallel
  await Promise.allSettled([
    // Follow relationships (both directions)
    followServices.deleteMany({ filter: { $or: [{ followerId: userId }, { followingId: userId }] } }),
    // Posts authored by this user
    postServices.deleteMany({ filter: { userId } }),
    // Post likes by this user
    likeServices.deleteMany({ filter: { userId } }),
    // Stories authored by this user
    storiesServices.deleteMany({ filter: { userId } }),
    // Hashtag likes by this user
    hashtagLikeServices.deleteMany({ filter: { userId } }),
    // Remove user from private chatroom participants
    privateChatroomServices.findOneAndUpdate({
      filter: { 'participants.userId': userId },
      body: { $pull: { participants: { userId }, admins: userId, moderators: userId } },
    }),
    // Pull userId from other users' social arrays
    UserModel.updateMany(
      {},
      {
        $pull: {
          blockedUsers: { userId },
          mutedUsers: { userId },
          storyMutedUsers: { userId },
          storyNotifyUsers: { userId },
          closeFriends: userId,
          storyHiddenFrom: userId,
        },
      },
    ),
  ]);

  // Hard-delete the user document
  await UserModel.deleteOne({ _id: userId });

  logInfo(`Permanent delete: user ${userId} (${phoneNumber}) deleted. Reason: ${reason || 'none'}`);

  return responseHandler(
    {
      success: true,
      message: 'Account permanently deleted.',
      deletedUserId: userId,
    },
    res,
  );
});

/**
 * POST /user/auth/validate-invite-code
 * Check if an invite code is valid before the user proceeds with signup.
 * No authentication required.
 */
exports.validateInviteCode = asyncHandler(async (req, res) => {
  const { inviteCode } = req.value;

  const result = await validateInviteCodeHelper(inviteCode);

  if (!result.valid) {
    return errorHandler(result.error, res);
  }

  return responseHandler(
    {
      valid: true,
      message: 'Invite code is valid',
      inviteCode: inviteCode.toUpperCase(),
    },
    res,
  );
});

/**
 * POST /user/auth/request-invitation
 * Submit a waitlist / invitation request.
 * No authentication required.
 */
exports.requestInvitation = asyncHandler(async (req, res) => {
  const {
    fullName,
    email,
    phoneNumber,
    countryCode,
    fullLocation,
    coordinates,
    dateOfBirth,
    referredBy,
    reason,
  } = req.value;

  // Prevent duplicate requests by email or phone
  const dupFilter = email
    ? { email }
    : { phoneNumber, countryCode };

  const existing = await waitlistRequestServices.findOne({ filter: dupFilter, projection: { _id: 1, status: 1 } });
  if (existing) {
    return responseHandler(
      {
        alreadyRequested: true,
        requestId: existing._id,
        status: existing.status,
        message: 'You have already submitted an invitation request.',
      },
      res,
    );
  }

  // Fetch admin user's referralCode; create one if it doesn't exist
  const ADMIN_EMAIL = 'admin@talkhub.co';
  const adminUser = await services.findOne({
    filter: { email: ADMIN_EMAIL },
    projection: { _id: 1, referralCode: 1 },
  });

  if (!adminUser) {
    logInfo(`Admin user ${ADMIN_EMAIL} not found. Cannot issue invite code.`);
    return errorHandler('ERR-102', res);
  }

  let { referralCode: adminReferralCode } = adminUser;

  if (!adminReferralCode) {
    adminReferralCode = await generateUniqueReferralCode();
    await services.findByIdAndUpdate({
      id: adminUser._id,
      body: {
        $set: {
          referralCode: adminReferralCode,
          referralSettings: {
            expireAfter: 'never',
            maxUses: null,
            createdAt: new Date(),
            expiresAt: null,
          },
        },
      },
    });
    logInfo(`Generated referralCode ${adminReferralCode} for admin user ${ADMIN_EMAIL}`);
  }

  const requestData = {
    fullName,
    dateOfBirth: dateOfBirth || null,
    referredBy: referredBy || null,
    reason: reason || null,
    status: waitlistStatus.PENDING,
  };

  if (email) requestData.email = email;
  if (phoneNumber) {
    requestData.phoneNumber = phoneNumber;
    requestData.countryCode = countryCode;
  }
  if (fullLocation) requestData.fullLocation = fullLocation;
  if (coordinates && coordinates.length === 2) {
    requestData.location = { type: 'Point', coordinates };
  }

  const waitlistRequest = await waitlistRequestServices.create({ body: requestData });

  // Send the invite code to the requesting user
  const templateVars = {
    fullName: fullName || 'there',
    inviteCode: adminReferralCode,
    currentYear: new Date().getFullYear().toString(),
  };

  if (email) {
    try {
      await emailService.sendEmail(
        email,
        'Your TalkHub Invitation Code',
        'invitation-code',
        templateVars,
      );
      logInfo(`Invitation code sent via email to ${email}`);
    } catch (err) {
      logInfo(`Failed to send invitation email to ${email}: ${err.message}`);
    }
  } else if (phoneNumber && countryCode) {
    try {
      const smsMessage = `Hi ${fullName || 'there'}! Your TalkHub invite code is: ${adminReferralCode}. Enter this code during sign-up to join TalkHub!`;
      await smsService.sendSMS(phoneNumber, countryCode, smsMessage);
      logInfo(`Invitation code sent via SMS to ${phoneNumber}`);
    } catch (err) {
      logInfo(`Failed to send invitation SMS to ${phoneNumber}: ${err.message}`);
    }
  }

  return responseHandler(
    {
      success: true,
      requestId: waitlistRequest._id,
      status: waitlistRequest.status,
      message: "You're on the waitlist! We'll send your invitation code shortly.",
    },
    res,
  );
});

/**
 * POST /user/auth/reserve-username
 * Let a waitlisted user reserve a username before they are approved.
 * No authentication required.
 */
exports.reserveWaitlistUsername = asyncHandler(async (req, res) => {
  const { requestId, username } = req.value;

  const waitlistRequest = await waitlistRequestServices.findById({
    id: requestId,
    projection: { _id: 1, status: 1, reservedUsername: 1 },
  });

  if (!waitlistRequest) {
    return errorHandler('ERR-109', res);
  }

  const normalizedUsername = username.startsWith('@') ? username : `@${username}`;

  // Check if username is taken in the main users collection
  const existingUser = await services.findOne({
    filter: { userName: normalizedUsername },
    projection: { _id: 1 },
  });
  if (existingUser) {
    return responseHandler(
      {
        available: false,
        message: 'Username is already taken. Please choose another.',
      },
      res,
      409,
    );
  }

  // Check if another waitlist request has reserved this username
  const existingReservation = await waitlistRequestServices.findOne({
    filter: { reservedUsername: normalizedUsername, _id: { $ne: requestId } },
    projection: { _id: 1 },
  });
  if (existingReservation) {
    return responseHandler(
      {
        available: false,
        message: 'Username is already reserved. Please choose another.',
      },
      res,
      409,
    );
  }

  await waitlistRequestServices.findByIdAndUpdate({
    id: requestId,
    body: { $set: { reservedUsername: normalizedUsername } },
  });

  return responseHandler(
    {
      success: true,
      reserved: true,
      username: normalizedUsername,
      message: 'Username reserved successfully.',
    },
    res,
  );
});

/**
 * POST /user/invite-sms
 * Send invite SMS to a list of contacts with the user's invite link.
 * Requires authentication.
 */
exports.inviteSms = asyncHandler(async (req, res) => {
  const { contacts, link } = req.value;
  const { userId } = req.user;

  const sender = await services.findById({
    id: userId,
  });

  if (!sender) return errorHandler('ERR-109', res);

  const senderName = sender.fullName || sender.userName || 'A friend';
  const senderCountryCode = sender.countryCode || '+1';

  if (!smsService.isConfigured()) {
    return responseHandler(
      {
        success: false,
        message: 'SMS service is not configured.',
      },
      res,
      503,
    );
  }

  const results = await Promise.allSettled(
    contacts.map(async (contact) => {
      const raw = contact.phoneNumber.replace(/[\s\-()]/g, '');
      const code = contact.countryCode || senderCountryCode;
      const contactName = contact.name ? `, ${contact.name}` : '';
      const message = `Hey${contactName}! ${senderName} invited you to join TalkHub — a new invite-only social app. Tap the link to get started:\n\n${link}`;

      const result = await smsService.sendSMS(raw, code, message);
      return { phoneNumber: contact.phoneNumber, ...result };
    }),
  );

  const sent = [];
  const failed = [];

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      sent.push({
        phoneNumber: contacts[i].phoneNumber,
        name: contacts[i].name,
      });
    } else {
      failed.push({
        phoneNumber: contacts[i].phoneNumber,
        name: contacts[i].name,
        error: r.reason?.message || 'Unknown error',
      });
    }
  });

  return responseHandler(
    {
      success: true,
      totalContacts: contacts.length,
      sent: sent.length,
      failed: failed.length,
      details: { sent, failed },
    },
    res,
  );
});
