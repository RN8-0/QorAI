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
import 'package:flutter_markdown/flutter_markdown.dart';

// ── Part files ──
part 'widgets/empty_search_widgets.dart';
part 'widgets/spec_comparison_widget.dart';
part 'widgets/youtube_widgets.dart';
part 'widgets/benchmark_actions_widgets.dart';


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
          if (mounted) {
            final newIds = List<String>.from(_selectedProductIds)..add(productId);
            ref.read(compareSessionProvider.notifier).state = ref.read(compareSessionProvider).copyWith(
              selectedProductIds: newIds,
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
                hintText: context.l10n?.searchCompareHint ?? 'Search products to compare...',
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

