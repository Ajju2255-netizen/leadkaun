import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

/**
 * AES-256-GCM authenticated encryption for sensitive payloads (Google Sheets
 * refresh_tokens, future API secrets). Output format:
 *
 *   v1:<iv>:<tag>:<ciphertext>
 *
 * All three trailing segments are base64url. The "v1" prefix is the
 * future-proofing hook — bump to "v2" when rotating algorithm or key derivation.
 *
 * Reads ENCRYPTION_KEY from env (32 bytes, base64-encoded). Generate with:
 *   openssl rand -base64 32
 */

const ALG = "aes-256-gcm"
const IV_LEN = 12 // 96 bits — GCM standard
const VERSION = "v1"

function getKey(): Buffer {
  const k = process.env.ENCRYPTION_KEY
  if (!k) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ENCRYPTION_KEY is required in production")
    }
    console.warn("[crypto] ENCRYPTION_KEY not set — using dev fallback (DO NOT use in prod)")
    return Buffer.alloc(32, 1)
  }
  const buf = Buffer.from(k, "base64")
  if (buf.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must be 32 bytes base64 (got ${buf.length})`)
  }
  return buf
}

export function encrypt(plaintext: string): string {
  if (typeof plaintext !== "string") throw new TypeError("encrypt() requires a string")
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALG, getKey(), iv)
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${VERSION}:${iv.toString("base64url")}:${tag.toString("base64url")}:${ct.toString("base64url")}`
}

export function decrypt(token: string): string {
  if (typeof token !== "string") throw new TypeError("decrypt() requires a string")
  const parts = token.split(":")
  if (parts.length !== 4) throw new Error("Malformed ciphertext (expected 4 segments)")
  const [ver, ivB64, tagB64, ctB64] = parts
  if (ver !== VERSION) throw new Error(`Unsupported crypto version: ${ver}`)
  const decipher = createDecipheriv(ALG, getKey(), Buffer.from(ivB64, "base64url"))
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}

/** Returns true if `token` looks like our ciphertext envelope. */
export function isEncrypted(token: unknown): token is string {
  return typeof token === "string" && token.startsWith(`${VERSION}:`)
}

/**
 * Safe decrypt: if the token is encrypted, decrypt it; otherwise return as-is.
 * Used for backwards-compat with rows that pre-date encryption (e.g. legacy
 * plaintext refresh_tokens stored before Phase 9). New writes always encrypt.
 */
export function decryptIfEncrypted(token: string): string {
  return isEncrypted(token) ? decrypt(token) : token
}
