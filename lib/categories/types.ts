import type { RequiredOp } from "@/lib/schemas/wish";

/** 数値寸法。ラベル付きの表記（幅90cm、W90×D45 など）だけを読み取る。 */
export type DimensionAttribute = {
  key: string;
  label: string;
  kind: "dimension";
  unit: "cm";
  ops: readonly RequiredOp[];
  /** 本文中でこの寸法を示すラベル。NFKC正規化後の文字列で照合する。 */
  textLabels: readonly string[];
  /** W/D/H 形式の英字ラベル。直前が英数字の場合（型番の一部）は読まない。 */
  letterLabel: "W" | "D" | "H" | null;
  /** 入力として受け付ける範囲（cm）。 */
  min: number;
  max: number;
};

export type ColorAttribute = {
  key: string;
  label: string;
  kind: "color";
  ops: readonly RequiredOp[];
};

export type TextAttribute = {
  key: string;
  label: string;
  kind: "text";
  ops: readonly RequiredOp[];
  /** 入力例。条件フォームの候補表示に使う。 */
  suggestions: readonly string[];
};

export type AttributeDef = DimensionAttribute | ColorAttribute | TextAttribute;

export type CategoryConfig = {
  id: string;
  label: string;
  /** 対応範囲の説明。範囲外の希望への案内に使う。 */
  scopeDescription: string;
  inputExample: string;
  examples: readonly string[];
  /** この語を含む希望をカテゴリ内とみなす（簡易判定・デモ用）。 */
  inScopeTerms: readonly string[];
  productTypes: readonly string[];
  defaultKeyword: string;
  attributes: readonly AttributeDef[];
  /**
   * 検索元ごとのカテゴリ対応。実際のIDは公式資料で確認してから設定する。
   * null の場合はカテゴリ指定なしでキーワード検索する。
   */
  providers: {
    rakuten: { genreId: string | null; genreIdVerified: boolean };
    amazon: { searchIndex: string | null; searchIndexVerified: boolean };
  };
};
