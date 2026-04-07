/// Compair - Link Paste Screen (AI Quiz-Enhanced Analysis)
///
/// Flow: Paste URL -> AI validates product -> Generates quiz -> User answers ->
/// Enhanced compatibility score with detailed breakdown.
library;

import 'dart:math';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/domain/entities/ai_entities.dart';
import 'package:compair/domain/entities/user_entity.dart';
import 'package:compair/presentation/providers/providers.dart';
import 'package:compair/presentation/widgets/glass_container.dart';
import 'package:compair/presentation/widgets/gradient_button.dart';

class LinkPasteScreen extends ConsumerStatefulWidget {
  const LinkPasteScreen({super.key});

  @override
  ConsumerState<LinkPasteScreen> createState() => _LinkPasteScreenState();
}

class _LinkPasteScreenState extends ConsumerState<LinkPasteScreen>
    with TickerProviderStateMixin {
  final List<TextEditingController> _urlControllers = [TextEditingController()];
  final List<FocusNode> _focusNodes = [FocusNode()];
  bool _hasCheckedClipboard = false;
  String? _detectedClipboardUrl;

  // Multi-link inline flow state
  List<String> _multiLinkUrls = [];
  List<EnhancedAnalysisResult> _multiLinkResults = [];
  int _currentMultiLinkIndex = 0;
  bool get _isMultiLinkFlow => _multiLinkUrls.length > 1;
  bool get _multiLinkComplete =>
      _isMultiLinkFlow && _multiLinkResults.length >= _multiLinkUrls.length;

  // Keep single-controller alias for backward compat in analysis
  TextEditingController get _urlController => _urlControllers.first;
  FocusNode get _focusNode => _focusNodes.first;

  late AnimationController _pulseController;
  late AnimationController _orbController;
  late AnimationController _quizEntryController;
  late Animation<double> _orbScaleAnimation;
  late Animation<double> _orbOpacityAnimation;

  @override
  void initState() {
    super.initState();
    // Only reset if the previous state was idle (don't interrupt ongoing analysis)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final current = ref.read(linkQuizProvider);
      if (current.phase == LinkFlowPhase.idle) {
        ref.read(linkQuizProvider.notifier).reset();
      }
    });
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);

    _orbController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    )..repeat(reverse: true);

    _quizEntryController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );

    _orbScaleAnimation = Tween<double>(begin: 1.0, end: 1.2).animate(
      CurvedAnimation(parent: _orbController, curve: Curves.easeInOutSine),
    );
    _orbOpacityAnimation = Tween<double>(begin: 0.5, end: 0.8).animate(
      CurvedAnimation(parent: _orbController, curve: Curves.easeInOutSine),
    );

    _checkClipboard();
  }

  @override
  void dispose() {
    // Don't reset linkQuizProvider here — analysis may be running in background.
    // Provider state is managed by Riverpod lifecycle, not widget lifecycle.
    for (final c in _urlControllers) {
      c.dispose();
    }
    for (final f in _focusNodes) {
      f.dispose();
    }
    _pulseController.dispose();
    _orbController.dispose();
    _quizEntryController.dispose();
    super.dispose();
  }

  Future<void> _checkClipboard() async {
    // Clipboard detection disabled — users paste manually via the paste button
  }

  bool _isValidUrl(String text) {
    try {
      final uri = Uri.parse(text);
      return uri.scheme == 'http' || uri.scheme == 'https';
    } catch (_) {
      return false;
    }
  }

  void _resetLinkFields() {
    // Dispose extra controllers and reset to single empty field
    for (int i = _urlControllers.length - 1; i > 0; i--) {
      _urlControllers[i].dispose();
      _urlControllers.removeAt(i);
      _focusNodes[i].dispose();
      _focusNodes.removeAt(i);
    }
    _urlControllers.first.clear();
    // Reset multi-link state
    _multiLinkUrls = [];
    _multiLinkResults = [];
    _currentMultiLinkIndex = 0;
  }

  /// Continue to next product in multi-link flow
  Future<void> _continueToNextProduct() async {
    final quizState = ref.read(linkQuizProvider);
    if (quizState.enhancedResult != null) {
      _multiLinkResults.add(quizState.enhancedResult!);
    }
    _currentMultiLinkIndex++;

    if (_currentMultiLinkIndex >= _multiLinkUrls.length) {
      // All products analyzed — show comparison
      ref.read(linkQuizProvider.notifier).reset();
      if (mounted) setState(() {});
      return;
    }

    // Analyze next URL
    ref.read(linkQuizProvider.notifier).reset();
    final user = ref.read(userProfileProvider).valueOrNull;
    if (user == null) return;

    final nextUrl = _multiLinkUrls[_currentMultiLinkIndex];
    ref.read(behaviorTrackingProvider).trackLinkPaste(nextUrl, null);
    await ref.read(linkQuizProvider.notifier).analyzeAndStartQuiz(nextUrl, user);
    if (mounted) _quizEntryController.forward(from: 0.0);
  }

  Future<void> _startAnalysis(String url) async {
    // Collect all valid URLs from multi-link fields
    final validUrls = _urlControllers
        .map((c) => c.text.trim())
        .where((u) => u.isNotEmpty && _isValidUrl(u))
        .toList();

    if (validUrls.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(context.l10n?.pleaseEnterValidUrl ?? 'Please enter a valid product URL',
              style: GoogleFonts.plusJakartaSans(color: context.surfaceVariantColor)),
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppTheme.error,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      );
      return;
    }

    final userAsync = ref.read(userProfileProvider);
    final user = userAsync.valueOrNull ?? UserEntity(
      uid: 'anonymous',
      email: '',
      displayName: 'User',
      country: 'TR',
      language: Localizations.localeOf(context).languageCode,
      currency: 'TRY',
      priorities: const [],
      subscriptions: const [],
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );

    for (final fn in _focusNodes) {
      fn.unfocus();
    }

    // If multiple valid URLs → inline sequential analysis (same screen, no popup)
    if (validUrls.length > 1) {
      setState(() {
        _multiLinkUrls = validUrls;
        _multiLinkResults = [];
        _currentMultiLinkIndex = 0;
      });
      // Start analyzing first URL through normal flow
      ref.read(behaviorTrackingProvider).trackLinkPaste(validUrls.first, null);
      await ref.read(linkQuizProvider.notifier).analyzeAndStartQuiz(validUrls.first, user);
      if (mounted) _quizEntryController.forward(from: 0.0);
      return;
    }

    // Single link → normal analysis flow
    ref.read(behaviorTrackingProvider).trackLinkPaste(validUrls.first, null);
    await ref.read(linkQuizProvider.notifier).analyzeAndStartQuiz(validUrls.first, user);
    if (mounted) _quizEntryController.forward(from: 0.0);
  }

  @override
  Widget build(BuildContext context) {
    final quizState = ref.watch(linkQuizProvider);
    final isWorking = quizState.phase == LinkFlowPhase.analyzing ||
        quizState.phase == LinkFlowPhase.quizLoading ||
        quizState.phase == LinkFlowPhase.computing;

    // Show back button when in active flow OR multi-link comparison
    final showBack = quizState.phase != LinkFlowPhase.idle || _multiLinkComplete;

    return Scaffold(
      backgroundColor: context.backgroundColor,
      body: Stack(
        children: [
          _buildBackgroundOrbs(),
          CustomScrollView(
            slivers: [
              SliverAppBar(
                backgroundColor: context.backgroundColor,
                pinned: true,
                toolbarHeight: 56,
                leading: showBack
                    ? IconButton(
                        icon: Icon(Icons.arrow_back_rounded, color: context.textPrimary),
                        onPressed: () {
                          HapticFeedback.mediumImpact();
                          ref.read(linkQuizProvider.notifier).reset();
                          _resetLinkFields();
                          setState(() {});
                        },
                      )
                    : Padding(
                        padding: const EdgeInsets.only(left: 12),
                        child: Center(
                          child: Image.asset(
                            'assets/logo/compair_logo.png',
                            width: 32,
                            height: 32,
                          ),
                        ),
                      ),
                title: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Builder(builder: (context) {
                      final isDark = Theme.of(context).brightness == Brightness.dark;
                      final titleText = _multiLinkComplete
                          ? 'Comparison'
                          : _isMultiLinkFlow && quizState.phase != LinkFlowPhase.idle
                              ? 'Product ${_currentMultiLinkIndex + 1}/${_multiLinkUrls.length}'
                              : _getTitle(quizState.phase);
                      if (isDark) {
                        return ShaderMask(
                          shaderCallback: (bounds) => const LinearGradient(
                            colors: [Color(0xFF6366F1), Color(0xFFEC4899), Color(0xFF06B6D4)],
                          ).createShader(bounds),
                          child: Text(titleText,
                            style: GoogleFonts.inter(
                              fontWeight: FontWeight.w800, fontSize: 17,
                              color: Colors.white, letterSpacing: -0.5),
                          ),
                        );
                      }
                      return Text(titleText,
                        style: GoogleFonts.inter(
                          fontWeight: FontWeight.w800, fontSize: 17,
                          color: const Color(0xFF6366F1), letterSpacing: -0.5),
                      );
                    }),
                    Text(context.l10n?.aiPoweredProductAnalysis ?? 'AI-powered product analysis',
                      style: GoogleFonts.inter(
                        fontSize: 11, fontWeight: FontWeight.w500,
                        color: context.textTertiaryColor),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  ],
                ),
                actions: [
                  if (showBack)
                    _buildAppBarAction(
                      icon: Icons.refresh_rounded,
                      onPressed: () {
                        HapticFeedback.mediumImpact();
                        ref.read(linkQuizProvider.notifier).reset();
                        _resetLinkFields();
                        setState(() {});
                      },
                      tooltip: context.l10n?.startOver ?? 'Start over',
                    ),
                  const SizedBox(width: 8),
                ],
              ),
              SliverPadding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    // Multi-link complete → show comparison view
                    if (_multiLinkComplete) ...[
                      _buildMultiLinkComparison(),
                    ]
                    // Normal flow (single or in-progress multi-link)
                    else ...[
                      // Multi-link progress indicator
                      if (_isMultiLinkFlow && quizState.phase != LinkFlowPhase.idle)
                        _buildMultiLinkProgress(),

                      // Phase progress timeline (non-idle)
                      if (quizState.phase != LinkFlowPhase.idle &&
                          quizState.phase != LinkFlowPhase.quiz &&
                          quizState.phase != LinkFlowPhase.result)
                        _buildPhaseTimeline(quizState.phase),

                      // Progress steps indicator (compact)
                      if (quizState.phase != LinkFlowPhase.idle)
                        _buildProgressSteps(quizState.phase),

                      if (quizState.phase == LinkFlowPhase.idle) ...[
                        _buildInputCard(isWorking),
                        const SizedBox(height: 24),
                        if (quizState.error != null) ...[
                          _buildError(quizState.error!),
                          const SizedBox(height: 16),
                        ],
                        _buildInfoCards(),
                      ],
                      if (quizState.phase == LinkFlowPhase.quiz &&
                          quizState.quiz != null &&
                          quizState.baseResult != null)
                        _QuizView(
                          quiz: quizState.quiz!,
                          answeredQuestions: quizState.answeredQuestions,
                          currentIndex: quizState.currentQuestionIndex,
                          baseResult: quizState.baseResult!,
                          onAnswer: (idx, answer) {
                            ref
                                .read(linkQuizProvider.notifier)
                                .answerQuestion(idx, answer);
                          },
                          onSubmit: () async {
                            final user =
                                ref.read(userProfileProvider).valueOrNull;
                            if (user != null) {
                              await ref
                                  .read(linkQuizProvider.notifier)
                                  .submitQuiz(user);
                            }
                          },
                          onSkip: () {
                            ref.read(linkQuizProvider.notifier).skipQuiz();
                          },
                        ),
                      if (quizState.phase == LinkFlowPhase.result &&
                          quizState.enhancedResult != null) ...[
                        _EnhancedResultView(result: quizState.enhancedResult!),
                        // "Next Product" button in multi-link mode
                        if (_isMultiLinkFlow &&
                            _currentMultiLinkIndex < _multiLinkUrls.length - 1)
                          Padding(
                            padding: const EdgeInsets.only(top: 16),
                            child: GestureDetector(
                              onTap: _continueToNextProduct,
                              child: Container(
                                height: 52,
                                decoration: BoxDecoration(
                                  gradient: const LinearGradient(
                                    colors: [Color(0xFF06B6D4), Color(0xFF6366F1)],
                                  ),
                                  borderRadius: BorderRadius.circular(18),
                                  boxShadow: [
                                    BoxShadow(
                                      color: const Color(0xFF06B6D4).withValues(alpha: 0.3),
                                      blurRadius: 16, offset: const Offset(0, 6)),
                                  ],
                                ),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(Icons.navigate_next_rounded,
                                        color: Colors.white, size: 22),
                                    const SizedBox(width: 8),
                                    Text(
                                      'Next Product (${_currentMultiLinkIndex + 2}/${_multiLinkUrls.length})',
                                      style: GoogleFonts.inter(
                                        fontWeight: FontWeight.w700, fontSize: 15,
                                        color: Colors.white, letterSpacing: -0.3),
                                    ),
                                  ],
                                ),
                              ),
                            ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.05),
                          ),
                        // "Show Comparison" button when on last product result
                        if (_isMultiLinkFlow &&
                            _currentMultiLinkIndex >= _multiLinkUrls.length - 1)
                          Padding(
                            padding: const EdgeInsets.only(top: 16),
                            child: GestureDetector(
                              onTap: () {
                                // Save last result and show comparison
                                final lastResult = ref.read(linkQuizProvider).enhancedResult;
                                if (lastResult != null) {
                                  _multiLinkResults.add(lastResult);
                                }
                                ref.read(linkQuizProvider.notifier).reset();
                                setState(() {});
                              },
                              child: Container(
                                height: 52,
                                decoration: BoxDecoration(
                                  gradient: const LinearGradient(
                                    colors: [Color(0xFF6366F1), Color(0xFFEC4899)],
                                  ),
                                  borderRadius: BorderRadius.circular(18),
                                  boxShadow: [
                                    BoxShadow(
                                      color: const Color(0xFF6366F1).withValues(alpha: 0.3),
                                      blurRadius: 16, offset: const Offset(0, 6)),
                                  ],
                                ),
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(Icons.compare_arrows_rounded,
                                        color: Colors.white, size: 22),
                                    const SizedBox(width: 8),
                                    Text(
                                      'Show Comparison',
                                      style: GoogleFonts.inter(
                                        fontWeight: FontWeight.w700, fontSize: 15,
                                        color: Colors.white, letterSpacing: -0.3),
                                    ),
                                  ],
                                ),
                              ),
                            ).animate().fadeIn(delay: 200.ms, duration: 400.ms).slideY(begin: 0.05),
                          ),
                      ],
                    ],
                    SizedBox(
                        height: AppTheme.navBarTotalClearance +
                            MediaQuery.of(context).padding.bottom + 60),
                  ]),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildAppBarAction({
    required IconData icon,
    required VoidCallback onPressed,
    required String tooltip,
  }) {
    return Container(
      margin: const EdgeInsets.only(right: 4),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.white.withValues(alpha: 0.06),
            blurRadius: 8,
          ),
        ],
      ),
      child: IconButton(
        icon: Icon(icon, color: AppTheme.slate500, size: 20),
        onPressed: onPressed,
        tooltip: tooltip,
        splashRadius: 20,
      ),
    );
  }

  Widget _buildPhaseTimeline(LinkFlowPhase phase) {
    final steps = [
      _PhaseStep(
        label: context.l10n?.validatingUrl ?? 'Validating URL...',
        icon: Icons.link_rounded,
        isDone: phase.index >= LinkFlowPhase.analyzing.index,
        isActive: phase == LinkFlowPhase.analyzing,
      ),
      _PhaseStep(
        label: context.l10n?.identifyingProduct ?? 'Identifying product...',
        icon: Icons.shopping_bag_outlined,
        isDone: phase.index >= LinkFlowPhase.quizLoading.index,
        isActive: phase == LinkFlowPhase.analyzing,
      ),
      _PhaseStep(
        label: context.l10n?.analyzingSpecs ?? 'Analyzing specifications...',
        icon: Icons.analytics_outlined,
        isDone: phase.index >= LinkFlowPhase.quizLoading.index,
        isActive: phase == LinkFlowPhase.quizLoading,
      ),
      _PhaseStep(
        label: context.l10n?.generatingQuiz ?? 'Generating quiz...',
        icon: Icons.quiz_outlined,
        isDone: phase.index >= LinkFlowPhase.quiz.index,
        isActive: phase == LinkFlowPhase.quizLoading,
      ),
      _PhaseStep(
        label: context.l10n?.computingMatch ?? 'Computing match...',
        icon: Icons.psychology_outlined,
        isDone: phase.index >= LinkFlowPhase.result.index,
        isActive: phase == LinkFlowPhase.computing,
      ),
    ];

    final doneCount = steps.where((s) => s.isDone).length;
    final percent = ((doneCount / steps.length) * 100).toInt();
    final estimates = {
      LinkFlowPhase.analyzing: '~8s remaining',
      LinkFlowPhase.quizLoading: '~4s remaining',
      LinkFlowPhase.computing: '~3s remaining',
    };

    return GlassContainer(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [AppTheme.primaryBlue, AppTheme.neonPurple],
                  ),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(Icons.auto_awesome,
                    color: context.surfaceVariantColor, size: 16),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                    context.l10n?.analysisProgress ?? 'Analysis Progress',
                    style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                        color: context.textPrimary)),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [AppTheme.primaryBlue, AppTheme.neonPurple],
                  ),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text('$percent%',
                    style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w800,
                        fontSize: 12,
                        color: Colors.white)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          // Estimated time
          if (estimates.containsKey(phase))
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(estimates[phase]!,
                  style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      color: context.textTertiaryColor,
                      fontWeight: FontWeight.w500)),
            ),
          // Progress bar
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: doneCount / steps.length,
              backgroundColor: AppTheme.slate700,
              color: AppTheme.primaryBlue,
              minHeight: 4,
            ),
          ),
          const SizedBox(height: 16),
          ...steps.asMap().entries.map((entry) {
            final i = entry.key;
            final step = entry.value;
            final isLast = i == steps.length - 1;
            return _buildTimelineStep(step, isLast, i);
          }),
        ],
      ),
    ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.03);
  }

  Widget _buildTimelineStep(_PhaseStep step, bool isLast, int index) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 32,
            child: Column(
              children: [
                step.isDone
                    ? AnimatedContainer(
                        duration: const Duration(milliseconds: 400),
                        width: 28,
                        height: 28,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: LinearGradient(colors: [
                            AppTheme.success,
                            AppTheme.scoreExcellent
                          ]),
                        ),
                        child: Center(
                          child: Icon(Icons.check_rounded,
                              size: 15,
                              color: context.surfaceVariantColor),
                        ),
                      )
                        .animate()
                        .scale(
                            begin: const Offset(0.5, 0.5),
                            end: const Offset(1, 1),
                            duration: 400.ms,
                            curve: Curves.elasticOut)
                    : step.isActive
                        ? AnimatedBuilder(
                            animation: _pulseController,
                            builder: (context, child) {
                              return Container(
                                width: 28,
                                height: 28,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  gradient: const LinearGradient(colors: [
                                    AppTheme.primaryBlue,
                                    AppTheme.neonPurple
                                  ]),
                                  boxShadow: [
                                    BoxShadow(
                                      color: AppTheme.primaryBlue.withValues(
                                          alpha:
                                              0.3 + _pulseController.value * 0.3),
                                      blurRadius:
                                          6 + _pulseController.value * 6,
                                      spreadRadius:
                                          _pulseController.value * 2,
                                    ),
                                  ],
                                ),
                                child: Center(
                                  child: SizedBox(
                                    width: 14,
                                    height: 14,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: context.surfaceVariantColor),
                                  ),
                                ),
                              );
                            },
                          )
                        : AnimatedContainer(
                            duration: const Duration(milliseconds: 400),
                            width: 28,
                            height: 28,
                            decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              color: AppTheme.slate700,
                            ),
                            child: Center(
                              child: Icon(step.icon,
                                  size: 13, color: AppTheme.slate400),
                            ),
                          ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      decoration: BoxDecoration(
                        color: step.isDone
                            ? AppTheme.success.withValues(alpha: 0.4)
                            : AppTheme.slate700,
                        borderRadius: BorderRadius.circular(1),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 16),
              child: Text(
                step.label,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 14,
                  fontWeight:
                      step.isActive ? FontWeight.w700 : FontWeight.w500,
                  color: step.isDone
                      ? AppTheme.success
                      : step.isActive
                          ? AppTheme.primaryBlue
                          : AppTheme.slate400,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProgressSteps(LinkFlowPhase phase) {
    const steps = ['Scan', 'Quiz', 'Analyze', 'Result'];
    final activeIndex = switch (phase) {
      LinkFlowPhase.analyzing => 0,
      LinkFlowPhase.quizLoading => 1,
      LinkFlowPhase.quiz => 1,
      LinkFlowPhase.computing => 2,
      LinkFlowPhase.result => 3,
      _ => -1,
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: GlassContainer(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        child: Row(
            children: List.generate(steps.length, (i) {
          final done = i < activeIndex;
          final active = i == activeIndex;
          return Expanded(
              child: Row(children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 400),
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: done
                    ? const LinearGradient(
                        colors: [AppTheme.success, AppTheme.scoreExcellent])
                    : active
                        ? AppTheme.primaryGradient
                        : null,
                color: (!done && !active) ? context.surfaceVariantColor : null,
                boxShadow: active
                    ? [
                        BoxShadow(
                          color:
                              AppTheme.primaryBlue.withValues(alpha: 0.3),
                          blurRadius: 8,
                          spreadRadius: 1,
                        )
                      ]
                    : null,
              ),
              child: Center(
                  child: done
                      ? Icon(Icons.check_rounded,
                          size: 13, color: context.surfaceVariantColor)
                      : Text('${i + 1}',
                          style: GoogleFonts.plusJakartaSans(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: active
                                  ? context.textPrimary
                                  : AppTheme.slate400))),
            ),
            const SizedBox(width: 4),
            Flexible(
              child: Text(steps[i],
                  style: GoogleFonts.plusJakartaSans(
                      fontSize: 10,
                      fontWeight:
                          active ? FontWeight.w700 : FontWeight.w500,
                      color: done
                          ? AppTheme.success
                          : active
                              ? AppTheme.primaryBlue
                              : AppTheme.slate400),
                  overflow: TextOverflow.ellipsis,
                  maxLines: 1),
            ),
            if (i < steps.length - 1)
              Expanded(
                  child: Container(
                height: 2,
                margin: const EdgeInsets.symmetric(horizontal: 4),
                decoration: BoxDecoration(
                  gradient: done
                      ? const LinearGradient(colors: [
                          AppTheme.success,
                          AppTheme.scoreExcellent
                        ])
                      : null,
                  color: done ? null : AppTheme.slate700,
                  borderRadius: BorderRadius.circular(1),
                ),
              )),
          ]));
        })),
      ),
    );
  }

  String _getTitle(LinkFlowPhase phase) {
    switch (phase) {
      case LinkFlowPhase.idle:
        return context.l10n?.aiLinkAnalysis ?? 'AI Link Analysis';
      case LinkFlowPhase.analyzing:
      case LinkFlowPhase.quizLoading:
        return context.l10n?.analyzing ?? 'Analyzing...';
      case LinkFlowPhase.quiz:
        return context.l10n?.quickQuiz ?? 'Quick Quiz';
      case LinkFlowPhase.computing:
        return context.l10n?.computing ?? 'Computing...';
      case LinkFlowPhase.result:
        return context.l10n?.yourMatch ?? 'Your Match';
    }
  }

  Widget _buildBackgroundOrbs() {
    return Stack(
      children: [
        Positioned(
          top: -100,
          right: -100,
          child: AnimatedBuilder(
            animation: _orbController,
            builder: (context, child) {
              return Transform.scale(
                scale: _orbScaleAnimation.value,
                child: Container(
                  width: 400,
                  height: 400,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(colors: [
                      AppTheme.primaryBlue.withValues(
                          alpha: _orbOpacityAnimation.value * 0.3),
                      AppTheme.primaryBlue.withValues(alpha: 0.0),
                    ]),
                  ),
                ),
              );
            },
          ),
        ),
        Positioned(
          bottom: 100,
          left: -50,
          child: Container(
            width: 300,
            height: 300,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(colors: [
                AppTheme.accentCyan.withValues(alpha: 0.15),
                AppTheme.accentCyan.withValues(alpha: 0.0),
              ]),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildInputCard(bool isWorking) {
    final validCount = _urlControllers
        .where((c) => c.text.trim().isNotEmpty && _isValidUrl(c.text.trim()))
        .length;

    return Column(
      children: [
        // All link input fields
        for (int i = 0; i < _urlControllers.length; i++) ...[
          _buildLinkField(i, isWorking),
          if (i < _urlControllers.length - 1) const SizedBox(height: 8),
        ],

        // Add link button (show when < 4 links and the last field has valid URL)
        if (_urlControllers.length < 4 &&
            _urlControllers.last.text.trim().isNotEmpty &&
            _isValidUrl(_urlControllers.last.text.trim()))
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: GestureDetector(
              onTap: () {
                setState(() {
                  _urlControllers.add(TextEditingController());
                  _focusNodes.add(FocusNode());
                });
                // Focus the new field
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  _focusNodes.last.requestFocus();
                });
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFF6366F1).withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: const Color(0xFF6366F1).withValues(alpha: 0.2),
                    style: BorderStyle.solid,
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.add_link_rounded,
                        color: Color(0xFF6366F1), size: 16),
                    const SizedBox(width: 8),
                    Text(
                      '+ Add link (${_urlControllers.length}/4)',
                      style: GoogleFonts.inter(
                        fontWeight: FontWeight.w600,
                        fontSize: 12,
                        color: const Color(0xFF6366F1),
                      ),
                    ),
                  ],
                ),
              ),
            ).animate().fadeIn(duration: 300.ms),
          ),
        const SizedBox(height: 12),

        // Clipboard detected banner (notification only, no duplicate analyze button)
        if (_detectedClipboardUrl != null) ...[
          GestureDetector(
            onTap: () {
              _urlController.text = _detectedClipboardUrl!;
              setState(() => _detectedClipboardUrl = null);
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [
                  const Color(0xFF6366F1).withValues(alpha: 0.08),
                  const Color(0xFFEC4899).withValues(alpha: 0.05),
                ]),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: const Color(0xFF6366F1).withValues(alpha: 0.2)),
              ),
              child: Row(children: [
                const Icon(Icons.content_paste_go_rounded,
                    color: Color(0xFF6366F1), size: 16),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(_detectedClipboardUrl!, maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.inter(fontSize: 12, color: context.textSecondary)),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: const Color(0xFF6366F1).withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8)),
                  child: Text(context.l10n?.pasteLink ?? 'Paste', style: GoogleFonts.inter(
                    fontWeight: FontWeight.w700, fontSize: 11, color: const Color(0xFF6366F1))),
                ),
                const SizedBox(width: 6),
                GestureDetector(
                  onTap: () => setState(() => _detectedClipboardUrl = null),
                  child: Icon(Icons.close_rounded, size: 14,
                      color: context.textTertiaryColor.withValues(alpha: 0.5)),
                ),
              ]),
            ),
          ).animate().fadeIn(duration: 300.ms),
          const SizedBox(height: 12),
        ],

        // Analyze button
        isWorking
            ? _buildPulsingButton()
            : Align(
                alignment: Alignment.center,
                child: GestureDetector(
                onTap: () => _startAnalysis(_urlController.text),
                child: Container(
                  height: 46,
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFF6366F1), Color(0xFF8B5CF6), Color(0xFFEC4899)],
                      begin: Alignment.centerLeft, end: Alignment.centerRight),
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF6366F1).withValues(alpha: 0.35),
                        blurRadius: 16, offset: const Offset(0, 6), spreadRadius: -4),
                    ],
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(validCount > 1
                          ? Icons.compare_arrows_rounded
                          : Icons.auto_awesome_rounded,
                          color: Colors.white, size: 18),
                      const SizedBox(width: 8),
                      Text(validCount > 1
                          ? '${context.l10n?.compare ?? 'Compare'} ($validCount)'
                          : context.l10n?.analyzeWithAi ?? 'Analyze with AI',
                          style: GoogleFonts.inter(
                              fontWeight: FontWeight.w700, fontSize: 14,
                              color: Colors.white, letterSpacing: -0.3)),
                    ],
                  ),
                ),
              ).animate(onPlay: (c) => c.repeat())
               .shimmer(duration: 3000.ms, color: Colors.white.withValues(alpha: 0.1)),
              ),
        const SizedBox(height: 8),

        // Store tags - minimal inline
        Wrap(
          spacing: 6, runSpacing: 6,
          alignment: WrapAlignment.center,
          children: [
            for (final store in ['Amazon', 'eBay', 'Best Buy', 'Trendyol', 'AliExpress', '100+'])
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: context.surfaceVariantColor.withValues(alpha: 0.6),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(store, style: GoogleFonts.inter(
                  fontSize: 10, fontWeight: FontWeight.w500,
                  color: context.textTertiaryColor.withValues(alpha: 0.7))),
              ),
          ],
        ),
      ],
    ).animate().fadeIn(duration: 500.ms).slideY(begin: 0.03);
  }

  Widget _buildLinkField(int index, bool isWorking) {
    final controller = _urlControllers[index];
    final focusNode = _focusNodes[index];
    final isFirst = index == 0;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: AnimatedBuilder(
        animation: _orbController,
        builder: (context, child) {
          return Container(
            padding: const EdgeInsets.all(2),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(26),
              gradient: SweepGradient(
                colors: isFirst
                    ? const [
                        Color(0xFF6366F1),
                        Color(0xFFEC4899),
                        Color(0xFF06B6D4),
                        Color(0xFF8B5CF6),
                        Color(0xFF6366F1),
                      ]
                    : const [
                        Color(0xFF6366F1),
                        Color(0xFF06B6D4),
                        Color(0xFF8B5CF6),
                        Color(0xFF6366F1),
                      ],
                transform:
                    GradientRotation(_orbController.value * 2 * pi),
              ),
            ),
            child: child,
          );
        },
        child: ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: Container(
            decoration: BoxDecoration(
              color: context.surfaceElevatedColor,
              borderRadius: BorderRadius.circular(24),
            ),
            child: TextField(
              controller: controller,
              focusNode: focusNode,
              style: GoogleFonts.inter(
                  color: context.textPrimary,
                  fontSize: 13,
                  fontWeight: FontWeight.w500),
              decoration: InputDecoration(
                hintText: isFirst
                    ? (context.l10n?.pasteProductUrl ?? 'Paste any product URL...')
                    : 'Link ${index + 1} — paste URL...',
                hintStyle: GoogleFonts.inter(
                    color: context.textTertiaryColor.withValues(alpha: 0.6),
                    fontWeight: FontWeight.w400,
                    fontSize: 13),
                prefixIcon: Padding(
                  padding: const EdgeInsets.only(left: 14, right: 8),
                  child: Icon(Icons.link_rounded,
                      color: const Color(0xFF6366F1).withValues(alpha: 0.7),
                      size: 18),
                ),
                prefixIconConstraints:
                    const BoxConstraints(minWidth: 0, minHeight: 0),
                suffixIcon: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (controller.text.isNotEmpty)
                      GestureDetector(
                        onTap: () {
                          controller.clear();
                          setState(() {});
                        },
                        child: Icon(Icons.close_rounded,
                            size: 15,
                            color: context.textTertiaryColor
                                .withValues(alpha: 0.5)),
                      ),
                    if (!isFirst)
                      GestureDetector(
                        onTap: () {
                          setState(() {
                            _urlControllers[index].dispose();
                            _urlControllers.removeAt(index);
                            _focusNodes[index].dispose();
                            _focusNodes.removeAt(index);
                          });
                        },
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 6),
                          child: Icon(Icons.remove_circle_outline_rounded,
                              size: 16,
                              color: AppTheme.error.withValues(alpha: 0.7)),
                        ),
                      ),
                    if (isFirst)
                      Container(
                        margin: const EdgeInsets.only(left: 4, right: 6),
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: const Color(0xFF6366F1).withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: GestureDetector(
                          onTap: () async {
                            final clipData =
                                await Clipboard.getData(Clipboard.kTextPlain);
                            if (clipData?.text != null) {
                              controller.text = clipData!.text!.trim();
                              setState(() {});
                            }
                          },
                          child: const Icon(Icons.content_paste_rounded,
                              color: Color(0xFF6366F1), size: 14),
                        ),
                      ),
                  ],
                ),
                border: InputBorder.none,
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 0, vertical: 12),
              ),
              keyboardType: TextInputType.url,
              onChanged: (_) => setState(() {}),
              onSubmitted: isFirst
                  ? (url) => _startAnalysis(url)
                  : null,
            ),
          ),
        ),
      ),
    );
  }

  Widget _storeChip(String name, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      margin: const EdgeInsets.only(right: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.15)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(name,
              style: GoogleFonts.plusJakartaSans(
                  fontSize: 11, fontWeight: FontWeight.w600, color: color)),
        ],
      ),
    );
  }

  Widget _buildPulsingButton() {
    return AnimatedBuilder(
      animation: _pulseController,
      builder: (context, child) {
        return Container(
          height: 56,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            gradient: LinearGradient(colors: [
              AppTheme.primaryBlue,
              Color.lerp(AppTheme.primaryBlue, AppTheme.premiumPurple,
                  _pulseController.value)!,
            ]),
            boxShadow: [
              BoxShadow(
                color: AppTheme.primaryBlue.withValues(alpha: 0.3),
                blurRadius: 12 + (_pulseController.value * 8),
                spreadRadius: _pulseController.value * 2,
              )
            ],
          ),
          child: Center(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                      strokeWidth: 2.5, color: context.surfaceVariantColor),
                ),
                const SizedBox(width: 12),
                Text(context.l10n?.aiIsAnalyzing ?? 'AI is analyzing...',
                    style: GoogleFonts.plusJakartaSans(
                        color: context.surfaceVariantColor,
                        fontWeight: FontWeight.w700,
                        fontSize: 16)),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildError(String error) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppTheme.error.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.error.withValues(alpha: 0.2)),
      ),
      child: Row(children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: AppTheme.error.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(10),
          ),
          child: const Icon(Icons.error_outline_rounded,
              color: AppTheme.error, size: 20),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Text(error,
              style: GoogleFonts.plusJakartaSans(
                  color: AppTheme.error,
                  fontSize: 14,
                  fontWeight: FontWeight.w500)),
        ),
      ]),
    ).animate().fadeIn(duration: 300.ms).shakeX(amount: 4, duration: 300.ms);
  }

  /// Multi-link progress indicator showing which product is being analyzed
  Widget _buildMultiLinkProgress() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: GlassContainer(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF6366F1), Color(0xFF06B6D4)],
                ),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.compare_arrows_rounded,
                  color: Colors.white, size: 18),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Comparing ${_multiLinkUrls.length} Products',
                    style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                        color: context.textPrimary),
                  ),
                  const SizedBox(height: 4),
                  // Progress dots
                  Row(
                    children: List.generate(_multiLinkUrls.length, (i) {
                      final isDone = i < _multiLinkResults.length;
                      final isCurrent = i == _currentMultiLinkIndex;
                      return Container(
                        width: isCurrent ? 24 : 8,
                        height: 8,
                        margin: const EdgeInsets.only(right: 4),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(4),
                          gradient: isDone || isCurrent
                              ? const LinearGradient(
                                  colors: [Color(0xFF6366F1), Color(0xFF06B6D4)])
                              : null,
                          color: !isDone && !isCurrent
                              ? context.textTertiaryColor.withValues(alpha: 0.3)
                              : null,
                        ),
                      );
                    }),
                  ),
                ],
              ),
            ),
            Text(
              '${_multiLinkResults.length + 1}/${_multiLinkUrls.length}',
              style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                  color: const Color(0xFF6366F1)),
            ),
          ],
        ),
      ),
    ).animate().fadeIn(duration: 300.ms);
  }

  /// Multi-link comparison view (shown after all products are analyzed)
  Widget _buildMultiLinkComparison() {
    final sorted = List<EnhancedAnalysisResult>.from(_multiLinkResults)
      ..sort((a, b) => b.enhancedScore.compareTo(a.enhancedScore));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Header
        Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFFFFD700), Color(0xFFFFA500)],
                  ),
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFFFFD700).withValues(alpha: 0.3),
                      blurRadius: 12, offset: const Offset(0, 4)),
                  ],
                ),
                child: const Icon(Icons.emoji_events_rounded,
                    color: Colors.white, size: 24),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Comparison Results',
                      style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w800,
                          fontSize: 18,
                          color: context.textPrimary),
                    ),
                    Text(
                      '${_multiLinkResults.length} products analyzed',
                      style: GoogleFonts.plusJakartaSans(
                          fontSize: 12,
                          color: context.textSecondary),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ).animate().fadeIn(duration: 400.ms),

        // Ranking cards
        GlassContainer(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFFFFD700), Color(0xFFFFA500)],
                      ),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(Icons.leaderboard_rounded,
                        color: context.surfaceVariantColor, size: 18),
                  ),
                  const SizedBox(width: 10),
                  Text(context.l10n?.aiRanking ?? 'AI Ranking',
                      style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                          color: context.textPrimary)),
                ],
              ),
              const SizedBox(height: 14),
              ...List.generate(sorted.length, (i) {
                final r = sorted[i];
                final title = r.baseResult.metadata.title ?? 'Product ${i + 1}';
                final medal = i == 0 ? '🥇' : (i == 1 ? '🥈' : (i == 2 ? '🥉' : ''));
                final scoreColor = r.enhancedScore >= 80
                    ? AppTheme.scoreExcellent
                    : (r.enhancedScore >= 60 ? AppTheme.scoreGood : AppTheme.scoreAverage);
                final isBest = i == 0;

                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: isBest
                        ? const Color(0xFFFFD700).withValues(alpha: 0.06)
                        : context.surfaceVariantColor,
                    borderRadius: BorderRadius.circular(14),
                    border: isBest
                        ? Border.all(color: const Color(0xFFFFD700).withValues(alpha: 0.3))
                        : null,
                  ),
                  child: Row(
                    children: [
                      Text(medal.isNotEmpty ? medal : '${i + 1}',
                          style: GoogleFonts.plusJakartaSans(fontSize: 20)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(title,
                                style: GoogleFonts.plusJakartaSans(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
                                    color: context.textPrimary),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis),
                            if (r.baseResult.metadata.price != null)
                              Text(r.baseResult.metadata.price!,
                                  style: GoogleFonts.plusJakartaSans(
                                      fontSize: 12,
                                      color: context.textSecondary)),
                            if (r.prosForUser.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Text('✅ ${r.prosForUser.first}',
                                    style: GoogleFonts.plusJakartaSans(
                                        fontSize: 11,
                                        color: AppTheme.success),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis),
                              ),
                            if (r.consForUser.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 2),
                                child: Text('⚠ ${r.consForUser.first}',
                                    style: GoogleFonts.plusJakartaSans(
                                        fontSize: 11,
                                        color: AppTheme.warning),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis),
                              ),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: scoreColor.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text('${r.enhancedScore.toStringAsFixed(0)}%',
                            style: GoogleFonts.plusJakartaSans(
                                fontWeight: FontWeight.w800,
                                fontSize: 14,
                                color: scoreColor)),
                      ),
                    ],
                  ),
                ).animate(delay: (i * 100).ms).fadeIn(duration: 300.ms).slideX(begin: 0.05);
              }),
            ],
          ),
        ).animate(delay: 200.ms).fadeIn(duration: 400.ms),

        const SizedBox(height: 16),

        // Best match verdict
        GlassContainer(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF6366F1), Color(0xFFEC4899)],
                      ),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.auto_awesome_rounded,
                        color: Colors.white, size: 18),
                  ),
                  const SizedBox(width: 8),
                  Text(context.l10n?.aiVerdict ?? 'AI Verdict',
                      style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                          color: context.textPrimary)),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                '${sorted.first.baseResult.metadata.title ?? "Product 1"} is your best match with a ${sorted.first.enhancedScore.toStringAsFixed(0)}% compatibility score.',
                style: GoogleFonts.plusJakartaSans(
                    fontSize: 14,
                    color: context.textPrimary,
                    height: 1.5),
              ),
              if (sorted.length > 1) ...[
                const SizedBox(height: 8),
                Text(
                  'Score difference: ${(sorted.first.enhancedScore - sorted.last.enhancedScore).toStringAsFixed(0)} points between best and worst match.',
                  style: GoogleFonts.plusJakartaSans(
                      fontSize: 13,
                      color: context.textSecondary,
                      height: 1.4),
                ),
              ],
            ],
          ),
        ).animate(delay: 400.ms).fadeIn(duration: 400.ms),

        const SizedBox(height: 16),

        // Individual product breakdowns
        ...List.generate(sorted.length, (i) {
          final r = sorted[i];
          final title = r.baseResult.metadata.title ?? 'Product ${i + 1}';
          final medal = i == 0 ? '🥇' : (i == 1 ? '🥈' : (i == 2 ? '🥉' : '#${i + 1}'));

          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: GlassContainer(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(medal, style: const TextStyle(fontSize: 18)),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(title,
                            style: GoogleFonts.plusJakartaSans(
                                fontWeight: FontWeight.w700,
                                fontSize: 14,
                                color: context.textPrimary),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  // Score breakdown bars from factors
                  ...r.factors.take(4).map((f) =>
                    _buildComparisonScoreBar(f.label, f.score, context),
                  ),
                  // Pros
                  if (r.prosForUser.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    ...r.prosForUser.take(2).map((p) => Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('✅ ', style: TextStyle(fontSize: 11)),
                              Expanded(
                                child: Text(p,
                                    style: GoogleFonts.plusJakartaSans(
                                        fontSize: 12, color: context.textSecondary, height: 1.3),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis),
                              ),
                            ],
                          ),
                        )),
                  ],
                  // Cons
                  if (r.consForUser.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    ...r.consForUser.take(2).map((c) => Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('⚠ ', style: TextStyle(fontSize: 11)),
                              Expanded(
                                child: Text(c,
                                    style: GoogleFonts.plusJakartaSans(
                                        fontSize: 12, color: context.textSecondary, height: 1.3),
                                    maxLines: 2,
                                    overflow: TextOverflow.ellipsis),
                              ),
                            ],
                          ),
                        )),
                  ],
                ],
              ),
            ),
          ).animate(delay: (600 + i * 150).ms).fadeIn(duration: 300.ms).slideY(begin: 0.03);
        }),

        const SizedBox(height: 16),

        // Start over button
        GestureDetector(
          onTap: () {
            HapticFeedback.mediumImpact();
            ref.read(linkQuizProvider.notifier).reset();
            _resetLinkFields();
            setState(() {});
          },
          child: Container(
            height: 48,
            decoration: BoxDecoration(
              color: context.surfaceVariantColor,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: context.textTertiaryColor.withValues(alpha: 0.2)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.refresh_rounded,
                    color: context.textSecondary, size: 20),
                const SizedBox(width: 8),
                Text(
                  context.l10n?.startOver ?? 'Start Over',
                  style: GoogleFonts.inter(
                      fontWeight: FontWeight.w600, fontSize: 14,
                      color: context.textSecondary),
                ),
              ],
            ),
          ),
        ).animate(delay: 800.ms).fadeIn(duration: 300.ms),
      ],
    );
  }

  /// Score bar for comparison view
  Widget _buildComparisonScoreBar(String label, double score, BuildContext ctx) {
    final color = score >= 80
        ? AppTheme.scoreExcellent
        : (score >= 60 ? AppTheme.scoreGood : AppTheme.scoreAverage);
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          SizedBox(
            width: 72,
            child: Text(label,
                style: GoogleFonts.plusJakartaSans(
                    fontSize: 11,
                    color: ctx.textSecondary,
                    fontWeight: FontWeight.w500)),
          ),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: score / 100.0,
                minHeight: 6,
                backgroundColor: ctx.surfaceVariantColor,
                valueColor: AlwaysStoppedAnimation<Color>(color),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text('${score.toStringAsFixed(0)}',
              style: GoogleFonts.plusJakartaSans(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: color)),
        ],
      ),
    );
  }

  Widget _buildInfoCards() {
    return Column(
      children: [
        const SizedBox(height: 16),

        // Vertical flow steps with glassmorphic cards
        ...List.generate(3, (i) {
          final steps = [
            (Icons.link_rounded, context.l10n?.pasteLink ?? 'Paste Link', context.l10n?.dropProductUrl ?? 'Drop any product URL from 100+ stores', const Color(0xFF6366F1)),
            (Icons.psychology_rounded, context.l10n?.aiQuiz ?? 'AI Quiz', context.l10n?.answerQuickQuestions ?? 'Answer quick questions about your needs', const Color(0xFFEC4899)),
            (Icons.diamond_rounded, context.l10n?.matchScoreLabel ?? 'Match Score', context.l10n?.getPersonalizedScore ?? 'Get personalized compatibility score', const Color(0xFF06B6D4)),
          ];
          final (icon, title, desc, color) = steps[i];
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              children: [
                // Step number + vertical line
                Column(
                  children: [
                    Container(
                      width: 32, height: 32,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(colors: [color, color.withValues(alpha: 0.6)]),
                        shape: BoxShape.circle,
                        boxShadow: [BoxShadow(color: color.withValues(alpha: 0.3),
                          blurRadius: 12, offset: const Offset(0, 4))],
                      ),
                      child: Center(child: Text('${i + 1}',
                        style: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w800, color: Colors.white))),
                    ),
                    if (i < 2) Container(
                      width: 2, height: 20,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter, end: Alignment.bottomCenter,
                          colors: [color.withValues(alpha: 0.4), color.withValues(alpha: 0.05)]),
                      ),
                    ),
                  ],
                ),
                const SizedBox(width: 14),
                // Content
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.06),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: color.withValues(alpha: 0.12)),
                    ),
                    child: Row(
                      children: [
                        Icon(icon, size: 20, color: color),
                        const SizedBox(width: 12),
                        Expanded(child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(title, style: GoogleFonts.inter(
                              fontSize: 13, fontWeight: FontWeight.w700, color: context.textPrimary)),
                            const SizedBox(height: 2),
                            Text(desc, style: GoogleFonts.inter(
                              fontSize: 11, color: context.textTertiaryColor, height: 1.3)),
                          ],
                        )),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ).animate().fadeIn(delay: (100 * i).ms, duration: 400.ms).slideX(begin: 0.05);
        }),

        const SizedBox(height: 20),

        // AI Powers - horizontal scroll cards
        SizedBox(
          height: 120,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              _PowerCard(
                icon: Icons.memory_rounded, color: const Color(0xFF6366F1),
                title: context.l10n?.specAnalysis ?? 'Spec\nAnalysis', emoji: '🔬'),
              _PowerCard(
                icon: Icons.swap_horiz_rounded, color: const Color(0xFFEC4899),
                title: context.l10n?.smartAlternatives ?? 'Smart\nAlternatives', emoji: '🔄'),
              _PowerCard(
                icon: Icons.star_rounded, color: const Color(0xFFF59E0B),
                title: context.l10n?.reviewDigest ?? 'Review\nDigest', emoji: '⭐'),
              _PowerCard(
                icon: Icons.person_rounded, color: const Color(0xFF06B6D4),
                title: context.l10n?.personalMatch ?? 'Personal\nMatch', emoji: '🎯'),
              _PowerCard(
                icon: Icons.trending_up_rounded, color: const Color(0xFF10B981),
                title: context.l10n?.priceHistory ?? 'Price\nHistory', emoji: '📈'),
            ],
          ),
        ),

        const SizedBox(height: 16),
      ],
    );
  }

  Widget _storePill(String name, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.12)),
      ),
      child: Text(name,
          style: GoogleFonts.plusJakartaSans(
              fontSize: 11, fontWeight: FontWeight.w600, color: color)),
    );
  }

  Widget _moreStoresPill() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppTheme.slate700),
      ),
      child: Text(context.l10n?.plusMore('100') ?? '+ 100 more',
          style: GoogleFonts.plusJakartaSans(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: context.textTertiaryColor)),
    );
  }
}

