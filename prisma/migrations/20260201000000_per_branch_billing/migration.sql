-- Plan.pricePerBranchCents + SourceSubscription.subscribedBranchCount (idempotent)
SET @dbname = DATABASE();

SELECT COUNT(*) INTO @cnt FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Plan' AND COLUMN_NAME = 'pricePerBranchCents';
SET @q = IF(@cnt = 0, 'ALTER TABLE `Plan` ADD COLUMN `pricePerBranchCents` INTEGER NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `Plan` SET `pricePerBranchCents` = `amountCents` WHERE `amountCents` > 0;
UPDATE `Plan` SET `pricePerBranchCents` = 100 WHERE `pricePerBranchCents` = 0;

SELECT COUNT(*) INTO @cnt FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'SourceSubscription' AND COLUMN_NAME = 'subscribedBranchCount';
SET @q = IF(@cnt = 0, 'ALTER TABLE `SourceSubscription` ADD COLUMN `subscribedBranchCount` INTEGER NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
