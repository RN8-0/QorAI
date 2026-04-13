/// Compair — Behavior Tracking Service (stubbed for PocketBase migration)
/// Full subcollection tracking to be re-implemented with PocketBase later.
library;

import 'package:compair/core/pb_client.dart';

class BehaviorTrackingService {
  static final BehaviorTrackingService _instance = BehaviorTrackingService._();
  BehaviorTrackingService._();
  factory BehaviorTrackingService() => _instance;

  String? get _uid => pb.authStore.isValid ? pb.authStore.record?.id : null;

  void trackProductView(String productId, String category) {}
  void trackViewDuration(String productId, int seconds) {}
  void trackComparison(List<String> productIds) {}
  void trackPriceTap(String productId) {}
  void trackFavorite(String productId, bool isFavorited) {}
  void trackSearch(String query, {String? tappedProductId}) {}
  void trackCategoryVisit(String category) {}
  void trackScrollDepth(String screenId, double maxDepthPercent) {}
  void trackSpecFocus(String productId, String specKey) {}
  void trackAIChatQuery(String query, {String? relatedProductId}) {}
  void trackDismissal(String productId, String reason) {}
  void trackSessionSummary({
    required int durationSeconds,
    required int productsViewed,
    required int comparisons,
    required int searches,
    required List<String> categoriesVisited,
  }) {}
  void trackHourlyActivity() {}
  void trackQuizPreference(String key, String value) {}
  void trackTimePattern() {}
  void trackAffiliateTap(String productId) {}
  void trackQuizAnswers({String? url, String? category, List<dynamic>? answeredQuestions, double? matchScore}) {}
  void trackLinkPaste(String url, String? extra) {}
  void trackActiveHour() {}
}