class _PhaseStep {
  final String label;
  final IconData icon;
  final bool isDone;
  final bool isActive;

  const _PhaseStep({
    required this.label,
    required this.icon,
    required this.isDone,
    required this.isActive,
  });
}

// ---------------------------------------------------------------
// QUIZ VIEW
// ---------------------------------------------------------------

class _QuizView extends StatelessWidget {
  final ProductQuiz quiz;
  final List<QuizQuestion> answeredQuestions;
  final int currentIndex;
  final LinkAnalysisResult baseResult;
  final void Function(int, String) onAnswer;
  final VoidCallback onSubmit;
  final VoidCallback onSkip;

  const _QuizView({
    required this.quiz,
    required this.answeredQuestions,
    required this.currentIndex,
    required this.baseResult,
    required this.onAnswer,
    required this.onSubmit,
    required this.onSkip,
  });

  bool get _allAnswered =>
      answeredQuestions.every((q) => q.selectedOption != null);

  @override
  Widget build(BuildContext context) {
    final answeredCount =
        answeredQuestions.where((q) => q.selectedOption != null).length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Product mini-card
        GlassContainer(
          padding: const EdgeInsets.all(16),
          child: Row(children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: AppTheme.primaryBlue.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: baseResult.metadata.image != null
                  ? ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Image.network(baseResult.metadata.image!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => const Icon(
                              Icons.shopping_bag_rounded,
                              color: AppTheme.primaryBlue)),
                    )
                  : const Icon(Icons.shopping_bag_rounded,
                      color: AppTheme.primaryBlue),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(baseResult.metadata.title ?? 'Product',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                          color: context.textPrimary)),
                  if (baseResult.category != null)
                    Text(baseResult.category!,
                        style: GoogleFonts.plusJakartaSans(
                            fontSize: 12,
                            color: context.textTertiaryColor)),
                ],
              ),
            ),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppTheme.primaryBlue.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                  '${baseResult.aiScore.toStringAsFixed(0)}%',
                  style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                      color: AppTheme.primaryBlue)),
            ),
          ]),
        ),
        const SizedBox(height: 16),

        // Progress bar
        Row(children: [
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: answeredCount / answeredQuestions.length,
                backgroundColor: AppTheme.slate700,
                color: AppTheme.primaryBlue,
                minHeight: 6,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Text('$answeredCount/${answeredQuestions.length}',
              style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                  color: AppTheme.slate500)),
        ]),
        const SizedBox(height: 20),

        // Question cards
        ...answeredQuestions.asMap().entries.map((entry) {
          final idx = entry.key;
          final q = entry.value;
          final isActive = idx == currentIndex;
          final isAnswered = q.selectedOption != null;

          return AnimatedSize(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeInOut,
            child: idx <= currentIndex
                ? Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: _QuestionCard(
                      question: q,
                      index: idx,
                      isActive: isActive,
                      isAnswered: isAnswered,
                      onAnswer: (answer) => onAnswer(idx, answer),
                    ),
                  )
                : const SizedBox.shrink(),
          );
        }),

        const SizedBox(height: 16),
        if (_allAnswered)
          Align(
            alignment: Alignment.centerLeft,
            child: GradientButton(
              height: 44,
              borderRadius: BorderRadius.circular(12),
              gradient: const LinearGradient(
                colors: [AppTheme.premiumPurple, AppTheme.neonPurple],
              ),
              onPressed: onSubmit,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.insights_rounded,
                        color: context.surfaceVariantColor, size: 18),
                    const SizedBox(width: 8),
                    Text(context.l10n?.seeMyMatchScore ?? 'See My Match Score',
                        style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                            color: context.surfaceVariantColor)),
                  ],
                ),
              ),
            ),
          )
        else
          Center(
            child: TextButton.icon(
              onPressed: onSkip,
              icon: const Icon(Icons.skip_next_rounded,
                  color: AppTheme.slate500, size: 18),
              label: Text(context.l10n?.skipQuizShowBasic ?? 'Skip quiz & show basic result',
                  style: GoogleFonts.plusJakartaSans(
                      color: AppTheme.slate500, fontSize: 13)),
            ),
          ),
      ],
    );
  }
}

