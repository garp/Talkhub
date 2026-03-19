const mongoose = require('mongoose');
const interestCategoryServices = require('../services/interestCategoryServices');
const interestSubCategoryServices = require('../services/interestSubCategoryServices');
const postServices = require('../services/postServices');
const userServices = require('../services/userServices');
const { getAllPostsQuery } = require('../queries/post.queries');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { responseHandler, errorHandler } = require('../../lib/helpers/responseHandler');
const interestSeedData = require('../../lib/constants/interestSeedData');

const toSlug = (value = '') => value
  .toString()
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

exports.createInterestCategory = asyncHandler(async (req, res) => {
  const {
    name,
    slug,
    description = null,
    icon = null,
    backgroundImage = null,
    order,
    isActive = true,
  } = req.value;

  const finalSlug = slug || toSlug(name);

  const existing = await interestCategoryServices.findOne({
    filter: { $or: [{ name }, { slug: finalSlug }] },
  });

  if (existing) {
    return errorHandler('ERR-101', res);
  }

  let finalOrder = order;
  if (finalOrder == null) {
    const [lastCategory] = await interestCategoryServices.find({
      filter: {},
      sort: { order: -1 },
      pagination: { limit: 1 },
    });
    finalOrder = (lastCategory && lastCategory.order) ? lastCategory.order + 1 : 1;
  }

  const category = await interestCategoryServices.create({
    body: {
      name,
      slug: finalSlug,
      description,
      icon,
      backgroundImage,
      order: finalOrder,
      isActive,
    },
  });

  return responseHandler(category, res);
});

exports.getInterestCategories = asyncHandler(async (req, res) => {
  const {
    includeSubCategories,
    onlyActive,
    page = 1,
    limit = 20,
    search,
    categoryId,
  } = req.value;

  const { userId } = req.user || {};

  let followedCategoryIds = new Set();
  if (userId) {
    const user = await userServices.findOne({
      filter: { _id: userId },
      projection: { interestCategories: 1 },
    });

    if (user && Array.isArray(user.interestCategories)) {
      followedCategoryIds = new Set(
        user.interestCategories.map((id) => id.toString()),
      );
    }
  }

  const pageNum = Number(page);
  const limitNum = Number(limit);
  const skip = (pageNum - 1) * limitNum;

  const categoryFilter = {};
  if (onlyActive) {
    categoryFilter.isActive = true;
  }

  if (categoryId) {
    categoryFilter._id = categoryId;
  }

  if (search && typeof search === 'string' && search.trim()) {
    const regex = new RegExp(search.trim(), 'i');
    categoryFilter.$or = [
      { name: { $regex: regex } },
      { description: { $regex: regex } },
    ];
  }

  const aggregationPipeline = [
    {
      $match: categoryFilter,
    },
    {
      $facet: {
        categories: [
          { $sort: { order: 1, name: 1 } },
          { $skip: skip },
          { $limit: limitNum },
        ],
        totalCount: [
          { $count: 'count' },
        ],
      },
    },
  ];

  const aggResult = await interestCategoryServices.aggregate({ query: aggregationPipeline });
  const categories = (aggResult[0] && aggResult[0].categories) || [];
  const totalCountArray = aggResult[0] && aggResult[0].totalCount;
  const totalDocuments = (totalCountArray && totalCountArray[0] && totalCountArray[0].count) || 0;
  const totalPages = Math.ceil(totalDocuments / limitNum) || 1;

  const metadata = {
    page: pageNum,
    limit: limitNum,
    totalPages,
    totalDocuments,
  };

  const addFollowingFlag = (cat) => ({
    ...cat,
    isFollowing: followedCategoryIds.has(cat._id.toString()),
  });

  if (!includeSubCategories) {
    const data = categories.map(addFollowingFlag);
    return responseHandler({ metadata, data }, res);
  }

  const categoryIds = categories.map((c) => c._id);

  const subFilter = { categoryId: { $in: categoryIds } };
  if (onlyActive) {
    subFilter.isActive = true;
  }

  const subCategories = await interestSubCategoryServices.find({
    filter: subFilter,
    sort: { order: 1, name: 1 },
  });

  const subByCategory = subCategories.reduce((acc, sub) => {
    const key = sub.categoryId.toString();
    if (!acc[key]) acc[key] = [];
    acc[key].push(sub);
    return acc;
  }, {});

  const result = categories.map((cat) => ({
    ...addFollowingFlag(cat),
    subCategories: subByCategory[cat._id.toString()] || [],
  }));

  return responseHandler({ metadata, data: result }, res);
});

