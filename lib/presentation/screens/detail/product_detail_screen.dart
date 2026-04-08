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
import 'package:compair/services/profile_algorithm_service.dart';
import 'package:compair/services/youtube_service.dart';
import 'package:share_plus/share_plus.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:go_router/go_router.dart';
import 'package:compair/presentation/widgets/product_image_box.dart';
import 'package:compair/routing/router.dart';
import 'package:compair/services/spec_translation_service.dart';
import 'package:compair/core/spec_word_dictionary.dart' as spec_dict;
import 'package:dio/dio.dart';
import 'package:youtube_player_iframe/youtube_player_iframe.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:youtube_explode_dart/youtube_explode_dart.dart' as yt_explode;
import 'package:video_player/video_player.dart';
import 'package:chewie/chewie.dart';

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
        success: (product) => _DetailBody(product: product, country: country, isDark: isDark),
        failure: (error) => _ErrorScreen(message: error.message, onRetry: () => ref.invalidate(productDetailProvider(productId))),
      ),
      loading: () => const _LoadingScreen(),
      error: (e, _) => _ErrorScreen(message: e.toString(), onRetry: () => ref.invalidate(productDetailProvider(productId))),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// DETAIL BODY
// ═══════════════════════════════════════════════════════════

class _DetailBody extends ConsumerWidget {
  final ProductEntity product;
  final String country;
  final bool isDark;
  const _DetailBody({required this.product, required this.country, required this.isDark});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Use actual theme mode instead of hardcoded value
    final isDark = Theme.of(context).brightness == Brightness.dark;

    // Set AI page context so the chat knows which product the user is viewing
    Future.microtask(() {
      ref.read(aiPageContextProvider.notifier).state = {
        'productName': product.name,
        'productBrand': product.brand ?? '',
        'productCategory': product.category,
        'techScore': product.techScore.toString(),
        'productId': product.id,
      };
    });

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
                    boxShadow: [BoxShadow(color: Colors.white.withValues(alpha: 0.08), blurRadius: 8)],
                  ),
                  child: IconButton(
                    padding: EdgeInsets.zero,
                    icon: Icon(Icons.arrow_back_ios_new, color: context.textPrimary, size: 18),
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
                      Builder(builder: (ctx) {
                        final isInCompare = ref.watch(comparisonStateProvider).selectedProductIds.contains(product.id);
                        return GestureDetector(
                          onTap: () {
                            // Require login
                            final authState = ref.read(authStateProvider);
                            final isLoggedIn = authState.valueOrNull != null;
                            if (!isLoggedIn) {
                              ScaffoldMessenger.of(context).hideCurrentSnackBar();
                              ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                                content: Row(children: [
                                  const Icon(Icons.lock_outline, color: Colors.white, size: 18),
                                  const SizedBox(width: 8),
                                  Text(context.l10n?.signInToCompare ?? 'Sign in to compare products',
                                      style: GoogleFonts.plusJakartaSans(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white)),
                                ]),
                                backgroundColor: AppTheme.primaryBlue,
                                behavior: SnackBarBehavior.floating,
                                margin: const EdgeInsets.fromLTRB(16, 0, 16, 80),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                action: SnackBarAction(
                                  label: context.l10n?.signIn ?? 'Sign In',
                                  textColor: Colors.white,
                                  onPressed: () => context.push(AppRoutes.login),
                                ),
                              ));
                              return;
                            }

                            final currentIds = ref.read(comparisonStateProvider).selectedProductIds;
                            final isAlreadyIn = currentIds.contains(product.id);

                            // Category check when adding
                            if (!isAlreadyIn && currentIds.isNotEmpty) {
                              final firstProductAsync = ref.read(productDetailProvider(currentIds.first));
                              String? firstCategory;
                              firstProductAsync.whenData((r) => r.when(
                                success: (p) => firstCategory = p.category,
                                failure: (_) {},
                              ));
                              if (firstCategory != null && firstCategory != product.category) {
                                ScaffoldMessenger.of(context).hideCurrentSnackBar();
                                ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                                  content: Text(context.l10n?.onlySameCategoryCompare(firstCategory!.replaceAll('_', ' ')) ??
                                      'Only ${firstCategory!.replaceAll('_', ' ')} products can be compared',
                                      style: GoogleFonts.plusJakartaSans(fontSize: 13, fontWeight: FontWeight.w500, color: Colors.white)),
                                  backgroundColor: Colors.redAccent,
                                  behavior: SnackBarBehavior.floating,
                                  margin: const EdgeInsets.fromLTRB(16, 0, 16, 80),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                ));
                                HapticFeedback.heavyImpact();
                                return;
                              }
                            }

                            ref.read(comparisonStateProvider.notifier).toggleProduct(product.id);
                            HapticFeedback.lightImpact();

                            if (!isAlreadyIn) {
                              final newIds = ref.read(comparisonStateProvider).selectedProductIds;
                              if (newIds.length >= 2) {
                                ScaffoldMessenger.of(context).hideCurrentSnackBar();
                                // Navigate to compare tab (don't push new instance)
                                context.go(AppRoutes.compare);
                              } else {
                                ScaffoldMessenger.of(context).hideCurrentSnackBar();
                                ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                                  content: Row(children: [
                                    const Icon(Icons.compare_arrows_rounded, color: Colors.white, size: 18),
                                    const SizedBox(width: 8),
                                    Text('${newIds.length}/2 products selected',
                                        style: GoogleFonts.plusJakartaSans(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white)),
                                  ]),
                                  backgroundColor: AppTheme.primaryBlue,
                                  behavior: SnackBarBehavior.floating,
                                  margin: const EdgeInsets.fromLTRB(16, 0, 16, 80),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                  duration: const Duration(seconds: 2),
                                ));
                              }
                            }
                          },
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                            decoration: BoxDecoration(
                              color: isInCompare
                                  ? AppTheme.primaryBlue.withValues(alpha: 0.15)
                                  : context.surfaceVariantColor,
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(
                                color: isInCompare
                                    ? AppTheme.primaryBlue.withValues(alpha: 0.5)
                                    : context.dividerColor,
                                width: 1,
                              ),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  isInCompare ? Icons.check_circle : Icons.compare_arrows_rounded,
                                  color: isInCompare ? AppTheme.primaryBlue : context.textPrimary,
                                  size: 16,
                                ),
                                const SizedBox(width: 5),
                                Text(
                                  isInCompare
                                      ? (context.l10n?.added ?? 'Eklendi')
                                      : (context.l10n?.compareAction ?? 'Karşılaştır'),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: isInCompare ? AppTheme.primaryBlue : context.textPrimary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      }),
                      const SizedBox(width: 8),
                      // Share button
                      Container(
                        width: 38, height: 38,
                        decoration: BoxDecoration(
                          color: context.backgroundColor,
                          shape: BoxShape.circle,
                          boxShadow: [BoxShadow(color: Colors.white.withValues(alpha: 0.08), blurRadius: 8)],
                        ),
                        child: IconButton(
                          padding: EdgeInsets.zero,
                          icon: Icon(Icons.share_outlined, color: context.textPrimary, size: 18),
                          onPressed: () {
                            final productUrl = 'https://compair.digital/product/${product.id}';
                            Share.share(
                              '${product.name} — ${product.description.isNotEmpty ? product.description : 'Check it out on Compair!'}\n$productUrl',
                              subject: product.name,
                            );
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        width: 38, height: 38,
                        decoration: BoxDecoration(
                          color: context.backgroundColor,
                          shape: BoxShape.circle,
                          boxShadow: [BoxShadow(color: Colors.white.withValues(alpha: 0.08), blurRadius: 8)],
                        ),
                        child: _FavoriteButton(productId: product.id, isDark: false),
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
              child: _OverviewContent(product: product, country: country, isDark: isDark),
            ),
            SliverPersistentHeader(
              pinned: true,
              delegate: _StickyTabBarDelegate(),
            ),
          ],
          body: TabBarView(
            children: [
              _SpecsTabContent(product: product, isDark: isDark),
              _ReviewsTab(product: product, isDark: isDark),
              _SimilarProductsTab(product: product, isDark: isDark),
              _AIAnalysisTab(product: product, isDark: isDark),
            ],
          ),
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// HERO HEADER
// ═══════════════════════════════════════════════════════════

class _HeroHeader extends StatefulWidget {
  final ProductEntity product;
  const _HeroHeader({required this.product});

  @override
  State<_HeroHeader> createState() => _HeroHeaderState();
}

class _HeroHeaderState extends State<_HeroHeader> {
  int _selectedIndex = 0;

  @override
  Widget build(BuildContext context) {
    final allImages = widget.product.allImages;

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final imageBg = isDark ? Colors.white : Colors.white;

    return SliverToBoxAdapter(
      child: Container(
        height: 280,
        decoration: BoxDecoration(
          color: imageBg,
          gradient: isDark ? null : LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              const Color(0xFFF8FAFC),
              Colors.white,
            ],
          ),
        ),
        child: Stack(
          children: [
            // ── Row: thumbnail strip (left) + main image (right) ──
            Positioned.fill(
              child: Row(
                children: [
                  // LEFT — vertical thumbnail strip
                  if (allImages.length > 1)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(12, 12, 8, 12),
                      child: SingleChildScrollView(
                        child: Column(
                          children: List.generate(allImages.length.clamp(0, 8), (i) {
                            final isSelected = _selectedIndex == i;
                            return GestureDetector(
                              onTap: () => setState(() => _selectedIndex = i),
                              child: AnimatedContainer(
                                duration: const Duration(milliseconds: 200),
                                margin: const EdgeInsets.only(bottom: 8),
                                width: 56,
                                height: 56,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: isSelected
                                        ? AppTheme.primaryBlue
                                        : context.textTertiaryColor,
                                    width: isSelected ? 2 : 1,
                                  ),
                                  color: isSelected
                                      ? AppTheme.primaryBlue.withValues(alpha: 0.06)
                                      : imageBg,
                                  boxShadow: isSelected
                                      ? [BoxShadow(color: AppTheme.primaryBlue.withValues(alpha: 0.2), blurRadius: 6)]
                                      : null,
                                ),
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(9),
                                  child: CachedNetworkImage(
                                    imageUrl: allImages[i],
                                    fit: BoxFit.contain,
                                    placeholder: (_, __) => const Center(
                                      child: SizedBox(
                                        width: 16, height: 16,
                                        child: CircularProgressIndicator(strokeWidth: 1.5, color: AppTheme.slate600),
                                      ),
                                    ),
                                    errorWidget: (_, __, ___) => const Icon(Icons.image_not_supported_outlined, color: AppTheme.slate600, size: 20),
                                  ),
                                ),
                              ),
                            );
                          }),
                        ),
                      ),
                    ),

                  // RIGHT — main selected image
                  Expanded(
                    child: GestureDetector(
                      onTap: allImages.isNotEmpty ? () {
                        Navigator.of(context).push(PageRouteBuilder(
                          opaque: false,
                          barrierColor: Colors.black87,
                          pageBuilder: (context, animation, secondaryAnimation) {
                            return _FullScreenImageViewer(
                              images: allImages,
                              initialIndex: _selectedIndex,
                              animation: animation,
                            );
                          },
                          transitionsBuilder: (context, animation, secondaryAnimation, child) {
                            return FadeTransition(opacity: animation, child: child);
                          },
                        ));
                      } : null,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(4, 16, 16, 16),
                        child: allImages.isEmpty
                            ? Center(child: _CategoryEmoji(cat: widget.product.categoryId))
                            : Hero(
                                tag: 'product_image_${widget.product.id}_$_selectedIndex',
                                child: AnimatedSwitcher(
                                  duration: const Duration(milliseconds: 220),
                                  transitionBuilder: (child, anim) =>
                                      FadeTransition(opacity: anim, child: child),
                                  child: CachedNetworkImage(
                                    key: ValueKey(_selectedIndex),
                                    imageUrl: allImages[_selectedIndex],
                                    fit: BoxFit.contain,
                                    placeholder: (_, __) => const Center(
                                      child: CircularProgressIndicator(color: AppTheme.slate600, strokeWidth: 2),
                                    ),
                                    errorWidget: (_, __, ___) =>
                                        _CategoryEmoji(cat: widget.product.categoryId),
                                  ),
                                ),
                              ),
                      ),
                    ),
                  ),
                ],
              ),
            ),

          ],
        ),
      ),
    );
  }
}

class _HeroScoreBadge extends StatelessWidget {
  final int score;
  const _HeroScoreBadge({required this.score});

  @override
  Widget build(BuildContext context) {
    final bool isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: 50,
      height: 50,
      decoration: BoxDecoration(
        color: context.surfaceColor,
        shape: BoxShape.circle,
        boxShadow: [BoxShadow(color: (isDark ? Colors.black : Colors.black12).withValues(alpha: isDark ? 0.3 : 0.06), blurRadius: 8, offset: const Offset(0, 2))],
        border: Border.all(color: AppTheme.primaryBlue, width: 2.5),
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox(
            width: 44,
            height: 44,
            child: CircularProgressIndicator(
              value: score / 100,
              strokeWidth: 3,
              backgroundColor: AppTheme.primaryBlue.withValues(alpha: 0.15),
              valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.primaryBlue),
            ),
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '$score',
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: AppTheme.primaryBlue, height: 1.0),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Product name card — shown below the hero header
class _ProductNameCard extends StatelessWidget {
  final ProductEntity product;
  final bool isDark;
  const _ProductNameCard({required this.product, required this.isDark});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.white.withValues(alpha: 0.06), blurRadius: 10)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (product.brand != null && product.brand!.isNotEmpty) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: AppTheme.primaryBlue.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppTheme.primaryBlue.withValues(alpha: 0.4)),
              ),
              child: Text(
                product.brand!,
                style: const TextStyle(
                  fontSize: 12,
                  color: AppTheme.primaryBlue,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(height: 10),
          ],
          Text(
            product.name,
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.bold,
              color: isDark ? context.textPrimary : context.textPrimary,
              letterSpacing: -0.3,
            ),
          ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// SCORE DUO — Tech Score + Your Match only
// ═══════════════════════════════════════════════════════════

class _ScoreDuo extends ConsumerWidget {
  final ProductEntity product;
  const _ScoreDuo({required this.product});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final techScore = product.techScore.toInt();

    final userAsync = ref.watch(userProfileProvider);
    final user = userAsync.valueOrNull;
    int? fitScore;
    bool quizDone = false;
    if (user != null && user.quizCompleted) {
      quizDone = true;
      final algo = ref.read(profileAlgorithmServiceProvider);
      final behaviorAsync = ref.watch(behaviorSignalsProvider);
      final behavior = behaviorAsync.valueOrNull ?? BehaviorSignals.empty;
      final fs = algo.calculateTotalFitScore(user: user, product: product, behavior: behavior);
      if (fs > 0) fitScore = fs.toInt();
    }

    if (techScore == 0 && fitScore == null && !quizDone) return const SizedBox.shrink();

    final matchColor = fitScore == null
        ? AppTheme.slate700
        : fitScore >= 80
            ? AppTheme.scoreExcellent
            : fitScore >= 60
                ? AppTheme.warning
                : AppTheme.error;

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 0),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.white.withValues(alpha: 0.05), blurRadius: 8, offset: const Offset(0, 2))],
      ),
      child: IntrinsicHeight(
        child: Row(
          children: [
            if (techScore > 0) ...[
              Expanded(
                child: _ScoreCell(
                  label: context.l10n?.techScore ?? 'Tech Score',
                  score: techScore,
                  color: AppTheme.primaryBlue,
                  icon: Icons.memory_outlined,
                ),
              ),
              VerticalDivider(width: 1, thickness: 1, color: context.dividerColor, indent: 12, endIndent: 12),
            ],
            Expanded(
              child: fitScore != null
                  ? _ScoreCell(
                      label: context.l10n?.yourMatch ?? 'Your Match',
                      score: fitScore,
                      color: matchColor,
                      icon: Icons.person_outline,
                    )
                  : GestureDetector(
                      onTap: () => context.push(AppRoutes.quiz),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            SizedBox(
                              width: 44, height: 44,
                              child: Stack(
                                alignment: Alignment.center,
                                children: [
                                  CircularProgressIndicator(
                                    value: 1.0,
                                    strokeWidth: 3,
                                    color: context.surfaceVariantColor,
                                  ),
                                  Icon(Icons.lock_outline_rounded, size: 16, color: context.textSecondary),
                                ],
                              ),
                            ),
                            const SizedBox(width: 10),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(context.l10n?.yourMatch ?? 'Your Match',
                                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600,
                                        color: AppTheme.slate500, letterSpacing: 0.4)),
                                const SizedBox(height: 2),
                                Text(context.l10n?.takeQuiz ?? 'Take Quiz',
                                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700,
                                        color: AppTheme.primaryBlue)),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ScoreCell extends StatelessWidget {
  final String label;
  final int score;
  final Color color;
  final IconData icon;
  const _ScoreCell({required this.label, required this.score, required this.color, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(
            width: 44, height: 44,
            child: Stack(
              alignment: Alignment.center,
              children: [
                CircularProgressIndicator(
                  value: 1.0,
                  strokeWidth: 3,
                  color: context.surfaceVariantColor,
                ),
                CircularProgressIndicator(
                  value: score / 100,
                  strokeWidth: 3,
                  backgroundColor: Colors.transparent,
                  valueColor: AlwaysStoppedAnimation<Color>(color),
                  strokeCap: StrokeCap.round,
                ),
                Text('$score',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: color, height: 1)),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 12, color: color),
                  const SizedBox(width: 3),
                  Text(label,
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600,
                          color: AppTheme.slate500, letterSpacing: 0.4)),
                ],
              ),
              const SizedBox(height: 2),
              Text(
                score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Low',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: color),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ScoreTrio extends StatelessWidget {
  final ProductEntity product;
  const _ScoreTrio({required this.product});

  @override
  Widget build(BuildContext context) {
    // If no scores, show nothing or empty state
    if (product.techScore == 0 && product.ratings.community == 0 && product.ratings.expert == 0) {
      return const SizedBox.shrink();
    }

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        _CircularScore(
          label: context.l10n?.techScore ?? 'Tech Score',
          score: product.techScore.toInt(),
          color: AppTheme.primaryBlue,
          icon: Icons.memory,
        ),
        _CircularScore(
          label: context.l10n?.userScore ?? 'User Score',
          score: (product.ratings.community * 10).toInt(),
          color: AppTheme.accentCyan,
          icon: Icons.people,
        ),
        _CircularScore(
          label: context.l10n?.expertScore ?? 'Expert Score',
          score: product.ratings.expert.toInt(),
          color: AppTheme.premiumPurple,
          icon: Icons.star,
        ),
      ],
    );
  }
}

class _CircularScore extends StatelessWidget {
  final String label;
  final int score;
  final Color color;
  final IconData icon;

  const _CircularScore({required this.label, required this.score, required this.color, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SizedBox(
          width: 70, height: 70,
          child: Stack(
            alignment: Alignment.center,
            children: [
              SizedBox(
                width: 70, height: 70,
                child: CircularProgressIndicator(
                  value: 1.0,
                  strokeWidth: 6,
                  color: context.surfaceVariantColor,
                ),
              ),
              SizedBox(
                width: 70, height: 70,
                child: ShaderMask(
                  shaderCallback: (bounds) => LinearGradient(
                    colors: [color.withValues(alpha: 0.6), color],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ).createShader(bounds),
                  child: CircularProgressIndicator(
                    value: score / 100,
                    strokeWidth: 6,
                    valueColor: AlwaysStoppedAnimation(context.textPrimary),
                    strokeCap: StrokeCap.round,
                  ),
                ),
              ),
              Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon, size: 16, color: color),
                  Text(
                    '$score',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: context.textPrimary),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: context.textSecondary)),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════
// PRICE CARD
// ═══════════════════════════════════════════════════════════

class _PriceCard extends ConsumerWidget {
  final ProductEntity product;
  final String country;
  final bool isDark;
  final Color cardBg;
  const _PriceCard({required this.product, required this.country, required this.isDark, required this.cardBg});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final countryInfo = SupportedCountries.countries[country];
    final localPrice = product.getPriceForCountry(country);
    final usPrice = product.getPriceForCountry('US');
    final price = localPrice ?? usPrice;
    final currency = localPrice != null ? (countryInfo?.currency ?? 'USD') : 'USD';

    if (price == null) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: cardBg,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.white.withValues(alpha: 0.06), blurRadius: 10)],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppTheme.primaryBlue.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.local_offer_outlined, color: AppTheme.primaryBlue, size: 22),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  localPrice == null ? 'Approx. price (USD)' : 'Price in $country',
                  style: const TextStyle(fontSize: 11, color: AppTheme.slate500),
                ),
                const SizedBox(height: 4),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
                    Text(
                      AppUtils.formatCurrency(price, currency),
                      style: TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.bold,
                        color: isDark ? context.textPrimary : context.textPrimary,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppTheme.scoreExcellent.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppTheme.scoreExcellent),
                      ),
                      child: const Text(
                        'Best Price',
                        style: TextStyle(
                          fontSize: 11,
                          color: AppTheme.scoreExcellent,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// DESCRIPTION CARD
// ═══════════════════════════════════════════════════════════

class _DescCard extends StatefulWidget {
  final String text;
  final Color cardBg;
  final bool isDark;
  const _DescCard({required this.text, required this.cardBg, required this.isDark});

  @override
  State<_DescCard> createState() => _DescCardState();
}

class _DescCardState extends State<_DescCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: widget.cardBg,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.white.withValues(alpha: 0.04), blurRadius: 8)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _CardHeader(icon: Icons.info_outline, label: context.l10n?.about ?? 'About', color: AppTheme.slate400),
          const SizedBox(height: 10),
          Text(
            widget.text,
            maxLines: _expanded ? null : 3,
            overflow: _expanded ? null : TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 14,
              height: 1.6,
              color: widget.isDark ? context.textSecondary : context.textSecondary,
            ),
          ),
          if (widget.text.length > 120)
            TextButton(
              onPressed: () => setState(() => _expanded = !_expanded),
              style: TextButton.styleFrom(padding: EdgeInsets.zero),
              child: Text(_expanded ? (context.l10n?.showLess ?? 'Show less') : (context.l10n?.readMore ?? 'Read more')),
            ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// PROS / CONS CARD
// ═══════════════════════════════════════════════════════════

class _ProsConsCard extends StatelessWidget {
  final List<String> pros, cons;
  final Color cardBg;
  const _ProsConsCard({required this.pros, required this.cons, required this.cardBg});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (pros.isNotEmpty) ...[
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: AppTheme.emerald500.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppTheme.emerald500.withValues(alpha: 0.1)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.check_circle_rounded, color: AppTheme.emerald500, size: 16),
                    SizedBox(width: 6),
                    Text(
                      (context.l10n?.advantages ?? 'Advantages').toUpperCase(),
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.2,
                        color: AppTheme.emerald500,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                ...pros.map((p) => _ProConItem(text: p, isPositive: true)),
              ],
            ),
          ),
          if (cons.isNotEmpty) const SizedBox(height: 10),
        ],
        if (cons.isNotEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: AppTheme.amber500.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppTheme.amber500.withValues(alpha: 0.1)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.warning_rounded, color: AppTheme.amber500, size: 16),
                    SizedBox(width: 6),
                    Text(
                      (context.l10n?.disadvantages ?? 'Disadvantages').toUpperCase(),
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.2,
                        color: AppTheme.amber500,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                ...cons.map((c) => _ProConItem(text: c, isPositive: false)),
              ],
            ),
          ),
      ],
    );
  }
}

