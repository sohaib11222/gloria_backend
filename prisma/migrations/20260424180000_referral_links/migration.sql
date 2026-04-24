-- ReferralLink: admin-defined slugs for tracked agent/source self-registration
CREATE TABLE IF NOT EXISTS `ReferralLink` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `label` VARCHAR(255) NULL,
    `restrictToType` ENUM('AGENT', 'SOURCE') NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ReferralLink_slug_key`(`slug`),
    INDEX `ReferralLink_slug_idx`(`slug`),
    INDEX `ReferralLink_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @dbname = DATABASE();

SELECT COUNT(*) INTO @cnt FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Company' AND COLUMN_NAME = 'referralLinkId';
SET @q = IF(@cnt = 0, 'ALTER TABLE `Company` ADD COLUMN `referralLinkId` VARCHAR(191) NULL', 'SELECT 1');
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @idx_exists FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Company' AND INDEX_NAME = 'Company_referralLinkId_idx';
SET @q = IF(@idx_exists = 0, 'CREATE INDEX `Company_referralLinkId_idx` ON `Company`(`referralLinkId`)', 'SELECT 1');
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @fk_exists FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = @dbname AND TABLE_NAME = 'Company' AND CONSTRAINT_NAME = 'Company_referralLinkId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY';
SET @q = IF(@fk_exists = 0, 'ALTER TABLE `Company` ADD CONSTRAINT `Company_referralLinkId_fkey` FOREIGN KEY (`referralLinkId`) REFERENCES `ReferralLink`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
