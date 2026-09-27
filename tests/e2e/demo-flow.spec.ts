import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * デモモード（SEARCH_MODE=demo・架空データ・簡易解析）での主要フロー。
 * デモの保存データはタブのメモリだけにあるため、保存後は page.goto を使わず
 * 画面内のリンク・ボタン（クライアント側遷移）で移動する。
 */

const EXAMPLE = "幅90cm以内の白いデスク。予算は送料込み2万円。新品で、来月までに欲しい";
const SOURCE_TABS = [/楽天市場（デモ・架空データ）/, /Amazon（デモ・架空データ）/] as const;
const VERDICT_RE = /確認できた|要確認|条件と異なる/;
const DEMO_CTA = "デモ商品のため購入できません";

/** アプリの入力ホーム（/app）から希望を入力して検索画面へ進む。 */
async function searchFromHome(page: Page, text: string) {
  await page.goto("/app");
  await page.getByLabel("欲しいものと条件").fill(text);
  await page.getByRole("button", { name: "この希望で探す" }).click();
  await expect(page).toHaveURL(/\/search$/);
}

async function waitForSearchDone(page: Page) {
  await expect(page.getByRole("status")).toHaveText("検索が完了しました。", { timeout: 20_000 });
}

/** 表示中のタブパネル直下の商品カード（除外候補の折りたたみ内は含まない）。 */
function resultCards(panel: Locator): Locator {
  return panel.locator(":scope > ul > li");
}

function conditionsSection(page: Page): Locator {
  return page.getByRole("region", { name: "条件" });
}

/** 追加の会話メッセージを送り、条件更新の応答と検索完了を待つ。 */
async function sendChat(page: Page, text: string, expectedReply: string | RegExp) {
  await page.getByLabel("希望や条件の変更").fill(text);
  await page.getByRole("button", { name: "送信" }).click();
  await expect(page.getByRole("region", { name: "希望を伝える" }).getByText(expectedReply).last()).toBeVisible();
  await waitForSearchDone(page);
}

/** 未ログインで保存 → デモログイン → 検索画面に戻って保存する。 */
async function saveViaDemoLogin(page: Page) {
  await conditionsSection(page).getByRole("button", { name: "この条件を保存" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("button", { name: "デモとして続ける" }).click();
  await expect(page).toHaveURL(/\/search$/);

  const prompt = page.getByRole("note").filter({ hasText: "ログインしました。入力中の条件を保存できます。" });
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "この条件を保存" }).click();

  await expect(page.getByText(/「.+」として保存しました。/)).toBeVisible();
  await expect(prompt).toBeHidden();
  await expect(page.getByText(/保存済みの希望「.+」の条件で探しています。/)).toBeVisible();
  await expect(page.getByText("保存済みの条件と同じです。")).toBeVisible();
  await expect(page.getByText(/未保存の変更があります/)).toHaveCount(0);
}

