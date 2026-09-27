import { findAttribute, getCategory } from "@/lib/categories";
import { LIMITS } from "@/lib/schemas/limits";
import type { WishConditions } from "@/lib/schemas/wish";

/**
 * 保存用タイトルを本人の条件から作る。APIの商品名は使わない。
 * 例: 「ホワイトのデスク（幅90cm以内・2万円まで）」
 */
export function buildWishTitle(c: WishConditions): string {
  const category = getCategory(c.categoryId);
  const base = c.productType ?? category?.label ?? "購入希望";
  const color = c.required.find((r) => r.key === "color" && r.op === "eq");
  const head = color ? `${color.value}の${base}` : base;
  const parts: string[] = [];
  for (const r of c.required) {
    const attr = category ? findAttribute(category, r.key) : null;
    if (attr?.kind === "dimension" && typeof r.value === "number") {
      parts.push(`${attr.label}${r.value}cm${r.op === "lte" ? "以内" : r.op === "gte" ? "以上" : ""}`);
    }
  }
  if (c.budgetJpy !== null) {
    const man = c.budgetJpy % 10000 === 0 ? `${c.budgetJpy / 10000}万円` : `${c.budgetJpy.toLocaleString("ja-JP")}円`;
    parts.push(`${c.budgetScope === "delivered_total" ? "送料込み" : ""}${man}まで`);
  }
  const title = parts.length > 0 ? `${head}（${parts.slice(0, 3).join("・")}）` : head;
  return title.slice(0, LIMITS.titleMaxChars);
}
