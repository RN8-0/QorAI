# Kalan görevler — yeni sohbetlere yapıştırılacak promptlar

Her başlık ayrı bir sohbete yapıştırılmak üzere yazıldı. Hepsi kendi başına
yeterlidir; önceki sohbetin bağlamına ihtiyaç duymaz.

Öneri sıra: **1 → 2 → 4 → 3 → 5 → 6**
(1 ve 2 veri/akış hatası, 4 kullanıcıyı doğrudan engelliyor, 3 ve 5 görünüm/UX,
6 ölçüm işi.)

---

## GÖREV 1 — Uygulamada mağazalar görünmüyor

```
Proje: C:\Users\RN8\Desktop\Compair-master (Flutter uygulaması + web/ React SPA + PocketBase + Typesense)

SORUN
Bir ürünün web sitesindeki (qorai.net) fiyat bölümünde birden fazla mağaza
görünüyor (Amazon + scraper'ın eklediği Epey mağazaları: Vatan, MediaMarkt,
Hepsiburada vb. logo + fiyat). Mobil uygulamada AYNI ürünün sayfasında bu
mağazalar GÖRÜNMÜYOR, sadece Amazon çıkıyor. Bu sorun daha önce iki kez
"düzeltildi" ama hâlâ devam ediyor — yani yapılan değişiklik ya yanlış katmanı
düzeltti ya da cihazda hiç doğrulanmadı.

BİLİNENLER (varsayma, doğrula)
- Teklifler PocketBase `offers` koleksiyonunda. Alanlar: productId, store,
  network, country, price, shipping, totalPrice, currency, priceText, url,
  affiliateUrl, condition, availability, inStock, priceUnknown,
  matchConfidence, lastCheckedAt, priceUpdatedAt, expiresAt, scrapedAt, source,
  merchantProductId.
- Epey mağaza satırları `network = "epey_store"` ile yazılır, LİNKSİZDİR
  (url boş) ve mağaza domainini `merchantProductId` alanında taşır (favicon
  kaynağı). Web bunları "vitrin" satırı olarak gösterir: logo + fiyat, tıklanmaz.
- Web tarafı: web/src/lib/offers.js → fetchProductOffers(). Filtresi:
  `(o.url || o.hasExactPrice) && isLiveOffer(o) && !hidden.has(storeKeyOf(o))`
  Yani LİNKSİZ ama TAZE FİYATLI satır GÖSTERİLİR.
- Uygulama tarafı: lib/data/datasources/pb_ds.dart → getProductOffers().
  Sonrasında lib/presentation/screens/detail/tabs/prices_tab.dart render eder.
- Admin > 🏪 Mağazalar sekmesinde kapatılan mağazalar
  `public_config.store_settings.hidden` içine yazılır; web offers.js ve app
  pb_ds.dart aynı kaydı okur (10 dk önbellek). Bir mağaza yanlışlıkla kapalı
  olabilir — ÖNCE bunu kontrol et.
- KURAL (değişmez): seçili ülkenin fiyatı yoksa BAŞKA ülkenin fiyatı GÖSTERİLMEZ.
  Cross-market fallback EKLEME.

YAPILACAK
1. Önce VERİYİ doğrula, koda bakmadan önce: gerçek bir ürün id'si seç (web'de
   çok mağazalı görünen bir ürün) ve PocketBase'den o productId'nin tüm
   offers kayıtlarını çek. Kaç satır var, store/network/country/url/price
   alanları ne? Bunu çıktı olarak göster.
2. Sonra iki tarafı YAN YANA karşılaştır: web fetchProductOffers() hangi
   satırları eliyor, app getProductOffers() hangilerini eliyor. Farkı bul.
   Şüpheliler: ProductOfferModel.fromPb() alan eşlemesi, `isLive` getter'ı,
   `isFresh`/`hasExactPrice` hesabı, ülke filtresi, linksiz satırın elenmesi,
   perPage limiti, sort.
3. Kök nedeni tek cümleyle yaz, sonra düzelt.
4. CİHAZDA DOĞRULA — bu şart. `adb devices` ile telefonu gör, uygulamayı kur,
   web'de çok mağazalı görünen o ürünü aç, ekran görüntüsü al ve mağaza
   satırlarını say. flutter analyze davranışı KANITLAMAZ.

BİTTİ SAYILMA KOŞULU
Cihaz ekran görüntüsünde, web'de görünen mağazaların aynısı uygulamada da
Amazon'un altında logo + fiyat olarak görünüyor.

ÇALIŞMA KURALLARI
- Benimle Türkçe konuş.
- Soru sorma, kod/log/git ile kendin araştır.
- İş bitince master'a push et.
- Web değişikliği yaptıysan `npm run build` (vite + SEO), sadece `vite build` DEĞİL.
```

