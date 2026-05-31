// ═══════════════════════════════════════════════════════════════
//  QOR AI — Tech Score Engine v7 (Canonical Specs + Anchored + Brand)
//  • Mutlak rank-based GPU/CPU/Chipset (future-proof)
//  • Log-scale numeric normalization against global references
//  • Tier caps (flagship/upper-mid/mid/entry) — stops mid-segment inflation
//  • Brand modifier: Apple/Galaxy Ultra/Pixel Pro bonus, Redmi/Poco/Realme penalty
//  • iOS/macOS/iPadOS OS bonus
//  • Year decay, nested specs walk, multi-schema field probe
//
//  Pipeline:
//    1. Lookup spec value via multi-name field probe
//    2. Categorize each spec: rank | lookup | numeric (norm/lower)
//    3. Per-category: 1st pass collects numeric maxes
//    4. Per-product: weighted sum with renormalization for missing
//    5. Year decay (smartphone-style table) applied at the end
//
//  Works in browser (window.ScoreEngine) AND Node (module.exports).
// ═══════════════════════════════════════════════════════════════

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.ScoreEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  //  RANK LISTS (longest-name match wins, fall back to interp)
  // ─────────────────────────────────────────────────────────────

  const GPU_DESKTOP = [
    // Workstation / pro cards (treated as own family — do NOT interpolate against RTX 50xx)
    ['RTX PRO 6000 Blackwell', 99], ['RTX 6000 Ada', 86], ['RTX A6000', 78], ['RTX A5500', 70],
    ['RTX A5000', 66], ['RTX A4500', 58], ['RTX A4000', 50], ['RTX A2000', 32],
    ['Quadro RTX 8000', 60], ['Quadro RTX 6000', 56], ['Quadro RTX 5000', 50], ['Quadro RTX 4000', 38],
    ['Quadro P6000', 28], ['Quadro P5000', 22], ['Quadro M6000', 14], ['Quadro K6000', 8],
    ['Tesla K80', 18], ['Tesla K40', 12], ['Tesla M60', 14], ['Tesla M40', 10],
    ['Tesla P40', 22], ['Tesla P100', 26], ['Tesla T4', 30], ['Tesla V100', 42], ['Tesla A100', 58], ['Tesla H100', 72],
    // GeForce desktop — generation matters (5090 must always beat older flagships)
    ['RTX 5090 D', 99], ['RTX 5090', 100],
    ['RX 9900 XTX', 97], ['RTX 5080', 95], ['RX 9800 XT', 92],
    ['RTX 5070 Ti', 89], ['RTX 4090', 86], ['RTX 5070', 82],
    ['RX 9070 XT', 80], ['RTX 4080 Super', 78], ['RTX 4080', 76],
    ['RX 9070', 73], ['RTX 5060 Ti', 70],
    ['RTX 4070 Ti Super', 68], ['RTX 4070 Ti', 65], ['RX 7900 XTX', 64],
    ['RTX 4070 Super', 62], ['RX 7900 XT', 60],
    ['RTX 5060', 56], ['RTX 4070', 54],
    ['RX 7800 XT', 52], ['RTX 4060 Ti', 48], ['RX 7700 XT', 46],
    ['RTX 4060', 42], ['RX 7600 XT', 40],
    ['RTX 3090 Ti', 50], ['RTX 3090', 45], ['RTX 3080 Ti', 42], ['RTX 3080', 38],
    ['RTX 3070 Ti', 35], ['RTX 3070', 32],
    ['RTX 3060 Ti', 28], ['RTX 4050', 25], ['RX 6700 XT', 24],
    ['RTX 3060', 22], ['RTX 3050', 16], ['RX 6600', 13],
    ['RTX 2080 Ti', 22], ['RTX 2080', 18], ['RTX 2070', 15], ['RTX 2060', 12],
    ['GTX 1660 Ti', 10], ['GTX 1660', 8], ['RX 6500 XT', 7], ['GTX 1650', 6],
    ['GTX 1080 Ti', 14], ['GTX 1080', 11], ['GTX 1070', 8], ['GTX 1060', 6],
    ['MX570', 4], ['MX450', 3], ['MX350', 2],
    ['Intel Arc B580', 38], ['Intel Arc A770', 32], ['Intel Arc A750', 26], ['Intel Arc A380', 12],
  ];

  const GPU_LAPTOP = [
    ['RTX 5090 Laptop', 100], ['RTX 5080 Laptop', 92], ['RTX 5070 Ti Laptop', 84],
    ['RTX 5070 Laptop', 76], ['RTX 5060 Laptop', 64], ['RTX 5050 Laptop', 50],
    ['RTX 4090 Laptop', 78], ['RTX 4080 Laptop', 70], ['RTX 4070 Laptop', 60],
    ['RTX 4060 Laptop', 48], ['RTX 4050 Laptop', 38],
    ['RTX 3080 Ti Laptop', 42], ['RTX 3080 Laptop', 36], ['RTX 3070 Ti Laptop', 30],
    ['RTX 3070 Laptop', 26], ['RTX 3060 Laptop', 22], ['RTX 3050 Ti Laptop', 16], ['RTX 3050 Laptop', 14],
    ['RTX 2080 Laptop', 14], ['RTX 2070 Laptop', 11], ['RTX 2060 Laptop', 9],
    ['GTX 1660 Ti Laptop', 7], ['GTX 1650 Laptop', 5],
    ['RX 7600M XT', 52], ['RX 7600M', 42], ['RX 6700M', 32], ['RX 6600M', 26],
    ['Arc A770M', 44], ['Arc A730M', 36],
  ].concat(GPU_DESKTOP); // also accept desktop names in laptop SKUs

  const CPU_LAPTOP = [
    ['Core Ultra 9 285HX', 100], ['Ryzen 9 9955HX', 99], ['Core i9-14900HX', 95],
    ['Core Ultra 7 265HX', 91], ['Ryzen 9 7945HX', 90], ['Core i9-13980HX', 88],
    ['Core Ultra 7 255H', 84], ['Ryzen 9 8945HS', 83], ['Core i7-14700HX', 80],
    ['Core Ultra 5 245H', 75], ['Ryzen 7 8845HS', 74], ['Core i7-13700H', 71],
    ['Core Ultra 5 235H', 67], ['Ryzen 7 7745HX', 65], ['Core i5-14500H', 60],
    ['Ryzen 5 8645HS', 55], ['Core i5-13500H', 52], ['Core Ultra 5 125H', 50],
    ['Ryzen 5 7535HS', 44], ['Core i5-12500H', 41], ['Ryzen 5 5600H', 32],
    ['Core i5-11400H', 28], ['Ryzen 5 5500U', 22], ['Core i5-10300H', 18],
    ['Ryzen 3 5300U', 12], ['Celeron', 6], ['Pentium', 6],
    // Apple Silicon laptops (MacBook Air/Pro) — generation beats tier-from-2-gens-ago
    ['Apple M5 Max', 100], ['Apple M5 Pro', 98], ['Apple M5', 96],
    ['Apple M4 Max', 94], ['Apple M4 Pro', 92], ['Apple M4', 90],
    ['Apple M3 Max', 86], ['Apple M3 Pro', 84], ['Apple M3', 80],
    ['Apple M2 Max', 76], ['Apple M2 Pro', 74], ['Apple M2', 70],
    ['Apple M1 Max', 66], ['Apple M1 Pro', 64], ['Apple M1', 58],
  ];

  const CPU_DESKTOP = [
    ['Threadripper Pro 9995WX', 100], ['Threadripper Pro 9985WX', 97],
    ['Threadripper 9980X', 96], ['Threadripper Pro 7995WX', 92],
    ['Threadripper 7970X', 86], ['Threadripper 7960X', 82],
    ['Ryzen 9 9950X', 100], ['Core i9-14900K', 98], ['Ryzen 9 7950X', 95],
    ['Core i9-13900K', 92], ['Ryzen 9 9900X', 88], ['Core i7-14700K', 84],
    ['Ryzen 7 9700X', 80], ['Core i7-13700K', 77], ['Ryzen 7 7700X', 73],
    ['Core i5-14600K', 68], ['Ryzen 5 9600X', 64], ['Core i5-13600K', 61],
    ['Ryzen 5 7600X', 57], ['Core i5-12600K', 51], ['Ryzen 5 5600X', 44],
    ['Core i5-12400', 38], ['Ryzen 5 5600', 35], ['Core i3-13100', 26],
    ['Ryzen 3 4100', 18], ['Celeron', 6], ['Pentium', 6],
    // Apple Silicon desktops (iMac, Mac mini, Mac Studio, Mac Pro)
    // Generation > tier within a generation: a newer base chip beats an older
    // Ultra of two generations ago in single-thread + media engine perf.
    ['Apple M5 Ultra', 100], ['Apple M5 Max', 99], ['Apple M5 Pro', 97], ['Apple M5', 95],
    ['Apple M4 Ultra', 96], ['Apple M4 Max', 94], ['Apple M4 Pro', 92], ['Apple M4', 90],
    ['Apple M3 Ultra', 88], ['Apple M3 Max', 86], ['Apple M3 Pro', 83], ['Apple M3', 80],
    ['Apple M2 Ultra', 78], ['Apple M2 Max', 75], ['Apple M2 Pro', 72], ['Apple M2', 68],
    ['Apple M1 Ultra', 66], ['Apple M1 Max', 62], ['Apple M1 Pro', 58], ['Apple M1', 54],
  ];

  const CHIPSET_PHONE = [
    ['Snapdragon 8 Elite Gen 5', 100], ['Apple A19 Pro', 100], ['Dimensity 9500', 99],
    ['Apple A19', 97], ['Snapdragon 8 Gen 5', 94],
    ['Snapdragon 8 Elite', 93], ['Apple A18 Pro', 93], ['Dimensity 9400', 91],
    ['Exynos 2600', 90], ['Exynos 2500', 88], ['Snapdragon 8 Gen 3', 86], ['Apple A17 Pro', 86],
    ['Dimensity 9300', 87], ['Exynos 2400', 84], ['Snapdragon 8 Gen 2', 80],
    ['Apple A18', 84], ['Apple A16', 78], ['Dimensity 9200', 77], ['Kirin 9000S', 72],
    ['Snapdragon 7s Gen 3', 65], ['Dimensity 8300', 63],
    ['Snapdragon 7 Gen 3', 61], ['Exynos 1480', 58],
    ['Snapdragon 6 Gen 3', 50], ['Dimensity 7300', 48], ['Helio G99 Ultra', 45],
    ['Dimensity 6300', 38], ['Helio G99', 36], ['Snapdragon 6s Gen 3', 33],
    ['Helio G88', 26], ['Snapdragon 4 Gen 2', 24], ['Dimensity 6100+', 22],
    ['Helio G85', 16], ['Snapdragon 4s Gen 2', 12], ['Helio G36', 6],
    // Apple A older
    ['Apple A17', 82], ['Apple A15', 70], ['Apple A14', 60], ['Apple A13', 48],
    // Apple M (tablets/phones)
    ['Apple M5', 100], ['Apple M4', 96], ['Apple M3', 90], ['Apple M2', 82], ['Apple M1', 72],
    // Smartwatch SoCs — keep in CHIPSET_PHONE because smartwatches reuse the
    // 'chipset' field probe. Generic / no-SoC watches will not match anything
    // here, fall back to anchorless cap.
    ['Apple S11', 100], ['Apple S10', 96], ['Apple S9', 90], ['Apple S8', 80],
    ['Apple S7', 70], ['Apple S6', 60], ['Apple S5', 48],
    ['Samsung Exynos W1000', 92], ['Exynos W1000', 92],
    ['Samsung Exynos W930', 78], ['Exynos W930', 78],
    ['Samsung Exynos W920', 66], ['Exynos W920', 66],
    ['Qualcomm Snapdragon W5+', 84], ['Snapdragon W5+', 84],
    ['Qualcomm Snapdragon W5', 76], ['Snapdragon W5', 76],
    ['Snapdragon Wear 4100+', 56], ['Snapdragon Wear 4100', 50],
    ['Snapdragon Wear 3100', 36], ['Snapdragon Wear 2100', 22],
    ['Google Tensor', 86], ['HiSilicon Kirin A1', 60], ['Kirin A1', 60],
    ['MediaTek MT2503', 12], ['MT2503', 12],
    ['Bluetooth 5.0', 8], ['Realtek 8762', 8], ['Nordic nRF52', 12],
  ];

  // Family detection for interpolation (longest first).
  // IMPORTANT: workstation families ("RTX A", "Quadro", "Tesla") come BEFORE
  // generic "RTX" so an A6000 doesn't get interpolated against RTX 5090's slot.
  // Without this guard "HP RTX A6000" used to score 100 because its number
  // (6000) exceeded the RTX 5090 reference (5090) and the interpolator picked
  // the desktop GeForce flagship as nearest. Workstation cards belong to their
  // own ladder — they never beat current-gen consumer flagships in gaming-style
  // benchmarks even if VRAM / pro-app perf is higher.
  const FAMILIES = [
    'Threadripper Pro', 'Threadripper',
    'Core Ultra 9', 'Core Ultra 7', 'Core Ultra 5',
    'Core i9', 'Core i7', 'Core i5', 'Core i3',
    'Ryzen 9', 'Ryzen 7', 'Ryzen 5', 'Ryzen 3',
    'RTX PRO', 'RTX A', 'Quadro RTX', 'Quadro', 'Tesla',
    'RTX', 'GTX', 'RX',
    'Snapdragon 8', 'Snapdragon 7', 'Snapdragon 6', 'Snapdragon 4', 'Snapdragon',
    'Dimensity', 'Exynos', 'Helio', 'Kirin',
    'Apple A', 'Apple M', 'Apple S',
  ];

  // ─────────────────────────────────────────────────────────────
  //  CATEGORICAL LOOKUPS (substring match, longest wins)
  // ─────────────────────────────────────────────────────────────

  const LOOKUPS = {
    panel: [
      ['LTPO OLED', 100], ['LTPO AMOLED', 100], ['Dynamic AMOLED', 98],
      ['Super AMOLED', 95], ['AMOLED', 95], ['Mini-LED', 82], ['MiniLED', 82],
      ['QD-OLED', 100], ['OLED', 100], ['QLED', 85], ['Retina', 92],
      ['IPS LCD', 70], ['IPS', 70], ['VA', 65], ['PLS', 65],
      ['LED', 62], ['LCD', 55], ['TFT', 40], ['TN', 30], ['E-Ink', 60],
    ],
    resolution: [
      ['8K', 100], ['7680', 100], ['4320', 100],
      ['4K', 95], ['UHD', 95], ['3840', 95], ['2160', 95],
      ['QHD+', 88], ['3200', 88], ['3120', 88], ['3088', 88],
      ['QHD', 82], ['1440', 82], ['2560', 82], ['1600', 82],
      ['FHD+', 72], ['2400', 72], ['2340', 72], ['2412', 72],
      ['FHD', 65], ['1080', 65], ['1920', 65],
      ['HD+', 45], ['1600x720', 45], ['1612', 45],
      ['HD', 35], ['720', 35], ['1280', 35],
    ],
    hdr: [
      ['Dolby Vision IQ', 100], ['Dolby Vision', 95], ['HDR10+', 90],
      ['HDR10', 75], ['HLG', 65], ['HDR', 55],
    ],
    wifi: [
      ['Wi-Fi 7', 100], ['WiFi 7', 100], ['802.11be', 100],
      ['Wi-Fi 6E', 88], ['WiFi 6E', 88],
      ['Wi-Fi 6', 75], ['WiFi 6', 75], ['802.11ax', 75],
      ['Wi-Fi 5', 55], ['WiFi 5', 55], ['802.11ac', 55],
      ['Wi-Fi 4', 35], ['802.11n', 35],
    ],
    bluetooth: [
      ['5.4', 100], ['5.3', 90], ['5.2', 80], ['5.1', 72], ['5.0', 62],
      ['4.2', 40], ['4.1', 35], ['4.0', 30],
    ],
    codec: [
      ['LDAC', 90], ['aptX Lossless', 100], ['aptX Adaptive', 85],
      ['aptX HD', 80], ['aptX', 70], ['LHDC', 80],
      ['AAC', 60], ['SBC', 40],
    ],
    psu_efficiency: [
      ['Titanium', 100], ['Platinum', 90], ['Gold', 80],
      ['Silver', 65], ['Bronze', 50], ['80+', 40], ['Standard', 20],
    ],
    vram: [
      ['48', 100], ['32', 95], ['24', 88], ['20', 80], ['16', 72],
      ['12', 62], ['10', 55], ['8', 50], ['6', 35], ['4', 20], ['2', 10],
    ],
    lan_speed: [
      ['10G', 100], ['10 Gbit', 100], ['5G', 88], ['2.5G', 75], ['2.5 Gbit', 75],
      ['1G', 55], ['Gigabit', 55], ['100M', 20],
    ],
    smart_os: [
      ['Google TV', 100], ['Tizen', 92], ['webOS', 92], ['VIDAA', 75],
      ['Android TV', 80], ['Android', 70], ['Roku', 70], ['tvOS', 90],
    ],
    network_5g: [['5G', 100], ['4G', 55], ['LTE', 55], ['3G', 15]],
    ip_rating: [
      ['IP69', 100], ['IPX9', 100], ['IP68', 90], ['IP67', 75],
      ['IP66', 65], ['IP65', 60], ['IP54', 45], ['IPX4', 45], ['IP53', 35],
    ],
    sensor_size_phone: [
      ['1.0"', 100], ['1 inch', 100], ['1/1.12', 96], ['1/1.28', 92],
      ['1/1.3', 92], ['1/1.4', 88], ['1/1.5', 84], ['1/1.56', 82],
      ['1/1.7', 76], ['1/1.74', 76], ['1/2', 65], ['1/2.0', 65],
      ['1/2.3', 60], ['1/2.5', 54], ['1/2.7', 47], ['1/2.8', 44],
      ['1/3', 34], ['1/3.4', 28], ['1/4', 22],
    ],
    csensor: [ // Camera sensor size (DSLR/mirrorless)
      ['Medium Format', 100], ['Full Frame', 90], ['APS-H', 78], ['APS-C', 70],
      ['Micro Four Thirds', 55], ['MFT', 55], ['1 inch', 45], ['1/1.7', 30],
    ],
    panel_switch: [ // Keyboard switches
      ['Hall Effect', 100], ['Magnetic', 100], ['Optical', 90],
      ['Linear', 85], ['Tactile', 80], ['Clicky', 78],
      ['Mechanical', 75], ['Membrane', 35], ['Scissor', 50],
    ],
    keyboard_type: [
      ['Magnetic', 100], ['Hall Effect', 100], ['Optical', 92],
      ['Mechanical', 80], ['Hybrid', 60], ['Membrane', 35], ['Scissor', 45],
    ],
    case_form: [
      ['E-ATX', 100], ['Full Tower', 95], ['ATX', 80], ['Mid Tower', 80],
      ['Micro-ATX', 60], ['mATX', 60], ['Mini-ITX', 45], ['ITX', 45],
    ],
    cooler_type: [
      ['Liquid', 100], ['AIO', 95], ['Water', 95], ['Tower', 70], ['Air', 60], ['Low Profile', 40],
    ],
    headphone_water: [
      ['IPX8', 100], ['IPX7', 90], ['IPX6', 75], ['IPX5', 60], ['IPX4', 50], ['IPX3', 35], ['IPX2', 20],
    ],
  };

  // ─────────────────────────────────────────────────────────────
  //  SPEC FIELD NAMES (try in order, first hit wins)
  //  Match against keys (case + space + hyphen normalized).
  // ─────────────────────────────────────────────────────────────

  const FIELDS = {
    gpu:        ['GPU Model', 'External Graphics Processor (GPU)', 'Graphics Processor (GPU)', 'Graphics Processor', 'Graphics adapter model', 'Discrete graphics adapter model', 'On-board graphics adapter model', 'Graphics Card', 'Graphics', 'Dedicated GPU', 'Discrete GPU', 'Ekran Kartı', 'Ekran Karti', 'Harici Ekran Kartı', 'GPU'],
    cpu:        ['Processor Model', 'Processor family', 'Processor model', 'Main Processor (CPU)', 'CPU Model', 'CPU', 'Processor', 'İşlemci', 'Islemci', 'Ana İşlemci', 'Ana Islemci', 'İşlemci Modeli'],
    ram:        ['Memory (RAM)', 'RAM Capacity', 'RAM (GB)', 'System Memory', 'Installed RAM', 'RAM', 'Memory', 'Bellek', 'Sistem Belleği', 'Sistem Bellegi'],
    storage:    ['Hard Disk (SSD) Size', 'SSD Size', 'SSD Capacity', 'Storage Capacity', 'Internal Storage', 'Hard Disk Size', 'Hard Disk', 'Storage', 'Depolama', 'Dahili Hafıza', 'Dahili Hafiza'],
    battery:    ['Battery Capacity (Typical)', 'Battery Capacity', 'Battery Power', 'Battery (mAh)', 'Battery', 'Batarya Kapasitesi', 'Batarya', 'Pil'],
    battery_life: ['Battery Life', 'Listening Time', 'Music Time', 'Talk Time', 'Pil Ömrü', 'Calma Suresi', 'Çalma Süresi'],
    screen_size:['Display Size', 'Screen Size', 'Display Diagonal', 'Ekran Boyutu', 'Ekran Boyutu (İnç)', 'Ekran Boyutu (Inc)', 'Display Size (Diagonal)', 'Diagonal'],
    refresh:    ['Screen Refresh Rate', 'Display Refresh Rate', 'Refresh Rate', 'Yenileme Hızı', 'Yenileme Hizi', 'Yenileme Hızı (DP)', 'Yenileme Hızı (HDMI)'],
    chipset:    ['Chipset', 'System Chip', 'SoC', 'Ana İşlemci', 'Ana Islemci', 'CPU', 'Processor', 'İşlemci', 'Islemci'],
    panel:      ['Screen Technology', 'Panel Type', 'Display Technology', 'Display Type', 'Display', 'Panel Tipi', 'Ekran Tipi', 'Ekran Teknolojisi', 'Ekran'],
    resolution: ['Display Resolution', 'Screen Resolution', 'Resolution', 'Resolution Standard', 'Çözünürlük', 'Cozunurluk', 'Ekran Çözünürlüğü', 'Çözünürlük Standardı'],
    main_camera:['Main Camera', 'Main Camera Resolution', 'Rear Camera', 'Primary Camera', 'Camera Resolution', 'Ana Kamera', 'Arka Kamera', 'Kamera Çözünürlüğü'],
    front_camera:['Front Camera Resolution', 'Selfie Camera Resolution', 'Ön Kamera Çözünürlüğü', 'On Kamera Cozunurlugu', 'Front Camera', 'Selfie Camera', 'Ön Kamera', 'On Kamera', 'Selfie'],
    network_5g: ['5G', '5G Support', '4.5G Support', 'Network', 'Cellular', 'Mobile Network', 'Mobil Ağ', 'Mobil Ag', 'Şebeke', 'Sebeke', 'Generation'],
    weight:     ['Weight', 'Ağırlık', 'Agirlik'],
    wifi:       ['Wi-Fi', 'WiFi', 'Wireless', 'Kablosuz Bağlantı', 'Kablosuz Baglanti'],
    bluetooth:  ['Bluetooth', 'Bluetooth Version', 'Bluetooth Standard', 'Bluetooth Standardı', 'Bluetooth Versiyonu'],
    release_year: ['Release Date', 'Release Year', 'Announcement Date', 'Duyurulma Tarihi', 'Tanıtım Tarihi', 'Tanitim Tarihi', 'Çıkış Tarihi', 'Cikis Tarihi', 'Çıkış Yılı'],
    ip_rating:  ['Water Resistance', 'IP Rating', 'Su Geçirmezlik', 'Su Gecirmezlik', 'Sertifika'],
    // GPU
    vram:       ['Memory Size', 'Video Memory', 'VRAM', 'Bellek Boyutu', 'Memory'],
    bandwidth:  ['Memory Bandwidth', 'Bandwidth', 'Bant Genişliği'],
    boost_clock:['Boost Clock', 'Game Clock', 'Boost Frequency', 'Artırılmış Frekans', 'Artirilmis Frekans', 'Turbo Frequency'],
    base_clock: ['Base Clock', 'Base Frequency', 'Core Clock', 'Temel Frekans'],
    cores:      ['Core Count', 'Number of Cores', 'CUDA Cores', 'Stream Processors', 'Çekirdek Sayısı', 'Cekirdek Sayisi', 'Çekirdek', 'Performans Çekirdeği'],
    threads:    ['Thread Count', 'Number of Threads', 'Threads', 'İş Parçacığı', 'Is Parçacığı', 'İzlek'],
    cache_l3:   ['L3 Cache', 'Cache (L3)', 'Cache', 'Önbellek L3', 'Onbellek L3'],
    tdp:        ['TDP', 'Thermal Design Power', 'Power Consumption', 'Isı Yayma Kapasitesi (TDP)', 'Isi Yayma Kapasitesi'],
    process_nm: ['Process', 'Manufacturing Process', 'Lithography', 'İşlem'],
    igpu:       ['Integrated Graphics', 'iGPU', 'Tümleşik Ekran Kartı'],
    // RAM
    ram_speed:  ['Memory Speed', 'Memory Frequency', 'Bellek Hızı', 'Bellek Frekansı', 'Speed', 'Frequency', 'Hız'],
    ram_cas:    ['CAS Latency', 'CL', 'Latency'],
    // SSD
    seq_read:   ['Sequential Read', 'Read Speed', 'Max Read', 'Okuma Hızı'],
    seq_write:  ['Sequential Write', 'Write Speed', 'Max Write', 'Yazma Hızı'],
    iops:       ['Random Read IOPS', 'Random IOPS', 'IOPS'],
    interface:  ['Interface', 'Form Factor', 'Bus', 'PCIe Sürümü', 'PCIe Version', 'PCI Express Version'],
    tbw:        ['TBW', 'Endurance', 'Total Bytes Written'],
    // PSU
    watt:       ['Wattage', 'Total Power', 'Power', 'Güç'],
    efficiency: ['Efficiency', '80 Plus', '80+ Rating', 'Verimlilik'],
    modular:    ['Modular', 'Modülerlik'],
    fan_size:   ['Fan Size', 'Fan Boyutu'],
    // Audio
    driver:     ['Driver Size', 'Driver', 'Sürücü', 'Surucu', 'Sürücü Çapı'],
    anc:        ['ANC', 'Active Noise Cancellation', 'Aktif Gürültü Engelleme', 'Noise Cancellation', 'Gürültü Engelleme (Dinleme)', 'Konuşma Gürültü Engelleme (ENC)'],
    watt_rms:   ['Output Power (RMS)', 'RMS Power', 'Output Power', 'Çıkış Gücü'],
    channels:   ['Channels', 'Channel Configuration', 'Kanal'],
    // Camera
    sensor:     ['Sensor Size', 'Camera Sensor Size', 'Main Sensor Size', 'Sensor', 'Sensör Boyutu', 'Sensor Boyutu', 'Kamera Sensör Boyutu'],
    megapixels: ['Megapixels', 'Resolution', 'Çözünürlük (MP)', 'Effective Pixels'],
    iso:        ['ISO Range', 'Max ISO', 'ISO'],
    fps_burst:  ['Continuous Shooting', 'Burst Rate', 'FPS', 'Frames Per Second'],
    video_res:  ['Max Video Resolution', 'Video Resolution', 'Video'],
    ibis:       ['Image Stabilization', 'IBIS', 'Stabilization', 'Sabitleme'],
    shutter:    ['Shutter Speed', 'Max Shutter', 'Obtüratör'],
    evf:        ['EVF', 'Viewfinder', 'Vizör', 'Vizor'],
    // Lens
    aperture:   ['Aperture', 'Max Aperture', 'F-Stop', 'Diyafram'],
    focal:      ['Focal Length', 'Focal Range', 'Odak Uzaklığı'],
    ois:        ['Optical Stabilization', 'OIS', 'Optik Sabitleme'],
    min_focus:  ['Minimum Focus Distance', 'Min Focus', 'Min Odak'],
    mount:      ['Lens Mount', 'Mount', 'Bağlantı'],
    // Mouse/keyboard
    dpi:        ['DPI', 'Max DPI', 'Sensitivity'],
    polling:    ['Polling Rate', 'Report Rate'],
    buttons:    ['Buttons', 'Number of Buttons', 'Tuş Sayısı'],
    switch:     ['Switch Type', 'Switch', 'Mekanik Switch', 'Anahtar'],
    // Routers
    total_mbps: ['Speed', 'Total Speed', 'Combined Speed', 'Mbps'],
    bands:      ['Bands', 'Frequency Bands', 'Band'],
    lan:        ['LAN Ports', 'WAN/LAN', 'Ethernet'],
    // Drones / vacuums
    range:      ['Range', 'Max Range', 'Menzil'],
    flight_time:['Flight Time', 'Max Flight', 'Uçuş Süresi'],
    suction:    ['Suction', 'Suction Power', 'Pa', 'Emiş Gücü'],
    runtime:    ['Runtime', 'Battery Runtime', 'Çalışma Süresi'],
    // VR
    fov:        ['Field of View', 'FOV', 'Görüş Açısı'],
    // Others
    type:       ['Type', 'Tür', 'Tip', 'Bağlantı Tipi', 'Connection Type', 'Kulaklık Tipi'],
    audio_watt: ['Audio Power', 'Speaker Power', 'Audio Output'],
    contrast:   ['Contrast Ratio', 'Contrast', 'Kontrast'],
    lumens:     ['Brightness', 'ANSI Lumens', 'Lumens'],
    response_ms:['Response Time', 'Response Time (GtG)', 'Tepki Süresi', 'Tepki Suresi'],
    color_gamut:['Color Gamut', 'Colour Gamut', 'sRGB', 'DCI-P3', 'DCI-P3 Coverage', 'DCI-P3 Kapsamı', 'Adobe RGB', 'Adobe RGB Kapsamı', 'Renk Gamutu'],
    charging:   ['Fast Charging Power (Max.)', 'Fast Charging Power', 'Charging Power', 'Hızlı Şarj Gücü (Maks.)', 'Hizli Sarj Gucu', 'Şarj Gücü'],
    display_features: ['Display Features', 'Screen Features', 'Ekran Özellikleri', 'Ekran Ozellikleri'],
    camera_system: ['Camera Features', 'Video Recording Features', 'Second Rear Camera', 'Third Rear Camera', 'OIS Feature', 'Optical Image Stabilization (OIS)', 'Kamera Özellikleri', 'Video Kayıt Özellikleri', 'İkinci Arka Kamera', 'Üçüncü Arka Kamera', 'Optik Görüntü Sabitleyici (OIS)'],
  };

  // ─────────────────────────────────────────────────────────────
  //  WEIGHTS — 40 categories (sums to 100 per cat)
  // ─────────────────────────────────────────────────────────────

  const WEIGHTS = {
    smartphones: { chipset: 25, release_year: 8, main_camera: 7, camera_system: 7, sensor_size_phone: 4, front_camera: 3, ram: 6, storage: 6, battery: 7, charging: 3, panel: 6, display_features: 5, refresh: 4, resolution: 3, screen_size: 2, network_5g: 2, wifi: 2 },
    tablets:     { chipset: 24, release_year: 8, ram: 10, storage: 9, battery: 10, screen_size: 7, refresh: 5, resolution: 9, panel: 8, display_features: 4, main_camera: 3, network_5g: 3 },
    // Laptops: GPU rank dominant so a 5090 mobile sits at the top of gaming
    // SKUs. weight_lo removed — users buying a 5090 laptop don't care that it
    // weighs 3.5 kg. battery split into battery + battery_life so MacBooks
    // don't ride a single-feature spike to the top.
    laptops:     { gpu: 32, cpu: 22, release_year: 8, ram: 10, storage: 8, screen_size: 3, refresh: 4, resolution: 5, panel: 4, wifi: 2, battery: 2 },
    desktops:    { gpu: 36, cpu: 26, release_year: 8, ram: 10, storage: 8, watt: 3, cooler_type: 3, lan: 3, case_form: 3 },
    monitors:    { release_year: 6, screen_size: 14, resolution: 20, refresh: 18, panel: 16, display_features: 8, response_ms_lo: 9, hdr: 5, color_gamut: 4 },
    tvs:         { release_year: 7, screen_size: 16, resolution: 16, panel: 22, display_features: 10, refresh: 12, hdr: 10, smart_os: 4, hdmi21: 3 },
    headphones:  { anc: 24, driver: 12, battery_life: 16, bluetooth: 12, codec: 18, connection_quality: 8, headphone_water: 5, weight_lo: 5 },
    earphones:   { anc: 24, driver: 12, battery_life: 16, bluetooth: 12, codec: 18, connection_quality: 8, headphone_water: 5, weight_lo: 5 },
    speakers:    { watt_rms: 28, drivers: 16, bluetooth: 10, wifi: 12, battery_life: 14, ip_rating: 10, bass: 10 },
    cameras:     { csensor: 22, megapixels: 16, iso: 16, fps_burst: 14, video_res: 14, ibis: 8, shutter: 6, evf: 4 },
    // GPUs: rank-dominant so the listed model (RTX 5090 = 100) actually wins.
    // tdp_lo used to penalise flagships for being power-hungry — removed; users
    // shopping a 5090 do not consider 575 W a downside vs a 6600 at 130 W.
    gpus:        { gpu_rank: 60, release_year: 6, vram: 12, bandwidth: 8, cores: 6, boost_clock: 4, ray_tracing: 4 },
    cpus:        { cpu_rank: 55, release_year: 6, cores: 12, threads: 6, base_clock: 3, boost_clock: 8, cache_l3: 6, ram_speed: 2, pcie_gen: 2 },
    motherboards:{ chipset_tier: 25, ram_max: 15, m2_slots: 15, pcie_gen: 12, vrm: 10, lan_speed: 8, wifi_gen: 8, usbc: 7 },
    ram:         { ram: 28, ram_speed: 28, ram_cas_lo: 20, ram_gen: 14, dual_channel: 10 },
    ssd:         { storage: 22, seq_read: 22, seq_write: 18, iops: 14, interface: 14, tbw: 10 },
    psu:         { watt: 35, efficiency: 30, modular: 15, warranty: 10, fan_size: 10 },
    cases:       { case_form: 25, fan_slots: 20, radiator: 20, max_gpu: 15, dust_filter: 10, io_ports: 10 },
    coolers:     { tdp: 35, cooler_type: 20, fan_cfm: 15, noise_lo: 15, radiator_mm: 15 },
    smartwatches:{ chipset: 12, battery_life: 22, screen_size: 14, panel: 14, sensors: 18, ip_rating: 10, lte: 10 },
    'smart-rings':{ sensors: 30, battery_days: 25, water_depth: 15, bluetooth: 10, weight_lo: 10, health: 10 },
    'e-readers': { screen_size: 18, resolution: 22, storage: 12, battery_life: 18, frontlight: 12, ip_rating: 8, stylus: 10 },
    soundbars:   { watt_rms: 22, channels: 26, has_sub: 14, hdmi_earc: 14, wifi: 10, atmos: 14 },
    microphones: { type: 12, connection: 10, sample_rate: 18, bit_depth: 14, polar: 14, noise_lo: 16, shock: 8, gain: 8 },
    'action-cameras': { video_res: 24, fps_burst: 18, ibis: 18, ip_rating: 14, battery: 12, csensor: 8, has_screen: 6 },
    lenses:      { aperture_lo: 28, focal: 18, ois: 16, weight_lo: 12, min_focus_lo: 10, mount: 8, weather_seal: 8 },
    dashcams:    { video_res: 26, night_vision: 16, fov: 12, parking: 12, gps: 10, dual_cam: 14, has_screen: 5, max_storage: 5 },
    webcams:     { resolution: 32, fps_burst: 18, autofocus: 14, has_mic: 12, fov: 10, privacy: 8, low_light: 6 },
    gimbals:     { axes: 22, payload: 22, battery_life: 18, ai_track: 14, weight_lo: 10, foldable: 8, bluetooth: 6 },
    tripods:     { max_load: 26, max_height: 18, min_height_lo: 8, weight_lo: 14, sections: 8, head_type: 12, material: 14 },
    consoles:    { cpu: 28, ram: 14, storage: 16, supports_4k: 12, supports_120: 10, ray_tracing: 10, controller: 4, online_sub: 6 },
    gamepads:    { connection: 14, battery_life: 16, haptic: 14, adaptive: 14, hall_effect: 16, platform: 16, weight_lo: 10 },
    'vr-headsets':{ resolution: 24, refresh: 18, fov: 16, standalone: 12, tracking: 12, weight_lo: 10, audio_watt: 4, battery_life: 4 },
    'media-players': { supports_8k: 22, hdr: 18, codec: 14, wifi: 12, ram: 14, audio_formats: 12, ethernet: 8 },
    keyboards:   { keyboard_type: 24, panel_switch: 16, wireless: 12, battery_life: 12, rgb: 6, hot_swap: 12, layout: 10, noise_lo: 8 },
    mice:        { dpi: 22, polling: 18, weight_lo: 14, buttons: 10, wireless: 14, battery_life: 14, ergonomic: 8 },
    routers:     { wifi: 28, total_mbps: 22, bands: 14, lan_speed: 14, mesh: 10, usb: 6, vpn: 6 },
    printers:    { type: 18, color_duplex: 12, ppm: 18, dpi: 14, adf: 10, wifi: 14, paper_capacity: 8, duplex: 6 },
    'robot-vacuums': { suction: 24, runtime: 18, lidar: 18, mop: 12, self_empty: 12, app: 8, obstacle: 8 },
    drones:      { range: 18, flight_time: 18, megapixels: 16, max_speed: 10, wind_resist: 10, obstacle: 12, axes: 10, weight_lo: 6 },
    projectors:  { lumens: 28, resolution: 22, contrast: 14, throw: 8, lamp_life: 10, hdr: 8, audio_watt: 6, smart: 4 },
    chargers:    { watt: 35, charging: 25, battery: 15, type: 10, bands: 5, usb: 5, wireless: 5 },
  };

  // ─────────────────────────────────────────────────────────────
  //  v4 ANCHORED REFERENCES
  //  Log-scale numeric normalization against global reference values
  //  instead of category max/min. Keeps top absolute, prevents
  //  one outlier from inflating / deflating the whole category.
  //  Formula: score = 100 * log(1 + val) / log(1 + REF), capped at 100.
  // ─────────────────────────────────────────────────────────────
  const NUMERIC_REFS = {
    // memory / storage
    ram: 64, storage: 2048, vram: 24, ram_max: 256, ram_speed: 8000, ram_cas_lo: 30,
    // battery
    battery: 7000, battery_life: 60, battery_days: 14,
    // display
    screen_size: 75, refresh: 240, response_ms_lo: 20, color_gamut: 100,
    contrast: 5000, lumens: 4000,
    // camera
    megapixels: 200, iso: 204800, fps_burst: 30, sensor_count: 10, sensors: 10,
    shutter: 8000, aperture_lo: 5.6, focal: 600, min_focus_lo: 50,
    // audio
    driver: 50, drivers: 8, watt_rms: 600, audio_watt: 200, channels: 7.1,
    // network / ports
    total_mbps: 20000, bands: 4, lan: 8,
    // misc
    weight_lo: 3.5, tdp_lo: 600, process_nm_lo: 10, noise_lo: 50,
    dpi: 32000, polling: 8000, buttons: 15,
    seq_read: 14000, seq_write: 12000, iops: 2000000, tbw: 3000,
    watt: 1600, bandwidth: 2000, boost_clock: 6.5, base_clock: 5.5,
    cores: 64, threads: 128, cache_l3: 128,
    // spec grabs
    suction: 10000, runtime: 300, flight_time: 60, range: 20,
    max_load: 30, max_height: 200, sections: 6, paper_capacity: 1000,
    payload: 10, fov: 180, ppm: 60, tdp: 400, tdp_capacity: 400,
    m2_slots: 8, vrm: 20, fan_size: 200, fan_cfm: 150, fan_slots: 10,
    radiator_mm: 420, max_gpu: 500, max_speed: 100, wind_resist: 15,
    warranty: 10, lamp_life: 30000, io_ports: 16, throw: 3,
    sample_rate: 192000, bit_depth: 32, noise: 50,
    front_camera: 60, main_camera: 200, charging: 120, water_depth: 100,
  };

  function _logScale(val, ref) {
    if (!isFinite(val) || val <= 0 || !isFinite(ref) || ref <= 0) return 0;
    const s = 100 * Math.log(1 + val) / Math.log(1 + ref);
    return Math.max(0, Math.min(100, s));
  }

  function _percentile(sortedAsc, pct) {
    if (!sortedAsc.length) return 0;
    const idx = Math.min(sortedAsc.length - 1, Math.floor((pct / 100) * sortedAsc.length));
    return sortedAsc[idx];
  }

  // Tier caps based on anchor score (GPU for laptops/desktops/gpus, CPU as fallback,
  // chipset for phones/tablets). Prevents mid-segment products from reaching flagship scores.
  // Flagship anchors can reach 100; mid-range capped harder so Redmi/budget devices stay
  // clearly below flagships (epey/versus parity).
  // Tier caps narrowed so the score genuinely reflects the anchor chip's
  // benchmark position. A SoC at rank 86 (e.g. Snapdragon 8 Gen 3) used to be
  // allowed to climb to 92 via brand bonus + 90%+ confidence; that masked the
  // gap between Snapdragon 8 Elite Gen 5 (100) and last year's flagship.
  const TIER_CAPS = [
    { min: 98, cap: 100, tier: 'flagship'      },
    { min: 92, cap: 94,  tier: 'near-flagship' },
    { min: 82, cap: 88,  tier: 'high-end'      },
    { min: 62, cap: 78,  tier: 'upper-mid'     },
    { min: 42, cap: 62,  tier: 'mid'           },
    { min: 22, cap: 46,  tier: 'entry'         },
    { min: 0,  cap: 32,  tier: 'budget'        },
  ];
  const ANCHOR_KEY_BY_CAT = {
    smartphones: ['chipset'], tablets: ['chipset'],
    laptops: ['gpu', 'cpu'], desktops: ['gpu', 'cpu'],
    gpus: ['gpu_rank'], cpus: ['cpu_rank', 'cores'],
    consoles: ['cpu'], 'vr-headsets': ['cpu'],
    smartwatches: ['chipset'], 'smart-rings': ['chipset'],
  };
  function _tierFor(anchorScore) {
    if (anchorScore == null) return null;
    return TIER_CAPS.find(t => anchorScore >= t.min) || TIER_CAPS[TIER_CAPS.length - 1];
  }

  // ─────────────────────────────────────────────────────────────
  //  CALIBRATION — anchor-less cap + Bayesian smoothing
  //
  //  Bug fix (2026-05): "Top Rated" was showing low-credibility brands
  //  (Zyxel modems, no-name routers) with score 100 because
  //    1. ANCHOR_KEY_BY_CAT has no entry for modems / routers / networking
  //       gear, so the flagship tier cap never fires for them.
  //    2. Pass-3 numeric normalization uses the 95th-percentile of THIS
  //       category as the upper bound, so the best-spec product in any
  //       small / sparse category ends up at the top of the 0-100 range
  //       regardless of its absolute spec quality.
  //
  //  We patch this in two minimally invasive ways without touching the
  //  per-spec scoring logic:
  //    - NO_ANCHOR_CAP: hard ceiling for products whose category has no
  //      anchor key (CPU / GPU / chipset benchmark to compare against).
  //    - Bayesian smoothing: pull each product's score toward the
  //      category's *median* in proportion to how few specs it has.
  //      Products with full spec sheets are barely touched; sparse ones
  //      collapse toward the middle and can no longer "win" their
  //      category by default.
  // ─────────────────────────────────────────────────────────────
  const NO_ANCHOR_CAP = 92;          // fallback ceiling when no anchor benchmark exists
  const NO_ANCHOR_CAP_BY_CAT = {
    cpus: 100, gpus: 100, monitors: 100, tvs: 100, ram: 100, ssd: 100,
    psu: 95, motherboards: 96, cameras: 100, lenses: 96, projectors: 100,
    headphones: 94, earphones: 94, speakers: 94, soundbars: 96,
    routers: 90, printers: 90, drones: 96,
    // smartwatches: chipset anchor was added in 2026-05 — anchorless cap kept
    // low so generic AliExpress / TR no-name watches with no detectable SoC
    // cap at 68 even if their spec sheets claim "Bluetooth 5.4 + IP68".
    smartwatches: 68, 'smart-rings': 75,
    tablets: 100, laptops: 100, desktops: 100, smartphones: 100,
    cases: 92, coolers: 94, 'e-readers': 92,
    microphones: 94, 'action-cameras': 96, dashcams: 92, webcams: 92,
    gimbals: 94, tripods: 90, consoles: 98, gamepads: 92,
    'vr-headsets': 98, 'media-players': 92, keyboards: 92, mice: 92,
    'robot-vacuums': 92,
  };

  const CATEGORY_WEIGHT_ALIASES = {
    graphics_cards: 'gpus',
    gpu_coolers: 'coolers',
    cpu_coolers: 'coolers',
    m2_coolers: 'coolers',
    pc_cases: 'cases',
    laptop_docks: 'routers',
    monitor_accessories: 'monitors',
    tv_mounts: 'cases',
    tv_remotes: 'gamepads',
    signage_displays: 'tvs',
    gaming_consoles: 'consoles',
    digital_cameras: 'cameras',
    action_cameras: 'action-cameras',
    video_cameras: 'cameras',
    camera_lenses: 'lenses',
    modem_routers: 'routers',
    wifi_routers: 'routers',
    wifi_repeaters: 'routers',
    access_points: 'routers',
    network_switches: 'routers',
    pcie_nic: 'routers',
    vacuums: 'robot-vacuums',
    e_readers: 'e-readers',
    media_players: 'media-players',
    vr_headsets: 'vr-headsets',
    smart_rings: 'smart-rings',
    smartwatches: 'smartwatches',
    hard_drives: 'ssd',
    external_hdd: 'ssd',
    external_ssd: 'ssd',
    nas_servers: 'ssd',
    flash_drives: 'ssd',
    memory_cards: 'ssd',
    optical_drives: 'ssd',
    powerbanks: 'chargers',
    chargers: 'chargers',
    feature_phones: 'smartphones',
    ups: 'psu',
    case_fans: 'coolers',
    webcams: 'webcams',
    printers: 'printers',
    projectors: 'projectors',
    soundbars: 'soundbars',
    speakers: 'speakers',
    headphones: 'headphones',
    earphones: 'earphones',
    gamepads: 'gamepads',
    keyboards: 'keyboards',
    desktop_keyboards: 'keyboards',
    numeric_keypads: 'keyboards',
    keyboard_accessories: 'keyboards',
    mice: 'mice',
    mouse_pads: 'mice',
    trackballs: 'mice',
    monitors: 'monitors',
    tvs: 'tvs',
    laptops: 'laptops',
    desktops: 'desktops',
    cpus: 'cpus',
    motherboards: 'motherboards',
    ram: 'ram',
    ssd: 'ssd',
    // Newly mapped to keep these categories out of the flat-50 fallback
    audio_systems: 'speakers',
    av_receivers: 'soundbars',
    '3d_printers': 'printers',
    hardware_wallets: 'chargers',
    ip_cameras: 'webcams',
  };

  function _scoreCategoryKey(category) {
    const c = String(category || '').toLowerCase().replace(/-/g, '_');
    return CATEGORY_WEIGHT_ALIASES[c] || CATEGORY_WEIGHT_ALIASES[c.replace(/_/g, '-')] || c;
  }
  const BAYESIAN_K    = 0.45;        // smoothing strength (0 = off, 1 = full pull-to-median)
  const BAYESIAN_MIN_TRUST = 0.30;   // never let trust drop below this floor
  const SCORE_MIN = 10;
  const SCORE_MAX = 100;

  // Year-based hard ceiling (epey/versus parity): a 2018 phone with 32 GB RAM
  // can never reach 2026 flagship territory regardless of spec inflation.
  // Applied AFTER tier caps + decay as a final absolute ceiling.
  function _yearCeiling(year, cat) {
    if (!year) return SCORE_MAX;
    if (year >= 2026) return 100;
    const c = String(cat || '').toLowerCase();
    const fastMoving = /smartphones|tablets|laptops|desktops|gpus|cpus|consoles|vr-headsets|smartwatches|smart-rings|action-cameras|drones|webcams|gamepads/.test(c);
    const display = /monitors|tvs|projectors|e-readers/.test(c);
    if (fastMoving) {
      if (year === 2025) return 100;
      if (year === 2024) return 93;
      if (year === 2023) return 84;
      if (year === 2022) return 76;
      if (year === 2021) return 68;
      if (year === 2020) return 60;
      if (year === 2019) return 52;
      if (year === 2018) return 46;
      if (year === 2017) return 40;
      if (year === 2016) return 34;
      return 28;
    }
    if (display) {
      if (year === 2025) return 100;
      if (year === 2024) return 97;
      if (year === 2023) return 93;
      if (year === 2022) return 88;
      if (year === 2021) return 82;
      if (year === 2020) return 75;
      if (year === 2019) return 68;
      return 60;
    }
    // generic (audio, peripherals, cameras, network gear, ...)
    if (year === 2025) return 100;
    if (year === 2024) return 96;
    if (year === 2023) return 91;
    if (year === 2022) return 85;
    if (year === 2021) return 78;
    if (year === 2020) return 71;
    if (year === 2019) return 64;
    return 56;
  }

  // ─────────────────────────────────────────────────────────────
  //  BRAND MODIFIER (epey/versus parity)
  //  Applies a multiplicative bonus/penalty to the final score
  //  based on brand reputation per category. Apple flagships (iPhone Pro,
  //  iPad Pro, MacBook Pro) get bonus, Redmi/Poco/Realme/Honor X /
  //  Infinix / Tecno / Itel sub-brands get penalty so that flagship
  //  Galaxy/iPhone/Pixel devices stay above mid-tier specs sheets.
  //  iOS/iPadOS/macOS adds an extra +3% (ecosystem premium).
  // ─────────────────────────────────────────────────────────────
  const BRAND_MOD_TABLE = {
    // category-aware multipliers; 1.0 = neutral
    smartphones: {
      // Premium tier — iPhone Pro Max > Pro > Air > base, must show in ranking.
      // 'apple iphone pro max' / 'apple iphone air' have higher specificity
      // (longest-key wins in _brandModifier), so they override generic 'apple'.
      'apple iphone pro max': 1.10,
      'apple iphone pro':     1.08,
      'apple iphone plus':    1.05,
      'apple iphone air':     1.02,   // Air is thin / single-camera / smaller battery — not flagship
      'apple iphone mini':    0.98,
      apple: 1.04,
      'samsung galaxy z fold': 1.07, 'samsung galaxy z flip': 1.04,
      'samsung galaxy z':     1.05,
      'samsung galaxy s ultra': 1.07, 'samsung galaxy s plus': 1.04,
      'samsung galaxy s':     1.03, 'samsung galaxy note': 1.03,
      samsung: 1.01,
      'google pixel pro xl':  1.05, 'google pixel pro': 1.04, 'google pixel a': 0.96,
      'google pixel': 1.02, google: 1.0,
      sony: 1.02, asus: 1.0, 'asus rog': 1.04,
      oneplus: 1.0, 'oneplus pro': 1.03,
      nothing: 1.0,
      huawei: 1.0,
      // Mid penalty
      xiaomi: 0.98, 'xiaomi mix': 1.02, 'xiaomi t pro': 0.98,
      redmi: 0.88, poco: 0.86,
      realme: 0.86, 'honor x': 0.84, honor: 0.94,
      vivo: 0.94, oppo: 0.94, motorola: 0.93,
      // Budget penalty
      infinix: 0.78, tecno: 0.78, itel: 0.70, ulefone: 0.78,
    },
    tablets: {
      apple: 1.07, samsung: 1.03, microsoft: 1.03, lenovo: 1.0,
      huawei: 1.01, xiaomi: 0.98, redmi: 0.92, honor: 0.96,
      'amazon fire': 0.85, alldocube: 0.85, teclast: 0.85,
    },
    laptops: {
      apple: 1.06, 'razer blade': 1.04, asus: 1.02, 'asus rog': 1.04,
      msi: 1.02, lenovo: 1.0, 'lenovo thinkpad': 1.03,
      'lenovo legion': 1.03, dell: 1.0, 'dell xps': 1.04,
      'dell alienware': 1.04, hp: 1.0, 'hp omen': 1.03,
      gigabyte: 1.0, acer: 0.99, 'acer predator': 1.02,
      casper: 0.94, monster: 0.96, 'game garaj': 0.93,
      gameraider: 0.92, exper: 0.93, huawei: 1.0,
    },
    desktops: {
      apple: 1.05, 'razer tomahawk': 1.03, 'asus rog': 1.03,
      'msi mpg': 1.02, alienware: 1.04, lenovo: 1.0,
    },
    // Category key is 'smartwatches' (no hyphen) on PB — the old 'smart-watches'
    // entry never fired and every no-name TR/CN white-label watch got 1.0.
    // Aggressive penalty on white-label brands is intentional: the Top Rated
    // list was being dominated by Sekai / Vothoon / Mobitell / Thorq / Onkatech /
    // Owwotech etc. (per qor admin screenshot, 47 of these reached 100). These
    // brands have no chip, no health sensors, no app ecosystem.
    smartwatches: {
      // Premium tier (real ecosystem + S-series chip)
      apple: 1.10, 'apple watch ultra': 1.12,
      samsung: 1.06, 'samsung galaxy watch': 1.06,
      garmin: 1.08, polar: 1.03,
      huawei: 1.02, 'google pixel watch': 1.04,
      // Mid (real chip but no flagship ecosystem)
      xiaomi: 0.92, 'xiaomi watch s': 0.95, amazfit: 0.88,
      honor: 0.90, fitbit: 0.95,
      // White-label / generic Chinese rebrand — penalty 0.55 keeps them out of
      // the top by construction even with full spec sheets.
      sekai: 0.55, vothoon: 0.55, mobitell: 0.55, thorq: 0.55, onkatech: 0.55,
      owwotech: 0.55, polygold: 0.55, 'haino teko': 0.55, optivals: 0.55,
      winex: 0.55, judas: 0.55, torima: 0.55, spovan: 0.55, lemfo: 0.55,
      gomax: 0.55, sekoia: 0.55, 'i-chrono': 0.6, 'mf product': 0.55,
      redmi: 0.85, oppo: 0.92, oneplus: 0.95, nothing: 0.95,
    },
    'smart-watches': {
      apple: 1.07, samsung: 1.03, garmin: 1.05, huawei: 1.0,
      xiaomi: 0.97, redmi: 0.92, amazfit: 0.95, honor: 0.96,
    },
    headphones: {
      sony: 1.05, bose: 1.05, sennheiser: 1.05, apple: 1.04,
      audeze: 1.06, 'beyerdynamic': 1.04, 'audio-technica': 1.03,
      jbl: 1.0, samsung: 1.0,
      xiaomi: 0.96, redmi: 0.92, honor: 0.95, jlab: 0.92,
    },
    earbuds: {
      apple: 1.06, sony: 1.05, bose: 1.05, samsung: 1.03,
      sennheiser: 1.05, jbl: 1.0,
      xiaomi: 0.96, redmi: 0.93, honor: 0.95, oppo: 0.97,
      jlab: 0.90, anker: 0.95, soundcore: 0.95,
    },
    tvs: {
      sony: 1.05, lg: 1.04, samsung: 1.04, 'sony bravia': 1.05,
      panasonic: 1.03, philips: 1.0, hisense: 0.96, tcl: 0.95,
      xiaomi: 0.94, vestel: 0.92, arçelik: 0.94, beko: 0.92,
    },
    // GPU AIB partner premium — top-tier cards (ROG Strix, Aorus Master,
    // Suprim, FE) earn a small bump; reference/budget AIBs sit neutral.
    gpus: {
      'rog strix': 1.03, 'rog matrix': 1.04, 'tuf gaming': 1.01,
      'aorus master': 1.03, 'aorus xtreme': 1.04,
      'msi suprim': 1.03, 'msi gaming trio': 1.02, 'msi vanguard': 1.02,
      'founders edition': 1.02, 'asus prime': 1.0, palit: 0.99,
      colorful: 0.98, inno3d: 0.98, gainward: 0.98,
    },
  };
  function _brandKey(s) { return String(s || '').toLowerCase().trim(); }

  // Apple iPhone Pro Max / iPhone Pro / iPhone Air / iPhone mini reranking.
  // The brand table can't reliably catch "Apple iPhone 17 Pro Max" because the
  // generation number breaks any contiguous substring match (key="apple iphone
  // pro max" never appears in "apple iphone 17 pro max"). We probe the name
  // for word-boundary suffixes once the brand=apple has been established —
  // this keeps the lookup table clean while still giving Pro Max a real bump
  // over Air without re-listing every generation.
  const APPLE_IPHONE_SUFFIX_MODS = [
    [/\bpro\s*max\b/i, 1.10],
    [/\bultra\b/i,     1.10],
    [/\bpro\b/i,       1.08],
    [/\bplus\b/i,      1.05],
    [/\bair\b/i,       1.02],
    [/\bmini\b/i,      0.97],
  ];
  function _appleIphoneSuffix(name) {
    for (const [re, mod] of APPLE_IPHONE_SUFFIX_MODS) {
      if (re.test(name)) return { mod, suffix: re.source };
    }
    return null;
  }

  function _brandModifier(p, cat) {
    const table = BRAND_MOD_TABLE[cat];
    if (!table) return { mod: 1.0, reason: null };
    const brand = _brandKey(p.brand);
    const name  = _brandKey(p.name);
    let best = 1.0, bestKey = null, bestLen = 0;
    for (const key of Object.keys(table)) {
      const hay = (brand + ' ' + name).trim();
      if (hay.includes(key) && key.length > bestLen) {
        best = table[key]; bestKey = key; bestLen = key.length;
      }
    }
    // Apple iPhone trim-level override (Pro Max / Air / mini etc.)
    if (cat === 'smartphones' && (brand === 'apple' || /apple/.test(name)) && /iphone/.test(name)) {
      const suf = _appleIphoneSuffix(name);
      if (suf && suf.mod !== 1.0 && Math.abs(suf.mod - 1.0) > Math.abs(best - 1.0)) {
        best = suf.mod; bestKey = `apple iphone (${suf.suffix})`;
      }
    }
    // OS bonus (iOS/iPadOS/macOS) — additive +3%
    let osBonus = 0;
    const specs = p.specs || {};
    const osStr = _brandKey(
      specs['Operating System'] || specs['OS'] ||
      specs['İşletim Sistemi'] || specs['Software'] || ''
    );
    if (/\b(ios|ipados|macos|mac os|watchos)\b/.test(osStr) ||
        (cat === 'smartphones' && brand === 'apple') ||
        (cat === 'tablets' && brand === 'apple') ||
        (cat === 'laptops' && /macbook/.test(name))) {
      osBonus = 0.03;
    }
    return { mod: best + osBonus, reason: bestKey, osBonus };
  }

  function _yearScore(year) {
    if (!year) return null;
    if (year >= 2026) return 100;
    if (year === 2025) return 96;
    if (year === 2024) return 90;
    if (year === 2023) return 82;
    if (year === 2022) return 73;
    if (year === 2021) return 63;
    if (year === 2020) return 53;
    if (year === 2019) return 43;
    if (year === 2018) return 35;
    if (year === 2017) return 28;
    if (year === 2016) return 22;
    if (year === 2015) return 17;
    return 12;
  }

  // Year decay table: fast-moving categories age harder than displays.
  // Calibrated for 2026: 2026=1.0, 2025 already takes a small hit, older
  // years decay harder so a 2020 flagship can't out-rank a 2025 mid-range
  // on raw spec count alone.
  function _yearDecay(year, cat) {
    if (!year) return 1.0;
    if (year >= 2026) return 1.0;
    const c = String(cat || '').toLowerCase();
    const fastMoving = /smartphones|tablets|laptops|desktops|gpus|cpus|consoles|vr-headsets/.test(c);
    const display = /monitors|tvs|projectors/.test(c);
    if (fastMoving) {
      if (year === 2025) return 0.97;
      if (year === 2024) return 0.91;
      if (year === 2023) return 0.83;
      if (year === 2022) return 0.74;
      if (year === 2021) return 0.66;
      if (year === 2020) return 0.58;
      if (year === 2019) return 0.50;
      if (year === 2018) return 0.43;
      if (year === 2017) return 0.37;
      if (year === 2016) return 0.32;
      return 0.27;
    }
    if (display) {
      if (year === 2025) return 0.98;
      if (year === 2024) return 0.95;
      if (year === 2023) return 0.92;
      if (year === 2022) return 0.88;
      if (year === 2021) return 0.84;
      if (year === 2020) return 0.78;
      return 0.72;
    }
    if (year === 2025) return 0.97;
    if (year === 2024) return 0.93;
    if (year === 2023) return 0.89;
    if (year === 2022) return 0.84;
    if (year === 2021) return 0.79;
    if (year === 2020) return 0.74;
    return 0.68;
  }

  // ─────────────────────────────────────────────────────────────
  //  PRIMITIVES
  // ─────────────────────────────────────────────────────────────

  function _foldText(s) {
    return String(s || '')
      .replace(/İ/g, 'I').replace(/ı/g, 'i')
      .replace(/Ş/g, 'S').replace(/ş/g, 's')
      .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
      .replace(/Ü/g, 'U').replace(/ü/g, 'u')
      .replace(/Ö/g, 'O').replace(/ö/g, 'o')
      .replace(/Ç/g, 'C').replace(/ç/g, 'c')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }
  function _normKey(s) { return _foldText(s).replace(/[\s_\-:()\/.]+/g, ''); }

  function _firstNumber(s) {
    if (s == null) return null;
    if (typeof s === 'number') return isFinite(s) ? s : null;
    const m = String(s).replace(/\u00a0/g, ' ').match(/-?\d+([.,]\d+)?/);
    if (!m) return null;
    const n = parseFloat(m[0].replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  // Parse a memory/storage spec value into GB (handles TB / GB / MB / KB).
  // "2TB" → 2048 | "512GB" → 512 | "16384MB" → 16 | "16 GB" → 16 | "16" → 16
  function _parseGb(s) {
    if (s == null) return null;
    if (typeof s === 'number') return isFinite(s) ? s : null;
    const str = String(s).replace(/\u00a0/g, ' ').trim();
    const m = str.match(/(\d+(?:[.,]\d+)?)\s*(tb|gb|mb|kb|t|g|m|k)?/i);
    if (!m) return null;
    const n = parseFloat(m[1].replace(',', '.'));
    if (!isFinite(n)) return null;
    const unit = (m[2] || 'gb').toLowerCase();
    if (unit === 'tb' || unit === 't') return n * 1024;
    if (unit === 'gb' || unit === 'g') return n;
    if (unit === 'mb' || unit === 'm') return n / 1024;
    if (unit === 'kb' || unit === 'k') return n / (1024 * 1024);
    return n;
  }

  function _parseRamGbFromText(s) {
    const text = String(s || '');
    const m = text.match(/(\d+(?:[.,]\d+)?)\s*(tb|gb)\s*(?:ddr|lpddr|sdram|ram|memory|bellek)/i);
    if (m) return _parseGb(`${m[1]} ${m[2]}`);
    const m2 = text.match(/\b(?:ram|memory|bellek)\D{0,16}(\d+(?:[.,]\d+)?)\s*(tb|gb)\b/i);
    return m2 ? _parseGb(`${m2[1]} ${m2[2]}`) : null;
  }

  function _parseStorageGbFromText(s) {
    const text = String(s || '');
    const m = text.match(/(\d+(?:[.,]\d+)?)\s*(tb|gb)\s*(?:ssd|hdd|nvme|storage|depolama|disk)/i);
    if (m) return _parseGb(`${m[1]} ${m[2]}`);
    const m2 = text.match(/\b(?:ssd|hdd|nvme|storage|depolama|disk)\D{0,16}(\d+(?:[.,]\d+)?)\s*(tb|gb)\b/i);
    return m2 ? _parseGb(`${m2[1]} ${m2[2]}`) : null;
  }

  // Clean a GPU model string to its canonical short name.
  // "NVIDIA GeForce RTX 5060 115W" → "RTX 5060"
  // "AMD Radeon RX 7600M XT"        → "RX 7600M XT"
  // "Intel Arc A770M"               → "Arc A770M"
  function _cleanGpuModel(s) {
    if (!s) return s;
    let str = String(s).trim();
    // Strip vendor / brand prefixes
    str = str.replace(/\b(nvidia|amd|intel|geforce|radeon|asus|msi|gigabyte|zotac|sapphire|powercolor|xfx|evga|palit|inno3d|colorful)\b/gi, ' ');
    // Strip TDP / power suffixes like "115W"
    str = str.replace(/\b\d+\s*w\b/gi, ' ');
    // Strip extra noise like "Laptop GPU", "Mobile" markers (we keep "Laptop" actually since rank list has it)
    str = str.replace(/\bgpu\b/gi, ' ');
    // Collapse whitespace
    str = str.replace(/\s+/g, ' ').trim();
    return str;
  }
  function _firstNumberAfter(s, marker) {
    if (s == null) return null;
    const m = String(s).match(new RegExp(marker + '\\D{0,3}(\\d+([.,]\\d+)?)', 'i'));
    return m ? parseFloat(m[1].replace(',', '.')) : null;
  }

  // Fetch by candidate field names from flat specs + nested specSections
  function _lookupRaw(p, candidates) {
    const specs = p.specs || {};
    const keySpecs = p.keySpecs || {};
    const specsEn = p.specsEn || {};
    const sections = p.specSections || {};
    const multiLangSpecs = p.multiLangSpecs || {};
    const wantSet = new Set(candidates.map(_normKey));

    // Build a unified [key, value, sectionName] list. Epey, Icecat, repaired
    // English specs and admin keySpecs all use different labels; score v7
    // treats them as one canonical probe surface.
    const flatPairs = [];
    function pushMap(obj, sectionPrefix) {
      if (!obj || typeof obj !== 'object') return;
      for (const [k, v] of Object.entries(obj)) {
        const cleanKey = String(k || '').replace(/\s*:\s*$/, '');
        if (v != null && typeof v === 'object' && !Array.isArray(v)) {
          for (const [k2, v2] of Object.entries(v)) {
            flatPairs.push([String(k2 || '').replace(/\s*:\s*$/, ''), v2, sectionPrefix || cleanKey]);
          }
        } else {
          flatPairs.push([cleanKey, v, sectionPrefix || '']);
        }
      }
    }
    pushMap(keySpecs, 'keySpecs');
    pushMap(specsEn, 'specsEn');
    pushMap(specs, '');
    if (multiLangSpecs && typeof multiLangSpecs === 'object') {
      pushMap(multiLangSpecs.en, 'multiLangSpecs.en');
      pushMap(multiLangSpecs.tr, 'multiLangSpecs.tr');
    }
    for (const [k, v] of Object.entries(specs)) {
      if (v != null && typeof v === 'object' && !Array.isArray(v)) {
        for (const [k2, v2] of Object.entries(v)) flatPairs.push([k2, v2, k]);
      } else {
        flatPairs.push([k, v, '']);
      }
    }
    for (const [secName, sec] of Object.entries(sections)) {
      if (sec && typeof sec === 'object') {
        for (const [k, v] of Object.entries(sec)) flatPairs.push([k, v, secName]);
      }
    }

    // Direct match (normalized key equals candidate)
    for (const [k, v, sec] of flatPairs) {
      if (wantSet.has(_normKey(k)) && v != null && String(v).trim() !== '') {
        return { key: sec ? `${sec}/${k}` : k, value: v };
      }
    }
    // Substring fallback (key contains candidate, longest candidate first)
    const sortedCands = candidates.slice().sort((a, b) => b.length - a.length);
    for (const cand of sortedCands) {
      const cn = _normKey(cand);
      for (const [k, v, sec] of flatPairs) {
        if (_normKey(k).includes(cn) && v != null && String(v).trim() !== '') {
          return { key: sec ? `${sec}/${k}` : k, value: v };
        }
      }
    }
    return null;
  }

  function _lookupStr(p, fieldKey) {
    const cands = FIELDS[fieldKey] || [fieldKey];
    const hit = _lookupRaw(p, cands);
    return hit ? String(hit.value) : null;
  }

  function _allSpecText(p) {
    const chunks = [p?.name || '', p?.brand || ''];
    function walk(v) {
      if (v == null) return;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        chunks.push(String(v));
      } else if (Array.isArray(v)) {
        v.forEach(walk);
      } else if (typeof v === 'object') {
        for (const [k, val] of Object.entries(v)) {
          chunks.push(String(k));
          walk(val);
        }
      }
    }
    walk(p?.keySpecs);
    walk(p?.specsEn);
    walk(p?.specs);
    walk(p?.specSections);
    return chunks.join(' ');
  }

  function _featureScore(p, kind) {
    const text = _foldText(_allSpecText(p));
    let score = 0;
    if (kind === 'camera_system') {
      if (/prores|dolby vision|apple log|raw/.test(text)) score += 18;
      if (/ois|optical image stabilization|optik goruntu|sensor-shift/.test(text)) score += 16;
      if (/telephoto|periscope|optical zoom|optik zoom/.test(text)) score += 16;
      if (/ultra wide|extra wide|ekstra genis|macro/.test(text)) score += 12;
      if (/lidar|tof|laser/.test(text)) score += 10;
      if (/4k|2160p/.test(text)) score += 10;
      if (/8k|4320p/.test(text)) score += 8;
      if (/hdr/.test(text)) score += 6;
      if (/third rear camera|ucuncu arka kamera/.test(text)) score += 4;
      return score ? { score: Math.min(100, score + 20), type: 'lookup', raw: 'camera feature stack', source: 'camera_system' } : null;
    }
    if (kind === 'display_features') {
      if (/ltpo|promotion|adaptive/.test(text)) score += 22;
      if (/dolby vision/.test(text)) score += 18;
      if (/hdr10\+|hdr10|hdr/.test(text)) score += 14;
      if (/dci-p3|wide color|renk uzayi|color gamut/.test(text)) score += 12;
      if (/always-on|always on|surekli acik/.test(text)) score += 8;
      const nit = [...text.matchAll(/(\d{3,4})\s*(?:cd\/m|nit)/g)]
        .map(m => parseInt(m[1], 10)).filter(Boolean);
      if (nit.length) score += Math.min(18, Math.max(...nit) >= 2500 ? 18 : Math.max(...nit) >= 1500 ? 12 : 6);
      return score ? { score: Math.min(100, score + 15), type: 'lookup', raw: 'display feature stack', source: 'display_features' } : null;
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────
  //  RANK MATCHING (longest prefix wins, then interpolation)
  // ─────────────────────────────────────────────────────────────

  function _matchRank(model, list) {
    if (!model) return null;
    const lower = _foldText(model);
    let best = null;
    for (const [name, score] of list) {
      const nm = _foldText(name);
      if (lower.includes(nm)) {
        if (!best || nm.length > best.len) best = { score, len: nm.length, key: name, exact: true };
      }
    }
    if (best) return { score: best.score, exact: true, key: best.key };
    // Interpolation
    return _interpolateRank(model, list);
  }

  function _interpolateRank(model, list) {
    const ml = String(model).toLowerCase();
    for (const fam of FAMILIES) {
      const fl = fam.toLowerCase();
      if (!ml.includes(fl)) continue;
      const re = new RegExp(fl.replace(/\s+/g, '\\s*') + '\\s*([a-z]?-?\\d{3,5})', 'i');
      const m = model.match(re);
      if (!m) continue;
      const num = parseInt(m[1].replace(/\D/g, ''), 10);
      if (!num) continue;
      const sameFam = list.map(([k, s]) => {
        if (!k.toLowerCase().includes(fl)) return null;
        const km = k.match(re);
        if (!km) return null;
        return [parseInt(km[1].replace(/\D/g, ''), 10), s];
      }).filter(x => x && x[0]);
      if (sameFam.length < 2) continue;
      sameFam.sort((a, b) => a[0] - b[0]);
      let lo = null, hi = null;
      for (const [n, s] of sameFam) { if (n <= num) lo = [n, s]; if (n >= num && !hi) hi = [n, s]; }
      if (lo && hi && lo[0] !== hi[0]) {
        const t = (num - lo[0]) / (hi[0] - lo[0]);
        return { score: lo[1] + t * (hi[1] - lo[1]), exact: false, key: `${fam} ${num} (interp ${lo[0]}↔${hi[0]})` };
      }
      // Out-of-range or single-anchor family. Do NOT extrapolate upward —
      // an unknown "RTX 9999" or "Apple A99" might be a typo, a future SKU,
      // or a workstation/marketing label. Clamp to nearest known score and
      // mark inexact so tier caps stay honest.
      const nearest = (lo || hi)[1];
      return { score: nearest, exact: false, key: `${fam} ${num} (nearest)` };
    }
    return null;
  }

  function _matchLookup(value, table) {
    if (!value) return null;
    const lower = _foldText(value);
    let best = null;
    for (const [name, score] of table) {
      const nm = _foldText(name);
      if (lower.includes(nm)) {
        if (!best || nm.length > best.len) best = { score, len: nm.length, key: name };
      }
    }
    return best ? { score: best.score, key: best.key } : null;
  }

  // Year extraction
  function _extractYear(p) {
    const candidates = ['Release Date', 'Release Year', 'Announcement Date', 'Duyurulma Tarihi', 'Tanıtım Tarihi', 'Tanitim Tarihi', 'Çıkış Tarihi', 'Cikis Tarihi', 'Çıkış Yılı'];
    const hit = _lookupRaw(p, candidates);
    if (hit) {
      const m = String(hit.value).match(/(20\d{2}|19\d{2})/);
      if (m) return parseInt(m[1], 10);
    }
    if (p.scrapedAt) { const d = new Date(p.scrapedAt); if (!isNaN(d.getFullYear())) return d.getFullYear(); }
    if (p.created) { const d = new Date(p.created); if (!isNaN(d.getFullYear())) return d.getFullYear(); }
    return null;
  }

  // ─────────────────────────────────────────────────────────────
  //  SPEC EXTRACTORS  (return {value: 0-100, raw, parsed} or null)
  //  - 'rank' specs return absolute 0-100
  //  - 'lookup' specs return absolute 0-100
  //  - 'numeric' specs return RAW number (normalized in pass-2)
  //  - 'numeric_lo' specs return RAW number for lower-better
  // ─────────────────────────────────────────────────────────────

  // Returns: { score: 0-100|raw, type: 'rank|lookup|num|num_lo', raw: string, parsed: any, source: key }
  function _extract(p, weightKey, productCategory) {
    const cat = String(productCategory || '').toLowerCase();
    const isLaptop = /laptop|notebook|macbook/.test(cat);

    switch (weightKey) {
      // ── RANK SPECS ──
      case 'cpu': {
        const s = _lookupStr(p, 'cpu') || p.name || _allSpecText(p);
        if (!s) return null;
        const list = isLaptop ? CPU_LAPTOP : (cat === 'cpus' || cat === 'desktops' ? CPU_DESKTOP : CPU_LAPTOP);
        const m = _matchRank(s, list);
        return m && { score: m.score, type: 'rank', raw: s, source: m.key, exact: m.exact };
      }
      case 'cpu_rank': {
        const list = isLaptop ? CPU_LAPTOP : CPU_DESKTOP;
        const candidates = [_lookupStr(p, 'cpu'), p.name].filter(Boolean);
        for (const s of candidates) {
          const m = _matchRank(s, list);
          if (m) return { score: m.score, type: 'rank', raw: s, source: m.key, exact: m.exact };
        }
        return null;
      }
      case 'gpu': {
        const s = _lookupStr(p, 'gpu') || p.name || _allSpecText(p);
        if (!s) return null;
        const cleaned = _cleanGpuModel(s);
        const list = isLaptop ? GPU_LAPTOP : GPU_DESKTOP;
        const m = _matchRank(cleaned, list) || _matchRank(s, list);
        return m && { score: m.score, type: 'rank', raw: s, source: m.key, exact: m.exact };
      }
      case 'gpu_rank': {
        // For "gpus" category — name is the model itself
        const raw = _lookupStr(p, 'gpu') || p.name || '';
        const cleaned = _cleanGpuModel(raw);
        const m = _matchRank(cleaned, GPU_DESKTOP) || _matchRank(raw, GPU_DESKTOP);
        return m && { score: m.score, type: 'rank', raw: raw, source: m.key, exact: m.exact };
      }
      case 'chipset': {
        const specific = _lookupRaw(p, ['Yonga Seti (Chipset)', 'Chipset', 'System Chip', 'SoC', 'Yonga Seti']);
        const candidates = [specific && String(specific.value), _lookupStr(p, 'chipset'), p.name].filter(Boolean);
        for (const s of candidates) {
          const m = _matchRank(s, CHIPSET_PHONE);
          if (m) return { score: m.score, type: 'rank', raw: s, source: m.key, exact: m.exact };
        }
        return null;
      }
      // ── LOOKUP SPECS ──
      case 'panel': return _l(p, 'panel', LOOKUPS.panel);
      case 'resolution': return _l(p, 'resolution', LOOKUPS.resolution);
      case 'hdr': {
        const ranked = _l(p, 'hdr', LOOKUPS.hdr) || _l(p, 'panel', LOOKUPS.hdr);
        if (ranked) return ranked;
        const yes = _hasBool(p, ['HDR', 'High Dynamic Range']);
        return yes ? { ...yes, score: yes.score ? 75 : 0, type: 'bool' } : null;
      }
      case 'wifi': return _l(p, 'wifi', LOOKUPS.wifi);
      case 'wifi_gen': return _l(p, 'wifi', LOOKUPS.wifi);
      case 'bluetooth': return _l(p, 'bluetooth', LOOKUPS.bluetooth);
      case 'codec': return _l(p, 'codec', LOOKUPS.codec);
      case 'efficiency': return _l(p, 'efficiency', LOOKUPS.psu_efficiency);
      case 'lan_speed': return _l(p, 'wifi', LOOKUPS.lan_speed) || _l(p, 'lan', LOOKUPS.lan_speed);
      case 'smart_os': return _l(p, 'panel', LOOKUPS.smart_os) || _hitOnAny(p, LOOKUPS.smart_os);
      case 'network_5g': {
        const ranked = _l(p, 'network_5g', LOOKUPS.network_5g);
        if (ranked) return ranked;
        const yes = _hasBool(p, ['5G', '5G Support', '5G Desteği']);
        return yes ? { ...yes, score: yes.score ? 100 : 0, type: 'bool' } : null;
      }
      case 'display_features': return _featureScore(p, 'display_features');
      case 'sensor_size_phone': return _l(p, 'sensor', LOOKUPS.sensor_size_phone);
      case 'camera_system': return _featureScore(p, 'camera_system');
      case 'ip_rating':
      case 'water_resistance': return _l(p, 'ip_rating', LOOKUPS.ip_rating);
      case 'csensor': return _l(p, 'sensor', LOOKUPS.csensor);
      case 'panel_switch': return _l(p, 'switch', LOOKUPS.panel_switch);
      case 'keyboard_type': return _l(p, 'type', LOOKUPS.keyboard_type) || _l(p, 'switch', LOOKUPS.keyboard_type);
      case 'case_form': return _l(p, 'type', LOOKUPS.case_form) || _l(p, 'panel', LOOKUPS.case_form);
      case 'cooler_type': return _l(p, 'type', LOOKUPS.cooler_type);
      case 'headphone_water': return _l(p, 'ip_rating', LOOKUPS.headphone_water);
      case 'connection_quality': {
        const s = _lookupStr(p, 'type') || _lookupStr(p, 'wifi') || _lookupStr(p, 'bluetooth') || '';
        if (/tam\s*kablosuz|true\s*wireless|tws/i.test(s)) return { score: 92, type: 'lookup', raw: s || 'true wireless' };
        if (/kablosuz|wireless|bluetooth/i.test(s)) return { score: 82, type: 'lookup', raw: s || 'wireless' };
        if (/usb-c|type-c|lightning/i.test(s)) return { score: 60, type: 'lookup', raw: s || 'digital wired' };
        if (/kablolu|wired|3\.5|aux/i.test(s)) return { score: 42, type: 'lookup', raw: s || 'wired' };
        return null;
      }

      // ── NUMERIC (higher better) ──
      case 'ram': {
        const s = _lookupStr(p, 'ram') || p.name || _allSpecText(p);
        if (s == null) return null;
        const n = _parseRamGbFromText(s) ?? _parseGb(s);
        return n == null ? null : { score: n, type: 'num', raw: s };
      }
      case 'storage': {
        const s = _lookupStr(p, 'storage') || p.name || _allSpecText(p);
        if (s == null) return null;
        const n = _parseStorageGbFromText(s) ?? _parseGb(s);
        return n == null ? null : { score: n, type: 'num', raw: s };
      }
      case 'battery': return _num(p, 'battery');
      case 'battery_life': {
        const life = _num(p, 'battery_life');
        if (life) return life;
        if (/headphones|earphones/i.test(cat)) return null;
        return _num(p, 'battery');
      }
      case 'charging': return _num(p, 'charging');
      case 'screen_size': return _num(p, 'screen_size');
      case 'refresh': return _num(p, 'refresh');
      case 'main_camera': return _num(p, 'main_camera');
      case 'front_camera': return _num(p, 'front_camera');
      case 'release_year': {
        const year = _extractYear(p);
        const score = _yearScore(year);
        return score == null ? null : { score, type: 'lookup', raw: String(year), source: 'release_year' };
      }
      case 'vram': {
        const n = _firstNumber(_lookupStr(p, 'vram'));
        return n ? { score: n, type: 'num', raw: n + ' GB' } : null;
      }
      case 'bandwidth': return _num(p, 'bandwidth');
      case 'boost_clock': return _num(p, 'boost_clock');
      case 'base_clock': return _num(p, 'base_clock');
      case 'cores': return _num(p, 'cores');
      case 'threads': return _num(p, 'threads');
      case 'cache_l3': return _num(p, 'cache_l3');
      case 'igpu': return _hasBool(p, ['Integrated Graphics', 'iGPU', 'Tümleşik']);
      case 'ram_speed': return _num(p, 'ram_speed');
      case 'ram_gen': {
        const s = _lookupStr(p, 'ram') || _lookupStr(p, 'ram_speed') || '';
        if (/ddr5/i.test(s)) return { score: 100, type: 'lookup', raw: 'DDR5' };
        if (/ddr4/i.test(s)) return { score: 70, type: 'lookup', raw: 'DDR4' };
        if (/ddr3/i.test(s)) return { score: 40, type: 'lookup', raw: 'DDR3' };
        return null;
      }
      case 'dual_channel': return _hasBool(p, ['Dual Channel', 'Çift Kanal']);
      case 'seq_read': return _num(p, 'seq_read');
      case 'seq_write': return _num(p, 'seq_write');
      case 'iops': return _num(p, 'iops');
      case 'interface': {
        const s = _lookupStr(p, 'interface') || '';
        if (/pcie 5|gen5/i.test(s)) return { score: 100, type: 'lookup', raw: 'PCIe 5.0' };
        if (/pcie 4|gen4|nvme/i.test(s)) return { score: 80, type: 'lookup', raw: 'PCIe 4.0/NVMe' };
        if (/pcie 3|gen3/i.test(s)) return { score: 60, type: 'lookup', raw: 'PCIe 3.0' };
        if (/sata/i.test(s)) return { score: 35, type: 'lookup', raw: 'SATA' };
        return null;
      }
      case 'tbw': return _num(p, 'tbw');
      case 'watt': return _num(p, 'watt');
      case 'modular': return _hasBool(p, ['Modular', 'Modüler']);
      case 'warranty': return _num(p, 'warranty');
      case 'fan_size': return _num(p, 'fan_size');
      case 'driver': return _num(p, 'driver');
      case 'anc': return _hasBool(p, ['ANC', 'Active Noise', 'Gürültü Engelleme']);
      case 'watt_rms': return _num(p, 'watt_rms') || _num(p, 'watt');
      case 'channels': {
        const s = _lookupStr(p, 'channels') || '';
        const m = s.match(/(\d)\.(\d)/);
        if (m) return { score: parseInt(m[1], 10) + parseFloat('0.' + m[2]), type: 'num', raw: s };
        return _num(p, 'channels');
      }
      case 'megapixels': return _num(p, 'megapixels');
      case 'iso': return _num(p, 'iso');
      case 'fps_burst': return _num(p, 'fps_burst');
      case 'video_res': {
        const s = _lookupStr(p, 'video_res') || _lookupStr(p, 'resolution') || '';
        if (/8k/i.test(s)) return { score: 100, type: 'lookup', raw: '8K' };
        if (/4k|2160/i.test(s)) return { score: 85, type: 'lookup', raw: '4K' };
        if (/1440|2k/i.test(s)) return { score: 70, type: 'lookup', raw: '1440p' };
        if (/1080/i.test(s)) return { score: 55, type: 'lookup', raw: '1080p' };
        if (/720/i.test(s)) return { score: 30, type: 'lookup', raw: '720p' };
        return null;
      }
      case 'ibis': return _hasBool(p, ['Image Stabilization', 'IBIS', 'Stabilization']);
      case 'shutter': return _num(p, 'shutter');
      case 'evf': return _hasBool(p, ['EVF', 'Viewfinder', 'Vizör']);
      case 'aperture': return _num(p, 'aperture');
      case 'focal': return _num(p, 'focal');
      case 'ois': return _hasBool(p, ['OIS', 'Optical Stabilization', 'Optik Sabitleme']);
      case 'min_focus': return _num(p, 'min_focus');
      case 'mount': return _hitOnAny(p, [['E-Mount', 80], ['RF Mount', 80], ['Z Mount', 80], ['L-Mount', 75], ['EF', 60], ['F Mount', 60], ['M43', 70]]);
      case 'weather_seal': return _hasBool(p, ['Weather Sealed', 'Weatherproof', 'Hava Koşullarına']);
      case 'dpi': return _num(p, 'dpi');
      case 'polling': return _num(p, 'polling');
      case 'buttons': return _num(p, 'buttons');
      case 'wireless': return _hasBool(p, ['Wireless', 'Kablosuz']);
      case 'rgb': return _hasBool(p, ['RGB', 'RGB Backlit']);
      case 'hot_swap': return _hasBool(p, ['Hot Swap', 'Hot-Swappable', 'Hot-Swap']);
      case 'ergonomic': return _hasBool(p, ['Ergonomic', 'Ergonomik']);
      case 'layout': return _hasBool(p, ['NKRO', 'N-Key Rollover', 'Anti-Ghosting']);
      case 'total_mbps': return _num(p, 'total_mbps');
      case 'bands': {
        const s = _lookupStr(p, 'bands') || '';
        if (/quad|4-band/i.test(s)) return { score: 100, type: 'lookup', raw: 'Quad-Band' };
        if (/tri|3-band/i.test(s)) return { score: 80, type: 'lookup', raw: 'Tri-Band' };
        if (/dual|2-band/i.test(s)) return { score: 55, type: 'lookup', raw: 'Dual-Band' };
        return _num(p, 'bands');
      }
      case 'lan': return _num(p, 'lan');
      case 'mesh': return _hasBool(p, ['Mesh', 'Mesh Wi-Fi']);
      case 'usb': return _hasBool(p, ['USB Port', 'USB']);
      case 'vpn': return _hasBool(p, ['VPN', 'OpenVPN', 'WireGuard']);
      case 'range': return _num(p, 'range');
      case 'flight_time': return _num(p, 'flight_time');
      case 'suction': return _num(p, 'suction');
      case 'runtime': return _num(p, 'runtime') || _num(p, 'flight_time');
      case 'fov': return _num(p, 'fov');
      case 'lumens': return _num(p, 'lumens');
      case 'contrast': return _num(p, 'contrast');
      case 'lamp_life': return _num(p, 'lamp_life');
      case 'audio_watt': return _num(p, 'audio_watt') || _num(p, 'watt');
      case 'color_gamut': return _num(p, 'color_gamut');
      case 'sample_rate': return _num(p, 'sample_rate');
      case 'bit_depth': return _num(p, 'bit_depth');
      // ── LOWER-BETTER (raw passed through, will be inverted in pass-2) ──
      case 'weight_lo': return _numLo(p, 'weight');
      case 'tdp_lo': return _numLo(p, 'tdp');
      case 'process_nm_lo': return _numLo(p, 'process_nm');
      case 'noise_lo': return _numLo(p, 'noise');
      case 'response_ms_lo': return _numLo(p, 'response_ms');
      case 'aperture_lo': return _numLo(p, 'aperture');
      case 'min_focus_lo': return _numLo(p, 'min_focus');
      case 'min_height_lo': return _numLo(p, 'screen_size'); // no specific field, fallback
      case 'ram_cas_lo': return _numLo(p, 'ram_cas');
      // ── BOOLEAN/PRESENCE ──
      case 'curved': return _hasBool(p, ['Curved', 'Eğik']);
      case 'has_sub': return _hasBool(p, ['Subwoofer', 'Sub']);
      case 'hdmi_earc': return _hasBool(p, ['eARC', 'HDMI ARC']);
      case 'hdmi21': return _hasBool(p, ['HDMI 2.1']);
      case 'atmos': return _hasBool(p, ['Dolby Atmos', 'DTS:X']);
      case 'has_screen': return _hasBool(p, ['Screen', 'Display', 'Ekran']);
      case 'has_mic': return _hasBool(p, ['Microphone', 'Mikrofon']);
      case 'autofocus': return _hasBool(p, ['Autofocus', 'Auto Focus']);
      case 'privacy': return _hasBool(p, ['Privacy Shutter', 'Privacy Cover']);
      case 'low_light': return _hasBool(p, ['Low Light', 'HDR', 'Night Mode']);
      case 'gps': return _hasBool(p, ['GPS']);
      case 'parking': return _hasBool(p, ['Parking Mode']);
      case 'night_vision': return _hasBool(p, ['Night Vision', 'Night Mode']);
      case 'dual_cam': return _hasBool(p, ['Dual Camera', 'Front & Rear']);
      case 'max_storage': return _num(p, 'storage');
      case 'foldable': return _hasBool(p, ['Foldable', 'Katlanabilir']);
      case 'ai_track': return _hasBool(p, ['AI Tracking', 'Auto Tracking']);
      case 'axes': {
        const n = _num(p, 'axes');
        if (n) return n;
        const b = _hasBool(p, ['3-Axis']);
        if (b) return { score: 100, type: 'lookup', raw: '3-Axis' };
        return null;
      }
      case 'payload': return _num(p, 'payload');
      case 'max_load': return _num(p, 'max_load');
      case 'max_height': return _num(p, 'max_height');
      case 'sections': return _num(p, 'sections');
      case 'head_type': return _hasBool(p, ['Ball Head', 'Pan Tilt']);
      case 'material': {
        const s = _lookupStr(p, 'type') || '';
        if (/carbon/i.test(s)) return { score: 100, type: 'lookup', raw: 'Carbon Fiber' };
        if (/aluminum/i.test(s)) return { score: 70, type: 'lookup', raw: 'Aluminum' };
        return null;
      }
      case 'supports_4k': return _hasBool(p, ['4K', '2160p']);
      case 'supports_120': return _hasBool(p, ['120Hz', '120 Hz']);
      case 'supports_8k': return _hasBool(p, ['8K', '4320p']);
      case 'ray_tracing': return _hasBool(p, ['Ray Tracing', 'RT Cores']);
      case 'controller': return _hasBool(p, ['Controller Included', 'Bundled Controller']);
      case 'online_sub': return _hasBool(p, ['Online', 'Subscription']);
      case 'haptic': return _hasBool(p, ['Haptic', 'Rumble', 'Titreşim']);
      case 'adaptive': return _hasBool(p, ['Adaptive Trigger', 'Adaptive Triggers']);
      case 'hall_effect': return _hasBool(p, ['Hall Effect', 'Magnetic']);
      case 'platform': {
        const s = _lookupStr(p, 'type') || '';
        let count = 0;
        ['PC', 'PlayStation', 'PS5', 'PS4', 'Xbox', 'Switch', 'Mobile'].forEach(x => { if (new RegExp(x, 'i').test(s)) count++; });
        return count ? { score: Math.min(100, count * 25), type: 'num', raw: `${count} platforms` } : null;
      }
      case 'standalone': return _hasBool(p, ['Standalone']);
      case 'tracking': {
        const s = _lookupStr(p, 'type') || '';
        if (/inside.?out/i.test(s)) return { score: 90, type: 'lookup', raw: 'Inside-Out' };
        if (/outside.?in/i.test(s)) return { score: 100, type: 'lookup', raw: 'Outside-In' };
        return null;
      }
      case 'audio_formats': return _hasBool(p, ['Dolby Atmos', 'DTS', 'TrueHD']);
      case 'ethernet': return _hasBool(p, ['Ethernet', 'LAN']);
      case 'sensors': {
        const all = JSON.stringify(p.specs || {}) + JSON.stringify(p.specSections || {});
        let count = 0;
        ['Heart Rate', 'SpO2', 'ECG', 'GPS', 'Accelerometer', 'Gyroscope', 'Compass', 'Altimeter', 'Skin Temperature', 'Stress'].forEach(x => { if (new RegExp(x, 'i').test(all)) count++; });
        return count ? { score: Math.min(100, count * 12), type: 'num', raw: `${count} sensors` } : null;
      }
      case 'lte': return _hasBool(p, ['LTE', 'eSIM', 'Cellular']);
      case 'health': return _hasBool(p, ['Heart Rate', 'SpO2', 'ECG']);
      case 'water_depth': {
        const s = _lookupStr(p, 'ip_rating') || '';
        const m = s.match(/(\d+)\s*m/i); if (m) return { score: parseFloat(m[1]), type: 'num', raw: s };
        return null;
      }
      case 'battery_days': return _num(p, 'battery_life');
      case 'frontlight': return _hasBool(p, ['Frontlight', 'Backlight', 'Warm Light']);
      case 'stylus': return _hasBool(p, ['Stylus', 'Pen Support']);
      case 'sensor_count':
      case 'fan_slots': return _num(p, 'fan_size');
      case 'radiator': return _hasBool(p, ['Radiator', '360mm', '280mm', '240mm']);
      case 'radiator_mm': return _num(p, 'radiator');
      case 'max_gpu': return _num(p, 'max_gpu');
      case 'dust_filter': return _hasBool(p, ['Dust Filter']);
      case 'io_ports': return _num(p, 'io_ports');
      case 'fan_cfm': return _num(p, 'fan_cfm');
      case 'tdp': return _num(p, 'tdp');
      case 'tdp_capacity': return _num(p, 'tdp');
      case 'chipset_tier': {
        const s = _lookupStr(p, 'chipset') || '';
        if (/x870e|z890|x870|x670e|z790/i.test(s)) return { score: 100, type: 'lookup', raw: s };
        if (/x670|z690|b850|b760/i.test(s)) return { score: 75, type: 'lookup', raw: s };
        if (/b650|b660|h770/i.test(s)) return { score: 60, type: 'lookup', raw: s };
        if (/h670|a620|h610/i.test(s)) return { score: 35, type: 'lookup', raw: s };
        return null;
      }
      case 'ram_max': return _num(p, 'ram');
      case 'm2_slots': return _num(p, 'storage');
      case 'pcie_gen': {
        const s = _lookupStr(p, 'interface') || '';
        if (/pcie 5/i.test(s)) return { score: 100, type: 'lookup', raw: 'PCIe 5' };
        if (/pcie 4/i.test(s)) return { score: 75, type: 'lookup', raw: 'PCIe 4' };
        if (/pcie 3/i.test(s)) return { score: 50, type: 'lookup', raw: 'PCIe 3' };
        return null;
      }
      case 'vrm': return _num(p, 'vrm');
      case 'usbc': return _hasBool(p, ['USB-C', 'Thunderbolt', 'Type-C']);
      case 'connection': {
        const s = _lookupStr(p, 'wifi') || _lookupStr(p, 'bluetooth') || '';
        if (/2\.4 ?ghz|wireless/i.test(s) && /usb/i.test(s)) return { score: 100, type: 'lookup', raw: 'Tri-Mode' };
        if (/wireless|bluetooth/i.test(s)) return { score: 80, type: 'lookup', raw: 'Wireless' };
        if (/wired|usb/i.test(s)) return { score: 60, type: 'lookup', raw: 'Wired' };
        return null;
      }
      case 'ppm': return _num(p, 'ppm');
      case 'adf': return _hasBool(p, ['ADF', 'Auto Document Feeder']);
      case 'duplex': return _hasBool(p, ['Duplex', 'Çift Yönlü']);
      case 'color_duplex': return _hasBool(p, ['Color', 'Renkli']);
      case 'paper_capacity': return _num(p, 'paper_capacity');
      case 'lidar': return _hasBool(p, ['LiDAR', 'Laser Mapping']);
      case 'mop': return _hasBool(p, ['Mop', 'Wet Mopping']);
      case 'self_empty': return _hasBool(p, ['Self-Emptying', 'Auto Empty']);
      case 'app': return _hasBool(p, ['App', 'Alexa', 'Google Home']);
      case 'obstacle': return _hasBool(p, ['Obstacle Avoidance']);
      case 'max_speed': return _num(p, 'max_speed');
      case 'wind_resist': return _num(p, 'wind_resist');
      case 'noise': return _num(p, 'noise');
      case 'throw': return _num(p, 'throw');
      case 'smart': return _hasBool(p, ['Smart', 'Android', 'Google TV']);
      case 'drivers': return _num(p, 'driver');
      case 'bass': return _hasBool(p, ['Subwoofer', 'Bass']);
      case 'polar': return _hasBool(p, ['Cardioid', 'Omnidirectional', 'Bidirectional']);
      case 'shock': return _hasBool(p, ['Shock Mount']);
      case 'gain': return _hasBool(p, ['Gain Knob', 'Gain Dial']);
      default: return null;
    }
  }

  // Helper to produce a numeric (higher=better) extract result
  function _num(p, fieldKey) {
    const hit = _lookupRaw(p, FIELDS[fieldKey] || [fieldKey]);
    if (!hit) return null;
    const n = _firstNumber(hit.value);
    return n == null ? null : { score: n, type: 'num', raw: hit.value, source: hit.key };
  }
  function _numLo(p, fieldKey) {
    const hit = _lookupRaw(p, FIELDS[fieldKey] || [fieldKey]);
    if (!hit) return null;
    const n = _firstNumber(hit.value);
    return n == null ? null : { score: n, type: 'num_lo', raw: hit.value, source: hit.key };
  }
  function _l(p, fieldKey, table) {
    const hit = _lookupRaw(p, FIELDS[fieldKey] || [fieldKey]);
    if (!hit) return null;
    const m = _matchLookup(hit.value, table);
    return m && { score: m.score, type: 'lookup', raw: hit.value, source: m.key || hit.key };
  }
  function _hitOnAny(p, table) {
    const all = JSON.stringify(p.specs || {}) + ' ' + JSON.stringify(p.specSections || {});
    const m = _matchLookup(all, table);
    return m && { score: m.score, type: 'lookup', raw: m.key };
  }
  function _hasBool(p, candidates) {
    const hit = _lookupRaw(p, candidates);
    if (!hit) return null;
    const v = String(hit.value).toLowerCase().trim();
    if (/^(yok|no|false|0|—|-|✗|hayır|hayir|desteklemez|❌)$/i.test(v) ||
        /\b(yok|no|false|hayır|hayir|desteklemez|not supported|without)\b/i.test(v)) {
      return { score: 0, type: 'bool', raw: hit.value, source: hit.key };
    }
    return { score: 100, type: 'bool', raw: hit.value, source: hit.key };
  }

  function _averageSubscore(finalBreakdown, keys) {
    const vals = keys
      .map(k => finalBreakdown[k]?.norm)
      .filter(v => Number.isFinite(Number(v)))
      .map(Number);
    if (!vals.length) return null;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }

  function _makeSubscores(finalBreakdown) {
    const groups = {
      performance: ['gpu','cpu','cpu_rank','chipset','gpu_rank','cores','threads','boost_clock','base_clock','cache_l3','process_nm_lo'],
      display: ['panel','resolution','refresh','screen_size','hdr','color_gamut','response_ms_lo','lumens'],
      battery: ['battery','battery_life','charging','power'],
      camera: ['main_camera','front_camera','sensor_size_phone','csensor','megapixels','video_res','ibis'],
      connectivity: ['wifi','bluetooth','network_5g','lan_speed','interface','ports'],
      storage: ['storage','seq_read','seq_write','iops','tbw','ram','ram_speed','ram_cas_lo','vram','bandwidth'],
      build: ['weight_lo','ip_rating','case_form','cooler_type','keyboard_type','panel_switch','headphone_water','connection_quality'],
    };
    const out = {};
    for (const [name, keys] of Object.entries(groups)) {
      const score = _averageSubscore(finalBreakdown, keys);
      if (score != null) out[name] = Math.max(SCORE_MIN, Math.min(SCORE_MAX, score));
    }
    return out;
  }

  function _makeEvidence(finalBreakdown, missing, limit) {
    const hits = Object.entries(finalBreakdown || {})
      .map(([key, v]) => ({
        key,
        score: Math.round(Number(v.norm) || 0),
        weight: Number(v.weight) || 0,
        raw: v.raw,
        source: v.source || null,
        type: v.type,
      }))
      .sort((a, b) => (b.score * b.weight) - (a.score * a.weight))
      .slice(0, limit || 8);
    return {
      engine: 'v7',
      topSignals: hits,
      missing: (missing || []).slice(0, 12),
    };
  }

  // ─────────────────────────────────────────────────────────────
  //  CATEGORY SCORING (two-pass)
  // ─────────────────────────────────────────────────────────────

  function scoreCategory(products, opts) {
    opts = opts || {};
    if (!products || !products.length) return [];

    // Pick weights by first product's category (assume homogeneous).
    // Many catalog slugs are UI/source categories (graphics_cards,
    // cpu_coolers, pc_cases...) while the scorer has reusable scoring
    // profiles (gpus, coolers, cases...). Resolve that once here so every
    // category still gets a real 1-100 distribution instead of a flat 50.
    const rawCat = String((products[0].category || '')).toLowerCase();
    const cat = _scoreCategoryKey(rawCat);
    const weights = WEIGHTS[cat] || WEIGHTS[cat.replace(/_/g, '-')] || WEIGHTS[cat.replace(/-/g, '_')];
    if (!weights) {
      return products.map(p => ({ id: p.id, name: p.name, score: 50, missing: ['unknown_category'], breakdown: {} }));
    }

    // Pass 1: extract raw values
    const rows = products.map(p => {
      const breakdown = {};
      const missing = [];
      for (const wKey of Object.keys(weights)) {
        const r = _extract(p, wKey, cat);
        if (r == null) { missing.push(wKey); continue; }
        breakdown[wKey] = r;
      }
      return { p, breakdown, missing, year: _extractYear(p) };
    });

    // Pass 2: gather 95th-percentile max (outlier-robust) for 'num' / 'num_lo' specs
    // across category. Used only as fallback when NUMERIC_REFS has no entry for the key.
    const maxByKey = {}, minByKey = {};
    for (const wKey of Object.keys(weights)) {
      const vals = rows.map(r => r.breakdown[wKey])
        .filter(b => b && (b.type === 'num' || b.type === 'num_lo'))
        .map(b => b.score)
        .filter(v => isFinite(v));
      if (!vals.length) continue;
      vals.sort((a, b) => a - b);
      maxByKey[wKey] = _percentile(vals, 95) || vals[vals.length - 1];
      minByKey[wKey] = _percentile(vals, 5)  || vals[0];
    }

    // Pass 3: compute final scores (anchored log-scale when REF known, else 95p cat-max)
    const computed = rows.map(r => {
      let sumW = 0, weightedSum = 0;
      const finalBreakdown = {};
      for (const [wKey, w] of Object.entries(weights)) {
        const b = r.breakdown[wKey];
        if (!b) continue;
        let normScore = 0;
        if (b.type === 'rank' || b.type === 'lookup' || b.type === 'bool') {
          normScore = b.score;
        } else if (b.type === 'num') {
          const ref = NUMERIC_REFS[wKey];
          if (isFinite(ref) && ref > 0) {
            normScore = _logScale(b.score, ref);
          } else {
            const max = maxByKey[wKey] || 1;
            normScore = max > 0 ? (b.score / max) * 100 : 0;
          }
        } else if (b.type === 'num_lo') {
          // lower-is-better: invert log-scale
          const ref = NUMERIC_REFS[wKey];
          if (isFinite(ref) && ref > 0) {
            normScore = 100 - _logScale(b.score, ref);
          } else {
            const max = maxByKey[wKey] || 1;
            normScore = max > 0 ? (1 - b.score / max) * 100 : 0;
          }
        }
        normScore = Math.max(0, Math.min(100, normScore));
        weightedSum += normScore * w;
        sumW += w;
        finalBreakdown[wKey] = { norm: +normScore.toFixed(1), weight: w, raw: b.raw, source: b.source, type: b.type, exact: b.exact };
      }
      // Renormalize weights for missing specs
      const baseScore = sumW > 0 ? weightedSum / sumW : 0;
      const decay = _yearDecay(r.year, cat);

      // Tier cap: try each anchor key in order (e.g. gpu → cpu for laptops)
      let cappedBase = baseScore;
      let tier = null, tierCap = 100, anchorKey = null, anchorScore = null;
      const anchors = ANCHOR_KEY_BY_CAT[cat] || [];
      for (const ak of anchors) {
        if (r.breakdown[ak]) {
          anchorKey = ak;
          anchorScore = r.breakdown[ak].score;
          const t = _tierFor(anchorScore);
          if (t) { tier = t.tier; tierCap = t.cap; cappedBase = Math.min(baseScore, tierCap); }
          break;
        }
      }
      // No-anchor cap: when the category has no benchmark anchor (e.g. modems,
      // routers, smart-home accessories) we have no global reference to call
      // a product "flagship", so cap the score at NO_ANCHOR_CAP. Without this,
      // small / niche categories produce 100-scored Zyxel-class products.
      if (!anchorKey) {
        const noAnchorCap = NO_ANCHOR_CAP_BY_CAT[cat] || NO_ANCHOR_CAP;
        cappedBase = Math.min(cappedBase, noAnchorCap);
        tierCap = Math.min(tierCap, noAnchorCap);
      }

      return {
        row: r,
        baseScore: +baseScore.toFixed(2),
        cappedBase: +cappedBase.toFixed(2),
        decay,
        tier, tierCap, anchorKey, anchorScore,
        finalBreakdown,
        sumW,
      };
    });

    // Pass 3.5: Bayesian smoothing — pull each product's score toward the
    // category's median in proportion to how few of its specs we actually
    // have data for. Trust is sumW (sum of weights that landed on a real
    // value) divided by the category's total possible weight, so it lives
    // in [0..1]; a product with only 30% of its weights filled in can move
    // up to BAYESIAN_K * (1 - 0.30) ≈ 31% of the way toward the median.
    // Products with full spec sheets keep their score essentially unchanged.
    {
      const totalCatWeight = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
      const baseSeries = computed
        .map(c => c.cappedBase)
        .filter(v => isFinite(v) && v > 0)
        .sort((a, b) => a - b);
      const median = baseSeries.length
        ? (_percentile(baseSeries, 50) || baseSeries[Math.floor(baseSeries.length / 2)])
        : 50;
      for (const c of computed) {
        const ratio = (c.sumW || 0) / totalCatWeight;
        const trust = Math.max(BAYESIAN_MIN_TRUST, Math.min(1, ratio));
        const pull = BAYESIAN_K * (1 - trust); // 0..0.315
        if (pull <= 0) continue;
        const before = c.cappedBase;
        const after = before * (1 - pull) + median * pull;
        // Only ever pull *down* below the tier cap, never inflate above it.
        c.cappedBase = +Math.min(c.tierCap, after).toFixed(2);
        c.bayesianMedian = +median.toFixed(2);
        c.bayesianPull = +pull.toFixed(3);
        c.bayesianBefore = +before.toFixed(2);
        c.bayesianTrust = +trust.toFixed(3);
      }
    }

    // Pass 4: category-wide stretch — pull only flagship-anchored items toward
    // 100. Anchorless categories used to stretch their top no-name product
    // upward (that's how 47 white-label smartwatches reached 100). Now we only
    // stretch when there's a real benchmark anchor saying "this product is
    // genuinely flagship". Anchorless categories keep their NO_ANCHOR cap as
    // their natural ceiling.
    const flagshipScores = computed.filter(c => c.tier === 'flagship' && c.anchorKey).map(c => c.cappedBase);
    const totalCatWeightForStretch = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
    const topReference = flagshipScores.length ? Math.max(...flagshipScores) : 0;
    const stretchTarget = 100;
    const stretchFactor = topReference > 0 && topReference < stretchTarget ? Math.min(1.20, stretchTarget / topReference) : 1.0;

    const results = computed.map(c => {
      let stretched = c.cappedBase;
      const confidence = Math.max(BAYESIAN_MIN_TRUST, Math.min(1, (c.sumW || 0) / (Object.values(weights).reduce((a, b) => a + b, 0) || 1)));
      const canStretch = c.tier === 'flagship' && c.anchorKey;
      if (canStretch && stretchFactor > 1) {
        stretched = Math.min(c.tierCap, c.cappedBase * stretchFactor);
      }
      const bm = _brandModifier(c.row.p, cat);
      const rawFinal = Math.round(stretched * c.decay * bm.mod);
      // Evidence cap calibrated for real-world spec coverage. The old curve
      // (<0.45 → 82, <0.65 → 92) was crushing every product to 82 when the
      // runner only loaded keySpecs. With the full spec surface loaded the
      // typical confidence is 0.55–0.85; cap only HARSHLY low coverage so we
      // don't reward products that have almost no spec data — but a typical
      // ~70% covered flagship reaches 100 unhindered.
      const evidenceCap =
        confidence < 0.15 ? 60 :
        confidence < 0.25 ? 75 :
        confidence < 0.40 ? 88 :
        confidence < 0.55 ? 95 :
        SCORE_MAX;
      const yearCap = _yearCeiling(c.row.year, cat);
      const final = Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.min(c.tierCap, evidenceCap, yearCap, rawFinal)));
      const subscores = _makeSubscores(c.finalBreakdown);
      const evidence = _makeEvidence(c.finalBreakdown, c.row.missing);
      return {
        id: c.row.p.id,
        name: c.row.p.name,
        score: final,
        subscores,
        evidence,
        confidence: +confidence.toFixed(3),
        baseScore: c.baseScore,
        cappedBase: c.cappedBase,
        stretched: +stretched.toFixed(2),
        stretchFactor: +stretchFactor.toFixed(3),
        decay: c.decay,
        brandMod: +bm.mod.toFixed(3),
        brandReason: bm.reason,
        year: c.row.year,
        tier: c.tier, tierCap: c.tierCap, anchorKey: c.anchorKey, anchorScore: c.anchorScore,
        // Calibration diagnostics (handy in admin panel + score_runner logs).
        noAnchorCapped: !c.anchorKey,
        bayesianMedian: c.bayesianMedian,
        bayesianPull: c.bayesianPull,
        bayesianBefore: c.bayesianBefore,
        bayesianTrust: c.bayesianTrust,
        missing: c.row.missing,
        breakdown: c.finalBreakdown,
        sumW: c.sumW,
      };
    });
    // Final category stretch — guarantee at least one 100 per category.
    // Picks the "anchor" as the best-evidenced top scorer (flagship-tier
    // anchored if available, otherwise the top scorer with sufficient
    // confidence). Every other product is multiplied by the same factor,
    // but its own tier cap / year cap / NO_ANCHOR cap still applies — so
    // generic / no-name products at 27 stay around 30, not at 100.
    //
    // The user wanted the green "100" badge to actually appear in every
    // category. The previous pass refused to stretch anchorless categories
    // (smartwatches with mis-tagged SoCs, niche peripherals), leaving their
    // top product stuck at ~87 even when it was a legitimately flagship
    // Apple Watch Ultra 3. This finds the most credible top and pulls it.
    {
      const noAnchorCategoryCap = NO_ANCHOR_CAP_BY_CAT[cat] || NO_ANCHOR_CAP;
      // Prefer flagship-anchored recent products. Fall back to any recent
      // high-confidence product. Final fallback: the overall top.
      const recent = r => _yearCeiling(r.year, cat) >= 95;
      const conf = r => Number(r.confidence) >= 0.50;
      const tiers = [
        results.filter(r => r.tier === 'flagship' && r.anchorKey && recent(r) && r.score > 0),
        results.filter(r => r.anchorKey && recent(r) && conf(r) && r.score > 0),
        results.filter(r => recent(r) && conf(r) && r.score > 0),
        results.filter(r => r.score > 0),
      ];
      const pick = tiers.find(t => t.length > 0) || [];
      const stretchAnchor = pick.length ? Math.max(...pick.map(r => r.score)) : 0;
      // Top scorers in the picked tier get their caps lifted to 100 so the
      // category's #1 actually shows the green "100" badge the admin expects.
      // We allow ties (multiple products at the exact same top score), so e.g.
      // every RTX 5090 SKU reaches 100, not just the first one.
      const stretchAnchorIds = new Set(pick.filter(r => r.score === stretchAnchor).map(r => r.id));
      if (stretchAnchor > 0 && stretchAnchor < SCORE_MAX) {
        const finalStretch = SCORE_MAX / stretchAnchor;
        for (const r of results) {
          r.preCategoryStretchScore = r.score;
          r.categoryFinalStretch = +finalStretch.toFixed(3);
          const yc = _yearCeiling(r.year, cat);
          const isTopOfCategory = stretchAnchorIds.has(r.id);
          // The top-of-category product(s) lose their tier cap — they ARE
          // the category's flagship by construction. Everyone else still
          // honours tier / year / NO_ANCHOR caps so no-name brands can't
          // ride the stretch ratio to fake-flagship territory.
          const tierCeil = isTopOfCategory
            ? SCORE_MAX
            : (r.anchorKey && r.tier !== 'flagship'
                ? Math.min(SCORE_MAX, Number(r.tierCap) || SCORE_MAX)
                : SCORE_MAX);
          const noAnchorCeil = (r.anchorKey || isTopOfCategory) ? SCORE_MAX : noAnchorCategoryCap;
          const cap = Math.min(SCORE_MAX, tierCeil, yc, noAnchorCeil);
          r.score = Math.max(SCORE_MIN, Math.min(cap, Math.round(r.score * finalStretch)));
        }
      } else {
        for (const r of results) {
          const noAnchorCeil = r.anchorKey ? SCORE_MAX : noAnchorCategoryCap;
          r.score = Math.max(SCORE_MIN, Math.min(SCORE_MAX, noAnchorCeil, r.score));
        }
      }
    }
    return results;
  }

  // Convenience: score a single product against pre-computed category
  function scoreOne(product, categoryProducts) {
    const list = categoryProducts || [product];
    const all = scoreCategory(list);
    return all.find(x => x.id === product.id);
  }

  // Recompute scores for all products in a category and return rows
  function recalculateCategory(categorySlug, allProducts) {
    const list = allProducts.filter(p => p.category === categorySlug);
    return scoreCategory(list);
  }

  // ─────────────────────────────────────────────────────────────
  //  EXPORTS
  // ─────────────────────────────────────────────────────────────
  return {
    scoreCategory,
    scoreOne,
    recalculateCategory,
    extractYear: _extractYear,
    yearDecay: _yearDecay,
    yearCeiling: _yearCeiling,
    // Diagnostics / introspection
    WEIGHTS, FIELDS, LOOKUPS,
    GPU_DESKTOP, GPU_LAPTOP, CPU_LAPTOP, CPU_DESKTOP, CHIPSET_PHONE,
    _matchRank, _matchLookup, _lookupRaw,
    NUMERIC_REFS, TIER_CAPS, ANCHOR_KEY_BY_CAT,
    NO_ANCHOR_CAP, NO_ANCHOR_CAP_BY_CAT, BAYESIAN_K, BAYESIAN_MIN_TRUST, SCORE_MIN, SCORE_MAX,
  };
});
