import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import {
  buildNewSessionPayload,
  toSession,
} from "@/lib/slides/session";
import type { ArtifactType } from "@/lib/types";

export async function GET() {
  const rows = await db
    .select()
    .from(sessions)
    .orderBy(desc(sessions.updatedAt));
  return NextResponse.json(rows.map(toSession));
}

export async function POST(req: Request) {
  const body = await req.json();
  const artifactType =
    body.artifactType === "slides" ? ("slides" as ArtifactType) : "document";
  const title = typeof body.title === "string" ? body.title : "Untitled";
  const now = Date.now();
  const seed = buildNewSessionPayload(title, artifactType);

  const session = {
    id: uuid(),
    ...seed,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(sessions).values(session);
  return NextResponse.json(toSession(session), { status: 201 });
}
