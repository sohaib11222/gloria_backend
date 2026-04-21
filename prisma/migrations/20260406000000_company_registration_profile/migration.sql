-- AlterTable: SOURCE self-registration profile (branch label, address, website)
ALTER TABLE `Company` ADD COLUMN `registrationBranchName` VARCHAR(191) NULL;
ALTER TABLE `Company` ADD COLUMN `companyAddress` TEXT NULL;
ALTER TABLE `Company` ADD COLUMN `companyWebsiteUrl` VARCHAR(500) NULL;