---

## GÖREV 2 — Karşılaştırma analizi sonsuza kadar dönüyor + bildirim ana sayfaya atıyor

```
Proje: C:\Users\RN8\Desktop\Compair-master — web/ React SPA (qorai.net)

İKİ BAĞLANTILI HATA
(a) Karşılaştırma sayfasında AI analizi başlatıp sayfadan ÇIKINCA (veya
    karşılaştırmayı kapatınca) analiz asla bitmiyor: Qor AI baloncuğu sonsuza
    kadar dönüyor, iş hiç "hazır" durumuna geçmiyor.
(b) O sırada baloncuk bildirimine tıklayınca ANA SAYFAYA atıyor; karşılaştırma
    sonucuna gitmiyor.

İLGİLİ DOSYALAR
- web/src/lib/analysisHub.js — baloncuğun okuduğu merkezi iş kaydı; pathFor()
  hangi adrese gidileceğini üretir. Şu an compare için
  `${META.compare.path}?view=analysis` döndürüyor.
- web/src/lib/compareAnalysisJobs.js — karşılaştırma işinin store'u
  (listener + emit + localStorage). Diğer akışların store'ları:
  linkAnalysisJobs.js, subscriptionAnalysisJobs.js, productAnalysisJobs.js.
- web/src/pages/Compare.jsx — `?view=analysis` parametresini okuyup 'ai'
  sekmesini açan effect var; ürün seçimi boşsa sayfa muhtemelen ana sayfaya
  yönleniyor.
- web/src/components/AiBubble.jsx — baloncuk.

MUHTEMEL KÖKLER (doğrula, varsayma)
(a) için: iş, bileşen unmount olduğunda iptal ediliyor veya devam eden promise
    sonucu artık kimse dinlemediği için store'a yazılmıyor olabilir. Link
    analizi bu sorunu YAŞAMIYOR — linkAnalysisJobs.js modül seviyesinde
    çalışıyor ve sonucu her hâlükârda store'a yazıyor. İki store'u satır satır
    karşılaştır ve compare'de eksik olanı bul. Ayrıca 'error' fazına düşen bir
    iş baloncukta hâlâ "çalışıyor" gösteriliyor olabilir — faz geçişlerini
    kontrol et.
(b) için: /compare adresi, karşılaştırma havuzu (seçili ürün id'leri)
    boşaldığında ana sayfaya yönlendiriyor olabilir. Çözüm: iş kaydında
    analizin ürün id'lerini SAKLA ve pathFor() bunları URL'e koysun
    (ör. /compare?ids=a,b&view=analysis), Compare.jsx da bu id'lerle havuzu
    yeniden kursun.

YAPILACAK
1. Tarayıcıda ÜRET: iki ürün seç, analizi başlat, hemen başka sayfaya git,
   baloncuğu izle. Konsol ve store durumunu oku. Ne olduğunu ölçerek yaz.
2. Kök nedeni tek cümleyle yaz, sonra düzelt.
3. Tarayıcıda DOĞRULA: (a) sayfadan çıkıp dolaştıktan sonra analiz tamamlanıyor
   ve baloncuk "hazır" oluyor, (b) bildirime tıklayınca doğrudan karşılaştırma
   analizi sonucu açılıyor — ana sayfa değil.

ÇALIŞMA KURALLARI
- Türkçe konuş. Soru sorma, kendin araştır.
- Bitince master'a push + `npm run build` (vite + SEO) + Coolify deploy
  (`node scripts/deploy_coolify_static.js website`).
```

