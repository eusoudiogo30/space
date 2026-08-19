-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `document` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `coinBalance` INTEGER NOT NULL DEFAULT 0,
    `bestScore` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isBlocked` BOOLEAN NOT NULL DEFAULT false,
    `isInfluencer` BOOLEAN NOT NULL DEFAULT false,
    `excludedFromRanking` BOOLEAN NOT NULL DEFAULT false,
    `receivedSignupBonus` BOOLEAN NOT NULL DEFAULT false,
    `referredByAffiliateId` VARCHAR(191) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_username_key`(`username`),
    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_createdAt_idx`(`createdAt`),
    INDEX `User_referredByAffiliateId_idx`(`referredByAffiliateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Affiliate` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `cpaAmount` INTEGER NOT NULL DEFAULT 2000,
    `cpaRtpMode` VARCHAR(191) NOT NULL DEFAULT 'GLOBAL',
    `cpaRetentionEnabled` BOOLEAN NOT NULL DEFAULT true,
    `cpaCycleSize` INTEGER NOT NULL DEFAULT 10,
    `cpaRetainedPositions` VARCHAR(191) NOT NULL DEFAULT '[9,10]',
    `cpaEventCount` INTEGER NOT NULL DEFAULT 0,
    `availableBalance` INTEGER NOT NULL DEFAULT 0,
    `withdrawnBalance` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Affiliate_userId_key`(`userId`),
    UNIQUE INDEX `Affiliate_code_key`(`code`),
    INDEX `Affiliate_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AffiliateCommission` (
    `id` VARCHAR(191) NOT NULL,
    `affiliateId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `depositId` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 1,
    `status` VARCHAR(191) NOT NULL DEFAULT 'AVAILABLE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AffiliateCommission_depositId_key`(`depositId`),
    INDEX `AffiliateCommission_affiliateId_createdAt_idx`(`affiliateId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Game` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `gameType` VARCHAR(191) NOT NULL DEFAULT 'SPACE_ADVENTURE',
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `score` INTEGER NOT NULL DEFAULT 0,
    `stakeAmount` INTEGER NOT NULL DEFAULT 0,
    `earlyExit` BOOLEAN NOT NULL DEFAULT false,
    `hits` INTEGER NOT NULL DEFAULT 0,
    `misses` INTEGER NOT NULL DEFAULT 0,
    `maxCombo` INTEGER NOT NULL DEFAULT 0,
    `coinsRewarded` INTEGER NOT NULL DEFAULT 0,
    `payoutMultiplier` DOUBLE NOT NULL DEFAULT 0,
    `rtpPercentage` DOUBLE NOT NULL DEFAULT 80,
    `duration` INTEGER NOT NULL DEFAULT 30,
    `riskLevel` VARCHAR(191) NOT NULL DEFAULT 'LOW',
    `ip` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Game_userId_finishedAt_idx`(`userId`, `finishedAt`),
    INDEX `Game_status_finishedAt_idx`(`status`, `finishedAt`),
    INDEX `Game_gameType_finishedAt_idx`(`gameType`, `finishedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GameEvent` (
    `id` VARCHAR(191) NOT NULL,
    `gameId` VARCHAR(191) NOT NULL,
    `sequence` INTEGER NOT NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `targetType` VARCHAR(191) NOT NULL,
    `holeIndex` INTEGER NOT NULL,
    `clientTimestamp` DATETIME(3) NULL,
    `serverTimestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `points` INTEGER NOT NULL,
    `combo` INTEGER NOT NULL,
    `metadata` VARCHAR(191) NULL,

    INDEX `GameEvent_gameId_serverTimestamp_idx`(`gameId`, `serverTimestamp`),
    UNIQUE INDEX `GameEvent_gameId_sequence_key`(`gameId`, `sequence`),
    UNIQUE INDEX `GameEvent_gameId_targetId_key`(`gameId`, `targetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Admin` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL DEFAULT 'ANALYST',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Admin_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RtpSetting` (
    `id` VARCHAR(191) NOT NULL,
    `percentage` DOUBLE NOT NULL DEFAULT 80,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `reason` VARCHAR(191) NOT NULL,
    `adminId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RtpSetting_isActive_createdAt_idx`(`isActive`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentGatewaySetting` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'ZYPHER',
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `baseUrl` VARCHAR(191) NOT NULL DEFAULT 'https://api.zypher.global',
    `clientId` VARCHAR(191) NULL,
    `clientSecretEncrypted` VARCHAR(191) NULL,
    `webhookUrl` VARCHAR(191) NULL,
    `webhookTokenEncrypted` VARCHAR(191) NULL,
    `timeoutMs` INTEGER NOT NULL DEFAULT 10000,
    `splitUsername` VARCHAR(191) NULL,
    `splitPercentage` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Deposit` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'CONFIRMED',
    `provider` VARCHAR(191) NOT NULL DEFAULT 'DEMO',
    `reference` VARCHAR(191) NOT NULL,
    `providerTransactionId` VARCHAR(191) NULL,
    `qrImage` VARCHAR(191) NULL,
    `copyPaste` VARCHAR(191) NULL,
    `endToEndId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Deposit_reference_key`(`reference`),
    INDEX `Deposit_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `Deposit_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Withdrawal` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `feeAmount` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'COMPLETED',
    `provider` VARCHAR(191) NOT NULL DEFAULT 'DEMO',
    `reference` VARCHAR(191) NOT NULL,
    `providerTransactionId` VARCHAR(191) NULL,
    `endToEndId` VARCHAR(191) NULL,
    `destinationType` VARCHAR(191) NULL,
    `destinationLast4` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Withdrawal_reference_key`(`reference`),
    INDEX `Withdrawal_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `Withdrawal_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlatformSetting` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'MAIN',
    `minimumBet` INTEGER NOT NULL DEFAULT 500,
    `maximumBet` INTEGER NOT NULL DEFAULT 25000,
    `suggestedBets` VARCHAR(191) NOT NULL DEFAULT '[5,10,20,50,100,200,250]',
    `minimumDeposit` INTEGER NOT NULL DEFAULT 1000,
    `maximumDeposit` INTEGER NOT NULL DEFAULT 1000000,
    `minimumWithdrawal` INTEGER NOT NULL DEFAULT 1000,
    `maximumWithdrawal` INTEGER NOT NULL DEFAULT 1000000,
    `withdrawalFeePercentage` DOUBLE NOT NULL DEFAULT 0,
    `signupBonusEnabled` BOOLEAN NOT NULL DEFAULT false,
    `signupBonusAmount` INTEGER NOT NULL DEFAULT 0,
    `registrationsEnabled` BOOLEAN NOT NULL DEFAULT true,
    `depositsEnabled` BOOLEAN NOT NULL DEFAULT true,
    `withdrawalsEnabled` BOOLEAN NOT NULL DEFAULT true,
    `maintenanceMode` BOOLEAN NOT NULL DEFAULT false,
    `affiliateDefaultCpaAmount` INTEGER NOT NULL DEFAULT 2000,
    `affiliateCpaRetentionEnabled` BOOLEAN NOT NULL DEFAULT false,
    `affiliateCpaCycleSize` INTEGER NOT NULL DEFAULT 10,
    `affiliateCpaRetainedPositions` VARCHAR(191) NOT NULL DEFAULT '[9,10]',
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SpaceDifficultySetting` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'MAIN',
    `preset` VARCHAR(191) NOT NULL DEFAULT 'medium',
    `minFallMs` INTEGER NOT NULL DEFAULT 950,
    `maxFallMs` INTEGER NOT NULL DEFAULT 1650,
    `spawnGapMs` INTEGER NOT NULL DEFAULT 620,
    `rampWindowMs` INTEGER NOT NULL DEFAULT 60000,
    `rockFrequency` INTEGER NOT NULL DEFAULT 42,
    `coinFrequency` INTEGER NOT NULL DEFAULT 46,
    `boostFrequency` INTEGER NOT NULL DEFAULT 12,
    `boostDurationMs` INTEGER NOT NULL DEFAULT 3000,
    `maximumScore` INTEGER NOT NULL DEFAULT 10000,
    `hitRadius` DOUBLE NOT NULL DEFAULT 0.11,
    `hitRadiusY` DOUBLE NOT NULL DEFAULT 0.08,
    `freeRtpPercentage` DOUBLE NOT NULL DEFAULT 80,
    `shipSpeed` DOUBLE NOT NULL DEFAULT 1.35,
    `multiplierPerFloor` DOUBLE NOT NULL DEFAULT 0.03,
    `boostRockFrequency` INTEGER NOT NULL DEFAULT 42,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminNotification` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `read` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AdminNotification_read_createdAt_idx`(`read`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminSession` (
    `id` VARCHAR(191) NOT NULL,
    `adminId` VARCHAR(191) NOT NULL,
    `refreshTokenHash` VARCHAR(191) NOT NULL,
    `ip` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AdminSession_adminId_expiresAt_idx`(`adminId`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminAuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `adminId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `resource` VARCHAR(191) NOT NULL,
    `resourceId` VARCHAR(191) NULL,
    `previousData` VARCHAR(191) NULL,
    `newData` VARCHAR(191) NULL,
    `reason` VARCHAR(191) NULL,
    `ip` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AdminAuditLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CoinTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `gameId` VARCHAR(191) NULL,
    `adminId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `balanceBefore` INTEGER NOT NULL,
    `balanceAfter` INTEGER NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CoinTransaction_userId_createdAt_idx`(`userId`, `createdAt`),
    UNIQUE INDEX `CoinTransaction_gameId_type_key`(`gameId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FraudAlert` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `gameId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `evidence` VARCHAR(191) NULL,
    `riskLevel` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'OPEN',
    `reviewedByAdminId` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FraudAlert_status_riskLevel_createdAt_idx`(`status`, `riskLevel`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserNote` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `adminId` VARCHAR(191) NOT NULL,
    `content` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_referredByAffiliateId_fkey` FOREIGN KEY (`referredByAffiliateId`) REFERENCES `Affiliate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Affiliate` ADD CONSTRAINT `Affiliate_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AffiliateCommission` ADD CONSTRAINT `AffiliateCommission_affiliateId_fkey` FOREIGN KEY (`affiliateId`) REFERENCES `Affiliate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Game` ADD CONSTRAINT `Game_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GameEvent` ADD CONSTRAINT `GameEvent_gameId_fkey` FOREIGN KEY (`gameId`) REFERENCES `Game`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RtpSetting` ADD CONSTRAINT `RtpSetting_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `Admin`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Deposit` ADD CONSTRAINT `Deposit_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Withdrawal` ADD CONSTRAINT `Withdrawal_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdminSession` ADD CONSTRAINT `AdminSession_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `Admin`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AdminAuditLog` ADD CONSTRAINT `AdminAuditLog_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `Admin`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoinTransaction` ADD CONSTRAINT `CoinTransaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoinTransaction` ADD CONSTRAINT `CoinTransaction_gameId_fkey` FOREIGN KEY (`gameId`) REFERENCES `Game`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CoinTransaction` ADD CONSTRAINT `CoinTransaction_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `Admin`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FraudAlert` ADD CONSTRAINT `FraudAlert_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FraudAlert` ADD CONSTRAINT `FraudAlert_gameId_fkey` FOREIGN KEY (`gameId`) REFERENCES `Game`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FraudAlert` ADD CONSTRAINT `FraudAlert_reviewedByAdminId_fkey` FOREIGN KEY (`reviewedByAdminId`) REFERENCES `Admin`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserNote` ADD CONSTRAINT `UserNote_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserNote` ADD CONSTRAINT `UserNote_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `Admin`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

