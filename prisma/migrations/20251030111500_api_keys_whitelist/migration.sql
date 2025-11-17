-- [AUTO-AUDIT] Create ApiKey and WhitelistedIp tables
CREATE TABLE `ApiKey` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `ownerType` VARCHAR(50) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `key` VARCHAR(512) NOT NULL,
  `permissions` JSON NOT NULL,
  `status` VARCHAR(50) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `ApiKey_ownerType_ownerId_idx` ON `ApiKey`(`ownerType`, `ownerId`);
CREATE INDEX `ApiKey_status_createdAt_idx` ON `ApiKey`(`status`, `createdAt`);

CREATE TABLE `WhitelistedIp` (
  `id` VARCHAR(191) NOT NULL,
  `ip` VARCHAR(191) NOT NULL,
  `type` VARCHAR(50) NOT NULL,
  `enabled` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `WhitelistedIp_ip_type_key` (`ip`, `type`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `WhitelistedIp_enabled_idx` ON `WhitelistedIp`(`enabled`);


