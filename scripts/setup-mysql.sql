-- MySQL Setup Script for Car Hire Middleware
-- Run this in MySQL: mysql -u root -p < scripts/setup-mysql.sql
-- Or copy-paste into MySQL command line

-- Create database
CREATE DATABASE IF NOT EXISTS car_hire_mw CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Option 1: Use root user (if you know the password)
-- Just update your .env with: DATABASE_URL="mysql://root:YOUR_PASSWORD@localhost:3306/car_hire_mw"

-- Option 2: Create dedicated user (RECOMMENDED)
CREATE USER IF NOT EXISTS 'carhire_user'@'localhost' IDENTIFIED BY 'carhire_pass_123';
GRANT ALL PRIVILEGES ON car_hire_mw.* TO 'carhire_user'@'localhost';
FLUSH PRIVILEGES;

-- Verify
SHOW DATABASES LIKE 'car_hire_mw';
SELECT User, Host FROM mysql.user WHERE User = 'carhire_user';

