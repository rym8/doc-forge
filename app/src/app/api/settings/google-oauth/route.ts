import { NextResponse } from "next/server";
import {
  getGoogleOAuthStatus,
  saveGoogleClientCredentials,
  clearGoogleOAuthCredentials,
} from "@/lib/google/credentials";

export async function GET() {
  const status = await getGoogleOAuthStatus();
  return NextResponse.json(status);
}

export async function PUT(req: Request) {
  const body = (await req.json()) as { clientId?: string; clientSecret?: string };
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const clientSecret = typeof body.clientSecret === "string" ? body.clientSecret.trim() : "";

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "clientId と clientSecret は必須です" },
      { status: 400 }
    );
  }

  await saveGoogleClientCredentials(clientId, clientSecret);
  const status = await getGoogleOAuthStatus();
  return NextResponse.json(status);
}

export async function DELETE() {
  await clearGoogleOAuthCredentials();
  const status = await getGoogleOAuthStatus();
  return NextResponse.json(status);
}