---

## GÖREV 3 — Uygulamada abonelik ve link analizi ekranları eski şablonda

```
Proje: C:\Users\RN8\Desktop\Compair-master — Flutter uygulaması

DURUM
Web'de dört AI akışı (ürün, karşılaştırma, link, abonelik) TEK rapor şablonunu
kullanıyor: web/src/components/AiReportView.jsx.
Uygulamada ÜRÜN ve KARŞILAŞTIRMA raporları bu şablona geçirildi
(lib/presentation/widgets/shared/ai_report_view.dart içindeki `_UnifiedBody`).
LİNK ANALİZİ ve ABONELİK ekranları HÂLÂ eski çok panelli düzeni kullanıyor.

YAPILACAK
1. Şu iki ekranı `_UnifiedBody` ile aynı şablona geçir:
   - lib/presentation/screens/link_paste/widgets/result_detail_widgets.dart
   - lib/presentation/screens/subscriptions/service_detail_screen.dart
2. Hazır parçalar (yeniden yazma, kullan):
   - lib/presentation/widgets/shared/ai_charts.dart → DecisionBadge,
     AnimatedBarFill, SentimentDonut, DistributionBar, AiCollapsible,
     normalizeSentiment, factorDistribution, firstSentencesOf
   - lib/presentation/widgets/shared/ai_charts_ext.dart → AicRadarChart,
     AicFactorList, AicCriticalPoints, AicQuizImpact, AicCommunityThemes,
     AicSourceChips, AicStatTiles
   - lib/presentation/widgets/shared/ai_unified_report.dart → UrSection,
     UrForWho, UrVerify, urBullets, urBandLabel
3. Bölüm sırası web ile BİREBİR aynı olmalı:
   hero (skor + karar rozeti + tek cümle) → KPI kutuları → radar →
   sentiment donutu → faktör dengesi → faktör faktör → kritik noktalar →
   artı/eksi → quiz etkisi → topluluk temaları → kaynak rozetleri →
   övgü/şikâyet → topluluk özeti → tam değerlendirme → sana uyumu →
   kime uygun/değil → özellik-ihtiyaç (varsayılan kapalı) → alternatifler →
   zamanlama → son karar → doğrulama notları.
4. Bu ekranların promptları gerekli alanları üretmiyorsa üretecek hâle getir:
   criticalPoints, quizInsights, community.themes, community.sentimentBreakdown,
   bestFor, notFor, decision, confidence, overallVerdict. Prompt dosyası:
   lib/services/ai_report_service.dart (ürün/karşılaştırma promptlarında bu
   alanlar zaten var — örnek olarak onlara bak).

KURALLAR
- Renk DAİMA veriden gelsin, animasyona bağlanmasın.
- reduced-motion açıkken animasyon olmasın.
- `flutter analyze lib/` TEMİZ olmalı (0 uyarı).
- CİHAZDA DOĞRULA: adb ile kur, link analizi ve abonelik analizi çalıştır,
  ekran görüntüsü al. flutter analyze davranışı kanıtlamaz.

ÇALIŞMA KURALLARI
- Türkçe konuş. Soru sorma. Bitince master'a push et.
```

---

## GÖREV 4 — Kısaltılmış linkler mobilde hata veriyor

