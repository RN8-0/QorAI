/// Compair - Category Key Specs Map
/// Centralized category-aware key spec definitions for all 42+ categories.
/// Used by Compare screen (side-by-side) and SharedKeySpecsGrid (detail page).
library;

import 'package:flutter/material.dart';

/// Category → 6 priority key spec slots.
/// Each slot is a list of ALIASES (first match wins against Firestore field keys).
const categoryKeySpecAliases = <String, List<List<String>>>{
  // ── Tech: Smartphones ──
  'smartphones': [
    ['Screen Size', 'Display Size', 'Ekran Boyutu'],
    ['RAM', 'Memory (RAM)', 'RAM Kapasitesi'],
    ['Storage', 'Internal Storage', 'Dahili Depolama', 'ROM'],
    ['Battery', 'Battery Capacity', 'Pil', 'Pil Kapasitesi'],
    ['Camera', 'Main Camera', 'Kamera', 'Camera Çözünürlük'],
    ['Processor', 'Chipset', 'İşlemci', 'Processor Model', 'CPU'],
  ],

  // ── Tech: Tablets ──
  'tablets': [
    ['Screen Size', 'Display Size', 'Ekran Boyutu'],
    ['RAM', 'Memory (RAM)', 'RAM Kapasitesi'],
    ['Storage', 'Internal Storage', 'Dahili Depolama'],
    ['Battery', 'Battery Capacity', 'Pil'],
    ['Processor', 'Chipset', 'İşlemci', 'Processor Model'],
    ['OS', 'Operating System', 'İşletim Sistemi'],
  ],

  // ── Tech: Laptops ──
  'laptops': [
    ['Screen Size', 'Display Size', 'Ekran Boyutu'],
    ['RAM', 'Memory (RAM)', 'RAM Kapasitesi'],
    ['Storage', 'SSD', 'Internal Storage', 'Dahili Depolama', 'Hard Disk (SSD)'],
    ['Processor', 'CPU', 'İşlemci', 'Processor Model'],
    ['GPU', 'Graphics Card', 'Ekran Kartı', 'GPU Model', 'Video Card'],
    ['Battery', 'Battery Life', 'Pil'],
  ],

  // ── Tech: Desktops ──
  'desktops': [
    ['Processor', 'CPU', 'İşlemci', 'Processor Model'],
    ['RAM', 'Memory (RAM)', 'RAM Kapasitesi'],
    ['Storage', 'SSD', 'Hard Disk', 'Dahili Depolama'],
    ['GPU', 'Graphics Card', 'Ekran Kartı', 'Video Card'],
    ['OS', 'Operating System', 'İşletim Sistemi'],
    ['Power Supply', 'PSU', 'Güç Kaynağı', 'Watt'],
  ],

  // ── Tech: CPUs ──
  'cpus': [
    ['Cores', 'Core Count', 'Çekirdek'],
    ['Threads', 'Thread Count', 'İş Parçacığı'],
    ['Base Clock', 'Base Frequency', 'Temel Frekans'],
    ['Boost Clock', 'Turbo', 'Max Frequency'],
    ['TDP', 'Power', 'Güç Tüketimi', 'Watt'],
    ['Cache', 'L3 Cache', 'Önbellek'],
  ],

  // ── Tech: GPUs ──
  'gpus': [
    ['VRAM', 'Memory', 'Bellek', 'Video Memory'],
    ['Architecture', 'Mimari', 'GPU Chip'],
    ['TDP', 'Power', 'Güç Tüketimi', 'Watt'],
    ['Core Clock', 'Base Clock', 'Temel Saat'],
    ['Boost Clock', 'Turbo Clock'],
    ['Memory Bandwidth', 'Bant Genişliği'],
  ],

  // ── Tech: RAM ──
  'ram': [
    ['Capacity', 'Kapasite', 'Size'],
    ['Type', 'DDR', 'Tip'],
    ['Speed', 'Clock', 'Hız'],
    ['Latency', 'CAS', 'CL', 'Gecikme'],
    ['Voltage', 'Voltaj'],
    ['Form Factor', 'Form'],
  ],

  // ── Tech: SSD ──
  'ssd': [
    ['Capacity', 'Kapasite', 'Size'],
    ['Interface', 'Arayüz', 'Connection'],
    ['Read Speed', 'Okuma Hızı', 'Sequential Read'],
    ['Write Speed', 'Yazma Hızı', 'Sequential Write'],
    ['Form Factor', 'Form'],
    ['NAND Type', 'NAND', 'Flash Type'],
  ],

  // ── Tech: Motherboards ──
  'motherboards': [
    ['Socket', 'Soket', 'CPU Socket'],
    ['Chipset', 'Yonga Seti'],
    ['Form Factor', 'Form', 'Boyut'],
    ['RAM Slots', 'Memory Slots', 'RAM Yuvası', 'DIMM'],
    ['Max RAM', 'Maximum Memory', 'Maks RAM'],
    ['M.2 Slots', 'M.2', 'NVMe', 'SSD Slot'],
  ],

  // ── Tech: PSU ──
  'psu': [
    ['Wattage', 'Power', 'Güç', 'Watt'],
    ['Efficiency', '80 Plus', 'Verimlilik', 'Certification'],
    ['Modularity', 'Modüler', 'Cable Management'],
    ['Fan Size', 'Fan', 'Soğutma'],
    ['Connectors', 'Konnektör', 'Cables'],
    ['Warranty', 'Garanti'],
  ],

  // ── Tech: Cases ──
  'cases': [
    ['Form Factor', 'Form', 'Boyut', 'Type'],
    ['Material', 'Malzeme'],
    ['Fan Support', 'Fan Slots', 'Fan Desteği'],
    ['Radiator Support', 'Radyatör', 'AIO'],
    ['GPU Max Length', 'GPU Length', 'Ekran Kartı Uzunluğu'],
    ['Drive Bays', 'Disk Yuvası', 'HDD/SSD'],
  ],

  // ── Tech: Coolers ──
  'coolers': [
    ['Type', 'Tip', 'Cooling Type'],
    ['Fan Size', 'Fan', 'Fan Boyutu'],
    ['TDP Rating', 'TDP', 'Soğutma Kapasitesi'],
    ['Noise Level', 'dBA', 'Gürültü'],
    ['Socket Compatibility', 'Socket', 'Soket Uyumu'],
    ['RPM', 'Fan Speed', 'Devir'],
  ],

  // ── Tech: TVs ──
  'tvs': [
    ['Screen Size', 'Display Size', 'Ekran Boyutu'],
    ['Resolution', 'Çözünürlük'],
    ['Panel Type', 'Panel', 'Panel Tipi'],
    ['Smart TV', 'Akıllı TV'],
    ['HDR', 'HDR Support'],
    ['Refresh Rate', 'Yenileme Hızı'],
  ],

  // ── Tech: Monitors ──
  'monitors': [
    ['Screen Size', 'Display Size', 'Ekran Boyutu'],
    ['Resolution', 'Çözünürlük'],
    ['Panel Type', 'Panel', 'Panel Tipi'],
    ['Refresh Rate', 'Yenileme Hızı'],
    ['Response Time', 'Tepki Süresi'],
    ['HDR', 'HDR Support', 'HDR Desteği'],
  ],

  // ── Tech: Projectors ──
  'projectors': [
    ['Resolution', 'Çözünürlük', 'Native Resolution'],
    ['Brightness', 'Lumen', 'Parlaklık', 'ANSI Lumen'],
    ['Technology', 'Projection', 'DLP', 'LCD', 'Teknoloji'],
    ['Contrast Ratio', 'Kontrast'],
    ['Throw Distance', 'Mesafe', 'Projection Distance'],
    ['Lamp Life', 'Lamba Ömrü', 'LED Life'],
  ],

  // ── Tech: Headphones ──
  'headphones': [
    ['Type', 'Tip', 'Form'],
    ['Driver', 'Driver Size', 'Sürücü Boyutu'],
    ['Noise Cancelling', 'ANC', 'Gürültü Engelleme'],
    ['Battery', 'Battery Life', 'Pil Ömrü'],
    ['Connectivity', 'Bağlantı', 'Connection'],
    ['Weight', 'Ağırlık'],
  ],

  // ── Tech: Speakers ──
  'speakers': [
    ['Power', 'Wattage', 'Güç', 'RMS'],
    ['Driver Size', 'Driver', 'Sürücü'],
    ['Connectivity', 'Bağlantı', 'Bluetooth', 'WiFi'],
    ['Battery', 'Battery Life', 'Pil Ömrü'],
    ['Water Resistance', 'IP Rating', 'Su Dayanıklılığı'],
    ['Weight', 'Ağırlık'],
  ],

  // ── Tech: Soundbars ──
  'soundbars': [
    ['Channels', 'Channel', 'Kanal'],
    ['Power', 'Wattage', 'Güç', 'RMS'],
    ['Subwoofer', 'Bass', 'Alt Hoparlör'],
    ['Connectivity', 'Bağlantı', 'HDMI', 'Bluetooth'],
    ['Dolby Atmos', 'Atmos', 'Surround'],
    ['Dimensions', 'Boyut', 'Length'],
  ],

  // ── Tech: Smartwatches ──
  'smartwatches': [
    ['Screen Size', 'Display Size', 'Ekran Boyutu'],
    ['Battery', 'Battery Life', 'Pil Ömrü'],
    ['OS', 'Operating System', 'İşletim Sistemi'],
    ['Heart Rate', 'Kalp Atış', 'HR'],
    ['GPS', 'Location'],
    ['Water Resistance', 'Su Direnci', 'ATM', 'IP'],
  ],

  // ── Tech: Cameras ──
  'cameras': [
    ['Sensor Size', 'Sensör Boyutu', 'Sensor'],
    ['Megapixels', 'Resolution', 'Çözünürlük'],
    ['Video Resolution', 'Video', '4K'],
    ['ISO', 'ISO Range'],
    ['Autofocus', 'AF', 'Otomatik Odak'],
    ['Weight', 'Ağırlık'],
  ],

  // ── Tech: Action Cameras ──
  'action-cameras': [
    ['Video Resolution', 'Max Video', '4K', '5K'],
    ['Stabilization', 'EIS', 'OIS', 'Stabilizasyon'],
    ['Waterproof', 'Water Resistance', 'Su Geçirmezlik', 'Depth'],
    ['Battery', 'Battery Life', 'Pil'],
    ['Display', 'Screen', 'Ekran'],
    ['Weight', 'Ağırlık'],
  ],

  // ── Tech: Security Cameras ──
  'security-cameras': [
    ['Resolution', 'Video Resolution', 'Çözünürlük'],
    ['Night Vision', 'IR', 'Gece Görüşü'],
    ['Field of View', 'FOV', 'Görüş Açısı'],
    ['Connectivity', 'WiFi', 'Bağlantı'],
    ['Storage', 'SD Card', 'Cloud', 'Depolama'],
    ['Weatherproof', 'IP Rating', 'Outdoor', 'Dış Mekan'],
  ],

  // ── Tech: Consoles ──
  'consoles': [
    ['Storage', 'SSD', 'Internal Storage', 'Dahili Depolama'],
    ['GPU', 'Graphics', 'Teraflops', 'TFLOPS'],
    ['CPU', 'Processor', 'İşlemci'],
    ['RAM', 'Memory', 'Bellek'],
    ['Resolution', 'Max Resolution', 'Çözünürlük', '4K'],
    ['Disc Drive', 'Optical', 'Blu-ray', 'Disk Sürücüsü'],
  ],

  // ── Tech: Gamepads ──
  'gamepads': [
    ['Connectivity', 'Connection', 'Bağlantı', 'Wireless'],
    ['Compatibility', 'Platform', 'Uyumluluk'],
    ['Battery', 'Battery Life', 'Pil Ömrü'],
    ['Vibration', 'Haptic', 'Titreşim'],
    ['Buttons', 'Button Layout', 'Tuş'],
    ['Weight', 'Ağırlık'],
  ],

  // ── Tech: Keyboards ──
  'keyboards': [
    ['Switch Type', 'Switch', 'Anahtar Tipi'],
    ['Layout', 'Düzen', 'Size'],
    ['Connectivity', 'Bağlantı', 'Connection'],
    ['Backlighting', 'RGB', 'Aydınlatma'],
    ['Battery Life', 'Battery', 'Pil Ömrü'],
    ['Weight', 'Ağırlık'],
  ],

  // ── Tech: Mice ──
  'mice': [
    ['DPI', 'Sensitivity', 'Hassasiyet'],
    ['Connectivity', 'Bağlantı', 'Connection'],
    ['Sensor', 'Sensör'],
    ['Battery', 'Battery Life', 'Pil'],
    ['Polling Rate', 'Yoklama Hızı'],
    ['Weight', 'Ağırlık'],
  ],

  // ── Tech: Printers ──
  'printers': [
    ['Print Technology', 'Baskı Teknolojisi', 'Type'],
    ['Max Resolution', 'Resolution', 'Çözünürlük'],
    ['Print Speed', 'Speed', 'Baskı Hızı'],
    ['Connectivity', 'Bağlantı'],
    ['Color Print', 'Color', 'Renkli'],
    ['Duplex', 'Çift Taraflı'],
  ],

  // ── Tech: Webcams ──
  'webcams': [
    ['Resolution', 'Video Resolution', 'Çözünürlük'],
    ['Frame Rate', 'FPS', 'Kare Hızı'],
    ['Autofocus', 'AF', 'Otomatik Odak'],
    ['Microphone', 'Mikrofon', 'Built-in Mic'],
    ['Field of View', 'FOV', 'Görüş Açısı'],
    ['Connectivity', 'Connection', 'USB', 'Bağlantı'],
  ],

  // ── Tech: Routers ──
  'routers': [
    ['WiFi Standard', 'WiFi', 'Wi-Fi'],
    ['Speed', 'Max Speed', 'Hız'],
    ['Frequency', 'Band', 'Frekans'],
    ['Ports', 'LAN Ports', 'Port'],
    ['Coverage', 'Range', 'Kapsama'],
    ['MU-MIMO', 'MIMO'],
  ],

  // ── Tech: Robot Vacuums ──
  'robot-vacuums': [
    ['Suction Power', 'Suction', 'Emme Gücü', 'Pa'],
    ['Battery', 'Battery Life', 'Pil Ömrü', 'Runtime'],
    ['Navigation', 'Navigasyon', 'LiDAR', 'Mapping'],
    ['Dustbin Capacity', 'Dustbin', 'Çöp Haznesi'],
    ['Mopping', 'Mop', 'Islak Silme'],
    ['Noise Level', 'dB', 'Gürültü'],
  ],

  // ── Tech: Powerbanks ──
  'powerbanks': [
    ['Capacity', 'Kapasite', 'mAh'],
    ['Output Power', 'Output', 'Çıkış Gücü', 'Max Output'],
    ['Ports', 'Port', 'USB'],
    ['Fast Charge', 'Quick Charge', 'PD', 'Hızlı Şarj'],
    ['Wireless', 'Wireless Charging', 'Kablosuz'],
    ['Weight', 'Ağırlık'],
  ],

  // ── Tech: E-readers ──
  'e-readers': [
    ['Screen Size', 'Display Size', 'Ekran Boyutu'],
    ['Resolution', 'PPI', 'Çözünürlük'],
    ['Storage', 'Internal Storage', 'Dahili Depolama'],
    ['Battery', 'Battery Life', 'Pil Ömrü'],
    ['Backlight', 'Front Light', 'Aydınlatma'],
    ['Waterproof', 'Water Resistance', 'Su Dayanıklılığı', 'IPX'],
  ],

  // ── Tech: Drones ──
  'drones': [
    ['Camera', 'Camera Resolution', 'Kamera', 'Megapixel'],
    ['Flight Time', 'Battery Life', 'Uçuş Süresi', 'Pil'],
    ['Range', 'Max Range', 'Menzil'],
    ['Video Resolution', 'Max Video', '4K', '5K'],
    ['GPS', 'GNSS', 'Positioning'],
    ['Weight', 'Ağırlık'],
  ],

  // ── Subscription: Streaming ──
  'streaming': [
    ['Price', 'Monthly Price', 'Fiyat', 'Aylık'],
    ['Content Library', 'Library Size', 'İçerik'],
    ['Max Resolution', 'Quality', '4K', 'HDR'],
    ['Simultaneous Streams', 'Screens', 'Ekran Sayısı'],
    ['Offline Download', 'Download', 'İndirme'],
    ['Ad-Free', 'Ads', 'Reklamsız'],
  ],

  // ── Subscription: Music ──
  'music': [
    ['Price', 'Monthly Price', 'Fiyat', 'Aylık'],
    ['Library Size', 'Songs', 'Şarkı Sayısı'],
    ['Audio Quality', 'Bitrate', 'Ses Kalitesi', 'Lossless'],
    ['Offline Download', 'Download', 'İndirme'],
    ['Family Plan', 'Family', 'Aile Planı'],
    ['Podcasts', 'Podcast Desteği'],
  ],

  // ── Subscription: VPN ──
  'vpn': [
    ['Price', 'Monthly Price', 'Fiyat'],
    ['Servers', 'Server Count', 'Sunucu Sayısı'],
    ['Countries', 'Locations', 'Ülke Sayısı'],
    ['Speed', 'Max Speed', 'Hız'],
    ['Simultaneous Connections', 'Devices', 'Cihaz Sayısı'],
    ['No-Log Policy', 'Privacy', 'Gizlilik'],
  ],

  // ── Subscription: AI Tools ──
  'ai_tools': [
    ['Price', 'Monthly Price', 'Fiyat'],
    ['Model', 'AI Model', 'Yapay Zeka Modeli'],
    ['Token Limit', 'Context Window', 'Token'],
    ['API Access', 'API', 'Geliştirici Erişimi'],
    ['Image Generation', 'Image', 'Görsel Üretim'],
    ['Integrations', 'Plugins', 'Entegrasyonlar'],
  ],

  // ── Subscription: Cloud Storage ──
  'cloud_storage': [
    ['Storage', 'Capacity', 'Depolama', 'Space'],
    ['Price', 'Monthly Price', 'Fiyat'],
    ['File Size Limit', 'Max File', 'Dosya Boyutu'],
    ['Collaboration', 'Sharing', 'İşbirliği', 'Paylaşım'],
    ['Sync', 'Auto Sync', 'Senkronizasyon'],
    ['Security', 'Encryption', 'Şifreleme'],
  ],

  // ── Gaming: What to Play ──
  'what_to_play': [
    ['Genre', 'Tür'],
    ['Platform', 'Platforms', 'Platform Desteği'],
    ['Rating', 'Metacritic', 'Puan'],
    ['Multiplayer', 'Online', 'Çok Oyunculu'],
    ['Price', 'Fiyat'],
    ['Play Time', 'Duration', 'Oyun Süresi'],
  ],

  // ── Gaming: Game Pass vs PS Plus ──
  'game_pass_vs_ps_plus': [
    ['Price', 'Monthly Price', 'Fiyat'],
    ['Game Library', 'Games', 'Oyun Sayısı'],
    ['Cloud Gaming', 'Streaming', 'Bulut Oyun'],
    ['Day One Releases', 'New Releases', 'Yeni Çıkanlar'],
    ['Online Multiplayer', 'Online', 'Çok Oyunculu'],
    ['Free Games', 'Monthly Games', 'Aylık Oyunlar'],
  ],

  // ── Gaming: PC vs Console ──
  'pc_vs_console': [
    ['Performance', 'FPS', 'Performans'],
    ['Price', 'Cost', 'Fiyat'],
    ['Game Library', 'Exclusive', 'Oyun Kütüphanesi'],
    ['Graphics', 'Resolution', 'Grafik'],
    ['Upgradability', 'Yükseltilebilirlik'],
    ['Online Cost', 'Subscription', 'Online Ücreti'],
  ],

  // ── Gaming: Mobile Games ──
  'mobile_games': [
    ['Genre', 'Tür'],
    ['Size', 'Download Size', 'Boyut'],
    ['In-App Purchases', 'IAP', 'Uygulama İçi Satın Alma'],
    ['Offline', 'Offline Play', 'Çevrimdışı'],
    ['Rating', 'Score', 'Puan'],
    ['Platform', 'iOS', 'Android'],
  ],
};

