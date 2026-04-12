/// Compair - Main Shell (Modern Navigation)
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
import "package:compair/core/app_keys.dart";
import "package:compair/presentation/providers/providers.dart";
// pcBuilderProductsProvider buradan erişilir (providers.dart part file)
import "package:compair/domain/entities/product_entity.dart";
import "package:compair/presentation/screens/ai_chat/ai_chat_screen.dart";
import "package:compair/services/connectivity_service.dart";
import "package:compair/routing/router.dart";
import "package:compair/core/theme.dart";
import "package:compair/core/extensions.dart";
import "package:compair/l10n/app_localizations.dart";

const _kNavBarHeight = AppTheme.navBarHeight;
const _kSidebarWidth = 240.0;
const _kRailWidth = 72.0;

class MainShell extends ConsumerStatefulWidget {
  final Widget child;

  const MainShell({super.key, required this.child});

  @override
  ConsumerState<MainShell> createState() => _MainShellState();
}

class _MainShellState extends ConsumerState<MainShell> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _warmCache();
    });
  }

  Future<void> _warmCache() async {
    try {
      ref.read(firebaseDataSourceProvider).preWarmSearchFunction();
      ref.read(firebaseDataSourceProvider).warmUpCache();
    } catch (_) {}
    // Kick off IP-based country detection in background
    try {
      ref.read(countryInitProvider);
    } catch (_) {}
    // Preload PC Builder categories in PARALLEL batches of 4
    // to maximize speed while avoiding Firestore SDK connection throttling
    Future.microtask(() async {
      const pcCats = [
        'cpus', 'gpus', 'ram', 'ssd',
        'psu', 'cases', 'coolers', 'motherboards',
        'monitors', 'keyboards', 'mice', 'headsets',
      ];
      const batchSize = 4;
      for (var i = 0; i < pcCats.length; i += batchSize) {
        final batch = pcCats.skip(i).take(batchSize);
        await Future.wait(
          batch.map((cat) => ref.read(pcBuilderProductsProvider(cat).future).catchError((_) => <ProductEntity>[])),
        );
      }
    });
  }

  int _indexFromLocation(String location) {
    if (location.startsWith(AppRoutes.pcBuilder)) return 0;
    if (location.startsWith(AppRoutes.compare)) return 1;
    if (location.startsWith(AppRoutes.home)) return 2;
    if (location.startsWith(AppRoutes.linkPaste)) return 3;
    if (location.startsWith(AppRoutes.subscriptions)) return 4;
    return 2;
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
    Navigator.of(context, rootNavigator: true).popUntil((route) => route is! PopupRoute);
    ref.read(bottomNavIndexProvider.notifier).state = index;
    context.go(_navRoutes[index]);
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
    final location = GoRouterState.of(context).matchedLocation;
    final isLinkAiAnalyzing = ref.watch(compareAnalysisProvider).isWorking ||
        ref.watch(linkQuizProvider).phase == LinkFlowPhase.analyzing ||
        ref.watch(linkQuizProvider).phase == LinkFlowPhase.computing;
    final hideNavBar = ref.watch(hideNavBarProvider);

    return Stack(
      children: [
        Positioned.fill(
          child: Column(
            children: [
              _buildConnectivityBanner(connectivity),
              Expanded(child: widget.child),
            ],
          ),
        ),
        if (!hideNavBar)
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: _FloatingNavBar(
              currentIndex: currentIndex,
              onTap: _onNavTap,
              isLinkAiAnalyzing: isLinkAiAnalyzing,
            ),
          ),
        // Floating AI chat bubble (top of stack, above nav bar)
        Positioned.fill(
          child: _FloatingAiOverlay(currentRoute: location),
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
                    child: widget.child,
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
  return [
    _NavItem(Icons.memory_outlined, Icons.memory_rounded, l10n?.pcBuilder ?? 'PC Build'),
    _NavItem(Icons.compare_arrows_outlined, Icons.compare_arrows_rounded, l10n?.compare ?? 'Compare'),
    _NavItem(Icons.home_outlined, Icons.home_rounded, l10n?.home ?? 'Home'), // center — featured
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
    final bottomPadding = MediaQuery.of(context).padding.bottom;
    final items = _buildNavItems(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: Container(
          height: _kNavBarHeight + bottomPadding,
          padding: EdgeInsets.only(bottom: bottomPadding),
          decoration: BoxDecoration(
            color: isDark
                ? AppTheme.brandDark.withValues(alpha: 0.85)
                : context.surfaceElevatedColor.withValues(alpha: 0.95),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
            border: Border(
              top: BorderSide(color: context.dividerColor, width: 0.5),
            ),
          ),
          child: Row(
            children: List.generate(items.length, (index) {
              final item = items[index];
              final isSelected = index == currentIndex;
              final isCenter = index == 2; // Home — featured center button

              if (isCenter) {
                return Expanded(
                  child: GestureDetector(
                    onTap: () {
                      if (!kIsWeb) HapticFeedback.selectionClick();
                      onTap(index);
                    },
                    behavior: HitTestBehavior.opaque,
                    child: SizedBox(
                      height: _kNavBarHeight,
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          // Floating gradient pill button — compact size
                          Container(
                            width: 42,
                            height: 42,
                            decoration: BoxDecoration(
                              gradient: AppTheme.primaryGradient,
                              borderRadius: BorderRadius.circular(14),
                              boxShadow: [
                                BoxShadow(
                                  color: AppTheme.brandCyan.withValues(alpha: isSelected ? 0.45 : 0.2),
                                  blurRadius: isSelected ? 12 : 6,
                                  offset: const Offset(0, 3),
                                ),
                              ],
                            ),
                            child: Icon(
                              isSelected ? item.activeIcon : item.icon,
                              size: 20,
                              color: Colors.white,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            item.label,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 9.5,
                              fontWeight: FontWeight.w700,
                              color: isSelected ? AppTheme.brandCyan : AppTheme.slate600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                );
              }

              return Expanded(
                child: GestureDetector(
                  onTap: () {
                    if (!kIsWeb) HapticFeedback.selectionClick();
                    onTap(index);
                  },
                  behavior: HitTestBehavior.opaque,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    curve: Curves.easeOutCubic,
                    height: _kNavBarHeight,
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        // Active indicator line at top
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 250),
                          height: 2,
                          width: isSelected ? 24 : 0,
                          margin: const EdgeInsets.only(bottom: 6),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(1),
                            gradient: isSelected ? _brandGradient : null,
                            boxShadow: isSelected
                                ? [BoxShadow(
                                    color: AppTheme.brandCyan.withValues(alpha: 0.6),
                                    blurRadius: 6,
                                  )]
                                : null,
                          ),
                        ),
                        // Icon with optional loading indicator for Link AI
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
                                      child: Icon(item.activeIcon, size: 22, color: Colors.white),
                                    )
                                  : Icon(
                                      item.icon,
                                      key: ValueKey('inactive_$index'),
                                      size: 22,
                                      color: AppTheme.slate600,
                                    ),
                            ),
                            // Loading indicator for Link AI tab (index 3)
                            if (index == 3 && isLinkAiAnalyzing)
                              Positioned(
                                right: -4,
                                top: -4,
                                child: SizedBox(
                                  width: 10,
                                  height: 10,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 1.5,
                                    valueColor: const AlwaysStoppedAnimation(AppTheme.brandCyan),
                                  ),
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 3),
                        // Label
                        AnimatedDefaultTextStyle(
                          duration: const Duration(milliseconds: 200),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: isSelected ? 9.5 : 9,
                            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w400,
                            color: isSelected ? AppTheme.brandCyan : AppTheme.slate600,
                          ),
                          child: Text(item.label),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
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
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Image.asset('assets/logo/compair_logo_512.png',
                        width: 36, height: 36, fit: BoxFit.cover),
                  ),
                  if (isExpanded) ...[
                    const SizedBox(width: 12),
                    Text("Compair",
                        style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w800, fontSize: 20,
                            color: context.textPrimary)),
                  ],
                ],
              ),
            ),
            Divider(height: 1, color: context.dividerColor),
            const SizedBox(height: 12),
            ...List.generate(_buildNavItems(context).length, (index) {
              final item = _buildNavItems(context)[index];
              final isSelected = index == currentIndex;
              return _SidebarItem(
                icon: isSelected ? item.activeIcon : item.icon,
                label: item.label,
                isSelected: isSelected,
                isExpanded: isExpanded,
                onTap: () => onTap(index),
              );
            }),
            const Spacer(),
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
                child: Text("© 2025 Compair",
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
    const fabSize = 62.0;
    const fabBottom = _kNavBarHeight + 10.0;
    const fabRight = 14.0;

    // Hide when actively comparing (≥2 products selected — hideNavBarProvider=true)
    final hideForCompare = ref.watch(hideNavBarProvider);
    if (hideForCompare) {
      return const SizedBox.shrink();
    }

    final bubbleBg = isDark ? Colors.black : Colors.white;
    final bubbleShadow = isDark
        ? Colors.black.withValues(alpha: 0.55)
        : Colors.black.withValues(alpha: 0.18);

    final panelBottomOffset = bottomPadding + fabBottom + fabSize + 6;

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
        Positioned(
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
      Positioned(
        bottom: bottomPadding + fabBottom,
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
                              size: 24)
                          : Image.asset(
                              key: const ValueKey('logo'),
                              'assets/logo/compair_logo.png',
                              width: 38, height: 38,
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
