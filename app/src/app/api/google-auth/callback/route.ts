import { NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/google/oauth";
import { saveGoogleRefreshToken } from "@/lib/google/credentials";

function getAppOrigin(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  const origin = getAppOrigin(req);

  if (error) {
    const redirectUrl = new URL("/", origin);
    redirectUrl.searchParams.set("google_auth_error", error);
    return NextResponse.redirect(redirectUrl.toString());
  }

  if (!code) {
    const redirectUrl = new URL("/", origin);
    redirectUrl.searchParams.set("google_auth_error", "no_code");
    return NextResponse.redirect(redirectUrl.toString());
  }

  try {
    const redirectUri = `${origin}/api/google-auth/callback`;
    const tokens = await exchangeCodeForTokens({ code, redirectUri });

    if (tokens.refresh_token) {
      await saveGoogleRefreshToken(tokens.refresh_token);
    }

    const redirectUrl = new URL("/", origin);
    redirectUrl.searchParams.set("google_connected", "1");
    return NextResponse.redirect(redirectUrl.toString());
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth エラー";
    const redirectUrl = new URL("/", origin);
    redirectUrl.searchParams.set("google_auth_error", message);
    return NextResponse.redirect(redirectUrl.toString());
  }
}
