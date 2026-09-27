import type { Metadata } from "next";
import { Faq, type FaqItem } from "@/components/marketing/faq";
import { Hero } from "@/components/marketing/hero";
import { FeatureSection, FinalCta, HowItWorks, ProblemSection, Section, VisionSection } from "@/components/marketing/sections";
import { LandingViewTracker } from "@/components/marketing/view-trackers";
import { buildDemoHref, isMarketingIndexable } from "@/config/marketing";
import { getMarketingState, sourceList, type MarketingState } from "@/lib/server/marketing-state";

const TITLE = "Next AI Agent｜欲しい条件からはじめるAIショッピング";
const DESCRIPTION =
  "予算やサイズなどの希望をAIとの会話で整理。対応する商品から候補を探し、購入条件を保存して探し直せるショッピングアシスタントです。";

export function generateMetadata(): Metadata {
  const indexable = isMarketingIndexable();
  return {
    title: { absolute: TITLE },
    description: DESCRIPTION,
    // 公開ドメイン確定・公開判断までは noindex（プレビュー扱い）
    robots: indexable ? { index: true, follow: true } : { index: false, follow: false },
    alternates: indexable ? { canonical: "/" } : undefined,
    openGraph: { title: TITLE, description: DESCRIPTION, type: "website", locale: "ja_JP", siteName: "Next AI Agent" },
    twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  };
}

/** 接続状態に合わせた「販売サイトへ進む」の説明。未接続の情報源を利用可能に見せない。 */
function sourceCopy(state: MarketingState): { step3: string; note: string | null; faqSources: string } {
  const connected = sourceList(state.connectedSources);
  const planned = sourceList(state.plannedSources);
  if (state.connectedSources.length > 0) {
    return {
      step3: `${connected}など、対応先で価格と条件を確認して購入。`,
      note: state.plannedSources.length > 0 ? `接続予定：${planned}` : null,
      faqSources: `現在は${connected}の商品から候補を探せます。`,
    };
  }
  return {
    step3: "対応する販売サイトで、価格と条件を確認して購入。",
    note: state.appDemoMode
      ? `体験版は架空の商品データで動作しています。${planned}への接続は準備中です。`
      : `${planned}への接続は準備中です。`,
    faqSources: `現在の体験版は架空の商品データで動作しており、${planned}への接続は準備中です。`,
  };
}

export default function MarketingPage() {
  const state = getMarketingState();
  const pendingReason = "体験版を開発中です。公開の準備ができしだい、ここから試せるようになります。";
  const copy = sourceCopy(state);
  const demoHref = (p: Parameters<typeof buildDemoHref>[1]) => buildDemoHref(state.config.demoUrl, p);

  const faq: FaqItem[] = [
    { q: "自動で商品を購入しますか？", a: "現在の体験版では購入しません。候補を確認し、販売サイトで購入します。" },
    {
      q: "どの商品を探せますか？",
      a: `初期は${state.categoryLabel}を対象にしています。検索できる商品は対応APIと接続状況により異なります。${copy.faqSources}`,
    },
    { q: "会員登録は必要ですか？", a: "初回検索は登録不要です。希望を保存して利用する場合はログインが必要です。" },
    {
      q: "表示された価格で買えますか？",
      a: "価格・在庫・送料などは変わる場合があります。購入時に販売サイトで最終条件を確認してください。このページの説明用サンプルの価格は実際の販売価格ではありません。",
    },
    {
      q: "希望を保存すると、ずっと探してくれますか？",
      a: "現在は、利用者が「この条件で探す」を選ぶと再検索します。定期監視や自動購入は行いません。",
    },
    {
      q: "楽天やAmazonの公式サービスですか？",
      a: "Next AI Agentが開発する独立したサービスです。情報源の利用によって、各社の公式サービスや独占的提携を意味するものではありません。",
    },
  ];

  return (
    <>
      <LandingViewTracker />
      <Hero
        demoHrefHero={demoHref("hero")}
        demoHrefPreview={demoHref("preview")}
        demoReady={state.demoReady}
        pendingReason={pendingReason}
        appDemoMode={state.appDemoMode}
        content={state.content}
      />
      <ProblemSection content={state.content} />
      <FeatureSection content={state.content} categoryLabel={state.categoryLabel} />
      <HowItWorks step3Body={copy.step3} sourceNote={copy.note} />
      <VisionSection />
      <Section id="faq" labelledBy="faq-heading">
        <Faq items={faq} />
      </Section>
      <FinalCta demoHref={demoHref("footer")} demoReady={state.demoReady} pendingReason={pendingReason} />
    </>
  );
}
