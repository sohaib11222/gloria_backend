-- Sync database state: Add missing tables and fields without losing data
-- This migration is idempotent - safe to run multiple times

-- Check and create ApiKey table if it doesn't exist
SET @table_exists = (SELECT COUNT(*) FROM information_schema.tables 
  WHERE table_schema = DATABASE() AND table_name = 'ApiKey');

SET @sql = IF(@table_exists = 0,
  'CREATE TABLE `ApiKey` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `ownerType` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `keyHash` VARCHAR(191) NOT NULL,
    `permissions` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `ApiKey_ownerType_ownerId_idx`(`ownerType`, `ownerId`),
    INDEX `ApiKey_status_createdAt_idx`(`status`, `createdAt`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;',
  'SELECT 1;');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Check and create WhitelistedIp table if it doesn't exist
SET @table_exists = (SELECT COUNT(*) FROM information_schema.tables 
  WHERE table_schema = DATABASE() AND table_name = 'WhitelistedIp');

SET @sql = IF(@table_exists = 0,
  'CREATE TABLE `WhitelistedIp` (
    `id` VARCHAR(191) NOT NULL,
    `ip` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE INDEX `WhitelistedIp_ip_type_key`(`ip`, `type`),
    INDEX `WhitelistedIp_enabled_idx`(`enabled`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;',
  'SELECT 1;');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add emailOtp to Company if it doesn't exist
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Company' AND COLUMN_NAME = 'emailOtp');
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE `Company` ADD COLUMN `emailOtp` VARCHAR(191) NULL;', 
  'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add emailOtpExpires to Company if it doesn't exist
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Company' AND COLUMN_NAME = 'emailOtpExpires');
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE `Company` ADD COLUMN `emailOtpExpires` DATETIME(3) NULL;', 
  'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add emailVerified to Company if it doesn't exist
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS 
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Company' AND COLUMN_NAME = 'emailVerified');
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE `Company` ADD COLUMN `emailVerified` BOOLEAN NOT NULL DEFAULT false;', 
  'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Fix Booking.updatedAt default (remove default to match schema)
-- Note: This is safe - existing rows keep their values, new rows will use updatedAt trigger
ALTER TABLE `Booking` MODIFY COLUMN `updatedAt` DATETIME(3) NOT NULL;

-- Fix Branch.updatedAt default if needed
ALTER TABLE `Branch` MODIFY COLUMN `updatedAt` DATETIME(3) NOT NULL;

-- Fix EchoJob.updatedAt default if needed  
ALTER TABLE `EchoJob` MODIFY COLUMN `updatedAt` DATETIME(3) NOT NULL;

