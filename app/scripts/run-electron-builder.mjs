import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, "..");
const STANDALONE_DIR = path.join(APP_ROOT, ".next", "standalone");

function normalizePath(targetPath) {
  return targetPath.split(path.sep).join("/");
}

function readJson(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${label} が見つかりません: ${targetPath}`);
  }

  return JSON.parse(fs.readFileSync(targetPath, "utf8"));
}

function writeJson(targetPath, value) {
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runCommand(command, args, cwd, label, envOverrides = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: {
      ...process.env,
      ...envOverrides,
    },
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${label} に失敗しました (exit=${result.status ?? 1})`);
  }
}

function listInstalledPackageNames(nodeModulesDir) {
  const packageNames = new Set();
  if (!fs.existsSync(nodeModulesDir)) {
    return packageNames;
  }

  for (const entry of fs.readdirSync(nodeModulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    if (entry.name.startsWith("@")) {
      const scopeDir = path.join(nodeModulesDir, entry.name);
      for (const scopedEntry of fs.readdirSync(scopeDir, { withFileTypes: true })) {
        if (scopedEntry.isDirectory()) {
          packageNames.add(`${entry.name}/${scopedEntry.name}`);
        }
      }
      continue;
    }

    packageNames.add(entry.name);
  }

  return packageNames;
}

function resolveElectronVersion(rootPackage) {
  const installedElectronPackagePath = path.join(
    APP_ROOT,
    "node_modules",
    "electron",
    "package.json"
  );
  if (fs.existsSync(installedElectronPackagePath)) {
    return readJson(installedElectronPackagePath, "installed electron package")
      .version;
  }

  const declaredElectronVersion = rootPackage.devDependencies?.electron;
  if (typeof declaredElectronVersion === "string") {
    return declaredElectronVersion.replace(/^[^\d]*/, "");
  }

  throw new Error("Electron version を解決できませんでした。");
}

function buildStandalonePackage(rootPackage) {
  const outputDir = path.join(
    APP_ROOT,
    rootPackage.build?.directories?.output ?? "dist"
  );
  const installedPackages = listInstalledPackageNames(
    path.join(STANDALONE_DIR, "node_modules")
  );
  const standaloneDependencies = Object.fromEntries(
    Object.entries(rootPackage.dependencies ?? {}).filter(([name]) =>
      installedPackages.has(name)
    )
  );

  return {
    name: rootPackage.name,
    version: rootPackage.version,
    description: rootPackage.description,
    author: rootPackage.author,
    private: rootPackage.private,
    main: rootPackage.main,
    dependencies: standaloneDependencies,
    build: {
      ...rootPackage.build,
      electronVersion: resolveElectronVersion(rootPackage),
      // We rebuild native modules explicitly in this script with forced settings.
      npmRebuild: false,
      directories: {
        ...(rootPackage.build?.directories ?? {}),
        output: normalizePath(path.relative(STANDALONE_DIR, outputDir)),
      },
      files: [
        "electron/**/*",
        "server.js",
        ".next/**/*",
        "node_modules/**/*",
        "public/**/*",
        "package.json",
        "LICENSE",
      ],
    },
  };
}

function resolveElectronBuilderCommand() {
  const cliPath = path.join(APP_ROOT, "node_modules", "electron-builder", "cli.js");
  if (fs.existsSync(cliPath)) {
    return { command: process.execPath, prefixArgs: [cliPath] };
  }

  const binPath = path.join(
    APP_ROOT,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "electron-builder.cmd" : "electron-builder"
  );
  if (fs.existsSync(binPath)) {
    return { command: binPath, prefixArgs: [] };
  }

  throw new Error(
    `electron-builder 実行ファイルが見つかりません: ${cliPath} または ${binPath}`
  );
}

function resolveNodeGypCliPath() {
  const nodeGypCliPath = path.join(
    APP_ROOT,
    "node_modules",
    "node-gyp",
    "bin",
    "node-gyp.js"
  );
  if (!fs.existsSync(nodeGypCliPath)) {
    throw new Error(`node-gyp CLI が見つかりません: ${nodeGypCliPath}`);
  }
  return nodeGypCliPath;
}

function resolveElectronRuntimeBinary() {
  if (process.platform === "win32") {
    const target = path.join(APP_ROOT, "node_modules", "electron", "dist", "electron.exe");
    if (fs.existsSync(target)) return target;
  } else if (process.platform === "darwin") {
    const target = path.join(
      APP_ROOT,
      "node_modules",
      "electron",
      "dist",
      "Electron.app",
      "Contents",
      "MacOS",
      "Electron"
    );
    if (fs.existsSync(target)) return target;
  } else {
    const target = path.join(APP_ROOT, "node_modules", "electron", "dist", "electron");
    if (fs.existsSync(target)) return target;
  }

  throw new Error("Electron runtime binary が見つかりませんでした。");
}

function verifyBetterSqlite3ElectronLoad(
  electronBinary,
  modulePath,
  label
) {
  if (!fs.existsSync(modulePath)) {
    throw new Error(`better-sqlite3 が見つかりません: ${modulePath}`);
  }
  const script = `
    console.log("[verify-native] electron modules=" + process.versions.modules);
    try {
      require(${JSON.stringify(modulePath)});
      console.log("[verify-native] better-sqlite3 load succeeded");
    } catch (error) {
      console.error("[verify-native] better-sqlite3 load failed");
      console.error(error && (error.stack || error.message || String(error)));
      process.exit(1);
    }
  `;

  runCommand(
    electronBinary,
    ["-e", script],
    path.dirname(modulePath),
    label,
    { ELECTRON_RUN_AS_NODE: "1" }
  );
}

function collectStandaloneBetterSqlite3Dirs() {
  const nodeModulesDir = path.join(STANDALONE_DIR, "node_modules");
  if (!fs.existsSync(nodeModulesDir)) {
    return [];
  }

  const pattern = /^better-sqlite3(?:-[a-f0-9]{16,})?$/;
  return fs
    .readdirSync(nodeModulesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && pattern.test(entry.name))
    .map((entry) => path.join(nodeModulesDir, entry.name));
}

function rebuildBetterSqlite3ForElectron(rootPackage) {
  const electronVersion = resolveElectronVersion(rootPackage);
  const electronBinary = resolveElectronRuntimeBinary();
  const sourcePackageDir = path.join(APP_ROOT, "node_modules", "better-sqlite3");
  const sourceBindingGyp = path.join(sourcePackageDir, "binding.gyp");
  if (!fs.existsSync(sourceBindingGyp)) {
    throw new Error(
      `better-sqlite3 のビルドソースが見つかりません: ${sourceBindingGyp}`
    );
  }
  const nodeGypCliPath = resolveNodeGypCliPath();
  const nativeBuildRoot = path.join(STANDALONE_DIR, ".native-build");
  const buildPackageDir = path.join(nativeBuildRoot, "better-sqlite3");

  console.log(
    `[run-electron-builder] forcing native rebuild for better-sqlite3 (electron=${electronVersion}, arch=${process.arch})`
  );
  fs.rmSync(nativeBuildRoot, { recursive: true, force: true });

  try {
    fs.mkdirSync(nativeBuildRoot, { recursive: true });
    fs.cpSync(sourcePackageDir, buildPackageDir, { recursive: true });
    fs.rmSync(path.join(buildPackageDir, "build"), {
      recursive: true,
      force: true,
    });

    runCommand(
      electronBinary,
      [nodeGypCliPath, "rebuild", "--release"],
      buildPackageDir,
      "better-sqlite3 の Electron ABI 強制再ビルド",
      {
        ELECTRON_RUN_AS_NODE: "1",
        npm_config_runtime: "electron",
        npm_config_target: electronVersion,
        npm_config_disturl: "https://electronjs.org/headers",
        npm_config_build_from_source: "true",
        npm_config_update_binary: "false",
        npm_config_target_arch: process.arch,
      }
    );

    const rebuiltBinaryPath = path.join(
      buildPackageDir,
      "build",
      "Release",
      "better_sqlite3.node"
    );
    if (!fs.existsSync(rebuiltBinaryPath)) {
      throw new Error(
        `リビルド済み better_sqlite3.node が見つかりません: ${rebuiltBinaryPath}`
      );
    }

    const targetDirs = collectStandaloneBetterSqlite3Dirs();
    if (targetDirs.length === 0) {
      throw new Error(
        `standalone 側の better-sqlite3 配置先が見つかりません: ${path.join(
          STANDALONE_DIR,
          "node_modules"
        )}`
      );
    }

    for (const targetDir of targetDirs) {
      const releaseDir = path.join(targetDir, "build", "Release");
      fs.mkdirSync(releaseDir, { recursive: true });
      fs.copyFileSync(
        rebuiltBinaryPath,
        path.join(releaseDir, "better_sqlite3.node")
      );
    }

    console.log(
      `[run-electron-builder] synced rebuilt better_sqlite3.node to ${targetDirs.length} module directory(ies)`
    );

    const preferredModulePath = path.join(
      STANDALONE_DIR,
      "node_modules",
      "better-sqlite3"
    );
    const verifyModulePath = fs.existsSync(preferredModulePath)
      ? preferredModulePath
      : targetDirs[0];
    verifyBetterSqlite3ElectronLoad(
      electronBinary,
      verifyModulePath,
      "standalone の better-sqlite3 読み込み検証"
    );
  } finally {
    fs.rmSync(nativeBuildRoot, { recursive: true, force: true });
  }
}

function resolveWindowsUnpackedExecutable(rootPackage) {
  const outputDir = path.join(
    APP_ROOT,
    rootPackage.build?.directories?.output ?? "dist"
  );
  const unpackedDir = path.join(outputDir, "win-unpacked");
  if (!fs.existsSync(unpackedDir)) {
    throw new Error(`win-unpacked が見つかりません: ${unpackedDir}`);
  }

  const productName =
    rootPackage.build?.productName ?? rootPackage.productName ?? rootPackage.name;
  const preferredPath = path.join(unpackedDir, `${productName}.exe`);
  if (fs.existsSync(preferredPath)) {
    return preferredPath;
  }

  const fallback = fs
    .readdirSync(unpackedDir)
    .find((name) => name.toLowerCase().endsWith(".exe"));
  if (!fallback) {
    throw new Error(`win-unpacked 実行ファイルが見つかりません: ${unpackedDir}`);
  }
  return path.join(unpackedDir, fallback);
}

function verifyPackagedBetterSqlite3OnWindows(rootPackage) {
  if (process.platform !== "win32") return;
  const exePath = resolveWindowsUnpackedExecutable(rootPackage);
  const modulePath = path.join(
    path.dirname(exePath),
    "resources",
    "app",
    "node_modules",
    "better-sqlite3"
  );

  verifyBetterSqlite3ElectronLoad(
    exePath,
    modulePath,
    "win-unpacked の better-sqlite3 読み込み検証"
  );
}

function main() {
  const rootPackagePath = path.join(APP_ROOT, "package.json");
  const standalonePackagePath = path.join(STANDALONE_DIR, "package.json");
  const rootPackage = readJson(rootPackagePath, "app package.json");

  if (!fs.existsSync(STANDALONE_DIR)) {
    throw new Error(
      `standalone 出力が見つかりません: ${STANDALONE_DIR}\n先に npm run build:desktop を実行してください。`
    );
  }

  writeJson(standalonePackagePath, buildStandalonePackage(rootPackage));
  rebuildBetterSqlite3ForElectron(rootPackage);

  const { command, prefixArgs } = resolveElectronBuilderCommand();
  const args = [...prefixArgs, "--projectDir", STANDALONE_DIR, ...process.argv.slice(2)];
  runCommand(command, args, APP_ROOT, "electron-builder");
  verifyPackagedBetterSqlite3OnWindows(rootPackage);
  process.exit(0);
}

try {
  main();
} catch (error) {
  const message =
    error instanceof Error ? error.message : "Unknown electron-builder error";
  console.error(message);
  process.exit(1);
}
