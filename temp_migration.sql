-- DropForeignKey
ALTER TABLE `User` DROP FOREIGN KEY `User_companyId_fkey`;

-- DropForeignKey
ALTER TABLE `Agreement` DROP FOREIGN KEY `Agreement_agentId_fkey`;

-- DropForeignKey
ALTER TABLE `Agreement` DROP FOREIGN KEY `Agreement_sourceId_fkey`;

-- DropForeignKey
ALTER TABLE `SourceLocation` DROP FOREIGN KEY `SourceLocation_sourceId_fkey`;

-- DropForeignKey
ALTER TABLE `SourceLocation` DROP FOREIGN KEY `SourceLocation_unlocode_fkey`;

-- DropForeignKey
ALTER TABLE `AgreementLocationOverride` DROP FOREIGN KEY `AgreementLocationOverride_agreementId_fkey`;

-- DropForeignKey
ALTER TABLE `AgreementLocationOverride` DROP FOREIGN KEY `AgreementLocationOverride_unlocode_fkey`;

-- DropForeignKey
ALTER TABLE `AvailabilityResult` DROP FOREIGN KEY `AvailabilityResult_jobId_fkey`;

-- DropForeignKey
ALTER TABLE `Branch` DROP FOREIGN KEY `Branch_sourceId_fkey`;

-- DropForeignKey
ALTER TABLE `EchoJob` DROP FOREIGN KEY `EchoJob_agentId_fkey`;

-- DropForeignKey
ALTER TABLE `EchoItem` DROP FOREIGN KEY `EchoItem_requestId_fkey`;

-- DropTable
DROP TABLE `Company`;

-- DropTable
DROP TABLE `User`;

-- DropTable
DROP TABLE `Agreement`;

-- DropTable
DROP TABLE `UNLocode`;

-- DropTable
DROP TABLE `SourceLocation`;

-- DropTable
DROP TABLE `AgreementLocationOverride`;

-- DropTable
DROP TABLE `AvailabilityJob`;

-- DropTable
DROP TABLE `AvailabilityResult`;

-- DropTable
DROP TABLE `Booking`;

-- DropTable
DROP TABLE `Notification`;

-- DropTable
DROP TABLE `AuditLog`;

-- DropTable
DROP TABLE `VerificationReport`;

-- DropTable
DROP TABLE `ApiKey`;

-- DropTable
DROP TABLE `WhitelistedIp`;

-- DropTable
DROP TABLE `IdempotencyKey`;

-- DropTable
DROP TABLE `SourceHealth`;

-- DropTable
DROP TABLE `Branch`;

-- DropTable
DROP TABLE `EchoJob`;

-- DropTable
DROP TABLE `EchoItem`;

