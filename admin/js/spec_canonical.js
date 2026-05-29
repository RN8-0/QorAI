(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.QorAiSpecCanonical = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  const VERSION = '20260522-spec-canonical-v1';

  function norm(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/ı/g, 'i').replace(/İ/g, 'i')
      .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o')
      .replace(/ş/g, 's').replace(/ü/g, 'u')
      .replace(/[()]/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const SECTION_RULES = [
    ['Display', ['display', 'screen', 'ekran', 'monitor']],
    ['Battery', ['battery', 'batarya', 'pil', 'charging', 'charge', 'sarj']],
    ['Camera', ['camera', 'kamera', 'photo', 'video']],
    ['Performance', ['processor', 'cpu', 'islemci', 'chipset', 'yonga', 'gpu', 'graphics', 'grafik', 'performance', 'donanim']],
    ['Memory and storage', ['memory', 'ram', 'bellek', 'storage', 'depolama', 'ssd', 'hdd', 'disk']],
    ['Connectivity', ['wi fi', 'wifi', 'wlan', 'bluetooth', 'network', 'ag', 'baglanti', 'connectivity', 'usb', 'nfc', 'sim', '5g', '4g']],
    ['Design', ['design', 'tasarim', 'body', 'dimensions', 'dimension', 'boyut', 'weight', 'agirlik', 'thickness', 'kalinlik']],
    ['Audio', ['audio', 'sound', 'speaker', 'ses', 'hoparlor']],
    ['Software', ['software', 'operating system', 'isletim', 'os', 'windows', 'android', 'ios', 'macos']],
    ['Sensors', ['sensor', 'sensorler', 'fingerprint', 'parmak izi', 'gps', 'gyro', 'gyroscope']],
    ['General', ['general', 'genel', 'basic', 'temel', 'highlights', 'one cikan']],
  ];

  const KEY_RULES = [
    ['Battery capacity', ['battery capacity', 'battery capacity typical', 'battery capacity mah', 'capacity mah', 'batarya kapasitesi', 'pil kapasitesi']],
    ['Battery cycle life', ['battery endurance in cycles', 'battery cycle count', 'battery cycles', 'sarj dongusu']],
    ['Charging port', ['charging port', 'charge connector', 'usb connection type', 'usb connector type', 'usb type', 'usb baglanti tipi']],
    ['Fast charging', ['fast charging', 'fast charge', 'hizli sarj', 'quick charge']],
    ['Fast charging features', ['fast charging features', 'fast charge features', 'hizli sarj ozellikleri']],
    ['Fast charging power', ['fast charging power max', 'fast charging power', 'charging power', 'hizli sarj gucu']],
    ['Wireless charging', ['wireless charging', 'kablosuz sarj']],
    ['Removable battery', ['removable battery', 'degisir batarya', 'removeable battery']],
    ['Video playback', ['video playback', 'video oynatma']],

    ['Screen size', ['screen size', 'display size', 'display diagonal', 'ekran boyutu', 'ekran boyutu inc', 'screen diagonal']],
    ['Resolution', ['resolution', 'display resolution', 'screen resolution', 'ekran cozunurlugu', 'cozunurluk']],
    ['Panel type', ['panel type', 'display type', 'screen technology', 'display technology', 'ekran teknolojisi', 'ekran tipi']],
    ['Refresh rate', ['refresh rate', 'screen refresh rate', 'display refresh rate', 'yenileme hizi']],
    ['Pixel density', ['pixel density', 'ppi', 'piksel yogunlugu']],
    ['Brightness', ['brightness', 'screen brightness', 'parlaklik']],
    ['HDR', ['hdr', 'hdr support', 'hdr destegi']],

    ['Processor', ['processor', 'processor model', 'cpu', 'cpu model', 'islemci', 'islemci modeli', 'ana islemci']],
    ['Processor family', ['processor family', 'cpu family', 'islemci ailesi']],
    ['CPU cores', ['processor cores', 'cpu cores', 'core count', 'number of cores', 'cekirdek sayisi', 'cpu cekirdegi']],
    ['CPU frequency', ['processor frequency', 'cpu frequency', 'base frequency', 'islemci frekansi']],
    ['Chipset', ['chipset', 'soc', 'yonga seti']],
    ['GPU', ['gpu', 'graphics processor', 'graphics card', 'gpu model', 'grafik islemcisi gpu', 'ekran karti']],

    ['RAM', ['ram', 'memory ram', 'internal memory', 'bellek ram', 'memory capacity']],
    ['RAM type', ['ram type', 'memory type', 'internal memory type', 'bellek tipi']],
    ['Storage', ['storage', 'internal storage', 'total storage capacity', 'ssd', 'ssd size', 'sabit disk ssd boyutu', 'dahili hafiza', 'depolama']],
    ['Storage type', ['storage media', 'storage type', 'disk type', 'depolama tipi']],

    ['Main camera', ['main camera', 'main camera resolution', 'rear camera', 'camera resolution', 'arka kamera', 'ana kamera']],
    ['Front camera', ['front camera', 'front camera resolution', 'selfie camera', 'on kamera']],
    ['Camera aperture', ['aperture', 'main camera aperture', 'diyafram acikligi']],
    ['Video recording', ['video recording', 'video resolution', 'video kayit']],

    ['Wi-Fi', ['wi fi', 'wi fi standards', 'wifi', 'wireless', 'wlan', 'kablosuz baglanti']],
    ['Bluetooth', ['bluetooth', 'bluetooth version']],
    ['NFC', ['nfc']],
    ['5G', ['5g', '5g support', '5g destegi']],
    ['4G', ['4g', 'lte', '4g lte', '4 5g', '4 5g destegi']],
    ['SIM', ['sim', 'sim type', 'sim card type', 'line count', 'hat sayisi']],
    ['USB', ['usb', 'usb version', 'usb versiyonu']],

    ['Operating system', ['operating system', 'os', 'isletim sistemi', 'software']],
    ['Weight', ['weight', 'agirlik']],
    ['Dimensions', ['dimensions', 'dimension', 'boyutlar', 'olculer']],
    ['Thickness', ['thickness', 'kalinlik']],
    ['Width', ['width', 'en']],
    ['Height', ['height', 'boy', 'length']],
    ['Water resistance', ['water resistance', 'waterproof', 'suya dayaniklilik']],
    ['Color', ['color', 'color options', 'renk', 'renk secenekleri']],
    ['Sensors', ['sensors', 'sensorler']],
    ['Speakers', ['speakers', 'speaker features', 'hoparlor', 'hoparlor ozellikleri']],
    ['Microphone', ['microphone', 'mikrofon']],
  ];

  const exactKeyMap = new Map();
  for (const [canonical, aliases] of KEY_RULES) {
    for (const alias of aliases) exactKeyMap.set(norm(alias), canonical);
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

  function canonicalKey(key, value) {
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
    if (exactKeyMap.has(k)) return exactKeyMap.get(k);
    if (k === 'charging' || k === 'charge') {
      if (/\b(usb|type c|typec|lightning|micro usb)\b/.test(v)) return 'Charging port';
      return 'Charging';
    }
    for (const [canonical, aliases] of KEY_RULES) {
      if (aliases.some(alias => {
        const a = norm(alias);
        return a.length > 3 && (k === a || k.includes(a) || a.includes(k));
      })) return canonical;
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

  function addSpec(flat, sections, section, key, value) {
    const v = cleanValue(value);
    if (!v || v === '?' || v.toLowerCase() === 'null') return;
    const canonical = canonicalKey(key, v);
    const group = canonicalSection(section, canonical);
    flat[canonical] = mergeValue(flat[canonical], v);
    if (!sections[group]) sections[group] = {};
    sections[group][canonical] = mergeValue(sections[group][canonical], v);
  }

  function canonicalizeMaps(specs, specSections) {
    const flat = {};
    const sections = {};
    for (const [section, body] of Object.entries(specSections || {})) {
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        for (const [key, value] of Object.entries(body)) {
          if (value && typeof value === 'object' && !Array.isArray(value)) {
            for (const [subKey, subValue] of Object.entries(value)) {
              addSpec(flat, sections, section, subKey, subValue);
            }
          } else {
            addSpec(flat, sections, section, key, value);
          }
        }
      }
    }
    for (const [key, value] of Object.entries(specs || {})) {
      const v = cleanValue(value);
      if (!v || v === '?' || v.toLowerCase() === 'null') continue;
      const canonical = canonicalKey(key, v);
      if (Object.prototype.hasOwnProperty.call(flat, canonical)) {
        flat[canonical] = mergeValue(flat[canonical], v);
      } else {
        addSpec(flat, sections, 'General', key, value);
      }
    }
    return { specs: flat, specSections: sections };
  }

  function canonicalizeKeySpecs(keySpecs) {
    const out = {};
    for (const [key, value] of Object.entries(keySpecs || {})) {
      const v = cleanValue(value);
      if (!v) continue;
      const canonical = canonicalKey(key, v);
      out[canonical] = mergeValue(out[canonical], v);
    }
    return out;
  }

  function canonicalizeProduct(product) {
    const maps = canonicalizeMaps(product?.specs || {}, product?.specSections || {});
    const keySpecs = canonicalizeKeySpecs(product?.keySpecs || {});
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