class _QuestionCard extends StatelessWidget {
  final QuizQuestion question;
  final int index;
  final bool isActive;
  final bool isAnswered;
  final void Function(String) onAnswer;

  const _QuestionCard({
    required this.question,
    required this.index,
    required this.isActive,
    required this.isAnswered,
    required this.onAnswer,
  });

  @override
  Widget build(BuildContext context) {
    return GlassContainer(
      padding: const EdgeInsets.all(20),
      usePrimaryTint: isActive,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: isAnswered
                    ? AppTheme.success
                    : AppTheme.primaryBlue.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Center(
                child: isAnswered
                    ? Icon(Icons.check, color: context.surfaceVariantColor, size: 16)
                    : Text('${index + 1}',
                        style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                            color: AppTheme.primaryBlue)),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(question.text,
                  style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w600,
                      fontSize: 15,
                      color: context.textPrimary)),
            ),
          ]),
          const SizedBox(height: 16),
          ...question.options.map((option) {
            final isSelected = question.selectedOption == option;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: () => onAnswer(option),
                  borderRadius: BorderRadius.circular(12),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 14),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? AppTheme.primaryBlue.withValues(alpha: 0.08)
                          : context.textPrimary.withValues(alpha: 0.6),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isSelected
                            ? AppTheme.primaryBlue
                            : AppTheme.slate700,
                        width: isSelected ? 2 : 1,
                      ),
                    ),
                    child: Row(children: [
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        width: 20,
                        height: 20,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: isSelected
                              ? AppTheme.primaryBlue
                              : Colors.transparent,
                          border: Border.all(
                            color: isSelected
                                ? AppTheme.primaryBlue
                                : AppTheme.slate400,
                            width: 2,
                          ),
                        ),
                        child: isSelected
                            ? Icon(Icons.check,
                                color: context.surfaceVariantColor, size: 14)
                            : null,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(option,
                            style: GoogleFonts.plusJakartaSans(
                                fontWeight: isSelected
                                    ? FontWeight.w600
                                    : FontWeight.w500,
                                fontSize: 14,
                                color: isSelected
                                    ? AppTheme.primaryBlue
                                    : context.textPrimary)),
                      ),
                    ]),
                  ),
                ),
              ),
            );
          }),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------
