// Spec rows that must NEVER render anywhere (app + web): volatile benchmark
// scores (AnTuTu / DXOMark / Geekbench / PassMark / 3DMark…) that go stale the
// moment they are scraped, and Turkey-only availability fields ("Durum: Henüz
// Ülkemizde Satışı Yok"). Mirrors lib/core/spec_corrections.dart isHiddenSpec()
// and scripts/clean_benchmark_specs.js. Filtered at DISPLAY time so a re-scrape
// can never resurface them.
const HIDDEN_BENCH_RE = /\b(?:antutu|an\s*tu\s*tu|dxomark|dxo\s*mark|geekbench|benchmark|passmark|pcmark|3dmark|cinebench|basemark|gfxbench|ai\s*benchmark)\b/i;
const HIDDEN_TR_RE = /(ülkemiz|ulkemiz|satış[ıi]?\s*yok|satis[ıi]?\s*yok|yurt\s*d[ıi]ş[ıi]|yurtdış)/i;
// Epey sponsored-widget leakage: ad-block rows scraped into keySpecs carried
// the literal badge text ("Ekran Boyutu: Sponsorlu"). Data is repaired at the
// source, but never render such a row again even if a bad scrape slips in.
const HIDDEN_SPONSOR_RE = /\b(?:sponsorlu|sponsored)\b/i;
export function isHiddenSpec(label, value) {
  const l = String(label || '');
  const v = String(value || '');
  if (HIDDEN_BENCH_RE.test(`${l} ${v}`)) return true;
  if (HIDDEN_TR_RE.test(`${l} ${v}`)) return true;
  if (HIDDEN_SPONSOR_RE.test(`${l} ${v}`)) return true;
  const cl = l.replace(/\s*:\s*$/, '').trim().toLowerCase();
  if (cl === 'durum' || cl === 'status') return true; // Epey TR sales-status row
  return false;
}

const LABELS = {
  tr: {
    '5G': '5G',
    '4G': '4G',
    '2G': '2G',
    '3G': '3G',
    'Audio Output': 'Ses çıkışı',
    'Announcement Date': 'Duyuru tarihi',
    'Battery capacity': 'Pil kapasitesi',
    'Battery cycle life': 'Pil şarj döngüsü',
    'Battery Specifications': 'Pil özellikleri',
    'Battery Technology': 'Pil teknolojisi',
    'Bluetooth': 'Bluetooth',
    'Brightness': 'Parlaklık',
    'Camera aperture': 'Kamera diyaframı',
    'Charging port': 'Şarj portu',
    'Chipset': 'Yonga seti',
    'Color': 'Renk',
    'CPU cores': 'CPU çekirdeği',
    'CPU frequency': 'CPU frekansı',
    'Dimensions': 'Boyutlar',
    'Display / Body Ratio': 'Ekran/gövde oranı',
    'Display Size': 'Ekran boyutu',
    'Fast charging': 'Hızlı şarj',
    'Fast charging features': 'Hızlı şarj özellikleri',
    'Fast charging power': 'Hızlı şarj gücü',
    'Front camera': 'Ön kamera',
    'GPU': 'GPU',
    'Height': 'Yükseklik',
    'Main camera': 'Ana kamera',
    'NFC': 'NFC',
    'Operating system': 'İşletim sistemi',
    'Optical Image Stabilization (OIS)': 'Optik görüntü sabitleme (OIS)',
    'Optical Image Stabilizer (OIS)': 'Optik görüntü sabitleyici (OIS)',
    'Panel type': 'Panel türü',
    'Pixel density': 'Piksel yoğunluğu',
    'Processor': 'İşlemci',
    'Processor family': 'İşlemci ailesi',
    'RAM': 'RAM',
    'RAM type': 'RAM türü',
    'Refresh rate': 'Yenileme hızı',
    'Removable battery': 'Çıkarılabilir pil',
    'Resolution': 'Çözünürlük',
    'SAR Value 10g (Head)': 'SAR değeri 10g (baş)',
    'Screen size': 'Ekran boyutu',
    'Sensors': 'Sensörler',
    'SIM': 'SIM',
    'SIM Count': 'SIM sayısı',
    'Speakers': 'Hoparlörler',
    'Storage': 'Depolama',
    'Storage type': 'Depolama türü',
    'Thickness': 'Kalınlık',
    'USB': 'USB',
    'USB-C charging': 'USB-C şarj',
    'Video playback': 'Video oynatma',
    'Video recording': 'Video kaydı',
    'Water resistance': 'Suya dayanıklılık',
    'Weight': 'Ağırlık',
    'Wi-Fi': 'Wi-Fi',
    'Width': 'Genişlik',
    'Wireless charging': 'Kablosuz şarj',
    // ── Section titles (canonical English → Turkish) — Geizhals products store
    //    specs in English, so these section headers need TR on the .tr view.
    'General': 'Genel',
    'General information': 'Genel bilgiler',
    'General features': 'Genel özellikler',
    'Graphics': 'Grafik',
    'Graphics processor': 'Grafik işlemcisi',
    'Memory': 'Bellek',
    'Memory features': 'Bellek özellikleri',
    'Memory & storage': 'Bellek & depolama',
    'Camera': 'Kamera',
    'Battery': 'Pil',
    'Power': 'Güç',
    'Battery / Power': 'Pil / Güç',
    'Display features': 'Ekran özellikleri',
    'Connectivity': 'Bağlantı',
    'Connections': 'Bağlantılar',
    'Connectivity features': 'Bağlantı özellikleri',
    'Ports': 'Bağlantı noktaları',
    'Network': 'Ağ',
    'Network connections': 'Ağ bağlantıları',
    'Design': 'Tasarım',
    'Design & dimensions': 'Tasarım & boyutlar',
    'Audio': 'Ses',
    'Audio features': 'Ses özellikleri',
    'Software': 'Yazılım',
    'Software / Operating system': 'Yazılım / İşletim sistemi',
    'Performance': 'Performans',
    'Documents': 'Belgeler',
    'Documents / Software': 'Belgeler / Yazılım',
    'Release & Pricing': 'Çıkış & Fiyat',
    'Release': 'Çıkış',
    'Highlights': 'Öne çıkanlar',
    'Chip / Processor': 'Yonga / İşlemci',
    // ── Common labels (English → Turkish) ──
    'Form factor': 'Biçim faktörü',
    'Free fall': 'Düşme dayanımı',
    'Interfaces': 'Arayüzler',
    'Interface': 'Arayüz',
    'Modem': 'Modem',
    'Material': 'Malzeme',
    'SoC': 'Yonga (SoC)',
    'Protection rating': 'Koruma sınıfı',
    'Repairability class': 'Onarılabilirlik sınıfı',
    'Energy efficiency class': 'Enerji verimliliği sınıfı',
    'SAR value': 'SAR değeri',
    'SIM card': 'SIM kartı',
    'Battery life per cycle': 'Döngü başına pil ömrü',
    'Battery endurance': 'Pil dayanıklılığı',
    'Navigation': 'Navigasyon',
    'Rear camera': 'Arka kamera',
    'Internal storage': 'Dahili depolama',
    'Connection': 'Bağlantı',
    // ── Canonical-EN Geizhals labels (post 2026-06-10 glossary rebuild) ──
    'Listed since': 'Listelenme tarihi',
    'Free fall reliability class': 'Düşme dayanıklılık sınıfı',
    'Frequency bands': 'Frekans bantları',
    'Screen-to-body ratio': 'Ekran/gövde oranı',
    'Battery cycle life': 'Pil şarj döngüsü',
    'Battery': 'Pil',
  },
};

