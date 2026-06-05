/// Qor AI - Product Entity (Domain Layer - Pure Dart)
/// Blueprint Section 4.2
library;

import 'package:equatable/equatable.dart';
import 'package:qor_ai/core/spec_corrections.dart';

class ProductEntity extends Equatable {
  final String id;
  final String name;
  final String? brand;
  final String category; // tech / subscription / gaming / travel
  final String subcategory;
  final String source;
  final String description;
  final String imageURL;
  final Map<String, double>
  prices; // Country-based prices {US: 999.0, TR: 45999.0}
  final Map<String, Map<String, String>>
  affiliateLinksByCountry; // {US: {Amazon: url, BestBuy: url}}
  final Map<String, String> affiliateLinks; // General affiliate links
  final Map<String, dynamic> specs; // Technical specifications (dynamic)
  final Map<String, dynamic>
  specSections; // Categorized specifications (as in admin panel)
  final ProductRatings ratings;
  final List<String> pros; // Pros
  final List<String> cons; // Cons
  final List<String> tags; // Searchable tags
  final double trendScore;
  final double techScore; // Technical score (0-100), normalized within category
  final Map<String, double>
  techSubscores; // Sub-category scores {processor: 85, camera: 92, ...}
  final List<String> images; // All product images (pulled from admin panel)
  final DateTime lastUpdated;
  final DateTime? createdAt; // When the product was first added to the database
  final bool isActive;
  final String
  variantGroup; // groups storage/RAM variants: "oneplus-15" for all OnePlus 15 variants
  final String
  configKey; // normalized real configuration: CPU/RAM/storage/GPU/display axes
  final Map<String, String>
  keySpecs; // Key Specs — key specs from epey.com summary grid
  final Map<String, Map<String, dynamic>> multiLangSpecs;
  final Map<String, Map<String, dynamic>> multiLangSections;
  final Map<String, String> nameTranslated;
  final String sourceLang;
  final Map<String, dynamic> sourceSpecs;
  final Map<String, dynamic> sourceSpecSections;
  final Map<String, String> sourceKeySpecs;

  const ProductEntity({
    required this.id,
    required this.name,
    this.brand,
    required this.category,
    required this.subcategory,
    this.source = '',
    this.description = '',
    this.imageURL = '',
    this.prices = const {},
    this.affiliateLinksByCountry = const {},
    this.affiliateLinks = const {},
    this.specs = const {},
    this.specSections = const {},
    this.ratings = const ProductRatings(),
    this.pros = const [],
    this.cons = const [],
    this.tags = const [],
    this.trendScore = 0.0,
    this.techScore = 0.0,
    this.techSubscores = const {},
    this.images = const [],
    required this.lastUpdated,
    this.createdAt,
    this.isActive = true,
    this.variantGroup = '',
    this.configKey = '',
    this.keySpecs = const {},
    this.multiLangSpecs = const {},
    this.multiLangSections = const {},
    this.nameTranslated = const {},
    this.sourceLang = '',
    this.sourceSpecs = const {},
    this.sourceSpecSections = const {},
    this.sourceKeySpecs = const {},
  });

  /// Convenience getter - screens use imageUrl
  String? get imageUrl {
    final cleaned = _cleanProductImage(imageURL);
    return cleaned.isEmpty ? null : cleaned;
  }

  /// All images including primary - for gallery display.
  /// The primary card image must stay first; otherwise detail pages can open on
  /// a marketing/gallery image instead of the clean product cutout.
  List<String> get allImages {
    final source = <String>[if (imageURL.isNotEmpty) imageURL, ...images];
    final seen = <String>{};
    final out = <String>[];
    for (final raw in source) {
      final cleaned = _cleanProductImage(raw);
      if (cleaned.isEmpty) continue;
      if (!seen.add(_imageIdentityKey(cleaned))) continue;
      out.add(cleaned);
    }
    return out;
  }

  /// Convenience getter - screens use categoryId
  String get categoryId => category;

  /// Cleans an Epey CDN product image URL:
  /// - drops `/reklam/` and `/banner/` ad slots (the scraper used to ingest them)
  /// - upgrades the small (`s_`) and thumb (`t_`, `c_`) size prefixes to the
  ///   big (`b_`) variant. `m_` remains a reliable stored fallback; display
  ///   widgets expand it into a sharper candidate chain when needed.
  static String _cleanProductImage(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return '';
    if (trimmed.contains('/reklam/') || trimmed.contains('/banner/')) return '';
    return trimmed.replaceFirst(
      RegExp(r'(resim\.epey\.com/[^/]+/)[stc]_'),
      r'$1b_',
    );
  }

  static String _imageIdentityKey(String raw) {
    var key = raw.trim().toLowerCase().split(RegExp(r'[?#]')).first;
    key = key.replaceFirst(RegExp(r'(resim\.epey\.com/[^/]+/)[a-z]_'), r'$1');
    key = key.replaceFirst(RegExp(r'-(?:k|s|m|t|c|l|n)\.webp$'), '.webp');
    return key;
  }