-- CreateTable
CREATE TABLE `agreement` (
    `id` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `agreementRef` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'OFFERED', 'ACCEPTED', 'ACTIVE', 'SUSPENDED', 'EXPIRED') NOT NULL DEFAULT 'DRAFT',
    `validFrom` DATETIME(3) NULL,
    `validTo` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Agreement_agentId_status_createdAt_idx`(`agentId` ASC, `status` ASC, `createdAt` ASC),
    UNIQUE INDEX `Agreement_sourceId_agreementRef_key`(`sourceId` ASC, `agreementRef` ASC),
    INDEX `Agreement_sourceId_status_createdAt_idx`(`sourceId` ASC, `status` ASC, `createdAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agreementlocationoverride` (
    `id` VARCHAR(191) NOT NULL,
    `agreementId` VARCHAR(191) NOT NULL,
    `unlocode` VARCHAR(191) NOT NULL,
    `allowed` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `AgreementLocationOverride_agreementId_unlocode_key`(`agreementId` ASC, `unlocode` ASC),
    INDEX `AgreementLocationOverride_unlocode_fkey`(`unlocode` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auditlog` (
    `id` VARCHAR(191) NOT NULL,
    `direction` VARCHAR(191) NOT NULL,
    `endpoint` VARCHAR(191) NULL,
    `requestId` VARCHAR(191) NULL,
    `companyId` VARCHAR(191) NULL,
    `sourceId` VARCHAR(191) NULL,
    `agreementRef` VARCHAR(191) NULL,
    `httpStatus` INTEGER NULL,
    `grpcStatus` INTEGER NULL,
    `maskedRequest` VARCHAR(191) NULL,
    `maskedResponse` VARCHAR(191) NULL,
    `durationMs` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_agreementRef_createdAt_idx`(`agreementRef` ASC, `createdAt` ASC),
    INDEX `AuditLog_companyId_createdAt_idx`(`companyId` ASC, `createdAt` ASC),
    INDEX `AuditLog_createdAt_idx`(`createdAt` ASC),
    INDEX `AuditLog_endpoint_createdAt_idx`(`endpoint` ASC, `createdAt` ASC),
    INDEX `AuditLog_requestId_idx`(`requestId` ASC),
    INDEX `AuditLog_sourceId_createdAt_idx`(`sourceId` ASC, `createdAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `availabilityjob` (
    `id` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `criteriaJson` LONGTEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'RUNNING',
    `expectedSources` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AvailabilityJob_agentId_idx`(`agentId` ASC),
    INDEX `AvailabilityJob_createdAt_idx`(`createdAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `availabilityresult` (
    `id` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `seq` INTEGER NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `offerJson` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AvailabilityResult_jobId_seq_idx`(`jobId` ASC, `seq` ASC),
    UNIQUE INDEX `AvailabilityResult_jobId_seq_key`(`jobId` ASC, `seq` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking` (
    `id` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `agreementRef` VARCHAR(191) NOT NULL,
    `supplierBookingRef` VARCHAR(191) NULL,
    `agentBookingRef` VARCHAR(191) NULL,
    `idempotencyKey` VARCHAR(191) NULL,
    `status` ENUM('REQUESTED', 'CONFIRMED', 'CANCELLED', 'FAILED') NOT NULL DEFAULT 'REQUESTED',
    `payloadJson` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Booking_agentId_agreementRef_createdAt_idx`(`agentId` ASC, `agreementRef` ASC, `createdAt` ASC),
    UNIQUE INDEX `Booking_agentId_idempotencyKey_key`(`agentId` ASC, `idempotencyKey` ASC),
    INDEX `Booking_sourceId_supplierBookingRef_idx`(`sourceId` ASC, `supplierBookingRef` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `company` (
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
    `adapterType` VARCHAR(191) NOT NULL DEFAULT 'mock',
    `grpcEndpoint` VARCHAR(191) NULL,

    UNIQUE INDEX `Company_email_key`(`email` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `idempotencykey` (
    `id` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `scope` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `responseHash` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `agent_scope_key_unique`(`agentId` ASC, `scope` ASC, `key` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` VARCHAR(191) NOT NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_companyId_createdAt_idx`(`companyId` ASC, `createdAt` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sourcehealth` (
    `id` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `slowCount` INTEGER NOT NULL DEFAULT 0,
    `sampleCount` INTEGER NOT NULL DEFAULT 0,
    `slowRate` DOUBLE NOT NULL DEFAULT 0,
    `backoffLevel` INTEGER NOT NULL DEFAULT 0,
    `excludedUntil` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SourceHealth_excludedUntil_idx`(`excludedUntil` ASC),
    INDEX `SourceHealth_sourceId_idx`(`sourceId` ASC),
    UNIQUE INDEX `SourceHealth_sourceId_key`(`sourceId` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sourcelocation` (
    `id` VARCHAR(191) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `unlocode` VARCHAR(191) NOT NULL,

    INDEX `SourceLocation_sourceId_idx`(`sourceId` ASC),
    UNIQUE INDEX `SourceLocation_sourceId_unlocode_key`(`sourceId` ASC, `unlocode` ASC),
    INDEX `SourceLocation_unlocode_fkey`(`unlocode` ASC),
    UNIQUE INDEX `uniq_source_unlocode`(`sourceId` ASC, `unlocode` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `unlocode` (
    `unlocode` VARCHAR(191) NOT NULL,
    `country` VARCHAR(191) NOT NULL,
    `place` VARCHAR(191) NOT NULL,
    `iataCode` VARCHAR(191) NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,

    INDEX `UNLocode_country_idx`(`country` ASC),
    INDEX `UNLocode_place_idx`(`place` ASC),
    PRIMARY KEY (`unlocode` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN', 'AGENT_USER', 'SOURCE_USER') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `User_companyId_fkey`(`companyId` ASC),
    UNIQUE INDEX `User_email_key`(`email` ASC),
    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `verificationreport` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `passed` BOOLEAN NOT NULL,
    `reportJson` LONGTEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id` ASC)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `agreement` ADD CONSTRAINT `Agreement_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agreement` ADD CONSTRAINT `Agreement_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agreementlocationoverride` ADD CONSTRAINT `AgreementLocationOverride_agreementId_fkey` FOREIGN KEY (`agreementId`) REFERENCES `agreement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agreementlocationoverride` ADD CONSTRAINT `AgreementLocationOverride_unlocode_fkey` FOREIGN KEY (`unlocode`) REFERENCES `unlocode`(`unlocode`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `availabilityresult` ADD CONSTRAINT `AvailabilityResult_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `availabilityjob`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sourcelocation` ADD CONSTRAINT `SourceLocation_sourceId_fkey` FOREIGN KEY (`sourceId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sourcelocation` ADD CONSTRAINT `SourceLocation_unlocode_fkey` FOREIGN KEY (`unlocode`) REFERENCES `unlocode`(`unlocode`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user` ADD CONSTRAINT `User_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

