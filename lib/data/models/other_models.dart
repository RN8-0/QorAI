/// Qor AI - Other Firestore Models
/// Blueprint Section 4.4 - categories, affiliate_clicks, user_links, trends, reviews
library;

import 'package:flutter/material.dart';
import 'package:pocketbase/pocketbase.dart';
import 'package:qor_ai/domain/entities/category_entity.dart';

// ─── Category Model ─── Section 4.4
class CategoryModel extends CategoryEntity {
  const CategoryModel({
    required super.id,
    required super.name,
    required super.icon,
    super.emoji,
    super.order,
    super.isActive,
    super.subcategories,
    super.productCount,
  });

  factory CategoryModel.fromPb(RecordModel record) {
    final data = record.data;
    return CategoryModel(
      id: record.id,
      name: data['name'] ?? '',
      icon: data['icon'] ?? '',
      emoji: data['emoji'],
      order: data['order'] ?? 0,
      isActive: data['isActive'] ?? true,
      subcategories: List<String>.from(data['subcategories'] ?? []),
      productCount: data['productCount'] ?? 0,
    );
  }

  factory CategoryModel.fromFirestore(dynamic doc) => CategoryModel.fromPb(doc as RecordModel);

  Map<String, dynamic> toFirestore() => toMap();

  Map<String, dynamic> toMap() => {
        'id': id,
        'name': name,
        'icon': icon,
        if (emoji != null) 'emoji': emoji,
        'order': order,
        'isActive': isActive,
        'subcategories': subcategories,
        'productCount': productCount,
      };

  factory CategoryModel.fromMap(Map<String, dynamic> data) {
    return CategoryModel(
      id: data['id'] ?? '',
      name: data['name'] ?? '',
      icon: data['icon'] ?? '',
      emoji: data['emoji'],
      order: data['order'] ?? 0,
      isActive: data['isActive'] ?? true,
      subcategories: List<String>.from(data['subcategories'] ?? []),
      productCount: data['productCount'] ?? 0,
    );
  }
}

// ─── Affiliate Click Model ─── Section 4.4
class AffiliateClickModel {
  final String id;
  final String userId;
  final String productId;
  final String affiliateUrl;
  final String country;
  final DateTime timestamp;
  final bool converted;

  const AffiliateClickModel({
    required this.id,
    required this.userId,
    required this.productId,
    required this.affiliateUrl,
    required this.country,
    required this.timestamp,
    this.converted = false,
  });

  factory AffiliateClickModel.fromPb(RecordModel record) {
    final data = record.data;
    return AffiliateClickModel(
      id: record.id,
      userId: data['userId'] ?? '',
      productId: data['productId'] ?? '',
      affiliateUrl: data['affiliateUrl'] ?? '',
      country: data['country'] ?? '',
      timestamp: _parseDate(data['created']) ?? _parseDate(data['timestamp']) ?? DateTime.now(),
      converted: data['converted'] ?? false,
    );
  }

  static DateTime? _parseDate(dynamic v) {
    if (v == null) return null;
    if (v is String) return DateTime.tryParse(v);
    return null;
  }

  Map<String, dynamic> toMap() => {
        'userId': userId,
        'productId': productId,
        'affiliateUrl': affiliateUrl,
        'country': country,
        'timestamp': timestamp.toIso8601String(),
        'converted': converted,
      };

  Map<String, dynamic> toFirestore() => toMap();
}

// ─── User Link Model ─── Section 4.4 (Link Paste Feature)
class UserLinkModel {
  final String id;
  final String userId;
  final String url;
  final OgMetadataModel? ogMetadata;
  final double aiScore;
  final String aiAnalysis;
  final String? category;
  final DateTime createdAt;

  const UserLinkModel({
    required this.id,
    required this.userId,
    required this.url,
    this.ogMetadata,
    this.aiScore = 0.0,
    this.aiAnalysis = '',
    this.category,
    required this.createdAt,
  });

  factory UserLinkModel.fromPb(RecordModel record) {
    final data = record.data;
    final ogData = data['ogMetadata'] as Map<String, dynamic>?;
    return UserLinkModel(
      id: record.id,
      userId: data['userId'] ?? '',
      url: data['url'] ?? '',
      ogMetadata: ogData != null ? OgMetadataModel.fromMap(ogData) : null,
      aiScore: (data['aiScore'] as num?)?.toDouble() ?? 0.0,
      aiAnalysis: data['aiAnalysis'] ?? '',
      category: data['category'],
      createdAt: _parseDate(data['created']) ?? _parseDate(data['createdAt']) ?? DateTime.now(),
    );
  }

  static DateTime? _parseDate(dynamic v) {
    if (v == null) return null;
    if (v is String) return DateTime.tryParse(v);
    return null;
  }

