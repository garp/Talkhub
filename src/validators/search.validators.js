const Joi = require('joi');

const searchTypes = ['all', 'people', 'hashtag', 'cafe', 'restaurant', 'hotel', 'museum', 'hospital'];

exports.searchNearbySchema = Joi.object({
  searchType: Joi.string().valid(...searchTypes).required()
    .messages({
      'any.only': `searchType must be one of: ${searchTypes.join(', ')}`,
      'any.required': 'searchType is required',
    }),
  latitude: Joi.number().min(-90).max(90).required()
    .messages({
      'number.min': 'latitude must be between -90 and 90',
      'number.max': 'latitude must be between -90 and 90',
      'any.required': 'latitude is required',
    }),
  longitude: Joi.number().min(-180).max(180).required()
    .messages({
      'number.min': 'longitude must be between -180 and 180',
      'number.max': 'longitude must be between -180 and 180',
      'any.required': 'longitude is required',
    }),
  radius: Joi.number().integer().positive().required()
    .messages({
      'number.base': 'radius must be a number',
      'number.integer': 'radius must be an integer',
      'number.positive': 'radius must be a positive number',
      'any.required': 'radius is required',
    }),
});

exports.placeDetailsParamsSchema = Joi.object({
  placeId: Joi.string().required()
    .messages({
      'string.empty': 'placeId cannot be empty',
      'any.required': 'placeId is required',
    }),
});
