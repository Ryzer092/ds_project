import "server-only";
import type { SourceId } from "@/lib/schemas/offer";
import { getEnv, type AppEnv } from "./env";
import { hashForKey } from "./hash";
import { getLimitStore, LimitsUnavailableError, type LimitStore } from "./limit-store";

export type Subject = { kind: "user"; id: string } | { kind: "anon"; id: string };

export type QuotaRejection =
  | "duplicate_request"
  | "concurrent_search"
  | "rate_limited"
  | "daily_limit"
  | "global_limit"
  | "limits_unavailable";

const DAY_WINDOW_MS = 26 * 60 * 60 * 1000;
const MINUTE_WINDOW_MS = 60 * 1000;
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

/** 日本時間の日付（日次上限のキー）。 */
export function jstDay(now = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10).replaceAll("-", "");
}

export type SearchQuota = {
  /** LLM呼び出し1回分の費用枠を予約する。1検索あたり最大2回。 */
  reserveLlmCall(): Promise<boolean>;
  /** 商品API呼び出し1回分を予約する（1検索あたり合計最大4回、情報源ごとの毎秒・日次上限）。 */
  reserveProviderCall(sourceId: SourceId): Promise<"ok" | "search_budget" | "rate_limited" | "daily_limit">;
  usage(): { llmCalls: number; providerCalls: number };
  /** ロックを解放する。所有者を検証するため他の検索のロックは解放しない。 */
  finish(): Promise<void>;
};

export const PER_SEARCH_LIMITS = { llmCalls: 2, providerCalls: 4 } as const;

type Reservation = { key: string; amount: number };

export async function beginSearch(params: {
  subject: Subject;
  ipHash: string | null;
  clientRequestId: string;
  requestId: string;
  env?: AppEnv;
  store?: LimitStore;
  now?: Date;
}): Promise<{ ok: true; quota: SearchQuota } | { ok: false; reason: QuotaRejection }> {
  const env = params.env ?? getEnv();
  let store: LimitStore;
  try {
    store = params.store ?? getLimitStore();
  } catch (e) {
    if (e instanceof LimitsUnavailableError) return { ok: false, reason: "limits_unavailable" };
    throw e;
  }

  const day = jstDay(params.now);
  const subjectKey = `${params.subject.kind}:${hashForKey(params.subject.id)}`;
  const reservations: Reservation[] = [];
  const lockKey = `lock:search:${subjectKey}`;
  let lockHeld = false;

  const rollback = async () => {
    for (const r of reservations.reverse()) await store.release(r.key, r.amount).catch(() => undefined);
    if (lockHeld) await store.releaseLock(lockKey, params.requestId).catch(() => undefined);
  };

  try {
    // 1) 同じ clientRequestId の連打で処理（=課金）を増やさない
    const fresh = await store.claimOnce(
      `idem:${subjectKey}:${hashForKey(params.clientRequestId)}`,
      IDEMPOTENCY_TTL_MS,
    );
    if (!fresh) return { ok: false, reason: "duplicate_request" };

    // 2) 同時実行1（TTL付き、所有者付き）
    lockHeld = await store.acquireLock(lockKey, params.requestId, env.SEARCH_TIMEOUT_MS + 5000);
    if (!lockHeld) return { ok: false, reason: "concurrent_search" };

    const tryReserve = async (key: string, cap: number, windowMs: number) => {
      const r = await store.reserve(key, cap, windowMs);
      if (r.ok) reservations.push({ key, amount: 1 });
      return r.ok;
    };

    // 3) 利用者ごとの上限
    if (params.subject.kind === "anon") {
      const minute = Math.floor((params.now ?? new Date()).getTime() / MINUTE_WINDOW_MS);
      if (!(await tryReserve(`q:min:${minute}:${subjectKey}`, env.ANON_SEARCHES_PER_MINUTE, MINUTE_WINDOW_MS * 2))) {
        await rollback();
        return { ok: false, reason: "rate_limited" };
      }
      if (!(await tryReserve(`q:day:${day}:${subjectKey}`, env.ANON_SEARCHES_PER_DAY, DAY_WINDOW_MS))) {
        await rollback();
        return { ok: false, reason: "daily_limit" };
      }
      // 補助的なIP制限（短期ハッシュ）。匿名IDの作り直しによる回避を抑える。
      if (params.ipHash && !(await tryReserve(`q:ip:${day}:${params.ipHash}`, env.IP_SEARCHES_PER_DAY, DAY_WINDOW_MS))) {
        await rollback();
        return { ok: false, reason: "daily_limit" };
      }
    } else {
      if (!(await tryReserve(`q:day:${day}:${subjectKey}`, env.USER_SEARCHES_PER_DAY, DAY_WINDOW_MS))) {
        await rollback();
        return { ok: false, reason: "daily_limit" };
      }
    }

    // 4) 全体の日次検索上限（費用上限）
    if (!(await tryReserve(`q:global:${day}`, env.MAX_GLOBAL_SEARCHES_PER_DAY, DAY_WINDOW_MS))) {
      await rollback();
      return { ok: false, reason: "global_limit" };
    }
  } catch {
    // 制限基盤の障害時は検索を止める（フェイルクローズ）
    await rollback();
    return { ok: false, reason: "limits_unavailable" };
  }

  let llmCalls = 0;
  let providerCalls = 0;
  let finished = false;

  const quota: SearchQuota = {
    async reserveLlmCall() {
      if (llmCalls >= PER_SEARCH_LIMITS.llmCalls) return false;
      try {
        const r = await store.reserve(`q:llm:${day}`, env.MAX_LLM_CALLS_PER_DAY, DAY_WINDOW_MS);
        if (!r.ok) return false;
      } catch {
        return false;
      }
      llmCalls += 1;
      return true;
    },
    async reserveProviderCall(sourceId) {
      if (providerCalls >= PER_SEARCH_LIMITS.providerCalls) return "search_budget";
      try {
        const second = Math.floor(Date.now() / 1000);
        const rps = await store.reserve(`q:rps:${sourceId}:${second}`, env.PROVIDER_MAX_RPS, 2000);
        if (!rps.ok) return "rate_limited";
        const daily = await store.reserve(`q:prov:${day}:${sourceId}`, env.MAX_PROVIDER_CALLS_PER_DAY, DAY_WINDOW_MS);
        if (!daily.ok) return "daily_limit";
      } catch {
        return "rate_limited";
      }
      providerCalls += 1;
      return "ok";
    },
    usage() {
      return { llmCalls, providerCalls };
    },
    async finish() {
      if (finished) return;
      finished = true;
      await store.releaseLock(lockKey, params.requestId).catch(() => undefined);
    },
  };

  return { ok: true, quota };
}

export function quotaRejectionMessage(reason: QuotaRejection): { status: number; message: string } {
  switch (reason) {
    case "duplicate_request":
      return { status: 409, message: "同じ検索がすでに受け付けられています。" };
    case "concurrent_search":
      return { status: 429, message: "前の検索を処理中です。完了してから再度お試しください。" };
    case "rate_limited":
      return { status: 429, message: "短時間に検索が集中しています。1分ほど待ってから再度お試しください。" };
    case "daily_limit":
      return { status: 429, message: "本日の検索回数の上限に達しました。ログインすると上限が増えます。" };
    case "global_limit":
      return { status: 503, message: "本日のサービス全体の検索上限に達しました。明日以降に再度お試しください。" };
    case "limits_unavailable":
      return { status: 503, message: "現在、検索を一時停止しています。しばらくして再度お試しください。" };
  }
}
