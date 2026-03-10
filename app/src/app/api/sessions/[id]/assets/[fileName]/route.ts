import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { ensureAssetWithinSessionDir } from "@/lib/slides/assets";

function toContentType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".svg":
      return "image/svg+xml";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; fileName: string }> }
) {
  const { id, fileName } = await params;

  let assetPath: string;
  try {
    assetPath = ensureAssetWithinSessionDir(id, fileName);
  } catch {
    return NextResponse.json({ error: "invalid asset path" }, { status: 400 });
  }

  if (!fs.existsSync(assetPath)) {
    return NextResponse.json({ error: "asset not found" }, { status: 404 });
  }

  const bytes = fs.readFileSync(assetPath);
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": toContentType(fileName),
      "Cache-Control": "private, max-age=31536000",
    },
  });
}
