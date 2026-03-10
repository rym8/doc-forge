import path from "node:path";
import { expect, test } from "@playwright/test";

const SAMPLE_IMAGE_FILE = path.resolve(process.cwd(), "public/file.svg");
const SAMPLE_IMAGE_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NDAiIGhlaWdodD0iMzYwIj48cmVjdCB3aWR0aD0iNjQwIiBoZWlnaHQ9IjM2MCIgZmlsbD0iIzBGMTcyQSIvPjxjaXJjbGUgY3g9IjE3MCIgY3k9IjE4MCIgcj0iNzAiIGZpbGw9IiMzOEJERjgiLz48cmVjdCB4PSIyODAiIHk9IjEyMCIgd2lkdGg9IjIwMCIgaGVpZ2h0PSIxMjAiIHJ4PSIxNiIgZmlsbD0iI0UyRThGMCIvPjx0ZXh0IHg9IjMyMCIgeT0iMTg1IiBmb250LXNpemU9IjM2IiBmb250LWZhbWlseT0iQXJpYWwiIGZpbGw9IiMwRjE3MkEiPkNoYXJ0PC90ZXh0Pjwvc3ZnPg==";

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
  await expect(
    page.getByLabel("制作メモ（プレビュー非表示）")
  ).toHaveValue(/資料の意図/);
  await expect(
    page.getByLabel("制作メモ（プレビュー非表示）")
  ).toHaveValue(new RegExp(marker));

  await page.getByRole("button", { name: "プレビューモードに切り替え" }).click();
  await expect(
    page.getByRole("heading", { name: "Latest Update" }).first()
  ).toBeVisible();
  await expect(page.getByTestId("document").getByText(marker)).toBeVisible();

  await expect(page.getByRole("button", { name: "直前の変更を元に戻す" })).toBeVisible();
  await page.getByRole("button", { name: "変更履歴を開く" }).click();
  await expect(page.getByText("変更履歴")).toBeVisible();
  await expect(page.getByRole("button", { name: "復元" }).first()).toBeVisible();
});

test("スライドセッションからPowerPointを出力できる", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "メニューを開く" }).click();
  await page.getByRole("button", { name: "新規セッション" }).click();
  await expect(page.getByText(/^現在のセッション:/)).toBeVisible();

  await page.getByRole("button", { name: "編集モードに切り替え" }).click();
  const editor = page.getByPlaceholder("Markdownを書き始めてください...");
  await expect(editor).toBeVisible();
  await expect(editor).toHaveValue("");

  await editor.fill(
    [
      "# 事業計画レビュー",
      "",
      "## 現状",
      "- 売上は前年同期比で増加",
      "- 利益率は改善余地がある",
      "",
      "## 次の打ち手",
      "- 注力市場を絞る",
      "- 重点施策を3つに整理する",
    ].join("\n")
  );
  await page.getByRole("button", { name: "スライドモード" }).click();
  await page.getByRole("button", { name: "原稿を読み込む" }).click();
  await expect(page.getByRole("button", { name: "スライド", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "スライド", exact: true }).click();
  await expect(page.getByRole("button", { name: /現状/i }).first()).toBeVisible();
  await page.getByRole("button", { name: /現状/i }).first().click();
  await page.getByLabel("スライドタイトル").fill("現状整理");
  await page.getByLabel("画像ファイルをアップロード").setInputFiles(SAMPLE_IMAGE_FILE);
  await expect(page.getByLabel("画像URL")).toHaveValue(/\/api\/sessions\/.+\/assets\//);
  await page.getByLabel("画像キャプション").fill("市場シェア図");
  await page
    .getByLabel("テーブルTSV")
    .fill(["項目\t値", "売上\t120", "利益率\t18%"].join("\n"));
  await page.getByLabel("テーブルキャプション").fill("主要KPI");
  await expect(page.getByRole("cell", { name: "売上" })).toBeVisible();
  await expect(page.getByText("未保存の変更")).toBeVisible();

  await page.getByRole("button", { name: "テーマ", exact: true }).click();
  await page.getByRole("button", { name: /midnight-boardroom/i }).click();
  await page.getByRole("button", { name: "テーマ保存" }).click();
  await expect(page.getByText("テーマ設定を保存しました。")).toBeVisible();

  await page.getByRole("button", { name: "変更履歴を開く" }).click();
  await expect(page.getByText("変更履歴")).toBeVisible();
  await expect(page.getByRole("button", { name: "復元" }).first()).toBeVisible();
  await page.getByRole("button", { name: "復元" }).first().click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "テーマ", exact: true }).click();
  await expect(page.getByLabel("テーマPreset ID")).toHaveValue("corp-default");

  await page.getByRole("button", { name: "スライド", exact: true }).click();
  const googleSlidesPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "スライド保存" }).click();
  await page.getByRole("button", { name: "Go: Google Slides" }).click();
  const googleSlides = await googleSlidesPromise;
  expect(googleSlides.suggestedFilename()).toMatch(/google-slides\.pptx$/);
  await expect(googleSlides.failure()).resolves.toBeNull();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "スライド保存" }).click();
  await page.getByRole("button", { name: "Go: PowerPoint" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.pptx$/);
  await expect(download.failure()).resolves.toBeNull();
});

