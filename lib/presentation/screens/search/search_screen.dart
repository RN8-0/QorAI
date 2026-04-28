import 'dart:async';

import 'package:qor_ai/core/constants.dart';
import 'package:qor_ai/core/errors.dart';
import 'package:qor_ai/core/search_ranking.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/presentation/widgets/product_image_box.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

// ─── Search Screen ───────────────────────────────────────────────────────────

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});
  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _ctrl = TextEditingController();
  final _focus = FocusNode();
  final _resultsScrollCtrl = ScrollController();
  final _emptyStateScrollCtrl = ScrollController();
  List<ProductEntity> _results = [];
  bool _searching = false;
  bool _loadingMore = false;
  bool _hasMore = false;
  int _currentPage = 1;
  String _activeQuery = '';
  Timer? _debounce;
  Timer? _scrollDebounce;

  // Paginated Top Rated state — lazy-loaded from Typesense by techScore desc.
  // Replaces the static 20-item slice that was derived from homeFeed.
  List<ProductEntity> _topRated = [];
  bool _topRatedLoading = false;
  bool _topRatedAllLoaded = false;
  int _topRatedPage = 0;
  Timer? _topRatedScrollDebounce;
  DateTime _topRatedCooldownUntil = DateTime.fromMillisecondsSinceEpoch(0);

  bool get _isTurkish =>
      (Localizations.localeOf(context).languageCode).toLowerCase() == 'tr';

  String _fallbackText({required String en, required String tr}) {
    return _isTurkish ? tr : en;
  }

  String _matchBadge(SearchRank rank) {
    if (rank.exactName) {
      return _fallbackText(en: 'Exact match', tr: 'Tam eşleşme');
    }
    if (rank.prefixName) {
      return _fallbackText(en: 'Best match', tr: 'En iyi eşleşme');
    }
    if (rank.allTokensInName) {
      return _fallbackText(en: 'Strong match', tr: 'Güçlü eşleşme');
    }
    if (rank.containsName) {
      return _fallbackText(en: 'Close match', tr: 'Yakın eşleşme');
    }
    if (rank.brandMatch) {
      return _fallbackText(en: 'Brand match', tr: 'Marka eşleşmesi');
    }
    return _fallbackText(en: 'Relevant', tr: 'İlgili');
  }

  static const _trendingSearches = [
    'iPhone',
    'Samsung Galaxy',
    'MacBook Pro',
    'PlayStation',
    'iPad Pro',
    'AirPods',
    'Dell XPS',
    'Sony WH-1000XM5',
    'RTX 4090',
  ];

  @override
  void initState() {
    super.initState();
    _focus.requestFocus();
    _resultsScrollCtrl.addListener(_handleResultsScroll);
    _emptyStateScrollCtrl.addListener(_handleEmptyStateScroll);
    // Kick off the first Top Rated page so the empty state never shows zero
    // products — homeFeed cache may not yet contain enough techScore items.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadTopRatedPage(1);
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _scrollDebounce?.cancel();
    _topRatedScrollDebounce?.cancel();
    _resultsScrollCtrl.dispose();
    _emptyStateScrollCtrl.dispose();
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _handleEmptyStateScroll() {
    if (!_emptyStateScrollCtrl.hasClients ||
        _topRatedLoading ||
        _topRatedAllLoaded) {
      return;
    }
    _topRatedScrollDebounce?.cancel();
    _topRatedScrollDebounce = Timer(const Duration(milliseconds: 150), () {
      if (!mounted ||
          !_emptyStateScrollCtrl.hasClients ||
          _topRatedLoading ||
          _topRatedAllLoaded) {
        return;
      }
      // Avoid the runaway race seen in category browse: a successful fetch
      // grows the list, but until layout completes the listener is still in
      // the trigger zone — cooldown blocks back-to-back fetches.
      if (DateTime.now().isBefore(_topRatedCooldownUntil)) return;
      final positions = _emptyStateScrollCtrl.positions;
      if (positions.length != 1) return;
      final pos = positions.first;
      if (!pos.hasContentDimensions) return;
      if (pos.maxScrollExtent <= 0) return;
      if (pos.pixels >= pos.maxScrollExtent - 600) {
        _topRatedCooldownUntil = DateTime.now().add(
          const Duration(milliseconds: 600),
        );
        _loadTopRatedPage(_topRatedPage + 1);
      }
    });
  }

  Future<void> _loadTopRatedPage(int page) async {
    if (_topRatedLoading || _topRatedAllLoaded || !mounted) return;
    setState(() => _topRatedLoading = true);
    try {
      final ds = ref.read(pbDataSourceProvider);
      final result = await ds.getTopRatedPageTs(limit: 20, page: page);
      if (!mounted) return;
      final existingIds = _topRated.map((p) => p.id).toSet();
      final additions = result.products
          .where((p) => !existingIds.contains(p.id))
          .toList();
      setState(() {
        _topRated = page == 1
            ? List<ProductEntity>.from(result.products)
            : [..._topRated, ...additions];
        _topRatedPage = page;
        _topRatedAllLoaded = !result.hasMore;
        _topRatedLoading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() => _topRatedLoading = false);
        _topRatedCooldownUntil = DateTime.now().add(
          const Duration(seconds: 3),
        );
      }
    }
  }

  void _handleResultsScroll() {
    if (!_resultsScrollCtrl.hasClients ||
        _searching ||
        _loadingMore ||
        !_hasMore) {
      return;
    }
    _scrollDebounce?.cancel();
    _scrollDebounce = Timer(const Duration(milliseconds: 100), () {
      if (_resultsScrollCtrl.position.extentAfter < 320) {
        _loadMore();
      }
    });
  }

  void _onChanged(String q) {
    _debounce?.cancel();
    if (q.trim().length < 2) {
      setState(() {
        _results = [];
        _searching = false;
        _loadingMore = false;
        _hasMore = false;
        _currentPage = 1;
        _activeQuery = '';
      });
      return;
    }
    setState(() => _searching = true);
    _debounce = Timer(
      const Duration(milliseconds: 350),
      () => _search(q, page: 1),
    );
  }

  Future<void> _search(
    String q, {
    required int page,
    bool append = false,
  }) async {
    final trimmed = q.trim();
    if (trimmed.isEmpty) return;

    setState(() {
      if (append) {
        _loadingMore = true;
      } else {
        _searching = true;
        _currentPage = 1;
        _hasMore = false;
      }
    });

    _activeQuery = trimmed;
    ref.read(searchQueryProvider.notifier).state = trimmed;

    try {
      final result = await ref
          .read(productRepositoryProvider)
          .searchProducts(
            query: trimmed,
            limit: AppConstants.searchPageSize,
            page: page,
          );
      if (!mounted || _ctrl.text.trim() != trimmed) return;

      switch (result) {
        case Success(data: final products):
          final merged = append
              ? [
                  ..._results,
                  ...products.where(
                    (candidate) =>
                        !_results.any((item) => item.id == candidate.id),
                  ),
                ]
              : products;
          final ranked = rankProductsForQuery(
            merged,
            trimmed,
            limit: merged.length,
          );
          setState(() {
            _results = ranked;
            _searching = false;
            _loadingMore = false;
            _hasMore = products.length >= AppConstants.searchPageSize;
            _currentPage = page;
          });
          if (!append && products.isNotEmpty) {
            final recent = List<String>.from(ref.read(recentSearchesProvider));
            recent.remove(trimmed);
            recent.insert(0, trimmed);
            if (recent.length > 10) recent.removeRange(10, recent.length);
            ref.read(recentSearchesProvider.notifier).state = recent;
          }
        case Failure(error: final e):
          debugPrint('SEARCH UI: failure: $e');
          setState(() {
            if (!append) _results = [];
            _searching = false;
            _loadingMore = false;
            _hasMore = false;
          });
      }
    } catch (e) {
      debugPrint('SEARCH UI: exception: $e');
      if (mounted) {
        setState(() {
          if (!append) _results = [];
          _searching = false;
          _loadingMore = false;
          _hasMore = false;
        });
      }
    }
  }

  Future<void> _loadMore() async {
    if (_loadingMore || _searching || !_hasMore || _activeQuery.isEmpty) return;
    await _search(_activeQuery, page: _currentPage + 1, append: true);
  }

  void _openProduct(ProductEntity p) {
    HapticFeedback.lightImpact();
    ref
        .read(behaviorTrackingProvider)
        .trackSearch(_ctrl.text, tappedProductId: p.id);
    context.push('/product/${p.id}');
  }

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    final bottom = MediaQuery.paddingOf(context).bottom;
    final hasQuery = _ctrl.text.trim().isNotEmpty;

    return Scaffold(
      resizeToAvoidBottomInset: false,
      backgroundColor: context.backgroundColor,
      body: Column(
        children: [
          // ─── Search Header ────────────────────────────────────────────
          Container(
            padding: EdgeInsets.only(
              top: top + 8,
              bottom: 12,
              left: 16,
              right: 16,
            ),
            decoration: BoxDecoration(
              color: context.surfaceVariantColor,
              border: Border(
                bottom: BorderSide(color: context.dividerColor, width: 0.5),
              ),
            ),
            child: Row(
              children: [
                // Back button — search screen is pushed via go_router, so
                // there is always a previous route. Without this users were
                // trapped here once the keyboard hid the system gesture bar.
                GestureDetector(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    _focus.unfocus();
                    if (context.canPop()) {
                      context.pop();
                    }
                  },
                  behavior: HitTestBehavior.opaque,
                  child: Padding(
                    padding: const EdgeInsets.only(right: 10, left: 2),
                    child: Icon(
                      Icons.arrow_back_ios_new_rounded,
                      size: 20,
                      color: context.textPrimary,
                    ),
                  ),
                ),
                Expanded(
                  child: Container(
                    height: 40,
                    decoration: BoxDecoration(
                      color: context.surfaceVariantColor,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: TextField(
                      controller: _ctrl,
                      focusNode: _focus,
                      onChanged: _onChanged,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 16,
                        color: context.textPrimary,
                      ),
                      decoration: InputDecoration(
                        hintText:
                            context.l10n?.searchProductsHint ??
                            'Search products...',
                        hintStyle: GoogleFonts.plusJakartaSans(
                          fontSize: 16,
                          color: context.textTertiaryColor,
                        ),
                        prefixIcon: Icon(
                          Icons.search_rounded,
                          size: 20,
                          color: context.textSecondary,
                        ),
                        suffixIcon: hasQuery
                            ? GestureDetector(
                                onTap: () {
                                  _ctrl.clear();
                                  setState(() {
                                    _results = [];
                                    _searching = false;
                                    _loadingMore = false;
                                    _hasMore = false;
                                    _currentPage = 1;
                                    _activeQuery = '';
                                  });
                                },
                                child: Icon(
                                  Icons.close_rounded,
                                  size: 18,
                                  color: context.textSecondary,
                                ),
                              )
                            : null,
                        border: InputBorder.none,
                        contentPadding: const EdgeInsets.symmetric(
                          vertical: 10,
                        ),
                      ),
                    ),
                  ),
                ),
                if (hasQuery) ...[
                  const SizedBox(width: 12),
                  GestureDetector(
                    onTap: () {
                      _ctrl.clear();
                      _focus.unfocus();
                      setState(() {
                        _results = [];
                        _searching = false;
                        _loadingMore = false;
                        _hasMore = false;
                        _currentPage = 1;
                        _activeQuery = '';
                      });
                    },
                    child: Text(
                      context.l10n?.cancel ?? 'Cancel',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                        color: AppTheme.neonCyan,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),

          // ─── Body ─────────────────────────────────────────────────────
          Expanded(
            child: _searching
                ? const Center(
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppTheme.neonCyan,
                    ),
                  )
                : hasQuery
                ? _results.isEmpty
                      ? _buildNoResults()
                      : _buildResults(bottom)
                : _buildEmptyState(bottom),
          ),
        ],
      ),
    );
  }

  // ─── Empty State: Popular Products + Trending ──────────────────────────────

  Widget _buildEmptyState(double bottom) {
    final recents = ref.watch(recentSearchesProvider);
    return CustomScrollView(
      controller: _emptyStateScrollCtrl,
      slivers: [
        // Recent searches
        if (recents.isNotEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        context.l10n?.recent ?? 'Recent',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary,
                        ),
                      ),
                      const Spacer(),
                      GestureDetector(
                        onTap: () {
                          HapticFeedback.selectionClick();
                          ref.read(recentSearchesProvider.notifier).state = [];
                        },
                        child: Text(
                          context.l10n?.clearLabel ?? 'Clear',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13,
                            color: AppTheme.neonCyan,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: recents
                        .map(
                          (q) => GestureDetector(
                            onTap: () {
                              HapticFeedback.selectionClick();
                              _ctrl.text = q;
                              _onChanged(q);
                            },
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 14,
                                vertical: 8,
                              ),
                              decoration: BoxDecoration(
                                color: context.surfaceVariantColor,
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(color: context.dividerColor),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    Icons.history_rounded,
                                    size: 14,
                                    color: context.textSecondary,
                                  ),
                                  const SizedBox(width: 6),
                                  Text(
                                    q,
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 13,
                                      color: context.textSecondary,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        )
                        .toList(),
                  ),
                ],
              ),
            ),
          ),

        // Trending searches
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.trending_up_rounded,
                      size: 18,
                      color: Color(0xFFFF9500),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      context.l10n?.trendingSearches ?? 'Trending Searches',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: context.textPrimary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _trendingSearches
                      .asMap()
                      .entries
                      .map(
                        (e) =>
                            GestureDetector(
                                  onTap: () {
                                    HapticFeedback.selectionClick();
                                    _ctrl.text = e.value;
                                    _onChanged(e.value);
                                  },
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 14,
                                      vertical: 8,
                                    ),
                                    decoration: BoxDecoration(
                                      gradient: e.key < 3
                                          ? LinearGradient(
                                              colors: [
                                                AppTheme.neonCyan.withValues(
                                                  alpha: 0.10,
                                                ),
                                                AppTheme.neonCyan.withValues(
                                                  alpha: 0.04,
                                                ),
                                              ],
                                            )
                                          : null,
                                      color: e.key >= 3
                                          ? context.surfaceVariantColor
                                          : null,
                                      borderRadius: BorderRadius.circular(20),
                                      border: Border.all(
                                        color: e.key < 3
                                            ? AppTheme.neonCyan.withValues(
                                                alpha: 0.25,
                                              )
                                            : context.dividerColor,
                                      ),
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        if (e.key < 3) ...[
                                          Text(
                                            '#${e.key + 1}',
                                            style: GoogleFonts.plusJakartaSans(
                                              fontSize: 11,
                                              fontWeight: FontWeight.w800,
                                              color: AppTheme.neonCyan,
                                            ),
                                          ),
                                          const SizedBox(width: 5),
                                        ],
                                        Text(
                                          e.value,
                                          style: GoogleFonts.plusJakartaSans(
                                            fontSize: 13,
                                            fontWeight: e.key < 3
                                                ? FontWeight.w600
                                                : FontWeight.w400,
                                            color: context.textSecondary,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                )
                                .animate(delay: (e.key * 50).ms)
                                .fadeIn(duration: 300.ms)
                                .slideX(begin: 0.05),
                      )
                      .toList(),
                ),
              ],
            ),
          ),
        ),

        // Top Rated Products heading
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 4),
            child: Row(
              children: [
                const Icon(
                  Icons.star_rounded,
                  size: 18,
                  color: Color(0xFFFFCC00),
                ),
                const SizedBox(width: 6),
                Text(
                  context.l10n?.topRatedProducts ?? 'Top Rated Products',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: context.textPrimary,
                  ),
                ),
                const Spacer(),
                Text(
                  context.l10n?.byTechScore ?? 'by Tech Score',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    color: context.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ),

        // Top rated products grid (paginated via Typesense, lazy-loaded).
        _buildTopRatedSliver(),

        // Footer spinner shown while next page is in flight.
        if (_topRatedLoading && _topRated.isNotEmpty)
          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 18),
              child: Center(
                child: SizedBox(
                  width: 22,
                  height: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.2,
                    color: AppTheme.neonCyan,
                  ),
                ),
              ),
            ),
          ),

        SliverPadding(
          padding: EdgeInsets.only(
            bottom: bottom + AppTheme.navBarTotalClearance + 20,
          ),
        ),
      ],
    );
  }

  Widget _buildTopRatedSliver() {
    if (_topRated.isEmpty) {
      if (_topRatedLoading) {
        return const SliverToBoxAdapter(
          child: Padding(
            padding: EdgeInsets.all(40),
            child: Center(
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: AppTheme.neonCyan,
              ),
            ),
          ),
        );
      }
      return SliverToBoxAdapter(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Center(
            child: Text(
              context.l10n?.couldNotLoadProducts ?? 'Could not load products',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 14,
                color: context.textSecondary,
              ),
            ),
          ),
        ),
      );
    }

    final country = ref.watch(selectedCountryProvider);
    final products = _topRated;

    return SliverPadding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      sliver: SliverGrid(
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisSpacing: 10,
          crossAxisSpacing: 10,
          childAspectRatio: 0.78,
        ),
        delegate: SliverChildBuilderDelegate((context, i) {
          final p = products[i];
          final price = p.getPriceForCountry(country);
          final priceStr = price != null
              ? '\$${price.toStringAsFixed(0)}'
              : null;
          return GestureDetector(
            onTap: () => _openProduct(p),
            child: Container(
              decoration: BoxDecoration(
                color: context.surfaceVariantColor,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: context.dividerColor, width: 0.5),
              ),
              child: Column(
                children: [
                  // Image area — entire top half is white so the photo
                  // never appears framed by the dark card surface.
                  Expanded(
                    child: ClipRRect(
                      borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(18),
                      ),
                      child: Stack(
                        children: [
                          const Positioned.fill(
                            child: ColoredBox(color: Colors.white),
                          ),
                          Positioned.fill(
                            child: ProductImageBox(
                              imageUrl: p.imageURL,
                              fallbackUrls: p.images,
                              borderRadius: BorderRadius.zero,
                              padding: const EdgeInsets.all(12),
                            ),
                          ),
                          if (i < 3)
                            Positioned(
                              top: 8,
                              left: 8,
                              child: Container(
                                width: 26,
                                height: 26,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  gradient: LinearGradient(
                                    colors: [
                                      i == 0
                                          ? const Color(0xFFFFD700)
                                          : i == 1
                                          ? const Color(0xFFC0C0C0)
                                          : const Color(0xFFCD7F32),
                                      i == 0
                                          ? const Color(0xFFF59E0B)
                                          : i == 1
                                          ? const Color(0xFF94A3B8)
                                          : const Color(0xFFB45309),
                                    ],
                                  ),
                                ),
                                child: Center(
                                  child: Text(
                                    '${i + 1}',
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w800,
                                      color: Colors.white,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          if (p.techScore > 0)
                            Positioned(
                              top: 8,
                              right: 8,
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 7,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: _scoreColor(p.techScore),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  p.techScore.round().toString(),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w800,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          p.name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: context.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                p.brand ?? '',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 11,
                                  color: context.textSecondary,
                                ),
                              ),
                            ),
                            if (priceStr != null)
                              Text(
                                priceStr,
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: AppTheme.neonCyan,
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        }, childCount: products.length),
      ),
    );
  }

  // ─── No Results ────────────────────────────────────────────────────────────

  Widget _buildNoResults() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child:
            Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            AppTheme.brandCyan.withValues(alpha: 0.12),
                            AppTheme.brandBlue.withValues(alpha: 0.08),
                          ],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(22),
                        border: Border.all(
                          color: AppTheme.brandCyan.withValues(alpha: 0.15),
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: AppTheme.brandCyan.withValues(alpha: 0.10),
                            blurRadius: 12,
                          ),
                        ],
                      ),
                      child: ShaderMask(
                        shaderCallback: (bounds) =>
                            AppTheme.primaryGradient.createShader(bounds),
                        child: const Icon(
                          Icons.search_off_rounded,
                          size: 32,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      context.l10n?.noResultsFound ?? 'No results found',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: context.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      context.l10n?.tryDifferentKeywords ??
                          'Try different keywords or check for typos',
                      textAlign: TextAlign.center,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 14,
                        color: context.textSecondary,
                      ),
                    ),
                  ],
                )
                .animate()
                .fadeIn(duration: 300.ms)
                .scale(begin: const Offset(0.95, 0.95)),
      ),
    );
  }

  // ─── Search Results ────────────────────────────────────────────────────────

  Widget _buildResults(double bottom) {
    final country = ref.watch(selectedCountryProvider);
    return ListView.builder(
      controller: _resultsScrollCtrl,
      cacheExtent: 600,
      addAutomaticKeepAlives: false,
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 8,
        bottom: bottom + AppTheme.navBarTotalClearance + 20,
      ),
      itemCount: _results.length + (_loadingMore ? 1 : 0),
      itemBuilder: (context, i) {
        if (i >= _results.length) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 18),
            child: Center(
              child: Column(
                children: [
                  const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.2,
                      color: AppTheme.neonCyan,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    _fallbackText(
                      en: 'Loading more products...',
                      tr: 'Daha fazla ürün yükleniyor...',
                    ),
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: context.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          );
        }

        final p = _results[i];
        final price = p.getPriceForCountry(country);
        final priceStr = price != null ? '\$${price.toStringAsFixed(0)}' : null;
        return GestureDetector(
          onTap: () => _openProduct(p),
          child: Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  context.surfaceVariantColor,
                  context.surfaceVariantColor.withValues(alpha: 0.92),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: AppTheme.brandCyan.withValues(alpha: 0.14),
                width: 0.8,
              ),
              boxShadow: [
                BoxShadow(
                  color: AppTheme.brandBlue.withValues(alpha: 0.05),
                  blurRadius: 14,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: Row(
              children: [
                // Always-white image cell — keeps product photos consistent
                // with detail/similar/category cards regardless of theme.
                Container(
                  width: 82,
                  height: 82,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(
                      color: context.dividerColor.withValues(alpha: 0.4),
                    ),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(18),
                    child: ProductImageBox(
                      imageUrl: p.imageURL,
                      fallbackUrls: p.images,
                      width: 82,
                      height: 82,
                      borderRadius: BorderRadius.zero,
                      padding: const EdgeInsets.all(8),
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Builder(
                        builder: (context) {
                          final rank = rankProductForQuery(p, _ctrl.text);
                          return Wrap(
                            spacing: 6,
                            runSpacing: 6,
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 5,
                                ),
                                decoration: BoxDecoration(
                                  gradient: AppTheme.primaryGradient,
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  _matchBadge(rank),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                              if ((p.brand ?? '').isNotEmpty)
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 5,
                                  ),
                                  decoration: BoxDecoration(
                                    color: context.backgroundColor,
                                    borderRadius: BorderRadius.circular(999),
                                    border: Border.all(
                                      color: context.dividerColor.withValues(
                                        alpha: 0.5,
                                      ),
                                    ),
                                  ),
                                  child: Text(
                                    p.brand!,
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                      color: context.textSecondary,
                                    ),
                                  ),
                                ),
                            ],
                          );
                        },
                      ),
                      const SizedBox(height: 10),
                      Text(
                        p.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary,
                          height: 1.2,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        p.category,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: context.textTertiaryColor,
                        ),
                      ),
                      if (priceStr != null || p.techScore > 0) ...[
                        const SizedBox(height: 10),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            if (priceStr != null)
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 6,
                                ),
                                decoration: BoxDecoration(
                                  color: AppTheme.neonCyan.withValues(
                                    alpha: 0.10,
                                  ),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  priceStr,
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w800,
                                    color: AppTheme.neonCyan,
                                  ),
                                ),
                              ),
                            if (p.techScore > 0)
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 6,
                                ),
                                decoration: BoxDecoration(
                                  color: _scoreColor(
                                    p.techScore,
                                  ).withValues(alpha: 0.12),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  'Tech ${p.techScore.round()}',
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w800,
                                    color: _scoreColor(p.techScore),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Color _scoreColor(double score) {
    if (score >= 80) return const Color(0xFF34C759);
    if (score >= 60) return const Color(0xFFFF9500);
    return const Color(0xFFFF3B30);
  }
}

