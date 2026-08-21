ALTER TABLE `PaymentGatewaySetting`
    MODIFY `splitUsername` VARCHAR(191) NULL DEFAULT 'mildff',
    MODIFY `splitPercentage` INTEGER NOT NULL DEFAULT 5;

UPDATE `PaymentGatewaySetting`
SET `splitUsername` = 'mildff',
    `splitPercentage` = 5
WHERE `id` = 'ZYPHER';
