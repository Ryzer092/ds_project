import type { CategoryConfig } from "@/lib/categories";
import type { ChatTurn } from "@/lib/schemas/search-api";
import type { WishConditions } from "@/lib/schemas/wish";

export type ExtractionInput = {
  message: string;
  history: ChatTurn[];
  current: WishConditions;
  category: CategoryConfig;
  /** 日本時間の今日（YYYY-MM-DD）。「来月まで」などの解釈に使う。 */
  today: string;
};

export type ExtractionSuccess = {
  ok: true;
  inScope: boolean;
  conditions: WishConditions;
  keywords: string[];
  /** 必須情報が足りず検索前に確認したい場合の質問（最大2問）。 */
  clarifications: string[];
  needsClarificationBeforeSearch: boolean;
  reply: string | null;
  notes: string[];
  usage: { calls: number; inputTokens: number; outputTokens: number };
};

export type ExtractionFailure = {
  ok: false;
  reason: "unavailable" | "budget" | "failed" | "refused";
  usage: { calls: number; inputTokens: number; outputTokens: number };
};

export type ExtractionResult = ExtractionSuccess | ExtractionFailure;

/**
 * 利用者の希望（自由文）を購入条件に構造化する。
 * 商品データ（本文・画像・価格）は入力に含めない。
 */
export interface ConditionExtractor {
  readonly kind: "llm" | "demo_parser";
  extract(input: ExtractionInput, reserveCall: () => Promise<boolean>, signal: AbortSignal): Promise<ExtractionResult>;
}
