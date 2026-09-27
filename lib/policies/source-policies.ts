import type { SourceId } from "@/lib/schemas/offer";

/**
 * 情報源ごとの利用条件の確認記録。
 *
 * - 各機能は "allowed" / "pending" / "denied" で個別に管理する。未確認（pending）は無効。
 * - "allowed" にするには、実際の登録国・アカウント・用途について規約を確認し、
 *   reviewedAt（確認日）・reviewedBy・evidence（根拠の記録先）を必ず埋める。
 *   確認日や根拠がない "allowed" はコード側で pending として扱う。
 * - このファイルのフラグは確認結果の記録であり、規約確認そのものの代わりにはならない。
 */
export type PolicyDecision = "allowed" | "pending" | "denied";

export type SourceFeature =
  /** 検索結果として商品名・価格等を表示する */
  | "display"
  /** 取得した値で条件照合（一致・違反・未確認の説明）を行う */
  | "conditionMatching"
  /** 他の情報源と横並びで比較・混合ランキングする（P0では常に無効） */
  | "comparison"
  /** 商品IDなど識別子をDBへ保存する（P0では使わない） */
  | "identifierStorage"
  /** 商品画像URLを表示する（ダウンロード・再配信はしない） */
  | "imageDisplay"
  /** 商品情報の共有キャッシュ（P0では既定で無効） */
  | "cache";

export type SourcePolicy = {
  sourceId: SourceId;
  label: string;
  termsUrls: string[];
  reviewedAt: string | null;
  reviewedBy: string | null;
  /** 確認内容を記録した場所（例: docs/live-verification.md#rakuten）。 */
  evidence: string | null;
  features: Record<SourceFeature, PolicyDecision>;
  /** 画面に表示が必要なクレジット・注記（規約確認で必要と判断したもの）。 */
  notices: string[];
};

const ALL_PENDING: Record<SourceFeature, PolicyDecision> = {
  display: "pending",
  conditionMatching: "pending",
  comparison: "pending",
  identifierStorage: "pending",
  imageDisplay: "pending",
  cache: "pending",
};

export const SOURCE_POLICIES: Record<SourceId, SourcePolicy> = {
  rakuten: {
    sourceId: "rakuten",
    label: "楽天市場",
    termsUrls: [
      "https://webservice.rakuten.co.jp/guide/rule",
      "https://webservice.rakuten.co.jp/guide/credit",
      "https://webservice.rakuten.co.jp/documentation/ichiba-item-search",
    ],
    reviewedAt: null,
    reviewedBy: null,
    evidence: null,
    features: { ...ALL_PENDING },
    notices: [
      "このサイトで掲載されている情報は、Next AI Agentの作成者により運営されています。価格、販売可能情報は、変更される場合があります。購入時に楽天市場店舗（www.rakuten.co.jp）に表示されている価格が、その商品の販売に適用されます。",
    ],
  },
  amazon: {
    sourceId: "amazon",
    label: "Amazon",
    termsUrls: [
      "https://affiliate.amazon.co.jp/help/operating/policies",
      "https://affiliate.amazon.co.jp/help/operating/paapilicenseagreement",
      "https://affiliate-program.amazon.com/creatorsapi/docs/en-us/onboarding/register-for-creators-api",
    ],
    reviewedAt: null,
    reviewedBy: null,
    evidence: null,
    features: { ...ALL_PENDING },
    notices: [
      "価格および発送可能時期は表示された日付/時刻の時点のものであり、変更される場合があります。本商品の購入においては、購入の時点でAmazon.co.jpに表示されている価格および発送可能時期の情報が適用されます。",
      "本サイト上で表示されるコンテンツの一部は、アマゾンジャパン合同会社またはその関連会社により提供されたものです。これらのコンテンツは「現状有姿」で提供されており、随時変更または削除される場合があります。",
    ],
  },
};

/** デモ（架空データ）は自社作成のため、表示・照合・画像なし表示を許可する。 */
export const DEMO_POLICY_FEATURES: Record<SourceFeature, PolicyDecision> = {
  display: "allowed",
  conditionMatching: "allowed",
  comparison: "denied",
  identifierStorage: "denied",
  imageDisplay: "denied",
  cache: "denied",
};

/** 確認記録が揃っている場合だけ allowed を有効とみなす。 */
export function isFeatureAllowed(policy: SourcePolicy, feature: SourceFeature): boolean {
  if (policy.features[feature] !== "allowed") return false;
  return Boolean(policy.reviewedAt && policy.reviewedBy && policy.evidence);
}

export function getSourcePolicy(sourceId: SourceId): SourcePolicy {
  return SOURCE_POLICIES[sourceId];
}

/** live で検索を有効化できるか（表示と条件照合の両方の確認が必要）。 */
export function isPolicyReadyForSearch(policy: SourcePolicy): boolean {
  return isFeatureAllowed(policy, "display") && isFeatureAllowed(policy, "conditionMatching");
}