/// Aliases to resolve Firestore category names to canonical keys.
const categoryAliases = <String, String>{
  'phone': 'smartphones', 'telefon': 'smartphones', 'akıllı telefon': 'smartphones',
  'smartphone': 'smartphones', 'cep telefonu': 'smartphones',
  'tablet': 'tablets',
  'laptop': 'laptops', 'dizüstü': 'laptops', 'notebook': 'laptops', 'dizüstü bilgisayar': 'laptops',
  'desktop': 'desktops', 'masaüstü': 'desktops', 'masaüstü bilgisayar': 'desktops',
  'monitor': 'monitors', 'monitör': 'monitors', 'ekran': 'monitors',
  'tv': 'tvs', 'televizyon': 'tvs', 'television': 'tvs',
  'headphone': 'headphones', 'kulaklık': 'headphones', 'earphone': 'headphones', 'earbuds': 'headphones',
  'keyboard': 'keyboards', 'klavye': 'keyboards',
  'mouse': 'mice', 'fare': 'mice',
  'camera': 'cameras', 'fotoğraf makinesi': 'cameras', 'kamera': 'cameras',
  'action camera': 'action-cameras', 'aksiyon kamera': 'action-cameras',
  'security camera': 'security-cameras', 'güvenlik kamerası': 'security-cameras',
  'printer': 'printers', 'yazıcı': 'printers',
  'webcam': 'webcams', 'web kamerası': 'webcams',
  'router': 'routers', 'modem': 'routers',
  'ssd': 'ssd',
  'hdd': 'ssd', 'hard disk': 'ssd',
  'ram': 'ram', 'memory': 'ram', 'bellek': 'ram',
  'gpu': 'gpus', 'ekran kartı': 'gpus', 'graphics card': 'gpus', 'video card': 'gpus',
  'cpu': 'cpus', 'işlemci': 'cpus', 'processor': 'cpus',
  'motherboard': 'motherboards', 'anakart': 'motherboards',
  'psu': 'psu', 'güç kaynağı': 'psu', 'power supply': 'psu',
  'case': 'cases', 'kasa': 'cases', 'pc case': 'cases',
  'cooler': 'coolers', 'soğutucu': 'coolers', 'cpu cooler': 'coolers',
  'projector': 'projectors', 'projeksiyon': 'projectors',
  'speaker': 'speakers', 'hoparlör': 'speakers',
  'soundbar': 'soundbars', 'ses çubuğu': 'soundbars',
  'smartwatch': 'smartwatches', 'akıllı saat': 'smartwatches', 'watch': 'smartwatches',
  'console': 'consoles', 'oyun konsolu': 'consoles', 'konsol': 'consoles',
  'gamepad': 'gamepads', 'oyun kolu': 'gamepads', 'controller': 'gamepads',
  'robot vacuum': 'robot-vacuums', 'robot süpürge': 'robot-vacuums',
  'powerbank': 'powerbanks', 'power bank': 'powerbanks', 'taşınabilir şarj': 'powerbanks',
  'e-reader': 'e-readers', 'e-kitap': 'e-readers', 'kindle': 'e-readers',
  'drone': 'drones', 'dron': 'drones',
};

