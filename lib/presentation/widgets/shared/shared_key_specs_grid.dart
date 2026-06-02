import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';
import 'package:qor_ai/core/category_key_specs.dart' as key_specs;
import 'package:qor_ai/services/spec_translation_service.dart';

/// Shared key specs grid widget used by both detail and compare screens.
/// Shows category-aware key specifications in a 3-column grid (6 or 9 cells).
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
    ],
    'tablets': [
      ['Screen Size', 'Display Size', 'Display Boyutu', 'Ekran Boyutu'],
      ['RAM', 'Memory (RAM)', 'RAM Kapasitesi'],
      ['Storage', 'Internal Storage', 'Dahili Depolama'],
      ['Battery', 'Battery Capacity', 'Pil'],
      ['Processor', 'Chipset', 'İşlemci', 'Processor Model'],
      ['OS', 'Operating System', 'İşletim Sistemi'],
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

  /// Build a merged pool of all available specs from keySpecs + specs + specSections.
  Map<String, String> _buildSpecPool() {
    final pool = <String, String>{};
    for (final e in product.keySpecs.entries) {
      final v = e.value.trim();
      if (v.isNotEmpty && v != '-' && v != 'N/A') pool[e.key] = v;
    }
    for (final e in product.specs.entries) {
      if (pool.containsKey(e.key)) continue;
      if (e.value != null && e.value is! Map) {
        final v = e.value.toString().trim();
        if (v.isNotEmpty && v != '-' && v != 'N/A') pool[e.key] = v;
      }
    }
    for (final section in product.specSections.entries) {
      if (section.value is Map) {
        for (final spec in (section.value as Map).entries) {
          final k = spec.key.toString();
          if (pool.containsKey(k)) continue;
          if (spec.value != null) {
            final v = spec.value.toString().trim();
            if (v.isNotEmpty && v != '-' && v != 'N/A') pool[k] = v;
          }
        }
      }
    }
    return pool;
  }

  MapEntry<String, String>? _findSpec(
    Map<String, String> pool,
    List<String> aliases,
    Set<String> used,
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
    final hasNumber = RegExp(r'\d').hasMatch(v);
    if (!hasNumber) return false;
    return v.contains('inch') ||
        v.contains('inç') ||
        v.contains('"') ||
        v.contains('cm') ||
        RegExp(r'\d+([.,]\d+)?\s*(in|″)').hasMatch(v);
  }

  /// Collect specs: always returns a multiple of 3 (6 or 9).
  List<MapEntry<String, String>> collectKeySpecs() {
    final pool = _buildSpecPool();
    if (pool.isEmpty) return [];

    final result = <MapEntry<String, String>>[];
    final used = <String>{};

    final cat = _resolveCategory();
    final prioritySlots = _categoryKeys[cat];

    if (prioritySlots != null) {
      for (final slotAliases in prioritySlots) {
        final found = _findSpec(pool, slotAliases, used);
        if (found != null) {
          result.add(found);
          used.add(found.key);
        }
        if (result.length >= 9) break;
      }
    }

    if (result.length < 6) {
      for (final e in pool.entries) {
        if (used.contains(e.key)) continue;
        result.add(e);
        used.add(e.key);
        if (result.length >= 6) break;
      }
    }

    if (result.length > 6 && result.length < 9) {
      for (final e in pool.entries) {
        if (used.contains(e.key)) continue;
        result.add(e);
        used.add(e.key);
        if (result.length >= 9) break;
      }
    }

    final target = result.length >= 7 ? 9 : (result.length >= 4 ? 6 : 3);
    if (result.length > target) {
      return result.sublist(0, target);
    }
    final remainder = result.length % 3;
    if (remainder != 0 && result.length > 3) {
      return result.sublist(0, result.length - remainder);
    }
    return result;
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
    final locale = Localizations.localeOf(context).languageCode.toLowerCase();
    final displayValue = SpecTranslationService.instance
        .translateValueForLocale(value, locale)
        .trim();
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
    final specs = collectKeySpecs();
    if (specs.isEmpty) return const SizedBox.shrink();

    final theme = Theme.of(context);
    final rows = (specs.length / 3).ceil();
    final lc = Localizations.localeOf(context).languageCode.toLowerCase();
    final title = lc == 'tr'
        ? 'Ana Özellikler'
        : lc == 'de'
        ? 'Wichtige Daten'
        : 'Key Specs';

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
                  for (int col = 0; col < 3; col++) ...[
                    if (col > 0) const SizedBox(width: 8),
                    Expanded(
                      child: () {
                        final idx = row * 3 + col;
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
    final locale = Localizations.localeOf(context).languageCode.toLowerCase();
    final translated = SpecTranslationService.instance
        .translateLabelForLocale(rawKey, locale)
        .trim();
    if (translated.isNotEmpty &&
        translated.toLowerCase() != rawKey.toLowerCase()) {
      return translated;
    }
    return rawKey;
  }
}
