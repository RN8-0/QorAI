/// Compair - Analytics Event Tracking Service
/// Centralizes all Firebase Analytics event logging.

import 'package:firebase_analytics/firebase_analytics.dart';

class AnalyticsService {
  AnalyticsService._();
  static final instance = AnalyticsService._();

  final _analytics = FirebaseAnalytics.instance;

  // ─── Product Events ───

  Future<void> logProductView(String productId, String category, String? brand) async {
    await _analytics.logEvent(name: 'product_view', parameters: {
      'product_id': productId,
      'category': category,
      if (brand != null) 'brand': brand,
    });
  }

  Future<void> logProductSearch(String query, int resultCount) async {
    await _analytics.logEvent(name: 'product_search', parameters: {
      'query': query,
      'result_count': resultCount,
    });
  }

  // ─── Comparison Events ───

  Future<void> logComparisonStart(List<String> productIds) async {
    await _analytics.logEvent(name: 'comparison_start', parameters: {
      'product_count': productIds.length,
      'product_ids': productIds.take(5).join(','),
    });
  }

  Future<void> logComparisonComplete(String comparisonId) async {
    await _analytics.logEvent(name: 'comparison_complete', parameters: {
      'comparison_id': comparisonId,
    });
  }

  // ─── AI Events ───

  Future<void> logAiChatMessage() async {
    await _analytics.logEvent(name: 'ai_chat_message');
  }

  Future<void> logLinkAnalysis(String url) async {
    await _analytics.logEvent(name: 'link_analysis', parameters: {
      'domain': Uri.tryParse(url)?.host ?? 'unknown',
    });
  }

  // ─── Subscription Events ───

  Future<void> logPaywallView(String source) async {
    await _analytics.logEvent(name: 'paywall_view', parameters: {
      'source': source,
    });
  }

  Future<void> logSubscriptionStart(String plan) async {
    await _analytics.logEvent(name: 'subscription_start', parameters: {
      'plan': plan,
    });
  }

  // ─── Navigation Events ───

  Future<void> logScreenView(String screenName) async {
    await _analytics.logScreenView(screenName: screenName);
  }

  Future<void> logCategoryBrowse(String category) async {
    await _analytics.logEvent(name: 'category_browse', parameters: {
      'category': category,
    });
  }

  // ─── Collection Events ───

  Future<void> logAddToCollection(String productId) async {
    await _analytics.logEvent(name: 'add_to_collection', parameters: {
      'product_id': productId,
    });
  }

  // ─── Onboarding Events ───

  Future<void> logOnboardingComplete() async {
    await _analytics.logEvent(name: 'onboarding_complete');
  }

  Future<void> logQuizComplete(String ecosystem, String budgetRange) async {
    await _analytics.logEvent(name: 'quiz_complete', parameters: {
      'ecosystem': ecosystem,
      'budget_range': budgetRange,
    });
  }

  // ─── User Properties ───

  Future<void> setUserProperties({
    String? ecosystem,
    String? budgetRange,
    String? country,
    bool? isPremium,
  }) async {
    if (ecosystem != null) {
      await _analytics.setUserProperty(name: 'ecosystem', value: ecosystem);
    }
    if (budgetRange != null) {
      await _analytics.setUserProperty(name: 'budget_range', value: budgetRange);
    }
    if (country != null) {
      await _analytics.setUserProperty(name: 'country', value: country);
    }
    if (isPremium != null) {
      await _analytics.setUserProperty(
        name: 'is_premium',
        value: isPremium.toString(),
      );
    }
  }
}
