import { findAttribute, type CategoryConfig } from "@/lib/categories";
import type { RequiredCondition, RequiredOp, WishConditions } from "@/lib/schemas/wish";

/** 条件フォーム用の小さな操作関数。常に新しいオブジェクトを返す。 */

export function getRequired(c: WishConditions, key: string): RequiredCondition[] {
  return c.required.filter((r) => r.key === key);
}

export function setSingleRequired(
  c: WishConditions,
  key: string,
  next: { op: RequiredOp; value: string | number; unit: string | null } | null,
): WishConditions {
  const rest = c.required.filter((r) => r.key !== key);
  return { ...c, required: next ? [...rest, { key, ...next }] : rest };
}

export function toggleTextRequired(c: WishConditions, key: string, value: string, op: RequiredOp = "contains"): WishConditions {
  const exists = c.required.some((r) => r.key === key && r.value === value && r.op === op);
  return {
    ...c,
    required: exists
      ? c.required.filter((r) => !(r.key === key && r.value === value && r.op === op))
      : [...c.required, { key, op, value, unit: null }],
  };
}

const OP_LABEL: Record<RequiredOp, string> = {
  eq: "",
  lte: "以内",
  gte: "以上",
  contains: "あり",
  exclude: "を除く",
};

export function describeRequired(r: RequiredCondition, category: CategoryConfig): string {
  const attr = findAttribute(category, r.key);
  const label = attr?.label ?? r.key;
  if (attr?.kind === "dimension") return `${label}${r.value}cm${OP_LABEL[r.op]}`;
  if (attr?.kind === "color") return r.op === "exclude" ? `色：${r.value}以外` : `色：${r.value}`;
  return r.op === "exclude" ? `${label}：「${r.value}」を除く` : `${label}：${r.value}`;
}

export function yen(n: number): string {
  return `${n.toLocaleString("ja-JP")}円`;
}

const CONDITION_LABEL = { new: "新品", used: "中古", refurbished: "整備品", any: "状態は問わない" } as const;

/** 条件の要約（一覧・詳細・保存確認で使う）。 */
export function summarizeConditions(c: WishConditions, category: CategoryConfig): string[] {
  const out: string[] = [];
  out.push(c.productType ?? category.label);
  if (c.budgetJpy !== null) {
    const scope = c.budgetScope === "delivered_total" ? "送料込み" : c.budgetScope === "item" ? "本体価格" : "";
    out.push(`予算${scope ? `（${scope}）` : ""} ${yen(c.budgetJpy)}まで`);
  }
  for (const r of c.required) out.push(describeRequired(r, category));
  if (c.condition !== "any") out.push(CONDITION_LABEL[c.condition]);
  if (c.quantity > 1) out.push(`${c.quantity}点`);
  if (c.wantedBy) out.push(`${formatJpDate(c.wantedBy)}までに欲しい`);
  if (c.purpose) out.push(`用途：${c.purpose}`);
  if (c.preferences.length > 0) out.push(`好み：${c.preferences.join("、")}`);
  return out;
}

export function formatJpDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${y}年${m}月${d}日`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" });
}
