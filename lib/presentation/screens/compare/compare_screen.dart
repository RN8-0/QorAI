/// Compair - Compare Screen
/// Direct spec-by-spec comparison of products in the same category.
library;

import 'dart:async';
import 'dart:convert';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:youtube_explode_dart/youtube_explode_dart.dart';
import 'package:video_player/video_player.dart';
import 'package:chewie/chewie.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/domain/entities/product_entity.dart';
import 'package:compair/domain/entities/user_entity.dart';
import 'package:compair/data/models/other_models.dart';
import 'package:compair/presentation/providers/providers.dart';
import 'package:compair/presentation/widgets/product_image_box.dart';
import 'package:compair/routing/router.dart';
import 'package:compair/core/spec_word_dictionary.dart' as spec_dict;
import 'package:compair/services/youtube_service.dart';
import 'package:compair/services/gemini_service.dart';
import 'package:compair/services/profile_algorithm_service.dart';

/// 3-layer card shadow used throughout the screen.
const _cardShadow = [
  BoxShadow(color: Color(0x0A6366F1), blurRadius: 4, offset: Offset(0, 1)),
  BoxShadow(color: Color(0x086366F1), blurRadius: 12, offset: Offset(0, 4)),
  BoxShadow(color: Color(0x066366F1), blurRadius: 24, offset: Offset(0, 8)),
];

/// Premium-style indigo/violet gradient matching subscription page.
const _accentGradient = LinearGradient(
  colors: [AppTheme.brandBlue, AppTheme.brandDeepBlue, AppTheme.brandBlue],
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
);

class CompareScreen extends ConsumerStatefulWidget {
  final Object? initialComparison;
  final int initialMode; // 0 = Products, 1 = Subscriptions
  const CompareScreen({super.key, this.initialComparison, this.initialMode = 0});

  @override
  ConsumerState<CompareScreen> createState() => _CompareScreenState();
}

class _CompareScreenState extends ConsumerState<CompareScreen> {
  List<String> get _selectedProductIds => ref.read(compareSessionProvider).selectedProductIds;
  List<ProductEntity>? get _comparedProducts => ref.read(compareSessionProvider).comparedProducts;
  String? get _lockedCategory => ref.read(compareSessionProvider).lockedCategory;
  String? get _lockedSubcategory => ref.read(compareSessionProvider).lockedSubcategory;
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  Timer? _debounce;


  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // Pre-warm the product cache so search is instant
      ref.read(productRepositoryProvider).searchProducts(query: '___warm___');
      // Load initial comparison if provided (from history screen)
      if (widget.initialComparison != null) {
        _loadInitialComparison(widget.initialComparison!);
      } else if (_selectedProductIds.isEmpty) {
        // Sync from global comparison state only if session is empty
        _syncFromGlobalState();
      }
    });
  }

  void _loadInitialComparison(Object comparison) {
    try {
      // ComparisonEntity passed from comparisons history
      final comp = comparison as dynamic;
      final ids = (comp.itemIds as List).cast<String>();
      if (ids.isNotEmpty) {
        ref.read(compareSessionProvider.notifier).state = ref.read(compareSessionProvider).copyWith(
          selectedProductIds: ids,
        );
        setState(() {});
        // Auto-compare if 2+ products
        if (ids.length >= 2) {
          Future.delayed(const Duration(milliseconds: 800), () {
            if (mounted && _selectedProductIds.length >= 2) {
              _startComparison();
            }
          });
        }
      }
    } catch (_) {}
  }

  void _syncFromGlobalState() {
    final globalIds = List<String>.from(
      ref.read(comparisonStateProvider).selectedProductIds,
    );
    if (globalIds.isEmpty) return;
    // Skip if we already have products loaded
    if (_selectedProductIds.isNotEmpty) return;

    // Clear global state immediately to prevent re-sync
    ref.read(comparisonStateProvider.notifier).clearSelection();

    // Add all product IDs to session
    ref.read(compareSessionProvider.notifier).state = ref.read(compareSessionProvider).copyWith(
      selectedProductIds: globalIds,
    );
    setState(() {});

    // Ensure products are loaded, then auto-start comparison
    if (globalIds.length >= 2) {
      _waitAndCompare(globalIds);
    }
  }

  Future<void> _waitAndCompare(List<String> ids) async {
    // Wait for all products to be loaded (max 15 retries × 500ms = 7.5s)
    for (int attempt = 0; attempt < 15; attempt++) {
      if (!mounted) return;
      int loadedCount = 0;
      for (final id in ids) {
        final async = ref.read(productDetailProvider(id));
        if (async.hasValue) {
          async.value?.when(success: (_) => loadedCount++, failure: (_) {});
        }
      }
      if (loadedCount >= 2) {
        if (mounted && _comparedProducts == null) {
          _startComparison();
        }
        return;
      }
      await Future.delayed(const Duration(milliseconds: 500));
    }
    // Timeout - try anyway
    if (mounted && _comparedProducts == null && _selectedProductIds.length >= 2) {
      _startComparison();
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    _searchFocusNode.dispose();
    super.dispose();
  }

  void _onSearchChanged(String val) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      if (mounted) ref.read(searchQueryProvider.notifier).state = val;
    });
  }

  void _addProduct(String productId) {
    final ids = List<String>.from(_selectedProductIds);
    if (ids.length >= 4 || ids.contains(productId)) return;

    final productAsync = ref.read(productDetailProvider(productId));
    productAsync.whenData((result) {
      result.when(
        success: (product) {
          if (_lockedCategory != null && product.category != _lockedCategory) {
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(context.l10n?.onlySameCategoryCompare(_lockedCategory!.replaceAll('_', ' ')) ?? 'Only ${_lockedCategory!.replaceAll('_', ' ')} products can be compared together'),
                  behavior: SnackBarBehavior.floating,
                ),
              );
            }
            return;
          }

          if (mounted) {
            final newIds = List<String>.from(_selectedProductIds)..add(productId);
            ref.read(compareSessionProvider.notifier).state = ref.read(compareSessionProvider).copyWith(
              selectedProductIds: newIds,
              lockedCategory: _lockedCategory ?? product.category,
              lockedSubcategory: _lockedSubcategory ?? product.subcategory,
            );
            setState(() {});
          }
        },
        failure: (_) {},
      );
    });

    if (!productAsync.hasValue) {
      final newIds = List<String>.from(_selectedProductIds)..add(productId);
      ref.read(compareSessionProvider.notifier).state = ref.read(compareSessionProvider).copyWith(
        selectedProductIds: newIds,
      );
      setState(() {});
    }
  }

  void _removeProduct(String productId) {
    final newIds = List<String>.from(_selectedProductIds)..remove(productId);
    if (newIds.isEmpty) {
      ref.read(compareSessionProvider.notifier).state = const CompareSessionData();
    } else {
      ref.read(compareSessionProvider.notifier).state = ref.read(compareSessionProvider).copyWith(
        selectedProductIds: newIds,
        clearProducts: true,
      );
    }
    setState(() {});
  }

  Future<void> _startComparison() async {
    if (_selectedProductIds.length < 2) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.l10n?.selectAtLeast2 ?? 'Select at least 2 products'), behavior: SnackBarBehavior.floating),
      );
      return;
    }
    // Fetch all selected products
    final products = <ProductEntity>[];
    bool hasLoading = false;
    for (final id in _selectedProductIds) {
      final productAsync = ref.read(productDetailProvider(id));
      productAsync.when(
        data: (result) {
          result.when(
            success: (product) => products.add(product),
            failure: (_) {},
          );
        },
        loading: () => hasLoading = true,
        error: (_, __) {},
      );
    }
    
    if (hasLoading) {
      // Products still loading, retry after delay
      Future.delayed(const Duration(milliseconds: 500), () {
        if (mounted) _startComparison();
      });
      return;
    }
    
    if (products.length < 2) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(context.l10n?.couldNotLoadProduct ?? 'Could not load product data'), behavior: SnackBarBehavior.floating),
      );
      return;
    }

    // Enforce same category
    final categories = products.map((p) => p.category).toSet();
    if (categories.length > 1) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(context.l10n?.mustBeSameCategory ?? 'Products must be from the same category to compare'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    ref.read(compareSessionProvider.notifier).state = ref.read(compareSessionProvider).copyWith(
      comparedProducts: products,
    );
    setState(() {});

    // Save comparison to Firestore for history
    final user = ref.read(userProfileProvider).valueOrNull;
    if (user != null) {
      final title = products.map((p) => p.name).join(' vs ');
      try {
        await ref.read(comparisonRepositoryProvider).saveManualComparison(
          userId: user.uid,
          productIds: _selectedProductIds.toList(),
          category: products.first.category,
          title: title,
        );
        // Invalidate comparisons cache so history updates
        ref.invalidate(userComparisonsProvider);
      } catch (e) {
        debugPrint('Failed to save comparison: $e');
      }
    }

    // Track comparison behavior
    ref.read(behaviorTrackingProvider)
        .trackComparison(_selectedProductIds.toList());
  }

  void _resetComparison() {
    ref.read(compareSessionProvider.notifier).state = const CompareSessionData();
    setState(() {});
  }

  /// Directly start comparison with full ProductEntity objects (bypasses provider cache)
  void _directCompare(List<ProductEntity> products) {
    if (products.length < 2) return;
    ref.read(compareSessionProvider.notifier).state = CompareSessionData(
      selectedProductIds: products.map((p) => p.id).toList(),
      comparedProducts: products,
      lockedCategory: products.first.category,
      lockedSubcategory: products.first.subcategory,
    );
    setState(() {});
    ref.read(behaviorTrackingProvider)
        .trackComparison(_selectedProductIds.toList());
  }

  @override
  Widget build(BuildContext context) {
    // Watch session state for reactivity
    final session = ref.watch(compareSessionProvider);
    final _selectedIds = session.selectedProductIds;
    final _products = session.comparedProducts;
    return Scaffold(
      backgroundColor: context.surfaceColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        title: ShaderMask(
          shaderCallback: (bounds) => _accentGradient.createShader(bounds),
          child: Text(
            widget.initialMode == 1
                ? (context.l10n?.compareSubscriptions ?? 'Compare Subscriptions')
                : (context.l10n?.compare ?? 'Compare'),
            style: GoogleFonts.plusJakartaSans(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 22,
              letterSpacing: -0.5,
            ),
          ),
        ),
        centerTitle: true,
        actions: [
          if (_selectedIds.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: TextButton.icon(
                onPressed: _resetComparison,
                icon: const Icon(Icons.refresh_rounded, size: 16, color: AppTheme.error),
                label: Text(
                  'Clear',
                  style: GoogleFonts.plusJakartaSans(
                    color: AppTheme.error,
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
              ),
            ),
        ],
      ),
      body: Column(
        children: [
          // Content
          Expanded(
            child: _products != null
                ? _SpecComparisonView(products: _products, onReset: _resetComparison)
                : _buildSelectionView(),
          ),
        ],
      ),
    );
  }


  Widget _buildSelectionView() {
    final canCompare = _selectedProductIds.length >= 2;
    return Stack(
      fit: StackFit.expand,
      children: [
        Column(
      children: [
        // Product slots
        Container(
          margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                AppTheme.brandBlue.withValues(alpha: 0.06),
                AppTheme.brandDeepBlue.withValues(alpha: 0.03),
                Colors.white.withValues(alpha: 0.02),
              ],
            ),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: AppTheme.brandBlue.withValues(alpha: 0.12)),
            boxShadow: [
              BoxShadow(color: AppTheme.brandBlue.withValues(alpha: 0.08), blurRadius: 16, offset: const Offset(0, 4)),
              const BoxShadow(color: Color(0x08000000), blurRadius: 8, offset: Offset(0, 2)),
            ],
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: _buildSlotWidgets(),
          ),
        ),

        _buildStepProgress(),

        // Search bar
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  AppTheme.brandBlue.withValues(alpha: 0.06),
                  AppTheme.brandDeepBlue.withValues(alpha: 0.03),
                ],
              ),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppTheme.brandBlue.withValues(alpha: 0.12)),
              boxShadow: _cardShadow,
            ),
            child: TextField(
              controller: _searchController,
              focusNode: _searchFocusNode,
              onChanged: _onSearchChanged,
              style: TextStyle(color: context.textPrimary, fontSize: 14),
              decoration: InputDecoration(
                hintText: _lockedSubcategory != null
                    ? (context.l10n?.searchCategoryProductsHint(_lockedSubcategory!.replaceAll('_', ' ')) ?? 'Search ${_lockedSubcategory!.replaceAll('_', ' ')} products...')
                    : (context.l10n?.searchCompareHint ?? 'Search products to compare...'),
                hintStyle: TextStyle(color: context.textTertiaryColor, fontSize: 14),
                prefixIcon: ShaderMask(
                  shaderCallback: (bounds) => _accentGradient.createShader(bounds),
                  child: const Icon(Icons.search, color: Colors.white),
                ),
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              ),
            ),
          ),
        ),

        const SizedBox(height: 8),

        // Product list: show search list until all 4 slots are filled
        Expanded(
          child: _selectedProductIds.length >= 4
              ? _EmptyCompareState(
                  onTapSearch: () => context.push(AppRoutes.search),
                  onDirectCompare: _directCompare,
                )
              : _ProductSearchList(
                  selectedIds: _selectedProductIds,
                  lockedCategory: _lockedCategory,
                  lockedSubcategory: _lockedSubcategory,
                  onSelect: _addProduct,
                  onRemove: _removeProduct,
                ),
        ),

        ],
        ),

        // Compare Now button — floating overlay, no dark background
        if (canCompare)
          Positioned(
            left: 16,
            bottom: MediaQuery.of(context).padding.bottom + AppTheme.navBarTotalClearance,
            child: GestureDetector(
              onTap: () {
                HapticFeedback.mediumImpact();
                _startComparison();
              },
              child: Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  gradient: _accentGradient,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: AppTheme.brandDeepBlue.withValues(alpha: 0.35),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: const Icon(Icons.compare_arrows_rounded, color: Colors.white, size: 24),
              ),
            ),
          ),
      ],
    );
  }

  List<Widget> _buildSlotWidgets() {
    // Dynamic: show filled slots + 1 empty (up to max 4)
    final filledCount = _selectedProductIds.length;
    final totalSlots = (filledCount + 1).clamp(2, 4);
    final widgets = <Widget>[];
    for (int i = 0; i < totalSlots; i++) {
      if (i > 0) {
        widgets.add(
          Container(
            width: 22,
            height: 22,
            margin: const EdgeInsets.symmetric(horizontal: 3),
            decoration: const BoxDecoration(
              gradient: _accentGradient,
              shape: BoxShape.circle,
            ),
            child: const Center(
              child: Text('VS', style: TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.w800)),
            ),
          ),
        );
      }
      if (i < filledCount) {
        final productId = _selectedProductIds[i];
        final productAsync = ref.watch(productDetailProvider(productId));
        widgets.add(
          Expanded(
            child: productAsync.when(
              data: (result) => result.when(
                success: (product) => _buildFilledSlot(product),
                failure: (_) => _buildEmptySlot(i + 1),
              ),
              loading: () => const SizedBox(
                height: 90,
                child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
              ),
              error: (_, _) => _buildEmptySlot(i + 1),
            ),
          ),
        );
      } else {
        widgets.add(Expanded(child: _buildEmptySlot(i + 1)));
      }
    }
    return widgets;
  }

  Widget _buildEmptySlot(int slotNumber) {
    return GestureDetector(
      onTap: () {
        _searchFocusNode.requestFocus();
        HapticFeedback.selectionClick();
      },
      child: Column(
        children: [
          Container(
            width: 60,
            height: 60,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: AppTheme.brandBlue.withValues(alpha: 0.25),
                width: 1.5,
              ),
              color: AppTheme.brandBlue.withValues(alpha: 0.04),
            ),
            child: Center(
              child: Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: _accentGradient,
                  boxShadow: [
                    BoxShadow(
                      color: AppTheme.brandBlue.withValues(alpha: 0.3),
                      blurRadius: 8,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: const Icon(Icons.add_rounded, color: Colors.white, size: 16),
              ),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '#$slotNumber',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: AppTheme.brandBlue.withValues(alpha: 0.7),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStepProgress() {
    final count = _selectedProductIds.length;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            '$count / 4',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: count >= 2 ? AppTheme.brandDeepBlue : context.textTertiaryColor,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            count < 2
                ? (context.l10n?.selectAtLeast2 ?? 'Select at least 2 products')
                : 'Ready to compare!',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11,
              color: context.textTertiaryColor,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilledSlot(ProductEntity product) {
    return Column(
      children: [
        Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.center,
          children: [
            Container(
              width: 60,
              height: 60,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppTheme.brandBlue.withValues(alpha: 0.2)),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(13),
                child: ProductImageBox(
                  imageUrl: product.imageUrl,
                  width: 56, height: 56,
                  borderRadius: BorderRadius.circular(13),
                  padding: const EdgeInsets.all(4),
                ),
              ),
            ),
            Positioned(
              top: -5, right: -5,
              child: GestureDetector(
                onTap: () => _removeProduct(product.id),
                child: Container(
                  width: 20, height: 20,
                  decoration: BoxDecoration(
                    color: AppTheme.error,
                    shape: BoxShape.circle,
                    border: Border.all(color: context.backgroundColor, width: 2),
                  ),
                  child: const Icon(Icons.close, size: 10, color: Colors.white),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          product.name,
          style: GoogleFonts.plusJakartaSans(fontSize: 10, fontWeight: FontWeight.w600, color: context.textPrimary),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}


// ─── Empty State ───

class _EmptyCompareState extends ConsumerWidget {
  final VoidCallback onTapSearch;
  final void Function(List<ProductEntity> products) onDirectCompare;
  const _EmptyCompareState({
    required this.onTapSearch,
    required this.onDirectCompare,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trending = ref.watch(trendingProductsProvider);
    final bool isDark = Theme.of(context).brightness == Brightness.dark;

    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(20, 12, 20,
          MediaQuery.of(context).padding.bottom + AppTheme.navBarTotalClearance + 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Hero section
          Center(child: Column(children: [
            Container(
              width: 80, height: 80,
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [
                  AppTheme.brandBlue.withValues(alpha: 0.16),
                  AppTheme.brandDeepBlue.withValues(alpha: 0.16)]),
                shape: BoxShape.circle),
              child: const Center(child: Icon(Icons.compare_arrows_rounded,
                  size: 40, color: AppTheme.brandBlue)),
            ),
            const SizedBox(height: 16),
            Text(context.l10n?.compareProducts ?? 'Compare Products', style: GoogleFonts.plusJakartaSans(
                fontSize: 20, fontWeight: FontWeight.w800,
                color: context.textPrimary)),
            const SizedBox(height: 6),
            Text(context.l10n?.selectProductsOrTry ?? 'Select products or try a popular comparison',
                textAlign: TextAlign.center,
                style: GoogleFonts.plusJakartaSans(fontSize: 13,
                    color: context.textSecondary)),
          ])).animate().fadeIn(duration: 400.ms).slideY(begin: 0.1),
          const SizedBox(height: 24),

          // Popular Comparisons
          Text(context.l10n?.popularComparisons ?? 'Popular Comparisons', style: GoogleFonts.plusJakartaSans(
              fontSize: 16, fontWeight: FontWeight.w700,
              color: context.textPrimary)),
          const SizedBox(height: 12),
          ..._buildPopularComparisons(context, ref),
          const SizedBox(height: 24),

          // Trending Products to Compare
          Text(context.l10n?.trendingProducts ?? 'Trending Products', style: GoogleFonts.plusJakartaSans(
              fontSize: 16, fontWeight: FontWeight.w700,
              color: context.textPrimary)),
          const SizedBox(height: 12),
          trending.when(
            data: (products) {
              // Enforce brand diversity — max 2 per brand
              final diverseProducts = <ProductEntity>[];
              final brandCount = <String, int>{};
              for (final p in products) {
                final brand = p.brand?.toLowerCase() ?? 'unknown';
                if ((brandCount[brand] ?? 0) >= 2) continue;
                brandCount[brand] = (brandCount[brand] ?? 0) + 1;
                diverseProducts.add(p);
                if (diverseProducts.length >= 16) break;
              }
              final top = diverseProducts;
              if (top.isEmpty) return const SizedBox.shrink();
              return Wrap(
                spacing: 8, runSpacing: 8,
                children: top.asMap().entries.map((e) {
                  final p = e.value;
                  return GestureDetector(
                    onTap: () {
                      HapticFeedback.selectionClick();
                      ref.read(comparisonStateProvider.notifier).toggleProduct(p.id);
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: context.surfaceVariantColor,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: context.dividerColor),
                        boxShadow: [BoxShadow(
                          color: (isDark ? Colors.black : Colors.black12).withValues(alpha: isDark ? 0.04 : 0.06),
                          blurRadius: 8, offset: const Offset(0, 2))]),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        if (p.imageUrl != null)
                          ClipRRect(
                            borderRadius: BorderRadius.circular(6),
                            child: CachedNetworkImage(
                              imageUrl: p.imageUrl!,
                              width: 28, height: 28, fit: BoxFit.contain,
                              errorWidget: (_, __, ___) => Icon(
                                  Icons.devices, size: 18, color: context.textTertiaryColor))),
                        if (p.imageUrl != null) const SizedBox(width: 8),
                        Flexible(child: Text(p.name,
                            maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.plusJakartaSans(fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: context.textSecondary))),
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppTheme.brandBlue.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(8)),
                          child: Text('${p.techScore.toInt()}',
                              style: GoogleFonts.plusJakartaSans(fontSize: 10,
                                  fontWeight: FontWeight.w700, color: AppTheme.brandBlue))),
                      ]),
                    ),
                  ).animate().fadeIn(delay: (60 * e.key).ms, duration: 300.ms);
                }).toList(),
              );
            },
            loading: () => const Center(child: Padding(
                padding: EdgeInsets.all(20),
                child: CircularProgressIndicator(strokeWidth: 2))),
            error: (_, __) => const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildPopularComparisons(BuildContext context, WidgetRef ref) {
    // Use real products from homeFeed cache instead of hardcoded names
    final feedAsync = ref.watch(homeFeedProvider);
    final feed = feedAsync.valueOrNull;
    final bool isDark = Theme.of(context).brightness == Brightness.dark;

    if (feed == null) {
      return [const Center(child: Padding(
        padding: EdgeInsets.all(16),
        child: CircularProgressIndicator(strokeWidth: 2)))];
    }

    // Build comparison pairs from top 2 products in popular categories
    final comparisons = <Map<String, dynamic>>[];
    final categoryMeta = <String, Map<String, String>>{
      'smartphones': {'icon': '\u{1F4F1}', 'label': 'Smartphones'},
      'laptops': {'icon': '\u{1F4BB}', 'label': 'Laptops'},
      'tablets': {'icon': '\u{1F4F1}', 'label': 'Tablets'},
      'headphones': {'icon': '\u{1F3A7}', 'label': 'Audio'},
      'smartwatches': {'icon': '\u231A', 'label': 'Wearables'},
      'tvs': {'icon': '\u{1F4FA}', 'label': 'TVs'},
      'gpus': {'icon': '\u{1F3AE}', 'label': 'Graphics Cards'},
      'cameras': {'icon': '\u{1F4F7}', 'label': 'Cameras'},
    };

    for (final entry in categoryMeta.entries) {
      final catProducts = feed.byCategory[entry.key] ?? [];
      // Need at least 2 different-brand products
      if (catProducts.length >= 2) {
        final a = catProducts[0];
        ProductEntity? b;
        for (int i = 1; i < catProducts.length; i++) {
          if (catProducts[i].brand != a.brand) {
            b = catProducts[i];
            break;
          }
        }
        b ??= catProducts[1];
        comparisons.add({
          'a': a,
          'b': b,
          'icon': entry.value['icon']!,
          'cat': entry.value['label']!,
        });
      }
      if (comparisons.length >= 6) break;
    }

    if (comparisons.isEmpty) {
      return [Padding(
        padding: const EdgeInsets.all(12),
        child: Text(context.l10n?.loadingPopularComparisons ?? 'Loading popular comparisons...',
            style: GoogleFonts.plusJakartaSans(fontSize: 13, color: context.textTertiaryColor)),
      )];
    }

    return comparisons.asMap().entries.map((e) {
      final c = e.value;
      final i = e.key;
      final productA = c['a'] as ProductEntity;
      final productB = c['b'] as ProductEntity;
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: GestureDetector(
          onTap: () {
            HapticFeedback.mediumImpact();
            onDirectCompare([productA, productB]);
          },
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: context.surfaceVariantColor,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: context.dividerColor),
              boxShadow: [BoxShadow(
                color: (isDark ? Colors.black : Colors.black12).withValues(alpha: isDark ? 0.03 : 0.06),
                blurRadius: 8, offset: const Offset(0, 2))]),
            child: Row(children: [
              Text(c['icon'] as String, style: const TextStyle(fontSize: 24)),
              const SizedBox(width: 12),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${productA.name} vs ${productB.name}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.plusJakartaSans(fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary)),
                  const SizedBox(height: 2),
                  Text(c['cat'] as String, style: GoogleFonts.plusJakartaSans(
                      fontSize: 11, color: context.textTertiaryColor)),
                ])),
              Container(
                width: 32, height: 32,
                decoration: BoxDecoration(
                  color: AppTheme.brandBlue.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.compare_arrows_rounded,
                    size: 16, color: AppTheme.brandBlue)),
            ]),
          ),
        ),
      ).animate().fadeIn(delay: (80 * i).ms, duration: 300.ms)
        .slideX(begin: 0.05, duration: 300.ms);
    }).toList();
  }
}

