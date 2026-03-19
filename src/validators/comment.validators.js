const Joi = require('joi');

exports.createCommentSchema = Joi.object({
  content: Joi.string().trim().min(1).max(5000)
    .required(),
  postId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  parentCommentId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional().allow(null),
  replyTo: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional().allow(null),
  media: Joi.array().items(
    Joi.object({
      url: Joi.string().trim().uri().required(),
      mediaType: Joi.string().valid('image', 'video').required(),
    }),
  ).default([]),
});

exports.updateCommentSchema = Joi.object({
  content: Joi.string().trim().min(1).max(5000)
    .required(),
});
