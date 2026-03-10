import { app, BrowserWindow, dialog, Menu, shell } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APP_ROOT = path.resolve(__dirname, "..");
const LEGACY_DATA_DIR = path.join(APP_ROOT, "data");
const STARTUP_TIMEOUT_MS = 60_000;
const DEFAULT_PORT = 3210;
const DEFAULT_HOST = "127.0.0.1";
const DESKTOP_LOG_FILENAME = "desktop.log";
const FIRST_LAUNCH_MARKER_FILENAME = ".desktop-onboarding-seen";
const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

let mainWindow = null;
let nextServerProcess = null;
let isQuitting = false;
let serverUrl = null;
let serverExit = null;
let desktopDataDir = null;
let desktopLogsDir = null;
let desktopLogFilePath = null;
let desktopLogStream = null;

function applyUserDataOverrideFromEnv() {
  const override = process.env.DOC_FORGE_DESKTOP_USER_DATA_DIR?.trim();
  if (!override) return;

  const resolved = path.resolve(override);
  fs.mkdirSync(resolved, { recursive: true });
  app.setPath("userData", resolved);
}

applyUserDataOverrideFromEnv();

function ensureDesktopDataDir() {
  if (!desktopDataDir) {
    desktopDataDir = path.join(app.getPath("userData"), "data");
  }
  fs.mkdirSync(desktopDataDir, { recursive: true });
  return desktopDataDir;
}

function ensureDesktopLogsDir() {
  if (!desktopLogsDir) {
    desktopLogsDir = path.join(app.getPath("userData"), "logs");
  }
  fs.mkdirSync(desktopLogsDir, { recursive: true });
  return desktopLogsDir;
}

function getDesktopLogFilePath() {
  if (!desktopLogFilePath) {
    desktopLogFilePath = path.join(ensureDesktopLogsDir(), DESKTOP_LOG_FILENAME);
  }
  return desktopLogFilePath;
}

function ensureDesktopLogStream() {
  if (!desktopLogStream) {
    desktopLogStream = fs.createWriteStream(getDesktopLogFilePath(), {
      flags: "a",
      encoding: "utf8",
    });
  }
  return desktopLogStream;
}

function appendDesktopLog(message) {
  try {
    const stream = ensureDesktopLogStream();
    const text = String(message);
    const withNewline = text.endsWith("\n") ? text : `${text}\n`;
    stream.write(`[${new Date().toISOString()}] ${withNewline}`);
  } catch {
    // Ignore logging failures to avoid breaking app startup.
  }
}

function closeDesktopLogStream() {
  if (!desktopLogStream) return;
  desktopLogStream.end();
  desktopLogStream = null;
}

function copyFileIfMissing(srcPath, destPath, options = {}) {
  if (!fs.existsSync(srcPath) || fs.existsSync(destPath)) return false;

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(srcPath, destPath);
  if (typeof options.mode === "number") {
    fs.chmodSync(destPath, options.mode);
  }
  return true;
}

function migrateLegacyDatabaseIfNeeded(targetDbPath) {
  const legacyDbPath = path.join(LEGACY_DATA_DIR, "doc-forge.db");
  const copiedDb = copyFileIfMissing(legacyDbPath, targetDbPath);
  if (!copiedDb) return;

  copyFileIfMissing(`${legacyDbPath}-wal`, `${targetDbPath}-wal`);
  copyFileIfMissing(`${legacyDbPath}-shm`, `${targetDbPath}-shm`);
  appendDesktopLog(`[migrate] database migrated to ${targetDbPath}`);
}

function migrateLegacyCredentialsKeyIfNeeded(targetSecretPath) {
  const legacySecretPath = path.join(LEGACY_DATA_DIR, ".doc-forge-credentials.key");
  const copied = copyFileIfMissing(legacySecretPath, targetSecretPath, {
    mode: 0o600,
  });
  if (copied) {
    appendDesktopLog(
      `[migrate] credentials key migrated to ${targetSecretPath}`
    );
  }
}

function resolveDesktopStorageOverrides() {
  const overrides = {};
  const userDataDataDir = ensureDesktopDataDir();

  const explicitDbPath = process.env.DOC_FORGE_DB_PATH?.trim();
  if (!explicitDbPath) {
    const targetDbPath = path.join(userDataDataDir, "doc-forge.db");
    migrateLegacyDatabaseIfNeeded(targetDbPath);
    overrides.DOC_FORGE_DB_PATH = targetDbPath;
  }

  const explicitSecretPath = process.env.DOC_FORGE_CREDENTIALS_SECRET_PATH?.trim();
  if (!explicitSecretPath) {
    const targetSecretPath = path.join(
      userDataDataDir,
      ".doc-forge-credentials.key"
    );
    migrateLegacyCredentialsKeyIfNeeded(targetSecretPath);
    overrides.DOC_FORGE_CREDENTIALS_SECRET_PATH = targetSecretPath;
  }

  const explicitAssetsDir = process.env.DOC_FORGE_ASSETS_DIR?.trim();
  if (!explicitAssetsDir) {
    overrides.DOC_FORGE_ASSETS_DIR = path.join(userDataDataDir, "assets");
  }

  return overrides;
}

