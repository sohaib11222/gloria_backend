-- Company registration profile columns (idempotent)
SET @dbname = DATABASE();

SELECT COUNT(*) INTO @cnt FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Company' AND COLUMN_NAME = 'registrationBranchName';
SET @q = IF(@cnt = 0, 'ALTER TABLE `Company` ADD COLUMN `registrationBranchName` VARCHAR(191) NULL', 'SELECT 1');
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @cnt FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Company' AND COLUMN_NAME = 'companyAddress';
SET @q = IF(@cnt = 0, 'ALTER TABLE `Company` ADD COLUMN `companyAddress` TEXT NULL', 'SELECT 1');
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @cnt FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Company' AND COLUMN_NAME = 'companyWebsiteUrl';
SET @q = IF(@cnt = 0, 'ALTER TABLE `Company` ADD COLUMN `companyWebsiteUrl` VARCHAR(500) NULL', 'SELECT 1');
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