// ─── Product Search List with Category Filter ───

class _ProductSearchList extends ConsumerWidget {
  final List<String> selectedIds;
  final String? lockedCategory;
  final String? lockedSubcategory;
  final Function(String) onSelect;
  final Function(String) onRemove;

  const _ProductSearchList({
    required this.selectedIds,
    this.lockedCategory,
    this.lockedSubcategory,
    required this.onSelect,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = ref.watch(searchQueryProvider);
    final resultsAsync = ref.watch(searchResultsProvider(query));

    return resultsAsync.when(
      data: (result) => result.when(
        success: (products) {
          // Filter by locked category
          var filtered = products.where((p) {
            if (lockedSubcategory != null && p.subcategory != lockedSubcategory) return false;
            if (lockedSubcategory == null && lockedCategory != null && p.category != lockedCategory) return false;
            return true;
          }).toList();

          if (filtered.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.search_off, size: 48, color: context.textTertiaryColor),
                  const SizedBox(height: 12),
                  Text(
                    context.l10n?.noProductsFound ?? 'No products found',
                    style: TextStyle(color: context.textSecondary),
                  ),
                ],
              ),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            itemCount: filtered.length,
            itemBuilder: (context, index) {
              final product = filtered[index];
              final isSelected = selectedIds.contains(product.id);
              return Container(
                height: 72,
                margin: const EdgeInsets.symmetric(vertical: 4),
                decoration: BoxDecoration(
                  gradient: isSelected
                      ? LinearGradient(
                          colors: [
                            AppTheme.brandBlue.withValues(alpha: 0.12),
                            AppTheme.brandDeepBlue.withValues(alpha: 0.06),
                          ],
                          begin: Alignment.centerLeft,
                          end: Alignment.centerRight,
                        )
                      : null,
                  color: isSelected ? null : context.surfaceVariantColor,
                  borderRadius: BorderRadius.circular(14),
                  border: isSelected
                      ? Border.all(color: AppTheme.brandDeepBlue.withValues(alpha: 0.5), width: 1.5)
                      : Border.all(color: context.dividerColor),
                  boxShadow: isSelected
                      ? [
                          BoxShadow(color: AppTheme.brandBlue.withValues(alpha: 0.18), blurRadius: 12, offset: const Offset(0, 3)),
                          ..._cardShadow,
                        ]
                      : _cardShadow,
                ),
                child: Material(
                  color: Colors.transparent,
                  borderRadius: BorderRadius.circular(14),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(14),
                    onTap: () => isSelected ? onRemove(product.id) : onSelect(product.id),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      child: Row(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(10),
                            child: ProductImageBox(
                              imageUrl: product.imageUrl,
                              width: 48, height: 48,
                              borderRadius: BorderRadius.circular(10),
                              padding: const EdgeInsets.all(4),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  product.name,
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600,
                                    color: isSelected ? context.textPrimary : context.textPrimary,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  product.brand ?? product.subcategory,
                                  style: TextStyle(fontSize: 13, color: context.textSecondary),
                                ),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? AppTheme.brandDeepBlue.withValues(alpha: 0.15)
                                  : AppTheme.brandBlue.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              product.subcategory.replaceAll('_', ' '),
                              style: TextStyle(
                                  fontSize: 11,
                                  color: isSelected ? AppTheme.brandDeepBlue : AppTheme.brandBlue,
                                  fontWeight: FontWeight.w500),
                            ),
                          ),
                          const SizedBox(width: 8),
                          isSelected
                              ? ShaderMask(
                                  shaderCallback: (bounds) => _accentGradient.createShader(bounds),
                                  child: const Icon(Icons.check_circle, color: Colors.white, size: 24),
                                )
                              : Icon(Icons.add_circle_outline, color: context.textTertiaryColor, size: 22),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            },
          );
        },
        failure: (error) => Center(
          child: Text(context.l10n?.errorPrefix(error.message ?? '') ?? 'Error: ${error.message}', style: TextStyle(color: context.textPrimary)),
        ),
      ),
      loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandBlue)),
      error: (err, _) => Center(
        child: Text(context.l10n?.anErrorOccurred('$err') ?? 'An error occurred: $err', style: TextStyle(color: context.textPrimary)),
      ),
    );
  }
}

// ─── Direct Spec-by-Spec Comparison View ───

class _SpecComparisonView extends ConsumerStatefulWidget {
  final List<ProductEntity> products;
  final VoidCallback onReset;
  const _SpecComparisonView({required this.products, required this.onReset});

  @override
  ConsumerState<_SpecComparisonView> createState() => _SpecComparisonViewState();
}

class _SpecComparisonViewState extends ConsumerState<_SpecComparisonView> {
  late Map<String, bool> _expandedGroups;
  late Map<String, Map<String, List<String>>> _groupedSpecs;
  String? _aiAnalysis;
  Map<String, dynamic>? _aiStructured;
  bool _aiLoading = false;
  bool _aiExpanded = true;

  // Deep Analysis state
  bool _deepAnalysisExpanded = false;
  bool _deepAnalysisLoading = false;
  String? _deepAnalysisResult;

  // Smart Alternatives state (comparison)
  bool _alternativesExpanded = false;
  bool _alternativesLoading = false;
  String? _alternativesResult;

  // AI Advisor state (comparison buying advice)
  bool _advisorExpanded = false;
  bool _advisorLoading = false;
  String? _advisorResult;

  // Price Prediction state
  bool _predictionExpanded = false;
  bool _predictionLoading = false;
  String? _predictionResult;


  @override
  void initState() {
    super.initState();
    _groupedSpecs = _buildGroupedSpecs();
    final keys = _groupedSpecs.keys.toList();
    _expandedGroups = {
      for (int i = 0; i < keys.length; i++) keys[i]: false,
    };
    // Restore AI analysis from session if available
    _restoreFromSession();
  }

  /// Restore AI analysis results from session (survives navigation)
  void _restoreFromSession() {
    final session = ref.read(compareSessionProvider);
    final sessionIds = session.selectedProductIds.toSet();
    final currentIds = widget.products.map((p) => p.id).toSet();
    if (sessionIds.isNotEmpty && sessionIds.difference(currentIds).isEmpty && currentIds.difference(sessionIds).isEmpty) {
      if (session.aiAnalysis != null) {
        _aiAnalysis = session.aiAnalysis;
        _aiStructured = session.aiStructured;
      }
      if (session.deepAnalysisResult != null) _deepAnalysisResult = session.deepAnalysisResult;
      if (session.alternativesResult != null) _alternativesResult = session.alternativesResult;
      if (session.advisorResult != null) _advisorResult = session.advisorResult;
      if (session.predictionResult != null) _predictionResult = session.predictionResult;
    }
  }

  /// Save AI analysis results to session
  void _saveToSession() {
    ref.read(compareSessionProvider.notifier).update((state) => state.copyWith(
      aiAnalysis: _aiAnalysis,
      aiStructured: _aiStructured,
      deepAnalysisResult: _deepAnalysisResult,
      alternativesResult: _alternativesResult,
      advisorResult: _advisorResult,
      predictionResult: _predictionResult,
    ));
  }

