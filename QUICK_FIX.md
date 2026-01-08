# Quick Fix: MySQL Authentication Error

## Error Message
```
Access denied for user 'root'@'localhost'
```

## Step-by-Step Fix

### Step 1: Check your .env file
```bash
npm run check:env
```

### Step 2: Test database connection
```bash
npm run test:db
```

### Step 3: Choose a fix option

#### Option A: MySQL root has NO password
Update `.env`:
```env
DATABASE_URL="mysql://root@localhost:3306/car_hire_mw"
```

#### Option B: MySQL root has password
Update `.env`:
```env
DATABASE_URL="mysql://root:YOUR_PASSWORD@localhost:3306/car_hire_mw"
```

#### Option C: Create new MySQL user (RECOMMENDED)

1. Open MySQL:
```bash
mysql -u root -p
```

2. Run these commands:
```sql
CREATE DATABASE IF NOT EXISTS car_hire_mw;
CREATE USER 'carhire_user'@'localhost' IDENTIFIED WITH mysql_native_password BY 'carhire_pass_123';
GRANT ALL PRIVILEGES ON car_hire_mw.* TO 'carhire_user'@'localhost';
FLUSH PRIVILEGES;
```

3. Update `.env`:
```env
DATABASE_URL="mysql://carhire_user:carhire_pass_123@localhost:3306/car_hire_mw"
```

#### Option D: Fix MySQL 8.0 authentication plugin

If you're using MySQL 8.0+ and getting authentication errors:

```sql
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'your_password';
FLUSH PRIVILEGES;
```

### Step 4: Test again
```bash
npm run test:db
```

### Step 5: Run migrations
```bash
npm run prisma:gen
npm run prisma:migrate
npm run prisma:seed
```

### Step 6: Start server
```bash
npm run dev
```

## Still having issues?

1. Make sure MySQL is running:
   ```bash
   # Windows
   net start MySQL80
   
   # Linux/Mac
   sudo systemctl start mysql
   ```

2. Check MySQL version:
   ```bash
   mysql --version
   ```

3. Verify you can connect manually:
   ```bash
   mysql -u root -p
   ```

4. If manual connection works, use the same credentials in `.env`

