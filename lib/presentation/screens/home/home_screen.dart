/// Qor AI - Dynamic Home Screen (iOS-style redesign)
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
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/core/product_name_localizer.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/presentation/widgets/qor_badges.dart';
import 'package:qor_ai/presentation/widgets/product_image_box.dart';
import 'package:qor_ai/presentation/widgets/shimmer_skeleton.dart';
import 'package:qor_ai/routing/router.dart';
import 'package:qor_ai/core/pb_client.dart';

// ============================================================================
// HOME SCREEN
// ============================================================================

const double _kHorizontalCardRowHeight = 246;
const EdgeInsets _kHorizontalCardRowPadding = EdgeInsets.fromLTRB(20, 8, 20, 8);
// Yatay listelerde ilk render'da yalnızca viewport + lookahead kadar ürün.
// ListView.builder lazy çalışsa da, itemCount yüksek olduğunda ilk frame'de
// extra layout/measurement maliyeti oluşturuyordu (24 -> 12 -> 8).
// Viewport ~3 kart + cacheExtent → ~5 kart fiilen build edilir; kullanıcı
// kaydırdığında ek kartlar `_HomeScreenState.didUpdateWidget` veya
// section provider'ı ile gelir.
// Keep the first shelf payload light; users still get enough horizontal scroll
// while image decode and item bookkeeping stay small on mid-range devices.
const int _kHorizontalInitialItemLimit = 8;
// card width (132) + right margin (12) = fixed item extent avoids per-frame layout calc.
// Daraltıldı (155 → 132): kartlar artık daha kompakt, satıra ~2.8 kart sığar ve
// görsel kutusu (132×132) kare olur → "enine geniş/şişkin" görünüm giderildi.
const double _kCardItemExtent = 144.0;
// ignore: unused_element
const int _kInitialCategoryChipLimit = 18;
// Progressive category rendering — start light, add on scroll
const int _kInitialVisibleCategories = 10;
const int _kCategoryLoadIncrement = 6;
const int _kMaxVisibleCategories = 30;

