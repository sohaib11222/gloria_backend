-- CreateIndex
CREATE INDEX `Agreement_agentId_status_createdAt_idx` ON `Agreement`(`agentId`, `status`, `createdAt`);

-- CreateIndex
CREATE INDEX `Agreement_sourceId_status_createdAt_idx` ON `Agreement`(`sourceId`, `status`, `createdAt`);

-- CreateIndex
CREATE INDEX `Notification_companyId_createdAt_idx` ON `Notification`(`companyId`, `createdAt`);

-- CreateIndex
CREATE INDEX `SourceLocation_sourceId_idx` ON `SourceLocation`(`sourceId`);

-- CreateIndex
CREATE INDEX `UNLocode_country_idx` ON `UNLocode`(`country`);

-- CreateIndex
CREATE INDEX `UNLocode_place_idx` ON `UNLocode`(`place`);
