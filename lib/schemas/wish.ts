import { z } from "zod";
import { findAttribute, getCategory, type CategoryConfig } from "@/lib/categories";
import { normalizeColor } from "@/lib/search/colors";
import { LIMITS } from "./limits";

export const REQUIRED_OPS = ["eq", "lte", "gte", "contains", "exclude"] as const;
export type RequiredOp = (typeof REQUIRED_OPS)[number];

export const BUDGET_SCOPES = ["item", "delivered_total", "unspecified"] as const;
export type BudgetScope = (typeof BUDGET_SCOPES)[number];

export const ITEM_CONDITIONS = ["new", "used", "refurbished", "any"] as const;
export type ItemCondition = (typeof ITEM_CONDITIONS)[number];

export const WISH_STATUSES = ["active", "paused", "completed", "archived"] as const;
export type WishStatus = (typeof WISH_STATUSES)[number];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD形式で指定してください")
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, "存在しない日付です");

export const RequiredConditionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/),
  op: z.enum(REQUIRED_OPS),
  value: z.union([
    z.string().trim().min(1).max(LIMITS.requiredTextMaxChars),
    z.number().finite(),
  ]),
  unit: z.string().max(10).nullable(),
});
export type RequiredCondition = z.infer<typeof RequiredConditionSchema>;

/** 本人が確認・編集する購入条件（識別情報・状態を除く部分）。 */
export const WishConditionsSchema = z.object({
  title: z.string().trim().max(LIMITS.titleMaxChars),
  categoryId: z.string().min(1).max(40),
  productType: z.string().trim().min(1).max(LIMITS.productTypeMaxChars).nullable(),
  purpose: z.string().trim().min(1).max(LIMITS.purposeMaxChars).nullable(),
  budgetJpy: z.number().int().min(1).max(LIMITS.budgetMaxJpy).nullable(),
  budgetScope: z.enum(BUDGET_SCOPES),
  quantity: z.number().int().min(1).max(LIMITS.quantityMax),
  condition: z.enum(ITEM_CONDITIONS),
  required: z.array(RequiredConditionSchema).max(LIMITS.requiredMax),
  preferences: z
    .array(z.string().trim().min(1).max(LIMITS.preferenceMaxChars))
    .max(LIMITS.preferencesMax),
  wantedBy: isoDate.nullable(),
});
export type WishConditions = z.infer<typeof WishConditionsSchema>;

export type PurchaseWish = WishConditions & {
  id: string;
  userId: string;
  version: number;
  status: WishStatus;
  lastSearchedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function emptyConditions(categoryId: string): WishConditions {
  return {
    title: "",
    categoryId,
    productType: null,
    purpose: null,
    budgetJpy: null,
    budgetScope: "unspecified",
    quantity: 1,
    condition: "any",
    required: [],
    preferences: [],
    wantedBy: null,
  };
}

export type ConditionIssue = { path: string; message: string };

/**
 * カテゴリ設定に照らした検証。キー・演算子・単位・数値範囲を確認し、
 * 正規化済みの条件（単位をcmに統一、色を正規名に）を返す。
 */
export function normalizeRequiredForCategory(
  required: RequiredCondition[],
  category: CategoryConfig,
): { required: RequiredCondition[]; issues: ConditionIssue[] } {
  const issues: ConditionIssue[] = [];
  const out: RequiredCondition[] = [];
  const seen = new Set<string>();

  required.forEach((cond, i) => {
    const path = `required.${i}`;
    const attr = findAttribute(category, cond.key);
    if (!attr) {
      issues.push({ path, message: `未対応の条件です（${cond.key}）` });
      return;
    }
    if (!attr.ops.includes(cond.op)) {
      issues.push({ path, message: `${attr.label}にはこの指定方法を使えません` });
      return;
    }

    let normalized: RequiredCondition;
    if (attr.kind === "dimension") {
      const raw = typeof cond.value === "number" ? cond.value : Number(cond.value);
      if (!Number.isFinite(raw)) {
        issues.push({ path, message: `${attr.label}は数値で指定してください` });
        return;
      }
      const unit = (cond.unit ?? "cm").toLowerCase();
      const factor = unit === "cm" ? 1 : unit === "mm" ? 0.1 : unit === "m" ? 100 : null;
      if (factor === null) {
        issues.push({ path, message: `${attr.label}の単位はcm・mm・mで指定してください` });
        return;
      }
      const cm = Math.round(raw * factor * 10) / 10;
      if (cm < attr.min || cm > attr.max) {
        issues.push({ path, message: `${attr.label}は${attr.min}〜${attr.max}cmの範囲で指定してください` });
        return;
      }
      normalized = { key: attr.key, op: cond.op, value: cm, unit: "cm" };
    } else if (attr.kind === "color") {
      const color = typeof cond.value === "string" ? normalizeColor(cond.value) : null;
      if (!color) {
        issues.push({ path, message: "色の名前を認識できませんでした" });
        return;
      }
      normalized = { key: attr.key, op: cond.op, value: color, unit: null };
    } else {
      if (typeof cond.value !== "string") {
        issues.push({ path, message: `${attr.label}は文字で指定してください` });
        return;
      }
      normalized = { key: attr.key, op: cond.op, value: cond.value.trim(), unit: null };
    }

    const dedupeKey = `${normalized.key}:${normalized.op}:${normalized.value}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    out.push(normalized);
  });

  // 同じ寸法に同じ演算子が複数ある場合は矛盾するため最後の指定を採用する。
  const lastIndex = new Map<string, number>();
  out.forEach((c, i) => {
    const attr = findAttribute(category, c.key);
    if (attr?.kind === "dimension" || (attr?.kind === "color" && c.op === "eq")) {
      lastIndex.set(`${c.key}:${c.op}`, i);
    }
  });
  const deduped = out.filter((c, i) => {
    const idx = lastIndex.get(`${c.key}:${c.op}`);
    return idx === undefined || idx === i;
  });

  return { required: deduped, issues };
}

/**
 * スキーマ検証とカテゴリ検証をまとめて行う。境界（API・LLM出力・フォーム）で使う。
 */
export function parseConditions(
  input: unknown,
): { ok: true; value: WishConditions } | { ok: false; issues: ConditionIssue[] } {
  const parsed = WishConditionsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    };
  }
  const category = getCategory(parsed.data.categoryId);
  if (!category) {
    return { ok: false, issues: [{ path: "categoryId", message: "未対応のカテゴリです" }] };
  }
  const { required, issues } = normalizeRequiredForCategory(parsed.data.required, category);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { ...parsed.data, required } };
}

export function conditionsEqual(a: WishConditions, b: WishConditions): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

// キーの並び順や条件以外のプロパティ（PurchaseWish の id・version 等）に比較結果が左右されないよう、
// 条件の項目だけを固定の順序で取り出す。
function canonical(c: WishConditions) {
  return {
    title: c.title.trim(),
    categoryId: c.categoryId,
    productType: c.productType,
    purpose: c.purpose,
    budgetJpy: c.budgetJpy,
    budgetScope: c.budgetScope,
    quantity: c.quantity,
    condition: c.condition,
    required: c.required
      .map((r) => ({ key: r.key, op: r.op, value: r.value, unit: r.unit }))
      .sort((x, y) => `${x.key}${x.op}${x.value}`.localeCompare(`${y.key}${y.op}${y.value}`)),
    preferences: [...c.preferences],
    wantedBy: c.wantedBy,
  };
}
