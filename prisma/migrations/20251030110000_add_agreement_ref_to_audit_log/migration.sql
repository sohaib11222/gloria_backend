-- [AUTO-AUDIT] Add agreementRef to AuditLog for explicit logging and filtering
ALTER TABLE `AuditLog`
  ADD COLUMN `agreementRef` VARCHAR(191) NULL AFTER `sourceId`;

CREATE INDEX `AuditLog_agreementRef_createdAt_idx`
  ON `AuditLog` (`agreementRef`, `createdAt`);