function resolveDesktopPort() {
  const raw = process.env.DOC_FORGE_DESKTOP_PORT;
  const parsed = Number.parseInt(raw ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return DEFAULT_PORT;
}

function buildServerUrl(host, port) {
  const url = new URL("http://127.0.0.1");
  url.hostname = host;
  url.port = String(port);
  return url.toString().replace(/\/$/, "");
}

function resolveDesktopHost(mode) {
  if (app.isPackaged && mode === "standalone") {
    const configuredHost = process.env.DOC_FORGE_DESKTOP_HOST?.trim();
    if (configuredHost && configuredHost !== DEFAULT_HOST) {
      appendDesktopLog(
        `[config] ignoring DOC_FORGE_DESKTOP_HOST=${configuredHost} in packaged mode`
      );
    }
    return DEFAULT_HOST;
  }

  const host = process.env.DOC_FORGE_DESKTOP_HOST?.trim();
  return host || DEFAULT_HOST;
}

function resolveMode() {
  const explicit = process.env.DOC_FORGE_DESKTOP_SERVER?.trim();
  if (explicit === "standalone") return "standalone";
  if (explicit === "dev") return "dev";
  return app.isPackaged ? "standalone" : "dev";
}

function resolveStandaloneServerPath() {
  const candidates = app.isPackaged
    ? [
        path.join(APP_ROOT, "server.js"),
        path.join(APP_ROOT, ".next", "standalone", "server.js"),
      ]
    : [
        path.join(APP_ROOT, ".next", "standalone", "server.js"),
        path.join(APP_ROOT, "server.js"),
      ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `standalone server.js が見つかりません。\n` +
      `検索先:\n- ${candidates.join("\n- ")}\n` +
      "先に `npm run build`（配布時は `npm run dist:*`）を実行してください。"
  );
}

function resolveServerCommand(mode, port, host) {
  const storageOverrides = resolveDesktopStorageOverrides();

  if (mode === "standalone") {
    const standaloneServer = resolveStandaloneServerPath();
    const env = {
      ...process.env,
      ...storageOverrides,
      PORT: String(port),
      HOSTNAME: host,
      NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED ?? "1",
    };

    if (app.isPackaged) {
      env.ELECTRON_RUN_AS_NODE = "1";
      return {
        command: process.execPath,
        args: [standaloneServer],
        env,
      };
    }

    delete env.ELECTRON_RUN_AS_NODE;
    return {
      command: process.platform === "win32" ? "node.exe" : "node",
      args: [standaloneServer],
      env,
    };
  }

  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: ["run", "dev", "--", "--port", String(port), "--hostname", host],
    env: {
      ...process.env,
      ...storageOverrides,
      NEXT_TELEMETRY_DISABLED: process.env.NEXT_TELEMETRY_DISABLED ?? "1",
    },
  };
}

function relayOutput(stream, label) {
  if (!stream) return;
  stream.on("data", (chunk) => {
    const text = chunk.toString();
    process.stdout.write(`[doc-forge:${label}] ${text}`);
    appendDesktopLog(`[${label}] ${text}`);
  });
}

function formatServerExitDetail(exitState) {
  if (!exitState) {
    return "Next server exited unexpectedly.";
  }
  if (exitState.error instanceof Error) {
    return `Next server failed to start: ${exitState.error.message}`;
  }
  return `Next server exited unexpectedly (code=${exitState.code}, signal=${exitState.signal ?? "none"})`;
}

function isAllowedAppUrl(targetUrl) {
  if (!serverUrl) return false;
  try {
    const allowed = new URL(serverUrl);
    const candidate = new URL(targetUrl);
    return candidate.origin === allowed.origin;
  } catch {
    return false;
  }
}

function openExternalIfAllowed(targetUrl) {
  try {
    const candidate = new URL(targetUrl);
    if (!EXTERNAL_PROTOCOLS.has(candidate.protocol)) {
      appendDesktopLog(`[nav:blocked] unsupported external protocol: ${targetUrl}`);
      return false;
    }
    void shell.openExternal(candidate.toString());
    appendDesktopLog(`[nav:external] ${candidate.toString()}`);
    return true;
  } catch {
    appendDesktopLog(`[nav:blocked] invalid url: ${targetUrl}`);
    return false;
  }
}

function attachNavigationGuards(window) {
  const { webContents } = window;

  webContents.on("will-navigate", (event, targetUrl) => {
    if (isAllowedAppUrl(targetUrl)) return;
    event.preventDefault();
    openExternalIfAllowed(targetUrl);
  });

  webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (isAllowedAppUrl(targetUrl)) {
      return { action: "allow" };
    }
    openExternalIfAllowed(targetUrl);
    return { action: "deny" };
  });

  webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
    appendDesktopLog("[nav:blocked] webview attachment denied");
  });
}