  String nameForLanguage(String languageCode) {
    final code = languageCode.toLowerCase().trim();
    final localized = nameTranslated[code];
    if (localized != null && localized.trim().isNotEmpty) return localized;
    // No baked translation for this locale: prefer English, then a best-effort
    // fix of the trailing Turkish category word ("… Oyun Kolu" → "… Gamepad").
    if (code != 'tr') {
      final en = nameTranslated['en'];
      if (en != null && en.trim().isNotEmpty) return en;
      return correctedName(name, code == 'de' ? 'de' : 'en');
    }
    return name;
  }

  Map<String, dynamic> specsForLanguage(String languageCode) {
    final code = languageCode.toLowerCase().trim();
    final localized = multiLangSpecs[code];
    if (localized != null && localized.isNotEmpty) return localized;
    return specs;
  }

  Map<String, dynamic> specSectionsForLanguage(String languageCode) {
    final code = languageCode.toLowerCase().trim();
    final localized = multiLangSections[code];
    if (localized != null && localized.isNotEmpty) return localized;
    return specSections;
  }

  /// Builds the grouped specs to render, localized for [locale], EXACTLY the
  /// way the admin product modal does it: keep the original source section
  /// grouping but swap each section name / key / value for its pre-baked
  /// translation in [multiLangSections] / [multiLangSpecs]. Language-neutral
  /// tokens (e.g. "5000 mAh", "IP68", "120 Hz") are absent from the baked map
  /// and simply pass through unchanged — same as the admin.
  ///
  /// Locale resolution: the requested locale wins if it has baked data; any
  /// other locale (Italian, French, …) falls back to English; if even English
  /// is missing we render the untouched source language.
  Map<String, Map<String, String>> localizedSpecSections(String locale) {
    final srcSections = sourceSpecSections.isNotEmpty
        ? sourceSpecSections
        : specSections;

    final srcLang = () {
      final s = sourceLang.toLowerCase().trim();
      return (s == 'tr' || s == 'de') ? s : 'tr';
    }();

    final code = locale.toLowerCase().trim();
    final String lang;
    if (multiLangSpecs[code]?.isNotEmpty ?? false) {
      lang = code;
    } else if (multiLangSpecs['en']?.isNotEmpty ?? false) {
      lang = 'en';
    } else {
      lang = srcLang;
    }

    final ml = multiLangSpecs[lang];
    final secNames = multiLangSections[lang];
    final secNameIsMap =
        secNames != null &&
        secNames.isNotEmpty &&
        secNames.values.every((v) => v is String);

    String tr(String raw) {
      final t = raw.trim();
      if (t.isEmpty || lang == srcLang || ml == null) {
        return lang == srcLang ? t : correctValueText(t);
      }
      final direct = ml[t];
      if (direct is String && direct.trim().isNotEmpty) {
        return correctValueText(direct.trim());
      }
      final lower = ml[t.toLowerCase()];
      if (lower is String && lower.trim().isNotEmpty) {
        return correctValueText(lower.trim());
      }
      return correctValueText(t);
    }

    String trValue(String raw) {
      if (lang == srcLang || ml == null) return raw;
      final lines = raw.replaceAll('\r\n', '\n').split('\n');
      if (lines.length <= 1) return tr(raw);
      return lines.map((l) => l.trim().isEmpty ? l : tr(l)).join('\n');
    }

    // Section headers: trust the curated glossary over the (often hallucinated)
    // baked translation. The source section name is clean Turkish, so we
    // re-derive the correct localized header from it.
    String sectionLabel(String turkishSource) {
      if (lang == srcLang) return turkishSource;
      final corrected = correctedSectionHeader(turkishSource, lang);
      if (corrected != null) return corrected;
      return ((secNameIsMap ? secNames[turkishSource] as String? : null) ??
          tr(turkishSource));
    }

    final out = <String, Map<String, String>>{};

    // German-sourced products may bake a FULL grouped object per language
    // (not just a {sectionName: translation} map). Render it verbatim.
    if (secNames != null && !secNameIsMap && lang != srcLang) {
      for (final entry in secNames.entries) {
        final sub = entry.value;
        if (sub is Map && sub.isNotEmpty) {
          final rows = <String, String>{};
          sub.forEach((k, v) {
            final value = correctValueText(_specSectionValueToString(v));
            if (value.trim().isNotEmpty) {
              rows[correctValueText(k.toString())] = value;
            }
          });
          if (rows.isNotEmpty) out[sectionLabel(entry.key.toString())] = rows;
        }
      }
      if (out.isNotEmpty) return out;
    }

    for (final entry in srcSections.entries) {
      final sub = entry.value;
      if (sub is! Map || sub.isEmpty) continue;
      final secLabel = sectionLabel(entry.key.toString());
      final rows = <String, String>{};
      sub.forEach((k, v) {
        final value = trValue(_specSectionValueToString(v));
        if (value.trim().isNotEmpty) rows[tr(k.toString())] = value;
      });
      if (rows.isNotEmpty) out[secLabel] = rows;
    }

    // Legacy products without source sections: fall back to a single flat
    // group built from the (translated) flat spec map.
    if (out.isEmpty) {
      final flatSrc = sourceSpecs.isNotEmpty ? sourceSpecs : specs;
      final rows = <String, String>{};
      flatSrc.forEach((k, v) {
        final value = trValue(_specSectionValueToString(v));
        if (value.trim().isNotEmpty) rows[tr(k.toString())] = value;
      });
      if (rows.isNotEmpty) {
        out[lang == 'tr' ? 'Özellikler' : 'Specifications'] = rows;
      }
    }

    return out;
  }

