import type { NormalizedOffer, SourceId } from "@/lib/schemas/offer";
import type { SourceRunOutcome, SourceState } from "@/lib/schemas/source";
import type { SearchPlan } from "../plan";

export type ProviderCallReservation = "ok" | "search_budget" | "rate_limited" | "daily_limit";

export type ProviderContext = {
  signal: AbortSignal;
  /** 商品API呼び出しの直前に必ず呼ぶ。再試行も1回として数える。 */
  reserveCall: () => Promise<ProviderCallReservation>;
  now: () => Date;
};

export type ProviderSearchResult = {
  outcome: SourceRunOutcome;
  offers: NormalizedOffer[];
  /** 運用記録用の短いコード（商品本文・秘密情報を含めない）。 */
  opsCode: string | null;
  /** 実行中に判明した状態変化（例: 利用資格なし）。 */
  stateChange?: SourceState;
};

/**
 * 情報源アダプターの共通契約。
 * 将来 merchant_feed 等を追加する場合も同じ契約で実装する。
 */
export interface SearchProvider {
  readonly sourceId: SourceId;
  readonly label: string;
  readonly demo: boolean;
  readonly affiliate: boolean;
  status(): SourceState;
  search(plan: SearchPlan, ctx: ProviderContext): Promise<ProviderSearchResult>;
}

export class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`provider http ${status} ${code}`);
    this.name = "ProviderHttpError";
  }
}
