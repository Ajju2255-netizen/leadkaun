-- Persistent Google Sheets auto-sync connections (no OAuth; CSV-export based).
CREATE TABLE "sheet_syncs" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "sheet_url" TEXT NOT NULL,
    "sheet_id" TEXT NOT NULL,
    "gid" TEXT NOT NULL DEFAULT '0',
    "source_id" TEXT NOT NULL,
    "stage_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_row_count" INTEGER NOT NULL DEFAULT 0,
    "last_synced_at" TIMESTAMP(3),
    "last_status" TEXT,
    "total_synced" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sheet_syncs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sheet_syncs_is_active_idx" ON "sheet_syncs"("is_active");

CREATE INDEX "sheet_syncs_account_id_workspace_id_idx" ON "sheet_syncs"("account_id", "workspace_id");
