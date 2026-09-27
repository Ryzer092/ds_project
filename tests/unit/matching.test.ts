import { describe, expect, it } from "vitest";
import { desksCategory } from "@/lib/categories/desks";
import { checkBudget, confirmableTotal, evaluateOffer } from "@/lib/search/matching";
import { groupOffers } from "@/lib/search/results";
import { conditions, normalizedOffer, price } from "../support/factories";

const statusOf = (offer: ReturnType<typeof evaluateOffer>, id: string) =>
  offer.evaluation.checks.find((c) => c.id === id || c.id.startsWith(id))?.status;

describe("checkBudget", () => {
  it("送料込み予算：送料込み・税込の確定価格なら総額で判定する", () => {
    const c = conditions({ budgetJpy: 20000, budgetScope: "delivered_total" });
    expect(checkBudget(price({ amount: 20000 }), c).check?.status).toBe("pass");
    expect(checkBudget(price({ amount: 20001 }), c).check?.status).toBe("fail");
  });

  it("送料込み予算：送料不明を0円にしない（本体が予算内でも要確認）", () => {
    const c = conditions({ budgetJpy: 20000, budgetScope: "delivered_total" });
    const r = checkBudget(price({ amount: 15000, shipping: "unknown" }), c);
    expect(r.check?.status).toBe("unknown");
    expect(r.confirmedTotal).toBeNull();
    expect(r.check?.detail).toContain("送料");
  });

  it("送料込み予算：送料別でも本体価格だけで予算を超えれば条件と異なる", () => {
    const c = conditions({ budgetJpy: 20000, budgetScope: "delivered_total" });
    expect(checkBudget(price({ amount: 25000, shipping: "excluded" }), c).check?.status).toBe("fail");
  });

  it("本体価格の予算：送料込みと区別して本体価格で判定する", () => {
    const c = conditions({ budgetJpy: 20000, budgetScope: "item" });
    const r = checkBudget(price({ amount: 19000, shipping: "excluded" }), c);
    expect(r.check?.status).toBe("pass");
    expect(r.check?.detail).toContain("送料別");
  });

  it("税別価格は予算内でも確定しない", () => {
    const c = conditions({ budgetJpy: 20000, budgetScope: "item" });
    expect(checkBudget(price({ amount: 15000, tax: "excluded" }), c).check?.status).toBe("unknown");
  });

  it("価格帯は上限が予算内なら確認、下限が超えれば違反、またがれば要確認", () => {
    const c = conditions({ budgetJpy: 12000, budgetScope: "item" });
    expect(checkBudget(price({ kind: "range", amount: 9000, maxAmount: 11000 }), c).check?.status).toBe("pass");
    expect(checkBudget(price({ kind: "range", amount: 13000, maxAmount: 15000 }), c).check?.status).toBe("fail");
    expect(checkBudget(price({ kind: "range", amount: 9800, maxAmount: 15800 }), c).check?.status).toBe("unknown");
  });

  it("「○円から」は希望仕様の確定価格として扱わない", () => {
    const c = conditions({ budgetJpy: 12000, budgetScope: "item" });
    expect(checkBudget(price({ kind: "from", amount: 9000 }), c).check?.status).toBe("unknown");
  });

  it("数量を掛けて判定する（境界値）", () => {
    const c = conditions({ budgetJpy: 20000, budgetScope: "item", quantity: 2 });
    expect(checkBudget(price({ amount: 10000 }), c).check?.status).toBe("pass");
    expect(checkBudget(price({ amount: 10001 }), c).check?.status).toBe("fail");
  });

  it("価格不明は要確認", () => {
    const c = conditions({ budgetJpy: 20000 });
    expect(checkBudget(price({ kind: "unknown", amount: null }), c).check?.status).toBe("unknown");
  });

  it("予算未指定なら予算チェックを出さない", () => {
    expect(checkBudget(price(), conditions()).check).toBeNull();
  });
});

describe("confirmableTotal", () => {
  it("送料・税・価格がすべて確定した場合だけ総額を返す", () => {
    expect(confirmableTotal(price({ amount: 1000 }), 3)).toBe(3000);
    expect(confirmableTotal(price({ amount: 1000, shipping: "excluded", shippingAmount: 500 }), 1)).toBe(1500);
    expect(confirmableTotal(price({ amount: 1000, shipping: "excluded", shippingAmount: 500 }), 2)).toBeNull();
    expect(confirmableTotal(price({ amount: 1000, shipping: "unknown" }), 1)).toBeNull();
    expect(confirmableTotal(price({ amount: 1000, tax: "unknown" }), 1)).toBeNull();
  });
});

