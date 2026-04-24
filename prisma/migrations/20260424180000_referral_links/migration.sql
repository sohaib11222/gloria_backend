-- ReferralLink: admin-defined slugs for tracked agent/source self-registration
CREATE TABLE `ReferralLink` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `label` VARCHAR(255) NULL,
    `restrictToType` ENUM('AGENT', 'SOURCE') NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ReferralLink_slug_key`(`slug`),
    INDEX `ReferralLink_slug_idx`(`slug`),
    INDEX `ReferralLink_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Company` ADD COLUMN `referralLinkId` VARCHAR(191) NULL;

CREATE INDEX `Company_referralLinkId_idx` ON `Company`(`referralLinkId`);

ALTER TABLE `Company` ADD CONSTRAINT `Company_referralLinkId_fkey` FOREIGN KEY (`referralLinkId`) REFERENCES `ReferralLink`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
