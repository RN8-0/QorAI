/// Compair - Dynamic Home Screen (iOS-style redesign)
/// Rich, diverse layout with hero banners, category spotlights,
/// parallax cards and spring animations.
library;

import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/domain/entities/product_entity.dart';
import 'package:compair/presentation/providers/providers.dart';
import 'package:compair/presentation/widgets/product_image_box.dart';
import 'package:compair/presentation/widgets/shimmer_skeleton.dart';
import 'package:compair/presentation/widgets/subscription_logo_widget.dart';
import 'package:compair/routing/router.dart';
import 'package:compair/services/profile_algorithm_service.dart';
import 'package:compair/data/models/other_models.dart';
import 'package:compair/core/pb_client.dart';

// ============================================================================
// HOME SCREEN
// ============================================================================

const double _kHorizontalCardRowHeight = 246;
const EdgeInsets _kHorizontalCardRowPadding = EdgeInsets.fromLTRB(20, 8, 20, 8);

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});
  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen>
    with TickerProviderStateMixin {
  late final AnimationController _heroCtrl;
  late final ScrollController _scrollCtrl;
  late final PageController _heroPageCtrl;
  Timer? _heroAutoScroll;
  int _currentHeroPage = 0;
  final Stopwatch _initSw = Stopwatch();
  bool _firstDataLogged = false;

  // Persist scroll position across tab switches
  static double _savedScrollOffset = 0.0;
  static int _savedHeroPage = 0;

  @override
  void initState() {
    super.initState();
    _initSw.start();
    debugPrint('=== COMPAIR: HomeScreen initState ===');
    _heroCtrl = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 12),
    )..repeat(reverse: true);
    _scrollCtrl = ScrollController(initialScrollOffset: _savedScrollOffset);
    _currentHeroPage = _savedHeroPage;
    _heroPageCtrl = PageController(
      viewportFraction: 0.92,
      initialPage: _currentHeroPage,
    );
    _startHeroAutoScroll();
  }

  void _startHeroAutoScroll() {
    _heroAutoScroll?.cancel();
    _heroAutoScroll = Timer.periodic(const Duration(seconds: 5), (_) {
      if (!_heroPageCtrl.hasClients) return;
      final maxPage =
          (_heroPageCtrl.position.maxScrollExtent /
                  (_heroPageCtrl.position.viewportDimension * 0.92))
              .ceil();
      _currentHeroPage = (_currentHeroPage + 1) % (maxPage + 1);
      _heroPageCtrl.animateToPage(
        _currentHeroPage,
        duration: const Duration(milliseconds: 600),
        curve: Curves.easeInOutCubic,
      );
    });
  }

  @override
  void dispose() {
    // Save scroll position for when user returns
    if (_scrollCtrl.hasClients) {
      _savedScrollOffset = _scrollCtrl.offset;
    }
    _savedHeroPage = _currentHeroPage;
    _heroCtrl.dispose();
    _scrollCtrl.dispose();
    _heroPageCtrl.dispose();
    _heroAutoScroll?.cancel();
    super.dispose();
  }

  void _showNotificationsSheet(BuildContext context) {
    HapticFeedback.lightImpact();
    final bottomPad =
        MediaQuery.of(context).padding.bottom + AppTheme.navBarTotalClearance;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: bottomPad),
        child: Container(
          height: MediaQuery.of(ctx).size.height * 0.55,
          decoration: BoxDecoration(
            color: ctx.surfaceElevatedColor,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            border: Border(top: BorderSide(color: ctx.dividerColor)),
          ),
          child: Column(
            children: [
              const SizedBox(height: 12),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: ctx.dividerColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                ctx.l10n?.notifications ?? 'Notifications',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: ctx.textPrimary,
                ),
              ),
              const SizedBox(height: 8),
              Expanded(
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.notifications_none_rounded,
                        size: 56,
                        color: ctx.textTertiaryColor.withValues(alpha: 0.5),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        ctx.l10n?.noNotificationsYet ?? 'No notifications yet',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: ctx.textSecondary,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        ctx.l10n?.notificationsWillAppear ??
                            'Price drops and recommendations will appear here',
                        textAlign: TextAlign.center,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13,
                          color: ctx.textTertiaryColor,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // === BUILD ================================================================

  @override
  Widget build(BuildContext context) {
    final userProfile = ref.watch(userProfileProvider);
    final homeFeed = ref.watch(homeFeedProvider);
    final bool isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      body: RefreshIndicator(
        color: AppTheme.primaryBlue,
        onRefresh: () async {
          HapticFeedback.mediumImpact();
          clearInMemoryFeedCache();
          ref.invalidate(homeFeedProvider);
          ref.invalidate(categoriesProvider);
          ref.invalidate(personalizedRecommendationsProvider);
          ref.invalidate(userCategoryPriorityProvider);
          ref.invalidate(topInCategoryProvider);
          ref.invalidate(recentlyAnalyzedProvider);
          ref.invalidate(valuePicsProvider);
        },
        child: CustomScrollView(
          controller: _scrollCtrl,
          physics: const BouncingScrollPhysics(
            parent: AlwaysScrollableScrollPhysics(),
          ),
          slivers: [
            _buildAppBar(context, userProfile),
            _buildQuizReminder(userProfile),
            SliverToBoxAdapter(child: _buildSearchBar(context)),

            // Categories
            SliverToBoxAdapter(
              child: _SectionHeader(
                title: context.l10n?.categories ?? 'Categories',
                onSeeAll: () => _showAllCategoriesSheet(context),
              ),
            ),
            SliverToBoxAdapter(child: _buildCategoriesSection()),

            // For You
            SliverToBoxAdapter(
              child: _SectionHeader(
                title: context.l10n?.forYou ?? 'For You',
                icon: Icons.auto_awesome_rounded,
                iconColor: const Color(0xFFF59E0B),
                subtitle: _getPersonalizationSubtitle(userProfile),
                onSeeAll: () => context.push(AppRoutes.search),
              ),
            ),
            SliverToBoxAdapter(child: _buildPersonalizedSection()),

            // ── TOP IN CATEGORY (dynamic) ───────────────────────────────────
            ..._buildTopInCategorySection(),

            // ── RECENTLY VIEWED SECTION ─────────────────────────────────────
            ..._buildRecentlyViewedSection(),

            // ── RECENTLY ANALYZED ───────────────────────────────────────────
            ..._buildRecentlyAnalyzedSection(),

            // ── TRENDING ────────────────────────────────────────────────────
            SliverToBoxAdapter(
              child: _SectionHeader(
                title: context.l10n?.trendingToday ?? 'Trending Today',
                icon: Icons.local_fire_department_rounded,
                iconColor: const Color(0xFFEF4444),
                onSeeAll: () => context.push(AppRoutes.search),
              ),
            ),
            SliverToBoxAdapter(child: _buildTrendsSection(homeFeed)),

            // ── NEW ARRIVALS ────────────────────────────────────────────────
            SliverToBoxAdapter(
              child: _SectionHeader(
                title: context.l10n?.newArrivals ?? 'New Arrivals',
                icon: Icons.fiber_new_rounded,
                iconColor: const Color(0xFF10B981),
                subtitle:
                    context.l10n?.latestHighScoring ??
                    'Latest high-scoring products',
                onSeeAll: () => context.push(AppRoutes.search),
              ),
            ),
            SliverToBoxAdapter(child: _buildNewArrivalsSection()),

            // ── DYNAMIC PRIORITY CATEGORIES ─────────────────────────────────
            // Categories are ordered by user behavior & profile (no more hardcoded!)
            ..._buildPriorityCategorySections(homeFeed),

            // ── VALUE PICKS ──────────────────────────────────────────────
            ..._buildValuePicksSection(),

            // ── DISCOVER ────────────────────────────────────────────────────
            SliverToBoxAdapter(
              child: _SectionHeader(
                title: context.l10n?.exploreProducts ?? 'Discover',
                icon: Icons.explore_rounded,
                iconColor: const Color(0xFFF59E0B),
                subtitle:
                    context.l10n?.discoverPopular ??
                    'Popular products from every category',
                onSeeAll: () => context.push(AppRoutes.search),
              ),
            ),
            SliverToBoxAdapter(child: _buildDiscoverSection()),

            const SliverToBoxAdapter(child: SizedBox(height: 120)),
          ],
        ),
      ),
    );
  }

  // === HELPERS ===============================================================

  String? _getPersonalizationSubtitle(AsyncValue userProfile) {
    return userProfile.when(
      data: (user) {
        if (user == null) return 'Trending picks • most popular this week';
        if (!user.quizCompleted)
          return context.l10n?.completeProfileSuggestion ??
              'Complete your profile for better picks';
        final parts = <String>[];

        // Part 1: Audience descriptor
        if (user.profession != null && user.profession != 'other') {
          final labels = {
            'engineer': context.l10n?.engineers ?? 'Engineers',
            'designer': context.l10n?.designers ?? 'Designers',
            'student': context.l10n?.students ?? 'Students',
            'manager': context.l10n?.managers ?? 'Managers',
            'healthcare': context.l10n?.healthcarePros ?? 'Healthcare pros',
            'teacher': context.l10n?.teachers ?? 'Teachers',
            'finance': context.l10n?.financePros ?? 'Finance pros',
          };
          final label = labels[user.profession] ?? 'you';
          final eco = user.ecosystem == 'apple'
              ? 'Apple '
              : user.ecosystem == 'android'
              ? 'Android '
              : '';
          parts.add('Picks for $eco$label');
        } else {
          final ecosystem = user.ecosystem == 'apple'
              ? 'Apple'
              : user.ecosystem == 'android'
              ? 'Android'
              : null;
          if (ecosystem != null) {
            parts.add('Curated for $ecosystem users');
          } else {
            parts.add('Personalized for you');
          }
        }

        // Part 2: Budget or activity hint
        final budget = user.budgetRange;
        if (budget == 'premium' || budget == 'high') {
          parts.add('premium picks');
        } else if (budget == 'low') {
          parts.add('budget-friendly');
        } else if (budget == 'mid') {
          parts.add('mid-range picks');
        } else {
          parts.add('based on your activity');
        }

        return parts.join(' • ');
      },
      loading: () => null,
      error: (_, __) => 'Trending picks • most popular this week',
    );
  }

  Color _getTechScoreColor(double score) {
    if (score >= 85) return const Color(0xFF10B981);
    if (score >= 70) return const Color(0xFFF59E0B);
    if (score >= 50) return const Color(0xFFF97316);
    return const Color(0xFFEF4444);
  }

  // === APP BAR ===============================================================

  Widget _buildAppBar(BuildContext context, AsyncValue userProfile) {
    final hour = DateTime.now().hour;
    final greeting = hour < 12
        ? (context.l10n?.goodMorning ?? 'Good morning')
        : hour < 17
        ? (context.l10n?.goodAfternoon ?? 'Good afternoon')
        : (context.l10n?.goodEvening ?? 'Good evening');

    // Resolve first name: entity → authStore displayName → authStore name
    String? _resolveFirstName() {
      final fromEntity =
          userProfile.whenOrNull(
                data: (user) {
                  final dn = user?.displayName.trim();
                  if (dn != null && dn.isNotEmpty) return dn.split(' ').first;
                  return null;
                },
              )
              as String?;
      if (fromEntity != null) return fromEntity;

      final r = pb.authStore.record;
      if (r == null) return null;
      final dn = r.getStringValue('displayName').trim();
      if (dn.isNotEmpty) return dn.split(' ').first;
      final n = r.getStringValue('name').trim();
      if (n.isNotEmpty) return n.split(' ').first;
      return null;
    }

    final userName = _resolveFirstName();

    return SliverToBoxAdapter(
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              AppTheme.brandBlue.withValues(alpha: 0.05),
              Colors.transparent,
            ],
          ),
        ),
        child: SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 20, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    // App logo / title
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          ShaderMask(
                            shaderCallback: (bounds) =>
                                AppTheme.primaryGradient.createShader(
                                  Rect.fromLTWH(
                                    0,
                                    0,
                                    bounds.width,
                                    bounds.height,
                                  ),
                                ),
                            child: Text(
                              'Compair',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 24,
                                fontWeight: FontWeight.w800,
                                letterSpacing: -1.0,
                                color: Colors.white,
                              ),
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            userName != null
                                ? '$greeting, $userName'
                                : greeting,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              color: context.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                    _AppBarButton(
                      icon: Icons.document_scanner_rounded,
                      tooltip: 'Scan product',
                      onTap: () => context.push(AppRoutes.visualScanner),
                    ),
                    const SizedBox(width: 8),
                    _NotificationButton(),
                    const SizedBox(width: 8),
                    _AppBarButton(
                      icon: Icons.diamond_rounded,
                      tooltip: context.l10n?.premium ?? 'Premium',
                      onTap: () => context.push(AppRoutes.premium),
                      isPremium: true,
                    ),
                    const SizedBox(width: 8),
                    // Profile avatar — gradient ring border for premium look
                    GestureDetector(
                      onTap: () {
                        HapticFeedback.lightImpact();
                        context.push(AppRoutes.profile);
                      },
                      child: Container(
                        width: 40,
                        height: 40,
                        padding: const EdgeInsets.all(1.5),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(13),
                          gradient: AppTheme.primaryGradient,
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(11),
                          child: _buildAvatarWidget(userProfile),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// Avatar widget that instantly shows Firebase Auth user's photo (sync)
  /// and upgrades to Firestore profile data when stream resolves.
  Widget _buildAvatarWidget(AsyncValue userProfile) {
    // Try Firestore profile first (has latest data)
    final firestoreWidget = userProfile.whenOrNull(
      data: (user) {
        final photoUrl = (user?.photoURL ?? '').trim();
        if (photoUrl.isNotEmpty && !_isGeneratedAvatarUrl(photoUrl)) {
          return CachedNetworkImage(
            imageUrl: photoUrl,
            width: 38,
            height: 38,
            fit: BoxFit.cover,
            errorWidget: (_, __, ___) =>
                _buildAvatarFallback(hasSignedInUser: user != null),
          );
        }
        return _buildAvatarFallback(hasSignedInUser: user != null);
      },
    );
    if (firestoreWidget != null) return firestoreWidget;

    // PB not ready yet (loading) — use pb.authStore.record (sync, instant)
    final authRecord = pb.authStore.record;
    if (authRecord != null) {
      final photoURL = authRecord.getStringValue('photoURL').trim();
      if (photoURL.isNotEmpty && !_isGeneratedAvatarUrl(photoURL)) {
        return CachedNetworkImage(
          imageUrl: photoURL,
          width: 38,
          height: 38,
          fit: BoxFit.cover,
          errorWidget: (_, __, ___) =>
              _buildAvatarFallback(hasSignedInUser: true),
        );
      }
      return _buildAvatarFallback(hasSignedInUser: true);
    }

    return _buildAvatarFallback(hasSignedInUser: false);
  }

  bool _isGeneratedAvatarUrl(String? photoUrl) {
    final value = (photoUrl ?? '').trim().toLowerCase();
    return value.contains('ui-avatars.com');
  }

  Widget _buildAvatarFallback({required bool hasSignedInUser}) {
    if (hasSignedInUser) {
      return Image.asset(
        'assets/images/default_avatar.jpeg',
        width: 38,
        height: 38,
        fit: BoxFit.cover,
      );
    }

    return Container(
      width: 38,
      height: 38,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF2196F3), Color(0xFF00BCD4)],
        ),
      ),
      child: const Center(
        child: Icon(Icons.person_rounded, color: Colors.white, size: 20),
      ),
    );
  }

  // === QUIZ REMINDER =========================================================

  Widget _buildQuizReminder(AsyncValue userProfile) {
    final covers =
        ref.watch(categoryCoversProvider).valueOrNull ??
        const <String, String>{};
    final heroImage =
        covers['smartphones'] ?? covers['laptops'] ?? covers['headphones'];

    return userProfile.when(
      data: (user) {
        if (user != null && !user.quizCompleted) {
          return SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
              child: GestureDetector(
                onTap: () => context.push(AppRoutes.quiz),
                child: Container(
                  constraints: const BoxConstraints(minHeight: 168),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: [
                      BoxShadow(
                        color: AppTheme.brandCyan.withValues(alpha: 0.18),
                        blurRadius: 24,
                        offset: const Offset(0, 12),
                      ),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(24),
                    child: Stack(
                      children: [
                        Positioned.fill(
                          child: Container(
                            decoration: const BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                                colors: [
                                  Color(0xFF071726),
                                  Color(0xFF0B2442),
                                  Color(0xFF0A1420),
                                ],
                              ),
                            ),
                          ),
                        ),
                        if (heroImage != null)
                          Positioned.fill(
                            child: CachedNetworkImage(
                              imageUrl: heroImage,
                              fit: BoxFit.cover,
                              errorWidget: (_, __, ___) =>
                                  const SizedBox.shrink(),
                            ),
                          ),
                        Positioned.fill(
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                                colors: [
                                  Colors.black.withValues(alpha: 0.18),
                                  AppTheme.brandBlue.withValues(alpha: 0.64),
                                  AppTheme.brandCyan.withValues(alpha: 0.22),
                                ],
                              ),
                            ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.all(18),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Container(
                                    width: 44,
                                    height: 44,
                                    decoration: BoxDecoration(
                                      color: Colors.white.withValues(
                                        alpha: 0.14,
                                      ),
                                      borderRadius: BorderRadius.circular(14),
                                      border: Border.all(
                                        color: Colors.white.withValues(
                                          alpha: 0.12,
                                        ),
                                      ),
                                    ),
                                    child: const Icon(
                                      Icons.auto_awesome_rounded,
                                      color: Colors.white,
                                      size: 22,
                                    ),
                                  ),
                                  const Spacer(),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 10,
                                      vertical: 6,
                                    ),
                                    decoration: BoxDecoration(
                                      color: Colors.white.withValues(
                                        alpha: 0.12,
                                      ),
                                      borderRadius: BorderRadius.circular(99),
                                    ),
                                    child: Text(
                                      'Quiz',
                                      style: GoogleFonts.plusJakartaSans(
                                        color: Colors.white,
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 18),
                              Text(
                                'Build your taste profile',
                                style: GoogleFonts.plusJakartaSans(
                                  color: Colors.white,
                                  fontSize: 20,
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -0.4,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                'Unlock a smarter home feed, sharper AI compare guidance, and category-first recommendations.',
                                style: GoogleFonts.plusJakartaSans(
                                  color: Colors.white.withValues(alpha: 0.78),
                                  fontSize: 13,
                                  height: 1.35,
                                ),
                              ),
                              const SizedBox(height: 14),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [
                                  for (final label in const [
                                    'Home ranking',
                                    'AI fit',
                                    'Real product feed',
                                  ])
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 10,
                                        vertical: 6,
                                      ),
                                      decoration: BoxDecoration(
                                        color: Colors.white.withValues(
                                          alpha: 0.12,
                                        ),
                                        borderRadius: BorderRadius.circular(99),
                                      ),
                                      child: Text(
                                        label,
                                        style: GoogleFonts.plusJakartaSans(
                                          color: Colors.white,
                                          fontSize: 11,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                              const SizedBox(height: 14),
                              Row(
                                children: [
                                  Text(
                                    context.l10n?.completeYourProfile ??
                                        'Complete Your Profile',
                                    style: GoogleFonts.plusJakartaSans(
                                      color: Colors.white,
                                      fontSize: 14,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  const Icon(
                                    Icons.arrow_forward_rounded,
                                    color: Colors.white,
                                    size: 18,
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ).animate().fadeIn(duration: 400.ms).slideY(begin: -0.1),
          );
        }
        return const SliverToBoxAdapter(child: SizedBox.shrink());
      },
      loading: () => const SliverToBoxAdapter(child: SizedBox.shrink()),
      error: (_, __) => const SliverToBoxAdapter(child: SizedBox.shrink()),
    );
  }

  // === SEARCH BAR ============================================================

  Widget _buildSearchBar(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          context.push(AppRoutes.search);
        },
        child: Container(
          height: 52,
          decoration: BoxDecoration(
            color: isDark
                ? Colors.white.withValues(alpha: 0.07)
                : context.surfaceVariantColor,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: isDark
                  ? Colors.white.withValues(alpha: 0.10)
                  : Colors.black.withValues(alpha: 0.06),
              width: 1,
            ),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              Icon(
                Icons.search_rounded,
                size: 22,
                color: context.textTertiaryColor,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  context.l10n?.searchProducts ?? 'Search Products',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 15,
                    color: context.textTertiaryColor,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    ).animate().fadeIn(duration: 300.ms).slideY(begin: 0.05, duration: 300.ms);
  }

  // === QUICK ACTIONS ===========================================================

  Widget _buildQuickActions(BuildContext context) {
    final actions = [
      _QuickAction(
        icon: Icons.compare_arrows_rounded,
        label: context.l10n?.compare ?? 'Compare',
        gradient: const LinearGradient(
          colors: [Color(0xFF2196F3), Color(0xFF00E5FF)],
        ),
        onTap: () => context.push(AppRoutes.compare),
      ),
      _QuickAction(
        icon: Icons.computer_rounded,
        label: context.l10n?.pcBuild ?? 'PC Build',
        gradient: const LinearGradient(
          colors: [Color(0xFF1565C0), Color(0xFF2196F3)],
        ),
        onTap: () => context.push(AppRoutes.pcBuilder),
      ),
      _QuickAction(
        icon: Icons.link_rounded,
        label: context.l10n?.linkPaste ?? 'Link Paste',
        gradient: const LinearGradient(
          colors: [Color(0xFF0097A7), Color(0xFF00E5FF)],
        ),
        onTap: () => context.push(AppRoutes.linkPaste),
      ),
      _QuickAction(
        icon: Icons.bookmark_rounded,
        label: context.l10n?.collection ?? 'Collection',
        gradient: const LinearGradient(
          colors: [Color(0xFF1565C0), Color(0xFF4FC3F7)],
        ),
        onTap: () => context.push(AppRoutes.collection),
      ),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 8),
      child: Row(
        children: actions.asMap().entries.map((entry) {
          final i = entry.key;
          final action = entry.value;
          return Expanded(
            child: Padding(
              padding: EdgeInsets.only(right: i < actions.length - 1 ? 10 : 0),
              child: action,
            ),
          );
        }).toList(),
      ),
    ).animate().fadeIn(duration: 300.ms).slideY(begin: 0.05, duration: 300.ms);
  }

  // === PC BUILDER CARD =======================================================

  Widget _buildPcBuilderCard(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      child: GestureDetector(
        onTap: () => context.push(AppRoutes.pcBuilder),
        child: Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [AppTheme.premiumPurple, AppTheme.neonBlue],
            ),
            borderRadius: BorderRadius.circular(20),
            boxShadow: [
              BoxShadow(
                color: AppTheme.premiumPurple.withValues(alpha: 0.3),
                blurRadius: 20,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: context.surfaceElevatedColor,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(
                  Icons.computer_rounded,
                  size: 28,
                  color: Colors.white,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          context.l10n?.pcBuilder ?? 'PC Builder',
                          style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w800,
                            fontSize: 18,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: context.surfaceElevatedColor,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            'AI',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      context.l10n?.buildDreamPc ??
                          'Build your dream PC with AI guidance',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        color: Colors.white.withValues(alpha: 0.85),
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.arrow_forward_rounded,
                color: Colors.white.withValues(alpha: 0.8),
                size: 22,
              ),
            ],
          ),
        ),
      ),
    ).animate().fadeIn(duration: 300.ms).slideY(begin: 0.1, end: 0);
  }

  // === HERO BANNER ===========================================================

  Widget _buildHeroCarousel() {
    final bool isDark = Theme.of(context).brightness == Brightness.dark;
    return ref
        .watch(featuredProductsProvider)
        .when(
          data: (products) {
            if (products.isEmpty) return const SizedBox.shrink();
            return Column(
              children: [
                SizedBox(
                  height: 220,
                  child: PageView.builder(
                    controller: _heroPageCtrl,
                    itemCount: products.length,
                    onPageChanged: (i) => setState(() => _currentHeroPage = i),
                    itemBuilder: (context, index) {
                      final p = products[index];
                      final scoreColor = _getTechScoreColor(p.techScore);
                      // Parallax scale effect
                      double scale = 1.0;
                      if (_heroPageCtrl.position.haveDimensions) {
                        final page =
                            _heroPageCtrl.page ?? _currentHeroPage.toDouble();
                        scale = (1 - (page - index).abs() * 0.08).clamp(
                          0.92,
                          1.0,
                        );
                      }
                      return GestureDetector(
                        onTap: () => context.push('/product/${p.id}'),
                        child: AnimatedBuilder(
                          animation: _heroCtrl,
                          builder: (context, child) {
                            final t = _heroCtrl.value;
                            return Transform.scale(
                              scale: scale,
                              child: Container(
                                margin: const EdgeInsets.symmetric(
                                  horizontal: 6,
                                  vertical: 8,
                                ),
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(24),
                                  color: context.surfaceVariantColor,
                                  border: Border.all(
                                    color:
                                        Theme.of(context).brightness ==
                                            Brightness.dark
                                        ? context.dividerColor
                                        : Colors.black.withValues(alpha: 0.06),
                                  ),
                                  boxShadow: [
                                    BoxShadow(
                                      color: scoreColor.withValues(alpha: 0.10),
                                      blurRadius: 20,
                                      offset: const Offset(0, 6),
                                    ),
                                    BoxShadow(
                                      color:
                                          (isDark
                                                  ? Colors.black
                                                  : Colors.black12)
                                              .withValues(
                                                alpha: isDark ? 0.04 : 0.06,
                                              ),
                                      blurRadius: 8,
                                      offset: const Offset(0, 2),
                                    ),
                                  ],
                                ),
                                child: Stack(
                                  children: [
                                    Positioned(
                                      right: -30,
                                      top: -30,
                                      child: Container(
                                        width: 150,
                                        height: 150,
                                        decoration: BoxDecoration(
                                          shape: BoxShape.circle,
                                          gradient: RadialGradient(
                                            colors: [
                                              scoreColor.withValues(
                                                alpha: 0.08,
                                              ),
                                              Colors.transparent,
                                            ],
                                          ),
                                        ),
                                      ),
                                    ),
                                    Padding(
                                      padding: const EdgeInsets.all(18),
                                      child: Row(
                                        children: [
                                          // Image left
                                          Container(
                                            width: 110,
                                            height: 184,
                                            decoration: BoxDecoration(
                                              color: Colors.white,
                                              borderRadius:
                                                  BorderRadius.circular(14),
                                            ),
                                            padding: const EdgeInsets.all(8),
                                            child: Transform.translate(
                                              offset: Offset(
                                                0,
                                                -3 + (6 * sin(t * pi)),
                                              ),
                                              child: p.imageURL.isNotEmpty
                                                  ? ProductImageBox(
                                                      imageUrl: p.imageURL,
                                                      height: 143,
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                            10,
                                                          ),
                                                      padding: EdgeInsets.zero,
                                                    )
                                                  : const SizedBox(),
                                            ),
                                          ),
                                          const SizedBox(width: 16),
                                          // Details right
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              mainAxisAlignment:
                                                  MainAxisAlignment.center,
                                              children: [
                                                Container(
                                                  padding:
                                                      const EdgeInsets.symmetric(
                                                        horizontal: 10,
                                                        vertical: 4,
                                                      ),
                                                  decoration: BoxDecoration(
                                                    gradient: LinearGradient(
                                                      colors: [
                                                        scoreColor.withValues(
                                                          alpha: 0.12,
                                                        ),
                                                        scoreColor.withValues(
                                                          alpha: 0.06,
                                                        ),
                                                      ],
                                                    ),
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                          20,
                                                        ),
                                                  ),
                                                  child: Text(
                                                    p.category.isNotEmpty
                                                        ? p.category[0]
                                                                  .toUpperCase() +
                                                              p.category
                                                                  .substring(1)
                                                        : 'Featured',
                                                    style:
                                                        GoogleFonts.plusJakartaSans(
                                                          color: scoreColor,
                                                          fontSize: 11,
                                                          fontWeight:
                                                              FontWeight.w700,
                                                        ),
                                                  ),
                                                ),
                                                const SizedBox(height: 8),
                                                Text(
                                                  p.name,
                                                  maxLines: 2,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                  style:
                                                      GoogleFonts.plusJakartaSans(
                                                        color:
                                                            context.textPrimary,
                                                        fontSize: 17,
                                                        fontWeight:
                                                            FontWeight.w800,
                                                        letterSpacing: -0.5,
                                                        height: 1.15,
                                                      ),
                                                ),
                                                const SizedBox(height: 8),
                                                if (p.techScore > 0)
                                                  Container(
                                                    padding:
                                                        const EdgeInsets.symmetric(
                                                          horizontal: 10,
                                                          vertical: 5,
                                                        ),
                                                    decoration: BoxDecoration(
                                                      color: AppTheme.accentCyan
                                                          .withValues(
                                                            alpha: 0.12,
                                                          ),
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                            12,
                                                          ),
                                                    ),
                                                    child: Row(
                                                      mainAxisSize:
                                                          MainAxisSize.min,
                                                      children: [
                                                        Icon(
                                                          Icons
                                                              .local_fire_department_rounded,
                                                          size: 13,
                                                          color: AppTheme
                                                              .accentCyan,
                                                        ),
                                                        const SizedBox(
                                                          width: 4,
                                                        ),
                                                        Text(
                                                          '${p.techScore.toInt()}',
                                                          style:
                                                              GoogleFonts.plusJakartaSans(
                                                                fontSize: 12,
                                                                fontWeight:
                                                                    FontWeight
                                                                        .w700,
                                                                color: AppTheme
                                                                    .accentCyan,
                                                              ),
                                                        ),
                                                      ],
                                                    ),
                                                  ),
                                                const SizedBox(height: 10),
                                                Container(
                                                  padding:
                                                      const EdgeInsets.symmetric(
                                                        horizontal: 14,
                                                        vertical: 7,
                                                      ),
                                                  decoration: BoxDecoration(
                                                    gradient: AppTheme
                                                        .primaryGradient,
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                          20,
                                                        ),
                                                  ),
                                                  child: Text(
                                                    'View Details',
                                                    style:
                                                        GoogleFonts.plusJakartaSans(
                                                          fontSize: 11,
                                                          fontWeight:
                                                              FontWeight.w600,
                                                          color: Colors.white,
                                                        ),
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                      ).animate().fadeIn(duration: 400.ms);
                    },
                  ),
                ),
                // Page indicators
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(
                    products.length,
                    (i) => AnimatedContainer(
                      duration: const Duration(milliseconds: 300),
                      margin: const EdgeInsets.symmetric(horizontal: 3),
                      width: i == _currentHeroPage ? 20 : 6,
                      height: 6,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(3),
                        color: i == _currentHeroPage
                            ? AppTheme.neonCyan
                            : context.dividerColor,
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
          loading: () =>
              Container(
                    height: 190,
                    margin: const EdgeInsets.symmetric(horizontal: 20),
                    decoration: BoxDecoration(
                      color: context.surfaceVariantColor,
                      borderRadius: BorderRadius.circular(24),
                    ),
                  )
                  .animate(onPlay: (c) => c.repeat(reverse: true))
                  .shimmer(duration: 1200.ms, color: Colors.white10),
          error: (_, __) => const SizedBox.shrink(),
        );
  }

  // === TRUST STRIP =============================================================

  Widget _buildTrustStrip() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 4),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: Theme.of(context).brightness == Brightness.dark
                ? context.dividerColor
                : Colors.black.withValues(alpha: 0.06),
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            _TrustItem(
              icon: Icons.inventory_2_rounded,
              value: '37K+',
              label: context.l10n?.productsLabel ?? 'Products',
            ),
            _trustDivider(),
            _TrustItem(
              icon: Icons.category_rounded,
              value: '50+',
              label: context.l10n?.categories ?? 'Categories',
            ),
            _trustDivider(),
            _TrustItem(
              icon: Icons.auto_awesome_rounded,
              value: 'AI',
              label: context.l10n?.aiPoweredLabel ?? 'Powered',
            ),
          ],
        ),
      ),
    ).animate().fadeIn(delay: 200.ms, duration: 400.ms);
  }

  Widget _trustDivider() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: 1,
      height: 28,
      color: isDark
          ? context.dividerColor
          : Colors.black.withValues(alpha: 0.08),
    );
  }

  // === CATEGORIES ============================================================

  List<Map<String, Object>> _getCategoryGroups(BuildContext context) {
    final l = context.l10n;
    return [
      {
        'group': l?.catGroupMobile ?? 'Mobile',
        'icon': Icons.smartphone_rounded,
        'color': AppTheme.catMobile,
        'items': [
          {
            'id': 'smartphones',
            'name': l?.catSmartphones ?? 'Smartphones',
            'icon': Icons.smartphone_rounded,
          },
          {
            'id': 'tablets',
            'name': l?.catTablets ?? 'Tablets',
            'icon': Icons.tablet_mac_rounded,
          },
        ],
      },
      {
        'group': l?.catGroupComputers ?? 'Computers',
        'icon': Icons.laptop_rounded,
        'color': AppTheme.catComputers,
        'items': [
          {
            'id': 'laptops',
            'name': l?.catLaptops ?? 'Laptops',
            'icon': Icons.laptop_rounded,
          },
          {
            'id': 'desktops',
            'name': l?.catDesktops ?? 'Desktops',
            'icon': Icons.desktop_windows_rounded,
          },
        ],
      },
      {
        'group': l?.catGroupComponents ?? 'PC Components',
        'icon': Icons.memory_rounded,
        'color': AppTheme.catComponents,
        'items': [
          {
            'id': 'cpus',
            'name': l?.catCpus ?? 'CPUs',
            'icon': Icons.developer_board_rounded,
          },
          {
            'id': 'gpus',
            'name': l?.catGpus ?? 'Graphics Cards',
            'icon': Icons.videogame_asset_rounded,
          },
          {
            'id': 'ram',
            'name': l?.catRam ?? 'RAM',
            'icon': Icons.memory_rounded,
          },
          {
            'id': 'ssd',
            'name': l?.catSsd ?? 'SSDs',
            'icon': Icons.storage_rounded,
          },
          {
            'id': 'motherboards',
            'name': l?.catMotherboards ?? 'Motherboards',
            'icon': Icons.developer_board,
          },
          {
            'id': 'psu',
            'name': l?.catPsu ?? 'Power Supplies',
            'icon': Icons.bolt_rounded,
          },
          {
            'id': 'cases',
            'name': l?.catCases ?? 'Cases',
            'icon': Icons.computer_rounded,
          },
          {
            'id': 'coolers',
            'name': l?.catCoolers ?? 'Coolers',
            'icon': Icons.mode_fan_off_rounded,
          },
          {
            'id': 'monitors',
            'name': l?.catMonitors ?? 'Monitors',
            'icon': Icons.monitor_rounded,
          },
          {
            'id': 'keyboards',
            'name': l?.catKeyboards ?? 'Keyboards',
            'icon': Icons.keyboard_rounded,
          },
          {
            'id': 'mice',
            'name': l?.catMice ?? 'Mice',
            'icon': Icons.mouse_rounded,
          },
          {
            'id': 'webcams',
            'name': l?.catWebcams ?? 'Webcams',
            'icon': Icons.camera_front_rounded,
          },
        ],
      },
      {
        'group': l?.catGroupDisplay ?? 'Display',
        'icon': Icons.tv_rounded,
        'color': AppTheme.catDisplay,
        'items': [
          {'id': 'tvs', 'name': l?.catTvs ?? 'TVs', 'icon': Icons.tv_rounded},
          {
            'id': 'projectors',
            'name': l?.catProjectors ?? 'Projectors',
            'icon': Icons.videocam_rounded,
          },
          {
            'id': 'media-players',
            'name': l?.catMediaPlayers ?? 'Media Players',
            'icon': Icons.play_circle_outline_rounded,
          },
        ],
      },
      {
        'group': l?.catGroupAudio ?? 'Audio',
        'icon': Icons.headphones_rounded,
        'color': AppTheme.catAudio,
        'items': [
          {
            'id': 'headphones',
            'name': l?.catHeadphones ?? 'Headphones',
            'icon': Icons.headphones_rounded,
          },
          {
            'id': 'speakers',
            'name': l?.catSpeakers ?? 'Speakers',
            'icon': Icons.speaker_rounded,
          },
          {
            'id': 'soundbars',
            'name': l?.catSoundbars ?? 'Soundbars',
            'icon': Icons.speaker_group_rounded,
          },
          {
            'id': 'microphones',
            'name': l?.catMicrophones ?? 'Microphones',
            'icon': Icons.mic_rounded,
          },
        ],
      },
      {
        'group': l?.catGroupWearables ?? 'Wearables',
        'icon': Icons.watch_rounded,
        'color': AppTheme.catWearables,
        'items': [
          {
            'id': 'smartwatches',
            'name': l?.catSmartwatches ?? 'Smartwatches',
            'icon': Icons.watch_rounded,
          },
          {
            'id': 'smart-rings',
            'name': l?.catSmartRings ?? 'Smart Rings',
            'icon': Icons.fingerprint_rounded,
          },
        ],
      },
      {
        'group': l?.catGroupCameras ?? 'Cameras',
        'icon': Icons.camera_alt_rounded,
        'color': AppTheme.catCameras,
        'items': [
          {
            'id': 'cameras',
            'name': l?.catCameras ?? 'Cameras',
            'icon': Icons.camera_alt_rounded,
          },
          {
            'id': 'action-cameras',
            'name': l?.catActionCameras ?? 'Action Cameras',
            'icon': Icons.videocam_outlined,
          },
          {
            'id': 'security-cameras',
            'name': l?.catSecurityCameras ?? 'Security Cameras',
            'icon': Icons.security_rounded,
          },
          {
            'id': 'ip-cameras',
            'name': l?.catIpCameras ?? 'IP Cameras',
            'icon': Icons.videocam_rounded,
          },
          {
            'id': 'dashcams',
            'name': l?.catDashcams ?? 'Dashcams',
            'icon': Icons.directions_car_rounded,
          },
          {
            'id': 'gimbals',
            'name': l?.catGimbals ?? 'Gimbals',
            'icon': Icons.camera_rounded,
          },
          {
            'id': 'tripods',
            'name': l?.catTripods ?? 'Tripods',
            'icon': Icons.camera_alt_outlined,
          },
          {
            'id': 'lenses',
            'name': l?.catLenses ?? 'Lenses',
            'icon': Icons.camera_roll_rounded,
          },
        ],
      },
      {
        'group': l?.catGroupGaming ?? 'Gaming',
        'icon': Icons.gamepad_rounded,
        'color': AppTheme.catGaming,
        'items': [
          {
            'id': 'consoles',
            'name': l?.catGamingConsoles ?? 'Gaming Consoles',
            'icon': Icons.gamepad_rounded,
          },
          {
            'id': 'gamepads',
            'name': l?.catGamepads ?? 'Gamepads',
            'icon': Icons.sports_esports_rounded,
          },
          {
            'id': 'vr-headsets',
            'name': l?.catVrHeadsets ?? 'VR Headsets',
            'icon': Icons.vrpano_rounded,
          },
        ],
      },
      {
        'group': l?.catGroupPeripherals ?? 'Peripherals',
        'icon': Icons.print_rounded,
        'color': AppTheme.catPeripherals,
        'items': [
          {
            'id': 'printers',
            'name': l?.catPrinters ?? 'Printers',
            'icon': Icons.print_rounded,
          },
        ],
      },
      {
        'group': l?.catGroupNetworking ?? 'Networking',
        'icon': Icons.router_rounded,
        'color': AppTheme.catNetworking,
        'items': [
          {
            'id': 'routers',
            'name': l?.catRoutersModems ?? 'Routers & Modems',
            'icon': Icons.router_rounded,
          },
        ],
      },
      {
        'group': l?.catGroupSmartHome ?? 'Smart Home',
        'icon': Icons.cleaning_services_rounded,
        'color': AppTheme.catSmartHome,
        'items': [
          {
            'id': 'robot-vacuums',
            'name': l?.catRobotVacuums ?? 'Robot Vacuums',
            'icon': Icons.cleaning_services_rounded,
          },
        ],
      },
      {
        'group': l?.catGroupAccessories ?? 'Accessories',
        'icon': Icons.battery_charging_full_rounded,
        'color': AppTheme.catAccessories,
        'items': [
          {
            'id': 'powerbanks',
            'name': l?.catPowerBanks ?? 'Power Banks',
            'icon': Icons.battery_charging_full_rounded,
          },
          {
            'id': 'e-readers',
            'name': l?.catEReaders ?? 'E-Readers',
            'icon': Icons.book_rounded,
          },
        ],
      },
      {
        'group': l?.catGroupDrones ?? 'Drones',
        'icon': Icons.flight_takeoff_rounded,
        'color': AppTheme.catDrones,
        'items': [
          {
            'id': 'drones',
            'name': l?.catDrones ?? 'Drones',
            'icon': Icons.flight_takeoff_rounded,
          },
        ],
      },
    ];
  }

  // Flat list of individual categories (group color inherited by each item)
  List<Map<String, Object>> _getFlatCategories(BuildContext context) {
    final flat = <Map<String, Object>>[];
    for (final group in _getCategoryGroups(context)) {
      final color = group['color'] as Color;
      for (final item in (group['items'] as List).cast<Map<String, Object>>()) {
        flat.add({
          'id': item['id'] as String,
          'name': item['name'] as String,
          'icon': item['icon'] as IconData? ?? group['icon'] as IconData,
          'color': color,
        });
      }
    }
    return flat;
  }

  void _showAllCategoriesSheet(BuildContext context) {
    HapticFeedback.mediumImpact();
    final categories = _getFlatCategories(context);
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => _AllCategoriesPage(categories: categories),
        fullscreenDialog: false,
      ),
    );
  }

  Widget _buildCategoriesSection() {
    final categories = _getFlatCategories(context);
    final half = (categories.length / 2).ceil();
    final row1 = categories.sublist(0, half);
    final row2 = categories.sublist(half);

    return Column(
      children: [
        SizedBox(
          height: 96,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            physics: const BouncingScrollPhysics(),
            itemCount: row1.length,
            itemBuilder: (context, i) => _buildFlatCategoryChip(row1[i], i),
          ),
        ),
        const SizedBox(height: 6),
        SizedBox(
          height: 96,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            physics: const BouncingScrollPhysics(),
            itemCount: row2.length,
            itemBuilder: (context, i) => _buildFlatCategoryChip(row2[i], i),
          ),
        ),
      ],
    );
  }

  Widget _buildFlatCategoryChip(Map<String, Object> cat, int index) {
    final color = cat['color'] as Color;
    final icon = cat['icon'] as IconData;
    final name = cat['name'] as String;
    final id = cat['id'] as String;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return GestureDetector(
          onTap: () {
            HapticFeedback.selectionClick();
            context.push(
              '${AppRoutes.browse}?id=$id&name=${Uri.encodeComponent(name)}',
            );
          },
          child: Container(
            width: 76,
            margin: const EdgeInsets.only(right: 8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: isDark
                        ? color.withValues(alpha: 0.15)
                        : color.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(icon, color: color, size: 24),
                ),
                const SizedBox(height: 7),
                Text(
                  name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w600,
                    color: context.textPrimary.withValues(alpha: 0.80),
                    height: 1.2,
                  ),
                ),
              ],
            ),
          ),
        )
        .animate()
        .fadeIn(delay: (30 * index).ms, duration: 280.ms)
        .slideX(begin: 0.06, end: 0, duration: 280.ms);
  }

  void _showCategoryBottomSheet(
    BuildContext context,
    String groupName,
    IconData groupIcon,
    Color groupColor,
    List<Map<String, Object>> items,
  ) {
    HapticFeedback.mediumImpact();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => Container(
        decoration: BoxDecoration(
          color: context.surfaceElevatedColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
          border: Border(top: BorderSide(color: context.dividerColor)),
        ),
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 20),
                decoration: BoxDecoration(
                  color: context.dividerColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [groupColor, groupColor.withValues(alpha: 0.7)],
                    ),
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [
                      BoxShadow(
                        color: groupColor.withValues(alpha: 0.3),
                        blurRadius: 8,
                        offset: const Offset(0, 3),
                      ),
                    ],
                  ),
                  child: Icon(groupIcon, color: Colors.white, size: 24),
                ),
                const SizedBox(width: 14),
                Flexible(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        groupName,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 20,
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary,
                        ),
                      ),
                      Text(
                        items.length == 1
                            ? (context.l10n?.oneCategory ?? '1 category')
                            : (context.l10n?.nCategories('${items.length}') ??
                                  '${items.length} categories'),
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13,
                          color: context.textTertiaryColor,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            ...items.map((item) {
              final subIcon = item['icon'] as IconData;
              final subName = item['name'] as String;
              final subId = item['id'] as String;
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: GestureDetector(
                  onTap: () {
                    Navigator.pop(context);
                    context.push(
                      '${AppRoutes.browse}?id=$subId&name=${Uri.encodeComponent(subName)}',
                    );
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 14,
                    ),
                    decoration: BoxDecoration(
                      color: groupColor.withValues(alpha: 0.05),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: groupColor.withValues(alpha: 0.10),
                      ),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            color: groupColor.withValues(alpha: 0.10),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Icon(subIcon, size: 18, color: groupColor),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Text(
                            subName,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                              color: context.textPrimary,
                            ),
                          ),
                        ),
                        Icon(
                          Icons.arrow_forward_ios_rounded,
                          size: 14,
                          color: groupColor.withValues(alpha: 0.5),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
            SizedBox(
              height:
                  MediaQuery.of(context).padding.bottom +
                  AppTheme.navBarTotalClearance,
            ),
          ],
        ),
      ),
    );
  }

  // === PERSONALIZED SECTION ==================================================

  Widget _buildPersonalizedSection() {
    return SizedBox(
      height: _kHorizontalCardRowHeight,
      child: ref
          .watch(personalizedRecommendationsProvider)
          .when(
            data: (products) {
              if (products.isEmpty)
                return Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.auto_awesome_rounded,
                        size: 32,
                        color: context.textTertiaryColor.withValues(alpha: 0.4),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        context.l10n?.noRecommendationsYet ??
                            'No recommendations yet',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13,
                          color: context.textTertiaryColor,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Browse products to get personalized picks',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11,
                          color: context.textTertiaryColor.withValues(
                            alpha: 0.6,
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              final display = products.take(30).toList();
              return ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: _kHorizontalCardRowPadding,
                physics: const BouncingScrollPhysics(),
                itemCount: display.length,
                itemBuilder: (context, index) {
                  final product = display[index];
                  final price =
                      product.getPriceForCountry(
                        ref.read(selectedCountryProvider),
                      ) ??
                      0;
                  return _WideProductCard(
                        product: product,
                        price: price,
                        onTap: () => context.push('/product/${product.id}'),
                      )
                      .animate()
                      .fadeIn(delay: (60 * min(index, 5)).ms, duration: 350.ms)
                      .slideX(begin: 0.05, duration: 350.ms);
                },
              );
            },
            loading: () => _buildSkeletonRow(
              height: _kHorizontalCardRowHeight,
              cardWidth: 155,
            ),
            error: (_, __) => const SizedBox.shrink(),
          ),
    );
  }

  // === WIDE PRODUCT CARDS ====================================================

  // === CONDITIONAL CATEGORY BLOCK ============================================
  // Shows header + products only if the category has data

  List<Widget> _buildCategoryBlock({
    required AsyncValue<HomeFeed> homeFeed,
    required String title,
    required String categoryId,
    required IconData icon,
    required Color iconColor,
    bool wide = true,
  }) {
    final productCount =
        homeFeed.whenOrNull(
          data: (f) => f.byCategory[categoryId]?.length ?? 0,
        ) ??
        0;
    // During loading show skeleton; once loaded, require at least 3 products
    final isLoading = homeFeed.isLoading;
    if (!isLoading && productCount < 1) return [];

    final routeName = categoryId == 'cpus' ? 'CPUs' : title;
    return [
      SliverToBoxAdapter(
        child: _SectionHeader(
          title: title,
          icon: icon,
          iconColor: iconColor,
          onSeeAll: () => context.push(
            '${AppRoutes.browse}?id=$categoryId&name=$routeName',
          ),
        ),
      ),
      SliverToBoxAdapter(
        child: wide
            ? _buildWideProductCards(homeFeed, categoryId)
            : _buildCompactGridSection(homeFeed, categoryId),
      ),
    ];
  }

  // === WIDE PRODUCT CARDS ====================================================

  Widget _buildWideProductCards(
    AsyncValue<HomeFeed> homeFeed,
    String categoryId,
  ) {
    return SizedBox(
      height: _kHorizontalCardRowHeight,
      child: homeFeed.when(
        data: (feed) {
          var products = feed.byCategory[categoryId] ?? [];
          if (products.isEmpty) return const SizedBox.shrink();

          // Sort products within category by user relevance
          final user = ref.read(userProfileProvider).valueOrNull;
          if (user != null) {
            final algo = ref.read(profileAlgorithmServiceProvider);
            final behavior =
                ref.read(behaviorSignalsProvider).valueOrNull ??
                BehaviorSignals.empty;
            products = algo.sortByRelevance(
              user: user,
              products: products,
              behavior: behavior,
            );
          }

          return ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: _kHorizontalCardRowPadding,
            physics: const BouncingScrollPhysics(),
            itemCount: min(30, products.length),
            itemBuilder: (context, index) {
              final p = products[index];
              final price =
                  p.getPriceForCountry(ref.read(selectedCountryProvider)) ?? 0;
              return Align(
                alignment: Alignment.topCenter,
                child:
                    _WideProductCard(
                          product: p,
                          price: price,
                          onTap: () => context.push('/product/${p.id}'),
                        )
                        .animate()
                        .fadeIn(
                          delay: (50 * min(index, 5)).ms,
                          duration: 300.ms,
                        )
                        .slideX(begin: 0.06, duration: 300.ms),
              );
            },
          );
        },
        loading: () => _buildSkeletonRow(
          height: _kHorizontalCardRowHeight,
          cardWidth: 155,
        ),
        error: (_, __) => const SizedBox.shrink(),
      ),
    );
  }

  // === COMPACT GRID SECTION (now horizontal scroll) ===========================

  Widget _buildCompactGridSection(
    AsyncValue<HomeFeed> homeFeed,
    String categoryId,
  ) {
    return SizedBox(
      height: _kHorizontalCardRowHeight,
      child: homeFeed.when(
        data: (feed) {
          var products = feed.byCategory[categoryId] ?? [];
          if (products.isEmpty) return const SizedBox.shrink();

          final user = ref.read(userProfileProvider).valueOrNull;
          if (user != null) {
            final algo = ref.read(profileAlgorithmServiceProvider);
            final behavior =
                ref.read(behaviorSignalsProvider).valueOrNull ??
                BehaviorSignals.empty;
            products = algo.sortByRelevance(
              user: user,
              products: products,
              behavior: behavior,
            );
          }

          final display = products.take(30).toList();
          return ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: _kHorizontalCardRowPadding,
            physics: const BouncingScrollPhysics(),
            itemCount: display.length,
            itemBuilder: (context, index) {
              final p = display[index];
              final price =
                  p.getPriceForCountry(ref.read(selectedCountryProvider)) ?? 0;
              return _WideProductCard(
                    product: p,
                    price: price,
                    onTap: () => context.push('/product/${p.id}'),
                  )
                  .animate()
                  .fadeIn(delay: (50 * min(index, 5)).ms, duration: 300.ms)
                  .slideX(begin: 0.06, duration: 300.ms);
            },
          );
        },
        loading: () => _buildSkeletonRow(
          height: _kHorizontalCardRowHeight,
          cardWidth: 155,
        ),
        error: (_, __) => const SizedBox.shrink(),
      ),
    );
  }

  // === TRENDING ==============================================================

  Widget _buildTrendsSection(AsyncValue<HomeFeed> homeFeed) {
    return SizedBox(
      height: _kHorizontalCardRowHeight,
      child: homeFeed.when(
        data: (feed) {
          if (!_firstDataLogged) {
            _firstDataLogged = true;
            debugPrint(
              '=== COMPAIR: HomeScreen first data render in ${_initSw.elapsedMilliseconds}ms (${feed.all.length} products) ===',
            );
          }
          final trending = feed.trending;
          if (trending.isEmpty)
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.local_fire_department_rounded,
                    size: 32,
                    color: context.textTertiaryColor.withValues(alpha: 0.4),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'No trending products yet',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13,
                      color: context.textTertiaryColor,
                    ),
                  ),
                ],
              ),
            );
          final display = trending.take(30).toList();
          return ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: _kHorizontalCardRowPadding,
            physics: const BouncingScrollPhysics(),
            itemCount: display.length,
            itemBuilder: (context, index) {
              final p = display[index];
              final price =
                  p.getPriceForCountry(ref.read(selectedCountryProvider)) ?? 0;
              return _TrendingWideCard(
                    rank: index + 1,
                    product: p,
                    price: price,
                    onTap: () => p.id.isNotEmpty
                        ? context.push('/product/${p.id}')
                        : null,
                  )
                  .animate()
                  .fadeIn(delay: (50 * min(index, 5)).ms, duration: 300.ms)
                  .slideX(begin: 0.06, duration: 300.ms);
            },
          );
        },
        loading: () => _buildSkeletonRow(
          height: _kHorizontalCardRowHeight,
          cardWidth: 155,
        ),
        error: (e, __) =>
            _buildRetryWidget(onRetry: () => ref.invalidate(homeFeedProvider)),
      ),
    );
  }

  // === NEW ARRIVALS ==========================================================

  Widget _buildNewArrivalsSection() {
    return SizedBox(
      height: _kHorizontalCardRowHeight,
      child: ref
          .watch(newArrivalsProvider)
          .when(
            data: (products) {
              if (products.isEmpty)
                return Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.fiber_new_rounded,
                        size: 32,
                        color: context.textTertiaryColor.withValues(alpha: 0.4),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'No new arrivals yet',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13,
                          color: context.textTertiaryColor,
                        ),
                      ),
                    ],
                  ),
                );
              return ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: _kHorizontalCardRowPadding,
                physics: const BouncingScrollPhysics(),
                itemCount: products.length,
                itemBuilder: (context, index) {
                  final p = products[index];
                  final price =
                      p.getPriceForCountry(ref.read(selectedCountryProvider)) ??
                      0;
                  return _WideProductCard(
                        product: p,
                        price: price,
                        showNewBadge: true,
                        onTap: () => context.push('/product/${p.id}'),
                      )
                      .animate()
                      .fadeIn(delay: (60 * min(index, 5)).ms, duration: 300.ms)
                      .slideX(begin: 0.06, duration: 300.ms);
                },
              );
            },
            loading: () => _buildSkeletonRow(
              height: _kHorizontalCardRowHeight,
              cardWidth: 155,
            ),
            error: (_, __) => _buildRetryWidget(
              onRetry: () => ref.invalidate(newArrivalsProvider),
            ),
          ),
    );
  }

  // === DISCOVER (Hidden Gems) ================================================

  Widget _buildDiscoverSection() {
    return SizedBox(
      height: _kHorizontalCardRowHeight,
      child: ref
          .watch(discoverProductsProvider)
          .when(
            data: (products) {
              if (products.isEmpty)
                return Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.explore_rounded,
                        size: 32,
                        color: context.textTertiaryColor.withValues(alpha: 0.4),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Hidden gems coming soon',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13,
                          color: context.textTertiaryColor,
                        ),
                      ),
                    ],
                  ),
                );
              return ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: _kHorizontalCardRowPadding,
                physics: const BouncingScrollPhysics(),
                itemCount: products.length,
                itemBuilder: (context, index) {
                  final p = products[index];
                  final price =
                      p.getPriceForCountry(ref.read(selectedCountryProvider)) ??
                      0;
                  return _WideProductCard(
                        product: p,
                        price: price,
                        showNewBadge: false,
                        onTap: () => context.push('/product/${p.id}'),
                      )
                      .animate()
                      .fadeIn(delay: (60 * min(index, 5)).ms, duration: 300.ms)
                      .slideX(begin: 0.06, duration: 300.ms);
                },
              );
            },
            loading: () => _buildSkeletonRow(
              height: _kHorizontalCardRowHeight,
              cardWidth: 155,
            ),
            error: (_, __) => _buildRetryWidget(
              onRetry: () => ref.invalidate(discoverProductsProvider),
            ),
          ),
    );
  }

  // === TOP IN CATEGORY (dynamic) =============================================

  List<Widget> _buildTopInCategorySection() {
    return ref
        .watch(topInCategoryProvider)
        .when(
          data: (data) {
            if (data.category.isEmpty || data.products.isEmpty) return [];
            final catName =
                data.category[0].toUpperCase() + data.category.substring(1);
            return [
              SliverToBoxAdapter(
                child: _SectionHeader(
                  title: 'Top in $catName',
                  icon: Icons.star_rounded,
                  iconColor: AppTheme.gold,
                  subtitle: 'Based on your browsing',
                  onSeeAll: () => context.push(
                    '${AppRoutes.browse}?id=${data.category}&name=$catName',
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: SizedBox(
                  height: _kHorizontalCardRowHeight,
                  child: ListView.builder(
                    scrollDirection: Axis.horizontal,
                    padding: _kHorizontalCardRowPadding,
                    physics: const BouncingScrollPhysics(),
                    itemCount: data.products.length,
                    itemBuilder: (context, index) {
                      final p = data.products[index];
                      final price =
                          p.getPriceForCountry(
                            ref.read(selectedCountryProvider),
                          ) ??
                          0;
                      return _WideProductCard(
                            product: p,
                            price: price,
                            onTap: () => context.push('/product/${p.id}'),
                          )
                          .animate()
                          .fadeIn(
                            delay: (50 * min(index, 5)).ms,
                            duration: 300.ms,
                          )
                          .slideX(begin: 0.06, duration: 300.ms);
                    },
                  ),
                ),
              ),
            ];
          },
          loading: () => [],
          error: (_, __) => [],
        );
  }

  // === RECENTLY ANALYZED =====================================================

  List<Widget> _buildRecentlyAnalyzedSection() {
    return ref
        .watch(recentlyAnalyzedProvider)
        .when(
          data: (products) {
            if (products.isEmpty) return [];
            return [
              SliverToBoxAdapter(
                child: _SectionHeader(
                  title: context.l10n?.recentlyViewed ?? 'Recently Analyzed',
                  icon: Icons.psychology_rounded,
                  iconColor: AppTheme.brandCyan,
                  subtitle: 'Products you analyzed with AI',
                ),
              ),
              SliverToBoxAdapter(
                child: SizedBox(
                  height: _kHorizontalCardRowHeight,
                  child: ListView.builder(
                    scrollDirection: Axis.horizontal,
                    padding: _kHorizontalCardRowPadding,
                    physics: const BouncingScrollPhysics(),
                    itemCount: products.length,
                    itemBuilder: (context, index) {
                      final p = products[index];
                      final price =
                          p.getPriceForCountry(
                            ref.read(selectedCountryProvider),
                          ) ??
                          0;
                      return _WideProductCard(
                            product: p,
                            price: price,
                            onTap: () => context.push('/product/${p.id}'),
                          )
                          .animate()
                          .fadeIn(
                            delay: (50 * min(index, 5)).ms,
                            duration: 300.ms,
                          )
                          .slideX(begin: 0.06, duration: 300.ms);
                    },
                  ),
                ),
              ),
            ];
          },
          loading: () => [],
          error: (_, __) => [],
        );
  }

  // === VALUE PICKS ===========================================================

  List<Widget> _buildValuePicksSection() {
    return ref
        .watch(valuePicsProvider)
        .when(
          data: (products) {
            if (products.isEmpty) return [];
            return [
              SliverToBoxAdapter(
                child: _SectionHeader(
                  title: 'Best Value',
                  icon: Icons.trending_up_rounded,
                  iconColor: const Color(0xFF10B981),
                  subtitle: 'High performance, great price',
                  onSeeAll: () => context.push(AppRoutes.search),
                ),
              ),
              SliverToBoxAdapter(
                child: SizedBox(
                  height: _kHorizontalCardRowHeight,
                  child: ListView.builder(
                    scrollDirection: Axis.horizontal,
                    padding: _kHorizontalCardRowPadding,
                    physics: const BouncingScrollPhysics(),
                    itemCount: products.length,
                    itemBuilder: (context, index) {
                      final p = products[index];
                      final price =
                          p.getPriceForCountry(
                            ref.read(selectedCountryProvider),
                          ) ??
                          0;
                      return _WideProductCard(
                            product: p,
                            price: price,
                            onTap: () => context.push('/product/${p.id}'),
                          )
                          .animate()
                          .fadeIn(
                            delay: (50 * min(index, 5)).ms,
                            duration: 300.ms,
                          )
                          .slideX(begin: 0.06, duration: 300.ms);
                    },
                  ),
                ),
              ),
            ];
          },
          loading: () => [],
          error: (_, __) => [],
        );
  }

  // === QUICK COMPARE =========================================================

  Widget _buildQuickCompareSection(AsyncValue userProfile) {
    return SizedBox(
      height: 185,
      child: ref
          .watch(predefinedComparisonsProvider)
          .when(
            data: (comparisons) {
              if (comparisons.isEmpty) return _buildQuickCompareFallback();
              return ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 20),
                physics: const BouncingScrollPhysics(),
                itemCount: comparisons.length,
                itemBuilder: (context, index) {
                  final comp = comparisons[index];
                  final parts = (comp.title ?? 'A vs B').split(' vs ');
                  return _CompareCard(
                        product1: parts.isNotEmpty ? parts[0] : 'A',
                        product2: parts.length > 1 ? parts[1] : 'B',
                        onTap: () {
                          ref
                              .read(comparisonNotifierProvider.notifier)
                              .clearSelection();
                          for (final id in comp.itemIds) {
                            ref
                                .read(comparisonNotifierProvider.notifier)
                                .toggleProduct(id);
                          }
                          context.push(AppRoutes.compare);
                        },
                      )
                      .animate()
                      .fadeIn(delay: (60 * min(index, 5)).ms, duration: 300.ms)
                      .slideX(begin: 0.05, duration: 300.ms);
                },
              );
            },
            loading: () => _buildSkeletonRow(height: 185, cardWidth: 155),
            error: (_, __) => _buildQuickCompareFallback(),
          ),
    );
  }

  Widget _buildQuickCompareFallback() {
    return ref
        .watch(trendingProductsProvider)
        .when(
          data: (products) {
            if (products.length < 2) return const SizedBox.shrink();
            final pairs = <List<ProductEntity>>[];
            for (int i = 0; i + 1 < products.length; i += 2) {
              pairs.add([products[i], products[i + 1]]);
            }
            return ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 20),
              physics: const BouncingScrollPhysics(),
              itemCount: pairs.length,
              itemBuilder: (context, index) {
                final pair = pairs[index];
                return _CompareCard(
                  product1: pair[0].name,
                  product2: pair[1].name,
                  imageURL1: pair[0].imageURL,
                  imageURL2: pair[1].imageURL,
                  onTap: () {
                    ref
                        .read(comparisonNotifierProvider.notifier)
                        .clearSelection();
                    ref
                        .read(comparisonNotifierProvider.notifier)
                        .toggleProduct(pair[0].id);
                    ref
                        .read(comparisonNotifierProvider.notifier)
                        .toggleProduct(pair[1].id);
                    context.push(AppRoutes.compare);
                  },
                );
              },
            );
          },
          loading: () => _buildSkeletonRow(height: 185, cardWidth: 155),
          error: (_, __) => const SizedBox.shrink(),
        );
  }

  // === DYNAMIC USER SECTIONS =================================================

  /// Recently Viewed section — shows products user has recently viewed from Firestore
  List<Widget> _buildRecentlyViewedSection() {
    final recentAsync = ref.watch(recentlyViewedProductsProvider);
    final recentProducts = recentAsync.valueOrNull ?? [];
    if (recentProducts.isEmpty) return [];

    return [
      SliverToBoxAdapter(
        child: _SectionHeader(
          title: context.l10n?.recentlyViewed ?? 'Recently Viewed',
          icon: Icons.history_rounded,
          iconColor: const Color(0xFF6366F1),
          onSeeAll: () => context.push(AppRoutes.recentlyViewed),
        ),
      ),
      SliverToBoxAdapter(
        child: SizedBox(
          height: _kHorizontalCardRowHeight,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: _kHorizontalCardRowPadding,
            physics: const BouncingScrollPhysics(),
            itemCount: min(15, recentProducts.length),
            itemBuilder: (context, index) {
              final p = recentProducts[index];
              final price =
                  p.getPriceForCountry(ref.read(selectedCountryProvider)) ?? 0;
              return _WideProductCard(
                product: p,
                price: price,
                onTap: () => context.push('/product/${p.id}'),
              ).animate().fadeIn(delay: (50 * index).ms, duration: 300.ms);
            },
          ),
        ),
      ),
    ];
  }

  /// Dynamic category sections — ordered by user behavior & profile priority
  List<Widget> _buildPriorityCategorySections(AsyncValue<HomeFeed> homeFeed) {
    final sections = <Widget>[];

    final priorityCategories =
        homeFeed.whenOrNull(data: (f) => f.priorityCategories) ?? [];

    // Use priority order from feed; show first 6 as wide, rest as compact
    final categoriesToShow = priorityCategories.isNotEmpty
        ? priorityCategories
        : [
            'smartphones',
            'laptops',
            'tablets',
            'headphones',
            'smartwatches',
            'gpus',
          ];

    int shown = 0;
    for (final category in categoriesToShow) {
      final productCount =
          homeFeed.whenOrNull(
            data: (f) => f.byCategory[category]?.length ?? 0,
          ) ??
          0;
      final isLoading = homeFeed.isLoading;
      if (!isLoading && productCount < 4) continue;

      final info = _categoryMeta(category);
      final isWide = shown < 6; // First 6 categories are wide cards
      sections.addAll(
        _buildCategoryBlock(
          homeFeed: homeFeed,
          title: info['title'] as String,
          categoryId: category,
          icon: info['icon'] as IconData,
          iconColor: info['color'] as Color,
          wide: isWide,
        ),
      );
      shown++;
    }
    return sections;
  }

  Map<String, dynamic> _categoryMeta(String cat) {
    final l = context.l10n;
    final meta = <String, Map<String, dynamic>>{
      'smartphones': {
        'title': l?.smartphones ?? 'Smartphones',
        'icon': Icons.smartphone_rounded,
      },
      'laptops': {
        'title': l?.laptops ?? 'Laptops',
        'icon': Icons.laptop_rounded,
      },
      'tablets': {
        'title': l?.catTablets ?? 'Tablets',
        'icon': Icons.tablet_mac_rounded,
      },
      'gpus': {
        'title': l?.catGpus ?? 'Graphics Cards',
        'icon': Icons.videogame_asset_rounded,
      },
      'desktops': {
        'title': l?.catDesktops ?? 'Desktops',
        'icon': Icons.desktop_windows_rounded,
      },
      'headphones': {
        'title': l?.catHeadphones ?? 'Headphones',
        'icon': Icons.headphones_rounded,
      },
      'tvs': {'title': l?.catTvs ?? 'TVs & Displays', 'icon': Icons.tv_rounded},
      'monitors': {
        'title': l?.monitors ?? 'Monitors',
        'icon': Icons.monitor_rounded,
      },
      'smartwatches': {
        'title': l?.catSmartwatches ?? 'Smartwatches',
        'icon': Icons.watch_rounded,
      },
      'cameras': {
        'title': l?.catCameras ?? 'Cameras',
        'icon': Icons.camera_alt_rounded,
      },
      'consoles': {
        'title': l?.catConsoles ?? 'Consoles',
        'icon': Icons.gamepad_rounded,
      },
      'speakers': {
        'title': l?.catSpeakers ?? 'Speakers',
        'icon': Icons.speaker_rounded,
      },
      'routers': {
        'title': l?.catRouters ?? 'Networking',
        'icon': Icons.router_rounded,
      },
      'drones': {
        'title': l?.catDrones ?? 'Drones',
        'icon': Icons.flight_rounded,
      },
      'robot-vacuums': {
        'title': l?.catRobotVacuums ?? 'Robot Vacuums',
        'icon': Icons.smart_toy_rounded,
      },
      'keyboards': {
        'title': l?.catKeyboards ?? 'Keyboards',
        'icon': Icons.keyboard_rounded,
      },
      'mice': {'title': l?.catMice ?? 'Mice', 'icon': Icons.mouse_rounded},
      'cpus': {
        'title': l?.processors ?? 'Processors',
        'icon': Icons.developer_board_rounded,
      },
      'gamepads': {
        'title': l?.catGamepads ?? 'Gamepads',
        'icon': Icons.sports_esports_rounded,
      },
      'webcams': {
        'title': l?.catWebcams ?? 'Webcams',
        'icon': Icons.videocam_rounded,
      },
      'dashcams': {
        'title': l?.catDashcams ?? 'Dashcams',
        'icon': Icons.directions_car_rounded,
      },
      'media-players': {
        'title': l?.catMediaPlayers ?? 'Media Players',
        'icon': Icons.live_tv_rounded,
      },
      'cases': {
        'title': l?.catCases ?? 'Cases',
        'icon': Icons.inventory_2_rounded,
      },
      'soundbars': {'title': 'Soundbars', 'icon': Icons.surround_sound_rounded},
      'microphones': {'title': 'Microphones', 'icon': Icons.mic_rounded},
      'smart-rings': {
        'title': 'Smart Rings',
        'icon': Icons.ring_volume_rounded,
      },
      'e-readers': {'title': 'E-Readers', 'icon': Icons.menu_book_rounded},
      'vr-headsets': {'title': 'VR Headsets', 'icon': Icons.vrpano_rounded},
      'motherboards': {'title': 'Motherboards', 'icon': Icons.memory_rounded},
      'ram': {'title': 'RAM', 'icon': Icons.storage_rounded},
      'ssd': {'title': 'SSD & Storage', 'icon': Icons.sd_storage_rounded},
      'psu': {'title': 'Power Supplies', 'icon': Icons.power_rounded},
      'coolers': {'title': 'Coolers', 'icon': Icons.ac_unit_rounded},
      'printers': {'title': 'Printers', 'icon': Icons.print_rounded},
      'projectors': {'title': 'Projectors', 'icon': Icons.videocam_rounded},
      'gimbals': {'title': 'Gimbals', 'icon': Icons.control_camera_rounded},
      'tripods': {
        'title': 'Tripods',
        'icon': Icons.filter_center_focus_rounded,
      },
      'lenses': {'title': 'Lenses', 'icon': Icons.camera_rounded},
      'earphones': {'title': 'Earphones', 'icon': Icons.earbuds_rounded},
    };
    final info =
        meta[cat] ??
        {
          'title': cat.replaceAll('-', ' ').replaceAll('_', ' '),
          'icon': Icons.devices_rounded,
        };
    return {...info, 'color': AppTheme.categoryColor(cat)};
  }

  Widget _buildCategoryProductsRow(
    AsyncValue<HomeFeed> homeFeed,
    String category,
  ) {
    return SizedBox(
      height: _kHorizontalCardRowHeight,
      child: homeFeed.when(
        data: (feed) {
          final products = feed.byCategory[category] ?? [];
          if (products.isEmpty) return const SizedBox.shrink();
          return ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: _kHorizontalCardRowPadding,
            physics: const BouncingScrollPhysics(),
            itemCount: min(25, products.length),
            itemBuilder: (context, index) {
              final p = products[index];
              final price =
                  p.getPriceForCountry(ref.read(selectedCountryProvider)) ?? 0;
              return _WideProductCard(
                product: p,
                price: price,
                onTap: () => context.push('/product/${p.id}'),
              ).animate().fadeIn(delay: (50 * index).ms, duration: 300.ms);
            },
          );
        },
        loading: () => _buildSkeletonRow(
          height: _kHorizontalCardRowHeight,
          cardWidth: 155,
        ),
        error: (_, __) => const SizedBox.shrink(),
      ),
    );
  }
  // === SUBSCRIPTION INTELLIGENCE BANNER =======================================

  // === SKELETON ==============================================================

  Widget _buildSkeletonRow({
    required double height,
    required double cardWidth,
  }) {
    return ProductRowSkeleton(
      height: height,
      cardWidth: cardWidth,
      itemCount: 5,
    );
  }

  Widget _buildRetryWidget({required VoidCallback onRetry}) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.wifi_off_rounded, size: 32, color: Colors.grey.shade400),
            const SizedBox(height: 8),
            Text(
              'Yüklenemedi',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 13,
                color: Colors.grey.shade500,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 8),
            GestureDetector(
              onTap: onRetry,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: AppTheme.primaryBlue.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  'Tekrar Dene',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 13,
                    color: AppTheme.primaryBlue,
                    fontWeight: FontWeight.w600,
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

// ============================================================================
// REUSABLE WIDGETS
// ============================================================================

class _AppBarButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final bool isPremium;
  final String? tooltip;
  const _AppBarButton({
    required this.icon,
    required this.onTap,
    this.isPremium = false,
    this.tooltip,
  });

  @override
  Widget build(BuildContext context) {
    final button = GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      child: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          gradient: isPremium ? AppTheme.premiumGradient : null,
          color: isPremium
              ? null
              : context.textTertiaryColor.withValues(alpha: 0.07),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isPremium
                ? AppTheme.premiumChampagne.withValues(alpha: 0.45)
                : context.dividerColor,
            width: 0.5,
          ),
          boxShadow: isPremium
              ? [
                  BoxShadow(
                    color: AppTheme.premiumGold.withValues(alpha: 0.30),
                    blurRadius: 10,
                    offset: const Offset(0, 3),
                  ),
                ]
              : null,
        ),
        child: Icon(
          icon,
          size: 20,
          color: isPremium ? Colors.white : context.textTertiaryColor,
        ),
      ),
    );
    if (tooltip == null || tooltip!.isEmpty) return button;
    return Tooltip(
      message: tooltip!,
      preferBelow: true,
      child: Semantics(button: true, label: tooltip, child: button),
    );
  }
}

