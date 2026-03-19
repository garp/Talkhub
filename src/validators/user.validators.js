const Joi = require('joi');
const { ObjectId } = require('./common.validators');

// ─────────────────────────────────────────────────────────────
// Story settings (Instagram-like)
// ─────────────────────────────────────────────────────────────
exports.storySettingsSchema = Joi.object({
  isPrivateAccount: Joi.boolean().optional(),
  closeFriends: Joi.array().items(Joi.string().custom(ObjectId)).optional(),
  storyHiddenFrom: Joi.array().items(Joi.string().custom(ObjectId)).optional(),
});

// Validate a single invite code without requiring signup
exports.validateInviteCodeSchema = Joi.object({
  inviteCode: Joi.string()
    .alphanum()
    .length(6)
    .uppercase()
    .required(),
});

// Request an invitation (waitlist)
exports.requestInvitationSchema = Joi.alternatives().try(
  Joi.object({
    fullName: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    fullLocation: Joi.string().allow('', null).optional(),
    coordinates: Joi.array().items(Joi.number()).length(2).optional(),
    dateOfBirth: Joi.date().max('now').allow(null).optional(),
    referredBy: Joi.string().allow('', null).optional(),
    reason: Joi.string().allow('', null).optional(),
  }),
  Joi.object({
    fullName: Joi.string().min(2).max(100).required(),
    phoneNumber: Joi.string().pattern(/^\d{5,20}$/).required(),
    countryCode: Joi.string().required(),
    fullLocation: Joi.string().allow('', null).optional(),
    coordinates: Joi.array().items(Joi.number()).length(2).optional(),
    dateOfBirth: Joi.date().max('now').allow(null).optional(),
    referredBy: Joi.string().allow('', null).optional(),
    reason: Joi.string().allow('', null).optional(),
  }),
).messages({
  'alternatives.match': 'Either email or phoneNumber with countryCode must be provided',
});

// Reserve a username for a waitlist request
exports.reserveWaitlistUsernameSchema = Joi.object({
  requestId: Joi.string().custom(ObjectId).required(),
  username: Joi.string().min(3).max(30).required(),
});

exports.authStepOneSchema = Joi.alternatives().try(
  // Option 1: Email only
  Joi.object({
    email: Joi.string().email().required(),
    inviteCode: Joi.string().alphanum().min(4).max(20)
      .uppercase()
      .optional()
      .allow(null, ''),
  }),
  // Option 2: Phone number with country code
  Joi.object({
    phoneNumber: Joi.string().pattern(/^\d{5,20}$/).required(),
    countryCode: Joi.string().required(),
    inviteCode: Joi.string().alphanum().min(4).max(20)
      .uppercase()
      .optional()
      .allow(null, ''),
  }),
).messages({
  'alternatives.match': 'Either email or phoneNumber with countryCode must be provided',
});

exports.authStepTwoSchema = Joi.object({
  userId: Joi.string().required().custom(ObjectId),
  trackingCode: Joi.string().required(),
  fullName: Joi.string().min(3).max(30).optional(),
  dateOfBirth: Joi.date().optional().max('now').allow(null),
  userName: Joi.string().min(3).max(30).optional(),
});

exports.authStepThreeSchema = Joi.object({
  userId: Joi.string().required().custom(ObjectId),
  trackingCode: Joi.string().required(),
  fullLocation: Joi.string().allow('', null).optional(),
  coordinates: Joi.array()
    .items(Joi.string().allow('').custom((value, helpers) => {
      // Accept empty string or valid number string
      if (value === '') return value;
      const num = Number(value);
      if (!Number.isNaN(num)) return num;
      return helpers.error('any.invalid');
    }))
    .length(2)
    .optional(),
  profilePicture: Joi.string().optional(),
  description: Joi.string().optional(),
});

// Stage-four GET: what to ask (email or phone missing in DB)
exports.authStepFourQuerySchema = Joi.object({
  userId: Joi.string().required().custom(ObjectId),
  trackingCode: Joi.string().required(),
});

// Stage-four: optional secondary contact (email if signed up with phone, phone if signed up with email). Can skip.
exports.authStepFourSchema = Joi.object({
  userId: Joi.string().required().custom(ObjectId),
  trackingCode: Joi.string().required(),
  email: Joi.string().email().optional().allow('', null),
  phoneNumber: Joi.string().pattern(/^\d{5,20}$/).optional().allow('', null),
  countryCode: Joi.string().optional().allow('', null),
}).and('phoneNumber', 'countryCode').messages({
  'object.and': 'countryCode is required when phoneNumber is provided',
});

// Stage-four OTP verification
exports.authStepFourVerifyOtpSchema = Joi.alternatives().try(
  Joi.object({
    userId: Joi.string().required().custom(ObjectId),
    trackingCode: Joi.string().required(),
    identifierCode: Joi.string().required(),
    code: Joi.string().required().length(6).regex(/^\d+$/),
    email: Joi.string().email().required(),
  }),
  Joi.object({
    userId: Joi.string().required().custom(ObjectId),
    trackingCode: Joi.string().required(),
    identifierCode: Joi.string().required(),
    code: Joi.string().required().length(6).regex(/^\d+$/),
    phoneNumber: Joi.string().pattern(/^\d{5,20}$/).required(),
    countryCode: Joi.string().required(),
  }),
).messages({
  'alternatives.match': 'Either email or phoneNumber with countryCode must be provided',
});

