// ═══════════════════════════════════════════════════════════════
//  COMPAIR — Tech Score Engine v6 (Anchored + Stretched + Brand)
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
    ['RTX 5090 D', 99], ['RTX 5090', 100],
    ['RX 9900 XTX', 97], ['RTX 5080', 96], ['RX 9800 XT', 93],
    ['RTX 5070 Ti', 90], ['RTX 4090', 88], ['RTX 5070', 85],
    ['RX 9070 XT', 83], ['RTX 4080 Super', 81], ['RTX 4080', 79],
    ['RX 9070', 77], ['RTX 5060 Ti', 75],
    ['RTX 4070 Ti Super', 73], ['RTX 4070 Ti', 71], ['RX 7900 XTX', 70],
    ['RTX 4070 Super', 68], ['RX 7900 XT', 66],
    ['RTX 5060', 63], ['RTX 4070', 61],
    ['RX 7800 XT', 58], ['RTX 4060 Ti', 55], ['RX 7700 XT', 52],
    ['RTX 4060', 48], ['RX 7600 XT', 45],
    ['RTX 3060 Ti', 41], ['RTX 4050', 38], ['RX 6700 XT', 35],
    ['RTX 3060', 32], ['RTX 3050', 26], ['RX 6600', 22],
    ['RTX 2060', 19], ['GTX 1660 Ti', 15], ['RX 6500 XT', 12], ['GTX 1650', 9],
    ['MX570', 6],
    ['Intel Arc A770', 58], ['Intel Arc A750', 52], ['Intel Arc A380', 20],
  ];

  const GPU_LAPTOP = [
    ['RTX 5090 Laptop', 94], ['RTX 5080 Laptop', 88], ['RTX 5070 Ti Laptop', 82],
    ['RTX 5070 Laptop', 76], ['RTX 5060 Laptop', 65],
    ['RTX 4090 Laptop', 80], ['RTX 4080 Laptop', 72], ['RTX 4070 Laptop', 62],
    ['RTX 4060 Laptop', 50], ['RTX 4050 Laptop', 40],
    ['RTX 3060 Laptop', 30], ['RTX 3050 Laptop', 22],
    ['RX 7600M XT', 55], ['RX 7600M', 46], ['RX 6700M', 38], ['Arc A770M', 48],
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
  ];

  const CPU_DESKTOP = [
    ['Ryzen 9 9950X', 100], ['Core i9-14900K', 98], ['Ryzen 9 7950X', 95],
    ['Core i9-13900K', 92], ['Ryzen 9 9900X', 88], ['Core i7-14700K', 84],
    ['Ryzen 7 9700X', 80], ['Core i7-13700K', 77], ['Ryzen 7 7700X', 73],
    ['Core i5-14600K', 68], ['Ryzen 5 9600X', 64], ['Core i5-13600K', 61],
    ['Ryzen 5 7600X', 57], ['Core i5-12600K', 51], ['Ryzen 5 5600X', 44],
    ['Core i5-12400', 38], ['Ryzen 5 5600', 35], ['Core i3-13100', 26],
    ['Ryzen 3 4100', 18], ['Celeron', 6], ['Pentium', 6],
  ];

  const CHIPSET_PHONE = [
    ['Snapdragon 8 Elite', 100], ['Apple A18 Pro', 100], ['Dimensity 9400', 98],
    ['Exynos 2500', 94], ['Snapdragon 8 Gen 3', 90], ['Apple A17 Pro', 90],
    ['Dimensity 9300', 87], ['Exynos 2400', 84], ['Snapdragon 8 Gen 2', 80],
    ['Apple A16', 80], ['Dimensity 9200', 77], ['Kirin 9000S', 72],
    ['Snapdragon 7s Gen 3', 65], ['Dimensity 8300', 63],
    ['Snapdragon 7 Gen 3', 61], ['Exynos 1480', 58],
    ['Snapdragon 6 Gen 3', 50], ['Dimensity 7300', 48], ['Helio G99 Ultra', 45],
    ['Dimensity 6300', 38], ['Helio G99', 36], ['Snapdragon 6s Gen 3', 33],
    ['Helio G88', 26], ['Snapdragon 4 Gen 2', 24], ['Dimensity 6100+', 22],
    ['Helio G85', 16], ['Snapdragon 4s Gen 2', 12], ['Helio G36', 6],
    // Apple A older
    ['Apple A18', 95], ['Apple A17', 88], ['Apple A15', 70], ['Apple A14', 60], ['Apple A13', 48],
    // Apple M (tablets)
    ['Apple M4', 100], ['Apple M3', 95], ['Apple M2', 88], ['Apple M1', 78],
  ];

  // Family detection for interpolation (longest first)
  const FAMILIES = [
    'Core Ultra 9', 'Core Ultra 7', 'Core Ultra 5',
    'Core i9', 'Core i7', 'Core i5', 'Core i3',
    'Ryzen 9', 'Ryzen 7', 'Ryzen 5', 'Ryzen 3',
    'RTX', 'GTX', 'RX',
    'Snapdragon 8', 'Snapdragon 7', 'Snapdragon 6', 'Snapdragon 4', 'Snapdragon',
    'Dimensity', 'Exynos', 'Helio', 'Kirin',
    'Apple A', 'Apple M',
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
      ['LCD', 55], ['TFT', 40], ['TN', 30], ['E-Ink', 60],
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
    gpu:        ['GPU Model', 'External Graphics Processor (GPU)', 'Graphics Processor (GPU)', 'Graphics Processor', 'Graphics Card', 'Graphics', 'Dedicated GPU', 'Discrete GPU', 'Ekran Kartı', 'Ekran Karti', 'Harici Ekran Kartı', 'GPU'],
    cpu:        ['Processor Model', 'Main Processor (CPU)', 'CPU Model', 'CPU', 'Processor', 'İşlemci', 'Islemci', 'Ana İşlemci', 'Ana Islemci'],
    ram:        ['Memory (RAM)', 'RAM Capacity', 'RAM (GB)', 'System Memory', 'Installed RAM', 'RAM', 'Memory', 'Bellek', 'Sistem Belleği', 'Sistem Bellegi'],
    storage:    ['Hard Disk (SSD) Size', 'SSD Size', 'SSD Capacity', 'Storage Capacity', 'Internal Storage', 'Hard Disk Size', 'Hard Disk', 'Storage', 'Depolama', 'Dahili Hafıza', 'Dahili Hafiza'],
    battery:    ['Battery Capacity (Typical)', 'Battery Capacity', 'Battery Power', 'Battery (mAh)', 'Battery', 'Batarya Kapasitesi', 'Batarya', 'Pil'],
    battery_life: ['Battery Life', 'Listening Time', 'Music Time', 'Talk Time', 'Pil Ömrü', 'Calma Suresi', 'Çalma Süresi'],
    screen_size:['Display Size', 'Screen Size', 'Ekran Boyutu', 'Display Size (Diagonal)', 'Diagonal'],
    refresh:    ['Screen Refresh Rate', 'Display Refresh Rate', 'Refresh Rate', 'Yenileme Hızı', 'Yenileme Hizi'],
    chipset:    ['Chipset', 'System Chip', 'SoC', 'Ana İşlemci', 'Ana Islemci', 'CPU', 'Processor', 'İşlemci', 'Islemci'],
    panel:      ['Screen Technology', 'Panel Type', 'Display Technology', 'Display Type', 'Panel Tipi', 'Ekran Tipi', 'Ekran Teknolojisi'],
    resolution: ['Display Resolution', 'Screen Resolution', 'Resolution', 'Çözünürlük', 'Cozunurluk', 'Ekran Çözünürlüğü'],
    main_camera:['Main Camera', 'Main Camera Resolution', 'Rear Camera', 'Primary Camera', 'Ana Kamera', 'Arka Kamera'],
    front_camera:['Front Camera', 'Selfie Camera', 'Ön Kamera', 'On Kamera', 'Selfie'],
    network_5g: ['Network', 'Cellular', 'Mobile Network', 'Mobil Ağ', 'Mobil Ag', 'Şebeke', 'Sebeke', 'Generation'],
    weight:     ['Weight', 'Ağırlık', 'Agirlik'],
    wifi:       ['Wi-Fi', 'WiFi', 'Wireless', 'Kablosuz Bağlantı', 'Kablosuz Baglanti'],
    bluetooth:  ['Bluetooth', 'Bluetooth Version', 'Bluetooth Versiyonu'],
    release_year: ['Release Date', 'Release Year', 'Announcement Date', 'Tanıtım Tarihi', 'Tanitim Tarihi', 'Çıkış Tarihi', 'Cikis Tarihi', 'Çıkış Yılı'],
    ip_rating:  ['Water Resistance', 'IP Rating', 'Su Geçirmezlik', 'Su Gecirmezlik', 'Sertifika'],
    // GPU
    vram:       ['Memory Size', 'Video Memory', 'VRAM', 'Bellek Boyutu', 'Memory'],
    bandwidth:  ['Memory Bandwidth', 'Bandwidth', 'Bant Genişliği'],
    boost_clock:['Boost Clock', 'Game Clock', 'Boost Frequency'],
    base_clock: ['Base Clock', 'Base Frequency', 'Core Clock'],
    cores:      ['Core Count', 'Number of Cores', 'CUDA Cores', 'Stream Processors', 'Çekirdek Sayısı', 'Cekirdek Sayisi'],
    threads:    ['Thread Count', 'Number of Threads', 'Threads', 'İş Parçacığı'],
    cache_l3:   ['L3 Cache', 'Cache (L3)', 'Cache'],
    tdp:        ['TDP', 'Thermal Design Power', 'Power Consumption'],
    process_nm: ['Process', 'Manufacturing Process', 'Lithography', 'İşlem'],
    igpu:       ['Integrated Graphics', 'iGPU', 'Tümleşik Ekran Kartı'],
    // RAM
    ram_speed:  ['Memory Speed', 'Speed', 'Frequency', 'Hız'],
    ram_cas:    ['CAS Latency', 'CL', 'Latency'],
    // SSD
    seq_read:   ['Sequential Read', 'Read Speed', 'Max Read', 'Okuma Hızı'],
    seq_write:  ['Sequential Write', 'Write Speed', 'Max Write', 'Yazma Hızı'],
    iops:       ['Random Read IOPS', 'Random IOPS', 'IOPS'],
    interface:  ['Interface', 'Form Factor', 'Bus'],
    tbw:        ['TBW', 'Endurance', 'Total Bytes Written'],
    // PSU
    watt:       ['Wattage', 'Total Power', 'Power', 'Güç'],
    efficiency: ['Efficiency', '80 Plus', '80+ Rating', 'Verimlilik'],
    modular:    ['Modular', 'Modülerlik'],
    fan_size:   ['Fan Size', 'Fan Boyutu'],
    // Audio
    driver:     ['Driver Size', 'Driver', 'Sürücü', 'Surucu'],
    anc:        ['ANC', 'Active Noise Cancellation', 'Aktif Gürültü Engelleme', 'Noise Cancellation'],
    watt_rms:   ['Output Power (RMS)', 'RMS Power', 'Output Power', 'Çıkış Gücü'],
    channels:   ['Channels', 'Channel Configuration', 'Kanal'],
    // Camera
    sensor:     ['Sensor Size', 'Sensor', 'Sensör Boyutu', 'Sensor Boyutu'],
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
    type:       ['Type', 'Tür', 'Tip'],
    audio_watt: ['Audio Power', 'Speaker Power', 'Audio Output'],
    contrast:   ['Contrast Ratio', 'Contrast', 'Kontrast'],
    lumens:     ['Brightness', 'ANSI Lumens', 'Lumens'],
    response_ms:['Response Time', 'Tepki Süresi'],
    color_gamut:['Color Gamut', 'sRGB', 'DCI-P3', 'Renk Gamutu'],
  };

  // ─────────────────────────────────────────────────────────────
  //  WEIGHTS — 40 categories (sums to 100 per cat)
  // ─────────────────────────────────────────────────────────────

  const WEIGHTS = {
    smartphones: { chipset: 22, main_camera: 14, front_camera: 4, ram: 10, storage: 8, battery: 10, panel: 8, refresh: 6, resolution: 8, screen_size: 4, network_5g: 4 },
    tablets:     { chipset: 22, ram: 12, storage: 10, battery: 12, screen_size: 10, refresh: 6, resolution: 10, panel: 8, main_camera: 5, network_5g: 5 },
    laptops:     { cpu: 25, gpu: 18, ram: 13, storage: 10, battery: 8, screen_size: 4, refresh: 4, resolution: 6, panel: 5, weight_lo: 4, wifi: 3 },
    desktops:    { cpu: 28, gpu: 22, ram: 15, storage: 15, watt: 6, cooler_type: 6, lan: 4, case_form: 4 },
    monitors:    { screen_size: 16, resolution: 22, refresh: 18, panel: 14, response_ms_lo: 10, hdr: 8, color_gamut: 8, curved: 4 },
    tvs:         { screen_size: 18, resolution: 18, panel: 22, refresh: 14, hdr: 12, smart_os: 6, hdmi21: 10 },
    headphones:  { anc: 22, driver: 18, battery_life: 18, bluetooth: 12, codec: 18, headphone_water: 6, weight_lo: 6 },
    earphones:   { anc: 22, driver: 18, battery_life: 18, bluetooth: 12, codec: 18, headphone_water: 6, weight_lo: 6 },
    speakers:    { watt_rms: 28, drivers: 16, bluetooth: 10, wifi: 12, battery_life: 14, ip_rating: 10, bass: 10 },
    cameras:     { csensor: 22, megapixels: 16, iso: 16, fps_burst: 14, video_res: 14, ibis: 8, shutter: 6, evf: 4 },
    gpus:        { gpu_rank: 30, vram: 18, bandwidth: 12, cores: 12, boost_clock: 10, tdp_lo: 8, ray_tracing: 10 },
    cpus:        { cores: 18, threads: 12, base_clock: 12, boost_clock: 18, cache_l3: 12, tdp_lo: 8, process_nm_lo: 12, igpu: 8 },
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
    front_camera: 60, main_camera: 200, water_depth: 100,
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
  const TIER_CAPS = [
    { min: 82, cap: 100, tier: 'flagship'  },
    { min: 62, cap: 84,  tier: 'upper-mid' },
    { min: 42, cap: 68,  tier: 'mid'       },
    { min: 22, cap: 52,  tier: 'entry'     },
    { min: 0,  cap: 38,  tier: 'budget'    },
  ];
  const ANCHOR_KEY_BY_CAT = {
    smartphones: ['chipset'], tablets: ['chipset'],
    laptops: ['gpu', 'cpu'], desktops: ['gpu', 'cpu'],
    gpus: ['gpu_rank'], cpus: ['cpu'],
    consoles: ['cpu'], 'vr-headsets': ['cpu'],
  };
  function _tierFor(anchorScore) {
    if (anchorScore == null) return null;
    return TIER_CAPS.find(t => anchorScore >= t.min) || TIER_CAPS[TIER_CAPS.length - 1];
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
      // Premium tier
      apple: 1.06,
      'samsung galaxy z': 1.05, 'samsung galaxy s ultra': 1.05,
      'samsung galaxy s': 1.03, 'samsung galaxy note': 1.03,
      samsung: 1.02,
      'google pixel pro': 1.04, 'google pixel': 1.02, google: 1.02,
      sony: 1.03, asus: 1.02, oneplus: 1.01, nothing: 1.01,
      huawei: 1.01,
      // Mid penalty
      xiaomi: 1.0, 'xiaomi mix': 1.02,
      redmi: 0.93, poco: 0.92,
      realme: 0.91, 'honor x': 0.90, honor: 0.97,
      vivo: 0.97, oppo: 0.97, motorola: 0.96,
      // Budget penalty
      infinix: 0.85, tecno: 0.85, itel: 0.80, ulefone: 0.85,
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
    televisions: {
      sony: 1.05, lg: 1.04, samsung: 1.04, 'sony bravia': 1.05,
      panasonic: 1.03, philips: 1.0, hisense: 0.96, tcl: 0.95,
      xiaomi: 0.94, vestel: 0.92, arçelik: 0.94, beko: 0.92,
    },
  };
  function _brandKey(s) { return String(s || '').toLowerCase().trim(); }
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

  // Year decay table (smartphone-style — applied to all categories)
  function _yearDecay(year) {
    if (!year) return 1.0;
    if (year >= 2025) return 1.0;
    if (year === 2024) return 0.97;
    if (year === 2023) return 0.94;
    if (year === 2022) return 0.91;
    if (year === 2021) return 0.88;
    return 0.85;
  }

  // ─────────────────────────────────────────────────────────────
  //  PRIMITIVES
  // ─────────────────────────────────────────────────────────────

  function _normKey(s) { return String(s || '').toLowerCase().replace(/[\s_\-:()]+/g, ''); }

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
    const sections = p.specSections || {};
    const wantSet = new Set(candidates.map(_normKey));

    // Build a unified [key, value, sectionName] list (also walks nested objects in specs[*])
    const flatPairs = [];
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

  // ─────────────────────────────────────────────────────────────
  //  RANK MATCHING (longest prefix wins, then interpolation)
  // ─────────────────────────────────────────────────────────────

  function _matchRank(model, list) {
    if (!model) return null;
    const lower = String(model).toLowerCase();
    let best = null;
    for (const [name, score] of list) {
      const nm = name.toLowerCase();
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
      return { score: (lo || hi)[1], exact: false, key: `${fam} ${num} (nearest)` };
    }
    return null;
  }

  function _matchLookup(value, table) {
    if (!value) return null;
    const lower = String(value).toLowerCase();
    let best = null;
    for (const [name, score] of table) {
      const nm = name.toLowerCase();
      if (lower.includes(nm)) {
        if (!best || nm.length > best.len) best = { score, len: nm.length, key: name };
      }
    }
    return best ? { score: best.score, key: best.key } : null;
  }

  // Year extraction
  function _extractYear(p) {
    const candidates = ['Release Date', 'Release Year', 'Announcement Date', 'Tanıtım Tarihi', 'Çıkış Tarihi', 'Çıkış Yılı'];
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
        const s = _lookupStr(p, 'cpu');
        if (!s) return null;
        const list = isLaptop ? CPU_LAPTOP : (cat === 'cpus' || cat === 'desktops' ? CPU_DESKTOP : CPU_LAPTOP);
        const m = _matchRank(s, list);
        return m && { score: m.score, type: 'rank', raw: s, source: m.key, exact: m.exact };
      }
      case 'gpu': {
        const s = _lookupStr(p, 'gpu');
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
        const s = _lookupStr(p, 'chipset');
        if (!s) return null;
        const m = _matchRank(s, CHIPSET_PHONE);
        return m && { score: m.score, type: 'rank', raw: s, source: m.key, exact: m.exact };
      }
      // ── LOOKUP SPECS ──
      case 'panel': return _l(p, 'panel', LOOKUPS.panel);
      case 'resolution': return _l(p, 'resolution', LOOKUPS.resolution);
      case 'hdr': return _l(p, 'hdr', LOOKUPS.hdr) || _l(p, 'panel', LOOKUPS.hdr);
      case 'wifi': return _l(p, 'wifi', LOOKUPS.wifi);
      case 'wifi_gen': return _l(p, 'wifi', LOOKUPS.wifi);
      case 'bluetooth': return _l(p, 'bluetooth', LOOKUPS.bluetooth);
      case 'codec': return _l(p, 'codec', LOOKUPS.codec);
      case 'efficiency': return _l(p, 'efficiency', LOOKUPS.psu_efficiency);
      case 'lan_speed': return _l(p, 'wifi', LOOKUPS.lan_speed) || _l(p, 'lan', LOOKUPS.lan_speed);
      case 'smart_os': return _l(p, 'panel', LOOKUPS.smart_os) || _hitOnAny(p, LOOKUPS.smart_os);
      case 'network_5g': return _l(p, 'network_5g', LOOKUPS.network_5g);
      case 'ip_rating':
      case 'water_resistance': return _l(p, 'ip_rating', LOOKUPS.ip_rating);
      case 'csensor': return _l(p, 'sensor', LOOKUPS.csensor);
      case 'panel_switch': return _l(p, 'switch', LOOKUPS.panel_switch);
      case 'keyboard_type': return _l(p, 'type', LOOKUPS.keyboard_type) || _l(p, 'switch', LOOKUPS.keyboard_type);
      case 'case_form': return _l(p, 'type', LOOKUPS.case_form) || _l(p, 'panel', LOOKUPS.case_form);
      case 'cooler_type': return _l(p, 'type', LOOKUPS.cooler_type);
      case 'headphone_water': return _l(p, 'ip_rating', LOOKUPS.headphone_water);

      // ── NUMERIC (higher better) ──
      case 'ram': {
        const s = _lookupStr(p, 'ram');
        if (s == null) return null;
        const n = _parseGb(s);
        return n == null ? null : { score: n, type: 'num', raw: s };
      }
      case 'storage': {
        const s = _lookupStr(p, 'storage');
        if (s == null) return null;
        const n = _parseGb(s);
        return n == null ? null : { score: n, type: 'num', raw: s };
      }
      case 'battery': return _num(p, 'battery');
      case 'battery_life': return _num(p, 'battery_life') || _num(p, 'battery');
      case 'screen_size': return _num(p, 'screen_size');
      case 'refresh': return _num(p, 'refresh');
      case 'main_camera': return _num(p, 'main_camera');
      case 'front_camera': return _num(p, 'front_camera');
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
    const s = _lookupStr(p, fieldKey);
    if (s == null) return null;
    const n = _firstNumber(s);
    return n == null ? null : { score: n, type: 'num', raw: s };
  }
  function _numLo(p, fieldKey) {
    const s = _lookupStr(p, fieldKey);
    if (s == null) return null;
    const n = _firstNumber(s);
    return n == null ? null : { score: n, type: 'num_lo', raw: s };
  }
  function _l(p, fieldKey, table) {
    const s = _lookupStr(p, fieldKey);
    if (!s) return null;
    const m = _matchLookup(s, table);
    return m && { score: m.score, type: 'lookup', raw: s, source: m.key };
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
    if (/^(yok|no|false|0|—|-|✗|hayır|hayir|desteklemez|❌)$/i.test(v)) return { score: 0, type: 'bool', raw: 'no' };
    return { score: 100, type: 'bool', raw: hit.value };
  }

  // ─────────────────────────────────────────────────────────────
  //  CATEGORY SCORING (two-pass)
  // ─────────────────────────────────────────────────────────────

  function scoreCategory(products, opts) {
    opts = opts || {};
    if (!products || !products.length) return [];

    // Pick weights by first product's category (assume homogeneous)
    const cat = String((products[0].category || '')).toLowerCase();
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
      const decay = _yearDecay(r.year);

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

    // Pass 4: category-wide stretch — pull the top flagship up to 100 so the
    // distribution actually uses the full 1-100 range. Only stretches *within*
    // the flagship tier; lower-tier caps are still respected.
    const flagshipScores = computed.filter(c => c.tier === 'flagship').map(c => c.cappedBase);
    const topFlagship = flagshipScores.length ? Math.max(...flagshipScores) : 0;
    const stretchFactor = topFlagship > 0 && topFlagship < 100 ? Math.min(1.18, 100 / topFlagship) : 1.0;

    return computed.map(c => {
      let stretched = c.cappedBase;
      if (c.tier === 'flagship' && stretchFactor > 1) {
        stretched = Math.min(c.tierCap, c.cappedBase * stretchFactor);
      }
      const bm = _brandModifier(c.row.p, cat);
      const final = Math.max(1, Math.min(100, Math.round(stretched * c.decay * bm.mod)));
      return {
        id: c.row.p.id,
        name: c.row.p.name,
        score: final,
        baseScore: c.baseScore,
        cappedBase: c.cappedBase,
        stretched: +stretched.toFixed(2),
        stretchFactor: +stretchFactor.toFixed(3),
        decay: c.decay,
        brandMod: +bm.mod.toFixed(3),
        brandReason: bm.reason,
        year: c.row.year,
        tier: c.tier, tierCap: c.tierCap, anchorKey: c.anchorKey, anchorScore: c.anchorScore,
        missing: c.row.missing,
        breakdown: c.finalBreakdown,
        sumW: c.sumW,
      };
    });
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
    // Diagnostics / introspection
    WEIGHTS, FIELDS, LOOKUPS,
    GPU_DESKTOP, GPU_LAPTOP, CPU_LAPTOP, CPU_DESKTOP, CHIPSET_PHONE,
    _matchRank, _matchLookup, _lookupRaw,
    NUMERIC_REFS, TIER_CAPS, ANCHOR_KEY_BY_CAT,
  };
});
