import {
  deleteStoredCredential,
  isLlmProvider,
  listLlmCredentialStatuses,
  upsertStoredCredential,
} from "@/lib/llm/credentials";

export async function GET() {
  const providers = await listLlmCredentialStatuses();
  return Response.json({
    providers,
    hasAnyKey: providers.some((p) => p.configured),
  });
}

export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSONの形式が不正です" }, { status: 400 });
  }

  const provider = (body as Record<string, unknown> | null)?.provider;
  const apiKey = (body as Record<string, unknown> | null)?.apiKey;

  if (!isLlmProvider(provider)) {
    return Response.json({ error: "プロバイダ指定が不正です" }, { status: 400 });
  }
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    return Response.json({ error: "apiKey は必須です" }, { status: 400 });
  }

  await upsertStoredCredential(provider, apiKey);
  const providers = await listLlmCredentialStatuses();
  return Response.json({ providers });
}

export async function DELETE(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSONの形式が不正です" }, { status: 400 });
  }

  const provider = (body as Record<string, unknown> | null)?.provider;
  if (!isLlmProvider(provider)) {
    return Response.json({ error: "プロバイダ指定が不正です" }, { status: 400 });
  }

  await deleteStoredCredential(provider);
  const providers = await listLlmCredentialStatuses();
  return Response.json({ providers });
}
