-- Optional registration photo path (SOURCE self-registration)
SET @dbname = DATABASE();

SELECT COUNT(*) INTO @cnt FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Company' AND COLUMN_NAME = 'registrationPhotoUrl';
SET @q = IF(@cnt = 0, 'ALTER TABLE `Company` ADD COLUMN `registrationPhotoUrl` VARCHAR(500) NULL', 'SELECT 1');
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
