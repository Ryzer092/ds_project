import type { Offer } from "@/lib/schemas/offer";

/**
 * 情報源内での表示順と振り分け。
 * - 必須条件と異なる候補は通常の候補から除外し、別表示にする。
 * - 確認できた候補 → 要確認の候補（不明項目が少ない順）。同順位はAPIの並び順を保つ。
 * - 紹介料や他情報源との価格比較で順位を変えない。
 */
export function groupOffers(offers: Offer[]): { shown: Offer[]; excluded: Offer[] } {
  const indexed = offers.map((offer, index) => ({ offer, index }));
  const shown = indexed
    .filter(({ offer }) => offer.evaluation.verdict !== "mismatch")
    .sort((a, b) => rank(a.offer) - rank(b.offer) || a.index - b.index)
    .map(({ offer }) => offer);
  const excluded = indexed.filter(({ offer }) => offer.evaluation.verdict === "mismatch").map(({ offer }) => offer);
  return { shown, excluded };
}

function rank(offer: Offer): number {
  if (offer.evaluation.verdict === "verified") return 0;
  return 1 + offer.evaluation.checks.filter((c) => c.status === "unknown").length;
}

/**
 * 候補がない・少ない場合の条件変更案。条件は勝手に緩めず、本人が選んで変更・再検索する。
 */
export function suggestionsFromExcluded(excluded: Offer[]): Array<{ checkId: string; label: string; count: number }> {
  const counts = new Map<string, { label: string; count: number }>();
  for (const offer of excluded) {
    for (const c of offer.evaluation.checks) {
      if (c.status !== "fail") continue;
      const key = c.id;
      const prev = counts.get(key);
      counts.set(key, { label: c.label, count: (prev?.count ?? 0) + 1 });
    }
  }
  return [...counts.entries()]
    .map(([checkId, v]) => ({ checkId, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
}
