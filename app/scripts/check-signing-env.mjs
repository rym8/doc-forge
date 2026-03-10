#!/usr/bin/env node

const target = process.argv[2];

if (!target || !["mac", "win"].includes(target)) {
  console.error("Usage: node ./scripts/check-signing-env.mjs <mac|win>");
  process.exit(1);
}

function hasAll(keys) {
  return keys.every((key) => Boolean(process.env[key]));
}

function listMissing(keys) {
  return keys.filter((key) => !process.env[key]);
}

function fail(lines) {
  for (const line of lines) {
    console.error(line);
  }
  process.exit(1);
}

if (target === "mac") {
  const certKeys = ["CSC_LINK", "CSC_KEY_PASSWORD"];
  const notaryApiKey = ["APPLE_API_KEY", "APPLE_API_KEY_ID", "APPLE_API_ISSUER"];
  const notaryAppleId = ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"];

  const certOk = hasAll(certKeys);
  const notaryOk = hasAll(notaryApiKey) || hasAll(notaryAppleId);

  if (!certOk || !notaryOk) {
    const missing = [];
    if (!certOk) {
      missing.push(
        `- 証明書系が不足: ${listMissing(certKeys).join(", ")}`
      );
    }
    if (!notaryOk) {
      missing.push(
        `- notarize系が不足: (${notaryApiKey.join(", ")}) または (${notaryAppleId.join(", ")})`
      );
    }
    fail([
      "[signing-check] mac署名に必要な環境変数が不足しています。",
      ...missing,
    ]);
  }

  console.log("[signing-check] mac署名用の環境変数チェックに成功しました。");
  process.exit(0);
}

const winKeys = ["CSC_LINK", "CSC_KEY_PASSWORD"];
if (!hasAll(winKeys)) {
  fail([
    "[signing-check] Windows署名に必要な環境変数が不足しています。",
    `- 不足: ${listMissing(winKeys).join(", ")}`,
  ]);
}

console.log("[signing-check] Windows署名用の環境変数チェックに成功しました。");
