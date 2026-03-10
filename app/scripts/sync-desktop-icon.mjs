import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDir, "..");
const sourceIconPath = path.join(appRoot, "src", "app", "icon.png");
const targetDir = path.join(appRoot, "electron", "assets");
const targetIconPath = path.join(targetDir, "icon.png");

function ensurePngAndGetSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 24) {
    throw new Error(`PNGファイルが不正です: ${filePath}`);
  }

  const pngSignature = "89504e470d0a1a0a";
  const actualSignature = buffer.subarray(0, 8).toString("hex");
  if (actualSignature !== pngSignature) {
    throw new Error(`PNG形式ではありません: ${filePath}`);
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

function main() {
  if (!fs.existsSync(sourceIconPath)) {
    throw new Error(`アイコン元画像が見つかりません: ${sourceIconPath}`);
  }

  const { width, height } = ensurePngAndGetSize(sourceIconPath);
  if (width !== height) {
    throw new Error(
      `アイコン画像は正方形が必要です: ${width}x${height} (${sourceIconPath})`
    );
  }
  if (width < 512 || height < 512) {
    throw new Error(
      `アイコン画像は 512px 以上を推奨します: ${width}x${height} (${sourceIconPath})`
    );
  }

  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(sourceIconPath, targetIconPath);
  console.log(`[sync-desktop-icon] ${width}x${height} -> ${targetIconPath}`);
}

try {
  main();
} catch (error) {
  const message =
    error instanceof Error ? error.message : "Unknown sync icon error";
  console.error(`[sync-desktop-icon] ${message}`);
  process.exitCode = 1;
}
