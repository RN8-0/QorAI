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
import 'package:qor_ai/config/filter_config.dart' show FilterOption;
import 'package:qor_ai/data/models/chat_conversation.dart';

List<ProductModel> _parseTypesenseHitsToProducts(
  List<Map<String, dynamic>> hits,
) {
  final products = <ProductModel>[];
  for (final hit in hits) {
    try {
      final doc = hit['document'] as Map<String, dynamic>?;
      if (doc == null) continue;
      final rawStr = doc['_raw'] as String?;
      if (rawStr == null || rawStr.isEmpty) {
        products.add(ProductModel.fromMap(doc));
        continue;
      }
      final raw = jsonDecode(rawStr) as Map<String, dynamic>;
      products.add(ProductModel.fromMap(raw));
    } catch (_) {}
  }
  return products;
}

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
  static final Map<String, ({List<ProductModel> products, DateTime time})>
  _filterCatalogCache = {};
  static const _filterCatalogCacheTtl = Duration(hours: 6);

  // Lean field projection for product list queries (feed/grid cards).
  // Keeps gallery/offer rollups so cards, price sorting and affiliate CTAs can
  // update without a detail refetch.
  static const _productListFields =
      'id,collectionId,collectionName,created,updated,'
      'name,brand,category,subcategory,source,'
      'imageUrl,imageURL,images,techScore,trendScore,techSubscores,'
      'price_segment,priceRange,prices,lowestPrice,lowestPriceCurrency,'
      'lowestPriceUSD,lowestOfferUrl,lowestOfferStore,offerCount,'
      'affiliateLinks,affiliateLinksByCountry,tags,ratings,'
      'isActive,variantGroup,configKey,scrapedAt,lastUpdated';

  PbDataSource({PocketBase? client}) : _pb = client ?? pb {
    _dio = Dio(
      BaseOptions(
        baseUrl: kTypesenseUrl,
        headers: {'X-TYPESENSE-API-KEY': kTypesenseApiKey},
        // Mobile networks routinely take >10s for cold connections (TLS
        // handshake on slow LTE). Bumping to 25/35s eliminates the spurious
        // [connection timeout] storm seen in profile logs while still
        // failing fast enough to keep the UI responsive.
        connectTimeout: const Duration(seconds: 25),
        receiveTimeout: const Duration(seconds: 35),
        sendTimeout: const Duration(seconds: 25),
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

  static bool _isMissingSortFieldError(Object error) {
    final text = error.toString().toLowerCase();
    return text.contains(
          'something went wrong while processing your request',
        ) ||
        text.contains('statuscode: 400');
  }

  Stream<T> _createRealtimeStream<T>({
    required String collection,
    String topic = '*',
    required Future<T> Function() load,
    bool Function(RecordSubscriptionEvent event)? shouldReload,
    Duration pollingInterval = const Duration(seconds: 45),
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
      pollingTimer = Timer.periodic(pollingInterval, (_) {
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
      load: () async {
        final user = await getUser(uid);
        // Admin (or anyone) deleted this user record on the server →
        // immediately invalidate local auth so the app routes to login.
        if (user == null &&
            _pb.authStore.isValid &&
            _pb.authStore.record?.id == uid) {
          debugPrint(
            '[PbDs] user $uid not found on server, clearing authStore',
          );
          _pb.authStore.clear();
        }
        return user;
      },
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

  /// Removes recently-viewed records whose product no longer exists. Called
  /// after a `repo.getProduct` round-trip returns 404 on both PB and TS so
  /// the next launch doesn't replay the same dead-id lookups.
  Future<void> pruneRecentlyViewed(String uid, Set<String> productIds) async {
    if (uid.isEmpty || productIds.isEmpty) return;
    for (final pid in productIds) {
      try {
        final escaped = pid.replaceAll('"', r'\"');
        final hits = await _pb
            .collection('recently_viewed')
            .getList(
              page: 1,
              perPage: 20,
              filter: 'userId = "$uid" && productId = "$escaped"',
            );
        for (final r in hits.items) {
          await _pb.collection('recently_viewed').delete(r.id);
        }
      } catch (_) {
        // Best-effort cleanup; a failure here just means we'll retry next launch.
      }
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

  Future<List<ProductOfferModel>> getProductOffers(String productId) async {
    final id = productId.trim();
    if (id.isEmpty) return const <ProductOfferModel>[];
    final safeId = id.replaceAll('\\', '\\\\').replaceAll('"', r'\"');
    try {
      final result = await _pb
          .collection('offers')
          .getList(
            page: 1,
            perPage: 120,
            filter: 'productId = "$safeId"',
            sort: 'country,totalPrice,price,-updated',
            fields:
                'id,collectionId,collectionName,created,updated,productId,store,network,country,'
                'price,shipping,totalPrice,currency,priceText,url,affiliateUrl,condition,'
                'availability,inStock,priceUnknown,matchConfidence,lastCheckedAt,'
                'priceUpdatedAt,expiresAt,scrapedAt,source',
          )
          .timeout(const Duration(seconds: 12));
      final offers = result.items
          .map((r) {
            try {
              return ProductOfferModel.fromPb(r);
            } catch (_) {
              return null;
            }
          })
          .whereType<ProductOfferModel>()
          .where((offer) => offer.isLive)
          .toList();
      offers.sort((a, b) {
        if (a.isFresh != b.isFresh) return a.isFresh ? -1 : 1;
        if (a.hasExactPrice != b.hasExactPrice) {
          return a.hasExactPrice ? -1 : 1;
        }
        if (a.country != b.country) return a.country.compareTo(b.country);
        if (a.hasExactPrice && b.hasExactPrice && a.price != b.price) {
          return a.price.compareTo(b.price);
        }
        return a.displayStore.compareTo(b.displayStore);
      });
      return offers;
    } on ClientException catch (e) {
      if (e.statusCode == 404) return const <ProductOfferModel>[];
      debugPrint('=== QOR AI: getProductOffers PB ERROR: $e ===');
      return const <ProductOfferModel>[];
    } catch (e) {
      debugPrint('=== QOR AI: getProductOffers FAILED for $id: $e ===');
      return const <ProductOfferModel>[];
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

  Future<List<ProductModel>> getProductVariantsByGroup({
    required String variantGroup,
    String? category,
    int limit = 80,
  }) async {
    final vg = variantGroup.replaceAll('"', r'\"');
    final filters = <String>['variantGroup = "$vg"'];
    if (category != null && category.trim().isNotEmpty) {
      filters.add('category = "${category.replaceAll('"', r'\"')}"');
    }
    try {
      final result = await _pb
          .collection(AppConstants.productsCollection)
          .getList(
            page: 1,
            perPage: limit,
            filter: filters.join(' && '),
            sort: 'name',
            fields:
                'id,collectionId,collectionName,created,updated,name,brand,category,subcategory,'
                'imageUrl,imageURL,techScore,prices,ratings,isActive,variantGroup,configKey,'
                'keySpecs,specs,specSections,scrapedAt,lastUpdated',
          )
          .timeout(const Duration(seconds: 12));
      return result.items
          .map((r) {
            try {
              return ProductModel.fromPb(r);
            } catch (_) {
              return null;
            }
          })
          .whereType<ProductModel>()
          .toList();
    } catch (_) {
      return const <ProductModel>[];
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
        final result = await _getListWithSortFallback(
          collection: AppConstants.comparisonsCollection,
          page: page,
          perPage: limit,
          filter: 'userId = "$userId"',
          sort: '-updated',
        ).timeout(const Duration(seconds: 15));
        for (final record in result.items) {
          final comparison = _safeComparisonFromPb(record);
          if (comparison != null && _isValidComparison(comparison)) {
            comparisons.add(comparison);
          }
        }
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

  ComparisonModel? _safeComparisonFromPb(RecordModel record) {
    try {
      return ComparisonModel.fromPb(record);
    } catch (e) {
      debugPrint('[PB] skipping malformed comparison ${record.id}: $e');
      return null;
    }
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
      final result = await _getListWithSortFallback(
        collection: AppConstants.reviewsCollection,
        page: 1,
        perPage: limit,
        filter: 'productId = "$productId"',
        sort: '-created',
      ).timeout(const Duration(seconds: 10));
      return result.items
          .map(_safeReviewFromPb)
          .whereType<ReviewModel>()
          .toList();
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

  Future<void> updateReview(String reviewId, String text) async {
    try {
      await _pb
          .collection(AppConstants.reviewsCollection)
          .update(reviewId, body: {'text': text});
    } catch (e) {
      throw ServerException(message: 'Review could not be updated: $e');
    }
  }

  Future<void> updateComparisonReview(String reviewId, String text) async {
    try {
      await _pb
          .collection('comparison_reviews')
          .update(reviewId, body: {'reviewText': text});
    } catch (e) {
      throw ServerException(message: 'Review could not be updated: $e');
    }
  }

  Future<void> updateReviewReply({
    required String replyId,
    required String text,
  }) async {
    await _pb
        .collection('review_replies')
        .update(replyId, body: {'text': text});
  }

  Future<void> deleteReview(String reviewId) async {
    // Cascade delete all replies for this review first
    try {
      final replies = await _pb
          .collection('review_replies')
          .getList(page: 1, perPage: 200, filter: 'reviewId = "$reviewId"');
      for (final reply in replies.items) {
        await _pb.collection('review_replies').delete(reply.id);
      }
    } catch (_) {
      // Replies may not exist — proceed with review deletion
    }
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

  Future<void> toggleComparisonReviewLike(
    String reviewId,
    String userId,
  ) async {
    final record = await _pb.collection('comparison_reviews').getOne(reviewId);
    final liked = List<String>.from(record.data['likedBy'] as List? ?? []);
    final disliked = List<String>.from(
      record.data['dislikedBy'] as List? ?? [],
    );
    if (liked.contains(userId)) {
      liked.remove(userId);
    } else {
      liked.add(userId);
      disliked.remove(userId);
    }
    await _pb
        .collection('comparison_reviews')
        .update(reviewId, body: {'likedBy': liked, 'dislikedBy': disliked});
  }

  Future<void> toggleComparisonReviewDislike(
    String reviewId,
    String userId,
  ) async {
    final record = await _pb.collection('comparison_reviews').getOne(reviewId);
    final liked = List<String>.from(record.data['likedBy'] as List? ?? []);
    final disliked = List<String>.from(
      record.data['dislikedBy'] as List? ?? [],
    );
    if (disliked.contains(userId)) {
      disliked.remove(userId);
    } else {
      disliked.add(userId);
      liked.remove(userId);
    }
    await _pb
        .collection('comparison_reviews')
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
        try {
          final result = await _getListWithSortFallback(
            collection: AppConstants.reviewsCollection,
            page: 1,
            perPage: limit,
            filter: 'userId = "$userId"',
            sort: '-created',
          );
          return result.items
              .map(_safeReviewFromPb)
              .whereType<ReviewModel>()
              .toList();
        } catch (e) {
          if (!_isMissingSortFieldError(e)) {
            debugPrint('[PB] watchUserReviews load error: $e');
          }
          return const <ReviewModel>[];
        }
      },
      shouldReload: (event) => event.record?.data['userId'] == userId,
    );
  }

  ReviewModel? _safeReviewFromPb(RecordModel record) {
    try {
      return ReviewModel.fromPb(record);
    } catch (e) {
      debugPrint('[PB] skipping malformed review ${record.id}: $e');
      return null;
    }
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
    return result.items
        .map(
          (r) => {
            'id': r.id,
            ...r.data,
            'created': r.get<String>('created'),
            'updated': r.get<String>('updated'),
          },
        )
        .toList();
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
            'likedBy': [],
            'dislikedBy': [],
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

  Future<void> toggleReplyLike(String replyId, String userId) async {
    final record = await _pb.collection('review_replies').getOne(replyId);
    final liked = List<String>.from(record.data['likedBy'] ?? []);
    final disliked = List<String>.from(record.data['dislikedBy'] ?? []);
    if (liked.contains(userId)) {
      liked.remove(userId);
    } else {
      liked.add(userId);
      disliked.remove(userId);
    }
    await _pb
        .collection('review_replies')
        .update(replyId, body: {'likedBy': liked, 'dislikedBy': disliked});
  }

  Future<void> toggleReplyDislike(String replyId, String userId) async {
    final record = await _pb.collection('review_replies').getOne(replyId);
    final liked = List<String>.from(record.data['likedBy'] ?? []);
    final disliked = List<String>.from(record.data['dislikedBy'] ?? []);
    if (disliked.contains(userId)) {
      disliked.remove(userId);
    } else {
      disliked.add(userId);
      liked.remove(userId);
    }
    await _pb
        .collection('review_replies')
        .update(replyId, body: {'likedBy': liked, 'dislikedBy': disliked});
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
      filter: 'userId = "$userId"',
      sort: '-created',
    );

    return result.items
        .map((record) {
          final status = record.data['status']?.toString() ?? '';
          final createdAt = record.data['created']?.toString().trim() ?? '';
          final repliedAt = record.data['repliedAt']?.toString().trim() ?? '';
          final thread = _supportChatMessagesFromRecord(record.data);
          final last = thread.isNotEmpty ? thread.last : null;

          if (last != null) {
            final role = last['role']?.toString() ?? '';
            final text = last['text']?.toString().trim() ?? '';
            if (text.isEmpty) return null;
            final isAdmin = role == 'admin';
            return <String, dynamic>{
              'id': 'support_${record.id}',
              'read': true,
              'title': isAdmin
                  ? 'Qor AI Destek\'ten yeni mesaj'
                  : 'Mesajınız gönderildi',
              'body': text,
              'senderName': isAdmin ? 'Qor AI Destek' : 'Siz',
              'referenceId': record.id,
              'type': isAdmin ? 'admin_message' : 'support_sent',
              'created':
                  last['ts']?.toString() ??
                  (repliedAt.isNotEmpty ? repliedAt : createdAt),
              '_source': 'support_messages',
            };
          }

          if (status == 'open' || status == 'pending') {
            final userMessage = record.data['message']?.toString().trim() ?? '';
            if (userMessage.isEmpty) return null;
            return <String, dynamic>{
              'id': 'support_${record.id}',
              'read': true,
              'title': 'Destek talebiniz alındı',
              'body': userMessage,
              'senderName': 'Siz',
              'referenceId': record.id,
              'type': 'support_sent',
              'created': createdAt,
              '_source': 'support_messages',
            };
          }

          final body =
              (status == 'admin_message'
                      ? record.data['message']
                      : record.data['adminReply'])
                  ?.toString()
                  .trim() ??
              '';
          if (body.isEmpty) return null;
          return <String, dynamic>{
            'id': 'support_${record.id}',
            'read': true,
            'title': status == 'admin_message'
                ? 'Qor AI Destek\'ten yeni mesaj'
                : 'Mesajınıza yanıt geldi',
            'body': body,
            'senderName': 'Qor AI Destek',
            'referenceId': record.id,
            'type': status == 'admin_message'
                ? 'admin_message'
                : 'support_reply',
            'created': repliedAt.isNotEmpty ? repliedAt : createdAt,
            '_source': 'support_messages',
          };
        })
        .whereType<Map<String, dynamic>>()
        .toList();
  }

  List<Map<String, dynamic>> _supportChatMessagesFromRecord(
    Map<String, dynamic> data,
  ) {
    final rawChatMessages = data['chatMessages'];
    List<dynamic> raw = [];

    if (rawChatMessages is List) {
      raw = rawChatMessages;
    } else if (rawChatMessages is String && rawChatMessages.isNotEmpty) {
      try {
        final decoded = jsonDecode(rawChatMessages);
        if (decoded is List) raw = decoded;
      } catch (_) {}
    } else if (rawChatMessages != null) {
      try {
        final decoded = jsonDecode(rawChatMessages.toString());
        if (decoded is List) raw = decoded;
      } catch (_) {}
    }

    if (raw.isNotEmpty) {
      final parsed = raw
          .whereType<Map>()
          .map((message) {
            final role = _normalizeSupportRole(message['role']);
            final text = message['text']?.toString().trim() ?? '';
            final ts = message['ts']?.toString() ?? '';
            return {'role': role, 'text': text, 'ts': ts};
          })
          .where((message) => message['text']!.isNotEmpty)
          .toList();
      if (parsed.isNotEmpty) return parsed;
    }

    final messages = <Map<String, dynamic>>[];
    final status = data['status']?.toString() ?? '';
    final message = data['message']?.toString().trim() ?? '';
    final adminReply = data['adminReply']?.toString().trim() ?? '';
    final created = data['created']?.toString() ?? '';
    final repliedAt = data['repliedAt']?.toString() ?? '';
    if (message.isNotEmpty) {
      messages.add({
        'role': status == 'admin_message' ? 'admin' : 'user',
        'text': message,
        'ts': created,
      });
    }
    if (adminReply.isNotEmpty) {
      messages.add({
        'role': 'admin',
        'text': adminReply,
        'ts': repliedAt.isNotEmpty ? repliedAt : created,
      });
    }
    return messages;
  }

  String _normalizeSupportRole(dynamic rawRole) {
    final role = rawRole?.toString().trim().toLowerCase() ?? '';
    if (role == 'user') return 'user';
    return 'admin';
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
    bool isSupportItem(Map<String, dynamic> item) {
      final type = item['type']?.toString() ?? '';
      final source = item['_source']?.toString() ?? '';
      return source == 'support_messages' ||
          type == 'admin_message' ||
          type == 'support_reply' ||
          type == 'support_sent';
    }

    final merged = <Map<String, dynamic>>[];
    final supportByReference = <String, Map<String, dynamic>>{};

    for (final item in [...notifications, ...supportFallbacks]) {
      if (item['type'] == 'dismissed_support') continue;
      final referenceId = item['referenceId']?.toString().trim() ?? '';

      if (referenceId.isNotEmpty && isSupportItem(item)) {
        final previous = supportByReference[referenceId];
        if (previous == null ||
            (_notificationTimestamp(item) ??
                    DateTime.fromMillisecondsSinceEpoch(0))
                .isAfter(
                  _notificationTimestamp(previous) ??
                      DateTime.fromMillisecondsSinceEpoch(0),
                )) {
          supportByReference[referenceId] = {...item};
        }
        if (item['read'] != true) {
          supportByReference[referenceId] = {
            ...supportByReference[referenceId]!,
            'read': false,
          };
        }
      } else {
        merged.add(item);
      }
    }

    merged.addAll(supportByReference.values);
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
    late final StreamController<List<Map<String, dynamic>>> controller;
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
          notificationsResult.items.map(
            (record) => {'id': record.id, ...record.data},
          ),
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
          await _pb.collection('support_messages').subscribe('*', (
            event,
          ) async {
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

    controller = StreamController<List<Map<String, dynamic>>>(
      onListen: () {
        unawaited(() async {
          try {
            final data = await fetch();
            if (!controller.isClosed) controller.add(data);
          } catch (e) {
            debugPrint('[PbDs] initial notifications fetch error: $e');
            if (!controller.isClosed) {
              controller.add(const <Map<String, dynamic>>[]);
            }
          }

          if (_notificationsRealtimeUnsupported || _realtimeUnsupported) {
            startPollingFallback();
          } else {
            await trySubscribe();
          }
        }());
      },
      onCancel: () {
        cancelled = true;
        retryTimer?.cancel();
        pollTimer?.cancel();
        _pb.collection('notifications').unsubscribe('*').catchError((_) {});
        _pb.collection('support_messages').unsubscribe('*').catchError((_) {});
      },
    );

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

  Future<void> deleteNotification(String notificationId) async {
    try {
      Future<void> dismissSupportThread(String supportId) async {
        final existing = await _pb
            .collection('notifications')
            .getList(
              page: 1,
              perPage: 50,
              filter: 'referenceId = "$supportId"',
            );
        for (final item in existing.items) {
          await _pb.collection('notifications').delete(item.id);
        }
      }

      if (notificationId.startsWith('support_')) {
        final supportId = notificationId.substring(8);
        await dismissSupportThread(supportId);
        return;
      }
      RecordModel? notification;
      try {
        notification = await _pb
            .collection('notifications')
            .getOne(notificationId);
      } catch (_) {}
      final type = notification?.data['type']?.toString() ?? '';
      final referenceId = notification?.data['referenceId']?.toString() ?? '';
      if (referenceId.isNotEmpty &&
          (type == 'admin_message' ||
              type == 'support_reply' ||
              type == 'support_sent')) {
        await dismissSupportThread(referenceId);
        return;
      }
      await _pb.collection('notifications').delete(notificationId);
    } catch (e) {
      debugPrint('[PbDs] deleteNotification error: $e');
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
      final platform = switch (defaultTargetPlatform) {
        TargetPlatform.android => 'android',
        TargetPlatform.iOS => 'ios',
        TargetPlatform.macOS => 'macos',
        TargetPlatform.windows => 'windows',
        TargetPlatform.linux => 'linux',
        TargetPlatform.fuchsia => 'fuchsia',
      };
      await _pb
          .collection('users')
          .update(
            userId,
            body: {
              'fcmToken': fcmToken,
              'fcmTokenUpdatedAt': DateTime.now().toIso8601String(),
              'platform': platform,
            },
          );
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
    final authUserId = _pb.authStore.isValid
        ? _pb.authStore.record?.id.trim()
        : null;
    final resolvedUserId = trimmedUserId.isNotEmpty
        ? trimmedUserId
        : (authUserId ?? '');

    if (trimmedName.isEmpty || trimmedEmail.isEmpty || trimmedMessage.isEmpty) {
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
  // ─── SUPPORT CHAT ───
  // ────────────────────────────────────────────────────────────────────────

  /// Fetch single support_messages record as a map
  Future<Map<String, dynamic>?> getSupportThread(String messageId) async {
    try {
      final record = await _pb.collection('support_messages').getOne(messageId);
      return {'id': record.id, ...record.data};
    } catch (e) {
      debugPrint('[PbDs] getSupportThread error: $e');
      return null;
    }
  }

  /// Watch a single support_messages record for real-time updates
  Stream<Map<String, dynamic>?> watchSupportThread(String messageId) {
    return _createRealtimeStream<Map<String, dynamic>?>(
      collection: 'support_messages',
      topic: messageId,
      load: () => getSupportThread(messageId),
      pollingInterval: const Duration(seconds: 3),
    );
  }

  /// Append user reply to chatMessages in support_messages record.
  /// User can only reply when last message in thread is from admin.
  Future<void> sendSupportChatReply({
    required String messageId,
    required String replyText,
    required String userId,
  }) async {
    final trimmed = replyText.trim();
    if (trimmed.isEmpty) {
      throw ServerException(message: 'Mesaj boş olamaz.');
    }
    try {
      final record = await _pb.collection('support_messages').getOne(messageId);
      final banned = record.data['banned'] as bool? ?? false;
      if (banned) {
        throw ServerException(message: 'Bu sohbet kapatılmıştır.');
      }

      final chatMessages = _supportChatMessagesFromRecord(record.data);
      final now = DateTime.now().toIso8601String();

      chatMessages.add({'role': 'user', 'text': trimmed, 'ts': now});

      await _pb
          .collection('support_messages')
          .update(
            messageId,
            body: {
              'chatMessages': chatMessages,
              'message': trimmed,
              'status': 'open',
              'repliedAt': now,
            },
          );
    } catch (e) {
      if (e is ServerException) rethrow;
      throw ServerException(message: 'Yanıt gönderilemedi: $e');
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

  void clearProductRuntimeCaches() {
    _homeFeedProducts = null;
    _searchResultCache.clear();
    _filterCatalogCache.clear();
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

    // Normalize query while preserving single-letter model suffixes such as
    // "2600x" so product-name substrings keep matching the indexed token.
    final normalizedQ = _normalizeSearchQuery(q);

    try {
      final params = <String, dynamic>{
        'q': normalizedQ,
        'query_by': 'name,brand,subcategory,keySpecsText,tags',
        'query_by_weights': '8,5,4,2,3',
        'per_page': limit,
        'page': safePage,
        'sort_by': '_text_match:desc,techScore:desc',
        'prioritize_exact_match': true,
        'prioritize_token_position': true,
        'prioritize_num_matching_fields': true,
        'text_match_type': 'max_score',
        // infix KAPALI. 'always' infix, "g3"/"lg" gibi kısa token'ları indeks
        // token'larının İÇİNDE substring olarak eşleştirip aramayı 7000+ alakasız
        // ürüne patlatıyordu (LG G3 → bilgisayar kasaları). Kapatınca "lg g3"
        // yalnızca gerçek LG G3 modellerini döndürür; "rm850x" gibi gerçek
        // token'lar zaten infix olmadan da eşleşir (cihazda doğrulandı).
        'infix': 'off,off,off,off,off',
        // Only allow 1 typo for tokens with 4+ characters; short numeric
        // tokens (e.g. "8", "9") must match exactly — prevents "Note 8"
        // from matching "Note 9" or "Note 15" via typo expansion.
        'num_typos': '1,0,1,1,1',
        'min_len_1typo': 4,
        'min_len_2typo': 8,
        'drop_tokens_threshold': 0,
        'typo_tokens_threshold': 0,
        'prefix': 'true,false,true,false,false',
        // Search results are list cards too — drop the ~68KB `_raw` blob so
        // results return in <1s instead of multiple seconds. Detail re-fetches.
        'exclude_fields': '_raw,keySpecsText',
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

      // Trust Typesense. The pb_hooks/typesense_sync.pb.js delete hook + the
      // admin pb_client.js retry queue keep TS in sync with PB. Round-tripping
      // through `getProductsByIds` to "validate" was costing 50-id chunks ×
      // every search — turning a 100ms TS hit into ~5-20s on a busy host.
      // Genuinely deleted rows now short-circuit at the detail-screen dead-id
      // cache after one failed lookup (see PbDataSource._knownDeadProductIds).
      final ranked = rankProductsForQuery(filtered, q, limit: limit);

      _evictSearchResultCache();
      _searchResultCache[cacheKey] = (results: ranked, time: DateTime.now());
      return ranked;
    } catch (e) {
      debugPrint('SEARCH: Typesense failed: $e');
    }

    // Fallback: homeFeed products
    if (_homeFeedProducts != null && _homeFeedProducts!.isNotEmpty) {
      final ranked = _scoreAndRankProducts(
        _homeFeedProducts!,
        q,
        limit * safePage,
      );
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
          record.get<String>('created'),
      if (analysisData['result'] != null) 'result': analysisData['result'],
      if (analysisData['results'] != null) 'results': analysisData['results'],
      if (analysisData['products'] != null)
        'products': analysisData['products'],
      if (analysisData['urls'] != null) 'urls': analysisData['urls'],
      if (analysisData['analysis'] != null)
        'analysis': analysisData['analysis'],
      if (analysisData['quizAnswers'] != null)
        'quizAnswers': analysisData['quizAnswers'],
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
          record.get<String>('created'),
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
      'quizAnswers': analysisData['quizAnswers'],
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
        try {
          final result = await _pb
              .collection('chat_conversations')
              .getList(
                page: 1,
                perPage: 50,
                filter: 'userId = "$userId"',
                sort: '-updated',
              )
              .timeout(const Duration(seconds: 12));
          return result.items.map(ChatConversation.fromPb).toList();
        } catch (error) {
          debugPrint('[PbDs] chat history load failed: $error');
          return <ChatConversation>[];
        }
      },
      shouldReload: (event) => event.record?.data['userId'] == userId,
    );
  }

  Future<List<ChatConversation>> getChatConversations(String userId) async {
    if (userId.trim().isEmpty) return <ChatConversation>[];
    try {
      final result = await _pb
          .collection('chat_conversations')
          .getList(
            page: 1,
            perPage: 50,
            filter: 'userId = "$userId"',
            sort: '-updated',
          )
          .timeout(const Duration(seconds: 10));
      return result.items.map(ChatConversation.fromPb).toList();
    } catch (error) {
      debugPrint('[PbDs] chat history future load failed: $error');
      return <ChatConversation>[];
    }
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

  Future<List<ProductModel>> _parseTypesenseProductsOffMainThread(
    List<dynamic> rawHits,
  ) async {
    final hitMaps = rawHits
        .whereType<Map>()
        .map((hit) => Map<String, dynamic>.from(hit))
        .toList(growable: false);
    if (hitMaps.isEmpty) return const <ProductModel>[];
    return compute(_parseTypesenseHitsToProducts, hitMaps);
  }

  /// Fetch a single product from Typesense by id (full record via `_raw`).
  /// Detail-page fallback: when PocketBase is overloaded/slow or the record
  /// 404s (deleted from PB but still indexed), the Typesense doc carries the
  /// complete PocketBase JSON in `_raw`, so the detail screen can still render
  /// instead of failing with "Product not found".
  ///
  /// In-process "dead id" cache: when a product 404s on BOTH PB and TS, every
  /// downstream rebuild of `recentlyViewedProductsProvider` /
  /// `homeFeedProvider` would re-issue the same lookup, fanning into 5-10
  /// failed requests per dead id per minute on Riverpod rebuilds. The set
  /// short-circuits those callers so a deleted product is paid for exactly
  /// once per app session.
  static final Set<String> _knownDeadProductIds = <String>{};

  static void markProductMissing(String id) {
    if (id.isNotEmpty) _knownDeadProductIds.add(id);
  }

  static bool isProductKnownMissing(String id) =>
      _knownDeadProductIds.contains(id);

  Future<ProductModel?> getProductFromTypesense(String id) async {
    if (id.isEmpty) return null;
    if (_knownDeadProductIds.contains(id)) return null;
    try {
      final response = await _dio.get(
        '/collections/products/documents/${Uri.encodeComponent(id)}',
        // validateStatus keeps 404 from throwing a noisy DioException —
        // a deleted product is the expected case here, not an error.
        options: Options(
          receiveTimeout: const Duration(seconds: 12),
          validateStatus: (code) => code != null && code < 500,
        ),
      );
      if (response.statusCode == 404) {
        _knownDeadProductIds.add(id);
        return null;
      }
      final doc = response.data;
      if (doc is! Map) return null;
      final map = Map<String, dynamic>.from(doc);
      final rawStr = map['_raw'] as String?;
      if (rawStr != null && rawStr.isNotEmpty) {
        final raw = jsonDecode(rawStr) as Map<String, dynamic>;
        return ProductModel.fromMap(raw);
      }
      return ProductModel.fromMap(map);
    } catch (e) {
      // Only network/parse failures land here now — 404 returns above.
      debugPrint('[PbDs] getProductFromTypesense $id: $e');
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
          // List cards only need the flat doc fields (name/brand/image/score);
          // drop the ~68KB-per-doc `_raw` blob. The detail screen re-fetches the
          // full record. Without this a 500-item browse pulled ~34MB.
          'exclude_fields': '_raw,keySpecsText',
        },
      );
      sw.stop();
      final hits = (response.data['hits'] as List?) ?? [];
      // Trust Typesense (see search-path comment) — the PB validation pass
      // used to add 50-id chunks × ~1s each on top of every category fetch.
      final products = await _parseTypesenseProductsOffMainThread(hits);
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
  /// Returns a `Map<category, List<ProductModel>>`.
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
              // CRITICAL home-feed fix: drop the ~68KB `_raw` blob per doc. With
              // 48 categories × 28 products this request was ~90MB → the home
              // page took ages to populate. Cards parse from the flat fields;
              // the detail screen re-fetches the full record on tap.
              'exclude_fields': '_raw,keySpecsText',
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
        // Trust TS — the PB `getProductsByIds` post-validation used to fire
        // up to 23 sequential PB requests (50-id chunks across 1120
        // multi-category hits) and was the single biggest source of
        // home-feed cold-start latency on the shared host.
        results[categories[i]] = await _parseTypesenseProductsOffMainThread(
          hits,
        );
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

  /// Paginated Typesense query for a category. Used by category browse.
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
    // Exact match per variant. TS `category:[...]` TOKEN-matches → bare 'cameras'
    // token yanlışlıkla ip_cameras/action_cameras vb. yakalıyordu (615 lens yerine
    // 1664). exact-OR (`category:=A || category:=B`) tüm kategorilerde token
    // sızıntısını keser.
    final filterBy = variants.map((v) => 'category:=$v').join(' || ');
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
        final products = await _parseTypesenseProductsOffMainThread(hits);
        for (final p in products) {
          if (seenIds.add(p.id)) all.add(p);
        }
        final found = (response.data['found'] as int?) ?? 0;
        if (page * perPage >= found) break;
        page++;
      }
      sw.stop();
      // Trust TS — PB post-validation was costing this category-browse path
      // up to N×50 sequential PB requests on top of the Typesense pagination.
      debugPrint(
        '=== QOR AI: TS allInCat cat=$category → ${all.length} in ${sw.elapsedMilliseconds}ms ===',
      );
      return all;
    } catch (e) {
      debugPrint('=== QOR AI: TS allInCat cat=$category FAILED: $e ===');
      return [];
    }
  }

  Future<List<ProductModel>> getFilterCatalogProductsInCategoryTs({
    required String category,
    int perPage = 250,
    int maxTotal = 7000,
  }) async {
    final cacheKey = category.toLowerCase().trim();
    final cached = _filterCatalogCache[cacheKey];
    if (cached != null &&
        DateTime.now().difference(cached.time) < _filterCatalogCacheTtl) {
      return cached.products;
    }

    final products = await getAllProductsInCategoryTs(
      category: category,
      perPage: perPage,
      maxTotal: maxTotal,
      sortBy: 'techScore:desc,trendScore:desc',
    );
    if (products.isNotEmpty) {
      _filterCatalogCache[cacheKey] = (
        products: products,
        time: DateTime.now(),
      );
    }
    return products;
  }

  /// Fetches multiple facets from Typesense for a category using a single
  /// lightweight query (per_page=0). Much faster than loading all products.
  Future<Map<String, List<FilterOption>>> getTypesenseFacets({
    required String category,
    int maxFacetValues = 300,
    List<String> facets = const ['brand', 'filterTokens'],
  }) async {
    try {
      final sw = Stopwatch()..start();
      final variants = _categoryVariants(category);
      // exact-OR (token sızıntısı yok — bkz. getProductsPageTs notu).
      final filterBy = variants.map((v) => 'category:=$v').join(' || ');
      final response = await _dio.get(
        '/collections/products/documents/search',
        queryParameters: {
          'q': '*',
          'filter_by': filterBy,
          'per_page': 0,
          'facet_by': _sanitizeTypesenseFacetFields(facets).join(','),
          'max_facet_values': maxFacetValues,
        },
      );
      sw.stop();
      final Map<String, List<FilterOption>> results = {};
      final facetCounts = response.data['facet_counts'] as List?;
      if (facetCounts != null) {
        for (final fc in facetCounts) {
          final fieldName = fc['field_name'] as String;
          final counts = fc['counts'] as List? ?? [];
          final options = <FilterOption>[];
          for (final c in counts) {
            final value = ((c['value'] as String?) ?? '').trim();
            if (value.isEmpty) continue;
            final count = (c['count'] as num?)?.toInt();

            if (fieldName == 'filterTokens') {
              final parsed = _filterOptionFromToken(value, count: count);
              if (parsed != null) {
                results.putIfAbsent(parsed.filterId, () => <FilterOption>[]);
                final existingIds = results[parsed.filterId]!
                    .map((option) => option.id)
                    .toSet();
                if (existingIds.add(parsed.option.id)) {
                  results[parsed.filterId]!.add(parsed.option);
                }
              }
            } else {
              options.add(
                FilterOption(
                  id: value.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '_'),
                  label: value,
                  count: count,
                ),
              );
            }
          }
          if (fieldName != 'filterTokens') {
            results[fieldName] = options;
          }
        }
      }
      debugPrint(
        '=== QOR AI: TS getTypesenseFacets cat=$category → ${results.keys.length} fields evaluated in ${sw.elapsedMilliseconds}ms ===',
      );
      return results;
    } catch (e) {
      debugPrint(
        '=== QOR AI: TS getTypesenseFacets cat=$category FAILED: $e ===',
      );
      return {};
    }
  }

  List<String> _sanitizeTypesenseFacetFields(List<String> facets) {
    const supportedFields = {
      'brand',
      'category',
      'subcategory',
      'tags',
      'filterTokens',
    };
    final sanitized = facets
        .where((field) => supportedFields.contains(field.trim()))
        .toSet()
        .toList(growable: false);
    return sanitized.isEmpty ? const ['brand', 'filterTokens'] : sanitized;
  }

  ({String filterId, FilterOption option})? _filterOptionFromToken(
    String token, {
    int? count,
  }) {
    final separator = token.indexOf(':');
    if (separator <= 0 || separator == token.length - 1) return null;

    final filterId = token.substring(0, separator).trim();
    final optionId = token.substring(separator + 1).trim();
    if (filterId.isEmpty || optionId.isEmpty) {
      return null;
    }

    return (
      filterId: filterId,
      option: FilterOption(
        id: optionId,
        label: _labelForFacetOption(optionId),
        count: count,
      ),
    );
  }

  String _labelForFacetOption(String optionId) {
    final normalized = optionId.trim();
    final storageMatch = RegExp(r'^(\d+)_(gb|tb)$').firstMatch(normalized);
    if (storageMatch != null) {
      return '${storageMatch.group(1)} ${storageMatch.group(2)!.toUpperCase()}';
    }

    final refreshMatch = RegExp(r'^(\d+)_hz$').firstMatch(normalized);
    if (refreshMatch != null) return '${refreshMatch.group(1)} Hz';

    if (normalized == 'type_c') return 'USB Type-C';
    if (normalized == 'micro_usb') return 'Micro-USB';
    if (normalized == 'mini_usb') return 'Mini-USB';
    if (normalized == 'wi-fi') return 'Wi-Fi';

    return normalized
        .split('_')
        .where((part) => part.isNotEmpty)
        .map((part) {
          if (part.length <= 3) return part.toUpperCase();
          return part[0].toUpperCase() + part.substring(1);
        })
        .join(' ');
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
    String query = '*',
    String? extraFilterBy,
  }) async {
    try {
      final sw = Stopwatch()..start();

      // Build alternative category slugs to handle inconsistent naming in
      // Typesense (e.g. "vr-headsets" vs "vr_headsets" vs "VR Headsets").
      // Typesense exact-match filter only finds records that match the stored
      // field value exactly, so we probe all plausible variants in one query.
      final variants = _categoryVariants(category);
      // exact-OR (token sızıntısı yok). extraFilterBy ile birleşirken parantez
      // şart: `(A || B) && C` — yoksa `A || (B && C)` olur.
      final categoryFilterBy = variants.map((v) => 'category:=$v').join(' || ');
      final filterBy =
          (extraFilterBy != null && extraFilterBy.trim().isNotEmpty)
          ? '($categoryFilterBy) && ${extraFilterBy.trim()}'
          : categoryFilterBy;

      final trimmedQuery = query.trim();
      final isSearch = trimmedQuery.isNotEmpty && trimmedQuery != '*';
      // Normalize: split alpha-digit boundaries ("note9" → "note 9") so
      // model numbers become separate Typesense tokens.
      final tsQuery = isSearch ? _normalizeSearchQuery(trimmedQuery) : '*';

      final response = await _dio.get(
        '/collections/products/documents/search',
        queryParameters: {
          'q': tsQuery,
          if (isSearch) 'query_by': 'name,brand,subcategory,keySpecsText,tags',
          if (isSearch) 'query_by_weights': '8,5,4,2,3',
          if (isSearch) 'prioritize_exact_match': true,
          if (isSearch) 'prioritize_token_position': true,
          if (isSearch) 'prioritize_num_matching_fields': true,
          if (isSearch) 'text_match_type': 'max_score',
          // infix KAPALI — bkz. searchProducts notu (kısa token substring
          // patlamasını önler; kategori içi aramada da alaka artar).
          if (isSearch) 'infix': 'off,off,off,off,off',
          if (isSearch) 'num_typos': '1,0,1,1,1',
          if (isSearch) 'min_len_1typo': 4,
          if (isSearch) 'min_len_2typo': 8,
          if (isSearch) 'drop_tokens_threshold': 0,
          if (isSearch) 'typo_tokens_threshold': 0,
          if (isSearch) 'prefix': 'true,false,true,false,false',
          'search_cutoff_ms': isSearch ? 2200 : 1500,
          'filter_by': filterBy,
          'sort_by': isSearch ? '_text_match:desc,techScore:desc' : sortBy,
          'per_page': limit,
          'page': page,
          'exclude_fields': 'keySpecsText',
        },
      );
      sw.stop();
      final hits = (response.data['hits'] as List?) ?? [];
      // Trust TS — pre-existing PB validation was the hidden source of
      // category-browse latency. Stale rows get caught at detail-screen
      // open via the dead-id memoization.
      final products = await _parseTypesenseProductsOffMainThread(hits);
      final found = (response.data['found'] as int?) ?? 0;
      final hasMore = (page * limit) < found;
      debugPrint(
        '=== QOR AI: TS getProductsPage cat=$category filter=$filterBy page=$page → ${products.length}/$found in ${sw.elapsedMilliseconds}ms ===',
      );
      return (
        products: products,
        nextPage: page + 1,
        hasMore: hasMore,
        totalFound: found,
      );
    } catch (e) {
      if (e is DioException) {
        debugPrint(
          '=== QOR AI: TS getProductsPage FAILED cat=$category req: ${e.requestOptions.queryParameters} res: ${e.response?.data} ===',
        );
      } else {
        debugPrint(
          '=== QOR AI: TS getProductsPage FAILED cat=$category: $e ===',
        );
      }
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

  /// Paginated top-rated query across ALL categories, sorted by tech score.
  /// Used by the search screen's Top Rated grid to lazy-load beyond the
  /// homeFeed snapshot (which was capped at 20).
  Future<
    ({List<ProductModel> products, int nextPage, bool hasMore, int totalFound})
  >
  getTopRatedPageTs({int limit = 20, int page = 1}) async {
    try {
      final sw = Stopwatch()..start();
      final requestLimit = (limit * 6).clamp(limit, 120);
      final response = await _dio.get(
        '/collections/products/documents/search',
        queryParameters: {
          'q': '*',
          'sort_by': 'techScore:desc,trendScore:desc',
          'per_page': requestLimit,
          'page': page,
          'exclude_fields': 'keySpecsText',
        },
      );
      sw.stop();
      final hits = (response.data['hits'] as List?) ?? [];
      final rawProducts = hits
          .map((h) => _tsHitToProduct(h as Map<String, dynamic>))
          .whereType<ProductModel>()
          .toList();
      final products = _rankTopRatedProducts(rawProducts).take(limit).toList();
      final found = (response.data['found'] as int?) ?? 0;
      final hasMore = (page * requestLimit) < found;
      debugPrint(
        '=== QOR AI: TS getTopRated page=$page -> ${products.length}/${rawProducts.length}/$found in ${sw.elapsedMilliseconds}ms ===',
      );
      return (
        products: products,
        nextPage: page + 1,
        hasMore: hasMore,
        totalFound: found,
      );
    } catch (e) {
      debugPrint('=== QOR AI: TS getTopRated FAILED page=$page: $e ===');
      return (
        products: <ProductModel>[],
        nextPage: page,
        hasMore: false,
        totalFound: 0,
      );
    }
  }

  List<ProductModel> _rankTopRatedProducts(List<ProductModel> products) {
    final canonicalTechCats =
        AppCategories.subcategories[AppCategories.tech]?.toSet() ?? const {};
    final filtered = products.where((p) {
      if (!p.isActive) return false;
      if (p.techScore < 35) return false;
      if (p.imageURL.trim().isEmpty && p.images.isEmpty) return false;
      final category = p.category.toLowerCase().trim();
      if (!canonicalTechCats.contains(category)) return false;
      return ProductFilter.isAllowed(p);
    }).toList();
    final deduped = _dedupeTopRatedProducts(filtered);
    deduped.sort((a, b) {
      final scoreCompare = _topRatedScore(b).compareTo(_topRatedScore(a));
      if (scoreCompare != 0) return scoreCompare;
      final techCompare = b.techScore.compareTo(a.techScore);
      if (techCompare != 0) return techCompare;
      return b.trendScore.compareTo(a.trendScore);
    });
    return deduped;
  }

  List<ProductModel> _dedupeTopRatedProducts(List<ProductModel> products) {
    final byKey = <String, ProductModel>{};
    for (final product in products) {
      final key = _topRatedVariantKey(product);
      final existing = byKey[key];
      if (existing == null ||
          _topRatedScore(product) > _topRatedScore(existing)) {
        byKey[key] = product;
      }
    }
    return byKey.values.toList();
  }

  String _topRatedVariantKey(ProductModel product) {
    final variantGroup = product.variantGroup.trim().toLowerCase();
    if (variantGroup.isNotEmpty) return 'vg:$variantGroup';
    final normalizedName = product.name
        .toLowerCase()
        .replaceAll(RegExp(r'\b\d+\s?(gb|tb|mb|mah|w)\b'), '')
        .replaceAll(RegExp(r'\b(black|white|silver|gray|grey|blue|red)\b'), '')
        .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    return 'name:${product.brand?.toLowerCase().trim() ?? ''}:$normalizedName';
  }

  double _topRatedScore(ProductModel product) {
    final category = product.category.toLowerCase().trim();
    final categoryWeight = _topRatedCategoryWeight(category);
    final specQuality =
        (product.keySpecs.length * 0.18 +
                product.specs.length * 0.04 +
                product.specSections.length * 0.12)
            .clamp(0.0, 1.0)
            .toDouble();
    final priceSignal =
        product.prices.isNotEmpty ||
            product.affiliateLinks.isNotEmpty ||
            product.affiliateLinksByCountry.isNotEmpty
        ? 1.0
        : 0.0;
    final trend = product.trendScore.clamp(0.0, 100.0).toDouble();
    final freshness = _topRatedFreshness(product);
    return product.techScore * 0.62 +
        trend * 0.10 +
        categoryWeight * 22 +
        specQuality * 8 +
        priceSignal * 4 +
        freshness * 8;
  }

  double _topRatedCategoryWeight(String category) {
    const primary = {
      'smartphones',
      'laptops',
      'tablets',
      'smartwatches',
      'headphones',
      'monitors',
      'tvs',
      'graphics_cards',
      'cpus',
      'gaming_consoles',
      'vr_headsets',
      'drones',
    };
    const secondary = {
      'desktops',
      'motherboards',
      'ram',
      'ssd',
      'keyboards',
      'mice',
      'gamepads',
      'speakers',
      'routers',
      'robot_vacuums',
      'projectors',
      'smart_rings',
      'e_readers',
    };
    const lowPriority = {
      'flash_drives',
      'printers',
      '3d_printers',
      'chargers',
      'powerbanks',
      'psu',
      'pc_cases',
      'ups',
      'cpu_coolers',
      'laptop_coolers',
      'case_fans',
      'webcams',
      'microphones',
      'modem_routers',
      'media_players',
      'av_receivers',
      'camera_lenses',
      'ip_cameras',
      'dashcams',
      'gimbals',
      'hardware_wallets',
    };
    if (primary.contains(category)) return 1.0;
    if (secondary.contains(category)) return 0.72;
    if (lowPriority.contains(category)) return 0.25;
    return 0.55;
  }

  double _topRatedFreshness(ProductModel product) {
    final year = ProductFilter.getExactReleaseYear(product);
    final currentYear = DateTime.now().year;
    if (year != null) {
      final age = (currentYear - year).clamp(0, 8).toDouble();
      return (1.0 - (age / 8)).clamp(0.0, 1.0).toDouble();
    }
    final createdAt = product.createdAt;
    if (createdAt == null) return 0.45;
    final ageDays = DateTime.now()
        .difference(createdAt)
        .inDays
        .clamp(0, 900)
        .toDouble();
    return (1.0 - (ageDays / 900)).clamp(0.0, 1.0).toDouble();
  }

  /// Normalizes a search query for Typesense: splits alpha-digit boundaries
  /// and multi-letter numeric suffixes while keeping single-letter model
  /// suffixes intact ("2600x", "5g").
  static String _normalizeSearchQuery(String query) {
    var q = query.trim().toLowerCase();
    // letter → digit boundary: "note9" → "note 9". Yalnızca 3+ harfli kök
    // ayrılır; "g3"/"s24"/"a54"/"m3" gibi model kodları bölünmez (bölünürse
    // tek "3" token'ı Typesense'te tüm model numaralarıyla eşleşir).
    q = q.replaceAllMapped(RegExp(r'([a-z]{3,})(\d)'), (m) => '${m[1]} ${m[2]}');
    // digit → multi-letter boundary: "9pro" → "9 pro", but keep "2600x".
    q = q.replaceAllMapped(
      RegExp(r'(\d)([a-z]{2,})'),
      (m) => '${m[1]} ${m[2]}',
    );
    // collapse extra whitespace
    return q.replaceAll(RegExp(r'\s+'), ' ').trim();
  }

  /// Returns all plausible Typesense slug variants for a category name.
  /// Covers the most common inconsistencies: hyphen vs underscore, mixed case,
  /// and trimmed whitespace.
  static List<String> _categoryVariants(String category) {
    final trimmed = category.trim();
    final canonical = _canonicalCategory(trimmed);
    // Produce hyphenated and underscored lower-case slugs.
    final lower = canonical.toLowerCase();
    final hyphenated = lower.replaceAll('_', '-').replaceAll(' ', '-');
    final underscored = lower.replaceAll('-', '_').replaceAll(' ', '_');
    final spaced = lower.replaceAll('-', ' ').replaceAll('_', ' ');

    // Collect unique variants preserving the original as first candidate.
    final seen = <String>{};
    final result = <String>[];
    for (final v in [
      trimmed,
      canonical,
      hyphenated,
      underscored,
      spaced,
      ...(_legacyCategoryAliases[trimmed.toLowerCase()] ?? const <String>[]),
    ]) {
      if (seen.add(v)) result.add(v);
    }
    return result;
  }

  static String _canonicalCategory(String category) {
    final key = category.toLowerCase().trim();
    return _categoryCanonicalAliases[key] ?? key;
  }

  static const Map<String, String> _categoryCanonicalAliases = {
    'gpu': 'graphics_cards',
    'gpus': 'graphics_cards',
    'graphics-cards': 'graphics_cards',
    'graphics cards': 'graphics_cards',
    'case': 'pc_cases',
    'cases': 'pc_cases',
    'pc-cases': 'pc_cases',
    'cooler': 'cpu_coolers',
    'coolers': 'cpu_coolers',
    'cpu-coolers': 'cpu_coolers',
    'power-supplies': 'psu',
    'power_supplies': 'psu',
    'power supplies': 'psu',
    'consoles': 'gaming_consoles',
    'game-consoles': 'gaming_consoles',
    'game consoles': 'gaming_consoles',
    // Feature phones merged into smartphones — one phone category everywhere.
    'feature-phones': 'smartphones',
    'feature_phones': 'smartphones',
    'feature phones': 'smartphones',
    'tuslu-telefon': 'smartphones',
    'tuslu telefon': 'smartphones',
    'smart-rings': 'smart_rings',
    'power_banks': 'powerbanks',
    'power-banks': 'powerbanks',
    'power banks': 'powerbanks',
    'e-readers': 'e_readers',
    'vr-headsets': 'vr_headsets',
    'flash-drives': 'flash_drives',
    'laptop-coolers': 'laptop_coolers',
    '3d-printers': '3d_printers',
    'audio-systems': 'audio_systems',
    'av-receivers': 'av_receivers',
    'media-players': 'media_players',
    'camera-lenses': 'camera_lenses',
    'ip-cameras': 'ip_cameras',
    'dash cameras': 'dashcams',
    'hardware-wallets': 'hardware_wallets',
    'routers': 'routers',
    'router': 'routers',
    'wifi_routers': 'routers',
    'wifi-routers': 'routers',
    'wi-fi routers': 'routers',
    'modem-routers': 'modem_routers',
    'network_switches': 'routers',
    'network-switches': 'routers',
    'pcie_nic': 'routers',
    'pcie-network-cards': 'routers',
    'pcie-nic': 'routers',
    'robot-vacuums': 'robot_vacuums',
    'robot vacuums': 'robot_vacuums',
    'vacuums': 'robot_vacuums',
    'vacuum-cleaners': 'robot_vacuums',
    'vacuum cleaners': 'robot_vacuums',
    'action_cameras': 'camera_lenses',
    'action-cameras': 'camera_lenses',
    'action cameras': 'camera_lenses',
    'security_cameras': 'camera_lenses',
    'security-cameras': 'camera_lenses',
    'security cameras': 'camera_lenses',
    'digital_cameras': 'camera_lenses',
    'digital-cameras': 'camera_lenses',
    'video_cameras': 'camera_lenses',
    'video-cameras': 'camera_lenses',
    'film_cameras': 'camera_lenses',
    'camera_objectives': 'camera_lenses',
    'lenses': 'camera_lenses',
    'ssds': 'ssd',
  };

  static const Map<String, List<String>> _legacyCategoryAliases = {
    'graphics_cards': ['gpus', 'graphics-cards'],
    'smartphones': ['feature-phones', 'feature_phones', 'tuslu-telefon'],
    'smart_rings': ['smart-rings'],
    'e_readers': ['e-readers'],
    'vr_headsets': ['vr-headsets'],
    'flash_drives': [
      'flash-drives',
      'external_hdd',
      'external-hdd',
      'external_hdds',
      'memory_cards',
      'memory-cards',
    ],
    'pc_cases': ['cases', 'pc-cases'],
    'cpu_coolers': ['coolers', 'cpu-coolers'],
    'laptop_coolers': ['laptop-coolers'],
    'gaming_consoles': ['consoles', 'game-consoles'],
    '3d_printers': ['3d-printers'],
    'audio_systems': [
      'audio-systems',
      'soundbars',
      'surround_systems',
      'compact_hifi',
    ],
    'av_receivers': ['av-receivers', 'hifi_receivers'],
    'media_players': ['media-players'],
    // NOT: Typesense `category` filtresi TOKEN eşliyor — bare 'cameras' token'ı
    // ip_cameras/action_cameras/security_cameras vb. HEPSİNİ yakalıyordu (615
    // lens yerine 1664 karışık sonuç). Bu yüzden burada SADECE gerçek lens
    // slug'ları olmalı; kamera kategorileri ASLA değil.
    'camera_lenses': [
      'camera-lenses',
      'camera_objectives',
      'camera-objectives',
      'lenses',
    ],
    'ip_cameras': ['ip-cameras'],
    'routers': [
      'wifi_routers',
      'wifi-routers',
      'network_switches',
      'network-switches',
      'pcie_nic',
      'pcie-network-cards',
    ],
    'robot_vacuums': ['robot-vacuums', 'vacuums', 'vacuum-cleaners'],
    'powerbanks': ['power_banks', 'power-banks'],
    'ssd': ['ssds'],
  };

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
