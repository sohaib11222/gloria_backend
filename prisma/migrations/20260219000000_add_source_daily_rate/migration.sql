-- CreateTable SourceDailyRate
CREATE TABLE `SourceDailyRate` (
    `id` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `pickupDate` DATE NOT NULL,
    `acrissCode` VARCHAR(191) NOT NULL,
    `pickupLoc` VARCHAR(191) NOT NULL,
    `returnLoc` VARCHAR(191) NOT NULL,
    `dayOffset` INTEGER NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'EUR',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SourceDailyRate_dims_key`(`sourceId`, `pickupDate`, `acrissCode`, `pickupLoc`, `returnLoc`, `dayOffset`),
    INDEX `SourceDailyRate_sourceId_pickupDate_idx`(`sourceId`, `pickupDate`),
    INDEX `SourceDailyRate_sourceId_acrissCode_idx`(`sourceId`, `acrissCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SourceDailyRate` ADD CONSTRAINT `SourceDailyRate_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
