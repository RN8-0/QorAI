import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';
import 'package:qor_ai/core/category_key_specs.dart' as key_specs;

/// Shared key specs grid widget used by both detail and compare screens.
/// Shows category-aware key specifications in a compact grid.
class SharedKeySpecsGrid extends StatelessWidget {
  final ProductEntity product;
  const SharedKeySpecsGrid({super.key, required this.product});

  // Category-based key spec names — priority ordered, at least 9 per category.
  // Each entry is a list of ALIASES that match the same concept; first match wins.
  static const _categoryKeys = <String, List<List<String>>>{
    'smartphones': [
      ['Screen Size', 'Display Size', 'Display Boyutu', 'Ekran Boyutu'],
      ['RAM', 'Memory (RAM)', 'RAM Kapasitesi'],
      ['Storage', 'Internal Storage', 'Dahili Depolama', 'ROM'],
      ['Battery', 'Battery Capacity', 'Pil', 'Pil Kapasitesi'],
      ['Camera', 'Main Camera', 'Kamera', 'Camera Çözünürlük'],
      ['Processor', 'Chipset', 'İşlemci', 'Processor Model', 'CPU'],
      ['OS', 'Operating System', 'İşletim Sistemi'],
      ['5G', 'Network', 'Ağ', '4.5G', 'Cellular'],
      ['Weight', 'Ağırlık'],
      ['Resolution', 'Çözünürlük', 'Screen Resolution'],
    ],
    'tablets': [
      ['Screen Size', 'Display Size', 'Display Boyutu', 'Ekran Boyutu'],
      ['RAM', 'Memory (RAM)', 'RAM Kapasitesi'],
      ['Storage', 'Internal Storage', 'Dahili Depolama'],
      ['Battery', 'Battery Capacity', 'Pil'],
      ['Processor', 'Chipset', 'İşlemci', 'Processor Model'],
      ['OS', 'Operating System', 'İşletim Sistemi'],
      ['Camera', 'Main Camera', 'Kamera', 'Camera Çözünürlük'],
      ['Resolution', 'Çözünürlük', 'Screen Resolution'],
      ['5G', 'Network', 'Ağ', 'Cellular'],
      ['Display Technology', 'Panel', 'Ekran Teknolojisi'],
      ['Weight', 'Ağırlık'],
    ],
    'laptops': [
      [
        'Screen Size',
        'Display Size',
        'Display diagonal',
        'Display',
        'Ekran Boyutu',
      ],
      ['RAM', 'Memory (RAM)', 'Internal memory', 'RAM Kapasitesi'],
      [
        'Storage',
        'SSD',
        'Internal Storage',
        'Total storage capacity',
        'Dahili Depolama',
        'Hard Disk (SSD)',
      ],
      ['Processor', 'CPU', 'İşlemci', 'Processor Model', 'Processor model'],
      [
        'GPU',
        'Graphics Card',
        'Grafik',
        'Ekran Kartı',
        'GPU Model',
        'Video Card',
        'On-board graphics card model',
      ],
      ['Battery', 'Akku', 'Battery Life', 'Battery capacity', 'Pil'],
      ['OS', 'Operating System', 'Betriebssystem', 'İşletim Sistemi'],
      ['Weight', 'Gewicht', 'Ağırlık'],
      ['Display Technology', 'Panel', 'Refresh Rate', 'Yenileme Hızı'],
    ],
    'monitors': [
      ['Screen Size', 'Display Size', 'Display Boyutu', 'Ekran Boyutu'],
      ['Resolution', 'Çözünürlük'],
      ['Panel Type', 'Panel', 'Panel Tipi'],
      ['Refresh Rate', 'Yenileme Hızı'],
      ['Response Time', 'Tepki Süresi'],
      ['HDR', 'HDR Support', 'HDR Desteği'],
      ['Connectivity', 'Bağlantı', 'Ports'],
      ['Aspect Ratio', 'En Boy Oranı'],
      ['Weight', 'Ağırlık'],
    ],
    'tvs': [
      ['Screen Size', 'Display Size', 'Display Boyutu', 'Ekran Boyutu'],
      ['Resolution', 'Çözünürlük'],
      ['Panel Type', 'Panel', 'Panel Tipi'],
      ['Smart TV', 'Akıllı TV'],
      ['HDR', 'HDR Support'],
      ['Refresh Rate', 'Yenileme Hızı'],
      ['HDMI', 'HDMI Ports', 'HDMI Girişi'],
      ['OS', 'Operating System', 'İşletim Sistemi'],
      ['Weight', 'Ağırlık'],
    ],
    'headphones': [
      ['Type', 'Tip', 'Form'],
      ['Driver', 'Driver Size', 'Sürücü Boyutu'],
      ['Frequency Response', 'Frekans'],
      ['Impedance', 'Empedans'],
      ['Noise Cancelling', 'ANC', 'Gürültü Engelleme'],
      ['Connectivity', 'Bağlantı', 'Connection'],
      ['Battery', 'Battery Life', 'Pil Ömrü'],
      ['Weight', 'Ağırlık'],
      ['Microphone', 'Mikrofon'],
    ],
    'keyboards': [
      ['Switch Type', 'Switch', 'Anahtar Tipi'],
      ['Layout', 'Düzen'],
      ['Connectivity', 'Bağlantı', 'Connection'],
      ['Backlighting', 'RGB', 'Aydınlatma'],
      ['Battery Life', 'Battery', 'Pil Ömrü'],
      ['Compatibility', 'Uyumluluk'],
      ['Numpad', 'Number Pad'],
      ['Dimensions', 'Boyutlar'],
      ['Weight', 'Ağırlık'],
    ],
    'mice': [
      ['DPI', 'Sensitivity', 'Hassasiyet'],
      ['Connectivity', 'Bağlantı', 'Connection'],
      ['Buttons', 'Button Count', 'Tuş Sayısı'],
      ['Battery', 'Battery Life', 'Pil'],
      ['Sensor', 'Sensör'],
      ['Weight', 'Ağırlık'],
      ['Polling Rate', 'Yoklama Hızı'],
      ['Compatibility', 'Uyumluluk'],
      ['RGB', 'Lighting'],
    ],
    'cameras': [
      ['Sensor Size', 'Sensör Boyutu', 'Sensor'],
      ['Megapixels', 'Resolution', 'Çözünürlük'],
      ['Video Resolution', 'Video', '4K'],
      ['ISO', 'ISO Range'],
      ['Shutter Speed', 'Enstantane'],
      ['Autofocus', 'AF', 'Otomatik Odak'],
      ['Connectivity', 'Bağlantı'],
      ['Battery', 'Pil'],
      ['Weight', 'Ağırlık'],
    ],
    'printers': [
      ['Print Technology', 'Baskı Teknolojisi', 'Type'],
      ['Max Resolution', 'Resolution', 'Çözünürlük'],
      ['Print Speed', 'Speed', 'Baskı Hızı'],
      ['Connectivity', 'Bağlantı'],
      ['Paper Size', 'Kağıt Boyutu'],
      ['Color Print', 'Color', 'Renkli'],
      ['Duplex', 'Çift Taraflı'],
      ['Cartridge Type', 'Kartuş'],
      ['Weight', 'Ağırlık'],
    ],
    'routers': [
      ['WiFi Standard', 'WiFi', 'Wi-Fi'],
      ['Frequency', 'Band', 'Frekans'],
      ['Speed', 'Max Speed', 'Hız'],
      ['Ports', 'LAN Ports', 'Port'],
      ['Coverage', 'Range', 'Kapsama'],
      ['MU-MIMO', 'MIMO'],
      ['Beamforming', 'Beam'],
      ['Security', 'Güvenlik'],
      ['Antennas', 'Antenna', 'Anten'],
    ],
    'ssds': [
      ['Capacity', 'Kapasite', 'Size'],
      ['Interface', 'Arayüz', 'Connection'],
      ['Read Speed', 'Okuma Hızı', 'Sequential Read'],
      ['Write Speed', 'Yazma Hızı', 'Sequential Write'],
      ['Form Factor', 'Form'],
      ['NAND Type', 'NAND', 'Flash Type'],
      ['TBW', 'Endurance'],
      ['Warranty', 'Garanti'],
      ['Encryption', 'Şifreleme'],
    ],
    'hdds': [
      ['Capacity', 'Kapasite', 'Size'],
      ['RPM', 'Devir', 'Rotation Speed'],
      ['Interface', 'Arayüz'],
      ['Cache Size', 'Cache', 'Buffer', 'Önbellek'],
      ['Form Factor', 'Form'],
      ['Read Speed', 'Okuma Hızı'],
      ['Write Speed', 'Yazma Hızı'],
      ['Warranty', 'Garanti'],
      ['Shock Resistance', 'Darbe Dayanımı'],
    ],
    'ram': [
      ['Capacity', 'Kapasite', 'Size'],
      ['Type', 'DDR', 'Tip'],
      ['Speed', 'Clock', 'Hız'],
      ['Latency', 'CAS', 'CL', 'Gecikme'],
      ['Voltage', 'Voltaj'],
      ['Form Factor', 'Form'],
      ['ECC', 'Error Correction'],
      ['Warranty', 'Garanti'],
      ['Heat Spreader', 'Heatsink', 'Soğutucu'],
    ],
    'gpus': [
      ['VRAM', 'Memory', 'Bellek', 'Video Memory'],
      ['Architecture', 'Mimari', 'GPU Chip'],
      ['TDP', 'Power', 'Güç Tüketimi', 'Watt'],
      ['Core Clock', 'Base Clock', 'Temel Saat'],
      ['Boost Clock', 'Turbo Clock'],
      ['Memory Bandwidth', 'Bant Genişliği'],
      ['Ports', 'Display Outputs', 'Çıkış'],
      ['Cooling', 'Fan', 'Soğutma'],
      ['Length', 'Uzunluk', 'Dimensions'],
    ],
    'cpus': [
      ['Cores', 'Core Count', 'Çekirdek'],
      ['Threads', 'Thread Count', 'İş Parçacığı'],
      ['Base Clock', 'Base Frequency', 'Temel Frekans'],
      ['Boost Clock', 'Turbo', 'Max Frequency'],
      ['TDP', 'Power', 'Güç Tüketimi', 'Watt'],
      ['Socket', 'Soket'],
      ['Cache', 'L3 Cache', 'Önbellek'],
      ['Architecture', 'Mimari', 'Process'],
      ['Integrated GPU', 'iGPU', 'Dahili GPU'],
    ],
    'smartwatches': [
      ['Screen Size', 'Display Size', 'Display Boyutu', 'Ekran Boyutu'],
      ['Battery', 'Battery Life', 'Pil Ömrü'],
      ['OS', 'Operating System', 'İşletim Sistemi'],
      ['Heart Rate', 'Kalp Atış', 'HR'],
      ['GPS', 'Location'],
      ['Water Resistance', 'Su Direnci', 'ATM', 'IP'],
      ['Connectivity', 'Bağlantı'],
      ['Weight', 'Ağırlık'],
      ['NFC', 'Payment'],
    ],
    'powerbanks': [
      ['Capacity', 'Kapasite', 'mAh'],
      ['Output Power', 'Output', 'Çıkış Gücü', 'Max Output'],
      ['Input Power', 'Input', 'Giriş Gücü'],
      ['Ports', 'Port', 'USB'],
      ['Wireless', 'Wireless Charging', 'Kablosuz'],
      ['Weight', 'Ağırlık'],
      ['Pass-Through', 'Pass Through'],
      ['Warranty', 'Garanti'],
      ['Fast Charge', 'Quick Charge', 'PD', 'Hızlı Şarj'],
    ],
  };

