/**
 * 入力・保存データの上限。クライアントとサーバーで同じ値を使う。
 * 実行時に変えたい運用上限（検索回数など）は lib/server/env.ts 側で設定する。
 */
export const LIMITS = {
  messageMaxChars: 2000,
  historyMaxTurns: 10,
  historyTurnMaxChars: 2000,
  titleMaxChars: 80,
  productTypeMaxChars: 40,
  purposeMaxChars: 200,
  preferenceMaxChars: 100,
  preferencesMax: 10,
  requiredMax: 12,
  requiredTextMaxChars: 40,
  budgetMaxJpy: 10_000_000,
  quantityMax: 99,
  feedbackCommentMaxChars: 300,
  wishesPerUser: 20,
  offersPerSource: 10,
  keywordMaxChars: 60,
  clarificationsMax: 2,
} as const;
