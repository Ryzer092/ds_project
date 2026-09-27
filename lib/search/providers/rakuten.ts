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
 * 楽天市場 商品検索API（version:2026-07-01）。
 * 公式資料: https://webservice.rakuten.co.jp/documentation/ichiba-item-search
 *
 * 確認した仕様（docs/provider-setup.md に出典を記録）:
 * - GET https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701
 * - applicationId（クエリ）と accessKey（ヘッダーまたはクエリ）が必要
 * - formatVersion=2 で items[] に商品が直接入る
 * - taxFlag 0=税込 1=税別 / postageFlag 0=送料込 1=送料別 / availability 0=在庫なし 1=在庫あり
 * - 1アプリIDにつき1秒1回以下。429 は再試行しない（アプリID停止の恐れがあるため）
 *
 * 実通信での検証は未実施。docs/live-verification.md の手順で確認する。
 */
export const RAKUTEN_ENDPOINT = "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701";

export type RakutenConfig = {
  applicationId: string | null;
  accessKey: string | null;
  affiliateId: string | null;
  appOrigin: string;
  timeoutMs: number;
};

const ImageEntry = z.union([z.string(), z.object({ imageUrl: z.string() })]);

const RakutenItem = z.object({
  itemName: z.string(),
  itemCode: z.string(),
  itemPrice: z.number(),
  itemUrl: z.string(),
  affiliateUrl: z.string().optional().nullable(),
  shopName: z.string().optional().nullable(),
  itemCaption: z.string().optional().nullable(),
  catchcopy: z.string().optional().nullable(),
  mediumImageUrls: z.array(ImageEntry).optional().nullable(),
  availability: z.number().optional().nullable(),
  taxFlag: z.number().optional().nullable(),
  postageFlag: z.number().optional().nullable(),
  itemPriceMin3: z.number().optional().nullable(),
  itemPriceMax3: z.number().optional().nullable(),
});
export type RakutenItem = z.infer<typeof RakutenItem>;

const RakutenResponse = z
  .object({
    items: z.array(z.unknown()).optional(),
    Items: z.array(z.unknown()).optional(),
    count: z.number().optional(),
  })
  .refine((r) => Array.isArray(r.items) || Array.isArray(r.Items), "items missing");

const ELEMENTS = [
  "itemName",
  "itemCode",
  "itemPrice",
  "itemUrl",
  "affiliateUrl",
  "shopName",
  "itemCaption",
  "catchcopy",
  "mediumImageUrls",
  "availability",
  "taxFlag",
  "postageFlag",
  "itemPriceMin3",
  "itemPriceMax3",
].join(",");

export function buildRakutenUrl(plan: SearchPlan, config: RakutenConfig): string {
  const params = new URLSearchParams();
  params.set("applicationId", config.applicationId ?? "");
  params.set("format", "json");
  params.set("formatVersion", "2");
  params.set("keyword", plan.keywords);
  params.set("hits", String(Math.min(30, Math.max(1, plan.limit))));
  params.set("availability", "1");
  params.set("elements", ELEMENTS);
  if (plan.maxUnitPriceJpy !== null) params.set("maxPrice", String(Math.min(plan.maxUnitPriceJpy, 999_999_998)));
  if (plan.excludeKeywords.length > 0) params.set("NGKeyword", plan.excludeKeywords.join(" "));
  const category = getCategory(plan.categoryId);
  if (category?.providers.rakuten.genreId && category.providers.rakuten.genreIdVerified) {
    params.set("genreId", category.providers.rakuten.genreId);
  }
  if (config.affiliateId) params.set("affiliateId", config.affiliateId);
  return `${RAKUTEN_ENDPOINT}?${params.toString()}`;
}

function firstImage(entries: RakutenItem["mediumImageUrls"]): string | null {
  const first = entries?.[0];
  if (!first) return null;
  return typeof first === "string" ? first : first.imageUrl;
}

