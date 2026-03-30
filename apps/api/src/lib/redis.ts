import { Redis, RedisOptions } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisConnectionOptions: RedisOptions = {
  maxRetriesPerRequest: null,
};

export const redis = new Redis(REDIS_URL, redisConnectionOptions);

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});
