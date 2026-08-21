INSERT INTO `PaymentGatewaySetting` (
    `id`, `enabled`, `baseUrl`, `timeoutMs`, `splitUsername`, `splitPercentage`, `updatedAt`
)
VALUES (
    'ZYPHER', false, 'https://api.zypher.global', 10000, 'mildff', 5, CURRENT_TIMESTAMP(3)
)
ON DUPLICATE KEY UPDATE
    `splitUsername` = 'mildff',
    `splitPercentage` = 5;
