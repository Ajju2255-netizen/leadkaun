import { prisma } from "@/lib/prisma"

// ONE dedup rule, used everywhere a lead can enter (CSV batch, one-shot CSV,
// manual entry — and any future API/webhook/mobile path).
//
// Scoped to (account_id, phone) to MATCH the DB unique constraint
// @@unique([account_id, phone]). Previously the app checked (workspace_id,
// phone) while the DB enforced (account_id, phone): a cross-workspace collision
// slipped past the app check, then hit the DB constraint and was reported as a
// caught "DB error" instead of a clean "duplicate". Account-scoping makes the
// app agree with what the DB already enforces — so a duplicate is always a
// duplicate, one rule, everywhere.
//
// `phone` MUST already be canonicalised (see lib/import/phone-normalise.ts)
// before calling — the same normaliser is now used on every intake path, so the
// stored phone is comparable across CSV, sheets, and manual entry.

export async function findDuplicateLead(params: {
  accountId: string
  phone: string
}): Promise<{ id: string } | null> {
  return prisma.lead.findFirst({
    where: { account_id: params.accountId, phone: params.phone },
    select: { id: true },
  })
}
