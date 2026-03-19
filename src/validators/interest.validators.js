const Joi = require('joi');
const { ObjectId } = require('./common.validators');

exports.createInterestCategorySchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  slug: Joi.string().pattern(/^[a-z0-9-]+$/).optional(),
  description: Joi.string().allow('', null),
  icon: Joi.string().allow('', null),
  backgroundImage: Joi.string().allow('', null),
  order: Joi.number().integer().min(1),
  isActive: Joi.boolean().optional(),
});

exports.updateInterestCategorySchema = Joi.object({
  name: Joi.string().min(2).max(100),
  slug: Joi.string().pattern(/^[a-z0-9-]+$/),
  description: Joi.string().allow('', null),
  icon: Joi.string().allow('', null),
  backgroundImage: Joi.string().allow('', null),
  order: Joi.number().integer().min(1),
  isActive: Joi.boolean(),
});

exports.getInterestCategoryByIdSchema = Joi.object({
  categoryId: Joi.string().required().custom(ObjectId),
});

exports.getFollowedInterestCategoriesByUserIdParamsSchema = Joi.object({
  userId: Joi.string().required().custom(ObjectId),
});

exports.listInterestCategoriesQuerySchema = Joi.object({
  includeSubCategories: Joi.boolean().truthy('true').falsy('false').default(true),
  onlyActive: Joi.boolean().truthy('true').falsy('false').default(true),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100)
    .default(20),
  search: Joi.string().optional().allow('', null),
  categoryId: Joi.string().optional().custom(ObjectId),
});

exports.createInterestSubCategorySchema = Joi.object({
  categoryId: Joi.string().required().custom(ObjectId),
  name: Joi.string().min(2).max(100).required(),
  slug: Joi.string().pattern(/^[a-z0-9-]+$/).optional(),
  order: Joi.number().integer().min(1),
  isActive: Joi.boolean().optional(),
  aliases: Joi.array().items(Joi.string().min(1)).default([]),
  icon: Joi.string().allow('', null),
  backgroundImage: Joi.string().allow('', null),
});

exports.updateInterestSubCategorySchema = Joi.object({
  categoryId: Joi.string().custom(ObjectId),
  name: Joi.string().min(2).max(100),
  slug: Joi.string().pattern(/^[a-z0-9-]+$/),
  order: Joi.number().integer().min(1),
  isActive: Joi.boolean(),
  aliases: Joi.array().items(Joi.string().min(1)),
  icon: Joi.string().allow('', null),
  backgroundImage: Joi.string().allow('', null),
});

exports.getInterestSubCategoryByIdSchema = Joi.object({
  subCategoryId: Joi.string().required().custom(ObjectId),
});

exports.listSubCategoriesByCategoryParamsSchema = Joi.object({
  categoryId: Joi.string().required().custom(ObjectId),
});

exports.listSubCategoriesByCategoryQuerySchema = Joi.object({
  onlyActive: Joi.boolean().truthy('true').falsy('false').default(true),
  search: Joi.string().optional().allow('', null),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100)
    .default(20),
});

exports.updateManyInterestCategoriesSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        categoryId: Joi.string().required().custom(ObjectId),
        name: Joi.string().min(2).max(100),
        slug: Joi.string().pattern(/^[a-z0-9-]+$/),
        description: Joi.string().allow('', null),
        icon: Joi.string().allow('', null),
        backgroundImage: Joi.string().allow('', null),
        order: Joi.number().integer().min(1),
        isActive: Joi.boolean(),
      }),
    )
    .min(1)
    .required(),
});

exports.updateManyInterestSubCategorySchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        subCategoryId: Joi.string().required().custom(ObjectId),
        name: Joi.string().min(2).max(100),
        slug: Joi.string().pattern(/^[a-z0-9-]+$/),
        order: Joi.number().integer().min(1),
        isActive: Joi.boolean(),
        aliases: Joi.array().items(Joi.string().min(1)),
        icon: Joi.string().allow('', null),
        backgroundImage: Joi.string().allow('', null),
      }),
    )
    .min(1)
    .required(),
});
