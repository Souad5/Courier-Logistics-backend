import { Redis } from "ioredis";

import { env } from "../config/env";

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (redis) return redis;
  if (!env.REDIS_URL) return null;
  redis = new Redis(env.REDIS_URL);
  redis.on("error", (err) => {
    console.error("⚠️ Redis error (falling back to no-cache):", err.message);
  });
  return redis;
}

export async function cacheGet(key: string): Promise<string | null> {
  const client = getRedis();
  if (!client) return null;
  return client.get(key);
}

export async function cacheSet(key: string, value: string, ttlSeconds = 300): Promise<void> {
  const client = getRedis();
  if (!client) return;
  await client.set(key, value, "EX", ttlSeconds);
}

export async function cacheDel(...keys: string[]): Promise<void> {
  const client = getRedis();
  if (!client) return;
  if (keys.length) await client.del(...keys);
}