class _ProConItem extends StatelessWidget {
  final String text;
  final bool isPositive;
  const _ProConItem({required this.text, required this.isPositive});

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context).languageCode;
    final displayText = (locale != 'en') ? spec_dict.translateSpec(text, locale) : text;
    return Padding(
      padding: const EdgeInsets.only(bottom: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            isPositive ? Icons.check_circle : Icons.cancel,
            size: 16,
            color: isPositive ? AppTheme.emerald500 : AppTheme.amber500,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              displayText,
              style: TextStyle(
                fontSize: 14,
                height: 1.4,
                color: isPositive ? AppTheme.emerald500 : AppTheme.amber500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// SPECS CARD (grouped)
// ═══════════════════════════════════════════════════════════

class _SpecsCard extends StatefulWidget {
  final Map<String, dynamic> specs;
  final Color cardBg;
  final bool isDark;
  const _SpecsCard({required this.specs, required this.cardBg, required this.isDark});

  @override
  State<_SpecsCard> createState() => _SpecsCardState();
}

class _SpecsCardState extends State<_SpecsCard> {
  late Map<String, bool> _expanded;

  // Icons per spec group — matches Firestore group names from admin panel
  IconData _getGroupIcon(String groupKey) {
    final k = groupKey.toLowerCase().replaceAll('_', ' ');
    if (k.contains('general') || k.contains('information')) return Icons.info_outline;
    if (k.contains('display') || k.contains('screen') || k.contains('ekran')) return Icons.phone_android;
    if (k.contains('processor') || k.contains('cpu') || k.contains('performance')) return Icons.memory;
    if (k.contains('graphic') || k.contains('gpu') || k.contains('video card')) return Icons.videogame_asset_outlined;
    if (k.contains('memory') || k.contains('ram')) return Icons.memory_outlined;
    if (k.contains('storage') || k.contains('disk') || k.contains('optical') || k.contains('ssd') || k.contains('hdd')) return Icons.storage_outlined;
    if (k.contains('battery') || k.contains('power')) return Icons.battery_charging_full_outlined;
    if (k.contains('camera') || k.contains('photo')) return Icons.camera_alt_outlined;
    if (k.contains('connect') || k.contains('network') || k.contains('wifi') || k.contains('bluetooth')) return Icons.wifi;
    if (k.contains('port') || k.contains('slot') || k.contains('interface') || k.contains('usb') || k.contains('expansion')) return Icons.usb_outlined;
    if (k.contains('audio') || k.contains('sound') || k.contains('speaker')) return Icons.headphones_outlined;
    if (k.contains('design') || k.contains('physical') || k.contains('dimension') || k.contains('build') || k.contains('chassis')) return Icons.design_services_outlined;
    if (k.contains('software') || k.contains('os') || k.contains('operating')) return Icons.apps_outlined;
    if (k.contains('cooling') || k.contains('fan') || k.contains('thermal')) return Icons.ac_unit_outlined;
    if (k.contains('lighting') || k.contains('rgb') || k.contains('led')) return Icons.lightbulb_outlined;
    if (k.contains('document') || k.contains('packaging') || k.contains('warranty') || k.contains('box')) return Icons.description_outlined;
    if (k.contains('function') || k.contains('feature')) return Icons.build_outlined;
    if (k.contains('security') || k.contains('sensor')) return Icons.security_outlined;
    if (k.contains('weight') || k.contains('material')) return Icons.fitness_center_outlined;
    if (k.contains('input') || k.contains('keyboard')) return Icons.keyboard_outlined;
    return Icons.tune;
  }

  Color _getGroupColor(String groupKey) {
    final k = groupKey.toLowerCase().replaceAll('_', ' ');
    if (k.contains('general') || k.contains('information')) return const Color(0xFF5C6BC0);
    if (k.contains('display') || k.contains('screen')) return const Color(0xFF2196F3);
    if (k.contains('processor') || k.contains('cpu') || k.contains('performance')) return const Color(0xFFFF5722);
    if (k.contains('graphic') || k.contains('gpu')) return const Color(0xFFE91E63);
    if (k.contains('memory') || k.contains('ram')) return const Color(0xFF3F51B5);
    if (k.contains('storage') || k.contains('disk') || k.contains('optical')) return const Color(0xFF607D8B);
    if (k.contains('battery') || k.contains('power')) return const Color(0xFF4CAF50);
    if (k.contains('camera')) return const Color(0xFF9C27B0);
    if (k.contains('connect') || k.contains('network')) return const Color(0xFF00BCD4);
    if (k.contains('port') || k.contains('slot') || k.contains('expansion')) return const Color(0xFF42A5F5);
    if (k.contains('audio') || k.contains('sound')) return const Color(0xFFE91E63);
    if (k.contains('design') || k.contains('physical') || k.contains('dimension') || k.contains('chassis')) return const Color(0xFF795548);
    if (k.contains('software') || k.contains('os')) return const Color(0xFF7E57C2);
    if (k.contains('cooling') || k.contains('fan')) return const Color(0xFF29B6F6);
    if (k.contains('lighting') || k.contains('rgb')) return const Color(0xFFFFC107);
    if (k.contains('document') || k.contains('packaging') || k.contains('warranty')) return const Color(0xFF78909C);
    if (k.contains('function') || k.contains('feature')) return const Color(0xFFAB47BC);
    if (k.contains('security') || k.contains('sensor')) return const Color(0xFFEC407A);
    return const Color(0xFF9E9E9E);
  }

  @override
  void initState() {
    super.initState();
    // Use Firestore data directly — all groups collapsed
    _expanded = {
      for (final key in widget.specs.keys) key: false,
    };
  }

  static String _formatKey(String key) {
    const acronyms = {
      'USB', 'HDMI', 'NFC', 'GPS', 'RAM', 'ROM', 'SSD', 'HDD', 'CPU', 'GPU',
      'VRAM', 'HDR', 'UHD', 'FHD', 'QHD', 'LCD', 'LED', 'OLED', 'IPS', 'TN',
      'VA', 'TDP', 'OS', 'LTE', 'UFS', 'SD', 'MIL', 'STD', 'VPN', 'PCIe',
      'NVMe', 'AI', 'API', 'BIOS', 'UEFI', 'VGA', 'DVI', 'DP', 'MIMO',
      'SIM', 'OIS', 'EIS', 'AF', 'OTG', 'IR', 'TPM', 'DC', 'AC',
      // common 2-letter
      'GB', 'TB', 'MB', 'GHz', 'MHz', 'Hz', 'WH', 'WA', 'UW',
    };

    String processWord(String w) {
      if (w.isEmpty) return '';
      // Split on hyphens to handle "type-c" → "Type-C", "wi-fi" → "Wi-Fi"
      if (w.contains('-')) {
        return w.split('-').map(processWord).join('-');
      }
      final upper = w.toUpperCase();
      if (acronyms.contains(upper)) return upper;
      return w[0].toUpperCase() + w.substring(1).toLowerCase();
    }

    return key.replaceAll('_', ' ').split(' ').map(processWord).join(' ');
  }

  /// Capitalize each word in a string (title case).
  String _titleCase(String s) {
    if (s.isEmpty) return s;
    return s.split(' ').map((w) {
      if (w.isEmpty) return w;
      return w[0].toUpperCase() + w.substring(1);
    }).join(' ');
  }

  String _localizedGroupName(BuildContext context, String key) {
    final l = context.l10n;
    if (l == null) return _formatKey(key);
    final k = key.toLowerCase().replaceAll('_', ' ').trim();
    final map = <String, String>{
      'general features': l.specGroupGeneral,
      'general': l.specGroupGeneral,
      'design & dimensions': l.specGroupDesign,
      'design': l.specGroupDesign,
      'dimensions': l.specGroupDesign,
      'basic hardware': l.specGroupHardware,
      'hardware': l.specGroupHardware,
      'camera': l.specGroupCamera,
      'battery': l.specGroupBattery,
      'network connections': l.specGroupNetwork,
      'network': l.specGroupNetwork,
      'display': l.specGroupDisplay,
      'storage': l.specGroupStorage,
      'connectivity': l.specGroupConnectivity,
      'software': l.specGroupSoftware,
      'audio': l.specGroupAudio,
      'security': l.specGroupSecurity,
      'performance': l.specGroupPerformance,
      'sensors': l.specGroupSensors,
      'features': l.specGroupFeatures,
      'processor': l.specGroupProcessor,
      'memory': l.specGroupMemory,
      'ports & interfaces': l.specGroupPorts,
      'ports': l.specGroupPorts,
      'graphics card': l.specGroupGpu,
      'gpu': l.specGroupGpu,
      'keyboard': l.specGroupKeyboard,
      'other': l.specGroupOther,
      'weight & dimensions': l.specGroupWeight,
      'weight': l.specGroupWeight,
      'screen': l.specGroupScreen,
      'video': l.specGroupVideo,
      'image': l.specGroupImage,
      'charging': l.specGroupCharging,
      'wireless': l.specGroupWireless,
      // Additional group names
      'storage & optical drive': l.specGroupStorageOptical,
      'battery & other': l.specGroupBatteryOther,
      'integrated graphics': l.specGroupIntegratedGpu,
      'external graphics': l.specGroupExternalGpu,
      'connection & interface': l.specGroupConnectionInterface,
      'connections & interfaces': l.specGroupConnectionInterface,
      'connection & interfaces': l.specGroupConnectionInterface,
      'body': l.specGroupBody,
      'main features': l.specGroupMainFeatures,
      'multimedia': l.specGroupMultimedia,
      'power': l.specGroupPower,
      'input/output': l.specGroupInputOutput,
      'input / output': l.specGroupInputOutput,
      'communications': l.specGroupCommunications,
      'expansion': l.specGroupExpansion,
      'expansion slots': l.specGroupExpansion,
      'operating system & software': l.specGroupSoftware,
      'sound': l.specGroupAudio,
      'optics': l.specGroupOptics,
      'lens': l.specGroupOptics,
      'physical durability': l.specGroupDurability,
      'durability': l.specGroupDurability,
      'screen&viewfinder': l.specGroupScreenViewfinder,
      'screen & viewfinder': l.specGroupScreenViewfinder,
      'viewfinder': l.specGroupScreenViewfinder,
      'exposure & shooting': l.specGroupExposureShooting,
      'exposure': l.specGroupExposureShooting,
      'shooting': l.specGroupExposureShooting,
      'flash': l.specGroupFlash,
      'other information': l.specGroupOtherInfo,
      'other': l.specGroupOther,
      'information': l.specGroupOtherInfo,
      'recording': l.specGroupRecording,
      'focus': l.specGroupFocus,
      'autofocus': l.specGroupFocus,
      // Mixed Turkish/English from scraper
      'diğer information': l.specGroupOtherInfo,
      'diğer bilgiler': l.specGroupOtherInfo,
      'diğer': l.specGroupOtherInfo,
      // Actual Firestore group names from products
      'general information': l.specGroupGeneral,
      'basic information': l.specGroupGeneral,
      'basic features': l.specGroupGeneral,
      'display/audio': l.specGroupDisplayAudio,
      'hardware/software': l.specGroupHardwareSoftware,
      'connections': l.specGroupConnections,
      'receivers': l.specGroupReceivers,
      'multimedia features': l.specGroupMultimedia,
      'energy and design': l.specGroupEnergyDesign,
      'dimensions & weight': l.specGroupDimensionsWeight,
      'documentation/software': l.specGroupSoftware,
      'general features': l.specGroupGeneral,
      'memory features': l.specGroupMemory,
      'memory (ram) features': l.specGroupMemory,
      'gpu': l.specGroupGpu,
      'technological infrastructure': l.specGroupTechInfra,
      'power and connections': l.specGroupPowerConnections,
      'network connections': l.specGroupNetwork,
      'wireless connections': l.specGroupWireless,
      'other connections': l.specGroupOtherConnections,
      'operating system': l.specGroupSoftware,
      'sensor': l.specGroupSensors,
      'storage features': l.specGroupStorage,
      'storage & battery': l.specGroupStorageBattery,
      'rear connections': l.specGroupRearConnections,
      'audio features': l.specGroupAudio,
      'cooling features': l.specGroupCooling,
      'neural processing unit (npu)': l.specGroupNpu,
      'npu': l.specGroupNpu,
      'technical information': l.specGroupTechnical,
      'eu product registration and energy label': l.specGroupEuLabel,
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
    // Try exact match
    final exact = map[k];
    if (exact != null) return exact;
    // Bidirectional dictionary fallback (EN↔TR)
    final locale = Localizations.localeOf(context).languageCode;
    final svc = SpecTranslationService.instance;
    if (svc.isLoaded) {
      if (locale == 'tr') {
        final full = svc.translate(k);
        if (full != k) return _titleCase(full);
        final wordLevel = svc.translateWords(k);
        if (wordLevel != k) return _titleCase(wordLevel);
      } else {
        final full = svc.translateToEn(k);
        if (full != k) return _titleCase(full);
        final wordLevel = svc.translateWordsToEn(k);
        if (wordLevel != k) return _titleCase(wordLevel);
      }
    }
    // Multilingual word-level dictionary (all languages)
    if (locale != 'en') {
      final translated = spec_dict.translateSpec(key, locale);
      if (translated.toLowerCase() != k) return _titleCase(translated);
    }
    return _formatKey(key);
  }

  /// Translate a spec name to the user's language.
  /// Uses exact-match first, then word-level dictionary fallback.
  String _localizedSpecName(BuildContext context, String key) {
    final l = context.l10n;
    if (l == null) return _formatKey(key);
    final k = key.toLowerCase().replaceAll('_', ' ').trim();
    final map = <String, String>{
      'display size': l.specDisplaySize,
      'screen size': l.specScreenSize,
      'screen technology': l.specScreenTechnology,
      'resolution': l.specResolution,
      'refresh rate': l.specRefreshRate,
      'brightness': l.specBrightness,
      'processor': l.specProcessor,
      'chipset': l.specChipset,
      'cpu': l.specCpu,
      'ram': l.specRam,
      'internal storage': l.specInternalStorage,
      'storage': l.specStorage,
      'expandable storage': l.specExpandableStorage,
      'battery capacity': l.specBatteryCapacity,
      'charging speed': l.specChargingSpeed,
      'wireless charging': l.specWirelessCharging,
      'operating system': l.specOperatingSystem,
      'os': l.specOs,
      'weight': l.specWeight,
      'dimensions': l.specDimensions,
      'thickness': l.specThickness,
      'height': l.specHeight,
      'width': l.specWidth,
      'main camera': l.specMainCamera,
      'front camera': l.specFrontCamera,
      'rear camera': l.specRearCamera,
      'video recording': l.specVideoRecording,
      'sim': l.specSim,
      'dual sim': l.specDualSim,
      'nfc': l.specNfc,
      'bluetooth': l.specBluetooth,
      'wi-fi': l.specWifi,
      'wifi': l.specWifi,
      'usb': l.specUsb,
      'headphone jack': l.specHeadphoneJack,
      'water resistance': l.specWaterResistance,
      'ip rating': l.specIpRating,
      'fingerprint sensor': l.specFingerprintSensor,
      'face recognition': l.specFaceRecognition,
      'color': l.specColor,
      'colors': l.specColors,
      'gpu': l.specGpu,
      'graphics': l.specGraphics,
      'release date': l.specReleaseDate,
      'price': l.specPrice,
      'network': l.specNetwork,
      '5g': l.spec5g,
      '4g / lte': l.spec4g,
      '4g': l.spec4g,
      'lte': l.spec4g,
      'frequency bands': l.specBand,
      'speaker': l.specSpeaker,
      'microphone': l.specMicrophone,
      'sensors': l.specSensor,
      'gyroscope': l.specGyroscope,
      'accelerometer': l.specAccelerometer,
      'proximity': l.specProximity,
      'compass': l.specCompass,
      'barometer': l.specBarometer,
      'gps': l.specGps,
      'memory type': l.specMemoryType,
      'memory speed': l.specMemorySpeed,
      'storage type': l.specStorageType,
      'display type': l.specDisplayType,
      'panel type': l.specPanelType,
      'response time': l.specResponseTime,
      'contrast ratio': l.specContrastRatio,
      'color gamut': l.specColorGamut,
      'hdr': l.specHdr,
      'touchscreen': l.specTouchscreen,
      'keyboard': l.specKeyboard,
      'trackpad': l.specTrackpad,
      'webcam': l.specWebcam,
      'ports': l.specPorts,
      'connectivity': l.specConnectivity,
      'wireless': l.specWireless,
      'battery life': l.specBatteryLife,
      'power supply': l.specPowerSupply,
      'tdp': l.specTdp,
      'cores': l.specCores,
      'threads': l.specThreads,
      'base clock': l.specBaseClock,
      'boost clock': l.specBoostClock,
      'cache': l.specCache,
      'architecture': l.specArchitecture,
      'process': l.specProcess,
      'vram': l.specVram,
      'memory bus': l.specMemoryBus,
      'cuda cores': l.specCudaCores,
      'stream processors': l.specStreamProcessors,
      'clock speed': l.specClockSpeed,
      'max resolution': l.specMaxResolution,
      'form factor': l.specFormFactor,
      'noise level': l.specNoiseLevel,
      'driver size': l.specDriverSize,
      'frequency response': l.specFrequencyResponse,
      'impedance': l.specImpedance,
      'active noise cancellation': l.specActiveNoiseCancellation,
      'microphone type': l.specMicrophoneType,
      'connection type': l.specConnectionType,
      'wireless range': l.specWirelessRange,
      'smart assistant': l.specSmartAssistant,
      'model': l.specModel,
      'brand': l.specBrand,
      'series': l.specSeries,
      'year': l.specYear,
      'warranty': l.specWarranty,
      // Group names as fallback
      'display': l.specGroupDisplay,
      'battery': l.specGroupBattery,
      'camera': l.specGroupCamera,
      'audio': l.specGroupAudio,
      'security': l.specGroupSecurity,
      'performance': l.specGroupPerformance,
      'memory': l.specGroupMemory,
      'software': l.specGroupSoftware,
    };
    // 1. Try exact match (fast path)
    final exact = map[k];
    if (exact != null) return exact;
    // 2. Scraper dictionary (7300+ entries, bidirectional EN↔TR)
    final locale = Localizations.localeOf(context).languageCode;
    final svc = SpecTranslationService.instance;
    if (svc.isLoaded) {
      if (locale == 'tr') {
        // EN→TR translation
        final full = svc.translate(k);
        if (full != k) return _titleCase(full);
        final wordLevel = svc.translateWords(k);
        if (wordLevel != k) return _titleCase(wordLevel);
      } else {
        // TR→EN translation (for leftover Turkish spec names)
        final full = svc.translateToEn(k);
        if (full != k) return _titleCase(full);
        final wordLevel = svc.translateWordsToEn(k);
        if (wordLevel != k) return _titleCase(wordLevel);
      }
    }
    // 3. Multilingual word-level dictionary (all languages)
    if (locale != 'en') {
      final translated = spec_dict.translateSpec(key, locale);
      if (translated.toLowerCase() != k) return _titleCase(translated);
    }
    return _formatKey(key);
  }

  /// Translate a multi-word spec name word-by-word using a dictionary.
  static String _translateWords(String input, Map<String, String> dict) {
    final parts = input.split(RegExp(r'(\s+)'));
    final translated = <String>[];
    bool anyTranslated = false;
    for (final part in parts) {
      final clean = part.trim().toLowerCase();
      if (clean.isEmpty || clean == '&' || clean == '/' || clean == '-') {
        if (clean == '&') translated.add('ve');
        else if (clean == '/') translated.add('/');
        else if (clean.isNotEmpty) translated.add(part);
        continue;
      }
      final tr = dict[clean];
      if (tr != null) {
        if (tr.isNotEmpty) translated.add(tr); // skip empty translations (stop words)
        anyTranslated = true;
      } else {
        // Keep original preserving acronyms via _formatKey single-word logic
        translated.add(_formatKey(part));
      }
    }
    if (!anyTranslated) {
      return _formatKey(input);
    }
    // Clean up any double spaces after dropping stop words
    return translated.join(' ').replaceAll(RegExp(r'\s{2,}'), ' ').trim();
  }

  /// Word-level dictionary for translating individual technical terms.
  static Map<String, String> _specWordDict(String locale) {
    switch (locale) {
      case 'tr': return _trWordDict;
      default: return const {};
    }
  }

  static const _trWordDict = <String, String>{
    // Core hardware
    'processor': 'İşlemci', 'cpu': 'İşlemci', 'chipset': 'Yonga Seti',
    'core': 'Çekirdek', 'cores': 'Çekirdek', 'thread': 'İş Parçacığı', 'threads': 'İş Parçacığı',
    'clock': 'Saat', 'frequency': 'Frekans', 'speed': 'Hız',
    'boost': 'Boost', 'turbo': 'Turbo', 'base': 'Temel',
    'efficiency': 'Verimlilik', 'performance': 'Performans',
    'transistor': 'Transistör', 'distance': 'Mesafe',
    'architecture': 'Mimari', 'process': 'Üretim Süreci',
    'cache': 'Önbellek', 'generation': 'Nesil',
    // Memory & Storage
    'memory': 'Bellek', 'ram': 'RAM', 'vram': 'VRAM',
    'storage': 'Depolama', 'internal': 'Dahili', 'external': 'Harici',
    'expandable': 'Genişletilebilir', 'capacity': 'Kapasite',
    'optical': 'Optik', 'drive': 'Sürücü', 'slot': 'Yuva', 'slots': 'Yuva',
    'bus': 'Veri Yolu', 'bandwidth': 'Bant Genişliği',
    'type': 'Türü', 'size': 'Boyut',
    // Display
    'display': 'Ekran', 'screen': 'Ekran', 'panel': 'Panel',
    'resolution': 'Çözünürlük', 'refresh': 'Yenileme', 'rate': 'Hızı',
    'brightness': 'Parlaklık', 'contrast': 'Kontrast', 'ratio': 'Oranı',
    'hdr': 'HDR', 'touchscreen': 'Dokunmatik Ekran',
    'color': 'Renk', 'colors': 'Renkler', 'gamut': 'Gamut',
    'response': 'Tepki', 'time': 'Süresi', 'nit': 'Nit', 'nits': 'Nit',
    'pixel': 'Piksel', 'density': 'Yoğunluk',
    'technology': 'Teknoloji',
    // Battery & Power
    'battery': 'Batarya', 'charging': 'Şarj', 'charger': 'Şarj Cihazı',
    'power': 'Güç', 'supply': 'Kaynağı', 'consumption': 'Tüketimi',
    'voltage': 'Gerilim', 'current': 'Akım', 'watt': 'Watt',
    'adapter': 'Adaptör', 'wireless': 'Kablosuz', 'wired': 'Kablolu',
    'fast': 'Hızlı', 'life': 'Ömrü',
    // Camera
    'camera': 'Kamera', 'lens': 'Lens', 'aperture': 'Diyafram',
    'zoom': 'Yakınlaştırma', 'optical zoom': 'Optik Yakınlaştırma',
    'digital': 'Dijital', 'flash': 'Flaş', 'autofocus': 'Otomatik Odaklama',
    'stabilization': 'Sabitleme', 'megapixel': 'Megapiksel',
    'front': 'Ön', 'rear': 'Arka', 'main': 'Ana',
    'video': 'Video', 'recording': 'Kayıt', 'photo': 'Fotoğraf',
    'image': 'Görüntü', 'sensor': 'Sensör', 'sensors': 'Sensörler',
    // Network & Connectivity
    'network': 'Ağ', 'connection': 'Bağlantı', 'connections': 'Bağlantılar',
    'connectivity': 'Bağlantı', 'interface': 'Arayüz', 'interfaces': 'Arayüzler',
    'bluetooth': 'Bluetooth', 'wifi': 'Wi-Fi', 'wi-fi': 'Wi-Fi',
    'nfc': 'NFC', 'gps': 'GPS', 'lte': 'LTE', '5g': '5G', '4g': '4G',
    'band': 'Bant', 'bands': 'Bantlar',
    'signal': 'Sinyal', 'range': 'Menzil', 'antenna': 'Anten',
    'sim': 'SIM', 'dual': 'Çift', 'single': 'Tekli',
    'port': 'Port', 'ports': 'Portlar', 'usb': 'USB',
    'hdmi': 'HDMI', 'jack': 'Jak', 'headphone': 'Kulaklık',
    'input': 'Giriş', 'output': 'Çıkış',
    // Audio
    'audio': 'Ses', 'sound': 'Ses', 'speaker': 'Hoparlör', 'speakers': 'Hoparlörler',
    'microphone': 'Mikrofon', 'stereo': 'Stereo', 'mono': 'Mono',
    'noise': 'Gürültü', 'cancellation': 'Önleme',
    'active': 'Aktif', 'passive': 'Pasif',
    'driver': 'Sürücü', 'impedance': 'Empedans',
    // GPU
    'graphics': 'Grafik', 'gpu': 'GPU', 'cuda': 'CUDA',
    'stream': 'Akış', 'processors': 'İşlemciler',
    'shader': 'Gölgelendirici', 'render': 'İşleme',
    // Design & Physical
    'design': 'Tasarım', 'body': 'Gövde', 'material': 'Malzeme',
    'weight': 'Ağırlık', 'height': 'Yükseklik', 'width': 'Genişlik',
    'depth': 'Derinlik', 'thickness': 'Kalınlık', 'length': 'Uzunluk',
    'dimensions': 'Boyutlar', 'form': 'Form', 'factor': 'Faktör',
    // Security & Sensors
    'security': 'Güvenlik', 'fingerprint': 'Parmak İzi',
    'face': 'Yüz', 'recognition': 'Tanıma',
    'gyroscope': 'Jiroskop', 'accelerometer': 'İvmeölçer',
    'proximity': 'Yakınlık', 'compass': 'Pusula', 'barometer': 'Barometre',
    // Software
    'operating': 'İşletim', 'system': 'Sistemi', 'software': 'Yazılım',
    'version': 'Sürüm', 'update': 'Güncelleme',
    // General descriptors
    'brand': 'Marka', 'model': 'Model', 'series': 'Seri',
    'name': 'Adı', 'number': 'Sayısı', 'count': 'Sayısı',
    'total': 'Toplam', 'max': 'Maksimum', 'maximum': 'Maksimum',
    'min': 'Minimum', 'minimum': 'Minimum',
    'standard': 'Standart', 'premium': 'Premium', 'pro': 'Pro',
    'advanced': 'Gelişmiş', 'basic': 'Temel',
    'high': 'Yüksek', 'low': 'Düşük', 'medium': 'Orta',
    'ultra': 'Ultra', 'super': 'Süper', 'mega': 'Mega',
    'smart': 'Akıllı', 'assistant': 'Asistan',
    'enabled': 'Etkin', 'disabled': 'Devre Dışı',
    'support': 'Destek', 'supported': 'Destekleniyor',
    'compatible': 'Uyumlu', 'compatibility': 'Uyumluluk',
    'protection': 'Koruma', 'resistance': 'Dayanıklılık',
    'water': 'Su', 'dust': 'Toz', 'ip': 'IP', 'rating': 'Derece',
    'warranty': 'Garanti', 'certification': 'Sertifika',
    'year': 'Yıl', 'date': 'Tarih', 'release': 'Çıkış',
    'details': 'Detayları', 'detail': 'Detay',
    'feature': 'Özellik', 'features': 'Özellikler',
    'other': 'Diğer', 'integrated': 'Dahili',
    'level': 'Seviye', 'mode': 'Mod', 'channel': 'Kanal',
    'module': 'Modül', 'chip': 'Çip', 'card': 'Kart',
    'format': 'Format', 'protocol': 'Protokol',
    'multi': 'Çoklu', 'triple': 'Üçlü', 'quad': 'Dörtlü',
    'angle': 'Açı', 'wide': 'Geniş', 'narrow': 'Dar',
    'top': 'Üst', 'bottom': 'Alt', 'side': 'Yan',
    'left': 'Sol', 'right': 'Sağ', 'under': 'Alt',
    'back': 'Arka',
    // Connector words that appear in mixed spec names
    'to': 'Karşı', 'for': 'İçin', 'with': 'ile', 'of': '',
    'and': 'Ve', 'in': 'İçinde', 'the': '', 'a': '',
    'against': 'Karşı',
    // Missing hardware terms
    'impacts': 'Darbeler', 'impact': 'Darbe',
    'shock': 'Şok', 'drop': 'Düşme', 'vibration': 'Titreşim',
    'delivery': 'Teslimatı', 'data': 'Veri',
    'transfer': 'Aktarım',
    'expansion': 'Genişletme',
    'reader': 'Okuyucu', 'writer': 'Yazıcı',
    'hub': 'Hub', 'dock': 'Dock',
    'scanner': 'Tarayıcı', 'lock': 'Kilit',
    'keyboard': 'Klavye', 'backlit': 'Aydınlatmalı',
    'backlight': 'Arka Işık', 'illumination': 'Aydınlatma',
    'trackpad': 'İzleme Paneli', 'touchpad': 'Dokunmatik Yüzey',
    'pointer': 'İşaretçi', 'stylus': 'Kalem',
    'pen': 'Kalem', 'touch': 'Dokunmatik',
    'multi-touch': 'Çok Dokunuşlu',
    'fan': 'Fan', 'cooling': 'Soğutma', 'heat': 'Isı',
    'pipe': 'Boru', 'thermal': 'Termal',
    'silent': 'Sessiz',
    'virtual': 'Sanal',
    'built-in': 'Dahili',
    'frame': 'Çerçeve',
    'lid': 'Kapak', 'hinge': 'Menteşe',
    'surface': 'Yüzey', 'coating': 'Kaplama',
    'texture': 'Doku', 'finish': 'Yüzey',
  };

  int _sectionPriority(String key) {
    final k = key.toLowerCase().replaceAll('_', ' ');

    // 1. BASIC INFO — Answers "What is this?", establishes context
    if (k.contains('basic info') || k.contains('general info') ||
        k.contains('information') || k.contains('release') ||
        k.contains('general') || k.contains('overview')) return 1;

    // 2. DESIGN — First visual impression; what the user feels when seeing the product
    if (k.contains('design') || k.contains('physical') ||
        k.contains('dimension') || k.contains('build') ||
        k.contains('chassis') || k.contains('weight') ||
        k.contains('material') || k.contains('color')) return 2;

    // 3. DISPLAY — The surface the user interacts with the most
    if (k.contains('display') || k.contains('screen') ||
        k.contains('monitor') || k.contains('panel')) return 3;

    // 4. PERFORMANCE / PROCESSOR — "How fast is it?" — Most frequently asked
    if (k.contains('basic hard') || k.contains('processor') ||
        k.contains('cpu') || k.contains('chipset') ||
        k.contains('performance') || k.contains('computing')) return 4;

    // 5. MEMORY / RAM — Extension of performance
    if (k.contains('memory') || k.contains('ram')) return 5;

    // 6. STORAGE — Capacity
    if (k.contains('storage') || k.contains('disk') ||
        k.contains('ssd') || k.contains('hdd') ||
        k.contains('optical') || k.contains('flash')) return 6;

    // 7. CAMERA — Strongest purchase motivator in 2024
    if (k.contains('camera') || k.contains('photo') ||
        k.contains('imaging') || k.contains('optic')) return 7;

    // 8. BATTERY — A constant concern in daily use
    if (k.contains('battery') || k.contains('power') ||
        k.contains('charging') || k.contains('endurance')) return 8;

    // 9. GPU / GRAPHICS — Gaming and visual performance
    if (k.contains('graphic') || k.contains('gpu') ||
        k.contains('video card') || k.contains('vga')) return 9;

    // 10. NETWORK / CELLULAR — Connectivity (4G/5G matters)
    if (k.contains('network') || k.contains('cellular') ||
        k.contains('sim') || k.contains('lte') || k.contains('5g') ||
        k.contains('connect') && !k.contains('wireless')) return 10;

    // 11. WIRELESS — WiFi, BT, NFC
    if (k.contains('wireless') || k.contains('wifi') ||
        k.contains('bluetooth') || k.contains('nfc') ||
        k.contains('gps') || k.contains('navigation')) return 11;

    // 12. OS / SOFTWARE — Ecosystem and platform
    if (k.contains('operating') || k.contains('software') ||
        k.contains(' os') || k.contains('system')) return 12;

    // 13. AUDIO / MULTIMEDIA — Media consumption
    if (k.contains('audio') || k.contains('sound') ||
        k.contains('speaker') || k.contains('multimedia') ||
        k.contains('music')) return 13;

    // 14. FEATURES / SECURITY / SENSORS — Additional features
    if (k.contains('feature') || k.contains('function') ||
        k.contains('security') || k.contains('sensor') ||
        k.contains('biometric') || k.contains('fingerprint')) return 14;

    // 15. PORTS / CONNECTIONS — Physical connections
    if (k.contains('port') || k.contains('slot') ||
        k.contains('usb') || k.contains('interface') ||
        k.contains('expansion') || k.contains('other connection') ||
        k.contains('connector')) return 15;

    // 16. COOLING — Desktop/Laptop specific
    if (k.contains('cooling') || k.contains('fan') ||
        k.contains('thermal') || k.contains('heat')) return 16;

    // 17. INPUT — Keyboard, mouse
    if (k.contains('input') || k.contains('keyboard') ||
        k.contains('mouse') || k.contains('touchpad')) return 17;

    // 18. PACKAGING / WARRANTY — Box contents, warranty
    if (k.contains('document') || k.contains('packaging') ||
        k.contains('warranty') || k.contains('box') ||
        k.contains('contents') || k.contains('lighting') ||
        k.contains('rgb') || k.contains('led')) return 18;

    return 99;
  }

  @override
  Widget build(BuildContext context) {
    final sortedEntries = widget.specs.entries.toList()
      ..sort((a, b) => _sectionPriority(a.key).compareTo(_sectionPriority(b.key)));
    final specs = Map.fromEntries(sortedEntries);

    return Container(
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.dividerColor),
        boxShadow: [BoxShadow(color: Colors.white.withValues(alpha: 0.04), blurRadius: 8)],
      ),
      clipBehavior: Clip.hardEdge,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            decoration: BoxDecoration(
              border: Border(bottom: BorderSide(color: context.dividerColor)),
            ),
            child: Row(
              children: [
                _CardHeader(icon: Icons.settings_input_component, label: context.l10n?.specs ?? 'Specifications', color: AppTheme.primaryBlue),
                const Spacer(),
                Text(
                  '${specs.length} ${context.l10n?.groups ?? 'groups'}',
                  style: const TextStyle(fontSize: 12, color: AppTheme.slate500),
                ),
              ],
            ),
          ),
          ...specs.entries.map((entry) {
            final groupKey = entry.key;
            final value = entry.value;
            final isExpanded = _expanded[groupKey] ?? false;

            // ── If value is a nested map → expandable group ──
            if (value is Map && value.isNotEmpty) {
              final icon = _getGroupIcon(groupKey);
              final color = _getGroupColor(groupKey);

              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Group header — clean white with colored icon
                  Material(
                    color: context.surfaceVariantColor,
                    child: InkWell(
                      onTap: () => setState(() => _expanded[groupKey] = !isExpanded),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        child: Row(
                          children: [
                            Container(
                              width: 32, height: 32,
                              decoration: BoxDecoration(
                                color: color.withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Icon(icon, size: 16, color: color),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                _localizedGroupName(context, groupKey),
                                style: TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 14,
                                  color: context.textPrimary,
                                ),
                                textAlign: TextAlign.center,
                              ),
                            ),
                            Text(
                              '${value.length} ${context.l10n?.specsCount ?? 'specs'}',
                              style: const TextStyle(fontSize: 11, color: AppTheme.slate400),
                            ),
                            const SizedBox(width: 6),
                            AnimatedRotation(
                              turns: isExpanded ? 0.5 : 0,
                              duration: const Duration(milliseconds: 200),
                              child: const Icon(Icons.expand_more, size: 18, color: AppTheme.slate400),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  if (isExpanded)
                    Builder(builder: (context) {
                      int rowIdx = 0;
                      return Column(
                        children: value.entries.expand<Widget>((sub) {
                          final subLabel = _localizedSpecName(context, sub.key.toString());
                          final subVal = sub.value;
                          // Handle nested maps within a group
                          if (subVal is Map && subVal.isNotEmpty) {
                            return subVal.entries.map((inner) {
                              final innerVal = inner.value?.toString() ?? '';
                              if (innerVal.isEmpty || innerVal == '?' || innerVal == 'null' || innerVal == '{}' || innerVal == '[]') {
                                return const SizedBox.shrink();
                              }
                              final odd = rowIdx++ % 2 == 1;
                              return _SpecRow(
                                label: _localizedSpecName(context, inner.key.toString()),
                                value: innerVal,
                                isDark: widget.isDark,
                                accent: color,
                                isOdd: odd,
                              );
                            });
                          }
                          final subValue = subVal?.toString() ?? '';
                          if (subValue.isEmpty || subValue == '?' || subValue == 'null' || subValue == '{}' || subValue == '[]') {
                            return [const SizedBox.shrink()];
                          }
                          final odd = rowIdx++ % 2 == 1;
                          return [_SpecRow(
                            label: subLabel,
                            value: subValue,
                            isDark: widget.isDark,
                            accent: color,
                            isOdd: odd,
                          )];
                        }).toList(),
                      );
                    }),
                ],
              );
            }

            // ── Flat key-value (fallback) ──
            final flatValue = value?.toString() ?? '';
            if (flatValue.isEmpty || flatValue == '?' || flatValue == 'null' || flatValue == '{}' || flatValue == '[]') {
              return const SizedBox.shrink();
            }
            return _SpecRow(
              label: _localizedSpecName(context, groupKey),
              value: flatValue,
              isDark: widget.isDark,
              accent: AppTheme.primaryBlue,
              isOdd: false,
            );
          }),
          const SizedBox(height: 4),
        ],
      ),
    );
  }
}

class _SpecRow extends StatelessWidget {
  final String label, value;
  final bool isDark;
  final Color accent;
  final bool isOdd;
  const _SpecRow({required this.label, required this.value, required this.isDark, required this.accent, this.isOdd = false});

  /// Capitalize first letter of each word but preserve acronyms (USB, HDMI...).
  static String _applyValueTitleCase(String s) {
    if (s.isEmpty) return s;
    return s.split(' ').map((w) {
      if (w.isEmpty) return w;
      // Numbers and technical codes (start with digit): leave as is
      if (RegExp(r'^[\d\W]').hasMatch(w)) return w;
      return w[0].toUpperCase() + w.substring(1);
    }).join(' ');
  }

  String _localizedValue(BuildContext context, String val) {
    final l = context.l10n;
    if (l == null) return val;
    final v = val.trim().toLowerCase();
    // Handle "No." variant (with period)
    if (v == 'no.' || v == 'no') {
      return l.specValNo;
    }
    // Common boolean/status values
    const enToKey = {
      'yes': 'yes',
      'available': 'available',
      'not available': 'notAvailable',
      'unknown': 'unknown',
      'none': 'none',
      'supported': 'supported',
      'not supported': 'notSupported',
      'included': 'included',
      'not included': 'notIncluded',
      'wireless': 'wireless',
      'wired': 'wired',
      'both': 'both',
      'plastic': 'plastic',
      'metal': 'metal',
      'glass': 'glass',
      'aluminum': 'aluminum',
      'aluminium': 'aluminum',
      'ceramic': 'ceramic',
      'leather': 'leather',
      'silicon': 'silicon',
      'silicone': 'silicon',
      'front': 'front',
      'rear': 'rear',
      'side': 'side',
      'under display': 'underDisplay',
      // Additional values
      'rechargeable': 'rechargeable',
      'non-rechargeable': 'nonRechargeable',
      'lithium': 'lithium',
      'lithium-ion': 'lithiumIon',
      'lithium ion': 'lithiumIon',
      'lithium polymer': 'lithiumPolymer',
      'li-ion': 'lithiumIon',
      'li-po': 'lithiumPolymer',
      'true': 'yes',
      'false': 'no',
      'n/a': 'notAvailable',
      'na': 'notAvailable',
      'enabled': 'enabled',
      'disabled': 'disabled',
      'auto': 'auto',
      'manual': 'manual',
      'optical': 'optical',
      'digital': 'digital',
      'hybrid': 'hybrid',
      'stereo': 'stereo',
      'mono': 'mono',
      'built-in': 'builtIn',
      'removable': 'removable',
      'non-removable': 'nonRemovable',
      'waterproof': 'waterproof',
      'water resistant': 'waterResistant',
      'dustproof': 'dustproof',
      'shockproof': 'shockproof',
      'touchscreen': 'touchscreen',
      'foldable': 'foldable',
      'rotating': 'rotating',
      'fixed': 'fixed',
      'adjustable': 'adjustable',
      'automatic': 'automatic',
    };
    final trMap = {
      'yes': l.specValYes,
      'no': l.specValNo,
      'available': l.specValAvailable,
      'notAvailable': l.specValNotAvailable,
      'unknown': l.specValUnknown,
      'none': l.specValNone,
      'supported': l.specValSupported,
      'notSupported': l.specValNotSupported,
      'included': l.specValIncluded,
      'notIncluded': l.specValNotIncluded,
      'wireless': l.specValWireless,
      'wired': l.specValWired,
      'both': l.specValBoth,
      'plastic': l.specValPlastic,
      'metal': l.specValMetal,
      'glass': l.specValGlass,
      'aluminum': l.specValAluminum,
      'ceramic': l.specValCeramic,
      'leather': l.specValLeather,
      'silicon': l.specValSilicon,
      'front': l.specValFront,
      'rear': l.specValRear,
      'side': l.specValSide,
      'underDisplay': l.specValUnderDisplay,
      // Additional values
      'rechargeable': l.specValRechargeable,
      'nonRechargeable': l.specValNonRechargeable,
      'lithium': l.specValLithium,
      'lithiumIon': l.specValLithiumIon,
      'lithiumPolymer': l.specValLithiumPolymer,
      'enabled': l.specValEnabled,
      'disabled': l.specValDisabled,
      'auto': l.specValAuto,
      'manual': l.specValManual,
      'optical': l.specValOptical,
      'digital': l.specValDigital,
      'hybrid': l.specValHybrid,
      'stereo': l.specValStereo,
      'mono': l.specValMono,
      'builtIn': l.specValBuiltIn,
      'removable': l.specValRemovable,
      'nonRemovable': l.specValNonRemovable,
      'waterproof': l.specValWaterproof,
      'waterResistant': l.specValWaterResistant,
      'dustproof': l.specValDustproof,
      'shockproof': l.specValShockproof,
      'touchscreen': l.specValTouchscreen,
      'foldable': l.specValFoldable,
      'rotating': l.specValRotating,
      'fixed': l.specValFixed,
      'adjustable': l.specValAdjustable,
      'automatic': l.specValAutomatic,
    };
    final key = enToKey[v];
    if (key != null && trMap[key] != null) return trMap[key]!;
    // Bidirectional dictionary fallback for spec values
    final locale = Localizations.localeOf(context).languageCode;
    final svc = SpecTranslationService.instance;
    if (svc.isLoaded) {
      if (locale == 'tr') {
        // 1. Full-phrase exact match
        final full = svc.translate(v);
        if (full != v) return _applyValueTitleCase(full);
        // 2. Word-by-word (handles multi-word values like "side mounted")
        final words = svc.translateWords(v);
        if (words != v) return _applyValueTitleCase(words);
        // 3. Hyphen-split: "side-mounted" → translate "side" + "mounted" separately
        if (v.contains('-')) {
          final parts = v.split('-');
          final translated = parts.map((p) {
            final t = svc.translate(p.trim());
            return t != p.trim() ? t : p.trim();
          }).join(' ');
          if (translated != v.replaceAll('-', ' ')) return _applyValueTitleCase(translated);
        }
      } else {
        final full = svc.translateToEn(v);
        if (full != v) return _applyValueTitleCase(full);
      }
    }
    // Multilingual word-level dictionary fallback
    if (locale != 'en') {
      final translated = spec_dict.translateSpecValue(val, locale);
      if (translated != val) return translated;
    }
    // Capitalize first letter of value for any language
    return _applyValueTitleCase(val);
  }

  @override
  Widget build(BuildContext context) {
    // Skip empty, null-like, or serialized object values
    final trimmed = value.trim();
    if (trimmed.isEmpty || trimmed == '?' || trimmed == 'null' || 
        trimmed == '{}' || trimmed == '[]' ||
        (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      return const SizedBox.shrink();
    }
    final localizedVal = _localizedValue(context, value);
    // Split long multi-value strings into per-line display
    final valueWidget = _buildValueWidget(context, localizedVal);

    return Column(
      children: [
        Container(
          color: isOdd ? context.surfaceColor : context.surfaceVariantColor,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                flex: 4,
                child: Text(
                  label,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppTheme.slate500,
                  ),
                ),
              ),
              Expanded(
                flex: 5,
                child: valueWidget,
              ),
            ],
          ),
        ),
        Divider(color: context.dividerColor, height: 1),
      ],
    );
  }

  /// Translate common English spec values to the active locale language.
  String _localizedSpecValue(BuildContext context, String val) {
    final locale = Localizations.localeOf(context).languageCode;
    if (locale == 'en') return val;
    final v = val.trim().toLowerCase();
    switch (locale) {
      case 'tr':
        const trMap = {
          'yes': 'Var', 'no': 'Yok', 'true': 'Evet', 'false': 'Hayır',
          'available': 'Mevcut', 'not available': 'Mevcut Değil',
          'supported': 'Destekleniyor', 'not supported': 'Desteklenmiyor',
          'included': 'Dahil', 'not included': 'Dahil Değil',
          'active': 'Aktif', 'passive': 'Pasif',
          'wired': 'Kablolu', 'wireless': 'Kablosuz',
          'touch': 'Dokunmatik', 'mechanical': 'Mekanik',
          'mono': 'Mono', 'stereo': 'Stereo',
          'front': 'Ön', 'rear': 'Arka', 'back': 'Arka',
          'left': 'Sol', 'right': 'Sağ',
          'black': 'Siyah', 'white': 'Beyaz', 'silver': 'Gümüş',
          'gold': 'Altın', 'blue': 'Mavi', 'red': 'Kırmızı',
          'green': 'Yeşil', 'gray': 'Gri', 'grey': 'Gri',
        };
        return trMap[v] ?? val;
      case 'de':
        const deMap = {'yes': 'Ja', 'no': 'Nein', 'available': 'Verfügbar', 'not available': 'Nicht verfügbar'};
        return deMap[v] ?? val;
      case 'fr':
        const frMap = {'yes': 'Oui', 'no': 'Non', 'available': 'Disponible', 'not available': 'Non disponible'};
        return frMap[v] ?? val;
      case 'es':
        const esMap = {'yes': 'Sí', 'no': 'No', 'available': 'Disponible', 'not available': 'No disponible'};
        return esMap[v] ?? val;
      default:
        return val;
    }
  }

  Widget _buildValueWidget(BuildContext context, String rawVal) {
    // Translate common value words to locale language
    final val = _localizedSpecValue(context, rawVal);
    // Detect multi-value strings (comma/semicolon/newline separated)
    // Lower thresholds so short multi-values like "Android, iOS" also split
    List<String>? parts;
    if (val.contains('\n')) {
      parts = val.split('\n').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
    } else if (val.contains(',') && val.length > 8) {
      parts = val.split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
    } else if (val.contains(';') && val.length > 8) {
      parts = val.split(';').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
    } else if (val.contains(' / ') && val.length > 8) {
      parts = val.split(' / ').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
    }

    if (parts != null && parts.length >= 2) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: parts.map((p) => Padding(
          padding: const EdgeInsets.only(bottom: 2),
          child: Text(
            '• $p',
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w500,
              color: context.textPrimary,
              height: 1.4,
            ),
            textAlign: TextAlign.end,
            softWrap: true,
          ),
        )).toList(),
      );
    }

    return Text(
      val,
      style: TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.w500,
        color: context.textPrimary,
      ),
      textAlign: TextAlign.end,
      softWrap: true,
      overflow: TextOverflow.visible,
    );
  }
}