const TR_WORDS = [
  [/\bbattery\b/gi, 'pil'],
  [/\bcapacity\b/gi, 'kapasitesi'],
  [/\bcamera\b/gi, 'kamera'],
  [/\bcharging\b/gi, 'şarj'],
  [/\bdisplay\b/gi, 'ekran'],
  [/\bscreen\b/gi, 'ekran'],
  [/\bfrequency\b/gi, 'frekansı'],
  [/\bprocessor\b/gi, 'işlemci'],
  [/\bstorage\b/gi, 'depolama'],
  [/\bweight\b/gi, 'ağırlık'],
  [/\bwidth\b/gi, 'genişlik'],
  [/\bheight\b/gi, 'yükseklik'],
  [/\btype\b/gi, 'türü'],
  [/\bcount\b/gi, 'sayısı'],
  [/\bfeatures?\b/gi, 'özellikleri'],
  [/\btechnology\b/gi, 'teknolojisi'],
  [/\bspecifications?\b/gi, 'özellikleri'],
  // Old MT glued the Turkish possessive onto the English stem ("Bluetooth
  // Specificationsi", "Kamera Featuresi") so the plain rules above never fired.
  // These exact strings can only ever be scrape residue — safe to always fold.
  [/\bspecificationsi\b/gi, 'özellikleri'],
  [/\bfeaturesi\b/gi, 'özellikleri'],
  [/\btechnologysi\b/gi, 'teknolojisi'],
  [/\boperating system\b/gi, 'işletim sistemi'],
  [/\bannouncement date\b/gi, 'duyuru tarihi'],
];



