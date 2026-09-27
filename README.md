# Next AI Agent — 購入希望を預かるAIショッピング MVP ＋ サービス紹介サイト

欲しいものと購入条件を保存し、楽天市場・Amazon の公式商品APIで対応商品を探して、必要なときに同じ条件で探し直せる購買アシスタントです。
仕様は「Next AI Agent 購入希望を預かるAIショッピングMVP 要件定義書 v2.0（2026-09-26）」の P0 と、「サービス紹介サイト 要件定義書 v1.0（2026-09-27）」に従っています。

| URL | 内容 |
|---|---|
| `/` | サービス紹介ページ（右上・ページ内の「デモを試す」から `/app` へ） |
| `/app` | MVPの入力ホーム（デモの入口） |
| `/search`・`/login`・`/wishes`・`/wishes/[id]`・`/settings` | MVP |

紹介サイトの構成・デモへの接続設定・計測・公開状態は `docs/marketing-integration.md` を参照してください。

- 決済・自動購入・定期監視は実装していません。購入は各ECサイトで行います。
- 表示する商品は接続先の公開情報です。独占商品・特別価格・全商品網羅・最安値を示唆しません。
- 初期カテゴリは仮に「デスク」です（`lib/categories/desks.ts`。`INITIAL_CATEGORY` で切り替え可能な構成）。

## 現在の状態

| 区分 | 内容 |
|---|---|
| **実装済み** | サービス紹介ページ（`/`、デモへの導線・画面サンプル・FAQ）／入力ホーム（`/app`）／相談・検索（チャット＋編集可能な条件フォーム＋検索元別の候補）／ログイン（Supabase メールOTP）／マイ希望（一覧・編集・再検索・休止・終了・削除）／希望詳細（結果報告）／設定（データの扱い・ログアウト・アカウント削除）／楽天・Amazon アダプター／Claude による条件抽出／条件照合（確認できた・条件と異なる・要確認）／デモモード／レート制限・費用上限・同時実行ロック・冪等性／運用記録／DB migration（RLS・所有権制約・版管理・保持期間） |
| **テスト済み** | Vitest 157件（単体111件、API結合21件、PGlite による RLS 検証25件）、Playwright E2E 44件（紹介サイトの導線を含む。デモモード、390px モバイル＋デスクトップの各22件）、lint、typecheck、production build。すべて fixture で実行し有料APIは呼びません |
| **実API検証待ち** | 楽天 live・Amazon live・Claude live・Supabase 実環境・Upstash 実環境は、資格情報がないため**実通信で未検証**です。アダプターは公式資料で確認した仕様に基づき実装し、モックで検証しています（`docs/provider-setup.md`、`docs/live-verification.md`） |
| **公開前確認** | 紹介サイトの公開ドメイン・正式ロゴ・問い合わせ先・利用規約・正式なプライバシーポリシー（未提供のためリンクを出していません。`SITE_URL`・`MARKETING_INDEXABLE` を設定するまで noindex）、各情報源の利用条件の確認と `lib/policies/source-policies.ts` への記録（未確認の情報源は live でも「現在利用できません」になります）、Supabase のメールテンプレート・SMTP・保持期間の定期実行、Upstash の設定、費用上限の見直し、プライバシーポリシー・特定商取引法等の表記、公開デプロイ |

## すぐに試す（デモモード・キー不要）

```bash
nvm use            # Node.js 24 LTS 推奨（.nvmrc）。22.12 以上で動作
corepack enable
pnpm install
cp .env.example .env.local   # SEARCH_MODE=demo のまま
pnpm dev
```

<http://localhost:3000> で紹介ページが開きます。「デモを試す」から `/app` に進み、「幅90cm以内の白いデスク。予算は送料込み2万円。新品で、来月までに欲しい」などを入力します。

デモモードでは：

- 商品はすべて架空（`fixtures/demo-offers.ts`）で、外部リンクがなく購入できません。全画面にデモ表示が出ます。
- `ANTHROPIC_API_KEY` がなければ、AIではなくルールベースの簡易解析で条件を読み取ります（画面に明示）。
- ログインは「デモとして続ける」で、保存はこのタブのメモリだけです（再読み込みで消えます）。偽の認証を live に持ち込みません。