/// Resolve any category string to a canonical key in [categoryKeySpecAliases].
String resolveCategory(String raw) {
  final cat = raw.toLowerCase().trim();
  if (categoryKeySpecAliases.containsKey(cat)) return cat;
  final alias = categoryAliases[cat];
  if (alias != null) return alias;
  for (final entry in categoryAliases.entries) {
    if (cat.contains(entry.key) || entry.key.contains(cat)) return entry.value;
  }
  return '';
}

/// Icon for a spec key label.
IconData iconForSpecKey(String key) {
  final k = key.toLowerCase();
  if (k.contains('screen') || k.contains('display') || k.contains('ekran') || k.contains('çözünürlük')) return Icons.monitor_rounded;
  if (k.contains('battery') || k.contains('pil')) return Icons.battery_full_rounded;
  if (k.contains('ram') || k.contains('memory') || k.contains('bellek')) return Icons.memory_rounded;
  if (k.contains('processor') || k.contains('cpu') || k.contains('chip') || k.contains('işlemci')) return Icons.developer_board_rounded;
  if (k.contains('camera') || k.contains('kamera') || k.contains('megapixel')) return Icons.camera_alt_rounded;
  if (k.contains('storage') || k.contains('ssd') || k.contains('hdd') || k.contains('depolama') || k.contains('kapasite') || k.contains('capacity') || k.contains('hard disk')) return Icons.storage_rounded;
  if (k.contains('weight') || k.contains('ağırlık')) return Icons.scale_rounded;
  if (k.contains('5g') || k.contains('4.5g') || k.contains('network') || k.contains('wifi') || k.contains('ağ') || k.contains('bağlantı') || k.contains('connectivity') || k.contains('cellular')) return Icons.signal_cellular_alt_rounded;
  if (k.contains('gpu') || k.contains('graphic') || k.contains('ekran kartı') || k.contains('vram')) return Icons.videogame_asset_rounded;
  if (k.contains('os') || k.contains('operating') || k.contains('işletim')) return Icons.phone_android_rounded;
  if (k.contains('refresh') || k.contains('yenileme')) return Icons.speed_rounded;
  if (k.contains('resolution')) return Icons.high_quality_rounded;
  if (k.contains('panel')) return Icons.grid_view_rounded;
  if (k.contains('hdr')) return Icons.hdr_on_rounded;
  if (k.contains('noise') || k.contains('anc') || k.contains('gürültü')) return Icons.noise_aware_rounded;
  if (k.contains('heart') || k.contains('kalp')) return Icons.favorite_rounded;
  if (k.contains('gps') || k.contains('location') || k.contains('navigation') || k.contains('navigasyon')) return Icons.location_on_rounded;
  if (k.contains('water') || k.contains('su') || k.contains('ip6') || k.contains('atm') || k.contains('waterproof')) return Icons.water_drop_rounded;
  if (k.contains('sensor') || k.contains('sensör')) return Icons.sensors_rounded;
  if (k.contains('dpi') || k.contains('sensitivity')) return Icons.mouse_rounded;
  if (k.contains('switch') || k.contains('anahtar')) return Icons.keyboard_rounded;
  if (k.contains('port') || k.contains('hdmi') || k.contains('usb') || k.contains('connector') || k.contains('konnektör')) return Icons.settings_input_hdmi_rounded;
  if (k.contains('speed') || k.contains('hız') || k.contains('clock') || k.contains('frequency') || k.contains('frekans')) return Icons.speed_rounded;
  if (k.contains('type') || k.contains('tip') || k.contains('form factor')) return Icons.category_rounded;
  if (k.contains('thread') || k.contains('iş parçacığı')) return Icons.hub_rounded;
  if (k.contains('core') || k.contains('çekirdek')) return Icons.developer_board_rounded;
  if (k.contains('socket') || k.contains('soket')) return Icons.electrical_services_rounded;
  if (k.contains('cache') || k.contains('önbellek')) return Icons.cached_rounded;
  if (k.contains('tdp') || k.contains('güç') || k.contains('power') || k.contains('watt')) return Icons.bolt_rounded;
  if (k.contains('cool') || k.contains('soğut') || k.contains('fan')) return Icons.ac_unit_rounded;
  if (k.contains('warranty') || k.contains('garanti')) return Icons.verified_rounded;
  if (k.contains('nfc') || k.contains('payment')) return Icons.contactless_rounded;
  if (k.contains('microphone') || k.contains('mikrofon')) return Icons.mic_rounded;
  if (k.contains('rgb') || k.contains('backlight') || k.contains('aydınlatma')) return Icons.lightbulb_rounded;
  if (k.contains('bluetooth')) return Icons.bluetooth_rounded;
  if (k.contains('channel') || k.contains('kanal') || k.contains('dolby') || k.contains('atmos') || k.contains('surround')) return Icons.surround_sound_rounded;
  if (k.contains('subwoofer') || k.contains('bass')) return Icons.speaker_rounded;
  if (k.contains('brightness') || k.contains('lumen') || k.contains('parlaklık')) return Icons.wb_sunny_rounded;
  if (k.contains('contrast') || k.contains('kontrast')) return Icons.contrast_rounded;
  if (k.contains('throw') || k.contains('mesafe') || k.contains('projection')) return Icons.settings_overscan_rounded;
  if (k.contains('suction') || k.contains('emme')) return Icons.air_rounded;
  if (k.contains('mopping') || k.contains('mop') || k.contains('silme')) return Icons.cleaning_services_rounded;
  if (k.contains('stabiliz')) return Icons.control_camera_rounded;
  if (k.contains('flight') || k.contains('uçuş')) return Icons.flight_rounded;
  if (k.contains('range') || k.contains('menzil') || k.contains('coverage') || k.contains('kapsama')) return Icons.cell_tower_rounded;
  if (k.contains('price') || k.contains('fiyat') || k.contains('cost')) return Icons.attach_money_rounded;
  if (k.contains('genre') || k.contains('tür')) return Icons.sports_esports_rounded;
  if (k.contains('rating') || k.contains('puan') || k.contains('score')) return Icons.star_rounded;
  if (k.contains('multiplayer') || k.contains('online') || k.contains('çok oyunculu')) return Icons.people_rounded;
  if (k.contains('content') || k.contains('library') || k.contains('içerik') || k.contains('kütüphane')) return Icons.library_books_rounded;
  if (k.contains('download') || k.contains('indirme') || k.contains('offline') || k.contains('çevrimdışı')) return Icons.download_rounded;
  if (k.contains('model') || k.contains('token') || k.contains('api')) return Icons.smart_toy_rounded;
  if (k.contains('integration') || k.contains('plugin') || k.contains('entegrasyon')) return Icons.extension_rounded;
  if (k.contains('sync') || k.contains('senkronizasyon')) return Icons.sync_rounded;
  if (k.contains('security') || k.contains('encryption') || k.contains('şifreleme') || k.contains('privacy') || k.contains('gizlilik')) return Icons.lock_rounded;
  if (k.contains('collaboration') || k.contains('sharing') || k.contains('paylaşım') || k.contains('işbirliği')) return Icons.share_rounded;
  if (k.contains('server') || k.contains('sunucu')) return Icons.dns_rounded;
  if (k.contains('country') || k.contains('ülke')) return Icons.public_rounded;
  if (k.contains('family') || k.contains('aile')) return Icons.family_restroom_rounded;
  if (k.contains('podcast')) return Icons.podcasts_rounded;
  if (k.contains('audio') || k.contains('ses')) return Icons.headphones_rounded;
  if (k.contains('ad') || k.contains('reklam')) return Icons.block_rounded;
  if (k.contains('stream') || k.contains('simultaneous') || k.contains('ekran sayısı')) return Icons.devices_rounded;
  return Icons.info_outline_rounded;
}