// German spec words that leak through on Geizhals-sourced products (the DE
// scrape dictionary is tiny, so the German source text often survives). These
// are scrubbed at display time so a Turkish/English visitor never sees German.
// Order: longest phrases first so partials don't pre-empt full matches.
const DE_RESIDUE = [
  // charging / battery
  [/\bumgekehrtes\s+laden\b/gi, { tr: 'Ters şarj', en: 'Reverse charging' }],
  [/\bkabelloses\s+laden\b/gi, { tr: 'Kablosuz şarj', en: 'Wireless charging' }],
  [/\bkabelgebunden(?:es)?\b/gi, { tr: 'kablolu', en: 'wired' }],
  [/\bfest\s+verbaut\b/gi, { tr: 'sabit', en: 'built-in' }],
  [/\bbuilt-?in\b/gi, { tr: 'Dahili', en: 'Built-in' }],
  [/\bschnellladen\b/gi, { tr: 'Hızlı şarj', en: 'Fast charging' }],
  [/\bakkulaufzeit\b/gi, { tr: 'Pil ömrü', en: 'Battery life' }],
  [/\bladezyklen\b/gi, { tr: 'şarj döngüsü', en: 'charge cycles' }],
  [/\bladedauer\b/gi, { tr: 'Şarj süresi', en: 'Charging time' }],
  [/\bakku\b/gi, { tr: 'Pil', en: 'Battery' }],
  // SAR / body
  [/\bkopf\b/gi, { tr: 'baş', en: 'head' }],
  [/\bkörper\b/gi, { tr: 'vücut', en: 'body' }],
  // form factor / material
  [/\bbarren\b/gi, { tr: 'Düz (bar)', en: 'Bar' }],
  [/\bkunststoff\b/gi, { tr: 'Plastik', en: 'Plastic' }],
  [/\bedelstahl\b/gi, { tr: 'Paslanmaz çelik', en: 'Stainless steel' }],
  [/\baluminium\b/gi, { tr: 'Alüminyum', en: 'Aluminium' }],
  [/\bglas\b/gi, { tr: 'Cam', en: 'Glass' }],
  [/\brahmen\b/gi, { tr: 'Çerçeve', en: 'Frame' }],
  [/\brückseite\b/gi, { tr: 'arka', en: 'back' }],
  // camera
  [/\bweitwinkelobjektiv\b/gi, { tr: 'Geniş açı objektifi', en: 'Wide-angle lens' }],
  [/\bultraweitwinkel\b/gi, { tr: 'Ultra geniş açı', en: 'Ultra-wide' }],
  [/\bweitwinkel\b/gi, { tr: 'Geniş açı', en: 'Wide-angle' }],
  [/\bteleobjektiv\b/gi, { tr: 'Telefoto', en: 'Telephoto' }],
  [/\bhauptkamera\b/gi, { tr: 'Ana kamera', en: 'Main camera' }],
  [/\bfrontkamera\b/gi, { tr: 'Ön kamera', en: 'Front camera' }],
  [/\bdual-?led-?blitz\b/gi, { tr: 'Çift LED flaş', en: 'Dual-LED flash' }],
  [/\bled-?blitz\b/gi, { tr: 'LED flaş', en: 'LED flash' }],
  [/\bblitz\b/gi, { tr: 'Flaş', en: 'Flash' }],
  [/\bphasenerkennung\b/gi, { tr: 'Faz algılama', en: 'Phase detection' }],
  [/\bautofokus\b/gi, { tr: 'Otomatik odaklama', en: 'Autofocus' }],
  // os / updates
  [/\bbetriebssystem-?updates?\b/gi, { tr: 'İşletim sistemi güncellemeleri', en: 'OS updates' }],
  [/\bsicherheits?-?updates?\b/gi, { tr: 'Güvenlik güncellemeleri', en: 'Security updates' }],
  [/\bbetriebssystem\b/gi, { tr: 'İşletim sistemi', en: 'Operating system' }],
  [/\bjahre\b/gi, { tr: 'yıl', en: 'years' }],
  [/\bab\s+werk\b/gi, { tr: 'fabrika çıkışı', en: 'factory' }],
  // sensors
  [/\bbeschleunigungssensor\b/gi, { tr: 'İvmeölçer', en: 'Accelerometer' }],
  [/\bgyroskop\b/gi, { tr: 'Jiroskop', en: 'Gyroscope' }],
  [/\bannäherungssensor\b/gi, { tr: 'Yakınlık sensörü', en: 'Proximity sensor' }],
  [/\bhelligkeitssensor\b/gi, { tr: 'Işık sensörü', en: 'Light sensor' }],
  [/\bfingerabdrucksensor\b/gi, { tr: 'Parmak izi sensörü', en: 'Fingerprint sensor' }],
  [/\bkompass\b/gi, { tr: 'Pusula', en: 'Compass' }],
  // connectivity / misc
  [/\bschnittstelle\b/gi, { tr: 'Arayüz', en: 'Interface' }],
  [/\banschluss\b/gi, { tr: 'Bağlantı', en: 'Connection' }],
  [/\breparierbarkeitsklasse\b/gi, { tr: 'Onarılabilirlik sınıfı', en: 'Repairability class' }],
  [/\bfreifall\b/gi, { tr: 'Düşme', en: 'Free fall' }],
  [/\bspeicher\b/gi, { tr: 'Depolama', en: 'Storage' }],
  [/\bzoll\b/gi, { tr: 'İnç', en: 'inch' }],
  [/\bstück\b/gi, { tr: 'Adet', en: 'pcs' }],
  [/\bstunden\b/gi, { tr: 'saat', en: 'hours' }],
  [/\btage\b/gi, { tr: 'gün', en: 'days' }],
  // leaked English in a non-EN context
  [/\bphase\b/gi, { tr: 'Faz', en: 'Phase' }],
  [/\bvideos\b/gi, { tr: 'Videolar', en: 'Videos' }],
];

// German spec LABELS that leak on Geizhals products (applied to labels only).
const DE_LABEL_RESIDUE = [
  [/\bkamera\s+hinten\b/gi, { tr: 'Arka kamera', en: 'Rear camera' }],
  [/\bkamera\s+vorne\b/gi, { tr: 'Ön kamera', en: 'Front camera' }],
  [/\bakkulaufzeit\s+pro\s+zyklus\b/gi, { tr: 'Döngü başına pil ömrü', en: 'Battery life per cycle' }],
  [/\bbatterieausdauer\b/gi, { tr: 'Pil dayanıklılığı', en: 'Battery endurance' }],
  [/\benergieeffizienzklasse\b/gi, { tr: 'Enerji verimliliği sınıfı', en: 'Energy efficiency class' }],
  [/\bschutzart\b/gi, { tr: 'Koruma sınıfı', en: 'Protection rating' }],
  [/\bsar[\s-]?wert\b/gi, { tr: 'SAR değeri', en: 'SAR value' }],
  [/\bnavigation\b/gi, { tr: 'Navigasyon', en: 'Navigation' }],
  [/\bsensoren\b/gi, { tr: 'Sensörler', en: 'Sensors' }],
  [/\bsim[\s-]?karte\b/gi, { tr: 'SIM kartı', en: 'SIM card' }],
  [/\babmessungen\b/gi, { tr: 'Boyutlar', en: 'Dimensions' }],
  [/\bgewicht\b/gi, { tr: 'Ağırlık', en: 'Weight' }],
  [/\bbetriebssystem\b/gi, { tr: 'İşletim sistemi', en: 'Operating system' }],
  [/\barbeitsspeicher\b/gi, { tr: 'RAM', en: 'RAM' }],
  [/\binterner\s+speicher\b/gi, { tr: 'Dahili depolama', en: 'Internal storage' }],
  [/\banschlüsse\b/gi, { tr: 'Bağlantılar', en: 'Connections' }],
  [/\bmaterial\b/gi, { tr: 'Malzeme', en: 'Material' }],
];

// Uppercase the first visible letter of a value line (Turkish-aware), so every
// spec reads "Sabit takılı" / "Dahili" rather than "sabit takılı" / "built-in".
function upperFirst(text, code) {
  const s = String(text || '');
  const i = s.search(/[\p{L}\p{N}]/u);
  if (i === -1) return s;
  const ch = s[i];
  const up = code === 'tr' ? ch.toLocaleUpperCase('tr-TR') : ch.toUpperCase();
  return s.slice(0, i) + up + s.slice(i + 1);
}