// ═══════════════════════════════════════════════════════════
// TAGS ROW
// ═══════════════════════════════════════════════════════════

class _TagsRow extends StatelessWidget {
  final List<String> tags;
  const _TagsRow({required this.tags});

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: tags.map((t) => Chip(
        label: Text('#$t', style: const TextStyle(fontSize: 12)),
        backgroundColor: AppTheme.primaryBlue.withValues(alpha: 0.08),
        side: const BorderSide(color: Colors.transparent),
        padding: EdgeInsets.zero,
        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
      )).toList(),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// BOTTOM BAR (legacy — kept for reference)
// ═══════════════════════════════════════════════════════════

class _BottomBar extends StatelessWidget {
  final ProductEntity product;
  final WidgetRef ref;
  final BuildContext context;
  const _BottomBar({required this.product, required this.ref, required this.context});

  @override
  Widget build(BuildContext _) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppTheme.primaryBlue, AppTheme.accentTeal],
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: AppTheme.primaryBlue.withValues(alpha: 0.4),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () async {
            final result = await addToCollection(ref, product.id);
            if (!context.mounted) return;
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(
              content: Text(result.when(
                success: (_) => context.l10n?.addedToCollection ?? '✅ Added to collection!',
                failure: (e) => e.message,
              )),
              behavior: SnackBarBehavior.floating,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ));
          },
          child: Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.shopping_bag_outlined, color: context.surfaceVariantColor, size: 20),
                SizedBox(width: 10),
                Text(
                  'I Bought This',
                  style: TextStyle(
                    color: context.surfaceVariantColor,
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// NEW BOTTOM BAR — View Deals
// ═══════════════════════════════════════════════════════════

class _NewBottomBar extends ConsumerWidget {
  final ProductEntity product;
  const _NewBottomBar({required this.product});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tabController = DefaultTabController.of(context);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 30),
      child: Container(
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(100),
          border: Border.all(color: context.dividerColor, width: 1.5),
          boxShadow: [
            BoxShadow(
              color: Colors.white.withValues(alpha: 0.08),
              blurRadius: 20,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            // Details → Specs tab
            Expanded(
              child: InkWell(
                onTap: () => tabController.animateTo(0),
                borderRadius: BorderRadius.circular(50),
                child: Container(
                  height: 52,
                  decoration: BoxDecoration(
                    color: Colors.transparent,
                    borderRadius: BorderRadius.circular(50),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.list_alt_rounded, color: AppTheme.slate500, size: 20),
                      const SizedBox(height: 2),
                      Text(
                        'Details',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.slate600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            // Reviews tab
            Expanded(
              child: InkWell(
                onTap: () => tabController.animateTo(1),
                borderRadius: BorderRadius.circular(50),
                child: Container(
                  height: 52,
                  decoration: BoxDecoration(
                    color: Colors.transparent,
                    borderRadius: BorderRadius.circular(50),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.rate_review_outlined, color: AppTheme.slate500, size: 20),
                      const SizedBox(height: 2),
                      Text(
                        context.l10n?.reviews ?? 'Reviews',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.slate600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// STICKY TAB BAR DELEGATE
// ═══════════════════════════════════════════════════════════

class _StickyTabBarDelegate extends SliverPersistentHeaderDelegate {
  @override
  double get minExtent => 64;

  @override
  double get maxExtent => 64;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Container(
      color: context.backgroundColor,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: Container(
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(28),
          boxShadow: [
            BoxShadow(
              color: Colors.white.withValues(alpha: 0.1),
              blurRadius: 16,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: TabBar(
          indicator: BoxDecoration(
            color: AppTheme.primaryBlue,
            borderRadius: BorderRadius.circular(24),
          ),
          indicatorSize: TabBarIndicatorSize.tab,
          labelColor: context.surfaceVariantColor,
          unselectedLabelColor: AppTheme.slate500,
          labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12),
          unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w500, fontSize: 12),
          dividerColor: Colors.transparent,
          tabs: [
            Tab(text: context.l10n?.specsTab ?? 'Specs'),
            Tab(text: context.l10n?.reviews ?? 'Reviews'),
            Tab(text: context.l10n?.similarTab ?? 'Similar'),
            Tab(text: context.l10n?.proTab ?? 'Premium'),
          ],
        ),
      ),
    );
  }

  @override
  bool shouldRebuild(_StickyTabBarDelegate oldDelegate) => false;
}

// ═══════════════════════════════════════════════════════════
// NAME + BRAND + PRICE COMBINED SECTION
// ═══════════════════════════════════════════════════════════

class _TitlePriceSection extends StatelessWidget {
  final ProductEntity product;
  final String country;
  const _TitlePriceSection({required this.product, required this.country});

  @override
  Widget build(BuildContext context) {
    final countryInfo = SupportedCountries.countries[country];
    final localPrice = product.getPriceForCountry(country);
    final usPrice = product.getPriceForCountry('US');
    final price = localPrice ?? usPrice;
    final currency = localPrice != null ? (countryInfo?.currency ?? 'USD') : 'USD';

    return Container(
      width: double.infinity,
      color: context.backgroundColor,
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (product.brand != null && product.brand!.isNotEmpty)
            Text(
              product.brand!.toUpperCase(),
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: AppTheme.primaryBlue,
                letterSpacing: 1.4,
              ),
            ),
          const SizedBox(height: 4),
          Text(
            product.name,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: context.textPrimary,
              height: 1.25,
              letterSpacing: -0.2,
            ),
          ),
          if (price != null) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                  decoration: BoxDecoration(
                    gradient: AppTheme.primaryGradient,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    AppUtils.formatCurrency(price, currency),
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: context.surfaceVariantColor,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// KEY SPECS HIGHLIGHT — Category-specific quick overview
// ═══════════════════════════════════════════════════════════

class _KeySpecsHighlight extends StatelessWidget {
  final ProductEntity product;
  const _KeySpecsHighlight({required this.product});

  String? _find(List<String> keywords) {
    // First pass: product.specs (flat map)
    final specs = product.specs;
    for (final kw in keywords) {
      final kwLow = kw.toLowerCase();
      for (final entry in specs.entries) {
        if (entry.key.toLowerCase().contains(kwLow)) {
          final val = entry.value?.toString().trim() ?? '';
          if (val.isNotEmpty && val != '0' && val != '-' && val.toLowerCase() != 'n/a') {
            return val;
          }
        }
      }
    }
    // Second pass: product.specSections (grouped map) for better coverage
    final sections = product.specSections;
    for (final kw in keywords) {
      final kwLow = kw.toLowerCase();
      for (final section in sections.values) {
        if (section is Map) {
          for (final entry in section.entries) {
            if (entry.key.toString().toLowerCase().contains(kwLow)) {
              final val = entry.value?.toString().trim() ?? '';
              if (val.isNotEmpty && val != '0' && val != '-' && val.toLowerCase() != 'n/a') {
                return val;
              }
            }
          }
        }
      }
    }
    return null;
  }

  List<(String, List<String>)> get _specDefs {
    final sub = product.subcategory.toLowerCase();

    if (sub.contains('smartphone') || sub.contains('phone')) {
      return [
        ('Screen Size',    ['screen size', 'display size', 'ekran boyutu']),
        ('RAM',            ['ram', 'memory size', 'bellek (ram)', 'bellek']),
        ('Storage',        ['internal storage', 'storage capacity', 'dahili depolama']),
        ('Battery',        ['battery capacity', 'batarya kapasitesi']),
        ('Main Camera',    ['main camera', 'rear camera', 'camera resolution', 'kamera']),
        ('Front Camera',   ['front camera', 'selfie camera', 'on kamera']),
        ('Processor',      ['processor', 'chipset', 'cpu model', 'cpu name', 'islemci']),
        ('CPU Cores',      ['cpu core', 'core count', 'number of core']),
        ('CPU Frequency',  ['cpu frequenc', 'clock speed', 'cpu speed']),
        ('Screen Tech',    ['screen tech', 'display tech', 'panel type', 'ekran teknolojisi']),
        ('Resolution',     ['screen resolution', 'display resolution', 'ekran cozunurlugu']),
        ('Pixel Density',  ['pixel density', 'ppi']),
        ('5G',             ['5g']),
        ('NFC',            ['nfc']),
        ('GPS',            ['gps']),
        ('Bluetooth',      ['bluetooth']),
        ('Fast Charge',    ['fast charg', 'charging power', 'hizli sarj']),
        ('USB Type',       ['usb type', 'usb connector', 'usb version']),
        ('Water Rating',   ['water resist', 'ip rating', 'ipx', 'suya dayaniklilik']),
        ('Fingerprint',    ['fingerprint', 'parmak izi']),
        ('OS',             ['operating system', 'android version']),
        ('Weight',         ['weight', 'agirlik']),
        ('SIM',            ['sim count', 'hat sayisi', 'sim card']),
      ];
    }

    if (sub.contains('tablet')) {
      return [
        ('Screen Size',    ['screen size', 'display size', 'ekran boyutu']),
        ('RAM',            ['ram', 'memory size', 'bellek']),
        ('Storage',        ['internal storage', 'storage capacity', 'dahili depolama']),
        ('Memory Card',    ['memory card', 'microsd', 'expandable storage']),
        ('Battery',        ['battery capacity', 'batarya kapasitesi']),
        ('Processor',      ['processor', 'chipset', 'cpu model', 'islemci']),
        ('CPU Cores',      ['cpu core', 'core count', 'number of core']),
        ('CPU Frequency',  ['cpu frequenc', 'clock speed']),
        ('Screen Tech',    ['screen tech', 'display tech', 'panel type', 'ekran teknolojisi']),
        ('Resolution',     ['screen resolution', 'display resolution']),
        ('Pixel Density',  ['pixel density', 'ppi']),
        ('Screen Area',    ['screen area', 'display area', 'ekran alani']),
        ('WiFi',           ['wifi', 'wi-fi', '802.11']),
        ('Bluetooth',      ['bluetooth']),
        ('GPS',            ['gps']),
        ('NFC',            ['nfc']),
        ('USB Type',       ['usb type', 'usb connector']),
        ('Weight',         ['weight', 'agirlik']),
        ('OS',             ['operating system']),
      ];
    }

    if (sub.contains('laptop') || sub.contains('notebook')) {
      return [
        ('Processor',      ['processor model', 'cpu model', 'cpu name', 'islemci modeli']),
        ('Processor Gen',  ['processor generation', 'cpu generation', 'nesil']),
        ('Base Freq',      ['base frequenc', 'base clock', 'temel frekans']),
        ('CPU Cores',      ['cpu core', 'core count', 'number of core']),
        ('TDP',            ['tdp', 'thermal design power']),
        ('RAM',            ['ram', 'memory size', 'bellek']),
        ('Storage',        ['ssd', 'storage size', 'hard disk', 'nvme']),
        ('Screen Size',    ['screen size', 'display size']),
        ('Screen Tech',    ['screen tech', 'display tech', 'panel type']),
        ('Resolution',     ['screen resolution', 'display resolution']),
        ('Refresh Rate',   ['refresh rate', 'hz']),
        ('GPU',            ['gpu', 'graphics card', 'video card', 'ekran karti']),
        ('Battery',        ['battery capacity', 'batarya']),
        ('OS',             ['operating system']),
        ('WiFi',           ['wifi', 'wi-fi', '802.11']),
        ('Bluetooth',      ['bluetooth']),
        ('USB Type',       ['usb type', 'usb-c', 'thunderbolt']),
        ('Weight',         ['weight', 'agirlik']),
      ];
    }

    if (sub.contains('desktop')) {
      return [
        ('Processor',      ['processor model', 'cpu model', 'cpu name']),
        ('Processor Gen',  ['processor generation', 'cpu generation', 'generation']),
        ('Base Freq',      ['base frequenc', 'base clock']),
        ('CPU Cores',      ['cpu core', 'core count', 'number of core']),
        ('TDP',            ['tdp', 'thermal design power']),
        ('RAM',            ['ram', 'memory size', 'bellek']),
        ('Storage',        ['storage', 'disk', 'ssd', 'hdd']),
        ('GPU',            ['gpu', 'graphics']),
        ('Case Type',      ['case type', 'chassis type', 'kasa tipi']),
        ('Product Series', ['product series', 'series', 'model series']),
        ('OS',             ['operating system']),
        ('Display Feat',   ['display features', 'display body ratio', 'screen to body']),
      ];
    }

    if (sub.contains('cpu') || sub.contains('processor')) {
      return [
        ('Model',          ['processor model', 'cpu model', 'cpu name']),
        ('Series',         ['series', 'product line']),
        ('Cores',          ['core count', 'number of core', ' cores']),
        ('Threads',        ['thread count', 'threads']),
        ('Base Clock',     ['base frequenc', 'base clock', 'base speed']),
        ('Boost Clock',    ['boost frequenc', 'max clock', 'turbo']),
        ('TDP',            ['tdp', 'thermal design power']),
        ('Socket',         ['socket', 'platform']),
        ('L3 Cache',       ['l3 cache', 'cache']),
        ('Process',        ['process node', 'manufacturing process', 'nm']),
      ];
    }

    if (sub.contains('gpu') || sub.contains('graphic')) {
      return [
        ('GPU Model',      ['gpu model', 'product name', 'chip']),
        ('VRAM',           ['vram', 'video memory', 'memory size']),
        ('Memory Type',    ['memory type', 'vram type']),
        ('Memory Bus',     ['memory bus', 'bus width']),
        ('Base Clock',     ['base clock', 'core clock']),
        ('Boost Clock',    ['boost clock', 'max clock']),
        ('TDP',            ['tdp', 'power consumption']),
        ('Interface',      ['interface', 'pcie']),
        ('Outputs',        ['output', 'display output', 'hdmi']),
      ];
    }

    if (sub.contains('ram') || (sub.contains('memory') && !sub.contains('card'))) {
      return [
        ('Capacity',       ['capacity', 'size']),
        ('Speed',          ['speed', 'frequency', 'mhz']),
        ('Type',           ['type', 'ddr']),
        ('CAS Latency',    ['cas', 'latency']),
        ('Voltage',        ['voltage']),
        ('Form Factor',    ['form factor', 'dimm', 'so-dimm']),
      ];
    }

    if (sub.contains('ssd') || sub.contains('hdd') || sub.contains('storage') || sub.contains('hard')) {
      return [
        ('Capacity',       ['capacity', 'storage size']),
        ('Interface',      ['interface', 'pcie', 'sata', 'nvme']),
        ('Read Speed',     ['read speed', 'sequential read']),
        ('Write Speed',    ['write speed', 'sequential write']),
        ('Form Factor',    ['form factor']),
        ('NAND Type',      ['nand', 'flash type']),
      ];
    }

    if (sub.contains('monitor')) {
      return [
        ('Screen Size',    ['screen size', 'display size']),
        ('Resolution',     ['resolution']),
        ('Panel Type',     ['panel type', 'panel']),
        ('Refresh Rate',   ['refresh rate', 'hz']),
        ('Response Time',  ['response time']),
        ('HDR',            ['hdr']),
        ('Brightness',     ['brightness', 'nits', 'cd/m']),
        ('Color Gamut',    ['color gamut', 'srgb', 'dci-p3']),
        ('Sync Tech',      ['freesync', 'g-sync', 'adaptive sync']),
        ('Connectivity',   ['hdmi', 'displayport', 'usb-c']),
      ];
    }

    if (sub.contains('tv') || sub.contains('television')) {
      return [
        ('Screen Size',    ['screen size', 'display size']),
        ('Resolution',     ['resolution']),
        ('Panel Type',     ['panel type']),
        ('HDR',            ['hdr']),
        ('Smart TV',       ['smart tv', 'smart']),
        ('Refresh Rate',   ['refresh rate']),
        ('HDMI Ports',     ['hdmi']),
        ('Brightness',     ['brightness', 'nits']),
        ('Viewing Angle',  ['viewing angle']),
        ('Dolby',          ['dolby']),
      ];
    }

    if (sub.contains('headphone') || sub.contains('earphone') || sub.contains('earbuds')) {
      return [
        ('Type',           ['type', 'form factor', 'design']),
        ('Connectivity',   ['connectivity', 'bluetooth', 'wireless']),
        ('BT Version',     ['bluetooth version', 'bt version']),
        ('Battery Life',   ['battery life', 'playback time', 'battery']),
        ('Charge Time',    ['charge time', 'charging time']),
        ('Noise Cancel',   ['noise cancell', 'anc', 'active noise']),
        ('Driver Size',    ['driver size', 'driver']),
        ('Frequency',      ['frequency response']),
        ('Impedance',      ['impedance', 'ohm']),
        ('Microphone',     ['microphone', 'mic']),
        ('Water Rating',   ['water resist', 'ip rating', 'ipx']),
        ('Weight',         ['weight']),
      ];
    }

    if (sub.contains('speaker') || sub.contains('soundbar')) {
      return [
        ('Power',          ['power output', 'rms', 'watt']),
        ('Connectivity',   ['bluetooth', 'connectivity', 'wireless']),
        ('BT Version',     ['bluetooth version']),
        ('Battery',        ['battery', 'playback time']),
        ('Channels',       ['channel', 'subwoofer', '2.1', '5.1']),
        ('Frequency',      ['frequency response']),
        ('Water Rating',   ['water resist', 'ip rating', 'ipx']),
        ('Weight',         ['weight']),
      ];
    }

    if (sub.contains('smartwatch') || sub.contains('watch')) {
      return [
        ('Display Size',   ['display size', 'screen size']),
        ('Display Tech',   ['display tech', 'screen tech', 'panel type']),
        ('Battery Life',   ['battery life', 'battery']),
        ('OS',             ['os', 'operating system', 'watch os']),
        ('Processor',      ['processor', 'chip', 'cpu']),
        ('RAM',            ['ram', 'memory']),
        ('Storage',        ['storage', 'internal storage']),
        ('GPS',            ['gps']),
        ('Heart Rate',     ['heart rate']),
        ('SpO2',           ['spo2', 'blood oxygen']),
        ('ECG',            ['ecg', 'electrocardiogram']),
        ('Water Rating',   ['water resist', 'ip rating', 'atm']),
        ('NFC',            ['nfc']),
        ('Weight',         ['weight']),
      ];
    }

    if (sub.contains('camera')) {
      return [
        ('Sensor',         ['sensor type', 'sensor size', 'sensor']),
        ('Resolution',     ['resolution', 'megapixel', 'mp']),
        ('Aperture',       ['aperture', 'f/']),
        ('Focal Length',   ['focal length', 'lens']),
        ('ISO',            ['iso']),
        ('Shutter Speed',  ['shutter speed']),
        ('Video',          ['video resolution', 'video recording', '4k']),
        ('Stabilization',  ['stabilization', 'ois', 'ibis']),
        ('AF System',      ['autofocus', 'af system']),
        ('Battery',        ['battery', 'shots per charge']),
        ('Weight',         ['weight']),
      ];
    }

    if (sub.contains('motherboard')) {
      return [
        ('Chipset',        ['chipset']),
        ('Socket',         ['socket', 'cpu socket']),
        ('Form Factor',    ['form factor', 'atx']),
        ('Memory Slots',   ['memory slot', 'dimm']),
        ('Max RAM',        ['max memory', 'maximum ram']),
        ('Memory Type',    ['memory type', 'ddr']),
        ('PCIe Slots',     ['pcie x16', 'pcie slot']),
        ('M.2 Slots',      ['m.2', 'm2 slot']),
        ('USB Ports',      ['usb', 'usb 3']),
        ('Network',        ['network', 'ethernet', '2.5g']),
        ('WiFi',           ['wifi', 'wi-fi', '802.11']),
        ('Bluetooth',      ['bluetooth']),
      ];
    }

    if (sub.contains('psu') || sub.contains('power supply')) {
      return [
        ('Wattage',        ['wattage', 'power output', 'watt']),
        ('Efficiency',     ['efficiency', '80 plus', '80plus']),
        ('Modular',        ['modular']),
        ('Form Factor',    ['form factor', 'atx']),
        ('Fan Size',       ['fan size']),
        ('PFC',            ['pfc', 'power factor']),
      ];
    }

    if (sub.contains('cooler') || sub.contains('cooling')) {
      return [
        ('Type',           ['type', 'cooler type']),
        ('TDP Support',    ['tdp support', 'max tdp']),
        ('Fan Size',       ['fan size', 'fan diameter']),
        ('Fan Speed',      ['fan speed', 'rpm']),
        ('Noise Level',    ['noise', 'dba', 'db level']),
        ('Socket Support', ['socket', 'compatibility']),
        ('Dimensions',     ['dimension', 'height', 'size']),
        ('Weight',         ['weight']),
      ];
    }

    if (sub.contains('keyboard')) {
      return [
        ('Switch Type',    ['switch type', 'switch']),
        ('Connectivity',   ['connectivity', 'wireless', 'bluetooth']),
        ('BT Version',     ['bluetooth version']),
        ('Layout',         ['layout', 'form factor']),
        ('Backlight',      ['backlight', 'rgb', 'led']),
        ('Battery',        ['battery', 'battery life']),
        ('Interface',      ['interface', 'usb']),
        ('N-Key',          ['rollover', 'nkro', 'anti-ghosting']),
        ('Weight',         ['weight']),
      ];
    }

    if (sub.contains('mouse') || sub.contains('mice')) {
      return [
        ('DPI',            ['dpi', 'sensitivity', 'cpi']),
        ('Polling Rate',   ['polling rate', 'hz']),
        ('Connectivity',   ['connectivity', 'wireless', 'bluetooth']),
        ('Sensor',         ['sensor type', 'sensor model', 'sensor']),
        ('Buttons',        ['button', 'programmable']),
        ('Battery',        ['battery', 'battery life']),
        ('RGB',            ['rgb', 'lighting']),
        ('Weight',         ['weight']),
      ];
    }

    if (sub.contains('router')) {
      return [
        ('WiFi Standard',  ['wifi standard', 'wifi 6', 'wifi 5', '802.11']),
        ('Max Speed',      ['max speed', 'throughput', 'mbps', 'gbps']),
        ('Frequency',      ['frequency band', 'dual band', 'tri band']),
        ('LAN Ports',      ['lan port', 'ethernet port', 'wan']),
        ('Antennas',       ['antenna']),
        ('Processor',      ['processor', 'cpu']),
        ('RAM',            ['ram', 'memory']),
        ('USB Port',       ['usb port']),
        ('Security',       ['security', 'wpa', 'encryption']),
      ];
    }

    if (sub.contains('console') || sub.contains('gaming')) {
      return [
        ('Processor',      ['processor', 'cpu']),
        ('GPU',            ['gpu', 'graphics']),
        ('RAM',            ['ram', 'memory']),
        ('Storage',        ['storage', 'ssd']),
        ('Resolution',     ['resolution', '4k', '8k']),
        ('Optical Drive',  ['optical', 'blu-ray', 'disc']),
        ('WiFi',           ['wifi', 'wi-fi']),
        ('Bluetooth',      ['bluetooth']),
        ('USB Ports',      ['usb', 'usb port']),
      ];
    }

    if (sub.contains('projector')) {
      return [
        ('Resolution',     ['resolution']),
        ('Brightness',     ['brightness', 'lumens', 'ansi']),
        ('Contrast Ratio', ['contrast']),
        ('Throw Ratio',    ['throw ratio']),
        ('Lamp Life',      ['lamp life', 'lamp hour']),
        ('Connectivity',   ['hdmi', 'connectivity']),
      ];
    }

    return const [];
  }

  @override
  Widget build(BuildContext context) {
    final found = <(String label, String value)>[];

    // Priority 1: Use keySpecs from Firestore (Key Specs from epey.com)
    if (product.keySpecs.isNotEmpty) {
      for (final entry in product.keySpecs.entries) {
        final val = entry.value.trim();
        if (val.isNotEmpty && val != '0' && val != '-' && val.toLowerCase() != 'n/a') {
          found.add((entry.key, val));
        }
      }
    }

    // Priority 2: Category keyword matching from specs/specSections
    if (found.isEmpty) {
      final defs = _specDefs;
      for (final (label, keywords) in defs) {
        final val = _find(keywords);
        if (val != null) found.add((label, val));
      }
    }

    // Fallback: first 9 flat specs
    if (found.isEmpty) {
      final entries = product.specs.entries
          .where((e) => e.value?.toString().trim().isNotEmpty == true)
          .take(9);
      for (final e in entries) {
        found.add((e.key, e.value.toString()));
      }
    }

    if (found.isEmpty) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: context.dividerColor),
        boxShadow: [
          BoxShadow(
            color: Colors.white.withValues(alpha: 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
            child: Row(
              children: [
                Container(
                  width: 28, height: 28,
                  decoration: BoxDecoration(
                    color: AppTheme.primaryBlue.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.bolt_rounded,
                      color: AppTheme.primaryBlue, size: 16),
                ),
                const SizedBox(width: 10),
                Text(
                  'KEY SPECS',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: context.textTertiaryColor,
                    letterSpacing: 1.2,
                  ),
                ),
              ],
            ),
          ),
          Divider(height: 1, thickness: 1, color: context.dividerColor),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Column(
              children: found.asMap().entries.map((entry) {
                final isOdd = entry.key.isOdd;
                final spec = entry.value;
                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
                  decoration: BoxDecoration(
                    color: isOdd ? context.surfaceColor.withValues(alpha: 0.5) : Colors.transparent,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        flex: 2,
                        child: Text(
                          spec.$1,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12,
                            fontWeight: FontWeight.w500,
                            color: context.textSecondary,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        flex: 3,
                        child: Text(
                          spec.$2,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: context.textPrimary,
                          ),
                          textAlign: TextAlign.end,
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
          ),
        ],
      ),
    );
  }
}

class _VariantsSection extends ConsumerWidget {
  final ProductEntity product;
  const _VariantsSection({required this.product});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final variantsAsync = ref.watch(productVariantsProvider(product));
    return variantsAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (variants) {
        if (variants.isEmpty) return const SizedBox.shrink();
        final all = [product, ...variants]..sort((a, b) => a.name.compareTo(b.name));

        // Deduplicate by storage label — keep current product or first match
        final seen = <String>{};
        final unique = <ProductEntity>[];
        for (final v in all) {
          final label = _storageLabel(v);
          if (seen.contains(label)) {
            // If the duplicate is the current product, replace the existing one
            if (v.id == product.id) {
              unique.removeWhere((u) => _storageLabel(u) == label);
              unique.add(v);
            }
            continue;
          }
          seen.add(label);
          unique.add(v);
        }
        if (unique.length <= 1) return const SizedBox.shrink();

        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(
            color: context.surfaceVariantColor,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: context.dividerColor),
            boxShadow: [
              BoxShadow(
                color: Colors.white.withValues(alpha: 0.04),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
                child: Center(
                  child: Text(
                    'AVAILABLE MODELS',
                    style: TextStyle(
                      fontSize: 11, fontWeight: FontWeight.w700,
                      color: context.textTertiaryColor, letterSpacing: 1.2,
                    ),
                  ),
                ),
              ),
              Divider(height: 1, thickness: 1, color: context.dividerColor),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  alignment: WrapAlignment.center,
                  children: unique.map((v) => _VariantChip(
                    product: v,
                    isSelected: v.id == product.id,
                  )).toList(),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  /// Extract storage-only label for deduplication
  static String _storageLabel(ProductEntity p) {
    return _VariantChip._extractStorageOnly(p);
  }
}

class _VariantChip extends StatelessWidget {
  final ProductEntity product;
  final bool isSelected;
  const _VariantChip({required this.product, required this.isSelected});

  /// Extract storage-only value, ignoring RAM differences.
  /// For "16 GB / 2048 GB" → "2048 GB" (largest = storage)
  /// For "128 GB" → "128 GB"
  static String _extractStorageOnly(ProductEntity p) {
    // Find all GB/TB matches in product name
    final allMatches = RegExp(r'\b(\d+)\s*(TB|GB)\b', caseSensitive: false)
        .allMatches(p.name)
        .toList();

    if (allMatches.length >= 2) {
      // Multiple matches (e.g. "16 GB / 2048 GB") → pick largest = storage
      int bestVal = 0;
      String bestLabel = '';
      for (final m in allMatches) {
        final num = int.tryParse(m.group(1)!) ?? 0;
        final unit = m.group(2)!.toUpperCase();
        final mb = unit == 'TB' ? num * 1024 : num;
        if (mb > bestVal) {
          bestVal = mb;
          bestLabel = '$num $unit';
        }
      }
      if (bestLabel.isNotEmpty) return bestLabel;
    }
    if (allMatches.length == 1) {
      return allMatches.first.group(0)!.trim().toUpperCase();
    }

    // Try RAM/storage combo (e.g. "8/256") → extract storage part
    final comboMatch = RegExp(r'\b(\d+)/(\d+)\b').firstMatch(p.name);
    if (comboMatch != null) {
      return '${comboMatch.group(2)} GB';
    }

    // Try extracting from specs
    final specStorage = _extractStorageFromSpecsStatic(p);
    if (specStorage != null) return specStorage;

    // Fallback: differentiating suffix
    final parts = p.name.trim().split(' ');
    if (parts.length >= 2) return '${parts[parts.length - 2]} ${parts.last}';
    return parts.last;
  }

  static String? _extractStorageFromSpecsStatic(ProductEntity p) {
    final storageRegex = RegExp(r'(\d+)\s*(GB|TB)', caseSensitive: false);
    for (final entry in p.keySpecs.entries) {
      final key = entry.key.toLowerCase();
      if (key.contains('storage') || key.contains('capacity') || key.contains('rom') || key.contains('internal')) {
        final m = storageRegex.firstMatch(entry.value);
        if (m != null) return '${m.group(1)} ${m.group(2)!.toUpperCase()}';
      }
    }
    for (final section in p.specSections.entries) {
      final sKey = section.key.toLowerCase();
      if ((sKey.contains('storage') || sKey.contains('memory')) && section.value is Map) {
        for (final spec in (section.value as Map).entries) {
          final sk = spec.key.toString().toLowerCase();
          if (sk.contains('internal') || sk.contains('storage') || sk.contains('capacity')) {
            final m = storageRegex.firstMatch(spec.value.toString());
            if (m != null) return '${m.group(1)} ${m.group(2)!.toUpperCase()}';
          }
        }
      }
    }
    return null;
  }

  String get _variantLabel => _extractStorageOnly(product);

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: isSelected ? null : () {
        context.push('/product/${product.id}');
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected
              ? AppTheme.primaryBlue
              : context.surfaceColor,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isSelected ? AppTheme.primaryBlue : context.dividerColor,
            width: 1.5,
          ),
          boxShadow: isSelected
              ? [BoxShadow(color: AppTheme.primaryBlue.withValues(alpha: 0.25), blurRadius: 6, offset: const Offset(0, 2))]
              : null,
        ),
        child: Text(
          _variantLabel,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: isSelected ? context.textPrimary : Color(0xFF334155),
          ),
        ),
      ),
    );
  }
}

class _SpecChip extends StatelessWidget {
  final String label;
  final String value;
  const _SpecChip({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final display = value.length > 18 ? '${value.substring(0, 16)}\u2026' : value;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 9,
              color: context.textSecondary,
              fontWeight: FontWeight.w500,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(
            display,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: context.textPrimary,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

class _OverviewContent extends ConsumerWidget {
  final ProductEntity product;
  final String country;
  final bool isDark;
  const _OverviewContent({required this.product, required this.country, required this.isDark});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cardBg = context.surfaceVariantColor;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _VariantsSection(product: product),
          if (product.description.isNotEmpty) ...[
            _DescCard(text: product.description, cardBg: cardBg, isDark: isDark),
            const SizedBox(height: 12),
          ],
          if (product.pros.isNotEmpty || product.cons.isNotEmpty) ...[
            _ProsConsCard(pros: product.pros, cons: product.cons, cardBg: cardBg),
            const SizedBox(height: 12),
          ],
          if (product.tags.isNotEmpty) ...[
            _TagsRow(tags: product.tags),
            const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }
}

class _OverviewTab extends ConsumerWidget {
  final ProductEntity product;
  final String country;
  final bool isDark;
  const _OverviewTab({required this.product, required this.country, required this.isDark});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cardBg = context.surfaceVariantColor;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
      children: [
        _KeySpecsHighlight(product: product),
        const SizedBox(height: 12),
        _VariantsSection(product: product),
        if (product.description.isNotEmpty) ...[
          _DescCard(text: product.description, cardBg: cardBg, isDark: isDark),
          const SizedBox(height: 12),
        ],
        if (product.pros.isNotEmpty || product.cons.isNotEmpty) ...[
          _ProsConsCard(pros: product.pros, cons: product.cons, cardBg: cardBg),
          const SizedBox(height: 12),
        ],
        if (product.tags.isNotEmpty) _TagsRow(tags: product.tags),
        const SizedBox(height: 16),
        _SimilarProductsSection(product: product, isDark: isDark),
      ],
    );
  }
}

class _ReviewsTab extends ConsumerWidget {
  final ProductEntity product;
  final bool isDark;
  const _ReviewsTab({required this.product, required this.isDark});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cardBg = context.surfaceVariantColor;
    final compareState = ref.watch(comparisonStateProvider);
    final isInCompare = compareState.selectedProductIds.contains(product.id);

    return ListView(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).padding.bottom + 40),
      children: [
        // ── YouTube Reviews (social proof) ──
        _YouTubeReviewsCard(product: product, isDark: isDark, cardBg: cardBg),
        const SizedBox(height: 12),

        // ── User Reviews (community — at bottom for engagement) ──
        _UserReviewsCard(product: product, isDark: isDark, cardBg: cardBg),
        const SizedBox(height: 16),
      ],
    );
  }

}

// ═══════════════════════════════════════════════════════════
// SIMILAR PRODUCTS TAB
// ═══════════════════════════════════════════════════════════

class _SimilarProductsTab extends ConsumerWidget {
  final ProductEntity product;
  final bool isDark;
  const _SimilarProductsTab({required this.product, required this.isDark});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).padding.bottom + 40),
      children: [
        _SimilarProductsSection(product: product, isDark: isDark),
        const SizedBox(height: 24),
        _TrendingProductsSection(currentProduct: product, isDark: isDark),
      ],
    );
  }
}

class _QuickActionBtn extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isActive;
  final Gradient? gradient;
  final Color? borderColor;
  final Color? textColor;
  final VoidCallback onTap;

  const _QuickActionBtn({
    required this.icon,
    required this.label,
    required this.onTap,
    this.isActive = false,
    this.gradient,
    this.borderColor,
    this.textColor,
  });

  @override
  Widget build(BuildContext context) {
    final fg = textColor ?? (isActive ? AppTheme.primaryBlue : AppTheme.slate600);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 44,
        decoration: BoxDecoration(
          gradient: gradient,
          color: gradient == null
              ? (isActive ? AppTheme.primaryBlue.withValues(alpha: 0.08) : context.surfaceVariantColor)
              : null,
          borderRadius: BorderRadius.circular(12),
          border: gradient == null
              ? Border.all(color: borderColor ?? (isActive ? AppTheme.primaryBlue : context.dividerColor), width: 1.5)
              : null,
          boxShadow: [BoxShadow(
            color: (gradient != null ? AppTheme.primaryBlue : Colors.black).withValues(alpha: gradient != null ? 0.2 : 0.04),
            blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: gradient != null ? context.textPrimary : fg, size: 17),
            const SizedBox(width: 5),
            Text(label, style: TextStyle(
              fontSize: 12, fontWeight: FontWeight.w700,
              color: gradient != null ? Colors.white : fg)),
          ],
        ),
      ),
    );
  }
}

// ── Price Comparison Sheet ───────────────────────────────────────────
void _showPriceComparison(BuildContext context, ProductEntity product) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => _PriceComparisonSheet(product: product),
  );
}

class _PriceComparisonSheet extends StatefulWidget {
  final ProductEntity product;
  const _PriceComparisonSheet({required this.product});

  @override
  State<_PriceComparisonSheet> createState() => _PriceComparisonSheetState();
}

class _PriceComparisonSheetState extends State<_PriceComparisonSheet> {
  bool _loading = true;
  List<_PricePoint> _priceHistory = [];
  double _currentPrice = 0;
  double _lowestPrice = 0;
  double _highestPrice = 0;
  String _currency = '\$';

  @override
  void initState() {
    super.initState();
    _generatePriceData();
  }

  void _generatePriceData() {
    // Generate realistic price trend data based on tech score and category
    final basePrice = _estimateBasePrice();
    final random = DateTime.now().millisecondsSinceEpoch;
    final points = <_PricePoint>[];
    final now = DateTime.now();

    for (int i = 11; i >= 0; i--) {
      final month = DateTime(now.year, now.month - i, 1);
      // Products generally decrease in price over time with some fluctuation
      final ageFactor = 1.0 - (i * 0.008); // slight decrease over time
      final seasonFactor = (month.month == 11 || month.month == 12) ? 0.88 : // Black Friday/Holiday sales
                           (month.month == 1) ? 0.92 : // New Year sales
                           (month.month == 6 || month.month == 7) ? 0.94 : 1.0; // Summer sales
      final noise = ((random ~/ (i + 1)) % 8 - 4) / 100.0; // ±4% noise
      final price = basePrice * ageFactor * seasonFactor * (1 + noise);
      points.add(_PricePoint(month, price.roundToDouble()));
    }

    _priceHistory = points;
    _currentPrice = points.last.price;
    _lowestPrice = points.map((p) => p.price).reduce((a, b) => a < b ? a : b);
    _highestPrice = points.map((p) => p.price).reduce((a, b) => a > b ? a : b);

    setState(() => _loading = false);
  }

  double _estimateBasePrice() {
    final cat = widget.product.category.toLowerCase();
    final score = widget.product.techScore;
    if (cat.contains('phone') || cat.contains('smartphone')) {
      return 300 + (score * 12);
    } else if (cat.contains('laptop') || cat.contains('notebook')) {
      return 500 + (score * 15);
    } else if (cat.contains('monitor') || cat.contains('display')) {
      return 200 + (score * 6);
    } else if (cat.contains('tv')) {
      return 400 + (score * 10);
    } else if (cat.contains('headphone') || cat.contains('earphone') || cat.contains('audio')) {
      return 50 + (score * 3);
    } else if (cat.contains('watch') || cat.contains('wearable')) {
      return 100 + (score * 4);
    } else if (cat.contains('tablet')) {
      return 250 + (score * 8);
    } else if (cat.contains('camera')) {
      return 400 + (score * 15);
    } else if (cat.contains('cpu') || cat.contains('processor')) {
      return 100 + (score * 5);
    } else if (cat.contains('gpu') || cat.contains('graphic')) {
      return 200 + (score * 8);
    }
    return 200 + (score * 5);
  }

  @override
  Widget build(BuildContext context) {
    final priceDiff = _currentPrice - _lowestPrice;
    final isNearLow = priceDiff <= (_highestPrice - _lowestPrice) * 0.2;

    return Container(
      height: MediaQuery.of(context).size.height * 0.65,
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      child: Column(children: [
        const SizedBox(height: 8),
        Container(width: 40, height: 4,
          decoration: BoxDecoration(
            color: context.dividerColor,
            borderRadius: BorderRadius.circular(2))),
        const SizedBox(height: 16),

        // Header
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Row(children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AppTheme.scoreExcellent, AppTheme.scoreExcellent]),
                borderRadius: BorderRadius.circular(12)),
              child: Icon(Icons.trending_up_rounded,
                color: context.surfaceVariantColor, size: 20)),
            const SizedBox(width: 12),
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(context.l10n?.priceTrends ?? 'Price Trends', style: GoogleFonts.plusJakartaSans(
                  fontSize: 18, fontWeight: FontWeight.w800)),
                Text(widget.product.name,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12, color: context.textSecondary),
                  maxLines: 1, overflow: TextOverflow.ellipsis),
              ])),
          ])),
        const SizedBox(height: 16),

        if (_loading)
          const Expanded(child: Center(child: CircularProgressIndicator(strokeWidth: 2)))
        else ...[
          // Price summary cards
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(children: [
              Expanded(child: _PriceStat(
                label: context.l10n?.current ?? 'Current', value: '$_currency${_currentPrice.toInt()}',
                color: context.textPrimary, bgColor: context.textPrimary)),
              const SizedBox(width: 8),
              Expanded(child: _PriceStat(
                label: context.l10n?.lowest ?? 'Lowest', value: '$_currency${_lowestPrice.toInt()}',
                color: AppTheme.scoreExcellent, bgColor: AppTheme.scoreExcellent.withValues(alpha: 0.08))),
              const SizedBox(width: 8),
              Expanded(child: _PriceStat(
                label: context.l10n?.highest ?? 'Highest', value: '$_currency${_highestPrice.toInt()}',
                color: AppTheme.warning, bgColor: AppTheme.warning.withValues(alpha: 0.08))),
            ]),
          ),
          const SizedBox(height: 16),

          // Chart
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
              child: CustomPaint(
                painter: _PriceChartPainter(
                  points: _priceHistory,
                  lowestPrice: _lowestPrice,
                  highestPrice: _highestPrice,
                  dividerColor: context.dividerColor,
                  textSecondaryColor: context.textSecondary,
                  textPrimaryColor: context.textPrimary,
                ),
                child: const SizedBox.expand(),
              ),
            ),
          ),

          // Buy recommendation
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: isNearLow
                    ? AppTheme.scoreExcellent.withValues(alpha: 0.08)
                    : AppTheme.amber500.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: isNearLow
                    ? AppTheme.scoreExcellent.withValues(alpha: 0.2)
                    : AppTheme.amber500.withValues(alpha: 0.2))),
              child: Row(children: [
                Icon(isNearLow ? Icons.thumb_up_rounded : Icons.schedule_rounded,
                  size: 20,
                  color: isNearLow ? AppTheme.scoreExcellent : AppTheme.amber500),
                const SizedBox(width: 10),
                Expanded(child: Text(
                  isNearLow
                      ? 'Good time to buy — price is near its lowest!'
                      : 'Price is above average. Consider waiting for a deal.',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 13, fontWeight: FontWeight.w600,
                    color: isNearLow ? AppTheme.scoreExcellent : AppTheme.amber500),
                )),
              ]),
            ),
          ),

        ],
      ]),
    );
  }
}

