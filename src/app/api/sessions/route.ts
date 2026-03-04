import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export async function GET() {
  const rows = await db
    .select()
    .from(sessions)
    .orderBy(desc(sessions.updatedAt));
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const { title } = await req.json();
  const now = Date.now();
  const session = {
    id: uuid(),
    title: title || "Untitled",
    documentContent: "",
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(sessions).values(session);
  return NextResponse.json(session, { status: 201 });
}