// Get categories followed by the user along with their subcategories
// Adds `isFollowed` flag to both categories and subcategories.
exports.getFollowedInterestCategories = asyncHandler(async (req, res) => {
  const { userId } = req.user;

  const user = await userServices.findOne({
    filter: { _id: userId },
    projection: {
      interestCategories: 1,
      interestSubCategories: 1,
    },
  });

  const hasCategories = user && Array.isArray(user.interestCategories) && user.interestCategories.length > 0;
  const hasSubCategories = user && Array.isArray(user.interestSubCategories) && user.interestSubCategories.length > 0;

  if (!user || (!hasCategories && !hasSubCategories)) {
    return responseHandler({ categories: [] }, res);
  }

  const followedSubCategoryIds = new Set(
    (user.interestSubCategories || []).map((id) => id.toString()),
  );

  const toPlain = (doc) => (
    doc && typeof doc.toObject === 'function' ? doc.toObject() : doc
  );

  // Derive category IDs from subcategories if interestCategories is empty
  let followedCategoryIds = (user.interestCategories || []).map((id) => id.toString());
  if (!followedCategoryIds.length && hasSubCategories) {
    const subCatDocs = await interestSubCategoryServices.find({
      filter: { _id: { $in: [...followedSubCategoryIds] }, isActive: true },
      projection: { categoryId: 1 },
    });
    const derivedSet = new Set(subCatDocs.map((sc) => sc.categoryId.toString()));
    followedCategoryIds = [...derivedSet];
  }

  const categoriesDocs = await interestCategoryServices.find({
    filter: {
      _id: { $in: followedCategoryIds },
      isActive: true,
    },
    sort: { order: 1, name: 1 },
  });

  if (!categoriesDocs || categoriesDocs.length === 0) {
    return responseHandler({ categories: [] }, res);
  }

  const categories = categoriesDocs.map(toPlain);
  const categoryIds = categories.map((c) => c._id.toString());

  const subCategoriesDocs = await interestSubCategoryServices.find({
    filter: {
      categoryId: { $in: categoryIds },
      isActive: true,
    },
    sort: { order: 1, name: 1 },
  });

  const subCategories = subCategoriesDocs.map(toPlain);

  const subByCategory = subCategories.reduce((acc, sub) => {
    const key = sub.categoryId.toString();
    if (!acc[key]) acc[key] = [];
    acc[key].push({
      ...sub,
      isFollowed: followedSubCategoryIds.has(sub._id.toString()),
    });
    return acc;
  }, {});

  const result = categories.map((cat) => {
    const catIdStr = cat._id.toString();
    return {
      ...cat,
      isFollowed: true,
      subCategories: subByCategory[catIdStr] || [],
    };
  });

  return responseHandler({ categories: result }, res);
});