```
Proje: C:\Users\RN8\Desktop\Compair-master — Flutter uygulaması

SORUN
Mobil uygulamada Link Analizi ekranına kısaltılmış bir bağlantı yapıştırınca
(örn. https://amzn.eu/d/0j9wMEax, a.co/..., ty.gl/...) analiz başlamıyor ve
şu uyarı çıkıyor:
"Bu bağlantıdaki ürünü tanıyamadık (kısaltılmış link olabilir). Yanlış bilgi
göstermemek için analiz durduruldu. Ürün adının göründüğü TAM bağlantıyı
yapıştırmayı deneyin."

BİLİNEN KÖK NEDEN (kayıtlı bulgu — tekrar araştırma, üzerine inşa et)
Kısaltılmış link cihazdan çözülemiyor çünkü Dart'ın TLS parmak izi bot olarak
görülüyor: aynı URL'e `curl` 301 dönerken `Dio` ve `dart:io` HttpClient 403
alıyor. HEAD ile GET de farklı davranıyor. Yani BU İŞ İSTEMCİ TARAFINDA
HTTP İSTEMCİSİYLE ÇÖZÜLEMEZ.

ÇÖZÜM YÖNÜ
Kısa link çözümlemeyi SUNUCUYA taşı. Zaten var olan altyapı:
- PocketBase (Hetzner) — pb_hooks altında uç nokta eklenebilir.
- scraper-proxy — web tarafı JSON-LD çekerken bunu kullanıyor
  (web/src/lib/jsonld.js içine bak).
Uygulama kısa linki sunucuya göndersin, sunucu yönlendirmeyi izleyip NİHAİ
URL'i (ve mümkünse sayfa başlığını) döndürsün. Uygulama da bu nihai URL ile
normal akışına devam etsin.

YAPILACAK
1. Önce mevcut davranışı ÖLÇ: uygulamadaki çözümleme kodunu bul
   (lib/ içinde "resolveShortLink" / "amzn" / "expandUrl" benzeri ara),
   hangi noktada 403 aldığını logla.
2. Sunucu tarafına çözümleme ucu ekle (PB hook veya scraper-proxy).
   Güvenlik: yalnız http/https, yönlendirme sayısı sınırlı (≤5), zaman aşımı,
   iç ağ adreslerine (localhost, 127.*, 10.*, 192.168.*, 169.254.*) istek
   ENGELLİ (SSRF koruması).
3. Uygulamayı bu uca bağla. Çözülemezse mevcut nazik uyarı kalsın.
4. CİHAZDA DOĞRULA: gerçek bir amzn.eu linkiyle analiz baştan sona çalışsın.
   Ekran görüntüsü al.

ÇALIŞMA KURALLARI
- Türkçe konuş. Soru sorma. Bitince master'a push et.
- PB hook dağıtımı: pb_hooks dosya bazlı bind-mount + scp + docker restart
  (Hetzner SSH host adı: qorai_hetzner).
```

---

## GÖREV 5 — Bildirim/UX üçlüsü (bildirim sayfası açıkken bildirim, abonelik geri butonu, analiz süresi)

```
Proje: C:\Users\RN8\Desktop\Compair-master — Flutter uygulaması (+ gerekirse web/)

ÜÇ AYRI HATA — üçünü de çöz.

(A) BİLDİRİM SAYFASI AÇIKKEN BİLDİRİM GELİYOR
Kullanıcı zaten analiz/bildirim ekranındayken "analiz hazır" bildirimi
gösteriliyor. Kullanıcı o içeriğe zaten bakıyorsa bildirim BASTIRILMALI.
İlgili: lib/presentation/widgets/floating_ai_assistant_overlay.dart ve
analiz bildirimlerini yayan provider (analysisHub karşılığı).
Çözüm yönü: o an görüntülenen rota/ekran, bildirimin hedefiyle aynıysa
bildirimi gösterme (rota farkındalığı zaten var — "_routePath shell-branch"
yerine görüntülenen içerik kimliği kullanılıyor, aynı deseni uygula).

(B) ABONELİK SAYFASINDA GERİ/ÇIKMA BUTONU BUG'I
Analiz başladıktan SONRA abonelik ekranındaki geri (çıkma) butonu doğru
çalışmıyor. Beklenen davranış: geri basınca analiz arka planda SÜRMELİ,
ekran kapanmalı, sonra bildirimle geri dönülebilmeli. Şu an bozuk — önce
tam olarak NE olduğunu üret ve yaz (hiç kapanmıyor mu, analizi iptal mi
ediyor, yanlış ekrana mı gidiyor), sonra düzelt.

(C) UYGULAMADA ANALİZLER ÇOK UZUN SÜRÜYOR
Web tarafında şu iyileştirmeler yapıldı, uygulamada var mı kontrol et ve yoksa
uygula:
  - Araştırma (grounded web taraması) QUIZ SIRASINDA paralel koşar, quiz
    bitince beklenmez.
  - Rapor TEK çağrı değil İKİ PARALEL çağrıdır (karar yarısı + topluluk/pazar
    yarısı) — tek çağrıda çıktı sınırına takılıp kırpılıyordu.
  - Toplam süre bütçesi var: her sağlayıcı denemesi kalan süreye göre kısılır,
    süre bitince elde olanla devam edilir.
Referans: web/src/lib/linkAnalysis.js, web/src/lib/ai.js.
Uygulama karşılığı: lib/services/ai_report_service.dart, lib/services/ai_service.dart.
ÖLÇ: değişiklikten önce ve sonra analiz süresini saniye cinsinden yaz.

ÇALIŞMA KURALLARI
- Türkçe konuş. Soru sorma.
- `flutter analyze lib/` temiz olmalı.
- CİHAZDA DOĞRULA (adb) — üç maddeyi de ekranda gör.
- Bitince master'a push et.
```

