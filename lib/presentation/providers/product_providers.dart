part of 'providers.dart';

// ── PC Picker paginated state (lazy load + server-side search) ──
class PcPickerState {
  final List<ProductEntity> items;
  final bool isLoading;
  final bool isLoadingMore;
  final bool hasMore;
  final int totalFound;
  final int page;
  final String query;

  const PcPickerState({
    this.items = const [],
    this.isLoading = true,
    this.isLoadingMore = false,
    this.hasMore = false,
    this.totalFound = 0,
    this.page = 0,
    this.query = '*',
  });

  PcPickerState copyWith({
    List<ProductEntity>? items,
    bool? isLoading,
    bool? isLoadingMore,
    bool? hasMore,
    int? totalFound,
    int? page,
    String? query,
  }) => PcPickerState(
    items: items ?? this.items,
    isLoading: isLoading ?? this.isLoading,
    isLoadingMore: isLoadingMore ?? this.isLoadingMore,
    hasMore: hasMore ?? this.hasMore,
    totalFound: totalFound ?? this.totalFound,
    page: page ?? this.page,
    query: query ?? this.query,
  );
}

class PcPickerNotifier extends StateNotifier<PcPickerState> {
  final PbDataSource _ds;
  final String _categoryId;
  static const int _pageSize = 30;

  PcPickerNotifier(this._ds, this._categoryId) : super(const PcPickerState()) {
    _loadFirstPage();
  }

  Future<void> _loadFirstPage({String query = '*'}) async {
    if (!mounted) return;
    state = PcPickerState(query: query);
    await _loadPage(page: 1, reset: true);
  }

  Future<void> loadMore() async {
    if (!mounted) return;
    if (state.isLoadingMore || !state.hasMore || state.isLoading) return;
    state = state.copyWith(isLoadingMore: true);
    await _loadPage(page: state.page + 1, reset: false);
  }

  Future<void> search(String query) async {
    if (!mounted) return;
    final q = query.trim().isEmpty ? '*' : query.trim();
    if (q == state.query) return;
    await _loadFirstPage(query: q);
  }

  Future<void> _loadPage({required int page, required bool reset}) async {
    if (!mounted) return;
    final aliases = pcCategoryAliases[_categoryId] ?? [_categoryId];
    try {
      for (final alias in aliases) {
        final result = await _ds.getProductsPageTs(
          category: alias,
          limit: _pageSize,
          page: page,
          query: state.query,
        );
        if (!mounted) return;
        if (result.products.isNotEmpty || page == 1) {
          final newItems = result.products.cast<ProductEntity>();
          state = state.copyWith(
            items: reset ? newItems : [...state.items, ...newItems],
            isLoading: false,
            isLoadingMore: false,
            hasMore: result.hasMore,
            totalFound: result.totalFound,
            page: page,
          );
          return;
        }
      }
      if (!mounted) return;
      // All aliases returned empty
      state = state.copyWith(
        items: reset ? const [] : state.items,
        isLoading: false,
        isLoadingMore: false,
        hasMore: false,
        totalFound: reset ? 0 : state.totalFound,
        page: page,
      );
    } catch (e) {
      if (!mounted) return;
      state = state.copyWith(isLoading: false, isLoadingMore: false);
    }
  }
}

/// PC Picker provider — fast paginated picker (30 items at a time, server-side search).
/// Does NOT preload all products. Opens instantly, loads more on scroll.
final pcPickerProvider = StateNotifierProvider.autoDispose
    .family<PcPickerNotifier, PcPickerState, String>((ref, categoryId) {
      final ds = ref.read(pbDataSourceProvider);
      return PcPickerNotifier(ds, categoryId.toLowerCase().trim());
    });

const bool _verboseHomeFeedDiagnostics = false;
const bool _verboseHomeFeedFetchLogs = false;
const int _homeFeedInitialCategoryCount = 48;
// Per-category depth for the first paint. 18 comfortably fills every home shelf
// (each shows ≤12) while keeping the parsed-entity pool ~35% smaller than 28 —
// less main-thread parse + memory + GC pressure on entry-level devices. The
// "show more" paths refetch deeper on demand.
const int _homeFeedInitialPerCategory = 18;

/// Category aliases used by category browse providers and legacy deep links.
/// Canonical keys and legacy deep-link keys both resolve to query variants.
const catalogCategoryAliases = <String, List<String>>{
  // Feature phones merged into smartphones — their query variants ride along so
  // any residual feature_phones records still surface under Smartphones.
  'smartphones': ['smartphones', 'smartphone', 'telefon', 'cep-telefonu', 'feature_phones', 'feature-phones', 'tuslu-telefon'],
  'smart_rings': ['smart_rings', 'smart-rings', 'smart rings'],
  'tablets': ['tablets', 'tablet'],
  'smartwatches': ['smartwatches', 'smartwatch', 'akıllı saat'],
  'headphones': ['headphones', 'headsets', 'headset', 'kulaklık'],
  'powerbanks': ['powerbanks', 'power_banks', 'power-banks', 'power bank'],
  'chargers': ['chargers', 'charger', 'sarj-aleti', 'şarj aleti'],
  'laptops': ['laptops', 'laptop', 'notebook', 'notebooks', 'dizüstü'],
  'desktops': ['desktops', 'desktop', 'masaüstü'],
  'e_readers': ['e_readers', 'e-readers', 'e reader', 'ebook reader'],
  'vr_headsets': ['vr_headsets', 'vr-headsets', 'vr headsets'],
  'cpus': ['cpus', 'cpu', 'processors', 'processor', 'işlemci', 'islemci'],
  'graphics_cards': [
    'graphics_cards',
    'gpus',
    'gpu',
    'graphics-cards',
    'graphics-card',
    'ekran-karti',
  ],
  'gpus': ['graphics_cards', 'gpus', 'graphics-cards'],
  'ram': ['ram', 'bellek-ram', 'memory', 'bellek'],
  'ssd': ['ssd', 'ssds', 'storage', 'disk', 'depolama', 'hard-disk'],
  'flash_drives': [
    'flash_drives',
    'flash-drives',
    'usb flash drives',
    'memory_cards',
    'external_hdd',
    'external_hdds',
  ],
  'motherboards': ['motherboards', 'motherboard', 'anakart', 'mainboard'],
  'psu': ['psu', 'power_supplies', 'power-supply', 'güç kaynağı'],
  'ups': ['ups', 'uninterruptible power supply'],
  'pc_cases': ['pc_cases', 'cases', 'case', 'bilgisayar-kasasi', 'kasa'],
  'cases': ['pc_cases', 'cases', 'case'],
  'cpu_coolers': ['cpu_coolers', 'coolers', 'cpu-coolers', 'cooler'],
  'coolers': ['cpu_coolers', 'coolers', 'cooler'],
  'case_fans': ['case_fans', 'case-fans', 'fans'],
  'laptop_coolers': ['laptop_coolers', 'laptop-coolers'],
  'monitors': ['monitors', 'monitor', 'monitör'],
  'tvs': ['tvs', 'tv', 'televizyon'],
  'speakers': ['speakers', 'speaker', 'hoparlör'],
  'audio_systems': [
    'audio_systems',
    'audio-systems',
    'soundbars',
    'surround_systems',
    'compact_hifi',
  ],
  'av_receivers': ['av_receivers', 'av-receivers', 'hifi_receivers'],
  'media_players': ['media_players', 'media-players'],
  'camera_lenses': [
    'camera_lenses',
    'camera-lenses',
    'cameras',
    'digital_cameras',
    'video_cameras',
    'film_cameras',
    'camera_objectives',
    'lenses',
    'action_cameras',
    'security_cameras',
  ],
  'ip_cameras': ['ip_cameras', 'ip-cameras'],
  'dashcams': ['dashcams', 'dash cameras'],
  'gimbals': ['gimbals', 'gimbal'],
  'drones': ['drones', 'drone'],
  'action_cameras': ['camera_lenses', 'action_cameras', 'action-cameras'],
  'security_cameras': ['camera_lenses', 'security_cameras', 'ip-cameras'],
  'gamepads': ['gamepads', 'gamepad', 'controller', 'oyun kolu'],
  'gaming_consoles': ['gaming_consoles', 'consoles', 'console', 'oyun konsolu'],
  'consoles': ['gaming_consoles', 'consoles', 'console'],
  'printers': ['printers', 'printer', 'yazıcı'],
  '3d_printers': ['3d_printers', '3d-printers', '3d printer'],
  'webcams': ['webcams', 'webcam'],
  'microphones': ['microphones', 'microphone', 'mikrofon'],
  'mice': ['mice', 'mouse', 'fare'],
  'keyboards': ['keyboards', 'keyboard', 'klavye'],
  'network_switches': ['routers', 'network_switches', 'network-switches'],
  'wifi_routers': ['routers', 'wifi_routers', 'wifi-routers', 'router'],
  'routers': [
    'routers',
    'wifi_routers',
    'wifi-routers',
    'network_switches',
    'pcie_nic',
  ],
  'modem_routers': ['modem_routers', 'modem-routers', 'modem'],
  'pcie_nic': ['routers', 'pcie_nic', 'pcie-network-cards', 'network cards'],
  'robot_vacuums': ['robot_vacuums', 'robot-vacuums', 'robot vacuum'],
  'robot-vacuums': ['robot_vacuums', 'robot-vacuums', 'vacuums'],
  'vacuums': ['robot_vacuums', 'vacuums', 'vacuum-cleaners'],
  'hardware_wallets': ['hardware_wallets', 'hardware-wallets'],
};

const pcCategoryAliases = catalogCategoryAliases;

