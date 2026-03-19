const Joi = require('joi');

exports.postIdSchema = Joi.object({
  postId: Joi.string().required(),
});

exports.paginationSchema = Joi.object({
  pageNum: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).default(20),
});

exports.createReplySchema = Joi.object({
  hashtags: Joi.array().items(
    Joi.object({
      hashtagId: Joi.string().required(),
      hashtagName: Joi.string().trim().required(),
    }),
  ).optional(),
  content: Joi.object({
    text: Joi.string().trim().allow(''),
    images: Joi.array().items(
      Joi.object({
        url: Joi.string().uri().required(),
        altText: Joi.string().trim().required(),
      }),
    ).optional().min(1),
  }).or('text', 'images').required(),
});