// ENHANCED RESULT VIEW
// ---------------------------------------------------------------

class _EnhancedResultView extends ConsumerStatefulWidget {
  final EnhancedAnalysisResult result;
  const _EnhancedResultView({required this.result});

  @override
  ConsumerState<_EnhancedResultView> createState() =>
      _EnhancedResultViewState();
}

class _EnhancedResultViewState extends ConsumerState<_EnhancedResultView>
    with TickerProviderStateMixin {
  bool _isSaved = false;
  bool _isSaving = false;
  late AnimationController _scoreRevealController;
  late Animation<double> _scoreAnimation;

  @override
  void initState() {
    super.initState();
    _scoreRevealController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    );
    _scoreAnimation = Tween<double>(
      begin: 0,
      end: widget.result.enhancedScore,
    ).animate(CurvedAnimation(
      parent: _scoreRevealController,
      curve: Curves.easeOutCubic,
    ));
    _scoreRevealController.forward();
    _searchDatabase();
  }

  @override
  void dispose() {
    _scoreRevealController.dispose();
    super.dispose();
  }

  Future<void> _searchDatabase() async {
    try {
      final homeFeed = await ref.read(homeFeedProvider.future);
      if (!mounted) return;
      ref.read(linkQuizProvider.notifier).searchDatabase(homeFeed.all);
    } catch (_) {}
  }

  double _calculateConfidence(EnhancedAnalysisResult result) {
    if (result.factors.isEmpty) return 0.65;
    final factorCount = result.factors.length;
    final avgScore = result.factors.map((f) => f.score).reduce((a, b) => a + b) /
        factorCount;
    final variance = result.factors
            .map((f) => (f.score - avgScore).abs())
            .reduce((a, b) => a + b) /
        factorCount;
    final consistency = 1.0 - (variance / 50.0).clamp(0.0, 1.0);
    return (0.65 + (factorCount / 20.0).clamp(0.0, 0.15) + consistency * 0.2)
        .clamp(0.0, 1.0);
  }

  Color _getScoreColor(double score) {
    if (score >= 80) return AppTheme.scoreExcellent;
    if (score >= 60) return AppTheme.scoreGood;
    if (score >= 40) return AppTheme.scoreAverage;
    return AppTheme.scorePoor;
  }

  String _getLabel(double score) {
    if (score >= 90) return context.l10n?.perfectMatch ?? 'Perfect Match! \u{1F3AF}';
    if (score >= 75) return context.l10n?.greatMatch ?? 'Great Match \u{1F44D}';
    if (score >= 60) return context.l10n?.goodMatch ?? 'Good Match';
    if (score >= 40) return context.l10n?.averageMatch ?? 'Average Match';
    return context.l10n?.notIdeal ?? 'Not Ideal';
  }

  Future<void> _handleSave() async {
    if (_isSaving || _isSaved) return;
    setState(() => _isSaving = true);

    final base = widget.result.baseResult;
    final saveResult = await saveLinkAnalysis(
      ref,
      url: base.url,
      productName: base.metadata.title ?? 'Product',
      score: widget.result.enhancedScore,
      analysis: widget.result.detailedVerdict,
      imageUrl: base.metadata.image,
      category: base.category,
    );

    if (!mounted) return;
    setState(() => _isSaving = false);

    saveResult.when(
      success: (_) {
        setState(() => _isSaved = true);
        HapticFeedback.mediumImpact();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                Icon(Icons.check_circle_rounded,
                    color: context.surfaceVariantColor, size: 18),
                const SizedBox(width: 10),
                Text(context.l10n?.analysisSaved ?? 'Analysis saved!',
                    style: GoogleFonts.plusJakartaSans(
                        color: context.surfaceVariantColor, fontWeight: FontWeight.w600)),
              ],
            ),
            behavior: SnackBarBehavior.floating,
            backgroundColor: AppTheme.success,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14)),
            margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          ),
        );
      },
      failure: (error) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(error.message,
                style: GoogleFonts.plusJakartaSans(color: context.surfaceVariantColor)),
            behavior: SnackBarBehavior.floating,
            backgroundColor: AppTheme.error,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14)),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final base = widget.result.baseResult;
    final result = widget.result;
    final score = result.enhancedScore;
    final title = base.metadata.title ?? 'Product';
    final imageUrl = base.metadata.image;
    final category = base.category ?? '';
    final price = base.metadata.price;
    final quizState = ref.watch(linkQuizProvider);
    final databaseMatch = quizState.databaseMatch;
    final similarProducts = quizState.similarProducts;
    final confidence = _calculateConfidence(result);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Hero card with product image
        GlassContainer(
          padding: EdgeInsets.zero,
          child: Column(children: [
            Stack(children: [
              // Image container — hidden when no image is available
              if (imageUrl != null && imageUrl.isNotEmpty)
                _LinkAnalysisImage(
                  imageUrl: imageUrl,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
                )
              else
                const SizedBox(height: 0, width: double.infinity),
              // Category badge
              if (category.isNotEmpty)
                Positioned(
                  top: 14,
                  left: 14,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(20),
                    child: BackdropFilter(
                      filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 7),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.5),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(category,
                            style: GoogleFonts.plusJakartaSans(
                                color: context.surfaceVariantColor,
                                fontSize: 12,
                                fontWeight: FontWeight.w600)),
                      ),
                    ),
                  ),
                ),
              // Animated score badge
              Positioned(
                top: 14,
                right: 14,
                child: AnimatedBuilder(
                  animation: _scoreAnimation,
                  builder: (context, _) {
                    final animScore = _scoreAnimation.value;
                    return Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        color: _getScoreColor(animScore),
                        borderRadius: BorderRadius.circular(24),
                        boxShadow: [
                          BoxShadow(
                            color:
                                _getScoreColor(animScore).withValues(alpha: 0.4),
                            blurRadius: 12,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.favorite_rounded,
                            size: 14, color: context.surfaceVariantColor),
                        const SizedBox(width: 5),
                        Text('${animScore.toStringAsFixed(0)}% Match',
                            style: GoogleFonts.plusJakartaSans(
                                color: context.surfaceVariantColor,
                                fontWeight: FontWeight.w800,
                                fontSize: 13)),
                      ]),
                    );
                  },
                ).animate().scale(
                    begin: const Offset(0.8, 0.8),
                    end: const Offset(1, 1),
                    duration: 400.ms,
                    curve: Curves.elasticOut),
              ),
            ]),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 20, 24, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: GoogleFonts.plusJakartaSans(
                          fontSize: 19,
                          fontWeight: FontWeight.w800,
                          color: context.textPrimary)),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Text(_getLabel(score),
                          style: GoogleFonts.plusJakartaSans(
                              fontSize: 15,
                              fontWeight: FontWeight.w600,
                              color: _getScoreColor(score))),
                      if (price != null && price.isNotEmpty) ...[
                        const Spacer(),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 5),
                          decoration: BoxDecoration(
                            color: AppTheme.success.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text(price,
                              style: GoogleFonts.plusJakartaSans(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w700,
                                  color: AppTheme.success)),
                        ),
                      ],
                    ],
                  ),
                  if (base.metadata.siteName != null) ...[
                    const SizedBox(height: 4),
                    Text(context.l10n?.fromSite(base.metadata.siteName ?? '') ?? 'from ${base.metadata.siteName}',
                        style: GoogleFonts.plusJakartaSans(
                            fontSize: 12,
                            color: context.textTertiaryColor)),
                  ],
                ],
              ),
            ),
          ]),
        ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.04),
        const SizedBox(height: 16),

        // Database match badge
        if (databaseMatch != null) ...[
          GlassContainer(
            padding: const EdgeInsets.all(16),
            usePrimaryTint: true,
            child: Row(children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [AppTheme.success, AppTheme.scoreExcellent],
                  ),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(Icons.verified_rounded,
                    size: 18, color: context.surfaceVariantColor),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(context.l10n?.foundInDatabase ?? 'Found in Compair Database',
                        style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
                            color: AppTheme.success)),
                    Text(databaseMatch.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.plusJakartaSans(
                            fontSize: 12,
                            color: context.textSecondary)),
                  ],
                ),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: AppTheme.primaryBlue.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  children: [
                    Text(context.l10n?.techScoreLabel ?? 'Tech Score',
                        style: GoogleFonts.plusJakartaSans(
                            fontSize: 9,
                            color: context.textTertiaryColor,
                            fontWeight: FontWeight.w500)),
                    Text('${databaseMatch.techScore.toStringAsFixed(0)}',
                        style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w800,
                            fontSize: 16,
                            color: AppTheme.primaryBlue)),
                  ],
                ),
              ),
            ]),
          ).animate().fadeIn(delay: 200.ms, duration: 400.ms).slideY(begin: 0.04),
          const SizedBox(height: 12),
        ],

        // AI Confidence indicator
        GlassContainer(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          child: Row(children: [
            Container(
              padding: const EdgeInsets.all(7),
              decoration: BoxDecoration(
                color: AppTheme.accentCyan.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.psychology_alt_rounded,
                  size: 16, color: AppTheme.accentCyan),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(context.l10n?.aiConfidence ?? 'AI Confidence',
                      style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                          color: context.textPrimary)),
                  const SizedBox(height: 6),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(3),
                    child: LinearProgressIndicator(
                      value: confidence,
                      backgroundColor: AppTheme.slate700,
                      color: confidence >= 0.8
                          ? AppTheme.success
                          : confidence >= 0.6
                              ? AppTheme.scoreAverage
                              : AppTheme.scorePoor,
                      minHeight: 5,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Text('${(confidence * 100).toStringAsFixed(0)}%',
                style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                    color: confidence >= 0.8
                        ? AppTheme.success
                        : confidence >= 0.6
                            ? AppTheme.scoreAverage
                            : AppTheme.scorePoor)),
          ]),
        ).animate().fadeIn(delay: 300.ms, duration: 400.ms),
        const SizedBox(height: 16),

        // Gauge
        _CompatibilityGauge(
          score: score,
          scoreAnimation: _scoreAnimation,
        ),
        const SizedBox(height: 16),

        // Factor breakdown
        if (result.factors.isNotEmpty) ...[
          GlassContainer(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: AppTheme.primaryBlue.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.bar_chart_rounded,
                          size: 18, color: AppTheme.primaryBlue),
                    ),
                    const SizedBox(width: 10),
                    Text(context.l10n?.compatibilityBreakdown ?? 'Compatibility Breakdown',
                        style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w700,
                            fontSize: 16,
                            color: context.textPrimary)),
                  ],
                ),
                const SizedBox(height: 18),
                ...result.factors.asMap().entries.map((entry) => Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: _FactorRow(factor: entry.value),
                    ).animate()
                        .fadeIn(
                            delay: (100 * entry.key).ms, duration: 300.ms)
                        .slideX(begin: 0.05)),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],

        // Pros & Cons
        if (result.prosForUser.isNotEmpty ||
            result.consForUser.isNotEmpty) ...[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (result.prosForUser.isNotEmpty)
                Expanded(
                    child: _ProConCard(
                        title: context.l10n?.prosForYou ?? 'Pros for You',
                        items: result.prosForUser,
                        icon: Icons.thumb_up_rounded,
                        color: AppTheme.success)),
              if (result.prosForUser.isNotEmpty &&
                  result.consForUser.isNotEmpty)
                const SizedBox(width: 12),
              if (result.consForUser.isNotEmpty)
                Expanded(
                    child: _ProConCard(
                        title: context.l10n?.consForYou ?? 'Cons for You',
                        items: result.consForUser,
                        icon: Icons.thumb_down_rounded,
                        color: AppTheme.error)),
            ],
          ),
          const SizedBox(height: 16),
        ],

        // AI Verdict
        if (result.detailedVerdict.isNotEmpty) ...[
          GlassContainer(
            padding: const EdgeInsets.all(22),
            usePrimaryTint: true,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [AppTheme.premiumPurple, AppTheme.neonPurple],
                      ),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(Icons.psychology_rounded,
                        size: 18, color: context.surfaceVariantColor),
                  ),
                  const SizedBox(width: 12),
                  Text(context.l10n?.aiVerdict ?? context.l10n?.aiVerdict ?? context.l10n?.aiVerdict ?? 'AI Verdict',
                      style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                          color: context.textPrimary)),
                ]),
                const SizedBox(height: 14),
                Text(result.detailedVerdict,
                    style: GoogleFonts.plusJakartaSans(
                        color: context.textSecondary,
                        fontSize: 14,
                        height: 1.7)),
              ],
            ),
          ).animate().fadeIn(duration: 400.ms),
          const SizedBox(height: 16),
        ],

        // Alternatives
        if (result.alternatives.isNotEmpty) ...[
          GlassContainer(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppTheme.accentCyan.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.swap_horiz_rounded,
                        color: AppTheme.accentCyan, size: 18),
                  ),
                  const SizedBox(width: 10),
                  Text(context.l10n?.betterAlternatives ?? 'Better Alternatives',
                      style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                          color: context.textPrimary)),
                ]),
                const SizedBox(height: 14),
                ...result.alternatives.map((alt) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Row(children: [
                        Container(
                          width: 6,
                          height: 6,
                          decoration: const BoxDecoration(
                              color: AppTheme.accentCyan,
                              shape: BoxShape.circle),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(alt,
                              style: GoogleFonts.plusJakartaSans(
                                  fontSize: 14,
                                  color: context.textSecondary,
                                  height: 1.4)),
                        ),
                      ]),
                    )),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],

        // Similar products from Compair database
        if (similarProducts.isNotEmpty) ...[
          GlassContainer(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppTheme.premiumPurple.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.inventory_2_rounded,
                        size: 18, color: AppTheme.premiumPurple),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(context.l10n?.similarInDatabase ?? 'Similar in Our Database',
                        style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w700,
                            fontSize: 15,
                            color: context.textPrimary)),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: AppTheme.premiumPurple.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text('${similarProducts.length}',
                        style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                            color: AppTheme.premiumPurple)),
                  ),
                ]),
                const SizedBox(height: 14),
                SizedBox(
                  height: 100,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: similarProducts.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 10),
                    itemBuilder: (context, index) {
                      final product = similarProducts[index];
                      return Container(
                        width: 160,
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color:
                              context.surfaceVariantColor.withValues(alpha: 0.5),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                              color: AppTheme.slate700.withValues(alpha: 0.5)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(children: [
                              if (product.imageURL.isNotEmpty)
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(6),
                                  child: Image.network(product.imageURL,
                                      width: 32,
                                      height: 32,
                                      fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) => Container(
                                            width: 32,
                                            height: 32,
                                            decoration: BoxDecoration(
                                              color: AppTheme.slate700,
                                              borderRadius:
                                                  BorderRadius.circular(6),
                                            ),
                                            child: const Icon(
                                                Icons.shopping_bag_rounded,
                                                size: 16,
                                                color: AppTheme.slate400),
                                          )),
                                )
                              else
                                Container(
                                  width: 32,
                                  height: 32,
                                  decoration: BoxDecoration(
                                    color: AppTheme.slate700,
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: const Icon(
                                      Icons.shopping_bag_rounded,
                                      size: 16,
                                      color: AppTheme.slate400),
                                ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                    product.techScore.toStringAsFixed(0),
                                    style: GoogleFonts.plusJakartaSans(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 18,
                                        color: AppTheme.primaryBlue)),
                              ),
                            ]),
                            const Spacer(),
                            Text(product.name,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: GoogleFonts.plusJakartaSans(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    color: context.textPrimary,
                                    height: 1.2)),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ).animate().fadeIn(delay: 400.ms, duration: 400.ms).slideY(begin: 0.04),
          const SizedBox(height: 16),
        ],

        // Action buttons
        Row(children: [
          Expanded(
            child: GradientButton(
              height: 54,
              gradient: LinearGradient(
                colors: _isSaved
                    ? [AppTheme.success, AppTheme.scoreExcellent]
                    : [AppTheme.primaryBlue, AppTheme.neonPurple],
              ),
              borderRadius: BorderRadius.circular(20),
              onPressed: _handleSave,
              child: _isSaving
                  ? SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                          strokeWidth: 2.5, color: context.surfaceVariantColor))
                  : Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                            _isSaved
                                ? Icons.bookmark_rounded
                                : Icons.bookmark_add_rounded,
                            color: context.surfaceVariantColor,
                            size: 20),
                        const SizedBox(width: 8),
                        Text(_isSaved ? (context.l10n?.saved ?? 'Saved') : (context.l10n?.save ?? 'Save'),
                            style: GoogleFonts.plusJakartaSans(
                                fontWeight: FontWeight.w700,
                                color: context.surfaceVariantColor,
                                fontSize: 16)),
                      ],
                    ),
            ),
          ),
        ]),
      ],
    );
  }

  Widget _buildImagePlaceholder() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.primaryBlue.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Icon(Icons.shopping_bag_outlined,
                size: 44, color: AppTheme.slate600),
          ),
          const SizedBox(height: 8),
          Text(context.l10n?.productImage ?? 'Product Image',
              style: GoogleFonts.plusJakartaSans(
                  fontSize: 12, color: AppTheme.slate400)),
        ],
      ),
    );
  }

}

