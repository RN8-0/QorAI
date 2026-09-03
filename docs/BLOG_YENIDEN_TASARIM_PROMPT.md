# Admin blog bölümünü baştan tasarla — yeni sohbet için prompt

> Bu dosya, yeni bir Claude Code sohbetine **olduğu gibi yapıştırılmak** için
> yazıldı. Aşağıdaki `====` çizgileri arasındaki her şey prompttur.

======================================================================

Qor AI (qorai.net) projesinde **admin panelinin blog bölümünü baştan
tasarlamanı** istiyorum. Mevcut `admin/js/blog.js` 3.563 satır ve işlevsel
olarak çok şey yapıyor ama arayüzü kullanışsız; benim istediğim sürükle-bırak
mantığı ve "AI her şeye hakim" akışı orada yok. Kodu yeniden yazacaksın.

Aşağıda sistemin bugünkü hâli, veri sözleşmeleri ve bir kez düşülmüş tuzaklar
yazılı. **Önce hepsini oku, kod yazmadan önce bana plan sun.**

---

## 0) BAĞLAYICI KURALLARIM

Bunlar tartışmaya açık değil, önceki oturumlarda defalarca söyledim:

1. **Görselleri AI BULMASIN.** "boktan görseller buluyor." Ürün görseli
   KATALOGDAN gelir (gerçek ürün fotoğrafı). Katalogda yoksa görsel **boş
   kalır**, ben elle koyarım. Marka logosu araması YALNIZ abonelik/servis
   öğelerinde serbest. Google favicon, marka logosunu ürün görseli diye
   koymak yasak.
2. **Tek şablon dayatması olmayacak.** Şablonlar başlangıç yapısı kurabilir
   ama AI yazının düzenine (bölüm sırası, görsel konumu, blok tipleri) kendisi
   karar verebilmeli.
3. **Sürükle-bırak.** Öğeleri ve blokları fareyle sürükleyip sıralayabilmeliyim;
   blokları bir öğeden diğerine taşıyabilmeliyim. Bu, "tutamak ekle" demek
   değil — **arayüzün tamamı** buna göre kurulmalı.
4. **Hatalı bilgi yok.** AI yazıya alakasız ürün sokmayacak, uydurma sayı
   yazmayacak.
5. **Konu başlıkları Türkçe.** Konu sihirbazı bana İngilizce başlık
   göstermeyecek (site kökü İngilizce olsa da panel Türkçe).
