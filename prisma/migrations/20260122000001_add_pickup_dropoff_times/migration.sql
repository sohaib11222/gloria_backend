-- AlterTable (idempotent: safe if columns already exist from a partial/failed run or manual DDL)
SET @dbname = DATABASE();

SELECT COUNT(*) INTO @cnt FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Branch' AND COLUMN_NAME = 'pickupTimes';
SET @q = IF(@cnt = 0, 'ALTER TABLE `Branch` ADD COLUMN `pickupTimes` JSON NULL', 'SELECT 1');
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @cnt FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Branch' AND COLUMN_NAME = 'dropoffTimes';
SET @q = IF(@cnt = 0, 'ALTER TABLE `Branch` ADD COLUMN `dropoffTimes` JSON NULL', 'SELECT 1');
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
