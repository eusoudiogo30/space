ALTER TABLE "Game" ADD COLUMN "payoutMultiplier" REAL NOT NULL DEFAULT 0;
ALTER TABLE "Game" ADD COLUMN "rtpPercentage" REAL NOT NULL DEFAULT 80;

CREATE TABLE "RtpSetting" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "percentage" REAL NOT NULL DEFAULT 80,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT NOT NULL,
  "adminId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RtpSetting_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Deposit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "provider" TEXT NOT NULL DEFAULT 'DEMO',
  "reference" TEXT NOT NULL,
  "providerTransactionId" TEXT,
  "qrImage" TEXT,
  "copyPaste" TEXT,
  "endToEndId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" DATETIME,
  CONSTRAINT "Deposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Withdrawal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "provider" TEXT NOT NULL DEFAULT 'DEMO',
  "reference" TEXT NOT NULL,
  "providerTransactionId" TEXT,
  "endToEndId" TEXT,
  "destinationType" TEXT,
  "destinationLast4" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "RtpSetting_isActive_createdAt_idx" ON "RtpSetting"("isActive", "createdAt");
CREATE UNIQUE INDEX "Deposit_reference_key" ON "Deposit"("reference");
CREATE INDEX "Deposit_userId_createdAt_idx" ON "Deposit"("userId", "createdAt");
CREATE INDEX "Deposit_status_createdAt_idx" ON "Deposit"("status", "createdAt");
CREATE UNIQUE INDEX "Withdrawal_reference_key" ON "Withdrawal"("reference");
CREATE INDEX "Withdrawal_userId_createdAt_idx" ON "Withdrawal"("userId", "createdAt");
CREATE INDEX "Withdrawal_status_createdAt_idx" ON "Withdrawal"("status", "createdAt");

CREATE TABLE "PaymentGatewaySetting" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'ZYPHER',
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "baseUrl" TEXT NOT NULL DEFAULT 'https://api.zypher.global',
  "clientId" TEXT,
  "clientSecretEncrypted" TEXT,
  "webhookUrl" TEXT,
  "webhookTokenEncrypted" TEXT,
  "timeoutMs" INTEGER NOT NULL DEFAULT 10000,
  "splitUsername" TEXT,
  "splitPercentage" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" DATETIME NOT NULL
);
