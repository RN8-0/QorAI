/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════
//  QOR AI — SPEC I18N · TEK KAYNAK (single source of truth)
//
//  Urun ozelliklerinin (spec) etiket + deger yerellestirmesi BURADA yasar.
//  Admin paneli, web sitesi (qorai.net) ve scraper AYNI bu dosyayi kullanir.
//  Daha once ayni is iki ayri yerde yaziliydi (admin/js/app.js icindeki modal
//  kapanisi + web/src/lib/specDisplay.js) ve kacinilmaz olarak AYRISTI:
//  admin "Drop-resistance class" gosterirken site "Dusme Direnci Sinifi"
//  gosteriyordu (ASCII katlamasi -> sahte Ingilizce).
//
//  NEDEN admin/js/ ICINDE?
//  Admin paneli DERLENMEYEN bir statik site (Coolify "static" pack, publish
//  dir = admin/). Tarayici yalnizca kendi kok dizinindeki dosyalari cekebilir,
//  yani ortak modul FIZIKSEL OLARAK admin/ altinda olmak ZORUNDA. Web tarafi
//  bu dosyayi derleme sirasinda ice aktarir: web/src/lib/specI18n.js.
//  ==> Diskte TEK kopya var. Buraya dokunmadan iki taraf da degismez.
//
//  YUKLEME SIRASI: admin/index.html icindeki script listesinde EN BASTA olmali
//  (scraper.js ve app.js buradaki tanimlara top-level'da baglaniyor).
// ═══════════════════════════════════════════════════════════════════════════
(function (root) {
'use strict';

/* ───────────────────────────────────────────────────────────────────────────
   1) KURAL MOTORU — admin/js/scraper.js'ten TASINDI (kopya degil).
   scraper.js artik bu tanimlara forwarder ile baglaniyor.
   ─────────────────────────────────────────────────────────────────────────── */
function _escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function _normalizeDictSourceKey(text) {
  return String(text || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function _translateTurkishLimitPhrases(text, targetLang = 'en') {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const lang = targetLang || 'en';
  const words = ({
    en: { max: 'up to', maximum: 'maximum', min: 'at least' },
  })[lang] || ({ max: 'up to', maximum: 'maximum', min: 'at least' });
  return raw
    .replace(/\bAzami\s+([0-9][^),;\n]*)/gi, `${words.max} $1`)
    .replace(/\bMaksimum\s+([0-9][^),;\n]*)/gi, `${words.maximum} $1`)
    .replace(/\bAsgari\s+([0-9][^),;\n]*)/gi, `${words.min} $1`)
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function _knownTurkishRuleTranslation(sourceText, targetLang) {
  const raw = String(sourceText || '').trim();
  const lang = targetLang || 'en';
  const s = _normalizeDictSourceKey(raw)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
  const limitRule = _translateTurkishLimitPhrases(raw, lang);
  if (limitRule && limitRule !== raw) return limitRule;
  const n = (s.match(/\d+(?:[.,]\d+)?/) || [''])[0].replace(',', '.');
  const suffix = raw.match(/\([^)]*\)\s*$/)?.[0] || '';
  const phrase = {
    minute: { en: 'minutes'},
    hour: { en: 'hours'},
    cycle: { en: 'cycles'},
    billion: { en: 'billion'},
    gram: { en: 'grams'},
    onlyEsim: { en: 'eSIM only'},
    digitalZoom: { en: 'digital zoom'},
    elementLens: { en: 'element lens'},
    technology: { en: 'Technology'},
    specifications: { en: 'Specifications'},
  };
  const p = (key) => phrase[key]?.[lang] || phrase[key]?.en;
  const exact = {
    'ab urun kayit ve enerji etiketi': { en: 'EU product registration & energy label'},
    'ag baglantilari': { en: 'Network connections'},
    'batarya': { en: 'Battery'},
    'diger baglantilar': { en: 'Other connections'},
    'ekran': { en: 'Display'},
    'kablosuz baglantilar': { en: 'Wireless connections'},
    'kamera': { en: 'Camera'},
    'tasarim': { en: 'Design'},
    'temel bilgiler': { en: 'Basics'},
    'temel donanim': { en: 'Core hardware'},
    'coklu ortam': { en: 'Multimedia'},
    'ozellikler': { en: 'Features'},
    'one cikanlar': { en: 'Highlights'},
    'isletim sistemi': { en: 'Operating system'},
    '4.5g destegi': { en: '4.5G support'},
    '4g ozellikleri': { en: '4G features'},
    'batarya kapasitesi (tipik)': { en: 'Battery capacity (typical)'},
    'batarya ozellikleri': { en: 'Battery features'},
    'degisir batarya': { en: 'Removable battery'},
    'hizli sarj': { en: 'Fast charging'},
    'hizli sarj gucu (maks.)': { en: 'Fast charging power (max.)'},
    'hizli sarj ozellikleri': { en: 'Fast charging features'},
    'kablosuz sarj': { en: 'Wireless charging'},
    'kablosuz sarj ozellikleri': { en: 'Wireless charging features'},
    'video oynatma': { en: 'Video playback'},
    'sarj': { en: 'Charging'},
    'hat sayisi': { en: 'Number of SIMs'},
    'usb baglanti tipi': { en: 'USB connection type'},
    'usb versiyonu': { en: 'USB version'},
    'usb ozellikleri': { en: 'USB features'},
    'cift hat ozelligi': { en: 'Dual SIM feature'},
    'ekran / govde orani': { en: 'Display-to-body ratio'},
    'ekran alani': { en: 'Display area'},
    'ekran boyutu': { en: 'Screen size'},
    'ekran dayanikliligi': { en: 'Display durability'},
    'ekran orani (aspect ratio)': { en: 'Display aspect ratio'},
    'ekran teknolojisi': { en: 'Display technology'},
    'ekran yenileme hizi': { en: 'Display refresh rate'},
    'ekran cozunurlugu': { en: 'Display resolution'},
    'ekran cozunurlugu standardi': { en: 'Display resolution standard'},
    'ekran ozellikleri': { en: 'Display features'},
    'cizilmeye direncli cam': { en: 'Scratch-resistant glass'},
    'cercevesiz tasarim': { en: 'Frameless design'},
    'surekli acik ekran (always-on display)': { en: 'Always-on display'},
    'ekran icinde on kamera': { en: 'In-display front camera'},
    'piksel yogunlugu': { en: 'Pixel density'},
    'renk sayisi': { en: 'Color count'},
    'bluetooth versiyonu': { en: 'Bluetooth version'},
    'kizilotesi': { en: 'Infrared'},
    'navigasyon ozellikleri': { en: 'Navigation features'},
    'wi-fi kanallari': { en: 'Wi-Fi channels'},
    'wi-fi ozellikleri': { en: 'Wi-Fi features'},
    'agir cekim kayit secenekleri': { en: 'Slow-motion recording options'},
    'diyafram acikligi': { en: 'Aperture'},
    'dorduncu arka kamera': { en: 'Fourth rear camera'},
    'dorduncu arka kamera diyafram': { en: 'Fourth rear camera aperture'},
    'dorduncu arka kamera cozunurlugu': { en: 'Fourth rear camera resolution'},
    'dorduncu arka kamera ozellikleri': { en: 'Fourth rear camera features'},
    'ucuncu arka kamera': { en: 'Third rear camera'},
    'ucuncu arka kamera diyafram': { en: 'Third rear camera aperture'},
    'ucuncu arka kamera cozunurlugu': { en: 'Third rear camera resolution'},
    'ucuncu arka kamera ozellikleri': { en: 'Third rear camera features'},
    'ikinci arka kamera': { en: 'Second rear camera'},
    'ikinci arka kamera diyafram': { en: 'Second rear camera aperture'},
    'ikinci arka kamera cozunurlugu': { en: 'Second rear camera resolution'},
    'ikinci arka kamera ozellikleri': { en: 'Second rear camera features'},
    'flas': { en: 'Flash'},
    'kamera sensor boyutu': { en: 'Camera sensor size'},
    'kamera cozunurlugu': { en: 'Camera resolution'},
    'kamera ozellikleri': { en: 'Camera features'},
    'yapay zeka (ai) sahne algilama': { en: 'AI scene detection'},
    'perde hizi (shutter speed) kontrolu': { en: 'Shutter speed control'},
    'raw kayit yapabilme': { en: 'RAW recording support'},
    'otomatik odaklama': { en: 'Autofocus'},
    'sesli komut': { en: 'Voice command'},
    'sesle komut': { en: 'Voice command'},
    'dahili qr kod okuyucu': { en: 'Built-in QR code reader'},
    'seri cekim (burst) modu': { en: 'Burst shooting mode'},
    'kayipsiz yakinlastirma': { en: 'Lossless zoom'},
    'odak uzakligi': { en: 'Focal length'},
    'optik goruntu sabitleyici (ois)': { en: 'Optical image stabilizer (OIS)'},
    'video fps degeri': { en: 'Video FPS'},
    'video kayit secenekleri': { en: 'Video recording options'},
    'video kayit cozunurlugu': { en: 'Video recording resolution'},
    'video kayit ozellikleri': { en: 'Video recording features'},
    'odak takibi': { en: 'Focus tracking'},
    'yavas cekim video kayit (slow motion video)': { en: 'Slow-motion video recording'},
    'on kamera diyafram acikligi': { en: 'Front camera aperture'},
    'on kamera fps degeri': { en: 'Front camera FPS'},
    'on kamera video cozunurlugu': { en: 'Front camera video resolution'},
    'on kamera cozunurlugu': { en: 'Front camera resolution'},
    'on kamera ozellikleri': { en: 'Front camera features'},
    'video kayitta portre modu': { en: 'Portrait mode in video recording'},
    'sanal flas': { en: 'Virtual flash'},
    'zamanlayici (self-timer)': { en: 'Self-timer'},
    'hizli odaklama': { en: 'Fast focus'},
    'panorama selfi': { en: 'Panorama selfie'},
    'ekstra genis aci': { en: 'Ultra-wide angle'},
    'agirlik': { en: 'Weight'},
    'boy': { en: 'Height'},
    'en': { en: 'Width'},
    'govde malzemesi (kapak)': { en: 'Body material (back cover)'},
    'govde malzemesi (cerceve)': { en: 'Body material (frame)'},
    'kalinlik': { en: 'Thickness'},
    'renk secenekleri': { en: 'Color options'},
    'alt seri': { en: 'Sub-series'},
    'duyurulma tarihi': { en: 'Announcement date'},
    'seri': { en: 'Series'},
    '1. yardimci islemci': { en: '1. Auxiliary processor'},
    'antutu puani (v10)': { en: 'AnTuTu score (v10)'},
    'antutu puani (v11)': { en: 'AnTuTu score (v11)'},
    'ana islemci (cpu)': { en: 'Main processor (CPU)'},
    'bellek (ram)': { en: 'Memory (RAM)'},
    'cpu frekansi': { en: 'CPU frequency'},
    'cpu cekirdegi': { en: 'CPU cores'},
    'cpu uretim teknolojisi': { en: 'CPU manufacturing process'},
    'dahili depolama': { en: 'Internal storage'},
    'diger bellek (ram) secenekleri': { en: 'Other memory (RAM) options'},
    'diger hafiza secenekleri': { en: 'Other storage options'},
    'gpu frekansi': { en: 'GPU frequency'},
    'grafik islemcisi (gpu)': { en: 'Graphics processor (GPU)'},
    'hafiza karti destegi': { en: 'Memory card support'},
    'ram tipi': { en: 'RAM type'},
    'yonga seti (chipset)': { en: 'Chipset'},
    'islemci mimarisi': { en: 'Processor architecture'},
    'hoparlor ozellikleri': { en: 'Speaker features'},
    'ses cikisi': { en: 'Audio output'},
    'bildirim isigi (led)': { en: 'Notification LED'},
    'goruntulu konusma (uygulama)': { en: 'Video calling (app)'},
    'kutu icerigi': { en: 'Box contents'},
    'parmak izi okuyucu': { en: 'Fingerprint reader'},
    'parmak izi okuyucu ozellikleri': { en: 'Fingerprint reader features'},
    'sar degeri 10g (bas)': { en: 'SAR value 10g (head)'},
    'sar degeri 10g (vucut)': { en: 'SAR value 10g (body)'},
    'sensorler': { en: 'Sensors'},
    'servis ve uygulamalar': { en: 'Services and applications'},
    'suya dayaniklilik': { en: 'Water resistance'},
    'suya dayaniklilik seviyesi': { en: 'Water resistance level'},
    'toza dayaniklilik': { en: 'Dust resistance'},
    'toza dayaniklilik seviyesi': { en: 'Dust resistance level'},
    'buhar basinci (maks.)': { en: 'Steam pressure (max.)'},
    'isinma suresi': { en: 'Heat-up time'},
    'max. isitici gucu': { en: 'Max. heater power'},
    'kullanici arayuzu': { en: 'User interface'},
    'lansman arayuz versiyonu': { en: 'Launch interface version'},
    'isletim sistemi versiyonu': { en: 'OS version'},
    'siyah': { en: 'Black'},
    'beyaz': { en: 'White'},
    'altin': { en: 'Gold'},
    'gumus': { en: 'Silver'},
    'mavi': { en: 'Blue'},
    'mor': { en: 'Purple'},
    'subat': { en: 'February'},
    'cift hat': { en: 'Dual SIM'},
    'cift hoparlor': { en: 'Dual speaker'},
    'ekran icinde': { en: 'In-display'},
    'ultrasonic sensor': { en: 'Ultrasonic sensor'},
    'sim cikartma ignesi': { en: 'SIM eject pin'},
    "usb kablosu (type-c'den type-c'ye)": { en: 'USB cable (Type-C to Type-C)'},
    'ekrana cift dokunarak acma (knockon)': { en: 'Double-tap to wake (KnockON)'},
    'kablosuz sarj ile baska cihazlari sarj edebilme': { en: 'Reverse wireless charging'},
    'kolay arayuz (easy mode)': { en: 'Easy Mode'},
    'tek elde kullanim modu': { en: 'One-handed mode'},
    'yuz tanimlama': { en: 'Face recognition'},
    'vapor-chamber sogutma': { en: 'Vapor-chamber cooling'},
    // Standalone ambiguous terms NLLB-600M mistranslates without context:
    // "çözünürlük" → "Solvability"/"Lösungsfähigkeit" (chemistry sense),
    // "su geçirmez(lik)" → a sentence / "Durchlässigkeit" (opposite),
    // "(dahili) hafıza" → "Inneres Gedächtnis"/"Gedächtnis" (human memory).
    // The compound forms (ekran/kamera çözünürlüğü, dahili depolama, suya
    // dayanıklılık) already resolve correctly above — only the bare words do not.
    'cozunurluk': { en: 'Resolution'},
    'cozunurlugu': { en: 'Resolution'},
    'su gecirmezlik': { en: 'Water resistance'},
    'su gecirmezligi': { en: 'Water resistance'},
    'su gecirmez': { en: 'Waterproof'},
    'suya dayanikli': { en: 'Water resistant'},
    'hafiza': { en: 'Memory'},
    'dahili hafiza': { en: 'Internal storage'},
    'hafiza karti': { en: 'Memory card'},
    'depolama': { en: 'Storage'},
  };
  if (exact[s]?.[lang]) return exact[s][lang];
  const inch = s.match(/^(\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)?)\s*inc$/);
  if (inch) return ({ en: `${inch[1]} inches`})[lang] || `${inch[1]} inches`;
  const chargeFill = s.match(/^(\d+(?:[.,]\d+)?)\s*dakikada\s*%(\d+)\s*dolum$/);
  if (chargeFill) return ({ en: `${chargeFill[2]}% charge in ${chargeFill[1]} minutes`})[lang] || `${chargeFill[2]}% charge in ${chargeFill[1]} minutes`;
  const score = s.match(/^(\d+(?:[.,]\d+)?)\s*puan$/);
  if (score) return ({ en: `${score[1]} score`})[lang] || `${score[1]} score`;
  const cores = s.match(/^(\d+)\s*cekirdek$/);
  if (cores) return ({ en: `${cores[1]} cores`})[lang] || `${cores[1]} cores`;
  const ramOptions = s.match(/^(.+)\s*ram\s*secenegi\s*var$/);
  if (ramOptions) return ({ en: `${ramOptions[1]} RAM options available`})[lang] || `${ramOptions[1]} RAM options available`;
  const storageOptions = s.match(/^(.+)\s*depolama\s*secenegi\s*var$/);
  if (storageOptions) return ({ en: `${storageOptions[1]} storage options available`})[lang] || `${storageOptions[1]} storage options available`;
  if (/^(?:usb\s+)?flash\s+bellek$|^usb\s+bellek$/.test(s)) {
    return ({
      en: 'USB flash drive',
    })[lang] || 'USB flash drive';
  }
  if (/^(usb|usb-c|hdmi|displayport|thunderbolt|bluetooth|wi-?fi)\s+destegi$/.test(s)) {
    const tech = raw.match(/^(usb-c|usb|hdmi|displayport|thunderbolt|bluetooth|wi-?fi)/i)?.[0] || 'USB';
    return ({
      en: `${tech} support`,
    })[lang] || `${tech} support`;
  }
  if (/^(usb|usb-c|hdmi|displayport|thunderbolt)\s+(girisi|girisleri|cikisi|cikislari|portu|soketi|baglantisi|tipi|turu)$/.test(s)) {
    const tech = raw.match(/^(usb-c|usb|hdmi|displayport|thunderbolt)/i)?.[0] || 'USB';
    const kind = /cikis/.test(s) ? 'output' : (/giris|port|soket|baglanti/.test(s) ? 'port' : 'type');
    return ({
      en: `${tech} ${kind}`,
    })[lang] || `${tech} ${kind}`;
  }
  if (/^usb(?:-c)?\s*ozellikleri$/.test(s)) {
    return ({
      en: 'USB features',
    })[lang] || 'USB features';
  }
  if (/^usb\s*3\.x\s*adedi$/.test(s)) {
    return ({
      en: 'USB 3.x count',
    })[lang] || 'USB 3.x count';
  }
  if (/^pil\s+(ozellikleri|specifications)$/.test(s)) {
    return ({
      en: 'Battery specifications',
    })[lang] || 'Battery specifications';
  }
  if (/^li-?po\s*\(\s*lityum-polymer\s*\)$/.test(s)) {
    return ({
      en: 'Li-Po (lithium polymer)',
    })[lang] || 'Li-Po (lithium polymer)';
  }
  if (_isProtectedTechnicalAtom(raw)) return raw;
  const q = s.match(/^(\d{4})\s+([1-4])\.?\s*ceyrek$/);
  if (q) {
    return ({
      en: `${q[1]} Q${q[2]}`,
    })[lang] || `${q[1]} Q${q[2]}`;
  }
  if (/\bgoz\b/.test(s) && /(health|saglik|certification|sertifika)/.test(s)) {
    return ({
      en: raw.replace(/g[öo]z/ig, 'eye').replace(/sağlığı|sagligi/ig, 'health').replace(/sertifikası|sertifikasi/ig, 'certification'),
    })[lang] || raw.replace(/g[öo]z/ig, 'eye');
  }
  if (/^hizli$/.test(s)) {
    return ({
      en: 'Fast charging',
    })[lang] || 'Fast charging';
  }
  if (/^(parlamayan\s+)?mat\s+(ekran|display)$/.test(s) || /^non-flammable\s+mat\s+display$/i.test(raw)) {
    return ({
      en: 'Anti-glare matte display',
    })[lang] || 'Anti-glare matte display';
  }
  if (/^\d+(?:[.,]\d+)?\s*adet$/.test(s)) return n;
  if (/^\d+\s*x\s*\d+\s*piksel$/.test(s)) {
    return ({
      en: raw.replace(/piksel/ig, 'pixels'),
    })[lang] || raw.replace(/piksel/ig, 'pixels');
  }
  if (/^kart\s+okuyucu\s+specifications$/.test(s)) {
    return ({
      en: 'Card reader specifications',
    })[lang] || 'Card reader specifications';
  }
  if (/^klavye\s+specifications$/.test(s)) {
    return ({
      en: 'Keyboard specifications',
    })[lang] || 'Keyboard specifications';
  }
  if (/^minirsel\s+processing\s*\(npu\)$/.test(s)) {
    return ({
      en: 'Neural processing (NPU)',
    })[lang] || 'Neural processing (NPU)';
  }
  if (/^npu\s*\(sinirsel\s+trading\s+unit\)\s+name$/.test(s)) {
    return ({
      en: 'NPU (neural processing unit) name',
    })[lang] || 'NPU (neural processing unit) name';
  }
  if (/^\d+(?:[.,]\d+)?\s*dakika$/.test(s)) return `${n} ${p('minute')}`;
  if (/^\d+(?:[.,]\d+)?\s*saat$/.test(s)) return `${n} ${p('hour')}`;
  if (/^\d+(?:[.,]\d+)?\s*dongu$/.test(s)) return `${n} ${p('cycle')}`;
  if (/^\d+(?:[.,]\d+)?\s*milyar$/.test(s)) return `${n} ${p('billion')}`;
  if (/^\d+(?:[.,]\d+)?\s*gram$/.test(s)) return `${n} ${p('gram')}`;
  if (/^\d+(?:[.,]\d+)?x\s*dijital\s+zoom$/.test(s)) return `${n}x ${p('digitalZoom')}`;
  if (/^\d+\s*elementli\s+lens$/.test(s)) return `${n}-${p('elementLens')}`;
  if (/^yalnizca\s+esim$/.test(s)) return p('onlyEsim');
  if (/\byalnizca\s+esim\b/.test(s)) return raw.replace(/yaln[ıi]zca\s+esim/ig, p('onlyEsim'));
  if (/\bspecificationsi\b/i.test(raw)) return raw.replace(/\bspecificationsi\b/ig, p('specifications'));
  if (/\bteknolojisi\b/i.test(raw)) return raw.replace(/\bteknolojisi\b/ig, p('technology'));
  if (!n) return null;
  const maps = {
    updateWarranty: {
      en: `${n}-Year Update Guarantee`,
    },
    securityWarranty: {
      en: `${n}-Year Security Update Guarantee`,
    },
    virtualRam: {
      en: `Virtual RAM Expansion${suffix ? ` ${suffix}` : ''}`,
    },
    cooling: {
      en: raw.replace(/soğutma|sogutma/i, 'Cooling'),
    },
    reverseCharging: {
      en: `Reverse Charging${suffix ? ` ${suffix}` : ''}`,
    },
  };
  if (/^\d+\s*yil\s+guvenlik\s+guncellemesi\s+garantisi$/.test(s)) return maps.securityWarranty[targetLang] || null;
  if (/^\d+\s*yil\s+guncelleme\s+garantisi$/.test(s)) return maps.updateWarranty[targetLang] || null;
  if (/sanal\s+ram\s+artirma/.test(s)) return maps.virtualRam[targetLang] || null;
  if (/ters\s+(charging|sarj)/.test(s)) return maps.reverseCharging[targetLang] || null;
  if (/sogutma/.test(s) && /\d|iceloop|vapor|buhar/i.test(s)) return maps.cooling[targetLang] || null;
  return null;
}

