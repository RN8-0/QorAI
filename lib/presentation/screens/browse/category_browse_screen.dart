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
import 'package:compair/core/constants.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/core/product_filter.dart';
import 'package:compair/config/filter_config.dart';
import 'package:compair/presentation/models/filter_models.dart';
import 'package:compair/presentation/providers/providers.dart';
import 'package:compair/presentation/widgets/filter_bottom_sheet.dart';
import 'package:compair/presentation/widgets/product_image_box.dart';
import 'package:compair/routing/router.dart';

import 'package:compair/domain/entities/product_entity.dart';

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
  ConsumerState<CategoryBrowseScreen> createState() => _CategoryBrowseScreenState();
}

class _CategoryBrowseScreenState extends ConsumerState<CategoryBrowseScreen> {
  FilterState _filterState = const FilterState();
  _SortOption _sortOption = _SortOption.techScore;
  final TextEditingController _searchController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  String _searchQuery = '';

  late String _activeCategoryId;
  late String _activeCategoryName;

  List<ProductEntity>? _allProducts;
  List<ProductEntity>? _remoteSearchResults;
  bool _loading = true;
  bool _loadingMore = false;
  bool _hasMore = true;
  bool _remoteSearching = false;
  String? _error;
  Timer? _searchDebounce;

  @override
  void initState() {
    super.initState();
    _activeCategoryId = widget.categoryId;
    _activeCategoryName = widget.categoryName;
    _loadProducts();
    _searchController.addListener(_onSearchChanged);
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    _scrollController.dispose();
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
      _searchDebounce = Timer(const Duration(milliseconds: 500), () {
        _doRemoteSearch(q);
      });
    }
  }

  Future<void> _doRemoteSearch(String query) async {
    if (!mounted || query.isEmpty) return;
    // Check if local results are sufficient
    final localCount = _filteredProducts.length;
    if (localCount >= 10) return;

    setState(() => _remoteSearching = true);
    try {
      final ds = ref.read(firebaseDataSourceProvider);
      final results = await ds.searchProducts(
        query: query,
        limit: 50,
        category: _activeCategoryId,
      );
      if (mounted && _searchQuery == query) {
        final localIds = (_allProducts ?? []).map((p) => p.id).toSet();
        final newProducts = results
            .where((p) => !localIds.contains(p.id))
            .cast<ProductEntity>()
            .toList();
        setState(() {
          _remoteSearchResults = newProducts;
          _remoteSearching = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _remoteSearching = false);
    }
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 400) {
      _loadMore();
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || !_hasMore || _searchQuery.isNotEmpty) return;
    setState(() => _loadingMore = true);
    try {
      final result = await ref.read(productRepositoryProvider)
          .getProducts(
            category: _activeCategoryId,
            limit: AppConstants.categoryBrowsePageSize,
            orderBy: 'techScore',
            descending: true,
          );
      result.when(
        success: (products) {
          if (!mounted) return;
          if (products.isEmpty || products.length < AppConstants.categoryBrowsePageSize) {
            _hasMore = false;
          }
          final existingIds = (_allProducts ?? []).map((p) => p.id).toSet();
          final newProducts = products.where((p) => !existingIds.contains(p.id)).toList();
          if (newProducts.isEmpty) {
            _hasMore = false;
          } else {
            setState(() {
              _allProducts = [...?_allProducts, ...newProducts];
            });
          }
        },
        failure: (_) => _hasMore = false,
      );
    } catch (_) {
      _hasMore = false;
    }
    if (mounted) setState(() => _loadingMore = false);
  }

  Future<void> _loadProducts() async {
    setState(() { _loading = true; _error = null; _hasMore = true; });
    final catKey = _activeCategoryId.toLowerCase().trim();

    // 1. Try homeFeed cache first (instant, ~50 products per category)
    try {
      final feedAsync = ref.read(homeFeedProvider);
      final cached = feedAsync.valueOrNull;
      if (cached != null && cached.all.isNotEmpty) {
        final catProducts = cached.all
            .where((p) => p.category.toLowerCase().trim() == catKey)
            .toList();
        if (catProducts.isNotEmpty && mounted) {
          setState(() { _allProducts = catProducts; _loading = false; });
          // Continue loading more from Firestore in background
          _loadMoreFromFirestore(catKey, catProducts);
          return;
        }
      }
    } catch (_) {}

    // 2. Try in-memory full cache (if available)
    try {
      final ds = ref.read(firebaseDataSourceProvider);
      if (ds.isCacheReady) {
        final all = await ds.getAllCachedProducts();
        final catProducts = all
            .where((p) => p.category.toLowerCase().trim() == catKey)
            .cast<ProductEntity>()
            .toList();
        if (catProducts.isNotEmpty && mounted) {
          setState(() { _allProducts = catProducts; _loading = false; });
          return;
        }
      }
    } catch (_) {}

    // 3. Firestore fallback — paginated load
    try {
      final result = await ref.read(productRepositoryProvider)
          .getProducts(category: _activeCategoryId, limit: AppConstants.categoryBrowsePageSize);
      result.when(
        success: (products) {
          if (mounted) {
            _hasMore = products.length >= AppConstants.categoryBrowsePageSize;
            setState(() { _allProducts = products; _loading = false; });
          }
        },
        failure: (err) {
          if (mounted) setState(() { _error = err.message; _loading = false; });
        },
      );
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  /// Background-load more products from Firestore to supplement homeFeed cache.
  Future<void> _loadMoreFromFirestore(String catKey, List<ProductEntity> initial) async {
    try {
      final result = await ref.read(productRepositoryProvider)
          .getProducts(category: _activeCategoryId, limit: AppConstants.categoryBrowsePageSize);
      result.when(
        success: (products) {
          if (!mounted || products.length <= initial.length) return;
          _hasMore = products.length >= AppConstants.categoryBrowsePageSize;
          setState(() { _allProducts = products; });
        },
        failure: (_) {},
      );
    } catch (_) {}
  }

  List<ProductEntity> get _filteredProducts {
    if (_allProducts == null) return [];
    // Apply year/brand filter first
    var list = ProductFilter.filter(_allProducts!);

    // Search query filter
    if (_searchQuery.isNotEmpty) {
      list = list.where((p) {
        return p.name.toLowerCase().contains(_searchQuery) ||
            (p.brand ?? '').toLowerCase().contains(_searchQuery);
      }).toList();

      // Merge remote search results (products not in local set)
      if (_remoteSearchResults != null && _remoteSearchResults!.isNotEmpty) {
        final localIds = list.map((p) => p.id).toSet();
        for (final p in _remoteSearchResults!) {
          if (!localIds.contains(p.id)) {
            list.add(p);
            localIds.add(p.id);
          }
        }
      }
    }

    final definitions = FilterConfig.getFiltersWithProducts(
      _activeCategoryId,
      _allProducts!,
    );
    final filtered = FilterApplier.apply(list, _filterState, definitions);
    return _sortProducts(filtered);
  }

  List<ProductEntity> _sortProducts(List<ProductEntity> products) {
    final copy = List<ProductEntity>.from(products);
    switch (_sortOption) {
      case _SortOption.techScore:
        copy.sort((a, b) {
          final cmp = b.techScore.compareTo(a.techScore);
          if (cmp != 0) return cmp;
          return b.lastUpdated.compareTo(a.lastUpdated);
        });
      case _SortOption.newest:
        copy.sort((a, b) => b.lastUpdated.compareTo(a.lastUpdated));
      case _SortOption.relevance:
        break;
    }
    return copy;
  }

  Future<void> _openFilters() async {
    final result = await showFilterBottomSheet(
      context: context,
      categoryId: _activeCategoryId,
      initialState: _filterState,
      products: _allProducts ?? [],
    );
    if (result != null && mounted) {
      setState(() => _filterState = result);
    }
  }

  void _removeFilter(String filterId) {
    final newMultiSelect = Map<String, Set<String>>.from(_filterState.multiSelect)
      ..remove(filterId);
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
                  _allProducts = null;
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
          _buildSortBar(filtered.length),
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
      child: TextField(
        controller: _searchController,
        style: GoogleFonts.plusJakartaSans(
          fontSize: 14,
          color: context.textPrimary,
        ),
        decoration: InputDecoration(
          hintText: context.l10n?.searchInCategoryHint(_activeCategoryName) ?? 'Search in ${_activeCategoryName}...',
          hintStyle: GoogleFonts.plusJakartaSans(
            fontSize: 14,
            color: context.textTertiaryColor,
          ),
          prefixIcon: Icon(
            Icons.search_rounded,
            color: context.textSecondary,
            size: 20,
          ),
          suffixIcon: _searchQuery.isNotEmpty
              ? IconButton(
                  icon: const Icon(Icons.close_rounded, size: 18),
                  color: context.textSecondary,
                  onPressed: () => _searchController.clear(),
                )
              : null,
          filled: true,
          fillColor: context.surfaceVariantColor,
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: context.dividerColor),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: context.dividerColor),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: AppTheme.primaryBlue, width: 1.5),
          ),
        ),
      ),
    );
  }

  Widget _buildSortBar(int productCount) {
    final hasFilters = _filterState.isActive;
    return Container(
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        border: Border(
          top: BorderSide(color: context.dividerColor),
          bottom: BorderSide(color: context.dividerColor),
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Row(
        children: [
          Text(
            context.l10n?.productCount(productCount) ?? '$productCount product${productCount == 1 ? '' : 's'}',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: context.textTertiaryColor,
            ),
          ),
          const Spacer(),
          // Inline sort dropdown
          _SortDropdown(
            value: _sortOption,
            onChanged: (opt) => setState(() => _sortOption = opt),
          ),
          const SizedBox(width: 8),
          // Filter button
          GestureDetector(
            onTap: _openFilters,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                gradient: hasFilters ? AppTheme.primaryGradient : null,
                color: hasFilters ? null : context.backgroundColor,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: hasFilters ? Colors.transparent : context.dividerColor,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.tune_rounded, size: 13,
                      color: hasFilters ? Colors.white : context.textSecondary),
                  const SizedBox(width: 4),
                  Text(context.l10n?.filterLabel ?? 'Filter',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12, fontWeight: FontWeight.w600,
                        color: hasFilters ? Colors.white : context.textSecondary,
                      )),
                  if (hasFilters) ...[
                    const SizedBox(width: 4),
                    Container(
                      width: 15, height: 15,
                      decoration: const BoxDecoration(
                          color: Colors.white30, shape: BoxShape.circle),
                      child: Center(
                        child: Text('${_filterState.activeCount}',
                            style: const TextStyle(fontSize: 9, color: Colors.white, fontWeight: FontWeight.w800)),
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
        products: _allProducts ?? [],
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
    final definitions = FilterConfig.getFiltersWithProducts(
      _activeCategoryId,
      _allProducts ?? [],
    );
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
            final isDecimal = ((def.maxValue ?? 100) - (def.minValue ?? 0)) < 50;
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
          bottom: BorderSide(
            color: AppTheme.brandCyan.withValues(alpha: 0.12),
          ),
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
        deleteIcon: const Icon(Icons.close, size: 16, color: AppTheme.primaryBlue),
        onDeleted: () => _removeFilter(filterId),
        backgroundColor: AppTheme.primaryBlue.withValues(alpha: 0.08),
        side: BorderSide(
          color: AppTheme.primaryBlue.withValues(alpha: 0.3),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 0),
        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
        visualDensity: VisualDensity.compact,
      ),
    );
  }

  Widget _buildBody(List<ProductEntity> products) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
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
                width: 32, height: 32,
                child: CircularProgressIndicator(strokeWidth: 2.5, color: AppTheme.brandCyan),
              ),
              const SizedBox(height: 12),
              Text(
                'Searching all products...',
                style: GoogleFonts.plusJakartaSans(
                  color: context.textSecondary, fontSize: 14, fontWeight: FontWeight.w500),
              ),
            ],
          ),
        );
      }
      final isEmptyCategory = _allProducts != null && _allProducts!.isEmpty && !_filterState.isActive;
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
                  isEmptyCategory ? Icons.inventory_2_outlined : Icons.search_off,
                  size: 48,
                  color: context.textTertiaryColor,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                _filterState.isActive
                    ? (context.l10n?.noProductsMatchFilters ?? 'No products match your filters')
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
                  context.l10n?.productsAddingSoon ?? 'Products in this category are being added.\nCheck back soon!',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(
                    color: context.textSecondary,
                    fontSize: 13,
                  ),
                ),
              ],
              if (_filterState.isActive) ...[
                const SizedBox(height: 8),
                TextButton(
                  onPressed: () => setState(() => _filterState = const FilterState()),
                  child: Text(
                    context.l10n?.clearFilters ?? 'Clear Filters',
                    style: GoogleFonts.plusJakartaSans(
                      color: AppTheme.primaryBlue,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
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
              12, 8, 12,
              MediaQuery.of(context).padding.bottom + AppTheme.navBarTotalClearance,
            ),
            itemCount: products.length + (_loadingMore ? 1 : 0),
            itemBuilder: (context, index) {
              if (index >= products.length) {
                return const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
                );
              }
              return _ProductListTile(
              product: products[index],
              onTap: () {
                HapticFeedback.lightImpact();
                context.push('/product/${products[index].id}');
              },
            ).animate()
              .fadeIn(delay: Duration(milliseconds: 30 * (index % 10)), duration: 250.ms)
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
            context.l10n?.productCount(count) ?? '$count product${count == 1 ? '' : 's'}',
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
  const _ProductCard({
    required this.product,
    required this.onTap,
  });

  final ProductEntity product;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final imageUrl = product.imageUrl ?? 
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

  @override
  Widget build(BuildContext context) {
    final imageUrl = product.imageUrl ??
        (product.allImages.isNotEmpty ? product.allImages.first : null);
    final usPrice = product.prices['US'];

    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          height: 64,
          decoration: BoxDecoration(
            color: context.surfaceVariantColor,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: AppTheme.brandCyan.withValues(alpha: 0.09),
              width: 0.8,
            ),
          ),
          child: Row(
            children: [
              // compact product image
              ClipRRect(
                borderRadius: const BorderRadius.horizontal(left: Radius.circular(11)),
                child: ProductImageBox(
                  imageUrl: imageUrl,
                  height: 64,
                  width: 64,
                  borderRadius: const BorderRadius.horizontal(left: Radius.circular(11)),
                  padding: const EdgeInsets.all(6),
                ),
              ),
              // product info
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        product.name,
                        style: GoogleFonts.plusJakartaSans(
                          color: context.textPrimary,
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                          height: 1.25,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 3),
                      Row(
                        children: [
                          if ((product.brand ?? '').isNotEmpty)
                            Flexible(
                              child: Text(
                                product.brand!,
                                style: GoogleFonts.plusJakartaSans(
                                  color: context.textTertiaryColor,
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w500,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          if ((product.brand ?? '').isNotEmpty && usPrice != null)
                            Text(' · ', style: TextStyle(color: context.textTertiaryColor, fontSize: 10.5)),
                          if (usPrice != null)
                            Text(
                              '\$${usPrice.round()}',
                              style: GoogleFonts.plusJakartaSans(
                                color: AppTheme.accentCyan,
                                fontWeight: FontWeight.w700,
                                fontSize: 11,
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              // score badge + chevron
              if (product.techScore > 0)
                _TechScoreBadge(score: product.techScore),
              Padding(
                padding: const EdgeInsets.only(right: 8, left: 4),
                child: Icon(
                  Icons.chevron_right_rounded,
                  color: context.textSecondary.withValues(alpha: 0.4),
                  size: 18,
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
          icon: Icon(Icons.keyboard_arrow_down_rounded, size: 16, color: context.textSecondary),
          dropdownColor: context.surfaceElevatedColor,
          borderRadius: BorderRadius.circular(12),
          style: GoogleFonts.plusJakartaSans(
            fontSize: 12, fontWeight: FontWeight.w600,
            color: context.textSecondary,
          ),
          onChanged: (v) { if (v != null) onChanged(v); },
          items: _SortOption.values.map((opt) => DropdownMenuItem(
            value: opt,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(opt.icon, size: 13, color: opt == value ? AppTheme.primaryBlue : context.textSecondary),
                const SizedBox(width: 5),
                Text(opt.label(context),
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      fontWeight: opt == value ? FontWeight.w700 : FontWeight.w500,
                      color: opt == value ? AppTheme.primaryBlue : context.textPrimary,
                    )),
              ],
            ),
          )).toList(),
          selectedItemBuilder: (ctx) => _SortOption.values.map((opt) => Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(opt.icon, size: 13, color: context.textSecondary),
              const SizedBox(width: 4),
              Text(opt.label(ctx),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12, fontWeight: FontWeight.w600,
                    color: context.textSecondary,
                  )),
            ],
          )).toList(),
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
              width: 36, height: 4,
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
                    fontSize: 18, fontWeight: FontWeight.w700,
                    color: context.textPrimary,
                  ),
                ),
                if (_filterState.isActive)
                  TextButton(
                    onPressed: () => setState(() => _filterState = const FilterState()),
                    child: Text(
                      'Clear Filters',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12, color: AppTheme.accentCyan, fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          // Scrollable content
          ConstrainedBox(
            constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.65),
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Sort section
                  Text(
                    'Sort By',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13, fontWeight: FontWeight.w700,
                      color: context.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8, runSpacing: 8,
                    children: _SortOption.values.map((opt) {
                      final selected = opt == _selectedSort;
                      return GestureDetector(
                        onTap: () => setState(() => _selectedSort = opt),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 130),
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                          decoration: BoxDecoration(
                            gradient: selected ? AppTheme.primaryGradient : null,
                            color: selected ? null : context.backgroundColor,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(
                              color: selected ? Colors.transparent : context.dividerColor,
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(opt.icon, size: 13,
                                  color: selected ? Colors.white : context.textSecondary),
                              const SizedBox(width: 5),
                              Text(opt.label(context),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 12,
                                    fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                                    color: selected ? Colors.white : context.textSecondary,
                                  )),
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
                        if (result != null) setState(() => _filterState = result);
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
                              color: _filterState.isActive ? AppTheme.primaryBlue : context.textSecondary,
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                _filterState.isActive ? 'Filters applied (tap to edit)' : 'Filter Options',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: _filterState.isActive ? AppTheme.primaryBlue : context.textSecondary,
                                ),
                              ),
                            ),
                            Icon(Icons.chevron_right_rounded, size: 18, color: context.textTertiaryColor),
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
            padding: EdgeInsets.fromLTRB(20, 8, 20, MediaQuery.of(context).viewInsets.bottom + 20),
            child: ElevatedButton(
              onPressed: () {
                widget.onApply(_selectedSort, _filterState);
                Navigator.of(context).pop();
              },
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                backgroundColor: AppTheme.primaryBlue,
                foregroundColor: Colors.white,
              ),
              child: Text(
                'Apply',
                style: GoogleFonts.plusJakartaSans(fontSize: 15, fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
