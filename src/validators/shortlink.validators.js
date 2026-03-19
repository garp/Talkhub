const Joi = require('joi');

const validScreens = ['publicchat', 'privatechat', 'post', 'profile', 'topic', 'hashtag', 'referral', 'story', 'message'];

exports.createShortlinkSchema = Joi.object({
  screen: Joi.string().valid(...validScreens).required()
    .messages({
      'any.only': `screen must be one of: ${validScreens.join(', ')}`,
      'any.required': 'screen is required',
      'string.empty': 'screen cannot be empty',
    }),
  id: Joi.string().required().trim()
    .messages({
      'string.empty': 'id cannot be empty',
      'any.required': 'id is required',
    }),
  type: Joi.string().trim().allow(null, '').default(null)
    .messages({
      'string.base': 'type must be a string',
    }),
  name: Joi.string().trim().allow(null, '').default(null)
    .messages({
      'string.base': 'name must be a string',
    }),
  expiresIn: Joi.number().integer().min(1).max(8760)
    .allow(null)
    .default(null)
    .messages({
      'number.base': 'expiresIn must be a number',
      'number.integer': 'expiresIn must be an integer',
      'number.min': 'expiresIn must be at least 1 hour',
      'number.max': 'expiresIn cannot exceed 8760 hours (1 year)',
    }),
  extra: Joi.object().allow(null).default(null)
    .messages({
      'object.base': 'extra must be an object',
    }),
});

exports.resolveShortlinkParamsSchema = Joi.object({
  code: Joi.string().length(6).required()
    .messages({
      'string.length': 'code must be exactly 6 characters',
      'string.empty': 'code cannot be empty',
      'any.required': 'code is required',
    }),
});

exports.getShortlinksQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1)
    .messages({
      'number.base': 'page must be a number',
      'number.integer': 'page must be an integer',
      'number.min': 'page must be at least 1',
    }),
  limit: Joi.number().integer().min(1).max(100)
    .default(20)
    .messages({
      'number.base': 'limit must be a number',
      'number.integer': 'limit must be an integer',
      'number.min': 'limit must be at least 1',
      'number.max': 'limit cannot exceed 100',
    }),
});

exports.getUrlDetailsSchema = Joi.object({
  url: Joi.string().required().trim()
    .messages({
      'string.empty': 'url cannot be empty',
      'any.required': 'url is required',
    }),
});
