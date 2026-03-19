const Joi = require('joi');

exports.postIdSchema = Joi.object({
  postId: Joi.string().required(),
});

exports.paginationSchema = Joi.object({
  pageNum: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).default(20),
});
