-- CreateTable
CREATE TABLE `SupportTicket` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `status` ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `createdById` VARCHAR(191) NOT NULL,
    `assignedTo` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SupportTicket_createdById_createdAt_idx`(`createdById`, `createdAt`),
    INDEX `SupportTicket_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `SupportTicket_assignedTo_idx`(`assignedTo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SupportMessage` (
    `id` VARCHAR(191) NOT NULL,
    `ticketId` VARCHAR(191) NOT NULL,
    `senderId` VARCHAR(191) NOT NULL,
    `senderType` ENUM('ADMIN', 'AGENT', 'SOURCE') NOT NULL,
    `content` TEXT NULL,
    `imageUrl` TEXT NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SupportMessage_ticketId_createdAt_idx`(`ticketId`, `createdAt`),
    INDEX `SupportMessage_senderId_createdAt_idx`(`senderId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SupportTicket` ADD CONSTRAINT `SupportTicket_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupportMessage` ADD CONSTRAINT `SupportMessage_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `SupportTicket`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
