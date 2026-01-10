# How to Start the Backend Server

## Quick Start

1. **Open a terminal/command prompt**

2. **Navigate to backend directory:**
   ```bash
   cd gloriaconnect_backend
   ```

3. **Start the server:**
   ```bash
   npm run dev
   ```

4. **You should see:**
   ```
   ✅ Database connection successful
   HTTP server listening on port 8080
   ```

5. **Keep this terminal open** - the server runs in this window

## Verify Server is Running

Open in browser: `http://localhost:8080/health`

Or test login:
```bash
npm run test:login
```

## Troubleshooting

### If database connection fails:
```bash
npm run test:db
```

### If port 8080 is in use:
Update `.env` file:
```
PORT=8081
```

Then update frontend `.env` to match:
```
VITE_MIDDLEWARE_URL=http://localhost:8081
```

### Common Errors:

1. **"Access denied for user 'root'@'localhost'"**
   - Fix: Update `DATABASE_URL` in `.env` file
   - Run: `npm run check:env`

2. **"Port already in use"**
   - Fix: Change `PORT` in `.env` or stop other service using port 8080

3. **"Cannot find module"**
   - Fix: Run `npm install`

## After Server Starts

1. ✅ Server should show: "HTTP server listening on port 8080"
2. ✅ Test login endpoint: `npm run test:login`
3. ✅ Try logging in from admin frontend

