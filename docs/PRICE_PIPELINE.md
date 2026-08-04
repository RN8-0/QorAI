# Qor AI — Fiyat + Katalog Otomasyonu Runbook

_Son güncelleme: 2026-08-05_

## Mimari: ne nerede çalışıyor?

| Görev | Nerede | Zaman | Ne yapar |
|---|---|---|---|
| `qorai-price-refresh.sh` | **Hetzner** (cron) | 03:10 | Amazon TR/DE/GB/US tam koşu (`amazon_direct`) — tazeleme 6000 + kategori kotalı keşif + varyantlar + TS backfill |
| `qorai-price-topup.sh` | **Hetzner** (cron) | 15:10 | Amiral gemisi ürünlerde günün 2. tazelemesi (800) |
| `refresh-fcm-token.sh` | **Hetzner** (cron) | 50 dk'da bir | FCM access token → PB `app_config` (push bildirimleri) |
| `QorAI-PriceRefresh` | **Bu PC** (Task Scheduler) | 03:10 | **Epey** → Amazon.com.tr + TR mağaza fiyatları (`epey_amazon`). Epey datacenter IP'lerini 403'ler → yalnız ev IP'sinden çalışır |
| `QorAI-PriceDirect` | **Bu PC** (Task Scheduler) | 03:12 | Amazon DE/GB/US ekstra kapasite (Hetzner ile paralel; US duvarı ev IP'sinde daha yumuşak) |
| `QorAI-FCM-TokenRefresh` | **Bu PC** (Task Scheduler) | 50 dk'da bir | Hetzner'daki cron'un YEDEĞİ — kaldırılsa da bir şey bozulmaz |
| `QorAI-EpeyWatch` | **Bu PC** (Task Scheduler) | 15 dk'da bir | **Epey nabzı** — ana sayfadaki "Son Eklenen Ürünler"i TEK istekle okur; yeni ürün varsa ANINDA çeker. Tarama yok (aşağıdaki bölüm) |
| `QorAI-ProductDiscovery` | **Bu PC** (Task Scheduler) | 23:20 | Nabzın **emniyet ağı**: kategori bazlı en-yeni listesinden kaçanları toplar (aşağıdaki bölüm) |

**Tek gerçek kaynak Hetzner'dır.** PC'nin katkısı: (1) Epey tabanlı TR mağaza
fiyatları — en ucuz 3 mağaza satırı + Amazon.com.tr affiliate linki, (2) gündüz
penceresinde ekstra Amazon kapasitesi.

## "Bu PC kapanırsa / bozulursa ne olur?"

- **Site fiyatsız KALMAZ.** Amazon TR/DE/GB/US fiyatları Hetzner'dan güncellenmeye
  devam eder. Push bildirimleri (FCM) Hetzner'dan döner. Admin panel, web sitesi,
  PocketBase, Typesense — hepsi Coolify/Hetzner'da; PC ile ilgisi yok.
- **Kaybolan tek şey:** Epey kaynaklı TR mağaza satırları (`epey_amazon` +
  `epey_store` offer'ları). Bunların ömrü 50 saat — PC ~2 gün kapalı kalırsa
  ürün sayfalarındaki TR mağaza satırları düşer, Amazon satırı Hetzner
  sayesinde kalır. PC (veya yeni PC) tekrar açılınca ilk gece koşusunda geri gelir.
- Görevlerde `StartWhenAvailable` açık: PC 03:10'da kapalıysa koşu açılışta
  telafi edilir.

## Yeni PC'ye taşınma (15 dk)

1. **Node.js** kur (LTS) — `node` PATH'te olmalı.
2. Repoyu klonla: `git clone <repo> C:\...\Compair-master` (konum fark etmez,
   script kendi yolunu çözer).
3. **`migration\.env` dosyasını eski PC'den kopyala.** Gizli anahtarlar
   (PB admin, Typesense, Coolify, Amazon tag'leri) git'te YOK; bu dosya olmadan
   hiçbir script PocketBase'e bağlanamaz. Eski PC ölmüşse: PB admin şifresi
   Coolify env'inde, Typesense anahtarı Coolify'da — oradan yeniden oluştur.
4. Repo kökünde `npm install` (scripts/ bağımlılıkları kök package.json'da).
5. Görevleri kur:
   ```
   powershell -ExecutionPolicy Bypass -File scripts\setup_price_tasks.ps1
   ```
6. Doğrula: `Get-ScheduledTask QorAI-* | Get-ScheduledTaskInfo` — ertesi sabah
   `%USERPROFILE%\qorai-price.log` içinde `price refresh done` satırını gör.

Elle tek seferlik test (görev beklemeden):
```
node scripts\sync_offers.js --connector=epey_amazon --limit=5 --concurrency=2
```

## Loglar ve sağlık kontrolü

- PC: `%USERPROFILE%\qorai-price.log` (Epey/TR) ve `qorai-price-direct.log` (DE/GB/US)
- Hetzner: `/root/qorai-price.log` — `ssh -i ~/.ssh/hetzner_compair root@<HETZNER_SERVER_IP>` (IP `migration\.env` içinde)
- Admin panel → Scraper sekmesi: `price_sync_status` (public_config) son koşu özetini gösterir
- Fiyatların siteye yansımaması = çoğu zaman TS backfill eksik:
  `node scripts\ts_backfill_lowest_price.js --confirm`

## Epey mağaza fiyatları (2026-07-26 eklendi)

`epey_amazon` connector'ı artık Epey sayfasındaki TÜM mağaza satırlarını okur:

- **Amazon.com.tr** satırı: eskisi gibi affiliate linkli offer (`network=epey_amazon`).
- **En ucuz 3 mağaza** (Hepsiburada, Trendyol, N11, …): fiyat + mağaza adı
  **linksiz** offer olarak yazılır (`network=epey_store`, `url=''`) — sitede
  yalnız logo + fiyat görünür, tıklanmaz (affiliate yalnız Amazon'da var).
- Outlet / Yenilenmiş / 2. el satırlar elenir; mağaza başına en ucuz satır alınır.
- Rollup (lowestPrice / prices{TR} / kart fiyatları / app linkleri) **yalnız
  linkli offer'lardan** hesaplanır — linksiz mağaza satırları vitrin fiyatlarını
  ve buy-box linklerini DEĞİŞTİRMEZ.

## Otomatik yeni ürün keşfi (2026-08-03 eklendi)

**Sorun:** Epey'e yeni ürün eklendiğinde katalogda çıkması için admin panelini
elle açıp `Start Scraping` → `Translate` → `Score Engine` düğmelerine sırayla
basmak gerekiyordu. Fiyatlar otomatik güncelleniyordu ama **yeni ürünler elle**
ekleniyordu.

**İKİ KATMAN.** Asıl yakalama **nabız** katmanındadır (en alttaki bölüm); bu gece koşusu onun EMNİYET AĞIdır.

**Gece koşusu:** `QorAI-ProductDiscovery` her gece 23:20de
`scripts\product_discovery.cmd` zincirini koşar:

1. `node scripts\auto_discover.js` — admin panelini **başsız Chrome'da açar** ve
   `window.qoraiAutoRun()` çağırır:
   - **scrape**: Epey'i destekleyen HER kategoriden URL toplar, PocketBase'de
     zaten olanları eler (`sourceUrl`/`slug`/`id` üçlü kontrolü), yalnız
     gerçekten yeni olanların detayını çeker
   - **çeviri**: `__all_epey__` toplu çeviri — zaten çevrili ürüne dokunmaz
   - **teknik puan**: yalnız yeni ürün giren kategoriler için Score Engine
2. Yeni ürünlere fiyat: `bestOfferCheckedAt=''` filtresiyle Epey→Amazon.com.tr
   pass'i (kota 2000, en yeni önce)
3. `ts_backfill_lowest_price.js --confirm` — fiyatlar site listelerine yansısın

**Neden Puppeteer, neden Node'a taşımadık?** Keşif boru hattının tamamı
(Cloudflare oturumu, URL toplama, tekrar-eleme, detay ayrıştırma, TR→EN sözlük
çevirisi, puan motoru) admin panelinin tarayıcı kodunda — ~20 bin satır.
Node'a kopyalamak ikinci bir gerçek kaynak yaratır ve iki taraf ilk düzeltmede
ayrışır. Aynı sayfayı başsız açınca elle koşu ile gece koşusu **birebir aynı
kodu** çalıştırır.

> **DİKKAT — oturum:** Panelin girişi GitHub OAuth'tur; başsız koşuda OAuth
> yapılamaz. Runner, `migration\.env` içindeki PB superuser bilgileriyle token
> alıp `localStorage.pocketbase_auth`'a yazar. Ayrıca `index.html` betikleri
> dinamik yüklediği için sayfanın kendi "oturumu geri yükle" dinleyicisi
> DOMContentLoaded yarışını kaybediyor (ölçüldü: `authStore.isValid=true` iken
> panel giriş ekranında kalıyor) — `auto_run.js` paneli kendisi açar.

**Zamanlama:** 23:20 + `--max-hours=3`. 03:10'daki `QorAI-PriceRefresh` ile
aynı anda epey.com'a yüklenmemek için böyle — iki koşu çakışırsa Epey oturumu
yanar.

**Log ve sağlık kontrolü:**
- `%USERPROFILE%\qorai-discovery.log` — zincirin tamamı
- `%USERPROFILE%\qorai-discovery-proxy.log` — runner'ın başlattığı proxy
- PocketBase `public_config` → `product_discovery_status` (son koşu özeti:
  eklenen/atlanan/hata sayıları, dokunulan kategoriler, süre)

**Elle çalıştırma / hata ayıklama:**
```
node scripts\auto_discover.js --categories=smart_rings --limit=40 --no-collect-all
node scripts\auto_discover.js --headful          # tarayıcıyı göster
node scripts\auto_discover.js --no-translate --no-score
```

## Epey nabzı — anlık yakalama (2026-08-05 eklendi)

**Sorun:** ürünün siteye girmesi ertesi geceyi bekliyordu; bir dönem de gece
koşusu TÜM katalogu tarıyordu (47 kategori × marka marka → saatler, sıfır ürün).

**Kaynak bize zaten söylüyor:** Epey ana sayfasında kategori **bağımsız** bir
"Son Eklenen Ürünler" bloğu var — siteye en son eklenen ~15 ürün, hangi
kategoriden olursa olsun. Kategori de URL yolunda (`/laptop/…`, `/televizyon/…`).
Yani liste taramaya gerek yok.

`QorAI-EpeyWatch` (15 dk'da bir) → `scripts\epey_watch.cmd` → `epey_watch.js`:

1. **Tek** HTTPS isteği (~116 KB, ~1,4 sn). Node'un TLS parmak izi Epey'de 403
   alıyor → `curl` ile (`connectors/epey_amazon.js` aynı sebeple curl kullanıyor).
2. Bizim kategorilerimizde olmayan adresleri ele (`epeyPath` listesi
   `admin/js/categories.js`'ten okunur — kopyası tutulmaz).
3. Kalanları PocketBase'e sor. Hepsi katalogdaysa **çık** — tarayıcı açılmaz.
4. Yalnız bilinmeyenler için `auto_discover --urls=…` uyandır.

`--urls` modu (`qoraiAutoRun({urls})` → `runScrapeUrls`): kategori
`findCategoryByEpeyUrl` ile URL yolundan çözülür, kategoriye göre gruplanıp
çekilir; **çeviri ve puan yalnız dokunulan kategoriler için** koşar.

**Ölçülen davranış:**

| durum | süre | yük |
|---|---|---|
| yeni ürün yok | ~1,4 sn | 1 istek, tarayıcı açılmaz |
| aday var ama katalogda | ~18 sn | tarayıcı açılır, kayıt yok |
| gerçek yeni ürün | ~1 dk | çekilir + çevrilir + puanlanır + Typesense |

**Bilinmesi gerekenler:**
- Nabız modunda `populateScraperCategories()` atlanır → açılış 4,7 dk → 6 sn.
- Yeni ürün girmediyse çeviri/puan adımlarına HİÇ girilmez; yoksa boş kategori
  listesi `__all_epey__`e düşüp 106k ürünü 429 sayfada tarıyordu.
- **Üstel geri çekilme:** varyant sayfaları (`…-vp-1`, `…-vp-2`) mevcut kayda
  BİRLEŞTİRİLDİĞİ için kendi slug'ıyla PB'ye girmez ve her turda "yeni" görünür.
  Her başarısız denemede bekleme ikiye katlanır (12 saat → en fazla 30 gün).
  Durum dosyası: `%USERPROFILE%\.qorai-epey-watch.json`
- Log: `%USERPROFILE%\qorai-epey-watch.log` (5 MB'ı aşınca `.1` olarak döner)

**Elle:**
```
node scripts\epey_watch.js --dry-run    # yalnız raporla, çekme
node scripts\epey_watch.js              # bak, gerekirse çek
```
