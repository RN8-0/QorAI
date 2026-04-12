/// Compair - Firebase Data Source
/// Blueprint Section 3.1, 4
library;

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/foundation.dart';
import 'package:compair/core/constants.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/core/product_filter.dart';
import 'package:compair/data/models/user_model.dart';
import 'package:compair/data/models/product_model.dart';
import 'package:compair/data/models/comparison_model.dart';
import 'package:compair/data/models/other_models.dart';
import 'package:compair/data/models/chat_conversation.dart';

class FirebaseDataSource {
  final FirebaseFirestore _firestore;

  // ─── Local search result cache (recent queries, max 30, 5 min TTL) ───
  static final Map<String, ({List<ProductModel> results, DateTime time})> _searchResultCache = {};
  static const _searchResultCacheTtl = Duration(minutes: 5);
  static const _searchResultCacheMaxSize = 30;

  FirebaseDataSource({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  // ─── Users ─── Section 4.1

  Future<UserModel?> getUser(String uid) async {
    try {
      // Cache-first: instant profile on app launch
      try {
        final cachedDoc = await _firestore
            .collection(AppConstants.usersCollection)
            .doc(uid)
            .get(const GetOptions(source: Source.cache));
        if (cachedDoc.exists) {
          // Background refresh from server
          Future.microtask(() async {
            try {
              await _firestore
                  .collection(AppConstants.usersCollection)
                  .doc(uid)
                  .get(const GetOptions(source: Source.server));
            } catch (_) {}
          });
          return UserModel.fromFirestore(cachedDoc);
        }
      } catch (_) {}
      // No cache — fetch from server
      final doc = await _firestore
          .collection(AppConstants.usersCollection)
          .doc(uid)
          .get();
      if (!doc.exists) return null;
      return UserModel.fromFirestore(doc);
    } catch (e) {
      throw FirestoreException(message: 'User could not be retrieved: $e');
    }
  }

  Stream<UserModel?> watchUser(String uid) {
    return _firestore
        .collection(AppConstants.usersCollection)
        .doc(uid)
        .snapshots()
        .map((doc) => doc.exists ? UserModel.fromFirestore(doc) : null);
  }

  Future<void> createUser(UserModel user) async {
    try {
      await _firestore
          .collection(AppConstants.usersCollection)
          .doc(user.uid)
          .set(user.toFirestore());
    } catch (e) {
      throw FirestoreException(message: 'User could not be created: $e');
    }
  }

  Future<void> updateUser(String uid, Map<String, dynamic> data) async {
    try {
      data['updatedAt'] = FieldValue.serverTimestamp();
      await _firestore
          .collection(AppConstants.usersCollection)
          .doc(uid)
          .update(data);
    } catch (e) {
      throw FirestoreException(message: 'User could not be updated: $e');
    }
  }

  /// Toggle favorite product for user
  Future<bool> toggleFavorite(String uid, String productId) async {
    final docRef = _firestore.collection(AppConstants.usersCollection).doc(uid);
    final doc = await docRef.get();
    final data = doc.data() ?? {};
    final favorites = List<String>.from(data['favorites'] ?? []);
    final isFav = favorites.contains(productId);
    if (isFav) {
      favorites.remove(productId);
    } else {
      favorites.add(productId);
    }
    await docRef.update({
      'favorites': favorites,
      'updatedAt': FieldValue.serverTimestamp(),
    });
    return !isFav; // returns new state
  }

  // ─── Recently Viewed (Firestore persistence) ───

  /// Save a viewed product to Firestore sub-collection
  Future<void> addRecentlyViewed(String uid, String productId) async {
    try {
      final docRef = _firestore
          .collection(AppConstants.usersCollection)
          .doc(uid)
          .collection('recently_viewed')
          .doc(productId);
      await docRef.set({
        'productId': productId,
        'viewedAt': FieldValue.serverTimestamp(),
      });
    } catch (_) {}
  }

  /// Get recently viewed product IDs from Firestore (ordered by most recent)
  Future<List<String>> getRecentlyViewed(String uid) async {
    try {
      final snap = await _firestore
          .collection(AppConstants.usersCollection)
          .doc(uid)
          .collection('recently_viewed')
          .orderBy('viewedAt', descending: true)
          .limit(50)
          .get();
      return snap.docs.map((d) => d.id).toList();
    } catch (_) {
      return [];
    }
  }

  /// Stream recently viewed product IDs (realtime)
  Stream<List<String>> watchRecentlyViewed(String uid) {
    return _firestore
        .collection(AppConstants.usersCollection)
        .doc(uid)
        .collection('recently_viewed')
        .orderBy('viewedAt', descending: true)
        .limit(50)
        .snapshots()
        .map((snap) => snap.docs.map((d) => d.id).toList());
  }

  // ─── User Activity Tracking ───

  /// Save a quiz entry to user's quizHistory array (max 50 entries)
  Future<void> saveQuizHistory(String uid, Map<String, dynamic> entry) async {
    try {
      final docRef = _firestore.collection(AppConstants.usersCollection).doc(uid);
      await docRef.set({
        'quizHistory': FieldValue.arrayUnion([entry]),
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      debugPrint('[Firestore] Saved quiz history for $uid');
    } catch (e) {
      debugPrint('[Firestore] Failed to save quiz history: $e');
    }
  }

  /// Save an analyzed product entry (max 100 entries)
  Future<void> saveAnalyzedProduct(String uid, Map<String, dynamic> entry) async {
    try {
      final docRef = _firestore.collection(AppConstants.usersCollection).doc(uid);
      await docRef.set({
        'analyzedProducts': FieldValue.arrayUnion([entry]),
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      debugPrint('[Firestore] Saved analyzed product for $uid');
    } catch (e) {
      debugPrint('[Firestore] Failed to save analyzed product: $e');
    }
  }

  /// Save a search history entry (max 30 entries)
  Future<void> saveSearchHistory(String uid, Map<String, dynamic> entry) async {
    try {
      final docRef = _firestore.collection(AppConstants.usersCollection).doc(uid);
      await docRef.set({
        'searchHistory': FieldValue.arrayUnion([entry]),
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      debugPrint('[Firestore] Saved search history for $uid');
    } catch (e) {
      debugPrint('[Firestore] Failed to save search history: $e');
    }
  }

  /// Save a subscription comparison result
  Future<void> saveSubscriptionHistory(String uid, Map<String, dynamic> entry) async {
    try {
      final docRef = _firestore.collection(AppConstants.usersCollection).doc(uid);
      await docRef.set({
        'subscriptionHistory': FieldValue.arrayUnion([entry]),
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      debugPrint('[Firestore] Saved subscription history for $uid');
    } catch (e) {
      debugPrint('[Firestore] Failed to save subscription history: $e');
    }
  }

  /// Overwrite entire subscription history (used for deletions)
  Future<void> updateSubscriptionHistory(
      String uid, List<Map<String, dynamic>> history) async {
    try {
      final docRef = _firestore.collection(AppConstants.usersCollection).doc(uid);
      await docRef.update({
        'subscriptionHistory': history,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } catch (e) {
      debugPrint('[Firestore] Failed to update subscription history: $e');
    }
  }

  /// Read subscription comparison history
  Future<List<Map<String, dynamic>>> getSubscriptionHistory(String uid) async {
    try {
      final doc = await _firestore
          .collection(AppConstants.usersCollection)
          .doc(uid)
          .get();
      final data = doc.data();
      if (data == null || data['subscriptionHistory'] is! List) return [];
      return (data['subscriptionHistory'] as List)
          .cast<Map<String, dynamic>>()
          .reversed
          .take(20)
          .toList();
    } catch (e) {
      debugPrint('[Firestore] Failed to read subscription history: $e');
      return [];
    }
  }

  // ─── Link Analysis History ───

  /// Save a link analysis result to user's Firestore history
  Future<void> saveLinkAnalysisHistory(String uid, Map<String, dynamic> entry) async {
    try {
      final docRef = _firestore.collection(AppConstants.usersCollection).doc(uid);
      // Fetch current list, deduplicate by url, then prepend new entry
      final doc = await docRef.get();
      final data = doc.data() ?? {};
      final existing = (data['linkAnalysisHistory'] as List?)
              ?.cast<Map<String, dynamic>>() ??
          [];
      final url = entry['url'] as String? ?? '';
      final deduped = existing.where((e) => e['url'] != url).toList();
      deduped.insert(0, entry);
      final trimmed = deduped.take(30).toList();
      await docRef.set({
        'linkAnalysisHistory': trimmed,
        'updatedAt': FieldValue.serverTimestamp(),
      }, SetOptions(merge: true));
      debugPrint('[Firestore] Saved link analysis history for $uid');
    } catch (e) {
      debugPrint('[Firestore] Failed to save link analysis history: $e');
    }
  }

  /// Overwrite entire link analysis history (used for deletions)
  Future<void> updateLinkAnalysisHistory(
      String uid, List<Map<String, dynamic>> history) async {
    try {
      final docRef = _firestore.collection(AppConstants.usersCollection).doc(uid);
      await docRef.update({
        'linkAnalysisHistory': history,
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } catch (e) {
      debugPrint('[Firestore] Failed to update link analysis history: $e');
    }
  }

  /// Read link analysis history for a user
  Future<List<Map<String, dynamic>>> getLinkAnalysisHistory(String uid) async {
    try {
      final doc = await _firestore
          .collection(AppConstants.usersCollection)
          .doc(uid)
          .get();
      final data = doc.data();
      if (data == null || data['linkAnalysisHistory'] is! List) return [];
      return (data['linkAnalysisHistory'] as List)
          .cast<Map<String, dynamic>>()
          .take(30)
          .toList();
    } catch (e) {
      debugPrint('[Firestore] Failed to read link analysis history: $e');
      return [];
    }
  }

  // ─── Products ─── Section 4.2

  Future<ProductModel?> getProduct(String id) async {
    try {
      final doc = await _firestore
          .collection(AppConstants.productsCollection)
          .doc(id)
          .get()
          .timeout(const Duration(seconds: 20));
      if (!doc.exists) return null;
      return ProductModel.fromFirestore(doc);
    } on StackOverflowError catch (e) {
      // Deeply nested Firestore document causes JVM StackOverflow in the codec
      debugPrint('=== COMPAIR: Firestore StackOverflow for $id (deeply nested doc): $e ===');
      return null;
    } catch (e) {
      throw FirestoreException(message: 'Product could not be retrieved: $e');
    }
  }

  Future<List<ProductModel>> getProducts({
    String? category,
    String? subcategory,
    int limit = 20,
    DocumentSnapshot? startAfter,
    String orderBy = 'name',
    bool descending = false,
    bool activeOnly = false,
  }) async {
    try {
      Query query = _firestore
          .collection(AppConstants.productsCollection);

      if (category != null) {
        query = query.where('category', isEqualTo: category);
      }
      if (subcategory != null) {
        query = query.where('subcategory', isEqualTo: subcategory);
      }
      if (activeOnly) {
        query = query.where('isActive', isEqualTo: true);
      }

      // Sorting strategy:
      // - trendScore: always client-sort (sparse field → server sort excludes docs)
      // - techScore WITHOUT where: client-sort (server sort on 85k = too slow)
      // - techScore WITH where (category): server-sort (composite index exists)
      // - scrapedAt/createdAt: server-sort (auto single-field index, fast)
      // - name with where: client-sort to avoid needing compound index
      final hasWhereClause = category != null || subcategory != null;
      final useClientSort = orderBy == 'trendScore'
          || (orderBy == 'techScore' && !hasWhereClause)
          || (hasWhereClause && orderBy == 'name');

      if (!useClientSort) {
        query = query.orderBy(orderBy, descending: descending);
      }

      if (startAfter != null) {
        query = query.startAfterDocument(startAfter);
      }

      query = query.limit(limit);

      debugPrint('=== COMPAIR: getProducts EXECUTING query (limit=$limit, orderBy=$orderBy, cat=$category, active=$activeOnly, clientSort=$useClientSort) ===');
      final sw = Stopwatch()..start();
      QuerySnapshot snapshot;
      if (limit <= 100) {
        // Small queries: try local cache first for instant response
        try {
          snapshot = await query.get(const GetOptions(source: Source.cache))
              .timeout(const Duration(seconds: 3));
          if (snapshot.docs.isEmpty) throw Exception('cache empty');
          debugPrint('=== COMPAIR: getProducts from CACHE: ${snapshot.docs.length} docs in ${sw.elapsedMilliseconds}ms ===');
        } catch (_) {
          snapshot = await query.get().timeout(const Duration(seconds: 60));
          debugPrint('=== COMPAIR: getProducts from SERVER: ${snapshot.docs.length} docs in ${sw.elapsedMilliseconds}ms ===');
        }
      } else {
        // Large queries: go directly to server (cache scanning is slow for 1000+ docs)
        snapshot = await query.get().timeout(const Duration(seconds: 90));
        debugPrint('=== COMPAIR: getProducts BULK from SERVER: ${snapshot.docs.length} docs in ${sw.elapsedMilliseconds}ms ===');
      }
      sw.stop();
      final products = <ProductModel>[];
      for (final doc in snapshot.docs) {
        try {
          products.add(ProductModel.fromFirestore(doc));
        } catch (e) {
          debugPrint('=== COMPAIR: fromFirestore FAILED for ${doc.id}: $e ===');
        }
      }

      // Client-side sort when Firestore orderBy was skipped
      if (useClientSort) {
        if (orderBy == 'trendScore') {
          products.sort((a, b) => b.trendScore.compareTo(a.trendScore));
        } else if (orderBy == 'techScore') {
          products.sort((a, b) => b.techScore.compareTo(a.techScore));
        } else if (orderBy == 'name') {
          products.sort((a, b) => a.name.compareTo(b.name));
        }
      }

      return products;
    } on StackOverflowError catch (e) {
      debugPrint('=== COMPAIR: getProducts StackOverflow (deeply nested docs, cat=$category): $e ===');
      return [];
    } catch (e, st) {
      debugPrint('=== COMPAIR: getProducts ERROR: $e\n$st ===');
      throw FirestoreException(message: 'Products could not be retrieved: $e');
    }
  }

  /// Like [getProducts] but also returns the last DocumentSnapshot for cursor pagination.
  Future<({List<ProductModel> products, DocumentSnapshot? lastDoc})> getProductsPage({
    required String category,
    int limit = 200,
    DocumentSnapshot? startAfter,
  }) async {
    // Try exact key first (fast path — no extra queries if it works)
    final exact = await _getProductsPageForCategory(category, limit: limit, startAfter: startAfter);
    if (exact.products.isNotEmpty) return exact;

    // Exact miss — try variants in parallel (one network roundtrip total)
    final lower = category.toLowerCase().trim();
    final variants = <String>{};
    if (lower != category) variants.add(lower);
    if (lower.endsWith('s')) variants.add(lower.substring(0, lower.length - 1));
    else variants.add('${lower}s');
    if (lower.isNotEmpty) {
      final cap = lower[0].toUpperCase() + lower.substring(1);
      if (cap != category) variants.add(cap);
    }
    if (variants.isEmpty) return (products: <ProductModel>[], lastDoc: null);

    final futures = variants.map((v) => _getProductsPageForCategory(v, limit: limit, startAfter: startAfter));
    final results = await Future.wait(futures);
    for (final r in results) {
      if (r.products.isNotEmpty) return r;
    }
    return (products: <ProductModel>[], lastDoc: null);
  }

  Future<({List<ProductModel> products, DocumentSnapshot? lastDoc})> _getProductsPageForCategory(
    String category, {
    int limit = 200,
    DocumentSnapshot? startAfter,
  }) async {
    try {
      // No orderBy → no composite index needed. Client-side sorting handles order.
      Query query = _firestore
          .collection(AppConstants.productsCollection)
          .where('category', isEqualTo: category);

      if (startAfter != null) {
        query = query.startAfterDocument(startAfter);
      }
      query = query.limit(limit);

      final sw = Stopwatch()..start();
      final snapshot = await query.get().timeout(const Duration(seconds: 30));
      sw.stop();
      debugPrint('=== COMPAIR: getProductsPage cat=$category limit=$limit cursor=${startAfter?.id} → ${snapshot.docs.length} docs in ${sw.elapsedMilliseconds}ms ===');

      final products = snapshot.docs.map((doc) {
        try { return ProductModel.fromFirestore(doc); } catch (_) { return null; }
      }).whereType<ProductModel>().toList();

      final lastDoc = snapshot.docs.isNotEmpty ? snapshot.docs.last : null;
      return (products: products, lastDoc: lastDoc);
    } catch (e, st) {
      debugPrint('=== COMPAIR: getProductsPage ERROR cat=$category: $e\n$st ===');
      return (products: <ProductModel>[], lastDoc: null);
    }
  }

  String _getFieldValue(ProductModel p, String field) {
    switch (field) {
      case 'name': return p.name.toLowerCase();
      case 'brand': return p.brand?.toLowerCase() ?? '';
      case 'category': return p.category.toLowerCase();
      default: return p.name.toLowerCase();
    }
  }

  /// Increment viewCount on a product document (fire-and-forget)
  Future<void> incrementProductViewCount(String productId) async {
    try {
      await _firestore
          .collection(AppConstants.productsCollection)
          .doc(productId)
          .update({
        'viewCount': FieldValue.increment(1),
        'lastViewedAt': FieldValue.serverTimestamp(),
      });
    } catch (e) {
      debugPrint('=== COMPAIR: incrementViewCount failed for $productId: $e ===');
    }
  }

  Future<List<ProductModel>> getProductsByIds(List<String> ids) async {
    if (ids.isEmpty) return [];
    try {
      // Firestore 'in' query supports max 10 IDs
      final chunks = _chunkList(ids, 10);
      final results = <ProductModel>[];

      for (final chunk in chunks) {
        final snapshot = await _firestore
            .collection(AppConstants.productsCollection)
            .where(FieldPath.documentId, whereIn: chunk)
            .get()
            .timeout(const Duration(seconds: 15));
        results.addAll(
          snapshot.docs.map((doc) => ProductModel.fromFirestore(doc)),
        );
      }

      return results;
    } catch (e) {
      throw FirestoreException(message: 'Products could not be retrieved: $e');
    }
  }

  Future<void> deleteProduct(String id) async {
    try {
      await _firestore
          .collection(AppConstants.productsCollection)
          .doc(id)
          .delete();
    } catch (e) {
      throw FirestoreException(message: 'Product could not be deleted: $e');
    }
  }

  // ─── Comparisons ─── Section 4.3

  Future<String> createComparison(ComparisonModel comparison) async {
    try {
      final doc = await _firestore
          .collection(AppConstants.comparisonsCollection)
          .add(comparison.toFirestore());

      // Increment user comparison count
      await _firestore
          .collection(AppConstants.usersCollection)
          .doc(comparison.userId)
          .update({
        'comparisonsCount': FieldValue.increment(1),
      });

      return doc.id;
    } catch (e) {
      throw FirestoreException(message: 'Comparison could not be created: $e');
    }
  }

  Future<List<ComparisonModel>> getUserComparisons(
    String userId, {
    int limit = 20,
    DocumentSnapshot? startAfter,
  }) async {
    try {
      Query query = _firestore
          .collection(AppConstants.comparisonsCollection)
          .where('userId', isEqualTo: userId)
          .orderBy('createdAt', descending: true);

      if (startAfter != null) {
        query = query.startAfterDocument(startAfter);
      }

      final snapshot = await query.limit(limit).get()
          .timeout(const Duration(seconds: 15));
      return snapshot.docs
          .map((doc) => ComparisonModel.fromFirestore(doc))
          .toList();
    } catch (e) {
      throw FirestoreException(message: 'Comparisons could not be retrieved: $e');
    }
  }

  Future<List<ComparisonModel>> getPredefinedComparisons({
    String? category,
    int limit = 10,
  }) async {
    try {
      Query query = _firestore
          .collection(AppConstants.comparisonsCollection)
          .where('isPredefined', isEqualTo: true)
          .where('isActive', isEqualTo: true);

      if (category != null) {
        query = query.where('category', isEqualTo: category);
      }

      final snapshot = await query
          .orderBy('updatedAt', descending: true)
          .limit(limit)
          .get()
          .timeout(const Duration(seconds: 15));
      return snapshot.docs
          .map((doc) => ComparisonModel.fromFirestore(doc))
          .toList();
    } catch (e) {
      throw FirestoreException(
        message: 'Predefined comparisons could not be retrieved: $e',
      );
    }
  }

  // ─── Categories ─── Section 4.4

  Future<List<CategoryModel>> getCategories() async {
    try {
      final snapshot = await _firestore
          .collection(AppConstants.categoriesCollection)
          .orderBy('order')
          .limit(100)
          .get()
          .timeout(const Duration(seconds: 10));
      return snapshot.docs
          .map((doc) => CategoryModel.fromFirestore(doc))
          .toList();
    } catch (e) {
      throw FirestoreException(message: 'Categories could not be retrieved: $e');
    }
  }

  // ─── Trends ─── Section 4.4

  Future<List<TrendModel>> getTrends({
    required String country,
    String? category,
  }) async {
    try {
      Query query = _firestore
          .collection(AppConstants.trendsCollection)
          .where('country', isEqualTo: country);

      if (category != null) {
        query = query.where('category', isEqualTo: category);
      }

      query = query.orderBy('weekStart', descending: true).limit(1);

      final snapshot = await query.get()
          .timeout(const Duration(seconds: 10));
      return snapshot.docs
          .map((doc) => TrendModel.fromFirestore(doc))
          .toList();
    } catch (e) {
      throw FirestoreException(message: 'Trend data could not be retrieved: $e');
    }
  }

  // ─── Reviews ─── Section 4.4

  Future<List<ReviewModel>> getProductReviews(
    String productId, {
    int limit = 20,
  }) async {
    try {
      final snapshot = await _firestore
          .collection(AppConstants.reviewsCollection)
          .where('productId', isEqualTo: productId)
          .orderBy('createdAt', descending: true)
          .limit(limit)
          .get()
          .timeout(const Duration(seconds: 10));
      return snapshot.docs
          .map((doc) => ReviewModel.fromFirestore(doc))
          .toList();
    } catch (e) {
      throw FirestoreException(message: 'Reviews could not be retrieved: $e');
    }
  }

  Future<void> createReview(ReviewModel review) async {
    try {
      await _firestore
          .collection(AppConstants.reviewsCollection)
          .add(review.toFirestore());
    } catch (e) {
      throw FirestoreException(message: 'Review could not be created: $e');
    }
  }

  Future<void> deleteReview(String reviewId) async {
    await _firestore
        .collection(AppConstants.reviewsCollection)
        .doc(reviewId)
        .delete();
  }

  Future<void> toggleReviewLike(String reviewId, String userId) async {
    final ref = _firestore.collection(AppConstants.reviewsCollection).doc(reviewId);
    final doc = await ref.get();
    final data = doc.data() as Map<String, dynamic>? ?? {};
    final liked = List<String>.from(data['likedBy'] ?? []);
    if (liked.contains(userId)) {
      await ref.update({'likedBy': FieldValue.arrayRemove([userId])});
    } else {
      await ref.update({
        'likedBy': FieldValue.arrayUnion([userId]),
        'dislikedBy': FieldValue.arrayRemove([userId]),
      });
    }
  }

  Future<void> toggleReviewDislike(String reviewId, String userId) async {
    final ref = _firestore.collection(AppConstants.reviewsCollection).doc(reviewId);
    final doc = await ref.get();
    final data = doc.data() as Map<String, dynamic>? ?? {};
    final disliked = List<String>.from(data['dislikedBy'] ?? []);
    if (disliked.contains(userId)) {
      await ref.update({'dislikedBy': FieldValue.arrayRemove([userId])});
    } else {
      await ref.update({
        'dislikedBy': FieldValue.arrayUnion([userId]),
        'likedBy': FieldValue.arrayRemove([userId]),
      });
    }
  }

  Stream<List<ReviewModel>> watchProductReviews(String productId, {int limit = 30}) {
    return _firestore
        .collection(AppConstants.reviewsCollection)
        .where('productId', isEqualTo: productId)
        .orderBy('createdAt', descending: true)
        .limit(limit)
        .snapshots()
        .map((snap) => snap.docs
            .map((doc) => ReviewModel.fromFirestore(doc))
            .toList())
        .timeout(
          const Duration(seconds: 10),
          onTimeout: (sink) => sink.add([]),
        );
  }

  Stream<List<ReviewModel>> watchUserReviews(String userId, {int limit = 50}) {
    return _firestore
        .collection(AppConstants.reviewsCollection)
        .where('userId', isEqualTo: userId)
        .orderBy('createdAt', descending: true)
        .limit(limit)
        .snapshots()
        .map((snap) => snap.docs
            .map((doc) => ReviewModel.fromFirestore(doc))
            .toList())
        .timeout(
          const Duration(seconds: 10),
          onTimeout: (sink) => sink.add([]),
        );
  }

  // ─── Review Replies (subcollection) ───

  Stream<List<Map<String, dynamic>>> watchReviewReplies(
      String collection, String reviewId) {
    return _firestore
        .collection(collection)
        .doc(reviewId)
        .collection('replies')
        .orderBy('createdAt', descending: false)
        .snapshots()
        .map((snap) => snap.docs
            .map((d) => {'id': d.id, ...d.data()})
            .toList());
  }

  Future<void> addReviewReply({
    required String collection,
    required String reviewId,
    required String userId,
    required String displayName,
    required String text,
  }) async {
    await _firestore
        .collection(collection)
        .doc(reviewId)
        .collection('replies')
        .add({
      'userId': userId,
      'displayName': displayName,
      'text': text,
      'createdAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> deleteReviewReply({
    required String collection,
    required String reviewId,
    required String replyId,
  }) async {
    await _firestore
        .collection(collection)
        .doc(reviewId)
        .collection('replies')
        .doc(replyId)
        .delete();
  }

  // ─── User Links ─── Section 4.4

  Future<void> saveUserLink(UserLinkModel link) async {
    try {
      await _firestore
          .collection(AppConstants.userLinksCollection)
          .add(link.toFirestore());
    } catch (e) {
      throw FirestoreException(message: 'Link could not be saved: $e');
    }
  }

  Future<List<UserLinkModel>> getUserLinks(
    String userId, {
    int limit = 20,
  }) async {
    try {
      final snapshot = await _firestore
          .collection(AppConstants.userLinksCollection)
          .where('userId', isEqualTo: userId)
          .orderBy('createdAt', descending: true)
          .limit(limit)
          .get()
          .timeout(const Duration(seconds: 10));
      return snapshot.docs
          .map((doc) => UserLinkModel.fromFirestore(doc))
          .toList();
    } catch (e) {
      throw FirestoreException(message: 'Links could not be retrieved: $e');
    }
  }

  // ─── Utility ───

  /// Cache is "ready" when homeFeed products are available
  bool get isCacheReady => _homeFeedProducts != null && _homeFeedProducts!.isNotEmpty;

  /// No-op — full 84K RAM cache removed. Cloud Function handles server-side search.
  void warmUpCache() {}

  /// Returns homeFeed products (small set, loaded on app start)
  Future<List<ProductModel>> getAllCachedProducts() async {
    return _homeFeedProducts ?? [];
  }

  /// No-op — category browse uses Firestore directly.
  void injectProductsIntoCache(List<ProductModel> products) {}

  /// Instant product search — client-side filter on in-memory cache.
  /// Falls back to local homeFeed cache if Cloud Function fails.
  
  // Cloud Function warm status — after first successful call, it's warm
  static bool _cfWarm = false;
  static Future<void>? _cfWarmFuture;

  /// Pre-warm the Cloud Function on app start (background, fire-and-forget)
  void preWarmSearchFunction() {
    if (_cfWarm || _cfWarmFuture != null) return;
    _cfWarmFuture = () async {
      try {
        debugPrint('SEARCH: pre-warming Cloud Function...');
        final functions = FirebaseFunctions.instanceFor(region: 'europe-west1');
        final callable = functions.httpsCallable(
          'searchProducts',
          options: HttpsCallableOptions(timeout: const Duration(seconds: 60)),
        );
        await callable.call<Map<String, dynamic>>({
          'query': '_warmup_',
          'limit': 1,
        });
        _cfWarm = true;
        debugPrint('SEARCH: Cloud Function pre-warmed ✓');
      } catch (e) {
        debugPrint('SEARCH: pre-warm failed (will retry on search): $e');
      } finally {
        _cfWarmFuture = null;
      }
    }();
  }

  Future<List<ProductModel>> searchProducts({
    required String query,
    int limit = 50,
    String? category,
  }) async {
    final q = query.trim();
    if (q.isEmpty || q == '___warm___' || q == '_warmup_') return [];

    // 1. Local result cache — same query within 5 min returns instantly
    final cacheKey = '${q.toLowerCase()}|${category ?? ''}|$limit';
    final cached = _searchResultCache[cacheKey];
    if (cached != null && DateTime.now().difference(cached.time) < _searchResultCacheTtl) {
      debugPrint('SEARCH: result cache hit for "$q" (${cached.results.length} results)');
      return cached.results;
    }

    // 2. Cloud Function — server-side search across all 84K products
    try {
      debugPrint('SEARCH: calling Cloud Function with query="$q"');
      final functions = FirebaseFunctions.instanceFor(region: 'europe-west1');
      final callable = functions.httpsCallable(
        'searchProducts',
        options: HttpsCallableOptions(timeout: const Duration(seconds: 15)),
      );
      final result = await callable.call<Map<String, dynamic>>({
        'query': q,
        'limit': limit,
        if (category != null) 'category': category,
      });

      final data = result.data;
      final productList = (data['products'] as List<dynamic>?) ?? [];
      _cfWarm = true;
      debugPrint('SEARCH: Cloud Function returned ${productList.length} results');

      final cfResults = productList.map((item) {
        final map = Map<String, dynamic>.from(item as Map);
        map['id'] ??= '';
        return ProductModel.fromMap(map);
      }).toList();

      // Relaxed filter: only remove defunct brands (no year/whitelist restriction)
      final filtered = ProductFilter.filterRelaxed(cfResults);
      debugPrint('SEARCH: filtered ${cfResults.length} → ${filtered.length} (defunct-only)');

      // Cache results locally for quick re-search
      _evictSearchResultCache();
      _searchResultCache[cacheKey] = (results: filtered, time: DateTime.now());
      return filtered;
    } catch (e) {
      debugPrint('SEARCH: Cloud Function failed: $e');
    }

    // 3. Fallback: homeFeed products (offline / CF cold start)
    if (_homeFeedProducts != null && _homeFeedProducts!.isNotEmpty) {
      debugPrint('SEARCH: fallback to homeFeed (${_homeFeedProducts!.length} products)');
      return _scoreAndRankProducts(_homeFeedProducts!, q, limit);
    }

    debugPrint('SEARCH: all sources failed');
    return [];
  }

  void _evictSearchResultCache() {
    if (_searchResultCache.length >= _searchResultCacheMaxSize) {
      final sorted = _searchResultCache.entries.toList()
        ..sort((a, b) => a.value.time.compareTo(b.value.time));
      for (final e in sorted.take(_searchResultCache.length - _searchResultCacheMaxSize + 1)) {
        _searchResultCache.remove(e.key);
      }
    }
  }

  /// Instant search on homeFeed products only (no network).
  List<ProductModel> searchProductsFromCache(String query, {int limit = 50}) {
    if (query.trim().isEmpty) return [];
    final pool = _homeFeedProducts;
    if (pool == null || pool.isEmpty) return [];
    return _scoreAndRankProducts(pool, query, limit);
  }

  // HomeFeed products injected from provider layer for instant search
  static List<ProductModel>? _homeFeedProducts;

  /// Called by homeFeedProvider to share loaded products for search
  void setHomeFeedProducts(List<ProductModel> products) {
    if (products.isNotEmpty) {
      _homeFeedProducts = products;
      debugPrint('SEARCH: homeFeed products set (${products.length})');
    }
  }

  /// Score and rank products by relevance to query
  List<ProductModel> _scoreAndRankProducts(
      List<ProductModel> products, String query, int limit) {
    // Apply year/brand filter before scoring
    final filtered = ProductFilter.filter(products);
    final q = query.trim().toLowerCase();
    final words = q.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();

    // Score each product for relevance
    final scored = <({ProductModel product, int score})>[];
    for (final p in filtered) {
      final name = p.name.toLowerCase();
      final brand = (p.brand ?? '').toLowerCase();
      final category = p.category.toLowerCase();
      final subcategory = p.subcategory.toLowerCase();
      final tags = p.tags.map((t) => t.toLowerCase()).toList();
      final keySpecValues = p.keySpecs.values.map((v) => v.toLowerCase()).toList();

      int score = 0;

      // Exact name match
      if (name == q) {
        score += 100;
      } else if (name.startsWith(q)) {
        score += 80;
      } else if (name.contains(q)) {
        score += 60;
      }

      // All words match in name
      if (words.length > 1 && words.every((w) => name.contains(w))) {
        score += 50;
      }

      // Brand match
      if (brand == q) {
        score += 40;
      } else if (brand.startsWith(q)) {
        score += 30;
      } else if (brand.contains(q)) {
        score += 20;
      }

      // Category/subcategory match
      if (category.contains(q) || subcategory.contains(q)) {
        score += 15;
      }

      // Key specs match (e.g., "RTX 4090" in specs)
      if (keySpecValues.any((v) => v.contains(q))) {
        score += 15;
      } else if (words.length > 1 && keySpecValues.any((v) => words.any((w) => v.contains(w)))) {
        score += 8;
      }

      // Tag match
      for (final tag in tags) {
        if (tag == q || words.any((w) => tag.contains(w))) {
          score += 10;
          break;
        }
      }

      // Partial word matches in name+brand
      if (score == 0) {
        final combined = '$name $brand';
        final allMatch = words.every((w) => combined.contains(w));
        if (allMatch) score += 25;
      }

      // Single word partial match (for partial typing like "gamep" -> "gamepower")
      if (score == 0 && words.length == 1) {
        final combined = '$name $brand ${tags.join(' ')}';
        if (combined.contains(q)) {
          score += 20;
        }
      }

      if (score > 0) {
        // Boost by techScore for tie-breaking
        final techBoost = (p.techScore / 100.0 * 5).round();
        scored.add((product: p, score: score + techBoost));
      }
    }

    // Sort by score descending, then by techScore
    scored.sort((a, b) {
      final cmp = b.score.compareTo(a.score);
      if (cmp != 0) return cmp;
      return b.product.techScore.compareTo(a.product.techScore);
    });

    return scored.take(limit).map((s) => s.product).toList();
  }

  /// Update comparison (userChoice etc.) - Section 10.1
  Future<void> updateComparison({
    required String comparisonId,
    required Map<String, dynamic> data,
  }) async {
    try {
      await _firestore
          .collection(AppConstants.comparisonsCollection)
          .doc(comparisonId)
          .update(data);
    } catch (e) {
      throw FirestoreException(message: 'Comparison could not be updated: $e');
    }
  }

  /// Save a link analysis result to Firestore
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
      await _firestore
          .collection(AppConstants.usersCollection)
          .doc(userId)
          .collection('saved_analyses')
          .add({
        'url': url,
        'productName': productName,
        'score': score,
        'analysis': analysis,
        'imageUrl': imageUrl,
        'category': category,
        'savedAt': FieldValue.serverTimestamp(),
      });
    } catch (e) {
      throw FirestoreException(
        message: 'Could not save analysis: $e',
      );
    }
  }

  /// Add product to user's ownedProducts list - Section 10.2
  Future<void> addToUserOwnedProducts({
    required String userId,
    required String productId,
  }) async {
    try {
      await _firestore
          .collection(AppConstants.usersCollection)
          .doc(userId)
          .update({
        'ownedProducts': FieldValue.arrayUnion([productId]),
        'updatedAt': FieldValue.serverTimestamp(),
      });
    } catch (e) {
      throw FirestoreException(
        message: 'User product list could not be updated: $e',
      );
    }
  }

  List<List<T>> _chunkList<T>(List<T> list, int chunkSize) {
    final chunks = <List<T>>[];
    for (var i = 0; i < list.length; i += chunkSize) {
      chunks.add(list.sublist(i, i + chunkSize > list.length ? list.length : i + chunkSize));
    }
    return chunks;
  }

  // ─── Chat Conversations ───────────────────────────────────────────────────

  Future<String> createChatConversation(ChatConversation conv) async {
    final ref = _firestore
        .collection('users')
        .doc(conv.userId)
        .collection('chat_conversations')
        .doc();
    await ref.set(conv.toFirestore());
    return ref.id;
  }

  Future<void> updateChatConversation(String userId, String convId,
      List<PersistedChatMsg> messages, String title) async {
    await _firestore
        .collection('users')
        .doc(userId)
        .collection('chat_conversations')
        .doc(convId)
        .update({
      'messages': messages.map((m) => m.toMap()).toList(),
      'title': title,
      'updatedAt': FieldValue.serverTimestamp(),
      'messageCount': messages.length,
    });
  }

  Stream<List<ChatConversation>> streamChatConversations(String userId) {
    return _firestore
        .collection('users')
        .doc(userId)
        .collection('chat_conversations')
        .orderBy('updatedAt', descending: true)
        .limit(50)
        .snapshots()
        .map((snap) => snap.docs
            .map((doc) => ChatConversation.fromFirestore(doc))
            .toList());
  }

  Future<ChatConversation?> getChatConversation(
      String userId, String convId) async {
    final doc = await _firestore
        .collection('users')
        .doc(userId)
        .collection('chat_conversations')
        .doc(convId)
        .get();
    if (!doc.exists) return null;
    return ChatConversation.fromFirestore(doc);
  }

  Future<void> deleteChatConversation(String userId, String convId) async {
    await _firestore
        .collection('users')
        .doc(userId)
        .collection('chat_conversations')
        .doc(convId)
        .delete();
  }
}