function cleanupLabel(label) {
  let out = String(label || '')
    .normalize('NFC')
    .replace(/&amp;/gi, '&')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&\s*apos\s*;\s*s\b/gi, '')
    .replace(/\bapos\s*;\s*s\b/gi, '')
    .replace(/\bamp\s*;\s*apos\s*;\s*s\b/gi, '')
    .replace(/&\s*'\s*s\b/gi, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Source junk: dangling close-paren without an opener ("Kullanım Kılavuzu)")
  // and trailing colons ("Response Time:").
  if (out.includes(')') && !out.includes('(')) out = out.replace(/\)+/g, ' ').replace(/\s+/g, ' ').trim();
  return out.replace(/\s*:\s*$/, '');
}

function titleCase(text) {
  // ASCII \b breaks on Turkish: lowercase 'İ' is i + combining dot, so the
  // letter AFTER the mark sat on a word boundary and got uppercased too —
  // "(İnç)" rendered as "(İNç)". Only uppercase a-z not preceded by a letter
  // or combining mark.
  return cleanupLabel(text).replace(/(?<![\p{L}\p{M}])[a-z]/gu, (c) => c.toUpperCase());
}

// Turkish words that survive inside half-translated EN labels coming from old
// MT runs ("Display Boyutu (İnç)"). The admin modal repairs these at display
// time; the site must read identically — admin is the reference.
const TR_LABEL_RESIDUE_EN = [
  [/\bdiger\b/gi, 'other'],
  [/\bdiğer\b/gi, 'other'],
  [/\bozelligi\b/gi, 'feature'],
  [/\bözelliği\b/gi, 'feature'],
  [/\bozellik\b/gi, 'feature'],
  [/\bözellik\b/gi, 'feature'],
  [/\bkart\s+okuyucu\b/gi, 'card reader'],
  [/\bokuyucu\b/gi, 'reader'],
  [/\bklavye\b/gi, 'keyboard'],
  [/\bpil\b/gi, 'battery'],
  [/\bbatarya\b/gi, 'battery'],
  [/\bekran\b/gi, 'screen'],
  [/\bdahili\b/gi, 'internal'],
  [/\bdepolama\b/gi, 'storage'],
  [/\bgrafik\b/gi, 'graphics'],
  [/\bboyutu\b/gi, 'size'],
  [/\bboyut\b/gi, 'size'],
  [/\bteknolojisi\b/gi, 'technology'],
  [/\bsayısı\b/gi, 'count'],
  [/\bsayisi\b/gi, 'count'],
  [/\badedi\b/gi, 'count'],
  [/\bhızı\b/gi, 'rate'],
  [/\bhizi\b/gi, 'rate'],
  [/\bsüresi\b/gi, 'time'],
  [/\bsuresi\b/gi, 'time'],
  [/\bözellikleri\b/gi, 'features'],
  [/\bozellikleri\b/gi, 'features'],
  [/\bözellikler\b/gi, 'features'],
  [/\bgirişi\b/gi, 'input'],
  [/\bgiriş\b/gi, 'input'],
  [/\bçıkışı\b/gi, 'output'],
  [/\bversiyonu\b/gi, 'version'],
  [/\bkapasitesi\b/gi, 'capacity'],
  [/\bgücü\b/gi, 'power'],
  [/\bgucu\b/gi, 'power'],
  [/\btüketimi\b/gi, 'consumption'],
  [/\bağırlığı\b/gi, 'weight'],
  [/\byüksekliği\b/gi, 'height'],
  [/\bgenişliği\b/gi, 'width'],
  [/\bderinliği\b/gi, 'depth'],
  [/\bkılavuzu\b/gi, 'manual'],
  [/\bkilavuzu\b/gi, 'manual'],
  [/\bkullanım\b/gi, 'user'],
  [/\bkullanim\b/gi, 'user'],
  // JS /i cannot case-fold dotted İ, so spell the variants out.
  [/\(\s*[İIıi]n[çc]\s*\)/g, '(inches)'],
  [/\b[İIıi]n[çc]\b/g, 'inches'],
  [/[öOo]zell[İiı]kler[İiı]?/gi, 'features'],
  [/ÖZELL[İI]KLER/g, 'features'],
  // Old MT glued Turkish possessive endings onto English words.
  [/\bspecificationsi\b/gi, 'specifications'],
  [/\bfeaturesi\b/gi, 'features'],
  [/\btechnologysi\b/gi, 'technology'],
  [/\bve\b/gi, 'and'],
  [/\bsınıfı\b/gi, 'class'],
  [/\bsinifi\b/gi, 'class'],
  [/\boranı\b/gi, 'ratio'],
  [/\byılı\b/gi, 'year'],
  [/\byili\b/gi, 'year'],
  [/\brengi\b/gi, 'color'],
  [/\bmalzemesi\b/gi, 'material'],
  [/\bdesteği\b/gi, 'support'],
  [/\bdestegi\b/gi, 'support'],
  [/\bgenel\b/gi, 'general'],
  [/\barka\s+plan\b/gi, 'background'],
];
function scrubTurkishLabelResidueEn(text) {
  let out = String(text || '');
  // Suffix-blind gate: "Teknolojisi"/"Boyutu" are stems + Turkish possessive,
  // so no trailing \b — substring match is the point here.
  if (!/[çğışöüÇĞİŞÜı]|boyut|teknoloji|sayis|adet|hiz[ıi]|sures|ozellik|ozellig|giris|kilavuz|specificationsi|featuresi|technologysi|diger|kart\s+okuyucu|okuyucu|klavye|pil|batarya|ekran|depolama|dahili|grafik|arka\s+plan/i.test(out)) return out;
  for (const [re, rep] of TR_LABEL_RESIDUE_EN) out = out.replace(re, rep);
  // Anything still carrying Turkish-only letters gets ASCII-folded so the EN
  // view never shows İ/ş/ğ ("KullanıM" can't happen again).
  out = out
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .replace(/Ş/g, 'S').replace(/ş/g, 's')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
    .replace(/Ç/g, 'C').replace(/ç/g, 'c')
    .replace(/Ö/g, 'O').replace(/ö/g, 'o')
    .replace(/Ü/g, 'U').replace(/ü/g, 'u');
  return out.replace(/\s+/g, ' ').trim();
}

