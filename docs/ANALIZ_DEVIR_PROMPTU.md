# Qor AI — Analiz yayınlama sistemi

> Sistemin BUGÜNKÜ hâli. Önceki sürüm bir "devir promptu"ydu (yapılacaklar listesi);
> o liste 2026-08-22'de bitirildi ve bu dosya artık kaydın kendisi.
> Kod tabanı `C:\Users\RN8\Desktop\Compair-master`.

---

## Bağlam

Site: **qorai.net** (React/Vite SPA, `web/` → `website/` build çıktısı, Coolify static).
Admin: **ayrı bir Coolify uygulaması** (`admin/`, düz vanilla JS, derlenmiyor).
Veri: PocketBase + Typesense. Diller **yalnız TR + EN** (Almanca 2026-08-21'de kaldırıldı).

Deploy: `node scripts/deploy_coolify_static.js website` / `... admin` — **önce commit + push şart.**
Site build: `cd web && npm run build` (~25 dk, katalog çekimi yüzünden).

---

## Mimarinin tek cümlesi

**Analiz TEK YERDE üretilir, TEK YERDE çizilir.** Prompt'lar tek dosyada, rapor
görünümü sitedeki bileşenin kendisi. İkinci bir kopya yok — çünkü proje bu dersi
spec çevirisinde bir kez ödedi (bkz. `admin/js/spec_i18n.js`).

---

## 1. Prompt'lar — TEK KAYNAK

`admin/js/qor_ai_prompts.js` (klasik `<script>`, IIFE → `globalThis.QorAiPrompts`)

İçindekiler ve nereden **taşındıkları** (kopyalanmadı — 31 fonksiyonun tamamı
`git show HEAD:<dosya>` ile byte-byte karşılaştırılarak doğrulandı):

| Ne | Kaynak |
|---|---|
| `buildFullPrompt`, `buildCompare*`, `buildDeep/Alt/Advisor/Prediction/Forum/*ResearchPrompt`, `parseAiJson`, `hasStaleAvailabilityClaims`, `withFreshnessRetryInstruction`, `productLine`, `promptContext`, `languageGate`, `freshnessRules`, `availabilityContextForProduct`, `productSpecsContext`, `quizLines`, `cleanProductForPrompt`, `arr`, `firstSentences` | `web/src/components/AiAnalysis.jsx` |
| `quizGenerationPrompt`, `compareQuizGenerationPrompt`, `subscriptionQuizPrompt`, `productQuizCount`, `compareQuizCount`, `subscriptionQuizCount`, `isComplexQuizCategory`, `variationSeed`, `languageName` | `web/src/lib/linkAnalysis.js` |
| `cleanProductName`, `displayProductName` | `web/src/lib/productNames.js` |
| `slugifyProduct`, `productSlug`, `productPath` | `web/src/lib/routes.js` |
| `groundedResearchSystemPrompt` | `web/src/lib/ai.js` (`askQorAiGrounded`) |
| `buildPublishMetaPrompt` | YENİ — yayın başlığı/özeti/meta/SSS, iki dil tek çağrıda |
| `buildQuizTranslationPrompt` | YENİ — quiz cevaplarını hedef dile çevirir |

### `admin/js/qor_ai_link.js` — link + abonelik MOTORU

`web/src/lib/linkAnalysis.js`'in **tamamı** buraya taşındı (29 fonksiyon,
byte-byte doğrulandı): `analyzeLink`, `enhancedAnalysis`, `compareAnalysis`,
`subscriptionAnalysis`, araştırma fonksiyonları ve bunların prompt'ları.

**Taşıma katmanı ENJEKTE EDİLİR** — motor hangi sağlayıcıya gittiğini bilmez:

```js
QorAiLink.configure({ askJson, askGrounded, adminPrompt })
```

Site kendi `ai.js`'ini verir (`web/src/lib/linkAnalysis.js` artık sadece
köprü), admin kendi proxy istemcisini. **Aynı kod, aynı prompt, iki taraf.**