  Map<String, dynamic> toMap() => {
        'userId': userId,
        'url': url,
        'ogMetadata': ogMetadata?.toMap(),
        'aiScore': aiScore,
        'aiAnalysis': aiAnalysis,
        'category': category,
      };

  Map<String, dynamic> toFirestore() => toMap();
}

class OgMetadataModel {
  final String? title;
  final String? description;
  final String? image;
  final String? price;

  const OgMetadataModel({
    this.title,
    this.description,
    this.image,
    this.price,
  });

  factory OgMetadataModel.fromMap(Map<String, dynamic> map) => OgMetadataModel(
        title: map['title'],
        description: map['description'],
        image: map['image'],
        price: map['price'],
      );

  Map<String, dynamic> toMap() => {
        'title': title,
        'description': description,
        'image': image,
        'price': price,
      };
}

// ─── Trend Model ─── Section 4.4
class TrendModel {
  final String id;
  final String category;
  final String country;
  final List<TrendItem> items;
  final DateTime weekStart;
  final DateTime weekEnd;
  final String source;

  const TrendModel({
    required this.id,
    required this.category,
    required this.country,
    required this.items,
    required this.weekStart,
    required this.weekEnd,
    required this.source,
  });

  factory TrendModel.fromPb(RecordModel record) {
    final data = record.data;
    final itemsList = (data['items'] as List<dynamic>? ?? [])
        .map((e) => TrendItem.fromMap(e as Map<String, dynamic>))
        .toList();
    return TrendModel(
      id: record.id,
      category: data['category'] ?? '',
      country: data['country'] ?? '',
      items: itemsList,
      weekStart: _parseDate(data['weekStart']) ?? DateTime.now(),
      weekEnd: _parseDate(data['weekEnd']) ?? DateTime.now(),
      source: data['source'] ?? '',
    );
  }

  factory TrendModel.fromFirestore(dynamic doc) => TrendModel.fromPb(doc as RecordModel);

  static DateTime? _parseDate(dynamic v) {
    if (v == null) return null;
    if (v is String) return DateTime.tryParse(v);
    return null;
  }

  Map<String, dynamic> toMap() => {
        'category': category,
        'country': country,
        'items': items.map((e) => e.toMap()).toList(),
        'weekStart': weekStart.toIso8601String(),
        'weekEnd': weekEnd.toIso8601String(),
        'source': source,
      };

  Map<String, dynamic> toFirestore() => toMap();
}

class TrendItem {
  final String productId;
  final String name;
  final String imageURL;
  final double score;
  final int rank;

  const TrendItem({
    required this.productId,
    required this.name,
    this.imageURL = '',
    this.score = 0.0,
    this.rank = 0,
  });

  factory TrendItem.fromMap(Map<String, dynamic> map) => TrendItem(
        productId: map['productId'] ?? '',
        name: map['name'] ?? '',
        imageURL: map['imageURL'] ?? '',
        score: (map['score'] as num?)?.toDouble() ?? 0.0,
        rank: map['rank'] ?? 0,
      );

  Map<String, dynamic> toMap() => {
        'productId': productId,
        'name': name,
        'imageURL': imageURL,
        'score': score,
        'rank': rank,
      };
}

// ─── Review Model ─── Section 4.4 (Community Reviews)
class ReviewModel {
  final String id;
  final String userId;
  final String productId;
  final double rating;
  final String text;
  final int helpful;
  final bool reported;
  final DateTime createdAt;
  final List<String> likedBy;
  final List<String> dislikedBy;
  final String authorDisplayName;
  final String authorPhotoURL;

  const ReviewModel({
    required this.id,
    required this.userId,
    required this.productId,
    required this.rating,
    this.text = '',
    this.helpful = 0,
    this.reported = false,
    required this.createdAt,
    this.likedBy = const [],
    this.dislikedBy = const [],
    this.authorDisplayName = '',
    this.authorPhotoURL = '',
  });

  /// True when delete_account.pb.js anonymized the review (userId blanked
  /// after the author deleted their account). UI uses this to render the
  /// localized "Silinen Hesap" / "Deleted Account" placeholder.
  bool get isAuthorDeleted =>
      userId.trim().isEmpty && authorDisplayName.trim().isEmpty;

  factory ReviewModel.fromPb(RecordModel record) {
    final data = record.data;
    return ReviewModel(
      id: record.id,
      userId: (data['userId'] ?? '').toString(),
      productId: data['productId'] ?? '',
      rating: (data['rating'] as num?)?.toDouble() ?? 0.0,
      text: data['text'] ?? '',
      helpful: data['helpful'] ?? 0,
      reported: data['reported'] ?? false,
      createdAt: _parseDate(data['created']) ?? DateTime.now(),
      likedBy: List<String>.from(data['likedBy'] ?? []),
      dislikedBy: List<String>.from(data['dislikedBy'] ?? []),
      authorDisplayName: (data['authorDisplayName'] ?? '').toString(),
      authorPhotoURL: (data['authorPhotoURL'] ?? '').toString(),
    );
  }

