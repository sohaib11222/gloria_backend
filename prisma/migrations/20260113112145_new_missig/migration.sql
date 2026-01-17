-- AlterTable
-- Note: Columns may already exist, but Prisma will handle this safely
ALTER TABLE `Booking` ADD COLUMN IF NOT EXISTS `availabilityRequestId` VARCHAR(191) NULL,
    ADD COLUMN IF NOT EXISTS `customerInfoJson` JSON NULL,
    ADD COLUMN IF NOT EXISTS `driverAge` INTEGER NULL,
    ADD COLUMN IF NOT EXISTS `dropoffDateTime` DATETIME(3) NULL,
    ADD COLUMN IF NOT EXISTS `dropoffUnlocode` VARCHAR(191) NULL,
    ADD COLUMN IF NOT EXISTS `paymentInfoJson` JSON NULL,
    ADD COLUMN IF NOT EXISTS `pickupDateTime` DATETIME(3) NULL,
    ADD COLUMN IF NOT EXISTS `pickupUnlocode` VARCHAR(191) NULL,
    ADD COLUMN IF NOT EXISTS `ratePlanCode` VARCHAR(191) NULL,
    ADD COLUMN IF NOT EXISTS `residencyCountry` VARCHAR(191) NULL,
    ADD COLUMN IF NOT EXISTS `vehicleClass` VARCHAR(191) NULL,
    ADD COLUMN IF NOT EXISTS `vehicleMakeModel` VARCHAR(191) NULL;

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