function _isProtectedTechnicalAtom(text) {
  const raw = String(text || '').trim();
  if (!raw || /[çğıİöşüÇĞİÖŞÜ]/.test(raw)) return false;
  const foldedRaw = _foldSourceResidueText(raw);
  if (/\b(?:azami|asgari|maksimum|bellek|hafiza|adaptoru|adaptor|guc|sarj|pil|batarya|ozellik(?:leri)?|adedi|sayisi|tipi|turu|versiyonu|surumu|baglanti(?:si)?|destegi|giris(?:i|leri)?|cikis(?:i|lari)?|portu|soketi|uyumu)\b/.test(foldedRaw)) {
    return false;
  }
  const exact = raw.toLowerCase();
  const protectedExact = new Set([
    'nvidia', 'amd', 'intel', 'apple', 'samsung', 'qualcomm', 'mediatek',
    'microsoft', 'windows', 'android', 'ios', 'wear os', 'directx', 'opengl',
    'opencl', 'vulkan', 'dlss', 'nvidia reflex', 'nvidia gpu boost',
    'pci express', 'resizable bar', 'gddr7', 'gddr6', 'ddr5', 'ddr4',
    'wi-fi', 'wifi', 'bluetooth', 'hdmi', 'displayport', 'usb', 'usb-c',
    'thunderbolt', 'nfc', 'gps', 'glonass', 'galileo', 'beidou', 'bds',
    'oled', 'ips', 'wva', 'qhd', 'qhd+', 'uhd', 'uhd+', 'fhd', 'fhd+',
    'rtx', 'gtx', 'geforce', 'geforce rtx', 'radeon', 'ryzen', 'core ultra',
  ]);
  if (protectedExact.has(exact)) return true;
  if (/^(?:NVIDIA\s+)?GeForce\s+RTX\b/i.test(raw)) return true;
  if (/^(?:AMD\s+)?Radeon\b/i.test(raw)) return true;
  if (/^(?:AMD\s+)?Ryzen\b/i.test(raw)) return true;
  if (/^(?:Intel\s+)?Core(?:\s+Ultra)?\b/i.test(raw)) return true;
  if (/^(?:RTX|GTX)\s*\d/i.test(raw)) return true;
  if (/^USB(?:-C)?(?:\s|\d|$)/i.test(raw)) return true;
  if (/^HDMI(?:\s|\d|$)/i.test(raw)) return true;
  if (/^DisplayPort(?:\s|\d|$)/i.test(raw)) return true;
  if (/^Thunderbolt(?:\s|\d|$)/i.test(raw)) return true;
  return false;
}

function _foldSourceResidueText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ')
    .trim();
}

function _translationHasTurkishResidue(targetLang, translation, sourceText = '') {
  if (targetLang === 'tr') return false;
  // NUCLEAR: any Turkish-only character (ç,ğ,ı,İ,ö,ş,ü) in a non-TR translation
  // is automatic rejection — no exceptions. Once this fires, the cached entry
  // is deleted and re-translated. This catches every future leak without
  // needing a per-word rule.
  if (/[çğıİöşüÇĞŞÜÖ]/.test(translation)) return true;
  const folded = _foldSourceResidueText(translation);
  if (!folded) return false;
  const residue = [
    'batarya', 'sarj', 'dakika', 'saat', 'dongu', 'adet', 'adedi',
    'azami', 'asgari', 'maksimum',
    'piksel', 'pil', 'lityum', 'ceyrek', 'goz', 'hizli',
    'uretim', 'uretimi', 'teknoloji', 'teknolojisi',
    'ozellik', 'ozellikleri', 'kamera ozellikleri', 'on kamera',
    'arka kamera', 'ikinci arka', 'ucuncu arka', 'kart okuyucu',
    'klavye', 'minirsel', 'sinirsel', 'yalnizca', 'milyon',
    'guvenlik guncellemesi', 'sogutma', 'navigasyon',
    // 2026-05-24 batch — words still leaking into EN output
    'arka', 'ikinci', 'ucuncu', 'dorduncu', 'besinci', 'birinci',
    'cift', 'hucreli', 'hucre', 'ivmeolc', 'ivmeolcer',
    'parmak', 'izi', 'okuyucu', 'aydinlatma', 'aydinlatmali',
    'tepki', 'suresi', 'ocak', 'subat', 'mart', 'nisan', 'mayis',
    'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik',
    'cikis', 'yili', 'ahirpasaglik',
    // Argos mistranslations that look English but mean something else
    'aauppercase', 'business system', 'curtain speed', 'bulk battery',
    'heavy duty shooting', 'multipiece', 'heart shooting',
    // ── 2026-05-29 batch: Apple Watch / Smartwatch / CPU residue ────────
    // Turkish words Argos passed verbatim into the English hop.
    've', 'ile', 'icin', 'olan', 'olarak', 'gibi', 'kadar', 'sonra',
    'once', 'icindeki', 'arasinda', 'altinda', 'uzerinde',
    'hava', 'resmi', 'tasarruf', 'dolum', 'takibi', 'takip',
    'mesafe', 'gelgit', 'spor', 'kilidi', 'kilit', 'kilitli',
    'yapay', 'zeka', 'sesli', 'audioli', 'sesli not', 'ses mesaj',
    'etmeyin', 'verme', 'verir', 'almak', 'gormek',
    'kalori', 'oksijen', 'kandaki', 'kanda', 'hareketsizlik',
    'nefes', 'stres', 'ritim', 'tansiyon', 'ruh', 'hali',
    'tavsiyesi', 'kimlik', 'uyku', 'apnesi', 'el',
    'aktivite', 'durum', 'cihaz', 'kontrol', 'komut', 'mesaj',
    'modu', 'modunda', 'gunluk', 'haftalik', 'aylik',
    'cagri', 'gecmisi', 'asistan', 'asistani', 'bildirim',
    // Turkish suffix patterns leaking onto English stems
    // ("minutesda", "hourslik", "kameralik") - English word + TR suffix
    'minutesda', 'minutesde', 'hourslik', 'hourslık',
    'audioli', 'audiolu', 'audiosu', 'audionun',
    // Argos word salad — duplicate words, very common pattern
    'offline offline', 'audio audio', 'audioli audioli',
    // Turkish bare verbs/nouns Argos didn't translate
    'gormek', 'duymak', 'almak', 'olcmek', 'soylemek',
    'verme', 'alma', 'gelme', 'gitme', 'yapma',
  ];
  // Catch Argos's signature pattern: English-looking stem glued to a
  // distinctively-Turkish suffix that NO real English word ends with.
  // Examples we've seen leak through: "minutesda" ("minutes" + locative
  // suffix), "hourslik" ("hours" + "-ness/-ity"), "kameralik". Restrict
  // to suffixes that almost never appear at the end of real English words
  // so we don't false-positive things like "mode" or "table".
  const trBrokenSuffix = /\b(?:[a-z]{4,})(?:sda|sde|sta|ste|sdan|sden|stan|sten|slik|slık|sluk|slük|sli|slı|slu|slü|nin|nun|nın|nün|olarak|icin|sinden|sından|cisinden|cisinden)\b/i;
  if (trBrokenSuffix.test(translation)) return true;
  const hasTerm = (term) => new RegExp(`(^|[^a-z0-9])${_escapeRegExp(term)}([^a-z0-9]|$)`, 'i').test(folded);
  if (residue.some(hasTerm)) return true;

  // Root guard: if a source-side Turkish token survives unchanged into a
  // non-TR translation, reject it before it can become a permanent cache hit.
  // This catches future category terms without adding one-off render patches.
  const sourceFolded = _foldSourceResidueText(sourceText);
  const sourceTokens = sourceFolded.match(/[a-z0-9]+/g) || [];
  const protectedTokens = new Set([
    'usb','type','display','port','displayport','hdmi','wi','fi','wifi','bluetooth',
    'ethernet','nfc','gps','hdr','hdr10','oled','amoled','ips','led','mini','sim',
    'esim','nano','ram','rom','cpu','gpu','npu','ssd','hdd','pcie','pci','m2',
    'windows','android','ios','apple','samsung','intel','amd','nvidia','rtx','gtx',
    'dolby','vision','directx','directml','opencl','opengl','vulkan','dlss',
  ]);
  const sourceHasTurkishChars = /[çğıöşü]/i.test(sourceText);
  for (const token of sourceTokens) {
    if (token.length < 4 || protectedTokens.has(token) || /^\d+$/.test(token)) continue;
    const turkishish = residue.includes(token) ||
      (sourceHasTurkishChars && /(lar|ler|lari|leri|sinin|inin|unun|ligi|lıgı|li|lii|si|ci|cu|sel|sal)$/.test(token));
    if (turkishish && hasTerm(token)) return true;
  }
  return false;
}