  static IconData iconForSpec(String key) => key_specs.iconForSpecKey(key);

  String _resolveCategory() {
    final cat = product.category.toLowerCase().trim();
    // Check local _categoryKeys first (has extended 9-spec lists)
    if (_categoryKeys.containsKey(cat)) return cat;
    // Try centralized resolver, then map back to local key
    final resolved = key_specs.resolveCategory(cat);
    if (_categoryKeys.containsKey(resolved)) return resolved;
    // Handle pluralization differences (ssd→ssds, etc.)
    if (_categoryKeys.containsKey('${resolved}s')) return '${resolved}s';
    return resolved;
  }

  /// Build a merged pool of all available specs from the localized, baked
  /// sections (the exact data the admin + detail spec card render). Flattened to
  /// {label: value}, first-wins on collisions. Never touches the raw
  /// `specs`/`keySpecs` fields, which can still hold machine-translation
  /// artefacts (e.g. "6.9 İnç" → "6.9 I'm not").
  Map<String, String> _buildSpecPool(String locale) {
    final pool = <String, String>{};
    for (final section in product.localizedSpecSections(locale).values) {
      for (final e in section.entries) {
        if (pool.containsKey(e.key)) continue;
        final v = e.value.trim();
        if (v.isNotEmpty && v != '-' && v != 'N/A') pool[e.key] = v;
      }
    }
    return pool;
  }

