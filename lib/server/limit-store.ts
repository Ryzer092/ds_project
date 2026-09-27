import "server-only";
import { Redis } from "@upstash/redis";
import { getEnv, isDemoMode, isProduction, redisConfigured } from "./env";

/**
 * 上限管理の基盤。すべて原子的に動作する操作だけを提供する。
 * - reserve: 上限付きカウンタの予約（超える場合は増やさずに拒否）
 * - release: 予約の取り消し（失敗した処理の枠を返す）
 * - acquireLock / releaseLock: 所有者付きTTLロック（解放時に所有者を検証）
 * - claimOnce: 冪等キー（同じ clientRequestId の重複処理を防ぐ）
 *
 * 保存するのはカウンタ・ロック値・ハッシュ化したキーだけで、商品情報や会話は保存しない。
 */
export interface LimitStore {
  readonly kind: "redis" | "memory";
  reserve(key: string, cap: number, windowMs: number, amount?: number): Promise<{ ok: boolean; count: number }>;
  release(key: string, amount?: number): Promise<void>;
  acquireLock(key: string, owner: string, ttlMs: number): Promise<boolean>;
  releaseLock(key: string, owner: string): Promise<boolean>;
  claimOnce(key: string, ttlMs: number): Promise<boolean>;
}

const RESERVE_LUA = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local amount = tonumber(ARGV[3])
if current + amount > tonumber(ARGV[1]) then
  return {0, current}
end
local v = redis.call('INCRBY', KEYS[1], amount)
if v == amount then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return {1, v}
`;

const RELEASE_LUA = `
local v = tonumber(redis.call('GET', KEYS[1]) or '0')
if v <= 0 then return 0 end
local amount = math.min(v, tonumber(ARGV[1]))
return redis.call('DECRBY', KEYS[1], amount)
`;

const RELEASE_LOCK_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export class RedisLimitStore implements LimitStore {
  readonly kind = "redis" as const;
  constructor(private readonly redis: Redis) {}

  async reserve(key: string, cap: number, windowMs: number, amount = 1) {
    const [ok, count] = (await this.redis.eval(RESERVE_LUA, [key], [cap, windowMs, amount])) as [number, number];
    return { ok: ok === 1, count: Number(count) };
  }

  async release(key: string, amount = 1) {
    await this.redis.eval(RELEASE_LUA, [key], [amount]);
  }

  async acquireLock(key: string, owner: string, ttlMs: number) {
    const res = await this.redis.set(key, owner, { nx: true, px: ttlMs });
    return res === "OK";
  }

  async releaseLock(key: string, owner: string) {
    const res = await this.redis.eval(RELEASE_LOCK_LUA, [key], [owner]);
    return Number(res) === 1;
  }

  async claimOnce(key: string, ttlMs: number) {
    const res = await this.redis.set(key, "1", { nx: true, px: ttlMs });
    return res === "OK";
  }
}

/** 開発・テスト用。単一プロセス内でのみ有効。本番の live では使わない。 */
export class MemoryLimitStore implements LimitStore {
  readonly kind = "memory" as const;
  private counters = new Map<string, { value: number; expiresAt: number }>();
  private values = new Map<string, { value: string; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  private counter(key: string) {
    const c = this.counters.get(key);
    if (c && c.expiresAt <= this.now()) {
      this.counters.delete(key);
      return undefined;
    }
    return c;
  }

  private value(key: string) {
    const v = this.values.get(key);
    if (v && v.expiresAt <= this.now()) {
      this.values.delete(key);
      return undefined;
    }
    return v;
  }

  async reserve(key: string, cap: number, windowMs: number, amount = 1) {
    const c = this.counter(key);
    const current = c?.value ?? 0;
    if (current + amount > cap) return { ok: false, count: current };
    if (c) c.value += amount;
    else this.counters.set(key, { value: amount, expiresAt: this.now() + windowMs });
    return { ok: true, count: current + amount };
  }

  async release(key: string, amount = 1) {
    const c = this.counter(key);
    if (c) c.value = Math.max(0, c.value - amount);
  }

  async acquireLock(key: string, owner: string, ttlMs: number) {
    if (this.value(key)) return false;
    this.values.set(key, { value: owner, expiresAt: this.now() + ttlMs });
    return true;
  }

  async releaseLock(key: string, owner: string) {
    const v = this.value(key);
    if (!v || v.value !== owner) return false;
    this.values.delete(key);
    return true;
  }

  async claimOnce(key: string, ttlMs: number) {
    if (this.value(key)) return false;
    this.values.set(key, { value: "1", expiresAt: this.now() + ttlMs });
    return true;
  }
}

export class LimitsUnavailableError extends Error {
  constructor(message = "制限基盤が利用できません") {
    super(message);
    this.name = "LimitsUnavailableError";
  }
}

let store: LimitStore | null = null;

/**
 * 制限基盤を返す。本番の live で Redis が未設定なら有料検索を止めるためエラーにする。
 * デモ・開発ではプロセス内メモリで代用する（複数インスタンスでは共有されない）。
 */
export function getLimitStore(): LimitStore {
  if (store) return store;
  const env = getEnv();
  if (redisConfigured(env)) {
    store = new RedisLimitStore(
      new Redis({
        url: env.UPSTASH_REDIS_REST_URL!,
        token: env.UPSTASH_REDIS_REST_TOKEN!,
        // 上限管理が暗黙に再試行を重ねないよう、SDKの自動再試行を止める。
        retry: { retries: 0 },
        enableTelemetry: false,
      }),
    );
    return store;
  }
  if (isProduction(env) && !isDemoMode(env)) {
    throw new LimitsUnavailableError("本番の live モードでは Upstash Redis の設定が必要です");
  }
  store = new MemoryLimitStore();
  return store;
}

/** テスト用に差し替える。 */
export function setLimitStoreForTesting(s: LimitStore | null) {
  store = s;
}
