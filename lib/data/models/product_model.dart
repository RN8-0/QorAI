/// Compair - Product Model (Data Layer - Firestore)
/// Blueprint Section 4.2
library;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:compair/domain/entities/product_entity.dart';

class ProductModel extends ProductEntity {
  const ProductModel({
    required super.id,
    required super.name,
    super.brand,
    required super.category,
    required super.subcategory,
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
  });

  /// Read from Firestore
  factory ProductModel.fromFirestore(DocumentSnapshot doc) {
    final raw = doc.data();
    if (raw == null) throw StateError('Product document is empty: ${doc.id}');
    final data = (raw is Map) ? _deepCastMap(raw) : <String, dynamic>{};

    // Handle prices from legacy 'prices' map or new 'priceRange'
    final prices = <String, double>{};
    if (data.containsKey('prices') && data['prices'] is Map) {
      _deepCastMap(data['prices']).forEach((k, v) {
        if (v is num) prices[k] = v.toDouble();
      });
    } else if (data.containsKey('priceRange') && data['priceRange'] is Map) {
      final pr = _deepCastMap(data['priceRange']);
      final current = (pr['current'] as num?)?.toDouble();
      final currency = pr['currency'] as String?;

      if (current != null) {
        if (currency == 'USD') prices['US'] = current;
        else if (currency == 'EUR') prices['DE'] = current;
        else if (currency == 'GBP') prices['UK'] = current;
        else if (currency == 'TRY') prices['TR'] = current;
        else if (currency == 'INR') prices['IN'] = current;
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

    // Ratings
    final ratingsData = _deepCastMap(data['ratings']);
    // Check if we have compairScore (0-100) or legacy expert (0-100)
    double expertScore = (ratingsData['expert'] as num?)?.toDouble() ?? 
                         (ratingsData['compairScore'] as num?)?.toDouble() ?? 0.0;
    
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
      id: doc.id,
      name: data['name'] ?? '',
      brand: data['brand'] ?? '',
      category: data['category'] ?? '',
      subcategory: data['subcategory'] ?? '',
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
      lastUpdated:
          _parseOptionalDate(data['lastUpdated']) ?? DateTime.now(),
      createdAt: _parseOptionalDate(data['createdAt']) ??
                 _parseOptionalDate(data['scrapedAt']),
      isActive: data['isActive'] ?? true,
      variantGroup: data['variantGroup'] as String? ?? '',
    );
  }

  /// Safely parse a Firestore field that could be Timestamp, String, or null
  static DateTime? _parseOptionalDate(dynamic value) {
    if (value == null) return null;
    if (value is Timestamp) return value.toDate();
    if (value is String) return DateTime.tryParse(value);
    return null;
  }

  /// Write to Firestore
  Map<String, dynamic> toFirestore() {
    return {
      'id': id,
      'name': name,
      'brand': brand,
      'category': category,
      'subcategory': subcategory,
      'description': description,
      'imageURL': imageURL,
      'prices': prices,
      'affiliateLinks': affiliateLinks,
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
      'lastUpdated': Timestamp.fromDate(lastUpdated),
      if (createdAt != null) 'createdAt': Timestamp.fromDate(createdAt!),
      'isActive': isActive,
      'variantGroup': variantGroup,
    };
  }

  /// Convert Entity to Model
  factory ProductModel.fromEntity(ProductEntity entity) {
    return ProductModel(
      id: entity.id,
      name: entity.name,
      brand: entity.brand,
      category: entity.category,
      subcategory: entity.subcategory,
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
    );
  }

  /// Read from Hive cache (deserialize from Map) - Section 7.4
  factory ProductModel.fromMap(Map<String, dynamic> data) {
    final pricesData = data['prices'] as Map<String, dynamic>? ?? {};
    final prices = pricesData.map(
      (key, value) => MapEntry(key, (value as num).toDouble()),
    );

    final affiliateData = data['affiliateLinks'] as Map<String, dynamic>? ?? {};
    final affiliateLinks = affiliateData.map(
      (key, value) => MapEntry(key, value.toString()),
    );

    final ratingsData = _deepCastMap(data['ratings']);
    final ratings = ProductRatings(
      expert: (ratingsData['expert'] as num?)?.toDouble() ?? 
              (ratingsData['compairScore'] as num?)?.toDouble() ?? 0.0,
      community: (ratingsData['community'] as num?)?.toDouble() ?? 0.0,
      count: (ratingsData['count'] as num?)?.toInt() ?? 0,
    );

    return ProductModel(
      id: data['id'] ?? '',
      name: data['name'] ?? '',
      brand: data['brand'] ?? '',
      category: data['category'] ?? '',
      subcategory: data['subcategory'] ?? '',
      description: data['description'] ?? '',
      imageURL: data['imageURL'] ?? data['imageUrl'] ?? '',
      prices: prices,
      affiliateLinks: affiliateLinks,
      specs: _deepCastMap(data['specs']),
      specSections: _deepCastMap(data['specSections']),
      keySpecs: _castStringMap(data['keySpecs']),
      variantGroup: data['variantGroup'] as String? ?? '',
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
    );
  }

  static Map<String, double> _parseTechSubscores(dynamic raw) {
    if (raw == null) return {};
    if (raw is! Map) return {};
    return Map<String, double>.fromEntries(
      raw.entries.map((e) => MapEntry(
        e.key.toString(),
        (e.value is num) ? (e.value as num).toDouble() : 0.0,
      )),
    );
  }
}

/// Recursively converts Firestore/Map data to Map<String, dynamic>.
/// Firestore can return inner maps as Map<String, Object?> which breaks
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

/// Converts a Firestore/Map to Map<String, String> (for keySpecs).
Map<String, String> _castStringMap(dynamic raw) {
  if (raw == null) return {};
  if (raw is! Map) return {};
  return Map<String, String>.fromEntries(
    raw.entries
        .where((e) => e.value != null)
        .map((e) => MapEntry(e.key.toString(), e.value.toString())),
  );
}
