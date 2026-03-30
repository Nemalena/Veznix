"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redis = exports.redisConnectionOptions = void 0;
const ioredis_1 = require("ioredis");
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
exports.redisConnectionOptions = {
    maxRetriesPerRequest: null,
};
exports.redis = new ioredis_1.Redis(REDIS_URL, exports.redisConnectionOptions);
exports.redis.on('error', (err) => {
    console.error('Redis connection error:', err);
});
