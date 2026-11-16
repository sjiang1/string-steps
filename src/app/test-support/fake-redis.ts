// In-memory stand-in for @upstash/redis, covering the commands storage.ts
// uses. Hash and set commands store and return strings, like a client built
// with automaticDeserialization: false. One store is shared by every instance
// so the auto and raw clients in storage.ts see the same data; tests call
// FakeRedis.reset() in beforeEach.
//
// Install with:
//   vi.mock("@upstash/redis", async () => ({
//     Redis: (await import("./test-support/fake-redis")).FakeRedis,
//   }));
// and set process.env.KV_REST_API_URL before importing storage.ts.

// On globalThis, not module-level: vi.resetModules() gives the mock factory a
// fresh copy of this module, and the test file's own import must see the same
// data as the copy storage.ts ends up using.
const g = globalThis as unknown as { __fakeRedisStore?: Map<string, unknown> };
const store = (g.__fakeRedisStore ??= new Map<string, unknown>());

export class FakeRedis {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_opts?: unknown) {}

  static reset(): void {
    store.clear();
  }

  static dump(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of store) {
      out[k] = v instanceof Map ? Object.fromEntries(v) : v instanceof Set ? [...v] : v;
    }
    return out;
  }

  private hash(key: string): Map<string, string> {
    let h = store.get(key);
    if (!(h instanceof Map)) {
      h = new Map<string, string>();
      store.set(key, h);
    }
    return h as Map<string, string>;
  }

  private set_(key: string): Set<string> {
    let s = store.get(key);
    if (!(s instanceof Set)) {
      s = new Set<string>();
      store.set(key, s);
    }
    return s as Set<string>;
  }

  async get<T>(key: string): Promise<T | null> {
    return (store.get(key) as T) ?? null;
  }

  async set(key: string, value: unknown): Promise<"OK"> {
    store.set(key, value);
    return "OK";
  }

  // With automaticDeserialization off, the real client returns HGETALL as a
  // flat [field, value, field, value, …] array, and [] for a missing key
  // (pinned by storage.contract.test.ts).
  async hgetall(key: string): Promise<string[]> {
    const h = store.get(key);
    if (!(h instanceof Map)) return [];
    return [...h].flat();
  }

  async hget(key: string, field: string): Promise<string | null> {
    const h = store.get(key);
    if (!(h instanceof Map)) return null;
    return h.get(field) ?? null;
  }

  async hset(key: string, fields: Record<string, string>): Promise<number> {
    const h = this.hash(key);
    let added = 0;
    for (const [f, v] of Object.entries(fields)) {
      if (!h.has(f)) added++;
      h.set(f, v);
    }
    return added;
  }

  async hsetnx(key: string, field: string, value: string): Promise<0 | 1> {
    const h = this.hash(key);
    if (h.has(field)) return 0;
    h.set(field, value);
    return 1;
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    const h = store.get(key);
    if (!(h instanceof Map)) return 0;
    let n = 0;
    for (const f of fields) if (h.delete(f)) n++;
    return n;
  }

  async smembers(key: string): Promise<string[]> {
    const s = store.get(key);
    return s instanceof Set ? [...s] : [];
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    const s = this.set_(key);
    let n = 0;
    for (const m of members) {
      if (!s.has(m)) {
        s.add(m);
        n++;
      }
    }
    return n;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const s = store.get(key);
    if (!(s instanceof Set)) return 0;
    let n = 0;
    for (const m of members) if (s.delete(m)) n++;
    return n;
  }

  async incr(key: string): Promise<number> {
    const current = Number(store.get(key) ?? 0);
    const next = current + 1;
    store.set(key, String(next));
    return next;
  }
}
