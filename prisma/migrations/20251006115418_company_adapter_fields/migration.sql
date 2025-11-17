-- AlterTable (table names are case-sensitive depending on MySQL settings)
ALTER TABLE `Company` ADD COLUMN `adapterType` VARCHAR(191) NOT NULL DEFAULT 'mock',
    ADD COLUMN `grpcEndpoint` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `AuditLog_createdAt_idx` ON `AuditLog`(`createdAt`);

-- CreateIndex
CREATE INDEX `AuditLog_companyId_createdAt_idx` ON `AuditLog`(`companyId`, `createdAt`);

-- CreateIndex
CREATE INDEX `AuditLog_sourceId_createdAt_idx` ON `AuditLog`(`sourceId`, `createdAt`);

-- CreateIndex
CREATE INDEX `AuditLog_endpoint_createdAt_idx` ON `AuditLog`(`endpoint`, `createdAt`);

-- CreateIndex
CREATE INDEX `AuditLog_requestId_idx` ON `AuditLog`(`requestId`);
