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
  },
  de: {
    'Battery capacity': 'Akkukapazität',
    'CPU cores': 'CPU-Kerne',
    'CPU frequency': 'CPU-Takt',
    'Display / Body Ratio': 'Display/Gehäuse-Verhältnis',
    'Display Size': 'Displaygröße',
    'Fast charging': 'Schnellladen',
    'Front camera': 'Frontkamera',
    'Main camera': 'Hauptkamera',
    'Operating system': 'Betriebssystem',
    'Resolution': 'Auflösung',
    'Screen size': 'Displaygröße',
    'Storage': 'Speicher',
    'Water resistance': 'Wasserbeständigkeit',
    'Wireless charging': 'Kabelloses Laden',
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
  [/\boperating system\b/gi, 'işletim sistemi'],
  [/\bannouncement date\b/gi, 'duyuru tarihi'],
];

function cleanupLabel(label) {
  return String(label || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleCase(text) {
  return cleanupLabel(text).replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function localizedSpecLabel(label, lang = 'en') {
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const clean = cleanupLabel(label);
  if (!clean) return '';
  const exact = LABELS[code]?.[clean] || LABELS[code]?.[titleCase(clean)];
  if (exact) return exact;
  if (code !== 'tr') return titleCase(clean);
  let out = clean;
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
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  let out = String(line || '').replace(/\s+/g, ' ').trim();
  if (!out) return '';

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
      .replace(/\bLithium Ion\b/g, 'Lityum iyon');
  }

  if (code === 'de') {
    const lower = out.toLowerCase();
    if (lower === 'yes' || lower === 'true') return 'Ja';
    if (lower === 'no' || lower === 'false') return 'Nein';
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
