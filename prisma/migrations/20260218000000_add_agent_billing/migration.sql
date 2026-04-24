-- Agent billing: Company.billingCountryCode + AgentPlan tables (idempotent)
SET @dbname = DATABASE();

SELECT COUNT(*) INTO @cnt FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Company' AND COLUMN_NAME = 'billingCountryCode';
SET @q = IF(@cnt = 0, 'ALTER TABLE `Company` ADD COLUMN `billingCountryCode` VARCHAR(191) NULL', 'SELECT 1');
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS `AgentPlan` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `interval` ENUM('WEEKLY', 'MONTHLY', 'YEARLY') NOT NULL,
    `branchLimit` INTEGER NOT NULL DEFAULT 0,
    `defaultPriceCents` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AgentPlan_active_idx`(`active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `AgentPlanCountryPrice` (
    `id` VARCHAR(191) NOT NULL,
    `agentPlanId` VARCHAR(191) NOT NULL,
    `countryCode` VARCHAR(191) NOT NULL,
    `pricePerBranchCents` INTEGER NOT NULL,
    `stripePriceId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AgentPlanCountryPrice_agentPlanId_countryCode_key`(`agentPlanId`, `countryCode`),
    INDEX `AgentPlanCountryPrice_agentPlanId_idx`(`agentPlanId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `AgentSubscription` (
    `id` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `agentPlanId` VARCHAR(191) NOT NULL,
    `stripeCustomerId` VARCHAR(191) NULL,
    `stripeSubscriptionId` VARCHAR(191) NULL,
    `subscribedBranchCount` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('active', 'canceled', 'past_due', 'trialing') NOT NULL DEFAULT 'active',
    `currentPeriodStart` DATETIME(3) NULL,
    `currentPeriodEnd` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AgentSubscription_agentId_key`(`agentId`),
    INDEX `AgentSubscription_agentId_idx`(`agentId`),
    INDEX `AgentSubscription_currentPeriodEnd_idx`(`currentPeriodEnd`),
    INDEX `AgentSubscription_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Align VARCHAR collations with FK parents (avoids MySQL 3780)
SELECT CHARACTER_SET_NAME, COLLATION_NAME INTO @pcs, @pcl
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'AgentPlan' AND COLUMN_NAME = 'id'
LIMIT 1;

SET @q = IF(
  @pcs IS NOT NULL AND @pcl IS NOT NULL,
  CONCAT(
    'ALTER TABLE `AgentPlan` ',
    'MODIFY `id` VARCHAR(191) CHARACTER SET ', @pcs, ' COLLATE ', @pcl, ' NOT NULL, ',
    'MODIFY `name` VARCHAR(191) CHARACTER SET ', @pcs, ' COLLATE ', @pcl, ' NOT NULL'
  ),
  'SELECT 1'
);
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT CHARACTER_SET_NAME, COLLATION_NAME INTO @ccs, @ccl
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Company' AND COLUMN_NAME = 'id'
LIMIT 1;

SET @q = IF(
  @pcs IS NOT NULL AND @pcl IS NOT NULL AND @ccs IS NOT NULL AND @ccl IS NOT NULL,
  CONCAT(
    'ALTER TABLE `AgentPlanCountryPrice` ',
    'MODIFY `id` VARCHAR(191) CHARACTER SET ', @pcs, ' COLLATE ', @pcl, ' NOT NULL, ',
    'MODIFY `agentPlanId` VARCHAR(191) CHARACTER SET ', @pcs, ' COLLATE ', @pcl, ' NOT NULL, ',
    'MODIFY `countryCode` VARCHAR(191) CHARACTER SET ', @pcs, ' COLLATE ', @pcl, ' NOT NULL, ',
    'MODIFY `stripePriceId` VARCHAR(191) CHARACTER SET ', @pcs, ' COLLATE ', @pcl, ' NULL'
  ),
  'SELECT 1'
);
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @q = IF(
  @pcs IS NOT NULL AND @pcl IS NOT NULL AND @ccs IS NOT NULL AND @ccl IS NOT NULL,
  CONCAT(
    'ALTER TABLE `AgentSubscription` ',
    'MODIFY `id` VARCHAR(191) CHARACTER SET ', @ccs, ' COLLATE ', @ccl, ' NOT NULL, ',
    'MODIFY `agentId` VARCHAR(191) CHARACTER SET ', @ccs, ' COLLATE ', @ccl, ' NOT NULL, ',
    'MODIFY `agentPlanId` VARCHAR(191) CHARACTER SET ', @pcs, ' COLLATE ', @pcl, ' NOT NULL, ',
    'MODIFY `stripeCustomerId` VARCHAR(191) CHARACTER SET ', @ccs, ' COLLATE ', @ccl, ' NULL, ',
    'MODIFY `stripeSubscriptionId` VARCHAR(191) CHARACTER SET ', @ccs, ' COLLATE ', @ccl, ' NULL'
  ),
  'SELECT 1'
);
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @fk FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = @dbname AND TABLE_NAME = 'AgentPlanCountryPrice' AND CONSTRAINT_NAME = 'AgentPlanCountryPrice_agentPlanId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY';
SET @q = IF(@fk = 0, 'ALTER TABLE `AgentPlanCountryPrice` ADD CONSTRAINT `AgentPlanCountryPrice_agentPlanId_fkey` FOREIGN KEY (`agentPlanId`) REFERENCES `AgentPlan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @fk FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = @dbname AND TABLE_NAME = 'AgentSubscription' AND CONSTRAINT_NAME = 'AgentSubscription_agentId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY';
SET @q = IF(@fk = 0, 'ALTER TABLE `AgentSubscription` ADD CONSTRAINT `AgentSubscription_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @fk FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = @dbname AND TABLE_NAME = 'AgentSubscription' AND CONSTRAINT_NAME = 'AgentSubscription_agentPlanId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY';
SET @q = IF(@fk = 0, 'ALTER TABLE `AgentSubscription` ADD CONSTRAINT `AgentSubscription_agentPlanId_fkey` FOREIGN KEY (`agentPlanId`) REFERENCES `AgentPlan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
