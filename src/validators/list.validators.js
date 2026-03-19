const Joi = require('joi');
const { ObjectId } = require('./common.validators');

// Schema for creating a list
exports.createListSchema = Joi.object({
  name: Joi.string().required().min(1).max(100)
    .trim(),
  // Old way (still supported): create using participantIds (creates 1:1 chatrooms)
  participantIds: Joi.array().items(Joi.string().custom(ObjectId)).min(1)
    .optional(),
  // New way: create using existing chatrooms
  chatroomIds: Joi.array().items(Joi.string().custom(ObjectId)).min(1)
    .optional(),
  chatroomId: Joi.string().custom(ObjectId).optional(),
}).or('participantIds', 'chatroomIds', 'chatroomId');

// Schema for updating a list
exports.updateListSchema = Joi.object({
  name: Joi.string().min(1).max(100)
    .trim()
    .optional(),
  participantIds: Joi.array().items(Joi.string().custom(ObjectId)).min(1)
    .optional(),
  // Add a new chatroom to this list
  chatroomId: Joi.string().custom(ObjectId).optional(),
  // Replace the list's chatrooms with this exact set (supports removals)
  chatroomIds: Joi.array().items(Joi.string().custom(ObjectId)).min(1)
    .optional(),
}).min(1);

// Params schema for listId routes
exports.listIdParamsSchema = Joi.object({
  listId: Joi.string().required().custom(ObjectId),
});

// Optional query for fetching a single list by id (used by GET /group-list)
exports.getListQuerySchema = Joi.object({
  // Support either `id` or `listId` as query param
  id: Joi.string().custom(ObjectId).optional(),
  listId: Joi.string().custom(ObjectId).optional(),
}).or('id', 'listId');
