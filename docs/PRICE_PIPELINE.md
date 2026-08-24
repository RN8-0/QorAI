# Qor AI — Fiyat + Katalog Otomasyonu Runbook

_Son güncelleme: 2026-08-24_

## 2026-08-24 — FİYAT İŞLERİ HETZNER'DAN PC'YE TAŞINDI

Amazon, Hetzner'ın datacenter IP'sine **dört pazarda birden** bot duvarı
çıkarmaya başladı. Ölçüldü (`/root/qorai-price.log`): gece koşusu 291 → **19**
teklif, hata 2.870 → **5.993**, süre 9,4 saatten 4 dakikaya düştü — yani iş
yapmıyor, hızlı hata veriyordu. Log satırı:

```
! amazon_direct: TR/DE/GB/US breaker open (amazon <X> bot page) — cooling down 45 min
! breaker open — Amazon bot wall hit on every market; remaining products left untouched
```

~17 üründen sonra dört pazar birden kapanıyor ve kalan 780 ürüne hiç
bakılmıyordu. Bu, Epey'in aynı sunucuyu banlamasıyla **aynı sınıf** sorun ve
kod tarafında çözümü yok. `10 3` ve `10 15` cron'ları Hetzner'da **yoruma
alındı** (silinmedi — geri almak tek satır).

## Mimari: ne nerede çalışıyor?

| Görev | Nerede | Zaman | Ne yapar |
|---|---|---|---|
| `QorAI-PriceRefresh` | **PC** (Task Scheduler) | 03:10 | **GECE ZİNCİRİ** (`price_nightly.cmd`): önce **TR** (`epey_amazon` — 9000+6000+800+300), sonra **DE/GB/US** (`amazon_direct` — 300+250+1200). Her ikisi TS backfill ile biter |
| `QorAI-EpeyWatch` | **PC** (Task Scheduler) | 15 dk'da bir | **Epey nabzı** — "Son Eklenen Ürünler"i TEK istekle okur; yeni ürün varsa anında çeker. Tarama yok |
| `QorAI-ProductDiscovery` | **PC** (Task Scheduler) | 23:20 | Nabzın **emniyet ağı**: kategori bazlı en-yeni listesinden kaçanları toplar |
| `QorAI-Weekly` | **PC** (Task Scheduler) | Pazar 02:00 | Haftalık bakım zinciri |
| `qorai-seo-refresh.sh` | **Hetzner** (cron) | 04:17 | Sitemap + ön-render kabukları + rehberler → commit + deploy |
| `refresh-fcm-token.sh` | **Hetzner** (cron) | 50 dk'da bir | FCM access token → PB `app_config` |

**Fiyatın tek gerçek kaynağı artık PC'dir.** Hetzner'da yalnız bot duvarına
çarpmayan işler kaldı (SEO ön-render, FCM token).

Görevler kaçırılan koşuyu telafi eder (`-StartWhenAvailable`), pil engel
değildir ve üst üste tetiklenirse yenisi atlanır — yani **PC gece kapalıysa
koşu açılışta çalışır**. (Ölçüldü 2026-08-24: PC 01:26–11:24 uyudu, 03:10
koşusu kaçtı ve 11:25'te uyanışta telafi edildi. `-WakeToRun` ayarı duruyor
ama Windows uyandırma zamanlayıcıları kapalıysa PC uyanmaz — o durumda koşu
uyanışa kadar bekler.)

## NEDEN TEK GÖREV — açlık sorunu

TR ve DE/GB/US **aynı kilidi** kullanıyor (`qorai_lock.cmd`; Epey oturumu
yanmasın ve PB ağır sorguları çakışmasın diye). İki ayrı görev olarak
kurulduklarında hangisinin kilidi önce kaptığı **tetiklenme sırasına** kalıyor
ve PC gece uyursa ikisi de uyanışta aynı anda fire ediyor — sıra garanti değil.

2026-08-24'te tam bu oldu: DIRECT kilidi kaptı, TR 5 saat bekleyip atlayacaktı.
Ölçüm neden önemli olduğunu gösteriyor:

| Zincir | Süre | Teklif | Verim |
|---|---|---|---|
| TR (`epey_amazon`) | ~16 sa | **25.258** | ~1.580/sa |
| DIRECT (`amazon_direct`) | ~22 sa | ~400 | ~18/sa |

İkisinin toplamı **38 saat/gün** — bir güne sığmıyordu. Yani 88 kat verimli
olan zincir, marjinal olan yüzünden hiç koşmayabilirdi.

Çözüm: **tek görev, sabit sıra** (`price_nightly.cmd` → önce TR, sonra DIRECT)
ve DIRECT'in 3. pass kotası 8000 → **1200**. Toplam ~20 saate iner.
DE/GB/US daha yavaş tazelenir; katalogun fiyatı zaten TR'de
(TR 34.261 / DE 1.280 / GB 326 / US 297).

## İKİ PC ÇAKIŞMAZ — işçi kiralaması

Repo başka bir PC'ye klonlanıp görevler orada da kurulursa iki PC aynı ürünleri
tarar, birbirinin rollup damgasını ezer ve ikisi birden Amazon'a vurup bot
duvarını kendileri tetikler. Bunu `scripts/worker_lease.js` engelliyor:
PocketBase'de (`public_config` → `worker_leases`) **tek bir sahiplik kaydı**
tutulur.

- `.cmd` zinciri koşmadan önce `worker_lease.js claim price` çağırır.
  Sahibi **hayattaki başka bir PC** ise koşu sessizce atlanır (çıkış 1, log'a
  tek satır) — hata değildir.
