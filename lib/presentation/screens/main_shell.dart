/// Qor AI - Main Shell (Modern Navigation)
/// Mobile: 4-tab floating pill nav + hamburger drawer
/// Desktop/Tablet: Side rail navigation
library;

import "dart:async";
import "package:flutter/foundation.dart" show kIsWeb;
import "package:flutter/material.dart";
import "package:flutter/services.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:go_router/go_router.dart";
import "package:google_fonts/google_fonts.dart";
import "package:qor_ai/core/app_keys.dart";
import "package:qor_ai/core/constants.dart";
import "package:qor_ai/core/pb_client.dart";
import "package:qor_ai/presentation/providers/providers.dart";
import "package:qor_ai/presentation/screens/ai_chat/ai_chat_screen.dart";
import "package:qor_ai/services/connectivity_service.dart";
import "package:qor_ai/services/notification_service.dart";
import "package:firebase_messaging/firebase_messaging.dart";
import "package:qor_ai/routing/router.dart";
import "package:qor_ai/core/theme.dart";
import "package:qor_ai/core/extensions.dart";
import "package:qor_ai/l10n/app_localizations.dart";

const _kNavBarHeight = AppTheme.navBarHeight;
const _kSidebarWidth = 240.0;
const _kRailWidth = 72.0;

class MainShell extends ConsumerStatefulWidget {
  final StatefulNavigationShell navigationShell;

  const MainShell({super.key, required this.navigationShell});

  @override
  ConsumerState<MainShell> createState() => _MainShellState();
}

