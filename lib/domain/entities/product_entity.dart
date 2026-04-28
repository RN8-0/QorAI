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
  final String description;
  final String imageURL;
  final Map<String, double> prices; // Country-based prices {US: 999.0, TR: 45999.0}
  final Map<String, Map<String, String>> affiliateLinksByCountry; // {US: {Amazon: url, BestBuy: url}}
  final Map<String, String> affiliateLinks; // General affiliate links
  final Map<String, dynamic> specs; // Technical specifications (dynamic)
  final Map<String, dynamic> specSections; // Categorized specifications (as in admin panel)
  final ProductRatings ratings;
  final List<String> pros; // Pros
  final List<String> cons; // Cons
  final List<String> tags; // Searchable tags
  final double trendScore;
  final double techScore; // Technical score (0-100), normalized within category
  final Map<String, double> techSubscores; // Sub-category scores {processor: 85, camera: 92, ...}
  final List<String> images; // All product images (pulled from admin panel)
  final DateTime lastUpdated;
  final DateTime? createdAt; // When the product was first added to the database
  final bool isActive;
  final String variantGroup; // groups storage/RAM variants: "oneplus-15" for all OnePlus 15 variants
  final Map<String, String> keySpecs; // Key Specs — key specs from epey.com summary grid

  const ProductEntity({
    required this.id,
    required this.name,
    this.brand,
    required this.category,
    required this.subcategory,
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
    this.keySpecs = const {},
  });

  /// Convenience getter - screens use imageUrl
  String? get imageUrl => imageURL.isEmpty ? null : imageURL;

  /// All images including primary - for gallery display
  List<String> get allImages {
    if (images.isNotEmpty) return images;
    if (imageURL.isNotEmpty) return [imageURL];
    return [];
  }

  /// Convenience getter - screens use categoryId
  String get categoryId => category;

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
    String? description,
    String? imageURL,
    Map<String, double>? prices,
    Map<String, Map<String, String>>? affiliateLinksByCountry,
    Map<String, String>? affiliateLinks,
    Map<String, dynamic>? specs,
    Map<String, dynamic>? specSections,
    Map<String, String>? keySpecs,
    String? variantGroup,
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
      description: description ?? this.description,
      imageURL: imageURL ?? this.imageURL,
      prices: prices ?? this.prices,
      affiliateLinksByCountry: affiliateLinksByCountry ?? this.affiliateLinksByCountry,
      affiliateLinks: affiliateLinks ?? this.affiliateLinks,
      specs: specs ?? this.specs,
      specSections: specSections ?? this.specSections,
      keySpecs: keySpecs ?? this.keySpecs,
      variantGroup: variantGroup ?? this.variantGroup,
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
