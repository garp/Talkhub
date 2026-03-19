const Joi = require('joi');
const { ObjectId } = require('./common.validators');

// Valid expiration values
const expireAfterValues = ['never', '12h', '1d', '7d'];

/**
 * Schema for generating a referral code
 * userId is optional - if not provided, uses the authenticated user's ID
 * Now supports expireAfter and maxUses settings
 */
exports.generateReferralCodeSchema = Joi.object({
  userId: Joi.string().custom(ObjectId).optional(),
  expireAfter: Joi.string()
    .valid(...expireAfterValues)
    .default('never')
    .optional()
    .messages({
      'any.only': 'expireAfter must be one of: never, 12h, 1d, 7d',
    }),
  maxUses: Joi.number()
    .integer()
    .min(1)
    .max(1000)
    .allow(null)
    .default(null)
    .optional()
    .messages({
      'number.min': 'maxUses must be at least 1',
      'number.max': 'maxUses cannot exceed 1000',
    }),
});

/**
 * Schema for applying an invite code during signup/update
 * No auth required - userId is passed in body
 */
exports.applyInviteCodeSchema = Joi.object({
  userId: Joi.string().custom(ObjectId).required(),
  inviteCode: Joi.string()
    .length(6)
    .pattern(/^[0-9A-Z]+$/i)
    .uppercase()
    .required()
    .messages({
      'string.length': 'Invite code must be exactly 6 characters',
      'string.pattern.base': 'Invite code must contain only letters (A-Z) and numbers (0-9)',
    }),
});

/**
 * Schema for getting referred users with pagination
 */
exports.getReferredUsersSchema = Joi.object({
  pageNum: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100)
    .default(20),
});

/**
 * Schema for updating referral settings without regenerating the code
 */
exports.updateReferralSettingsSchema = Joi.object({
  expireAfter: Joi.string()
    .valid(...expireAfterValues)
    .optional()
    .messages({
      'any.only': 'expireAfter must be one of: never, 12h, 1d, 7d',
    }),
  maxUses: Joi.number()
    .integer()
    .min(1)
    .max(1000)
    .allow(null)
    .optional()
    .messages({
      'number.min': 'maxUses must be at least 1',
      'number.max': 'maxUses cannot exceed 1000',
    }),
}).or('expireAfter', 'maxUses').messages({
  'object.missing': 'At least one of expireAfter or maxUses must be provided',
});
