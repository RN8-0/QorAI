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

  // Eski blog.js'te sabitti; altin kopyadaki ceviri metni bunu kullaniyor.
  var LANG_NAME = { en: 'İngilizce (English)' };
  function bugunStr() { return new Date().toISOString().slice(0, 10); }

  /* ══ PROMPT'LAR — METİNLER ESKİ blog.js'TEN BİREBİR ═══════════════════════
     2026-09-04'te yeniden yazım sırasında bu metinler "toparlanırken" kurallar
     SESSİZCE DÜŞTÜ ve konu sihirbazı genel geçer, rekabeti yüksek, trend
     olmayan konular önermeye başladı (kullanıcı bildirdi). Düşenler:
       konu   · "Fiyattan söz edeceksen USD/EUR/GBP üzerinden ve küresel bir
                 hareket olarak söz et (üretici zammı, bellek maliyeti…)"
              · "Bulduğun kaynak geçmişte kalmış bir beklentiden söz ediyorsa o
                 kaynak BAYATTIR — o konuyu ya at ya da güncel kaynakla değiştir"
       yazar  · "170'in altında kalan varsa GERİ DÖN ve o öğeyi genişlet"
              · "Sorular gerçekten sorulan sorular olsun, doldurma değil"
              · "sayı, ölçüm, karşılaştırma, kime uygun değil" numaralandırması

     ARTIK PROMPT METNİ ELLE DÜZENLENMEZ. Metinler
     scripts/fixtures/blog_prompt_golden.json altın kopyasından üretiliyor
     (scripts/_blog_ai_prompt_geri_al.mjs) ve gerileme testi §8 her cümlenin
     yerinde durduğunu denetliyor. Bir kuralı gerçekten değiştirmek gerekirse
     altın kopyayı da bilerek güncelle — sessiz kısaltma YOK. */

  function konuPrompt(n, hint, basliklar) {
    var bugun = bugunStr();
    var mevcutBasliklar = function () { return basliklar || []; };
    return `${KONSEPT}

BUGÜN: ${bugun}

GÖREV: Bu site için ${n} blog konusu öner ve FIRSATA GÖRE SIRALA (en iyisi ilk).

ZORUNLU: Google aramasını kullan. Öneriler ŞU ANKİ trendlere, yeni çıkmış ürünlere,
yaklaşan lansmanlara, fiyat hareketlerine ve insanların BU HAFTA aradığı sorulara
dayanmalı. Kendi hafızandan genel geçer konu üretme.

ZATEN YAZILMIŞ BAŞLIKLAR — bunların konusunu TEKRARLAMA:
${mevcutBasliklar().map((t) => `- ${t}`).join('\n') || '- (henüz yok)'}
${hint ? `\nKULLANICININ VERDİĞİ YÖN: ${hint}\n` : ''}
SADECE geçerli JSON döndür, başka hiçbir şey yazma:
{"topics":[{
  "title":"<English article title — specific and curious but not clickbait, 45-70 characters>",
  "title_tr":"<same title in Turkish, natural not translated-sounding>",
  "angle":"<bu yazı ötekilerden NEYLE ayrışıyor: 1-2 cümle>",
  "why":"<neden ŞİMDİ: aramada bulduğun somut olay/tarih/fiyat hareketi>",
  "intent":"<bilgi arama|karşılaştırma|satın alma|sorun çözme>",
  "keyword":"<tek hedef anahtar kelime öbeği, Türkçe>",
  "products":["<sitede olması muhtemel 2-5 ürün adı, marka+model>"]
}]}

KURALLAR:
- Konular sitenin kategorilerinde OLMALI (telefon, laptop, tablet, kulaklık, monitör, TV, akıllı saat, konsol, robot süpürge).
- KONU KÜRESEL OLMALI. Sitenin kök adresi İNGİLİZCE ve okuyucuların çoğu
  Türkiye dışında. "X ürünü Türkiye'de satışa sunuldu", "Türkiye fiyatı",
  "döviz kuru etkisi" gibi TEK ÜLKEYE ait konular ÖNERME — Amerika'daki ya da
  Almanya'daki okuyucu için hiçbir şey ifade etmez.
  Fiyattan söz edeceksen USD/EUR/GBP üzerinden ve küresel bir hareket olarak
  söz et (üretici zammı, bellek maliyeti, lansman fiyatı). Bir konu YALNIZCA
  tek bir ülkede anlamlıysa o konu bu site için yanlıştır.
- Aramayı İNGİLİZCE sorgularla yap; küresel kaynaklara (Reddit, The Verge,
  Ars Technica, Notebookcheck, GSMArena, RTINGS, uluslararası YouTube
  incelemeleri) ulaşman gerekiyor. Yerel haber sitelerini kaynak alma.
- "why" alanına aramada gerçekten gördüğün bir şey yaz; bulamadıysan o konuyu ÖNERME.
- Tıklama tuzağı başlık yazma; sayı veren, somut başlık yaz.
- KANIT TAZE OLMALI. Arama sana ESKİ haberleri de getirir; ${bugun} tarihinden
  90 günden daha geriye giden bir olayı "neden şimdi" diye gösterme. Bulduğun
  kaynak "2024 sonunda çıkacak" gibi geçmişte kalmış bir beklentiden söz
  ediyorsa o kaynak bayattır — o konuyu ya at ya da güncel kaynakla değiştir.
  Aynı maddede hem gelecek hem geçmiş tarih varsa o maddeyi hiç yazma.`;
  }

  function arastirmaPrompt(baslik) {
    return `Topic: "${baslik}". Gather the facts that are true TODAY for a GLOBAL audience: newly released or upcoming models and their dates, current price ranges in USD/EUR/GBP, availability, recurring owner complaints, what expert reviews agree on, recent price moves. Search in English and prefer international sources (Reddit, The Verge, Ars Technica, Notebookcheck, GSMArena, RTINGS, major YouTube reviews). Write bullet points; say what each source claims. Plain text, NOT JSON.`;
  }

  function yazarPrompt(konu, arastirma, lang, taban) {
    var bugun = bugunStr();
    var dilAd = lang === 'tr' ? 'TÜRKÇE' : 'İNGİLİZCE (English)';
    konu = konu || {};
    return `${KONSEPT}

BUGÜN: ${bugun}

KONU: ${konu.title || konu}
${konu.angle ? `AÇI: ${konu.angle}` : ''}
${konu.keyword ? `HEDEF ANAHTAR KELİME: ${konu.keyword}` : ''}
${konu.intent ? `ARAMA NİYETİ: ${konu.intent}` : ''}

GÜNCEL ARAŞTIRMA NOTLARI (bunlara dayan, hafızandan tarih/fiyat uydurma):
${arastirma || '(araştırma yapılamadı — tarih ve fiyat iddiasında BULUNMA, yalnızca kalıcı doğruları yaz)'}

GÖREVİN: Yayına hazır, TAM bir blog yazısı üret. YALNIZCA ${dilAd} yaz — tek dil.

${taban ? `BU YAZI DİĞER DİLDE ZATEN VAR. Yeni bir yazı KURGULAMA; aşağıdaki
yazının ${dilAd} sürümünü yaz. Aynı bölümler, aynı sıra, aynı ürünler, aynı
sayılar. Kelimesi kelimesine çeviri yapma — hedef dilde doğal yaz — ama
HİÇBİR bölüm ekleme, çıkarma ya da yeniden sıralama.
SAYILAR BİREBİR TUTMALI: <h2> sayısı aynı, SSS sorusu sayısı aynı, öğe
sayısı aynı. Diğer dilde 5 soru varsa sende de TAM 5 olacak — bir tane
fazla ya da eksik yazma.
Ürün listesi ("items") birebir AYNI olmalı: aynı adet, aynı sıra, aynı
"search" değerleri (katalog adları çevrilmez).

DİĞER DİLDEKİ YAZI:
${JSON.stringify(taban).slice(0, 60000)}
` : ''}
YAPIYI SEN KURARSIN. Şablon dayatılmıyor: bölüm sayısını, başlıkları, sıralamayı,
kaç ürün anlatacağını, görsellerin nereye ve hangi boyutta geleceğini konuya göre
SEN belirle. İyi bir yazı için ne gerekiyorsa onu yap.

SADECE geçerli JSON döndür — açıklama, markdown çiti, selamlama YOK:
{
  "category": "<kategori anahtarı: smartphones|tablets|laptops|headphones|monitors|tvs|smartwatches|gaming_consoles|robot_vacuums|... yoksa boş>",
  "template": "<yazının TÜRÜ: topn|review|vs|guide|howto|faq|deals|alt|news>",
  "lang": { "title": "", "slug": "", "lead": "", "body_html": "", "conclusion_html": "", "metaTitle": "", "metaDescription": "", "tags": "" },
  "items": [
    { "kind": "product|subscription|service",
      "search": "<YALNIZ kind=product: sade katalog adı, marka + model, fiyat/ek İÇERMEZ>",
      "name": "<yazıda görünen başlık>",
      "brand": "<marka adı>",
      "site": "<markanın resmî alan adı, emin değilsen boş>",
      "blocks": [
        { "type": "text", "style": "paragraph",
          "text": "<BU ÖĞENİN TAM METNİ — EN AZ 170 KELİME, 3 paragraf. 1) ne olduğu ve kime hitap ettiği, 2) ölçülebilir farkı: en az üç somut sayı (mAh, nit, Hz, GB, saat, USD), 3) neye dikkat etmeli / kime UYGUN DEĞİL. Düz metin, HTML yok; kalın için **yıldız**, madde için satır başına '- '.>" },
        { "type": "image", "pos": "left|right|full|center", "size": "s|m|l", "cap_tr": "", "cap_en": "" }
      ] }
  ]
}

GÖRSELLER
- Ürün görselleri KATALOGDAN gelir; sen URL YAZMA, "url" alanını boş bırak ya da hiç koyma.
  Sistem her ürünün görselini kendisi bulup senin işaretlediğin yere yerleştirir.
- Görsel bloğunu METNE GÖRE konumlandır: uzun anlatımın yanına "right"/"left" (size "s"/"m"),
  bir ürünü öne çıkarıyorsan "full"/"center" (size "l"). Her öğeye en fazla 1-2 görsel.
- "cap_tr"/"cap_en": görselin altına düşecek tek satırlık açıklama — ürün adını tekrarlama,
  görselde NE GÖRÜLDÜĞÜNÜ ya da neden önemli olduğunu yaz.

METİN
- body_html ürün bölümlerinden ÖNCEKİ giriş/genel yazı; conclusion_html ürünlerden SONRAKİ sonuç.
- body_html/conclusion_html GEÇERLİ HTML: <h2>/<h3>, <p>, <ul><li>, <strong>, <table>.
- items[].blocks metinleri DÜZ METİN — hiçbir HTML etiketi koyma. Kalın için **yıldız**,
  madde için satır başına "- ", ara başlık için "## ".
- Metin ÇEVİRİ KOKMAMALI; hedef dilde doğal, o dilde yazılmış gibi olsun.

UZUNLUK — BURAYA DİKKAT, EN SIK YAPILAN HATA BU
- TOPLAM 1400-2200 kelime. Bu toplam ŞUNLARIN HEPSİNİ kapsar:
  body_html + conclusion_html + items[] içindeki BÜTÜN blok metinleri.
- Bütçe şöyle dağılır ve HER BİRİ ayrı ayrı tutturulmalıdır:
    body_html          en az 250 kelime  (konuyu kur, karar kriterini söyle)
    her bir öğe metni  en az 170 kelime  (öğe sayısı × 170 = ana gövde)
    conclusion_html    en az 200 kelime  + SSS bölümü
  Örnek: 5 öğeli bir yazıda 250 + 5×170 + 200 = 1300 kelime taban demektir.
- ASIL METİN ÖĞELERİN İÇİNDEDİR. En sık yaptığın hata öğelere iki-üç cümlelik
  metin yazmak; bu yazıyı "ince içerik" yapıyor ve sayfa değersizleşiyor.
- Uzunluğu doldurma cümlesiyle değil, DAHA FAZLA SOMUT BİLGİYLE karşıla:
  sayı, ölçüm, karşılaştırma, kime uygun değil.
- SON KONTROL: JSON'u göndermeden önce her öğenin metnini kelime kelime say.
  170'in altında kalan varsa GERİ DÖN ve o öğeyi genişlet.

SEO — SİTENİN KURALLARI
- metaTitle 60, metaDescription 155 KARAKTERİ AŞMASIN. Yazmadan önce karakter say.
- Yazıda TAM OLARAK BİR H1 yok; başlık ayrı alanda duruyor, gövde <h2> ile başlar.
- SSS BÖLÜMÜ ZORUNLU: conclusion_html'in içine ya da body_html'in sonuna, soru işaretiyle
  BİTEN <h2> başlıkları ve altlarında 2-4 cümlelik cevaplar olacak şekilde EN AZ 3 soru koy.
  Site bu başlıkları okuyup FAQPage yapısal verisini otomatik üretiyor; soru işareti yoksa
  o veri hiç oluşmaz. Sorular gerçekten sorulan sorular olsun, doldurma değil.
- Anahtar kelimeyi başlıkta, ilk paragrafta ve en az bir <h2>'de geçir; doldurma yapma.

ÖĞELER KONUYA AİT OLMAK ZORUNDA
- "items" listesine YALNIZCA yazının gerçekten ele aldığı ürünleri koy. Başlık
  bir ürün hakkındaysa, başka bir ürüne bölüm açma.
  Ölçüldü: "Apple'ın 9 Eylül etkinliğinden neler beklenmeli?" başlıklı yazıya
  model "iPhone 17 Pro" bölümü eklemişti — okuyucunun sorduğu soruyla ilgisiz.
- Konu henüz ÇIKMAMIŞ bir ürünse (beklenti, sızıntı, etkinlik önizlemesi),
  "items" BOŞ olabilir ve olmalıdır da: var olmayan bir ürünün kartını açmak
  okuyucuya satın alınabilir bir şey varmış izlenimi verir.
- Karşılaştırma amaçlı bir önceki nesle DEĞİNMEK serbest — ama gövde metninde,
  ayrı bir ürün öğesi olarak DEĞİL.

GÖRSELLER — URL YAZMA
- "url" alanını HER ZAMAN boş bırak. Ürün görselleri katalogdan gelir; senin
  bulduğun adresler ya kırık ya da marka logosu oluyor. Sen yalnızca görselin
  NEREYE ve HANGİ BOYUTTA geleceğini söyle.

DÜRÜSTLÜK
- Fiyat, tarih, "şu anda satışta" gibi iddiaları YALNIZCA araştırma notlarında varsa yaz.
- Emin olmadığın sayıyı yazma; "yaklaşık", "araştırma sırasında" gibi ifadelerle çerçevele.
- Reklam dili yok: "muhteşem", "inanılmaz", "kaçırmayın" yasak. Sayı ver, hüküm ver.`;
  }

  function komutPrompt(komut, mevcut) {
    mevcut = mevcut || {};
    return `${KONSEPT}

Aşağıda yayına hazırlanan bir blog yazısının MEVCUT hâli var. Kullanıcı bir DEĞİŞİKLİK istiyor.

KULLANICININ İSTEĞİ:
${komut}

MEVCUT YAZI (JSON):
${JSON.stringify(mevcut).slice(0, 120000)}

SADECE geçerli JSON döndür. YALNIZCA DEĞİŞTİRDİĞİN ALANLARI koy — dokunmadığın alanı
hiç yazma, çünkü yazmadığın alan olduğu gibi korunur:
{
  "langs": { "tr": { "title": "", "lead": "", "body_html": "", "conclusion_html": "", "metaTitle": "", "metaDescription": "" }, "en": { ... } },
  "items": [
    { "op": "remove",  "i": <öğe indeksi> },
    { "op": "reorder", "order": [<yeni sıradaki eski indeksler>] },
    { "op": "rewrite", "i": <indeks>, "tr": "<yeni düz metin>", "en": "<yeni düz metin>" },
    { "op": "add", "kind": "product|subscription|service", "search": "<sade katalog adı>",
      "name": "<görünen ad>", "tr": "<düz metin>", "en": "<düz metin>" }
  ],
  "note": "<ne yaptığını tek cümlede özetle>"
}

KURALLAR:
- İstek tek bir dili anıyorsa yalnız o dili değiştir; ikisini de anıyorsa ikisini birden.
- body_html/conclusion_html GEÇERLİ HTML olmalı (<h2>, <p>, <ul><li>, <strong>, <table>).
- metaTitle 60, metaDescription 155 karakteri AŞMASIN.
- SSS başlıkları soru işaretiyle BİTMELİ; site FAQPage verisini oradan üretiyor.
- İstenmeyen hiçbir şeyi değiştirme. "Girişi kısalt" dendiyse sonucu ELLEME.
- ÖĞELERE DOKUNABİLİRSİN — ama yalnızca İŞLEMİ söyleyerek; uygulamayı kod yapar ve
  eklenen öğe KATALOG KAPISINDAN geçer, yani var olmayan ürün yazıya giremez.
  "3. ürünü çıkar" denirse indeks 0 tabanlıdır → {"op":"remove","i":2}.
  "add" ile eklediğin öğe katalogda yoksa özel öğe olur; ürün UYDURMA, emin
  değilsen "kind":"service" yaz. Öğe metinleri DÜZ METİN (HTML etiketi yok).
  Kullanıcı öğelerden söz etmediyse "items" alanını HİÇ yazma.`;
  }

  function qaPrompt(outline) {
    outline = outline || {};
    return `Sen bir yayın editörü ve sayfa tasarımcısısın. Aşağıda bir blog makalesinin yapısı JSON olarak veriliyor (dil: ${outline.lang}).

GÖREVİN ÜÇ PARÇA:

A) ŞABLON: Makalenin TÜRÜNÜ içeriğe bakarak belirle — "template" alanına yaz:
   topn (en iyi N listesi) | review (tek ürün incelemesi) | vs (karşılaştırma) | guide (satın alma rehberi) |
   howto (adım adım) | faq (soru-cevap) | deals (fırsat) | alt (alternatifler) | news (haber/duyuru).
   Verilen "template" değeri içerikle uyuşmuyorsa DÜZELT.

B) GÖRSEL YERLEŞİMİ: Her öğe için görselin nereye ve ne büyüklükte konacağına METNİN UZUNLUĞUNA, ritmine ve ŞABLONA bakarak karar ver.
   - "pos": "left" | "right" | "center" | "full"
   - "size": "s" | "m" | "l" | "xl"
   - Kurallar: Kısa metinde (<400 karakter) yana sarma kötü durur → "center" veya "full" tercih et. Uzun metinde (>600 karakter) yana sarma iyidir → "left"/"right". ARDIŞIK öğelerde aynı tarafı tekrarlama, sağ-sol dönüşümlü bir ritim kur. Listenin ilk öğesi öne çıksın (daha büyük). Öğe metni çok kısaysa görseli küçült.
   - ŞABLONA GÖRE: topn'de sıralı ritim (ilk öğe büyük); vs'de iki taraf SİMETRİK (aynı size, biri left biri right); review'da tek öğe "full"/"center"; guide/faq'ta görseller küçük kalsın, metin öne çıksın.
   - Öğe "custom/service" ise görseli genelde bir LOGO'dur: logolar büyük basılmaz → "s" veya "m", tercihen "left"/"right".

C) KALİTE DENETİMİ: Yayın öncesi gerçek sorunları bul. Uydurma sorun YAZMA; sorun yoksa boş dizi dön. Her sorun: {"level":"error"|"warn"|"info","text":"<tek cümle, Türkçe, ne yapılacağını söyle>"}
   Bakılacaklar: giriş yazısı var mı ve konuyu kuruyor mu; öğe metinleri arasında ciddi uzunluk dengesizliği; anlam bütünlüğü (giriş listede vaat edileni tutuyor mu, sonuç öğelerle çelişiyor mu); başıboş kalmış kaynak adı/atıf artığı satırlar; tekrar eden kalıp cümleler; sonuç yazısı eksik mi; başlık ile içerik uyumsuzluğu; bir öğe yazının KONUSUYLA ALAKASIZ mı (yanlış eşleşmiş ürün).
   Görsel/kapak eksikliğini YAZMA — onu kod zaten otomatik tamamlıyor, iki kez raporlanıyor.

SADECE şu JSON'u döndür:
{"template":"...","layout":[{"i":<öğe indeksi>,"pos":"...","size":"...","why":"<çok kısa gerekçe>"}],"issues":[{"level":"...","text":"..."}],"verdict":"<tek cümle genel değerlendirme>"}

MAKALE YAPISI:
${JSON.stringify(outline)}`;
  }

  function junkPrompt(cands) {
    cands = cands || [];
    return `Aşağıdaki liste, bir teknoloji blog yazısında TEK BAŞINA satır olarak duran kısa metinlerdir. Bir kısmı, yazı kopyalanırken kaynak bağlantılarından arta kalan YAYIN/SİTE/İNCELEME KANALI ADLARIDIR ve yazıya ait değildir; bir kısmı ise gerçek içeriktir (ara başlık, ürün adı, teknik terim).

HER SATIRI TEK TEK sınıflandır. Atlama, hepsi için karar ver.

SADECE şu JSON: {"junk":["<yayın/kaynak adı olanlar>"],"keep":["<gerçek içerik olanlar>"]}

SATIRLAR:
${JSON.stringify(cands)}`;
  }

  function ceviriPrompt(payload, dst) {
    payload = payload || {};
    return `Sen teknoloji sitesi Qor AI için profesyonel bir çevirmensin. Aşağıdaki JSON'daki TÜM metinleri ${LANG_NAME[dst] || dst} diline çevir.

KESİN KURALLAR:
- Çıktı SADECE geçerli JSON olsun; girdiyle BİREBİR aynı yapı ve aynı anahtarlar (items dizisindeki "i" ve "j" sayıları AYNEN korunacak).
- HTML etiketlerini (<p>, <h2>, <ul>, <li>, <strong>, <table>, <a href="...">…) AYNEN koru; sadece etiketler ARASINDAKİ metni çevir.
- Markdown işaretlerini koru: **kalın**, satır başındaki "- " maddeleri, "## " başlıkları, satır sonları.
- Ürün/marka/model adlarını, teknik birimleri (mAh, GB, Hz, nit) ve sayıları ÇEVİRME.
- Doğal ve akıcı yaz — kelimesi kelimesine değil, hedef dilde bir editörün yazacağı gibi.
- metaTitle 60 karakteri, metaDescription 155 karakteri AŞMASIN.
- Boş gelen alanları boş bırak.

ÇEVRİLECEK JSON:
${JSON.stringify(payload)}`;
  }

  function claudePrompt(kategoriler) {
    var cats = (kategoriler && kategoriler.length) ? kategoriler.join(', ')
      : 'smartphones, laptops, tablets, headphones, monitors, tvs, smartwatches, gaming_consoles, robot_vacuums';
    return `Sen Qor AI (qorai.net) için blog makalesi yazan bir editörsün. Konu: [KONU]

GÖREV: Bu konuda 2 dilde (Türkçe, İngilizce) eksiksiz bir makale yaz ve SADECE aşağıdaki şemaya uyan geçerli bir JSON döndür. JSON dışında hiçbir şey yazma (açıklama, markdown çiti, selamlama yok).

ŞEMA:
{
  "category": "<şunlardan biri: ${cats}>",
  "langs": {
    "tr": {
      "title": "<çekici başlık, yıl içerebilir>",
      "slug": "<url-slug-kucuk-harf-tireli>",
      "lead": "<özet, 120-160 karakter>",
      "body_md": "<GİRİŞ bölümü markdown: neden bu liste/konu, nasıl seçildi. 150-300 kelime. ## alt başlıklar, **kalın**, - maddeler, | tablolar | desteklenir. Ürün anlatımlarını BURAYA YAZMA — ürünler items'ta>",
      "conclusion_md": "<SONUÇ bölümü markdown: özet + öneri, 80-150 kelime>",
      "metaTitle": "<SEO başlık — KESİNLİKLE 60 KARAKTERİ AŞMASIN, karakterleri say>",
      "metaDescription": "<SEO açıklama — KESİNLİKLE 155 KARAKTERİ AŞMASIN, karakterleri say>",
      "tags": "<virgülle 4-6 etiket>"
    },
    "en": { <aynı alanlar İngilizce> },
  },
  "items": [
    {
      "kind": "product",
      "search": "<katalog araması için sade model adı, örn: iPhone 15 | Samsung Galaxy S24 | MacBook Air M3>",
      "name": "<görünen ad>",
      "blocks": [
        { "type": "text", "style": "paragraph", "tr": "<ürün anlatımı TR — 80-150 kelime. **kalın** vurgu, '- ' ile artı/eksi maddeleri, '## ' ile ara başlık kullanabilirsin>", "en": "<aynısı EN>" }
      ]
    }
  ]
}

KURALLAR:
- Liste makalesiyse 5-7 ürün; inceleme ise 1 ürün; karşılaştırmaysa 2 ürün.
- "search" alanı KRİTİK: mağaza eki olmadan, jenerik model adı (renk/kapasite yazma).
- Her ürünün bloğunda somut artı/eksi ve kime uygun olduğu olsun; pazarlama dili değil, dürüst değerlendirme.
- Fiyat YAZMA (site canlı fiyatı kendisi gösterir); "yaklaşık", "civarı" gibi fiyat cümleleri kurma.
- 3 dil birbirinin çevirisi olsun ama doğal aksın (kelime kelime çeviri değil).
- body_md içinde bir karşılaştırma tablosu (| Model | Ekran | Pil |…) varsa süper — tablolar destekleniyor.
- metaTitle/metaDescription sınırlarını yazmadan önce karakter say; sınırı aşan metin Google'da kesilir. Ürün adlarını meta başlığa doldurma, kısa ve net tut.
- JSON string'lerinde gerçek satır sonu için \\n kullan.`;
  }

  var AUTO_SCHEMA_PROMPT = `Sen bir içerik dönüştürücüsün. Aşağıdaki HAM METİN bir blog makalesidir; biçimi serbesttir (başlık etiketleri, birden çok dil, markdown, dağınık notlar olabilir).

GÖREVİN: Ham metni AŞAĞIDAKİ JSON ŞEMASINA dönüştür. SADECE geçerli JSON döndür — açıklama, markdown çiti, selamlama YOK.

ŞEMA:
{
  "category": "<varsa uygun kategori anahtarı: smartphones|tablets|laptops|headphones|monitors|tvs|smartwatches|gaming_consoles|robot_vacuums|... yoksa boş>",
  "template": "<yazının TÜRÜ: topn|review|vs|guide|howto|faq|deals|alt|news>",
  "langs": {
    "tr": { "title": "", "slug": "", "lead": "", "body_html": "", "conclusion_html": "", "metaTitle": "", "metaDescription": "", "tags": "" },
    "en": { ... }
  },
  "items": [
    { "kind": "product|subscription|service",
      "search": "<YALNIZ kind=product için: sade model adı: marka + model, FİYAT/ek İÇERMEZ. Diğerlerinde boş>",
      "name": "<yazarın yazdığı görünen başlık, aynen>",
      "brand": "<marka/hizmet adı, sade: Midjourney, OpenAI, Adobe>",
      "site": "<markanın RESMÎ alan adı: midjourney.com — emin değilsen BOŞ>",
      "blocks": [ { "type": "text", "style": "paragraph", "tr": "", "en": "" } ] }
  ]
}

KURALLAR — ÇOK ÖNEMLİ:
0. "kind" ALANI KRİTİK — yanlışı yazının içine alakasız ürün kartı sokar:
   - "product": mağazadan satın alınan FİZİKSEL cihaz (telefon, laptop, kulaklık, TV…). Sadece bunlar katalogda aranır.
   - "subscription": aylık/yıllık ücretli üyelik (ChatGPT Plus, Netflix, NordVPN, Spotify, Google AI Pro).
   - "service": ücretli üyeliğe indirgenemeyen yazılım/araç/platform (Midjourney, Adobe Firefly, Leonardo AI, Figma).
   Bir yazılım/hizmet ASLA "product" olamaz. Emin değilsen "service" yaz — katalogda aranmaz, uydurma eşleşme olmaz.
0b. "template": yazının türünü içeriğe bakarak SEN belirle. "En iyi N …" listesi → topn · tek ürün incelemesi → review ·
   "A vs B" → vs · satın alma rehberi → guide · adım adım anlatım → howto · soru-cevap → faq · indirim/fırsat → deals ·
   "X alternatifleri" → alt · duyuru/haber → news.
1. HİÇBİR CÜMLEYİ ATLAMA, ÖZETLEME, KISALTMA. Metnin tamamı çıktıda yer almalı. Bu bir çeviri/biçimlendirme işidir, yeniden yazma değil.
2. Ham metinde KAÇ DİL varsa o kadarını doldur. Olmayan dili boş obje bırak ({}). Kendin ÇEVİRİ YAPMA.
3. Numaralı ürün/hizmet bölümleri ("1. Apple iPad Pro (M5) — ...", "## 2. NordVPN" gibi) items dizisine gider; o bölümün TÜM metni (paragraflar, Artıları/Eksileri listeleri, "Kime Uygun?" kısmı) o öğenin blocks[0] metnine girer.
   - Aynı ürünün farklı dillerdeki bölümleri AYNI item'ın blocks[0] içinde tr/en olarak eşleşmeli (sıra aynıdır).
   - "search": mağaza/fiyat eki olmadan sade model adı ("Apple iPad Pro (M5)" -> "Apple iPad Pro M5").
   - "name": yazarın yazdığı başlık aynen korunur.
4. Ürün bölümlerinden ÖNCEKİ giriş/genel yazı body_html'e; ürünlerden SONRAKİ sonuç/özet bölümü conclusion_html'e gider.
5. body_html ve conclusion_html GEÇERLİ HTML olsun: <h2>/<h3> başlıklar, <p> paragraflar, <ul><li> listeler, <strong>, <a href="...">bağlantılar</a>, <table> tablolar. Ham metindeki markdown bağlantılarını [Ad](url) -> <a href="url" target="_blank" rel="noopener">Ad</a> yap. Kaynak/atıf bağlantılarını KORU.
6. items içindeki blocks metinleri HTML DEĞİL DÜZ METİNDİR. İçine <a>, <p>, <strong> gibi HİÇBİR ETİKET KOYMA. Kalın için **yıldız**, madde için satır başına "- ", ara başlık için satır başına "## " kullan; satır sonlarını koru. Ürün bölümlerindeki kaynak/atıf bağlantılarını buraya YAZMA, sadece metni al.
7. slug boşsa başlıktan üret (küçük harf, tireli, Türkçe karakterler sadeleştirilmiş).
8. metaTitle 60, metaDescription 155 KARAKTERİ AŞMASIN — aşıyorsa kısalt.
9. KAYNAK ADI ÇÖPÜNÜ AT: Ham metin bir sohbet ekranından kopyalanmış olabilir; bu durumda kaynak bağlantıları düz metne dönüşüp tek başına satır olarak kalır ("MacRumors", "The Gadgeteer", "phonearena", "Tech Advisor", "6 Months Later", "Mark Ellis Reviews", "GSMArena" gibi yayın/site adları). Bunları çıktıya HİÇ ALMA — ne gövdeye ne öğe metinlerine. Gerçek cümleleri ve ara başlıkları ("Artıları:", "Kime Uygun?") aynen koru.

HAM METİN:
`;
  function autoSchemaPrompt(raw) { return AUTO_SCHEMA_PROMPT + String(raw || ''); }

  var ITEM_IMAGE_PROMPT = `Aşağıda bir teknoloji blog yazısındaki öğelerin adları var. Her öğe için MARKANIN/HİZMETİN RESMÎ WEB SİTESİNİN ALAN ADINI ver.

SADECE şu JSON: {"items":[{"i":<verilen indeks>,"brand":"<marka/hizmet adı, sade>","site":"<alan adı, örn: midjourney.com — http/www/yol YOK>","kind":"product|subscription|service"}]}

KURALLAR:
- Alan adından EMİN DEĞİLSEN "site" alanını BOŞ bırak. Uydurma.
- "site" markanın ANA alan adı olsun (ürün sayfası değil): "openai.com", "adobe.com", "leonardo.ai".
- "kind": fiziksel cihaz → product; aylık/yıllık ücretli üyelik → subscription; onun dışındaki yazılım/hizmet → service.

ÖĞELER:
`;
  function markaAlanPrompt(entries) { return ITEM_IMAGE_PROMPT + JSON.stringify(entries || []); }

  /* Öğe işlemlerini DETERMİNİSTİK uygula. Model yalnız İŞLEMİ söyler; silme,
     sıralama ve yeniden yazma burada olur, ekleme ise katalog kapısından
     (ogeleriIceAktar) geçer — böylece uydurma ürün yazıya giremez.
     SIRA ÖNEMLİ: indeksler ÇAĞRI ANINDAKİ diziye göre verildi, o yüzden önce
     rewrite (indeks sabit), sonra remove (büyükten küçüğe), sonra reorder, en
     son add (sona eklenir). */
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
  /* ══ GÖRSEL: AI ARAMAZ ═══════════════════════════════════════════════════
     KURAL 1 (kullanıcının değişmez kuralı): "Görselleri AI BULMASIN. boktan
     görseller buluyor." Ürün görseli KATALOGDAN gelir (gerçek ürün fotoğrafı);
     katalogda yoksa görsel BOŞ kalır ve yazar elle koyar.

     Buradaki eski kod son kalan AI görsel yoluydu: Gemini'ye markanın alan
     adını sorup Google favicon / DuckDuckGo ikonu çekiyordu. Abonelik
     satırında makul görünüyordu ama ölçüldü (2026-09-04, canlı taslak):
     katalogda bulunamayan "iPhone 18 Pro" ÖZEL ÖĞE olarak eklendi, model
     site olarak apple.com verdi ve öğenin görseli APPLE LOGOSU oldu.
     Kullanıcının kararı: "ben görselleri ekleyebilirim, ai blog yazısında
     görsel bulmasına gerek yok". Yol tamamen kaldırıldı.

     KALAN GÖRSEL KAYNAKLARI — üçü de sitenin KENDİ verisi, arama değil:
       · katalog ürünü      → Typesense `imageUrl`
       · abonelik kaydı     → `subscriptions.logo` (elle küratörlü)
       · yazarın elle koyduğu URL / yüklediği dosya
     Bu fonksiyon artık AĞA ÇIKMAZ: yalnızca hangi öğelerin görselsiz kaldığını
     SAYAR, böylece konsol ve denetim "şu öğeye elle görsel koy" diyebilir. */
  function domainOf(value) {
    var d = String(value || '').trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '');
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : '';
  }

  function gorselsizOgeler(products) {
    return (products || []).map(function (p, i) { return { i: i, p: p }; })
      .filter(function (x) { return !C.itemHasImage(x.p); });
  }

  // İmza `resolveItemImages` ile aynı kaldı (çağıranlar değişmesin) ama artık
  // HİÇBİR ŞEY DOLDURMAZ — yalnız rapor eder.
  function resolveItemImages(products, lang, onStatus) {
    var eksik = gorselsizOgeler(products);
    if (typeof onStatus === 'function') {
      onStatus(eksik.length
        ? (eksik.length + ' öğede görsel yok — katalogdan gelmedi, elle koyman gerekiyor')
        : 'Tüm öğelerin görseli katalogdan geldi.');
    }
    return Promise.resolve({ filled: 0, pending: eksik.length, eksik: eksik });
  }


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
    ceviriPrompt: ceviriPrompt,
    // saf uygulayıcılar
    ogeIslemleriniUygula: ogeIslemleriniUygula,
    // taşıma + ağ
    callGeminiJson: callGeminiJson, grounded: grounded,
    resolveCatalogItem: resolveCatalogItem, ogeleriIceAktar: ogeleriIceAktar,
    resolveItemImages: resolveItemImages, gorselsizOgeler: gorselsizOgeler,
    autoPickCover: autoPickCover, domainOf: domainOf,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
