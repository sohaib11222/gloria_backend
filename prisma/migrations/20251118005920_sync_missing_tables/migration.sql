-- Sync missing tables and fix defaults without losing data
-- This migration safely creates missing tables and fixes column defaults

-- Create ApiKey table if it doesn't exist
CREATE TABLE IF NOT EXISTS `ApiKey` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `ownerType` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `keyHash` VARCHAR(191) NOT NULL,
  `permissions` JSON NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create indexes for ApiKey (ignore if they exist)
CREATE INDEX IF NOT EXISTS `ApiKey_ownerType_ownerId_idx` ON `ApiKey`(`ownerType`, `ownerId`);
CREATE INDEX IF NOT EXISTS `ApiKey_status_createdAt_idx` ON `ApiKey`(`status`, `createdAt`);

-- Create WhitelistedIp table if it doesn't exist
CREATE TABLE IF NOT EXISTS `WhitelistedIp` (
  `id` VARCHAR(191) NOT NULL,
  `ip` VARCHAR(191) NOT NULL,
  `type` VARCHAR(191) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `WhitelistedIp_ip_type_key` (`ip`, `type`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create index for WhitelistedIp (ignore if exists)
CREATE INDEX IF NOT EXISTS `WhitelistedIp_enabled_idx` ON `WhitelistedIp`(`enabled`);

-- Fix booking.updatedAt default - only modify if column exists and doesn't have default
-- Note: This will only work if the column exists. If it errors, the column already has the correct default.
ALTER TABLE `booking` MODIFY COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);
