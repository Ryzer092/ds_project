# 商品API・外部サービスの設定

確認日：2026-09-26。実装時点で公式資料から確認した事項と、未確認の事項を分けて記録する。
これは技術資料の調査メモであり、利用規約の法的確認ではない。live で有効にする前に、実際の登録国・アカウント・用途について規約を確認し、`lib/policies/source-policies.ts` に確認記録を残すこと。

## 楽天市場 商品検索API

公式資料：<https://webservice.rakuten.co.jp/documentation/ichiba-item-search>（version:2026-07-01）

### 資料で確認できた事項（実装に反映）

| 項目 | 内容 | 実装 |
|---|---|---|
| エンドポイント | `GET https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701` | `lib/search/providers/rakuten.ts` |
| 認証 | `applicationId`（クエリ）＋ `accessKey`（ヘッダーまたはクエリ） | accessKey はヘッダーで送信し、URLに残さない |
| 形式 | `format=json&formatVersion=2` で `items[]` に直接入る | `items` / `Items` の両方を読む |
| 件数 | `hits` 1〜30 | 10件（情報源ごとの表示上限） |
| 価格フィルタ | `maxPrice`（整数） | 予算÷数量を単価上限として送る |
| 除外語 | `NGKeyword` | 「機能・特徴／素材」の除外指定を送る |
| 在庫 | `availability=1` で在庫ありのみ。レスポンス `availability` 0=在庫なし 1=在庫あり | 在庫ありのみ検索 |
| 税 | `taxFlag` 0=税込 1=税別 | 税別は予算内でも「要確認」 |
| 送料 | `postageFlag` 0=送料込 1=送料別 | 送料別は金額不明として扱い0円にしない |
| 価格帯 | `itemPriceMin3/Max3`（購入可能価格の範囲） | 差がある場合は「価格帯」表示 |
| エラー | `{"error","error_description"}`（400 wrong_parameter／404 not_found／429 too_many_requests／500／503）。ゲートウェイは `{"errors":{"errorCode","errorMessage"}}` を返す場合がある | 両形式を解析 |
| 回数制限 | 1アプリIDにつき1秒1回以下。繰り返し超過するとアプリIDが停止される場合がある | 情報源ごとに毎秒1回（`PROVIDER_MAX_RPS`）。429 は再試行しない |
| クレジット表示 | APIを使うアプリには所定のクレジット表示が必要（<https://webservice.rakuten.co.jp/guide/credit>） | 楽天の結果欄に「Supported by Rakuten Developers」を表示 |
| 価格の注記 | 価格・在庫を1時間ごとに更新しない場合、取得時刻と所定の注記を表示（FAQ 900001974343） | 取得時刻と注記を表示（`notices`） |

### 未確認の事項

- **Origin/Referer**：公式資料には記載がないが、登録した「許可されたWebサイト」と一致する Origin を求められるという報告がある。`APP_ORIGIN` が https の場合に Origin/Referer を送る。実通信で確認すること。
- **ジャンルID**：デスクのジャンルID（Webの表示では 200167）は、ジャンル検索APIで未確認。`lib/categories/desks.ts` の `genreIdVerified` が false の間は使わない。
- **mediumImageUrls の形式**：文字列か `{imageUrl}` か資料で断定できないため両方に対応。
- **規約上の扱い**：他サイトへのリンク（第8条4項）、収益化（第3条・第10条）、データの保存（第10条）、同一画面での他サービス表示（FAQ 900001970786）を、実際の用途で確認すること。

## Amazon Creators API

公式資料：<https://affiliate.amazon.co.jp/creatorsapi/docs/en-us/api-reference/operations/search-items>

### 資料で確認できた事項（実装に反映）

