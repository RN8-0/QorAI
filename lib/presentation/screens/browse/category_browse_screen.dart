/// Premium Category Browse Screen – OLED Dark Theme
/// - Category pills horizontal scroll (top)
/// - Masonry grid for products
/// - Glass container filters
/// - Dark cards with gradient accents
library;

import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/core/search_ranking.dart';
import 'package:qor_ai/core/product_filter.dart';
import 'package:qor_ai/config/filter_config.dart';
import 'package:qor_ai/presentation/models/filter_models.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/presentation/widgets/filter_bottom_sheet.dart';
import 'package:qor_ai/presentation/widgets/product_image_box.dart';
import 'package:qor_ai/presentation/widgets/shared/compact_product_row.dart';

import 'package:qor_ai/domain/entities/product_entity.dart';
import 'package:qor_ai/data/models/product_model.dart';

// ---------------------------------------------------------------------------
// Sort options
// ---------------------------------------------------------------------------

enum _SortOption { techScore, relevance, newest, priceAsc, priceDesc }

int _releaseYearForBrowseProduct(ProductEntity product) {
  return ProductFilter.getExactReleaseYear(product) ??
      (product.createdAt ?? product.lastUpdated).year;
}

int _sortTimestampForBrowseProduct(ProductEntity product) {
  return (product.createdAt ?? product.lastUpdated).millisecondsSinceEpoch;
}

/// Returns the lowest non-zero numeric value from a product's `prices` map,
/// or `double.infinity` when the product has no usable price (so it sorts
/// to the end on ascending sorts and to the front on descending sorts via
/// the inverse comparator below).
double _lowestNumericPriceForBrowseProduct(ProductEntity product) {
  if (product.prices.isEmpty) return double.infinity;
  double lowest = double.infinity;
  for (final value in product.prices.values) {
    if (value > 0 && value < lowest) lowest = value;
  }
  return lowest;
}

int _compareBrowseProducts(ProductEntity a, ProductEntity b, String sortKey) {
  switch (sortKey) {
    case 'newest':
      final yearCmp = _releaseYearForBrowseProduct(
        b,
      ).compareTo(_releaseYearForBrowseProduct(a));
      if (yearCmp != 0) return yearCmp;
      final dateCmp = _sortTimestampForBrowseProduct(
        b,
      ).compareTo(_sortTimestampForBrowseProduct(a));
      if (dateCmp != 0) return dateCmp;
      return b.techScore.compareTo(a.techScore);
    case 'relevance':
      final trendCompare = b.trendScore.compareTo(a.trendScore);
      if (trendCompare != 0) return trendCompare;
      final yearCmp = _releaseYearForBrowseProduct(
        b,
      ).compareTo(_releaseYearForBrowseProduct(a));
      if (yearCmp != 0) return yearCmp;
      return _sortTimestampForBrowseProduct(
        b,
      ).compareTo(_sortTimestampForBrowseProduct(a));
    case 'priceAsc':
    case 'priceDesc':
      // Local fallback only — server-side sort happens in _serverSortBy().
      // Products without a price always go to the back of the list so the
      // user never sees "$0" placeholders bubble to the top of the price
      // sort.
      final priceA = _lowestNumericPriceForBrowseProduct(a);
      final priceB = _lowestNumericPriceForBrowseProduct(b);
      if (!priceA.isFinite && !priceB.isFinite) {
        return b.techScore.compareTo(a.techScore);
      }
      if (!priceA.isFinite) return 1;
      if (!priceB.isFinite) return -1;
      final cmp = sortKey == 'priceAsc'
          ? priceA.compareTo(priceB)
          : priceB.compareTo(priceA);
      if (cmp != 0) return cmp;
      return b.techScore.compareTo(a.techScore);
    default:
      final techCompare = b.techScore.compareTo(a.techScore);
      if (techCompare != 0) return techCompare;
      final trendCompare = b.trendScore.compareTo(a.trendScore);
      if (trendCompare != 0) return trendCompare;
      return _releaseYearForBrowseProduct(
        b,
      ).compareTo(_releaseYearForBrowseProduct(a));
  }
}

Map<String, dynamic> _serializeFilterStateForBrowse(FilterState state) {
  return {
    'multiSelect': state.multiSelect.map(
      (key, value) => MapEntry(key, value.toList(growable: false)),
    ),
    'ranges': state.ranges.map(
      (key, value) => MapEntry(key, {'start': value.start, 'end': value.end}),
    ),
    'toggles': state.toggles,
  };
}

FilterState _deserializeFilterStateForBrowse(Map<String, dynamic> raw) {
  final multiSelect = <String, Set<String>>{};
  final rawMulti = raw['multiSelect'] as Map<String, dynamic>? ?? const {};
  for (final entry in rawMulti.entries) {
    multiSelect[entry.key] = Set<String>.from(entry.value as List? ?? const []);
  }

  final ranges = <String, RangeValues>{};
  final rawRanges = raw['ranges'] as Map<String, dynamic>? ?? const {};
  for (final entry in rawRanges.entries) {
    final value = entry.value as Map<String, dynamic>? ?? const {};
    ranges[entry.key] = RangeValues(
      (value['start'] as num?)?.toDouble() ?? 0,
      (value['end'] as num?)?.toDouble() ?? 0,
    );
  }

  final toggles = <String, bool?>{};
  final rawToggles = raw['toggles'] as Map<String, dynamic>? ?? const {};
  for (final entry in rawToggles.entries) {
    toggles[entry.key] = entry.value as bool?;
  }

  return FilterState(
    multiSelect: multiSelect,
    ranges: ranges,
    toggles: toggles,
  );
}

Map<String, dynamic> _serializeFilterDefinitionForBrowse(FilterDefinition def) {
  return {
    'id': def.id,
    'label': def.label,
    'type': def.type.name,
    'minValue': def.minValue,
    'maxValue': def.maxValue,
    'unit': def.unit,
    'isDynamic': def.isDynamic,
    'specKeys': def.specKeys,
    'options': [
      for (final option in def.options ?? const <FilterOption>[])
        {'id': option.id, 'label': option.label},
    ],
  };
}

List<FilterDefinition> _deserializeFilterDefinitionsForBrowse(
  List<dynamic> raw,
) {
  return raw
      .map((item) {
        final data = Map<String, dynamic>.from(item as Map);
        final typeName = data['type'] as String? ?? FilterType.multiSelect.name;
        final type = FilterType.values.firstWhere(
          (value) => value.name == typeName,
          orElse: () => FilterType.multiSelect,
        );
        final options = (data['options'] as List<dynamic>? ?? const [])
            .map((opt) {
              final optionData = Map<String, dynamic>.from(opt as Map);
              return FilterOption(
                id: optionData['id'] as String? ?? '',
                label: optionData['label'] as String? ?? '',
              );
            })
            .toList(growable: false);

        return FilterDefinition(
          id: data['id'] as String? ?? '',
          label: data['label'] as String? ?? '',
          type: type,
          options: options,
          minValue: (data['minValue'] as num?)?.toDouble(),
          maxValue: (data['maxValue'] as num?)?.toDouble(),
          unit: data['unit'] as String?,
          isDynamic: data['isDynamic'] as bool? ?? false,
          specKeys: List<String>.from(data['specKeys'] ?? const []),
        );
      })
      .toList(growable: false);
}

List<String> _computeVisibleBrowseProductIds(Map<String, dynamic> args) {
  final products = (args['products'] as List<dynamic>? ?? const [])
      .map(
        (item) => ProductModel.fromMap(Map<String, dynamic>.from(item as Map)),
      )
      .cast<ProductEntity>()
      .toList(growable: false);
  final remoteProducts = (args['remoteProducts'] as List<dynamic>? ?? const [])
      .map(
        (item) => ProductModel.fromMap(Map<String, dynamic>.from(item as Map)),
      )
      .cast<ProductEntity>()
      .toList(growable: false);
  final filterState = _deserializeFilterStateForBrowse(
    Map<String, dynamic>.from(args['filterState'] as Map),
  );
  final definitions = _deserializeFilterDefinitionsForBrowse(
    args['definitions'] as List<dynamic>? ?? const [],
  );
  final query = args['query'] as String? ?? '';
  final sortKey = args['sortKey'] as String? ?? 'techScore';

  List<ProductEntity> candidates;
  if (query.isNotEmpty) {
    final localMatches = products.where((product) {
      final rank = rankProductForQuery(product, query);
      return rank.score > 0;
    }).toList();
    final seenIds = localMatches.map((product) => product.id).toSet();
    for (final product in remoteProducts) {
      if (seenIds.add(product.id)) {
        localMatches.add(product);
      }
    }
    candidates = localMatches;
  } else {
    candidates = products;
  }

  final filtered = FilterApplier.apply(candidates, filterState, definitions);
  final copy = List<ProductEntity>.from(filtered);

  if (query.isNotEmpty) {
    final rankMap = {
      for (final product in copy)
        product.id: rankProductForQuery(product, query),
    };
    copy.sort((a, b) {
      final rankCompare = (rankMap[b.id]?.score ?? 0).compareTo(
        rankMap[a.id]?.score ?? 0,
      );
      if (rankCompare != 0) return rankCompare;
      return _compareBrowseProducts(a, b, sortKey);
    });
  } else {
    copy.sort((a, b) => _compareBrowseProducts(a, b, sortKey));
  }

  return copy.map((product) => product.id).toList(growable: false);
}