// ---------------------------------------------------------------
// MULTI-LINK COMPARE SHEET
// ---------------------------------------------------------------

/// Image widget for link analysis results — hides itself if image fails to load.
class _LinkAnalysisImage extends StatefulWidget {
  final String imageUrl;
  final BorderRadius borderRadius;

  const _LinkAnalysisImage({required this.imageUrl, required this.borderRadius});

  @override
  State<_LinkAnalysisImage> createState() => _LinkAnalysisImageState();
}

class _LinkAnalysisImageState extends State<_LinkAnalysisImage> {
  bool _hidden = false;

  @override
  Widget build(BuildContext context) {
    if (_hidden) return const SizedBox.shrink();
    return ClipRRect(
      borderRadius: widget.borderRadius,
      child: Image.network(
        widget.imageUrl,
        height: 220,
        width: double.infinity,
        fit: BoxFit.contain,
        errorBuilder: (_, __, ___) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) setState(() => _hidden = true);
          });
          return const SizedBox.shrink();
        },
      ),
    );
  }
}

class _MultiCompareSheet extends ConsumerStatefulWidget {
  final List<String> allUrls;
  const _MultiCompareSheet({required this.allUrls});

  @override
  ConsumerState<_MultiCompareSheet> createState() => _MultiCompareSheetState();
}