**Kim okuyor:**
- Site → `web/src/lib/aiPrompts.js` (köprü; derlemede içe aktarır, çalışma
  zamanında admin'e bağımlı DEĞİL). `productNames.js` ve `routes.js` de artık
  buradan re-export ediyor.
- Admin → doğrudan `QorAiPrompts.` (index.html script listesinde `analyses.js`'ten ÖNCE).
- Node (build) → `scripts/_spec_sandbox.mjs` ile koşturulabilir (spec_i18n ile aynı desen).

**Prompt metnini değiştirmek = hem siteyi hem admin'i değiştirmek.** Başka yolu yok.

---

## 2. Admin — analiz BURADA üretilir

`admin/js/analyses.js` (UI) + `admin/js/qor_ai_run.js` (motor)

İki yol var:

**a) Yeni analiz üret** — 4 adım. Birinci adım **ÜÇ KAYNAKTAN** biri:

| Kaynak | Giriş | Motor |
|---|---|---|
| **Ürün** | Typesense'te ara, katalogdan seç | `buildFullPrompt` (ürün raporu) |
| **Link** | 1-4 ürün linki yapıştır | `analyzeLink` → `enhancedAnalysis` (tek) / `compareAnalysis` (2+) |
| **Abonelik** | Virgülle servis adları | `subscriptionAnalysis` |

Link ve abonelik, sitedeki Link Analizi / Abonelikler sayfalarıyla **aynı
motoru** kullanır (`admin/js/qor_ai_link.js`). Abonelikte "aynı tür" kuralı da
aynı: video ile müzik karşılaştırılmaz (`subscriptionsMixCategories`).

Sonraki adımlar üç kaynakta da AYNI: **quiz'i admin'de yanıtla**
→ rapor **TR + EN** → yayın meta'sı. 6 AI çağrısı:
TR araştırma → TR rapor → **quiz cevaplarının EN çevirisi** → EN araştırma →
EN rapor → meta+SSS (iki dil tek çağrı). Sıra ve tazelik onarımı sitedeki
`runProductAnalysisJob()` ile birebir aynı. Sonuç **taslak olarak hemen
kaydedilir** (önizleme kaydı `?id=` ile çekiyor, ayrıca 6 çağrılık iş sekme
kapanınca kaybolmasın).

**QUIZ CEVABI ÇEVİRİSİ — neden var:** sitede quiz kullanıcının dilinde üretilip
rapor aynı dilde yazılır, uyumsuzluk olmaz. Adminde quiz BİR KEZ (Türkçe)
yanıtlanıp İKİ rapor üretiliyor ve aynı Türkçe cevap dizesi İngilizce raporun
`quizInsights[].answer` alanına olduğu gibi kopyalanıyordu — canlı sayfada
"HOW YOUR ANSWERS SHAPED THIS" başlığının altında Türkçe cümleler görünüyordu
(ölçüldü, 6/6 cevap). Prompt'u sertleştirmek çözmez; model kullanıcının
cevabını ALINTI sayıp aynen yazıyor. Rapordan önce çeviriliyor
(`buildQuizTranslationPrompt`).

### Ekran: düzenleme yok, önizleme var
Rapor da başlık/özet/meta/SSS de AI üretiyor ve hepsi SEO'ya göre kuruluyor —
o yüzden **hiçbir alan elle düzenlenmiyor**. İlk sürümde her alan bir `<input>`
idi; anlamsızdı. Ekran şimdi:

- **Önizleme = sitedeki sayfanın kendisi**, `<iframe>` içinde. Admin vanilla JS,
  site React; raporu adminde ikinci kez çizmek iki tasarımın ayrışması demek.
  Taslak kayıt `?id=` ile açılır (`pages/AnalysisPost.jsx`) ve o adres
  `noindex`. Dil sekmesi adres önekini değiştirir: `/analiz/…` = EN,
  `/tr/analiz/…` = TR. Sitede manuel dil seçici YOKTUR; önek zaten var olan
  mekanizma.
- **Künye** (başlık, özet, `<title>`, açıklama, SSS, adres, rapor özeti) salt
  okunur, karakter sayaçlarıyla.
- **Yayınla / Yayından kaldır / Meta'yı yeniden üret / Sil** — üstte, sağda.

`metaTitle` 60 karakteri aşarsa `publishMeta` **bir kez yeniden ister**
(kırpmak başlığın son kelimesini yarıyor).

**b) Sitede yapılmışlardan al** — `saved_analyses`'ten seç: `product_history`,
`link_history`, `subscription_history`. Bu yol **tek dillidir** (analizin yapıldığı
dil); ikinci dil boş kalır ve uydurma çeviri yazılmaz.

