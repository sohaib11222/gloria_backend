-- CreateIndex
CREATE INDEX `Booking_agentId_agreementRef_createdAt_idx` ON `Booking`(`agentId`, `agreementRef`, `createdAt`);

-- CreateIndex
CREATE INDEX `Booking_sourceId_supplierBookingRef_idx` ON `Booking`(`sourceId`, `supplierBookingRef`);

-- RedefineIndex
CREATE UNIQUE INDEX `agent_scope_key_unique` ON `IdempotencyKey`(`agentId`, `scope`, `key`);
DROP INDEX `IdempotencyKey_agentId_scope_key_key` ON `idempotencykey`;