const stepEnum = Joi.string().valid('describe', 'details', 'interests', 'communityRules').required();

exports.onboardingSchema = Joi.object({
  userId: Joi.string().custom(ObjectId).required(),
  step: stepEnum,

  // Step 1: describe
  description: Joi.string().when('step', {
    is: 'describe',
    then: Joi.required(),
    otherwise: Joi.forbidden(),
  }),

  // Step 2: details
  language: Joi.string().when('step', {
    is: 'details',
    then: Joi.required(),
    otherwise: Joi.forbidden(),
  }),
  occupation: Joi.string().allow('', null).when('step', {
    is: 'details',
    then: Joi.optional(),
    otherwise: Joi.forbidden(),
  }),
  school: Joi.string().allow('', null).when('step', {
    is: 'details',
    then: Joi.optional(),
    otherwise: Joi.forbidden(),
  }),
  religion: Joi.string().allow('', null).when('step', {
    is: 'details',
    then: Joi.optional(),
    otherwise: Joi.forbidden(),
  }),

  // Step 3: interests
  // We store only subCategory IDs; categories are derived when needed
  interestCategories: Joi.forbidden(),
  interestSubCategories: Joi.array()
    .items(Joi.string().custom(ObjectId))
    .min(1)
    .when('step', {
      is: 'interests',
      then: Joi.required(),
      otherwise: Joi.forbidden(),
    }),

  // Step 4: communityRules – no extra fields required beyond step name
});

exports.verifyOtpSchema = Joi.alternatives().try(
  // Option 1: Email OTP verification
  Joi.object({
    email: Joi.string().email().required(),
    identifierCode: Joi.string().required(),
    code: Joi.string().required().length(6).regex(/^\d+$/),
    fcmToken: Joi.string().allow(null, ''),
  }),
  // Option 2: Phone OTP verification
  Joi.object({
    phoneNumber: Joi.string().pattern(/^\d{5,20}$/).required(),
    countryCode: Joi.string().required(),
    identifierCode: Joi.string().required(),
    code: Joi.string().required().length(6).regex(/^\d+$/),
    fcmToken: Joi.string().allow(null, ''),
  }),
).messages({
  'alternatives.match': 'Either email or phoneNumber with countryCode must be provided',
});

exports.loginSchema = Joi.alternatives().try(
  // Option 1: Login with email
  Joi.object({
    email: Joi.string().email().required(),
  }),
  // Option 2: Login with phone number
  Joi.object({
    phoneNumber: Joi.string().pattern(/^\d{5,20}$/).required(),
    countryCode: Joi.string().required(),
  }),
).messages({
  'alternatives.match': 'Either email or phoneNumber with countryCode must be provided',
});

exports.continueAuthSchema = Joi.object({
  email: Joi.string().email().required(),
});

exports.addInterestSchema = Joi.object({
  categoryId: Joi.string().required().custom(ObjectId),
});

exports.followInterestSubCategorySchema = Joi.object({
  subCategoryId: Joi.string().required().custom(ObjectId),
});

exports.googleAuthSchema = Joi.object({
  email: Joi.string().email().required(),
  name: Joi.string().required(),
  photo: Joi.string().required(),
  fcmToken: Joi.string().allow(null),
});

exports.appleAuthSchema = Joi.object({
  identityToken: Joi.string()
    .required(),
  authorizationCode: Joi.string()
    .required(),
  appleUserId: Joi.string()
    .required(),
  fullName: Joi.string()
    .allow(null, '')
    .optional(),
  email: Joi.string()
    .email()
    .allow(null, '')
    .optional(),
  fcmToken: Joi.string()
    .allow(null, '')
    .optional(),
});

exports.forgotPasswordSchema = Joi.alternatives().try(
  // Option 1: Email
  Joi.object({
    email: Joi.string().email().required(),
  }),
  // Option 2: Phone number with country code
  Joi.object({
    phoneNumber: Joi.string().pattern(/^\d{5,20}$/).required(),
    countryCode: Joi.string().required(),
  }),
).messages({
  'alternatives.match': 'Either email or phoneNumber with countryCode must be provided',
});

exports.resetPasswordSchema = Joi.alternatives().try(
  // Option 1: Email reset
  Joi.object({
    email: Joi.string().email().required(),
    identifierCode: Joi.string().required(),
    code: Joi.string().required().length(6).regex(/^\d+$/),
    newPassword: Joi.string().min(6).required(),
  }),
  // Option 2: Phone reset
  Joi.object({
    phoneNumber: Joi.string().pattern(/^\d{5,20}$/).required(),
    countryCode: Joi.string().required(),
    identifierCode: Joi.string().required(),
    code: Joi.string().required().length(6).regex(/^\d+$/),
    newPassword: Joi.string().min(6).required(),
  }),
).messages({
  'alternatives.match': 'Either email or phoneNumber with countryCode must be provided',
});