extension _SortOptionLabel on _SortOption {
  String label(BuildContext context) {
    final l10n = context.l10n;
    final isTr =
        Localizations.localeOf(context).languageCode.toLowerCase() == 'tr';
    switch (this) {
      case _SortOption.techScore:
        return l10n?.sortTopRated ?? 'Top Rated';
      case _SortOption.relevance:
        return l10n?.sortPopular ?? 'Popular';
      case _SortOption.newest:
        return l10n?.sortNewest ?? 'Newest';
      case _SortOption.priceAsc:
        return isTr ? 'Fiyat: Düşük → Yüksek' : 'Price: Low → High';
      case _SortOption.priceDesc:
        return isTr ? 'Fiyat: Yüksek → Düşük' : 'Price: High → Low';
    }
  }

  IconData get icon {
    switch (this) {
      case _SortOption.techScore:
        return Icons.star_rounded;
      case _SortOption.relevance:
        return Icons.local_fire_department_rounded;
      case _SortOption.newest:
        return Icons.new_releases_rounded;
      case _SortOption.priceAsc:
        return Icons.arrow_upward_rounded;
      case _SortOption.priceDesc:
        return Icons.arrow_downward_rounded;
    }
  }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

class CategoryBrowseScreen extends ConsumerStatefulWidget {
  const CategoryBrowseScreen({
    super.key,
    required this.categoryId,
    required this.categoryName,
    this.groupItems,
  });

  final String categoryId;
  final String categoryName;
  final List<Map<String, dynamic>>? groupItems;

  @override
  ConsumerState<CategoryBrowseScreen> createState() =>
      _CategoryBrowseScreenState();
}

class _CategoryBrowseScreenState extends ConsumerState<CategoryBrowseScreen> {
  FilterState _filterState = const FilterState();
  _SortOption _sortOption = _SortOption.techScore;
  // Search bar is an isolated StatefulWidget — its setState doesn't rebuild
  // the product grid. Parent state is only updated via debounced callback.
  final GlobalKey<_IsolatedSearchBarState> _searchBarKey = GlobalKey();
  final ScrollController _scrollController = ScrollController();
  String _searchQuery = '';

  late String _activeCategoryId;
  late String _activeCategoryName;

  List<ProductEntity> _allProducts = [];
  List<ProductEntity> _filterCatalogProducts = [];
  String? _filterCatalogCategoryId;
  List<ProductEntity> _visibleProducts = [];
  List<ProductEntity>? _remoteSearchResults;
  bool _loading = true;
  bool _fetchingAll = false; // cursor pagination in progress
  bool _remoteSearching = false;
  final bool _hydratingFilterCatalog = false;
  bool _warmingFullFilterCatalog = false;

  // Facets — loaded from Typesense API (single fast query)
  // instead of fetching all products. Used for smartphone category.
  Map<String, List<FilterOption>> _typesenseFacets = {};
  bool _facetsLoaded = false;
  bool _cachedFacetsLoaded = false;
  String? _error;
  Timer? _scrollDebounce;
  Timer? _filterHydrationDebounce;
  Timer? _visibleProductsDebounce;
  int _totalProductCount = 0;
  int _visibleProductsRequestId = 0;

  // Page counter for PocketBase pagination
  int _currentPage = 1;

  // Runaway-pagination guards.
  // _lastFetchPixels: scroll offset where the last successful fetch fired.
  // _paginationCooldownUntil: blocks a new fetch until this moment passes,
  //   even if the listener fires (next-page request races with rebuild).
  double _lastFetchPixels = -1;
  DateTime _paginationCooldownUntil = DateTime.fromMillisecondsSinceEpoch(0);

  void _resetPaginationState({bool jumpToTop = true}) {
    _scrollDebounce?.cancel();
    _lastFetchPixels = -1;
    _paginationCooldownUntil = DateTime.fromMillisecondsSinceEpoch(0);

    if (!jumpToTop || !_scrollController.hasClients) return;

    final positions = _scrollController.positions;
    if (positions.length != 1) return;

    final position = positions.first;
    if (!position.hasPixels) return;

    try {
      position.jumpTo(0);
    } catch (_) {}
  }

  // ── Filter cache — computed once per products change, not on every build ──
  List<FilterDefinition>? _cachedFilterDefs;
  int _cachedProductCount = -1;
  String _cachedCategoryId = '';

  List<FilterDefinition> get _filterDefinitions {
    // When server facets are available, avoid scanning product specs here.
    // Large categories can have very wide spec maps, and doing dynamic Epey
    // discovery while opening the sheet can block Android input long enough to
    // trigger an ANR. Static category definitions plus live TS facets are enough
    // for the server-backed filter UI.
    final useServerFacetDefinitions = _typesenseFacets.isNotEmpty;
    final filterDefinitionProducts = useServerFacetDefinitions
        ? const <ProductEntity>[]
        : _filterDefinitionProducts;
    if (_cachedFilterDefs == null ||
        filterDefinitionProducts.length != _cachedProductCount ||
        _activeCategoryId != _cachedCategoryId ||
        _facetsLoaded != _cachedFacetsLoaded) {
      var defs = useServerFacetDefinitions
          ? FilterConfig.getFilters(_activeCategoryId)
          : FilterConfig.getFiltersWithProducts(
              _activeCategoryId,
              filterDefinitionProducts,
            );
      if (_typesenseFacets.isNotEmpty) {
        final coveredFacetKeys = <String>{};
        defs = defs
            .map(_definitionWithFacetOptions)
            .where(_hasServerSideDefinitionSupport)
            .map((def) {
              final key = def.id == 'brand'
                  ? 'brand'
                  : _facetKeyForFilterId(def.id);
              if (key.isNotEmpty) coveredFacetKeys.add(key);
              return def;
            })
            .toList(growable: true);

        for (final entry in _typesenseFacets.entries) {
          if (entry.key == 'brand' || coveredFacetKeys.contains(entry.key)) {
            continue;
          }
          if (!_isFacetKeyAllowedForCategory(entry.key)) continue;
          final options = _facetOptionsForKey(entry.key);
          if (options.isEmpty) continue;
          defs.add(
            FilterDefinition(
              id: entry.key,
              label: _labelForFacetKey(entry.key),
              type: _isBooleanFacet(options)
                  ? FilterType.toggle
                  : FilterType.multiSelect,
              options: options,
              isDynamic: true,
              specKeys: [entry.key],
            ),
          );
        }
      }
      _cachedFilterDefs = defs;
      _cachedProductCount = filterDefinitionProducts.length;
      _cachedCategoryId = _activeCategoryId;
      _cachedFacetsLoaded = _facetsLoaded;
    }
    return _cachedFilterDefs!;
  }

  bool _allLoaded = false;

  bool get _isSmartphoneCategory {
    final normalized = _activeCategoryId.toLowerCase().trim();
    return normalized == 'smartphones' || normalized == 'smartphone';
  }

  List<ProductEntity> get _filterDefinitionProducts =>
      _filterCatalogCategoryId == _activeCategoryId &&
          _filterCatalogProducts.length > _allProducts.length
      ? _filterCatalogProducts
      : _allProducts;

  bool get _isTurkish =>
      Localizations.localeOf(context).languageCode.toLowerCase() == 'tr';

  String get _languageCode =>
      Localizations.localeOf(context).languageCode.toLowerCase();

  String _fallbackText({required String en, required String tr}) {
    return _isTurkish ? tr : en;
  }

  String _localizedFilterLabel(String label) {
    return FilterConfig.localizeLabel(label, languageCode: _languageCode);
  }

  String _localizedFilterOption(String label) {
    return FilterConfig.localizeOptionLabel(label, languageCode: _languageCode);
  }

  String _quoteTypesenseValue(String value) {
    return '`${value.replaceAll('`', '')}`';
  }

  String _buildAnyOfClause(String field, Iterable<String> values) {
    final uniqueValues = values
        .where((value) => value.isNotEmpty)
        .toSet()
        .toList();
    if (uniqueValues.isEmpty) return '';
    if (uniqueValues.length == 1) {
      return '$field:=${_quoteTypesenseValue(uniqueValues.first)}';
    }
    return '(${uniqueValues.map((value) => '$field:=${_quoteTypesenseValue(value)}').join(' || ')})';
  }

  static const Map<String, String> _serverRangeFields = {
    'screen_size': 'screenSizeValue',
    'battery': 'batteryCapacityValue',
    'weight': 'weightValueKg',
    // Lowest price expressed in USD on the Typesense side (populated by
    // pb_hooks/typesense_sync.pb.js + scripts/ts_backfill_lowest_price.js).
    // The slider in the filter sheet shows local currency in the UI, but
    // the value travels to the server already converted to USD because the
    // _genericFilters price entry stores USD as its native unit.
    'price': 'lowestPriceUSD',
  };

  // Range filters that are universally applicable on Typesense — present in
  // the schema regardless of category, so the per-category allow-list does
  // not need to know about them.
  static const Set<String> _universalRangeFilters = {'price'};

  static const Map<String, Set<String>> _categoryRangeAllowList = {
    'smartphones': {'screen_size', 'battery', 'weight'},
    'laptops': {'screen_size', 'battery', 'weight'},
    'tablets': {'screen_size', 'battery', 'weight'},
    'smartwatches': {'screen_size', 'battery', 'weight'},
    'tvs': {'screen_size'},
    'monitors': {'screen_size'},
    'power_banks': {'battery'},
    'powerbanks': {'battery'},
  };

  static const Map<String, List<String>> _facetKeyAliases = {
    'capacity': ['storage'],
    'operating_system': ['os'],
    'os_version': ['os'],
    'screen_technology': ['screen_tech'],
    'panel_type': ['screen_tech'],
    'display': ['screen_tech'],
    'screen_type': ['screen_tech'],
    'processor': ['processor_brand'],
    'cpu': ['processor_brand'],
    'graphics': ['gpu_type'],
    'connection_type': ['connectivity'],
    'wireless': ['connectivity'],
    'bluetooth': ['bluetooth_version'],
    'usb': ['usb_type'],
    'waterproof': ['water_resistance'],
  };