// Turkish VALUE atoms that leak on the EN view when a product was scraped but
// not (fully) bulk-translated — e.g. "3 Adet Mikrofon", "Yüksek Empedanslı
// Kulaklık Supportli 3.5mm Jak", "Fast Kaydırmalı Touchpad", "Dolby Atmos İle
// Uzamsal Audio". The admin modal translates these at display time; the site
// must read identically. Multi-word phrases first so partials don't pre-empt
// full matches. JS /i cannot case-fold dotted İ, so İ-initial words are spelled
// out explicitly.
// [pattern source, replacement]. Compiled below with Unicode-aware word
// boundaries — JS \b treats ı/İ/ş/ğ/ç/ö/ü as NON-word chars, so "\bEmpedanslı\b"
// and "\bİle\b" never matched. Longest phrases first.
const TR_VALUE_ATOMS = [
  // multi-word phrases
  ['gürültü\\s+engelleme(?:li)?', 'noise cancellation'],
  ['gürültü\\s+önleme(?:li)?', 'noise cancellation'],
  ['ultra\\s+geniş\\s+açı', 'ultra-wide angle'],
  ['geniş\\s+açı', 'wide angle'],
  ['kart\\s+okuyucu', 'card reader'],
  ['parmak\\s+izi', 'fingerprint'],
  ['dokunmatik\\s+yüzey', 'touchpad'],
  ['arka\\s+aydınlatma(?:lı)?', 'backlight'],
  ['[İi]şık\\s+sensörü', 'light sensor'],
  ['yakınlık\\s+sensörü', 'proximity sensor'],
  ['ortam\\s+ışık\\s+sensörü', 'ambient light sensor'],
  ['hızlı\\s+şarj', 'fast charging'],
  ['kablosuz\\s+şarj', 'wireless charging'],
  ['ters\\s+şarj', 'reverse charging'],
  ['çift\\s+sim', 'dual SIM'],
  ['paslanmaz\\s+çelik', 'stainless steel'],
  ['çift\\s+led', 'dual-LED'],
  // audio
  ['mikrofon', 'microphone'],
  ['kulaklık', 'headphone'],
  ['hoparlör(?:ler)?', 'speaker'],
  ['empedanslı', 'impedance'],
  ['empedans', 'impedance'],
  ['uzamsal', 'spatial'],
  ['jak', 'jack'],
  ['sesli', 'voice'],
  // generic adjectives / connectors
  ['yüksek', 'high'],
  ['düşük', 'low'],
  ['destekli', 'supported'],
  ['supportli', 'supported'],
  ['destekleniyor', 'supported'],
  ['desteği', 'support'],
  ['destek', 'support'],
  ['kaydırmalı', ''],
  ['[İi]le', 'with'],
  ['otomatik', 'automatic'],
  ['manuel', 'manual'],
  ['harici', 'external'],
  ['üçlü', 'triple'],
  ['dörtlü', 'quad'],
  // build / camera / display vocab
  ['alüminyum', 'aluminium'],
  ['plastik', 'plastic'],
  ['çerçeve', 'frame'],
  ['gövde', 'body'],
  ['kavisli', 'curved'],
  ['çentik', 'notch'],
  ['kablosuz', 'wireless'],
  ['kablolu', 'wired'],
  ['şarj', 'charging'],
  ['aydınlatma(?:lı)?', 'lighting'],
  // count word: "3 Adet Mikrofon" → "3 microphone"
  ['adet', ''],
  ['dakika', 'minutes'],
];
const TR_VALUE_RESIDUE_EN = TR_VALUE_ATOMS.map(([src, rep]) => [
  new RegExp('(?<![\\p{L}\\p{N}])(?:' + src + ')(?![\\p{L}\\p{N}])', 'giu'),
  rep,
]);

function scrubTurkishValueResidueEn(text) {
  let out = String(text || '');
  if (!/[çğışöüİÇĞŞÖÜ]|\b(?:adet|mikrofon|hoparl|kulakl|empedans|uzamsal|jak|sesli|destek|supportli|kaydir|yuksek|dusuk|otomatik|manuel|harici|aluminyum|plastik|cerceve|govde|kavisli|centik|sarj|aydinlat|paslanmaz|gurultu|yakinlik|parmak|dokunmatik|kart\s+okuyucu)\b/i.test(out)) {
    return out;
  }
  for (const [re, rep] of TR_VALUE_RESIDUE_EN) out = out.replace(re, rep);
  // Anything still carrying Turkish-only letters is folded to ASCII so the EN
  // view never shows İ/ş/ğ/ç/ö/ü.
  out = out
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .replace(/Ş/g, 'S').replace(/ş/g, 's')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
    .replace(/Ç/g, 'C').replace(/ç/g, 'c')
    .replace(/Ö/g, 'O').replace(/ö/g, 'o')
    .replace(/Ü/g, 'U').replace(/ü/g, 'u');
  return out.replace(/\s{2,}/g, ' ').trim();
}

// Case-insensitive index of the LABELS maps so an UPPERCASE section header like
// "GENERAL" or a lowercase "general" both resolve to the curated translation.
const _LABEL_CI = {};
for (const code of Object.keys(LABELS)) {
  _LABEL_CI[code] = {};
  for (const [k, v] of Object.entries(LABELS[code])) {
    const lk = k.toLowerCase();
    if (!(lk in _LABEL_CI[code])) _LABEL_CI[code][lk] = v;
  }
}
function ciLabel(code, clean) {
  return _LABEL_CI[code]?.[String(clean || '').toLowerCase()] || '';
}

