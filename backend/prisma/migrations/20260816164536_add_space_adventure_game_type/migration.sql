-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Game" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "gameType" TEXT NOT NULL DEFAULT 'BURACO_DOIDO',
    "configVersionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "score" INTEGER NOT NULL DEFAULT 0,
    "stakeAmount" INTEGER NOT NULL DEFAULT 0,
    "earlyExit" BOOLEAN NOT NULL DEFAULT false,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "misses" INTEGER NOT NULL DEFAULT 0,
    "maxCombo" INTEGER NOT NULL DEFAULT 0,
    "coinsRewarded" INTEGER NOT NULL DEFAULT 0,
    "payoutMultiplier" REAL NOT NULL DEFAULT 0,
    "rtpPercentage" REAL NOT NULL DEFAULT 80,
    "duration" INTEGER NOT NULL DEFAULT 30,
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Game_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Game_configVersionId_fkey" FOREIGN KEY ("configVersionId") REFERENCES "GameConfigVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Game" ("coinsRewarded", "configVersionId", "createdAt", "duration", "earlyExit", "finishedAt", "hits", "id", "ip", "maxCombo", "misses", "payoutMultiplier", "riskLevel", "rtpPercentage", "score", "stakeAmount", "startedAt", "status", "updatedAt", "userAgent", "userId") SELECT "coinsRewarded", "configVersionId", "createdAt", "duration", "earlyExit", "finishedAt", "hits", "id", "ip", "maxCombo", "misses", "payoutMultiplier", "riskLevel", "rtpPercentage", "score", "stakeAmount", "startedAt", "status", "updatedAt", "userAgent", "userId" FROM "Game";
DROP TABLE "Game";
ALTER TABLE "new_Game" RENAME TO "Game";
CREATE INDEX "Game_userId_finishedAt_idx" ON "Game"("userId", "finishedAt");
CREATE INDEX "Game_status_finishedAt_idx" ON "Game"("status", "finishedAt");
CREATE INDEX "Game_configVersionId_idx" ON "Game"("configVersionId");
CREATE INDEX "Game_gameType_finishedAt_idx" ON "Game"("gameType", "finishedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