6. **Blog otomasyonu YOK.** Cron ile otomatik yazı üretme önerme; yazıları ben
   panelden başlatıp onaylıyorum. (2026-07-14'te kurulup aynı gün iptal edildi.)
7. **Türkçe konuş, kodda/commit'te İngilizce yaz.**
8. **Maliyet.** Gemini grounded arama TOKEN'DAN AYRI, İSTEK BAŞINA
   faturalanıyor. Gereksiz arama yapma; bir araştırmayı iki dilde tekrar etme.

---

## 1) DOSYA HARİTASI — nerede ne var

### Admin (yeniden yazacağın taraf)
| Dosya | Rol |
|---|---|
| `admin/js/blog.js` | **3.563 satır.** Tüm blog paneli. Yeniden yazılacak. |
| `admin/index.html` | `#blogView` / `#blogAdminRoot` kapları (satır ~225-233), betik yükleme sırası (~1339) |
| `admin/css/style.css` | Panelin ortak stilleri. `blog.js` kendi stillerini `injectStyles()` ile enjekte ediyor. |
| `admin/js/app.js:170` | Görünüm yönlendiricisi: `if(name==='blog') loadBlogAdmin()`. **`window.loadBlogAdmin` adı korunmalı**, yoksa sekme açılmaz. |

**Betik yükleme sırası ÖNEMLİ** (`admin/index.html`):
```
js/blog.js            ← ÖNCE
js/qor_ai_prompts.js
js/qor_ai_link.js
js/qor_ai_run.js      ← SONRA
```
Yani `blog.js` yüklenirken `window.QorAiRun` **henüz yok**. Kullanıcı butona
bastığında var. Modül üstü seviyede `QorAiRun`'a dokunma; çağrı anında al.

### Site (render sözleşmesi — buna UYMAK ZORUNDASIN)
| Dosya | Rol |
|---|---|
| `web/src/pages/BlogPost.jsx` | 725 satır. Makaleyi çizer. `renderProd()` (satır 531) ve `renderBlockText()` (satır 154) editörün çıktısını okur. |
| `web/src/pages/Blog.jsx` | 113 satır. Liste sayfası. |
| `web/src/lib/routes.js` | `articlePath()` (satır 67). **Blog linki `<Link>` ile verilemez** — `/tr` altında basename öneki yapıştırır. |
| `web/scripts/seo.mjs` | Ön-render. `blogArticleBody()` (996), `blogListBody()` (1093), `sssCikar()` (966). |
| `web/scripts/seo-audit.mjs` | Build'i kesen denetim. |

### Yardımcı betikler
`scripts/article_fact_check.mjs`, `scripts/article_insert_draft.mjs`,
`scripts/clean_article_sources.js`, `web/scripts/gen-articles.mjs` (ELLE koşar).

---

## 2) VERİ SÖZLEŞMESİ — PocketBase `articles`

**Şemayı DEĞİŞTİRME.** Site bu alanları okuyor; yeni alan eklemek ön-render,
istemci ve SEO'nun üçünü birden bozar.

```
id  slug*  status*  category  cover  coverFile(file)  media(file)
title_tr  title_en
lead_tr   lead_en
body_tr(editor)        body_en(editor)
conclusion_tr(editor)  conclusion_en(editor)
slug_tr  slug_en
metaTitle_tr  metaDescription_tr  tags_tr
metaTitle_en  metaDescription_en  tags_en
metaTitle  metaDescription  tags       ← eski, dilsiz alanlar (kullanma)
products(json)  author  publishedAt  likes  views  created  updated
```

Bugün **11 makale** var, hepsi `published`. Gövdeler 580–2.363 karakter,
öğe sayısı 5–8.

### `products[]` — öğe modeli

Bugünkü kayıtlarda geçen anahtarlar:
```
kind        'product' | 'subscription' | 'custom'   (yoksa 'product')
id, slug, name, brand, techScore, imageUrl, logo
layout      'split' | 'top' | 'text' | 'left' | 'right'   ← ESKİ MODEL
imgSize     's' | 'm' | 'l' | 'xl'
desc_tr, desc_en, desc2_tr, desc2_en                      ← ESKİ MODEL
blocks[]                                                   ← YENİ MODEL
affiliateUrl, website, link, price
```

**İKİ MODEL BİRDEN YAŞIYOR.** `BlogPost.jsx:585` şöyle karar veriyor:
```js
const hasBlocks = Array.isArray(p.blocks) && p.blocks.length > 0;
```
`blocks` varsa yeni model, yoksa `layout` + `desc/desc2` eski modeli.
**Bugün yayındaki 11 makalenin HİÇBİRİNDE `blocks` yok** — hepsi eski modelde.
Yani yeni editör eski kayıtları açabilmeli (`ensureBlocks` gibi bir göç
fonksiyonu şart) ama yazarken **yeni modele** yazmalı.

### `blocks[]` — blok modeli (site bunu çiziyor)

```js
// metin bloğu
{ t: 'text', style: 'paragraph'|'heading'|'subheading'|'bullets',
  tr: '<düz metin>', en: '<düz metin>' }

// görsel bloğu
{ t: 'image', url: '<mutlak URL>',
  pos: 'left'|'right'|'full'|'center',
  size: 's'|'m'|'l'|'xl',
  w: <15-100 arası sayı, opsiyonel manuel genişlik %>,
  cap_tr: '', cap_en: '' }
```

`renderBlockText()` (BlogPost.jsx:154):
- `heading` → `<p class="post-prod-sub post-prod-sub-1">`, her satır ayrı
- `subheading` → `post-prod-sub-2`
- `bullets` → `<ul>`, her satır bir `<li>`, baştaki `- – — • *` silinir
- `paragraph` → `renderRichText()`: otomatik biçimleme (`**kalın**`, madde,
  etiket satırı)

**Blok metinleri DÜZ METİN.** HTML etiketi koyma. Kalın için `**yıldız**`,
madde için satır başına `- `.

`body_*` ve `conclusion_*` ise **HTML** (`<h2> <h3> <p> <ul><li> <strong>
<table>`). `body` ürün bölümlerinden ÖNCE, `conclusion` SONRA çiziliyor.

### `slug` KİMLİKTİR — iki koleksiyon daha ona bağlı

Bu, şemada görünmeyen ama **veri kaybettirebilecek** bir bağ. Canlıda ölçüldü:

| Koleksiyon | Kayıt | Anahtar | Ne tutuyor |
|---|---|---|---|
| `article_events` | **875** | `slug` (id değil!) | görüntülenme, beğeni, okuma süresi (`type`, `duration`, `session`, `userId`) |
| `reviews` | 4 | `productId = "blog:<slug>"` | makale yorumları |

**Bir yazının slug'ını değiştirirsen 875 olay kaydı ve o yazının yorumları
sessizce kopar.** Ne PB kısıtı ne de uyarı var — sadece istatistik sıfırlanır.

Bu yüzden:
- Yeni editör slug değiştirmeyi **açıkça uyarmalı** ("bu yazının X görüntülenmesi
  ve Y yorumu bu adrese bağlı").
- `blogDuplicate` gibi kopyalama akışları yeni slug üretirken bunu taşımamalı
  (kopyanın istatistiği sıfır olmalı — doğru davranış, ama bilinçli olmalı).
- Liste ekranındaki ortalama okuma süresi (`avgRead`) bu koleksiyondan geliyor;
  yeni listede de kalsın.

Yorum yönetimi bugün editörün içinde (`loadComments` ~3495,
`blogDeleteComment` ~3512) — `reviews` koleksiyonundan `productId="blog:<slug>"`
filtresiyle okuyor. Bu ekranı kaybetme.

---

## 3) SEO SÖZLEŞMESİ — bunları bozarsan build kesilir

1. **`metaTitle` ≤ 60, `metaDescription` ≤ 155 karakter.** Kelime sınırından
   kırp, ortadan kesme. `seo-audit.mjs` kesik başlığı yakalayıp build'i
   düşürüyor.
2. **FAQPage ayrı bir alandan gelmiyor.** Şemada `faq_tr`/`faq_en` YOK ve
   eklenmeyecek. Soru-cevap **gövdenin içinde** duruyor: `?` ile biten
   `<h2>`/`<h3>` + ardından gelen metin. Kapılar: soru ≥12 krk, cevap ≥40 krk,
   **en az 2 çift**, cevap 900'de kırpılır.
   İki çıkarım var ve **birebir aynı olmak zorunda**:
   - `web/scripts/seo.mjs:966 → sssCikar()` (regex, Node'da DOMParser yok)
   - `web/src/pages/BlogPost.jsx:349 → sssCiftleri()` (DOMParser)
   Çıkarım **body + conclusion** üzerinden yapılır. (Bir kez yalnız `body`'ye
   bakıldı: ekranda SSS vardı, JSON-LD'de 0 soru çıkıyordu.)
3. **Blogda dil öneki YOK.** i18n önek değil **slug** tabanlı (`slug_tr` /
   `slug_en`). Yazılar YALNIZ `/blog/<slug>` altında ön-render ediliyor.
   `/tr/blog/<slug>` **yumuşak 404** üretir (200 + noindex). Bu yüzden blog
   linki `<Link>` ile verilemez — `routes.js` içindeki kural.
4. **Site dili tarayıcıdan gelir.** Makale sayfasına manuel dil seçici EKLEME.
   Ziyaretçi hangi slug'a girerse girsin kendi dilinde okur.
5. hreflang: `tr`, `en`, `x-default`. `seo.mjs:3690` üretiyor.
6. Article + FAQPage + BreadcrumbList JSON-LD zorunlu.

---

## 4) AI ALTYAPISI

### Çağrı yolları (ikisi de var, ikisi de kullanılmalı)

```js
// A) GROUNDED (Google Search'lü) — konu bulma, araştırma
//    JSON modu KULLANILAMAZ: Gemini googleSearch + responseMimeType:json
//    kombinasyonunu reddediyor. Metin döner, parseAiJson ile çözülür.
const txt = await window.QorAiRun.askGrounded(prompt, 'tr', 4096);
const json = window.QorAiPrompts.parseAiJson(txt);

// B) DÜZ JSON — yazma, çeviri, komut
//    PB proxy'si: POST {pb.baseUrl}/api/ai/gemini
//    model gemini-2.5-flash, responseMimeType 'application/json',
//    thinkingConfig.thinkingBudget 0, maxOutputTokens 32768-60000
```

Anahtarlar istemciye **inmez**; `pb_hooks/gemini.pb.js` taşıyor.
Kota: kullanıcı başına **60 istek / 5 dk** (anonim 20).

### Prompt'lar tek kaynakta
`admin/js/qor_ai_prompts.js` — site (`web/src/lib/aiPrompts.js`) ve build
betikleri **aynı dosyayı** koşturuyor. Blog prompt'ları şu an `blog.js`
içinde gömülü; taşımak istersen tek kaynağa taşı, ikinci kopya çıkarma.

### Bugünkü AI akışı (korunacak yetenekler)
1. **Konu sihirbazı** (`blogTopicOpen/Fetch/Pick`, ~2100-2250) — grounded
   arama ile 10-20 konu, fırsata göre sıralı, mevcut başlıkları tekrarlamaz.
   `KONSEPT` sabiti (satır 2070) siteyi İngilizce tarif ediyor ve konuların
   **küresel** olmasını şart koşuyor.
2. **Gemini yazar** (`yazarPrompt` ~2267, `blogAiWrite` ~2385) — dil başına
   ayrı çağrı (tek çağrıda iki dil `MAX_TOKENS`'a çarpıyordu), ikinci dil
   birincinin aynası.
3. **Komutla değişiklik** (`blogAiCommandOpen/Run`, ~2537-2674) — "girişi
   kısalt", "3. ürünü çıkar" gibi serbest komut.
4. **Akıllı içe aktarma** (`blogImportRunAuto`, ~2674) — ne yapıştırırsan
   şemaya çevirir.
5. **Kalite kontrolü** (`articleHealth` ~2864 deterministik, `blogAiQa` ~3015
   AI'lı).
6. **AI çeviri** (`blogTranslate` ~3324).
7. **İlerleme paneli** (`aiIlerlemeBaslat/aiAdim/aiIlerlemeBitir` ~3219) —
   hangi adımda olduğunu gösterir. **Bu şart:** "ai hangi işlemleri yapıyor
   ekranda gözükmüyor" diye şikâyet ettim.

### Katalog eşleştirme (`resolveCatalogItem` ~1761)
Yazıya **alakasız ürün sokmama** kapısı. `matchScore` + şu korumalar:
- `_farkliKodlamaMi` — "Redmi Note 14 Pro" ≠ "Note 5 Pro"
- `_rakipHatAdi` — "Sonos Ace Ultra" ≠ "Sonos Arc Ultra"
- `_yilMi`, `_altModelKodu` — rakam her zaman model numarası değil
**Bu mantığı bozma.** Gevşetildiğinde yanlış ürünler girdi (ölçüldü).
`window.blogDebug` ile konsoldan tek tek denenebiliyor:
```js
await blogDebug.resolveCatalogItem('Leonardo AI')  // null olmalı
await blogDebug.bestLogo('midjourney.com')         // logo URL'i
```

---

## 5) DAHA ÖNCE DÜŞÜLMÜŞ TUZAKLAR

1. **`blog.js` içinde Türkçe karakter geçen `old_string` ile Edit
   eşleşmeyebiliyor** (unicode). ASCII çapalı küçük edit'ler kullan, ya da
   dosyayı komple yaz.
2. **Quill 2 tabloyu bozuyor.** İçerikte `<table` varsa editör otomatik HTML
   kaynak moduna geçmeli (`hasTable()` ~512).
3. **Çökme koruması var, kaybetme.** Her değişiklik ~1 sn'de
   `localStorage['qor.blogDraft.<id|new>']`'e yedekleniyor; açılışta "Geri
   yükle / Yoksay" bandı çıkıyor. Otokayıt YALNIZ taslaklarda (3 sn debounce);
   yayındaki makalede elle kaydet.
4. **Öğe adındaki "1. " öneki silinmeli** (`stripLeadingNumber`) — site sırayı
   kendi basıyor, yoksa "1. 1. iPad Pro".
5. **Modele güvenilmez, sınırlar kodda.** `sanitizeImported()` dört yolda da
   çağrılıyor (auto/md/json import + çeviri).
6. **`injectStyles()` çağrılmadan render fonksiyonunu tek başına test etme** —
   stil gelmez, "hiç değişiklik yok" gibi görünür. (Bir kez bu yüzden yanlış
   teşhis koydum.)
7. **Slug değişikliği sessiz veri kaybı.** Bkz. bölüm 2 — `article_events`
   (875 kayıt) ve `reviews` yazıya **slug ile** bağlı.
8. **Blog fiyatları canlıdan gelir.** `seo.mjs:152` ürün fiyatlarını PB'den
   çekip ön-render'a basıyor; editörde yazılan fiyat metni bayatlar.

---

## 6) NE İSTİYORUM — yeni arayüz

Aşağıdakiler **sonuç tanımı**; nasıl yapacağını sen tasarla ama önce plan sun.

### 6.1 Yazma yüzeyi
- Makale **tek bir akış** olarak görünsün: giriş → öğeler → sonuç. Bugünkü
  "iki kolon + ayrı ürün kartları" yapısı yazının nasıl görüneceğini
  göstermiyor.
- Her blok **yerinde düzenlenebilsin** (WYSIWYG), ayrı bir forma gitmeden.
- **Sürükle-bırak birinci sınıf:** blok sırası, öğe sırası, bloğu başka öğeye
  taşıma. Sürüklerken bırakma yeri görünsün.
- Blok tipi değiştirme (paragraf ↔ başlık ↔ madde ↔ görsel) tek tıkla.
- Dil sekmesi (TR/EN) blok seviyesinde çalışsın; hangi dilin eksik olduğu
  görünsün.

### 6.2 AI kontrolü
- Konu bulmadan yayına kadar **her adımda ne yapıldığı ekranda** görünsün.
- AI yazının **düzenine** karar verebilsin: bölüm sırası, blok tipleri, görsel
  konumu. Sabit şablona zorlamak yok.
- Serbest komutla düzenleme ("girişi kısalt", "SSS ekle", "3. ürünü çıkar")
  yazının tamamı üzerinde çalışsın.
- **Görsel bulma yok** (bkz. kural 1). AI görselin NEREYE gireceğini
  işaretler, URL'i sistem katalogdan doldurur.

### 6.3 Kontrol ve güven
- Yayınlamadan önce **deterministik sağlık denetimi**: eksik dil, kısa metin,
  görselsiz öğe, meta sınırı aşımı, SSS sayısı, kırık iç link.
- Google SERP önizlemesi ve karakter sayaçları kalsın.
- Sitedeki gerçek görünümün önizlemesi.

---

## 7) ÇALIŞMA BİÇİMİ — bunlara uy

1. **Önce plan.** Kod yazmadan önce: hangi dosyalar, hangi veri akışı, neyi
   koruyup neyi atacağın. Onay al.
2. **Ölçmeden teşhis koyma.** Bu projede en çok bu hata yapıldı. "Şöyle
   olmalı" deme; PB'yi sorgula, prompt'u üret, sayfayı aç, bak.
3. **UI değişikliğini ekran görüntüsüyle doğrula** — 1440px ve 390px.
   Playwright yoksa açıkça söyle ve dur.
4. **`node --check` yeterli değil.** Bu oturumda `priceRulesBlock is not
   defined` hatası sözdizimi denetiminden geçti ve dört prompt'u birden
   kıracaktı. Fonksiyonu **gerçekten çalıştıran** test yaz.
5. **Gerileme testi yaz.** Örnek: `scripts/analiz_kural_testi.mjs` (35
   kontrol). Blog için de benzeri gerekli: blok modeli → site render paritesi,
   SSS çıkarımı ön-render/istemci paritesi, meta sınırları, katalog
   eşleştirme negatif vakaları.
6. **Yapmadığını yaptım deme.** Eksik kalanı açıkça söyle.

---

## 8) BUILD / DAĞITIM

```bash
# admin (statik, build yok) — ÖNCE push et
node scripts/deploy_coolify_static.js admin

# site — TAM BUILD ~10 dk, en sonda BİR KEZ koş
cd web && npm run build     # vite → postbuild → seo.mjs → seo-audit.mjs
node scripts/deploy_coolify_static.js website
```

- `npm run build` = `build_safe.mjs`. Hata olursa `git restore website/` yapıp
  ağacı geri alır — yarım `website/` bırakmaz.
- Windows'ta `postbuild` bazen dosya kilidine takılıyor (`copyfile UNKNOWN
  errno -4094`); tekrar koş.
- Coolify **commit'li `website/` dizinini servis eder**, kaynaktan build
  ETMEZ. Build çıktısını commit'lemeden dağıtım eskiyi yayınlar.
- PocketBase: `https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io`
  Süper kullanıcı kimliği `migration/.env` içinde
  (`POCKETBASE_ADMIN_EMAIL` / `POCKETBASE_ADMIN_PASSWORD`).

---

## 9) İLK ADIM

`admin/js/blog.js`, `web/src/pages/BlogPost.jsx` ve `web/scripts/seo.mjs`'in
blog bölümünü oku. Sonra bana şunu ver:

- Yeni arayüzün **ekran taslağı** (metinle tarif yeter) ve neden bu düzen.
- **Veri akışı**: konu → araştırma → yazım → blok modeli → kaydetme →
  ön-render. Hangi adımda kaç AI çağrısı, hangisi grounded.
- **Neyi koruyacaksın, neyi atacaksın** — madde madde.
- **Risk listesi**: bu yeniden yazımın bozabileceği şeyler ve her biri için
  nasıl doğrulayacağın.

Onaylayınca yazmaya başla.

======================================================================