function labelCase(text, locale = 'en-US') {
  return cleanupLabel(text)
    .split(' ')
    .map((word) => {
      if (!word) return word;
      if (/^[A-Z0-9][A-Z0-9+.-]*$/.test(word)) return word;
      return word.charAt(0).toLocaleUpperCase(locale) + word.slice(1);
    })
    .join(' ');
}

export function localizedSpecLabel(label, lang = 'en') {
  const rawCode = String(lang || 'en').slice(0, 2).toLowerCase();
  // Specs are never shown in German — a German UI reads specs in English
  // (the German spec translation was removed). German source residue is still
  // scrubbed below so it never leaks onto the TR/EN views.
  const code = rawCode === 'tr' ? 'tr' : 'en';
  const clean = cleanupLabel(label);
  if (!clean) return '';
  const exact = LABELS[code]?.[clean] || LABELS[code]?.[titleCase(clean)] || ciLabel(code, clean);
  if (exact) return exact;
  if (code !== 'tr') {
    // English view: scrub German (Geizhals) AND half-translated Turkish
    // (Epey) residue — the admin modal repairs both, and the site must
    // match the admin output exactly.
    let outEn = clean;
    for (const [re, map] of DE_LABEL_RESIDUE) outEn = outEn.replace(re, map.en);
    for (const [re, map] of DE_RESIDUE) outEn = outEn.replace(re, map.en);
    outEn = scrubTurkishLabelResidueEn(outEn);
    if (/^[A-Z0-9\s&/'().+-]+$/.test(outEn) && /[A-Z]{3,}/.test(outEn)) {
      outEn = outEn.toLowerCase();
    }
    // Units stay lowercase after title-casing ("(cm)", "3.5mm"), acronyms
    // stay uppercase ("USB", not "Usb") — matches the admin modal output.
    return titleCase(outEn)
      .replace(/\((Cm|Mm|Ms|Kg|Gr|Gb|Tb)\)/g, (m) => m.toLowerCase())
      .replace(/\b(\d+(?:\.\d+)?)(Mm|Cm|Ms|Kg|Gb|Tb|Hz|Khz|Mhz|Ghz|Kwh|Kw|W)\b/g, (m, n, u) => n + u.toLowerCase())
      .replace(/\bUsb\b/g, 'USB')
      .replace(/\bVga\b/g, 'VGA')
      .replace(/\bHdmi\b/g, 'HDMI')
      .replace(/\bHdr\b/g, 'HDR')
      .replace(/\bSdr\b/g, 'SDR')
      .replace(/\bKvm\b/g, 'KVM')
      .replace(/\bRgb\b/g, 'RGB')
      .replace(/\bCpu\b/g, 'CPU')
      .replace(/\bGpu\b/g, 'GPU')
      .replace(/\bRam\b/g, 'RAM')
      .replace(/\bNfc\b/g, 'NFC')
      .replace(/\bSsd\b/g, 'SSD')
      .replace(/\bHdd\b/g, 'HDD')
      .replace(/\bOled\b/g, 'OLED')
      .replace(/\bLed\b/g, 'LED')
      .replace(/\bLcd\b/g, 'LCD')
      .replace(/\bUhd\b/g, 'UHD')
      .replace(/\bFhd\b/g, 'FHD')
      .replace(/\bQhd\b/g, 'QHD')
      .replace(/\bVesa\b/g, 'VESA')
      .replace(/\bAmd\b/g, 'AMD')
      .replace(/\bDci\b/g, 'DCI')
      .replace(/\bSrgb\b/g, 'sRGB')
      .replace(/\bWifi\b/g, 'Wi-Fi')
      .replace(/\bWi Fi\b/g, 'Wi-Fi')
      .replace(/\bMacos\b/g, 'macOS');
  }
  let out = clean;
  for (const [re, map] of DE_LABEL_RESIDUE) out = out.replace(re, map.tr);
  for (const [re, map] of DE_RESIDUE) out = out.replace(re, map.tr);
  for (const [re, replacement] of TR_WORDS) out = out.replace(re, replacement);
  out = out
    .replace(/\bCPU\b/gi, 'CPU')
    .replace(/\bGPU\b/gi, 'GPU')
    .replace(/\bRAM\b/gi, 'RAM')
    .replace(/\bSIM\b/gi, 'SIM')
    .replace(/\bUSB\b/gi, 'USB')
    .replace(/\bWi Fi\b/gi, 'Wi-Fi')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s+/g, ' ')
    .trim();
  return out ? out.charAt(0).toLocaleUpperCase('tr-TR') + out.slice(1) : clean;
}

