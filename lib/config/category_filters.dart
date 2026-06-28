/// Web-aligned category filter definitions — a faithful Dart port of
/// `web/src/lib/categoryFilters.js`. This is the SINGLE SOURCE OF TRUTH for
/// which filters appear in each category, in what ORDER, with what labels, and
/// how token values are parsed/formatted. The Flutter app and qorai.net read
/// the very same `filterTokens` field from the same Typesense collection, so
/// keeping these definitions identical keeps the two filter UIs in lock-step.
///
/// If you change a group/feature/label here, mirror it in categoryFilters.js
/// (and vice-versa). Do NOT fork the two.
library;

/// A `[en, tr, de]` label triple.
typedef Label = List<String>;

Label _label(String en, String tr, String de) => [en, tr, de];

/// Pick the right language out of a `[en, tr, de]` label.
String lbl(Label arr, String lang) {
  if (lang == 'tr') return arr[1];
  if (lang == 'de') return arr[2];
  return arr[0];
}

const List<String> _computingCats = [
  'smartphones', 'tablets', 'laptops', 'desktops', 'gaming_consoles', 'consoles',
  'media_players', 'vr_headsets', 'e_readers', 'e-readers',
];
const List<String> _displayCats = [
  'monitors', 'tvs', 'projectors', 'smartphones', 'tablets', 'laptops',
  'smartwatches', 'e_readers', 'e-readers', 'vr_headsets',
];
const List<String> _mobileCats = ['smartphones', 'tablets', 'smartwatches'];

/// One filter group keyed by a `filterTokens` prefix (e.g. `ram`, `storage`).
class TokenGroup {
  final String prefix;

  /// `'range'` → render a (discrete) range slider over the token values.
  /// `null`   → render a multi-select checkbox/chip list.
  final String? kind;

  /// Unit used for range parsing/formatting: capacity | mt | cl | inch | hz.
  final String unit;
  final Label label;

  /// Categories this group applies to (lower-case slugs). `null` = all.
  final List<String>? categories;

  const TokenGroup({
    required this.prefix,
    required this.label,
    this.kind,
    this.unit = 'capacity',
    this.categories,
  });

  bool get isRange => kind == 'range';
}

/// Ordered list of filter groups — the sidebar/sheet renders them in this
/// exact order (mirrors web `TOKEN_GROUPS`).
final List<TokenGroup> kTokenGroups = [
  // Smart vs feature phones live in one `smartphones` category — this toggle
  // splits them back apart (every phone is tagged phone_type:smart|feature).
  TokenGroup(prefix: 'phone_type', label: _label('Phone type', 'Telefon tipi', 'Telefontyp'), categories: const ['smartphones']),
  TokenGroup(prefix: 'storage', kind: 'range', unit: 'capacity', label: _label('Storage', 'Depolama', 'Speicher'), categories: [..._computingCats, 'ssd', 'ssds', 'storage', 'flash_drives']),
  TokenGroup(prefix: 'ram', kind: 'range', unit: 'capacity', label: _label('RAM', 'RAM', 'RAM'), categories: [..._computingCats, 'ram']),
  TokenGroup(prefix: 'ram_speed', kind: 'range', unit: 'mt', label: _label('Memory speed', 'Bellek hızı', 'Speichertakt'), categories: const ['ram']),
  TokenGroup(prefix: 'ram_latency', kind: 'range', unit: 'cl', label: _label('CL latency', 'CL gecikme', 'CL-Latenz'), categories: const ['ram']),
  TokenGroup(prefix: 'screen_size', kind: 'range', unit: 'inch', label: _label('Screen size', 'Ekran boyutu', 'Bildschirmgröße'), categories: _displayCats),
  TokenGroup(prefix: 'refresh_rate', kind: 'range', unit: 'hz', label: _label('Refresh rate', 'Yenileme hızı', 'Bildrate'), categories: _displayCats),
  TokenGroup(prefix: 'screen_tech', label: _label('Panel type', 'Panel tipi', 'Panel'), categories: _displayCats),
  TokenGroup(prefix: 'resolution', label: _label('Resolution', 'Çözünürlük', 'Auflösung'), categories: const ['monitors', 'tvs', 'projectors', 'laptops', 'tablets', 'smartphones']),
  TokenGroup(prefix: 'display_input', label: _label('Inputs', 'Girişler', 'Anschlüsse'), categories: const ['monitors', 'tvs', 'projectors']),
  TokenGroup(prefix: 'os', label: _label('Operating system', 'İşletim sistemi', 'Betriebssystem'), categories: [..._computingCats, 'smartwatches', 'tvs']),
  TokenGroup(prefix: 'processor_brand', label: _label('Processor', 'İşlemci', 'Prozessor'), categories: const ['smartphones', 'tablets', 'laptops', 'desktops', 'smartwatches', 'cpus']),
  TokenGroup(prefix: 'gpu_type', label: _label('Graphics', 'Ekran kartı', 'Grafik'), categories: const ['laptops', 'desktops']),
  TokenGroup(prefix: 'ram_type', label: _label('Memory type', 'Bellek tipi', 'Speichertyp'), categories: const ['ram', 'laptops', 'desktops', 'motherboards']),
  TokenGroup(prefix: 'ram_module', label: _label('Module type', 'Modül tipi', 'Modultyp'), categories: const ['ram']),
  TokenGroup(prefix: 'ram_kit', label: _label('Kit', 'Kit', 'Kit'), categories: const ['ram']),
  TokenGroup(prefix: 'ram_platform', label: _label('Platform', 'Platform', 'Plattform'), categories: const ['ram']),
  TokenGroup(prefix: 'storage_type', label: _label('Storage type', 'Depolama tipi', 'Speicherart'), categories: const ['ssd', 'ssds', 'storage', 'laptops', 'desktops']),
  TokenGroup(prefix: 'socket', label: _label('Socket', 'Soket', 'Sockel'), categories: const ['cpus', 'motherboards', 'cpu_coolers']),
  TokenGroup(prefix: 'connectivity', label: _label('Connectivity', 'Bağlantı', 'Konnektivität'), categories: [..._mobileCats, 'laptops', 'routers', 'wifi_routers', 'modem_routers']),
];

