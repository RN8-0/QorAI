/// Qor AI - Product Repository
/// Blueprint Section 3.1
library;

import 'package:qor_ai/core/constants.dart';
import 'package:qor_ai/core/errors.dart';
import 'package:qor_ai/data/datasources/pb_ds.dart';
import 'package:qor_ai/data/datasources/hive_ds.dart';
import 'package:qor_ai/data/models/product_model.dart';
import 'package:qor_ai/data/models/other_models.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';

class ProductRepository {
  final PbDataSource _pbDS;
  final HiveDataSource _hiveDS;

  ProductRepository({
    required PbDataSource pbDS,
    required HiveDataSource hiveDS,
  }) : _pbDS = pbDS,
       _hiveDS = hiveDS;

  /// Get single product — PocketBase is the source of truth, with a Typesense
  /// fallback so the detail page still loads when PocketBase is overloaded
  /// (e.g. while the scraper runs) or the record 404s but is still indexed.
  Future<Result<ProductEntity>> getProduct(String id) async {
    // Session-level dead-id short-circuit. `recentlyViewedProductsProvider`
    // re-runs on every homeFeedProvider rebuild, and without this each dead
    // id costs (PB call + TS call) every time — 5-10 wasted requests per
    // deleted product per minute, which is the exact pattern captured in
    // the device log that drove this fix.
    if (PbDataSource.isProductKnownMissing(id)) {
      return const Failure(ServerException(message: 'Product not found'));
    }
    try {
      final product = await _pbDS.getProduct(id);
      if (product == null) {
        // PB returned 404. Before giving up, try the Typesense copy — its
        // `_raw` holds the full product, so a stale/lagging index still
        // renders instead of "Product not found".
        final tsProduct = await _pbDS.getProductFromTypesense(id);
        if (tsProduct != null) {
          _cacheProduct(id, tsProduct);
          return Success(tsProduct);
        }
        // Both sources 404'd — the product is genuinely gone. Mark it dead
        // so the next caller short-circuits, and drop the stale local cache.
        PbDataSource.markProductMissing(id);
        try {
          await _hiveDS.deleteSetting('product_$id');
        } catch (_) {}
        return const Failure(ServerException(message: 'Product not found'));
      }

      _cacheProduct(id, product);
      return Success(product);
    } catch (e) {
      // PocketBase failed (timeout/overload/network). Prefer the Typesense
      // copy, then a still-fresh local cache, before surfacing an error.
      final tsProduct = await _pbDS.getProductFromTypesense(id);
      if (tsProduct != null) {
        _cacheProduct(id, tsProduct);
        return Success(tsProduct);
      }
      try {
        final cached = _hiveDS.getSetting<Map<String, dynamic>>('product_$id');
        if (cached != null) {
          final cachedAt = cached['_cachedAt'] as int? ?? 0;
          final age = DateTime.now().millisecondsSinceEpoch - cachedAt;
          if (age < AppConstants.productCacheDuration.inMilliseconds) {
            return Success(ProductModel.fromMap(cached));
          }
        }
      } catch (_) {}
      return Failure(ServerException(message: e.toString()));
    }
  }

  void _cacheProduct(String id, ProductModel product) {
    try {
      final dataToCache = _serializeForCache(product.toFirestore());
      dataToCache['_cachedAt'] = DateTime.now().millisecondsSinceEpoch;
      _hiveDS.saveSetting('product_$id', dataToCache);
    } catch (_) {}
  }

  /// Get product list (with pagination) - Section 15.2
  Future<Result<List<ProductEntity>>> getProducts({
    String? category,
    String? subcategory,
    int limit = 20,
    String? lastProductId,
    String orderBy = 'name',
    bool descending = false,
    bool activeOnly = false,
  }) async {
    try {
      final products = await _pbDS.getProducts(
        category: category,
        subcategory: subcategory,
        limit: limit,
        orderBy: orderBy,
        descending: descending,
        activeOnly: activeOnly,
      );
      return Success(products);
    } catch (e) {
      return Failure(ServerException(message: e.toString()));
    }
  }

  /// Typesense: multi-category fetch in a single HTTP request
  Future<Result<Map<String, List<ProductEntity>>>> getProductsMultiCategoryTs({
    required List<String> categories,
    int perCategory = 80,
  }) async {
    try {
      final result = await _pbDS.getProductsMultiCategoryTs(
        categories: categories,
        perCategory: perCategory,
      );
      return Success(
        result.map((k, v) => MapEntry(k, v.cast<ProductEntity>())),
      );
    } catch (e) {
      return Failure(ServerException(message: e.toString()));
    }
  }

  /// Typesense: all products in a category (for full category loads).
  Future<Result<List<ProductEntity>>> getAllProductsInCategoryTs(
    String category, {
    int maxTotal = 5000,
  }) async {
    try {
      final products = await _pbDS.getAllProductsInCategoryTs(
        category: category,
        maxTotal: maxTotal,
      );
      return Success(products);
    } catch (e) {
      return Failure(ServerException(message: e.toString()));
    }
  }