  static const Map<String, Map<String, List<String>>> _categoryFacetAliases = {
    'ram': {
      'capacity': ['ram'],
    },
    'ssd': {
      'capacity': ['storage'],
    },
    'cpus': {
      'processor_brand': ['processor_brand'],
      'socket': ['socket'],
    },
    'processors': {
      'processor_brand': ['processor_brand'],
      'socket': ['socket'],
    },
    'tvs': {
      'panel_type': ['screen_tech'],
      'smart_tv': ['os'],
    },
  };

  static const Map<String, Set<String>> _categoryFacetAllowList = {
    'smartphones': {
      'ram',
      'storage',
      'os',
      'screen_tech',
      'refresh_rate',
      'processor_brand',
      'gpu_type',
      'usb_type',
      'five_g',
      'nfc',
      'fingerprint',
      'fast_charging',
      'wireless_charging',
      'water_resistance',
    },
    'laptops': {
      'ram',
      'storage',
      'os',
      'screen_tech',
      'refresh_rate',
      'processor_brand',
      'gpu_type',
    },
    'tablets': {
      'ram',
      'storage',
      'os',
      'screen_tech',
      'refresh_rate',
      'processor_brand',
      'nfc',
      'water_resistance',
    },
    'smartwatches': {
      'ram',
      'storage',
      'os',
      'screen_tech',
      'processor_brand',
      'nfc',
      'water_resistance',
    },
    'tvs': {'ram', 'storage', 'os', 'screen_tech', 'refresh_rate'},
    'media-players': {'ram', 'storage', 'os', 'processor_brand', 'gpu_type'},
    'cpus': {'processor_brand', 'socket'},
    'processors': {'processor_brand', 'socket'},
    'motherboards': {'socket'},
    'motherboard': {'socket'},
    'ssd': {'storage'},
    'ram': {'ram'},
    'desktops': {'ram', 'storage', 'processor_brand', 'gpu_type', 'os'},
    'consoles': {'storage'},
    'soundbars': {'nfc'},
    'speakers': {'nfc', 'water_resistance'},
  };

  static const Map<String, Set<String>> _facetAllowedValues = {
    'ram': {
      '1_gb',
      '2_gb',
      '3_gb',
      '4_gb',
      '5_gb',
      '6_gb',
      '8_gb',
      '10_gb',
      '12_gb',
      '16_gb',
      '18_gb',
      '24_gb',
      '32_gb',
      '48_gb',
      '64_gb',
      '128_gb',
    },
    'storage': {
      '1_gb',
      '2_gb',
      '4_gb',
      '8_gb',
      '16_gb',
      '32_gb',
      '64_gb',
      '120_gb',
      '128_gb',
      '240_gb',
      '250_gb',
      '256_gb',
      '480_gb',
      '500_gb',
      '512_gb',
      '960_gb',
      '1_tb',
      '2_tb',
      '4_tb',
    },
  };

  static const Map<String, String> _facetLabelOverrides = {
    'brand': 'Brand',
    'ram': 'RAM',
    'storage': 'Storage',
    'os': 'Operating System',
    'screen_tech': 'Screen Technology',
    'refresh_rate': 'Refresh Rate',
    'processor_brand': 'Processor Brand',
    'socket': 'Socket',
    'gpu_type': 'GPU Type',
    'connectivity': 'Connectivity',
    'usb_type': 'USB Type',
    'usb_version': 'USB Version',
    'bluetooth_version': 'Bluetooth Version',
    'five_g': '5G',
    'four_half_g': '4.5G Support',
    'nfc': 'NFC',
    'wireless_charging': 'Wireless Charging',
    'fast_charging': 'Fast Charging',
    'fingerprint': 'Fingerprint Reader',
    'water_resistance': 'Water Resistance',
  };

  String get _facetCategoryKey => _activeCategoryId.toLowerCase().trim();

  Iterable<String> _facetCandidatesForFilterId(String filterId) sync* {
    yield filterId;
    for (final alias
        in _categoryFacetAliases[_facetCategoryKey]?[filterId] ??
            const <String>[]) {
      yield alias;
    }
    for (final alias in _facetKeyAliases[filterId] ?? const <String>[]) {
      yield alias;
    }
  }

  bool _isFacetKeyAllowedForCategory(String key) {
    if (key == 'brand') return true;
    final allowed = _categoryFacetAllowList[_facetCategoryKey];
    if (allowed == null) return false;
    return allowed.contains(key);
  }

  bool get _supportsLocalOnlyEpeyFilters {
    return _facetCategoryKey == 'cpus' || _facetCategoryKey == 'processors';
  }

  bool _isLocalOnlyEpeyDefinition(FilterDefinition def) {
    if (!_supportsLocalOnlyEpeyFilters) return false;
    const localProcessorFilters = {
      'processor_family',
      'series',
      'generation',
      'architecture',
      'cores',
      'socket',
      'tdp',
      'integrated_gpu',
    };
    return localProcessorFilters.contains(def.id);
  }

  String _facetKeyForFilterId(String filterId) {
    for (final candidate in _facetCandidatesForFilterId(filterId)) {
      if (_typesenseFacets.containsKey(candidate) &&
          _isFacetKeyAllowedForCategory(candidate)) {
        return candidate;
      }
    }
    return '';
  }

  List<FilterOption> _facetOptionsForKey(String key) {
    final options = _typesenseFacets[key] ?? const <FilterOption>[];
    final allowedValues = _facetAllowedValues[key];
    final filtered = allowedValues == null
        ? options
        : options.where((option) => allowedValues.contains(option.id)).toList();
    return filtered.take(80).toList(growable: false);
  }

  String _labelForFacetKey(String key) {
    final override = _facetLabelOverrides[key];
    if (override != null) return override;
    return key
        .split('_')
        .where((part) => part.isNotEmpty)
        .map(
          (part) => part.length <= 3
              ? part.toUpperCase()
              : part[0].toUpperCase() + part.substring(1),
        )
        .join(' ');
  }

  bool _isBooleanFacet(List<FilterOption> options) {
    if (options.isEmpty) return false;
    return options.every(
      (option) => option.id == 'true' || option.id == 'false',
    );
  }

  bool _hasServerSideDefinitionSupport(FilterDefinition def) {
    if (def.id == 'brand') return true;
    switch (def.type) {
      case FilterType.multiSelect:
        final key = _facetKeyForFilterId(def.id);
        return (key.isNotEmpty && _facetOptionsForKey(key).isNotEmpty) ||
            _isLocalOnlyEpeyDefinition(def);
      case FilterType.toggle:
        final key = _facetKeyForFilterId(def.id);
        return (key.isNotEmpty &&
                (_typesenseFacets[key]?.any((option) => option.id == 'true') ??
                    false)) ||
            _isLocalOnlyEpeyDefinition(def);
      case FilterType.rangeSlider:
        // Universal range filters (price) are server-side filterable for every
        // category because their TS field exists on every document. Other
        // ranges are gated by the per-category allow-list because their
        // values are only meaningful in specific categories (e.g. screen_size
        // for laptops/phones but not for cables).
        if (_universalRangeFilters.contains(def.id) &&
            _serverRangeFields.containsKey(def.id)) {
          return true;
        }
        return (_serverRangeFields.containsKey(def.id) &&
                (_categoryRangeAllowList[_facetCategoryKey]?.contains(def.id) ??
                    false)) ||
            _isLocalOnlyEpeyDefinition(def);
    }
  }

  FilterDefinition _definitionWithFacetOptions(FilterDefinition def) {
    if (def.id == 'brand') {
      return def.withOptions(_typesenseFacets['brand'] ?? def.options ?? []);
    }
    final key = _facetKeyForFilterId(def.id);
    final options = key.isEmpty ? null : _facetOptionsForKey(key);
    if (options == null || options.isEmpty) return def;
    return def.withOptions(options);
  }

  String? _buildServerSideFilterBy(FilterState state) {
    if (!state.isActive) return null;

    final clauses = <String>[];

    for (final entry in state.multiSelect.entries) {
      final selected = entry.value;
      if (selected.isEmpty) continue;

      if (entry.key == 'brand') {
        final brandOptions =
            _typesenseFacets['brand'] ?? const <FilterOption>[];
        final selectedLabels = brandOptions
            .where((option) => selected.contains(option.id))
            .map((option) => option.label.trim())
            .where((label) => label.isNotEmpty)
            .toList(growable: false);
        final clause = _buildAnyOfClause('brand', selectedLabels);
        if (clause.isEmpty) return null;
        clauses.add(clause);
        continue;
      }

      final tokenKey = _facetKeyForFilterId(entry.key);
      if (tokenKey.isEmpty && _supportsLocalOnlyEpeyFilters) return null;
      if (tokenKey.isEmpty) return null;
      final allowedOptionIds = _facetOptionsForKey(
        tokenKey,
      ).map((option) => option.id).toSet();
      if (!selected.every(allowedOptionIds.contains)) return null;
      final clause = _buildAnyOfClause(
        'filterTokens',
        selected.map((id) => '$tokenKey:$id'),
      );
      if (clause.isNotEmpty) clauses.add(clause);
    }

    for (final entry in state.ranges.entries) {
      final field = _serverRangeFields[entry.key];
      if (field == null && _supportsLocalOnlyEpeyFilters) return null;
      if (field == null) return null;
      final range = entry.value;

      // Typesense 'int32' fields strictly reject string values ending in '.0'.
      // For integers, remove the trailing .0 before sending to the search engine.
      final startStr = range.start == range.start.toInt()
          ? range.start.toInt().toString()
          : range.start.toString();
      final endStr = range.end == range.end.toInt()
          ? range.end.toInt().toString()
          : range.end.toString();

      clauses.add('$field:>=$startStr');
      clauses.add('$field:<=$endStr');
    }

    for (final entry in state.toggles.entries) {
      final value = entry.value;
      if (value == null) continue;
      final tokenKey = _facetKeyForFilterId(entry.key);
      if (tokenKey.isEmpty && _supportsLocalOnlyEpeyFilters) return null;
      if (tokenKey.isEmpty) return null;
      final optionId = value ? 'true' : 'false';
      final hasOption = _facetOptionsForKey(
        tokenKey,
      ).any((option) => option.id == optionId);
      if (hasOption) {
        final token = '$tokenKey:$optionId';
        clauses.add('filterTokens:=${_quoteTypesenseValue(token)}');
      } else if (!value) {
        final trueToken = '$tokenKey:true';
        clauses.add('filterTokens:!=${_quoteTypesenseValue(trueToken)}');
      } else {
        return null;
      }
    }

    return clauses.isEmpty ? null : clauses.join(' && ');
  }

