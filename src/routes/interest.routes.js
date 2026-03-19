const router = require('express').Router();
const { validateRequest } = require('../../lib/middlewares/validators.middleware');
const {
  listInterestCategoriesQuerySchema,
  getInterestCategoryByIdSchema,
  getFollowedInterestCategoriesByUserIdParamsSchema,
  createInterestCategorySchema,
  updateInterestCategorySchema,
  createInterestSubCategorySchema,
  updateInterestSubCategorySchema,
  getInterestSubCategoryByIdSchema,
  listSubCategoriesByCategoryParamsSchema,
  listSubCategoriesByCategoryQuerySchema,
  updateManyInterestCategoriesSchema,
  updateManyInterestSubCategorySchema,
} = require('../validators/interest.validators');
const {
  createInterestCategory,
  getInterestCategories,
  getFollowedInterestCategories,
  getFollowedInterestCategoriesByUserId,
  getInterestCategoryById,
  getInterestCategoryWithPosts,
  updateInterestCategory,
  deleteInterestCategory,
  createInterestSubCategory,
  getSubCategoriesByCategory,
  getInterestSubCategoryById,
  updateInterestSubCategory,
  deleteInterestSubCategory,
  seedInterests,
  updateManyInterestCategories,
  updateManyInterestSubCategories,
} = require('../controllers/interest.controller');
const { verifyToken } = require('../../lib/middlewares/verifyToken.middleware');

// Seed all categories + subcategories from static data
router.post('/createMany', verifyToken, seedInterests);

// Category CRUD
router.post(
  '/categories',
  verifyToken,
  validateRequest(createInterestCategorySchema, 'body'),
  createInterestCategory,
);

router.get(
  '/categories',
  validateRequest(listInterestCategoriesQuerySchema, 'query'),
  getInterestCategories,
);

router.get(
  '/categories/followed',
  verifyToken,
  getFollowedInterestCategories,
);

router.get(
  '/categories/followed/:userId',
  verifyToken,
  validateRequest(getFollowedInterestCategoriesByUserIdParamsSchema, 'params'),
  getFollowedInterestCategoriesByUserId,
);

router.get(
  '/categories/:categoryId',
  verifyToken,
  validateRequest(getInterestCategoryByIdSchema, 'params'),
  getInterestCategoryById,
);

router.get(
  '/categories/:categoryId/details',
  verifyToken,
  validateRequest(getInterestCategoryByIdSchema, 'params'),
  getInterestCategoryWithPosts,
);

router.patch(
  '/categories/:categoryId',
  verifyToken,
  validateRequest(updateInterestCategorySchema, 'body'),
  updateInterestCategory,
);

router.patch(
  '/categories/bulk',
  verifyToken,
  validateRequest(updateManyInterestCategoriesSchema, 'body'),
  updateManyInterestCategories,
);

router.delete(
  '/categories/:categoryId',
  verifyToken,
  deleteInterestCategory,
);

// Subcategory CRUD
router.post(
  '/subcategories',
  verifyToken,
  validateRequest(createInterestSubCategorySchema, 'body'),
  createInterestSubCategory,
);

router.get(
  '/categories/:categoryId/subcategories',
  verifyToken,
  validateRequest(listSubCategoriesByCategoryParamsSchema, 'params'),
  validateRequest(listSubCategoriesByCategoryQuerySchema, 'query'),
  getSubCategoriesByCategory,
);

router.get(
  '/subcategories/:subCategoryId',
  verifyToken,
  validateRequest(getInterestSubCategoryByIdSchema, 'params'),
  getInterestSubCategoryById,
);

router.patch(
  '/subcategories/:subCategoryId',
  verifyToken,
  validateRequest(updateInterestSubCategorySchema, 'body'),
  updateInterestSubCategory,
);

router.patch(
  '/subcategories/bulk',
  verifyToken,
  validateRequest(updateManyInterestSubCategorySchema, 'body'),
  updateManyInterestSubCategories,
);

router.delete(
  '/subcategories/:subCategoryId',
  verifyToken,
  deleteInterestSubCategory,
);

module.exports = router;
