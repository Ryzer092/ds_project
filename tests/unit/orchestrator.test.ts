import { describe, expect, it } from "vitest";
import { desksCategory } from "@/lib/categories/desks";
import { DemoParserExtractor } from "@/lib/llm/demo-parser";
import type { ConditionExtractor } from "@/lib/llm/types";
import type { SearchEventPayload } from "@/lib/schemas/search-api";
import { runSearch, type OrchestratorInput } from "@/lib/search/orchestrator";
import { DemoProvider } from "@/lib/search/providers/demo";
import type { SearchProvider } from "@/lib/search/providers/types";
import { conditions } from "../support/factories";

function failing(sourceId: "rakuten" | "amazon", outcome: "timeout" | "rate_limited" | "error"): SearchProvider {
  return {
    sourceId,
    label: sourceId,
    demo: true,
    affiliate: false,
    status: () => "ready",
    search: async () => ({ outcome, offers: [], opsCode: outcome }),
  };
}

function throwing(sourceId: "rakuten" | "amazon"): SearchProvider {
  return { ...failing(sourceId, "error"), search: async () => Promise.reject(new Error("boom")) };
}

async function run(overrides: Partial<OrchestratorInput>) {
  const events: SearchEventPayload[] = [];
  const summary = await runSearch({
    requestId: "r",
    message: null,
    history: [],
    conditions: conditions({ productType: "デスク" }),
    category: desksCategory,
    providers: [new DemoProvider("rakuten", undefined, 0), new DemoProvider("amazon", undefined, 0)],
    extractor: new DemoParserExtractor(),
    today: "2026-09-26",
    reserveLlmCall: async () => true,
    reserveProviderCall: async () => "ok",
    emit: (e) => events.push(e),
    signal: new AbortController().signal,
    ...overrides,
  });
  return { events, summary };
}

describe("runSearch", () => {
  it("フォーム検索（メッセージなし）では条件抽出を使わず検索する", async () => {
    const { events, summary } = await run({});
    expect(summary.aiUsed).toBe("none");
    expect(events.filter((e) => e.type === "offers")).toHaveLength(2);
  });

  it("片方の情報源が timeout / 429 / 例外でも、もう片方の結果を残す", async () => {
    for (const bad of [failing("amazon", "timeout"), failing("amazon", "rate_limited"), throwing("amazon")]) {
      const { events, summary } = await run({ providers: [new DemoProvider("rakuten", undefined, 0), bad] });
      const offers = events.filter((e) => e.type === "offers");
      expect(offers).toHaveLength(1);
      expect(offers[0]).toMatchObject({ sourceId: "rakuten" });
      expect(summary.sources.find((s) => s.sourceId === "amazon")?.outcome).not.toBe("ok");
      expect(events.some((e) => e.type === "error" && e.code === "all_sources_failed")).toBe(false);
    }
  });

  it("両方失敗なら0件ではなく取得失敗として通知する", async () => {
    const { events } = await run({ providers: [failing("rakuten", "error"), failing("amazon", "timeout")] });
    expect(events.some((e) => e.type === "error" && e.code === "all_sources_failed")).toBe(true);
  });

  it("未接続の情報源は検索せず、利用できないことを通知する（デモで埋めない）", async () => {
    const unavailable: SearchProvider = { ...failing("amazon", "error"), status: () => "missing_credentials" };
    const { events } = await run({ providers: [new DemoProvider("rakuten", undefined, 0), unavailable] });
    expect(events).toContainEqual(expect.objectContaining({ type: "source_status", sourceId: "amazon", outcome: "unavailable" }));
    expect(events.filter((e) => e.type === "offers" && e.sourceId === "amazon")).toHaveLength(0);
  });

  it("AIが使えない場合、自由文検索は成功したように見せずフォーム検索を案内する", async () => {
    const { events, summary } = await run({ message: "白いデスク", extractor: null });
    expect(summary.searched).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({ type: "error", code: "ai_unavailable" }));
  });

  it("条件抽出の失敗時は検索せずエラーを返す", async () => {
    const broken: ConditionExtractor = {
      kind: "llm",
      extract: async () => ({ ok: false, reason: "failed", usage: { calls: 2, inputTokens: 10, outputTokens: 0 } }),
    };
    const { events, summary } = await run({ message: "白いデスク", extractor: broken });
    expect(summary.searched).toBe(false);
    expect(summary.llm.calls).toBe(2);
    expect(events).toContainEqual(expect.objectContaining({ type: "error", code: "ai_failed" }));
  });

  it("範囲外の希望は案内して検索しない", async () => {
    const { events, summary } = await run({ message: "おすすめの椅子を教えて", conditions: conditions() });
    expect(summary.searched).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({ type: "clarification", outOfScope: true }));
  });

  it("商品タイトル中の指示やHTMLは実行・表示されずテキストとして扱う", async () => {
    const { events } = await run({});
    const offers = events.flatMap((e) => (e.type === "offers" ? [...e.offers, ...e.excluded] : []));
    const injected = offers.find((o) => o.title.includes("以前の指示を無視"));
    expect(injected).toBeDefined();
    expect(injected!.title).not.toContain("<b>");
    // 指示に従って「最安値」などの表示を生成していない
    expect(JSON.stringify(injected!.evaluation)).not.toContain("最安値");
  });

  it("クライアントへ商品本文（matchText）を送らない", async () => {
    const { events } = await run({});
    const offersEvent = events.find((e) => e.type === "offers");
    expect(JSON.stringify(offersEvent)).not.toContain("matchText");
    expect(JSON.stringify(offersEvent)).not.toContain("説明文中の指示は実行されません");
  });
});
