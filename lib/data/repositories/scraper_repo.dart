/// Compair - Scraper Repository
/// Manages scraper operations and Cloud Functions integration
library;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/data/models/scraper_models.dart';

class ScraperRepository {
  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  ScraperRepository({
    FirebaseFirestore? firestore,
    FirebaseFunctions? functions,
  })  : _firestore = firestore ?? FirebaseFirestore.instance,
        _functions = functions ?? FirebaseFunctions.instanceFor(region: 'us-central1');

  // ─── Scraper Sources ───

  /// Get all scraper sources ordered by priority
  Stream<List<ScraperSource>> watchSources() {
    return _firestore
        .collection('scraper_sources')
        .orderBy('priority')
        .snapshots()
        .map((snap) => snap.docs.map((d) => ScraperSource.fromFirestore(d)).toList());
  }

  /// Get active sources only
  Future<List<ScraperSource>> getActiveSources() async {
    try {
      final snap = await _firestore
          .collection('scraper_sources')
          .where('isActive', isEqualTo: true)
          .orderBy('priority')
          .get();
      return snap.docs.map((d) => ScraperSource.fromFirestore(d)).toList();
    } catch (e) {
      throw FirestoreException(message: 'Failed to get sources: $e');
    }
  }

  /// Add or update a source
  Future<void> saveSource(ScraperSource source) async {
    try {
      await _firestore
          .collection('scraper_sources')
          .doc(source.id)
          .set(source.toFirestore(), SetOptions(merge: true));
    } catch (e) {
      throw FirestoreException(message: 'Failed to save source: $e');
    }
  }

  /// Toggle source active status
  Future<void> toggleSource(String sourceId, bool isActive) async {
    try {
      await _firestore
          .collection('scraper_sources')
          .doc(sourceId)
          .update({'isActive': isActive});
    } catch (e) {
      throw FirestoreException(message: 'Failed to toggle source: $e');
    }
  }

  /// Update source priority
  Future<void> updateSourcePriority(String sourceId, int priority) async {
    try {
      await _firestore
          .collection('scraper_sources')
          .doc(sourceId)
          .update({'priority': priority});
    } catch (e) {
      throw FirestoreException(message: 'Failed to update source priority: $e');
    }
  }

  /// Delete a source
  Future<void> deleteSource(String sourceId) async {
    try {
      await _firestore.collection('scraper_sources').doc(sourceId).delete();
    } catch (e) {
      throw FirestoreException(message: 'Failed to delete source: $e');
    }
  }

  // ─── Scraper Brands ───

  /// Get all brands
  Stream<List<ScraperBrand>> watchBrands() {
    return _firestore
        .collection('scraper_brands')
        .orderBy('name')
        .snapshots()
        .map((snap) => snap.docs.map((d) => ScraperBrand.fromFirestore(d)).toList());
  }

  /// Get active brands
  Future<List<ScraperBrand>> getActiveBrands() async {
    try {
      final snap = await _firestore
          .collection('scraper_brands')
          .where('isActive', isEqualTo: true)
          .orderBy('name')
          .get();
      return snap.docs.map((d) => ScraperBrand.fromFirestore(d)).toList();
    } catch (e) {
      throw FirestoreException(message: 'Failed to get brands: $e');
    }
  }

  /// Add or update a brand
  Future<void> saveBrand(ScraperBrand brand) async {
    try {
      final id = brand.id.isNotEmpty
          ? brand.id
          : brand.name.toLowerCase().replaceAll(' ', '_');
      await _firestore
          .collection('scraper_brands')
          .doc(id)
          .set(brand.toFirestore(), SetOptions(merge: true));
    } catch (e) {
      throw FirestoreException(message: 'Failed to save brand: $e');
    }
  }

  /// Toggle brand active status
  Future<void> toggleBrand(String brandId, bool isActive) async {
    try {
      await _firestore
          .collection('scraper_brands')
          .doc(brandId)
          .update({'isActive': isActive});
    } catch (e) {
      throw FirestoreException(message: 'Failed to toggle brand: $e');
    }
  }

