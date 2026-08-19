-- Signup now collects a phone number for the account owner.
--
-- Nullable on purpose: every existing user predates the field, and the number is
-- NOT verified (no OTP is sent), so it is self-declared contact data rather than
-- an identity claim. Stored normalised to +91XXXXXXXXXX with the original kept.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_raw" TEXT;
