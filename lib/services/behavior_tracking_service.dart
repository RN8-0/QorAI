/// Qor AI — Behavior Tracking Service
library;

import 'dart:async';

import 'package:flutter/foundation.dart';

import 'package:qor_ai/core/constants.dart';
import 'package:qor_ai/core/pb_client.dart';

class BehaviorTrackingService {
  static final BehaviorTrackingService _instance = BehaviorTrackingService._();
  BehaviorTrackingService._();
  factory BehaviorTrackingService() => _instance;

  String? get _uid => pb.authStore.isValid ? pb.authStore.record?.id : null;

  Future<void> _run(
    String label,
    Future<void> Function(String uid) action,
  ) async {
    final uid = _uid;
    if (uid == null || uid.isEmpty) {
      return;
    }
    try {
      await action(uid);
    } catch (e) {
      debugPrint('[BehaviorTracking] $label failed: $e');
    }
  }

  void _fireAndForget(String label, Future<void> Function(String uid) action) {
    unawaited(_run(label, action));
  }

  Future<Map<String, dynamic>> _userData(String uid) async {
    final record = await pb
        .collection(AppConstants.usersCollection)
        .getOne(uid);
    return Map<String, dynamic>.from(record.data);
  }

  Future<void> _appendHistory(
    String uid,
    String field,
    Map<String, dynamic> entry, {
    int maxItems = 50,
  }) async {
    final data = await _userData(uid);
    final existing = List<Map<String, dynamic>>.from(
      (data[field] as List? ?? const []).map(
        (item) => Map<String, dynamic>.from(item as Map),
      ),
    );
    existing.insert(0, entry);
    final trimmed = existing.take(maxItems).toList();
    await pb
        .collection(AppConstants.usersCollection)
        .update(uid, body: {field: trimmed});
  }

  Future<void> _incrementCounter(String uid, String field, {int by = 1}) async {
    final data = await _userData(uid);
    final current = (data[field] as num?)?.toInt() ?? 0;
    await pb
        .collection(AppConstants.usersCollection)
        .update(uid, body: {field: current + by});
  }

  Future<void> _incrementMapValue(
    String uid,
    String field,
    String key, {
    int by = 1,
  }) async {
    final data = await _userData(uid);
    final map = Map<String, dynamic>.from(data[field] as Map? ?? const {});
    final current = (map[key] as num?)?.toInt() ?? 0;
    map[key] = current + by;
    await pb
        .collection(AppConstants.usersCollection)
        .update(uid, body: {field: map});
  }

  Map<String, dynamic> _entry(Map<String, dynamic> data) {
    return {'createdAt': DateTime.now().toIso8601String(), ...data};
  }

  void trackProductView(String productId, String category) {
    _fireAndForget('trackProductView', (uid) async {
      await _appendHistory(
        uid,
        'productViewHistory',
        _entry({'productId': productId, 'category': category}),
        maxItems: 120,
      );
      if (category.trim().isNotEmpty) {
        await _incrementMapValue(uid, 'categoryViewCounts', category.trim());
      }
    });
  }

  void trackViewDuration(String productId, int seconds) {
    _fireAndForget('trackViewDuration', (uid) async {
      await _appendHistory(
        uid,
        'viewDurationHistory',
        _entry({'productId': productId, 'seconds': seconds}),
      );
    });
  }

  void trackComparison(List<String> productIds) {
    if (productIds.isEmpty) {
      return;
    }
  }

  void trackPriceTap(String productId) {
    trackAffiliateTap(productId);
  }

  void trackFavorite(String productId, bool isFavorited) {
    _fireAndForget('trackFavorite', (uid) async {
      await _appendHistory(
        uid,
        'favoriteHistory',
        _entry({'productId': productId, 'isFavorited': isFavorited}),
      );
    });
  }

  void trackSearch(String query, {String? tappedProductId}) {
    final normalized = query.trim();
    if (normalized.isEmpty) {
      return;
    }
    _fireAndForget('trackSearch', (uid) async {
      await _appendHistory(
        uid,
        'searchHistory',
        _entry({'query': normalized, 'tappedProductId': tappedProductId}),
        maxItems: 80,
      );
    });
  }

