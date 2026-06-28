-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'SUPPORT');

-- CreateTable
CREATE TABLE "platform_admins" (
    "id" TEXT NOT NULL,
    "auth_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "PlatformRole" NOT NULL DEFAULT 'SUPPORT',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "mfa_enrolled_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impersonation_logs" (
    "id" TEXT NOT NULL,
    "admin_auth_id" TEXT NOT NULL,
    "admin_email" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "target_user_id" TEXT NOT NULL,
    "reason" TEXT,
    "ip" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "impersonation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_auth_id_key" ON "platform_admins"("auth_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_email_key" ON "platform_admins"("email");

-- CreateIndex
CREATE INDEX "impersonation_logs_account_id_started_at_idx" ON "impersonation_logs"("account_id", "started_at");

-- CreateIndex
CREATE INDEX "impersonation_logs_admin_auth_id_started_at_idx" ON "impersonation_logs"("admin_auth_id", "started_at");

