/**
 * Hashtag RBAC utilities
 *
 * Role documents are stored in `hashtag-roles` collection and can inherit by role key.
 * User assignments are stored in `user-roles` collection and reference `hashtagRoleId`.
 */

const DEFAULT_ROLE_KEY = 'GUEST';

const uniq = (arr) => Array.from(new Set((arr || []).filter(Boolean)));

function buildRoleMap(roles = []) {
  const map = new Map();
  roles.forEach((r) => {
    if (r && r.key) map.set(r.key, r);
  });
  return map;
}

function expandRoleKeys(roleKey, roleMap, seen = new Set()) {
  if (!roleKey || seen.has(roleKey)) return [];
  seen.add(roleKey);
  const role = roleMap.get(roleKey);
  const inherits = (role && Array.isArray(role.inherits)) ? role.inherits : [];
  return uniq([roleKey, ...inherits.flatMap((k) => expandRoleKeys(k, roleMap, seen))]);
}

function permissionsForRole(roleKey, roleMap) {
  const keys = expandRoleKeys(roleKey, roleMap);
  const perms = keys.flatMap((k) => {
    const r = roleMap.get(k);
    return (r && Array.isArray(r.permissions)) ? r.permissions : [];
  });
  return { keys, permissions: uniq(perms) };
}

function normalizeRoleKey(roleKey) {
  return roleKey || DEFAULT_ROLE_KEY;
}

module.exports = {
  DEFAULT_ROLE_KEY,
  buildRoleMap,
  expandRoleKeys,
  permissionsForRole,
  normalizeRoleKey,
};
