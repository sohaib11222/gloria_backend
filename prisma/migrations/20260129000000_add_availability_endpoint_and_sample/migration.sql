-- AlterTable
ALTER TABLE `Company` ADD COLUMN `availabilityEndpointUrl` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `SourceAvailabilitySample` (
    `id` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `criteriaHash` VARCHAR(191) NOT NULL,
    `pickupIso` VARCHAR(191) NULL,
    `returnIso` VARCHAR(191) NULL,
    `pickupLoc` VARCHAR(191) NULL,
    `returnLoc` VARCHAR(191) NULL,
    `offersCount` INTEGER NOT NULL DEFAULT 0,
    `sampleJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SourceAvailabilitySample_sourceId_criteriaHash_key`(`sourceId`, `criteriaHash`),
    INDEX `SourceAvailabilitySample_sourceId_idx`(`sourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SourceAvailabilitySample` ADD CONSTRAINT `SourceAvailabilitySample_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
