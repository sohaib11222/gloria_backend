-- AlterTable Company: add billingCountryCode for agent price resolution
ALTER TABLE `Company` ADD COLUMN `billingCountryCode` VARCHAR(191) NULL;

-- CreateTable AgentPlan
CREATE TABLE `AgentPlan` (
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

-- CreateTable AgentPlanCountryPrice
CREATE TABLE `AgentPlanCountryPrice` (
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

-- CreateTable AgentSubscription
CREATE TABLE `AgentSubscription` (
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

-- AddForeignKey
ALTER TABLE `AgentPlanCountryPrice` ADD CONSTRAINT `AgentPlanCountryPrice_agentPlanId_fkey` FOREIGN KEY (`agentPlanId`) REFERENCES `AgentPlan`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgentSubscription` ADD CONSTRAINT `AgentSubscription_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgentSubscription` ADD CONSTRAINT `AgentSubscription_agentPlanId_fkey` FOREIGN KEY (`agentPlanId`) REFERENCES `AgentPlan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
