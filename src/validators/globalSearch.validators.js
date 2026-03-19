const Joi = require('joi');

/**
 * Global Search Query Schema
 *
 * Validates query parameters for the global search API.
 *
 * Parameters:
 * - keyword: Search term (required, 1-200 chars)
 * - type: Search type - 'all', 'chats', 'chits', 'people', 'topic', 'media' (default: 'all')
 * - subtype: When type='media', filter by media kind - 'all', 'video', 'image' (default: 'all')
 * - pageNum: Page number for pagination (default: 1)
 * - pageSize: Results per page (default: 20, max: 100)
 * - allSize: When type='all', limits results per category (default: 5, max: 20)
 */
exports.globalSearchQuerySchema = Joi.object({
  keyword: Joi.string().trim().max(200)
    .when('type', {
      is: 'media',
      then: Joi.string().allow('', null).default(''),
      otherwise: Joi.string().min(1).required(),
    })
    .messages({
      'string.empty': 'Search keyword is required',
      'string.min': 'Search keyword must be at least 1 character',
      'string.max': 'Search keyword cannot exceed 200 characters',
      'any.required': 'Search keyword is required',
    }),
  type: Joi.string()
    .valid('all', 'chats', 'chits', 'people', 'topic', 'media')
    .default('all')
    .messages({
      'any.only': 'Type must be one of: all, chats, chits, people, topic, media',
    }),
  subtype: Joi.string()
    .valid('all', 'video', 'image')
    .default('all')
    .messages({
      'any.only': 'Subtype must be one of: all, video, image',
    }),
  pageNum: Joi.number().integer().min(1)
    .default(1)
    .messages({
      'number.min': 'Page number must be at least 1',
    }),
  pageSize: Joi.number().integer().min(1).max(100)
    .default(20)
    .messages({
      'number.min': 'Page size must be at least 1',
      'number.max': 'Page size cannot exceed 100',
    }),
  allSize: Joi.number().integer().min(1).max(20)
    .default(5)
    .messages({
      'number.min': 'All size must be at least 1',
      'number.max': 'All size cannot exceed 20',
    }),
});
