import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import {
  getSessionAssetDir,
  getSessionAssetPublicUrl,
  toRelativeAssetPath,
  resolveSessionAssetPath,
} from "@/lib/slides/assets";
import { resolveRuntimeProviderKeys } from "@/lib/llm/credentials";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json() as { prompt?: string };
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const providerKeys = await resolveRuntimeProviderKeys();
  const openAiKey = providerKeys.openai;

  if (!openAiKey) {
    return NextResponse.json(
      {
        error:
          "OpenAI APIキーが設定されていません。メニュー > 設定 > LLMキー設定 で OpenAI キーを追加してください。",
      },
      { status: 400 }
    );
  }

  // DALL-E 3 で画像生成
  const dalleRes = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1792x1024",
      response_format: "url",
    }),
  });

  if (!dalleRes.ok) {
    const errBody = (await dalleRes.json().catch(() => ({}))) as Record<string, unknown>;
    const msg =
      (errBody.error as Record<string, unknown> | undefined)?.message ??
      `DALL-E API error: ${dalleRes.status}`;
    return NextResponse.json({ error: String(msg) }, { status: 502 });
  }

  const dalleData = (await dalleRes.json()) as {
    data: { url?: string; b64_json?: string }[];
  };
  const imageUrl = dalleData.data?.[0]?.url;

  if (!imageUrl) {
    return NextResponse.json(
      { error: "画像URLが取得できませんでした" },
      { status: 502 }
    );
  }

  // 生成された画像をダウンロードしてアセットとして保存
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    return NextResponse.json(
      { error: "生成画像のダウンロードに失敗しました" },
      { status: 502 }
    );
  }
  const arrayBuf = await imageRes.arrayBuffer();
  const fileName = `${uuid()}.png`;
  const sessionDir = getSessionAssetDir(id);
  const absPath = resolveSessionAssetPath(id, fileName);

  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(absPath, Buffer.from(arrayBuf));

  return NextResponse.json(
    {
      fileName,
      assetPath: toRelativeAssetPath(absPath),
      src: getSessionAssetPublicUrl(id, fileName),
    },
    { status: 201 }
  );
}
