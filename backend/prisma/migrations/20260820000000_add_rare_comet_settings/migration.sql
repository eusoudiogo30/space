ALTER TABLE `SpaceDifficultySetting`
    ADD COLUMN `gemUpgradeChance` DOUBLE NOT NULL DEFAULT 0.15,
    ADD COLUMN `gemComboValue` INTEGER NOT NULL DEFAULT 3;
