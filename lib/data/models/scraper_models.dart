/// Qor AI - Scraper Data Models
/// Models for scraper management system
library;

import 'package:pocketbase/pocketbase.dart';

/// Scraper Source - Product data sources
class ScraperSource {
  final String id;
  final String name;
  final String baseUrl;
  final int priority; // Lower = higher priority
  final bool isActive;
  final List<String> supportedCategories;
  final DateTime? lastSuccessfulScrape;
  final int failureCount;

  ScraperSource({
    required this.id,
    required this.name,
    required this.baseUrl,
    required this.priority,
    this.isActive = true,
    this.supportedCategories = const [],
    this.lastSuccessfulScrape,
    this.failureCount = 0,
  });

  factory ScraperSource.fromPb(RecordModel r) {
    final data = r.data;
    return ScraperSource(
      id: r.id,
      name: data['name'] ?? '',
      baseUrl: data['baseUrl'] ?? '',
      priority: data['priority'] ?? 99,
      isActive: data['isActive'] ?? true,
      supportedCategories: List<String>.from(data['supportedCategories'] ?? []),
      lastSuccessfulScrape: DateTime.tryParse(data['lastSuccessfulScrape'] ?? ''),
      failureCount: data['failureCount'] ?? 0,
    );
  }

  factory ScraperSource.fromFirestore(dynamic doc) => ScraperSource.fromPb(doc as RecordModel);

  Map<String, dynamic> toMap() => {
    'name': name,
    'baseUrl': baseUrl,
    'priority': priority,
    'isActive': isActive,
    'supportedCategories': supportedCategories,
    'lastSuccessfulScrape': lastSuccessfulScrape?.toIso8601String(),
    'failureCount': failureCount,
  };

  Map<String, dynamic> toFirestore() => toMap();
}

/// Scraper Brand - Brands to scrape (Apple, Samsung, etc.)
class ScraperBrand {
  final String id;
  final String name;
  final String? logoUrl;
  final String? websiteUrl;
  final List<String> categories; // Which categories to scrape for this brand
  final bool isActive;
  final DateTime? lastScraped;
  final int productCount;

  ScraperBrand({
    required this.id,
    required this.name,
    this.logoUrl,
    this.websiteUrl,
    this.categories = const [],
    this.isActive = true,
    this.lastScraped,
    this.productCount = 0,
  });

  factory ScraperBrand.fromPb(RecordModel r) {
    final data = r.data;
    return ScraperBrand(
      id: r.id,
      name: data['name'] ?? '',
      logoUrl: data['logoUrl'],
      websiteUrl: data['websiteUrl'],
      categories: List<String>.from(data['categories'] ?? []),
      isActive: data['isActive'] ?? true,
      lastScraped: DateTime.tryParse(data['lastScraped'] ?? ''),
      productCount: data['productCount'] ?? 0,
    );
  }

  factory ScraperBrand.fromFirestore(dynamic doc) => ScraperBrand.fromPb(doc as RecordModel);

  Map<String, dynamic> toMap() => {
    'name': name,
    'logoUrl': logoUrl,
    'websiteUrl': websiteUrl,
    'categories': categories,
    'isActive': isActive,
    'lastScraped': lastScraped?.toIso8601String(),
    'productCount': productCount,
  };

  Map<String, dynamic> toFirestore() => toMap();
}

/// Category Template - Spec fields for each category
class CategoryTemplate {
  final String id;
  final String name;
  final String icon;
  final List<SpecFieldTemplate> specFields;
  final DateTime updatedAt;

  CategoryTemplate({
    required this.id,
    required this.name,
    required this.icon,
    required this.specFields,
    required this.updatedAt,
  });

  factory CategoryTemplate.fromPb(RecordModel r) {
    final data = r.data;
    return CategoryTemplate(
      id: r.id,
      name: data['name'] ?? '',
      icon: data['icon'] ?? 'category',
      specFields: (data['specFields'] as List<dynamic>? ?? [])
          .map((e) => SpecFieldTemplate.fromMap(e as Map<String, dynamic>))
          .toList(),
      updatedAt: DateTime.tryParse(data['updated'] ?? '') ?? DateTime.now(),
    );
  }

