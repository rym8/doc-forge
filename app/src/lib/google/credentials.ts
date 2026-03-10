import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { googleOAuthCredentials } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/security/credentials-crypto";

const SINGLETON_ID = "singleton";

export interface GoogleOAuthStatus {
  clientConfigured: boolean;
  clientId: string | null;
  connected: boolean;
}

export async function loadGoogleOAuthRow() {
  const rows = await db
    .select()
    .from(googleOAuthCredentials)
    .where(eq(googleOAuthCredentials.id, SINGLETON_ID));
  return rows[0] ?? null;
}

export async function getGoogleOAuthStatus(): Promise<GoogleOAuthStatus> {
  const row = await loadGoogleOAuthRow();
  if (!row) {
    return { clientConfigured: false, clientId: null, connected: false };
  }
  const clientConfigured = Boolean(row.clientId && row.encryptedClientSecret);
  const connected = Boolean(row.encryptedRefreshToken);
  return { clientConfigured, clientId: row.clientId ?? null, connected };
}

export async function getGoogleClientCredentials(): Promise<{
  clientId: string;
  clientSecret: string;
} | null> {
  const row = await loadGoogleOAuthRow();
  if (
    !row?.clientId ||
    !row.encryptedClientSecret ||
    !row.ivClientSecret ||
    !row.authTagClientSecret
  ) {
    return null;
  }
  const clientSecret = decryptSecret({
    encryptedKey: row.encryptedClientSecret,
    iv: row.ivClientSecret,
    authTag: row.authTagClientSecret,
  });
  return { clientId: row.clientId, clientSecret };
}

export async function getGoogleRefreshToken(): Promise<string | null> {
  const row = await loadGoogleOAuthRow();
  if (!row?.encryptedRefreshToken || !row.ivRefreshToken || !row.authTagRefreshToken) {
    return null;
  }
  return decryptSecret({
    encryptedKey: row.encryptedRefreshToken,
    iv: row.ivRefreshToken,
    authTag: row.authTagRefreshToken,
  });
}

/** clientId + clientSecret を保存（refresh_token は据え置き）*/
export async function saveGoogleClientCredentials(
  clientId: string,
  clientSecret: string
): Promise<void> {
  const enc = encryptSecret(clientSecret);
  const now = Date.now();

  await db
    .insert(googleOAuthCredentials)
    .values({
      id: SINGLETON_ID,
      clientId,
      encryptedClientSecret: enc.encryptedKey,
      ivClientSecret: enc.iv,
      authTagClientSecret: enc.authTag,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: googleOAuthCredentials.id,
      set: {
        clientId,
        encryptedClientSecret: enc.encryptedKey,
        ivClientSecret: enc.iv,
        authTagClientSecret: enc.authTag,
        updatedAt: now,
      },
    });
}

/** refresh_token を保存（client credentials は据え置き）*/
export async function saveGoogleRefreshToken(refreshToken: string): Promise<void> {
  const enc = encryptSecret(refreshToken);
  const now = Date.now();

  await db
    .insert(googleOAuthCredentials)
    .values({
      id: SINGLETON_ID,
      encryptedRefreshToken: enc.encryptedKey,
      ivRefreshToken: enc.iv,
      authTagRefreshToken: enc.authTag,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: googleOAuthCredentials.id,
      set: {
        encryptedRefreshToken: enc.encryptedKey,
        ivRefreshToken: enc.iv,
        authTagRefreshToken: enc.authTag,
        updatedAt: now,
      },
    });
}

/** Google 接続を切断（refresh_token だけ削除）*/
export async function clearGoogleRefreshToken(): Promise<void> {
  await db
    .update(googleOAuthCredentials)
    .set({
      encryptedRefreshToken: null,
      ivRefreshToken: null,
      authTagRefreshToken: null,
      updatedAt: Date.now(),
    })
    .where(eq(googleOAuthCredentials.id, SINGLETON_ID));
}

/** Google 設定を全消去 */
export async function clearGoogleOAuthCredentials(): Promise<void> {
  await db
    .delete(googleOAuthCredentials)
    .where(eq(googleOAuthCredentials.id, SINGLETON_ID));
}