  Future<void> _loadAiAnalysis() async {
    setState(() => _aiLoading = true);
    try {
      final gemini = ref.read(geminiServiceProvider);
      final productNames = widget.products.map((p) => p.name).join(' vs ');
      final specSummary = widget.products.map((p) {
        final keySpecs = p.keySpecs.entries.take(10).map((e) => '${e.key}: ${e.value}').join(', ');
        return '${p.name} (${p.brand ?? ""}): Score ${p.techScore.toInt()}/100. $keySpecs';
      }).join('\n');

      final lang = Localizations.localeOf(context).languageCode;
      final langName = lang == 'tr' ? 'Turkish' : 'English';

      final prompt = '''Compare these products in detail. ALL text in $langName.
$productNames

Specs:
$specSummary

Return ONLY valid JSON:
{
  "winner": "product name",
  "winner_score": 0-100,
  "products": {
    "<product_name>": {
      "compatibility_score": 0-100,
      "strengths": ["str1", "str2", "str3"],
      "weaknesses": ["weak1", "weak2"],
      "best_for": "ideal use case"
    }
  },
  "factors": {
    "performance": {"scores": {"<name1>": 0-100, "<name2>": 0-100}},
    "value": {"scores": {"<name1>": 0-100, "<name2>": 0-100}},
    "features": {"scores": {"<name1>": 0-100, "<name2>": 0-100}},
    "build_quality": {"scores": {"<name1>": 0-100, "<name2>": 0-100}},
    "user_experience": {"scores": {"<name1>": 0-100, "<name2>": 0-100}}
  },
  "recommendation": "3-4 sentence personalized recommendation",
  "verdict": "one sentence summary"
}''';

      // Use jsonFreeTextQuery for guaranteed JSON response format
      final result = await gemini.jsonFreeTextQuery(prompt, language: lang);
      if (mounted) {
        // Parse JSON response - jsonFreeTextQuery enforces JSON format
        Map<String, dynamic>? parsed;
        try {
          var clean = result.trim();
          // Strip markdown code fences if present (shouldn't be with responseMimeType)
          final codeBlockMatch = RegExp(r'```(?:json)?\s*\n?([\s\S]*?)\n?\s*```').firstMatch(clean);
          if (codeBlockMatch != null) {
            clean = codeBlockMatch.group(1)!.trim();
          }
          // Try to find JSON object in the response
          final jsonStart = clean.indexOf('{');
          final jsonEnd = clean.lastIndexOf('}');
          if (jsonStart >= 0 && jsonEnd > jsonStart) {
            clean = clean.substring(jsonStart, jsonEnd + 1);
          }
          parsed = jsonDecode(clean) as Map<String, dynamic>?;
        } catch (_) {
          debugPrint('=== COMPAIR: Compare AI JSON parse failed ===');
        }

        setState(() {
          _aiAnalysis = result;
          _aiStructured = parsed;
          _aiLoading = false;
          _aiExpanded = true;
        });
        // Save to session for persistence across navigation
        _saveToSession();
      }
    } catch (_) {
      if (mounted) setState(() => _aiLoading = false);
    }
  }

  Future<void> _toggleDeepAnalysis() async {
    if (_deepAnalysisExpanded && _deepAnalysisResult != null) {
      setState(() => _deepAnalysisExpanded = false);
      return;
    }
    setState(() {
      _deepAnalysisExpanded = true;
      if (_deepAnalysisResult != null) return;
      _deepAnalysisLoading = true;
    });
    if (_deepAnalysisResult != null) return;
    try {
      final gemini = ref.read(geminiServiceProvider);
      final lang = Localizations.localeOf(context).languageCode;
      final langName = lang == 'tr' ? 'Turkish' : 'English';
      final productNames = widget.products.map((p) => p.name).join(' vs ');

      // Use grounded query to search Reddit/forums and get real user opinions
      final result = await gemini.groundedQuery(
        '''You are a senior tech product analyst. Analyze "$productNames" with web research.

INSTRUCTIONS:
1. Search Reddit, tech forums, and community discussions for real user experiences
2. Find actual user complaints and praise from r/technology, r/gadgets, product-specific subreddits
3. Look for common issues reported by real users

Provide analysis in $langName covering:

## Expert Analysis
- Build quality & design philosophy differences
- Real-world performance (not just benchmarks)
- Value proposition of each product
- Hidden strengths most reviewers miss
- Potential deal-breakers

## Community Insights (Reddit/Forums)
- What real users love about each product
- Common complaints and issues reported
- Long-term reliability reports from actual owners
- Community consensus on which is better and why

## Verdict
- Best use case for each product
- Overall recommendation with reasoning

Keep it comprehensive but readable. Use bullet points for clarity.''',
      );
      if (mounted) {
        setState(() {
          _deepAnalysisResult = result.isNotEmpty ? result : 'Unable to generate analysis.';
          _deepAnalysisLoading = false;
        });
        // Save to session for persistence across navigation
        _saveToSession();
      }
    } catch (_) {
      if (mounted) setState(() {
        _deepAnalysisResult = 'Unable to generate analysis. Please try again.';
        _deepAnalysisLoading = false;
      });
    }
  }

  Future<void> _toggleAlternatives() async {
    if (_alternativesExpanded && _alternativesResult != null) {
      setState(() => _alternativesExpanded = false);
      return;
    }
    setState(() {
      _alternativesExpanded = true;
      if (_alternativesResult != null) return;
      _alternativesLoading = true;
    });
    if (_alternativesResult != null) return;
    try {
      final gemini = ref.read(geminiServiceProvider);
      final lang = Localizations.localeOf(context).languageCode;
      final langName = lang == 'tr' ? 'Turkish' : 'English';
      final productNames = widget.products.map((p) => '${p.name} (${p.brand ?? "Unknown"})').join(' vs ');
      final category = widget.products.first.category;
      final result = await gemini.groundedQuery(
        '''You are a tech product expert. The user is comparing: $productNames in category "$category".
Suggest 3-5 alternative products they should also consider, in $langName.

For each alternative:
🔷 **Product Name** — Brand
- Why it's worth considering (1-2 sentences)
- Key advantage over the compared products
- Price range estimate

Also briefly explain:
## 🎯 Which Alternative Fits Best?
- For budget users: ...
- For performance seekers: ...
- For best value: ...''',
      );
      if (mounted) {
        setState(() {
          _alternativesResult = result.isNotEmpty ? result : 'Unable to generate alternatives.';
          _alternativesLoading = false;
        });
        _saveToSession();
      }
    } catch (_) {
      if (mounted) setState(() {
        _alternativesResult = 'Unable to generate alternatives. Please try again.';
        _alternativesLoading = false;
      });
    }
  }

  Future<void> _toggleAdvisor() async {
    if (_advisorExpanded && _advisorResult != null) {
      setState(() => _advisorExpanded = false);
      return;
    }
    setState(() {
      _advisorExpanded = true;
      if (_advisorResult != null) return;
      _advisorLoading = true;
    });
    if (_advisorResult != null) return;
    try {
      final gemini = ref.read(geminiServiceProvider);
      final lang = Localizations.localeOf(context).languageCode;
      final langName = lang == 'tr' ? 'Turkish' : 'English';
      final productDetails = widget.products.map((p) {
        final specs = p.specs.entries.take(10).map((e) => '${e.key}: ${e.value}').join(', ');
        final price = p.prices.isNotEmpty ? p.prices.values.first : 'N/A';
        return '${p.name} (Score: ${p.techScore}, Price: $price, Specs: $specs)';
      }).join('\n');
      final result = await gemini.groundedQuery(
        '''You are a personal shopping advisor. Help the user decide between these products. Respond in $langName.

Products being compared:
$productDetails

Provide personalized buying advice:

## 🏆 Winner Summary
- Overall winner and runner-up with reasoning

## 👤 Who Should Buy What?
- **${widget.products.first.name}** is best for: ...
${widget.products.length > 1 ? '- **${widget.products[1].name}** is best for: ...' : ''}
${widget.products.length > 2 ? '- **${widget.products[2].name}** is best for: ...' : ''}

## 💡 Key Decision Factors
- If you prioritize camera: choose...
- If you prioritize performance: choose...
- If you prioritize battery: choose...
- If you prioritize value: choose...

## ⚠️ Things to Watch Out For
- Potential downsides of each product

## 🎯 Final Verdict
Clear, actionable recommendation.''',
      );
      if (mounted) {
        setState(() {
          _advisorResult = result.isNotEmpty ? result : 'Unable to generate advice.';
          _advisorLoading = false;
        });
        _saveToSession();
      }
    } catch (_) {
      if (mounted) setState(() {
        _advisorResult = 'Unable to generate advice. Please try again.';
        _advisorLoading = false;
      });
    }
  }

  Future<void> _togglePrediction() async {
    if (_predictionExpanded && _predictionResult != null) {
      setState(() => _predictionExpanded = false);
      return;
    }
    setState(() {
      _predictionExpanded = true;
      if (_predictionResult != null) return;
      _predictionLoading = true;
    });
    if (_predictionResult != null) return;
    try {
      final gemini = ref.read(geminiServiceProvider);
      final lang = Localizations.localeOf(context).languageCode;
      final langName = lang == 'tr' ? 'Turkish' : 'English';
      final productNames = widget.products.map((p) {
        final price = p.prices.isNotEmpty ? p.prices.values.first : 'N/A';
        return '${p.name} (current price: $price)';
      }).join(', ');
      final result = await gemini.groundedQuery(
        '''Analyze price trends for: $productNames. Respond in $langName.

## 📊 Current Price Analysis
For each product, analyze current pricing

## 📉 Price Trend Prediction
- Expected price movement in next 1-3 months
- Best time to buy each product
- Any upcoming sales events or price drops

## 🛒 Buying Timing Advice
- Buy now vs wait recommendation for each product
- Which product offers the best value RIGHT NOW

## 💰 Value Comparison
- Price-to-performance ratio comparison
- Hidden costs to consider (accessories, subscriptions)''',
      );
      if (mounted) {
        setState(() {
          _predictionResult = result.isNotEmpty ? result : 'Unable to predict prices.';
          _predictionLoading = false;
        });
        _saveToSession();
      }
    } catch (_) {
      if (mounted) setState(() {
        _predictionResult = 'Unable to predict prices. Please try again.';
        _predictionLoading = false;
      });
    }
  }

  /// Merge spec groups from all products into a unified structure.
  /// Returns: { groupName: { specKey: [val1, val2, ...] } }
  Map<String, Map<String, List<String>>> _buildGroupedSpecs() {
    final result = <String, Map<String, List<String>>>{};
    final productCount = widget.products.length;

    // Use specSections when available, fallback to specs
    Map<String, dynamic> displaySpecs(product) =>
        product.specSections.isNotEmpty ? product.specSections : product.specs;

    // Collect all group names from all products
    final allGroupNames = <String>{};
    for (final product in widget.products) {
      for (final entry in displaySpecs(product).entries) {
        if (entry.value is Map && (entry.value as Map).isNotEmpty) {
          allGroupNames.add(entry.key);
        }
      }
    }

    // Sort groups by priority (matching epey.com spec ordering)
    const specGroupPriority = [
      'basic information',
      'design',
      'display',
      'basic hardware',
      'processor',
      'hardware',
      'memory',
      'storage',
      'camera',
      'battery',
      'network connections',
      'wireless connections',
      'operating system',
      'multimedia',
      'features',
      'sensors',
      'other connections',
      'other',
    ];
    final sortedGroupNames = allGroupNames.toList();
    sortedGroupNames.sort((a, b) {
      final aLower = a.toLowerCase();
      final bLower = b.toLowerCase();
      int aIdx = specGroupPriority.indexWhere((p) => aLower.contains(p));
      int bIdx = specGroupPriority.indexWhere((p) => bLower.contains(p));
      if (aIdx == -1) aIdx = 900;
      if (bIdx == -1) bIdx = 900;
      return aIdx.compareTo(bIdx);
    });

    // For each group (in priority order), collect all spec keys and values per product
    for (final groupName in sortedGroupNames) {
      final allKeys = <String>{};
      // Gather all spec keys in this group across all products
      for (final product in widget.products) {
        final group = displaySpecs(product)[groupName];
        if (group is Map) {
          for (final entry in group.entries) {
            if (entry.value is Map) {
              // Nested sub-group: flatten
              for (final subKey in (entry.value as Map).keys) {
                allKeys.add(subKey.toString());
              }
            } else {
              allKeys.add(entry.key.toString());
            }
          }
        }
      }

      if (allKeys.isEmpty) continue;
      final groupSpecs = <String, List<String>>{};

      for (final specKey in allKeys) {
        final values = <String>[];
        for (final product in widget.products) {
          final group = displaySpecs(product)[groupName];
          String val = '—';
          if (group is Map) {
            if (group.containsKey(specKey)) {
              final v = group[specKey];
              val = (v != null && v.toString().isNotEmpty && v.toString() != 'null' && v.toString() != '?')
                  ? v.toString()
                  : '—';
            } else {
              // Check in nested sub-groups
              for (final entry in group.entries) {
                if (entry.value is Map && (entry.value as Map).containsKey(specKey)) {
                  final v = (entry.value as Map)[specKey];
                  val = (v != null && v.toString().isNotEmpty && v.toString() != 'null' && v.toString() != '?')
                      ? v.toString()
                      : '—';
                  break;
                }
              }
            }
          }
          values.add(val);
        }
        // Only add if at least one product has a value
        if (values.any((v) => v != '—')) {
          groupSpecs[specKey] = values;
        }
      }

      if (groupSpecs.isNotEmpty) {
        result[groupName] = groupSpecs;
      }
    }

    // Handle flat (ungrouped) specs
    final flatSpecs = <String, List<String>>{};
    for (final product in widget.products) {
      for (final entry in displaySpecs(product).entries) {
        if (entry.value is! Map) {
          flatSpecs.putIfAbsent(entry.key, () => List.filled(productCount, '—'));
        }
      }
    }
    for (int i = 0; i < productCount; i++) {
      for (final entry in displaySpecs(widget.products[i]).entries) {
        if (entry.value is! Map && flatSpecs.containsKey(entry.key)) {
          final v = entry.value;
          flatSpecs[entry.key]![i] = (v != null && v.toString().isNotEmpty && v.toString() != 'null')
              ? v.toString()
              : '—';
        }
      }
    }
    if (flatSpecs.isNotEmpty) {
      result['Other'] = flatSpecs;
    }

    return result;
  }

  String _formatKey(String key) {
    return key.replaceAll('_', ' ').split(' ').map((w) => w.isNotEmpty ? w[0].toUpperCase() + w.substring(1) : '').join(' ');
  }

  String _localizedGroupName(BuildContext context, String key) {
    final l = context.l10n;
    if (l == null) return _formatKey(key);
    final k = key.toLowerCase().replaceAll('_', ' ').trim();
    final map = <String, String>{
      'general features': l.specGroupGeneral,
      'general': l.specGroupGeneral,
      'general information': l.specGroupGeneral,
      'basic features': l.specGroupGeneral,
      'basic information': l.specGroupGeneral,
      'design & dimensions': l.specGroupDesign,
      'design': l.specGroupDesign,
      'dimensions': l.specGroupDesign,
      'dimensions & weight': l.specGroupDimensionsWeight,
      'basic hardware': l.specGroupHardware,
      'hardware': l.specGroupHardware,
      'camera': l.specGroupCamera,
      'battery': l.specGroupBattery,
      'network connections': l.specGroupNetwork,
      'network': l.specGroupNetwork,
      'display': l.specGroupDisplay,
      'display/audio': l.specGroupDisplayAudio,
      'storage': l.specGroupStorage,
      'storage features': l.specGroupStorage,
      'storage & optical drive': l.specGroupStorageOptical,
      'connectivity': l.specGroupConnectivity,
      'software': l.specGroupSoftware,
      'operating system': l.specGroupSoftware,
      'audio': l.specGroupAudio,
      'audio features': l.specGroupAudio,
      'sound': l.specGroupAudio,
      'security': l.specGroupSecurity,
      'performance': l.specGroupPerformance,
      'sensors': l.specGroupSensors,
      'sensor': l.specGroupSensors,
      'features': l.specGroupFeatures,
      'main features': l.specGroupMainFeatures,
      'processor': l.specGroupProcessor,
      'memory': l.specGroupMemory,
      'memory features': l.specGroupMemory,
      'memory (ram) features': l.specGroupMemory,
      'ports & interfaces': l.specGroupPorts,
      'ports': l.specGroupPorts,
      'graphics card': l.specGroupGpu,
      'gpu': l.specGroupGpu,
      'keyboard': l.specGroupKeyboard,
      'other': l.specGroupOther,
      'other information': l.specGroupOtherInfo,
      'weight & dimensions': l.specGroupWeight,
      'weight': l.specGroupWeight,
      'screen': l.specGroupScreen,
      'video': l.specGroupVideo,
      'image': l.specGroupImage,
      'charging': l.specGroupCharging,
      'wireless': l.specGroupWireless,
      'wireless connections': l.specGroupWireless,
      'connections': l.specGroupConnections,
      'connection & interface': l.specGroupConnectionInterface,
      'connections & interfaces': l.specGroupConnectionInterface,
      'body': l.specGroupBody,
      'multimedia': l.specGroupMultimedia,
      'multimedia features': l.specGroupMultimedia,
      'power': l.specGroupPower,
      'power and connections': l.specGroupPowerConnections,
      'input/output': l.specGroupInputOutput,
      'input / output': l.specGroupInputOutput,
      'communications': l.specGroupCommunications,
      'expansion': l.specGroupExpansion,
      'expansion slots': l.specGroupExpansion,
      'optics': l.specGroupOptics,
      'lens': l.specGroupOptics,
      'durability': l.specGroupDurability,
      'physical durability': l.specGroupDurability,
      'recording': l.specGroupRecording,
      'focus': l.specGroupFocus,
      'autofocus': l.specGroupFocus,
      'flash': l.specGroupFlash,
      'exposure': l.specGroupExposureShooting,
      'exposure & shooting': l.specGroupExposureShooting,
      'energy and design': l.specGroupEnergyDesign,
      'hardware/software': l.specGroupHardwareSoftware,
      'receivers': l.specGroupReceivers,
      'cooling features': l.specGroupCooling,
      'technological infrastructure': l.specGroupTechInfra,
      'technical information': l.specGroupTechnical,
      'rear connections': l.specGroupRearConnections,
      'other connections': l.specGroupOtherConnections,
      // Additional Firestore groups
      'connections and slots': l.specGroupConnectionsSlots,
      'design and dimensions': l.specGroupDesign,
      'design & function': l.specGroupDesignFunction,
      'document & other': l.specGroupDocOther,
      'fan features': l.specGroupFan,
      'hardware/software features': l.specGroupHardwareSoftware,
      'image/sound features': l.specGroupImageSound,
      'memory & storage': l.specGroupMemoryStorage,
      'pump features': l.specGroupPump,
      'power and storage features': l.specGroupPowerStorage,
      'video and lens': l.specGroupVideoLens,
      'documentation': l.specGroupDocumentation,
    };
    final groupExact = map[k];
    if (groupExact != null) return groupExact;
    final locale = Localizations.localeOf(context).languageCode;
    if (locale != 'en') {
      final translated = spec_dict.translateSpec(key, locale);
      if (translated.toLowerCase() != k) return translated;
    }
    return _formatKey(key);
  }

