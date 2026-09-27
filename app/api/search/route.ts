import { randomUUID } from "node:crypto";
import { getAuthContext } from "@/lib/auth/server";
import { getInitialCategory } from "@/lib/categories";
import { getExtractor } from "@/lib/llm";
import type { SearchEvent, SearchEventPayload } from "@/lib/schemas/search-api";
import { SearchRequestSchema } from "@/lib/schemas/search-api";
import { parseConditions } from "@/lib/schemas/wish";
import { runSearch, type RunSummary } from "@/lib/search/orchestrator";
import { getProviders } from "@/lib/search/providers/registry";
import { issueAnonCookie, readAnonId } from "@/lib/server/anon";
import { getEnv, isDemoMode } from "@/lib/server/env";
import { hashForKey, hashIp } from "@/lib/server/hash";
import { BodyTooLargeError, clientIp, isSameOrigin, jsonError, readJson } from "@/lib/server/http";
import { opsLog, recordSearchRun, recordUsageEvent } from "@/lib/server/ops-log";
import { beginSearch, quotaRejectionMessage, type Subject } from "@/lib/server/quota";
import { verifySearchContextToken } from "@/lib/server/search-context";
import { jstDate } from "@/lib/server/time";
import { encodeSseEvent } from "@/lib/sse";
import { SupabaseWishStore } from "@/lib/wishes/store";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError(403, "forbidden_origin", "不正なリクエストです。");

  let raw: unknown;
  try {
    raw = await readJson(request, 64_000);
  } catch (e) {
    return e instanceof BodyTooLargeError
      ? jsonError(413, "too_large", "入力が大きすぎます。")
      : jsonError(400, "invalid_json", "入力を読み取れませんでした。");
  }
  const parsed = SearchRequestSchema.safeParse(raw);
  if (!parsed.success) return jsonError(400, "invalid_request", "入力が不正です（自由文は2,000文字まで）。");
  const body = parsed.data;

  const conditionsResult = parseConditions(body.conditions);
  if (!conditionsResult.ok) {
    return jsonError(400, "invalid_conditions", "条件の指定が不正です。", { issues: conditionsResult.issues });
  }
  const env = getEnv();
  const category = getInitialCategory(env.INITIAL_CATEGORY);
  if (conditionsResult.value.categoryId !== category.id) {
    return jsonError(400, "unsupported_category", category.scopeDescription);
  }

  // 本人確認（任意）と短期匿名ID
  const auth = isDemoMode(env) ? null : await getAuthContext();
  let anonId = readAnonId(request.headers.get("cookie"));
  let setCookie: string | null = null;
  if (!auth && !anonId) {
    const issued = issueAnonCookie();
    anonId = issued.id;
    setCookie = issued.setCookie;
  }
  const subject: Subject = auth ? { kind: "user", id: auth.user.id } : { kind: "anon", id: anonId! };

  // 保存済み希望からの再検索（本人だけが使える一時コンテキスト）
  let wishRef: { id: string; version: number } | null = null;
  if (body.contextToken) {
    if (!auth) return jsonError(401, "unauthenticated", "保存した条件で探すにはログインが必要です。");
    const payload = verifySearchContextToken(body.contextToken, auth.user.id);
    if (!payload) return jsonError(400, "invalid_context", "検索コンテキストの有効期限が切れました。希望の詳細から再度お試しください。");
    wishRef = { id: payload.wishId, version: payload.version };
  }

  const requestId = randomUUID();
  const begun = await beginSearch({
    subject,
    ipHash: hashIp(clientIp(request)),
    clientRequestId: body.clientRequestId,
    requestId,
  });
  if (!begun.ok) {
    const { status, message } = quotaRejectionMessage(begun.reason);
    opsLog("search_rejected", { reason: begun.reason });
    return jsonError(status, begun.reason, message);
  }
  const quota = begun.quota;
  const startedAt = Date.now();

  const controller = new AbortController();
  const onClientAbort = () => controller.abort(new DOMException("client disconnected", "AbortError"));
  request.signal.addEventListener("abort", onClientAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("search timeout", "TimeoutError")), env.SEARCH_TIMEOUT_MS);

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      let closed = false;
      const send = (event: SearchEvent) => {
        if (closed) return;
        try {
          streamController.enqueue(encodeSseEvent(event));
        } catch {
          closed = true;
        }
      };
      const emit = (e: SearchEventPayload) => send({ ...e, requestId } as SearchEvent);

      let summary: RunSummary | null = null;
      try {
        emit({ type: "status", stage: "understanding", message: "検索を開始しました" });
        summary = await runSearch({
          requestId,
          message: body.message && body.message.length > 0 ? body.message : null,
          history: body.history.slice(-20),
          conditions: conditionsResult.value,
          category,
          providers: getProviders(),
          extractor: getExtractor(),
          today: jstDate(),
          reserveLlmCall: () => quota.reserveLlmCall(),
          reserveProviderCall: (sourceId) => quota.reserveProviderCall(sourceId),
          emit,
          signal: controller.signal,
        });
        if (controller.signal.aborted && !request.signal.aborted) {
          emit({
            type: "error",
            code: "timeout",
            message: "時間内に取得できた候補だけを表示しています。",
            retryable: true,
          });
        }
      } catch {
        emit({ type: "error", code: "internal", message: "検索中に問題が発生しました。", retryable: true });
      } finally {
        clearTimeout(timer);
        request.signal.removeEventListener("abort", onClientAbort);
        await quota.finish();
        emit({ type: "done", searched: summary?.searched ?? false });
        closed = true;
        try {
          streamController.close();
        } catch {
          // 既に閉じている
        }
        const anonHash = anonId ? hashForKey(anonId) : null;
        if (wishRef && auth && summary?.searched) {
          await new SupabaseWishStore(auth.supabase).touchSearched(wishRef.id).catch(() => undefined);
          await recordUsageEvent({ eventType: "wish_researched", userId: auth.user.id, anonIdHash: null });
        }
        if (summary?.searched && summary.sources.some((s) => s.shown > 0)) {
          await recordUsageEvent({ eventType: "offers_shown", userId: auth?.user.id ?? null, anonIdHash: anonHash });
        }
        await recordSearchRun({
          requestId,
          userId: auth?.user.id ?? null,
          anonIdHash: anonHash,
          wishId: wishRef?.id ?? null,
          wishVersion: wishRef?.version ?? null,
          summary,
          durationMs: Date.now() - startedAt,
          providerCalls: quota.usage().providerCalls,
        }).catch(() => undefined);
      }
    },
    cancel() {
      controller.abort(new DOMException("client disconnected", "AbortError"));
    },
  });

  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
  if (setCookie) headers["Set-Cookie"] = setCookie;
  return new Response(stream, { headers });
}