---

## GÖREV 6 — Mobil web performansı: fps/jank ölçümü

```
Proje: C:\Users\RN8\Desktop\Compair-master — web/ React SPA (qorai.net)

SORUN
Site masaüstünde sorunsuz, MOBİLDE kötü: sayfa bileşenleri geç geliyor,
kaydırırken donuyor, fps düşüyor.

ZATEN YAPILDI (tekrarlama)
- Ana render-blocking CSS paketi 120 KB → 93 KB düşürüldü: paylaşılan bir
  bileşen (AiReportView.jsx) LinkAnalysis.css'i import ettiği için Vite o
  CSS'i tembel parçadan çıkarıp giriş paketine taşımıştı. Artık CSS'i
  SAYFALAR import ediyor. Bu bir kısmını çözdü, hepsini değil.

BİLİNEN GEÇMİŞ (doğrula, körlemesine uygulama)
- Kaydırma takılmasının bilinen kaynağı: animasyonlu blur "orb" arka planı ve
  kart başına `backdrop-filter`. Mobilde statik/kapalı + `content-visibility`
  uygulanmıştı — hâlâ öyle mi kontrol et.
- Ana sayfa "instant-paint" önbelleği bir dönem siteyi YAVAŞLATIYORDU
  (warm 7134 ms > cold 2508 ms): zengin spec'li kartlar 733 KB'a yazılıyordu.
  Kaldırıldı; geri gelmiş olabilir mi bak.

YAPILACAK — TAHMİN ETME, ÖLÇ
1. Chrome DevTools Performance ile MOBİL emülasyonda (375×812, 4x CPU
   throttling, Slow 4G) ana sayfa ve bir ürün sayfası için trace al.
   Şunları sayı olarak yaz: LCP, TBT, uzun görevler (>50 ms) ve her birinin
   kaynağı, kaydırma sırasındaki ortalama/en düşük fps, layout thrash var mı.
2. En pahalı 3 nedeni bul ve tek tek düzelt. Her düzeltmeden SONRA aynı
   ölçümü tekrar al; önce/sonra tablosu ver.
3. Şüpheli listesi (doğrulanmadan düzeltme): blur/backdrop-filter, gölge
   yığınları, büyük görseller (boyut/format/lazy), gereksiz re-render
   (memoization eksikliği), ana iş parçacığında JSON işleme, tek seferde çok
   fazla DOM düğümü, font yükleme, üçüncü taraf scriptler (AdSense/Analytics).
4. Kanıt olarak önce/sonra ölçüm çıktısını paylaş.

ÇALIŞMA KURALLARI
- Türkçe konuş. Soru sorma.
- Ölçmeden "düzelttim" deme.
- Bitince `npm run build` (vite + SEO), master'a push,
  `node scripts/deploy_coolify_static.js website` ile deploy.
```
