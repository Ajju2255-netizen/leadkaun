-- CreateTable
CREATE TABLE "feature_flags" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feature_flags_account_id_idx" ON "feature_flags"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_account_id_key_key" ON "feature_flags"("account_id", "key");

