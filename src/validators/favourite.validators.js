const Joi = require('joi');

const favouriteTypes = ['people', 'hashtag', 'cafe', 'restaurant', 'hotel', 'museum', 'hospital'];

exports.createFavouriteSchema = Joi.object({
  placeId: Joi.string().required().trim()
    .messages({
      'string.empty': 'placeId cannot be empty',
      'any.required': 'placeId is required',
    }),
  type: Joi.string().valid(...favouriteTypes).required()
    .messages({
      'any.only': `type must be one of: ${favouriteTypes.join(', ')}`,
      'any.required': 'type is required',
    }),
  displayName: Joi.string().required().trim()
    .messages({
      'string.empty': 'displayName cannot be empty',
      'any.required': 'displayName is required',
    }),
  address: Joi.string().trim().allow('').default('')
    .messages({
      'string.base': 'address must be a string',
    }),
  location: Joi.object({
    latitude: Joi.number().min(-90).max(90).allow(null)
      .messages({
        'number.min': 'latitude must be between -90 and 90',
        'number.max': 'latitude must be between -90 and 90',
      }),
    longitude: Joi.number().min(-180).max(180).allow(null)
      .messages({
        'number.min': 'longitude must be between -180 and 180',
        'number.max': 'longitude must be between -180 and 180',
      }),
  }).default({ latitude: null, longitude: null }),
  rating: Joi.number().min(0).max(5).allow(null)
    .default(null)
    .messages({
      'number.min': 'rating must be between 0 and 5',
      'number.max': 'rating must be between 0 and 5',
    }),
  userRatingCount: Joi.number().integer().min(0).default(0)
    .messages({
      'number.base': 'userRatingCount must be a number',
      'number.integer': 'userRatingCount must be an integer',
      'number.min': 'userRatingCount must be a non-negative number',
    }),
  photos: Joi.array().items(Joi.string().allow('')).default([])
    .messages({
      'array.base': 'photos must be an array',
      'string.base': 'each photo must be a string',
    }),
  distance: Joi.number().min(0).allow(null).default(null)
    .messages({
      'number.min': 'distance must be a non-negative number',
    }),
});

exports.getFavouritesQuerySchema = Joi.object({
  type: Joi.string().valid(...favouriteTypes, 'all').default('all')
    .messages({
      'any.only': `type must be one of: all, ${favouriteTypes.join(', ')}`,
    }),
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

exports.deleteFavouriteParamsSchema = Joi.object({
  placeId: Joi.string().required()
    .messages({
      'string.empty': 'placeId cannot be empty',
      'any.required': 'placeId is required',
    }),
});
