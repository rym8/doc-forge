#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, "..");
const WIN_UNPACKED_DIR = path.join(APP_ROOT, "dist", "win-unpacked");
const KEEP_ARTIFACTS = process.env.DOC_FORGE_DESKTOP_SMOKE_KEEP_ARTIFACTS === "1";
const DEFAULT_TIMEOUT_MS = 30_000;
const DESKTOP_LOG_TAIL_LINES = 120;

function assertWindowsPlatform() {
  if (process.platform === "win32") return;
  throw new Error(
    `[desktop-smoke] このテストは Windows 専用です。current=${process.platform}/${process.arch}`
  );
}

function readPackageJson() {
  const packagePath = path.join(APP_ROOT, "package.json");
  if (!fs.existsSync(packagePath)) {
    throw new Error(`[desktop-smoke] package.json が見つかりません: ${packagePath}`);
  }
  return JSON.parse(fs.readFileSync(packagePath, "utf8"));
}

function resolveWindowsExecutable() {
  const packageJson = readPackageJson();
  const productName =
    packageJson?.build?.productName ?? packageJson?.productName ?? packageJson?.name;

  if (!productName || typeof productName !== "string") {
    throw new Error("[desktop-smoke] productName の解決に失敗しました。");
  }

  const preferred = path.join(WIN_UNPACKED_DIR, `${productName}.exe`);
  if (fs.existsSync(preferred)) return preferred;

  if (!fs.existsSync(WIN_UNPACKED_DIR)) {
    throw new Error(
      `[desktop-smoke] win-unpacked が見つかりません: ${WIN_UNPACKED_DIR}\n` +
        "先に `npm run dist:win` を実行してください。"
    );
  }

  const fallback = fs
    .readdirSync(WIN_UNPACKED_DIR)
    .find((name) => name.toLowerCase().endsWith(".exe"));
  if (!fallback) {
    throw new Error(
      `[desktop-smoke] 実行ファイルが見つかりません: ${WIN_UNPACKED_DIR}`
    );
  }

  return path.join(WIN_UNPACKED_DIR, fallback);
}

function tryReadDesktopLog(logPath) {
  if (!fs.existsSync(logPath)) return null;
  const content = fs.readFileSync(logPath, "utf8");
  if (!content.trim()) return "";
  const lines = content.trimEnd().split(/\r?\n/);
  return lines.slice(-DESKTOP_LOG_TAIL_LINES).join("\n");
}

async function launchApp(executablePath, env) {
  const app = await electron.launch({
    executablePath,
    env,
    timeout: 120_000,
  });
  const page = await app.firstWindow({ timeout: 120_000 });
  const userDataPath = await app.evaluate(({ app: electronApp }) =>
    electronApp.getPath("userData")
  );
  await page.waitForLoadState("domcontentloaded", { timeout: DEFAULT_TIMEOUT_MS });
  return { app, page, userDataPath };
}

async function readGlobalErrorText(page) {
  try {
    const banner = page.locator("div.bg-destructive").first();
    if (!(await banner.isVisible({ timeout: 1500 }))) return null;
    const text = (await banner.textContent())?.trim();
    return text || null;
  } catch {
    return null;
  }
}

