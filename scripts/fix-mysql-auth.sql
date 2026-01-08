-- Fix MySQL Authentication Issues
-- Run this in MySQL: mysql -u root -p < scripts/fix-mysql-auth.sql
-- Or copy-paste into MySQL command line

-- Step 1: Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS car_hire_mw CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Step 2: Check current root user authentication method
SELECT user, host, plugin FROM mysql.user WHERE user = 'root' AND host = 'localhost';

-- Step 3: Option A - If you want to use root with password
-- ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'your_password_here';
-- FLUSH PRIVILEGES;

-- Step 4: Option B - Create a new dedicated user (RECOMMENDED)
-- Drop user if exists
DROP USER IF EXISTS 'carhire_user'@'localhost';

-- Create new user with mysql_native_password (more compatible)
CREATE USER 'carhire_user'@'localhost' IDENTIFIED WITH mysql_native_password BY 'carhire_pass_123';

-- Grant all privileges
GRANT ALL PRIVILEGES ON car_hire_mw.* TO 'carhire_user'@'localhost';

-- Grant privileges on all databases (if needed)
-- GRANT ALL PRIVILEGES ON *.* TO 'carhire_user'@'localhost' WITH GRANT OPTION;

FLUSH PRIVILEGES;

-- Verify
SELECT User, Host, plugin FROM mysql.user WHERE User = 'carhire_user';
SHOW GRANTS FOR 'carhire_user'@'localhost';

-- Test connection (run this separately)
-- mysql -u carhire_user -pcarhire_pass_123 car_hire_mw