export function normalizeRakutenItem(
  raw: unknown,
  opts: { policy: SourcePolicy; affiliate: boolean; retrievedAt: string },
): NormalizedOffer | null {
  const parsed = RakutenItem.safeParse(raw);
  if (!parsed.success) return null;
  const item = parsed.data;
  if (!Number.isInteger(item.itemPrice) || item.itemPrice <= 0) return null;

  const productUrl = validateProductLink("rakuten", item.itemUrl);
  const outboundUrl = validateProductLink("rakuten", item.affiliateUrl ?? item.itemUrl) ?? productUrl;
  if (!outboundUrl) return null;

  const min3 = item.itemPriceMin3 ?? null;
  const max3 = item.itemPriceMax3 ?? null;
  const isRange = min3 !== null && max3 !== null && min3 > 0 && max3 > min3;

  const title = displayText(item.itemName, 200);
  const offer: OfferBase = {
    sourceId: "rakuten",
    sourceItemId: item.itemCode.slice(0, 100),
    title,
    sellerName: item.shopName ? displayText(item.shopName, 80) : null,
    productUrl,
    outboundUrl,
    imageUrl: isFeatureAllowed(opts.policy, "imageDisplay")
      ? validateImageUrl("rakuten", firstImage(item.mediumImageUrls))
      : null,
    condition: /中古|ユーズド/.test(title) ? "used" : "unknown",
    variationNote: isRange ? "選ぶ仕様によって価格が異なります。" : null,
    price: {
      currency: "JPY",
      kind: isRange ? "range" : "exact",
      amount: isRange ? min3 : item.itemPrice,
      maxAmount: isRange ? max3 : null,
      perQuantity: 1,
      tax: item.taxFlag === 0 ? "included" : item.taxFlag === 1 ? "excluded" : "unknown",
      shipping: item.postageFlag === 0 ? "included" : item.postageFlag === 1 ? "excluded" : "unknown",
      shippingAmount: null,
    },
    availability: item.availability === 1 ? "in_stock" : item.availability === 0 ? "out_of_stock" : "unknown",
    retrievedAt: opts.retrievedAt,
    evidenceFields: [
      "itemName",
      "itemPrice",
      ...(isRange ? ["itemPriceMin3", "itemPriceMax3"] : []),
      "taxFlag",
      "postageFlag",
      "availability",
    ],
    affiliate: opts.affiliate,
    demo: false,
  };
  return {
    offer,
    matchText: {
      title,
      body: stripHtml([item.catchcopy ?? "", item.itemCaption ?? ""].join("\n"), 5000),
    },
  };
}

/** 楽天のエラー形式は2種類ある（文書記載の error/error_description と、ゲートウェイの errors.errorCode）。 */
function errorCodeOf(body: unknown): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.error === "string") return b.error.slice(0, 40);
    const errs = b.errors as Record<string, unknown> | undefined;
    if (errs && typeof errs.errorCode !== "undefined") return `code_${String(errs.errorCode).slice(0, 10)}`;
  }
  return "unknown";
}

export class RakutenProvider implements SearchProvider {
  readonly sourceId = "rakuten" as const;
  readonly label = "楽天市場";
  readonly demo = false;
  readonly affiliate: boolean;

  constructor(
    private readonly config: RakutenConfig,
    private readonly policy: SourcePolicy,
    private readonly fetchImpl: typeof fetchWithTimeout = fetchWithTimeout,
  ) {
    this.affiliate = Boolean(config.affiliateId);
  }

  status(): SourceState {
    if (!this.config.applicationId || !this.config.accessKey) return "missing_credentials";
    if (!isPolicyReadyForSearch(this.policy)) return "policy_pending";
    return "ready";
  }

  async search(plan: SearchPlan, ctx: ProviderContext): Promise<ProviderSearchResult> {
    if (this.status() !== "ready") return { outcome: "unavailable", offers: [], opsCode: this.status() };

    const url = buildRakutenUrl(plan, this.config);
    const headers: Record<string, string> = { accessKey: this.config.accessKey!, Accept: "application/json" };
    // アプリ登録時の「許可されたWebサイト」と一致する Origin/Referer を求められる場合がある（公式資料では未確認）。
    if (this.config.appOrigin.startsWith("https://")) {
      headers.Origin = this.config.appOrigin;
      headers.Referer = `${this.config.appOrigin}/`;
    }

    // 5xx・通信エラー・タイムアウトに限り、呼び出し枠の範囲で1回だけ再試行する。
    for (let attempt = 0; attempt < 2; attempt++) {
      const reservation = await ctx.reserveCall();
      if (reservation === "rate_limited") return { outcome: "rate_limited", offers: [], opsCode: "local_rps" };
      if (reservation !== "ok") return { outcome: attempt === 0 ? "skipped" : "error", offers: [], opsCode: reservation };

      let res: Response;
      try {
        res = await this.fetchImpl(url, { method: "GET", headers }, ctx.signal, this.config.timeoutMs);
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
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return { outcome: "error", offers: [], opsCode: "invalid_json" };
      }
      if (res.status === 404 && errorCodeOf(body) === "not_found") {
        return { outcome: "empty", offers: [], opsCode: null };
      }
      if (!res.ok) {
        return {
          outcome: "error",
          offers: [],
          opsCode: `http_${res.status}_${errorCodeOf(body)}`,
          stateChange: res.status === 401 || res.status === 403 ? "error" : undefined,
        };
      }

      const parsed = RakutenResponse.safeParse(body);
      if (!parsed.success) return { outcome: "error", offers: [], opsCode: "invalid_shape" };
      const rawItems = (parsed.data.items ?? parsed.data.Items ?? []).slice(0, plan.limit);
      const retrievedAt = ctx.now().toISOString();
      const offers = rawItems
        .map((raw) => normalizeRakutenItem(raw, { policy: this.policy, affiliate: this.affiliate, retrievedAt }))
        .filter((o): o is NormalizedOffer => o !== null);
      if (rawItems.length > 0 && offers.length === 0) {
        return { outcome: "error", offers: [], opsCode: "all_items_invalid" };
      }
      return { outcome: offers.length > 0 ? "ok" : "empty", offers, opsCode: null };
    }
    return { outcome: "error", offers: [], opsCode: "retry_exhausted" };
  }
}
