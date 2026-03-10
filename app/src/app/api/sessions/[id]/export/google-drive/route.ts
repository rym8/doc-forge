import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { renderSlideDeckToPptxBuffer } from "@/lib/slides/pptx";
import { toSession } from "@/lib/slides/session";
import { refreshAccessToken } from "@/lib/google/oauth";
import { getGoogleOAuthStatus } from "@/lib/google/credentials";

const DRIVE_UPLOAD_URL =
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const SLIDES_MIME = "application/vnd.google-apps.presentation";
const BOUNDARY = "doc_forge_boundary";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Check Google connection
  const status = await getGoogleOAuthStatus();
  if (!status.connected) {
    return NextResponse.json(
      {
        error: "Google Drive に未接続です。設定 > Google Drive 連携 で接続してください。",
        notConnected: true,
      },
      { status: 400 }
    );
  }

  const [row] = await db.select().from(sessions).where(eq(sessions.id, id));
  if (!row) {
    return NextResponse.json({ error: "セッションが見つかりません" }, { status: 404 });
  }

  const session = toSession(row);
  if (session.artifactType !== "slides") {
    return NextResponse.json(
      { error: "slides セッションのみアップロードできます" },
      { status: 400 }
    );
  }

  if (!session.slideDeck || session.slideDeck.slides.length === 0) {
    return NextResponse.json(
      { error: "先にスライドを作成してください" },
      { status: 400 }
    );
  }

  const rendered = await renderSlideDeckToPptxBuffer({
    deck: session.slideDeck,
    theme: session.theme,
    exportOptions: session.exportOptions,
  });

  const accessToken = await refreshAccessToken();

  // Multipart upload: metadata + .pptx binary
  // Google Drive will auto-convert to Google Slides format
  const metadataJson = JSON.stringify({
    name: session.title || "Doc Forge Presentation",
    mimeType: SLIDES_MIME,
  });
  const body = [
    `--${BOUNDARY}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    metadataJson,
    `--${BOUNDARY}`,
    `Content-Type: ${PPTX_MIME}`,
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(rendered.buffer).toString("base64"),
    `--${BOUNDARY}--`,
  ].join("\r\n");

  const driveRes = await fetch(DRIVE_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${BOUNDARY}`,
    },
    body,
  });

  if (!driveRes.ok) {
    const errBody = (await driveRes.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    const msg =
      errBody.error?.message ?? `Google Drive upload failed: ${driveRes.status}`;
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const driveData = (await driveRes.json()) as { id: string; name: string };

  return NextResponse.json(
    {
      fileId: driveData.id,
      fileName: driveData.name,
      url: `https://docs.google.com/presentation/d/${driveData.id}/edit`,
    },
    { status: 201 }
  );
}