  String _localizedSpecName(BuildContext context, String key) {
    final l = context.l10n;
    if (l == null) return _formatKey(key);
    final k = key.toLowerCase().replaceAll('_', ' ').trim();
    final map = <String, String>{
      'screen resolution': l.specResolution,
      'screen aspect ratio': l.specResolution,
      'display size': l.specDisplaySize,
      'screen size': l.specScreenSize,
      'display type': l.specDisplayType,
      'screen technology': l.specScreenTechnology,
      'weight': l.specWeight,
      'height': l.specHeight,
      'width': l.specWidth,
      'depth': l.specThickness,
      'thickness': l.specThickness,
      'dimensions': l.specDimensions,
      'processor': l.specProcessor,
      'processor speed': l.specClockSpeed,
      'processor type': l.specProcessor,
      'cpu': l.specCpu,
      'ram': l.specRam,
      'ram capacity': l.specRam,
      'ram type': l.specMemoryType,
      'memory type': l.specMemoryType,
      'memory speed': l.specMemorySpeed,
      'memory bus': l.specMemoryBus,
      'internal storage': l.specInternalStorage,
      'storage': l.specStorage,
      'storage capacity': l.specStorage,
      'storage type': l.specStorageType,
      'expandable storage': l.specExpandableStorage,
      'battery capacity': l.specBatteryCapacity,
      'battery life': l.specBatteryLife,
      'charging speed': l.specChargingSpeed,
      'operating system': l.specOperatingSystem,
      'os': l.specOs,
      'bluetooth': l.specBluetooth,
      'wifi': l.specWifi,
      'wi-fi': l.specWifi,
      'nfc': l.specNfc,
      'usb': l.specUsb,
      'usb type': l.specUsb,
      'hdmi': l.specPorts,
      'color': l.specColor,
      'colors': l.specColors,
      'material': l.specFormFactor,
      'refresh rate': l.specRefreshRate,
      'panel type': l.specPanelType,
      'brightness': l.specBrightness,
      'contrast ratio': l.specContrastRatio,
      'resolution': l.specResolution,
      'max resolution': l.specMaxResolution,
      'camera': l.specMainCamera,
      'front camera': l.specFrontCamera,
      'rear camera': l.specRearCamera,
      'main camera': l.specMainCamera,
      'video resolution': l.specVideoRecording,
      'video recording': l.specVideoRecording,
      'sim card': l.specSim,
      'sim': l.specSim,
      'sim type': l.specSim,
      'dual sim': l.specDualSim,
      'fingerprint': l.specFingerprintSensor,
      'fingerprint sensor': l.specFingerprintSensor,
      'face recognition': l.specFaceRecognition,
      'water resistance': l.specWaterResistance,
      'ip rating': l.specIpRating,
      'wireless charging': l.specWirelessCharging,
      'fast charging': l.specChargingSpeed,
      'displayport': l.specPorts,
      'number of cores': l.specCores,
      'cores': l.specCores,
      'core count': l.specCores,
      'threads': l.specThreads,
      'thread count': l.specThreads,
      'base clock': l.specBaseClock,
      'boost clock': l.specBoostClock,
      'tdp': l.specTdp,
      'cache': l.specCache,
      'architecture': l.specArchitecture,
      'process': l.specProcess,
      'vram': l.specVram,
      'clock speed': l.specClockSpeed,
      'cuda cores': l.specCudaCores,
      'stream processors': l.specStreamProcessors,
      'power supply': l.specPowerSupply,
      'wattage': l.specPowerSupply,
      'noise level': l.specNoiseLevel,
      'response time': l.specResponseTime,
      'hdr': l.specHdr,
      'color gamut': l.specColorGamut,
      'speaker': l.specSpeaker,
      'microphone': l.specMicrophone,
      'microphone type': l.specMicrophoneType,
      'headphone jack': l.specHeadphoneJack,
      'driver size': l.specDriverSize,
      'impedance': l.specImpedance,
      'frequency response': l.specFrequencyResponse,
      'active noise cancellation': l.specActiveNoiseCancellation,
      'wireless range': l.specWirelessRange,
      'connectivity': l.specConnectivity,
      'connection type': l.specConnectionType,
      'warranty': l.specWarranty,
      'model': l.specModel,
      'brand': l.specBrand,
      'series': l.specSeries,
      'release date': l.specReleaseDate,
      'year': l.specYear,
      'release year': l.specYear,
      'gpu': l.specGpu,
      'graphics': l.specGraphics,
      'touchscreen': l.specTouchscreen,
      'keyboard': l.specKeyboard,
      'trackpad': l.specTrackpad,
      'webcam': l.specWebcam,
      'sensor': l.specSensor,
      'smart assistant': l.specSmartAssistant,
      'gps': l.specGps,
      'accelerometer': l.specAccelerometer,
      'gyroscope': l.specGyroscope,
      'barometer': l.specBarometer,
      'compass': l.specCompass,
      'proximity': l.specProximity,
      'network': l.specNetwork,
      'band': l.specBand,
      'form factor': l.specFormFactor,
      'ports': l.specPorts,
      'wireless': l.specWireless,
    };
    final specExact = map[k];
    if (specExact != null) return specExact;
    final locale = Localizations.localeOf(context).languageCode;
    if (locale != 'en') {
      final translated = spec_dict.translateSpec(key, locale);
      if (translated.toLowerCase() != k) return translated;
    }
    return _formatKey(key);
  }

  /// Translate spec values (colors, materials, booleans, etc.)
  String _localizedSpecValue(BuildContext context, String val) {
    if (val.isEmpty || val == '—') return val;
    final locale = Localizations.localeOf(context).languageCode;
    if (locale == 'en') return val;
    // Boolean/status shortcuts
    final lower = val.trim().toLowerCase();
    final l = context.l10n;
    if (l != null) {
      if (lower == 'yes' || lower == 'true') return l.specValYes;
      if (lower == 'no' || lower == 'no.' || lower == 'false') return l.specValNo;
      if (lower == 'available') return l.specValAvailable;
      if (lower == 'not available' || lower == 'n/a') return l.specValNotAvailable;
    }
    final translated = spec_dict.translateSpec(val, locale);
    if (translated != val) return translated;
    return val;
  }


  /// Returns the index of the "better" value for a given spec.
  /// Uses SpecDirectionService (with component rankings + Firestore overrides).
  /// -1 if values are equal or undecidable.
  int _findBetterIndex(String key, List<String> values) {
    final serviceAsync = ref.read(specDirectionServiceProvider);
    final service = serviceAsync.valueOrNull;
    if (service != null) {
      return service.findBetterIndex(key, values);
    }
    // Fallback while service loads: basic boolean check only
    if (values.length < 2 || values.any((v) => v == '—')) return -1;
    final lowers = values.map((v) => v.toLowerCase()).toList();
    final allBool = lowers.every((v) => v.contains('yes') || v.contains('no') || v.startsWith('✓') || v.startsWith('✗'));
    if (allBool) {
      final idx = lowers.indexWhere((v) => v.contains('yes') || v.startsWith('✓'));
      final hasNo = lowers.any((v) => v.contains('no') || v.startsWith('✗'));
      if (idx >= 0 && hasNo) return idx;
    }
    return -1;
  }