- **Bayatlık eşiği 26 saat.** Bir gecelik kapalı PC sahipliğini kaybetmesin
  diye bilerek bir günden uzun; daha kısa eşik iki PC arasında gidip gelmeye
  yol açardı.
- **PB'ye ulaşılamazsa iş ENGELLENMEZ.** Kiralama bir eniyileştirme, güvenlik
  kapısı değil; ağ sorunu yüzünden gece koşusunu kaçırmak daha pahalı.

## YENİ PC'YE TAŞIMA (bu PC bozulursa)

1. Repoyu klonla: `git clone https://github.com/RN8-0/QorAI.git`
2. `migration\.env` dosyasını eski PC'den kopyala — **gizli anahtarlar git'te
   YOK**, bu dosya olmadan hiçbir script PB'ye bağlanamaz. (Kurulum bu dosya
   yoksa görevleri kurmaz ve sebebini yazar.)
3. Node.js kur, repo kökünde `npm install`
4. `admin\start-scraper-proxy.bat` çalıştır.

4. adım yeterlidir: proxy açılışta görevleri **kendiliğinden kurar**
(`ensurePriceTasks`, idempotent) ve işçi kiralamasını yoklar. Eski PC 26 saattir
görünmüyorsa yeni PC devralır; beklemek istemiyorsan admin panelinde
**💵 Fiyat** sekmesindeki **“Bu PC'yi işçi yap”** düğmesi anında devreder.

## Admin panelden görünen

**Tarayıcı → 💵 Fiyat** sekmesi:
- **👷 Fiyat işçisi** — işi hangi PC koşturuyor, bu PC yedek mi, devir eşiği
- Görev listesi: kurulu mu, sonraki/son koşu — Windows görev zamanlayıcısından
- **Gece görevlerini bu PC'ye kur** / **Bu PC'yi işçi yap** düğmeleri
- Canlı koşu durumu + **terminal çıktısı** (`/price/status` → `logTail`)
- Adım adım ilerleme ve geçmiş: **Otomatik İşler** kutusu
  (`public_config` → `job_runs`, `scripts/job_status.js` yazar)

Kaynak uçlar: `scripts/scraper-proxy.js` → `/price/schedule`, `/price/status`,
`/price/run`, `/price/stop`, `/price/coverage`.

## "Bu PC kapanırsa / bozulursa ne olur?"

- **Fiyatlar bayatlar.** Artık fiyat işlerinin tek koşucusu PC. Rollup damgası
  (`bestOfferExpiresAt`) dolunca kartlarda fiyat **gizlenir**
  (`web/src/lib/format.js` → `priceForCountry`), yani ürün "fiyatlı" görünse
  bile fiyat çıkmaz. Bu bilinçli bir karar: bayat fiyat göstermek yanlış fiyat
  göstermektir.
- **Site çalışmaya devam eder.** Web sitesi, admin panel, PocketBase, Typesense,
  SEO ön-render ve push bildirimleri Hetzner'da — PC ile ilgisi yok.
- **Telafi:** PC (veya yeni PC) açılınca kaçırılan koşu kendiliğinden çalışır.
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

## Başka bir PC'ye taşıma / yedek makine (2026-08-05)

**Neden mesele:** Epey datacenter IP'lerini 403'lüyor; ürün keşfi ve TR mağaza
fiyatları **ev IP'sinden** koşmak zorunda. Bu yüzden otomasyon tek bir PC'ye
bağlı. O PC bozulur/değişirse keşif + TR fiyatları durur (Amazon TR/DE/GB/US
Hetzner'dan devam eder, site fiyatsız kalmaz).

**Yeni PC'yi devreye almak — tek komut:**
```
git clone <repo> C:\...\Compair-master
copy  migration\.env          <-- ESKİ PC'DEN, elle. Gizli anahtarlar git'te YOK.
powershell -ExecutionPolicy Bypass -File scripts\setup_qorai_pc.ps1
```
Script sırayla: node/curl/Chrome kontrolü → `migration\.env` içindeki 5 zorunlu
anahtarın varlığı → `npm install` → **PocketBase'e gerçek bağlantı denemesi** →
çeviri worker'ı kurulu mu (yoksa `npm run translate:setup` der) → dört görevi
kurar (nabız 15 dk, keşif 23:20, TR fiyat 03:10, DE/GB/US 03:12) ve durumu
yazdırır.

> **İKİ MAKİNE AYNI ANDA KOŞMASIN.** Eski PC hâlâ açıksa orada
> `scripts\setup_qorai_pc.ps1 -Uninstall` çalıştır. Aksi hâlde iki makine
> aynı anda Epey'e yüklenir ve oturum yanar.

**Elle taşınan tek şey `migration\.env`.** Eski PC öldüyse: PocketBase admin
şifresi ve Typesense anahtarı Coolify ortam değişkenlerinde durur, oradan
yeniden üretilir.

**Notlar:**
- Chrome/Edge şart: `scraper-proxy` Cloudflare için GERÇEK tarayıcı kullanır
  (başsız olamaz). Pencere ekran dışına alınır (`SCRAPER_OFFSCREEN=0` ile geri açılır).
- Çeviri worker'ı (`scripts\nllb-ct2`, ~2.5 GB) kurulu değilse çeviri yalnız
  mevcut sözlükle yapılır ve sözlükte olmayan atomlar Türkçe kalır. Kurulum:
  `npm run translate:setup`. Koşu worker'ı kendisi başlatır.
- Admin paneli (Coolify'da) HER PC'den açılır; otomasyonun bu PC'de kurulu
  olup olmadığını Scraper sekmesindeki proxy durumundan görürsün.