class _PriceStat extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  final Color bgColor;
  const _PriceStat({required this.label, required this.value, required this.color, required this.bgColor});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(12)),
      child: Column(children: [
        Text(label, style: GoogleFonts.plusJakartaSans(
          fontSize: 10, fontWeight: FontWeight.w500, color: context.textSecondary)),
        const SizedBox(height: 4),
        Text(value, style: GoogleFonts.plusJakartaSans(
          fontSize: 16, fontWeight: FontWeight.w800, color: color)),
      ]),
    );
  }
}

class _PricePoint {
  final DateTime date;
  final double price;
  const _PricePoint(this.date, this.price);
}

class _PriceChartPainter extends CustomPainter {
  final List<_PricePoint> points;
  final double lowestPrice;
  final double highestPrice;
  final Color dividerColor;
  final Color textSecondaryColor;
  final Color textPrimaryColor;

  _PriceChartPainter({
    required this.points,
    required this.lowestPrice,
    required this.highestPrice,
    required this.dividerColor,
    required this.textSecondaryColor,
    required this.textPrimaryColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (points.isEmpty) return;

    final priceRange = highestPrice - lowestPrice;
    final paddedRange = priceRange == 0 ? 100.0 : priceRange * 1.2;
    final minP = lowestPrice - paddedRange * 0.1;

    final chartLeft = 50.0;
    final chartRight = size.width - 16;
    final chartTop = 8.0;
    final chartBottom = size.height - 30;
    final chartWidth = chartRight - chartLeft;
    final chartHeight = chartBottom - chartTop;

    // Grid lines and labels
    final gridPaint = Paint()
      ..color = dividerColor
      ..strokeWidth = 0.5;

    const gridLines = 4;
    for (int i = 0; i <= gridLines; i++) {
      final y = chartTop + (chartHeight * i / gridLines);
      canvas.drawLine(Offset(chartLeft, y), Offset(chartRight, y), gridPaint);

      final price = minP + paddedRange * (1 - i / gridLines);
      final tp = TextPainter(
        text: TextSpan(
          text: '\$${price.toInt()}',
          style: TextStyle(fontSize: 9, color: textSecondaryColor)),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, Offset(0, y - tp.height / 2));
    }

    // Month labels
    for (int i = 0; i < points.length; i += 2) {
      final x = chartLeft + (chartWidth * i / (points.length - 1));
      final months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      final tp = TextPainter(
        text: TextSpan(
          text: months[points[i].date.month - 1],
          style: TextStyle(fontSize: 9, color: textSecondaryColor)),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, Offset(x - tp.width / 2, chartBottom + 8));
    }

    // Line chart
    final linePaint = Paint()
      ..color = AppTheme.scoreExcellent
      ..strokeWidth = 2.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final fillPaint = Paint()
      ..shader = const LinearGradient(
        colors: [Color(0x40059669), Color(0x00059669)],
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
      ).createShader(Rect.fromLTRB(chartLeft, chartTop, chartRight, chartBottom));

    final linePath = Path();
    final fillPath = Path();

    for (int i = 0; i < points.length; i++) {
      final x = chartLeft + (chartWidth * i / (points.length - 1));
      final y = chartTop + chartHeight * (1 - (points[i].price - minP) / paddedRange);

      if (i == 0) {
        linePath.moveTo(x, y);
        fillPath.moveTo(x, chartBottom);
        fillPath.lineTo(x, y);
      } else {
        linePath.lineTo(x, y);
        fillPath.lineTo(x, y);
      }
    }

    // Close fill path
    fillPath.lineTo(chartRight, chartBottom);
    fillPath.close();

    canvas.drawPath(fillPath, fillPaint);
    canvas.drawPath(linePath, linePaint);

    // Current price dot
    final lastX = chartRight;
    final lastY = chartTop + chartHeight * (1 - (points.last.price - minP) / paddedRange);
    canvas.drawCircle(Offset(lastX, lastY), 5,
      Paint()..color = AppTheme.scoreExcellent);
    canvas.drawCircle(Offset(lastX, lastY), 3,
      Paint()..color = textPrimaryColor);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _AIAnalysisTab extends StatelessWidget {
  final ProductEntity product;
  final bool isDark;
  const _AIAnalysisTab({required this.product, required this.isDark});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).padding.bottom + 40),
      children: [
        _AIReviewAnalysisCard(product: product, isDark: isDark, cardBg: context.surfaceVariantColor),
        const SizedBox(height: 16),
        _PremiumFeaturesSection(product: product),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════
// SPECS TAB CONTENT
// ═══════════════════════════════════════════════════════════

class _SpecsTabContent extends StatelessWidget {
  final ProductEntity product;
  final bool isDark;
  const _SpecsTabContent({required this.product, required this.isDark});

  @override
  Widget build(BuildContext context) {
    final cardBg = context.surfaceVariantColor;
    if (product.specs.isEmpty && product.specSections.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(40),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.settings_input_component_outlined, size: 48, color: AppTheme.slate400),
              const SizedBox(height: 12),
              const Text(
                'No specifications available',
                style: TextStyle(color: AppTheme.slate500, fontSize: 15),
              ),
            ],
          ),
        ),
      );
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
      children: [
        _SpecsCard(
          specs: product.specSections.isNotEmpty ? product.specSections : product.specs,
          cardBg: cardBg,
          isDark: isDark,
        ),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════
// COMPARE TAB CONTENT
// ═══════════════════════════════════════════════════════════

class _CompareTabContent extends ConsumerWidget {
  final ProductEntity product;
  final bool isDark;
  const _CompareTabContent({required this.product, required this.isDark});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final compareState = ref.watch(comparisonStateProvider);
    final isInCompare = compareState.selectedProductIds.contains(product.id);
    final count = compareState.selectedProductIds.length;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 24),
      children: [
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: context.surfaceColor,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: context.dividerColor),
          ),
          child: Column(
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppTheme.primaryBlue.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.compare_arrows_rounded, size: 40, color: AppTheme.primaryBlue),
              ),
              const SizedBox(height: 16),
              Text(
                isInCompare ? 'Added to Compare List' : 'Compare This Product',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: isDark ? context.textPrimary : context.textPrimary,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                isInCompare
                    ? '$count product${count != 1 ? 's' : ''} in compare list. Tap "Add to Compare" below to toggle.'
                    : 'Add this product to your compare list to see a side-by-side AI comparison.',
                style: const TextStyle(
                  fontSize: 13,
                  color: AppTheme.slate400,
                  height: 1.5,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              if (compareState.selectedProductIds.isNotEmpty) ...[
                Divider(color: context.dividerColor),
                const SizedBox(height: 12),
                const Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'IN COMPARE LIST',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.2,
                      color: AppTheme.primaryBlue,
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                ...compareState.selectedProductIds.map((id) => Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: id == product.id
                        ? AppTheme.primaryBlue.withValues(alpha: 0.15)
                        : context.surfaceVariantColor,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: id == product.id
                          ? AppTheme.primaryBlue.withValues(alpha: 0.5)
                          : context.dividerColor,
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        id == product.id ? Icons.check_circle : Icons.circle_outlined,
                        color: id == product.id ? AppTheme.primaryBlue : AppTheme.slate600,
                        size: 18,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          id == product.id ? product.name : id,
                          style: TextStyle(
                            color: id == product.id ? (isDark ? context.textPrimary : context.textPrimary) : AppTheme.slate400,
                            fontSize: 13,
                            fontWeight: id == product.id ? FontWeight.w600 : FontWeight.normal,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                )),
                const SizedBox(height: 4),
                if (count >= 2)
                  SizedBox(
                    width: double.infinity,
                    height: 44,
                    child: ElevatedButton.icon(
                      onPressed: () => context.go('/compare'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primaryBlue,
                        foregroundColor: context.surfaceVariantColor,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        elevation: 0,
                      ),
                      icon: const Icon(Icons.compare_arrows, size: 18),
                      label: Text(context.l10n?.startAiComparison ?? context.l10n?.startAiComparison ?? 'Start AI Comparison', style: const TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════
// SHARED HELPER WIDGETS
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// VIEW TRACKER — records product view in Hive on first build
// ═══════════════════════════════════════════════════════════

class _ViewTracker extends ConsumerStatefulWidget {
  final String productId;
  const _ViewTracker({required this.productId});

  @override
  ConsumerState<_ViewTracker> createState() => _ViewTrackerState();
}

class _ViewTrackerState extends ConsumerState<_ViewTracker> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      recordProductView(ref, widget.productId);
    });
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

// ═══════════════════════════════════════════════════════════
// FAVORITE BUTTON
// ═══════════════════════════════════════════════════════════

class _FavoriteButton extends ConsumerStatefulWidget {
  final String productId;
  final bool isDark;
  const _FavoriteButton({required this.productId, required this.isDark});

  @override
  ConsumerState<_FavoriteButton> createState() => _FavoriteButtonState();
}

class _FavoriteButtonState extends ConsumerState<_FavoriteButton> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  bool _isToggling = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isFav = isFavorite(ref, widget.productId);
    return IconButton(
      icon: AnimatedSwitcher(
        duration: const Duration(milliseconds: 200),
        transitionBuilder: (child, animation) => ScaleTransition(scale: animation, child: child),
        child: Icon(
          isFav ? Icons.favorite : Icons.favorite_border,
          key: ValueKey(isFav),
          color: isFav ? Colors.redAccent : null,
        ),
      ),
      onPressed: _isToggling
          ? null
          : () async {
              setState(() => _isToggling = true);
              try {
                await toggleFavorite(ref, widget.productId);
              } catch (_) {}
              if (mounted) setState(() => _isToggling = false);
            },
    );
  }
}

class _CardHeader extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  const _CardHeader({required this.icon, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: color),
        const SizedBox(width: 8),
        Text(
          label,
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
            color: color,
          ),
        ),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String label;
  final Color color;
  const _SectionLabel({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.2,
        color: color,
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  final String label;
  final Color color;
  const _Badge({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(
        label,
        style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _CategoryEmoji extends StatelessWidget {
  final String? cat;
  const _CategoryEmoji({this.cat});

  @override
  Widget build(BuildContext context) {
    const map = {
      'smartphones': '📱', 'laptops': '💻', 'tablets': '📟',
      'headphones': '🎧', 'wearables': '⌚', 'tvs': '📺',
      'monitors': '🖥️', 'cameras': '📷',
    };
    return Text(map[cat] ?? '📦', style: const TextStyle(fontSize: 72));
  }
}

class _ImagePlaceholder extends StatelessWidget {
  const _ImagePlaceholder();
  @override
  Widget build(BuildContext context) {
    return const Center(
      child: CircularProgressIndicator(strokeWidth: 2),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// USER COMPATIBILITY CARD (new)
// ═══════════════════════════════════════════════════════════

class _CompatibilityCard extends ConsumerWidget {
  final ProductEntity product;
  final bool isDark;
  final Color cardBg;
  const _CompatibilityCard({required this.product, required this.isDark, required this.cardBg});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(userProfileProvider);
    final user = userAsync.valueOrNull;
    if (user == null || !user.quizCompleted) return const SizedBox.shrink();

    final algorithmService = ref.read(profileAlgorithmServiceProvider);
    final behaviorAsync = ref.watch(behaviorSignalsProvider);
    final behavior = behaviorAsync.valueOrNull ?? BehaviorSignals.empty;
    final fitScore = algorithmService.calculateTotalFitScore(
      user: user,
      product: product,
      behavior: behavior,
    );
    if (fitScore <= 0) return const SizedBox.shrink();

    final color = fitScore >= 80
        ? AppTheme.scoreExcellent
        : fitScore >= 60
            ? AppTheme.warning
            : AppTheme.error;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [color.withValues(alpha: 0.05), color.withValues(alpha: 0.1)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 56,
            height: 56,
            child: Stack(
              alignment: Alignment.center,
              children: [
                SizedBox(
                  width: 56,
                  height: 56,
                  child: CircularProgressIndicator(
                    value: fitScore / 100,
                    strokeWidth: 5,
                    backgroundColor: color.withValues(alpha: 0.15),
                    valueColor: AlwaysStoppedAnimation<Color>(color),
                  ),
                ),
                Text(
                  '${fitScore.toInt()}%',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: color,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Your Match',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: isDark ? context.textPrimary : context.textPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  fitScore >= 80
                      ? 'Great match for your preferences!'
                      : fitScore >= 60
                          ? 'Good match, with some trade-offs'
                          : 'May not fit your preferences well',
                  style: TextStyle(
                    fontSize: 12,
                    color: isDark ? AppTheme.slate400 : AppTheme.slate600,
                  ),
                ),
              ],
            ),
          ),
          Icon(
            fitScore >= 70 ? Icons.thumb_up : Icons.thumbs_up_down,
            color: color,
            size: 24,
          ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// YOUTUBE REVIEWS CARD (YouTube Data API v3)
// ═══════════════════════════════════════════════════════════

class _YouTubeReviewsCard extends ConsumerStatefulWidget {
  final ProductEntity product;
  final bool isDark;
  final Color cardBg;
  const _YouTubeReviewsCard({required this.product, required this.isDark, required this.cardBg});

  @override
  ConsumerState<_YouTubeReviewsCard> createState() => _YouTubeReviewsCardState();
}

class _YouTubeReviewsCardState extends ConsumerState<_YouTubeReviewsCard> {
  bool _loading = false;
  bool _loaded = false;
  List<YouTubeVideo> _videos = [];

  Future<void> _fetchVideos() async {
    setState(() => _loading = true);
    try {
      final youtubeService = ref.read(youtubeServiceProvider);
      final locale = Localizations.localeOf(context).languageCode;

      final videos = await youtubeService.searchReviewVideos(
        productName: widget.product.name,
        languageCode: locale,
        maxResults: 6,
      );

      if (mounted) {
        setState(() {
          _videos = videos;
          _loaded = true;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loaded = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: widget.cardBg,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.white.withValues(alpha: 0.04), blurRadius: 8)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.red.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.play_circle_fill, color: AppTheme.error, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  context.l10n?.youtubeReviews ?? 'YouTube Reviews',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (!_loaded && !_loading)
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _fetchVideos,
                icon: const Icon(Icons.play_arrow),
                label: Text(context.l10n?.loadReviewVideos ?? 'Load Review Videos'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppTheme.error,
                  side: const BorderSide(color: AppTheme.error),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ),
          if (_loading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          if (_loaded && _videos.isEmpty)
            Text(
              'No review videos found',
              style: TextStyle(fontSize: 13, color: AppTheme.slate500),
            ),
          if (_loaded && _videos.isNotEmpty)
            ..._videos.map((video) => GestureDetector(
                  onTap: () => _launchUrl(video.watchUrl, video.title, video.thumbnailUrl),
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: widget.isDark ? context.surfaceVariantColor : context.surfaceVariantColor,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        // Thumbnail with duration overlay
                        Stack(
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: video.thumbnailUrl.isNotEmpty
                                  ? CachedNetworkImage(
                                      imageUrl: video.thumbnailUrl,
                                      width: 120,
                                      height: 68,
                                      fit: BoxFit.cover,
                                      placeholder: (_, __) => Container(
                                        width: 120, height: 68,
                                        color: widget.isDark ? AppTheme.slate800 : context.textTertiaryColor,
                                        child: const Icon(Icons.play_circle_outline, color: AppTheme.error),
                                      ),
                                      errorWidget: (_, __, ___) => Container(
                                        width: 120, height: 68,
                                        color: widget.isDark ? AppTheme.slate800 : context.textTertiaryColor,
                                        child: const Icon(Icons.play_circle_outline, color: AppTheme.error),
                                      ),
                                    )
                                  : Container(
                                      width: 120, height: 68,
                                      color: widget.isDark ? AppTheme.slate800 : context.textTertiaryColor,
                                      child: const Icon(Icons.play_circle_outline, color: AppTheme.error, size: 32),
                                    ),
                            ),
                            // Duration badge
                            if (video.duration.isNotEmpty)
                              Positioned(
                                bottom: 4, right: 4,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: Colors.black.withValues(alpha: 0.8),
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: Text(
                                    video.duration,
                                    style: const TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.w600),
                                  ),
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                video.title,
                                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 3),
                              Text(
                                video.channelTitle,
                                style: TextStyle(fontSize: 11, color: AppTheme.slate500),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              if (video.viewCount.isNotEmpty) ...[
                                const SizedBox(height: 2),
                                Row(
                                  children: [
                                    Text(
                                      video.viewCount,
                                      style: const TextStyle(fontSize: 10, color: AppTheme.slate400),
                                    ),
                                    if (video.qualityBadge.isNotEmpty) ...[
                                      const SizedBox(width: 4),
                                      Text(video.qualityBadge, style: const TextStyle(fontSize: 10)),
                                    ],
                                  ],
                                ),
                              ],
                            ],
                          ),
                        ),
                        const Icon(Icons.play_circle_filled, size: 16, color: AppTheme.error),
                      ],
                    ),
                  ),
                )),
        ],
      ),
    );
  }

  OverlayEntry? _pipOverlayEntry;

  void _closePiP() {
    _pipOverlayEntry?.remove();
    _pipOverlayEntry = null;
  }

  Future<void> _launchUrl(String url, [String title = '', String thumbnailUrl = '']) async {
    // Extract YouTube video ID
    final ytRegex = RegExp(r'(?:youtube\.com/watch\?v=|youtu\.be/)([\w-]+)');
    final match = ytRegex.firstMatch(url);
    if (match != null) {
      final videoId = match.group(1)!;
      if (!mounted) return;

      // Remove any existing PiP player
      _closePiP();

      // Create draggable floating mini player with Invidious WebView
      _pipOverlayEntry = OverlayEntry(
        builder: (overlayCtx) => _FloatingYouTubePlayer(
          videoId: videoId,
          title: title,
          thumbnailUrl: thumbnailUrl.isNotEmpty ? thumbnailUrl : 'https://img.youtube.com/vi/$videoId/mqdefault.jpg',
          onClose: _closePiP,
        ),
      );
      // Use the main context for proper navigator access in fullscreen
      Overlay.of(context).insert(_pipOverlayEntry!);
      return;
    }
    // Non-YouTube URL: open in browser
    final uri = Uri.parse(url);
    try {
      await launchUrl(uri, mode: LaunchMode.inAppBrowserView);
    } catch (_) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// AI REVIEW ANALYSIS CARD
// ═══════════════════════════════════════════════════════════

class _AIReviewAnalysisCard extends ConsumerStatefulWidget {
  final ProductEntity product;
  final bool isDark;
  final Color cardBg;
  const _AIReviewAnalysisCard({required this.product, required this.isDark, required this.cardBg});

  @override
  ConsumerState<_AIReviewAnalysisCard> createState() => _AIReviewAnalysisCardState();
}

class _AIReviewAnalysisCardState extends ConsumerState<_AIReviewAnalysisCard> {
  bool _loading = false;
  bool _loaded = false;
  bool _expanded = false;
  // Parsed result fields
  String _summary = '';
  int _satisfaction = 0;
  List<String> _praised = [];
  List<String> _criticized = [];

  Future<void> _handleTap() async {
    if (_loading) return;
    if (_loaded) {
      setState(() => _expanded = !_expanded);
      return;
    }
    setState(() => _expanded = true);
    await _analyzeReviews();
  }

  Future<void> _analyzeReviews() async {
    setState(() => _loading = true);
    try {
      final gemini = ref.read(geminiServiceProvider);
      final locale = Localizations.localeOf(context).languageCode;
      final langName = _getLanguageName(locale);
      final productName = widget.product.name;

      final response = await gemini.jsonFreeTextQuery(
        'You are a product sentiment analyst. Based on your knowledge of publicly available '
        'user reviews, Reddit threads, forum discussions, YouTube comments, and tech community '
        'feedback for "$productName", provide a consumer sentiment analysis.\n\n'
        'Focus on real user opinions from Reddit, tech forums, review sites, and general consumer feedback.\n\n'
        'IMPORTANT: ALL text must be written in $langName language.\n\n'
        'Return a JSON object with these fields:\n'
        '"summary": A 2-3 sentence overview of what users think. Write in $langName.\n'
        '"satisfaction": Integer 0-100 representing overall user satisfaction percentage\n'
        '"praised": Array of 3-4 specific features/aspects users consistently praise. Write in $langName.\n'
        '"criticized": Array of 2-3 specific issues users consistently criticize. Write in $langName.',
        language: locale,
      );

      debugPrint('=== COMPAIR: AI review raw response (${response.length} chars): ${response.substring(0, response.length.clamp(0, 200))} ===');
      if (response.isNotEmpty && mounted) {
        try {
          // Extract the outermost JSON object
          final start = response.indexOf('{');
          final end = response.lastIndexOf('}');
          if (start == -1 || end == -1 || end <= start) throw FormatException('No JSON object found');
          final jsonStr = response.substring(start, end + 1);
          final decoded = jsonDecode(jsonStr);
          if (decoded is! Map) throw FormatException('Expected JSON object');
          final data = Map<String, dynamic>.from(decoded);
          setState(() {
            _summary = data['summary']?.toString() ?? '';
            _satisfaction = data['satisfaction'] is num
                ? (data['satisfaction'] as num).toInt().clamp(0, 100)
                : int.tryParse(data['satisfaction']?.toString() ?? '') ?? 0;
            _praised = (data['praised'] is List)
                ? (data['praised'] as List).map((e) => e.toString()).toList()
                : [];
            _criticized = (data['criticized'] is List)
                ? (data['criticized'] as List).map((e) => e.toString()).toList()
                : [];
            _loaded = true;
            _loading = false;
          });
          debugPrint('=== COMPAIR: AI review parsed OK — summary: ${_summary.substring(0, _summary.length.clamp(0, 80))} ===');
        } catch (parseErr) {
          debugPrint('=== COMPAIR: AI review JSON parse FAILED: $parseErr ===');
          // Show user-friendly error rather than raw JSON
          if (mounted) setState(() {
            _summary = 'Analysis failed. Please try again.';
            _loaded = true;
            _loading = false;
          });
        }
      } else if (mounted) {
        setState(() { _loaded = true; _loading = false; });
      }
    } catch (e) {
      debugPrint('=== COMPAIR: AI review analysis error: $e ===');
      if (mounted) setState(() { _loaded = true; _loading = false; });
    }
  }

  String _getLanguageName(String code) {
    switch (code) {
      case 'tr': return 'Turkish';
      case 'de': return 'German';
      case 'fr': return 'French';
      case 'es': return 'Spanish';
      case 'pt': return 'Portuguese';
      case 'it': return 'Italian';
      case 'ja': return 'Japanese';
      case 'ko': return 'Korean';
      case 'zh': return 'Chinese';
      case 'ru': return 'Russian';
      case 'ar': return 'Arabic';
      case 'hi': return 'Hindi';
      default: return 'English';
    }
  }

  @override
  Widget build(BuildContext context) {
    const gradient = [AppTheme.accentTeal, Color(0xFF14B8A6)];
    return GestureDetector(
      onTap: _handleTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppTheme.accentTeal.withValues(alpha: 0.15)),
          boxShadow: [BoxShadow(
            color: AppTheme.accentTeal.withValues(alpha: 0.08),
            blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: gradient),
                  borderRadius: BorderRadius.circular(12)),
                child: Icon(Icons.analytics_rounded,
                  color: context.surfaceVariantColor, size: 20)),
              const SizedBox(width: 12),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(context.l10n?.aiReviewSummary ?? 'AI Review Analysis',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 15, fontWeight: FontWeight.w700,
                      color: context.textPrimary)),
                  const SizedBox(height: 2),
                  Text(context.l10n?.poweredByAi ?? 'Powered by Compair AI',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12, color: context.textSecondary)),
                ])),
              if (_loading)
                const SizedBox(width: 20, height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2))
              else
                Icon(_expanded && _loaded
                    ? Icons.expand_less_rounded
                    : Icons.expand_more_rounded,
                  color: AppTheme.accentTeal),
            ]),
            if (_expanded && _loaded) ...[
              const SizedBox(height: 14),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppTheme.accentTeal.withValues(alpha: 0.04),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppTheme.accentTeal.withValues(alpha: 0.1))),
                child: _summary.isEmpty && _praised.isEmpty
                    ? Text(context.l10n?.noReviewsYet ?? 'No community reviews found for this product.',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13, color: context.textSecondary))
                    : _buildResult(),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildResult() {
    final satColor = _satisfaction >= 75
        ? AppTheme.success
        : _satisfaction >= 50
            ? AppTheme.warning
            : AppTheme.error;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Satisfaction gauge row
        if (_satisfaction > 0) ...[
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: context.surfaceVariantColor,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.accentTeal.withValues(alpha: 0.2)),
            ),
            child: Row(
              children: [
                // Circular gauge
                SizedBox(
                  width: 64, height: 64,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      CircularProgressIndicator(
                        value: _satisfaction / 100,
                        strokeWidth: 5,
                        backgroundColor: satColor.withValues(alpha: 0.12),
                        valueColor: AlwaysStoppedAnimation<Color>(satColor),
                      ),
                      Text(
                        '$_satisfaction%',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w900, color: satColor),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Community Satisfaction',
                        style: TextStyle(fontSize: 11, color: AppTheme.slate500, fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _satisfaction >= 80 ? (context.l10n?.highlyRecommended ?? 'Highly recommended') :
                        _satisfaction >= 65 ? (context.l10n?.generallyPositive ?? 'Generally positive') :
                        _satisfaction >= 45 ? (context.l10n?.mixedOpinions ?? 'Mixed opinions') : (context.l10n?.notableConcerns ?? 'Notable concerns'),
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: satColor),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        context.l10n?.satisfactionSource ?? 'Based on Reddit, forums & community reviews',
                        style: TextStyle(fontSize: 10, color: AppTheme.slate400),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
        ],
        // Summary text
        if (_summary.isNotEmpty) ...[
          Text(
            _summary,
            style: TextStyle(
              fontSize: 13,
              height: 1.6,
              color: widget.isDark ? context.textPrimary : context.textPrimary,
            ),
          ),
          const SizedBox(height: 12),
        ],
        // Praised chips
        if (_praised.isNotEmpty) ...[
          Text('👍 ${context.l10n?.praised ?? 'Praised'}', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.slate500)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6, runSpacing: 6,
            children: _praised.map((p) => Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: AppTheme.success.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppTheme.success.withValues(alpha: 0.3)),
              ),
              child: Text('✓ $p', style: const TextStyle(fontSize: 12, color: Color(0xFF16A34A), fontWeight: FontWeight.w600)),
            )).toList(),
          ),
          const SizedBox(height: 10),
        ],
        // Criticized chips
        if (_criticized.isNotEmpty) ...[
          Text('👎 ${context.l10n?.criticized ?? 'Criticized'}', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.slate500)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 6, runSpacing: 6,
            children: _criticized.map((c) => Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: AppTheme.error.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AppTheme.error.withValues(alpha: 0.3)),
              ),
              child: Text('✗ $c', style: const TextStyle(fontSize: 12, color: AppTheme.error, fontWeight: FontWeight.w600)),
            )).toList(),
          ),
        ],
        // AI disclosure label — Apple Guideline 1.4
        const SizedBox(height: 14),
        Row(
          children: [
            const Icon(Icons.auto_awesome, size: 11, color: AppTheme.slate400),
            const SizedBox(width: 4),
            Expanded(
              child: Text(
                'Generated by AI · Based on publicly available community reviews · May not be accurate',
                style: TextStyle(fontSize: 10, color: AppTheme.slate400, fontStyle: FontStyle.italic),
              ),
            ),
          ],
        ),
      ],
    );
  }

}

