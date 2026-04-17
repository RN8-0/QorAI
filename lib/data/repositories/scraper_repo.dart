/// Compair - Scraper Repository
/// Manages scraper operations via PocketBase
library;

import 'dart:async';
import 'package:pocketbase/pocketbase.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/core/pb_client.dart';
import 'package:compair/data/models/scraper_models.dart';

class ScraperRepository {
  final PocketBase _pb;

  ScraperRepository({PocketBase? pbClient}) : _pb = pbClient ?? pb;

  // ─── Stream helper ───

  /// Safe realtime stream: guards controller.add/addError with hasListener check
  /// so in-flight fetches after subscriber cancellation are silently dropped.
  Stream<List<T>> _watchCol<T>({
    required String collection,
    required Future<List<T>> Function() fetch,
  }) {
    final controller = StreamController<List<T>>();
    UnsubscribeFunc? unsub;

    void emitSafe() {
      fetch().then((data) {
        if (controller.hasListener) controller.add(data);
      }).catchError((Object e) {
        if (controller.hasListener) controller.addError(e);
      });
    }

    emitSafe();
    _pb.collection(collection).subscribe('*', (_) => emitSafe()).then((fn) => unsub = fn);
    controller.onCancel = () => unsub?.call();
    return controller.stream;
  }

  // ─── Scraper Sources ───

  /// Get all scraper sources ordered by priority
  Stream<List<ScraperSource>> watchSources() =>
      _watchCol(collection: 'scraper_sources', fetch: _fetchSources);

  Future<List<ScraperSource>> _fetchSources() async {
    final result = await _pb.collection('scraper_sources').getFullList(sort: 'priority');
    return result.map(ScraperSource.fromPb).toList();
  }

  /// Get active sources only
  Future<List<ScraperSource>> getActiveSources() async {
    try {
      final result = await _pb.collection('scraper_sources').getFullList(
        filter: 'isActive = true',
        sort: 'priority',
      );
      return result.map(ScraperSource.fromPb).toList();
    } catch (e) {
      throw ServerException(message: 'Failed to get sources: $e');
    }
  }

  /// Add or update a source
  Future<void> saveSource(ScraperSource source) async {
    try {
      if (source.id.isNotEmpty) {
        try {
          await _pb.collection('scraper_sources').update(source.id, body: source.toMap());
          return;
        } catch (_) {}
      }
      await _pb.collection('scraper_sources').create(body: source.toMap());
    } catch (e) {
      throw ServerException(message: 'Failed to save source: $e');
    }
  }

  /// Toggle source active status
  Future<void> toggleSource(String sourceId, bool isActive) async {
    try {
      await _pb.collection('scraper_sources').update(sourceId, body: {'isActive': isActive});
    } catch (e) {
      throw ServerException(message: 'Failed to toggle source: $e');
    }
  }

  /// Update source priority
  Future<void> updateSourcePriority(String sourceId, int priority) async {
    try {
      await _pb.collection('scraper_sources').update(sourceId, body: {'priority': priority});
    } catch (e) {
      throw ServerException(message: 'Failed to update source priority: $e');
    }
  }

  /// Delete a source
  Future<void> deleteSource(String sourceId) async {
    try {
      await _pb.collection('scraper_sources').delete(sourceId);
    } catch (e) {
      throw ServerException(message: 'Failed to delete source: $e');
    }
  }

  // ─── Scraper Brands ───

  /// Get all brands
  Stream<List<ScraperBrand>> watchBrands() =>
      _watchCol(collection: 'scraper_brands', fetch: _fetchBrands);

  Future<List<ScraperBrand>> _fetchBrands() async {
    final result = await _pb.collection('scraper_brands').getFullList(sort: 'name');
    return result.map(ScraperBrand.fromPb).toList();
  }