async function runScenario(executablePath) {
  const smokeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "doc-forge-desktop-smoke-"));
  const appDataRoot = path.join(smokeRoot, "appdata");
  const userDataRoot = path.join(smokeRoot, "userdata");
  const tempRoot = path.join(smokeRoot, "tmp");
  const dbPath = path.join(smokeRoot, "data", "doc-forge.smoke.db");
  const secretPath = path.join(smokeRoot, "data", ".doc-forge-credentials.key");
  let desktopLogPath = path.join(userDataRoot, "logs", "desktop.log");

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.mkdirSync(appDataRoot, { recursive: true });
  fs.mkdirSync(userDataRoot, { recursive: true });
  fs.mkdirSync(tempRoot, { recursive: true });

  const env = {
    ...process.env,
    LLM_PROVIDER: process.env.LLM_PROVIDER ?? "mock",
    NEXT_TELEMETRY_DISABLED: "1",
    DOC_FORGE_DB_PATH: dbPath,
    DOC_FORGE_CREDENTIALS_SECRET_PATH: secretPath,
    DOC_FORGE_DESKTOP_DISABLE_FIRST_LAUNCH_GUIDE: "1",
    DOC_FORGE_DESKTOP_USER_DATA_DIR: userDataRoot,
    APPDATA: appDataRoot,
    LOCALAPPDATA: appDataRoot,
    TEMP: tempRoot,
    TMP: tempRoot,
  };

  const marker = `desktop-smoke-${Date.now()}`;
  const document = `# Desktop Smoke\n\n- ${marker}\n\n[External Link](https://example.com)`;

  let firstRunApp = null;
  let secondRunApp = null;
  let failed = false;

  try {
    const firstRun = await launchApp(executablePath, env);
    firstRunApp = firstRun.app;
    const firstPage = firstRun.page;
    desktopLogPath = path.join(firstRun.userDataPath, "logs", "desktop.log");

    await firstPage.getByRole("button", { name: "メニューを開く" }).click();
    await firstPage.getByRole("button", { name: "新規セッション" }).click();
    try {
      await firstPage.getByText(/^現在のセッション:/).waitFor({
        state: "visible",
        timeout: DEFAULT_TIMEOUT_MS,
      });
    } catch (error) {
      const uiError = await readGlobalErrorText(firstPage);
      if (uiError) {
        throw new Error(`[desktop-smoke] UIエラー検出: ${uiError}`);
      }
      throw error;
    }

    await firstPage.getByRole("button", { name: "編集モードに切り替え" }).click();
    const editor = firstPage.getByPlaceholder("Markdownを書き始めてください...");
    await editor.fill(document, { timeout: DEFAULT_TIMEOUT_MS });
    await firstPage.waitForTimeout(1_500);

    await firstRunApp.close();
    firstRunApp = null;

    const secondRun = await launchApp(executablePath, env);
    secondRunApp = secondRun.app;
    const secondPage = secondRun.page;

    await secondPage.getByRole("button", { name: "メニューを開く" }).click();
    await secondPage
      .getByRole("button", { name: /^セッションを選択:/ })
      .first()
      .click({ timeout: DEFAULT_TIMEOUT_MS });

    await secondPage.getByRole("button", { name: "編集モードに切り替え" }).click();
    const editorAfterRestart = secondPage.getByPlaceholder(
      "Markdownを書き始めてください..."
    );
    await editorAfterRestart.waitFor({ state: "visible", timeout: DEFAULT_TIMEOUT_MS });
    const restored = await editorAfterRestart.inputValue();
    if (!restored.includes(marker)) {
      throw new Error("[desktop-smoke] 再起動後のドキュメント復元に失敗しました。");
    }

    await secondPage.getByRole("button", { name: "プレビューモードに切り替え" }).click();
    const beforeUrl = secondPage.url();
    await secondPage.getByRole("link", { name: "External Link" }).click({
      timeout: DEFAULT_TIMEOUT_MS,
    });
    await secondPage.waitForTimeout(500);
    const afterUrl = secondPage.url();
    if (afterUrl !== beforeUrl) {
      throw new Error(
        `[desktop-smoke] 外部リンククリック後にアプリ内遷移が発生しました: ${beforeUrl} -> ${afterUrl}`
      );
    }

    await secondRunApp.close();
    secondRunApp = null;
    console.log("[desktop-smoke] success");
  } catch (error) {
    failed = true;
    const logTail = tryReadDesktopLog(desktopLogPath);
    console.error(`[desktop-smoke] failed. artifacts=${smokeRoot}`);
    if (logTail !== null) {
      console.error(
        `[desktop-smoke] desktop.log tail (${desktopLogPath}):\n${logTail}`
      );
    } else {
      console.error(`[desktop-smoke] desktop.log が見つかりません: ${desktopLogPath}`);
    }
    throw error;
  } finally {
    if (firstRunApp) {
      await firstRunApp.close().catch(() => {});
    }
    if (secondRunApp) {
      await secondRunApp.close().catch(() => {});
    }
    if (!KEEP_ARTIFACTS && !failed) {
      fs.rmSync(smokeRoot, { recursive: true, force: true });
    }
  }
}

async function main() {
  assertWindowsPlatform();
  const executablePath = resolveWindowsExecutable();
  await runScenario(executablePath);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