  bool _usesServerSideFiltering({FilterState? state, String? query}) {
    final effectiveQuery = query ?? _searchQuery;
    if (effectiveQuery.isNotEmpty) return false;
    return _buildServerSideFilterBy(state ?? _filterState) != null;
  }

  /// Extra Typesense filter clauses required by the active sort option,
  /// independent of the user's filter selections. For price sorts we exclude
  /// products without a known USD price (lowestPriceUSD == 0) so the list
  /// never starts with "$0" placeholders. Returns null when the sort imposes
  /// no extra constraints.
  String? _sortDrivenFilterBy() {
    switch (_sortOption) {
      case _SortOption.priceAsc:
      case _SortOption.priceDesc:
        return 'lowestPriceUSD:>0';
      case _SortOption.techScore:
      case _SortOption.relevance:
      case _SortOption.newest:
        return null;
    }
  }

  /// Combines user-driven filter clauses with sort-driven ones into a single
  /// `filter_by` string for Typesense. Either side may be absent.
  String? _composeExtraFilterBy(FilterState state) {
    final userFilter = _buildServerSideFilterBy(state);
    final sortFilter = _sortDrivenFilterBy();
    if (userFilter == null && sortFilter == null) return null;
    if (userFilter == null) return sortFilter;
    if (sortFilter == null) return userFilter;
    return '$userFilter && $sortFilter';
  }

  @override
  void initState() {
    super.initState();
    _activeCategoryId = widget.categoryId;
    _activeCategoryName = widget.categoryName;
    _loadProducts();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollDebounce?.cancel();
    _filterHydrationDebounce?.cancel();
    _visibleProductsDebounce?.cancel();
    _scrollController.dispose();
    super.dispose();
  }

  Map<String, dynamic> _serializeProductForBrowse(ProductEntity product) {
    if (product is ProductModel) {
      return product.toMap();
    }
    return {
      'id': product.id,
      'name': product.name,
      'brand': product.brand,
      'category': product.category,
      'subcategory': product.subcategory,
      'description': product.description,
      'imageURL': product.imageURL,
      'prices': product.prices,
      'affiliateLinks': product.affiliateLinks,
      'specs': product.specs,
      'specSections': product.specSections,
      'keySpecs': product.keySpecs,
      'ratings': {
        'expert': product.ratings.expert,
        'community': product.ratings.community,
        'count': product.ratings.count,
      },
      'pros': product.pros,
      'cons': product.cons,
      'tags': product.tags,
      'trendScore': product.trendScore,
      'techScore': product.techScore,
      'techSubscores': product.techSubscores,
      'images': product.images,
      'lastUpdated': product.lastUpdated.toIso8601String(),
      if (product.createdAt != null)
        'createdAt': product.createdAt!.toIso8601String(),
      'isActive': product.isActive,
      'variantGroup': product.variantGroup,
    };
  }

  void _setVisibleProductsFromLoaded() {
    _visibleProductsDebounce?.cancel();
    _visibleProductsRequestId++;
    _visibleProducts = List<ProductEntity>.from(_allProducts);
  }

  void _scheduleVisibleProductsRebuild({Duration debounce = Duration.zero}) {
    _visibleProductsDebounce?.cancel();

    if (_searchQuery.isEmpty && !_filterState.isActive) {
      if (!mounted) return;
      setState(() {
        _setVisibleProductsFromLoaded();
      });
      return;
    }

    final requestId = ++_visibleProductsRequestId;
    void runner() {
      unawaited(_rebuildVisibleProducts(requestId));
    }

    if (debounce == Duration.zero) {
      runner();
    } else {
      _visibleProductsDebounce = Timer(debounce, runner);
    }
  }

  Future<void> _rebuildVisibleProducts(int requestId) async {
    final allProducts = List<ProductEntity>.from(
      _filterState.isActive && !_usesServerSideFiltering()
          ? _filterDefinitionProducts
          : _allProducts,
    );
    final remoteProducts = List<ProductEntity>.from(
      _remoteSearchResults ?? const <ProductEntity>[],
    );
    final definitions = _filterDefinitions;
    final sourceById = <String, ProductEntity>{
      for (final product in [...allProducts, ...remoteProducts])
        product.id: product,
    };

    final orderedIds = await compute(_computeVisibleBrowseProductIds, {
      'products': allProducts
          .map(_serializeProductForBrowse)
          .toList(growable: false),
      'remoteProducts': remoteProducts
          .map(_serializeProductForBrowse)
          .toList(growable: false),
      'filterState': _serializeFilterStateForBrowse(_filterState),
      'definitions': definitions
          .map(_serializeFilterDefinitionForBrowse)
          .toList(growable: false),
      'query': _searchQuery,
      'sortKey': _sortOption.name,
    });

    if (!mounted || requestId != _visibleProductsRequestId) return;

    final visibleProducts = orderedIds
        .map((id) => sourceById[id])
        .whereType<ProductEntity>()
        .toList(growable: false);

    setState(() {
      _visibleProducts = visibleProducts;
    });
  }

  void _applyFilterState(FilterState result) {
    final shouldReload =
        _usesServerSideFiltering() || _usesServerSideFiltering(state: result);
    setState(() => _filterState = result);
    if (shouldReload) {
      _filterHydrationDebounce?.cancel();
      _remoteSearchResults = null;
      unawaited(_loadProducts());
      return;
    }
    _scheduleVisibleProductsRebuild();
    _filterHydrationDebounce?.cancel();
    if (!result.isActive || _allLoaded) return;
    _filterHydrationDebounce = Timer(const Duration(milliseconds: 300), () {
      if (!mounted || !result.isActive) return;
      unawaited(_ensureCompleteCatalogForFiltering());
    });
  }

  void _onSearchQueryChanged(String q) {
    setState(() {
      _searchQuery = q;
      if (q.isEmpty) _remoteSearchResults = null;
    });
    if (_usesServerSideFiltering(query: q)) {
      unawaited(_loadProducts());
      return;
    }
    _scheduleVisibleProductsRebuild();
    if (q.length >= 2) _doRemoteSearch(q);
  }

  /// Remote search via Cloud Function — returns ALL matching products from server.
  Future<void> _doRemoteSearch(String query) async {
    if (!mounted || query.isEmpty) return;
    setState(() => _remoteSearching = true);
    try {
      final ds = ref.read(pbDataSourceProvider);
      final results = await ds.searchProducts(
        query: query,
        limit: 150,
        category: _activeCategoryId,
      );
      if (mounted && _searchQuery == query) {
        final catKey = _activeCategoryId.toLowerCase().trim();
        // Accept both exact match and variant (e.g. "microphone" vs "microphones")
        final categoryResults = _sanitizeCategoryProducts(
          results
              .where((p) {
                final pCat = p.category.toLowerCase().trim();
                return pCat == catKey ||
                    (catKey.endsWith('s') &&
                        pCat == catKey.substring(0, catKey.length - 1)) ||
                    (!catKey.endsWith('s') && pCat == '${catKey}s');
              })
              .cast<ProductEntity>()
              .toList(),
        );

        setState(() {
          // ALL remote results — let _filteredProducts merge with local
          _remoteSearchResults = rankProductsForQuery(categoryResults, query);
          _remoteSearching = false;
        });
        _scheduleVisibleProductsRebuild();
      }
    } catch (e) {
      if (mounted) setState(() => _remoteSearching = false);
    }
  }

  void _onScroll() {
    // Cheap pre-check to avoid scheduling timers when nothing can fire.
    if (!mounted ||
        !_scrollController.hasClients ||
        _fetchingAll ||
        _hydratingFilterCatalog ||
        _allLoaded) {
      return;
    }
    _scrollDebounce?.cancel();
    _scrollDebounce = Timer(const Duration(milliseconds: 150), () {
      // All guards must be re-checked inside the debounce: state can change
      // between scheduling and firing (route pop, dispose, fetch already started).
      if (!mounted ||
          !_scrollController.hasClients ||
          _fetchingAll ||
          _hydratingFilterCatalog ||
          _allLoaded) {
        return;
      }

      // _scrollController.position throws Bad state: No element when there are
      // zero attached positions and Bad state: Too many elements when there
      // are multiple (e.g. nested CustomScrollViews briefly sharing the
      // controller during transitions). Reading .positions sidesteps both.
      final positions = _scrollController.positions;
      if (positions.length != 1) return;
      final position = positions.first;
      if (!position.hasContentDimensions) return;

      final pixels = position.pixels;
      final maxExtent = position.maxScrollExtent;
      if (maxExtent <= 0) return;

      // Pagination cooldown: blocks back-to-back fetches even if the listener
      // re-fires while the previously-fetched page is still being laid out
      // (maxScrollExtent hasn't grown yet → user is still in the trigger zone).
      if (DateTime.now().isBefore(_paginationCooldownUntil)) return;

      // Require the user to actually scroll meaningfully since the last fetch,
      // not just sit at the bottom while pages stream in.
      if (_lastFetchPixels >= 0 && (pixels - _lastFetchPixels).abs() < 200) {
        return;
      }

      if (pixels >= maxExtent - 400) {
        _lastFetchPixels = pixels;
        _paginationCooldownUntil = DateTime.now().add(
          const Duration(milliseconds: 600),
        );
        _fetchNextPage();
      }
    });
  }

