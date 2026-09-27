import { z } from "zod";
import type { CategoryConfig } from "@/lib/categories";
import { LIMITS } from "@/lib/schemas/limits";
import {
  BUDGET_SCOPES,
  ITEM_CONDITIONS,
  normalizeRequiredForCategory,
  REQUIRED_OPS,
  WishConditionsSchema,
  type RequiredCondition,
  type WishConditions,
} from "@/lib/schemas/wish";
import { sanitizeKeyword } from "@/lib/search/plan";

/**
 * LLMに要求する構造化出力。制約（数値範囲など）は構造化出力の対応範囲に合わせて緩くし、
 * 受け取った後に sanitizeExtraction で厳密に検証する。
 */
export const LlmConditionsSchema = z.object({
  productType: z.string().nullable(),
  purpose: z.string().nullable(),
  budgetJpy: z.number().int().nullable(),
  budgetScope: z.enum(BUDGET_SCOPES),
  quantity: z.number().int(),
  condition: z.enum(ITEM_CONDITIONS),
  required: z.array(
    z.object({
      key: z.string(),
      op: z.enum(REQUIRED_OPS),
      value: z.string(),
      unit: z.string().nullable(),
    }),
  ),
  preferences: z.array(z.string()),
  wantedBy: z.string().nullable(),
});

export const LlmOutputSchema = z.object({
  inScope: z.boolean(),
  conditions: LlmConditionsSchema,
  clarifyingQuestions: z.array(z.string()),
  needsClarificationBeforeSearch: z.boolean(),
  searchKeywords: z.array(z.string()),
  reply: z.string(),
});
export type LlmOutput = z.infer<typeof LlmOutputSchema>;

const clip = (s: string | null | undefined, max: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

/**
 * LLM出力を検証・正規化する。不正な項目は捨てて注記に残し、推測で補わない。
 * タイトルは本人のもの（current.title）を維持する。
 */
export function sanitizeExtraction(
  output: LlmOutput,
  current: WishConditions,
  category: CategoryConfig,
): {
  conditions: WishConditions;
  notes: string[];
  keywords: string[];
  clarifications: string[];
  reply: string | null;
} {
  const notes: string[] = [];
  const c = output.conditions;

  let budgetJpy = c.budgetJpy;
  if (budgetJpy !== null && (budgetJpy < 1 || budgetJpy > LIMITS.budgetMaxJpy)) {
    notes.push("予算の金額を読み取れなかったため、予算は未指定にしました。");
    budgetJpy = null;
  }
  let quantity = c.quantity;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > LIMITS.quantityMax) {
    notes.push(`数量は1〜${LIMITS.quantityMax}で指定してください。1として扱います。`);
    quantity = 1;
  }

  const requiredInput: RequiredCondition[] = c.required.slice(0, LIMITS.requiredMax).map((r) => {
    const n = Number(r.value);
    const attr = category.attributes.find((a) => a.key === r.key);
    return {
      key: r.key,
      op: r.op,
      value: attr?.kind === "dimension" && Number.isFinite(n) ? n : r.value.slice(0, LIMITS.requiredTextMaxChars),
      unit: r.unit,
    };
  });
  const { required, issues } = normalizeRequiredForCategory(
    requiredInput.filter((r) => /^[a-z][a-z0-9_]{0,31}$/.test(r.key)),
    category,
  );
  for (const issue of issues) notes.push(`採用しなかった条件: ${issue.message}`);

  let wantedBy = c.wantedBy;
  if (wantedBy !== null) {
    const ok = WishConditionsSchema.shape.wantedBy.safeParse(wantedBy).success;
    if (!ok) {
      notes.push("希望時期の日付を読み取れなかったため、未指定にしました。");
      wantedBy = null;
    }
  }

  const candidate: WishConditions = {
    title: current.title,
    categoryId: category.id,
    productType: clip(c.productType, LIMITS.productTypeMaxChars),
    purpose: clip(c.purpose, LIMITS.purposeMaxChars),
    budgetJpy,
    budgetScope: c.budgetScope,
    quantity,
    condition: c.condition,
    required,
    preferences: c.preferences
      .map((p) => clip(p, LIMITS.preferenceMaxChars))
      .filter((p): p is string => p !== null)
      .slice(0, LIMITS.preferencesMax),
    wantedBy,
  };

  const parsed = WishConditionsSchema.safeParse(candidate);
  const conditions = parsed.success ? parsed.data : current;
  if (!parsed.success) notes.push("条件の一部を読み取れなかったため、以前の条件を維持しました。");

  const keywords = output.searchKeywords
    .map((k) => sanitizeKeyword(k))
    .filter(Boolean)
    .slice(0, 3);
  const clarifications = output.clarifyingQuestions
    .map((q) => clip(q, 120))
    .filter((q): q is string => q !== null)
    .slice(0, LIMITS.clarificationsMax);

  return { conditions, notes, keywords, clarifications, reply: clip(output.reply, 300) };
}
