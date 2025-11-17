-- CreateIndex
CREATE INDEX `AvailabilityJob_agentId_idx` ON `AvailabilityJob`(`agentId`);

-- CreateIndex
CREATE INDEX `AvailabilityJob_createdAt_idx` ON `AvailabilityJob`(`createdAt`);

-- CreateIndex
CREATE INDEX `AvailabilityResult_jobId_seq_idx` ON `AvailabilityResult`(`jobId`, `seq`);