  static String _norm(String value) {
    return value
        .toLowerCase()
        .replaceAll('ı', 'i')
        .replaceAll('İ', 'i')
        .replaceAll('ğ', 'g')
        .replaceAll('ü', 'u')
        .replaceAll('ş', 's')
        .replaceAll('ö', 'o')
        .replaceAll('ç', 'c');
  }

  static String _conceptForKey(String key) {
    final k = _norm(key);
    if (k.contains('screen size') ||
        k.contains('display size') ||
        k.contains('display boyutu') ||
        k.contains('ekran boyutu')) {
      return 'display_size';
    }
    if (k.contains('ram') || k.contains('memory') || k.contains('bellek')) {
      return 'ram';
    }
    if (k.contains('storage') ||
        k.contains('depolama') ||
        k == 'rom' ||
        k.contains('ssd')) {
      return 'storage';
    }
    if (k.contains('battery') || k.contains('pil') || k.contains('batarya')) {
      return 'battery';
    }
    if (k.contains('camera') || k.contains('kamera') || k.contains('mp')) {
      return 'camera';
    }
    if (k.contains('processor') ||
        k.contains('chipset') ||
        k.contains('islemci') ||
        k.contains('cpu')) {
      return 'processor';
    }
    if (k.contains('operating') || k.contains('isletim') || k == 'os') {
      return 'os';
    }
    if (k.contains('5g') ||
        k.contains('4g') ||
        k.contains('network') ||
        k.contains('cellular') ||
        k.contains('baglanti') ||
        k.contains('ag')) {
      return 'network';
    }
    if (k.contains('display technology') ||
        k.contains('ekran teknolojisi') ||
        k.contains('panel')) {
      return 'display_tech';
    }
    if (k.contains('resolution') || k.contains('cozunurluk')) {
      return 'resolution';
    }
    if (k.contains('weight') || k.contains('agirlik')) {
      return 'weight';
    }
    return k.replaceAll(RegExp(r'[^a-z0-9]+'), '_');
  }