class _MultiCompareSheetState extends ConsumerState<_MultiCompareSheet> {
  final List<EnhancedAnalysisResult?> _results = [];
  bool _isAnalyzing = false;
  int _analyzingIndex = -1;
  String? _aiComparison;
  bool _isComparing = false;
  String? _bestMatchUrl;
  String? _error;

  @override
  void initState() {
    super.initState();
    _results.addAll(List.filled(widget.allUrls.length, null));
    // Auto-start analysis
    WidgetsBinding.instance.addPostFrameCallback((_) => _analyzeAll());
  }

  @override
  void dispose() {
    super.dispose();
  }

  Future<void> _analyzeAll() async {
    if (widget.allUrls.isEmpty) return;

    if (mounted) {
      setState(() {
        _isAnalyzing = true;
        _error = null;
        _aiComparison = null;
        _bestMatchUrl = null;
      });
    }

    final user = ref.read(userProfileProvider).valueOrNull;
    if (user == null) {
      if (mounted) {
        setState(() {
          _isAnalyzing = false;
          _error = 'Please sign in first';
        });
      }
      return;
    }

    final analyzedResults = <EnhancedAnalysisResult>[];
    for (int i = 0; i < widget.allUrls.length; i++) {
      if (!mounted) break;
      final url = widget.allUrls[i];

      if (mounted) setState(() => _analyzingIndex = i);
      try {
        await ref.read(linkQuizProvider.notifier).analyzeAndStartQuiz(url, user);
        if (!mounted) break;
        ref.read(linkQuizProvider.notifier).skipQuiz();

        await Future.delayed(const Duration(milliseconds: 300));
        if (!mounted) break;
        final state = ref.read(linkQuizProvider);
        if (state.enhancedResult != null) {
          analyzedResults.add(state.enhancedResult!);
          if (i < _results.length) {
            _results[i] = state.enhancedResult;
          }
        }
        ref.read(linkQuizProvider.notifier).reset();
      } catch (e) {
        // Continue with others
      }
    }

    if (!mounted) return;

    setState(() {
      _analyzingIndex = -1;
      _isAnalyzing = false;
    });

    if (analyzedResults.length < 2) {
      if (mounted) setState(() => _error = 'Need at least 2 products to compare');
      return;
    }

    // Check categories
    final categories = analyzedResults
        .map((r) => r.baseResult.category?.toLowerCase().trim() ?? '')
        .where((c) => c.isNotEmpty)
        .toSet();

    // AI comparison
    if (mounted) setState(() => _isComparing = true);

    try {
      final comparison = _buildAiComparison(analyzedResults, categories);
      if (!mounted) return;
      
      // Find best match (highest enhanced score)
      EnhancedAnalysisResult best = analyzedResults.first;
      for (final r in analyzedResults) {
        if (r.enhancedScore > best.enhancedScore) best = r;
      }

      setState(() {
        _aiComparison = comparison;
        _bestMatchUrl = best.baseResult.url;
        _isComparing = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _isComparing = false;
          _error = 'AI comparison failed: ${e.toString().length > 80 ? e.toString().substring(0, 80) : e}';
        });
      }
    }
  }

  String _buildAiComparison(
      List<EnhancedAnalysisResult> results, Set<String> categories) {
    final isSameCategory = categories.length <= 1;
    final buf = StringBuffer();

    buf.writeln(isSameCategory
        ? '## Same-Category Comparison'
        : '## Cross-Category Comparison');
    buf.writeln('');

    // Rank by score
    final sorted = List<EnhancedAnalysisResult>.from(results)
      ..sort((a, b) => b.enhancedScore.compareTo(a.enhancedScore));

    for (int i = 0; i < sorted.length; i++) {
      final r = sorted[i];
      final title = r.baseResult.metadata.title ?? 'Product ${i + 1}';
      final medal = i == 0 ? '🥇' : (i == 1 ? '🥈' : (i == 2 ? '🥉' : ''));
      buf.writeln('$medal **#${i + 1} $title**');
      buf.writeln('Match Score: ${r.enhancedScore.toStringAsFixed(0)}%');
      if (r.baseResult.metadata.price != null) {
        buf.writeln('Price: ${r.baseResult.metadata.price}');
      }
      if (r.prosForUser.isNotEmpty) {
        buf.writeln('✅ ${r.prosForUser.first}');
      }
      if (r.consForUser.isNotEmpty) {
        buf.writeln('⚠️ ${r.consForUser.first}');
      }
      buf.writeln('');
    }

    buf.writeln('---');
    buf.writeln('**Best for you:** ${sorted.first.baseResult.metadata.title ?? "Product 1"}');
    buf.writeln('Based on your profile, preferences, and budget.');

    return buf.toString();
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (context, scrollController) => Container(
        decoration: BoxDecoration(
          color: context.backgroundColor,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        child: Column(
          children: [
            // Handle
            Center(
              child: Container(
                margin: const EdgeInsets.only(top: 12, bottom: 8),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppTheme.slate600,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            // Header
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [AppTheme.primaryBlue, AppTheme.neonPurple],
                      ),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(Icons.compare_arrows_rounded,
                        color: context.surfaceVariantColor, size: 22),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(context.l10n?.multiLinkCompare ?? 'Multi-Link Compare',
                            style: GoogleFonts.plusJakartaSans(
                                fontWeight: FontWeight.w800,
                                fontSize: 18,
                                color: context.textPrimary)),
                        Text(context.l10n?.addLinksToFindBest ?? 'Add links to find your best match',
                            style: GoogleFonts.plusJakartaSans(
                                fontSize: 13,
                                color: context.textSecondary)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: ListView(
                controller: scrollController,
                padding: const EdgeInsets.symmetric(horizontal: 20),
                children: [
                  // All product cards (analyzed or pending)
                  ...List.generate(widget.allUrls.length, (i) {
                    final result = i < _results.length ? _results[i] : null;
                    final url = widget.allUrls[i];
                    if (result != null) {
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _buildLockedProductCard(
                          result.baseResult.metadata.title ?? 'Product ${i + 1}',
                          result.enhancedScore,
                          url,
                        ),
                      );
                    }
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _buildPendingCard(i, url),
                    );
                  }),

                  // Error
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AppTheme.error.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.error_outline_rounded,
                                color: AppTheme.error, size: 18),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(_error!,
                                  style: GoogleFonts.plusJakartaSans(
                                      fontSize: 13, color: AppTheme.error)),
                            ),
                          ],
                        ),
                      ),
                    ),

                  // Progress/status indicator
                  if (_isAnalyzing || _isComparing)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(colors: [
                            AppTheme.primaryBlue.withValues(alpha: 0.08),
                            AppTheme.neonPurple.withValues(alpha: 0.05),
                          ]),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: AppTheme.primaryBlue.withValues(alpha: 0.15)),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            SizedBox(
                              width: 20, height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.5,
                                color: AppTheme.primaryBlue),
                            ),
                            const SizedBox(width: 12),
                            Text(
                              _isComparing
                                  ? (context.l10n?.aiComparing ?? 'AI comparing products...')
                                  : 'Analyzing product ${_analyzingIndex + 1}/${widget.allUrls.length}...',
                              style: GoogleFonts.plusJakartaSans(
                                fontWeight: FontWeight.w600,
                                fontSize: 14,
                                color: context.textPrimary),
                            ),
                          ],
                        ),
                      ),
                    ),

                  // AI Comparison Result
                  if (_aiComparison != null) _buildComparisonResult(),

                  const SizedBox(height: 40),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLockedProductCard(String name, double score, String url) {
    final scoreColor = score >= 80
        ? AppTheme.scoreExcellent
        : (score >= 60 ? AppTheme.scoreGood : AppTheme.scoreAverage);
    final isBest = _bestMatchUrl == url;

    return GlassContainer(
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: isBest
                    ? [const Color(0xFFFFD700), const Color(0xFFFFA500)]
                    : [AppTheme.primaryBlue.withValues(alpha: 0.15), AppTheme.primaryBlue.withValues(alpha: 0.05)],
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              isBest ? Icons.emoji_events_rounded : Icons.link_rounded,
              color: isBest ? context.textPrimary : AppTheme.primaryBlue,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (isBest)
                  Container(
                    margin: const EdgeInsets.only(bottom: 4),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFFFFD700), Color(0xFFFFA500)],
                      ),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(context.l10n?.bestMatch ?? 'Best Match',
                        style: GoogleFonts.plusJakartaSans(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: context.surfaceVariantColor)),
                  ),
                Text(
                  name,
                  style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                      color: context.textPrimary),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: scoreColor.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text('${score.toStringAsFixed(0)}%',
                style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                    color: scoreColor)),
          ),
        ],
      ),
    );
  }

  Widget _buildPendingCard(int index, String url) {
    final isCurrentlyAnalyzing = _isAnalyzing && _analyzingIndex == index;

    return GlassContainer(
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: isCurrentlyAnalyzing
                  ? AppTheme.primaryBlue.withValues(alpha: 0.1)
                  : context.surfaceVariantColor,
              borderRadius: BorderRadius.circular(10),
            ),
            child: isCurrentlyAnalyzing
                ? const SizedBox(
                    width: 18, height: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: AppTheme.primaryBlue),
                  )
                : Icon(Icons.link_rounded, size: 18, color: AppTheme.slate400),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isCurrentlyAnalyzing ? 'Analyzing...' : 'Waiting...',
                  style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w600, fontSize: 13,
                      color: context.textPrimary),
                ),
                Text(
                  Uri.tryParse(url)?.host ?? url,
                  style: GoogleFonts.plusJakartaSans(
                      fontSize: 11, color: context.textSecondary),
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildComparisonResult() {
    final allResults = _results.where((r) => r != null).cast<EnhancedAnalysisResult>().toList();

    // Sort by score
    final sorted = List<EnhancedAnalysisResult>.from(allResults)
      ..sort((a, b) => b.enhancedScore.compareTo(a.enhancedScore));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Ranking cards
        GlassContainer(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFFFFD700), Color(0xFFFFA500)],
                      ),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(Icons.emoji_events_rounded,
                        color: context.surfaceVariantColor, size: 18),
                  ),
                  const SizedBox(width: 10),
                  Text(context.l10n?.aiRanking ?? 'AI Ranking',
                      style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                          color: context.textPrimary)),
                ],
              ),
              const SizedBox(height: 14),
              ...List.generate(sorted.length, (i) {
                final r = sorted[i];
                final title = r.baseResult.metadata.title ?? 'Product ${i + 1}';
                final medal = i == 0 ? '🥇' : (i == 1 ? '🥈' : (i == 2 ? '🥉' : ''));
                final scoreColor = r.enhancedScore >= 80
                    ? AppTheme.scoreExcellent
                    : (r.enhancedScore >= 60 ? AppTheme.scoreGood : AppTheme.scoreAverage);
                final isBest = i == 0;

                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: isBest
                        ? const Color(0xFFFFD700).withValues(alpha: 0.06)
                        : context.surfaceVariantColor,
                    borderRadius: BorderRadius.circular(14),
                    border: isBest
                        ? Border.all(color: const Color(0xFFFFD700).withValues(alpha: 0.3))
                        : null,
                  ),
                  child: Row(
                    children: [
                      Text(medal.isNotEmpty ? medal : '${i + 1}',
                          style: GoogleFonts.plusJakartaSans(fontSize: 20)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(title,
                                style: GoogleFonts.plusJakartaSans(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13,
                                    color: context.textPrimary),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis),
                            if (r.baseResult.metadata.price != null)
                              Text(r.baseResult.metadata.price!,
                                  style: GoogleFonts.plusJakartaSans(
                                      fontSize: 12,
                                      color: context.textSecondary)),
                            if (r.prosForUser.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Text('✅ ${r.prosForUser.first}',
                                    style: GoogleFonts.plusJakartaSans(
                                        fontSize: 11,
                                        color: AppTheme.success),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis),
                              ),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: scoreColor.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text('${r.enhancedScore.toStringAsFixed(0)}%',
                            style: GoogleFonts.plusJakartaSans(
                                fontWeight: FontWeight.w800,
                                fontSize: 14,
                                color: scoreColor)),
                      ),
                    ],
                  ),
                );
              }),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // Best match verdict
        GlassContainer(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.auto_awesome_rounded,
                      color: AppTheme.primaryBlue, size: 20),
                  const SizedBox(width: 8),
                  Text(context.l10n?.aiVerdict ?? 'AI Verdict',
                      style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                          color: context.textPrimary)),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                '${sorted.first.baseResult.metadata.title ?? "Product 1"} is your best match with a ${sorted.first.enhancedScore.toStringAsFixed(0)}% compatibility score.',
                style: GoogleFonts.plusJakartaSans(
                    fontSize: 14,
                    color: context.textPrimary,
                    height: 1.5),
              ),
              if (sorted.length > 1) ...[
                const SizedBox(height: 8),
                Text(
                  'Score difference: ${(sorted.first.enhancedScore - sorted.last.enhancedScore).toStringAsFixed(0)} points between best and worst match.',
                  style: GoogleFonts.plusJakartaSans(
                      fontSize: 13,
                      color: context.textSecondary,
                      height: 1.4),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------
// SUPPORTING WIDGETS
// ---------------------------------------------------------------

class _FactorRow extends StatelessWidget {
  final CompatibilityFactor factor;
  const _FactorRow({required this.factor});

  Color _barColor(double score) {
    if (score >= 80) return AppTheme.scoreExcellent;
    if (score >= 60) return AppTheme.scoreGood;
    if (score >= 40) return AppTheme.scoreAverage;
    return AppTheme.scorePoor;
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Text(factor.emoji, style: const TextStyle(fontSize: 16)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(factor.label,
                style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                    color: context.textPrimary)),
          ),
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
            decoration: BoxDecoration(
              color: _barColor(factor.score).withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text('${factor.score.toStringAsFixed(0)}%',
                style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                    color: _barColor(factor.score))),
          ),
        ]),
        const SizedBox(height: 8),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: factor.score / 100,
            backgroundColor: AppTheme.slate700,
            color: _barColor(factor.score),
            minHeight: 6,
          ),
        ),
      ],
    );
  }
}

