-- AlterTable
ALTER TABLE `SourceHealth` ADD COLUMN `strikeCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `lastStrikeAt` DATETIME(3) NULL;
