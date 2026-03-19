const { ObjectId } = require('mongodb');
const hashtagRoleServices = require('../services/hashtagRoleServices');
const userRoleServices = require('../services/userRoleServices');
const {
  buildRoleMap,
  normalizeRoleKey,
  permissionsForRole,
} = require('../../lib/helpers/hashtagRbac');

/**
 * Resolve a user's effective hashtag role + permissions.
 *
 * Precedence:
 * 1) global assignment (hashtagId: null) if it resolves to SUPER_ADMIN
 * 2) hashtag-specific assignment (hashtagId)
 * 3) fallbackRoleKey (defaults to GUEST)
 */
exports.resolveHashtagRole = async ({
  userId,
  hashtagId,
  fallbackRoleKey = 'GUEST',
}) => {
  // Load all role definitions once per call (could be cached later)
  const roles = await hashtagRoleServices.find({
    filter: { isActive: true, hashtagId: null },
    projection: {
      key: 1,
      name: 1,
      level: 1,
      scope: 1,
      inherits: 1,
      permissions: 1,
      isActive: 1,
    },
    sort: { level: -1 },
  });
  const roleMap = buildRoleMap(roles);

  const baseFallback = normalizeRoleKey(fallbackRoleKey);

  // 1) global assignment (Super Admin)
  const globalAssignment = await userRoleServices.findOne({
    filter: { userId: new ObjectId(userId), hashtagId: null },
    projection: { hashtagRoleId: 1 },
  });

  if (globalAssignment && globalAssignment.hashtagRoleId) {
    const globalRoleDoc = await hashtagRoleServices.findById({ id: globalAssignment.hashtagRoleId });
    if (globalRoleDoc && globalRoleDoc.key === 'SUPER_ADMIN') {
      const { keys, permissions } = permissionsForRole('SUPER_ADMIN', roleMap);
      return {
        roleKey: 'SUPER_ADMIN',
        expandedRoleKeys: keys,
        permissions,
        source: 'global',
      };
    }
  }

  // 2) hashtag-specific assignment
  if (hashtagId) {
    const assignment = await userRoleServices.findOne({
      filter: { userId: new ObjectId(userId), hashtagId: new ObjectId(hashtagId) },
      projection: { hashtagRoleId: 1 },
    });

    if (assignment && assignment.hashtagRoleId) {
      const roleDoc = await hashtagRoleServices.findById({ id: assignment.hashtagRoleId });
      if (roleDoc && roleDoc.key) {
        const roleKey = roleDoc.key;
        const { keys, permissions } = permissionsForRole(roleKey, roleMap);
        return {
          roleKey,
          expandedRoleKeys: keys,
          permissions,
          source: 'hashtag',
        };
      }
    }
  }

  // 3) fallback
  const { keys, permissions } = permissionsForRole(baseFallback, roleMap);
  return {
    roleKey: baseFallback,
    expandedRoleKeys: keys,
    permissions,
    source: 'fallback',
  };
};

/**
 * Assign a role to a user for a hashtag (or globally if hashtagId is null).
 * Uses role key to find the `hashtag-roles` document.
 */
exports.assignRoleByKey = async ({
  userId,
  hashtagId = null,
  roleKey,
}) => {
  const role = await hashtagRoleServices.findOne({
    filter: { hashtagId: null, key: roleKey, isActive: true },
    projection: { _id: 1, key: 1 },
  });
  if (!role) return null;

  const filter = {
    userId: new ObjectId(userId),
    hashtagId: hashtagId ? new ObjectId(hashtagId) : null,
  };
  const body = {
    $set: {
      userId: filter.userId,
      hashtagId: filter.hashtagId,
      hashtagRoleId: role._id,
    },
  };

  return userRoleServices.findOneAndUpsert({ filter, body });
};