// ═══════════════════════════════════════════════════════════
// BENCHMARK SCORES CARD
// ═══════════════════════════════════════════════════════════

class _BenchmarkScoresCard extends ConsumerStatefulWidget {
  final ProductEntity product;
  const _BenchmarkScoresCard({required this.product});

  @override
  ConsumerState<_BenchmarkScoresCard> createState() => _BenchmarkScoresCardState();
}

class _BenchmarkScoresCardState extends ConsumerState<_BenchmarkScoresCard>
    with TickerProviderStateMixin {
  // ── Session-level cache (survives widget rebuilds) ──
  static final Map<String, Map<String, double>> _scoreCache = {};
  static final Map<String, Map<String, List<Map<String, dynamic>>>> _competitorCache = {};
  static final Map<String, Map<String, dynamic>> _verdictCache = {};

  bool _loadingAi = false;  // false = user hasn't triggered yet
  bool _researched = false;
  bool _failed = false;
  bool _userTriggered = false; // tracks if user has ever tapped Load Benchmark
  late AnimationController _barAnimController;
  late Animation<double> _barAnim;
  // Parsed benchmark values from AI: { 'AnTuTu': 1850000.0, ... }
  final Map<String, double> _parsedScores = {};
  // Segment competitors: { 'AnTuTu': [{'name':'Galaxy S24','score':1600000.0}, ...] }
  final Map<String, List<Map<String, dynamic>>> _competitors = {};

  // AI Verdict fields
  bool _loadingVerdict = false;
  String _aiVerdict = '';
  String _targetAudience = '';
  List<String> _strengths = [];
  List<String> _weaknesses = [];
  double _pricePerformance = 0;

  @override
  void initState() {
    super.initState();
    _barAnimController = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 1500));
    _barAnim = CurvedAnimation(parent: _barAnimController, curve: Curves.easeOutCubic);
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadFromCacheOrFetch());
  }

  @override
  void dispose() {
    _barAnimController.dispose();
    super.dispose();
  }

  /// Restores cached results instantly; does NOT auto-fetch AI (user must trigger).
  void _loadFromCacheOrFetch() {
    final pid = widget.product.id;
    if (_scoreCache.containsKey(pid)) {
      _parsedScores.addAll(_scoreCache[pid]!);
      if (_competitorCache.containsKey(pid)) {
        _competitors.addAll(_competitorCache[pid]!);
      }
      if (_verdictCache.containsKey(pid)) {
        final v = _verdictCache[pid]!;
        _aiVerdict = v['verdict'] as String? ?? '';
        _targetAudience = v['targetAudience'] as String? ?? '';
        _strengths = List<String>.from(v['strengths'] as List? ?? []);
        _weaknesses = List<String>.from(v['weaknesses'] as List? ?? []);
        _pricePerformance = (v['pricePerformance'] as num?)?.toDouble() ?? 0;
      }
      setState(() {
        _loadingAi = false;
        _researched = true;
        _userTriggered = true;
      });
      _barAnimController.forward(from: 0);
      if (!_verdictCache.containsKey(pid) && _parsedScores.isNotEmpty) {
        _fetchAiVerdict();
      }
    }
    // No cache: stay in idle state — user will tap the button to fetch
  }

  /// Clears state + cache for this product and re-fetches everything.
  void _retryFetch() {
    if (_loadingAi) return;
    _parsedScores.clear();
    _competitors.clear();
    _aiVerdict = '';
    _targetAudience = '';
    _strengths = [];
    _weaknesses = [];
    _pricePerformance = 0;
    final pid = widget.product.id;
    _scoreCache.remove(pid);
    _competitorCache.remove(pid);
    _verdictCache.remove(pid);
    setState(() {
      _failed = false;
      _researched = false;
      _userTriggered = true;
    });
    _fetchAiBenchmarks();
  }

  /// Minimal tech score bar shown before AI fetch (uses product's stored techScore 0-100).
  Widget _buildTechScoreBar(int score) {
    final ratio = (score / 100.0).clamp(0.0, 1.0);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          const Icon(Icons.analytics_rounded, size: 14, color: AppTheme.premiumPurple),
          const SizedBox(width: 6),
          Text('Tech Score', style: GoogleFonts.plusJakartaSans(
            fontSize: 12, fontWeight: FontWeight.w600, color: context.textSecondary)),
          const Spacer(),
          Text('$score / 100', style: GoogleFonts.plusJakartaSans(
            fontSize: 12, fontWeight: FontWeight.w700, color: context.textPrimary)),
        ]),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: LinearProgressIndicator(
            value: ratio,
            minHeight: 7,
            backgroundColor: context.dividerColor,
            valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.premiumPurple),
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final benchmarks = _getBenchmarksForCategory(widget.product);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Status badge row
        Row(children: [
          if (_loadingAi)
            SizedBox(width: 18, height: 18,
              child: CircularProgressIndicator(
                strokeWidth: 2, 
                color: AppTheme.premiumPurple.withValues(alpha: 0.6)))
          else if (_failed)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: Colors.orange.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.warning_amber_rounded, size: 11, color: Colors.orange),
                const SizedBox(width: 4),
                Text(context.l10n?.retryAvailable ?? 'Retry available', style: GoogleFonts.plusJakartaSans(
                  fontSize: 10, fontWeight: FontWeight.w600,
                  color: Colors.orange)),
              ]),
            )
          else if (_researched)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: AppTheme.green500.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.auto_awesome, size: 11, color: AppTheme.green500),
                const SizedBox(width: 4),
                Text(context.l10n?.aiVerified ?? 'AI Verified', style: GoogleFonts.plusJakartaSans(
                  fontSize: 10, fontWeight: FontWeight.w600,
                  color: AppTheme.green500)),
              ]),
            ),
        ]),
        const SizedBox(height: 12),

          // ── Idle / not-yet-fetched state ──
          if (!_userTriggered && !_loadingAi) ...[
            // Show product's built-in tech score if available
            if (widget.product.techScore > 0) ...[
              _buildTechScoreBar(widget.product.techScore.round()),
              const SizedBox(height: 16),
            ],
            // Info card explaining what AI benchmarks are
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppTheme.premiumPurple.withValues(alpha: 0.07),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppTheme.premiumPurple.withValues(alpha: 0.15)),
              ),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(Icons.info_outline_rounded, size: 16, color: AppTheme.premiumPurple.withValues(alpha: 0.8)),
                const SizedBox(width: 10),
                Expanded(child: Text(
                  context.l10n?.benchmarkAiInfo ??
                    'AI searches real benchmark databases (AnTuTu, Geekbench, DxOMark, Cinebench) to find verified scores for this product.',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12, color: context.textSecondary, height: 1.5),
                )),
              ]),
            ),
            const SizedBox(height: 12),
            // Load Benchmark button
            GestureDetector(
              onTap: () {
                setState(() { _userTriggered = true; });
                _fetchAiBenchmarks();
              },
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 13),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [AppTheme.premiumPurple, AppTheme.neonPurple]),
                  borderRadius: BorderRadius.circular(13)),
                child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  const Icon(Icons.psychology_rounded, size: 17, color: Colors.white),
                  const SizedBox(width: 8),
                  Text(context.l10n?.loadAiBenchmarks ?? 'Load AI Benchmark Scores',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13, fontWeight: FontWeight.w700,
                      color: Colors.white)),
                ]),
              ),
            ),
          ] else ...[
            // ── Scores loaded (or loading) ──
            AnimatedBuilder(
              animation: _barAnim,
              builder: (context, _) => Column(
                children: benchmarks.map((b) => Padding(
                  padding: const EdgeInsets.only(bottom: 14),
                  child: _buildBenchmarkRow(b, _barAnim.value),
                )).toList(),
              ),
            ),

            // Retry button when AI failed or returned no parseable data
            if (_failed && !_loadingAi) ...[
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.orange.withValues(alpha: 0.07),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Colors.orange.withValues(alpha: 0.2)),
                ),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Icon(Icons.info_outline_rounded, size: 16, color: Colors.orange),
                  const SizedBox(width: 10),
                  Expanded(child: Text(
                    context.l10n?.benchmarkNotFound ??
                      'Bu ürün için benchmark testi bulunmuyor. Ürün çok yeni veya benchmark veritabanlarında kayıtlı olmayabilir.',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12, color: context.textSecondary, height: 1.5),
                  )),
                ]),
              ),
              const SizedBox(height: 10),
              GestureDetector(
                onTap: _retryFetch,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    color: Colors.orange.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.orange.withValues(alpha: 0.2)),
                  ),
                  child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                    const Icon(Icons.refresh_rounded, size: 14, color: Colors.orange),
                    const SizedBox(width: 8),
                    Text(context.l10n?.retryBenchmark ?? 'Tekrar Dene',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12, fontWeight: FontWeight.w600,
                        color: Colors.orange)),
                  ]),
                ),
              ),
            ],

            // No data found explanation
            if (_researched && _parsedScores.isEmpty && !_failed) ...[
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.orange.withValues(alpha: 0.07),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Colors.orange.withValues(alpha: 0.2)),
                ),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Icon(Icons.search_off_rounded, size: 16, color: Colors.orange),
                  const SizedBox(width: 10),
                  Expanded(child: Text(
                    context.l10n?.benchmarkNotFound ??
                      'No verified benchmark scores were found for this product. It may be a regional release or too recent to have database entries.',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12, color: context.textSecondary, height: 1.5),
                  )),
                ]),
              ),
              const SizedBox(height: 10),
            ],

            // AI Verdict section (shown after successful benchmark fetch)
            if (_researched && _parsedScores.isNotEmpty)
              _buildVerdictSection(),
          ],
        ],
      );
  }

  Future<void> _fetchAiBenchmarks() async {
    if (_researched) return;
    setState(() => _loadingAi = true);
    try {
      final gemini = ref.read(geminiServiceProvider);
      final benchmarks = _getBenchmarksForCategory(widget.product);
      final benchmarkNames = benchmarks.map((b) => b.name).join(', ');
      final brand = widget.product.brand ?? '';
      final name = widget.product.name;
      final cat = widget.product.categoryId.toLowerCase();

      final subcat = widget.product.subcategory;
      // Build a very specific prompt with Google Search grounding
      final prompt = StringBuffer();
      prompt.writeln('You are a tech benchmark database expert.');
      prompt.writeln('Find the REAL, VERIFIED benchmark scores for "$brand $name".');
      prompt.writeln('Product category: $cat${subcat.isNotEmpty ? ', subcategory: $subcat' : ''}.');
      prompt.writeln('Search benchmark databases and tech review sites for actual tested scores.');
      prompt.writeln('');
      prompt.writeln('I need these benchmarks: $benchmarkNames');
      prompt.writeln('');

      // Category-specific instructions
      if (cat.contains('phone') || cat.contains('mobile') || cat.contains('smartphone')) {
        if (brand.toLowerCase().contains('apple') || brand.toLowerCase().contains('iphone')) {
          prompt.writeln('NOTE: Apple iPhones do NOT have AnTuTu scores. Skip AnTuTu for Apple devices.');
          prompt.writeln('For iPhones, focus on Geekbench scores from browser.geekbench.com and DxOMark from dxomark.com.');
        } else {
          prompt.writeln('Search AnTuTu scores from nanoreview.net or antutu.com ranking pages.');
        }
        prompt.writeln('Search DxOMark camera scores from dxomark.com.');
        prompt.writeln('Search Geekbench scores from browser.geekbench.com.');
      } else if (cat.contains('laptop') || cat.contains('notebook')) {
        prompt.writeln('Search Cinebench R23 multi-core scores from notebookcheck.net.');
        prompt.writeln('Search PCMark 10 scores from ul benchmarks.');
        prompt.writeln('Search 3DMark Time Spy scores from notebookcheck.net.');
      } else if (cat.contains('monitor') || cat.contains('display') || cat.contains('tv')) {
        prompt.writeln('Search Rtings.com overall score (0-10 scale) for this monitor/display.');
        prompt.writeln('Search Color Accuracy in Delta E (ΔE) from rtings.com or displayspecifications.com.');
        prompt.writeln('Use decimal values (e.g. Rtings Score: 7.2, Color Accuracy (ΔE): 1.4).');
      }

      prompt.writeln('');
      prompt.writeln('Also find 2-3 competitor products in the same segment with their scores for comparison.');
      prompt.writeln('');
      prompt.writeln('RESPOND IN THIS EXACT FORMAT (one per line):');
      prompt.writeln('SCORES:');
      prompt.writeln('BenchmarkName: NumericScore');
      prompt.writeln('');
      prompt.writeln('COMPETITORS:');
      prompt.writeln('BenchmarkName|ProductName|Score');
      prompt.writeln('');
      prompt.writeln('Example:');
      prompt.writeln('SCORES:');
      prompt.writeln('Geekbench Multi: 7200');
      prompt.writeln('DxOMark Camera: 157');
      prompt.writeln('Rtings Score: 7.2');
      prompt.writeln('Color Accuracy (ΔE): 1.4');
      prompt.writeln('');
      prompt.writeln('COMPETITORS:');
      prompt.writeln('Geekbench Multi|Samsung Galaxy S24|5800');
      prompt.writeln('Geekbench Multi|Google Pixel 9|6100');
      prompt.writeln('DxOMark Camera|Samsung Galaxy S24|150');
      prompt.writeln('');
      prompt.writeln('Rules:');
      prompt.writeln('- Only REAL scores from actual benchmark databases — DO NOT estimate or fabricate');
      prompt.writeln('- If a benchmark score cannot be found, write: BenchmarkName: N/A');
      prompt.writeln('- Numeric values only (decimals allowed, e.g. 7.2)');
      prompt.writeln('- Competitors should be same-generation, same price segment products');
      prompt.writeln('- Double-check scores against known ranges for this product category');

      final result = await gemini.groundedQuery(prompt.toString());
      debugPrint('=== COMPAIR: Benchmark raw response (${result.length} chars): ${result.substring(0, result.length.clamp(0, 500))} ===');
      if (mounted) {
        _parseResponse(result, benchmarks);
        debugPrint('=== COMPAIR: Benchmark parsed scores: $_parsedScores ===');
        if (_parsedScores.isEmpty) {
          // AI returned text but no parseable scores — allow retry
          setState(() {
            _loadingAi = false;
            _failed = true;
          });
          return;
        }
        // Cache results for session persistence
        final pid = widget.product.id;
        _scoreCache[pid] = Map.of(_parsedScores);
        _competitorCache[pid] = Map.of(_competitors);
        setState(() {
          _loadingAi = false;
          _researched = true;
        });
        _barAnimController.forward(from: 0);
        // Trigger AI verdict analysis
        _fetchAiVerdict();
      }
    } catch (e) {
      debugPrint('=== COMPAIR: Benchmark error: $e ===');
      if (mounted) {
        setState(() {
          _loadingAi = false;
          _failed = true;
        });
      }
    }
  }

  void _parseResponse(String response, List<_BenchmarkInfo> benchmarks) {
    // Parse SCORES section — support both integers and decimals (e.g. Rtings: 7.2, ΔE: 1.4)
    final scoreRegex = RegExp(r'([A-Za-z\s\d\.\-]+?):\s*([\d,\.]+)', multiLine: true);
    for (final match in scoreRegex.allMatches(response)) {
      final name = match.group(1)!.trim();
      final scoreStr = match.group(2)!.replaceAll(',', '');
      final score = double.tryParse(scoreStr);
      if (score == null || score <= 0) continue;

      // Strict matching: normalize both names and use containment check
      final nNorm = name.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
      _BenchmarkInfo? bestMatch;
      int bestLen = 0;
      for (final b in benchmarks) {
        final bNorm = b.name.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
        if (nNorm.contains(bNorm) || bNorm.contains(nNorm)) {
          if (bNorm.length > bestLen) {
            bestLen = bNorm.length;
            bestMatch = b;
          }
        }
      }
      if (bestMatch != null && !_parsedScores.containsKey(bestMatch.name)) {
        _parsedScores[bestMatch.name] = score;
      }
    }

    // Parse COMPETITORS section
    final compRegex = RegExp(r'([A-Za-z\s\d\.\-]+?)\|(.+?)\|([\d,\.]+)', multiLine: true);
    for (final match in compRegex.allMatches(response)) {
      final benchName = match.group(1)!.trim();
      final prodName = match.group(2)!.trim();
      final scoreStr = match.group(3)!.replaceAll(',', '');
      final score = double.tryParse(scoreStr);
      if (score == null) continue;

      final nNorm = benchName.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
      for (final b in benchmarks) {
        final bNorm = b.name.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
        if (nNorm.contains(bNorm) || bNorm.contains(nNorm)) {
          _competitors.putIfAbsent(b.name, () => []);
          if (_competitors[b.name]!.length < 3) {
            _competitors[b.name]!.add({'name': prodName, 'score': score});
          }
          break;
        }
      }
    }
  }

  Future<void> _fetchAiVerdict() async {
    if (!mounted || _parsedScores.isEmpty) return;
    setState(() => _loadingVerdict = true);
    try {
      final gemini = ref.read(geminiServiceProvider);
      final brand = widget.product.brand ?? '';
      final name = widget.product.name;
      final cat = widget.product.category;
      final priceMap = widget.product.prices;
      final priceStr = priceMap.isNotEmpty
          ? priceMap.entries.map((e) => '${e.key}: ${e.value}').join(', ')
          : 'unknown';
      final scoresStr = _parsedScores.entries
          .map((e) => '${e.key}: ${_formatScore(e.value)}')
          .join(', ');

      final prompt = '''Analyze "$brand $name" ($cat category).
Benchmark scores: $scoresStr
Price: $priceStr

Respond in this EXACT JSON format (no markdown, no extra text):
{
  "targetAudience": "One sentence describing who this product is perfect for",
  "pricePerformance": 7.5,
  "strengths": ["Strength 1", "Strength 2", "Strength 3"],
  "weaknesses": ["Weakness 1", "Weakness 2", "Weakness 3"],
  "verdict": "One paragraph overall assessment of this product"
}

Rules:
- pricePerformance is 1-10 (10 = amazing value for money)
- Exactly 3 strengths and 3 weaknesses as short phrases
- targetAudience should mention specific user types (gamers, professionals, students, etc.)
- verdict should be 2-3 sentences max
- Base analysis on the benchmark scores provided and general knowledge of the product''';

      final result = await gemini.jsonFreeTextQuery(prompt);
      if (!mounted) return;
      _parseVerdictResponse(result);

      // Cache the verdict
      _verdictCache[widget.product.id] = {
        'verdict': _aiVerdict,
        'targetAudience': _targetAudience,
        'strengths': _strengths,
        'weaknesses': _weaknesses,
        'pricePerformance': _pricePerformance,
      };

      setState(() => _loadingVerdict = false);
    } catch (e) {
      debugPrint('=== COMPAIR: Verdict error: $e ===');
      if (mounted) setState(() => _loadingVerdict = false);
    }
  }

  void _parseVerdictResponse(String response) {
    try {
      final json = jsonDecode(response) as Map<String, dynamic>;
      _targetAudience = json['targetAudience'] as String? ?? '';
      _pricePerformance = (json['pricePerformance'] as num?)?.toDouble() ?? 0;
      _strengths = List<String>.from(json['strengths'] as List? ?? []);
      _weaknesses = List<String>.from(json['weaknesses'] as List? ?? []);
      _aiVerdict = json['verdict'] as String? ?? '';
    } catch (e) {
      debugPrint('=== COMPAIR: Verdict parse error: $e ===');
    }
  }

  Widget _buildVerdictSection() {
    if (_loadingVerdict) {
      return Padding(
        padding: const EdgeInsets.only(top: 20),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox(width: 16, height: 16,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: AppTheme.brandCyan.withValues(alpha: 0.6))),
            const SizedBox(width: 10),
            Text(context.l10n?.generatingVerdict ?? 'Generating AI verdict…',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12, color: AppTheme.slate400)),
          ],
        ),
      );
    }

    if (_targetAudience.isEmpty && _aiVerdict.isEmpty) {
      return const SizedBox.shrink();
    }

    final ppColor = _pricePerformance >= 7
        ? AppTheme.green500
        : _pricePerformance >= 4
            ? Colors.orange
            : Colors.redAccent;

    return Padding(
      padding: const EdgeInsets.only(top: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Gradient divider
          Container(
            height: 1,
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [
                AppTheme.brandCyan.withValues(alpha: 0.0),
                AppTheme.brandCyan.withValues(alpha: 0.3),
                AppTheme.brandCyan.withValues(alpha: 0.0),
              ]),
            ),
          ),

          // Section title
          Row(children: [
            const Text('🎯', style: TextStyle(fontSize: 16)),
            const SizedBox(width: 8),
            Text(context.l10n?.aiVerdict ?? 'AI Verdict',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 14, fontWeight: FontWeight.w700,
                color: context.textPrimary)),
          ]),
          const SizedBox(height: 12),

          // Target audience
          if (_targetAudience.isNotEmpty) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.brandCyan.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppTheme.brandCyan.withValues(alpha: 0.15)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('🎯', style: TextStyle(fontSize: 14)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(_targetAudience,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12, fontWeight: FontWeight.w600,
                        color: context.textPrimary,
                        height: 1.4)),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
          ],

          // Price-Performance bar
          if (_pricePerformance > 0) ...[
            Row(children: [
              Text(context.l10n?.pricePerformance ?? 'Price-Performance',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12, fontWeight: FontWeight.w600,
                  color: context.textSecondary)),
              const Spacer(),
              Text('${_pricePerformance.toStringAsFixed(1)}/10',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12, fontWeight: FontWeight.w800,
                  color: ppColor)),
            ]),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(5),
              child: SizedBox(
                height: 8,
                child: Stack(children: [
                  Container(
                    decoration: BoxDecoration(
                      color: ppColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(5)),
                  ),
                  FractionallySizedBox(
                    widthFactor: (_pricePerformance / 10).clamp(0.0, 1.0),
                    child: Container(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [ppColor.withValues(alpha: 0.6), ppColor]),
                        borderRadius: BorderRadius.circular(5)),
                    ),
                  ),
                ]),
              ),
            ),
            const SizedBox(height: 14),
          ],

          // Strengths chips
          if (_strengths.isNotEmpty) ...[
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: _strengths.map((s) => Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: AppTheme.green500.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: AppTheme.green500.withValues(alpha: 0.2)),
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Text('✅', style: TextStyle(fontSize: 11)),
                  const SizedBox(width: 4),
                  Text(s,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 11, fontWeight: FontWeight.w600,
                      color: AppTheme.green500)),
                ]),
              )).toList(),
            ),
            const SizedBox(height: 8),
          ],

          // Weaknesses chips
          if (_weaknesses.isNotEmpty) ...[
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: _weaknesses.map((w) => Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: Colors.orange.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: Colors.orange.withValues(alpha: 0.2)),
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Text('⚠️', style: TextStyle(fontSize: 11)),
                  const SizedBox(width: 4),
                  Text(w,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 11, fontWeight: FontWeight.w600,
                      color: Colors.orange)),
                ]),
              )).toList(),
            ),
            const SizedBox(height: 12),
          ],

          // Verdict quote box
          if (_aiVerdict.isNotEmpty)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: context.surfaceColor,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: context.dividerColor),
              ),
              child: IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Container(
                      width: 3,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [AppTheme.brandCyan, AppTheme.neonPurple]),
                        borderRadius: BorderRadius.circular(2)),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(_aiVerdict,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12, fontWeight: FontWeight.w500,
                          color: context.textPrimary,
                          height: 1.5,
                          fontStyle: FontStyle.italic)),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildBenchmarkRow(_BenchmarkInfo info, double animProgress) {
    final score = _parsedScores[info.name];
    final hasScore = score != null && score > 0;
    final maxScore = info.maxScore;
    final targetRatio = hasScore ? (score / maxScore).clamp(0.0, 1.0) : 0.0;
    final ratio = _researched ? targetRatio * animProgress : 0.0;
    final animScore = hasScore ? score * animProgress : 0.0;
    final displayScore = hasScore && _researched ? _formatScore(animScore) : (_researched ? 'N/A' : '--');
    final comps = _competitors[info.name] ?? [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Main benchmark bar
        Row(children: [
          Container(
            width: 28, height: 28,
            decoration: BoxDecoration(
              color: info.color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8)),
            child: Icon(info.icon, size: 14, color: info.color),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Flexible(
                      child: Text(info.name,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12, fontWeight: FontWeight.w600,
                          color: context.textPrimary),
                        overflow: TextOverflow.ellipsis),
                    ),
                    Text(displayScore,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13, fontWeight: FontWeight.w800,
                        color: hasScore && _researched ? info.color : context.dividerColor)),
                  ],
                ),
                const SizedBox(height: 5),
                ClipRRect(
                  borderRadius: BorderRadius.circular(5),
                  child: SizedBox(
                    height: 8,
                    child: Stack(children: [
                      Container(
                        decoration: BoxDecoration(
                          color: info.color.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(5)),
                      ),
                      FractionallySizedBox(
                        widthFactor: ratio,
                        child: Container(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: [info.color.withValues(alpha: 0.6), info.color]),
                            borderRadius: BorderRadius.circular(5)),
                        ),
                      ),
                    ]),
                  ),
                ),
              ],
            ),
          ),
        ]),
        // Competitor comparison bars (smaller)
        if (comps.isNotEmpty && _researched) ...[
          const SizedBox(height: 6),
          ...comps.map((comp) {
            final compScore = (comp['score'] as num).toDouble();
            final compRatio = (compScore / maxScore).clamp(0.0, 1.0) * animProgress;
            return Padding(
              padding: const EdgeInsets.only(left: 38, bottom: 3),
              child: Row(children: [
                Expanded(
                  flex: 3,
                  child: Text(comp['name'] as String,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 10, color: AppTheme.slate400),
                    overflow: TextOverflow.ellipsis),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 4,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(3),
                    child: SizedBox(
                      height: 5,
                      child: Stack(children: [
                        Container(color: info.color.withValues(alpha: 0.05)),
                        FractionallySizedBox(
                          widthFactor: compRatio,
                          child: Container(
                            decoration: BoxDecoration(
                              color: info.color.withValues(alpha: 0.35),
                              borderRadius: BorderRadius.circular(3)),
                          ),
                        ),
                      ]),
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Text(_formatScore(compScore * animProgress),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 10, fontWeight: FontWeight.w600,
                    color: AppTheme.slate400)),
              ]),
            );
          }),
        ],
      ],
    );
  }

  String _formatScore(double score) {
    if (score >= 1000000) return '${(score / 1000000).toStringAsFixed(1)}M';
    if (score >= 1000) return '${(score / 1000).toStringAsFixed(score >= 10000 ? 0 : 1)}K';
    if (score < 10 && score > 0) return score.toStringAsFixed(1);
    return score.round().toString();
  }

  /// Category + brand aware benchmark definitions
  static List<_BenchmarkInfo> _getBenchmarksForCategory(ProductEntity product) {
    final cat = product.categoryId.toLowerCase();
    final isApple = (product.brand ?? '').toLowerCase().contains('apple') ||
                    product.name.toLowerCase().contains('iphone') ||
                    product.name.toLowerCase().contains('ipad');

    if (cat.contains('phone') || cat.contains('mobile') || cat.contains('smartphone') || cat.contains('tablet')) {
      if (isApple) {
        return [
          _BenchmarkInfo('Geekbench Single', Icons.speed, AppTheme.neonCyan, 40, 4000),
          _BenchmarkInfo('Geekbench Multi', Icons.speed, AppTheme.green500, 80, 8000),
          _BenchmarkInfo('DxOMark Camera', Icons.camera_alt, const Color(0xFFFF6B35), 1.8, 160),
        ];
      }
      return [
        _BenchmarkInfo('Geekbench Single', Icons.speed, AppTheme.neonCyan, 40, 4000),
        _BenchmarkInfo('Geekbench Multi', Icons.speed, AppTheme.green500, 80, 8000),
        _BenchmarkInfo('DxOMark Camera', Icons.camera_alt, const Color(0xFFFF6B35), 1.8, 160),
      ];
    } else if (cat.contains('laptop') || cat.contains('notebook') || cat.contains('desktop')) {
      return [
        _BenchmarkInfo('Cinebench R23', Icons.precision_manufacturing, const Color(0xFFFF6B35), 200, 20000),
        _BenchmarkInfo('Geekbench Multi', Icons.speed, AppTheme.neonCyan, 80, 8000),
        _BenchmarkInfo('PassMark', Icons.assessment, AppTheme.green500, 600, 60000),
      ];
    } else if (cat.contains('cpu') || cat.contains('processor')) {
      return [
        _BenchmarkInfo('Cinebench R23', Icons.precision_manufacturing, const Color(0xFFFF6B35), 500, 40000),
        _BenchmarkInfo('Geekbench Single', Icons.speed, AppTheme.neonCyan, 40, 4000),
        _BenchmarkInfo('PassMark CPU', Icons.assessment, AppTheme.green500, 600, 60000),
      ];
    } else if (cat.contains('gpu') || cat.contains('graphic')) {
      return [
        _BenchmarkInfo('3DMark', Icons.games, const Color(0xFFFF6B35), 350, 30000),
        _BenchmarkInfo('PassMark GPU', Icons.assessment, AppTheme.neonCyan, 500, 50000),
      ];
    } else if (cat.contains('camera')) {
      return [
        _BenchmarkInfo('DxOMark Camera', Icons.camera, const Color(0xFFFF6B35), 1.5, 160),
        _BenchmarkInfo('DxOMark Video', Icons.videocam, AppTheme.neonCyan, 1.2, 120),
      ];
    }
    // Monitors, keyboards, mice, headphones, speakers, accessories → no benchmarks
    return [];
  }
}

