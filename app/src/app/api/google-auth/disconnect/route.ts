import { NextResponse } from "next/server";
import { clearGoogleRefreshToken, getGoogleOAuthStatus } from "@/lib/google/credentials";

export async function POST() {
  await clearGoogleRefreshToken();
  const status = await getGoogleOAuthStatus();
  return NextResponse.json(status);
}
