const redisHelper = require('../../lib/helpers/connectRedis');

const HEARTBEAT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
const HEARTBEAT_KEY_PREFIX = 'heartbeat:';

const buildHeartbeatKey = (userId) => `${HEARTBEAT_KEY_PREFIX}${userId}`;
const getRedisClient = async () => redisHelper.getClient() || redisHelper.connectRedis();

exports.saveHeartbeat = async ({ userId, timestamp }) => {
  if (!userId) {
    throw new Error('Heartbeat requires a valid userId.');
  }

  const client = await getRedisClient();
  const key = buildHeartbeatKey(userId);
  const payload = JSON.stringify({
    active: true,
    timestamp,
  });

  await client.del(key);
  await client.set(key, payload, 'EX', HEARTBEAT_TTL_SECONDS);
  return true;
};

exports.getHeartbeat = async (userId) => {
  if (!userId) {
    throw new Error('Heartbeat lookup requires a valid userId.');
  }

  const client = await getRedisClient();
  const key = buildHeartbeatKey(userId);
  const raw = await client.get(key);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    await client.del(key);
    return null;
  }
};

exports.deleteHeartbeat = async (userId) => {
  if (!userId) {
    throw new Error('Heartbeat delete requires a valid userId.');
  }
  const client = await getRedisClient();
  const key = buildHeartbeatKey(userId);
  await client.del(key);
};

exports.HEARTBEAT_TTL_SECONDS = HEARTBEAT_TTL_SECONDS;
