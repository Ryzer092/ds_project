import Link from "next/link";
import { OPERATOR_NAME, type MarketingConfig } from "@/config/marketing";
import { MARKETING_NAV } from "./nav";
import { Wordmark } from "./wordmark";

/**
 * フッター。所在地・メール・法人番号・SNSは提供されていないため掲載しない。
 * 未設定の掲載先（利用規約・問い合わせ）はリンクを出さない（# の空リンクで動くように見せない）。
 */
export function MarketingFooter({ config }: { config: MarketingConfig }) {
  const legal = [
    config.privacyUrl && { href: config.privacyUrl, label: config.privacyUrl.startsWith("/settings") ? "データの扱い" : "プライバシーポリシー" },
    config.termsUrl && { href: config.termsUrl, label: "利用規約" },
    config.contactUrl && { href: config.contactUrl, label: "お問い合わせ" },
  ].filter((x): x is { href: string; label: string } => Boolean(x));

  return (
    <footer className="border-t border-mk-line bg-white">
      <div className="mx-auto grid w-full max-w-[1200px] gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr] md:px-10 lg:px-16">
        <div className="flex flex-col gap-3">
          <Wordmark />
          <p className="text-sm text-mk-muted">運営：{OPERATOR_NAME}</p>
          <p className="max-w-sm text-xs leading-relaxed text-mk-muted">
          今日
          </p>
        </div>
        <nav aria-label="サービス紹介">
          <p className="mb-3 text-sm font-semibold">サービス紹介</p>
          <ul className="flex flex-col gap-2 text-sm text-mk-muted">
            {MARKETING_NAV.map((item) => (
              <li key={item.href}>
                <a href={item.href} className="hover:text-mk-ink">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {legal.length > 0 && (
          <nav aria-label="ポリシー">
            <p className="mb-3 text-sm font-semibold">ポリシー</p>
            <ul className="flex flex-col gap-2 text-sm text-mk-muted">
              {legal.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-mk-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
      <div className="border-t border-mk-line">
        <p className="mx-auto w-full max-w-[1200px] px-5 py-6 text-xs text-mk-muted md:px-10 lg:px-16">
          © 2026 {OPERATOR_NAME}
        </p>
      </div>
    </footer>
  );
}