| 項目 | 内容 | 実装 |
|---|---|---|
| 認証 | OAuth2 client credentials。資格情報バージョンでトークン発行先が決まる：3.1→`api.amazon.com`、3.2→`api.amazon.co.uk`、3.3→`api.amazon.co.jp`（`/auth/o2/token`）。scope `creatorsapi::default`。有効期限は約1時間 | 3.1/3.2/3.3 以外は接続しない。トークンはプロセス内メモリで期限まで再利用 |
| SearchItems | `POST https://creatorsapi.amazon/catalog/v1/searchItems`、項目名は lowerCamelCase | `lib/search/providers/amazon.ts` |
| ヘッダー | `Authorization: Bearer`、`Content-Type: application/json`、`x-marketplace: www.amazon.co.jp` | 同左 |
| 必須項目 | `partnerTag`（`partnerType` はない） | `AMAZON_PARTNER_TAG` |
| 件数 | `itemCount` 1〜10 | 10件 |
| 条件 | `condition`: Any / New、`availability`: Available | 新品指定時は New |
| 日本の検索インデックス | Furniture はない。HomeAndKitchen / OfficeProducts / All 等 | 未確認の間は `All` |
| レスポンス | `searchResult.items[]`：`asin`、`detailPageURL`（改変しない）、`itemInfo.title.displayValue`、`images.primary.medium.url`、`offersV2.listings[].price.money.{amount,currency}`、`availability.type`、`condition.value`、`merchantInfo.name` | 税・送料は項目がないため「不明」 |
| エラー | 400 ValidationException／401 UnauthorizedException（TokenExpired 等）／403 AccessDeniedException（**AssociateNotEligible：直近30日で10件の適格販売が必要**）／429 ThrottleException | 403 AssociateNotEligible は `ineligible` として1時間停止。401 はトークンを取り直して1回再試行 |
| 回数制限 | 開始時 1TPS・8,640TPD（以後は売上に応じて変動） | 毎秒1回・日次上限（`MAX_PROVIDER_CALLS_PER_DAY`） |
| 表示・保存 | 画像は保存不可（リンクのみ24時間まで）。その他の内容は24時間までキャッシュ可。価格の横に取得時刻と所定の注記。コンテンツ提供元の表示 | 商品情報は保存しない。取得時刻と注記を表示 |

### 未確認の事項

- **minPrice/maxPrice の単位**（日本円での「最小通貨単位」）を資料で断定できないため送らない。価格判定は取得後にコードで行う。
- **資格情報 2.x** の認証方式は資料で確認できないため非対応。
- **利用資格**：アソシエイトの適格販売の要件を満たすか。満たさない場合は `ineligible` と表示し、スクレイピング等で代替しない。
- **規約上の扱い**：比較・価格追跡・保存・サイトの主目的（ライセンス契約(b)）を実際の用途で確認すること。

## Anthropic（Claude）

- 用途は希望の構造化（条件抽出）と検索語生成に限定。商品データ・メールアドレスは送らない。
- 既定モデル `claude-opus-5`（`ANTHROPIC_MODEL` で変更可）、`ANTHROPIC_EFFORT`（既定 low）。
- 構造化出力（`client.beta.messages.parse` ＋ Zod）。拒否時のサーバー側フォールバック（`fallbacks: "default"`、beta `server-side-fallback-2026-07-01`）を有効にしている。この機能に対応しないモデルを指定した場合は 400 になるため、`lib/llm/claude.ts` の該当2行を外す。
- SDKの自動再試行は0にし、1検索あたり最大2回（修復を含む）をアプリ側で数える。

## Supabase

1. プロジェクトを作成し、`supabase/migrations/20260926000000_initial_schema.sql` を適用する（`supabase db push` または SQL Editor）。
2. Authentication → Providers で Email を有効化。**メールOTP（コード入力）にするため、Email Templates の「Magic Link」テンプレートに `{{ .Token }}` を含める**（既定はリンクのみ）。
3. OTP の有効期限・送信回数制限（Rate Limits）を確認する。本番は独自SMTPを設定する（既定のメール送信は回数が厳しく制限される）。
4. URL Configuration の Site URL を `APP_ORIGIN` に合わせる。
5. `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_SERVER_SECRET_KEY` を設定する。secret key は運用メタデータの書き込みとアカウント削除にだけ使う。
6. 保存期間の定期削除：pg_cron を有効にし `supabase/sql/schedule-retention.sql` を実行する。
7. `purchase_wishes` / `feedback` は FORCE ROW LEVEL SECURITY。定期削除関数（security definer）は所有者が BYPASSRLS を持つ前提（Supabase の `postgres` ロールは該当）。所有者を変える場合は注意。
8. バックアップの保持期間と削除の反映はプランにより異なる。公開前に確認し、設定画面の説明と一致させる。

## Upstash Redis

- 本番の live では必須。未設定・障害時は有料検索を停止する（フェイルクローズ）。
- 保存するのはカウンタ・ロック・ハッシュ化したキーのみ。商品情報・会話は保存しない。
- レート制限は Lua スクリプトによる原子的な予約で実装（`lib/server/limit-store.ts`）。`@upstash/ratelimit` は使っていない（予約の取り消しや費用枠と同じ仕組みで扱うため）。