`qor_ai_run.js` yalnızca TAŞIMA katmanıdır (hangi proxy, hangi sırayla, kaç deneme)
— sıra `web/src/lib/ai.js` ile aynı: Gemini önce (yalnız 5xx'te bir tekrar),
sonra DeepSeek. Grounded araştırma yalnız Gemini'de (Google Search aracı).

---

## 3. `analyses` koleksiyonu

`migration/create_analyses_collection.js` — idempotent, eksik alanı ekler.

Kritik alanlar:
- `kind`: `product` | `link` | `subscription` (boş = eski ürün analizi)
- `report_tr` / `report_en`: dil başına HAM rapor. `report` tek dilli ESKİ alan,
  yalnız geriye dönük okuma için duruyor.
- `subjectNames`: link/abonelik analizinde konu adları (katalog ürünü yok)
- `sourceRef`: kaynak `saved_analyses` kaydının id'si
- `title_*`, `lead_*`, `metaTitle_*`, `metaDescription_*`, `faq_*`
- `created`/`updated` **autodate** — unutulursa `sort=-updated` HTTP 400 verir.

---

## 4. Sayfa — sitedeki raporun BİREBİR aynısı

`web/src/pages/AnalysisPost.jsx` sarmalayıcı olarak `.page > .container` (1240px)
kullanır — ürün sayfasındaki analizle **aynı genişlik**. Rapor gövdesini kim çiziyorsa
o çizer:

| kind | bileşen | nerede de kullanılıyor |
|---|---|---|
| `product` | `ProductFullReport` | ürün sayfası |
| `subscription` | `SubscriptionReportView` | Abonelikler sayfası |
| `link` (2+ ürün) | `CompareResult` | Link Analizi sayfası |
| `link` (tek ürün) | `AiReportView` | ortak şablon |

Son ikisi **tembel** yüklenir. `SubscriptionReportView` bu iş için
`pages/Subscriptions.jsx`'ten TAŞINDI (kopyalanmadı); `CompareResult`
`pages/LinkAnalysis.jsx`'ten export edildi.

**TUZAK:** `AiReportView` CSS'ini bilerek import etmez (paket boyutu — o dosyadaki
nota bak). `la-*` stillerini kullanan her SAYFA `LinkAnalysis.css`'i kendisi import
etmek zorunda. İlk sürümde bu unutulmuştu ve rapor STİLSİZ çıkıyordu.

### Quiz künyesi — raporun ÜSTÜNDE
Okuyucu quizi çözmedi; "92/100 uyum" kimin uyumu olduğu söylenmeden anlamsız.
Sayfa, raporun üstünde soruları ve seçilen cevapları gösteriyor
(`analysisQuiz()`, `.an-quiz`). Rapor gövdesindeki "cevapların neyi değiştirdi"
bloğu AYRI bir soruyu yanıtlıyor (her cevap puanı ne kadar oynattı), o yüzden
ikisi de duruyor. Ön-render'da da aynı sırada (`anQuizKunye`).

Kaynak **dile göre rapordur**, `quiz` alanı değil: `quiz` adminde quizin
yanıtlandığı dilde (Türkçe) duruyor, rapor her dilde kendi metnini taşıyor.

Kayıt okuma kuralları (tür, dile göre rapor, başlık, özet, meta, SSS) **tek yerde**:
`web/src/lib/analysisRecord.js` — hem React sayfası hem ön-render aynı fonksiyonları
çağırır.

---

## 5. SEO

- Analiz artık **dil başına ayrı adreste**: `/analiz/<slug>` (EN) ve `/tr/analiz/<slug>`.
  Öncesinde tek adres vardı ve hreflang iki dili de AYNI adrese işaret ediyordu.
- **Bir dilde raporu olmayan analiz o dilde SAYFA ÜRETMEZ** ve hreflang'e girmez.
  Kural: `analysisRenderLangs()` — `analysisReport()`'un aksine öteki dile DÜŞMEZ.
  Runtime (`AnalysisPost`) ve ön-render (`seo.mjs`) aynı fonksiyonu kullanır.
