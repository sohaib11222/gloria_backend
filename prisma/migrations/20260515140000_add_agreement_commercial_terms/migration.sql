ALTER TABLE `Agreement`
  ADD COLUMN `accountNumber` VARCHAR(191) NULL,
  ADD COLUMN `marginPercent` DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `contactName` VARCHAR(191) NULL,
  ADD COLUMN `contactEmail` VARCHAR(191) NULL;

CREATE INDEX `Agreement_sourceId_accountNumber_idx` ON `Agreement`(`sourceId`, `accountNumber`);
