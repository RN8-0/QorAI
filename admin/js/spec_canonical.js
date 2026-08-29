(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.QorAiSpecCanonical = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  // 20260829: eslestirici duzeltildi (ters substring -> tam kelime + en uzun
  // eslesme, kategori/birim kapisi). Surum ilerletildi ki `canonicalSpecsVersion`
  // alanina bakan her yer kayitlarin YENIDEN kanoniklestirilmesi gerektigini
  // gorsun -- eski surumle yazilmis kayitlar "Battery capacity: 512 GB" gibi
  // yanlis anahtarlar tasiyor.
  const VERSION = '20260829-spec-canonical-epey';

  function norm(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/ı/g, 'i').replace(/İ/g, 'i')
      .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o')
      .replace(/ş/g, 's').replace(/ü/g, 'u')
      .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
      .replace(/[()]/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const SECTION_RULES = [
    ['Display', ['display', 'screen', 'ekran', 'monitor', 'anzeige', 'bildschirm', 'diagonale', 'auflosung']],
    ['Battery', ['battery', 'batarya', 'pil', 'akku', 'akkulaufzeit', 'akkukapazitat', 'charging', 'charge', 'laden', 'schnellladen', 'sarj']],
    ['Camera', ['camera', 'kamera', 'photo', 'foto', 'video', 'kamera hinten', 'kamera vorne', 'hauptkamera', 'frontkamera']],
    ['Performance', ['processor', 'cpu', 'prozessor', 'islemci', 'chipset', 'yonga', 'gpu', 'graphics', 'grafik', 'leistung', 'performance', 'donanim']],
    ['Memory and storage', ['memory', 'ram', 'arbeitsspeicher', 'bellek', 'storage', 'speicher', 'speicherplatz', 'depolama', 'ssd', 'hdd', 'disk']],
    ['Connectivity', ['wi fi', 'wifi', 'wlan', 'bluetooth', 'network', 'netzwerk', 'anschluss', 'anschlusse', 'ag', 'baglanti', 'connectivity', 'usb', 'nfc', 'sim', '5g', '4g']],
    ['Design', ['design', 'tasarim', 'body', 'gehaeuse', 'gehause', 'dimensions', 'dimension', 'abmessungen', 'masse', 'maße', 'boyut', 'weight', 'gewicht', 'agirlik', 'thickness', 'dicke', 'kalinlik']],
    ['Audio', ['audio', 'sound', 'speaker', 'lautsprecher', 'ses', 'hoparlor']],
    ['Software', ['software', 'operating system', 'betriebssystem', 'isletim', 'os', 'windows', 'android', 'ios', 'macos']],
    ['Sensors', ['sensor', 'sensoren', 'sensorler', 'fingerprint', 'fingerabdruck', 'parmak izi', 'gps', 'gyro', 'gyroscope']],
    ['General', ['general', 'allgemein', 'genel', 'basic', 'temel', 'highlights', 'one cikan']],
  ];

  const KEY_RULES = [
    ['Battery capacity', ['battery capacity', 'battery capacity typical', 'battery capacity mah', 'capacity mah', 'batarya kapasitesi', 'pil kapasitesi', 'akkukapazitat', 'akku kapazitat', 'batteriekapazitat']],
    ['Battery cycle life', ['battery endurance in cycles', 'battery cycle count', 'battery cycles', 'ladezyklen', 'akkuzyklen', 'sarj dongusu']],
    ['Charging port', ['charging port', 'charge connector', 'usb connection type', 'usb connector type', 'usb type', 'ladeanschluss', 'anschluss laden', 'usb baglanti tipi']],
    ['Fast charging', ['fast charging', 'fast charge', 'schnellladen', 'schnellladung', 'hizli sarj', 'quick charge']],
    ['Fast charging features', ['fast charging features', 'fast charge features', 'schnellladefunktionen', 'hizli sarj ozellikleri']],
    ['Fast charging power', ['fast charging power max', 'fast charging power', 'charging power', 'ladeleistung', 'max ladeleistung', 'hizli sarj gucu']],
    ['Wireless charging', ['wireless charging', 'kabelloses laden', 'induktives laden', 'kablosuz sarj']],
    ['Removable battery', ['removable battery', 'wechselbarer akku', 'austauschbarer akku', 'degisir batarya', 'removeable battery']],
    ['Video playback', ['video playback', 'videowiedergabe', 'video oynatma']],

    ['Screen size', ['screen size', 'display size', 'display diagonal', 'screen diagonal', 'bildschirmgroesse', 'bildschirmgrosse', 'bildschirmdiagonale', 'displaygroesse', 'displaygrosse', 'diagonale', 'zoll', 'ekran boyutu', 'ekran boyutu inc']],
    ['Resolution', ['resolution', 'display resolution', 'screen resolution', 'auflosung', 'bildschirmauflosung', 'displayauflosung', 'ekran cozunurlugu', 'cozunurluk']],
    ['Panel type', ['panel type', 'display type', 'screen technology', 'display technology', 'paneltyp', 'display typ', 'bildschirmtechnologie', 'ekran teknolojisi', 'ekran tipi']],
    ['Refresh rate', ['refresh rate', 'screen refresh rate', 'display refresh rate', 'bildwiederholrate', 'bildwiederholfrequenz', 'aktualisierungsrate', 'yenileme hizi']],
    ['Pixel density', ['pixel density', 'pixeldichte', 'ppi', 'piksel yogunlugu']],
    ['Brightness', ['brightness', 'screen brightness', 'helligkeit', 'bildschirmhelligkeit', 'displayhelligkeit', 'parlaklik']],
    ['HDR', ['hdr', 'hdr support', 'hdr destegi']],

    ['Processor', ['processor', 'processor model', 'cpu', 'cpu model', 'prozessor', 'prozessormodell', 'islemci', 'islemci modeli', 'ana islemci']],
    ['Processor family', ['processor family', 'cpu family', 'prozessorfamilie', 'cpu familie', 'islemci ailesi']],
    ['CPU cores', ['processor cores', 'cpu cores', 'core count', 'number of cores', 'kerne', 'cpu kerne', 'anzahl kerne', 'cekirdek sayisi', 'cpu cekirdegi']],
    ['CPU frequency', ['processor frequency', 'cpu frequency', 'base frequency', 'taktfrequenz', 'prozessortakt', 'cpu takt', 'islemci frekansi']],
    ['Chipset', ['chipset', 'soc', 'yonga seti']],
    ['GPU', ['gpu', 'graphics processor', 'graphics card', 'gpu model', 'grafik islemcisi gpu', 'ekran karti']],
    // "Graphics Processor (GPU)" ile "Graphics Processor (GPU) Frequency"
    // ikisi de 'GPU'ya dusuyordu; model adi ile frekans tek satirda birlesiyordu.
    ['GPU frequency', ['gpu frequency', 'graphics processor gpu frequency', 'gpu clock', 'gpu takt', 'gpu frekansi', 'grafik islemci frekansi']],

    ['RAM', ['ram', 'memory ram', 'internal memory', 'arbeitsspeicher', 'hauptspeicher', 'bellek ram', 'memory capacity', 'bellek kapasitesi']],
    ['RAM type', ['ram type', 'memory type', 'internal memory type', 'speichertyp ram', 'bellek tipi']],
    ['Storage', ['storage', 'internal storage', 'total storage capacity', 'interner speicher', 'speicherplatz', 'gesamtspeicher', 'flash speicher', 'ssd', 'ssd size', 'sabit disk ssd boyutu', 'dahili hafiza', 'depolama']],
    // 'depolama teknolojisi' BURAYA ait, 'depolama' (Storage) kuraline degil:
    // degeri kapasite degil TEKNOLOJI ("NAND", "3D NAND"). Eski bulanik
    // esleme onu 'Storage' yapiyordu ve bir SSD'nin kapasitesiyle ayni
    // slotta carpisiyordu (olculdu: keySpecs {"Storage":"NAND"}).
    ['Storage type', ['storage media', 'storage type', 'disk type', 'speicherart', 'depolama tipi', 'depolama teknolojisi', 'storage technology', 'nand yongasi', 'nand type', 'nand tipi']],
    // ON BELLEK (cache) RAM DEGILDIR. 'bellek tipi' takma adi "on bellek
    // tipi" icinde de gectigi icin SSD'nin SLC on bellegi 'RAM type' olarak
    // kaydediliyordu; en-uzun-eslesme sayesinde artik bu kural kazanir.
    ['Cache type', ['cache type', 'cache memory type', 'on bellek tipi', 'onbellek tipi', 'on bellek turu', 'onbellek turu']],
    // L1/L2/L3 AYRI ANAHTARLAR OLMAK ZORUNDA. Uculu de yalin 'Cache'e
    // duserse mergeValue onlari tek satirda birlestiriyor
    // ("7.5 MB / 96 MB / 384 MB") ve hangi seviyenin hangisi oldugu
    // KAYBOLUYOR (ilk denemede olculdu: 179 CPU kaydi). En-uzun-eslesme
    // sayesinde bu kurallar yalin 'onbellek'i yener.
    ['L1 cache', ['l1 cache', 'onbellek l1', 'on bellek l1', 'cache l1', 'l1 onbellek']],
    ['L2 cache', ['l2 cache', 'onbellek l2', 'on bellek l2', 'cache l2', 'l2 onbellek']],
    ['L3 cache', ['l3 cache', 'onbellek l3', 'on bellek l3', 'cache l3', 'l3 onbellek']],
    // "On Bellek: Var" (VARLIK) ile "On Bellek Kapasitesi: 8 GB" (BOYUT) ayni
    // anahtara dusmemeli; dustuklerinde mergeValue "Var / 8 GB" diye tek
    // satirda birlestiriyordu (olculdu: 37 SSD).
    ['Cache size', ['cache size', 'cache capacity', 'on bellek kapasitesi', 'onbellek kapasitesi']],
    ['Cache', ['cache', 'cache memory', 'on bellek', 'onbellek']],
    // Yalin "Kapasite": KATEGORI + DEGERIN BIRIMI ile cozulur (kapasiteCoz).
    // Once bu kural YOKTU; yalin "Kapasite" hicbir kurala tam eslesmiyor ve
    // 'batarya kapasitesi' takma adinin ICINDE gectigi icin 'Battery
    // capacity'ye dusuyordu.
    ['Capacity', ['capacity', 'kapasite', 'kapasitesi', 'kapazitat']],

    ['Main camera', ['main camera', 'main camera resolution', 'rear camera', 'camera resolution', 'kamera hinten', 'ruckkamera', 'rueckkamera', 'hauptkamera', 'arka kamera', 'ana kamera']],
    ['Front camera', ['front camera', 'front camera resolution', 'selfie camera', 'kamera vorne', 'frontkamera', 'selfie kamera', 'on kamera']],
    ['Camera aperture', ['aperture', 'main camera aperture', 'blende', 'diyafram acikligi']],
    ['Video recording', ['video recording', 'video resolution', 'videoaufnahme', 'videoaufzeichnung', 'video kayit']],

    ['Wi-Fi', ['wi fi', 'wi fi standards', 'wifi', 'wireless', 'wlan', 'kablosuz baglanti']],
    ['Bluetooth', ['bluetooth', 'bluetooth version']],
    ['NFC', ['nfc']],
    ['5G', ['5g', '5g support', '5g destegi']],
    ['4G', ['4g', 'lte', '4g lte', '4 5g', '4 5g destegi']],
    ['SIM', ['sim', 'sim type', 'sim card type', 'line count', 'hat sayisi']],
    ['USB', ['usb', 'usb version', 'usb versiyonu']],

    ['Operating system', ['operating system', 'os', 'betriebssystem', 'isletim sistemi', 'software']],
    ['Weight', ['weight', 'gewicht', 'agirlik']],
    ['Dimensions', ['dimensions', 'dimension', 'abmessungen', 'masse', 'maße', 'boyutlar', 'olculer']],
    ['Thickness', ['thickness', 'dicke', 'tiefe', 'kalinlik']],
    ['Width', ['width', 'breite', 'en']],
    ['Height', ['height', 'hohe', 'höhe', 'boy', 'length']],
    ['Water resistance', ['water resistance', 'waterproof', 'wasserdicht', 'schutzart', 'ip zertifizierung', 'suya dayaniklilik']],
    ['Color', ['color', 'colour', 'farbe', 'color options', 'renk', 'renk secenekleri']],
    ['Sensors', ['sensors', 'sensoren', 'sensorler']],
    ['Speakers', ['speakers', 'speaker features', 'lautsprecher', 'hoparlor', 'hoparlor ozellikleri']],
    ['Microphone', ['microphone', 'mikrofon']],
  ];

  const exactKeyMap = new Map();
  for (const [canonical, aliases] of KEY_RULES) {
    for (const alias of aliases) exactKeyMap.set(norm(alias), canonical);
  }

  // BULANIK ESLESME: TAM KELIME + EN UZUN TAKMA AD.
  //
  // Eskiden her takma ad icin su deneniyordu:
  //     a.length > 3 && (k === a || k.includes(a) || a.includes(k))
  //
  // Ucuncu kosul YONU TERS CEVIRIYOR: kisa bir anahtar, UZUN bir takma adin
  // ICINDE gectigi icin esleseiyordu. KEY_RULES'un ILK kurali
  // 'Battery capacity' oldugundan sonuc su oldu (olculdu 2026-08-29):
  //     canonicalKey('Kapasite') -> 'Battery capacity'
  //       cunku norm('batarya kapasitesi').includes('kapasite')
  // Yani "Kapasite" yazan HER Epey etiketi -- SSD, RAM, powerbank, flash
  // bellek farketmeksizin -- PIL KAPASITESI olarak kaydedildi. Canli kanit
  // (Acer FA100 SSD, PB kaydi): keySpecs = {"Battery capacity": "512 GB"},
  // ve urun sayfasindaki varyant karti bu yuzden "512 GB / Pil" yaziyordu.
  // Ayni sinif hata daha once kategori cozumlemesinde de vardi
  // (`entry.key.contains(cat)` yuzunden "gaming" -> 'consoles').
  //
  // Ikinci kosul (`k.includes(a)`) de HARF bazliydi, kelime ortasindan
  // gecebiliyordu. Artik esleme KELIME SINIRINDA aranir.
  //
  // Ve artik KEY_RULES sirasi degil EN UZUN (= en ozgul) takma ad kazanir:
  // "depolama teknolojisi" icin 'depolama' (Storage) yerine
  // 'depolama teknolojisi' (Storage type) secilir.
  // YALNIZ-TAM-ESLESME TAKMA ADLARI. "kapasite" Turkce'de her seyin sonuna
  // gelen bir kelime: "ADF Kapasitesi" (yazici tepsisi, 50 sayfa),
  // "Isi Yayma Kapasitesi (TDP)" (55 W), "Veri Tasima Kapasitesi" (256 QAM).
  // Bunlarin hicbiri depolama ya da batarya degil. Bu takma adlar bulanik
  // esleseye girerse o etiketlerin hepsi 'Capacity'ye dusuyor ve anlamlarini
  // KAYBEDIYOR (ilk denemede olculdu: 171 urun boyle bozuldu). Bu yuzden
  // yalniz anahtarin TAMAMI bunlardan biriyse eslesirler -- o durumda da
  // kategori/birim kapisi neyin kapasitesi oldugunu belirler.
  const FUZZY_HARIC = new Set(['capacity', 'kapasite', 'kapasitesi', 'kapazitat']);
  const FUZZY_ALIASES = [];
  for (const [canonical, aliases] of KEY_RULES) {
    for (const alias of aliases) {
      const a = norm(alias);
      // 3 harften kisa takma ad bulanik eslesmeye GIRMEZ ('en' -> Width gibi
      // kazalar boyle onlenir); tam eslesmeyi exactKeyMap zaten yakaliyor.
      if (a.length > 3 && !FUZZY_HARIC.has(a)) FUZZY_ALIASES.push({ canonical, a });
    }
  }
  // Kararli siralama: esit uzunlukta KEY_RULES sirasi korunur.
  FUZZY_ALIASES.sort((x, y) => y.a.length - x.a.length);

  // Kelime siniri: normalize edilmis metin bosluklarla ayrilmis jetonlardan
  // olusur, bu yuzden iki tarafi bosluga sarmak yeterli.
  function kelimeIceriyor(hay, needle) {
    return ` ${hay} `.includes(` ${needle} `);
  }

  // "KAPASITE" NEYIN KAPASITESI? KATEGORI + BIRIM KARAR VERIR.
  // Telefonda mAh, SSD'de GB, RAM cubugunda yine GB ama anlami RAM. Anahtarin
  // kendisi ayirt etmiyor; etiketten anlam cikarmaya calismak bizi tam da bu
  // hataya dusurdu. Kategori ve birim ise deterministik.
  // Kapi YALNIZ kapasite ailesindeki anahtarlara uygulanir.
  const CAPACITY_BY_CATEGORY = {
    ssd: 'Storage', ssds: 'Storage', storage: 'Storage', hdd: 'Storage',
    flash_drives: 'Storage', memory_cards: 'Storage',
    ram: 'RAM',
    powerbanks: 'Battery capacity', chargers: 'Battery capacity',
  };
  function kapasiteCoz(canonical, value, category) {
    if (canonical !== 'Battery capacity' && canonical !== 'Capacity') return canonical;
    const v = String(value == null ? '' : value);
    // Birim NET ise son sozu birim soyler -- kategori tablosu eksik olabilir
    // ama "5000 mAh" her kategoride bataryadir.
    if (/\d[\d.,]*\s*(mah|wh|whr)\b/i.test(v)) return 'Battery capacity';
    const kat = CAPACITY_BY_CATEGORY[norm(category).replace(/ /g, '_')];
    if (/\d[\d.,]*\s*[gtmp]b\b/i.test(v)) return kat === 'RAM' ? 'RAM' : 'Storage';
    if (kat) return kat;
    return canonical;
  }

  function titleCase(raw) {
    const s = String(raw || '').replace(/:$/, '').replace(/\s+/g, ' ').trim();
    return s || 'Specification';
  }

  function canonicalSection(section, key) {
    const hay = `${norm(section)} ${norm(key)}`.trim();
    for (const [canonical, needles] of SECTION_RULES) {
      if (needles.some(n => hay.includes(n))) return canonical;
    }
    return titleCase(section) || 'General';
  }

  // `category` OPSIYONEL ve GERIYE UYUMLU: yalniz kapasite ailesini
  // cozerken kullanilir, verilmezse birim tek basina karar verir.
  // "Storage" ANAHTARI KAPASITE TASIR, TEKNOLOJI DEGIL.
  // Katalogun bir kismi ZATEN bozuk kanonik bicimde duruyor:
  //   {"Battery capacity": "512 GB", "Storage": "NAND"}
  // Kaynak etiket ("Kapasite" / "Depolama Teknolojisi") onceki
  // kanoniklestirmede silindigi icin ANAHTARDAN geri getirilemez -- ama
  // DEGERDEN getirilebilir: "NAND" bir kapasite degildir. Bu kapi olmadan
  // ikisi de 'Storage'a dusup "512 GB / NAND" diye birlesiyordu
  // (olculdu: 60 SSD + 60 flash bellek).
  const DEPOLAMA_TEKNOLOJISI = /^(3d[\s-]*)?(nand|tlc|mlc|slc|qlc|emmc|ufs|nvme|v[\s-]*nand|flash)\b/i;
  function depolamaTuruMu(canonical, value) {
    if (canonical !== 'Storage') return canonical;
    const v = String(value == null ? '' : value).trim();
    if (/\d[\d.,]*\s*[gtmp]b\b/i.test(v)) return 'Storage';
    return DEPOLAMA_TEKNOLOJISI.test(v) ? 'Storage type' : canonical;
  }

  function canonicalKey(key, value, category) {
    const raw = titleCase(key);
    const k = norm(raw);
    const v = norm(value);
    if (!k) return 'Specification';
    if (k.includes('required charging power') || k.includes('charging power')) {
      return 'Fast charging power';
    }
    if (k.includes('usb type c charging port') && /^(yes|no|var|yok|true|false)$/i.test(String(value || '').trim())) {
      return 'USB-C charging';
    }
    if (exactKeyMap.has(k)) return depolamaTuruMu(kapasiteCoz(exactKeyMap.get(k), value, category), value);
    if (k === 'charging' || k === 'charge') {
      if (/\b(usb|type c|typec|lightning|micro usb)\b/.test(v)) return 'Charging port';
      return 'Charging';
    }
    for (const { canonical, a } of FUZZY_ALIASES) {
      if (kelimeIceriyor(k, a)) return depolamaTuruMu(kapasiteCoz(canonical, value, category), value);
    }
    return raw;
  }

  function cleanValue(value) {
    return String(value == null ? '' : value)
      .replace(/\r/g, '\n')
      .split('\n')
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
  }

  function mergeValue(existing, incoming) {
    const a = cleanValue(existing);
    const b = cleanValue(incoming);
    if (!a) return b;
    if (!b) return a;
    if (norm(a) === norm(b)) return a;
    if (norm(a).includes(norm(b))) return a;
    if (norm(b).includes(norm(a))) return b;
    const lines = a.split('\n');
    for (const line of b.split('\n')) {
      if (!lines.some(x => norm(x) === norm(line))) lines.push(line);
    }
    return lines.join('\n');
  }

  function addSpec(flat, sections, section, key, value, category) {
    const v = cleanValue(value);
    if (!v || v === '?' || v.toLowerCase() === 'null') return;
    const canonical = canonicalKey(key, v, category);
    const group = canonicalSection(section, canonical);
    flat[canonical] = mergeValue(flat[canonical], v);
    if (!sections[group]) sections[group] = {};
    sections[group][canonical] = mergeValue(sections[group][canonical], v);
  }

  function canonicalizeMaps(specs, specSections, category) {
    const flat = {};
    const sections = {};
    for (const [section, body] of Object.entries(specSections || {})) {
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        for (const [key, value] of Object.entries(body)) {
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            for (const [subKey, subValue] of Object.entries(value)) {
              addSpec(flat, sections, section, subKey, subValue, category);
            }
          } else {
            addSpec(flat, sections, section, key, value, category);
          }
        }
      }
    }
    for (const [key, value] of Object.entries(specs || {})) {
      const v = cleanValue(value);
      if (!v || v === '?' || v.toLowerCase() === 'null') continue;
      const canonical = canonicalKey(key, v, category);
      if (Object.prototype.hasOwnProperty.call(flat, canonical)) {
        flat[canonical] = mergeValue(flat[canonical], v);
      } else {
        addSpec(flat, sections, 'General', key, value, category);
      }
    }
    return { specs: flat, specSections: sections };
  }

  function canonicalizeKeySpecs(keySpecs, category) {
    const out = {};
    for (const [key, value] of Object.entries(keySpecs || {})) {
      const v = cleanValue(value);
      if (!v) continue;
      const canonical = canonicalKey(key, v, category);
      out[canonical] = mergeValue(out[canonical], v);
    }
    return out;
  }

  function canonicalizeProduct(product) {
    const kategori = product?.category || '';
    const maps = canonicalizeMaps(product?.specs || {}, product?.specSections || {}, kategori);
    const keySpecs = canonicalizeKeySpecs(product?.keySpecs || {}, kategori);
    // 2026-05-29: keep the ORIGINAL specSections structure (source-language
    // section names + original spec keys). The canonicalised re-bucketing
    // was dropping whole sections — e.g. Epey CPU products lost TEMEL
    // BİLGİLER (Desteklediği Teknolojiler / Jenerasyon / PassMark Puanı /
    // Çıkış Dönemi / Çıkış Yılı / İşlemci Mimarisi / Serisi / Türü /
    // Üst Modeli) because their canonical keys had no match in KEY_RULES
    // and the canonical section bucket they landed in collided with other
    // content. The admin modal already runs per-row dict lookup so the
    // section title, key, and value all get translated on display — it
    // does not need pre-canonicalised buckets. Search, scoring, and
    // comparison still consume the canonical flat `specs` / `specsEn`
    // map below, so nothing downstream breaks.
    const originalSections = product?.specSections && typeof product.specSections === 'object' && !Array.isArray(product.specSections)
      ? product.specSections
      : maps.specSections;
    return {
      ...product,
      specs: maps.specs,
      specSections: originalSections,
      specsEn: maps.specs,
      keySpecs,
      specsCount: Object.keys(maps.specs).length,
      canonicalSpecsVersion: VERSION,
    };
  }

  return {
    VERSION,
    normalizeKey: norm,
    canonicalKey,
    canonicalSection,
    canonicalizeMaps,
    canonicalizeKeySpecs,
    canonicalizeProduct,
  };
});
