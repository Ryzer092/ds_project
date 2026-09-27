import { defineConfig, devices } from "@playwright/test";

/**
 * E2E テスト。常に SEARCH_MODE=demo（架空データ・キー不要）の本番ビルドに対して実行し、
 * 有料API（Claude・楽天・Amazon）は呼ばない。
 */
const PORT = 3200;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // demo でも情報源ごとの毎秒上限（PROVIDER_MAX_RPS）があるため並列数を抑える。
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "mobile",
      // Chromium のみで動かすため Pixel 系（chromium）のプロファイルを 390x844 に合わせる。
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      SEARCH_MODE: "demo",
      APP_ORIGIN: BASE_URL,
      // 有料APIのキーは明示的に空にする（demo では簡易解析と架空データだけを使う）。
      ANTHROPIC_API_KEY: "",
      RAKUTEN_APPLICATION_ID: "",
      RAKUTEN_ACCESS_KEY: "",
      AMAZON_CREDENTIAL_ID: "",
      AMAZON_CREDENTIAL_SECRET: "",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
      // テストは短時間に多数検索するため、メモリ上の利用上限を緩める（demo のみ・費用は発生しない）。
      ANON_SEARCHES_PER_MINUTE: "10000",
      ANON_SEARCHES_PER_DAY: "10000",
      IP_SEARCHES_PER_DAY: "100000",
      USER_SEARCHES_PER_DAY: "10000",
      MAX_GLOBAL_SEARCHES_PER_DAY: "100000",
      MAX_PROVIDER_CALLS_PER_DAY: "100000",
      PROVIDER_MAX_RPS: "10",
      EVENTS_PER_MINUTE: "10000",
    },
  },
});
