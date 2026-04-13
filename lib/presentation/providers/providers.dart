/// Compair - Riverpod Providers
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
import 'package:pocketbase/pocketbase.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:dio/dio.dart';
import 'package:compair/config/env_config.dart';
import 'package:compair/data/datasources/pb_ds.dart';
import 'package:compair/data/datasources/hive_ds.dart';
import 'package:compair/core/pb_client.dart';
import 'package:compair/data/repositories/auth_repo.dart';
import 'package:compair/data/repositories/product_repo.dart';
import 'package:compair/data/repositories/comparison_repo.dart';
import 'package:compair/data/repositories/ai_repo.dart';
import 'package:compair/data/repositories/scraper_repo.dart';
import 'package:compair/data/models/scraper_models.dart';
import 'package:compair/domain/entities/user_entity.dart';
import 'package:compair/domain/entities/product_entity.dart';
import 'package:compair/domain/entities/ai_entities.dart';
import 'package:compair/domain/entities/comparison_entity.dart';
import 'package:compair/domain/usecases/calculate_score.dart';
import 'package:compair/services/ai_service.dart';
import 'package:compair/services/spec_direction_service.dart';
import 'package:flutter/material.dart';
import 'package:compair/services/gemini_service.dart';
import 'package:compair/services/cache_service.dart';
import 'package:compair/services/subscription_service.dart';
import 'package:compair/services/remote_config_service.dart';
import 'package:compair/services/metadata_service.dart';
import 'package:compair/services/profile_algorithm_service.dart';
import 'package:compair/services/tech_score_service.dart';
import 'package:compair/services/youtube_service.dart';
import 'package:compair/services/google_search_service.dart';
import 'package:compair/services/behavior_tracking_service.dart';
import 'package:compair/services/ip_location_service.dart';
import 'package:compair/services/analytics_service.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/core/product_filter.dart';
import 'package:compair/core/constants.dart';

import 'package:compair/data/models/other_models.dart';
import 'package:compair/data/models/product_model.dart';
import 'package:compair/data/models/chat_conversation.dart';

// ── Part files ──
part 'auth_providers.dart';
part 'ui_providers.dart';
part 'product_providers.dart';
part 'compare_providers.dart';
part 'cache_providers.dart';
part 'ai_providers.dart';


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
  return Dio();
});

/// Cache Service - Section 7.4
final cacheServiceProvider = Provider<CacheService>((ref) {
  return CacheService();
});

/// AI Service — Gemini Flash 2.5 (core intelligence)
final aiServiceProvider = Provider<AIService>((ref) {
  return GeminiService(
    dio: ref.read(dioProvider),
    cacheService: ref.read(cacheServiceProvider),
    apiKey: EnvConfig.geminiApiKey,
  );
});

/// Gemini Service (concrete type for multimodal features like image analysis)
final geminiServiceProvider = Provider<GeminiService>((ref) {
  return ref.read(aiServiceProvider) as GeminiService;
});

/// Subscription Service (Google Play Billing)
final subscriptionServiceProvider = ChangeNotifierProvider<SubscriptionService>((ref) {
  final service = SubscriptionService();
  // Initialize when user auth state is available
  final authState = ref.watch(authStateProvider);
  authState.whenData((user) {
    if (user != null && !service.isInitialized) {
      service.initialize();
    }
  });
  return service;
});

/// Whether the current user has an active premium subscription
final premiumProvider = Provider<bool>((ref) {
  return ref.watch(subscriptionServiceProvider).isPremium;
});

/// YouTube Data API v3 Service
final youtubeServiceProvider = Provider<YouTubeService>((ref) {
  return YouTubeService(
    dio: ref.read(dioProvider),
    apiKey: EnvConfig.youtubeApiKey,
  );
});

/// Google Custom Search API Service
final googleSearchServiceProvider = Provider<GoogleSearchService>((ref) {
  return GoogleSearchService(
    dio: ref.read(dioProvider),
    apiKey: EnvConfig.googleSearchApiKey,
    searchEngineId: EnvConfig.googleSearchEngineId,
  );
});

/// Remote Config Service (PocketBase app_config tabanlı)
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
final profileAlgorithmServiceProvider = Provider<ProfileAlgorithmService>((ref) {
  return ProfileAlgorithmService();
});

/// Behavior Tracking Service - Tracks user interactions for personalization
final behaviorTrackingProvider = Provider<BehaviorTrackingService>((ref) {
  return BehaviorTrackingService();
});

/// Behavior Signals - loaded once per session for algorithm scoring.
/// Reads back the behavior data collected by BehaviorTrackingService.
final behaviorSignalsProvider = FutureProvider<BehaviorSignals>((ref) async {
  final userAsync = ref.watch(userProfileProvider);
  final user = userAsync.valueOrNull;
  if (user == null) return BehaviorSignals.empty;
  return BehaviorSignals.load(user.uid);
});

/// Global algorithm aggregates (cross-user collaborative signals)
final globalAlgorithmSignalsProvider =
    FutureProvider<GlobalAlgorithmSignals>((ref) async {
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

/// AI Repository
final aiRepositoryProvider = Provider<AIRepository>((ref) {
  return AIRepository(
    aiService: ref.read(aiServiceProvider),
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
final streamingServicesStreamProvider = StreamProvider<List<StreamingService>>((ref) {
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

