import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { llmCredentials, llmProviders, type LlmProvider } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/security/credentials-crypto";

export interface RuntimeProviderKeys {
  anthropic?: string;
  openai?: string;
  gemini?: string;
}

export interface LlmCredentialStatus {
  provider: LlmProvider;
  configured: boolean;
  source: "stored" | "env" | "none";
  maskedKey: string | null;
}

function getEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function getEnvProviderKey(provider: LlmProvider): string | undefined {
  if (provider === "gemini") {
    return getEnv("GEMINI_API_KEY") ?? getEnv("GOOGLE_API_KEY");
  }
  if (provider === "openai") {
    return getEnv("OPENAI_API_KEY");
  }
  return getEnv("ANTHROPIC_API_KEY");
}

function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 2) {
    return `${trimmed[0]}...`;
  }
  const head = trimmed.slice(0, Math.min(4, trimmed.length));
  const tail = trimmed.slice(-Math.min(4, trimmed.length));
  return `${head}...${tail}`;
}

async function loadStoredCredentialMap(): Promise<
  Partial<Record<LlmProvider, string>>
> {
  const rows = await db.select().from(llmCredentials);
  const entries = rows.map((row) => {
    const decrypted = decryptSecret({
      encryptedKey: row.encryptedKey,
      iv: row.iv,
      authTag: row.authTag,
    });
    return [row.provider, decrypted] as const;
  });

  return Object.fromEntries(entries) as Partial<Record<LlmProvider, string>>;
}

export function isLlmProvider(value: unknown): value is LlmProvider {
  return typeof value === "string" && llmProviders.includes(value as LlmProvider);
}

export async function listLlmCredentialStatuses(): Promise<LlmCredentialStatus[]> {
  const stored = await loadStoredCredentialMap();

  return llmProviders.map((provider) => {
    const storedKey = stored[provider];
    if (storedKey) {
      return {
        provider,
        configured: true,
        source: "stored" as const,
        maskedKey: maskApiKey(storedKey),
      };
    }

    const envKey = getEnvProviderKey(provider);
    if (envKey) {
      return {
        provider,
        configured: true,
        source: "env" as const,
        maskedKey: maskApiKey(envKey),
      };
    }

    return {
      provider,
      configured: false,
      source: "none" as const,
      maskedKey: null,
    };
  });
}

export async function resolveRuntimeProviderKeys(): Promise<RuntimeProviderKeys> {
  const stored = await loadStoredCredentialMap();

  return {
    gemini: stored.gemini ?? getEnvProviderKey("gemini"),
    openai: stored.openai ?? getEnvProviderKey("openai"),
    anthropic: stored.anthropic ?? getEnvProviderKey("anthropic"),
  };
}

export async function upsertStoredCredential(
  provider: LlmProvider,
  apiKey: string
): Promise<void> {
  const now = Date.now();
  const encrypted = encryptSecret(apiKey.trim());

  await db
    .insert(llmCredentials)
    .values({
      provider,
      encryptedKey: encrypted.encryptedKey,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: llmCredentials.provider,
      set: {
        encryptedKey: encrypted.encryptedKey,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        updatedAt: now,
      },
    });
}

export async function deleteStoredCredential(provider: LlmProvider): Promise<void> {
  await db.delete(llmCredentials).where(eq(llmCredentials.provider, provider));
}
