-- CreateTable
CREATE TABLE `AgentSourceGroup` (
    `id` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AgentSourceGroup_agentId_createdAt_idx`(`agentId`, `createdAt`),
    UNIQUE INDEX `AgentSourceGroup_agentId_name_key`(`agentId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AgentSourceGroupAgreement` (
    `id` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `agreementId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AgentSourceGroupAgreement_agreementId_idx`(`agreementId`),
    UNIQUE INDEX `AgentSourceGroupAgreement_groupId_agreementId_key`(`groupId`, `agreementId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AgentSourceGroup` ADD CONSTRAINT `AgentSourceGroup_agentId_fkey`
    FOREIGN KEY (`agentId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgentSourceGroupAgreement` ADD CONSTRAINT `AgentSourceGroupAgreement_groupId_fkey`
    FOREIGN KEY (`groupId`) REFERENCES `AgentSourceGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AgentSourceGroupAgreement` ADD CONSTRAINT `AgentSourceGroupAgreement_agreementId_fkey`
    FOREIGN KEY (`agreementId`) REFERENCES `Agreement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