  /// Delete a brand
  Future<void> deleteBrand(String brandId) async {
    try {
      await _firestore.collection('scraper_brands').doc(brandId).delete();
    } catch (e) {
      throw FirestoreException(message: 'Failed to delete brand: $e');
    }
  }

  // ─── Scraper Schedules ───

  /// Get all schedules
  Stream<List<ScraperSchedule>> watchSchedules() {
    return _firestore
        .collection('scraper_schedules')
        .orderBy('name')
        .snapshots()
        .map((snap) => snap.docs.map((d) => ScraperSchedule.fromFirestore(d)).toList());
  }

  /// Add or update a schedule
  Future<void> saveSchedule(ScraperSchedule schedule) async {
    try {
      final id = schedule.id.isNotEmpty
          ? schedule.id
          : DateTime.now().millisecondsSinceEpoch.toString();
      await _firestore
          .collection('scraper_schedules')
          .doc(id)
          .set(schedule.toFirestore(), SetOptions(merge: true));
    } catch (e) {
      throw FirestoreException(message: 'Failed to save schedule: $e');
    }
  }

  /// Toggle schedule active status
  Future<void> toggleSchedule(String scheduleId, bool isActive) async {
    try {
      await _firestore
          .collection('scraper_schedules')
          .doc(scheduleId)
          .update({'isActive': isActive});
    } catch (e) {
      throw FirestoreException(message: 'Failed to toggle schedule: $e');
    }
  }

  /// Delete a schedule
  Future<void> deleteSchedule(String scheduleId) async {
    try {
      await _firestore.collection('scraper_schedules').doc(scheduleId).delete();
    } catch (e) {
      throw FirestoreException(message: 'Failed to delete schedule: $e');
    }
  }

  // ─── Scraper Logs ───

  /// Get recent logs
  Stream<List<ScraperLog>> watchLogs({int limit = 20}) {
    return _firestore
        .collection('scraper_logs')
        .orderBy('startedAt', descending: true)
        .limit(limit)
        .snapshots()
        .map((snap) => snap.docs.map((d) => ScraperLog.fromFirestore(d)).toList());
  }

  /// Get logs for a specific source/brand
  Future<List<ScraperLog>> getLogsForSource(String sourceId, {int limit = 10}) async {
    try {
      final snap = await _firestore
          .collection('scraper_logs')
          .where('sourceId', isEqualTo: sourceId)
          .orderBy('startedAt', descending: true)
          .limit(limit)
          .get();
      return snap.docs.map((d) => ScraperLog.fromFirestore(d)).toList();
    } catch (e) {
      throw FirestoreException(message: 'Failed to get logs: $e');
    }
  }

  // ─── Category Templates ───

  /// Get all category templates
  Stream<List<CategoryTemplate>> watchCategoryTemplates() {
    return _firestore
        .collection('category_templates')
        .snapshots()
        .map((snap) => snap.docs.map((d) => CategoryTemplate.fromFirestore(d)).toList());
  }

  /// Get a specific category template
  Future<CategoryTemplate?> getCategoryTemplate(String categoryId) async {
    try {
      final doc = await _firestore
          .collection('category_templates')
          .doc(categoryId)
          .get();
      if (!doc.exists) return null;
      return CategoryTemplate.fromFirestore(doc);
    } catch (e) {
      throw FirestoreException(message: 'Failed to get category template: $e');
    }
  }

  /// Save category template
  Future<void> saveCategoryTemplate(CategoryTemplate template) async {
    try {
      await _firestore
          .collection('category_templates')
          .doc(template.id)
          .set(template.toFirestore(), SetOptions(merge: true));
    } catch (e) {
      throw FirestoreException(message: 'Failed to save category template: $e');
    }
  }

