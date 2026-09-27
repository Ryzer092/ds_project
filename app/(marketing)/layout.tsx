import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { buildDemoHref } from "@/config/marketing";
import { getMarketingState } from "@/lib/server/marketing-state";

// 実際の接続状態（SEARCH_MODE・情報源の設定）を毎回反映する。外部APIは呼ばない。
export const dynamic = "force-dynamic";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const state = getMarketingState();
  return (
    <div className="marketing flex min-h-full flex-1 flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        本文へ移動
      </a>
      <MarketingHeader
        demoHref={buildDemoHref(state.config.demoUrl, "header")}
        demoReady={state.demoReady}
        pendingReason="体験版を開発中です。"
      />
      <main id="main" className="flex-1">
        {children}
      </main>
      <MarketingFooter config={state.config} />
    </div>
  );
}
