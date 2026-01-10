-- CreateTable
CREATE TABLE `Company` (
    `id` VARCHAR(191) NOT NULL,
    `companyName` VARCHAR(191) NOT NULL,
    `type` ENUM('AGENT', 'SOURCE') NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'PENDING_VERIFICATION',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `emailVerified` BOOLEAN NOT NULL DEFAULT false,
    `emailOtp` VARCHAR(191) NULL,
    `emailOtpExpires` DATETIME(3) NULL,
    `companyCode` VARCHAR(191) NULL,
    `approvalStatus` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `whitelistedDomains` TEXT NULL,
    `adapterType` VARCHAR(191) NOT NULL DEFAULT 'mock',
    `grpcEndpoint` VARCHAR(191) NULL,
    `httpEndpoint` VARCHAR(191) NULL,
    `tlsProfile` JSON NULL,
    `vendorMetadata` JSON NULL,

    UNIQUE INDEX `Company_email_key`(`email`),
    UNIQUE INDEX `Company_companyCode_key`(`companyCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'AGENT_USER', 'SOURCE_USER') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Agreement` (
    `id` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `agreementRef` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'OFFERED', 'ACCEPTED', 'ACTIVE', 'SUSPENDED', 'EXPIRED') NOT NULL DEFAULT 'DRAFT',
    `validFrom` DATETIME(3) NULL,
    `validTo` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Agreement_agentId_status_createdAt_idx`(`agentId`, `status`, `createdAt`),
    INDEX `Agreement_sourceId_status_createdAt_idx`(`sourceId`, `status`, `createdAt`),
    UNIQUE INDEX `Agreement_sourceId_agreementRef_key`(`sourceId`, `agreementRef`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UNLocode` (
    `unlocode` VARCHAR(191) NOT NULL,
    `country` VARCHAR(191) NOT NULL,
    `place` VARCHAR(191) NOT NULL,
    `iataCode` VARCHAR(191) NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,

    INDEX `UNLocode_country_idx`(`country`),
    INDEX `UNLocode_place_idx`(`place`),
    PRIMARY KEY (`unlocode`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SourceLocation` (
    `id` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `unlocode` VARCHAR(191) NOT NULL,

    INDEX `SourceLocation_sourceId_idx`(`sourceId`),
    UNIQUE INDEX `SourceLocation_sourceId_unlocode_key`(`sourceId`, `unlocode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgreementLocationOverride` (
    `id` VARCHAR(191) NOT NULL,
    `agreementId` VARCHAR(191) NOT NULL,
    `unlocode` VARCHAR(191) NOT NULL,
    `allowed` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `AgreementLocationOverride_agreementId_unlocode_key`(`agreementId`, `unlocode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AvailabilityJob` (
    `id` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `criteriaJson` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'RUNNING',
    `expectedSources` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AvailabilityJob_agentId_idx`(`agentId`),
    INDEX `AvailabilityJob_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AvailabilityResult` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `seq` INTEGER NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `offerJson` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AvailabilityResult_jobId_seq_idx`(`jobId`, `seq`),
    UNIQUE INDEX `AvailabilityResult_jobId_seq_key`(`jobId`, `seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Booking` (
    `id` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `agreementRef` VARCHAR(191) NOT NULL,
    `supplierBookingRef` VARCHAR(191) NULL,
    `agentBookingRef` VARCHAR(191) NULL,
    `idempotencyKey` VARCHAR(191) NULL,
    `status` ENUM('REQUESTED', 'CONFIRMED', 'CANCELLED', 'FAILED') NOT NULL DEFAULT 'REQUESTED',
    `payloadJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Booking_agentId_agreementRef_createdAt_idx`(`agentId`, `agreementRef`, `createdAt`),
    INDEX `Booking_sourceId_supplierBookingRef_idx`(`sourceId`, `supplierBookingRef`),
    UNIQUE INDEX `Booking_agentId_idempotencyKey_key`(`agentId`, `idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_companyId_createdAt_idx`(`companyId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `direction` VARCHAR(191) NOT NULL,
    `endpoint` VARCHAR(191) NULL,
    `requestId` VARCHAR(191) NULL,
    `companyId` VARCHAR(191) NULL,
    `sourceId` VARCHAR(191) NULL,
    `agreementRef` VARCHAR(191) NULL,
    `httpStatus` INTEGER NULL,
    `grpcStatus` INTEGER NULL,
    `maskedRequest` TEXT NULL,
    `maskedResponse` TEXT NULL,
    `durationMs` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    INDEX `AuditLog_companyId_createdAt_idx`(`companyId`, `createdAt`),
    INDEX `AuditLog_sourceId_createdAt_idx`(`sourceId`, `createdAt`),
    INDEX `AuditLog_endpoint_createdAt_idx`(`endpoint`, `createdAt`),
    INDEX `AuditLog_requestId_idx`(`requestId`),
    INDEX `AuditLog_agreementRef_createdAt_idx`(`agreementRef`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VerificationReport` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `passed` BOOLEAN NOT NULL,
    `reportJson` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApiKey` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `ownerType` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `keyHash` VARCHAR(191) NOT NULL,
    `permissions` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ApiKey_ownerType_ownerId_idx`(`ownerType`, `ownerId`),
    INDEX `ApiKey_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WhitelistedIp` (
    `id` VARCHAR(191) NOT NULL,
    `ip` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WhitelistedIp_enabled_idx`(`enabled`),
    UNIQUE INDEX `WhitelistedIp_ip_type_key`(`ip`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IdempotencyKey` (
    `id` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `responseHash` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `agent_scope_key_unique`(`agentId`, `scope`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SourceHealth` (
    `id` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `slowCount` INTEGER NOT NULL DEFAULT 0,
    `sampleCount` INTEGER NOT NULL DEFAULT 0,
    `slowRate` DOUBLE NOT NULL DEFAULT 0.0,
    `backoffLevel` INTEGER NOT NULL DEFAULT 0,
    `excludedUntil` DATETIME(3) NULL,
    `lastResetBy` VARCHAR(191) NULL,
    `lastResetAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SourceHealth_sourceId_key`(`sourceId`),
    INDEX `SourceHealth_sourceId_idx`(`sourceId`),
    INDEX `SourceHealth_excludedUntil_idx`(`excludedUntil`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Branch` (
    `id` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `agreementId` VARCHAR(191) NULL,
    `branchCode` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NULL,
    `locationType` VARCHAR(191) NULL,
    `collectionType` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `addressLine` TEXT NULL,
    `city` VARCHAR(191) NULL,
    `postalCode` VARCHAR(191) NULL,
    `country` VARCHAR(191) NULL,
    `countryCode` VARCHAR(191) NULL,
    `natoLocode` VARCHAR(191) NULL,
    `rawJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Branch_sourceId_idx`(`sourceId`),
    INDEX `Branch_agreementId_idx`(`agreementId`),
    INDEX `Branch_natoLocode_idx`(`natoLocode`),
    UNIQUE INDEX `Branch_sourceId_branchCode_key`(`sourceId`, `branchCode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EchoJob` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `agreementId` VARCHAR(191) NULL,
    `status` ENUM('IN_PROGRESS', 'COMPLETE') NOT NULL DEFAULT 'IN_PROGRESS',
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `totalExpected` INTEGER NOT NULL DEFAULT 0,
    `responsesReceived` INTEGER NOT NULL DEFAULT 0,
    `timedOutSources` INTEGER NOT NULL DEFAULT 0,
    `lastSeq` BIGINT NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EchoJob_requestId_key`(`requestId`),
    INDEX `EchoJob_agentId_status_createdAt_idx`(`agentId`, `status`, `createdAt`),
    INDEX `EchoJob_requestId_idx`(`requestId`),
    INDEX `EchoJob_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EchoItem` (
    `id` VARCHAR(191) NOT NULL,
    `requestId` VARCHAR(191) NOT NULL,
    `seq` BIGINT NOT NULL,
    `echoedMessage` TEXT NOT NULL,
    `echoedAttrs` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EchoItem_requestId_seq_idx`(`requestId`, `seq`),
    UNIQUE INDEX `EchoItem_requestId_seq_key`(`requestId`, `seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LocationRequest` (
    `id` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `locationName` VARCHAR(191) NOT NULL,
    `country` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NULL,
    `address` TEXT NULL,
    `iataCode` VARCHAR(191) NULL,
    `reason` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `adminNotes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `reviewedBy` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,

    INDEX `LocationRequest_sourceId_idx`(`sourceId`),
    INDEX `LocationRequest_status_idx`(`status`),
    INDEX `LocationRequest_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Agreement` ADD CONSTRAINT `Agreement_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Agreement` ADD CONSTRAINT `Agreement_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SourceLocation` ADD CONSTRAINT `SourceLocation_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SourceLocation` ADD CONSTRAINT `SourceLocation_unlocode_fkey` FOREIGN KEY (`unlocode`) REFERENCES `UNLocode`(`unlocode`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgreementLocationOverride` ADD CONSTRAINT `AgreementLocationOverride_agreementId_fkey` FOREIGN KEY (`agreementId`) REFERENCES `Agreement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgreementLocationOverride` ADD CONSTRAINT `AgreementLocationOverride_unlocode_fkey` FOREIGN KEY (`unlocode`) REFERENCES `UNLocode`(`unlocode`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AvailabilityResult` ADD CONSTRAINT `AvailabilityResult_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `AvailabilityJob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Branch` ADD CONSTRAINT `Branch_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EchoJob` ADD CONSTRAINT `EchoJob_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EchoItem` ADD CONSTRAINT `EchoItem_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `EchoJob`(`requestId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LocationRequest` ADD CONSTRAINT `LocationRequest_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
