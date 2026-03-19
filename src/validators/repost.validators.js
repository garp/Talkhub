const Joi = require('joi');

/**
 * Schema for creating a repost
 * POST /repost/add-repost
 */
exports.addRepostSchema = Joi.object({
  postId: Joi.string().required().trim()
    .messages({
      'string.empty': 'postId cannot be empty',
      'any.required': 'postId is required',
    }),
  text: Joi.string().max(500).trim().allow('', null)
    .optional()
    .messages({
      'string.max': 'text cannot exceed 500 characters',
    }),
});

/**
 * Schema for removing a repost
 * DELETE /repost/remove-repost
 */
exports.removeRepostSchema = Joi.object({
  repostId: Joi.string().required().trim()
    .messages({
      'string.empty': 'repostId cannot be empty',
      'any.required': 'repostId is required',
    }),
});

/**
 * Schema for getting a single repost by ID
 * GET /repost/:repostId
 */
exports.getRepostParamsSchema = Joi.object({
  repostId: Joi.string().required()
    .messages({
      'string.empty': 'repostId cannot be empty',
      'any.required': 'repostId is required',
    }),
});

/**
 * Schema for getting all reposts by a user
 * GET /repost
 */
exports.getRepostsQuerySchema = Joi.object({
  userId: Joi.string().required()
    .messages({
      'string.empty': 'userId cannot be empty',
      'any.required': 'userId is required',
    }),
  pageNo: Joi.number().integer().min(1).default(1)
    .messages({
      'number.base': 'pageNo must be a number',
      'number.integer': 'pageNo must be an integer',
      'number.min': 'pageNo must be at least 1',
    }),
  pageLimit: Joi.number().integer().min(1).max(100)
    .default(20)
    .messages({
      'number.base': 'pageLimit must be a number',
      'number.integer': 'pageLimit must be an integer',
      'number.min': 'pageLimit must be at least 1',
      'number.max': 'pageLimit cannot exceed 100',
    }),
});

/**
 * Schema for updating repost text params
 * PUT /repost/:repostId
 */
exports.updateRepostParamsSchema = Joi.object({
  repostId: Joi.string().required()
    .messages({
      'string.empty': 'repostId cannot be empty',
      'any.required': 'repostId is required',
    }),
});

/**
 * Schema for updating repost text body
 * PUT /repost/:repostId
 */
exports.updateRepostBodySchema = Joi.object({
  text: Joi.string().max(500).trim().allow('', null)
    .messages({
      'string.max': 'text cannot exceed 500 characters',
    }),
});
