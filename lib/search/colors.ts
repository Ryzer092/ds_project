/**
 * 色の正規名と表記ゆれ。商品名からの色判定は「一致の確認」にだけ使い、
 * 表記がない・複数色がある場合は不明として扱う（条件違反と断定しない）。
 */
export const COLOR_VOCABULARY: ReadonlyArray<{ name: string; aliases: readonly string[] }> = [
  { name: "ホワイト", aliases: ["ホワイト", "白い", "白色", "白", "しろ", "white", "オフホワイト"] },
  { name: "ブラック", aliases: ["ブラック", "黒い", "黒色", "黒", "くろ", "black"] },
  { name: "ブラウン", aliases: ["ブラウン", "茶色", "茶", "ダークブラウン", "brown", "ウォールナット", "ウォルナット"] },
  { name: "ナチュラル", aliases: ["ナチュラル", "natural", "木目", "オーク", "ビーチ"] },
  { name: "グレー", aliases: ["グレー", "グレイ", "灰色", "gray", "grey"] },
  { name: "ベージュ", aliases: ["ベージュ", "beige"] },
  { name: "ピンク", aliases: ["ピンク", "pink"] },
  { name: "ブルー", aliases: ["ブルー", "青", "ネイビー", "blue", "navy"] },
  { name: "グリーン", aliases: ["グリーン", "緑", "green"] },
  { name: "レッド", aliases: ["レッド", "赤", "red"] },
  { name: "イエロー", aliases: ["イエロー", "黄色", "yellow"] },
];

export function normalizeColor(input: string): string | null {
  const s = input.normalize("NFKC").trim().toLowerCase();
  if (!s) return null;
  for (const c of COLOR_VOCABULARY) {
    if (c.name.toLowerCase() === s) return c.name;
    if (c.aliases.some((a) => a.toLowerCase() === s)) return c.name;
  }
  return null;
}

/** 本文中に現れる色の正規名（重複なし、出現順）。 */
export function findColorsInText(text: string): string[] {
  const s = text.normalize("NFKC").toLowerCase();
  const found: string[] = [];
  for (const c of COLOR_VOCABULARY) {
    // 1文字の漢字（白・黒など）は「白木」「黒板」等の誤検出があるため、2文字以上の表記だけで判定する。
    const hit = c.aliases.some((a) => a.length >= 2 && s.includes(a.toLowerCase()));
    if (hit) found.push(c.name);
  }
  return found;
}

/** 自由文中の色指定（「白い」「ホワイト」など）を探す。入力解析用。 */
export function findColorMention(text: string): string | null {
  const s = text.normalize("NFKC").toLowerCase();
  let best: { name: string; index: number } | null = null;
  for (const c of COLOR_VOCABULARY) {
    for (const a of c.aliases) {
      const idx = s.indexOf(a.toLowerCase());
      if (idx >= 0 && (best === null || idx < best.index)) best = { name: c.name, index: idx };
    }
  }
  return best?.name ?? null;
}
