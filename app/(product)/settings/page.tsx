import type { Metadata } from "next";
import { AccountPanel } from "@/components/settings/account-panel";
import { getAppConfig } from "@/lib/server/app-config";

export const metadata: Metadata = { title: "設定" };

export default function SettingsPage() {
  const config = getAppConfig();
  const months = config.limits.wishRetentionMonths;
  const days = config.limits.opsRetentionDays;
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <h1 className="text-2xl font-bold">設定</h1>

      <section aria-labelledby="account-h" className="flex flex-col gap-3">
        <h2 id="account-h" className="text-lg font-semibold">
          アカウント
        </h2>
        <AccountPanel />
      </section>

      <section id="data" aria-labelledby="data-h" className="flex flex-col gap-3 text-sm leading-relaxed">
        <h2 id="data-h" className="text-lg font-semibold">
          データの扱い
        </h2>
        <h3 className="font-medium">保存するもの</h3>
        <ul className="list-disc pl-5">
          <li>本人が確認して保存した購入条件と、その変更履歴（条件の版）</li>
          <li>任意の結果報告（購入した・見送った・検討中、一般的な理由、300文字までのひとこと）</li>
          <li>運用のための記録（検索の件数・所要時間・検索元の状態など。会話・商品情報・価格・URLは含みません）</li>
        </ul>
        <h3 className="font-medium">保存しないもの</h3>
        <ul className="list-disc pl-5">
          <li>チャットの会話（このタブの中だけで扱います）</li>
          <li>商品名・価格・画像などの商品情報（表示のたびに検索元から取得します）</li>
          <li>外部ECでの注文・購入履歴、注文番号、決済情報、住所</li>
        </ul>
        <h3 className="font-medium">保存期間</h3>
        <p>
          購入希望と結果報告は最終更新から{months}か月、運用のための記録は{days}日で削除します。
          希望を削除すると、その条件の履歴と結果報告も一緒に削除されます。アカウントを削除すると本人の記録をすべて削除します。
          バックアップからの消去には、利用するデータベースサービスの保持期間に応じた時間がかかる場合があります。
        </p>
        <h3 className="font-medium">外部AIの利用</h3>
        <p>
          {config.aiMode === "llm"
            ? "入力した希望の文章と現在の条件は、条件の読み取りと検索語の作成のために外部のAI（Anthropic社のClaude）へ送信します。"
            : "現在、外部のAIは使用していません。"}
          商品情報やメールアドレスはAIへ送信しません。
        </p>
        <h3 className="font-medium">第三者への共有</h3>
        <p>購入希望を販売者など第三者へ共有することはありません。</p>
        <h3 className="font-medium">外部サイトへのリンク</h3>
        <p>
          「楽天市場で確認」「Amazonで確認」は各サイトの商品ページを新しいタブで開きます。購入は各サイトで行い、当サービスは注文・決済を行いません。
          アフィリエイトリンクを含む場合があり、その場合も紹介料によって表示順を変えることはありません。
        </p>
      </section>
    </div>
  );
}