  MapEntry<String, String>? _findSpec(
    Map<String, String> pool,
    List<String> aliases,
    Set<String> used,
    Set<String> usedConcepts,
  ) {
    final isScreenSizeSlot = aliases.any((alias) {
      final a = alias.toLowerCase();
      return a.contains('screen size') ||
          a.contains('display size') ||
          a.contains('ekran boyutu') ||
          a.contains('display boyutu');
    });
    for (final alias in aliases) {
      final aLower = alias.toLowerCase();
      for (final e in pool.entries) {
        if (used.contains(e.key)) continue;
        final concept = _conceptForKey(e.key);
        if (usedConcepts.contains(concept)) continue;
        final eLower = e.key.toLowerCase();
        if (eLower == aLower || eLower.contains(aLower)) {
          if (isScreenSizeSlot && !_looksLikeScreenSizeValue(e.value)) {
            continue;
          }
          return e;
        }
      }
    }
    return null;
  }

  static bool _looksLikeScreenSizeValue(String value) {
    final v = value.toLowerCase().trim();
    if (v.isEmpty) return false;
    if (RegExp(
      r'(cm²|cm2|m²|m2|piksel|pixel|px|mp\b|mah|hz|nit|ppi|cd/m|display\s*port|usb|thunderbolt|%|x\s*\d)',
      caseSensitive: false,
    ).hasMatch(v)) {
      return false;
    }
    final hasNumber = RegExp(r'\d').hasMatch(v);
    if (!hasNumber) return false;
    final m = RegExp(r'(\d+(?:[.,]\d+)?)').firstMatch(v);
    final number = m == null
        ? null
        : double.tryParse(m.group(1)!.replaceAll(',', '.'));
    if (number == null || number <= 0) return false;
    if (v.contains('inch') ||
        v.contains('inç') ||
        v.contains('"') ||
        RegExp(r'\d+([.,]\d+)?\s*(in|″)').hasMatch(v)) {
      return number >= 1.0 && number <= 120.0;
    }
    if (v.contains('cm')) {
      final inches = number / 2.54;
      return inches >= 1.0 && inches <= 120.0;
    }
    return false;
  }