- Ön-render gövdesi türe göre ayrı: `anUrunGovde` / `anLinkGovde` /
  `anKarsilastirmaGovde` / `anAbonelikGovde`.
- `seo.mjs` analiz kabuklarını **dil dil siler** (kategori/compare ile aynı gerekçe:
  üretilmeyen ağaç kendiliğinden silinmez). `analiz` prebuild'in wipe listesinde
  OLAMAZ — `/tr` öneki orada temizlenemez.
- **Yinelenen meta kapısı:** `seo-audit.mjs` aynı dilde yinelenen
  `<title>`/`description` bulursa build'i DÜŞÜRÜR. Admin de kayıt sırasında aynı
  denetimi yapar ve yasaklı listeyi meta prompt'una gönderir.
- `SEO_CONTENT_VERSION` 2026-08-22'ye yükseltildi (çıktı toplu değişti).

---

## KALAN İŞLER (bu turda yapılmadı — gerekçesiyle)

1. **`trendScore` ölü.** 107.449 dokümanın tamamında 0.
   `scripts/compute_trending.mjs` skoru `recently_viewed`den üretiyor = yalnız giriş
   yapmış görüntülemeler. Gerçek talep sinyali için anonim görüntüleme kaydı ya da
   GSC API bağlanmalı — ikisi de yeni veri hattı, bu turun kapsamı değildi.
   Kürasyon şu an marka + fiyat + techScore ile çalışıyor.
2. **Ürünlerin %8,7'sinde `nameTranslated.en` yok** → EN sayfada Türkçe ad kalıyor.
   Çeviri `_raw`'dan KÜRASYONDAN SONRA çekiliyor, o yüzden kürasyona kapı olarak
   eklenemiyor. Doğru çözüm ya çeviri backfill'i ya da EN kümesini ayırmak — ikincisi
   7.486 ürün adresinin hreflang'ini değiştirir, ayrı bir iş.
3. **Fiyat rollup boşluğu:** PB'de 853 telefonun fiyatlı teklifi var, Typesense'te
   yalnız 196'sında `priceTR` görünüyor. Ayrı hat.
4. **`spec dil sızıntısı 3/300 (%1,0)`** — kapı %5'te, geçiyor ama sıfır değil.
   Kalan 3 sayfaya bakılmadı.
4b. **Product JSON-LD'de `description` eksikti** — Search Console "Satıcı
   girişleri" (Merchant listings) raporu bildirdi (2026-08-22). Eklendi;
   sayfanın meta açıklamasının aynısını kullanıyor.
5. **Cloudflare purge:** ölçüldü — `Cache-Control: max-age=120`,
   `cf-cache-status: REVALIDATED/MISS`. Uzun ömürlü bayat edge kopyası görünmüyor,
   yani deploy sonrası elle purge gerekmiyor. `.env`'de `CF_API_TOKEN` hâlâ yok.
6. **IndexNow — DOĞRULANDI.** Hetzner cron'u (`/root/qorai-seo-refresh.sh`, 04:17)
   değişen adresleri `git diff` ile bulup **stdin'den** `indexnow.mjs`'e veriyor;
   7 günlük sitemap filtresi yalnızca stdin boşken devreye giren yedek yol.
   Her iki yol da doğru davranıyor.

---

## KIRILGAN NOKTALAR

- `website/` ortak ağaç. Build ortasında **`npx vite build` çalıştırma** — ön-render'sız
  boş `#root` bırakır ve `seo-audit` build'i düşürür. Yalnız `npm run build`.
- Üretilmeyen ağaç kendiliğinden SİLİNMEZ (`website/de`, `category/case_fans` böyle
  hayalet sayfa bıraktı).
- `docs/nginx_website.conf`'u commit etmek onu YAYINA ALMAZ. Canlı yapılandırma
  Coolify DB'sinde base64; doğru yol `coolify-db psql`.
- PocketBase koleksiyonu oluştururken `created`/`updated` autodate alanlarını unutma.
- **Admin panelini ayrıca deploy et.** Site deploy'u admin'i güncellemez.
- Sabit hex yazma. Web'de `global.css` token'ları, admin'de `--bg2/--bg3/--border/--text1`.
