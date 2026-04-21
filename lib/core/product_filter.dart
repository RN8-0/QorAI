/// Compair — Shared product filtering logic
/// Applied to home feed, search results, and category browse
library;

import 'package:compair/domain/entities/product_entity.dart';

/// Centralized product filter: year >= 2020, known brands only
class ProductFilter {
  ProductFilter._();

  static const int minYear = 2020;
  static const _releaseYearKeys = [
    'release year',
    'release_year',
    'release date',
    'year',
    'launch year',
    'launch date',
    'cikis yili',
    'cikis tarihi',
    'piyasaya cikis tarihi',
    'piyasaya surulme',
  ];

  // ── Defunct / dead brands (always reject) ──────────────────────────────
  static const defunctBrands = {
    'alcatel',
    'micromax',
    'karbonn',
    'lava',
    'intex',
    'xolo',
    'coolpad',
    'leeco',
    'le eco',
    'gionee',
    'panasonic mobile',
    'blackberry',
    'htc',
    'zte',
    'wiko',
    'meizu',
    'sharp mobile',
    'vernee',
    'doogee',
    'oukitel',
    'umidigi',
    'ulefone',
    'cubot',
    'homtom',
    'bluboo',
    'elephone',
    'leagoo',
    'maze',
    'nomu',
    'altus',
    'vestel',
    'casper',
    'reeder',
    'general mobile',
    'turkcell',
    'grundig',
    'beko',
    'arçelik',
    'hometech',
    'vorcom',
    'tcl mobile',
    'a4tech',
    '3plus',
    'a4 tech',
    'genius',
    'trust',
    'canyon',
    'defender',
    'sven',
    'oklick',
    'qumo',
    'dexp',
    'digma',
    'prestigio',
    'texet',
    'explay',
    'fly',
    'irbis',
    'ark',
    '360fly',
    'jawbone',
    'pebble',
    'nexus',
    'essential',
  };

  // ── Known / allowed brands (tier-1 + tier-2 + recognized) ─────────────
  static const allowedBrands = {
    // Tier 1 — global majors
    'apple', 'samsung', 'sony', 'asus', 'msi', 'lg', 'dell', 'hp',
    'lenovo', 'acer', 'google', 'microsoft', 'nvidia', 'amd', 'intel',
    // Tier 2 — phones / consumer electronics
    'xiaomi', 'huawei', 'oneplus', 'oppo', 'realme', 'honor', 'nothing',
    'motorola', 'nokia', 'poco', 'iqoo', 'vivo', 'tecno', 'infinix',
    'nubia', 'redmagic', 'red magic', 'meizu',
    // Gaming / peripherals
    'razer', 'logitech', 'corsair', 'steelseries', 'hyperx',
    'cherry', 'keychron', 'ducky', 'glorious', 'wooting',
    // Audio
    'bose', 'sennheiser', 'jbl', 'marshall', 'beats', 'skullcandy',
    'audio-technica', 'shure', 'beyerdynamic', 'jabra',
    'harman kardon', 'creative', 'edifier', 'soundcore',
    'bang & olufsen', '1more', 'tozo', 'earfun', 'moondrop', 'fiio', 'hifiman',
    'sonos',
    // Camera / imaging
    'canon', 'nikon', 'fujifilm', 'dji', 'gopro',
    // Smart home / IoT
    'anker', 'garmin', 'ring', 'arlo', 'eufy', 'tp-link', 'netgear',
    'philips', 'dyson',
    // PC components
    'gigabyte', 'asrock', 'nzxt', 'cooler master', 'be quiet', 'crucial',
    'western digital', 'seagate', 'kingston', 'thermaltake', 'evga',
    'fractal design', 'lian li', 'phanteks', 'deepcool', 'arctic',
    'seasonic', 'noctua', 'ekwb', 'alphacool',
    'pny', 'inno3d', 'zotac', 'palit', 'gainward', 'galax', 'colorful',
    'sapphire', 'xfx', 'powercolor',
    // Displays
    'benq', 'viewsonic', 'aoc', 'alienware', 'predator',
    // TVs / streaming
    'panasonic', 'tcl', 'hisense', 'vizio', 'roku', 'amazon',
    // Storage
    'toshiba', 'wd', 'sandisk', 'lexar', 'sabrent',
    // Streaming / content
    'wacom', 'elgato', 'blue', 'rode', 'fifine',
    // Wearables
    'fitbit', 'amazfit', 'suunto', 'polar', 'coros',
    // Robot vacuums
    'roborock', 'dreame', 'ecovacs', 'irobot',
    // Kitchen (kept for breadth)
    'instant pot', 'ninja', 'breville', 'kitchenaid', 'cuisinart',
    // Gaming laptops / Turkish-known
    'monster', 'xpg', 'xtrfy',
    // Consoles
    'nintendo', 'valve', 'playstation', 'xbox',
  };

