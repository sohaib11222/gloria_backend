-- SourceDailyRate (idempotent)
CREATE TABLE IF NOT EXISTS `SourceDailyRate` (
    `id` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `pickupDate` DATE NOT NULL,
    `acrissCode` VARCHAR(191) NOT NULL,
    `pickupLoc` VARCHAR(191) NOT NULL,
    `returnLoc` VARCHAR(191) NOT NULL,
    `dayOffset` INTEGER NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'EUR',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SourceDailyRate_dims_key`(`sourceId`, `pickupDate`, `acrissCode`, `pickupLoc`, `returnLoc`, `dayOffset`),
    INDEX `SourceDailyRate_sourceId_pickupDate_idx`(`sourceId`, `pickupDate`),
    INDEX `SourceDailyRate_sourceId_acrissCode_idx`(`sourceId`, `acrissCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @dbname = DATABASE();

SELECT CHARACTER_SET_NAME, COLLATION_NAME INTO @ccs, @ccl
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Company' AND COLUMN_NAME = 'id'
LIMIT 1;

SET @q = IF(
  @ccs IS NOT NULL AND @ccl IS NOT NULL,
  CONCAT(
    'ALTER TABLE `SourceDailyRate` ',
    'MODIFY `id` VARCHAR(191) CHARACTER SET ', @ccs, ' COLLATE ', @ccl, ' NOT NULL, ',
    'MODIFY `sourceId` VARCHAR(191) CHARACTER SET ', @ccs, ' COLLATE ', @ccl, ' NOT NULL, ',
    'MODIFY `acrissCode` VARCHAR(191) CHARACTER SET ', @ccs, ' COLLATE ', @ccl, ' NOT NULL, ',
    'MODIFY `pickupLoc` VARCHAR(191) CHARACTER SET ', @ccs, ' COLLATE ', @ccl, ' NOT NULL, ',
    'MODIFY `returnLoc` VARCHAR(191) CHARACTER SET ', @ccs, ' COLLATE ', @ccl, ' NOT NULL, ',
    'MODIFY `currency` VARCHAR(191) CHARACTER SET ', @ccs, ' COLLATE ', @ccl, ' NOT NULL'
  ),
  'SELECT 1'
);
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @fk FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = @dbname AND TABLE_NAME = 'SourceDailyRate' AND CONSTRAINT_NAME = 'SourceDailyRate_sourceId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY';
SET @q = IF(@fk = 0, 'ALTER TABLE `SourceDailyRate` ADD CONSTRAINT `SourceDailyRate_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
