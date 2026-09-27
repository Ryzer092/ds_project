import { Bookmark, Clock3, ListChecks, MessageSquareText, Search, Store } from "lucide-react";
import type { CategoryMarketingContent, DemoPlacement } from "@/config/marketing";
import { cn } from "@/lib/utils";
import { DemoLink } from "./demo-link";
import { CheckRow, ConditionChip, DeskIllustration, SampleNote, UserBubble } from "./preview-parts";

/** セクション共通の外枠。1セクションで1つの価値を伝える。 */
export function Section({
  id,
  children,
  className,
  tone = "white",
  labelledBy,
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
  tone?: "white" | "surface" | "deep";
  labelledBy?: string;
}) {
  return (
    <section
      id={id}
      data-anchor={id ? "" : undefined}
      aria-labelledby={labelledBy}
      className={cn(
        "py-16 md:py-28",
        tone === "surface" && "bg-mk-surface",
        tone === "deep" && "bg-mk-deep text-white",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-[1200px] px-5 md:px-10 lg:px-16">{children}</div>
    </section>
  );
}

export function Eyebrow({ children, inverse = false }: { children: React.ReactNode; inverse?: boolean }) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 text-xs font-semibold tracking-[0.14em]",
        inverse ? "text-mk-accent" : "text-mk-primary",
      )}
    >
      <span className="size-1.5 rounded-full bg-mk-accent" aria-hidden />
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// 課題への共感
// ---------------------------------------------------------------------------
export function ProblemSection({ content }: { content: CategoryMarketingContent }) {
  return (
    <Section labelledBy="problem-heading">
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
        <div className="flex flex-col gap-6">
          <h2 id="problem-heading" className="mk-heading text-[28px] font-bold leading-[1.35] md:text-[40px]">
            商品を探す前に、
            <br />
            条件を何度も説明して
            <br className="hidden sm:block" />
            いませんか。
          </h2>
          <p className="max-w-[36em] text-base leading-[1.9] text-mk-muted md:text-lg">
            予算、サイズ、色、使い道。ページを行き来するうちに、何を大事にしたかったのか分からなくなる。
            Next AI Agentは、あなたの希望を整理するところから買い物を手伝います。
          </p>
        </div>
        <div aria-hidden className="relative w-full max-w-sm lg:mx-auto">
          <div className="absolute inset-0 translate-x-3 translate-y-3 rounded-2xl bg-mk-surface" />
          <div className="relative rounded-2xl border border-mk-line bg-white p-6">
            <p className="mb-4 text-xs font-semibold tracking-wider text-mk-muted">買いたいもののメモ</p>
            <ul className="flex flex-col gap-3">
              {content.memoLines.map((line, i) => (
                <li key={line} className="flex items-center gap-3 border-b border-dashed border-mk-line pb-3 text-[15px]">
                  <span className={cn("size-2 rounded-full", i === content.memoLines.length - 1 ? "bg-amber-400" : "bg-mk-accent")} />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// できること
// ---------------------------------------------------------------------------
function FeatureRow({
  index,
  title,
  body,
  visual,
  reverse,
}: {
  index: string;
  title: string;
  body: string;
  visual: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
      <div className={cn("flex flex-col gap-4", reverse && "lg:order-2")}>
        <span className="font-mono text-sm text-mk-primary">{index}</span>
        <h3 className="mk-heading text-2xl font-bold leading-snug md:text-[32px]">{title}</h3>
        <p className="max-w-[30em] text-base leading-[1.9] text-mk-muted md:text-lg">{body}</p>
      </div>
      <div className={cn("rounded-[20px] bg-mk-surface p-5 md:p-8", reverse && "lg:order-1")}>{visual}</div>
    </div>
  );
}

export function FeatureSection({ content, categoryLabel }: { content: CategoryMarketingContent; categoryLabel: string }) {
  const first = content.candidates[0];
  const r = content.refineMessages;
  return (
    <Section id="features" labelledBy="features-heading">
      <div className="mb-14 flex max-w-2xl flex-col gap-4 md:mb-20">
        <Eyebrow>FEATURES</Eyebrow>
        <h2 id="features-heading" className="mk-heading text-[28px] font-bold leading-[1.35] md:text-[40px]">
          できること
        </h2>
        <p className="text-base leading-relaxed text-mk-muted md:text-lg">
          体験版は、まず<strong className="font-semibold text-mk-ink">{categoryLabel}</strong>を対象にしています。
        </p>
      </div>

      <div className="flex flex-col gap-20 md:gap-28">
        <FeatureRow
          index="01"
          title="条件を、いつもの言葉で。"
          body="「もう少し小さく」「予算はそのまま」。会話を続けながら、欲しいものを具体的にできます。"
          visual={
            <div className="flex flex-col gap-4" aria-hidden>
              <UserBubble>{r.user}</UserBubble>
              <div className="flex flex-col gap-3 rounded-2xl border border-mk-line bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {r.chipsBefore.map((c, i) =>
                    c === r.chipsAfter[i] ? null : (
                      <ConditionChip key={c} tone="muted">
                        {c}
                      </ConditionChip>
                    ),
                  )}
                  {r.chipsAfter.map((c, i) => (
                    <ConditionChip key={c} tone={c === r.chipsBefore[i] ? "default" : "changed"}>
                      {c}
                    </ConditionChip>
                  ))}
                </div>
                <p className="text-xs text-mk-muted">変えた条件だけを更新し、ほかの条件はそのまま残します。</p>
              </div>
              <SampleNote />
            </div>
          }
        />
        <FeatureRow
          index="02"
          reverse
          title="候補の違いも、分からない点も。"
          body="価格や仕様だけでなく、送料や納期など確認が必要な点も整理。納得して販売サイトへ進めます。"
          visual={
            <div className="flex flex-col gap-4 rounded-2xl border border-mk-line bg-white p-5" aria-hidden>
              <div className="flex items-center gap-3">
                <DeskIllustration className="h-14 w-20 shrink-0" />
                <div>
                  <p className="font-semibold">{first.name}</p>
                  <p className="text-sm text-mk-muted">{first.price}</p>
                </div>
              </div>
              <ul className="flex flex-col gap-2.5">
                {first.checks.map((c) => (
                  <CheckRow key={c.label} label={c.label} status={c.status} />
                ))}
              </ul>
              <SampleNote />
            </div>
          }
        />
        <FeatureRow
          index="03"
          title="欲しい気持ちを、次の買い物へ。"
          body="希望を保存して、あとで条件を変えたり、同じ条件で探し直したりできます。"
          visual={
            <div className="flex flex-col gap-3 rounded-2xl border border-mk-line bg-white p-5" aria-hidden>
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-mk-muted">
                <Bookmark className="size-3.5" />
                保存した希望
              </div>
              <p className="font-semibold leading-snug">{content.savedWishTitle}</p>
              <div className="flex flex-wrap gap-2">
                {content.chips.slice(1).map((c) => (
                  <ConditionChip key={c}>{c}</ConditionChip>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-mk-line pt-4">
                <span className="inline-flex items-center gap-1.5 text-xs text-mk-muted">
                  <Clock3 className="size-3.5" />
                  好きなときに探し直せます
                </span>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-mk-surface px-3 py-2 text-sm font-medium text-mk-primary">
                  <Search className="size-4" />
                  この条件で探す
                </span>
              </div>
              <SampleNote className="pt-1" />
            </div>
          }
        />
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 使い方
// ---------------------------------------------------------------------------
export function HowItWorks({ step3Body, sourceNote }: { step3Body: string; sourceNote: string | null }) {
  const steps = [
    { icon: MessageSquareText, title: "希望を伝える", body: "商品、予算、サイズなどを入力。" },
    { icon: ListChecks, title: "候補を確認する", body: "条件との一致や、未確認の点を見る。" },
    { icon: Store, title: "販売サイトへ進む", body: step3Body },
  ];
  return (
    <Section id="how-it-works" tone="surface" labelledBy="how-heading">
      <div className="mb-12 flex max-w-2xl flex-col gap-4 md:mb-16">
        <Eyebrow>HOW IT WORKS</Eyebrow>
        <h2 id="how-heading" className="mk-heading text-[28px] font-bold leading-[1.35] md:text-[40px]">
          使い方
        </h2>
      </div>
      <ol className="grid gap-4 md:grid-cols-3 md:gap-6">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-4 rounded-[20px] bg-white p-6 md:p-8">
            <div className="flex items-center justify-between">
              <span className="inline-flex size-11 items-center justify-center rounded-xl bg-mk-surface text-mk-primary">
                <s.icon className="size-5" aria-hidden />
              </span>
              <span className="font-mono text-sm text-mk-muted" aria-hidden>
                STEP {i + 1}
              </span>
            </div>
            <h3 className="text-xl font-bold">
              <span className="sr-only">ステップ{i + 1}：</span>
              {s.title}
            </h3>
            <p className="text-base leading-relaxed text-mk-muted">{s.body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-8 text-base text-mk-ink md:text-lg">希望は保存して、あとから探し直せます。</p>
      {sourceNote && <p className="mt-2 text-sm text-mk-muted">{sourceNote}</p>}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 目指す未来
// ---------------------------------------------------------------------------
export function VisionSection() {
  return (
    <Section id="vision" tone="deep" labelledBy="vision-heading" className="relative overflow-hidden">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16">
        <div className="flex flex-col gap-6">
          <Eyebrow inverse>OUR VISION — 将来構想</Eyebrow>
          <h2 id="vision-heading" className="mk-heading text-[28px] font-bold leading-[1.35] md:text-[44px]">
            買い物を、安心して
            <br className="hidden sm:block" />
            任せられる未来へ。
          </h2>
          <p className="max-w-[34em] text-base leading-[1.9] text-white/85 md:text-lg">
            好みや暮らしに合う商品を見つけ、画像で使う場面を確かめる。そして、あらかじめ決めた予算や条件の範囲で購入を任せる。私たちは、そんな買い物の体験を目指しています。
          </p>
          <p className="max-w-[34em] text-sm leading-relaxed text-white/75">
            売り手が届けたい商品と、買い手が求める条件をつなぐ仕組みも構想しています。
          </p>
        </div>
        <div className="flex items-end">
          <div className="w-full rounded-[20px] border border-white/15 p-6">
            <p className="mb-2 text-sm font-semibold text-mk-accent">現在の体験版に含まれないもの</p>
            <p className="text-sm leading-relaxed text-white/85">
              画像・VRによる提案、価格条件による通知、自動購入は、現在の体験版には含まれません。
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 最終CTA
// ---------------------------------------------------------------------------
export function FinalCta({
  demoHref,
  demoReady,
  pendingReason,
  placement = "footer",
}: {
  demoHref: string;
  demoReady: boolean;
  pendingReason: string;
  placement?: DemoPlacement;
}) {
  return (
    <Section labelledBy="final-heading">
      <div className="mk-grid-bg flex flex-col items-center gap-6 rounded-[28px] bg-mk-surface px-6 py-16 text-center md:py-24">
        <h2 id="final-heading" className="mk-heading text-[28px] font-bold leading-[1.35] md:text-[44px]">
          まずは、欲しい条件を
          <br className="hidden sm:block" />
          ひとつ。
        </h2>
        <p className="max-w-[28em] text-base leading-relaxed text-mk-muted md:text-lg">
          次に買いたいものを、いつもの言葉で伝えてみてください。
        </p>
        <DemoLink href={demoHref} placement={placement} ready={demoReady} size="lg" label="デモを試す" pendingReason={pendingReason} />
        {!demoReady && <p className="text-sm text-mk-muted">{pendingReason}</p>}
      </div>
    </Section>
  );
}