/// One boolean feature toggle (a `prefix:true` token).
class FeatureToken {
  final String token; // e.g. 'five_g:true'
  final Label label;
  final List<String>? categories;
  const FeatureToken({required this.token, required this.label, this.categories});

  String get prefix => token.split(':').first;
}

/// Ordered feature toggles (mirrors web `FEATURE_TOKENS`).
final List<FeatureToken> kFeatureTokens = [
  FeatureToken(token: 'five_g:true', label: _label('5G', '5G', '5G'), categories: _mobileCats),
  FeatureToken(token: 'nfc:true', label: _label('NFC', 'NFC', 'NFC'), categories: _mobileCats),
  FeatureToken(token: 'wireless_charging:true', label: _label('Wireless charging', 'Kablosuz şarj', 'Kabelloses Laden'), categories: const ['smartphones', 'smartwatches', 'earbuds', 'headphones']),
  FeatureToken(token: 'fast_charging:true', label: _label('Fast charging', 'Hızlı şarj', 'Schnellladen'), categories: const ['smartphones', 'tablets', 'laptops', 'smartwatches', 'headphones', 'earbuds', 'powerbanks']),
  FeatureToken(token: 'fingerprint:true', label: _label('Fingerprint', 'Parmak izi', 'Fingerabdruck'), categories: const ['smartphones', 'tablets', 'laptops']),
  FeatureToken(token: 'water_resistance:true', label: _label('Water resistant', 'Suya dayanıklı', 'Wasserfest'), categories: const ['smartphones', 'smartwatches', 'headphones', 'earbuds', 'speakers']),
  FeatureToken(token: 'ecc:true', label: _label('ECC', 'ECC', 'ECC'), categories: const ['ram']),
  FeatureToken(token: 'lighting:true', label: _label('Lighting', 'Aydınlatma', 'Beleuchtung'), categories: const ['ram']),
  FeatureToken(token: 'rgb:true', label: _label('RGB', 'RGB', 'RGB'), categories: const ['ram']),
  FeatureToken(token: 'xmp:true', label: _label('Intel XMP', 'Intel XMP', 'Intel XMP'), categories: const ['ram']),
  FeatureToken(token: 'expo:true', label: _label('AMD EXPO', 'AMD EXPO', 'AMD EXPO'), categories: const ['ram']),
];

