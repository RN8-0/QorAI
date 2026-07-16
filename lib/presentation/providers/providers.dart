/// Qor AI - Riverpod Providers
/// Blueprint Section 3.3 (Provider Tipleri tablosu)
///
/// Provider: Constants, services -> themeProvider, routerProvider
/// StateNotifierProvider: Complex state -> comparisonStateProvider
/// FutureProvider: Async data fetching -> productDetailProvider
/// StreamProvider: Realtime data -> userProfileStreamProvider
/// StateProvider: Simple state -> selectedCategoryProvider
library;

import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:dio/dio.dart';
import 'package:pocketbase/pocketbase.dart';
import 'package:qor_ai/data/datasources/pb_ds.dart';
import 'package:qor_ai/data/datasources/hive_ds.dart';
import 'package:qor_ai/core/pb_client.dart';
import 'package:qor_ai/data/repositories/auth_repo.dart';
import 'package:qor_ai/data/repositories/product_repo.dart';
import 'package:qor_ai/data/repositories/comparison_repo.dart';
import 'package:qor_ai/data/repositories/ai_repo.dart';
import 'package:qor_ai/data/repositories/scraper_repo.dart';
import 'package:qor_ai/data/models/scraper_models.dart';
import 'package:qor_ai/domain/entities/user_entity.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';
import 'package:qor_ai/domain/entities/ai_entities.dart';
import 'package:qor_ai/domain/entities/comparison_entity.dart';
import 'package:qor_ai/domain/usecases/calculate_score.dart';
import 'package:qor_ai/services/ai_service.dart';
import 'package:qor_ai/services/spec_direction_service.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:qor_ai/services/gemini_service.dart';
import 'package:qor_ai/services/deepseek_service.dart';
import 'package:qor_ai/services/cache_service.dart';
import 'package:qor_ai/services/subscription_service.dart';
import 'package:qor_ai/services/remote_config_service.dart';
import 'package:qor_ai/services/metadata_service.dart';
import 'package:qor_ai/services/profile_algorithm_service.dart';
import 'package:qor_ai/services/tech_score_service.dart';
import 'package:qor_ai/services/youtube_service.dart';
import 'package:qor_ai/services/behavior_tracking_service.dart';
import 'package:qor_ai/services/ip_location_service.dart';
import 'package:qor_ai/services/analytics_service.dart';
import 'package:qor_ai/core/errors.dart';
import 'package:qor_ai/core/product_filter.dart';
import 'package:qor_ai/core/search_ranking.dart'
    show categorySearchPriorityBonus;
import 'package:qor_ai/core/constants.dart';
import 'package:qor_ai/core/qor_limit_messages.dart';
import 'package:qor_ai/core/category_key_specs.dart' as key_specs;

import 'package:qor_ai/data/models/other_models.dart';
import 'package:qor_ai/data/models/product_model.dart';
import 'package:qor_ai/data/models/chat_conversation.dart';
import 'package:qor_ai/presentation/providers/analysis_hub_provider.dart';

// ── Part files ──
part 'auth_providers.dart';
part 'ui_providers.dart';
part 'product_providers.dart';
part 'compare_providers.dart';
part 'cache_providers.dart';
part 'ai_providers.dart';

const _kSubscriptionStartupDelay = Duration(seconds: 12);

void _syncAuthStoreUserSnapshot(UserEntity? user) {
  final record = pb.authStore.record;
  if (!pb.authStore.isValid || record == null || user == null) return;
  if (record.id != user.uid) return;

  final merged = <String, dynamic>{
    ...record.data,
    'email': user.email,
    'displayName': user.displayName,
    'country': user.country,
    'language': user.language,
    'currency': user.currency,
    'ecosystem': user.ecosystem,
    'budgetRange': user.budgetRange,
    'priorities': user.priorities,
    'currentDevices': user.currentDevices,
    'subscriptions': user.subscriptions,
    'ownedProducts': user.ownedProducts,
    'favorites': user.favorites,
    'quizCompleted': user.quizCompleted,
    'isPremium': user.isPremium,
    'affiliateClicks': user.affiliateClicks,
    'comparisonsCount': user.comparisonsCount,
    'primaryCategory': user.primaryCategory,
    'usageIntent': user.usageIntent,
    'gender': user.gender,
    'ageRange': user.ageRange,
    'profession': user.profession,
    'interestCategories': user.interestCategories,
    'profileVector': user.profileVector,
    'userSubscriptionDetails': user.userSubscriptionDetails,
  };
  if (user.photoURL != null && user.photoURL!.isNotEmpty) {
    merged['photoURL'] = user.photoURL;
  }

  final updatedRecord = RecordModel.fromJson({
    'id': record.id,
    'collectionId': record.collectionId,
    'collectionName': record.collectionName,
    'created': user.createdAt.toIso8601String(),
    'updated': user.updatedAt.toIso8601String(),
    ...merged,
  });
  pb.authStore.save(pb.authStore.token, updatedRecord);
}

