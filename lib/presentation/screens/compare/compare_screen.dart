/// Compair - Compare Screen
/// Direct spec-by-spec comparison of products in the same category.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:video_player/video_player.dart';
import 'package:chewie/chewie.dart';
import 'package:youtube_explode_dart/youtube_explode_dart.dart' as yt_explode;
import 'package:url_launcher/url_launcher.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/core/product_filter.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/domain/entities/product_entity.dart';
import 'package:compair/domain/entities/comparison_entity.dart';
import 'package:compair/domain/entities/user_entity.dart';
import 'package:compair/data/models/other_models.dart';
import 'package:compair/presentation/providers/providers.dart';
import 'package:compair/presentation/widgets/product_image_box.dart';
import 'package:compair/routing/router.dart';
import 'package:compair/core/spec_word_dictionary.dart' as spec_dict;
import 'package:compair/services/youtube_service.dart';
import 'package:compair/services/gemini_service.dart';
import 'package:compair/services/profile_algorithm_service.dart';
import 'package:compair/presentation/widgets/shared/shared_key_specs_grid.dart';
import 'package:compair/presentation/widgets/shared/shared_youtube_card.dart';
import 'package:compair/presentation/widgets/shared/shared_similar_card.dart';
import 'package:compair/presentation/widgets/shared/shared_premium_section.dart';
import 'package:compair/core/category_key_specs.dart' as keySpecs;
import 'package:compair/presentation/widgets/shared/expandable_text.dart';
import 'package:pocketbase/pocketbase.dart';
import 'package:compair/core/pb_client.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:compair/services/spec_translation_service.dart';

// ── Part files ──
part 'widgets/empty_search_widgets.dart';
part 'widgets/spec_comparison_widget.dart';
part 'widgets/youtube_widgets.dart';

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
  const CompareScreen({
    super.key,
    this.initialComparison,
    this.initialMode = 0,
  });

  @override
  ConsumerState<CompareScreen> createState() => _CompareScreenState();
}

class _CompareScreenState extends ConsumerState<CompareScreen> {
  bool _skipNextHistorySave = false;
  List<String> get _selectedProductIds =>
      ref.read(compareSessionProvider).selectedProductIds;
  List<ProductEntity>? get _comparedProducts =>
      ref.read(compareSessionProvider).comparedProducts;
  String? get _lockedCategory =>
      ref.read(compareSessionProvider).lockedCategory;
  String? get _lockedSubcategory =>
      ref.read(compareSessionProvider).lockedSubcategory;
  final TextEditingController _searchController = TextEditingController();
  final FocusNode _searchFocusNode = FocusNode();
  Timer? _debounce;

