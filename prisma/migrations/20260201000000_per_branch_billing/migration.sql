-- AlterTable Plan: add pricePerBranchCents (per-branch pricing)
ALTER TABLE `Plan` ADD COLUMN `pricePerBranchCents` INTEGER NOT NULL DEFAULT 0;

-- Backfill: use amountCents as price per branch for existing plans
UPDATE `Plan` SET `pricePerBranchCents` = `amountCents` WHERE `amountCents` > 0;
UPDATE `Plan` SET `pricePerBranchCents` = 100 WHERE `pricePerBranchCents` = 0;

-- AlterTable SourceSubscription: add subscribedBranchCount (synced from Stripe quantity)
ALTER TABLE `SourceSubscription` ADD COLUMN `subscribedBranchCount` INTEGER NOT NULL DEFAULT 1;
