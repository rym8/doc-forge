import { expect, test } from "@playwright/test";

test("セッション作成からチャット更新までE2Eで動作する", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "メニューを開く" }).click();
  await page.getByRole("button", { name: "新規セッション" }).click();
  await expect(page.getByText(/^現在のセッション:/)).toBeVisible();

  await page.getByRole("button", { name: "編集モードに切り替え" }).click();
  const editor = page.getByPlaceholder("Markdownを書き始めてください...");
  await expect(editor).toBeVisible();

  const marker = `marker-${Date.now()}`;
  const prompt = [
    "必ず update_document ツールを1回使ってください。",
    "document には次のMarkdown全文をそのまま設定してください。",
    "# E2E Document",
    "",
    "## Latest Update",
    `- ${marker}`,
  ].join("\n");
  await page.getByPlaceholder("メッセージを入力...").fill(prompt);
  await page.getByRole("button", { name: "送信" }).click();

  await expect(editor).toHaveValue(/Latest Update/);
  await expect(editor).toHaveValue(new RegExp(marker));

  await expect(page.getByRole("button", { name: "直前の変更を元に戻す" })).toBeVisible();
  await page.getByRole("button", { name: "変更履歴を開く" }).click();
  await expect(page.getByText("変更履歴")).toBeVisible();
  await expect(page.getByRole("button", { name: "復元" }).first()).toBeVisible();
});
