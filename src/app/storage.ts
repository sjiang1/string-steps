// JSON storage shared by server actions and plain server code (API routes,
// background jobs). In production every value lives in Upstash Redis under a
// key; in local dev (no KV_REST_API_URL) the same value lives in a JSON file
// under data/. Kept out of actions.ts on purpose: every export of that
// "use server" file becomes a callable endpoint, and these must not.
import { Redis } from "@upstash/redis";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const useRedis = !!process.env.KV_REST_API_URL;
export const redis = useRedis
  ? new Redis({
      url: process.env.KV_REST_API_URL!,
      token: process.env.KV_REST_API_TOKEN!,
    })
  : null;

// Resolved at call time so tests can point a store at a temp file after import.
export function dataPath(envVar: string, fileName: string): string {
  return process.env[envVar] ?? join(process.cwd(), "data", fileName);
}

export async function readJson<T>(redisKey: string, filePath: string, seed: T): Promise<T> {
  if (redis) {
    const existing = await redis.get<T>(redisKey);
    if (existing !== null && existing !== undefined) return existing;
    await redis.set(redisKey, seed);
    return seed;
  }
  return JSON.parse(readFileSync(filePath, "utf-8")) as T;
}

export async function writeJson<T>(redisKey: string, filePath: string, value: T): Promise<void> {
  if (redis) {
    await redis.set(redisKey, value);
  } else {
    writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
  }
}