// ── Card widget BorderRadius constants — avoids per-build allocation ─────────
const BorderRadius _kRadius16 = BorderRadius.all(Radius.circular(16));
const BorderRadius _kRadius12 = BorderRadius.all(Radius.circular(12));
const BorderRadius _kRadius10 = BorderRadius.all(Radius.circular(10));
const BorderRadius _kRadius8 = BorderRadius.all(Radius.circular(8));
// Pre-computed border colors — withValues() cannot be const but static final
// ensures only ONE Color instance is created for the entire app lifetime.
final Color _kCardBorderColor = AppTheme.brandCyan.withValues(alpha: 0.15);
final Color _kTrendingBorderColor = AppTheme.brandCyan.withValues(alpha: 0.12);
const BoxDecoration _kCardImageContainerDecoration = BoxDecoration(
  color: Colors.white,
  borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
);

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});
  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen>
    with TickerProviderStateMixin {
  late final ScrollController _scrollCtrl;
  Timer? _scrollDebounce;
  Timer? _stageFallbackTimer;
  final Stopwatch _initSw = Stopwatch();
  bool _firstDataLogged = false;

  // Persist scroll position across tab switches
  static double _savedScrollOffset = 0.0;

  // ── Staged rendering: her postFrame'de tek bir section parti açılır.
  // Categories Stage 0'a alındı (feed-bağımsız, ListView.builder lazy).
  // 0 = AppBar (skeleton) + SearchBar + Categories  ← TÜM feed-bağımsız UI
  // 1 = atlanır (Categories Stage 0'a entegre)
  // 2 = + Real AppBar + For You                    <- feed-aware
  // 3 = + Trending
  // 4 = + QuizReminder + TopInCategory + RecentlyViewed + RecentlyAnalyzed
  // 5 = + NewArrivals
  // 6 = + Priority + ValuePicks
  // 7 = + Discover
  int _renderStage = 0;
  static const int _kMaxRenderStage = 7;
  // Feed READY guard: feed AsyncValue.data state'e geçmeden Stage 2+
  // açılmaz. Aksi halde shimmer→gerçek geçiş tüm Consumer'ları aynı anda
  // rebuild eder → büyük spike. Feed hazır olunca kademeli olarak açılır.
  bool _feedReadyForReveal = false;

  // ── Progressive category rendering: start with few, add on scroll ──
  int _visibleCategoryCount = _kInitialVisibleCategories;

  // ── Category chip cache: rebuilt only when locale changes ──
  List<Map<String, Object>>? _cachedFlatCategories;
  Locale? _cachedCategoriesLocale;

  // ── CategoryMeta cache: 40+ girişli Map'i her çağrıda yeniden kurmaktan kaçın ──
  Map<String, Map<String, dynamic>>? _cachedCategoryMetaMap;
  Locale? _cachedCategoryMetaLocale;

  // ── BlockedIds cache: rebuilt only when feed instance changes ──
  HomeFeed? _cachedBlockedIdsFeed;
  Set<String>? _cachedBlockedIds;

  @override
  void initState() {
    super.initState();
    _initSw.start();
    debugPrint('=== QOR AI: HomeScreen initState ===');
    _scrollCtrl = ScrollController(initialScrollOffset: _savedScrollOffset);
    _scrollCtrl.addListener(_handleScroll);
    _stageFallbackTimer = Timer(const Duration(milliseconds: 1400), () {
      if (!mounted || _renderStage >= 2) return;
      _onFeedReady();
    });
    // Stage 0 tüm feed-bağımsız UI'ı (AppBar skeleton + SearchBar +
    // Categories) içeriyor. Stage 2+ feed READY ile _onFeedReady'den
    // tetiklenir; otomatik Stage 1'e atlama yok (gereksiz frame).
  }

  /// homeFeedProvider AsyncValue.data state'e ilk kez geçtiğinde çağrılır.
  /// Feed hazır olunca TÜM stage'leri tek frame'de aç. Eskiden stage'ler
  /// 140ms aralıkla kademeli açılıyordu → ekran ilk ~1-3sn boyunca "section
  /// section beliriyor" gibi görünüp içerik aşağı kayıyordu (kullanıcı
  /// şikayeti: "ekran bir anda değişiyor, yukarıdaki ürünler aşağı geliyor").
  /// CustomScrollView slivers'ları ZATEN lazy — ekran dışı section'lar
  /// (Trending altı) viewport'a girene kadar build EDİLMEZ, dolayısıyla
  /// hepsini aynı anda "eligible" yapmak ekran dışı iş yaratmaz; sadece
  /// görünür section'lar (Kategoriler + For You + Trending başı) build olur.
  void _onFeedReady() {
    if (_feedReadyForReveal) return;
    _feedReadyForReveal = true;
    if (mounted && _renderStage < _kMaxRenderStage) {
      setState(() {
        _renderStage = _kMaxRenderStage;
      });
    }
  }

  void _handleScroll() {
    if (!_scrollCtrl.hasClients) return;
    _scrollDebounce?.cancel();
    _stageFallbackTimer?.cancel();
    _scrollDebounce = Timer(const Duration(milliseconds: 100), () {
      _savedScrollOffset = _scrollCtrl.offset;
      // Load more category sections as the user scrolls near the bottom.
      _maybeLoadMoreCategories();
    });
  }

  void _maybeLoadMoreCategories() {
    if (!_scrollCtrl.hasClients) return;
    final pos = _scrollCtrl.position;
    if (pos.pixels > pos.maxScrollExtent * 0.65 &&
        _visibleCategoryCount < _kMaxVisibleCategories) {
      if (mounted) {
        setState(() {
          _visibleCategoryCount =
              (_visibleCategoryCount + _kCategoryLoadIncrement).clamp(
                0,
                _kMaxVisibleCategories,
              );
        });
      }
    }
  }

  @override
  void dispose() {
    // Save scroll position for when user returns
    _scrollDebounce?.cancel();
    if (_scrollCtrl.hasClients) {
      _savedScrollOffset = _scrollCtrl.offset;
    }
    _scrollCtrl.dispose();
    super.dispose();
  }

  // === BUILD ================================================================

  @override
  Widget build(BuildContext context) {
    // Feed READY guard: feed AsyncValue.data state'e ilk kez geçtiğinde
    // stage motoruna haber ver. Stage 2+ ancak feed hazır olunca açılır
    // → shimmer→data geçişinin Consumer rebuild dalgası önlenir.
    ref.listen<AsyncValue<HomeFeed>>(homeFeedProvider, (prev, next) {
      if (next.hasValue || next.hasError) {
        _onFeedReady();
      }
    });
    // In-memory cache hit (tab switch / fast restart) durumunda listener
    // tetiklenmez çünkü değişim yoktur. Anlık state'i de kontrol et.
    if (!_feedReadyForReveal) {
      final current = ref.read(homeFeedProvider);
      if (current.hasValue || current.hasError) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _onFeedReady();
        });
      }
    }
    return Scaffold(
      resizeToAvoidBottomInset: false,
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
          // 800 → 250 → 100: kapsam alanını minimum yararlı seviyeye indir.
          // 100 px = ~1 satır lookahead. Off-screen sliver'ları (özellikle
          // alt section'ları) sadece kullanıcı yaklaştığında build eder.
          // Bu, ilk frame'de "tüm yatay listeleri önden hazırlama"
          // maliyetini neredeyse sıfırlar.
          cacheExtent: 100,
          physics: const BouncingScrollPhysics(
            parent: AlwaysScrollableScrollPhysics(),
          ),
          slivers: [
            // ── STAGE 0: PROVIDER-BAĞIMSIZ statik iskelet ─────────────────
            // Hiçbir Consumer/ref.watch yok → ilk frame'de provider rebuild
            // storm yaratmaz. SearchBar zaten statik. AppBar/QuizReminder
            // skeleton versiyonlar; gerçek (Consumer'lı) versiyonlar Stage
            // 1'de yerlerini alır. Skeleton ve real aynı boyutta → swap
            // anında layout shift olmaz.
            // ── STAGE 0: Skeleton AppBar + SearchBar + Categories ────────
            // Tüm feed-bağımsız UI ilk frame'de paint olur. Categories
            // ListView.builder zaten lazy → viewport dışı chip'ler build
            // edilmiyor → maliyet trivial.
            if (_renderStage < 2)
              _buildStaticAppBarSkeleton(context)
            else
              _buildAppBar(context),
            SliverToBoxAdapter(child: _buildSearchBar(context)),
            SliverToBoxAdapter(
              child: _SectionHeader(
                title: context.l10n?.categories ?? 'Categories',
              ),
            ),
            SliverToBoxAdapter(
              child: RepaintBoundary(child: _buildCategoriesSection()),
            ),

            // ── STAGE 2: Real AppBar (üstte değişti) + For You ───────────
            if (_renderStage >= 2) ...[
              SliverToBoxAdapter(
                child: Consumer(
                  builder: (context, ref, _) {
                    final userProfile = ref.watch(userProfileProvider);
                    return _SectionHeader(
                      title: context.l10n?.forYou ?? 'For You',
                      icon: Icons.auto_awesome_rounded,
                      iconColor: const Color(0xFFF59E0B),
                      subtitle: _getPersonalizationSubtitle(userProfile),
                      onSeeAll: () => context.push(AppRoutes.search),
                    );
                  },
                ),
              ),
              SliverToBoxAdapter(child: _buildPersonalizedSection()),
            ],

            // ── STAGE 3: Trending ────────────────────────────────────────
            if (_renderStage >= 3) ...[
              SliverToBoxAdapter(
                child: _SectionHeader(
                  title: context.l10n?.trendingToday ?? 'Trending Today',
                  icon: Icons.memory_rounded,
                  iconColor: const Color(0xFFEF4444),
                  onSeeAll: () => context.push(AppRoutes.search),
                ),
              ),
              SliverToBoxAdapter(child: _buildTrendsSection()),
            ],

            // ── STAGE 4: QuizReminder + TopInCat + RecentlyViewed + Analyzed
            // QuizReminder Stage 0'dan Stage 3'e taşındı: categoryCovers
            // network call + CachedNetworkImage decode artık ilk frame'i
            // bloklamaz.
            if (_renderStage >= 4) ...[
              _buildQuizReminder(),
              ..._buildTopInCategorySection(),
              ..._buildRecentlyViewedSection(),
              ..._buildRecentlyAnalyzedSection(),
            ],

            // ── STAGE 5: NewArrivals (tek section, izole) ────────────────
            if (_renderStage >= 5) ...[
              // ─── NEW ARRIVALS
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
            ],

            // ── STAGE 6: Priority categories + ValuePicks ────────────────
            if (_renderStage >= 6) ...[
              ..._buildPriorityCategorySections(),
              ..._buildValuePicksSection(),
            ],

            // ── STAGE 7: Discover (en alt, ekran dışı genelde) ───────────
            if (_renderStage >= 7) ...[
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
            ],

            const SliverToBoxAdapter(child: SizedBox(height: 120)),
          ],
        ),
      ),
    );
  }

  String _uiText({required String tr, required String en}) {
    return Localizations.localeOf(context).languageCode.toLowerCase() == 'tr'
        ? tr
        : en;
  }

  // === HELPERS ===============================================================

  String? _getPersonalizationSubtitle(AsyncValue userProfile) {
    return userProfile.when(
      data: (user) {
        if (user == null) {
          return _uiText(
            tr: 'Trend secimleri • bu haftanin en populerleri',
            en: 'Trending picks • most popular this week',
          );
        }
        if (!user.quizCompleted) {
          return context.l10n?.completeProfileSuggestion ??
              'Complete your profile for better picks';
        }
        final parts = <String>[];

        // Part 1: Audience descriptor
        if (user.profession != null && user.profession != 'other') {
          final labels = {
            'engineer':
                context.l10n?.engineers ??
                _uiText(tr: 'Muhendisler', en: 'Engineers'),
            'designer':
                context.l10n?.designers ??
                _uiText(tr: 'Tasarimcilar', en: 'Designers'),
            'student':
                context.l10n?.students ??
                _uiText(tr: 'Ogrenciler', en: 'Students'),
            'manager':
                context.l10n?.managers ??
                _uiText(tr: 'Yoneticiler', en: 'Managers'),
            'healthcare':
                context.l10n?.healthcarePros ??
                _uiText(tr: 'Saglik profesyonelleri', en: 'Healthcare pros'),
            'teacher':
                context.l10n?.teachers ??
                _uiText(tr: 'Ogretmenler', en: 'Teachers'),
            'finance':
                context.l10n?.financePros ??
                _uiText(tr: 'Finans profesyonelleri', en: 'Finance pros'),
          };
          final label = labels[user.profession];
          final eco = user.ecosystem == 'apple'
              ? 'Apple '
              : user.ecosystem == 'android'
              ? 'Android '
              : '';
          if (label != null) {
            parts.add(
              _uiText(
                tr: '$eco$label icin sectiklerimiz',
                en: 'Picks for $eco$label',
              ),
            );
          } else {
            parts.add(
              _uiText(tr: 'Sana ozel secimler', en: 'Personal picks for you'),
            );
          }
        } else {
          final ecosystem = user.ecosystem == 'apple'
              ? 'Apple'
              : user.ecosystem == 'android'
              ? 'Android'
              : null;
          if (ecosystem != null) {
            parts.add(
              _uiText(
                tr: '$ecosystem kullanicilari icin secildi',
                en: 'Curated for $ecosystem users',
              ),
            );
          } else {
            parts.add(
              _uiText(tr: 'Senin icin secildi', en: 'Personalized for you'),
            );
          }
        }

        // Part 2: Budget or activity hint
        final budget = user.budgetRange;
        if (budget == 'premium' || budget == 'high') {
          parts.add(_uiText(tr: 'premium oneriler', en: 'premium picks'));
        } else if (budget == 'low') {
          parts.add(_uiText(tr: 'uygun fiyat odakli', en: 'budget-friendly'));
        } else if (budget == 'mid') {
          parts.add(
            _uiText(tr: 'orta segment oneriler', en: 'mid-range picks'),
          );
        } else {
          parts.add(
            _uiText(tr: 'etkinligine gore', en: 'based on your activity'),
          );
        }

        return parts.join(' • ');
      },
      loading: () => null,
      error: (error, stackTrace) => _uiText(
        tr: 'Trend secimleri • bu haftanin en populerleri',
        en: 'Trending picks • most popular this week',
      ),
    );
  }

  // === APP BAR ===============================================================

  Widget _buildAppBar(BuildContext context) {
    return SliverToBoxAdapter(
      child: Consumer(
        builder: (context, ref, _) {
          final userProfile = ref.watch(userProfileProvider);
          return _buildAppBarContent(context, ref, userProfile);
        },
      ),
    );
  }

  /// Stage 0 statik AppBar — provider izlemiyor, ilk frame'de bloke etmez.
  /// Gerçek AppBar (Consumer'lı) ile aynı yükseklik/iskelet → Stage 1'de
  /// swap olduğunda layout shift yok, kullanıcı sadece içeriğin "doldu"
  /// hissini alır. Greeting zamana göre statik string; avatar default
  /// gradient placeholder; credit badge boş "..".
  Widget _buildStaticAppBarSkeleton(BuildContext context) {
    final hour = DateTime.now().hour;
    final isNight = hour < 5 || hour >= 22;
    final greetingEmoji = isNight
        ? '🌙'
        : hour < 12
        ? '🌅'
        : hour < 17
        ? '☀️'
        : '🌙';
    final greetingText = isNight
        ? (context.l10n?.goodEvening ?? 'Good evening')
        : hour < 12
        ? (context.l10n?.goodMorning ?? 'Good morning')
        : hour < 17
        ? (context.l10n?.goodAfternoon ?? 'Good afternoon')
        : (context.l10n?.goodEvening ?? 'Good evening');
    return SliverToBoxAdapter(
      child: RepaintBoundary(
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
              child: Row(
                children: [
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
                            'Qor AI',
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
                          '$greetingEmoji $greetingText',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: context.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  // Avatar placeholder — opens profile even before feed loads.
                  GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () {
                      HapticFeedback.lightImpact();
                      context.push(AppRoutes.profile);
                    },
                    child: Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(13),
                        gradient: AppTheme.primaryGradient,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildAppBarContent(
    BuildContext context,
    WidgetRef ref,
    AsyncValue userProfile,
  ) {
    final hour = DateTime.now().hour;
    final isNight = hour < 5 || hour >= 22;
    final greetingEmoji = isNight
        ? '🌙'
        : hour < 12
        ? '🌅'
        : hour < 17
        ? '☀️'
        : '🌙';
    final greetingText = isNight
        ? (context.l10n?.goodEvening ?? 'Good evening')
        : hour < 12
        ? (context.l10n?.goodMorning ?? 'Good morning')
        : hour < 17
        ? (context.l10n?.goodAfternoon ?? 'Good afternoon')
        : (context.l10n?.goodEvening ?? 'Good evening');
    final greeting = '$greetingEmoji $greetingText';

    // Resolve first name: entity ÔåÆ authStore displayName ÔåÆ authStore name
    String? resolveFirstName() {
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

    final userName = resolveFirstName();
    final isPremium = ref.watch(
      subscriptionServiceProvider.select((s) => s.isPremium),
    );
    final remainingCredits = ref.watch(
      subscriptionServiceProvider.select((s) => s.remainingDailyCredits),
    );

    return Container(
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
                            isPremium ? 'Premium' : 'Qor AI',
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
                          userName != null ? '$greeting, $userName' : greeting,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: context.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  QorAmountBadge(
                    amount: remainingCredits,
                    unlimited: isPremium,
                    color: AppTheme.brandBlue,
                    fontSize: 12,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                  ),
                  const SizedBox(width: 8),
                  _NotificationButton(),
                  if (!isPremium) ...[
                    const SizedBox(width: 8),
                    _AppBarButton(
                      icon: Icons.diamond_rounded,
                      tooltip: context.l10n?.premium ?? 'Premium',
                      onTap: () => context.push(AppRoutes.premium),
                      isPremium: true,
                    ),
                  ],
                  const SizedBox(width: 8),
                  // Profile avatar ÔÇö gradient ring border for premium look
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
    );
  }

  /// Avatar widget that instantly shows Firebase Auth user's photo (sync)
  /// and upgrades to Firestore profile data when stream resolves.
  Widget _buildAvatarWidget(AsyncValue userProfile) {
    final fallbackName = _resolveAvatarName(userProfile);
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
            memCacheWidth: 114,
            maxWidthDiskCache: 114,
            fadeInDuration: const Duration(milliseconds: 100),
            errorWidget: (context, url, error) =>
                _buildAvatarFallback(name: fallbackName),
          );
        }
        return _buildAvatarFallback(name: fallbackName);
      },
    );
    if (firestoreWidget != null) return firestoreWidget;

    // PB not ready yet (loading) ÔÇö use pb.authStore.record (sync, instant)
    final authRecord = pb.authStore.record;
    if (authRecord != null) {
      final photoURL = authRecord.getStringValue('photoURL').trim();
      if (photoURL.isNotEmpty && !_isGeneratedAvatarUrl(photoURL)) {
        return CachedNetworkImage(
          imageUrl: photoURL,
          width: 38,
          height: 38,
          fit: BoxFit.cover,
          memCacheWidth: 114,
          maxWidthDiskCache: 114,
          fadeInDuration: const Duration(milliseconds: 100),
          errorWidget: (context, url, error) =>
              _buildAvatarFallback(name: fallbackName),
        );
      }
      return _buildAvatarFallback(name: fallbackName);
    }

    return _buildAvatarFallback(name: fallbackName);
  }

  String _resolveAvatarName(AsyncValue userProfile) {
    final String? fromProfile = userProfile.whenOrNull<String?>(
      data: (user) => user?.displayName.trim(),
    );
    if (fromProfile != null && fromProfile.isNotEmpty) {
      return fromProfile;
    }

    final authRecord = pb.authStore.record;
    if (authRecord != null) {
      final displayName = authRecord.getStringValue('displayName').trim();
      if (displayName.isNotEmpty) return displayName;
      final name = authRecord.getStringValue('name').trim();
      if (name.isNotEmpty) return name;
      final email = authRecord.getStringValue('email').trim();
      if (email.isNotEmpty) return email.split('@').first;
    }

    return 'Qor AI';
  }

  bool _isGeneratedAvatarUrl(String? photoUrl) {
    final value = (photoUrl ?? '').trim().toLowerCase();
    return value.contains('ui-avatars.com');
  }

  Widget _buildAvatarFallback({required String name}) {
    final palette =
        _homeAvatarPalettes[_homeAvatarSeed(name) % _homeAvatarPalettes.length];
    final initials = _homeAvatarInitials(name);
    return Container(
      width: 38,
      height: 38,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: palette,
        ),
      ),
      child: Center(
        child: Text(
          initials,
          style: GoogleFonts.plusJakartaSans(
            color: Colors.white,
            fontSize: initials.length > 1 ? 13 : 16,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.5,
          ),
        ),
      ),
    );
  }

  static const List<List<Color>> _homeAvatarPalettes = [
    [Color(0xFF0EA5E9), Color(0xFF2563EB)],
    [Color(0xFF06B6D4), Color(0xFF0F766E)],
    [Color(0xFF8B5CF6), Color(0xFF4F46E5)],
    [Color(0xFFF97316), Color(0xFFEA580C)],
    [Color(0xFF10B981), Color(0xFF059669)],
  ];

  int _homeAvatarSeed(String name) {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return 0;
    return trimmed.codeUnits.fold<int>(0, (sum, unit) => sum + unit);
  }

  String _homeAvatarInitials(String name) {
    final parts = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .toList(growable: false);
    if (parts.isEmpty) return 'Q';
    if (parts.length == 1) {
      final part = parts.first;
      return part.substring(0, part.length >= 2 ? 2 : 1).toUpperCase();
    }
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }

  // === QUIZ REMINDER =========================================================

  Widget _buildQuizReminder() {
    return SliverToBoxAdapter(
      child: Consumer(
        builder: (context, ref, _) {
          final userProfile = ref.watch(userProfileProvider);
          final covers =
              ref.watch(categoryCoversProvider).valueOrNull ??
              const <String, String>{};
          final heroImage =
              covers['smartphones'] ??
              covers['laptops'] ??
              covers['headphones'];
          return _buildQuizReminderBody(userProfile, heroImage);
        },
      ),
    );
  }

  Widget _buildQuizReminderBody(AsyncValue userProfile, String? heroImage) {
    return userProfile.when(
      data: (user) {
        if (user != null && !user.quizCompleted) {
          return RepaintBoundary(
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
                              memCacheWidth: 720,
                              maxWidthDiskCache: 720,
                              fadeInDuration: const Duration(milliseconds: 150),
                              errorWidget: (context, url, error) =>
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
            ).animate().fadeIn(duration: 400.ms),
          );
        }
        return const SizedBox.shrink();
      },
      loading: () => const SizedBox.shrink(),
      error: (error, stackTrace) => const SizedBox.shrink(),
    );
  }

  // === SEARCH BAR ============================================================

  Widget _buildSearchBar(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return RepaintBoundary(
      child:
          Padding(
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
                        GestureDetector(
                          onTap: () {
                            HapticFeedback.lightImpact();
                            context.push(AppRoutes.visualScanner);
                          },
                          child: Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: AppTheme.brandBlue.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Icon(
                              Icons.document_scanner_rounded,
                              size: 20,
                              color: AppTheme.brandBlue,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              )
              .animate()
              .fadeIn(duration: 300.ms),
    );
  }

  // === CATEGORIES ============================================================

  List<Map<String, Object>> _getCategoryGroups(BuildContext context) {
    final l = context.l10n;
    final isTr =
        Localizations.localeOf(context).languageCode.toLowerCase() == 'tr';
    String label({required String tr, required String en}) => isTr ? tr : en;
    Map<String, Object> item(String id, String name, IconData icon) => {
      'id': id,
      'name': name,
      'icon': icon,
    };

    return [
      {
        'group': label(tr: 'Mobil', en: 'Mobile'),
        'icon': Icons.smartphone_rounded,
        'color': AppTheme.catMobile,
        'items': [
          item(
            'smartphones',
            l?.catSmartphones ?? 'Smartphones',
            Icons.smartphone_rounded,
          ),
          item(
            'smartwatches',
            l?.catSmartwatches ?? 'Smartwatches',
            Icons.watch_rounded,
          ),
          item(
            'smart_rings',
            label(tr: 'Akıllı Yüzük', en: 'Smart Rings'),
            Icons.radio_button_checked_rounded,
          ),
          item(
            'headphones',
            l?.catHeadphones ?? 'Headphones',
            Icons.headphones_rounded,
          ),
          item(
            'powerbanks',
            l?.catPowerBanks ?? 'Power Banks',
            Icons.battery_charging_full_rounded,
          ),
          item(
            'chargers',
            label(tr: 'Şarj Aleti', en: 'Chargers'),
            Icons.power_rounded,
          ),
        ],
      },
      {
        'group': label(tr: 'Bilgisayar', en: 'Computing'),
        'icon': Icons.laptop_rounded,
        'color': AppTheme.catComputers,
        'items': [
          item('laptops', l?.catLaptops ?? 'Laptops', Icons.laptop_rounded),
          item(
            'desktops',
            l?.catDesktops ?? 'Desktops',
            Icons.desktop_windows_rounded,
          ),
          item('tablets', l?.catTablets ?? 'Tablets', Icons.tablet_mac_rounded),
          item(
            'e_readers',
            label(tr: 'E-Kitap Okuyucu', en: 'E-Readers'),
            Icons.menu_book_rounded,
          ),
          item(
            'vr_headsets',
            label(tr: 'Sanal Gerçeklik', en: 'VR Headsets'),
            Icons.vrpano_rounded,
          ),
        ],
      },
      {
        'group': label(tr: 'Bileşenler', en: 'Components'),
        'icon': Icons.memory_rounded,
        'color': AppTheme.catComponents,
        'items': [
          item(
            'graphics_cards',
            l?.catGpus ?? 'Graphics Cards',
            Icons.videogame_asset_rounded,
          ),
          item('cpus', l?.catCpus ?? 'CPUs', Icons.developer_board_rounded),
          item(
            'motherboards',
            l?.catMotherboards ?? 'Motherboards',
            Icons.developer_board_rounded,
          ),
          item('ram', l?.catRam ?? 'RAM', Icons.memory_rounded),
          item('ssd', l?.catSsd ?? 'SSDs', Icons.storage_rounded),
          item('psu', l?.catPsu ?? 'Power Supplies', Icons.bolt_rounded),
          item('pc_cases', l?.catCases ?? 'Cases', Icons.inventory_2_rounded),
          item('ups', 'UPS', Icons.power_rounded),
          item(
            'flash_drives',
            label(tr: 'USB Bellek', en: 'USB Flash Drives'),
            Icons.usb_rounded,
          ),
        ],
      },
      {
        'group': label(tr: 'Soğutma', en: 'Cooling'),
        'icon': Icons.ac_unit_rounded,
        'color': AppTheme.catComponents,
        'items': [
          item(
            'cpu_coolers',
            l?.catCoolers ?? 'CPU Coolers',
            Icons.ac_unit_rounded,
          ),
          item(
            'laptop_coolers',
            label(tr: 'Laptop Soğutucu', en: 'Laptop Coolers'),
            Icons.ac_unit_rounded,
          ),
          item(
            'case_fans',
            label(tr: 'Kasa Fanı', en: 'Case Fans'),
            Icons.mode_fan_off_rounded,
          ),
        ],
      },
      {
        'group': label(tr: 'Çevre Birimleri', en: 'Peripherals'),
        'icon': Icons.keyboard_rounded,
        'color': AppTheme.catPeripherals,
        'items': [
          item(
            'keyboards',
            l?.catKeyboards ?? 'Keyboards',
            Icons.keyboard_rounded,
          ),
          item('mice', l?.catMice ?? 'Mice', Icons.mouse_rounded),
          item(
            'gamepads',
            l?.catGamepads ?? 'Gamepads',
            Icons.sports_esports_rounded,
          ),
          item(
            'gaming_consoles',
            l?.catGamingConsoles ?? 'Gaming Consoles',
            Icons.gamepad_rounded,
          ),
          item('webcams', l?.catWebcams ?? 'Webcams', Icons.videocam_rounded),
          item(
            'microphones',
            label(tr: 'Mikrofon', en: 'Microphones'),
            Icons.mic_rounded,
          ),
          item('printers', l?.catPrinters ?? 'Printers', Icons.print_rounded),
          item(
            '3d_printers',
            label(tr: '3D Yazıcı', en: '3D Printers'),
            Icons.precision_manufacturing_rounded,
          ),
        ],
      },
      {
        'group': label(tr: 'Ekran ve Ses', en: 'Display & Audio'),
        'icon': Icons.tv_rounded,
        'color': AppTheme.catDisplay,
        'items': [
          item('monitors', l?.catMonitors ?? 'Monitors', Icons.monitor_rounded),
          item('tvs', l?.catTvs ?? 'TVs', Icons.tv_rounded),
          item('projectors', 'Projectors', Icons.video_camera_back_rounded),
          item('speakers', l?.catSpeakers ?? 'Speakers', Icons.speaker_rounded),
          item(
            'audio_systems',
            label(tr: 'Ses Sistemi', en: 'Audio Systems'),
            Icons.speaker_group_rounded,
          ),
          item(
            'av_receivers',
            label(tr: 'AV Receiver', en: 'AV Receivers'),
            Icons.settings_input_hdmi_rounded,
          ),
          item(
            'media_players',
            label(tr: 'Medya Oynatıcı', en: 'Media Players'),
            Icons.live_tv_rounded,
          ),
        ],
      },
      {
        'group': label(tr: 'Fotoğraf ve Video', en: 'Photo & Video'),
        'icon': Icons.camera_alt_rounded,
        'color': AppTheme.catCameras,
        'items': [
          item(
            'camera_lenses',
            label(tr: 'Lens', en: 'Camera Lenses'),
            Icons.camera_rounded,
          ),
          item(
            'ip_cameras',
            label(tr: 'IP Kamera', en: 'IP Cameras'),
            Icons.videocam_rounded,
          ),
          item(
            'dashcams',
            label(tr: 'Araç İçi Kamera', en: 'Dash Cameras'),
            Icons.directions_car_rounded,
          ),
          item('gimbals', 'Gimbals', Icons.control_camera_rounded),
          item(
            'drones',
            l?.catDrones ?? 'Drones',
            Icons.flight_takeoff_rounded,
          ),
        ],
      },
      {
        'group': label(tr: 'Ağ ve Akıllı Ev', en: 'Network & Smart Home'),
        'icon': Icons.router_rounded,
        'color': AppTheme.catNetworking,
        'items': [
          item(
            'routers',
            l?.catRoutersModems ?? 'Routers',
            Icons.router_rounded,
          ),
          item(
            'modem_routers',
            label(tr: 'Modem', en: 'Modems'),
            Icons.router_rounded,
          ),
          item(
            'robot_vacuums',
            l?.catRobotVacuums ?? 'Robot Vacuums',
            Icons.cleaning_services_rounded,
          ),
          item(
            'hardware_wallets',
            label(tr: 'Soğuk Cüzdan', en: 'Hardware Wallets'),
            Icons.account_balance_wallet_rounded,
          ),
        ],
      },
    ];
  }

  // Flat list of individual categories (group color inherited by each item)
  List<Map<String, Object>> _getFlatCategories(BuildContext context) {
    final flat = <Map<String, Object>>[];
    for (final group in _getCategoryGroups(context)) {
      final color = group['color'] as Color;
      final items = (group['items'] as List).cast<Map<String, Object>>();
      final groupItems = items
          .map<Map<String, dynamic>>(
            (item) => {
              'id': item['id'] as String,
              'name': item['name'] as String,
            },
          )
          .toList(growable: false);
      for (final item in items) {
        flat.add({
          'id': item['id'] as String,
          'name': item['name'] as String,
          'icon': item['icon'] as IconData? ?? group['icon'] as IconData,
          'color': color,
          'groupItems': groupItems,
        });
      }
    }
    // POPÜLERLİK SIRASI (kullanıcı isteği): en popüler kategoriler önce; sağa
    // kaydırdıkça daha az popüler olanlar. Listede olmayanlar sona, kendi
    // aralarında mevcut sırada (stable, orijinal index tiebreaker).
    const popularityOrder = <String>[
      'smartphones',
      'laptops',
      'tablets',
      'smartwatches',
      'headphones',
      'tvs',
      'gaming_consoles',
      'graphics_cards',
      'cpus',
      'ram',
      'monitors',
      'ssd',
      'motherboards',
      'keyboards',
      'mice',
      'speakers',
      'desktops',
      'powerbanks',
      'chargers',
      'gamepads',
      'webcams',
      'microphones',
      'e_readers',
      'vr_headsets',
      'drones',
      'routers',
      'modem_routers',
      'printers',
    ];
    final rank = <String, int>{
      for (var i = 0; i < popularityOrder.length; i++) popularityOrder[i]: i,
    };
    final indexed = <(int, Map<String, Object>)>[
      for (var i = 0; i < flat.length; i++) (i, flat[i]),
    ];
    indexed.sort((a, b) {
      final ra = rank[a.$2['id']] ?? 500;
      final rb = rank[b.$2['id']] ?? 500;
      if (ra != rb) return ra.compareTo(rb);
      return a.$1.compareTo(b.$1); // stable
    });
    return [for (final e in indexed) e.$2];
  }

  /// Locale-aware cache — recreates only when locale changes.
  List<Map<String, Object>> _getCachedFlatCategories() {
    final locale = Localizations.localeOf(context);
    if (_cachedFlatCategories == null || _cachedCategoriesLocale != locale) {
      _cachedFlatCategories = _getFlatCategories(context);
      _cachedCategoriesLocale = locale;
    }
    return _cachedFlatCategories!;
  }

  Widget _buildCategoriesSection() {
    final categories = _getCachedFlatCategories();
    if (categories.isEmpty) return const SizedBox.shrink();
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
            itemExtent: 84, // chip width 76 + margin right 8
            addAutomaticKeepAlives: false,
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
            itemExtent: 84, // chip width 76 + margin right 8
            addAutomaticKeepAlives: false,
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
    final groupItems = cat['groupItems'] as List<Map<String, dynamic>>?;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        context.push(
          '${AppRoutes.browse}?id=$id&name=${Uri.encodeComponent(name)}',
          extra: groupItems,
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
    );
  }

  // === PERSONALIZED SECTION ==================================================

  Widget _buildPersonalizedSection() {
    return Consumer(
      builder: (context, ref, _) {
        return RepaintBoundary(child: _buildPersonalizedSectionBody(ref));
      },
    );
  }

  Widget _buildPersonalizedSectionBody(WidgetRef ref) {
    Widget buildRow(List<ProductEntity> products) {
      final display = products.take(_kHorizontalInitialItemLimit).toList();
      return ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: _kHorizontalCardRowPadding,
        physics: const BouncingScrollPhysics(),
        itemExtent: _kCardItemExtent,
        addAutomaticKeepAlives: false,
        itemCount: display.length,
        itemBuilder: (context, index) {
          final product = display[index];
          final price =
              product.getPriceForCountry(ref.read(selectedCountryProvider)) ??
              0;
          return _WideProductCard(
            product: product,
            price: price,
            onTap: () => context.push('/product/${product.id}'),
          );
        },
      );
    }

    final feed = ref.watch(homeFeedProvider).valueOrNull;
    final loadingFallback = feed == null
        ? const <ProductEntity>[]
        : (feed.featured.isNotEmpty ? feed.featured : feed.trending);

    return SizedBox(
      height: _kHorizontalCardRowHeight,
      child: ref
          .watch(personalizedRecommendationsProvider)
          .when(
            skipLoadingOnReload: true,
            skipLoadingOnRefresh: true,
            data: (products) {
              if (products.isEmpty) {
                if (loadingFallback.isNotEmpty) {
                  return buildRow(loadingFallback);
                }
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
              }
              return buildRow(products);
            },
            // İlk yüklemede trending fallback GÖSTERME — personalized (~birkaç
            // sn) gelince gerçek-içerik→gerçek-içerik swap'ı (telefon→kasa fanı)
            // yapıp "ekran bir anda değişiyor" hissi yaratıyordu. Skeleton →
            // personalized tek geçiş. (skipLoadingOnReload/Refresh true olduğu
            // için bu sadece ilk yüklemede; sonraki reload'larda data korunur.)
            loading: () => _buildSkeletonRow(
              height: _kHorizontalCardRowHeight,
              cardWidth: 132,
            ),
            error: (error, stackTrace) => loadingFallback.isNotEmpty
                ? buildRow(loadingFallback)
                : const SizedBox.shrink(),
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
            : RepaintBoundary(
                child: _buildCompactGridSection(homeFeed, categoryId),
              ),
      ),
    ];
  }

  // === WIDE PRODUCT CARDS ====================================================

  Widget _buildWideProductCards(
    AsyncValue<HomeFeed> homeFeed,
    String categoryId,
  ) {
    return RepaintBoundary(
      child: SizedBox(
        height: _kHorizontalCardRowHeight,
        child: homeFeed.when(
          skipLoadingOnReload: true,
          skipLoadingOnRefresh: true,
          data: (feed) {
            final products = _categorySectionProducts(feed, categoryId);
            if (products.isEmpty) return const SizedBox.shrink();

            return ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: _kHorizontalCardRowPadding,
              physics: const BouncingScrollPhysics(),
              itemExtent: _kCardItemExtent,
              addAutomaticKeepAlives: false,
              itemCount: min(_kHorizontalInitialItemLimit, products.length),
              itemBuilder: (context, index) {
                final p = products[index];
                final price =
                    p.getPriceForCountry(ref.read(selectedCountryProvider)) ??
                    0;
                return _WideProductCard(
                  product: p,
                  price: price,
                  onTap: () => context.push('/product/${p.id}'),
                );
              },
            );
          },
          loading: () => _buildSkeletonRow(
            height: _kHorizontalCardRowHeight,
            cardWidth: 132,
          ),
          error: (error, stackTrace) => const SizedBox.shrink(),
        ),
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
        skipLoadingOnReload: true,
        skipLoadingOnRefresh: true,
        data: (feed) {
          final products = _categorySectionProducts(feed, categoryId);
          if (products.isEmpty) return const SizedBox.shrink();

          final display = products.take(_kHorizontalInitialItemLimit).toList();
          return ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: _kHorizontalCardRowPadding,
            physics: const BouncingScrollPhysics(),
            itemExtent: _kCardItemExtent,
            addAutomaticKeepAlives: false,
            itemCount: display.length,
            itemBuilder: (context, index) {
              final p = display[index];
              final price =
                  p.getPriceForCountry(ref.read(selectedCountryProvider)) ?? 0;
              return _WideProductCard(
                product: p,
                price: price,
                onTap: () => context.push('/product/${p.id}'),
              );
            },
          );
        },
        loading: () => _buildSkeletonRow(
          height: _kHorizontalCardRowHeight,
          cardWidth: 155,
        ),
        error: (error, stackTrace) => const SizedBox.shrink(),
      ),
    );
  }

  // === TRENDING ==============================================================

  Set<String> _getBlockedIds(HomeFeed feed) {
    if (!identical(_cachedBlockedIdsFeed, feed)) {
      _cachedBlockedIds = {
        ...feed.featured.take(4).map((p) => p.id),
        ...feed.trending.take(12).map((p) => p.id),
        ...feed.newArrivals.take(12).map((p) => p.id),
        ...feed.discover.take(12).map((p) => p.id),
      };
      _cachedBlockedIdsFeed = feed;
    }
    return _cachedBlockedIds!;
  }

  List<ProductEntity> _categorySectionProducts(
    HomeFeed feed,
    String categoryId,
  ) {
    final products = feed.byCategory[categoryId] ?? const <ProductEntity>[];
    if (products.isEmpty) return products;

    final blockedIds = _getBlockedIds(feed);

    final filtered = products
        .where((product) => !blockedIds.contains(product.id))
        .toList();
    if (filtered.length >= _kHorizontalInitialItemLimit) {
      return filtered;
    }

    final filled = <ProductEntity>[...filtered];
    final seenIds = filled.map((product) => product.id).toSet();
    for (final product in products) {
      if (seenIds.add(product.id)) {
        filled.add(product);
      }
      if (filled.length >= _kHorizontalInitialItemLimit) {
        break;
      }
    }

    return filled.length >= 4 ? filled : products;
  }

  Widget _buildTrendsSection() {
    return Consumer(
      builder: (context, ref, _) {
        final homeFeed = ref.watch(homeFeedProvider);
        return RepaintBoundary(child: _buildTrendsSectionBody(homeFeed));
      },
    );
  }

  Widget _buildTrendsSectionBody(AsyncValue<HomeFeed> homeFeed) {
    return SizedBox(
      height: _kHorizontalCardRowHeight,
      child: homeFeed.when(
        skipLoadingOnReload: true,
        skipLoadingOnRefresh: true,
        data: (feed) {
          if (!_firstDataLogged) {
            _firstDataLogged = true;
            debugPrint(
              '=== QOR AI: HomeScreen first data render in ${_initSw.elapsedMilliseconds}ms (${feed.all.length} products) ===',
            );
          }
          final trending = feed.trending;
          if (trending.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.memory_rounded,
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
          }
          final display = trending.take(_kHorizontalInitialItemLimit).toList();
          return ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: _kHorizontalCardRowPadding,
            physics: const BouncingScrollPhysics(),
            itemExtent: _kCardItemExtent,
            addAutomaticKeepAlives: false,
            itemCount: display.length,
            itemBuilder: (context, index) {
              final p = display[index];
              final price =
                  p.getPriceForCountry(ref.read(selectedCountryProvider)) ?? 0;
              return _TrendingWideCard(
                rank: index + 1,
                product: p,
                price: price,
                onTap: () =>
                    p.id.isNotEmpty ? context.push('/product/${p.id}') : null,
              );
            },
          );
        },
        loading: () => _buildSkeletonRow(
          height: _kHorizontalCardRowHeight,
          cardWidth: 155,
        ),
        error: (error, stackTrace) =>
            _buildRetryWidget(onRetry: () => ref.invalidate(homeFeedProvider)),
      ),
    );
  }

  // === NEW ARRIVALS ==========================================================

  Widget _buildNewArrivalsSection() {
    return Consumer(
      builder: (context, ref, _) {
        return RepaintBoundary(child: _buildNewArrivalsBody(ref));
      },
    );
  }

  Widget _buildNewArrivalsBody(WidgetRef ref) {
    return SizedBox(
      height: _kHorizontalCardRowHeight,
      child: ref
          .watch(newArrivalsProvider)
          .when(
            skipLoadingOnReload: true,
            skipLoadingOnRefresh: true,
            data: (products) {
              if (products.isEmpty) {
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
              }
              return ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: _kHorizontalCardRowPadding,
                physics: const BouncingScrollPhysics(),
                itemExtent: _kCardItemExtent,
                addAutomaticKeepAlives: false,
                itemCount: min(_kHorizontalInitialItemLimit, products.length),
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
                  );
                },
              );
            },
            loading: () => _buildSkeletonRow(
              height: _kHorizontalCardRowHeight,
              cardWidth: 132,
            ),
            error: (error, stackTrace) => _buildRetryWidget(
              onRetry: () => ref.invalidate(newArrivalsProvider),
            ),
          ),
    );
  }

  // === DISCOVER (Hidden Gems) ================================================

  Widget _buildDiscoverSection() {
    return Consumer(
      builder: (context, ref, _) {
        return RepaintBoundary(child: _buildDiscoverSectionBody(ref));
      },
    );
  }

  Widget _buildDiscoverSectionBody(WidgetRef ref) {
    return SizedBox(
      height: _kHorizontalCardRowHeight,
      child: ref
          .watch(discoverProductsProvider)
          .when(
            skipLoadingOnReload: true,
            skipLoadingOnRefresh: true,
            data: (products) {
              if (products.isEmpty) {
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
              }
              return ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: _kHorizontalCardRowPadding,
                physics: const BouncingScrollPhysics(),
                itemExtent: _kCardItemExtent,
                addAutomaticKeepAlives: false,
                itemCount: min(_kHorizontalInitialItemLimit, products.length),
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
                  );
                },
              );
            },
            loading: () => _buildSkeletonRow(
              height: _kHorizontalCardRowHeight,
              cardWidth: 132,
            ),
            error: (error, stackTrace) => _buildRetryWidget(
              onRetry: () => ref.invalidate(discoverProductsProvider),
            ),
          ),
    );
  }

  // === TOP IN CATEGORY (dynamic) =============================================

  List<Widget> _buildTopInCategorySection() {
    return [
      SliverToBoxAdapter(
        child: Consumer(
          builder: (context, ref, _) {
            final slivers = _topInCategorySectionSlivers(ref);
            if (slivers.isEmpty) return const SizedBox.shrink();
            return RepaintBoundary(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: slivers
                    .whereType<SliverToBoxAdapter>()
                    .map((s) => s.child ?? const SizedBox.shrink())
                    .toList(),
              ),
            );
          },
        ),
      ),
    ];
  }

  List<Widget> _topInCategorySectionSlivers(WidgetRef ref) {
    return ref
        .watch(topInCategoryProvider)
        .when(
          skipLoadingOnRefresh: true,
          skipLoadingOnReload: true,
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
                    itemCount: min(
                      _kHorizontalInitialItemLimit,
                      data.products.length,
                    ),
                    itemExtent: _kCardItemExtent,
                    addAutomaticKeepAlives: false,
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
                      );
                    },
                  ),
                ),
              ),
            ];
          },
          loading: () => [],
          error: (error, stackTrace) => [],
        );
  }

  // === RECENTLY ANALYZED =====================================================

  List<Widget> _buildRecentlyAnalyzedSection() {
    return [
      SliverToBoxAdapter(
        child: Consumer(
          builder: (context, ref, _) {
            final slivers = _recentlyAnalyzedSlivers(ref);
            if (slivers.isEmpty) return const SizedBox.shrink();
            return RepaintBoundary(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: slivers
                    .whereType<SliverToBoxAdapter>()
                    .map((s) => s.child ?? const SizedBox.shrink())
                    .toList(),
              ),
            );
          },
        ),
      ),
    ];
  }

  List<Widget> _recentlyAnalyzedSlivers(WidgetRef ref) {
    return ref
        .watch(recentlyAnalyzedProvider)
        .when(
          skipLoadingOnReload: true,
          skipLoadingOnRefresh: true,
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
                    itemCount: min(
                      _kHorizontalInitialItemLimit,
                      products.length,
                    ),
                    itemExtent: _kCardItemExtent,
                    addAutomaticKeepAlives: false,
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
                      );
                    },
                  ),
                ),
              ),
            ];
          },
          loading: () => [],
          error: (error, stackTrace) => [],
        );
  }

  // === VALUE PICKS ===========================================================

  List<Widget> _buildValuePicksSection() {
    return [
      SliverToBoxAdapter(
        child: Consumer(
          builder: (context, ref, _) {
            final slivers = _valuePicksSlivers(ref);
            if (slivers.isEmpty) return const SizedBox.shrink();
            return RepaintBoundary(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: slivers
                    .whereType<SliverToBoxAdapter>()
                    .map((s) => s.child ?? const SizedBox.shrink())
                    .toList(),
              ),
            );
          },
        ),
      ),
    ];
  }

  List<Widget> _valuePicksSlivers(WidgetRef ref) {
    return ref
        .watch(valuePicsProvider)
        .when(
          skipLoadingOnReload: true,
          skipLoadingOnRefresh: true,
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
                    itemCount: min(
                      _kHorizontalInitialItemLimit,
                      products.length,
                    ),
                    itemExtent: _kCardItemExtent,
                    addAutomaticKeepAlives: false,
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
                      );
                    },
                  ),
                ),
              ),
            ];
          },
          loading: () => [],
          error: (error, stackTrace) => [],
        );
  }

  // === DYNAMIC USER SECTIONS =================================================

  /// Recently Viewed section ÔÇö shows products user has recently viewed from Firestore
  List<Widget> _buildRecentlyViewedSection() {
    return [
      SliverToBoxAdapter(
        child: Consumer(
          builder: (context, ref, _) {
            final slivers = _recentlyViewedSlivers(ref);
            if (slivers.isEmpty) return const SizedBox.shrink();
            return RepaintBoundary(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: slivers
                    .whereType<SliverToBoxAdapter>()
                    .map((s) => s.child ?? const SizedBox.shrink())
                    .toList(),
              ),
            );
          },
        ),
      ),
    ];
  }

  List<Widget> _recentlyViewedSlivers(WidgetRef ref) {
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
            itemExtent: _kCardItemExtent,
            addAutomaticKeepAlives: false,
            itemCount: min(15, recentProducts.length),
            itemBuilder: (context, index) {
              final p = recentProducts[index];
              final price =
                  p.getPriceForCountry(ref.read(selectedCountryProvider)) ?? 0;
              return _WideProductCard(
                product: p,
                price: price,
                onTap: () => context.push('/product/${p.id}'),
              );
            },
          ),
        ),
      ),
    ];
  }

  /// Dynamic category sections — ordered by user behavior & profile priority.
  /// Renders only [_visibleCategoryCount] items initially; more added on scroll.
  List<Widget> _buildPriorityCategorySections() {
    // Capture visible count at build time so the Consumer uses the right value.
    final visibleCount = _visibleCategoryCount;
    return [
      SliverToBoxAdapter(
        child: Consumer(
          builder: (context, ref, _) {
            final homeFeed = ref.watch(homeFeedProvider);
            final sectionWidgets = _buildPriorityCategorySectionsList(
              homeFeed,
              visibleCount,
            );
            if (sectionWidgets.isEmpty) return const SizedBox.shrink();
            return RepaintBoundary(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: sectionWidgets
                    .whereType<SliverToBoxAdapter>()
                    .map((s) => s.child ?? const SizedBox.shrink())
                    .toList(),
              ),
            );
          },
        ),
      ),
    ];
  }

  List<Widget> _buildPriorityCategorySectionsList(
    AsyncValue<HomeFeed> homeFeed,
    int maxCategories,
  ) {
    final sections = <Widget>[];

    final priorityCategories =
        homeFeed.whenOrNull(data: (f) => f.priorityCategories) ?? [];

    // Use priority order from feed; limit to maxCategories for performance.
    // Additional categories are loaded progressively as the user scrolls.
    final allCategories = priorityCategories.isNotEmpty
        ? priorityCategories
        : [
            'smartphones',
            'laptops',
            'tablets',
            'headphones',
            'smartwatches',
            'gpus',
          ];

    final categoriesToShow = allCategories.take(maxCategories);

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
      final isWide = shown < 4; // Keep initial render lighter on weak devices
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
    final locale = Localizations.localeOf(context);
    if (_cachedCategoryMetaMap == null || _cachedCategoryMetaLocale != locale) {
      _cachedCategoryMetaMap = _buildCategoryMetaMap();
      _cachedCategoryMetaLocale = locale;
    }
    return _cachedCategoryMetaMap![cat] ??
        {
          'title': cat.replaceAll('-', ' ').replaceAll('_', ' '),
          'icon': Icons.devices_rounded,
          'color': AppTheme.categoryColor(cat),
        };
  }

  Map<String, Map<String, dynamic>> _buildCategoryMetaMap() {
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
      'graphics_cards': {
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
      'gaming_consoles': {
        'title': l?.catGamingConsoles ?? 'Gaming Consoles',
        'icon': Icons.gamepad_rounded,
      },
      'games': {'title': 'Games', 'icon': Icons.sports_esports_rounded},
      'speakers': {
        'title': l?.catSpeakers ?? 'Speakers',
        'icon': Icons.speaker_rounded,
      },
      'routers': {
        'title': l?.catRouters ?? 'Networking',
        'icon': Icons.router_rounded,
      },
      'wifi_routers': {
        'title': l?.catRouters ?? 'WiFi Routers',
        'icon': Icons.router_rounded,
      },
      'modem_routers': {'title': 'Modem Routers', 'icon': Icons.router_rounded},
      'network_switches': {
        'title': 'Network Switches',
        'icon': Icons.hub_rounded,
      },
      'pcie_nic': {
        'title': 'PCIe Network Cards',
        'icon': Icons.settings_ethernet_rounded,
      },
      'drones': {
        'title': l?.catDrones ?? 'Drones',
        'icon': Icons.flight_rounded,
      },
      'robot-vacuums': {
        'title': l?.catRobotVacuums ?? 'Robot Vacuums',
        'icon': Icons.smart_toy_rounded,
      },
      'robot_vacuums': {
        'title': l?.catRobotVacuums ?? 'Robot Vacuums',
        'icon': Icons.smart_toy_rounded,
      },
      'vacuums': {
        'title': 'Vacuum Cleaners',
        'icon': Icons.cleaning_services_rounded,
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
      'pc_cases': {
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
      'cpu_coolers': {'title': 'Coolers', 'icon': Icons.ac_unit_rounded},
      'case_fans': {'title': 'Case Fans', 'icon': Icons.mode_fan_off_rounded},
      'printers': {'title': 'Printers', 'icon': Icons.print_rounded},
      'projectors': {'title': 'Projectors', 'icon': Icons.videocam_rounded},
      'gimbals': {'title': 'Gimbals', 'icon': Icons.control_camera_rounded},
      'tripods': {
        'title': 'Tripods',
        'icon': Icons.filter_center_focus_rounded,
      },
      'lenses': {'title': 'Lenses', 'icon': Icons.camera_rounded},
      'earphones': {'title': 'Earphones', 'icon': Icons.earbuds_rounded},
      'action_cameras': {
        'title': l?.catActionCameras ?? 'Action Cameras',
        'icon': Icons.videocam_outlined,
      },
      'security_cameras': {
        'title': l?.catSecurityCameras ?? 'Security Cameras',
        'icon': Icons.security_rounded,
      },
      'powerbanks': {
        'title': l?.catPowerBanks ?? 'Power Banks',
        'icon': Icons.battery_charging_full_rounded,
      },
      'ups': {'title': 'UPS', 'icon': Icons.power_rounded},
      'feature_phones': {
        'title': 'Feature Phones',
        'icon': Icons.dialpad_rounded,
      },
      'smart_rings': {
        'title': 'Smart Rings',
        'icon': Icons.radio_button_checked_rounded,
      },
      'chargers': {'title': 'Chargers', 'icon': Icons.power_rounded},
      'e_readers': {'title': 'E-Readers', 'icon': Icons.menu_book_rounded},
      'vr_headsets': {'title': 'VR Headsets', 'icon': Icons.vrpano_rounded},
      'flash_drives': {'title': 'USB Flash Drives', 'icon': Icons.usb_rounded},
      'laptop_coolers': {
        'title': 'Laptop Coolers',
        'icon': Icons.ac_unit_rounded,
      },
      '3d_printers': {
        'title': '3D Printers',
        'icon': Icons.precision_manufacturing_rounded,
      },
      'audio_systems': {
        'title': 'Audio Systems',
        'icon': Icons.speaker_group_rounded,
      },
      'av_receivers': {
        'title': 'AV Receivers',
        'icon': Icons.settings_input_hdmi_rounded,
      },
      'media_players': {
        'title': l?.catMediaPlayers ?? 'Media Players',
        'icon': Icons.live_tv_rounded,
      },
      'camera_lenses': {'title': 'Camera Lenses', 'icon': Icons.camera_rounded},
      'ip_cameras': {'title': 'IP Cameras', 'icon': Icons.videocam_rounded},
      'hardware_wallets': {
        'title': 'Hardware Wallets',
        'icon': Icons.account_balance_wallet_rounded,
      },
    };
    // Her entry'e color ekle; _categoryMeta lookup'ında hazır olur.
    return meta.map(
      (key, value) =>
          MapEntry(key, {...value, 'color': AppTheme.categoryColor(key)}),
    );
  }

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
              'Yuklenemedi',
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
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
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
        ],
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
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 8),
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

  String _displayName(BuildContext context) => localizeProductName(
    product.nameForLanguage(Localizations.localeOf(context).languageCode),
    Localizations.localeOf(context).languageCode,
  );

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return RepaintBoundary(
      child: Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            width: 132,
            margin: const EdgeInsets.only(right: 12),
            decoration: BoxDecoration(
              color: isDark ? context.surfaceVariantColor : Colors.white,
              borderRadius: _kRadius16,
              border: Border.all(color: _kCardBorderColor, width: 0.8),
              boxShadow: context.cardShadow,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.max,
              children: [
                // Image section
                Stack(
                  children: [
                    Container(
                      height: 132,
                      width: double.infinity,
                      padding: const EdgeInsets.all(6),
                      decoration: _kCardImageContainerDecoration,
                      // Square image slot with inner breathing room — phones
                      // (portrait) and landscape product shots both center
                      // cleanly without crowding the card edges.
                      child: AspectRatio(
                        aspectRatio: 1.0,
                        child: ProductImageBox(
                          imageUrl: product.imageUrl,
                          fallbackUrls: product.allImages,
                          borderRadius: _kRadius10,
                          padding: const EdgeInsets.all(12),
                          imageScale: 0.76,
                        ),
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
                          decoration: const BoxDecoration(
                            color: Color(0xFF10B981),
                            borderRadius: _kRadius8,
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
                                Icons.memory_rounded,
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
                // Details section ÔÇö tight, no gap
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(10, 6, 10, 10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.max,
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
                          _displayName(context),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: context.textPrimary,
                            height: 1.15,
                          ),
                        ),
                        const Spacer(),
                        SizedBox(
                          width: double.infinity,
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            decoration: const BoxDecoration(
                              gradient: AppTheme.primaryGradient,
                              borderRadius: _kRadius12,
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
                ),
              ],
            ),
          ),
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

  String _displayName(BuildContext context) => localizeProductName(
    product.nameForLanguage(Localizations.localeOf(context).languageCode),
    Localizations.localeOf(context).languageCode,
  );

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return RepaintBoundary(
      child: Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            width: 132,
            margin: const EdgeInsets.only(right: 12),
            decoration: BoxDecoration(
              color: isDark ? context.surfaceVariantColor : Colors.white,
              borderRadius: _kRadius16,
              border: Border.all(color: _kTrendingBorderColor, width: 0.8),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x0F00D4FF), // brandCyan @ 0.06 alpha
                  blurRadius: 10,
                  spreadRadius: -2,
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.max,
              children: [
                Stack(
                  children: [
                    Container(
                      height: 132,
                      width: double.infinity,
                      padding: const EdgeInsets.all(6),
                      decoration: _kCardImageContainerDecoration,
                      // Square image slot with inner breathing room — phones
                      // (portrait) and landscape product shots both center
                      // cleanly without crowding the card edges.
                      child: AspectRatio(
                        aspectRatio: 1.0,
                        child: ProductImageBox(
                          imageUrl: product.imageUrl,
                          fallbackUrls: product.allImages,
                          borderRadius: _kRadius10,
                          padding: const EdgeInsets.all(12),
                          imageScale: 0.76,
                        ),
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
                          borderRadius: _kRadius8,
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
                            color: rank <= 3
                                ? Colors.white
                                : context.textPrimary,
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
                          decoration: const BoxDecoration(
                            gradient: AppTheme.primaryGradient,
                            borderRadius: _kRadius8,
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(
                                Icons.memory_rounded,
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
                // Details section — tight layout, no gaps
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(10, 6, 10, 10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.max,
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
                          _displayName(context),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: context.textPrimary,
                            height: 1.15,
                          ),
                        ),
                        const Spacer(),
                        SizedBox(
                          width: double.infinity,
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            decoration: const BoxDecoration(
                              gradient: AppTheme.primaryGradient,
                              borderRadius: _kRadius12,
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
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// === SKELETON CARD ============================================================

// _SkeletonCard retired ÔÇö see ProductRowSkeleton/ProductCardSkeleton in
// lib/presentation/widgets/shimmer_skeleton.dart (shimmer-based premium loader).
