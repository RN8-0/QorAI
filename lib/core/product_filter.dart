/// Compair — Shared product filtering logic
/// Applied to home feed, search results, and category browse
library;

import 'package:compair/domain/entities/product_entity.dart';

/// Centralized product filter: year >= 2020, known brands only
class ProductFilter {
  ProductFilter._();

  static const int minYear = 2020;

  // ── Defunct / dead brands ──────────────────────────────────────────────
  static const defunctBrands = {
    'alcatel', 'micromax', 'karbonn', 'lava', 'intex', 'xolo',
    'coolpad', 'leeco', 'le eco', 'gionee', 'panasonic mobile',
    'blackberry', 'htc', 'zte', 'wiko', 'meizu', 'sharp mobile',
    'vernee', 'doogee', 'oukitel', 'umidigi', 'ulefone', 'cubot',
    'homtom', 'bluboo', 'elephone', 'leagoo', 'maze', 'nomu',
    'altus', 'vestel', 'casper', 'reeder', 'general mobile', 'turkcell',
    'grundig', 'beko', 'arçelik', 'hometech', 'vorcom', 'tcl mobile',
    'a4tech', '3plus', 'a4 tech', 'genius', 'trust', 'canyon',
    'defender', 'sven', 'oklick', 'qumo', 'dexp', 'digma',
    'prestigio', 'texet', 'explay', 'fly', 'irbis', 'ark',
    '360fly', 'jawbone', 'pebble', 'nexus', 'essential',
  };

  // ── Known / allowed brands (tier-1 + tier-2 + recognized) ─────────────
  static const allowedBrands = {
    // Tier 1
    'apple', 'samsung', 'sony', 'asus', 'msi', 'lg', 'dell', 'hp',
    'lenovo', 'acer', 'google', 'microsoft', 'nvidia', 'amd', 'intel',
    // Tier 2
    'xiaomi', 'huawei', 'oneplus', 'oppo', 'realme', 'honor', 'nothing',
    'razer', 'logitech', 'corsair', 'bose', 'sennheiser', 'jbl', 'marshall',
    'canon', 'nikon', 'fujifilm', 'dji', 'gopro', 'anker', 'garmin',
    'bang & olufsen', 'dyson', 'steelseries', 'hyperx', 'benq', 'viewsonic',
    'gigabyte', 'asrock', 'nzxt', 'cooler master', 'be quiet', 'crucial',
    'western digital', 'seagate', 'kingston', 'thermaltake', 'evga',
    'tp-link', 'netgear', 'arlo', 'ring', 'sonos', 'philips',
    'panasonic', 'tcl', 'hisense', 'vizio', 'roku', 'amazon',
    // Additional well-known
    'motorola', 'nokia', 'poco', 'iqoo', 'vivo', 'tecno', 'infinix',
    'beats', 'skullcandy', 'audio-technica', 'shure', 'beyerdynamic',
    'jabra', 'harman kardon', 'creative', 'edifier', 'soundcore',
    'toshiba', 'wd', 'sandisk', 'lexar', 'sabrent',
    'fractal design', 'lian li', 'phanteks', 'deepcool', 'arctic',
    'seasonic', 'noctua', 'ekwb', 'alphacool',
    'aoc', 'alienware', 'predator',
    'wacom', 'elgato', 'blue', 'rode', 'fifine',
    'fitbit', 'amazfit', 'suunto', 'polar', 'coros',
    'eufy', 'roborock', 'dreame', 'ecovacs', 'irobot',
    'instant pot', 'ninja', 'breville', 'kitchenaid', 'cuisinart',
    '1more', 'tozo', 'earfun', 'moondrop', 'fiio', 'hifiman',
    'cherry', 'keychron', 'ducky', 'glorious',
  };

  /// Extract exact release year from product specs
  static int? getExactReleaseYear(ProductEntity p) {
    final currentYear = DateTime.now().year;
    for (final key in const [
      'release year', 'Release Year', 'release_year',
      'Release Date', 'Piyasaya Çıkış Tarihi', 'Yıl', 'yıl', 'year',
      'Çıkış Tarihi', 'Piyasaya Sürülme', 'release date',
    ]) {
      final val = p.specs[key];
      if (val != null) {
        final digits = val.toString().replaceAll(RegExp(r'[^0-9]'), '');
        if (digits.length >= 4) {
          final year = int.tryParse(digits.substring(0, 4));
          if (year != null && year > 2000 && year <= currentYear + 1) return year;
        }
      }
    }
    for (final key in const ['Çıkış Tarihi', 'Release Date', 'Yıl', 'year']) {
      final val = p.keySpecs[key];
      if (val != null) {
        final digits = val.replaceAll(RegExp(r'[^0-9]'), '');
        if (digits.length >= 4) {
          final year = int.tryParse(digits.substring(0, 4));
          if (year != null && year > 2000 && year <= currentYear + 1) return year;
        }
      }
    }
    return null;
  }

  /// Check if a single product passes the filter
  static bool isAllowed(ProductEntity p) {
    final brand = (p.brand ?? '').toLowerCase().trim();

    // Defunct brand — always reject
    if (defunctBrands.contains(brand)) return false;

    // Year check
    final exactYear = getExactReleaseYear(p);
    if (exactYear != null) return exactYear >= minYear;

    // No exact year — use createdAt as proxy
    if (p.createdAt != null) {
      if (p.createdAt!.isBefore(DateTime(minYear, 1, 1))) return false;
      if (p.techScore >= 20) return true;
    }

    // No year, no createdAt — keep if reasonable techScore
    return p.techScore >= 30;
  }

  /// Filter a list of products
  static List<T> filter<T extends ProductEntity>(List<T> products) {
    return products.where(isAllowed).toList();
  }
}
