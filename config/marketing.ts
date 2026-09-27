/**
 * サービス紹介サイトの設定。デモへのリンク先・公開状態・掲載先URLはここだけで管理する。
 *
 * - 設定値を変えても、実装・審査・接続が完了したことにはならない。
 * - demoReady は、実際のリンク先でMVPの初回入力・候補表示まで確認してから true にする。
 *   確認記録：2026-09-27 同一プロジェクトの /app で、デモモードの初回入力→候補表示を E2E（tests/e2e）で確認。
 * - activeSources は「接続済みとして紹介してよい情報源」。実際に表示で使うのは、
 *   アプリ側で live かつ利用可能（ready）な情報源との共通部分だけ（lib/server/marketing-state.ts）。
 * - 未提供の掲載先（利用規約・問い合わせ先など）は null のままにし、リンクを表示しない。
 */
export type SourceKey = "rakuten" | "amazon";

export type MarketingConfig = {
  productName: string;
  productStatus: "prelaunch" | "demo" | "live";
  demoUrl: string;
  demoReady: boolean;
  activeSources: SourceKey[];
  initialCategory: string;
  privacyUrl: string | null;
  termsUrl: string | null;
  contactUrl: string | null;
};

export const SOURCE_LABELS: Record<SourceKey, string> = { rakuten: "楽天市場", amazon: "Amazon" };

export const OPERATOR_NAME = "株式会社Next AI Agent";

const defaults: MarketingConfig = {
  productName: "Next AI Agent",
  productStatus: "demo",
  demoUrl: "/app",
  demoReady: true,
  activeSources: ["rakuten", "amazon"],
  initialCategory: "desks",
  // 既存アプリの「データの扱い」を共有する。正式なプライバシーポリシーは公開前に用意する。
  privacyUrl: "/settings#data",
  termsUrl: null,
  contactUrl: null,
};

/** 信頼済みのリンク先だけを許可する（同一サイト内の相対パス、または https の絶対URL）。 */
export function isTrustedLink(value: string): boolean {
  if (value.startsWith("/")) return !value.startsWith("//") && !value.includes("\\");
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function envLink(name: string, fallback: string | null): string | null {
  const v = process.env[name]?.trim();
  if (!v) return fallback;
  if (v === "none") return null;
  return isTrustedLink(v) ? v : fallback;
}

/**
 * 設定を返す。デプロイ先ごとに異なる値は環境変数で上書きできる（サーバー側の信頼済み設定のみ）。
 * 利用者の入力やクエリパラメーターからは変更できない。
 */
export function getMarketingConfig(): MarketingConfig {
  const status = process.env.MARKETING_PRODUCT_STATUS;
  const ready = process.env.MARKETING_DEMO_READY;
  return {
    ...defaults,
    productStatus: status === "prelaunch" || status === "demo" || status === "live" ? status : defaults.productStatus,
    demoReady: ready === "true" ? true : ready === "false" ? false : defaults.demoReady,
    demoUrl: envLink("MARKETING_DEMO_URL", defaults.demoUrl) ?? defaults.demoUrl,
    privacyUrl: envLink("MARKETING_PRIVACY_URL", defaults.privacyUrl),
    termsUrl: envLink("MARKETING_TERMS_URL", defaults.termsUrl),
    contactUrl: envLink("MARKETING_CONTACT_URL", defaults.contactUrl),
  };
}

export type DemoPlacement = "header" | "hero" | "preview" | "footer";

/**
 * デモへのURL。既存クエリがあればURL処理で結合し、計測用の固定値（entry・placement）だけを付ける。
 * 検索文・メール・希望の内容はURLに含めない。
 */
export function buildDemoHref(demoUrl: string, placement: DemoPlacement): string {
  if (!isTrustedLink(demoUrl)) throw new Error("demoUrl は信頼済みの設定値である必要があります");
  const relative = demoUrl.startsWith("/");
  const url = new URL(demoUrl, "https://placeholder.invalid");
  url.searchParams.set("entry", "marketing");
  url.searchParams.set("placement", placement);
  return relative ? `${url.pathname}${url.search}${url.hash}` : url.toString();
}

/** 公開ドメイン確定後に SITE_URL を設定する。未設定なら絶対URLを埋め込まない。 */
export function getSiteMetadataBase(): URL | undefined {
  const v = process.env.SITE_URL?.trim();
  if (!v) return undefined;
  try {
    const url = new URL(v);
    return url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

/** 公開ドメイン確定・公開判断の後にだけ true にする。既定は noindex（プレビュー扱い）。 */
export function isMarketingIndexable(): boolean {
  return process.env.MARKETING_INDEXABLE === "true" && getSiteMetadataBase() !== undefined;
}

// ---------------------------------------------------------------------------
// カテゴリ別の掲載文・画面サンプル。カテゴリを変更したら、ここにそのカテゴリの内容を追加する。
// 画面サンプルの商品・価格は説明用の架空データで、実APIの情報や購入可能な出品ではない。
// ---------------------------------------------------------------------------

export type SampleCandidate = {
  name: string;
  spec: string;
  price: string;
  shipping: string;
  checks: Array<{ label: string; status: "pass" | "unknown" }>;
};

export type CategoryMarketingContent = {
  categoryLabel: string;
  sampleUserMessage: string;
  sampleAiReply: string;
  chips: string[];
  candidates: SampleCandidate[];
  refineMessages: { user: string; chipsBefore: string[]; chipsAfter: string[] };
  savedWishTitle: string;
  memoLines: string[];
};

export const CATEGORY_CONTENT: Record<string, CategoryMarketingContent> = {
  desks: {
    categoryLabel: "デスク",
    sampleUserMessage: "幅90cm以内の白いデスク。送料込み2万円までで探したい",
    sampleAiReply: "幅・色・予算を条件にして探します。送料など、確認が必要な点も整理します",
    chips: ["デスク", "白", "幅90cm以内", "送料込み2万円"],
    candidates: [
      {
        name: "コンパクトデスクA",
        spec: "幅80cm",
        price: "商品価格15,000円",
        shipping: "送料は販売サイトで確認",
        checks: [
          { label: "幅80cm（90cm以内）", status: "pass" },
          { label: "色：白", status: "pass" },
          { label: "商品価格15,000円", status: "pass" },
          { label: "送料込みの総額", status: "unknown" },
          { label: "お届け時期", status: "unknown" },
        ],
      },
      {
        name: "シンプルデスクB",
        spec: "幅90cm",
        price: "商品価格18,000円",
        shipping: "送料は販売サイトで確認",
        checks: [
          { label: "幅90cm（90cm以内）", status: "pass" },
          { label: "色：白", status: "pass" },
          { label: "送料込みの総額", status: "unknown" },
        ],
      },
    ],
    refineMessages: {
      user: "もう少し小さく。予算はそのままで",
      chipsBefore: ["幅90cm以内", "送料込み2万円"],
      chipsAfter: ["幅80cm以内", "送料込み2万円"],
    },
    savedWishTitle: "白いデスク（幅90cm以内・送料込み2万円まで）",
    memoLines: ["予算 2万円（送料込み？）", "幅 90cmまで", "色 白", "届くのはいつ？"],
  },
};

export function getCategoryContent(categoryId: string): CategoryMarketingContent {
  return CATEGORY_CONTENT[categoryId] ?? CATEGORY_CONTENT.desks;
}
