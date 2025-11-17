-- Fix column types and defaults to match schema without losing data

-- Fix ApiKey table: change key to keyHash if it exists, or ensure keyHash exists
-- First check if 'key' column exists and rename it, or add keyHash
SET @has_key = (SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() AND table_name = 'ApiKey' AND column_name = 'key');
SET @has_keyHash = (SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() AND table_name = 'ApiKey' AND column_name = 'keyHash');

-- If has 'key' but not 'keyHash', rename it
SET @sql = IF(@has_key > 0 AND @has_keyHash = 0,
  'ALTER TABLE `ApiKey` CHANGE COLUMN `key` `keyHash` VARCHAR(191) NOT NULL;',
  'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- If has neither, add keyHash (shouldn't happen but safe)
SET @sql = IF(@has_key = 0 AND @has_keyHash = 0,
  'ALTER TABLE `ApiKey` ADD COLUMN `keyHash` VARCHAR(191) NOT NULL DEFAULT "";',
  'SELECT 1;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Fix ApiKey column types to match schema (VARCHAR(191))
ALTER TABLE `ApiKey` MODIFY COLUMN `ownerType` VARCHAR(191) NOT NULL;
ALTER TABLE `ApiKey` MODIFY COLUMN `status` VARCHAR(191) NOT NULL;
ALTER TABLE `ApiKey` MODIFY COLUMN `permissions` JSON NOT NULL;

-- Fix WhitelistedIp column type
ALTER TABLE `WhitelistedIp` MODIFY COLUMN `type` VARCHAR(191) NOT NULL;

-- Fix booking.updatedAt default
ALTER TABLE `booking` MODIFY COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

-- Fix branch.updatedAt default (if it doesn't have one)
ALTER TABLE `branch` MODIFY COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

-- Fix echojob.updatedAt default (if it doesn't have one)
ALTER TABLE `echojob` MODIFY COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);