/// Display labels for known token values. Value is either a plain `String`
/// (language-neutral) or a `[en, tr, de]` label triple.
const Map<String, dynamic> _tokenValueLabel = {
  'smart': ['Smartphone', 'Akıllı telefon', 'Smartphone'],
  'feature': ['Feature phone', 'Tuşlu telefon', 'Feature Phone'],
  'amoled': 'AMOLED', 'super_amoled': 'Super AMOLED', 'dynamic_amoled': 'Dynamic AMOLED', 'oled': 'OLED', 'qd_oled': 'QD-OLED', 'qled': 'QLED', 'mini_led': 'Mini LED', 'micro_led': 'Micro LED', 'ltpo': 'LTPO', 'ips': 'IPS', 'lcd': 'LCD', 'va': 'VA', 'tn': 'TN', 'retina': 'Retina', 'eink': 'E-Ink',
  'google': 'Google Tensor', 'kirin': 'Kirin', 'unisoc': 'UNISOC',
  'fhd': 'Full HD', 'qhd': 'QHD', 'wqhd': 'WQHD', 'uwqhd': 'UWQHD', '4k': '4K', '5k': '5K', '8k': '8K', 'hd': 'HD',
  'hdmi': 'HDMI', 'displayport': 'DisplayPort', 'usb_c': 'USB-C', 'thunderbolt': 'Thunderbolt', 'dvi': 'DVI', 'vga': 'VGA',
  'windows': 'Windows', 'macos': 'macOS', 'ios': 'iOS', 'ipados': 'iPadOS', 'android': 'Android', 'chromeos': 'ChromeOS', 'linux': 'Linux',
  'intel': 'Intel', 'amd': 'AMD', 'apple': 'Apple', 'qualcomm': 'Qualcomm', 'mediatek': 'MediaTek', 'exynos': 'Exynos',
  'dedicated': ['Dedicated', 'Harici', 'Dediziert'], 'integrated': ['Integrated', 'Dahili', 'Integriert'],
  'ddr3': 'DDR3', 'ddr4': 'DDR4', 'ddr5': 'DDR5', 'lpddr4x': 'LPDDR4X', 'lpddr5': 'LPDDR5', 'lpddr5x': 'LPDDR5X',
  'dimm': 'DIMM', 'sodimm': 'SO-DIMM', 'udimm': 'UDIMM', 'rdimm': 'RDIMM', 'lrdimm': 'LRDIMM',
  'desktop': ['Desktop', 'Masaüstü', 'Desktop'], 'laptop': ['Laptop', 'Dizüstü', 'Laptop'], 'server': ['Server', 'Sunucu', 'Server'],
  '1_modules': ['Single module', 'Tek modül', '1 Modul'], '2_modules': ['2 modules', '2 modül', '2 Module'],
  '3_modules': ['3 modules', '3 modül', '3 Module'], '4_modules': ['4 modules', '4 modül', '4 Module'],
  '8_modules': ['8 modules', '8 modül', '8 Module'],
  'ssd': 'SSD', 'hdd': 'HDD', 'nvme': 'NVMe', 'sata': 'SATA', 'emmc': 'eMMC', 'ufs': 'UFS',
  'wi-fi': 'Wi-Fi', '5g': '5G', '4g': '4G',
};

String _catKey(String? category) {
  // Mirror web `catKey` (lower-case) but also fold hyphen/space → underscore so
  // app slugs like "media-players" match the underscore form used above.
  final lower = (category ?? '').toLowerCase().trim();
  return lower.replaceAll('-', '_').replaceAll(' ', '_');
}

bool _inCatList(String? category, List<String>? list) {
  if (list == null) return true;
  final key = _catKey(category);
  // Allow both the raw lower-case slug and the underscore-folded one.
  final raw = (category ?? '').toLowerCase().trim();
  return list.any((c) => c == key || c == raw);
}

/// Token groups available for a category, in canonical order.
List<TokenGroup> filterGroupsForCategory(String? category) =>
    kTokenGroups.where((g) => _inCatList(category, g.categories)).toList();

/// Feature toggles available for a category, in canonical order.
List<FeatureToken> featureFiltersForCategory(String? category) =>
    kFeatureTokens.where((f) => _inCatList(category, f.categories)).toList();

/// Strip the `prefix:` from a token, returning the bare value.
String tokenValue(String token, String prefix) {
  final wanted = '$prefix:';
  return token.startsWith(wanted) ? token.substring(wanted.length) : token;
}

/// Parse a capacity token value (`8_gb`, `1_tb`) into GB. Null if not a capacity.
double? capacityGbFromTokenValue(String value) {
  final match = RegExp(r'^(\d+(?:\.\d+)?)_(gb|tb)$').firstMatch(value.toLowerCase());
  if (match == null) return null;
  final n = double.tryParse(match.group(1)!);
  if (n == null || n <= 0) return null;
  return match.group(2) == 'tb' ? n * 1024 : n;
}