  String _productSlotLabel(int slotNumber) =>
      context.l10n?.productSlotLabel(slotNumber) ?? 'Product $slotNumber';

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
        _skipNextHistorySave = true;
        ref.read(compareSessionProvider.notifier).state = ref
            .read(compareSessionProvider)
            .copyWith(selectedProductIds: ids);
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
    ref.read(compareSessionProvider.notifier).state = ref
        .read(compareSessionProvider)
        .copyWith(selectedProductIds: globalIds);
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
    if (mounted &&
        _comparedProducts == null &&
        _selectedProductIds.length >= 2) {
      _startComparison();
    }
  }

  @override
  void dispose() {
    // Restore nav bar — read provider before super.dispose() clears ref
    ref.read(hideNavBarProvider.notifier).state = false;
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
            final newIds = List<String>.from(_selectedProductIds)
              ..add(productId);
            ref.read(compareSessionProvider.notifier).state = ref
                .read(compareSessionProvider)
                .copyWith(selectedProductIds: newIds);
            setState(() {});
          }
        },
        failure: (_) {},
      );
    });

    if (!productAsync.hasValue) {
      final newIds = List<String>.from(_selectedProductIds)..add(productId);
      ref.read(compareSessionProvider.notifier).state = ref
          .read(compareSessionProvider)
          .copyWith(selectedProductIds: newIds);
      setState(() {});
    }
  }

  void _removeProduct(String productId) {
    final newIds = List<String>.from(_selectedProductIds)..remove(productId);
    if (newIds.isEmpty) {
      ref.read(compareSessionProvider.notifier).state =
          const CompareSessionData();
    } else {
      ref.read(compareSessionProvider.notifier).state = ref
          .read(compareSessionProvider)
          .copyWith(selectedProductIds: newIds, clearProducts: true);
    }
    setState(() {});
  }

  Future<void> _startComparison() async {
    if (_selectedProductIds.length < 2) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            context.l10n?.selectAtLeast2 ?? 'Select at least 2 products',
          ),
          behavior: SnackBarBehavior.floating,
        ),
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
        SnackBar(
          content: Text(
            context.l10n?.couldNotLoadProduct ?? 'Could not load product data',
          ),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    // Enforce same category
    final categories = products.map((p) => p.category).toSet();
    if (categories.length > 1) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            context.l10n?.mustBeSameCategory ??
                'Products must be from the same category to compare',
          ),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    ref.read(compareSessionProvider.notifier).state = ref
        .read(compareSessionProvider)
        .copyWith(comparedProducts: products);
    setState(() {});

    // Save comparison to Firestore for history
    final shouldPersistHistory = !_skipNextHistorySave;
    _skipNextHistorySave = false;
    final user = ref.read(userProfileProvider).valueOrNull;
    if (shouldPersistHistory && user != null) {
      final title = products.map((p) => p.name).join(' vs ');
      try {
        await ref
            .read(comparisonRepositoryProvider)
            .saveManualComparison(
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
    ref
        .read(behaviorTrackingProvider)
        .trackComparison(_selectedProductIds.toList());
  }

  void _resetComparison() {
    ref.read(compareSessionProvider.notifier).state =
        const CompareSessionData();
    ref.read(hideNavBarProvider.notifier).state = false;
    setState(() {});
  }

  void _removeProductFromComparison(String productId) {
    final session = ref.read(compareSessionProvider);
    final newIds = List<String>.from(session.selectedProductIds)
      ..remove(productId);
    final newProducts = session.comparedProducts
        ?.where((p) => p.id != productId)
        .toList();
    if (newIds.length < 2) {
      // Not enough products for comparison, reset
      _resetComparison();
      return;
    }
    ref.read(compareSessionProvider.notifier).state = CompareSessionData(
      selectedProductIds: newIds,
      comparedProducts: newProducts,
    );
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
    ref
        .read(behaviorTrackingProvider)
        .trackComparison(_selectedProductIds.toList());
  }

  @override
  Widget build(BuildContext context) {
    // Watch session state for reactivity
    final session = ref.watch(compareSessionProvider);
    final _products = session.comparedProducts;

    // Hide/show nav bar based on comparison state
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final shouldHide = _products != null && _products.length >= 2;
      if (ref.read(hideNavBarProvider) != shouldHide) {
        ref.read(hideNavBarProvider.notifier).state = shouldHide;
      }
    });

    return Scaffold(
      backgroundColor: context.surfaceColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        automaticallyImplyLeading: false,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_rounded, color: context.textPrimary),
          onPressed: () {
            if (GoRouter.of(context).canPop()) {
              context.pop();
              return;
            }
            context.go(AppRoutes.home);
          },
        ),
        title: ShaderMask(
          shaderCallback: (bounds) => _accentGradient.createShader(bounds),
          child: Text(
            widget.initialMode == 1
                ? (context.l10n?.compareSubscriptions ??
                      'Compare Subscriptions')
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
      ),
      body: Column(
        children: [
          // Content
          Expanded(
            child: _products != null
                ? _SpecComparisonView(
                    products: _products,
                    onReset: _resetComparison,
                    onRemoveProduct: _removeProductFromComparison,
                  )
                : _buildSelectionView(),
          ),
        ],
      ),
    );
  }

  Widget _buildSelectionView() {
    final count = _selectedProductIds.length;
    final canCompare = count >= 2;
    final allFilled = count >= 4;
    final isDark = context.isDarkMode;
    final heroDecoration = BoxDecoration(
      gradient: isDark
          ? const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [Color(0xFF0F1724), Color(0xFF141C2E), Color(0xFF0A1020)],
            )
          : LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                context.surfaceColor,
                const Color(0xFFF7FAFF),
                const Color(0xFFEEF5FF),
              ],
            ),
      borderRadius: BorderRadius.circular(24),
      border: Border.all(
        color: AppTheme.brandBlue.withValues(alpha: isDark ? 0.18 : 0.10),
      ),
      boxShadow: [
        BoxShadow(
          color: AppTheme.brandBlue.withValues(alpha: isDark ? 0.22 : 0.08),
          blurRadius: isDark ? 24 : 20,
          offset: const Offset(0, 8),
        ),
        BoxShadow(
          color: AppTheme.brandCyan.withValues(alpha: isDark ? 0.06 : 0.04),
          blurRadius: 40,
          spreadRadius: -4,
        ),
      ],
    );

    return Stack(
      fit: StackFit.expand,
      children: [
        Column(
          children: [
            // ── Premium header card ────────────────────────────────────────────
            Container(
              margin: const EdgeInsets.fromLTRB(14, 4, 14, 0),
              decoration: heroDecoration,
              child: Column(
                children: [
                  // Tagline row
                  Padding(
                    padding: const EdgeInsets.fromLTRB(18, 14, 18, 0),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: isDark
                                  ? const [
                                      AppTheme.brandBlue,
                                      AppTheme.brandDeepBlue,
                                    ]
                                  : [AppTheme.brandBlue, AppTheme.brandSkyBlue],
                            ),
                            border: isDark
                                ? null
                                : Border.all(
                                    color: AppTheme.brandBlue.withValues(
                                      alpha: 0.08,
                                    ),
                                  ),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                Icons.compare_arrows_rounded,
                                color: Colors.white,
                                size: 13,
                              ),
                              const SizedBox(width: 5),
                              Text(
                                count < 2
                                    ? (context.l10n?.selectAtLeast2 ??
                                          'Select at least 2 products')
                                    : (context.l10n?.readyToCompare ??
                                          'Ready to compare!'),
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const Spacer(),
                        Text(
                          '$count / 4',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: count >= 2
                                ? (isDark
                                      ? AppTheme.brandCyan
                                      : AppTheme.brandBlue)
                                : (isDark
                                      ? Colors.white38
                                      : context.textTertiaryColor),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),

                  // Slot row with VS connectors
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 0, 14, 16),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: _buildPremiumSlotWidgets(),
                    ),
                  ),

                  // Compare button — only when ≥ 2 selected
                  if (canCompare)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                      child:
                          GestureDetector(
                                onTap: () {
                                  HapticFeedback.mediumImpact();
                                  _startComparison();
                                },
                                child: Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 13,
                                  ),
                                  decoration: BoxDecoration(
                                    gradient: const LinearGradient(
                                      colors: [
                                        AppTheme.brandBlue,
                                        AppTheme.brandDeepBlue,
                                        AppTheme.brandBlue,
                                      ],
                                      begin: Alignment.topLeft,
                                      end: Alignment.bottomRight,
                                    ),
                                    borderRadius: BorderRadius.circular(14),
                                    boxShadow: [
                                      BoxShadow(
                                        color: AppTheme.brandDeepBlue
                                            .withValues(alpha: 0.45),
                                        blurRadius: 14,
                                        offset: const Offset(0, 5),
                                      ),
                                    ],
                                  ),
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      const Icon(
                                        Icons.compare_arrows_rounded,
                                        color: Colors.white,
                                        size: 18,
                                      ),
                                      const SizedBox(width: 8),
                                      Text(
                                        count > 2
                                            ? (context.l10n?.compareCount(
                                                    count,
                                                  ) ??
                                                  'Compare $count')
                                            : (context.l10n?.compareAction ??
                                                  'Compare'),
                                        style: GoogleFonts.plusJakartaSans(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w800,
                                          color: Colors.white,
                                          letterSpacing: 0.3,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              )
                              .animate()
                              .fadeIn(duration: 220.ms)
                              .scale(begin: const Offset(0.95, 0.95)),
                    ),
                ],
              ),
            ),

            const SizedBox(height: 10),

            // Search bar — hide when all 4 slots filled
            if (!allFilled)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: Container(
                  decoration: BoxDecoration(
                    color: context.surfaceVariantColor,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: context.dividerColor),
                  ),
                  child: TextField(
                    controller: _searchController,
                    focusNode: _searchFocusNode,
                    onChanged: _onSearchChanged,
                    style: TextStyle(color: context.textPrimary, fontSize: 14),
                    decoration: InputDecoration(
                      hintText:
                          context.l10n?.searchCompareHint ??
                          'Search products to compare...',
                      hintStyle: TextStyle(
                        color: context.textTertiaryColor,
                        fontSize: 14,
                      ),
                      prefixIcon: ShaderMask(
                        shaderCallback: (bounds) =>
                            _accentGradient.createShader(bounds),
                        child: const Icon(
                          Icons.search,
                          color: Colors.white,
                          size: 20,
                        ),
                      ),
                      suffixIcon: _searchController.text.isNotEmpty
                          ? IconButton(
                              icon: Icon(
                                Icons.close_rounded,
                                size: 18,
                                color: context.textSecondary,
                              ),
                              onPressed: () {
                                _searchController.clear();
                                _onSearchChanged('');
                              },
                            )
                          : null,
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 14,
                      ),
                    ),
                  ),
                ),
              ),

            const SizedBox(height: 6),

            Expanded(
              child: allFilled
                  ? const SizedBox.shrink()
                  : _ProductSearchList(
                      selectedIds: _selectedProductIds,
                      onSelect: _addProduct,
                      onRemove: _removeProduct,
                    ),
            ),
          ],
        ),
      ],
    );
  }

  /// Premium slot widgets with VS connectors
  List<Widget> _buildPremiumSlotWidgets() {
    final filledCount = _selectedProductIds.length;
    final totalSlots = (filledCount + 1).clamp(2, 4);
    final items = <Widget>[];
    for (int i = 0; i < totalSlots; i++) {
      // VS connector between slots
      if (i > 0) {
        items.add(
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6),
            child: Text(
              'VS',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 10,
                fontWeight: FontWeight.w900,
                color: AppTheme.brandCyan.withValues(alpha: 0.7),
                letterSpacing: 1,
              ),
            ),
          ),
        );
      }
      if (i < filledCount) {
        final productId = _selectedProductIds[i];
        final productAsync = ref.watch(productDetailProvider(productId));
        items.add(
          Expanded(
            child: productAsync.when(
              data: (result) => result.when(
                success: (product) => _buildPremiumFilledSlot(product),
                failure: (_) => _buildPremiumEmptySlot(i + 1),
              ),
              loading: () => SizedBox(
                height: 80,
                child: Center(
                  child: CircularProgressIndicator(
                    strokeWidth: 1.5,
                    color: AppTheme.brandCyan.withValues(alpha: 0.7),
                  ),
                ),
              ),
              error: (_, __) => _buildPremiumEmptySlot(i + 1),
            ),
          ),
        );
      } else {
        items.add(Expanded(child: _buildPremiumEmptySlot(i + 1)));
      }
    }
    return items;
  }

  Widget _buildPremiumEmptySlot(int slotNumber) {
    final isDark = context.isDarkMode;
    return GestureDetector(
      onTap: () {
        _searchFocusNode.requestFocus();
        HapticFeedback.selectionClick();
      },
      child: Column(
        children: [
          Container(
            width: 66,
            height: 66,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: AppTheme.brandCyan.withValues(alpha: 0.2),
                width: 1.5,
                strokeAlign: BorderSide.strokeAlignOutside,
              ),
              color: isDark
                  ? Colors.white.withValues(alpha: 0.03)
                  : AppTheme.brandBlue.withValues(alpha: 0.05),
            ),
            child: Center(
              child: Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: const LinearGradient(
                    colors: [AppTheme.brandBlue, AppTheme.brandDeepBlue],
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: AppTheme.brandBlue.withValues(alpha: 0.4),
                      blurRadius: 10,
                      offset: const Offset(0, 3),
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.add_rounded,
                  color: Colors.white,
                  size: 17,
                ),
              ),
            ),
          ),
          const SizedBox(height: 5),
          Text(
            _productSlotLabel(slotNumber),
            style: GoogleFonts.plusJakartaSans(
              fontSize: 9,
              fontWeight: FontWeight.w600,
              color: isDark
                  ? AppTheme.brandCyan.withValues(alpha: 0.5)
                  : context.textSecondary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPremiumFilledSlot(ProductEntity product) {
    final isDark = context.isDarkMode;
    return Column(
      children: [
        Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.center,
          children: [
            Container(
              width: 66,
              height: 66,
              decoration: BoxDecoration(
                color: isDark
                    ? Colors.white.withValues(alpha: 0.07)
                    : AppTheme.brandBlue.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(
                  color: AppTheme.brandCyan.withValues(alpha: 0.3),
                ),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(15),
                child: ProductImageBox(
                  imageUrl: product.imageUrl,
                  fallbackUrls: product.images,
                  width: 60,
                  height: 60,
                  borderRadius: BorderRadius.circular(15),
                  padding: const EdgeInsets.all(4),
                ),
              ),
            ),
            Positioned(
              top: -6,
              right: -6,
              child: GestureDetector(
                onTap: () => _removeProduct(product.id),
                child: Container(
                  width: 20,
                  height: 20,
                  decoration: BoxDecoration(
                    color: const Color(0xFFEF4444),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: isDark
                          ? const Color(0xFF0A1020)
                          : context.surfaceColor,
                      width: 1.5,
                    ),
                  ),
                  child: const Icon(Icons.close, size: 10, color: Colors.white),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 5),
        SizedBox(
          width: 66,
          child: Text(
            product.brand?.isNotEmpty == true ? product.brand! : product.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 9,
              fontWeight: FontWeight.w600,
              color: isDark ? Colors.white70 : context.textSecondary,
            ),
          ),
        ),
      ],
    );
  }

  // Legacy slot methods removed — replaced by _buildPremiumSlotWidgets
}
