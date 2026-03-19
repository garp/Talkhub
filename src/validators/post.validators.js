const Joi = require('joi');
const { ObjectId } = require('./common.validators');

exports.postCreationSchema = Joi.object({
  location: Joi.string().trim().optional().allow(null, ''),
  text: Joi.string().trim().optional().allow(null, ''),
  media: Joi.array().items(
    Joi.object({
      url: Joi.string().uri().required(),
      thumbnailUrl: Joi.string().uri().optional().allow(null, ''),
      mediaType: Joi.string().valid('image', 'video').required(),
      assetId: Joi.string().custom(ObjectId).optional(),
    }),
  ).optional().min(1),
  labels: Joi.array().items(Joi.string().trim()).optional(),
  interestCategories: Joi.array()
    .items(Joi.string().custom(ObjectId))
    .optional(),
  interestSubCategories: Joi.array()
    .items(Joi.string().custom(ObjectId))
    .optional(),
  replySettings: Joi.string().valid('everyone', 'nobody').required().messages({
    'any.required': 'Reply settings is required to create a post',
    'string.base': 'Reply settings must be a string',
    'any.only': 'Reply settings must be either "everyone" or "nobody"',
  }),
  extraReplySetting: Joi.string().trim().optional().allow(null, ''),
}).or('text', 'media').messages({
  'object.missing': 'Post content is required. Please provide either text or media',
});

exports.getPostSchema = Joi.object({
  postId: Joi.string().required(),
});

exports.postDeletionSchema = Joi.object({
  postId: Joi.string().required(),
});

exports.getChatPostSchema = Joi.object({
  hashtagId: Joi.string().required(),
});

exports.postCountSchema = Joi.object({
  postId: Joi.string().required(),
});

exports.postEditSchema = Joi.object({
  postId: Joi.string().required(),
});

exports.postEditBodySchema = Joi.object({
  location: Joi.string().trim().optional().allow(null, ''),
  text: Joi.string().trim().optional().allow(null, ''),
  media: Joi.array().items(
    Joi.object({
      url: Joi.string().uri().required(),
      thumbnailUrl: Joi.string().uri().optional().allow(null, ''),
      mediaType: Joi.string().valid('image', 'video').required(),
      assetId: Joi.string().custom(ObjectId).optional(),
    }),
  ).optional().min(1),
  labels: Joi.array().items(Joi.string().trim()).optional(),
  replySettings: Joi.string().valid('everyone', 'nobody').optional(),
  extraReplySetting: Joi.string().trim().optional().allow(null, ''),
  interestCategories: Joi.array()
    .items(Joi.string().custom(ObjectId))
    .optional(),
  interestSubCategories: Joi.array()
    .items(Joi.string().custom(ObjectId))
    .optional(),
}).or('text', 'media').messages({
  'object.missing': 'Post content is required. Please provide either text or media',
});

exports.savePostSchema = Joi.object({
  postId: Joi.string().required(),
});

exports.removeSavedPostSchema = Joi.object({
  postId: Joi.string().required(),
});

exports.notInterestedSchema = Joi.object({
  postId: Joi.string().required().custom(ObjectId),
});

exports.notInterestedParamsSchema = Joi.object({
  postId: Joi.string().required().custom(ObjectId),
});

// Schema for getting post replies by user
exports.postRepliesParamsSchema = Joi.object({
  userId: Joi.string().required().custom(ObjectId),
});

exports.postRepliesQuerySchema = Joi.object({
  pageNum: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100)
    .default(20),
});
