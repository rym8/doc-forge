#!/usr/bin/env node

const target = process.argv[2];
const bypass = process.env.DOC_FORGE_ALLOW_UNSUPPORTED_BUILD_PLATFORM === "1";

if (!target || !["win", "mac"].includes(target)) {
  console.error("Usage: node ./scripts/check-build-platform.mjs <win|mac>");
  process.exit(1);
}

function fail(lines) {
  for (const line of lines) {
    console.error(line);
  }
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (target === "win") {
  if (process.platform === "win32") {
    pass("[platform-check] Windows build platform check passed (win32).");
  }

  if (bypass) {
    console.warn(
      `[platform-check] bypass enabled on ${process.platform}/${process.arch}. Proceeding with dist:win.`
    );
    process.exit(0);
  }

  fail([
    `[platform-check] dist:win is supported only on Windows runners/workstations. current=${process.platform}/${process.arch}`,
    "[platform-check] Run this command on Windows or set DOC_FORGE_ALLOW_UNSUPPORTED_BUILD_PLATFORM=1 to bypass at your own risk.",
  ]);
}

if (process.platform === "darwin") {
  pass("[platform-check] macOS build platform check passed (darwin).");
}

if (bypass) {
  console.warn(
    `[platform-check] bypass enabled on ${process.platform}/${process.arch}. Proceeding with dist:mac.`
  );
  process.exit(0);
}

fail([
  `[platform-check] dist:mac is supported only on macOS runners/workstations. current=${process.platform}/${process.arch}`,
  "[platform-check] Run this command on macOS or set DOC_FORGE_ALLOW_UNSUPPORTED_BUILD_PLATFORM=1 to bypass at your own risk.",
]);