// Get categories followed by a specific user (by userId param), along with their subcategories.
// Adds `isFollowed` flag to both categories and subcategories for THAT user.
exports.getFollowedInterestCategoriesByUserId = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const viewerUserId = (req.user && req.user.userId) ? req.user.userId : null;

  const [user, viewer] = await Promise.all([
    userServices.findOne({
      filter: { _id: userId },
      projection: {
        interestCategories: 1,
        interestSubCategories: 1,
      },
    }),
    viewerUserId ? userServices.findOne({
      filter: { _id: viewerUserId },
      projection: {
        interestCategories: 1,
        interestSubCategories: 1,
      },
    }) : null,
  ]);

  const userHasCategories = user && Array.isArray(user.interestCategories) && user.interestCategories.length > 0;
  const userHasSubCategories = user && Array.isArray(user.interestSubCategories) && user.interestSubCategories.length > 0;

  if (!user || (!userHasCategories && !userHasSubCategories)) {
    return responseHandler({ categories: [] }, res);
  }

  const followedSubCategoryIds = new Set(
    (user.interestSubCategories || []).map((id) => id.toString()),
  );

  const viewerFollowedCategoryIds = new Set(
    ((viewer && viewer.interestCategories) || []).map((id) => id.toString()),
  );
  const viewerFollowedSubCategoryIds = new Set(
    ((viewer && viewer.interestSubCategories) || []).map((id) => id.toString()),
  );

  const toPlain = (doc) => (
    doc && typeof doc.toObject === 'function' ? doc.toObject() : doc
  );

  // Derive category IDs from subcategories if interestCategories is empty
  let followedCategoryIds = (user.interestCategories || []).map((id) => id.toString());
  if (!followedCategoryIds.length && userHasSubCategories) {
    const subCatDocs = await interestSubCategoryServices.find({
      filter: { _id: { $in: [...followedSubCategoryIds] }, isActive: true },
      projection: { categoryId: 1 },
    });
    const derivedSet = new Set(subCatDocs.map((sc) => sc.categoryId.toString()));
    followedCategoryIds = [...derivedSet];
  }

  const categoriesDocs = await interestCategoryServices.find({
    filter: {
      _id: { $in: followedCategoryIds },
      isActive: true,
    },
    sort: { order: 1, name: 1 },
  });

  if (!categoriesDocs || categoriesDocs.length === 0) {
    return responseHandler({ categories: [] }, res);
  }

  const categories = categoriesDocs.map(toPlain);
  const categoryIds = categories.map((c) => c._id.toString());

  const subCategoriesDocs = await interestSubCategoryServices.find({
    filter: {
      categoryId: { $in: categoryIds },
      isActive: true,
    },
    sort: { order: 1, name: 1 },
  });

  const subCategories = subCategoriesDocs.map(toPlain);

  const subByCategory = subCategories.reduce((acc, sub) => {
    const key = sub.categoryId.toString();
    if (!acc[key]) acc[key] = [];
    acc[key].push({
      ...sub,
      isFollowed: followedSubCategoryIds.has(sub._id.toString()),
      isFollowedByViewer: viewerFollowedSubCategoryIds.has(sub._id.toString()),
    });
    return acc;
  }, {});

  const result = categories.map((cat) => {
    const catIdStr = cat._id.toString();
    return {
      ...cat,
      isFollowed: true,
      isFollowedByViewer: viewerFollowedCategoryIds.has(catIdStr),
      subCategories: subByCategory[catIdStr] || [],
    };
  });

  return responseHandler({ categories: result }, res);
});

exports.getInterestCategoryById = asyncHandler(async (req, res) => {
  const { categoryId } = req.value;

  const category = await interestCategoryServices.findById({ id: categoryId });
  if (!category) {
    return errorHandler('ERR-136', res);
  }

  return responseHandler(category, res);
});

