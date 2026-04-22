/// Premium Category Browse Screen – OLED Dark Theme
/// - Category pills horizontal scroll (top)
/// - Masonry grid for products
/// - Glass container filters
/// - Dark cards with gradient accents
library;

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:go_router/go_router.dart';

import 'package:google_fonts/google_fonts.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/core/search_ranking.dart';
import 'package:compair/core/product_filter.dart';
import 'package:compair/config/filter_config.dart';
import 'package:compair/presentation/models/filter_models.dart';
import 'package:compair/presentation/providers/providers.dart';
import 'package:compair/presentation/widgets/filter_bottom_sheet.dart';
import 'package:compair/presentation/widgets/product_image_box.dart';

import 'package:compair/domain/entities/product_entity.dart';
import 'package:compair/data/models/product_model.dart';

// ---------------------------------------------------------------------------
// Sort options
// ---------------------------------------------------------------------------

enum _SortOption { techScore, relevance, newest }

extension _SortOptionLabel on _SortOption {
  String label(BuildContext context) {
    final l10n = context.l10n;
    switch (this) {
      case _SortOption.techScore:
        return l10n?.sortTopRated ?? 'Top Rated';
      case _SortOption.relevance:
        return l10n?.sortPopular ?? 'Popular';
      case _SortOption.newest:
        return l10n?.sortNewest ?? 'Newest';
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
  final TextEditingController _searchController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  String _searchQuery = '';

  late String _activeCategoryId;
  late String _activeCategoryName;

  List<ProductEntity> _allProducts = [];
  List<ProductEntity>? _remoteSearchResults;
  bool _loading = true;
  bool _fetchingAll = false; // cursor pagination in progress
  bool _remoteSearching = false;
  String? _error;
  Timer? _searchDebounce;
  int _totalProductCount = 0;

  // Page counter for PocketBase pagination
  int _currentPage = 1;

  // ── Filter cache — computed once per products change, not on every build ──
  List<FilterDefinition>? _cachedFilterDefs;
  int _cachedProductCount = -1;
  String _cachedCategoryId = '';

  List<FilterDefinition> get _filterDefinitions {
    if (_cachedFilterDefs == null ||
        _allProducts.length != _cachedProductCount ||
        _activeCategoryId != _cachedCategoryId) {
      _cachedFilterDefs = FilterConfig.getFiltersWithProducts(
        _activeCategoryId,
        _allProducts,
      );
      _cachedProductCount = _allProducts.length;
      _cachedCategoryId = _activeCategoryId;
    }
    return _cachedFilterDefs!;
  }

  bool _allLoaded = false;

  bool get _isTurkish =>
      Localizations.localeOf(context).languageCode.toLowerCase() == 'tr';

  String _fallbackText({required String en, required String tr}) {
    return _isTurkish ? tr : en;
  }

  @override
  void initState() {
    super.initState();
    _activeCategoryId = widget.categoryId;
    _activeCategoryName = widget.categoryName;
    _loadProducts();
    _searchController.addListener(_onSearchChanged);
    _scrollController.addListener(_onScroll);
    // Hide the global floating bottom nav while browsing a category —
    // gives the list more breathing room and matches modern catalog UX.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(hideNavBarProvider.notifier).state = true;
    });
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    _scrollController.dispose();
    // Restore nav bar. Reading through ProviderScope is still safe during
    // dispose because we access the notifier, not the state stream.
    try {
      ref.read(hideNavBarProvider.notifier).state = false;
    } catch (_) {}
    super.dispose();
  }