  Widget _buildAiAnalysisCard() {
    final hasStructured = _aiStructured != null;
    return Container(
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: AppTheme.brandBlue.withValues(alpha: 0.18)),
        boxShadow: [
          BoxShadow(color: AppTheme.brandBlue.withValues(alpha: 0.1), blurRadius: 16, offset: const Offset(0, 4)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          InkWell(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
            onTap: () => setState(() => _aiExpanded = !_aiExpanded),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [
                  AppTheme.brandBlue.withValues(alpha: 0.11),
                  AppTheme.brandDeepBlue.withValues(alpha: 0.08),
                ]),
                borderRadius: _aiExpanded
                    ? const BorderRadius.vertical(top: Radius.circular(22))
                    : BorderRadius.circular(22),
              ),
              child: Row(children: [
                Container(
                  width: 32, height: 32,
                  decoration: const BoxDecoration(gradient: _accentGradient, shape: BoxShape.circle),
                  child: const Icon(Icons.auto_awesome, size: 16, color: Colors.white),
                ),
                const SizedBox(width: 12),
                Expanded(child: Text(
                  context.l10n?.aiAnalysis ?? 'AI Analysis',
                  style: GoogleFonts.plusJakartaSans(fontSize: 15, fontWeight: FontWeight.w700, color: context.textPrimary),
                )),
                if (hasStructured && _aiStructured!['winner'] != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppTheme.scoreExcellent.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(8)),
                    child: Text('🏆 ${_aiStructured!['winner']}',
                        style: GoogleFonts.plusJakartaSans(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.scoreExcellent)),
                  ),
                const SizedBox(width: 8),
                if (_aiLoading)
                  const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.brandBlue))
                else
                  AnimatedRotation(
                    turns: _aiExpanded ? 0.5 : 0, duration: const Duration(milliseconds: 200),
                    child: Icon(Icons.expand_more, size: 22, color: context.textTertiaryColor)),
              ]),
            ),
          ),
          // Structured content
          if (_aiExpanded && hasStructured) ...[
            // Per-product compatibility scores
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Column(
                children: (_aiStructured!['products'] as Map<String, dynamic>? ?? {}).entries.map((e) {
                  final data = e.value as Map<String, dynamic>? ?? {};
                  final score = (data['compatibility_score'] as num?)?.toDouble() ?? 0;
                  final strengths = List<String>.from(data['strengths'] ?? []);
                  final weaknesses = List<String>.from(data['weaknesses'] ?? []);
                  final bestFor = data['best_for'] as String? ?? '';
                  return Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: context.surfaceElevatedColor,
                      borderRadius: BorderRadius.circular(14)),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Expanded(child: Text(e.key, style: GoogleFonts.plusJakartaSans(
                            fontSize: 14, fontWeight: FontWeight.w700, color: context.textPrimary))),
                        Container(
                          width: 48, height: 48,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(colors: [
                              _aiScoreColor(score).withValues(alpha: 0.7), _aiScoreColor(score)])),
                          child: Center(child: Text('${score.toInt()}%',
                              style: GoogleFonts.plusJakartaSans(fontSize: 13, fontWeight: FontWeight.w900, color: Colors.white))),
                        ),
                      ]),
                      if (bestFor.isNotEmpty) ...[
                        const SizedBox(height: 6),
                        Text('🎯 $bestFor', style: GoogleFonts.plusJakartaSans(
                            fontSize: 12, color: context.textSecondary, fontStyle: FontStyle.italic)),
                      ],
                      if (strengths.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        ...strengths.take(3).map((s) => Padding(
                          padding: const EdgeInsets.only(bottom: 3),
                          child: Row(children: [
                            const Text('✅ ', style: TextStyle(fontSize: 11)),
                            Expanded(child: Text(s, style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textSecondary))),
                          ]),
                        )),
                      ],
                      if (weaknesses.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        ...weaknesses.take(2).map((w) => Padding(
                          padding: const EdgeInsets.only(bottom: 3),
                          child: Row(children: [
                            const Text('⚠️ ', style: TextStyle(fontSize: 11)),
                            Expanded(child: Text(w, style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textTertiaryColor))),
                          ]),
                        )),
                      ],
                    ]),
                  );
                }).toList(),
              ),
            ),
            // Factor comparison bars
            if ((_aiStructured!['factors'] as Map<String, dynamic>?)?.isNotEmpty == true)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: context.surfaceElevatedColor,
                    borderRadius: BorderRadius.circular(14)),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Factor Comparison', style: GoogleFonts.plusJakartaSans(
                          fontSize: 13, fontWeight: FontWeight.w700, color: context.textPrimary)),
                      const SizedBox(height: 10),
                      ...(_aiStructured!['factors'] as Map<String, dynamic>).entries.map((factor) {
                        final fData = factor.value as Map<String, dynamic>? ?? {};
                        final scores = (fData['scores'] as Map<String, dynamic>?) ?? {};
                        final label = factor.key.replaceAll('_', ' ').split(' ')
                            .map((w) => w.isNotEmpty ? '${w[0].toUpperCase()}${w.substring(1)}' : '').join(' ');
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(label, style: GoogleFonts.plusJakartaSans(
                                fontSize: 11, fontWeight: FontWeight.w500, color: context.textTertiaryColor)),
                            const SizedBox(height: 4),
                            ...scores.entries.map((s) {
                              final val = (s.value as num?)?.toDouble() ?? 0;
                              return Padding(
                                padding: const EdgeInsets.only(bottom: 3),
                                child: Row(children: [
                                  SizedBox(width: 70, child: Text(s.key.split(' ').last,
                                      style: GoogleFonts.plusJakartaSans(fontSize: 10, color: context.textTertiaryColor),
                                      maxLines: 1, overflow: TextOverflow.ellipsis)),
                                  Expanded(child: ClipRRect(
                                    borderRadius: BorderRadius.circular(3),
                                    child: LinearProgressIndicator(
                                        value: val / 100, minHeight: 6,
                                        backgroundColor: context.surfaceVariantColor,
                                        color: _aiScoreColor(val)))),
                                  const SizedBox(width: 6),
                                  SizedBox(width: 26, child: Text('${val.toInt()}',
                                      textAlign: TextAlign.right,
                                      style: GoogleFonts.plusJakartaSans(fontSize: 10, fontWeight: FontWeight.w700, color: _aiScoreColor(val)))),
                                ]),
                              );
                            }),
                          ]),
                        );
                      }),
                    ],
                  ),
                ),
              ),
            // Recommendation
            if (_aiStructured!['recommendation'] != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: [
                      AppTheme.brandBlue.withValues(alpha: 0.08),
                      AppTheme.brandSkyBlue.withValues(alpha: 0.06)]),
                    borderRadius: BorderRadius.circular(12)),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('💡', style: TextStyle(fontSize: 16)),
                    const SizedBox(width: 8),
                    Expanded(child: Text(_aiStructured!['recommendation'] as String,
                        style: GoogleFonts.plusJakartaSans(fontSize: 13, height: 1.5, color: context.textPrimary))),
                  ]),
                ),
              ),
          ],
          // Fallback: formatted text (strip code fences and format)
          if (_aiExpanded && !hasStructured && _aiAnalysis != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: _FormattedAiText(text: _aiAnalysis!),
            ),
          if (_aiExpanded && _aiAnalysis == null && !_aiLoading)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _loadAiAnalysis,
                  icon: const Icon(Icons.auto_awesome, size: 18),
                  label: Text('Load AI Analysis',
                    style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.brandBlue,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                ),
              ),
            ),
        ],
      ),
    ).animate().fadeIn(delay: 300.ms, duration: 400.ms);
  }

  Color _aiScoreColor(double score) {
    if (score >= 80) return AppTheme.scoreExcellent;
    if (score >= 60) return AppTheme.scoreAverage;
    if (score >= 40) return AppTheme.orange500;
    return AppTheme.error;
  }

  // ─── Visual Builders ───

  Widget _buildProductColumn(ProductEntity product) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final imgSize = (constraints.maxWidth * 0.7).clamp(60.0, 120.0);
        return Column(
          children: [
            SizedBox(
              width: imgSize,
              height: imgSize,
              child: Container(
                decoration: BoxDecoration(
                  color: context.surfaceColor,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: ProductImageBox(
                  imageUrl: product.imageUrl,
                  height: imgSize - 4,
                  borderRadius: BorderRadius.circular(16),
                  padding: const EdgeInsets.all(8),
                ),
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: 36,
              child: Text(
                product.name,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: context.textPrimary,
                ),
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (product.brand != null)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  product.brand!,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: context.textTertiaryColor,
                  ),
                ),
              ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(specDirectionServiceProvider);

    return DefaultTabController(
      length: 4,
      child: NestedScrollView(
        headerSliverBuilder: (context, innerBoxIsScrolled) => [
          // Product header with frosted glass background
          SliverToBoxAdapter(
            child: Container(
              margin: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: context.surfaceColor,
                borderRadius: BorderRadius.circular(24),
                border: Border.all(
                  color: AppTheme.brandBlue.withValues(alpha: 0.12),
                ),
                boxShadow: [
                  BoxShadow(
                    color: AppTheme.brandBlue.withValues(alpha: 0.08),
                    blurRadius: 16,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: widget.products.length == 2
                ? Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: _buildProductColumn(widget.products[0])),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 24),
                        child: Container(
                          width: 36, height: 36,
                          decoration: BoxDecoration(
                            gradient: _accentGradient,
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: AppTheme.brandBlue.withValues(alpha: 0.3),
                                blurRadius: 10,
                                offset: const Offset(0, 3),
                              ),
                            ],
                          ),
                          child: Center(
                            child: Text(
                              'VS',
                              style: GoogleFonts.plusJakartaSans(
                                color: Colors.white,
                                fontSize: 12,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ),
                        ),
                      ),
                      Expanded(child: _buildProductColumn(widget.products[1])),
                    ],
                  )
                : Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: widget.products.asMap().entries.map((entry) {
                      final idx = entry.key;
                      final product = entry.value;
                      return Expanded(
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(child: _buildProductColumn(product)),
                            if (idx < widget.products.length - 1)
                              Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 24),
                                child: Container(
                                  width: 30, height: 30,
                                  decoration: BoxDecoration(
                                    gradient: _accentGradient,
                                    shape: BoxShape.circle,
                                    boxShadow: [
                                      BoxShadow(
                                        color: AppTheme.brandBlue.withValues(alpha: 0.3),
                                        blurRadius: 8,
                                        offset: const Offset(0, 2),
                                      ),
                                    ],
                                  ),
                                  child: Center(
                                    child: Text(
                                      'VS',
                                      style: GoogleFonts.plusJakartaSans(
                                        color: Colors.white,
                                        fontSize: 10,
                                        fontWeight: FontWeight.w900,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      );
                    }).toList(),
                  ),
          ),
        ),

          // Sticky compact product name chips
          SliverPersistentHeader(
            pinned: true,
            delegate: _ProductChipHeaderDelegate(widget.products),
          ),

          // Pill-style tab bar
          SliverPersistentHeader(
            pinned: true,
            delegate: _TabBarDelegate(
              TabBar(
                labelColor: Colors.white,
                unselectedLabelColor: context.textSecondary,
                indicatorSize: TabBarIndicatorSize.tab,
                dividerColor: Colors.transparent,
                indicator: BoxDecoration(
                  gradient: _accentGradient,
                  borderRadius: BorderRadius.circular(14),
                ),
                splashBorderRadius: BorderRadius.circular(14),
                labelStyle: GoogleFonts.plusJakartaSans(
                    fontSize: 14, fontWeight: FontWeight.w700),
                unselectedLabelStyle: GoogleFonts.plusJakartaSans(
                    fontSize: 14, fontWeight: FontWeight.w500),
                tabs: [
                  Tab(text: context.l10n?.specs ?? 'Specs'),
                  Tab(text: context.l10n?.reviews ?? 'Reviews'),
                  Tab(text: context.l10n?.similarTab ?? 'Similar'),
                  Tab(text: context.l10n?.proTab ?? 'Premium'),
                ],
              ),
            ),
          ),
        ],
        body: TabBarView(
          children: [
            // ─── Specs Tab ────────────────────────────────────────────
            _buildSpecsTab(),
            // ─── Reviews Tab ──────────────────────────────────────────
            _buildReviewsTab(),
            // ─── Similar Tab ──────────────────────────────────────────
            _buildSimilarTab(),
            // ─── PRO (AI Analysis) Tab ────────────────────────────────
            _buildProTab(),
          ],
        ),
      ),
    );
  }

  Widget _buildSpecsTab() {
    int specGroupIndex = 0;
    return CustomScrollView(
      slivers: [
        // Grouped spec comparison
        ..._groupedSpecs.entries.map((groupEntry) {
          final groupName = groupEntry.key;
          final specs = groupEntry.value;
          final isExpanded = _expandedGroups[groupName] ?? false;
          final currentGroupIndex = specGroupIndex++;

          return SliverToBoxAdapter(
            child: Container(
              margin: EdgeInsets.fromLTRB(16, currentGroupIndex == 0 ? 16 : 10, 16, 4),
              decoration: BoxDecoration(
                color: context.surfaceVariantColor,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: isExpanded
                      ? AppTheme.brandBlue.withValues(alpha: 0.18)
                      : context.dividerColor,
                ),
                boxShadow: [
                  BoxShadow(
                    color: AppTheme.brandBlue.withValues(alpha: isExpanded ? 0.06 : 0.02),
                    blurRadius: 16,
                    offset: const Offset(0, 4),
                  ),
                  const BoxShadow(
                    color: Color(0x06000000),
                    blurRadius: 8,
                    offset: Offset(0, 2),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Group header
                  InkWell(
                    onTap: () => setState(() => _expandedGroups[groupName] = !isExpanded),
                    borderRadius: BorderRadius.circular(20),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
                      decoration: BoxDecoration(
                        gradient: isExpanded
                            ? LinearGradient(
                                colors: [
                                  AppTheme.brandBlue.withValues(alpha: 0.1),
                                  AppTheme.brandDeepBlue.withValues(alpha: 0.06),
                                ],
                              )
                            : null,
                        borderRadius: isExpanded
                            ? const BorderRadius.vertical(top: Radius.circular(20))
                            : BorderRadius.circular(20),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 4,
                            height: 24,
                            decoration: BoxDecoration(
                              gradient: _accentGradient,
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.center,
                              children: [
                                Text(
                                  _localizedGroupName(context, groupName),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 15,
                                    color: context.textPrimary,
                                  ),
                                  textAlign: TextAlign.center,
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  context.l10n?.nSpecs('${specs.length}') ?? '${specs.length} specs',
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w500,
                                    color: context.textTertiaryColor,
                                  ),
                                  textAlign: TextAlign.center,
                                ),
                              ],
                            ),
                          ),
                          AnimatedRotation(
                            turns: isExpanded ? 0.5 : 0,
                            duration: const Duration(milliseconds: 200),
                            child: Container(
                              width: 28,
                              height: 28,
                              decoration: BoxDecoration(
                                color: isExpanded
                                    ? AppTheme.brandBlue.withValues(alpha: 0.16)
                                    : context.dividerColor,
                                shape: BoxShape.circle,
                              ),
                              child: Icon(
                                Icons.expand_more,
                                size: 18,
                                color: isExpanded
                                    ? AppTheme.brandBlue
                                    : context.textTertiaryColor,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  // Spec rows
                  if (isExpanded)
                     Padding(
                      padding: const EdgeInsets.fromLTRB(8, 2, 8, 8),
                      child: Column(
                        children: specs.entries.toList().asMap().entries.map((indexedEntry) {
                          final specIndex = indexedEntry.key;
                          final specEntry = indexedEntry.value;
                          final specKey = specEntry.key;
                          final values = specEntry.value;
                          final allSame = values.toSet().length == 1;
                          final betterIndex = allSame ? -1 : _findBetterIndex(specKey, values);
                          final isAlternate = specIndex.isOdd;

                          return Container(
                            margin: const EdgeInsets.symmetric(vertical: 2),
                            padding: const EdgeInsets.fromLTRB(8, 6, 8, 8),
                            decoration: BoxDecoration(
                              color: isAlternate
                                  ? context.surfaceColor
                                  : context.surfaceVariantColor,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(
                                color: context.dividerColor,
                              ),
                            ),
                            child: Column(
                              children: [
                                // Spec name
                                Text(
                                  _localizedSpecName(context, specKey).toUpperCase(),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 10,
                                    letterSpacing: 0.5,
                                    color: context.textTertiaryColor,
                                    fontWeight: FontWeight.w600,
                                  ),
                                  textAlign: TextAlign.center,
                                ),
                                const SizedBox(height: 6),
                                // Values row
                                Row(
                                  children: values.asMap().entries.map((valEntry) {
                                    final idx = valEntry.key;
                                    final val = valEntry.value;
                                    final isMissing = val == '—';
                                    final isBetter = betterIndex == idx;

                                    return Expanded(
                                      child: Container(
                                        margin: const EdgeInsets.symmetric(horizontal: 3),
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                                        decoration: BoxDecoration(
                                          gradient: isBetter
                                              ? LinearGradient(
                                                  colors: [
                                                    AppTheme.brandBlue.withValues(alpha: 0.12),
                                                    AppTheme.brandDeepBlue.withValues(alpha: 0.11),
                                                  ],
                                                )
                                              : null,
                                          color: isBetter ? null : Colors.transparent,
                                          borderRadius: BorderRadius.circular(12),
                                          border: isBetter
                                              ? Border.all(
                                                  color: AppTheme.brandBlue.withValues(alpha: 0.23),
                                                )
                                              : null,
                                        ),
                                        child: isBetter
                                            ? ShaderMask(
                                                shaderCallback: (bounds) =>
                                                    _accentGradient.createShader(bounds),
                                                child: Text(
                                                  _localizedSpecValue(context, val),
                                                  style: GoogleFonts.plusJakartaSans(
                                                    fontSize: 13,
                                                    fontWeight: FontWeight.w700,
                                                    color: Colors.white,
                                                  ),
                                                  textAlign: TextAlign.center,
                                                  maxLines: 3,
                                                  overflow: TextOverflow.ellipsis,
                                                ),
                                              )
                                            : Text(
                                                _localizedSpecValue(context, val),
                                                style: GoogleFonts.plusJakartaSans(
                                                  fontSize: 13,
                                                  fontWeight: isMissing ? FontWeight.w400 : FontWeight.w500,
                                                  color: isMissing
                                                      ? context.textTertiaryColor
                                                      : context.textSecondary,
                                                ),
                                                textAlign: TextAlign.center,
                                                maxLines: 3,
                                                overflow: TextOverflow.ellipsis,
                                              ),
                                      ),
                                    );
                                  }).toList(),
                                ),
                              ],
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                ],
              ),
            ),
          );
        }),

        // Bottom spacer
        SliverToBoxAdapter(
          child: SizedBox(
            height: MediaQuery.of(context).padding.bottom + AppTheme.navBarTotalClearance,
          ),
        ),
      ],
    );
  }

  Widget _buildReviewsTab() {
    return ListView(
      padding: EdgeInsets.fromLTRB(16, 12, 16, MediaQuery.of(context).padding.bottom + AppTheme.navBarTotalClearance + 40),
      children: [
        // YouTube comparison videos (in-app native player using YouTubeService)
        _CompareYouTubeSection(products: widget.products),
        const SizedBox(height: 14),

        // User reviews section
        _buildUserReviewsSection(),
      ],
    );
  }

  Widget _buildSimilarTab() {
    final excludeIds = widget.products.map((p) => p.id).toSet();
    // Also exclude same variant groups to prevent showing same model variants
    final excludeVariantGroups = widget.products
        .where((p) => p.variantGroup.isNotEmpty)
        .map((p) => p.variantGroup)
        .toSet();
    return ListView(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).padding.bottom + AppTheme.navBarTotalClearance),
      children: [
        // Similar products for each compared product
        ...widget.products.map((product) => Padding(
          padding: const EdgeInsets.only(bottom: 20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    color: AppTheme.brandBlue.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.grid_view_rounded, color: AppTheme.brandBlue, size: 18),
                ),
                const SizedBox(width: 10),
                Expanded(child: Text(
                  product.name,
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.plusJakartaSans(fontSize: 13, fontWeight: FontWeight.w700, color: context.textPrimary),
                )),
              ]),
              const SizedBox(height: 8),
              Text(
                context.l10n?.similarProducts ?? 'Similar Products',
                style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textTertiaryColor),
              ),
              const SizedBox(height: 10),
              SizedBox(
                height: 140,
                child: _CompareSuggestedList(
                  category: product.category,
                  excludeIds: excludeIds,
                  excludeVariantGroups: excludeVariantGroups,
                ),
              ),
            ],
          ),
        )),
        // Popular products from different categories
        _CompareDiscoverSection(excludeIds: excludeIds),
      ],
    );
  }

  Widget _buildProTab() {
    return ListView(
      padding: EdgeInsets.fromLTRB(16, 12, 16, MediaQuery.of(context).padding.bottom + AppTheme.navBarTotalClearance),
      children: [
        // User Compatibility Match
        _buildMatchScoreSection(),
        const SizedBox(height: 14),
        // AI Comparison Analysis (review summary)
        _buildAiAnalysisCard(),
        const SizedBox(height: 14),
        // AI Deep Analysis
        _buildExpandableCard(
          icon: Icons.psychology_rounded,
          title: context.l10n?.aiDeepAnalysis ?? 'AI Deep Analysis',
          subtitle: 'Comprehensive AI-powered comparison evaluation',
          gradient: const [AppTheme.brandBlue, AppTheme.brandDeepBlue],
          isExpanded: _deepAnalysisExpanded,
          isLoading: _deepAnalysisLoading,
          content: _deepAnalysisResult,
          onTap: _toggleDeepAnalysis,
        ),
        const SizedBox(height: 14),
        // Smart Alternatives
        _buildExpandableCard(
          icon: Icons.auto_awesome_rounded,
          title: context.l10n?.smartAlternatives ?? 'Smart Alternatives',
          subtitle: 'AI-curated alternatives you should consider',
          gradient: const [AppTheme.brandSkyBlue, AppTheme.orange500],
          isExpanded: _alternativesExpanded,
          isLoading: _alternativesLoading,
          content: _alternativesResult,
          onTap: _toggleAlternatives,
        ),
        const SizedBox(height: 14),
        // AI Product Advisor
        _buildExpandableCard(
          icon: Icons.support_agent_rounded,
          title: 'AI Product Advisor',
          subtitle: 'Personalized buying advice for your comparison',
          gradient: const [AppTheme.scoreAverage, AppTheme.error],
          isExpanded: _advisorExpanded,
          isLoading: _advisorLoading,
          content: _advisorResult,
          onTap: _toggleAdvisor,
        ),
        const SizedBox(height: 14),
        // Price Prediction
        _buildExpandableCard(
          icon: Icons.trending_down_rounded,
          title: 'Price Prediction',
          subtitle: 'AI-powered price trend analysis & best time to buy',
          gradient: const [AppTheme.scoreExcellent, AppTheme.brandBlue],
          isExpanded: _predictionExpanded,
          isLoading: _predictionLoading,
          content: _predictionResult,
          onTap: _togglePrediction,
        ),
        const SizedBox(height: 14),
        // Benchmark comparison
        _CompareBenchmarkSection(products: widget.products),
      ],
    );
  }

  Widget _buildMatchScoreSection() {
    final userProfile = ref.watch(userProfileProvider);
    final user = userProfile.valueOrNull;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: context.dividerColor),
        boxShadow: const [
          BoxShadow(color: Color(0x086366F1), blurRadius: 12, offset: Offset(0, 4)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              width: 38, height: 38,
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [AppTheme.brandSkyBlue, AppTheme.brandDeepBlue]),
                borderRadius: BorderRadius.circular(12)),
              child: const Icon(Icons.person_search_rounded, size: 20, color: Colors.white),
            ),
            const SizedBox(width: 12),
            Expanded(child: Text(
              context.l10n?.personalizedMatch ?? 'Personalized Match',
              style: GoogleFonts.plusJakartaSans(fontSize: 15, fontWeight: FontWeight.w700, color: context.textPrimary),
            )),
          ]),
          const SizedBox(height: 14),
          ...widget.products.map((product) {
            int? matchScore;
            if (user != null) {
              try {
                final algo = ref.read(profileAlgorithmServiceProvider);
                final behavior = ref.watch(behaviorSignalsProvider).valueOrNull ?? BehaviorSignals.empty;
                final fs = algo.calculateTotalFitScore(
                  user: user, product: product, behavior: behavior);
                if (fs > 0) matchScore = fs.toInt();
              } catch (_) {}
            }
            final displayScore = matchScore != null ? '$matchScore%' : '--';
            final matchColor = matchScore == null ? AppTheme.brandDeepBlue :
                matchScore >= 80 ? AppTheme.scoreExcellent :
                matchScore >= 60 ? AppTheme.scoreAverage : AppTheme.error;

            return Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: matchColor.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: matchColor.withValues(alpha: 0.15)),
              ),
              child: Row(children: [
                Container(
                  width: 46, height: 46,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(colors: [matchColor, AppTheme.brandSkyBlue])),
                  child: Center(child: Text(displayScore,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 15, fontWeight: FontWeight.w900, color: Colors.white))),
                ),
                const SizedBox(width: 12),
                Expanded(child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(product.name, style: GoogleFonts.plusJakartaSans(
                      fontSize: 13, fontWeight: FontWeight.w700, color: context.textPrimary),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 2),
                    Text(matchScore != null
                      ? 'Based on your preferences & behavior'
                      : 'Sign in to see your match',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11, color: context.textTertiaryColor)),
                  ],
                )),
              ]),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildExpandableCard({
    required IconData icon,
    required String title,
    required String subtitle,
    required List<Color> gradient,
    required bool isExpanded,
    required bool isLoading,
    required String? content,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: gradient[0].withValues(alpha: 0.15)),
          boxShadow: [BoxShadow(
            color: gradient[0].withValues(alpha: 0.08),
            blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: gradient),
                  borderRadius: BorderRadius.circular(12)),
                child: Icon(icon, color: Colors.white, size: 20)),
              const SizedBox(width: 12),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: GoogleFonts.plusJakartaSans(
                    fontSize: 15, fontWeight: FontWeight.w700, color: context.textPrimary)),
                  const SizedBox(height: 2),
                  Text(subtitle, style: GoogleFonts.plusJakartaSans(
                    fontSize: 12, color: context.textSecondary)),
                ])),
              if (isLoading)
                SizedBox(width: 20, height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2, color: gradient[0]))
              else
                Icon(isExpanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                  color: gradient[0]),
            ]),
            if (isExpanded && content != null) ...[
              const SizedBox(height: 14),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: gradient[0].withValues(alpha: 0.04),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: gradient[0].withValues(alpha: 0.1))),
                child: _FormattedAiText(text: content),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildUserReviewsSection() {
    // Aggregate reviews from all compared products
    final allReviewFutures = widget.products.map(
        (p) => ref.watch(productReviewsProvider(p.id)));

    final allReviews = <ReviewModel>[];
    bool isLoading = false;
    for (final asyncVal in allReviewFutures) {
      asyncVal.when(
        data: (reviews) => allReviews.addAll(reviews),
        loading: () => isLoading = true,
        error: (_, __) {},
      );
    }
    allReviews.sort((a, b) => b.createdAt.compareTo(a.createdAt));

    final avgRating = allReviews.isEmpty ? 0.0
        : allReviews.map((r) => r.rating).reduce((a, b) => a + b) / allReviews.length;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: context.dividerColor),
        boxShadow: [
          BoxShadow(
            color: AppTheme.amber500.withValues(alpha: 0.04),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
          const BoxShadow(color: Color(0x06000000), blurRadius: 8, offset: Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(width: 44, height: 44,
              decoration: BoxDecoration(
                color: AppTheme.amber500.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(14)),
              child: const Icon(Icons.forum_rounded,
                  size: 22, color: AppTheme.amber500)),
            const SizedBox(width: 14),
            Expanded(child: Text(context.l10n?.userReviews ?? 'User Reviews',
                style: GoogleFonts.plusJakartaSans(fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: context.textPrimary))),
            if (allReviews.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppTheme.amber500.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.star_rounded, size: 14, color: AppTheme.amber500),
                  const SizedBox(width: 3),
                  Text(avgRating.toStringAsFixed(1),
                      style: GoogleFonts.plusJakartaSans(fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.amber500)),
                  Text(' (${allReviews.length})',
                      style: GoogleFonts.plusJakartaSans(fontSize: 11,
                          color: context.textTertiaryColor)),
                ]),
              ),
          ]),
          const SizedBox(height: 14),

          // Write review button
          GestureDetector(
            onTap: () => _showWriteReviewSheet(context),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                gradient: _accentGradient,
                borderRadius: BorderRadius.circular(16)),
              child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                const Icon(Icons.edit_note_rounded, size: 18, color: Colors.white),
                const SizedBox(width: 8),
                Text(context.l10n?.writeAReview ?? 'Write a Review',
                    style: GoogleFonts.plusJakartaSans(fontSize: 14,
                        fontWeight: FontWeight.w600, color: Colors.white)),
              ]),
            ),
          ),
          const SizedBox(height: 14),

          if (isLoading)
            const Center(child: Padding(
              padding: EdgeInsets.all(20),
              child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.brandBlue)))
          else if (allReviews.isEmpty)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: context.surfaceVariantColor,
                borderRadius: BorderRadius.circular(12)),
              child: Column(children: [
                Icon(Icons.rate_review_outlined, size: 32, color: context.textTertiaryColor),
                const SizedBox(height: 8),
                Text(context.l10n?.noReviewsYet ?? 'No reviews yet',
                    style: GoogleFonts.plusJakartaSans(fontSize: 14,
                        fontWeight: FontWeight.w600, color: context.textPrimary)),
                const SizedBox(height: 4),
                Text(context.l10n?.beFirstToReview ?? 'Be the first to share your thoughts!',
                    style: GoogleFonts.plusJakartaSans(fontSize: 12,
                        color: context.textTertiaryColor)),
              ]),
            )
          else
            ...allReviews.take(5).map((review) => _buildReviewItem(review)),
        ],
      ),
    );
  }

  Widget _buildReviewItem(ReviewModel review) {
    final rating = review.rating.round().clamp(1, 5);
    final ratingColor = rating >= 4 ? AppTheme.scoreExcellent
        : rating >= 3 ? AppTheme.scoreAverage : AppTheme.error;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            CircleAvatar(
              radius: 14,
              backgroundColor: AppTheme.brandBlue.withValues(alpha: 0.15),
              child: Text(review.userId.substring(0, 1).toUpperCase(),
                  style: GoogleFonts.plusJakartaSans(fontSize: 11,
                      fontWeight: FontWeight.w700, color: AppTheme.brandBlue)),
            ),
            const SizedBox(width: 8),
            // Star rating
            ...List.generate(5, (i) => Icon(
              i < rating ? Icons.star_rounded : Icons.star_outline_rounded,
              size: 14, color: i < rating ? ratingColor : context.textTertiaryColor,
            )),
            const Spacer(),
            Text(_timeAgo(review.createdAt),
                style: GoogleFonts.plusJakartaSans(fontSize: 11,
                    color: context.textTertiaryColor)),
          ]),
          if (review.text.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(review.text,
              maxLines: 4, overflow: TextOverflow.ellipsis,
              style: GoogleFonts.plusJakartaSans(fontSize: 13,
                  height: 1.5, color: context.textSecondary)),
          ],
        ],
      ),
    );
  }

  String _timeAgo(DateTime date) {
    final diff = DateTime.now().difference(date);
    if (diff.inDays > 30) return '${(diff.inDays / 30).floor()}mo ago';
    if (diff.inDays > 0) return '${diff.inDays}d ago';
    if (diff.inHours > 0) return '${diff.inHours}h ago';
    return '${diff.inMinutes}m ago';
  }


  void _showWriteReviewSheet(BuildContext ctx) {
    final user = ref.read(userProfileProvider).valueOrNull;
    if (user == null) {
      ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
        content: Text(context.l10n?.signInToReview ?? 'Please sign in to write a review'),
        behavior: SnackBarBehavior.floating));
      return;
    }

    double selectedRating = 4.0;
    final textController = TextEditingController();

    showModalBottomSheet(
      context: ctx,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetCtx) => StatefulBuilder(
        builder: (sheetCtx, setSheetState) {
          final ratingLabels = ['😞 Poor', '😐 Fair', '🙂 Good', '😊 Very Good', '🤩 Excellent'];
          final ratingColors = [
            AppTheme.error,
            AppTheme.orange500,
            AppTheme.scoreAverage,
            AppTheme.scoreExcellent,
            AppTheme.brandBlue,
          ];
          final starIndex = selectedRating.round().clamp(1, 5) - 1;

          return Container(
            padding: EdgeInsets.fromLTRB(24, 24, 24,
                MediaQuery.of(sheetCtx).viewInsets.bottom + 24),
            decoration: BoxDecoration(
              color: context.surfaceElevatedColor,
              borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(width: 40, height: 4,
                decoration: BoxDecoration(
                  color: context.dividerColor,
                  borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: 16),
              Text(context.l10n?.writeAReview ?? 'Write a Review',
                  style: GoogleFonts.plusJakartaSans(fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: context.textPrimary)),
              const SizedBox(height: 4),
              Text(widget.products.map((p) => p.name).join(' vs '),
                  textAlign: TextAlign.center,
                  maxLines: 2, overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.plusJakartaSans(fontSize: 13,
                      color: context.textTertiaryColor)),
              const SizedBox(height: 20),
              // 5-star rating
              Row(mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(5, (i) {
                  final starVal = (i + 1).toDouble();
                  return GestureDetector(
                    onTap: () => setSheetState(() => selectedRating = starVal),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      child: Icon(
                        i < selectedRating.round() ? Icons.star_rounded : Icons.star_outline_rounded,
                        size: 36,
                        color: i < selectedRating.round() ? ratingColors[starIndex] : context.textTertiaryColor,
                      ),
                    ),
                  );
                }),
              ),
              const SizedBox(height: 8),
              // Rating label
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 200),
                child: Text(
                  ratingLabels[starIndex],
                  key: ValueKey(starIndex),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 14, fontWeight: FontWeight.w600,
                    color: ratingColors[starIndex]),
                ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: textController,
                maxLines: 4, minLines: 2,
                style: GoogleFonts.plusJakartaSans(fontSize: 14, color: context.textPrimary),
                decoration: InputDecoration(
                  hintText: context.l10n?.shareYourExperience ?? 'Share your experience...',
                  hintStyle: GoogleFonts.plusJakartaSans(
                      fontSize: 14, color: context.textTertiaryColor),
                  filled: true,
                  fillColor: context.surfaceVariantColor,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(14),
                    borderSide: BorderSide.none)),
              ),
              const SizedBox(height: 16),
              GestureDetector(
                onTap: () async {
                  HapticFeedback.mediumImpact();
                  final review = ReviewModel(
                    id: DateTime.now().millisecondsSinceEpoch.toString(),
                    userId: user.uid,
                    productId: widget.products.first.id,
                    rating: selectedRating,
                    text: textController.text.trim(),
                    helpful: 0,
                    reported: false,
                    createdAt: DateTime.now(),
                  );
                  final repo = ref.read(productRepositoryProvider);
                  final result = await repo.addReview(review);
                  result.when(
                    success: (_) {
                      ref.invalidate(productReviewsProvider(widget.products.first.id));
                      Navigator.of(sheetCtx).pop();
                      ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
                        content: Text(context.l10n?.reviewSubmitted ?? 'Review submitted! ⭐',
                            style: GoogleFonts.plusJakartaSans(fontSize: 13)),
                        behavior: SnackBarBehavior.floating));
                    },
                    failure: (e) {
                      ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
                        content: Text(context.l10n?.failedToSubmit('$e') ?? 'Failed to submit: $e'),
                        behavior: SnackBarBehavior.floating));
                    },
                  );
                },
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  decoration: BoxDecoration(
                    gradient: _accentGradient,
                    borderRadius: BorderRadius.circular(14)),
                  child: Center(child: Text(context.l10n?.submitReview ?? 'Submit Review',
                      style: GoogleFonts.plusJakartaSans(fontSize: 15,
                          fontWeight: FontWeight.w700, color: Colors.white))),
                ),
              ),
            ]),
          );
        },
      ),
    );
  }

  Widget _buildActionButton(IconData icon, String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
            color: AppTheme.brandBlue.withValues(alpha: 0.23),
          ),
          boxShadow: [
            BoxShadow(
              color: AppTheme.brandBlue.withValues(alpha: 0.11),
              blurRadius: 12,
              offset: const Offset(0, 3),
            ),
            const BoxShadow(color: Color(0x06000000), blurRadius: 6, offset: Offset(0, 2)),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            ShaderMask(
              shaderCallback: (bounds) => _accentGradient.createShader(bounds),
              child: Icon(icon, color: Colors.white, size: 18),
            ),
            const SizedBox(width: 8),
            Text(
              label,
              style: GoogleFonts.plusJakartaSans(
                color: context.textSecondary,
                fontSize: 13,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Tab Bar Delegate ─────────────────────────────────────────────────────────

class _TabBarDelegate extends SliverPersistentHeaderDelegate {
  final TabBar tabBar;
  _TabBarDelegate(this.tabBar);

  @override
  double get minExtent => tabBar.preferredSize.height + 16;
  @override
  double get maxExtent => tabBar.preferredSize.height + 16;

  @override
  Widget build(BuildContext context, double shrinkOffset,
      bool overlapsContent) {
    return Container(
      color: context.backgroundColor,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Container(
        decoration: BoxDecoration(
          color: context.dividerColor,
          borderRadius: BorderRadius.circular(16),
        ),
        child: tabBar,
      ),
    );
  }

  @override
  bool shouldRebuild(_TabBarDelegate oldDelegate) => false;
}

class _ProductChipHeaderDelegate extends SliverPersistentHeaderDelegate {
  final List<ProductEntity> products;
  _ProductChipHeaderDelegate(this.products);

  static const _chipColors = [
    AppTheme.brandBlue,
    AppTheme.scoreAverage,
    AppTheme.premiumPurpleLight,
    AppTheme.scoreExcellent,
  ];

  @override
  double get minExtent => 44;
  @override
  double get maxExtent => 44;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      color: context.backgroundColor,
      height: 44,
      child: Row(
        children: products.asMap().entries.map((entry) {
          final idx = entry.key;
          final product = entry.value;
          final chipColor = _chipColors[idx % 4];
          final name = product.name.length > 12
              ? '${product.name.substring(0, 12)}…'
              : product.name;
          return Expanded(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (idx > 0)
                  Container(
                    width: 1,
                    color: context.dividerColor,
                  ),
                Expanded(
                  child: Container(
                    color: chipColor.withValues(alpha: isDark ? 0.08 : 0.05),
                    alignment: Alignment.center,
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Flexible(
                          child: Text(
                            name,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: chipColor,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (product.techScore > 0) ...[
                          const SizedBox(width: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                            decoration: BoxDecoration(
                              color: chipColor.withValues(alpha: 0.2),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              product.techScore.toInt().toString(),
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: chipColor,
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
        }).toList(),
      ),
    );
  }

  @override
  bool shouldRebuild(_ProductChipHeaderDelegate oldDelegate) =>
      oldDelegate.products != products;
}

// ─── In-App YouTube Comparison Videos (uses YouTubeService) ───

class _CompareYouTubeSection extends ConsumerStatefulWidget {
  final List<ProductEntity> products;
  const _CompareYouTubeSection({required this.products});

  @override
  ConsumerState<_CompareYouTubeSection> createState() => _CompareYouTubeSectionState();
}

class _CompareYouTubeSectionState extends ConsumerState<_CompareYouTubeSection> {
  static final Map<String, List<YouTubeVideo>> _videoCache = {};

  List<YouTubeVideo>? _videos;
  bool _loading = true;
  String? _error;
  bool _didSearch = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_didSearch) {
      _didSearch = true;
      _searchVideos();
    }
  }

  Future<void> _searchVideos() async {
    final ids = widget.products.map((p) => p.id).toList()..sort();
    final cacheKey = ids.join('|');

    if (_videoCache.containsKey(cacheKey)) {
      if (mounted) setState(() { _videos = _videoCache[cacheKey]; _loading = false; });
      return;
    }

    try {
      final youtubeService = ref.read(youtubeServiceProvider);
      final locale = Localizations.localeOf(context).languageCode;
      final names = widget.products.map((p) => p.name).join(' vs ');
      final videos = await youtubeService.searchReviewVideos(
        productName: '$names comparison',
        languageCode: locale,
        maxResults: 3,
      );
      _videoCache[cacheKey] = videos;
      if (mounted) setState(() { _videos = videos; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: context.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              width: 38, height: 38,
              decoration: BoxDecoration(
                color: AppTheme.youtube.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12)),
              child: const Icon(Icons.play_circle_fill, size: 20, color: AppTheme.youtube),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(context.l10n?.youtubeComparisons ?? 'YouTube Comparisons',
                style: GoogleFonts.plusJakartaSans(fontSize: 15, fontWeight: FontWeight.w700, color: context.textPrimary)),
            ),
          ]),
          const SizedBox(height: 14),
          if (_loading)
            const Center(child: Padding(
              padding: EdgeInsets.all(16),
              child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.youtube),
            ))
          else if (_videos == null || _videos!.isEmpty)
            Text(_error != null ? 'Could not load videos' : 'No comparison videos found',
              style: GoogleFonts.plusJakartaSans(fontSize: 13, color: context.textTertiaryColor))
          else
            ...(_videos!.map((video) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _CompareVideoTile(video: video),
            ))),
        ],
      ),
    );
  }
}

class _CompareVideoTile extends StatelessWidget {
  final YouTubeVideo video;
  const _CompareVideoTile({required this.video});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => _openVideo(context),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: context.dividerColor),
        ),
        child: Row(children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Stack(
              alignment: Alignment.center,
              children: [
                Image.network(
                  video.thumbnailUrl.isNotEmpty
                      ? video.thumbnailUrl
                      : 'https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg',
                  width: 120, height: 68, fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    width: 120, height: 68, color: Colors.grey[800],
                    child: const Icon(Icons.play_circle, color: Colors.white54),
                  ),
                ),
                Container(
                  width: 32, height: 32,
                  decoration: const BoxDecoration(
                    color: Colors.black54,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.play_arrow, color: Colors.white, size: 18),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(video.title,
                  style: GoogleFonts.plusJakartaSans(fontSize: 13, fontWeight: FontWeight.w600, color: context.textPrimary),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis),
                if (video.channelTitle.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(video.channelTitle,
                    style: GoogleFonts.plusJakartaSans(fontSize: 11, color: context.textTertiaryColor),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
                if (video.viewCount.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(video.viewCount,
                    style: GoogleFonts.plusJakartaSans(fontSize: 10, color: context.textTertiaryColor)),
                ],
              ],
            ),
          ),
        ]),
      ),
    );
  }

  void _openVideo(BuildContext context) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => _NativeCompareVideoPlayer(videoId: video.videoId, title: video.title),
    ));
  }
}

