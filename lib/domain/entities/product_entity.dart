/// Qor AI - Product Entity (Domain Layer - Pure Dart)
/// Blueprint Section 4.2
library;

import 'package:equatable/equatable.dart';

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
  });

  /// Convenience getter - screens use imageUrl
  String? get imageUrl {
    final cleaned = _cleanProductImage(imageURL);
    return cleaned.isEmpty ? null : cleaned;
  }

  /// All images including primary - for gallery display
  /// Filters out Epey ad banners (`/reklam/`) and upgrades low-res `m_`
  /// thumbnails to the full-resolution variant so the hero is crisp.
  List<String> get allImages {
    final source = images.isNotEmpty
        ? images
        : (imageURL.isNotEmpty ? [imageURL] : const <String>[]);
    final seen = <String>{};
    final out = <String>[];
    for (final raw in source) {
      final cleaned = _cleanProductImage(raw);
      if (cleaned.isEmpty) continue;
      if (!seen.add(cleaned.toLowerCase())) continue;
      out.add(cleaned);
    }
    return out;
  }

  /// Convenience getter - screens use categoryId
  String get categoryId => category;

  /// Drops Epey ad banners (`/reklam/`, `/banner/`) from product galleries.
  /// The scraper used to ingest these alongside real product images.
  static String _cleanProductImage(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return '';
    if (trimmed.contains('/reklam/') || trimmed.contains('/banner/')) return '';
    return trimmed;
  }

  String nameForLanguage(String languageCode) {
    final code = languageCode.toLowerCase().trim();
    final localized = nameTranslated[code];
    return localized != null && localized.trim().isNotEmpty ? localized : name;
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
