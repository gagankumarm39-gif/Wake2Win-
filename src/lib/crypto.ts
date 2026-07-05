/**
 * Server-only secret encryption (AES-256-GCM) for student AI API keys.
 * Keyed by AI_KEY_ENCRYPTION_SECRET — rotate it and stored keys become
 * undecryptable (students simply re-enter their keys).
 *
 * Never import from client components: uses node:crypto.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

function encryptionKey(): Buffer {
  const secret = process.env.AI_KEY_ENCRYPTION_SECRET;
  if (!secret) throw new Error("AI_KEY_ENCRYPTION_SECRET not set");
  // Derive a 32-byte key from an arbitrary-length secret.
  return createHash("sha256").update(secret).digest();
}

/** Returns "v1:<iv>:<authTag>:<ciphertext>" (base64 parts). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !data) {
    throw new Error("Unrecognized ciphertext format");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