  /// Get active brands
  Future<List<ScraperBrand>> getActiveBrands() async {
    try {
      final result = await _pb.collection('scraper_brands').getFullList(
        filter: 'isActive = true',
        sort: 'name',
      );
      return result.map(ScraperBrand.fromPb).toList();
    } catch (e) {
      throw ServerException(message: 'Failed to get brands: $e');
    }
  }

  /// Add or update a brand
  Future<void> saveBrand(ScraperBrand brand) async {
    try {
      if (brand.id.isNotEmpty) {
        try {
          await _pb.collection('scraper_brands').update(brand.id, body: brand.toMap());
          return;
        } catch (_) {}
      }
      await _pb.collection('scraper_brands').create(body: brand.toMap());
    } catch (e) {
      throw ServerException(message: 'Failed to save brand: $e');
    }
  }

  /// Toggle brand active status
  Future<void> toggleBrand(String brandId, bool isActive) async {
    try {
      await _pb.collection('scraper_brands').update(brandId, body: {'isActive': isActive});
    } catch (e) {
      throw ServerException(message: 'Failed to toggle brand: $e');
    }
  }

  /// Delete a brand
  Future<void> deleteBrand(String brandId) async {
    try {
      await _pb.collection('scraper_brands').delete(brandId);
    } catch (e) {
      throw ServerException(message: 'Failed to delete brand: $e');
    }
  }

  // ─── Scraper Schedules ───

  /// Get all schedules
  Stream<List<ScraperSchedule>> watchSchedules() =>
      _watchCol(collection: 'scraper_schedules', fetch: _fetchSchedules);

  Future<List<ScraperSchedule>> _fetchSchedules() async {
    final result = await _pb.collection('scraper_schedules').getFullList(sort: 'name');
    return result.map(ScraperSchedule.fromPb).toList();
  }

  /// Add or update a schedule
  Future<void> saveSchedule(ScraperSchedule schedule) async {
    try {
      if (schedule.id.isNotEmpty) {
        try {
          await _pb.collection('scraper_schedules').update(schedule.id, body: schedule.toMap());
          return;
        } catch (_) {}
      }
      await _pb.collection('scraper_schedules').create(body: schedule.toMap());
    } catch (e) {
      throw ServerException(message: 'Failed to save schedule: $e');
    }
  }

  /// Toggle schedule active status
  Future<void> toggleSchedule(String scheduleId, bool isActive) async {
    try {
      await _pb.collection('scraper_schedules').update(scheduleId, body: {'isActive': isActive});
    } catch (e) {
      throw ServerException(message: 'Failed to toggle schedule: $e');
    }
  }

  /// Delete a schedule
  Future<void> deleteSchedule(String scheduleId) async {
    try {
      await _pb.collection('scraper_schedules').delete(scheduleId);
    } catch (e) {
      throw ServerException(message: 'Failed to delete schedule: $e');
    }
  }

  // ─── Scraper Logs ───

  /// Get recent logs
  Stream<List<ScraperLog>> watchLogs({int limit = 20}) =>
      _watchCol(collection: 'scraper_logs', fetch: () => _fetchLogs(limit: limit));

  Future<List<ScraperLog>> _fetchLogs({int limit = 20}) async {
    final result = await _pb.collection('scraper_logs').getList(
      page: 1, perPage: limit,
      sort: '-startedAt',
    );
    return result.items.map(ScraperLog.fromPb).toList();
  }

  /// Get logs for a specific source/brand
  Future<List<ScraperLog>> getLogsForSource(String sourceId, {int limit = 10}) async {
    try {
      final result = await _pb.collection('scraper_logs').getList(
        page: 1, perPage: limit,
        filter: 'sourceId = "$sourceId"',
        sort: '-startedAt',
      );
      return result.items.map(ScraperLog.fromPb).toList();
    } catch (e) {
      throw ServerException(message: 'Failed to get logs: $e');
    }
  }

  // ─── Category Templates ───

  /// Get all category templates
  Stream<List<CategoryTemplate>> watchCategoryTemplates() =>
      _watchCol(collection: 'category_templates', fetch: _fetchCategoryTemplates);