## live モードの設定

1. `.env.local` に `SEARCH_MODE=live` と各資格情報を設定します（`.env.example` 参照）。キー不足時にデモへは切り替わりません。
2. Supabase：migration の適用、メールOTP用テンプレート（`{{ .Token }}`）、SMTP、pg_cron による保持期間の削除（`docs/provider-setup.md#supabase`）。
3. Upstash Redis：本番の live では必須です。未設定・障害時は有料検索を停止します。
4. 商品API：資格情報を設定し、**利用条件を確認したうえで** `lib/policies/source-policies.ts` の `reviewedAt`・`reviewedBy`・`evidence` を記入し、`display`・`conditionMatching`（画像を表示するなら `imageDisplay`）を `allowed` にします。確認記録のない `allowed` は無効として扱われます。
5. `docs/live-verification.md` の手順で少数の実検索を行い、結果を記録します。

楽天だけが利用可能な場合は楽天のみで限定的に実証できます。Amazon は利用資格（直近30日の適格販売）が必要で、満たさない場合は「現在利用できません」と表示されます。

## コマンド

| コマンド | 内容 |
|---|---|
| `pnpm dev` | 開発サーバー |
| `pnpm build` / `pnpm start` | 本番ビルド／起動 |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | ルート型生成＋ `tsc --noEmit` |
| `pnpm test` | Vitest（単体・結合・RLS） |
| `pnpm test:e2e` | Playwright（デモモードの本番ビルドをポート3200で起動。初回は `pnpm exec playwright install chromium`） |
| `pnpm check` | lint → typecheck → test → build |

## 採用バージョン

Node.js 24 LTS（`.nvmrc`、`engines` は `>=22.12.0`。開発環境の検証は Node 22.21 で実施）、pnpm 10.19、Next.js 16.3.6（App Router、Turbopack、`proxy.ts`）、React 19.2.8、TypeScript 5.9.3（strict）、Tailwind CSS 4.3.3、shadcn/ui 形式のコンポーネント（`components/ui`、Radix 非依存のネイティブ要素）、lucide-react 1.48、Zod 4.6.5、@anthropic-ai/sdk 0.128.0、@supabase/ssr 0.12.7、@supabase/supabase-js 2.117.2、@upstash/redis 1.39.0、Vitest 5.0.2、@playwright/test 1.63.0、@electric-sql/pglite 0.5.8（RLSテスト用）。正確な版は `pnpm-lock.yaml` を参照してください。

## 構成

```text
app/
  (marketing)/             サービス紹介ページ（/）。紹介サイト用の layout
  (product)/               MVP（/app, /search, /login, /wishes, /wishes/[id], /settings）。アプリ用の layout
  api/search               POST：SSE（status / intent / clarification / offers / source_status / error / done）
  api/wishes[/id[/feedback|/search-context]]  本人の希望・報告・一時検索コンテキスト
  api/account              DELETE：本人確認後のアカウント削除
  api/events               POST：許可済みイベントのみ
components/                チャット、条件フォーム、商品カード、結果パネル、希望一覧・詳細、報告フォーム
  marketing/               紹介サイトのヘッダー・ヒーロー・画面サンプル・各セクション・FAQ・DemoLink
config/marketing.ts        デモのリンク先・公開状態・掲載先・カテゴリ別の掲載文（一元管理）
lib/
  auth/                    Supabase（サーバー・ブラウザ・管理クライアント）
  categories/              カテゴリ設定（デスク）
  client/                  タブ内メモリの状態・保存先（API / デモ用メモリ）
  llm/                     Claude 抽出・デモ用簡易解析・出力検証（商品データを送らない）
  policies/                情報源の利用条件記録・URL/画像ホスト検証
  schemas/                 Wish / Offer / Feedback / 検索API の型と検証
  search/                  条件照合・寸法読み取り・検索プラン・統括・アダプター（rakuten / amazon / demo）
  server/                  環境変数・上限/費用枠（Redis/メモリ）・署名・運用記録
  wishes/                  保存先（Supabase）・タイトル生成
supabase/migrations/       テーブル・RLS・トリガー・保持期間関数
supabase/sql/              保持期間の定期実行（pg_cron）
fixtures/                  デモ用の架空商品
tests/unit, integration, e2e
docs/                      provider-setup.md（API仕様の確認記録）、live-verification.md（実API検証手順）、marketing-integration.md（紹介サイトの接続）
```

