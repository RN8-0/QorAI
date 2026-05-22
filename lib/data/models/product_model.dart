/// Qor AI - Product Model (Data Layer - Firestore)
/// Blueprint Section 4.2
library;

import 'package:pocketbase/pocketbase.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';

class ProductModel extends ProductEntity {
  const ProductModel({
    required super.id,
    required super.name,
    super.brand,
    required super.category,
    required super.subcategory,
    super.source,
    super.description,
    super.imageURL,
    super.prices,
    super.affiliateLinks,
    super.affiliateLinksByCountry,
    super.specs,
    super.specSections,
    super.keySpecs,
    super.ratings,
    super.pros,
    super.cons,
    super.tags,
    super.trendScore,
    super.techScore,
    super.techSubscores,
    super.images,
    required super.lastUpdated,
    super.createdAt,
    super.isActive,
    super.variantGroup,
    super.configKey,
    super.multiLangSpecs,
    super.multiLangSections,
    super.nameTranslated,
  });

  /// Read from PocketBase
  factory ProductModel.fromPb(RecordModel record) {
    final data = _deepCastMap(record.data);
    final id = record.id;

    // Handle prices from legacy 'prices' map or new 'priceRange'
    final prices = <String, double>{};
    if (data.containsKey('prices') && data['prices'] is Map) {
      _deepCastMap(data['prices']).forEach((k, v) {
        if (v is num) prices[k] = v.toDouble();
      });
    }

    if (prices.isEmpty &&
        data.containsKey('priceRange') &&
        data['priceRange'] is Map) {
      final pr = _deepCastMap(data['priceRange']);
      final current = (pr['current'] as num?)?.toDouble();
      final currency = pr['currency'] as String?;

      if (current != null) {
        final country = _countryForCurrency(currency);
        if (country != null) {
          prices[country] = current;
        }
      }
    }

    if (prices.isEmpty) {
      final lowestPrice = (data['lowestPrice'] as num?)?.toDouble();
      final currency = data['lowestPriceCurrency'] as String?;
      final country = _countryForCurrency(currency);
      if (lowestPrice != null && lowestPrice > 0 && country != null) {
        prices[country] = lowestPrice;
      }
      final lowestUsd = (data['lowestPriceUSD'] as num?)?.toDouble();
      if (lowestUsd != null && lowestUsd > 0) {
        prices.putIfAbsent('US', () => lowestUsd);
      }
    }

    // Handle affiliate links
    final affiliateLinks = <String, String>{};
    final affiliateLinksByCountry = <String, Map<String, String>>{};

    if (data.containsKey('affiliateLinks') && data['affiliateLinks'] is Map) {
      final al = _deepCastMap(data['affiliateLinks']);

      // Legacy format or direct map
      al.forEach((k, v) {
        if (v is String && v.isNotEmpty) {
          affiliateLinks[k] = v;

          // Parse known country codes from keys like 'amazon_us'
          if (k.contains('_')) {
            final parts = k.split('_');
            if (parts.length == 2) {
              final store = parts[0]; // amazon
              final country = parts[1].toUpperCase(); // US

              if (!affiliateLinksByCountry.containsKey(country)) {
                affiliateLinksByCountry[country] = {};
              }
              // Capitalize store name
              final storeName = store[0].toUpperCase() + store.substring(1);
              affiliateLinksByCountry[country]![storeName] = v;
            }
          }
        }
      });
    }

    if (data.containsKey('affiliateLinksByCountry') &&
        data['affiliateLinksByCountry'] is Map) {
      final byCountry = _deepCastMap(data['affiliateLinksByCountry']);
      byCountry.forEach((countryKey, storesRaw) {
        if (storesRaw is! Map) return;
        final country = countryKey.toString().toUpperCase();
        final stores = <String, String>{};
        storesRaw.forEach((storeKey, urlRaw) {
          final url = urlRaw?.toString() ?? '';
          if (url.isNotEmpty) stores[storeKey.toString()] = url;
        });
        if (stores.isNotEmpty) affiliateLinksByCountry[country] = stores;
      });
    }

    final lowestOfferUrl = (data['lowestOfferUrl'] ?? '').toString();
    if (lowestOfferUrl.isNotEmpty) {
      final store = (data['lowestOfferStore'] ?? 'Best Offer').toString();
      affiliateLinks.putIfAbsent('default', () => lowestOfferUrl);
      final country = _countryForCurrency(
        data['lowestPriceCurrency'] as String?,
      );
      if (country != null) {
        affiliateLinksByCountry.putIfAbsent(country, () => <String, String>{});
        affiliateLinksByCountry[country]!.putIfAbsent(
          store,
          () => lowestOfferUrl,
        );
      }
    }

    const legacyScoreKey =
        'comp'
        'airScore';
    const qorScoreKey = 'qorScore';

    // Ratings
    final ratingsData = _deepCastMap(data['ratings']);
    // Support both the current score field and the legacy brand-specific key.
    double expertScore =
        (ratingsData['expert'] as num?)?.toDouble() ??
        (ratingsData[qorScoreKey] as num?)?.toDouble() ??
        (ratingsData[legacyScoreKey] as num?)?.toDouble() ??
        0.0;

    // Check if we have community (0-5) or legacy (0-100)
    // If it's <= 5, assume 5-star scale and convert to 100
    double communityVal = (ratingsData['community'] as num?)?.toDouble() ?? 0.0;
    if (communityVal > 0 && communityVal <= 5) {
      communityVal *= 20; // 4.5 -> 90
    }

    final ratings = ProductRatings(
      expert: expertScore,
      community: communityVal,
      count: (ratingsData['count'] as num?)?.toInt() ?? 0,
    );

    return ProductModel(
      id: id,
      name: data['name'] ?? '',
      brand: data['brand'] ?? '',
      category: data['category'] ?? '',
      subcategory: data['subcategory'] ?? '',
      source: data['source'] ?? '',
      description: data['description'] ?? '',
      imageURL: data['imageURL'] ?? data['imageUrl'] ?? '',
      prices: prices,
      affiliateLinks: affiliateLinks,
      affiliateLinksByCountry: affiliateLinksByCountry,
      specs: _deepCastMap(data['specs']),
      specSections: _deepCastMap(data['specSections']),
      keySpecs: _castStringMap(data['keySpecs']),
      ratings: ratings,
      pros: List<String>.from(data['pros'] ?? []),
      cons: List<String>.from(data['cons'] ?? []),
      tags: List<String>.from(data['tags'] ?? []),
      trendScore: (data['trendScore'] as num?)?.toDouble() ?? 0.0,
      techScore: (data['techScore'] as num?)?.toDouble() ?? 0.0,
      techSubscores: _parseTechSubscores(data['techSubscores']),
      images: List<String>.from(data['images'] ?? []),
      lastUpdated: _parseOptionalDate(data['lastUpdated']) ?? DateTime.now(),
      createdAt:
          _parseOptionalDate(data['createdAt']) ??
          _parseOptionalDate(data['scrapedAt']),
      isActive: data['isActive'] ?? true,
      variantGroup: data['variantGroup'] as String? ?? '',
      configKey: data['configKey'] as String? ?? '',
      multiLangSpecs: _castNestedDynamicMap(data['multiLangSpecs']),
      multiLangSections: _castNestedDynamicMap(data['multiLangSections']),
      nameTranslated: _castStringMap(data['nameTranslated']),
    );
  }