  factory ReviewModel.fromFirestore(dynamic doc) => ReviewModel.fromPb(doc as RecordModel);

  static DateTime? _parseDate(dynamic v) {
    if (v == null) return null;
    if (v is String) return DateTime.tryParse(v);
    return null;
  }

  Map<String, dynamic> toMap() => {
        'userId': userId,
        'productId': productId,
        'rating': rating,
        'text': text,
        'helpful': helpful,
        'reported': reported,
        'likedBy': likedBy,
        'dislikedBy': dislikedBy,
        if (authorDisplayName.isNotEmpty) 'authorDisplayName': authorDisplayName,
        if (authorPhotoURL.isNotEmpty) 'authorPhotoURL': authorPhotoURL,
      };

  Map<String, dynamic> toFirestore() => toMap();
}

// ─── Subscription Service Model (Netflix, Spotify etc.) ───

class SubscriptionPlan {
  final String name;
  final double price;
  final String currency;
  final String billingPeriod;
  final List<String> features;

  const SubscriptionPlan({
    required this.name,
    required this.price,
    required this.currency,
    required this.billingPeriod,
    required this.features,
  });

  factory SubscriptionPlan.fromMap(Map<String, dynamic> m) {
    return SubscriptionPlan(
      name: m['name'] as String? ?? '',
      price: (m['price'] as num?)?.toDouble() ?? 0.0,
      currency: m['currency'] as String? ?? 'USD',
      billingPeriod: m['billingPeriod'] as String? ?? 'monthly',
      features: List<String>.from(m['features'] as List? ?? []),
    );
  }

  String get priceLabel {
    if (price == 0) return 'Free';
    return '\$${price.toStringAsFixed(2)}/${billingPeriod == 'yearly' ? 'yr' : 'mo'}';
  }
}

class SubscriptionServiceModel {
  final String id;
  final String name;
  final String category;
  final String logo;
  final String website;
  final String affiliateUrl;
  final bool isActive;
  final String description;
  final List<String> pros;
  final List<String> cons;
  final List<String> platforms;
  final List<SubscriptionPlan> plans;

  const SubscriptionServiceModel({
    required this.id,
    required this.name,
    required this.category,
    required this.logo,
    required this.website,
    this.affiliateUrl = '',
    required this.isActive,
    this.description = '',
    this.pros = const [],
    this.cons = const [],
    this.platforms = const [],
    required this.plans,
  });

  factory SubscriptionServiceModel.fromPb(RecordModel record) {
    final d = record.data;
    return SubscriptionServiceModel(
      id: record.id,
      name: d['name'] as String? ?? '',
      category: d['category'] as String? ?? 'streaming',
      logo: d['logo'] as String? ?? '',
      website: d['website'] as String? ?? '',
      affiliateUrl: d['affiliateUrl'] as String? ?? '',
      isActive: d['isActive'] as bool? ?? true,
      description: d['description'] as String? ?? '',
      pros: List<String>.from(d['pros'] as List? ?? []),
      cons: List<String>.from(d['cons'] as List? ?? []),
      platforms: List<String>.from(d['platforms'] as List? ?? []),
      plans: (d['plans'] as List? ?? [])
          .map((p) => SubscriptionPlan.fromMap(
                Map<String, dynamic>.from(p as Map? ?? {}),
              ))
          .toList(),
    );
  }

  factory SubscriptionServiceModel.fromFirestore(dynamic doc) =>
      SubscriptionServiceModel.fromPb(doc as RecordModel);

  SubscriptionPlan? get cheapestPlan {
    if (plans.isEmpty) return null;
    return plans.reduce((a, b) => a.price <= b.price ? a : b);
  }

  SubscriptionPlan? get premiumPlan {
    if (plans.isEmpty) return null;
    return plans.reduce((a, b) => a.price >= b.price ? a : b);
  }

  static const _categoryColors = {
    'music': Color(0xFF1DB954),
    'gaming': Color(0xFF9B59B6),
    'cloud': Color(0xFF3498DB),
    'streaming': Color(0xFFE50914),
    'ai': Color(0xFF10A37F),
    'vpn': Color(0xFF4A90D9),
    'antivirus': Color(0xFFD63B2F),
    'hosting': Color(0xFFFF6C37),
    'productivity': Color(0xFF6C5CE7),
    'email': Color(0xFF0078D4),
    'learning': Color(0xFF2D9CDB),
    'fitness': Color(0xFFFF5722),
  };

