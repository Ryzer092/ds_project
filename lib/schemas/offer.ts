/**
 * 商品候補 Offer。原則として一時データであり、DB・Redis・ブラウザ永続領域に保存しない。
 * 情報がない項目は null / "unknown" にし、推測で埋めない。
 */
export const SOURCE_IDS = ["rakuten", "amazon"] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export type PriceKind = "exact" | "from" | "range" | "unknown";
export type Inclusion = "included" | "excluded" | "unknown";

export type OfferPrice = {
  currency: "JPY";
  kind: PriceKind;
  /** exact: 価格 / from: 最低価格 / range: 下限。単価（数量1あたり）。 */
  amount: number | null;
  /** range の上限。 */
  maxAmount: number | null;
  /** 価格が何個分か。現状の接続先はすべて1。 */
  perQuantity: 1;
  tax: Inclusion;
  shipping: Inclusion;
  /** 送料額が確認できた場合のみ。 */
  shippingAmount: number | null;
};

export type CheckStatus = "pass" | "fail" | "unknown";

export type ConditionCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  /** 判定根拠の定型説明。APIの取得値と通常コードから生成する。 */
  detail: string;
};

export type OfferVerdict = "verified" | "mismatch" | "needs_check";

export type OfferEvaluation = {
  verdict: OfferVerdict;
  checks: ConditionCheck[];
  /** 希望数量で確認できた総額（送料・税が確認できた場合のみ）。 */
  confirmedTotalJpy: number | null;
};

export type OfferBase = {
  sourceId: SourceId;
  /** API内の商品ID（楽天 itemCode、Amazon ASIN）。一時表示用。 */
  sourceItemId: string;
  title: string;
  sellerName: string | null;
  /** 検証済み https の商品ページURL。デモでは null。 */
  productUrl: string | null;
  /** 外部遷移に使うURL（アフィリエイトリンクを含む）。検証済み https のみ。 */
  outboundUrl: string | null;
  /** 画像表示が許可され、許可ホストのURLである場合のみ。 */
  imageUrl: string | null;
  condition: "new" | "used" | "refurbished" | "unknown";
  /** バリエーションに関する注意（価格が選択により異なる等）。 */
  variationNote: string | null;
  price: OfferPrice;
  availability: "in_stock" | "out_of_stock" | "unknown";
  retrievedAt: string;
  /** 判定に使ったAPIフィールド名。 */
  evidenceFields: string[];
  /** アフィリエイトリンクかどうか（開示表示用）。 */
  affiliate: boolean;
  demo: boolean;
};

export type Offer = OfferBase & { evaluation: OfferEvaluation };

/**
 * アダプターが返す正規化済み候補。matchText は条件照合のためだけにサーバー内で使い、
 * クライアントへは送らない（商品本文を外部LLMにも送らない）。
 */
export type NormalizedOffer = {
  offer: OfferBase;
  matchText: { title: string; body: string };
};
