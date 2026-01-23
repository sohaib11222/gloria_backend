-- AlterTable
-- Columns already exist in database, but migration must match original applied state
-- Using conditional logic to make idempotent
SET @col_exists = (SELECT COUNT(*) FROM information_schema.columns 
  WHERE table_schema = DATABASE() 
  AND table_name = 'Booking' 
  AND column_name = 'availabilityRequestId');
SET @sql = IF(@col_exists = 0, 
  'ALTER TABLE `Booking` ADD COLUMN `availabilityRequestId` VARCHAR(191) NULL, ADD COLUMN `customerInfoJson` JSON NULL, ADD COLUMN `driverAge` INTEGER NULL, ADD COLUMN `dropoffDateTime` DATETIME(3) NULL, ADD COLUMN `dropoffUnlocode` VARCHAR(191) NULL, ADD COLUMN `paymentInfoJson` JSON NULL, ADD COLUMN `pickupDateTime` DATETIME(3) NULL, ADD COLUMN `pickupUnlocode` VARCHAR(191) NULL, ADD COLUMN `ratePlanCode` VARCHAR(191) NULL, ADD COLUMN `residencyCountry` VARCHAR(191) NULL, ADD COLUMN `vehicleClass` VARCHAR(191) NULL, ADD COLUMN `vehicleMakeModel` VARCHAR(191) NULL;',
  'SELECT "Columns already exist" AS message;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- CreateIndex
-- Check if index exists before creating
SET @index_exists = (SELECT COUNT(*) FROM information_schema.statistics 
  WHERE table_schema = 'car_hire_mw' 
  AND table_name = 'Booking' 
  AND index_name = 'Booking_availabilityRequestId_idx');
SET @sql = IF(@index_exists = 0, 
  'CREATE INDEX `Booking_availabilityRequestId_idx` ON `Booking`(`availabilityRequestId`);',
  'SELECT "Index already exists" AS message;');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
