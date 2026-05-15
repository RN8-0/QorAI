/// Qor AI - Product Detail Screen (v2 — redesigned)
library;

import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'dart:math' as dart_math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/core/constants.dart';
import 'package:qor_ai/core/email_verification_gate.dart';
import 'package:qor_ai/core/utils.dart';
import 'package:qor_ai/core/errors.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';
import 'package:qor_ai/domain/entities/user_entity.dart';
import 'package:qor_ai/data/models/other_models.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/presentation/widgets/qor_badges.dart';
import 'package:qor_ai/presentation/widgets/paywall_sheet.dart';
import 'package:qor_ai/presentation/widgets/limit_reached_dialog.dart';
import 'package:qor_ai/services/profile_algorithm_service.dart';
import 'package:share_plus/share_plus.dart';
import 'package:go_router/go_router.dart';
import 'package:qor_ai/core/pb_client.dart';
import 'package:qor_ai/routing/router.dart';
import 'package:qor_ai/presentation/widgets/shared/shared_key_specs_grid.dart';
import 'package:qor_ai/presentation/widgets/shared/shared_similar_card.dart';
import 'package:qor_ai/presentation/widgets/shared/shared_youtube_card.dart';
import 'package:qor_ai/presentation/widgets/shared/shared_premium_section.dart';
import 'package:qor_ai/presentation/widgets/login_required_dialog.dart';
import 'package:qor_ai/services/spec_translation_service.dart';
import 'package:qor_ai/core/spec_word_dictionary.dart' as spec_dict;
import 'package:qor_ai/core/category_key_specs.dart' as key_specs;
import 'package:qor_ai/core/product_name_localizer.dart';
import 'package:youtube_explode_dart/youtube_explode_dart.dart' as yt_explode;
import 'package:video_player/video_player.dart';
import 'package:chewie/chewie.dart';

part 'tabs/premium_tab.dart';
part 'tabs/reviews_tab.dart';
part 'tabs/similar_tab.dart';
part 'tabs/specs_tab.dart';
part 'widgets/action_widgets.dart';
part 'widgets/common_widgets.dart';
part 'widgets/compare_tab_widget.dart';
part 'widgets/compatibility_widget.dart';
part 'widgets/hero_header_widget.dart';
part 'widgets/loading_error_widget.dart';
part 'widgets/overview_widget.dart';
part 'widgets/price_widget.dart';
part 'widgets/product_info_widget.dart';
part 'widgets/pros_cons_widget.dart';
part 'widgets/score_widgets.dart';
part 'widgets/translation_button_widget.dart';
part 'widgets/variants_widget.dart';
part 'widgets/youtube_player_widget.dart';

// ═══════════════════════════════════════════════════════════
// MAIN SCREEN
// ═══════════════════════════════════════════════════════════

