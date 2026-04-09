part of 'providers.dart';

// ════════════════════════════════════════════════════
// ─── STATE PROVIDERS ─── (StateProvider - simple state)
// ════════════════════════════════════════════════════

/// Selected category - Section 3.3
final selectedCategoryProvider = StateProvider<String?>((ref) => null);

/// Selected country — auto-detected via IP on first use, persisted in CacheService
final selectedCountryProvider = StateNotifierProvider<CountryNotifier, String>((ref) {
  return CountryNotifier(ref.read(cacheServiceProvider), ref);
});

class CountryNotifier extends StateNotifier<String> {
  final CacheService _cacheService;
  final Ref _ref;

  CountryNotifier(this._cacheService, this._ref) : super('US') {
    _load();
  }

  void _load() {
    // 1. Check if user manually set a country
    final saved = _cacheService.getCountry();
    if (saved.isNotEmpty) {
      state = saved;
      return;
    }
    // 2. Kick off IP detection in background
    _ref.listen(detectedLocationProvider, (_, next) {
      next.whenData((location) {
        // Only auto-set if user hasn't manually chosen
        if (!_cacheService.isCountryManuallySet() && location.countryCode.isNotEmpty) {
          state = location.countryCode;
          _cacheService.saveCountry(location.countryCode);
          _cacheService.saveCurrency(location.currency);
        }
      });
    });
  }

  void setCountry(String countryCode) {
    state = countryCode;
    _cacheService.saveCountry(countryCode);
    _cacheService.setCountryManuallySet(true);
    // Also update currency from SupportedCountries
    final info = SupportedCountries.countries[countryCode];
    if (info != null) {
      _cacheService.saveCurrency(info.currency);
    }
  }
}

/// Currency derived from selected country
final currencyProvider = Provider<String>((ref) {
  final country = ref.watch(selectedCountryProvider);
  final info = SupportedCountries.countries[country];
  if (info != null) return info.currency;
  // Fallback: check CacheService
  final cached = ref.read(cacheServiceProvider).getCurrency();
  return cached.isNotEmpty ? cached : 'USD';
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
    // 1. Check if user previously saved a language preference
    final saved = _cacheService.getLanguage();
    if (saved.isNotEmpty) {
      state = Locale(saved);
      return;
    }
    // 2. First install: auto-detect from device locale
    try {
      final deviceLocale = WidgetsBinding.instance.platformDispatcher.locale;
      final langCode = deviceLocale.languageCode;
      if (_supported.contains(langCode)) {
        state = Locale(langCode);
        _cacheService.saveLanguage(langCode);
      } else {
        // Device language not supported → default to English
        state = const Locale('en');
        _cacheService.saveLanguage('en');
      }
    } catch (_) {
      state = const Locale('en');
      _cacheService.saveLanguage('en');
    }
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
// ════════════════════════════════════════════════════
// ─── SEARCH PROVIDERS ─── Section 10
// ════════════════════════════════════════════════════

/// Son aramalar (local state)
final recentSearchesProvider = StateProvider<List<String>>((ref) => []);
