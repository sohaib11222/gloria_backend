-- AlterTable
ALTER TABLE `booking` ADD COLUMN `availabilityRequestId` VARCHAR(191) NULL,
    ADD COLUMN `customerInfoJson` JSON NULL,
    ADD COLUMN `driverAge` INTEGER NULL,
    ADD COLUMN `dropoffDateTime` DATETIME(3) NULL,
    ADD COLUMN `dropoffUnlocode` VARCHAR(191) NULL,
    ADD COLUMN `paymentInfoJson` JSON NULL,
    ADD COLUMN `pickupDateTime` DATETIME(3) NULL,
    ADD COLUMN `pickupUnlocode` VARCHAR(191) NULL,
    ADD COLUMN `ratePlanCode` VARCHAR(191) NULL,
    ADD COLUMN `residencyCountry` VARCHAR(191) NULL,
    ADD COLUMN `vehicleClass` VARCHAR(191) NULL,
    ADD COLUMN `vehicleMakeModel` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Booking_availabilityRequestId_idx` ON `Booking`(`availabilityRequestId`);