  void _onSearchChanged() {
    final q = _searchController.text.trim().toLowerCase();
    setState(() {
      _searchQuery = q;
      if (q.isEmpty) _remoteSearchResults = null;
    });
    _searchDebounce?.cancel();
    if (q.length >= 2) {
      _searchDebounce = Timer(const Duration(milliseconds: 300), () {
        _doRemoteSearch(q);
      });
    }
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
      }
    } catch (e) {
      if (mounted) setState(() => _remoteSearching = false);
    }
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
            _scrollController.position.maxScrollExtent - 600 &&
        !_fetchingAll &&
        !_allLoaded) {
      _fetchNextPage();
    }
  }

  List<ProductEntity> _sanitizeCategoryProducts(
    Iterable<ProductEntity> products,
  ) {
    final filtered = ProductFilter.filter(products.toList());
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
    }
  }

  int _displayProductCount(int filteredCount) {
    if (_searchQuery.isNotEmpty || _filterState.isActive) return filteredCount;
    // Return real total only — local list snapshot during cache/feed warmup
    // would otherwise show e.g. 50 then jump to 4186.
    return _totalProductCount;
  }

  Future<void> _changeSortOption(_SortOption option) async {
    if (_sortOption == option) return;
    setState(() {
      _sortOption = option;
      _loading = true;
      _allLoaded = false;
      _currentPage = 1;
      _allProducts = [];
      _remoteSearchResults = null;
    });
    await _loadProducts();
  }

  /// Fetch next page via Typesense pagination only when the user scrolls.
  Future<void> _fetchNextPage() async {
    if (_fetchingAll || _allLoaded || !mounted) return;
    setState(() => _fetchingAll = true);
    try {
      final ds = ref.read(pbDataSourceProvider);
      final page = await ds.getProductsPageTs(
        category: _activeCategoryId,
        limit: 200,
        page: _currentPage,
        sortBy: _serverSortBy(),
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
        // Once all pages loaded, show true deduped count; otherwise Typesense total.
        _totalProductCount = !page.hasMore ? merged.length : page.totalFound;
      });
    } catch (_) {}
    if (mounted) setState(() => _fetchingAll = false);
  }

  /// Load first page quickly and defer the rest until scroll.
  Future<void> _loadProducts() async {
    setState(() {
      _loading = true;
      _error = null;
      _allLoaded = false;
      _currentPage = 1;
      _allProducts = [];
      _totalProductCount = 0;
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
                _loading = false;
              });
            }
          }
        }
      }
    } catch (_) {}

    try {
      final ds = ref.read(pbDataSourceProvider);
      final result = await ds.getProductsPageTs(
        category: _activeCategoryId,
        limit: 200,
        page: 1,
        sortBy: _serverSortBy(),
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
        _currentPage = result.nextPage;
        _allLoaded = !result.hasMore;
        // Use actual deduped count when all pages are loaded; otherwise
        // show Typesense total as an upper bound (paginating categories).
        _totalProductCount = (!result.hasMore)
            ? firstPage.length
            : result.totalFound;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<ProductEntity> get _filteredProducts {
    if (_searchQuery.isNotEmpty) {
      final localMatches = _allProducts.where((p) {
        final rank = rankProductForQuery(p, _searchQuery);
        return rank.score > 0;
      }).toList();

      // Merge ALL remote search results (dedup by id)
      if (_remoteSearchResults != null && _remoteSearchResults!.isNotEmpty) {
        final seenIds = localMatches.map((p) => p.id).toSet();
        for (final p in _remoteSearchResults!) {
          if (!seenIds.contains(p.id)) {
            localMatches.add(p);
            seenIds.add(p.id);
          }
        }
      }

      final filtered = FilterApplier.apply(
        localMatches,
        _filterState,
        _filterDefinitions,
      );
      return _sortProducts(filtered);
    }

    // No search — show all loaded products
    final filtered = FilterApplier.apply(
      _allProducts,
      _filterState,
      _filterDefinitions,
    );
    return _sortProducts(filtered);
  }

  List<ProductEntity> _sortProducts(List<ProductEntity> products) {
    final copy = List<ProductEntity>.from(products);
    if (_searchQuery.isNotEmpty) {
      final rankMap = {
        for (final product in copy)
          product.id: rankProductForQuery(product, _searchQuery),
      };
      copy.sort((a, b) {
        final rankCompare = (rankMap[b.id]?.score ?? 0).compareTo(
          rankMap[a.id]?.score ?? 0,
        );
        if (rankCompare != 0) return rankCompare;
        return _compareBySelectedSort(a, b);
      });
      return copy;
    }

    switch (_sortOption) {
      case _SortOption.techScore:
        copy.sort(_compareBySelectedSort);
        break;
      case _SortOption.newest:
        copy.sort(_compareBySelectedSort);
        break;
      case _SortOption.relevance:
        copy.sort(_compareBySelectedSort);
        break;
    }
    return copy;
  }

  /// Returns release year for a product: spec > createdAt > lastUpdated.
  int _releaseYear(ProductEntity p) {
    return ProductFilter.getExactReleaseYear(p) ??
        (p.createdAt ?? p.lastUpdated).year;
  }

  int _sortTimestamp(ProductEntity p) {
    return (p.createdAt ?? p.lastUpdated).millisecondsSinceEpoch;
  }

  int _compareBySelectedSort(ProductEntity a, ProductEntity b) {
    switch (_sortOption) {
      case _SortOption.techScore:
        final techCompare = b.techScore.compareTo(a.techScore);
        if (techCompare != 0) return techCompare;
        final trendCompare = b.trendScore.compareTo(a.trendScore);
        if (trendCompare != 0) return trendCompare;
        return _releaseYear(b).compareTo(_releaseYear(a));
      case _SortOption.newest:
        // Sort by actual release year extracted from specs.
        final yearCmp = _releaseYear(b).compareTo(_releaseYear(a));
        if (yearCmp != 0) return yearCmp;
        final dateCmp = _sortTimestamp(b).compareTo(_sortTimestamp(a));
        if (dateCmp != 0) return dateCmp;
        return b.techScore.compareTo(a.techScore);
      case _SortOption.relevance:
        // Popular: trendScore first, then newest models first among ties.
        final trendCompare = b.trendScore.compareTo(a.trendScore);
        if (trendCompare != 0) return trendCompare;
        final yearCmp = _releaseYear(b).compareTo(_releaseYear(a));
        if (yearCmp != 0) return yearCmp;
        return _sortTimestamp(b).compareTo(_sortTimestamp(a));
    }
  }

  Future<void> _openFilters() async {
    final result = await showFilterBottomSheet(
      context: context,
      categoryId: _activeCategoryId,
      initialState: _filterState,
      products: _allProducts,
    );
    if (result != null && mounted) {
      setState(() => _filterState = result);
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
    setState(() {
      _filterState = FilterState(
        multiSelect: newMultiSelect,
        ranges: newRanges,
        toggles: newToggles,
      );
    });
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
                  _searchController.clear();
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
    final filtered = _filteredProducts;

    return Scaffold(
      backgroundColor: context.backgroundColor,
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
          controller: _searchController,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 14,
            fontWeight: FontWeight.w500,
            color: context.textPrimary,
          ),
          decoration: InputDecoration(
            hintText:
                context.l10n?.searchInCategoryHint(_activeCategoryName) ??
                'Search in $_activeCategoryName...',
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
              child: Icon(
                Icons.search_rounded,
                color: AppTheme.brandCyan,
                size: 18,
              ),
            ),
            suffixIcon: _searchQuery.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.close_rounded, size: 18),
                    color: context.textSecondary,
                    onPressed: () => _searchController.clear(),
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
          // Show count chip only after the real total has been resolved from
          // Typesense to avoid the "50 → 4186" jump when cache/feed populate first.
          if (productCount > 0)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: context.backgroundColor,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: context.dividerColor.withValues(alpha: 0.5),
                ),
              ),
              child: Text(
                context.l10n?.productCount(productCount) ??
                    '$productCount product${productCount == 1 ? '' : 's'}',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: context.textSecondary,
                ),
              ),
            )
          else
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: context.backgroundColor,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: context.dividerColor.withValues(alpha: 0.4),
                ),
              ),
              child: SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(
                  strokeWidth: 1.6,
                  color: context.textSecondary.withValues(alpha: 0.5),
                ),
              ),
            ),
          if (_searchQuery.isNotEmpty) ...[
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                '"${_searchController.text.trim()}"',
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
          const SizedBox(width: 8),
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
        ],
      ),
    );
  }

  Future<void> _openSortFilterSheet() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _SortFilterSheet(
        currentSort: _sortOption,
        filterState: _filterState,
        categoryId: _activeCategoryId,
        products: _allProducts,
        onApply: (sort, filters) {
          setState(() {
            _sortOption = sort;
            _filterState = filters;
          });
        },
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
                .map((o) => o.label)
                .join(', ');
            chips.add(_activeChip('${def.label}: $labels', def.id));
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
            chips.add(_activeChip('${def.label}: $fmt', def.id));
          }
        case FilterType.toggle:
          final v = _filterState.toggles[def.id];
          if (v != null) {
            final yes = context.l10n?.yes ?? 'Yes';
            final no = context.l10n?.no ?? 'No';
            chips.add(_activeChip('${def.label}: ${v ? yes : no}', def.id));
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
    if (_loading || (_fetchingAll && _allProducts.isEmpty)) {
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
                      onPressed: () =>
                          setState(() => _filterState = const FilterState()),
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
          child: ListView.builder(
            controller: _scrollController,
            padding: EdgeInsets.fromLTRB(
              12,
              8,
              12,
              MediaQuery.of(context).padding.bottom +
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
              return _ProductListTile(
                    product: products[index],
                    onTap: () {
                      HapticFeedback.lightImpact();
                      context.push('/product/${products[index].id}');
                    },
                  )
                  .animate()
                  .fadeIn(
                    delay: Duration(milliseconds: 30 * (index % 10)),
                    duration: 250.ms,
                  )
                  .slideX(begin: 0.05, end: 0, duration: 250.ms);
            },
          ),
        ),
      ],
    );
  }

  Widget _buildCountBar(int count) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
      child: Row(
        children: [
          Text(
            context.l10n?.productCount(count) ??
                '$count product${count == 1 ? '' : 's'}',
            style: GoogleFonts.plusJakartaSans(
              color: context.textSecondary,
              fontSize: 13,
              fontWeight: FontWeight.w500,
            ),
          ),
          const Spacer(),
          if (_filterState.isActive || _searchQuery.isNotEmpty)
            GestureDetector(
              onTap: () {
                setState(() {
                  _filterState = const FilterState();
                  _searchController.clear();
                });
              },
              child: Text(
                context.l10n?.clearAll ?? 'Clear all',
                style: GoogleFonts.plusJakartaSans(
                  color: AppTheme.primaryBlue,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Product card
// ---------------------------------------------------------------------------

class _ProductCard extends StatelessWidget {
  const _ProductCard({required this.product, required this.onTap});

  final ProductEntity product;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final imageUrl =
        product.imageUrl ??
        (product.allImages.isNotEmpty ? product.allImages.first : null);
    final usPrice = product.prices['US'];

    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              context.surfaceVariantColor,
              context.surfaceVariantColor.withValues(alpha: 0.90),
            ],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: AppTheme.brandCyan.withValues(alpha: 0.10),
            width: 0.8,
          ),
          boxShadow: [
            ...AppTheme.cardShadow,
            BoxShadow(
              color: AppTheme.brandCyan.withValues(alpha: 0.05),
              blurRadius: 10,
              spreadRadius: -2,
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── product image ──────────────────────────────────────────────
            ProductImageBox(
              imageUrl: imageUrl,
              fallbackUrls: product.images,
              height: 140,
              width: double.infinity,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(16),
              ),
              padding: const EdgeInsets.all(10),
            ),

            // ── product info ───────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.name,
                    style: GoogleFonts.plusJakartaSans(
                      color: context.textPrimary,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      height: 1.3,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  if ((product.brand ?? '').isNotEmpty)
                    Text(
                      product.brand!,
                      style: GoogleFonts.plusJakartaSans(
                        color: context.textSecondary,
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  if (usPrice != null) ...[
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        gradient: AppTheme.primaryGradient,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        '\$${usPrice.round()}',
                        style: GoogleFonts.plusJakartaSans(
                          color: context.surfaceVariantColor,
                          fontWeight: FontWeight.w700,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                  if (product.techScore > 0) ...[
                    const SizedBox(height: 6),
                    _TechScoreBadge(score: product.techScore),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// TechScore badge
// ---------------------------------------------------------------------------

class _TechScoreBadge extends StatelessWidget {
  const _TechScoreBadge({required this.score});

  final double score;

  Color _scoreColor() {
    if (score >= 80) return AppTheme.scoreExcellent;
    if (score >= 60) return AppTheme.scoreGood;
    if (score >= 40) return AppTheme.scoreAverage;
    return AppTheme.scorePoor;
  }

  @override
  Widget build(BuildContext context) {
    final color = _scoreColor();
    final progress = (score / 100).clamp(0.0, 1.0);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: 24,
          height: 24,
          child: Stack(
            alignment: Alignment.center,
            children: [
              CircularProgressIndicator(
                value: progress,
                strokeWidth: 3,
                backgroundColor: color.withValues(alpha: 0.15),
                valueColor: AlwaysStoppedAnimation<Color>(color),
              ),
              Text(
                '${score.round()}',
                style: GoogleFonts.plusJakartaSans(
                  color: color,
                  fontSize: 7,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Product List Tile (horizontal card for list view)
// ---------------------------------------------------------------------------

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
    final isDark = Theme.of(context).brightness == Brightness.dark;

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
              maxHeight: MediaQuery.of(context).size.height * 0.65,
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
              MediaQuery.of(context).viewInsets.bottom + 20,
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
