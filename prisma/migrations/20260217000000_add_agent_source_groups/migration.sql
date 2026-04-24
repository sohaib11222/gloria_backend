-- AgentSourceGroup + AgentSourceGroupAgreement (idempotent; fixes MySQL 3780 FK charset/collation mismatch)
CREATE TABLE IF NOT EXISTS `AgentSourceGroup` (
    `id` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AgentSourceGroup_agentId_createdAt_idx`(`agentId`, `createdAt`),
    UNIQUE INDEX `AgentSourceGroup_agentId_name_key`(`agentId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `AgentSourceGroupAgreement` (
    `id` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `agreementId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AgentSourceGroupAgreement_agreementId_idx`(`agreementId`),
    UNIQUE INDEX `AgentSourceGroupAgreement_groupId_agreementId_key`(`groupId`, `agreementId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @dbname = DATABASE();

-- Match Company.id (referenced by agentId)
SELECT CHARACTER_SET_NAME, COLLATION_NAME INTO @ccs, @ccl
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Company' AND COLUMN_NAME = 'id'
LIMIT 1;

SET @q = IF(
  @ccs IS NOT NULL AND @ccl IS NOT NULL,
  CONCAT(
    'ALTER TABLE `AgentSourceGroup` ',
    'MODIFY `id` VARCHAR(191) CHARACTER SET ', @ccs, ' COLLATE ', @ccl, ' NOT NULL, ',
    'MODIFY `agentId` VARCHAR(191) CHARACTER SET ', @ccs, ' COLLATE ', @ccl, ' NOT NULL, ',
    'MODIFY `name` VARCHAR(191) CHARACTER SET ', @ccs, ' COLLATE ', @ccl, ' NOT NULL'
  ),
  'SELECT 1'
);
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- groupId -> AgentSourceGroup.id ; agreementId -> Agreement.id (may use different collations)
SELECT CHARACTER_SET_NAME, COLLATION_NAME INTO @gcs, @gcl
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'AgentSourceGroup' AND COLUMN_NAME = 'id'
LIMIT 1;

SELECT CHARACTER_SET_NAME, COLLATION_NAME INTO @acs, @acl
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'Agreement' AND COLUMN_NAME = 'id'
LIMIT 1;

SET @q = IF(
  @gcs IS NOT NULL AND @gcl IS NOT NULL AND @acs IS NOT NULL AND @acl IS NOT NULL,
  CONCAT(
    'ALTER TABLE `AgentSourceGroupAgreement` ',
    'MODIFY `id` VARCHAR(191) CHARACTER SET ', @gcs, ' COLLATE ', @gcl, ' NOT NULL, ',
    'MODIFY `groupId` VARCHAR(191) CHARACTER SET ', @gcs, ' COLLATE ', @gcl, ' NOT NULL, ',
    'MODIFY `agreementId` VARCHAR(191) CHARACTER SET ', @acs, ' COLLATE ', @acl, ' NOT NULL'
  ),
  'SELECT 1'
);
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- MySQL 1452: drop only invalid link rows so FK creation succeeds (keeps all valid groups/agreements)
DELETE a FROM `AgentSourceGroupAgreement` a
LEFT JOIN `AgentSourceGroup` g ON g.id = a.groupId
LEFT JOIN `Agreement` ag ON ag.id = a.agreementId
WHERE g.id IS NULL OR ag.id IS NULL;

DELETE grp FROM `AgentSourceGroup` grp
LEFT JOIN `Company` c ON c.id = grp.agentId
WHERE c.id IS NULL;

SELECT COUNT(*) INTO @fk FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = @dbname AND TABLE_NAME = 'AgentSourceGroup' AND CONSTRAINT_NAME = 'AgentSourceGroup_agentId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY';
SET @q = IF(@fk = 0, 'ALTER TABLE `AgentSourceGroup` ADD CONSTRAINT `AgentSourceGroup_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @fk FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = @dbname AND TABLE_NAME = 'AgentSourceGroupAgreement' AND CONSTRAINT_NAME = 'AgentSourceGroupAgreement_groupId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY';
SET @q = IF(@fk = 0, 'ALTER TABLE `AgentSourceGroupAgreement` ADD CONSTRAINT `AgentSourceGroupAgreement_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `AgentSourceGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT COUNT(*) INTO @fk FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = @dbname AND TABLE_NAME = 'AgentSourceGroupAgreement' AND CONSTRAINT_NAME = 'AgentSourceGroupAgreement_agreementId_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY';
SET @q = IF(@fk = 0, 'ALTER TABLE `AgentSourceGroupAgreement` ADD CONSTRAINT `AgentSourceGroupAgreement_agreementId_fkey` FOREIGN KEY (`agreementId`) REFERENCES `Agreement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @q;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
