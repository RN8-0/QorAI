// ─────────────────────────────────────────────────────────────────────────────
//  Geizhals DE → EN/TR deterministic glossary.
//
//  Machine translation (Argos/NLLB/DeepSeek) hallucinates on short technical
//  atoms ("25W (Samsung AFC)" → EU-regulation prose, "LED-Blitz" → "LED
//  lightning"). Geizhals spec vocabulary is a small, closed set, so this module
//  translates labels, sections and value lines DETERMINISTICALLY. MT is only a
//  fallback for atoms this glossary cannot fully clean (residueCheck flags
//  them).
//
//  Used by:
//   • admin/js/scraper-geizhals.js  (scrape time, via window.QorAiGeizhalsGlossary)
//   • scripts/fix_geizhals_products.mjs  (repair of already-scraped products)
//
//  UMD: browser global + CommonJS export.
// ─────────────────────────────────────────────────────────────────────────────
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.QorAiGeizhalsGlossary = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const VERSION = '20260610-geizhals-glossary-v1';

  // ── text helpers ──────────────────────────────────────────────────────────
  // Geizhals HTML carries zero-width spaces inside values ("f/​1.8") — strip.
  function cleanText(s) {
    return String(s == null ? '' : s)
      .replace(/[​‌‍﻿]/g, '')
      .replace(/ /g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/ ?\n ?/g, '\n')
      .trim();
  }

  // JS \b is ASCII-only and fails around umlauts — explicit boundary class.
  const W = 'A-Za-z0-9_ÄÖÜẞäöüßÀ-ÿÇĞİŞÜçğıöşü';
  function gb(body, flags = 'gi') {
    return new RegExp(`(?<![${W}])(?:${body})(?![${W}])`, flags);
  }

  function foldDe(s) {
    return String(s || '').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[​‌‍﻿]/g, '')
      .replace(/\s+/g, ' ').trim();
  }

  // Tokens whose styling must never be case-mangled at line start.
  const LOWER_STYLE = /^(microSD|eSIM|iPhone|iPad|iOS|iPadOS|macOS|aptX|mmWave)/;

  // Writing rule: every label and every value line starts with a capital
  // letter (Turkish-aware: i → İ).
  function upperFirst(s, lang) {
    const str = String(s || '');
    if (!str) return str;
    if (LOWER_STYLE.test(str)) return str;
    const i = str.search(/[\p{L}\p{N}]/u);
    if (i === -1) return str;
    const ch = str[i];
    const up = lang === 'tr' ? ch.toLocaleUpperCase('tr-TR') : ch.toUpperCase();
    return str.slice(0, i) + up + str.slice(i + 1);
  }

  // ── 1. Spec labels (complete Geizhals smartphone label set) ──────────────
  // canonical: key used in the canonical-English specs/specSections maps —
  // matches admin/js/spec_canonical.js KEY_RULES so cross-source merge works.
  // en/tr: display translations for the per-product multiLang maps.
  const LABELS = {
    'abmessungen':                      { canonical: 'Dimensions',            en: 'Dimensions',              tr: 'Boyutlar' },
    'akku':                             { canonical: 'Battery capacity',      en: 'Battery',                 tr: 'Pil' },
    'akkulaufzeit pro zyklus':          { canonical: 'Battery life per cycle', en: 'Battery life per cycle', tr: 'Döngü başına pil ömrü' },
    'batterieausdauer':                 { canonical: 'Battery cycle life',    en: 'Battery cycle life',      tr: 'Pil şarj döngüsü' },
    'besonderheiten':                   { canonical: 'Features',              en: 'Features',                tr: 'Özellikler' },
    'betriebssystem':                   { canonical: 'Operating system',      en: 'Operating system',        tr: 'İşletim sistemi' },
    'cpu':                              { canonical: 'Processor',             en: 'CPU',                     tr: 'CPU' },
    'display':                          { canonical: 'Screen size',           en: 'Display',                 tr: 'Ekran' },
    'energieeffizienzklasse':           { canonical: 'Energy efficiency class', en: 'Energy efficiency class', tr: 'Enerji verimliliği sınıfı' },
    'farbe':                            { canonical: 'Color',                 en: 'Color',                   tr: 'Renk' },
    'freifall-zuverlaessigkeitsklasse': { canonical: 'Free fall reliability class', en: 'Free fall reliability class', tr: 'Düşme dayanıklılık sınıfı' },
    'frequenzbaender':                  { canonical: 'Frequency bands',       en: 'Frequency bands',         tr: 'Frekans bantları' },
    'gpu':                              { canonical: 'GPU',                   en: 'GPU',                     tr: 'GPU' },
    'gehaeuseform':                     { canonical: 'Form factor',           en: 'Form factor',             tr: 'Biçim faktörü' },
    'gehaeusematerial':                 { canonical: 'Material',              en: 'Material',                tr: 'Malzeme' },
    'gelistet seit':                    { canonical: 'Listed since',          en: 'Listed since',            tr: 'Listelenme tarihi' },
    'gewicht':                          { canonical: 'Weight',                en: 'Weight',                  tr: 'Ağırlık' },
    'kamera hinten':                    { canonical: 'Main camera',           en: 'Main camera',             tr: 'Arka kamera' },
    'kamera vorne':                     { canonical: 'Front camera',          en: 'Front camera',            tr: 'Ön kamera' },
    'ladeleistung':                     { canonical: 'Fast charging power',   en: 'Fast charging power',     tr: 'Hızlı şarj gücü' },
    'modem':                            { canonical: 'Modem',                 en: 'Modem',                   tr: 'Modem' },
    'navigation':                       { canonical: 'Navigation',            en: 'Navigation',              tr: 'Navigasyon' },
    'ram':                              { canonical: 'RAM',                   en: 'RAM',                     tr: 'RAM' },
    'reparierbarkeitsklasse':           { canonical: 'Repairability class',   en: 'Repairability class',     tr: 'Onarılabilirlik sınıfı' },
    'sar-wert':                         { canonical: 'SAR value',             en: 'SAR value',               tr: 'SAR değeri' },
    'sim-karte':                        { canonical: 'SIM card',              en: 'SIM card',                tr: 'SIM kartı' },
    'schnittstellen':                   { canonical: 'Interfaces',            en: 'Interfaces',              tr: 'Arayüzler' },
    'schutzart':                        { canonical: 'Water resistance',      en: 'Protection rating',       tr: 'Koruma sınıfı' },
    'screen-to-body-ratio':             { canonical: 'Screen-to-body ratio',  en: 'Screen-to-body ratio',    tr: 'Ekran/gövde oranı' },
    'sensoren':                         { canonical: 'Sensors',               en: 'Sensors',                 tr: 'Sensörler' },
    'soc':                              { canonical: 'Chipset',               en: 'SoC',                     tr: 'Yonga (SoC)' },
    'speicher':                         { canonical: 'Storage',               en: 'Storage',                 tr: 'Depolama' },
    // Labels that may already arrive half-translated from older pipelines.
    'battery life pro zyklus':          { canonical: 'Battery life per cycle', en: 'Battery life per cycle', tr: 'Döngü başına pil ömrü' },
    'camera hinten':                    { canonical: 'Main camera',           en: 'Main camera',             tr: 'Arka kamera' },
    'camera vorne':                     { canonical: 'Front camera',          en: 'Front camera',            tr: 'Ön kamera' },
    'freifall-':                        { canonical: 'Free fall reliability class', en: 'Free fall reliability class', tr: 'Düşme dayanıklılık sınıfı' },
  };

  // ── 2. Section names (Geizhals scraper already emits English sections) ───
  const SECTIONS = {
    'battery / power':    { en: 'Battery / Power',    tr: 'Pil / Güç' },
    'camera':             { en: 'Camera',             tr: 'Kamera' },
    'chip / processor':   { en: 'Chip / Processor',   tr: 'Yonga / İşlemci' },
    'display':            { en: 'Display',            tr: 'Ekran' },
    'features':           { en: 'Features',           tr: 'Özellikler' },
    'general':            { en: 'General',            tr: 'Genel' },
    'graphics':           { en: 'Graphics',           tr: 'Grafik' },
    'software / os':      { en: 'Software / OS',      tr: 'Yazılım / İşletim sistemi' },
    'dimensions':         { en: 'Dimensions',         tr: 'Boyutlar' },
    'memory':             { en: 'Memory',             tr: 'Bellek' },
    'release & pricing':  { en: 'Release & Pricing',  tr: 'Çıkış & Fiyat' },
    'connectivity':       { en: 'Connectivity',       tr: 'Bağlantı' },
    'design':             { en: 'Design',             tr: 'Tasarım' },
    'audio':              { en: 'Audio',              tr: 'Ses' },
    'sensors':            { en: 'Sensors',            tr: 'Sensörler' },
  };

  // ── 3. Value-line rules (ordered: longest / most specific first) ─────────
  // Each rule: [regex, enReplacement, trReplacement]. '$n' capture refs OK.
  const VALUE_RULES = [
    // charging
    [gb('umgekehrtes Laden \\(kabelgebunden\\)'), 'Reverse charging (wired)', 'Ters şarj (kablolu)'],
    [gb('umgekehrtes Laden \\(kabellos\\)'), 'Reverse charging (wireless)', 'Ters şarj (kablosuz)'],
    [gb('umgekehrtes Laden \\(wireless\\)'), 'Reverse charging (wireless)', 'Ters şarj (kablosuz)'],
    [gb('umgekehrtes Laden mit Kabel'), 'reverse wired charging', 'ters kablolu şarj'],
    [gb('umgekehrtes Laden ohne Kabel'), 'reverse wireless charging', 'ters kablosuz şarj'],
    [gb('umgekehrtes Laden with Kabel'), 'reverse wired charging', 'ters kablolu şarj'],
    [gb('umgekehrtes Laden without Kabel'), 'reverse wireless charging', 'ters kablosuz şarj'],
    [gb('umgekehrtes Laden'), 'Reverse charging', 'Ters şarj'],
    [gb('kabelloses Laden'), 'Wireless charging', 'Kablosuz şarj'],
    [gb('wireless charging'), 'Wireless charging', 'Kablosuz şarj'],
    [gb('reverse charging \\(wired\\)'), 'Reverse charging (wired)', 'Ters şarj (kablolu)'],
    [gb('reverse charging \\(wireless\\)'), 'Reverse charging (wireless)', 'Ters şarj (kablosuz)'],
    [/(\d+)x\s*Laden/gi, '$1 charge cycles', '$1 şarj döngüsü'],
    [/(\d+)\s*charging cycles/gi, '$1 charge cycles', '$1 şarj döngüsü'],
    [gb('fest verbaut'), 'Built-in', 'Sabit (çıkarılamaz)'],
    [gb('built-?in'), 'Built-in', 'Sabit (çıkarılamaz)'],
    [gb('wechselbar'), 'Removable', 'Çıkarılabilir'],
    [gb('Schnellladen'), 'Fast charging', 'Hızlı şarj'],

    // display
    [gb('kapazitiver Touchscreen'), 'Capacitive touchscreen', 'Kapasitif dokunmatik ekran'],
    [gb('capacitive touchscreen'), 'Capacitive touchscreen', 'Kapasitif dokunmatik ekran'],
    [gb('Kameraloch'), 'Punch-hole camera', 'Kamera deliği'],
    [gb('camera cutout'), 'Punch-hole camera', 'Kamera deliği'],
    [gb('Aussparung'), 'Notch', 'Çentik'],
    [gb('Außendisplay'), 'Outer display', 'Dış ekran'],
    [/(\d+(?:-\d+)?)\s*Hz\s+(?:Aktualisierungsrate|refresh rate)/gi, '$1Hz refresh rate', '$1Hz yenileme hızı'],
    [/(\d+(?:-\d+)?)\s*Hz\s+(?:Abtastrate|touch sampling rate)/gi, '$1Hz touch sampling rate', '$1Hz dokunmatik örnekleme hızı'],
    [/([\d.,]+)\s*Nits?\s*\(maximal\)/gi, '$1 nits (peak)', '$1 nit (maksimum)'],
    [/([\d.,]+)\s*nits?\s*\((?:maximum|peak)\)/gi, '$1 nits (peak)', '$1 nit (maksimum)'],
    [/([\d.,]+)\s*Nits?\s*\(typisch\)/gi, '$1 nits (typical)', '$1 nit (tipik)'],
    [/([\d.,]+)\s*nits?\s*\(typical\)/gi, '$1 nits (typical)', '$1 nit (tipik)'],
    [/([\d.,]+)\s*Mrd\.\s*Farben/gi, '$1 billion colors', '$1 milyar renk'],
    [/([\d.,]+)\s*Mio\.\s*Farben/gi, '$1 million colors', '$1 milyon renk'],
    [/([\d.,]+)\s*(?:billion colors)/gi, '$1 billion colors', '$1 milyar renk'],
    [/([\d.,]+)\s*(?:million colors)/gi, '$1 million colors', '$1 milyon renk'],
    [gb('Pixel'), 'pixels', 'piksel'],
    [gb('pixels'), 'pixels', 'piksel'],
    [/\(Display\s*(\d+)\)/gi, '(display $1)', '(ekran $1)'],
    [/\(display\s*(\d+)\)/gi, '(display $1)', '(ekran $1)'],
    [gb('faltbar \\(innen\\)'), 'Foldable (inward)', 'Katlanabilir (içe katlanır)'],
    [gb('foldable \\(inward\\)'), 'Foldable (inward)', 'Katlanabilir (içe katlanır)'],
    [gb('flach'), 'Flat', 'Düz'],
    [gb('gebogen'), 'Curved', 'Kavisli'],

    // CPU / chips
    [/(\d+)\s*(?:Kerne|cores)/gi, '$1 cores', '$1 çekirdek'],

    // camera
    [gb('Phasenvergleich-AF'), 'Phase-detection AF', 'Faz algılamalı AF'],
    [gb('phase autofocus'), 'Phase-detection AF', 'Faz algılamalı AF'],
    [gb('phase[- ]detection autofocus'), 'Phase-detection AF', 'Faz algılamalı AF'],
    [gb('Kontrast-AF'), 'Contrast AF', 'Kontrast AF'],
    [gb('Laser-AF'), 'Laser AF', 'Lazer AF'],
    [gb('Dual-LED-Blitz'), 'Dual-LED flash', 'Çift LED flaş'],
    [gb('LED-Blitz'), 'LED flash', 'LED flaş'],
    [gb('LED flash'), 'LED flash', 'LED flaş'],
    [gb('Blitz'), 'Flash', 'Flaş'],
    [gb('Periskop-Teleobjektiv'), 'Periscope telephoto lens', 'Periskop telefoto lens'],
    [gb('Teleobjektiv'), 'Telephoto lens', 'Telefoto lens'],
    [gb('Weitwinkelobjektiv'), 'Wide-angle lens', 'Geniş açı lens'],
    [gb('wide-angle lens'), 'Wide-angle lens', 'Geniş açı lens'],
    [gb('Ultraweitwinkelobjektiv'), 'Ultra-wide lens', 'Ultra geniş açı lens'],
    [gb('Makroobjektiv'), 'Macro lens', 'Makro lens'],
    [gb('macro lens'), 'Macro lens', 'Makro lens'],
    [/([\d.]+)x\s*optischer Zoom/gi, '$1x optical zoom', '$1x optik zoom'],
    [/([\d.]+)x\s*optical zoom/gi, '$1x optical zoom', '$1x optik zoom'],
    [gb('Videos @'), 'Videos @', 'Videolar @'],
    [/\(Kamera\s*(\d+)\)/gi, '(Camera $1)', '(Kamera $1)'],
    [/\(Camera\s*(\d+)\)/gi, '(Camera $1)', '(Kamera $1)'],
    [gb('keine Angabe'), 'Not specified', 'Belirtilmemiş'],
    [gb('unter Display'), 'Under-display', 'Ekran altı'],

    // sensors
    [gb('Beschleunigungssensor'), 'Accelerometer', 'İvmeölçer'],
    [gb('accelerometer'), 'Accelerometer', 'İvmeölçer'],
    [gb('Gyroskop'), 'Gyroscope', 'Jiroskop'],
    [gb('gyroscope'), 'Gyroscope', 'Jiroskop'],
    [gb('Annäherungssensor'), 'Proximity sensor', 'Yakınlık sensörü'],
    [gb('proximity sensor'), 'Proximity sensor', 'Yakınlık sensörü'],
    [gb('Lichtsensor'), 'Light sensor', 'Işık sensörü'],
    [gb('light sensor'), 'Light sensor', 'Işık sensörü'],
    [gb('Kompass'), 'Compass', 'Pusula'],
    [gb('compass'), 'Compass', 'Pusula'],
    [gb('Barometer'), 'Barometer', 'Barometre'],
    [gb('Fingerabdrucksensor \\(Display\\)'), 'Fingerprint sensor (in-display)', 'Parmak izi sensörü (ekran içi)'],
    [gb('Fingerprint sensor \\(Display\\)'), 'Fingerprint sensor (in-display)', 'Parmak izi sensörü (ekran içi)'],
    [gb('Fingerabdrucksensor \\(seitlich\\)'), 'Fingerprint sensor (side-mounted)', 'Parmak izi sensörü (yan tuşta)'],
    [gb('Fingerprint sensor \\(seitlich\\)'), 'Fingerprint sensor (side-mounted)', 'Parmak izi sensörü (yan tuşta)'],
    [gb('Fingerabdrucksensor'), 'Fingerprint sensor', 'Parmak izi sensörü'],
    [gb('Gesichtsscanner \\(3D, Infrarot\\)'), 'Face scanner (3D, infrared)', 'Yüz tarayıcı (3D, kızılötesi)'],
    [gb('Gesichtsscanner'), 'Face scanner', 'Yüz tarayıcı'],

    // audio / interfaces
    [gb('Stereo-(?:Lautsprecher|Speakers) \\(hybrid\\)'), 'Stereo speakers (hybrid)', 'Stereo hoparlör (hibrit)'],
    [gb('Stereo-(?:Lautsprecher|Speakers)'), 'Stereo speakers', 'Stereo hoparlör'],
    [gb('Lautsprecher'), 'Speakers', 'Hoparlör'],
    [gb('Infrarot-Port'), 'Infrared port', 'Kızılötesi port'],
    [gb('3.5mm Klinke'), '3.5mm jack', '3.5mm kulaklık girişi'],
    [gb('Klinke'), 'jack', 'kulaklık girişi'],
    [/microSD-Slot\s*\(dediziert,\s*bis\s*([\d.]+\s*[TG]B)\)/gi, 'microSD slot (dedicated, up to $1)', 'microSD yuvası (özel, en fazla $1)'],
    [/microSD-Slot\s*\(shared,\s*bis\s*([\d.]+\s*[TG]B)\)/gi, 'microSD slot (shared, up to $1)', 'microSD yuvası (paylaşımlı, en fazla $1)'],
    [gb('microSD-Slot'), 'microSD slot', 'microSD yuvası'],
    [gb('Satellitenkommunikation \\(Textnachrichten, nur Notruf\\)'), 'Satellite communication (text messages, emergency only)', 'Uydu iletişimi (kısa mesaj, sadece acil durum)'],
    [gb('Satellitenkommunikation'), 'Satellite communication', 'Uydu iletişimi'],
    [gb('Benachrichtigungs-LED \\(hinten/mehrfarbig\\)'), 'Notification LED (rear, multicolor)', "Bildirim LED'i (arka, çok renkli)"],
    [gb('Benachrichtigungs-LED'), 'Notification LED', "Bildirim LED'i"],

    // software / updates
    [/(\d+)\s*Betriebssystem-Updates/gi, '$1 OS updates', '$1 işletim sistemi güncellemesi'],
    [/(\d+)\s*OS updates/gi, '$1 OS updates', '$1 işletim sistemi güncellemesi'],
    [/(\d+)\s*Jahre\s*Sicherheits-Updates/gi, '$1 years of security updates', '$1 yıl güvenlik güncellemesi'],
    [/(\d+)\s*years of security updates/gi, '$1 years of security updates', '$1 yıl güvenlik güncellemesi'],
    [gb('ab Werk'), 'out of the box', 'fabrika çıkışı'],
    [gb('ex factory'), 'out of the box', 'fabrika çıkışı'],
    [gb('out of the box'), 'out of the box', 'fabrika çıkışı'],
    [gb('via Update'), 'via update', 'güncellemeyle'],
    [gb('via update'), 'via update', 'güncellemeyle'],

    // certification / ratings
    [/-zertifiziert/gi, ' certified', ' sertifikalı'],
    [/(IP\d+[A-Z]?(?:\/IP\d+[A-Z]?)*)[\s-]certified/gi, '$1 certified', '$1 sertifikalı'],
    [/(MIL-STD-\d+[A-Z]?)[\s-]certified/gi, '$1 certified', '$1 sertifikalı'],
    [/\(A\s+(?:bis|to)\s+([A-Z])\)/g, '(A to $1)', '(A ile $1)'],

    // form factor / materials
    [gb('Foldable \\(Clamshell\\)'), 'Foldable (clamshell)', 'Katlanabilir (kapaklı)'],
    [gb('Foldable \\(Booklet\\)'), 'Foldable (booklet)', 'Katlanabilir (kitap tipi)'],
    [gb('Barren'), 'Bar', 'Düz (bar)'],
    [gb('Glas/Holz'), 'Glass/Wood', 'Cam/Ahşap'],
    [gb('Glas/Kunststoff'), 'Glass/Plastic', 'Cam/Plastik'],
    [gb('Glas'), 'Glass', 'Cam'],
    [gb('Glass'), 'Glass', 'Cam'],
    [gb('Kunststoff'), 'Plastic', 'Plastik'],
    [gb('Plastic'), 'Plastic', 'Plastik'],
    [gb('Metall'), 'Metal', 'Metal'],
    [gb('Aluminium'), 'Aluminium', 'Alüminyum'],
    [gb('Edelstahl'), 'Stainless steel', 'Paslanmaz çelik'],
    [gb('Holz'), 'Wood', 'Ahşap'],
    [gb('Titan'), 'Titanium', 'Titanyum'],
    [/\(Rückseite\)/gi, '(back)', '(arka)'],
    [/\(back\)/gi, '(back)', '(arka)'],
    [/\(Rahmen\)/gi, '(frame)', '(çerçeve)'],
    [/\(frame\)/gi, '(frame)', '(çerçeve)'],
    [/\(offen\)/gi, '(unfolded)', '(açık)'],
    [/\(open\)/gi, '(unfolded)', '(açık)'],
    [/\(geschlossen\)/gi, '(folded)', '(kapalı)'],
    [/\(closed\)/gi, '(folded)', '(kapalı)'],

    // SAR
    [/([\d.,]+\s*W\/\s*kg)\s+(?:Kopf|head)/gi, '$1 (head)', '$1 (baş)'],
    [/([\d.,]+\s*W\/\s*kg)\s+(?:Körper|body)/gi, '$1 (body)', '$1 (gövde)'],

    // SIM
    [gb('Dual-SIM'), 'Dual SIM', 'Çift SIM'],
    [gb('Single-SIM'), 'Single SIM', 'Tek SIM'],

    // colors (standalone "Farbe" values)
    [gb('schwarz'), 'Black', 'Siyah'],
    [gb('weiß|weiss'), 'White', 'Beyaz'],
    [gb('grau'), 'Gray', 'Gri'],
    [gb('blau'), 'Blue', 'Mavi'],
    [gb('grün|gruen'), 'Green', 'Yeşil'],
    [gb('rot'), 'Red', 'Kırmızı'],
    [gb('gelb'), 'Yellow', 'Sarı'],
    [gb('silber'), 'Silver', 'Gümüş'],
    [gb('bronze'), 'Bronze', 'Bronz'],
    [gb('gold'), 'Gold', 'Altın'],
    [gb('braun'), 'Brown', 'Kahverengi'],
    [gb('rosa'), 'Pink', 'Pembe'],
    [gb('lila|violett'), 'Purple', 'Mor'],
    [gb('türkis'), 'Turquoise', 'Turkuaz'],
    [gb('orange'), 'Orange', 'Turuncu'],
    [gb('beige'), 'Beige', 'Bej'],
    [gb('creme'), 'Cream', 'Krem'],

    // misc connectors
    [gb('mit'), 'with', 'ile'],
    [gb('ohne'), 'without', 'olmadan'],
    [gb('und'), 'and', 've'],
    [gb('oder'), 'or', 'veya'],
    [gb('nur Notruf'), 'emergency only', 'sadece acil arama'],
    [gb('Textnachrichten'), 'text messages', 'kısa mesaj'],
  ];

  // ── 4. Residue detection ──────────────────────────────────────────────────
  // Any of these surviving in an EN/TR output means the glossary missed
  // something → caller should flag / fall back to MT + report.
  const RESIDUE_WORDS = new Set([
    'und', 'mit', 'ohne', 'bis', 'bei', 'werk', 'laden', 'verbaut', 'kabel',
    'kabellos', 'kabelgebunden', 'zertifiziert', 'kerne', 'farben', 'jahr',
    'jahre', 'stunden', 'minuten', 'hinten', 'vorne', 'seitlich', 'innen',
    'aussen', 'offen', 'geschlossen', 'schwarz', 'weiss', 'grau', 'blau',
    'gruen', 'rot', 'braun', 'silber', 'anzeige', 'bildschirm', 'tastatur',
    'sensoren', 'blitz', 'objektiv', 'angabe', 'typisch', 'maximal',
    'mrd', 'mio', 'speicher', 'gehaeuse', 'rueckseite', 'rahmen', 'gewicht',
    'abmessungen', 'farbe', 'betriebssystem', 'aktualisierungsrate',
    'abtastrate', 'aufloesung', 'helligkeit', 'akku', 'akkulaufzeit',
    'ladeleistung', 'schnittstellen', 'schutzart', 'lautsprecher', 'klinke',
    'stecker', 'netzteil', 'notruf', 'nachrichten', 'umgekehrtes', 'gelistet',
    'seit', 'dediziert', 'zyklus', 'wert', 'karte', 'klasse', 'baender',
  ]);
  // Tech tokens that legitimately contain German-looking substrings.
  const PROTECTED = new Set([
    'wlan', 'qi', 'qi2', 'magsafe', 'supervooc', 'airvooc', 'hypercharge',
    'turbocharge', 'turbopower', 'afc', 'hyperos', 'oxygenos', 'oneui',
    'navic', 'oryon', 'kryo', 'cortex', 'adreno', 'xclipse', 'dimensity',
    'exynos', 'snapdragon', 'gorilla', 'victus', 'ceramic', 'shield',
    'subwoofer', 'displayport', 'bluetooth', 'nfc', 'uwb', 'gsm', 'umts',
    'lte', 'esim', 'microsd', 'ufs', 'amoled', 'ltpo', 'oled', 'ips', 'pls',
    'hdr', 'dolby', 'vision', 'vivid', 'beidou', 'galileo', 'glonass', 'qzss',
    'gps', 'aptx', 'ldac', 'lhdc', 'aac', 'sbc', 'lc3', 'mediatek', 'xiaomi',
    'oppo', 'poco', 'motorola', 'samsung', 'apple', 'oneplus', 'mali',
    'edr', 'bar',
  ]);

  function residueCheck(text, lang = 'en') {
    const out = [];
    const t = String(text || '');
    // ö/ü are legitimate TURKISH letters — only ä/ß betray German in TR text.
    const umlautRe = lang === 'tr' ? /[äßÄẞ]/ : /[äöüßÄÖÜẞ]/;
    if (umlautRe.test(t)) out.push('umlaut');
    const folded = foldDe(t);
    for (const token of folded.match(/[a-z]+/g) || []) {
      if (PROTECTED.has(token)) continue;
      if (RESIDUE_WORDS.has(token)) out.push(token);
    }
    return [...new Set(out)];
  }

  // ── 5. Translators ────────────────────────────────────────────────────────
  // Brand phrases that contain rule-translatable words ("Gorilla GLASS",
  // "Ceramic Shield") get masked before rules run, unmasked after — otherwise
  // "Gorilla Glass 7i" would become "Gorilla Cam 7i" on the TR side.
  const MASK_PHRASES = [
    /Gorilla\s+Glass(?:\s+[A-Za-z0-9+]+)*/gi,
    /Ceramic\s+Shield(?:\s+\d+)?/gi,
    /Dragontrail(?:\s+[A-Za-z0-9+]+)?/gi,
    /Panda\s+Glass/gi,
    /Sapphire\s+Glass/gi,
    /Crystal\s+Shield/gi,
  ];

  function translateValueLine(line, lang) {
    let out = cleanText(line);
    if (!out) return '';
    // Pure clock-time lines come from "Gelistet seit" (date + time) — drop.
    if (/^\d{1,2}:\d{2}$/.test(out)) return '';
    const idx = lang === 'tr' ? 2 : 1;
    const masked = [];
    for (const re of MASK_PHRASES) {
      out = out.replace(re, (m) => {
        masked.push(m);
        return `${masked.length - 1}`;
      });
    }
    for (const rule of VALUE_RULES) {
      out = out.replace(rule[0], rule[idx]);
    }
    out = out.replace(/(\d+)/g, (_, n) => masked[Number(n)] ?? '');
    out = out.replace(/\s{2,}/g, ' ').replace(/\s+([,)])/g, '$1').trim();
    return upperFirst(out, lang);
  }

  function translateValue(value, lang) {
    return String(value == null ? '' : value)
      .replace(/\r/g, '\n')
      .split('\n')
      .map((l) => translateValueLine(l, lang))
      .filter(Boolean)
      .join('\n');
  }

  function lookupLabel(label) {
    return LABELS[foldDe(label)] || null;
  }

  function translateLabel(label, lang) {
    const hit = lookupLabel(label);
    if (hit) return lang === 'tr' ? hit.tr : hit.en;
    // Unknown label: run value rules so at least no German survives.
    return translateValueLine(label, lang);
  }

  function canonicalLabel(label) {
    const hit = lookupLabel(label);
    if (hit) return hit.canonical;
    return translateValueLine(label, 'en');
  }

  function translateSection(section, lang) {
    const hit = SECTIONS[foldDe(section)];
    if (hit) return lang === 'tr' ? hit.tr : hit.en;
    return translateValueLine(section, lang);
  }

  // ── 6. Product name (never machine-translate names!) ─────────────────────
  // Geizhals names: "<Brand> <Model> <storage> <color>" — the model part must
  // survive verbatim (MT mangled "Samsung Galaxy Z Flip7 FE" into "Samsung
  // galaxy z Flip7 fe"). Only German color words get swapped.
  const NAME_COLORS = [
    [gb('schwarz'), 'Black', 'Siyah'],
    [gb('weiß|weiss'), 'White', 'Beyaz'],
    [gb('grau'), 'Gray', 'Gri'],
    [gb('blau'), 'Blue', 'Mavi'],
    [gb('dunkelblau'), 'Dark Blue', 'Koyu Mavi'],
    [gb('hellblau'), 'Light Blue', 'Açık Mavi'],
    [gb('grün|gruen'), 'Green', 'Yeşil'],
    [gb('dunkelgrün|dunkelgruen'), 'Dark Green', 'Koyu Yeşil'],
    [gb('rot'), 'Red', 'Kırmızı'],
    [gb('gelb'), 'Yellow', 'Sarı'],
    [gb('silber'), 'Silver', 'Gümüş'],
    [gb('gold'), 'Gold', 'Altın'],
    [gb('bronze'), 'Bronze', 'Bronz'],
    [gb('braun'), 'Brown', 'Kahverengi'],
    [gb('rosa'), 'Pink', 'Pembe'],
    [gb('pink'), 'Pink', 'Pembe'],
    [gb('lila|violett'), 'Purple', 'Mor'],
    [gb('türkis'), 'Turquoise', 'Turkuaz'],
    [gb('beige'), 'Beige', 'Bej'],
    [gb('creme'), 'Cream', 'Krem'],
    [gb('mint'), 'Mint', 'Mint'],
  ];

  function translateName(name, lang) {
    let out = cleanText(name);
    if (!out) return out;
    if (lang === 'de') return out;
    const idx = lang === 'tr' ? 2 : 1;
    for (const rule of NAME_COLORS) out = out.replace(rule[0], rule[idx]);
    // English color words at the tail get Title Case ("pitch black" → "Pitch Black").
    out = out.replace(/\b(pitch|midnight|phantom|titanium|graphite|obsidian|onyx|cosmic|mystic|aura|jade|ice|sky|ocean|forest|desert|lunar|stellar|shadow|pearl|frost|black|white|gray|grey|blue|green|red|silver|gold|purple|pink|yellow|orange|teal|cyan|violet|lavender|coral|mint|cream|beige|charcoal|sand|stone|snow|rose)\b/gi,
      (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    return upperFirst(out, lang);
  }

  // ── 7. Whole-product build ────────────────────────────────────────────────
  // Input: raw German source maps. Output: every per-language artifact the
  // catalog needs, plus a residue report (must be empty for a clean product).
  function buildProductTranslations(product) {
    const srcSpecs = (product.sourceSpecs && typeof product.sourceSpecs === 'object' && Object.keys(product.sourceSpecs).length
      ? product.sourceSpecs : product.specs) || {};
    const srcSections = (product.sourceSpecSections && typeof product.sourceSpecSections === 'object' && Object.keys(product.sourceSpecSections).length
      ? product.sourceSpecSections : product.specSections) || {};
    const residues = [];
    const checkOut = (where, text, lang = 'en') => {
      const r = residueCheck(text, lang);
      if (r.length) residues.push({ where, text: String(text).slice(0, 120), tokens: r });
    };

    // Canonical-English flat specs + sections.
    const specs = {};
    const specSections = {};
    for (const [sec, body] of Object.entries(srcSections)) {
      const enSec = translateSection(sec, 'en');
      specSections[enSec] = specSections[enSec] || {};
      if (body && typeof body === 'object') {
        for (const [k, v] of Object.entries(body)) {
          const ck = canonicalLabel(k);
          const ev = translateValue(v, 'en');
          if (!ck || !ev) continue;
          specSections[enSec][ck] = ev;
          specs[ck] = ev;
          checkOut(`specs.${ck}`, ck); checkOut(`specs.${ck}`, ev);
        }
      }
    }
    for (const [k, v] of Object.entries(srcSpecs)) {
      const ck = canonicalLabel(k);
      if (specs[ck]) continue;
      const ev = translateValue(v, 'en');
      if (!ck || !ev) continue;
      specs[ck] = ev;
      (specSections.General = specSections.General || {})[ck] = ev;
      checkOut(`specs.${ck}`, ck); checkOut(`specs.${ck}`, ev);
    }

    // Per-language atom maps. Keys: raw source atoms (exactly as stored, so
    // admin/source-view lookups hit) AND canonical-EN atoms (so the website's
    // TR view, which renders canonical-EN sections, hits too).
    const multiLangSpecs = { en: {}, tr: {} };
    const addAtom = (raw, en, tr) => {
      const variants = [raw, cleanText(raw)];
      for (const key of variants) {
        if (!key) continue;
        if (en && en !== key) multiLangSpecs.en[key] = en;
        if (tr && tr !== key) multiLangSpecs.tr[key] = tr;
      }
      // canonical-EN keyed TR entry (website TR view).
      if (en && tr && en !== tr) multiLangSpecs.tr[en] = tr;
    };
    const collect = (k, v) => {
      addAtom(k, translateLabel(k, 'en'), translateLabel(k, 'tr'));
      const vs = String(v == null ? '' : v);
      addAtom(vs, translateValue(vs, 'en'), translateValue(vs, 'tr'));
      if (vs.includes('\n')) {
        for (const line of vs.split('\n')) {
          addAtom(line.trim(), translateValueLine(line, 'en'), translateValueLine(line, 'tr'));
        }
      }
      checkOut(`tr:${k}`, translateLabel(k, 'tr'), 'tr');
      checkOut(`tr:${k}.value`, translateValue(vs, 'tr'), 'tr');
    };
    for (const [k, v] of Object.entries(srcSpecs)) collect(k, v);
    for (const [sec, body] of Object.entries(srcSections)) {
      if (body && typeof body === 'object') for (const [k, v] of Object.entries(body)) collect(k, v);
    }

    const multiLangSections = { en: {}, tr: {} };
    for (const sec of Object.keys(srcSections)) {
      multiLangSections.en[sec] = translateSection(sec, 'en');
      multiLangSections.tr[sec] = translateSection(sec, 'tr');
      checkOut(`section:${sec}`, multiLangSections.tr[sec], 'tr');
    }

    const name = cleanText(product.sourceName || product.name || '');
    const nameTranslated = {
      de: name,
      en: translateName(name, 'en'),
      tr: translateName(name, 'tr'),
    };
    checkOut('name.en', nameTranslated.en);

    return { specs, specSections, multiLangSpecs, multiLangSections, nameTranslated, residues };
  }

  return {
    VERSION,
    cleanText,
    upperFirst,
    foldDe,
    translateValueLine,
    translateValue,
    translateLabel,
    canonicalLabel,
    translateSection,
    translateName,
    residueCheck,
    buildProductTranslations,
    LABELS,
    SECTIONS,
  };
});
