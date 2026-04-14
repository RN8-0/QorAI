// Compair - Analytics Event Tracking Service
// Analytics provider is currently disabled. All methods are no-ops.
// Kept as a stub so call sites don't need to change.

class AnalyticsService {
  AnalyticsService._();
  static final instance = AnalyticsService._();

  Future<void> logProductView(String productId, String category, String? brand) async {}
  Future<void> logProductSearch(String query, int resultCount) async {}
  Future<void> logComparisonStart(List<String> productIds) async {}
  Future<void> logComparisonComplete(String comparisonId) async {}
  Future<void> logAiChatMessage() async {}
  Future<void> logLinkAnalysis(String url) async {}
  Future<void> logPaywallView(String source) async {}
  Future<void> logSubscriptionStart(String plan) async {}
  Future<void> logScreenView(String screenName) async {}
  Future<void> logCategoryBrowse(String category) async {}
  Future<void> logAddToCollection(String productId) async {}
  Future<void> logOnboardingComplete() async {}
  Future<void> logQuizComplete(String ecosystem, String budgetRange) async {}

  Future<void> setUserProperties({
    String? ecosystem,
    String? budgetRange,
    String? country,
    bool? isPremium,
  }) async {}
}