exports.getInterestCategoryWithPosts = asyncHandler(async (req, res) => {
  const { categoryId } = req.value;
  const { userId } = req.user;
  const { page = 1, limit = 20 } = req.query;

  const category = await interestCategoryServices.findById({ id: categoryId });

  if (!category) {
    return errorHandler('ERR-136', res);
  }

  const subCategories = await interestSubCategoryServices.find({
    filter: { categoryId, isActive: true },
    projection: { _id: 1 },
  });

  const subCategoryIds = subCategories.map((sub) => sub._id);

  const filter = {
    $or: [
      { interestCategories: category._id },
      ...(subCategoryIds.length
        ? [{ interestSubCategories: { $in: subCategoryIds } }]
        : []),
    ],
  };

  const sort = { createdAt: -1 };
  const limitNum = Number(limit);
  const pageNum = Number(page);
  const pagination = {
    skip: (pageNum - 1) * limitNum,
    limit: limitNum,
  };

  const query = getAllPostsQuery(filter, sort, pagination, userId);
  const [
    posts,
    postCountAgg,
    followersCountAgg,
    userDoc,
  ] = await Promise.all([
    postServices.aggregate({ query }),
    postServices.aggregate({ query: [{ $match: filter }, { $count: 'count' }] }),
    userServices.aggregate({
      query: [
        { $match: { interestCategories: new mongoose.Types.ObjectId(categoryId) } },
        { $count: 'count' },
      ],
    }),
    userServices.findOne({
      filter: { _id: userId },
      projection: { interestCategories: 1 },
    }),
  ]);

  const postCount = (postCountAgg && postCountAgg[0] && postCountAgg[0].count) || 0;
  const followersCount = (followersCountAgg && followersCountAgg[0] && followersCountAgg[0].count) || 0;
  const isFollowed = !!(
    userDoc
    && Array.isArray(userDoc.interestCategories)
    && userDoc.interestCategories.some((id) => id.toString() === category._id.toString())
  );

  return responseHandler(
    {
      _id: category._id,
      name: category.name,
      icon: category.icon || null,
      backgroundImage: category.backgroundImage || null,
      description: category.description || null,
      isFollowed,
      postCount,
      followersCount,
      posts,
    },
    res,
  );
});

exports.updateInterestCategory = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  const updates = { ...req.value };

  if (updates.name && !updates.slug) {
    updates.slug = toSlug(updates.name);
  }

  Object.keys(updates).forEach((key) => {
    if (updates[key] === undefined) {
      delete updates[key];
    }
  });

  const category = await interestCategoryServices.findByIdAndUpdate({
    id: categoryId,
    body: updates,
  });

  if (!category) {
    return errorHandler('ERR-136', res);
  }

  return responseHandler(category, res);
});

exports.deleteInterestCategory = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;

  const category = await interestCategoryServices.findByIdAndUpdate({
    id: categoryId,
    body: { isActive: false },
  });

  if (!category) {
    return errorHandler('ERR-136', res);
  }

  await interestSubCategoryServices.updateMany({
    filter: { categoryId },
    body: { isActive: false },
  });

  return responseHandler({ message: 'Interest category deleted successfully' }, res);
});

exports.createInterestSubCategory = asyncHandler(async (req, res) => {
  const {
    categoryId,
    name,
    slug,
    order,
    isActive = true,
    aliases = [],
    icon = null,
    backgroundImage = null,
  } = req.value;

  const category = await interestCategoryServices.findById({ id: categoryId });
  if (!category) {
    return errorHandler('ERR-136', res);
  }

  const finalSlug = slug || toSlug(name);

  const existing = await interestSubCategoryServices.findOne({
    filter: { $or: [{ name, categoryId }, { slug: finalSlug }] },
  });

  if (existing) {
    return errorHandler('ERR-101', res);
  }

  let finalOrder = order;
  if (finalOrder == null) {
    const [lastSub] = await interestSubCategoryServices.find({
      filter: { categoryId },
      sort: { order: -1 },
      pagination: { limit: 1 },
    });
    finalOrder = (lastSub && lastSub.order) ? lastSub.order + 1 : 1;
  }

  const subCategory = await interestSubCategoryServices.create({
    body: {
      categoryId,
      name,
      slug: finalSlug,
      order: finalOrder,
      isActive,
      aliases,
      icon,
      backgroundImage,
    },
  });

  return responseHandler(subCategory, res);
});