test("原稿の画像記法とMarkdown tableを planner が visual 化できる", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "メニューを開く" }).click();
  await page.getByRole("button", { name: "新規セッション" }).click();

  await page.getByRole("button", { name: "編集モードに切り替え" }).click();
  const editor = page.getByPlaceholder("Markdownを書き始めてください...");
  await expect(editor).toBeVisible();
  await editor.fill(
    [
      "# 自動 visual テスト",
      "",
      "## 市場概況",
      `![市場図](${SAMPLE_IMAGE_DATA_URL})`,
      "市場の変化を1枚で説明する。",
      "",
      "## KPI",
      "| 項目 | 値 |",
      "| --- | --- |",
      "| 売上 | 120 |",
      "| 利益率 | 18% |",
    ].join("\n")
  );

  await page.getByRole("button", { name: "スライドモード" }).click();
  await page.getByRole("button", { name: "原稿を読み込む" }).click();
  await expect(page.getByRole("button", { name: "スライド", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "スライド", exact: true }).click();
  await page.getByRole("button", { name: /市場概況/i }).first().click();
  await expect(page.getByLabel("画像URL")).toHaveValue(SAMPLE_IMAGE_DATA_URL);

  await page.getByRole("button", { name: /KPI/i }).first().click();
  await expect(page.getByRole("cell", { name: "売上" })).toBeVisible();
});

test("slides セッションでは document/slides を往復でき、原稿読込で更新できる", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "メニューを開く" }).click();
  await page.getByRole("button", { name: "新規セッション" }).click();

  await page.getByRole("button", { name: "編集モードに切り替え" }).click();
  const editor = page.getByPlaceholder("Markdownを書き始めてください...");
  await editor.fill(
    [
      "# 営業資料",
      "",
      "## 重点項目",
      "- 売上拡大",
      "",
      "## 補足",
      "次の打ち手を整理する。",
    ].join("\n")
  );
  await page.getByRole("button", { name: "スライドモード" }).click();
  await page.getByRole("button", { name: "原稿を読み込む" }).click();
  await expect(page.getByRole("button", { name: "スライド", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "ドキュメントモード" }).click();
  await expect(page.getByPlaceholder("メッセージを入力...")).toBeVisible();
  await expect(page.getByRole("button", { name: "スライドを更新" })).toHaveCount(0);

  const marker = `deck-marker-${Date.now()}`;
  await page.getByRole("button", { name: "編集モードに切り替え" }).click();
  await page
    .getByPlaceholder("Markdownを書き始めてください...")
    .fill(
      [
        "# 営業資料",
        "",
        "## 重点項目",
        "- 売上拡大",
        "",
        "## 補足",
        `- ${marker}`,
      ].join("\n")
    );

  await page.getByRole("button", { name: "スライドモード" }).click();
  await expect(page.getByRole("button", { name: "原稿を読み込む" })).toBeVisible();
  await page.getByRole("button", { name: "スライド", exact: true }).click();
  await expect(page.getByRole("button", { name: /補足/i }).first()).toBeVisible();
});

test("slides セッションでは visual を直接編集できる", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "メニューを開く" }).click();
  await page.getByRole("button", { name: "新規セッション" }).click();

  await page.getByRole("button", { name: "編集モードに切り替え" }).click();
  const editor = page.getByPlaceholder("Markdownを書き始めてください...");
  await editor.fill(
    [
      "# 製品紹介",
      "",
      "## 概要",
      "特徴を整理する。",
    ].join("\n")
  );
  await page.getByRole("button", { name: "スライドモード" }).click();
  await page.getByRole("button", { name: "原稿を読み込む" }).click();
  await expect(page.getByRole("button", { name: "スライド", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "スライド", exact: true }).click();
  await page.getByRole("button", { name: /概要/i }).first().click();

  await page.getByLabel("画像URL").fill(SAMPLE_IMAGE_DATA_URL);
  await page.getByLabel("画像キャプション").fill("chat画像");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "スライド保存" }).click();
  await page.getByRole("button", { name: "Go: PowerPoint" }).click();
  await downloadPromise;
  await expect(page.getByLabel("画像URL")).toHaveValue(SAMPLE_IMAGE_DATA_URL);
});

test("planner は原稿内容に応じてレイアウトを自動選択できる", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "メニューを開く" }).click();
  await page.getByRole("button", { name: "新規セッション" }).click();
  await page.getByRole("button", { name: "編集モードに切り替え" }).click();

  const editor = page.getByPlaceholder("Markdownを書き始めてください...");
  await editor.fill(
    [
      "# 自動レイアウト",
      "",
      "## 比較ポイント",
      "- 現状案",
      "- 改善案",
      "",
      "## 導入フロー",
      "1. 要件整理",
      "2. 試作",
      "3. 導入",
      "",
      "## 主要論点",
      "- 売上",
      "- 利益率",
      "- 継続率",
      "- LTV",
    ].join("\n")
  );

  await page.getByRole("button", { name: "スライドモード" }).click();
  await page.getByRole("button", { name: "原稿を読み込む" }).click();
  await page.getByRole("button", { name: "スライド", exact: true }).click();

  await page.getByRole("button", { name: /比較ポイント/i }).first().click();
  await expect(page.getByLabel("スライドレイアウト")).toHaveValue("two-column");

  await page.getByRole("button", { name: /導入フロー/i }).first().click();
  await expect(page.getByLabel("スライドレイアウト")).toHaveValue(
    "flow-horizontal"
  );

  await page.getByRole("button", { name: /主要論点/i }).first().click();
  await expect(page.getByLabel("スライドレイアウト")).toHaveValue("four-panel");
});
