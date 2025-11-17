-- CreateTable
CREATE TABLE `SourceHealth` (
    `id` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `slowCount` INTEGER NOT NULL DEFAULT 0,
    `sampleCount` INTEGER NOT NULL DEFAULT 0,
    `slowRate` DOUBLE NOT NULL DEFAULT 0.0,
    `backoffLevel` INTEGER NOT NULL DEFAULT 0,
    `excludedUntil` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SourceHealth_sourceId_key`(`sourceId`),
    INDEX `SourceHealth_sourceId_idx`(`sourceId`),
    INDEX `SourceHealth_excludedUntil_idx`(`excludedUntil`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