  Future<List<CategoryTemplate>> _fetchCategoryTemplates() async {
    final result = await _pb.collection('category_templates').getFullList();
    return result.map(CategoryTemplate.fromPb).toList();
  }

  /// Get a specific category template
  Future<CategoryTemplate?> getCategoryTemplate(String categoryId) async {
    try {
      final record = await _pb.collection('category_templates').getOne(categoryId);
      return CategoryTemplate.fromPb(record);
    } catch (e) {
      return null;
    }
  }

  /// Save category template
  Future<void> saveCategoryTemplate(CategoryTemplate template) async {
    try {
      if (template.id.isNotEmpty) {
        try {
          await _pb.collection('category_templates').update(template.id, body: template.toMap());
          return;
        } catch (_) {}
      }
      await _pb.collection('category_templates').create(body: template.toMap());
    } catch (e) {
      throw ServerException(message: 'Failed to save category template: $e');
    }
  }

  // ─── Subscription Services ───

  /// Get all subscription services
  Stream<List<StreamingService>> watchStreamingServices() =>
      _watchCol(collection: 'subscription_services', fetch: _fetchStreamingServices);

  Future<List<StreamingService>> _fetchStreamingServices() async {
    final result = await _pb.collection('subscription_services').getFullList(sort: 'category');
    return result.map(StreamingService.fromPb).toList();
  }

  /// Get services by category
  Future<List<StreamingService>> getServicesByCategory(String category) async {
    try {
      final result = await _pb.collection('subscription_services').getFullList(
        filter: 'category = "$category"',
      );
      return result.map(StreamingService.fromPb).toList();
    } catch (e) {
      throw ServerException(message: 'Failed to get services: $e');
    }
  }

  /// Save subscription service
  Future<void> saveStreamingService(StreamingService service) async {
    try {
      if (service.id.isNotEmpty) {
        try {
          await _pb.collection('subscription_services').update(service.id, body: service.toMap());
          return;
        } catch (_) {}
      }
      await _pb.collection('subscription_services').create(body: service.toMap());
    } catch (e) {
      throw ServerException(message: 'Failed to save service: $e');
    }
  }

  /// Delete subscription service
  Future<void> deleteStreamingService(String serviceId) async {
    try {
      await _pb.collection('subscription_services').delete(serviceId);
    } catch (e) {
      throw ServerException(message: 'Failed to delete service: $e');
    }
  }

  // ─── Scraper Operations (stubbed — to be implemented as PB hooks) ───

  /// Run scraper
  Future<ScraperResult> runScraper({
    String? sourceId,
    String? brandId,
    String? categoryId,
    int maxDevices = 50,
  }) async {
    // TODO: Implement via PocketBase custom endpoint or external service
    return ScraperResult(success: false, found: 0, added: 0, skipped: 0, errors: 0);
  }

  /// Scrape a single URL
  Future<ScrapedProduct> scrapeUrl(String url) async {
    // TODO: Implement via PocketBase custom endpoint
    return ScrapedProduct(success: false, name: '', source: '', sourceUrl: url);
  }

  /// Get scraper status
  Future<ScraperStatus> getStatus() async {
    try {
      final products = await _pb.collection('products').getList(page: 1, perPage: 1);
      final sources = await _pb.collection('scraper_sources').getFullList();
      final activeBrands = await _pb.collection('scraper_brands').getFullList(
        filter: 'isActive = true',
      );
      return ScraperStatus(
        totalProducts: products.totalItems,
        activeSources: sources.length,
        activeBrands: activeBrands.length,
        recentLogs: [],
      );
    } catch (e) {
      return ScraperStatus(totalProducts: 0, activeSources: 0, activeBrands: 0, recentLogs: []);
    }
  }

  /// Initialize default scraper data
  Future<void> initializeDefaultData() async {
    // TODO: Implement default data seeding for PocketBase
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