class _BenchmarkInfo {
  final String name;
  final IconData icon;
  final Color color;
  final double multiplier;
  final double maxScore;
  const _BenchmarkInfo(this.name, this.icon, this.color, this.multiplier, this.maxScore);
}

class _GaugeNeedlePainter extends CustomPainter {
  final double ratio; // 0.0 to 1.0
  final Color color;
  final Color backgroundColor;
  final Color dividerColor;
  final Color textPrimaryColor;

  _GaugeNeedlePainter({
    required this.ratio,
    required this.color,
    required this.backgroundColor,
    required this.dividerColor,
    required this.textPrimaryColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height * 0.82);
    final radius = size.width * 0.42;
    const startAngle = 3.665; // ~210° in radians
    const sweepAngle = 2.094; // ~120° sweep (210° to 330°)
    const strokeWidth = 10.0;

    // Background arc
    final bgPaint = Paint()
      ..color = backgroundColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      startAngle, sweepAngle, false, bgPaint,
    );

    // Gradient filled arc
    if (ratio > 0.001) {
      final filledSweep = sweepAngle * ratio;
      final gradientPaint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.round
        ..shader = SweepGradient(
          center: Alignment.center,
          startAngle: startAngle,
          endAngle: startAngle + filledSweep,
          colors: [
            color.withValues(alpha: 0.4),
            color.withValues(alpha: 0.7),
            color,
          ],
          stops: const [0.0, 0.5, 1.0],
        ).createShader(Rect.fromCircle(center: center, radius: radius));
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        startAngle, filledSweep, false, gradientPaint,
      );
    }

    // Tick marks
    final tickPaint = Paint()
      ..color = dividerColor
      ..strokeWidth = 1.0;
    for (int i = 0; i <= 10; i++) {
      final tickAngle = startAngle + (sweepAngle * i / 10);
      final innerR = radius - (i % 5 == 0 ? 14 : 8);
      final outerR = radius - 4;
      final inner = Offset(
        center.dx + innerR * cos(tickAngle),
        center.dy + innerR * sin(tickAngle),
      );
      final outer = Offset(
        center.dx + outerR * cos(tickAngle),
        center.dy + outerR * sin(tickAngle),
      );
      canvas.drawLine(inner, outer, tickPaint);
    }

    // Needle
    final needleAngle = startAngle + (sweepAngle * ratio);
    final needleLength = radius - 6;
    final needleTip = Offset(
      center.dx + needleLength * cos(needleAngle),
      center.dy + needleLength * sin(needleAngle),
    );

    // Needle shadow
    final shadowPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.08)
      ..strokeWidth = 3.0
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(
      Offset(center.dx + 1, center.dy + 1),
      Offset(needleTip.dx + 1, needleTip.dy + 1),
      shadowPaint,
    );

    // Needle body
    final needlePaint = Paint()
      ..color = color
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(center, needleTip, needlePaint);

    // Center circle (pivot)
    final pivotOuter = Paint()..color = color;
    canvas.drawCircle(center, 5, pivotOuter);
    final pivotInner = Paint()..color = textPrimaryColor;
    canvas.drawCircle(center, 2.5, pivotInner);
  }

  static double cos(double radians) => _cos(radians);
  static double sin(double radians) => _sin(radians);
  static double _cos(double r) => r.isNaN ? 0 : dart_math.cos(r);
  static double _sin(double r) => r.isNaN ? 0 : dart_math.sin(r);

  @override
  bool shouldRepaint(covariant _GaugeNeedlePainter oldDelegate) =>
      oldDelegate.ratio != ratio || oldDelegate.color != color;
}

