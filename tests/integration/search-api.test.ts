import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as search } from "@/app/api/search/route";
import { POST as events } from "@/app/api/events/route";
import { setExtractorForTesting } from "@/lib/llm";
import type { SearchEvent } from "@/lib/schemas/search-api";
import { DemoProvider } from "@/lib/search/providers/demo";
import { setProvidersForTesting } from "@/lib/search/providers/registry";
import type { SearchProvider } from "@/lib/search/providers/types";
import { MemoryLimitStore, setLimitStoreForTesting } from "@/lib/server/limit-store";
import { readSseStream } from "@/lib/sse";
import { conditions } from "../support/factories";

vi.mock("@/lib/server/ops-log", async (orig) => ({
  ...(await orig<typeof import("@/lib/server/ops-log")>()),
  recordSearchRun: vi.fn(async () => undefined),
  recordUsageEvent: vi.fn(async () => undefined),
}));

const ORIGIN = "http://localhost:3000";

function searchRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
    body: JSON.stringify({
      clientRequestId: crypto.randomUUID(),
      message: null,
      history: [],
      conditions: conditions({ productType: "デスク" }),
      contextToken: null,
      ...body,
    }),
  });
}

async function collect(res: Response): Promise<SearchEvent[]> {
  const out: SearchEvent[] = [];
  for await (const e of readSseStream(res.body!)) out.push(e);
  return out;
}

beforeEach(() => {
  setLimitStoreForTesting(new MemoryLimitStore());
  setProvidersForTesting([new DemoProvider("rakuten", undefined, 0), new DemoProvider("amazon", undefined, 0)]);
  setExtractorForTesting(undefined);
});
afterEach(() => {
  setLimitStoreForTesting(null);
  setProvidersForTesting(null);
  setExtractorForTesting(undefined);
});

describe("POST /api/search", () => {
  it("未登録でも検索でき、SSEで情報源別の結果と done を返す", async () => {
    const res = await search(searchRequest({ message: "幅90cm以内の白いデスク。予算は送料込み2万円" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("set-cookie")).toContain("nxa_anon=");
    const evs = await collect(res);
    const types = evs.map((e) => e.type);
    expect(types[0]).toBe("status");
    expect(types).toContain("intent");
    expect(types.at(-1)).toBe("done");
    const offers = evs.filter((e) => e.type === "offers");
    expect(offers.map((e) => e.sourceId).sort()).toEqual(["amazon", "rakuten"]);
    // すべて同じ requestId
    expect(new Set(evs.map((e) => e.requestId)).size).toBe(1);
    // デモ商品には外部URLがない（購入できない）
    for (const e of offers) for (const o of e.offers) expect(o.outboundUrl).toBeNull();
  });

  it("別オリジン・不正な入力・長すぎる自由文を拒否する", async () => {
    expect((await search(searchRequest({}, { Origin: "https://evil.example" }))).status).toBe(403);
    expect((await search(searchRequest({ message: "あ".repeat(2001) }))).status).toBe(400);
    expect((await search(searchRequest({ conditions: { ...conditions(), quantity: 0 } }))).status).toBe(400);
    expect((await search(searchRequest({ clientRequestId: "not-a-uuid" }))).status).toBe(400);
    expect((await search(searchRequest({ conditions: { ...conditions(), categoryId: "chairs" } }))).status).toBe(400);
  });

  it("同じ clientRequestId の連打は409（処理を増やさない）", async () => {
    const id = crypto.randomUUID();
    const first = await search(searchRequest({ clientRequestId: id }));
    await collect(first);
    const cookie = first.headers.get("set-cookie")!.split(";")[0];
    const again = await search(searchRequest({ clientRequestId: id }, { Cookie: cookie }));
    expect(again.status).toBe(409);
  });

  it("検索コンテキストはログインしていなければ使えない", async () => {
    expect((await search(searchRequest({ contextToken: "x.y" }))).status).toBe(401);
  });

  it("全体の時間上限を超えた情報源は打ち切り、取得済みの結果は返す", async () => {
    const slow: SearchProvider = {
      sourceId: "amazon",
      label: "遅い",
      demo: true,
      affiliate: false,
      status: () => "ready",
      search: (_plan, ctx) =>
        new Promise((resolve) => {
          ctx.signal.addEventListener("abort", () => resolve({ outcome: "timeout", offers: [], opsCode: "aborted" }));
        }),
    };
    setProvidersForTesting([new DemoProvider("rakuten", undefined, 0), slow]);
    process.env.SEARCH_TIMEOUT_MS = "1000";
    const { resetEnvCache } = await import("@/lib/server/env");
    resetEnvCache();
    try {
      const evs = await collect(await search(searchRequest({})));
      expect(evs.some((e) => e.type === "offers" && e.sourceId === "rakuten")).toBe(true);
      expect(evs).toContainEqual(expect.objectContaining({ type: "source_status", sourceId: "amazon", outcome: "timeout" }));
      expect(evs).toContainEqual(expect.objectContaining({ type: "error", code: "timeout" }));
      expect(evs.at(-1)?.type).toBe("done");
    } finally {
      delete process.env.SEARCH_TIMEOUT_MS;
      resetEnvCache();
    }
  });

  it("制限基盤が使えない場合は検索を止める（503）", async () => {
    const broken = new MemoryLimitStore();
    broken.claimOnce = async () => {
      throw new Error("down");
    };
    setLimitStoreForTesting(broken);
    const res = await search(searchRequest({}));
    expect(res.status).toBe(503);
  });
});

describe("POST /api/events", () => {
  it("許可されたイベントだけを受け付け、URLや価格などの項目は拒否する", async () => {
    const mk = (body: unknown, origin = ORIGIN) =>
      new Request("http://localhost:3000/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify(body),
      });
    const ok = { type: "outbound_click", clientEventId: crypto.randomUUID(), sourceId: "rakuten" };
    expect((await events(mk(ok))).status).toBe(204);
    expect((await events(mk({ ...ok, url: "https://item.rakuten.co.jp/x" }))).status).toBe(400);
    expect((await events(mk({ ...ok, type: "purchase_confirmed" }))).status).toBe(400);
    expect((await events(mk(ok, "https://evil.example"))).status).toBe(403);
  });
});
