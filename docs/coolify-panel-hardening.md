# Coolify Panel Hardening Plan

Current confirmed issue:

- Coolify dashboard is still opened as `http://46.225.95.201:8000`
- Because the browser is hitting raw HTTP on a public IP, it will continue to show `Güvenli değil`
- This warning is about the Coolify panel, not the admin app itself

Target state:

- Panel served from a domain such as `coolify.compair.digital`
- TLS enabled on that domain
- Public `:8000` closed at firewall level
- Access restricted with at least one edge layer: IP allowlist, VPN, Tailscale, Cloudflare Access, or HTTP basic auth

## Recommended path for this server

1. DNS

- Create an `A` record for `coolify.compair.digital` pointing to `46.225.95.201`

2. Reverse proxy in front of Coolify panel

- Keep Coolify panel listening internally on `127.0.0.1:8000` if possible
- Terminate HTTPS on Nginx or Caddy and proxy requests to `http://127.0.0.1:8000`

Example Nginx site:

```nginx
server {
    listen 80;
    server_name coolify.compair.digital;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name coolify.compair.digital;

    ssl_certificate /etc/letsencrypt/live/coolify.compair.digital/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/coolify.compair.digital/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;
    }
}
```

3. Firewall

- Close public inbound `8000`
- Leave only `80` and `443` public
- If possible, allow `443` only from your own IP range or put it behind VPN/Tailscale/Cloudflare Access

4. Edge protection

- For the admin app itself, enable Coolify HTTP basic auth with `node scripts/patch_coolify_admin_basic_auth.js`
- For the Coolify panel, prefer stronger access control: VPN, Tailscale, or Cloudflare Access

5. Secret rotation

- Rotate `COOLIFY_TOKEN`
- Sign out old panel sessions
- Regenerate any exposed personal API tokens if the panel was used over plain HTTP

## Why the warning still appears

- As long as you browse to `http://46.225.95.201:8000`, the browser correctly flags the session as insecure
- The fix is not inside Flutter or the admin static app
- The fix is to stop using the raw IP/HTTP panel URL and move panel access behind domain + HTTPS + network restriction