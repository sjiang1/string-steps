// Pins the reply shapes of the real @upstash/redis client when
// automaticDeserialization is off, by driving it against a stubbed fetch. The
// FakeRedis test double must match these, so the Redis-path tests cannot pass
// on an assumption the library does not share (that bit us once: HGETALL is a
// flat array here, not an object).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Redis } from "@upstash/redis";

const sent: unknown[][] = [];
const realFetch = globalThis.fetch;

const enc = (v: unknown): unknown =>
  typeof v === "string" ? Buffer.from(v).toString("base64") : Array.isArray(v) ? v.map(enc) : v;

beforeEach(() => {
  sent.length = 0;
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? "[]") as unknown[];
    sent.push(body);
    const command = String(body[0]).toLowerCase();
    const key = body[1];
    let result: unknown;
    if (command === "hgetall") result = key === "missing" ? [] : ["a", "0", "b", '{"x":1}'];
    else if (command === "hget") result = "0";
    else if (command === "smembers") result = ["1", "x"];
    else result = 1;
    return new Response(JSON.stringify({ result: enc(result) }), { status: 200 });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const client = () =>
  new Redis({
    url: "https://stub.example",
    token: "t",
    automaticDeserialization: false,
    enableTelemetry: false,
    enableAutoPipelining: false,
  });

describe("@upstash/redis with automaticDeserialization: false", () => {
  it("returns HGETALL as a flat field/value array, and [] for a missing key", async () => {
    const r = client();
    expect(await r.hgetall("k")).toEqual(["a", "0", "b", '{"x":1}']);
    expect(await r.hgetall("missing")).toEqual([]);
  });

  it("returns HGET and SMEMBERS values as raw strings", async () => {
    const r = client();
    const one = await r.hget("k", "f");
    expect(one).toBe("0");
    expect(typeof one).toBe("string");
    expect(await r.smembers("k")).toEqual(["1", "x"]);
  });

  it("sends string hash values unchanged on HSET", async () => {
    await client().hset("k", { f: "0", g: '{"a":1}' });
    expect(sent.at(-1)).toEqual(["hset", "k", "f", "0", "g", '{"a":1}']);
  });
});
