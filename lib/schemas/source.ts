import type { SourceId } from "./offer";

/** 情報源の技術的な状態。一般画面には簡潔な表示にし、理由は運用記録へ残す。 */
export const SOURCE_STATES = [
  "ready",
  "missing_credentials",
  "ineligible",
  "policy_pending",
  "rate_limited",
  "error",
] as const;
export type SourceState = (typeof SOURCE_STATES)[number];

export type SourceStatus = {
  sourceId: SourceId;
  label: string;
  state: SourceState;
  demo: boolean;
};

/** 1回の検索での情報源ごとの結果状態。0件と取得失敗を区別する。 */
export type SourceRunOutcome =
  | "ok"
  | "empty"
  | "unavailable"
  | "rate_limited"
  | "timeout"
  | "error"
  | "skipped";

export function publicStateLabel(state: SourceState): string {
  switch (state) {
    case "ready":
      return "利用可能";
    case "rate_limited":
      return "混雑のため一時的に利用できません";
    default:
      return "現在利用できません";
  }
}

export function outcomeMessage(outcome: SourceRunOutcome): string {
  switch (outcome) {
    case "ok":
      return "";
    case "empty":
      return "この条件に合う候補は見つかりませんでした（取得は成功しています）。";
    case "unavailable":
      return "この検索元は現在利用できません。";
    case "rate_limited":
      return "検索元が混雑しているため、候補を取得できませんでした。しばらくして再度お試しください。";
    case "timeout":
      return "検索元からの応答が時間内に得られませんでした。";
    case "error":
      return "検索元から候補を取得できませんでした。";
    case "skipped":
      return "今回は検索しませんでした。";
  }
}