// ════════════════════════════════════════════════════
// ─── CORE SERVICE PROVIDERS ─── (Provider tipi)
// ════════════════════════════════════════════════════

/// PocketBase Data Source
final pbDataSourceProvider = Provider<PbDataSource>((ref) {
  return PbDataSource();
});

/// Hive Local Data Source
final hiveDataSourceProvider = Provider<HiveDataSource>((ref) {
  return HiveDataSource();
});

/// Dio HTTP Client
final dioProvider = Provider<Dio>((ref) {
  final dio = Dio();
  final pbHost = Uri.parse(kPbBaseUrl).host;
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) {
        // KRİTİK: PocketBase auth başlığını YALNIZ kendi backend'imize gönder.
        // Önceden HER isteğe ekleniyordu ve iki ciddi soruna yol açıyordu:
        //  (1) TANIMA BUG'I: Amazon beklenmedik bir `Authorization` başlığı
        //      görünce ürün başlığı OLMAYAN kırpılmış sayfa döndürüyordu
        //      (245KB vs 1.26MB, id="productTitle" YOK) → metadata title=null →
        //      "ürün tanınamadı". Cihazdan ölçülerek kanıtlandı.
        //  (2) GÜVENLİK: kullanıcının PB oturum token'ı Amazon/Trendyol gibi
        //      ÜÇÜNCÜ TARAF sitelere sızıyordu.
        if (options.uri.host == pbHost) {
          options.headers = withPbAuthHeaders(options.headers);
        }
        handler.next(options);
      },
    ),
  );
  return dio;
});

DateTime? _subscriptionDetailDate(dynamic value) {
  if (value is! String || value.isEmpty) return null;
  return DateTime.tryParse(value);
}

/// Cache Service - Section 7.4
final cacheServiceProvider = Provider<CacheService>((ref) {
  return CacheService();
});

/// AI Service — DeepSeek V3 (primary text intelligence, much cheaper)
final aiServiceProvider = Provider<AIService>((ref) {
  return DeepSeekService(
    dio: ref.read(dioProvider),
    cacheService: ref.read(cacheServiceProvider),
    pbDataSource: ref.read(pbDataSourceProvider),
  );
});

/// Gemini Service — ONLY for vision (analyzeImage) + web grounding (groundedQuery, enhancedSubscriptionAnalysis)
final geminiServiceProvider = Provider<GeminiService>((ref) {
  return GeminiService(
    dio: ref.read(dioProvider),
    cacheService: ref.read(cacheServiceProvider),
    pbDataSource: ref.read(pbDataSourceProvider),
  );
});

/// DeepSeek Service — primary AI for all text tasks
final deepSeekServiceProvider = Provider<DeepSeekService>((ref) {
  return ref.read(aiServiceProvider) as DeepSeekService;
});