exports.getSubCategoriesByCategory = asyncHandler(async (req, res) => {
  // NOTE: In the route, we validate `params` and then `query`.
  // `validateRequest()` previously overwrote `req.value`, so to be robust we read from params.
  const { categoryId } = req.params;
  const { userId } = req.user || {};
  const {
    onlyActive,
    search,
    page = 1,
    limit = 20,
  } = req.query;

  const pageNum = Number(page);
  const limitNum = Number(limit);
  const skip = (pageNum - 1) * limitNum;

  // Build subcategory filters for lookup pipeline
  const subMatchStages = [];
  if (onlyActive === 'true' || onlyActive === true) {
    subMatchStages.push({ $match: { isActive: true } });
  }

  if (search && typeof search === 'string' && search.trim()) {
    const regex = new RegExp(search.trim(), 'i');
    subMatchStages.push({
      $match: {
        $or: [
          { name: { $regex: regex } },
          { aliases: { $regex: regex } },
        ],
      },
    });
  }

  const pipeline = [
    { $match: { _id: new mongoose.Types.ObjectId(categoryId) } },
    {
      $lookup: {
        // Collection name for model `mongoose.model('interestSubCategories', ...)`
        from: 'interestsubcategories',
        localField: '_id',
        foreignField: 'categoryId',
        as: 'subDetila',
        pipeline: [
          ...subMatchStages,
          {
            $facet: {
              data: [
                { $sort: { order: 1, name: 1 } },
                { $skip: skip },
                { $limit: limitNum },
              ],
              totalCount: [{ $count: 'count' }],
            },
          },
        ],
      },
    },
    {
      $addFields: {
        data: { $ifNull: [{ $arrayElemAt: ['$subDetila.data', 0] }, []] },
        totalDocuments: {
          $ifNull: [
            { $arrayElemAt: [{ $arrayElemAt: ['$subDetila.totalCount.count', 0] }, 0] },
            0,
          ],
        },
      },
    },
    { $project: { subDetila: 0 } },
  ];

  const [result] = await interestCategoryServices.aggregate({ query: pipeline });

  const totalDocuments = (result && result.totalDocuments) || 0;
  const totalPages = Math.ceil(totalDocuments / limitNum) || 1;

  const metadata = {
    page: pageNum,
    limit: limitNum,
    totalPages,
    totalDocuments,
  };

  const data = (result && result.data) || [];

  // Add follow state per subcategory for this user
  let followedSubCategoryIds = new Set();
  if (userId) {
    const user = await userServices.findOne({
      filter: { _id: userId },
      projection: { interestSubCategories: 1 },
    });

    if (user && Array.isArray(user.interestSubCategories)) {
      followedSubCategoryIds = new Set(user.interestSubCategories.map((id) => id.toString()));
    }
  }

  const withFollowedFlag = data.map((sub) => ({
    ...sub,
    isFollowed: !!(sub && sub._id && followedSubCategoryIds.has(sub._id.toString())),
  }));

  return responseHandler({ metadata, data: withFollowedFlag }, res);
});

exports.getInterestSubCategoryById = asyncHandler(async (req, res) => {
  const { subCategoryId } = req.value;

  const subCategory = await interestSubCategoryServices.findById({ id: subCategoryId });
  if (!subCategory) {
    return errorHandler('ERR-137', res);
  }

  return responseHandler(subCategory, res);
});

exports.updateInterestSubCategory = asyncHandler(async (req, res) => {
  const { subCategoryId } = req.params;
  const updates = { ...req.value };

  if (updates.name && !updates.slug) {
    updates.slug = toSlug(updates.name);
  }

  Object.keys(updates).forEach((key) => {
    if (updates[key] === undefined) {
      delete updates[key];
    }
  });

  const subCategory = await interestSubCategoryServices.findByIdAndUpdate({
    id: subCategoryId,
    body: updates,
  });

  if (!subCategory) {
    return errorHandler('ERR-137', res);
  }

  return responseHandler(subCategory, res);
});

