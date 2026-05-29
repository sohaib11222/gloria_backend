-- Company location/branch endpoint configuration columns.
-- These fields exist in schema.prisma but were never added by a prior migration,
-- causing P2022 on production when Prisma selects Company.* / explicit columns.

SET @db := DATABASE();

-- branchEndpointFormat
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'Company' AND column_name = 'branchEndpointFormat'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `Company` ADD COLUMN `branchEndpointFormat` VARCHAR(191) NULL;',
  'SELECT ''Column branchEndpointFormat already exists'' AS message;'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- branchDefaultCountryCode
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'Company' AND column_name = 'branchDefaultCountryCode'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `Company` ADD COLUMN `branchDefaultCountryCode` VARCHAR(191) NULL;',
  'SELECT ''Column branchDefaultCountryCode already exists'' AS message;'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- locationEndpointUrl
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'Company' AND column_name = 'locationEndpointUrl'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `Company` ADD COLUMN `locationEndpointUrl` VARCHAR(191) NULL;',
  'SELECT ''Column locationEndpointUrl already exists'' AS message;'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- locationListEndpointUrl
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'Company' AND column_name = 'locationListEndpointUrl'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `Company` ADD COLUMN `locationListEndpointUrl` VARCHAR(191) NULL;',
  'SELECT ''Column locationListEndpointUrl already exists'' AS message;'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- locationListRequestRoot
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'Company' AND column_name = 'locationListRequestRoot'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `Company` ADD COLUMN `locationListRequestRoot` VARCHAR(191) NULL;',
  'SELECT ''Column locationListRequestRoot already exists'' AS message;'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- locationListAccountId
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'Company' AND column_name = 'locationListAccountId'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `Company` ADD COLUMN `locationListAccountId` VARCHAR(191) NULL;',
  'SELECT ''Column locationListAccountId already exists'' AS message;'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- locationListTransport
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = @db AND table_name = 'Company' AND column_name = 'locationListTransport'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE `Company` ADD COLUMN `locationListTransport` VARCHAR(191) NULL;',
  'SELECT ''Column locationListTransport already exists'' AS message;'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
