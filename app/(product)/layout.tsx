import type { Metadata } from "next";
import { AppStateProvider } from "@/components/providers/app-state";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getAppConfig } from "@/lib/server/app-config";

export const metadata: Metadata = {
  title: { default: "Next AI Agent｜欲しい条件を、ここに保存。", template: "%s｜Next AI Agent" },
  description: "欲しいものと購入条件を保存し、対応商品から候補を探して、条件を変えて探し直せる購買アシスタント。",
  // 検索内容・希望・設定はインデックス対象にしない
  robots: { index: false, follow: false },
};

// 情報源の状態や設定を毎回サーバーで判定する（静的化しない）。
export const dynamic = "force-dynamic";

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  const config = getAppConfig();
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-background focus:px-3 focus:py-2"
      >
        本文へ移動
      </a>
      <AppStateProvider config={config}>
        <SiteHeader />
        {config.mode === "demo" && (
          <div role="note" className="border-b border-warning/40 bg-warning/10 px-4 py-2 text-center text-sm">
            <strong>デモモード</strong>：表示される商品・店舗・価格はすべて架空で、購入できません。保存した希望はこのタブのメモリだけにあり、再読み込みで消えます。
          </div>
        )}
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
          {children}
        </main>
        <SiteFooter />
      </AppStateProvider>
    </>
  );
}
