import { describe, expect, it } from "vitest";
import { desksCategory } from "@/lib/categories/desks";
import { sanitizeExtraction, type LlmOutput } from "@/lib/llm/sanitize";
import { validateImageUrl, validateProductLink } from "@/lib/policies/urls";
import { buildPlan, sanitizeKeyword } from "@/lib/search/plan";
import { conditions } from "../support/factories";

describe("buildPlan", () => {
  it("単価上限は予算÷数量、除外語はテキスト属性のみ", () => {
    const plan = buildPlan(
      conditions({
        budgetJpy: 20001,
        quantity: 2,
        required: [
          { key: "feature", op: "exclude", value: "キャスター", unit: null },
          { key: "color", op: "exclude", value: "ブラック", unit: null },
        ],
      }),
      desksCategory,
    );
    expect(plan.maxUnitPriceJpy).toBe(10000);
    expect(plan.excludeKeywords).toEqual(["キャスター"]);
  });

  it("LLMの検索語にカテゴリ語がなければ商品種類を補う", () => {
    expect(buildPlan(conditions({ productType: "昇降デスク" }), desksCategory, ["在宅勤務 電動"]).keywords).toBe(
      "昇降デスク 在宅勤務 電動",
    );
  });

  it("検索語から記号・URLを除去する", () => {
    expect(sanitizeKeyword("デスク <script> https://evil.example/x 白")).toBe("デスク script 白");
  });
});

describe("sanitizeExtraction", () => {
  const output = (c: Partial<LlmOutput["conditions"]>): LlmOutput => ({
    inScope: true,
    conditions: {
      productType: "デスク",
      purpose: null,
      budgetJpy: null,
      budgetScope: "unspecified",
      quantity: 1,
      condition: "any",
      required: [],
      preferences: [],
      wantedBy: null,
      ...c,
    },
    clarifyingQuestions: ["q1", "q2", "q3"],
    needsClarificationBeforeSearch: false,
    searchKeywords: ["白 デスク", "<b>x</b>"],
    reply: "更新しました",
  });

  it("不正な値は捨てて注記に残し、推測で補わない", () => {
    const r = sanitizeExtraction(
      output({
        budgetJpy: -5,
        quantity: 500,
        wantedBy: "来月",
        required: [
          { key: "width_cm", op: "lte", value: "90", unit: "cm" },
          { key: "weight", op: "lte", value: "5", unit: "kg" },
        ],
      }),
      conditions({ title: "本人のタイトル" }),
      desksCategory,
    );
    expect(r.conditions.budgetJpy).toBeNull();
    expect(r.conditions.quantity).toBe(1);
    expect(r.conditions.wantedBy).toBeNull();
    expect(r.conditions.required).toEqual([{ key: "width_cm", op: "lte", value: 90, unit: "cm" }]);
    expect(r.conditions.title).toBe("本人のタイトル");
    expect(r.notes.length).toBeGreaterThanOrEqual(4);
    expect(r.clarifications).toHaveLength(2);
    expect(r.keywords).toEqual(["白 デスク", "b x b"]);
  });
});

describe("URL検証", () => {
  it("情報源ごとの許可ホストの https だけ通す", () => {
    expect(validateProductLink("rakuten", "https://item.rakuten.co.jp/shop/item/")).not.toBeNull();
    expect(validateProductLink("rakuten", "https://www.amazon.co.jp/dp/B000000000")).toBeNull();
    expect(validateProductLink("amazon", "http://www.amazon.co.jp/dp/B000000000")).toBeNull();
    expect(validateProductLink("amazon", "https://user:pass@www.amazon.co.jp/dp/B0")).toBeNull();
    expect(validateProductLink("amazon", "javascript:alert(1)")).toBeNull();
    expect(validateImageUrl("amazon", "https://m.media-amazon.com/images/I/x.jpg")).not.toBeNull();
    expect(validateImageUrl("rakuten", "https://evil.example/x.jpg")).toBeNull();
  });
});
