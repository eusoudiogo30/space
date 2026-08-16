-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Game" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
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
    "duration" INTEGER NOT NULL DEFAULT 30,
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Game_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Game_configVersionId_fkey" FOREIGN KEY ("configVersionId") REFERENCES "GameConfigVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Game" ("coinsRewarded", "configVersionId", "createdAt", "duration", "finishedAt", "hits", "id", "ip", "maxCombo", "misses", "riskLevel", "score", "startedAt", "status", "updatedAt", "userAgent", "userId") SELECT "coinsRewarded", "configVersionId", "createdAt", "duration", "finishedAt", "hits", "id", "ip", "maxCombo", "misses", "riskLevel", "score", "startedAt", "status", "updatedAt", "userAgent", "userId" FROM "Game";
DROP TABLE "Game";
ALTER TABLE "new_Game" RENAME TO "Game";
CREATE INDEX "Game_userId_finishedAt_idx" ON "Game"("userId", "finishedAt");
CREATE INDEX "Game_status_finishedAt_idx" ON "Game"("status", "finishedAt");
CREATE INDEX "Game_configVersionId_idx" ON "Game"("configVersionId");
CREATE TABLE "new_GameConfigVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameConfigId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "gameDuration" INTEGER NOT NULL DEFAULT 30,
    "holeCount" INTEGER NOT NULL DEFAULT 9,
    "minSpawnInterval" INTEGER NOT NULL DEFAULT 90,
    "maxSpawnInterval" INTEGER NOT NULL DEFAULT 200,
    "minVisibleTime" INTEGER NOT NULL DEFAULT 400,
    "maxVisibleTime" INTEGER NOT NULL DEFAULT 1200,
    "maximumScore" INTEGER NOT NULL DEFAULT 10000,
    "gameCost" INTEGER NOT NULL DEFAULT 0,
    "minimumStake" INTEGER NOT NULL DEFAULT 10,
    "maximumStake" INTEGER NOT NULL DEFAULT 500,
    "comboX2" INTEGER NOT NULL DEFAULT 5,
    "comboX3" INTEGER NOT NULL DEFAULT 10,
    "resetComboOnMiss" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GameConfigVersion_gameConfigId_fkey" FOREIGN KEY ("gameConfigId") REFERENCES "GameConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GameConfigVersion" ("comboX2", "comboX3", "createdAt", "gameConfigId", "gameCost", "gameDuration", "holeCount", "id", "isActive", "maxSpawnInterval", "maxVisibleTime", "maximumScore", "minSpawnInterval", "minVisibleTime", "resetComboOnMiss", "version") SELECT "comboX2", "comboX3", "createdAt", "gameConfigId", "gameCost", "gameDuration", "holeCount", "id", "isActive", "maxSpawnInterval", "maxVisibleTime", "maximumScore", "minSpawnInterval", "minVisibleTime", "resetComboOnMiss", "version" FROM "GameConfigVersion";
DROP TABLE "GameConfigVersion";
ALTER TABLE "new_GameConfigVersion" RENAME TO "GameConfigVersion";
CREATE UNIQUE INDEX "GameConfigVersion_gameConfigId_version_key" ON "GameConfigVersion"("gameConfigId", "version");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
