import "server-only";
import { getCategory } from "@/lib/categories";
import { getSourceStatuses } from "@/lib/search/providers/registry";
import {
  getCategoryContent,
  getMarketingConfig,
  SOURCE_LABELS,
  type CategoryMarketingContent,
  type MarketingConfig,
  type SourceKey,
} from "@/config/marketing";
import { getEnv, isDemoMode } from "./env";

export type MarketingState = {
  config: MarketingConfig;
  /** 実際の状態に合わせた公開状態（設定より進んだ状態にはしない）。 */
  status: MarketingConfig["productStatus"];
  demoReady: boolean;
  /** アプリが架空データで動くデモモードか。 */
  appDemoMode: boolean;
  /** 紹介文で「接続済み」と書いてよい情報源（live で利用可能なものだけ）。 */
  connectedSources: SourceKey[];
  /** 接続予定として書く情報源。 */
  plannedSources: SourceKey[];
  categoryLabel: string;
  content: CategoryMarketingContent;
};

/**
 * 紹介ページ用の状態。外部API（LLM・商品API・認証）は呼ばず、設定と環境変数だけで判定する。
 */
export function getMarketingState(): MarketingState {
  const config = getMarketingConfig();
  const env = getEnv();
  const appDemoMode = isDemoMode(env);
  const ready = appDemoMode
    ? []
    : getSourceStatuses()
        .filter((s) => s.state === "ready" && !s.demo)
        .map((s) => s.sourceId);
  const connectedSources = config.activeSources.filter((s) => ready.includes(s));
  const plannedSources = (Object.keys(SOURCE_LABELS) as SourceKey[]).filter((s) => !connectedSources.includes(s));

  let status = config.productStatus;
  if (!config.demoReady) status = "prelaunch";
  else if (status === "live" && connectedSources.length === 0) status = "demo";

  const category = getCategory(config.initialCategory) ?? getCategory(env.INITIAL_CATEGORY);
  return {
    config,
    status,
    demoReady: config.demoReady && status !== "prelaunch",
    appDemoMode,
    connectedSources,
    plannedSources,
    categoryLabel: category?.label ?? "デスク",
    content: getCategoryContent(category?.id ?? "desks"),
  };
}

export function sourceList(keys: SourceKey[]): string {
  return keys.map((k) => SOURCE_LABELS[k]).join("・");
}
