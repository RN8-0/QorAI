/// Qor AI — PocketBase Data Source
/// firebase_ds.dart'ın birebir PocketBase karşılığı.
/// Tüm metod imzaları korundu; Firestore-spesifik tipler kaldırıldı.
library;

import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:pocketbase/pocketbase.dart';
import 'package:dio/dio.dart';
import 'package:qor_ai/core/pb_client.dart';
import 'package:qor_ai/core/constants.dart';
import 'package:qor_ai/core/errors.dart';
import 'package:qor_ai/core/search_ranking.dart';
import 'package:qor_ai/core/product_filter.dart';
import 'package:qor_ai/data/models/user_model.dart';
import 'package:qor_ai/data/models/product_model.dart';
import 'package:qor_ai/data/models/comparison_model.dart';
import 'package:qor_ai/data/models/other_models.dart';
import 'package:qor_ai/data/models/chat_conversation.dart';

class PbDataSource {
  static const bool _verboseTypesenseLogs = false;
  final PocketBase _pb;
  late final Dio _dio;
  bool _realtimeUnsupported = false;
  bool _notificationsRealtimeUnsupported = false;
  bool _publicConfigUnsupported = false;
  static const _savedAnalysesCollection = 'saved_analyses';
  static const _linkHistoryCategory = 'link_history';
  static const _subscriptionHistoryCategory = 'subscription_history';

  // ─── Local search result cache (recent queries, max 30, 5 min TTL) ───
  static final Map<String, ({List<ProductModel> results, DateTime time})>
  _searchResultCache = {};
  static const _searchResultCacheTtl = Duration(minutes: 5);
  static const _searchResultCacheMaxSize = 30;

  // Lean field projection for product list queries (feed/grid cards).
  // Excludes heavy fields (specs, specSections, keySpecs, description,
  // affiliateLinks, images[], pros, cons) — detail view refetches via getOne().
  static const _productListFields =
      'id,collectionId,collectionName,created,updated,'
      'name,brand,category,subcategory,'
      'imageUrl,imageURL,techScore,trendScore,techSubscores,'
      'price_segment,priceRange,prices,tags,ratings,'
      'isActive,variantGroup,scrapedAt,lastUpdated';