  Color categoryColor() => _categoryColors[category] ?? const Color(0xFFE50914);

  /// Brand-specific accent color based on service name
  static const _brandColors = {
    'spotify': Color(0xFF1DB954),
    'apple music': Color(0xFFFC3C44),
    'youtube music': Color(0xFFFF0000),
    'amazon music': Color(0xFF25D1DA),
    'tidal': Color(0xFF000000),
    'deezer': Color(0xFFA238FF),
    'netflix': Color(0xFFE50914),
    'disney': Color(0xFF113CCF),
    'hbo': Color(0xFF5822B4),
    'hulu': Color(0xFF1CE783),
    'prime video': Color(0xFF00A8E1),
    'paramount': Color(0xFF0064FF),
    'crunchyroll': Color(0xFFF47521),
    'xbox': Color(0xFF107C10),
    'playstation': Color(0xFF003791),
    'nintendo': Color(0xFFE60012),
    'ea play': Color(0xFF1A6BFF),
    'icloud': Color(0xFF3693F5),
    'google one': Color(0xFF4285F4),
    'dropbox': Color(0xFF0061FF),
    'onedrive': Color(0xFF0078D4),
    'chatgpt': Color(0xFF10A37F),
    'copilot': Color(0xFF7C3AED),
    'gemini': Color(0xFF4285F4),
    'claude': Color(0xFFD97706),
    'midjourney': Color(0xFF000000),
    'nordvpn': Color(0xFF4687FF),
    'expressvpn': Color(0xFFDA3940),
    'surfshark': Color(0xFF178CE6),
    'norton': Color(0xFFFFC20E),
    'mcafee': Color(0xFFC8102E),
    'notion': Color(0xFF000000),
    'figma': Color(0xFFF24E1E),
    'canva': Color(0xFF00C4CC),
    'adobe': Color(0xFFFF0000),
    'slack': Color(0xFF4A154B),
    'zoom': Color(0xFF2D8CFF),
    'duolingo': Color(0xFF58CC02),
    'coursera': Color(0xFF0056D2),
    'peloton': Color(0xFFD72631),
  };

  Color brandColor() {
    final lower = name.toLowerCase();
    for (final entry in _brandColors.entries) {
      if (lower.contains(entry.key)) return entry.value;
    }
    return categoryColor();
  }

  /// Secondary brand color for gradients
  Color brandColorLight() {
    final base = brandColor();
    return Color.lerp(base, Colors.white, 0.3) ?? base;
  }
}

// ─── User Subscription Tracking ───
class UserSubscriptionDetail {
  final String serviceId;
  final String serviceName;
  final String planName;
  final DateTime startDate;
  final DateTime? renewalDate;
  final double monthlyCost;
  final String currency;
  final bool isActive;

  const UserSubscriptionDetail({
    required this.serviceId,
    required this.serviceName,
    required this.planName,
    required this.startDate,
    this.renewalDate,
    required this.monthlyCost,
    this.currency = 'USD',
    this.isActive = true,
  });

  factory UserSubscriptionDetail.fromMap(String serviceId, Map<String, dynamic> data) {
    return UserSubscriptionDetail(
      serviceId: serviceId,
      serviceName: data['serviceName'] as String? ?? '',
      planName: data['planName'] as String? ?? '',
      startDate: DateTime.tryParse(data['startDate']?.toString() ?? '') ?? DateTime.now(),
      renewalDate: DateTime.tryParse(data['renewalDate']?.toString() ?? ''),
      monthlyCost: (data['monthlyCost'] as num?)?.toDouble() ?? 0.0,
      currency: data['currency'] as String? ?? 'USD',
      isActive: data['isActive'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'serviceName': serviceName,
      'planName': planName,
      'startDate': startDate.toIso8601String(),
      if (renewalDate != null) 'renewalDate': renewalDate!.toIso8601String(),
      'monthlyCost': monthlyCost,
      'currency': currency,
      'isActive': isActive,
    };
  }

  int get daysUntilRenewal {
    if (renewalDate == null) return -1;
    return renewalDate!.difference(DateTime.now()).inDays;
  }

  int get daysSinceStart => DateTime.now().difference(startDate).inDays;

  String get durationLabel {
    final months = daysSinceStart ~/ 30;
    if (months < 1) return 'This month';
    if (months == 1) return '1 month';
    if (months < 12) return '$months months';
    final years = months ~/ 12;
    final rem = months % 12;
    if (rem == 0) return '$years year${years > 1 ? 's' : ''}';
    return '$years yr ${rem}mo';
  }
}