  factory CategoryTemplate.fromFirestore(dynamic doc) => CategoryTemplate.fromPb(doc as RecordModel);

  Map<String, dynamic> toMap() => {
    'name': name,
    'icon': icon,
    'specFields': specFields.map((e) => e.toMap()).toList(),
  };

  Map<String, dynamic> toFirestore() => toMap();
}

/// Spec Field Template - Individual spec field definition
class SpecFieldTemplate {
  final String key;
  final String label;
  final String group; // display, processor, memory, camera, battery, etc.
  final String type; // text, number, boolean, list
  final bool required;

  SpecFieldTemplate({
    required this.key,
    required this.label,
    required this.group,
    this.type = 'text',
    this.required = false,
  });

  factory SpecFieldTemplate.fromMap(Map<String, dynamic> data) {
    return SpecFieldTemplate(
      key: data['key'] ?? '',
      label: data['label'] ?? '',
      group: data['group'] ?? 'general',
      type: data['type'] ?? 'text',
      required: data['required'] ?? false,
    );
  }

  Map<String, dynamic> toMap() => {
    'key': key,
    'label': label,
    'group': group,
    'type': type,
    'required': required,
  };
}

/// Scraper Schedule - Automated scraping schedules
class ScraperSchedule {
  final String id;
  final String name;
  final String frequency; // daily, weekly, monthly
  final int? dayOfWeek; // 1-7 for weekly
  final int? dayOfMonth; // 1-31 for monthly
  final int hour; // 0-23
  final List<String> brandIds; // Which brands to scrape
  final List<String> categoryIds; // Which categories to scrape
  final bool isActive;
  final DateTime? lastRun;
  final DateTime? nextRun;

  ScraperSchedule({
    required this.id,
    required this.name,
    required this.frequency,
    this.dayOfWeek,
    this.dayOfMonth,
    required this.hour,
    this.brandIds = const [],
    this.categoryIds = const [],
    this.isActive = true,
    this.lastRun,
    this.nextRun,
  });

  factory ScraperSchedule.fromPb(RecordModel r) {
    final data = r.data;
    return ScraperSchedule(
      id: r.id,
      name: data['name'] ?? '',
      frequency: data['frequency'] ?? 'weekly',
      dayOfWeek: data['dayOfWeek'],
      dayOfMonth: data['dayOfMonth'],
      hour: data['hour'] ?? 3,
      brandIds: List<String>.from(data['brandIds'] ?? []),
      categoryIds: List<String>.from(data['categoryIds'] ?? []),
      isActive: data['isActive'] ?? true,
      lastRun: DateTime.tryParse(data['lastRun'] ?? ''),
      nextRun: DateTime.tryParse(data['nextRun'] ?? ''),
    );
  }

  factory ScraperSchedule.fromFirestore(dynamic doc) => ScraperSchedule.fromPb(doc as RecordModel);

  Map<String, dynamic> toMap() => {
    'name': name,
    'frequency': frequency,
    'dayOfWeek': dayOfWeek,
    'dayOfMonth': dayOfMonth,
    'hour': hour,
    'brandIds': brandIds,
    'categoryIds': categoryIds,
    'isActive': isActive,
    'lastRun': lastRun?.toIso8601String(),
    'nextRun': nextRun?.toIso8601String(),
  };

  Map<String, dynamic> toFirestore() => toMap();
}

/// Scraper Log - Log of scraping operations
class ScraperLog {
  final String id;
  final String type; // manual, scheduled, ai_discovery
  final String status; // running, success, partial, failed
  final DateTime startedAt;
  final DateTime? completedAt;
  final String? sourceId;
  final String? brandId;
  final String? categoryId;
  final int productsFound;
  final int productsAdded;
  final int productsDuplicate;
  final int productsFailed;
  final String? errorMessage;
  final List<String> details;

