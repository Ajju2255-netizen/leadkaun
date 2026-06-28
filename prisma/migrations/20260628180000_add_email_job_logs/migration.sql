-- CreateTable
CREATE TABLE "email_logs" (
    "id" TEXT NOT NULL,
    "account_id" TEXT,
    "to_email" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "provider_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "error" TEXT,
    "opened_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "function" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "account_id" TEXT,
    "items" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_logs_account_id_created_at_idx" ON "email_logs"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "email_logs_template_created_at_idx" ON "email_logs"("template", "created_at");

-- CreateIndex
CREATE INDEX "email_logs_status_created_at_idx" ON "email_logs"("status", "created_at");

-- CreateIndex
CREATE INDEX "job_runs_function_started_at_idx" ON "job_runs"("function", "started_at");

-- CreateIndex
CREATE INDEX "job_runs_status_started_at_idx" ON "job_runs"("status", "started_at");

