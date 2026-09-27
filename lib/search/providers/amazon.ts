import { z } from "zod";
import { getCategory } from "@/lib/categories";
import { isFeatureAllowed, isPolicyReadyForSearch, type SourcePolicy } from "@/lib/policies/source-policies";
import { validateImageUrl, validateProductLink } from "@/lib/policies/urls";
import type { NormalizedOffer, OfferBase } from "@/lib/schemas/offer";
import type { SourceState } from "@/lib/schemas/source";
import type { SearchPlan } from "../plan";
import { displayText, fetchWithTimeout, isAbortError, stripHtml } from "./http";
import type { ProviderContext, ProviderSearchResult, SearchProvider } from "./types";

/**
 * Amazon Creators API（SearchItems）。旧PA-APIのコードは使わない。
 * 公式資料: https://affiliate.amazon.co.jp/creatorsapi/docs/en-us/api-reference/operations/search-items
 *
 * 確認した仕様（docs/provider-setup.md に出典を記録）:
 * - 認証: OAuth2 client credentials。資格情報バージョンでトークン発行先が決まる（3.1/3.2/3.3）。
 *   それ以外のバージョンは資料で確認できていないため接続しない。
 * - POST https://creatorsapi.amazon/catalog/v1/searchItems、項目名は lowerCamelCase。
 * - ヘッダー: Authorization: Bearer / Content-Type: application/json / x-marketplace
 * - 403 AccessDeniedException(AssociateNotEligible): 直近30日の適格販売が条件を満たさない。
 *
 * minPrice/maxPrice の日本円での単位は資料上で確定できないため送らず、価格判定は取得後に行う。
 * 実通信での検証は未実施。docs/live-verification.md の手順で確認する。
 */
export const AMAZON_SEARCH_ENDPOINT = "https://creatorsapi.amazon/catalog/v1/searchItems";

export const AMAZON_TOKEN_ENDPOINTS: Readonly<Record<string, string>> = {
  "3.1": "https://api.amazon.com/auth/o2/token",
  "3.2": "https://api.amazon.co.uk/auth/o2/token",
  "3.3": "https://api.amazon.co.jp/auth/o2/token",
};

export type AmazonConfig = {
  credentialId: string | null;
  credentialSecret: string | null;
  credentialVersion: string | null;
  partnerTag: string | null;
  marketplace: string;
  timeoutMs: number;
};

const RESOURCES = [
  "images.primary.medium",
  "itemInfo.title",
  "itemInfo.features",
  "offersV2.listings.price",
  "offersV2.listings.availability",
  "offersV2.listings.condition",
  "offersV2.listings.merchantInfo",
  "offersV2.listings.isBuyBoxWinner",
];

const Listing = z.object({
  isBuyBoxWinner: z.boolean().nullish(),
  price: z
    .object({
      money: z.object({ amount: z.number(), currency: z.string() }).nullish(),
    })
    .nullish(),
  availability: z.object({ type: z.string().nullish() }).nullish(),
  condition: z.object({ value: z.string().nullish() }).nullish(),
  merchantInfo: z.object({ name: z.string().nullish() }).nullish(),
});

const AmazonItem = z.object({
  asin: z.string().regex(/^[A-Z0-9]{10}$/),
  detailPageURL: z.string(),
  itemInfo: z
    .object({
      title: z.object({ displayValue: z.string() }).nullish(),
      features: z.object({ displayValues: z.array(z.string()).nullish() }).nullish(),
    })
    .nullish(),
  images: z
    .object({ primary: z.object({ medium: z.object({ url: z.string() }).nullish() }).nullish() })
    .nullish(),
  offersV2: z.object({ listings: z.array(Listing).nullish() }).nullish(),
});

const SearchResponse = z.object({
  searchResult: z.object({ items: z.array(z.unknown()).nullish() }).nullish(),
  errors: z.array(z.object({ type: z.string().nullish(), reason: z.string().nullish() }).passthrough()).nullish(),
});

const ErrorBody = z
  .object({ type: z.string().nullish(), reason: z.string().nullish(), message: z.string().nullish() })
  .passthrough();

const TokenResponse = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
});

export function buildAmazonSearchBody(plan: SearchPlan, config: AmazonConfig) {
  const category = getCategory(plan.categoryId);
  const searchIndex =
    category?.providers.amazon.searchIndex && category.providers.amazon.searchIndexVerified
      ? category.providers.amazon.searchIndex
      : "All";
  return {
    keywords: plan.keywords,
    searchIndex,
    itemCount: Math.min(10, Math.max(1, plan.limit)),
    partnerTag: config.partnerTag,
    marketplace: config.marketplace,
    condition: plan.condition === "new" ? "New" : "Any",
    availability: "Available",
    languagesOfPreference: ["ja_JP"],
    resources: RESOURCES,
  };
}