class _NotificationButton extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unreadCount = ref.watch(unreadNotificationCountProvider);
    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        context.push(AppRoutes.notifications);
      },
      child: SizedBox(
        width: 38,
        height: 38,
        child: Stack(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: context.textTertiaryColor.withValues(alpha: 0.07),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: context.dividerColor, width: 0.5),
              ),
              child: Icon(
                Icons.notifications_none_rounded,
                size: 20,
                color: context.textTertiaryColor,
              ),
            ),
            if (unreadCount > 0)
              Positioned(
                top: 2,
                right: 2,
                child: Container(
                  width: 16,
                  height: 16,
                  decoration: BoxDecoration(
                    color: AppTheme.error,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: Theme.of(context).scaffoldBackgroundColor,
                      width: 1.5,
                    ),
                  ),
                  child: Center(
                    child: Text(
                      unreadCount > 9 ? '9+' : '$unreadCount',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 8,
                        fontWeight: FontWeight.w700,
                      ),
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

class _SectionHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final IconData? icon;
  final Color? iconColor;
  final VoidCallback? onSeeAll;
  const _SectionHeader({
    required this.title,
    this.subtitle,
    this.icon,
    this.iconColor,
    this.onSeeAll,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 28, 20, 12),
      child: Row(
        children: [
          if (icon != null) ...[
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    (iconColor ?? AppTheme.brandBlue).withValues(alpha: 0.20),
                    (iconColor ?? AppTheme.brandCyan).withValues(alpha: 0.10),
                  ],
                ),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: (iconColor ?? AppTheme.brandCyan).withValues(
                    alpha: 0.18,
                  ),
                  width: 0.5,
                ),
              ),
              child: Icon(
                icon,
                size: 17,
                color: iconColor ?? AppTheme.brandCyan,
              ),
            ),
            const SizedBox(width: 10),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: context.textPrimary,
                    letterSpacing: -0.3,
                  ),
                ),
                if (subtitle != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(
                      subtitle!,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        color: context.textSecondary,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          if (onSeeAll != null)
            GestureDetector(
              onTap: onSeeAll,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 7,
                ),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      AppTheme.brandBlue.withValues(alpha: 0.12),
                      AppTheme.brandCyan.withValues(alpha: 0.06),
                    ],
                  ),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: AppTheme.brandBlue.withValues(alpha: 0.15),
                    width: 0.5,
                  ),
                ),
                child: Text(
                  context.l10n?.seeAll ?? 'See All',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.brandCyan,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _TechBadge extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _TechBadge({
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.speed_rounded, size: 12, color: color),
          const SizedBox(width: 4),
          Text(
            '$label $value',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

// === FOR YOU CARD =============================================================

class _ForYouCard extends StatelessWidget {
  final ProductEntity product;
  final double price;
  final int fitScore;
  final VoidCallback onTap;
  const _ForYouCard({
    required this.product,
    required this.price,
    required this.fitScore,
    required this.onTap,
  });

  Color _fitColor(int s) => s >= 80
      ? const Color(0xFF10B981)
      : s >= 60
      ? const Color(0xFFF59E0B)
      : const Color(0xFF94A3B8);
  Color _techColor(double s) => s >= 85
      ? const Color(0xFF10B981)
      : s >= 70
      ? const Color(0xFFF59E0B)
      : s >= 50
      ? const Color(0xFFF97316)
      : const Color(0xFFEF4444);

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 170,
        margin: const EdgeInsets.only(right: 12),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: Theme.of(context).brightness == Brightness.dark
                ? context.dividerColor
                : Colors.black.withValues(alpha: 0.06),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Stack(
              children: [
                Container(
                  height: 110,
                  width: double.infinity,
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: const BorderRadius.vertical(
                      top: Radius.circular(20),
                    ),
                  ),
                  child: ProductImageBox(
                    imageUrl: product.imageURL.isNotEmpty
                        ? product.imageURL
                        : null,
                    height: 94,
                    borderRadius: BorderRadius.circular(12),
                    padding: EdgeInsets.zero,
                  ),
                ),
                if (fitScore > 0)
                  Positioned(
                    top: 8,
                    right: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 7,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: _fitColor(fitScore),
                        borderRadius: BorderRadius.circular(10),
                        boxShadow: [
                          BoxShadow(
                            color: _fitColor(fitScore).withValues(alpha: 0.4),
                            blurRadius: 6,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.favorite_rounded,
                            size: 10,
                            color: Colors.white,
                          ),
                          const SizedBox(width: 3),
                          Text(
                            '$fitScore%',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                if (product.techScore > 0)
                  Positioned(
                    top: 8,
                    left: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: context.surfaceElevatedColor,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: context.dividerColor),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.speed_rounded,
                            size: 10,
                            color: _techColor(product.techScore),
                          ),
                          const SizedBox(width: 3),
                          Text(
                            '${product.techScore.toInt()}',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: _techColor(product.techScore),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (product.brand != null)
                    Text(
                      product.brand!,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 10,
                        color: context.textTertiaryColor,
                        fontWeight: FontWeight.w500,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  const SizedBox(height: 2),
                  Text(
                    product.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: context.textPrimary,
                      height: 1.15,
                    ),
                  ),
                  const SizedBox(height: 4),
                  if (price > 0)
                    Text(
                      '\$${price.toStringAsFixed(0)}',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.neonCyan,
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

// === WIDE PRODUCT CARD ========================================================

class _WideProductCard extends StatelessWidget {
  final ProductEntity product;
  final double price;
  final bool showNewBadge;
  final VoidCallback onTap;
  const _WideProductCard({
    required this.product,
    required this.price,
    this.showNewBadge = false,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 155,
        margin: const EdgeInsets.only(right: 12),
        decoration: BoxDecoration(
          color: isDark ? context.surfaceVariantColor : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: AppTheme.brandCyan.withValues(alpha: 0.15),
            width: 0.8,
          ),
          boxShadow: context.cardShadow,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            // Image section
            Stack(
              children: [
                Container(
                  height: 105,
                  width: double.infinity,
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: const BorderRadius.vertical(
                      top: Radius.circular(16),
                    ),
                  ),
                  child: ProductImageBox(
                    imageUrl: product.imageURL.isNotEmpty
                        ? product.imageURL
                        : null,
                    height: 89,
                    borderRadius: BorderRadius.circular(10),
                    padding: EdgeInsets.zero,
                  ),
                ),
                if (showNewBadge)
                  Positioned(
                    top: 7,
                    left: 7,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        'NEW',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 8,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  ),
                if (product.techScore > 0)
                  Positioned(
                    top: 7,
                    right: 7,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        gradient: AppTheme.primaryGradient,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.local_fire_department_rounded,
                            size: 10,
                            color: Colors.white,
                          ),
                          const SizedBox(width: 2),
                          Text(
                            '${product.techScore.toInt()}',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
            // Details section
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 6, 10, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (product.brand != null && product.brand!.isNotEmpty)
                    Text(
                      product.brand!.toUpperCase(),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 9,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.accentCyan,
                        letterSpacing: 0.6,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  const SizedBox(height: 3),
                  Text(
                    product.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: context.textPrimary,
                      height: 1.15,
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      decoration: BoxDecoration(
                        gradient: AppTheme.primaryGradient,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        context.l10n?.viewDetails ?? 'View Details',
                        textAlign: TextAlign.center,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
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

class _MiniScore extends StatelessWidget {
  final double value;
  final String label;
  const _MiniScore({required this.value, required this.label});

  @override
  Widget build(BuildContext context) {
    final color = value >= 85
        ? const Color(0xFF10B981)
        : value >= 70
        ? const Color(0xFFF59E0B)
        : const Color(0xFFF97316);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.speed_rounded, size: 11, color: color),
          const SizedBox(width: 3),
          Text(
            '${value.toInt()}',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

// === COMPACT PRODUCT CARD =====================================================

class _CompactProductCard extends StatelessWidget {
  final ProductEntity product;
  final double price;
  final bool showNewBadge;
  final VoidCallback onTap;
  const _CompactProductCard({
    required this.product,
    required this.price,
    this.showNewBadge = false,
    required this.onTap,
  });

  Color _techColor(double s) => s >= 85
      ? const Color(0xFF10B981)
      : s >= 70
      ? const Color(0xFFF59E0B)
      : s >= 50
      ? const Color(0xFFF97316)
      : const Color(0xFFEF4444);

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 155,
        margin: const EdgeInsets.only(right: 12),
        decoration: BoxDecoration(
          color: Theme.of(context).brightness == Brightness.dark
              ? context.surfaceVariantColor
              : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: AppTheme.brandCyan.withValues(alpha: 0.15),
            width: 0.8,
          ),
          boxShadow: context.cardShadow,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: const BorderRadius.vertical(
                      top: Radius.circular(20),
                    ),
                  ),
                  child: ProductImageBox(
                    imageUrl: product.imageURL.isNotEmpty
                        ? product.imageURL
                        : null,
                    height: 94,
                    borderRadius: BorderRadius.circular(10),
                    padding: EdgeInsets.zero,
                  ),
                ),
                if (showNewBadge)
                  Positioned(
                    top: 8,
                    left: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFF10B981),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        context.l10n?.newBadge ?? 'NEW',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                          letterSpacing: 0.5,
                        ),
                      ),
                    ),
                  ),
                if (product.techScore > 0)
                  Positioned(
                    top: 8,
                    right: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        gradient: AppTheme.primaryGradient,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        '${product.techScore.toInt()}',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 6, 10, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (product.brand != null)
                    Text(
                      product.brand!,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 10,
                        color: context.textTertiaryColor,
                        fontWeight: FontWeight.w500,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  const SizedBox(height: 2),
                  Text(
                    product.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: context.textPrimary,
                      height: 1.15,
                    ),
                  ),
                  if (price > 0) ...[
                    const SizedBox(height: 3),
                    Text(
                      '\$${price.toStringAsFixed(0)}',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.primaryBlue,
                      ),
                    ),
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

// === TREND CARD ===============================================================

class _TrendCard extends StatelessWidget {
  final int rank;
  final String name;
  final String imageURL;
  final String? productId;
  const _TrendCard({
    required this.rank,
    required this.name,
    this.imageURL = '',
    this.productId,
  });

  @override
  Widget build(BuildContext context) {
    final rankColors = [Colors.amber, const Color(0xFF94A3B8), Colors.orange];
    return GestureDetector(
      onTap: productId != null && productId!.isNotEmpty
          ? () => context.push('/product/$productId')
          : null,
      child: Container(
        width: 140,
        margin: const EdgeInsets.only(right: 12),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: AppTheme.brandCyan.withValues(alpha: 0.12)),
          boxShadow: context.cardShadow,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Stack(
              children: [
                Container(
                  height: 100,
                  width: double.infinity,
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: const BorderRadius.vertical(
                      top: Radius.circular(20),
                    ),
                  ),
                  child: ProductImageBox(
                    imageUrl: imageURL.isNotEmpty ? imageURL : null,
                    height: 84,
                    borderRadius: BorderRadius.circular(10),
                    padding: EdgeInsets.zero,
                  ),
                ),
                Positioned(
                  top: 6,
                  left: 6,
                  child: Container(
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      color: rank <= 3
                          ? rankColors[rank - 1]
                          : context.surfaceElevatedColor,
                      borderRadius: BorderRadius.circular(8),
                      boxShadow: rank <= 3
                          ? [
                              BoxShadow(
                                color: rankColors[rank - 1].withValues(
                                  alpha: 0.4,
                                ),
                                blurRadius: 4,
                              ),
                            ]
                          : null,
                    ),
                    child: Center(
                      child: Text(
                        '#$rank',
                        style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w800,
                          fontSize: 10,
                          color: rank <= 3 ? Colors.white : context.textPrimary,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 6, 10, 10),
              child: Text(
                name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: context.textPrimary,
                  height: 1.15,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// === TRENDING WIDE CARD =======================================================

class _TrendingWideCard extends StatelessWidget {
  final int rank;
  final ProductEntity product;
  final double price;
  final VoidCallback? onTap;
  const _TrendingWideCard({
    required this.rank,
    required this.product,
    required this.price,
    this.onTap,
  });

  Color get _rankColor => rank == 1
      ? Colors.amber
      : rank == 2
      ? const Color(0xFF94A3B8)
      : rank == 3
      ? Colors.orange
      : const Color(0xFF6366F1);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 155,
        margin: const EdgeInsets.only(right: 12),
        decoration: BoxDecoration(
          color: isDark ? context.surfaceVariantColor : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: AppTheme.brandCyan.withValues(alpha: 0.12),
            width: 0.8,
          ),
          boxShadow: [
            BoxShadow(
              color: AppTheme.brandCyan.withValues(alpha: 0.06),
              blurRadius: 10,
              spreadRadius: -2,
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            // Image section with rank badge
            Stack(
              children: [
                Container(
                  height: 105,
                  width: double.infinity,
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: const BorderRadius.vertical(
                      top: Radius.circular(16),
                    ),
                  ),
                  child: ProductImageBox(
                    imageUrl: product.imageURL.isNotEmpty
                        ? product.imageURL
                        : null,
                    height: 89,
                    borderRadius: BorderRadius.circular(10),
                    padding: EdgeInsets.zero,
                  ),
                ),
                Positioned(
                  top: 7,
                  left: 7,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: rank <= 3
                          ? _rankColor
                          : context.surfaceElevatedColor,
                      borderRadius: BorderRadius.circular(8),
                      boxShadow: rank <= 3
                          ? [
                              BoxShadow(
                                color: _rankColor.withValues(alpha: 0.4),
                                blurRadius: 4,
                              ),
                            ]
                          : null,
                    ),
                    child: Text(
                      '#$rank',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 9,
                        fontWeight: FontWeight.w800,
                        color: rank <= 3 ? Colors.white : context.textPrimary,
                      ),
                    ),
                  ),
                ),
                if (product.techScore > 0)
                  Positioned(
                    top: 7,
                    right: 7,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        gradient: AppTheme.primaryGradient,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.local_fire_department_rounded,
                            size: 10,
                            color: Colors.white,
                          ),
                          const SizedBox(width: 2),
                          Text(
                            '${product.techScore.toInt()}',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
            // Details section
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 6, 10, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (product.brand != null && product.brand!.isNotEmpty)
                    Text(
                      product.brand!.toUpperCase(),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 9,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.accentCyan,
                        letterSpacing: 0.6,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  const SizedBox(height: 3),
                  Text(
                    product.name,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: context.textPrimary,
                      height: 1.15,
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      decoration: BoxDecoration(
                        gradient: AppTheme.primaryGradient,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        'View Details',
                        textAlign: TextAlign.center,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
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

// === COMPARE CARD =============================================================

class _CompareCard extends StatelessWidget {
  final String product1;
  final String product2;
  final String imageURL1;
  final String imageURL2;
  final VoidCallback onTap;
  const _CompareCard({
    required this.product1,
    required this.product2,
    this.imageURL1 = '',
    this.imageURL2 = '',
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 180,
        margin: const EdgeInsets.only(right: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: context.dividerColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _CmpImg(url: imageURL1),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 6),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 7,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      gradient: AppTheme.primaryGradient,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      'VS',
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w900,
                        fontSize: 10,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
                _CmpImg(url: imageURL2),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '$product1 vs $product2',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: context.textPrimary,
              ),
            ),
            const SizedBox(height: 3),
            Text(
              context.l10n?.compareNowSmall ?? 'Compare now',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: AppTheme.primaryBlue,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CmpImg extends StatelessWidget {
  final String url;
  const _CmpImg({required this.url});
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 50,
      height: 50,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.dividerColor),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(13),
        child: url.isNotEmpty
            ? CachedNetworkImage(
                imageUrl: url,
                fit: BoxFit.contain,
                errorWidget: (_, __, ___) => Icon(
                  Icons.devices,
                  size: 28,
                  color: context.textTertiaryColor,
                ),
                placeholder: (_, __) => Icon(
                  Icons.devices,
                  size: 28,
                  color: context.textTertiaryColor,
                ),
              )
            : Icon(Icons.devices, size: 28, color: context.textTertiaryColor),
      ),
    );
  }
}

// === SKELETON CARD ============================================================

// _SkeletonCard retired — see ProductRowSkeleton/ProductCardSkeleton in
// lib/presentation/widgets/shimmer_skeleton.dart (shimmer-based premium loader).

// === QUICK ACTION =============================================================

class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Gradient gradient;
  final VoidCallback onTap;
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.gradient,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        onTap();
      },
      child: Column(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              gradient: gradient,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: (gradient as LinearGradient).colors.first.withValues(
                    alpha: 0.3,
                  ),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Icon(icon, color: Colors.white, size: 24),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: context.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

// === TRUST ITEM ===============================================================

class _TrustItem extends StatelessWidget {
  final IconData icon;
  final String value;
  final String label;
  const _TrustItem({
    required this.icon,
    required this.value,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ShaderMask(
          shaderCallback: (bounds) =>
              AppTheme.primaryGradient.createShader(bounds),
          child: Icon(icon, size: 18, color: Colors.white),
        ),
        const SizedBox(width: 8),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              value,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 14,
                fontWeight: FontWeight.w800,
                color: context.textPrimary,
              ),
            ),
            Text(
              label,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 10,
                color: context.textTertiaryColor,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Full-page All Categories
// ─────────────────────────────────────────────────────────────────────────────

class _AllCategoriesPage extends StatefulWidget {
  const _AllCategoriesPage({required this.categories});
  final List<Map<String, Object>> categories;

  @override
  State<_AllCategoriesPage> createState() => _AllCategoriesPageState();
}

class _AllCategoriesPageState extends State<_AllCategoriesPage> {
  final _searchCtrl = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final filtered = _query.isEmpty
        ? widget.categories
        : widget.categories
              .where(
                (c) => (c['name'] as String).toLowerCase().contains(
                  _query.toLowerCase(),
                ),
              )
              .toList();

    return Scaffold(
      backgroundColor: isDark ? context.surfaceColor : AppTheme.surfaceLight,
      appBar: AppBar(
        backgroundColor: isDark ? context.surfaceColor : AppTheme.surfaceLight,
        elevation: 0,
        leading: IconButton(
          icon: Icon(
            Icons.arrow_back_rounded,
            color: isDark ? context.textPrimary : AppTheme.textPrimaryLight,
          ),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(
          'All Categories',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: isDark ? context.textPrimary : AppTheme.textPrimaryLight,
          ),
        ),
        actions: [
          Container(
            margin: const EdgeInsets.only(right: 16),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: AppTheme.primaryBlue.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              '${filtered.length}',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: AppTheme.primaryBlue,
              ),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: TextField(
              controller: _searchCtrl,
              onChanged: (v) => setState(() => _query = v),
              style: GoogleFonts.plusJakartaSans(
                fontSize: 14,
                color: isDark ? context.textPrimary : AppTheme.textPrimaryLight,
              ),
              decoration: InputDecoration(
                hintText: 'Search categories...',
                hintStyle: GoogleFonts.plusJakartaSans(
                  fontSize: 14,
                  color: isDark
                      ? context.textSecondary
                      : AppTheme.textSecondaryLight,
                ),
                prefixIcon: Icon(
                  Icons.search_rounded,
                  color: isDark
                      ? context.textSecondary
                      : AppTheme.textSecondaryLight,
                  size: 20,
                ),
                suffixIcon: _query.isNotEmpty
                    ? IconButton(
                        icon: Icon(
                          Icons.close_rounded,
                          color: isDark
                              ? context.textSecondary
                              : AppTheme.textSecondaryLight,
                          size: 18,
                        ),
                        onPressed: () {
                          _searchCtrl.clear();
                          setState(() => _query = '');
                        },
                      )
                    : null,
                filled: true,
                fillColor: isDark
                    ? context.surfaceVariantColor
                    : AppTheme.surfaceVariantLight,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 10,
                ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              itemCount: filtered.length,
              itemBuilder: (ctx, i) {
                final cat = filtered[i];
                final color = cat['color'] as Color;
                final icon = cat['icon'] as IconData;
                final name = cat['name'] as String;
                final id = cat['id'] as String;
                return ListTile(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    Navigator.of(context).pop();
                    context.push(
                      '${AppRoutes.browse}?id=$id&name=${Uri.encodeComponent(name)}',
                    );
                  },
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 2,
                  ),
                  leading: Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(icon, color: color, size: 22),
                  ),
                  title: Text(
                    name,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: isDark
                          ? context.textPrimary
                          : AppTheme.textPrimaryLight,
                    ),
                  ),
                  trailing: Icon(
                    Icons.chevron_right_rounded,
                    size: 18,
                    color: isDark
                        ? context.textTertiaryColor
                        : AppTheme.textSecondaryLight,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  tileColor: Colors.transparent,
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
