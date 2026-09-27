import { CheckCircle2, CircleSlash } from "lucide-react";
import type { Metadata } from "next";
import { DemoStartedTracker } from "@/components/demo-started-tracker";
import { HomeStart } from "@/components/home-start";
import { publicStateLabel } from "@/lib/schemas/source";
import { getAppConfig } from "@/lib/server/app-config";

export const metadata: Metadata = { title: "はじめる" };

/** MVPの入力ホーム（デモの入口）。紹介サイト（/）の「デモを試す」から遷移する。 */
export default async function AppHomePage(props: PageProps<"/app">) {
  const sp = await props.searchParams;
  const fromMarketing = sp.entry === "marketing";
  const config = getAppConfig();
  const readySources = config.sources.filter((s) => s.state === "ready");

  return (
    <div className="flex flex-col gap-8">
      {fromMarketing && <DemoStartedTracker />}
      <section className="flex flex-col gap-4 pt-4">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">欲しい条件を、ここに保存。</h1>
        <p className="text-base text-muted-foreground">
          {readySources.length > 0
            ? `${readySources.map((s) => s.label.replace(/（.*）/, "")).join("・")}の対応商品から候補を探し、条件を変えて探し直せます。`
            : "楽天・Amazonの対応商品から候補を探し、条件を変えて探し直せます。"}
        </p>
        <HomeStart />
      </section>

      <section aria-labelledby="sources-heading" className="flex flex-col gap-3">
        <h2 id="sources-heading" className="text-lg font-semibold">
          検索元の状態
        </h2>
        <ul className="flex flex-col gap-2 sm:flex-row sm:gap-4">
          {config.sources.map((s) => (
            <li key={s.sourceId} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              {s.state === "ready" ? (
                <CheckCircle2 className="size-4 text-success" aria-hidden />
              ) : (
                <CircleSlash className="size-4 text-muted-foreground" aria-hidden />
              )}
              <span className="font-medium">{s.label}</span>
              <span className="text-muted-foreground">{publicStateLabel(s.state)}</span>
            </li>
          ))}
        </ul>
        {readySources.length === 0 && (
          <p className="text-sm text-muted-foreground">
            現在、利用できる検索元がありません。条件の保存と整理はできますが、候補は表示されません。
          </p>
        )}
      </section>

      <section aria-labelledby="how-heading" className="flex flex-col gap-3">
        <h2 id="how-heading" className="text-lg font-semibold">
          使い方
        </h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {[
            ["1. 希望を伝える", "目的・予算・サイズなどを文章で入力します。読み取った条件はフォームで確認・修正できます。"],
            ["2. 候補を確認する", "条件と一致・違反・未確認の点を商品ごとに表示します。購入は各ECサイトで行います。"],
            ["3. 条件を保存する", "ログインすると条件を保存し、後から同じ条件で探し直せます。自動で検索・購入はしません。"],
          ].map(([title, body]) => (
            <li key={title} className="rounded-lg border p-4">
              <p className="font-medium">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