exports.resendOtpSchema = Joi.alternatives().try(
  // Option 1: Resend email OTP
  Joi.object({
    email: Joi.string().email().required(),
  }),
  // Option 2: Resend phone OTP
  Joi.object({
    phoneNumber: Joi.string().pattern(/^\d{5,20}$/).required(),
    countryCode: Joi.string().required(),
  }),
).messages({
  'alternatives.match': 'Either email or phoneNumber with countryCode must be provided',
});

exports.userNameSuggestionsSchema = Joi.object({
  fullName: Joi.string().min(3).max(30),
  userName: Joi.string().min(3).max(30),
});

exports.blockUserSchema = Joi.object({
  userId: Joi.string().required().custom(ObjectId),
});

exports.muteUserSchema = Joi.object({
  userId: Joi.string().required().custom(ObjectId),
});

// Not interested interest categories
exports.notInterestedCategoryParamsSchema = Joi.object({
  categoryId: Joi.string().required().custom(ObjectId),
});

exports.replaceNotInterestedCategoriesSchema = Joi.object({
  categoryIds: Joi.array().items(Joi.string().custom(ObjectId)).required(),
});

exports.getAllBlockedUsersSchema = Joi.object({
  pageNum: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).default(20),
});

exports.getAllStoryMutedUsersSchema = Joi.object({
  pageNum: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).default(20),
});

exports.getUserChitsSchema = Joi.object({
  userId: Joi.string().required().custom(ObjectId),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100)
    .default(20),
  createdOnly: Joi.boolean().truthy('true').falsy('false').default(false),
  // Extend endpoint behavior:
  // - type=chits => existing behavior (hashtag chatrooms + latest messages)
  // - type=media => user posts list (with optional subtype filter)
  type: Joi.string().valid('chits', 'media').default('chits'),
  subtype: Joi.string().valid('all', 'video', 'image').default('all'),
});

// Delete account schemas
exports.deleteAccountParamsSchema = Joi.object({
  userId: Joi.string().required().custom(ObjectId),
});

exports.deleteAccountBodySchema = Joi.object({
  reason: Joi.string().max(500).allow('', null).optional(),
});

exports.updatePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(6).required(),
});

// Force logout schema (admin operation)
exports.forceLogoutSchema = Joi.object({
  userId: Joi.string().required().custom(ObjectId),
});

// Invite contacts via SMS
exports.inviteSmsSchema = Joi.object({
  contacts: Joi.array()
    .items(
      Joi.object({
        name: Joi.string()
          .allow('', null)
          .optional(),
        phoneNumber: Joi.string()
          .required(),
        countryCode: Joi.string()
          .allow('', null)
          .optional(),
      }),
    )
    .min(1)
    .max(50)
    .required(),
  link: Joi.string()
    .uri()
    .required(),
});

// Permanent delete account by phone number (no auth required)
exports.permanentDeleteAccountSchema = Joi.object({
  phoneNumber: Joi.string()
    .pattern(/^\d{5,20}$/)
    .required(),
  countryCode: Joi.string()
    .required(),
  reason: Joi.string()
    .max(500)
    .allow('', null)
    .optional(),
});

// Check if accounts exist by phone number (POST body)
exports.accountExistsBodySchema = Joi.object({
  contacts: Joi.array()
    .items(
      Joi.object({
        phoneNumber: Joi.string()
          .pattern(/^\d{5,20}$/)
          .required(),
        countryCode: Joi.string()
          .required(),
      }),
    )
    .min(1)
    .required(),
});

// Onboarding progress (separate collection) — /onboarding/:userId
exports.onboardingProgressUserIdParamsSchema = Joi.object({
  userId: Joi.string()
    .custom(ObjectId)
    .required(),
});

// PUT body: nameAdded and userNameAdded can only be true (never false); others can be true or false (skip)
// Also accepts onboarding step fields so that a single call can both track progress AND persist data.
exports.onboardingProgressPutBodySchema = Joi.object({
  nameAdded: Joi.boolean()
    .valid(true)
    .optional(),
  userNameAdded: Joi.boolean()
    .valid(true)
    .optional(),
  dobAdded: Joi.boolean()
    .optional(),
  profilePhotoAdded: Joi.boolean()
    .optional(),
  descriptionAdded: Joi.boolean()
    .optional(),
  interestsAdded: Joi.boolean()
    .optional(),
  rulesAccepted: Joi.boolean()
    .optional(),

  step: Joi.string()
    .valid('describe', 'details', 'interests', 'communityRules')
    .optional(),
  description: Joi.string().optional(),
  language: Joi.string().optional(),
  occupation: Joi.string().allow('', null).optional(),
  school: Joi.string().allow('', null).optional(),
  religion: Joi.string().allow('', null).optional(),
  interestSubCategories: Joi.array()
    .items(Joi.string().custom(ObjectId))
    .min(1)
    .optional(),
}).min(1);