class _ProConCard extends StatelessWidget {
  final String title;
  final List<String> items;
  final IconData icon;
  final Color color;

  const _ProConCard({
    required this.title,
    required this.items,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return GlassContainer(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(icon, color: color, size: 18),
            const SizedBox(width: 6),
            Expanded(
              child: Text(title,
                  style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                      color: color)),
            ),
          ]),
          const SizedBox(height: 10),
          ...items.map((item) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(color == AppTheme.success ? '\u2705' : '\u26a0\ufe0f',
                        style: const TextStyle(fontSize: 12)),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(item,
                          style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              color: context.textSecondary,
                              height: 1.4)),
                    ),
                  ],
                ),
              )),
        ],
      ),
    );
  }
}

class _CompatibilityGauge extends StatelessWidget {
  final double score;
  final Animation<double>? scoreAnimation;
  const _CompatibilityGauge({required this.score, this.scoreAnimation});

  Color _getColor([double? s]) {
    final v = s ?? score;
    if (v >= 80) return AppTheme.scoreExcellent;
    if (v >= 60) return AppTheme.scoreGood;
    if (v >= 40) return AppTheme.scoreAverage;
    return AppTheme.scorePoor;
  }

  String _getLabel(BuildContext context, [double? s]) {
    final v = s ?? score;
    if (v >= 90) return context.l10n?.perfectMatch ?? 'Perfect Match! \u{1F3AF}';
    if (v >= 75) return context.l10n?.greatMatch ?? 'Great Match \u{1F44D}';
    if (v >= 60) return context.l10n?.goodMatch ?? 'Good Match';
    if (v >= 40) return context.l10n?.averageMatch ?? 'Average Match';
    return context.l10n?.lowMatch ?? 'Low Match';
  }