  // Brand name normalization — handles Firestore typos/variants
  static final _brandNormalization = <String, String>{
    'gigaby': 'gigabyte',
    'msı': 'msi',
    'xiaom': 'xiaomi',
    'coolermaster': 'cooler master',
    'be quiet!': 'be quiet',
    'audio technica': 'audio-technica',
    'b&o': 'bang & olufsen',
    'bang&olufsen': 'bang & olufsen',
    'harman': 'harman kardon',
    'harmankardon': 'harman kardon',
    'western-digital': 'western digital',
  };

  /// Normalize brand name (handle typos, locale variants, truncations)
  static String normalizeBrand(String brand) {
    final lower = brand.toLowerCase().trim();
    return _brandNormalization[lower] ?? lower;
  }

  /// Extract exact release year from product specs, name, or tags.
  static int? getExactReleaseYear(ProductEntity p) {
    final currentYear = DateTime.now().year;
    for (final value in _candidateReleaseValues(p)) {
      final digits = value.replaceAll(RegExp(r'[^0-9]'), '');
      if (digits.length >= 4) {
        final year = int.tryParse(digits.substring(0, 4));
        if (year != null && year > 2000 && year <= currentYear + 1) {
          return year;
        }
      }
    }
    // Fallback: scan product name for (2024), "2023 Edition", etc.
    final nameMatch = RegExp(r'\b(20\d{2})\b').firstMatch(p.name);
    if (nameMatch != null) {
      final year = int.tryParse(nameMatch.group(1)!);
      if (year != null && year > 2000 && year <= currentYear + 1) {
        return year;
      }
    }
    return null;
  }

  static Iterable<String> _candidateReleaseValues(ProductEntity p) sync* {
    for (final entry in p.specs.entries) {
      if (_isReleaseYearKey(entry.key) && entry.value != null) {
        yield entry.value.toString();
      }
    }

    for (final entry in p.keySpecs.entries) {
      if (_isReleaseYearKey(entry.key) && entry.value.isNotEmpty) {
        yield entry.value;
      }
    }

    for (final section in p.specSections.values) {
      if (section is! Map) continue;
      for (final entry in section.entries) {
        if (_isReleaseYearKey(entry.key.toString()) && entry.value != null) {
          yield entry.value.toString();
        }
      }
    }
  }

  static bool _isReleaseYearKey(String key) {
    final normalized = _normalizeKey(key);
    return _releaseYearKeys.any(
      (candidate) =>
          normalized == candidate ||
          normalized.contains(candidate) ||
          candidate.contains(normalized),
    );
  }

  static String _normalizeKey(String value) {
    return value
        .toLowerCase()
        .replaceAll('ı', 'i')
        .replaceAll('ğ', 'g')
        .replaceAll('ü', 'u')
        .replaceAll('ş', 's')
        .replaceAll('ö', 'o')
        .replaceAll('ç', 'c')
        .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
  }

  /// Check if a single product passes the filter
  static bool isAllowed(ProductEntity p) {
    final rawBrand = (p.brand ?? '').toLowerCase().trim();
    if (rawBrand.isEmpty) return false; // No brand → reject
    final brand = normalizeBrand(rawBrand);

    // Defunct brand — always reject
    if (defunctBrands.contains(brand)) return false;

    // Brand whitelist check — unknown brands rejected
    if (!allowedBrands.contains(brand)) return false;

    // Exact year from specs — most reliable signal
    final exactYear = getExactReleaseYear(p);
    if (exactYear != null) return exactYear >= minYear;

    // Has createdAt/scrapedAt — if recent, accept (recently added = likely relevant)
    if (p.createdAt != null) {
      return !p.createdAt!.isBefore(DateTime(minYear, 1, 1));
    }

    // No date info at all — accept if reasonable techScore
    return p.techScore >= 30;
  }

  /// Filter a list of products
  static List<T> filter<T extends ProductEntity>(List<T> products) {
    return products.where(isAllowed).toList();
  }

  /// Relaxed check: only reject defunct brands (no year/whitelist filter)
  static bool isAllowedRelaxed(ProductEntity p) {
    final rawBrand = (p.brand ?? '').toLowerCase().trim();
    if (rawBrand.isEmpty) return false;
    final brand = normalizeBrand(rawBrand);
    return !defunctBrands.contains(brand);
  }

  /// Relaxed filter for compare search — only removes defunct brands
  static List<T> filterRelaxed<T extends ProductEntity>(List<T> products) {
    return products.where(isAllowedRelaxed).toList();
  }
}