function mapAvailability(type: string | null | undefined): OfferBase["availability"] {
  switch (type) {
    case "IN_STOCK":
    case "IN_STOCK_SCARCE":
      return "in_stock";
    case "OUT_OF_STOCK":
    case "UNAVAILABLE":
      return "out_of_stock";
    default:
      return "unknown";
  }
}

function mapCondition(value: string | null | undefined): OfferBase["condition"] {
  switch (value) {
    case "New":
      return "new";
    case "Used":
    case "Collectible":
      return "used";
    case "Refurbished":
      return "refurbished";
    default:
      return "unknown";
  }
}

export function normalizeAmazonItem(
  raw: unknown,
  opts: { policy: SourcePolicy; retrievedAt: string },
): NormalizedOffer | null {
  const parsed = AmazonItem.safeParse(raw);
  if (!parsed.success) return null;
  const item = parsed.data;
  const title = displayText(item.itemInfo?.title?.displayValue ?? "", 200);
  if (!title) return null;
  // detailPageURL はタグ付きリンク。改変せず、ホストだけ検証する。
  const url = validateProductLink("amazon", item.detailPageURL);
  if (!url) return null;

  const listings = item.offersV2?.listings ?? [];
  const listing = listings.find((l) => l.isBuyBoxWinner) ?? listings[0] ?? null;
  const money = listing?.price?.money ?? null;
  const priceOk = money !== null && money.currency === "JPY" && Number.isFinite(money.amount) && money.amount > 0;

  const offer: OfferBase = {
    sourceId: "amazon",
    sourceItemId: item.asin,
    title,
    sellerName: listing?.merchantInfo?.name ? displayText(listing.merchantInfo.name, 80) : null,
    productUrl: url,
    outboundUrl: url,
    imageUrl: isFeatureAllowed(opts.policy, "imageDisplay")
      ? validateImageUrl("amazon", item.images?.primary?.medium?.url)
      : null,
    condition: mapCondition(listing?.condition?.value),
    variationNote: null,
    price: {
      currency: "JPY",
      kind: priceOk ? "exact" : "unknown",
      amount: priceOk ? Math.round(money!.amount) : null,
      maxAmount: null,
      perQuantity: 1,
      // 税・送料の扱いはAPIの項目で確認できないため不明とする。
      tax: "unknown",
      shipping: "unknown",
      shippingAmount: null,
    },
    availability: mapAvailability(listing?.availability?.type),
    retrievedAt: opts.retrievedAt,
    evidenceFields: [
      "itemInfo.title",
      "offersV2.listings.price",
      "offersV2.listings.availability",
      "offersV2.listings.condition",
    ],
    affiliate: true,
    demo: false,
  };
  const features = item.itemInfo?.features?.displayValues ?? [];
  return { offer, matchText: { title, body: stripHtml(features.join("\n"), 5000) } };
}

type CachedToken = { token: string; expiresAt: number; key: string };

export class AmazonProvider implements SearchProvider {
  readonly sourceId = "amazon" as const;
  readonly label = "Amazon";
  readonly demo = false;
  readonly affiliate = true;

  private token: CachedToken | null = null;
  /** 403 AssociateNotEligible を受けた場合、一定時間は利用資格なしとして扱う。 */
  private ineligibleUntil = 0;

  constructor(
    private readonly config: AmazonConfig,
    private readonly policy: SourcePolicy,
    private readonly fetchImpl: typeof fetchWithTimeout = fetchWithTimeout,
    private readonly now: () => number = Date.now,
  ) {}

  status(): SourceState {
    const c = this.config;
    if (!c.credentialId || !c.credentialSecret || !c.credentialVersion || !c.partnerTag) return "missing_credentials";
    if (!AMAZON_TOKEN_ENDPOINTS[c.credentialVersion]) return "error";
    if (this.ineligibleUntil > this.now()) return "ineligible";
    if (!isPolicyReadyForSearch(this.policy)) return "policy_pending";
    return "ready";
  }

