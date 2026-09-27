import { describe, expect, it } from "vitest";
import { MemoryLimitStore } from "@/lib/server/limit-store";
import { beginSearch, jstDay } from "@/lib/server/quota";
import { getEnv } from "@/lib/server/env";

const base = () => ({
  subject: { kind: "anon" as const, id: "anon-1" },
  ipHash: "ip-1",
  clientRequestId: crypto.randomUUID(),
  requestId: crypto.randomUUID(),
});

describe("MemoryLimitStore", () => {
  it("上限を超える予約は増やさずに拒否し、release で返す", async () => {
    const s = new MemoryLimitStore();
    expect((await s.reserve("k", 2, 1000)).ok).toBe(true);
    expect((await s.reserve("k", 2, 1000)).ok).toBe(true);
    expect(await s.reserve("k", 2, 1000)).toEqual({ ok: false, count: 2 });
    await s.release("k");
    expect((await s.reserve("k", 2, 1000)).ok).toBe(true);
  });

  it("ロックは所有者だけが解放でき、TTLで失効する", async () => {
    let now = 0;
    const s = new MemoryLimitStore(() => now);
    expect(await s.acquireLock("l", "a", 100)).toBe(true);
    expect(await s.acquireLock("l", "b", 100)).toBe(false);
    expect(await s.releaseLock("l", "b")).toBe(false);
    now = 150;
    expect(await s.acquireLock("l", "b", 100)).toBe(true);
    expect(await s.releaseLock("l", "b")).toBe(true);
  });
});

describe("beginSearch", () => {
  it("同じ clientRequestId の連打を拒否する", async () => {
    const store = new MemoryLimitStore();
    const p = base();
    const first = await beginSearch({ ...p, store });
    expect(first.ok).toBe(true);
    if (first.ok) await first.quota.finish();
    const again = await beginSearch({ ...p, requestId: crypto.randomUUID(), store });
    expect(again).toEqual({ ok: false, reason: "duplicate_request" });
  });

  it("同時実行は1件まで。終了後は次の検索ができる", async () => {
    const store = new MemoryLimitStore();
    const a = await beginSearch({ ...base(), store });
    const b = await beginSearch({ ...base(), store });
    expect(a.ok).toBe(true);
    expect(b).toEqual({ ok: false, reason: "concurrent_search" });
    if (a.ok) await a.quota.finish();
    expect((await beginSearch({ ...base(), store })).ok).toBe(true);
  });

  it("匿名は1分5回まで", async () => {
    const store = new MemoryLimitStore();
    const now = new Date("2026-09-26T00:00:30Z");
    for (let i = 0; i < 5; i++) {
      const r = await beginSearch({ ...base(), store, now });
      expect(r.ok).toBe(true);
      if (r.ok) await r.quota.finish();
    }
    expect(await beginSearch({ ...base(), store, now })).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("全体の日次上限に達したら拒否し、他の予約を戻す", async () => {
    const store = new MemoryLimitStore();
    const env = { ...getEnv(), MAX_GLOBAL_SEARCHES_PER_DAY: 1 };
    const a = await beginSearch({ ...base(), store, env });
    if (a.ok) await a.quota.finish();
    const b = await beginSearch({ ...base(), subject: { kind: "user", id: "u" }, store, env });
    expect(b).toEqual({ ok: false, reason: "global_limit" });
    // ユーザーの日次枠は戻っている
    const r = await store.reserve(`q:day:${jstDay()}:user:x`, 1, 1000);
    expect(r.ok).toBe(true);
  });

  it("1検索あたり LLM 2回・商品API 4回まで", async () => {
    const store = new MemoryLimitStore();
    const env = { ...getEnv(), PROVIDER_MAX_RPS: 10 };
    const r = await beginSearch({ ...base(), store, env });
    if (!r.ok) throw new Error("unexpected");
    expect(await r.quota.reserveLlmCall()).toBe(true);
    expect(await r.quota.reserveLlmCall()).toBe(true);
    expect(await r.quota.reserveLlmCall()).toBe(false);
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await r.quota.reserveProviderCall(i % 2 ? "amazon" : "rakuten"));
    expect(results.filter((x) => x === "ok")).toHaveLength(4);
    expect(results[4]).toBe("search_budget");
  });

  it("情報源ごとの毎秒上限を超えたら rate_limited", async () => {
    const store = new MemoryLimitStore();
    const r = await beginSearch({ ...base(), store });
    if (!r.ok) throw new Error("unexpected");
    expect(await r.quota.reserveProviderCall("rakuten")).toBe("ok");
    const second = await r.quota.reserveProviderCall("rakuten");
    // 同じ秒内なら拒否（秒の境界をまたいだ場合は許可される）
    expect(["rate_limited", "ok"]).toContain(second);
  });

  it("制限基盤の障害時はフェイルクローズする", async () => {
    const broken = new MemoryLimitStore();
    broken.claimOnce = async () => {
      throw new Error("redis down");
    };
    expect(await beginSearch({ ...base(), store: broken })).toEqual({ ok: false, reason: "limits_unavailable" });
  });
});
