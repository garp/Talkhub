const Joi = require('joi');
const { ObjectId } = require('./common.validators');
const { validateRequest } = require('../../lib/middlewares/validators.middleware');

// Validator for creating a story
exports.validateCreateStory = validateRequest(Joi.object({
  isHighlight: Joi.boolean().optional(),
  hashtagId: Joi.string().custom(ObjectId).optional(),
  audience: Joi.string().valid('followers', 'close_friends').optional(),
  caption: Joi.string().allow('', null).optional(),
  mentionUserIds: Joi.array().items(Joi.string().custom(ObjectId)).optional(),
  linkSticker: Joi.object({
    url: Joi.string().uri().allow('', null).optional(),
    label: Joi.string().allow('', null).optional(),
  }).optional(),
  interactive: Joi.object({
    polls: Joi.array().optional(),
    questions: Joi.array().optional(),
    sliders: Joi.array().optional(),
  }).optional(),
}), 'body');

// Validator for getting stories by user ID
exports.validateGetUserStories = validateRequest(Joi.object({
  userId: Joi.string().custom(ObjectId).required(),
}), 'params');

// Validator for updating a story params
exports.validateUpdateStoryParams = validateRequest(Joi.object({
  storyId: Joi.string().custom(ObjectId).required(),
}), 'params');

// Validator for updating a story body
exports.validateUpdateStoryBody = validateRequest(Joi.object({
  isHighlight: Joi.boolean().optional(),
  isActive: Joi.boolean().optional(),
}), 'body');

// Validator for deleting a story
exports.validateDeleteStory = validateRequest(Joi.object({
  storyId: Joi.string().custom(ObjectId).required(),
}), 'params');

// Validator for getting stories feed with pagination
exports.validateStoriesFeed = validateRequest(Joi.object({
  page: Joi.number().integer().min(1).optional()
    .default(1),
  limit: Joi.number().integer().min(1).max(50)
    .optional()
    .default(10),
}), 'query');

// Validator for storyId param
exports.validateStoryIdParam = validateRequest(Joi.object({
  storyId: Joi.string().custom(ObjectId).required(),
}), 'params');

exports.validateStoryViewersQuery = validateRequest(Joi.object({
  page: Joi.number().integer().min(1).optional()
    .default(1),
  limit: Joi.number().integer().min(1).max(50)
    .optional()
    .default(20),
}), 'query');

exports.validateStoryReactionBody = validateRequest(Joi.object({
  emoji: Joi.string().trim().min(1).max(32)
    .required(),
}), 'body');

// Validator for adding a story to highlights (params)
exports.validateAddToHighlight = validateRequest(Joi.object({
  storyId: Joi.string().custom(ObjectId).required(),
}), 'params');

// Validator for adding a story to highlights (body)
exports.validateAddToHighlightBody = validateRequest(Joi.object({
  collectionId: Joi.string().custom(ObjectId).optional(),
}), 'body');

// Validator for removing a story from highlights
exports.validateRemoveFromHighlight = validateRequest(Joi.object({
  storyId: Joi.string().custom(ObjectId).required(),
}), 'params');

// Validator for removing a story from a specific collection
exports.validateRemoveStoryFromCollection = validateRequest(Joi.object({
  collectionId: Joi.string().custom(ObjectId).required(),
  storyId: Joi.string().custom(ObjectId).required(),
}), 'params');

// Validator for muting/unmuting a user's stories
exports.validateStoryMuteBody = validateRequest(Joi.object({
  userId: Joi.string().custom(ObjectId).required(),
}), 'body');

// Validator for enabling/disabling story notifications for a user
exports.validateStoryNotifyBody = validateRequest(Joi.object({
  userId: Joi.string().custom(ObjectId).required(),
}), 'body');