function startNextServer() {
  if (nextServerProcess) return;

  ensureDesktopLogStream();

  const port = resolveDesktopPort();
  const mode = resolveMode();
  const host = resolveDesktopHost(mode);
  const { command, args, env } = resolveServerCommand(mode, port, host);

  serverUrl = buildServerUrl(host, port);
  serverExit = null;
  appendDesktopLog(
    `[startup] launching Next server mode=${mode} url=${serverUrl}`
  );

  nextServerProcess = spawn(command, args, {
    cwd: APP_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  nextServerProcess.once("error", (error) => {
    serverExit = { code: null, signal: null, error };
    nextServerProcess = null;
    appendDesktopLog(`[startup:error] ${error.message}`);

    if (!isQuitting && mainWindow) {
      dialog.showErrorBox("Doc Forge サーバーエラー", formatServerExitDetail(serverExit));
      app.quit();
    }
  });

  relayOutput(nextServerProcess.stdout, "next:stdout");
  relayOutput(nextServerProcess.stderr, "next:stderr");

  nextServerProcess.once("exit", (code, signal) => {
    serverExit = { code, signal, error: null };
    nextServerProcess = null;
    appendDesktopLog(
      `[shutdown] Next server exited code=${code} signal=${signal ?? "none"}`
    );

    if (!isQuitting) {
      dialog.showErrorBox("Doc Forge サーバーエラー", formatServerExitDetail(serverExit));
      app.quit();
    }
  });
}

function stopNextServer() {
  if (!nextServerProcess) return;

  const child = nextServerProcess;
  nextServerProcess = null;

  if (child.killed) return;

  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
    return;
  }

  child.kill("SIGTERM");
  setTimeout(() => {
    if (!child.killed) {
      child.kill("SIGKILL");
    }
  }, 3000).unref();
}

async function waitForServerReady() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    if (serverExit) {
      throw new Error(formatServerExitDetail(serverExit));
    }

    try {
      const response = await fetch(serverUrl, { method: "GET" });
      if (response.ok || response.status < 500) return;
    } catch {
      // Retry until timeout.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Next server did not become ready within ${STARTUP_TIMEOUT_MS}ms (${serverUrl})`
  );
}

async function openPathOrShowError(targetPath, title) {
  const error = await shell.openPath(targetPath);
  if (error) {
    dialog.showErrorBox(title, `${targetPath}\n\n${error}`);
  }
}

function setupNativeMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: "Doc Forge",
      submenu: [
        {
          label: "再読み込み",
          accelerator: "CmdOrCtrl+R",
          click: () => {
            mainWindow?.webContents.reload();
          },
        },
        {
          label: "ログを表示",
          click: () => {
            ensureDesktopLogStream();
            void openPathOrShowError(
              getDesktopLogFilePath(),
              "ログファイルを開けませんでした"
            );
          },
        },
        {
          label: "データフォルダを開く",
          click: () => {
            void openPathOrShowError(
              ensureDesktopDataDir(),
              "データフォルダを開けませんでした"
            );
          },
        },
        { type: "separator" },
        { role: "quit", label: "終了" },
      ],
    },
    { role: "editMenu", label: "編集" },
    { role: "windowMenu", label: "ウィンドウ" },
  ]);

  Menu.setApplicationMenu(menu);
}

function shouldSkipFirstLaunchGuide() {
  const raw = process.env.DOC_FORGE_DESKTOP_DISABLE_FIRST_LAUNCH_GUIDE?.trim();
  return raw === "1" || raw?.toLowerCase() === "true";
}

async function showFirstLaunchGuideIfNeeded() {
  if (shouldSkipFirstLaunchGuide()) {
    appendDesktopLog("[startup] first launch guide skipped by env");
    return;
  }

  const markerPath = path.join(
    ensureDesktopDataDir(),
    FIRST_LAUNCH_MARKER_FILENAME
  );
  if (fs.existsSync(markerPath)) return;

  await dialog.showMessageBox(mainWindow ?? undefined, {
    type: "info",
    title: "Doc Forge 初回セットアップ",
    message: "最初に LLM キー設定を行ってください。",
    detail:
      "左上の「メニュー」から「設定」タブを開き、「LLMキー設定」で API キーを登録できます。",
  });
  fs.writeFileSync(markerPath, `${new Date().toISOString()}\n`, "utf8");
}

function createMainWindow() {
  if (!serverUrl) throw new Error("serverUrl is not initialized");

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: "Doc Forge",
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  attachNavigationGuards(mainWindow);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(serverUrl);
}

async function bootstrap() {
  setupNativeMenu();
  startNextServer();
  await waitForServerReady();
  createMainWindow();
  await showFirstLaunchGuideIfNeeded();
}

app.whenReady().then(async () => {
  try {
    await bootstrap();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown desktop bootstrap error";
    dialog.showErrorBox("Doc Forge 起動エラー", message);
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && serverUrl) {
    createMainWindow();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  stopNextServer();
  closeDesktopLogStream();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