  /// Collect specs: up to 10 clean, category-aware entries.
  List<MapEntry<String, String>> collectKeySpecs(String locale) {
    final pool = _buildSpecPool(locale);
    if (pool.isEmpty) return [];

    final result = <MapEntry<String, String>>[];
    final used = <String>{};
    final usedConcepts = <String>{};

    void addEntry(MapEntry<String, String> entry) {
      result.add(entry);
      used.add(entry.key);
      usedConcepts.add(_conceptForKey(entry.key));
    }

    final cat = _resolveCategory();
    final prioritySlots = _categoryKeys[cat];

    if (prioritySlots != null) {
      for (final slotAliases in prioritySlots) {
        final found = _findSpec(pool, slotAliases, used, usedConcepts);
        if (found != null) {
          addEntry(found);
        }
        if (result.length >= 10) break;
      }
    }

    if (result.length < 10) {
      for (final e in pool.entries) {
        if (used.contains(e.key)) continue;
        final concept = _conceptForKey(e.key);
        if (usedConcepts.contains(concept)) continue;
        if (concept == 'display_size' && !_looksLikeScreenSizeValue(e.value)) {
          continue;
        }
        addEntry(e);
        if (result.length >= 10) break;
      }
    }

    if (result.length < 10) {
      for (final e in pool.entries) {
        if (used.contains(e.key)) continue;
        if (_conceptForKey(e.key) == 'display_size' &&
            !_looksLikeScreenSizeValue(e.value)) {
          continue;
        }
        addEntry(e);
        if (result.length >= 10) break;
      }
    }

    return result.take(10).toList(growable: false);
  }

  /// Karşılaştırma için: tüm ürünlerin "Ana Özellikler" concept'lerini HİZALAR.
  /// Dönüş: her satır (key = ikon/etiket için örnek anahtar, values = her
  /// ürünün o concept'teki değeri; eksikse "—"). Concept sırası ürünlerin
  /// birleşimi (ilk görülme). Böylece compare'de "Ekran Boyutu" karşısında yine
  /// "Ekran Boyutu" gelir — aynı SharedKeySpecsGrid kaynağı/UI.
  static List<({String key, List<String> values})> comparisonRows(
    List<ProductEntity> products,
    String locale,
  ) {
    if (products.isEmpty) return const [];
    final perProduct = <Map<String, MapEntry<String, String>>>[];
    for (final p in products) {
      final specs = SharedKeySpecsGrid(product: p).collectKeySpecs(locale);
      final map = <String, MapEntry<String, String>>{};
      for (final e in specs) {
        map.putIfAbsent(_conceptForKey(e.key), () => e);
      }
      perProduct.add(map);
    }
    final order = <String>[];
    final seen = <String>{};
    final labelForConcept = <String, String>{};
    for (final map in perProduct) {
      for (final entry in map.entries) {
        if (seen.add(entry.key)) {
          order.add(entry.key);
          labelForConcept[entry.key] = entry.value.key;
        }
      }
    }
    return [
      for (final concept in order)
        (
          key: labelForConcept[concept]!,
          values: [for (final map in perProduct) map[concept]?.value ?? '—'],
        ),
    ];
  }