  static String _specSectionValueToString(dynamic value) {
    if (value is List) {
      return value
          .where((e) => e != null)
          .map((e) => e.toString().trim())
          .where((s) => s.isNotEmpty)
          .join('\n');
    }
    return value?.toString() ?? '';
  }

  /// Get price by country
  double? getPriceForCountry(String countryCode) => prices[countryCode];

  /// Get affiliate link by country
  String? getAffiliateLinkForCountry(String countryCode) =>
      affiliateLinks[countryCode];

  /// Get affiliate links by country (store-based)
  Map<String, String> getAffiliateLinksForCountry(String countryCode) =>
      affiliateLinksByCountry[countryCode] ?? {};

  ProductEntity copyWith({
    String? id,
    String? name,
    String? brand,
    String? category,
    String? subcategory,
    String? source,
    String? description,
    String? imageURL,
    Map<String, double>? prices,
    Map<String, Map<String, String>>? affiliateLinksByCountry,
    Map<String, String>? affiliateLinks,
    Map<String, dynamic>? specs,
    Map<String, dynamic>? specSections,
    Map<String, String>? keySpecs,
    String? variantGroup,
    String? configKey,
    Map<String, Map<String, dynamic>>? multiLangSpecs,
    Map<String, Map<String, dynamic>>? multiLangSections,
    Map<String, String>? nameTranslated,
    String? sourceLang,
    Map<String, dynamic>? sourceSpecs,
    Map<String, dynamic>? sourceSpecSections,
    Map<String, String>? sourceKeySpecs,
    ProductRatings? ratings,
    List<String>? pros,
    List<String>? cons,
    List<String>? tags,
    double? trendScore,
    double? techScore,
    Map<String, double>? techSubscores,
    List<String>? images,
    DateTime? lastUpdated,
    bool? isActive,
  }) {
    return ProductEntity(
      id: id ?? this.id,
      name: name ?? this.name,
      brand: brand ?? this.brand,
      category: category ?? this.category,
      subcategory: subcategory ?? this.subcategory,
      source: source ?? this.source,
      description: description ?? this.description,
      imageURL: imageURL ?? this.imageURL,
      prices: prices ?? this.prices,
      affiliateLinksByCountry:
          affiliateLinksByCountry ?? this.affiliateLinksByCountry,
      affiliateLinks: affiliateLinks ?? this.affiliateLinks,
      specs: specs ?? this.specs,
      specSections: specSections ?? this.specSections,
      keySpecs: keySpecs ?? this.keySpecs,
      variantGroup: variantGroup ?? this.variantGroup,
      configKey: configKey ?? this.configKey,
      multiLangSpecs: multiLangSpecs ?? this.multiLangSpecs,
      multiLangSections: multiLangSections ?? this.multiLangSections,
      nameTranslated: nameTranslated ?? this.nameTranslated,
      sourceLang: sourceLang ?? this.sourceLang,
      sourceSpecs: sourceSpecs ?? this.sourceSpecs,
      sourceSpecSections: sourceSpecSections ?? this.sourceSpecSections,
      sourceKeySpecs: sourceKeySpecs ?? this.sourceKeySpecs,
      ratings: ratings ?? this.ratings,
      pros: pros ?? this.pros,
      cons: cons ?? this.cons,
      tags: tags ?? this.tags,
      trendScore: trendScore ?? this.trendScore,
      techScore: techScore ?? this.techScore,
      techSubscores: techSubscores ?? this.techSubscores,
      images: images ?? this.images,
      lastUpdated: lastUpdated ?? this.lastUpdated,
      isActive: isActive ?? this.isActive,
    );
  }

  @override
  List<Object?> get props => [id, name, lastUpdated];
}

/// Product rating information - Section 4.2
class ProductRatings extends Equatable {
  final double expert; // Expert score (0-100)
  final double community; // Community score (0-100)
  final double user; // User score (0-100)
  final int count; // Total review count

  const ProductRatings({
    this.expert = 0.0,
    this.community = 0.0,
    this.user = 0.0,
    this.count = 0,
  });

  /// Convenience getters for screens
  double get expertScore => expert;
  double get communityScore => community;
  double get userScore => user;

  @override
  List<Object?> get props => [expert, community, user, count];
}
