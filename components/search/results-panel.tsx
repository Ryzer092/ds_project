"use client";

import { useState } from "react";
import { useAppState, type SourceResult } from "@/components/providers/app-state";
import { Alert } from "@/components/ui/alert";
import { suggestionsFromExcluded } from "@/lib/search/results";
import type { SourceId } from "@/lib/schemas/offer";
import { publicStateLabel } from "@/lib/schemas/source";
import { cn } from "@/lib/utils";
import { OfferCard } from "./offer-card";

/**
 * 情報源別のタブ表示。混合ランキングや横並びの価格比較は行わない。
 */
export function ResultsPanel() {
  const { config, search, markOutbound } = useAppState();
  const sources = config.sources;
  const [active, setActive] = useState<SourceId>(sources[0]?.sourceId ?? "rakuten");

  if (search.status === "idle") {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        希望を入力するか、条件を指定して「この条件で探す」を押すと、ここに候補を表示します。
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="検索元" className="flex gap-1 border-b">
        {sources.map((s) => {
          const r = search.sources[s.sourceId];
          const count = r?.offers.length ?? 0;
          const selected = active === s.sourceId;
          return (
            <button
              key={s.sourceId}
              role="tab"
              id={`tab-${s.sourceId}`}
              aria-selected={selected}
              aria-controls={`panel-${s.sourceId}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(s.sourceId)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                const i = sources.findIndex((x) => x.sourceId === s.sourceId);
                const next = sources[(i + (e.key === "ArrowRight" ? 1 : sources.length - 1)) % sources.length];
                setActive(next.sourceId);
                document.getElementById(`tab-${next.sourceId}`)?.focus();
              }}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm",
                selected ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
              {r?.outcome === "ok" && <span className="ml-1 text-xs">（{count}）</span>}
            </button>
          );
        })}
      </div>

      {sources.map((s) => (
        <div
          key={s.sourceId}
          role="tabpanel"
          id={`panel-${s.sourceId}`}
          aria-labelledby={`tab-${s.sourceId}`}
          hidden={active !== s.sourceId}
          tabIndex={0}
          className="flex flex-col gap-3 focus-visible:outline-none"
        >
          <SourcePanel
            result={search.sources[s.sourceId]}
            fallbackLabel={s.label}
            unavailable={s.state !== "ready" ? publicStateLabel(s.state) : null}
            running={search.status === "running"}
            onOutbound={() => markOutbound(s.sourceId)}
          />
        </div>
      ))}
    </div>
  );
}

function SourcePanel({
  result,
  fallbackLabel,
  unavailable,
  running,
  onOutbound,
}: {
  result: SourceResult | undefined;
  fallbackLabel: string;
  unavailable: string | null;
  running: boolean;
  onOutbound: () => void;
}) {
  if (!result) {
    if (unavailable) return <Alert>{fallbackLabel}は{unavailable}。</Alert>;
    return <p className="text-sm text-muted-foreground">{running ? "取得中です…" : "結果はありません。"}</p>;
  }
  const label = result.label;
  const suggestions = suggestionsFromExcluded(result.excluded);
  return (
    <>
      {result.outcome && result.outcome !== "ok" && (
        <Alert variant={result.outcome === "empty" ? "default" : "warning"}>{result.message}</Alert>
      )}
      {result.offers.length > 0 && (
        <ul className="flex flex-col gap-3">
          {result.offers.map((o) => (
            <li key={`${o.sourceId}-${o.sourceItemId}`}>
              <OfferCard offer={o} sourceLabel={label} onOutbound={onOutbound} />
            </li>
          ))}
        </ul>
      )}
      {result.outcome === "ok" && result.offers.length === 0 && (
        <Alert>
          取得した候補はすべて必須条件と異なりました。条件は自動では緩めません。
          {suggestions.length > 0 && (
            <span className="mt-1 block">
              見直しの参考：
              {suggestions.map((s) => `「${s.label}」で${s.count}件`).join("、")}が条件と異なります。条件フォームで変更してから再度探してください。
            </span>
          )}
        </Alert>
      )}
      {result.excluded.length > 0 && (
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">条件と異なる候補（{result.excluded.length}件）</summary>
          <ul className="mt-3 flex flex-col gap-3">
            {result.excluded.map((o) => (
              <li key={`${o.sourceId}-${o.sourceItemId}`}>
                <OfferCard offer={o} sourceLabel={label} onOutbound={onOutbound} />
              </li>
            ))}
          </ul>
        </details>
      )}
      {(result.offers.length > 0 || result.excluded.length > 0) && (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          {result.affiliate && <p>このリンクはアフィリエイトリンクを含みます。紹介料によって表示順を変えることはありません。</p>}
          {result.notices.map((n) => (
            <p key={n}>{n}</p>
          ))}
          {result.sourceId === "rakuten" && !result.demo && (
            <p>
              <a href="https://developers.rakuten.com/" target="_blank" rel="noopener noreferrer" className="underline">
                Supported by Rakuten Developers
              </a>
            </p>
          )}
        </div>
      )}
    </>
  );
}