  /// Typesense: paginated products (drop-in getProductsPage replacement)
  Future<
    ({List<ProductModel> products, int nextPage, bool hasMore, int totalFound})
  >
  getProductsPageTs({
    required String category,
    int limit = 200,
    int page = 1,
    String sortBy = 'techScore:desc',
  }) async {
    return _pbDS.getProductsPageTs(
      category: category,
      limit: limit,
      page: page,
      sortBy: sortBy,
    );
  }

  /// Get products by IDs
  Future<Result<List<ProductEntity>>> getProductsByIds(List<String> ids) async {
    try {
      final products = await _pbDS.getProductsByIds(ids);
      return Success(products);
    } catch (e) {
      return Failure(ServerException(message: e.toString()));
    }
  }

  /// Get categories — cache-first
  Future<Result<List<CategoryModel>>> getCategories() async {
    try {
      final categories = await _pbDS.getCategories();
      return Success(categories);
    } catch (e) {
      return Failure(ServerException(message: e.toString()));
    }
  }

  /// Delete product
  Future<Result<void>> deleteProduct(String id) async {
    try {
      await _pbDS.deleteProduct(id);
      // Also delete from cache
      await _hiveDS.deleteSetting('product_$id');
      return const Success(null);
    } catch (e) {
      return Failure(ServerException(message: e.toString()));
    }
  }

  /// Get trending products - Section 6.1
  Future<Result<List<TrendModel>>> getTrends({
    required String country,
    String? category,
  }) async {
    try {
      final trends = await _pbDS.getTrends(
        country: country,
        category: category,
      );
      return Success(trends);
    } catch (e) {
      return Failure(ServerException(message: e.toString()));
    }
  }

  /// Get product reviews
  Future<Result<List<ReviewModel>>> getProductReviews(
    String productId, {
    int limit = 20,
  }) async {
    try {
      final reviews = await _pbDS.getProductReviews(productId, limit: limit);
      return Success(reviews);
    } catch (e) {
      return Failure(ServerException(message: e.toString()));
    }
  }

  /// Add review
  Future<Result<void>> addReview(ReviewModel review) async {
    try {
      await _pbDS.createReview(review);
      return const Success(null);
    } catch (e) {
      return Failure(ServerException(message: e.toString()));
    }
  }

  /// Update review text
  Future<Result<void>> updateReview(String reviewId, String text) async {
    try {
      await _pbDS.updateReview(reviewId, text);
      return const Success(null);
    } catch (e) {
      return Failure(ServerException(message: e.toString()));
    }
  }

  /// Delete review
  Future<Result<void>> deleteReview(String reviewId) async {
    try {
      await _pbDS.deleteReview(reviewId);
      return const Success(null);
    } catch (e) {
      return Failure(ServerException(message: e.toString()));
    }
  }

  /// Toggle review like
  Future<Result<void>> toggleReviewLike(String reviewId, String userId) async {
    try {
      await _pbDS.toggleReviewLike(reviewId, userId);
      return const Success(null);
    } catch (e) {
      return Failure(ServerException(message: e.toString()));
    }
  }

  /// Toggle review dislike
  Future<Result<void>> toggleReviewDislike(
    String reviewId,
    String userId,
  ) async {
    try {
      await _pbDS.toggleReviewDislike(reviewId, userId);
      return const Success(null);
    } catch (e) {
      return Failure(ServerException(message: e.toString()));
    }
  }

  /// Return all products via in-memory cache (fastest path)
  Future<Result<List<ProductEntity>>> getAllCachedProducts() async {
    try {
      final models = await _pbDS.getAllCachedProducts();
      return Success(models);
    } catch (e) {
      return Failure(ServerException(message: e.toString()));
    }
  }

  /// Search products (in tags/name) - Section 6.1
  Future<Result<List<ProductEntity>>> searchProducts({
    required String query,
    int limit = 20,
    int page = 1,
  }) async {
    try {
      final products = await _pbDS.searchProducts(
        query: query,
        limit: limit,
        page: page,
      );
      return Success(products);
    } catch (e) {
      return Failure(ServerException(message: e.toString()));
    }
  }
}

/// Converts Firestore-specific objects (Timestamp etc.) to JSON-safe values
Map<String, dynamic> _serializeForCache(Map<String, dynamic> data) {
  return data.map((key, value) {
    if (value is DateTime) return MapEntry(key, value.toIso8601String());
    // Firestore Timestamp
    if (value != null && value.runtimeType.toString().contains('Timestamp')) {
      try {
        return MapEntry(key, (value as dynamic).toDate().toIso8601String());
      } catch (_) {}
    }
    if (value is Map<String, dynamic>) {
      return MapEntry(key, _serializeForCache(value));
    }
    if (value is Map) {
      return MapEntry(
        key,
        _serializeForCache({
          for (final e in value.entries) e.key.toString(): e.value,
        }),
      );
    }
    return MapEntry(key, value);
  });
}