class _NativeCompareVideoPlayer extends StatefulWidget {
  final String videoId;
  final String title;
  const _NativeCompareVideoPlayer({required this.videoId, required this.title});
  
  @override
  State<_NativeCompareVideoPlayer> createState() => _NativeCompareVideoPlayerState();
}

class _NativeCompareVideoPlayerState extends State<_NativeCompareVideoPlayer> {
  VideoPlayerController? _vpc;
  ChewieController? _chewie;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadVideo();
  }

  Future<void> _loadVideo() async {
    try {
      final yt = YoutubeExplode();
      final manifest = await yt.videos.streamsClient.getManifest(widget.videoId);
      yt.close();
      final muxed = manifest.muxed.sortByVideoQuality();
      if (muxed.isEmpty) {
        if (mounted) setState(() { _error = 'No streams found'; _loading = false; });
        return;
      }
      final streamUrl = muxed.first.url;
      _vpc = VideoPlayerController.networkUrl(streamUrl);
      await _vpc!.initialize();
      _chewie = ChewieController(
        videoPlayerController: _vpc!,
        autoPlay: true,
        allowFullScreen: true,
        allowMuting: true,
      );
      if (mounted) setState(() => _loading = false);
    } catch (e) {
      if (mounted) setState(() { _error = 'Could not load video'; _loading = false; });
    }
  }

  @override
  void dispose() {
    _chewie?.dispose();
    _vpc?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(widget.title, style: const TextStyle(fontSize: 14), maxLines: 1, overflow: TextOverflow.ellipsis),
      ),
      body: _loading
        ? const Center(child: CircularProgressIndicator(color: Colors.red))
        : _error != null
          ? Center(child: Text(_error!, style: const TextStyle(color: Colors.white70)))
          : _chewie != null
            ? Chewie(controller: _chewie!)
            : const SizedBox.shrink(),
    );
  }
}