  /// Safely parse a date field that could be an ISO String or null
  static DateTime? _parseOptionalDate(dynamic value) {
    if (value == null) return null;
    if (value is String) return DateTime.tryParse(value);
    return null;
  }

  static String? _countryForCurrency(String? currency) {
    switch ((currency ?? '').toUpperCase()) {
      case 'USD':
        return 'US';
      case 'EUR':
        return 'DE';
      case 'GBP':
        return 'GB';
      case 'TRY':
        return 'TR';
      case 'INR':
        return 'IN';
      case 'JPY':
        return 'JP';
      case 'CAD':
        return 'CA';
      case 'AUD':
        return 'AU';
      default:
        return null;
    }
  }

  /// Write to Map (for PocketBase / cache)
  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'brand': brand,
      'category': category,
      'subcategory': subcategory,
      'source': source,
      'description': description,
      'imageURL': imageURL,
      'prices': prices,
      'affiliateLinks': affiliateLinks,
      'affiliateLinksByCountry': affiliateLinksByCountry,
      'specs': specs,
      'specSections': specSections,
      'keySpecs': keySpecs,
      'ratings': {
        'expert': ratings.expert,
        'community': ratings.community,
        'count': ratings.count,
      },
      'pros': pros,
      'cons': cons,
      'tags': tags,
      'trendScore': trendScore,
      'techScore': techScore,
      'techSubscores': techSubscores,
      'images': images,
      'lastUpdated': lastUpdated.toIso8601String(),
      if (createdAt != null) 'createdAt': createdAt!.toIso8601String(),
      'isActive': isActive,
      'variantGroup': variantGroup,
      'configKey': configKey,
      'multiLangSpecs': multiLangSpecs,
      'multiLangSections': multiLangSections,
      'nameTranslated': nameTranslated,
    };
  }

  /// Alias for backwards compat
  Map<String, dynamic> toFirestore() => toMap();

  /// Convert Entity to Model
  factory ProductModel.fromEntity(ProductEntity entity) {
    return ProductModel(
      id: entity.id,
      name: entity.name,
      brand: entity.brand,
      category: entity.category,
      subcategory: entity.subcategory,
      source: entity.source,
      description: entity.description,
      imageURL: entity.imageURL,
      prices: entity.prices,
      affiliateLinks: entity.affiliateLinks,
      affiliateLinksByCountry: entity.affiliateLinksByCountry,
      specs: entity.specs,
      specSections: entity.specSections,
      keySpecs: entity.keySpecs,
      ratings: entity.ratings,
      pros: entity.pros,
      cons: entity.cons,
      tags: entity.tags,
      trendScore: entity.trendScore,
      techScore: entity.techScore,
      techSubscores: entity.techSubscores,
      images: entity.images,
      lastUpdated: entity.lastUpdated,
      createdAt: entity.createdAt,
      isActive: entity.isActive,
      variantGroup: entity.variantGroup,
      configKey: entity.configKey,
      multiLangSpecs: entity.multiLangSpecs,
      multiLangSections: entity.multiLangSections,
      nameTranslated: entity.nameTranslated,
    );
  }

  /// Read from Hive cache (deserialize from Map) - Section 7.4
  factory ProductModel.fromMap(Map<String, dynamic> data) {
    final pricesData = data['prices'] as Map<String, dynamic>? ?? {};
    final prices = pricesData.map(
      (key, value) => MapEntry(key, (value as num).toDouble()),
    );
    if (prices.isEmpty) {
      final lowestPrice = (data['lowestPrice'] as num?)?.toDouble();
      final country = _countryForCurrency(
        data['lowestPriceCurrency'] as String?,
      );
      if (lowestPrice != null && lowestPrice > 0 && country != null) {
        prices[country] = lowestPrice;
      }
      final lowestUsd = (data['lowestPriceUSD'] as num?)?.toDouble();
      if (lowestUsd != null && lowestUsd > 0) {
        prices.putIfAbsent('US', () => lowestUsd);
      }
    }

    final affiliateData = data['affiliateLinks'] as Map<String, dynamic>? ?? {};
    final affiliateLinks = affiliateData.map(
      (key, value) => MapEntry(key, value.toString()),
    );
    final affiliateLinksByCountry = <String, Map<String, String>>{};
    final affiliateByCountryData =
        data['affiliateLinksByCountry'] as Map<String, dynamic>? ?? {};
    affiliateByCountryData.forEach((countryKey, storesRaw) {
      if (storesRaw is! Map) return;
      affiliateLinksByCountry[countryKey.toUpperCase()] = storesRaw.map(
        (key, value) => MapEntry(key.toString(), value.toString()),
      );
    });
    final lowestOfferUrl = (data['lowestOfferUrl'] ?? '').toString();
    if (lowestOfferUrl.isNotEmpty) {
      final store = (data['lowestOfferStore'] ?? 'Best Offer').toString();
      affiliateLinks.putIfAbsent('default', () => lowestOfferUrl);
      final country = _countryForCurrency(
        data['lowestPriceCurrency'] as String?,
      );
      if (country != null) {
        affiliateLinksByCountry.putIfAbsent(country, () => <String, String>{});
        affiliateLinksByCountry[country]!.putIfAbsent(
          store,
          () => lowestOfferUrl,
        );
      }
    }

    final ratingsData = _deepCastMap(data['ratings']);
    final ratings = ProductRatings(
      expert:
          (ratingsData['expert'] as num?)?.toDouble() ??
          (ratingsData['qorScore'] as num?)?.toDouble() ??
          (ratingsData['comp'
                      'airScore']
                  as num?)
              ?.toDouble() ??
          0.0,
      community: (ratingsData['community'] as num?)?.toDouble() ?? 0.0,
      count: (ratingsData['count'] as num?)?.toInt() ?? 0,
    );

    return ProductModel(
      id: data['id'] ?? '',
      name: data['name'] ?? '',
      brand: data['brand'] ?? '',
      category: data['category'] ?? '',
      subcategory: data['subcategory'] ?? '',
      source: data['source'] ?? '',
      description: data['description'] ?? '',
      imageURL: data['imageURL'] ?? data['imageUrl'] ?? '',
      prices: prices,
      affiliateLinks: affiliateLinks,
      affiliateLinksByCountry: affiliateLinksByCountry,
      specs: _deepCastMap(data['specs']),
      specSections: _deepCastMap(data['specSections']),
      keySpecs: _castStringMap(data['keySpecs']),
      variantGroup: data['variantGroup'] as String? ?? '',
      configKey: data['configKey'] as String? ?? '',
      ratings: ratings,
      pros: List<String>.from(data['pros'] ?? []),
      cons: List<String>.from(data['cons'] ?? []),
      tags: List<String>.from(data['tags'] ?? []),
      trendScore: (data['trendScore'] as num?)?.toDouble() ?? 0.0,
      techScore: (data['techScore'] as num?)?.toDouble() ?? 0.0,
      techSubscores: _parseTechSubscores(data['techSubscores']),
      images: List<String>.from(data['images'] ?? []),
      lastUpdated: data['lastUpdated'] is String
          ? DateTime.tryParse(data['lastUpdated']) ?? DateTime.now()
          : DateTime.now(),
      createdAt: data['createdAt'] is String
          ? DateTime.tryParse(data['createdAt'])
          : null,
      isActive: data['isActive'] ?? true,
      multiLangSpecs: _castNestedDynamicMap(data['multiLangSpecs']),
      multiLangSections: _castNestedDynamicMap(data['multiLangSections']),
      nameTranslated: _castStringMap(data['nameTranslated']),
    );
  }

  static Map<String, double> _parseTechSubscores(dynamic raw) {
    if (raw == null) return {};
    if (raw is! Map) return {};
    return Map<String, double>.fromEntries(
      raw.entries.map(
        (e) => MapEntry(
          e.key.toString(),
          (e.value is num) ? (e.value as num).toDouble() : 0.0,
        ),
      ),
    );
  }
}

