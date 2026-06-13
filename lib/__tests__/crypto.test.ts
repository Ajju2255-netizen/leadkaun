import { describe, it, expect, beforeAll } from "vitest"
import { encrypt, decrypt, isEncrypted, decryptIfEncrypted } from "@/lib/crypto"
import { randomBytes } from "node:crypto"

beforeAll(() => {
  // Deterministic 32-byte key for tests
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64")
})

describe("crypto", () => {
  it("roundtrips a string", () => {
    const plaintext = "hello world — refresh_token_abc123"
    const ct = encrypt(plaintext)
    expect(decrypt(ct)).toBe(plaintext)
  })

  it("emits the v1 envelope format", () => {
    const ct = encrypt("anything")
    expect(ct).toMatch(/^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/)
  })

  it("produces a different ciphertext each call (random IV)", () => {
    const a = encrypt("same plaintext")
    const b = encrypt("same plaintext")
    expect(a).not.toBe(b)
    expect(decrypt(a)).toBe(decrypt(b))
  })

  it("throws when ciphertext is mutated (auth tag check)", () => {
    const ct = encrypt("integrity test")
    // Flip a character in the ciphertext segment
    const parts = ct.split(":")
    const mutated = parts[3].startsWith("A")
      ? "B" + parts[3].slice(1)
      : "A" + parts[3].slice(1)
    parts[3] = mutated
    expect(() => decrypt(parts.join(":"))).toThrow()
  })

  it("throws on unsupported version prefix", () => {
    expect(() => decrypt("v2:aaa:bbb:ccc")).toThrow(/Unsupported crypto version/)
  })

  it("throws on malformed segments", () => {
    expect(() => decrypt("v1:nope")).toThrow(/Malformed ciphertext/)
  })

  it("isEncrypted detects the envelope", () => {
    expect(isEncrypted(encrypt("x"))).toBe(true)
    expect(isEncrypted("plain-token-1234")).toBe(false)
    expect(isEncrypted(null)).toBe(false)
    expect(isEncrypted(undefined)).toBe(false)
  })

  it("decryptIfEncrypted passes plaintext through", () => {
    const plain = "legacy_refresh_token_abc"
    expect(decryptIfEncrypted(plain)).toBe(plain)
  })

  it("decryptIfEncrypted decrypts envelope", () => {
    const ct = encrypt("token")
    expect(decryptIfEncrypted(ct)).toBe("token")
  })

  it("rejects non-string input", () => {
    // @ts-expect-error testing type guard
    expect(() => encrypt(123)).toThrow(TypeError)
    // @ts-expect-error testing type guard
    expect(() => decrypt(123)).toThrow(TypeError)
  })
})
