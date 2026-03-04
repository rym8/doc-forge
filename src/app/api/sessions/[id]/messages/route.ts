import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, id))
    .orderBy(asc(messages.createdAt));
  return NextResponse.json(rows);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { role, content } = await req.json();
  const msg = {
    id: uuid(),
    sessionId: id,
    role: role as "user" | "assistant",
    content,
    createdAt: Date.now(),
  };
  await db.insert(messages).values(msg);
  return NextResponse.json(msg, { status: 201 });
}
