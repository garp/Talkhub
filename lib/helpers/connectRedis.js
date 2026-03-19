const Redis = require('ioredis');
const config = require('../configs/redis.config');

let redisClient;

async function connectRedis() {
  if (!redisClient) {
    redisClient = new Redis(config);

    // redisClient.on('error', (err) => console.error('Redis Client Error', err));

    redisClient.on('connect', () => {
      // console.log('Connected to Redis');
    });
  }
  return redisClient;
}

async function disconnectRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    // console.log('Disconnected from Redis');
  }
}

module.exports = {
  connectRedis,
  disconnectRedis,
  getClient: () => redisClient,
};