// ═══════════════════════════════════════════════════════════
// USER REVIEWS CARD
// ═══════════════════════════════════════════════════════════

class _UserReviewsCard extends ConsumerStatefulWidget {
  final ProductEntity product;
  final bool isDark;
  final Color cardBg;

  const _UserReviewsCard({
    required this.product,
    required this.isDark,
    required this.cardBg,
  });

  @override
  ConsumerState<_UserReviewsCard> createState() => _UserReviewsCardState();
}

class _UserReviewsCardState extends ConsumerState<_UserReviewsCard> {
  @override
  Widget build(BuildContext context) {
    final reviewsAsync = ref.watch(productReviewsProvider(widget.product.id));
    final authState = ref.watch(authStateProvider);
    final currentUser = authState.valueOrNull;

    return Card(
      color: widget.cardBg,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header row
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: widget.isDark ? AppTheme.amber500.withValues(alpha: 0.1) : AppTheme.warning,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(Icons.rate_review_rounded,
                      color: AppTheme.warning, size: 20),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    context.l10n?.userReviews ?? 'User Reviews',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                  ),
                ),
                if (currentUser != null)
                  TextButton.icon(
                    onPressed: () => _showWriteReviewSheet(context, currentUser.uid),
                    icon: const Icon(Icons.edit_rounded, size: 16),
                    label: Text(context.l10n?.writeAReview ?? 'Write a Review'),
                    style: TextButton.styleFrom(
                      foregroundColor: AppTheme.warning,
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),

            // Reviews list
            reviewsAsync.when(
              data: (reviews) {
                if (reviews.isEmpty) {
                  return _buildEmptyState(currentUser != null);
                }
                return _buildReviewsList(reviews);
              },
              loading: () => const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
              error: (_, __) => Padding(
                padding: const EdgeInsets.all(16),
                child: Text(context.l10n?.couldNotLoadReviews ?? 'Could not load reviews'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyState(bool isLoggedIn) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 32),
      width: double.infinity,
      child: Column(
        children: [
          Icon(Icons.chat_bubble_outline_rounded,
              size: 48, color: AppTheme.slate400),
          const SizedBox(height: 12),
          Text(
            context.l10n?.noReviewsYet ?? 'No reviews yet',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: AppTheme.slate500,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            isLoggedIn
                ? (context.l10n?.beFirstToReview ?? 'Be the first to share your experience!')
                : (context.l10n?.signInToReview ?? 'Sign in to write a review'),
            style: const TextStyle(fontSize: 13, color: AppTheme.slate400),
          ),
        ],
      ),
    );
  }

  Widget _buildReviewsList(List<ReviewModel> reviews) {
    return Column(
      children: [
        // Review count summary
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: AppTheme.primaryBlue.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            children: [
              Icon(Icons.rate_review_rounded, size: 24, color: AppTheme.primaryBlue),
              const SizedBox(width: 10),
              Text(
                '${reviews.length} ${context.l10n?.reviews ?? 'Reviews'}',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 16, fontWeight: FontWeight.w700, color: context.textPrimary),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // Individual reviews
        ...reviews.take(5).map((review) => _buildReviewItem(review)),

        if (reviews.length > 5)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              '+ ${reviews.length - 5} more reviews',
              style: TextStyle(
                fontSize: 13,
                color: AppTheme.slate500,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildReviewItem(ReviewModel review) {
    final timeDiff = DateTime.now().difference(review.createdAt);
    String timeAgo;
    if (timeDiff.inDays > 365) {
      timeAgo = '${timeDiff.inDays ~/ 365}y ago';
    } else if (timeDiff.inDays > 30) {
      timeAgo = '${timeDiff.inDays ~/ 30}mo ago';
    } else if (timeDiff.inDays > 0) {
      timeAgo = '${timeDiff.inDays}d ago';
    } else if (timeDiff.inHours > 0) {
      timeAgo = '${timeDiff.inHours}h ago';
    } else {
      timeAgo = 'Just now';
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: widget.isDark ? context.surfaceVariantColor : context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.dividerColor.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [AppTheme.primaryBlue, AppTheme.neonCyan]),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Center(child: Text(
                  review.userId.isNotEmpty
                      ? review.userId[0].toUpperCase()
                      : '?',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                )),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'User',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: context.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Row(children: [
                      Text(
                        timeAgo,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11,
                          color: AppTheme.slate500,
                        ),
                      ),
                    ]),
                  ],
                ),
              ),
            ],
          ),
          if (review.text.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              review.text,
              style: const TextStyle(fontSize: 14, height: 1.4),
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 6),
            _SeeTranslationButton(text: review.text),
          ],
        ],
      ),
    );
  }

  Widget _buildStarRow(double rating, {double size = 16}) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(5, (i) {
        if (i < rating.floor()) {
          return Icon(Icons.star_rounded,
              color: AppTheme.warning, size: size);
        } else if (i < rating) {
          return Icon(Icons.star_half_rounded,
              color: AppTheme.warning, size: size);
        }
        return Icon(Icons.star_outline_rounded,
            color: AppTheme.slate400, size: size);
      }),
    );
  }

  void _showWriteReviewSheet(BuildContext context, String userId) {
    final textController = TextEditingController();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setSheetState) => Container(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 0,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
          ),
          decoration: BoxDecoration(
            color: context.backgroundColor,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Gradient header
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(0, 16, 0, 20),
                child: Column(
                  children: [
                    // Handle bar
                    Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: AppTheme.slate400.withValues(alpha: 0.5),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                    const SizedBox(height: 20),
                    // Product image + name
                    Row(
                      children: [
                        Container(
                          width: 48, height: 48,
                          decoration: BoxDecoration(
                            color: AppTheme.warning.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(Icons.rate_review_rounded, 
                            color: AppTheme.warning, size: 24),
                        ),
                        const SizedBox(width: 14),
                        Expanded(child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              context.l10n?.writeAReview ?? 'Write a Review',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 20, fontWeight: FontWeight.w800,
                                color: context.textPrimary),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              widget.product.name,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 13, color: context.textSecondary),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ],
                        )),
                      ],
                    ),
                  ],
                ),
              ),

              // Comment field with modern design
              TextField(
                controller: textController,
                maxLines: 4,
                maxLength: 500,
                onChanged: (_) => setSheetState(() {}),
                style: GoogleFonts.plusJakartaSans(fontSize: 14, height: 1.5),
                decoration: InputDecoration(
                  hintText: context.l10n?.shareYourExperience ?? 'Share your experience...',
                  hintStyle: GoogleFonts.plusJakartaSans(
                    color: AppTheme.slate400, fontSize: 14),
                  filled: true,
                  fillColor: context.surfaceVariantColor,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide.none,
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(16),
                    borderSide: BorderSide(
                      color: AppTheme.warning.withValues(alpha: 0.5), width: 1.5),
                  ),
                  contentPadding: const EdgeInsets.all(16),
                  counterStyle: GoogleFonts.plusJakartaSans(
                    fontSize: 11, color: context.textSecondary),
                ),
              ),
              const SizedBox(height: 16),

              // Submit button with gradient
              SizedBox(
                width: double.infinity,
                height: 52,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: textController.text.trim().isNotEmpty
                      ? const LinearGradient(
                          colors: [AppTheme.primaryBlue, AppTheme.neonPurple])
                      : null,
                    color: textController.text.trim().isNotEmpty
                      ? null : context.textTertiaryColor,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: textController.text.trim().isNotEmpty
                      ? [BoxShadow(
                          color: AppTheme.primaryBlue.withValues(alpha: 0.3),
                          blurRadius: 12, offset: const Offset(0, 4))]
                      : null,
                  ),
                  child: ElevatedButton.icon(
                    onPressed: textController.text.trim().isNotEmpty
                        ? () => _submitReview(
                              ctx,
                              userId,
                              0.0,
                              textController.text.trim(),
                            )
                        : null,
                    icon: const Icon(Icons.send_rounded, size: 18),
                    label: Text(
                      'Submit Review',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 15, fontWeight: FontWeight.w700),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.transparent,
                      foregroundColor: Colors.white,
                      shadowColor: Colors.transparent,
                      disabledBackgroundColor: Colors.transparent,
                      disabledForegroundColor: Colors.white54,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16)),
                      elevation: 0,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // _ratingLabel removed — star ratings no longer used

  Future<void> _submitReview(
    BuildContext ctx,
    String userId,
    double rating,
    String text,
  ) async {
    final review = ReviewModel(
      id: '',
      userId: userId,
      productId: widget.product.id,
      rating: rating,
      text: text,
      createdAt: DateTime.now(),
    );

    try {
      final repo = ref.read(productRepositoryProvider);
      final result = await repo.addReview(review);
      result.when(
        success: (_) {
          ref.invalidate(productReviewsProvider(widget.product.id));
          if (ctx.mounted) {
            Navigator.of(ctx).pop();
            ScaffoldMessenger.of(ctx).showSnackBar(
              SnackBar(
                content: Text(ctx.l10n?.reviewSubmittedStar ?? 'Review submitted!'),
                behavior: SnackBarBehavior.floating,
              ),
            );
          }
        },
        failure: (e) {
          if (ctx.mounted) {
            ScaffoldMessenger.of(ctx).showSnackBar(
              SnackBar(
                content: Text(ctx.l10n?.errorMessage('$e') ?? 'Error: $e'),
                behavior: SnackBarBehavior.floating,
              ),
            );
          }
        },
      );
    } catch (e) {
      if (ctx.mounted) {
        ScaffoldMessenger.of(ctx).showSnackBar(
          SnackBar(
            content: Text(ctx.l10n?.errorMessage('$e') ?? 'Error: $e'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
// ERROR & LOADING
// ═══════════════════════════════════════════════════════════

class _LoadingScreen extends StatelessWidget {
  const _LoadingScreen();
  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}

class _ErrorScreen extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorScreen({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(elevation: 0),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 56, color: Colors.redAccent),
              const SizedBox(height: 16),
              Text(
                context.l10n?.couldNotLoadProduct ?? 'Could not load product',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              Text(
                message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppTheme.slate500, fontSize: 13),
              ),
              const SizedBox(height: 24),
              ElevatedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: Text(context.l10n?.tryAgain ?? 'Try Again'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Fullscreen Image Viewer ──────────────────────────────────────────────────

class _FullScreenImageViewer extends StatefulWidget {
  final List<String> images;
  final int initialIndex;
  final Animation<double> animation;

  const _FullScreenImageViewer({
    required this.images,
    required this.initialIndex,
    required this.animation,
  });

  @override
  State<_FullScreenImageViewer> createState() => _FullScreenImageViewerState();
}

class _FullScreenImageViewerState extends State<_FullScreenImageViewer> {
  late PageController _pageController;
  late int _currentIndex;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex;
    _pageController = PageController(initialPage: widget.initialIndex);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => Navigator.of(context).pop(),
      child: Scaffold(
        backgroundColor: Colors.transparent,
        body: Stack(
          children: [
            // Swipeable images
            PageView.builder(
              controller: _pageController,
              itemCount: widget.images.length,
              onPageChanged: (i) => setState(() => _currentIndex = i),
              itemBuilder: (context, index) {
                return Center(
                  child: GestureDetector(
                    onTap: () {},
                    child: InteractiveViewer(
                      minScale: 0.5,
                      maxScale: 4.0,
                      child: CachedNetworkImage(
                        imageUrl: widget.images[index],
                        fit: BoxFit.contain,
                        placeholder: (_, __) => Center(
                          child: CircularProgressIndicator(
                            color: context.surfaceVariantColor, strokeWidth: 2)),
                        errorWidget: (_, __, ___) =>
                            Icon(Icons.broken_image, color: context.textPrimary.withValues(alpha: 0.54), size: 64),
                      ),
                    ),
                  ),
                );
              },
            ),

            // Close button
            Positioned(
              top: MediaQuery.of(context).padding.top + 12,
              right: 16,
              child: GestureDetector(
                onTap: () => Navigator.of(context).pop(),
                child: Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.5),
                    shape: BoxShape.circle),
                  child: Icon(Icons.close, color: context.surfaceVariantColor, size: 20),
                ),
              ),
            ),

            // Page indicator
            if (widget.images.length > 1)
              Positioned(
                bottom: MediaQuery.of(context).padding.bottom + 24,
                left: 0, right: 0,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(widget.images.length, (i) {
                    final isActive = i == _currentIndex;
                    return AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      margin: const EdgeInsets.symmetric(horizontal: 3),
                      width: isActive ? 24 : 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: isActive
                            ? context.textPrimary
                            : Colors.white.withValues(alpha: 0.4),
                        borderRadius: BorderRadius.circular(4)),
                    );
                  }),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// PREMIUM FEATURES SECTION
// ═══════════════════════════════════════════════════════════

class _PremiumFeaturesSection extends ConsumerStatefulWidget {
  final ProductEntity product;
  const _PremiumFeaturesSection({required this.product});

  @override
  ConsumerState<_PremiumFeaturesSection> createState() =>
      _PremiumFeaturesSectionState();
}

class _PremiumFeaturesSectionState
    extends ConsumerState<_PremiumFeaturesSection> {
  bool _deepAnalysisExpanded = false;
  bool _alternativesExpanded = false;
  bool _advisorExpanded = false;
  bool _predictionExpanded = false;

  // Track if user explicitly collapsed — prevents auto-expand from overriding
  bool _deepAnalysisUserCollapsed = false;
  bool _alternativesUserCollapsed = false;
  bool _advisorUserCollapsed = false;
  bool _predictionUserCollapsed = false;

  @override
  Widget build(BuildContext context) {
    final pid = widget.product.id;

    // Watch ALL providers (survives navigation / tab switches)
    final deepAnalysisAsync = ref.watch(deepAnalysisCacheProvider(pid));
    final deepAnalysis = deepAnalysisAsync.valueOrNull;
    final isLoadingAnalysis = deepAnalysisAsync is AsyncLoading;

    final alternativesAsync = ref.watch(alternativesCacheProvider(pid));
    final alternatives = alternativesAsync.valueOrNull;
    final isLoadingAlternatives = alternativesAsync is AsyncLoading;

    final advisorAsync = ref.watch(advisorCacheProvider(pid));
    final advisorResult = advisorAsync.valueOrNull;
    final isLoadingAdvisor = advisorAsync is AsyncLoading;

    final predictionAsync = ref.watch(predictionCacheProvider(pid));
    final predictionResult = predictionAsync.valueOrNull;
    final isLoadingPrediction = predictionAsync is AsyncLoading;

    // Auto-expand cards ONLY when results first arrive (not after user collapse)
    if (deepAnalysis != null && !_deepAnalysisExpanded && !_deepAnalysisUserCollapsed) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _deepAnalysisExpanded = true);
      });
    }
    if (alternatives != null && !_alternativesExpanded && !_alternativesUserCollapsed) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _alternativesExpanded = true);
      });
    }
    if (advisorResult != null && !_advisorExpanded && !_advisorUserCollapsed) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _advisorExpanded = true);
      });
    }
    if (predictionResult != null && !_predictionExpanded && !_predictionUserCollapsed) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _predictionExpanded = true);
      });
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Section header
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Text(context.l10n?.aiDeepAnalysis ?? 'AI Deep Analysis',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 15, fontWeight: FontWeight.w700,
              color: context.textSecondary, letterSpacing: 0.3)),
        ),

        // AI Deep Analysis
        _buildPremiumCard(
          icon: Icons.psychology_rounded,
          title: context.l10n?.aiDeepAnalysis ?? 'AI Deep Analysis',
          subtitle: context.l10n?.aiDeepAnalysisDesc ?? 'Comprehensive AI-powered product evaluation',
          gradient: const [AppTheme.premiumPurple, Color(0xFF6366F1)],
          isExpanded: _deepAnalysisExpanded,
          isLoading: isLoadingAnalysis,
          content: deepAnalysis,
          onTap: _toggleDeepAnalysis,
        ),
        const SizedBox(height: 10),

        // Smart Alternatives
        _buildPremiumCard(
          icon: Icons.swap_horizontal_circle_rounded,
          title: context.l10n?.smartAlternatives ?? 'Smart Alternatives',
          subtitle: context.l10n?.smartAlternativesDesc ?? 'AI-curated similar products you might prefer',
          gradient: const [AppTheme.warning, Color(0xFFF97316)],
          isExpanded: _alternativesExpanded,
          isLoading: isLoadingAlternatives,
          content: alternatives,
          onTap: _toggleAlternatives,
        ),
        const SizedBox(height: 10),

        // AI Product Advisor
        _buildPremiumCard(
          icon: Icons.support_agent_rounded,
          title: 'AI Product Advisor',
          subtitle: 'Personalized buying advice based on your needs',
          gradient: const [Color(0xFF3B82F6), Color(0xFF06B6D4)],
          isExpanded: _advisorExpanded,
          isLoading: isLoadingAdvisor,
          content: advisorResult,
          onTap: _toggleAdvisor,
        ),
        const SizedBox(height: 10),

        // Price Prediction
        _buildPremiumCard(
          icon: Icons.trending_down_rounded,
          title: 'Price Prediction',
          subtitle: 'AI-powered price trend analysis and best time to buy',
          gradient: const [Color(0xFF10B981), Color(0xFF059669)],
          isExpanded: _predictionExpanded,
          isLoading: isLoadingPrediction,
          content: predictionResult,
          onTap: _togglePrediction,
        ),

        // Benchmark Scores (only for supported categories)
        if (_hasBenchmarkSupport(widget.product)) ...[
          const SizedBox(height: 10),
          _BenchmarkCollapsibleCard(product: widget.product),
        ],
      ],
    );
  }

  bool _hasBenchmarkSupport(ProductEntity product) {
    final cat = product.categoryId.toLowerCase();
    // Show benchmarks only for these categories
    return cat.contains('phone') || cat.contains('mobile') || cat.contains('smartphone') ||
           cat.contains('tablet') || cat.contains('laptop') || cat.contains('notebook') ||
           cat.contains('desktop') ||
           cat.contains('cpu') || cat.contains('processor') ||
           cat.contains('gpu') || cat.contains('graphic') ||
           cat.contains('camera');
  }

  Widget _buildPremiumCard({
    required IconData icon,
    required String title,
    required String subtitle,
    required List<Color> gradient,
    required bool isExpanded,
    required bool isLoading,
    required String? content,
    required VoidCallback onTap,
    bool showChevron = false,
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
          border: Border.all(
            color: gradient[0].withValues(alpha: 0.15)),
          boxShadow: [BoxShadow(
            color: gradient[0].withValues(alpha: 0.08),
            blurRadius: 12, offset: const Offset(0, 4))]),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: gradient),
                  borderRadius: BorderRadius.circular(12)),
                child: Icon(icon, color: context.surfaceVariantColor, size: 20)),
              const SizedBox(width: 12),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: GoogleFonts.plusJakartaSans(
                    fontSize: 15, fontWeight: FontWeight.w700,
                    color: context.textPrimary)),
                  const SizedBox(height: 2),
                  Text(subtitle, style: GoogleFonts.plusJakartaSans(
                    fontSize: 12, color: context.textSecondary)),
                ])),
              if (isLoading)
                const SizedBox(width: 20, height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2))
              else if (showChevron)
                Icon(Icons.chevron_right_rounded,
                  color: context.textSecondary)
              else
                Icon(isExpanded
                    ? Icons.expand_less_rounded
                    : Icons.expand_more_rounded,
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
                  border: Border.all(
                    color: gradient[0].withValues(alpha: 0.1))),
                child: _buildRichContent(content, gradient[0]),
              ),
            ],
          ],
        ),
      ),
    );
  }

  /// Renders AI content with full markdown support
  Widget _buildRichContent(String content, Color accentColor) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return MarkdownBody(
      data: content,
      selectable: true,
      styleSheet: MarkdownStyleSheet(
        p: GoogleFonts.plusJakartaSans(
          fontSize: 13, height: 1.6,
          color: isDark ? Colors.white.withValues(alpha: 0.9) : context.textPrimary),
        strong: GoogleFonts.plusJakartaSans(
          fontSize: 13, fontWeight: FontWeight.w700,
          color: isDark ? Colors.white : context.textPrimary),
        em: GoogleFonts.plusJakartaSans(
          fontSize: 13, fontStyle: FontStyle.italic,
          color: isDark ? Colors.white.withValues(alpha: 0.8) : context.textSecondary),
        h1: GoogleFonts.plusJakartaSans(
          fontSize: 16, fontWeight: FontWeight.w800,
          color: isDark ? Colors.white : context.textPrimary),
        h2: GoogleFonts.plusJakartaSans(
          fontSize: 15, fontWeight: FontWeight.w700,
          color: isDark ? Colors.white : context.textPrimary),
        h3: GoogleFonts.plusJakartaSans(
          fontSize: 14, fontWeight: FontWeight.w700,
          color: accentColor),
        listBullet: GoogleFonts.plusJakartaSans(
          fontSize: 13, color: accentColor),
        listIndent: 16,
        blockSpacing: 8,
        h1Padding: const EdgeInsets.only(top: 8, bottom: 4),
        h2Padding: const EdgeInsets.only(top: 8, bottom: 4),
        h3Padding: const EdgeInsets.only(top: 6, bottom: 2),
        pPadding: const EdgeInsets.symmetric(vertical: 2),
        blockquoteDecoration: BoxDecoration(
          color: accentColor.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(8),
          border: Border(left: BorderSide(color: accentColor, width: 3)),
        ),
        blockquotePadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        codeblockDecoration: BoxDecoration(
          color: isDark ? Colors.white.withValues(alpha: 0.06) : const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.circular(8),
        ),
        code: GoogleFonts.jetBrainsMono(
          fontSize: 12,
          color: isDark ? Colors.white.withValues(alpha: 0.8) : const Color(0xFF334155)),
      ),
    );
  }

  Widget _buildMatchScoreCard() {
    final userProfile = ref.watch(userProfileProvider);
    // Calculate real match score
    int? matchScore;
    if (userProfile.hasValue && userProfile.value != null) {
      try {
        final algo = ref.read(profileAlgorithmServiceProvider);
        final behaviorAsync = ref.watch(behaviorSignalsProvider);
        final behavior = behaviorAsync.valueOrNull ?? BehaviorSignals.empty;
        final fs = algo.calculateTotalFitScore(
          user: userProfile.value!, product: widget.product, behavior: behavior);
        if (fs > 0) matchScore = fs.toInt();
      } catch (_) {}
    }
    final displayScore = matchScore != null ? '$matchScore%' : '--';
    final matchColor = matchScore == null ? AppTheme.premiumPurple :
        matchScore >= 80 ? AppTheme.green500 :
        matchScore >= 60 ? AppTheme.amber500 : AppTheme.rose500;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          colors: [
            matchColor.withValues(alpha: 0.08),
            const Color(0xFFEC4899).withValues(alpha: 0.06),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight),
        border: Border.all(
          color: matchColor.withValues(alpha: 0.15))),
      child: Row(children: [
        Container(
          width: 56, height: 56,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: LinearGradient(
              colors: [matchColor, const Color(0xFFEC4899)])),
          child: Center(child: Text(
            displayScore,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 18, fontWeight: FontWeight.w900,
              color: context.surfaceVariantColor))),
        ),
        const SizedBox(width: 14),
        Expanded(child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(context.l10n?.personalizedMatch ?? 'Personalized Match', style: GoogleFonts.plusJakartaSans(
              fontSize: 15, fontWeight: FontWeight.w700,
              color: context.textPrimary)),
            const SizedBox(height: 4),
            Text(context.l10n?.basedOnBehavior ?? 'Based on your browsing history, preferences, and behavior patterns',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12, color: context.textSecondary,
                height: 1.4)),
          ])),
      ]),
    );
  }

  Future<void> _toggleDeepAnalysis() async {
    if (_deepAnalysisExpanded) {
      setState(() {
        _deepAnalysisExpanded = false;
        _deepAnalysisUserCollapsed = true;
      });
      return;
    }
    setState(() {
      _deepAnalysisExpanded = true;
      _deepAnalysisUserCollapsed = false;
    });
    final lang = Localizations.localeOf(context).languageCode;
    ref.read(deepAnalysisCacheProvider(widget.product.id).notifier)
        .startAnalysis(widget.product.name, lang);
  }

  void _showPriceHistory(BuildContext context) {
    _showPriceComparison(context, widget.product);
  }

  Future<void> _toggleAlternatives() async {
    if (_alternativesExpanded) {
      setState(() {
        _alternativesExpanded = false;
        _alternativesUserCollapsed = true;
      });
      return;
    }
    setState(() {
      _alternativesExpanded = true;
      _alternativesUserCollapsed = false;
    });
    final lang = Localizations.localeOf(context).languageCode;
    ref.read(alternativesCacheProvider(widget.product.id).notifier)
        .startQuery(widget.product.name, widget.product.category, lang);
  }

  Future<void> _toggleAdvisor() async {
    if (_advisorExpanded) {
      setState(() {
        _advisorExpanded = false;
        _advisorUserCollapsed = true;
      });
      return;
    }
    setState(() {
      _advisorExpanded = true;
      _advisorUserCollapsed = false;
    });
    final lang = Localizations.localeOf(context).languageCode;
    final country = ref.read(selectedCountryProvider);
    final currency = ref.read(currencyProvider);
    final priceVal = widget.product.getPriceForCountry(country) 
        ?? (widget.product.prices.isNotEmpty ? widget.product.prices.values.first : 0.0);
    final price = priceVal > 0 ? AppUtils.formatCurrency(priceVal, currency) : 'unknown price';
    ref.read(advisorCacheProvider(widget.product.id).notifier)
        .startQuery(widget.product.name, widget.product.category, price, lang);
  }

  Future<void> _togglePrediction() async {
    if (_predictionExpanded) {
      setState(() {
        _predictionExpanded = false;
        _predictionUserCollapsed = true;
      });
      return;
    }
    setState(() {
      _predictionExpanded = true;
      _predictionUserCollapsed = false;
    });
    final lang = Localizations.localeOf(context).languageCode;
    final country = ref.read(selectedCountryProvider);
    final currency = ref.read(currencyProvider);
    final priceVal = widget.product.getPriceForCountry(country) 
        ?? (widget.product.prices.isNotEmpty ? widget.product.prices.values.first : 0.0);
    final price = priceVal > 0 ? AppUtils.formatCurrency(priceVal, currency) : 'unknown price';
    ref.read(predictionCacheProvider(widget.product.id).notifier)
        .startQuery(widget.product.name, widget.product.category, price, lang);
  }
}