  List<ProductEntity> _sanitizeCategoryProducts(
    Iterable<ProductEntity> products,
  ) {
    // Category browse is intentional navigation — show all non-defunct brands.
    // Strict whitelist is only for discovery feeds where quality matters more.
    final filtered = ProductFilter.filterRelaxed(products.toList());
    final uniqueIds = <String>{};
    return filtered.where((product) => uniqueIds.add(product.id)).toList();
  }

  String _serverSortBy() {
    switch (_sortOption) {
      case _SortOption.techScore:
        return 'techScore:desc,trendScore:desc';
      case _SortOption.relevance:
        return 'trendScore:desc,techScore:desc';
      case _SortOption.newest:
        return 'trendScore:desc,techScore:desc';
      case _SortOption.priceAsc:
        // Typesense excludes `0` from ascending price sort by clamping it to
        // the bottom via secondary techScore descending — products with
        // unknown prices keep a deterministic order.
        return 'lowestPriceUSD:asc,techScore:desc';
      case _SortOption.priceDesc:
        return 'lowestPriceUSD:desc,techScore:desc';
    }
  }

  /// Returns the number of products to display in the sort bar.
  /// Returns -1 when no filter / no search is applied — the sort bar uses
  /// this to hide the count entirely. Per UX guideline: only show the
  /// count when the user has narrowed the list via search or filters.
  int _displayProductCount(int filteredCount) {
    if (_searchQuery.isNotEmpty) return filteredCount;
    if (_filterState.isActive) {
      if (_usesServerSideFiltering() && _totalProductCount > 0) {
        return _totalProductCount;
      }
      return filteredCount;
    }
    return -1; // hide
  }

  Future<void> _changeSortOption(_SortOption option) async {
    if (_sortOption == option) return;
    setState(() {
      _sortOption = option;
      _loading = true;
      _allLoaded = false;
      _currentPage = 1;
      _allProducts = [];
      _visibleProducts = [];
      _remoteSearchResults = null;
    });
    await _loadProducts();
  }

  /// Loads brand facets from Typesense for the current category.
  /// Single lightweight request (per_page=0, facet_by=brand) — replaces the
  /// old approach of fetching all 4115+ products which caused ANR/crashes.
  Future<void> _loadFacets() async {
    if (_facetsLoaded && _filterCatalogCategoryId == _activeCategoryId) {
      return;
    }
    try {
      final ds = ref.read(pbDataSourceProvider);
      final facets = await ds.getTypesenseFacets(
        category: _activeCategoryId,
        facets: ['brand', 'filterTokens'],
        maxFacetValues: 80,
      );
      if (!mounted || facets.isEmpty) return;
      setState(() {
        _typesenseFacets = facets;
        _facetsLoaded = true;
        _filterCatalogCategoryId = _activeCategoryId;
        _cachedFilterDefs = null;
      });
    } catch (e) {
      debugPrint('=== QOR AI: _loadFacets FAILED: $e ===');
    }
  }

  Future<void> _warmFullFilterCatalogIfNeeded({
    bool showIndicator = true,
  }) async {
    if (!mounted) return;
    // Only load facets (single lightweight per_page=0 query).
    // Full product catalog loading caused ANR on large categories (6000+ products).
    if (_facetsLoaded && _filterCatalogCategoryId == _activeCategoryId) return;
    if (_warmingFullFilterCatalog) return;

    if (mounted && showIndicator) {
      setState(() => _warmingFullFilterCatalog = true);
    } else {
      _warmingFullFilterCatalog = showIndicator;
    }

    try {
      await _loadFacets();
    } finally {
      if (mounted) {
        setState(() => _warmingFullFilterCatalog = false);
      } else {
        _warmingFullFilterCatalog = false;
      }
    }
  }

  /// Fetch next page via Typesense pagination only when the user scrolls.
  Future<void> _fetchNextPage() async {
    if (_fetchingAll || _allLoaded || !mounted) return;
    setState(() => _fetchingAll = true);
    try {
      final ds = ref.read(pbDataSourceProvider);
      final serverFilterBy = _composeExtraFilterBy(_filterState);
      final page = await ds.getProductsPageTs(
        category: _activeCategoryId,
        limit: 40,
        page: _currentPage,
        sortBy: _serverSortBy(),
        extraFilterBy: _searchQuery.isEmpty ? serverFilterBy : null,
      );
      if (!mounted) return;
      final existingIds = _allProducts.map((p) => p.id).toSet();
      final newProducts = _sanitizeCategoryProducts(
        page.products,
      ).where((p) => !existingIds.contains(p.id)).toList();
      final merged = [..._allProducts, ...newProducts];
      setState(() {
        _allProducts = merged;
        _currentPage = page.nextPage;
        _allLoaded = !page.hasMore;
        _fetchingAll = false;
        // Once all pages loaded, show true deduped count; otherwise Typesense total.
        _totalProductCount = !page.hasMore ? merged.length : page.totalFound;
        if (_searchQuery.isEmpty &&
            (!_filterState.isActive || serverFilterBy != null)) {
          _visibleProducts = merged;
        }
      });
      if (_searchQuery.isNotEmpty ||
          (_filterState.isActive && serverFilterBy == null)) {
        _scheduleVisibleProductsRebuild(
          debounce: const Duration(milliseconds: 32),
        );
      }
    } catch (e) {
      // Network/timeout failures must not leave _fetchingAll stuck — that
      // would silently freeze pagination forever. Extend cooldown to back off.
      if (mounted) {
        setState(() => _fetchingAll = false);
        _paginationCooldownUntil = DateTime.now().add(
          const Duration(seconds: 3),
        );
      }
    }
  }

  /// Load first page quickly and defer the rest until scroll.
  Future<void> _loadProducts() async {
    _resetPaginationState();
    setState(() {
      _loading = true;
      _error = null;
      _allLoaded = false;
      _fetchingAll = false;
      _currentPage = 1;
      _allProducts = [];
      _visibleProducts = [];
      _totalProductCount = 0;
      if (_filterCatalogCategoryId != _activeCategoryId) {
        _filterCatalogProducts = [];
        _filterCatalogCategoryId = null;
        _typesenseFacets = {};
        _facetsLoaded = false;
      }
    });
    final catKey = _activeCategoryId.toLowerCase().trim();
    final hiveCacheKey = 'cat_products_${catKey}_v2';

    try {
      final cache = ref.read(cacheServiceProvider);
      final stale = cache.getLocalStale<List<dynamic>>(hiveCacheKey);
      if (stale.data != null && (stale.data as List).isNotEmpty) {
        final products = _sanitizeCategoryProducts(
          (stale.data as List)
              .map(
                (item) => ProductModel.fromMap(
                  Map<String, dynamic>.from(item as Map),
                ),
              )
              .cast<ProductEntity>()
              .toList(),
        );
        if (products.isNotEmpty && mounted) {
          setState(() {
            _allProducts = products;
            _visibleProducts = products;
            _loading = false;
          });
        }
      }
    } catch (_) {}

    try {
      final feedAsync = ref.read(homeFeedProvider);
      final cached = feedAsync.valueOrNull;
      if (cached != null && cached.all.isNotEmpty) {
        final catProducts = _sanitizeCategoryProducts(
          cached.all.where((p) {
            final pCat = p.category.toLowerCase().trim();
            return pCat == catKey ||
                (catKey.endsWith('s') &&
                    pCat == catKey.substring(0, catKey.length - 1)) ||
                (!catKey.endsWith('s') && pCat == '${catKey}s');
          }).toList(),
        );
        if (catProducts.isNotEmpty && mounted) {
          if (_allProducts.isEmpty) {
            setState(() {
              _allProducts = catProducts;
              _visibleProducts = catProducts;
              _loading = false;
            });
          } else {
            final existingIds = _allProducts.map((p) => p.id).toSet();
            final extras = catProducts
                .where((p) => !existingIds.contains(p.id))
                .toList();
            if (extras.isNotEmpty) {
              setState(() {
                _allProducts = [..._allProducts, ...extras];
                if (_searchQuery.isEmpty && !_filterState.isActive) {
                  _visibleProducts = [..._allProducts, ...extras];
                }
                _loading = false;
              });
            }
          }
        }
      }
    } catch (_) {}

    try {
      final ds = ref.read(pbDataSourceProvider);
      final serverFilterBy = _composeExtraFilterBy(_filterState);
      final result = await ds.getProductsPageTs(
        category: _activeCategoryId,
        limit: 40,
        page: 1,
        sortBy: _serverSortBy(),
        extraFilterBy: _searchQuery.isEmpty ? serverFilterBy : null,
      );
      if (!mounted) return;
      final firstPage = _sanitizeCategoryProducts(result.products);
      if (_sortOption == _SortOption.techScore && firstPage.isNotEmpty) {
        try {
          final cache = ref.read(cacheServiceProvider);
          final maps = firstPage
              .whereType<ProductModel>()
              .map((product) => product.toMap())
              .toList();
          if (maps.isNotEmpty) {
            cache.setLocal(
              hiveCacheKey,
              maps,
              duration: const Duration(hours: 12),
            );
          }
        } catch (_) {}
      }
      setState(() {
        _allProducts = firstPage;
        _visibleProducts = firstPage;
        _currentPage = result.nextPage;
        _allLoaded = !result.hasMore;
        // Use actual deduped count when all pages are loaded; otherwise
        // show Typesense total as an upper bound (paginating categories).
        _totalProductCount = (!result.hasMore)
            ? firstPage.length
            : result.totalFound;
        _loading = false;
        _error = null;
      });
      if (_searchQuery.isNotEmpty ||
          (_filterState.isActive && serverFilterBy == null)) {
        _scheduleVisibleProductsRebuild();
      }
    } catch (e) {
      // Only surface an error if no products at all are visible — otherwise
      // we already have stale/cached data and the user can still browse.
      if (!mounted) return;
      setState(() {
        _loading = false;
        if (_allProducts.isEmpty) {
          _error = _isTurkish
              ? 'Bağlantı zaman aşımı. İnternetinizi kontrol edip tekrar deneyin.'
              : 'Connection timed out. Check your internet and retry.';
        }
      });
    }
  }

