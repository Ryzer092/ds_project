import { describe, expect, it } from "vitest";
import { FeedbackInputSchema } from "@/lib/schemas/feedback";
import { conditionsEqual, parseConditions } from "@/lib/schemas/wish";
import { buildWishTitle } from "@/lib/wishes/title";
import { conditions } from "../support/factories";

describe("parseConditions", () => {
  it("寸法の単位をcmに正規化し、色を正規名にする", () => {
    const r = parseConditions(
      conditions({
        required: [
          { key: "width_cm", op: "lte", value: 900, unit: "mm" },
          { key: "color", op: "eq", value: "白", unit: null },
        ],
      }),
    );
    expect(r.ok && r.value.required).toEqual([
      { key: "width_cm", op: "lte", value: 90, unit: "cm" },
      { key: "color", op: "eq", value: "ホワイト", unit: null },
    ]);
  });

  it("未対応のキー・演算子・範囲外を拒否する", () => {
    expect(parseConditions(conditions({ required: [{ key: "weight_kg", op: "lte", value: 5, unit: null }] })).ok).toBe(false);
    expect(parseConditions(conditions({ required: [{ key: "color", op: "lte", value: "白", unit: null }] })).ok).toBe(false);
    expect(parseConditions(conditions({ required: [{ key: "width_cm", op: "lte", value: 1000, unit: "cm" }] })).ok).toBe(false);
  });

  it("金額・数量・日付・長さの境界", () => {
    expect(parseConditions(conditions({ budgetJpy: 10_000_000 })).ok).toBe(true);
    expect(parseConditions(conditions({ budgetJpy: 10_000_001 })).ok).toBe(false);
    expect(parseConditions(conditions({ budgetJpy: 1.5 })).ok).toBe(false);
    expect(parseConditions(conditions({ quantity: 0 })).ok).toBe(false);
    expect(parseConditions(conditions({ quantity: 99 })).ok).toBe(true);
    expect(parseConditions(conditions({ wantedBy: "2026-02-30" })).ok).toBe(false);
    expect(parseConditions(conditions({ title: "あ".repeat(81) })).ok).toBe(false);
    expect(parseConditions({ ...conditions(), categoryId: "chairs" }).ok).toBe(false);
  });

  it("同じ寸法の同じ指定は最後の値にまとめる", () => {
    const r = parseConditions(
      conditions({
        required: [
          { key: "width_cm", op: "lte", value: 90, unit: "cm" },
          { key: "width_cm", op: "lte", value: 80, unit: "cm" },
        ],
      }),
    );
    expect(r.ok && r.value.required).toEqual([{ key: "width_cm", op: "lte", value: 80, unit: "cm" }]);
  });

  it("conditionsEqual は必須条件の順序に依存しない", () => {
    const a = conditions({
      required: [
        { key: "width_cm", op: "lte", value: 90, unit: "cm" },
        { key: "color", op: "eq", value: "ホワイト", unit: null },
      ],
    });
    const b = { ...a, required: [...a.required].reverse() };
    expect(conditionsEqual(a, b)).toBe(true);
    expect(conditionsEqual(a, { ...a, budgetJpy: 1 })).toBe(false);
  });
});

describe("FeedbackInputSchema", () => {
  const base = { wishVersion: 1, purchasedFrom: null, skipReasons: [], comment: null, sourceId: null };
  it("見送り理由は見送り時だけ、購入先は購入時だけ保持する", () => {
    const r = FeedbackInputSchema.parse({ ...base, outcome: "considering", skipReasons: ["price"], purchasedFrom: "amazon" });
    expect(r.skipReasons).toEqual([]);
    expect(r.purchasedFrom).toBeNull();
  });
  it("自由記述は300文字まで、余計な項目（注文番号など）は拒否", () => {
    expect(FeedbackInputSchema.safeParse({ ...base, outcome: "skipped", comment: "あ".repeat(301) }).success).toBe(false);
    expect(FeedbackInputSchema.safeParse({ ...base, outcome: "purchased", orderNumber: "123" }).success).toBe(false);
  });
});

describe("buildWishTitle", () => {
  it("本人の条件からタイトルを作る", () => {
    const t = buildWishTitle(
      conditions({
        productType: "デスク",
        budgetJpy: 20000,
        budgetScope: "delivered_total",
        required: [
          { key: "width_cm", op: "lte", value: 90, unit: "cm" },
          { key: "color", op: "eq", value: "ホワイト", unit: null },
        ],
      }),
    );
    expect(t).toBe("ホワイトのデスク（幅90cm以内・送料込み2万円まで）");
  });
});
