// Structural signature of a dataset — its sorted, de-duplicated column names,
// hashed. Same shape → same hash → enables "this looks like your IndiaMART
// export, import with the saved mapping?" (Intake Memory).
//
// Structural ONLY: it hashes column NAMES, never customer values. Deterministic
// and dependency-free (FNV-1a) so it's stable across runtimes and testable.

export function columnSignatureHash(sample: Record<string, string>[]): { columns: number; hash: string } {
  const keys = new Set<string>()
  for (const row of sample) for (const k of Object.keys(row)) keys.add(k)
  const signature = Array.from(keys).sort().join("|")

  let h = 0x811c9dc5
  for (let i = 0; i < signature.length; i++) {
    h ^= signature.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return { columns: keys.size, hash: (h >>> 0).toString(16).padStart(8, "0") }
}
