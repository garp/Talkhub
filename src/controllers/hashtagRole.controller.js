const hashtagRoleServices = require('../services/hashtagRoleServices');
const userServices = require('../services/userServices');
const { asyncHandler } = require('../../lib/helpers/asyncHandler');
const { responseHandler, errorHandler } = require('../../lib/helpers/responseHandler');
const { userRoles } = require('../../lib/constants/userConstants');
const { assignRoleByKey } = require('../helpers/hashtagRoleResolver');

// Static seed data (role definitions)
const rolesSeedData = require('../../lib/constants/rolesSeedData.json');

exports.seedHashtagRoles = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const user = await userServices.findById({ id: userId });
  if (!user || user.role !== userRoles.GOD) {
    return errorHandler('ERR-129', res); // Not authorized
  }

  const seedRoles = Array.isArray(rolesSeedData) ? rolesSeedData : [];

  const results = [];
  // Upsert by (hashtagId:null, key)
  // NOTE: We intentionally ignore `_id` fields from the JSON seed.
  // eslint-disable-next-line no-restricted-syntax
  for (const r of seedRoles) {
    if (!r || !r.key) continue;
    // normalize: seed data uses "scope" but our model also stores "hashtagId" (null for global role defs)
    // SUPER_ADMIN is "global", others are "hashtag" (but still stored as definitions with hashtagId:null)
    const filter = { hashtagId: null, key: r.key };
    const body = {
      $set: {
        hashtagId: null,
        key: r.key,
        name: r.name,
        level: r.level,
        scope: r.scope,
        inherits: Array.isArray(r.inherits) ? r.inherits : [],
        details: Array.isArray(r.details) ? r.details : [],
        permissions: Array.isArray(r.permissions) ? r.permissions : [],
        isActive: typeof r.isActive === 'boolean' ? r.isActive : true,
      },
    };

    // eslint-disable-next-line no-await-in-loop
    const upserted = await hashtagRoleServices.findOneAndUpsert({ filter, body });
    results.push({ key: r.key, id: upserted && upserted._id });
  }

  return responseHandler({ message: 'Hashtag roles seeded', results }, res);
});

exports.assignHashtagRole = asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { hashtagId } = req.params;
  const { targetUserId, roleKey } = req.value;

  // Simple guard: only GOD can assign for now (we can expand to MASTER/SUPER_ADMIN later)
  const user = await userServices.findById({ id: userId });
  if (!user || user.role !== userRoles.GOD) {
    return errorHandler('ERR-129', res); // Not authorized
  }

  const assignment = await assignRoleByKey({
    userId: targetUserId,
    hashtagId,
    roleKey,
  });

  if (!assignment) {
    return errorHandler('ERR-006', res);
  }

  return responseHandler({ message: 'Role assigned', assignment }, res);
});

exports.getHashtagRoles = asyncHandler(async (req, res) => {
  const roles = await hashtagRoleServices.find({
    filter: { hashtagId: null, isActive: true },
    projection: {
      _id: 1,
      key: 1,
      name: 1,
      level: 1,
      scope: 1,
      inherits: 1,
      details: 1,
      permissions: 1,
      isActive: 1,
    },
    sort: { level: -1 },
  });

  const normalized = (roles || []).map((r) => ({
    ...r.toObject(),
    // Frontend dropdown label compatibility (backend role key is SUPER_ADMIN)
    displayKey: r.key === 'SUPER_ADMIN' ? 'ADMIN' : r.key,
  }));

  return responseHandler({ roles: normalized }, res);
});
