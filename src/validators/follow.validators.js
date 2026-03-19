const Joi = require('joi');

exports.followUserSchema = Joi.object({
  userId: Joi.string().required(),
});

exports.unfollowUserSchema = Joi.object({
  userId: Joi.string().required(),
});

exports.getFollowListSchema = Joi.object({
  userId: Joi.string().required(),
  pageNum: Joi.number().min(1).default(1),
  pageSize: Joi.number().min(1).max(100).default(20),
});

exports.checkFollowStatusSchema = Joi.object({
  userId: Joi.string().required(),
});
