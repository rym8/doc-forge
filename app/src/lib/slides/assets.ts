import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";

const ASSET_ROOT = process.env.DOC_FORGE_ASSETS_DIR
  ? path.resolve(process.env.DOC_FORGE_ASSETS_DIR)
  : path.join(process.cwd(), "data", "assets");

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getExtensionFromMime(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/svg+xml":
      return ".svg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return "";
  }
}

export function getSessionAssetDir(sessionId: string): string {
  return path.join(ASSET_ROOT, sanitizeSegment(sessionId));
}

export function getSessionAssetPublicUrl(
  sessionId: string,
  fileName: string
): string {
  return `/api/sessions/${encodeURIComponent(sessionId)}/assets/${encodeURIComponent(
    fileName
  )}`;
}

export function resolveSessionAssetPath(
  sessionId: string,
  fileName: string
): string {
  return path.join(getSessionAssetDir(sessionId), sanitizeSegment(fileName));
}

export function toRelativeAssetPath(absPath: string): string {
  return path.relative(process.cwd(), absPath);
}

export function ensureAssetWithinSessionDir(sessionId: string, fileName: string) {
  const resolved = resolveSessionAssetPath(sessionId, fileName);
  const sessionDir = getSessionAssetDir(sessionId);
  const relative = path.relative(sessionDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Invalid asset path");
  }
  return resolved;
}

export async function saveUploadedImageAsset(input: {
  sessionId: string;
  file: File;
}): Promise<{ fileName: string; assetPath: string; publicUrl: string }> {
  const extension =
    path.extname(input.file.name) || getExtensionFromMime(input.file.type);
  const fileName = `${uuid()}${extension}`;
  const sessionDir = getSessionAssetDir(input.sessionId);
  const absPath = resolveSessionAssetPath(input.sessionId, fileName);

  fs.mkdirSync(sessionDir, { recursive: true });
  const bytes = Buffer.from(await input.file.arrayBuffer());
  fs.writeFileSync(absPath, bytes);

  return {
    fileName,
    assetPath: toRelativeAssetPath(absPath),
    publicUrl: getSessionAssetPublicUrl(input.sessionId, fileName),
  };
}
