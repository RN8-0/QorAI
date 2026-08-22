/**
 * Translates every Turkish atom from scripts/_missing_atoms.json into
 * EN/DE/ES/FR/PT/RU and writes the result as a single sharded import to
 * PocketBase. Combines:
 *
 *   1. Pattern-based generation for numeric + unit constructs
 *      ("3 inç" → "3 inch", "7 saat" → "7 hours", "4 Çekirdek" → "4 cores").
 *   2. A large MANUAL table for stand-alone spec keys ("Çap", "Şarj",
 *      "Hızlı Şarj Çıkışı"…).
 *   3. Passthrough for brand+model identifier strings (anything that
 *      contains an Apple/Samsung/Asus/MSI/Lenovo etc. brand name + model).
 *
 * Anything that doesn't match a pattern AND isn't in the MANUAL map is
 * written to scripts/_unmatched_atoms.json so we can keep extending.
 *
 * Usage:
 *   node scripts/build_seed_from_harvest.js [--upload]
 *
 * Without --upload the script just builds and reports counts. With
 * --upload it merges into the existing tr_translation_dict shards in
 * PocketBase via the same shard format the scraper expects.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function loadEnv(p) {
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}
const env = { ...loadEnv(path.join(__dirname, '..', 'migration', '.env')), ...process.env };
const PB_URL = (env.POCKETBASE_URL || '').replace(/\/$/, '');
const PB_EMAIL = env.POCKETBASE_ADMIN_EMAIL;
const PB_PASSWORD = env.POCKETBASE_ADMIN_PASSWORD;

const DICT_PB_KEY = 'tr_translation_dict';
const DICT_MANIFEST_KEY = `${DICT_PB_KEY}_manifest`;
const DICT_SHARD_PREFIX = `${DICT_PB_KEY}__part_`;
const DICT_SHARD_MAX_BYTES = 180000;
// Seed dizileri KONUM tabanlidir: [en, de, es, fr, pt, ru]. Almanca
// 2026-08-21'de urunden kaldirildi ama dosyalardaki SUTUN yerinde duruyor —
// 'de'yi listeden CIKARMAK sonraki butun dilleri bir kaydirirdi ('es' Almanca
// degeri alirdi). O yuzden sutun null ile isaretlenir, silinmez; LANGS de
// bundan turetilir, boylece PB'ye Almanca YAZILMAZ.
const SEED_COLUMNS = ['en', null, 'es', 'fr', 'pt', 'ru'];
const LANGS = SEED_COLUMNS.filter(Boolean);

const ATOMS = require('./_missing_atoms.json');

const normalizeKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const normalizeFoldedKey = (s) => String(s || '')
  .replace(/İ/g, 'I')
  .replace(/ı/g, 'i')
  .normalize('NFKD')
  .replace(/\p{M}/gu, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

function normalizeKeyAliases(s) {
  return [...new Set([normalizeKey(s), normalizeFoldedKey(s)].filter(Boolean))];
}

function sanitizeOutputText(text) {
  return String(text ?? '')
    .replace(/\bSportsts\b/g, 'Sports')
    .replace(/\bSportst\b/g, 'Sport')
    .replace(/\bDolby vision\b/gi, 'Dolby Vision')
    .replace(/\bFree-sync premium\b/gi, 'FreeSync Premium')
    .replace(/\bX-rite\b/gi, 'X-Rite')
    .replace(/%(\d+(?:[.,]\d+)?)/g, '$1%')
    .replace(/TÜV Rheinland Düşük Mavi Işık Sertifikası\s*\(\s*Donanımsal\s*\)/gi, 'TÜV Rheinland Low Blue Light Certification (Hardware)')
    .replace(/TÜV Rheinland Düşük Mavi Işık Sertifikası/gi, 'TÜV Rheinland Low Blue Light Certification')
    .replace(/TÜV Rheinland Yüksek Oyun Performansı/gi, 'TÜV Rheinland High Gaming Performance')
    .replace(/Düşük Mavi Işık Sertifikası\s*\(\s*Donanımsal\s*\)/gi, 'Low Blue Light Certification (Hardware)')
    .replace(/Düşük Mavi Işık Sertifikası/gi, 'Low Blue Light Certification')
    .replace(/Yüksek Oyun Performansı/gi, 'High Gaming Performance')
    .replace(/Donanımsal/gi, 'Hardware')
    .replace(/\bGöz Sağlığı Sertifikasyonu\b/gi, 'Eye Health Certification')
    .replace(/\bEyesafe\s*\(\s*Eye Health Certification\s*\)/gi, 'Eyesafe (Eye Health Certification)')
    .replace(/\bPhycker free\b/gi, 'Flicker Free')
    .replace(/\bFactory color calibration\b/gi, 'Factory Color Calibration')
    .replace(/\bLow power\b/gi, 'Low Power')
    .replace(/\bX-Rite factory color calibration\b/gi, 'X-Rite Factory Color Calibration')
    .replace(/\bGold level game performance & comfort\s*\(\s*ul solutions\s*\)/gi, 'Gold-Level Gaming Performance & Comfort (UL Solutions)')
    .replace(/TÜV Rheinland Titreşimsiz Sertifikasyonu/gi, 'TÜV Rheinland Flicker-Free Certification')
    .replace(/LED Arka Aydınlatma Teknolojisi/gi, 'LED Backlight Technology')
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
    .replace(/\bMusic Player Control\b/g, 'Music Player Control')
    .replace(/\bGymkit\b/g, 'GymKit')
    .replace(/\bDigital crown\b/gi, 'Digital Crown')
    .replace(/\bFingerprint non-drinsing coating\b/gi, 'Fingerprint-Resistant Coating')
    .replace(/\bP3\s*\(\s*Wide color vest\s*\)/gi, 'P3 (Wide Color Gamut)')
    .replace(/\bApple pencil\b/gi, 'Apple Pencil')
    .replace(/\bTrue tone\b/gi, 'True Tone')
    .replace(/\bLiquid retina\b/gi, 'Liquid Retina')
    .replace(/\bMulti touch\b/gi, 'Multi-Touch')
    .replace(/\bHlg\b/g, 'HLG')
    .replace(/\bIPS panel\b/gi, 'IPS Panel')
    .replace(/\bLenovo AI now\b/gi, 'Lenovo AI Now')
    .replace(/\bLenovo vantage\b/gi, 'Lenovo Vantage')
    .replace(/\bSmart connect\b/gi, 'Smart Connect')
    .replace(/\bScreen refresh rate\s+(\d+\s*Hz)\b/gi, '$1 Refresh Rate')
    .replace(/\b(\d+)\s+Nit brightness\b/gi, '$1 nit Brightness')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function sanitizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  const out = { ...entry };
  for (const lang of LANGS) {
    if (typeof out[lang] === 'string') out[lang] = sanitizeOutputText(out[lang]);
  }
  return out;
}

function loadTranslationBatches() {
  const dir = path.join(__dirname, 'seed_data');
  if (!fs.existsSync(dir)) return {};
  const out = {};
  for (const file of fs.readdirSync(dir).filter(f => /^atom_translations_.*\.json$/i.test(f)).sort()) {
    const full = path.join(dir, file);
    const data = JSON.parse(fs.readFileSync(full, 'utf8'));
    for (const [atom, translations] of Object.entries(data)) {
      if (!Array.isArray(translations) || translations.length !== SEED_COLUMNS.length) {
        throw new Error(`${file}: ${atom} must have ${SEED_COLUMNS.length} translations`);
      }
      out[atom] = translations;
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────
//  MANUAL — single-token and short-phrase spec terms.
//  Keep these strictly accurate; the user requested zero mistranslation.
// ────────────────────────────────────────────────────────────────────────
const MANUAL = {
  // ── Cross-category short spec keys ─────────────────────────────────────
  'Çap':                ['Diameter','Durchmesser','Diámetro','Diamètre','Diâmetro','Диаметр'],
  'Fan':                ['Fan','Lüfter','Ventilador','Ventilateur','Ventilador','Вентилятор'],
  'Fiş':                ['Plug','Stecker','Enchufe','Fiche','Plugue','Штекер'],
  'Güç':                ['Power','Leistung','Potencia','Puissance','Potência','Мощность'],
  'Yıl':                ['Year','Jahr','Año','Année','Ano','Год'],
  'Aile':               ['Family','Familie','Familia','Famille','Família','Семейство'],
  'Akım':               ['Current','Strom','Corriente','Courant','Corrente','Ток'],
  'Oyun':               ['Gaming','Gaming','Gaming','Jeu','Jogos','Игры'],
  'Şarj':               ['Charging','Aufladung','Carga','Charge','Carregamento','Зарядка'],
  'Türü':               ['Type','Typ','Tipo','Type','Tipo','Тип'],
  'Tipi':               ['Type','Typ','Tipo','Type','Tipo','Тип'],
  'Bağlantı':           ['Connection','Verbindung','Conexión','Connexion','Conexão','Подключение'],
  'Bakır':              ['Copper','Kupfer','Cobre','Cuivre','Cobre','Медь'],
  'Gümüş':              ['Silver','Silber','Plata','Argent','Prata','Серебро'],
  'Müzik':              ['Music','Musik','Música','Musique','Música','Музыка'],
  'Raylı':              ['Rail-mounted','Schienenmontiert','Sobre Rieles','Sur Rail','Sobre Trilho','На рельсах'],
  'Şubat':              ['February','Februar','Febrero','Février','Fevereiro','Февраль'],
  'Yeşil':              ['Green','Grün','Verde','Vert','Verde','Зелёный'],
  'Soğutma':            ['Cooling','Kühlung','Refrigeración','Refroidissement','Refrigeração','Охлаждение'],
  'Yazılım':            ['Software','Software','Software','Logiciel','Software','Программное обеспечение'],
  'İşlemci':            ['Processor','Prozessor','Procesador','Processeur','Processador','Процессор'],
  'Kablolu':            ['Wired','Kabelgebunden','Por Cable','Filaire','Com Fio','Проводной'],
  'Kablosuz':           ['Wireless','Drahtlos','Inalámbrico','Sans Fil','Sem Fio','Беспроводной'],
  'Kırmızı':            ['Red','Rot','Rojo','Rouge','Vermelho','Красный'],
  'Kulaklık':           ['Headphones','Kopfhörer','Auriculares','Casque','Fones de Ouvido','Наушники'],
  'Radyatör':           ['Radiator','Radiator','Radiador','Radiateur','Radiador','Радиатор'],
  'Soğutucu':           ['Cooler','Kühler','Refrigerador','Refroidisseur','Refrigerador','Охладитель'],
  'Tarayıcı':           ['Scanner','Scanner','Escáner','Scanner','Scanner','Сканер'],
  'Titreşim':           ['Vibration','Vibration','Vibración','Vibration','Vibração','Вибрация'],
  'PWM Fan':            ['PWM Fan','PWM-Lüfter','Ventilador PWM','Ventilateur PWM','Ventilador PWM','PWM-вентилятор'],
  'ARGB Fan':           ['ARGB Fan','ARGB-Lüfter','Ventilador ARGB','Ventilateur ARGB','Ventilador ARGB','ARGB-вентилятор'],
  'Fan Tipi':           ['Fan Type','Lüftertyp','Tipo de Ventilador','Type de Ventilateur','Tipo de Ventilador','Тип Вентилятора'],
  'Fan Pasif':          ['Passive (Fanless)','Passiv (lüfterlos)','Pasivo (Sin Ventilador)','Passif (Sans Ventilateur)','Passivo (Sem Ventilador)','Пассивный (Без вентилятора)'],
  'Fan Işığı':          ['Fan Lighting','Lüfterbeleuchtung','Iluminación del Ventilador','Éclairage du Ventilateur','Iluminação do Ventilador','Подсветка Вентилятора'],
  'Fan Boyutu':         ['Fan Size','Lüftergröße','Tamaño del Ventilador','Taille du Ventilateur','Tamanho do Ventilador','Размер Вентилятора'],
  'Fan Sayısı':         ['Fan Count','Anzahl der Lüfter','Número de Ventiladores','Nombre de Ventilateurs','Quantidade de Ventiladores','Количество Вентиляторов'],
  'Fan Rulmanı':        ['Fan Bearing','Lüfterlager','Rodamiento del Ventilador','Roulement du Ventilateur','Rolamento do Ventilador','Подшипник Вентилятора'],
  'Ana Fan Boyutu':     ['Main Fan Size','Hauptlüftergröße','Tamaño del Ventilador Principal','Taille du Ventilateur Principal','Tamanho do Ventilador Principal','Размер Основного Вентилятора'],
  'Yan Fan Boyutu':     ['Side Fan Size','Seitenlüftergröße','Tamaño del Ventilador Lateral','Taille du Ventilateur Latéral','Tamanho do Ventilador Lateral','Размер Бокового Вентилятора'],
  'Çift Yönlü Fan':     ['Bi-directional Fan','Bidirektionaler Lüfter','Ventilador Bidireccional','Ventilateur Bidirectionnel','Ventilador Bidirecional','Двунаправленный вентилятор'],
  'Fan Dönüş Hızı':     ['Fan Speed','Lüfterdrehzahl','Velocidad del Ventilador','Vitesse du Ventilateur','Velocidade do Ventilador','Скорость Вентилятора'],
  'Fan Kapasitesi':     ['Fan Capacity','Lüfterkapazität','Capacidad del Ventilador','Capacité du Ventilateur','Capacidade do Ventilador','Производительность Вентилятора'],
  'Fan Bağlantısı':     ['Fan Connection','Lüfteranschluss','Conexión del Ventilador','Connexion du Ventilateur','Conexão do Ventilador','Подключение Вентилятора'],
  'Fan Ses Seviyesi':   ['Fan Noise Level','Lüftergeräuschpegel','Nivel de Ruido del Ventilador','Niveau de Bruit du Ventilateur','Nível de Ruído do Ventilador','Уровень Шума Вентилятора'],
  'Fan Soğutma Kapsamı':['Fan Cooling Coverage','Lüfterkühlbereich','Cobertura de Refrigeración del Ventilador','Couverture de Refroidissement du Ventilateur','Cobertura de Refrigeração do Ventilador','Зона охлаждения вентилятора'],
  'Fan Kontrol Düğmesi':['Fan Control Button','Lüftersteuerungstaste','Botón de Control del Ventilador','Bouton de Contrôle du Ventilateur','Botão de Controle do Ventilador','Кнопка Управления Вентилятором'],
  'Dahili Fan Tipi':    ['Built-in Fan Type','Eingebauter Lüftertyp','Tipo de Ventilador Integrado','Type de Ventilateur Intégré','Tipo de Ventilador Integrado','Тип Встроенного Вентилятора'],
  'Dahili Fan Sayısı':  ['Built-in Fan Count','Anzahl der eingebauten Lüfter','Número de Ventiladores Integrados','Nombre de Ventilateurs Intégrés','Quantidade de Ventiladores Integrados','Количество встроенных вентиляторов'],
  'Dahili Fan Ebatları':['Built-in Fan Dimensions','Eingebaute Lüfterabmessungen','Dimensiones del Ventilador Integrado','Dimensions du Ventilateur Intégré','Dimensões do Ventilador Integrado','Размеры Встроенного Вентилятора'],
  'Desteklenen Fan Ebatları':['Supported Fan Sizes','Unterstützte Lüftergrößen','Tamaños de Ventilador Compatibles','Tailles de Ventilateur Prises en Charge','Tamanhos de Ventilador Suportados','Поддерживаемые размеры вентилятора'],
  'CPU Fan Yüksekliği': ['CPU Fan Height','CPU-Lüfterhöhe','Altura del Ventilador de CPU','Hauteur du Ventilateur du Processeur','Altura do Ventilador da CPU','Высота вентилятора процессора'],
  // ── Charging & battery (extension)
  'Şarj Olma':          ['Charging','Aufladung','Carga','Charge','Carregamento','Зарядка'],
  'Şarj Tipi':          ['Charging Type','Ladetyp','Tipo de Carga','Type de Charge','Tipo de Carregamento','Тип Зарядки'],
  'Şarj Biçimi':        ['Charging Format','Ladeformat','Formato de Carga','Format de Charge','Formato de Carregamento','Формат Зарядки'],
  'Şarj Süresi':        ['Charging Time','Ladezeit','Tiempo de Carga','Temps de Charge','Tempo de Carregamento','Время Зарядки'],
  'Şarj Kutusu':        ['Charging Case','Ladebox','Estuche de Carga','Boîtier de Charge','Estojo de Carregamento','Зарядный футляр'],
  'Şarj Desteği':       ['Charging Support','Lade-Unterstützung','Soporte de Carga','Support de Charge','Suporte de Carregamento','Поддержка Зарядки'],
  'Şarj Teknolojisi':   ['Charging Technology','Ladetechnologie','Tecnología de Carga','Technologie de Charge','Tecnologia de Carregamento','Технология Зарядки'],
  'Şarj İstasyonu':     ['Charging Dock','Ladestation','Estación de Carga','Station de Charge','Estação de Carregamento','Зарядная станция'],
  'Manyetik Şarj':      ['Magnetic Charging','Magnetisches Laden','Carga Magnética','Charge Magnétique','Carregamento Magnético','Магнитная зарядка'],
  'Otomatik Şarj':      ['Auto Charging','Automatisches Laden','Carga Automática','Charge Automatique','Carregamento Automático','Автозарядка'],
  'Hızlı Şarj Çıkışı':  ['Fast Charging Output','Schnelllade-Ausgang','Salida de Carga Rápida','Sortie de Charge Rapide','Saída de Carregamento Rápido','Выход быстрой зарядки'],
  'Hızlı Şarj Girişi':  ['Fast Charging Input','Schnelllade-Eingang','Entrada de Carga Rápida','Entrée de Charge Rapide','Entrada de Carregamento Rápido','Вход быстрой зарядки'],
  'Hızlı Şarj (100W)':  ['Fast Charging (100W)','Schnellladen (100W)','Carga Rápida (100W)','Charge Rapide (100W)','Carregamento Rápido (100W)','Быстрая зарядка (100 Вт)'],
  'Hızlı Şarj (120W)':  ['Fast Charging (120W)','Schnellladen (120W)','Carga Rápida (120W)','Charge Rapide (120W)','Carregamento Rápido (120W)','Быстрая зарядка (120 Вт)'],
  'Hızlı Şarj Çıkış Akımı':['Fast Charging Output Current','Schnelllade-Ausgangsstrom','Corriente de Salida de Carga Rápida','Courant de Sortie de Charge Rapide','Corrente de Saída de Carregamento Rápido','Ток выхода быстрой зарядки'],
  'Hızlı Şarj Giriş Akımı':['Fast Charging Input Current','Schnelllade-Eingangsstrom','Corriente de Entrada de Carga Rápida','Courant d\'Entrée de Charge Rapide','Corrente de Entrada de Carregamento Rápido','Ток входа быстрой зарядки'],
  'Hızlı Şarj Çıkış Teknolojisi':['Fast Charging Output Technology','Schnelllade-Ausgangstechnologie','Tecnología de Salida de Carga Rápida','Technologie de Sortie de Charge Rapide','Tecnologia de Saída de Carregamento Rápido','Технология выхода быстрой зарядки'],
  'Hızlı Şarj Giriş Teknolojisi':['Fast Charging Input Technology','Schnelllade-Eingangstechnologie','Tecnología de Entrada de Carga Rápida','Technologie d\'Entrée de Charge Rapide','Tecnologia de Entrada de Carregamento Rápido','Технология входа быстрой зарядки'],
  'Hızlı Şarj Gücü (Maks.)':['Max Fast Charging Power','Max. Schnellladeleistung','Potencia Máxima de Carga Rápida','Puissance Max de Charge Rapide','Potência Máxima de Carregamento Rápido','Макс. мощность быстрой зарядки'],
  'Hızlı Şarj (USB BC 1.2)':['Fast Charging (USB BC 1.2)','Schnellladen (USB BC 1.2)','Carga Rápida (USB BC 1.2)','Charge Rapide (USB BC 1.2)','Carregamento Rápido (USB BC 1.2)','Быстрая зарядка (USB BC 1.2)'],
  'Bataryalı Kullanım': ['Battery-Powered Use','Akkubetrieb','Uso con Batería','Utilisation sur Batterie','Uso com Bateria','Работа от аккумулятора'],
  'Batarya Dolum Süresi':['Battery Charging Time','Akku-Ladezeit','Tiempo de Carga de Batería','Temps de Charge de la Batterie','Tempo de Carregamento da Bateria','Время зарядки аккумулятора'],
  'Pil Tipi':           ['Battery Type','Akkutyp','Tipo de Batería','Type de Batterie','Tipo de Bateria','Тип Аккумулятора'],
  'Pil ile Çalışma Süresi':['Battery Runtime','Akku-Laufzeit','Tiempo de Funcionamiento con Batería','Autonomie sur Batterie','Tempo de Funcionamento com Bateria','Время работы от аккумулятора'],
  'Pil Kapasitesi':     ['Battery Capacity','Akkukapazität','Capacidad de Batería','Capacité de la Batterie','Capacidade da Bateria','Емкость Аккумулятора'],
  'Pil Kapasitesi (Azami)':['Battery Capacity (Maximum)','Akkukapazität (Maximum)','Capacidad de Batería (Máxima)','Capacité de la Batterie (Maximum)','Capacidade da Bateria (Máxima)','Емкость аккумулятора (макс.)'],
  'Şarj Sonrası Pil Süresi':['Battery Life After Charge','Akkulaufzeit nach dem Laden','Duración de Batería Tras Carga','Autonomie Après Charge','Duração da Bateria Após Carregar','Время работы после зарядки'],
  'Şarj Döngü Sayısı (AB)':['Charge Cycle Count (EU)','Ladezyklen (EU)','Recuento de Ciclos de Carga (UE)','Nombre de Cycles de Charge (UE)','Contagem de Ciclos de Carga (UE)','Циклы зарядки (ЕС)'],
  'Şarj Döngü Sayısı (Üretici)':['Charge Cycle Count (Manufacturer)','Ladezyklen (Hersteller)','Recuento de Ciclos de Carga (Fabricante)','Nombre de Cycles de Charge (Fabricant)','Contagem de Ciclos de Carga (Fabricante)','Циклы зарядки (производитель)'],
  'Şarj Kutusu USB-C':  ['USB-C Charging Case','USB-C Ladebox','Estuche de Carga USB-C','Boîtier de Charge USB-C','Estojo de Carregamento USB-C','Зарядный футляр USB-C'],
  'Şarj Kutusu Özellikleri':['Charging Case Features','Ladebox-Funktionen','Características del Estuche de Carga','Caractéristiques du Boîtier de Charge','Características do Estojo de Carregamento','Возможности зарядного футляра'],
  'Şarj Kutusu Süresi (Genel)':['Charging Case Total Life','Ladebox Gesamtlaufzeit','Duración Total del Estuche de Carga','Autonomie Totale du Boîtier de Charge','Duração Total do Estojo de Carregamento','Общее время работы футляра'],
  'Şarj Kutusu Süresi (Yoğun)':['Charging Case Heavy-Use Life','Ladebox Intensivnutzung','Duración del Estuche de Carga en Uso Intenso','Autonomie du Boîtier en Usage Intensif','Duração do Estojo em Uso Intenso','Время работы футляра при активном использовании'],
  'Kablosuz Şarj Kutusu USB-C':['USB-C Wireless Charging Case','USB-C Kabelloses Ladegehäuse','Estuche de Carga Inalámbrico USB-C','Boîtier de Charge Sans Fil USB-C','Estojo de Carregamento Sem Fio USB-C','Беспроводной зарядный футляр USB-C'],
  'Kablosuz Şarj Özellikleri':['Wireless Charging Features','Kabellose Lade-Funktionen','Características de Carga Inalámbrica','Caractéristiques de Charge Sans Fil','Características de Carregamento Sem Fio','Возможности беспроводной зарядки'],

  // ── Cameras / lens / video (cross-cat)
  'Filtre Çapı':        ['Filter Diameter','Filterdurchmesser','Diámetro del Filtro','Diamètre du Filtre','Diâmetro do Filtro','Диаметр фильтра'],
  'Filtre Tipi':        ['Filter Type','Filtertyp','Tipo de Filtro','Type de Filtre','Tipo de Filtro','Тип Фильтра'],
  'Filtre Desteği':     ['Filter Support','Filterunterstützung','Soporte para Filtro','Support de Filtre','Suporte para Filtro','Поддержка фильтра'],
  'Klasik Ön Filtre':   ['Classic Front Filter','Klassischer Vorderfilter','Filtro Frontal Clásico','Filtre Avant Classique','Filtro Frontal Clássico','Классический передний фильтр'],
  'Lens Tipi':          ['Lens Type','Objektivtyp','Tipo de Lente','Type d\'Objectif','Tipo de Lente','Тип Объектива'],
  'Lens Türü':          ['Lens Type','Objektivtyp','Tipo de Lente','Type d\'Objectif','Tipo de Lente','Тип Объектива'],
  'Lens İşlevi':        ['Lens Function','Objektivfunktion','Función de Lente','Fonction de l\'Objectif','Função da Lente','Функция объектива'],
  'Lens Serisi':        ['Lens Series','Objektivserie','Serie de Lentes','Série d\'Objectifs','Série de Lentes','Серия объективов'],
  'Lens Mesafesi':      ['Lens Distance','Objektivabstand','Distancia del Lente','Distance de l\'Objectif','Distância da Lente','Расстояние объектива'],
  'Lens Kaydırma':      ['Lens Shift','Objektivverschiebung','Desplazamiento del Lente','Décalage de l\'Objectif','Deslocamento da Lente','Сдвиг объектива'],
  'Lens Elemanları':    ['Lens Elements','Linsenelemente','Elementos del Lente','Éléments de l\'Objectif','Elementos da Lente','Элементы линзы'],
  'Lens Kaplaması':     ['Lens Coating','Objektivbeschichtung','Recubrimiento del Lente','Revêtement de l\'Objectif','Revestimento da Lente','Покрытие линзы'],
  'Lens Özellikleri':   ['Lens Features','Objektivmerkmale','Características de Lente','Caractéristiques de l\'Objectif','Características da Lente','Возможности объектива'],
  'Odak Uzaklığı':      ['Focal Length','Brennweite','Distancia Focal','Distance Focale','Distância Focal','Фокусное расстояние'],
  'Odak Uzaklığı (Geniş)':['Focal Length (Wide)','Brennweite (Weitwinkel)','Distancia Focal (Ancha)','Distance Focale (Grand Angle)','Distância Focal (Ampla)','Фокусное расстояние (широкое)'],
  'Odaklama Mesafesi':  ['Focus Distance','Fokusabstand','Distancia de Enfoque','Distance de Mise au Point','Distância de Foco','Дистанция фокусировки'],
  'Odaklama Teknolojisi':['Focus Technology','Fokustechnologie','Tecnología de Enfoque','Technologie de Mise au Point','Tecnologia de Foco','Технология фокусировки'],
  'Hızlı Odaklama':     ['Fast Focus','Schneller Fokus','Enfoque Rápido','Mise au Point Rapide','Foco Rápido','Быстрая фокусировка'],
  'İçeride Odaklanma':  ['Internal Focusing','Innenfokussierung','Enfoque Interno','Mise au Point Interne','Foco Interno','Внутренняя фокусировка'],
  'Görüntü Sabitleyici':['Image Stabilizer','Bildstabilisator','Estabilizador de Imagen','Stabilisateur d\'Image','Estabilizador de Imagem','Стабилизатор изображения'],
  'Görüntü Sabitleyici Özelliği':['Image Stabilizer Feature','Bildstabilisator-Funktion','Función del Estabilizador de Imagen','Fonction du Stabilisateur d\'Image','Recurso do Estabilizador de Imagem','Функция стабилизатора изображения'],
  'Görüntü Sensörü':    ['Image Sensor','Bildsensor','Sensor de Imagen','Capteur d\'Image','Sensor de Imagem','Сенсор изображения'],
  'Görüntü İşlemcisi':  ['Image Processor','Bildprozessor','Procesador de Imagen','Processeur d\'Image','Processador de Imagem','Процессор изображения'],
  'Görüntü Yükseltme (Upscaling)':['Image Upscaling','Bildhochskalierung','Mejora de Imagen','Mise à l\'Échelle d\'Image','Aumento de Imagem','Апскейлинг изображения'],
  'Görüntü Standardı':  ['Image Standard','Bildstandard','Estándar de Imagen','Standard d\'Image','Padrão de Imagem','Стандарт изображения'],
  'Görüntü Modları':    ['Image Modes','Bildmodi','Modos de Imagen','Modes d\'Image','Modos de Imagem','Режимы изображения'],
  'Video Modları':      ['Video Modes','Videomodi','Modos de Video','Modes Vidéo','Modos de Vídeo','Видеорежимы'],
  'Video Kare Hızı':    ['Video Frame Rate','Video-Bildrate','Velocidad de Fotogramas de Video','Fréquence d\'Images Vidéo','Taxa de Quadros de Vídeo','Частота кадров видео'],
  'Video Kayıt Çözünürlüğü':['Video Recording Resolution','Videoaufnahmeauflösung','Resolución de Grabación de Video','Résolution d\'Enregistrement Vidéo','Resolução de Gravação de Vídeo','Разрешение видеозаписи'],
  'Video Kayıt Özellikleri':['Video Recording Features','Videoaufnahmefunktionen','Características de Grabación de Video','Caractéristiques d\'Enregistrement Vidéo','Características de Gravação de Vídeo','Возможности видеозаписи'],
  'Video Kayıt Seçenekleri':['Video Recording Options','Videoaufnahmeoptionen','Opciones de Grabación de Video','Options d\'Enregistrement Vidéo','Opções de Gravação de Vídeo','Параметры видеозаписи'],
  'Video Çözünürlüğü':  ['Video Resolution','Videoauflösung','Resolución de Video','Résolution Vidéo','Resolução de Vídeo','Разрешение видео'],
  'Video FPS Değeri':   ['Video FPS','Video-FPS','FPS de Video','FPS Vidéo','FPS de Vídeo','Видео FPS'],
  'Fotoğraf Çözünürlüğü':['Photo Resolution','Fotoauflösung','Resolución de Foto','Résolution Photo','Resolução da Foto','Разрешение фото'],
  'Fotoğraf Çekebilme': ['Photo Capture','Fotoaufnahme','Captura de Foto','Capture Photo','Captura de Foto','Фотосъёмка'],
  'Fotoğraf Baskısı':   ['Photo Print','Fotodruck','Impresión de Foto','Impression Photo','Impressão de Foto','Печать фото'],
  'Fotoğraf Baskısı Özellikleri':['Photo Print Features','Fotodruck-Funktionen','Características de Impresión de Foto','Caractéristiques d\'Impression Photo','Recursos de Impressão de Foto','Возможности фотопечати'],

  // ── Display values + small spec keys
  '3D Desteği':         ['3D Support','3D-Unterstützung','Compatibilidad 3D','Support 3D','Suporte 3D','Поддержка 3D'],
  'HDR Desteği':        ['HDR Support','HDR-Unterstützung','Compatibilidad HDR','Support HDR','Suporte HDR','Поддержка HDR'],
  'HDR Özellikleri':    ['HDR Features','HDR-Funktionen','Características HDR','Caractéristiques HDR','Características HDR','Возможности HDR'],
  'HDR Güç Tüketimi (1000h)':['HDR Power Consumption (1000h)','HDR-Energieverbrauch (1000h)','Consumo de Energía HDR (1000h)','Consommation HDR (1000h)','Consumo de Energia HDR (1000h)','Энергопотребление HDR (1000ч)'],
  'HDR Enerji Tüketimi (1000h)':['HDR Energy Consumption (1000h)','HDR-Energieverbrauch (1000h)','Consumo Energético HDR (1000h)','Consommation Énergétique HDR (1000h)','Consumo Energético HDR (1000h)','Энергопотребление HDR (1000ч)'],
  'HDR Enerji Tüketim Sınıfı (A-G)':['HDR Energy Class (A-G)','HDR-Energieklasse (A-G)','Clase Energética HDR (A-G)','Classe Énergétique HDR (A-G)','Classe Energética HDR (A-G)','Класс энергоэффективности HDR (A-G)'],
  'SDR Güç Tüketimi (1000h)':['SDR Power Consumption (1000h)','SDR-Energieverbrauch (1000h)','Consumo de Energía SDR (1000h)','Consommation SDR (1000h)','Consumo de Energia SDR (1000h)','Энергопотребление SDR (1000ч)'],
  'SDR Enerji Tüketimi (1000h)':['SDR Energy Consumption (1000h)','SDR-Energieverbrauch (1000h)','Consumo Energético SDR (1000h)','Consommation Énergétique SDR (1000h)','Consumo Energético SDR (1000h)','Энергопотребление SDR (1000ч)'],
  'SDR Enerji Tüketim Sınıfı (A-G)':['SDR Energy Class (A-G)','SDR-Energieklasse (A-G)','Clase Energética SDR (A-G)','Classe Énergétique SDR (A-G)','Classe Energética SDR (A-G)','Класс энергоэффективности SDR (A-G)'],
  'sRGB Desteği':       ['sRGB Support','sRGB-Unterstützung','Compatibilidad sRGB','Support sRGB','Suporte sRGB','Поддержка sRGB'],
  'sRGB Kapsamı':       ['sRGB Coverage','sRGB-Abdeckung','Cobertura sRGB','Couverture sRGB','Cobertura sRGB','Охват sRGB'],
  'NTSC Desteği':       ['NTSC Support','NTSC-Unterstützung','Compatibilidad NTSC','Support NTSC','Suporte NTSC','Поддержка NTSC'],
  'NTSC Kapsamı':       ['NTSC Coverage','NTSC-Abdeckung','Cobertura NTSC','Couverture NTSC','Cobertura NTSC','Охват NTSC'],
  'DCI-P3 Desteği':     ['DCI-P3 Support','DCI-P3-Unterstützung','Compatibilidad DCI-P3','Support DCI-P3','Suporte DCI-P3','Поддержка DCI-P3'],
  'DCI-P3 Kapsamı':     ['DCI-P3 Coverage','DCI-P3-Abdeckung','Cobertura DCI-P3','Couverture DCI-P3','Cobertura DCI-P3','Охват DCI-P3'],
  'Adobe RGB Desteği':  ['Adobe RGB Support','Adobe RGB-Unterstützung','Compatibilidad Adobe RGB','Support Adobe RGB','Suporte Adobe RGB','Поддержка Adobe RGB'],
  'Adobe RGB Kapsamı':  ['Adobe RGB Coverage','Adobe RGB-Abdeckung','Cobertura Adobe RGB','Couverture Adobe RGB','Cobertura Adobe RGB','Охват Adobe RGB'],
  'VESA Desteği':       ['VESA Support','VESA-Unterstützung','Compatibilidad VESA','Support VESA','Suporte VESA','Поддержка VESA'],
  'VESA Standardı':     ['VESA Standard','VESA-Standard','Estándar VESA','Standard VESA','Padrão VESA','Стандарт VESA'],
  'VR Desteği':         ['VR Support','VR-Unterstützung','Compatibilidad VR','Support VR','Suporte VR','Поддержка VR'],
  'GaN Desteği':        ['GaN Support','GaN-Unterstützung','Compatibilidad GaN','Support GaN','Suporte GaN','Поддержка GaN'],
  '4.5G Desteği':       ['4.5G Support','4.5G-Unterstützung','Compatibilidad 4.5G','Support 4.5G','Suporte 4.5G','Поддержка 4.5G'],
  'Dahili Grafik Desteği (APU)':['Integrated Graphics (APU)','Integrierte Grafik (APU)','Gráficos Integrados (APU)','Graphismes Intégrés (APU)','Gráficos Integrados (APU)','Встроенная графика (APU)'],
  'IPTV Desteği':       ['IPTV Support','IPTV-Unterstützung','Compatibilidad IPTV','Support IPTV','Suporte IPTV','Поддержка IPTV'],
  'DDNS Desteği':       ['DDNS Support','DDNS-Unterstützung','Compatibilidad DDNS','Support DDNS','Suporte DDNS','Поддержка DDNS'],
  'Dil Desteği':        ['Language Support','Sprachunterstützung','Soporte de Idiomas','Support Linguistique','Suporte a Idiomas','Поддержка языков'],
  'Bellek Uyumu':       ['Memory Compatibility','Speicherkompatibilität','Compatibilidad de Memoria','Compatibilité Mémoire','Compatibilidade de Memória','Совместимость памяти'],
  'Kamera Uyumu':       ['Camera Compatibility','Kamerakompatibilität','Compatibilidad de Cámara','Compatibilité Caméra','Compatibilidade de Câmera','Совместимость камеры'],
  'Anakart Uyumluluğu': ['Motherboard Compatibility','Mainboard-Kompatibilität','Compatibilidad de Placa Base','Compatibilité Carte Mère','Compatibilidade da Placa-Mãe','Совместимость материнской платы'],
  'Harici Kamera Uyumu':['External Camera Compatibility','Externe Kamera-Kompatibilität','Compatibilidad con Cámara Externa','Compatibilité Caméra Externe','Compatibilidade com Câmera Externa','Совместимость с внешней камерой'],
  'Harici Kamera Desteği':['External Camera Support','Externe Kamera-Unterstützung','Soporte de Cámara Externa','Support Caméra Externe','Suporte para Câmera Externa','Поддержка внешней камеры'],
  'Bağlantı Uyumlulukları':['Connection Compatibility','Verbindungskompatibilität','Compatibilidad de Conexión','Compatibilité de Connexion','Compatibilidade de Conexão','Совместимость подключений'],

  // ── Smartwatch + smart-X common keys
  'One UI':             ['One UI','One UI','One UI','One UI','One UI','One UI'],
  'Türkçe':             ['Turkish','Türkisch','Turco','Turc','Turco','Турецкий'],
  'Türkçe Arayüz':      ['Turkish Interface','Türkische Benutzeroberfläche','Interfaz en Turco','Interface Turque','Interface em Turco','Турецкий интерфейс'],
  'Akıllı Saat':        ['Smartwatch','Smartwatch','Reloj Inteligente','Montre Connectée','Smartwatch','Умные часы'],
  'Akıllı Eve Dönüş':   ['Smart Home Return','Smarte Heimrückkehr','Regreso Inteligente a Casa','Retour Intelligent à Domicile','Retorno Inteligente para Casa','Умное возвращение домой'],
  'Akıllı Etkileşim (Dahili)':['Smart Interaction (Built-in)','Smarte Interaktion (integriert)','Interacción Inteligente (Integrada)','Interaction Intelligente (Intégrée)','Interação Inteligente (Integrada)','Умное взаимодействие (встроенное)'],
  'Akıllı Telefon Tutucu':['Smartphone Holder','Smartphone-Halterung','Soporte para Smartphone','Support de Smartphone','Suporte para Smartphone','Держатель смартфона'],
  'Akıllı Projeksiyon': ['Smart Projection','Smart-Projektion','Proyección Inteligente','Projection Intelligente','Projeção Inteligente','Умная проекция'],
  'Akıllı Monitör (Smart Monitor)':['Smart Monitor','Smart-Monitor','Monitor Inteligente','Moniteur Intelligent','Monitor Inteligente','Умный монитор'],
  'Akıllı Etkileşim':   ['Smart Interaction','Smarte Interaktion','Interacción Inteligente','Interaction Intelligente','Interação Inteligente','Умное взаимодействие'],
  'Akıllı Takip':       ['Smart Tracking','Smartes Tracking','Seguimiento Inteligente','Suivi Intelligent','Rastreamento Inteligente','Умное отслеживание'],

  // ── Misc common spec keys observed across categories
  'Alt Ön':             ['Front Bottom','Vorne Unten','Frontal Inferior','Avant Inférieur','Frontal Inferior','Передний Низ'],
  'Alt (Arka)':         ['Bottom (Rear)','Unten (Hinten)','Inferior (Trasero)','Inférieur (Arrière)','Inferior (Traseiro)','Нижний (Задний)'],
  'Işıklı':             ['Illuminated','Beleuchtet','Iluminado','Illuminé','Iluminado','С подсветкой'],
  'Işıklandırma':       ['Lighting','Beleuchtung','Iluminación','Éclairage','Iluminação','Подсветка'],
  'Işıklandırma Özelliği':['Lighting Feature','Beleuchtungsfunktion','Característica de Iluminación','Caractéristique d\'Éclairage','Recurso de Iluminação','Возможность подсветки'],
  'Işıklı Standart':    ['Illuminated Standard','Beleuchteter Standard','Estándar Iluminado','Standard Illuminé','Padrão Iluminado','Стандарт с подсветкой'],
  'Kapalı':             ['Closed','Geschlossen','Cerrado','Fermé','Fechado','Закрыто'],
  'Kartuş':             ['Cartridge','Patrone','Cartucho','Cartouche','Cartucho','Картридж'],
  'Çift El':            ['Two-Handed','Beidhändig','A Dos Manos','À Deux Mains','Bimanual','Двуручный'],
  'Soğutucu Tipi':      ['Cooler Type','Kühlertyp','Tipo de Refrigerador','Type de Refroidisseur','Tipo de Refrigerador','Тип Охладителя'],
  'Soğutma Şekli':      ['Cooling Method','Kühlmethode','Método de Refrigeración','Méthode de Refroidissement','Método de Refrigeração','Метод охлаждения'],
  'Soğutma Türü':       ['Cooling Type','Kühlungstyp','Tipo de Refrigeración','Type de Refroidissement','Tipo de Refrigeração','Тип охлаждения'],
  'Sıvı Soğutmalı':     ['Liquid Cooled','Flüssigkeitsgekühlt','Refrigeración Líquida','Refroidissement Liquide','Refrigeração Líquida','Жидкостное охлаждение'],
  'Pasif Soğutmalı':    ['Passive Cooling','Passive Kühlung','Refrigeración Pasiva','Refroidissement Passif','Refrigeração Passiva','Пассивное охлаждение'],
  'Pasif Soğutma Kapsamı':['Passive Cooling Coverage','Passiver Kühlbereich','Cobertura de Refrigeración Pasiva','Couverture de Refroidissement Passif','Cobertura de Refrigeração Passiva','Зона пассивного охлаждения'],
  'Tabla Plakası':      ['Build Plate','Druckplatte','Placa de Construcción','Plateau d\'Impression','Placa de Construção','Печатная платформа'],
  'Tabla Tipi':         ['Plate Type','Plattentyp','Tipo de Plataforma','Type de Plateau','Tipo de Plataforma','Тип Платформы'],
  'Isıtmalı Tabla':     ['Heated Bed','Beheiztes Bett','Cama Caliente','Plateau Chauffant','Mesa Aquecida','Подогреваемая платформа'],
  'Tabla Sıcaklığı (max.)':['Bed Temperature (max.)','Betttemperatur (max.)','Temperatura de Cama (máx.)','Température du Plateau (max.)','Temperatura da Mesa (máx.)','Температура платформы (макс.)'],
  'Taban Plakası':      ['Base Plate','Grundplatte','Placa Base','Plaque de Base','Placa Base','Базовая пластина'],
  'Çözücüler':          ['Decoders','Decoder','Decodificadores','Décodeurs','Decodificadores','Декодеры'],
  'Dar Açılı':          ['Narrow Angle','Schmaler Winkel','Ángulo Estrecho','Angle Étroit','Ângulo Estreito','Узкий угол'],
  'El Takibi':          ['Hand Tracking','Handverfolgung','Seguimiento de Manos','Suivi des Mains','Rastreamento de Mãos','Отслеживание рук'],
  'Göz Takibi':         ['Eye Tracking','Eye-Tracking','Seguimiento Ocular','Suivi Oculaire','Rastreamento Ocular','Отслеживание глаз'],
  'Yüz Takibi':         ['Face Tracking','Gesichtsverfolgung','Seguimiento Facial','Suivi du Visage','Rastreamento Facial','Отслеживание лица'],
  'Kafa Takibi':        ['Head Tracking','Kopfverfolgung','Seguimiento de Cabeza','Suivi de la Tête','Rastreamento da Cabeça','Отслеживание головы'],
  'Vücut Takibi':       ['Body Tracking','Körperverfolgung','Seguimiento Corporal','Suivi du Corps','Rastreamento Corporal','Отслеживание тела'],
  'Sağlık Takibi':      ['Health Tracking','Gesundheitsverfolgung','Seguimiento de Salud','Suivi Santé','Monitoramento de Saúde','Отслеживание здоровья'],
  'Sağlık Özellikleri': ['Health Features','Gesundheitsfunktionen','Características de Salud','Caractéristiques Santé','Recursos de Saúde','Возможности здоровья'],
  'Sağlık ve Yaşam':    ['Health and Lifestyle','Gesundheit und Lebensstil','Salud y Estilo de Vida','Santé et Style de Vie','Saúde e Estilo de Vida','Здоровье и образ жизни'],
  'Adım Sayar Mesafe Ölçümü':['Step Counter & Distance','Schrittzähler & Distanz','Contador de Pasos y Distancia','Compteur de Pas et Distance','Contador de Passos e Distância','Шагомер и расстояние'],
  'Spor Özellikleri':   ['Sport Features','Sportfunktionen','Características Deportivas','Caractéristiques Sportives','Recursos Esportivos','Спортивные возможности'],
  'Spor/Aktivite Takibi':['Sport/Activity Tracking','Sport-/Aktivitätsverfolgung','Seguimiento de Deporte/Actividad','Suivi Sport/Activité','Monitoramento Esporte/Atividade','Отслеживание спорта/активности'],
  'Antrenman Sayısı':   ['Workout Count','Anzahl der Trainings','Número de Entrenamientos','Nombre d\'Entraînements','Quantidade de Treinos','Количество тренировок'],
  'Telefon Kontrolü':   ['Phone Control','Telefonsteuerung','Control de Teléfono','Contrôle Téléphonique','Controle do Telefone','Управление телефоном'],
  'Telefon Görüşmesi':  ['Phone Call','Telefonanruf','Llamada Telefónica','Appel Téléphonique','Chamada Telefônica','Телефонный звонок'],
  'Telefon Görüşmesi Şekli':['Call Method','Anrufart','Método de Llamada','Méthode d\'Appel','Método de Chamada','Метод вызова'],
  'TV Kullanımı':       ['TV Usage','TV-Nutzung','Uso de TV','Utilisation TV','Uso de TV','Использование TV'],
  'TV Oyun Çözünürlüğü':['TV Gaming Resolution','TV-Spielauflösung','Resolución de Juegos en TV','Résolution de Jeu TV','Resolução de Jogos na TV','Игровое разрешение TV'],
  'TV Video Çözünürlüğü':['TV Video Resolution','TV-Videoauflösung','Resolución de Video en TV','Résolution Vidéo TV','Resolução de Vídeo na TV','Видео разрешение TV'],
  'TV Ağırlığı (Ayaklı)':['TV Weight (with Stand)','TV-Gewicht (mit Standfuß)','Peso de TV (con Soporte)','Poids TV (avec Pied)','Peso da TV (com Suporte)','Вес TV (с подставкой)'],
  'TV Ağırlığı (Ayaksız)':['TV Weight (without Stand)','TV-Gewicht (ohne Standfuß)','Peso de TV (sin Soporte)','Poids TV (sans Pied)','Peso da TV (sem Suporte)','Вес TV (без подставки)'],
  'TV Derinliği (Ayaklı)':['TV Depth (with Stand)','TV-Tiefe (mit Standfuß)','Profundidad de TV (con Soporte)','Profondeur TV (avec Pied)','Profundidade da TV (com Suporte)','Глубина TV (с подставкой)'],
  'TV Derinliği (Ayaksız)':['TV Depth (without Stand)','TV-Tiefe (ohne Standfuß)','Profundidad de TV (sin Soporte)','Profondeur TV (sans Pied)','Profundidade da TV (sem Suporte)','Глубина TV (без подставки)'],
  'TV Genişliği (Ayaklı)':['TV Width (with Stand)','TV-Breite (mit Standfuß)','Ancho de TV (con Soporte)','Largeur TV (avec Pied)','Largura da TV (com Suporte)','Ширина TV (с подставкой)'],
  'TV Genişliği (Ayaksız)':['TV Width (without Stand)','TV-Breite (ohne Standfuß)','Ancho de TV (sin Soporte)','Largeur TV (sans Pied)','Largura da TV (sem Suporte)','Ширина TV (без подставки)'],
  'TV Yüksekliği (Ayaklı)':['TV Height (with Stand)','TV-Höhe (mit Standfuß)','Altura de TV (con Soporte)','Hauteur TV (avec Pied)','Altura da TV (com Suporte)','Высота TV (с подставкой)'],
  'TV Yüksekliği (Ayaksız)':['TV Height (without Stand)','TV-Höhe (ohne Standfuß)','Altura de TV (sin Soporte)','Hauteur TV (sans Pied)','Altura da TV (sem Suporte)','Высота TV (без подставки)'],

  // (LONG TAIL — keep adding as we discover; for everything we don't yet
  // know, the script writes _unmatched_atoms.json and we keep extending.)
};

Object.assign(MANUAL, loadTranslationBatches());

// Many similar spec keys come in pairs / triples — let me also encode them as
// patterns programmatically rather than typing every variant by hand.
const KEY_PATTERNS = [
  // "X Tipi" / "X Türü" / "X Tipi" forms → "X Type"
  { re: /^(.+?)\s+T(?:ipi|ürü)$/i, build: ($1) => {
    const base = lookupBase($1);
    if (!base) return null;
    return [
      `${base[0]} Type`,
      `${base[1]} Typ`,
      `Tipo de ${base[2]}`,
      `Type de ${base[3]}`,
      `Tipo de ${base[4]}`,
      `Тип ${base[5]}`,
    ];
  }},
  // "X Sayısı" → "X Count"
  { re: /^(.+?)\s+Sayısı$/i, build: ($1) => {
    const base = lookupBase($1);
    if (!base) return null;
    return [
      `${base[0]} Count`,
      `Anzahl ${base[1]}`,
      `Número de ${base[2]}`,
      `Nombre de ${base[3]}`,
      `Quantidade de ${base[4]}`,
      `Количество ${base[5]}`,
    ];
  }},
  // "X Özellikleri" → "X Features"
  { re: /^(.+?)\s+Özellikleri$/i, build: ($1) => {
    const base = lookupBase($1);
    if (!base) return null;
    return [
      `${base[0]} Features`,
      `${base[1]}-Funktionen`,
      `Características de ${base[2]}`,
      `Caractéristiques de ${base[3]}`,
      `Características de ${base[4]}`,
      `Возможности ${base[5]}`,
    ];
  }},
  // "X Sürümü" / "X Versiyonu" → "X Version"
  { re: /^(.+?)\s+(?:Sürümü|Versiyonu)$/i, build: ($1) => {
    const base = lookupBase($1);
    if (!base) return null;
    return [
      `${base[0]} Version`,
      `${base[1]}-Version`,
      `Versión de ${base[2]}`,
      `Version ${base[3]}`,
      `Versão ${base[4]}`,
      `Версия ${base[5]}`,
    ];
  }},
  // "X Desteği" → "X Support"
  { re: /^(.+?)\s+Desteği$/i, build: ($1) => {
    const base = lookupBase($1);
    if (!base) return null;
    return [
      `${base[0]} Support`,
      `${base[1]}-Unterstützung`,
      `Compatibilidad con ${base[2]}`,
      `Support ${base[3]}`,
      `Suporte ${base[4]}`,
      `Поддержка ${base[5]}`,
    ];
  }},
];

// Common single-word translation lookup used by KEY_PATTERNS.
const BASE_WORDS = {
  'bağlantı':           ['Connection','Verbindung','Conexión','de Connexion','de Conexão','подключения'],
  'bellek':             ['Memory','Speicher','Memoria','Mémoire','Memória','памяти'],
  'çıkış':              ['Output','Ausgang','Salida','de Sortie','de Saída','выхода'],
  'fan':                ['Fan','Lüfter','Ventilador','de Ventilateur','de Ventilador','вентилятора'],
  'giriş':              ['Input','Eingang','Entrada','d\'Entrée','de Entrada','входа'],
  'kablo':              ['Cable','Kabel','Cable','de Câble','de Cabo','кабеля'],
  'kamera':             ['Camera','Kamera','Cámara','de Caméra','de Câmera','камеры'],
  'kasa':               ['Case','Gehäuse','Caja','de Boîtier','de Gabinete','корпуса'],
  'kayıt':              ['Recording','Aufnahme','Grabación','d\'Enregistrement','de Gravação','записи'],
  'lens':               ['Lens','Objektiv','Lente','d\'Objectif','de Lente','объектива'],
  'pil':                ['Battery','Akku','Batería','de Batterie','de Bateria','аккумулятора'],
  'şarj':               ['Charging','Lade','de Carga','de Charge','de Carregamento','зарядки'],
  'soğutma':            ['Cooling','Kühlungs','de Refrigeración','de Refroidissement','de Refrigeração','охлаждения'],
  'tarama':             ['Scan','Scan','de Escaneo','de Numérisation','de Digitalização','сканирования'],
  'usb':                ['USB','USB','USB','USB','USB','USB'],
  'wi-fi':              ['Wi-Fi','WLAN','Wi-Fi','Wi-Fi','Wi-Fi','Wi-Fi'],
  'modüler':            ['Modular','Modular','Modular','Modulaire','Modular','модульный'],
  'modüler olmayan':    ['Non-Modular','Nicht-Modular','No Modular','Non Modulaire','Não Modular','Немодульный'],
};

function lookupBase(token) {
  return BASE_WORDS[token.toLowerCase().trim()];
}

// Numeric + unit patterns. The script auto-translates these so we don't
// type every single "N inç" / "N adet" by hand.
const UNIT_PATTERNS = [
  { re: /^(\d+(?:[.,]\d+)?)\s*inç$/i, build: (n) => makeUnit(n, 'inch','Zoll','pulgadas','pouces','polegadas','дюймов') },
  { re: /^(\d+(?:[.,]\d+)?)\s*İnç$/, build: (n) => makeUnit(n, 'inch','Zoll','pulgadas','pouces','polegadas','дюймов') },
  { re: /^(\d+)\s*[Aa]det$/, build: (n) => [n, n, n, n, n, n] },          // "5 Adet" → just "5"
  { re: /^(\d+)\s+gün$/i, build: (n) => makeUnit(n, 'days','Tage','días','jours','dias','дней') },
  { re: /^(\d+(?:[.,]\d+)?)\s+saat$/i, build: (n) => makeUnit(n, 'hours','Stunden','horas','heures','horas','часов') },
  { re: /^(\d+(?:[.,]\d+)?)\s+Saat$/, build: (n) => makeUnit(n, 'hours','Stunden','horas','heures','horas','часов') },
  { re: /^(\d+(?:[.,]\d+)?)\s+(?:Çekirdek(?:li)?|cekirdek(?:li)?)$/i, build: (n) => makeUnit(n, 'cores','Kerne','núcleos','cœurs','núcleos','ядер') },
  { re: /^(\d+)\s+fan$/i, build: (n) => makeUnit(n, 'fans','Lüfter','ventiladores','ventilateurs','ventiladores','вентиляторов') },
  { re: /^(\d+)\s+fanlı$/i, build: (n) => [`${n}-Fan`, `${n}-Lüfter`, `${n} Ventiladores`, `${n} Ventilateurs`, `${n} Ventiladores`, `${n}-вентиляторный`] },
  { re: /^(\d+)\s+Hücreli$/i, build: (n) => [`${n}-Cell`, `${n}-Zellen`, `${n} Celdas`, `${n} Cellules`, `${n} Células`, `${n}-секционный`] },
  { re: /^(\d+)\s+Lümen$/i, build: (n) => makeUnit(n, 'lumens','Lumen','lúmenes','lumens','lúmens','люмен') },
  { re: /^(\d+)\s+Dakika$/i, build: (n) => makeUnit(n, 'minutes','Minuten','minutos','minutes','minutos','минут') },
  { re: /^(\d+)\s+Döngü$/i, build: (n) => makeUnit(n, 'cycles','Zyklen','ciclos','cycles','ciclos','циклов') },
  { re: /^(\d+)\s+birim$/i, build: (n) => makeUnit(n, 'units','Einheiten','unidades','unités','unidades','единиц') },
  { re: /^(\d+)\s+sayfa$/i, build: (n) => makeUnit(n, 'pages','Seiten','páginas','pages','páginas','страниц') },
  { re: /^(\d+)\s+mikrofonlu$/i, build: (n) => [`${n}-Microphone`, `${n}-Mikrofon`, `${n} Micrófonos`, `${n} Microphones`, `${n} Microfones`, `${n}-микрофонный`] },
  // "12.Nesil", "2. Nesil"  → "12th Gen" / "2nd Gen"
  { re: /^(\d+)\.?\s*Nesil$/i, build: (n) => [`${n}th Gen`, `${n}. Generation`, `${n}.ª Generación`, `${n}e Génération`, `${n}ª Geração`, `${n}-го поколения`] },
  // "X. Çıkış Akımı" etc. — passthrough numbers + translate suffix
  { re: /^(\d+)\.\s+Çıkış Adedi$/i, build: (n) => [`Output ${n} Count`,`Ausgang ${n} Anzahl`,`Salida ${n} Cantidad`,`Sortie ${n} Nombre`,`Saída ${n} Quantidade`,`Выход ${n} количество`] },
  { re: /^(\d+)\.\s+Çıkış Akımı$/i, build: (n) => [`Output ${n} Current`,`Ausgangsstrom ${n}`,`Corriente de Salida ${n}`,`Courant de Sortie ${n}`,`Corrente de Saída ${n}`,`Ток выхода ${n}`] },
  { re: /^(\d+)\.\s+Çıkış Gerilimi$/i, build: (n) => [`Output ${n} Voltage`,`Ausgangsspannung ${n}`,`Voltaje de Salida ${n}`,`Tension de Sortie ${n}`,`Tensão de Saída ${n}`,`Напряжение выхода ${n}`] },
  { re: /^(\d+)\.\s+Çıkış Gücü$/i, build: (n) => [`Output ${n} Power`,`Ausgangsleistung ${n}`,`Potencia de Salida ${n}`,`Puissance de Sortie ${n}`,`Potência de Saída ${n}`,`Мощность выхода ${n}`] },
  { re: /^(\d+)\.\s+Çıkış Kablosu$/i, build: (n) => [`Output ${n} Cable`,`Ausgangskabel ${n}`,`Cable de Salida ${n}`,`Câble de Sortie ${n}`,`Cabo de Saída ${n}`,`Кабель выхода ${n}`] },
  { re: /^(\d+)\.\s+Çıkış Bağlantı Tipi$/i, build: (n) => [`Output ${n} Connector Type`,`Anschlusstyp Ausgang ${n}`,`Tipo de Conector de Salida ${n}`,`Type de Connecteur Sortie ${n}`,`Tipo de Conector de Saída ${n}`,`Тип разъема выхода ${n}`] },
  { re: /^(\d+)\.\s+Yardımcı İşlemci$/i, build: (n) => [`Co-Processor ${n}`,`Co-Prozessor ${n}`,`Coprocesador ${n}`,`Co-Processeur ${n}`,`Coprocessador ${n}`,`Сопроцессор ${n}`] },
  // "X. Çeyrek" - quarters
  { re: /^(20\d{2})\s*(\d)\.\s*Çeyrek$/i, build: (a, b) => [`${a} Q${b}`, `${a} Q${b}`, `${a} T${b}`, `${a} T${b}`, `${a} T${b}`, `${a} ${b}кв`] },
  { re: /^(\d)\.\s*Çeyrek$/i, build: (n) => [`Q${n}`, `Q${n}`, `T${n}`, `T${n}`, `T${n}`, `${n}-й квартал`] },
];

function makeUnit(n, ...labels) {
  return labels.map(l => `${n} ${l}`);
}

function toAll(en) {
  return [en, en, en, en, en, en];
}

Object.assign(MANUAL, Object.fromEntries(Object.entries({
  'Bluetooth Kulaklık ile Eşleşme': 'Bluetooth Headphone Pairing',
  'Bluetooth Kulaklık Eşleşme': 'Bluetooth Headphone Pairing',
  'Bas Konuş (Walkie-Talkie)': 'Walkie-Talkie',
  'El Hareketleri ile Cihaz Kontrolü': 'Gesture Device Control',
  'Gelgit Grafiği': 'Tide Charts',
  'Güç Tasarruf Modu': 'Power Saving Mode',
  'İnternet Radyo': 'Internet Radio',
  'Rahatsız Etmeyin Modu': 'Do Not Disturb Mode',
  'Ses ile Komut Verme': 'Voice Command',
  'Ses Kaydı': 'Audio Recording',
  'Sesli Çeviri': 'Voice Translation',
  'Sesli Mesaj': 'Voice Message',
  'Sesli Not (Voice Memo)': 'Voice Memo',
  'SMS Gönderme': 'SMS Sending',
  'Sesli Uyarı': 'Voice Alert',
  'Akıllı Sesli Asistan': 'Smart Voice Assistant',
  'Telefonumu Bul': 'Find My Phone',
  'Hesap Makinesi': 'Calculator',
  'Dahili Medya Oynatıcı': 'Internal Media Player',
  'Navigasyon (Harita)': 'Navigation (Map)',
  'Dünya Saatleri': 'World Clock',
  'Gelen Aramaları Yönetme': 'Incoming Calls Management',
  'Müzik Depolama': 'Music Storage',
  'Arama Geçmişi': 'Call History',
  'Kamera Kumandası': 'Camera Control',
  'Akıllı Bildirimler': 'Smart Notifications',
  'Hatırlatıcılar': 'Reminders',
  'Zamanlayıcı': 'Timer',
  'Takvim': 'Calendar',
  'Ekolayzır Modu': 'Equalizer Mode',
  'Ortam Sesi Modu': 'Ambient Sound Mode',
  'Google Fast Pair': 'Google Fast Pair',
  'Tek ve Çift Kullanabilme': 'Single and Dual Use',
  'Şarj Kutusu Süresi (Genel)': 'Charging Case Runtime (General)',
  'Şarj Kutusu Süresi (Yoğun)': 'Charging Case Runtime (Heavy Use)',
  'Şarj Kutusu': 'Charging Case',
  'Tam Kablosuz': 'True Wireless',
}).map(([k, v]) => [k, toAll(v)])));

function ordinal(n) {
  const s = String(n);
  const v = Number(s);
  const mod100 = v % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${s}th`;
  switch (v % 10) {
    case 1: return `${s}st`;
    case 2: return `${s}nd`;
    case 3: return `${s}rd`;
    default: return `${s}th`;
  }
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replacementRegex(from) {
  if (/^[\p{L}\s]+$/u.test(from)) {
    return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(from)}(?![\\p{L}\\p{N}])`, 'gu');
  }
  return new RegExp(escapeRegExp(from), 'g');
}

const TURKISH_RESIDUE_WORDS = new Set([
  'acik','adedi','adet','agarlik','agirlik','akilli','akim','akisi','akisi','akustik','alici','alt','alti',
  'ana','anlik','anten','arabirim','arac','arka','aralik','artirilabilir','artirma','asagi','asgari','asili',
  'asiri','askisi','atlama','ayagi','ayak','ayari','ayarli','ayarlanabilir','aynasiz','azami','baglanti',
  'baglantisi','bagli','bakir','bas','baslik','batarya','baski','bellek','bicimi','bilgisayar','bildirim',
  'birimi','birim','birlesik','bosaltma','boyutu','bolgeli','bulut','buyutme','cagri','cam','cekim','cekirdek',
  'cekirdegi','cerceve','cevresel','cift','cikis','cozucu','cozuculer','cozunurluk','dayanikli','dayaniklilik',
  'degisir','degistirilebilir','deniz','depolama','derin','derinlik','destek','destegi','destekli','desteklenen',
  'devre','dis','dokunmatik','dolum','donanım','donanim','donebilme','dondurme','donme','donus','dort','dugme',
  'dugmesi','dusuk','dusme','duvar','duz','ekran','ekstra','el','eleman','engelleme','engelleyici','engel',
  'engelden','enerji','enis','en','es','esitleme','esleştirme','eslestirme','ev','fazla','frekansi','frekans',
  'gelen','gelismis','genis','genisletilebilir','genislik','gercek','gerceklik','geri','girisi','giris','goz',
  'gozluk','goruntu','goruntulu','govde','guc','gucu','gunde','gunluk','gunes','guvenlik','halı','hali','harici',
  'harita','haritalama','hareket','hata','hatirlatma','hava','havada','hiz','hizi','hizlandirici','hizli',
  'hoparlor','hucreli','ic','ici','icinde','iki','ikinci','ile','iletisim','ince','inis','is','isi','isik',
  'isigi','islem','islemci','islemcisi','istasyon','izleme','kablosu','kablosuz','kafa','kalibrasyonu','kalinlik',
  'kalp','kamera','kamerasi','kanal','kapak','kapasite','kapasitesi','kaplamali','kapladigi','kapali','kapsam',
  'kapsami','kapsama','karanlik','karasal','kare','kart','kartı','karti','kasa','kasasi','katmanli','kayak',
  'kaydi','kayit','kayitli','kazan','kendi','kenar','kesinti','kilidi','kilit','kilitli','kisa','kisisel',
  'kisisellestirilebilir','kolay','komut','kontrol','kontrolu','koruma','korumasi','kordon','konusma','kullanabilme',
  'kullanici','kullanım','kullanim','kılavuzu','kilavuzu','kisa','kizilotesi','kirli','kristal','kulaklik',
  'kumanda','kurma','kutusu','kutu','lazer','magnezyum','maksimum','malzeme','malzemesi','mat','mavi','mesafe',
  'mesafesi','microfon','mikrofon','mikrofonu','modu','modunda','moduler','montaj','mop','motoru','murekkep',
  'nesil','nesli','nokta','oda','odak','odaklama','oksijen','olcegi','olcer','olcumu','olcusu','olmayan','onarilabilirlik',
  'on','onbellek','one','onerilen','onleyen','optik','oran','orani','ortam','ortalama','otomatik','oyun','oyuncu',
  'ozel','ozellik','ozelligi','ozellikleri','paket','parcacigi','parlaklik','paspas','pil','piksel','plastik',
  'pompa','portre','pusula','renk','rengi','resim','rota','rulmanli','saat','saatte','saatlik','sabit','sag',
  'saglik','sanal','saniyede','sayaci','sayar','sayisi','ses','sesli','seviyesi','seviye','secenegi','sert',
  'sicakligi','sicaklik','sifir','sim','sinifi','sinyal','sistemi','sogutma','sogutucu','sol','sonrasi','spor',
  'standli','standart','standardi','su','subwoofer','super','supurge','surucu','surumu','sure','suresi','surdurulebilir',
  'takibi','takip','tam','tarafli','tarayici','tasima','tasarim','tazeleme','telefon','temiz','temizleme','tepki','titreşim',
  'titresim','titresimi','toz','toza','tukecim','tuketim','turkce','turkçe','turleri','turu','tipi','tuslari','tusu',
  'uc','ucuncu','uyarlanabilir','uyarlama','uydu','uygulama','uygulamalari','uyum','uyumlu','uyumu','uzaktan',
  'uzerinden','ust','ustune','uretim','uretici','urun','var','ve','verisi','video','voltaj','volt','vucut','yakalastirma',
  'yaka','yakınlık','yakinlik','yakınlastirma','yakinlastirma','yan','yansitma','yansimasiz','yapay','yardimcisi',
  'yasam','yataya','yatay','yavas','yazici','yazilim','yazi','yeniden','yenileme','yer','yesil','yogun','yonetim',
  'yonlu','yukleme','yuksek','yukseklik','yukseltme','yuruyus','yuz','yuzey','zaman','zamanlayici','zeka',
]);
const EN_ALLOWED_RESIDUE_TOKENS = new Set([
  'ampere', 'monitor', 'mop', 'on', 'one', 'sim', 'subwoofer', 'super', 'video', 'volt',
]);

function foldedTurkish(s) {
  return String(s || '').toLowerCase()
    .replace(/ı/g, 'i').replace(/İ/g, 'i')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ö/g, 'o')
    .replace(/ş/g, 's').replace(/ü/g, 'u');
}

function hasTurkishResidue(s) {
  const cleaned = String(s || '').replace(/TÜV/gi, 'TUV');
  if (/[çğıİöşüÇĞİÖŞÜ]/.test(cleaned)) return true;
  const tokens = foldedTurkish(cleaned).match(/[a-z]+/g) || [];
  return tokens.some(t => TURKISH_RESIDUE_WORDS.has(t) && !EN_ALLOWED_RESIDUE_TOKENS.has(t));
}

const EN_REPLACEMENTS = [
  ['Ekstra Geniş Açı Ekstra Geniş Açı (120°) OmniVision OV50D Sensör 1/2.88 6 Elementli Lens 14mm', 'Ultra-Wide Angle, Ultra-Wide Angle (120°), OmniVision OV50D Sensor, 1/2.88 Sensor Size, 6-Element Lens, 14mm'],
  ['Aktif Yatak Eğimi Kalibrasyonu Filament Dolaşma Algılama Hava Temizleyici Otomatik Filament Rölesi', 'Active Bed Leveling Calibration, Filament Tangle Detection, Air Purifier, Automatic Filament Relay'],
  ['%100 DCI-P3 Dolby Vision HDR MUX Switch NVIDIA Advanced Optimus Pantone Sertifikalı ROG Nebula Ekran', '100% DCI-P3, Dolby Vision, HDR, MUX Switch, NVIDIA Advanced Optimus, Pantone Certified, ROG Nebula Display'],
  ['Ekstra Geniş Açı Otomatik Odaklama Samsung ISOCELL JN1 Sensör Zeiss Tessar T* Kaplama 1/2.76 Sensör Boyutu 15mm', 'Ultra-Wide Angle, Autofocus, Samsung ISOCELL JN1 Sensor, Zeiss Tessar T* Coating, 1/2.76 Sensor Size, 15mm'],
  ['%100 DCI-P3 3 ms Tepki Süresi Dolby Vision HDR MUX Switch NVIDIA Advanced Optimus Pantone Sertifikalı ROG Nebula Ekran', '100% DCI-P3, 3 ms Response Time, Dolby Vision, HDR, MUX Switch, NVIDIA Advanced Optimus, Pantone Certified, ROG Nebula Display'],
  ['SMART Desteği TRIM Desteği 256-Bit Veri Şifreleme GC (Garbage Collection) Uyku Modu Desteği IEEE1667 NVMe 2.0 TCG Opal', 'SMART Support, TRIM Support, 256-bit Data Encryption, GC (Garbage Collection), Sleep Mode Support, IEEE1667, NVMe 2.0, TCG Opal'],
  ['Ayarlanabilir Kafa Bandı Kafa Bandı Yastığı Dönebilen Kulaklıklar Derin Bas Hafızalı Kulak Yastığı Tekstil Kulak Yastığı', 'Adjustable Headband, Headband Cushion, Rotating Earcups, Deep Bass, Memory Foam Ear Cushions, Fabric Ear Cushions'],
  ['Mikrofon Android 11.0 Arka Kamera (16 MP) BOOX Store (Kitap Mağazası) Dahili Hoparlör Işık Sensörü LED Flash Yerçekimi Sensörü', 'Microphone, Android 11.0, Rear Camera (16 MP), BOOX Store (Book Store), Built-in Speaker, Light Sensor, LED Flash, Gravity Sensor'],
  ['0dB Çift BIOS Vapor Chamber Jel İletken Termal Takviyesi Kayar Yan Plaka Gigabyte Hawk Fan Gigabyte RGB Halo Gigabyte WindForce', '0dB, Dual BIOS, Vapor Chamber, Gelid Thermal Enhancement, Sliding Side Plate, Gigabyte Hawk Fan, Gigabyte RGB Halo, Gigabyte WindForce'],
  ['Ekolayzır Modu Derin Bas Atmosfer Basıncı Optimizasyonu Duraklatma Sensörü Hızlı Otomatik Cihaz Geçişi Kafa Takibi Kulaklığımı Bul', 'Equalizer Mode, Deep Bass, Atmospheric Pressure Optimization, Pause Sensor, Fast Automatic Device Switching, Head Tracking, Find My Earbuds'],
  ['AURA SYNC (Aydınlatma) Dolby Atmos Ses Güvenilir Platform Modülü (TPM) Hi-Res Sertifikası (Kulaklık İçin) Smart Amp (Amplifikatör) 4 Adet Hoparlör', 'AURA SYNC Lighting, Dolby Atmos Audio, Trusted Platform Module (TPM), Hi-Res Certification (for Headphones), Smart Amp, 4 Speakers'],
  ['Koşu Bisiklet Yürüyüş Tırmanış Yüzme Yoga Kürek Çekme Yüzme (Havuz) Merdiven Tırmanma Yüzme (Deniz) İp Atlama Sörf Kürek Sörfü Yelkencilik Rafting', 'Running, Cycling, Walking, Climbing, Swimming, Yoga, Rowing, Swimming (Pool), Stair Climbing, Swimming (Open Water), Jump Rope, Surfing, Paddle Surfing, Sailing, Rafting'],
  ['Ekran Koruma Filmi (Telefona Uygulanmış) Şeffaf Arka Kapak Kılıfı SIM Çıkartma İğnesi USB Kablosu (Type-C\'den Type-C\'ye) USB Type-C Güç Adaptörü (80W)', 'Screen Protector Film (Pre-Applied to Phone), Transparent Back Cover Case, SIM Eject Pin, USB Cable (Type-C to Type-C), USB Type-C Power Adapter (80W)'],
  ['Otomatik Odaklama Portre Modu HDR Sanal Flaş Gesture Shot Zamanlayıcı (self-timer) Dijital görüntü sabitleyici (EIS) Samsung ISOCELL JN1 Sensör 92° Açılı', 'Autofocus, Portrait Mode, HDR, Virtual Flash, Gesture Shot, Self-Timer, Digital Image Stabilization (EIS), Samsung ISOCELL JN1 Sensor, 92° Angle'],
  ['Wi-Fi 5 AirPlay Ekran Yansıtma LG ThinQ Netflix Prime Video USB Video/Ses/Fotoğraf Oynatma webOS 24 webOS İşletim Sistemi YouTube 5 Yıl Yazılım Güncelleme Desteği', 'Wi-Fi 5, AirPlay, Screen Mirroring, LG ThinQ, Netflix, Prime Video, USB Video/Audio/Photo Playback, webOS 24, webOS Operating System, YouTube, 5-Year Software Update Support'],
  ['Acil Kayıt Çarpışma Önleme Uyarısı Yorgun Sürücü Uyarısı Android Desteği iOS Desteği Bluetooth Ön Araç Hareket Uyarısı Sesli Kontrol SR 2.0 Sürüş Efekti Uygulaması Yaya Uyarısı', 'Emergency Recording, Collision Prevention Warning, Driver Fatigue Warning, Android Support, iOS Support, Bluetooth, Front Vehicle Movement Warning, Voice Control, SR 2.0 Driving Effect App, Pedestrian Warning'],
  ['0dB Çift Rulmanlı Fan Çift BIOS Vapor Chamber Metal Ön Plaka Asus Aura Sync Asus Auto-Extreme Asus Axial Fan (Eksen) Asus MaxContact Asus MuseTree TUF Gaming Alliance Sertifikası', '0dB, Dual-Bearing Fan, Dual BIOS, Vapor Chamber, Metal Front Plate, Asus Aura Sync, Asus Auto-Extreme, Asus Axial Fan, Asus MaxContact, Asus MuseTree, TUF Gaming Alliance Certification'],
  ['Alttan Atımlı Subwoofer Powerbank Taşıma Askısı/Kulpu Dahili Çift Mikrofon Dahili Subwoofer Derin Bas Dokunmatik Kontrol Hoparlör Eşleştirme Otomatik Ses Kalibrasyonu Red Dot Tasarım Ödülü Sürdürülebilir Ürün', 'Down-Firing Subwoofer, Powerbank, Carry Strap/Handle, Built-in Dual Microphones, Built-in Subwoofer, Deep Bass, Touch Control, Speaker Pairing, Automatic Audio Calibration, Red Dot Design Award, Sustainable Product'],
  ['Periscope Zoom Telephoto Optik Görüntü Sabitleyici (OIS) Hibrit Zoom (10x) Optik Zoom (5x) Samsung ISOCELL JN5 Sensör Telefoto Makro (30cm) 0.64μm Piksel Boyutu 1/2.74" Sensör Boyutu 4 Elementli Lens 21° Açılı 115mm', 'Periscope Zoom Telephoto, Optical Image Stabilization (OIS), Hybrid Zoom (10x), Optical Zoom (5x), Samsung ISOCELL JN5 Sensor, Telephoto Macro (30cm), 0.64μm Pixel Size, 1/2.74" Sensor Size, 4-Element Lens, 21° Angle, 115mm'],
  ['DHCP Desteği IPv6 IGMP Desteği NAT Desteği DMZ Multi WAN Airtime Fairness Çoklu Bağlantı Çalışması (MLO) Yapay Zekalı Dolaşım Adaptive QoS Asus AiProtection Pro OpenNAT Oyun Hızlandırıcı TUF Gaming Alliance Sertifikası', 'DHCP Support, IPv6, IGMP Support, NAT Support, DMZ, Multi-WAN, Airtime Fairness, Multi-Link Operation (MLO), AI Roaming, Adaptive QoS, Asus AiProtection Pro, OpenNAT, Game Accelerator, TUF Gaming Alliance Certification'],
  ['Nabız (Kalp Atış Hızı) Monitörü Kalori Takibi Uyku Monitörü Kandaki Oksijen Seviyesi (SpO2) Monitörü Kadın Sağlığı Takipçisi Stres Seviyesi Gösterimi Düzensiz Ritim Bildirimi HRV Durumu Sağlık Tavsiyesi Solunum Monitörü', 'Heart Rate Monitor, Calorie Tracking, Sleep Monitor, Blood Oxygen Level (SpO2) Monitor, Women\'s Health Tracker, Stress Level Display, Irregular Rhythm Notification, HRV Status, Health Advice, Breathing Monitor'],
  ['Adımsayar Mesafe Ölçer Aktivite Takibi ve Geçmişi Hava Durumu Kronometre Çoklu Spor Modu Akıllı Spor Modu Akıllı Koç Çevrimdışı Rota (Parkur) Takibi Ekranda Egzersiz Animasyonları Hız Ölçer Rota (Parkur) Takibi Suda Rota Takibi', 'Step Counter, Distance Meter, Activity Tracking and History, Weather, Stopwatch, Multi-Sport Mode, Smart Sport Mode, Smart Coach, Offline Route Tracking, On-Screen Exercise Animations, Speedometer, Route Tracking, Water Route Tracking'],
  ['Koşu Bisiklet Yürüyüş Tırmanış Yüzme Eliptik Bisiklet Fitness Yoga Kürek Çekme Tenis Basketbol Futbol Yüzme (Havuz) Kayak Kardiyo Yüzme (Deniz) İp Atlama Dayanıklılık/Güç Kürek Sörfü Kuvvet Egzersizleri HIIT Dövüş Sporları Yelkencilik', 'Running, Cycling, Walking, Climbing, Swimming, Elliptical, Fitness, Yoga, Rowing, Tennis, Basketball, Football, Swimming (Pool), Skiing, Cardio, Swimming (Open Water), Jump Rope, Endurance/Strength, Paddle Surfing, Strength Training, HIIT, Combat Sports, Sailing'],
  ['Portre Modu (Bokeh) Phase Detect Auto-Focus (PDAF) Yapay Zeka (AI) Destekli Portre Modu HDR Yapay Zeka (AI) Sahne Algılama Perde Hızı (Shutter Speed) Kontrolü Panorama Otomatik Odaklama OmniVision OV50E Sensör Zamanlayıcı 7 Elementli Lens', 'Portrait Mode (Bokeh), Phase Detect Auto-Focus (PDAF), AI-Assisted Portrait Mode, HDR, AI Scene Detection, Shutter Speed Control, Panorama, Autofocus, OmniVision OV50E Sensor, Timer, 7-Element Lens'],
  ['Portre Modu (Bokeh) Phase Detect Auto-Focus (PDAF) Flicker Sensör Yapay Zeka (AI) Destekli Portre Modu HDR Lazer Otomatik Odaklama (Laser Auto Focus-LDAF) RAW Kayıt Yapabilme Fiziki Denklanşör Tuşu Otomatik Odaklama Makro (Macro) Çekim (5 cm) Zamanlayıcı', 'Portrait Mode (Bokeh), Phase Detect Auto-Focus (PDAF), Flicker Sensor, AI-Assisted Portrait Mode, HDR, Laser Autofocus (LDAF), RAW Recording, Physical Shutter Button, Autofocus, Macro Shooting (5 cm), Timer'],
  ['HDR Çentiksiz Tam Ekran Tasarım Multi Touch DCI-P3 Renk Uzayı Islak Parmak Algılama Çerçevesiz Tasarım Sürekli Açık Ekran (Always-on Display) DCI-P3 100% Ekran Altında Ön Kamera 10bit Renk Derinliği 2000 cd/m² (nit) Parlaklık (Maks.) 2592Hz PWM Dimming 3000 Hz Instant Touch Sampling Rate', 'HDR, Notchless Full-Screen Design, Multi-Touch, DCI-P3 Color Space, Wet Finger Detection, Borderless Design, Always-On Display, 100% DCI-P3, Under-Display Front Camera, 10-bit Color Depth, 2000 cd/m² (nit) Brightness (Max.), 2592Hz PWM Dimming, 3000 Hz Instant Touch Sampling Rate'],
  ['Dahili Likit Soğutma Sistemi Gürültü Önleyici 3 Mikrofon Hava Soğutma (Centrifugal Fan) Kapasitif Kısayol Oyun Tuşları Karanlık Mod (Dark Mode) Kısayol Tuşu (Kişiselleştirilebilir) LED Arka Aydınlatma RGB LED Arka Aydınlatma Sanal RAM Artırma (12GB) Vapor-Chamber Soğutma Yüz Tanımlama', 'Built-in Liquid Cooling System, Noise-Canceling 3 Microphones, Air Cooling (Centrifugal Fan), Capacitive Shortcut Gaming Keys, Dark Mode, Customizable Shortcut Key, LED Backlight, RGB LED Backlight, Virtual RAM Expansion (12GB), Vapor Chamber Cooling, Face Recognition'],
  ['İşlemci Frekansı (OC)', 'Processor Frequency (OC)'],
  ['Y/Z İşleme Gücü', 'AI Processing Power'],
  ['1.0GHz İşlemci', '1.0GHz Processor'],
  // Safe common fragments. These are intentionally high in the list so long
  // feature strings can compose into clean English instead of half-TR output.
  ['Görüntü Aynalama', 'Screen Mirroring'],
  ['Ekran Yansıtma', 'Screen Mirroring'],
  ['Sesli Uzaktan Kumanda', 'Voice Remote'],
  ['Sesli Komut Desteği', 'Voice Command Support'],
  ['Sesli Komut', 'Voice Command'],
  ['Yapay Zeka Çözünürlük Yükseltme', 'AI Resolution Upscaling'],
  ['Yapay Zeka Resim Kalitesi Arttırma', 'AI Picture Quality Enhancement'],
  ['Resim İçinde Resim', 'Picture-in-Picture'],
  ['Resim Yanında Resim', 'Picture-by-Picture'],
  ['Resim/Müzik/Video', 'Picture/Music/Video'],
  ['USB ile Resim/Müzik/Video Oynatma', 'USB Picture/Music/Video Playback'],
  ['Çoklu Bağlantı Çalışması', 'Multi-Link Operation'],
  ['Çoklu Kaynak Birimleri', 'Multi-Resource Units'],
  ['Akıllı Ev', 'Smart Home'],
  ['Akıllı Telefon', 'Smartphone'],
  ['Akıllı Saat', 'Smartwatch'],
  ['Akıllı Kumanda', 'Smart Remote'],
  ['Akıllı Güç Çıkışı', 'Smart Power Output'],
  ['Akıllı Spor Modu', 'Smart Sport Mode'],
  ['Akıllı Koç', 'Smart Coach'],
  ['Güvenli Bölge', 'Safe Zone'],
  ['Güvenli Rehber', 'Safe Contacts'],
  ['Ebeveyn Kontrolü', 'Parental Control'],
  ['Şerit İhlal Uyarısı', 'Lane Departure Warning'],
  ['Çarpışma Önleme Uyarısı', 'Collision Prevention Warning'],
  ['Yaya Uyarısı', 'Pedestrian Warning'],
  ['Yorgun Sürücü Uyarısı', 'Driver Fatigue Warning'],
  ['Otomatik Kayıt Başlatma', 'Automatic Recording Start'],
  ['HDR Kayıt', 'HDR Recording'],
  ['Hızlı Çekim', 'Fast Recording'],
  ['Gece Görüşü', 'Night Vision'],
  ['Gündüz/Gece', 'Day/Night'],
  ['İç Mekan (Ev)', 'Indoor (Home)'],
  ['Çoklu Online Erişim', 'Multiple Online Access'],
  ['Duvara Monte Edilebilir', 'Wall Mountable'],
  ['Hareket Takibi', 'Motion Tracking'],
  ['Renkli Gece Görüşü', 'Color Night Vision'],
  ['Gizlilik Modu', 'Privacy Mode'],
  ['İnsan Algılama', 'Human Detection'],
  ['Ses Modları (DSP)', 'Sound Modes (DSP)'],
  ['Çevresel Ses', 'Surround Sound'],
  ['Dijital Sinyal İşleme', 'Digital Signal Processing'],
  ['Gece Modu', 'Night Mode'],
  ['TV Kumandası ile Kontrol', 'Control with TV Remote'],
  ['Dokunmatik Yüzeyli Kumanda', 'Touchpad Remote'],
  ['Dokunmatik Kontrol', 'Touch Control'],
  ['Kumanda Ekranı', 'Controller Display'],
  ['Kumanda', 'Remote'],
  ['Yansımasız', 'Anti-Glare'],
  ['Yansımasız (Anti-glare)', 'Anti-Glare'],
  ['Kavis Yarıçapı', 'Curvature Radius'],
  ['Kusursuz Renkler', 'Perfect Colors'],
  ['Mükemmel Siyahlar', 'Perfect Blacks'],
  ['Milyar Renk', 'Billion Colors'],
  ['Renk Uzayı', 'Color Space'],
  ['Renk Derinliği', 'Color Depth'],
  ['Renkler', 'Colors'],
  ['Renk', 'Color'],
  ['Çerçevesiz Tasarım', 'Borderless Design'],
  ['Tam Ekran Tasarım', 'Full-Screen Design'],
  ['Çentiksiz', 'Notchless'],
  ['Sürekli Açık Ekran (Always-on Display)', 'Always-On Display'],
  ['Always-on Display', 'Always-On Display'],
  ['Ekran Altında Ön Kamera', 'Under-Display Front Camera'],
  ['Ekran İçinde Ön Kamera', 'In-Display Front Camera'],
  ['Ekran Kilidi', 'Screen Lock'],
  ['Ekran Koruma Filmi', 'Screen Protector Film'],
  ['Ekranda Egzersiz Animasyonları', 'On-Screen Exercise Animations'],
  ['Ekran', 'Display'],
  ['Resim Kalitesi', 'Picture Quality'],
  ['Resim', 'Picture'],
  ['Kamera Bağlantısı', 'Camera Connection'],
  ['Web Kamera Kilidi', 'Webcam Privacy Shutter'],
  ['Web Kamera', 'Webcam'],
  ['Center Stage Kamera', 'Center Stage Camera'],
  ['Arka Kamera', 'Rear Camera'],
  ['Kamera', 'Camera'],
  ['Sesli', 'Voice'],
  ['Ses Güvenilir Platform Modülü', 'Audio, Trusted Platform Module'],
  ['Ses', 'Audio'],
  ['Tasarım', 'Design'],
  ['Bağlantısı', 'Connection'],
  ['Bağlantı', 'Connection'],
  ['Uzaktan', 'Remote'],
  ['Yansıtma', 'Mirroring'],
  ['Görüntü', 'Image'],
  ['Modunda', 'Mode'],
  ['Modu', 'Mode'],
  ['Komut', 'Command'],
  ['Soğutma Sistemi', 'Cooling System'],
  ['Sıvı Soğutma Sistemi', 'Liquid Cooling System'],
  ['Dahili Likit Soğutma Sistemi', 'Built-in Liquid Cooling System'],
  ['Hava Soğutma', 'Air Cooling'],
  ['Soğutma', 'Cooling'],
  ['Kalibrasyonu', 'Calibration'],
  ['Hava', 'Air'],
  ['Yazılım Güncelleme Desteği', 'Software Update Support'],
  ['Yazılım Yükseltme', 'Software Upgrade'],
  ['Yazılım', 'Software'],
  ['Yükseltme', 'Upscaling'],
  ['Çift Rulmanlı Fan', 'Dual-Bearing Fan'],
  ['Rulmanlı', 'Bearing'],
  ['Hücreli Batarya', 'Cell Battery'],
  ['Hücreli', 'Cell'],
  ['Batarya', 'Battery'],
  ['Güç Düğmesi', 'Power Button'],
  ['Güç Çıkışı', 'Power Output'],
  ['Güç', 'Power'],
  ['Cam', 'Glass'],
  ['Çizilmeye Dirençli Cam', 'Scratch Resistant Glass'],
  ['Destekli', 'Supported'],
  ['Zamanlayıcı', 'Timer'],
  ['Kilidi', 'Lock'],
  ['Kafa Bandı Yastığı', 'Headband Cushion'],
  ['Kafa Bandı', 'Headband'],
  ['Kafa Takibi', 'Head Tracking'],
  ['Engelleyici', 'Blocker'],
  ['Seviye', 'Level'],
  ['Optik', 'Optical'],
  ['Işık Sensörü', 'Light Sensor'],
  ['Işıklandırmalı', 'Illuminated'],
  ['Işıklandırma', 'Lighting'],
  ['Işık', 'Light'],
  ['Yan Plaka', 'Side Plate'],
  ['Yan', 'Side'],
  ['Çözünürlük', 'Resolution'],
  ['Adet', 'Units'],
  ['Odak Takibi', 'Focus Tracking'],
  ['Odaklama', 'Focus'],
  ['Odak', 'Focus'],
  ['Frekans Seçimi', 'Frequency Selection'],
  ['Frekans', 'Frequency'],
  ['Hızlandırıcı', 'Accelerator'],
  ['Kalp Atış Hızı', 'Heart Rate'],
  ['Kalp', 'Heart'],
  ['Oksijen Seviyesi', 'Oxygen Level'],
  ['Oksijen', 'Oxygen'],
  ['Sinyal', 'Signal'],
  ['Engelleme', 'Cancellation'],
  ['Lazer Otomatik Odaklama', 'Laser Autofocus'],
  ['Lazer', 'Laser'],
  ['Tuşları', 'Keys'],
  ['Tuşu', 'Key'],
  ['Tam', 'Full'],
  // Mixed Argos residue observed in the UI: fix these exact broken strings too.
  ['Scratch Resistant Glass Parmak İzi Tutmaz Kaplama', 'Scratch Resistant Glass, Fingerprint-Resistant Coating'],
  ['Fingerprint Tutmaz Kaplama', 'Fingerprint-Resistant Coating'],
  ['Parmak İzi Tutmaz Kaplama', 'Fingerprint-Resistant Coating'],
  ['Apple Pencil Dokunmadan Detection', 'Apple Pencil Hover Detection'],
  ['Apple Pencil Dokunmadan Algılama', 'Apple Pencil Hover Detection'],
  ['Apple Pencil Pro Desteği', 'Apple Pencil Pro Support'],
  ['P3 (Wide Color Yelpazesi)', 'P3 (Wide Color Gamut)'],
  ['P3 (Geniş Renk Yelpazesi)', 'P3 (Wide Color Gamut)'],
  ['Tam Lamine Display', 'Fully Laminated Display'],
  ['Tam Lamine Ekran', 'Fully Laminated Display'],
  ['True Tone Ekran', 'True Tone Display'],
  ['Yansımasız Mat Yüzey', 'Anti-Reflective Matte Surface'],
  ['LED Arka Aydınlatma Teknolojisi', 'LED Backlight Technology'],
  ['Deniz Suyu Temperature Hedef Belirleme', 'Sea Water Temperature, Goal Setting'],
  ['Bisiklet Eliptik Bisiklet Tenis (Havuz) (Deniz)', 'Cycling, Elliptical, Tennis, Swimming (Pool), Swimming (Open Water)'],
  ['Supportlenen Aktiviteler', 'Supported Activities'],
  ['Kaza Detection', 'Crash Detection'],
  ['Siri Assistant Hour', 'Siri Assistant'],
  ['Sim with Hour', 'Via SIM on Watch'],
  ['Bluetooth with Telefon', 'Bluetooth via Phone'],
  ['Audioli', 'Audio Assistant'],
  ['Sport Audioli Assistant', 'Sports Audio Assistant'],
  ['Audioli Assistant', 'Audio Assistant'],
  ['Head (Walkie-Talkie)', 'Walkie-Talkie'],
  ['Continuous On (Always-On)', 'Always-On'],
  ['Continuous On', 'Always-On'],
  ['Health and', 'Health'],
  ['Telefon 2', 'Phone 2'],
  ['Telefon', 'Phone'],
  ['Merdiven (Deniz)', 'Stair Climbing, Open Water Swimming'],
  ['Kuvvet HIIT Dans', 'Strength Training, HIIT, Dance'],
  ['Durability/Power', 'Endurance/Strength'],
  ['Car rental', 'Skiing'],
  ['TÜV Rheinland Titreşimsiz Sertifikasyonu', 'TÜV Rheinland Flicker-Free Certification'],
  ['TÜV Rheinland Düşük Mavi Işık Sertifikası (Donanımsal)', 'TÜV Rheinland Low Blue Light Certification (Hardware)'],
  ['TÜV Rheinland Yüksek Oyun Performansı', 'TÜV Rheinland High Gaming Performance'],
  ['Ekran Yenileme Hızı 120 Hz', '120 Hz Refresh Rate'],
  ['Sağa-Sola Döndürme (Swivel)', 'Left-Right Swivel'],
  ['Yatay-Dikey Döndürme (Pivot)', 'Landscape-Portrait Pivot'],
  ['Yukarı-Aşağı Eğme (Tilt)', 'Up-Down Tilt'],
  ['13.Nesil', '13th Gen'],
  ['10. Nesil', '10th Gen'],
  ['9. Nesil', '9th Gen'],
  ['8. Nesil', '8th Gen'],
  ['7. Nesil', '7th Gen'],
  ['Processor Nesli', 'Processor Generation'],
  ['Smart Spor Mode', 'Smart Sport Mode'],
  ['Mesafe Hava Status', 'Distance, Weather Status'],
  ['5 Kata Kadar Digital Zoom', 'Digital Zoom up to 5x'],
  ['4K Video 5 Kata Kadar Digital Zoom', '4K Video, Digital Zoom up to 5x'],
  ['Safir Kristal Mercek Cover', 'Sapphire Crystal Lens Cover'],
  ['Speed Rota (Parkur) Takibi', 'Speed and Route Tracking'],
  ['Center Stage (Focus Takibi)', 'Center Stage (Focus Tracking)'],
  ['Geri Rotation Hedef Belirleme', 'Return Route, Goal Setting'],
  ['Intel Kimlik Intel Termal Viewing', 'Intel Identity Protection, Intel Thermal Monitoring'],
  ['TÜV Rheinland Low blue light Certificate', 'TÜV Rheinland Low Blue Light Certificate'],
  ['TÜV Rheinland Low blue light Certificate ()', 'TÜV Rheinland Low Blue Light Certificate'],
  ['TÜV Rheinland Low blue light certification ()', 'TÜV Rheinland Low Blue Light Certification'],
  ['Uyku Hareketsizlik Health Nefes Stres Level Display Ritim Notification', 'Sleep Inactivity, Health, Breathing, Stress Level Display, Rhythm Notification'],
  ['(Heart Speed) Kalori Takibi Health Nefes Stres Level Display Ritim Notification', '(Heart Rate) Calorie Tracking, Health, Breathing, Stress Level Display, Rhythm Notification'],
  ['Charging Box', 'Charging Case'],
  ['Tam Wireless', 'True Wireless'],
  ['Use Mesafesi', 'Use Distance'],
  ['IP Protection Class (Su)', 'IP Protection Class (Water)'],
  ['Tere Resistant', 'Sweat Resistant'],
  ['Audioli Assistant Feature', 'Voice Assistant Feature'],
  ['Audioli Assistant Support', 'Voice Assistant Support'],
  ['Ambient Audioli Mode', 'Ambient Audio Mode'],
  ['Deep Head', 'Deep Bass'],
  ['Single ve Dual Kullanabilme', 'Single and Dual Use'],
  ['Annound', 'Compatible OS'],
  ['My phone Find', 'Find My Phone'],
  ['Calculator Machine', 'Calculator'],
  ['Tide Graphics', 'Tide Charts'],
  ['Location Info Emergency Call', 'Emergency Call with Location Info'],
  ['El with Device Control', 'Hand Gesture Device Control'],
  ['Power Tasarruf Mode', 'Power Saving Mode'],
  ['GymKit Radio Etmeyin Mode', 'GymKit, Walkie-Talkie Mode'],
  ['Audio with Command Verme', 'Voice Command'],
  ['Audio Audioli Mesaj', 'Voice Message'],
  ['Audioli Not (Voice Memo)', 'Voice Memo'],
  ['Audioli SMS Sending', 'Voice SMS Sending'],
  ['Bisiklet Eliptik Bisiklet', 'Cycling, Elliptical'],
  ['Yoga (Havuz)', 'Swimming (Pool)'],
  ['Reverse Heading', 'Return Route'],
  ['Smart Sea Water Temperature', 'Sea Water Temperature'],
  // Broad Turkish fragments that recur in 10-product harvest lists.
  ['Geniş Renk Yelpazesi', 'Wide Color Gamut'],
  ['Tazeleme Oranı', 'Refresh Rate'],
  ['Tazeleme', 'Refresh'],
  ['Parmak İzi Sensörü', 'Fingerprint Sensor'],
  ['Parmak İzi', 'Fingerprint'],
  ['Dokunmadan', 'Hover'],
  ['Yelpazesi', 'Gamut'],
  ['Bisiklet', 'Cycling'],
  ['Deniz Suyu', 'Sea Water'],
  ['Deniz', 'Open Water'],
  ['Kaza', 'Crash'],
  ['Çelik', 'Steel'],
  ['Kasım', 'November'],
  ['Tek El', 'One-Handed'],
  ['Fan Kasa', 'Case Fan'],
  ['Kulak İçi', 'In-Ear'],
  ['Parlaklık', 'Brightness'],
  ['Şarj Gücü', 'Charging Power'],
  ['Yarı Açık', 'Semi-Open'],
  ['Müzik Spor', 'Music, Sports'],
  ['Sarı Siyah', 'Yellow Black'],
  ['2 Adet 40 W', '2 x 40 W'],
  ['40 bin saat', '40,000 hours'],
  ['50 bin saat', '50,000 hours'],
  ['DSLR Kamera', 'DSLR Camera'],
  ['Lazer (LDS)', 'Laser (LDS)'],
  ['Lityum İyon', 'Lithium Ion'],
  ['Şarj Standı', 'Charging Stand'],
  ['Taşınabilir', 'Portable'],
  ['Kamera Lidar', 'LiDAR Camera'],
  ['Yüzüğümü Bul', 'Find My Ring'],
  ['2D Ekran Camı', '2D Display Glass'],
  ['Ek Özellikler', 'Additional Features'],
  ['XY Çözünürlük', 'XY Resolution'],
  ['2G Frekansları', '2G Frequencies'],
  ['Karma Kullanım', 'Mixed Use'],
  ['Ön Bellek Türü', 'Cache Type'],
  ['Rifle Rulmanlı', 'Rifle Bearing'],
  ['405nm UV Reçine', '405nm UV Resin'],
  ['Alüminyum/Metal', 'Aluminum/Metal'],
  ['Diyafram Ölçüsü', 'Aperture Size'],
  ['LCD tabanlı SLA', 'LCD-Based SLA'],
  ['Sim Kart Yuvası', 'SIM Card Slot'],
  ['Taşıma Tutamağı', 'Carry Handle'],
  ['USB-C Şarj Gücü', 'USB-C Charging Power'],
  ['Siyah Mavi Pembe', 'Black Blue Pink'],
  ['Grafen Soğutuculu', 'Graphene Cooling'],
  ['Nano Çok Katmanlı', 'Nano Multi-Layer'],
  ['Parlaklık (Maks.)', 'Brightness (Max.)'],
  ['Sessize Alma Tuşu', 'Mute Button'],
  ['Soğutucu Özelliği', 'Cooler Feature'],
  ['Akıllı Çocuk Saati', 'Smart Kids Watch'],
  ['Bağlantı Şarj Olma', 'Connection, Charging'],
  ['Lamba Ömrü (Güçlü)', 'Lamp Life (High Power)'],
  ['Mobil Uygulama İle', 'Via Mobile App'],
  ['Enstrüman Mikrofonu', 'Instrument Microphone'],
  ['Hüzmeleme Mikrofonu', 'Beamforming Microphone'],
  ['RGB Düğmesi RGB Fan', 'RGB Button, RGB Fan'],
  ['Dijital Zoom Miktarı', 'Digital Zoom Amount'],
  ['Güvenlik Teknolojisi', 'Security Technology'],
  ['Li-Ion (Lityum-İyon)', 'Li-Ion (Lithium-Ion)'],
  ['Lityum İyon 3950 mAh', 'Lithium Ion 3950 mAh'],
  ['VRR Çoklu Dokunmatik', 'VRR, Multi-Touch'],
  ['Otomatik Eksen Kilidi', 'Automatic Axis Lock'],
  ['Batarya Güç Kapasitesi', 'Battery Power Capacity'],
  ['Diğer Bağlantı Türleri', 'Other Connection Types'],
  ['Hücresel Veri Ağı Tipi', 'Cellular Data Network Type'],
  ['Kayıpsız Yakınlaştırma', 'Lossless Zoom'],
  ['Siyah Beyaz Mavi Pembe', 'Black White Blue Pink'],
  ['USB Portu (Güncelleme)', 'USB Port (Update)'],
  ['AUX microSD Kart Yuvası', 'AUX, microSD Card Slot'],
  ['Mavi Pembe Turuncu Sarı', 'Blue Pink Orange Yellow'],
  ['RJ-45 RS-232 Ses Çıkışı', 'RJ-45, RS-232, Audio Output'],
  ['Siyah Gümüş Pembe Altın', 'Black Silver Pink Gold'],
  ['Temizlik Esnasında Şarj', 'Charging During Cleaning'],
  ['Yenileme Hızı (Yazılım)', 'Refresh Rate (Software)'],
  ['35mm Eşdeğer Görüş Açısı', '35mm Equivalent Angle of View'],
  ['Siyah Mavi Pembe Turuncu', 'Black Blue Pink Orange'],
  ['10 Gbps Veri Aktarım Hızı', '10 Gbps Data Transfer Speed'],
  ['Akıllı Monitör Özellikleri', 'Smart Monitor Features'],
  ['Hücresel Ağ Hızı (İndirme)', 'Cellular Network Speed (Download)'],
  ['Hücresel Ağ Hızı (Yükleme)', 'Cellular Network Speed (Upload)'],
  ['Mavi Kırmızı Açık Mavi Bej', 'Blue Red Light Blue Beige'],
  ['Şarj Kutusu Süresi (Azami)', 'Charging Case Battery Life (Maximum)'],
  ['Temperli Cam Çelik Plastik', 'Tempered Glass, Steel, Plastic'],
  ['4 Çekirdekli 1.8GHz İşlemci', '4-Core 1.8GHz Processor'],
  ['Medya Görüntüleme Şarj Olma', 'Media Viewing, Charging'],
  ['Sesli Mesaj Videolu Görüşme', 'Voice Message, Video Call'],
  ['Siyah Beyaz Mavi Kahverengi', 'Black White Blue Brown'],
  ['Uyumlu En Az Bellek Miktarı', 'Minimum Compatible Memory Amount'],
  ['DirectInput Modu X-Input Modu', 'DirectInput Mode, X-Input Mode'],
  ['Adaptör (Type-C\'den Type-A\'ya)', 'Adapter (Type-C to Type-A)'],
  ['Acil Kayıt Artırılmış Gerçeklik', 'Emergency Recording, Augmented Reality'],
  ['Siyah Beyaz Altın Gümüş Mavi Mor', 'Black White Gold Silver Blue Purple'],
  ['Güç Kaynağı Ekran Yansıtma Servis', 'Power Supply, Screen Mirroring, Service'],
  ['Telefon Akıllı Saat Laptop Tablet', 'Phone, Smartwatch, Laptop, Tablet'],
  ['RGB Işıklandırma Sessize Alma Tuşu', 'RGB Lighting, Mute Button'],
  ['Sıçramaya Dayanıklı Tere Dayanıklı', 'Splash Resistant, Sweat Resistant'],
  ['PS/2 Optik S/PDIF BIOS Seçme Düğmesi', 'PS/2, Optical S/PDIF, BIOS Select Button'],
  ['TCL Movetime MT42X Akıllı Çocuk Saati', 'TCL Movetime MT42X Smart Kids Watch'],
  ['Telefon/Tablet Bilgisayar Akıllı Saat', 'Phone/Tablet, Computer, Smartwatch'],
  ['Plastik (Polikarbonat / Polimer / ABS)', 'Plastic (Polycarbonate / Polymer / ABS)'],
  ['DisplayPort İki Adet Thunderbolt 4 USB 4', 'DisplayPort, Two Thunderbolt 4 Ports, USB 4'],
  ['Ayarlanabilir Renk ve Işık E-ink Carta HD', 'Adjustable Color and Light, E Ink Carta HD'],
  ['Optik S/PDIF Güç Düğmesi Sıfırlama Düğmesi', 'Optical S/PDIF, Power Button, Reset Button'],
  ['Siyah Beyaz Mavi Kırmızı Pembe Mor Kamuflaj', 'Black White Blue Red Pink Purple Camouflage'],
  ['Dokunmatik Sensör Hall Sensörü Mesafe Sensörü', 'Touch Sensor, Hall Sensor, Distance Sensor'],
  ['Android iOS Windows Çoklu Platform PlayStation', 'Android, iOS, Windows, Multi-Platform, PlayStation'],
  ['Dokunmatik Sensör Hareket Sensörü Optik Sensörü', 'Touch Sensor, Motion Sensor, Optical Sensor'],
  ['Sony PlayStation 5 (Blu-ray Sürücü) (CFI-1015A)', 'Sony PlayStation 5 (Blu-ray Drive) (CFI-1015A)'],
  ['Hi-Res Audio Çift Yönlü YZ Ses Gürültü Engelleme', 'Hi-Res Audio, Bidirectional AI Voice Noise Cancellation'],
  ['Düz Kağıt Epson Parlak Beyaz Kağıt Fotoğraf Kağıdı', 'Plain Paper, Epson Bright White Paper, Photo Paper'],
  ['Sesli Komut Uzaktan Kumanda Yapay Zeka Takip Cihazı', 'Voice Command, Remote Control, AI Tracking Device'],
  ['Gürültü Engelleme RGB Işıklandırma Sessize Alma Tuşu', 'Noise Cancellation, RGB Lighting, Mute Button'],
  ['Windows Uyumu Miracast AirPlay Görüntü Aynalama HDCP', 'Windows Compatibility, Miracast, AirPlay, Screen Mirroring, HDCP'],
  ['DJI RS 4 Mini Combo Gimbal (Takip Modülü / Tutma Kolu)', 'DJI RS 4 Mini Combo Gimbal (Tracking Module / Grip)'],
  ['Wi-Fi Direct Apple AirPrint HP Smart Uygulaması Mopria', 'Wi-Fi Direct, Apple AirPrint, HP Smart App, Mopria'],
  ['Telefon/Tablet Bilgisayar Genel Kullanım TV Akıllı Saat', 'Phone/Tablet, Computer, General Use, TV, Smartwatch'],
  ['Işık Sensörü (Eco Sensor/Akıllı Sensör) Otomatik Kapanma', 'Light Sensor (Eco Sensor/Smart Sensor), Auto Power Off'],
  ['Kablosuz Güç Paylaşımı Kablosuz Şarj Qi Kablosuz Şarj (5W)', 'Wireless PowerShare, Wireless Charging, Qi Wireless Charging (5W)'],
  ['Ayarlanabilir Tek Renkli Ekran Aydınlatması E Ink Carta 1200', 'Adjustable Monochrome Display Lighting, E Ink Carta 1200'],
  ['Acil Kayıt Aralıklı Kayıt Ön Araç Hareket Uyarısı Yaya Uyarısı', 'Emergency Recording, Interval Recording, Front Vehicle Movement Warning, Pedestrian Warning'],
  ['Alüminyum Alaşımlı Gövde Sabit Diyafram USB Portu (Güncelleme)', 'Aluminum Alloy Body, Fixed Aperture, USB Port (Update)'],
  ['DisplayPort 1.4 Uyku Modunda Şarj Desteği 10 Gbps Veri Aktarım Hızı', 'DisplayPort 1.4, Sleep Charging Support, 10 Gbps Data Transfer Speed'],
  ['DTS X Ultra Ses HP Audio Boost HyperX Termal Sensör 2 Adet Hoparlör', 'DTS:X Ultra Audio, HP Audio Boost, HyperX Thermal Sensor, 2 Speakers'],
  ['Diyafram Halkası Odak Mesafesi Sınırlayıcı Önden Genişleyen Odaklama', 'Aperture Ring, Focus Distance Limiter, Front-Extending Focus'],
  ['Portre Modu Omnivision OV16A1Q Sensör 1.12μm Piksel 5 Elementli Lens', 'Portrait Mode, OmniVision OV16A1Q Sensor, 1.12μm Pixel, 5-Element Lens'],
  ['Dark 1080P Kablosuz HDMI Ses ve Görüntü Aktarım Kiti (DK-HD-WHDG103K)', 'Dark 1080P Wireless HDMI Audio and Video Transmission Kit (DK-HD-WHDG103K)'],
  ['WDR Android Desteği iOS Desteği Bluetooth Sesli Kontrol 4 Adet Kamera', 'WDR, Android Support, iOS Support, Bluetooth, Voice Control, 4 Cameras'],
  ['Akım Koruması Isı Koruması Kısa Devre Koruması Gerilim (Voltaj) Koruması', 'Current Protection, Heat Protection, Short-Circuit Protection, Voltage Protection'],
  ['Arka Kapak Kılıfı SIM Çıkartma İğnesi USB Güç Adaptörü (90W) USB Kablosu', 'Back Cover Case, SIM Eject Pin, USB Power Adapter (90W), USB Cable'],
  ['CTM Ön Işık (Sıcak & Soğuk) E Ink Carta 1200 Kapasitif Ekran (Dokunmatik)', 'CTM Front Light (Warm & Cool), E Ink Carta 1200, Capacitive Display (Touch)'],
  ['Alttan Atımlı Subwoofer Ses Modları (DSP) Derin Bas Duvara Monte Edilebilir', 'Down-Firing Subwoofer, Sound Modes (DSP), Deep Bass, Wall Mountable'],
  ['Canon "Günlük Kullanım" (GP-501) Canon Plus Glossy II (PP-201) Düz Kağıt Zarf', 'Canon Everyday Use (GP-501), Canon Plus Glossy II (PP-201), Plain Paper, Envelope'],
  ['Dolby Audio Dolby Vision Google Asistan Otomatik Odaklama Oyun Modu Spor Modu', 'Dolby Audio, Dolby Vision, Google Assistant, Autofocus, Game Mode, Sports Mode'],
  ['FHD Kızılötesi HDR Web Kamera Kilidi 3D Gürültü Engelleme (3DNR+) 30FPS 1080p', 'FHD Infrared, HDR, Webcam Privacy Shutter, 3D Noise Reduction (3DNR+), 30FPS, 1080p'],
  ['Adım Sayar Mesafe Ölçümü Kişisel Gelişim Koçu VO2 Max Ölçümü Aktivite Algılama', 'Step Counter, Distance Measurement, Personal Development Coach, VO2 Max Measurement, Activity Detection'],
  ['Gürültü Engelleme HP True Vision 1080p FHD Kızılötesi Kapatılabilir 2 Adet Kamera', 'Noise Cancellation, HP True Vision 1080p FHD Infrared, Shutter, 2 Cameras'],
  ['MIL-STD-1916 Nahimic 3 RGB Işıklandırma Silent Storm Cooling AI Sıvı Soğutma Sistemi', 'MIL-STD-1916, Nahimic 3, RGB Lighting, Silent Storm Cooling AI, Liquid Cooling System'],
  ['Windows Hello Desteği (Yüz Tanıma) Gürültü Engelleme 2 Adet Mikrofon 1080p Kızılötesi', 'Windows Hello Support (Face Recognition), Noise Cancellation, 2 Microphones, 1080p Infrared'],
  ['VRR Corning Gorilla Glass Victus Çoklu Dokunmatik (10 Nokta) Corning Gorilla Glass DXC', 'VRR, Corning Gorilla Glass Victus, Multi-Touch (10 Points), Corning Gorilla Glass DXC'],
  ['Google Asistan Google Chromecast Google Widevine L1 Görüntü Aynalama Sesli Komut Desteği', 'Google Assistant, Google Chromecast, Google Widevine L1, Screen Mirroring, Voice Command Support'],
  ['Akış Hızı Optimizasyonu Atık Şutu Tıkanıklığı Tespiti Basınç İleri Ayarı Kamera Bağlantısı', 'Flow Rate Optimization, Waste Chute Blockage Detection, Pressure Advance Adjustment, Camera Connection'],
  ['Düz Kağıt Fotoğraf Kağıdı HP Mat Broşür Kağıdı HP Parlak Broşür veya Profesyonel Kağıt Zarf', 'Plain Paper, Photo Paper, HP Matte Brochure Paper, HP Glossy Brochure or Professional Paper, Envelope'],
  ['Acil Kayıt Android Desteği iOS Desteği Aralıklı Kayıt Çoklu Kayıt Sistemi HDR Kayıt Type-C Güç Girişi 24 Saat Koruma', 'Emergency Recording, Android Support, iOS Support, Interval Recording, Multi-Recording System, HDR Recording, Type-C Power Input, 24-Hour Protection'],
  ['QoS Desteği DHCP Desteği IPv6 IGMP Desteği NAT Desteği Multi WAN Airtime Fairness BitTorent Desteği Reklam Engelleyici', 'QoS Support, DHCP Support, IPv6, IGMP Support, NAT Support, Multi-WAN, Airtime Fairness, BitTorrent Support, Ad Blocker'],
  ['Ekran Koruma Filmi (Telefona Uygulanmış) Şeffaf Arka Kapak Kılıfı SIM Çıkartma İğnesi USB Güç Adaptörü (100W) USB Kablosu', 'Screen Protector Film (Pre-Applied to Phone), Transparent Back Cover Case, SIM Eject Pin, USB Power Adapter (100W), USB Cable'],
  ['QoS Desteği DHCP Desteği IPv6 IGMP Desteği NAT Desteği DMZ Çoklu Bağlantı Çalışması (MLO) Çoklu Kaynak Birimleri (Multi-RU)', 'QoS Support, DHCP Support, IPv6, IGMP Support, NAT Support, DMZ, Multi-Link Operation (MLO), Multi-Resource Units (Multi-RU)'],
  ['0dB Çift BIOS Vapor Chamber Jel İletken Termal Takviyesi LCD Ekran Sıvı Metal Termal Takviyesi Gigabyte Hawk Fan Gigabyte WindForce', '0dB, Dual BIOS, Vapor Chamber, Gelid Thermal Enhancement, LCD Display, Liquid Metal Thermal Enhancement, Gigabyte Hawk Fan, Gigabyte WindForce'],
  ['Havada Asılı Kalma Otomatik İniş/Kalkış Katlanabilir Tasarım Rüzgara Dirençli Telefon ile Kontrol Hassas Uçuş Seviye 5 Rüzgar Direnci', 'Hovering, Automatic Landing/Takeoff, Foldable Design, Wind Resistant, Phone Control, Precision Flight, Level 5 Wind Resistance'],
  ['TPM Başlığı Yapay Zeka Desteği AMD Expo m.2 Hızlı Montaj PCIe Hızlı Montaj CUDIMM Desteği Ön Plaka Arka Bağlantı Tasarımı Harici m.2 Yuvası', 'TPM Header, AI Support, AMD EXPO, M.2 Quick Installation, PCIe Quick Installation, CUDIMM Support, Front Plate, Rear Connector Design, External M.2 Slot'],
  ['DLNA Dolby Vision Google Asistan Google Chromecast Google Home Uyumu Google Widevine L1 HDMI-CEC HDR10 HDR10+ Microsoft PlayReady Sesli Komut Desteği', 'DLNA, Dolby Vision, Google Assistant, Google Chromecast, Google Home Compatibility, Google Widevine L1, HDMI-CEC, HDR10, HDR10+, Microsoft PlayReady, Voice Command Support'],
  ['TPM Başlığı AMD Expo m.2 Hızlı Montaj PCIe Hızlı Montaj CUDIMM Desteği Ön Plaka Harici m.2 Yuvası MSI Ai Boost MSI Ai Engine MSI Frozr Ai Cooling MSI Mystic Light Sync', 'TPM Header, AMD EXPO, M.2 Quick Installation, PCIe Quick Installation, CUDIMM Support, Front Plate, External M.2 Slot, MSI AI Boost, MSI AI Engine, MSI Frozr AI Cooling, MSI Mystic Light Sync'],
  ['Ekstra Geniş Açı Dijital görüntü sabitleyici (EIS) Ekstra Geniş Açı (102°) Leica Optik OmniVision OV50M Sensor 1/2.87" Sensör Boyutu 1.22μm Piksel 6 Elementli Lens 17mm', 'Ultra-Wide Angle, Digital Image Stabilization (EIS), Ultra-Wide Angle (102°), Leica Optics, OmniVision OV50M Sensor, 1/2.87" Sensor Size, 1.22μm Pixel, 6-Element Lens, 17mm'],
  ['Dolby Vision Kayıt HDR HDR (4K) Dijital görüntü sabitleyici (EIS) HDR (4K) 60fps Odak Takibi Time-lapse (Hyperlapse) Yavaş Çekim Video Kayıt (Slow motion video) 10-bit LOG', 'Dolby Vision Recording, HDR, HDR (4K), Digital Image Stabilization (EIS), HDR (4K) 60fps, Focus Tracking, Time-Lapse (Hyperlapse), Slow-Motion Video Recording, 10-bit LOG'],
  ['Acil Kayıt Şerit İhlal Uyarısı Çarpışma Önleme Uyarısı WDR Android Desteği iOS Desteği Otomatik Kayıt Başlatma Dahili Hoparlör CPL Filtre HDR Kayıt Hızlı Çekim 3D DNR Gece Görüşü', 'Emergency Recording, Lane Departure Warning, Collision Prevention Warning, WDR, Android Support, iOS Support, Automatic Recording Start, Built-in Speaker, CPL Filter, HDR Recording, Fast Recording, 3D DNR, Night Vision'],
  ['Koşu Bisiklet Yürüyüş Tırmanış Yoga Kürek Çekme Tenis Basketbol Futbol Yüzme (Havuz) Kayak Merdiven Tırmanma Yüzme (Deniz) İp Atlama Golf Triatlon Sörf Kürek Sörfü Dalış Voleybol Yelkencilik Rafting', 'Running, Cycling, Walking, Climbing, Yoga, Rowing, Tennis, Basketball, Football, Swimming (Pool), Skiing, Stair Climbing, Swimming (Open Water), Jump Rope, Golf, Triathlon, Surfing, Paddle Surfing, Diving, Volleyball, Sailing, Rafting'],
  ['Ekran Yansıtma (Screen Mirroring) Hızlı Kablosuz Şarj Etme (10W) Kablosuz Şarj ile Başka Cihazları Şarj Edebilme Karanlık Mod (Dark Mode) Kısayol Tuşu (Kişiselleştirilebilir) Vapor-Chamber Soğutma Yüz Tanımlama', 'Screen Mirroring, Fast Wireless Charging (10W), Charge Other Devices via Wireless Charging, Dark Mode, Customizable Shortcut Key, Vapor-Chamber Cooling, Face Recognition'],
  ['Akıllı Telefon ile Kontrol Ekolayzır Hızlı Şarj Powerbank AuraCast Çıkarılabilir Kayış Dahili Subwoofer Derin Bas Güçlü Bas Hoparlör Eşleştirme JBL Al Sound Boost JBL PartyBoost JBL Pro Sound LED Gösterge Servis ve Uygulamalar', 'Smartphone Control, Equalizer, Fast Charging, Powerbank, Auracast, Removable Strap, Built-in Subwoofer, Deep Bass, Powerful Bass, Speaker Pairing, JBL AI Sound Boost, JBL PartyBoost, JBL Pro Sound, LED Indicator, Services and Apps'],
  ['Adımsayar Mesafe Ölçer Aktivite Takibi ve Geçmişi Hava Durumu Kronometre Çoklu Spor Modu Akıllı Spor Modu Akıllı Koç Çevrimdışı Rota (Parkur) Takibi Ekranda Egzersiz Animasyonları Geri Dönüş Rotası Hız Ölçer Rota (Parkur) Takibi Suda Rota Takibi', 'Step Counter, Distance Meter, Activity Tracking and History, Weather, Stopwatch, Multi-Sport Mode, Smart Sport Mode, Smart Coach, Offline Route Tracking, On-Screen Exercise Animations, Return Route, Speedometer, Route Tracking, Water Route Tracking'],
  ['AMD FreeSync AMD FreeSync Premium AMD FreeSync Premium Pro Adaptive-Sync NVIDIA G-SYNC Compatible (Uyumlu) HDR (High Dynamic Range) HDR10 Titreşimi Azaltma (Flicker-free) Mavi Işık Filtresi (Blue Light Filter) Resim İçinde Resim (PiP) Resim Yanında Resim (PbP)', 'AMD FreeSync, AMD FreeSync Premium, AMD FreeSync Premium Pro, Adaptive-Sync, NVIDIA G-SYNC Compatible, HDR (High Dynamic Range), HDR10, Flicker-Free, Blue Light Filter, Picture-in-Picture (PiP), Picture-by-Picture (PbP)'],
  ['Hareket Algılama Gündüz/Gece (ICR) İç Mekan (Ev) Çoklu Online Erişim Duvara Monte Edilebilir Hareket Takibi Renkli Gece Görüşü Amazon Alexa Desteği Sesli Komut Desteği Gizlilik Modu Google Asistan Desteği Google Home Desteği HEVC/H.265 Yapay Zeka (AI) İnsan Algılama', 'Motion Detection, Day/Night (ICR), Indoor (Home), Multiple Online Access, Wall Mountable, Motion Tracking, Color Night Vision, Amazon Alexa Support, Voice Command Support, Privacy Mode, Google Assistant Support, Google Home Support, HEVC/H.265, AI Human Detection'],
  ['Google Asistan Google Chromecast Google TV Google Widevine L1 Görüntü Aynalama Harici Disk Desteği HDMI-CEC HDR10 HDR10+ HLG IPTV Desteği Sesli Komut Desteği Sesli Uzaktan Kumanda VOD Desteği Yapay Zeka Çözünürlük Yükseltme (AISR) Yapay Zeka Resim Kalitesi Arttırma (AIPQ)', 'Google Assistant, Google Chromecast, Google TV, Google Widevine L1, Screen Mirroring, External Drive Support, HDMI-CEC, HDR10, HDR10+, HLG, IPTV Support, Voice Command Support, Voice Remote, VOD Support, AI Resolution Upscaling (AISR), AI Picture Quality Enhancement (AIPQ)'],
  ['Eylül', 'September'],
  ['Ekransız', 'No Display'],
  ['Çin', 'China'],
  ['Kamera ToF', 'ToF Camera'],
  ['Pompa Ömrü', 'Pump Life'],
  ['30 bin saat', '30,000 hours'],
  ['Altın Gümüş', 'Gold Silver'],
  ['Gümüş Siyah', 'Silver Black'],
  ['Pil Voltajı', 'Battery Voltage'],
  ['Pivot Açısı', 'Pivot Angle'],
  ['Azami İrtifa', 'Maximum Altitude'],
  ['Pompa Rulmanı', 'Pump Bearing'],
  ['Uçuş Ağırlığı', 'Flight Weight'],
  ['Kızılötesi LED', 'Infrared LED'],
  ['Konnektör Tipi', 'Connector Type'],
  ['Telefon Ölçüsü', 'Phone Size'],
  ['Hidrolik Rulmanlı', 'Hydraulic Bearing'],
  ['Hobi/Uçuş Eğitimi', 'Hobby/Flight Training'],
  ['Kenarlıksız Baskı', 'Borderless Printing'],
  ['Siyah Mavi Kırmızı', 'Black Blue Red'],
  ['Sesli Bilgilendirme', 'Voice Information'],
  ['ARGB Fan LED Düğmesi', 'ARGB Fan LED Button'],
  ['Dolum Süresi (Hızlı)', 'Charging Time (Fast)'],
  ['Duruş Açısı (Yüksek)', 'Stand Angle (High)'],
  ['Güç Tüketimi (Tipik)', 'Power Consumption (Typical)'],
  ['Prime (Sabit Odaklı)', 'Prime (Fixed Focus)'],
  ['Püskürtmeye Dayanıklı', 'Spray Resistant'],
  ['Filament Bitiş Sensörü', 'Filament Runout Sensor'],
  ['Kablosuz Şarj Özelliği', 'Wireless Charging Feature'],
  ['Mıknatıslı 5W 7.5W 15W', 'Magnetic 5W 7.5W 15W'],
  ['Mıknatıslı 5W 7.5W 10W 15W', 'Magnetic 5W 7.5W 10W 15W'],
  ['Radyatör Desteği (Alt)', 'Radiator Support (Bottom)'],
  ['Radyatör Desteği (Sağ)', 'Radiator Support (Right)'],
  ['Siyah Mavi Pembe Yeşil', 'Black Blue Pink Green'],
  ['Siyah Beyaz Mavi Pembe Mor', 'Black White Blue Pink Purple'],
  ['Siyah Mavi Yeşil Turuncu Mor', 'Black Blue Green Orange Purple'],
  ['Siyah Mavi Kırmızı Beyaz Yeşil', 'Black Blue Red White Green'],
  ['Siyah Beyaz Mavi Kırmızı Kamuflaj', 'Black White Blue Red Camouflage'],
  ['Siyah Beyaz Pembe Gri', 'Black White Pink Gray'],
  ['Siyah Beyaz Yeşil Pembe', 'Black White Green Pink'],
  ['Beyaz Kırmızı Titanyum', 'White Red Titanium'],
  ['Arttırılabilir Depolama', 'Expandable Storage'],
  ['Çalışma Sıcaklığı (max)', 'Operating Temperature (max)'],
  ['Ekran Kartı Bellek Türü', 'Graphics Card Memory Type'],
  ['Ekran Kartı Bellek Arayüzü', 'Graphics Card Memory Interface'],
  ['Ekran Kartı Bellek Miktarı', 'Graphics Card Memory Amount'],
  ['Ekran Kartı Normal Frekans', 'Graphics Card Base Frequency'],
  ['Ekran Kartı Turbo Frekans', 'Graphics Card Turbo Frequency'],
  ['Ekran Kartı İşlemci Markası', 'Graphics Card Processor Brand'],
  ['Floroelastomer / Kauçuk', 'Fluoroelastomer / Rubber'],
  ['Kablosuz Şarj Standardı', 'Wireless Charging Standard'],
  ['Düşme Engelleyici Sensör', 'Fall Prevention Sensor'],
  ['Filament Dolaşma Algılama', 'Filament Tangle Detection'],
  ['Vestel VR Gözlük (20290922)', 'Vestel VR Goggles (20290922)'],
  ['Bağlantı Powerbank Şarj Olma', 'Connection, Powerbank Charging'],
  ['Dördüncü Arka Kamera Diyafram', 'Fourth Rear Camera Aperture'],
  ['Dördüncü Arka Kamera Çözünürlüğü', 'Fourth Rear Camera Resolution'],
  ['Dördüncü Arka Kamera Özellikleri', 'Fourth Rear Camera Features'],
  ['Ekran Çözünürlüğü (Dual Mode)', 'Display Resolution (Dual Mode)'],
  ['Elektronik Su Haznesi Kontrolü', 'Electronic Water Tank Control'],
  ['İlk Sayfa Çıkış Süresi (Siyah)', 'First Page Out Time (Black)'],
  ['İlk Sayfa Çıkış Süresi (Renkli)', 'First Page Out Time (Color)'],
  ['Kablosuz Bağlantı Resmi Sertifikalı', 'Wireless Connection Officially Certified'],
  ['Optik S/PDIF Programlanabilir Düğme', 'Optical S/PDIF, Programmable Button'],
  ['G-Sensör Hareket Sensörü Park Sensörü', 'G-Sensor, Motion Sensor, Parking Sensor'],
  ['DirectInput Modu Turbo Modu X-Input Modu', 'DirectInput Mode, Turbo Mode, X-Input Mode'],
  ['DJI Mic Mini 2 Kişilik Mikrofon (2 Adet)', 'DJI Mic Mini 2-Person Microphone (2 Units)'],
  ['Mikrofon Android 11.0 8 Çekirdekli İşlemci', 'Microphone, Android 11.0, 8-Core Processor'],
  ['Katlanabilir Tasarım Seviye 5 Rüzgar Direnci', 'Foldable Design, Level 5 Wind Resistance'],
  ['Copilot Tuşu SteelSeries (Özel Oyuncu Tuşları)', 'Copilot Key, SteelSeries (Special Gaming Keys)'],
  ['LED Işıklandırma Sessize Alma Tuşu 4 Adet Diyafram', 'LED Lighting, Mute Button, 4 Aperture Patterns'],
  ['Apple 20 W USB-C Güç Adaptörü Şarj Aleti (MHJE3TU/A)', 'Apple 20 W USB-C Power Adapter Charger (MHJE3TU/A)'],
  ['TRIM Desteği Darbeye Dayanıklı GC (Garbage Collection)', 'TRIM Support, Shock Resistant, GC (Garbage Collection)'],
  ['AS (Asferik) ED (Ekstra Düşük Dağılım) HR (Yüksek Kırılma)', 'AS (Aspherical), ED (Extra-Low Dispersion), HR (High Refractive Index)'],
  ['Monochrome Sensör Multi-Spectrum Colour Temperature Sensor', 'Monochrome Sensor, Multi-Spectrum Colour Temperature Sensor'],
  ['Diyafram Halkası Diyafram Sesi Düğmesi USB Portu (Güncelleme)', 'Aperture Ring, Aperture Click Switch, USB Port (Update)'],
  ['Sony PlayStation 5 Slim (Blu-ray Sürücü / İnce) (CFI-2000A01)', 'Sony PlayStation 5 Slim (Blu-ray Drive / Slim) (CFI-2000A01)'],
  ['Sony PlayStation 5 Slim Digital Edition (İnce / Dijital) (CFI-2000B01)', 'Sony PlayStation 5 Slim Digital Edition (Slim / Digital) (CFI-2000B01)'],
  ['Windows Mac Çoklu Platform PlayStation 4 Nintendo Switch Xbox One', 'Windows, Mac, Multi-Platform, PlayStation 4, Nintendo Switch, Xbox One'],
  ['Gürültü Engelleme Otomatik Kapanma Otomatik Sınırlama 2 Adet Mikrofon', 'Noise Cancellation, Auto Power Off, Automatic Limiting, 2 Microphones'],
  ['Arka Kapak Kılıfı SIM Çıkartma İğnesi USB Güç Adaptörü (80W) USB Kablosu', 'Back Cover Case, SIM Eject Pin, USB Power Adapter (80W), USB Cable'],
  ['CTM Ön Işık (Sıcak & Soğuk) E Ink Carta 1300 Kapasitif Ekran (Dokunmatik)', 'CTM Front Light (Warm & Cool), E Ink Carta 1300, Capacitive Display (Touch)'],
  ['Omnidirectional (Çok Yönlü) Bidirectional (Çift Yönlü) Cardioid (Tek Yönlü) Stereo', 'Omnidirectional, Bidirectional, Cardioid, Stereo'],
  ['Dokunmatik Sürekli Açık (Always-On) Çizilmeye Dirençli Kavisli Ekran (2.5D) Safir Kristal 60Hz', 'Touch, Always-On, Scratch Resistant, Curved Display (2.5D), Sapphire Crystal, 60Hz'],
  ['IPv6 Multi WAN Çoklu Bağlantı Çalışması (MLO) Yapay Zekalı Dolaşım Asus AiProtection Pro Duvar Tipi', 'IPv6, Multi-WAN, Multi-Link Operation (MLO), AI Roaming, Asus AiProtection Pro, Wall-Mount Type'],
  ['Çekirdekleri', 'Cores'],
  ['ECC Bellek', 'ECC Memory'],
  ['Depolama', 'Storage'],
  ['256/512/1TB Depolama seçeneği var', '256GB/512GB/1TB Storage option available'],
  ['512/1TB Depolama seçeneği var', '512GB/1TB Storage option available'],
  ['Akıllı Enerji Tasarrufu Sistemi Işık Sensörü (Eco Sensor/Akıllı Sensör) Otomatik Kapanma', 'Smart Energy Saving System, Light Sensor (Eco Sensor/Smart Sensor), Auto Power Off'],
  ['Eş Zamanlı 3 Cihaz Şarj Etme Eş Zamanlı Şarj Giriş ve Çıkış Özellikli USB-C Tutma Askısı', 'Charge 3 Devices Simultaneously, Simultaneous Charging, USB-C with Input and Output, Carry Strap'],
  ['Eş Zamanlı 4 Cihaz Şarj Etme Eş Zamanlı Şarj Giriş ve Çıkış Özellikli USB-C Tutma Askısı', 'Charge 4 Devices Simultaneously, Simultaneous Charging, USB-C with Input and Output, Carry Strap'],
  ['Gürültü Engelleme Manyetik Klip Otomatik Kapanma Zaman Kodu 2 Adet Mikrofon 802.11 a/b/g/n/ac/ax', 'Noise Cancellation, Magnetic Clip, Auto Power Off, Timecode, 2 Microphones, 802.11 a/b/g/n/ac/ax'],
  ['Cooler Boost 5 Soğutma Güvenilir Platform Modülü TPM 2.0 (Yazılım) Microsoft Pluton Security 2 x 2W Woofer 4 x 2W Hoparlör', 'Cooler Boost 5 Cooling, Trusted Platform Module TPM 2.0 (Firmware), Microsoft Pluton Security, 2 x 2W Woofer, 4 x 2W Speaker'],
  ['QoS Desteği DHCP Desteği IPv6 IGMP Desteği NAT Desteği Multi WAN Airtime Fairness BitTorent Desteği DLNA Reklam Engelleyici VLAN', 'QoS Support, DHCP Support, IPv6, IGMP Support, NAT Support, Multi-WAN, Airtime Fairness, BitTorrent Support, DLNA, Ad Blocker, VLAN'],
  ['Dokunmatik Sürekli Açık (Always-On) Çizilmeye Dirençli Geniş Açılı OLED Güçlendirilmiş Cam Ion-X Cam LTPO 3.0 Parlaklık Ayarı Retina Ekran', 'Touch, Always-On, Scratch Resistant, Wide-Angle OLED, Reinforced Glass, Ion-X Glass, LTPO 3.0, Brightness Adjustment, Retina Display'],
  ['Ekstra Geniş Açı Otomatik Odaklama Dijital görüntü sabitleyici (EIS) Ekstra Geniş Açı (116°) OmniVision OV50D Sensör 6 Elementli Lens 16mm', 'Ultra-Wide Angle, Autofocus, Digital Image Stabilization (EIS), Ultra-Wide Angle (116°), OmniVision OV50D Sensor, 6-Element Lens, 16mm'],
  ['Dolby Vision Google Asistan Google Chromecast Google Widevine L1 HDR10 HDR10+ IPTV Desteği Microsoft PlayReady Sesli Komut Desteği Sesli Uzaktan Kumanda', 'Dolby Vision, Google Assistant, Google Chromecast, Google Widevine L1, HDR10, HDR10+, IPTV Support, Microsoft PlayReady, Voice Command Support, Voice Remote'],
  ['ECC Bellek HDR Nvidia Cuda 12.8 Nvidia Decoder (NVDEC) 6 Nvidia Encoder (NVENC) 9 Nvidia Işın İzleme Çekirdekleri 4.Nesil Nvidia Tensor Çekirdekleri 5.Nesil', 'ECC Memory, HDR, Nvidia CUDA 12.8, Nvidia Decoder (NVDEC) 6, Nvidia Encoder (NVENC) 9, 4th Gen Nvidia Ray Tracing Cores, 5th Gen Nvidia Tensor Cores'],
  ['%100 DCI-P3 DisplayHDR 400 Dolby Vision Eyesafe (Göz Sağlığı Sertifikasyonu) Fabrika Renk Kalibrasyonu TÜV Rheinland Low Blue Light (Hardware Solution) X-Rite', '100% DCI-P3, DisplayHDR 400, Dolby Vision, Eyesafe Certification, Factory Color Calibration, TÜV Rheinland Low Blue Light (Hardware Solution), X-Rite'],
  ['Yapay Zeka Desteği Fanlı Soğutucu Gelişmiş Işın İzleme Harici Disk Desteği M.2 NVMe Genişletilebilir Depolama Alanı PlayStation Spectral Super Resolution (PSRR)', 'AI Support, Active Cooler, Advanced Ray Tracing, External Drive Support, M.2 NVMe Expandable Storage, PlayStation Spectral Super Resolution (PSRR)'],
  ['∆E (Delta E) VESA ClearMR 13000 KVM Quantum Dot Color VESA DisplayHDR True Black 400 VESA ClearMR Kavis Yarıçapı (1800R) MSI OLED Care 2.0 QD OLED Yansımasız (Anti-glare)', '∆E (Delta E), VESA ClearMR 13000, KVM, Quantum Dot Color, VESA DisplayHDR True Black 400, VESA ClearMR, Curvature Radius (1800R), MSI OLED Care 2.0, QD OLED, Anti-Glare'],
  ['İvme Ölçer Jiroskop Barometre Dijital Pusula Face ID Sensörü FaceTime Görüntülü Arama FaceTime Sesli Arama LiDAR Scanner Neural Accelerators Ortam Işığı Sensörü 4 Adet Hoparlör', 'Accelerometer, Gyroscope, Barometer, Digital Compass, Face ID Sensor, FaceTime Video Calling, FaceTime Audio Calling, LiDAR Scanner, Neural Accelerators, Ambient Light Sensor, 4 Speakers'],
  ['QoS Desteği DHCP Desteği IPv6 IGMP Desteği NAT Desteği DMZ Airtime Fairness Çoklu Bağlantı Çalışması (MLO) Çoklu Kaynak Birimleri (Multi-RU) Amazon Alexa Google Asistan TP-Link HomeShield', 'QoS Support, DHCP Support, IPv6, IGMP Support, NAT Support, DMZ, Airtime Fairness, Multi-Link Operation (MLO), Multi-Resource Units (Multi-RU), Amazon Alexa, Google Assistant, TP-Link HomeShield'],
  ['Telephoto Optik Görüntü Sabitleyici (OIS) Otomatik Odaklama Dijital görüntü sabitleyici (EIS) Optik Zoom (3.5x) Samsung ISOCELL JN5 Sensör 4 Elementli Lens 30° Açılı 85mm 120x Dijital Zoom', 'Telephoto, Optical Image Stabilization (OIS), Autofocus, Digital Image Stabilization (EIS), Optical Zoom (3.5x), Samsung ISOCELL JN5 Sensor, 4-Element Lens, 30° Angle, 85mm, 120x Digital Zoom'],
  ['Adaptive-Sync NVIDIA G-SYNC Compatible (Uyumlu) HDR (High Dynamic Range) Titreşimi Azaltma (Flicker-free) Mavi Işık Filtresi (Blue Light Filter) Resim İçinde Resim (PiP) Resim Yanında Resim (PbP)', 'Adaptive-Sync, NVIDIA G-SYNC Compatible, HDR (High Dynamic Range), Flicker-Free, Blue Light Filter, Picture-in-Picture (PiP), Picture-by-Picture (PbP)'],
  ['Acil Kayıt Android Desteği iOS Desteği Akü Voltaj İzleme Anlık Bildirim Atlamalı Video Kayıt Bluetooth Çarpışma Algılama Hareket Algılama Sesli Kontrol Type-C Güç Girişi Uzaktan Bağlantı 4G Bağlantı', 'Emergency Recording, Android Support, iOS Support, Battery Voltage Monitoring, Instant Notification, Time-Lapse Video Recording, Bluetooth, Collision Detection, Motion Detection, Voice Control, Type-C Power Input, Remote Connection, 4G Connection'],
  ['Havada Asılı Kalma Otomatik İniş/Kalkış Katlanabilir Tasarım Rüzgara Dirençli Telefon ile Kontrol Bluetooth 5.4 DJI ActiveTrack 360 LiDAR Sensörü Pilot Asistanı Sistemi (APAS) Seviye 5 Rüzgar Direnci', 'Hovering, Automatic Landing/Takeoff, Foldable Design, Wind Resistant, Phone Control, Bluetooth 5.4, DJI ActiveTrack 360, LiDAR Sensor, Advanced Pilot Assistance System (APAS), Level 5 Wind Resistance'],
  ['Havada Asılı Kalma Otomatik İniş/Kalkış FPV Rüzgara Dirençli VR Gözlük Desteği El Hareketi ile Kontrol Telefon ile Kontrol Sesli Kontrol Avuçiçine İniş/Kalkış Bluetooth Bluetooth 5.2 Seviye 5 Rüzgar Direnci', 'Hovering, Automatic Landing/Takeoff, FPV, Wind Resistant, VR Goggles Support, Gesture Control, Phone Control, Voice Control, Palm Takeoff/Landing, Bluetooth, Bluetooth 5.2, Level 5 Wind Resistance'],
  ['Çift taraflı Mat kağıt (MP-101D) Düz Kağıt Fotoğraf Kağıdı Koyu Renkli Kumaş Üzerine Ütü Baskılı Uygulamalar (DF-101) Tebrik Kartları (Avery ve RedRiverPaper üretimi) Yüksek Çözünürlüklü Kağıt (HR-101N) Zarf', 'Double-Sided Matte Paper (MP-101D), Plain Paper, Photo Paper, Iron-On Transfers for Dark-Colored Fabric (DF-101), Greeting Cards (Avery and RedRiverPaper), High-Resolution Paper (HR-101N), Envelope'],
  ['Dokunmatik Yüzeyli Kumanda Dolby Vision Google Asistan Google Cast Uyumu Google Chromecast Google TV Google Widevine L1 HDR10 HDR10+ IPTV Desteği Sesli Komut Desteği Sesli Uzaktan Kumanda USB Ethernet Desteği VOD Desteği', 'Touchpad Remote, Dolby Vision, Google Assistant, Google Cast Compatibility, Google Chromecast, Google TV, Google Widevine L1, HDR10, HDR10+, IPTV Support, Voice Command Support, Voice Remote, USB Ethernet Support, VOD Support'],
  ['AMD FreeSync AMD FreeSync Premium AMD FreeSync Premium Pro Adaptive-Sync NVIDIA G-SYNC Compatible (Uyumlu) HDR (High Dynamic Range) Mavi Işık Filtresi (Blue Light Filter) Resim İçinde Resim (PiP) Resim Yanında Resim (PbP)', 'AMD FreeSync, AMD FreeSync Premium, AMD FreeSync Premium Pro, Adaptive-Sync, NVIDIA G-SYNC Compatible, HDR (High Dynamic Range), Blue Light Filter, Picture-in-Picture (PiP), Picture-by-Picture (PbP)'],
  ['AMD FreeSync AMD FreeSync Premium AMD FreeSync Premium Pro NVIDIA G-SYNC Compatible (Uyumlu) HDR (High Dynamic Range) Titreşimi Azaltma (Flicker-free) Mavi Işık Filtresi (Blue Light Filter) Resim İçinde Resim (PiP) Resim Yanında Resim (PbP)', 'AMD FreeSync, AMD FreeSync Premium, AMD FreeSync Premium Pro, NVIDIA G-SYNC Compatible, HDR (High Dynamic Range), Flicker-Free, Blue Light Filter, Picture-in-Picture (PiP), Picture-by-Picture (PbP)'],
  ['Akıllı HDR 4 Dijital görüntü sabitleyici (EIS) f/2.0 Diyafram HDR Lens Düzeltme Otomatik Görüntü Stabilizasyonu Panorama Portre Modu Retina Flash Seri Çekim Modu True Tone Flash TrueDepth Camera Yüz Algılama 12 MP Ultra Geniş Açı', 'Smart HDR 4, Digital Image Stabilization (EIS), f/2.0 Aperture, HDR Lens Correction, Automatic Image Stabilization, Panorama, Portrait Mode, Retina Flash, Burst Mode, True Tone Flash, TrueDepth Camera, Face Detection, 12 MP Ultra-Wide Angle'],
  ['Ekrana Çift Dokunarak Açma (KnockON) Gürültü Önleyici 3 Mikrofon Kablosuz Şarj ile Başka Cihazları Şarj Edebilme Karanlık Mod (Dark Mode) Kısayol Tuşu (Kişiselleştirilebilir) Tek Elde Kullanım Modu Vapor-Chamber Soğutma Yüz Tanımlama', 'Double-Tap to Wake (KnockON), Noise-Cancelling 3 Microphones, Charge Other Devices via Wireless Charging, Dark Mode, Customizable Shortcut Key, One-Handed Mode, Vapor-Chamber Cooling, Face Recognition'],
  ['Ekstra Geniş Açı Makro (Macro) Çekim Otomatik Odaklama Phase Detect Auto-Focus (PDAF) Dijital görüntü sabitleyici (EIS) Ekstra Geniş Açı (115°) HDR Leica Optik Samsung ISOCELL JN5 Sensör 0.64um Piksel 1/2.75" Sensor Boyutu 6 Elementli Lens 14mm', 'Ultra-Wide Angle, Macro Shooting, Autofocus, Phase Detect Auto-Focus (PDAF), Digital Image Stabilization (EIS), Ultra-Wide Angle (115°), HDR, Leica Optics, Samsung ISOCELL JN5 Sensor, 0.64um Pixel, 1/2.75" Sensor Size, 6-Element Lens, 14mm'],
  ['Akıllı Telefon ile Kontrol Ekolayzır Powerbank Sesli Asistan Taşıma Askısı/Kulpu Zamanlayıcı Dahili Subwoofer Derin Bas Ekstra Bas Hoparlör Eşleştirme LED Gösterge Otomatik Kapanma Parti Modu Sesli Kontrol Soundcore BassUp Soundcore PartyCast 2.0 Suda Yüzer', 'Smartphone Control, Equalizer, Powerbank, Voice Assistant, Carry Strap/Handle, Timer, Built-in Subwoofer, Deep Bass, Extra Bass, Speaker Pairing, LED Indicator, Auto Power Off, Party Mode, Voice Control, Soundcore BassUp, Soundcore PartyCast 2.0, Floats on Water'],
  ['Uyarlanabilir Rota Algoritması Apple Watch Kontrolü Ayarlanabilir Şarj Zamanı Deep+ Papaslama Dolaşma Önleyen Rulo Fırça Geçici Temizlik Oda Bazında Emiş Gücü Ayarı Oda Bazında Mop Ayarı PreciSense Lidar Reaktif Teknoloji 4 Ayrı Haritalama 8 mm Mop Yükseltme', 'Adaptive Route Algorithm, Apple Watch Control, Adjustable Charging Time, Deep+ Mopping, Anti-Tangle Roller Brush, Temporary Cleaning, Room-by-Room Suction Power Adjustment, Room-by-Room Mop Adjustment, PreciSense LiDAR, Reactive Technology, 4 Separate Maps, 8 mm Mop Lifting'],
  ['Otomatik Odaklama Portre Modu Video Kayıtta Portre Modu HDR Sanal Flaş Video HDR Dolby Vision Gesture Shot Time-lapse (Hyperlapse) Zamanlayıcı (self-timer) Dijital görüntü sabitleyici (EIS) Sony IMX709 Sensör Video HDR 5 Elementli Lens 21mm 1080p @ 60fps Kayıt', 'Autofocus, Portrait Mode, Portrait Mode in Video Recording, HDR, Virtual Flash, Video HDR, Dolby Vision, Gesture Shot, Time-Lapse (Hyperlapse), Self-Timer, Digital Image Stabilization (EIS), Sony IMX709 Sensor, Video HDR, 5-Element Lens, 21mm, 1080p @ 60fps Recording'],
  ['Canon Oce Renkli Ofis Kağıdı (SAT213) Çift taraflı Mat kağıt (MP-101D) Düz Kağıt Kalın Kağıt Kart Koyu Renkli Kumaş Üzerine Ütülü Aktarımlar Mat Fotoğraf Kağıdı Mıknatıslı Fotoğraf Kağıdı Parlak Fotoğraf Kağıdı Pro Luster Fotoğraf Kağıdı Tişört Baskısı Yeniden Yapıştırılabilir Fotoğraf Kağıdı', 'Canon Oce Color Office Paper (SAT213), Double-Sided Matte Paper (MP-101D), Plain Paper, Thick Paper, Cardstock, Iron-On Transfers for Dark-Colored Fabric, Matte Photo Paper, Magnetic Photo Paper, Glossy Photo Paper, Pro Luster Photo Paper, T-Shirt Transfer, Restickable Photo Paper'],
  ['Periscope Zoom Telephoto Optik Görüntü Sabitleyici (OIS) Otomatik Odaklama Phase Detect Auto-Focus (PDAF) Değişken Diyafram (F2.4-F3.0) Mechanical Optical Zoom Optik Zoom (4.3x) Samsung ISOCELL HPE Sensor Telefoto Makro (30cm) 0.56μm Piksel 1/1.4" Sensör Boyutu 3G5P Lens 31.6°-25.4° Açılı 75mm 100mm', 'Periscope Zoom Telephoto, Optical Image Stabilization (OIS), Autofocus, Phase Detect Auto-Focus (PDAF), Variable Aperture (F2.4-F3.0), Mechanical Optical Zoom, Optical Zoom (4.3x), Samsung ISOCELL HPE Sensor, Telephoto Macro (30cm), 0.56μm Pixel, 1/1.4" Sensor Size, 3G5P Lens, 31.6°-25.4° Angle, 75mm, 100mm'],
  ['Acil Durum Araması (SOS)', 'Emergency Call (SOS)'],
  ['Acil Durum Bilgileri', 'Emergency Information'],
  ['Uluslararası Acil Arama', 'International Emergency Calling'],
  ['Konum Bilgisi Paylaşma', 'Location Information Sharing'],
  ['Canlı Konum Takibi', 'Live Location Tracking'],
  ['Geriye Dönük Konum Takibi', 'Backtrack Location Tracking'],
  ['Akıllı Ev Uyumu', 'Smart Home Compatibility'],
  ['UV İndeksi', 'UV Index'],
  ['Kaza Algılama', 'Crash Detection'],
  ['Acil Kayıt Sesli Kontrol 360° Dönebilme', 'Emergency Recording, Voice Control, 360° Rotation'],
  ['360° Dönebilme', '360° Rotation'],
  ['7/24 Çalışabilme', '24/7 Operation'],
  ['Çalışabilme', 'Operation'],
  ['Kullanıcı Arayüzü', 'User Interface'],
  ['Kullanıcı Seviyesi', 'User Level'],
  ['Kontrolcü Üzerinde', 'On Controller'],
  ['Çekim Özellikleri', 'Shooting Features'],
  ['Çekim', 'Shooting'],
  ['Vida Bağlantısı', 'Screw Mount'],
  ['Transistör Tipi', 'Transistor Type'],
  ['Transistör', 'Transistor'],
  ['LCD Ekran Özellikleri', 'LCD Display Features'],
  ['LCD Ekran', 'LCD Display'],
  ['MSI MPG 491CQPX QD-OLED Monitör', 'MSI MPG 491CQPX QD-OLED Monitor'],
  ['MSI MPG 341CQR QD-OLED X36 Monitör', 'MSI MPG 341CQR QD-OLED X36 Monitor'],
  ['Philips Evnia 49M2C8900/00 Monitör', 'Philips Evnia 49M2C8900/00 Monitor'],
  ['Monitör', 'Monitor'],
  ['AMD Wraith Stealth İşlemci Soğutucu', 'AMD Wraith Stealth CPU Cooler'],
  ['Thermalright Assassin X 120 Refined SE ARGB İşlemci Soğutucu', 'Thermalright Assassin X 120 Refined SE ARGB CPU Cooler'],
  ['Arctic Liquid Freezer III Pro 360 ARGB İşlemci Soğutucu', 'Arctic Liquid Freezer III Pro 360 ARGB CPU Cooler'],
  ['İşlemci Soğutucu', 'CPU Cooler'],
  ['Apple Watch Series 11 46mm Alüminyum Kasa ve Spor Kordon Akıllı Saat', 'Apple Watch Series 11 46mm Aluminum Case and Sport Band Smartwatch'],
  ['Alüminyum Kasa', 'Aluminum Case'],
  ['Spor Kordon', 'Sport Band'],
  ['Roborock S8 Pro Robot Süpürge+Mop', 'Roborock S8 Pro Robot Vacuum + Mop'],
  ['Dreame X40 Ultra Robot Süpürge+Mop Kullanım Kılavuzu', 'Dreame X40 Ultra Robot Vacuum + Mop User Manual'],
  ['Dreame X40 Ultra Robot Süpürge+Mop', 'Dreame X40 Ultra Robot Vacuum + Mop'],
  ['Roborock Q8 Max Pro Robot Süpürge+Mop', 'Roborock Q8 Max Pro Robot Vacuum + Mop'],
  ['Razer Barracuda X 2022 Kablosuz Kulaklık', 'Razer Barracuda X 2022 Wireless Headset'],
  ['Kulaklık', 'Headset'],
  ['Harman Ses Desteği', 'Harman Audio Support'],
  ['Ses Desteği', 'Audio Support'],
  ['DisplayPort 1.4 Üç Adet Thunderbolt 4', 'DisplayPort 1.4, Three Thunderbolt 4 Ports'],
  ['Üç Adet', 'Three'],
  ['Apple Neural Engine (ANE) 4 Çekirdekli', 'Apple Neural Engine (ANE), 4-Core'],
  ['Çip', 'Chip'],
  ['SMART Desteği LDPC ECC Motoru NVMe 1.4 PS5 Uyumlu', 'SMART Support, LDPC ECC Engine, NVMe 1.4, PS5 Compatible'],
  ['LDPC ECC Motoru', 'LDPC ECC Engine'],
  ['PS5 Uyumlu', 'PS5 Compatible'],
  ['NPC (Nano Gözenekli) SMC (Süper Çok Katmanlı)', 'NPC (Nano Porous), SMC (Super Multi-Layer)'],
  ['Nano Gözenekli', 'Nano Porous'],
  ['Süper Çok Katmanlı', 'Super Multi-Layer'],
  ['Fan Kontrol Düğmesi LCD Ekran', 'Fan Control Button, LCD Display'],
  ['Akıllı Telefon Tutucu Fan Kontrol Düğmesi LCD Ekran', 'Smartphone Holder, Fan Control Button, LCD Display'],
  ['SIM Çıkartma İğnesi USB Kablosu', 'SIM Eject Pin, USB Cable'],
  ['Bulut Depolama Hafıza Kartı NAS', 'Cloud Storage, Memory Card, NAS'],
  ['Bulut Depolama Hafıza Kartı', 'Cloud Storage, Memory Card'],
  ['İki Yönlü Sesli İletişim', 'Two-Way Voice Communication'],
  ['Sesli İletişim', 'Voice Communication'],
  ['İki Yönlü', 'Two-Way'],
  ['Görüntülü Konuşma (Uygulama)', 'Video Calling (App)'],
  ['Ön Kamera Video Çözünürlüğü', 'Front Camera Video Resolution'],
  ['Azami Video Kare Hızı', 'Maximum Video Frame Rate'],
  ['Azami Video Çözünürlüğü', 'Maximum Video Resolution'],
  ['Ses & Video Çözücüler', 'Audio & Video Decoders'],
  ['Çözücüler', 'Decoders'],
  ['Volt-Amper Değerleri', 'Volt-Ampere Values'],
  ['512/1TB Depolama seçeneği var', '512GB/1TB Storage option available'],
  ['256/512/1TB Depolama seçeneği var', '256GB/512GB/1TB Storage option available'],
  ['Dokunmatik Sürekli Açık (Always-On) Güneşte Görünür Safir Kristal', 'Touch, Always-On, Sunlight-Visible Sapphire Crystal'],
  ['Wi-Fi 4 (802.11 b/g/n) Apple U2 Çip Apple W3 Çip 2.4 GHz 5 GHz', 'Wi-Fi 4 (802.11 b/g/n), Apple U2 Chip, Apple W3 Chip, 2.4 GHz, 5 GHz'],
  ['Bluetooth Kablosuz Ses Akışı Google Asistan Otomatik Odaklama', 'Bluetooth Wireless Audio Streaming, Google Assistant, Autofocus'],
  ['Dolby Audio Google Asistan Otomatik Kapanma Otomatik Odaklama', 'Dolby Audio, Google Assistant, Auto Power Off, Autofocus'],
  ['Otomatik Odaklama', 'Autofocus'],
  ['Otomatik Kapanma', 'Auto Power Off'],
  ['Oynarken Şarj Etme', 'Play While Charging'],
  ['Dahili Hoparlör Dokunmatik Yüzey İvme Ölçer Jiroskop Oynarken Şarj Etme', 'Built-in Speaker, Touchpad, Accelerometer, Gyroscope, Play While Charging'],
  ['Suya ya da Toza Direnç Sınıfı', 'Water or Dust Resistance Rating'],
  ['İşletim Sistemi Versiyonu', 'Operating System Version'],
  ['Uyumlu İşl. Sis. Versiyonu', 'Compatible OS Version'],
  ['Uyumlu İşletim Sistemi', 'Compatible Operating System'],
  ['İşletim Sistemi Sürümü', 'Operating System Version'],
  ['İşletim Sistemi Desteği', 'Operating System Support'],
  ['Yapay Zeka İşlemcisi (NPU)', 'AI Processor (NPU)'],
  ['Yapay Zeka Hızlandırıcı', 'AI Accelerator'],
  ['Yapay Zeka (Ai) Desteği', 'AI Support'],
  ['Yapay Zeka (AI) Desteği', 'AI Support'],
  ['Yapay Zeka (AI)', 'AI'],
  ['Yapay Zeka (Ai)', 'AI'],
  ['Yapay Zeka', 'AI'],
  ['CPU Üretim Teknolojisi', 'CPU Process Technology'],
  ['CPU (İşlemci)', 'CPU (Processor)'],
  ['CPU Frekansı', 'CPU Frequency'],
  ['CPU Çekirdeği', 'CPU Core'],
  ['GPU Frekansı', 'GPU Frequency'],
  ['Grafik İşlemci (GPU)', 'Graphics Processor (GPU)'],
  ['Grafik İşleme Gücü', 'Graphics Processing Power'],
  ['NPU (Sinirsel İşlem Birimi) Adı', 'NPU Name'],
  ['NPU Diğer Özellikler', 'Other NPU Features'],
  ['Dahili Depolama Kapasitesi', 'Internal Storage Capacity'],
  ['Dahili Depolama Biçimi', 'Internal Storage Format'],
  ['Dahili Depolama Boyutu', 'Internal Storage Size'],
  ['Depolama Kapasitesi', 'Storage Capacity'],
  ['Depolama Teknolojisi', 'Storage Technology'],
  ['Depolama Arayüzü', 'Storage Interface'],
  ['Depolama Türü', 'Storage Type'],
  ['Arttırılabilir Bellek', 'Expandable Memory'],
  ['Mevcut Bellek Düzeni', 'Current Memory Layout'],
  ['Hafıza Kartı Maks. Kapasitesi', 'Max Memory Card Capacity'],
  ['Hafıza Kartı Kapasitesi', 'Memory Card Capacity'],
  ['Dahili Hafıza Kartı', 'Built-in Memory Card'],
  ['Hafıza Kartı Tipi', 'Memory Card Type'],
  ['Hafıza Kartı', 'Memory Card'],
  ['microSD Kart Okuyucu', 'microSD Card Reader'],
  ['SD Kart Okuyucu', 'SD Card Reader'],
  ['Kart Okuyucu Özellikleri', 'Card Reader Features'],
  ['Kart Okuyucu', 'Card Reader'],
  ['Parmak izi Okuyucu Özellikleri', 'Fingerprint Reader Features'],
  ['Parmak İzi Okuyucu Özellikleri', 'Fingerprint Reader Features'],
  ['Parmak izi Okuyucu', 'Fingerprint Reader'],
  ['Parmak İzi Okuyucu', 'Fingerprint Reader'],
  ['Ekran & Görüntü Özellikleri', 'Display & Image Features'],
  ['Ekran İçinde Ultrasonic Sensör', 'In-Display Ultrasonic Sensor'],
  ['Ekran Özellikleri', 'Display Features'],
  ['Ekran Ağırlığı (Standlı)', 'Display Weight (with Stand)'],
  ['Ekran Derinliği (Standlı)', 'Display Depth (with Stand)'],
  ['Ekran Genişliği (Standlı)', 'Display Width (with Stand)'],
  ['Ekran Yüksekliği (Standlı)', 'Display Height (with Stand)'],
  ['Ekran Ağırlığı', 'Display Weight'],
  ['Ekran Derinliği', 'Display Depth'],
  ['Ekran Genişliği', 'Display Width'],
  ['Ekran Yüksekliği', 'Display Height'],
  ['Ekran Oranı (Aspect Ratio)', 'Aspect Ratio'],
  ['Ekrana Çift Dokunarak Açma (KnockON)', 'Double-Tap to Wake (KnockON)'],
  ['Ön Çerçeve Tipi', 'Front Bezel Type'],
  ['Ön Çerçeve Rengi', 'Front Bezel Color'],
  ['Süper İnce Ön Çerçeve', 'Ultra-Thin Front Bezel'],
  ['İnce Çerçeve', 'Thin Bezel'],
  ['Çerçevesiz', 'Borderless'],
  ['Çerçeve Malzemesi', 'Frame Material'],
  ['Çerçeve Boyutu', 'Frame Size'],
  ['Çerçeve Rengi', 'Frame Color'],
  ['Gövde Malzemesi (Çerçeve)', 'Body Material (Frame)'],
  ['Gövde Malzemesi (Kapak)', 'Body Material (Cover)'],
  ['Gövde Ağırlık', 'Body Weight'],
  ['Magnezyum + Alüminyum Alaşım', 'Magnesium + Aluminum Alloy'],
  ['Magnezyum Alaşımlı Gövde', 'Magnesium Alloy Body'],
  ['Alüminyum + Güçlendirilmiş Plastik', 'Aluminum + Reinforced Plastic'],
  ['Alüminyum (Üst) Alüminyum (Alt)', 'Aluminum (Top) Aluminum (Bottom)'],
  ['Alüminyum Kaplamalı', 'Aluminum Coated'],
  ['Alüminyum Alaşım', 'Aluminum Alloy'],
  ['Nikel Kaplamalı Bakır', 'Nickel-Plated Copper'],
  ['Plastik (Cam Görünümlü)', 'Plastic (Glass-Look)'],
  ['Temperli Cam Çelik Ahşap', 'Tempered Glass, Steel, Wood'],
  ['Temperli Cam Çelik', 'Tempered Glass, Steel'],
  ['Ön Kamera Video Çözünürlüğü', 'Front Camera Video Resolution'],
  ['Ön Kamera Diyafram Açıklığı', 'Front Camera Aperture'],
  ['Ön Kamera Çözünürlüğü', 'Front Camera Resolution'],
  ['Ön Kamera Özellikleri', 'Front Camera Features'],
  ['İkinci Ön Kamera Özellikleri', 'Second Front Camera Features'],
  ['İkinci Ön Kamera', 'Second Front Camera'],
  ['Arka Kamera Çözünürlüğü', 'Rear Camera Resolution'],
  ['Arka Kamera Özellikleri', 'Rear Camera Features'],
  ['İkinci Arka Kamera Çözünürlüğü', 'Second Rear Camera Resolution'],
  ['İkinci Arka Kamera Özellikleri', 'Second Rear Camera Features'],
  ['İkinci Arka Kamera Diyafram', 'Second Rear Camera Aperture'],
  ['Üçüncü Arka Kamera Çözünürlüğü', 'Third Rear Camera Resolution'],
  ['Üçüncü Arka Kamera Özellikleri', 'Third Rear Camera Features'],
  ['Üçüncü Arka Kamera Diyafram (Maks)', 'Third Rear Camera Aperture (Max)'],
  ['Üçüncü Arka Kamera Diyafram', 'Third Rear Camera Aperture'],
  ['Dahili Kamera', 'Built-in Camera'],
  ['Takip Kamerası', 'Tracking Camera'],
  ['Göz Takip Kamerası', 'Eye-Tracking Camera'],
  ['İzleme Kamerası', 'Tracking Camera'],
  ['Karma Gerçeklik Kamerası', 'Mixed Reality Camera'],
  ['Kamera Lazer (LDS)', 'Camera Laser (LDS)'],
  ['Hareket Sensörü', 'Motion Sensor'],
  ['Yakınlık Sensörü', 'Proximity Sensor'],
  ['Optik Biyosensör', 'Optical Biosensor'],
  ['Vücut Sıcaklığı Sensörü', 'Body Temperature Sensor'],
  ['Kalp Atış Hızı Sensörü', 'Heart Rate Sensor'],
  ['Ortam Işığı Sensörü', 'Ambient Light Sensor'],
  ['Su Sıcaklığı Sensörü', 'Water Temperature Sensor'],
  ['Derinlik Sensörü', 'Depth Sensor'],
  ['Gürültü Sensörü', 'Noise Sensor'],
  ['Hall Sensörü', 'Hall Sensor'],
  ['İvmeölçer Sensörü', 'Accelerometer Sensor'],
  ['İvme Ölçer', 'Accelerometer'],
  ['İvmeölçer', 'Accelerometer'],
  ['Jiroskop Sensörü', 'Gyroscope Sensor'],
  ['Jiroskop', 'Gyroscope'],
  ['Barometre', 'Barometer'],
  ['Dijital Pusula', 'Digital Compass'],
  ['Pusula', 'Compass'],
  ['LiDAR Sensörü', 'LiDAR Sensor'],
  ['Dahili Hoparlör', 'Built-in Speaker'],
  ['Dahili Mikrofon', 'Built-in Microphone'],
  ['Dahili Subwoofer', 'Built-in Subwoofer'],
  ['Hoparlör Gücü (RMS)', 'Speaker Power (RMS)'],
  ['Hoparlör Sistemi', 'Speaker System'],
  ['Hoparlör Özelliği', 'Speaker Feature'],
  ['Hoparlör Eşleştirme', 'Speaker Pairing'],
  ['Hoparlör', 'Speaker'],
  ['Sürücü Sayısı (Tek Taraf)', 'Driver Count (Single Side)'],
  ['Sürücü Özellikleri', 'Driver Features'],
  ['Sürücü Yardımcısı', 'Driver Assistance'],
  ['Sürücü Çapı', 'Driver Diameter'],
  ['Sürücülü', 'Driver'],
  ['Dinamik Sürücülü', 'Dynamic Driver'],
  ['Hibrit Sürücülü', 'Hybrid Driver'],
  ['Planar Sürücülü', 'Planar Driver'],
  ['Mikrofon Frekansı (Düşük)', 'Microphone Frequency (Low)'],
  ['Mikrofon Frekansı (Yüksek)', 'Microphone Frequency (High)'],
  ['Mikrofon Yönü/Deseni', 'Microphone Direction/Pattern'],
  ['Mikrofon Özellikleri', 'Microphone Features'],
  ['Mikrofon Özelliği', 'Microphone Feature'],
  ['Mikrofon Sayısı', 'Microphone Count'],
  ['Masa Üstü Mikrofon', 'Desktop Microphone'],
  ['Yaka Mikrofonu', 'Lavalier Microphone'],
  ['Çıkarılabilir Mikrofon', 'Detachable Microphone'],
  ['Esnek Mikrofon', 'Flexible Microphone'],
  ['Mikrofon Kontrol', 'Microphone Control'],
  ['Mikrofon', 'Microphone'],
  ['Gürültü Engelleme', 'Noise Cancellation'],
  ['Gürültü Önleyici', 'Noise-Cancelling'],
  ['Gürültü Seviyesi (Ekonomik)', 'Noise Level (Eco)'],
  ['Gürültü Seviyesi (Güçlü)', 'Noise Level (Strong)'],
  ['Gürültü Seviyesi (max.)', 'Noise Level (max.)'],
  ['Gürültü Seviyesi', 'Noise Level'],
  ['Azami Dış Gürültü', 'Maximum External Noise'],
  ['Dahili Hoparlör Dokunmatik Yüzey', 'Built-in Speaker Touchpad'],
  ['Dokunmatik Yüzey', 'Touchpad'],
  ['Dokunmatik Sensör', 'Touch Sensor'],
  ['Dokunmatik', 'Touch'],
  ['Sürekli Açık (Always-On)', 'Always-On'],
  ['Çizilmeye Dirençli', 'Scratch Resistant'],
  ['Güneşte Görünür', 'Sunlight Visible'],
  ['Parlaklık Ayarı', 'Brightness Adjustment'],
  ['Safir Kristal', 'Sapphire Crystal'],
  ['Geniş Açılı OLED', 'Wide-Angle OLED'],
  ['Güçlendirilmiş Cam', 'Reinforced Glass'],
  ['Ion-X Cam', 'Ion-X Glass'],
  ['Retina Ekran', 'Retina Display'],
  ['E Ink Kaleido', 'E Ink Kaleido'],
  ['Karanlık Mod (Dark Mode)', 'Dark Mode'],
  ['Karanlık Mod', 'Dark Mode'],
  ['Ayarlanır Aydınlatma', 'Adjustable Lighting'],
  ['Aydınlatma', 'Lighting'],
  ['4 Bölgeli RGB', '4-Zone RGB'],
  ['RGB Bağlantısı', 'RGB Connection'],
  ['RGB LED Düğmesi', 'RGB LED Button'],
  ['LED Işık', 'LED Light'],
  ['LED Ekran', 'LED Display'],
  ['LED Gösterge', 'LED Indicator'],
  ['Pil Durumu Işığı', 'Battery Status Light'],
  ['Fabrika Renk Kalibrasyonu', 'Factory Color Calibration'],
  ['Mavi Işık Filtresi (Blue Light Filter)', 'Blue Light Filter'],
  ['TÜV Rheinland Low Blue Light (Hardware Solution)', 'TÜV Rheinland Low Blue Light (Hardware Solution)'],
  ['Yansımasız Yüzey', 'Anti-Glare Surface'],
  ['16 Seviye Gri Tonlama', '16-Level Grayscale'],
  ['Dijital Sinyal Frekansı (V)', 'Digital Signal Frequency (V)'],
  ['Dijital Görüntü Sabitleme (EIS)', 'Digital Image Stabilization (EIS)'],
  ['Dijital görüntü sabitleyici (EIS)', 'Digital Image Stabilization (EIS)'],
  ['Optik Görüntü Sabitleyici (OIS)', 'Optical Image Stabilization (OIS)'],
  ['Görüntü Sabitleme Seviyesi Düğmesi', 'Image Stabilization Level Button'],
  ['Görüntülü Konuşma (Uygulama)', 'Video Calling (App)'],
  ['Görüntü Biçimi', 'Image Format'],
  ['Azami Video Kare Hızı', 'Maximum Video Frame Rate'],
  ['Azami Video Çözünürlüğü', 'Maximum Video Resolution'],
  ['Ağır Çekim Kayıt Seçenekleri', 'Slow-Motion Recording Options'],
  ['Video Kayıt', 'Video Recording'],
  ['Yavaş Çekim', 'Slow Motion'],
  ['Yavaş Çekim (4K@100fps)', 'Slow Motion (4K@100fps)'],
  ['Dikey Çekim', 'Vertical Shooting'],
  ['Panoramik Çekim', 'Panoramic Shooting'],
  ['Ekstra Geniş Açı', 'Ultra-Wide Angle'],
  ['Geniş Açı', 'Wide Angle'],
  ['Makro (Macro) Çekim', 'Macro Shooting'],
  ['Portre Modu (Bokeh)', 'Portrait Mode (Bokeh)'],
  ['Portre Modu', 'Portrait Mode'],
  ['Sanal Flaş', 'Virtual Flash'],
  ['Sesle Komut', 'Voice Command'],
  ['Zamanlayıcı (self-timer)', 'Self-Timer'],
  ['Panorama Selfi', 'Panorama Selfie'],
  ['Açılı', 'Angle'],
  ['Optik Zoom', 'Optical Zoom'],
  ['Periscope Zoom Telephoto', 'Periscope Zoom Telephoto'],
  ['100x Dijital Zoom', '100x Digital Zoom'],
  ['Sensör Boyutu', 'Sensor Size'],
  ['Elementli Lens', 'Element Lens'],
  ['Yakınlaştırma Kilidi', 'Zoom Lock'],
  ['İçeride Yakınlaştırma', 'Internal Zoom'],
  ['Yakınlaştırma Oranı', 'Zoom Ratio'],
  ['Zoom (Yakınlaştırma)', 'Zoom'],
  ['Zoom (Değişken Odaklı)', 'Zoom (Variable Focal Length)'],
  ['Odak Mesafesi Sınırlayıcı', 'Focus Distance Limiter'],
  ['Netleme Tutma Düğmesi', 'Focus Hold Button'],
  ['Diyafram Açıklığı Düğmesi', 'Aperture Button'],
  ['Diyafram Sesi Düğmesi', 'Aperture Click Switch'],
  ['Diyafram Halkası', 'Aperture Ring'],
  ['Diyafram Açıklığı', 'Aperture'],
  ['Diyafram Bıçağı', 'Aperture Blade'],
  ['Düşük Dağılımlı Elemanlar', 'Low-Dispersion Elements'],
  ['Ekstra Düşük Dağılım', 'Extra-Low Dispersion'],
  ['Ultra Düşük Dağılım', 'Ultra-Low Dispersion'],
  ['Özel Düşük Dağılım', 'Special Low Dispersion'],
  ['Gelişmiş Asferik', 'Advanced Aspherical'],
  ['Asferik', 'Aspherical'],
  ['Netleme', 'Focus'],
  ['Programlanabilir Düğme', 'Programmable Button'],
  ['Tripod Bağlantısı', 'Tripod Mount'],
  ['Büyütme Oranı', 'Magnification Ratio'],
  ['Eleman Sayısı', 'Element Count'],
  ['Aynasız Kamera', 'Mirrorless Camera'],
  ['35mm Eşdeğer Uzaklık', '35mm Equivalent Focal Length'],
  ['Açık Derinlik', 'Open Depth'],
  ['Açık Genişlik', 'Open Width'],
  ['Açık Yükseklik', 'Open Height'],
  ['Açık (Kilitsiz)', 'Unlocked'],
  ['Kapalı Derinlik', 'Closed Depth'],
  ['Kapalı Genişlik', 'Closed Width'],
  ['Kapalı Yükseklik', 'Closed Height'],
  ['Azami Genişlik', 'Maximum Width'],
  ['Yük Kapasitesi', 'Load Capacity'],
  ['Çalışma Süresi', 'Runtime'],
  ['Kullanım Süresi (Azami)', 'Battery Life (Maximum)'],
  ['Kullanım Süresi (Genel)', 'Battery Life (General)'],
  ['Kullanım Süresi (Yoğun)', 'Battery Life (Heavy Use)'],
  ['Kullanım Süresi', 'Usage Time'],
  ['Kullanım Mesafesi', 'Operating Range'],
  ['Kullanım Alanı', 'Use Area'],
  ['Kullanım Amacı', 'Intended Use'],
  ['Kullanım Tipi', 'Usage Type'],
  ['Kullanım Kılavuzu (TR)', 'User Manual (TR)'],
  ['Kullanım Kılavuzu', 'User Manual'],
  ['Ürün Kodları', 'Product Codes'],
  ['Kutu İçeriği', 'Box Contents'],
  ['Ambalaj İçeriği', 'Package Contents'],
  ['Kutu Derinliği', 'Box Depth'],
  ['Kutu Genişliği', 'Box Width'],
  ['Kutu Yüksekliği', 'Box Height'],
  ['Kordon Ölçüsü', 'Band Size'],
  ['Ağırlık (Şarj Kutusu)', 'Weight (Charging Case)'],
  ['Batarya (Şarj Kutusu)', 'Battery (Charging Case)'],
  ['Batarya (Kulaklık)', 'Battery (Earbuds)'],
  ['Batarya Kapasitesi Notu', 'Battery Capacity Note'],
  ['Batarya Kapasitesi (Tipik)', 'Battery Capacity (Typical)'],
  ['Batarya Kapasitesi', 'Battery Capacity'],
  ['Batarya Özellikleri', 'Battery Features'],
  ['Batarya Teknolojisi', 'Battery Technology'],
  ['Az Kullanımda Batarya Ömrü', 'Battery Life with Light Use'],
  ['Ortalama Kullanımda Batarya Ömrü', 'Battery Life with Average Use'],
  ['Yoğun Kullanımda Batarya Ömrü', 'Battery Life with Heavy Use'],
  ['Değişir Batarya', 'Replaceable Battery'],
  ['Kapasitörlü Batarya', 'Capacitor Battery'],
  ['Çift Hücreli Batarya', 'Dual-Cell Battery'],
  ['Li-Po (Lityum-Polimer) Tümleşik', 'Integrated Li-Po (Lithium-Polymer)'],
  ['Lityum Polimer', 'Lithium Polymer'],
  ['Silicon-carbon', 'Silicon-Carbon'],
  ['Hızlı Şarj', 'Fast Charging'],
  ['Kablosuz Hızlı Şarj', 'Wireless Fast Charging'],
  ['Kablosuz Şarj ile Başka Cihazları Şarj Edebilme', 'Charge Other Devices via Wireless Charging'],
  ['Kablosuz Şarj Etme', 'Wireless Charging'],
  ['Kablosuz Şarj Desteği', 'Wireless Charging Support'],
  ['Şarj Süresi (Üretici Verisi)', 'Charging Time (Manufacturer Data)'],
  ['Şarj Zamanı', 'Charging Time'],
  ['Şarj Edebilme', 'Charging Capability'],
  ['Tam Şarj', 'Full Charge'],
  ['Dolum', 'Charge'],
  ['Giriş ve Çıkış Özellikli USB-C', 'USB-C with Input and Output'],
  ['Eş Zamanlı Şarj', 'Simultaneous Charging'],
  ['Eş Zamanlı 3 Cihaz Şarj Etme', 'Charge 3 Devices Simultaneously'],
  ['Eş Zamanlı 4 Cihaz Şarj Etme', 'Charge 4 Devices Simultaneously'],
  ['USB Güç Adaptörü', 'USB Power Adapter'],
  ['USB Kablosu', 'USB Cable'],
  ['USB-C Şarjlı Uzaktan Kumanda', 'USB-C Rechargeable Remote'],
  ['USB-C Thunderbolt Versiyonu', 'USB-C Thunderbolt Version'],
  ['USB-C Özellikleri', 'USB-C Features'],
  ['USB-C Versiyonu', 'USB-C Version'],
  ['USB-C Sayısı', 'USB-C Count'],
  ['USB Tip-C', 'USB Type-C'],
  ['USB Type-C Giriş', 'USB Type-C Input'],
  ['Type-C Güç Girişi', 'Type-C Power Input'],
  ['Yüksek Hızlı USB', 'High-Speed USB'],
  ['Yenileme Hızı (Gerçek)', 'Refresh Rate (Native)'],
  ['Yenileme Hızı (HDMI)', 'Refresh Rate (HDMI)'],
  ['Yenileme Hızı', 'Refresh Rate'],
  ['Tepki Süresi', 'Response Time'],
  ['Gecikme Süresi', 'Latency'],
  ['Örnekleme Frekansı', 'Sampling Frequency'],
  ['Örnekleme Derinliği', 'Sampling Depth'],
  ['Örnekleme Oranı', 'Sampling Rate'],
  ['Düşük Frekans (Bas)', 'Low Frequency (Bass)'],
  ['Yüksek Frekans (Tiz)', 'High Frequency (Treble)'],
  ['Frekans (Düşük)', 'Frequency (Low)'],
  ['Frekans (Yüksek)', 'Frequency (High)'],
  ['En Düşük Frekans', 'Lowest Frequency'],
  ['En Yüksek Frekans', 'Highest Frequency'],
  ['Çalışma Frekansı', 'Operating Frequency'],
  ['Bant Genişliği', 'Bandwidth'],
  ['Form Faktörü', 'Form Factor'],
  ['Tam Modüler', 'Fully Modular'],
  ['Modüler Olmayan', 'Non-Modular'],
  ['Hata Düzeltme', 'Error Correction'],
  ['OCP OPP OTP OVP SCP UVP 80+ Altın', 'OCP OPP OTP OVP SCP UVP 80+ Gold'],
  ['Altın', 'Gold'],
  ['Gümüş Gri', 'Silver Gray'],
  ['Pembe Altın', 'Rose Gold'],
  ['Siyah Gümüş Gri Pembe Altın', 'Black, Silver, Gray, Pink, Rose Gold'],
  ['Kırmızı', 'Red'],
  ['Yeşil', 'Green'],
  ['Türkçe', 'Turkish'],
  ['Kensington Kilidi', 'Kensington Lock'],
  ['Enerji Sınıfı', 'Energy Class'],
  ['Enerji Tüketimi (Ekonomik)', 'Energy Consumption (Eco)'],
  ['Tüketim (Bekleme Modu)', 'Consumption (Standby Mode)'],
  ['Akıllı Enerji Tasarrufu Sistemi', 'Smart Energy Saving System'],
  ['Güneş Enerjisi (Solar)', 'Solar Energy'],
  ['Güvenlik ve Koruma', 'Security and Protection'],
  ['Güvenlik Özellikleri', 'Security Features'],
  ['Güvenlik Standartları', 'Security Standards'],
  ['Akım Koruması', 'Current Protection'],
  ['Isı Koruması', 'Heat Protection'],
  ['Kısa Devre Koruması', 'Short-Circuit Protection'],
  ['Düşük Voltaj Koruması', 'Low Voltage Protection'],
  ['Düşük Güçte Şarj Modu', 'Low-Power Charging Mode'],
  ['Elektromanyetik Alan Koruması', 'Electromagnetic Field Protection'],
  ['Fazla Akım Koruması', 'Overcurrent Protection'],
  ['Fazla Deşarj (over-discharge) Koruması', 'Over-Discharge Protection'],
  ['Fazla Güç Koruması', 'Overpower Protection'],
  ['Fazla Şarj (over-charge) Koruması', 'Overcharge Protection'],
  ['Fazla Voltaj Koruması', 'Overvoltage Protection'],
  ['Sıcaklık Koruması', 'Temperature Protection'],
  ['Yeniden Kurma (Reset) Koruması', 'Reset Protection'],
  ['Dayanıklılık Standardı', 'Durability Standard'],
  ['Darbeye Dayanıklılık', 'Shock Resistance'],
  ['Darbelere Dayanıklılık', 'Shock Resistance'],
  ['Suya Dayanıklılık Özellikleri', 'Water Resistance Features'],
  ['Suya Dayanıklılık Özelliği', 'Water Resistance Feature'],
  ['Suya Dayanıklılık Seviyesi', 'Water Resistance Level'],
  ['Suya Dayanıklılık Türü', 'Water Resistance Type'],
  ['Suya Dayanıklılık', 'Water Resistance'],
  ['Sıçramaya Dayanıklı', 'Splash Resistant'],
  ['Toza Dayanıklılık Özellikleri', 'Dust Resistance Features'],
  ['Toza Dayanıklılık Özelliği', 'Dust Resistance Feature'],
  ['Toza Dayanıklılık Seviyesi', 'Dust Resistance Level'],
  ['Toza Dayanıklılık Türü', 'Dust Resistance Type'],
  ['Toza Dayanıklılık', 'Dust Resistance'],
  ['IP Koruma Sınıfı (Su)', 'IP Rating (Water)'],
  ['IP Koruma Sınıfı (Toz)', 'IP Rating (Dust)'],
  ['Düşme Direnci Sınıfı', 'Drop Resistance Rating'],
  ['Onarılabilirlik Sınıfı', 'Repairability Class'],
  ['SAR Değeri 10g (Baş)', 'SAR Value 10g (Head)'],
  ['SAR Değeri 10g (Vücut)', 'SAR Value 10g (Body)'],
  ['Kapsama Mesafesi', 'Coverage Distance'],
  ['Kapsama Alanı', 'Coverage Area'],
  ['MU-MIMO Kapsamı', 'MU-MIMO Coverage'],
  ['Şifreleme Türleri', 'Encryption Types'],
  ['Ebeveyn Kontrolü', 'Parental Control'],
  ['Uzaktan Yönetim Türü', 'Remote Management Type'],
  ['Uzaktan Yönetim', 'Remote Management'],
  ['Uzaktan Kontrol', 'Remote Control'],
  ['Bağlantı Teknolojisi', 'Connection Technology'],
  ['Bağlantı Arayüzü', 'Connection Interface'],
  ['Bağımsız Çalışabilme', 'Standalone Operation'],
  ['Kablosuz Subwoofer', 'Wireless Subwoofer'],
  ['Bluetooth ile Telefon Üzerinden', 'Via Phone over Bluetooth'],
  ['Bluetooth Kablosuz Ses Akışı', 'Bluetooth Wireless Audio Streaming'],
  ['VoWiFi (Wi-Fi Araması)', 'VoWiFi (Wi-Fi Calling)'],
  ['VoLTE (Voice over LTE) Desteği', 'VoLTE Support'],
  ['Wi-Fi Araması', 'Wi-Fi Calling'],
  ['Wi-Fi Display', 'Wi-Fi Display'],
  ['Wi-Fi Hotspot', 'Wi-Fi Hotspot'],
  ['Wi-Fi Direct', 'Wi-Fi Direct'],
  ['Multi-Link Operation (MLO)', 'Multi-Link Operation (MLO)'],
  ['MiraCast', 'Miracast'],
  ['Miracast', 'Miracast'],
  ['Çift Frekanslı GNSS', 'Dual-Frequency GNSS'],
  ['Navigasyon Özellikleri', 'Navigation Features'],
  ['GPS Özellikleri', 'GPS Features'],
  ['Google Asistan', 'Google Assistant'],
  ['Siri Asistan', 'Siri Assistant'],
  ['Bixby Asistan', 'Bixby Assistant'],
  ['Sesli Asistan Desteği', 'Voice Assistant Support'],
  ['Sesli Asistan Özelliği', 'Voice Assistant Feature'],
  ['Sesli Asistan', 'Voice Assistant'],
  ['Sesli Kontrol', 'Voice Control'],
  ['Ses ile TV Kontrolü', 'TV Control by Voice'],
  ['Ses Kontrol', 'Audio Control'],
  ['Ses Alma Sensörü (VPU)', 'Voice Pickup Sensor (VPU)'],
  ['Ses & Video Çözücüler', 'Audio & Video Decoders'],
  ['Ses / Kulaklık Çıkışı', 'Audio / Headphone Output'],
  ['Ses Özellikleri', 'Audio Features'],
  ['Ses Özelliği', 'Audio Feature'],
  ['Dijital Ses Çıkışı', 'Digital Audio Output'],
  ['Sesli Alarm', 'Audible Alarm'],
  ['Caydırıcı Sesli Alarm', 'Deterrent Audible Alarm'],
  ['Caydırıcı Spot Işığı', 'Deterrent Spotlight'],
  ['Anlık Bildirim', 'Instant Notification'],
  ['Uygulama Bildirimi', 'App Notification'],
  ['Hareket Algılama', 'Motion Detection'],
  ['Çarpışma Algılama', 'Collision Detection'],
  ['Halı Algılama', 'Carpet Detection'],
  ['Akü Voltaj İzleme', 'Battery Voltage Monitoring'],
  ['Akü Koruma Sistemi', 'Battery Protection System'],
  ['Yorgun Sürücü Uyarısı', 'Driver Fatigue Warning'],
  ['Ön Araç Hareket Uyarısı', 'Front Vehicle Movement Warning'],
  ['Aralıklı Kayıt', 'Interval Recording'],
  ['Atlamalı Video Kayıt', 'Time-Lapse Video Recording'],
  ['Acil Kayıt', 'Emergency Recording'],
  ['Araç İçi Yolcu Kaydı', 'In-Car Passenger Recording'],
  ['Aynasız Kamera', 'Mirrorless Camera'],
  ['Araç İçi Kamera', 'Dash Camera'],
  ['Akıllı Saat', 'Smartwatch'],
  ['Akıllı Telefon', 'Smartphone'],
  ['Akıllı Saat İle Kontrol', 'Control with Smartwatch'],
  ['Akıllı Telefon İle Kontrol', 'Control with Smartphone'],
  ['Akıllı Telefon ile Kontrol', 'Control with Smartphone'],
  ['Akıllı Telefon Tutucu', 'Smartphone Holder'],
  ['Telefon ile Kontrol', 'Control with Phone'],
  ['Telefon Kontrolü', 'Phone Control'],
  ['Telefon/Tablet Bilgisayar Oyun Konsolu', 'Phone/Tablet/Computer/Game Console'],
  ['Telefon/Tablet', 'Phone/Tablet'],
  ['Bilgisayar Oyun Konsolu', 'Computer/Game Console'],
  ['Oyun Konsolu', 'Game Console'],
  ['Oyun Kolu', 'Gamepad'],
  ['Oyun Modu', 'Game Mode'],
  ['Oyun modu', 'Game Mode'],
  ['Oyun', 'Gaming'],
  ['Yarış/Akrobasi/FPV', 'Racing/Acrobatics/FPV'],
  ['Havadan Görüntüleme', 'Aerial Imaging'],
  ['Engelden Kaçınma', 'Obstacle Avoidance'],
  ['Kaçınabildiği Engeller', 'Avoidable Obstacles'],
  ['Rüzgara Dirençli', 'Wind Resistant'],
  ['Rüzgar Direnci', 'Wind Resistance'],
  ['Havada Asılı Kalma', 'Hovering'],
  ['Otomatik İniş/Kalkış', 'Automatic Landing/Takeoff'],
  ['Avuçiçine İniş/Kalkış', 'Palm Takeoff/Landing'],
  ['El Hareketi ile Kontrol', 'Gesture Control'],
  ['Avuç İçi Hareketi', 'Palm Gesture'],
  ['Çift L Hareketi', 'Double-L Gesture'],
  ['V Hareketi', 'V Gesture'],
  ['Uzaktan Hareket Kontrolü', 'Remote Gesture Control'],
  ['Hızlı Açılma', 'Quick Launch'],
  ['Manyetik Tutucu', 'Magnetic Holder'],
  ['DJI OsmoAudio', 'DJI OsmoAudio'],
  ['DJI Mic Mini Mikrofon', 'DJI Mic Mini Microphone'],
  ['DJI Mic 3 Mikrofon', 'DJI Mic 3 Microphone'],
  ['Dahili Pompa Fanı', 'Built-in Pump Fan'],
  ['Kolay Montaj', 'Easy Installation'],
  ['Pompa Bağlantısı', 'Pump Connection'],
  ['Pompa Dönüş Hızı', 'Pump Speed'],
  ['Radyatör Desteği (Arka)', 'Radiator Support (Rear)'],
  ['Radyatör Desteği (Üst)', 'Radiator Support (Top)'],
  ['Radyatör Desteği (Ön)', 'Radiator Support (Front)'],
  ['Radyatör Kapasitesi', 'Radiator Capacity'],
  ['Radyatör Uzunluğu', 'Radiator Length'],
  ['Radyatör Genişliği', 'Radiator Width'],
  ['Radyatör Yüksekliği', 'Radiator Height'],
  ['Fan Boyutu (Büyük)', 'Fan Size (Large)'],
  ['Ana Fan Dönüş Hızı', 'Main Fan Speed'],
  ['Fan Kontrol Düğmesi', 'Fan Control Button'],
  ['Fanlı Soğutucu', 'Active Cooler'],
  ['Soğutma Güvenilir Platform Modülü', 'Cooling, Trusted Platform Module'],
  ['Vapor-Chamber Soğutma', 'Vapor-Chamber Cooling'],
  ['Vapor Chamber', 'Vapor Chamber'],
  ['Sıvı Metal Termal Takviyesi', 'Liquid Metal Thermal Enhancement'],
  ['Termal Takviyesi', 'Thermal Enhancement'],
  ['Akışkan Dinamik Rulmanlı', 'Fluid Dynamic Bearing'],
  ['Sleeve Rulmanlı', 'Sleeve Bearing'],
  ['Yükseklik Ayarı Ölçüsü', 'Height Adjustment Range'],
  ['Yükseklik Ayarı', 'Height Adjustment'],
  ['Yükseklik Kademesi', 'Height Level'],
  ['Laptop Ölçüsü (En Fazla)', 'Laptop Size (Maximum)'],
  ['Laptop Soğutucu', 'Laptop Cooler'],
  ['Kasa Fanı', 'Case Fan'],
  ['Bilgisayar Kasası', 'PC Case'],
  ['Ekran Kartı', 'Graphics Card'],
  ['Şarj Aleti', 'Charger'],
  ['Bluetooth Hoparlör', 'Bluetooth Speaker'],
  ['Medya Oynatıcı', 'Media Player'],
  ['Tam Kablosuz Kulaklık', 'True Wireless Earbuds'],
  ['Robot Süpürge+Mop Kullanım Kılavuzu', 'Robot Vacuum + Mop User Manual'],
  ['Robot Süpürge+Mop', 'Robot Vacuum + Mop'],
  ['Süpürme + Mop', 'Vacuuming + Mopping'],
  ['Mop Temizleme İstasyonu', 'Mop Cleaning Station'],
  ['Toz Boşaltma İstasyonu', 'Dust Emptying Station'],
  ['İstasyon Kirli Su Kapasitesi', 'Station Dirty Water Capacity'],
  ['İstasyon Temiz Su Kapasitesi', 'Station Clean Water Capacity'],
  ['İstasyon Toz Kapasitesi', 'Station Dust Capacity'],
  ['Derinlik (İstasyon)', 'Depth (Station)'],
  ['Yükseklik (İstasyon)', 'Height (Station)'],
  ['En (İstasyon)', 'Width (Station)'],
  ['Oda Sınırlandırma', 'Room Restriction'],
  ['Haritalama Yöntemi', 'Mapping Method'],
  ['Oda Bazında Emiş Gücü Ayarı', 'Room-by-Room Suction Power Adjustment'],
  ['Oda Bazında Mop Ayarı', 'Room-by-Room Mop Adjustment'],
  ['Ayarlanabilir Şarj Zamanı', 'Adjustable Charging Time'],
  ['Uyarlanabilir Rota Algoritması', 'Adaptive Route Algorithm'],
  ['Geçici Temizlik', 'Temporary Cleaning'],
  ['Dolaşma Önleyen Rulo Fırça', 'Anti-Tangle Roller Brush'],
  ['Kauçuk Fırça', 'Rubber Brush'],
  ['Halı Algılama', 'Carpet Detection'],
  ['Otomatik Yazılım Güncelleme', 'Automatic Software Update'],
  ['Mop Yükseltme', 'Mop Lifting'],
  ['Paspas', 'Mop'],
  ['Papaslama', 'Mopping'],
  ['Aşılabilir Yükseklik', 'Climbable Height'],
  ['Sert Zemin+Halı', 'Hard Floor + Carpet'],
  ['Yan Fırça Sayısı', 'Side Brush Count'],
  ['Emiş Gücü', 'Suction Power'],
  ['Tarayıcı', 'Browser'],
  ['Web Tarayıcısı', 'Web Browser'],
  ['Web Tarayıcı', 'Web Browser'],
  ['Google Play Store Web Tarayıcı', 'Google Play Store, Web Browser'],
  ['Smart Hub Web Tarayıcı', 'Smart Hub Web Browser'],
  ['Smart TV Uygulamaları', 'Smart TV Apps'],
  ['Smart TV Özellikleri', 'Smart TV Features'],
  ['Popüler Uygulamalar', 'Popular Apps'],
  ['Servis ve Uygulamalar', 'Services and Apps'],
  ['Servisler ve Uygulamalar', 'Services and Apps'],
  ['Uygulama Yükleyebilme', 'App Installation'],
  ['Mobil Uygulama Desteği', 'Mobile App Support'],
  ['Otomatik Mobil Uygulama İle', 'Automatically via Mobile App'],
  ['Android Uyumu', 'Android Compatibility'],
  ['iOS Uyumu', 'iOS Compatibility'],
  ['Windows Uyumu', 'Windows Compatibility'],
  ['Mac Uyumu', 'Mac Compatibility'],
  ['Chromebook Uyumu', 'Chromebook Compatibility'],
  ['Çoklu Ekran Yansıtma', 'Multi-Screen Mirroring'],
  ['Desteklenen Çözünürlükler (HDMI)', 'Supported Resolutions (HDMI)'],
  ['VESA Duvar Montaj Desteği', 'VESA Wall Mount Support'],
  ['Duvar rengine uyarlanma', 'Wall Color Adaptation'],
  ['4 Taraflı', '4-Sided'],
  ['Tasarım Özellikleri', 'Design Features'],
  ['İkili Ayak (Düz)', 'Dual Stand (Flat)'],
  ['Stand (Ayak) Tipi', 'Stand Type'],
  ['Arka Kapak Rengi', 'Rear Cover Color'],
  ['Genişlik (Uydu)', 'Width (Satellite)'],
  ['Yükseklik (Uydu)', 'Height (Satellite)'],
  ['Genişlik (Subwoofer)', 'Width (Subwoofer)'],
  ['Yükseklik (Subwoofer)', 'Height (Subwoofer)'],
  ['Subwoofer Özellikleri', 'Subwoofer Features'],
  ['Derin Bas', 'Deep Bass'],
  ['Ekstra Bas', 'Extra Bass'],
  ['Güçlü Bas', 'Powerful Bass'],
  ['Zengin Bas', 'Rich Bass'],
  ['Dolby Bas Güçlendirme', 'Dolby Bass Enhancement'],
  ['Dolby Ses Sabitleyicisi', 'Dolby Volume Leveler'],
  ['A.I. Sound', 'A.I. Sound'],
  ['Ses Geliştirme', 'Audio Enhancement'],
  ['LG WOW Arayüzü', 'LG WOW Interface'],
  ['LG WOW Orkestra', 'LG WOW Orchestra'],
  ['LG AI Sound Pro', 'LG AI Sound Pro'],
  ['LG ThinQ', 'LG ThinQ'],
  ['Soundcore BassUp', 'Soundcore BassUp'],
  ['Soundcore PartyCast', 'Soundcore PartyCast'],
  ['Parti Modu', 'Party Mode'],
  ['Suda Yüzer', 'Floats on Water'],
  ['Taşıma Askısı/Kulpu', 'Carry Strap/Handle'],
  ['Sürdürülebilir Ürün', 'Sustainable Product'],
  ['iF Tasarım Ödülü', 'iF Design Award'],
  ['Ekolayzır Modu', 'Equalizer Mode'],
  ['Ekolayzır', 'Equalizer'],
  ['Ortam Sesi Modu', 'Ambient Sound Mode'],
  ['Kulaklığımı Bul', 'Find My Earbuds'],
  ['Eş Zamanlı Çeviri (Tercüman)', 'Real-Time Translation (Interpreter)'],
  ['Hızlı Otomatik Cihaz Geçişi', 'Fast Automatic Device Switching'],
  ['Kafa Hareketleri ile Kontrol', 'Control with Head Gestures'],
  ['Kafa Takibi', 'Head Tracking'],
  ['Konuşma Algılama', 'Speech Detection'],
  ['Siren Sesi Algılama', 'Siren Sound Detection'],
  ['Ayarlanabilir Kafa Bandı', 'Adjustable Headband'],
  ['Kafa Bandı Yastığı', 'Headband Cushion'],
  ['Değişebilir Kulak Yastığı', 'Replaceable Ear Cushion'],
  ['Hafızalı Kulak Yastığı', 'Memory Foam Ear Cushion'],
  ['Tekstil Kulak Yastığı', 'Fabric Ear Cushion'],
  ['Kulaklık Çıkış (3.5mm)', 'Headphone Output (3.5mm)'],
  ['AUX (Kulaklık)', 'AUX (Headphones)'],
  ['Çağrı Kontrol', 'Call Control'],
  ['Müzik Kontrol', 'Music Control'],
  ['Yapay Zeka (AI) ENC', 'AI ENC'],
  ['Tek Yönlü (Cardioid)', 'Unidirectional (Cardioid)'],
  ['Cardioid (Tek Yönlü)', 'Cardioid (Unidirectional)'],
  ['Çok Yönlü (Omnidirectional)', 'Omnidirectional'],
  ['Omnidirectional (Çok Yönlü)', 'Omnidirectional'],
  ['Stereo Çift Hoparlör', 'Stereo Dual Speaker'],
  ['7.1 Sanal Çevresel Ses', '7.1 Virtual Surround Sound'],
  ['Windows Sonic', 'Windows Sonic'],
  ['Yüksek Hızlı ve Sessiz', 'High-Speed and Silent'],
  ['Hızlı ve Sessiz', 'Fast and Silent'],
  ['Sanal Gerçeklik (VR) Artırılmış Gerçeklik (AR)', 'Virtual Reality (VR), Augmented Reality (AR)'],
  ['Sanal Gerçeklik (VR)', 'Virtual Reality (VR)'],
  ['Göz Başına Çözünürlük', 'Resolution per Eye'],
  ['Gözlük ile Kullanabilme', 'Usable with Glasses'],
  ['Göz Bebeği Mesafesi (IPD)', 'Interpupillary Distance (IPD)'],
  ['6 Eksen Takibi (6DOF)', '6-Axis Tracking (6DOF)'],
  ['Artırılmış Gerçeklik (AR)', 'Augmented Reality (AR)'],
  ['Takip Et', 'Follow'],
  ['Düşme Efekti (Asteroid)', 'Drop Effect (Asteroid)'],
  ['Küresel Panorama', 'Spherical Panorama'],
  ['Manuel', 'Manual'],
  ['Dikey', 'Vertical'],
  ['Düşük Dağılımlı Elemanlar', 'Low-Dispersion Elements'],
  ['Manzara Vahşi Yaşam Spor', 'Landscape, Wildlife, Sports'],
  ['Manzara Portre Günlük/Sokak', 'Landscape, Portrait, Daily/Street'],
  ['Portre Günlük/Sokak Seyahat', 'Portrait, Daily/Street, Travel'],
  ['Vahşi Yaşam', 'Wildlife'],
  ['Günlük/Sokak', 'Daily/Street'],
  ['Seyahat', 'Travel'],
  ['Manzara', 'Landscape'],
  ['Portre', 'Portrait'],
  ['Spor', 'Sports'],
  ['Sağlık Takibi', 'Health Tracking'],
  ['Kalp Ritmi Takibi', 'Heart Rhythm Tracking'],
  ['Kandaki Oksijen Takibi', 'Blood Oxygen Tracking'],
  ['Uyku Takibi', 'Sleep Tracking'],
  ['Kalori Takibi', 'Calorie Tracking'],
  ['Vücut Sıcaklığı Takibi', 'Body Temperature Tracking'],
  ['Kadın Sağlığı Takibi', 'Women\'s Health Tracking'],
  ['Uyku Koçu', 'Sleep Coach'],
  ['Enerji Skoru', 'Energy Score'],
  ['Adımsayar', 'Step Counter'],
  ['Adım Sayar', 'Step Counter'],
  ['Mesafe Ölçümü', 'Distance Measurement'],
  ['Mesafe Ölçer', 'Distance Meter'],
  ['Aktivite Takibi ve Geçmişi', 'Activity Tracking and History'],
  ['Hava Durumu', 'Weather'],
  ['Kronometre', 'Stopwatch'],
  ['Çoklu Spor Modu', 'Multi-Sport Mode'],
  ['Akıllı Spor Modu', 'Smart Sport Mode'],
  ['Akıllı Koç', 'Smart Coach'],
  ['Fonksiyonel Eşik Gücü (FTP)', 'Functional Threshold Power (FTP)'],
  ['Golf Parkuru Haritası', 'Golf Course Map'],
  ['Hedef Belirleme', 'Goal Setting'],
  ['Rota (Parkur) Takibi', 'Route Tracking'],
  ['Rota Takibi', 'Route Tracking'],
  ['Geri Dönüş Rotası', 'Return Route'],
  ['Deniz Suyu Sıcaklığı Bilgileri', 'Sea Water Temperature Information'],
  ['Hız Ölçer', 'Speedometer'],
  ['Rüzgar Bilgileri', 'Wind Information'],
  ['Sanal Antreman Partneri', 'Virtual Training Partner'],
  ['Yüzme (Havuz)', 'Swimming (Pool)'],
  ['Yüzme (Deniz)', 'Swimming (Open Water)'],
  ['Eliptik Bisiklet', 'Elliptical'],
  ['Kürek Çekme', 'Rowing'],
  ['İp Atlama', 'Jump Rope'],
  ['Dayanıklılık/Güç', 'Endurance/Strength'],
  ['Kuvvet Egzersizleri', 'Strength Training'],
  ['Dövüş Sporları', 'Combat Sports'],
  ['Paten/Buz Pateni', 'Skating/Ice Skating'],
  ['Yelkencilik', 'Sailing'],
  ['Atlayış', 'Jumping'],
  ['Dalış', 'Diving'],
  ['Koşu', 'Running'],
  ['Bisiklet', 'Cycling'],
  ['Yürüyüş', 'Walking'],
  ['Tırmanış', 'Climbing'],
  ['Yüzme', 'Swimming'],
  ['Fitness', 'Fitness'],
  ['Yoga', 'Yoga'],
  ['Futbol', 'Football'],
  ['Kayak', 'Skiing'],
  ['Kardiyo', 'Cardio'],
  ['Merdiven Tırmanma', 'Stair Climbing'],
  ['Golf', 'Golf'],
  ['Pilates', 'Pilates'],
  ['Snowboard', 'Snowboard'],
  ['Dans', 'Dance'],
  ['Tenis', 'Tennis'],
  ['Basketbol', 'Basketball'],
  ['HIIT', 'HIIT'],
  ['Zikirmatik', 'Prayer Counter'],
  ['Kişisel Gelişim Koçu', 'Personal Development Coach'],
  ['Yüksek Çözünürlüklü Kağıt', 'High-Resolution Paper'],
  ['Tebrik Kartları', 'Greeting Cards'],
  ['Ütü Baskılı Uygulamalar', 'Iron-On Transfers'],
  ['Koyu Renkli Kumaş Üzerine', 'On Dark-Colored Fabric'],
  ['Fotoğraf Kağıdı', 'Photo Paper'],
  ['Düz Kağıt', 'Plain Paper'],
  ['Çift taraflı Mat kağıt', 'Double-Sided Matte Paper'],
  ['Mat kağıt', 'Matte Paper'],
  ['Zarf', 'Envelope'],
  ['Çerçevesiz 10 x 15 cm 45 Saniyede Baskı', 'Borderless 10 x 15 cm Print in 45 Seconds'],
  ['45 Saniyede Baskı', 'Print in 45 Seconds'],
  ['Dönüştürerek', 'Converted'],
  ['Korumasız Mobi', 'Unprotected Mobi'],
  ['Özgün', 'Original'],
  ['Farklı Yazı Tipleri', 'Different Fonts'],
  ['Yazıcı', 'Printer'],
  ['Mürekkepli', 'Inkjet'],
  ['Dosya Uzantısı', 'File Extension'],
  ['Kesinti Sonrası İşlem', 'Action After Interruption'],
  ['X-Y Eksen Yapısı', 'X-Y Axis Structure'],
  ['Işık Kaynağı', 'Light Source'],
  ['Projeksiyon Sistemi', 'Projection System'],
  ['Yansıtma Boyutu', 'Projection Size'],
  ['Lamba Ömrü (Ekonomik)', 'Lamp Life (Eco)'],
  ['Parlaklık (ANSI)', 'Brightness (ANSI)'],
  ['Parlaklık (Maks)', 'Brightness (Max)'],
  ['Parlaklık (Tipik)', 'Brightness (Typical)'],
  ['Azami Parlaklık', 'Maximum Brightness'],
  ['Kontrast Oranı (Statik)', 'Contrast Ratio (Static)'],
  ['İzleme Açısı Dikey (V)', 'Viewing Angle Vertical (V)'],
  ['İzleme Açısı Yatay (H)', 'Viewing Angle Horizontal (H)'],
  ['Tilt Aralığı (-)', 'Tilt Range (-)'],
  ['Tilt Aralığı (+)', 'Tilt Range (+)'],
  ['Roll Aralığı (-)', 'Roll Range (-)'],
  ['Roll Aralığı (+)', 'Roll Range (+)'],
  ['Pan Aralığı (-)', 'Pan Range (-)'],
  ['Pan Aralığı (+)', 'Pan Range (+)'],
  ['Swivel Aralığı (-)', 'Swivel Range (-)'],
  ['Swivel Aralığı (+)', 'Swivel Range (+)'],
  ['Yukarı-Aşağı Eğme (Tilt)', 'Up-Down Tilt'],
  ['Sağa-Sola Döndürme (Swivel)', 'Left-Right Swivel'],
  ['Yatay-Dikey Döndürme (Pivot)', 'Landscape-Portrait Pivot'],
  ['Direksiyon Dönüş Açısı', 'Steering Wheel Rotation Angle'],
  ['Ayarlanabilir Dönüş Açısı', 'Adjustable Rotation Angle'],
  ['Değiştirilebilir Düğme', 'Replaceable Button'],
  ['Ek Fonksiyon Düğmesi (Yuvası)', 'Extra Function Button (Slot)'],
  ['Kontrolcü Üzerinde', 'On Controller'],
  ['Kumanda İşlevi', 'Remote Function'],
  ['Kumanda Tipi', 'Remote Type'],
  ['Hareket sensörlü ve USB-C Şarjlı Uzaktan Kumanda', 'Motion-Sensing USB-C Rechargeable Remote'],
  ['Ses ile TV Kontrolü', 'TV Control by Voice'],
  ['Yatay-Dikey', 'Horizontal-Vertical'],
  ['Dijital', 'Digital'],
  ['Analog Alıcı', 'Analog Tuner'],
  ['Uydu Alıcı', 'Satellite Tuner'],
  ['Karasal Alıcı', 'Terrestrial Tuner'],
  ['Kanal Yapısı', 'Channel Configuration'],
  ['Disk Oynatıcı', 'Disc Player'],
  ['Disk Yuvası (2.5)', 'Drive Bay (2.5)'],
  ['Disk Yuvası (3.5)', 'Drive Bay (3.5)'],
  ['Sabit Disk (HDD) Hızı', 'Hard Disk (HDD) Speed'],
  ['Sabit Disk (HDD) Boyutu', 'Hard Disk (HDD) Size'],
  ['Kapladığı Alan', 'Footprint'],
  ['Tümleşik Adet', 'Integrated Count'],
  ['Klavye & Mouse', 'Keyboard & Mouse'],
  ['Klavye Arka Aydınlatması', 'Keyboard Backlight'],
  ['Klavye Özellikleri', 'Keyboard Features'],
  ['SteelSeries (Özel Oyuncu Tuşları)', 'SteelSeries (Special Gaming Keys)'],
  ['Özel Oyuncu Tuşları', 'Special Gaming Keys'],
  ['Sparsity Desteği', 'Sparsity Support'],
  ['Windows Studio Effects Desteği', 'Windows Studio Effects Support'],
  ['FHD Kızılötesi HDR 3D Gürültü Engelleme (3DNR+)', 'FHD Infrared HDR 3D Noise Reduction (3DNR+)'],
  ['Windows Hello Desteği (Yüz Tanıma)', 'Windows Hello Support (Face Recognition)'],
  ['Web Kamera Kilidi', 'Webcam Privacy Shutter'],
  ['Güvenilir Platform Modülü TPM 2.0 (Yazılım)', 'Trusted Platform Module TPM 2.0 (Firmware)'],
  ['Microsoft Pluton Security', 'Microsoft Pluton Security'],
  ['Yüz Tanımlama (3D)', '3D Face Recognition'],
  ['Yüz Tanımlama', 'Face Recognition'],
  ['Sanal RAM Artırma', 'Virtual RAM Expansion'],
  ['Kısayol Tuşu (Kişiselleştirilebilir)', 'Customizable Shortcut Key'],
  ['Tek Elde Kullanım Modu', 'One-Handed Mode'],
  ['Air Gesture', 'Air Gesture'],
  ['Bypass Charge', 'Bypass Charging'],
  ['SIM Çıkartma İğnesi', 'SIM Eject Pin'],
  ['Şeffaf Arka Kapak Kılıfı', 'Transparent Back Cover Case'],
  ['Arka Plaka', 'Backplate'],
  ['Arka Kapak', 'Back Cover'],
  ['AUX İşlevi', 'AUX Function'],
  ['PCIe x16 Azami Hızı', 'PCIe x16 Maximum Speed'],
  ['PCIe x16 Versiyonu', 'PCIe x16 Version'],
  ['PCIe x16 Sayısı', 'PCIe x16 Count'],
  ['Windows 11 Desteği', 'Windows 11 Support'],
  ['Hız Aşırtma (Overclock) Desteği', 'Overclocking Support'],
  ['Panel Bağlantı Noktası', 'Panel Connector'],
  ['Çoklu GPU', 'Multi-GPU'],
  ['Sunucu Anakartı', 'Server Motherboard'],
  ['TPM Başlığı', 'TPM Header'],
  ['Hızlı Montaj', 'Quick Installation'],
  ['m.2 Hızlı Montaj', 'M.2 Quick Installation'],
  ['PCIe Hızlı Montaj', 'PCIe Quick Installation'],
  ['ECC Bellek Desteği', 'ECC Memory Support'],
  ['Düşük Voltaj', 'Low Voltage'],
  ['Çift BIOS', 'Dual BIOS'],
  ['Eksen', 'Axis'],
  ['0dB', '0dB'],
  ['Harici Disk Desteği', 'External Drive Support'],
  ['Genişletilebilir Depolama Alanı', 'Expandable Storage'],
  ['Gelişmiş Işın İzleme', 'Advanced Ray Tracing'],
  ['Işın İzleme', 'Ray Tracing'],
  ['Değişken Hız Gölgeleme (VSR)', 'Variable Rate Shading (VRS)'],
  ['4K UHD Blu-ray Sürücü', '4K UHD Blu-ray Drive'],
  ['Kablosuz Ses Kaydı', 'Wireless Audio Recording'],
  ['Ses Kaydı', 'Audio Recording'],
  ['Time Lapse Desteği', 'Time-Lapse Support'],
  ['Anlık Görüntü Aktarımı', 'Live Image Transfer'],
  ['Konumlandırma Sistemi', 'Positioning System'],
  ['Titreşim Engelleme Türü', 'Vibration Stabilization Type'],
  ['Titreşim Engelleyici', 'Vibration Stabilizer'],
  ['Titreşim Engelleme', 'Vibration Stabilization'],
  ['Titreşimi Azaltma (Flicker-free)', 'Flicker-Free'],
  ['Uçuş Süresi', 'Flight Time'],
  ['Yüksek Frekans', 'High Frequency'],
  ['Düşük Frekans', 'Low Frequency'],
  ['Ağırlık Seçenekleri', 'Weight Options'],
  ['Ağırlık (Asgari)', 'Weight (Minimum)'],
  ['Kalınlık (Asgari)', 'Thickness (Minimum)'],
  ['Genişlik', 'Width'],
  ['Yükseklik', 'Height'],
  ['Derinlik', 'Depth'],
  ['Ağırlık', 'Weight'],
  ['Azami Hız', 'Maximum Speed'],
  ['Azami', 'Maximum'],
  ['Asgari', 'Minimum'],
  ['Yükseklik (Subwoofer)', 'Height (Subwoofer)'],
  ['Genişlik (Subwoofer)', 'Width (Subwoofer)'],
  ['Yükseklik (Uydu)', 'Height (Satellite)'],
  ['Genişlik (Uydu)', 'Width (Satellite)'],
  ['PassMark Puanı', 'PassMark Score'],
  ['AnTuTu Puanı (v10)', 'AnTuTu Score (v10)'],
  ['AnTuTu Puanı (v11)', 'AnTuTu Score (v11)'],
  ['Volt-Amper Değerleri', 'Volt-Ampere Values'],
  ['Önerilen Sistem Gücü', 'Recommended System Power'],
  ['Yüksek Hızlı', 'High-Speed'],
  ['Yüksek', 'High'],
  ['Düşük', 'Low'],
  ['Giriş', 'Input'],
  ['Çıkış', 'Output'],
  ['Başlangıç', 'Start'],
  ['Çift Hat Özelliği', 'Dual SIM Feature'],
  ['Çift Hat', 'Dual SIM'],
  ['Çift El', 'Two-Handed'],
  ['Çift taraflı', 'Double-Sided'],
  ['Çift', 'Dual'],
  ['Tek Yönlü', 'Unidirectional'],
  ['Çok Yönlü', 'Omnidirectional'],
  ['Tek Modül', 'Single Module'],
  ['2li Modül', 'Dual Module'],
  ['Dış Kasa Malzemesi', 'External Case Material'],
  ['Dış Kasa', 'External Case'],
  ['Kartuş', 'Cartridge'],
  ['Raylı', 'Rail-Mounted'],
  ['Kapalı', 'Closed'],
  ['Işıklı', 'Illuminated'],
  ['Açık', 'Open'],
  ['Düz (Flat)', 'Flat'],
  ['Düz', 'Flat'],
  ['Geriye', 'Reverse'],
  ['Alt Ön', 'Front Bottom'],
  ['Üst Sağ Sol Alt Arka Ön', 'Top Right Left Bottom Rear Front'],
  ['Üst', 'Top'],
  ['Sağ', 'Right'],
  ['Sol', 'Left'],
  ['Alt', 'Bottom'],
  ['Arka', 'Rear'],
  ['Ön', 'Front'],
  ['ve', 'and'],
  ['ile', 'with'],
  ['İle', 'with'],
  ['ya da', 'or'],
  ['Kablosuz', 'Wireless'],
  ['Kablolu', 'Wired'],
  ['Desteklenen', 'Supported'],
  ['Desteği', 'Support'],
  ['Uyumlu', 'Compatible'],
  ['Uyumu', 'Compatibility'],
  ['Özellikleri', 'Features'],
  ['Özelliği', 'Feature'],
  ['Türleri', 'Types'],
  ['Türü', 'Type'],
  ['Tipi', 'Type'],
  ['Sayısı', 'Count'],
  ['Adedi', 'Count'],
  ['Kapasitesi', 'Capacity'],
  ['Sınıfı', 'Class'],
  ['Standardı', 'Standard'],
  ['Standartı', 'Standard'],
  ['Teknolojisi', 'Technology'],
  ['Arayüzü', 'Interface'],
  ['Sürümü', 'Version'],
  ['Versiyonu', 'Version'],
  ['Çözünürlüğü', 'Resolution'],
  ['Frekansı', 'Frequency'],
  ['Hızı', 'Speed'],
  ['Gücü', 'Power'],
  ['Süresi', 'Time'],
  ['Ömrü', 'Life'],
  ['Oranı', 'Ratio'],
  ['Bıçağı', 'Blade'],
  ['Açıklığı', 'Aperture'],
  ['Malzemesi', 'Material'],
  ['Rengi', 'Color'],
  ['Biçimi', 'Format'],
  ['Yöntemi', 'Method'],
  ['Alanı', 'Area'],
  ['Amacı', 'Purpose'],
  ['Değeri', 'Value'],
  ['Değerleri', 'Values'],
  ['Yapısı', 'Structure'],
  ['İşlevi', 'Function'],
  ['İşlem', 'Process'],
  ['Sistemi', 'System'],
  ['Açma', 'Wake'],
  ['Baskı', 'Print'],
  ['Kayıt', 'Recording'],
  ['Kontrolü', 'Control'],
  ['Kontrol', 'Control'],
  ['Yönetim', 'Management'],
  ['Koruma', 'Protection'],
  ['Koruması', 'Protection'],
  ['Takibi', 'Tracking'],
  ['Takip', 'Tracking'],
  ['Ölçümü', 'Measurement'],
  ['Ölçer', 'Meter'],
  ['Okuyucu', 'Reader'],
  ['Alıcı', 'Receiver'],
  ['Tümleşik', 'Integrated'],
  ['Dahili', 'Built-in'],
  ['Harici', 'External'],
  ['Otomatik', 'Automatic'],
  ['Manyetik', 'Magnetic'],
  ['Mobil', 'Mobile'],
  ['Bulut', 'Cloud'],
  ['Temiz Su', 'Clean Water'],
  ['Kirli Su', 'Dirty Water'],
  ['Sıcaklığı', 'Temperature'],
  ['Sıcaklık', 'Temperature'],
  ['Kişiselleştirilebilir', 'Customizable'],
  ['Güçlendirilmiş', 'Reinforced'],
  ['Fazla', 'Over'],
  ['Kısa', 'Short'],
  ['Uzunluğu', 'Length'],
  ['Boyutu', 'Size'],
  ['Boyu', 'Height'],
  ['Eni', 'Width'],
  ['En Fazla', 'Maximum'],
  ['Maks.', 'Max.'],
  ['Maks', 'Max'],
  ['max.', 'max.'],
  ['Tip-C', 'Type-C'],
  ['Piksel', 'pixels'],
  ['piksel', 'pixels'],
  ['İnç', 'inch'],
  ['inç', 'inch'],
  ['Dakikada', 'in Minutes'],
  ['dakikada', 'in Minutes'],
  ['Saatlik', 'Hours of'],
  ['saatlik', 'Hours of'],
  ['Saniyede', 'in Seconds'],
  ['Günde', 'per Day'],
  ['dk.', 'min'],
  ['Saatte', 'in Hours'],
  ['Hafta', 'Weeks'],
  ['seçeneği var', 'option available'],
  ['seçeneği', 'option'],
];

function applyEnglishReplacements(atom) {
  let out = String(atom || '');

  out = out.replace(/(\d+)\s+Dakikada\s+(\d+)\s+Saatlik\s+Kullanım/gi, '$2 Hours of Use in $1 Minutes');
  out = out.replace(/(\d+)\s+Dakikada\s+%(\d+)\s+Dolum/gi, '$2% Charge in $1 Minutes');
  out = out.replace(/(\d+)\s+Saatte\s+Tam\s+Şarj/gi, 'Full Charge in $1 Hours');
  out = out.replace(/(\d+)\s+saat\s+(\d+)\s+dakika/gi, '$1 hours $2 minutes');
  out = out.replace(/(\d+)\s+Hafta\s+\(Günde\s+(\d+)\s+dk\.\)/gi, '$1 Weeks ($2 min/day)');
  out = out.replace(/(\d+)\.Nesil/gi, (_, n) => `${ordinal(n)} Gen`);
  out = out.replace(/(\d+)\.\s*Nesil/gi, (_, n) => `${ordinal(n)} Gen`);
  out = out.replace(/(\d+)\s*x\s*Performans Çekirdeği/gi, '$1 x Performance Core');
  out = out.replace(/(\d+)\s*x\s*Verimlilik Çekirdeği/gi, '$1 x Efficiency Core');
  out = out.replace(/(\d+)\s*Çekirdekli Neural Engine/gi, '$1-Core Neural Engine');
  out = out.replace(/Apple GPU\s*\((\d+)-Çekirdek\)/gi, 'Apple GPU ($1-Core)');
  out = out.replace(/Apple M(\d+) Çip\s*\((\d+)CPU\/(\d+)GPU Çekirdeği\)/gi, 'Apple M$1 Chip ($2 CPU/$3 GPU Cores)');
  out = out.replace(/Apple M(\d+)\s*\((\d+) Çekirdek GPU\)/gi, 'Apple M$1 ($2-Core GPU)');
  out = out.replace(/(\d+(?:\/\d+)*(?:GB|TB)[A-Z0-9/]*\s+Depolama) seçeneği var/gi, '$1 option available');
  out = out.replace(/(\d+(?:\/\d+)*GB RAM) seçeneği var/gi, '$1 option available');

  for (const [from, to] of EN_REPLACEMENTS.sort((a, b) => b[0].length - a[0].length)) {
    out = out.replace(replacementRegex(from), to);
  }

  out = out
    .replace(/\b(\d+)x(\d+)\s+pixels\b/gi, '$1x$2 pixels')
    .replace(/\b(\d+)\s+x\s+(\d+)\s+pixels\b/gi, '$1 x $2 pixels')
    .replace(/\s+([),])/g, '$1')
    .replace(/([(])\s+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return sanitizeOutputText(out);
}

function translateEnglishFallback(atom) {
  const en = applyEnglishReplacements(atom);
  if (en && en !== atom && !hasTurkishResidue(en)) return toAll(en);
  return null;
}

// Passthrough heuristic for brand-product identifier strings — they're
// usually English already (Apple/Samsung/Asus model codes etc.) but the
// scraper may treat them as Turkish atoms. Return the same text for all
// langs so the dict lookup yields the original string.
function looksLikeProductName(s) {
  const brands = /(Apple|Samsung|Asus|MSI|Lenovo|Sony|Canon|HP|Dell|Acer|Razer|Logitech|Anker|JBL|Bose|Sennheiser|Beats|Xiaomi|Huawei|Honor|Realme|OnePlus|Oppo|Vivo|Nokia|Motorola|Google|Pixel|Microsoft|Surface|Intel|AMD|NVIDIA|GeForce|Radeon|Ryzen|Core|Snapdragon|Mediatek|Exynos|Qualcomm|Kingston|Corsair|G\.Skill|Crucial|WD|Seagate|Toshiba|SanDisk|Samsung|Western Digital|Cooler Master|NZXT|Thermaltake|Phanteks|Lian Li|be quiet|Noctua|Arctic|EKWB|EVGA|Gigabyte|ASRock|Biostar|Foxconn|TP-Link|Netgear|Linksys|D-Link|Tenda|Mercusys|Sony PlayStation|Microsoft Xbox|Nintendo|Sega|Atari|Razer|SteelSeries|Corsair|Cooler Master|HyperX|Logitech|Microsoft|Apple|Bose|Sennheiser|Audio-Technica|AKG|Beyerdynamic|Beats|JBL|Harman Kardon|Yamaha|Onkyo|Denon|Marantz|Pioneer|Polk|KEF|Bowers|Klipsch|Edifier|Creative|Steelseries|Roborock|Dreame|Ecovacs|Roomba|iRobot|Eufy|Anker|Belkin|Mophie|Otterbox|Spigen|UAG|Caseology|Tech21|Speck|Pelican|Catalyst|Lifeproof|Insta360|GoPro|DJI|Autel|Skydio|Parrot|Thermalright|Noctua|Arctic|Scythe|Akasa|Reeven|Cryorig|Phanteks|Bequiet|Be Quiet|Deepcool|ID-COOLING|Antec|Fractal|Lian Li|Cougar|Aerocool|Silverstone|Bitfenix|Riotoro|Roborock|Roomba|Eufy|Ecovacs|Tineco|Bissell|Shark|Miele|Dyson|TCL|Hisense|Vestel|Beko|LG|Sharp|Panasonic|Philips|Loewe|Grundig|Telefunken|Nordmende|Awox|Sunny|Sinbo|Arcelik|Vestel|Casper|Monster|Reeder|General Mobile|Polaroid|Kodak|Fujifilm|Pentax|Olympus|Leica|Hasselblad|Sigma|Tamron|Tokina|Zeiss|Voigtlander|Schneider|Rollei|Mamiya|Bronica|Yashica|Konica|Minolta|Vivitar|Sigma|Tamron|Tokina|Zeiss|Sirui|Manfrotto|Gitzo|Benro|Velbon|Slik|Vanguard|MeFoto|Joby|Peak Design|Lowepro|Tenba|Domke|Billingham|Tamrac|Think Tank|F-Stop|Crumpler|Wandrd|Shimoda|MindShift|Tenba|Manfrotto|Vanguard|Lowepro|Tamrac|Tenba|Think Tank|Domke|Billingham|Wandrd|Shimoda|MindShift|Peak Design|F-Stop|Crumpler|Joby|Mefoto|Sirui|Benro|Manfrotto|Gitzo|Velbon|Slik|Vanguard|Anker|Belkin|Mophie|Insta360|GoPro|DJI|Autel|Parrot|Skydio|Yuneec|Hubsan|Walkera|MJX|Eachine|FrSky|TBS|ImmersionRC|Fat Shark|Skyzone|Aomway|Eachine|DJI Goggles|Fat Shark|Skyzone|Aomway|Eachine|Helios|Holyland|Atomos|Blackmagic|Sony Alpha|Canon EOS|Nikon Z|Fujifilm X|Olympus OM|Panasonic Lumix|Leica M|Hasselblad X|Phase One|Sigma fp|Sony FX|Canon C|RED|ARRI|Blackmagic|Z CAM|Kinefinity|Sony PXW|Canon XF|Panasonic AG|JVC GY|Sony NEX|Canon EF|Nikon F|Sony E|Canon RF|Nikon Z|Fujifilm X|Sony A|Canon R|Nikon D|Pentax K|Olympus E|Panasonic GH|Sony PXW|Canon XF|Panasonic AG|JVC GY|RED|ARRI|Blackmagic|Z CAM|Kinefinity)\b/i;
  // Has brand AND English-ish model code pattern
  if (!brands.test(s)) return false;
  // Has model-like codes (alphanumeric with dashes/spaces)
  if (/[A-Z]{2,}[\s-]?\d{2,}/.test(s)) return true;
  if (/\(\s*[A-Z0-9-]+\s*\)/.test(s)) return true;
  return false;
}

// ────────────────────────────────────────────────────────────────────────
//  Build pipeline
// ────────────────────────────────────────────────────────────────────────
function translate(atom) {
  // 1) MANUAL exact-match wins.
  if (Object.prototype.hasOwnProperty.call(MANUAL, atom)) return MANUAL[atom];
  // 2) Numeric / unit pattern.
  for (const { re, build } of UNIT_PATTERNS) {
    const m = atom.match(re);
    if (m) {
      const out = build(...m.slice(1));
      if (out) return out;
    }
  }
  // 3) Key-pattern composer ("X Tipi" / "X Sayısı" etc.)
  for (const { re, build } of KEY_PATTERNS) {
    const m = atom.match(re);
    if (m) {
      const out = build(m[1]);
      if (out) return out;
    }
  }
  // 4) Brand+model passthrough — leave as-is for every lang.
  const englishFallback = translateEnglishFallback(atom);
  if (englishFallback) return englishFallback;
  if (!hasTurkishResidue(atom)) return [atom, atom, atom, atom, atom, atom];
  if (looksLikeProductName(atom) && !hasTurkishResidue(atom)) return [atom, atom, atom, atom, atom, atom];
  return null;
}

const built = {};
const unmatched = [];
const sourceAtoms = [...new Set([
  ...ATOMS,
  ...EN_REPLACEMENTS.map(([from]) => from),
])];

for (const atom of sourceAtoms) {
  const tr = translate(atom);
  if (tr) {
    const entry = sanitizeEntry({ tr: atom, en: tr[0], de: tr[1], es: tr[2], fr: tr[3], pt: tr[4], ru: tr[5] });
    for (const key of normalizeKeyAliases(atom)) built[key] = entry;
  } else {
    unmatched.push(atom);
  }
}

console.log(`Atoms in: ${sourceAtoms.length}`);
console.log(`Translated: ${Object.keys(built).length}`);
console.log(`Unmatched: ${unmatched.length}`);
fs.writeFileSync(path.join(__dirname, '_unmatched_atoms.json'), JSON.stringify(unmatched, null, 2));
fs.writeFileSync(path.join(__dirname, '_built_seed.json'), JSON.stringify(built, null, 2));

if (!process.argv.includes('--upload')) {
  console.log('\nDry-run. Run with --upload to push to PocketBase.');
  process.exit(0);
}

// Upload as additional shards merged with the existing dict.
(async () => {
  // auth
  const r = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASSWORD }),
  });
  if (!r.ok) throw new Error(`auth ${r.status}`);
  const token = (await r.json()).token;

  // Pull existing shards, merge.
  const listing = await fetch(
    `${PB_URL}/api/collections/public_config/records?perPage=200&filter=${encodeURIComponent('key~"tr_translation_dict__part_"')}&fields=id,value`,
    { headers: { Authorization: token } },
  );
  if (!listing.ok) throw new Error(`shard list ${listing.status}`);
  const { items } = await listing.json();
  const merged = {};
  for (const it of items || []) {
    const terms = it.value?.terms || {};
    for (const [k, v] of Object.entries(terms)) merged[k] = v;
  }
  for (const [k, v] of Object.entries(built)) merged[k] = v;
  for (const [k, v] of Object.entries({ ...merged })) {
    const source = v && typeof v === 'object' && v.tr ? v.tr : k;
    for (const alias of normalizeKeyAliases(source)) {
      if (!merged[alias]) merged[alias] = v;
    }
  }
  for (const [k, v] of Object.entries(merged)) merged[k] = sanitizeEntry(v);
  console.log(`Merged dict size: ${Object.keys(merged).length}`);

  // Rebuild shards.
  const shards = [];
  let shard = {}, bytes = 0;
  for (const [k, v] of Object.entries(merged)) {
    const eb = Buffer.byteLength(JSON.stringify({ [k]: v }), 'utf8');
    if (Object.keys(shard).length && bytes + eb > DICT_SHARD_MAX_BYTES) {
      shards.push(shard); shard = {}; bytes = 0;
    }
    shard[k] = v; bytes += eb;
  }
  if (Object.keys(shard).length) shards.push(shard);

  const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const updatedAt = new Date().toISOString();
  const upsert = async (key, value) => {
    const s = await fetch(
      `${PB_URL}/api/collections/public_config/records?filter=${encodeURIComponent(`key="${key}"`)}&fields=id`,
      { headers: { Authorization: token } },
    );
    const { items: ex } = await s.json();
    const body = { key, value, updatedAt };
    if (ex && ex.length) {
      const r2 = await fetch(`${PB_URL}/api/collections/public_config/records/${ex[0].id}`, {
        method: 'PATCH', headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r2.ok) throw new Error(`patch ${key} ${r2.status}`);
    } else {
      const r3 = await fetch(`${PB_URL}/api/collections/public_config/records`, {
        method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r3.ok) throw new Error(`post ${key} ${r3.status}`);
    }
  };
  // Delete extras
  if (items) {
    for (const it of items) {
      const idxMatch = String(it.value?.index ?? '');
      if (idxMatch !== '' && Number(idxMatch) >= shards.length) {
        await fetch(`${PB_URL}/api/collections/public_config/records/${it.id}`, { method: 'DELETE', headers: { Authorization: token } });
      }
    }
  }
  for (let i = 0; i < shards.length; i++) {
    const key = `${DICT_SHARD_PREFIX}${String(i).padStart(4, '0')}`;
    await upsert(key, { sharded: true, batchId, index: i, total: shards.length, terms: shards[i] });
    console.log(`  ✓ shard ${i} (${Object.keys(shards[i]).length} entries)`);
  }
  await upsert(DICT_MANIFEST_KEY, { sharded: true, batchId, totalShards: shards.length, totalTerms: Object.keys(merged).length, updatedAt });
  await upsert(DICT_PB_KEY, { sharded: true, manifestKey: DICT_MANIFEST_KEY, totalShards: shards.length, totalTerms: Object.keys(merged).length, updatedAt });
  console.log(`\nUploaded. Dict total: ${Object.keys(merged).length}`);
})().catch(e => { console.error(e); process.exit(1); });
