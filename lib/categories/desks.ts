import type { CategoryConfig } from "./types";

/**
 * 初期カテゴリ「デスク」。カテゴリ未指定のための仮設定であり、確定した事業方針ではない。
 * 別カテゴリにする場合は同じ形の設定を追加し、INITIAL_CATEGORY を変更する。
 */
export const desksCategory: CategoryConfig = {
  id: "desks",
  label: "デスク",
  scopeDescription: "現在はデスク（机）の購入希望に対応しています。",
  inputExample: "幅90cm以内の白いデスク。予算は送料込み2万円。新品で、来月までに欲しい",
  examples: [
    "幅90cm以内の白いデスク。予算は送料込み2万円。新品で、来月までに欲しい",
    "在宅勤務用の昇降デスク。幅120cmくらい、5万円まで",
    "子ども用の学習机。奥行45cm以内で引き出し付き",
  ],
  inScopeTerms: [
    "デスク",
    "机",
    "つくえ",
    "ツクエ",
    "desk",
    "ワークテーブル",
    "パソコンテーブル",
    "PCテーブル",
  ],
  productTypes: [
    "デスク",
    "パソコンデスク",
    "昇降デスク",
    "L字デスク",
    "学習机",
    "ローデスク",
    "ゲーミングデスク",
    "ワークデスク",
  ],
  defaultKeyword: "デスク",
  attributes: [
    {
      key: "width_cm",
      label: "幅",
      kind: "dimension",
      unit: "cm",
      ops: ["lte", "gte", "eq"],
      textLabels: ["横幅", "幅"],
      letterLabel: "W",
      min: 20,
      max: 400,
    },
    {
      key: "depth_cm",
      label: "奥行き",
      kind: "dimension",
      unit: "cm",
      ops: ["lte", "gte", "eq"],
      textLabels: ["奥行き", "奥行"],
      letterLabel: "D",
      min: 20,
      max: 200,
    },
    {
      key: "height_cm",
      label: "高さ",
      kind: "dimension",
      unit: "cm",
      ops: ["lte", "gte", "eq"],
      textLabels: ["高さ"],
      letterLabel: "H",
      min: 20,
      max: 200,
    },
    { key: "color", label: "色", kind: "color", ops: ["eq", "exclude"] },
    {
      key: "feature",
      label: "機能・特徴",
      kind: "text",
      ops: ["contains", "exclude"],
      suggestions: ["昇降", "引き出し", "L字", "キャスター", "棚付き", "折りたたみ"],
    },
    {
      key: "material",
      label: "素材",
      kind: "text",
      ops: ["contains", "exclude"],
      suggestions: ["天然木", "スチール", "ガラス"],
    },
  ],
  providers: {
    // 楽天のジャンルIDは公式のジャンル検索APIで確認してから設定する（docs/provider-setup.md）。
    rakuten: { genreId: null, genreIdVerified: false },
    // Amazonの検索インデックスは日本のロケール資料で確認してから設定する。
    amazon: { searchIndex: null, searchIndexVerified: false },
  },
};
