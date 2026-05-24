-- CreateTable
CREATE TABLE `SourceFleet` (
    `id` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `fleetCode` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
    `acrissCodes` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SourceFleet_sourceId_fleetCode_key`(`sourceId`, `fleetCode`),
    INDEX `SourceFleet_sourceId_idx`(`sourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SourceFleetBranch` (
    `id` VARCHAR(191) NOT NULL,
    `fleetId` VARCHAR(191) NOT NULL,
    `branchId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `SourceFleetBranch_fleetId_branchId_key`(`fleetId`, `branchId`),
    INDEX `SourceFleetBranch_fleetId_idx`(`fleetId`),
    INDEX `SourceFleetBranch_branchId_idx`(`branchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SourceFleet` ADD CONSTRAINT `SourceFleet_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SourceFleetBranch` ADD CONSTRAINT `SourceFleetBranch_fleetId_fkey` FOREIGN KEY (`fleetId`) REFERENCES `SourceFleet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SourceFleetBranch` ADD CONSTRAINT `SourceFleetBranch_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