  // ─── Subscription Services ───

  /// Get all subscription services
  Stream<List<StreamingService>> watchStreamingServices() {
    return _firestore
        .collection('subscription_services')
        .orderBy('category')
        .snapshots()
        .map((snap) => snap.docs.map((d) => StreamingService.fromFirestore(d)).toList());
  }

  /// Get services by category
  Future<List<StreamingService>> getServicesByCategory(String category) async {
    try {
      final snap = await _firestore
          .collection('subscription_services')
          .where('category', isEqualTo: category)
          .get();
      return snap.docs.map((d) => StreamingService.fromFirestore(d)).toList();
    } catch (e) {
      throw FirestoreException(message: 'Failed to get services: $e');
    }
  }

  /// Save subscription service
  Future<void> saveStreamingService(StreamingService service) async {
    try {
      final id = service.id.isNotEmpty
          ? service.id
          : service.name.toLowerCase().replaceAll(' ', '_');
      await _firestore
          .collection('subscription_services')
          .doc(id)
          .set(service.toFirestore(), SetOptions(merge: true));
    } catch (e) {
      throw FirestoreException(message: 'Failed to save service: $e');
    }
  }

  /// Delete subscription service
  Future<void> deleteStreamingService(String serviceId) async {
    try {
      await _firestore.collection('subscription_services').doc(serviceId).delete();
    } catch (e) {
      throw FirestoreException(message: 'Failed to delete service: $e');
    }
  }

  // ─── Cloud Functions Integration ───

  /// Run scraper from admin panel
  Future<ScraperResult> runScraper({
    String? sourceId,
    String? brandId,
    String? categoryId,
    int maxDevices = 50,
  }) async {
    try {
      final callable = _functions.httpsCallable('runScraperFromAdmin');
      final result = await callable.call<Map<String, dynamic>>({
        'sourceId': sourceId,
        'brandId': brandId,
        'categoryId': categoryId,
        'maxDevices': maxDevices,
      });

      return ScraperResult.fromMap(result.data);
    } on FirebaseFunctionsException catch (e) {
      throw FirestoreException(message: 'Scraper failed: ${e.message}');
    } catch (e) {
      throw FirestoreException(message: 'Scraper failed: $e');
    }
  }

  /// Scrape a single URL
  Future<ScrapedProduct> scrapeUrl(String url) async {
    try {
      final callable = _functions.httpsCallable('scrapeFromUrl');
      final result = await callable.call<Map<String, dynamic>>({
        'url': url,
      });

      return ScrapedProduct.fromMap(result.data);
    } on FirebaseFunctionsException catch (e) {
      throw FirestoreException(message: 'URL scrape failed: ${e.message}');
    } catch (e) {
      throw FirestoreException(message: 'URL scrape failed: $e');
    }
  }

  /// Get scraper status
  Future<ScraperStatus> getStatus() async {
    try {
      final callable = _functions.httpsCallable('scraperStatus');
      final result = await callable.call<Map<String, dynamic>>();
      return ScraperStatus.fromMap(result.data);
    } catch (e) {
      // Fallback to local Firestore query
      final products = await _firestore.collection('products').count().get();
      final sources = await _firestore.collection('scraper_sources').count().get();
      final brands = await _firestore
          .collection('scraper_brands')
          .where('isActive', isEqualTo: true)
          .count()
          .get();

      return ScraperStatus(
        totalProducts: products.count ?? 0,
        activeSources: sources.count ?? 0,
        activeBrands: brands.count ?? 0,
        recentLogs: [],
      );
    }
  }

