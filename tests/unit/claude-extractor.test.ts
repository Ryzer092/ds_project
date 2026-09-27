import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { desksCategory } from "@/lib/categories/desks";
import { buildUserContent, ClaudeExtractor, toMessages } from "@/lib/llm/claude";
import type { LlmOutput } from "@/lib/llm/sanitize";
import { conditions } from "../support/factories";

const goodOutput: LlmOutput = {
  inScope: true,
  conditions: {
    productType: "デスク",
    purpose: null,
    budgetJpy: 20000,
    budgetScope: "delivered_total",
    quantity: 1,
    condition: "new",
    required: [{ key: "width_cm", op: "lte", value: "90", unit: "cm" }],
    preferences: [],
    wantedBy: "2026-10-31",
  },
  clarifyingQuestions: [],
  needsClarificationBeforeSearch: false,
  searchKeywords: ["白 デスク"],
  reply: "幅90cm以内、送料込み2万円で探します。",
};

function fakeClient(responses: Array<unknown | Error>) {
  const parse = vi.fn(async () => {
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return r;
  });
  return { client: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
}

const response = (parsed: LlmOutput | null, stop_reason = "end_turn") => ({
  parsed_output: parsed,
  stop_reason,
  usage: { input_tokens: 100, output_tokens: 50 },
});

const input = {
  message: "幅90cm以内の白いデスク。予算は送料込み2万円",
  history: [],
  current: conditions(),
  category: desksCategory,
  today: "2026-09-26",
};

const config = { apiKey: "k", model: "claude-opus-5", effort: "low" as const, timeoutMs: 1000 };

describe("ClaudeExtractor", () => {
  it("構造化出力を検証して条件にする。商品データは送らない", async () => {
    const { client, parse } = fakeClient([response(goodOutput)]);
    const r = await new ClaudeExtractor(config, client).extract(input, async () => true, new AbortController().signal);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.conditions.required).toEqual([{ key: "width_cm", op: "lte", value: 90, unit: "cm" }]);
      expect(r.usage).toEqual({ calls: 1, inputTokens: 100, outputTokens: 50 });
    }
    const params = (parse.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(params.model).toBe("claude-opus-5");
    expect(params).not.toHaveProperty("tools");
    expect(JSON.stringify(params.messages)).not.toMatch(/itemPrice|detailPageURL|@/);
  });

  it("解析できない出力は1回だけ修復を試みる（最大2回）", async () => {
    const { client, parse } = fakeClient([response(null), response(goodOutput)]);
    const r = await new ClaudeExtractor(config, client).extract(input, async () => true, new AbortController().signal);
    expect(r.ok).toBe(true);
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("2回とも失敗したら失敗を返す", async () => {
    const { client, parse } = fakeClient([response(null), response(null)]);
    const r = await new ClaudeExtractor(config, client).extract(input, async () => true, new AbortController().signal);
    expect(r).toMatchObject({ ok: false, reason: "failed" });
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it("費用枠がなければ呼び出さない", async () => {
    const { client, parse } = fakeClient([]);
    const r = await new ClaudeExtractor(config, client).extract(input, async () => false, new AbortController().signal);
    expect(r).toMatchObject({ ok: false, reason: "budget" });
    expect(parse).not.toHaveBeenCalled();
  });

  it("拒否（refusal）は失敗として扱い、内容を読まない", async () => {
    const { client } = fakeClient([response(goodOutput, "refusal")]);
    const r = await new ClaudeExtractor(config, client).extract(input, async () => true, new AbortController().signal);
    expect(r).toMatchObject({ ok: false, reason: "refused" });
  });

  it("一時的なAPIエラーは1回だけ再試行、恒久的なエラーは再試行しない", async () => {
    const conn = new Anthropic.APIConnectionError({ message: "down" });
    const { client, parse } = fakeClient([conn, response(goodOutput)]);
    expect((await new ClaudeExtractor(config, client).extract(input, async () => true, new AbortController().signal)).ok).toBe(true);
    expect(parse).toHaveBeenCalledTimes(2);

    const bad = new Anthropic.BadRequestError(400, undefined, "bad", new Headers());
    const second = fakeClient([bad, response(goodOutput)]);
    const r = await new ClaudeExtractor(config, second.client).extract(input, async () => true, new AbortController().signal);
    expect(r).toMatchObject({ ok: false, reason: "failed" });
    expect(second.parse).toHaveBeenCalledTimes(1);
  });
});

describe("toMessages / buildUserContent", () => {
  it("履歴を user/assistant の交互にし、最後を今回の入力にする", () => {
    const msgs = toMessages(
      [
        { role: "assistant", text: "こんにちは" },
        { role: "user", text: "白いデスク" },
        { role: "assistant", text: "了解" },
        { role: "user", text: "やっぱり黒" },
      ],
      "最新",
    );
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(String(msgs[2].content)).toContain("やっぱり黒");
    expect(String(msgs[2].content)).toContain("最新");
  });

  it("現在の条件と日付を含め、タイトルは送らない", () => {
    const c = buildUserContent({ ...input, current: conditions({ title: "秘密のタイトル", budgetJpy: 1000 }) });
    expect(c).toContain("2026-09-26");
    expect(c).toContain('"budgetJpy":1000');
    expect(c).not.toContain("秘密のタイトル");
  });
});
