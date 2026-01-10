# Deployment Guide

## Prerequisites

- Node.js 18+ and npm
- MySQL 8.0+
- Linux server (Ubuntu 20.04+ recommended)
- Domain name and SSL certificate (for production)

## Environment Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd gloriaconnect_backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Variables

Create a `.env` file:

```env
# Database
DATABASE_URL="mysql://user:password@localhost:3306/carhire?schema=public"

# Server
PORT=8080
NODE_ENV=production

# gRPC Servers
SOURCE_GRPC_ADDR=localhost:50051
AGENT_GRPC_ADDR=localhost:50052

# JWT
JWT_SECRET=your-secret-key-here

# Email (SMTP)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-password
SMTP_FROM=noreply@example.com

# Features
ENABLE_LOCATION_SYNC=true
ENABLE_IP_WHITELIST=false

# Logging
LOG_LEVEL=info
```

### 4. Database Setup

```bash
# Generate Prisma client
npm run prisma:gen

# Run migrations
npm run prisma:migrate

# Seed UN/LOCODE data
npm run seed:unlocode

# (Optional) Seed test data
npm run tsx scripts/seed-test-data.ts
```

## Production Deployment

### 1. Build Application

```bash
npm run build
```

### 2. Process Management

Use PM2 or systemd to manage the process:

**PM2:**
```bash
npm install -g pm2
pm2 start dist/index.js --name carhire-middleware
pm2 save
pm2 startup
```

**systemd:**
Create `/etc/systemd/system/carhire.service`:

```ini
[Unit]
Description=Car Hire Middleware
After=network.target mysql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/gloriaconnect_backend
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable carhire
sudo systemctl start carhire
```

### 3. Reverse Proxy (Nginx)

Create `/etc/nginx/sites-available/carhire`:

```nginx
server {
    listen 80;
    server_name api.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 4. Firewall Configuration

```bash
# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow gRPC (if exposed)
sudo ufw allow 50051/tcp
sudo ufw allow 50052/tcp
```

## Scaling Considerations

### Horizontal Scaling

1. **Load Balancer**: Use Nginx or HAProxy to distribute traffic
2. **Stateless Design**: Application is stateless - can run multiple instances
3. **Database**: Use read replicas for read-heavy operations
4. **Session Storage**: Use Redis for shared session storage (if needed)

### Vertical Scaling

1. **Node.js Cluster**: Use PM2 cluster mode:
   ```bash
   pm2 start dist/index.js -i max --name carhire-middleware
   ```

2. **Database Optimization**:
   - Add indexes for frequently queried fields
   - Use connection pooling
   - Monitor slow queries

### Monitoring

1. **Prometheus Metrics**: Available at `/metrics`
2. **Health Checks**: Use `/health` endpoint
3. **Logging**: Structured logs with Pino (ELK-ready)

## Backup Strategy

### Database Backups

```bash
# Daily backup script
mysqldump -u user -p carhire > backup_$(date +%Y%m%d).sql
```

### Automated Backups

Set up cron job:
```bash
0 2 * * * /path/to/backup-script.sh
```

## Security Checklist

- [ ] Change default JWT secret
- [ ] Use strong database passwords
- [ ] Enable SSL/TLS
- [ ] Configure firewall rules
- [ ] Set up IP whitelist (if required)
- [ ] Regular security updates
- [ ] Monitor logs for suspicious activity
- [ ] Use environment variables for secrets
- [ ] Enable rate limiting
- [ ] Configure CORS properly

## Troubleshooting

### Application won't start

1. Check database connection
2. Verify environment variables
3. Check port availability
4. Review application logs

### High Memory Usage

1. Monitor with `pm2 monit`
2. Check for memory leaks
3. Adjust Node.js heap size if needed

### Database Connection Issues

1. Verify DATABASE_URL format
2. Check MySQL is running
3. Verify user permissions
4. Check firewall rules

## Rollback Procedure

1. Stop application
2. Restore previous database backup
3. Deploy previous version
4. Restart application

## Support

For issues or questions, refer to:
- Application logs: `pm2 logs carhire-middleware`
- System logs: `journalctl -u carhire`
- Health endpoint: `curl http://localhost:8080/health`