// ─── Benchmark Comparison Section (numerical table) ───

class _CompareBenchmarkSection extends ConsumerStatefulWidget {
  final List<ProductEntity> products;
  const _CompareBenchmarkSection({required this.products});

  @override
  ConsumerState<_CompareBenchmarkSection> createState() => _CompareBenchmarkSectionState();
}

class _CompareBenchmarkSectionState extends ConsumerState<_CompareBenchmarkSection> {
  // benchmarkName -> {productDisplayName: score}
  final Map<String, Map<String, int>> _scores = {};
  List<String> _benchmarkNames = [];
  String _source = '';
  bool _loading = false;
  bool _loaded = false;
  String? _error;

  @override
  void initState() {
    super.initState();
  }

  Future<void> _fetchScores() async {
    setState(() => _loading = true);
    try {
      final gemini = ref.read(geminiServiceProvider);
      final cat = (widget.products.first.category ?? '').toLowerCase();
      final brand = (widget.products.first.brand ?? '').toLowerCase();
      final isApple = brand.contains('apple');
      final productLabels = widget.products.map((p) => p.name).toList();

      // Category-specific benchmarks
      if (cat.contains('phone') || cat.contains('smartphone')) {
        if (isApple) {
          _benchmarkNames = ['Geekbench Single', 'Geekbench Multi', 'DxOMark'];
          _source = 'geekbench.com, dxomark.com';
        } else {
          _benchmarkNames = ['AnTuTu', 'Geekbench Multi', 'DxOMark'];
          _source = 'antutu.com, geekbench.com, dxomark.com';
        }
      } else if (cat.contains('laptop') || cat.contains('notebook')) {
        _benchmarkNames = ['Cinebench R23', 'PCMark 10', '3DMark'];
        _source = 'cinebench, pcmark, 3dmark';
      } else if (cat.contains('tablet')) {
        _benchmarkNames = ['Geekbench Single', 'Geekbench Multi'];
        _source = 'geekbench.com';
      } else {
        _benchmarkNames = ['Performance Score'];
        _source = 'Various';
      }

      final names = widget.products.map((p) => '${p.brand ?? ''} ${p.name}'.trim()).toList();
      final benchStr = _benchmarkNames.join(', ');

      final prompt = StringBuffer()
        ..writeln('Find REAL benchmark scores for these products:')
        ..writeln(names.map((n) => '- $n').join('\n'))
        ..writeln('')
        ..writeln('Benchmarks: $benchStr')
        ..writeln('')
        ..writeln('Return ONLY lines in format: ProductName|BenchmarkName|NumericScore')
        ..writeln('Example: iPhone 16 Pro|Geekbench Single|3300')
        ..writeln('')
        ..writeln('Only verified scores. Skip if not available.');

      final result = await gemini.groundedQuery(prompt.toString());

      for (final line in result.split('\n')) {
        final parts = line.split('|');
        if (parts.length < 3) continue;
        final pRaw = parts[0].trim();
        final bRaw = parts[1].trim();
        final sStr = parts[2].trim().replaceAll(RegExp(r'[^0-9.]'), '');
        final score = double.tryParse(sStr)?.toInt();
        if (score == null || score <= 0) continue;

        // Fuzzy match benchmark
        final matchedBench = _benchmarkNames.cast<String?>().firstWhere(
          (b) => bRaw.toLowerCase().contains(b!.split(' ').first.toLowerCase()),
          orElse: () => null,
        );
        if (matchedBench == null) continue;

        // Fuzzy match product
        String? matchedLabel;
        for (int i = 0; i < names.length; i++) {
          if (pRaw.toLowerCase().contains(names[i].toLowerCase().split(' ').take(2).join(' ')) ||
              names[i].toLowerCase().contains(pRaw.toLowerCase().split(' ').take(2).join(' '))) {
            matchedLabel = productLabels[i];
            break;
          }
        }
        if (matchedLabel == null) continue;

        _scores.putIfAbsent(matchedBench, () => {});
        _scores[matchedBench]![matchedLabel] = score;
      }

      if (mounted) setState(() { _loading = false; _loaded = true; });
    } catch (e) {
      if (mounted) setState(() { _error = 'Could not load benchmarks'; _loading = false; _loaded = true; });
    }
  }

  String _fmt(int s) {
    if (s >= 1000000) return '${(s / 1000000).toStringAsFixed(1)}M';
    if (s >= 10000) return '${(s / 1000).toStringAsFixed(0)}K';
    if (s >= 1000) return '${(s / 1000).toStringAsFixed(1)}K';
    return s.toString();
  }

  @override
  Widget build(BuildContext context) {
    final labels = widget.products.map((p) => p.name).toList();
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: context.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              width: 38, height: 38,
              decoration: BoxDecoration(
                color: AppTheme.brandBlue.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(12)),
              child: const Icon(Icons.speed_rounded, size: 20, color: AppTheme.brandBlue),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(context.l10n?.benchmarkScores ?? 'Benchmark Scores',
                style: GoogleFonts.plusJakartaSans(fontSize: 15, fontWeight: FontWeight.w700, color: context.textPrimary)),
            ),
          ]),
          const SizedBox(height: 14),
          if (!_loaded && !_loading)
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _fetchScores,
                icon: const Icon(Icons.speed_rounded, size: 18),
                label: Text('Load AI Benchmark Scores',
                  style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.brandBlue,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
              ),
            )
          else if (_loading)
            const Center(child: Padding(
              padding: EdgeInsets.all(16),
              child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.brandBlue),
            ))
          else if (_error != null || _scores.isEmpty)
            Text(_error ?? 'No benchmark data found',
              style: GoogleFonts.plusJakartaSans(fontSize: 13, color: context.textTertiaryColor))
          else ...[
            // Table header
            Row(
              children: [
                Expanded(flex: 3, child: Text('Benchmark',
                  style: GoogleFonts.plusJakartaSans(fontSize: 11, fontWeight: FontWeight.w700, color: context.textSecondary))),
                ...labels.map((l) => Expanded(flex: 2, child: Text(l,
                  style: GoogleFonts.plusJakartaSans(fontSize: 10, fontWeight: FontWeight.w700, color: context.textSecondary),
                  textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis))),
              ],
            ),
            const Divider(height: 16),
            // Table rows
            ..._benchmarkNames.where((b) => _scores.containsKey(b)).map((bench) {
              final scores = _scores[bench]!;
              // Find best score for highlighting
              int bestScore = 0;
              for (final s in scores.values) {
                if (s > bestScore) bestScore = s;
              }
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  children: [
                    Expanded(flex: 3, child: Text(bench,
                      style: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w600, color: context.textPrimary))),
                    ...labels.map((l) {
                      final s = scores[l];
                      final isBest = s != null && s == bestScore && scores.values.where((v) => v == bestScore).length == 1;
                      return Expanded(
                        flex: 2,
                        child: Text(
                          s != null ? _fmt(s) : '—',
                          textAlign: TextAlign.center,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 14,
                            fontWeight: isBest ? FontWeight.w800 : FontWeight.w600,
                            color: isBest ? AppTheme.green500 : context.textPrimary,
                          ),
                        ),
                      );
                    }),
                  ],
                ),
              );
            }),
            const SizedBox(height: 8),
            Text('Source: $_source',
              style: GoogleFonts.plusJakartaSans(fontSize: 9, color: context.textTertiaryColor)),
          ],
        ],
      ),
    );
  }
}

// ─── Bottom Actions: Suggested Products + Reset ───

class _CompareBottomActions extends ConsumerWidget {
  final List<ProductEntity> products;
  final VoidCallback onReset;
  const _CompareBottomActions({required this.products, required this.onReset});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final category = products.first.category.isNotEmpty
        ? products.first.category
        : products.first.subcategory;
    final excludeIds = products.map((p) => p.id).toSet();

    if (category.isEmpty) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.fromLTRB(0, 12, 0, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Suggested similar products header
          Text(context.l10n?.similarProducts ?? 'Similar Products',
            style: GoogleFonts.plusJakartaSans(fontSize: 15, fontWeight: FontWeight.w700, color: context.textPrimary)),
          const SizedBox(height: 4),
          Text('Products in the same category',
            style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textTertiaryColor)),
          const SizedBox(height: 12),

          // Suggested products horizontal list
          SizedBox(
            height: 140,
            child: _SuggestedProductsList(
              category: category,
              excludeIds: excludeIds,
            ),
          ),
        ],
      ),
    );
  }
}

class _SuggestedProductsList extends ConsumerWidget {
  final String category;
  final Set<String> excludeIds;
  const _SuggestedProductsList({required this.category, required this.excludeIds});

  List<ProductEntity> _homeFeedFallback(WidgetRef ref) {
    final feed = ref.read(homeFeedProvider).valueOrNull;
    if (feed == null) return [];
    final products = feed.byCategory[category] ?? [];
    return products.where((p) => !excludeIds.contains(p.id)).take(10).toList();
  }

  // Global brands that are well-known and high quality
  static const _globalBrands = {
    'apple', 'samsung', 'sony', 'lg', 'asus', 'acer', 'msi', 'lenovo',
    'hp', 'dell', 'xiaomi', 'honor', 'huawei', 'google', 'microsoft',
    'razer', 'corsair', 'logitech', 'steelseries', 'hyperx', 'nvidia',
    'amd', 'intel', 'gigabyte', 'asrock', 'evga', 'nzxt', 'be quiet',
    'cooler master', 'thermaltake', 'seasonic', 'western digital', 'wd',
    'seagate', 'kingston', 'crucial', 'bose', 'jbl', 'sennheiser',
    'anker', 'oppo', 'realme', 'oneplus', 'nothing', 'motorola',
    'benq', 'viewsonic', 'philips', 'tcl', 'hisense', 'panasonic',
    'canon', 'nikon', 'fujifilm', 'gopro', 'dji', 'marshall',
    'bang & olufsen', 'b&o', 'dyson', 'roborock', 'ecovacs',
    'garmin', 'fitbit', 'amazfit', 'whirlpool', 'bosch',
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final viewedIds = ref.watch(viewedProductsProvider);
    final searches = ref.watch(recentSearchesProvider);
    final productsAsync = ref.watch(productsByCategoryProvider(category));
    return productsAsync.when(
      data: (result) {
        return result.when(
          success: (products) {
            final available = products.where((p) => !excludeIds.contains(p.id)).toList();
            // Prefer global brands, user-aware scoring
            final globalProducts = <ProductEntity>[];
            final otherProducts = <ProductEntity>[];
            for (final p in available) {
              final brand = (p.brand ?? '').toLowerCase().trim();
              if (_globalBrands.contains(brand)) {
                globalProducts.add(p);
              } else {
                otherProducts.add(p);
              }
            }
            // Score and sort by user relevance
            double scoreProduct(ProductEntity p) {
              double score = p.techScore;
              if (viewedIds.contains(p.id)) score += 200;
              final nameLower = p.name.toLowerCase();
              for (final s in searches) {
                if (nameLower.contains(s.toLowerCase())) { score += 100; break; }
              }
              return score;
            }
            globalProducts.sort((a, b) => scoreProduct(b).compareTo(scoreProduct(a)));
            otherProducts.sort((a, b) => scoreProduct(b).compareTo(scoreProduct(a)));
            // Merge: globals first, then fill with others
            final merged = [...globalProducts, ...otherProducts];
            // Brand diversity: max 2 per brand
            final brandCount = <String, int>{};
            final filtered = <ProductEntity>[];
            for (final p in merged) {
              final brand = (p.brand ?? '').toLowerCase().trim();
              if ((brandCount[brand] ?? 0) < 2) {
                filtered.add(p);
                brandCount[brand] = (brandCount[brand] ?? 0) + 1;
              }
              if (filtered.length >= 15) break;
            }
            if (filtered.isEmpty) {
              return Center(child: Text('No suggestions available',
                style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textTertiaryColor)));
            }
            return _buildProductList(context, filtered);
          },
          failure: (_) {
            final fallback = _homeFeedFallback(ref);
            if (fallback.isNotEmpty) {
              return _buildProductList(context, fallback);
            }
            return _buildRetryView(context, ref);
          },
        );
      },
      loading: () => const Center(child: CircularProgressIndicator(strokeWidth: 2)),
      error: (_, __) {
        final fallback = _homeFeedFallback(ref);
        if (fallback.isNotEmpty) {
          return _buildProductList(context, fallback);
        }
        return _buildRetryView(context, ref);
      },
    );
  }

  Widget _buildRetryView(BuildContext context, WidgetRef ref) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Could not load suggestions',
            style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textTertiaryColor)),
          const SizedBox(height: 8),
          GestureDetector(
            onTap: () => ref.invalidate(productsByCategoryProvider(category)),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                color: AppTheme.brandDeepBlue.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text('Retry',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.brandDeepBlue)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProductList(BuildContext context, List<ProductEntity> products) {
    return ListView.builder(
      scrollDirection: Axis.horizontal,
      itemCount: products.length,
      itemBuilder: (context, index) {
        final p = products[index];
        return GestureDetector(
          onTap: () => context.push('/product/${p.id}'),
          child: Container(
            width: 100,
            margin: const EdgeInsets.only(right: 10),
            child: Column(
              children: [
                Container(
                  width: 80, height: 80,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: context.dividerColor),
                  ),
                  child: ProductImageBox(
                    imageUrl: p.imageUrl,
                    width: 76, height: 76,
                    borderRadius: BorderRadius.circular(14),
                    padding: const EdgeInsets.all(6),
                  ),
                ),
                const SizedBox(height: 6),
                Text(p.name,
                  style: GoogleFonts.plusJakartaSans(fontSize: 10, fontWeight: FontWeight.w600, color: context.textPrimary),
                  maxLines: 2, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center),
                Text('${p.techScore.toInt()}',
                  style: GoogleFonts.plusJakartaSans(fontSize: 10, fontWeight: FontWeight.w700, color: AppTheme.brandDeepBlue)),
              ],
            ),
          ),
        );
      },
    );
  }
}

