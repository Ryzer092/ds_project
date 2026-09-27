import { z } from "zod";
import { LIMITS } from "./limits";

export const FEEDBACK_OUTCOMES = ["purchased", "skipped", "considering"] as const;
export const PURCHASED_FROM = ["rakuten", "amazon", "other", "no_answer"] as const;
export const SKIP_REASONS = [
  "price",
  "shipping",
  "size_spec",
  "delivery",
  "stock",
  "preference",
  "trust",
  "bought_elsewhere",
  "other",
] as const;

export const SKIP_REASON_LABELS: Record<(typeof SKIP_REASONS)[number], string> = {
  price: "価格",
  shipping: "送料",
  size_spec: "サイズ・仕様",
  delivery: "納期",
  stock: "在庫",
  preference: "好み",
  trust: "信頼・情報不足",
  bought_elsewhere: "他で購入",
  other: "その他",
};

export const OUTCOME_LABELS: Record<(typeof FEEDBACK_OUTCOMES)[number], string> = {
  purchased: "購入した（自己申告）",
  skipped: "今回は見送った",
  considering: "まだ検討中",
};

export const PURCHASED_FROM_LABELS: Record<(typeof PURCHASED_FROM)[number], string> = {
  rakuten: "楽天市場",
  amazon: "Amazon",
  other: "その他",
  no_answer: "回答しない",
};

/** 結果の自己申告。注文番号・領収書・決済情報は受け付けない。 */
export const FeedbackInputSchema = z
  .object({
    wishVersion: z.number().int().min(1),
    outcome: z.enum(FEEDBACK_OUTCOMES),
    purchasedFrom: z.enum(PURCHASED_FROM).nullable(),
    skipReasons: z.array(z.enum(SKIP_REASONS)).max(SKIP_REASONS.length),
    comment: z.string().trim().max(LIMITS.feedbackCommentMaxChars).nullable(),
    sourceId: z.enum(["rakuten", "amazon"]).nullable(),
  })
  .strict()
  .transform((v) => ({
    ...v,
    purchasedFrom: v.outcome === "purchased" ? v.purchasedFrom : null,
    skipReasons: v.outcome === "skipped" ? [...new Set(v.skipReasons)] : [],
    comment: v.comment ? v.comment : null,
  }));
export type FeedbackInput = z.infer<typeof FeedbackInputSchema>;

export type Feedback = FeedbackInput & { id: string; wishId: string; createdAt: string };
