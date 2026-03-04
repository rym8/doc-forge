import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id));
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(session);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: Date.now() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.documentContent !== undefined)
    updates.documentContent = body.documentContent;

  await db.update(sessions).set(updates).where(eq(sessions.id, id));
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id));
  return NextResponse.json(session);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await db.delete(sessions).where(eq(sessions.id, id));
  return NextResponse.json({ ok: true });
}
