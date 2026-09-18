import { Redis } from "ioredis";

import { env } from "./index";

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (redis) return redis;
  if (!env.REDIS_URL) return null;
  redis = new Redis(env.REDIS_URL);
  redis.on("error", (err) => {
    console.error("⚠️ Redis unavailable (running without cache):", err.message);
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

export async function cacheDelete(...keys: string[]): Promise<void> {
  const client = getRedis();
  if (!client) return;
  if (keys.length > 0) await client.del(...keys);
}

/** Atomically increments a counter (creating it at 1 if absent). Returns 0 without Redis. */
export async function cacheIncr(key: string): Promise<number> {
  const client = getRedis();
  if (!client) return 0;
  return client.incr(key);
}