// ═══════════════════════════════════════════════════════════
// SIMILAR TAB — Suggested products per compared item (user-aware)
// ═══════════════════════════════════════════════════════════

class _CompareSuggestedList extends ConsumerWidget {
  final String category;
  final Set<String> excludeIds;
  /// variantGroups to explicitly filter out (same model variants)
  final Set<String> excludeVariantGroups;
  const _CompareSuggestedList({
    required this.category,
    required this.excludeIds,
    this.excludeVariantGroups = const {},
  });

  /// Score a product for the user: viewed > searched > trending > techScore
  double _scoreForUser(ProductEntity p, List<String> viewedIds, List<String> searches) {
    double score = p.techScore;
    if (viewedIds.contains(p.id)) score += 200;
    final nameLower = p.name.toLowerCase();
    for (final s in searches) {
      if (nameLower.contains(s.toLowerCase())) { score += 100; break; }
    }
    return score;
  }

  List<ProductEntity> _rankProducts(
      List<ProductEntity> all, List<String> viewedIds, List<String> searches) {
    final filtered = all
        .where((p) => !excludeIds.contains(p.id))
        .where((p) => !excludeVariantGroups.contains(p.variantGroup))
        .toList();
    // Separate global brands from local/obscure ones
    final globalProducts = <ProductEntity>[];
    final otherProducts = <ProductEntity>[];
    for (final p in filtered) {
      final brand = (p.brand ?? '').toLowerCase().trim();
      if (_SuggestedProductsList._globalBrands.contains(brand)) {
        globalProducts.add(p);
      } else {
        otherProducts.add(p);
      }
    }
    globalProducts.sort((a, b) => _scoreForUser(b, viewedIds, searches)
        .compareTo(_scoreForUser(a, viewedIds, searches)));
    otherProducts.sort((a, b) => _scoreForUser(b, viewedIds, searches)
        .compareTo(_scoreForUser(a, viewedIds, searches)));
    return [...globalProducts, ...otherProducts].take(12).toList();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final viewedIds = ref.watch(viewedProductsProvider);
    final searches = ref.watch(recentSearchesProvider);
    final feed = ref.watch(homeFeedProvider).valueOrNull;
    List<ProductEntity> products = [];

    if (feed != null) {
      final catProducts = feed.byCategory[category] ?? [];
      products = _rankProducts(catProducts, viewedIds, searches);
    }

    if (products.isEmpty) {
      final async = ref.watch(productsByCategoryProvider(category));
      return async.when(
        data: (result) => result.when(
          success: (all) {
            final ranked = _rankProducts(all, viewedIds, searches);
            return ranked.isEmpty
                ? Center(child: Text('No similar products found', style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textTertiaryColor)))
                : _buildList(context, ranked);
          },
          failure: (_) => Center(child: Text('Could not load', style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textTertiaryColor))),
        ),
        loading: () => const Center(child: CircularProgressIndicator(strokeWidth: 2)),
        error: (_, __) => Center(child: Text('Error', style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textTertiaryColor))),
      );
    }

    return _buildList(context, products);
  }

  Widget _buildList(BuildContext context, List<ProductEntity> products) {
    return ListView.separated(
      scrollDirection: Axis.horizontal,
      itemCount: products.length,
      separatorBuilder: (_, __) => const SizedBox(width: 8),
      itemBuilder: (context, i) {
        final p = products[i];
        return GestureDetector(
          onTap: () => context.push('${AppRoutes.productDetail}/${p.id}'),
          child: Container(
            width: 100,
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: context.surfaceVariantColor,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: context.dividerColor),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                ProductImageBox(imageUrl: p.imageUrl, width: 60, height: 60,
                  borderRadius: BorderRadius.circular(8), padding: const EdgeInsets.all(4)),
                const SizedBox(height: 4),
                Text(p.name, maxLines: 2, overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(fontSize: 9, fontWeight: FontWeight.w600, color: context.textPrimary)),
                if (p.techScore > 0) ...[
                  const SizedBox(height: 2),
                  Text('${p.techScore.toInt()}', style: GoogleFonts.plusJakartaSans(
                    fontSize: 9, fontWeight: FontWeight.w700, color: AppTheme.brandDeepBlue)),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}

// ═══════════════════════════════════════════════════════════
// SIMILAR TAB — Discover popular products from other categories
// ═══════════════════════════════════════════════════════════

class _CompareDiscoverSection extends ConsumerWidget {
  final Set<String> excludeIds;
  const _CompareDiscoverSection({required this.excludeIds});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feedAsync = ref.watch(homeFeedProvider);
    final viewedIds = ref.watch(viewedProductsProvider);
    final searches = ref.watch(recentSearchesProvider);
    return feedAsync.when(
      data: (feed) {
        // Collect top-scoring product from each category
        // Boost products the user has viewed or searched
        final discoverProducts = <ProductEntity>[];
        for (final entry in feed.byCategory.entries) {
          final catProducts = entry.value
              .where((p) => !excludeIds.contains(p.id))
              .toList()
            ..sort((a, b) {
              double scoreA = a.techScore + (viewedIds.contains(a.id) ? 200 : 0);
              double scoreB = b.techScore + (viewedIds.contains(b.id) ? 200 : 0);
              for (final s in searches) {
                if (a.name.toLowerCase().contains(s.toLowerCase())) scoreA += 100;
                if (b.name.toLowerCase().contains(s.toLowerCase())) scoreB += 100;
              }
              return scoreB.compareTo(scoreA);
            });
          if (catProducts.isNotEmpty) discoverProducts.add(catProducts.first);
        }
        // Also add trending products
        final trending = feed.trending.where((p) => !excludeIds.contains(p.id)).take(5).toList();
        for (final tp in trending) {
          if (!discoverProducts.any((p) => p.id == tp.id)) discoverProducts.add(tp);
        }
        discoverProducts.sort((a, b) => b.techScore.compareTo(a.techScore));

        if (discoverProducts.isEmpty) return const SizedBox.shrink();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 8),
            Row(children: [
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: AppTheme.brandDeepBlue.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.explore_rounded, color: AppTheme.brandDeepBlue, size: 18),
              ),
              const SizedBox(width: 10),
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(context.l10n?.exploreProducts ?? 'Discover', style: GoogleFonts.plusJakartaSans(fontSize: 14, fontWeight: FontWeight.w700, color: context.textPrimary)),
                Text(context.l10n?.discoverPopular ?? 'Popular products from every category', style: GoogleFonts.plusJakartaSans(fontSize: 11, color: context.textTertiaryColor)),
              ]),
            ]),
            const SizedBox(height: 10),
            SizedBox(
              height: 140,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: discoverProducts.take(10).length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (context, i) {
                  final p = discoverProducts[i];
                  return GestureDetector(
                    onTap: () => context.push('${AppRoutes.productDetail}/${p.id}'),
                    child: Container(
                      width: 100,
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: context.surfaceVariantColor,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: context.dividerColor),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          ProductImageBox(imageUrl: p.imageUrl, width: 60, height: 60,
                            borderRadius: BorderRadius.circular(8), padding: const EdgeInsets.all(4)),
                          const SizedBox(height: 4),
                          Text(p.category.replaceAll('_', ' '), style: GoogleFonts.plusJakartaSans(
                            fontSize: 8, fontWeight: FontWeight.w600, color: AppTheme.brandDeepBlue)),
                          Text(p.name, maxLines: 2, overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.center,
                            style: GoogleFonts.plusJakartaSans(fontSize: 9, fontWeight: FontWeight.w600, color: context.textPrimary)),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}

/// Renders AI text with basic formatting: strips code fences, bolds headers,
/// and applies bullet/numbered list styling.
class _FormattedAiText extends StatelessWidget {
  final String text;
  const _FormattedAiText({required this.text});

  @override
  Widget build(BuildContext context) {
    // Strip markdown code fences and clean up
    var clean = text.trim();
    // Remove code fences: ```json, ```
    clean = clean.replaceAll(RegExp(r'```(?:json)?\s*\n?'), '');
    clean = clean.replaceAll(RegExp(r'\n?```'), '');

    // If text looks like raw JSON (starts with { and contains typical JSON patterns),
    // try to extract readable content
    if (clean.startsWith('{') && clean.contains('"')) {
      try {
        final parsed = jsonDecode(clean) as Map<String, dynamic>;
        return _buildFromJson(context, parsed);
      } catch (_) {
        // Not valid JSON, continue with text formatting
      }
    }

    final lines = clean.split('\n');
    final widgets = <Widget>[];

    for (final rawLine in lines) {
      final line = rawLine.trim();
      if (line.isEmpty) {
        widgets.add(const SizedBox(height: 6));
        continue;
      }

      // Skip JSON-like lines (curly braces, quotes at start)
      if (line.startsWith('{') || line.startsWith('}') ||
          line.startsWith('"') || line.startsWith('[') || line.startsWith(']')) {
        continue;
      }

      // Headers: ## text, # text
      if (line.startsWith('## ')) {
        final headerText = line.substring(3).trim();
        widgets.add(Container(
          margin: const EdgeInsets.only(top: 14, bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [
              AppTheme.brandBlue.withValues(alpha: 0.12),
              AppTheme.brandDeepBlue.withValues(alpha: 0.08),
            ]),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(children: [
            const Icon(Icons.auto_awesome, size: 14, color: AppTheme.brandDeepBlue),
            const SizedBox(width: 6),
            Expanded(child: Text(headerText, style: GoogleFonts.plusJakartaSans(
              fontSize: 14, fontWeight: FontWeight.w700, color: context.textPrimary))),
          ]),
        ));
        continue;
      }

      if (line.startsWith('# ')) {
        final headerText = line.substring(2).trim();
        widgets.add(Padding(
          padding: const EdgeInsets.only(top: 12, bottom: 6),
          child: Text(headerText, style: GoogleFonts.plusJakartaSans(
            fontSize: 15, fontWeight: FontWeight.w800, color: context.textPrimary)),
        ));
        continue;
      }

      // Bold-only line: **Winner: Product X**
      final boldMatch = RegExp(r'^\*\*(.+?)\*\*:?\s*(.*)$').firstMatch(line);
      if (boldMatch != null) {
        widgets.add(Padding(
          padding: const EdgeInsets.only(top: 6, bottom: 2),
          child: RichText(text: TextSpan(children: [
            TextSpan(text: boldMatch.group(1)!, style: GoogleFonts.plusJakartaSans(
              fontSize: 13, fontWeight: FontWeight.w700, color: context.textPrimary)),
            if (boldMatch.group(2)!.isNotEmpty)
              TextSpan(text: ' ${boldMatch.group(2)!}', style: GoogleFonts.plusJakartaSans(
                fontSize: 13, color: context.textSecondary)),
          ])),
        ));
        continue;
      }

      // Bullet lists: - item, * item, • item
      if (RegExp(r'^[\-\*•]\s+').hasMatch(line)) {
        final content = line.replaceFirst(RegExp(r'^[\-\*•]\s+'), '');
        widgets.add(Padding(
          padding: const EdgeInsets.only(left: 8, bottom: 4),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 6, height: 6,
              margin: const EdgeInsets.only(top: 6, right: 8),
              decoration: const BoxDecoration(
                color: AppTheme.brandDeepBlue,
                shape: BoxShape.circle,
              ),
            ),
            Expanded(child: _buildRichLine(context, content)),
          ]),
        ));
        continue;
      }

      // Numbered lists: 1. item, 2) item
      final numMatch = RegExp(r'^(\d+)[.\)]\s+(.*)').firstMatch(line);
      if (numMatch != null) {
        widgets.add(Padding(
          padding: const EdgeInsets.only(left: 8, bottom: 4),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 22, height: 22,
              margin: const EdgeInsets.only(right: 8, top: 1),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [AppTheme.brandBlue, AppTheme.brandDeepBlue]),
                borderRadius: BorderRadius.circular(6)),
              child: Center(child: Text(numMatch.group(1)!, style: GoogleFonts.plusJakartaSans(
                fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white))),
            ),
            Expanded(child: _buildRichLine(context, numMatch.group(2)!)),
          ]),
        ));
        continue;
      }

      // Regular paragraph
      widgets.add(Padding(
        padding: const EdgeInsets.only(bottom: 3),
        child: _buildRichLine(context, line),
      ));
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: widgets);
  }

  /// Build formatted content from parsed JSON
  Widget _buildFromJson(BuildContext context, Map<String, dynamic> data) {
    final widgets = <Widget>[];

    // Winner
    if (data['winner'] != null) {
      widgets.add(Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [AppTheme.scoreExcellent, AppTheme.scoreExcellent]),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(children: [
          const Text('🏆', style: TextStyle(fontSize: 18)),
          const SizedBox(width: 8),
          Expanded(child: Text('Winner: ${data['winner']}',
            style: GoogleFonts.plusJakartaSans(fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white))),
          if (data['winner_score'] != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(8)),
              child: Text('${data['winner_score']}%', style: GoogleFonts.plusJakartaSans(
                fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white)),
            ),
        ]),
      ));
    }

    // Recommendation
    if (data['recommendation'] != null) {
      widgets.add(Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppTheme.brandBlue.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTheme.brandBlue.withValues(alpha: 0.2)),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('💡', style: TextStyle(fontSize: 16)),
          const SizedBox(width: 8),
          Expanded(child: Text(data['recommendation'],
            style: GoogleFonts.plusJakartaSans(fontSize: 13, height: 1.5, color: context.textPrimary))),
        ]),
      ));
    }

    // Verdict
    if (data['verdict'] != null) {
      widgets.add(Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(data['verdict'],
          style: GoogleFonts.plusJakartaSans(fontSize: 13, fontStyle: FontStyle.italic, color: context.textSecondary)),
      ));
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: widgets);
  }

  /// Renders a line with inline **bold** support
  Widget _buildRichLine(BuildContext context, String line) {
    final spans = <TextSpan>[];
    final parts = line.split(RegExp(r'(\*\*[^*]+\*\*)'));
    for (final part in parts) {
      if (part.startsWith('**') && part.endsWith('**')) {
        spans.add(TextSpan(
          text: part.substring(2, part.length - 2),
          style: GoogleFonts.plusJakartaSans(
            fontSize: 13, fontWeight: FontWeight.w700, color: context.textPrimary),
        ));
      } else {
        spans.add(TextSpan(
          text: part,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 13, height: 1.6, color: context.textSecondary),
        ));
      }
    }
    return RichText(text: TextSpan(children: spans));
  }
}
