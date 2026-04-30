import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:qor_ai/core/constants.dart';
import 'package:qor_ai/core/pb_client.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/presentation/screens/ai_chat/ai_chat_screen.dart';
import 'package:qor_ai/presentation/screens/ai_chat/chat_history_screen.dart';

class FloatingAiAssistantOverlay extends ConsumerStatefulWidget {
  const FloatingAiAssistantOverlay({super.key});

  @override
  ConsumerState<FloatingAiAssistantOverlay> createState() =>
      _FloatingAiAssistantOverlayState();
}

class _FloatingAiAssistantOverlayState
    extends ConsumerState<FloatingAiAssistantOverlay>
    with TickerProviderStateMixin {
  static const _fabSize = 58.0;
  static const _edge = 14.0;

  bool _isOpen = false;
  bool _showHistory = false;
  Offset? _fabOffset;
  double _dragDistance = 0;
  bool _dragging = false;
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
    setState(() {
      _isOpen = !_isOpen;
      if (!_isOpen) {
        _showHistory = false;
      }
    });
    if (_isOpen) {
      _panelCtrl.forward();
    } else {
      _panelCtrl.reverse();
    }
  }

  double _bottomLimit(Size size, EdgeInsets padding) {
    return size.height -
        _fabSize -
        padding.bottom -
        AppTheme.navBarHeight -
        _edge;
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

  Map<String, dynamic> _routeScopedPageContext(
    String route,
    Map<String, dynamic>? pageCtx,
  ) {
    if (pageCtx == null) return const {};
    final contextRoute = pageCtx['contextRoute']?.toString().trim() ?? '';
    final routeMatchesContext =
        contextRoute.isEmpty ||
        route.contains(contextRoute) ||
        (contextRoute == 'subscriptions' && route.contains('premium'));
    if (!routeMatchesContext) {
      return const {};
    }
    final hasProduct =
        pageCtx.containsKey('productName') || pageCtx.containsKey('productId');
    if (hasProduct && !route.contains('product')) {
      return const {};
    }
    return pageCtx;
  }

  String _enumName(Object value) => value.toString().split('.').last;

  String _shortText(String? value, {int max = 900}) {
    final text = value?.replaceAll(RegExp(r'\s+'), ' ').trim() ?? '';
    if (text.length <= max) return text;
    return '${text.substring(0, max)}...';
  }

  String _compactUrl(String url) {
    final uri = Uri.tryParse(url);
    final host = uri?.host.isNotEmpty == true ? uri!.host : url;
    final path = uri?.pathSegments
        .where((segment) => segment.isNotEmpty)
        .take(3)
        .join('/');
    return path == null || path.isEmpty ? host : '$host/$path';
  }

  String _quizProgress(List<dynamic> questions, int currentIndex) {
    if (questions.isEmpty) return '';
    final answered = questions.where((question) {
      final selected = question.selectedOption?.toString().trim() ?? '';
      return selected.isNotEmpty;
    }).length;
    final position = math.min(currentIndex + 1, questions.length);
    return '$answered/${questions.length} answered, current question $position/${questions.length}';
  }

  Map<String, dynamic> _linkAnalysisContext(String route) {
    if (!route.contains('link-paste')) return const {};

    final single = ref.read(linkQuizProvider);
    final compare = ref.read(compareAnalysisProvider);
    final context = <String, dynamic>{
      'contextRoute': 'link-paste',
      'activeScreen': 'Link AI analysis screen',
    };

    if (single.phase != LinkFlowPhase.idle ||
        single.baseResult != null ||
        single.enhancedResult != null) {
      final base = single.baseResult;
      final enhanced = single.enhancedResult;
      context.addAll({
        'singleLinkPhase': _enumName(single.phase),
        if (base != null) 'singleLinkUrl': _compactUrl(base.url),
        if (base?.metadata.title != null)
          'singleLinkProduct': base!.metadata.title,
        if (base?.category != null) 'singleLinkCategory': base!.category,
        if (base != null)
          'singleLinkInitialScore': base.aiScore.toStringAsFixed(0),
        if (enhanced != null)
          'singleLinkEnhancedScore': enhanced.enhancedScore.toStringAsFixed(0),
        if (enhanced != null)
          'singleLinkVerdict': _shortText(enhanced.detailedVerdict),
        if (single.databaseMatch != null)
          'singleLinkDatabaseMatch': single.databaseMatch!.name,
        if (single.similarProducts.isNotEmpty)
          'singleLinkSimilarProducts': single.similarProducts
              .take(5)
              .map((product) => product.name)
              .join(' | '),
        if (single.answeredQuestions.isNotEmpty)
          'singleLinkQuizProgress': _quizProgress(
            single.answeredQuestions,
            single.currentQuestionIndex,
          ),
        if (single.error?.trim().isNotEmpty == true)
          'singleLinkError': single.error,
      });
    }

    if (compare.phase != ComparePhase.idle ||
        compare.validUrls.isNotEmpty ||
        compare.results.isNotEmpty) {
      context.addAll({
        'linkComparePhase': _enumName(compare.phase),
        if (compare.validUrls.isNotEmpty)
          'linkCompareUrls': compare.validUrls.map(_compactUrl).join(' vs '),
        if (compare.allBaseResults.isNotEmpty)
          'linkCompareScannedProducts': compare.allBaseResults
              .map(
                (result) =>
                    '${result.metadata.title ?? _compactUrl(result.url)} (${result.category ?? 'unknown'})',
              )
              .join(' vs '),
        if (compare.results.isNotEmpty)
          'linkCompareResults': compare.results
              .map(
                (result) =>
                    '${result.baseResult.metadata.title ?? _compactUrl(result.baseResult.url)} (${result.enhancedScore.toStringAsFixed(0)}/100)',
              )
              .join(' vs '),
        if (compare.steps.isNotEmpty)
          'linkCompareSteps': compare.steps
              .map((step) {
                final status = step.hasError
                    ? 'error'
                    : step.isDone
                    ? 'done'
                    : step.isActive
                    ? 'active'
                    : 'pending';
                return '${step.label}: $status';
              })
              .join(' | '),
        if (compare.quizAnswers.isNotEmpty)
          'linkCompareQuizProgress': _quizProgress(
            compare.quizAnswers,
            compare.quizIndex,
          ),
        if (compare.error?.trim().isNotEmpty == true)
          'linkCompareError': compare.error,
      });
    }

    return context;
  }

  Map<String, dynamic> _subscriptionAnalysisContext(String route) {
    if (!route.contains('subscriptions')) return const {};

    final state = ref.read(subQuizProvider);
    final subscription = ref.read(subscriptionServiceProvider);
    final context = <String, dynamic>{
      'contextRoute': 'subscriptions',
      'activeScreen': 'subscription analysis screen',
      'freeDailyQ':
          '${AppConstants.freeDailyAiCreditLimit} ${AppConstants.qorCurrencyName}/day',
      if (!subscription.isPremium)
        'remainingDailyQ': subscription.remainingDailyCredits.toStringAsFixed(
          1,
        ),
    };

    if (state.phase != SubFlowPhase.idle ||
        state.subscriptionNames.isNotEmpty) {
      context.addAll({
        'subscriptionAnalysisPhase': _enumName(state.phase),
        if (state.subscriptionNames.isNotEmpty)
          'subscriptionServices': state.subscriptionNames.join(' vs '),
        if (state.scores.isNotEmpty)
          'subscriptionScores': state.scores.toString(),
        if (state.analysisResult?.trim().isNotEmpty == true)
          'subscriptionAnalysisSummary': _shortText(state.analysisResult),
        if (state.answeredQuestions.isNotEmpty)
          'subscriptionQuizProgress': _quizProgress(
            state.answeredQuestions,
            state.currentQuestionIndex,
          ),
        if (state.error?.trim().isNotEmpty == true)
          'subscriptionError': state.error,
      });
    }

    return context;
  }

  Map<String, dynamic> _premiumPageContext(String route) {
    if (!route.contains('premium')) return const {};
    final subscription = ref.read(subscriptionServiceProvider);
    return {
      'contextRoute': 'premium',
      'activeScreen': 'premium subscription page',
      'premiumStatus': subscription.isPremium ? 'premium' : 'free',
      'freeTierDailyQ':
          '${AppConstants.freeDailyAiCreditLimit} ${AppConstants.qorCurrencyName}/day',
      'freeTierLimits':
          'Free AI actions use a shared limited daily Q pool. Premium unlocks unlimited Q.',
      if (!subscription.isPremium)
        'remainingDailyQ': subscription.remainingDailyCredits.toStringAsFixed(
          1,
        ),
    };
  }

  Map<String, dynamic> _buildContext(String route) {
    final pageCtx = _routeScopedPageContext(
      route,
      ref.read(aiPageContextProvider),
    );
    final compare = ref.read(compareSessionProvider);
    final pcBuild = ref.read(pcBuilderSessionProvider);
    final chatState = ref.read(chatSessionProvider);

    return {
      'page': _pageDescription(route),
      'route': route,
      ...pageCtx,
      ..._linkAnalysisContext(route),
      ..._subscriptionAnalysisContext(route),
      ..._premiumPageContext(route),
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
    final maxY = math.max(minY, _bottomLimit(size, padding));
    return Offset(raw.dx.clamp(minX, maxX), raw.dy.clamp(minY, maxY));
  }

  Offset _snapOffset(Offset raw, Size size, EdgeInsets padding) {
    final clamped = _clampOffset(raw, size, padding);
    final left = _edge;
    final right = size.width - _fabSize - _edge;
    final top = padding.top + _edge;
    final bottom = _bottomLimit(size, padding);

    final distances = <String, double>{
      'left': (clamped.dx - left).abs(),
      'right': (right - clamped.dx).abs(),
      'top': (clamped.dy - top).abs(),
      'bottom': (bottom - clamped.dy).abs(),
    };

    final nearest = distances.entries
        .reduce((a, b) => a.value <= b.value ? a : b)
        .key;

    switch (nearest) {
      case 'left':
        return Offset(left, clamped.dy);
      case 'right':
        return Offset(right, clamped.dy);
      case 'top':
        return Offset(clamped.dx, top);
      default:
        return Offset(clamped.dx, bottom);
    }
  }

  void _openHistory() {
    setState(() => _showHistory = true);
  }

  void _closeHistory() {
    setState(() => _showHistory = false);
  }

  @override
  Widget build(BuildContext context) {
    final route = _routePath(context);
    final auth = ref.watch(authStateProvider);
    final isLoggedIn = auth.valueOrNull != null || pb.authStore.isValid;
    if (!isLoggedIn || route == '/') {
      return const SizedBox.shrink();
    }
    final padding = MediaQuery.of(context).padding;
    final keyboardHeight = MediaQuery.viewInsetsOf(context).bottom;
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
        final openTopLimit = keyboardHeight > 0
            ? size.height - keyboardHeight - _fabSize - 96
            : size.height - padding.bottom - _fabSize - 220;
        final visibleFabTop = _isOpen
            ? math.max(padding.top + 12, math.min(current.dy, openTopLimit))
            : current.dy;

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
                        child: _showHistory
                            ? ChatHistoryScreen(
                                isOverlay: true,
                                onBack: _closeHistory,
                              )
                            : AIChatScreen(
                                isOverlay: true,
                                onHistoryPressed: _openHistory,
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
              top: visibleFabTop,
              width: _fabSize,
              height: _fabSize,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () {
                  if (_dragging) return;
                  _toggle();
                },
                onPanStart: (_) {
                  _dragDistance = 0;
                  _dragging = false;
                },
                onPanUpdate: (details) {
                  _dragDistance += details.delta.distance;
                  if (_dragDistance > 6) {
                    _dragging = true;
                  }
                  setState(() {
                    _fabOffset = _clampOffset(
                      (_fabOffset ?? current) + details.delta,
                      size,
                      padding,
                    );
                  });
                },
                onPanEnd: (_) {
                  if (_fabOffset == null) return;
                  setState(() {
                    _fabOffset = _snapOffset(_fabOffset!, size, padding);
                  });
                  _dragDistance = 0;
                  _dragging = false;
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
                      child: Image.asset(
                        'assets/logo/qor_ai_logo.png',
                        width: 32,
                        height: 32,
                        fit: BoxFit.contain,
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
