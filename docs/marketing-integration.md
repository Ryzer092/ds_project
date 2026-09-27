# 紹介サイトとアプリの接続

紹介サイト要件定義書 v1.0（2026-09-27）に基づく構成と、デモへの導線の設定・確認手順。

## 構成（同一の Next.js プロジェクト）

| URL | 役割 | 実装 |
|---|---|---|
| `/` | サービス紹介ページ | `app/(marketing)/page.tsx`・`layout.tsx`、`components/marketing/*` |
| `/app` | MVPの入力ホーム（デモの入口） | `app/(product)/app/page.tsx` |
| `/search`・`/login`・`/wishes`・`/wishes/[id]`・`/settings` | 既存のMVP（URLは変更なし） | `app/(product)/*` |
| `/api/*` | 既存のAPI（変更なし。計測イベントを追加） | `app/api/*` |

- ルートグループ名（`(marketing)`・`(product)`）はURLに含まれない。`/` を定義する page.tsx は `(marketing)` の1つだけ。
- レイアウトを分けている。紹介ページのヘッダー・フッターはアプリに表示せず、アプリのヘッダー（状態管理・デモ表示を含む）は紹介ページに表示しない。
- アプリ内のロゴは `/app`、「サービス紹介」のリンクは `/` へ向く。
- 旧仕様で `/` にあったMVPの入力ホームは `/app` に移した（紹介サイト要件定義書を優先）。

## デモへのリンク

リンク先は `config/marketing.ts` の `demoUrl` で一元管理し、全CTA（ヘッダー・ヒーロー・画面サンプル下・最終CTA）が共通の `DemoLink`（`components/marketing/demo-link.tsx`）で同じURLを使う。

- 付与するクエリは固定値の `entry=marketing` と `placement=header|hero|preview|footer` だけ。検索文・メール・希望の内容はURLに含めない。
- クエリで demo/live の切り替えや認証の迂回はできない（アプリは `SEARCH_MODE` 等のサーバー設定に従う）。
- `demoUrl` は相対パス（`/` 始まり、`//` 不可）か https の絶対URLだけを受け付ける。

### 設定値（`config/marketing.ts`、環境変数で上書き可）

| 項目 | 既定値 | 環境変数 | 備考 |
|---|---|---|---|
| productStatus | `demo` | `MARKETING_PRODUCT_STATUS` | 実際の接続状態より進んだ表示にはならない（live 設定でも接続済みの情報源がなければ demo 扱い） |
| demoUrl | `/app` | `MARKETING_DEMO_URL` | アプリを別ドメインに分けた場合は、確定した実URLを設定する（存在しないドメインを本番値にしない） |
| demoReady | `true` | `MARKETING_DEMO_READY` | 2026-09-27 に `/app` でデモの初回入力→候補表示を E2E で確認済み。false にすると全CTAが「デモ準備中」になり、ヒーローに「体験版を開発中」と表示 |
| activeSources | 楽天・Amazon | — | 紹介文で「接続済み」と書くのは、アプリ側で live かつ利用可能な情報源との共通部分だけ |
| privacyUrl | `/settings#data` | `MARKETING_PRIVACY_URL` | 既存アプリの「データの扱い」。正式なプライバシーポリシーは公開前に用意する |
| termsUrl | なし | `MARKETING_TERMS_URL` | 未設定の間はフッターにリンクを出さない |
| contactUrl | なし | `MARKETING_CONTACT_URL` | 同上 |

カテゴリ別の掲載文・画面サンプル（会話例・条件チップ・架空の候補）は `CATEGORY_CONTENT` にまとめている。`INITIAL_CATEGORY` を変更する場合は、同じキーでそのカテゴリの内容を追加する。

## 接続状態と紹介文

| アプリの状態 | ヒーロー | 使い方の3番目・FAQ |
|---|---|---|
| demo（`SEARCH_MODE=demo`） | 「デモを試す」＋「現在の体験版は、架空の商品データで流れを確認できます。」 | 対応する販売サイトで確認と表記し、「楽天市場・Amazonへの接続は準備中」と明記 |
| live・楽天のみ利用可能 | 「デモを試す」 | 「楽天市場など、対応先で…」＋「接続予定：Amazon」 |
| demoReady=false | 「体験版を開発中」＋「デモ準備中」（リンクなし） | 同上 |

## 計測

既存の `/api/events` を使い、広告ピクセル等は追加していない。

| イベント | 送信元 | 内容 |
|---|---|---|
| `landing_view` | 紹介ページの表示 | 種別のみ |
| `demo_cta_click` | 各CTAのクリック | 種別と位置（placement）のみ。クリックを利用開始・購入とは扱わない |
| `demo_started` | `/app` に `entry=marketing` 付きで到着 | 種別のみ |

- 紹介ページの訪問者は匿名IDを持たないため、重複・頻度の制限だけを短期のIPハッシュで行い、識別子は保存しない。
- 集計の失敗で遷移は止まらない（sendBeacon／keepalive）。
- DBへの記録には `supabase/migrations/20260927000000_marketing_events.sql` の適用が必要（`usage_events` のイベント種別と `placement` 列）。
- 既存の同意設定はない。同意管理を導入する場合は送信前に確認を追加する。

## SEO・公開状態

- title／description は要件定義書の案を使用。lang=ja、h1 は1つ。
- 独自のOG画像（`app/(marketing)/opengraph-image.tsx`、英字のみ）と favicon（`app/icon.svg`）。
- **既定は noindex**（プレビュー扱い）。公開ドメインが確定し公開を判断したら、`SITE_URL=https://…` と `MARKETING_INDEXABLE=true` を設定する。その場合だけ canonical と絶対URLのOGを出力し、`robots.txt` で紹介ページを許可する。
- アプリ（`/app`・`/search`・`/login`・`/wishes`・`/settings`）と `/api` は常にインデックス対象外。

## 確認手順

```bash
pnpm lint && pnpm typecheck && pnpm test   # 単体（導線設定・状態判定・準備中表示を含む）
pnpm test:e2e                              # 紹介サイト→デモ→候補表示、既存MVPの主要フロー
```

E2E（`tests/e2e/marketing.spec.ts`）で確認していること：全CTAのリンク先の一元化とクエリ、ヘッダーCTAで `/app` に遷移しアプリ用レイアウトになること、ヒーローCTAから入力して候補表示まで進めること、LP表示で LLM・商品API・外部サービスへの通信がないこと、画面サンプルに操作要素・リンクがないこと、既存ルートの表示、1440/768/390/320px で横はみ出しがないことと CTA の表示、モバイルメニュー（Esc・外側・項目選択で閉じる、フォーカス循環）、アンカー先の見出しが固定ヘッダーに隠れないこと、FAQ のキーボード操作、動きを減らす設定、JavaScript 無効時の本文とデモリンク。

## 公開前に必要な情報（未提供）

正式ロゴ、公開ドメイン、問い合わせ先、利用規約、正式なプライバシーポリシー、特定商取引法等の表記の要否確認。これらは推測で埋めていない。