class _MainShellState extends ConsumerState<MainShell> {
  StreamSubscription<String>? _fcmTokenRefreshSub;
  Future<void> Function()? _productsUnsubscribe;
  Timer? _productCacheInvalidationDebounce;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _subscribeProductCatalogChanges();
      Future.delayed(const Duration(milliseconds: 1200), () {
        if (!mounted) return;
        _primeBackgroundState();
      });
      Future.delayed(const Duration(seconds: 3), () {
        if (!mounted) return;
        _registerFcmToken();
      });
    });
  }

  // ── Products-collection realtime: throttle, don't debounce ────────────────
  // The scraper writes thousands of products per hour. The original 700ms
  // debounce never fired during a burst, then nuked the persistent home_feed
  // cache the moment the burst paused — which immediately fanned into a full
  // multi-cat Typesense refetch (and, before commit 8b…, an extra 23 PB
  // requests via _filterLivePocketBaseProducts). End-user devices don't need
  // bleeding-edge product freshness; the home feed already revalidates on
  // its own cadence. We now only clear the in-memory feed, at most once per
  // 5 minutes, and never touch the persistent cache from this hook.
  static const Duration _productInvalidationCooldown = Duration(minutes: 5);
  DateTime? _lastProductInvalidationAt;

  void _subscribeProductCatalogChanges() {
    unawaited(() async {
      try {
        _productsUnsubscribe = await pb
            .collection(AppConstants.productsCollection)
            .subscribe('*', (event) {
              if (!mounted) return;
              final now = DateTime.now();
              final last = _lastProductInvalidationAt;
              if (last != null &&
                  now.difference(last) < _productInvalidationCooldown) {
                return;
              }
              _lastProductInvalidationAt = now;
              _productCacheInvalidationDebounce?.cancel();
              _productCacheInvalidationDebounce = Timer(
                const Duration(seconds: 2),
                () {
                  if (!mounted) return;
                  // disruptive:false → mevcut home görünümünü BOZMA (feed'i
                  // yeniden yükleyip section'ları flash'latma). Scraper ürün
                  // yazınca kullanıcı home'dayken ekranın ~1sn değişip eski
                  // haline dönmesinin nedeni buydu.
                  unawaited(
                    invalidateProductCatalogCaches(
                      ref,
                      clearPersistent: false,
                      disruptive: false,
                    ),
                  );
                },
              );
            });
        debugPrint('[Shell] products realtime subscribed');
      } catch (e) {
        debugPrint('[Shell] products realtime unavailable: $e');
      }
    }());
  }

  void _primeBackgroundState() {
    // HomeScreen Stage 2'de bu provider'lar ilk kez okunduğunda PocketBase
    // fetch tetiklenip UI thread'de Consumer rebuild yaratıyordu. 1.2s'de
    // önceden ısıtarak Stage 2 reveal'i anında cache hit ile karşılansın.
    try {
      ref.read(countryInitProvider);
      ref.read(userProfileProvider);
      ref.read(subscriptionServiceProvider);
    } catch (_) {}
  }

  /// After login, get FCM token and save to PocketBase user profile.
  /// Uses event-driven flow (no polling): if the token is already available
  /// register it immediately; otherwise rely on onTokenRefresh which fires
  /// once the platform produces a token. This avoids the 30× sleep loop
  /// the original implementation did on every cold start.
  Future<void> _registerFcmToken() async {
    if (kIsWeb) return;
    try {
      await NotificationService.instance.initialize();

      final authState = ref.read(authStateProvider);
      final uid = authState.valueOrNull;
      if (uid == null) return;

      final pbDs = ref.read(pbDataSourceProvider);
      final messaging = FirebaseMessaging.instance;

      // Listen for refreshes first so we never miss the initial token
      // if it arrives between the read and the listener registration.
      await _fcmTokenRefreshSub?.cancel();
      _fcmTokenRefreshSub = messaging.onTokenRefresh.listen((newToken) async {
        try {
          await pbDs.updateFcmToken(uid, newToken);
          debugPrint('[Shell] FCM token refreshed in PB for $uid');
        } catch (e) {
          debugPrint('[Shell] FCM token refresh PB write failed: $e');
        }
      });

      // Try the cached token from NotificationService (sync), then fall back
      // to FirebaseMessaging.getToken() which awaits the platform once.
      final cached = NotificationService.instance.token;
      String? token = cached;
      if (token == null) {
        try {
          token = await messaging.getToken();
        } catch (e) {
          debugPrint('[Shell] getToken() error: $e');
        }
      }

      if (token == null) {
        // onTokenRefresh will pick it up later — no polling needed.
        return;
      }

      await pbDs.updateFcmToken(uid, token);
      debugPrint('[Shell] FCM token registered to PB for $uid');
    } catch (e) {
      debugPrint('[Shell] FCM token register error: $e');
    }
  }

  @override
  void dispose() {
    unawaited(_fcmTokenRefreshSub?.cancel());
    _productCacheInvalidationDebounce?.cancel();
    final unsubscribe = _productsUnsubscribe;
    if (unsubscribe != null) {
      unawaited(unsubscribe());
    }
    super.dispose();
  }

  int _indexFromLocation(String location) {
    // Branch indices match StatefulShellRoute definition:
    // 0=home(+browse+aiChat) 1=compare 2=linkPaste 3=subscriptions
    return widget.navigationShell.currentIndex.clamp(0, 3);
  }

  void _onNavTap(int index) {
    if (!kIsWeb) HapticFeedback.lightImpact();
    if (index != 0 && !pb.authStore.isValid) {
      context.go(AppRoutes.login);
      return;
    }
    // Close any open modals/bottom sheets before navigating
    Navigator.of(
      context,
      rootNavigator: true,
    ).popUntil((route) => route is! PopupRoute);
    ref.read(bottomNavIndexProvider.notifier).state = index;
    // initialLocation:true resets a branch to its root route when re-tapped,
    // so repeated taps on Home pop back to /home from /home/browse.
    widget.navigationShell.goBranch(
      index,
      initialLocation: index == widget.navigationShell.currentIndex,
    );
  }

  Widget _buildConnectivityBanner() {
    return Consumer(
      builder: (context, ref, _) {
        final connectivity = ref.watch(connectivityProvider);
        return connectivity.when(
          data: (status) {
            if (status == ConnectivityStatus.offline) {
              return SafeArea(
                bottom: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 8,
                  ),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: AppTheme.error,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(
                          Icons.wifi_off_rounded,
                          color: Colors.white,
                          size: 16,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          AppLocalizations.of(context)?.noInternetConnection ??
                              "No internet connection",
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }
            return const SizedBox.shrink();
          },
          loading: () => const SizedBox.shrink(),
          error: (_, _) => const SizedBox.shrink(),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    final currentIndex = _indexFromLocation(location);
    final bottomPadding = MediaQuery.of(context).padding.bottom;
    final useDesktopLayout = context.isDesktop;

    // Analiz ARKA PLANDA: kullanıcı analizi başlatıp başka sekmeye geçtiyse,
    // QUIZ hazır olunca veya ANALİZ bittiğinde sayfa adıyla zengin bir bildirim
    // göster; "Görüntüle" o analiz sekmesine direkt götürür. Link + Abonelik.
    void notifyAnalysis(String title, IconData icon, int tabIndex) {
      final isTr = Localizations.localeOf(context).languageCode == 'tr';
      ScaffoldMessenger.of(context)
        ..clearSnackBars()
        ..showSnackBar(
          SnackBar(
            behavior: SnackBarBehavior.floating,
            backgroundColor: AppTheme.brandDeepBlue,
            elevation: 8,
            duration: const Duration(seconds: 6),
            margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
            content: Row(
              children: [
                Container(
                  width: 34,
                  height: 34,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.16),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(icon, color: Colors.white, size: 18),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 13.5,
                    ),
                  ),
                ),
              ],
            ),
            action: SnackBarAction(
              label: isTr ? 'Görüntüle' : 'View',
              textColor: AppTheme.brandCyan,
              onPressed: () => _onNavTap(tabIndex),
            ),
          ),
        );
    }

    // Abonelik akışı (sekme 3)
    ref.listen<SubQuizState>(subQuizProvider, (prev, next) {
      if (!mounted || currentIndex == 3) return;
      final isTr = Localizations.localeOf(context).languageCode == 'tr';
      if (prev?.phase != SubFlowPhase.quiz &&
          next.phase == SubFlowPhase.quiz) {
        notifyAnalysis(
          isTr ? 'Abonelik quizin hazır — yanıtla' : 'Your subscription quiz is ready',
          Icons.quiz_rounded,
          3,
        );
      } else if (prev?.phase != SubFlowPhase.result &&
          next.phase == SubFlowPhase.result) {
        notifyAnalysis(
          isTr ? 'Abonelik analizin hazır' : 'Your subscription analysis is ready',
          Icons.auto_awesome_rounded,
          3,
        );
      }
    });

    // Link analizi akışı (sekme 2)
    ref.listen<LinkQuizState>(linkQuizProvider, (prev, next) {
      if (!mounted || currentIndex == 2) return;
      final isTr = Localizations.localeOf(context).languageCode == 'tr';
      if (prev?.phase != LinkFlowPhase.quiz &&
          next.phase == LinkFlowPhase.quiz) {
        notifyAnalysis(
          isTr ? 'Analiz quizin hazır — yanıtla' : 'Your analysis quiz is ready',
          Icons.quiz_rounded,
          2,
        );
      } else if (prev?.phase != LinkFlowPhase.result &&
          next.phase == LinkFlowPhase.result) {
        notifyAnalysis(
          isTr ? 'Link analizin hazır' : 'Your link analysis is ready',
          Icons.auto_awesome_rounded,
          2,
        );
      }
    });

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        key: mainShellScaffoldKey,
        backgroundColor: context.backgroundColor,
        extendBody: !useDesktopLayout,
        body: useDesktopLayout
            ? _buildDesktopLayout(currentIndex)
            : _buildMobileLayout(currentIndex, bottomPadding),
      ),
    );
  }

  Widget _buildMobileLayout(int currentIndex, double bottomPadding) {
    final goState = GoRouterState.of(context);
    final path = goState.uri.path;
    final location = goState.matchedLocation;
    // Kategori tarama: hem /browse hem /home/browse (sorgu yolu uri.path'te yok)
    final isBrowseRoute =
        path == AppRoutes.browse ||
        path == '/home/browse' ||
        path.startsWith('/home/browse/');

    return Stack(
      children: [
        Positioned.fill(
          child: Column(
            children: [
              _buildConnectivityBanner(),
              Expanded(child: widget.navigationShell),
            ],
          ),
        ),
        // Positioned must be a direct Stack child — Consumer lives inside it.
        Positioned(
          left: AppTheme.navBarHMargin,
          right: AppTheme.navBarHMargin,
          bottom: bottomPadding + AppTheme.navBarBottomMargin,
          child: Consumer(
            builder: (context, ref, _) {
              final isLinkAiAnalyzing =
                  ref.watch(
                    compareAnalysisProvider.select((s) => s.isWorking),
                  ) ||
                  ref.watch(
                    linkQuizProvider.select(
                      (s) =>
                          s.phase == LinkFlowPhase.analyzing ||
                          s.phase == LinkFlowPhase.computing,
                    ),
                  );
              // Abonelik analizi arka planda sürerken (quiz üretimi/analiz)
              // alt sekmede (index 3) küçük dairesel yükleme göster.
              final isSubAiAnalyzing = ref.watch(
                subQuizProvider.select(
                  (s) =>
                      s.phase == SubFlowPhase.quizLoading ||
                      s.phase == SubFlowPhase.analyzing,
                ),
              );
              final hideNavBar = ref.watch(hideNavBarProvider);
              final effectiveHideNavBar = isBrowseRoute || hideNavBar;
              if (!isBrowseRoute && location == AppRoutes.home && hideNavBar) {
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  if (!mounted) return;
                  ref.read(hideNavBarProvider.notifier).state = false;
                });
              }
              if (effectiveHideNavBar) return const SizedBox.shrink();
              return RepaintBoundary(
                child: _FloatingNavBar(
                  currentIndex: currentIndex,
                  onTap: _onNavTap,
                  isLinkAiAnalyzing: isLinkAiAnalyzing,
                  isSubAiAnalyzing: isSubAiAnalyzing,
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildDesktopLayout(int currentIndex) {
    final isWide = context.screenWidth >= Breakpoints.desktop;
    return Stack(
      children: [
        Row(
          children: [
            _DesktopSidebar(
              currentIndex: currentIndex,
              onTap: _onNavTap,
              isExpanded: isWide,
            ),
            Container(width: 1, color: context.dividerColor),
            Expanded(
              child: Column(
                children: [
                  _buildConnectivityBanner(),
                  Expanded(
                    child: Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 1200),
                        child: widget.navigationShell,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }
}

// ─── NAV ITEMS ───

class _NavItem {
  final IconData icon;
  final IconData activeIcon;
  final String label;
  const _NavItem(this.icon, this.activeIcon, this.label);
}

List<_NavItem> _buildNavItems(BuildContext context) {
  final l10n = AppLocalizations.of(context);
  final isTr = Localizations.localeOf(context).languageCode == 'tr';
  return [
    _NavItem(Icons.home_outlined, Icons.home_rounded, l10n?.home ?? 'Home'),
    _NavItem(
      Icons.compare_arrows_outlined,
      Icons.compare_arrows_rounded,
      l10n?.compare ?? 'Compare',
    ),
    _NavItem(
      Icons.link_rounded,
      Icons.link_rounded,
      isTr ? 'Link Analizi' : 'Link Analysis',
    ),
    _NavItem(
      Icons.subscriptions_outlined,
      Icons.subscriptions_rounded,
      isTr ? 'Abonelik Karşılaştır' : 'Subscription Analysis',
    ),
  ];
}

// ─── FLOATING NAV BAR (4 items, ultra-slim) ───

class _FloatingNavBar extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;
  final bool isLinkAiAnalyzing;
  final bool isSubAiAnalyzing;

  const _FloatingNavBar({
    required this.currentIndex,
    required this.onTap,
    this.isLinkAiAnalyzing = false,
    this.isSubAiAnalyzing = false,
  });

  static const _brandGradient = LinearGradient(
    colors: [AppTheme.brandDeepBlue, AppTheme.brandBlue, AppTheme.brandCyan],
  );

  @override
  Widget build(BuildContext context) {
    final items = _buildNavItems(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return MediaQuery(
      data: MediaQuery.of(context).copyWith(textScaler: TextScaler.noScaling),
      child: Container(
        height: _kNavBarHeight,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppTheme.radiusXXL),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.48),
              blurRadius: 28,
              offset: const Offset(0, 8),
            ),
            BoxShadow(
              color: AppTheme.brandCyan.withValues(alpha: 0.07),
              blurRadius: 36,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(AppTheme.radiusXXL),
          // Maks. akıcılık: BackdropFilter blur'u TAMAMEN kaldırıldı. Blur her
          // scroll frame'inde arkadaki içeriği yeniden örnekleyip kompozitliyordu
          // — giriş seviyesi GPU'larda (Redmi Note 11SE) sürekli jank kaynağı.
          // Nav arka planı zaten opak/yarı-opak; cam algısı korunur, GPU sıfır.
          child: _navBarInner(context, items, isDark),
        ),
      ),
    );
  }

  Widget _navBarInner(BuildContext context, List<_NavItem> items, bool isDark) {
    return Container(
      decoration: BoxDecoration(
        color: isDark
            ? AppTheme.brandDark.withValues(alpha: 0.88)
            : context.surfaceElevatedColor.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(AppTheme.radiusXXL),
        border: Border.symmetric(
          horizontal: BorderSide(
            color: isDark
                ? Colors.white.withValues(alpha: 0.09)
                : context.dividerColor,
            width: 0.5,
          ),
        ),
      ),
      child: Row(
        children: List.generate(items.length, (index) {
          final item = items[index];
          final isSelected = index == currentIndex;

          // Regular items — animated pill background on active
          return Expanded(
            child: Semantics(
              button: true,
              selected: isSelected,
              label: item.label,
              child: GestureDetector(
                onTap: () {
                  if (!kIsWeb) HapticFeedback.selectionClick();
                  onTap(index);
                },
                behavior: HitTestBehavior.opaque,
                child: Center(
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 220),
                    curve: Curves.easeOutCubic,
                    padding: EdgeInsets.symmetric(
                      horizontal: isSelected ? 9 : 6,
                      vertical: 7,
                    ),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? AppTheme.brandCyan.withValues(alpha: 0.12)
                          : Colors.transparent,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Stack(
                          clipBehavior: Clip.none,
                          children: [
                            AnimatedSwitcher(
                              duration: const Duration(milliseconds: 200),
                              child: isSelected
                                  ? ShaderMask(
                                      key: ValueKey('active_$index'),
                                      shaderCallback: (bounds) =>
                                          _brandGradient.createShader(bounds),
                                      blendMode: BlendMode.srcIn,
                                      child: Icon(
                                        item.activeIcon,
                                        size: 19,
                                        color: Colors.white,
                                      ),
                                    )
                                  : Icon(
                                      item.icon,
                                      key: ValueKey('inactive_$index'),
                                      size: 19,
                                      color: AppTheme.slate500,
                                    ),
                            ),
                            if ((index == 2 && isLinkAiAnalyzing) ||
                                (index == 3 && isSubAiAnalyzing))
                              Positioned(
                                right: -3,
                                top: -3,
                                child: SizedBox(
                                  width: 9,
                                  height: 9,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 1.5,
                                    valueColor: const AlwaysStoppedAnimation(
                                      AppTheme.brandCyan,
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        AnimatedDefaultTextStyle(
                          duration: const Duration(milliseconds: 200),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: isSelected ? 8.4 : 8.0,
                            height: 1.05,
                            fontWeight: isSelected
                                ? FontWeight.w700
                                : FontWeight.w500,
                            color: isSelected
                                ? AppTheme.brandCyan
                                : AppTheme.slate500,
                          ),
                          child: Text(
                            item.label,
                            maxLines: 2,
                            textAlign: TextAlign.center,
                            overflow: TextOverflow.ellipsis,
                            softWrap: true,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }
}

// ─── Desktop Sidebar ───

class _DesktopSidebar extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;
  final bool isExpanded;

  const _DesktopSidebar({
    required this.currentIndex,
    required this.onTap,
    required this.isExpanded,
  });

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      width: isExpanded ? _kSidebarWidth : _kRailWidth,
      color: context.surfaceColor,
      child: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: EdgeInsets.symmetric(
                horizontal: isExpanded ? 20 : 12,
                vertical: 20,
              ),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: Theme.of(context).brightness == Brightness.dark
                          ? const Color(0xFF010617)
                          : Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: Theme.of(context).brightness == Brightness.dark
                            ? Colors.white.withValues(alpha: 0.08)
                            : AppTheme.brandBlue.withValues(alpha: 0.12),
                      ),
                    ),
                    child: Image.asset(
                      'assets/logo/qor_ai_logo_512.png',
                      width: 32,
                      height: 32,
                      fit: BoxFit.contain,
                    ),
                  ),
                  if (isExpanded) ...[
                    const SizedBox(width: 12),
                    Text(
                      "Qor AI",
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w800,
                        fontSize: 20,
                        color: context.textPrimary,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            Divider(height: 1, color: context.dividerColor),
            Expanded(
              child: Builder(
                builder: (context) {
                  final navItems = _buildNavItems(context);
                  return Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(navItems.length, (index) {
                      final item = navItems[index];
                      final isSelected = index == currentIndex;
                      return _SidebarItem(
                        icon: isSelected ? item.activeIcon : item.icon,
                        label: item.label,
                        isSelected: isSelected,
                        isExpanded: isExpanded,
                        onTap: () => onTap(index),
                      );
                    }),
                  );
                },
              ),
            ),
            if (isExpanded) ...[
              Divider(height: 1, color: context.dividerColor),
              _SidebarFooterLink(
                label: context.l10n?.privacyPolicy ?? 'Privacy Policy',
                onTap: () => context.go(AppRoutes.privacyPolicy),
              ),
              _SidebarFooterLink(
                label: context.l10n?.termsOfService ?? 'Terms of Service',
                onTap: () => context.go(AppRoutes.termsOfService),
              ),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Text(
                  "© 2025 Qor AI",
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 11,
                    color: AppTheme.slate400,
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ],
          ],
        ),
      ),
    );
  }
}

class _SidebarItem extends StatefulWidget {
  final IconData icon;
  final String label;
  final bool isSelected;
  final bool isExpanded;
  final VoidCallback onTap;

  const _SidebarItem({
    required this.icon,
    required this.label,
    required this.isSelected,
    required this.isExpanded,
    required this.onTap,
  });

  @override
  State<_SidebarItem> createState() => _SidebarItemState();
}

class _SidebarItemState extends State<_SidebarItem> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    final color = widget.isSelected
        ? AppTheme.brandCyan
        : (_hovering ? context.textPrimary : context.textTertiaryColor);
    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          margin: EdgeInsets.symmetric(
            horizontal: widget.isExpanded ? 12 : 8,
            vertical: 2,
          ),
          padding: EdgeInsets.symmetric(
            horizontal: widget.isExpanded ? 14 : 0,
            vertical: 12,
          ),
          decoration: BoxDecoration(
            color: widget.isSelected
                ? AppTheme.brandCyan.withValues(alpha: 0.08)
                : (_hovering
                      ? Colors.white.withValues(alpha: 0.05)
                      : Colors.transparent),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            mainAxisAlignment: widget.isExpanded
                ? MainAxisAlignment.start
                : MainAxisAlignment.center,
            children: [
              widget.isSelected
                  ? ShaderMask(
                      shaderCallback: (bounds) =>
                          AppTheme.primaryGradient.createShader(bounds),
                      blendMode: BlendMode.srcIn,
                      child: Icon(widget.icon, size: 22, color: Colors.white),
                    )
                  : Icon(widget.icon, size: 22, color: color),
              if (widget.isExpanded) ...[
                const SizedBox(width: 14),
                Text(
                  widget.label,
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: widget.isSelected
                        ? FontWeight.w700
                        : FontWeight.w500,
                    fontSize: 14,
                    color: widget.isSelected ? AppTheme.brandCyan : color,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _SidebarFooterLink extends StatefulWidget {
  final String label;
  final VoidCallback onTap;
  const _SidebarFooterLink({required this.label, required this.onTap});

  @override
  State<_SidebarFooterLink> createState() => _SidebarFooterLinkState();
}

class _SidebarFooterLinkState extends State<_SidebarFooterLink> {
  bool _hovering = false;

  @override
  Widget build(BuildContext context) {
    return MouseRegion(
      onEnter: (_) => setState(() => _hovering = true),
      onExit: (_) => setState(() => _hovering = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: widget.onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
          child: Text(
            widget.label,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: _hovering ? AppTheme.brandCyan : AppTheme.slate500,
            ),
          ),
        ),
      ),
    );
  }
}

// ─── FLOATING AI CHAT OVERLAY ───────────────────────────────────────────────
// Messenger-style floating bubble: tap to expand into full chat panel.
// Context-aware: knows which page is open and passes it to the AI.

class _FloatingAiOverlay extends ConsumerStatefulWidget {
  final String currentRoute;
  const _FloatingAiOverlay({required this.currentRoute});

  @override
  ConsumerState<_FloatingAiOverlay> createState() => _FloatingAiOverlayState();
}

class _FloatingAiOverlayState extends ConsumerState<_FloatingAiOverlay>
    with TickerProviderStateMixin {
  bool _isOpen = false;

  // Panel animation: elastic spring (messenger-style pop)
  late AnimationController _panelCtrl;
  late Animation<double> _panelScale;
  late Animation<double> _panelOpacity;

  // FAB bounce animation on tap
  late AnimationController _fabCtrl;
  late Animation<double> _fabScale;

  @override
  void initState() {
    super.initState();
    _panelCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 480),
      reverseDuration: const Duration(milliseconds: 220),
    );
    _panelScale = CurvedAnimation(
      parent: _panelCtrl,
      curve: Curves.elasticOut,
      reverseCurve: Curves.easeInCubic,
    );
    _panelOpacity = CurvedAnimation(parent: _panelCtrl, curve: Curves.easeOut);

    _fabCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 140),
    );
    _fabScale = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 1.0, end: 0.82), weight: 50),
      TweenSequenceItem(tween: Tween(begin: 0.82, end: 1.0), weight: 50),
    ]).animate(CurvedAnimation(parent: _fabCtrl, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _panelCtrl.dispose();
    _fabCtrl.dispose();
    super.dispose();
  }

  void _toggle() {
    HapticFeedback.selectionClick();
    _fabCtrl.forward(from: 0);
    setState(() => _isOpen = !_isOpen);
    if (_isOpen) {
      _panelCtrl.forward();
    } else {
      _panelCtrl.reverse();
    }
  }

  Map<String, dynamic> _buildContext() {
    final route = widget.currentRoute;
    String pageDesc = 'home page';
    if (route.contains('browse')) {
      pageDesc = 'product browse/category page';
    } else if (route.contains('compare')) {
      pageDesc = 'product comparison page';
    } else if (route.contains('product')) {
      pageDesc = 'product detail page';
    } else if (route.contains('link-paste')) {
      pageDesc = 'Link Analysis page';
    } else if (route.contains('subscriptions')) {
      pageDesc = 'subscriptions page';
    } else if (route.contains('collection')) {
      pageDesc = 'saved collection page';
    }
    final pageCtx = ref.read(aiPageContextProvider);
    return {'page': pageDesc, 'route': route, if (pageCtx != null) ...pageCtx};
  }

  @override
  Widget build(BuildContext context) {
    final bottomPadding = MediaQuery.of(context).padding.bottom;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    const fabSize = 50.0;
    const fabRight = 14.0;
    // Kategori (browse) sekmesinde alt nav yok: FAB ekranın sağ altına; diğer sekmelerde nav üstüne.
    final isBrowse = widget.currentRoute.contains('browse');
    final fabBottomBase = isBrowse
        ? 10.0
        : (AppTheme.navBarTotalClearance - 2.0);

    // Hide when actively comparing (≥2 products selected — hideNavBarProvider=true)
    final hideForCompare = ref.watch(hideNavBarProvider);
    if (hideForCompare) {
      return const SizedBox.shrink();
    }

    final bubbleBg = isDark ? Colors.black : Colors.white;
    final bubbleShadow = isDark
        ? Colors.black.withValues(alpha: 0.55)
        : Colors.black.withValues(alpha: 0.18);
    final keyboardHeight = MediaQuery.viewInsetsOf(context).bottom;

    final openFabLift = _isOpen
        ? (keyboardHeight > 0 ? keyboardHeight + 92.0 : 176.0)
        : 0.0;
    final panelBottomOffset = bottomPadding + fabBottomBase + fabSize + 6;

    return LayoutBuilder(
      builder: (context, constraints) {
        final availH = constraints.maxHeight;
        // Panel height: 70% of available, but never closer than 16px to the top
        final maxBySpace = availH - panelBottomOffset - 16;
        final panelH = (availH * 0.70).clamp(
          200.0,
          maxBySpace.clamp(200.0, 540.0),
        );

        return Stack(
          children: [
            // ── Backdrop ──────────────────────────────────────────────────
            if (_isOpen)
              Positioned.fill(
                child: GestureDetector(
                  onTap: _toggle,
                  child: AnimatedOpacity(
                    opacity: _isOpen ? 0.42 : 0,
                    duration: const Duration(milliseconds: 280),
                    child: Container(color: Colors.black),
                  ),
                ),
              ),

            // ── Chat Panel ────────────────────────────────────────────────
            AnimatedPositioned(
              duration: const Duration(milliseconds: 320),
              curve: Curves.easeOutCubic,
              bottom: panelBottomOffset,
              right: fabRight - 2,
              left: 12,
              height: panelH,
              child: IgnorePointer(
                ignoring: !_isOpen,
                child: FadeTransition(
                  opacity: _panelOpacity,
                  child: ScaleTransition(
                    scale: _panelScale,
                    alignment: Alignment.bottomRight,
                    child: Container(
                      clipBehavior: Clip.hardEdge,
                      decoration: BoxDecoration(
                        color: context.surfaceVariantColor,
                        borderRadius: BorderRadius.circular(22),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(
                              alpha: isDark ? 0.5 : 0.2,
                            ),
                            blurRadius: 36,
                            offset: const Offset(0, 10),
                          ),
                          BoxShadow(
                            color: AppTheme.brandCyan.withValues(alpha: 0.06),
                            blurRadius: 20,
                          ),
                        ],
                        border: Border.all(
                          color: context.dividerColor.withValues(alpha: 0.25),
                        ),
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(22),
                        child: _isOpen
                            ? AIChatScreen(
                                isOverlay: true,
                                pageContext: _buildContext(),
                              )
                            : const SizedBox.shrink(),
                      ),
                    ),
                  ),
                ),
              ),
            ),

            // ── FAB Speech Bubble ─────────────────────────────────────────
            AnimatedPositioned(
              // 800ms elasticOut → 250ms easeOutCubic: elasticOut her route
              // değişiminde 800ms boyunca frame hesaplar. easeOutCubic aynı
              // hissi çok daha düşük maliyetle verir.
              duration: const Duration(milliseconds: 250),
              curve: Curves.easeOutCubic,
              bottom: bottomPadding + fabBottomBase + openFabLift,
              right: fabRight,
              child: GestureDetector(
                onTap: _toggle,
                child: ScaleTransition(
                  scale: _fabScale,
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      // Main circle
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 220),
                        width: fabSize,
                        height: fabSize,
                        decoration: BoxDecoration(
                          color: bubbleBg,
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: isDark
                                ? Colors.white.withValues(alpha: 0.1)
                                : AppTheme.brandCyan.withValues(alpha: 0.25),
                            width: 1.5,
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: bubbleShadow,
                              blurRadius: 18,
                              offset: const Offset(0, 5),
                            ),
                            BoxShadow(
                              color: AppTheme.brandCyan.withValues(
                                alpha: _isOpen ? 0.35 : 0.15,
                              ),
                              blurRadius: _isOpen ? 24 : 10,
                              offset: const Offset(0, 2),
                            ),
                          ],
                        ),
                        child: Center(
                          child: Image.asset(
                            'assets/logo/qor_ai_logo.png',
                            width: 30,
                            height: 30,
                            fit: BoxFit.contain,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        );
      },
    ); // end LayoutBuilder
  }
}
