/// Compair - Riverpod Providers
/// Blueprint Section 3.3 (Provider Tipleri tablosu)
///
/// Provider: Constants, services -> themeProvider, routerProvider
/// StateNotifierProvider: Complex state -> comparisonStateProvider
/// FutureProvider: Async data fetching -> productDetailProvider
/// StreamProvider: Realtime data -> userProfileStreamProvider
/// StateProvider: Simple state -> selectedCategoryProvider
library;

import 'dart:convert';
import 'dart:math';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:dio/dio.dart';
import 'package:compair/config/env_config.dart';
import 'package:compair/data/datasources/firebase_ds.dart';
import 'package:compair/data/datasources/hive_ds.dart';
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
import 'package:firebase_remote_config/firebase_remote_config.dart';
import 'package:compair/core/errors.dart';

import 'package:compair/data/models/other_models.dart';
import 'package:compair/data/models/product_model.dart';
import 'package:compair/data/models/chat_conversation.dart';

// ════════════════════════════════════════════════════
// ─── CORE SERVICE PROVIDERS ─── (Provider tipi)
// ════════════════════════════════════════════════════

/// Firebase Data Source
final firebaseDataSourceProvider = Provider<FirebaseDataSource>((ref) {
  return FirebaseDataSource();
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

/// Remote Config Service - Section 21.1
final remoteConfigServiceProvider = Provider<RemoteConfigService>((ref) {
  return RemoteConfigService(FirebaseRemoteConfig.instance);
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
    firebaseDS: ref.read(firebaseDataSourceProvider),
  );
});

/// Product Repository
final productRepositoryProvider = Provider<ProductRepository>((ref) {
  return ProductRepository(
    firebaseDS: ref.read(firebaseDataSourceProvider),
    hiveDS: ref.read(hiveDataSourceProvider),
  );
});

/// Comparison Repository
final comparisonRepositoryProvider = Provider<ComparisonRepositoryImpl>((ref) {
  return ComparisonRepositoryImpl(
    firebaseDS: ref.read(firebaseDataSourceProvider),
    aiService: ref.read(aiServiceProvider),
  );
});

/// AI Repository
final aiRepositoryProvider = Provider<AIRepository>((ref) {
  return AIRepository(
    aiService: ref.read(aiServiceProvider),
    firebaseDS: ref.read(firebaseDataSourceProvider),
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

// ════════════════════════════════════════════════════
// ─── AUTH PROVIDERS ─── (StreamProvider)
// ════════════════════════════════════════════════════

/// Firebase Auth state stream - Section 3.3 StreamProvider
final authStateProvider = StreamProvider<User?>((ref) {
  return FirebaseAuth.instance.authStateChanges();
});

/// User profile stream (Firestore realtime) - userProfileStreamProvider
final userProfileStreamProvider = StreamProvider<UserEntity?>((ref) {
  final authState = ref.watch(authStateProvider);
  return authState.when(
    data: (user) {
      if (user == null) return Stream.value(null);
      return ref.read(firebaseDataSourceProvider).watchUser(user.uid);
    },
    loading: () => Stream.value(null),
    error: (_, __) => Stream.value(null),
  );
});

/// Updates user profile country in Firestore from IP detection when not already set
final countryInitProvider = FutureProvider<void>((ref) async {
  final authState = await ref.watch(authStateProvider.future);
  if (authState == null) return;
  final detectedCountry = await ref.watch(detectedCountryProvider.future);
  if (detectedCountry.isEmpty || detectedCountry == 'US') return;

  try {
    final user = await ref.read(userProfileProvider.future);
    if (user != null && (user.country == 'US' || user.country.isEmpty)) {
      await ref.read(firebaseDataSourceProvider).updateUser(authState.uid, {'country': detectedCountry});
    }
  } catch (_) {}
});

// ════════════════════════════════════════════════════
// ─── STATE PROVIDERS ─── (StateProvider - simple state)
// ════════════════════════════════════════════════════

/// Selected category - Section 3.3
final selectedCategoryProvider = StateProvider<String?>((ref) => null);

/// Selected country — auto-detected via IP on first use, can be overridden
final selectedCountryProvider = StateProvider<String>((ref) {
  // Kick off IP detection; update state when result arrives
  ref.listen(detectedCountryProvider, (_, next) {
    next.whenData((country) {
      if (country.isNotEmpty && country != 'US') {
        // Only override default; user-set values are handled separately
        ref.controller.state = country;
      }
    });
  });
  return 'US'; // initial default; updated async by IP detection
});

/// Language / Locale manager — persisted in CacheService
final localeProvider = StateNotifierProvider<LocaleNotifier, Locale?>((ref) {
  return LocaleNotifier(ref.read(cacheServiceProvider));
});

class LocaleNotifier extends StateNotifier<Locale?> {
  final CacheService _cacheService;

  /// Supported language codes matching AppLocalizations.supportedLocales
  static const _supported = {'ar','de','en','es','fr','it','ja','nl','pl','pt','sv','tr'};

  LocaleNotifier(this._cacheService) : super(null) {
    _load();
  }

  void _load() {
    final saved = _cacheService.getLanguage();
    if (saved.isNotEmpty) {
      state = Locale(saved);
      return;
    }
    // First install: auto-detect from device locale
    try {
      final deviceLocale = WidgetsBinding.instance.platformDispatcher.locale;
      final langCode = deviceLocale.languageCode;
      if (_supported.contains(langCode)) {
        state = Locale(langCode);
        _cacheService.saveLanguage(langCode);
      }
    } catch (_) {}
  }

  void setLocale(String languageCode) {
    state = Locale(languageCode);
    _cacheService.saveLanguage(languageCode);
  }

  void clearLocale() {
    state = null;
    _cacheService.saveLanguage('');
  }
}

/// Search query
final searchQueryProvider = StateProvider<String>((ref) => '');

/// Home page selected tab index
final bottomNavIndexProvider = StateProvider<int>((ref) => 1);

/// Current page context for the floating AI chat bubble.
/// Updated by screens when they load (product name, category, etc.)
final aiPageContextProvider = StateProvider<Map<String, dynamic>?>((ref) => null);

/// Text scale factor for display settings
final textScaleProvider = StateProvider<double>((ref) => 1.0);

/// Theme mode manager (System, Light, Dark) - Section 14
final themeModeProvider = StateNotifierProvider<ThemeModeNotifier, ThemeMode>((ref) {
  return ThemeModeNotifier(ref.read(cacheServiceProvider));
});

class ThemeModeNotifier extends StateNotifier<ThemeMode> {
  final CacheService _cacheService;

  ThemeModeNotifier(this._cacheService) : super(ThemeMode.system) {
    _loadTheme();
  }

  void _loadTheme() {
    final savedTheme = _cacheService.getThemeMode();
    state = savedTheme;
  }

  void setThemeMode(ThemeMode mode) {
    state = mode;
    _cacheService.saveThemeMode(mode);
  }
}

// ════════════════════════════════════════════════════
// ─── FUTURE PROVIDERS ─── (Async data fetching)
// ════════════════════════════════════════════════════

/// Product detail - Section 3.3 FutureProvider
final productDetailProvider =
    FutureProvider.family<Result<ProductEntity>, String>((ref, productId) async {
  // 1) Try from already-cached homeFeed (instant, no network)
  final feedAsync = ref.read(homeFeedProvider);
  final cached = feedAsync.valueOrNull;
  if (cached != null) {
    final match = cached.all.where((p) => p.id == productId).firstOrNull;
    if (match != null) return Success(match);
  }

  // 2) Try from in-memory Hive/firestore cache (populated by browse/search)
  final ds = ref.read(firebaseDataSourceProvider);
  if (ds.isCacheReady) {
    final allCached = await ds.getAllCachedProducts();
    final match = allCached.where((p) => p.id == productId).firstOrNull;
    if (match != null) return Success(match);
  }

  // 3) Fall back to single Firestore doc fetch with timeout
  try {
    return await ref.read(productRepositoryProvider).getProduct(productId)
        .timeout(const Duration(seconds: 25));
  } catch (e) {
    return Failure(ServerException(message: 'Product load timed out. Check your connection.'));
  }
});

/// Category list
final categoriesProvider =
    FutureProvider<Result<List<CategoryModel>>>((ref) async {
  // Try Hive cache first (categories rarely change)
  try {
    final cacheService = ref.read(cacheServiceProvider);
    final cached = await cacheService.getLocal<List>('categories_v1');
    if (cached != null && cached.isNotEmpty) {
      final cats = cached
          .map((e) => CategoryModel.fromMap(Map<String, dynamic>.from(e as Map)))
          .toList();
      return Success(cats);
    }
  } catch (_) {}

  final result = await ref.read(productRepositoryProvider).getCategories();
  // Cache on success for 24 hours
  if (result is Success<List<CategoryModel>>) {
    try {
      final cacheService = ref.read(cacheServiceProvider);
      await cacheService.setLocal(
        'categories_v1',
        (result as Success<List<CategoryModel>>).data.map((c) => c.toMap()).toList(),
        duration: const Duration(hours: 24),
      );
    } catch (_) {}
  }
  return result;
});

/// Removes variant suffixes from product name — for grouping
String normalizeProductName(String name) {
  return name
      .replaceAll(RegExp(r'\b\d+\s*TB\b', caseSensitive: false), '')
      .replaceAll(RegExp(r'\b\d+\s*GB\b', caseSensitive: false), '')
      .replaceAll(RegExp(r'\b\d+\s*MB\b', caseSensitive: false), '')
      .replaceAll(RegExp(r'\b\d+/\d+\b'), '') // 8/256 RAM/Storage combos
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim()
      .toLowerCase();
}

/// Extracts storage capacity in MB from a product's ID (URL slug).
/// Products with no storage in their ID (base model URLs like "xiaomi-15")
/// return 0 — they are treated as the smallest and shown as representative.
int _storageCapacityMB(ProductEntity p) {
  final m = RegExp(r'(\d+)(tb|gb|mb)', caseSensitive: false).firstMatch(p.id);
  if (m == null) return 0; // no storage suffix → base model → show in list
  final val = int.tryParse(m.group(1)!) ?? 0;
  switch (m.group(2)!.toLowerCase()) {
    case 'tb': return val * 1024 * 1024;
    case 'gb': return val * 1024;
    case 'mb': return val;
    default: return 0;
  }
}

/// Deduplicates variant products for list display.
/// Groups by `variantGroup` field (set by scraper from URL slug).
/// Representative is the base model (no storage in ID) or smallest storage.
List<ProductEntity> deduplicateVariants(List<ProductEntity> products) {
  final seen = <String, ProductEntity>{};
  final nameKeys = <String, ProductEntity>{};
  for (final p in products) {
    // Primary dedup: variantGroup
    final key = p.variantGroup.isNotEmpty ? p.variantGroup : p.id;
    final existing = seen[key];
    if (existing == null || _storageCapacityMB(p) < _storageCapacityMB(existing)) {
      seen[key] = p;
    }
    // Secondary dedup: normalized name (catches same product with different IDs)
    final nameKey = _normalizeProductName(p.name);
    if (!nameKeys.containsKey(nameKey)) {
      nameKeys[nameKey] = p;
    }
  }
  // Merge: prefer variantGroup dedup, then name dedup
  final result = <String, ProductEntity>{};
  for (final p in seen.values) {
    final nameKey = _normalizeProductName(p.name);
    result.putIfAbsent(nameKey, () => p);
  }
  return result.values.toList();
}

/// Normalize product name for dedup (strip storage/color variants)
String _normalizeProductName(String name) {
  return name
      .toLowerCase()
      .replaceAll(RegExp(r'\s*\(\d+\s*gb\)'), '') // (512 GB)
      .replaceAll(RegExp(r'\s*\(\d+\s*tb\)'), '') // (1 TB)
      .replaceAll(RegExp(r'\s*\d+\s*gb\s*$'), '')  // trailing "512 GB"
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
}

/// Static per-category cache — survives provider re-reads, cleared only on app restart.
final _categoryCacheMap = <String, List<ProductEntity>>{};

/// Products by category — paginated Firestore loading, returns ALL products.
final productsByCategoryProvider = FutureProvider.family<
    Result<List<ProductEntity>>, String>((ref, category) async {
  const categoryAliases = <String, List<String>>{
    'cpus':         ['cpus', 'cpu', 'processors', 'işlemciler', 'islemci'],
    'gpus':         ['gpus', 'gpu', 'graphics-cards', 'ekran-karti', 'ekran kartı'],
    'motherboards': ['motherboards', 'anakart', 'mainboard'],
    'ram':          ['ram', 'bellek-ram', 'memory'],
    'ssd':          ['ssd', 'ssds', 'storage', 'disk'],
    'psu':          ['psu', 'power-supply-psu', 'power-supply', 'güç kaynağı'],
    'cases':        ['cases', 'bilgisayar-kasasi', 'case', 'kasa'],
    'coolers':      ['coolers', 'islemci-sogutucu', 'cooler', 'soğutucu'],
    'monitors':     ['monitors', 'monitor', 'monitör'],
    'keyboards':    ['keyboards', 'keyboard', 'klavye'],
    'mice':         ['mice', 'mouse', 'fare'],
    'headsets':     ['headsets', 'headset', 'kulaklık', 'headphones'],
    'laptops':      ['laptops', 'laptop', 'dizüstü'],
    'smartphones':  ['smartphones', 'smartphone', 'telefon', 'cep-telefonu'],
    'tablets':      ['tablets', 'tablet'],
    'smartwatches': ['smartwatches', 'smartwatch', 'akıllı saat'],
    'cameras':      ['cameras', 'camera', 'kamera', 'fotoğraf makinesi'],
    'tvs':          ['tvs', 'tv', 'televizyon'],
    'speakers':     ['speakers', 'speaker', 'hoparlör'],
    'consoles':     ['consoles', 'console', 'oyun konsolu'],
    'routers':      ['routers', 'router', 'modem'],
    'dashcams':     ['dashcams', 'dashcam', 'araç kamerası'],
    'drones':       ['drones', 'drone'],
    'desktops':     ['desktops', 'desktop', 'masaüstü'],
    'earphones':    ['earphones', 'earphone', 'kulak içi kulaklık'],
    'printers':     ['printers', 'printer', 'yazıcı'],
    'projectors':   ['projectors', 'projector', 'projeksiyon'],
    'robot-vacuums':['robot-vacuums', 'robot vacuum', 'robot süpürge'],
    'webcams':      ['webcams', 'webcam', 'web kamerası'],
    'gamepads':     ['gamepads', 'gamepad', 'oyun kolu'],
    'media-players':['media-players', 'media player'],
    'action-cameras':['action-cameras', 'aksiyon-kamera', 'action camera'],
    'ip-cameras':   ['ip-cameras', 'ip-kamera', 'ip camera'],
    'smart-rings':  ['smart-rings', 'akıllı yüzük', 'smart ring'],
    'soundbars':    ['soundbars', 'soundbar'],
    'microphones':  ['microphones', 'microphone', 'mikrofon'],
    'vr-headsets':  ['vr-headsets', 'sanal gerçeklik', 'vr headset'],
    'gimbals':      ['gimbals', 'gimbal'],
    'tripods':      ['tripods', 'tripod'],
    'lenses':       ['lenses', 'lens'],
  };

  final normalizedCategory = category.toLowerCase().trim();
  final aliases = categoryAliases[normalizedCategory] ?? [normalizedCategory];

  // Defunct brands to suppress
  const defunctBrands = {
    'alcatel', 'micromax', 'karbonn', 'lava', 'intex', 'xolo',
    'coolpad', 'leeco', 'le eco', 'gionee', 'panasonic mobile',
    'blackberry', 'htc', 'zte', 'wiko', 'meizu', 'sharp mobile',
    'vernee', 'doogee', 'oukitel', 'umidigi', 'ulefone', 'cubot',
    'homtom', 'bluboo', 'elephone', 'leagoo', 'maze', 'nomu',
    'altus', 'vestel', 'casper', 'reeder', 'general mobile', 'turkcell',
    'grundig', 'beko', 'arçelik', 'hometech', 'vorcom', 'tcl mobile',
  };

  Result<List<ProductEntity>> _sortAndReturn(List<ProductEntity> products) {
    final deduped = deduplicateVariants(products);
    final filtered = deduped.where((p) {
      final brand = (p.brand ?? '').toLowerCase().trim();
      return !defunctBrands.contains(brand);
    }).toList();
    final sorted = List<ProductEntity>.from(filtered)
      ..sort((a, b) {
        final tsCmp = b.techScore.compareTo(a.techScore);
        if (tsCmp != 0) return tsCmp;
        return b.trendScore.compareTo(a.trendScore);
      });
    return Success(sorted);
  }

  // ── 1) Check static in-memory category cache (instant) ──
  if (_categoryCacheMap.containsKey(normalizedCategory)) {
    return _sortAndReturn(_categoryCacheMap[normalizedCategory]!);
  }

  // ── 2) Paginated Firestore query — always use serverAndCache for complete data ──
  final db = FirebaseFirestore.instance;
  const batchSize = 500;
  const maxTotal = 5000;

  Future<List<ProductEntity>> _paginatedLoad(String alias, Source source) async {
    final all = <ProductEntity>[];
    DocumentSnapshot? lastDoc;
    while (all.length < maxTotal) {
      var query = db.collection('products')
          .where('category', isEqualTo: alias)
          .limit(batchSize);
      if (lastDoc != null) query = query.startAfterDocument(lastDoc);
      final snap = await query
          .get(GetOptions(source: source))
          .timeout(const Duration(seconds: 20));
      if (snap.docs.isEmpty) break;
      for (final d in snap.docs) {
        try {
          all.add(ProductModel.fromFirestore(d) as ProductEntity);
        } catch (_) {}
      }
      lastDoc = snap.docs.last;
      if (snap.docs.length < batchSize) break;
    }
    return all;
  }

  for (final alias in aliases) {
    try {
      // Always fetch from server (with cache fallback) to get ALL products
      final all = await _paginatedLoad(alias, Source.serverAndCache);
      if (all.isNotEmpty) {
        _categoryCacheMap[normalizedCategory] = all;
        debugPrint('CATEGORY: loaded ${all.length} products for "$alias"');
        return _sortAndReturn(all);
      }
    } catch (e) {
      debugPrint('CATEGORY: query failed for "$alias": $e');
      // Try cache-only as last resort (offline mode)
      try {
        final cached = await _paginatedLoad(alias, Source.cache);
        if (cached.isNotEmpty) {
          _categoryCacheMap[normalizedCategory] = cached;
          return _sortAndReturn(cached);
        }
      } catch (_) {}
    }
  }

  // ── 3) Keyword fallback — search by product name/brand keywords ──
  const keywordMap = <String, List<String>>{
    'cpus':         ['işlemci', 'cpu', 'processor', 'ryzen', 'core i', 'intel core', 'amd ryzen'],
    'gpus':         ['ekran kartı', 'gpu', 'graphics', 'geforce', 'radeon', 'rtx', 'rx '],
    'motherboards': ['anakart', 'motherboard', 'mainboard'],
    'ram':          ['ram', 'bellek', 'memory', 'ddr4', 'ddr5'],
    'ssd':          ['ssd', 'nvme', 'm.2', 'solid state'],
    'psu':          ['power supply', 'psu', 'güç kaynağı'],
    'cases':        ['kasa', 'case', 'tower', 'chassis'],
    'coolers':      ['soğutucu', 'cooler', 'fan', 'heatsink'],
    'monitors':     ['monitor', 'monitör'],
    'keyboards':    ['keyboard', 'klavye', 'mechanical'],
    'mice':         ['mouse', 'fare', 'gaming mouse'],
    'headsets':     ['headset', 'kulaklık', 'headphone'],
  };
  try {
    final keywords = keywordMap[normalizedCategory];
    if (keywords != null) {
      // Broad query — get a large set and filter client-side
      final all = <ProductEntity>[];
      DocumentSnapshot? lastDoc;
      while (all.length < 2000) {
        var query = db.collection('products').limit(500);
        if (lastDoc != null) query = query.startAfterDocument(lastDoc);
        final snap = await query.get().timeout(const Duration(seconds: 20));
        if (snap.docs.isEmpty) break;
        for (final d in snap.docs) {
          try {
            final p = ProductModel.fromFirestore(d) as ProductEntity;
            final name = p.name.toLowerCase();
            final cat = p.category.toLowerCase();
            if (keywords.any((k) => name.contains(k) || cat.contains(k))) {
              all.add(p);
            }
          } catch (_) {}
        }
        lastDoc = snap.docs.last;
        if (snap.docs.length < 500) break;
      }
      if (all.isNotEmpty) {
        _categoryCacheMap[normalizedCategory] = all;
        return _sortAndReturn(all);
      }
    }
  } catch (e) {
    debugPrint('CATEGORY: keyword fallback failed: $e');
  }

  return const Success(<ProductEntity>[]);
});

/// Trend veriler - Section 6.1
final trendsProvider = FutureProvider<Result<List<TrendModel>>>((ref) {
  final country = ref.watch(selectedCountryProvider);
  final category = ref.watch(selectedCategoryProvider);
  return ref.read(productRepositoryProvider).getTrends(
        country: country,
        category: category,
      );
});

// ════════════════════════════════════════════════════
// ─── COMPARISON STATE ─── (StateNotifierProvider - kompleks state)
// ════════════════════════════════════════════════════

/// Comparison state - Section 3.3
final comparisonStateProvider =
    StateNotifierProvider<ComparisonNotifier, ComparisonState>((ref) {
  return ComparisonNotifier(
    comparisonRepo: ref.read(comparisonRepositoryProvider),
    subscriptionService: ref.read(subscriptionServiceProvider),
  );
});

/// Comparison state
class ComparisonState {
  final List<String> selectedProductIds;
  final ComparisonResult? result;
  final bool isLoading;
  final String? loadingMessage; // Detailed message to display to the user
  final String? error;

  const ComparisonState({
    this.selectedProductIds = const [],
    this.result,
    this.isLoading = false,
    this.loadingMessage,
    this.error,
  });

  ComparisonState copyWith({
    List<String>? selectedProductIds,
    ComparisonResult? result,
    bool? isLoading,
    String? loadingMessage,
    String? error,
  }) {
    return ComparisonState(
      selectedProductIds: selectedProductIds ?? this.selectedProductIds,
      result: result ?? this.result,
      isLoading: isLoading ?? this.isLoading,
      loadingMessage: loadingMessage ?? this.loadingMessage,
      error: error,
    );
  }
}

/// Comparison state manager
class ComparisonNotifier extends StateNotifier<ComparisonState> {
  final ComparisonRepositoryImpl _comparisonRepo;
  final SubscriptionService _subscriptionService;

  ComparisonNotifier({
    required ComparisonRepositoryImpl comparisonRepo,
    required SubscriptionService subscriptionService,
  })  : _comparisonRepo = comparisonRepo,
        _subscriptionService = subscriptionService,
        super(const ComparisonState());

  /// Select/remove product
  void toggleProduct(String productId) {
    final current = List<String>.from(state.selectedProductIds);
    if (current.contains(productId)) {
      current.remove(productId);
    } else if (current.length < 4) {
      current.add(productId);
    }
    state = state.copyWith(selectedProductIds: current);
  }

  /// Clear selection
  void clearSelection() {
    state = const ComparisonState();
  }

  /// Start comparison
  Future<void> startComparison(UserEntity user) async {
    if (state.selectedProductIds.length < 2) return;

    // Free tier limit check
    final limitResult = _subscriptionService.recordComparison();
    if (limitResult.isFailure) {
      state = state.copyWith(
        error: 'You have reached the daily comparison limit. Upgrade to Pro for unlimited usage!',
        isLoading: false,
      );
      return;
    }

    state = state.copyWith(
      isLoading: true, 
      error: null,
      loadingMessage: 'Gathering product data...',
    );

    // AI Decision Engine Steps (Simulated progress)
    _updateLoadingMessage('AI is comparing features...');
    
    final result = await _comparisonRepo.compareProducts(
      productIds: state.selectedProductIds,
      user: user,
    );

    result.when(
      success: (data) {
        state = state.copyWith(
          result: data, 
          isLoading: false, 
          loadingMessage: null,
        );
      },
      failure: (error) {
        state = state.copyWith(
          error: error.message, 
          isLoading: false,
          loadingMessage: null,
        );
      },
    );
  }

  void _updateLoadingMessage(String message) {
    if (state.isLoading) {
      state = state.copyWith(loadingMessage: message);
    }
  }
}

// ════════════════════════════════════════════════════
// ─── LINK PASTE PROVIDER ─── Section 9
// ════════════════════════════════════════════════════

final linkAnalysisProvider = StateNotifierProvider<LinkAnalysisNotifier,
    LinkAnalysisState>((ref) {
  return LinkAnalysisNotifier(
    aiRepo: ref.read(aiRepositoryProvider),
    subscriptionService: ref.read(subscriptionServiceProvider),
    ref: ref,
  );
});

class LinkAnalysisState {
  final List<LinkAnalysisResult> results;
  final bool isLoading;
  final String? error;

  const LinkAnalysisState({
    this.results = const [],
    this.isLoading = false,
    this.error,
  });

  LinkAnalysisState copyWith({
    List<LinkAnalysisResult>? results,
    bool? isLoading,
    String? error,
  }) {
    return LinkAnalysisState(
      results: results ?? this.results,
      isLoading: isLoading ?? this.isLoading,
      error: error,
    );
  }
}

class LinkAnalysisNotifier extends StateNotifier<LinkAnalysisState> {
  final AIRepository _aiRepo;
  final SubscriptionService _subscriptionService;
  final Ref _ref;

  LinkAnalysisNotifier({
    required AIRepository aiRepo,
    required SubscriptionService subscriptionService,
    required Ref ref,
  })  : _aiRepo = aiRepo,
        _subscriptionService = subscriptionService,
        _ref = ref,
        super(const LinkAnalysisState());

  String get _appLang => _ref.read(localeProvider)?.languageCode ?? 'en';

  /// Analyze link - Section 9.1
  Future<void> analyzeLink(String url, UserEntity user) async {
    // Free tier limit check
    final limitResult = _subscriptionService.recordLinkPaste();
    if (limitResult.isFailure) {
      state = state.copyWith(
        error: 'You have reached the daily link analysis limit. Upgrade to Pro for unlimited usage!',
        isLoading: false,
      );
      return;
    }

    state = state.copyWith(isLoading: true, error: null);

    final localizedUser = user.copyWith(language: _appLang);
    final result = await _aiRepo.analyzeLink(url: url, user: localizedUser);

    result.when(
      success: (data) {
        final updatedResults = [...state.results, data];
        state = state.copyWith(results: updatedResults, isLoading: false);
      },
      failure: (error) {
        state = state.copyWith(error: error.message, isLoading: false);
      },
    );
  }

  void clearResults() {
    state = const LinkAnalysisState();
  }
}

// ════════════════════════════════════════════════════
// ─── LINK QUIZ FLOW ─── (AI Quiz for Link Analysis)
// ════════════════════════════════════════════════════

enum LinkFlowPhase { idle, analyzing, quizLoading, quiz, computing, result }

class LinkQuizState {
  final LinkFlowPhase phase;
  final LinkAnalysisResult? baseResult;
  final ProductQuiz? quiz;
  final List<QuizQuestion> answeredQuestions;
  final EnhancedAnalysisResult? enhancedResult;
  final String? error;
  final int currentQuestionIndex;
  final ProductEntity? databaseMatch;
  final List<ProductEntity> similarProducts;

  const LinkQuizState({
    this.phase = LinkFlowPhase.idle,
    this.baseResult,
    this.quiz,
    this.answeredQuestions = const [],
    this.enhancedResult,
    this.error,
    this.currentQuestionIndex = 0,
    this.databaseMatch,
    this.similarProducts = const [],
  });

  LinkQuizState copyWith({
    LinkFlowPhase? phase,
    LinkAnalysisResult? baseResult,
    ProductQuiz? quiz,
    List<QuizQuestion>? answeredQuestions,
    EnhancedAnalysisResult? enhancedResult,
    String? error,
    int? currentQuestionIndex,
    ProductEntity? databaseMatch,
    List<ProductEntity>? similarProducts,
  }) {
    return LinkQuizState(
      phase: phase ?? this.phase,
      baseResult: baseResult ?? this.baseResult,
      quiz: quiz ?? this.quiz,
      answeredQuestions: answeredQuestions ?? this.answeredQuestions,
      enhancedResult: enhancedResult ?? this.enhancedResult,
      error: error,
      currentQuestionIndex:
          currentQuestionIndex ?? this.currentQuestionIndex,
      databaseMatch: databaseMatch ?? this.databaseMatch,
      similarProducts: similarProducts ?? this.similarProducts,
    );
  }
}

class LinkQuizNotifier extends StateNotifier<LinkQuizState> {
  final AIRepository _aiRepo;
  final GeminiService _gemini;
  final SubscriptionService _subscriptionService;
  final BehaviorTrackingService _behaviorTracking;
  final Ref _ref;

  LinkQuizNotifier({
    required AIRepository aiRepo,
    required GeminiService gemini,
    required SubscriptionService subscriptionService,
    required BehaviorTrackingService behaviorTracking,
    required Ref ref,
  })  : _aiRepo = aiRepo,
        _gemini = gemini,
        _subscriptionService = subscriptionService,
        _behaviorTracking = behaviorTracking,
        _ref = ref,
        super(const LinkQuizState());

  String get _appLang => _ref.read(localeProvider)?.languageCode ?? 'en';

  /// Step 1: Analyze link + validate product + generate quiz.
  Future<void> analyzeAndStartQuiz(String url, UserEntity user) async {
    // Rate limit
    final limitResult = _subscriptionService.recordLinkPaste();
    if (limitResult.isFailure) {
      state = state.copyWith(
        phase: LinkFlowPhase.idle,
        error: 'Daily link analysis limit reached. Upgrade to Pro!',
      );
      return;
    }

    state = state.copyWith(phase: LinkFlowPhase.analyzing, error: null);

    // Analyze link
    final localizedUser = user.copyWith(language: _appLang);
    final result = await _aiRepo.analyzeLink(url: url, user: localizedUser);
    final LinkAnalysisResult? baseResult;
    switch (result) {
      case Success<LinkAnalysisResult>(data: final data):
        baseResult = data;
      case Failure<LinkAnalysisResult>(error: final error):
        state = state.copyWith(
          phase: LinkFlowPhase.idle,
          error: error.message,
        );
        baseResult = null;
    }
    if (baseResult == null) return;

    state = state.copyWith(
      phase: LinkFlowPhase.quizLoading,
      baseResult: baseResult,
    );

    // Generate quiz
    try {
      final quiz = await _gemini.generateQuiz(
        category: baseResult.category ?? 'general',
        productTitle: baseResult.metadata.title ?? 'Product',
        url: url,
        language: _appLang,
      );

      state = state.copyWith(
        phase: LinkFlowPhase.quiz,
        quiz: quiz,
        answeredQuestions: quiz.questions,
        currentQuestionIndex: 0,
      );
    } catch (e) {
      // If quiz generation fails, show base result directly
      state = state.copyWith(
        phase: LinkFlowPhase.result,
        enhancedResult: EnhancedAnalysisResult(
          baseResult: baseResult,
          enhancedScore: baseResult.aiScore,
          factors: const [],
          detailedVerdict: baseResult.aiAnalysis,
        ),
      );
    }
  }

  /// Step 2: Answer a quiz question.
  void answerQuestion(int questionIndex, String answer) {
    final updated = List<QuizQuestion>.from(state.answeredQuestions);
    updated[questionIndex] = updated[questionIndex].copyWith(
      selectedOption: answer,
    );

    final nextIndex = questionIndex + 1;
    state = state.copyWith(
      answeredQuestions: updated,
      currentQuestionIndex:
          nextIndex < updated.length ? nextIndex : questionIndex,
    );
  }

  /// Step 3: Submit quiz answers and compute enhanced analysis.
  Future<void> submitQuiz(UserEntity user) async {
    if (state.baseResult == null) return;
    state = state.copyWith(phase: LinkFlowPhase.computing);

    try {
      final enhanced = await _gemini.enhancedAnalysis(
        baseResult: state.baseResult!,
        answeredQuestions: state.answeredQuestions,
        profile: user.copyWith(language: _appLang),
      );

      // Persist quiz answers for algorithm training
      if (state.baseResult != null) {
        _behaviorTracking.trackQuizAnswers(
          url: state.baseResult!.url,
          category: state.baseResult!.category,
          answeredQuestions: state.answeredQuestions
              .map((q) => {
                    'question': q.text,
                    'selectedOption': q.selectedOption,
                    'options': q.options,
                  })
              .toList(),
          matchScore: enhanced.enhancedScore,
        );
      }

      state = state.copyWith(
        phase: LinkFlowPhase.result,
        enhancedResult: enhanced,
      );
    } catch (e) {
      // Fallback to base result (guard against null)
      final base = state.baseResult;
      if (base != null) {
        state = state.copyWith(
          phase: LinkFlowPhase.result,
          enhancedResult: EnhancedAnalysisResult(
            baseResult: base,
            enhancedScore: base.aiScore,
            factors: const [],
            detailedVerdict: base.aiAnalysis,
          ),
        );
      } else {
        state = state.copyWith(
          phase: LinkFlowPhase.idle,
          error: 'Analysis failed. Please try again.',
        );
      }
    }
  }

  /// Skip the quiz and show base result.
  void skipQuiz() {
    if (state.baseResult == null) return;
    state = state.copyWith(
      phase: LinkFlowPhase.result,
      enhancedResult: EnhancedAnalysisResult(
        baseResult: state.baseResult!,
        enhancedScore: state.baseResult!.aiScore,
        factors: const [],
        detailedVerdict: state.baseResult!.aiAnalysis,
      ),
    );
  }

  /// Search Compair product database for similar/matching products.
  void searchDatabase(List<ProductEntity> allProducts) {
    if (state.baseResult == null) return;
    final title = (state.baseResult!.metadata.title ?? '').toLowerCase();
    final category = (state.baseResult!.category ?? '').toLowerCase();
    if (title.isEmpty) return;

    final titleWords = title
        .replaceAll(RegExp(r'[^\w\s]'), '')
        .split(RegExp(r'\s+'))
        .where((w) => w.length > 2)
        .toList();

    ProductEntity? bestMatch;
    double bestScore = 0;
    final similar = <ProductEntity>[];

    for (final product in allProducts) {
      final pName = product.name.toLowerCase();
      int matchCount = 0;
      for (final word in titleWords) {
        if (pName.contains(word)) matchCount++;
      }
      final matchRatio =
          titleWords.isNotEmpty ? matchCount / titleWords.length : 0.0;

      if (matchRatio >= 0.6) {
        if (matchRatio > bestScore) {
          bestScore = matchRatio;
          bestMatch = product;
        }
      } else if (category.isNotEmpty &&
          product.category.toLowerCase() == category &&
          similar.length < 6) {
        similar.add(product);
      }
    }

    state = state.copyWith(
      databaseMatch: bestMatch,
      similarProducts: similar,
    );
  }

  void reset() {
    state = const LinkQuizState();
  }
}

final linkQuizProvider =
    StateNotifierProvider<LinkQuizNotifier, LinkQuizState>((ref) {
  return LinkQuizNotifier(
    aiRepo: ref.read(aiRepositoryProvider),
    gemini: ref.read(geminiServiceProvider),
    subscriptionService: ref.read(subscriptionServiceProvider),
    behaviorTracking: ref.read(behaviorTrackingProvider),
    ref: ref,
  );
});

// ─── Subscription Intelligence Provider ────────────────────────────────────

enum SubFlowPhase { idle, quizLoading, quiz, analyzing, result }

class SubQuizState {
  final SubFlowPhase phase;
  final List<String> subscriptionNames;
  final ProductQuiz? quiz;
  final List<QuizQuestion> answeredQuestions;
  final int currentQuestionIndex;
  final String? analysisResult;
  final Map<String, double> scores;
  final Map<String, dynamic>? structured;
  final String? error;

  const SubQuizState({
    this.phase = SubFlowPhase.idle,
    this.subscriptionNames = const [],
    this.quiz,
    this.answeredQuestions = const [],
    this.currentQuestionIndex = 0,
    this.analysisResult,
    this.scores = const {},
    this.structured,
    this.error,
  });

  SubQuizState copyWith({
    SubFlowPhase? phase,
    List<String>? subscriptionNames,
    ProductQuiz? quiz,
    List<QuizQuestion>? answeredQuestions,
    int? currentQuestionIndex,
    String? analysisResult,
    Map<String, double>? scores,
    Map<String, dynamic>? structured,
    String? error,
  }) => SubQuizState(
    phase: phase ?? this.phase,
    subscriptionNames: subscriptionNames ?? this.subscriptionNames,
    quiz: quiz ?? this.quiz,
    answeredQuestions: answeredQuestions ?? this.answeredQuestions,
    currentQuestionIndex: currentQuestionIndex ?? this.currentQuestionIndex,
    analysisResult: analysisResult ?? this.analysisResult,
    scores: scores ?? this.scores,
    structured: structured ?? this.structured,
    error: error,
  );
}

class SubQuizNotifier extends StateNotifier<SubQuizState> {
  final GeminiService _gemini;
  final SubscriptionService _subService;
  final Ref _ref;

  SubQuizNotifier({
    required GeminiService gemini,
    required SubscriptionService subService,
    required Ref ref,
  })  : _gemini = gemini,
        _subService = subService,
        _ref = ref,
        super(const SubQuizState());

  String get _appLang => _ref.read(localeProvider)?.languageCode ?? 'en';

  void reset() => state = const SubQuizState();

  /// Step 1: Generate AI quiz based on subscription names.
  Future<void> startQuiz(List<String> names) async {
    if (!_subService.canAskAI) {
      state = state.copyWith(
        phase: SubFlowPhase.idle,
        error: 'Daily AI limit reached. Upgrade to Pro!',
      );
      return;
    }

    state = SubQuizState(
      phase: SubFlowPhase.quizLoading,
      subscriptionNames: names,
    );

    try {
      final quiz = await _gemini.generateSubscriptionQuiz(
        subscriptionNames: names,
        language: _appLang,
      ).timeout(const Duration(seconds: 25));

      if (quiz.questions.isEmpty) throw Exception('No questions generated');

      state = state.copyWith(
        phase: SubFlowPhase.quiz,
        quiz: quiz,
        answeredQuestions: quiz.questions,
        currentQuestionIndex: 0,
      );
    } catch (_) {
      // Fallback: skip quiz, go straight to analysis
      _subService.recordAIQuestion();
      state = state.copyWith(phase: SubFlowPhase.analyzing);
      await _runAnalysis(names, []);
    }
  }

  /// Step 2: Answer a quiz question.
  void answerQuestion(int index, String answer) {
    final updated = List<QuizQuestion>.from(state.answeredQuestions);
    updated[index] = updated[index].copyWith(selectedOption: answer);
    final next = index + 1;
    state = state.copyWith(
      answeredQuestions: updated,
      currentQuestionIndex: next < updated.length ? next : index,
    );
  }

  /// Step 3: Submit quiz + run enhanced grounded analysis.
  Future<void> submitQuiz() async {
    _subService.recordAIQuestion();
    state = state.copyWith(phase: SubFlowPhase.analyzing);
    await _runAnalysis(state.subscriptionNames, state.answeredQuestions);
  }

  /// Skip quiz → analyze with no quiz context.
  Future<void> skipQuiz() async {
    _subService.recordAIQuestion();
    state = state.copyWith(phase: SubFlowPhase.analyzing);
    await _runAnalysis(state.subscriptionNames, []);
  }

  Future<void> _runAnalysis(
      List<String> names, List<QuizQuestion> answered) async {
    try {
      final user = _ref.read(userProfileProvider).valueOrNull;
      // Create a minimal profile if user is not loaded yet
      final profile = user ?? UserEntity(
        uid: 'anonymous',
        email: '',
        displayName: 'User',
        country: 'TR',
        language: _appLang,
        currency: 'TRY',
        priorities: const [],
        subscriptions: const [],
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      final result = await _gemini.enhancedSubscriptionAnalysis(
        subscriptionNames: names,
        answeredQuestions: answered,
        profile: profile.copyWith(language: _appLang),
      ).timeout(const Duration(seconds: 90));

      state = state.copyWith(
        phase: SubFlowPhase.result,
        analysisResult: result['analysis'] as String? ?? '',
        scores: Map<String, double>.from(result['scores'] as Map? ?? {}),
        structured: result['structured'] as Map<String, dynamic>?,
      );
    } catch (e) {
      debugPrint('=== COMPAIR: Sub analysis error: $e ===');
      final errMsg = e.toString().contains('timeout')
          ? 'Analysis timed out. Check your connection.'
          : 'Analysis failed: ${e.toString().replaceAll('Exception: ', '')}';
      state = state.copyWith(
        phase: SubFlowPhase.idle,
        error: errMsg,
      );
    }
  }
}

final subQuizProvider =
    StateNotifierProvider<SubQuizNotifier, SubQuizState>((ref) {
  return SubQuizNotifier(
    gemini: ref.read(geminiServiceProvider),
    subService: ref.read(subscriptionServiceProvider),
    ref: ref,
  );
});

// ════════════════════════════════════════════════════
// ─── PROVIDER ALIASES ─── (Screen compatibility)
// ════════════════════════════════════════════════════

/// Screens use userProfileProvider
final userProfileProvider = userProfileStreamProvider;

/// Screens use themeModeProvider
// (themeProvider removed)

/// Screens use comparisonNotifierProvider
final comparisonNotifierProvider = comparisonStateProvider;

/// Subscription services from Firestore (public read)
final subscriptionsProvider = FutureProvider<List<SubscriptionServiceModel>>((ref) async {
  final snapshot = await FirebaseFirestore.instance
      .collection('subscription_services')
      .where('isActive', isEqualTo: true)
      .get()
      .timeout(const Duration(seconds: 15));
  return snapshot.docs.map((doc) => SubscriptionServiceModel.fromFirestore(doc)).toList();
});

/// Session-level compare screen state — survives tab switches and navigation
class CompareSessionData {
  final List<String> selectedProductIds;
  final List<ProductEntity>? comparedProducts;
  final String? lockedCategory;
  final String? lockedSubcategory;
  // AI Analysis results - persist across navigation
  final String? aiAnalysis;
  final Map<String, dynamic>? aiStructured;
  final String? deepAnalysisResult;
  final String? alternativesResult;
  final String? advisorResult;
  final String? predictionResult;

  const CompareSessionData({
    this.selectedProductIds = const [],
    this.comparedProducts,
    this.lockedCategory,
    this.lockedSubcategory,
    this.aiAnalysis,
    this.aiStructured,
    this.deepAnalysisResult,
    this.alternativesResult,
    this.advisorResult,
    this.predictionResult,
  });

  CompareSessionData copyWith({
    List<String>? selectedProductIds,
    List<ProductEntity>? comparedProducts,
    String? lockedCategory,
    String? lockedSubcategory,
    String? aiAnalysis,
    Map<String, dynamic>? aiStructured,
    String? deepAnalysisResult,
    String? alternativesResult,
    String? advisorResult,
    String? predictionResult,
    bool clearProducts = false,
    bool clearAiAnalysis = false,
  }) {
    return CompareSessionData(
      selectedProductIds: selectedProductIds ?? this.selectedProductIds,
      comparedProducts: clearProducts ? null : (comparedProducts ?? this.comparedProducts),
      lockedCategory: lockedCategory ?? this.lockedCategory,
      lockedSubcategory: lockedSubcategory ?? this.lockedSubcategory,
      aiAnalysis: clearAiAnalysis ? null : (aiAnalysis ?? this.aiAnalysis),
      aiStructured: clearAiAnalysis ? null : (aiStructured ?? this.aiStructured),
      deepAnalysisResult: clearAiAnalysis ? null : (deepAnalysisResult ?? this.deepAnalysisResult),
      alternativesResult: clearAiAnalysis ? null : (alternativesResult ?? this.alternativesResult),
      advisorResult: clearAiAnalysis ? null : (advisorResult ?? this.advisorResult),
      predictionResult: clearAiAnalysis ? null : (predictionResult ?? this.predictionResult),
    );
  }

  bool get hasAiResults => aiAnalysis != null || aiStructured != null;
}

final compareSessionProvider = StateProvider<CompareSessionData>((ref) {
  return const CompareSessionData();
});

// ════════════════════════════════════════════════════
// ─── PC BUILDER SESSION STATE ───
// ════════════════════════════════════════════════════

/// Persists PC Builder selections across tab switches.
/// Keys are PcComponent.name strings, values are ProductEntity.
final pcBuilderSessionProvider = StateProvider<Map<String, ProductEntity>>((ref) {
  return {};
});

/// Persists PC Builder AI analysis across tab switches.
final pcBuilderAiProvider = StateProvider<String?>((ref) => null);

/// Screens use linkAnalysisNotifierProvider
final linkAnalysisNotifierProvider = linkAnalysisProvider;

// ════════════════════════════════════════════════════
// ─── DEEP ANALYSIS CACHE ───
// ════════════════════════════════════════════════════

/// Caches AI deep analysis results per product ID so they survive navigation.
/// The analysis runs in the provider (not the widget), so switching tabs won't cancel it.
final deepAnalysisCacheProvider = StateNotifierProvider.family<
    _DeepAnalysisNotifier, AsyncValue<String?>, String>((ref, productId) {
  return _DeepAnalysisNotifier(ref, productId);
});

class _DeepAnalysisNotifier extends StateNotifier<AsyncValue<String?>> {
  final Ref _ref;
  final String _productId;

  _DeepAnalysisNotifier(this._ref, this._productId) : super(const AsyncValue.data(null));

  Future<void> startAnalysis(String productName, String language) async {
    if (state is AsyncLoading) return; // Already running
    if (state.valueOrNull != null) return; // Already completed
    state = const AsyncValue.loading();
    try {
      final gemini = _ref.read(geminiServiceProvider);
      final result = await gemini.freeTextQuery(
        'You are a senior tech product analyst. Provide a deep, comprehensive analysis of "$productName" covering:\n'
        '1. Build quality & design philosophy\n'
        '2. Performance in real-world scenarios\n'
        '3. Value proposition vs competitors\n'
        '4. Hidden strengths most reviewers miss\n'
        '5. Potential deal-breakers\n'
        '6. Best use case scenarios\n'
        '7. Long-term reliability prediction\n'
        'Keep it concise but insightful (max 250 words). Use plain text, no markdown.',
        language: language,
      );
      state = AsyncValue.data(result.isNotEmpty ? result : 'Unable to generate analysis at this time.');
    } catch (e) {
      state = AsyncValue.data('Unable to generate analysis at this time. Please try again later.');
    }
  }

  void reset() {
    state = const AsyncValue.data(null);
  }
}

// ════════════════════════════════════════════════════
// ─── PREMIUM AI CACHE PROVIDERS ───
// ════════════════════════════════════════════════════

/// Alternatives cache — survives tab switches
final alternativesCacheProvider = StateNotifierProvider.family<
    _AlternativesCacheNotifier, AsyncValue<String?>, String>((ref, productId) {
  return _AlternativesCacheNotifier(ref, productId);
});

class _AlternativesCacheNotifier extends StateNotifier<AsyncValue<String?>> {
  final Ref _ref;
  final String _productId;
  _AlternativesCacheNotifier(this._ref, this._productId) : super(const AsyncValue.data(null));

  Future<void> startQuery(String productName, String category, String language) async {
    if (state is AsyncLoading) return;
    if (state.valueOrNull != null) return;
    state = const AsyncValue.loading();
    try {
      final gemini = _ref.read(geminiServiceProvider);
      final cat = category.isEmpty ? 'tech product' : category;
      final result = await gemini.freeTextQuery(
        'For someone considering "$productName" ($cat), suggest 5 smart alternative products.\n'
        'For EACH alternative provide exactly this format:\n'
        '**[Product Name]**\n'
        '✅ Advantage: [One clear advantage over $productName]\n'
        '⚠️ Trade-off: [One disadvantage or compromise]\n'
        '💰 Price: [cheaper/similar/pricier] - [brief price context]\n'
        '🎯 Best for: [Target user in 5 words max]\n\n'
        'Be specific with real products. Max 350 words.',
        language: language,
      );
      state = AsyncValue.data(result.isNotEmpty ? result : 'Unable to find alternatives at this time.');
    } catch (e) {
      state = AsyncValue.data('Unable to find alternatives at this time. Please try again.');
    }
  }

  void reset() => state = const AsyncValue.data(null);
}

/// AI Advisor cache — survives tab switches
final advisorCacheProvider = StateNotifierProvider.family<
    _AdvisorCacheNotifier, AsyncValue<String?>, String>((ref, productId) {
  return _AdvisorCacheNotifier(ref, productId);
});

class _AdvisorCacheNotifier extends StateNotifier<AsyncValue<String?>> {
  final Ref _ref;
  final String _productId;
  _AdvisorCacheNotifier(this._ref, this._productId) : super(const AsyncValue.data(null));

  Future<void> startQuery(String productName, String category, String price, String language) async {
    if (state is AsyncLoading) return;
    if (state.valueOrNull != null) return;
    state = const AsyncValue.loading();
    try {
      final gemini = _ref.read(geminiServiceProvider);
      final cat = category.isEmpty ? 'tech product' : category;
      final result = await gemini.freeTextQuery(
        'As an expert tech advisor, analyze "$productName" ($cat, $price) for a potential buyer.\n\n'
        'Provide:\n'
        '**🎯 Who Should Buy This**\n'
        'Describe the ideal buyer in 2 sentences.\n\n'
        '**✅ Top 3 Reasons to Buy**\n'
        'List 3 compelling reasons.\n\n'
        '**⚠️ Top 3 Reasons to Skip**\n'
        'List 3 honest concerns.\n\n'
        '**💡 Pro Tips**\n'
        '2 insider tips for getting the best value.\n\n'
        '**📊 Value Rating: X/10**\n'
        'Overall value assessment in 1 sentence.\n\n'
        'Be specific and honest. Max 400 words.',
        language: language,
      );
      state = AsyncValue.data(result.isNotEmpty ? result : 'Unable to generate advice.');
    } catch (e) {
      state = AsyncValue.data('Unable to generate advice. Please try again.');
    }
  }

  void reset() => state = const AsyncValue.data(null);
}

/// Price Prediction cache — survives tab switches
final predictionCacheProvider = StateNotifierProvider.family<
    _PredictionCacheNotifier, AsyncValue<String?>, String>((ref, productId) {
  return _PredictionCacheNotifier(ref, productId);
});

class _PredictionCacheNotifier extends StateNotifier<AsyncValue<String?>> {
  final Ref _ref;
  final String _productId;
  _PredictionCacheNotifier(this._ref, this._productId) : super(const AsyncValue.data(null));

  Future<void> startQuery(String productName, String category, String price, String language) async {
    if (state is AsyncLoading) return;
    if (state.valueOrNull != null) return;
    state = const AsyncValue.loading();
    try {
      final gemini = _ref.read(geminiServiceProvider);
      final cat = category.isEmpty ? 'tech product' : category;
      final result = await gemini.freeTextQuery(
        'Analyze the price trends for "$productName" ($cat, current price: $price).\n\n'
        'Provide:\n'
        '**📉 Price Trend**\n'
        'Is the price likely to go up, down, or stay stable in the next 1-3 months? Why?\n\n'
        '**🕐 Best Time to Buy**\n'
        'When is the best time to purchase this product?\n\n'
        '**💰 Expected Price Drop**\n'
        'Estimate the potential savings if waiting (percentage and approximate amount).\n\n'
        '**⚡ Buy Now or Wait?**\n'
        'Clear recommendation with reasoning.\n\n'
        'Base analysis on typical tech product lifecycle and market patterns. Max 300 words.',
        language: language,
      );
      state = AsyncValue.data(result.isNotEmpty ? result : 'Unable to predict prices.');
    } catch (e) {
      state = AsyncValue.data('Unable to predict prices. Please try again.');
    }
  }

  void reset() => state = const AsyncValue.data(null);
}

// ════════════════════════════════════════════════════
// ─── COLLECTION / OWNED PRODUCTS ───
// ════════════════════════════════════════════════════

/// Add product to collection
Future<Result<void>> addToCollection(WidgetRef ref, String productId) async {
  final userAsync = ref.read(userProfileProvider);
  final user = userAsync.valueOrNull;
  if (user == null) {
    return const Failure(AuthException(message: 'You need to be signed in'));
  }
  try {
    await ref.read(firebaseDataSourceProvider).addToUserOwnedProducts(
          userId: user.uid,
          productId: productId,
        );
    return const Success(null);
  } catch (e) {
    return Failure(FirestoreException(message: 'Could not add to collection: $e'));
  }
}

/// Save a link analysis result to Firestore
Future<Result<void>> saveLinkAnalysis(
  WidgetRef ref, {
  required String url,
  required String productName,
  required double score,
  required String analysis,
  String? imageUrl,
  String? category,
}) async {
  final userAsync = ref.read(userProfileProvider);
  final user = userAsync.valueOrNull;
  if (user == null) {
    return const Failure(AuthException(message: 'You need to be signed in'));
  }
  try {
    await ref.read(firebaseDataSourceProvider).saveLinkAnalysis(
          userId: user.uid,
          url: url,
          productName: productName,
          score: score,
          analysis: analysis,
          imageUrl: imageUrl,
          category: category,
        );
    return const Success(null);
  } catch (e) {
    return Failure(
        FirestoreException(message: 'Could not save analysis: $e'));
  }
}

// ════════════════════════════════════════════════════
// ─── SEARCH PROVIDERS ─── Section 10
// ════════════════════════════════════════════════════

/// Son aramalar (local state)
final recentSearchesProvider = StateProvider<List<String>>((ref) => []);

/// Search results (FutureProvider) - Section 10
final searchResultsProvider =
    FutureProvider.family<Result<List<ProductEntity>>, String>((ref, query) async {
  // Ignore the warm-up sentinel
  if (query == '___warm___') {
    return ref.read(productRepositoryProvider).searchProducts(query: '');
  }
  if (query.isEmpty) {
    // Show personalized products from homeFeed cache
    final feedAsync = ref.read(homeFeedProvider);
    final cached = feedAsync.valueOrNull;
    if (cached != null && cached.all.isNotEmpty) {
      // Personalize order using user profile
      final user = ref.read(userProfileProvider).valueOrNull;
      final products = cached.all.toList();

      if (user != null) {
        // Score each product by user affinity
        final userCategories = {
          if (user.primaryCategory != null) user.primaryCategory!.toLowerCase(): 20,
          for (final cat in user.interestCategories ?? <String>[])
            cat.toLowerCase(): 10,
        };
        final userEco = user.ecosystem.toLowerCase();

        products.sort((a, b) {
          double scoreA = a.trendScore * 0.3;
          double scoreB = b.trendScore * 0.3;

          // Boost user's preferred categories
          scoreA += userCategories[a.category.toLowerCase()] ?? 0;
          scoreB += userCategories[b.category.toLowerCase()] ?? 0;

          // Ecosystem boost
          final aEco = (a.specs['Platform']?.toLowerCase() ?? a.specs['OS']?.toLowerCase() ?? '');
          final bEco = (b.specs['Platform']?.toLowerCase() ?? b.specs['OS']?.toLowerCase() ?? '');
          if (userEco == 'apple' && aEco.contains('ios')) scoreA += 8;
          if (userEco == 'apple' && bEco.contains('ios')) scoreB += 8;
          if (userEco == 'android' && aEco.contains('android')) scoreA += 8;
          if (userEco == 'android' && bEco.contains('android')) scoreB += 8;

          // Deterministic per-user shuffle using uid hash to avoid always same order
          final seed = user.uid.hashCode;
          scoreA += (a.id.hashCode ^ seed) % 15 / 15.0 * 5;
          scoreB += (b.id.hashCode ^ seed) % 15 / 15.0 * 5;

          return scoreB.compareTo(scoreA);
        });
      }

      return Success(products.take(500).toList());
    }
    return ref.read(productRepositoryProvider).getProducts(limit: 200);
  }

  // INSTANT LOCAL SEARCH: search homeFeed cache first (< 5ms)
  final normalizedQuery = query.toLowerCase().trim();
  final queryWords = normalizedQuery.split(RegExp(r'\s+'));
  List<ProductEntity> localResults = [];

  final feedAsync = ref.read(homeFeedProvider);
  final cached = feedAsync.valueOrNull;
  if (cached != null && cached.all.isNotEmpty) {
    localResults = cached.all.where((p) {
      final name = p.name.toLowerCase();
      final brand = (p.brand ?? '').toLowerCase();
      final category = p.category.toLowerCase();
      final searchable = '$name $brand $category';
      // All query words must match
      return queryWords.every((w) => searchable.contains(w));
    }).toList();

    // Score local results by relevance
    localResults.sort((a, b) {
      int scoreA = 0, scoreB = 0;
      final nameA = a.name.toLowerCase();
      final nameB = b.name.toLowerCase();
      // Exact name match bonus
      if (nameA.contains(normalizedQuery)) scoreA += 100;
      if (nameB.contains(normalizedQuery)) scoreB += 100;
      // Brand match bonus
      if ((a.brand ?? '').toLowerCase().contains(normalizedQuery)) scoreA += 50;
      if ((b.brand ?? '').toLowerCase().contains(normalizedQuery)) scoreB += 50;
      // TrendScore tiebreaker
      scoreA += (a.trendScore * 10).toInt();
      scoreB += (b.trendScore * 10).toInt();
      return scoreB.compareTo(scoreA);
    });
  }

  // If local results are sufficient (>= 10), return immediately
  // and let Cloud Function results be merged on next query change
  if (localResults.length >= 10) {
    // Still fire Cloud Function in background for next time
    ref.read(productRepositoryProvider).searchProducts(query: query, limit: 100);
    AnalyticsService.instance.logProductSearch(query, localResults.length);
    return Success(localResults.take(100).toList());
  }

  // Cloud Function search (for queries not in local cache)
  try {
    final cloudResult = await ref.read(productRepositoryProvider)
        .searchProducts(query: query, limit: 100)
        .timeout(const Duration(seconds: 8));
    // Merge: local results first, then cloud results (deduplicated)
    if (localResults.isNotEmpty) {
      final seenIds = localResults.map((p) => p.id).toSet();
      final cloudProducts = cloudResult.when(
        success: (products) => products.where((p) => !seenIds.contains(p.id)).toList(),
        failure: (_) => <ProductEntity>[],
      );
      return Success([...localResults, ...cloudProducts].take(100).toList());
    }
    return cloudResult;
  } catch (_) {
    // Timeout — return local results if any
    if (localResults.isNotEmpty) return Success(localResults.take(100).toList());
    return const Success(<ProductEntity>[]);
  }
});

// ════════════════════════════════════════════════════
// ─── HOME FEED PROVIDER (single query) ─── Section 6
// ════════════════════════════════════════════════════

/// Master home feed — ONE Firestore query powers all home screen sections.
/// Fetches top 300 products by trendScore DESC, then distributes locally.
/// This replaces 20+ individual queries with a single round-trip.
class HomeFeed {
  final List<ProductEntity> trending;
  final List<ProductEntity> featured;
  final Map<String, List<ProductEntity>> byCategory;
  final List<ProductEntity> newArrivals;
  final List<ProductEntity> discover;
  final List<ProductEntity> all;
  /// Categories ordered by user interest (strongest first)
  final List<String> priorityCategories;

  const HomeFeed({
    required this.trending,
    required this.featured,
    required this.byCategory,
    required this.newArrivals,
    this.discover = const [],
    required this.all,
    this.priorityCategories = const [],
  });
}

HomeFeed _buildHomeFeed(List<ProductEntity> products, String country,
    {UserEntity? user, List<String> hiddenIds = const [], List<String> disabledCats = const []}) {
  final deduped = deduplicateVariants(products);
  final currentYear = DateTime.now().year;

  // ── Helper: extract release year from specs (STRICT) ───────────────────
  int? getExactReleaseYear(ProductEntity p) {
    for (final key in ['release year', 'Release Year', 'release_year',
                       'Release Date', 'Piyasaya Çıkış Tarihi', 'Yıl', 'yıl', 'year',
                       'Çıkış Tarihi', 'Piyasaya Sürülme', 'release date']) {
      final val = p.specs[key];
      if (val != null) {
        final digits = val.toString().replaceAll(RegExp(r'[^0-9]'), '');
        if (digits.length >= 4) {
          final year = int.tryParse(digits.substring(0, 4));
          if (year != null && year > 2000 && year <= currentYear + 1) return year;
        }
      }
    }
    // Also try keySpecs
    for (final key in ['Çıkış Tarihi', 'Release Date', 'Yıl', 'year']) {
      final val = p.keySpecs[key];
      if (val != null) {
        final digits = val.replaceAll(RegExp(r'[^0-9]'), '');
        if (digits.length >= 4) {
          final year = int.tryParse(digits.substring(0, 4));
          if (year != null && year > 2000 && year <= currentYear + 1) return year;
        }
      }
    }
    return null; // No reliable year found
  }

  // Relaxed year: either exact or estimated (for scoring only, NOT filtering)
  int estimateYear(ProductEntity p) {
    final exact = getExactReleaseYear(p);
    if (exact != null) return exact;
    // For products WITHOUT a known release year, use name/model heuristics
    final name = p.name.toLowerCase();
    // Try to extract 4-digit year from product name
    final nameYearMatch = RegExp(r'20(1[5-9]|2[0-9])').firstMatch(name);
    if (nameYearMatch != null) {
      final y = int.tryParse(nameYearMatch.group(0)!);
      if (y != null && y > 2000 && y <= currentYear + 1) return y;
    }
    // Conservative estimate for unknowns
    final ts = p.techScore;
    if (ts >= 60) return currentYear - 1;
    if (ts >= 40) return currentYear - 3;
    if (ts >= 20) return currentYear - 5;
    return currentYear - 8;
  }

  // ── Defunct brands ─────────────────────────────────────────────────────────
  const defunctBrands = {
    'alcatel', 'micromax', 'karbonn', 'lava', 'intex', 'xolo',
    'coolpad', 'leeco', 'le eco', 'gionee', 'panasonic mobile',
    'blackberry', 'htc', 'zte', 'wiko', 'meizu', 'sharp mobile',
    'vernee', 'doogee', 'oukitel', 'umidigi', 'ulefone', 'cubot',
    'homtom', 'bluboo', 'elephone', 'leagoo', 'maze', 'nomu',
    'altus', 'vestel', 'casper', 'reeder', 'general mobile', 'turkcell',
    'grundig', 'beko', 'arçelik', 'hometech', 'vorcom', 'tcl mobile',
    'a4tech', '3plus', 'a4 tech', 'genius', 'trust', 'canyon',
    'defender', 'sven', 'oklick', 'qumo', 'dexp', 'digma',
    'prestigio', 'texet', 'explay', 'fly', 'irbis', 'ark',
    '360fly', 'jawbone', 'pebble', 'nexus', 'essential',
  };

  // ── Known old product name patterns ────────────────────────────────────────
  bool isKnownOldProduct(ProductEntity p) {
    final name = p.name.toLowerCase();
    // Products with very old model numbers or known discontinued products
    if (name.contains('360fly')) return true;
    if (name.contains('3plus') || name.contains('3 plus')) return true;
    if (RegExp(r'aspire\s*3\s*a315').hasMatch(name)) return true; // Old Acer Aspire 3
    if (name.contains('1more s1001')) return true; // Old 1MORE speaker
    return false;
  }

  // ── HARD FILTER: no defunct brands, no known old products, prefer modern ────
  final cutoffDate = DateTime(2018, 1, 1);
  final hiddenSet = hiddenIds.toSet();
  var pool = deduped.where((p) {
    if (hiddenSet.contains(p.id)) return false;
    final brand = (p.brand ?? '').toLowerCase().trim();
    if (defunctBrands.contains(brand)) return false;
    if (isKnownOldProduct(p)) return false;

    // Use createdAt if available
    if (p.createdAt != null && p.createdAt!.isBefore(cutoffDate)) {
      final exactYear = getExactReleaseYear(p);
      if (exactYear == null || exactYear < 2018) return false;
    }

    // If exact year is known, filter pre-2018
    final exactYear = getExactReleaseYear(p);
    if (exactYear != null) return exactYear >= 2018;

    // If no exact year and no createdAt, include if techScore is decent
    final ts = p.techScore;
    if (ts < 10) return false;
    return true;
  }).toList();

  debugPrint('=== COMPAIR: _buildHomeFeed pool: ${pool.length} products (from ${deduped.length} deduped, ${products.length} raw) ===');

  // ── Brand tier boost multiplier ────────────────────────────────────────────
  const tier1Brands = {
    'apple', 'samsung', 'sony', 'asus', 'msi', 'lg', 'dell', 'hp',
    'lenovo', 'acer', 'google', 'microsoft', 'nvidia', 'amd', 'intel',
  };
  const tier2Brands = {
    'xiaomi', 'huawei', 'oneplus', 'oppo', 'realme', 'honor', 'nothing',
    'razer', 'logitech', 'corsair', 'bose', 'sennheiser', 'jbl', 'marshall',
    'canon', 'nikon', 'fujifilm', 'dji', 'gopro', 'anker', 'garmin',
    'bang & olufsen', 'dyson', 'steelseries', 'hyperx', 'benq', 'viewsonic',
    'gigabyte', 'asrock', 'nzxt', 'cooler master', 'be quiet', 'crucial',
    'western digital', 'seagate', 'kingston', 'thermaltake', 'evga',
    'tp-link', 'netgear', 'arlo', 'ring', 'sonos', 'philips',
    'panasonic', 'tcl', 'hisense', 'vizio', 'roku', 'amazon',
  };
  double brandBoost(ProductEntity p) {
    final brand = (p.brand ?? '').toLowerCase().trim();
    if (tier1Brands.contains(brand)) return 1.15;
    if (tier2Brands.contains(brand)) return 1.08;
    return 0.90;
  }

  // ── USER PROFILE PERSONALIZATION BOOST ─────────────────────────────────────
  // Calculate behavior-based category & brand affinities from Hive viewed products
  final viewedCategoryScores = <String, double>{};
  final viewedBrandScores = <String, double>{};
  try {
    final box = Hive.box('user_data');
    final viewedRaw = box.get('viewed_products') as List<dynamic>? ?? [];
    for (var i = 0; i < viewedRaw.length; i++) {
      final item = viewedRaw[i];
      if (item is Map) {
        final cat = (item['category'] as String? ?? '').toLowerCase().trim();
        final brand = (item['brand'] as String? ?? '').toLowerCase().trim();
        // Recency weight: more recent views = stronger signal (exponential decay)
        final recencyWeight = 1.0 / (1 + i * 0.1);
        if (cat.isNotEmpty) {
          viewedCategoryScores[cat] = (viewedCategoryScores[cat] ?? 0) + recencyWeight;
        }
        if (brand.isNotEmpty) {
          viewedBrandScores[brand] = (viewedBrandScores[brand] ?? 0) + recencyWeight;
        }
      }
    }
  } catch (_) {}

  // Normalize scores to 0-1 range
  final maxCatScore = viewedCategoryScores.values.fold(1.0, (a, b) => a > b ? a : b);
  final maxBrandScore = viewedBrandScores.values.fold(1.0, (a, b) => a > b ? a : b);
  viewedCategoryScores.updateAll((k, v) => v / maxCatScore);
  viewedBrandScores.updateAll((k, v) => v / maxBrandScore);

  double userBoost(ProductEntity p) {
    if (user == null) return 1.0;
    double boost = 1.0;
    final cat = p.category.toLowerCase().trim();
    final brand = (p.brand ?? '').toLowerCase().trim();

    // ── BEHAVIOR-BASED BOOST (strongest signal) ──────────────────────────
    // Recently viewed categories get significant boost
    final viewedCatScore = viewedCategoryScores[cat] ?? 0.0;
    if (viewedCatScore > 0) {
      boost *= 1.0 + (viewedCatScore * 0.5); // Up to 1.5× for most viewed category
    }
    // Recently viewed brands get boost
    final viewedBrandScore = viewedBrandScores[brand] ?? 0.0;
    if (viewedBrandScore > 0) {
      boost *= 1.0 + (viewedBrandScore * 0.3); // Up to 1.3× for most viewed brand
    }

    // ── PROFILE-BASED BOOST ──────────────────────────────────────────────
    // Boost products in user's interest categories
    for (final interest in user.interestCategories) {
      if (cat == interest.toLowerCase() || cat.contains(interest.toLowerCase())) {
        boost *= 1.35;
        break;
      }
    }

    // Boost primary category
    if (user.primaryCategory != null &&
        cat == user.primaryCategory!.toLowerCase()) {
      boost *= 1.25;
    }

    // Ecosystem match (apple user → apple products boosted, android → android brands)
    if (user.ecosystem == 'apple' && brand == 'apple') boost *= 1.3;
    if (user.ecosystem == 'android' && {'samsung', 'xiaomi', 'oneplus', 'oppo',
        'realme', 'huawei', 'honor', 'nothing', 'google'}.contains(brand)) {
      boost *= 1.15;
    }

    // Budget match
    final price = p.getPriceForCountry(user.country) ?? 0;
    if (price > 0) {
      switch (user.budgetRange) {
        case 'low':
          if (price < 300) boost *= 1.2;
          else if (price > 1000) boost *= 0.7;
          break;
        case 'mid':
          if (price >= 200 && price <= 800) boost *= 1.15;
          break;
        case 'high':
          if (price >= 500 && price <= 2000) boost *= 1.15;
          break;
        case 'premium':
          if (price >= 800) boost *= 1.2;
          else if (price < 300) boost *= 0.7;
          break;
      }
    }

    // Profession-based category affinity
    final profCats = <String, List<String>>{
      'student': ['laptops', 'tablets', 'headphones', 'e-readers'],
      'engineer': ['laptops', 'monitors', 'keyboards', 'mice', 'gpus', 'cpus'],
      'designer': ['laptops', 'monitors', 'tablets', 'cameras', 'mice'],
      'gamer': ['gpus', 'monitors', 'keyboards', 'mice', 'headphones', 'gamepads', 'desktops'],
      'healthcare': ['tablets', 'smartwatches', 'smartphones'],
      'teacher': ['laptops', 'tablets', 'projectors', 'webcams'],
      'finance': ['laptops', 'monitors', 'smartphones'],
    };
    final pCats = profCats[user.profession] ?? [];
    if (pCats.contains(cat)) boost *= 1.15;

    // Profile vector match (if available)
    if (user.profileVector.isNotEmpty) {
      final catScore = user.profileVector[cat] ?? 0.0;
      if (catScore > 0.5) boost *= 1.0 + (catScore * 0.3);
    }

    return boost;
  }

  // ── YouTube-style composite score WITH user personalization ────────────────
  double youtubeScore(ProductEntity p) {
    final engagement = (p.trendScore / 10.0).clamp(0.0, 1.0);

    final year = estimateYear(p);
    final yearDiff = currentYear - year;
    double recency;
    if (yearDiff <= 0)      recency = 1.00;
    else if (yearDiff == 1) recency = 0.95;
    else if (yearDiff == 2) recency = 0.80;
    else if (yearDiff == 3) recency = 0.55;
    else if (yearDiff == 4) recency = 0.30;
    else if (yearDiff <= 6) recency = 0.15;
    else                    recency = 0.05;

    // Bonus for products with recent createdAt (freshly scraped = up-to-date)
    if (p.createdAt != null) {
      final daysSinceCreated = DateTime.now().difference(p.createdAt!).inDays;
      if (daysSinceCreated < 90) recency = (recency + 0.15).clamp(0.0, 1.0);
      else if (daysSinceCreated < 180) recency = (recency + 0.08).clamp(0.0, 1.0);
    }

    final quality = (p.techScore / 100.0).clamp(0.0, 1.0);

    return ((engagement * 0.30) + (recency * 0.30) + (quality * 0.25) + 0.15) *
        brandBoost(p) * userBoost(p);
  }

  // ── By category: scored, top 60 each with brand diversity ─────────────────
  final byCategory = <String, List<ProductEntity>>{};
  for (final p in pool) {
    final cat = p.category.toLowerCase().trim();
    if (cat.isNotEmpty) byCategory.putIfAbsent(cat, () => []).add(p);
  }

  debugPrint('=== COMPAIR: byCategory keys: ${byCategory.keys.join(",")} ===');
  for (final e in byCategory.entries) {
    debugPrint('=== COMPAIR:   ${e.key}: ${e.value.length} products ===');
  }

  // Remove admin-disabled categories
  if (disabledCats.isNotEmpty) {
    final disabledSet = disabledCats.map((c) => c.toLowerCase().trim()).toSet();
    byCategory.removeWhere((key, _) => disabledSet.contains(key));
  }

  // Sort by score and enforce brand diversity (max 3 per brand per category)
  for (final cat in byCategory.keys.toList()) {
    final all = byCategory[cat]!;
    all.sort((a, b) => youtubeScore(b).compareTo(youtubeScore(a)));

    final brandCount = <String, int>{};
    final diverse = <ProductEntity>[];
    for (final p in all) {
      final brand = (p.brand ?? '').toLowerCase().trim();
      final count = brandCount[brand] ?? 0;
      if (count < 3) {
        diverse.add(p);
        brandCount[brand] = count + 1;
      }
      if (diverse.length >= 60) break;
    }
    byCategory[cat] = diverse;
  }

  // ── TRENDING: YouTube-style top products (max 2 per brand, 3 per category) ─
  final allScored = pool
      .map((p) => (product: p, score: youtubeScore(p)))
      .toList()
    ..sort((a, b) => b.score.compareTo(a.score));

  final trendingCatCount = <String, int>{};
  final trendingBrandCount = <String, int>{};
  final trending = <ProductEntity>[];
  for (final s in allScored) {
    final cat = s.product.category.toLowerCase().trim();
    final brand = (s.product.brand ?? '').toLowerCase().trim();
    const nicheCategories = {'dashcams', 'gimbals', 'tripods', 'lenses', 'soundbars'};
    if (nicheCategories.contains(cat) && trending.length > 20) continue;
    final catCount = trendingCatCount[cat] ?? 0;
    final brandCnt = trendingBrandCount[brand] ?? 0;
    if (catCount < 3 && brandCnt < 2) {
      trending.add(s.product);
      trendingCatCount[cat] = catCount + 1;
      trendingBrandCount[brand] = brandCnt + 1;
    }
    if (trending.length >= 70) break;
  }

  // ── FEATURED: Best product per mainstream category (unique brands) ────────
  final featured = <ProductEntity>[];
  final seenBrands = <String>{};
  // Prioritize user's interest categories first
  final userInterests = user?.interestCategories
      .map((c) => c.toLowerCase().trim())
      .toList() ?? [];
  final featuredCategoriesBase = [
    'smartphones', 'laptops', 'tablets', 'headphones', 'smartwatches',
    'gpus', 'monitors', 'cameras', 'speakers', 'tvs',
  ];
  // Put user interest categories first
  final featuredCategories = <String>[
    ...userInterests.where((c) => byCategory.containsKey(c)),
    ...featuredCategoriesBase.where((c) => !userInterests.contains(c)),
  ];
  for (final cat in featuredCategories) {
    final catProducts = byCategory[cat] ?? [];
    for (final p in catProducts) {
      final brand = (p.brand ?? '').toLowerCase();
      if (p.imageURL.isNotEmpty && !seenBrands.contains(brand)) {
        featured.add(p);
        seenBrands.add(brand);
        break;
      }
    }
  }
  if (featured.length < 10) {
    for (final entry in byCategory.entries) {
      if (featuredCategories.contains(entry.key)) continue;
      for (final p in entry.value) {
        final brand = (p.brand ?? '').toLowerCase();
        if (p.imageURL.isNotEmpty && !seenBrands.contains(brand)) {
          featured.add(p);
          seenBrands.add(brand);
          break;
        }
      }
      if (featured.length >= 12) break;
    }
  }

  // ── NEW ARRIVALS: recent products with decent quality ─────────────────────
  // Prefer createdAt for genuinely new additions to the database
  final now = DateTime.now();
  var arrivalCandidates = allScored
      .where((s) {
        final p = s.product;
        // Truly new: added to DB in last 6 months
        if (p.createdAt != null && now.difference(p.createdAt!).inDays < 180) return true;
        // Fallback: estimated recent release with decent quality
        return estimateYear(p) >= currentYear - 1 && p.techScore >= 20;
      })
      .toList();
  if (arrivalCandidates.length < 10) {
    arrivalCandidates = allScored
        .where((s) => estimateYear(s.product) >= currentYear - 2)
        .take(200).toList();
  }
  // Sort by createdAt DESC, then by score
  arrivalCandidates.sort((a, b) {
    final aDate = a.product.createdAt ?? DateTime(2020);
    final bDate = b.product.createdAt ?? DateTime(2020);
    final dateComp = bDate.compareTo(aDate);
    if (dateComp != 0) return dateComp;
    return b.score.compareTo(a.score);
  });

  final arrivalsCatCount = <String, int>{};
  final arrivalsBrandCount = <String, int>{};
  final newArrivals = <ProductEntity>[];
  for (final s in arrivalCandidates) {
    final cat = s.product.category.toLowerCase().trim();
    final brand = (s.product.brand ?? '').toLowerCase().trim();
    final catCount = arrivalsCatCount[cat] ?? 0;
    final brandCnt = arrivalsBrandCount[brand] ?? 0;
    if (catCount < 5 && brandCnt < 2) {
      newArrivals.add(s.product);
      arrivalsCatCount[cat] = catCount + 1;
      arrivalsBrandCount[brand] = brandCnt + 1;
    }
    if (newArrivals.length >= 35) break;
  }

  // ── DISCOVER: High-quality hidden gems — products NOT in trending/featured ──
  final trendingIds = trending.map((p) => p.id).toSet();
  final featuredIds = featured.map((p) => p.id).toSet();
  final arrivalIds = newArrivals.map((p) => p.id).toSet();
  final shownIds = {...trendingIds, ...featuredIds, ...arrivalIds};

  final discoverCandidates = allScored
      .where((s) => !shownIds.contains(s.product.id)
                 && s.product.techScore >= 10)
      .toList();
  if (discoverCandidates.length < 10) {
    discoverCandidates.addAll(allScored
        .where((s) => !shownIds.contains(s.product.id)
                   && !discoverCandidates.any((d) => d.product.id == s.product.id))
        .toList());
  }
  // Shuffle for discovery feel with user-seed
  final userSeed = user?.uid.hashCode ?? DateTime.now().day;
  discoverCandidates.shuffle(Random(userSeed));
  final discoverBrandCount = <String, int>{};
  final discoverCatCount = <String, int>{};
  final discover = <ProductEntity>[];
  for (final s in discoverCandidates) {
    final cat = s.product.category.toLowerCase().trim();
    final brand = (s.product.brand ?? '').toLowerCase().trim();
    final bc = discoverBrandCount[brand] ?? 0;
    final cc = discoverCatCount[cat] ?? 0;
    if (bc < 1 && cc < 3) {
      discover.add(s.product);
      discoverBrandCount[brand] = bc + 1;
      discoverCatCount[cat] = cc + 1;
    }
    if (discover.length >= 30) break;
  }

  // Build priority category list based on behavior + profile
  final priorityCats = <String>[];
  // First: categories from behavior (most viewed first)
  final sortedViewedCats = viewedCategoryScores.entries.toList()
    ..sort((a, b) => b.value.compareTo(a.value));
  for (final e in sortedViewedCats) {
    if (byCategory.containsKey(e.key) && !priorityCats.contains(e.key)) {
      priorityCats.add(e.key);
    }
  }
  // Then: user's interest categories
  if (user != null) {
    for (final interest in user.interestCategories) {
      final cat = interest.toLowerCase().trim();
      if (byCategory.containsKey(cat) && !priorityCats.contains(cat)) {
        priorityCats.add(cat);
      }
    }
    // Primary category
    if (user.primaryCategory != null) {
      final primary = user.primaryCategory!.toLowerCase().trim();
      if (byCategory.containsKey(primary) && !priorityCats.contains(primary)) {
        priorityCats.insert(0, primary);
      }
    }
  }
  // Finally: remaining categories by product count
  for (final cat in byCategory.keys) {
    if (!priorityCats.contains(cat)) priorityCats.add(cat);
  }

  debugPrint('=== COMPAIR: homeFeed built — cats:${byCategory.keys.join(",")} '
             'newArrivals:${newArrivals.length} trending:${trending.length} discover:${discover.length} ===');

  return HomeFeed(
    trending: trending,
    featured: featured,
    byCategory: byCategory,
    newArrivals: newArrivals,
    discover: discover,
    all: pool,
    priorityCategories: priorityCats,
  );
}

// Known Firestore categories (ALL from scraper SOURCES config)
const _feedCategories = [
  'laptops', 'smartphones', 'tablets', 'headphones', 'smartwatches',
  'gpus', 'monitors', 'keyboards', 'mice', 'desktops', 'cameras',
  'speakers', 'tvs', 'consoles', 'routers', 'gamepads', 'webcams',
  'dashcams', 'media-players', 'cases', 'cpus', 'drones', 'robot-vacuums',
  'soundbars', 'microphones', 'smart-rings', 'e-readers', 'vr-headsets',
  'motherboards', 'ram', 'ssd', 'psu', 'coolers', 'printers',
  'projectors', 'gimbals', 'tripods', 'lenses',
];

/// In-memory feed cache for instant access across providers
HomeFeed? _inMemoryFeed;

/// Clear in-memory feed cache (called from pull-to-refresh)
void clearInMemoryFeedCache() {
  _inMemoryFeed = null;
}

/// Flag to prevent concurrent background refreshes
bool _isRefreshingFeed = false;

final homeFeedProvider = FutureProvider<HomeFeed>((ref) async {
  ref.watch(selectedCountryProvider);
  final country = ref.read(selectedCountryProvider);
  final repo = ref.read(productRepositoryProvider);
  final cache = ref.read(cacheServiceProvider);
  final user = ref.read(userProfileProvider).valueOrNull;
  debugPrint('=== COMPAIR: homeFeedProvider — start (user: ${user?.uid ?? "anon"}) ===');

  // 0. In-memory cache (instant, < 1ms) — survives tab switches
  if (_inMemoryFeed != null && _inMemoryFeed!.all.isNotEmpty) {
    debugPrint('=== COMPAIR: homeFeed from IN-MEMORY: ${_inMemoryFeed!.all.length} products ===');
    return _inMemoryFeed!;
  }

  // Cache key includes user UID for personalized feeds
  final cacheKey = 'home_feed_v23_${user?.uid ?? "anon"}';

  // Clear ALL old cache versions
  try {
    for (final ver in ['v17_modern', 'v18', 'v19', 'v20', 'v21', 'v22']) {
      final key = ver == 'v17_modern' ? 'home_feed_$ver' : 'home_feed_${ver}_${user?.uid ?? "anon"}';
      cache.delete(key);
    }
  } catch (_) {}

  // Read admin feed config from Firestore (non-blocking, use defaults if slow)
  List<String> pinnedIds = [];
  List<String> hiddenIds = [];
  List<String> disabledCats = [];
  try {
    final configDoc = await FirebaseFirestore.instance
        .collection('app_config').doc('algorithm').get()
        .timeout(const Duration(seconds: 5));
    if (configDoc.exists) {
      final data = configDoc.data() ?? {};
      pinnedIds = List<String>.from(data['pinnedProducts'] ?? []);
      hiddenIds = List<String>.from(data['hiddenProducts'] ?? []);
      disabledCats = List<String>.from(data['disabledCategories'] ?? []);
    }
  } catch (_) {}

  // 1. STALE-WHILE-REVALIDATE: Show cached data instantly, even if expired
  try {
    final staleResult = cache.getLocalStale<List<dynamic>>(cacheKey);
    if (staleResult.data != null && (staleResult.data as List).isNotEmpty) {
      final sw = Stopwatch()..start();
      final products = (staleResult.data as List)
          .map((item) => ProductModel.fromMap(Map<String, dynamic>.from(item as Map)))
          .cast<ProductEntity>()
          .toList();
      sw.stop();
      debugPrint('=== COMPAIR: homeFeed from HIVE cache (stale=${staleResult.isStale}): ${products.length} products in ${sw.elapsedMilliseconds}ms ===');

      ref.read(firebaseDataSourceProvider).setHomeFeedProducts(
          products.whereType<ProductModel>().toList());
      final feed = _buildHomeFeed(products, country, user: user,
          hiddenIds: hiddenIds, disabledCats: disabledCats);
      _inMemoryFeed = feed;

      // If stale, trigger background refresh (fire-and-forget)
      if (staleResult.isStale && !_isRefreshingFeed) {
        _isRefreshingFeed = true;
        _backgroundRefreshFeed(ref, repo, cache, country, user, cacheKey,
            pinnedIds, hiddenIds, disabledCats).whenComplete(() {
          _isRefreshingFeed = false;
        });
      }

      return feed;
    }
  } catch (e) {
    debugPrint('=== COMPAIR: Hive cache read error: $e ===');
  }

  // 2. No cache at all — fetch from network (first-time load)
  return _fetchFeedFromNetwork(ref, repo, cache, country, user, cacheKey,
      pinnedIds, hiddenIds, disabledCats);
});

/// Background refresh: fetch fresh data and update cache silently
Future<void> _backgroundRefreshFeed(
  Ref ref,
  ProductRepository repo,
  CacheService cache,
  String country,
  UserEntity? user,
  String cacheKey,
  List<String> pinnedIds,
  List<String> hiddenIds,
  List<String> disabledCats,
) async {
  debugPrint('=== COMPAIR: Background feed refresh started ===');
  try {
    final products = await _fetchAllProducts(repo, user, disabledCats, pinnedIds);
    if (products.isNotEmpty && products.length > (_inMemoryFeed?.all.length ?? 0) * 0.5) {
      _saveProductsToCache(cache, products, cacheKey);
      ref.read(firebaseDataSourceProvider).setHomeFeedProducts(
          products.whereType<ProductModel>().toList());
      _inMemoryFeed = _buildHomeFeed(products, country, user: user,
          hiddenIds: hiddenIds, disabledCats: disabledCats);
      debugPrint('=== COMPAIR: Background refresh done: ${products.length} products ===');
    }
  } catch (e) {
    debugPrint('=== COMPAIR: Background refresh error: $e ===');
  }
}

/// First-time network fetch with progressive loading
Future<HomeFeed> _fetchFeedFromNetwork(
  Ref ref,
  ProductRepository repo,
  CacheService cache,
  String country,
  UserEntity? user,
  String cacheKey,
  List<String> pinnedIds,
  List<String> hiddenIds,
  List<String> disabledCats,
) async {
  debugPrint('=== COMPAIR: homeFeed — first-time network fetch ===');

  final products = await _fetchAllProducts(repo, user, disabledCats, pinnedIds);

  if (products.isEmpty) {
    debugPrint('=== COMPAIR: homeFeed EMPTY — all queries returned 0 docs ===');
    return const HomeFeed(trending: [], featured: [], byCategory: {}, newArrivals: [], all: []);
  }

  _saveProductsToCache(cache, products, cacheKey);
  ref.read(firebaseDataSourceProvider).setHomeFeedProducts(
      products.whereType<ProductModel>().toList());
  final feed = _buildHomeFeed(products, country, user: user,
      hiddenIds: hiddenIds, disabledCats: disabledCats);
  _inMemoryFeed = feed;
  return feed;
}

/// Core product fetching: BULK-FIRST strategy (single query, fast cold start)
Future<List<ProductEntity>> _fetchAllProducts(
  ProductRepository repo,
  UserEntity? user,
  List<String> disabledCats,
  List<String> pinnedIds,
) async {
  final allProducts = <ProductEntity>[];
  final seenIds = <String>{};

  void addProducts(List<ProductEntity> products) {
    for (final p in products) {
      if (seenIds.add(p.id)) allProducts.add(p);
    }
  }

  final sw = Stopwatch()..start();

  // ── PHASE 1: Single bulk query (works even on Firestore cold start) ─────
  // This is the key: ONE query instead of 40+ category queries.
  // Firestore cold start takes 27-37s but that's one roundtrip only.
  // NO external timeout — the internal datasource has 90s for bulk queries.
  debugPrint('=== COMPAIR: BULK fetch — single query for all products ===');
  try {
    final bulkResult = await repo.getProducts(
      limit: 2000, orderBy: 'techScore', descending: true,
    );
    bulkResult.when(
      success: (products) {
        addProducts(products);
        debugPrint('=== COMPAIR: BULK got ${allProducts.length} products in ${sw.elapsedMilliseconds}ms ===');
      },
      failure: (e) => debugPrint('=== COMPAIR: BULK query failed: $e ==='),
    );
  } catch (e) {
    debugPrint('=== COMPAIR: BULK query exception: $e ===');
  }

  // ── PHASE 2: Gap-fill missing categories (only if bulk didn't cover them) ─
  if (allProducts.isNotEmpty) {
    final gotCats = <String>{};
    for (final p in allProducts) {
      gotCats.add(p.category.toLowerCase().trim());
    }

    final disabledSet = disabledCats.map((c) => c.toLowerCase().trim()).toSet();
    final missingCats = _feedCategories
        .where((c) => !gotCats.contains(c) && !disabledSet.contains(c))
        .toList();

    if (missingCats.isNotEmpty) {
      debugPrint('=== COMPAIR: Gap-filling ${missingCats.length} missing categories ===');
      // Batch 4 at a time to avoid overwhelming Firestore
      for (var i = 0; i < missingCats.length; i += 4) {
        final batch = missingCats.skip(i).take(4);
        try {
          final futures = batch.map((cat) => repo.getProducts(
            category: cat, limit: 30, orderBy: 'techScore', descending: true,
          ).catchError((_) =>
            const Success<List<ProductEntity>>([])));
          final results = await Future.wait(futures.toList());
          for (final result in results) {
            result.when(
              success: (products) => addProducts(products),
              failure: (_) {},
            );
          }
        } catch (_) {}
      }
    }
  } else {
    // Bulk failed completely — try individual priority categories
    debugPrint('=== COMPAIR: BULK failed, trying individual categories ===');
    final priorityCats = ['smartphones', 'laptops', 'tablets', 'headphones'];
    for (final cat in priorityCats) {
      try {
        final result = await repo.getProducts(
          category: cat, limit: 50, orderBy: 'techScore', descending: true,
        );
        result.when(
          success: (products) => addProducts(products),
          failure: (_) {},
        );
      } catch (_) {}
      if (allProducts.length >= 20) break;
    }
  }

  sw.stop();
  debugPrint('=== COMPAIR: Total: ${allProducts.length} products in ${sw.elapsedMilliseconds}ms ===');

  // Fetch pinned products
  if (pinnedIds.isNotEmpty) {
    final missingPinned = pinnedIds.where((id) => !seenIds.contains(id)).toList();
    if (missingPinned.isNotEmpty) {
      try {
        final pinnedResult = await repo.getProductsByIds(missingPinned)
            .timeout(const Duration(seconds: 8));
        pinnedResult.when(
          success: (products) => addProducts(products),
          failure: (_) {},
        );
      } catch (_) {}
    }
  }

  return allProducts;
}

void _saveProductsToCache(CacheService cache, List<ProductEntity> products, String cacheKey) {
  try {
    final maps = products.map((p) {
      final m = ProductModel.fromEntity(p).toFirestore();
      if (m['lastUpdated'] is Timestamp) {
        m['lastUpdated'] = (m['lastUpdated'] as Timestamp).toDate().toIso8601String();
      }
      if (m['createdAt'] is Timestamp) {
        m['createdAt'] = (m['createdAt'] as Timestamp).toDate().toIso8601String();
      }
      return m;
    }).toList();
    cache.setLocal(cacheKey, maps, duration: const Duration(hours: 12));
  } catch (_) {}
}

/// Convenience: trending products derived from home feed
final trendingProductsProvider = FutureProvider<List<ProductEntity>>((ref) async {
  final feed = await ref.watch(homeFeedProvider.future)
      .timeout(const Duration(seconds: 20));
  return feed.trending;
});

/// Convenience: featured products derived from home feed
final featuredProductsProvider = FutureProvider<List<ProductEntity>>((ref) async {
  final feed = await ref.watch(homeFeedProvider.future);
  return feed.featured;
});

/// Convenience: new arrivals derived from home feed
final newArrivalsProvider = FutureProvider<List<ProductEntity>>((ref) async {
  final feed = await ref.watch(homeFeedProvider.future);
  return feed.newArrivals;
});

/// Convenience: discover products derived from home feed (hidden gems)
final discoverProductsProvider = FutureProvider<List<ProductEntity>>((ref) async {
  final feed = await ref.watch(homeFeedProvider.future);
  return feed.discover;
});

/// Category cover photos derived from home feed (no extra queries)
final categoryCoversProvider = FutureProvider<Map<String, String>>((ref) async {
  final feed = await ref.watch(homeFeedProvider.future);
  final covers = <String, String>{};
  for (final entry in feed.byCategory.entries) {
    if (entry.value.isNotEmpty) {
      final best = entry.value.firstWhere(
        (p) => p.imageURL.isNotEmpty,
        orElse: () => entry.value.first,
      );
      if (best.imageURL.isNotEmpty) covers[entry.key] = best.imageURL;
    }
  }
  return covers;
});

/// Daily AI trending provider — daily queries Gemini for the most searched tech products,
/// matches with Firestore products and returns them. Cached in Firestore (24 hours).
final aiDailyTrendingProvider = FutureProvider<List<ProductEntity>>((ref) async {
  final repo = ref.read(productRepositoryProvider);

  // 1. Check Firestore cache
  try {
    final db = FirebaseFirestore.instance;
    final cacheDoc = await db.collection('app_config').doc('trending_daily').get();
    if (cacheDoc.exists) {
      final data = cacheDoc.data() ?? {};
      final lastUpdated = (data['lastUpdated'] as Timestamp?)?.toDate();
      final cachedIds = List<String>.from(data['productIds'] ?? []);
      if (lastUpdated != null &&
          DateTime.now().difference(lastUpdated).inHours < 24 &&
          cachedIds.isNotEmpty) {
        final result = await repo.getProductsByIds(cachedIds);
        return result.when(success: (p) => p, failure: (_) => []);
      }
    }
  } catch (_) {}

  // 2. Load products from shared home feed (no extra Firestore query)
  final feed = await ref.read(homeFeedProvider.future);
  final allProducts = feed.all;
  if (allProducts.isEmpty) return allProducts;

  // 3. Call Gemini to get trending tech product types
  final apiKey = EnvConfig.geminiApiKey;
  if (apiKey.isEmpty) {
    return (allProducts.toList()..sort((a, b) => b.trendScore.compareTo(a.trendScore))).take(10).toList();
  }

  try {
    final dio = Dio();
    const prompt = '''List the top 10 most searched and trending consumer technology products right now in 2025. 
Return ONLY a JSON array of product name keywords (short, search-friendly). Example: ["iPhone 16 Pro", "Samsung Galaxy S25", "MacBook Air M4"]
Return only the JSON array, no explanation.''';

    final response = await dio.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      queryParameters: {'key': apiKey},
      data: {
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {'temperature': 0.3, 'maxOutputTokens': 512},
      },
      options: Options(receiveTimeout: const Duration(seconds: 15)),
    );

    final text = response.data['candidates']?[0]?['content']?['parts']?[0]?['text'] as String? ?? '[]';
    final match = RegExp(r'\[.*?\]', dotAll: true).firstMatch(text);
    if (match == null) throw Exception('No JSON in response');
    final jsonStr = match.group(0)!;

    // Parse list from simple JSON array (no dart:convert needed for simple string arrays)
    final keywords = <String>[];
    final cleaned = jsonStr.replaceAll('[', '').replaceAll(']', '').replaceAll('"', '').replaceAll("'", '');
    for (final item in cleaned.split(',')) {
      final kw = item.trim().toLowerCase();
      if (kw.isNotEmpty) keywords.add(kw);
    }

    // 4. Match keywords to products in DB
    final matched = <ProductEntity>[];
    for (final kw in keywords) {
      final parts = kw.split(' ').where((s) => s.length > 2).toList();
      if (parts.isEmpty) continue;
      final product = allProducts.firstWhere(
        (p) => parts.every((part) =>
            p.name.toLowerCase().contains(part) ||
            (p.brand?.toLowerCase().contains(part) ?? false)),
        orElse: () => allProducts.firstWhere(
          (p) => p.name.toLowerCase().contains(parts.first),
          orElse: () => ProductEntity(id: '', name: '', category: '', subcategory: '', lastUpdated: DateTime(2000)),
        ),
      );
      if (product.id.isNotEmpty && !matched.any((m) => m.id == product.id)) {
        matched.add(product);
      }
      if (matched.length >= 10) break;
    }

    // Fill remaining with top trendScore
    if (matched.length < 10) {
      final remaining = allProducts
          .where((p) => !matched.any((m) => m.id == p.id))
          .toList()..sort((a, b) => b.trendScore.compareTo(a.trendScore));
      matched.addAll(remaining.take(10 - matched.length));
    }

    // 5. Save to Firestore cache
    try {
      await FirebaseFirestore.instance
          .collection('app_config')
          .doc('trending_daily')
          .set({
        'productIds': matched.map((p) => p.id).toList(),
        'lastUpdated': Timestamp.now(),
        'source': 'gemini',
      });
    } catch (_) {}

    return matched;
  } catch (_) {
    return (allProducts.toList()..sort((a, b) => b.trendScore.compareTo(a.trendScore))).take(10).toList();
  }
});

// ════════════════════════════════════════════════════
// ─── PERSONALIZED RECOMMENDATIONS ─── Section 6, 8
// ════════════════════════════════════════════════════

/// Personalized product recommendations - Section 6.1 "For You"
/// Uses home feed data — no extra Firestore queries.
final personalizedRecommendationsProvider = FutureProvider<List<ProductEntity>>((ref) async {
  final userAsync = ref.watch(userProfileProvider);
  final user = userAsync.valueOrNull;
  final feed = await ref.watch(homeFeedProvider.future);
  final behavior = await ref.watch(behaviorSignalsProvider.future);

  if (feed.all.isEmpty) return <ProductEntity>[];

  // If no user yet, show cross-category trending products as "For You"
  if (user == null) {
    // Ensure category diversity in trending
    final catCount = <String, int>{};
    final diverse = <ProductEntity>[];
    for (final p in feed.trending) {
      final cat = p.category.toLowerCase();
      final cnt = catCount[cat] ?? 0;
      if (cnt < 3) {
        diverse.add(p);
        catCount[cat] = cnt + 1;
      }
      if (diverse.length >= 25) break;
    }
    return diverse;
  }

  final algorithmService = ref.read(profileAlgorithmServiceProvider);
  var allProducts = <ProductEntity>[];
  final existingIds = <String>{};

  // Get behavior-boosted category priorities
  final priorityCats = algorithmService.getCategoryPriority(user, behavior: behavior);

  // Pull products from top 10 priority categories — MAX 5 per category for diversity
  final topCats = priorityCats.isNotEmpty
      ? priorityCats.take(10).toList()
      : user.interestCategories.take(6).toList();
  for (final cat in topCats) {
    final catLower = cat.toLowerCase().trim();
    final catProducts = feed.byCategory[catLower] ?? [];
    int added = 0;
    for (final p in catProducts) {
      if (!existingIds.contains(p.id)) {
        allProducts.add(p);
        existingIds.add(p.id);
        added++;
      }
      if (added >= 5) break;
    }
  }

  // Fill with cross-category trending products for discovery
  if (allProducts.length < 40) {
    for (final p in feed.trending) {
      if (!existingIds.contains(p.id)) {
        allProducts.add(p);
        existingIds.add(p.id);
      }
      if (allProducts.length >= 60) break;
    }
  }

  // Sort with full profile algorithm
  final sortedProducts = algorithmService.sortByRelevance(
    user: user,
    products: allProducts,
    behavior: behavior,
  );

  // Final diversity check: max 4 per category in output
  final outputCatCount = <String, int>{};
  final result = <ProductEntity>[];
  for (final p in sortedProducts) {
    final cat = p.category.toLowerCase();
    final cnt = outputCatCount[cat] ?? 0;
    if (cnt < 4) {
      result.add(p);
      outputCatCount[cat] = cnt + 1;
    }
    if (result.length >= 25) break;
  }
  return result;
});

/// Category priority based on user's interests + behavior
final userCategoryPriorityProvider = FutureProvider<List<String>>((ref) async {
  final userAsync = ref.watch(userProfileProvider);
  final user = userAsync.valueOrNull;

  if (user == null) {
    return ['smartphones', 'laptops', 'tablets', 'gpus'];
  }

  final behavior = await ref.watch(behaviorSignalsProvider.future);
  final algorithmService = ref.read(profileAlgorithmServiceProvider);
  return algorithmService.getCategoryPriority(user, behavior: behavior);
});

/// Calculate fit score for a specific product
final productFitScoreProvider = FutureProvider.family<double, String>((ref, productId) async {
  final userAsync = ref.watch(userProfileProvider);
  final user = userAsync.valueOrNull;

  if (user == null) return 0.0;

  final behavior = await ref.watch(behaviorSignalsProvider.future);
  final productResult = await ref.read(productRepositoryProvider).getProduct(productId);

  return productResult.when(
    success: (product) {
      final algorithmService = ref.read(profileAlgorithmServiceProvider);
      return algorithmService.calculateTotalFitScore(
          user: user, product: product, behavior: behavior);
    },
    failure: (_) => 0.0,
  );
});

/// User profile vector provider
final userProfileVectorProvider = Provider<Map<String, double>>((ref) {
  final userAsync = ref.watch(userProfileProvider);
  final user = userAsync.valueOrNull;

  if (user == null) return {};

  // Calculate profile vector
  final algorithmService = ref.read(profileAlgorithmServiceProvider);
  return algorithmService.calculateProfileVector(user);
});

/// User comparison history
final userComparisonsProvider = FutureProvider<Result<List<ComparisonEntity>>>((ref) async {
  final userAsync = ref.watch(userProfileProvider);
  final user = userAsync.valueOrNull;
  if (user == null) return const Success([]);
  
  return ref.read(comparisonRepositoryProvider).getUserComparisons(user.uid);
});

/// Admin-curated comparisons (Battles)
final predefinedComparisonsProvider = FutureProvider<List<ComparisonEntity>>((ref) async {
  final category = ref.watch(selectedCategoryProvider);
  final result = await ref.read(comparisonRepositoryProvider).getPredefinedComparisons(
    category: category,
    limit: 10,
  );
  return result.when(
    success: (comparisons) => comparisons,
    failure: (_) => <ComparisonEntity>[],
  );
});

/// Reviews for a product
final productReviewsProvider =
    FutureProvider.family<List<ReviewModel>, String>((ref, productId) async {
  try {
    final result = await ref.read(productRepositoryProvider)
        .getProductReviews(productId)
        .timeout(const Duration(seconds: 8));
    return result.when(
      success: (reviews) => reviews,
      failure: (_) => <ReviewModel>[],
    );
  } catch (_) {
    return <ReviewModel>[];
  }
});

/// Toggle favorite - returns new isFavorite state
Future<bool> toggleFavorite(WidgetRef ref, String productId) async {
  final user = ref.read(userProfileProvider).valueOrNull;
  if (user == null) return false;
  final ds = ref.read(firebaseDataSourceProvider);
  final result = await ds.toggleFavorite(user.uid, productId);
  ref.invalidate(userProfileProvider);
  return result;
}

/// Check if product is favorited
bool isFavorite(WidgetRef ref, String productId) {
  final user = ref.read(userProfileProvider).valueOrNull;
  if (user == null) return false;
  return user.favorites.contains(productId);
}

/// Recently viewed product IDs (from Hive local storage)
final viewedProductsProvider = Provider<List<String>>((ref) {
  try {
    return ref.watch(hiveDataSourceProvider).getViewedProducts();
  } catch (_) {
    return [];
  }
});

/// Record a product view (non-blocking, uses cached data)
Future<void> recordProductView(WidgetRef ref, String productId) async {
  try {
    await ref.read(hiveDataSourceProvider).addViewedProduct(productId);
    ref.invalidate(viewedProductsProvider);
    // Get category from cache (no network call)
    String category = '';
    final feedAsync = ref.read(homeFeedProvider);
    final cached = feedAsync.valueOrNull;
    if (cached != null) {
      final match = cached.trending.where((p) => p.id == productId).firstOrNull;
      category = match?.category ?? '';
    }
    ref.read(behaviorTrackingProvider).trackProductView(productId, category);
    ref.read(behaviorTrackingProvider).trackActiveHour();
    // Firebase Analytics
    final brand = cached?.trending.where((p) => p.id == productId).firstOrNull?.brand;
    AnalyticsService.instance.logProductView(productId, category, brand);
  } catch (_) {}
}

// ─── Freemium Usage Tracking ──────────────────────────────────────────────────

class FreemiumLimits {
  static const int comparisonsPerDay = 5;
  static const int aiChatsPerDay = 15;
  static const int linkAnalysesPerWeek = 3;
}

final freemiumUsageProvider = Provider.family<int, String>((ref, feature) {
  try {
    final period = feature == 'link_analysis' ? 'weekly' : 'daily';
    return ref.watch(hiveDataSourceProvider).getUsageCount(feature, period: period);
  } catch (_) {
    return 0;
  }
});

Future<bool> checkAndIncrementUsage(WidgetRef ref, String feature) async {
  final isPremium = ref.read(premiumProvider);
  if (isPremium) return true;

  final period = feature == 'link_analysis' ? 'weekly' : 'daily';
  final current = ref.read(hiveDataSourceProvider).getUsageCount(feature, period: period);
  final limit = switch (feature) {
    'comparison' => FreemiumLimits.comparisonsPerDay,
    'ai_chat' => FreemiumLimits.aiChatsPerDay,
    'link_analysis' => FreemiumLimits.linkAnalysesPerWeek,
    _ => 999,
  };
  if (current >= limit) return false;
  await ref.read(hiveDataSourceProvider).incrementUsage(feature, period: period);
  ref.invalidate(freemiumUsageProvider(feature));
  return true;
}

// ─── Spec Direction Service ───────────────────────────────────────────────────

final specDirectionServiceProvider = FutureProvider<SpecDirectionService>((ref) async {
  final service = SpecDirectionService();
  try {
    await service.loadFirestoreOverrides().timeout(const Duration(seconds: 5));
  } catch (_) {
    // Use default directions if Firestore is slow
  }
  return service;
});

/// Returns variants of a product (same base name, different storage/RAM)
final productVariantsProvider = FutureProvider.family<List<ProductEntity>, ProductEntity>((ref, product) async {
  final baseName = normalizeProductName(product.name);
  final baseGroup = product.variantGroup;

  List<ProductEntity> _filterVariants(List<ProductEntity> products) {
    final variants = products.where((p) {
      if (p.id == product.id) return false;
      if (baseGroup.isNotEmpty && p.variantGroup.isNotEmpty) {
        return p.variantGroup == baseGroup;
      }
      return normalizeProductName(p.name) == baseName;
    }).toList();
    variants.sort((a, b) => _storageCapacityMB(a).compareTo(_storageCapacityMB(b)));
    return variants;
  }

  // 1) Try from already-cached homeFeed (instant, no network)
  final feedAsync = ref.read(homeFeedProvider);
  final cached = feedAsync.valueOrNull;
  if (cached != null) {
    final catKey = (product.category ?? '').toLowerCase().trim();
    final catProducts = cached.byCategory[catKey] ?? [];
    // Also search all products in case category key doesn't match
    final allProducts = cached.trending;
    final pool = {...catProducts, ...allProducts}.toList();
    final variants = _filterVariants(pool);
    if (variants.isNotEmpty) return variants;
  }

  // 2) Fallback: small Firestore query (limit 30, not 200!)
  try {
    final result = await ref.read(productRepositoryProvider).getProducts(
      category: product.category,
      limit: 30,
    ).timeout(const Duration(seconds: 8));
    return result.when(
      success: (products) => _filterVariants(products),
      failure: (_) => [],
    );
  } catch (_) {
    return [];
  }
});

// ─── Chat Session State ───────────────────────────────────────────────────

class ChatSessionState {
  final String? conversationId;
  final List<PersistedChatMsg> messages; // newest first (index 0 = latest)
  final bool isLoading;
  final String title;

  const ChatSessionState({
    this.conversationId,
    this.messages = const [],
    this.isLoading = false,
    this.title = 'New Chat',
  });

  ChatSessionState copyWith({
    String? conversationId,
    List<PersistedChatMsg>? messages,
    bool? isLoading,
    String? title,
  }) => ChatSessionState(
    conversationId: conversationId ?? this.conversationId,
    messages: messages ?? this.messages,
    isLoading: isLoading ?? this.isLoading,
    title: title ?? this.title,
  );
}

class ChatSessionNotifier extends StateNotifier<ChatSessionState> {
  final Ref _ref;

  ChatSessionNotifier(this._ref) : super(const ChatSessionState()) {
    _initWelcome();
  }

  void _initWelcome() {
    final locale = _ref.read(localeProvider);
    final langCode = locale?.languageCode ?? 'en';
    const greetings = <String, String>{
      'tr': 'Merhaba! Ben yapay zeka alışveriş asistanınım. Telefon, laptop, kulaklık hakkında her şeyi sorabilir veya ürün görseli göndererek analiz ettirebilirsiniz! 🚀',
      'de': 'Hallo! Ich bin dein KI-Einkaufsassistent. Frag mich alles über Smartphones, Laptops, Kopfhörer oder sende ein Produktbild zur Analyse! 🚀',
      'fr': 'Salut! Je suis votre assistant shopping IA. Posez-moi des questions sur les téléphones, laptops, écouteurs ou envoyez une image produit! 🚀',
      'es': '¡Hola! Soy tu asistente de compras IA. ¡Pregúntame sobre teléfonos, laptops, auriculares o envía una imagen de producto! 🚀',
      'ar': 'مرحباً! أنا مساعدك الذكي للتسوق. اسألني عن الهواتف والأجهزة المحمولة أو أرسل صورة منتج للتحليل! 🚀',
      'ru': 'Привет! Я ваш ИИ-помощник по покупкам. Спрашивайте меня о телефонах, ноутбуках, наушниках! 🚀',
      'zh': '你好！我是您的AI购物助手。询问手机、笔记本、耳机相关问题，或发送产品图片分析！🚀',
      'ja': 'こんにちは！AIショッピングアシスタントです。スマホ・ノートPC・ヘッドホンについて何でも聞いてください！🚀',
      'ko': '안녕하세요! AI 쇼핑 도우미입니다. 스마트폰, 노트북, 헤드폰에 대해 무엇이든 물어보세요! 🚀',
      'pt': 'Olá! Sou seu assistente de compras IA. Pergunte-me sobre telefones, laptops, fones de ouvido! 🚀',
      'it': 'Ciao! Sono il tuo assistente shopping IA. Chiedimi di telefoni, laptop, cuffie! 🚀',
    };
    final text = greetings[langCode] ??
        'Hey! I\'m your AI shopping assistant. Ask me anything about phones, laptops, headphones, or send me a product image to analyze! 🚀';
    final welcome = PersistedChatMsg(
      id: 'welcome',
      role: PersistedMsgRole.ai,
      text: text,
    );
    state = state.copyWith(messages: [welcome]);
  }

  String _autoTitle(String firstUserMsg) {
    final t = firstUserMsg.trim();
    return t.length > 45 ? '${t.substring(0, 45)}...' : t;
  }

  Future<void> send(
    String text, {
    String? imageBase64,
    String? imageMimeType,
    Map<String, dynamic>? pageContext,
  }) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty && imageBase64 == null) return;

    final user = _ref.read(userProfileProvider).valueOrNull;
    if (user == null) {
      _addMsg(PersistedChatMsg(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        role: PersistedMsgRole.system,
        text: 'Please sign in to use AI Chat.',
        status: PersistedMsgStatus.error,
      ));
      return;
    }

    final sub = _ref.read(subscriptionServiceProvider);
    final quota = sub.recordAIQuestion();
    if (quota.isFailure) {
      _addMsg(PersistedChatMsg(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        role: PersistedMsgRole.system,
        text: 'Daily AI question limit reached. Upgrade to Premium for unlimited!',
        status: PersistedMsgStatus.error,
      ));
      return;
    }

    final userMsg = PersistedChatMsg(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      role: PersistedMsgRole.user,
      text: trimmed,
    );
    _addMsg(userMsg);
    state = state.copyWith(isLoading: true);

    // Auto-title from first user message
    final userMsgCount =
        state.messages.where((m) => m.role == PersistedMsgRole.user).length;
    final isFirstUserMsg = userMsgCount == 1;
    final title = isFirstUserMsg ? _autoTitle(trimmed) : state.title;
    if (isFirstUserMsg) state = state.copyWith(title: title);

    final convId = await _ensureConversation(user.uid, title);

    try {
      final gemini = _ref.read(geminiServiceProvider);

      if (imageBase64 != null) {
        // Image analysis: non-streaming (multimodal)
        final response = await gemini.analyzeImage(
          base64Image: imageBase64,
          mimeType: imageMimeType ?? 'image/jpeg',
          prompt: trimmed.isNotEmpty
              ? trimmed
              : 'Identify this product. What is it? Is it good?',
        );
        final aiMsg = PersistedChatMsg(
          id: '${DateTime.now().millisecondsSinceEpoch}_ai',
          role: PersistedMsgRole.ai,
          text: response,
        );
        _addMsg(aiMsg);
      } else {
        // Text chat: streaming for instant response feel
        final turns = _buildTurns(trimmed, user, pageContext: pageContext);
        final aiMsgId = '${DateTime.now().millisecondsSinceEpoch}_ai';
        String accumulated = '';

        try {
          await for (final chunk in gemini.chatConversationStream(turns, user)) {
            accumulated += chunk;
            // Clean JSON wrapper if AI still returns it
            final cleanText = _stripJsonWrapper(accumulated);
            // Update the AI message in-place for live streaming effect
            final aiMsg = PersistedChatMsg(
              id: aiMsgId,
              role: PersistedMsgRole.ai,
              text: cleanText,
            );
            _updateOrAddMsg(aiMsg);
          }
        } catch (_) {
          // Streaming failed — fallback to batch
          if (accumulated.isEmpty) {
            final response = await gemini.chatConversation(turns, user);
            accumulated = response;
          }
        }

        if (accumulated.isEmpty) {
          accumulated = 'Sorry, I couldn\'t process that. Please try again.';
        }

        // Final update with complete text
        final cleanText = _stripJsonWrapper(accumulated);
        final aiMsg = PersistedChatMsg(
          id: aiMsgId,
          role: PersistedMsgRole.ai,
          text: cleanText,
        );
        _updateOrAddMsg(aiMsg);
      }

      // Persist to Firestore in background (fire-and-forget)
      final ds = _ref.read(firebaseDataSourceProvider);
      final allMsgs = List<PersistedChatMsg>.from(state.messages.reversed);
      ds
          .updateChatConversation(user.uid, convId, allMsgs, title)
          .catchError((_) {/* silent fail */});
    } catch (e) {
      _addMsg(PersistedChatMsg(
        id: '${DateTime.now().millisecondsSinceEpoch}_err',
        role: PersistedMsgRole.ai,
        text: 'Sorry, I couldn\'t process that. Please try again.',
        status: PersistedMsgStatus.error,
      ));
    } finally {
      state = state.copyWith(isLoading: false);
    }
  }

  /// Strip JSON wrapper if AI returns {"message": "..."} format
  static String _stripJsonWrapper(String text) {
    final trimmed = text.trim();
    if (!trimmed.startsWith('{')) return trimmed;
    try {
      final decoded = jsonDecode(trimmed);
      if (decoded is Map && decoded['message'] != null) {
        return decoded['message'] as String;
      }
    } catch (_) {
      // Partial JSON during streaming — try to extract message field
      final match = RegExp(r'"message"\s*:\s*"((?:[^"\\]|\\.)*)').firstMatch(trimmed);
      if (match != null) {
        return match.group(1)?.replaceAll(r'\"', '"').replaceAll(r'\n', '\n') ?? trimmed;
      }
    }
    return trimmed;
  }

  /// Update existing message by id, or add if not found
  void _updateOrAddMsg(PersistedChatMsg msg) {
    final idx = state.messages.indexWhere((m) => m.id == msg.id);
    if (idx >= 0) {
      final updated = List<PersistedChatMsg>.from(state.messages);
      updated[idx] = msg;
      state = state.copyWith(messages: updated);
    } else {
      _addMsg(msg);
    }
  }

  Future<String> _ensureConversation(String userId, String title) async {
    if (state.conversationId != null) return state.conversationId!;
    // Use local ID immediately, persist to Firestore in background
    final localId = 'local_${DateTime.now().millisecondsSinceEpoch}';
    state = state.copyWith(conversationId: localId);
    // Fire-and-forget Firestore creation (don't block chat on it)
    final ds = _ref.read(firebaseDataSourceProvider);
    final now = DateTime.now();
    final conv = ChatConversation(
      id: '',
      userId: userId,
      title: title,
      messages: [],
      createdAt: now,
      updatedAt: now,
    );
    ds.createChatConversation(conv).then((newId) {
      if (newId != localId) state = state.copyWith(conversationId: newId);
    }).catchError((_) {/* keep localId */});
    return localId;
  }

  List<Map<String, String>> _buildTurns(String newMsg, dynamic user, {Map<String, dynamic>? pageContext}) {
    final recent = state.messages
        .where((m) => m.role != PersistedMsgRole.system)
        .take(10)
        .toList()
        .reversed
        .toList();
    final turns = <Map<String, String>>[];
    for (final m in recent) {
      turns.add({
        'role': m.role == PersistedMsgRole.user ? 'user' : 'model',
        'text': m.text,
      });
    }
    final parts = <String>[];
    try {
      if ((user.language as String?)?.isNotEmpty == true &&
          user.language != 'en') {
        parts.add('Language: ${user.language}');
      }
      if ((user.ecosystem as String?)?.isNotEmpty == true &&
          user.ecosystem != 'mixed') {
        parts.add('Ecosystem: ${user.ecosystem}');
      }
      if ((user.budgetRange as String?)?.isNotEmpty == true) {
        parts.add('Budget: ${user.budgetRange}');
      }
      if ((user.priorities as List?)?.isNotEmpty == true) {
        parts.add('Priorities: ${(user.priorities as List).join(', ')}');
      }
      if ((user.interestCategories as List?)?.isNotEmpty == true) {
        parts.add('Interests: ${(user.interestCategories as List).join(', ')}');
      }
      if ((user.country as String?)?.isNotEmpty == true) {
        parts.add('Country: ${user.country}');
      }
    } catch (_) {}

    // Add page context so AI knows what the user is looking at
    final pageCtxStr = <String>[];
    if (pageContext != null) {
      if (pageContext['page'] != null) pageCtxStr.add('Currently viewing: ${pageContext['page']}');
      if (pageContext['route'] != null) pageCtxStr.add('Route: ${pageContext['route']}');
      if (pageContext['productName'] != null) pageCtxStr.add('Product: ${pageContext['productName']}');
      if (pageContext['productBrand'] != null) pageCtxStr.add('Brand: ${pageContext['productBrand']}');
      if (pageContext['productCategory'] != null) pageCtxStr.add('Category: ${pageContext['productCategory']}');
      if (pageContext['techScore'] != null) pageCtxStr.add('Tech Score: ${pageContext['techScore']}');
      if (pageContext['matchScore'] != null) pageCtxStr.add('Match Score: ${pageContext['matchScore']}');
    }

    final ctx =
        parts.isEmpty ? '' : '\n[User Profile: ${parts.join(' | ')}]';
    final pageInfo =
        pageCtxStr.isEmpty ? '' : '\n[Page Context: ${pageCtxStr.join(' | ')}]';
    turns.add({'role': 'user', 'text': '$newMsg$ctx$pageInfo'});
    return turns;
  }

  void _addMsg(PersistedChatMsg msg) {
    state = state.copyWith(messages: [msg, ...state.messages]);
  }

  Future<void> loadConversation(String userId, String convId) async {
    state = state.copyWith(isLoading: true);
    try {
      final ds = _ref.read(firebaseDataSourceProvider);
      final conv = await ds.getChatConversation(userId, convId);
      if (conv != null) {
        state = ChatSessionState(
          conversationId: conv.id,
          messages: conv.messages.reversed.toList(), // newest first
          title: conv.title,
          isLoading: false,
        );
      } else {
        state = state.copyWith(isLoading: false);
      }
    } catch (_) {
      state = state.copyWith(isLoading: false);
    }
  }

  void newConversation() {
    state = const ChatSessionState();
    _initWelcome();
  }
}

final chatSessionProvider =
    StateNotifierProvider<ChatSessionNotifier, ChatSessionState>((ref) {
  return ChatSessionNotifier(ref);
});

final chatHistoryProvider =
    StreamProvider.family<List<ChatConversation>, String>(
  (ref, userId) {
    return ref
        .read(firebaseDataSourceProvider)
        .streamChatConversations(userId);
  },
);

// End of file

// ════════════════════════════════════════════════════
// ─── SIMILAR PRODUCTS PROVIDER ───
// ════════════════════════════════════════════════════

/// Finds truly similar products: same category, ±1 year release date,
/// grouped by brand. Uses homeFeed cache only for speed (~6ms).
final similarProductsProvider = FutureProvider.family<List<ProductEntity>, ProductEntity>(
  (ref, product) async {
    try {
      final catKey = product.category.toLowerCase().trim();
      final productYear = product.lastUpdated.year;

      // 1) Instant: in-memory cache (no waiting if not ready)
      List<ProductEntity> pool = [];
      final ds = ref.read(firebaseDataSourceProvider);
      
      // Only use cache if already ready - no waiting
      try {
        if (ds.isCacheReady) {
          final cached = await ds.getAllCachedProducts();
          pool = cached.where((p) => p.category.toLowerCase().trim() == catKey)
              .cast<ProductEntity>().toList();
        }
      } catch (_) {}
      
      // 2) Parallel: homeFeed cache + Firestore query simultaneously
      if (pool.length < 15) {
        final futures = <Future>[];
        
        // homeFeed - fast timeout
        futures.add((() async {
          try {
            final feed = await ref.read(homeFeedProvider.future)
                .timeout(const Duration(seconds: 3));
            final feedProducts = feed.all
                .where((p) => p.category.toLowerCase().trim() == catKey)
                .toList();
            final ids = pool.map((p) => p.id).toSet();
            for (final p in feedProducts) {
              if (!ids.contains(p.id)) pool.add(p);
            }
          } catch (_) {}
        })());

        // Firestore query - always fire, fast timeout
        futures.add((() async {
          try {
            final result = await ref.read(productRepositoryProvider)
                .getProducts(category: product.category, limit: 60)
                .timeout(const Duration(seconds: 5));
            result.when(
              success: (products) {
                final ids = pool.map((p) => p.id).toSet();
                for (final p in products) {
                  if (!ids.contains(p.id)) pool.add(p);
                }
              },
              failure: (_) {},
            );
          } catch (_) {}
        })());

        await Future.wait(futures);
      }

      if (pool.isEmpty) return [];

      // Filter: same category, recent products only, exclude self & defunct brands
      const defunctBrands = {
        'alcatel', 'micromax', 'karbonn', 'lava', 'intex', 'xolo',
        'coolpad', 'leeco', 'le eco', 'gionee', 'panasonic mobile',
        'blackberry', 'htc', 'zte', 'wiko', 'meizu', 'sharp mobile',
        'vernee', 'doogee', 'oukitel', 'umidigi', 'ulefone', 'cubot',
        'homtom', 'bluboo', 'elephone', 'leagoo', 'maze', 'nomu',
        'altus', 'vestel', 'casper', 'reeder', 'general mobile', 'turkcell',
        'grundig', 'beko', 'arçelik', 'hometech', 'vorcom', 'tcl mobile',
        'acer', 'amazon', 'blu', 'cat', 'energizer', 'fairphone',
        'gigaset', 'hisense', 'infinix', 'itel', 'lg',
        'maxwest', 'nuu', 'plum', 'positivo', 'qmobile', 'spice',
        'symphony', 'tecno', 'walton', 'yezz', 'philips', 'benq',
      };

      final currentYear = DateTime.now().year;
      final candidates = pool.where((p) {
        if (p.id == product.id) return false;
        if (p.category.toLowerCase().trim() != catKey) return false;
        final brand = (p.brand ?? '').toLowerCase().trim();
        if (defunctBrands.contains(brand)) return false;
        // Only 2024+ products (or same year as product)
        final pYear = p.lastUpdated.year;
        if (pYear < 2024 && pYear < productYear) return false;
        // Minimum tech score of 30 to exclude junk
        if (p.techScore < 30) return false;
        return true;
      }).toList();

      if (candidates.isEmpty) return [];

      // Score candidates by similarity
      List<MapEntry<ProductEntity, double>> scored = candidates.map((p) {
        double score = 0;
        // Year proximity bonus
        final yearDiff = (p.lastUpdated.year - productYear).abs();
        if (yearDiff == 0) score += 20;
        else if (yearDiff == 1) score += 15;
        else if (yearDiff == 2) score += 8;
        else score += 3;
        // Tech score similarity (most important)
        final techDiff = (p.techScore - product.techScore).abs();
        if (techDiff <= 5) score += 30;
        else if (techDiff <= 10) score += 22;
        else if (techDiff <= 15) score += 15;
        else if (techDiff <= 25) score += 8;
        else score += 2;
        // Brand diversity bonus
        if (p.brand?.toLowerCase() != product.brand?.toLowerCase()) {
          score += 10;
        } else {
          score += 3;
        }
        // Trend score bonus
        if (p.trendScore > 75) score += 5;
        else if (p.trendScore > 50) score += 3;
        // Price proximity bonus
        final pAnyPrice = p.prices.values.isNotEmpty ? p.prices.values.first : 0.0;
        final prodAnyPrice = product.prices.values.isNotEmpty ? product.prices.values.first : 0.0;
        if (pAnyPrice > 0 && prodAnyPrice > 0) {
          final priceDiff = ((pAnyPrice - prodAnyPrice) / prodAnyPrice).abs();
          if (priceDiff <= 0.15) score += 12;
          else if (priceDiff <= 0.3) score += 8;
          else if (priceDiff <= 0.5) score += 4;
        }
        return MapEntry(p, score);
      }).toList();

      scored.sort((a, b) => b.value.compareTo(a.value));

      final result = <ProductEntity>[];
      final brandCount = <String, int>{};
      for (final entry in scored) {
        final brand = entry.key.brand?.toLowerCase() ?? 'unknown';
        if ((brandCount[brand] ?? 0) >= 6) continue;
        brandCount[brand] = (brandCount[brand] ?? 0) + 1;
        result.add(entry.key);
        if (result.length >= 50) break;
      }

      return result;
    } catch (_) {
      return [];
    }
  },
);
