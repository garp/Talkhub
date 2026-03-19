const Joi = require('joi');
const { ObjectId } = require('./common.validators');
const { validateRequest } = require('../../lib/middlewares/validators.middleware');

// Validator for creating a highlight collection
exports.validateCreateCollection = validateRequest(Joi.object({
  name: Joi.string().trim().min(1).max(50)
    .required()
    .messages({
      'string.empty': 'Collection name is required',
      'string.min': 'Collection name must be at least 1 character',
      'string.max': 'Collection name cannot exceed 50 characters',
    }),
  coverUrl: Joi.string().uri().optional().allow(''),
  coverStoryId: Joi.string().custom(ObjectId).optional(),
}), 'body');

// Validator for updating a highlight collection
exports.validateUpdateCollection = validateRequest(Joi.object({
  collectionId: Joi.string().custom(ObjectId).required(),
}), 'params');

exports.validateUpdateCollectionBody = validateRequest(Joi.object({
  name: Joi.string().trim().min(1).max(50)
    .optional(),
  coverUrl: Joi.string().uri().optional().allow(''),
  coverStoryId: Joi.string().custom(ObjectId).optional(),
}), 'body');

// Validator for deleting a highlight collection
exports.validateDeleteCollection = validateRequest(Joi.object({
  collectionId: Joi.string().custom(ObjectId).required(),
}), 'params');

// Validator for getting a specific highlight collection
exports.validateGetCollection = validateRequest(Joi.object({
  collectionId: Joi.string().custom(ObjectId).required(),
}), 'params');