## 主な設計判断

- **商品情報は一時データ**：DB・Redis・ログ・ブラウザ永続領域に保存しません。fetch は `no-store`、画像は Next.js の最適化を通さず許可ホストのURLを直接表示します（`images.unoptimized`）。
- **AIの範囲**：Claude は利用者の希望の構造化と検索語生成だけに使い、商品の本文・画像・価格は送りません。候補の事実や条件判定は API の取得値と通常コードで生成します。モデルは `ANTHROPIC_MODEL`（既定 `claude-opus-5`）、拒否時のサーバー側フォールバック（`fallbacks: "default"`）を有効にしています。
- **条件照合は保守的**：寸法はラベル付き表記のみ読み取り、型番の数字は使いません。送料・税が確認できない場合は総額を計算しません。色は商品名だけでは違反と断定せず、希望時期は API から確認できないため常に「要確認」です。全必須条件が確認できた候補だけを「確認できた」と表示します。
- **情報源別表示**：混合ランキング・横並びの価格比較は行いません（`comparison` は確認されるまで無効）。
- **保存と所有権**：保存は本人の確認操作だけ。所有者はサーバーの認証から決まり、RLS・複合外部キー・列単位の権限・トリガーで他人の希望への書き込みや所有者の変更を防ぎます。版はトリガーで採番し、編集は版による楽観ロックで競合を検出します。
- **再検索**：保存した条件はサーバーで読み、本人だけが30分使える署名付きトークンをタブ内メモリで検索画面へ渡します（URL に条件や ID を載せません）。
- **上限**：1検索あたり LLM 最大2回・商品API 最大4回（再試行込み）、各情報源10件、全体30秒。匿名 1分5回・1日10回、ログイン 1日30回、同時実行1、全体の日次上限100（いずれも環境変数で変更可）。Redis の Lua による原子的な予約で、失敗時は枠を戻します。同じ clientRequestId の重複は拒否します。

## 仕様から補った点・未確定事項

- `PurchaseWish` に `productType`（商品種類）と `lastSearchedAt` を追加しました（仕様の「商品種類」「直近の検索日時」の表示のため）。
- デモモードで `ANTHROPIC_API_KEY` が設定されている場合は Claude を使います（商品データは架空のまま）。
- 楽天のジャンルID・Amazon の検索インデックスは未確認のため使わず、キーワード検索にしています（`lib/categories/desks.ts`）。
- 楽天 API の Origin/Referer 要件、Amazon の価格フィルタの単位は資料で確定できず、前者は https 時に送信、後者は送信していません。
- 分散レート制限は `@upstash/ratelimit` ではなく、Upstash Redis 上の Lua スクリプトで実装しました（費用枠の予約・取り消しと同じ仕組みで扱うため）。
- 結果報告の「購入先」を記録しても、外部ECの注文確認ではなく自己申告として扱います。リンクを開いただけでは記録しません。
- 数値目標（保存率・再検索率など）は未設定です。実証開始前にチームで設定してください。

## 費用の目安（検証前の概算）

- Claude（`claude-opus-5`：入力 $5／出力 $25 per 100万トークン）：1回の条件抽出で入力約1,500〜2,500トークン、出力（思考を含む）数百〜約1,500トークンを想定し、1検索あたりおおむね $0.01〜0.05。全体の日次上限100検索・LLM 200回の既定値で、1日の上限はおおむね数ドル程度です。実際の usage（`search_runs.llm_input_tokens` 等）で見直してください。
- 楽天・Amazon の商品APIは API 自体の利用料はかかりませんが、回数制限と利用資格があります。
- Supabase・Upstash・Vercel は各プランの料金に従います。
- これらは費用を保証する値ではありません。実単価で `MAX_GLOBAL_SEARCHES_PER_DAY` 等を計算して設定してください。

## この文書だけを根拠に行わないこと

有料契約、公開デプロイ、広告出稿、実購入、第三者への連絡。