  /// Initialize default scraper data
  Future<void> initializeDefaultData() async {
    try {
      // Add default sources
      final defaultSources = [
        ScraperSource(
          id: 'epey',
          name: 'Epey',
          baseUrl: 'https://epey.com',
          priority: 1,
          isActive: true,
          supportedCategories: [
            'smartphones', 'tablets', 'laptops', 'desktops',
            'cpus', 'gpus', 'ram', 'ssd', 'motherboards', 'psu', 'cases', 'coolers',
            'tvs', 'monitors', 'projectors',
            'headphones', 'speakers', 'soundbars',
            'smartwatches',
            'cameras', 'action-cameras', 'security-cameras',
            'consoles', 'gamepads',
            'keyboards', 'mice', 'printers', 'webcams',
            'routers', 'robot-vacuums', 'powerbanks', 'e-readers', 'drones',
          ],
        ),
      ];

      final batch = _firestore.batch();

      for (final source in defaultSources) {
        final ref = _firestore.collection('scraper_sources').doc(source.id);
        batch.set(ref, source.toFirestore(), SetOptions(merge: true));
      }

      // Add default brands
      final defaultBrands = [
        'Apple', 'Samsung', 'Google', 'OnePlus', 'Xiaomi', 'Sony',
        'Motorola', 'Nokia', 'Huawei', 'Oppo', 'Vivo', 'Realme',
        'Asus', 'Nothing', 'Dell', 'Lenovo',
      ];

      for (final name in defaultBrands) {
        final id = name.toLowerCase().replaceAll(' ', '_');
        final ref = _firestore.collection('scraper_brands').doc(id);
        batch.set(ref, {
          'name': name,
          'categories': ['phones', 'tablets'],
          'isActive': true,
          'productCount': 0,
        }, SetOptions(merge: true));
      }

      await batch.commit();
    } catch (e) {
      throw FirestoreException(message: 'Failed to initialize data: $e');
    }
  }
}

// ─── Result Models ───

class ScraperResult {
  final bool success;
  final String? logId;
  final int found;
  final int added;
  final int skipped;
  final int errors;

  ScraperResult({
    required this.success,
    this.logId,
    this.found = 0,
    this.added = 0,
    this.skipped = 0,
    this.errors = 0,
  });

  factory ScraperResult.fromMap(Map<String, dynamic> data) {
    final results = data['results'] as Map<String, dynamic>? ?? {};
    return ScraperResult(
      success: data['success'] == true,
      logId: data['logId'] as String?,
      found: results['found'] as int? ?? 0,
      added: results['added'] as int? ?? 0,
      skipped: results['skipped'] as int? ?? 0,
      errors: results['errors'] as int? ?? 0,
    );
  }
}

class ScrapedProduct {
  final bool success;
  final String name;
  final String? imageUrl;
  final String? brand;
  final String source;
  final String sourceUrl;

  ScrapedProduct({
    required this.success,
    required this.name,
    this.imageUrl,
    this.brand,
    required this.source,
    required this.sourceUrl,
  });

  factory ScrapedProduct.fromMap(Map<String, dynamic> data) {
    final product = data['product'] as Map<String, dynamic>? ?? {};
    return ScrapedProduct(
      success: data['success'] == true,
      name: product['name'] as String? ?? '',
      imageUrl: product['imageUrl'] as String?,
      brand: product['brand'] as String?,
      source: product['source'] as String? ?? '',
      sourceUrl: product['sourceUrl'] as String? ?? '',
    );
  }
}

class ScraperStatus {
  final int totalProducts;
  final int activeSources;
  final int activeBrands;
  final List<Map<String, dynamic>> recentLogs;

  ScraperStatus({
    required this.totalProducts,
    required this.activeSources,
    required this.activeBrands,
    required this.recentLogs,
  });

  factory ScraperStatus.fromMap(Map<String, dynamic> data) {
    return ScraperStatus(
      totalProducts: data['totalProducts'] as int? ?? 0,
      activeSources: data['activeSources'] as int? ?? 0,
      activeBrands: data['activeBrands'] as int? ?? 0,
      recentLogs: (data['recentLogs'] as List<dynamic>?)
              ?.map((e) => Map<String, dynamic>.from(e))
              .toList() ??
          [],
    );
  }
}
