import "server-only";
import { getAdminClient } from "@/lib/auth/admin";
import type { RunSummary } from "@/lib/search/orchestrator";

/**
 * 運用記録。会話・メール・住所・商品本文・価格・外部URLを記録しない。
 * 許可したキーだけを出力する。
 */
type LogFields = Record<string, string | number | boolean | null | undefined>;

export function opsLog(event: string, fields: LogFields = {}) {
  const safe: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === "string") safe[k] = v.slice(0, 80);
    else safe[k] = v;
  }
  console.info(JSON.stringify({ at: new Date().toISOString(), event, ...safe }));
}

export async function recordSearchRun(params: {
  requestId: string;
  userId: string | null;
  anonIdHash: string | null;
  wishId: string | null;
  wishVersion: number | null;
  summary: RunSummary | null;
  durationMs: number;
  providerCalls: number;
}) {
  const s = params.summary;
  const sourceOutcomes = Object.fromEntries((s?.sources ?? []).map((x) => [x.sourceId, { outcome: x.outcome, code: x.opsCode }]));
  const resultCounts = Object.fromEntries((s?.sources ?? []).map((x) => [x.sourceId, { shown: x.shown, excluded: x.excluded }]));
  opsLog("search_run", {
    requestId: params.requestId,
    searched: s?.searched ?? false,
    aiUsed: s?.aiUsed ?? "none",
    durationMs: params.durationMs,
    llmCalls: s?.llm.calls ?? 0,
    llmIn: s?.llm.inputTokens ?? 0,
    llmOut: s?.llm.outputTokens ?? 0,
    providerCalls: params.providerCalls,
    sources: JSON.stringify(sourceOutcomes),
  });
  const admin = getAdminClient();
  if (!admin) return;
  const { error } = await admin.from("search_runs").insert({
    request_id: params.requestId,
    user_id: params.userId,
    anon_id_hash: params.userId ? null : params.anonIdHash,
    wish_id: params.wishId,
    wish_version: params.wishVersion,
    ai_used: s?.aiUsed ?? "none",
    searched: s?.searched ?? false,
    source_outcomes: sourceOutcomes,
    result_counts: resultCounts,
    duration_ms: params.durationMs,
    llm_calls: s?.llm.calls ?? 0,
    llm_input_tokens: s?.llm.inputTokens ?? 0,
    llm_output_tokens: s?.llm.outputTokens ?? 0,
    provider_calls: params.providerCalls,
  });
  if (error) opsLog("search_run_record_failed", { code: error.code ?? "unknown" });
}

export const USAGE_EVENT_TYPES = [
  "search_started",
  "offers_shown",
  "wish_saved",
  "wish_updated",
  "wish_researched",
  "outbound_click",
  "feedback_submitted",
  "login_completed",
  "landing_view",
  "demo_cta_click",
  "demo_started",
] as const;
export type UsageEventType = (typeof USAGE_EVENT_TYPES)[number];

export async function recordUsageEvent(params: {
  eventType: UsageEventType;
  userId: string | null;
  anonIdHash: string | null;
  sourceId?: "rakuten" | "amazon" | null;
  placement?: "header" | "hero" | "preview" | "footer" | null;
  utm?: { source?: string | null; medium?: string | null; campaign?: string | null };
}) {
  opsLog("usage_event", {
    type: params.eventType,
    source: params.sourceId ?? null,
    placement: params.placement ?? null,
    authed: Boolean(params.userId),
  });
  const admin = getAdminClient();
  if (!admin) return;
  const { error } = await admin.from("usage_events").insert({
    event_type: params.eventType,
    user_id: params.userId,
    anon_id_hash: params.userId ? null : params.anonIdHash,
    source_id: params.sourceId ?? null,
    placement: params.placement ?? null,
    utm_source: params.utm?.source ?? null,
    utm_medium: params.utm?.medium ?? null,
    utm_campaign: params.utm?.campaign ?? null,
  });
  if (error) opsLog("usage_event_record_failed", { code: error.code ?? "unknown" });
}
