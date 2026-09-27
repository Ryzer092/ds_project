import { Plus } from "lucide-react";

export type FaqItem = { q: string; a: string };

/** 標準の details/summary による開閉（JavaScriptなしでも動作し、キーボード・読み上げに対応）。 */
export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
      <div className="flex flex-col gap-4">
        <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-mk-primary">
          <span className="size-1.5 rounded-full bg-mk-accent" aria-hidden />
          FAQ
        </p>
        <h2 id="faq-heading" className="mk-heading text-[28px] font-bold leading-[1.35] md:text-[40px]">
          よくある質問
        </h2>
      </div>
      <div className="border-t border-mk-line">
        {items.map((item) => (
          <details key={item.q} className="group border-b border-mk-line">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-base font-semibold md:text-lg [&::-webkit-details-marker]:hidden">
              {item.q}
              <Plus
                className="size-5 shrink-0 text-mk-primary transition-transform group-open:rotate-45 motion-reduce:transition-none"
                aria-hidden
              />
            </summary>
            <p className="pb-6 pr-8 text-base leading-[1.9] text-mk-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
