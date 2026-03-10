import { NextResponse } from "next/server";
import { getGoogleOAuthStatus } from "@/lib/google/credentials";

export async function GET() {
  const status = await getGoogleOAuthStatus();
  return NextResponse.json(status);
}
