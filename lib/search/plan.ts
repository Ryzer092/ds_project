import { findAttribute, type CategoryConfig } from "@/lib/categories";
import { LIMITS } from "@/lib/schemas/limits";
import type { ItemCondition, WishConditions } from "@/lib/schemas/wish";

/** 商品APIへ渡す検証済みの検索条件。 */
export type SearchPlan = {
  categoryId: string;
  keywords: string;
  excludeKeywords: string[];
  /** 単価の上限（予算÷数量）。送料込み予算でも本体価格は予算以下のため同じ上限を使える。 */
  maxUnitPriceJpy: number | null;
  condition: ItemCondition;
  limit: number;
};

/** 検索語として安全な文字だけ残す。記号・URL・制御文字を除去する。 */
export function sanitizeKeyword(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[^\p{L}\p{N}\s\-ー・]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LIMITS.keywordMaxChars);
}

function joinKeywords(parts: string[]): string {
  const tokens: string[] = [];
  for (const p of parts) {
    for (const t of sanitizeKeyword(p).split(" ")) {
      if (t && !tokens.includes(t)) tokens.push(t);
    }
  }
  let out = "";
  for (const t of tokens.slice(0, 5)) {
    const next = out ? `${out} ${t}` : t;
    if (next.length > LIMITS.keywordMaxChars) break;
    out = next;
  }
  return out;
}

/** 条件から決定的に検索語を作る。LLMが使えない場合もこれで検索できる。 */
export function keywordsFromConditions(conditions: WishConditions, category: CategoryConfig): string {
  const parts: string[] = [conditions.productType ?? category.defaultKeyword];
  for (const r of conditions.required) {
    const attr = findAttribute(category, r.key);
    if (!attr || typeof r.value !== "string") continue;
    if ((attr.kind === "color" && r.op === "eq") || (attr.kind === "text" && r.op === "contains")) {
      parts.push(r.value);
    }
  }
  return joinKeywords(parts);
}

export function buildPlan(
  conditions: WishConditions,
  category: CategoryConfig,
  llmKeywords: string[] | null = null,
): SearchPlan {
  let keywords = llmKeywords && llmKeywords.length > 0 ? joinKeywords(llmKeywords) : "";
  // LLMの検索語がカテゴリ語を含まない場合、範囲外の商品を拾わないよう商品種類を先頭に加える。
  const base = conditions.productType ?? category.defaultKeyword;
  const hasCategoryTerm = keywords.includes(base) || category.inScopeTerms.some((t) => keywords.includes(t));
  if (!keywords) {
    keywords = keywordsFromConditions(conditions, category);
  } else if (!hasCategoryTerm) {
    keywords = joinKeywords([base, keywords]);
  }
  const excludeKeywords = conditions.required
    .filter((r) => r.op === "exclude" && typeof r.value === "string" && findAttribute(category, r.key)?.kind === "text")
    .map((r) => sanitizeKeyword(String(r.value)))
    .filter(Boolean)
    .slice(0, 3);

  const maxUnitPriceJpy =
    conditions.budgetJpy !== null ? Math.max(1, Math.floor(conditions.budgetJpy / conditions.quantity)) : null;

  return {
    categoryId: category.id,
    keywords: keywords || category.defaultKeyword,
    excludeKeywords,
    maxUnitPriceJpy,
    condition: conditions.condition,
    limit: LIMITS.offersPerSource,
  };
}
