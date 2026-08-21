/// Premium Category Browse Screen – OLED Dark Theme
/// - Category pills horizontal scroll (top)
/// - Masonry grid for products
/// - Glass container filters
/// - Dark cards with gradient accents
library;

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/core/product_filter.dart';
import 'package:qor_ai/config/filter_config.dart';
import 'package:qor_ai/config/category_filters.dart' as cf;
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
  bool _loading = true;
  bool _fetchingAll = false; // cursor pagination in progress
  bool _warmingFullFilterCatalog = false;

  // Facets — loaded from Typesense in one lightweight query and reused to build
  // the web-aligned filter UI (groups, options, live counts).
  Map<String, List<FilterOption>> _typesenseFacets = {};
  bool _facetsLoaded = false;
  bool _cachedFacetsLoaded = false;
  String? _error;
  Timer? _scrollDebounce;
  int _totalProductCount = 0;

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

  // ── Filter cache — rebuilt only when category / facets / language change ──
  List<FilterDefinition>? _cachedFilterDefs;
  String _cachedCategoryId = '';
  String _cachedDefsLang = '';

  /// Web-aligned filter definitions: identical groups, order and labels to
  /// qorai.net (see [cf.kTokenGroups] / [cf.kFeatureTokens]). Built straight
  /// from the live Typesense `filterTokens` facet universe — the facet IS the
  /// per-category allow-list, so only filters that actually have products show.
  List<FilterDefinition> get _filterDefinitions {
    final lang = _languageCode;
    if (_cachedFilterDefs != null &&
        _activeCategoryId == _cachedCategoryId &&
        _facetsLoaded == _cachedFacetsLoaded &&
        lang == _cachedDefsLang) {
      return _cachedFilterDefs!;
    }
    final defs = _buildWebAlignedDefinitions(lang);
    _cachedFilterDefs = defs;
    _cachedCategoryId = _activeCategoryId;
    _cachedFacetsLoaded = _facetsLoaded;
    _cachedDefsLang = lang;
    return defs;
  }

  /// Facet options for a `filterTokens` prefix (already keyed by prefix in
  /// [getTypesenseFacets]).
  List<FilterOption> _facetOptionsForPrefix(String prefix) =>
      _typesenseFacets[prefix] ?? const <FilterOption>[];

  /// Sorted, distinct numeric values present for a range group's tokens
  /// (e.g. RAM tokens 4_gb/8_gb/16_gb → [4, 8, 16]).
  List<double> _rangeNumbersForGroup(
    cf.TokenGroup group,
    List<FilterOption> options,
  ) {
    final values = <double>{};
    for (final o in options) {
      final n = cf.rangeNumberFromTokenValue(o.id, group.unit);
      if (n != null) values.add(n);
    }
    final sorted = values.toList()..sort();
    return sorted;
  }

  List<FilterDefinition> _buildWebAlignedDefinitions(String lang) {
    final defs = <FilterDefinition>[];
    final cat = _activeCategoryId;
    String tr(String en, String trv, String de) =>
        lang == 'tr' ? trv : en;

    // 1) Qor AI Score (single-select), always present — mirrors web.
    defs.add(
      FilterDefinition(
        id: 'score',
        label: tr('Qor AI Score', 'Qor AI Puanı', 'Qor AI Score'),
        type: FilterType.multiSelect,
        preLocalized: true,
        specKeys: const ['techScore'],
        options: [
          FilterOption(id: 'high', label: tr('80 & up', '80 ve üzeri', '80 und mehr')),
          FilterOption(id: 'mid', label: '60 – 79'),
          FilterOption(id: 'low', label: tr('Under 60', '60 altı', 'Unter 60')),
        ],
      ),
    );

    // 2) Token groups in canonical order, only when the category actually has
    //    products carrying those tokens (facet universe gates them).
    for (final group in cf.filterGroupsForCategory(cat)) {
      final options = _facetOptionsForPrefix(group.prefix);
      if (options.isEmpty) continue;
      if (group.isRange) {
        final values = _rangeNumbersForGroup(group, options);
        if (values.length < 2) continue; // need a spread to slide over
        defs.add(
          FilterDefinition(
            id: group.prefix,
            label: cf.lbl(group.label, lang),
            type: FilterType.rangeSlider,
            preLocalized: true,
            unit: group.unit,
            minValue: values.first,
            maxValue: values.last,
            rangeValues: values,
            specKeys: [group.prefix],
          ),
        );
      } else {
        final sorted = [...options]
          ..sort(
            (a, b) => cf.compareTokenValues(
              group.prefix,
              '${group.prefix}:${a.id}',
              '${group.prefix}:${b.id}',
            ),
          );
        defs.add(
          FilterDefinition(
            id: group.prefix,
            label: cf.lbl(group.label, lang),
            type: FilterType.multiSelect,
            preLocalized: true,
            specKeys: [group.prefix],
            options: [
              for (final o in sorted)
                FilterOption(
                  id: o.id,
                  label: cf.prettyTokenValue(o.id, lang),
                  count: o.count,
                ),
            ],
          ),
        );
      }
    }

    // 3) Features — one combined section of checkboxes, like web "Features".
    final features = cf.featureFiltersForCategory(cat).where((f) {
      final opts = _typesenseFacets[f.prefix];
      return opts != null && opts.any((o) => o.id == 'true');
    }).toList();
    if (features.isNotEmpty) {
      defs.add(
        FilterDefinition(
          id: 'features',
          label: tr('Features', 'Özellikler', 'Funktionen'),
          type: FilterType.multiSelect,
          preLocalized: true,
          specKeys: const ['features'],
          options: [
            for (final f in features)
              FilterOption(
                id: f.token, // full token, e.g. 'five_g:true'
                label: cf.lbl(f.label, lang),
                count: _typesenseFacets[f.prefix]
                    ?.where((o) => o.id == 'true')
                    .map((o) => o.count)
                    .firstWhere((c) => true, orElse: () => null),
              ),
          ],
        ),
      );
    }

    // 4) Brand — last, with counts.
    final brandOptions = _typesenseFacets['brand'] ?? const <FilterOption>[];
    if (brandOptions.length > 1) {
      final sorted = [...brandOptions]
        ..sort((a, b) => a.label.toLowerCase().compareTo(b.label.toLowerCase()));
      defs.add(
        FilterDefinition(
          id: 'brand',
          label: tr('Brand', 'Marka', 'Marke'),
          type: FilterType.multiSelect,
          preLocalized: true,
          specKeys: const ['brand'],
          options: sorted,
        ),
      );
    }

    return defs;
  }

  bool _allLoaded = false;

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

  cf.TokenGroup? _rangeGroupForPrefix(String prefix) {
    for (final g in cf.kTokenGroups) {
      if (g.prefix == prefix && g.isRange) return g;
    }
    return null;
  }

  /// Builds the Typesense `filter_by` for the current selection, identical in
  /// shape to web's getCategoryPage: tokens are grouped by prefix → OR within a
  /// prefix, AND across prefixes; score → techScore range; brand → brand OR;
  /// range groups → the set of in-range discrete tokens. Returns null only when
  /// nothing is selected. The category clause itself is added by getProductsPageTs.
  String? _buildServerSideFilterBy(FilterState state) {
    if (!state.isActive) return null;

    final tokens = <String>{};
    final clauses = <String>[];

    for (final entry in state.multiSelect.entries) {
      final selected = entry.value;
      if (selected.isEmpty) continue;

      switch (entry.key) {
        case 'brand':
          final brandOptions =
              _typesenseFacets['brand'] ?? const <FilterOption>[];
          final selectedLabels = brandOptions
              .where((o) => selected.contains(o.id))
              .map((o) => o.label.trim())
              .where((l) => l.isNotEmpty)
              .toList(growable: false);
          final clause = _buildAnyOfClause('brand', selectedLabels);
          if (clause.isNotEmpty) clauses.add(clause);
          break;
        case 'score':
          // Single-select; first wins.
          final id = selected.first;
          if (id == 'high') {
            clauses.add('techScore:>=80');
          } else if (id == 'mid') {
            clauses.add('techScore:[60..79]');
          } else if (id == 'low') {
            clauses.add('techScore:<60');
          }
          break;
        case 'features':
          // Option ids ARE full tokens, e.g. 'five_g:true'.
          tokens.addAll(selected);
          break;
        default:
          // Checkbox token group: ids are bare values → 'prefix:value'.
          for (final id in selected) {
            tokens.add('${entry.key}:$id');
          }
      }
    }

    // Range groups → expand the selected [min,max] into the in-range tokens.
    for (final entry in state.ranges.entries) {
      final prefix = entry.key;
      final group = _rangeGroupForPrefix(prefix);
      if (group == null) continue;
      final range = entry.value;
      final inRange = <String>[];
      for (final o in _facetOptionsForPrefix(prefix)) {
        final n = cf.rangeNumberFromTokenValue(o.id, group.unit);
        if (n == null) continue;
        if (n >= range.start - 1e-6 && n <= range.end + 1e-6) {
          inRange.add('$prefix:${o.id}');
        }
      }
      // A sub-range that matches nothing forces an empty result (web parity).
      tokens.addAll(inRange.isEmpty ? ['$prefix:__none__'] : inRange);
    }

    if (tokens.isNotEmpty) {
      final byPrefix = <String, List<String>>{};
      for (final t in tokens.take(120)) {
        (byPrefix[t.split(':').first] ??= <String>[]).add(t);
      }
      for (final group in byPrefix.values) {
        clauses.add(
          'filterTokens:[${group.map(_quoteTypesenseValue).join(',')}]',
        );
      }
    }

    return clauses.isEmpty ? null : clauses.join(' && ');
  }

  bool _usesServerSideFiltering({FilterState? state, String? query}) {
    final effectiveQuery = query ?? _searchQuery;
    if (effectiveQuery.isNotEmpty) return false;
    return _buildServerSideFilterBy(state ?? _filterState) != null;
  }

  // Ülke-bazlı SIRALANABİLİR Typesense fiyat alanları (ts_backfill yazar).
  // Bunlar seçili ülkenin NATIVE fiyatını tutar → server GÖSTERİLEN fiyata göre
  // sıralar. `lowestPriceUSD` küresel en-ucuz pazarı gösterdiği için (GB'de ucuz
  // + TR'de pahalı ürün TR listesinde yanlış yere düşüyordu) artık kullanılmaz.
  static const _priceSortCountries = {
    'TR', 'US', 'DE', 'GB', 'FR', 'IT', 'ES', 'NL',
  };

  /// Seçili ülkenin sıralanabilir fiyat alanı. Alanı olmayan (nadir) ülkelerde
  /// `lowestPriceUSD`'ye düşer (o ülkelerde zaten ~hiç fiyat yok).
  String _priceSortField() {
    final c = ref.read(selectedCountryProvider).trim().toUpperCase();
    return _priceSortCountries.contains(c) ? 'price$c' : 'lowestPriceUSD';
  }

  /// Extra Typesense filter clauses required by the active sort option.
  /// Fiyat sıralamasında ARTIK FİLTRE YOK — kullanıcı isteği: "bu filtre değil
  /// sıralama; fiyatsızlar fiyatlılardan SONRA gelsin, tüm ürünler görünsün".
  /// Fiyatsızları dışlamak yerine `_serverSortBy`'daki `_eval` ile en sona atarız.
  String? _sortDrivenFilterBy() {
    return null;
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
    // Warm the filterTokens/brand facets up front so the filter sheet opens
    // instantly with the full web-aligned option set + live counts.
    unawaited(_loadFacets());
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollDebounce?.cancel();
    _scrollController.dispose();
    super.dispose();
  }

  void _applyFilterState(FilterState result) {
    setState(() => _filterState = result);
    // Every filter is a server-side Typesense clause, so reload from page 1 —
    // the results then cover the WHOLE category, not just the loaded page.
    unawaited(_loadProducts());
  }

  // Search bar debounce keeps reloads in check; only fire when the query
  // actually settled on a new value.
  String _lastSearchSubmitted = '';

  void _onSearchQueryChanged(String q) {
    if (q == _lastSearchSubmitted) return;
    _lastSearchSubmitted = q;
    setState(() => _searchQuery = q);
    // Search is server-side too — query + active filters combine in one request.
    unawaited(_loadProducts());
  }

  void _onScroll() {
    // Cheap pre-check to avoid scheduling timers when nothing can fire.
    if (!mounted ||
        !_scrollController.hasClients ||
        _fetchingAll ||
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
        // Seçili ülkenin native fiyat alanına göre (GÖSTERİLEN fiyatla birebir).
        // `_eval(price{ÜLKE}:>0):desc` → o ülkede FİYATI OLANLAR önce, fiyatsızlar
        // EN SONA (kullanıcı isteği); sonra ucuzdan pahalıya; fiyatsızlar kendi
        // içinde techScore'a göre. Fiyatsızlar dışlanmaz, tüm ürünler görünür.
        return '_eval(${_priceSortField()}:>0):desc,${_priceSortField()}:asc,techScore:desc';
      case _SortOption.priceDesc:
        return '_eval(${_priceSortField()}:>0):desc,${_priceSortField()}:desc,techScore:desc';
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
        query: _searchQuery.isEmpty ? '*' : _searchQuery,
        sortBy: _serverSortBy(),
        extraFilterBy: serverFilterBy,
      );
      if (!mounted) return;
      final existingIds = _allProducts.map((p) => p.id).toSet();
      final newProducts = _sanitizeCategoryProducts(
        page.products,
      ).where((p) => !existingIds.contains(p.id)).toList();
      final merged = [..._allProducts, ...newProducts];
      setState(() {
        _allProducts = merged;
        _visibleProducts = merged;
        _currentPage = page.nextPage;
        _allLoaded = !page.hasMore;
        _fetchingAll = false;
        // Once all pages loaded, show true deduped count; otherwise Typesense total.
        _totalProductCount = !page.hasMore ? merged.length : page.totalFound;
      });
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
    // v3: kategori filtresi exact-OR'a geçti (token sızıntısı düzeldi); eski v2
    // cache'inde camera_lenses altında kameralar olabilir → versiyon bump.
    final hiveCacheKey = 'cat_products_${catKey}_v3';
    // Cached/home-feed seeds are the UNFILTERED category — only show them as an
    // instant placeholder for the default view. When a search or filter is
    // active we must wait for the server's filtered result instead.
    final canSeedFromCache = _searchQuery.isEmpty && !_filterState.isActive;

    try {
      final cache = ref.read(cacheServiceProvider);
      final stale = cache.getLocalStale<List<dynamic>>(hiveCacheKey);
      // Hive seed'i YALNIZ varsayılan (techScore) sıralamada gösterilir: cache
      // techScore'a göre kaydediliyor; başka sıralamada seed farklı sırada
      // görünüp 1sn sonra TS ile "birden değişir" gibi görünüyordu.
      if (canSeedFromCache &&
          _sortOption == _SortOption.techScore &&
          stale.data != null &&
          (stale.data as List).isNotEmpty) {
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

    // Home-feed "varyete" seed'i KALDIRILDI: farklı sıralı (çeşitlilik yayılmış)
    // ürünleri anlık gösterip ~1sn sonra TS sonucuyla değiştirdiği için
    // "önce farklı sıralama, sonra birden değişiyor" hissi yaratıyordu. Artık
    // yalnız (techScore) Hive seed'i veya doğrudan TS sonucu gösterilir.

    try {
      final ds = ref.read(pbDataSourceProvider);
      final serverFilterBy = _composeExtraFilterBy(_filterState);
      final result = await ds.getProductsPageTs(
        category: _activeCategoryId,
        limit: 40,
        page: 1,
        query: _searchQuery.isEmpty ? '*' : _searchQuery,
        sortBy: _serverSortBy(),
        extraFilterBy: serverFilterBy,
      );
      if (!mounted) return;
      final firstPage = _sanitizeCategoryProducts(result.products);
      // Only cache the UNFILTERED default view as the category placeholder.
      if (canSeedFromCache &&
          _sortOption == _SortOption.techScore &&
          firstPage.isNotEmpty) {
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

  /// "En Yüksek Puanlı" sıralamasını İSTEMCİ tarafında da garantiler — sunucu
  /// techScore sırası bazı yollarda (Hive/feed seed, PB fallback) korunmadığı
  /// için ekranda uygulanmıyordu.
  ///
  /// FİYAT sıralaması: sunucu `lowestPriceUSD` (küresel USD) alanına göre
  /// sıralıyor, ancak KARTTA gösterilen fiyat SEÇİLİ ülkenin fiyatı
  /// (`getPriceForCountry`). Bir ürünün USD fiyatı olup seçili ülkede fiyatı
  /// OLMAYABİLİR (örn. yalnız US Amazon fiyatı) → kartta boş görünür ama sunucu
  /// sırasında araya karışır. Kullanıcı isteği: "fiyatı olmayanlar fiyatı
  /// olanlardan SONRA gelsin". Bunu istemci tarafında KARARLI bölütleme ile
  /// garantileriz: seçili ülkede fiyatı olanlar (sunucu sırasında) önce,
  /// fiyatı görünmeyenler en sonda. Böylece görünen liste her zaman doğru:
  /// fiyatlılar ucuzdan/pahalıya, fiyatsızlar altta.
  List<ProductEntity> _sortForDisplay(
    List<ProductEntity> products,
    String country,
  ) {
    if (products.isEmpty) return products;
    if (_sortOption == _SortOption.techScore) {
      return [...products]..sort((a, b) => b.techScore.compareTo(a.techScore));
    }
    if (_sortOption == _SortOption.priceAsc ||
        _sortOption == _SortOption.priceDesc) {
      // Sunucu artık seçili ülkenin native fiyat alanına göre sıralıyor; burada
      // GÖSTERİLEN fiyata (getPriceForCountry) göre tam sıralayıp fiyatsızları
      // sona atarak seed/PB-fallback yollarında da birebir doğru sıra garanti
      // ederiz (sunucu sırasıyla tutarlı olduğu için "zıplama" olmaz).
      final asc = _sortOption == _SortOption.priceAsc;
      final priced = <ProductEntity>[];
      final unpriced = <ProductEntity>[];
      for (final p in products) {
        final v = p.getPriceForCountry(country);
        (v != null && v > 0 ? priced : unpriced).add(p);
      }
      priced.sort((a, b) {
        final pa = a.getPriceForCountry(country)!;
        final pb = b.getPriceForCountry(country)!;
        return asc ? pa.compareTo(pb) : pb.compareTo(pa);
      });
      return [...priced, ...unpriced];
    }
    return products; // relevance/newest → sunucu sırası
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _sortForDisplay(
      _visibleProducts,
      ref.watch(selectedCountryProvider),
    );

    return Scaffold(
      backgroundColor: context.backgroundColor,
      resizeToAvoidBottomInset: false,
      appBar: _buildAppBar(),
      body: Column(
        children: [
          // Kategori-değiştirici chip satırı kaldırıldı: bir kategoriye
          // girince üstte diğer kategoriler gösterilmiyor (kullanıcı isteği).
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
          if (_warmingFullFilterCatalog) ...[
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
      final defLabel = def.preLocalized
          ? def.label
          : _localizedFilterLabel(def.label);
      switch (def.type) {
        case FilterType.multiSelect:
          final selected = _filterState.multiSelect[def.id];
          if (selected != null && selected.isNotEmpty) {
            final labels = (def.options ?? [])
                .where((o) => selected.contains(o.id))
                .map((o) => def.preLocalized
                    ? o.label
                    : _localizedFilterOption(o.label))
                .join(', ');
            chips.add(_activeChip('$defLabel: $labels', def.id));
          }
        case FilterType.rangeSlider:
          if (_filterState.ranges.containsKey(def.id)) {
            final r = _filterState.ranges[def.id]!;
            final String fmt;
            if (def.rangeValues != null) {
              // Web-aligned token range — format each end via its unit.
              fmt =
                  '${cf.formatRangeValue(r.start, def.unit ?? 'capacity')} – ${cf.formatRangeValue(r.end, def.unit ?? 'capacity')}';
            } else {
              final unit = def.unit != null ? ' ${def.unit}' : '';
              final isDecimal =
                  ((def.maxValue ?? 100) - (def.minValue ?? 0)) < 50;
              fmt = isDecimal
                  ? '${r.start.toStringAsFixed(1)}–${r.end.toStringAsFixed(1)}$unit'
                  : '${r.start.round()}–${r.end.round()}$unit';
            }
            chips.add(_activeChip('$defLabel: $fmt', def.id));
          }
        case FilterType.toggle:
          final v = _filterState.toggles[def.id];
          if (v != null) {
            final yes = context.l10n?.yes ?? 'Yes';
            final no = context.l10n?.no ?? 'No';
            chips.add(_activeChip('$defLabel: ${v ? yes : no}', def.id));
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
