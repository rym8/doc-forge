import {
  getGoogleClientCredentials,
  getGoogleRefreshToken,
} from "./credentials";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  refresh_token?: string;
}

export function buildAuthUrl({
  clientId,
  redirectUri,
  scopes,
  state,
}: {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  state?: string;
}): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
  });
  if (state) params.set("state", state);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens({
  code,
  redirectUri,
}: {
  code: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const creds = await getGoogleClientCredentials();
  if (!creds) throw new Error("Google OAuth credentials not configured");

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Token exchange failed: ${res.status}`);
  }

  return (await res.json()) as TokenResponse;
}

export async function refreshAccessToken(): Promise<string> {
  const creds = await getGoogleClientCredentials();
  if (!creds) throw new Error("Google OAuth credentials not configured");

  const refreshToken = await getGoogleRefreshToken();
  if (!refreshToken) throw new Error("Google Drive not connected. Please connect in Settings.");

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      error?: string;
      error_description?: string;
    };
    const msg = err.error_description ?? err.error ?? `Token refresh failed: ${res.status}`;
    throw new Error(msg);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export const GOOGLE_DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"];
