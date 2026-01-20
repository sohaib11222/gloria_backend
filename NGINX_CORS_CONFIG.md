# Nginx CORS Configuration

If you're using nginx as a reverse proxy, add these CORS headers to your nginx config:

## Location Block for /api

Add this to your nginx server block:

```nginx
server {
    listen 80;
    listen 443 ssl;
    server_name 93.94.74.210 source.gloriaconnect.com;
    
    # SSL configuration (if using HTTPS)
    # ssl_certificate /path/to/cert.pem;
    # ssl_certificate_key /path/to/key.pem;
    
    location /api {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # CORS Headers - CRITICAL
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD' always;
        add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Idempotency-Key, X-Agent-Email, X-Api-Key' always;
        add_header 'Access-Control-Allow-Credentials' 'false' always;
        add_header 'Access-Control-Expose-Headers' '*' always;
        add_header 'Access-Control-Max-Age' '86400' always;
        
        # Handle OPTIONS preflight requests
        if ($request_method = 'OPTIONS') {
            add_header 'Access-Control-Allow-Origin' '*' always;
            add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD' always;
            add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Idempotency-Key, X-Agent-Email, X-Api-Key' always;
            add_header 'Access-Control-Max-Age' '86400' always;
            add_header 'Content-Length' 0;
            add_header 'Content-Type' 'text/plain';
            return 204;
        }
    }
    
    # Other locations...
}
```

## Apply Changes

After updating nginx config:

```bash
# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
# OR
sudo service nginx reload
```

## Find Your Nginx Config

```bash
# Find nginx config files
sudo find /etc/nginx -name "*.conf" | grep -E "sites|conf.d"

# Or check main config
sudo cat /etc/nginx/nginx.conf | grep include
```

