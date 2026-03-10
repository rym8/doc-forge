import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, "..");
const STANDALONE_DIR = path.join(APP_ROOT, ".next", "standalone");
const HASHED_EXTERNAL_PATTERN = /["'`]([@a-zA-Z0-9._/-]+-[a-f0-9]{16,})["'`]/g;
const PACKAGE_NAME_PATTERN = /^(@[^/]+\/)?[^/]+$/;

function ensureExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${label} が見つかりません: ${targetPath}`);
  }
}

function copyDir(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function pruneStandaloneArtifacts() {
  const removeTargets = [
    path.join(STANDALONE_DIR, "dist"),
    path.join(STANDALONE_DIR, "data"),
    path.join(STANDALONE_DIR, "test-results"),
  ];

  for (const target of removeTargets) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function collectFilesRecursively(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFilesRecursively(fullPath, out);
      continue;
    }
    out.push(fullPath);
  }
  return out;
}

function packageExists(packageName) {
  return fs.existsSync(
    path.join(STANDALONE_DIR, "node_modules", ...packageName.split("/"))
  );
}

function rewriteHashedExternalReferences() {
  const serverRoot = path.join(STANDALONE_DIR, ".next", "server");
  const files = collectFilesRecursively(serverRoot).filter((filePath) =>
    filePath.endsWith(".js")
  );
  if (files.length === 0) return;

  let updatedFiles = 0;
  let replacementCount = 0;

  for (const filePath of files) {
    const original = fs.readFileSync(filePath, "utf8");
    HASHED_EXTERNAL_PATTERN.lastIndex = 0;
    const rewritten = original.replace(
      HASHED_EXTERNAL_PATTERN,
      (fullMatch, aliasedName) => {
        const baseName = aliasedName.replace(/-[a-f0-9]{16,}$/, "");
        if (baseName === aliasedName) return fullMatch;
        if (!PACKAGE_NAME_PATTERN.test(aliasedName)) return fullMatch;
        if (!PACKAGE_NAME_PATTERN.test(baseName)) return fullMatch;
        if (!packageExists(baseName)) return fullMatch;

        replacementCount += 1;
        return fullMatch.replace(aliasedName, baseName);
      }
    );

    if (rewritten !== original) {
      fs.writeFileSync(filePath, rewritten, "utf8");
      updatedFiles += 1;
    }
  }

  if (replacementCount > 0) {
    console.log(
      `[prepare-standalone-assets] rewrote ${replacementCount} hashed external reference(s) in ${updatedFiles} file(s)`
    );
  }
}

function materializeHashedExternalAliases() {
  const serverRoot = path.join(STANDALONE_DIR, ".next", "server");
  const files = collectFilesRecursively(serverRoot).filter((filePath) =>
    filePath.endsWith(".js")
  );
  if (files.length === 0) return;

  const aliases = new Map();

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    HASHED_EXTERNAL_PATTERN.lastIndex = 0;
    let match;
    while ((match = HASHED_EXTERNAL_PATTERN.exec(content)) !== null) {
      const aliasName = match[1];
      const baseName = aliasName.replace(/-[a-f0-9]{16,}$/, "");
      if (baseName === aliasName) continue;
      if (!PACKAGE_NAME_PATTERN.test(aliasName)) continue;
      if (!PACKAGE_NAME_PATTERN.test(baseName)) continue;
      aliases.set(aliasName, baseName);
    }
  }
  if (aliases.size > 0) {
    console.log(
      `[prepare-standalone-assets] detected ${aliases.size} hashed external module id(s)`
    );
  }
}

function main() {
  ensureExists(STANDALONE_DIR, "standalone 出力");

  // Remove local-only artifacts to avoid recursive packaging and accidental leakage.
  pruneStandaloneArtifacts();

  const nextStaticSrc = path.join(APP_ROOT, ".next", "static");
  const nextStaticDest = path.join(STANDALONE_DIR, ".next", "static");
  ensureExists(nextStaticSrc, "Next static 出力");
  copyDir(nextStaticSrc, nextStaticDest);

  const publicSrc = path.join(APP_ROOT, "public");
  if (fs.existsSync(publicSrc)) {
    const publicDest = path.join(STANDALONE_DIR, "public");
    copyDir(publicSrc, publicDest);
  }

  // Turbopack standalone can emit hashed external module ids (e.g. better-sqlite3-<hash>).
  // Rewrite these references to base package names before packaging so runtime resolution is stable.
  rewriteHashedExternalReferences();

  // Keep a lightweight detector log for hashed module ids to aid troubleshooting.
  materializeHashedExternalAliases();

  console.log(
    `[prepare-standalone-assets] synced static/public into ${STANDALONE_DIR}`
  );
}

main();
