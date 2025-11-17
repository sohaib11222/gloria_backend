-- Add v0.3 features: companyCode, approvalStatus, whitelistedDomains, Branch, EchoJob, EchoItem
-- Also add missing fields that exist in DB but not in migrations

-- Add ApprovalStatus enum if needed
SET @enum_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() 
  AND TABLE_NAME = 'Company' 
  AND COLUMN_NAME = 'approvalStatus');

SET @sql = IF(@enum_exists = 0,
  'ALTER TABLE `Company` ADD COLUMN `approvalStatus` ENUM(''PENDING'', ''APPROVED'', ''REJECTED'') NOT NULL DEFAULT ''PENDING'';',
  'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add Company fields
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Company' AND COLUMN_NAME = 'companyCode');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE `Company` ADD COLUMN `companyCode` VARCHAR(191) NULL;', 'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Company' AND COLUMN_NAME = 'whitelistedDomains');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE `Company` ADD COLUMN `whitelistedDomains` TEXT NULL;', 'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Company' AND COLUMN_NAME = 'httpEndpoint');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE `Company` ADD COLUMN `httpEndpoint` VARCHAR(191) NULL;', 'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Company' AND COLUMN_NAME = 'tlsProfile');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE `Company` ADD COLUMN `tlsProfile` JSON NULL;', 'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Company' AND COLUMN_NAME = 'vendorMetadata');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE `Company` ADD COLUMN `vendorMetadata` JSON NULL;', 'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add unique index on companyCode
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Company' AND INDEX_NAME = 'Company_companyCode_key');
SET @sql = IF(@idx_exists = 0, 'CREATE UNIQUE INDEX `Company_companyCode_key` ON `Company`(`companyCode`);', 'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add Booking fields (if they don't exist)
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Booking' AND COLUMN_NAME = 'agentBookingRef');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE `Booking` ADD COLUMN `agentBookingRef` VARCHAR(191) NULL;', 'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Booking' AND COLUMN_NAME = 'idempotencyKey');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE `Booking` ADD COLUMN `idempotencyKey` VARCHAR(191) NULL;', 'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Booking' AND COLUMN_NAME = 'updatedAt');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE `Booking` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);', 'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add Booking unique index
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Booking' AND INDEX_NAME = 'Booking_agentId_idempotencyKey_key');
SET @sql = IF(@idx_exists = 0, 'CREATE UNIQUE INDEX `Booking_agentId_idempotencyKey_key` ON `Booking`(`agentId`, `idempotencyKey`);', 'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add SourceHealth fields
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SourceHealth' AND COLUMN_NAME = 'lastResetBy');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE `SourceHealth` ADD COLUMN `lastResetBy` VARCHAR(191) NULL;', 'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SourceHealth' AND COLUMN_NAME = 'lastResetAt');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE `SourceHealth` ADD COLUMN `lastResetAt` DATETIME(3) NULL;', 'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Create Branch table
SET @table_exists = (SELECT COUNT(*) FROM information_schema.tables 
  WHERE table_schema = DATABASE() AND table_name = 'Branch');
SET @sql = IF(@table_exists = 0, 
  'CREATE TABLE `Branch` (
    `id` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `agreementId` VARCHAR(191) NULL,
    `branchCode` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NULL,
    `locationType` VARCHAR(191) NULL,
    `collectionType` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `addressLine` TEXT NULL,
    `city` VARCHAR(191) NULL,
    `postalCode` VARCHAR(191) NULL,
    `country` VARCHAR(191) NULL,
    `countryCode` VARCHAR(191) NULL,
    `natoLocode` VARCHAR(191) NULL,
    `rawJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `Branch_sourceId_branchCode_key`(`sourceId`, `branchCode`),
    INDEX `Branch_sourceId_idx`(`sourceId`),
    INDEX `Branch_agreementId_idx`(`agreementId`),
    INDEX `Branch_natoLocode_idx`(`natoLocode`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;',
  'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Create EchoJobStatus enum and EchoJob table
SET @table_exists = (SELECT COUNT(*) FROM information_schema.tables 
  WHERE table_schema = DATABASE() AND table_name = 'EchoJob');
SET @sql = IF(@table_exists = 0,
  'CREATE TABLE `EchoJob` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `agreementId` VARCHAR(191) NULL,
    `status` ENUM(''IN_PROGRESS'', ''COMPLETE'') NOT NULL DEFAULT ''IN_PROGRESS'',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `totalExpected` INTEGER NOT NULL DEFAULT 0,
    `responsesReceived` INTEGER NOT NULL DEFAULT 0,
    `timedOutSources` INTEGER NOT NULL DEFAULT 0,
    `lastSeq` BIGINT NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `EchoJob_requestId_key`(`requestId`),
    INDEX `EchoJob_agentId_status_createdAt_idx`(`agentId`, `status`, `createdAt`),
    INDEX `EchoJob_requestId_idx`(`requestId`),
    INDEX `EchoJob_expiresAt_idx`(`expiresAt`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;',
  'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Create EchoItem table
SET @table_exists = (SELECT COUNT(*) FROM information_schema.tables 
  WHERE table_schema = DATABASE() AND table_name = 'EchoItem');
SET @sql = IF(@table_exists = 0,
  'CREATE TABLE `EchoItem` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `seq` BIGINT NOT NULL,
    `echoedMessage` TEXT NOT NULL,
    `echoedAttrs` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `EchoItem_requestId_seq_key`(`requestId`, `seq`),
    INDEX `EchoItem_requestId_seq_idx`(`requestId`, `seq`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;',
  'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add foreign key constraints (if they don't exist)
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Branch' AND CONSTRAINT_NAME = 'Branch_sourceId_fkey');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE `Branch` ADD CONSTRAINT `Branch_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;',
  'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'EchoJob' AND CONSTRAINT_NAME = 'EchoJob_agentId_fkey');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE `EchoJob` ADD CONSTRAINT `EchoJob_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;',
  'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists = (SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'EchoItem' AND CONSTRAINT_NAME = 'EchoItem_requestId_fkey');
SET @sql = IF(@fk_exists = 0,
  'ALTER TABLE `EchoItem` ADD CONSTRAINT `EchoItem_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `EchoJob`(`requestId`) ON DELETE CASCADE ON UPDATE CASCADE;',
  'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