  static void _showSpecDetail(BuildContext context, String key, String value) {
    final theme = Theme.of(context);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => Container(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: theme.dividerColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Icon(
                  iconForSpec(key),
                  size: 22,
                  color: theme.colorScheme.primary,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    key,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: theme.colorScheme.onSurface.withValues(alpha: 0.6),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              value,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: theme.colorScheme.onSurface,
              ),
            ),
          ],
        ),
      ),
    );
  }

  static Widget buildValue(BuildContext context, String value) {
    // Value is already localized by `localizedSpecSections`; render verbatim
    // (no in-app re-translation) — only map booleans to a check/cross icon.
    final displayValue = value.trim();
    final v = displayValue.toLowerCase();
    final theme = Theme.of(context);
    if (v == 'true' || v == 'yes' || v == 'var' || v == 'evet' || v == '✓') {
      return Icon(
        Icons.check_circle_rounded,
        color: theme.colorScheme.primary,
        size: 20,
      );
    }
    if (v == 'false' || v == 'no' || v == 'yok' || v == 'hayır' || v == '✗') {
      return Icon(
        Icons.cancel_rounded,
        color: theme.colorScheme.error,
        size: 20,
      );
    }
    final fontSize = displayValue.length > 16 ? 11.0 : 13.0;
    return Text(
      displayValue,
      style: GoogleFonts.plusJakartaSans(
        fontSize: fontSize,
        fontWeight: FontWeight.w700,
        color: theme.colorScheme.onSurface,
      ),
      textAlign: TextAlign.center,
      maxLines: 2,
      overflow: TextOverflow.ellipsis,
    );
  }

  @override
  Widget build(BuildContext context) {
    final lc = Localizations.localeOf(context).languageCode.toLowerCase();
    final specs = collectKeySpecs(lc);
    if (specs.isEmpty) return const SizedBox.shrink();

    final theme = Theme.of(context);
    const columns = 2;
    final rows = (specs.length / columns).ceil();
    final title = lc == 'tr' ? 'Ana Özellikler' : 'Key Specs';

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: theme.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                Icons.auto_awesome_rounded,
                size: 16,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(width: 6),
              Text(
                title,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: theme.colorScheme.onSurface,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          for (int row = 0; row < rows; row++) ...[
            if (row > 0) const SizedBox(height: 8),
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (int col = 0; col < columns; col++) ...[
                    if (col > 0) const SizedBox(width: 8),
                    Expanded(
                      child: () {
                        final idx = row * columns + col;
                        if (idx >= specs.length) return const SizedBox.shrink();
                        final entry = specs[idx];
                        return GestureDetector(
                          onTap: () =>
                              _showSpecDetail(context, entry.key, entry.value),
                          child: Container(
                            constraints: const BoxConstraints(
                              minHeight: 80,
                              maxHeight: 100,
                            ),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 8,
                            ),
                            decoration: BoxDecoration(
                              color: theme.colorScheme.surface,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: theme.dividerColor.withValues(
                                  alpha: 0.5,
                                ),
                              ),
                            ),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  iconForSpec(entry.key),
                                  size: 18,
                                  color: theme.colorScheme.primary.withValues(
                                    alpha: 0.7,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Flexible(
                                  child: buildValue(context, entry.value),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  _localizedSpecKey(context, entry.key),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w500,
                                    color: theme.colorScheme.onSurface
                                        .withValues(alpha: 0.5),
                                  ),
                                  textAlign: TextAlign.center,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                        );
                      }(),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  static String _localizedSpecKey(BuildContext context, String rawKey) {
    // Label is already localized by `localizedSpecSections` — render verbatim.
    return rawKey;
  }
}
