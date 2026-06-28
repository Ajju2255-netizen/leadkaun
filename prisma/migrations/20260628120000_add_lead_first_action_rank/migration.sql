-- Recommendation Adoption (North Star): store the lead's rank in its assigned
-- rep's priority queue at first contact. Additive, nullable — zero data risk,
-- instant metadata-only change. Rollback: ALTER TABLE "leads" DROP COLUMN "first_action_rank";
ALTER TABLE "leads" ADD COLUMN "first_action_rank" INTEGER;
