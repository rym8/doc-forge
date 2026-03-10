import { NextResponse } from "next/server";
import { getGoogleClientCredentials } from "@/lib/google/credentials";
import { buildAuthUrl, GOOGLE_DRIVE_SCOPES } from "@/lib/google/oauth";

function getAppOrigin(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(req: Request) {
  const creds = await getGoogleClientCredentials();
  if (!creds) {
    return NextResponse.json(
      { error: "Google OAuth 認証情報が設定されていません。設定 > Google Drive 連携 で登録してください。" },
      { status: 400 }
    );
  }

  const origin = getAppOrigin(req);
  const redirectUri = `${origin}/api/google-auth/callback`;

  const authUrl = buildAuthUrl({
    clientId: creds.clientId,
    redirectUri,
    scopes: GOOGLE_DRIVE_SCOPES,
  });

  return NextResponse.json({ authUrl, redirectUri });
}