test.describe("デモモードの主要フロー", () => {
  test("アプリの入力ホーム（/app）に見出しとデモモードの表示がある", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("heading", { level: 1, name: "欲しい条件を、ここに保存。" })).toBeVisible();
    const banner = page.getByRole("note").filter({ hasText: "デモモード" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("購入できません");
  });

  test("未登録で希望を入力すると、両方の情報源の候補と判定・購入不可の表示が出る", async ({ page }) => {
    await searchFromHome(page, EXAMPLE);
    await waitForSearchDone(page);

    for (const tabName of SOURCE_TABS) {
      const tab = page.getByRole("tab", { name: tabName });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");

      const panel = page.getByRole("tabpanel", { name: tabName });
      await expect(panel).toBeVisible();
      const cards = resultCards(panel);
      await expect(cards.first()).toBeVisible();
      const count = await cards.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const card = cards.nth(i);
        await expect(card).toContainText(VERDICT_RE);
        await expect(card).toContainText("デモ・架空データ");
        await expect(card.getByText(DEMO_CTA)).toHaveAttribute("aria-disabled", "true");
      }
    }

    // 除外候補を含め、候補エリアに外部への購入リンクは存在しない
    await expect(page.locator('[role="tabpanel"] a[href^="http"]')).toHaveCount(0);
    await expect(page.locator('[role="tabpanel"] a[href]')).toHaveCount(0);
  });

  test("条件フォームに読み取った条件が反映され、会話で一部だけ更新・解除できる", async ({ page }) => {
    await searchFromHome(page, EXAMPLE);
    await waitForSearchDone(page);

    const form = conditionsSection(page);
    const budget = form.getByLabel("予算（円）");
    const width = form.getByLabel("幅", { exact: true });
    await expect(budget).toHaveValue("20000");
    await expect(width).toHaveValue("90");
    await expect(form.getByLabel("色（必須条件）")).toHaveValue("ホワイト");
    await expect(form.getByLabel("状態", { exact: true })).toHaveValue("new");
    await expect(form.getByRole("radio", { name: "送料込みの総額" })).toBeChecked();
    await expect(form.getByLabel("希望時期（任意）")).not.toHaveValue("");

    await sendChat(page, "幅は80cmまで", /条件を更新しました（幅: 80cm以内）/);
    await expect(width).toHaveValue("80");
    await expect(budget).toHaveValue("20000");
    await expect(form.getByLabel("色（必須条件）")).toHaveValue("ホワイト");

    await sendChat(page, "予算を解除", /条件を更新しました（予算: 解除）/);
    await expect(budget).toHaveValue("");
    await expect(width).toHaveValue("80");
  });

  test("保存にはログインが必要で、保存後はマイ希望から再検索・変更の保存ができる", async ({ page }) => {
    await searchFromHome(page, EXAMPLE);
    await waitForSearchDone(page);

    await test.step("ログインして保存する", async () => {
      await saveViaDemoLogin(page);
    });

    await test.step("マイ希望に一覧表示される", async () => {
      await page.getByRole("link", { name: "マイ希望を見る" }).click();
      await expect(page).toHaveURL(/\/wishes$/);
      await expect(page.getByRole("heading", { level: 1, name: "マイ希望" })).toBeVisible();
      await expect(page.getByText("保存した条件は自動では検索・購入されません").first()).toBeVisible();
      const items = page.getByRole("main").getByRole("listitem");
      await expect(items).toHaveCount(1);
      await expect(items.first().getByRole("link", { name: /ホワイトのデスク（幅90cm以内/ })).toBeVisible();
    });

    await test.step("「この条件で探す」で保存済みの条件から再検索する", async () => {
      await page.getByRole("button", { name: "この条件で探す" }).click();
      await expect(page).toHaveURL(/\/search$/);
      await expect(page.getByText(/保存済みの希望「.+」の条件で探しています。/)).toBeVisible();
      await expect(page.getByText("保存済みの条件と同じです。")).toBeVisible();
      await waitForSearchDone(page);
      const panel = page.getByRole("tabpanel", { name: SOURCE_TABS[0] });
      await expect(resultCards(panel).first()).toBeVisible();
      await expect(conditionsSection(page).getByLabel("予算（円）")).toHaveValue("20000");
    });

    await test.step("条件を変えると未保存の表示が出て、変更を保存すると消える", async () => {
      const form = conditionsSection(page);
      const saveChanges = form.getByRole("button", { name: "変更を保存" });
      await expect(saveChanges).toBeDisabled();

      await form.getByLabel("幅", { exact: true }).fill("85");
      await expect(page.getByText(/未保存の変更があります/)).toBeVisible();
      await expect(saveChanges).toBeEnabled();

      await saveChanges.click();
      await expect(page.getByText("変更を保存しました。")).toBeVisible();
      await expect(page.getByText(/未保存の変更があります/)).toBeHidden();
      await expect(page.getByText("保存済みの条件と同じです。")).toBeVisible();
      await expect(saveChanges).toBeDisabled();
    });
  });

  test("希望の詳細で結果を記録でき、削除すると一覧から消える", async ({ page }) => {
    await searchFromHome(page, EXAMPLE);
    await waitForSearchDone(page);
    await saveViaDemoLogin(page);

    await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "マイ希望" }).click();
    await expect(page).toHaveURL(/\/wishes$/);
    await page.getByRole("main").getByRole("link", { name: /ホワイトのデスク/ }).click();
    await expect(page).toHaveURL(/\/wishes\/[^/]+$/);
    await expect(page.getByRole("heading", { level: 1, name: /ホワイトのデスク/ })).toBeVisible();

    const feedback = page.getByRole("region", { name: "結果の記録（任意）" });
    await feedback.getByLabel("今回は見送った").check();
    await feedback.getByLabel("価格", { exact: true }).check();
    await feedback.getByRole("button", { name: "記録する" }).click();

    const history = feedback.getByRole("listitem").filter({ hasText: "理由：価格" });
    await expect(history).toHaveCount(1);
    await expect(history).toContainText("今回は見送った");
    await expect(history).toContainText("条件の版 1");

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "削除", exact: true }).click();
    await expect(page).toHaveURL(/\/wishes$/);
    await expect(page.getByText("まだ保存した希望はありません。")).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: /ホワイトのデスク/ })).toHaveCount(0);
  });

  test("対象外の商品を入力すると、デスクのみ対応の案内が出て候補は表示されない", async ({ page }) => {
    await searchFromHome(page, "おすすめの椅子を教えて");
    const chat = page.getByRole("region", { name: "希望を伝える" });
    await expect(chat.getByText(/デスク（机）の購入希望に対応しています/)).toBeVisible({ timeout: 20_000 });
    await expect(chat.getByText("デスク以外の商品は、現在は探せません", { exact: false })).toBeVisible();

    const panel = page.getByRole("tabpanel", { name: SOURCE_TABS[0] });
    await expect(panel.getByText("結果はありません。")).toBeVisible();
    await expect(page.getByText(DEMO_CTA)).toHaveCount(0);
    await expect(resultCards(panel)).toHaveCount(0);
  });
});

