-- AlterTable
ALTER TABLE `auditlog` MODIFY `maskedRequest` TEXT NULL,
    MODIFY `maskedResponse` TEXT NULL;

-- AlterTable
ALTER TABLE `booking` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `branch` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `echojob` ALTER COLUMN `updatedAt` DROP DEFAULT;