  ScraperLog({
    required this.id,
    required this.type,
    required this.status,
    required this.startedAt,
    this.completedAt,
    this.sourceId,
    this.brandId,
    this.categoryId,
    this.productsFound = 0,
    this.productsAdded = 0,
    this.productsDuplicate = 0,
    this.productsFailed = 0,
    this.errorMessage,
    this.details = const [],
  });

  factory ScraperLog.fromPb(RecordModel r) {
    final data = r.data;
    return ScraperLog(
      id: r.id,
      type: data['type'] ?? 'manual',
      status: data['status'] ?? 'running',
      startedAt: DateTime.tryParse(data['startedAt'] ?? '') ?? DateTime.now(),
      completedAt: DateTime.tryParse(data['completedAt'] ?? ''),
      sourceId: data['sourceId'],
      brandId: data['brandId'],
      categoryId: data['categoryId'],
      productsFound: data['productsFound'] ?? 0,
      productsAdded: data['productsAdded'] ?? 0,
      productsDuplicate: data['productsDuplicate'] ?? 0,
      productsFailed: data['productsFailed'] ?? 0,
      errorMessage: data['errorMessage'],
      details: List<String>.from(data['details'] ?? []),
    );
  }

  factory ScraperLog.fromFirestore(dynamic doc) => ScraperLog.fromPb(doc as RecordModel);

  Map<String, dynamic> toMap() => {
    'type': type,
    'status': status,
    'startedAt': startedAt.toIso8601String(),
    'completedAt': completedAt?.toIso8601String(),
    'sourceId': sourceId,
    'brandId': brandId,
    'categoryId': categoryId,
    'productsFound': productsFound,
    'productsAdded': productsAdded,
    'productsDuplicate': productsDuplicate,
    'productsFailed': productsFailed,
    'errorMessage': errorMessage,
    'details': details,
  };

  Map<String, dynamic> toFirestore() => toMap();

  Duration? get duration {
    if (completedAt == null) return null;
    return completedAt!.difference(startedAt);
  }
}

/// Streaming Service - For subscription comparisons (YT Music vs Apple Music)
class StreamingService {
  final String id;
  final String name;
  final String category; // music, video, cloud, productivity
  final String? logoUrl;
  final String? websiteUrl;
  final String? affiliateUrl;
  final Map<String, dynamic> pricing; // monthly, yearly, family, student plans
  final Map<String, dynamic> features;
  final List<String> platforms; // ios, android, web, desktop
  final List<String> advantages;
  final List<String> disadvantages;
  final DateTime updatedAt;

  StreamingService({
    required this.id,
    required this.name,
    required this.category,
    this.logoUrl,
    this.websiteUrl,
    this.affiliateUrl,
    this.pricing = const {},
    this.features = const {},
    this.platforms = const [],
    this.advantages = const [],
    this.disadvantages = const [],
    required this.updatedAt,
  });

  factory StreamingService.fromPb(RecordModel r) {
    final data = r.data;
    return StreamingService(
      id: r.id,
      name: data['name'] ?? '',
      category: data['category'] ?? '',
      logoUrl: data['logoUrl'],
      websiteUrl: data['websiteUrl'],
      affiliateUrl: data['affiliateUrl'],
      pricing: Map<String, dynamic>.from(data['pricing'] ?? {}),
      features: Map<String, dynamic>.from(data['features'] ?? {}),
      platforms: List<String>.from(data['platforms'] ?? []),
      advantages: List<String>.from(data['advantages'] ?? []),
      disadvantages: List<String>.from(data['disadvantages'] ?? []),
      updatedAt: DateTime.tryParse(data['updated'] ?? '') ?? DateTime.now(),
    );
  }

  factory StreamingService.fromFirestore(dynamic doc) => StreamingService.fromPb(doc as RecordModel);

  Map<String, dynamic> toMap() => {
    'name': name,
    'category': category,
    'logoUrl': logoUrl,
    'websiteUrl': websiteUrl,
    'affiliateUrl': affiliateUrl,
    'pricing': pricing,
    'features': features,
    'platforms': platforms,
    'advantages': advantages,
    'disadvantages': disadvantages,
  };

  Map<String, dynamic> toFirestore() => toMap();
}