  private async getToken(ctx: ProviderContext): Promise<string | { opsCode: string; outcome: "error" | "rate_limited" | "timeout" }> {
    const c = this.config;
    const key = `${c.credentialId}|${c.credentialVersion}`;
    if (this.token && this.token.key === key && this.token.expiresAt > this.now() + 60_000) return this.token.token;
    let res: Response;
    try {
      res = await this.fetchImpl(
        AMAZON_TOKEN_ENDPOINTS[c.credentialVersion!],
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            grant_type: "client_credentials",
            client_id: c.credentialId,
            client_secret: c.credentialSecret,
            scope: "creatorsapi::default",
          }),
        },
        ctx.signal,
        c.timeoutMs,
      );
    } catch (e) {
      return { opsCode: isAbortError(e) ? "token_timeout" : "token_network", outcome: isAbortError(e) ? "timeout" : "error" };
    }
    if (res.status === 429) return { opsCode: "token_429", outcome: "rate_limited" };
    if (!res.ok) return { opsCode: `token_http_${res.status}`, outcome: "error" };
    const parsed = TokenResponse.safeParse(await res.json().catch(() => null));
    if (!parsed.success) return { opsCode: "token_invalid_shape", outcome: "error" };
    this.token = { token: parsed.data.access_token, expiresAt: this.now() + parsed.data.expires_in * 1000, key };
    return this.token.token;
  }

  async search(plan: SearchPlan, ctx: ProviderContext): Promise<ProviderSearchResult> {
    if (this.status() !== "ready") return { outcome: "unavailable", offers: [], opsCode: this.status() };
    const body = JSON.stringify(buildAmazonSearchBody(plan, this.config));

    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.getToken(ctx);
      if (typeof token !== "string") return { outcome: token.outcome, offers: [], opsCode: token.opsCode };

      const reservation = await ctx.reserveCall();
      if (reservation === "rate_limited") return { outcome: "rate_limited", offers: [], opsCode: "local_rps" };
      if (reservation !== "ok") return { outcome: attempt === 0 ? "skipped" : "error", offers: [], opsCode: reservation };

      let res: Response;
      try {
        res = await this.fetchImpl(
          AMAZON_SEARCH_ENDPOINT,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              Accept: "application/json",
              "x-marketplace": this.config.marketplace,
            },
            body,
          },
          ctx.signal,
          this.config.timeoutMs,
        );
      } catch (e) {
        if (ctx.signal.aborted) return { outcome: "timeout", offers: [], opsCode: "aborted" };
        if (attempt === 0) continue;
        return { outcome: isAbortError(e) ? "timeout" : "error", offers: [], opsCode: isAbortError(e) ? "timeout" : "network" };
      }

      if (res.status === 429) return { outcome: "rate_limited", offers: [], opsCode: "http_429" };
      if (res.status >= 500) {
        if (attempt === 0) continue;
        return { outcome: "error", offers: [], opsCode: `http_${res.status}` };
      }
      const json = await res.json().catch(() => undefined);
      if (json === undefined) return { outcome: "error", offers: [], opsCode: "invalid_json" };

      if (!res.ok) {
        const err = ErrorBody.safeParse(json);
        const reason = err.success ? (err.data.reason ?? err.data.type ?? "unknown") : "unknown";
        if (res.status === 401 && attempt === 0) {
          this.token = null; // TokenExpired 等。トークンを取り直して1回だけ再試行する。
          continue;
        }
        if (res.status === 403 && reason === "AssociateNotEligible") {
          this.ineligibleUntil = this.now() + 60 * 60 * 1000;
          return { outcome: "unavailable", offers: [], opsCode: "associate_not_eligible", stateChange: "ineligible" };
        }
        return { outcome: "error", offers: [], opsCode: `http_${res.status}_${String(reason).slice(0, 40)}` };
      }

      const parsed = SearchResponse.safeParse(json);
      if (!parsed.success) return { outcome: "error", offers: [], opsCode: "invalid_shape" };
      const rawItems = (parsed.data.searchResult?.items ?? []).slice(0, plan.limit);
      if (rawItems.length === 0) {
        const partial = parsed.data.errors?.[0];
        if (partial && partial.reason !== "NoResults" && partial.type !== "NoResults") {
          return { outcome: "error", offers: [], opsCode: `partial_${String(partial.reason ?? partial.type).slice(0, 40)}` };
        }
        return { outcome: "empty", offers: [], opsCode: null };
      }
      const retrievedAt = new Date(ctx.now().getTime()).toISOString();
      const offers = rawItems
        .map((raw) => normalizeAmazonItem(raw, { policy: this.policy, retrievedAt }))
        .filter((o): o is NormalizedOffer => o !== null);
      if (offers.length === 0) return { outcome: "error", offers: [], opsCode: "all_items_invalid" };
      return { outcome: "ok", offers, opsCode: null };
    }
    return { outcome: "error", offers: [], opsCode: "retry_exhausted" };
  }
}
