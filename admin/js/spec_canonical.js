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
      // NOKTALI BUYUK I TUZAGI. JS'te 'İ'.toLowerCase() tek harf DEGIL,
      // "i" + U+0307 (birlesen nokta) uretir. Asagidaki [^a-z0-9] suzgeci o
      // noktayi BOSLUGA cevirdigi icin kelime ikiye bolunuyordu:
      //     "İletim Protokolü" -> "i letim protokolu"
      //     "İşlemci Modeli"   -> "i slemci modeli"
      // Boylece I ile baslayan HICBIR Turkce etiket takma adlara eslesemiyordu
      // (olculdu 2026-08-30). Birlesen isaretler once temizlenir.
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
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
    // Monitorde "standli agirlik" URUN agirligindan AYRI bir olcum; ayni
    // anahtara duserlerse mergeValue ikisini tek satirda birlestiriyordu.
    ['Weight with stand', ['weight with stand', 'display weight with stand', 'agirlik standli', 'standli agirlik', 'display agirligi standli']],
    ['Dimensions', ['dimensions', 'dimension', 'abmessungen', 'masse', 'maße', 'boyutlar', 'olculer']],
    ['Thickness', ['thickness', 'dicke', 'tiefe', 'kalinlik']],
    ['Width', ['width', 'breite', 'en', 'genislik']],
    ['Height', ['height', 'hohe', 'höhe', 'boy', 'length', 'yukseklik']],
    ['Depth', ['depth', 'derinlik']],
    ['Water resistance', ['water resistance', 'waterproof', 'wasserdicht', 'schutzart', 'ip zertifizierung', 'suya dayaniklilik']],
    ['Color', ['color', 'colour', 'farbe', 'color options', 'renk', 'renk secenekleri']],
    ['Sensors', ['sensors', 'sensoren', 'sensorler']],
    ['Speakers', ['speakers', 'speaker features', 'lautsprecher', 'hoparlor', 'hoparlor ozellikleri']],

    // ── Epey'in ham Turkce etiketleri ──────────────────────────────────────
    // Bunlar hicbir kurala eslesmiyordu ve kanonik (INGILIZCE) tarafta
    // oldugu gibi duruyordu: Ingilizce urun sayfasinda, JSON-LD'de ve AI
    // istemlerinde "Cerceve Boyutu", "Veri Yolu Standardi" gibi Turkce
    // etiketler gorunuyordu. Makine cevirisi bunlari ya bozuyor
    // ("Sirali Okuma" -> "Sequential Okuma") ya da yanlis anlamlandiriyor
    // ("Cerceve Boyutu" -> "Frame Size"; dogrusu FORM FAKTORU), o yuzden
    // acik yaziliyorlar.
    ['Sequential read', ['sirali okuma', 'sequential read', 'okuma hizi', 'read speed']],
    ['Sequential write', ['sirali yazma', 'sequential write', 'yazma hizi', 'write speed']],
    ['Form factor', ['form factor', 'form faktoru', 'formfaktor', 'bauform', 'cerceve boyutu', 'frame size']],
    ['Bus standard', ['veri yolu standardi', 'bus standard', 'pcie nesli', 'pcie generation']],
    ['Bus', ['veri yolu', 'bus', 'bus interface']],
    ['Interface', ['baglanti arayuzu', 'connection interface', 'arayuz', 'schnittstelle']],
    ['Device type', ['cihaz tipi', 'device type']],
    ['Device class', ['cihaz sinifi', 'device class']],
    ['Product code', ['urun kodlari', 'urun kodu', 'product code', 'model code']],
    ['Protocol', ['iletim protokolu', 'transfer protocol', 'protocol']],
    ['Other features', ['diger ozellikler', 'other features', 'ek ozellikler', 'weitere merkmale']],
    ['Usage', ['kullanim amaci', 'intended use', 'usage']],
    ['Series', ['urun serisi', 'product series', 'series', 'seri']],
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
  // TAKMA AD ETIKETIN SONUNU KAPLAMALI (bas-son kurali).
  //
  // Hem Turkce hem Ingilizce bilesik spec etiketlerinde ANA KAVRAM SONDA
  // durur, bastakiler onu NITELER:
  //     "Islemci Markasi"  -> asil kavram MARKA,  islemci nitelik
  //     "Islemci Onbellek" -> asil kavram ONBELLEK
  //     "Screen size"      -> asil kavram SIZE
  // Bu yuzden bir takma ad etiketin ICINDE gecmesi YETMEZ, SONUNU kaplamali.
  //
  // Bu kural olmadan kisa bir takma ad butun bir aileyi yutuyordu. Olculdu
  // 2026-08-30, `İ` normalizasyonu duzeltildikten hemen sonra: 'islemci'
  // takma adi tek basina su ON etiketi ayni 'Processor' anahtarina
  // dusuruyordu -> mergeValue hepsini tek satirda birlestiriyor ve on ayri
  // olcum KAYBOLUYORDU:
  //     Islemci Markasi · Islemci Modeli · Islemci Serisi · Islemci Core ·
  //     Islemci Temel Frequency · Islemci Mimarisi · Islemci Soketi ...
  // Ayni sey Display Yuksekligi/Genisligi -> Height/Width ve
  // Arka Camera (+Specificationsi) -> Main camera icin de oluyordu.
  // AYRI ORNEGI ISARETLEYEN ONEKLER. Bunlar etiketi BASKA bir olcume
  // cevirir; takma ad onlari kapsamiyorsa bulanik eslesme REDDEDILIR.
  // Olculdu 2026-08-30: bu kapi olmadan asagidakiler tek anahtarda
  // birlesip mergeValue ile tek satira iniyordu --
  //     "Ikinci Arka Camera" + "Ucuncu Arka Camera" + "Main camera"
  //     "1. Yardimci Islemci" + "2. Yardimci Islemci"
  //     "Alt Seri" + "Seri"     ·   "Ikinci Display Boyutu" + "Display Boyutu"
  //     "Dahili Grafik Temel Frequency" + "Islemci Temel Frequency"
  const ORNEK_ONEKI = new Set([
    // Turkce
    'ikinci', 'ucuncu', 'dorduncu', 'besinci', 'altinci',
    'alt', 'yardimci', 'uyumlu', 'dahili', 'grafik',
    // Ayni onekler etiket temizliginden Ingilizce olarak da cikabiliyor
    // (olculdu: "Alt Seri" -> "Bottom Series", "Besinci ..." -> "Fifth ...",
    // "Dahili Grafik ..." -> "Internal Graphics ...").
    'second', 'third', 'fourth', 'fifth', 'sixth',
    'bottom', 'sub', 'internal', 'integrated', 'graphics', 'auxiliary',
    '1', '2', '3', '4', '5', '6',
  ]);
  function kelimeIceriyor(hay, needle) {
    if (hay === needle) return true;
    if (!hay.endsWith(' ' + needle)) return false;
    // Takma ad etiketin SONUNU kapliyor; bastaki artik jetonlar arasinda
    // "ayri ornek" oneki varsa bu BASKA bir olcumdur.
    const artik = hay.slice(0, hay.length - needle.length).trim().split(' ');
    for (const j of artik) {
      if (j && ORNEK_ONEKI.has(j) && !(' ' + needle + ' ').includes(' ' + j + ' ')) return false;
    }
    return true;
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

  // YARIM CEVRILMIS ETIKETI INGILIZCEYE TAMAMLA -- AMA YALNIZ KARISIKSA.
  //
  // Katalogun bir kismi TR->EN sozlugunden YARIM gecmis etiketler tasiyor:
  // ayni etiketin icinde hem Ingilizce hem Turkce kelime var. Olculdu
  // 2026-08-30 (600 urun / 15 kategori):
  //     "Diger Specifications" 186 · "Display Boyutu" 127+80+40
  //     "Mouse Diger Specifications" 56 · "Display Tipi" 43 · "Panel Tipi" 40
  //     "Display Agirligi (Standli)" 40 · "Bellek Frequency" 25 ...
  // Bunlar kanonik (INGILIZCE) tarafta duruyor: Ingilizce urun sayfasinda,
  // JSON-LD'de ve AI istemlerinde aynen goruluyorlar.
  //
  // KAPI: temizlik YALNIZ etiket zaten karisiksa calisir. Cunku sozluk eksik
  // ve SAF Turkce bir etikete uygulanirsa onu YARIM cevrilmis hale getirir --
  // yani duzeltmeye calistigimiz hatanin ta kendisini uretir. Olculdu:
  //     "Sirali Okuma" -> "Sequential Okuma"   ("okuma" sozlukte YOK)
  //     "Veri Yolu"    -> "Data Yolu"          ("yolu"  sozlukte YOK)
  // `translationHasTurkishResidue` bunlari yakalamaz, cunku "Okuma"/"Yolu"
  // Turkce'ye ozgu harf tasimiyor. O yuzden kapi CIKTIYA degil GIRDIYE
  // bakiyor: saf Turkce etiketler makineye hic verilmez, onlar icin dogru
  // cozum tahmin degil KEY_RULES'a acik takma addir (asagida yazildi).
  //
  // Ceviri sozlugu TEK KAYNAK olan admin/js/spec_i18n.js'te; burada ikinci
  // bir sozluk TUTULMAZ. Bagimlilik OPSIYONEL: spec_i18n yuklu degilse
  // etiket oldugu gibi kalir, davranis degismez.
  // KARISIK ETIKETIN INGILIZCE TARAFI -- OLCULMUS KELIME LISTESI.
  //
  // "Bu jeton Ingilizce mi?" sorusunu genel olarak cevaplayamayiz: elimizde
  // Ingilizce sozluk yok ve "Okuma" ile "Panel" ikisi de saf ASCII. Tahmin
  // etmek tam da kacinmak istedigimiz hataya goturuyor
  // ("Sirali Okuma" -> "Sequential Okuma"). Bu yuzden liste TAHMIN DEGIL,
  // 600 urun / 15 kategori uzerinde OLCULEN karisik etiketlerden cikarildi
  // (2026-08-30). Yeni bir karisim gorulurse buraya OLCEREK eklenir.
  const INGILIZCE_ISARET = new Set([
    'specifications', 'display', 'panel', 'charging', 'frequency', 'support',
    'memory', 'resolution', 'storage', 'battery', 'processor', 'screen',
    'camera', 'interface', 'connection', 'refresh', 'power', 'capacity',
    'weight', 'speed', 'color', 'features', 'type', 'size', 'mouse',
  ]);
  function karisikEtiketMi(key, i18n) {
    const d = (i18n && i18n.TR_WORD_DICT) || {};
    let ingilizce = false;
    let turkce = false;
    for (const j of norm(key).split(' ')) {
      if (j && INGILIZCE_ISARET.has(j)) ingilizce = true;
    }
    for (const j of String(key).toLowerCase().split(/[^a-z0-9çğıöşü]+/i)) {
      if (!j) continue;
      if (/[çğıöşü]/.test(j)) turkce = true;
      else if (Object.prototype.hasOwnProperty.call(d, j)) turkce = true;
    }
    return ingilizce && turkce;
  }
  function etiketiTamamla(key) {
    const s = String(key == null ? '' : key);
    const i18n = (typeof globalThis !== 'undefined') && globalThis.QorAiSpecI18n;
    if (!i18n || typeof i18n.finalPassTurkishCleanup !== 'function') return s;
    if (!karisikEtiketMi(s, i18n)) return s;
    try {
      const out = String(i18n.finalPassTurkishCleanup(s, 'en') || '').trim();
      return out || s;
    } catch (_) {
      return s;
    }
  }

  // Bir etiketi kurallara vurur; eslesme yoksa '' doner.
  function kurallaraVur(k, value, category) {
    if (!k) return '';
    if (k.includes('required charging power') || k.includes('charging power')) {
      return 'Fast charging power';
    }
    if (k.includes('usb type c charging port') && /^(yes|no|var|yok|true|false)$/i.test(String(value || '').trim())) {
      return 'USB-C charging';
    }
    if (exactKeyMap.has(k)) return onbellekTuruMu(depolamaTuruMu(kapasiteCoz(exactKeyMap.get(k), value, category), value), value);
    if (k === 'charging' || k === 'charge') {
      if (/(usb|type c|typec|lightning|micro usb)/.test(norm(value))) return 'Charging port';
      return 'Charging';
    }
    for (const { canonical, a } of FUZZY_ALIASES) {
      if (kelimeIceriyor(k, a)) return onbellekTuruMu(depolamaTuruMu(kapasiteCoz(canonical, value, category), value), value);
    }
    return '';
  }

  // SIRA ONEMLI: once ORIJINAL etiket kurallara vurulur. Makine temizligi
  // ancak orijinal hicbir kurala eslesmediginde devreye girer -- boylece
  // KEY_RULES'taki acik Turkce takma adlar ("sirali okuma", "veri yolu")
  // temizlik tarafindan EZILMEZ.
  // "RAM type" ANAHTARI SLC/MLC/TLC TASIYORSA O RAM DEGIL ONBELLEKTIR.
  // Depolamadaki ile ayni durum: kayitlarin bir kismi ZATEN bozuk kanonik
  // bicimde ("On Bellek Tipi" -> 'RAM type') duruyor ve kaynak etiket
  // silindigi icin anahtardan geri getirilemiyor -- ama DEGERDEN
  // getirilebilir. SLC/MLC/TLC/QLC bir NAND onbellek turudur; RAM turu
  // DDR/LPDDR/GDDR ailesidir.
  const ONBELLEK_TURU = /^(s|m|t|q)lc\b/i;
  function onbellekTuruMu(canonical, value) {
    if (canonical !== 'RAM type') return canonical;
    return ONBELLEK_TURU.test(String(value == null ? '' : value).trim())
      ? 'Cache type' : canonical;
  }

  function canonicalKey(key, value, category) {
    const raw = titleCase(key);
    const k = norm(raw);
    if (!k) return 'Specification';

    // 1) ORIJINAL etiket kurallara vurulur.
    const dogrudan = kurallaraVur(k, value, category);
    if (dogrudan) return dogrudan;

    // 2) Eslesmedi. Etiket KARISIK ise (hem Ingilizce hem Turkce kelime)
    //    Ingilizceye tamamlanip TEKRAR denenir: "Display Boyutu" once
    //    "Display Size", sonra 'Screen size' olur.
    const temiz = etiketiTamamla(raw);
    if (temiz && temiz !== raw) {
      const ikinci = kurallaraVur(norm(temiz), value, category);
      if (ikinci) return ikinci;
      // Kurala oturmadi ama artik TEK DILLI: temizlenmis hali kalir
      // ("Mouse Diger Specifications" -> "Mouse Other Specifications").
      return titleCase(temiz);
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
