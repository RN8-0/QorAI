// ══════════════════════════════════════════════════════════════════════════
//  QOR AI ADMIN — BLOG YAPAY ZEKÂ KATMANI
//
//  BU DOSYA DA DOM'A DOKUNMAZ. Ağ çağrısı yapar (Gemini proxy'si, Typesense,
//  görsel yoklama) ama tek bir `document` erişimi yoktur — prompt üreticileri
//  Node'dan çağrılıp içine bakılabilsin diye (scripts/blog_kural_testi.mjs).
//
//  ÇAĞRI YOLLARI — İKİSİ DE VAR, İKİSİ DE KULLANILIYOR:
//   A) GROUNDED (Google Search'lü) → konu bulma, araştırma.
//      JSON MODU KULLANILAMAZ: Gemini `googleSearch` + `responseMimeType:json`
//      kombinasyonunu reddediyor. Metin döner, `parseAiJson` ile çözülür.
//      TOKEN'DAN AYRI, İSTEK BAŞINA faturalanıyor — gereksiz arama yapma,
//      bir araştırmayı iki dilde tekrarlama.
//   B) DÜZ JSON → yazma, çeviri, komut, düzen. PB proxy'si taşıyor
//      (pb_hooks/gemini.pb.js); anahtar istemciye HİÇ inmez.
//
//  ÇAĞRI BÜTÇESİ (sıfırdan bir yazı):
//    konu 1×grounded (15-20 konu, önbelleklenir) + araştırma 1×grounded
//    + yazım 2×json (EN, sonra TR aynası) + marka alan adı ≤1×json
//    + düzen/kalite 1×json + kaynak-adı ≤1×json
// ══════════════════════════════════════════════════════════════════════════
(function (root) {
  'use strict';

  var C = root.BlogCore;
  if (!C) throw new Error('blog_ai.js: blog_core.js ÖNCE yüklenmeli');

  /* SİTE KİMLİĞİ — her prompt'un başına giden tek paragraf.
     SİTE KÜRESEL. Kök adres (`/`) İNGİLİZCE servis ediliyor, Türkçe `/tr/`
     altında; okuyucuların çoğu Türkiye dışında. Önceki metin "Fiyatlar
     Türkiye pazarı (TL)" diyordu ve konu sihirbazı bunu harfiyen uyguluyordu:
     "Türkiye'de satışa sunuldu" gibi başlıklar üretiyordu. Kullanıcının
     tespiti: "amerikadaki adam türkiyeye google pixel 10 gelecekmiş ne
     yapsın". Konu KÜRESEL olmalı; fiyat bağlamı varsa USD/EUR/GBP üzerinden. */
  var KONSEPT = 'Qor AI (qorai.net): a global, AI-assisted product comparison '
    + 'catalogue. Primary audience reads ENGLISH (site root is English); a Turkish '
    + 'edition exists at /tr as a translation. Technical and evidence-first, never '
    + 'salesy — every claim is a number the reader can check. Catalogue covers '
    + 'phones, laptops, tablets, headphones, monitors, TVs, smartwatches, game '
    + 'consoles and robot vacuums.';

  var KATEGORI_ANAHTARLARI = 'smartphones|tablets|laptops|headphones|monitors|tvs|smartwatches|gaming_consoles|robot_vacuums';
  var SABLON_ANAHTARLARI = 'topn|review|vs|guide|howto|faq|deals|alt|news';

  function bugun() { return new Date().toISOString().slice(0, 10); }

  /* ── ORTAK KURAL BLOKLARI ────────────────────────────────────────────────
     TEK KAYNAK. Bir kural dört prompt'a elle kopyalanırsa üçünde güncellenip
     birinde unutuluyor — bu projede tam olarak böyle oldu (analiz tarafında
     fiyat kuralı ürün prompt'una eklendi, karşılaştırma/link/aboneliğe
     eklenmedi). Aşağıdaki bloklar fonksiyondur ve HER prompt onları çağırır. */

  // KURAL 1 — GÖRSELLERİ AI BULMASIN.
  // Ölçüldü 2026-09-03, canlı taslak: "iPhone 18 Pro" öğesinin görseli
  // `google.com/s2/favicons?domain=apple.com`, kapak da büyütülmüş bir Apple
  // logosuydu. Ürün görselleri KATALOGDAN gelir; katalogda yoksa görsel BOŞ
  // kalır ve yazar elle koyar.
  function gorselKuralBlogu() {
    return 'GÖRSELLER — URL YAZMA\n'
      + '- "url" alanını HER ZAMAN boş bırak ya da hiç koyma. Ürün görselleri KATALOGDAN gelir;\n'
      + '  senin bulduğun adresler ya kırık ya da marka logosu oluyor.\n'
      + '- Sen yalnızca görselin NEREYE ve HANGİ BOYUTTA geleceğini söyle.\n'
      + '- Görsel bloğunu METNE GÖRE konumlandır: uzun anlatımın yanına "right"/"left" (size "s"/"m"),\n'
      + '  bir öğeyi öne çıkarıyorsan "full"/"center" (size "l"). Her öğeye en fazla 1-2 görsel.\n'
      + '- "cap_tr"/"cap_en": görselin altına düşecek tek satırlık açıklama — ürün adını tekrarlama,\n'
      + '  görselde NE GÖRÜLDÜĞÜNÜ ya da neden önemli olduğunu yaz.';
  }

  // SEO sınırları — seo-audit.mjs kesik başlığı yakalayıp BUILD'İ DÜŞÜRÜYOR.
  function seoKuralBlogu() {
    return 'SEO — SİTENİN KURALLARI\n'
      + '- metaTitle ' + C.META_TITLE_MAX + ', metaDescription ' + C.META_DESC_MAX
      + ' KARAKTERİ AŞMASIN. Yazmadan önce karakter say.\n'
      + '- Yazıda H1 YOK; başlık ayrı alanda duruyor, gövde <h2> ile başlar.\n'
      + '- SSS BÖLÜMÜ ZORUNLU: soru işaretiyle BİTEN <h2> başlıkları ve altlarında 2-4 cümlelik\n'
      + '  cevaplar olacak şekilde EN AZ 3 soru koy. Soru en az 12, cevap en az 40 karakter olmalı;\n'
      + '  site bu başlıkları okuyup FAQPage yapısal verisini otomatik üretiyor. Soru işareti yoksa\n'
      + '  ya da cevap kısaysa o veri HİÇ OLUŞMAZ.\n'
      + '- Anahtar kelimeyi başlıkta, ilk paragrafta ve en az bir <h2>\'de geçir; doldurma yapma.\n'
      + '- İç link verirken YALNIZCA /blog/<slug> ve /product/<slug> biçimini kullan.\n'
      + '  /tr/blog/... ADRESİ YOK — yumuşak 404 (noindex) döner.';
  }

  // Blok metinleri DÜZ METİN; site markdown-benzeri kurallarla render eder.
  function metinKuralBlogu() {
    return 'METİN BİÇİMİ\n'
      + '- body_html ürün bölümlerinden ÖNCEKİ giriş; conclusion_html ürünlerden SONRAKİ sonuç.\n'
      + '- body_html/conclusion_html GEÇERLİ HTML: <h2>/<h3>, <p>, <ul><li>, <strong>, <table>.\n'
      + '- items[].blocks metinleri DÜZ METİN — hiçbir HTML etiketi koyma. Kalın için **yıldız**,\n'
      + '  madde için satır başına "- ", ara başlık için "## ".\n'
      + '- Metin ÇEVİRİ KOKMAMALI; hedef dilde doğal, o dilde yazılmış gibi olsun.';
  }

  /* DÜRÜSTLÜK + FİYAT.
     Blog fiyatları CANLIDAN gelir (seo.mjs:152 ürün fiyatlarını PB'den çekip
     ön-render'a basıyor); editörde yazılan fiyat metni bayatlar. */
  function durustlukBlogu() {
    return 'DÜRÜSTLÜK\n'
      + '- Fiyat, tarih, "şu anda satışta" gibi iddiaları YALNIZCA araştırma notlarında varsa yaz.\n'
      + '- ÜRÜN FİYATI YAZMA: site her ürün kartında CANLI fiyatı kendisi gösteriyor, senin\n'
      + '  yazdığın rakam bir hafta sonra yanlış olur. Fiyat bir SEVİYE olarak anlatılabilir\n'
      + '  ("amiral gemisi segmenti", "orta segment") ama rakam verilmez.\n'
      + '- Emin olmadığın sayıyı yazma; "yaklaşık", "araştırma sırasında" gibi ifadelerle çerçevele.\n'
      + '- Reklam dili yok: "muhteşem", "inanılmaz", "kaçırmayın" yasak. Sayı ver, hüküm ver.';
  }

  // ── 1) KONU SİHİRBAZI ───────────────────────────────────────────────────
  function konuPrompt(n, hint, mevcutBasliklar) {
    var g = bugun();
    return KONSEPT + '\n\nBUGÜN: ' + g + '\n\n'
      + 'GÖREV: Bu site için ' + (n || 15) + ' blog konusu öner ve FIRSATA GÖRE SIRALA (en iyisi ilk).\n\n'
      + 'ZORUNLU: Google aramasını kullan. Öneriler ŞU ANKİ trendlere, yeni çıkmış ürünlere,\n'
      + 'yaklaşan lansmanlara, fiyat hareketlerine ve insanların BU HAFTA aradığı sorulara\n'
      + 'dayanmalı. Kendi hafızandan genel geçer konu üretme.\n\n'
      + 'ZATEN YAZILMIŞ BAŞLIKLAR — bunların konusunu TEKRARLAMA:\n'
      + ((mevcutBasliklar || []).map(function (t) { return '- ' + t; }).join('\n') || '- (henüz yok)')
      + (hint ? '\n\nKULLANICININ VERDİĞİ YÖN: ' + hint + '\n' : '\n')
      + '\nSADECE geçerli JSON döndür, başka hiçbir şey yazma:\n'
      + '{"topics":[{\n'
      + '  "title":"<English article title — specific and curious but not clickbait, 45-70 characters>",\n'
      + '  "title_tr":"<AYNI başlığın TÜRKÇESİ — panel Türkçe, İngilizce başlık gösterme>",\n'
      + '  "angle":"<bu yazı ötekilerden NEYLE ayrışıyor: 1-2 cümle, TÜRKÇE>",\n'
      + '  "why":"<neden ŞİMDİ: aramada bulduğun somut olay/tarih/fiyat hareketi, TÜRKÇE>",\n'
      + '  "intent":"<bilgi arama|karşılaştırma|satın alma|sorun çözme>",\n'
      + '  "keyword":"<tek hedef anahtar kelime öbeği, Türkçe>",\n'
      + '  "products":["<sitede olması muhtemel 2-5 ürün adı, marka+model>"]\n'
      + '}]}\n\n'
      + 'KURALLAR:\n'
      + '- Konular sitenin kategorilerinde OLMALI (telefon, laptop, tablet, kulaklık, monitör, TV,\n'
      + '  akıllı saat, konsol, robot süpürge).\n'
      + '- KONU KÜRESEL OLMALI. Sitenin kök adresi İNGİLİZCE ve okuyucuların çoğu Türkiye dışında.\n'
      + '  "X ürünü Türkiye\'de satışa sunuldu", "Türkiye fiyatı", "döviz kuru etkisi" gibi TEK\n'
      + '  ÜLKEYE ait konular ÖNERME — Amerika\'daki ya da Almanya\'daki okuyucu için hiçbir şey\n'
      + '  ifade etmez. Bir konu YALNIZCA tek bir ülkede anlamlıysa o konu bu site için yanlıştır.\n'
      + '- Aramayı İNGİLİZCE sorgularla yap; küresel kaynaklara (Reddit, The Verge, Ars Technica,\n'
      + '  Notebookcheck, GSMArena, RTINGS, uluslararası YouTube incelemeleri) ulaşman gerekiyor.\n'
      + '  Yerel haber sitelerini kaynak alma.\n'
      + '- "title_tr" ZORUNLU: panel Türkçe, konu listesinde İngilizce başlık görmek istemiyorum.\n'
      + '- "why" alanına aramada gerçekten gördüğün bir şey yaz; bulamadıysan o konuyu ÖNERME.\n'
      + '- Tıklama tuzağı başlık yazma; sayı veren, somut başlık yaz.\n'
      + '- KANIT TAZE OLMALI. Arama sana ESKİ haberleri de getirir; ' + g + ' tarihinden 90 günden\n'
      + '  daha geriye giden bir olayı "neden şimdi" diye gösterme. Aynı maddede hem gelecek hem\n'
      + '  geçmiş tarih varsa o maddeyi hiç yazma.';
  }

  // ── 2) ARAŞTIRMA ────────────────────────────────────────────────────────
  // Grounded, MAKALE BAŞINA BİR KEZ — iki dil de aynı notları kullanır.
  // Hem tutarlılık hem de istek başına faturalanan aramadan tasarruf.
  function arastirmaPrompt(baslik) {
    return 'Topic: "' + baslik + '". Gather the facts that are true TODAY for a GLOBAL audience: '
      + 'newly released or upcoming models and their dates, current price ranges in USD/EUR/GBP, availability, '
      + 'recurring owner complaints, what expert reviews agree on, recent price moves. '
      + 'Search in English and prefer international sources (Reddit, The Verge, Ars Technica, Notebookcheck, '
      + 'GSMArena, RTINGS, major YouTube reviews). Write bullet points; say what each source claims. '
      + 'Plain text, NOT JSON.';
  }

  // ── 3) YAZAR ────────────────────────────────────────────────────────────
  /* ŞABLON YOK. Kullanıcının açık isteği: "tek bir şablona bağlı kalınsın ya
     da şablonlar önceden hazır olsun istemiyorum". Prompt yapı DAYATMIYOR;
     yalnızca sınırları söylüyor ve gerisini modele bırakıyor.

     TEK ÇAĞRIDA İKİ DİL = KESİK JSON. Önceki sürüm `langs: {tr, en}` isteyip
     ikisini birden yazdırıyordu; çıktı `maxOutputTokens`'ı aşınca Gemini
     `finishReason: MAX_TOKENS` ile yarıda kesiyor ve kullanıcı "AI yanıtını
     çözemedi" hatası alıyordu. Artık DİL BAŞINA AYRI ÇAĞRI; ikinci dil
     birincinin AYNASI (`taban` parametresi). */
  function yazarPrompt(konu, arastirma, lang, taban) {
    var k = konu || {};
    var dilAd = lang === 'tr' ? 'TÜRKÇE' : 'İNGİLİZCE (English)';
    return KONSEPT + '\n\nBUGÜN: ' + bugun() + '\n\n'
      + 'KONU: ' + (k.title || k) + '\n'
      + (k.angle ? 'AÇI: ' + k.angle + '\n' : '')
      + (k.keyword ? 'HEDEF ANAHTAR KELİME: ' + k.keyword + '\n' : '')
      + (k.intent ? 'ARAMA NİYETİ: ' + k.intent + '\n' : '')
      + '\nGÜNCEL ARAŞTIRMA NOTLARI (bunlara dayan, hafızandan tarih/fiyat uydurma):\n'
      + (arastirma || '(araştırma yapılamadı — tarih ve fiyat iddiasında BULUNMA, yalnızca kalıcı doğruları yaz)')
      + '\n\nGÖREVİN: Yayına hazır, TAM bir blog yazısı üret. YALNIZCA ' + dilAd + ' yaz — tek dil.\n\n'
      + (taban
        ? 'BU YAZI DİĞER DİLDE ZATEN VAR. Yeni bir yazı KURGULAMA; aşağıdaki yazının ' + dilAd + '\n'
          + 'sürümünü yaz. AYNA KURALI: aynı bölümler, aynı sıra, aynı ürünler, aynı sayılar.\n'
          + 'Kelimesi kelimesine çeviri yapma — hedef dilde doğal yaz — ama HİÇBİR bölüm ekleme,\n'
          + 'çıkarma ya da yeniden sıralama.\n'
          + 'SAYILAR BİREBİR TUTMALI: <h2> sayısı aynı, SSS sorusu sayısı aynı, öğe sayısı aynı.\n'
          + 'Diğer dilde 5 soru varsa sende de TAM 5 olacak.\n'
          + 'Ürün listesi ("items") birebir AYNI olmalı: aynı adet, aynı sıra, aynı "search"\n'
          + 'değerleri (katalog adları çevrilmez).\n\n'
          + 'DİĞER DİLDEKİ YAZI:\n' + JSON.stringify(taban).slice(0, 60000) + '\n\n'
        : '')
      + 'YAPIYI SEN KURARSIN. Şablon dayatılmıyor: bölüm sayısını, başlıkları, sıralamayı,\n'
      + 'kaç ürün anlatacağını, görsellerin nereye ve hangi boyutta geleceğini konuya göre\n'
      + 'SEN belirle. İyi bir yazı için ne gerekiyorsa onu yap.\n\n'
      + 'SADECE geçerli JSON döndür — açıklama, markdown çiti, selamlama YOK:\n'
      + '{\n'
      + '  "category": "<kategori anahtarı: ' + KATEGORI_ANAHTARLARI + '|... yoksa boş>",\n'
      + '  "template": "<yazının TÜRÜ: ' + SABLON_ANAHTARLARI + '>",\n'
      + '  "lang": { "title": "", "slug": "", "lead": "", "body_html": "", "conclusion_html": "",\n'
      + '            "metaTitle": "", "metaDescription": "", "tags": "" },\n'
      + '  "items": [\n'
      + '    { "kind": "product|subscription|service",\n'
      + '      "search": "<YALNIZ kind=product: sade katalog adı, marka + model, fiyat/ek İÇERMEZ>",\n'
      + '      "name": "<yazıda görünen başlık>",\n'
      + '      "brand": "<marka adı>",\n'
      + '      "site": "<markanın resmî alan adı, emin değilsen boş>",\n'
      + '      "blocks": [\n'
      + '        { "type": "text", "style": "paragraph|heading|subheading|bullets",\n'
      + '          "text": "<BU ÖĞENİN TAM METNİ — EN AZ 170 KELİME, 3 paragraf. 1) ne olduğu ve kime\n'
      + '                    hitap ettiği, 2) ölçülebilir farkı: en az üç somut sayı (mAh, nit, Hz, GB,\n'
      + '                    saat), 3) neye dikkat etmeli / kime UYGUN DEĞİL.>" },\n'
      + '        { "type": "image", "pos": "left|right|full|center", "size": "s|m|l", "cap": "" }\n'
      + '      ] }\n'
      + '  ]\n'
      + '}\n\n'
      + gorselKuralBlogu() + '\n\n'
      + metinKuralBlogu() + '\n\n'
      + 'UZUNLUK — BURAYA DİKKAT, EN SIK YAPILAN HATA BU\n'
      + '- TOPLAM 1400-2200 kelime. Bu toplam ŞUNLARIN HEPSİNİ kapsar:\n'
      + '  body_html + conclusion_html + items[] içindeki BÜTÜN blok metinleri.\n'
      + '- Bütçe şöyle dağılır ve HER BİRİ ayrı ayrı tutturulmalıdır:\n'
      + '    body_html          en az 250 kelime  (konuyu kur, karar kriterini söyle)\n'
      + '    her bir öğe metni  en az 170 kelime  (öğe sayısı × 170 = ana gövde)\n'
      + '    conclusion_html    en az 200 kelime  + SSS bölümü\n'
      + '- ASIL METİN ÖĞELERİN İÇİNDEDİR. En sık yaptığın hata öğelere iki-üç cümlelik metin\n'
      + '  yazmak; bu yazıyı "ince içerik" yapıyor ve sayfa değersizleşiyor.\n'
      + '- Uzunluğu doldurma cümlesiyle değil, DAHA FAZLA SOMUT BİLGİYLE karşıla.\n'
      + '- SON KONTROL: JSON\'u göndermeden önce her öğenin metnini kelime kelime say.\n\n'
      + seoKuralBlogu() + '\n\n'
      + 'ÖĞELER KONUYA AİT OLMAK ZORUNDA\n'
      + '- "items" listesine YALNIZCA yazının gerçekten ele aldığı ürünleri koy. Başlık bir ürün\n'
      + '  hakkındaysa, başka bir ürüne bölüm açma. Yazının KONUSUYLA ALAKASIZ öğe YASAK.\n'
      + '  Ölçüldü: "Apple\'ın 9 Eylül etkinliğinden neler beklenmeli?" başlıklı yazıya model\n'
      + '  "iPhone 17 Pro" bölümü eklemişti — okuyucunun sorduğu soruyla ilgisiz.\n'
      + '- Konu henüz ÇIKMAMIŞ bir ürünse (beklenti, sızıntı, etkinlik önizlemesi), "items" BOŞ\n'
      + '  olabilir ve olmalıdır da: var olmayan bir ürünün kartını açmak okuyucuya satın\n'
      + '  alınabilir bir şey varmış izlenimi verir.\n'
      + '- Karşılaştırma amaçlı bir önceki nesle DEĞİNMEK serbest — ama gövde metninde, ayrı bir\n'
      + '  ürün öğesi olarak DEĞİL.\n\n'
      + durustlukBlogu();
  }

  // ── 4) KOMUTLA DEĞİŞİKLİK ───────────────────────────────────────────────
  /* Taslak hazır olduktan sonra kullanıcı ekranda okuyup "girişi kısalt, 3.
     ürünü çıkar" diyebilmeli. Model MEVCUT metni görür ve YALNIZCA
     değiştirdiği alanları döndürür.

     ÖĞE İŞLEMLERİ YENİ. Eski prompt "içerik öğelerini bu çağrıda
     değiştiremezsin" diyordu, yani "3. ürünü çıkar" komutu çalışmıyordu.
     Artık model yalnızca İŞLEMİ söyler; uygulamayı kod yapar ve eklenen öğe
     KATALOG KAPISINDAN geçer (uydurma ürün giremez). */
  function komutPrompt(komut, mevcut) {
    return KONSEPT + '\n\n'
      + 'Aşağıda yayına hazırlanan bir blog yazısının MEVCUT hâli var. Kullanıcı bir DEĞİŞİKLİK istiyor.\n\n'
      + 'KULLANICININ İSTEĞİ:\n' + komut + '\n\n'
      + 'MEVCUT YAZI (JSON):\n' + JSON.stringify(mevcut || {}).slice(0, 120000) + '\n\n'
      + 'SADECE geçerli JSON döndür. YALNIZCA DEĞİŞTİRDİĞİN ALANLARI koy — dokunmadığın alanı\n'
      + 'hiç yazma, çünkü yazmadığın alan olduğu gibi korunur:\n'
      + '{\n'
      + '  "langs": { "tr": { "title": "", "lead": "", "body_html": "", "conclusion_html": "",\n'
      + '                     "metaTitle": "", "metaDescription": "" }, "en": { ... } },\n'
      + '  "items": [\n'
      + '    { "op": "remove",  "i": <öğe indeksi> },\n'
      + '    { "op": "reorder", "order": [<yeni sıradaki eski indeksler>] },\n'
      + '    { "op": "rewrite", "i": <indeks>, "tr": "<yeni düz metin>", "en": "<yeni düz metin>" },\n'
      + '    { "op": "add", "kind": "product|subscription|service", "search": "<sade katalog adı>",\n'
      + '      "name": "<görünen ad>", "tr": "<düz metin>", "en": "<düz metin>" }\n'
      + '  ],\n'
      + '  "note": "<ne yaptığını tek cümlede özetle, Türkçe>"\n'
      + '}\n\n'
      + 'KURALLAR:\n'
      + '- "items" alanını YALNIZCA kullanıcı öğelerden söz ettiyse doldur; yoksa hiç yazma.\n'
      + '- Kullanıcı "3. ürünü çıkar" derse indeks 0 tabanlıdır → {"op":"remove","i":2}.\n'
      + '- "add" ile eklediğin öğe KATALOG ARAMASINDAN geçer; katalogda yoksa özel öğe olur.\n'
      + '  Var olmayan ürün UYDURMA — emin değilsen "kind":"service" yaz.\n'
      + '- Öğe metinleri DÜZ METİN: HTML etiketi yok, kalın için **yıldız**, madde için "- ".\n'
      + '- İstek tek bir dili anıyorsa yalnız o dili değiştir; ikisini de anıyorsa ikisini birden.\n'
      + '- body_html/conclusion_html GEÇERLİ HTML olmalı (<h2>, <p>, <ul><li>, <strong>, <table>).\n'
      + '- metaTitle ' + C.META_TITLE_MAX + ', metaDescription ' + C.META_DESC_MAX + ' karakteri AŞMASIN.\n'
      + '- SSS başlıkları soru işaretiyle BİTMELİ (soru ≥12, cevap ≥40 karakter); site FAQPage\n'
      + '  verisini oradan üretiyor.\n'
      + '- İstenmeyen hiçbir şeyi değiştirme. "Girişi kısalt" dendiyse sonucu ELLEME.\n'
      + '- ÜRÜN FİYATI YAZMA — site canlı fiyatı kendisi gösterir.';
  }

  /* Öğe işlemlerini DETERMİNİSTİK uygula. Model yalnız işlemi söyler.
     SIRA ÖNEMLİ: indeksler ÇAĞRI ANINDAKİ diziye göre verildi, o yüzden
     önce rewrite (indeks sabit), sonra remove (büyükten küçüğe), sonra
     reorder, en son add (sona eklenir). `add` katalog gerektirir → ayrı
     döndürülür, çağıran `ogeleriIceAktar` ile geçirir. */
  function ogeIslemleriniUygula(products, ops, lang) {
    var liste = products.slice();
    var log = [];
    var eklenecek = [];
    var yaz = function (s) { log.push(s); };
    (ops || []).forEach(function (op) {
      if (!op || op.op !== 'rewrite') return;
      var p = liste[Number(op.i)];
      if (!p) { yaz('rewrite: ' + op.i + '. öğe yok, atlandı'); return; }
      C.ensureBlocks(p);
      var blok = p.blocks.filter(function (b) { return b.t === 'text'; })[0];
      if (!blok) { blok = C.bosMetinBlok(); p.blocks.push(blok); }
      if (op.tr) blok.tr = C.htmlToPlain(op.tr);
      if (op.en) blok.en = C.htmlToPlain(op.en);
      yaz('"' + C.itemName(p, lang || 'tr') + '" metni yeniden yazıldı');
    });
    var silinecek = (ops || []).filter(function (o) { return o && o.op === 'remove'; })
      .map(function (o) { return Number(o.i); })
      .filter(function (i) { return Number.isInteger(i) && i >= 0 && i < liste.length; })
      .sort(function (a, b) { return b - a; });
    silinecek.forEach(function (i) {
      yaz('"' + C.itemName(liste[i], lang || 'tr') + '" çıkarıldı');
      liste.splice(i, 1);
    });
    var reorder = (ops || []).filter(function (o) { return o && o.op === 'reorder' && Array.isArray(o.order); })[0];
    if (reorder && !silinecek.length) {
      var yeni = [];
      reorder.order.forEach(function (i) { if (liste[i]) yeni.push(liste[i]); });
      liste.forEach(function (p) { if (yeni.indexOf(p) < 0) yeni.push(p); });
      if (yeni.length === liste.length) { liste = yeni; yaz('öğeler yeniden sıralandı'); }
    } else if (reorder) {
      yaz('sıralama atlandı — aynı çağrıda silme var, indeksler kayardı');
    }
    (ops || []).forEach(function (op) {
      if (!op || op.op !== 'add') return;
      eklenecek.push({
        kind: op.kind || 'product',
        search: op.search || op.name || '',
        name: op.name || op.search || '',
        brand: op.brand || '', site: op.site || '',
        blocks: [{ t: 'text', style: 'paragraph', tr: C.htmlToPlain(op.tr || ''), en: C.htmlToPlain(op.en || '') }],
      });
    });
    return { products: liste, eklenecek: eklenecek, log: log };
  }

  // ── 5) DÜZEN & KALİTE ───────────────────────────────────────────────────
  /* Şablon hep aynı görünmesin ve görsel yerleşimi mekanik olmasın diye:
     yapay zekâ makaleyi OKUR, her öğe için görselin nereye/ne boyutta
     geleceğine METNE BAKARAK karar verir ve yayın öncesi sorunları listeler.
     METNİ DEĞİŞTİRMEZ — yalnız yerleşim + rapor. */
  function qaPrompt(outline) {
    return KONSEPT + '\n\n'
      + 'Sen bir yayın editörü ve sayfa tasarımcısısın. Aşağıda bir blog makalesinin yapısı JSON\n'
      + 'olarak veriliyor (dil: ' + ((outline && outline.lang) || 'tr') + ').\n\n'
      + 'GÖREVİN ÜÇ PARÇA:\n\n'
      + 'A) ŞABLON: Makalenin TÜRÜNÜ içeriğe bakarak belirle — "template" alanına yaz:\n'
      + '   topn (en iyi N listesi) | review (tek ürün incelemesi) | vs (karşılaştırma) |\n'
      + '   guide (satın alma rehberi) | howto (adım adım) | faq (soru-cevap) | deals (fırsat) |\n'
      + '   alt (alternatifler) | news (haber/duyuru).\n'
      + '   Verilen "template" değeri içerikle uyuşmuyorsa DÜZELT.\n\n'
      + 'B) GÖRSEL YERLEŞİMİ: Her öğe için görselin nereye ve ne büyüklükte konacağına METNİN\n'
      + '   UZUNLUĞUNA, ritmine ve ŞABLONA bakarak karar ver.\n'
      + '   - "pos": "left" | "right" | "center" | "full"   · "size": "s" | "m" | "l" | "xl"\n'
      + '   - Kısa metinde (<400 karakter) yana sarma kötü durur → "center"/"full".\n'
      + '     Uzun metinde (>600 karakter) yana sarma iyidir → "left"/"right".\n'
      + '   - ARDIŞIK öğelerde aynı tarafı tekrarlama, sağ-sol dönüşümlü bir ritim kur.\n'
      + '   - ŞABLONA GÖRE: topn\'de sıralı ritim (ilk öğe büyük); vs\'de iki taraf SİMETRİK;\n'
      + '     review\'da tek öğe "full"/"center"; guide/faq\'ta görseller küçük kalsın.\n'
      + '   - Öğe "custom/service" ise görseli genelde bir LOGO\'dur: logolar büyük basılmaz →\n'
      + '     "s" veya "m", tercihen "left"/"right".\n\n'
      + 'C) KALİTE DENETİMİ: Yayın öncesi gerçek sorunları bul. Uydurma sorun YAZMA; sorun yoksa\n'
      + '   boş dizi dön. Her sorun: {"level":"error"|"warn"|"info","text":"<tek cümle, Türkçe>"}\n'
      + '   Bakılacaklar: giriş yazısı konuyu kuruyor mu; öğe metinleri arasında ciddi uzunluk\n'
      + '   dengesizliği; anlam bütünlüğü (giriş listede vaat edileni tutuyor mu, sonuç öğelerle\n'
      + '   çelişiyor mu); başıboş kalmış kaynak adı/atıf artığı satırlar; tekrar eden kalıp\n'
      + '   cümleler; sonuç yazısı eksik mi; başlık ile içerik uyumsuzluğu; bir öğe yazının\n'
      + '   KONUSUYLA ALAKASIZ mı (yanlış eşleşmiş ürün).\n'
      + '   Görsel/kapak eksikliğini YAZMA — onu kod zaten otomatik tamamlıyor.\n'
      + '   Meta uzunluğu, slug, dil eksikliği gibi ÖLÇÜLEBİLİR şeyleri de YAZMA — onları kod\n'
      + '   deterministik olarak denetliyor, iki kez raporlanıyor.\n\n'
      + 'SADECE şu JSON\'u döndür:\n'
      + '{"template":"...","layout":[{"i":<öğe indeksi>,"pos":"...","size":"...","why":"<çok kısa gerekçe>"}],\n'
      + ' "issues":[{"level":"...","text":"..."}],"verdict":"<tek cümle genel değerlendirme, Türkçe>"}\n\n'
      + 'MAKALE YAPISI:\n' + JSON.stringify(outline || {});
  }

  /* Kaynak adı sınıflandırması AYRI ve ODAKLI bir çağrı. Aynı isteğe düzen +
     kalite ile birlikte konduğunda model dikkatini yapıya verip listeyi
     savsaklıyordu (19 adayın yalnız 3'ünü işaretledi). Tek işe odaklanınca
     18/19 doğru, gerçek içerikten hiçbiri yanlış işaretlenmedi (ölçüldü). */
  function junkPrompt(cands) {
    return 'Aşağıdaki liste, bir teknoloji blog yazısında TEK BAŞINA satır olarak duran kısa\n'
      + 'metinlerdir. Bir kısmı, yazı kopyalanırken kaynak bağlantılarından arta kalan\n'
      + 'YAYIN/SİTE/İNCELEME KANALI ADLARIDIR ve yazıya ait değildir; bir kısmı ise gerçek\n'
      + 'içeriktir (ara başlık, ürün adı, teknik terim).\n\n'
      + 'HER SATIRI TEK TEK sınıflandır. Atlama, hepsi için karar ver.\n\n'
      + 'SADECE şu JSON: {"junk":["<yayın/kaynak adı olanlar>"],"keep":["<gerçek içerik olanlar>"]}\n\n'
      + 'SATIRLAR:\n' + JSON.stringify(cands || []);
  }

  // ── 6) AKILLI İÇE AKTARMA ───────────────────────────────────────────────
  /* Claude her seferinde aynı biçimi vermez: bazen "# Başlık", bazen
     "TITLE:/SLUG:" etiketli bölümler, bazen iki dil arka arkaya. Katı
     ayrıştırıcı yerine metni olduğu gibi Gemini'ye verip ŞEMAYA çevirtiyoruz. */
  function autoSchemaPrompt(raw) {
    return 'Sen bir içerik dönüştürücüsün. Aşağıdaki HAM METİN bir blog makalesidir; biçimi\n'
      + 'serbesttir (başlık etiketleri, birden çok dil, markdown, dağınık notlar olabilir).\n\n'
      + 'GÖREVİN: Ham metni AŞAĞIDAKİ JSON ŞEMASINA dönüştür. SADECE geçerli JSON döndür.\n\n'
      + 'ŞEMA:\n'
      + '{\n'
      + '  "category": "<' + KATEGORI_ANAHTARLARI + '|... yoksa boş>",\n'
      + '  "template": "<yazının TÜRÜ: ' + SABLON_ANAHTARLARI + '>",\n'
      + '  "langs": {\n'
      + '    "tr": { "title": "", "slug": "", "lead": "", "body_html": "", "conclusion_html": "",\n'
      + '            "metaTitle": "", "metaDescription": "", "tags": "" },\n'
      + '    "en": { ... }\n'
      + '  },\n'
      + '  "items": [\n'
      + '    { "kind": "product|subscription|service",\n'
      + '      "search": "<YALNIZ kind=product için: sade model adı, marka + model, FİYAT/ek İÇERMEZ>",\n'
      + '      "name": "<yazarın yazdığı görünen başlık, aynen>",\n'
      + '      "brand": "<marka/hizmet adı, sade: Midjourney, OpenAI, Adobe>",\n'
      + '      "site": "<markanın RESMÎ alan adı: midjourney.com — emin değilsen BOŞ>",\n'
      + '      "blocks": [ { "type": "text", "style": "paragraph|heading|subheading|bullets",\n'
      + '                    "tr": "", "en": "" },\n'
      + '                  { "type": "image", "pos": "left|right|full|center", "size": "s|m|l" } ] }\n'
      + '  ]\n'
      + '}\n\n'
      + 'KURALLAR — ÇOK ÖNEMLİ:\n'
      + '0. "kind" ALANI KRİTİK — yanlışı yazının içine alakasız ürün kartı sokar:\n'
      + '   - "product": mağazadan satın alınan FİZİKSEL cihaz. Sadece bunlar katalogda aranır.\n'
      + '   - "subscription": aylık/yıllık ücretli üyelik (ChatGPT Plus, Netflix, NordVPN).\n'
      + '   - "service": ücretli üyeliğe indirgenemeyen yazılım/araç (Midjourney, Figma).\n'
      + '   Bir yazılım/hizmet ASLA "product" olamaz. Emin değilsen "service" yaz.\n'
      + '0b. "template": yazının türünü içeriğe bakarak SEN belirle.\n'
      + '1. HİÇBİR CÜMLEYİ ATLAMA, ÖZETLEME, KISALTMA. Metnin tamamı çıktıda yer almalı.\n'
      + '   Bu bir biçimlendirme işidir, yeniden yazma değil.\n'
      + '2. Ham metinde KAÇ DİL varsa o kadarını doldur. Olmayan dili boş obje bırak ({}).\n'
      + '   Kendin ÇEVİRİ YAPMA.\n'
      + '3. Numaralı ürün/hizmet bölümleri items dizisine gider; o bölümün TÜM metni (paragraflar,\n'
      + '   Artıları/Eksileri listeleri, "Kime Uygun?" kısmı) o öğenin blocks metnine girer.\n'
      + '   Aynı ürünün farklı dillerdeki bölümleri AYNI item içinde tr/en olarak eşleşmeli.\n'
      + '4. Ürün bölümlerinden ÖNCEKİ giriş body_html\'e; SONRAKİ sonuç conclusion_html\'e gider.\n'
      + '5. body_html ve conclusion_html GEÇERLİ HTML olsun: <h2>/<h3>, <p>, <ul><li>, <strong>,\n'
      + '   <table>. Kaynak/atıf bağlantılarını KOYMA.\n'
      + '6. items içindeki blocks metinleri HTML DEĞİL DÜZ METİNDİR. İçine <a>, <p>, <strong> gibi\n'
      + '   HİÇBİR ETİKET KOYMA. Kalın için **yıldız**, madde için "- ", ara başlık için "## ".\n'
      + '7. slug boşsa başlıktan üret (küçük harf, tireli, Türkçe karakterler sadeleştirilmiş).\n'
      + '8. metaTitle ' + C.META_TITLE_MAX + ', metaDescription ' + C.META_DESC_MAX + ' KARAKTERİ AŞMASIN.\n'
      + '9. KAYNAK ADI ÇÖPÜNÜ AT: metin bir sohbet ekranından kopyalanmış olabilir; kaynak\n'
      + '   bağlantıları düz metne dönüşüp tek başına satır olarak kalır ("MacRumors",\n'
      + '   "The Gadgeteer", "GSMArena"). Bunları çıktıya HİÇ ALMA. Gerçek cümleleri ve ara\n'
      + '   başlıkları ("Artıları:", "Kime Uygun?") aynen koru.\n\n'
      + gorselKuralBlogu() + '\n\n'
      + 'HAM METİN:\n' + String(raw || '');
  }

  // Claude'a elle verilecek prompt (İçe Aktar → "Claude prompt'u" sekmesi).
  function claudePrompt(kategoriler) {
    var cats = (kategoriler && kategoriler.length) ? kategoriler.join(', ')
      : 'smartphones, laptops, tablets, headphones, monitors, tvs, smartwatches';
    return 'Sen Qor AI (qorai.net) için blog makalesi yazan bir editörsün. Konu: [KONU]\n\n'
      + 'GÖREV: Bu konuda 2 dilde (Türkçe, İngilizce) eksiksiz bir makale yaz ve SADECE aşağıdaki\n'
      + 'şemaya uyan geçerli bir JSON döndür. JSON dışında hiçbir şey yazma.\n\n'
      + 'ŞEMA:\n{\n'
      + '  "category": "<şunlardan biri: ' + cats + '>",\n'
      + '  "langs": {\n'
      + '    "tr": { "title": "", "slug": "", "lead": "<120-160 karakter>",\n'
      + '            "body_md": "<GİRİŞ, markdown, 150-300 kelime. Ürün anlatımlarını BURAYA YAZMA>",\n'
      + '            "conclusion_md": "<SONUÇ + SSS, 80-150 kelime>",\n'
      + '            "metaTitle": "<≤' + C.META_TITLE_MAX + ' karakter>",\n'
      + '            "metaDescription": "<≤' + C.META_DESC_MAX + ' karakter>",\n'
      + '            "tags": "<virgülle 4-6 etiket>" },\n'
      + '    "en": { <aynı alanlar İngilizce> }\n'
      + '  },\n'
      + '  "items": [\n'
      + '    { "kind": "product", "search": "<sade model adı>", "name": "<görünen ad>",\n'
      + '      "blocks": [ { "type": "text", "style": "paragraph", "tr": "<80-150 kelime>", "en": "" } ] }\n'
      + '  ]\n}\n\n'
      + 'KURALLAR:\n'
      + '- Liste makalesiyse 5-7 ürün; inceleme ise 1 ürün; karşılaştırmaysa 2 ürün.\n'
      + '- "search" alanı KRİTİK: mağaza eki olmadan, jenerik model adı (renk/kapasite yazma).\n'
      + '- Her ürünün bloğunda somut artı/eksi ve kime uygun olduğu olsun; pazarlama dili değil.\n'
      + '- FİYAT YAZMA (site canlı fiyatı kendisi gösterir).\n'
      + '- İki dil birbirinin çevirisi olsun ama doğal aksın.\n'
      + '- SSS: conclusion_md içine soru işaretiyle biten "## " başlıkları koy (en az 3, soru ≥12\n'
      + '  karakter, cevap ≥40 karakter) — site FAQPage yapısal verisini oradan üretiyor.\n'
      + '- metaTitle/metaDescription sınırlarını yazmadan önce karakter say.\n'
      + '- JSON string\'lerinde gerçek satır sonu için \\n kullan.';
  }

  // ── 7) ÇEVİRİ ───────────────────────────────────────────────────────────
  var LANG_NAME = { en: 'İngilizce (English)', tr: 'Türkçe' };
  function ceviriPrompt(payload, dst) {
    return 'Sen teknoloji sitesi Qor AI için profesyonel bir çevirmensin. Aşağıdaki JSON\'daki TÜM\n'
      + 'metinleri ' + (LANG_NAME[dst] || dst) + ' diline çevir.\n\n'
      + 'KESİN KURALLAR:\n'
      + '- Çıktı SADECE geçerli JSON olsun; girdiyle BİREBİR aynı yapı ve aynı anahtarlar\n'
      + '  (items dizisindeki "i" ve "j" sayıları AYNEN korunacak).\n'
      + '- HTML etiketlerini (<p>, <h2>, <ul>, <li>, <strong>, <table>) AYNEN koru; sadece\n'
      + '  etiketler ARASINDAKİ metni çevir.\n'
      + '- Markdown işaretlerini koru: **kalın**, satır başındaki "- " maddeleri, "## " başlıkları.\n'
      + '- Ürün/marka/model adlarını, teknik birimleri (mAh, GB, Hz, nit) ve sayıları ÇEVİRME.\n'
      + '- Doğal ve akıcı yaz — kelimesi kelimesine değil.\n'
      + '- metaTitle ' + C.META_TITLE_MAX + ' karakteri, metaDescription ' + C.META_DESC_MAX + ' karakteri AŞMASIN.\n'
      + '- SSS başlıklarındaki SORU İŞARETİNİ koru; site FAQPage verisini oradan üretiyor.\n'
      + '- Boş gelen alanları boş bırak.\n\n'
      + 'ÇEVRİLECEK JSON:\n' + JSON.stringify(payload || {});
  }

  // Marka alan adı — görsel için. Gemini görseli ÜRETMEZ/İNDİRMEZ; yalnızca
  // markanın RESMÎ ALAN ADINI söyler, adaylar oradan türetilir ve her aday
  // GERÇEKTEN YÜKLENEREK doğrulanır (naturalWidth ölçülür).
  function markaAlanPrompt(entries) {
    return 'Aşağıda bir teknoloji blog yazısındaki öğelerin adları var. Her öğe için MARKANIN/\n'
      + 'HİZMETİN RESMÎ WEB SİTESİNİN ALAN ADINI ver.\n\n'
      + 'SADECE şu JSON: {"items":[{"i":<verilen indeks>,"brand":"<marka adı, sade>",'
      + '"site":"<alan adı, örn: midjourney.com — http/www/yol YOK>","kind":"product|subscription|service"}]}\n\n'
      + 'KURALLAR:\n'
      + '- Alan adından EMİN DEĞİLSEN "site" alanını BOŞ bırak. Uydurma.\n'
      + '- "site" markanın ANA alan adı olsun (ürün sayfası değil).\n'
      + '- "kind": fiziksel cihaz → product; aylık/yıllık ücretli üyelik → subscription;\n'
      + '  onun dışındaki yazılım/hizmet → service.\n\n'
      + 'ÖĞELER:\n' + JSON.stringify(entries || []);
  }

  // ══ TAŞIMA KATMANI ═══════════════════════════════════════════════════════
  function pb() {
    if (typeof root.getPb !== 'function') throw new Error('PocketBase istemcisi yüklenmedi');
    return root.getPb();
  }

  /* Sunucudaki Gemini proxy'si üzerinden. Anahtar istemciye HİÇ inmez.
     thinkingBudget=0: bu işler düşünme gerektirmiyor ve budget>maxOutputTokens
     kombinasyonu "boş yanıt" hatasına yol açıyordu. */
  async function callGeminiJson(prompt, maxOutputTokens) {
    var p = pb();
    var res = await fetch(p.baseUrl.replace(/\/$/, '') + '/api/ai/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: p.authStore.token },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: maxOutputTokens || 32768,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.error) {
      throw new Error((data.error && (data.error.message || data.error)) || data.message || ('AI isteği başarısız (' + res.status + ')'));
    }
    var cand = (data.candidates || [])[0] || {};
    var text = ((cand.content || {}).parts || []).map(function (x) { return x.text || ''; }).join('').trim();
    /* BİTİŞ SEBEBİ HATA MESAJINA GİRER.
       "AI yanıtı çözülemedi" yıllarca opak bir hataydı: gerçek sebep neredeyse
       her zaman `finishReason: MAX_TOKENS` — JSON yarıda kesildi. Sebebi
       yazmayan hata mesajı teşhisi kullanıcıya yıkıyordu. */
    var sebep = cand.finishReason || '';
    var kesik = /MAX_TOKENS/i.test(sebep);
    if (!text) {
      throw new Error(kesik
        ? 'AI yanıtı jeton sınırına takıldı (içerik çok uzun) — daha kısa iste'
        : 'AI boş yanıt döndü' + (sebep ? ' (' + sebep + ')' : ''));
    }
    try { return JSON.parse(text); } catch (_) {
      var m = text.match(/\{[\s\S]*\}/);
      if (m) { try { return JSON.parse(m[0]); } catch (__) { /* düş */ } }
      throw new Error(kesik
        ? 'AI yanıtı YARIDA KESİLDİ (' + text.length.toLocaleString('tr-TR') + ' karakter, jeton sınırı doldu).'
        : 'AI yanıtı çözülemedi (' + text.length.toLocaleString('tr-TR') + ' karakter' + (sebep ? ', ' + sebep : '') + ')');
    }
  }

  /* Grounded çağrı. `askGrounded` JSON MODUNU KULLANAMAZ — Gemini
     `googleSearch` + `responseMimeType: application/json` kombinasyonunu kabul
     etmiyor. Metin döner, `parseAiJson` ile çözülür.
     `QorAiRun` bu dosyadan SONRA yükleniyor; modül üstü seviyede ona
     DOKUNULMAZ, çağrı anında alınır. */
  async function grounded(prompt, maxOut) {
    var R = root.QorAiRun;
    var P = root.QorAiPrompts;
    if (!R || !R.askGrounded) throw new Error('AI motoru yüklenmedi (qor_ai_run.js)');
    var txt = await R.askGrounded(prompt, 'tr', maxOut || 4096);
    return { text: String(txt || ''), json: (P && P.parseAiJson) ? P.parseAiJson(txt) : null };
  }

  // ══ KATALOG ══════════════════════════════════════════════════════════════
  /* İKİ GEÇİŞ: önce sert, sonra gevşek. Sert geçişten bir aday çıkarsa gevşek
     geçiş HİÇ çalışmaz; yumuşatma yalnızca "hiç eşleşme yok" durumunu
     kurtarır, doğru eşleşmeyi bozamaz.
     perPage 12: katalog adları SKU taşıyor ve tek ürünün 6-8 varyantı arka
     arkaya geliyor; doğru varyant ilk beşin dışında kalabiliyordu. */
  async function resolveCatalogItem(q) {
    try {
      var r = await root.TsClient.search(q, { perPage: 12 });
      var hits = (r.hits || []).map(function (h) { return h.document; });
      if (!hits.length) return null;
      var best = C.bestMatch(q, hits);
      if (!best) return null;
      var d = best.doc;
      return {
        id: d.id, slug: d.slug || C.slugify(d.name), name: d.name, brand: d.brand || '',
        techScore: d.techScore || 0, imageUrl: d.imageUrl || '',
        // Gevşek eşleşmede kartta katalogun KENDİ adı görünür, yani okuyucu
        // varyantı zaten görür — ama yazarın da bir kez bakması gerekir.
        gevsekEslesme: best.gevsek,
      };
    } catch (_) { return null; }
  }

  /* Öğe listesini katalogla eşleştir. `_products`'a DOKUNMAZ: yeni diziyi ve
     raporu döndürür, çağıran atar. Böylece test edilebilir ve iki içe aktarma
     yolu aynı kapıdan geçer. */
  async function ogeleriIceAktar(items) {
    var out = [];
    var report = [];
    for (var i = 0; i < (items || []).length; i++) {
      var it = items[i];
      var kind = it.kind || 'product';
      // Katalog/abonelik araması fiyat ekinden arındırılmış adla yapılır;
      // eşleşme bulunursa görünen ad katalogdan gelir, bulunmazsa yazarın ham adı korunur.
      var q = C.cleanItemName(C.stripLeadingNumber(String(it.search || it.name || '').trim()));
      var eslesti = false;

      if (kind === 'subscription' && q) {
        try {
          var r = await pb().collection('subscriptions').getList(1, 1, {
            filter: 'name ~ "' + q.replace(/"/g, '\\"') + '"', $autoCancel: false,
          });
          var s = (r.items || [])[0];
          if (s) {
            out.push({
              kind: 'subscription', id: s.id, slug: s.slug || C.slugify(s.name), name: s.name,
              image: '', imageUrl: s.logo || '', logo: s.logo || '', website: s.website || '',
              affiliateUrl: s.affiliateUrl || '', category: s.category || '', blocks: it.blocks,
            });
            report.push({ q: q, ok: true, label: q + ' → ' + s.name + ' (abonelik)' });
            eslesti = true;
          }
        } catch (_) { /* düş */ }
      }
      if (!eslesti && kind === 'product' && q) {
        var hit = await resolveCatalogItem(q);
        if (hit) {
          // Katalog görselini öğeye taşı — sanitizeArticle bunu ilk görsel
          // bloğu olarak yerleştirir (yayınlanan yazıda ürün görseli çıksın).
          out.push(Object.assign({}, hit, { kind: 'product', image: hit.imageUrl || '', blocks: it.blocks }));
          report.push(hit.gevsekEslesme
            ? { q: q, ok: true, warn: true, label: q + ' → ' + hit.name + ' (katalog · yakın varyant — kontrol et)' }
            : { q: q, ok: true, label: q + ' → ' + hit.name + ' (katalog)' });
          eslesti = true;
        }
      }
      if (eslesti) continue;

      /* Bulunamadı (ya da zaten katalog dışı bir hizmet) → özel öğe. Yazarın
         yazdığı ad korunur (fiyat eki dahil — katalog dışı öğelerde tek fiyat
         bilgisi odur) ama baştaki sıra numarası atılır: site numarayı KENDİ
         basar, yoksa "1. 1. iPad Pro" görünür. */
      var nm = C.stripLeadingNumber(String(it.name || q || 'Öğe'));
      out.push({
        kind: 'custom', id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        slug: C.slugify(nm), name: nm, name_tr: it.name_tr || nm, name_en: it.name_en || nm,
        link: it.link || '', image: it.image || '', imageUrl: '',
        brand: it.brand || '', site: domainOf(it.site) || '',
        blocks: it.blocks,
      });
      // Hizmet/abonelik öğesinde "katalogda bulunamadı" bir HATA DEĞİL —
      // beklenen durum. Rapor dilini buna göre ayır, yoksa her yazıda sahte uyarı çıkar.
      report.push(kind === 'product'
        ? { q: nm, ok: false, label: nm + ' — katalogda bulunamadı, özel öğe olarak eklendi' }
        : { q: nm, ok: true, label: nm + ' → katalog dışı ' + (kind === 'subscription' ? 'abonelik' : 'hizmet') + ' (özel öğe)' });
    }
    return { products: out, report: report };
  }

  // ══ GÖRSEL ÇÖZÜMLEME ═════════════════════════════════════════════════════
  var IMG_MIN_PX = 40;

  function probeImage(url, timeoutMs) {
    return new Promise(function (resolve) {
      var u = String(url || '').trim();
      if (!u || typeof root.Image !== 'function') { resolve(null); return; }
      var img = new root.Image();
      var done = false;
      var timer = null;
      var finish = function (v) { if (done) return; done = true; clearTimeout(timer); img.onload = null; img.onerror = null; resolve(v); };
      timer = setTimeout(function () { finish(null); }, timeoutMs || 9000);
      img.onload = function () { finish((img.naturalWidth || 0) >= IMG_MIN_PX ? { url: u, w: img.naturalWidth, h: img.naturalHeight } : null); };
      img.onerror = function () { finish(null); };
      img.referrerPolicy = 'no-referrer';
      img.src = u;
    });
  }

  function domainOf(value) {
    var d = String(value || '').trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '');
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : '';
  }

  // Sıra ÖNEMLİ: markanın kendi sitesinden gelen ikon en doğrusu (ve marka
  // kullanımı açısından en güvenlisi).
  function logoCandidates(domain) {
    var d = domainOf(domain);
    if (!d) return [];
    return [
      'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(d) + '&sz=256',
      'https://icons.duckduckgo.com/ip3/' + d + '.ico',
      'https://' + d + '/favicon.ico',
    ];
  }

  function pbImgProxy(url) {
    return (pb().baseUrl || '').replace(/\/$/, '') + '/api/img?url=' + encodeURIComponent(url);
  }

  // Adayları sırayla dene; ilk YÜKLENEN kazanır. Doğrudan yüklenmeyen ama
  // sunucu proxy'sinden gelen (hotlink korumalı) adresler de kabul edilir —
  // site zaten aynı proxy'ye düşüyor (BlogPost.jsx imageOnError).
  async function firstLoadableImage(candidates) {
    for (var i = 0; i < (candidates || []).length; i++) {
      var c = candidates[i];
      if (!c) continue;
      var direct = await probeImage(c);
      if (direct) return direct.url;
      var viaProxy = await probeImage(pbImgProxy(c), 12000);
      if (viaProxy) return c;
    }
    return '';
  }

  async function askItemBrandMeta(entries) {
    if (!entries.length) return new Map();
    try {
      var out = await callGeminiJson(markaAlanPrompt(entries), 3000);
      var map = new Map();
      (Array.isArray(out.items) ? out.items : []).forEach(function (row) {
        var i = Number(row && row.i);
        if (!Number.isFinite(i)) return;
        map.set(i, {
          brand: String(row.brand || '').trim(),
          site: domainOf(row.site),
          kind: String(row.kind || '').trim(),
        });
      });
      return map;
    } catch (_) { return new Map(); }
  }

  /* GÖRSELİ OLMAYAN ÖĞELERE GÖRSEL — AMA YALNIZ ABONELİK/HİZMET.
     Logo arama bir ABONELİK satırında doğru şey (Netflix satırında Netflix
     logosu), ama bir ÜRÜN makalesinde felaket: katalogda bulunamayan ürüne
     Google favicon'u koyuyordu. Ölçüldü 2026-09-03, canlı taslak: "iPhone 18
     Pro" öğesinin görseli `google.com/s2/favicons?domain=apple.com`, kapak
     görseli de büyütülmüş bir Apple logosuydu.
     Kullanıcının kararı: "görselleri ai bulmasın, boktan görseller buluyor".
     Ürün görselleri KATALOGDAN gelir; katalogda yoksa görsel BOŞ kalır ve
     yazar elle koyar. */
  async function resolveItemImages(products, lang, onStatus) {
    var say = function (s) { if (typeof onStatus === 'function') onStatus(s); };
    var pending = [];
    (products || []).forEach(function (p, i) {
      if (C.itemHasImage(p)) return;
      var kind = p.kind || 'product';
      var logoMantikli = kind === 'subscription' || (kind === 'custom' && domainOf(p.site || p.link));
      if (!logoMantikli) return;
      pending.push({ i: i, p: p, name: String(p['name_' + (lang || 'tr')] || p.name || p.name_tr || '').trim() });
    });
    if (!pending.length) return { filled: 0, pending: 0 };

    say(pending.length + ' öğe için görsel aranıyor…');
    // Öğenin kendi alanında zaten alan adı varsa Gemini'ye sormaya gerek yok.
    var needMeta = pending.filter(function (e) { return !domainOf(e.p.site || e.p.link); });
    var meta = await askItemBrandMeta(needMeta.map(function (e) { return { i: e.i, name: e.name }; }));

    var filled = 0;
    var queue = pending.slice();
    var worker = async function () {
      for (;;) {
        var entry = queue.shift();
        if (!entry) return;
        var m = meta.get(entry.i) || {};
        var site = domainOf(entry.p.site || entry.p.link) || m.site || '';
        if (m.brand && !entry.p.brand) entry.p.brand = m.brand;
        if (site) entry.p.site = site;
        var url = await firstLoadableImage(logoCandidates(site));
        if (url) { entry.p.image = url; entry.p.imageSource = 'brand-logo'; filled += 1; }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    say(filled ? (filled + '/' + pending.length + ' öğeye görsel bulundu.') : 'Uygun görsel bulunamadı.');
    return { filled: filled, pending: pending.length };
  }

  /* KAPAK: ÜRÜN fotoğrafı logolara tercih edilir.
     MARKA LOGOSU KAPAK OLMAZ — `imageSource === 'brand-logo'` olan görseller
     kapak adaylığından çıkarılır: ölçüldü 2026-09-03, kapak büyütülmüş bir
     Apple logosuydu ve paylaşım önizlemesinde de o çıkıyordu. */
  function autoPickCover(a, products) {
    if (a.cover || a.coverFile) return '';
    var byKind = function (k) {
      return (products || []).filter(function (p) { return (p.kind || 'product') === k; })
        .map(C.itemImageUrl).find(Boolean);
    };
    var gercekFoto = function (p) { return p.imageSource !== 'brand-logo' && C.itemImageUrl(p); };
    var pick = byKind('product') || (products || []).map(gercekFoto).find(Boolean) || byKind('subscription') || '';
    if (pick) a.cover = pick;
    return pick;
  }

  root.BlogAi = {
    KONSEPT: KONSEPT,
    // prompt üreticileri (saf — testten çağrılıyor)
    konuPrompt: konuPrompt, arastirmaPrompt: arastirmaPrompt, yazarPrompt: yazarPrompt,
    komutPrompt: komutPrompt, qaPrompt: qaPrompt, junkPrompt: junkPrompt,
    autoSchemaPrompt: autoSchemaPrompt, claudePrompt: claudePrompt,
    ceviriPrompt: ceviriPrompt, markaAlanPrompt: markaAlanPrompt,
    gorselKuralBlogu: gorselKuralBlogu, seoKuralBlogu: seoKuralBlogu,
    metinKuralBlogu: metinKuralBlogu, durustlukBlogu: durustlukBlogu,
    // saf uygulayıcılar
    ogeIslemleriniUygula: ogeIslemleriniUygula,
    // taşıma + ağ
    callGeminiJson: callGeminiJson, grounded: grounded,
    resolveCatalogItem: resolveCatalogItem, ogeleriIceAktar: ogeleriIceAktar,
    resolveItemImages: resolveItemImages, autoPickCover: autoPickCover,
    domainOf: domainOf, logoCandidates: logoCandidates, probeImage: probeImage,
    firstLoadableImage: firstLoadableImage,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
