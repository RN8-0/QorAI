# Coolify Panel Hardening Plan

Current confirmed issue:

- Coolify dashboard is still opened as `http://46.225.95.201:8000`
- Because the browser is hitting raw HTTP on a public IP, it will continue to show `Güvenli değil`
- This warning is about the Coolify panel, not the admin app itself

Target state for Qor AI:

- Panel served from a fixed domain such as `panel.qorai.app`
- Admin app served from a fixed domain such as `admin.qorai.app`
- Public website served from `qorai.app` / `www.qorai.app`
- TLS enabled on every public domain
- Public `:8000` closed at firewall level
- Access restricted with at least one edge layer: IP allowlist, VPN, Tailscale, Cloudflare Access, or HTTP basic auth

## 1. DNS records

Point these records to `46.225.95.201`:

- `A panel.qorai.app`
- `A admin.qorai.app`
- `A qorai.app`
- `A www.qorai.app`

Optional backend split:

- `A api.qorai.app`
- `A search.qorai.app`

## 2. Patch Coolify application FQDN values

Set these variables in `migration/.env` or the shell:

```env
COOLIFY_ADMIN_APP_FQDN=https://admin.qorai.app
COOLIFY_WEBSITE_FQDN=https://qorai.app,https://www.qorai.app
COOLIFY_POCKETBASE_FQDN=https://api.qorai.app
COOLIFY_ADMIN_BASIC_AUTH_USERNAME=<set-me>
COOLIFY_ADMIN_BASIC_AUTH_PASSWORD=<set-me>
```

Then run:

```bash
npm --prefix scripts run patch:coolify-app-domains
npm --prefix scripts run patch:coolify-admin-basic-auth
```

## 3. Reverse proxy the Coolify panel to a fixed Qor AI domain

Install Nginx + Certbot:

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

Create the panel site:

```bash
sudo tee /etc/nginx/sites-available/panel.qorai.app > /dev/null <<'EOF'
server {
    listen 80;
    server_name panel.qorai.app;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name panel.qorai.app;

    ssl_certificate /etc/letsencrypt/live/panel.qorai.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/panel.qorai.app/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection upgrade;
    }
}
EOF
```

Enable and validate it:

```bash
sudo ln -sf /etc/nginx/sites-available/panel.qorai.app /etc/nginx/sites-enabled/panel.qorai.app
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d panel.qorai.app
```

## 4. Firewall

Allow only standard web ports and close direct panel access:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw delete allow 8000/tcp
sudo ufw status numbered
```

If possible, put `panel.qorai.app` behind VPN, Tailscale, or Cloudflare Access instead of leaving it open to the full internet.

## 5. Caddy alternative

If you prefer Caddy instead of Nginx:

```caddy
panel.qorai.app {
    reverse_proxy 127.0.0.1:8000
}
```

## 6. Secret rotation after HTTP exposure

- Rotate `COOLIFY_TOKEN`
- Sign out old panel sessions
- Regenerate any exposed personal API tokens if the panel was used over plain HTTP

## Why the warning still appears today

- As long as you browse to `http://46.225.95.201:8000`, the browser correctly flags the session as insecure
- The fix is not inside Flutter or the admin static app
- The fix is to stop using the raw IP/HTTP panel URL and move panel access behind `panel.qorai.app` + HTTPS + network restriction