import { expect, test, type Page } from "@playwright/test";

/**
 * 紹介サイト（/）とデモ（/app）への導線。
 * 文言をなぞるのではなく、リンク先の一元化・遷移・通信・レイアウト・操作性を確認する。
 */

const DEMO_PATH = "/app";

function demoLinks(page: Page) {
  return page.locator(`a[href^="${DEMO_PATH}?"]`);
}

test.describe("紹介サイトからデモへの導線", () => {
  test("全CTAが同じデモURLを指し、位置情報以外をURLに含めない", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

    const header = page.getByRole("banner");
    await expect(header.getByRole("link", { name: "デモを試す" })).toBeVisible();

    const hrefs = await demoLinks(page).evaluateAll((els) => els.map((e) => e.getAttribute("href")!));
    const placements = hrefs.map((h) => {
      const u = new URL(h, "http://x");
      expect(u.pathname).toBe(DEMO_PATH);
      expect([...u.searchParams.keys()].sort()).toEqual(["entry", "placement"]);
      expect(u.searchParams.get("entry")).toBe("marketing");
      return u.searchParams.get("placement");
    });
    expect(new Set(placements)).toEqual(new Set(["header", "hero", "preview", "footer"]));
  });

  test("ヘッダーの「デモを試す」でアプリの入力ホームへ移動し、アプリ用のレイアウトになる", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("banner").getByRole("link", { name: "デモを試す" }).click();
    await expect(page).toHaveURL(/\/app\?entry=marketing&placement=header$/);
    await expect(page.getByLabel("欲しいものと条件")).toBeVisible();
    // 紹介サイトのフッター（運営者表記）はアプリに表示しない
    await expect(page.getByText("運営：株式会社Next AI Agent")).toHaveCount(0);
    // アプリから紹介ページへ戻れる
    await page.getByRole("contentinfo").getByRole("link", { name: "サービス紹介" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("ヒーローのCTAから入力し、候補表示まで進める", async ({ page }) => {
    await page.goto("/");
    await page.locator('a[href*="placement=hero"]').click();
    await expect(page).toHaveURL(/\/app\?/);
    await page.getByLabel("欲しいものと条件").fill("幅90cm以内の白いデスク。予算は送料込み2万円");
    await page.getByRole("button", { name: "この希望で探す" }).click();
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByRole("status")).toHaveText("検索が完了しました。", { timeout: 20_000 });
    const panel = page.locator('[role="tabpanel"]:not([hidden])');
    await expect(panel.locator(":scope > ul > li").first()).toBeVisible();
  });

  test("紹介ページの表示ではLLM・商品API・外部サービスへの通信が発生しない", async ({ page, baseURL }) => {
    const requests: string[] = [];
    page.on("request", (r) => requests.push(r.url()));
    await page.goto("/", { waitUntil: "networkidle" });
    const offending = requests.filter((u) => !u.startsWith(baseURL!) || /\/api\/(search|wishes|account)/.test(u));
    expect(offending).toEqual([]);
  });

  test("画面サンプルの架空商品はリンク・入力欄・ボタンを持たない", async ({ page }) => {
    await page.goto("/");
    const preview = page.locator("figure").first();
    await expect(preview).toContainText("画面イメージ・架空のサンプル商品です");
    await expect(preview.locator("a, button, input, textarea, select")).toHaveCount(0);
    await expect(page.locator("#features a, #features button, #features input")).toHaveCount(0);
  });

  test("アプリの既存ルートが表示できる", async ({ page }) => {
    for (const path of ["/app", "/search", "/login", "/wishes", "/settings"]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.getByRole("link", { name: "Next AI Agent" }).first()).toHaveAttribute("href", "/app");
    }
  });
});

test.describe("レイアウトと操作性", () => {
  for (const width of [1440, 768, 390, 320]) {
    test(`${width}px で横方向にはみ出さず、ヘッダーのCTAが見える`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/", { waitUntil: "networkidle" });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const cta = page.getByRole("banner").getByRole("link", { name: "デモを試す" });
      await expect(cta).toBeInViewport();
    });
  }

  test("モバイルメニューは Esc・外側操作・項目選択で閉じ、アンカー先の見出しがヘッダーに隠れない", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "メニューを開く" });
    const menu = page.locator("#mk-mobile-menu");

    await toggle.click();
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("link").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(page.getByRole("button", { name: "メニューを開く" })).toBeFocused();

    await page.getByRole("button", { name: "メニューを開く" }).click();
    await page.mouse.click(200, 700);
    await expect(menu).toBeHidden();

    await page.getByRole("button", { name: "メニューを開く" }).click();
    await menu.getByRole("link", { name: "よくある質問" }).click();
    await expect(menu).toBeHidden();
    await expect(page).toHaveURL(/#faq$/);
    await expect
      .poll(async () => page.locator("#faq-heading").evaluate((el) => el.getBoundingClientRect().top))
      .toBeGreaterThanOrEqual(72);
  });

  test("メニューを開いている間、Tabキーのフォーカスはメニュー内を循環する", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "メニューを開く" }).click();
    const menu = page.locator("#mk-mobile-menu");
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => {
        const a = document.activeElement;
        return Boolean(a && (document.getElementById("mk-mobile-menu")?.contains(a) || a.getAttribute("aria-controls") === "mk-mobile-menu"));
      });
      expect(inside).toBe(true);
    }
    await expect(menu).toBeVisible();
  });

  test("FAQはキーボードで開閉できる", async ({ page }) => {
    await page.goto("/#faq");
    const item = page.locator("#faq details").first();
    await item.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(item).toHaveAttribute("open", "");
    await page.keyboard.press("Enter");
    await expect(item).not.toHaveAttribute("open", "");
  });

  test("動きを減らす設定では装飾のアニメーションを止める", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const anim = await page.getByRole("heading", { level: 1 }).evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe("none");
  });

  test("JavaScriptが無効でも本文とデモへのリンクを読める", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(demoLinks(page).first()).toHaveAttribute("href", /^\/app\?/);
    await expect(page.locator("#faq details").first()).toBeVisible();
    await ctx.close();
  });
});
