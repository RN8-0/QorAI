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
// extra layout/measurement maliyeti oluşturuyordu (24 → 12 → 8).
// Viewport ~3 kart + cacheExtent → ~5 kart fiilen build edilir; kullanıcı
// kaydırdığında ek kartlar `_HomeScreenState.didUpdateWidget` veya
// section provider'ı ile gelir.
const int _kHorizontalInitialItemLimit = 8;
// card width (155) + right margin (12) = fixed item extent avoids per-frame layout calc
const double _kCardItemExtent = 167.0;
// ignore: unused_element
const int _kInitialCategoryChipLimit = 18;
// Progressive category rendering — start light, add on scroll
const int _kInitialVisibleCategories = 5;
const int _kCategoryLoadIncrement = 4;
const int _kMaxVisibleCategories = 30;

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});
  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen>
    with TickerProviderStateMixin {
  late final ScrollController _scrollCtrl;
  Timer? _scrollDebounce;
  final Stopwatch _initSw = Stopwatch();
  bool _firstDataLogged = false;

  // Persist scroll position across tab switches
  static double _savedScrollOffset = 0.0;

  // ── Staged rendering: her postFrame'de tek bir section parti açılır.
  // Categories Stage 0'a alındı (feed-bağımsız, ListView.builder lazy).
  // 0 = AppBar (skeleton) + SearchBar + Categories  ← TÜM feed-bağımsız UI
  // 1 = atlanır (Categories Stage 0'a entegre)
  // 2 = + Real AppBar + For You + Trending          ← feed-aware
  // 3 = + QuizReminder + TopInCategory + RecentlyViewed + RecentlyAnalyzed
  // 4 = + NewArrivals
  // 5 = + Priority + ValuePicks
  // 6 = + Discover
  int _renderStage = 0;
  static const int _kMaxRenderStage = 6;
  // Stage'ler arası gecikme. 60ms ≈ 3-4 vsync — zayıf cihazlarda (Xiaomi
  // mid-range, eski tablet) her stage arasında frame budget açar. 32ms'de
  // arka arkaya gelen rebuild'ler aynı vsync'e düşebilir → spike.
  // Toplam Stage 2→6 reveal: 5 × 60ms = 300ms (fark kullanıcıya hissettirmez).
  static const Duration _kStageDelay = Duration(milliseconds: 60);
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
    // Stage 0 tüm feed-bağımsız UI'ı (AppBar skeleton + SearchBar +
    // Categories) içeriyor. Stage 2+ feed READY ile _onFeedReady'den
    // tetiklenir; otomatik Stage 1'e atlama yok (gereksiz frame).
  }

  void _scheduleNextStage() {
    if (!mounted || _renderStage >= _kMaxRenderStage) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      // Bir önceki stage'in pipeline'ı tamamen bitsin diye delay veriyoruz.
      Future<void>.delayed(_kStageDelay, () {
        if (!mounted || _renderStage >= _kMaxRenderStage) return;
        // Stage 0 → 1 (Categories) feed'den bağımsız — hemen açılabilir.
        // Stage 2+ ürün section'larıdır → feed READY beklemeli.
        // Aksi halde feed sonradan READY olduğunda shimmer→data geçişi
        // tüm Consumer'ları aynı frame'de rebuild eder ve büyük spike olur.
        final nextStage = _renderStage + 1;
        if (nextStage >= 2 && !_feedReadyForReveal) {
          // Feed henüz hazır değil. Listener feed READY olunca
          // _scheduleNextStage'i tekrar tetikleyecek.
          return;
        }
        setState(() => _renderStage = nextStage);
        _scheduleNextStage();
      });
    });
  }

  /// homeFeedProvider AsyncValue.data state'e ilk kez geçtiğinde çağrılır.
  /// Feed gelmeden Stage 2+ açılmamalı; aksi halde aynı frame'de tüm
  /// shimmer'lar gerçek karta dönüp Consumer rebuild dalgası yaratır.
  void _onFeedReady() {
    if (_feedReadyForReveal) return;
    _feedReadyForReveal = true;
    // Direkt Stage 2'ye sıçra (postFrame timer beklemesi yok). Feed
    // hazır → For You + Trending hemen render etmeli. Sonraki stage'ler
    // (3,4,5,6) normal kademeli akışla 32ms aralıklı açılır.
    if (mounted && _renderStage < 2) {
      setState(() {
        _renderStage = 2;
      });
      _scheduleNextStage();
    }
  }

  void _handleScroll() {
    if (!_scrollCtrl.hasClients) return;
    _scrollDebounce?.cancel();
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
      if (next.hasValue && next.value!.all.isNotEmpty) {
        _onFeedReady();
      }
    });
    // In-memory cache hit (tab switch / fast restart) durumunda listener
    // tetiklenmez çünkü değişim yoktur. Anlık state'i de kontrol et.
    if (!_feedReadyForReveal) {
      final current = ref.read(homeFeedProvider);
      if (current.hasValue && (current.value?.all.isNotEmpty ?? false)) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _onFeedReady();
        });
      }
    }
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

            // ── STAGE 2: Real AppBar (üstte değişti) + For You + Trending ─
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

            // ── STAGE 3: QuizReminder + TopInCat + RecentlyViewed + Analyzed
            // QuizReminder Stage 0'dan Stage 3'e taşındı: categoryCovers
            // network call + CachedNetworkImage decode artık ilk frame'i
            // bloklamaz.
            if (_renderStage >= 3) ...[
              _buildQuizReminder(),
              ..._buildTopInCategorySection(),
              ..._buildRecentlyViewedSection(),
              ..._buildRecentlyAnalyzedSection(),
            ],

            // ── STAGE 4: NewArrivals (tek section, izole) ────────────────
            if (_renderStage >= 4) ...[
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

            // ── STAGE 5: Priority categories + ValuePicks ────────────────
            if (_renderStage >= 5) ...[
              ..._buildPriorityCategorySections(),
              ..._buildValuePicksSection(),
            ],

            // ── STAGE 6: Discover (en alt, ekran dışı genelde) ───────────
            if (_renderStage >= 6) ...[
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
                  // Avatar placeholder — gerçek avatar Stage 1'de yerleşir.
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(13),
                      gradient: AppTheme.primaryGradient,
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
            ).animate().fadeIn(duration: 400.ms).slideY(begin: -0.1),
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
              .fadeIn(duration: 300.ms)
              .slideY(begin: 0.05, duration: 300.ms),
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
    return SizedBox(
      height: _kHorizontalCardRowHeight,
      child: ref
          .watch(personalizedRecommendationsProvider)
          .when(
            skipLoadingOnReload: true,
            data: (products) {
              if (products.isEmpty) {
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
              final display = products
                  .take(_kHorizontalInitialItemLimit)
                  .toList();
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
                      product.getPriceForCountry(
                        ref.read(selectedCountryProvider),
                      ) ??
                      0;
                  return _WideProductCard(
                    product: product,
                    price: price,
                    onTap: () => context.push('/product/${product.id}'),
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
            cardWidth: 155,
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
              cardWidth: 155,
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
              cardWidth: 155,
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
    // Her entry'e color ekle; _categoryMeta lookup'ında hazır olur.
    return meta.map(
      (key, value) => MapEntry(key, {...value, 'color': AppTheme.categoryColor(key)}),
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
    product.name,
    Localizations.localeOf(context).languageCode,
  );

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: GestureDetector(
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
            mainAxisSize: MainAxisSize.max,
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
                      width: 139,
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
              ),
            ],
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
    product.name,
    Localizations.localeOf(context).languageCode,
  );

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: GestureDetector(
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
            mainAxisSize: MainAxisSize.max,
            children: [
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
                      width: 139,
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
              // Details section ÔÇö tight layout, no gaps
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
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// === SKELETON CARD ============================================================

// _SkeletonCard retired ÔÇö see ProductRowSkeleton/ProductCardSkeleton in
// lib/presentation/widgets/shimmer_skeleton.dart (shimmer-based premium loader).
