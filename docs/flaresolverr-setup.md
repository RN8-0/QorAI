# FlareSolverr Kurulumu — Cloudflare'i Otomatik Geç

Geizhals'in Cloudflare Turnstile koruması manuel müdahale olmadan FlareSolverr ile geçilir. FlareSolverr, `undetected-chromedriver` kullanan bir Docker container — proxy'mizin yanında sidecar olarak çalışır.

## 1. Docker Desktop kur (tek seferlik)

İndirme: https://www.docker.com/products/docker-desktop/

Kurulumdan sonra Docker Desktop'ı çalıştır (system tray'de balina ikonu görünene kadar bekle).

Test:
```powershell
docker --version
```
Çıktı: `Docker version 27.x.x, build ...`

## 2. FlareSolverr container'ını başlat

PowerShell'de **bir kez**:
```powershell
docker run -d --name flaresolverr -p 8191:8191 --restart unless-stopped ghcr.io/flaresolverr/flaresolverr:latest
```

- `-d` arka planda çalışır
- `--restart unless-stopped` PC'yi yeniden başlatınca otomatik açılır
- Port `8191` localhost'tan erişilir

Container indirme süresi ~1-2 dakika (300MB).

## 3. Çalıştığını doğrula

```powershell
curl http://localhost:8191/
```
JSON dönmeli: `{"msg":"FlareSolverr is ready!","version":"3.x.x",...}`

## 4. Proxy'yi yeniden başlat

```powershell
npm run scraper:proxy
```

Aşağıdaki satırları görmelisin:
```
🔍 Probing FlareSolverr at http://localhost:8191/v1…
🛡️  FlareSolverr session: qorai-1763...
✅ FlareSolverr active → CF challenges auto-solved, manual clicking gone
```

`/health` endpoint'i de doğrular:
```powershell
curl http://localhost:3456/health
```
`engine: "flaresolverr (puppeteer fallback)"` görmelisin.

## 5. Scrape başlat

Admin → Scraper → Bulk Scrape. Artık:
- Cloudflare challenge sayfaları otomatik çözülür
- Manuel tıklama gerekmez
- Sayfa başına süre ~8-15s (önceden 27-45s + retry)

## Yönetim komutları

```powershell
docker ps                          # çalışan container'ları gör
docker logs flaresolverr -f        # canlı log izle
docker restart flaresolverr        # restart
docker stop flaresolverr           # durdur
docker start flaresolverr          # tekrar başlat
docker rm -f flaresolverr          # sil (yeniden kurmak için)
```

## Sorun giderme

**"docker: command not found"** → Docker Desktop kurulu değil veya PATH'te değil. Yeniden kur, PowerShell'i kapatıp aç.

**`http://localhost:8191/` cevap vermiyor** → Container çalışmıyor olabilir:
```powershell
docker ps -a
docker start flaresolverr
docker logs flaresolverr --tail 50
```

**FlareSolverr "challenge could not be solved"** → Geizhals nadiren sertleşir; FlareSolverr otomatik retry yapar, başarısız olursa proxy Puppeteer'a fallback eder. Scrape devam eder.

**Container bellek yiyor** → Normal, ~500-800MB. Düşürmek için:
```powershell
docker stop flaresolverr
docker rm flaresolverr
docker run -d --name flaresolverr -p 8191:8191 -e BROWSER_TIMEOUT=40000 --memory=1g --restart unless-stopped ghcr.io/flaresolverr/flaresolverr:latest
```

## Maliyet

**$0** — tamamen lokal, açık kaynak, container ve disk dışında hiçbir kaynak tüketmez.