class ProductDetailScreen extends ConsumerWidget {
  final String productId;
  const ProductDetailScreen({super.key, required this.productId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(productDetailProvider(productId));
    final country = ref.watch(selectedCountryProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return async.when(
      data: (result) => result.when(
        success: (product) =>
            _DetailBody(product: product, country: country, isDark: isDark),
        failure: (error) => _ErrorScreen(
          message: error.message,
          onRetry: () => ref.invalidate(productDetailProvider(productId)),
        ),
      ),
      loading: () => const _LoadingScreen(),
      error: (e, _) => _ErrorScreen(
        message: e.toString(),
        onRetry: () => ref.invalidate(productDetailProvider(productId)),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// DETAIL BODY
// ═══════════════════════════════════════════════════════════

class _DetailBody extends ConsumerStatefulWidget {
  final ProductEntity product;
  final String country;
  final bool isDark;
  const _DetailBody({
    required this.product,
    required this.country,
    required this.isDark,
  });

  @override
  ConsumerState<_DetailBody> createState() => _DetailBodyState();
}

class _DetailBodyState extends ConsumerState<_DetailBody> {
  bool _tabViewReady = false;
  // Defer overview content (variants, description, pros/cons) to post-frame
  // so the first frame after navigation is minimal and doesn't stutter.
  bool _contentReady = false;
  static const _tabWarmupDelay = Duration(milliseconds: 120);

  @override
  void initState() {
    super.initState();
    _syncAiPageContext();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      // Precache the main product image immediately so hero renders instantly
      final mainImage = widget.product.imageUrl;
      if (mainImage != null && mainImage.isNotEmpty) {
        precacheImage(
          CachedNetworkImageProvider(mainImage),
          context,
        ).catchError((_) {});
      }
      _resetComparePoolIfCategoryChanged();
      if (!mounted) return;
      // Defer ALL heavy content until the route push animation fully completes.
      // Setting _contentReady early (before animation end) causes expensive
      // widget builds to compete with route animation frames → visible jank.
      final route = ModalRoute.of(context);
      final anim = route?.animation;
      if (anim == null || anim.status == AnimationStatus.completed) {
        if (mounted) {
          setState(() {
            _contentReady = true;
            _tabViewReady = true;
          });
          // Precache gallery images after animation
          _precacheGalleryImages();
        }
      } else {
        void listener(AnimationStatus s) {
          if (s == AnimationStatus.completed) {
            anim.removeStatusListener(listener);
            if (!mounted) return;
            // Show overview content first (one frame for layout settle).
            setState(() => _contentReady = true);
            // Precache remaining gallery images while animation completes
            _precacheGalleryImages();
            // Give the overview one short frame window, then mount the tabs.
            Future.delayed(_tabWarmupDelay, () {
              if (!mounted) return;
              setState(() => _tabViewReady = true);
            });
          }
        }

        anim.addStatusListener(listener);
      }
    });
  }

  /// Precache all product gallery images after route animation completes.
  void _precacheGalleryImages() {
    final allImages = widget.product.allImages;
    // Skip index 0 (already precached above), cache up to 7 gallery images
    for (final url in allImages.skip(1).take(7)) {
      if (url.isNotEmpty) {
        precacheImage(
          CachedNetworkImageProvider(url),
          context,
        ).catchError((_) {});
      }
    }
  }

  @override
  void didUpdateWidget(covariant _DetailBody oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.product.id != widget.product.id) {
      _syncAiPageContext();
      _resetComparePoolIfCategoryChanged();
    }
  }

  /// Havuz farklı bir kategoride başlatıldıysa, başka kategorideki ürüne
  /// geçince seçimi sıfırla ([ComparisonNotifier.toggleProduct] ile hizalı).
  void _resetComparePoolIfCategoryChanged() {
    final comp = ref.read(comparisonStateProvider);
    if (comp.selectedProductIds.isEmpty) return;
    final pool = comp.poolCategory;
    if (pool == null) return;
    final current = key_specs.resolveCategory(widget.product.category);
    final normalizedCurrent = current.isNotEmpty
        ? current
        : widget.product.category.toLowerCase().trim();
    if (pool != normalizedCurrent) {
      ref.read(comparisonStateProvider.notifier).clearSelection();
    }
  }

  void _syncAiPageContext() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(aiPageContextProvider.notifier).state = {
        'contextRoute': 'product',
        'productName': widget.product.name,
        'productBrand': widget.product.brand ?? '',
        'productCategory': widget.product.category,
        'productSubcategory': widget.product.subcategory,
        'techScore': widget.product.techScore.toString(),
        'productId': widget.product.id,
        if (widget.product.keySpecs.isNotEmpty)
          'productKeySpecs': widget.product.keySpecs.entries
              .take(10)
              .map((e) => '${e.key}: ${e.value}')
              .join(' | '),
        if (widget.product.pros.isNotEmpty)
          'productPros': widget.product.pros.take(5).join(' | '),
        if (widget.product.cons.isNotEmpty)
          'productCons': widget.product.cons.take(5).join(' | '),
        if (widget.product.prices.isNotEmpty)
          'productPrices': widget.product.prices.entries
              .take(6)
              .map((e) => '${e.key}: ${e.value}')
              .join(' | '),
      };
    });
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final product = widget.product;
    final country = widget.country;

    return DefaultTabController(
      length: 4,
      child: Scaffold(
        backgroundColor: context.backgroundColor,
        body: NestedScrollView(
          physics: const ClampingScrollPhysics(),
          headerSliverBuilder: (context, innerBoxIsScrolled) => [
            SliverToBoxAdapter(child: _ViewTracker(productId: product.id)),
            // Pinned action bar with back / share / favorite buttons
            SliverAppBar(
              pinned: true,
              toolbarHeight: 56,
              expandedHeight: 0,
              backgroundColor: context.backgroundColor,
              elevation: 0,
              automaticallyImplyLeading: false,
              leading: Padding(
                padding: const EdgeInsets.all(8),
                child: Container(
                  decoration: BoxDecoration(
                    color: context.backgroundColor,
                    shape: BoxShape.circle,
                    border: Border.all(color: context.dividerColor),
                    boxShadow: AppTheme.cardShadow,
                  ),
                  child: IconButton(
                    padding: EdgeInsets.zero,
                    icon: Icon(
                      Icons.arrow_back_ios_new,
                      color: context.textPrimary,
                      size: 18,
                    ),
                    onPressed: () => context.pop(),
                  ),
                ),
              ),
              actions: [
                Padding(
                  padding: const EdgeInsets.only(right: 12),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Compare button — icon + localized label
                      _CompareTooltipButton(product: product),
                      const SizedBox(width: 8),
                      // Share button
                      Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(
                          color: context.backgroundColor,
                          shape: BoxShape.circle,
                          border: Border.all(color: context.dividerColor),
                          boxShadow: AppTheme.cardShadow,
                        ),
                        child: IconButton(
                          padding: EdgeInsets.zero,
                          icon: Icon(
                            Icons.share_outlined,
                            color: context.textPrimary,
                            size: 18,
                          ),
                          onPressed: () {
                            final productUrl =
                                'https://qorai.net/product/${product.id}';
                            Share.share(
                              '${product.name} — ${product.description.isNotEmpty ? product.description : 'Check it out on Qor AI!'}\n$productUrl',
                              subject: product.name,
                            );
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(
                          color: context.backgroundColor,
                          shape: BoxShape.circle,
                          border: Border.all(color: context.dividerColor),
                          boxShadow: AppTheme.cardShadow,
                        ),
                        child: _FavoriteButton(
                          productId: product.id,
                          isDark: false,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            // Product image hero
            _HeroHeader(product: product),
            SliverToBoxAdapter(
              child: RepaintBoundary(
                child: _TitlePriceSection(product: product, country: country),
              ),
            ),
            SliverToBoxAdapter(
              child: RepaintBoundary(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(0, 8, 0, 8),
                  child: _ScoreDuo(product: product),
                ),
              ),
            ),
            // Overview content — always visible above tabs
            SliverToBoxAdapter(
              child: RepaintBoundary(
                child: _contentReady
                    ? _OverviewContent(
                        product: product,
                        country: country,
                        isDark: isDark,
                      )
                    : const SizedBox(height: 80),
              ),
            ),
            SliverPersistentHeader(
              pinned: true,
              delegate: _StickyTabBarDelegate(),
            ),
          ],
          body: _tabViewReady
              ? Builder(
                  builder: (context) => _LazyDetailTabView(
                    controller: DefaultTabController.of(context),
                    children: [
                      RepaintBoundary(
                        child: _SpecsTabContent(
                          product: product,
                          isDark: isDark,
                        ),
                      ),
                      RepaintBoundary(
                        child: _ReviewsTab(product: product, isDark: isDark),
                      ),
                      RepaintBoundary(
                        child: _SimilarProductsTab(
                          product: product,
                          isDark: isDark,
                        ),
                      ),
                      RepaintBoundary(
                        child: _AIAnalysisTab(product: product, isDark: isDark),
                      ),
                    ],
                  ),
                )
              : const SizedBox.shrink(),
        ),
      ),
    );
  }
}

class _LazyDetailTabView extends StatefulWidget {
  const _LazyDetailTabView({required this.controller, required this.children});

  final TabController controller;
  final List<Widget> children;

  @override
  State<_LazyDetailTabView> createState() => _LazyDetailTabViewState();
}

class _LazyDetailTabViewState extends State<_LazyDetailTabView> {
  late final Set<int> _builtIndexes = {widget.controller.index};
  late int _currentIndex = widget.controller.index;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_handleTabChange);
  }

  @override
  void didUpdateWidget(covariant _LazyDetailTabView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller == widget.controller) return;
    oldWidget.controller.removeListener(_handleTabChange);
    widget.controller.addListener(_handleTabChange);
    _builtIndexes.add(widget.controller.index);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_handleTabChange);
    super.dispose();
  }

  void _handleTabChange() {
    final nextIndex = widget.controller.index;
    if (nextIndex == _currentIndex) return;
    _currentIndex = nextIndex;
    _builtIndexes.add(nextIndex);
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final currentIndex = widget.controller.index;
    _currentIndex = currentIndex;
    _builtIndexes.add(currentIndex);
    return IndexedStack(
      index: currentIndex,
      children: List<Widget>.generate(widget.children.length, (index) {
        if (!_builtIndexes.contains(index)) {
          return const SizedBox.shrink();
        }
        return KeyedSubtree(
          key: PageStorageKey<String>('detail-tab-$index'),
          child: widget.children[index],
        );
      }),
    );
  }
}
