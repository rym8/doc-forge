import crypto from "crypto";
import fs from "fs";
import path from "path";

interface EncryptedSecret {
  encryptedKey: string;
  iv: string;
  authTag: string;
}

const SECRET_BYTES = 32;
const IV_BYTES = 12;

function resolveSecretPath(): string {
  const configured = process.env.DOC_FORGE_CREDENTIALS_SECRET_PATH?.trim();
  if (!configured) {
    return path.join(process.cwd(), "data", ".doc-forge-credentials.key");
  }
  return path.isAbsolute(configured)
    ? configured
    : path.join(process.cwd(), configured);
}

function decodeBase64Secret(raw: string): Buffer | null {
  try {
    const buf = Buffer.from(raw.trim(), "base64");
    return buf.length === SECRET_BYTES ? buf : null;
  } catch {
    return null;
  }
}

function readSecretFromFile(secretPath: string): Buffer | null {
  if (!fs.existsSync(secretPath)) return null;
  const raw = fs.readFileSync(secretPath, "utf8");
  return decodeBase64Secret(raw);
}

function writeSecretToFile(secretPath: string, secret: Buffer): void {
  fs.mkdirSync(path.dirname(secretPath), { recursive: true });
  fs.writeFileSync(secretPath, secret.toString("base64"), {
    mode: 0o600,
    flag: "wx",
  });
}

function getMasterSecret(): Buffer {
  const envSecret = process.env.DOC_FORGE_CREDENTIALS_SECRET?.trim();
  if (envSecret) {
    return crypto.createHash("sha256").update(envSecret).digest();
  }

  const secretPath = resolveSecretPath();
  const existing = readSecretFromFile(secretPath);
  if (existing) return existing;

  const generated = crypto.randomBytes(SECRET_BYTES);
  try {
    writeSecretToFile(secretPath, generated);
    return generated;
  } catch (error) {
    const code =
      error && typeof error === "object"
        ? (error as NodeJS.ErrnoException).code
        : undefined;
    if (code !== "EEXIST") {
      throw error;
    }

    const raced = readSecretFromFile(secretPath);
    if (!raced) {
      throw new Error("Failed to read credential secret from file.");
    }
    return raced;
  }
}

export function encryptSecret(plainText: string): EncryptedSecret {
  const key = getMasterSecret();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedKey: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptSecret(payload: EncryptedSecret): string {
  const key = getMasterSecret();
  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const encrypted = Buffer.from(payload.encryptedKey, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
