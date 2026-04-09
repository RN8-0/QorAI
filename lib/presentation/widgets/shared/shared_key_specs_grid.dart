import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:compair/domain/entities/product_entity.dart';

/// Shared key specs grid widget used by both detail and compare screens.
/// Shows category-aware key specifications in a 3-column grid (6 or 9 cells).
class SharedKeySpecsGrid extends StatelessWidget {
  final ProductEntity product;
  const SharedKeySpecsGrid({super.key, required this.product});

  // Category-based key spec names — priority ordered, at least 9 per category.
  // Each entry is a list of ALIASES that match the same concept; first match wins.
  static const _categoryKeys = <String, List<List<String>>>{
    'smartphones': [
      ['Screen Size', 'Display Size', 'Ekran Boyutu'],
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
      ['Screen Size', 'Display Size', 'Ekran Boyutu'],
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
      ['Screen Size', 'Display Size', 'Ekran Boyutu'],
      ['RAM', 'Memory (RAM)', 'RAM Kapasitesi'],
      ['Storage', 'SSD', 'Internal Storage', 'Dahili Depolama', 'Hard Disk (SSD)'],
      ['Processor', 'CPU', 'İşlemci', 'Processor Model'],
      ['GPU', 'Graphics Card', 'Ekran Kartı', 'GPU Model', 'Video Card'],
      ['Battery', 'Battery Life', 'Pil'],
      ['OS', 'Operating System', 'İşletim Sistemi'],
      ['Weight', 'Ağırlık'],
      ['Display Technology', 'Panel', 'Refresh Rate', 'Yenileme Hızı'],
    ],
    'monitors': [
      ['Screen Size', 'Display Size', 'Ekran Boyutu'],
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
      ['Screen Size', 'Display Size', 'Ekran Boyutu'],
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
      ['Screen Size', 'Display Size', 'Ekran Boyutu'],
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

  static const _categoryAliases = <String, String>{
    'phone': 'smartphones', 'telefon': 'smartphones', 'akıllı telefon': 'smartphones',
    'smartphone': 'smartphones', 'cep telefonu': 'smartphones',
    'tablet': 'tablets',
    'laptop': 'laptops', 'dizüstü': 'laptops', 'notebook': 'laptops', 'dizüstü bilgisayar': 'laptops',
    'desktop': 'laptops', 'masaüstü': 'laptops',
    'monitor': 'monitors', 'monitör': 'monitors', 'ekran': 'monitors',
    'tv': 'tvs', 'televizyon': 'tvs', 'television': 'tvs',
    'headphone': 'headphones', 'kulaklık': 'headphones', 'earphone': 'headphones', 'earbuds': 'headphones',
    'keyboard': 'keyboards', 'klavye': 'keyboards',
    'mouse': 'mice', 'fare': 'mice',
    'camera': 'cameras', 'fotoğraf makinesi': 'cameras', 'kamera': 'cameras',
    'printer': 'printers', 'yazıcı': 'printers',
    'router': 'routers', 'modem': 'routers',
    'ssd': 'ssds',
    'hdd': 'hdds', 'hard disk': 'hdds',
    'ram': 'ram', 'memory': 'ram', 'bellek': 'ram',
    'gpu': 'gpus', 'ekran kartı': 'gpus', 'graphics card': 'gpus', 'video card': 'gpus',
    'cpu': 'cpus', 'işlemci': 'cpus', 'processor': 'cpus',
    'smartwatch': 'smartwatches', 'akıllı saat': 'smartwatches', 'watch': 'smartwatches',
    'powerbank': 'powerbanks', 'power bank': 'powerbanks', 'taşınabilir şarj': 'powerbanks',
  };

  static IconData iconForSpec(String key) {
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
    if (k.contains('noise') || k.contains('anc')) return Icons.noise_aware_rounded;
    if (k.contains('heart') || k.contains('kalp')) return Icons.favorite_rounded;
    if (k.contains('gps')) return Icons.location_on_rounded;
    if (k.contains('water') || k.contains('su') || k.contains('ip6') || k.contains('atm')) return Icons.water_drop_rounded;
    if (k.contains('sensor') || k.contains('sensör')) return Icons.sensors_rounded;
    if (k.contains('dpi')) return Icons.mouse_rounded;
    if (k.contains('switch') || k.contains('anahtar')) return Icons.keyboard_rounded;
    if (k.contains('port') || k.contains('hdmi') || k.contains('usb')) return Icons.settings_input_hdmi_rounded;
    if (k.contains('speed') || k.contains('hız') || k.contains('clock') || k.contains('frequency') || k.contains('frekans')) return Icons.speed_rounded;
    if (k.contains('type') || k.contains('tip')) return Icons.category_rounded;
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
    return Icons.info_outline_rounded;
  }

  String _resolveCategory() {
    final cat = product.category.toLowerCase().trim();
    if (_categoryKeys.containsKey(cat)) return cat;
    for (final alias in _categoryAliases.entries) {
      if (cat.contains(alias.key) || alias.key.contains(cat)) return alias.value;
    }
    return '';
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

  MapEntry<String, String>? _findSpec(Map<String, String> pool, List<String> aliases, Set<String> used) {
    for (final alias in aliases) {
      final aLower = alias.toLowerCase();
      for (final e in pool.entries) {
        if (used.contains(e.key)) continue;
        final eLower = e.key.toLowerCase();
        if (eLower == aLower || eLower.contains(aLower) || aLower.contains(eLower)) {
          return e;
        }
      }
    }
    return null;
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

  static Widget buildValue(BuildContext context, String value) {
    final v = value.toLowerCase().trim();
    final theme = Theme.of(context);
    if (v == 'true' || v == 'yes' || v == 'var' || v == 'evet' || v == '✓') {
      return Icon(Icons.check_circle_rounded, color: theme.colorScheme.primary, size: 20);
    }
    if (v == 'false' || v == 'no' || v == 'yok' || v == 'hayır' || v == '✗') {
      return Icon(Icons.cancel_rounded, color: theme.colorScheme.error, size: 20);
    }
    final fontSize = value.length > 16 ? 11.0 : 13.0;
    return Text(
      value,
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
              Icon(Icons.auto_awesome_rounded, size: 16, color: theme.colorScheme.primary),
              const SizedBox(width: 6),
              Text(
                'Key Specs',
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
                        return Container(
                          constraints: const BoxConstraints(minHeight: 80, maxHeight: 100),
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.surface,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: theme.dividerColor.withValues(alpha: 0.5)),
                          ),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                iconForSpec(entry.key),
                                size: 18,
                                color: theme.colorScheme.primary.withValues(alpha: 0.7),
                              ),
                              const SizedBox(height: 4),
                              Flexible(child: buildValue(context, entry.value)),
                              const SizedBox(height: 2),
                              Text(
                                entry.key,
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w500,
                                  color: theme.colorScheme.onSurface.withValues(alpha: 0.5),
                                ),
                                textAlign: TextAlign.center,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
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
}
