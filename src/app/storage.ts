// Storage shared by server actions and plain server code (API routes,
// background jobs). In production every value lives in Upstash Redis; in local
// dev (no KV_REST_API_URL) the same data lives in JSON files under data/. Kept
// out of actions.ts on purpose: every export of that "use server" file becomes
// a callable endpoint, and these must not.
//
// Two families of helpers:
// - readJson/writeJson: one JSON value per key (students, teacher, checklist
//   blobs — effectively read-only).
// - hash*/set*/nextId: one Redis hash or set per collection, so a write touches
//   one field or member and can never erase another writer's record (#44).
import { Redis } from "@upstash/redis";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const useRedis = !!process.env.KV_REST_API_URL;
const credentials = {
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
};

export const redis = useRedis ? new Redis(credentials) : null;

// The client for hashes and sets. @upstash/redis otherwise JSON.parses every
// field value and member it reads, which would turn a schedule value "0" (a
// plan id) into the number 0. Values go through a Codec instead.
export const redisRaw = useRedis
  ? new Redis({ ...credentials, automaticDeserialization: false })
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

// --- Hash and set helpers ---

// Where a collection lives in dev. `slot` selects one top-level property of
// the file, for collections whose Redis keys are per day but whose dev data
// stays in one file (practice-log.json, notes-log.json).
export type FileRef = { path: string; slot?: string };

// How a field value is written to and read from Redis. The dev file never uses
// the codec: it stores plain JSON values.
export type Codec<T> = { encode(value: T): string; decode(raw: string): T };

export const stringCodec: Codec<string> = {
  encode: (value) => value,
  decode: (raw) => raw,
};

export function jsonCodec<T>(): Codec<T> {
  return {
    encode: (value) => JSON.stringify(value),
    decode: (raw) => JSON.parse(raw) as T,
  };
}

// With automaticDeserialization off, HGETALL comes back as a flat
// [field, value, field, value, …] array ([] for a missing key): turning the
// pairs into an object was part of the deserializer that got switched off.
// Pinned by storage.contract.test.ts. An object is accepted too in case a
// future client version changes its mind.
export function hashReplyToRecord(raw: unknown): Record<string, string> {
  if (Array.isArray(raw)) {
    const out: Record<string, string> = {};
    for (let i = 0; i + 1 < raw.length; i += 2) out[String(raw[i])] = String(raw[i + 1]);
    return out;
  }
  return (raw as Record<string, string> | null | undefined) ?? {};
}

function decodeAll<T>(raw: unknown, codec: Codec<T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [field, value] of Object.entries(hashReplyToRecord(raw))) out[field] = codec.decode(value);
  return out;
}

// -- Dev file access. A file holds either the collection itself or, with a
// slot, an object of collections keyed by slot. An emptied slot is removed.

function readFile(path: string): unknown {
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf-8"));
}

function readSlot<T>(file: FileRef, empty: T): T {
  const whole = readFile(file.path);
  if (file.slot === undefined) return (whole as T | undefined) ?? empty;
  const container = (whole as Record<string, T> | undefined) ?? {};
  return container[file.slot] ?? empty;
}

function writeSlot(file: FileRef, value: unknown, isEmpty: boolean): void {
  let next: unknown = value;
  if (file.slot !== undefined) {
    const container = ((readFile(file.path) as Record<string, unknown> | undefined) ?? {});
    if (isEmpty) delete container[file.slot];
    else container[file.slot] = value;
    next = container;
  }
  writeFileSync(file.path, JSON.stringify(next, null, 2) + "\n");
}

export async function hashGetAll<T>(
  redisKey: string,
  file: FileRef,
  codec: Codec<T>,
): Promise<Record<string, T>> {
  if (redisRaw) return decodeAll(await redisRaw.hgetall<Record<string, string>>(redisKey), codec);
  return readSlot<Record<string, T>>(file, {});
}

export async function hashGet<T>(
  redisKey: string,
  file: FileRef,
  codec: Codec<T>,
  field: string,
): Promise<T | null> {
  if (redisRaw) {
    const raw = await redisRaw.hget<string>(redisKey, field);
    return raw === null || raw === undefined ? null : codec.decode(raw);
  }
  return readSlot<Record<string, T>>(file, {})[field] ?? null;
}

export async function hashSet<T>(
  redisKey: string,
  file: FileRef,
  codec: Codec<T>,
  field: string,
  value: T,
): Promise<void> {
  if (redisRaw) {
    await redisRaw.hset(redisKey, { [field]: codec.encode(value) });
    return;
  }
  const hash = readSlot<Record<string, T>>(file, {});
  hash[field] = value;
  writeSlot(file, hash, false);
}

// HSETNX. True when the field was written, false when it already existed.
export async function hashSetIfAbsent<T>(
  redisKey: string,
  file: FileRef,
  codec: Codec<T>,
  field: string,
  value: T,
): Promise<boolean> {
  if (redisRaw) return (await redisRaw.hsetnx(redisKey, field, codec.encode(value))) === 1;
  const hash = readSlot<Record<string, T>>(file, {});
  if (field in hash) return false;
  hash[field] = value;
  writeSlot(file, hash, false);
  return true;
}

export async function hashDelete(redisKey: string, file: FileRef, field: string): Promise<void> {
  if (redisRaw) {
    await redisRaw.hdel(redisKey, field);
    return;
  }
  const hash = readSlot<Record<string, unknown>>(file, {});
  delete hash[field];
  writeSlot(file, hash, Object.keys(hash).length === 0);
}

// Returns the hash, writing `seed` first when Redis has nothing under the key
// so a fresh deployment boots from the committed demo data. In dev the file is
// the seed, so it is returned as is.
export async function hashSeedIfEmpty<T>(
  redisKey: string,
  file: FileRef,
  codec: Codec<T>,
  seed: Record<string, T>,
): Promise<Record<string, T>> {
  if (redisRaw) {
    const existing = hashReplyToRecord(await redisRaw.hgetall(redisKey));
    if (Object.keys(existing).length > 0) return decodeAll(existing, codec);
    const encoded: Record<string, string> = {};
    for (const [field, value] of Object.entries(seed)) encoded[field] = codec.encode(value);
    if (Object.keys(encoded).length > 0) await redisRaw.hset(redisKey, encoded);
    return seed;
  }
  return readSlot<Record<string, T>>(file, {});
}

export async function setMembers(redisKey: string, file: FileRef): Promise<string[]> {
  if (redisRaw) return (await redisRaw.smembers<string[]>(redisKey)) ?? [];
  return readSlot<string[]>(file, []);
}

// SADD. True when the member was new.
export async function setAdd(redisKey: string, file: FileRef, member: string): Promise<boolean> {
  if (redisRaw) return (await redisRaw.sadd(redisKey, member)) === 1;
  const members = readSlot<string[]>(file, []);
  if (members.includes(member)) return false;
  members.push(member);
  writeSlot(file, members, false);
  return true;
}

export async function setRemove(redisKey: string, file: FileRef, member: string): Promise<void> {
  if (redisRaw) {
    await redisRaw.srem(redisKey, member);
    return;
  }
  const members = readSlot<string[]>(file, []).filter((m) => m !== member);
  writeSlot(file, members, members.length === 0);
}

// INCR in Redis; `fallback()` computes the next id in dev, where one writer
// can safely derive it from the file.
export async function nextId(redisKey: string, fallback: () => Promise<number>): Promise<number> {
  if (redisRaw) return redisRaw.incr(redisKey);
  return fallback();
}
