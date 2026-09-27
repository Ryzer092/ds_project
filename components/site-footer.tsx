import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t py-6 text-xs text-muted-foreground">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4">
        <p>
          Next AI Agent は、楽天グループ株式会社・アマゾンジャパン合同会社とは資本関係・提携関係のない独立したサービスです。
          表示する商品は接続先の公開情報であり、全商品の網羅や最安値を示すものではありません。
        </p>
        <p className="flex gap-4">
          <Link href="/settings#data" className="underline underline-offset-2">
            データの扱い
          </Link>
          <Link href="/" className="underline underline-offset-2">
            サービス紹介
          </Link>
        </p>
      </div>
    </footer>
  );
}