/// Cloud Function keyword search queries per PC component
final productsByCategoryProvider = FutureProvider.autoDispose
    .family<Result<List<ProductEntity>>, String>((ref, category) async {
      final normalizedCategory = category.toLowerCase().trim();
      final aliases =
          catalogCategoryAliases[normalizedCategory] ?? [normalizedCategory];

      // Defunct brands to suppress
      const defunctBrands = {
        'alcatel',
        'micromax',
        'karbonn',
        'lava',
        'intex',
        'xolo',
        'coolpad',
        'leeco',
        'le eco',
        'gionee',
        'panasonic mobile',
        'blackberry',
        'htc',
        'zte',
        'wiko',
        'meizu',
        'sharp mobile',
        'vernee',
        'doogee',
        'oukitel',
        'umidigi',
        'ulefone',
        'cubot',
        'homtom',
        'bluboo',
        'elephone',
        'leagoo',
        'maze',
        'nomu',
        'altus',
        'vestel',
        'casper',
        'reeder',
        'general mobile',
        'turkcell',
        'grundig',
        'beko',
        'arçelik',
        'hometech',
        'vorcom',
        'tcl mobile',
      };

      Result<List<ProductEntity>> sortAndReturn(List<ProductEntity> products) {
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
        return sortAndReturn(_categoryCacheMap[normalizedCategory]!);
      }

      // ── 2) Typesense: fetch all products for category ──
      final ds = ref.read(pbDataSourceProvider);

      for (final alias in aliases) {
        try {
          final all = await ds.getAllProductsInCategoryTs(
            category: alias,
            perPage: 250,
            maxTotal: 250,
          );
          if (all.isNotEmpty) {
            final entities = all.cast<ProductEntity>();
            _categoryCacheMap[normalizedCategory] = entities;
            debugPrint(
              'CATEGORY: TS loaded ${entities.length} products for "$alias"',
            );
            return sortAndReturn(entities);
          }
        } catch (e) {
          debugPrint('CATEGORY: TS query failed for "$alias": $e');
        }
      }

      // ── 2b) Fallback: PocketBase paginated query ──
      for (final alias in aliases) {
        try {
          final all = <ProductEntity>[];
          int page = 1;
          while (all.length < 5000) {
            final result = await ds.getProductsPage(
              category: alias,
              limit: 500,
              page: page,
            );
            all.addAll(result.products.cast<ProductEntity>());
            if (!result.hasMore || result.products.isEmpty) break;
            page = result.nextPage;
          }
          if (all.isNotEmpty) {
            _categoryCacheMap[normalizedCategory] = all;
            debugPrint(
              'CATEGORY: PB fallback loaded ${all.length} products for "$alias"',
            );
            return sortAndReturn(all);
          }
        } catch (e) {
          debugPrint('CATEGORY: PB fallback failed for "$alias": $e');
        }
      }

      // ── 3) Keyword fallback — search via datasource ──
      const keywordMap = <String, List<String>>{
        'cpus': [
          'işlemci',
          'cpu',
          'processor',
          'ryzen',
          'core i',
          'intel core',
          'amd ryzen',
        ],
        'gpus': [
          'ekran kartı',
          'gpu',
          'graphics',
          'geforce',
          'radeon',
          'rtx',
          'rx ',
        ],
        'motherboards': ['anakart', 'motherboard', 'mainboard'],
        'ram': ['ram', 'bellek', 'memory', 'ddr4', 'ddr5'],
        'ssd': ['ssd', 'nvme', 'm.2', 'solid state'],
        'psu': ['power supply', 'psu', 'güç kaynağı'],
        'cases': ['kasa', 'case', 'tower', 'chassis'],
        'coolers': ['soğutucu', 'cooler', 'fan', 'heatsink'],
        'monitors': ['monitor', 'monitör'],
        'keyboards': ['keyboard', 'klavye', 'mechanical'],
        'mice': ['mouse', 'fare', 'gaming mouse'],
        'headsets': ['headset', 'kulaklık', 'headphone'],
      };
      try {
        final keywords = keywordMap[normalizedCategory];
        if (keywords != null) {
          // Search via datasource
          final results = await ds.searchProducts(
            query: keywords.first,
            limit: 500,
          );
          if (results.isNotEmpty) {
            final filtered = results.cast<ProductEntity>().where((p) {
              final name = p.name.toLowerCase();
              final cat = p.category.toLowerCase();
              return keywords.any((k) => name.contains(k) || cat.contains(k));
            }).toList();
            if (filtered.isNotEmpty) {
              _categoryCacheMap[normalizedCategory] = filtered;
              return sortAndReturn(filtered);
            }
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
  return ref
      .read(productRepositoryProvider)
      .getTrends(country: country, category: category);
});

/// Search results (FutureProvider) - Section 10
final searchResultsProvider = FutureProvider.autoDispose
    .family<Result<List<ProductEntity>>, String>((ref, query) async {
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
            final algo = ref.read(profileAlgorithmServiceProvider);
            final behavior =
                ref.read(behaviorSignalsProvider).valueOrNull ??
                BehaviorSignals.empty;
            final fitScores = {
              for (final p in products)
                p.id: algo.calculateTotalFitScore(
                  user: user,
                  product: p,
                  behavior: behavior,
                ),
            };
            products.sort(
              (a, b) => fitScores[b.id]!.compareTo(fitScores[a.id]!),
            );
          }

          // Dedup before returning — homeFeed pool can have storage/color variants
          final deduped = deduplicateVariants(products);
          return Success(deduped.take(500).toList());
        }
        return ref.read(productRepositoryProvider).getProducts(limit: 200);
      }

      // Require at least 2 characters for search
      if (query.trim().length < 2) return const Success(<ProductEntity>[]);

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
          return queryWords.every((w) => searchable.contains(w));
        }).toList();
      }

      // ALWAYS call Cloud Function — don't short-circuit on local results
      try {
        final cloudResult = await ref
            .read(productRepositoryProvider)
            .searchProducts(query: query, limit: 100)
            .timeout(const Duration(seconds: 10));
        // Merge: deduplicate local + cloud
        final localIds = localResults.map((p) => p.id).toSet();
        final cloudProducts = cloudResult.when(
          success: (products) =>
              products.where((p) => !localIds.contains(p.id)).toList(),
          failure: (_) => <ProductEntity>[],
        );
        final merged = [...localResults, ...cloudProducts];

        // Deduplicate variants (same product, different storage/color)
        final deduped = deduplicateVariants(merged);

        // Personalize results using match score
        final user = ref.read(userProfileProvider).valueOrNull;
        if (user != null && deduped.isNotEmpty) {
          final algo = ref.read(profileAlgorithmServiceProvider);
          final behavior =
              ref.read(behaviorSignalsProvider).valueOrNull ??
              BehaviorSignals.empty;
          // Pre-compute combined score O(n) to avoid O(n log n) function calls.
          final blendedScores = <String, double>{};
          for (final p in deduped) {
            final name = p.name.toLowerCase();
            double rel = 0;
            if (name.contains(normalizedQuery)) rel += 100;
            if (name.startsWith(normalizedQuery)) rel += 30;
            if ((p.brand ?? '').toLowerCase().contains(normalizedQuery)) {
              rel += 50;
            }
            rel += p.trendScore * 5;
            final fit = algo.calculateTotalFitScore(
              user: user,
              product: p,
              behavior: behavior,
            );
            blendedScores[p.id] = rel * 0.6 + fit * 0.4;
          }
          deduped.sort(
            (a, b) => blendedScores[b.id]!.compareTo(blendedScores[a.id]!),
          );
        } else {
          // No user profile — sort by relevance only
          deduped.sort((a, b) {
            final nameA = a.name.toLowerCase();
            final nameB = b.name.toLowerCase();
            int scoreA = 0, scoreB = 0;
            if (nameA.contains(normalizedQuery)) scoreA += 100;
            if (nameB.contains(normalizedQuery)) scoreB += 100;
            if ((a.brand ?? '').toLowerCase().contains(normalizedQuery)) {
              scoreA += 50;
            }
            if ((b.brand ?? '').toLowerCase().contains(normalizedQuery)) {
              scoreB += 50;
            }
            scoreA += (a.trendScore * 10).toInt();
            scoreB += (b.trendScore * 10).toInt();
            return scoreB.compareTo(scoreA);
          });
        }

        final trimmedQuery = query.trim();
        if (trimmedQuery.length >= 2) {
          unawaited(
            ref.read(hiveDataSourceProvider).addRecentSearch(trimmedQuery),
          );
        }
        AnalyticsService.instance.logProductSearch(query, deduped.length);
        return Success(deduped.take(100).toList());
      } catch (_) {
        // Timeout — return local results if any
        if (localResults.isNotEmpty) {
          return Success(localResults.take(100).toList());
        }
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

const _homeFeedReadyCacheVersion = 'v5';

String _homeFeedReadyCacheKey(String country, UserEntity? user) {
  return 'home_feed_ready_${country.toLowerCase()}_${user?.uid ?? "anon"}_$_homeFeedReadyCacheVersion';
}

List<String> _homeFeedIds(List<ProductEntity> products) {
  return products.map((product) => product.id).toList(growable: false);
}

Map<String, dynamic> _serializeHomeFeedForCache(HomeFeed feed) {
  final productsById = <String, Map<String, dynamic>>{};
  for (final product in feed.all) {
    productsById[product.id] = ProductModel.fromEntity(product).toMap();
  }

  return {
    'productsById': productsById,
    'all': _homeFeedIds(feed.all),
    'trending': _homeFeedIds(feed.trending),
    'featured': _homeFeedIds(feed.featured),
    'newArrivals': _homeFeedIds(feed.newArrivals),
    'discover': _homeFeedIds(feed.discover),
    'priorityCategories': feed.priorityCategories,
    'byCategory': feed.byCategory.map(
      (key, value) => MapEntry(key, _homeFeedIds(value)),
    ),
  };
}

void _deferHomeFeedProductIndexUpdate(Ref ref, HomeFeed feed) {
  Future<void>.delayed(const Duration(milliseconds: 800), () {
    try {
      ref
          .read(pbDataSourceProvider)
          .setHomeFeedProducts(feed.all.whereType<ProductModel>().toList());
    } catch (_) {}
  });
}

/// Tek isolate roundtrip: raw JSON String → HomeFeed entity.
/// Daha önce ardı ardına iki compute() spawn ediliyordu
/// (jsonDecode + entity build). Tek isolate'ta birleştirildi → ~80-100ms
/// UI thread spawn maliyeti tasarrufu.
HomeFeed _buildFeedFromRawJsonIsolate(String rawJson) {
  final cached = jsonDecode(rawJson) as Map<String, dynamic>;
  final data = cached['data'] as Map<String, dynamic>?;
  if (data == null) {
    return const HomeFeed(
      trending: [],
      featured: [],
      byCategory: {},
      newArrivals: [],
      all: [],
    );
  }
  return _restoreHomeFeedFromCacheIsolate(Map<String, dynamic>.from(data));
}

HomeFeed _restoreHomeFeedFromCacheIsolate(Map<String, dynamic> raw) {
  final rawProductsById = Map<String, dynamic>.from(
    raw['productsById'] as Map? ?? const {},
  );
  final productsById = <String, ProductEntity>{
    for (final entry in rawProductsById.entries)
      entry.key: ProductModel.fromMap(
        Map<String, dynamic>.from(entry.value as Map),
      ),
  };

  List<ProductEntity> pick(String key) {
    final ids = List<String>.from(raw[key] as List? ?? const []);
    return ids
        .map((id) => productsById[id])
        .whereType<ProductEntity>()
        .toList(growable: false);
  }

  final rawByCategory = Map<String, dynamic>.from(
    raw['byCategory'] as Map? ?? const {},
  );

  return HomeFeed(
    trending: pick('trending'),
    featured: pick('featured'),
    byCategory: {
      for (final entry in rawByCategory.entries)
        entry.key: List<String>.from(entry.value as List? ?? const [])
            .map((id) => productsById[id])
            .whereType<ProductEntity>()
            .toList(growable: false),
    },
    newArrivals: pick('newArrivals'),
    discover: pick('discover'),
    all: pick('all'),
    priorityCategories: List<String>.from(
      raw['priorityCategories'] as List? ?? const [],
    ),
  );
}

class _ViewedBehaviorSnapshot {
  final Map<String, double> categoryScores;
  final Map<String, double> brandScores;

  const _ViewedBehaviorSnapshot({
    this.categoryScores = const {},
    this.brandScores = const {},
  });
}

_ViewedBehaviorSnapshot? _cachedViewedBehaviorSnapshot;
DateTime? _cachedViewedBehaviorAt;
const _viewedBehaviorCacheTtl = Duration(minutes: 5);

_ViewedBehaviorSnapshot _loadViewedBehaviorSnapshot() {
  final cachedSnapshot = _cachedViewedBehaviorSnapshot;
  final cachedAt = _cachedViewedBehaviorAt;
  if (cachedSnapshot != null &&
      cachedAt != null &&
      DateTime.now().difference(cachedAt) < _viewedBehaviorCacheTtl) {
    return cachedSnapshot;
  }

  final viewedCategoryScores = <String, double>{};
  final viewedBrandScores = <String, double>{};

  try {
    final box = Hive.box('user_data');
    if (!box.isOpen) {
      return const _ViewedBehaviorSnapshot();
    }

    final viewedRaw = box.get('viewed_products') as List<dynamic>? ?? [];
    for (var i = 0; i < viewedRaw.length; i++) {
      final item = viewedRaw[i];
      if (item is! Map) continue;

      final cat = (item['category'] as String? ?? '').toLowerCase().trim();
      final brand = (item['brand'] as String? ?? '').toLowerCase().trim();
      final recencyWeight = 1.0 / (1 + i * 0.1);

      if (cat.isNotEmpty) {
        viewedCategoryScores[cat] =
            (viewedCategoryScores[cat] ?? 0) + recencyWeight;
      }
      if (brand.isNotEmpty) {
        viewedBrandScores[brand] =
            (viewedBrandScores[brand] ?? 0) + recencyWeight;
      }
    }
  } catch (_) {
    return const _ViewedBehaviorSnapshot();
  }

  final maxCatScore = viewedCategoryScores.values.fold(
    1.0,
    (a, b) => a > b ? a : b,
  );
  final maxBrandScore = viewedBrandScores.values.fold(
    1.0,
    (a, b) => a > b ? a : b,
  );

  viewedCategoryScores.updateAll((k, v) => v / maxCatScore);
  viewedBrandScores.updateAll((k, v) => v / maxBrandScore);

  final snapshot = _ViewedBehaviorSnapshot(
    categoryScores: Map.unmodifiable(viewedCategoryScores),
    brandScores: Map.unmodifiable(viewedBrandScores),
  );
  _cachedViewedBehaviorSnapshot = snapshot;
  _cachedViewedBehaviorAt = DateTime.now();
  return snapshot;
}

// Arguments record for compute() isolate
class _HomeFeedArgs {
  final List<ProductEntity> products;
  final String country;
  final UserEntity? user;
  final List<String> hiddenIds;
  final List<String> disabledCats;
  const _HomeFeedArgs({
    required this.products,
    required this.country,
    this.user,
    this.hiddenIds = const [],
    this.disabledCats = const [],
  });
}

class _HomeFeedRawArgs {
  final List<dynamic> rawList;
  final String country;
  final UserEntity? user;
  final List<String> hiddenIds;
  final List<String> disabledCats;

  const _HomeFeedRawArgs({
    required this.rawList,
    required this.country,
    this.user,
    this.hiddenIds = const [],
    this.disabledCats = const [],
  });
}

String _homeFeedBrandKey(ProductEntity product) {
  return (product.brand ?? '').toLowerCase().trim();
}

String _homeFeedModelKey(ProductEntity product) {
  final normalizedName = normalizeProductName(product.name);
  final brand = _homeFeedBrandKey(product);
  if (brand.isNotEmpty && normalizedName.startsWith('$brand ')) {
    return normalizedName.substring(brand.length).trim();
  }
  return normalizedName;
}

List<ProductEntity> _spreadHomeFeedVariety(
  List<ProductEntity> products, {
  int recentWindow = 2,
}) {
  if (products.length < 3) return List<ProductEntity>.from(products);

  final remaining = List<ProductEntity>.from(products);
  final arranged = <ProductEntity>[];
  final recentBrands = <String>[];
  final recentModels = <String>[];

  while (remaining.isNotEmpty) {
    int chosenIndex = remaining.indexWhere((product) {
      final brand = _homeFeedBrandKey(product);
      final model = _homeFeedModelKey(product);
      return !recentBrands.contains(brand) && !recentModels.contains(model);
    });

    chosenIndex = chosenIndex >= 0
        ? chosenIndex
        : remaining.indexWhere((product) {
            final model = _homeFeedModelKey(product);
            return !recentModels.contains(model);
          });

    chosenIndex = chosenIndex >= 0
        ? chosenIndex
        : remaining.indexWhere((product) {
            final brand = _homeFeedBrandKey(product);
            return !recentBrands.contains(brand);
          });

    if (chosenIndex < 0) chosenIndex = 0;

    final selected = remaining.removeAt(chosenIndex);
    arranged.add(selected);

    recentBrands.add(_homeFeedBrandKey(selected));
    recentModels.add(_homeFeedModelKey(selected));
    if (recentBrands.length > recentWindow) recentBrands.removeAt(0);
    if (recentModels.length > recentWindow) recentModels.removeAt(0);
  }

  return arranged;
}

String _homeFeedPriceBand(num price) {
  if (price <= 0) return 'unknown';
  if (price < 200) return 'entry';
  if (price < 500) return 'value';
  if (price < 1000) return 'mid';
  if (price < 1800) return 'upper';
  return 'premium';
}

double _homeFeedSearchBoost(ProductEntity product, Set<String> searchTerms) {
  if (searchTerms.isEmpty) return 0;

  final searchable =
      '${product.name} ${product.brand ?? ''} ${product.category}'
          .toLowerCase();
  final name = product.name.toLowerCase();
  var score = 0.0;

  for (final term in searchTerms) {
    if (!searchable.contains(term)) continue;
    if (name.startsWith(term)) {
      score += 3.5;
    } else if (name.contains(term)) {
      score += 2.5;
    } else {
      score += 1.5;
    }
  }

  return score.clamp(0, 14);
}

double _homeFeedAlternativeBoost(
  ProductEntity product,
  List<ProductEntity> seeds,
  String country,
) {
  if (seeds.isEmpty) return 0;

  var bestScore = 0.0;
  for (final seed in seeds.take(10)) {
    if (product.id == seed.id) continue;
    if (product.category.toLowerCase().trim() !=
        seed.category.toLowerCase().trim()) {
      continue;
    }
    if (_homeFeedModelKey(product) == _homeFeedModelKey(seed)) {
      continue;
    }

    var score = 8.0;
    final productPrice = product.getPriceForCountry(country) ?? 0;
    final seedPrice = seed.getPriceForCountry(country) ?? 0;
    if (productPrice > 0 && seedPrice > 0) {
      final largerPrice = max(productPrice, seedPrice).toDouble();
      final diffRatio = (productPrice - seedPrice).abs() / largerPrice;
      if (diffRatio <= 0.15) {
        score += 10;
      } else if (diffRatio <= 0.30) {
        score += 7;
      } else if (diffRatio <= 0.45) {
        score += 4;
      } else if (diffRatio <= 0.60) {
        score += 2;
      } else {
        score -= 2;
      }

      if (_homeFeedPriceBand(productPrice) == _homeFeedPriceBand(seedPrice)) {
        score += 4;
      }
    }

    if (_homeFeedBrandKey(product) != _homeFeedBrandKey(seed)) {
      score += 2;
    }
    if (product.techScore >= max(seed.techScore - 15, 40)) {
      score += 2;
    }

    bestScore = max(bestScore, score);
  }

  return bestScore.clamp(0, 24);
}

Set<String> _visibleHomeShelfIds(HomeFeed feed, {int takePerSection = 12}) {
  return {
    ...feed.featured.take(4).map((product) => product.id),
    ...feed.trending.take(takePerSection).map((product) => product.id),
    ...feed.newArrivals.take(takePerSection).map((product) => product.id),
    ...feed.discover.take(takePerSection).map((product) => product.id),
  };
}

// Top-level wrapper so compute() can spawn it in a background isolate.
HomeFeed _buildHomeFeedIsolate(_HomeFeedArgs args) => _buildHomeFeed(
  args.products,
  args.country,
  user: args.user,
  hiddenIds: args.hiddenIds,
  disabledCats: args.disabledCats,
);

// Single-pass isolate path for cache hits: deserialize + build feed once.
HomeFeed _buildHomeFeedFromRawIsolate(_HomeFeedRawArgs args) {
  final products = args.rawList
      .map(
        (item) => ProductModel.fromMap(Map<String, dynamic>.from(item as Map)),
      )
      .cast<ProductEntity>()
      .toList();
  return _buildHomeFeed(
    products,
    args.country,
    user: args.user,
    hiddenIds: args.hiddenIds,
    disabledCats: args.disabledCats,
  );
}

HomeFeed _buildHomeFeed(
  List<ProductEntity> products,
  String country, {
  UserEntity? user,
  List<String> hiddenIds = const [],
  List<String> disabledCats = const [],
}) {
  final deduped = deduplicateVariants(products);
  final currentYear = DateTime.now().year;

  // ── Helper: extract release year (delegates to ProductFilter) ────────────
  int? getExactReleaseYear(ProductEntity p) =>
      ProductFilter.getExactReleaseYear(p);

  // Relaxed year: either exact or estimated (for scoring only, NOT filtering)
  int estimateYear(ProductEntity p) {
    final exact = getExactReleaseYear(p);
    if (exact != null) return exact;
    final name = p.name.toLowerCase();
    final nameYearMatch = RegExp(r'20(1[5-9]|2[0-9])').firstMatch(name);
    if (nameYearMatch != null) {
      final y = int.tryParse(nameYearMatch.group(0)!);
      if (y != null && y > 2000 && y <= currentYear + 1) return y;
    }
    final ts = p.techScore;
    if (ts >= 60) return currentYear - 1;
    if (ts >= 40) return currentYear - 3;
    if (ts >= 20) return currentYear - 5;
    return currentYear - 8;
  }

  // ── Known old product name patterns ────────────────────────────────────────
  bool isKnownOldProduct(ProductEntity p) {
    final name = p.name.toLowerCase();
    if (name.contains('360fly')) return true;
    if (name.contains('3plus') || name.contains('3 plus')) return true;
    if (RegExp(r'aspire\s*3\s*a315').hasMatch(name)) return true;
    if (name.contains('1more s1001')) return true;
    return false;
  }

  // ── HARD FILTER: year >= 2020, known brands, no old products ──────────────
  final hiddenSet = hiddenIds.toSet();
  int filteredByHidden = 0,
      filteredByOldProduct = 0,
      filteredByBrand = 0,
      filteredByYear = 0;
  final rejectedBrands = <String>{};
  var pool = deduped.where((p) {
    if (hiddenSet.contains(p.id)) {
      filteredByHidden++;
      return false;
    }
    if (isKnownOldProduct(p)) {
      filteredByOldProduct++;
      return false;
    }
    if (!ProductFilter.isAllowed(p)) {
      final brand = ProductFilter.normalizeBrand(
        (p.brand ?? '').toLowerCase().trim(),
      );
      if (ProductFilter.defunctBrands.contains(brand)) {
        filteredByBrand++;
      } else if (!ProductFilter.allowedBrands.contains(brand)) {
        filteredByBrand++;
        rejectedBrands.add(brand);
      } else {
        filteredByYear++;
      }
      return false;
    }
    return true;
  }).toList();

  if (_verboseHomeFeedDiagnostics) {
    debugPrint(
      '=== QOR AI: _buildHomeFeed pool: ${pool.length} products (from ${deduped.length} deduped, ${products.length} raw) ===',
    );
    debugPrint(
      '=== QOR AI: filtered out — hidden:$filteredByHidden oldProduct:$filteredByOldProduct brand:$filteredByBrand year:$filteredByYear total:${filteredByHidden + filteredByOldProduct + filteredByBrand + filteredByYear} ===',
    );
    if (rejectedBrands.isNotEmpty) {
      debugPrint(
        '=== QOR AI: rejected unknown brands: ${rejectedBrands.take(30).join(", ")} ===',
      );
    }
  }

  // ── Brand tier boost multiplier ────────────────────────────────────────────
  const tier1Brands = {
    'apple',
    'samsung',
    'sony',
    'asus',
    'msi',
    'lg',
    'dell',
    'hp',
    'lenovo',
    'acer',
    'google',
    'microsoft',
    'nvidia',
    'amd',
    'intel',
  };
  const tier2Brands = {
    'xiaomi',
    'huawei',
    'oneplus',
    'oppo',
    'realme',
    'honor',
    'nothing',
    'razer',
    'logitech',
    'corsair',
    'bose',
    'sennheiser',
    'jbl',
    'marshall',
    'canon',
    'nikon',
    'fujifilm',
    'dji',
    'gopro',
    'anker',
    'garmin',
    'bang & olufsen',
    'dyson',
    'steelseries',
    'hyperx',
    'benq',
    'viewsonic',
    'gigabyte',
    'asrock',
    'nzxt',
    'cooler master',
    'be quiet',
    'crucial',
    'western digital',
    'seagate',
    'kingston',
    'thermaltake',
    'evga',
    'tp-link',
    'netgear',
    'arlo',
    'ring',
    'sonos',
    'philips',
    'panasonic',
    'tcl',
    'hisense',
    'vizio',
    'roku',
    'amazon',
  };
  double brandBoost(ProductEntity p) {
    final brand = (p.brand ?? '').toLowerCase().trim();
    if (tier1Brands.contains(brand)) return 1.15;
    if (tier2Brands.contains(brand)) return 1.08;
    return 0.90;
  }

  // ── USER PROFILE PERSONALIZATION BOOST ─────────────────────────────────────
  final viewedBehavior = _loadViewedBehaviorSnapshot();
  final viewedCategoryScores = viewedBehavior.categoryScores;
  final viewedBrandScores = viewedBehavior.brandScores;

  double userBoost(ProductEntity p) {
    if (user == null) return 1.0;
    double boost = 1.0;
    final cat = p.category.toLowerCase().trim();
    final brand = (p.brand ?? '').toLowerCase().trim();

    // ── BEHAVIOR-BASED BOOST (strongest signal) ──────────────────────────
    // Recently viewed categories get significant boost
    final viewedCatScore = viewedCategoryScores[cat] ?? 0.0;
    if (viewedCatScore > 0) {
      boost *=
          1.0 + (viewedCatScore * 0.5); // Up to 1.5× for most viewed category
    }
    // Recently viewed brands get boost
    final viewedBrandScore = viewedBrandScores[brand] ?? 0.0;
    if (viewedBrandScore > 0) {
      boost *=
          1.0 + (viewedBrandScore * 0.3); // Up to 1.3× for most viewed brand
    }

    // ── PROFILE-BASED BOOST ──────────────────────────────────────────────
    // Boost products in user's interest categories
    for (final interest in user.interestCategories) {
      if (cat == interest.toLowerCase() ||
          cat.contains(interest.toLowerCase())) {
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
    if (user.ecosystem == 'android' &&
        {
          'samsung',
          'xiaomi',
          'oneplus',
          'oppo',
          'realme',
          'huawei',
          'honor',
          'nothing',
          'google',
        }.contains(brand)) {
      boost *= 1.15;
    }

    // Budget match
    final price = p.getPriceForCountry(user.country) ?? 0;
    if (price > 0) {
      switch (user.budgetRange) {
        case 'low':
          if (price < 300) {
            boost *= 1.2;
          } else if (price > 1000) {
            boost *= 0.7;
          }
          break;
        case 'mid':
          if (price >= 200 && price <= 800) boost *= 1.15;
          break;
        case 'high':
          if (price >= 500 && price <= 2000) boost *= 1.15;
          break;
        case 'premium':
          if (price >= 800) {
            boost *= 1.2;
          } else if (price < 300) {
            boost *= 0.7;
          }
          break;
      }
    }

    // Profession-based category affinity
    final profCats = <String, List<String>>{
      'student': [
        'laptops',
        'tablets',
        'headphones',
        'e-readers',
        'smartphones',
      ],
      'engineer': ['laptops', 'monitors', 'keyboards', 'mice', 'gpus', 'cpus'],
      'designer': ['laptops', 'monitors', 'tablets', 'cameras', 'mice'],
      'developer': [
        'laptops',
        'monitors',
        'keyboards',
        'mice',
        'desktops',
        'routers',
      ],
      'content_creator': [
        'cameras',
        'microphones',
        'monitors',
        'laptops',
        'gimbals',
        'tripods',
      ],
      'video_editor': ['monitors', 'laptops', 'microphones', 'headphones'],
      'photographer': ['cameras', 'lenses', 'tripods', 'gimbals', 'monitors'],
      'gamer': [
        'gpus',
        'monitors',
        'keyboards',
        'mice',
        'headphones',
        'gamepads',
        'desktops',
      ],
      'manager': ['smartphones', 'laptops', 'smartwatches', 'tablets'],
      'product_manager': ['laptops', 'smartphones', 'tablets', 'monitors'],
      'entrepreneur': ['smartphones', 'laptops', 'tablets', 'monitors'],
      'healthcare': ['tablets', 'smartwatches', 'smartphones'],
      'educator': ['laptops', 'tablets', 'projectors', 'webcams'],
      'teacher': ['laptops', 'tablets', 'projectors', 'webcams'],
      'finance': ['laptops', 'monitors', 'smartphones'],
      'data_analyst': ['laptops', 'monitors', 'tablets', 'keyboards'],
      'architect': ['monitors', 'laptops', 'tablets', 'gpus', 'desktops'],
      'sales_marketing': ['smartphones', 'laptops', 'tablets', 'cameras'],
      'lawyer': ['laptops', 'tablets', 'smartphones', 'headphones'],
      'researcher': ['laptops', 'tablets', 'e-readers', 'monitors'],
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
  final scoreCache = <String, double>{};
  double youtubeScore(ProductEntity p) => scoreCache.putIfAbsent(p.id, () {
    final engagement = (p.trendScore / 10.0).clamp(0.0, 1.0);

    final year = estimateYear(p);
    final yearDiff = currentYear - year;
    double recency;
    if (yearDiff <= 0) {
      recency = 1.00;
    } else if (yearDiff == 1) {
      recency = 0.95;
    } else if (yearDiff == 2) {
      recency = 0.80;
    } else if (yearDiff == 3) {
      recency = 0.55;
    } else if (yearDiff == 4) {
      recency = 0.30;
    } else if (yearDiff <= 6) {
      recency = 0.15;
    } else {
      recency = 0.05;
    }

    if (p.createdAt != null) {
      final daysSinceCreated = DateTime.now().difference(p.createdAt!).inDays;
      if (daysSinceCreated < 90) {
        recency = (recency + 0.15).clamp(0.0, 1.0);
      } else if (daysSinceCreated < 180) {
        recency = (recency + 0.08).clamp(0.0, 1.0);
      }
    }

    final quality = (p.techScore / 100.0).clamp(0.0, 1.0);
    return ((engagement * 0.30) + (recency * 0.30) + (quality * 0.25) + 0.15) *
        brandBoost(p) *
        userBoost(p);
  });

  // ── By category: scored, top 60 each with brand diversity ─────────────────
  final byCategory = <String, List<ProductEntity>>{};
  for (final p in pool) {
    final cat = p.category.toLowerCase().trim();
    if (cat.isNotEmpty) byCategory.putIfAbsent(cat, () => []).add(p);
  }

  if (_verboseHomeFeedDiagnostics) {
    debugPrint('=== QOR AI: byCategory keys: ${byCategory.keys.join(",")} ===');
    for (final e in byCategory.entries) {
      debugPrint('=== QOR AI:   ${e.key}: ${e.value.length} products ===');
    }
  }

  // Remove admin-disabled categories
  if (disabledCats.isNotEmpty) {
    final disabledSet = disabledCats.map((c) => c.toLowerCase().trim()).toSet();
    byCategory.removeWhere((key, _) => disabledSet.contains(key));
  }

  // Sort by score and enforce brand diversity (max 6 per brand per category)
  for (final cat in byCategory.keys.toList()) {
    final all = byCategory[cat]!;
    all.sort((a, b) => youtubeScore(b).compareTo(youtubeScore(a)));

    final brandCount = <String, int>{};
    final diverse = <ProductEntity>[];
    for (final p in all) {
      final brand = (p.brand ?? '').toLowerCase().trim();
      final count = brandCount[brand] ?? 0;
      if (count < 6) {
        diverse.add(p);
        brandCount[brand] = count + 1;
      }
      if (diverse.length >= 80) break;
    }
    if (_verboseHomeFeedDiagnostics) {
      debugPrint(
        '=== QOR AI:   $cat: ${all.length} total → ${diverse.length} after diversity (brands: ${brandCount.entries.map((e) => '${e.key}:${e.value}').join(', ')}) ===',
      );
    }
    byCategory[cat] = _spreadHomeFeedVariety(diverse);
  }

  // ── TRENDING: YouTube-style top products (max 2 per brand, 3 per category) ─
  final allScored =
      pool.map((p) => (product: p, score: youtubeScore(p))).toList()
        ..sort((a, b) => b.score.compareTo(a.score));

  final trendingCatCount = <String, int>{};
  final trendingBrandCount = <String, int>{};
  final trending = <ProductEntity>[];
  for (final s in allScored) {
    final cat = s.product.category.toLowerCase().trim();
    final brand = (s.product.brand ?? '').toLowerCase().trim();
    const nicheCategories = {
      'dashcams',
      'gimbals',
      'tripods',
      'lenses',
      'soundbars',
    };
    if (nicheCategories.contains(cat) && trending.length > 40) continue;
    final catCount = trendingCatCount[cat] ?? 0;
    final brandCnt = trendingBrandCount[brand] ?? 0;
    if (catCount < 5 && brandCnt < 3) {
      trending.add(s.product);
      trendingCatCount[cat] = catCount + 1;
      trendingBrandCount[brand] = brandCnt + 1;
    }
    if (trending.length >= 100) break;
  }
  final diversifiedTrending = _spreadHomeFeedVariety(trending);

  // ── FEATURED: Best product per mainstream category (unique brands) ────────
  final featured = <ProductEntity>[];
  final seenBrands = <String>{};
  // Prioritize user's interest categories first
  final userInterests =
      user?.interestCategories.map((c) => c.toLowerCase().trim()).toList() ??
      [];
  final featuredCategoriesBase = [
    'smartphones',
    'laptops',
    'tablets',
    'headphones',
    'smartwatches',
    'gpus',
    'monitors',
    'cameras',
    'speakers',
    'tvs',
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
  final diversifiedFeatured = _spreadHomeFeedVariety(featured);

  // ── NEW ARRIVALS: recent products with decent quality ─────────────────────
  // Prefer createdAt for genuinely new additions to the database
  final now = DateTime.now();
  var arrivalCandidates = allScored.where((s) {
    final p = s.product;
    // Truly new: added to DB in last 6 months
    if (p.createdAt != null && now.difference(p.createdAt!).inDays < 180) {
      return true;
    }
    // Fallback: estimated recent release with decent quality
    return estimateYear(p) >= currentYear - 1 && p.techScore >= 20;
  }).toList();
  if (arrivalCandidates.length < 10) {
    arrivalCandidates = allScored
        .where((s) => estimateYear(s.product) >= currentYear - 2)
        .take(200)
        .toList();
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
    if (newArrivals.length >= 50) break;
  }
  final diversifiedNewArrivals = _spreadHomeFeedVariety(newArrivals);

  // ── DISCOVER: High-quality hidden gems — products NOT in trending/featured ──
  final trendingIds = trending.map((p) => p.id).toSet();
  final featuredIds = featured.map((p) => p.id).toSet();
  final arrivalIds = newArrivals.map((p) => p.id).toSet();
  final shownIds = {...trendingIds, ...featuredIds, ...arrivalIds};

  final discoverCandidates = allScored
      .where(
        (s) => !shownIds.contains(s.product.id) && s.product.techScore >= 10,
      )
      .toList();
  if (discoverCandidates.length < 10) {
    discoverCandidates.addAll(
      allScored
          .where(
            (s) =>
                !shownIds.contains(s.product.id) &&
                !discoverCandidates.any((d) => d.product.id == s.product.id),
          )
          .toList(),
    );
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
  final diversifiedDiscover = _spreadHomeFeedVariety(discover);
  final diversifiedAll = _spreadHomeFeedVariety(
    allScored.map((entry) => entry.product).toList(),
    recentWindow: 3,
  );

  // Build priority category list based on behavior + profile
  // Only include categories with at least 4 products
  bool hasSufficientProducts(String cat) => (byCategory[cat]?.length ?? 0) >= 4;

  final priorityCats = <String>[];
  // First: categories from behavior (most viewed first)
  final sortedViewedCats = viewedCategoryScores.entries.toList()
    ..sort((a, b) => b.value.compareTo(a.value));
  for (final e in sortedViewedCats) {
    if (byCategory.containsKey(e.key) &&
        hasSufficientProducts(e.key) &&
        !priorityCats.contains(e.key)) {
      priorityCats.add(e.key);
    }
  }
  // Then: explicit user intent / profile categories
  if (user != null) {
    if (user.primaryCategory != null) {
      final primary = user.primaryCategory!.toLowerCase().trim();
      if (byCategory.containsKey(primary) &&
          hasSufficientProducts(primary) &&
          !priorityCats.contains(primary)) {
        priorityCats.insert(0, primary);
      }
    }

    final boostedCats = <String>[
      ...ProfileAlgorithmService.categoriesForUsageIntent(user.usageIntent),
      ...ProfileAlgorithmService.categoriesForProfession(user.profession),
      if (user.priorities.contains('gaming'))
        ...ProfileAlgorithmService.gamingFocusedCategories,
      if (user.priorities.contains('creator'))
        ...ProfileAlgorithmService.creatorFocusedCategories,
      if (user.priorities.contains('productivity'))
        ...ProfileAlgorithmService.productivityFocusedCategories,
    ];
    for (final boosted in boostedCats) {
      final cat = boosted.toLowerCase().trim();
      if (byCategory.containsKey(cat) &&
          hasSufficientProducts(cat) &&
          !priorityCats.contains(cat)) {
        priorityCats.add(cat);
      }
    }

    for (final interest in user.interestCategories) {
      final cat = interest.toLowerCase().trim();
      if (byCategory.containsKey(cat) &&
          hasSufficientProducts(cat) &&
          !priorityCats.contains(cat)) {
        priorityCats.add(cat);
      }
    }
  }
  // Finally: remaining categories by product count
  for (final cat in byCategory.keys) {
    if (!priorityCats.contains(cat) && hasSufficientProducts(cat)) {
      priorityCats.add(cat);
    }
  }

  if (_verboseHomeFeedDiagnostics) {
    debugPrint(
      '=== QOR AI: homeFeed built — cats:${byCategory.keys.join(",")} '
      'newArrivals:${newArrivals.length} trending:${trending.length} discover:${discover.length} ===',
    );
  }

  return HomeFeed(
    trending: diversifiedTrending,
    featured: diversifiedFeatured,
    byCategory: byCategory,
    newArrivals: diversifiedNewArrivals,
    discover: diversifiedDiscover,
    all: diversifiedAll,
    priorityCategories: priorityCats,
  );
}

// Current non-empty PocketBase technology categories. Home feed tries the live
// categories collection first; this is the offline/fallback order.
const _feedCategories = [
  'smartphones',
  'smartwatches',
  'smart_rings',
  'headphones',
  'powerbanks',
  'chargers',
  'laptops',
  'desktops',
  'tablets',
  'e_readers',
  'vr_headsets',
  'graphics_cards',
  'cpus',
  'motherboards',
  'ram',
  'ssd',
  'psu',
  'pc_cases',
  'ups',
  'flash_drives',
  'cpu_coolers',
  'laptop_coolers',
  'case_fans',
  'keyboards',
  'mice',
  'gamepads',
  'gaming_consoles',
  'webcams',
  'microphones',
  'printers',
  '3d_printers',
  'monitors',
  'tvs',
  'projectors',
  'speakers',
  'audio_systems',
  'av_receivers',
  'media_players',
  'camera_lenses',
  'ip_cameras',
  'dashcams',
  'gimbals',
  'drones',
  'routers',
  'modem_routers',
  'robot_vacuums',
  'hardware_wallets',
];

/// In-memory feed cache for instant access across providers
HomeFeed? _inMemoryFeed;
final Set<String> _legacyFeedCacheCleanupUsers = <String>{};

/// Clear in-memory feed cache (called from pull-to-refresh)
void clearInMemoryFeedCache() {
  _inMemoryFeed = null;
  _cachedViewedBehaviorSnapshot = null;
  _cachedViewedBehaviorAt = null;
}

Future<void> invalidateProductCatalogCaches(
  WidgetRef ref, {
  bool clearPersistent = false,
}) async {
  clearInMemoryFeedCache();
  _categoryCacheMap.clear();
  _pendingFeedFetch = null;
  _isRefreshingFeed = false;
  ref.read(pbDataSourceProvider).clearProductRuntimeCaches();

  if (clearPersistent) {
    final cache = ref.read(cacheServiceProvider);
    final country = ref.read(selectedCountryProvider);
    final user = ref.read(userProfileProvider).valueOrNull;
    final owners = <String>{user?.uid ?? 'anon', 'anon'};
    for (final owner in owners) {
      await cache.delete('home_feed_v30_$owner');
      await cache.delete('home_feed_v31_$owner');
      await cache.delete('home_feed_v32_$owner');
      await cache.delete('home_feed_v33_$owner');
      await cache.delete(
        'home_feed_ready_${country.toLowerCase()}_${owner}_v2',
      );
      await cache.delete(
        'home_feed_ready_${country.toLowerCase()}_${owner}_v3',
      );
      await cache.delete(
        'home_feed_ready_${country.toLowerCase()}_${owner}_v4',
      );
      await cache.delete(
        'home_feed_ready_${country.toLowerCase()}_${owner}_v5',
      );
    }
  }

  ref.invalidate(homeFeedProvider);
}

/// Update an already-cached product in the in-memory feed with fresh data
/// fetched from detail screen. Keeps tech/trend scores in sync between
/// home cards and detail view without forcing a full re-index.
void updateInMemoryProduct(ProductEntity fresh) {
  final feed = _inMemoryFeed;
  if (feed == null) return;

  ProductEntity mergeFromFresh(ProductEntity existing) {
    if (existing.id != fresh.id) return existing;
    return existing.copyWith(
      techScore: fresh.techScore,
      trendScore: fresh.trendScore,
      techSubscores: fresh.techSubscores,
      prices: fresh.prices,
      ratings: fresh.ratings,
    );
  }

  List<ProductEntity> mapList(List<ProductEntity> list) =>
      list.map(mergeFromFresh).toList(growable: false);

  final updated = HomeFeed(
    trending: mapList(feed.trending),
    featured: mapList(feed.featured),
    byCategory: {
      for (final e in feed.byCategory.entries) e.key: mapList(e.value),
    },
    newArrivals: mapList(feed.newArrivals),
    discover: mapList(feed.discover),
    all: mapList(feed.all),
    priorityCategories: feed.priorityCategories,
  );
  _inMemoryFeed = updated;
}

void _scheduleLegacyFeedCacheCleanup(CacheService cache, UserEntity? user) {
  final cacheOwner = user?.uid ?? 'anon';
  if (!_legacyFeedCacheCleanupUsers.add(cacheOwner)) return;

  for (final ver in const [
    'v17_modern',
    'v18',
    'v19',
    'v20',
    'v21',
    'v22',
    'v23',
    'v24',
    'v25',
    'v26',
    'v27',
    'v28',
    'v29',
    'v30',
    'v31',
    'v32',
  ]) {
    final key = ver == 'v17_modern'
        ? 'home_feed_$ver'
        : 'home_feed_${ver}_$cacheOwner';
    unawaited(cache.delete(key));
  }
}

/// Flag to prevent concurrent background refreshes
bool _isRefreshingFeed = false;

bool _adminConfigUnsupported = false;

/// Completer to prevent concurrent first-time network fetches
Completer<HomeFeed>? _pendingFeedFetch;

final homeFeedProvider = FutureProvider<HomeFeed>((ref) async {
  ref.watch(selectedCountryProvider);
  final country = ref.read(selectedCountryProvider);
  final repo = ref.read(productRepositoryProvider);
  final cache = ref.read(cacheServiceProvider);
  final user = ref.read(userProfileProvider).valueOrNull;
  final readyCacheKey = _homeFeedReadyCacheKey(country, user);
  final feedSw = Stopwatch()..start();
  debugPrint(
    '=== QOR AI: homeFeedProvider — start (user: ${user?.uid ?? "anon"}) ===',
  );

  // 0. In-memory cache (instant, < 1ms) — survives tab switches.
  // Bu yol app içi navigasyonda kullanılır; cold start'ta atlanır.
  if (_inMemoryFeed != null && _inMemoryFeed!.all.isNotEmpty) {
    debugPrint(
      '=== QOR AI: homeFeed from IN-MEMORY: ${_inMemoryFeed!.all.length} products in ${feedSw.elapsedMilliseconds}ms ===',
    );
    return _inMemoryFeed!;
  }

  // ── Cold start frame guard ────────────────────────────────────────────────
  // Provider'ın geri kalanı (Hive read + isolate spawn + side-effects) UI'in
  // ilk frame'i ekrana gelene kadar BEKLER. Aksi halde HomeScreen build'iyle
  // eşzamanlı olarak compute() spawn'u UI thread'e ~80-100ms binerek ilk
  // paint'i geciktiriyordu. endOfFrame zaten paint olduysa anında resolve
  // olur (no-op) → app içi navigasyonda gecikme yok.
  await SchedulerBinding.instance.endOfFrame;

  // Cache key includes user UID for personalized feeds
  final cacheKey = 'home_feed_v33_${user?.uid ?? "anon"}';
  _scheduleLegacyFeedCacheCleanup(cache, user);

  // Start admin config fetch CONCURRENTLY (don't block product loading)
  final configFuture = _fetchAdminConfig();

  // 0.5 Ready-feed cache: tek isolate roundtrip ile raw JSON → HomeFeed.
  // Eski yol iki ayrı compute() spawn ediyordu (decode + entity build).
  try {
    final rawResult = await cache.getLocalRawStaleAsync(readyCacheKey);
    final rawJson = rawResult.raw;
    if (rawJson != null) {
      final sw = Stopwatch()..start();
      final feed = await compute(_buildFeedFromRawJsonIsolate, rawJson);
      sw.stop();
      debugPrint(
        '=== QOR AI: homeFeed from READY cache (stale=${rawResult.isStale}): ${feed.all.length} products in ${sw.elapsedMilliseconds}ms ===',
      );
      _inMemoryFeed = feed;

      // Side-effect'leri post-build'e ertele: provider önce HomeFeed'i
      // dönsün → UI rebuild olsun → ardından PB data source güncellensin.
      // Aksi halde return'den önce UI thread'i ek ~10-30ms blokluyordu.
      _deferHomeFeedProductIndexUpdate(ref, feed);

      debugPrint(
        '=== QOR AI: homeFeed READY (ready-cache path) in ${feedSw.elapsedMilliseconds}ms ===',
      );

      if (rawResult.isStale && !_isRefreshingFeed) {
        final config = await _awaitFastFeedConfig(configFuture);
        _isRefreshingFeed = true;
        _backgroundRefreshFeed(
          ref,
          repo,
          cache,
          country,
          user,
          cacheKey,
          readyCacheKey,
          config.pinnedIds,
          config.hiddenIds,
          config.disabledCats,
        ).whenComplete(() {
          _isRefreshingFeed = false;
        });
      }

      return feed;
    }
  } catch (e) {
    debugPrint('=== QOR AI: ready cache read error: $e ===');
  }

  // 1. STALE-WHILE-REVALIDATE: Show cached data instantly, even if expired
  try {
    // Use async variant to decode JSON in a background isolate — prevents the
    // main thread from blocking for hundreds of milliseconds on low-end devices.
    final staleResult = await cache.getLocalStaleAsync<List<dynamic>>(cacheKey);
    if (staleResult.data != null && (staleResult.data as List).isNotEmpty) {
      final sw = Stopwatch()..start();
      final rawList = staleResult.data as List;
      // Keep the cached-first path responsive even if admin config is slow.
      final config = await _awaitFastFeedConfig(configFuture);
      final feed = await compute(
        _buildHomeFeedFromRawIsolate,
        _HomeFeedRawArgs(
          rawList: rawList,
          country: country,
          user: user,
          hiddenIds: config.hiddenIds,
          disabledCats: config.disabledCats,
        ),
      );
      sw.stop();
      debugPrint(
        '=== QOR AI: homeFeed from HIVE cache (stale=${staleResult.isStale}): ${feed.all.length} products in ${sw.elapsedMilliseconds}ms ===',
      );
      _inMemoryFeed = feed;
      // Side-effects → post-build (microtask kuyruğu UI paint sonrasında işlenir).
      Future<void>.delayed(const Duration(milliseconds: 800), () {
        _deferHomeFeedProductIndexUpdate(ref, feed);
        _saveReadyFeedToCache(cache, feed, readyCacheKey);
      });

      debugPrint(
        '=== QOR AI: homeFeed READY (cache path) in ${feedSw.elapsedMilliseconds}ms ===',
      );

      // If stale, trigger background refresh (fire-and-forget)
      if (staleResult.isStale && !_isRefreshingFeed) {
        _isRefreshingFeed = true;
        _backgroundRefreshFeed(
          ref,
          repo,
          cache,
          country,
          user,
          cacheKey,
          readyCacheKey,
          config.pinnedIds,
          config.hiddenIds,
          config.disabledCats,
        ).whenComplete(() {
          _isRefreshingFeed = false;
        });
      }

      return feed;
    }
  } catch (e) {
    debugPrint('=== QOR AI: Hive cache read error: $e ===');
  }

  // 2. No cache at all — fetch from network (first-time load)
  // Use Completer to prevent duplicate concurrent network fetches
  if (_pendingFeedFetch != null) {
    debugPrint('=== QOR AI: homeFeed — joining existing network fetch ===');
    return _pendingFeedFetch!.future;
  }
  _pendingFeedFetch = Completer<HomeFeed>();
  try {
    final config = await configFuture;
    final feed = await _fetchFeedFromNetwork(
      ref,
      repo,
      cache,
      country,
      user,
      cacheKey,
      readyCacheKey,
      config.pinnedIds,
      config.hiddenIds,
      config.disabledCats,
    );
    debugPrint(
      '=== QOR AI: homeFeed READY (network path) in ${feedSw.elapsedMilliseconds}ms ===',
    );
    _pendingFeedFetch!.complete(feed);
    _pendingFeedFetch = null;
    return feed;
  } catch (e) {
    _pendingFeedFetch!.completeError(e);
    _pendingFeedFetch = null;
    rethrow;
  }
});

/// Admin feed config (fetched concurrently with product loading)
class _FeedConfig {
  final List<String> pinnedIds;
  final List<String> hiddenIds;
  final List<String> disabledCats;
  const _FeedConfig({
    this.pinnedIds = const [],
    this.hiddenIds = const [],
    this.disabledCats = const [],
  });
}

Future<_FeedConfig> _awaitFastFeedConfig(
  Future<_FeedConfig> configFuture,
) async {
  try {
    return await configFuture.timeout(
      const Duration(milliseconds: 250),
      onTimeout: () => const _FeedConfig(),
    );
  } catch (_) {
    return const _FeedConfig();
  }
}

bool _isPublicConfigUnavailableError(Object error) {
  final text = error.toString().toLowerCase();
  return text.contains('missing collection context') ||
      (text.contains('statuscode: 404') &&
          text.contains('/api/collections/public_config'));
}

Future<_FeedConfig> _fetchAdminConfig() async {
  if (_adminConfigUnsupported) return const _FeedConfig();

  try {
    final record = await pb
        .collection('public_config')
        .getFirstListItem('key = "algorithm"')
        .timeout(const Duration(seconds: 5));
    final data = record.data;
    return _FeedConfig(
      pinnedIds: List<String>.from(data['pinnedProducts'] ?? []),
      hiddenIds: List<String>.from(data['hiddenProducts'] ?? []),
      disabledCats: List<String>.from(data['disabledCategories'] ?? []),
    );
  } catch (error) {
    if (_isPublicConfigUnavailableError(error)) {
      _adminConfigUnsupported = true;
    }
  }
  return const _FeedConfig();
}

/// Background refresh: fetch fresh data and update cache silently
Future<void> _backgroundRefreshFeed(
  Ref ref,
  ProductRepository repo,
  CacheService cache,
  String country,
  UserEntity? user,
  String cacheKey,
  String readyCacheKey,
  List<String> pinnedIds,
  List<String> hiddenIds,
  List<String> disabledCats,
) async {
  debugPrint('=== QOR AI: Background feed refresh started ===');
  try {
    final products = await _fetchAllProducts(
      repo,
      user,
      disabledCats,
      pinnedIds,
    );
    if (products.isNotEmpty &&
        products.length > (_inMemoryFeed?.all.length ?? 0) * 0.5) {
      _saveProductsToCache(cache, products, cacheKey);
      ref
          .read(pbDataSourceProvider)
          .setHomeFeedProducts(products.whereType<ProductModel>().toList());
      _inMemoryFeed = await compute(
        _buildHomeFeedIsolate,
        _HomeFeedArgs(
          products: products,
          country: country,
          user: user,
          hiddenIds: hiddenIds,
          disabledCats: disabledCats,
        ),
      );
      _saveReadyFeedToCache(cache, _inMemoryFeed!, readyCacheKey);
      debugPrint(
        '=== QOR AI: Background refresh done: ${products.length} products ===',
      );
    }
  } catch (e) {
    debugPrint('=== QOR AI: Background refresh error: $e ===');
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
  String readyCacheKey,
  List<String> pinnedIds,
  List<String> hiddenIds,
  List<String> disabledCats,
) async {
  debugPrint('=== QOR AI: homeFeed — first-time network fetch ===');

  final products = await _fetchAllProducts(repo, user, disabledCats, pinnedIds);

  if (products.isEmpty) {
    debugPrint('=== QOR AI: homeFeed EMPTY — all queries returned 0 docs ===');
    return const HomeFeed(
      trending: [],
      featured: [],
      byCategory: {},
      newArrivals: [],
      all: [],
    );
  }

  debugPrint(
    '=== QOR AI: Building feed from ${products.length} products... ===',
  );

  // Save to cache asynchronously — don't block feed building
  Future.microtask(() => _saveProductsToCache(cache, products, cacheKey));

  ref
      .read(pbDataSourceProvider)
      .setHomeFeedProducts(products.whereType<ProductModel>().toList());
  debugPrint('=== QOR AI: setHomeFeedProducts done, building HomeFeed... ===');
  final feed = await compute(
    _buildHomeFeedIsolate,
    _HomeFeedArgs(
      products: products,
      country: country,
      user: user,
      hiddenIds: hiddenIds,
      disabledCats: disabledCats,
    ),
  );
  _inMemoryFeed = feed;
  Future.microtask(() => _saveReadyFeedToCache(cache, feed, readyCacheKey));
  debugPrint(
    '=== QOR AI: HomeFeed built — trending:${feed.trending.length} cats:${feed.byCategory.length} all:${feed.all.length} ===',
  );
  return feed;
}

/// Core product fetching: TYPESENSE multi_search (all categories in ONE request)
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

  // Keep first-load payload lighter to reduce startup jank on low/mid devices,
  // but take the category order from PocketBase whenever it is available so
  // newly added scraper categories become visible without shipping a new app.
  final categories = await _resolveHomeFeedCategories(repo, disabledCats);
  if (_verboseHomeFeedFetchLogs) {
    debugPrint(
      '=== QOR AI: TS MULTI-CAT fetch — ${categories.length} categories, $_homeFeedInitialPerCategory each ===',
    );
  }

  try {
    final tsResult = await repo
        .getProductsMultiCategoryTs(
          categories: categories,
          perCategory: _homeFeedInitialPerCategory,
        )
        .timeout(const Duration(seconds: 15));

    switch (tsResult) {
      case Success(data: final catMap):
        for (final cat in categories) {
          final products = catMap[cat] ?? [];
          if (_verboseHomeFeedFetchLogs) {
            debugPrint('=== QOR AI: CAT $cat: ${products.length} products ===');
          }
          addProducts(products);
        }
      default:
        if (_verboseHomeFeedFetchLogs) {
          debugPrint(
            '=== QOR AI: TS MULTI-CAT failed, falling back to PocketBase ===',
          );
        }
    }
  } catch (e) {
    if (_verboseHomeFeedFetchLogs) {
      debugPrint('=== QOR AI: TS MULTI-CAT error: $e ===');
    }
  }

  // Fallback to PocketBase if Typesense returned nothing
  if (allProducts.isEmpty) {
    if (_verboseHomeFeedFetchLogs) {
      debugPrint('=== QOR AI: TS empty, falling back to PB parallel fetch ===');
    }
    try {
      final futures = categories.map(
        (cat) => repo
            .getProducts(
              category: cat,
              limit: _homeFeedInitialPerCategory,
              orderBy: 'techScore',
              descending: true,
            )
            .timeout(const Duration(seconds: 45))
            .catchError((_) => const Success<List<ProductEntity>>([])),
      );
      final results = await Future.wait(futures.toList());
      for (var j = 0; j < results.length; j++) {
        switch (results[j]) {
          case Success(data: final products):
            addProducts(products);
          default:
            break;
        }
      }
    } catch (_) {}
  }

  if (_verboseHomeFeedFetchLogs) {
    debugPrint(
      '=== QOR AI: MULTI-CAT got ${allProducts.length} products in ${sw.elapsedMilliseconds}ms ===',
    );
  }

  // Fetch pinned products
  if (pinnedIds.isNotEmpty) {
    final missingPinned = pinnedIds
        .where((id) => !seenIds.contains(id))
        .toList();
    if (missingPinned.isNotEmpty) {
      try {
        final pinnedResult = await repo
            .getProductsByIds(missingPinned)
            .timeout(const Duration(seconds: 8));
        switch (pinnedResult) {
          case Success(data: final products):
            addProducts(products);
          default:
            break;
        }
      } catch (_) {}
    }
  }

  sw.stop();
  if (_verboseHomeFeedFetchLogs) {
    debugPrint(
      '=== QOR AI: Total: ${allProducts.length} products in ${sw.elapsedMilliseconds}ms ===',
    );
  }
  return allProducts;
}

Future<List<String>> _resolveHomeFeedCategories(
  ProductRepository repo,
  List<String> disabledCats,
) async {
  // Use the hardcoded `_feedCategories` directly. Previously we hit PB's
  // `categories` collection on every cold start and ranked by `productCount`,
  // which added up to 5s before the TS multi-cat fetch could even start.
  // The counters drift (same root cause as commit 360c174e41 for HomeScreen)
  // and the ordering they produced rarely beat the curated default — paying
  // the round-trip just to filter on `isActive && productCount > 0` was pure
  // cold-start latency for no UX gain.
  final disabled = disabledCats.map((c) => c.toLowerCase().trim()).toSet();
  final seen = <String>{};
  return _feedCategories
      .map((id) => id.toLowerCase().trim())
      .where((id) => id.isNotEmpty && !disabled.contains(id))
      .where(seen.add)
      .take(_homeFeedInitialCategoryCount)
      .toList(growable: false);
}

void _saveProductsToCache(
  CacheService cache,
  List<ProductEntity> products,
  String cacheKey,
) {
  try {
    final maps = products
        .map((p) => ProductModel.fromEntity(p).toMap())
        .toList();
    cache.setLocal(cacheKey, maps, duration: const Duration(hours: 12));
  } catch (_) {}
}

void _saveReadyFeedToCache(
  CacheService cache,
  HomeFeed feed,
  String readyCacheKey,
) {
  try {
    final raw = _serializeHomeFeedForCache(feed);
    cache.setLocal(readyCacheKey, raw, duration: const Duration(hours: 12));
  } catch (_) {}
}

AsyncValue<T> _mapHomeFeed<T>(Ref ref, T Function(HomeFeed feed) selector) {
  final feed = ref.watch(homeFeedProvider);
  return feed.whenData(selector);
}

/// Convenience: trending products derived from home feed
final trendingProductsProvider = Provider<AsyncValue<List<ProductEntity>>>(
  (ref) => _mapHomeFeed(ref, (feed) => feed.trending),
);

/// Convenience: featured products derived from home feed
final featuredProductsProvider = Provider<AsyncValue<List<ProductEntity>>>(
  (ref) => _mapHomeFeed(ref, (feed) => feed.featured),
);

/// Convenience: new arrivals derived from home feed
final newArrivalsProvider = Provider<AsyncValue<List<ProductEntity>>>(
  (ref) => _mapHomeFeed(ref, (feed) => feed.newArrivals),
);

/// Convenience: discover products derived from home feed (hidden gems)
final discoverProductsProvider = Provider<AsyncValue<List<ProductEntity>>>(
  (ref) => _mapHomeFeed(ref, (feed) => feed.discover),
);

/// Category cover photos derived from home feed (no extra queries)
final categoryCoversProvider = Provider<AsyncValue<Map<String, String>>>((ref) {
  return _mapHomeFeed(ref, (feed) {
    final covers = <String, String>{};
    for (final entry in feed.byCategory.entries) {
      if (entry.value.isNotEmpty) {
        final best = entry.value.firstWhere(
          (p) => p.imageURL.isNotEmpty,
          orElse: () => entry.value.first,
        );
        if (best.imageURL.isNotEmpty) {
          covers[entry.key] = best.imageURL;
        }
      }
    }
    return covers;
  });
});

/// Daily AI trending provider — daily queries Gemini for the most searched tech products,
/// matches with Firestore products and returns them. Cached in Firestore (24 hours).
final aiDailyTrendingProvider = FutureProvider<List<ProductEntity>>((
  ref,
) async {
  final repo = ref.read(productRepositoryProvider);

  // 1. Check PocketBase cache
  try {
    final cacheRecord = await pb
        .collection('public_config')
        .getFirstListItem('key = "trending_daily"')
        .timeout(const Duration(seconds: 5));
    final data = cacheRecord.data;
    final lastUpdated = DateTime.tryParse(
      data['lastUpdated']?.toString() ?? '',
    );
    final cachedIds = List<String>.from(data['productIds'] ?? []);
    if (lastUpdated != null &&
        DateTime.now().difference(lastUpdated).inHours < 24 &&
        cachedIds.isNotEmpty) {
      final result = await repo.getProductsByIds(cachedIds);
      return result.when(success: (p) => p, failure: (_) => []);
    }
  } catch (_) {}

  // 2. Load products from shared home feed (no extra Firestore query)
  final feed = await ref.read(homeFeedProvider.future);
  final allProducts = feed.all;
  if (allProducts.isEmpty) return allProducts;

  // 3. Call Gemini via PB proxy to get trending tech product types
  try {
    final dio = Dio();
    const prompt =
        '''List the top 10 most searched and trending consumer technology products right now in 2025.
Return ONLY a JSON array of product name keywords (short, search-friendly). Example: ["iPhone 16 Pro", "Samsung Galaxy S25", "MacBook Air M4"]
Return only the JSON array, no explanation.''';

    final response = await dio.post(
      '$kPbBaseUrl/api/ai/gemini',
      data: {
        'model': AppConstants.geminiLiteModel,
        'contents': [
          {
            'parts': [
              {'text': prompt},
            ],
          },
        ],
        'generationConfig': {'temperature': 0.3, 'maxOutputTokens': 512},
      },
      options: Options(
        headers: withPbAuthHeaders(),
        receiveTimeout: const Duration(seconds: 15),
      ),
    );

    final text =
        response.data['candidates']?[0]?['content']?['parts']?[0]?['text']
            as String? ??
        '[]';
    final match = RegExp(r'\[.*?\]', dotAll: true).firstMatch(text);
    if (match == null) throw Exception('No JSON in response');
    final jsonStr = match.group(0)!;

    // Parse list from simple JSON array (no dart:convert needed for simple string arrays)
    final keywords = <String>[];
    final cleaned = jsonStr
        .replaceAll('[', '')
        .replaceAll(']', '')
        .replaceAll('"', '')
        .replaceAll("'", '');
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
        (p) => parts.every(
          (part) =>
              p.name.toLowerCase().contains(part) ||
              (p.brand?.toLowerCase().contains(part) ?? false),
        ),
        orElse: () => allProducts.firstWhere(
          (p) => p.name.toLowerCase().contains(parts.first),
          orElse: () => ProductEntity(
            id: '',
            name: '',
            category: '',
            subcategory: '',
            lastUpdated: DateTime(2000),
          ),
        ),
      );
      if (product.id.isNotEmpty && !matched.any((m) => m.id == product.id)) {
        matched.add(product);
      }
      if (matched.length >= 10) break;
    }

    // Fill remaining with top trendScore
    if (matched.length < 10) {
      final remaining =
          allProducts.where((p) => !matched.any((m) => m.id == p.id)).toList()
            ..sort((a, b) => b.trendScore.compareTo(a.trendScore));
      matched.addAll(remaining.take(10 - matched.length));
    }

    // 5. Save to PocketBase cache
    try {
      try {
        final existing = await pb
            .collection('public_config')
            .getFirstListItem('key = "trending_daily"');
        await pb
            .collection('public_config')
            .update(
              existing.id,
              body: {
                'productIds': matched.map((p) => p.id).toList(),
                'lastUpdated': DateTime.now().toUtc().toIso8601String(),
                'source': 'gemini',
              },
            );
      } catch (_) {
        await pb
            .collection('public_config')
            .create(
              body: {
                'key': 'trending_daily',
                'productIds': matched.map((p) => p.id).toList(),
                'lastUpdated': DateTime.now().toUtc().toIso8601String(),
                'source': 'gemini',
              },
            );
      }
    } catch (_) {}

    return matched;
  } catch (_) {
    return (allProducts.toList()
          ..sort((a, b) => b.trendScore.compareTo(a.trendScore)))
        .take(10)
        .toList();
  }
});

// ════════════════════════════════════════════════════
// ─── PERSONALIZED RECOMMENDATIONS ─── Section 6, 8
// ════════════════════════════════════════════════════

/// Personalized product recommendations - Section 6.1 "For You"
/// Uses home feed data — no extra Firestore queries.
final personalizedRecommendationsProvider = FutureProvider<List<ProductEntity>>((
  ref,
) async {
  // Only rebuild when user logs in/out — not on every profile stream emit
  ref.watch(userProfileProvider.select((u) => u.valueOrNull?.uid));
  final activeSearchQuery = ref.watch(searchQueryProvider).trim();
  final user = ref.read(userProfileProvider).valueOrNull;
  final country = ref.read(selectedCountryProvider);
  final feed = await ref.watch(homeFeedProvider.future);
  final behavior = await ref.watch(behaviorSignalsProvider.future);
  final recentlyViewed = await ref.watch(recentlyViewedProductsProvider.future);

  if (feed.all.isEmpty) return <ProductEntity>[];

  // If no user yet, show cross-category trending products as "For You"
  if (user == null) {
    final catCount = <String, int>{};
    final diverse = <ProductEntity>[];
    for (final p in feed.trending) {
      final cat = p.category.toLowerCase();
      final cnt = catCount[cat] ?? 0;
      if (cnt < 3) {
        diverse.add(p);
        catCount[cat] = cnt + 1;
      }
      if (diverse.length >= 50) break;
    }
    return diverse;
  }

  // ── Load analyzed product IDs to exclude re-recommendations ──
  final excludeIds = <String>{};
  try {
    final userRecord = await pb.collection('users').getOne(user.uid);
    final data = userRecord.data;
    if (data['analyzedProducts'] is List) {
      for (final entry in (data['analyzedProducts'] as List)) {
        if (entry is Map && entry['productId'] != null) {
          excludeIds.add(entry['productId'].toString());
        }
      }
    }
  } catch (_) {}

  excludeIds.addAll(recentlyViewed.map((product) => product.id));
  excludeIds.addAll(_visibleHomeShelfIds(feed));

  final algorithmService = ref.read(profileAlgorithmServiceProvider);
  var allProducts = <ProductEntity>[];
  final existingIds = <String>{};
  final viewedSeeds = recentlyViewed.take(10).toList();
  final recentSearchTerms = <String>{
    if (activeSearchQuery.length >= 2)
      ...activeSearchQuery
          .toLowerCase()
          .split(RegExp(r'[^a-z0-9]+'))
          .where((term) => term.length >= 3),
    for (final query in behavior.recentSearches.take(8))
      ...query
          .toLowerCase()
          .split(RegExp(r'[^a-z0-9]+'))
          .where((term) => term.length >= 3),
  };

  // Get behavior-boosted category priorities
  final priorityCats = algorithmService.getCategoryPriority(
    user,
    behavior: behavior,
  );

  // ── Ecosystem affinity filter ──
  final eco = user.ecosystem.toLowerCase();
  bool isEcoMatch(ProductEntity p) {
    final brand = (p.brand ?? '').toLowerCase();
    if (eco == 'apple') return brand == 'apple';
    if (eco == 'android') {
      return const {
        'samsung',
        'xiaomi',
        'oneplus',
        'oppo',
        'vivo',
        'realme',
        'google',
        'motorola',
        'huawei',
        'honor',
        'nothing',
      }.contains(brand);
    }
    return true; // mixed = no filter
  }

  void addCandidate(ProductEntity product, {bool preferEcosystem = false}) {
    if (product.id.isEmpty || excludeIds.contains(product.id)) return;
    if (existingIds.contains(product.id)) return;
    if (preferEcosystem && !isEcoMatch(product)) return;

    allProducts.add(product);
    existingIds.add(product.id);
  }

  // Same segment alternatives for products the user already explored.
  for (final seed in viewedSeeds) {
    final catProducts =
        feed.byCategory[seed.category.toLowerCase().trim()] ??
        const <ProductEntity>[];
    var added = 0;
    for (final product in catProducts) {
      if (_homeFeedAlternativeBoost(product, [seed], country) < 8) continue;
      final beforeLength = allProducts.length;
      addCandidate(product, preferEcosystem: true);
      if (allProducts.length > beforeLength) added++;
      if (added >= 10) break;
    }
  }

  // Recent search intent should immediately influence the home feed.
  if (recentSearchTerms.isNotEmpty) {
    final searchMatches =
        feed.all
            .where(
              (product) => _homeFeedSearchBoost(product, recentSearchTerms) > 0,
            )
            .toList()
          ..sort((a, b) {
            final scoreA =
                _homeFeedSearchBoost(a, recentSearchTerms) +
                (a.trendScore * 0.2);
            final scoreB =
                _homeFeedSearchBoost(b, recentSearchTerms) +
                (b.trendScore * 0.2);
            return scoreB.compareTo(scoreA);
          });
    for (final product in searchMatches.take(60)) {
      addCandidate(product);
    }
  }

  // Pull products from top 12 priority categories — MAX 8 per category
  final topCats = priorityCats.isNotEmpty
      ? priorityCats.take(12).toList()
      : user.interestCategories.take(8).toList();

  // First pass: ecosystem-matched products from priority categories
  for (final cat in topCats) {
    final catLower = cat.toLowerCase().trim();
    final catProducts = feed.byCategory[catLower] ?? [];
    int added = 0;
    for (final p in catProducts) {
      final beforeLength = allProducts.length;
      addCandidate(p, preferEcosystem: true);
      if (allProducts.length > beforeLength) added++;
      if (added >= 5) break;
    }
  }

  // Second pass: fill remaining slots from priority categories (any ecosystem)
  for (final cat in topCats) {
    final catLower = cat.toLowerCase().trim();
    final catProducts = feed.byCategory[catLower] ?? [];
    int added = 0;
    for (final p in catProducts) {
      final beforeLength = allProducts.length;
      addCandidate(p);
      if (allProducts.length > beforeLength) added++;
      if (added >= 4) break;
    }
  }

  // Fill remaining slots with catalogue depth, not the same visible shelves.
  if (allProducts.length < 80) {
    for (final product in feed.all) {
      addCandidate(product);
      if (allProducts.length >= 100) break;
    }
  }

  // Pre-compute scores O(n) before sorting — avoids O(n log n) repeated heavy
  // calls to calculateTotalFitScore / DateTime.now() inside the comparator.
  final now = DateTime.now();
  final scoreMap = <String, double>{};
  for (final p in allProducts) {
    final fit = algorithmService.calculateTotalFitScore(
      user: user,
      product: p,
      behavior: behavior,
    );
    final alt = _homeFeedAlternativeBoost(p, viewedSeeds, country);
    final search = _homeFeedSearchBoost(p, recentSearchTerms);
    final freshness =
        p.createdAt != null && now.difference(p.createdAt!).inDays < 180
        ? 2.5
        : 0.0;
    scoreMap[p.id] = fit + alt + search + freshness;
  }
  // Quiz/onboarding categories must lead the shelf — onboarding sets
  // user.interestCategories, which propagates into priorityCats. Ordering
  // products by their position in topCats first (then by scoreMap inside the
  // same category) ensures the user sees their declared interests at the
  // front of "For You" before the algorithm's broader matches.
  final priorityIndex = <String, int>{};
  for (var i = 0; i < topCats.length; i++) {
    priorityIndex.putIfAbsent(topCats[i].toLowerCase().trim(), () => i);
  }
  final sortedProducts = List<ProductEntity>.from(allProducts)
    ..sort((a, b) {
      final aIdx =
          priorityIndex[a.category.toLowerCase().trim()] ??
          priorityIndex.length;
      final bIdx =
          priorityIndex[b.category.toLowerCase().trim()] ??
          priorityIndex.length;
      if (aIdx != bIdx) return aIdx.compareTo(bIdx);
      return scoreMap[b.id]!.compareTo(scoreMap[a.id]!);
    });

  // Final diversity check: keep the shelf broad and non-repeating.
  final outputCatCount = <String, int>{};
  final outputBrandCount = <String, int>{};
  final result = <ProductEntity>[];
  for (final p in sortedProducts) {
    final cat = p.category.toLowerCase();
    final brand = _homeFeedBrandKey(p);
    final cnt = outputCatCount[cat] ?? 0;
    final brandCnt = outputBrandCount[brand] ?? 0;
    if (cnt < 5 && brandCnt < 3) {
      result.add(p);
      outputCatCount[cat] = cnt + 1;
      outputBrandCount[brand] = brandCnt + 1;
    }
    if (result.length >= 60) break;
  }
  return _spreadHomeFeedVariety(result, recentWindow: 3);
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

// ════════════════════════════════════════════════════
// ─── DYNAMIC HOME SECTIONS ───
// ════════════════════════════════════════════════════

/// "Top in [Category]" — products from user's most viewed category
final topInCategoryProvider =
    FutureProvider.autoDispose<
      ({String category, List<ProductEntity> products})
    >((ref) async {
      final behavior = await ref.watch(behaviorSignalsProvider.future);
      final feed = await ref.watch(homeFeedProvider.future);

      // Find the most viewed category
      String topCat = '';
      int maxViews = 0;
      for (final entry in behavior.categoryViews.entries) {
        if (entry.value > maxViews) {
          maxViews = entry.value;
          topCat = entry.key.toLowerCase().trim();
        }
      }

      if (topCat.isEmpty || maxViews < 2) {
        return (category: '', products: <ProductEntity>[]);
      }

      final catProducts = feed.byCategory[topCat] ?? [];
      if (catProducts.isEmpty) {
        return (category: '', products: <ProductEntity>[]);
      }

      // Return top products, exclude first few they've likely already seen
      final viewedIds = behavior.productViews.keys.toSet();
      final blockedIds = {...viewedIds, ..._visibleHomeShelfIds(feed)};
      final fresh = catProducts
          .where((p) => !blockedIds.contains(p.id))
          .take(30)
          .toList();
      if (fresh.length < 5) {
        // Not enough fresh products, show top ones
        return (
          category: topCat,
          products: _spreadHomeFeedVariety(catProducts.take(30).toList()),
        );
      }
      return (category: topCat, products: _spreadHomeFeedVariety(fresh));
    });

/// "Recently Analyzed" — products user has analyzed with AI
final recentlyAnalyzedProvider =
    FutureProvider.autoDispose<List<ProductEntity>>((ref) async {
      final user = ref.watch(userProfileProvider).valueOrNull;
      if (user == null) return [];

      // ref'ten türeyen her şeyi await'lerden ÖNCE yakala. Bu autoDispose
      // provider userProfile + homeFeed'i izliyor; bir await sırasında bu
      // bağımlılıklardan biri değişirse, await sonrası `ref` kullanımı
      // `!_didChangeDependency` assertion'ını fırlatıyordu (logda görülen
      // `[recentlyAnalyzed] Error` kaynağı). watch/read senkron yapılınca
      // reaktiflik korunur, hata yok olur.
      final repo = ref.read(productRepositoryProvider);
      final feedFuture = ref.watch(homeFeedProvider.future);

      try {
        final userRecord = await pb.collection('users').getOne(user.uid);
        final data = userRecord.data;
        if (data['analyzedProducts'] is! List) return [];

        final analyzed = (data['analyzedProducts'] as List)
            .cast<Map<String, dynamic>>();
        if (analyzed.isEmpty) return [];

        // Get product IDs from analyzed history (most recent first)
        final productIds = analyzed
            .where((e) => e['productId'] != null)
            .map((e) => e['productId'].toString())
            .toSet()
            .take(10)
            .toList();

        if (productIds.isEmpty) return [];

        // Try to find these products in the home feed cache first
        final feed = await feedFuture;
        final feedMap = {for (final p in feed.all) p.id: p};
        final result = <ProductEntity>[];
        for (final id in productIds) {
          if (feedMap.containsKey(id)) {
            result.add(feedMap[id]!);
          }
        }

        // If not enough in cache, fetch from Firestore
        if (result.length < productIds.length) {
          final missingIds = productIds
              .where((id) => !feedMap.containsKey(id))
              .toList();
          for (final id in missingIds.take(5)) {
            try {
              final pResult = await repo.getProduct(id, preferCache: true);
              pResult.when(success: (p) => result.add(p), failure: (_) {});
            } catch (_) {}
          }
        }

        return result;
      } catch (e) {
        debugPrint('[recentlyAnalyzed] Error: $e');
        return [];
      }
    });

final Map<String, Future<void>> _viewedProductsBackfillByUser = {};

bool _sameStringList(List<String> left, List<String> right) {
  if (identical(left, right)) return true;
  if (left.length != right.length) return false;
  for (var index = 0; index < left.length; index++) {
    if (left[index] != right[index]) return false;
  }
  return true;
}

Future<void> _ensureViewedProductsBackfill({
  required String uid,
  required PbDataSource pbDs,
  required List<String> hiveIds,
}) {
  if (hiveIds.isEmpty) return Future.value();

  final pending = _viewedProductsBackfillByUser[uid];
  if (pending != null) return pending;

  final future = () async {
    for (final id in hiveIds.reversed) {
      await pbDs.addRecentlyViewed(uid, id);
    }
  }();

  _viewedProductsBackfillByUser[uid] = future;
  unawaited(
    future.whenComplete(() {
      if (identical(_viewedProductsBackfillByUser[uid], future)) {
        _viewedProductsBackfillByUser.remove(uid);
      }
    }),
  );
  return future;
}

/// "Price Drop" / Value Picks — high techScore at lower price tiers
final valuePicsProvider = FutureProvider.autoDispose<List<ProductEntity>>((
  ref,
) async {
  final feed = await ref.watch(homeFeedProvider.future);
  final country = ref.read(selectedCountryProvider);
  final blockedIds = _visibleHomeShelfIds(feed);

  // Find products with high techScore but relatively low price
  final candidates = feed.all.where((p) {
    final score = p.techScore;
    final price = p.getPriceForCountry(country) ?? 0;
    // Good value: high score, reasonable price
    return score >= 60 &&
        price > 0 &&
        price < 2000 &&
        !blockedIds.contains(p.id);
  }).toList();

  // Sort by value ratio (techScore / price)
  candidates.sort((a, b) {
    final priceA = a.getPriceForCountry(country) ?? 1;
    final priceB = b.getPriceForCountry(country) ?? 1;
    final ratioA = a.techScore / priceA;
    final ratioB = b.techScore / priceB;
    return ratioB.compareTo(ratioA);
  });

  // Ensure diversity
  final catCount = <String, int>{};
  final result = <ProductEntity>[];
  for (final p in candidates) {
    final cat = p.category.toLowerCase();
    final cnt = catCount[cat] ?? 0;
    if (cnt < 4) {
      result.add(p);
      catCount[cat] = cnt + 1;
    }
    if (result.length >= 30) break;
  }
  return _spreadHomeFeedVariety(result, recentWindow: 3);
});

/// Calculate fit score for a specific product
final productFitScoreProvider = FutureProvider.autoDispose
    .family<double, String>((ref, productId) async {
      final userAsync = ref.watch(userProfileProvider);
      final user = userAsync.valueOrNull;

      if (user == null) return 0.0;

      final behavior = await ref.watch(behaviorSignalsProvider.future);
      final productResult = await ref
          .read(productRepositoryProvider)
          .getProduct(productId);

      return productResult.when(
        success: (product) {
          final algorithmService = ref.read(profileAlgorithmServiceProvider);
          return algorithmService.calculateTotalFitScore(
            user: user,
            product: product,
            behavior: behavior,
          );
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

/// Recently viewed product IDs (Firestore-backed, persistent across sessions)
final viewedProductsProvider = StreamProvider<List<String>>((ref) {
  final authState = ref.watch(authStateProvider);
  return authState.when(
    data: (uid) {
      if (uid == null) return Stream.value(<String>[]);
      final pbDs = ref.read(pbDataSourceProvider);
      final hiveDs = ref.read(hiveDataSourceProvider);
      final hiveIds = hiveDs.getViewedProducts();

      return pbDs
          .watchRecentlyViewed(uid)
          .asyncMap((pbIds) async {
            if (pbIds.isEmpty && hiveIds.isNotEmpty) {
              unawaited(
                _ensureViewedProductsBackfill(
                  uid: uid,
                  pbDs: pbDs,
                  hiveIds: hiveIds,
                ),
              );
              return hiveIds;
            }

            final pendingBackfill = _viewedProductsBackfillByUser[uid];
            if (pendingBackfill != null) {
              await pendingBackfill;
              final syncedIds = await pbDs.getRecentlyViewed(uid);
              return syncedIds.isNotEmpty ? syncedIds : hiveIds;
            }

            return pbIds;
          })
          .distinct(_sameStringList)
          .handleError((_) => <String>[]);
    },
    loading: () => Stream.value(<String>[]),
    error: (_, _) => Stream.value(<String>[]),
  );
});

/// Recently viewed products — feed + Firestore fallback for missing items.
/// Reactive: rebuilds when viewedProducts or homeFeed change.
final recentlyViewedProductsProvider = FutureProvider<List<ProductEntity>>((
  ref,
) async {
  // Prefer Firestore stream data, fall back to Hive
  final firestoreIds = ref.watch(viewedProductsProvider).valueOrNull;
  final hiveDs = ref.read(hiveDataSourceProvider);
  final hiveIds = hiveDs.getViewedProducts();
  final viewedIds = (firestoreIds != null && firestoreIds.isNotEmpty)
      ? firestoreIds
      : hiveIds;
  if (viewedIds.isEmpty) return [];

  final feed = ref.watch(homeFeedProvider);
  final allProducts = feed.whenOrNull(data: (f) => f.all) ?? [];

  final productMap = {for (final p in allProducts) p.id: p};
  // Deduplicate while preserving order (same product viewed multiple times).
  final seen = <String>{};
  final limitedIds = viewedIds
      .where((id) => id.isNotEmpty && seen.add(id))
      .take(20)
      .toList();

  // Separate found vs missing
  final results = <String, ProductEntity>{};
  final missingIds = <String>[];
  for (final id in limitedIds) {
    if (productMap.containsKey(id)) {
      results[id] = productMap[id]!;
    } else {
      missingIds.add(id);
    }
  }

  // Fetch missing from Firestore in parallel (max 10)
  if (missingIds.isNotEmpty) {
    final repo = ref.read(productRepositoryProvider);
    final lookup = missingIds.take(10).toList();
    final dead = <String>{};
    final futures = lookup.map((id) async {
      try {
        final result = await repo.getProduct(id, preferCache: true);
        return result.when(
          success: (p) => MapEntry(id, p),
          failure: (_) {
            dead.add(id);
            return null;
          },
        );
      } catch (_) {
        dead.add(id);
        return null;
      }
    });
    final fetched = await Future.wait(futures);
    for (final entry in fetched) {
      if (entry != null) results[entry.key] = entry.value;
    }
    // Drop deleted products from Hive AND the PB recently_viewed collection
    // so subsequent provider rebuilds (and the next app launch) don't keep
    // refetching them. Without the PB prune the firestoreIds stream just
    // reseeds the Hive cache with the same dead ids next time.
    if (dead.isNotEmpty) {
      unawaited(hiveDs.pruneViewedProducts(dead));
      final uid = ref.read(authStateProvider).valueOrNull;
      if (uid != null && uid.isNotEmpty) {
        unawaited(
          ref.read(pbDataSourceProvider).pruneRecentlyViewed(uid, dead),
        );
      }
    }
  }

  // Return in original viewedIds order
  return limitedIds
      .where((id) => results.containsKey(id))
      .map((id) => results[id]!)
      .toList();
});

/// Record a product view (non-blocking, uses cached data)
Future<void> recordProductView(WidgetRef ref, String productId) async {
  try {
    unawaited(ref.read(hiveDataSourceProvider).addViewedProduct(productId));
    // Save to Firestore for persistence
    final user = ref.read(authStateProvider).valueOrNull;
    if (user != null) {
      unawaited(
        ref.read(pbDataSourceProvider).addRecentlyViewed(user, productId),
      );
    }
    // Get product info from cache (no network call)
    String category = '';
    String? brand;
    final feedAsync = ref.read(homeFeedProvider);
    final cached = feedAsync.valueOrNull;
    if (cached != null) {
      final match = cached.all.where((p) => p.id == productId).firstOrNull;
      category = match?.category ?? '';
      brand = match?.brand;
    }
    ref.read(behaviorTrackingProvider).trackProductView(productId, category);
    ref.read(behaviorTrackingProvider).trackActiveHour();
    // Increment Firestore viewCount (fire-and-forget, non-blocking)
    unawaited(
      ref.read(pbDataSourceProvider).incrementProductViewCount(productId),
    );
    // Firebase Analytics
    AnalyticsService.instance.logProductView(productId, category, brand);
  } catch (_) {}
}

// ─── Freemium Usage Tracking ──────────────────────────────────────────────────

class FreemiumLimits {
  // Single source of truth → AppConstants.
  static int get dailyCredits => AppConstants.freeDailyAiCreditLimit;
  static int get comparisonsPerDay => AppConstants.freeComparisonLimit;
  static int get aiChatsPerDay => AppConstants.freeAiQuestionLimit;
  static int get compareAiPerDay => AppConstants.freeCompareAiLimit;
  static int get detailAiPerDay => AppConstants.freeDetailAiLimit;
  static int get linkAnalysesPerDay => AppConstants.freeLinkPasteLimit;
  static int get linkComparePerDay => AppConstants.freeLinkCompareLimit;
  static int get subscriptionAnalysesPerDay =>
      AppConstants.freeSubscriptionAnalysisLimit;
  static int get productScanPerDay => AppConstants.freeProductScanLimit;
  static int get detailMatchAiPerDay => AppConstants.freeDetailMatchAiLimit;

  static num costForFeature(String feature) =>
      AppConstants.creditCostForFeature(feature);
}

final freemiumUsageProvider = Provider.family<int, String>((ref, feature) {
  final subscription = ref.watch(subscriptionServiceProvider);
  return switch (feature) {
    'comparison' => subscription.comparisonsUsed,
    'ai_chat' => subscription.aiQuestionsUsed,
    'compare_ai' => subscription.compareAiUsed,
    'detail_ai' => subscription.detailAiUsed,
    'link_analysis' => subscription.linkPastesUsed,
    'link_compare' => subscription.linkCompareUsed,
    'subscription_analysis' => subscription.subscriptionAnalysesUsed,
    'product_scan' => subscription.productScanUsed,
    'detail_match' => subscription.detailMatchAiUsed,
    _ => 0,
  };
});

Future<bool> checkAndIncrementUsage(WidgetRef ref, String feature) async {
  final subscription = ref.read(subscriptionServiceProvider);
  final result = switch (feature) {
    'comparison' => subscription.recordComparison(),
    'ai_chat' => subscription.recordAIQuestion(),
    'compare_ai' => subscription.recordCompareAi(),
    'detail_ai' => subscription.recordDetailAi(),
    'link_analysis' => subscription.recordLinkPaste(),
    'link_compare' => subscription.recordLinkCompare(),
    'subscription_analysis' => subscription.recordSubscriptionAnalysis(),
    'product_scan' => subscription.recordProductScan(),
    'detail_match' => subscription.recordDetailMatchAi(),
    _ => const Success<void>(null),
  };
  return result.isSuccess;
}

// ─── Spec Direction Service ───────────────────────────────────────────────────

final specDirectionServiceProvider = FutureProvider<SpecDirectionService>((
  ref,
) async {
  final service = SpecDirectionService();
  try {
    await service.loadFirestoreOverrides().timeout(const Duration(seconds: 5));
  } catch (_) {
    // Use default directions if Firestore is slow
  }
  return service;
});

/// Returns variants of a product (same base name, different storage/RAM)
final productVariantsProvider = FutureProvider.autoDispose
    .family<List<ProductEntity>, ProductEntity>((ref, product) async {
      final baseName = normalizeProductName(product.name);
      final baseGroup = product.variantGroup;

      List<ProductEntity> filterVariants(List<ProductEntity> products) {
        final variants = products.where((p) {
          if (p.id == product.id) return false;
          if (baseGroup.isNotEmpty && p.variantGroup.isNotEmpty) {
            if (p.variantGroup == baseGroup) return true;
          }
          return normalizeProductName(p.name) == baseName;
        }).toList();
        final byConfig = <String, ProductEntity>{};
        for (final v in variants) {
          final key = v.configKey.isNotEmpty
              ? v.configKey
              : '${v.variantGroup}|${_storageCapacityMB(v)}|${v.name.toLowerCase()}';
          final existing = byConfig[key];
          if (existing == null ||
              v.id == product.id ||
              v.techScore > existing.techScore) {
            byConfig[key] = v;
          }
        }
        final unique = byConfig.values.toList();
        unique.sort(
          (a, b) => _storageCapacityMB(a).compareTo(_storageCapacityMB(b)),
        );
        return unique;
      }

      // 0) Exact PocketBase lookup by variantGroup. Category browsing/search
      // providers only carry a slice of a category; direct group lookup is the
      // reliable path for Icecat families with dozens of variants.
      if (baseGroup.isNotEmpty) {
        final direct = await ref
            .read(pbDataSourceProvider)
            .getProductVariantsByGroup(
              variantGroup: baseGroup,
              category: product.category,
              limit: 120,
            )
            .timeout(const Duration(seconds: 12));
        final variants = filterVariants(direct.cast<ProductEntity>());
        if (variants.isNotEmpty) return variants;
      }

      // 1) Try from already-cached homeFeed (instant, no network)
      final feedAsync = ref.read(homeFeedProvider);
      final cached = feedAsync.valueOrNull;
      final categoryKey = product.category.toLowerCase().trim() == 'notebooks'
          ? 'laptops'
          : product.category;
      if (cached != null) {
        final catKey = categoryKey.toLowerCase().trim();
        final catProducts = cached.byCategory[catKey] ?? [];
        // Also search all products in case category key doesn't match
        final allProducts = cached.trending;
        final pool = {...catProducts, ...allProducts}.toList();
        final variants = filterVariants(pool);
        if (variants.isNotEmpty) return variants;
      }

      // 2) Try Typesense (includes new products with techScores)
      try {
        final ds = ref.read(pbDataSourceProvider);
        final tsProducts = await ds
            .getProductsByCategoryTs(category: categoryKey, limit: 500)
            .timeout(const Duration(seconds: 6));
        if (tsProducts.isNotEmpty) {
          return filterVariants(tsProducts.cast<ProductEntity>());
        }
      } catch (_) {}

      // 3) Fallback: PocketBase query
      try {
        final result = await ref
            .read(productRepositoryProvider)
            .getProducts(category: categoryKey, limit: 500)
            .timeout(const Duration(seconds: 8));
        return result.when(
          success: (products) => filterVariants(products),
          failure: (_) => [],
        );
      } catch (_) {
        return [];
      }
    });

final productOffersProvider = FutureProvider.autoDispose
    .family<List<ProductOfferModel>, String>((ref, productId) async {
      final id = productId.trim();
      if (id.isEmpty) return const <ProductOfferModel>[];
      return ref
          .read(pbDataSourceProvider)
          .getProductOffers(id)
          .timeout(const Duration(seconds: 12));
    });

// End of file

// ════════════════════════════════════════════════════
// ─── SIMILAR PRODUCTS PROVIDER ───
// ════════════════════════════════════════════════════

const int _kSimilarProductsLimit = 26;

/// Finds truly similar products: same category, persona-aware scoring,
/// variant exclusion, brand diversity. Uses homeFeed cache + Firestore.
final similarProductsProvider = FutureProvider.autoDispose
    .family<List<ProductEntity>, ProductEntity>((ref, product) async {
      try {
        final catKey = product.category.toLowerCase().trim();

        // Load user profile + behavior for persona-aware scoring
        final userAsync = ref.read(userProfileProvider);
        final user = userAsync.valueOrNull;
        BehaviorSignals behavior = BehaviorSignals.empty;
        ProfileAlgorithmService? algorithmService;
        if (user != null) {
          try {
            behavior = await ref
                .read(behaviorSignalsProvider.future)
                .timeout(
                  const Duration(seconds: 4),
                  onTimeout: () => BehaviorSignals.empty,
                );
          } catch (_) {}
          algorithmService = ref.read(profileAlgorithmServiceProvider);
        }

        // Recently viewed product IDs for boosting/awareness
        final viewedAsync = ref.read(viewedProductsProvider);
        final viewedIds = viewedAsync.valueOrNull ?? [];
        final recentViewedSet = viewedIds.take(10).toSet();

        // 1) Build product pool from multiple sources
        List<ProductEntity> pool = [];
        final ds = ref.read(pbDataSourceProvider);

        try {
          if (ds.isCacheReady) {
            final cached = await ds.getAllCachedProducts();
            pool = cached.cast<ProductEntity>().toList();
          }
        } catch (_) {}

        // 2) Parallel: homeFeed cache + Typesense (primary) + PocketBase fallback
        final futures = <Future>[];

        futures.add(
          (() async {
            try {
              final feed = await ref
                  .read(homeFeedProvider.future)
                  .timeout(const Duration(seconds: 3));
              final ids = pool.map((p) => p.id).toSet();
              for (final p in feed.all) {
                if (!ids.contains(p.id)) pool.add(p);
              }
            } catch (_) {}
          })(),
        );

        futures.add(
          (() async {
            // Try Typesense first (includes newly added products with techScores)
            try {
              final tsProducts = await ds
                  .getProductsByCategoryTs(
                    category: product.category,
                    limit: 160,
                    sortBy: 'techScore:desc',
                  )
                  .timeout(const Duration(seconds: 6));
              if (tsProducts.isNotEmpty) {
                final ids = pool.map((p) => p.id).toSet();
                for (final p in tsProducts) {
                  if (!ids.contains(p.id)) pool.add(p as ProductEntity);
                }
                return;
              }
            } catch (_) {}
            // Fallback to PocketBase if Typesense returned nothing
            try {
              final result = await ref
                  .read(productRepositoryProvider)
                  .getProducts(category: product.category, limit: 140)
                  .timeout(const Duration(seconds: 8));
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
          })(),
        );

        await Future.wait(futures);

        if (pool.isEmpty) return [];

        // Remove self from pool
        pool.removeWhere((p) => p.id == product.id);

        // ── Variant exclusion: remove same variantGroup and similar names ──
        final selfVariantGroup = product.variantGroup;
        final selfNormName = normalizeProductName(product.name);
        pool.removeWhere((p) {
          // Exclude same variant group
          if (selfVariantGroup.isNotEmpty &&
              p.variantGroup.isNotEmpty &&
              p.variantGroup == selfVariantGroup) {
            return true;
          }
          // Exclude products with same normalized name (storage/RAM variants)
          if (normalizeProductName(p.name) == selfNormName) {
            return true;
          }
          return false;
        });

        // Deduplicate remaining pool by variantGroup (keep best techScore representative)
        final variantBest = <String, ProductEntity>{};
        final nameBest = <String, ProductEntity>{};
        final deduped = <ProductEntity>[];
        final dedupeIds = <String>{};
        for (final p in pool) {
          bool dominated = false;
          if (p.variantGroup.isNotEmpty) {
            final existing = variantBest[p.variantGroup];
            if (existing != null) {
              dominated = true;
              // Keep the one with higher techScore
              if (p.techScore > existing.techScore) {
                dedupeIds.remove(existing.id);
                deduped.removeWhere((x) => x.id == existing.id);
                variantBest[p.variantGroup] = p;
              } else {
                continue;
              }
            } else {
              variantBest[p.variantGroup] = p;
            }
          }
          if (!dominated) {
            final normName = normalizeProductName(p.name);
            if (nameBest.containsKey(normName)) {
              final existing = nameBest[normName]!;
              if (p.techScore > existing.techScore) {
                dedupeIds.remove(existing.id);
                deduped.removeWhere((x) => x.id == existing.id);
                nameBest[normName] = p;
              } else {
                continue;
              }
            } else {
              nameBest[normName] = p;
            }
          }
          if (dedupeIds.add(p.id)) deduped.add(p);
        }

        // Separate same-category products — accept singular/plural/case variants
        final sameCat = deduped.where((p) {
          final pCat = p.category.toLowerCase().trim();
          if (pCat == catKey) return true;
          // singular ↔ plural
          if (catKey.endsWith('s') &&
              pCat == catKey.substring(0, catKey.length - 1)) {
            return true;
          }
          if (!catKey.endsWith('s') && pCat == '${catKey}s') return true;
          return false;
        }).toList();

        // Graduated expansion to find at least 4 results
        List<ProductEntity> candidates = [];
        final techScore = product.techScore;

        // Step 1: same category + techScore ±20
        if (candidates.length < 4) {
          final step = sameCat
              .where(
                (p) => (p.techScore - techScore).abs() <= 20 && p.techScore > 0,
              )
              .toList();
          _addUnique(candidates, step);
        }

        // Step 2: same category + techScore ±40
        if (candidates.length < 4) {
          final step = sameCat
              .where(
                (p) => (p.techScore - techScore).abs() <= 40 && p.techScore > 0,
              )
              .toList();
          _addUnique(candidates, step);
        }

        // Step 3: same category, no techScore filter
        if (candidates.length < 4) {
          _addUnique(candidates, sameCat);
        }

        // Step 4: parent category match (peripherals grouping)
        if (candidates.length < 4) {
          final parentCats = _getRelatedCategories(catKey);
          if (parentCats.isNotEmpty) {
            final related = deduped.where((p) {
              final pCat = p.category.toLowerCase().trim();
              return parentCats.contains(pCat) && pCat != catKey;
            }).toList();
            _addUnique(candidates, related);
          }
        }

        // Step 5: broad fallback from the remaining deduped pool so
        // sparse categories do not get stuck at 4-6 similar products.
        if (candidates.length < _kSimilarProductsLimit) {
          _addUnique(candidates, deduped);
        }

        if (candidates.isEmpty) return [];

        // ── Score candidates with persona-aware algorithm ──
        List<MapEntry<ProductEntity, double>> scored = candidates.map((p) {
          double score = 0;
          final techDiff = (p.techScore - techScore).abs();

          if (techScore > 0 && p.techScore > 0) {
            if (techDiff <= 5) {
              score += 90;
            } else if (techDiff <= 10) {
              score += 74;
            } else if (techDiff <= 15) {
              score += 58;
            } else if (techDiff <= 25) {
              score += 28;
            } else if (techDiff <= 35) {
              score += 8;
            } else {
              score -= 80 + techDiff;
            }
          }

          // Persona fit score is secondary; this tab must stay technically similar.
          if (user != null && algorithmService != null) {
            final fitScore = algorithmService.calculateTotalFitScore(
              user: user,
              product: p,
              behavior: behavior,
            );
            score += fitScore * 0.12;
          }

          // Category match bonus
          if (p.category.toLowerCase().trim() == catKey) score += 24;

          // Brand diversity bonus — strongly prefer different brands
          if (p.brand?.toLowerCase() != product.brand?.toLowerCase()) {
            score += 6;
          }

          // Recently viewed category boost (user is interested in this type)
          if (recentViewedSet.isNotEmpty) {
            final viewedCats = <String>{};
            final feed = ref.read(homeFeedProvider).valueOrNull;
            if (feed != null) {
              for (final vid in recentViewedSet) {
                final vp = feed.all.where((x) => x.id == vid).firstOrNull;
                if (vp != null) {
                  viewedCats.add(vp.category.toLowerCase().trim());
                }
              }
            }
            if (viewedCats.contains(p.category.toLowerCase().trim())) {
              score += 3;
            }
          }

          // Trend score bonus
          if (p.trendScore > 75) {
            score += 2;
          } else if (p.trendScore > 50) {
            score += 1;
          }

          // Price proximity bonus
          final pAnyPrice = p.prices.values.isNotEmpty
              ? p.prices.values.first
              : 0.0;
          final prodAnyPrice = product.prices.values.isNotEmpty
              ? product.prices.values.first
              : 0.0;
          if (pAnyPrice > 0 && prodAnyPrice > 0) {
            final priceDiff = ((pAnyPrice - prodAnyPrice) / prodAnyPrice).abs();
            if (priceDiff <= 0.15) {
              score += 6;
            } else if (priceDiff <= 0.3) {
              score += 3;
            } else if (priceDiff <= 0.5) {
              score += 1;
            }
          }

          return MapEntry(p, score);
        }).toList();

        scored.sort((a, b) => b.value.compareTo(a.value));

        // Take top results with brand diversity first, then backfill to keep
        // the grid dense on the similar tabs.
        final result = <ProductEntity>[];
        final selectedIds = <String>{};
        final brandCount = <String, int>{};
        for (final entry in scored) {
          final brand = entry.key.brand?.toLowerCase() ?? 'unknown';
          if ((brandCount[brand] ?? 0) >= 4) continue;
          brandCount[brand] = (brandCount[brand] ?? 0) + 1;
          result.add(entry.key);
          selectedIds.add(entry.key.id);
          if (result.length >= _kSimilarProductsLimit) break;
        }

        if (result.length < _kSimilarProductsLimit) {
          for (final entry in scored) {
            if (selectedIds.contains(entry.key.id)) continue;
            result.add(entry.key);
            selectedIds.add(entry.key.id);
            if (result.length >= _kSimilarProductsLimit) break;
          }
        }

        // Çift sayı garantisi: tek sayıysa son elemanı düş (minimum 2)
        return result.length.isOdd && result.length > 1
            ? result.sublist(0, result.length - 1)
            : result;
      } catch (_) {
        return [];
      }
    });

/// Add unique products to candidates list (by id)
void _addUnique(List<ProductEntity> target, List<ProductEntity> source) {
  final ids = target.map((p) => p.id).toSet();
  for (final p in source) {
    if (!ids.contains(p.id)) {
      target.add(p);
      ids.add(p.id);
    }
  }
}

/// Map categories to related parent groups for fallback matching
Set<String> _getRelatedCategories(String category) {
  const groups = <Set<String>>[
    // Peripherals
    {
      'mouse',
      'mice',
      'fare',
      'keyboard',
      'klavye',
      'keyboards',
      'mousepad',
      'webcam',
      'headset',
    },
    // Mobile
    {
      'smartphone',
      'smartphones',
      'akıllı telefon',
      'phone',
      'telefon',
      'tablet',
      'tablets',
    },
    // Computing
    {
      'laptop',
      'laptops',
      'dizüstü',
      'notebook',
      'chromebook',
      'desktop',
      'masaüstü',
    },
    // Display
    {'monitor', 'monitors', 'monitör', 'tv', 'tvs', 'televizyon', 'television'},
    // Audio
    {
      'headphone',
      'headphones',
      'kulaklık',
      'earbuds',
      'earphone',
      'speaker',
      'speakers',
      'hoparlör',
      'soundbar',
    },
    // Storage
    {
      'ssd',
      'ssds',
      'hdd',
      'hdds',
      'hard disk',
      'external storage',
      'usb flash',
      'nas',
    },
    // Components
    {
      'gpu',
      'gpus',
      'ekran kartı',
      'graphics card',
      'cpu',
      'cpus',
      'işlemci',
      'processor',
      'ram',
      'memory',
      'motherboard',
      'anakart',
      'psu',
      'power supply',
      'case',
      'kasa',
    },
    // Wearables
    {
      'smartwatch',
      'smartwatches',
      'akıllı saat',
      'fitness tracker',
      'wearable',
    },
    // Cameras
    {'camera', 'cameras', 'fotoğraf makinesi', 'action camera', 'drone'},
    // Networking
    {'router', 'routers', 'modem', 'mesh', 'access point', 'network switch'},
    // Power
    {'power bank', 'power banks', 'charger', 'şarj cihazı'},
  ];

  for (final group in groups) {
    if (group.any((g) => category.contains(g) || g.contains(category))) {
      return group;
    }
  }
  return {};
}