  PbDataSource({PocketBase? client}) : _pb = client ?? pb {
    _dio = Dio(
      BaseOptions(
        baseUrl: kTypesenseUrl,
        headers: {'X-TYPESENSE-API-KEY': kTypesenseApiKey},
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 15),
      ),
    );
  }

  static bool _isMissingCollectionContextError(Object error) {
    final text = error.toString().toLowerCase();
    return text.contains('missing collection context') ||
        (text.contains('statuscode: 404') &&
            text.contains('/api/collections/'));
  }

  static bool _isRealtimeUnsupportedError(Object error) {
    final text = error.toString().toLowerCase();
    return text.contains('missing or invalid client id') ||
        text.contains('missing collection context') ||
        text.contains('failed to establish sse connection') ||
        (text.contains('statuscode: 404') && text.contains('/api/realtime'));
  }

  static bool _isAccessDeniedError(Object error) {
    final text = error.toString().toLowerCase();
    return text.contains('only superusers can perform this action') ||
        text.contains('statuscode: 403') ||
        text.contains('forbidden');
  }

  Stream<T> _createRealtimeStream<T>({
    required String collection,
    String topic = '*',
    required Future<T> Function() load,
    bool Function(RecordSubscriptionEvent event)? shouldReload,
  }) {
    late final StreamController<T> controller;
    UnsubscribeFunc? unsubscribe;
    Timer? pollingTimer;

    Future<void> emitSnapshot() async {
      try {
        final data = await load();
        if (!controller.isClosed) {
          controller.add(data);
        }
      } catch (_) {
        // Snapshot read failures are ignored to keep stream stable.
      }
    }

    void startPolling() {
      pollingTimer?.cancel();
      pollingTimer = Timer.periodic(const Duration(seconds: 45), (_) {
        unawaited(emitSnapshot());
      });
    }

    controller = StreamController<T>(
      onListen: () {
        unawaited(() async {
          await emitSnapshot();

          if (_realtimeUnsupported) {
            startPolling();
            return;
          }

          try {
            unsubscribe = await _pb.collection(collection).subscribe(topic, (
              event,
            ) {
              if (shouldReload == null || shouldReload(event)) {
                unawaited(emitSnapshot());
              }
            });
          } catch (error) {
            if (_isRealtimeUnsupportedError(error)) {
              _realtimeUnsupported = true;
              debugPrint(
                '[PbDs] realtime unavailable for "$collection", polling fallback enabled',
              );
            }
            startPolling();
          }
        }());
      },
      onCancel: () async {
        try {
          pollingTimer?.cancel();
          await unsubscribe?.call();
        } catch (_) {}
      },
    );

    return controller.stream;
  }

  // ────────────────────────────────────────────────────────────────────────
  // ─── USERS ───
  // ────────────────────────────────────────────────────────────────────────

  Future<UserModel?> getUser(String uid) async {
    try {
      final record = await _pb
          .collection(AppConstants.usersCollection)
          .getOne(uid);
      return UserModel.fromPb(record);
    } on ClientException catch (e) {
      if (e.statusCode == 404) return null;
      throw ServerException(message: 'User could not be retrieved: $e');
    } catch (e) {
      throw ServerException(message: 'User could not be retrieved: $e');
    }
  }

  Stream<UserModel?> watchUser(String uid) {
    return _createRealtimeStream<UserModel?>(
      collection: AppConstants.usersCollection,
      topic: uid,
      load: () => getUser(uid),
    );
  }

  Future<void> createUser(UserModel user) async {
    try {
      await _pb
          .collection(AppConstants.usersCollection)
          .create(body: {'id': user.uid, ...user.toMap()});
    } catch (e) {
      throw ServerException(message: 'User could not be created: $e');
    }
  }

  Future<void> updateUser(String uid, Map<String, dynamic> data) async {
    try {
      data.remove('updatedAt'); // PB auto-manages 'updated' field
      await _pb
          .collection(AppConstants.usersCollection)
          .update(uid, body: data);
    } catch (e) {
      throw ServerException(message: 'User could not be updated: $e');
    }
  }

  Future<bool> toggleFavorite(String uid, String productId) async {
    final user = await getUser(uid);
    final favorites = List<String>.from(user?.favorites ?? []);
    final isFav = favorites.contains(productId);
    if (isFav) {
      favorites.remove(productId);
    } else {
      favorites.add(productId);
    }
    await _pb
        .collection(AppConstants.usersCollection)
        .update(uid, body: {'favorites': favorites});
    return !isFav;
  }

  // ─── Recently Viewed ───

  Future<void> addRecentlyViewed(String uid, String productId) async {
    try {
      // Delete any existing record for this product to avoid duplicates,
      // then re-create so it sorts to the top (-created order).
      final existing = await _pb
          .collection('recently_viewed')
          .getList(
            page: 1,
            perPage: 50,
            filter: 'userId = "$uid" && productId = "$productId"',
          );
      for (final record in existing.items) {
        await _pb.collection('recently_viewed').delete(record.id);
      }
      await _pb
          .collection('recently_viewed')
          .create(body: {'userId': uid, 'productId': productId});
    } catch (_) {}
  }

  Future<List<String>> getRecentlyViewed(String uid) async {
    try {
      final result = await _pb
          .collection('recently_viewed')
          .getList(
            page: 1,
            perPage: 50,
            filter: 'userId = "$uid"',
            sort: '-created',
          );
      // Deduplicate in case stale duplicates exist in the DB.
      final seen = <String>{};
      return result.items
          .map((r) => r.data['productId'] as String)
          .where((id) => seen.add(id))
          .toList();
    } catch (_) {
      return [];
    }
  }

  Stream<List<String>> watchRecentlyViewed(String uid) {
    return _createRealtimeStream<List<String>>(
      collection: 'recently_viewed',
      load: () => getRecentlyViewed(uid),
      shouldReload: (event) => event.record?.data['userId'] == uid,
    );
  }

  // ─── User Activity Arrays (stored in user document) ───

  Future<void> _appendUserArray(
    String uid,
    String field,
    Map<String, dynamic> entry,
  ) async {
    try {
      final user = await _pb
          .collection(AppConstants.usersCollection)
          .getOne(uid);
      final existing = List<dynamic>.from(user.data[field] ?? []);
      existing.add(entry);
      await _pb
          .collection(AppConstants.usersCollection)
          .update(uid, body: {field: existing});
    } catch (e) {
      debugPrint('[PB] _appendUserArray($field) failed: $e');
    }
  }

  Future<void> saveQuizHistory(String uid, Map<String, dynamic> entry) async =>
      _appendUserArray(uid, 'quizHistory', entry);

  Future<void> saveAnalyzedProduct(
    String uid,
    Map<String, dynamic> entry,
  ) async => _appendUserArray(uid, 'analyzedProducts', entry);

  Future<void> saveSearchHistory(
    String uid,
    Map<String, dynamic> entry,
  ) async => _appendUserArray(uid, 'searchHistory', entry);

  Future<void> saveSubscriptionHistory(
    String uid,
    Map<String, dynamic> entry,
  ) async {
    try {
      final services = (entry['services'] as List?)?.cast<String>() ?? const [];
      final rawScores = entry['scores'];
      final scores = rawScores is Map
          ? rawScores.map((key, value) => MapEntry(key.toString(), value))
          : const <String, dynamic>{};
      final winner = entry['winner']?.toString();
      final aiScore = winner != null
          ? (scores[winner] as num?)?.toDouble()
          : scores.values
                    .whereType<num>()
                    .map((value) => value.toDouble())
                    .fold<double>(0, (sum, value) => sum + value) /
                (scores.isEmpty ? 1 : scores.length);
      final normalizedScore = (aiScore ?? 0).isFinite ? (aiScore ?? 0) : 0;

      await _pb
          .collection(_savedAnalysesCollection)
          .create(
            body: {
              'userId': uid,
              'title': services.join(' vs '),
              'category': _subscriptionHistoryCategory,
              'analysisData': {...entry, 'type': 'subscription'},
              'aiScore': normalizedScore,
              'aiSummary': (entry['analysisResult'] as String? ?? '').substring(
                0,
                (entry['analysisResult'] as String? ?? '').length.clamp(
                  0,
                  5000,
                ),
              ),
              'savedAt':
                  entry['timestamp'] as String? ??
                  DateTime.now().toIso8601String(),
            },
          );
    } catch (e) {
      debugPrint('[PB] saveSubscriptionHistory failed: $e');
    }
  }

  Future<void> updateSubscriptionHistory(
    String uid,
    List<Map<String, dynamic>> history,
  ) async {
    try {
      await _replaceSavedHistory(
        uid: uid,
        category: _subscriptionHistoryCategory,
        history: history,
        saveEntry: saveSubscriptionHistory,
      );
    } catch (e) {
      debugPrint('[PB] updateSubscriptionHistory failed: $e');
    }
  }

  Future<List<Map<String, dynamic>>> getSubscriptionHistory(String uid) async {
    try {
      final result = await _pb
          .collection(_savedAnalysesCollection)
          .getList(
            page: 1,
            perPage: 50,
            filter:
                'userId = "$uid" && category = "$_subscriptionHistoryCategory"',
            sort: '-savedAt,-created',
          );
      return result.items.map(_mapSubscriptionHistoryRecord).take(20).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> saveLinkAnalysisHistory(
    String uid,
    Map<String, dynamic> entry,
  ) async {
    try {
      final title =
          entry['title'] as String? ??
          entry['productName'] as String? ??
          ((entry['products'] as List?)?.cast<String>() ?? const []).join(
            ' vs ',
          );
      final summary =
          entry['analysis'] as String? ??
          ((entry['result'] as Map<String, dynamic>?)?['detailedVerdict']
              as String?) ??
          '';
      final score = (entry['score'] as num?)?.toDouble() ?? 0.0;

      await _pb
          .collection(_savedAnalysesCollection)
          .create(
            body: {
              'userId': uid,
              'url': entry['url'] as String? ?? '',
              'title': title,
              'category': _linkHistoryCategory,
              'analysisData': {...entry, 'type': entry['type'] ?? 'single'},
              'aiScore': score,
              'aiSummary': summary.substring(0, summary.length.clamp(0, 5000)),
              'savedAt':
                  entry['timestamp'] as String? ??
                  DateTime.now().toIso8601String(),
            },
          );
    } catch (e) {
      debugPrint('[PB] saveLinkAnalysisHistory failed: $e');
    }
  }

  Future<void> updateLinkAnalysisHistory(
    String uid,
    List<Map<String, dynamic>> history,
  ) async {
    try {
      await _replaceSavedHistory(
        uid: uid,
        category: _linkHistoryCategory,
        history: history,
        saveEntry: saveLinkAnalysisHistory,
      );
    } catch (e) {
      debugPrint('[PB] updateLinkAnalysisHistory failed: $e');
    }
  }

  Future<List<Map<String, dynamic>>> getLinkAnalysisHistory(String uid) async {
    try {
      final result = await _pb
          .collection(_savedAnalysesCollection)
          .getList(
            page: 1,
            perPage: 50,
            filter: 'userId = "$uid" && category = "$_linkHistoryCategory"',
            sort: '-savedAt,-created',
          );
      return result.items.map(_mapLinkHistoryRecord).take(30).toList();
    } catch (_) {
      return [];
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // ─── PRODUCTS ───
  // ────────────────────────────────────────────────────────────────────────

  Future<ProductModel?> getProduct(String id) async {
    try {
      final record = await _pb
          .collection(AppConstants.productsCollection)
          .getOne(id)
          .timeout(const Duration(seconds: 20));
      return ProductModel.fromPb(record);
    } on ClientException catch (e) {
      if (e.statusCode == 404) return null;
      throw ServerException(message: 'Product could not be retrieved: $e');
    } catch (e) {
      throw ServerException(message: 'Product could not be retrieved: $e');
    }
  }

  Future<List<ProductModel>> getProducts({
    String? category,
    String? subcategory,
    int limit = 20,
    String orderBy = 'name',
    bool descending = false,
    bool activeOnly = false,
  }) async {
    try {
      final filters = <String>[];
      if (category != null) filters.add('category = "$category"');
      if (subcategory != null) filters.add('subcategory = "$subcategory"');
      if (activeOnly) filters.add('isActive = true');

      final sortField = (orderBy == 'trendScore' || orderBy == 'techScore')
          ? orderBy
          : 'name';
      final sortDir = descending ? '-' : '';
      final sort = '$sortDir$sortField';

      final result = await _pb
          .collection(AppConstants.productsCollection)
          .getList(
            page: 1,
            perPage: limit,
            filter: filters.isEmpty ? '' : filters.join(' && '),
            sort: sort,
            fields: _productListFields,
          )
          .timeout(const Duration(seconds: 30));

      return result.items
          .map((r) {
            try {
              return ProductModel.fromPb(r);
            } catch (e) {
              debugPrint('=== QOR AI: fromPb FAILED for ${r.id}: $e ===');
              return null;
            }
          })
          .whereType<ProductModel>()
          .toList();
    } catch (e, st) {
      debugPrint('=== QOR AI: getProducts ERROR: $e\n$st ===');
      throw ServerException(message: 'Products could not be retrieved: $e');
    }
  }

  /// Paginated products — returns nextPage integer instead of DocumentSnapshot.
  Future<({List<ProductModel> products, int nextPage, bool hasMore})>
  getProductsPage({
    required String category,
    int limit = 200,
    int page = 1,
  }) async {
    final result = await _getProductsPageForCategory(
      category,
      limit: limit,
      page: page,
    );
    if (result.products.isNotEmpty) return result;

    // Variant fallback
    final lower = category.toLowerCase().trim();
    final variants = <String>{};
    if (lower != category) variants.add(lower);
    if (lower.endsWith('s')) {
      variants.add(lower.substring(0, lower.length - 1));
    } else {
      variants.add('${lower}s');
    }
    if (lower.isNotEmpty) {
      final cap = lower[0].toUpperCase() + lower.substring(1);
      if (cap != category) variants.add(cap);
    }
    if (variants.isEmpty) {
      return (products: <ProductModel>[], nextPage: page + 1, hasMore: false);
    }

    for (final v in variants) {
      final r = await _getProductsPageForCategory(v, limit: limit, page: page);
      if (r.products.isNotEmpty) return r;
    }
    return (products: <ProductModel>[], nextPage: page + 1, hasMore: false);
  }

  Future<({List<ProductModel> products, int nextPage, bool hasMore})>
  _getProductsPageForCategory(
    String category, {
    int limit = 200,
    int page = 1,
  }) async {
    try {
      final sw = Stopwatch()..start();
      final result = await _pb
          .collection(AppConstants.productsCollection)
          .getList(
            page: page,
            perPage: limit,
            filter: 'category = "$category"',
            fields: _productListFields,
          )
          .timeout(const Duration(seconds: 30));
      sw.stop();
      debugPrint(
        '=== QOR AI: getProductsPage cat=$category limit=$limit page=$page → ${result.items.length} docs in ${sw.elapsedMilliseconds}ms ===',
      );

      final products = result.items
          .map((r) {
            try {
              return ProductModel.fromPb(r);
            } catch (_) {
              return null;
            }
          })
          .whereType<ProductModel>()
          .toList();

      final hasMore = (page * limit) < result.totalItems;
      return (products: products, nextPage: page + 1, hasMore: hasMore);
    } catch (e, st) {
      debugPrint(
        '=== QOR AI: getProductsPage ERROR cat=$category: $e\n$st ===',
      );
      return (products: <ProductModel>[], nextPage: page + 1, hasMore: false);
    }
  }

  Future<void> incrementProductViewCount(String productId) async {
    try {
      final authRecord = _pb.authStore.record;
      if (authRecord == null || authRecord.collectionName != '_superusers') {
        return;
      }
      final record = await _pb
          .collection(AppConstants.productsCollection)
          .getOne(productId);
      final viewCount = (record.data['viewCount'] as num?)?.toInt() ?? 0;
      await _pb
          .collection(AppConstants.productsCollection)
          .update(productId, body: {'viewCount': viewCount + 1});
    } catch (e) {
      debugPrint('=== QOR AI: incrementViewCount failed: $e ===');
    }
  }

  Future<List<ProductModel>> getProductsByIds(List<String> ids) async {
    if (ids.isEmpty) return [];
    try {
      // PocketBase supports `id IN (id1, id2, ...)` filter
      final chunks = _chunkList(ids, 50);
      final results = <ProductModel>[];
      for (final chunk in chunks) {
        final idList = chunk.map((id) => '"$id"').join(',');
        final result = await _pb
            .collection(AppConstants.productsCollection)
            .getList(page: 1, perPage: chunk.length, filter: 'id IN ($idList)')
            .timeout(const Duration(seconds: 15));
        results.addAll(result.items.map(ProductModel.fromPb));
      }
      return results;
    } catch (e) {
      throw ServerException(message: 'Products could not be retrieved: $e');
    }
  }

  Future<void> deleteProduct(String id) async {
    try {
      await _pb.collection(AppConstants.productsCollection).delete(id);
    } catch (e) {
      throw ServerException(message: 'Product could not be deleted: $e');
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // ─── COMPARISONS ───
  // ────────────────────────────────────────────────────────────────────────

  Future<String> createComparison(ComparisonModel comparison) async {
    try {
      final collection = _pb.collection(AppConstants.comparisonsCollection);
      final nowIso = comparison.createdAt.toUtc().toIso8601String();
      final duplicateId = await _findDuplicateComparisonRecordId(
        userId: comparison.userId,
        itemIds: comparison.itemIds,
      );

      late final String recordId;
      if (duplicateId != null) {
        final existingRecord = await collection.getOne(duplicateId);
        final existingNotes = existingRecord.data['notes'] is Map
            ? Map<String, dynamic>.from(existingRecord.data['notes'] as Map)
            : <String, dynamic>{};
        final currentCount =
            (existingNotes['occurrenceCount'] as num?)?.toInt() ?? 1;
        final createdValue = existingRecord.getStringValue('created');
        final firstComparedAt =
            existingNotes['firstComparedAt']?.toString() ??
            existingNotes['createdAt']?.toString() ??
            (createdValue.isNotEmpty ? createdValue : nowIso);

        await collection.update(
          duplicateId,
          body: {
            'userId': comparison.userId,
            'productIds': comparison.itemIds,
            'title': comparison.title?.trim().isNotEmpty == true
                ? comparison.title
                : existingRecord.data['title'],
            'notes': {
              'category': comparison.category,
              'winnerId': comparison.winnerId,
              'aiAnalysis': comparison.aiAnalysis,
              'createdAt': firstComparedAt,
              'firstComparedAt': firstComparedAt,
              'lastComparedAt': nowIso,
              'occurrenceCount': currentCount + 1,
            },
            'isShared': comparison.isPublic,
            'shareCode': duplicateId,
          },
        );
        recordId = duplicateId;
      } else {
        final record = await collection.create(
          body: {
            'userId': comparison.userId,
            'productIds': comparison.itemIds,
            'title': comparison.title,
            'notes': {
              'category': comparison.category,
              'winnerId': comparison.winnerId,
              'aiAnalysis': comparison.aiAnalysis,
              'createdAt': nowIso,
              'firstComparedAt': nowIso,
              'lastComparedAt': nowIso,
              'occurrenceCount': comparison.occurrenceCount,
            },
            'isShared': comparison.isPublic,
            'shareCode': comparison.id,
          },
        );
        recordId = record.id;
      }

      final user = await _pb
          .collection(AppConstants.usersCollection)
          .getOne(comparison.userId);

      // Increment user comparison count
      final count = (user.data['comparisonsCount'] as num?)?.toInt() ?? 0;
      await _pb
          .collection(AppConstants.usersCollection)
          .update(comparison.userId, body: {'comparisonsCount': count + 1});
      return recordId;
    } catch (e) {
      throw ServerException(message: 'Comparison could not be created: $e');
    }
  }

  Future<List<ComparisonModel>> getUserComparisons(
    String userId, {
    int limit = 20,
    int page = 1,
  }) async {
    try {
      final comparisons = <ComparisonModel>[];

      try {
        final result = await _pb
            .collection(AppConstants.comparisonsCollection)
            .getList(
              page: page,
              perPage: limit,
              filter: 'userId = "$userId"',
              sort: '-updated',
            )
            .timeout(const Duration(seconds: 15));
        comparisons.addAll(
          result.items.map(ComparisonModel.fromPb).where(_isValidComparison),
        );
      } catch (e) {
        debugPrint('[PB] getUserComparisons collection fallback: $e');
      }

      final historyComparisons = await _getUserComparisonsFromHistory(
        userId,
        limit: limit,
      );
      comparisons.addAll(historyComparisons.where(_isValidComparison));

      final merged = _mergeComparisons(comparisons, limit: limit);
      if (merged.isNotEmpty) {
        return merged;
      }

      return const <ComparisonModel>[];
    } catch (e) {
      try {
        return await _getUserComparisonsFromHistory(userId, limit: limit);
      } catch (_) {
        throw ServerException(
          message: 'Comparisons could not be retrieved: $e',
        );
      }
    }
  }

  Future<List<ComparisonModel>> _getUserComparisonsFromHistory(
    String userId, {
    int limit = 20,
  }) async {
    final user = await _pb
        .collection(AppConstants.usersCollection)
        .getOne(userId);
    final rawHistory = user.data['comparisonHistory'];
    final history = _parseHistoryEntries(
      rawHistory is List ? rawHistory : null,
    );

    return history
        .take(limit)
        .map((entry) => _comparisonFromHistoryEntry(userId, entry))
        .where(_isValidComparison)
        .toList();
  }

  List<Map<String, dynamic>> _parseHistoryEntries(List? rawEntries) {
    if (rawEntries == null || rawEntries.isEmpty) {
      return const <Map<String, dynamic>>[];
    }

    final entries = <Map<String, dynamic>>[];
    for (final rawEntry in rawEntries) {
      final parsed = _normalizeHistoryEntry(rawEntry);
      if (parsed != null) {
        entries.add(parsed);
      }
    }
    return entries;
  }

  Map<String, dynamic>? _normalizeHistoryEntry(dynamic rawEntry) {
    if (rawEntry is Map) {
      return Map<String, dynamic>.from(rawEntry);
    }

    if (rawEntry is String && rawEntry.trim().isNotEmpty) {
      try {
        final decoded = jsonDecode(rawEntry);
        if (decoded is Map) {
          return Map<String, dynamic>.from(decoded);
        }
      } catch (_) {}
    }

    return null;
  }

  ComparisonModel _comparisonFromHistoryEntry(
    String userId,
    Map<String, dynamic> entry,
  ) {
    final rawIds = entry['productIds'] ?? entry['items'] ?? const <dynamic>[];
    final itemIds = rawIds is List ? List<String>.from(rawIds) : <String>[];

    return ComparisonModel(
      id:
          (entry['comparisonId'] as String?) ??
          (entry['id'] as String?) ??
          '${entry['createdAt'] ?? DateTime.now().toIso8601String()}_${itemIds.join('_')}',
      userId: (entry['userId'] as String?) ?? userId,
      itemIds: itemIds,
      title: entry['title'] as String?,
      category: (entry['category'] as String?) ?? '',
      winnerId: entry['winnerId'] as String?,
      aiAnalysis: (entry['aiAnalysis'] as String?) ?? '',
      createdAt:
          DateTime.tryParse((entry['lastComparedAt'] as String?) ?? '') ??
          DateTime.tryParse((entry['createdAt'] as String?) ?? '') ??
          DateTime.now(),
      occurrenceCount:
          (entry['occurrenceCount'] as num?)?.toInt() ??
          (entry['compareCount'] as num?)?.toInt() ??
          (entry['count'] as num?)?.toInt() ??
          1,
    );
  }

  bool _isValidComparison(ComparisonModel comparison) {
    return comparison.itemIds.length >= 2;
  }

  List<ComparisonModel> _mergeComparisons(
    List<ComparisonModel> comparisons, {
    required int limit,
  }) {
    final merged = <ComparisonModel>[];
    final sorted = [...comparisons]
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));

    for (final comparison in sorted) {
      final existingIndex = merged.indexWhere(
        (existing) => _shouldCollapseDuplicate(existing, comparison),
      );

      if (existingIndex == -1) {
        merged.add(comparison);
        continue;
      }

      final existing = merged[existingIndex];
      final totalCount = existing.occurrenceCount + comparison.occurrenceCount;
      final preferred = existing.createdAt.isAfter(comparison.createdAt)
          ? existing
          : comparison;
      final fallback = identical(preferred, existing) ? comparison : existing;
      merged[existingIndex] = _copyComparison(
        preferred,
        occurrenceCount: totalCount,
        title: (preferred.title?.trim().isNotEmpty ?? false)
            ? preferred.title
            : fallback.title,
      );
    }

    if (merged.length <= limit) {
      return merged;
    }
    return merged.take(limit).toList();
  }

  bool _shouldCollapseDuplicate(
    ComparisonModel existing,
    ComparisonModel candidate,
  ) {
    return _normalizedComparisonKey(existing.itemIds) ==
        _normalizedComparisonKey(candidate.itemIds);
  }

  ComparisonModel _copyComparison(
    ComparisonModel source, {
    int? occurrenceCount,
    String? title,
  }) {
    return ComparisonModel(
      id: source.id,
      userId: source.userId,
      itemIds: source.itemIds,
      scores: source.scores,
      aiAnalysis: source.aiAnalysis,
      winnerId: source.winnerId,
      userChoiceId: source.userChoiceId,
      category: source.category,
      createdAt: source.createdAt,
      isPublic: source.isPublic,
      title: title ?? source.title,
      isFeatured: source.isFeatured,
      isPredefined: source.isPredefined,
      occurrenceCount: occurrenceCount ?? source.occurrenceCount,
    );
  }

  Future<String?> _findDuplicateComparisonRecordId({
    required String userId,
    required List<String> itemIds,
  }) async {
    final normalizedKey = _normalizedComparisonKey(itemIds);
    try {
      final result = await _pb
          .collection(AppConstants.comparisonsCollection)
          .getList(
            page: 1,
            perPage: 100,
            filter: 'userId = "$userId"',
            sort: '-updated',
          )
          .timeout(const Duration(seconds: 15));
      for (final record in result.items) {
        final data = Map<String, dynamic>.from(record.data);
        final rawIds = data['productIds'] ?? data['items'] ?? const <dynamic>[];
        final comparisonIds = rawIds is List
            ? List<String>.from(rawIds)
            : <String>[];
        if (_normalizedComparisonKey(comparisonIds) == normalizedKey) {
          return record.id;
        }
      }
    } catch (e) {
      debugPrint('[PB] duplicate comparison lookup failed: $e');
    }
    return null;
  }

  String _normalizedComparisonKey(List<String> itemIds) {
    final normalized =
        itemIds.map((id) => id.trim()).where((id) => id.isNotEmpty).toList()
          ..sort();
    return normalized.join('|');
  }

  Future<List<ComparisonModel>> getPredefinedComparisons({
    String? category,
    int limit = 10,
  }) async {
    try {
      final filters = ['isPredefined = true', 'isActive = true'];
      if (category != null) filters.add('category = "$category"');
      final result = await _pb
          .collection(AppConstants.comparisonsCollection)
          .getList(
            page: 1,
            perPage: limit,
            filter: filters.join(' && '),
            sort: '-updated',
          )
          .timeout(const Duration(seconds: 15));
      return result.items.map(ComparisonModel.fromPb).toList();
    } catch (e) {
      throw ServerException(
        message: 'Predefined comparisons could not be retrieved: $e',
      );
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // ─── CATEGORIES ───
  // ────────────────────────────────────────────────────────────────────────

  Future<List<CategoryModel>> getCategories() async {
    try {
      final result = await _pb
          .collection(AppConstants.categoriesCollection)
          .getList(page: 1, perPage: 100, sort: 'order')
          .timeout(const Duration(seconds: 10));
      return result.items.map((r) => CategoryModel.fromPb(r)).toList();
    } catch (e) {
      throw ServerException(message: 'Categories could not be retrieved: $e');
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // ─── TRENDS ───
  // ────────────────────────────────────────────────────────────────────────

  Future<List<TrendModel>> getTrends({
    required String country,
    String? category,
  }) async {
    try {
      final filters = ['country = "$country"'];
      if (category != null) filters.add('category = "$category"');
      final result = await _pb
          .collection(AppConstants.trendsCollection)
          .getList(
            page: 1,
            perPage: 1,
            filter: filters.join(' && '),
            sort: '-weekStart',
          )
          .timeout(const Duration(seconds: 10));
      return result.items.map((r) => TrendModel.fromPb(r)).toList();
    } catch (e) {
      throw ServerException(message: 'Trend data could not be retrieved: $e');
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // ─── REVIEWS ───
  // ────────────────────────────────────────────────────────────────────────

  Future<List<ReviewModel>> getProductReviews(
    String productId, {
    int limit = 20,
  }) async {
    try {
      final result = await _pb
          .collection(AppConstants.reviewsCollection)
          .getList(
            page: 1,
            perPage: limit,
            filter: 'productId = "$productId"',
            sort: '-created',
          )
          .timeout(const Duration(seconds: 10));
      return result.items.map((r) => ReviewModel.fromPb(r)).toList();
    } catch (e) {
      throw ServerException(message: 'Reviews could not be retrieved: $e');
    }
  }

  Future<void> createReview(ReviewModel review) async {
    try {
      await _pb
          .collection(AppConstants.reviewsCollection)
          .create(body: review.toMap());
    } catch (e) {
      throw ServerException(message: 'Review could not be created: $e');
    }
  }

  Future<void> deleteReview(String reviewId) async {
    await _pb.collection(AppConstants.reviewsCollection).delete(reviewId);
  }

  Future<void> toggleReviewLike(String reviewId, String userId) async {
    final record = await _pb
        .collection(AppConstants.reviewsCollection)
        .getOne(reviewId);
    final liked = List<String>.from(record.data['likedBy'] ?? []);
    final disliked = List<String>.from(record.data['dislikedBy'] ?? []);
    if (liked.contains(userId)) {
      liked.remove(userId);
    } else {
      liked.add(userId);
      disliked.remove(userId);
    }
    await _pb
        .collection(AppConstants.reviewsCollection)
        .update(reviewId, body: {'likedBy': liked, 'dislikedBy': disliked});
  }

  Future<void> toggleReviewDislike(String reviewId, String userId) async {
    final record = await _pb
        .collection(AppConstants.reviewsCollection)
        .getOne(reviewId);
    final liked = List<String>.from(record.data['likedBy'] ?? []);
    final disliked = List<String>.from(record.data['dislikedBy'] ?? []);
    if (disliked.contains(userId)) {
      disliked.remove(userId);
    } else {
      disliked.add(userId);
      liked.remove(userId);
    }
    await _pb
        .collection(AppConstants.reviewsCollection)
        .update(reviewId, body: {'likedBy': liked, 'dislikedBy': disliked});
  }

  Stream<List<ReviewModel>> watchProductReviews(
    String productId, {
    int limit = 30,
  }) {
    return _createRealtimeStream<List<ReviewModel>>(
      collection: AppConstants.reviewsCollection,
      load: () => getProductReviews(productId, limit: limit),
      shouldReload: (event) => event.record?.data['productId'] == productId,
    );
  }

  Stream<List<ReviewModel>> watchUserReviews(String userId, {int limit = 50}) {
    return _createRealtimeStream<List<ReviewModel>>(
      collection: AppConstants.reviewsCollection,
      load: () async {
        final result = await _pb
            .collection(AppConstants.reviewsCollection)
            .getList(
              page: 1,
              perPage: limit,
              filter: 'userId = "$userId"',
              sort: '-created',
            );
        return result.items.map(ReviewModel.fromPb).toList();
      },
      shouldReload: (event) => event.record?.data['userId'] == userId,
    );
  }

  // ─── Review Replies (sub-table via replies collection) ───

  Stream<List<Map<String, dynamic>>> watchReviewReplies(
    String collectionSource,
    String reviewId,
  ) {
    if (collectionSource.isEmpty) {
      debugPrint('[PB] watchReviewReplies called without collection source');
    }
    return _createRealtimeStream<List<Map<String, dynamic>>>(
      collection: 'review_replies',
      load: () => _fetchReplies(reviewId),
      shouldReload: (event) => event.record?.data['reviewId'] == reviewId,
    );
  }

  Future<List<Map<String, dynamic>>> _fetchReplies(String reviewId) async {
    final result = await _pb
        .collection('review_replies')
        .getList(
          page: 1,
          perPage: 100,
          filter: 'reviewId = "$reviewId"',
          sort: 'created',
        );
    return result.items.map((r) => {'id': r.id, ...r.data}).toList();
  }

  Future<void> addReviewReply({
    required String collection,
    required String reviewId,
    required String userId,
    required String displayName,
    required String text,
  }) async {
    await _pb
        .collection('review_replies')
        .create(
          body: {
            'reviewId': reviewId,
            'userId': userId,
            'displayName': displayName,
            'text': text,
          },
        );
  }

  Future<void> deleteReviewReply({
    required String collection,
    required String reviewId,
    required String replyId,
  }) async {
    await _pb.collection('review_replies').delete(replyId);
  }

  // ────────────────────────────────────────────────────────────────────────
  // ─── NOTIFICATIONS ───
  // ────────────────────────────────────────────────────────────────────────

  Future<void> createNotification({
    required String recipientId,
    required String senderId,
    required String senderName,
    required String type,
    required String title,
    required String body,
    String? referenceId,
  }) async {
    try {
      await _pb
          .collection('notifications')
          .create(
            body: {
              'recipientId': recipientId,
              'senderId': senderId,
              'senderName': senderName,
              'type': type,
              'title': title,
              'body': body,
              'referenceId': referenceId ?? '',
              'read': false,
            },
          );
    } catch (e) {
      debugPrint('[PbDs] createNotification error: $e');
    }
  }

  Future<ResultList<RecordModel>> _getListWithSortFallback({
    required String collection,
    required int page,
    required int perPage,
    String filter = '',
    String? sort,
  }) async {
    final service = _pb.collection(collection);
    try {
      return await service.getList(
        page: page,
        perPage: perPage,
        filter: filter,
        sort: sort,
      );
    } on ClientException catch (e) {
      final shouldRetryWithoutSort =
          sort != null &&
          sort.isNotEmpty &&
          e.statusCode == 400 &&
          (e.response['message']?.toString().toLowerCase().contains(
                'something went wrong while processing your request.',
              ) ??
              false);
      if (!shouldRetryWithoutSort) rethrow;
      return service.getList(page: page, perPage: perPage, filter: filter);
    }
  }

  Future<List<Map<String, dynamic>>> _fetchSupportReplyFallbacks(
    String userId,
  ) async {
    final result = await _getListWithSortFallback(
      collection: 'support_messages',
      page: 1,
      perPage: 50,
      filter:
          'userId = "$userId" && (status = "replied" || status = "admin_message")',
      sort: '-repliedAt',
    );

    return result.items
        .map((record) {
          final status = record.data['status']?.toString() ?? '';
          final body =
              (status == 'admin_message'
                      ? record.data['message']
                      : record.data['adminReply'])
                  ?.toString()
                  .trim() ??
              '';
          if (body.isEmpty) return null;
          final repliedAt = record.data['repliedAt']?.toString().trim() ?? '';
          return <String, dynamic>{
            'id': 'support_${record.id}',
            'read': true,
            'title':
                status == 'admin_message'
                    ? 'Qor AI Destek\'ten yeni mesaj'
                    : 'Mesajınıza yanıt geldi',
            'body': body,
            'senderName': 'Qor AI Destek',
            'referenceId': record.id,
            'type': 'system',
            'created': repliedAt,
            '_source': 'support_messages',
          };
        })
        .whereType<Map<String, dynamic>>()
        .toList();
  }

  static DateTime? _notificationTimestamp(Map<String, dynamic> item) {
    for (final key in const ['created', 'repliedAt', 'updated']) {
      final raw = item[key]?.toString().trim() ?? '';
      if (raw.isEmpty) continue;
      try {
        return DateTime.parse(raw);
      } catch (_) {}
    }
    return null;
  }

  List<Map<String, dynamic>> _mergeNotificationItems({
    required List<Map<String, dynamic>> notifications,
    required List<Map<String, dynamic>> supportFallbacks,
  }) {
    final referenceIds = notifications
        .map((item) => item['referenceId']?.toString().trim() ?? '')
        .where((value) => value.isNotEmpty)
        .toSet();
    final merged = <Map<String, dynamic>>[
      ...notifications,
      ...supportFallbacks.where(
        (item) => !referenceIds.contains(item['referenceId']),
      ),
    ];
    merged.sort((left, right) {
      final leftTime = _notificationTimestamp(left);
      final rightTime = _notificationTimestamp(right);
      if (leftTime == null && rightTime == null) return 0;
      if (leftTime == null) return 1;
      if (rightTime == null) return -1;
      return rightTime.compareTo(leftTime);
    });
    return merged;
  }

  Stream<List<Map<String, dynamic>>> watchNotifications(String userId) {
    final controller = StreamController<List<Map<String, dynamic>>>();
    bool cancelled = false;
    int backoffAttempts = 0;
    Timer? retryTimer;
    Timer? pollTimer;

    Future<List<Map<String, dynamic>>> fetch() async {
      final notifications = <Map<String, dynamic>>[];
      try {
        final notificationsResult = await _getListWithSortFallback(
          collection: 'notifications',
          page: 1,
          perPage: 50,
          filter: 'recipientId = "$userId"',
          sort: '-created',
        );
        notifications.addAll(
          notificationsResult.items.map((record) => {'id': record.id, ...record.data}),
        );
      } catch (e) {
        debugPrint('[PbDs] notifications fetch error: $e');
      }

      var supportFallbacks = <Map<String, dynamic>>[];
      try {
        supportFallbacks = await _fetchSupportReplyFallbacks(userId);
      } catch (e) {
        if (!_isAccessDeniedError(e)) {
          debugPrint('[PbDs] support fallback fetch error: $e');
        }
      }

      return _mergeNotificationItems(
        notifications: notifications,
        supportFallbacks: supportFallbacks,
      );
    }

    void scheduleRetry(void Function() attempt) {
      if (cancelled) return;
      backoffAttempts++;
      final delaySec = [2, 5, 15, 30, 60][backoffAttempts.clamp(1, 5) - 1];
      retryTimer?.cancel();
      retryTimer = Timer(Duration(seconds: delaySec), () {
        if (!cancelled) attempt();
      });
    }

    void startPollingFallback() {
      pollTimer?.cancel();
      pollTimer = Timer.periodic(const Duration(seconds: 45), (_) async {
        if (cancelled) return;
        final data = await fetch();
        if (!controller.isClosed) controller.add(data);
      });
    }

    Future<void> trySubscribe() async {
      if (cancelled) return;
      try {
        await _pb.collection('notifications').subscribe('*', (e) async {
          final data = await fetch();
          if (!controller.isClosed) controller.add(data);
        });
        try {
          await _pb.collection('support_messages').subscribe('*', (event) async {
            if (event.record?.data['userId']?.toString() != userId) return;
            final data = await fetch();
            if (!controller.isClosed) controller.add(data);
          });
        } catch (e) {
          if (!_isAccessDeniedError(e)) {
            debugPrint('[PbDs] support_messages subscribe error: $e');
          }
        }
        backoffAttempts = 0; // reset on success
      } catch (e) {
        final realtimeUnsupported = _isRealtimeUnsupportedError(e);
        if (realtimeUnsupported) {
          _notificationsRealtimeUnsupported = true;
          if (backoffAttempts == 0) {
            debugPrint(
              '[PbDs] realtime notifications unavailable, switching to polling fallback',
            );
          }
          startPollingFallback();
          return;
        }
        if (backoffAttempts == 0) {
          debugPrint('[PbDs] watchNotifications subscribe error: $e');
        }
        scheduleRetry(trySubscribe);
      }
    }

    // Initial fetch
    fetch().then((data) {
      if (!controller.isClosed) controller.add(data);
    });

    if (_notificationsRealtimeUnsupported || _realtimeUnsupported) {
      startPollingFallback();
    } else {
      // First subscribe attempt
      trySubscribe();
    }

    controller.onCancel = () {
      cancelled = true;
      retryTimer?.cancel();
      pollTimer?.cancel();
      _pb.collection('notifications').unsubscribe('*').catchError((_) {});
      _pb.collection('support_messages').unsubscribe('*').catchError((_) {});
    };

    return controller.stream;
  }

  Future<void> markNotificationRead(String notificationId) async {
    try {
      await _pb
          .collection('notifications')
          .update(notificationId, body: {'read': true});
    } catch (e) {
      debugPrint('[PbDs] markNotificationRead error: $e');
    }
  }

  Future<void> markAllNotificationsRead(String userId) async {
    try {
      final result = await _pb
          .collection('notifications')
          .getList(
            page: 1,
            perPage: 200,
            filter: 'recipientId = "$userId" && read = false',
          );
      for (final item in result.items) {
        await _pb
            .collection('notifications')
            .update(item.id, body: {'read': true});
      }
    } catch (e) {
      debugPrint('[PbDs] markAllNotificationsRead error: $e');
    }
  }

  Future<void> updateFcmToken(String userId, String fcmToken) async {
    try {
      await _pb
          .collection('users')
          .update(userId, body: {'fcmToken': fcmToken});
      debugPrint('[PbDs] FCM token updated for user $userId');
    } catch (e) {
      debugPrint('[PbDs] updateFcmToken error: $e');
    }
  }

  Future<void> sendSupportMessage({
    required String? userId,
    required String displayName,
    required String email,
    required String message,
  }) async {
    final trimmedName = displayName.trim();
    final trimmedEmail = email.trim();
    final trimmedMessage = message.trim();
    final trimmedUserId = userId?.trim() ?? '';
    final authUserId = _pb.authStore.isValid ? _pb.authStore.record?.id.trim() : null;
    final resolvedUserId = trimmedUserId.isNotEmpty
        ? trimmedUserId
        : (authUserId ?? '');

    if (trimmedName.isEmpty ||
        trimmedEmail.isEmpty ||
        trimmedMessage.isEmpty) {
      throw ServerException(message: 'Support message fields are required.');
    }

    try {
      await _pb.send(
        '/api/support/contact',
        method: 'POST',
        body: {
          'userId': resolvedUserId,
          'displayName': trimmedName,
          'email': trimmedEmail,
          'message': trimmedMessage,
        },
      );
    } catch (e) {
      throw ServerException(message: 'Support message could not be sent: $e');
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // ─── USER LINKS ───
  // ────────────────────────────────────────────────────────────────────────

  Future<void> saveUserLink(UserLinkModel link) async {
    try {
      await _pb
          .collection(AppConstants.userLinksCollection)
          .create(body: link.toMap());
    } catch (e) {
      throw ServerException(message: 'Link could not be saved: $e');
    }
  }

  Future<List<UserLinkModel>> getUserLinks(
    String userId, {
    int limit = 20,
  }) async {
    try {
      final result = await _pb
          .collection(AppConstants.userLinksCollection)
          .getList(
            page: 1,
            perPage: limit,
            filter: 'userId = "$userId"',
            sort: '-created',
          )
          .timeout(const Duration(seconds: 10));
      return result.items.map((r) => UserLinkModel.fromPb(r)).toList();
    } catch (e) {
      throw ServerException(message: 'Links could not be retrieved: $e');
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // ─── SEARCH (Typesense) ───
  // ────────────────────────────────────────────────────────────────────────

  bool get isCacheReady =>
      _homeFeedProducts != null && _homeFeedProducts!.isNotEmpty;

  void warmUpCache() {}
  void injectProductsIntoCache(List<ProductModel> products) {}

  Future<List<ProductModel>> getAllCachedProducts() async =>
      _homeFeedProducts ?? [];

  static List<ProductModel>? _homeFeedProducts;

  void setHomeFeedProducts(List<ProductModel> products) {
    if (products.isNotEmpty) _homeFeedProducts = products;
  }

  void preWarmSearchFunction() {}

  Future<List<ProductModel>> searchProducts({
    required String query,
    int limit = 50,
    int page = 1,
    String? category,
  }) async {
    final q = query.trim();
    if (q.isEmpty || q == '___warm___' || q == '_warmup_') return [];

    final safePage = page < 1 ? 1 : page;
    final cacheKey = '${q.toLowerCase()}|${category ?? ''}|$limit|$safePage';
    final cached = _searchResultCache[cacheKey];
    if (cached != null &&
        DateTime.now().difference(cached.time) < _searchResultCacheTtl) {
      return cached.results;
    }

    try {
      final params = <String, dynamic>{
        'q': q,
        'query_by': 'name,brand,subcategory,keySpecsText,tags',
        'query_by_weights': '8,5,4,2,3',
        'per_page': limit,
        'page': safePage,
        'sort_by': '_text_match:desc,techScore:desc',
        'prioritize_exact_match': true,
        'prioritize_token_position': true,
        'prefix': 'true,true,true,false,false',
        'exclude_fields': 'keySpecsText',
        if (category != null) 'filter_by': 'category:=$category',
      };

      final response = await _dio.get(
        '/collections/products/documents/search',
        queryParameters: params,
      );

      final hits = (response.data['hits'] as List?) ?? [];
      final results = hits.map((hit) {
        final doc = Map<String, dynamic>.from(
          hit['document'] as Map<dynamic, dynamic>,
        );
        // Typesense uses 'id' as the document id
        return ProductModel.fromMap(doc);
      }).toList();

      final filtered = ProductFilter.filterRelaxed(results);

      final ranked = rankProductsForQuery(filtered, q, limit: limit);

      _evictSearchResultCache();
      _searchResultCache[cacheKey] = (results: ranked, time: DateTime.now());
      return ranked;
    } catch (e) {
      debugPrint('SEARCH: Typesense failed: $e');
    }

    // Fallback: homeFeed products
    if (_homeFeedProducts != null && _homeFeedProducts!.isNotEmpty) {
      final ranked = _scoreAndRankProducts(_homeFeedProducts!, q, limit * safePage);
      final start = (safePage - 1) * limit;
      if (start >= ranked.length) return [];
      return ranked.skip(start).take(limit).toList();
    }

    return [];
  }

  void _evictSearchResultCache() {
    if (_searchResultCache.length >= _searchResultCacheMaxSize) {
      final sorted = _searchResultCache.entries.toList()
        ..sort((a, b) => a.value.time.compareTo(b.value.time));
      for (final e in sorted.take(
        _searchResultCache.length - _searchResultCacheMaxSize + 1,
      )) {
        _searchResultCache.remove(e.key);
      }
    }
  }

  List<ProductModel> searchProductsFromCache(String query, {int limit = 50}) {
    if (query.trim().isEmpty) return [];
    final pool = _homeFeedProducts;
    if (pool == null || pool.isEmpty) return [];
    return _scoreAndRankProducts(pool, query, limit);
  }

  List<ProductModel> _scoreAndRankProducts(
    List<ProductModel> products,
    String query,
    int limit,
  ) {
    final filtered = ProductFilter.filter(products);
    return rankProductsForQuery(filtered, query, limit: limit);
  }

  // ────────────────────────────────────────────────────────────────────────
  // ─── MISC ───
  // ────────────────────────────────────────────────────────────────────────

  Future<void> updateComparison({
    required String comparisonId,
    required Map<String, dynamic> data,
  }) async {
    try {
      await _pb
          .collection(AppConstants.comparisonsCollection)
          .update(comparisonId, body: data);
    } catch (e) {
      throw ServerException(message: 'Comparison could not be updated: $e');
    }
  }

  Future<void> saveLinkAnalysis({
    required String userId,
    required String url,
    required String productName,
    required double score,
    required String analysis,
    String? imageUrl,
    String? category,
  }) async {
    try {
      await _pb
          .collection(_savedAnalysesCollection)
          .create(
            body: {
              'userId': userId,
              'url': url,
              'title': productName,
              'category': category ?? 'saved_link_analysis',
              'analysisData': {
                'type': 'saved_link_analysis',
                'url': url,
                'title': productName,
                'imageUrl': imageUrl,
                'analysis': analysis,
                'category': category,
              },
              'aiScore': score,
              'aiSummary': analysis.substring(
                0,
                analysis.length.clamp(0, 5000),
              ),
              'savedAt': DateTime.now().toIso8601String(),
            },
          );
    } catch (e) {
      throw ServerException(message: 'Could not save analysis: $e');
    }
  }

  Future<void> _replaceSavedHistory({
    required String uid,
    required String category,
    required List<Map<String, dynamic>> history,
    required Future<void> Function(String uid, Map<String, dynamic> entry)
    saveEntry,
  }) async {
    final existing = await _pb
        .collection(_savedAnalysesCollection)
        .getList(
          page: 1,
          perPage: 100,
          filter: 'userId = "$uid" && category = "$category"',
        );
    for (final item in existing.items) {
      await _pb.collection(_savedAnalysesCollection).delete(item.id);
    }
    for (final entry in history.reversed) {
      await saveEntry(uid, entry);
    }
  }

  Map<String, dynamic> _mapLinkHistoryRecord(RecordModel record) {
    final data = record.data;
    final analysisData =
        (data['analysisData'] as Map?)?.map(
          (key, value) => MapEntry(key.toString(), value),
        ) ??
        const <String, dynamic>{};
    return {
      'id': record.id,
      'type': analysisData['type'] ?? 'single',
      'url': data['url']?.toString() ?? analysisData['url']?.toString() ?? '',
      'productName':
          data['title']?.toString() ??
          analysisData['productName']?.toString() ??
          analysisData['title']?.toString() ??
          '',
      'score':
          (data['aiScore'] as num?)?.toDouble() ??
          (analysisData['score'] as num?)?.toDouble() ??
          0.0,
      'timestamp':
          data['savedAt']?.toString() ??
          analysisData['timestamp']?.toString() ??
          record.created,
      if (analysisData['result'] != null) 'result': analysisData['result'],
      if (analysisData['results'] != null) 'results': analysisData['results'],
      if (analysisData['products'] != null)
        'products': analysisData['products'],
      if (analysisData['urls'] != null) 'urls': analysisData['urls'],
      if (analysisData['analysis'] != null)
        'analysis': analysisData['analysis'],
    };
  }

  Map<String, dynamic> _mapSubscriptionHistoryRecord(RecordModel record) {
    final data = record.data;
    final analysisData =
        (data['analysisData'] as Map?)?.map(
          (key, value) => MapEntry(key.toString(), value),
        ) ??
        const <String, dynamic>{};
    return {
      'id': record.id,
      'timestamp':
          data['savedAt']?.toString() ??
          analysisData['timestamp']?.toString() ??
          record.created,
      'services':
          (analysisData['services'] as List?)
              ?.map((e) => e.toString())
              .toList() ??
          <String>[],
      'scores': analysisData['scores'] ?? const <String, dynamic>{},
      'winner': analysisData['winner'],
      'analysisResult':
          analysisData['analysisResult']?.toString() ??
          data['aiSummary']?.toString() ??
          '',
      'structured': analysisData['structured'],
    };
  }

  Future<void> addToUserOwnedProducts({
    required String userId,
    required String productId,
  }) async {
    try {
      final user = await _pb
          .collection(AppConstants.usersCollection)
          .getOne(userId);
      final owned = List<String>.from(user.data['ownedProducts'] ?? []);
      if (!owned.contains(productId)) {
        owned.add(productId);
        await _pb
            .collection(AppConstants.usersCollection)
            .update(userId, body: {'ownedProducts': owned});
      }
    } catch (e) {
      throw ServerException(
        message: 'User product list could not be updated: $e',
      );
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // ─── CHAT CONVERSATIONS ───
  // ────────────────────────────────────────────────────────────────────────

  Future<String> createChatConversation(ChatConversation conv) async {
    final record = await _pb
        .collection('chat_conversations')
        .create(
          body: {
            'userId': conv.userId,
            'title': conv.title,
            'messages': conv.messages.map((m) => m.toMap()).toList(),
            'messageCount': conv.messages.length,
          },
        );
    return record.id;
  }

  Future<void> updateChatConversation(
    String userId,
    String convId,
    List<PersistedChatMsg> messages,
    String title,
  ) async {
    await _pb
        .collection('chat_conversations')
        .update(
          convId,
          body: {
            'messages': messages.map((m) => m.toMap()).toList(),
            'title': title,
            'messageCount': messages.length,
          },
        );
  }

  Stream<List<ChatConversation>> streamChatConversations(String userId) {
    return _createRealtimeStream<List<ChatConversation>>(
      collection: 'chat_conversations',
      load: () async {
        final result = await _pb
            .collection('chat_conversations')
            .getList(
              page: 1,
              perPage: 50,
              filter: 'userId = "$userId"',
              sort: '-updated',
            );
        return result.items.map(ChatConversation.fromPb).toList();
      },
      shouldReload: (event) => event.record?.data['userId'] == userId,
    );
  }

  Future<ChatConversation?> getChatConversation(
    String userId,
    String convId,
  ) async {
    try {
      final record = await _pb.collection('chat_conversations').getOne(convId);
      return ChatConversation.fromPb(record);
    } on ClientException catch (e) {
      if (e.statusCode == 404) return null;
      return null;
    }
  }

  Future<void> deleteChatConversation(String userId, String convId) async {
    await _pb.collection('chat_conversations').delete(convId);
  }

  // ────────────────────────────────────────────────────────────────────────
  // ─── PUBLIC CONFIG ───
  // ────────────────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> getPublicConfig() async {
    if (_publicConfigUnsupported) return {};

    try {
      final result = await _pb
          .collection('public_config')
          .getFullList(batch: 50);
      final config = <String, dynamic>{};
      for (final record in result) {
        final key = record.data['key'] as String?;
        final value = record.data['value'];
        if (key != null) config[key] = value;
      }
      return config;
    } catch (e) {
      if (_isMissingCollectionContextError(e)) {
        _publicConfigUnsupported = true;
        return {};
      }
      debugPrint('[PB] getPublicConfig failed: $e');
      return {};
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // ─── TYPESENSE CATEGORY QUERIES (fast product listing) ──────────────
  // ────────────────────────────────────────────────────────────────────────

  /// Parse a Typesense hit into ProductModel via the _raw JSON field.
  ProductModel? _tsHitToProduct(Map<String, dynamic> hit) {
    try {
      final doc = hit['document'] as Map<String, dynamic>?;
      if (doc == null) return null;
      final rawStr = doc['_raw'] as String?;
      if (rawStr == null || rawStr.isEmpty) {
        // Fallback: use the Typesense doc fields directly
        return ProductModel.fromMap(doc);
      }
      final raw = jsonDecode(rawStr) as Map<String, dynamic>;
      return ProductModel.fromMap(raw);
    } catch (e) {
      return null;
    }
  }

  /// Fetch products for a single category from Typesense.
  /// Much faster than PocketBase pagination (10-50ms vs 1-2s).
  Future<List<ProductModel>> getProductsByCategoryTs({
    required String category,
    int limit = 80,
    String sortBy = 'techScore:desc',
  }) async {
    try {
      final sw = Stopwatch()..start();
      final response = await _dio.get(
        '/collections/products/documents/search',
        queryParameters: {
          'q': '*',
          'filter_by': 'category:=$category',
          'sort_by': sortBy,
          'per_page': limit,
          'page': 1,
          'exclude_fields': 'keySpecsText',
        },
      );
      sw.stop();
      final hits = (response.data['hits'] as List?) ?? [];
      final products = hits
          .map((h) => _tsHitToProduct(h as Map<String, dynamic>))
          .whereType<ProductModel>()
          .toList();
      if (_verboseTypesenseLogs) {
        debugPrint(
          '=== QOR AI: TS cat=$category → ${products.length} in ${sw.elapsedMilliseconds}ms ===',
        );
      }
      return products;
    } catch (e) {
      if (_verboseTypesenseLogs) {
        debugPrint('=== QOR AI: TS cat=$category FAILED: $e ===');
      }
      return [];
    }
  }

  /// Fetch products for MULTIPLE categories in a single Typesense multi_search request.
  /// Returns a Map<category, List<ProductModel>>.
  /// This replaces 20 parallel PocketBase calls with 1 HTTP request (~50-100ms total).
  Future<Map<String, List<ProductModel>>> getProductsMultiCategoryTs({
    required List<String> categories,
    int perCategory = 80,
    String sortBy = 'techScore:desc',
  }) async {
    if (categories.isEmpty) return {};
    try {
      final sw = Stopwatch()..start();
      final searches = categories
          .map(
            (cat) => {
              'collection': 'products',
              'q': '*',
              'filter_by': 'category:=$cat',
              'sort_by': sortBy,
              'per_page': perCategory,
              'page': 1,
              'exclude_fields': 'keySpecsText',
            },
          )
          .toList();

      final response = await _dio.post(
        '/multi_search',
        data: {'searches': searches},
      );
      sw.stop();

      final results = <String, List<ProductModel>>{};
      final resultsList = (response.data['results'] as List?) ?? [];
      for (var i = 0; i < resultsList.length && i < categories.length; i++) {
        final catResult = resultsList[i] as Map<String, dynamic>;
        final hits = (catResult['hits'] as List?) ?? [];
        final products = hits
            .map((h) => _tsHitToProduct(h as Map<String, dynamic>))
            .whereType<ProductModel>()
            .toList();
        results[categories[i]] = products;
      }

      final total = results.values.fold<int>(0, (s, l) => s + l.length);
      debugPrint(
        '=== QOR AI: TS multi_search ${categories.length} cats → $total products in ${sw.elapsedMilliseconds}ms ===',
      );
      return results;
    } catch (e) {
      debugPrint('=== QOR AI: TS multi_search FAILED: $e ===');
      return {};
    }
  }

  /// Paginated Typesense query for a category. Used by PCBuilder / category browse.
  /// Returns all products in a category (up to maxTotal) using Typesense pagination.
  Future<List<ProductModel>> getAllProductsInCategoryTs({
    required String category,
    int perPage = 250,
    int maxTotal = 5000,
    String sortBy = 'techScore:desc',
  }) async {
    final all = <ProductModel>[];
    final seenIds = <String>{};
    int page = 1;
    // Use the same multi-variant filter logic as getProductsPageTs so that
    // inconsistent category slugs (hyphen vs underscore vs spaces) are all
    // covered in a single Typesense query.
    final variants = _categoryVariants(category);
    final filterBy = variants.length == 1
        ? 'category:=${variants.first}'
        : 'category:[${variants.join(',')}]';
    try {
      final sw = Stopwatch()..start();
      while (all.length < maxTotal) {
        final response = await _dio.get(
          '/collections/products/documents/search',
          queryParameters: {
            'q': '*',
            'filter_by': filterBy,
            'sort_by': sortBy,
            'per_page': perPage,
            'page': page,
            'exclude_fields': 'keySpecsText',
          },
        );
        final hits = (response.data['hits'] as List?) ?? [];
        if (hits.isEmpty) break;
        for (final h in hits) {
          final p = _tsHitToProduct(h as Map<String, dynamic>);
          if (p != null && seenIds.add(p.id)) all.add(p);
        }
        final found = (response.data['found'] as int?) ?? 0;
        if (page * perPage >= found) break;
        page++;
      }
      sw.stop();
      debugPrint(
        '=== QOR AI: TS allInCat cat=$category → ${all.length} in ${sw.elapsedMilliseconds}ms ===',
      );
      return all;
    } catch (e) {
      debugPrint('=== QOR AI: TS allInCat cat=$category FAILED: $e ===');
      return [];
    }
  }

  /// Paginated Typesense query matching getProductsPage signature for drop-in replacement.
  Future<
    ({List<ProductModel> products, int nextPage, bool hasMore, int totalFound})
  >
  getProductsPageTs({
    required String category,
    int limit = 200,
    int page = 1,
    String sortBy = 'techScore:desc',
  }) async {
    try {
      final sw = Stopwatch()..start();

      // Build alternative category slugs to handle inconsistent naming in
      // Typesense (e.g. "vr-headsets" vs "vr_headsets" vs "VR Headsets").
      // Typesense exact-match filter only finds records that match the stored
      // field value exactly, so we probe all plausible variants in one query.
      final variants = _categoryVariants(category);
      final filterBy = variants.length == 1
          ? 'category:=${variants.first}'
          : 'category:[${variants.join(',')}]';

      final response = await _dio.get(
        '/collections/products/documents/search',
        queryParameters: {
          'q': '*',
          'filter_by': filterBy,
          'sort_by': sortBy,
          'per_page': limit,
          'page': page,
          'exclude_fields': 'keySpecsText',
        },
      );
      sw.stop();
      final hits = (response.data['hits'] as List?) ?? [];
      final products = hits
          .map((h) => _tsHitToProduct(h as Map<String, dynamic>))
          .whereType<ProductModel>()
          .toList();
      final found = (response.data['found'] as int?) ?? 0;
      final hasMore = (page * limit) < found;
      debugPrint(
        '=== QOR AI: TS getProductsPage cat=$category filter=$filterBy page=$page → ${products.length}/${found} in ${sw.elapsedMilliseconds}ms ===',
      );
      return (
        products: products,
        nextPage: page + 1,
        hasMore: hasMore,
        totalFound: found,
      );
    } catch (e) {
      debugPrint(
        '=== QOR AI: TS getProductsPage FAILED cat=$category: $e ===',
      );
      // Fallback to PocketBase
      final fallback = await getProductsPage(
        category: category,
        limit: limit,
        page: page,
      );
      return (
        products: fallback.products,
        nextPage: fallback.nextPage,
        hasMore: fallback.hasMore,
        totalFound: fallback.products.length,
      );
    }
  }

  /// Returns all plausible Typesense slug variants for a category name.
  /// Covers the most common inconsistencies: hyphen vs underscore, mixed case,
  /// and trimmed whitespace.
  static List<String> _categoryVariants(String category) {
    final trimmed = category.trim();
    // Produce hyphenated and underscored lower-case slugs.
    final lower = trimmed.toLowerCase();
    final hyphenated = lower.replaceAll('_', '-').replaceAll(' ', '-');
    final underscored = lower.replaceAll('-', '_').replaceAll(' ', '_');
    final spaced = lower.replaceAll('-', ' ').replaceAll('_', ' ');

    // Collect unique variants preserving the original as first candidate.
    final seen = <String>{};
    final result = <String>[];
    for (final v in [trimmed, hyphenated, underscored, spaced]) {
      if (seen.add(v)) result.add(v);
    }
    return result;
  }

  // ────────────────────────────────────────────────────────────────────────
  // ─── HELPERS ───
  // ────────────────────────────────────────────────────────────────────────

  List<List<T>> _chunkList<T>(List<T> list, int chunkSize) {
    final chunks = <List<T>>[];
    for (var i = 0; i < list.length; i += chunkSize) {
      chunks.add(
        list.sublist(
          i,
          i + chunkSize > list.length ? list.length : i + chunkSize,
        ),
      );
    }
    return chunks;
  }
}
