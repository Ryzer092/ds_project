import type { DimensionAttribute } from "@/lib/categories/types";

/**
 * 商品テキストから寸法を読み取る。
 *
 * 方針:
 * - 「幅」「奥行」「高さ」または直前が英数字でない W/D/H のラベルが付いた数値だけを読む。
 *   ラベルのない「90×45×72」や型番（DK-9045 など）は寸法として扱わない。
 * - 単位が確認できない数値は読まない（cmかmmか推測しない）。
 * - 「内寸」「引き出し」等の部位寸法は本体寸法と取り違えないよう除外する。
 * - 複数の値（サイズ違い）や範囲（昇降など）はそのまま返し、照合側で不明扱いにする。
 */
export type DimensionReading = {
  /** 単一値（cm）。重複なし昇順。 */
  values: number[];
  /** 範囲（cm）。「60〜75cm」など。 */
  ranges: Array<[number, number]>;
  from: "title" | "body";
};

const NUM = String.raw`\d+(?:\.\d+)?`;
const SEP = String.raw`[~〜～\-－]`;
const LIST_SEP = String.raw`[/・,、]`;
// 値: 範囲 or 列挙 or 単一
const VALUE = String.raw`(${NUM}(?:\s*${SEP}\s*${NUM})?(?:\s*${LIST_SEP}\s*${NUM}(?:\s*${SEP}\s*${NUM})?)*)`;
const UNIT = String.raw`(mm|cm|センチ|m(?![a-z]))`;

/** 部位寸法を示す語。ラベル直前（8文字以内）にあれば本体寸法とみなさない。 */
const PART_WORDS = ["内寸", "引き出し", "引出し", "引出", "棚板", "天板下", "脚部", "収納部", "有効", "モニター台", "キャスター", "足元"];

function toCm(value: number, unit: string): number | null {
  switch (unit) {
    case "cm":
    case "センチ":
      return value;
    case "mm":
      return value / 10;
    case "m":
      return value * 100;
    default:
      return null;
  }
}

function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[×✕✖]/g, "×")
    .replace(/\s+/g, " ");
}

/** ラベルの後ろに単位がない場合、同じ寸法表記の連なりの末尾から単位を探す。 */
function findTrailingUnit(text: string, from: number): string | null {
  const rest = text.slice(from, from + 40);
  const chain = rest.match(
    new RegExp(String.raw`^(?:[\s×x*]|${NUM}|${SEP}|${LIST_SEP}|横幅|幅|奥行き|奥行|高さ|[WDH]|約|:)*?${UNIT}`),
  );
  return chain ? chain[1] : null;
}

function parseValueExpr(expr: string): { singles: number[]; ranges: Array<[number, number]> } {
  const singles: number[] = [];
  const ranges: Array<[number, number]> = [];
  for (const part of expr.split(new RegExp(LIST_SEP))) {
    const m = part.trim().match(new RegExp(String.raw`^(${NUM})(?:\s*${SEP}\s*(${NUM}))?$`));
    if (!m) continue;
    const a = Number(m[1]);
    if (m[2] !== undefined) {
      const b = Number(m[2]);
      ranges.push(a <= b ? [a, b] : [b, a]);
    } else {
      singles.push(a);
    }
  }
  return { singles, ranges };
}

function readFrom(text: string, attr: DimensionAttribute): { values: number[]; ranges: Array<[number, number]> } {
  const t = normalizeText(text);
  const values: number[] = [];
  const ranges: Array<[number, number]> = [];

  const labels = [...attr.textLabels].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const patterns: RegExp[] = [
    new RegExp(String.raw`(${labels.join("|")})\s*(?:[:：]\s*)?(?:約\s*)?${VALUE}\s*${UNIT}?`, "g"),
  ];
  if (attr.letterLabel) {
    patterns.push(
      new RegExp(
        String.raw`(?<![A-Za-z0-9])(${attr.letterLabel})\s*(?:[:：]\s*)?${VALUE}\s*${UNIT}?(?![A-WYZa-wyz0-9])`,
        "g",
      ),
    );
  }

  for (const re of patterns) {
    for (const m of t.matchAll(re)) {
      const index = m.index ?? 0;
      const label = m[1];
      // 「横幅」の一部としての「幅」や「奥行き」の一部を二重に拾わない。
      if (label === "幅" && t.slice(Math.max(0, index - 1), index) === "横") continue;
      const before = t.slice(Math.max(0, index - 8), index);
      if (PART_WORDS.some((w) => before.includes(w))) continue;

      const unit = m[3] ?? findTrailingUnit(t, index + m[0].length);
      if (!unit) continue;
      const parsed = parseValueExpr(m[2]);
      for (const v of parsed.singles) {
        const cm = toCm(v, unit);
        if (cm !== null && cm >= attr.min && cm <= attr.max) values.push(round1(cm));
      }
      for (const [a, b] of parsed.ranges) {
        const ca = toCm(a, unit);
        const cb = toCm(b, unit);
        if (ca !== null && cb !== null && ca >= attr.min && cb <= attr.max) {
          ranges.push([round1(ca), round1(cb)]);
        }
      }
    }
  }

  return {
    values: [...new Set(values)].sort((a, b) => a - b),
    ranges: dedupeRanges(ranges),
  };
}

export function readDimension(
  title: string,
  body: string,
  attr: DimensionAttribute,
): DimensionReading | null {
  const fromTitle = readFrom(title, attr);
  if (fromTitle.values.length > 0 || fromTitle.ranges.length > 0) {
    return { ...fromTitle, from: "title" };
  }
  const fromBody = readFrom(body, attr);
  if (fromBody.values.length > 0 || fromBody.ranges.length > 0) {
    return { ...fromBody, from: "body" };
  }
  return null;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function dedupeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  const seen = new Set<string>();
  return ranges.filter(([a, b]) => {
    const k = `${a}-${b}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
