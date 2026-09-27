import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { DemoLink } from "@/components/marketing/demo-link";
import { buildDemoHref, getMarketingConfig, isMarketingIndexable, isTrustedLink } from "@/config/marketing";
import { resetEnvCache } from "@/lib/server/env";
import { getMarketingState } from "@/lib/server/marketing-state";
import { setProvidersForTesting } from "@/lib/search/providers/registry";
import type { SearchProvider } from "@/lib/search/providers/types";

const ENV_KEYS = ["MARKETING_DEMO_READY", "MARKETING_DEMO_URL", "MARKETING_PRODUCT_STATUS", "MARKETING_INDEXABLE", "SITE_URL", "SEARCH_MODE", "MARKETING_TERMS_URL"];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetEnvCache();
  setProvidersForTesting(null);
});

function provider(sourceId: "rakuten" | "amazon", state: ReturnType<SearchProvider["status"]>): SearchProvider {
  return { sourceId, label: sourceId, demo: false, affiliate: false, status: () => state, search: async () => ({ outcome: "empty", offers: [], opsCode: null }) };
}

describe("buildDemoHref", () => {
  it("固定の entry・placement だけを付け、既存のクエリと結合する", () => {
    expect(buildDemoHref("/app", "hero")).toBe("/app?entry=marketing&placement=hero");
    expect(buildDemoHref("/app?lang=ja#top", "footer")).toBe("/app?lang=ja&entry=marketing&placement=footer#top");
    expect(buildDemoHref("https://app.example.jp/start", "header")).toBe(
      "https://app.example.jp/start?entry=marketing&placement=header",
    );
  });

  it("信頼できないリンク先を拒否する", () => {
    expect(isTrustedLink("//evil.example")).toBe(false);
    expect(isTrustedLink("javascript:alert(1)")).toBe(false);
    expect(isTrustedLink("http://app.example.jp")).toBe(false);
    expect(() => buildDemoHref("//evil.example", "hero")).toThrow();
  });

  it("環境変数の不正なURLは無視して既定値を使う", () => {
    process.env.MARKETING_DEMO_URL = "javascript:alert(1)";
    expect(getMarketingConfig().demoUrl).toBe("/app");
    process.env.MARKETING_TERMS_URL = "#";
    expect(getMarketingConfig().termsUrl).toBeNull();
  });
});

describe("getMarketingState", () => {
  it("demo モードでは楽天・Amazonを接続済みとして扱わない", () => {
    process.env.SEARCH_MODE = "demo";
    resetEnvCache();
    const s = getMarketingState();
    expect(s.appDemoMode).toBe(true);
    expect(s.connectedSources).toEqual([]);
    expect(s.plannedSources).toEqual(["rakuten", "amazon"]);
    expect(s.demoReady).toBe(true);
  });

  it("live では利用可能な情報源だけを接続済みにし、live を名乗るのは接続がある場合だけ", () => {
    process.env.SEARCH_MODE = "live";
    process.env.MARKETING_PRODUCT_STATUS = "live";
    resetEnvCache();
    setProvidersForTesting([provider("rakuten", "ready"), provider("amazon", "ineligible")]);
    expect(getMarketingState()).toMatchObject({ connectedSources: ["rakuten"], plannedSources: ["amazon"], status: "live" });

    setProvidersForTesting([provider("rakuten", "policy_pending"), provider("amazon", "missing_credentials")]);
    expect(getMarketingState()).toMatchObject({ connectedSources: [], status: "demo" });
  });

  it("demoReady=false なら prelaunch として扱う", () => {
    process.env.MARKETING_DEMO_READY = "false";
    const s = getMarketingState();
    expect(s.status).toBe("prelaunch");
    expect(s.demoReady).toBe(false);
  });

  it("公開ドメインと公開判断が揃うまで noindex", () => {
    process.env.MARKETING_INDEXABLE = "true";
    expect(isMarketingIndexable()).toBe(false);
    process.env.SITE_URL = "http://localhost:3000";
    expect(isMarketingIndexable()).toBe(false);
    process.env.SITE_URL = "https://www.example.jp";
    expect(isMarketingIndexable()).toBe(true);
  });
});

describe("DemoLink", () => {
  it("準備中はクリックできるリンクにせず、理由を示す", () => {
    const html = renderToStaticMarkup(createElement(DemoLink, { href: "/app", placement: "hero", ready: false, pendingReason: "開発中" }));
    expect(html).not.toContain("<a");
    expect(html).toContain("デモ準備中");
    expect(html).toContain("開発中");
  });
});
