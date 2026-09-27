# 実API検証の手順と記録

通常のCIはfixtureのみを使い、有料・外部APIを呼ばない。実API検証は資格情報と利用条件の確認が揃った後に、少数の実検索で行う。
**秘密情報・商品本文・価格をこの文書や検証ログに残さないこと。** 記録するのは成否・件数・所要時間・確認した項目名だけにする。

## 前提

- [ ] APIアカウント・資格情報が発行済み（楽天：アプリID＋アクセスキー／Amazon：資格情報 3.x＋パートナータグ）
- [ ] 利用資格を満たしている（Amazon：適格販売の要件）
- [ ] 規約を確認し、`lib/policies/source-policies.ts` の該当情報源に `reviewedAt`・`reviewedBy`・`evidence` を記入し、`display` と `conditionMatching`（必要なら `imageDisplay`）を `allowed` にした
- [ ] `.env.local` に `SEARCH_MODE=live` と資格情報を設定した（リポジトリにコミットしない）

## 手順

1. `pnpm dev` で起動し、ホームの「検索元の状態」が「利用可能」になることを確認する。
2. 次の3件程度で検索する（1秒1回の制限に注意し、連続実行しない）。
   - 「幅90cm以内の白いデスク。予算は送料込み2万円」
   - 「昇降デスク 5万円まで」
   - 条件フォームのみ（商品種類：学習机）
3. 各情報源について以下を確認し、下の表に記録する。
   - フィールド変換：商品名・販売者・価格・税／送料の区分・在庫・状態が画面に正しく出るか（販売ページと目視で照合）
   - 価格表記：価格帯・「○円から」の扱い、取得時刻の表示
   - 出典・クレジット・注記の表示
   - リンク：「楽天市場で確認」「Amazonで確認」がその商品ページ（アフィリエイトタグ付き）を新しいタブで開くか
   - 所要時間（サーバーログの `search_run.durationMs`）
   - エラー時の表示（キーを一時的に誤った値にして「現在利用できません」になるか）
4. 楽天の Origin/Referer 要件、ジャンルID（ジャンル検索APIで確認した場合は `genreIdVerified: true`）の結果を記録する。

## 記録

| 日付 | 情報源 | 実施者 | 結果 | 件数 | 所要時間 | 確認した項目 | 備考 |
|---|---|---|---|---|---|---|---|
| — | 楽天市場 | — | 未実施（資格情報なし） | — | — | — | — |
| — | Amazon | — | 未実施（資格情報・利用資格なし） | — | — | — | — |

## 規約確認の記録（evidence の記録先）

### rakuten

- 確認日：未確認
- 確認者：
- 適用規約URL：<https://webservice.rakuten.co.jp/guide/rule>、<https://webservice.rakuten.co.jp/guide/credit>
- 確認結果（表示・条件照合・比較・識別子保存・画像表示・キャッシュごとに）：

### amazon

- 確認日：未確認
- 確認者：
- 適用規約URL：<https://affiliate.amazon.co.jp/help/operating/policies>、<https://affiliate.amazon.co.jp/help/operating/paapilicenseagreement>
- 確認結果（同上）：
