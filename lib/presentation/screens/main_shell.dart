/// Qor AI - Main Shell (Modern Navigation)
/// Mobile: 3-tab floating pill nav + hamburger drawer
/// Desktop/Tablet: Side rail navigation
library;

import "dart:ui";
import "package:flutter/foundation.dart" show kIsWeb;
import "package:flutter/material.dart";
import "package:flutter/services.dart";
import "package:flutter_riverpod/flutter_riverpod.dart";
import "package:go_router/go_router.dart";
import "package:google_fonts/google_fonts.dart";
import "package:qor_ai/core/app_keys.dart";
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
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
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

  void _primeBackgroundState() {
    try {
      ref.read(countryInitProvider);
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
      final authState = ref.read(authStateProvider);
      final uid = authState.valueOrNull;
      if (uid == null) return;

      final pbDs = ref.read(pbDataSourceProvider);
      final messaging = FirebaseMessaging.instance;

      // Listen for refreshes first so we never miss the initial token
      // if it arrives between the read and the listener registration.
      messaging.onTokenRefresh.listen((newToken) async {
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

  int _indexFromLocation(String location) {
    // Branch indices match StatefulShellRoute definition:
    // 0=pcBuilder 1=compare 2=home(+browse+aiChat) 3=linkPaste 4=subscriptions
    return widget.navigationShell.currentIndex.clamp(0, 4);
  }

  static const _navRoutes = [
    AppRoutes.pcBuilder,
    AppRoutes.compare,
    AppRoutes.home,
    AppRoutes.linkPaste,
    AppRoutes.subscriptions,
  ];

  void _onNavTap(int index) {
    if (!kIsWeb) HapticFeedback.lightImpact();
    // Close any open modals/bottom sheets before navigating
    Navigator.of(context, rootNavigator: true)
        .popUntil((route) => route is! PopupRoute);
    ref.read(bottomNavIndexProvider.notifier).state = index;
    // initialLocation:true resets a branch to its root route when re-tapped,
    // so repeated taps on Home pop back to /home from /home/browse.
    widget.navigationShell.goBranch(
      index,
      initialLocation: index == widget.navigationShell.currentIndex,
    );
  }

  Widget _buildConnectivityBanner(AsyncValue<ConnectivityStatus> connectivity) {
    return connectivity.when(
      data: (status) {
        if (status == ConnectivityStatus.offline) {
          return SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                decoration: BoxDecoration(
                  color: AppTheme.error,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.wifi_off_rounded, color: Colors.white, size: 16),
                    const SizedBox(width: 8),
                    Text(AppLocalizations.of(context)?.noInternetConnection ?? "No internet connection",
                        style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            ),
          );
        }
        return const SizedBox.shrink();
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    final currentIndex = _indexFromLocation(location);
    final connectivity = ref.watch(connectivityProvider);
    final bottomPadding = MediaQuery.of(context).padding.bottom;
    final useDesktopLayout = context.isDesktop || context.isTablet;
    // Watch unread count to keep notificationsProvider alive app-wide
    ref.watch(unreadNotificationCountProvider);

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        key: mainShellScaffoldKey,
        backgroundColor: context.backgroundColor,
        extendBody: !useDesktopLayout,
        body: useDesktopLayout
            ? _buildDesktopLayout(currentIndex, connectivity)
            : _buildMobileLayout(currentIndex, connectivity, bottomPadding),
      ),
    );
  }

  Widget _buildMobileLayout(int currentIndex,
      AsyncValue<ConnectivityStatus> connectivity, double bottomPadding) {
    final goState = GoRouterState.of(context);
    final path = goState.uri.path;
    final location = goState.matchedLocation;
    // Kategori tarama: hem /browse hem /home/browse (sorgu yolu uri.path’te yok)
    final isBrowseRoute = path == AppRoutes.browse ||
        path == '/home/browse' ||
        path.startsWith('/home/browse/');
    final isLinkAiAnalyzing =
        ref.watch(compareAnalysisProvider.select((s) => s.isWorking)) ||
        ref.watch(linkQuizProvider.select((s) =>
            s.phase == LinkFlowPhase.analyzing ||
            s.phase == LinkFlowPhase.computing));
    final hideNavBar = ref.watch(hideNavBarProvider);
    final effectiveHideNavBar = isBrowseRoute || hideNavBar;
    if (!isBrowseRoute && location == AppRoutes.home && hideNavBar) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ref.read(hideNavBarProvider.notifier).state = false;
      });
    }

    return Stack(
      children: [
        Positioned.fill(
          child: Column(
            children: [
              _buildConnectivityBanner(connectivity),
              Expanded(child: widget.navigationShell),
            ],
          ),
        ),
        if (!effectiveHideNavBar)
          Positioned(
            left: AppTheme.navBarHMargin,
            right: AppTheme.navBarHMargin,
            bottom: bottomPadding + AppTheme.navBarBottomMargin,
            child: RepaintBoundary(
            child: _FloatingNavBar(
              currentIndex: currentIndex,
              onTap: _onNavTap,
              isLinkAiAnalyzing: isLinkAiAnalyzing,
            ),
          ),
          ),
        // Floating AI chat bubble (top of stack, above nav bar)
        Positioned.fill(
          child: RepaintBoundary(child: _FloatingAiOverlay(currentRoute: location)),
        ),
      ],
    );
  }

  Widget _buildDesktopLayout(int currentIndex,
      AsyncValue<ConnectivityStatus> connectivity) {
    final isWide = context.screenWidth >= Breakpoints.desktop;
    return Row(
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
              _buildConnectivityBanner(connectivity),
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
  // Use short labels in the nav bar to prevent overflow on small screens.
  return [
    _NavItem(Icons.memory_outlined, Icons.memory_rounded,
        isTr ? 'PC Topla' : 'PC Build'),
    _NavItem(Icons.compare_arrows_outlined, Icons.compare_arrows_rounded,
        l10n?.compare ?? 'Compare'),
    _NavItem(Icons.home_outlined, Icons.home_rounded,
        l10n?.home ?? 'Home'), // center — featured
    _NavItem(Icons.link_rounded, Icons.link_rounded, 'Link AI'),
    _NavItem(Icons.subscriptions_outlined, Icons.subscriptions_rounded, 'Subs'),
  ];
}


// ─── FLOATING NAV BAR (3 items, ultra-slim) ───

class _FloatingNavBar extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;
  final bool isLinkAiAnalyzing;

  const _FloatingNavBar({
    required this.currentIndex,
    required this.onTap,
    this.isLinkAiAnalyzing = false,
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
        // Light mode bg is 96% opaque, blur is imperceptible — skip it.
        // Dark mode keeps a cheaper 10-sigma blur for glass feel.
        child: (isDark
            ? BackdropFilter(
                filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
                child: _navBarInner(context, items, isDark),
              )
            : _navBarInner(context, items, isDark)),
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
                final isCenter = index == 2; // Home — featured center button

                if (isCenter) {
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
                      child: Column(
                          mainAxisSize: MainAxisSize.min,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                              width: 42,
                              height: 42,
                              decoration: BoxDecoration(
                                gradient: AppTheme.primaryGradient,
                                borderRadius: BorderRadius.circular(14),
                                boxShadow: [
                                  BoxShadow(
                                    color: AppTheme.brandCyan.withValues(
                                        alpha: isSelected ? 0.55 : 0.22),
                                    blurRadius: isSelected ? 18 : 8,
                                    offset: const Offset(0, 3),
                                  ),
                                ],
                              ),
                              child: Icon(
                                isSelected ? item.activeIcon : item.icon,
                                size: 22,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              item.label,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 10,
                                height: 1.0,
                                fontWeight: FontWeight.w700,
                                color: isSelected
                                    ? AppTheme.brandCyan
                                    : AppTheme.slate500,
                              ),
                            ),
                          ],
                        ),
                    ),
                    ),
                  );
                }

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
                              horizontal: isSelected ? 10 : 6, vertical: 4),
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
                                            child: Icon(item.activeIcon,
                                                size: 22, color: Colors.white),
                                          )
                                        : Icon(
                                            item.icon,
                                            key: ValueKey('inactive_$index'),
                                            size: 22,
                                            color: AppTheme.slate500,
                                          ),
                                  ),
                                  if (index == 3 && isLinkAiAnalyzing)
                                    Positioned(
                                      right: -4,
                                      top: -4,
                                      child: SizedBox(
                                        width: 10,
                                        height: 10,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 1.5,
                                          valueColor:
                                              const AlwaysStoppedAnimation(
                                                  AppTheme.brandCyan),
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                              const SizedBox(height: 3),
                              AnimatedDefaultTextStyle(
                                duration: const Duration(milliseconds: 200),
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: isSelected ? 10 : 9.5,
                                  height: 1.0,
                                  fontWeight: isSelected
                                      ? FontWeight.w700
                                      : FontWeight.w500,
                                  color: isSelected
                                      ? AppTheme.brandCyan
                                      : AppTheme.slate500,
                                ),
                                child: Text(
                                  item.label,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  softWrap: false,
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
                    child: Image.asset('assets/logo/qor_ai_logo_512.png',
                        width: 32, height: 32, fit: BoxFit.contain),
                  ),
                  if (isExpanded) ...[
                    const SizedBox(width: 12),
                    Text("Qor AI",
                        style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w800, fontSize: 20,
                            color: context.textPrimary)),
                  ],
                ],
              ),
            ),
            Divider(height: 1, color: context.dividerColor),
            Expanded(
              child: Builder(builder: (context) {
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
              }),
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
                child: Text("© 2025 Qor AI",
                    style: GoogleFonts.plusJakartaSans(
                        fontSize: 11, color: AppTheme.slate400)),
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
            horizontal: widget.isExpanded ? 12 : 8, vertical: 2),
          padding: EdgeInsets.symmetric(
            horizontal: widget.isExpanded ? 14 : 0, vertical: 12),
          decoration: BoxDecoration(
            color: widget.isSelected
                ? AppTheme.brandCyan.withValues(alpha: 0.08)
                : (_hovering ? Colors.white.withValues(alpha: 0.05) : Colors.transparent),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            mainAxisAlignment:
                widget.isExpanded ? MainAxisAlignment.start : MainAxisAlignment.center,
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
                    fontWeight: widget.isSelected ? FontWeight.w700 : FontWeight.w500,
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
    if (route.contains('browse')) pageDesc = 'product browse/category page';
    else if (route.contains('compare')) pageDesc = 'product comparison page';
    else if (route.contains('product')) pageDesc = 'product detail page';
    else if (route.contains('pc-builder')) pageDesc = 'PC Builder wizard';
    else if (route.contains('link-paste')) pageDesc = 'Link Analysis page';
    else if (route.contains('subscriptions')) pageDesc = 'subscriptions page';
    else if (route.contains('collection')) pageDesc = 'saved collection page';
    final pageCtx = ref.read(aiPageContextProvider);
    return {
      'page': pageDesc,
      'route': route,
      if (pageCtx != null) ...pageCtx,
    };
  }

  @override
  Widget build(BuildContext context) {
    final bottomPadding = MediaQuery.of(context).padding.bottom;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    const fabSize = 50.0;
    const fabRight = 14.0;
    // Kategori (browse) sekmesinde alt nav yok: FAB ekranın sağ altına; diğer sekmelerde nav üstüne.
    final isBrowse = widget.currentRoute.contains('browse');
    final fabBottomBase =
        isBrowse ? 10.0 : (AppTheme.navBarTotalClearance - 2.0);

    // Hide when actively comparing (≥2 products selected — hideNavBarProvider=true)
    final hideForCompare = ref.watch(hideNavBarProvider);
    if (hideForCompare) {
      return const SizedBox.shrink();
    }

    final bubbleBg = isDark ? Colors.black : Colors.white;
    final bubbleShadow = isDark
        ? Colors.black.withValues(alpha: 0.55)
        : Colors.black.withValues(alpha: 0.18);

    final panelBottomOffset = bottomPadding + fabBottomBase + fabSize + 6;

    return LayoutBuilder(builder: (context, constraints) {
      final availH = constraints.maxHeight;
      // Panel height: 70% of available, but never closer than 16px to the top
      final maxBySpace = availH - panelBottomOffset - 16;
      final panelH = (availH * 0.70).clamp(200.0, maxBySpace.clamp(200.0, 540.0));

      return Stack(children: [
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
                        color: Colors.black.withValues(alpha: isDark ? 0.5 : 0.2),
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
                            onClose: _toggle,
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
        duration: const Duration(milliseconds: 800),
        curve: Curves.elasticOut,
        bottom: bottomPadding + fabBottomBase,
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
                        color: AppTheme.brandCyan.withValues(alpha: _isOpen ? 0.35 : 0.15),
                        blurRadius: _isOpen ? 24 : 10,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Center(
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 180),
                      transitionBuilder: (child, anim) => ScaleTransition(
                        scale: anim, child: child),
                      child: _isOpen
                          ? Icon(Icons.close_rounded,
                              key: const ValueKey('close'),
                              color: isDark ? Colors.white : AppTheme.brandCyan,
                              size: 20)
                          : Image.asset(
                              key: const ValueKey('logo'),
                              'assets/logo/qor_ai_logo.png',
                              width: 30, height: 30,
                              fit: BoxFit.contain,
                            ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ]);
    }); // end LayoutBuilder
  }
}