  void trackCategoryVisit(String category) {
    final normalized = category.trim();
    if (normalized.isEmpty) {
      return;
    }
    _fireAndForget('trackCategoryVisit', (uid) async {
      await _appendHistory(
        uid,
        'categoryVisitHistory',
        _entry({'category': normalized}),
      );
      await _incrementMapValue(uid, 'categoryVisitCounts', normalized);
    });
  }

  void trackScrollDepth(String screenId, double maxDepthPercent) {
    _fireAndForget('trackScrollDepth', (uid) async {
      await _appendHistory(
        uid,
        'scrollDepthHistory',
        _entry({'screenId': screenId, 'maxDepthPercent': maxDepthPercent}),
      );
    });
  }

  void trackSpecFocus(String productId, String specKey) {
    final normalized = specKey.trim();
    if (normalized.isEmpty) {
      return;
    }
    _fireAndForget('trackSpecFocus', (uid) async {
      await _appendHistory(
        uid,
        'specFocusHistory',
        _entry({'productId': productId, 'specKey': normalized}),
      );
      await _incrementMapValue(uid, 'specFocusCounts', normalized);
    });
  }

  void trackAIChatQuery(String query, {String? relatedProductId}) {
    final normalized = query.trim();
    if (normalized.isEmpty) {
      return;
    }
    _fireAndForget('trackAIChatQuery', (uid) async {
      await _appendHistory(
        uid,
        'aiChatHistory',
        _entry({'query': normalized, 'relatedProductId': relatedProductId}),
      );
    });
  }

  void trackDismissal(String productId, String reason) {
    _fireAndForget('trackDismissal', (uid) async {
      await _appendHistory(
        uid,
        'dismissalHistory',
        _entry({'productId': productId, 'reason': reason}),
      );
    });
  }

  void trackSessionSummary({
    required int durationSeconds,
    required int productsViewed,
    required int comparisons,
    required int searches,
    required List<String> categoriesVisited,
  }) {
    _fireAndForget('trackSessionSummary', (uid) async {
      await _appendHistory(
        uid,
        'sessionHistory',
        _entry({
          'durationSeconds': durationSeconds,
          'productsViewed': productsViewed,
          'comparisons': comparisons,
          'searches': searches,
          'categoriesVisited': categoriesVisited,
        }),
      );
    });
  }

  void trackHourlyActivity() {
    trackActiveHour();
  }

  void trackQuizPreference(String key, String value) {
    final normalizedKey = key.trim();
    final normalizedValue = value.trim();
    if (normalizedKey.isEmpty || normalizedValue.isEmpty) {
      return;
    }
    _fireAndForget('trackQuizPreference', (uid) async {
      final bucket = '$normalizedKey:$normalizedValue';
      await _appendHistory(
        uid,
        'quizPreferenceHistory',
        _entry({'key': normalizedKey, 'value': normalizedValue}),
      );
      await _incrementMapValue(uid, 'quizPreferenceCounts', bucket);
    });
  }

  void trackTimePattern() {
    trackActiveHour();
  }

  void trackAffiliateTap(String productId) {
    _fireAndForget('trackAffiliateTap', (uid) async {
      await _appendHistory(
        uid,
        'affiliateTapHistory',
        _entry({'productId': productId}),
      );
      await _incrementCounter(uid, 'affiliateClicks');
    });
  }

  void trackQuizAnswers({
    String? url,
    String? category,
    List<dynamic>? answeredQuestions,
    double? matchScore,
  }) {
    _fireAndForget('trackQuizAnswers', (uid) async {
      await _appendHistory(
        uid,
        'quizAnswerHistory',
        _entry({
          'url': url,
          'category': category,
          'answeredQuestions': answeredQuestions ?? const [],
          'matchScore': matchScore,
        }),
      );
    });
  }

  void trackLinkPaste(String url, String? extra) {
    final normalized = url.trim();
    if (normalized.isEmpty) {
      return;
    }
    _fireAndForget('trackLinkPaste', (uid) async {
      await _appendHistory(
        uid,
        'linkPasteHistory',
        _entry({'url': normalized, 'extra': extra}),
      );
    });
  }

  void trackActiveHour() {
    _fireAndForget('trackActiveHour', (uid) async {
      final hour = DateTime.now().hour.toString().padLeft(2, '0');
      await _incrementMapValue(uid, 'hourActivityCounts', hour);
    });
  }
}