/// Recursively converts Firestore/Map data to `Map<String, dynamic>`.
/// Firestore can return inner maps as `Map<String, Object?>` which breaks
/// the `value is Map<String, dynamic>` check in spec rendering.
Map<String, dynamic> _deepCastMap(dynamic raw) {
  if (raw == null) return {};
  if (raw is! Map) return {};
  return Map<String, dynamic>.fromEntries(
    raw.entries.map((e) {
      final key = e.key.toString();
      final val = e.value;
      if (val is Map) return MapEntry(key, _deepCastMap(val));
      return MapEntry(key, val);
    }),
  );
}

Map<String, Map<String, dynamic>> _castNestedDynamicMap(dynamic raw) {
  if (raw == null) return {};
  if (raw is! Map) return {};
  return Map<String, Map<String, dynamic>>.fromEntries(
    raw.entries
        .where((e) => e.value is Map)
        .map(
          (e) =>
              MapEntry(e.key.toString().toLowerCase(), _deepCastMap(e.value)),
        ),
  );
}

/// Converts a Firestore/Map to `Map<String, String>` (for keySpecs).
Map<String, String> _castStringMap(dynamic raw) {
  if (raw == null) return {};
  if (raw is! Map) return {};
  return Map<String, String>.fromEntries(
    raw.entries
        .where((e) => e.value != null)
        .map((e) => MapEntry(e.key.toString(), e.value.toString())),
  );
}
