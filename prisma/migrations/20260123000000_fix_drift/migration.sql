-- Fix migration drift
-- This migration fixes the differences between the database state and migration history

-- 1. Ensure adapterType is nullable (already nullable in database)
-- This is a no-op if already nullable, but ensures consistency
ALTER TABLE `Company` MODIFY COLUMN `adapterType` VARCHAR(191) NULL;

-- 2. Ensure index on availabilityRequestId exists (already exists in database)
-- This is idempotent - will not fail if index already exists
SET @index_exists = (SELECT COUNT(*) FROM information_schema.statistics 
  WHERE table_schema = DATABASE() 
  AND table_name = 'Booking' 
  AND index_name = 'Booking_availabilityRequestId_idx');
SET @sql = IF(@index_exists = 0, 
  'CREATE INDEX `Booking_availabilityRequestId_idx` ON `Booking`(`availabilityRequestId`);',
  'SELECT "Index already exists" AS message;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. Ensure strike fields exist in SourceHealth (already exist in database)
-- This is idempotent - will not fail if columns already exist
SET @strike_count_exists = (SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
  AND table_name = 'SourceHealth' 
  AND column_name = 'strikeCount');
SET @strike_at_exists = (SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
  AND table_name = 'SourceHealth' 
  AND column_name = 'lastStrikeAt');
SET @sql2 = IF(@strike_count_exists = 0, 
  'ALTER TABLE `SourceHealth` ADD COLUMN `strikeCount` INTEGER NOT NULL DEFAULT 0;',
  'SELECT "Column strikeCount already exists" AS message;');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
SET @sql3 = IF(@strike_at_exists = 0, 
  'ALTER TABLE `SourceHealth` ADD COLUMN `lastStrikeAt` DATETIME(3) NULL;',
  'SELECT "Column lastStrikeAt already exists" AS message;');
PREPARE stmt3 FROM @sql3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;