  Future<void> _openFilters() async {
    if (!_facetsLoaded || _filterCatalogCategoryId != _activeCategoryId) {
      await _warmFullFilterCatalogIfNeeded(showIndicator: true);
      if (!mounted) return;
    }
    final result = await showFilterBottomSheet(
      context: context,
      categoryId: _activeCategoryId,
      initialState: _filterState,
      products: _filterDefinitionProducts,
      // Pass pre-built definitions with brand facets already injected.
      definitions: _filterDefinitions,
    );
    if (result != null && mounted) {
      _applyFilterState(result);
    }
  }

  Future<void> _ensureCompleteCatalogForFiltering() async {
    if (_isSmartphoneCategory) {
      await _warmFullFilterCatalogIfNeeded(showIndicator: true);
      if (mounted && _filterState.isActive && !_usesServerSideFiltering()) {
        _scheduleVisibleProductsRebuild(
          debounce: const Duration(milliseconds: 16),
        );
      }
      return;
    }
    if (_supportsLocalOnlyEpeyFilters &&
        _filterState.isActive &&
        !_usesServerSideFiltering()) {
      await _loadAllProductsForLocalFiltering();
      return;
    }
    // For non-smartphone categories, server-side filtering via Typesense handles
    // all filterToken-based multiSelect filters. No need to load the full catalog.
    // Just ensure facets are loaded so filter options are populated.
    if (!_facetsLoaded) {
      await _warmFullFilterCatalogIfNeeded(showIndicator: false);
    }
  }

  Future<void> _loadAllProductsForLocalFiltering() async {
    if (_fetchingAll || _allLoaded || !mounted) return;
    setState(() => _fetchingAll = true);
    try {
      final ds = ref.read(pbDataSourceProvider);
      var pageNumber = _currentPage;
      var hasMore = true;
      final byId = {for (final product in _allProducts) product.id: product};

      while (mounted && hasMore) {
        final page = await ds.getProductsPageTs(
          category: _activeCategoryId,
          limit: 100,
          page: pageNumber,
          sortBy: _serverSortBy(),
        );
        for (final product in _sanitizeCategoryProducts(page.products)) {
          byId.putIfAbsent(product.id, () => product);
        }
        pageNumber = page.nextPage;
        hasMore = page.hasMore;
      }

      if (!mounted) return;
      setState(() {
        _allProducts = byId.values.toList(growable: false);
        _filterCatalogProducts = _allProducts;
        _filterCatalogCategoryId = _activeCategoryId;
        _currentPage = pageNumber;
        _allLoaded = true;
        _fetchingAll = false;
        _totalProductCount = _allProducts.length;
        _cachedFilterDefs = null;
      });
      _scheduleVisibleProductsRebuild(
        debounce: const Duration(milliseconds: 16),
      );
    } catch (_) {
      if (mounted) setState(() => _fetchingAll = false);
    }
  }

  void _removeFilter(String filterId) {
    final newMultiSelect = Map<String, Set<String>>.from(
      _filterState.multiSelect,
    )..remove(filterId);
    final newRanges = Map<String, RangeValues>.from(_filterState.ranges)
      ..remove(filterId);
    final newToggles = Map<String, bool?>.from(_filterState.toggles)
      ..remove(filterId);
    _applyFilterState(
      FilterState(
        multiSelect: newMultiSelect,
        ranges: newRanges,
        toggles: newToggles,
      ),
    );
  }

  // ── build ─────────────────────────────────────────────────────────────────

  Widget _buildSubcategoryChips() {
    return SizedBox(
      height: 44,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        itemCount: widget.groupItems!.length,
        itemBuilder: (context, index) {
          final item = widget.groupItems![index];
          final id = item['id'] as String? ?? '';
          final itemName = item['name'] as String? ?? id;
          final isActive = _activeCategoryId == id;
          return GestureDetector(
            onTap: () {
              if (!isActive) {
                HapticFeedback.selectionClick();
                setState(() {
                  _activeCategoryId = id;
                  _activeCategoryName = itemName;
                  _allProducts = [];
                  _filterCatalogProducts = [];
                  _filterCatalogCategoryId = null;
                  _typesenseFacets = {};
                  _facetsLoaded = false;
                  _visibleProducts = [];
                  _searchBarKey.currentState?.clear();
                  _searchQuery = '';
                  _filterState = const FilterState();
                });
                _loadProducts();
              }
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              margin: const EdgeInsets.only(right: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                gradient: isActive ? AppTheme.primaryGradient : null,
                color: isActive ? null : context.surfaceVariantColor,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: isActive ? Colors.transparent : context.dividerColor,
                  width: 0.5,
                ),
              ),
              child: Text(
                itemName,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: isActive ? Colors.white : context.textSecondary,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _visibleProducts;

    return Scaffold(
      backgroundColor: context.backgroundColor,
      resizeToAvoidBottomInset: false,
      appBar: _buildAppBar(),
      body: Column(
        children: [
          if (widget.groupItems != null && widget.groupItems!.length > 1)
            _buildSubcategoryChips(),
          _buildSearchBar(),
          _buildSortBar(_displayProductCount(filtered.length)),
          if (_filterState.isActive) _buildActiveFilterChips(),
          Expanded(child: _buildBody(filtered)),
        ],
      ),
    );
  }

  AppBar _buildAppBar() {
    return AppBar(
      backgroundColor: context.backgroundColor,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
      leading: Padding(
        padding: const EdgeInsets.all(8),
        child: Container(
          decoration: BoxDecoration(
            color: context.surfaceVariantColor,
            shape: BoxShape.circle,
            border: Border.all(color: context.dividerColor),
            boxShadow: AppTheme.cardShadow,
          ),
          child: IconButton(
            icon: Icon(
              Icons.arrow_back_ios_new,
              color: context.textPrimary,
              size: 16,
            ),
            onPressed: () => context.pop(),
            padding: EdgeInsets.zero,
          ),
        ),
      ),
      title: Text(
        _activeCategoryName,
        style: GoogleFonts.plusJakartaSans(
          color: context.textPrimary,
          fontWeight: FontWeight.w700,
          fontSize: 18,
        ),
      ),
      actions: const [],
    );
  }

  Widget _buildSearchBar() {
    return _IsolatedSearchBar(
      key: _searchBarKey,
      categoryName: _activeCategoryName,
      onQueryChanged: _onSearchQueryChanged,
    );
  }

  Widget _buildSortBar(int productCount) {
    final hasFilters = _filterState.isActive;
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            context.surfaceVariantColor,
            context.surfaceVariantColor.withValues(alpha: 0.94),
          ],
        ),
        border: Border(
          top: BorderSide(color: context.dividerColor.withValues(alpha: 0.5)),
          bottom: BorderSide(
            color: context.dividerColor.withValues(alpha: 0.35),
          ),
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        children: [
          // Product count — hidden when nothing is filtered/searched.
          if (productCount >= 0)
            Text(
              _fetchingAll || _loading
                  ? '...'
                  : '$productCount ${_fallbackText(en: 'Products', tr: 'Ürün')}',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: context.textSecondary,
              ),
            ),
          if (_searchQuery.isNotEmpty) ...[
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                '"$_searchQuery"',
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.brandCyan,
                ),
              ),
            ),
          ] else
            const Spacer(),
          _SortDropdown(value: _sortOption, onChanged: _changeSortOption),
          SizedBox(width: 8),
          // Filter button
          GestureDetector(
            onTap: _openFilters,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                gradient: hasFilters ? AppTheme.primaryGradient : null,
                color: hasFilters ? null : context.backgroundColor,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: hasFilters ? Colors.transparent : context.dividerColor,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.tune_rounded,
                    size: 13,
                    color: hasFilters ? Colors.white : context.textSecondary,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    context.l10n?.filterLabel ?? 'Filter',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: hasFilters ? Colors.white : context.textSecondary,
                    ),
                  ),
                  if (hasFilters) ...[
                    const SizedBox(width: 4),
                    Container(
                      width: 15,
                      height: 15,
                      decoration: const BoxDecoration(
                        color: Colors.white30,
                        shape: BoxShape.circle,
                      ),
                      child: Center(
                        child: Text(
                          '${_filterState.activeCount}',
                          style: const TextStyle(
                            fontSize: 9,
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          if (_hydratingFilterCatalog || _warmingFullFilterCatalog) ...[
            const SizedBox(width: 8),
            const SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: AppTheme.brandCyan,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildActiveFilterChips() {
    final definitions = _filterDefinitions;
    final chips = <Widget>[];

    for (final def in definitions) {
      switch (def.type) {
        case FilterType.multiSelect:
          final selected = _filterState.multiSelect[def.id];
          if (selected != null && selected.isNotEmpty) {
            final labels = (def.options ?? [])
                .where((o) => selected.contains(o.id))
                .map((o) => _localizedFilterOption(o.label))
                .join(', ');
            chips.add(
              _activeChip(
                '${_localizedFilterLabel(def.label)}: $labels',
                def.id,
              ),
            );
          }
        case FilterType.rangeSlider:
          if (_filterState.ranges.containsKey(def.id)) {
            final r = _filterState.ranges[def.id]!;
            final unit = def.unit != null ? ' ${def.unit}' : '';
            final isDecimal =
                ((def.maxValue ?? 100) - (def.minValue ?? 0)) < 50;
            final fmt = isDecimal
                ? '${r.start.toStringAsFixed(1)}–${r.end.toStringAsFixed(1)}$unit'
                : '${r.start.round()}–${r.end.round()}$unit';
            chips.add(
              _activeChip('${_localizedFilterLabel(def.label)}: $fmt', def.id),
            );
          }
        case FilterType.toggle:
          final v = _filterState.toggles[def.id];
          if (v != null) {
            final yes = context.l10n?.yes ?? 'Yes';
            final no = context.l10n?.no ?? 'No';
            chips.add(
              _activeChip(
                '${_localizedFilterLabel(def.label)}: ${v ? yes : no}',
                def.id,
              ),
            );
          }
      }
    }

    if (chips.isEmpty) return const SizedBox.shrink();

    return Container(
      height: 44,
      decoration: BoxDecoration(
        color: context.backgroundColor,
        border: Border(
          bottom: BorderSide(color: AppTheme.brandCyan.withValues(alpha: 0.12)),
        ),
      ),
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        children: chips,
      ),
    );
  }

  Widget _activeChip(String label, String filterId) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Chip(
        label: Text(
          label,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 12,
            color: AppTheme.primaryBlue,
            fontWeight: FontWeight.w500,
          ),
        ),
        labelPadding: const EdgeInsets.symmetric(horizontal: 4),
        deleteIcon: const Icon(
          Icons.close,
          size: 16,
          color: AppTheme.primaryBlue,
        ),
        onDeleted: () => _removeFilter(filterId),
        backgroundColor: AppTheme.primaryBlue.withValues(alpha: 0.08),
        side: BorderSide(color: AppTheme.primaryBlue.withValues(alpha: 0.3)),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 0),
        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        visualDensity: VisualDensity.compact,
      ),
    );
  }

  Widget _buildBody(List<ProductEntity> products) {
    // Show spinner: initial load OR fetching still running with no products yet
    if ((_loading && _allProducts.isEmpty) ||
        (_fetchingAll && _allProducts.isEmpty)) {
      return const Center(
        child: CircularProgressIndicator(
          color: AppTheme.primaryBlue,
          strokeWidth: 2.5,
        ),
      );
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.error_outline, size: 48, color: AppTheme.error),
              const SizedBox(height: 12),
              Text(
                context.l10n?.failedToLoadProducts ?? 'Failed to load products',
                style: GoogleFonts.plusJakartaSans(
                  color: context.textPrimary,
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: GoogleFonts.plusJakartaSans(
                  color: context.textSecondary,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: _loadProducts,
                icon: const Icon(Icons.refresh),
                label: Text(context.l10n?.retry ?? 'Retry'),
              ),
            ],
          ),
        ),
      );
    }

