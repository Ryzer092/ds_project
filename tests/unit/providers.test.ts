import { describe, expect, it, vi } from "vitest";
import type { SourcePolicy } from "@/lib/policies/source-policies";
import { SOURCE_POLICIES } from "@/lib/policies/source-policies";
import { AmazonProvider, AMAZON_SEARCH_ENDPOINT, normalizeAmazonItem } from "@/lib/search/providers/amazon";
import { buildRakutenUrl, normalizeRakutenItem, RakutenProvider } from "@/lib/search/providers/rakuten";
import type { ProviderContext } from "@/lib/search/providers/types";
import type { SearchPlan } from "@/lib/search/plan";

const reviewed = (base: SourcePolicy, imageDisplay = false): SourcePolicy => ({
  ...base,
  reviewedAt: "2026-09-26",
  reviewedBy: "test",
  evidence: "tests",
  features: { ...base.features, display: "allowed", conditionMatching: "allowed", imageDisplay: imageDisplay ? "allowed" : "pending" },
});

const plan: SearchPlan = {
  categoryId: "desks",
  keywords: "デスク ホワイト",
  excludeKeywords: ["キャスター"],
  maxUnitPriceJpy: 20000,
  condition: "new",
  limit: 10,
};

function ctx(overrides: Partial<ProviderContext> = {}): ProviderContext & { calls: number } {
  const c = {
    calls: 0,
    signal: new AbortController().signal,
    now: () => new Date("2026-09-26T05:00:00Z"),
    reserveCall: async () => {
      c.calls += 1;
      return "ok" as const;
    },
    ...overrides,
  };
  return c;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const rakutenItem = {
  itemName: "<b>デスク</b> 幅80cm ホワイト",
  itemCode: "shop:10001",
  itemPrice: 12800,
  itemUrl: "https://item.rakuten.co.jp/shop/10001/",
  affiliateUrl: "https://hb.afl.rakuten.co.jp/hgc/xxx/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fshop%2F10001%2F",
  shopName: "テスト店",
  itemCaption: "<p>天板 幅80cm 奥行45cm</p><script>alert(1)</script>",
  mediumImageUrls: [{ imageUrl: "https://thumbnail.image.rakuten.co.jp/x.jpg" }],
  availability: 1,
  taxFlag: 0,
  postageFlag: 1,
};

const rakutenConfig = { applicationId: "app", accessKey: "key", affiliateId: null, appOrigin: "https://example.jp", timeoutMs: 1000 };

describe("楽天アダプター", () => {
  it("検索URLに必要なパラメーターを付け、秘密のアクセスキーはURLに入れない", () => {
    const url = new URL(buildRakutenUrl(plan, rakutenConfig));
    expect(url.origin + url.pathname).toBe("https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701");
    expect(url.searchParams.get("formatVersion")).toBe("2");
    expect(url.searchParams.get("maxPrice")).toBe("20000");
    expect(url.searchParams.get("NGKeyword")).toBe("キャスター");
    expect(url.searchParams.get("hits")).toBe("10");
    expect(url.searchParams.has("accessKey")).toBe(false);
    expect(url.searchParams.has("genreId")).toBe(false); // 未確認のジャンルIDは使わない
  });

  it("フィールドを正規化する（税込・送料別・在庫あり、HTMLを除去）", () => {
    const n = normalizeRakutenItem(rakutenItem, { policy: reviewed(SOURCE_POLICIES.rakuten, true), affiliate: false, retrievedAt: "t" });
    expect(n?.offer).toMatchObject({
      title: "デスク 幅80cm ホワイト",
      price: { kind: "exact", amount: 12800, tax: "included", shipping: "excluded" },
      availability: "in_stock",
      imageUrl: "https://thumbnail.image.rakuten.co.jp/x.jpg",
      outboundUrl: rakutenItem.affiliateUrl,
    });
    expect(n?.matchText.body).not.toContain("alert");
  });

  it("画像表示が未確認なら画像URLを出さない", () => {
    const n = normalizeRakutenItem(rakutenItem, { policy: reviewed(SOURCE_POLICIES.rakuten, false), affiliate: false, retrievedAt: "t" });
    expect(n?.offer.imageUrl).toBeNull();
  });

  it("購入可能価格の範囲がある場合は価格帯として扱う", () => {
    const n = normalizeRakutenItem(
      { ...rakutenItem, itemPriceMin3: 9800, itemPriceMax3: 15800 },
      { policy: reviewed(SOURCE_POLICIES.rakuten), affiliate: false, retrievedAt: "t" },
    );
    expect(n?.offer.price).toMatchObject({ kind: "range", amount: 9800, maxAmount: 15800 });
  });

  it("不正なリンク・価格の商品は捨てる", () => {
    const opts = { policy: reviewed(SOURCE_POLICIES.rakuten), affiliate: false, retrievedAt: "t" };
    expect(normalizeRakutenItem({ ...rakutenItem, itemUrl: "https://evil.example/", affiliateUrl: null }, opts)).toBeNull();
    expect(normalizeRakutenItem({ ...rakutenItem, itemPrice: -1 }, opts)).toBeNull();
  });

  it("キー未設定・規約未確認では検索しない", () => {
    expect(new RakutenProvider({ ...rakutenConfig, accessKey: null }, reviewed(SOURCE_POLICIES.rakuten)).status()).toBe("missing_credentials");
    expect(new RakutenProvider(rakutenConfig, SOURCE_POLICIES.rakuten).status()).toBe("policy_pending");
  });

  it("items / Items の両方を読み、accessKey はヘッダーで送る", async () => {
    const fetchImpl = vi.fn(async () => json(200, { Items: [rakutenItem] }));
    const p = new RakutenProvider(rakutenConfig, reviewed(SOURCE_POLICIES.rakuten), fetchImpl);
    const r = await p.search(plan, ctx());
    expect(r.outcome).toBe("ok");
    expect(r.offers).toHaveLength(1);
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).accessKey).toBe("key");
  });

  it("429 は再試行せず混雑として返す", async () => {
    const fetchImpl = vi.fn(async () => json(429, { error: "too_many_requests" }));
    const c = ctx();
    const r = await new RakutenProvider(rakutenConfig, reviewed(SOURCE_POLICIES.rakuten), fetchImpl).search(plan, c);
    expect(r.outcome).toBe("rate_limited");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(c.calls).toBe(1);
  });

  it("5xx は枠内で1回だけ再試行する", async () => {
    const fetchImpl = vi.fn(async () => json(503, { error: "service_unavailable" }));
    const c = ctx();
    const r = await new RakutenProvider(rakutenConfig, reviewed(SOURCE_POLICIES.rakuten), fetchImpl).search(plan, c);
    expect(r.outcome).toBe("error");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(c.calls).toBe(2);
  });

  it("呼び出し枠がなければ実行しない", async () => {
    const fetchImpl = vi.fn();
    const r = await new RakutenProvider(rakutenConfig, reviewed(SOURCE_POLICIES.rakuten), fetchImpl).search(
      plan,
      ctx({ reserveCall: async () => "search_budget" }),
    );
    expect(r.outcome).toBe("skipped");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("不正なレスポンス形式・not_found・ゲートウェイエラーを区別する", async () => {
    const policy = reviewed(SOURCE_POLICIES.rakuten);
    const run = (res: Response) => new RakutenProvider(rakutenConfig, policy, async () => res).search(plan, ctx());
    expect((await run(json(200, { foo: 1 }))).outcome).toBe("error");
    expect((await run(json(404, { error: "not_found", error_description: "not found" }))).outcome).toBe("empty");
    const gw = await run(json(403, { errors: { errorCode: 403, errorMessage: "Invalid Access Key" } }));
    expect(gw).toMatchObject({ outcome: "error", opsCode: "http_403_code_403" });
    expect((await run(json(200, { items: [] }))).outcome).toBe("empty");
  });
});

const amazonConfig = {
  credentialId: "id",
  credentialSecret: "secret",
  credentialVersion: "3.3",
  partnerTag: "tag-22",
  marketplace: "www.amazon.co.jp",
  timeoutMs: 1000,
};

const amazonItem = {
  asin: "B0TEST0001",
  detailPageURL: "https://www.amazon.co.jp/dp/B0TEST0001?tag=tag-22",
  itemInfo: { title: { displayValue: "デスク 幅89cm ホワイト" }, features: { displayValues: ["奥行48cm"] } },
  images: { primary: { medium: { url: "https://m.media-amazon.com/images/I/x.jpg" } } },
  offersV2: {
    listings: [
      {
        isBuyBoxWinner: true,
        price: { money: { amount: 13500, currency: "JPY" } },
        availability: { type: "IN_STOCK" },
        condition: { value: "New" },
        merchantInfo: { name: "テスト販売" },
      },
    ],
  },
};

describe("Amazonアダプター", () => {
  it("フィールドを正規化する（税・送料は不明のまま）", () => {
    const n = normalizeAmazonItem(amazonItem, { policy: reviewed(SOURCE_POLICIES.amazon), retrievedAt: "t" });
    expect(n?.offer).toMatchObject({
      sourceItemId: "B0TEST0001",
      price: { kind: "exact", amount: 13500, tax: "unknown", shipping: "unknown" },
      condition: "new",
      availability: "in_stock",
      sellerName: "テスト販売",
      outboundUrl: amazonItem.detailPageURL,
    });
  });

  it("JPY以外・価格なしは価格不明として扱う", () => {
    const item = { ...amazonItem, offersV2: { listings: [{ price: { money: { amount: 10, currency: "USD" } } }] } };
    expect(normalizeAmazonItem(item, { policy: reviewed(SOURCE_POLICIES.amazon), retrievedAt: "t" })?.offer.price.kind).toBe("unknown");
  });

  it("未確認の資格情報バージョンでは接続しない", () => {
    expect(new AmazonProvider({ ...amazonConfig, credentialVersion: "2.1" }, reviewed(SOURCE_POLICIES.amazon)).status()).toBe("error");
    expect(new AmazonProvider({ ...amazonConfig, partnerTag: null }, reviewed(SOURCE_POLICIES.amazon)).status()).toBe(
      "missing_credentials",
    );
  });

  it("トークンを取得して検索し、トークンは使い回す", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("/auth/o2/token")
        ? json(200, { access_token: "Atc|x", expires_in: 3600, token_type: "bearer" })
        : json(200, { searchResult: { items: [amazonItem] } }),
    );
    const p = new AmazonProvider(amazonConfig, reviewed(SOURCE_POLICIES.amazon), fetchImpl);
    expect((await p.search(plan, ctx())).outcome).toBe("ok");
    expect((await p.search(plan, ctx())).outcome).toBe("ok");
    const urls = fetchImpl.mock.calls.map((c) => c[0]);
    expect(urls.filter((u) => u.includes("/auth/o2/token"))).toHaveLength(1);
    expect(urls[0]).toBe("https://api.amazon.co.jp/auth/o2/token");
    const searchCall = fetchImpl.mock.calls.find((c) => c[0] === AMAZON_SEARCH_ENDPOINT) as unknown as [string, RequestInit];
    const headers = searchCall[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer Atc|x");
    expect(headers["x-marketplace"]).toBe("www.amazon.co.jp");
    const body = JSON.parse(String(searchCall[1].body));
    expect(body).toMatchObject({ keywords: "デスク ホワイト", partnerTag: "tag-22", condition: "New", itemCount: 10 });
    expect(body).not.toHaveProperty("maxPrice"); // 単位が確定できないため送らない
  });

  it("利用資格がない場合（AssociateNotEligible）は ineligible として扱う", async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.includes("/auth/o2/token")
        ? json(200, { access_token: "t", expires_in: 3600 })
        : json(403, { type: "AccessDeniedException", reason: "AssociateNotEligible", message: "..." }),
    );
    const p = new AmazonProvider(amazonConfig, reviewed(SOURCE_POLICIES.amazon), fetchImpl);
    const r = await p.search(plan, ctx());
    expect(r).toMatchObject({ outcome: "unavailable", stateChange: "ineligible" });
    expect(p.status()).toBe("ineligible");
  });

  it("401 ではトークンを取り直して1回だけ再試行する", async () => {
    let searchCalls = 0;
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/auth/o2/token")) return json(200, { access_token: "t", expires_in: 3600 });
      searchCalls += 1;
      return searchCalls === 1 ? json(401, { type: "UnauthorizedException", reason: "TokenExpired" }) : json(200, { searchResult: { items: [amazonItem] } });
    });
    const r = await new AmazonProvider(amazonConfig, reviewed(SOURCE_POLICIES.amazon), fetchImpl).search(plan, ctx());
    expect(r.outcome).toBe("ok");
    expect(fetchImpl.mock.calls.filter((c) => c[0].includes("/auth/o2/token"))).toHaveLength(2);
  });

  it("タイムアウトはタイムアウトとして返す", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/auth/o2/token")) return json(200, { access_token: "t", expires_in: 3600 });
      const e = new Error("timeout");
      e.name = "TimeoutError";
      throw e;
    });
    const r = await new AmazonProvider(amazonConfig, reviewed(SOURCE_POLICIES.amazon), fetchImpl).search(plan, ctx());
    expect(r.outcome).toBe("timeout");
  });
});
