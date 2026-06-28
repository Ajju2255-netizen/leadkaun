-- CreateTable
CREATE TABLE "admin_insights" (
    "id" TEXT NOT NULL,
    "for_date" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_insights_for_date_key" ON "admin_insights"("for_date");