    if (products.isEmpty) {
      if (_remoteSearching) {
        return Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(
                width: 32,
                height: 32,
                child: CircularProgressIndicator(
                  strokeWidth: 2.5,
                  color: AppTheme.brandCyan,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                _fallbackText(
                  en: 'Searching all products...',
                  tr: 'Tüm ürünlerde aranıyor...',
                ),
                style: GoogleFonts.plusJakartaSans(
                  color: context.textSecondary,
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        );
      }
      if (_filterState.isActive && _hydratingFilterCatalog) {
        return Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const SizedBox(
                  width: 32,
                  height: 32,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    color: AppTheme.brandCyan,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  _fallbackText(
                    en: 'Applying filters across all products...',
                    tr: 'Filtreler tum urunlerde uygulaniyor...',
                  ),
                  textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(
                    color: context.textSecondary,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        );
      }

      final isEmptyCategory =
          _allProducts.isEmpty &&
          !_loading &&
          !_fetchingAll &&
          !_filterState.isActive;
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      AppTheme.brandDeepBlue.withValues(alpha: 0.15),
                      AppTheme.brandCyan.withValues(alpha: 0.08),
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  isEmptyCategory
                      ? Icons.inventory_2_outlined
                      : Icons.search_off,
                  size: 48,
                  color: context.textTertiaryColor,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                _filterState.isActive
                    ? (context.l10n?.noProductsMatchFilters ??
                          'No products match your filters')
                    : isEmptyCategory
                    ? (context.l10n?.comingSoon ?? 'Coming Soon')
                    : (context.l10n?.noProductsFound ?? 'No products found'),
                style: GoogleFonts.plusJakartaSans(
                  color: context.textPrimary,
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              if (isEmptyCategory) ...[
                const SizedBox(height: 8),
                Text(
                  context.l10n?.productsAddingSoon ??
                      'Products in this category are being added.\nCheck back soon!',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(
                    color: context.textSecondary,
                    fontSize: 13,
                  ),
                ),
              ],
              if (_filterState.isActive) ...[
                const SizedBox(height: 8),
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 6,
                  children: [
                    TextButton(
                      onPressed: _openFilters,
                      child: Text(
                        _fallbackText(
                          en: 'Adjust Filters',
                          tr: 'Filtreleri Düzenle',
                        ),
                        style: GoogleFonts.plusJakartaSans(
                          color: context.textSecondary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: () {
                        _applyFilterState(const FilterState());
                      },
                      child: Text(
                        context.l10n?.clearFilters ?? 'Clear Filters',
                        style: GoogleFonts.plusJakartaSans(
                          color: AppTheme.primaryBlue,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      );
    }

    return Column(
      children: [
        Expanded(
          // viewPaddingOf returns the system safe-area independent of keyboard
          // viewInsets. paddingOf would shrink to 0 when the IME opens (Android
          // re-allocates the nav-bar inset to the keyboard), forcing a full
          // ListView relayout for all 4000+ tiles. viewPadding stays constant,
          // so the list never re-measures when the keyboard appears.
          child: ListView.builder(
            controller: _scrollController,
            cacheExtent: 600,
            addAutomaticKeepAlives: false,
            addRepaintBoundaries: true,
            addSemanticIndexes: false,
            padding: EdgeInsets.fromLTRB(
              12,
              8,
              12,
              MediaQuery.viewPaddingOf(context).bottom +
                  AppTheme.navBarTotalClearance,
            ),
            itemCount: products.length + (_fetchingAll ? 1 : 0),
            itemBuilder: (context, index) {
              if (index >= products.length) {
                return const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                );
              }
              final p = products[index];
              return RepaintBoundary(
                child: CompactProductRow(
                  product: p,
                  country: ref.watch(selectedCountryProvider),
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}
// ---------------------------------------------------------------------------
// Isolated Search Bar — own State scope, typing never rebuilds the product grid
// ---------------------------------------------------------------------------

class _IsolatedSearchBar extends StatefulWidget {
  const _IsolatedSearchBar({
    super.key,
    required this.categoryName,
    required this.onQueryChanged,
  });

  final String categoryName;

  /// Called after 300ms debounce with the trimmed, lower-cased query.
  /// Called immediately with '' when cleared.
  final ValueChanged<String> onQueryChanged;

  @override
  State<_IsolatedSearchBar> createState() => _IsolatedSearchBarState();
}

class _IsolatedSearchBarState extends State<_IsolatedSearchBar> {
  final TextEditingController _ctrl = TextEditingController();
  Timer? _debounce;
  bool _hasText = false;

  /// Called from parent when subcategory changes.
  void clear() {
    _ctrl.clear();
    _debounce?.cancel();
    if (_hasText) setState(() => _hasText = false);
    widget.onQueryChanged('');
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  void _onTextChanged(String value) {
    final hasText = value.isNotEmpty;
    // Only setState for clear-button visibility — cheap rebuild of this widget only.
    if (hasText != _hasText) setState(() => _hasText = hasText);

    _debounce?.cancel();
    if (value.trim().isEmpty) {
      widget.onQueryChanged('');
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 300), () {
      widget.onQueryChanged(value.trim().toLowerCase());
    });
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      color: context.backgroundColor,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: Container(
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppTheme.brandCyan.withValues(alpha: 0.15)),
          boxShadow: [
            ...AppTheme.cardShadow,
            BoxShadow(
              color: AppTheme.brandBlue.withValues(alpha: 0.08),
              blurRadius: 16,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: TextField(
          controller: _ctrl,
          onChanged: _onTextChanged,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 14,
            fontWeight: FontWeight.w500,
            color: context.textPrimary,
          ),
          decoration: InputDecoration(
            hintText:
                context.l10n?.searchInCategoryHint(widget.categoryName) ??
                'Search in ${widget.categoryName}...',
            hintStyle: GoogleFonts.plusJakartaSans(
              fontSize: 14,
              color: context.textTertiaryColor,
            ),
            prefixIcon: Container(
              margin: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: AppTheme.brandCyan.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(
                Icons.search_rounded,
                color: AppTheme.brandCyan,
                size: 18,
              ),
            ),
            suffixIcon: _hasText
                ? IconButton(
                    icon: const Icon(Icons.close_rounded, size: 18),
                    color: context.textSecondary,
                    onPressed: clear,
                  )
                : null,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 14,
            ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: BorderSide.none,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: BorderSide.none,
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(18),
              borderSide: const BorderSide(
                color: AppTheme.primaryBlue,
                width: 1.4,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Product List Tile (horizontal card for list view)
// ---------------------------------------------------------------------------

// ignore: unused_element
class _ProductListTile extends StatelessWidget {
  const _ProductListTile({required this.product, required this.onTap});

  final ProductEntity product;
  final VoidCallback onTap;

  Color _scoreColor(double s) {
    if (s >= 80) return AppTheme.scoreExcellent;
    if (s >= 60) return AppTheme.scoreGood;
    if (s >= 40) return AppTheme.scoreAverage;
    return AppTheme.scorePoor;
  }

  @override
  Widget build(BuildContext context) {
    final imageUrl =
        product.imageUrl ??
        (product.allImages.isNotEmpty ? product.allImages.first : null);
    final usPrice = product.prices['US'];
    final score = product.techScore;
    final scoreColor = _scoreColor(score);

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                context.surfaceVariantColor,
                context.surfaceVariantColor.withValues(alpha: 0.92),
              ],
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
            ),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: AppTheme.brandBlue.withValues(alpha: 0.12),
              width: 0.8,
            ),
            boxShadow: [
              ...AppTheme.cardShadow,
              BoxShadow(
                color: AppTheme.brandCyan.withValues(alpha: 0.05),
                blurRadius: 12,
                spreadRadius: -2,
              ),
            ],
          ),
          child: Row(
            children: [
              // ── Ürün görseli ──
              ClipRRect(
                borderRadius: const BorderRadius.horizontal(
                  left: Radius.circular(15),
                ),
                child: ProductImageBox(
                  imageUrl: imageUrl,
                  fallbackUrls: product.images,
                  height: 86,
                  width: 86,
                  borderRadius: const BorderRadius.horizontal(
                    left: Radius.circular(15),
                  ),
                  padding: const EdgeInsets.all(8),
                ),
              ),
              // ── Bilgiler ──
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Marka
                      if ((product.brand ?? '').isNotEmpty)
                        Text(
                          product.brand!.toUpperCase(),
                          style: GoogleFonts.plusJakartaSans(
                            color: AppTheme.primaryBlue,
                            fontSize: 9.5,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.8,
                          ),
                        ),
                      const SizedBox(height: 2),
                      // İsim
                      Text(
                        product.name,
                        style: GoogleFonts.plusJakartaSans(
                          color: context.textPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          height: 1.25,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 6),
                      // Fiyat + Score satırı
                      Row(
                        children: [
                          if (usPrice != null)
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 3,
                              ),
                              decoration: BoxDecoration(
                                gradient: AppTheme.primaryGradient,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                '\$${usPrice.round()}',
                                style: GoogleFonts.plusJakartaSans(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 12,
                                ),
                              ),
                            ),
                          if (usPrice != null && score > 0)
                            const SizedBox(width: 6),
                          if (score > 0)
                            Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  Icons.star_rounded,
                                  size: 12,
                                  color: scoreColor,
                                ),
                                const SizedBox(width: 2),
                                Text(
                                  score.round().toString(),
                                  style: GoogleFonts.plusJakartaSans(
                                    color: scoreColor,
                                    fontSize: 12,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                Text(
                                  '/100',
                                  style: GoogleFonts.plusJakartaSans(
                                    color: scoreColor.withValues(alpha: 0.6),
                                    fontSize: 10,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              // ── Sağ ok ──
              Padding(
                padding: const EdgeInsets.only(right: 12),
                child: Icon(
                  Icons.arrow_forward_ios_rounded,
                  color: context.textTertiaryColor.withValues(alpha: 0.4),
                  size: 14,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Inline Sort Dropdown widget
// ---------------------------------------------------------------------------

class _SortDropdown extends StatelessWidget {
  const _SortDropdown({required this.value, required this.onChanged});
  final _SortOption value;
  final ValueChanged<_SortOption> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 0),
      decoration: BoxDecoration(
        color: context.backgroundColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: context.dividerColor),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<_SortOption>(
          value: value,
          isDense: true,
          icon: Icon(
            Icons.keyboard_arrow_down_rounded,
            size: 16,
            color: context.textSecondary,
          ),
          dropdownColor: context.surfaceElevatedColor,
          borderRadius: BorderRadius.circular(12),
          style: GoogleFonts.plusJakartaSans(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: context.textSecondary,
          ),
          onChanged: (v) {
            if (v != null) onChanged(v);
          },
          items: _SortOption.values
              .map(
                (opt) => DropdownMenuItem(
                  value: opt,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        opt.icon,
                        size: 13,
                        color: opt == value
                            ? AppTheme.primaryBlue
                            : context.textSecondary,
                      ),
                      const SizedBox(width: 5),
                      Text(
                        opt.label(context),
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12,
                          fontWeight: opt == value
                              ? FontWeight.w700
                              : FontWeight.w500,
                          color: opt == value
                              ? AppTheme.primaryBlue
                              : context.textPrimary,
                        ),
                      ),
                    ],
                  ),
                ),
              )
              .toList(),
          selectedItemBuilder: (ctx) => _SortOption.values
              .map(
                (opt) => Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(opt.icon, size: 13, color: context.textSecondary),
                    const SizedBox(width: 4),
                    Text(
                      opt.label(ctx),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: context.textSecondary,
                      ),
                    ),
                  ],
                ),
              )
              .toList(),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Combined Sort & Filter Bottom Sheet
// ---------------------------------------------------------------------------

class _SortFilterSheet extends StatefulWidget {
  const _SortFilterSheet({
    required this.currentSort,
    required this.filterState,
    required this.categoryId,
    required this.products,
    required this.onApply,
  });

  final _SortOption currentSort;
  final FilterState filterState;
  final String categoryId;
  final List<ProductEntity> products;
  final void Function(_SortOption sort, FilterState filters) onApply;

  @override
  State<_SortFilterSheet> createState() => _SortFilterSheetState();
}

class _SortFilterSheetState extends State<_SortFilterSheet> {
  late _SortOption _selectedSort;
  late FilterState _filterState;

  @override
  void initState() {
    super.initState();
    _selectedSort = widget.currentSort;
    _filterState = widget.filterState;
  }

  @override
  Widget build(BuildContext context) {
    final filterDefs = FilterConfig.getFiltersWithProducts(
      widget.categoryId,
      widget.products,
    );

    return Container(
      decoration: BoxDecoration(
        color: context.surfaceElevatedColor,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Handle
          Center(
            child: Container(
              width: 36,
              height: 4,
              margin: const EdgeInsets.only(top: 12, bottom: 16),
              decoration: BoxDecoration(
                color: context.dividerColor,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          // Header
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Sort & Filter',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: context.textPrimary,
                  ),
                ),
                if (_filterState.isActive)
                  TextButton(
                    onPressed: () =>
                        setState(() => _filterState = const FilterState()),
                    child: Text(
                      'Clear Filters',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        color: AppTheme.accentCyan,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          // Scrollable content
          ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(context).height * 0.65,
            ),
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Sort section
                  Text(
                    'Sort By',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: context.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _SortOption.values.map((opt) {
                      final selected = opt == _selectedSort;
                      return GestureDetector(
                        onTap: () => setState(() => _selectedSort = opt),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 130),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 7,
                          ),
                          decoration: BoxDecoration(
                            gradient: selected
                                ? AppTheme.primaryGradient
                                : null,
                            color: selected ? null : context.backgroundColor,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: selected
                                  ? Colors.transparent
                                  : context.dividerColor,
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                opt.icon,
                                size: 13,
                                color: selected
                                    ? Colors.white
                                    : context.textSecondary,
                              ),
                              const SizedBox(width: 5),
                              Text(
                                opt.label(context),
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 12,
                                  fontWeight: selected
                                      ? FontWeight.w600
                                      : FontWeight.w500,
                                  color: selected
                                      ? Colors.white
                                      : context.textSecondary,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                  if (filterDefs.isNotEmpty) ...[
                    const SizedBox(height: 20),
                    const Divider(),
                    const SizedBox(height: 8),
                    GestureDetector(
                      onTap: () async {
                        final result = await showFilterBottomSheet(
                          context: context,
                          categoryId: widget.categoryId,
                          initialState: _filterState,
                          products: widget.products,
                        );
                        if (result != null) {
                          setState(() => _filterState = result);
                        }
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 12,
                        ),
                        decoration: BoxDecoration(
                          color: _filterState.isActive
                              ? AppTheme.primaryBlue.withValues(alpha: 0.08)
                              : context.backgroundColor,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: _filterState.isActive
                                ? AppTheme.primaryBlue.withValues(alpha: 0.3)
                                : context.dividerColor,
                          ),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              Icons.filter_alt_outlined,
                              size: 18,
                              color: _filterState.isActive
                                  ? AppTheme.primaryBlue
                                  : context.textSecondary,
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                _filterState.isActive
                                    ? 'Filters applied (tap to edit)'
                                    : 'Filter Options',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: _filterState.isActive
                                      ? AppTheme.primaryBlue
                                      : context.textSecondary,
                                ),
                              ),
                            ),
                            Icon(
                              Icons.chevron_right_rounded,
                              size: 18,
                              color: context.textTertiaryColor,
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                ],
              ),
            ),
          ),
          // Apply button
          Padding(
            padding: EdgeInsets.fromLTRB(
              20,
              8,
              20,
              MediaQuery.viewInsetsOf(context).bottom + 20,
            ),
            child: ElevatedButton(
              onPressed: () {
                widget.onApply(_selectedSort, _filterState);
                Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
                backgroundColor: AppTheme.primaryBlue,
                foregroundColor: Colors.white,
              ),
              child: Text(
                'Apply',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
