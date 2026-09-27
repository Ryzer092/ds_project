import { DEMO_ITEMS_A, DEMO_ITEMS_B, type DemoItem } from "@/fixtures/demo-offers";
import type { NormalizedOffer, SourceId } from "@/lib/schemas/offer";
import type { SourceState } from "@/lib/schemas/source";
import type { SearchPlan } from "../plan";
import { displayText, sleep, stripHtml } from "./http";
import type { ProviderContext, ProviderSearchResult, SearchProvider } from "./types";

/**
 * デモ用アダプター。架空データだけを返し、外部URL・画像を持たない（購入できない）。
 * live モードでは使わない。live の失敗をこのデータで埋めない。
 */
export class DemoProvider implements SearchProvider {
  readonly demo = true;
  readonly affiliate = false;
  readonly label: string;

  constructor(
    readonly sourceId: SourceId,
    private readonly items: DemoItem[] = sourceId === "rakuten" ? DEMO_ITEMS_A : DEMO_ITEMS_B,
    private readonly latencyMs = 250,
  ) {
    this.label = sourceId === "rakuten" ? "楽天市場（デモ・架空データ）" : "Amazon（デモ・架空データ）";
  }

  status(): SourceState {
    return "ready";
  }

  async search(plan: SearchPlan, ctx: ProviderContext): Promise<ProviderSearchResult> {
    const reservation = await ctx.reserveCall();
    if (reservation !== "ok") return { outcome: reservation === "rate_limited" ? "rate_limited" : "skipped", offers: [], opsCode: reservation };
    if (this.latencyMs > 0) {
      try {
        await sleep(this.latencyMs, ctx.signal);
      } catch {
        return { outcome: "timeout", offers: [], opsCode: "aborted" };
      }
    }
    const tokens = plan.keywords.split(" ").filter(Boolean);
    const retrievedAt = ctx.now().toISOString();
    const offers = this.items
      .filter((item) => plan.maxUnitPriceJpy === null || item.price <= plan.maxUnitPriceJpy)
      .filter((item) => !plan.excludeKeywords.some((k) => item.title.includes(k) || item.body.includes(k)))
      .filter((item) => plan.condition !== "new" || item.condition !== "used")
      .filter((item) => tokens.length === 0 || relevant(item, tokens))
      .slice(0, plan.limit)
      .map((item) => toOffer(item, this.sourceId, retrievedAt));
    return { outcome: offers.length > 0 ? "ok" : "empty", offers, opsCode: null };
  }
}

/** デモデータはすべてデスク。検索語にカテゴリ語が含まれる場合だけ候補を返す簡易判定。 */
function relevant(item: DemoItem, tokens: string[]): boolean {
  const generic = ["デスク", "机", "テーブル"];
  const text = `${item.title} ${item.body}`;
  return tokens.some((t) => generic.some((g) => t.includes(g))) && generic.some((g) => text.includes(g));
}

function toOffer(item: DemoItem, sourceId: SourceId, retrievedAt: string): NormalizedOffer {
  const title = displayText(item.title, 200);
  const isRange = typeof item.priceMax === "number" && item.priceMax > item.price;
  return {
    offer: {
      sourceId,
      sourceItemId: item.id,
      title,
      sellerName: item.seller,
      productUrl: null,
      outboundUrl: null,
      imageUrl: null,
      condition: item.condition,
      variationNote: isRange ? "選ぶ仕様によって価格が異なります。" : null,
      price: {
        currency: "JPY",
        kind: isRange ? "range" : "exact",
        amount: item.price,
        maxAmount: isRange ? item.priceMax! : null,
        perQuantity: 1,
        tax: item.tax,
        shipping: item.shipping,
        shippingAmount: item.shippingAmount ?? null,
      },
      availability: item.availability,
      retrievedAt,
      evidenceFields: ["demo.title", "demo.price"],
      affiliate: false,
      demo: true,
    },
    matchText: { title, body: stripHtml(item.body) },
  };
}
