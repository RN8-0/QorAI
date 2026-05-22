const trMap = { ı: 'i', İ: 'i', ç: 'c', ğ: 'g', ö: 'o', ş: 's', ü: 'u' };

export function normSpec(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[ıİçğöşü]/g, (c) => trMap[c] || c)
    .replace(/[()]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const sectionRules = [
  ['Display', ['display', 'screen', 'ekran']],
  ['Battery', ['battery', 'batarya', 'pil', 'charging', 'sarj']],
  ['Camera', ['camera', 'kamera', 'photo', 'video']],
  ['Performance', ['processor', 'cpu', 'islemci', 'chipset', 'yonga', 'gpu', 'graphics', 'grafik']],
  ['Memory and storage', ['memory', 'ram', 'bellek', 'storage', 'depolama', 'ssd', 'hdd']],
  ['Connectivity', ['wi fi', 'wifi', 'wlan', 'bluetooth', 'network', 'baglanti', 'usb', 'nfc', 'sim', '5g', '4g']],
  ['Design', ['design', 'tasarim', 'body', 'dimension', 'weight', 'agirlik', 'thickness', 'kalinlik']],
  ['Audio', ['audio', 'sound', 'speaker', 'ses', 'hoparlor']],
  ['Software', ['software', 'operating system', 'isletim', 'os', 'windows', 'android', 'ios']],
  ['Sensors', ['sensor', 'fingerprint', 'gps', 'gyro']],
  ['General', ['general', 'genel', 'basic', 'temel', 'highlight', 'one cikan']],
];

const keyRules = [
  ['Battery capacity', ['battery capacity', 'battery capacity typical', 'battery capacity mah', 'batarya kapasitesi', 'pil kapasitesi']],
  ['Battery cycle life', ['battery endurance in cycles', 'battery cycle count', 'battery cycles']],
  ['Charging port', ['charging port', 'charge connector', 'usb connection type', 'usb connector type', 'usb type', 'usb baglanti tipi']],
  ['Fast charging', ['fast charging', 'fast charge', 'hizli sarj']],
  ['Fast charging features', ['fast charging features', 'hizli sarj ozellikleri']],
  ['Fast charging power', ['fast charging power max', 'fast charging power', 'charging power', 'hizli sarj gucu']],
  ['Wireless charging', ['wireless charging', 'kablosuz sarj']],
  ['Removable battery', ['removable battery', 'degisir batarya']],
  ['Video playback', ['video playback', 'video oynatma']],
  ['Screen size', ['screen size', 'display size', 'display diagonal', 'ekran boyutu']],
  ['Resolution', ['resolution', 'display resolution', 'screen resolution', 'ekran cozunurlugu']],
  ['Panel type', ['panel type', 'display type', 'screen technology', 'display technology', 'ekran teknolojisi']],
  ['Refresh rate', ['refresh rate', 'screen refresh rate', 'yenileme hizi']],
  ['Pixel density', ['pixel density', 'ppi', 'piksel yogunlugu']],
  ['Brightness', ['brightness', 'screen brightness', 'parlaklik']],
  ['Processor', ['processor', 'processor model', 'cpu', 'cpu model', 'islemci modeli', 'ana islemci']],
  ['Processor family', ['processor family', 'cpu family', 'islemci ailesi']],
  ['CPU cores', ['processor cores', 'cpu cores', 'core count', 'number of cores', 'cekirdek sayisi']],
  ['Chipset', ['chipset', 'soc', 'yonga seti']],
  ['GPU', ['gpu', 'graphics processor', 'graphics card', 'gpu model', 'ekran karti']],
  ['RAM', ['ram', 'memory ram', 'internal memory', 'bellek ram', 'memory capacity']],
  ['RAM type', ['ram type', 'memory type', 'internal memory type']],
  ['Storage', ['storage', 'internal storage', 'total storage capacity', 'ssd', 'sabit disk ssd boyutu', 'dahili hafiza']],
  ['Storage type', ['storage media', 'storage type', 'disk type']],
  ['Main camera', ['main camera', 'main camera resolution', 'rear camera', 'camera resolution', 'arka kamera', 'ana kamera']],
  ['Front camera', ['front camera', 'front camera resolution', 'selfie camera', 'on kamera']],
  ['Wi-Fi', ['wi fi', 'wi fi standards', 'wifi', 'wireless', 'wlan', 'kablosuz baglanti']],
  ['Bluetooth', ['bluetooth', 'bluetooth version']],
  ['NFC', ['nfc']],
  ['5G', ['5g', '5g support', '5g destegi']],
  ['4G', ['4g', 'lte', '4g lte', '4 5g']],
  ['SIM', ['sim', 'sim type', 'sim card type', 'line count', 'hat sayisi']],
  ['USB', ['usb', 'usb version', 'usb versiyonu']],
  ['Operating system', ['operating system', 'os', 'isletim sistemi', 'software']],
  ['Weight', ['weight', 'agirlik']],
  ['Dimensions', ['dimensions', 'dimension', 'boyutlar']],
  ['Thickness', ['thickness', 'kalinlik']],
  ['Water resistance', ['water resistance', 'waterproof', 'suya dayaniklilik']],
  ['Color', ['color', 'color options', 'renk', 'renk secenekleri']],
  ['Sensors', ['sensors', 'sensorler']],
  ['Speakers', ['speakers', 'speaker features', 'hoparlor']],
];

const exact = new Map(keyRules.flatMap(([canonical, aliases]) => aliases.map((a) => [normSpec(a), canonical])));

function cleanValue(value) {
  return String(value == null ? '' : value).replace(/\r/g, '\n').split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

function mergeValue(a, b) {
  const left = cleanValue(a);
  const right = cleanValue(b);
  if (!left) return right;
  if (!right || normSpec(left) === normSpec(right)) return left;
  if (normSpec(left).includes(normSpec(right))) return left;
  if (normSpec(right).includes(normSpec(left))) return right;
  const lines = left.split('\n');
  right.split('\n').forEach((line) => {
    if (!lines.some((x) => normSpec(x) === normSpec(line))) lines.push(line);
  });
  return lines.join('\n');
}

export function canonicalSpecKey(key, value = '') {
  const k = normSpec(key);
  const v = normSpec(value);
  if (!k) return 'Specification';
  if (k.includes('required charging power') || k.includes('charging power')) return 'Fast charging power';
  if (k.includes('usb type c charging port') && /^(yes|no|var|yok|true|false)$/i.test(String(value || '').trim())) {
    return 'USB-C charging';
  }
  if (exact.has(k)) return exact.get(k);
  if (k === 'charging' || k === 'charge') {
    return /\b(usb|type c|typec|lightning|micro usb)\b/.test(v) ? 'Charging port' : 'Charging';
  }
  for (const [canonical, aliases] of keyRules) {
    if (aliases.some((alias) => {
      const a = normSpec(alias);
      return a.length > 3 && (k === a || k.includes(a) || a.includes(k));
    })) return canonical;
  }
  return String(key || '').replace(/:$/, '').replace(/\s+/g, ' ').trim();
}

export function canonicalSpecSection(section, key = '') {
  const hay = `${normSpec(section)} ${normSpec(key)}`;
  for (const [canonical, needles] of sectionRules) {
    if (needles.some((needle) => hay.includes(needle))) return canonical;
  }
  return String(section || 'General').replace(/:$/, '').replace(/\s+/g, ' ').trim() || 'General';
}

export function canonicalizeSpecMaps(product = {}) {
  const specs = {};
  const specSections = {};
  const add = (section, key, value) => {
    const v = cleanValue(value);
    if (!v || v === '?' || v.toLowerCase() === 'null') return;
    const k = canonicalSpecKey(key, v);
    const s = canonicalSpecSection(section, k);
    specs[k] = mergeValue(specs[k], v);
    specSections[s] = specSections[s] || {};
    specSections[s][k] = mergeValue(specSections[s][k], v);
  };
  Object.entries(product.specSections || {}).forEach(([section, body]) => {
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      Object.entries(body).forEach(([key, value]) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          Object.entries(value).forEach(([subKey, subValue]) => add(section, subKey, subValue));
        } else {
          add(section, key, value);
        }
      });
    }
  });
  Object.entries(product.specsEn || product.specs || {}).forEach(([key, value]) => {
    const v = cleanValue(value);
    if (!v || v === '?' || v.toLowerCase() === 'null') return;
    const k = canonicalSpecKey(key, v);
    if (Object.prototype.hasOwnProperty.call(specs, k)) {
      specs[k] = mergeValue(specs[k], v);
    } else {
      add('General', key, value);
    }
  });
  const keySpecs = {};
  Object.entries(product.keySpecs || {}).forEach(([key, value]) => {
    const v = cleanValue(value);
    if (!v) return;
    const k = canonicalSpecKey(key, v);
    keySpecs[k] = mergeValue(keySpecs[k], v);
  });
  return { specs, specSections, keySpecs };
}
