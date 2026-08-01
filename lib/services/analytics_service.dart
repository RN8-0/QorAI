/// Qor AI - Analytics Event Tracking Service
///
/// Firebase Analytics wrapper. Uygulamanın gerçek funnel'ını ölçer:
/// açılış → kayıt → arama → ürün → karşılaştırma/analiz → paywall.
///
/// Startup jank kuralı: burada first frame'den ÖNCE hiçbir iş yapılmaz.
/// Firebase, deferred startup queue'da (main.dart) zaten ayağa kalkıyor;
/// [init] o kuyruktan çağrılır. init'ten önce düşen event'ler [_pending]
/// içinde tamponlanır ve init anında sırayla boşaltılır — yani erken
/// ekranların event'i kaybolmaz ama açılışı da yavaşlatmaz.
library;

import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:qor_ai/firebase_options.dart';

/// Firebase Analytics limitleri: event adı ≤40, parametre değeri ≤100 karakter.
const int _kMaxParamLength = 100;

/// Tampon sınırı — init hiç gelmezse bellek şişmesin.
const int _kMaxPendingEvents = 60;

String _clip(String value) => value.length <= _kMaxParamLength
    ? value
    : value.substring(0, _kMaxParamLength);

class AnalyticsService {
  AnalyticsService._();
  static final instance = AnalyticsService._();

  FirebaseAnalytics? _analytics;
  final List<Future<void> Function(FirebaseAnalytics)> _pending = [];
  bool _initFailed = false;

  /// Deferred startup queue'dan çağrılır. Firebase zaten init edilmiş olabilir
  /// (notification service önce koşuyor) — o durumda tekrar başlatmayız.
  Future<void> init() async {
    if (_analytics != null || _initFailed) return;
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(
          options: DefaultFirebaseOptions.currentPlatform,
        );
      }
      final analytics = FirebaseAnalytics.instance;
      await analytics.setAnalyticsCollectionEnabled(true);
      _analytics = analytics;
      debugPrint('=== QOR AI: Analytics initialized ===');
      await _flushPending(analytics);
    } catch (e) {
      _initFailed = true;
      _pending.clear();
      debugPrint('=== QOR AI: Analytics init failed: $e ===');
    }
  }

  Future<void> _flushPending(FirebaseAnalytics analytics) async {
    if (_pending.isEmpty) return;
    final queued = List.of(_pending);
    _pending.clear();
    for (final call in queued) {
      try {
        await call(analytics);
      } catch (_) {
        // Tek bir event'in hatası kuyruğun kalanını düşürmesin.
      }
    }
  }

  /// Hazırsa gönderir, değilse tamponlar. Analytics hiçbir zaman uygulamayı
  /// düşürmemeli — tüm hatalar burada yutulur.
  Future<void> _dispatch(Future<void> Function(FirebaseAnalytics) call) async {
    if (_initFailed) return;
    final analytics = _analytics;
    if (analytics == null) {
      if (_pending.length < _kMaxPendingEvents) _pending.add(call);
      return;
    }
    try {
      await call(analytics);
    } catch (_) {}
  }

  Future<void> _logEvent(String name, [Map<String, Object>? parameters]) {
    return _dispatch(
      (analytics) => analytics.logEvent(name: name, parameters: parameters),
    );
  }

  // ─── Funnel: keşif ─────────────────────────────────────────────────────────

  Future<void> logProductView(
    String productId,
    String category,
    String? brand,
  ) => _logEvent('product_view', {
    'product_id': _clip(productId),
    'category': _clip(category),
    if (brand != null && brand.isNotEmpty) 'brand': _clip(brand),
  });

  Future<void> logProductSearch(String query, int resultCount) =>
      _logEvent('product_search', {
        'search_term': _clip(query),
        'result_count': resultCount,
        // Sonuçsuz aramalar katalog boşluklarını gösterir — ayrıca işaretle.
        'is_empty': resultCount == 0 ? 1 : 0,
      });

  Future<void> logCategoryBrowse(String category) =>
      _logEvent('category_browse', {'category': _clip(category)});

  // ─── Funnel: çekirdek değer ────────────────────────────────────────────────

  Future<void> logComparisonStart(List<String> productIds) =>
      _logEvent('comparison_start', {
        'product_count': productIds.length,
        'product_ids': _clip(productIds.join(',')),
      });

  /// Karşılaştırmanın SONUÇLANDIĞI an. `comparison_start` ile arasındaki fark
  /// çekirdek akışın gerçek tamamlanma oranını verir — asıl bakılacak metrik.
  Future<void> logComparisonComplete(
    List<String> productIds, {
    bool hasWinner = false,
  }) => _logEvent('comparison_complete', {
    'product_count': productIds.length,
    'product_ids': _clip(productIds.join(',')),
    'has_winner': hasWinner ? 1 : 0,
  });

  Future<void> logAiChatMessage() => _logEvent('ai_chat_message');

  Future<void> logLinkAnalysis(String url) {
    // Ham URL kişisel veri taşıyabilir (referrer/token). Sadece host tutulur.
    final host = Uri.tryParse(url)?.host ?? 'unknown';
    return _logEvent('link_analysis', {
      'host': _clip(host.isEmpty ? 'unknown' : host),
    });
  }

  /// Başarısız link analizi. Kullanıcı Q harcayıp sonuç alamadığı için
  /// churn'ün en sert sebebi — hangi host'ta kırıldığı ayrıca ölçülür.
  Future<void> logLinkAnalysisFailed(String url, String reason) {
    final host = Uri.tryParse(url)?.host ?? 'unknown';
    return _logEvent('link_analysis_failed', {
      'host': _clip(host.isEmpty ? 'unknown' : host),
      'reason': _clip(reason),
    });
  }

  Future<void> logAddToCollection(String productId) =>
      _logEvent('add_to_collection', {'product_id': _clip(productId)});

  // ─── Funnel: onboarding ────────────────────────────────────────────────────

  Future<void> logOnboardingComplete() => _logEvent('onboarding_complete');

  Future<void> logQuizComplete(String ecosystem, String budgetRange) =>
      _logEvent('quiz_complete', {
        'ecosystem': _clip(ecosystem),
        'budget_range': _clip(budgetRange),
      });

  // ─── Funnel: para ──────────────────────────────────────────────────────────

  Future<void> logPaywallView(String source) =>
      _logEvent('paywall_view', {'source': _clip(source)});

  Future<void> logSubscriptionStart(String plan) =>
      _logEvent('subscription_start', {'plan': _clip(plan)});

  // ─── Ekran görüntüleme ─────────────────────────────────────────────────────

  Future<void> logScreenView(String screenName) => _dispatch(
    (analytics) => analytics.logScreenView(screenName: _clip(screenName)),
  );

  // ─── Kullanıcı özellikleri ─────────────────────────────────────────────────

  Future<void> setUserProperties({
    String? ecosystem,
    String? budgetRange,
    String? country,
    bool? isPremium,
  }) => _dispatch((analytics) async {
    if (ecosystem != null) {
      await analytics.setUserProperty(name: 'ecosystem', value: _clip(ecosystem));
    }
    if (budgetRange != null) {
      await analytics.setUserProperty(
        name: 'budget_range',
        value: _clip(budgetRange),
      );
    }
    if (country != null) {
      await analytics.setUserProperty(name: 'country', value: _clip(country));
    }
    if (isPremium != null) {
      await analytics.setUserProperty(
        name: 'is_premium',
        value: isPremium ? 'true' : 'false',
      );
    }
  });
}