  @override
  Widget build(BuildContext context) {
    final gaugeWidget = scoreAnimation != null
        ? AnimatedBuilder(
            animation: scoreAnimation!,
            builder: (context, _) {
              final animScore = scoreAnimation!.value;
              return _buildGaugeContent(context, animScore);
            },
          )
        : _buildGaugeContent(context, score);

    return GlassContainer(
      padding: const EdgeInsets.all(24),
      child: gaugeWidget,
    );
  }

  Widget _buildGaugeContent(BuildContext context, double currentScore) {
    return Row(children: [
      SizedBox(
        width: 100,
        height: 100,
        child: CustomPaint(
          painter: _GaugePainter(score: currentScore, color: _getColor(currentScore)),
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('${currentScore.toStringAsFixed(0)}%',
                    style: GoogleFonts.plusJakartaSans(
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                        color: _getColor(currentScore))),
                Text('match',
                    style: GoogleFonts.plusJakartaSans(
                        fontSize: 10,
                        fontWeight: FontWeight.w500,
                        color: context.textTertiaryColor)),
              ],
            ),
          ),
        ),
      ),
      const SizedBox(width: 24),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(context.l10n?.yourCompatibility ?? 'Your Compatibility',
                style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                    color: context.textPrimary)),
            const SizedBox(height: 4),
            Text(_getLabel(context, currentScore),
                style: GoogleFonts.plusJakartaSans(
                    color: _getColor(currentScore),
                    fontWeight: FontWeight.w600,
                    fontSize: 15)),
            const SizedBox(height: 6),
            Text(context.l10n?.basedOnProfilePrefs ?? 'Based on your profile, quiz answers & preferences',
                style: GoogleFonts.plusJakartaSans(
                    color: context.textTertiaryColor, fontSize: 12)),
          ],
        ),
      ),
    ]);
  }
}

class _GaugePainter extends CustomPainter {
  final double score;
  final Color color;
  _GaugePainter({required this.score, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = min(size.width, size.height) / 2 - 5;

    // Background arc
    final bgPaint = Paint()
      ..color = AppTheme.slate700
      ..style = PaintingStyle.stroke
      ..strokeWidth = 10
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -pi * 0.75, pi * 1.5, false, bgPaint,
    );

    // Gradient score arc
    final sweepAngle = (score / 100) * pi * 1.5;
    final rect = Rect.fromCircle(center: center, radius: radius);
    final gradientColors = score >= 60
        ? [AppTheme.scoreGood, color]
        : [AppTheme.scorePoor, color];
    final scorePaint = Paint()
      ..shader = SweepGradient(
        startAngle: -pi * 0.75,
        endAngle: -pi * 0.75 + sweepAngle,
        colors: gradientColors,
      ).createShader(rect)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 10
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(rect, -pi * 0.75, sweepAngle, false, scorePaint);

    // Dot at end of arc
    if (score > 0) {
      final angle = -pi * 0.75 + sweepAngle;
      final dotX = center.dx + radius * cos(angle);
      final dotY = center.dy + radius * sin(angle);
      final dotPaint = Paint()
        ..color = Colors.white
        ..style = PaintingStyle.fill;
      canvas.drawCircle(Offset(dotX, dotY), 5, dotPaint);
      final dotGlow = Paint()
        ..color = color.withValues(alpha: 0.4)
        ..style = PaintingStyle.fill;
      canvas.drawCircle(Offset(dotX, dotY), 8, dotGlow);
    }
  }

  @override
  bool shouldRepaint(covariant _GaugePainter oldDelegate) =>
      oldDelegate.score != score || oldDelegate.color != color;
}

class _StepRow extends StatelessWidget {
  final String step;
  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;

  const _StepRow({
    required this.step,
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            gradient: LinearGradient(
                colors: [color, color.withValues(alpha: 0.7)]),
            borderRadius: BorderRadius.circular(10),
            boxShadow: [
              BoxShadow(
                color: color.withValues(alpha: 0.2),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Icon(icon, size: 18, color: context.surfaceVariantColor),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                      color: context.textPrimary)),
              Text(subtitle,
                  style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      color: context.textTertiaryColor,
                      fontWeight: FontWeight.w500)),
            ],
          ),
        ),
      ],
    );
  }
}

class _StepConnector extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 17),
      child: Container(
        width: 2,
        height: 20,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              AppTheme.primaryBlue.withValues(alpha: 0.3),
              AppTheme.primaryBlue.withValues(alpha: 0.08),
            ],
          ),
          borderRadius: BorderRadius.circular(1),
        ),
      ),
    );
  }
}

class _MiniFeatureCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;

  const _MiniFeatureCard({
    required this.icon,
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return GlassContainer(
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 10),
      child: Column(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, size: 20, color: color),
          ),
          const SizedBox(height: 8),
          Text(label,
              textAlign: TextAlign.center,
              style: GoogleFonts.plusJakartaSans(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: context.textSecondary,
                  height: 1.3)),
        ],
      ),
    );
  }
}

class _PowerCard extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String title;
  final String emoji;
  const _PowerCard({required this.icon, required this.color, required this.title, required this.emoji});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 100, height: 120,
      margin: const EdgeInsets.only(right: 10),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft, end: Alignment.bottomRight,
          colors: [color.withValues(alpha: 0.12), color.withValues(alpha: 0.04)]),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.15)),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(emoji, style: const TextStyle(fontSize: 24)),
          const SizedBox(height: 8),
          Text(title, textAlign: TextAlign.center,
            style: GoogleFonts.inter(
              fontSize: 11, fontWeight: FontWeight.w700,
              color: context.textPrimary, height: 1.2)),
        ],
      ),
    );
  }
}

class _CompactStep extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String title;
  final String step;
  const _CompactStep({required this.icon, required this.color, required this.title, required this.step});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 44, height: 44,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Stack(
            children: [
              Center(child: Icon(icon, size: 20, color: color)),
              Positioned(
                top: 2, right: 4,
                child: Container(
                  width: 14, height: 14,
                  decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                  child: Center(child: Text(step,
                    style: GoogleFonts.inter(
                      fontSize: 8, fontWeight: FontWeight.w800, color: Colors.white))),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 6),
        Text(title, textAlign: TextAlign.center,
          style: GoogleFonts.inter(
            fontSize: 11, fontWeight: FontWeight.w600, color: context.textSecondary)),
      ],
    );
  }
}

class _StepArrow extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Icon(Icons.arrow_forward_rounded, size: 16,
        color: const Color(0xFF6366F1).withValues(alpha: 0.4)),
    );
  }
}

class _FeatureTile extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;
  const _FeatureTile({required this.icon, required this.color, required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.12)),
      ),
      child: Row(
        children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [color, color.withValues(alpha: 0.6)]),
              borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, size: 18, color: Colors.white),
          ),
          const SizedBox(width: 10),
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: GoogleFonts.inter(
                fontSize: 12, fontWeight: FontWeight.w700, color: context.textPrimary)),
              Text(subtitle, style: GoogleFonts.inter(
                fontSize: 10, color: context.textTertiaryColor)),
            ],
          )),
        ],
      ),
    );
  }
}