/// Subscription Service (Google Play Billing)
final subscriptionServiceProvider = ChangeNotifierProvider<SubscriptionService>(
  (ref) {
    final service = SubscriptionService(
      remoteConfigService: ref.read(remoteConfigServiceProvider),
    );
    bool initializationScheduled = false;

    void scheduleInitialization() {
      if (initializationScheduled || service.isInitialized) {
        return;
      }
      initializationScheduled = true;
      Future<void>.delayed(_kSubscriptionStartupDelay, () async {
        if (!service.isInitialized) {
          await service.initialize();
        }
      });
    }

    // CRITICAL: use ref.listen (NOT ref.watch) for authStateProvider.
    // ref.watch would cause this ChangeNotifierProvider to be disposed and
    // recreated on every PocketBase token refresh (authStore.onChange fires
    // on every token renewal), which re-creates SubscriptionService and calls
    // _loadProducts() repeatedly — causing 12+ IAP reloads per session.
    ref.listen<AsyncValue<String?>>(authStateProvider, (_, next) {
      next.whenData((uid) {
        if (uid != null && !service.isInitialized) {
          scheduleInitialization();
          unawaited(service.refreshUsageIdentity(force: true));
        } else if (uid != null) {
          unawaited(service.refreshUsageIdentity(force: true));
        } else if (uid == null) {
          unawaited(service.refreshUsageIdentity(force: true));
          unawaited(service.syncProfileEntitlement(isPremium: false));
        }
      });
    });

    // Also trigger initialization with the current auth state on first build.
    final currentAuth = ref.read(authStateProvider);
    currentAuth.whenData((uid) {
      if (uid != null && !service.isInitialized) {
        scheduleInitialization();
      }
    });

    ref.listen<AsyncValue<UserEntity?>>(userProfileProvider, (_, next) {
      next.whenData((user) {
        unawaited(() async {
          _syncAuthStoreUserSnapshot(user);
          final premiumDetails = user?.userSubscriptionDetails['premium'];
          await service.syncProfileEntitlement(
            isPremium: user?.isPremium == true,
            activeProductId: premiumDetails?['productId'] as String?,
            purchaseDate: _subscriptionDetailDate(premiumDetails?['startedAt']),
            expirationDate: _subscriptionDetailDate(
              premiumDetails?['expiresAt'],
            ),
          );
          await service.refreshUsageIdentity(force: true);
        }());
      });
    });
    return service;
  },
);

/// Whether the current user has an active premium subscription
final premiumProvider = Provider<bool>((ref) {
  final localPremium = ref.watch(subscriptionServiceProvider).isPremium;
  final profilePremium =
      ref.watch(userProfileProvider).valueOrNull?.isPremium == true;
  return localPremium || profilePremium;
});

/// YouTube Review Fetcher (HTML scraping, no API key)
final youtubeServiceProvider = Provider<YouTubeService>((ref) {
  return YouTubeService(dio: ref.read(dioProvider));
});

/// Remote Config Service (PocketBase public_config tabanli)
final remoteConfigServiceProvider = Provider<RemoteConfigService>((ref) {
  return RemoteConfigService.fromPb(ref.read(pbDataSourceProvider));
});

/// Metadata Service - Section 9.2 (OG Tags, Web Scraping)
final metadataServiceProvider = Provider<MetadataService>((ref) {
  return MetadataService(
    dio: ref.read(dioProvider),
    cacheService: ref.read(cacheServiceProvider),
  );
});

/// Profile Algorithm Service - Section 8, 10
/// User profile vector calculation and product fit score algorithm
final profileAlgorithmServiceProvider = Provider<ProfileAlgorithmService>((
  ref,
) {
  return ProfileAlgorithmService();
});

/// Behavior Tracking Service - Tracks user interactions for personalization
final behaviorTrackingProvider = Provider<BehaviorTrackingService>((ref) {
  return BehaviorTrackingService();
});

/// Behavior Signals — built from real user data for personalized scoring.
/// Combines favorites, viewed products, and quiz preferences.
final behaviorSignalsProvider = FutureProvider<BehaviorSignals>((ref) async {
  // Only rebuild when user logs in/out — not on every profile stream emit
  ref.watch(userProfileProvider.select((u) => u.valueOrNull?.uid));
  final activeSearchQuery = ref.watch(searchQueryProvider);
  final user = ref.read(userProfileProvider).valueOrNull;
  if (user == null) return BehaviorSignals.empty;

  final hiveDs = ref.read(hiveDataSourceProvider);
  final recentSearches = <String>[
    if (activeSearchQuery.trim().length >= 2) activeSearchQuery.trim(),
    ...hiveDs.getRecentSearches(),
  ];
  final dedupedSearches = <String>[];
  final seenSearches = <String>{};
  for (final query in recentSearches) {
    final normalized = query.trim();
    if (normalized.length < 2) continue;
    final key = normalized.toLowerCase();
    if (!seenSearches.add(key)) continue;
    dedupedSearches.add(normalized);
    if (dedupedSearches.length >= 12) break;
  }

  // Viewed product IDs (from PB + Hive)
  final viewedIds = ref.watch(viewedProductsProvider).valueOrNull ?? <String>[];

  // productViews: each viewed product gets at least 1 view signal
  final productViews = <String, int>{for (final id in viewedIds) id: 1};

  // categoryViews: derived from interest categories (weighted by position)
  final categoryViews = <String, int>{};
  for (int i = 0; i < user.interestCategories.length; i++) {
    final cat = user.interestCategories[i].toLowerCase();
    categoryViews[cat] = (user.interestCategories.length - i) * 3;
  }
  if (user.primaryCategory != null) {
    final primary = user.primaryCategory!.toLowerCase();
    categoryViews[primary] = (categoryViews[primary] ?? 0) + 10;
  }

  // favorites: direct from user profile
  final favorites = user.favorites.toSet();

  return BehaviorSignals(
    favorites: favorites,
    productViews: productViews,
    categoryViews: categoryViews,
    recentSearches: dedupedSearches,
  );
});

