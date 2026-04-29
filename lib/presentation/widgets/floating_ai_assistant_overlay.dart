import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/presentation/screens/ai_chat/ai_chat_screen.dart';

class FloatingAiAssistantOverlay extends ConsumerStatefulWidget {
  const FloatingAiAssistantOverlay({super.key});

  @override
  ConsumerState<FloatingAiAssistantOverlay> createState() =>
      _FloatingAiAssistantOverlayState();
}

class _FloatingAiAssistantOverlayState
    extends ConsumerState<FloatingAiAssistantOverlay>
    with TickerProviderStateMixin {
  static const _fabSize = 68.0;
  static const _edge = 14.0;

  bool _isOpen = false;
  Offset? _fabOffset;
  late final AnimationController _panelCtrl;
  late final AnimationController _fabCtrl;
  late final Animation<double> _panelScale;
  late final Animation<double> _panelOpacity;
  late final Animation<double> _fabScale;

  @override
  void initState() {
    super.initState();
    _panelCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 260),
      reverseDuration: const Duration(milliseconds: 180),
    );
    _panelScale = CurvedAnimation(
      parent: _panelCtrl,
      curve: Curves.easeOutCubic,
      reverseCurve: Curves.easeInCubic,
    );
    _panelOpacity = CurvedAnimation(parent: _panelCtrl, curve: Curves.easeOut);
    _fabCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 160),
    );
    _fabScale = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 1, end: 0.88), weight: 45),
      TweenSequenceItem(tween: Tween(begin: 0.88, end: 1), weight: 55),
    ]).animate(CurvedAnimation(parent: _fabCtrl, curve: Curves.easeOutCubic));
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

  String _routePath(BuildContext context) {
    try {
      final router = GoRouter.maybeOf(context);
      final uri = router?.routeInformationProvider.value.uri;
      return uri?.path ?? '';
    } catch (_) {
      return '';
    }
  }

  String _pageDescription(String route) {
    if (route.contains('pc-builder')) return 'PC Builder screen';
    if (route.contains('compare')) return 'product comparison screen';
    if (route.contains('browse')) return 'category browse screen';
    if (route.contains('product')) return 'product detail screen';
    if (route.contains('link-paste')) return 'Link AI screen';
    if (route.contains('subscriptions') || route.contains('premium')) {
      return 'subscription and premium screen';
    }
    if (route.contains('collection')) return 'saved collection screen';
    if (route.contains('search')) return 'search screen';
    return 'current app screen';
  }

  Map<String, dynamic> _buildContext(String route) {
    final pageCtx = ref.read(aiPageContextProvider);
    final compare = ref.read(compareSessionProvider);
    final pcBuild = ref.read(pcBuilderSessionProvider);
    final chatState = ref.read(chatSessionProvider);

    return {
      'page': _pageDescription(route),
      'route': route,
      if (pageCtx != null) ...pageCtx,
      if (compare.comparedProducts != null &&
          compare.comparedProducts!.isNotEmpty)
        'compareProducts': compare.comparedProducts!
            .map((p) => '${p.name} (${p.techScore.round()}/100)')
            .take(4)
            .join(' vs '),
      if (pcBuild.isNotEmpty)
        'pcBuilderParts': pcBuild.entries
            .map((e) => '${e.key}: ${e.value.name}')
            .take(8)
            .join(' | '),
      'recentChatMessages': chatState.messages
          .where((m) => m.id != 'welcome')
          .take(6)
          .map((m) => '${m.role.name}: ${m.text}')
          .join(' | '),
    };
  }

  Offset _defaultOffset(Size size, EdgeInsets padding) {
    return Offset(
      size.width - _fabSize - _edge,
      size.height - _fabSize - padding.bottom - 300,
    );
  }

  Offset _clampOffset(Offset raw, Size size, EdgeInsets padding) {
    final minX = _edge;
    final maxX = math.max(minX, size.width - _fabSize - _edge);
    final minY = padding.top + _edge;
    final maxY = math.max(
      minY,
      size.height - _fabSize - padding.bottom - _edge,
    );
    return Offset(raw.dx.clamp(minX, maxX), raw.dy.clamp(minY, maxY));
  }

  @override
  Widget build(BuildContext context) {
    final route = _routePath(context);
    final padding = MediaQuery.of(context).padding;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final shouldHide = route.contains('/ai-chat');
    if (shouldHide) return const SizedBox.shrink();

    return LayoutBuilder(
      builder: (context, constraints) {
        final size = Size(constraints.maxWidth, constraints.maxHeight);
        final current = _clampOffset(
          _fabOffset ?? _defaultOffset(size, padding),
          size,
          padding,
        );
        if (_fabOffset == null || current != _fabOffset) {
          _fabOffset = current;
        }

        final panelTop = padding.top + 12;
        final panelBottom = padding.bottom + 18;
        final panelHeight = math.max(
          260.0,
          size.height - panelTop - panelBottom,
        );
        final panelBg = context.surfaceVariantColor;
        final bubbleBg = isDark ? Colors.black : Colors.white;

        return Stack(
          clipBehavior: Clip.none,
          children: [
            if (_isOpen)
              Positioned.fill(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: _toggle,
                  child: AnimatedOpacity(
                    duration: const Duration(milliseconds: 180),
                    opacity: _isOpen ? 0.38 : 0,
                    child: Container(color: Colors.black),
                  ),
                ),
              ),
            Positioned(
              left: 12,
              right: 12,
              top: panelTop,
              height: panelHeight,
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
                        color: panelBg,
                        borderRadius: BorderRadius.circular(22),
                        border: Border.all(
                          color: context.dividerColor.withValues(alpha: 0.24),
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(
                              alpha: isDark ? 0.56 : 0.22,
                            ),
                            blurRadius: 36,
                            offset: const Offset(0, 12),
                          ),
                          BoxShadow(
                            color: AppTheme.brandCyan.withValues(alpha: 0.08),
                            blurRadius: 28,
                          ),
                        ],
                      ),
                      child: Material(
                        type: MaterialType.transparency,
                        child: AIChatScreen(
                          isOverlay: true,
                          onClose: _toggle,
                          pageContext: _buildContext(route),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            AnimatedPositioned(
              duration: const Duration(milliseconds: 90),
              curve: Curves.easeOutCubic,
              left: current.dx,
              top: current.dy,
              width: _fabSize,
              height: _fabSize,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: _toggle,
                onPanUpdate: (details) {
                  setState(() {
                    _fabOffset = _clampOffset(
                      (_fabOffset ?? current) + details.delta,
                      size,
                      padding,
                    );
                  });
                },
                child: ScaleTransition(
                  scale: _fabScale,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    decoration: BoxDecoration(
                      color: bubbleBg,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: AppTheme.brandCyan.withValues(
                          alpha: _isOpen ? 0.55 : 0.25,
                        ),
                        width: 1.5,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(
                            alpha: isDark ? 0.5 : 0.18,
                          ),
                          blurRadius: 18,
                          offset: const Offset(0, 6),
                        ),
                        BoxShadow(
                          color: AppTheme.brandCyan.withValues(
                            alpha: _isOpen ? 0.38 : 0.14,
                          ),
                          blurRadius: _isOpen ? 28 : 12,
                        ),
                      ],
                    ),
                    child: Center(
                      child: AnimatedSwitcher(
                        duration: const Duration(milliseconds: 160),
                        transitionBuilder: (child, animation) =>
                            ScaleTransition(scale: animation, child: child),
                        child: _isOpen
                            ? Icon(
                                Icons.close_rounded,
                                key: const ValueKey('close'),
                                color: isDark
                                    ? Colors.white
                                    : AppTheme.brandCyan,
                                size: 22,
                              )
                            : Image.asset(
                                key: const ValueKey('logo'),
                                'assets/logo/qor_ai_logo.png',
                                width: 38,
                                height: 38,
                                fit: BoxFit.contain,
                              ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