// JS `\b` is ASCII-only and does NOT recognize Turkish letters (Ö, ç, ş, İ…)
// as word characters. So `\bÖn\b` silently never matches "Ön" at the start
// of a string or surrounded by other Turkish letters. We replace `\b` with
// explicit Unicode lookarounds via a small helper that builds a RegExp with
// negative lookbehind/lookahead for the union of ASCII letters + Turkish
// letters. Use _tb (turkish boundary) instead of \b throughout this module.
const _TR_WORD_CHARS = "A-Za-zÇĞİÖŞÜçğıöşü0-9_";
function _tb(body, flags = 'g') {
  return new RegExp(
    `(?<![${_TR_WORD_CHARS}])(?:${body})(?![${_TR_WORD_CHARS}])`,
    flags
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  FINAL-PASS TRANSLATOR — Turkish word dictionary
//
//  Argos sometimes passes Turkish words through verbatim into the EN
//  output. POST_FIX rules cover the ones we've seen, but every new product
//  category leaks new words. This dictionary covers the long tail.
//  After all POST_FIX rules run, _finalPassTurkishCleanup() walks the
//  output token by token: any token containing TR-only chars (çğıİöşü) is
//  looked up here; if found, replaced with the EN form; otherwise the
//  Turkish chars are transliterated (ç→c, ş→s) so AT LEAST no Turkish
//  letter survives in non-TR output.
// ─────────────────────────────────────────────────────────────────────────
const _TR_WORD_DICT = {
  // pronouns / positions
  'ön': 'front', 'arka': 'rear', 'üst': 'top', 'alt': 'bottom',
  'sol': 'left', 'sağ': 'right', 'iç': 'inner', 'dış': 'outer',
  'ana': 'main', 'yan': 'side', 'orta': 'middle',
  // ordinals
  'birinci': 'first', 'ikinci': 'second', 'üçüncü': 'third', 'dördüncü': 'fourth',
  'beşinci': 'fifth', 'altıncı': 'sixth', 'yedinci': 'seventh',
  // numbers (when written out)
  'bir': 'one', 'iki': 'two', 'üç': 'three', 'dört': 'four', 'beş': 'five',
  'altı': 'six', 'yedi': 'seven', 'sekiz': 'eight', 'dokuz': 'nine', 'on': 'ten',
  'yüz': 'hundred', 'bin': 'thousand', 'milyon': 'million', 'milyar': 'billion',
  // common spec nouns
  'kamera': 'camera', 'ekran': 'screen', 'pil': 'battery', 'batarya': 'battery',
  'şarj': 'charging', 'klavye': 'keyboard', 'fare': 'mouse', 'işlemci': 'processor',
  'bellek': 'memory', 'depolama': 'storage', 'hoparlör': 'speaker',
  'mikrofon': 'microphone', 'kulaklık': 'headphone', 'sensör': 'sensor',
  'sensörler': 'sensors', 'sensörü': 'sensor', 'çekirdek': 'core', 'çekirdekli': 'core',
  'işlem': 'process', 'görüntü': 'image', 'video': 'video', 'ses': 'audio',
  'müzik': 'music', 'film': 'movie', 'oyun': 'game', 'uygulama': 'application',
  'sistem': 'system', 'ağ': 'network', 'bağlantı': 'connection',
  'parmak': 'finger', 'izi': 'print', 'yüz': 'face', 'göz': 'eye', 'kalp': 'heart',
  'okuyucu': 'reader', 'tarayıcı': 'scanner', 'gösterge': 'indicator',
  'düğme': 'button', 'tuş': 'key', 'dokunmatik': 'touch', 'fiş': 'plug', 'jak': 'jack',
  'soket': 'socket', 'kablo': 'cable', 'kablosuz': 'wireless', 'kablolu': 'wired',
  'tip': 'type', 'tipi': 'type', 'türü': 'type', 'şekil': 'shape', 'biçim': 'form',
  'boyut': 'size', 'boyutu': 'size', 'boyutlar': 'dimensions', 'boyutları': 'dimensions',
  'ağırlık': 'weight', 'ağırlığı': 'weight', 'renk': 'color', 'rengi': 'color',
  'renkler': 'colors', 'malzeme': 'material', 'malzemesi': 'material',
  'kapasite': 'capacity', 'kapasitesi': 'capacity', 'hız': 'speed', 'hızı': 'speed',
  'hızlı': 'fast', 'yavaş': 'slow', 'güç': 'power', 'gücü': 'power',
  'verim': 'efficiency', 'verimlilik': 'efficiency', 'performans': 'performance',
  'kalite': 'quality', 'kalitesi': 'quality',
  // display
  'piksel': 'pixel', 'çözünürlük': 'resolution', 'parlaklık': 'brightness',
  'kontrast': 'contrast', 'yenileme': 'refresh', 'tepki': 'response',
  'süresi': 'time', 'süre': 'time', 'oran': 'ratio', 'oranı': 'ratio',
  'genişlik': 'width', 'yükseklik': 'height', 'derinlik': 'depth',
  'inç': 'inch', 'çentik': 'notch', 'çentikli': 'notched', 'kavisli': 'curved',
  'düz': 'flat', 'yuvarlak': 'round', 'kare': 'square',
  // camera
  'odak': 'focus', 'odaklama': 'focus', 'optik': 'optical', 'dijital': 'digital',
  'analog': 'analog', 'yakınlaştırma': 'zoom', 'açı': 'angle', 'açılı': 'angle',
  'geniş': 'wide', 'dar': 'narrow', 'derin': 'deep', 'yüzeysel': 'shallow',
  'diyafram': 'aperture', 'perde': 'shutter', 'pozlama': 'exposure',
  'kare': 'frame', 'çekim': 'shooting', 'kayıt': 'recording', 'kayıtlı': 'recorded',
  'düzeltme': 'correction', 'düzeltmesi': 'correction',
  // network
  'gezgin': 'mobile', 'taşınabilir': 'portable', 'sabit': 'fixed',
  'frekans': 'frequency', 'frekansı': 'frequency', 'bant': 'band',
  'bandı': 'band', 'kanal': 'channel', 'sinyal': 'signal',
  'navigasyon': 'navigation', 'pusula': 'compass', 'konum': 'location',
  // power
  'döngü': 'cycle', 'döngüsü': 'cycle', 'döngüleri': 'cycles',
  'dakika': 'minute', 'saat': 'hour', 'gün': 'day', 'hafta': 'week',
  'ay': 'month', 'yıl': 'year', 'saniye': 'second',
  // os / software
  'sürüm': 'version', 'sürümü': 'version', 'güncelleme': 'update',
  'güncellemesi': 'update', 'güvenlik': 'security', 'güvenli': 'secure',
  'arayüz': 'interface', 'arayüzü': 'interface',
  // misc
  'çift': 'dual', 'tek': 'single', 'hücre': 'cell', 'hücreli': 'cell',
  'çoklu': 'multi', 'tekli': 'single', 'çift': 'dual',
  'destek': 'support', 'destekli': 'supported', 'destekleyen': 'supporting',
  'standart': 'standard', 'özel': 'special', 'genel': 'general',
  'evet': 'yes', 'hayır': 'no', 'var': 'yes', 'yok': 'no',
  'mevcut': 'available', 'gerekli': 'required',
  'aydınlatma': 'lighting', 'aydınlatmalı': 'backlit',
  'soğutma': 'cooling', 'ısıtma': 'heating', 'buhar': 'steam',
  'ivme': 'acceleration', 'ivmeölçer': 'accelerometer',
  'ivmeölç': 'accelerometer', 'jiroskop': 'gyroscope', 'pusula': 'compass',
  'barometre': 'barometer', 'termometre': 'thermometer',
  'sertifika': 'certificate', 'sertifikası': 'certificate', 'sertifikalı': 'certified',
  'garanti': 'warranty', 'garantisi': 'warranty',
  // measurement adjectives
  'yüksek': 'high', 'düşük': 'low', 'maksimum': 'maximum', 'minimum': 'minimum',
  'ortalama': 'average', 'toplam': 'total', 'kısmi': 'partial',
  // brand value collisions seen in real data
  'çentikli (notch)': 'notch',
  // months
  'ocak': 'january', 'şubat': 'february', 'mart': 'march', 'nisan': 'april',
  'mayıs': 'may', 'haziran': 'june', 'temmuz': 'july', 'ağustos': 'august',
  'eylül': 'september', 'ekim': 'october', 'kasım': 'november', 'aralık': 'december',
  // common verbs / actions
  'çıkış': 'release', 'yılı': 'year', 'duyuru': 'announcement',
  'tarihi': 'date', 'tarih': 'date',
  // ASCII Turkish forms (no special chars) — also need to translate
  'cikis': 'release', 'yili': 'year', 'sayisi': 'count', 'sayi': 'count',
  'turu': 'type', 'cozunurlugu': 'resolution', 'cozunurluk': 'resolution',
  'genisligi': 'width', 'yuksekligi': 'height', 'derinligi': 'depth',
  'agirligi': 'weight', 'agirlik': 'weight', 'buyukluk': 'size',
  'parlaklik': 'brightness', 'aydinlatma': 'lighting', 'aydinlatmali': 'backlit',
  'kalitesi': 'quality', 'kalite': 'quality', 'hizi': 'speed', 'hiz': 'speed',
  'omru': 'life', 'gucu': 'power', 'guvenligi': 'security',
  'sicakligi': 'temperature', 'sicaklik': 'temperature',
  'kayitli': 'recorded', 'kayit': 'recording', 'kontrolu': 'control',
  'isleme': 'processing', 'islem': 'process', 'islemi': 'process',
  'donanim': 'hardware', 'yazilim': 'software',
  'gosterici': 'indicator', 'sistemi': 'system', 'birimi': 'unit',
  'ozelligi': 'feature', 'durumu': 'status', 'modulu': 'module',
  'yuzeyi': 'surface', 'kapagi': 'cover', 'koruyucu': 'protective',
  'gosterimi': 'display', 'gosterim': 'display', 'gosterge': 'indicator',
  'koruma': 'protection', 'sinifi': 'class', 'seviyesi': 'level',
  'sinyali': 'signal', 'sinyal': 'signal', 'bilgisi': 'info',
  'numarasi': 'number', 'numara': 'number', 'kodu': 'code', 'kod': 'code',
  'agi': 'network', 'kademesi': 'tier', 'kademe': 'tier',
  'kameralar': 'cameras', 'arabulucu': 'mediator',
  'olcumu': 'measurement', 'olcum': 'measurement', 'sayaci': 'counter',
  'sayim': 'count', 'sicakligi': 'temperature',
  'frekansi': 'frequency', 'frekans': 'frequency', 'bandi': 'band',
  'donus': 'rotation', 'donme': 'rotation',
  'arttirma': 'expansion', 'artirma': 'expansion', 'genisleme': 'expansion',
  'genisletme': 'extension', 'ekleme': 'addition',
  'cikartilabilir': 'removable', 'cikarilabilir': 'removable',
  'takilabilir': 'attachable', 'sokulebilir': 'detachable',
  'desteklenen': 'supported', 'desteklemeyen': 'unsupported',
  'gosterim': 'display', 'engelleyici': 'blocker',
  'azaltma': 'reduction', 'arttirici': 'amplifier',
  'erisim': 'access', 'erisimi': 'access',
  'islemci': 'processor', 'islemcisi': 'processor', 'islemciler': 'processors',
  'cekirdek': 'core', 'cekirdeginin': 'core', 'cekirdekleri': 'cores',
  'verimlilik': 'efficiency', 'verim': 'efficiency',
  'performansi': 'performance', 'performans': 'performance',
  'cikisi': 'output', 'cikislari': 'outputs',
  'girisi': 'input', 'girisleri': 'inputs', 'giris': 'input',
  'baglantisi': 'connection', 'baglanti': 'connection', 'baglantilar': 'connections',
  'baglantilari': 'connections', 'soketi': 'socket', 'soket': 'socket',
  'kabloyla': 'wired', 'kablosuz': 'wireless', 'kablosuza': 'wireless',
  'klavye': 'keyboard', 'klavyesi': 'keyboard',
  'fare': 'mouse', 'faresi': 'mouse',
  'pil': 'battery', 'pili': 'battery', 'pilin': 'battery',
  'batarya': 'battery', 'bataryasi': 'battery', 'bataryanin': 'battery',
  'depolama': 'storage', 'depolamasi': 'storage', 'depo': 'storage',
  'bellek': 'memory', 'bellegi': 'memory', 'bellegin': 'memory',
  'sogutma': 'cooling', 'sogutucu': 'cooler', 'sogutmali': 'cooled',
  'isitma': 'heating', 'isitici': 'heater',
  'buhar': 'steam', 'buharli': 'steam',
  'mavi': 'blue', 'siyah': 'black', 'beyaz': 'white', 'gri': 'gray',
  'kirmizi': 'red', 'yesil': 'green', 'sari': 'yellow', 'turuncu': 'orange',
  'mor': 'purple', 'pembe': 'pink', 'kahverengi': 'brown',
  'gumus': 'silver', 'altin': 'gold',
  'parlak': 'glossy', 'mat': 'matte', 'metalik': 'metallic',
  'plastik': 'plastic', 'cam': 'glass', 'metal': 'metal',
  'silikon': 'silicon', 'karbon': 'carbon', 'aluminyum': 'aluminum',
  'celik': 'steel', 'titanyum': 'titanium',
  'genel': 'general', 'temel': 'basic', 'gelismis': 'advanced',
  'sade': 'simple', 'karmasik': 'complex',
  'olcusu': 'size', 'olcu': 'measure', 'olcekli': 'scalable',
  'paket': 'package', 'paketi': 'package',
  'kutu': 'box', 'kutusu': 'box', 'icerigi': 'content', 'icerik': 'content',
  'icerikli': 'with content',
  'firma': 'company', 'firmasi': 'company',
  'marka': 'brand', 'markasi': 'brand',
  'model': 'model', 'modeli': 'model',
  'seri': 'series', 'serisi': 'series', 'serinin': 'series',
  'urun': 'product', 'urunler': 'products', 'urunun': 'product',
  // broad Epey suffix forms seen across real category scrapes
  'ozellik': 'feature', 'ozelligi': 'feature', 'ozellikleri': 'features',
  'detay': 'detail', 'detayi': 'detail', 'detaylari': 'details',
  'yogunluk': 'density', 'yogunlugu': 'density',
  'alan': 'area', 'alani': 'area',
  'dayaniklilik': 'durability', 'dayanikliligi': 'durability',
  'dayanikli': 'resistant', 'direnc': 'resistance', 'direnci': 'resistance',
  'destegi': 'support', 'desteği': 'support',
  'versiyon': 'version', 'versiyonu': 'version',
  'kanal': 'channel', 'kanali': 'channel', 'kanallari': 'channels',
  'kapak': 'cover', 'kapagi': 'cover',
  'govde': 'body', 'govdesi': 'body',
  'cerceve': 'frame', 'cercevesi': 'frame', 'cercevesiz': 'frameless',
  'tasarim': 'design', 'tasarimi': 'design',
  'uzay': 'space', 'uzayi': 'space',
  'derinlik': 'depth', 'derinligi': 'depth',
  'hassasiyet': 'accuracy', 'hassasiyeti': 'accuracy',
  'yaricap': 'radius', 'yaricapi': 'radius',
  'tarafli': 'sided', 'kaplamali': 'coated',
  'yansimasiz': 'anti-glare', 'yansitma': 'mirroring',
  'uzaktan': 'remote', 'kumanda': 'control',
  'dusuk': 'low', 'yuksek': 'high',
  'kavis': 'curve', 'kavisli': 'curved',
  'kisisellestirilebilir': 'customizable',
  'sert': 'hard', 'maks': 'max', 'maksimum': 'maximum',
  'islak': 'wet', 'parmak': 'finger', 'algilama': 'detection',
  'cizilmeye': 'scratch', 'direncli': 'resistant',
  'surekli': 'continuous', 'acik': 'on', 'icinde': 'inside',
  'dokunma': 'touch', 'dokunarak': 'tapping',
  'renk': 'color', 'rengi': 'color', 'renkleri': 'colors',
  'renkli': 'color', 'tonlu': 'tone',
  'sabitleyici': 'stabilizer', 'sabitleme': 'stabilization',
  'portre': 'portrait', 'modu': 'mode', 'mod': 'mode',
  'sahne': 'scene', 'yapay': 'artificial', 'zeka': 'intelligence',
  'otomatik': 'automatic', 'sesli': 'voice', 'sesle': 'voice',
  'komut': 'command', 'kontrol': 'control', 'kontrolu': 'control',
  'lazer': 'laser', 'yapabilme': 'support', 'zamanlayici': 'timer',
  'elementli': 'element', 'acili': 'angle', 'ekstra': 'extra',
  'makro': 'macro', 'telefoto': 'telephoto', 'degisken': 'variable',
  'sanal': 'virtual', 'iyilestirme': 'enhancement',
  'dijital': 'digital', 'goruntu': 'image', 'goruntulu': 'video',
  'cekirdegi': 'core', 'cekirdek': 'core', 'cekirdekleri': 'cores',
  'yardimci': 'auxiliary', 'mimari': 'architecture', 'mimarisi': 'architecture',
  'onbellek': 'cache', 'teknolojileri': 'technologies',
  'artirilmis': 'boost', 'azami': 'maximum', 'temel': 'base',
  'markasi': 'brand', 'marka': 'brand',
  'modeli': 'model', 'serisi': 'series',
  'dahili': 'internal', 'bicim': 'format', 'bicimi': 'format',
  'karti': 'card', 'kart': 'card',
  'kalinlik': 'thickness', 'en': 'width', 'boy': 'height',
  'malzemesi': 'material', 'paslanmaz': 'stainless',
  'frekanslari': 'frequencies', 'frekans': 'frequency',
  'isletim': 'operating', 'sistemi': 'system',
  'lansman': 'launch', 'arayuz': 'interface',
  'kizilotesi': 'infrared', 'radyo': 'radio',
  'suya': 'water', 'toza': 'dust',
  'seviyesi': 'level', 'sinifi': 'class',
  'konusma': 'calling', 'bildirim': 'notification',
  'isigi': 'light', 'bas': 'head', 'vucut': 'body',
  'servis': 'services', 'uygulamalar': 'applications',
  'baska': 'other', 'cihazlari': 'devices', 'edebilme': 'support',
  'karanlik': 'dark', 'tek': 'single', 'elde': 'hand',
  'kullanim': 'use', 'ters': 'reverse',
  'tanimlama': 'identification', 'yuz': 'face',
  'icerigi': 'content', 'cikartma': 'eject', 'ignesi': 'pin',
  'hat': 'line', 'duyurulma': 'announcement',
  'kullanım': 'use', 'kilavuzu': 'manual',
  'secenekleri': 'options', 'secenek': 'option',
  'degeri': 'value', 'puan': 'score', 'puani': 'score',
  'flas': 'flash', 'acikligi': 'aperture',
  'uzakligi': 'distance',
  'degisir': 'removable', 'agir': 'slow',
  'hafiza': 'memory', 'diger': 'other', 'ozellikler': 'features',
  'grafik': 'graphics', 'gurultu': 'noise', 'engelleme': 'cancellation',
  'dinleme': 'listening', 'pasif': 'passive', 'onleme': 'prevention',
  'yakinlik': 'proximity', 'ortam': 'ambient', 'isigi': 'light',
  'cihaz': 'device', 'cihazlari': 'devices',
  'uyum': 'compatibility', 'uyumu': 'compatibility',
  'yonlu': 'way', 'alici': 'receiver', 'ile': 'with',
  'resim': 'image', 'oynatma': 'playback',
  'akilli': 'smart', 'bildirimler': 'notifications',
  'calar': 'player', 'telefonumu': 'my phone', 'bul': 'find',
  'kumandasi': 'control', 'takvim': 'calendar',
  'medya': 'media', 'oynatici': 'player',
  'hatirlaticilar': 'reminders', 'harita': 'map', 'haritalar': 'maps',
  'hesap': 'calculator', 'makinesi': 'machine',
  'gelen': 'incoming', 'aramalari': 'calls', 'yonetme': 'management',
  'eslesme': 'pairing', 'asistan': 'assistant',
  'arama': 'call', 'gecmisi': 'history',
  'goruntusu': 'image', 'alma': 'capture',
  'fonksiyonel': 'functional', 'yanit': 'reply',
  'konumlandirma': 'positioning', 'not': 'note', 'notu': 'note',
  'gonderme': 'sending', 'cagri': 'call', 'reddetme': 'rejection',
  'cevrimdisi': 'offline',
  'saglik': 'health', 'sagligi': 'health',
  'sertifikasyon': 'certification', 'sertifikasyonu': 'certification',
  'sertifikasi': 'certification', 'goz': 'eye',
  'polimer': 'polymer',
  'eyesafe': 'Eyesafe', 'tüv': 'TÜV', 'tuv': 'TÜV', 'rheinland': 'Rheinland',
  'uretici': 'manufacturer', 'verisi': 'data',
  'sonrasi': 'after', 'parlakligi': 'brightness',
  'aramasi': 'calling', 'aralik': 'range', 'araligi': 'range',
  'izleme': 'viewing', 'acisi': 'angle', 'yatay': 'horizontal', 'dikey': 'vertical',
  'titresim': 'flicker', 'titresimi': 'flicker', 'filtresi': 'filter',
  'yaninda': 'beside', 'uyumlu': 'compatible',
  'amac': 'purpose', 'amaci': 'purpose',
  'tusu': 'key', 'tuslari': 'keys', 'oyuncu': 'gaming',
  'guvenilir': 'trusted', 'platform': 'platform', 'modulu': 'module',
  'ayarlanabilir': 'adjustable', 'kafa': 'head', 'bandi': 'band',
  'yastik': 'cushion', 'yastigi': 'cushion',
  'guclu': 'powerful', 'degisebilir': 'replaceable',
  'kulak': 'ear', 'hafizali': 'memory foam', 'tekstil': 'fabric',
};

function _lookupTurkishWord(lower, folded) {
  const direct = _TR_WORD_DICT[lower] || _TR_WORD_DICT[folded];
  if (direct) return direct;
  const f = String(folded || '');
  const variants = new Set();
  const add = (v) => { if (v && v.length >= 3) variants.add(v); };
  // Common Turkish possessed/adjectival suffixes after ASCII folding.
  if (/(ligi|ligi|lugu|lugu|ligi)$/.test(f)) {
    add(f.replace(/ligi$/, 'lik'));
    add(f.replace(/lugu$/, 'luk'));
    add(f.replace(/ligi$/, 'lik'));
  }
  if (/(gı|gi|gu|gu|i|u|si|sı|su|sü)$/.test(f)) {
    add(f.replace(/(si|sı|su|sü)$/u, ''));
    add(f.replace(/[iu]$/u, ''));
    add(f.replace(/g[ıiuu]$/u, 'k'));
  }
  if (/(lari|leri|lar|ler)$/.test(f)) add(f.replace(/(lari|leri|lar|ler)$/, ''));
  if (/(masi|mesi)$/.test(f)) add(f.replace(/(masi|mesi)$/, 'ma'));
  if (/(tici|tici|ici|ucu|ucu)$/.test(f)) add(f.replace(/(ici|ucu)$/, ''));
  for (const v of variants) {
    if (_TR_WORD_DICT[v]) return _TR_WORD_DICT[v];
  }
  return null;
}

// Simple ASCII transliteration for Turkish-only chars. Last-resort safety net:
// if a word isn't in _TR_WORD_DICT, at least replace Turkish characters so
// the output has no foreign letters.
function _trToAscii(text) {
  return String(text || '')
    .replace(/Ç/g, 'C').replace(/ç/g, 'c')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .replace(/Ö/g, 'O').replace(/ö/g, 'o')
    .replace(/Ş/g, 'S').replace(/ş/g, 's')
    .replace(/Ü/g, 'U').replace(/ü/g, 'u');
}

function _applyCaseLike(sourceWord, replacement) {
  const rep = String(replacement || '');
  if (!rep) return sourceWord;
  if (sourceWord === sourceWord.toUpperCase()) return rep.toUpperCase();
  if (sourceWord[0] === sourceWord[0].toUpperCase()) return rep[0].toUpperCase() + rep.slice(1);
  return rep;
}

function _sourceAwareTurkishWordMap(sourceText) {
  const map = new Map();
  const tokens = String(sourceText || '').match(/[A-Za-zÇĞİÖŞÜçğıöşü]+/g) || [];
  const protectedAscii = new Set([
    'a','an','and','as','at','by','for','from','in','into','not','of','on','or','the','to','with',
    'always','display','touch','sampling','rate','sensor','camera','video','audio','hdr',
    'usb','type','hdmi','bluetooth','wi','fi','wifi','nfc','gps','ram','rom','cpu','gpu','npu',
    'dolby','vision','freesync','sync','nvidia','amd','intel','microsoft','windows','apple',
    'samsung','huawei','qualcomm','snapdragon','mediatek','razer','tp','link','sony','philips',
    'hdr10','oled','ltpo','dci','p3','mimo','mlo','airplay','bixby','knox','smartthings',
    'true','tone','prores','promotion','retina','xdr','displayport','thunderbolt',
    'eyesafe','tuv','tüv','rheinland','x','rite',
  ]);
  const sourceHasTurkishChars = /[çğıİöşüÇĞŞÜÖ]/.test(sourceText || '');
  for (const token of tokens) {
    const lower = token.toLowerCase();
    const hasTrChars = /[çğıİöşüÇĞŞÜÖ]/.test(token);
    const folded = _foldSourceResidueText(token);
    if (protectedAscii.has(lower) || protectedAscii.has(folded)) continue;
    const exact = _lookupTurkishWord(lower, folded);
    const foldedHit = exact;
    if (exact) map.set(folded, exact);
    else if (foldedHit) map.set(folded, foldedHit);
    else if (hasTrChars && folded.length >= 4 && !protectedAscii.has(folded)) {
      map.set(folded, '');
    } else if (
      sourceHasTurkishChars &&
      folded.length >= 4 &&
      !protectedAscii.has(folded) &&
      /(ligi|lugu|leri|lari|masi|mesi|sayi|sayisi|boyutu|bellegi|islemci|islemcisi|ozellik|ozellikleri|sertifika|sertifikasyon|saglik|sagligi|polimer|azami)$/i.test(folded)
    ) {
      map.set(folded, '');
    }
  }
  return map;
}

// Walk the translation token-by-token. For any token containing Turkish-only
// chars, look it up in _TR_WORD_DICT. If found, swap. Otherwise transliterate
// so no Turkish letter survives. It also handles ASCII-looking Turkish words
// ("Bellek", "Ana", "Pil", "Boyutu") when the same source token survived
// into the English output. Preserves case heuristically.
// Words seen during the current session that have TR chars but no dict entry.
// Drained at scrape end by _flushUnknownTurkishWords() which sends them to
// Argos as single-word translation requests, then permanently adds the
// results to _TR_WORD_DICT + the PocketBase dictionary. THIS is the
// self-healing loop: any new TR word the system encounters is auto-learned.
const _unknownTrWords = new Set();

// Common English short words that happen to collide with Turkish dict keys —
// must never be auto-translated. Add aggressively; safer to skip a Turkish
// match than to mangle real English text.
const _ENGLISH_PROTECTED_ASCII = new Set([
  'on','off','an','as','at','be','by','do','el','ev','go','he','if','in','is',
  'it','me','my','no','of','or','so','to','up','us','we','am','old','new','low',
  'high','top','bot','one','two','six','ten','red','car','bag','bar','can','set',
  'led','box','arm','air','net','run','use','out','for','our','any','add','all',
  'and','but','not','put','say','see','sit','sub','tap','the','try','vue','was',
  'who','win','you','your','from','this','that','with','have','here','more','some',
  'when','what','will','time','than','also','date','data','very','were','make',
  'most','only','over','such','take','than','them','well','many','main','same',
  'side','full','last','next','open','play','show','step','tone','type','user',
  'view','wait','wake','wave','week','wide','wild','wind','work','year','your',
  'zone','life','line','live','look','lose','love','lock','long','loop','lost',
  'mode','need','note','past','pole','pop','part','past','play','plus','port',
  'post','rain','rare','rate','read','real','rear','ride','ring','rock','rose',
  'safe','save','seem','sell','send','sent','sent','sing','size','skin','slow',
  'small','smell','soft','sold','solid','song','sort','sound','span','spec',
  'speed','spin','spot','star','start','state','stay','step','stop','sure',
  'swim','tab','take','talk','tape','task','tax','test','text','thin','this',
  'tier','tile','tip','tire','too','total','tour','town','town','tray','tree',
  'turn','type','unit','unix','upon','wall','want','war','ward','warm','way',
  'wear','what','when','win','wing','wire','wise','wish','wood','wool','wood',
  'word','work','yard','year','yes','yet','your',
]);

function _finalPassTurkishCleanup(text, sourceText = '') {
  if (!text) return text;
  const sourceMap = _sourceAwareTurkishWordMap(sourceText);
  const sourceHasTurkish = /[çğıİöşüÇĞŞÜÖ]/.test(sourceText || '');
  // ALWAYS run if any TR chars in output OR any TR chars in source — Argos
  // emits ASCII-folded Turkish ("Sertifikasyonu") even when source had ş/ğ/ı.
  if (!/[çğıİöşüÇĞŞÜÖ]/.test(text) && !sourceMap.size && !sourceHasTurkish) return text;
  return String(text).replace(/[A-Za-zÇĞİÖŞÜçğıöşü]+/g, (word) => {
    const lower = word.toLowerCase();
    const folded = _foldSourceResidueText(word);
    const hasTrChars = /[çğıİöşüÇĞŞÜÖ]/.test(word);
    // Hands-off: known English short words (length < 5) that could collide
    // with the Turkish dictionary. Only protect ASCII tokens — Turkish-char
    // tokens are always Turkish.
    if (!hasTrChars && _ENGLISH_PROTECTED_ASCII.has(lower)) return word;
    const sourceHit = sourceMap.has(folded) ? sourceMap.get(folded) : undefined;
    // Try dict for BOTH TR-char and ASCII words. ASCII Turkish words like
    // "Sertifikasyonu", "Bellek", "Boyutu" are now caught even without
    // sourceMap entry.
    const dictHit = _lookupTurkishWord(lower, folded);
    const hit = dictHit ?? sourceHit;
    if (hit !== undefined) {
      if (!hit) return '';
      return _applyCaseLike(word, hit);
    }
    if (!hasTrChars) return word;
    // No dict entry: queue for background learning AND drop the token so
    // we never ship Turkish letters. Next scrape, the queued translation
    // will produce a real English word.
    if (lower.length >= 3) _unknownTrWords.add(lower);
    return '';
  });
}


function _normalizeTurkishSourceTranslation(sourceText, targetLang, translation) {
  let out = String(translation || '').trim();
  if (!out) return '';
  if (targetLang === 'en') {
    const reps = [
      // ── Battery / power ──
      [_tb('Çift\\s+Hücreli\\s+Battery', 'gi'), 'Dual-cell battery'],
      [_tb('Çift\\s+Hücreli', 'gi'), 'Dual-cell'],
      [_tb('Hücreli', 'gi'), 'cell'],
      [_tb('Hücre', 'gi'), 'cell'],
      [_tb('Çift', 'g'), 'Dual'],
      [_tb('Batarya', 'gi'), 'Battery'],
      [_tb('Pil\\s+Specifications', 'gi'), 'Battery specifications'],
      [_tb('Pil\\s+Ömrü', 'gi'), 'Battery life'],
      [_tb('Pil', 'gi'), 'Battery'],
      [/Li-?po\s*\(\s*lityum-polymer\s*\)/gi, 'Li-Po (lithium polymer)'],
      [_tb('lityum', 'gi'), 'lithium'],
      [_tb('Battery\\s+time\\s+after\\s+charging', 'gi'), 'Battery life after charging'],
      [_tb('Charging\\s+loop\\s+count', 'gi'), 'Charging cycle count'],
      [/Charging\s+cycle\s+count\s*\(\s*ab\s*\)/gi, 'Charging cycle count'],
      [_tb('Bulk\\s+battery', 'gi'), 'Removable battery'],

      // ── Camera ──
      [_tb('Heavy\\s+duty\\s+shooting\\s+recording\\s+options', 'gi'), 'Slow motion video recording options'],
      [_tb('Heavy\\s+duty\\s+shooting', 'gi'), 'Slow motion'],
      [_tb('Slow\\s+shooting\\s+video\\s+recording', 'gi'), 'Slow motion video recording'],
      [/Slow\s+shooting\s+\(\s*slow\s+motion\s*\)\s+video\s+recording/gi, 'Slow motion video recording'],
      [/Curtain\s+speed\s*\(\s*shutter\s+speed\s*\)\s*control/gi, 'Shutter speed control'],
      [_tb('Curtain\\s+speed', 'gi'), 'Shutter speed'],
      [/Series\s+shooting\s*\(\s*burst\s*\)\s*mode/gi, 'Burst shooting mode'],
      [/Heart\s+shooting\s+speed\s+sensor/gi, 'Heart rate sensor'],
      [/Kalp\s+atış\s+hızı\s+sensörü/gi, 'Heart rate sensor'],

      // ── Position / ordinals (CRITICAL — these never worked before) ──
      [_tb('İkinci\\s+Arka\\s+Camera', 'gi'), 'Second rear camera'],
      [_tb('Üçüncü\\s+Arka\\s+Camera', 'gi'), 'Third rear camera'],
      [_tb('Dördüncü\\s+Arka\\s+Camera', 'gi'), 'Fourth rear camera'],
      [_tb('Ön\\s+Camera', 'gi'), 'Front camera'],
      [_tb('Arka\\s+Camera', 'gi'), 'Rear camera'],
      [_tb('Ana\\s+Camera', 'gi'), 'Main camera'],
      [_tb('İkinci\\s+Rear', 'gi'), 'Second rear'],
      [_tb('Üçüncü\\s+Rear', 'gi'), 'Third rear'],
      [_tb('Dördüncü\\s+Rear', 'gi'), 'Fourth rear'],
      [_tb('Ön\\s+Rear', 'gi'), 'Front'],
      [_tb('Arka\\s+Rear', 'gi'), 'Rear'],
      // Section titles like "Ön Camera Specifications"
      [/(?<![A-Za-zÇĞİÖŞÜçğıöşü])Ön\s+([A-Z][a-z]+\s+Specifications)(?![A-Za-zÇĞİÖŞÜçğıöşü])/g, 'Front $1'],
      [/(?<![A-Za-zÇĞİÖŞÜçğıöşü])Arka\s+([A-Z][a-z]+\s+Specifications)(?![A-Za-zÇĞİÖŞÜçğıöşü])/g, 'Rear $1'],
      [/(?<![A-Za-zÇĞİÖŞÜçğıöşü])Üçüncü\s+([A-Z][a-z]+\s+camera\s+Specifications)(?![A-Za-zÇĞİÖŞÜçğıöşü])/gi, 'Third $1'],
      [/(?<![A-Za-zÇĞİÖŞÜçğıöşü])İkinci\s+([A-Z][a-z]+\s+camera\s+Specifications)(?![A-Za-zÇĞİÖŞÜçğıöşü])/gi, 'Second $1'],
      [_tb('Ön', 'g'), 'Front'],
      [_tb('Arka', 'gi'), 'Rear'],
      [_tb('İkinci', 'gi'), 'Second'],
      [_tb('Üçüncü', 'gi'), 'Third'],
      [_tb('Birinci', 'gi'), 'First'],
      [_tb('Dördüncü', 'gi'), 'Fourth'],
      [_tb('Beşinci', 'gi'), 'Fifth'],
      [/(?<![A-Za-zÇĞİÖŞÜçğıöşü])Ana(?=\s+[A-Z])/g, 'Main'],

      // ── Sensor / fingerprint ──
      [_tb('Parmak\\s+izi\\s+Okuyucu\\s+Specifications', 'gi'), 'Fingerprint reader specifications'],
      [_tb('Parmak\\s+izi\\s+okuyucu', 'gi'), 'Fingerprint reader'],
      [_tb('Parmak\\s+İzi\\s+Okuyucu', 'gi'), 'Fingerprint reader'],
      [_tb('Parmak\\s+izi', 'gi'), 'Fingerprint'],
      [_tb('Parmak\\s+İzi', 'gi'), 'Fingerprint'],
      [_tb('Ivmeölçer', 'gi'), 'Accelerometer'],
      [_tb('İvmeölçer', 'gi'), 'Accelerometer'],
      [_tb('Ivmeölç', 'gi'), 'Accelerometer'],
      [_tb('İvmeölç', 'gi'), 'Accelerometer'],
      [_tb('Ivme', 'gi'), 'Acceleration'],
      [_tb('İvme', 'gi'), 'Acceleration'],
      [_tb('Sensörler', 'gi'), 'Sensors'],
      [_tb('Sensörü', 'gi'), 'Sensor'],
      [_tb('Sensör', 'gi'), 'Sensor'],

      // ── Section headers (anchored — only exact match) ──
      [/^Tags$/i, 'Sensors'],
      [/^Multipiece$/i, 'Multimedia'],
      [/^Business\s+system$/i, 'Operating system'],
      [/^Business\s+System$/i, 'Operating System'],
      [/^Specific$/i, 'Special features'],
      [/^News$/i, 'Stereo'],
      [_tb('Multipiece', 'g'), 'Multimedia'],
      [_tb('Business\\s+system', 'gi'), 'Operating system'],

      // ── Dates / years ──
      [_tb('Output\\s+year', 'gi'), 'Release year'],
      [_tb('Output\\s+Year', 'g'), 'Release Year'],
      [_tb('Çıkış\\s+yılı', 'gi'), 'Release year'],
      [_tb('Çıkış\\s+Yılı', 'g'), 'Release Year'],
      [_tb('Duyuru\\s+tarihi', 'gi'), 'Announcement date'],
      [_tb('Ocak', 'g'), 'January'],
      [_tb('Şubat', 'g'), 'February'],
      [_tb('Mart', 'g'), 'March'],
      [_tb('Nisan', 'g'), 'April'],
      [_tb('Mayıs', 'g'), 'May'],
      [_tb('Haziran', 'g'), 'June'],
      [_tb('Temmuz', 'g'), 'July'],
      [_tb('Ağustos', 'g'), 'August'],
      [_tb('Eylül', 'g'), 'September'],
      [_tb('Ekim', 'g'), 'October'],
      [_tb('Kasım', 'g'), 'November'],
      [_tb('Aralık', 'g'), 'December'],

      // ── Lighting / display ──
      [_tb('Aydınlatmalı', 'gi'), 'Backlit'],
      [_tb('Aydınlatma', 'gi'), 'Lighting'],
      [_tb('Tepki\\s+Süresi', 'gi'), 'Response Time'],
      [_tb('Tepki', 'gi'), 'Response'],
      [_tb('Süresi', 'gi'), 'Time'],

      // ── Existing rules (with proper boundaries) ──
      [/(\d{4})\s+([1-4])\.?\s*Çeyrek/gi, '$1 Q$2'],
      [_tb('göz\\s+health\\s+certification', 'gi'), 'eye health certification'],
      [_tb('göz', 'gi'), 'eye'],
      [_tb('Non-flammable\\s+mat\\s+display', 'gi'), 'Anti-glare matte display'],
      [/^Faster$/i, 'Fast charging'],
      [/^Supply ability:\s*low frequency$/i, 'Efficiency core base frequency'],
      [_tb('Navigasyon', 'gi'), 'Navigation'],
      [_tb('Kart\\s+Okuyucu', 'gi'), 'Card reader'],
      [_tb('Klavye', 'gi'), 'Keyboard'],
      [_tb('Adedi', 'gi'), 'count'],
      [_tb('Adet', 'gi'), ''],
      [_tb('Piksel', 'gi'), 'pixels'],
      [_tb('Minirsel', 'gi'), 'Neural'],
      [_tb('sinirsel\\s+trading\\s+unit', 'gi'), 'neural processing unit'],
      [_tb('sinirsel', 'gi'), 'neural'],
      [_tb('CPU\\s+Üretim\\s+Technology', 'gi'), 'CPU manufacturing technology'],
      [_tb('Üretim\\s+Technology', 'gi'), 'Manufacturing technology'],
      [_tb('Üretim', 'gi'), 'Manufacturing'],
      [_tb('Specificationsi', 'gi'), 'Specifications'],
      [_tb('Technologyi', 'gi'), 'Technology'],
      [_tb('Teknolojisi', 'gi'), 'Technology'],
      [_tb('Teknoloji', 'gi'), 'Technology'],
      [_tb('Milyon', 'gi'), 'million'],
      [_tb('Milyar', 'gi'), 'billion'],
      [/(\d+(?:[.,]\d+)?)\s*Dakika/gi, '$1 minutes'],
      [/(\d+(?:[.,]\d+)?)\s*Saat/gi, '$1 hours'],
      [/(\d+(?:[.,]\d+)?)\s*Saniye/gi, '$1 seconds'],
      [/(\d+(?:[.,]\d+)?)\s*Döngü/gi, '$1 cycles'],
      [/(\d+)\s*Elementli\s+Lens/gi, '$1-element lens'],
      [_tb('Yalnızca\\s+eSIM', 'gi'), 'eSIM only'],
      [_tb('Evet', 'gi'), 'Yes'],
      [_tb('Hayır', 'gi'), 'No'],
      [_tb('Hayir', 'gi'), 'No'],
      [/Volte\s*\(\s*⁇\s*over\s*LTE\s*\)\s*support/gi, 'VoLTE (voice over LTE) support'],
      [/G\.p\.d\./gi, 'DisplayPort'],
      [/m\.a\./gi, 'max.'],
      [/^\s*⁇\s*$/g, ''],

      // ── Missing TR words ──
      [_tb('Düzeltme(?:si)?', 'gi'), 'Correction'],
      [_tb('düzeltme(?:si)?', 'gi'), 'correction'],
      [/Red eye \(Red-eye\) Düzeltme/gi, 'Red-eye correction'],
      [/red eye \(red-eye\) düzeltme/gi, 'red-eye correction'],
      [/Çentikli \(Notch\)/gi, 'Notch'],
      [_tb('Çentikli', 'gi'), 'Notched'],
      [_tb('çentikli', 'gi'), 'notched'],
      [_tb('Pusula', 'gi'), 'Compass'],
      [_tb('pusula', 'gi'), 'compass'],
      // Argos mistranslation: "Pusula" → "Checkout" (totally wrong)
      [/^Checkout$/, 'Compass'],
      // Animoji — Apple proper noun, OK as-is

      // ── Argos sense errors that look English but mean wrong thing ──
      [/Productivity check\.turbo frequency/gi, 'Efficiency core turbo frequency'],
      [/Productivity check\.base frequency/gi, 'Efficiency core base frequency'],
      [/Processor increased frequency/gi, 'Processor boost frequency'],
      [/Increased memory/gi, 'Expandable memory'],
      [/Increased frequency/gi, 'Boost frequency'],
      [/Keyboard back lighting/gi, 'Keyboard backlight'],
      [/Transistor distance/gi, 'Process node'],
      [/Built-in graphic max frequency/gi, 'Integrated graphics max frequency'],
      [/Built-in graphic basic frequency/gi, 'Integrated graphics base frequency'],
      [/Built-in graphic/gi, 'Integrated graphics'],
      [/External graphics processor/gi, 'Discrete graphics'],
      [/Hard disk \(SSD\) type/gi, 'SSD type'],
      [/Virtual core/gi, 'Logical cores'],
      [/Color display/gi, 'Color screen'],
      [/Dual mice/gi, 'Dual microphone'],   // Çift mikrofon mistranslation
      [_tb('Aauppercase', 'g'), 'macOS'],
      [/(?<![A-Za-zÇĞİÖŞÜçğıöşü])Face\s+ıdentification(?![A-Za-zÇĞİÖŞÜçğıöşü])/gi, 'Face identification'],
      [/(?<![A-Za-zÇĞİÖŞÜçğıöşü])phone\s+ıdentification(?![A-Za-zÇĞİÖŞÜçğıöşü])/gi, 'Face identification'],
    ];

    for (const [pat, rep] of reps) out = out.replace(pat, rep);
    out = out.replace(/\s{2,}/g, ' ').trim();
    // FINAL PASS — token-by-token dict lookup + transliteration fallback.
    // Guarantees no Turkish letter (ç, ğ, ı, İ, ö, ş, ü) survives in EN output.
    out = _finalPassTurkishCleanup(out, sourceText);
  }
  return out;
}

function _sanitizeEnglishSpecText(text, sourceText = '') {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return '';
  const directRule = _knownTurkishRuleTranslation(raw, 'en');
  let out = directRule && directRule !== raw ? directRule : _translateTurkishLimitPhrases(raw, 'en');
  out = _normalizeTurkishSourceTranslation(sourceText || raw, 'en', out);
  out = _translateTurkishLimitPhrases(out, 'en');
  // Last-mile fixes for dirty values that can enter through canonicalizer,
  // old cache merge, or already-English render paths instead of dict lookup.
  out = out
    .replace(/\beye\s+Sağlığı\s+Sertifikasyonu\b/gi, 'eye health certification')
    .replace(/\bGöz\s+Sağlığı\s+Sertifikasyonu\b/gi, 'eye health certification')
    .replace(/\blithium-Polimer\b/gi, 'lithium polymer')
    .replace(/\blithium-Polymer\b/g, 'lithium polymer')
    .replace(/\bLi-Po\s*\(\s*lithium[-\s]*Polimer\s*\)/gi, 'Li-Po (lithium polymer)')
    .replace(/\bLi-Po\s*\(\s*lithium[-\s]*Polymer\s*\)/g, 'Li-Po (lithium polymer)')
    .replace(/\beye\s+Health\s+Certification\b/g, 'eye health certification')
    .replace(/^\(\s*eye\s+health\s+certification\s*\)$/gi, 'Eyesafe (eye health certification)')
    .replace(/\bEyesafe\s*\(\s*eye\s+health\s+certification\s*\)/gi, 'Eyesafe (eye health certification)')
    .replace(/\bCharging Box\b/gi, 'Charging Case')
    .replace(/\bTam Wireless\b/gi, 'True Wireless')
    .replace(/\bUse Mesafesi\b/gi, 'Use Distance')
    .replace(/\bIP Protection Class\s*\(\s*Su\s*\)/gi, 'IP Protection Class (Water)')
    .replace(/\bTere Resistant\b/gi, 'Sweat Resistant')
    .replace(/\bAudioli Assistant Feature\b/gi, 'Voice Assistant Feature')
    .replace(/\bAudioli Assistant Support\b/gi, 'Voice Assistant Support')
    .replace(/\bAudioli\b/gi, 'Audio')
    .replace(/\bAmbient Audio Mode\b/gi, 'Ambient Audio Mode')
    .replace(/\bDeep Head\b/gi, 'Deep Bass')
    .replace(/\bSingle ve Dual Kullanabilme\b/gi, 'Single and Dual Use')
    .replace(/\bAnnound\b/gi, 'Compatible OS')
    .replace(/\bMy phone Find\b/gi, 'Find My Phone')
    .replace(/\bCalculator Machine\b/gi, 'Calculator')
    .replace(/\bTide Graphics\b/gi, 'Tide Charts')
    .replace(/\bLocation Info Emergency Call\b/gi, 'Emergency Call with Location Info')
    .replace(/\bEl with Device Control\b/gi, 'Hand Gesture Device Control')
    .replace(/\bPower Tasarruf Mode\b/gi, 'Power Saving Mode')
    .replace(/\bGymKit Radio Etmeyin Mode\b/gi, 'GymKit, Walkie-Talkie Mode')
    .replace(/\bAudio with Command Verme\b/gi, 'Voice Command')
    .replace(/\bAudio Audio Mesaj\b/gi, 'Voice Message')
    .replace(/\bAudio Not\s*\(\s*Voice Memo\s*\)/gi, 'Voice Memo')
    .replace(/\bAudio SMS Sending\b/gi, 'Voice SMS Sending')
    .replace(/\bBisiklet Eliptik Bisiklet\b/gi, 'Cycling, Elliptical')
    .replace(/\bYoga\s*\(\s*Havuz\s*\)/gi, 'Swimming (Pool)')
    .replace(/\bCar rental\b/gi, 'Skiing')
    .replace(/\bReverse Heading\b/gi, 'Return Route')
    .replace(/\bSmart Sea Water Temperature\b/gi, 'Sea Water Temperature')
    .replace(/\bMatching with bluetooth headset\b/gi, 'Bluetooth Headphone Pairing')
    .replace(/\bBass talk\s*\(\s*walkie-talkie\s*\)/gi, 'Walkie-Talkie')
    .replace(/\bDevice control with hand motions\b/gi, 'Gesture Device Control')
    .replace(/\bTide chart\b/gi, 'Tide Charts')
    .replace(/\bPower saving mode\b/gi, 'Power Saving Mode')
    .replace(/\bCommanding with voice\b/gi, 'Voice Command')
    .replace(/\bSms sending\b/gi, 'SMS Sending')
    .replace(/\bGoogle fast pair\b/gi, 'Google Fast Pair')
    .replace(/\bSingle and double use\b/gi, 'Single and Dual Use')
    .replace(/\bCharging Case time\s*\(\s*general\s*\)/gi, 'Charging Case Runtime (General)')
    .replace(/\bSmart notifications\b/gi, 'Smart Notifications')
    .replace(/\bBuilt-in media player\b/gi, 'Internal Media Player')
    .replace(/\bWorld hours\b/gi, 'World Clock')
    .replace(/\bSearch history\b/gi, 'Call History')
    .replace(/\bCamera control\b/gi, 'Camera Control')
    .replace(/\bVoice alert\b/gi, 'Voice Alert')
    .replace(/\bVoice translation\b/gi, 'Voice Translation')
    .replace(/\bGymkit\b/g, 'GymKit')
    .replace(/\bDigital crown\b/gi, 'Digital Crown')
    .replace(/\bAzami\s+(\d)/gi, 'up to $1')
    .replace(/\bHeat spread capacity\s*\(\s*TDP\s*\)/gi, 'Thermal design power (TDP)')
    .replace(/\bHard disk\s*\(\s*SSD\s*\)\s*type\b/gi, 'SSD type')
    .replace(/\bKeyboard back lighting\b/gi, 'Keyboard backlight')
    .replace(/\bVirtual core\b/gi, 'Logical cores')
    .replace(/\bTransistor distance\b/gi, 'Process node')
    .replace(/\bProductivity check\.turbo frequency\b/gi, 'Efficiency core turbo frequency')
    .replace(/\bProcessor increased frequency\b/gi, 'Processor boost frequency')
    .replace(/\bBuilt-in graphic max frequency\b/gi, 'Integrated graphics max frequency')
    .replace(/\bBuilt-in graphic basic frequency\b/gi, 'Integrated graphics base frequency')
    .replace(/\bBuilt-in graphic\b/gi, 'Integrated graphics')
    // ── Catch user-reported bugs at the text-level too so multiLangSpecs.en
    //    (which goes through _sanitizeEnglishSpecText, NOT _sanitizeEnglishSpecMap)
    //    also gets these fixes. ─────────────────────────────────────────────
    .replace(/\bEyesafe\s*\(\s*food\s+certification\s*\)/gi, 'Eyesafe (eye health certification)')
    .replace(/\bfood\s+certification\b/gi, 'eye health certification')
    .replace(/\b12\/24h-display\b/gi, '12/24h format')
    .replace(/\b12\/24h-Anzeige\b/gi, '12/24h format')
    .replace(/\b(MIL-STD-\d+[A-Z]?)-certified\b/g, '$1 certified')
    .replace(/\b(MIL-STD-\d+[A-Z]?)-zertifiziert\b/g, '$1 certified')
    .replace(/\bDisplay\s+width\s+height\b/gi, 'Aspect ratio')
    .replace(/\bGPU\s+distance\b/gi, 'GPU process node')
    .replace(/^\/(?=Mobile|Gaming|Business)/i, 'Business/')
    .replace(/^Shareholders?$/i, '')
    // ── NEW (2026-05-24 turn-3) ──
    // Sabit Disk -> Hard disk / SSD (Argos: "Fixed Disk")
    .replace(/\bFixed\s+Disk\s*\(\s*SSD\s*\)\s*Type\b/gi, 'SSD type')
    .replace(/\bFixed\s+Disk\s*\(\s*HDD\s*\)\b/gi, 'Hard disk (HDD)')
    .replace(/\bFixed\s+Disk\b/gi, 'Hard disk')
    // Klavye Arka Aydınlatması -> Keyboard backlight (Argos: "Keyboard Rear Lighting")
    .replace(/\bKeyboard\s+Rear\s+Lighting\b/gi, 'Keyboard backlight')
    .replace(/\bRear\s+Lighting\b/gi, 'Backlight')
    .replace(/\b(?:Display\s+|Screen\s+)?(?:Width\s+Height|Genişlik\s+Yükseklik|Yükseklik\s+Genişlik)\s+(?:Ratio|Oranı)?\b/gi, 'Aspect ratio')
    // ── 2026-05-24 turn-4 (Samsung TV) ──────────────────────────────────
    // 'Karasal' (terrestrial broadcast) — pure TR word leaked verbatim
    .replace(/\bKarasal\s+Receiver\b/gi, 'Terrestrial receiver')
    .replace(/\bHD\s+Karasal\s+Receiver\b/gi, 'HD terrestrial receiver')
    .replace(/\bKarasal\b/g, 'Terrestrial')
    // 'Rehberi' (guide) — EPG context
    .replace(/\bProgram\s+Rehberi\s*\(\s*EPG\s*\)/gi, 'Program Guide (EPG)')
    .replace(/\bRehberi\b/g, 'Guide')
    .replace(/\bRehber\b/g, 'Guide')
    // Yesiable Refresh Rate — Argos took 'Var' out of 'Variable' and made
    // it 'Yes' then put 'iable' back. Catches both word and standalone.
    .replace(/\bYesiable\s+Refresh\s+Rate\b/gi, 'Variable refresh rate')
    .replace(/\bYesiable\b/g, 'Variable')
    // 'Save (pvr)' — TR 'Kaydetme' wrongly mapped to file-save
    .replace(/\bSave\s*\(\s*pvr\s*\)/gi, 'PVR Recording')
    .replace(/\bSave\s*\(\s*PVR\s*\)/g, 'PVR Recording')
    // Two Way Mirroring — keep as bi-directional
    .replace(/\bDisplay\s+Mirroring\s*\(\s*Two\s+Way\s*\)/gi, '2-way screen mirroring')
    .replace(/\bDisplay\s+Mirroring\b(?!\s*\()/gi, 'Screen mirroring')
    // "Main" as a standalone value when it's clearly NOT a brand context
    // (Audio output, Digital Audio Output, Sensors section, etc.).
    // We can't safely auto-rename "Main" everywhere because some contexts
    // legitimately use "Main". But the standalone TR "Ana" / "Dahili" leak
    // for sensor-type / output-mode rows is a known pattern: replace bare
    // "Main" → "Built-in" only when the value position is exactly "Main".
    // (Done at the _sanitizeEnglishSpecMap level — see below.)
    // Mevcut Bellek -> Memory layout / Memory configuration
    .replace(/\bAvailable\s+Memory\b/gi, 'Memory layout')
    // Toplam Bellek (Yuvası) -> Total memory slots
    .replace(/\bTotal\s+Memory\b(?!\s+(?:slots?|capacity|size))/gi, 'Total memory slots')
    // EKG (German/Turkish abbrev) -> ECG (English standard)
    .replace(/\bEKG\b/g, 'ECG')
    // Display Size: "16.0" (no unit) → keep as is — UI shows separately
    // Empty parens artifact: "720p ()" -> "720p"
    .replace(/(\b\d+p)\s*\(\s*\)/g, '$1')
    // Low Blue (orphan) -> "Low blue light"
    .replace(/\bLow\s+Blue\b(?!\s+light)/gi, 'Low blue light')
    // Optical Reader (Turkish "Optik Okuyucu") -> Optical drive
    .replace(/\bOptical\s+Reader\b/gi, 'Optical drive')
    // Card Reader features rename
    .replace(/\bCard\s+reader\s+features\b/gi, 'Card reader')
    // Endurance for bumps -> Drop test / Endurance rating
    .replace(/\bEndurance\s+for\s+bumps\b/gi, 'Drop test certified')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // CAPITALIZATION: first character upper (English convention for spec labels).
  // ISTISNA: kucuk harfle baslayip hemen BUYUK harfle devam eden marka/birim
  // yazimlari (iOS, eSIM, eMMC, mAh, xDrive) ve macOS/watchOS/tvOS ailesi.
  // Eskiden yalnizca `i[A-Z]` korunuyordu; "eSIM" -> "ESIM", "macOS" -> "MacOS"
  // oluyordu ve ayni hata hem panelde hem sitede goruluyordu.
  if (out && /^[a-z]/.test(out)
      && !/^[a-z][A-Z]/.test(out)
      && !/^(?:macOS|watchOS|tvOS|iPadOS|visionOS|microSD|sRGB|mmWave)\b/.test(out)
      && !/^(?:[gma]?USB|[ie]?Phone|i[A-Z]|nano|micro|pro|max|m[Aa]h)/.test(out)) {
    out = out[0].toUpperCase() + out.slice(1);
  }
  return out;
}

/* ───────────────────────────────────────────────────────────────────────────
   2) GOSTERIM KATMANI — admin/js/app.js _renderProductModal kapanisindan
   TASINDI. Kapanis degiskenleri (lang, sourceLang, ml, dictCacheForModal)
   artik fabrika parametresi.
   ─────────────────────────────────────────────────────────────────────────── */
function createSpecLocalizer(options) {
  const opt = options || {};
  const lang = String(opt.lang || 'tr').slice(0, 2).toLowerCase();
  const sourceLang = String(opt.sourceLang || 'tr').slice(0, 2).toLowerCase();
  const ml = (opt.ml && typeof opt.ml === 'object' && !Array.isArray(opt.ml)) ? opt.ml : null;
  const dictCacheForModal = (opt.dict && typeof opt.dict === 'object') ? opt.dict : null;

  function modalIsPreserveText(text){
    const words = String(text || '').match(/[a-zA-ZÀ-ÿığşçöüİĞŞÇÖÜÄÖÜäöüß-]{2,}/g) || [];
    if (!words.length) return true;
    return words.every(w => /^(usb|usb-c|hdr|oled|amoled|ltpo|sim|esim|nano-sim|wi-fi|wifi|gps|nfc|led|ip\d+|ipx\d+|ios|android|mp|mah|hz|ghz|gb|tb|ppi|fps|hdr10|hdr10\+|dolby|vision|mimo|lte|ufs|ram|cpu|gpu)$/i.test(w) || /\d/.test(w));
  }
  function isUntranslatedPassThrough(raw, translated){
    if (lang === sourceLang) return false;
    const a = String(raw || '').trim().toLowerCase();
    const b = String(translated || '').trim().toLowerCase();
    return !!a && a === b && !modalIsPreserveText(raw);
  }
  function modalFoldText(text){
    return String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ü/g,'u')
      .replace(/ş/g,'s').replace(/ö/g,'o').replace(/ç/g,'c')
      .replace(/\s+/g,' ')
      .trim();
  }
  function modalLooksBadTranslation(raw, translated){
    if (lang === sourceLang) return false;
    const tx = String(translated || '').trim();
    if (!tx) return false;
    if (isUntranslatedPassThrough(raw, tx)) return true;
    if (lang === 'en' && /[çğıİöşüÇĞİÖŞÜ]/.test(tx)) return true;
    if (lang === 'de' && /[çğıİşÇĞİŞ]/.test(tx)) return true;
    const folded = modalFoldText(tx);
    if (/\bi\s*'\s*m\s+not\b/i.test(tx)) return true;
    // KISALTMA KUCULTME (2026-08-18): kaynakta "VoLTE" gecerken cevirinin
    // "volte" yazmasi, makine cevirisinin terimi kelime sanip bozdugunun kesin
    // isaretidir. multiLangSpecs.en'de bu tur kayitlar var:
    //   "VoLTE (Voice over LTE) Desteği" -> "Support for volte (voice over LTE)"
    // Reddedince kural motoru devreye girip "VoLTE (Voice over LTE) Support"
    // uretiyor. Etiket/deger iki tarafta da (panel + site) duzeliyor.
    const acronyms = String(raw || '').match(/\b(?=[A-Za-z0-9+.-]*[A-Z]{2})[A-Za-z][A-Za-z0-9+.-]*\b/g) || [];
    for (const acr of acronyms) {
      if (acr.length < 3 || tx.indexOf(acr) !== -1) continue;
      const esc = acr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(^|[^A-Za-z0-9])${esc}([^A-Za-z0-9]|$)`, 'i').test(tx)) return true;
    }
    if (/\b[a-z]{4,}(?:da|de|ta|te|dan|den|lik|lık|lu|lü|li|lı)\b/i.test(tx) && /\b(?:minutes|hours|camera|video|audio|screen|display|charge|charging)\w*/i.test(tx)) return true;
    const residueCommon = [
      'destegi','desteği','ekran','govde','cozunurlugu','cozunurluk','boyutu',
      'arka kamera','on kamera','diyafram','hafiza','servis','uygulamalar',
      'yapay','zeka','kayit','kayit secenekleri','takibi','takip','dolum','dakikada',
      'ekstra genis aci','puan','ozellikleri','ozellik','renk secenekleri',
      'govde malzemesi','bas','vucut','isik','isigi','kolay arayuz','sesli komut',
      'sesle komut','ekrana cift dokunarak acma','kutu icerigi','cikartma ignesi',
      'kablosu','type-cden','toza dayaniklilik','suya dayaniklilik','islemci',
    ];
    const residue = lang === 'de' ? residueCommon : [...residueCommon, 'kamera'];
    return residue.some(term => new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(folded));
  }
  function cleanupModalText(text, sourceText = ''){
    let out = String(text ?? '').trim();
    if (!out) return out;

    if (lang === 'en') {
      const exact = {
        'Home': 'Main',
        'No.': 'No',
        'Ios': 'iOS',
        'Axe camera': 'Portrait mode',
        'Physical denclanner key': 'Physical shutter button',
        'Undoubted zoom': 'Lossless zoom',
        'Audio command': 'Voice command',
        'Red eye (red-eye) fix': 'Red-eye correction',
        'Optical image fixing (OIS)': 'Optical image stabilization (OIS)',
        'Süreçor': 'Processor',
        'Listelendirene': 'Listed since',
        'Minirsel processing (npu)': 'Neural processing (NPU)',
        'Npu (sinirsel trading unit) name': 'NPU (neural processing unit) name',
        'Kart Okuyucu Specifications': 'Card reader specifications',
        'Klavye Specifications': 'Keyboard specifications',
        'USB 3.x Adedi': 'USB 3.x count',
        'Pil Specifications': 'Battery specifications',
        'Li-po (lityum-polymer)': 'Li-Po (lithium polymer)',
        'Eyesafe (göz health certification)': 'Eyesafe (eye health certification)',
        'Non-flammable mat display': 'Anti-glare matte display',
        'Supply ability: low frequency': 'Efficiency core base frequency',
        'Faster': 'Fast charging',
        '2 Adet': '2',
        '24 Adet': '24',
        '4 Zellen': '4 cells',
        'N/a': 'N/A',
        'Netzteil': 'Power supply',
        'Stecker': 'Plug',
        'kein power supply im Lieferumfang': 'No power supply included',
        'kein Netzteil im Lieferumfang': 'No power supply included',
        'Tastatur mit DE layout (beleuchtet, Rubber-Dome)': 'Keyboard with German layout (backlit, rubber-dome)',
        'Baubform': 'Form factor',
        'Bauform': 'Form factor',
        'Charging Box': 'Charging Case',
        'Tam Wireless': 'True Wireless',
        'Use Mesafesi': 'Use Distance',
        'IP Protection Class (Su)': 'IP Protection Class (Water)',
        'Tere Resistant': 'Sweat Resistant',
        'Audioli Assistant Feature': 'Voice Assistant Feature',
        'Audioli Assistant Support': 'Voice Assistant Support',
        'Ambient Audioli Mode': 'Ambient Audio Mode',
        'Deep Head': 'Deep Bass',
        'Single ve Dual Kullanabilme': 'Single and Dual Use',
        'Annound': 'Compatible OS',
        'My phone Find': 'Find My Phone',
        'Calculator Machine': 'Calculator',
        'Tide Graphics': 'Tide Charts',
        'Location Info Emergency Call': 'Emergency Call with Location Info',
        'El with Device Control': 'Hand Gesture Device Control',
        'Power Tasarruf Mode': 'Power Saving Mode',
        'GymKit Radio Etmeyin Mode': 'GymKit, Walkie-Talkie Mode',
        'Audio with Command Verme': 'Voice Command',
        'Audio Audioli Mesaj': 'Voice Message',
        'Audioli Not (Voice Memo)': 'Voice Memo',
        'Audioli SMS Sending': 'Voice SMS Sending',
        'Bisiklet Eliptik Bisiklet': 'Cycling, Elliptical',
        'Yoga (Havuz)': 'Swimming (Pool)',
        'Car rental': 'Skiing',
        'Matching with bluetooth headset': 'Bluetooth Headphone Pairing',
        'Bass talk (walkie-talkie)': 'Walkie-Talkie',
        'Device control with hand motions': 'Gesture Device Control',
        'Commanding with voice': 'Voice Command',
        'Single and double use': 'Single and Dual Use',
        'Charging Case time (general)': 'Charging Case Runtime (General)',
      };
      if (exact[out]) out = exact[out];
      out = out
        .replace(/\bBatarya\b/gi, 'Battery')
        .replace(/\bPil\s+Specifications\b/gi, 'Battery specifications')
        .replace(/\bPil\b/gi, 'Battery')
        .replace(/\bLi-?po\s*\(\s*lityum-polymer\s*\)/gi, 'Li-Po (lithium polymer)')
        .replace(/\bLi-?po\s*\(\s*lithium-Polimer\s*\)/gi, 'Li-Po (lithium polymer)')
        .replace(/\blithium-Polimer\b/gi, 'lithium polymer')
        .replace(/\bCharging Box\b/gi, 'Charging Case')
        .replace(/\bTam Wireless\b/gi, 'True Wireless')
        .replace(/\bUse Mesafesi\b/gi, 'Use Distance')
        .replace(/\bIP Protection Class\s*\(\s*Su\s*\)/gi, 'IP Protection Class (Water)')
        .replace(/\bTere Resistant\b/gi, 'Sweat Resistant')
        .replace(/\bAudioli Assistant Feature\b/gi, 'Voice Assistant Feature')
        .replace(/\bAudioli Assistant Support\b/gi, 'Voice Assistant Support')
        .replace(/\bAudioli\b/gi, 'Audio')
        .replace(/\bAmbient Audio Mode\b/gi, 'Ambient Audio Mode')
        .replace(/\bDeep Head\b/gi, 'Deep Bass')
        .replace(/\bSingle ve Dual Kullanabilme\b/gi, 'Single and Dual Use')
        .replace(/\bAnnound\b/gi, 'Compatible OS')
        .replace(/\bMy phone Find\b/gi, 'Find My Phone')
        .replace(/\bCalculator Machine\b/gi, 'Calculator')
        .replace(/\bTide Graphics\b/gi, 'Tide Charts')
        .replace(/\bLocation Info Emergency Call\b/gi, 'Emergency Call with Location Info')
        .replace(/\bEl with Device Control\b/gi, 'Hand Gesture Device Control')
        .replace(/\bPower Tasarruf Mode\b/gi, 'Power Saving Mode')
        .replace(/\bGymKit Radio Etmeyin Mode\b/gi, 'GymKit, Walkie-Talkie Mode')
        .replace(/\bAudio with Command Verme\b/gi, 'Voice Command')
        .replace(/\bAudio Audio Mesaj\b/gi, 'Voice Message')
        .replace(/\bAudio Not\s*\(\s*Voice Memo\s*\)/gi, 'Voice Memo')
        .replace(/\bAudio SMS Sending\b/gi, 'Voice SMS Sending')
        .replace(/\bBisiklet Eliptik Bisiklet\b/gi, 'Cycling, Elliptical')
        .replace(/\bYoga\s*\(\s*Havuz\s*\)/gi, 'Swimming (Pool)')
        .replace(/\bCar rental\b/gi, 'Skiing')
        .replace(/\bReverse Heading\b/gi, 'Return Route')
        .replace(/\bSmart Sea Water Temperature\b/gi, 'Sea Water Temperature')
        .replace(/\bMatching with bluetooth headset\b/gi, 'Bluetooth Headphone Pairing')
        .replace(/\bBass talk\s*\(\s*walkie-talkie\s*\)/gi, 'Walkie-Talkie')
        .replace(/\bDevice control with hand motions\b/gi, 'Gesture Device Control')
        .replace(/\bTide chart\b/gi, 'Tide Charts')
        .replace(/\bPower saving mode\b/gi, 'Power Saving Mode')
        .replace(/\bCommanding with voice\b/gi, 'Voice Command')
        .replace(/\bSms sending\b/gi, 'SMS Sending')
        .replace(/\bGoogle fast pair\b/gi, 'Google Fast Pair')
        .replace(/\bSingle and double use\b/gi, 'Single and Dual Use')
        .replace(/\bCharging Case time\s*\(\s*general\s*\)/gi, 'Charging Case Runtime (General)')
        .replace(/\bSmart notifications\b/gi, 'Smart Notifications')
        .replace(/\bBuilt-in media player\b/gi, 'Internal Media Player')
        .replace(/\bWorld hours\b/gi, 'World Clock')
        .replace(/\bSearch history\b/gi, 'Call History')
        .replace(/\bCamera control\b/gi, 'Camera Control')
        .replace(/\bVoice alert\b/gi, 'Voice Alert')
        .replace(/\bVoice translation\b/gi, 'Voice Translation')
        .replace(/\bGymkit\b/g, 'GymKit')
        .replace(/\bDigital crown\b/gi, 'Digital Crown')
        .replace(/\bAzami\s+(\d)/gi, 'up to $1')
        .replace(/\beye\s+Sağlığı\s+Sertifikasyonu\b/gi, 'eye health certification')
        .replace(/\bGöz\s+Sağlığı\s+Sertifikasyonu\b/gi, 'eye health certification')
        .replace(/\bEyesafe\s*\(\s*eye\s+health\s+certification\s*\)/gi, 'Eyesafe (eye health certification)')
        .replace(/\bKeyboard back lighting\b/gi, 'Keyboard backlight')
        .replace(/\bVirtual core\b/gi, 'Logical cores')
        .replace(/\bTransistor distance\b/gi, 'Process node')
        .replace(/\bProductivity check\.turbo frequency\b/gi, 'Efficiency core turbo frequency')
        .replace(/\bProcessor increased frequency\b/gi, 'Processor boost frequency')
        .replace(/\bBuilt-in graphic max frequency\b/gi, 'Integrated graphics max frequency')
        .replace(/\bBuilt-in graphic basic frequency\b/gi, 'Integrated graphics base frequency')
        .replace(/\bBuilt-in graphic\b/gi, 'Integrated graphics')
        .replace(/\bHard disk\s*\(\s*SSD\s*\)\s*type\b/gi, 'SSD type')
        .replace(/\bHeat spread capacity\s*\(\s*TDP\s*\)/gi, 'Thermal design power (TDP)')
        .replace(/\blityum\b/gi, 'lithium')
        .replace(/\b(\d{4})\s+([1-4])\.?\s*Çeyrek\b/gi, '$1 Q$2')
        .replace(/\bg[öo]z\s+health\s+certification\b/gi, 'eye health certification')
        .replace(/\bg[öo]z\b/gi, 'eye')
        .replace(/\bNon-flammable\s+mat\s+display\b/gi, 'Anti-glare matte display')
        .replace(/\bNavigasyon\b/gi, 'Navigation')
        .replace(/\bKart\s+Okuyucu\b/gi, 'Card reader')
        .replace(/\bKlavye\b/gi, 'Keyboard')
        .replace(/\bAdedi\b/gi, 'count')
        .replace(/\bAdet\b/gi, '')
        .replace(/\bPiksel\b/gi, 'pixels')
        .replace(/\bMinirsel\b/gi, 'Neural')
        .replace(/\bsinirsel\s+trading\s+unit\b/gi, 'neural processing unit')
        .replace(/\bsinirsel\b/gi, 'neural')
        .replace(/\bİkinci\s+Arka\s+Camera\b/gi, 'Second rear camera')
        .replace(/\bÜçüncü\s+Arka\s+Camera\b/gi, 'Third rear camera')
        .replace(/\bÖn\s+Camera\b/gi, 'Front camera')
        .replace(/\bArka\s+Camera\b/gi, 'Rear camera')
        .replace(/\bÖn\b/gi, 'Front')
        .replace(/\bArka\b/gi, 'Rear')
        .replace(/\bİkinci\b/gi, 'Second')
        .replace(/\bÜçüncü\b/gi, 'Third')
        .replace(/\bCPU\s+Üretim\s+Technology\b/gi, 'CPU manufacturing technology')
        .replace(/\bÜretim\s+Technology\b/gi, 'Manufacturing technology')
        .replace(/\bSpecificationsi\b/gi, 'Specifications')
        .replace(/\bTechnologyi\b/gi, 'Technology')
        .replace(/\bTeknolojisi\b/gi, 'Technology')
        .replace(/\bMilyon\b/gi, 'million')
        .replace(/\b(\d+(?:[.,]\d+)?)\s*Dakika\b/gi, '$1 minutes')
        .replace(/\b(\d+(?:[.,]\d+)?)\s*Saat\b/gi, '$1 hours')
        .replace(/\b(\d+(?:[.,]\d+)?)\s*Döngü\b/gi, '$1 cycles')
        .replace(/\b(\d+)\s*Elementli\s+Lens\b/gi, '$1-element lens')
        .replace(/\bYalnızca\s+eSIM\b/gi, 'eSIM only')
        .replace(/\bEvet\b/gi, 'Yes')
        .replace(/\bHayır\b|\bHayir\b/gi, 'No')
        .replace(/\bVolte\s*\(\s*⁇\s*over\s*LTE\s*\)\s*support\b/gi, 'VoLTE (voice over LTE) support')
        .replace(/\bG\.p\.d\./gi, 'DisplayPort')
        .replace(/\bm\.a\./gi, 'max.')
        .replace(/\b4\s+Zellen\b/gi, '4 cells')
        .replace(/\b(\d+)\s+Zellen\b/gi, '$1 cells')
        .replace(/\bZellen\b/gi, 'cells')
        .replace(/\bNetzteil\b/gi, 'power supply')
        .replace(/\bStecker\b/gi, 'plug')
        .replace(/\bKlinke\b/gi, 'jack')
        .replace(/\bclink\b/gi, 'jack')
        .replace(/\bHohlstecker\b/gi, 'hollow plug')
        .replace(/\bHohlbuchse\b/gi, 'hollow socket')
        .replace(/\bNetzwerkanschluss\b/gi, 'network connection')
        .replace(/\bkein\s+(?:Netzteil|power supply)\s+im\s+Lieferumfang\b/gi, 'No power supply included')
        .replace(/\bim\s+Lieferumfang\b/gi, 'included')
        .replace(/\bTastatur\s+mit\s+DE\s+layout\s*\(\s*beleuchtet,\s*Rubber-Dome\s*\)/gi, 'Keyboard with German layout (backlit, rubber-dome)')
        .replace(/\bTastatur\b/gi, 'keyboard')
        .replace(/\bbeleuchtet\b/gi, 'backlit')
        .replace(/\bBxHxT\b/g, 'W x H x D')
        .replace(/\bde-layout\b/gi, 'DE layout')
        .replace(/\bso-dimm-module\b/gi, 'SO-DIMM module')
        .replace(/\bso-dımm-module\b/gi, 'SO-DIMM module')
        .replace(/\bBaubform\b|\bBauform\b/gi, 'form factor')
        .replace(/\bPick\s*up\s*&\s*Return\b/gi, 'Pickup & return')
        .replace(/\bPickup&Return\b/gi, 'Pickup & return')
        .replace(/\bHonor\s+rt\b/gi, 'Vulkan RT')
        .replace(/\bReliable platform module\s+TPM\s+2\.0\s+\(print\)/gi, 'Trusted Platform Module (TPM) 2.0')
        .replace(/\bIntel adaptiveix technology\b/gi, 'Intel Adaptive Boost Technology')
        .replace(/\bSSe4\.2\b/g, 'SSE4.2')
        .replace(/\bInt8\b/g, 'INT8')
        .replace(/\bNpu\b/g, 'NPU')
        .replace(/^\s*⁇\s*$/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      out = out.replace(/\bIphone\b/g, 'iPhone').replace(/\bIcloud\b/g, 'iCloud').replace(/\bFacetime\b/g, 'FaceTime');
      // ESKIDEN: window.QorAiBulkTranslate?.sanitizeEnglishText (scraper.js).
      // O kanca YALNIZ admin panelinde doluydu; site tarafinda undefined
      // oldugu icin bu adim SESSIZCE atlaniyordu -> ayni kayit admin'de
      // "Slow-motion recording options", sitede "Agir Cekim Kayit Secenekleri"
      // goruntuluyordu. Fonksiyon artik AYNI dosyada; dogrudan cagriliyor.
      out = _sanitizeEnglishSpecText(out, sourceText || out);
    }

    if (lang === 'tr') {
      const exactTr = {
        'Battery battery': 'Pil',
        'fest verbaut': 'Sabit takılı',
        'kabelloses Laden': 'Kablosuz şarj',
        'Phasenvergleich-AF': 'Faz algılamalı otomatik odaklama',
        'Beschleunigungssensor': 'İvmeölçer',
        'Gyroskop': 'Jiroskop',
        'Annäherungssensor': 'Yakınlık sensörü',
        'Lichtsensor': 'Işık sensörü',
        'Kompass': 'Pusula',
        'Barometer': 'Barometre',
        'Gesichtsscanner (3D, Infrarot)': 'Yüz tarayıcı (3D, kızılötesi)',
        'kapazitiver Touchscreen': 'Kapasitif dokunmatik ekran',
        'Aussparung': 'Ekran kesiti',
        'flach': 'Düz',
        'IP68-zertifiziert': 'IP68 sertifikalı',
        'Stereo-Lautsprecher (hybrid)': 'Stereo hoparlörler (hibrit)',
        'Ceramic Shield': 'Ceramic Shield',
        'Glas (Rückseite)': 'Cam (arka yüzey)',
        'Metall (Rahmen)': 'Metal (çerçeve)',
        'Bars Bar': 'Bar formu',
        'Barren': 'Bar formu',
        'Battery': 'Pil',
        'Battery & Other': 'Pil & Diğer',
        'BATTERY & OTHER': 'PİL & DİĞER',
        'Battery Power': 'Pil Gücü',
        'Battery Specifications': 'Pil Özellikleri',
        'Battery cell Count': 'Pil Hücre Sayısı',
        'Card reader': 'Kart Okuyucu',
        'Card reader Specifications': 'Kart Okuyucu Özellikleri',
        'Interfaces': 'Arayüzler',
        'Keyboard backlight': 'Klavye Arka Aydınlatması',
        'Keyboard Specifications': 'Klavye Özellikleri',
        'Navigation': 'Navigasyon',
        '6 Kerne': '6 çekirdek',
        '4 Zellen': '4 hücre',
        'Netzteil': 'Güç adaptörü',
        'Stecker': 'Fiş',
        'Klinke': 'Jak',
        'kein power supply im Lieferumfang': 'Kutuda güç adaptörü yok',
        'kein Netzteil im Lieferumfang': 'Kutuda güç adaptörü yok',
        'Tastatur mit DE layout (beleuchtet, Rubber-Dome)': 'Almanca düzenli klavye (aydınlatmalı, rubber-dome)',
        'de-layout': 'Almanca klavye düzeni',
        'so-dimm-module': 'SO-DIMM modülü',
        'Netzwerkanschluss': 'Ağ bağlantısı',
        'Bauform': 'Form faktörü',
        'Pickup&Return': 'Pickup & return',
      };
      if (exactTr[out]) out = exactTr[out];
      out = out
        .replace(/\bfest verbaut\b/gi, 'sabit takılı')
        .replace(/\bkabelloses Laden\b/gi, 'kablosuz şarj')
        .replace(/\bPhasenvergleich-AF\b/gi, 'faz algılamalı otomatik odaklama')
        .replace(/\bBeschleunigungssensor\b/gi, 'ivmeölçer')
        .replace(/\bGyroskop\b/gi, 'jiroskop')
        .replace(/\bAnnäherungssensor\b/gi, 'yakınlık sensörü')
        .replace(/\bLichtsensor\b/gi, 'ışık sensörü')
        .replace(/\bKompass\b/gi, 'pusula')
        .replace(/\bGesichtsscanner\b/gi, 'yüz tarayıcı')
        .replace(/\bAussparung\b/gi, 'ekran kesiti')
        .replace(/\bAktualisierungsrate\b/gi, 'yenileme hızı')
        .replace(/\bSatellitenkommunikation\b/gi, 'uydu iletişimi')
        .replace(/\bTextnachrichten\b/gi, 'mesajlar')
        .replace(/\bnur Notruf\b/gi, 'sadece acil arama')
        .replace(/\bSchnittstellen\b/gi, 'arayüzler')
        .replace(/\bBattery\s*&\s*Other\b/gi, 'Pil & Diğer')
        .replace(/\bBattery\s+Power\b/gi, 'Pil Gücü')
        .replace(/\bBattery\s+Specifications\b/gi, 'Pil Özellikleri')
        .replace(/\bBattery\s+cell\s+Count\b/gi, 'Pil Hücre Sayısı')
        .replace(/\bBattery\b/gi, 'Pil')
        .replace(/\bCard\s+reader\s+Specifications\b/gi, 'Kart Okuyucu Özellikleri')
        .replace(/\bCard\s+reader\b/gi, 'Kart Okuyucu')
        .replace(/\bKeyboard\s+backlight\b/gi, 'Klavye Arka Aydınlatması')
        .replace(/\bKeyboard\s+Specifications\b/gi, 'Klavye Özellikleri')
        .replace(/\bKeyboard\b/gi, 'Klavye')
        .replace(/\bMaximum\s+Time\b/gi, 'Azami Süre')
        .replace(/\bNetzteil\b/gi, 'güç adaptörü')
        .replace(/\bStecker\b/gi, 'fiş')
        .replace(/\bKlinke\b/gi, 'jak')
        .replace(/\bclink\b/gi, 'jak')
        .replace(/\bHohlstecker\b/gi, 'silindirik fiş')
        .replace(/\bHohlbuchse\b/gi, 'silindirik soket')
        .replace(/\bNetzwerkanschluss\b/gi, 'ağ bağlantısı')
        .replace(/\bkein\s+(?:Netzteil|power supply)\s+im\s+Lieferumfang\b/gi, 'kutuda güç adaptörü yok')
        .replace(/\bim\s+Lieferumfang\b/gi, 'kutuda')
        .replace(/\bTastatur\s+mit\s+DE\s+layout\s*\(\s*beleuchtet,\s*Rubber-Dome\s*\)/gi, 'Almanca düzenli klavye (aydınlatmalı, rubber-dome)')
        .replace(/\bTastatur\b/gi, 'klavye')
        .replace(/\bbeleuchtet\b/gi, 'aydınlatmalı')
        .replace(/\bBxHxT\b/g, 'G x Y x D')
        .replace(/\bde-layout\b/gi, 'Almanca klavye düzeni')
        .replace(/\bso-dimm-module\b/gi, 'SO-DIMM modülü')
        .replace(/\bBauform\b/gi, 'form faktörü')
        .replace(/\bZellen\b/gi, 'hücre')
        .replace(/\b(\d+)\s+hücre\s+hücresi\b/gi, '$1 hücre')
        .replace(/\bPick\s*up\s*&\s*Return\b/gi, 'Pickup & return')
        .replace(/\bPickup&Return\b/gi, 'Pickup & return')
        .replace(/\bKerne\b/gi, 'çekirdek')
        .replace(/\bab Werk\b/gi, 'fabrika çıkışı')
        .replace(/\bGlas\s*\(Rückseite\)/gi, 'Cam (arka yüzey)')
        .replace(/\bMetall\s*\(Rahmen\)/gi, 'Metal (çerçeve)')
        .replace(/\bFreefall reliability sınıfı\b/gi, 'Düşme dayanımı sınıfı')
        .replace(/\bOnarım sınıfını\b/gi, 'Onarılabilirlik sınıfı')
        .replace(/\bEkran-to-body rate\b/gi, 'Ekran/gövde oranı')
        .replace(/\bSüreçor\b/gi, 'İşlemci')
        .replace(/\bListelendirene\b/gi, 'Listelenme tarihi')
        .replace(/\b([0-9]+(?:[.,][0-9]+)?)x\s+Laden\b/gi, '$1 şarj döngüsü')
        .replace(/\b([0-9]+(?:[.,][0-9]+)?)Hz\s+Aktualisierungsrate\b/gi, '$1Hz yenileme hızı')
        .replace(/\b([0-9]+(?:[.,][0-9]+)?)\s+Nits\s+\(maximal\)/gi, '$1 nit (maksimum)')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }

    // Capitalize first letter of every spec string
    if (out) {
      const firstLetterMatch = out.search(/[\p{L}\p{N}]/u);
      if (firstLetterMatch !== -1) {
        // "iOS" -> "IOS", "eSIM" -> "ESIM", "mAh" -> "MAh" olmasin. Kucuk harfle
        // baslayip HEMEN buyuk harfle devam eden marka/birim yazimlari (iOS,
        // iPhone, iPadOS, eSIM, eMMC, mAh, xDrive) oldugu gibi kalir; ayrica
        // macOS/watchOS/tvOS gibi tam-kelime istisnalari.
        const head = out.slice(firstLetterMatch);
        const camelBrand = /^[a-z][A-Z]/.test(head);
        const wordBrand = /^(macos|watchos|tvos|ipados|visionos|microsd|nanosim|micro-sim|nano-sim|sRGB|mmWave)\b/i.test(head)
          && /^(macOS|watchOS|tvOS|iPadOS|visionOS|microSD|nanoSIM|micro-SIM|nano-SIM|sRGB|mmWave)\b/.test(head);
        if (!camelBrand && !wordBrand) {
          const ch = out[firstLetterMatch];
          const up = lang === 'tr' ? ch.toLocaleUpperCase('tr-TR') : ch.toUpperCase();
          out = out.slice(0, firstLetterMatch) + up + out.slice(firstLetterMatch + 1);
        }
      }
    }

    return out;
  }
  function knownModalTranslation(text){
    const raw = String(text ?? '').trim();
    const n = (raw.match(/\d+(?:[.,]\d+)?/) || [''])[0].replace(',', '.');
    if (!raw) return null;
    const s = raw.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ü/g,'u')
      .replace(/ş/g,'s').replace(/ö/g,'o').replace(/ç/g,'c')
      .replace(/\s+/g,' ');
    const cpuExact = {
      'transistor mesafesi': { en:'Process Node'},
      'mesafesi': { en:'Process Node'},
      'carpan kilidi': { en:'Multiplier Lock'},
      'kilidi': { en:'Multiplier Lock'},
      'isi yayma kapasitesi (tdp)': { en:'Thermal Design Power (TDP)'},
      'isi yayma kapasitesi': { en:'Thermal Design Power'},
      'yapay zeka (yz)': { en:'Artificial Intelligence (AI)'},
      'destekledigi teknolojiler': { en:'Supported Technologies'},
      'passmark puani (tekil)': { en:'PassMark Single-Thread Score'},
      'passmark puani (cogul)': { en:'PassMark Multi-Thread Score'},
      'cikis donemi': { en:'Release Quarter'},
      'cikis yili': { en:'Release Year'},
      'jenerasyon': { en:'Generation'},
      'islemci ailesi': { en:'Processor Family'},
      'islemci mimarisi': { en:'Processor Architecture'},
      'islemci modeli': { en:'Processor Model'},
      'islemci serisi': { en:'Processor Series'},
      'islemci turu': { en:'Processor Type'},
      'islemci ust modeli': { en:'Processor Parent Model'},
      'temel frekans': { en:'Base Frequency'},
      'artirilmis frekans': { en:'Boost Frequency'},
      'is parcacigi': { en:'Threads'},
      'cekirdek': { en:'CPU cores'},
      'performans cekirdegi': { en:'Performance Core'},
      'verimlilik cekirdegi': { en:'Efficiency Core'},
      'onbellek l1': { en:'Cache L1'},
      'onbellek l2': { en:'Cache L2'},
      'onbellek l3': { en:'Cache L3'},
      'dahili grafik islemci': { en:'Integrated Graphics Processor'},
      'grafik islemci modeli': { en:'Graphics Processor Model'},
      'sicaklik': { en:'Temperature'},
      'soket': { en:'Socket'},
      'pcie hatti sayisi': { en:'PCIe Lane Count'},
      'pcie surumu': { en:'PCIe Version'},
      'bellek hizi': { en:'Memory Speed'},
      '2.bellek hizi': { en:'2.Memory Speed'},
      'bellek turu': { en:'Memory Type'},
      '2.bellek turu': { en:'2.Memory Type'},
      'bellek kanali': { en:'Memory Channel'},
      'ecc bellek destegi': { en:'ECC Memory Support'},
      'ab urun kayit ve enerji etiketi': { en:'EU product registration & energy label'},
      'ag baglantilari': { en:'Network connections'},
      'batarya': { en:'Battery'},
      'diger baglantilar': { en:'Other connections'},
      'ekran': { en:'Display'},
      'kablosuz baglantilar': { en:'Wireless connections'},
      'kamera': { en:'Camera'},
      'tasarim': { en:'Design'},
      'temel bilgiler': { en:'Basics'},
      'temel donanim': { en:'Core hardware'},
      'coklu ortam': { en:'Multimedia'},
      'ozellikler': { en:'Features'},
      'one cikanlar': { en:'Highlights'},
      'isletim sistemi': { en:'Operating system'},
      'dusme direnci sinifi': { en:'Drop-resistance class'},
      'enerji sinifi': { en:'Energy class'},
      'onarilabilirlik sinifi': { en:'Repairability class'},
      'suya ya da toza direnc sinifi': { en:'Water/dust resistance class'},
      'sarj dongu sayisi (ab)': { en:'Charge cycle count (EU)'},
      'sarj sonrasi pil suresi': { en:'Battery life after charging'},
      '4.5g destegi': { en:'4.5G support'},
      '4g ozellikleri': { en:'4G features'},
      'batarya kapasitesi (tipik)': { en:'Battery capacity (typical)'},
      'batarya ozellikleri': { en:'Battery features'},
      'degisir batarya': { en:'Removable battery'},
      'hizli sarj': { en:'Fast charging'},
      'hizli sarj gucu (maks.)': { en:'Fast charging power (max.)'},
      'hizli sarj ozellikleri': { en:'Fast charging features'},
      'kablosuz sarj': { en:'Wireless charging'},
      'kablosuz sarj ozellikleri': { en:'Wireless charging features'},
      'video oynatma': { en:'Video playback'},
      'sarj': { en:'Charging'},
      'hat sayisi': { en:'Number of SIMs'},
      'usb baglanti tipi': { en:'USB connection type'},
      'usb versiyonu': { en:'USB version'},
      'usb ozellikleri': { en:'USB features'},
      'cift hat ozelligi': { en:'Dual SIM feature'},
      'ekran / govde orani': { en:'Display-to-body ratio'},
      'ekran alani': { en:'Display area'},
      'ekran boyutu': { en:'Screen size'},
      'ekran dayanikliligi': { en:'Display durability'},
      'ekran orani (aspect ratio)': { en:'Display aspect ratio'},
      'ekran teknolojisi': { en:'Display technology'},
      'ekran yenileme hizi': { en:'Display refresh rate'},
      'ekran cozunurlugu': { en:'Display resolution'},
      'ekran cozunurlugu standardi': { en:'Display resolution standard'},
      'ekran ozellikleri': { en:'Display features'},
      'cizilmeye direncli cam': { en:'Scratch-resistant glass'},
      'cercevesiz tasarim': { en:'Frameless design'},
      'surekli acik ekran (always-on display)': { en:'Always-on display'},
      'ekran icinde on kamera': { en:'In-display front camera'},
      'piksel yogunlugu': { en:'Pixel density'},
      'renk sayisi': { en:'Color count'},
      'bluetooth versiyonu': { en:'Bluetooth version'},
      'kizilotesi': { en:'Infrared'},
      'navigasyon ozellikleri': { en:'Navigation features'},
      'wi-fi kanallari': { en:'Wi-Fi channels'},
      'wi-fi ozellikleri': { en:'Wi-Fi features'},
      'agir cekim kayit secenekleri': { en:'Slow-motion recording options'},
      'diyafram acikligi': { en:'Aperture'},
      'dorduncu arka kamera': { en:'Fourth rear camera'},
      'dorduncu arka kamera diyafram': { en:'Fourth rear camera aperture'},
      'dorduncu arka kamera cozunurlugu': { en:'Fourth rear camera resolution'},
      'dorduncu arka kamera ozellikleri': { en:'Fourth rear camera features'},
      'ucuncu arka kamera': { en:'Third rear camera'},
      'ucuncu arka kamera diyafram': { en:'Third rear camera aperture'},
      'ucuncu arka kamera cozunurlugu': { en:'Third rear camera resolution'},
      'ucuncu arka kamera ozellikleri': { en:'Third rear camera features'},
      'ikinci arka kamera': { en:'Second rear camera'},
      'ikinci arka kamera diyafram': { en:'Second rear camera aperture'},
      'ikinci arka kamera cozunurlugu': { en:'Second rear camera resolution'},
      'ikinci arka kamera ozellikleri': { en:'Second rear camera features'},
      'flas': { en:'Flash'},
      'kamera sensor boyutu': { en:'Camera sensor size'},
      'kamera cozunurlugu': { en:'Camera resolution'},
      'kamera ozellikleri': { en:'Camera features'},
      'yapay zeka (ai) sahne algilama': { en:'AI scene detection'},
      'perde hizi (shutter speed) kontrolu': { en:'Shutter speed control'},
      'raw kayit yapabilme': { en:'RAW recording support'},
      'otomatik odaklama': { en:'Autofocus'},
      'sesli komut': { en:'Voice command'},
      'sesle komut': { en:'Voice command'},
      'dahili qr kod okuyucu': { en:'Built-in QR code reader'},
      'seri cekim (burst) modu': { en:'Burst shooting mode'},
      'kayipsiz yakinlastirma': { en:'Lossless zoom'},
      'odak uzakligi': { en:'Focal length'},
      'optik goruntu sabitleyici (ois)': { en:'Optical image stabilizer (OIS)'},
      'video fps degeri': { en:'Video FPS'},
      'video kayit secenekleri': { en:'Video recording options'},
      'video kayit cozunurlugu': { en:'Video recording resolution'},
      'video kayit ozellikleri': { en:'Video recording features'},
      'odak takibi': { en:'Focus tracking'},
      'yavas cekim video kayit (slow motion video)': { en:'Slow-motion video recording'},
      'on kamera diyafram acikligi': { en:'Front camera aperture'},
      'on kamera fps degeri': { en:'Front camera FPS'},
      'on kamera video cozunurlugu': { en:'Front camera video resolution'},
      'on kamera cozunurlugu': { en:'Front camera resolution'},
      'on kamera ozellikleri': { en:'Front camera features'},
      'video kayitta portre modu': { en:'Portrait mode in video recording'},
      'sanal flas': { en:'Virtual flash'},
      'zamanlayici (self-timer)': { en:'Self-timer'},
      'hizli odaklama': { en:'Fast focus'},
      'panorama selfi': { en:'Panorama selfie'},
      'ekstra genis aci': { en:'Ultra-wide angle'},
      'agirlik': { en:'Weight'},
      'boy': { en:'Height'},
      'en': { en:'Width'},
      'govde malzemesi (kapak)': { en:'Body material (back cover)'},
      'govde malzemesi (cerceve)': { en:'Body material (frame)'},
      'kalinlik': { en:'Thickness'},
      'renk secenekleri': { en:'Color options'},
      'alt seri': { en:'Sub-series'},
      'duyurulma tarihi': { en:'Announcement date'},
      'seri': { en:'Series'},
      '1. yardimci islemci': { en:'1. Auxiliary processor'},
      'antutu puani (v10)': { en:'AnTuTu score (v10)'},
      'antutu puani (v11)': { en:'AnTuTu score (v11)'},
      'ana islemci (cpu)': { en:'Main processor (CPU)'},
      'bellek (ram)': { en:'Memory (RAM)'},
      'cpu frekansi': { en:'CPU frequency'},
      'cpu cekirdegi': { en:'CPU cores'},
      'cpu uretim teknolojisi': { en:'CPU manufacturing process'},
      'dahili depolama': { en:'Internal storage'},
      'diger bellek (ram) secenekleri': { en:'Other memory (RAM) options'},
      'diger hafiza secenekleri': { en:'Other storage options'},
      'gpu frekansi': { en:'GPU frequency'},
      'grafik islemcisi (gpu)': { en:'Graphics processor (GPU)'},
      'hafiza karti destegi': { en:'Memory card support'},
      'ram tipi': { en:'RAM type'},
      'yonga seti (chipset)': { en:'Chipset'},
      'hoparlor ozellikleri': { en:'Speaker features'},
      'ses cikisi': { en:'Audio output'},
      'bildirim isigi (led)': { en:'Notification LED'},
      'goruntulu konusma (uygulama)': { en:'Video calling (app)'},
      'kutu icerigi': { en:'Box contents'},
      'parmak izi okuyucu': { en:'Fingerprint reader'},
      'parmak izi okuyucu ozellikleri': { en:'Fingerprint reader features'},
      'sar degeri 10g (bas)': { en:'SAR value 10g (head)'},
      'sar degeri 10g (vucut)': { en:'SAR value 10g (body)'},
      'sensorler': { en:'Sensors'},
      'servis ve uygulamalar': { en:'Services and applications'},
      'suya dayaniklilik': { en:'Water resistance'},
      'suya dayaniklilik seviyesi': { en:'Water resistance level'},
      'toza dayaniklilik': { en:'Dust resistance'},
      'toza dayaniklilik seviyesi': { en:'Dust resistance level'},
      'buhar basinci (maks.)': { en:'Steam pressure (max.)'},
      'isinma suresi': { en:'Heat-up time'},
      'max. isitici gucu': { en:'Max. heater power'},
      'kullanici arayuzu': { en:'User interface'},
      'lansman arayuz versiyonu': { en:'Launch interface version'},
      'isletim sistemi versiyonu': { en:'OS version'},
      'siyah': { en:'Black'},
      'beyaz': { en:'White'},
      'altin': { en:'Gold'},
      'gumus': { en:'Silver'},
      'mavi': { en:'Blue'},
      'mor': { en:'Purple'},
      'subat': { en:'February'},
      'cift hat': { en:'Dual SIM'},
      'cift hoparlor': { en:'Dual speaker'},
      'ekran icinde': { en:'In-display'},
      'ultrasonic sensor': { en:'Ultrasonic sensor'},
      'sim cikartma ignesi': { en:'SIM eject pin'},
      "usb kablosu (type-c'den type-c'ye)": { en:'USB cable (Type-C to Type-C)'},
      'ekrana cift dokunarak acma (knockon)': { en:'Double-tap to wake (KnockON)'},
      'kablosuz sarj ile baska cihazlari sarj edebilme': { en:'Reverse wireless charging'},
      'kolay arayuz (easy mode)': { en:'Easy Mode'},
      'tek elde kullanim modu': { en:'One-handed mode'},
      'yuz tanimlama': { en:'Face recognition'},
      'vapor-chamber sogutma': { en:'Vapor-chamber cooling'},
    };
    if (cpuExact[s]?.[lang]) return cleanupModalText(cpuExact[s][lang]);
    const inch = s.match(/^(\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)?)\s*inc$/);
    if (inch) return cleanupModalText(({ en:`${inch[1]} inches`})[lang] || `${inch[1]} inches`);
    const chargeFill = s.match(/^(\d+(?:[.,]\d+)?)\s*dakikada\s*%(\d+)\s*dolum$/);
    if (chargeFill) return cleanupModalText(({ en:`${chargeFill[2]}% charge in ${chargeFill[1]} minutes`})[lang] || `${chargeFill[2]}% charge in ${chargeFill[1]} minutes`);
    const score = s.match(/^(\d+(?:[.,]\d+)?)\s*puan$/);
    if (score) return cleanupModalText(({ en:`${score[1]} score`})[lang] || `${score[1]} score`);
    const cores = s.match(/^(\d+)\s*cekirdek$/);
    if (cores) return cleanupModalText(({ en:`${cores[1]} cores`})[lang] || `${cores[1]} cores`);
    const ramOptions = s.match(/^(.+)\s*ram\s*secenegi\s*var$/);
    if (ramOptions) return cleanupModalText(({ en:`${ramOptions[1].replace(/\//g, '/')} RAM options available`})[lang] || `${ramOptions[1]} RAM options available`);
    const storageOptions = s.match(/^(.+)\s*depolama\s*secenegi\s*var$/);
    if (storageOptions) return cleanupModalText(({ en:`${storageOptions[1]} storage options available`})[lang] || `${storageOptions[1]} storage options available`);
    const phrase = {
      minute: { en:'minutes'},
      hour: { en:'hours'},
      cycle: { en:'cycles'},
      billion: { en:'billion'},
      gram: { en:'grams'},
      onlyEsim: { en:'eSIM only'},
      digitalZoom: { en:'digital zoom'},
      elementLens: { en:'element lens'},
      technology: { en:'Technology'},
      specifications: { en:'Specifications'},
    };
    const p = key => phrase[key]?.[lang] || phrase[key]?.en;
    if (/^\d+(?:[.,]\d+)?\s*dakika$/.test(s)) return cleanupModalText(`${n} ${p('minute')}`);
    if (/^\d+(?:[.,]\d+)?\s*saat$/.test(s)) return cleanupModalText(`${n} ${p('hour')}`);
    if (/^\d+(?:[.,]\d+)?\s*dongu$/.test(s)) return cleanupModalText(`${n} ${p('cycle')}`);
    if (/^\d+(?:[.,]\d+)?\s*milyar$/.test(s)) return cleanupModalText(`${n} ${p('billion')}`);
    if (/^\d+(?:[.,]\d+)?\s*gram$/.test(s)) return cleanupModalText(`${n} ${p('gram')}`);
    if (/^\d+(?:[.,]\d+)?x\s*dijital\s+zoom$/.test(s)) return cleanupModalText(`${n}x ${p('digitalZoom')}`);
    if (/^\d+\s*elementli\s+lens$/.test(s)) return cleanupModalText(`${n}-${p('elementLens')}`);
    if (/^yalnizca\s+esim$/.test(s)) return cleanupModalText(p('onlyEsim'));
    if (/\byalnizca\s+esim\b/.test(s)) return cleanupModalText(raw.replace(/yaln[ıi]zca\s+esim/ig, p('onlyEsim')));
    if (/\bspecificationsi\b/i.test(raw)) return cleanupModalText(raw.replace(/\bspecificationsi\b/ig, p('specifications')));
    if (/\bteknolojisi\b/i.test(raw)) return cleanupModalText(raw.replace(/\bteknolojisi\b/ig, p('technology')));
    const q = s.match(/^(\d{4})\s+([1-4])\.?\s*ceyrek$/);
    if (q) return cleanupModalText(({ en:`${q[1]} Q${q[2]}`})[lang] || `${q[1]} Q${q[2]}`);
    if (!n) return null;
    const maps = {
      update: { en:`${n}-Year Update Guarantee`},
      security: { en:`${n}-Year Security Update Guarantee`},
    };
    if (/^\d+\s*yil\s+guvenlik\s+guncellemesi\s+garantisi$/.test(s)) return cleanupModalText(maps.security[lang] || '');
    if (/^\d+\s*yil\s+guncelleme\s+garantisi$/.test(s)) return cleanupModalText(maps.update[lang] || '');
    const cleaned = cleanupModalText(raw);
    return cleaned && cleaned !== raw ? cleaned : null;
  }
  function lookupLocalizedText(text){
    const raw = String(text ?? '').trim();
    if (!raw) return text;
    const known = knownModalTranslation(raw);
    if (known) return known;
    if (lang === sourceLang) return cleanupModalText(text, raw);
    if (ml && typeof ml[raw] === 'string' && ml[raw] && !modalLooksBadTranslation(raw, ml[raw])) return cleanupModalText(ml[raw], raw);
    const lower = raw.toLowerCase();
    if (ml && typeof ml[lower] === 'string' && ml[lower] && !modalLooksBadTranslation(raw, ml[lower])) return cleanupModalText(ml[lower], raw);
    const d = dictCacheForModal?.[lower]?.[lang];
    if (typeof d === 'string' && d.trim() && !modalLooksBadTranslation(raw, d)) return cleanupModalText(d.trim(), raw);
    return cleanupModalText(text, raw);
  }
  return {
    lang: lang,
    sourceLang: sourceLang,
    resolve: lookupLocalizedText,
    cleanup: cleanupModalText,
    known: knownModalTranslation,
    looksBad: modalLooksBadTranslation,
    isPreserveText: modalIsPreserveText,
  };
}

/* ───────────────────────────────────────────────────────────────────────────
   3) URUN MODELI — admin/js/app.js'ten TASINDI. "Hangi alan okunur, bolum
   agaci nasil normalize edilir, degerler hangi satirlara bolunur" kurallari
   da ortak; yoksa iki taraf ayni ceviriyi FARKLI kaynaktan uretirdi.
   ─────────────────────────────────────────────────────────────────────────── */
function normalizeSpecSectionsShape(raw){
  if(!raw)return null;
  const out={};
  const cleanVal=(v)=>{
    if(v==null)return '';
    if(typeof v==='string'||typeof v==='number'||typeof v==='boolean')return String(v);
    if(typeof v==='object'){
      const direct=v.val??v.value??v.Value??v.PresentationValue??v.Presentation_Value??v.RawValue??v._;
      if(direct!=null)return String(direct);
    }
    return '';
  };
  const add=(section,key,value)=>{
    const sec=String(section||'General').trim()||'General';
    const k=String(key||'').trim();
    const v=cleanVal(value).trim();
    if(!k||!v)return;
    if(!out[sec])out[sec]={};
    out[sec][k]=v;
  };
  const addSpecList=(section,list)=>{
    if(Array.isArray(list)){
      list.forEach(item=>{
        if(!item||typeof item!=='object')return;
        add(section,item.key??item.name??item.label??item.Feature?.Name?.Value??item.Feature?.Name,item.val??item.value??item.Value??item.PresentationValue??item.Presentation_Value??item.RawValue);
      });
    }else if(list&&typeof list==='object'){
      Object.entries(list).forEach(([k,v])=>add(section,k,v));
    }
  };
  if(Array.isArray(raw)){
    raw.forEach(sec=>{
      if(!sec||typeof sec!=='object')return;
      addSpecList(sec.section||sec.name||sec.title||'General',sec.specs||sec.values||sec.items||sec);
    });
  }else if(typeof raw==='object'){
    Object.entries(raw).forEach(([section,data])=>{
      if(data&&typeof data==='object'&&('specs'in data||'values'in data||'items'in data)){
        addSpecList(data.section||data.name||section,data.specs||data.values||data.items);
      }else{
        addSpecList(section,data);
      }
    });
  }
  return Object.keys(out).length?out:null;
}

// Bir spec DEGERINI gorunecek satirlara boler. admin/js/app.js fmtSpecVal
// icindeki splitTop + "3x" birlestirme mantigi BURAYA TASINDI; site de ayni
// bolmeyi kullaniyor, yoksa admin 2 satir sitede 1 satir cikiyordu.
function splitSpecValueLines(value) {
  function splitTop(str){
    const out=[]; let depth=0, buf='';
    for(let i=0;i<str.length;i++){
      const ch=str[i];
      if(ch==='('||ch==='['||ch==='{') depth++;
      else if(ch===')'||ch===']'||ch==='}') depth=Math.max(0,depth-1);
      if(depth===0&&(ch===','||ch===';')){
        const prev=str[i-1], next=str[i+1];
        if(/\d/.test(prev||'')&&/\d/.test(next||'')){ buf+=ch; continue; }
        out.push(buf); buf='';
      } else buf+=ch;
    }
    if(buf) out.push(buf);
    return out;
  }
  const rawLines=[];
  for(const ln of String(value == null ? '' : value).replace(/\r/g,'\n').split('\n')){
    for(const part of splitTop(ln)){
      const t=part.trim(); if(t) rawLines.push(t);
    }
  }
  const lines=[];
  for(let i=0;i<rawLines.length;i++){const line=rawLines[i];if(/^\d+x$/i.test(line)&&rawLines[i+1]){lines.push(`${line} ${rawLines[++i]}`)}else lines.push(line)}
  return lines;
}

// ══════════════════════════════════════════════════════════════════════════
//  localizeProduct — TEK GIRIS NOKTASI
//
//  Bir PocketBase/Typesense urun kaydi + gorunum dili alir; ekrana basilacak
//  YERELLESTIRILMIS modeli dondurur. Admin modali da site de BUNU cagirir.
//  Kaynak alan secimi (sourceSpecSections -> specSections ...) burada oldugu
//  icin iki taraf ayni ham veriyi okur; eskiden admin `sourceSpecSections`,
//  site `specSections` okuyup ayni urun icin FARKLI satir uretiyordu.
// ══════════════════════════════════════════════════════════════════════════
function localizeProduct(product, viewLang, options) {
  const p = product || {};
  const opt = options || {};
  const lang = String(viewLang || 'tr').slice(0, 2).toLowerCase();
  const storedSourceLang = String(p.sourceLang || '').toLowerCase().trim();
  const sourceLang = storedSourceLang || 'tr';
  // ── KAYNAK ALAN SECIMI (2026-08-18'de OLCUMLE degisti) ──────────────────
  // `specSections` / `specs` / `keySpecs` YARIM makine cevirisi tasiyor:
  // "Sarj Dongu Sayisi (AB)" -> "Charging Döngü Count (AB)". Bozulmamis
  // Turkce `multiLangSections.tr` / `multiLangSpecs.tr` icinde duruyor.
  // Bu ONEMLI, cunku asagidaki curated TR->EN sozlugu TEMIZ Turkce anahtarla
  // yazilmis ('sarj dongu sayisi (ab)'); yarim cevrilmis etiket ona HIC
  // carpmiyor ve satir sahte-Ingilizce olarak kaliyordu.
  //
  // OLCULDU (75 urun, scripts/_kaynak_secimi_ab.mjs + _admin_vs_site_kaynak.mjs):
  //   TR gorunumu · Ingilizce iz : specSections %33,1 -> multiLangSections.tr %2,0
  //   EN gorunumu · Turkce iz    : specSections  %0,3 -> multiLangSections.tr %0,1
  // sourceSpecSections yalnizca kayitlarin %19'unda dolu; %81'de admin de
  // KIRLI alani okuyordu. Artik iki taraf da temiz kaynagi okuyor.
  const isMap = (v) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0;
  // Bolum agaci mi (degerleri nesne) yoksa duz terim sozlugu mu? multiLang*.en
  // bir TERIM SOZLUGUdur, spec haritasi degil — sekil dogrulanmadan alinamaz.
  const isNested = (v) => isMap(v) && Object.values(v).some((x) => x && typeof x === 'object' && !Array.isArray(x));
  const isFlat = (v) => isMap(v) && Object.values(v).some((x) => typeof x === 'string' && x.trim());
  const cleanSections = p.multiLangSections && p.multiLangSections[sourceLang];
  const cleanFlat = p.multiLangSpecs && p.multiLangSpecs[sourceLang];
  const sourceSpecs = (isMap(p.sourceSpecs) && p.sourceSpecs)
    || (isFlat(cleanFlat) && cleanFlat)
    || (p.specs || {});
  const sourceSectionsRaw = (isMap(p.sourceSpecSections) && p.sourceSpecSections)
    || (isNested(cleanSections) && cleanSections)
    || (p.specSections || {});
  // keySpecs de ayni sekilde kirli olabiliyor; temiz agactaki "One Cikanlar"
  // bolumu varsa oncelikli.
  const HIGHLIGHT_TITLES = ['öne çıkanlar', 'one cikanlar', 'highlights', 'key specs'];
  const highlightsOf = (tree) => {
    if (!isMap(tree)) return null;
    for (const [title, rows] of Object.entries(tree)) {
      if (HIGHLIGHT_TITLES.indexOf(String(title || '').trim().toLowerCase()) >= 0 && isFlat(rows)) return rows;
    }
    return null;
  };
  const sourceKeySpecs = (isMap(p.sourceKeySpecs) && p.sourceKeySpecs)
    || highlightsOf(sourceSectionsRaw)
    || (p.keySpecs || {});
  // Reject legacy {translatedKey: translatedVal} payload — it can't resolve
  // source keys, so we treat it as missing instead of pretending to localize.
  let ml = (p.multiLangSpecs && p.multiLangSpecs[lang]) ? p.multiLangSpecs[lang] : null;
  if (ml && lang !== sourceLang && sourceSpecs) {
    const sourceKeys = Object.keys(sourceSpecs);
    if (sourceKeys.length && !sourceKeys.some((k) => Object.prototype.hasOwnProperty.call(ml, k))) {
      ml = null;
    }
  }
  const localizedName = (lang !== sourceLang && p.nameTranslated && p.nameTranslated[lang])
    ? p.nameTranslated[lang]
    : ((lang === sourceLang && p.nameTranslated && p.nameTranslated[sourceLang]) ? p.nameTranslated[sourceLang] : p.name);

  const loc = createSpecLocalizer({ lang: lang, sourceLang: sourceLang, ml: ml, dict: opt.dict || null });
  const lookupLocalizedText = loc.resolve;
  const cleanupModalText = loc.cleanup;

  // Build localized sections on the fly: keep the original Turkish section
  // grouping (Chip / Processor, Camera, …) but translate the key+value
  // inside via the cached multiLangSpecs lookup.
  let sections = normalizeSpecSectionsShape(sourceSectionsRaw);
  let directLocalizedSections = false;
  const rawLangSections = (lang !== sourceLang && p.multiLangSections && p.multiLangSections[lang]) ? p.multiLangSections[lang] : null;
  const isSimpleSectionNameMap = rawLangSections && !Array.isArray(rawLangSections) && typeof rawLangSections === 'object' &&
    Object.values(rawLangSections).every((v) => typeof v === 'string');
  if (sourceLang !== 'tr' && rawLangSections && !isSimpleSectionNameMap) {
    const directSections = normalizeSpecSectionsShape(rawLangSections);
    if (directSections) { sections = directSections; directLocalizedSections = true; }
  }
  if (sections && lang !== sourceLang && !directLocalizedSections) {
    const secMap = rawLangSections
      ? (isSimpleSectionNameMap ? rawLangSections : null)
      : null;
    const localized = {};
    for (const [sec, obj] of Object.entries(sections)) {
      if (!obj || typeof obj !== 'object') continue;
      const localSecRaw = (secMap && secMap[sec] && typeof secMap[sec] === 'string') ? secMap[sec] : lookupLocalizedText(sec);
      const localSec = cleanupModalText(localSecRaw, sec);
      localized[localSec] = {};
      for (const [k, v] of Object.entries(obj)) {
        const directSectionVal = sourceLang !== 'tr' && secMap && secMap[sec] && typeof secMap[sec] === 'object' ? secMap[sec][k] : null;
        const tk = lookupLocalizedText(k);
        const tv = directSectionVal || lookupLocalizedText(v);
        localized[localSec][tk] = tv;
      }
    }
    sections = localized;
  }

  // Bolum agaci yoksa duz liste (admin modalindeki `else` dali). Eskiden bu
  // dal ceviri gerektiginde `p.specs`i (kirli) okuyordu; artik yukaridaki
  // temiz kaynak secimi burada da gecerli.
  const flatSource = sourceSpecs;
  const flat = (lang !== sourceLang)
    ? Object.fromEntries(Object.entries(flatSource || {}).map(([k, v]) => [lookupLocalizedText(k), lookupLocalizedText(v)]))
    : (flatSource || {});

  const keySpecs = (lang !== sourceLang)
    ? Object.fromEntries(Object.entries(sourceKeySpecs || {}).map(([k, v]) => [lookupLocalizedText(k), lookupLocalizedText(v)]))
    : (sourceKeySpecs || {});

  function valueLines(value) {
    const lines = splitSpecValueLines(value);
    return (lang !== sourceLang) ? lines.map((line) => lookupLocalizedText(line)) : lines;
  }

  return {
    lang: lang,
    sourceLang: sourceLang,
    name: localizedName,
    isHighlightsTitle: (title) => HIGHLIGHT_TITLES.indexOf(String(title || '').trim().toLowerCase()) >= 0,
    sections: sections,
    flat: flat,
    keySpecs: keySpecs,
    resolve: lookupLocalizedText,
    cleanup: cleanupModalText,
    valueLines: valueLines,
  };
}

var API = {
  localizeProduct: localizeProduct,
  splitSpecValueLines: splitSpecValueLines,
  normalizeSpecSectionsShape: normalizeSpecSectionsShape,
  createSpecLocalizer: createSpecLocalizer,
  sanitizeEnglishSpecText: _sanitizeEnglishSpecText,
  normalizeTurkishSourceTranslation: _normalizeTurkishSourceTranslation,
  knownTurkishRuleTranslation: _knownTurkishRuleTranslation,
  translationHasTurkishResidue: _translationHasTurkishResidue,
  isProtectedTechnicalAtom: _isProtectedTechnicalAtom,
  finalPassTurkishCleanup: _finalPassTurkishCleanup,
  normalizeDictSourceKey: _normalizeDictSourceKey,
  foldSourceResidueText: _foldSourceResidueText,
  escapeRegExp: _escapeRegExp,
  tb: _tb,
  TR_WORD_DICT: _TR_WORD_DICT,
  TR_WORD_CHARS: _TR_WORD_CHARS,
  unknownTrWords: _unknownTrWords,
};

// Admin klasik <script> ile, site (Vite) yan-etki import'u ile okur; Node
// tarafindaki olcum araclari vm baglaminda ayni globali alir.
root.QorAiSpecI18n = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
