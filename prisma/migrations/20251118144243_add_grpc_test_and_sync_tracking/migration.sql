-- AlterTable
ALTER TABLE `Company` ADD COLUMN `lastGrpcTestAt` DATETIME(3) NULL,
    ADD COLUMN `lastGrpcTestResult` JSON NULL,
    ADD COLUMN `lastLocationSyncAt` DATETIME(3) NULL;