/// Parse a token value into a comparable number for the given range unit.
double? rangeNumberFromTokenValue(String value, [String unit = 'capacity']) {
  final raw = value.toLowerCase();
  if (unit == 'capacity') return capacityGbFromTokenValue(raw);
  if (unit == 'cl') {
    final m = RegExp(r'^(\d+(?:\.\d+)?)_cl$').firstMatch(raw);
    if (m == null) return null;
    final n = double.tryParse(m.group(1)!);
    return (n != null && n > 0) ? n : null;
  }
  if (unit == 'inch') {
    final m = RegExp(r'^(\d+(?:\.\d+)?)_in$').firstMatch(raw);
    if (m == null) return null;
    final n = double.tryParse(m.group(1)!);
    return (n != null && n > 0) ? n : null;
  }
  final m = RegExp(r'^(\d+(?:\.\d+)?)_(hz|mhz|mt|cl)$').firstMatch(raw);
  if (m == null) return null;
  final suffix = m.group(2);
  if (unit == 'hz' && suffix != 'hz') return null;
  if (unit == 'mt' && suffix != 'mt' && suffix != 'mhz') return null;
  final n = double.tryParse(m.group(1)!);
  if (n == null || n <= 0) return null;
  return n;
}

String formatCapacityGb(double gb) {
  if (gb <= 0) return '';
  if (gb >= 1024 && gb % 1024 == 0) return '${(gb / 1024).toStringAsFixed(0)} TB';
  if (gb >= 1024) {
    final tb = (gb / 1024).toStringAsFixed(1);
    return '${tb.endsWith('.0') ? tb.substring(0, tb.length - 2) : tb} TB';
  }
  return '${gb.round()} GB';
}

/// Format a numeric range value for display, given its unit.
String formatRangeValue(double value, [String unit = 'capacity']) {
  if (value <= 0) return '';
  switch (unit) {
    case 'capacity':
      return formatCapacityGb(value);
    case 'hz':
      return '${value.round()} Hz';
    case 'mt':
      return '${value.round()} MT/s';
    case 'cl':
      return 'CL ${value.round()}';
    case 'inch':
      return value % 1 == 0 ? '${value.round()}"' : '${value.toStringAsFixed(1)}"';
    default:
      return value.round().toString();
  }
}

/// Pretty display string for a bare token value (e.g. `8_gb` → `8 GB`,
/// `usb_c` → `USB-C`, `amoled` → `AMOLED`), localized when known.
String prettyTokenValue(String value, String lang) {
  final key = value.toLowerCase();
  final capacity = capacityGbFromTokenValue(key);
  if (capacity != null) return formatCapacityGb(capacity);

  final freq = RegExp(r'^(\d+(?:\.\d+)?)_(hz|mhz|mt)$').firstMatch(key);
  if (freq != null) {
    final n = double.tryParse(freq.group(1)!)?.round() ?? 0;
    return '$n ${freq.group(2) == 'hz' ? 'Hz' : 'MT/s'}';
  }
  if (RegExp(r'^\d+(?:\.\d+)?_cl$').hasMatch(key)) {
    return formatRangeValue(double.parse(key.split('_').first), 'cl');
  }
  if (RegExp(r'^\d+(?:\.\d+)?_in$').hasMatch(key)) {
    return formatRangeValue(double.parse(key.split('_').first), 'inch');
  }

  final mapped = _tokenValueLabel[key];
  if (mapped != null) {
    return mapped is List ? lbl(List<String>.from(mapped), lang) : mapped as String;
  }

  return value
      .replaceAll('_', ' ')
      .replaceAllMapped(RegExp(r'\bgb\b', caseSensitive: false), (_) => 'GB')
      .replaceAllMapped(RegExp(r'\btb\b', caseSensitive: false), (_) => 'TB')
      .replaceAllMapped(RegExp(r'\bmah\b', caseSensitive: false), (_) => 'mAh')
      .replaceAllMapped(RegExp(r'\binch\b', caseSensitive: false), (_) => '"')
      .replaceAllMapped(RegExp(r'\bhz\b', caseSensitive: false), (_) => 'Hz')
      .trim();
}

/// Numeric-aware comparison of two full tokens sharing a prefix (for sorting
/// option lists so `8 GB` comes before `12 GB`, etc.).
int compareTokenValues(String prefix, String a, String b) {
  final av = tokenValue(a, prefix);
  final bv = tokenValue(b, prefix);
  final ag = capacityGbFromTokenValue(av);
  final bg = capacityGbFromTokenValue(bv);
  if (ag != null && bg != null) return ag.compareTo(bg);
  final ar = rangeNumberFromTokenValue(av, 'hz') ?? rangeNumberFromTokenValue(av, 'mt') ?? rangeNumberFromTokenValue(av, 'cl');
  final br = rangeNumberFromTokenValue(bv, 'hz') ?? rangeNumberFromTokenValue(bv, 'mt') ?? rangeNumberFromTokenValue(bv, 'cl');
  if (ar != null && br != null) return ar.compareTo(br);
  final an = double.tryParse(av);
  final bn = double.tryParse(bv);
  if (an != null && bn != null) return an.compareTo(bn);
  return av.toLowerCase().compareTo(bv.toLowerCase());
}