/// Global algorithm aggregates (cross-user collaborative signals)
final globalAlgorithmSignalsProvider = FutureProvider<GlobalAlgorithmSignals>((
  ref,
) async {
  return GlobalAlgorithmSignals.load();
});

/// Tech Score Service - Category-based technical score calculation
final techScoreServiceProvider = Provider<TechScoreService>((ref) {
  return TechScoreService();
});

// ════════════════════════════════════════════════════
// ─── REPOSITORY PROVIDERS ───
// ════════════════════════════════════════════════════

/// Auth Repository
final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(
    pbDS: ref.read(pbDataSourceProvider),
    cache: ref.read(cacheServiceProvider),
    hive: ref.read(hiveDataSourceProvider),
  );
});

/// Product Repository
final productRepositoryProvider = Provider<ProductRepository>((ref) {
  return ProductRepository(
    pbDS: ref.read(pbDataSourceProvider),
    hiveDS: ref.read(hiveDataSourceProvider),
  );
});

/// Comparison Repository
final comparisonRepositoryProvider = Provider<ComparisonRepositoryImpl>((ref) {
  return ComparisonRepositoryImpl(
    pbDS: ref.read(pbDataSourceProvider),
    aiService: ref.read(aiServiceProvider),
  );
});

/// AI Repository — uses Gemini (with url_context grounding) for link analysis
/// so the model can actually read the product page and avoid wrong-product hallucinations.
final aiRepositoryProvider = Provider<AIRepository>((ref) {
  return AIRepository(
    aiService: ref.read(geminiServiceProvider),
    pbDS: ref.read(pbDataSourceProvider),
    metadataService: ref.read(metadataServiceProvider),
  );
});

/// Scraper Repository
final scraperRepositoryProvider = Provider<ScraperRepository>((ref) {
  return ScraperRepository();
});

// ════════════════════════════════════════════════════
// ─── SCRAPER PROVIDERS ─── (Admin Panel Integration)
// ════════════════════════════════════════════════════

/// Scraper sources stream
final scraperSourcesProvider = StreamProvider<List<ScraperSource>>((ref) {
  return ref.read(scraperRepositoryProvider).watchSources();
});

/// Scraper brands stream
final scraperBrandsProvider = StreamProvider<List<ScraperBrand>>((ref) {
  return ref.read(scraperRepositoryProvider).watchBrands();
});

/// Scraper schedules stream
final scraperSchedulesProvider = StreamProvider<List<ScraperSchedule>>((ref) {
  return ref.read(scraperRepositoryProvider).watchSchedules();
});

/// Scraper logs stream
final scraperLogsProvider = StreamProvider<List<ScraperLog>>((ref) {
  return ref.read(scraperRepositoryProvider).watchLogs(limit: 20);
});

/// Category templates stream
final categoryTemplatesProvider = StreamProvider<List<CategoryTemplate>>((ref) {
  return ref.read(scraperRepositoryProvider).watchCategoryTemplates();
});

/// Streaming services stream (for services like Spotify, Netflix)
final streamingServicesStreamProvider = StreamProvider<List<StreamingService>>((
  ref,
) {
  return ref.read(scraperRepositoryProvider).watchStreamingServices();
});

/// Scraper status provider
final scraperStatusProvider = FutureProvider<ScraperStatus>((ref) {
  return ref.read(scraperRepositoryProvider).getStatus();
});

// ════════════════════════════════════════════════════
// ─── USE CASE PROVIDERS ───
// ════════════════════════════════════════════════════

final calculateScoreUseCaseProvider = Provider<CalculateScoreUseCase>((ref) {
  return CalculateScoreUseCase();
});
