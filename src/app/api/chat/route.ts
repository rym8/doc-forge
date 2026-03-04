import { streamChat } from "@/lib/llm/client";
import { db } from "@/lib/db";
import { sessions, messages, snapshots } from "@/lib/db/schema";
import { resolveRuntimeProviderKeys } from "@/lib/llm/credentials";
import { eq, asc } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export async function POST(req: Request) {
  const { sessionId, message } = await req.json();

  // Load session
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId));
  if (!session) {
    return new Response(JSON.stringify({ error: "セッションが見つかりません" }), {
      status: 404,
    });
  }

  // Save user message
  const userMsg = {
    id: uuid(),
    sessionId,
    role: "user" as const,
    content: message,
    createdAt: Date.now(),
  };
  await db.insert(messages).values(userMsg);

  // Load history
  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.createdAt));

  // Stream response via SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const providerKeys = await resolveRuntimeProviderKeys();
        const gen = streamChat(session.documentContent, history, message, {
          providerKeys,
        });
        let fullText = "";
        let currentDocument = session.documentContent;

        for await (const event of gen) {
          if (event.type === "text_delta") {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );
          } else if (event.type === "document_update") {
            // Save snapshot (archive old content)
            await db.insert(snapshots).values({
              id: uuid(),
              sessionId,
              previousContent: currentDocument,
              summary: event.summary,
              relatedMessageId: userMsg.id,
              createdAt: Date.now(),
            });

            // Update document
            await db
              .update(sessions)
              .set({
                documentContent: event.document,
                updatedAt: Date.now(),
              })
              .where(eq(sessions.id, sessionId));
            currentDocument = event.document;

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );
          } else if (event.type === "done") {
            fullText = event.fullText;
          }
        }

        // Save assistant message
        if (fullText) {
          await db.insert(messages).values({
            id: uuid(),
            sessionId,
            role: "assistant",
            content: fullText,
            createdAt: Date.now(),
          });
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
        );
        controller.close();
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", error: errorMsg })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
