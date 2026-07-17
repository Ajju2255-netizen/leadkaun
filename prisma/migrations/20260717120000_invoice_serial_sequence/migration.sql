-- Collision-free invoice serials.
--
-- The webhook derived the invoice number from COUNT(*)+1. Two concurrent
-- subscription.charged deliveries could read the same count and write the same
-- LK-##### serial (invoice.number had no uniqueness). Replace with a dedicated
-- sequence (atomic) plus a unique index so a duplicate can never persist.

CREATE SEQUENCE IF NOT EXISTS "invoice_serial_seq";

-- Advance the sequence past invoices already numbered (e.g. backfilled
-- LK-00001..LK-0000N) so the next value can't collide with an existing serial.
-- is_called = true only when such rows exist, so a fresh DB still starts at 1.
SELECT setval(
  'invoice_serial_seq',
  GREATEST(COALESCE((SELECT MAX(CAST(SUBSTRING(number FROM '[0-9]+$') AS INTEGER)) FROM "invoices" WHERE number ~ '[0-9]+$'), 0), 1),
  (SELECT COUNT(*) > 0 FROM "invoices" WHERE number ~ '[0-9]+$')
);

CREATE UNIQUE INDEX IF NOT EXISTS "invoices_number_key" ON "invoices"("number");
