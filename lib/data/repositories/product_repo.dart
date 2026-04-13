/// Compair - Product Repository
/// Blueprint Section 3.1
library;

import 'package:compair/core/constants.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/data/datasources/pb_ds.dart';
import 'package:compair/data/datasources/hive_ds.dart';
import 'package:compair/data/models/product_model.dart';
import 'package:compair/data/models/other_models.dart';
import 'package:compair/domain/entities/product_entity.dart';

class ProductRepository {
  final PbDataSource _firebaseDS;
  final HiveDataSource _hiveDS;

  ProductRepository({
    required PbDataSource firebaseDS,
    required HiveDataSource hiveDS,
  })  : _firebaseDS = firebaseDS,
        _hiveDS = hiveDS;

  /// Get single product — cache-first, network-fallback (Section 7.4, 15.2)
  Future<Result<ProductEntity>> getProduct(String id) async {
    // 1. Hive cache kontrol (safe — uninitialized Hive = swallow)
    try {
      final cached = _hiveDS.getSetting<Map<String, dynamic>>('product_$id');
      if (cached != null) {
        final cachedAt = cached['_cachedAt'] as int? ?? 0;
        final age = DateTime.now().millisecondsSinceEpoch - cachedAt;
        if (age < AppConstants.productCacheDuration.inMilliseconds) {
          return Success(ProductModel.fromMap(cached));
        }
      }
    } catch (_) {} // Cache unavailable — go straight to network

    // 2. Network fetch (Firestore)
    try {
      final product = await _firebaseDS.getProduct(id);
      if (product == null) {
        return const Failure(FirestoreException(message: 'Product not found'));
      }

      // 3. Cache write (safe — never let this break the success path)
      try {
        final dataToCache = _serializeForCache(product.toFirestore());
        dataToCache['_cachedAt'] = DateTime.now().millisecondsSinceEpoch;
        await _hiveDS.saveSetting('product_$id', dataToCache);
      } catch (_) {}

      return Success(product);
    } catch (e) {
      return Failure(FirestoreException(message: e.toString()));
    }
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
      final products = await _firebaseDS.getProducts(
        category: category,
        subcategory: subcategory,
        limit: limit,
        orderBy: orderBy,
        descending: descending,
        activeOnly: activeOnly,
      );
      return Success(products);
    } catch (e) {
      return Failure(FirestoreException(message: e.toString()));
    }
  }

  /// Get products by IDs
  Future<Result<List<ProductEntity>>> getProductsByIds(
      List<String> ids) async {
    try {
      final products = await _firebaseDS.getProductsByIds(ids);
      return Success(products);
    } catch (e) {
      return Failure(FirestoreException(message: e.toString()));
    }
  }

  /// Get categories — cache-first
  Future<Result<List<CategoryModel>>> getCategories() async {
    try {
      final categories = await _firebaseDS.getCategories();
      return Success(categories);
    } catch (e) {
      return Failure(FirestoreException(message: e.toString()));
    }
  }

  /// Delete product
  Future<Result<void>> deleteProduct(String id) async {
    try {
      await _firebaseDS.deleteProduct(id);
      // Also delete from cache
      await _hiveDS.deleteSetting('product_$id');
      return const Success(null);
    } catch (e) {
      return Failure(FirestoreException(message: e.toString()));
    }
  }

  /// Get trending products - Section 6.1
  Future<Result<List<TrendModel>>> getTrends({
    required String country,
    String? category,
  }) async {
    try {
      final trends = await _firebaseDS.getTrends(
        country: country,
        category: category,
      );
      return Success(trends);
    } catch (e) {
      return Failure(FirestoreException(message: e.toString()));
    }
  }

  /// Get product reviews
  Future<Result<List<ReviewModel>>> getProductReviews(
    String productId, {
    int limit = 20,
  }) async {
    try {
      final reviews = await _firebaseDS.getProductReviews(
        productId,
        limit: limit,
      );
      return Success(reviews);
    } catch (e) {
      return Failure(FirestoreException(message: e.toString()));
    }
  }

  /// Add review
  Future<Result<void>> addReview(ReviewModel review) async {
    try {
      await _firebaseDS.createReview(review);
      return const Success(null);
    } catch (e) {
      return Failure(FirestoreException(message: e.toString()));
    }
  }

  /// Delete review
  Future<Result<void>> deleteReview(String reviewId) async {
    try {
      await _firebaseDS.deleteReview(reviewId);
      return const Success(null);
    } catch (e) {
      return Failure(FirestoreException(message: e.toString()));
    }
  }

  /// Toggle review like
  Future<Result<void>> toggleReviewLike(String reviewId, String userId) async {
    try {
      await _firebaseDS.toggleReviewLike(reviewId, userId);
      return const Success(null);
    } catch (e) {
      return Failure(FirestoreException(message: e.toString()));
    }
  }

  /// Toggle review dislike
  Future<Result<void>> toggleReviewDislike(String reviewId, String userId) async {
    try {
      await _firebaseDS.toggleReviewDislike(reviewId, userId);
      return const Success(null);
    } catch (e) {
      return Failure(FirestoreException(message: e.toString()));
    }
  }

  /// Return all products via in-memory cache (fastest path)
  Future<Result<List<ProductEntity>>> getAllCachedProducts() async {
    try {
      final models = await _firebaseDS.getAllCachedProducts();
      return Success(models);
    } catch (e) {
      return Failure(FirestoreException(message: e.toString()));
    }
  }

  /// Search products (in tags/name) - Section 6.1
  Future<Result<List<ProductEntity>>> searchProducts({
    required String query,
    int limit = 20,
  }) async {
    try {
      final products = await _firebaseDS.searchProducts(
        query: query,
        limit: limit,
      );
      return Success(products);
    } catch (e) {
      return Failure(FirestoreException(message: e.toString()));
    }
  }
}

/// Converts Firestore-specific objects (Timestamp etc.) to JSON-safe values
Map<String, dynamic> _serializeForCache(Map<String, dynamic> data) {
  return data.map((key, value) {
    if (value is DateTime) return MapEntry(key, value.toIso8601String());
    // Firestore Timestamp
    if (value != null && value.runtimeType.toString().contains('Timestamp')) {
      try { return MapEntry(key, (value as dynamic).toDate().toIso8601String()); } catch (_) {}
    }
    if (value is Map<String, dynamic>) return MapEntry(key, _serializeForCache(value));
    if (value is Map) {
      return MapEntry(key, _serializeForCache(
        {for (final e in value.entries) e.key.toString(): e.value}
      ));
    }
    return MapEntry(key, value);
  });
}