function cleanupValueLine(line, lang) {
  const rawCode = String(lang || 'en').slice(0, 2).toLowerCase();
  // Specs never render in German (de → en). German source residue is still
  // scrubbed for the TR/EN views below.
  const code = rawCode === 'tr' ? 'tr' : 'en';
  let out = String(line || '').replace(/\s+/g, ' ').trim();
  if (!out) return '';

  // Scrub German residue on tr/en views (Geizhals source text leaking through).
  if (code === 'tr' || code === 'en') {
    for (const [re, map] of DE_RESIDUE) out = out.replace(re, map[code] || map.en);
  }
  if (code === 'en') {
    // Epey writes bilingual values as "<Turkish term> (<English term>)". On the
    // EN view keep only the English parenthetical when the prefix still carries
    // Turkish-specific letters — "Blue Işık Filtresi (Blue Light Filter)" →
    // "Blue Light Filter". Numeric/acronym parentheticals ("50.0MP (Camera 1)")
    // have no Turkish prefix so they are untouched.
    out = out.replace(/^.*?[çğışıİÇĞŞ][^()]*\(([A-Za-z0-9][A-Za-z0-9 .,/+%'’"-]*)\)\s*$/, '$1').trim();
    // Unit casing junk from old MT ("0.03 Ms" → "0.03 ms") + leftover Turkish.
    out = out
      .replace(/(\d)\s*Ms\b/g, '$1 ms')
      .replace(/\bthe(?:\s+the){2,}\b/gi, '')
      .replace(/\bthe\s+(?=(internet|online|web)\b)/gi, '')
      .replace(/\bwi\s*fi\b/gi, 'Wi-Fi')
      .replace(/\bmacos\b/gi, 'macOS')
      .replace(/\bozelligi\b/gi, 'feature')
      .replace(/\bözelliği\b/gi, 'feature')
      .replace(/\bdiger\b/gi, 'other')
      .replace(/\bdiğer\b/gi, 'other')
      .replace(/\bkart\s+okuyucu\b/gi, 'card reader')
      .replace(/\bklavye\b/gi, 'keyboard')
      .replace(/\bpil\b/gi, 'battery')
      .replace(/\binç\b/gi, 'inches')
      .replace(/\bsaat\b/gi, 'hours')
      .replace(/\bvar\b/gi, 'Yes')
      .replace(/\byok\b/gi, 'No');
    // Last line of defense: translate/fold any remaining Turkish value atoms so
    // an English visitor never sees Turkish words ("3 Adet Mikrofon", etc.).
    out = scrubTurkishValueResidueEn(out);
  }

  out = out
    .replace(/\bI\s*['’"]?\s*m\s+not\s*\.?/gi, code === 'tr' ? 'İnç' : 'inch')
    .replace(/\bI\s*['’"]?\s*m\s*not\s*\.?/gi, code === 'tr' ? 'İnç' : 'inch')
    .replace(/\bI\s*["'’]\s*m\s*not\s*\.?/gi, code === 'tr' ? 'İnç' : 'inch')
    .replace(/\bI\s*['’"]?\s*not\s*\.?/gi, code === 'tr' ? 'İnç' : 'inch')
    .replace(/\s+([.,)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .trim();

  if (code === 'tr') {
    const lower = out.toLowerCase();
    if (lower === 'yes' || lower === 'true') return 'Var';
    if (lower === 'no' || lower === 'false') return 'Yok';
    out = out
      .replace(/\bYes\b/g, 'Var')
      .replace(/\bNo\b/g, 'Yok')
      .replace(/\bCore\b/g, 'Çekirdek')
      .replace(/\bpixels\b/gi, 'piksel')
      .replace(/\bSupport\b/g, 'desteği')
      .replace(/\bFast Charging\b/gi, 'Hızlı şarj')
      .replace(/\bOptical Image Stabilization\b/gi, 'Optik görüntü sabitleme')
      .replace(/\bOptical Image Stabilizer\b/gi, 'Optik görüntü sabitleyici')
      .replace(/\bOptical Zoom\b/gi, 'Optik zoom')
      .replace(/\bDigital Zoom\b/gi, 'Dijital zoom')
      .replace(/\bAutomatic Focus\b/gi, 'Otomatik odaklama')
      .replace(/\bAuto-?Focus\b/gi, 'Otomatik odaklama')
      .replace(/\bPhase Detect\b/gi, 'Faz algılamalı')
      .replace(/\bDual Pixel\b/gi, 'Çift piksel')
      .replace(/\bUltra Wide Angle\b/gi, 'Ultra geniş açı')
      .replace(/\bExtra Wide Angle\b/gi, 'Ekstra geniş açı')
      .replace(/\bTelephoto\b/gi, 'Telefoto')
      .replace(/\bPeriscope\b/gi, 'Periskop')
      .replace(/\bUltra Wide\b/gi, 'Ultra geniş')
      .replace(/\bExtra Wide\b/gi, 'Ekstra geniş')
      .replace(/\bWide Angle\b/gi, 'Geniş açı')
      .replace(/\bLaser AF\b/gi, 'Lazer AF')
      .replace(/\boption\b/gi, 'seçeneği')
      .replace(/\bSeptember\b/g, 'Eylül')
      .replace(/\(eSIM only\)/gi, '(yalnızca eSIM)')
      .replace(/\bDual SIM\b/g, 'Çift SIM')
      .replace(/\bVoice over LTE\b/g, 'LTE üzerinden ses')
      .replace(/\bLithium Ion\b/g, 'Lityum iyon')
      // sensors (appear as values in the Sensors row)
      .replace(/\bAccelerometer\b/gi, 'İvmeölçer')
      .replace(/\bGyroscope\b/gi, 'Jiroskop')
      .replace(/\bProximity sensor\b/gi, 'Yakınlık sensörü')
      .replace(/\bAmbient light sensor\b/gi, 'Ortam ışık sensörü')
      .replace(/\bLight sensor\b/gi, 'Işık sensörü')
      .replace(/\bColor spectrum sensor\b/gi, 'Renk spektrumu sensörü')
      .replace(/\bCompass\b/gi, 'Pusula')
      .replace(/\bBarometer\b/gi, 'Barometre')
      .replace(/\bFingerprint sensor\b/gi, 'Parmak izi sensörü')
      .replace(/\bunder display\b/gi, 'ekran altı')
      // materials / build
      .replace(/\bStainless steel\b/gi, 'Paslanmaz çelik')
      .replace(/\bAlumin[iu]+m\b/gi, 'Alüminyum')
      .replace(/\bGlass\b/gi, 'Cam')
      .replace(/\bPlastic\b/gi, 'Plastik')
      .replace(/\(back\)/gi, '(arka)')
      .replace(/\(front\)/gi, '(ön)')
      .replace(/\(frame\)/gi, '(çerçeve)')
      // charging / connectivity values
      .replace(/\bReverse charging\b/gi, 'Ters şarj')
      .replace(/\bWired\b/gi, 'Kablolu')
      .replace(/\bWireless\b/gi, 'Kablosuz')
      // ── Canonical-EN Geizhals values (post 2026-06-10 glossary rebuild) ──
      .replace(/\bout of the box\b/gi, 'fabrika çıkışı')
      .replace(/\bvia update\b/gi, 'güncellemeyle')
      .replace(/\bcharge cycles\b/gi, 'şarj döngüsü')
      .replace(/\bcharging cycles\b/gi, 'şarj döngüsü')
      .replace(/\bnits\s*\(peak\)/gi, 'nit (maksimum)')
      .replace(/\bnits\s*\(typical\)/gi, 'nit (tipik)')
      .replace(/\brefresh rate\b/gi, 'yenileme hızı')
      .replace(/\btouch sampling rate\b/gi, 'dokunmatik örnekleme hızı')
      .replace(/\bcores\b/gi, 'çekirdek')
      .replace(/\bbillion colors\b/gi, 'milyar renk')
      .replace(/\bmillion colors\b/gi, 'milyon renk')
      .replace(/\byears of security updates\b/gi, 'yıl güvenlik güncellemesi')
      .replace(/\bOS updates\b/g, 'işletim sistemi güncellemesi')
      .replace(/\bPhase-detection AF\b/gi, 'Faz algılamalı AF')
      .replace(/\bPeriscope telephoto lens\b/gi, 'Periskop telefoto lens')
      .replace(/\bTelephoto lens\b/gi, 'Telefoto lens')
      .replace(/\bWide-angle lens\b/gi, 'Geniş açı lens')
      .replace(/\bUltra-wide lens\b/gi, 'Ultra geniş açı lens')
      .replace(/\bMacro lens\b/gi, 'Makro lens')
      .replace(/\bDual-LED flash\b/gi, 'Çift LED flaş')
      .replace(/\bLED flash\b/gi, 'LED flaş')
      .replace(/\bPunch-hole camera\b/gi, 'Kamera deliği')
      .replace(/\bCapacitive touchscreen\b/gi, 'Kapasitif dokunmatik ekran')
      .replace(/\bFoldable \(clamshell\)/gi, 'Katlanabilir (kapaklı)')
      .replace(/\bFoldable \(booklet\)/gi, 'Katlanabilir (kitap tipi)')
      .replace(/\bFoldable \(inward\)/gi, 'Katlanabilir (içe katlanır)')
      .replace(/\(unfolded\)/gi, '(açık)')
      .replace(/\(folded\)/gi, '(kapalı)')
      .replace(/\(head\)/gi, '(baş)')
      .replace(/\(body\)/gi, '(gövde)')
      .replace(/\(in-display\)/gi, '(ekran içi)')
      .replace(/\(side-mounted\)/gi, '(yan tuşta)')
      .replace(/\bSatellite communication\b/gi, 'Uydu iletişimi')
      .replace(/\(text messages, emergency only\)/gi, '(kısa mesaj, sadece acil durum)')
      .replace(/\bNot specified\b/gi, 'Belirtilmemiş')
      .replace(/\bUnder-display\b/gi, 'Ekran altı')
      .replace(/\bNotification LED\b/gi, "Bildirim LED'i")
      .replace(/\bDual SIM\b/gi, 'Çift SIM')
      .replace(/\bmicroSD slot\b/gi, 'microSD yuvası')
      .replace(/\bdedicated, up to\b/gi, 'özel, en fazla')
      .replace(/\bshared, up to\b/gi, 'paylaşımlı, en fazla')
      .replace(/\(display (\d)\)/gi, '(ekran $1)')
      .replace(/\(Camera (\d)\)/gi, '(Kamera $1)')
      .replace(/\bStereo speakers\b/gi, 'Stereo hoparlör')
      .replace(/\(hybrid\)/gi, '(hibrit)')
      .replace(/\bInfrared port\b/gi, 'Kızılötesi port')
      .replace(/\bFace scanner\b/gi, 'Yüz tarayıcı')
      .replace(/\(3D, infrared\)/gi, '(3D, kızılötesi)')
      .replace(/\bRemovable\b/gi, 'Çıkarılabilir')
      .replace(/\bcertified\b/gi, 'sertifikalı')
      .replace(/\(A to ([A-Z])\)/g, '(A ile $1)')
      .replace(/\bNotch\b/gi, 'Çentik')
      .replace(/\bOuter display\b/gi, 'Dış ekran')
      .replace(/\bCurved\b/gi, 'Kavisli')
      .replace(/\bFlat\b/gi, 'Düz')
      .replace(/\bContrast AF\b/gi, 'Kontrast AF')
      .replace(/\bjack\b/gi, 'kulaklık girişi');
    if (/^bar$/i.test(out.trim())) out = 'Düz (bar)';
  }

  out = out.replace(/\s{2,}/g, ' ').trim();
  // Writing rule: every spec value line starts with a capital letter, except
  // product/OS stylings whose official casing starts lowercase.
  out = upperFirst(out, code);
  if (code === 'en') {
    out = out
      .replace(/\bMacOS\b/g, 'macOS')
      .replace(/\bmacOS\s+tahoe\b/gi, 'macOS Tahoe')
      .replace(/\bInternet\b/g, 'internet');
  }
  return out;
}

export function localizedSpecValue(value, lang = 'en') {
  return String(value ?? '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => cleanupValueLine(line, lang))
    .filter(Boolean)
    .join('\n');
}

export function isDisplayableSpec(label, value) {
  const key = cleanupLabel(label).toLowerCase();
  const val = String(value ?? '').toLowerCase();
  if (!key || !String(value ?? '').trim()) return false;
  if (/sponsorlu|sponsored|reklam|advertisement/i.test(val)) return false;
  if (/^(steam \(max\.\)|max\. heater power)$/i.test(key)) return false;
  if (key === 'time' && /^\d+\s*(sn|sec|second|seconds)$/i.test(String(value ?? '').trim())) return false;
  return true;
}
