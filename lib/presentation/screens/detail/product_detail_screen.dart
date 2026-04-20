/// Compair - Product Detail Screen (v2 — redesigned)
library;

import 'dart:ui';
import 'dart:convert';
import 'package:flutter/gestures.dart';
import 'package:flutter/foundation.dart';
import 'dart:math' as dart_math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/core/constants.dart';
import 'package:compair/core/utils.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/domain/entities/product_entity.dart';
import 'package:compair/data/models/other_models.dart';
import 'package:compair/presentation/providers/providers.dart';
import 'package:compair/presentation/widgets/paywall_sheet.dart';
import 'package:compair/presentation/widgets/limit_reached_dialog.dart';
import 'package:compair/services/profile_algorithm_service.dart';
import 'package:compair/services/youtube_service.dart';
import 'package:share_plus/share_plus.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:go_router/go_router.dart';
import 'package:compair/core/pb_client.dart';
import 'package:pocketbase/pocketbase.dart';
import 'package:compair/presentation/widgets/product_image_box.dart';
import 'package:compair/routing/router.dart';
import 'package:compair/presentation/widgets/shared/shared_key_specs_grid.dart';
import 'package:compair/presentation/widgets/shared/shared_similar_card.dart';
import 'package:compair/presentation/widgets/shared/shared_youtube_card.dart';
import 'package:compair/presentation/widgets/shared/shared_premium_section.dart';
import 'package:compair/presentation/widgets/login_required_dialog.dart';
import 'package:compair/services/spec_translation_service.dart';
import 'package:compair/core/spec_word_dictionary.dart' as spec_dict;
import 'package:dio/dio.dart';
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
  String? _lastPrefetchedMatchKey;
  bool _tabViewReady = false;
  // Defer overview content (variants, description, pros/cons) to post-frame
  // so the first frame after navigation is minimal and doesn't stutter.
  bool _contentReady = false;

  @override
  void initState() {
    super.initState();
    _syncAiPageContext();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      // Overview renders on next frame — keeps navigation smooth.
      setState(() => _contentReady = true);
      _prefetchMatchScoreOnce();
      // Listen to route push animation; enable tabs after animation completes
      final route = ModalRoute.of(context);
      final anim = route?.animation;
      if (anim == null || anim.status == AnimationStatus.completed) {
        if (mounted) setState(() => _tabViewReady = true);
      } else {
        void listener(AnimationStatus s) {
          if (s == AnimationStatus.completed) {
            anim.removeStatusListener(listener);
            if (mounted) setState(() => _tabViewReady = true);
          }
        }

        anim.addStatusListener(listener);
      }
    });
  }

  @override
  void didUpdateWidget(covariant _DetailBody oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.product.id != widget.product.id) {
      _syncAiPageContext();
    }
  }

  void _syncAiPageContext() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(aiPageContextProvider.notifier).state = {
        'productName': widget.product.name,
        'productBrand': widget.product.brand ?? '',
        'productCategory': widget.product.category,
        'techScore': widget.product.techScore.toString(),
        'productId': widget.product.id,
      };
    });
  }

  void _prefetchMatchScoreOnce() {
    final locale = ref.read(localeProvider);
    final languageCode = (locale?.languageCode ?? 'en').toLowerCase();
    _prefetchMatchScore(languageCode);
  }

  void _prefetchMatchScore(String languageCode) {
    final normalizedLanguageCode = languageCode.trim().toLowerCase();
    final cacheKey = '${widget.product.id}|$normalizedLanguageCode';
    if (_lastPrefetchedMatchKey == cacheKey) return;

    final user = ref.read(userProfileProvider).valueOrNull;
    if (user == null || !user.quizCompleted) return;

    _lastPrefetchedMatchKey = cacheKey;
    final localizedKey = LocalizedProductKey(
      productId: widget.product.id,
      languageCode: normalizedLanguageCode,
    );

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref
          .read(geminiMatchScoreProvider(localizedKey).notifier)
          .fetchMatchScore(product: widget.product);
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
                                'https://compair.digital/product/${product.id}';
                            Share.share(
                              '${product.name} — ${product.description.isNotEmpty ? product.description : 'Check it out on Compair!'}\n$productUrl',
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
              child: _TitlePriceSection(product: product, country: country),
            ),
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(0, 8, 0, 8),
                child: _ScoreDuo(product: product),
              ),
            ),
            // Overview content — always visible above tabs
            SliverToBoxAdapter(
              child: _contentReady
                  ? _OverviewContent(
                      product: product,
                      country: country,
                      isDark: isDark,
                    )
                  : const SizedBox(height: 80),
            ),
            SliverPersistentHeader(
              pinned: true,
              delegate: _StickyTabBarDelegate(),
            ),
          ],
          body: RepaintBoundary(
            child: _tabViewReady
                ? Builder(
                    builder: (context) => _LazyDetailTabView(
                      controller: DefaultTabController.of(context),
                      children: [
                        _SpecsTabContent(product: product, isDark: isDark),
                        _ReviewsTab(product: product, isDark: isDark),
                        _SimilarProductsTab(product: product, isDark: isDark),
                        _AIAnalysisTab(product: product, isDark: isDark),
                      ],
                    ),
                  )
                : const SizedBox.shrink(),
          ),
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
