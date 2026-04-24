-- Company.availabilityEndpointUrl + SourceAvailabilitySample (idempotent for drift / partial runs)
SET @dbname = DATABASE();

SELECT COUNT(*) INTO @cnt FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Company' AND COLUMN_NAME = 'availabilityEndpointUrl';
SET @q = IF(@cnt = 0, 'ALTER TABLE `Company` ADD COLUMN `availabilityEndpointUrl` VARCHAR(191) NULL', 'SELECT 1');
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `SourceAvailabilitySample` (
    `id` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `criteriaHash` VARCHAR(191) NOT NULL,
    `pickupIso` VARCHAR(191) NULL,
    `returnIso` VARCHAR(191) NULL,
    `pickupLoc` VARCHAR(191) NULL,
    `returnLoc` VARCHAR(191) NULL,
    `offersCount` INTEGER NOT NULL DEFAULT 0,
    `sampleJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SourceAvailabilitySample_sourceId_criteriaHash_key`(`sourceId`, `criteriaHash`),
    INDEX `SourceAvailabilitySample_sourceId_idx`(`sourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SELECT COUNT(*) INTO @fk FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = @dbname AND TABLE_NAME = 'SourceAvailabilitySample' AND CONSTRAINT_NAME = 'SourceAvailabilitySample_sourceId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY';
SET @q = IF(@fk = 0, 'ALTER TABLE `SourceAvailabilitySample` ADD CONSTRAINT `SourceAvailabilitySample_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
