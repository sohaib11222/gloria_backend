-- CreateTable
CREATE TABLE `BookingHistory` (
    `id` VARCHAR(191) NOT NULL,
    `bookingId` VARCHAR(191) NOT NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `changes` JSON NULL,
    `beforeState` JSON NULL,
    `afterState` JSON NULL,
    `userId` VARCHAR(191) NULL,
    `source` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BookingHistory_bookingId_timestamp_idx`(`bookingId`, `timestamp`),
    INDEX `BookingHistory_bookingId_eventType_idx`(`bookingId`, `eventType`),
    INDEX `BookingHistory_timestamp_idx`(`timestamp`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

