# Prisma migrate dev – shadow database (P3014)

If you see:

```text
Error: P3014
Prisma Migrate could not create the shadow database.
User `gloria` was denied access on the database `car_hire_mw`
```

the DB user needs permission to **create** databases (Prisma uses a temporary “shadow” DB for `migrate dev`).

## Fix: grant CREATE to the app user

Run as MySQL root (or another user that can grant):

```bash
mysql -u root -p -e "
GRANT CREATE ON *.* TO 'gloria'@'localhost';
FLUSH PRIVILEGES;
"
```

Then run:

```bash
npx prisma migrate dev --name your_migration_name
```

## If you can’t grant CREATE

- Use **`npx prisma db push`** to apply schema changes without migrations (no shadow DB). Good for dev when you don’t need migration history.
- For production, use **`npx prisma migrate deploy`** (uses existing migration files, no shadow DB).
