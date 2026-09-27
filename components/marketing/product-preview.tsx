import type { CategoryMarketingContent } from "@/config/marketing";
import { AiBubble, CandidateCard, ConditionChip, SampleNote, UserBubble } from "./preview-parts";

/**
 * ヒーロー下の大きな画面サンプル。「会話 → 条件 → 商品候補」を文章を読まなくても伝える。
 * PCは会話と候補の2カラム、スマートフォンは会話 → 条件チップ → 候補の縦構成（縮小表示にしない）。
 * すべて説明用の架空データで、有料APIは呼ばず、販売サイトへのリンクも持たない。
 */
export function ProductPreview({ content }: { content: CategoryMarketingContent }) {
  return (
    <figure className="overflow-hidden rounded-[20px] border border-mk-line bg-white shadow-[0_24px_60px_-28px_rgba(20,43,30,0.28)]">
      <div className="flex items-center justify-between gap-3 border-b border-mk-line px-5 py-3">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-mk-line" />
          <span className="size-2.5 rounded-full bg-mk-line" />
          <span className="size-2.5 rounded-full bg-mk-line" />
        </div>
        <SampleNote />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="flex flex-col gap-4 border-mk-line p-5 md:p-7 lg:border-r">
          <p className="text-xs font-semibold tracking-wider text-mk-muted">会話</p>
          <UserBubble>{content.sampleUserMessage}</UserBubble>
          <AiBubble>{content.sampleAiReply}</AiBubble>
          <div className="mt-2 flex flex-col gap-2.5 rounded-2xl bg-mk-surface p-4">
            <p className="text-xs font-semibold tracking-wider text-mk-muted">条件</p>
            <ul className="flex flex-wrap gap-2" aria-label="整理された条件">
              {content.chips.map((c) => (
                <li key={c}>
                  <ConditionChip>{c}</ConditionChip>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-4 bg-[#FBFDFB] p-5 md:p-7">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-semibold tracking-wider text-mk-muted">商品候補</p>
            <p className="text-xs text-mk-muted">{content.candidates.length}件</p>
          </div>
          <ul className="flex flex-col gap-3">
            {content.candidates.map((c, i) => (
              <li key={c.name}>
                <CandidateCard candidate={c} variant={i % 2 === 0 ? "a" : "b"} />
              </li>
            ))}
          </ul>
        </div>
      </div>
      <figcaption className="sr-only">
        チャットで伝えた希望が条件として整理され、条件に合う候補と確認が必要な点が表示される画面のイメージ（架空のサンプル商品）。
      </figcaption>
    </figure>
  );
}
