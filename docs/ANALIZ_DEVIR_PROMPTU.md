# Qor AI — Analiz yayınlama sistemi: devir promptu

> Bunu yeni sohbete olduğu gibi ver. Kod tabanı `C:\Users\RN8\Desktop\Compair-master`.

---

## Bağlam

Site: **qorai.net** (React/Vite SPA, `web/` → `website/` build çıktısı, Coolify static).
Admin: **ayrı bir Coolify uygulaması** (`admin/`, düz vanilla JS, derlenmiyor).
Veri: PocketBase + Typesense. Diller **yalnız TR + EN** (Almanca 2026-08-21'de tamamen kaldırıldı).

Deploy: `node scripts/deploy_coolify_static.js website` / `... admin` — **önce commit + push şart.**
Site build: `cd web && npm run build` (~25 dk, katalog çekimi yüzünden).

---

## ŞU AN NE VAR

### Çalışan
- `/analiz` ve `/analiz/<slug>` rotaları, üst menüde "Analizler" sekmesi.
- PB `analyses` koleksiyonu — ham raporu `report` (json) alanında tutuyor.
- `/analiz/<slug>`, `AiAnalysis.jsx`'ten export edilen **`ProductFullReport`** bileşenini çiziyor.
- Ön-render (`web/scripts/seo.mjs` → `analizBody`) aynı raporu statik HTML yazıyor: manşet,
  karar, quiz etkisi, güçlü/zayıf, kritik noktalar, özellik tablosu, topluluk, alternatifler,
  fiyat görünümü, hüküm, SSS. Article + FAQPage + BreadcrumbList şeması. Sitemap'e giriyor.
- Admin > Analizler: sitede yapılmış analizleri (`saved_analyses`, `category="product_history"`)
  listeliyor, seçip yayınlatıyor.

### KULLANICININ REDDETTİĞİ / DÜZELTİLECEK OLAN
Kullanıcı iki ekranı da beğenmedi ve **haklı**:

1. **`/analiz/<slug>` sayfası dar ve sitedeki analizle aynı görünmüyor.**
   `web/src/pages/Analyses.css` içinde `.an-wrap{max-width:760px}` var ve sayfa
   kendi başlık/şerit düzenini kuruyor. Ürün sayfasındaki analiz ise geniş, kart
   tabanlı (skor halkası, MATCH/FITS YOUR LIFE/OWNER SATISFACTION/EVIDENCE
   kutuları, radar grafiği, community donut, factor-by-factor barlar).
   **İstenen: ürün sayfasındaki analizle BİREBİR aynı görünüm.** Ek CSS yazma;
   `ProductDetail.jsx`'in analiz bölümünü hangi sarmalayıcı/genişlikle çiziyorsa
   onu kullan. Muhtemelen `Analyses.css`'in çoğu SİLİNMELİ.

2. **Admin analiz ekranı çirkin ve yetersiz.** Kullanıcı "o güzel UI"yı istiyor.

---

## YAPILACAKLAR

### 1. `/analiz/<slug>` — sitedeki analizle birebir aynı UI
- `web/src/pages/AnalysisPost.jsx` ürün sayfasının analiz sarmalayıcısını birebir kullansın.
- `web/src/pages/Analyses.css` içindeki dar/özel düzeni kaldır; ek bileşen YAZMA.
- Referans: `web/src/pages/ProductDetail.jsx` içinde `AiAnalysis`/`ProductFullReport`
  nasıl sarmalanıyorsa aynısı.

### 2. Admin'de quiz — kullanıcı quiz'i ADMİN'DE çözecek
Şu an analiz sitede yapılıyor. İstenen: **admin panelin üstünde quiz soruları olacak**,
kullanıcı orada cevaplayacak, analiz oradan üretilecek.
- Quiz motoru: `web/src/lib/linkAnalysis.js` → `generateQuiz`, `generateCompareQuiz`,
  `generateSubscriptionQuiz`. Prompt'lar `web/src/components/AiAnalysis.jsx`
  (`buildFullPrompt`, `buildComparePrompt`, ...).
- **UYARI:** admin düz vanilla JS, web ES modülü. Prompt'u KOPYALAMA — proje bu dersi
  `spec_i18n`'de bir kez ödedi. Doğru yol: prompt kurucularını `admin/js/*.js` altında
  klasik script'e **TAŞI** (kopyalama), `AiAnalysis.jsx` oradan içe aktarsın —
  `admin/js/spec_i18n.js` + `web/src/lib/specI18n.js` deseninin aynısı.
  Node tarafı için `scripts/_spec_sandbox.mjs` zaten var.
- `buildFullPrompt` bağımlılıkları: `productLine`, `promptContext`, `languageGate`,
  `freshnessRules`, `availabilityContextForProduct`, `quizLines`, `langName`,
  `CURRENT_REPORT_DATE`, `compactDate` (AiAnalysis.jsx satır ~27-220) artı
  `displayProductName`/`cleanProductName` (`web/src/lib/productNames.js`),
  `productSpecsContext`, `productPath`.
- Taşımayı **saf taşıma** yap ve `git diff` ile hiçbir satırın içeriğinin değişmediğini doğrula.

### 3. Üç analiz türü de yayınlanabilir olacak
Şu an yalnız ürün analizi. İstenen: **link analizi** ve **abonelik analizi** de.
- `saved_analyses.category` değerleri: `product_history`, `link_history`,
  (abonelik için `web/src/lib/pbHistory.js`'e bak).
- Üçü de aynı `AiReportView` şablonunu kullanıyor (`web/src/lib/reportAdapters.js`:
  `productReportToUnified`, `compareProductToUnified`, `compareVerdictToUnified`).
- `analyses` koleksiyonuna `kind` alanı ekle (`product` | `link` | `subscription`),
  `/analiz` listesi türe göre filtrelesin, `AnalysisPost.jsx` türe göre doğru
  adaptörü çağırsın.
- Ön-render (`analizBody`) da türe göre doğru bloğu yazsın.

### 4. TR + EN eşgüdümlü, otomatik, kopya olmayan meta
Şu an rapor tek dilde üretiliyor; başlık/açıklama rapordan türüyor.
İstenen: **her analiz hem TR hem EN üretilecek, ikisi de SEO'lu, meta'lar kopya olmayacak.**
- `analyses` alanları hazır: `title_tr/_en`, `lead_tr/_en`, `metaTitle_tr/_en`,
  `metaDescription_tr/_en`, `faq_tr/_en`. `report` şu an tek — **`report_tr` / `report_en`
  yap** ya da `report: {tr:…, en:…}`.
- Prompt zaten dil parametresi alıyor (`buildFullPrompt(p, lang, …)`) ve içinde
  `languageGate(lang)` var — iki dil için iki çağrı yeterli.
- Meta kopya olmasın: TR ve EN meta'lar birbirinin çevirisi olabilir ama
  **aynı dilde iki analiz aynı meta'yı taşımamalı**. `seo-audit.mjs`'e kapı ekle:
  aynı dilde yinelenen `<title>`/`meta description` varsa build kırılsın.
- hreflang: analiz sayfası şu an TEK adreste, `SEO_LOCALES.map(l => ({hreflang:l, href:url}))`
  ile aynı adrese işaret ediyor (`seo.mjs`, 2g bloğu). İki dilli olunca ya
  `/analiz/<slug>` + `/tr/analiz/<slug>` üret, ya da tek adreste kal ve hreflang'i buna göre
  düzelt. **Var olmayan alternatif adres uydurma.**

---

## SEO — FAZLARDA EKSİK/YANLIŞ KALANLAR

Faz 0-3 canlıda. Kalanlar:

1. **`trendScore` ölü.** 107.449 dokümanın tamamında 0. `scripts/compute_trending.mjs`
   skoru `recently_viewed`den üretiyor = yalnız giriş yapmış görüntülemeler; sitenin
   günlük kullanıcısı tek haneli. Kürasyon şu an marka + fiyat + techScore ile çalışıyor.
   Gerçek talep sinyali için: anonim görüntüleme kaydı aç, ya da GSC API bağla.

2. **Ürünlerin %8,7'sinde `nameTranslated.en` yok** → EN sayfada Türkçe ad kalıyor
   ("Oyun Kolu"). Kürasyon filtresine eklenebilir ya da çeviri backfill'i yapılabilir.

3. **Fiyat rollup boşluğu:** PB'de 853 telefonun fiyatlı teklifi var ama Typesense'te
   yalnız 196'sında `priceTR` görünüyor. Telefon kategorisinde fiyat kapsamı %4
   (laptoplarda %46). Ayrı bir hat; kürasyonda fiyat KAPI değil ARTI olarak duruyor.

4. **`spec dil sızıntısı 3/300 (%1,0)`** — seo-audit kapısı %5'te, geçiyor ama
   sıfır değil. Kalan 3 sayfaya bakılmadı.

5. **`SEO_CONTENT_VERSION = '2026-08-21'`** (`web/scripts/seo.mjs`). Ön-render çıktısı
   toplu değiştiğinde ELLE yükseltilmeli, yoksa sitemap `lastmod`'u eski kalır.

6. **Cloudflare purge:** `.env`'de `CF_API_TOKEN` yok. Kullanıcı edge cache TTL'ini
   kapattığını söyledi, purge gerekmiyor olabilir — doğrula.

7. **IndexNow** `web/scripts/indexnow.mjs` artık yalnız son 7 günde `lastmod`'u değişen
   adresleri gönderiyor. Hetzner cron'unun bunu nasıl çağırdığı DOĞRULANMADI.

---

## KIRILGAN NOKTALAR — bunlara dikkat

- **`website/` ortak ağaç.** Build sırasında başka bir iş `git restore`/`git clean` yaparsa
  çıktı gider. Build ortasında `npx vite build` çalıştırma — `seo-audit` ana sayfanın
  boş `#root`'unu yakalayıp build'i düşürür (iki kez yaşandı).
- **Üretilmeyen ağaç kendiliğinden SİLİNMEZ.** `website/de` ve `category/case_fans` böyle
  hayalet sayfa bıraktı. `prebuild.mjs`'in `wipe` listesi dil öneklerini kapsamaz;
  dil-farkındalıklı silme `seo.mjs` içinde yapılır.
- **`docs/nginx_website.conf`'u commit etmek onu YAYINA ALMAZ.** Canlı yapılandırma
  Coolify DB'sinde base64. Doğru yol `coolify-db psql`; REST API PATCH siteyi 503 yapmıştı.
  Prosedür hafızada: `reference_coolify_nginx_base64.md`.
- **PocketBase koleksiyonu oluştururken `created`/`updated` autodate alanlarını UNUTMA** —
  yoksa `sort=-updated` HTTP 400 verir (2026-08-22'de yaşandı).
- **Admin panelini ayrıca deploy et.** Site deploy'u admin'i güncellemez.
- **Sabit hex yazma.** Web'de `global.css` token'ları, admin'de `--bg2/--bg3/--border/--text1`.

---

## ÇALIŞMA KURALLARI (kullanıcının)

- Türkçe konuş, kodda/commit'te İngilizce.
- Yorum yapma, açıklama yapma, bahane üretme. **Sadece işi yap ve bitir.**
- Push/deploy için onay isteme — standing yetki var.
- Var olan sistemi kullan. Sıfırdan paralel sistem kurma. İkinci kopya = ayrışma.
- Ekran görüntüsü ile doğrulamadan "bitti" deme.
