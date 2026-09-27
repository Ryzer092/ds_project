import { describe, expect, it } from "vitest";
import { desksCategory } from "@/lib/categories/desks";
import { parseDemoMessage, parseWantedBy } from "@/lib/llm/demo-parser";
import { parseConditions, type WishConditions } from "@/lib/schemas/wish";
import { conditions } from "../support/factories";

const parse = (message: string, current: WishConditions = conditions()) =>
  parseDemoMessage({ message, history: [], current, category: desksCategory, today: "2026-09-26" });

describe("parseDemoMessage", () => {
  it("入力例を条件に構造化する", () => {
    const r = parse("幅90cm以内の白いデスク。予算は送料込み2万円。新品で、来月までに欲しい");
    expect(r.inScope).toBe(true);
    expect(r.conditions).toMatchObject({
      productType: "デスク",
      budgetJpy: 20000,
      budgetScope: "delivered_total",
      condition: "new",
      wantedBy: "2026-10-31",
    });
    expect(r.conditions.required).toEqual(
      expect.arrayContaining([
        { key: "width_cm", op: "lte", value: 90, unit: "cm" },
        { key: "color", op: "eq", value: "ホワイト", unit: null },
      ]),
    );
    expect(parseConditions(r.conditions).ok).toBe(true);
  });

  it("「幅は80cmまで」で他の条件（予算・色）を維持する", () => {
    const first = parse("幅90cm以内の白いデスク。予算は送料込み2万円").conditions;
    const next = parse("幅は80cmまで", first).conditions;
    expect(next.budgetJpy).toBe(20000);
    expect(next.budgetScope).toBe("delivered_total");
    expect(next.required).toContainEqual({ key: "width_cm", op: "lte", value: 80, unit: "cm" });
    expect(next.required.filter((r) => r.key === "width_cm")).toHaveLength(1);
    expect(next.required).toContainEqual({ key: "color", op: "eq", value: "ホワイト", unit: null });
  });

  it("「予算を解除」で予算だけを解除する", () => {
    const first = parse("幅90cm以内の白いデスク。予算は送料込み2万円").conditions;
    const next = parse("予算を解除", first).conditions;
    expect(next.budgetJpy).toBeNull();
    expect(next.budgetScope).toBe("unspecified");
    expect(next.required).toContainEqual({ key: "width_cm", op: "lte", value: 90, unit: "cm" });
  });

  it("金額の表記ゆれ（円・カンマ）と数量", () => {
    expect(parse("デスク 予算15,000円").conditions.budgetJpy).toBe(15000);
    expect(parse("デスクを2台").conditions.quantity).toBe(2);
  });

  it("mm指定をcmに換算し、範囲外は採用しない", () => {
    expect(parse("幅900mm以内のデスク").conditions.required).toContainEqual({ key: "width_cm", op: "lte", value: 90, unit: "cm" });
    const r = parse("幅5000cmのデスク");
    expect(r.conditions.required.some((x) => x.key === "width_cm")).toBe(false);
    expect(r.notes.join()).toContain("対応範囲外");
  });

  it("範囲外のカテゴリを案内する", () => {
    expect(parse("おすすめの椅子を教えて").inScope).toBe(false);
  });
});

describe("parseWantedBy", () => {
  it("来月まで・今月中・月日・年末をまたぐ", () => {
    expect(parseWantedBy("来月までに", "2026-09-26")).toBe("2026-10-31");
    expect(parseWantedBy("来月中に", "2026-12-10")).toBe("2027-01-31");
    expect(parseWantedBy("今月中", "2026-02-10")).toBe("2026-02-28");
    expect(parseWantedBy("10月15日までに", "2026-09-26")).toBe("2026-10-15");
    expect(parseWantedBy("1月5日までに", "2026-09-26")).toBe("2027-01-05");
    expect(parseWantedBy("2月30日までに", "2026-09-26")).toBeNull();
  });
});
