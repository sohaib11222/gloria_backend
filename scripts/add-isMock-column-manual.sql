-- Add isMock column to SourceLocation table
-- Run this SQL command directly on your MySQL database
-- This will add the column without losing any existing data

USE car_hire_mw;

-- Check if column already exists (optional - will error if exists, but that's okay)
-- ALTER TABLE SourceLocation ADD COLUMN isMock BOOLEAN DEFAULT FALSE;

-- Better approach: Check first, then add
SET @dbname = DATABASE();
SET @tablename = "SourceLocation";
SET @columnname = "isMock";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (TABLE_SCHEMA = @dbname)
      AND (TABLE_NAME = @tablename)
      AND (COLUMN_NAME = @columnname)
  ) > 0,
  "SELECT 'Column already exists.' AS result;",
  CONCAT("ALTER TABLE ", @tablename, " ADD COLUMN ", @columnname, " BOOLEAN NOT NULL DEFAULT FALSE;")
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Verify the column was added
DESCRIBE SourceLocation;
