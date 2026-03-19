const Joi = require('joi');

exports.userIdSchema = Joi.object({
  userId: Joi.string().required(),
});

exports.getUserFeedSchema = Joi.object({
  pageNum: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).default(20),
  type: Joi.string().trim().valid('replies', 'chits', 'topics', 'likes').required(),
});

exports.updateUserInfoSchema = Joi.object({
  url: Joi.string().uri().optional(),
  languages: Joi.array().items(Joi.string()).optional(),
  education: Joi.string().optional(),
  occupation: Joi.string().optional(),
});

exports.addUserMediaSchema = Joi.object({
  mediaUrl: Joi.string().uri().required(),
});

exports.updateProfileSchema = Joi.object({
  userName: Joi.string().min(3).max(30).optional(),
  fullName: Joi.string().min(3).max(30).optional(),
  dateOfBirth: Joi.date().max('now').optional().allow(null, ''),
  fullLocation: Joi.string().optional().allow(null, ''),
  description: Joi.string().optional().allow(null, ''),
  profilePicture: Joi.string().optional().allow(null, ''),
  bannerPicture: Joi.string().optional().allow(null, ''),
  coordinates: Joi.array().items(Joi.number()).length(2).optional(),
  url: Joi.string().uri().optional().allow(null, ''),
  phoneNumber: Joi.string().pattern(/^\d{5,20}$/).optional().allow(null, ''),
  countryCode: Joi.string().pattern(/^\+\d{1,4}$/).optional().allow(null, ''),
});