exports.deleteInterestSubCategory = asyncHandler(async (req, res) => {
  const { subCategoryId } = req.params;

  const subCategory = await interestSubCategoryServices.findByIdAndUpdate({
    id: subCategoryId,
    body: { isActive: false },
  });

  if (!subCategory) {
    return errorHandler('ERR-137', res);
  }

  return responseHandler({ message: 'Interest subcategory deleted successfully' }, res);
});

exports.updateManyInterestCategories = asyncHandler(async (req, res) => {
  const { items } = req.value;

  const ids = items.map((item) => item.categoryId);

  const existing = await interestCategoryServices.find({
    filter: { _id: { $in: ids } },
    projection: { _id: 1 },
  });

  if (!existing || existing.length !== ids.length) {
    return errorHandler('ERR-136', res);
  }

  const updated = await Promise.all(
    items.map((item) => {
      const { categoryId, ...fields } = item;
      const body = { ...fields };

      if (body.name && !body.slug) {
        body.slug = toSlug(body.name);
      }

      Object.keys(body).forEach((key) => {
        if (body[key] === undefined) {
          delete body[key];
        }
      });

      return interestCategoryServices.findByIdAndUpdate({
        id: categoryId,
        body,
      });
    }),
  );

  return responseHandler(
    {
      message: 'Interest categories updated successfully',
      data: updated,
    },
    res,
  );
});

exports.updateManyInterestSubCategories = asyncHandler(async (req, res) => {
  const { items } = req.value;

  const ids = items.map((item) => item.subCategoryId);

  const existing = await interestSubCategoryServices.find({
    filter: { _id: { $in: ids } },
    projection: { _id: 1 },
  });

  if (!existing || existing.length !== ids.length) {
    return errorHandler('ERR-137', res);
  }

  const updated = await Promise.all(
    items.map((item) => {
      const { subCategoryId, ...fields } = item;
      const body = { ...fields };

      if (body.name && !body.slug) {
        body.slug = toSlug(body.name);
      }

      Object.keys(body).forEach((key) => {
        if (body[key] === undefined) {
          delete body[key];
        }
      });

      return interestSubCategoryServices.findByIdAndUpdate({
        id: subCategoryId,
        body,
      });
    }),
  );

  return responseHandler(
    {
      message: 'Interest subcategories updated successfully',
      data: updated,
    },
    res,
  );
});

exports.seedInterests = asyncHandler(async (req, res) => {
  // Upsert categories and subcategories from static seed data
  // Idempotent: can be safely re-run.
  const results = await Promise.all(
    interestSeedData.map(async (categoryData) => {
      const categorySlug = categoryData.slug || toSlug(categoryData.name);
      const categoryBody = {
        name: categoryData.name,
        slug: categorySlug,
        description: categoryData.description || null,
        order: categoryData.order,
        isActive: true,
      };

      const category = await interestCategoryServices.findOneAndUpdate({
        filter: { slug: categorySlug },
        body: { $set: categoryBody },
      }) || await interestCategoryServices.create({ body: categoryBody });

      const { _id: categoryId } = category;

      const subResults = await Promise.all(
        categoryData.subCategories.map(async (sub, index) => {
          const subSlug = sub.slug || toSlug(sub.name);
          const subBody = {
            categoryId,
            name: sub.name,
            slug: subSlug,
            order: sub.order || index + 1,
            isActive: true,
            aliases: sub.aliases || [],
          };

          const subCategory = await interestSubCategoryServices.findOneAndUpdate({
            filter: { slug: subSlug },
            body: { $set: subBody },
          }) || await interestSubCategoryServices.create({ body: subBody });

          return subCategory;
        }),
      );

      return {
        category,
        subCategories: subResults,
      };
    }),
  );

  return responseHandler({ message: 'Interests seeded successfully', results }, res);
});
