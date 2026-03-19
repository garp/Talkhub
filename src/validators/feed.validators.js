const Joi = require('joi');

exports.paginationSchema = Joi.object({
  pageNum: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).default(20),
  searchText: Joi.string().optional().allow('', null),
});

exports.newFeedPaginationSchema = Joi.object({
  pageNum: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).default(20),
  searchText: Joi.string().optional().allow('', null),
  sortType: Joi.string().valid('createdAt', 'updatedAt').default('createdAt'),
  sortOrder: Joi.number().valid(1, -1).default(-1),
});
exports.paginationAroundMeSchema = Joi.object({
  pageNum: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).default(20),
  searchText: Joi.string().optional().allow('', null),
  latitude: Joi.number().required(),
  longitude: Joi.number().required(),
});