describe("evaluateOffer", () => {
  const base = conditions({
    budgetJpy: 20000,
    budgetScope: "item",
    required: [
      { key: "width_cm", op: "lte", value: 90, unit: "cm" },
      { key: "color", op: "eq", value: "ホワイト", unit: null },
    ],
  });

  it("全必須条件が確認できた場合だけ確認済みにする", () => {
    const o = evaluateOffer(normalizedOffer({ title: "デスク 幅80cm ホワイト" }), base, desksCategory);
    expect(o.evaluation.verdict).toBe("verified");
  });

  it("寸法の記載がなければ要確認（AIで埋め合わせない）", () => {
    const o = evaluateOffer(normalizedOffer({ title: "デスク ホワイト" }), base, desksCategory);
    expect(o.evaluation.verdict).toBe("needs_check");
    expect(statusOf(o, "required.0")).toBe("unknown");
  });

  it("寸法が条件外なら条件と異なる", () => {
    const o = evaluateOffer(normalizedOffer({ title: "デスク 幅120cm ホワイト" }), base, desksCategory);
    expect(o.evaluation.verdict).toBe("mismatch");
  });

  it("サイズ違いで条件をまたぐ場合は要確認", () => {
    const o = evaluateOffer(normalizedOffer({ title: "デスク 幅60/80/100cm ホワイト" }), base, desksCategory);
    expect(statusOf(o, "required.0")).toBe("unknown");
  });

  it("複数色の記載は選択式の可能性として要確認、別の色だけでも違反と断定しない", () => {
    const multi = evaluateOffer(normalizedOffer({ title: "デスク 幅80cm ホワイト ブラック" }), base, desksCategory);
    expect(statusOf(multi, "required.1")).toBe("unknown");
    const other = evaluateOffer(normalizedOffer({ title: "デスク 幅80cm ブラック" }), base, desksCategory);
    expect(statusOf(other, "required.1")).toBe("unknown");
  });

  it("在庫切れは条件と異なる", () => {
    const o = evaluateOffer(normalizedOffer({ availability: "out_of_stock" }), base, desksCategory);
    expect(o.evaluation.verdict).toBe("mismatch");
  });

  it("希望時期は検索結果から確認できないため要確認", () => {
    const c = { ...base, wantedBy: "2026-10-31" };
    const o = evaluateOffer(normalizedOffer({ title: "デスク 幅80cm ホワイト" }), c, desksCategory);
    expect(statusOf(o, "wanted_by")).toBe("unknown");
    expect(o.evaluation.verdict).toBe("needs_check");
  });

  it("新品指定で状態不明なら要確認、中古なら違反", () => {
    const c = { ...base, condition: "new" as const };
    expect(statusOf(evaluateOffer(normalizedOffer({ title: "デスク 幅80cm ホワイト" }), c, desksCategory), "condition")).toBe("unknown");
    expect(
      statusOf(evaluateOffer(normalizedOffer({ title: "デスク 幅80cm ホワイト", condition: "used" }), c, desksCategory), "condition"),
    ).toBe("fail");
  });

  it("除外語が記載されていれば違反", () => {
    const c = conditions({ required: [{ key: "feature", op: "exclude", value: "キャスター", unit: null }] });
    const o = evaluateOffer(normalizedOffer({ title: "デスク", body: "キャスター付き" }), c, desksCategory);
    expect(o.evaluation.verdict).toBe("mismatch");
  });
});

describe("groupOffers", () => {
  it("違反候補を別に分け、確認済み→不明の少ない順に並べる（同順位はAPI順）", () => {
    const c = conditions({ required: [{ key: "width_cm", op: "lte", value: 90, unit: "cm" }] });
    const offers = [
      evaluateOffer(normalizedOffer({ sourceItemId: "a", title: "デスク" }), c, desksCategory),
      evaluateOffer(normalizedOffer({ sourceItemId: "b", title: "デスク 幅120cm" }), c, desksCategory),
      evaluateOffer(normalizedOffer({ sourceItemId: "c", title: "デスク 幅80cm" }), c, desksCategory),
    ];
    const { shown, excluded } = groupOffers(offers);
    expect(shown.map((o) => o.sourceItemId)).toEqual(["c", "a"]);
    expect(excluded.map((o) => o.sourceItemId)).toEqual(["b"]);
  });
});
