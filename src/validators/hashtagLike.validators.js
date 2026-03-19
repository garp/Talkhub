const Joi = require('joi');

exports.hashtagIdSchema = Joi.object({
  hashtagId: Joi.string().required(),
});

exports.paginationSchema = Joi.object({
  pageNum: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).default(20),
});