test.describe("アクセシビリティの基本", () => {
  test("入力欄にラベルがあり、タブはキーボードで操作でき、ライブリージョンがある", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByLabel("欲しいものと条件")).toBeVisible();

    await searchFromHome(page, EXAMPLE);
    await expect(page.getByRole("status")).toBeAttached();
    await expect(page.getByRole("status")).toHaveAttribute("aria-live", "polite");
    await waitForSearchDone(page);

    await expect(page.getByLabel("希望や条件の変更")).toBeVisible();
    const form = conditionsSection(page);
    for (const label of ["タイトル（任意）", "商品種類", "用途（任意）", "予算（円）", "色（必須条件）", "数量", "希望時期（任意）"]) {
      await expect(form.getByLabel(label, { exact: true })).toBeVisible();
    }
    for (const label of ["幅", "奥行き", "高さ", "状態"]) {
      await expect(form.getByLabel(label, { exact: true })).toBeVisible();
    }

    const tabs = page.getByRole("tablist", { name: "検索元" }).getByRole("tab");
    await expect(tabs).toHaveCount(2);
    const first = page.getByRole("tab", { name: SOURCE_TABS[0] });
    const second = page.getByRole("tab", { name: SOURCE_TABS[1] });
    await expect(first).toHaveAttribute("aria-selected", "true");
    await expect(first).toHaveAttribute("tabindex", "0");
    await expect(second).toHaveAttribute("tabindex", "-1");

    await first.focus();
    await page.keyboard.press("ArrowRight");
    await expect(second).toBeFocused();
    await expect(second).toHaveAttribute("aria-selected", "true");
    await expect(first).toHaveAttribute("aria-selected", "false");
    await expect(page.getByRole("tabpanel", { name: SOURCE_TABS[1] })).toBeVisible();

    // 末尾から右で先頭へ戻り、左でも移動できる
    await page.keyboard.press("ArrowRight");
    await expect(first).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(second).toBeFocused();
    await expect(second).toHaveAttribute("aria-selected", "true");
  });
});
