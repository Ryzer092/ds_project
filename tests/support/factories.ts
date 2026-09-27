import type { NormalizedOffer, OfferPrice } from "@/lib/schemas/offer";
import { emptyConditions, type WishConditions } from "@/lib/schemas/wish";

export function conditions(overrides: Partial<WishConditions> = {}): WishConditions {
  return { ...emptyConditions("desks"), ...overrides };
}

export function price(overrides: Partial<OfferPrice> = {}): OfferPrice {
  return {
    currency: "JPY",
    kind: "exact",
    amount: 10000,
    maxAmount: null,
    perQuantity: 1,
    tax: "included",
    shipping: "included",
    shippingAmount: null,
    ...overrides,
  };
}

export function normalizedOffer(
  overrides: { title?: string; body?: string; price?: Partial<OfferPrice> } & Partial<NormalizedOffer["offer"]> = {},
): NormalizedOffer {
  const { title = "テストデスク 幅80cm ホワイト", body = "", price: p, ...rest } = overrides;
  return {
    offer: {
      sourceId: "rakuten",
      sourceItemId: "item-1",
      title,
      sellerName: "テスト店",
      productUrl: null,
      outboundUrl: null,
      imageUrl: null,
      condition: "unknown",
      variationNote: null,
      price: price(p),
      availability: "in_stock",
      retrievedAt: "2026-09-26T00:00:00.000Z",
      evidenceFields: [],
      affiliate: false,
      demo: true,
      ...rest,
    },
    matchText: { title, body },
  };
}
