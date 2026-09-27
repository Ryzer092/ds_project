import type { CategoryMarketingContent } from "@/config/marketing";
import { DemoLink } from "./demo-link";
import { ProductPreview } from "./product-preview";

type Props = {
  demoHrefHero: string;
  demoHrefPreview: string;
  demoReady: boolean;
  pendingReason: string;
  /** アプリが架空データで動くデモモードか。 */
  appDemoMode: boolean;
  content: CategoryMarketingContent;
};

export function Hero({ demoHrefHero, demoHrefPreview, demoReady, pendingReason, appDemoMode, content }: Props) {
  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden">
      <div className="mk-grid-bg pointer-events-none absolute inset-x-0 top-0 h-[520px] [mask-image:linear-gradient(to_bottom,black,transparent)]" aria-hidden />
      <div className="relative mx-auto flex w-full max-w-[1200px] flex-col items-center px-5 pb-16 pt-12 text-center md:px-10 md:pb-28 md:pt-20 lg:px-16">
        <p className="mk-fade-in inline-flex items-center gap-2 rounded-full border border-mk-line bg-white px-3.5 py-1.5 text-xs font-semibold tracking-[0.14em] text-mk-primary">
          <span className="size-1.5 rounded-full bg-mk-accent" aria-hidden />
          AI SHOPPING ASSISTANT
        </p>
        {!demoReady && (
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-1 text-sm font-medium text-amber-900">体験版を開発中</p>
        )}
        <h1
          id="hero-heading"
          className="mk-heading mk-fade-in mt-6 text-[clamp(2.25rem,1.35rem+4.2vw,4.75rem)] font-bold leading-[1.18]"
        >
          欲しい条件から、
          <br />
          買い物を
          <wbr />
          はじめよう。
        </h1>
        <p className="mk-phrase mk-fade-in mt-6 max-w-[34em] text-base leading-[1.9] text-mk-muted md:text-lg">
          予算も、サイズも、譲れないことも。
          <br className="hidden sm:block" />
          AIとの会話で整理して、商品候補を{demoReady ? "探せます" : "探せるサービスを目指して開発しています"}。
          <br className="hidden sm:block" />
          希望を保存すれば、続きはまた好きなときに。
        </p>
        <div className="mk-fade-in mt-9 flex flex-col items-center gap-3 sm:flex-row">
          <DemoLink href={demoHrefHero} placement="hero" ready={demoReady} size="lg" pendingReason={pendingReason} />
          <a
            href="#how-it-works"
            className="inline-flex h-14 items-center rounded-[10px] px-6 text-base font-semibold text-mk-ink hover:bg-mk-surface"
          >
            使い方を見る
          </a>
        </div>
        <p className="mk-phrase mt-4 text-sm text-mk-muted">
          {demoReady ? "初回の検索は登録不要。希望の保存にはログインが必要です。" : pendingReason}
        </p>
        {demoReady && appDemoMode && (
          <p className="mk-phrase mt-1 text-sm text-mk-muted">現在の体験版は、架空の商品データで流れを確認できます。</p>
        )}

        <div className="mk-fade-in-late mt-14 w-full text-left md:mt-20">
          <div className="rounded-[28px] bg-mk-surface p-2 sm:p-3 md:p-4">
            <ProductPreview content={content} />
          </div>
          <div className="mt-6 flex justify-center">
            <DemoLink
              href={demoHrefPreview}
              placement="preview"
              ready={demoReady}
              label="この体験を試す"
              variant="inverse"
              className="border border-mk-line"
              pendingReason={pendingReason}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