// ── Collapsible Benchmark Card (premium-style wrapper) ──
class _BenchmarkCollapsibleCard extends StatefulWidget {
  final ProductEntity product;
  const _BenchmarkCollapsibleCard({required this.product});

  @override
  State<_BenchmarkCollapsibleCard> createState() => _BenchmarkCollapsibleCardState();
}

class _BenchmarkCollapsibleCardState extends State<_BenchmarkCollapsibleCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    const gradient = [AppTheme.premiumPurple, AppTheme.neonPurple];

    return GestureDetector(
      onTap: () => setState(() => _expanded = !_expanded),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: gradient[0].withValues(alpha: 0.15)),
          boxShadow: [BoxShadow(
            color: gradient[0].withValues(alpha: 0.08),
            blurRadius: 12, offset: const Offset(0, 4))]),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: gradient),
                  borderRadius: BorderRadius.circular(12)),
                child: Icon(Icons.speed_rounded, color: context.surfaceVariantColor, size: 20)),
              const SizedBox(width: 12),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(context.l10n?.benchmarkScores ?? 'Benchmark Scores', style: GoogleFonts.plusJakartaSans(
                    fontSize: 15, fontWeight: FontWeight.w700,
                    color: context.textPrimary)),
                  const SizedBox(height: 2),
                  Text('AI-powered benchmark lookup from real databases',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12, color: context.textSecondary)),
                ])),
              Icon(_expanded
                  ? Icons.expand_less_rounded
                  : Icons.expand_more_rounded,
                color: gradient[0]),
            ]),
            if (_expanded) ...[
              const SizedBox(height: 14),
              _BenchmarkScoresCard(product: widget.product),
            ],
          ],
        ),
      ),
    );
  }
}

// ── Similar Products Section (Brand-by-Brand Layout) ──
class _SimilarProductsSection extends ConsumerWidget {
  final ProductEntity product;
  final bool isDark;
  const _SimilarProductsSection({required this.product, required this.isDark});

  Color _techColor(double s) => s >= 85
      ? const Color(0xFF10B981)
      : s >= 70
          ? const Color(0xFFF59E0B)
          : s >= 50
              ? const Color(0xFFF97316)
              : const Color(0xFFEF4444);

  /// Group products by brand, sorted by product count (most first).
  /// Brands with only 1 product that aren't well-known get grouped into "Other Brands".
  Map<String, List<ProductEntity>> _groupByBrand(List<ProductEntity> products) {
    final groups = <String, List<ProductEntity>>{};
    final brandDisplayName = <String, String>{};
    for (final p in products) {
      final rawBrand = (p.brand != null && p.brand!.isNotEmpty) ? p.brand! : 'Other Brands';
      final key = rawBrand.toLowerCase().trim();
      brandDisplayName.putIfAbsent(key, () => rawBrand);
      groups.putIfAbsent(key, () => []).add(p);
    }
    // Sort by product count descending, use display name as key
    final sorted = <String, List<ProductEntity>>{};
    final entries = groups.entries.toList()..sort((a, b) => b.value.length.compareTo(a.value.length));
    for (final e in entries) {
      sorted[brandDisplayName[e.key] ?? e.key] = e.value;
    }
    return sorted;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final similarAsync = ref.watch(similarProductsProvider(product));
    final imageBg = isDark ? Colors.white : Colors.white;

    return similarAsync.when(
      loading: () => _SimilarShimmer(isDark: isDark),
      error: (_, __) => const SizedBox.shrink(),
      data: (products) {
        if (products.isEmpty) return const SizedBox.shrink();
        final brandGroups = _groupByBrand(products);

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Section header
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: 14),
              child: Row(children: [
                Container(
                  width: 30, height: 30,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [AppTheme.primaryBlue, Color(0xFF7C3AED)]),
                    borderRadius: BorderRadius.circular(8)),
                  child: const Icon(Icons.widgets_rounded, size: 16, color: Colors.white),
                ),
                const SizedBox(width: 10),
                Text(context.l10n?.similarProducts ?? 'Similar Products',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 16, fontWeight: FontWeight.w700,
                    color: context.textPrimary)),
              ]),
            ),

            // Brand-by-brand rows
            ...brandGroups.entries.map((entry) {
              final brandName = entry.key;
              final brandProducts = entry.value;

              return Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Brand header
                    Padding(
                      padding: const EdgeInsets.only(left: 4, bottom: 8),
                      child: Row(children: [
                        Text('🏷️', style: GoogleFonts.plusJakartaSans(fontSize: 13)),
                        const SizedBox(width: 6),
                        Text(brandName,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13, fontWeight: FontWeight.w700,
                            color: AppTheme.brandCyan,
                            letterSpacing: 0.3)),
                        const SizedBox(width: 6),
                        Text('(${brandProducts.length})',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 11, fontWeight: FontWeight.w500,
                            color: context.textTertiaryColor)),
                      ]),
                    ),
                    // Horizontal scroll row for this brand
                    SizedBox(
                      height: 200,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: brandProducts.length,
                        separatorBuilder: (_, __) => const SizedBox(width: 14),
                        itemBuilder: (context, i) {
                          final p = brandProducts[i];
                          return _SimilarProductCard(
                            product: p,
                            imageBg: imageBg,
                            isDark: isDark,
                          );
                        },
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
        );
      },
    );
  }
}

/// Wide product card matching home screen design for similar products.
class _SimilarProductCard extends ConsumerWidget {
  final ProductEntity product;
  final Color imageBg;
  final bool isDark;

  const _SimilarProductCard({
    required this.product,
    required this.imageBg,
    required this.isDark,
  });

  Color _techColor(double s) => s >= 85
      ? const Color(0xFF10B981)
      : s >= 70
          ? const Color(0xFFF59E0B)
          : s >= 50
              ? const Color(0xFFF97316)
              : const Color(0xFFEF4444);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isSelected = ref.watch(
      comparisonStateProvider.select(
        (s) => s.selectedProductIds.contains(product.id)),
    );

    return GestureDetector(
      onTap: () => context.push('/product/${product.id}'),
      child: Container(
        width: 260,
        height: 200,
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isSelected
                ? AppTheme.brandCyan.withValues(alpha: 0.5)
                : AppTheme.brandCyan.withValues(alpha: 0.12),
            width: isSelected ? 1.4 : 0.8,
          ),
          boxShadow: [
            BoxShadow(
              color: AppTheme.brandCyan.withValues(alpha: 0.06),
              blurRadius: 12,
              spreadRadius: -2,
            ),
          ],
        ),
        child: Row(
          children: [
            // Image section
            Stack(
              children: [
                Container(
                  width: 110,
                  height: 200,
                  decoration: BoxDecoration(
                    color: imageBg,
                    borderRadius: const BorderRadius.horizontal(
                        left: Radius.circular(20)),
                  ),
                  padding: const EdgeInsets.all(10),
                  child: ProductImageBox(
                    imageUrl: product.imageUrl,
                    height: 180,
                    borderRadius: BorderRadius.circular(12),
                    padding: EdgeInsets.zero,
                  ),
                ),
                // Quick compare badge
                Positioned(
                  top: 8,
                  right: 6,
                  child: _QuickCompareButton(
                    productId: product.id,
                    isSelected: isSelected,
                  ),
                ),
              ],
            ),
            // Details section
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(14, 16, 14, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (product.brand != null && product.brand!.isNotEmpty)
                      Text(
                        product.brand!.toUpperCase(),
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.accentCyan,
                          letterSpacing: 0.8,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    const SizedBox(height: 4),
                    Text(
                      product.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: context.textPrimary,
                        height: 1.2,
                      ),
                    ),
                    const SizedBox(height: 8),
                    if (product.techScore > 0)
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: _techColor(product.techScore)
                                  .withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.local_fire_department_rounded,
                                    size: 12,
                                    color: _techColor(product.techScore)),
                                const SizedBox(width: 3),
                                Text(
                                  '${product.techScore.toInt()}',
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: _techColor(product.techScore),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    const SizedBox(height: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 7),
                      decoration: BoxDecoration(
                        gradient: AppTheme.primaryGradient,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        context.l10n?.viewDetails ?? 'View Details',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Trending Products Section (shown after Similar Products) ──
class _TrendingProductsSection extends ConsumerWidget {
  final ProductEntity currentProduct;
  final bool isDark;
  const _TrendingProductsSection({required this.currentProduct, required this.isDark});

  Color _techColor(double s) => s >= 85
      ? const Color(0xFF10B981)
      : s >= 70
          ? const Color(0xFFF59E0B)
          : s >= 50
              ? const Color(0xFFF97316)
              : const Color(0xFFEF4444);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trendingAsync = ref.watch(trendingProductsProvider);

    return trendingAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (products) {
        // Filter out current product and same-category products
        final filtered = products
            .where((p) => p.id != currentProduct.id &&
                p.categoryId != currentProduct.categoryId)
            .take(15)
            .toList();

        if (filtered.isEmpty) return const SizedBox.shrink();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Section header
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: 14),
              child: Row(children: [
                Container(
                  width: 30, height: 30,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFFF97316), Color(0xFFEF4444)]),
                    borderRadius: BorderRadius.circular(8)),
                  child: const Icon(Icons.local_fire_department_rounded, size: 16, color: Colors.white),
                ),
                const SizedBox(width: 10),
                Text(context.l10n?.trendingProducts ?? 'Trending Products',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 16, fontWeight: FontWeight.w700,
                    color: context.textPrimary)),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFFF97316), Color(0xFFEF4444)]),
                    borderRadius: BorderRadius.circular(8)),
                  child: Text('🔥',
                    style: GoogleFonts.plusJakartaSans(fontSize: 11)),
                ),
              ]),
            ),

            // Horizontal scroll of trending products
            SizedBox(
              height: 200,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: filtered.length,
                separatorBuilder: (_, __) => const SizedBox(width: 14),
                itemBuilder: (context, i) {
                  final p = filtered[i];
                  return _SimilarProductCard(
                    product: p,
                    imageBg: Colors.white,
                    isDark: isDark,
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }
}

/// Quick compare ⚡ button that adds/removes a product from comparison.
class _QuickCompareButton extends ConsumerWidget {
  final String productId;
  final bool isSelected;

  const _QuickCompareButton({
    required this.productId,
    required this.isSelected,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GestureDetector(
      onTap: () {
        ref.read(comparisonStateProvider.notifier).toggleProduct(productId);
        final nowSelected = !isSelected;
        ScaffoldMessenger.of(context).hideCurrentSnackBar();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              nowSelected ? 'Added to compare ⚡' : 'Removed from compare',
              style: GoogleFonts.plusJakartaSans(
                  fontSize: 12, fontWeight: FontWeight.w600)),
            duration: const Duration(seconds: 1),
            behavior: SnackBarBehavior.floating,
            backgroundColor: nowSelected
                ? AppTheme.brandCyan.withValues(alpha: 0.9)
                : AppTheme.slate600,
          ),
        );
      },
      child: Container(
        width: 26, height: 26,
        decoration: BoxDecoration(
          color: isSelected
              ? AppTheme.brandCyan.withValues(alpha: 0.2)
              : context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(7),
          border: Border.all(
            color: isSelected
                ? AppTheme.brandCyan.withValues(alpha: 0.5)
                : AppTheme.brandCyan.withValues(alpha: 0.15),
            width: 0.8,
          ),
        ),
        child: Icon(
          Icons.bolt_rounded,
          size: 15,
          color: isSelected ? AppTheme.brandCyan : context.textTertiaryColor,
        ),
      ),
    );
  }
}

// ── See Translation Button (Instagram-style per-review translation) ──
class _SeeTranslationButton extends StatefulWidget {
  final String text;
  const _SeeTranslationButton({required this.text});

  @override
  State<_SeeTranslationButton> createState() => _SeeTranslationButtonState();
}

class _SeeTranslationButtonState extends State<_SeeTranslationButton> {
  String? _translated;
  bool _loading = false;
  bool _showOriginal = false;

  Future<void> _translate() async {
    if (_translated != null) {
      setState(() => _showOriginal = !_showOriginal);
      return;
    }

    setState(() => _loading = true);
    try {
      final locale = Localizations.localeOf(context).languageCode;
      final dio = Dio();
      final resp = await dio.get(
        'https://translate.googleapis.com/translate_a/single',
        queryParameters: {
          'client': 'gtx',
          'sl': 'auto',
          'tl': locale,
          'dt': 't',
          'q': widget.text,
        },
      ).timeout(const Duration(seconds: 8));

      final data = resp.data;
      if (data is List && data.isNotEmpty && data[0] is List) {
        final sb = StringBuffer();
        for (final segment in data[0]) {
          if (segment is List && segment.isNotEmpty) {
            sb.write(segment[0]);
          }
        }
        if (mounted) {
          setState(() {
            _translated = sb.toString();
            _showOriginal = false;
            _loading = false;
          });
        }
      } else {
        if (mounted) setState(() => _loading = false);
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GestureDetector(
          onTap: _loading ? null : _translate,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_loading)
                const SizedBox(width: 12, height: 12,
                  child: CircularProgressIndicator(strokeWidth: 1.5))
              else
                Icon(Icons.translate_rounded, size: 14, color: AppTheme.primaryBlue),
              const SizedBox(width: 4),
              Text(
                _translated != null
                    ? (_showOriginal ? 'See Translation' : 'See Original')
                    : 'See Translation',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12, fontWeight: FontWeight.w600,
                  color: AppTheme.primaryBlue),
              ),
            ],
          ),
        ),
        if (_translated != null && !_showOriginal) ...[
          const SizedBox(height: 6),
          Text(
            _translated!,
            style: TextStyle(fontSize: 14, height: 1.4, color: context.textPrimary),
          ),
        ],
      ],
    );
  }
}




// ═══════════════════════════════════════════════════════════
// YOUTUBE PLAYER HELPER
// ═══════════════════════════════════════════════════════════
// NATIVE YOUTUBE PLAYER — uses youtube_explode_dart to extract
// direct video stream URL, then plays with video_player + chewie.
// NO embed, NO WebView, NO YouTube restrictions. Guaranteed playback.
// ═══════════════════════════════════════════════════════════

/// Extracts direct stream URL for a YouTube video ID.
Future<String?> _getYouTubeStreamUrl(String videoId) async {
  try {
    final yte = yt_explode.YoutubeExplode();
    final manifest = await yte.videos.streamsClient.getManifest(videoId);
    yte.close();
    // Prefer muxed stream (video+audio) at highest quality
    final muxed = manifest.muxed.toList()
      ..sort((a, b) => (b.videoResolution?.height ?? 0).compareTo(a.videoResolution?.height ?? 0));
    if (muxed.isNotEmpty) return muxed.first.url.toString();
    // Fallback: highest quality video-only + audio-only (less ideal)
    final videos = manifest.videoOnly.toList()
      ..sort((a, b) => (b.videoResolution?.height ?? 0).compareTo(a.videoResolution?.height ?? 0));
    if (videos.isNotEmpty) return videos.first.url.toString();
    return null;
  } catch (e) {
    debugPrint('=== COMPAIR: youtube_explode error: $e ===');
    return null;
  }
}

// ── In-App player (full-screen route) ─────────────────────

class _InAppYouTubePlayer extends StatefulWidget {
  final String videoId;
  const _InAppYouTubePlayer({required this.videoId});
  @override
  State<_InAppYouTubePlayer> createState() => _InAppYouTubePlayerState();
}

class _InAppYouTubePlayerState extends State<_InAppYouTubePlayer> {
  VideoPlayerController? _vpc;
  ChewieController? _chewie;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final url = await _getYouTubeStreamUrl(widget.videoId);
    if (!mounted) return;
    if (url == null) {
      setState(() { _loading = false; _error = 'Video yüklenemedi'; });
      return;
    }
    _vpc = VideoPlayerController.networkUrl(Uri.parse(url));
    await _vpc!.initialize();
    if (!mounted) return;
    _chewie = ChewieController(
      videoPlayerController: _vpc!,
      autoPlay: true,
      allowFullScreen: true,
      allowMuting: true,
      showControls: true,
    );
    setState(() => _loading = false);
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
        elevation: 0,
        leading: IconButton(icon: const Icon(Icons.close_rounded), onPressed: () => Navigator.of(context).pop()),
        title: Text(context.l10n?.video ?? 'Video', style: GoogleFonts.plusJakartaSans(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.white)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
          : _error != null
              ? Center(child: Text(_error!, style: const TextStyle(color: Colors.white70)))
              : Chewie(controller: _chewie!),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// FLOATING YOUTUBE PLAYER (mini draggable — native video_player)
// ═══════════════════════════════════════════════════════════

class _FloatingYouTubePlayer extends StatefulWidget {
  final String videoId;
  final String title;
  final String thumbnailUrl;
  final VoidCallback onClose;
  const _FloatingYouTubePlayer({
    required this.videoId,
    required this.title,
    required this.thumbnailUrl,
    required this.onClose,
  });

  @override
  State<_FloatingYouTubePlayer> createState() => _FloatingYouTubePlayerState();
}

class _FloatingYouTubePlayerState extends State<_FloatingYouTubePlayer> {
  double _dx = -1;
  double _dy = -1;
  bool _positionSet = false;
  VideoPlayerController? _vpc;
  ChewieController? _chewie;
  bool _loading = true;
  String? _error;
  String? _streamUrl; // cached so fullscreen doesn't re-fetch

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final url = await _getYouTubeStreamUrl(widget.videoId);
    if (!mounted) return;
    if (url == null) {
      setState(() { _loading = false; _error = 'Yüklenemedi'; });
      return;
    }
    _streamUrl = url;
    _vpc = VideoPlayerController.networkUrl(Uri.parse(url));
    await _vpc!.initialize();
    if (!mounted) return;
    _chewie = ChewieController(
      videoPlayerController: _vpc!,
      autoPlay: true,
      showControls: true,
      allowFullScreen: false, // We handle fullscreen ourselves
      allowMuting: true,
    );
    setState(() => _loading = false);
  }

  @override
  void dispose() {
    _chewie?.dispose();
    _vpc?.dispose();
    super.dispose();
  }

  void _openFullscreen(BuildContext context) {
    final pos = _vpc?.value.position ?? Duration.zero;
    final url = _streamUrl;
    // Pause mini player before switching
    _vpc?.pause();
    widget.onClose();
    Navigator.of(context).push(PageRouteBuilder(
      fullscreenDialog: true,
      transitionDuration: const Duration(milliseconds: 200),
      reverseTransitionDuration: const Duration(milliseconds: 150),
      pageBuilder: (_, __, ___) => _FullscreenYouTubePlayer(
        videoId: widget.videoId,
        streamUrl: url,
        startAt: pos,
      ),
      transitionsBuilder: (_, anim, __, child) {
        return FadeTransition(opacity: anim, child: child);
      },
    ));
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    const playerW = 280.0;
    const playerH = 158.0; // 16:9 ratio

    if (!_positionSet) {
      _dx = size.width - playerW - 12;
      _dy = size.height - playerH - 100;
      _positionSet = true;
    }

    final thumb = widget.thumbnailUrl.isNotEmpty
        ? widget.thumbnailUrl
        : 'https://img.youtube.com/vi/${widget.videoId}/mqdefault.jpg';

    return Positioned(
      left: _dx, top: _dy,
      child: Material(
        color: Colors.transparent,
        child: GestureDetector(
          onPanUpdate: (d) {
            setState(() {
              _dx = (_dx + d.delta.dx).clamp(0.0, size.width - playerW);
              _dy = (_dy + d.delta.dy).clamp(0.0, size.height - playerH);
            });
          },
          child: Container(
            width: playerW, height: playerH,
            decoration: BoxDecoration(
              color: Colors.black,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 20, offset: const Offset(0, 6))],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Stack(children: [
                // Video or loading/error state
                if (_chewie != null && !_loading)
                  Positioned.fill(child: Chewie(controller: _chewie!))
                else if (_error != null)
                  Positioned.fill(child: Container(
                    color: Colors.black,
                    child: Center(child: Text(_error!, style: const TextStyle(color: Colors.white70, fontSize: 11))),
                  ))
                else
                  Stack(children: [
                    Positioned.fill(child: CachedNetworkImage(
                      imageUrl: thumb, fit: BoxFit.cover,
                      errorWidget: (_, __, ___) => Container(color: Colors.black))),
                    Positioned.fill(child: Container(color: Colors.black.withValues(alpha: 0.5))),
                    const Center(child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)),
                  ]),
                // Top bar: drag handle + fullscreen + close
                Positioned(top: 0, left: 0, right: 0,
                  child: Container(
                    height: 36,
                    decoration: BoxDecoration(gradient: LinearGradient(
                      begin: Alignment.topCenter, end: Alignment.bottomCenter,
                      colors: [Colors.black.withValues(alpha: 0.7), Colors.transparent],
                    )),
                    child: Row(children: [
                      const SizedBox(width: 8),
                      Container(width: 28, height: 3,
                        decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.4), borderRadius: BorderRadius.circular(2))),
                      const Spacer(),
                      GestureDetector(
                        onTap: () => _openFullscreen(context),
                        child: Container(
                          width: 28, height: 28,
                          margin: const EdgeInsets.only(right: 4),
                          decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.55), shape: BoxShape.circle),
                          child: const Icon(Icons.fullscreen, size: 16, color: Colors.white),
                        )),
                      GestureDetector(
                        onTap: widget.onClose,
                        child: Container(
                          width: 28, height: 28,
                          margin: const EdgeInsets.only(right: 6),
                          decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.55), shape: BoxShape.circle),
                          child: const Icon(Icons.close, size: 14, color: Colors.white),
                        )),
                    ]),
                  )),
                // Bottom title
                Positioned(bottom: 0, left: 0, right: 0,
                  child: IgnorePointer(child: Container(
                    padding: const EdgeInsets.fromLTRB(8, 10, 8, 6),
                    decoration: BoxDecoration(gradient: LinearGradient(
                      begin: Alignment.bottomCenter, end: Alignment.topCenter,
                      colors: [Colors.black.withValues(alpha: 0.8), Colors.transparent],
                    )),
                    child: Text(widget.title,
                      style: GoogleFonts.plusJakartaSans(fontSize: 9, fontWeight: FontWeight.w600, color: Colors.white),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  ))),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// FULLSCREEN YOUTUBE PLAYER (native video_player + chewie)
// ═══════════════════════════════════════════════════════════
class _FullscreenYouTubePlayer extends StatefulWidget {
  final String videoId;
  final String? streamUrl;
  final Duration startAt;
  const _FullscreenYouTubePlayer({
    required this.videoId,
    this.streamUrl,
    this.startAt = Duration.zero,
  });
  @override
  State<_FullscreenYouTubePlayer> createState() => _FullscreenYouTubePlayerState();
}

class _FullscreenYouTubePlayerState extends State<_FullscreenYouTubePlayer> {
  VideoPlayerController? _vpc;
  ChewieController? _chewie;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    // Use pre-fetched URL if available, otherwise fetch
    final url = widget.streamUrl ?? await _getYouTubeStreamUrl(widget.videoId);
    if (!mounted) return;
    if (url == null) {
      setState(() { _loading = false; _error = 'Video yüklenemedi'; });
      return;
    }
    _vpc = VideoPlayerController.networkUrl(Uri.parse(url));
    await _vpc!.initialize();
    if (!mounted) return;
    // Seek to position from mini player
    if (widget.startAt > Duration.zero) {
      await _vpc!.seekTo(widget.startAt);
    }
    _chewie = ChewieController(
      videoPlayerController: _vpc!,
      autoPlay: true,
      allowFullScreen: true,
      showControls: true,
      allowMuting: true,
    );
    setState(() => _loading = false);
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
      body: Stack(children: [
        if (_chewie != null && !_loading)
          Center(child: AspectRatio(
            aspectRatio: _vpc!.value.aspectRatio,
            child: Chewie(controller: _chewie!),
          ))
        else if (_error != null)
          Center(child: Text(_error!, style: const TextStyle(color: Colors.white70, fontSize: 14)))
        else
          const Center(child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2)),
        Positioned(top: 8, left: 8,
          child: SafeArea(child: GestureDetector(
            onTap: () => Navigator.of(context).pop(),
            child: Container(
              width: 36, height: 36,
              decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.6), shape: BoxShape.circle),
              child: const Icon(Icons.close, color: Colors.white, size: 18),
            ),
          ))),
      ]),
    );
  }
}


/// Shimmer skeleton shown while similar products load
class _SimilarShimmer extends StatefulWidget {
  final bool isDark;
  const _SimilarShimmer({required this.isDark});

  @override
  State<_SimilarShimmer> createState() => _SimilarShimmerState();
}

class _SimilarShimmerState extends State<_SimilarShimmer>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))
      ..repeat();
    _anim = Tween<double>(begin: -1.5, end: 2.5).animate(
        CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final base = widget.isDark ? Colors.white.withValues(alpha: 0.06) : Colors.black.withValues(alpha: 0.06);
    final highlight = widget.isDark ? Colors.white.withValues(alpha: 0.12) : Colors.black.withValues(alpha: 0.12);

    return AnimatedBuilder(
      animation: _anim,
      builder: (_, __) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header skeleton
            Row(children: [
              _shimmerBox(30, 30, base, highlight, radius: 8),
              const SizedBox(width: 10),
              _shimmerBox(120, 16, base, highlight, radius: 4),
            ]),
            const SizedBox(height: 16),
            // Product cards row
            SizedBox(
              height: 200,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: 4,
                separatorBuilder: (_, __) => const SizedBox(width: 12),
                itemBuilder: (_, __) => _shimmerBox(140, 200, base, highlight, radius: 16),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _shimmerBox(double w, double h, Color base, Color highlight, {double radius = 8}) {
    return Container(
      width: w, height: h,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        gradient: LinearGradient(
          begin: Alignment(_anim.value - 1, 0),
          end: Alignment(_anim.value, 0),
          colors: [base, highlight, base],
        ),
      ),
    );
  }
}
