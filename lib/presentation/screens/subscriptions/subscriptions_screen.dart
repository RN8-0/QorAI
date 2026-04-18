/// Compair – Subscription Intelligence Screen
/// Modeled after AI Link Analysis — phase-based state machine with
/// AI quiz generation and grounded web analysis.
library;

import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';

import 'package:compair/core/theme.dart';
import 'package:compair/core/constants.dart';
import 'package:compair/domain/entities/ai_entities.dart';
import 'package:compair/presentation/providers/providers.dart';
import 'package:compair/presentation/widgets/glass_container.dart';
import 'package:compair/presentation/widgets/gradient_button.dart';
import 'package:compair/presentation/widgets/paywall_sheet.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:compair/presentation/screens/subscriptions/subscription_history_screen.dart';

// ─── Design tokens (mapped to global AppTheme brand palette) ─────────────────
const _kPrimary = AppTheme.brandBlue;
const _kSecondary = AppTheme.brandSkyBlue;
const _kAccent = AppTheme.brandCyan;
const _kDeep = AppTheme.brandDeepBlue;

// ─── Main Screen ─────────────────────────────────────────────────────────────

class SubscriptionsScreen extends ConsumerStatefulWidget {
  const SubscriptionsScreen({super.key});
  @override
  ConsumerState<SubscriptionsScreen> createState() =>
      _SubscriptionsScreenState();
}

class _SubscriptionsScreenState extends ConsumerState<SubscriptionsScreen>
    with TickerProviderStateMixin, AutomaticKeepAliveClientMixin {
  final TextEditingController _inputCtrl = TextEditingController();
  final FocusNode _inputFocus = FocusNode();
  final List<String> _chips = [];

  late AnimationController _pulseController;
  late AnimationController _orbController;
  late Animation<double> _orbScaleAnimation;
  late Animation<double> _orbOpacityAnimation;

  static const _suggestions = [
    'Netflix',
    'Spotify',
    'ChatGPT Plus',
    'Disney+',
    'Apple One',
    'YouTube Premium',
    'Xbox Game Pass',
    'iCloud+',
    'Adobe CC',
    'Claude Pro',
  ];

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);

    _orbController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    )..repeat(reverse: true);

    // Clear any stale error from previous session so the red banner does
    // not greet users before they even hit "Start Analysis".
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(subQuizProvider.notifier).clearError();
    });

    _orbScaleAnimation = Tween<double>(begin: 1.0, end: 1.2).animate(
      CurvedAnimation(parent: _orbController, curve: Curves.easeInOutSine),
    );
    _orbOpacityAnimation = Tween<double>(begin: 0.5, end: 0.8).animate(
      CurvedAnimation(parent: _orbController, curve: Curves.easeInOutSine),
    );
  }

  @override
  void dispose() {
    _inputCtrl.dispose();
    _inputFocus.dispose();
    _pulseController.dispose();
    _orbController.dispose();
    super.dispose();
  }

  void _addChip(String name) {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return;
    if (_chips.contains(trimmed)) return;
    setState(() {
      _chips.add(trimmed);
      _inputCtrl.clear();
    });
    ref.read(subQuizProvider.notifier).clearError();
  }

  void _removeChip(String name) {
    setState(() => _chips.remove(name));
    ref.read(subQuizProvider.notifier).clearError();
  }

  void _startAnalysis() {
    // Auto-add any text remaining in the input field before analyzing
    final pending = _inputCtrl.text.trim();
    if (pending.isNotEmpty && !_chips.contains(pending)) {
      setState(() {
        _chips.add(pending);
        _inputCtrl.clear();
      });
    }

    if (_chips.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            context.l10n?.pleaseEnterSubscriptionName ??
                'Please add at least one subscription',
            style: GoogleFonts.plusJakartaSans(
              color: context.surfaceVariantColor,
            ),
          ),
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppTheme.error,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      );
      return;
    }
    _inputFocus.unfocus();
    ref.read(subQuizProvider.notifier).startQuiz(List.from(_chips));
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final state = ref.watch(subQuizProvider);
    final isWorking =
        state.phase == SubFlowPhase.quizLoading ||
        state.phase == SubFlowPhase.analyzing;

    ref.listen<bool>(premiumProvider, (prev, next) {
      if (!mounted || prev == next || !next) return;
      final current = ref.read(subQuizProvider);
      if (current.error != null) {
        ref.read(subQuizProvider.notifier).reset();
      }
    });

    // Listen for errors
    ref.listen<SubQuizState>(subQuizProvider, (prev, next) {
      if (!mounted) return;
      if (next.error != null && next.error != prev?.error) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              next.error!,
              style: GoogleFonts.plusJakartaSans(
                color: context.surfaceVariantColor,
              ),
            ),
            behavior: SnackBarBehavior.floating,
            backgroundColor: AppTheme.error,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        );
      }
    });

    return Scaffold(
      backgroundColor: context.backgroundColor,
      body: Stack(
        children: [
          _buildBackgroundOrbs(),
          CustomScrollView(
            slivers: [
              _buildAppBar(state),
              SliverPadding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 10,
                ),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    // Phase timeline (during loading phases)
                    if (state.phase == SubFlowPhase.quizLoading ||
                        state.phase == SubFlowPhase.analyzing)
                      _buildPhaseTimeline(state.phase),

                    // Idle: input + suggestions
                    if (state.phase == SubFlowPhase.idle) ...[
                      const SizedBox(height: 12),
                      _buildInputCard(isWorking),
                      const SizedBox(height: 20),
                      if (state.error != null) ...[
                        _buildError(state.error!),
                        const SizedBox(height: 16),
                      ],
                      _buildInfoCards(),
                    ],

                    // Quiz phase
                    if (state.phase == SubFlowPhase.quiz && state.quiz != null)
                      _SubQuizView(
                        quiz: state.quiz!,
                        subscriptionNames: state.subscriptionNames,
                        answeredQuestions: state.answeredQuestions,
                        currentIndex: state.currentQuestionIndex,
                        onAnswer: (idx, answer) {
                          ref
                              .read(subQuizProvider.notifier)
                              .answerQuestion(idx, answer);
                        },
                        onSubmit: () async {
                          await ref.read(subQuizProvider.notifier).submitQuiz();
                        },
                        onSkip: () {
                          ref.read(subQuizProvider.notifier).skipQuiz();
                        },
                      ),

                    // Result phase
                    if (state.phase == SubFlowPhase.result)
                      _SubResultView(
                        analysisText: state.analysisResult ?? '',
                        scores: state.scores,
                        subscriptionNames: state.subscriptionNames,
                        structured: state.structured,
                        countryCode: ref.read(selectedCountryProvider),
                      ),

                    SizedBox(
                      height:
                          AppTheme.navBarTotalClearance +
                          MediaQuery.of(context).padding.bottom +
                          24,
                    ),
                  ]),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ── App Bar ────────────────────────────────────────────────────────────────

  SliverAppBar _buildAppBar(SubQuizState state) {
    return SliverAppBar(
      backgroundColor: context.backgroundColor,
      floating: false,
      pinned: true,
      toolbarHeight: 56,
      leading: state.phase != SubFlowPhase.idle
          ? IconButton(
              icon: Icon(Icons.arrow_back_rounded, color: context.textPrimary),
              onPressed: () {
                ref.read(subQuizProvider.notifier).reset();
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
      centerTitle: true,
      title: Builder(
        builder: (ctx) {
          final isDark = Theme.of(ctx).brightness == Brightness.dark;
          final title = _getTitle(state.phase);
          if (isDark) {
            return ShaderMask(
              shaderCallback: (bounds) => const LinearGradient(
                colors: [_kPrimary, _kSecondary, _kAccent],
              ).createShader(bounds),
              child: Text(
                title,
                style: GoogleFonts.inter(
                  fontWeight: FontWeight.w800,
                  fontSize: 18,
                  color: Colors.white,
                  letterSpacing: -0.5,
                ),
              ),
            );
          }
          return Text(
            title,
            style: GoogleFonts.inter(
              fontWeight: FontWeight.w800,
              fontSize: 18,
              color: _kPrimary,
              letterSpacing: -0.5,
            ),
          );
        },
      ),
      actions: [
        if (state.phase != SubFlowPhase.idle)
          _buildAppBarAction(
            icon: Icons.refresh_rounded,
            onPressed: () {
              HapticFeedback.mediumImpact();
              ref.read(subQuizProvider.notifier).reset();
              setState(() {});
            },
            tooltip: context.l10n?.startOver ?? 'Start over',
          ),
        if (state.phase == SubFlowPhase.idle)
          _buildAppBarAction(
            icon: Icons.history_rounded,
            onPressed: _showSubscriptionHistory,
            tooltip: 'Geçmiş',
          ),
        const SizedBox(width: 4),
      ],
    );
  }

  Widget _buildAppBarAction({
    required IconData icon,
    required VoidCallback onPressed,
    required String tooltip,
  }) {
    return Tooltip(
      message: tooltip,
      child: GestureDetector(
        onTap: onPressed,
        child: Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: context.surfaceElevatedColor,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Center(
            child: Icon(icon, size: 18, color: context.textPrimary),
          ),
        ),
      ),
    );
  }

  String _getTitle(SubFlowPhase phase) {
    switch (phase) {
      case SubFlowPhase.idle:
        return context.l10n?.subscriptionIntelligence ??
            'Subscription Intelligence';
      case SubFlowPhase.quizLoading:
        return context.l10n?.generatingQuiz ?? 'Generating quiz...';
      case SubFlowPhase.quiz:
        return context.l10n?.quickQuiz ?? 'Quick Quiz';
      case SubFlowPhase.analyzing:
        return context.l10n?.aiIsAnalyzing ?? 'AI Analyzing...';
      case SubFlowPhase.result:
        return context.l10n?.yourMatch ?? 'Your Match';
    }
  }

  // ── Background Orbs ────────────────────────────────────────────────────────

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
                    gradient: RadialGradient(
                      colors: [
                        _kPrimary.withValues(
                          alpha: _orbOpacityAnimation.value * 0.3,
                        ),
                        _kPrimary.withValues(alpha: 0.0),
                      ],
                    ),
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
              gradient: RadialGradient(
                colors: [
                  _kAccent.withValues(alpha: 0.15),
                  _kAccent.withValues(alpha: 0.0),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  // ── Phase Timeline ─────────────────────────────────────────────────────────

  Widget _buildPhaseTimeline(SubFlowPhase phase) {
    final steps = [
      _PhaseStep(
        label: context.l10n?.analyzingServices ?? 'Analyzing services...',
        icon: Icons.search_rounded,
        isDone: phase.index > SubFlowPhase.quizLoading.index,
        isActive: phase == SubFlowPhase.quizLoading,
      ),
      _PhaseStep(
        label: context.l10n?.generatingQuiz ?? 'Generating quiz...',
        icon: Icons.quiz_outlined,
        isDone: phase.index > SubFlowPhase.quizLoading.index,
        isActive: phase == SubFlowPhase.quizLoading,
      ),
      _PhaseStep(
        label: context.l10n?.searchingWebData ?? 'Searching web data...',
        icon: Icons.travel_explore_rounded,
        isDone: phase == SubFlowPhase.result,
        isActive: phase == SubFlowPhase.analyzing,
      ),
      _PhaseStep(
        label: context.l10n?.computingMatch ?? 'Computing match...',
        icon: Icons.psychology_outlined,
        isDone: phase == SubFlowPhase.result,
        isActive: phase == SubFlowPhase.analyzing,
      ),
    ];

    final doneCount = steps.where((s) => s.isDone).length;
    final percent = ((doneCount / steps.length) * 100).toInt();

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
                  gradient: const LinearGradient(colors: [_kPrimary, _kDeep]),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  Icons.auto_awesome,
                  color: context.surfaceVariantColor,
                  size: 16,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  context.l10n?.analysisProgress ?? 'Analysis Progress',
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                    color: context.textPrimary,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 4,
                ),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [_kPrimary, _kDeep]),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  '$percent%',
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: doneCount / steps.length,
              backgroundColor: AppTheme.slate700,
              color: _kPrimary,
              minHeight: 4,
            ),
          ),
          const SizedBox(height: 16),
          ...steps.asMap().entries.map((entry) {
            final i = entry.key;
            final step = entry.value;
            return _buildTimelineStep(step, i == steps.length - 1);
          }),
        ],
      ),
    ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.03);
  }

  Widget _buildTimelineStep(_PhaseStep step, bool isLast) {
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
                          gradient: LinearGradient(
                            colors: [AppTheme.success, AppTheme.scoreExcellent],
                          ),
                        ),
                        child: Center(
                          child: Icon(
                            Icons.check_rounded,
                            size: 15,
                            color: context.surfaceVariantColor,
                          ),
                        ),
                      ).animate().scale(
                        begin: const Offset(0.5, 0.5),
                        end: const Offset(1, 1),
                        duration: 400.ms,
                        curve: Curves.elasticOut,
                      )
                    : step.isActive
                    ? AnimatedBuilder(
                        animation: _pulseController,
                        builder: (context, child) {
                          return Container(
                            width: 28,
                            height: 28,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: const LinearGradient(
                                colors: [_kPrimary, _kDeep],
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: _kPrimary.withValues(
                                    alpha: 0.3 + _pulseController.value * 0.3,
                                  ),
                                  blurRadius: 6 + _pulseController.value * 6,
                                  spreadRadius: _pulseController.value * 2,
                                ),
                              ],
                            ),
                            child: Center(
                              child: SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: context.surfaceVariantColor,
                                ),
                              ),
                            ),
                          );
                        },
                      )
                    : Container(
                        width: 28,
                        height: 28,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppTheme.slate700,
                        ),
                        child: Center(
                          child: Icon(
                            step.icon,
                            size: 13,
                            color: AppTheme.slate400,
                          ),
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
                  fontWeight: step.isActive ? FontWeight.w700 : FontWeight.w500,
                  color: step.isDone
                      ? AppTheme.success
                      : step.isActive
                      ? _kPrimary
                      : AppTheme.slate400,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Progress Steps (compact bar) ───────────────────────────────────────────

  Widget _buildProgressSteps(SubFlowPhase phase) {
    final steps = [
      context.l10n?.typeLabel ?? 'Type',
      context.l10n?.quickQuiz ?? 'Quiz',
      context.l10n?.analyze ?? 'Analyze',
      context.l10n?.resultLabel ?? 'Result',
    ];
    final activeIndex = switch (phase) {
      SubFlowPhase.quizLoading => 0,
      SubFlowPhase.quiz => 1,
      SubFlowPhase.analyzing => 2,
      SubFlowPhase.result => 3,
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
              child: Row(
                children: [
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 400),
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: done
                          ? const LinearGradient(
                              colors: [
                                AppTheme.success,
                                AppTheme.scoreExcellent,
                              ],
                            )
                          : active
                          ? const LinearGradient(colors: [_kPrimary, _kDeep])
                          : null,
                      color: (!done && !active)
                          ? context.surfaceVariantColor
                          : null,
                      boxShadow: active
                          ? [
                              BoxShadow(
                                color: _kPrimary.withValues(alpha: 0.3),
                                blurRadius: 8,
                                spreadRadius: 1,
                              ),
                            ]
                          : null,
                    ),
                    child: Center(
                      child: done
                          ? Icon(
                              Icons.check_rounded,
                              size: 13,
                              color: context.surfaceVariantColor,
                            )
                          : Text(
                              '${i + 1}',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: active
                                    ? Colors.white
                                    : AppTheme.slate400,
                              ),
                            ),
                    ),
                  ),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text(
                      steps[i],
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 10,
                        fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                        color: done
                            ? AppTheme.success
                            : active
                            ? _kPrimary
                            : AppTheme.slate400,
                      ),
                      overflow: TextOverflow.ellipsis,
                      maxLines: 1,
                    ),
                  ),
                  if (i < steps.length - 1)
                    Expanded(
                      child: Container(
                        height: 2,
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        decoration: BoxDecoration(
                          gradient: done
                              ? const LinearGradient(
                                  colors: [
                                    AppTheme.success,
                                    AppTheme.scoreExcellent,
                                  ],
                                )
                              : null,
                          color: done ? null : AppTheme.slate700,
                          borderRadius: BorderRadius.circular(1),
                        ),
                      ),
                    ),
                ],
              ),
            );
          }),
        ),
      ),
    );
  }

  // ── Usage Badge ────────────────────────────────────────────────────────────

  Widget _buildUsageBadge() {
    final sub = ref.watch(subscriptionServiceProvider);
    if (sub.isPremium) return const SizedBox.shrink();

    final remaining = sub.remainingSubscriptionAnalyses;
    final total = AppConstants.freeSubscriptionAnalysisLimit;
    final remainingAi = sub.remainingAIQuestions;
    final totalAi = AppConstants.freeAiQuestionLimit;
    final progress = (total - remaining) / total;
    final progressAi = (totalAi - remainingAi) / totalAi;
    final isLow = remaining <= 1;
    final barColor = isLow ? AppTheme.error : _kAccent;
    final barColorAi = remainingAi <= 3 ? AppTheme.error : _kPrimary;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: context.surfaceElevatedColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isLow
              ? AppTheme.error.withValues(alpha: 0.3)
              : _kPrimary.withValues(alpha: 0.15),
        ),
      ),
      child: Column(
        children: [
          // Subscription analysis limit
          _UsageMeter(
            icon: Icons.analytics_outlined,
            label: 'Abonelik Analizi',
            remaining: remaining,
            total: total,
            period: '/ay',
            progress: progress,
            color: barColor,
          ),
          const SizedBox(height: 8),
          // AI question limit
          _UsageMeter(
            icon: Icons.auto_awesome,
            label: 'AI Sorusu',
            remaining: remainingAi,
            total: totalAi,
            period: '/gün',
            progress: progressAi,
            color: barColorAi,
          ),
          const SizedBox(height: 8),
          // Premium upsell
          GestureDetector(
            onTap: () => showPaywallSheet(context),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.auto_awesome, size: 13, color: _kAccent),
                const SizedBox(width: 4),
                Text(
                  'Premium ile sınırsız kullan',
                  style: GoogleFonts.inter(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: _kAccent,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 400.ms).slideY(begin: -0.1);
  }

  // ── Input Card ─────────────────────────────────────────────────────────────

  Widget _buildInputCard(bool isWorking) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Animated gradient border input
        AnimatedBuilder(
          animation: _orbController,
          builder: (context, child) {
            return Container(
              padding: const EdgeInsets.all(2),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(20),
                gradient: SweepGradient(
                  colors: const [
                    _kPrimary,
                    _kSecondary,
                    _kAccent,
                    _kDeep,
                    _kPrimary,
                  ],
                  transform: GradientRotation(_orbController.value * 2 * pi),
                ),
              ),
              child: child,
            );
          },
          child: Container(
            decoration: BoxDecoration(
              color: context.surfaceElevatedColor,
              borderRadius: BorderRadius.circular(18),
            ),
            child: Column(
              children: [
                // Chips row
                if (_chips.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(
                      left: 14,
                      right: 14,
                      top: 10,
                    ),
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: _chips.map((c) {
                        return Chip(
                          label: Text(
                            c,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: _kPrimary,
                            ),
                          ),
                          deleteIcon: const Icon(
                            Icons.close_rounded,
                            size: 16,
                            color: _kPrimary,
                          ),
                          onDeleted: () => _removeChip(c),
                          backgroundColor: _kPrimary.withValues(alpha: 0.08),
                          side: BorderSide(
                            color: _kPrimary.withValues(alpha: 0.3),
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10),
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                // Text field with isolated suffix rebuild
                ValueListenableBuilder<TextEditingValue>(
                  valueListenable: _inputCtrl,
                  builder: (context, value, _) {
                    return TextField(
                      controller: _inputCtrl,
                      focusNode: _inputFocus,
                      style: GoogleFonts.inter(
                        color: context.textPrimary,
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                      ),
                      decoration: InputDecoration(
                        hintText: _chips.isEmpty
                            ? (context.l10n?.subscriptionInputHint ??
                                  'Type a subscription (e.g. Netflix)')
                            : (context.l10n?.addAnotherSubscription ??
                                  'Add another…'),
                        hintStyle: GoogleFonts.inter(
                          color: context.textTertiaryColor.withValues(alpha: 0.6),
                          fontWeight: FontWeight.w400,
                          fontSize: 13,
                        ),
                        prefixIcon: Padding(
                          padding: const EdgeInsets.only(left: 14, right: 8),
                          child: Icon(
                            Icons.subscriptions_rounded,
                            color: _kPrimary.withValues(alpha: 0.7),
                            size: 18,
                          ),
                        ),
                        prefixIconConstraints: const BoxConstraints(
                          minWidth: 0,
                          minHeight: 0,
                        ),
                        suffixIcon: value.text.isNotEmpty
                            ? GestureDetector(
                                onTap: () => _addChip(_inputCtrl.text),
                                child: Container(
                                  margin: const EdgeInsets.only(right: 8),
                                  padding: const EdgeInsets.all(6),
                                  decoration: BoxDecoration(
                                    color: _kPrimary.withValues(alpha: 0.1),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: const Icon(
                                    Icons.add_rounded,
                                    color: _kPrimary,
                                    size: 16,
                                  ),
                                ),
                              )
                            : null,
                        border: InputBorder.none,
                        filled: false,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 0,
                          vertical: 12,
                        ),
                      ),
                  onSubmitted: (v) {
                    if (v.trim().isNotEmpty) _addChip(v);
                  },
                  textInputAction: TextInputAction.done,
                );
                  },
                ),
              ],
            ),
          ),
        ),

        const SizedBox(height: 14),

        // Suggestion chips
        SizedBox(
          height: 36,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: _suggestions.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (context, i) {
              final name = _suggestions[i];
              final isAdded = _chips.contains(name);
              return GestureDetector(
                onTap: isAdded ? null : () => _addChip(name),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: isAdded
                        ? _kPrimary.withValues(alpha: 0.15)
                        : context.surfaceElevatedColor,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: isAdded
                          ? _kPrimary
                          : context.textTertiaryColor.withValues(alpha: 0.2),
                    ),
                  ),
                  child: Text(
                    name,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      fontWeight: isAdded ? FontWeight.w700 : FontWeight.w500,
                      color: isAdded ? _kPrimary : context.textSecondary,
                    ),
                  ),
                ),
              );
            },
          ),
        ),

        const SizedBox(height: 16),

        // Analyze button
        isWorking
            ? _buildPulsingButton()
            : GestureDetector(
                onTap: _startAnalysis,
                child: Container(
                  width: double.infinity,
                  height: 56,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [_kPrimary, _kDeep, _kSecondary],
                    ),
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(
                        color: _kPrimary.withValues(alpha: 0.4),
                        blurRadius: 20,
                        offset: const Offset(0, 6),
                      ),
                    ],
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(
                        Icons.auto_awesome,
                        color: Colors.white,
                        size: 20,
                      ),
                      const SizedBox(width: 10),
                      Text(
                        context.l10n?.startAnalysis ?? 'Start Analysis',
                        style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
      ],
    );
  }

  Widget _buildPulsingButton() {
    return AnimatedBuilder(
      animation: _pulseController,
      builder: (context, _) {
        return Container(
          width: double.infinity,
          height: 56,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                _kPrimary.withValues(alpha: 0.6 + _pulseController.value * 0.4),
                _kDeep.withValues(alpha: 0.6 + _pulseController.value * 0.4),
              ],
            ),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: context.surfaceVariantColor,
                ),
              ),
              const SizedBox(width: 12),
              Text(
                context.l10n?.aiIsAnalyzing ?? 'AI is analyzing...',
                style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.w600,
                  fontSize: 15,
                  color: Colors.white.withValues(alpha: 0.9),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildError(String msg) {
    return GlassContainer(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          const Icon(
            Icons.error_outline_rounded,
            color: AppTheme.error,
            size: 20,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              msg,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 13,
                color: AppTheme.error,
              ),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms).shake(delay: 100.ms);
  }

  // ── Previous Comparisons (idle) ─────────────────────────────────────────

  // ═══════════════════════════════════════════════════════════
  // SUBSCRIPTION HISTORY — Görev 13
  // ═══════════════════════════════════════════════════════════

  void _showSubscriptionHistory() {
    Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute(builder: (_) => const SubscriptionHistoryScreen()),
    );
  }

  Widget _buildInfoCards() {
    final items = [
      _InfoItem(
        icon: Icons.travel_explore_rounded,
        gradient: const [_kPrimary, _kDeep],
        title: context.l10n?.webPoweredInsights ?? 'Web Destekli İçgörüler',
        subtitle:
            context.l10n?.webPoweredInsightsDesc ??
            'Gerçek zamanlı fiyatlar, Reddit ve forum yorumları, kullanıcı deneyimleri — AI web\'i tarayarak en güncel bilgileri toplar',
      ),
      _InfoItem(
        icon: Icons.quiz_outlined,
        gradient: const [_kSecondary, Color(0xFFF97316)],
        title: context.l10n?.personalizedQuiz ?? 'Kişiselleştirilmiş Quiz',
        subtitle:
            context.l10n?.personalizedQuizDesc ??
            'AI, kullanım alışkanlıklarınıza göre sorular oluşturur — cevaplarınız analizi kişiselleştirir',
      ),
      _InfoItem(
        icon: Icons.psychology_outlined,
        gradient: const [_kAccent, Color(0xFF10B981)],
        title: context.l10n?.smartCompatibility ?? 'Akıllı Uyumluluk',
        subtitle:
            context.l10n?.smartCompatibilityDesc ??
            'Profilinize ve cevaplarınıza göre eşleşme puanı — size en uygun aboneliği bulun',
      ),
    ];

    return Column(
      children: items.asMap().entries.map((entry) {
        final i = entry.key;
        final item = entry.value;
        return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: GlassContainer(
                padding: const EdgeInsets.all(16),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: item.gradient,
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(14),
                        boxShadow: [
                          BoxShadow(
                            color: item.gradient.first.withValues(alpha: 0.3),
                            blurRadius: 12,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Center(
                        child: Icon(item.icon, color: Colors.white, size: 24),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.title,
                            style: GoogleFonts.plusJakartaSans(
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                              color: context.textPrimary,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            item.subtitle,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              color: context.textTertiaryColor,
                              height: 1.4,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            )
            .animate(delay: (i * 120).ms)
            .fadeIn(duration: 500.ms)
            .slideY(begin: 0.08);
      }).toList(),
    );
  }
}

// ─── Phase Step Data ─────────────────────────────────────────────────────────

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

class _InfoItem {
  final IconData icon;
  final List<Color> gradient;
  final String title;
  final String subtitle;
  const _InfoItem({
    required this.icon,
    required this.gradient,
    required this.title,
    required this.subtitle,
  });
}

class _UsageMeter extends StatelessWidget {
  final IconData icon;
  final String label;
  final int remaining;
  final int total;
  final String period;
  final double progress;
  final Color color;

  const _UsageMeter({
    required this.icon,
    required this.label,
    required this.remaining,
    required this.total,
    required this.period,
    required this.progress,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    label,
                    style: GoogleFonts.inter(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: context.textPrimary,
                    ),
                  ),
                  Text(
                    '$remaining/$total$period',
                    style: GoogleFonts.inter(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: color,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: progress.clamp(0.0, 1.0),
                  minHeight: 4,
                  backgroundColor: color.withValues(alpha: 0.12),
                  valueColor: AlwaysStoppedAnimation<Color>(color),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ─── Sub Quiz View ───────────────────────────────────────────────────────────

class _SubQuizView extends StatelessWidget {
  final ProductQuiz quiz;
  final List<String> subscriptionNames;
  final List<QuizQuestion> answeredQuestions;
  final int currentIndex;
  final void Function(int, String) onAnswer;
  final VoidCallback onSubmit;
  final VoidCallback onSkip;

  const _SubQuizView({
    required this.quiz,
    required this.subscriptionNames,
    required this.answeredQuestions,
    required this.currentIndex,
    required this.onAnswer,
    required this.onSubmit,
    required this.onSkip,
  });

  bool get _allAnswered =>
      answeredQuestions.every((q) => q.selectedOption != null);

  @override
  Widget build(BuildContext context) {
    final answeredCount = answeredQuestions
        .where((q) => q.selectedOption != null)
        .length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Subscription names mini-card
        GlassContainer(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: _kPrimary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Center(
                  child: Image.asset(
                    'assets/logo/compair_logo.png',
                    width: 28,
                    height: 28,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      subscriptionNames.join(' vs '),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                        color: context.textPrimary,
                      ),
                    ),
                    Text(
                      context.l10n?.subscriptionIntelligence ??
                          'Subscription Intelligence',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        color: context.textTertiaryColor,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Progress bar
        Row(
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: answeredCount / answeredQuestions.length,
                  backgroundColor: AppTheme.slate700,
                  color: _kPrimary,
                  minHeight: 6,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Text(
              '$answeredCount/${answeredQuestions.length}',
              style: GoogleFonts.plusJakartaSans(
                fontWeight: FontWeight.w600,
                fontSize: 13,
                color: AppTheme.slate500,
              ),
            ),
          ],
        ),
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
                    child: _SubQuestionCard(
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
          UnconstrainedBox(
            alignment: Alignment.centerLeft,
            child: GradientButton(
              height: 38,
              borderRadius: BorderRadius.circular(10),
              gradient: const LinearGradient(colors: [_kPrimary, _kDeep]),
              onPressed: onSubmit,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.insights_rounded,
                      color: context.surfaceVariantColor,
                      size: 16,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      context.l10n?.seeMyMatchScore ?? 'See My Match Score',
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w700,
                        fontSize: 12,
                        color: context.surfaceVariantColor,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          )
        else
          Center(
            child: TextButton.icon(
              onPressed: onSkip,
              icon: const Icon(
                Icons.skip_next_rounded,
                color: AppTheme.slate500,
                size: 18,
              ),
              label: Text(
                context.l10n?.skipQuizShowBasic ??
                    'Skip quiz & show basic result',
                style: GoogleFonts.plusJakartaSans(
                  color: AppTheme.slate500,
                  fontSize: 13,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

// ── Question Card ────────────────────────────────────────────────────────────

class _SubQuestionCard extends StatelessWidget {
  final QuizQuestion question;
  final int index;
  final bool isActive;
  final bool isAnswered;
  final void Function(String) onAnswer;

  const _SubQuestionCard({
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
          Row(
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: isAnswered
                      ? AppTheme.success
                      : _kPrimary.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: Center(
                  child: isAnswered
                      ? Icon(
                          Icons.check,
                          color: context.surfaceVariantColor,
                          size: 16,
                        )
                      : Text(
                          '${index + 1}',
                          style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                            color: _kPrimary,
                          ),
                        ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  question.text,
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w600,
                    fontSize: 15,
                    color: context.textPrimary,
                  ),
                ),
              ),
            ],
          ),
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
                      horizontal: 16,
                      vertical: 14,
                    ),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? _kPrimary.withValues(alpha: 0.08)
                          : context.textPrimary.withValues(alpha: 0.03),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isSelected ? _kPrimary : AppTheme.slate700,
                        width: isSelected ? 2 : 1,
                      ),
                    ),
                    child: Row(
                      children: [
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          width: 20,
                          height: 20,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: isSelected ? _kPrimary : Colors.transparent,
                            border: Border.all(
                              color: isSelected ? _kPrimary : AppTheme.slate400,
                              width: 2,
                            ),
                          ),
                          child: isSelected
                              ? Icon(
                                  Icons.check,
                                  color: context.surfaceVariantColor,
                                  size: 14,
                                )
                              : null,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            option,
                            style: GoogleFonts.plusJakartaSans(
                              fontWeight: isSelected
                                  ? FontWeight.w600
                                  : FontWeight.w500,
                              fontSize: 14,
                              color: isSelected
                                  ? _kPrimary
                                  : context.textPrimary,
                            ),
                          ),
                        ),
                      ],
                    ),
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

// ─── Result View ─────────────────────────────────────────────────────────────

class _SubResultView extends StatelessWidget {
  final String analysisText;
  final Map<String, double> scores;
  final List<String> subscriptionNames;
  final Map<String, dynamic>? structured;
  final String countryCode;

  const _SubResultView({
    required this.analysisText,
    required this.scores,
    required this.subscriptionNames,
    this.structured,
    this.countryCode = 'US',
  });

  Color _scoreColor(double score) {
    if (score >= 80) return AppTheme.success;
    if (score >= 60) return const Color(0xFFF59E0B);
    if (score >= 40) return const Color(0xFFF97316);
    return AppTheme.error;
  }

  /// Format price — AI already returns prices in user's currency
  String _formatPrice(String rawPrice) {
    if (rawPrice.isEmpty) return rawPrice;
    return rawPrice;
  }

  bool _isTr(BuildContext context) =>
      Localizations.localeOf(context).languageCode.toLowerCase() == 'tr';

  String _txt(BuildContext context, {required String tr, required String en}) {
    return _isTr(context) ? tr : en;
  }

  String _factorLabel(BuildContext context, String key) {
    switch (key.trim().toLowerCase()) {
      case 'usage_fit':
        return _txt(context, tr: 'Kullanim Uyumu', en: 'Usage Fit');
      case 'value_match':
        return _txt(context, tr: 'Fiyat / Deger Uyumu', en: 'Value Match');
      case 'content_match':
        return _txt(context, tr: 'Icerik Uyumu', en: 'Content Match');
      case 'ecosystem_fit':
        return _txt(context, tr: 'Ekosistem Uyumu', en: 'Ecosystem Fit');
      case 'lifestyle_match':
        return _txt(context, tr: 'Yasam Tarzi Uyumu', en: 'Lifestyle Match');
      default:
        return key
            .replaceAll('_', ' ')
            .split(' ')
            .map(
              (word) => word.isNotEmpty
                  ? '${word[0].toUpperCase()}${word.substring(1)}'
                  : '',
            )
            .join(' ');
    }
  }

  /// Build readable text from structured data — NEVER show raw JSON.
  String _readableAnalysis(
    BuildContext context,
    String raw,
    Map<String, dynamic> subs,
    Map<String, dynamic> winner,
  ) {
    // If text looks like JSON, never show it raw
    if (raw.trim().startsWith('{') || raw.trim().startsWith('[')) {
      // Structured data available – generate readable summary from it
      if (subs.isNotEmpty) {
        final buf = StringBuffer();
        for (final entry in subs.entries) {
          final d = entry.value as Map<String, dynamic>? ?? {};
          buf.writeln('${entry.key} (${d['compatibility_score'] ?? '?'}%)');
          if (d['compatibility_explanation'] != null) {
            buf.writeln(d['compatibility_explanation']);
          }
          final pros = (d['pros'] as List?)?.cast<String>() ?? [];
          if (pros.isNotEmpty) buf.writeln('\n✅ ${pros.join('\n✅ ')}');
          final cons = (d['cons'] as List?)?.cast<String>() ?? [];
          if (cons.isNotEmpty) buf.writeln('\n❌ ${cons.join('\n❌ ')}');
          buf.writeln();
        }
        if (winner['recommendation'] != null) {
          buf.writeln(winner['recommendation']);
        }
        return buf.toString().trim();
      }
      // No structured data but text is JSON — try to extract readable fields
      try {
        var clean = raw.trim();
        if (clean.startsWith('```')) {
          clean = clean
              .replaceFirst(RegExp(r'^```\w*\n?'), '')
              .replaceFirst(RegExp(r'\n?```$'), '');
        }
        final parsed = jsonDecode(clean) as Map<String, dynamic>?;
        if (parsed != null) {
          return parsed['analysis'] as String? ??
              parsed['summary'] as String? ??
              parsed['recommendation'] as String? ??
              _txt(
                context,
                tr: 'Analiz tamamlandi. Ayrintili sonucu yukaridan inceleyin.',
                en: 'Analysis complete. See the detailed results above.',
              );
        }
      } catch (_) {}
      // Absolute fallback — never show JSON
      return _txt(
        context,
        tr: 'Analiz tamamlandi. Ayrintili sonucu yukaridan inceleyin.',
        en: 'Analysis complete. See the detailed results above.',
      );
    }
    return raw;
  }

  @override
  Widget build(BuildContext context) {
    var subs = (structured?['subscriptions'] as Map<String, dynamic>?) ?? {};
    var winner = (structured?['winner'] as Map<String, dynamic>?) ?? {};

    // If structured is null but analysisText looks like JSON, try to parse it
    if (subs.isEmpty && analysisText.trim().startsWith('{')) {
      try {
        var clean = analysisText.trim();
        if (clean.startsWith('```')) {
          clean = clean
              .replaceFirst(RegExp(r'^```\w*\n?'), '')
              .replaceFirst(RegExp(r'\n?```$'), '');
        }
        final parsed = jsonDecode(clean) as Map<String, dynamic>?;
        if (parsed != null) {
          subs = (parsed['subscriptions'] as Map<String, dynamic>?) ?? {};
          winner = (parsed['winner'] as Map<String, dynamic>?) ?? {};
        }
      } catch (_) {}
    }
    final hasStructured = subs.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ── Winner Banner (if comparing) ──
        if (hasStructured && winner.isNotEmpty) ...[
          _buildWinnerBanner(context, winner),
          const SizedBox(height: 16),
        ],

        // ── Score rings ──
        if (scores.isNotEmpty) ...[
          GlassContainer(
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                    Text(
                      context.l10n?.compatibilityScores ??
                          'Compatibility Scores',
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                        color: context.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 20),
                    Wrap(
                      spacing: 20,
                      runSpacing: 20,
                      alignment: WrapAlignment.center,
                      children: scores.entries.map((e) {
                        return _ScoreRing(label: e.key, score: e.value);
                      }).toList(),
                    ),
                  ],
                ),
              )
              .animate()
              .fadeIn(duration: 400.ms)
              .scale(
                begin: const Offset(0.9, 0.9),
                end: const Offset(1, 1),
                duration: 500.ms,
                curve: Curves.elasticOut,
              ),
          const SizedBox(height: 16),
        ],

        // ── Per-Service Structured Cards ──
        if (hasStructured)
          ...subs.entries.toList().asMap().entries.map((entry) {
            final idx = entry.key;
            final name = entry.value.key;
            final data = entry.value.value as Map<String, dynamic>? ?? {};
            return Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: _buildServiceCard(context, name, data),
                )
                .animate()
                .fadeIn(duration: 400.ms, delay: (100 * idx).ms)
                .slideY(begin: 0.05, duration: 400.ms);
          }),

        // ── Recommendation ──
        if (hasStructured && winner['recommendation'] != null) ...[
          _buildRecommendationCard(context, winner['recommendation'] as String),
          const SizedBox(height: 16),
        ],
        // Single service recommendation (non-compare mode)
        if (hasStructured &&
            !winner.containsKey('recommendation') &&
            structured?['recommendation'] != null) ...[
          _buildRecommendationCard(
            context,
            structured!['recommendation'] as String,
          ),
          const SizedBox(height: 16),
        ],

        // ── Detailed Comparison Section ──
        if (hasStructured &&
            (structured?['detailed_comparison'] as Map<String, dynamic>?)
                    ?.isNotEmpty ==
                true) ...[
          _buildDetailedComparison(
            context,
            structured!['detailed_comparison'] as Map<String, dynamic>,
          ),
          const SizedBox(height: 16),
        ],

        // ── Readable Analysis Fallback (if no structured data) ──
        if (!hasStructured) ...[
          // If scores exist, show them as simple cards even without full structured data
          if (scores.isNotEmpty) ...[
            ...scores.entries.map((e) {
              final score = e.value;
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: GlassContainer(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              e.key,
                              style: GoogleFonts.plusJakartaSans(
                                fontWeight: FontWeight.w700,
                                fontSize: 15,
                                color: context.textPrimary,
                              ),
                            ),
                          ),
                          Text(
                            '${score.toInt()}%',
                            style: GoogleFonts.inter(
                              fontWeight: FontWeight.w800,
                              fontSize: 20,
                              color: _scoreColor(score),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: LinearProgressIndicator(
                          value: score / 100,
                          backgroundColor: context.dividerColor,
                          valueColor: AlwaysStoppedAnimation(
                            _scoreColor(score),
                          ),
                          minHeight: 8,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }),
            const SizedBox(height: 8),
          ],
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
                        gradient: const LinearGradient(
                          colors: [_kPrimary, _kDeep],
                        ),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(
                        Icons.insights_rounded,
                        color: Colors.white,
                        size: 16,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        context.l10n?.aiAnalysis ?? 'AI Analysis',
                        style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w700,
                          fontSize: 16,
                          color: context.textPrimary,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                MarkdownBody(
                  data: _readableAnalysis(context, analysisText, subs, winner),
                  selectable: true,
                  styleSheet: MarkdownStyleSheet(
                    p: GoogleFonts.plusJakartaSans(
                      fontSize: 14,
                      color: context.textPrimary,
                      height: 1.6,
                    ),
                    strong: GoogleFonts.plusJakartaSans(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: context.textPrimary,
                    ),
                    em: GoogleFonts.plusJakartaSans(
                      fontSize: 14,
                      fontStyle: FontStyle.italic,
                      color: context.textSecondary,
                    ),
                    listBullet: GoogleFonts.plusJakartaSans(
                      fontSize: 14,
                      color: context.textSecondary,
                    ),
                    blockSpacing: 8,
                  ),
                ),
              ],
            ),
          ).animate().fadeIn(duration: 500.ms, delay: 200.ms),
        ],

        const SizedBox(height: 16),
      ],
    );
  }

  Widget _buildWinnerBanner(BuildContext context, Map<String, dynamic> winner) {
    return GlassContainer(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              const Text('🏆', style: TextStyle(fontSize: 40)),
              const SizedBox(height: 8),
              Text(
                winner['overall'] as String? ?? '',
                style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.w800,
                  fontSize: 22,
                  color: context.textPrimary,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                _txt(context, tr: 'Genel Kazanan', en: 'Overall Winner'),
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 13,
                  color: context.textSecondary,
                ),
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  if (winner['best_value'] != null)
                    _buildMiniWinner(
                      context,
                      '💰',
                      context.l10n?.bestValue ??
                          _txt(context, tr: 'En Iyi Deger', en: 'Best Value'),
                      winner['best_value'] as String,
                    ),
                  if (winner['best_content'] != null)
                    _buildMiniWinner(
                      context,
                      '✨',
                      _txt(context, tr: 'En Iyi Icerik', en: 'Best Content'),
                      winner['best_content'] as String,
                    ),
                ],
              ),
            ],
          ),
        )
        .animate()
        .fadeIn(duration: 500.ms)
        .scale(
          begin: const Offset(0.85, 0.85),
          end: const Offset(1, 1),
          duration: 600.ms,
          curve: Curves.elasticOut,
        );
  }

  Widget _buildMiniWinner(
    BuildContext context,
    String emoji,
    String label,
    String name,
  ) {
    return Column(
      children: [
        Text(emoji, style: const TextStyle(fontSize: 20)),
        const SizedBox(height: 4),
        Text(
          label,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 11,
            color: context.textTertiaryColor,
            fontWeight: FontWeight.w500,
          ),
        ),
        Text(
          name,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 13,
            color: context.textPrimary,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }

  Widget _buildServiceCard(
    BuildContext context,
    String name,
    Map<String, dynamic> data,
  ) {
    final score = (data['compatibility_score'] as num?)?.toDouble() ?? 0;
    final explanation = data['compatibility_explanation'] as String? ?? '';
    final price = _formatPrice(data['price'] as String? ?? '');
    final pros = List<String>.from(data['pros'] ?? []);
    final cons = List<String>.from(data['cons'] ?? []);
    final sentiment = data['community_sentiment'] as String? ?? '';
    final factors = (data['factors'] as Map<String, dynamic>?) ?? {};

    return GlassContainer(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header: Name + Score + Price
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w800,
                        fontSize: 18,
                        color: context.textPrimary,
                      ),
                    ),
                    if (price.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        price,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13,
                          color: _kAccent,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              // Large score badge
              Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: LinearGradient(
                    colors: [
                      _scoreColor(score).withValues(alpha: 0.8),
                      _scoreColor(score),
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                ),
                child: Center(
                  child: Text(
                    '${score.toInt()}%',
                    style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w900,
                      fontSize: 16,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
            ],
          ),

          // Explanation
          if (explanation.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              explanation,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 13,
                color: context.textSecondary,
                height: 1.4,
              ),
            ),
          ],

          // Factor Bars
          if (factors.isNotEmpty) ...[
            const SizedBox(height: 16),
            ...factors.entries.map((f) {
              final fScore = (f.value as num?)?.toDouble() ?? 0;
              final label = _factorLabel(context, f.key);
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    SizedBox(
                      width: 95,
                      child: Text(
                        label,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11,
                          color: context.textTertiaryColor,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: fScore / 100,
                          minHeight: 8,
                          backgroundColor: context.surfaceElevatedColor,
                          color: _scoreColor(fScore),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    SizedBox(
                      width: 32,
                      child: Text(
                        '${fScore.toInt()}',
                        textAlign: TextAlign.right,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12,
                          color: _scoreColor(fScore),
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],

          // Pros & Cons
          if (pros.isNotEmpty || cons.isNotEmpty) ...[
            const SizedBox(height: 16),
            if (pros.isNotEmpty) ...[
              _buildProConSection(
                context,
                context.l10n?.prosForYou ?? 'Pros',
                '✅',
                pros,
                AppTheme.success,
              ),
              if (cons.isNotEmpty) const SizedBox(height: 12),
            ],
            if (cons.isNotEmpty)
              _buildProConSection(
                context,
                context.l10n?.consForYou ?? 'Cons',
                '❌',
                cons,
                AppTheme.error,
              ),
          ],

          // Community Sentiment
          if (sentiment.isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: context.surfaceElevatedColor,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('💬', style: TextStyle(fontSize: 16)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      sentiment,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        color: context.textSecondary,
                        height: 1.4,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildProConSection(
    BuildContext context,
    String title,
    String emoji,
    List<String> items,
    Color color,
  ) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.15)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: GoogleFonts.plusJakartaSans(
              fontWeight: FontWeight.w700,
              fontSize: 13,
              color: color,
            ),
          ),
          const SizedBox(height: 8),
          ...items.map(
            (item) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(emoji, style: const TextStyle(fontSize: 13)),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      item,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        color: context.textSecondary,
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRecommendationCard(BuildContext context, String recommendation) {
    return GlassContainer(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [_kPrimary, _kSecondary],
                  ),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.auto_awesome_rounded,
                  color: Colors.white,
                  size: 16,
                ),
              ),
              const SizedBox(width: 12),
              Text(
                context.l10n?.aiRecommendation ?? 'AI Recommendation',
                style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.w700,
                  fontSize: 16,
                  color: context.textPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            recommendation,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 14,
              color: context.textPrimary,
              height: 1.6,
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 500.ms, delay: 300.ms);
  }

  Widget _buildDetailedComparison(
    BuildContext context,
    Map<String, dynamic> comparison,
  ) {
    final sections = <_ComparisonSection>[
      if (comparison['pricing_analysis'] != null)
        _ComparisonSection(
          '💰',
          context.l10n?.pricingAnalysisTitle ?? 'Pricing Analysis',
          comparison['pricing_analysis'] as String,
        ),
      if (comparison['feature_comparison'] != null)
        _ComparisonSection(
          '⚡',
          context.l10n?.featureComparisonTitle ?? 'Feature Comparison',
          comparison['feature_comparison'] as String,
        ),
      if (comparison['user_experience'] != null)
        _ComparisonSection(
          '🎯',
          context.l10n?.userExperienceTitle ?? 'User Experience',
          comparison['user_experience'] as String,
        ),
    ];
    if (sections.isEmpty) return const SizedBox.shrink();

    return GlassContainer(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            context.l10n?.detailedComparisonTitle ?? 'Detailed Comparison',
            style: GoogleFonts.plusJakartaSans(
              fontWeight: FontWeight.w700,
              fontSize: 16,
              color: context.textPrimary,
            ),
          ),
          const SizedBox(height: 16),
          ...sections.map(
            (s) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(s.emoji, style: const TextStyle(fontSize: 18)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          s.title,
                          style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                            color: context.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          s.content,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12,
                            color: context.textSecondary,
                            height: 1.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 500.ms, delay: 200.ms);
  }
}

// ── Comparison Section Helper ────────────────────────────────────────────────

class _ComparisonSection {
  final String emoji;
  final String title;
  final String content;
  const _ComparisonSection(this.emoji, this.title, this.content);
}

// ── Score Ring Widget ────────────────────────────────────────────────────────

class _ScoreRing extends StatelessWidget {
  final String label;
  final double score;

  const _ScoreRing({required this.label, required this.score});

  Color get _color {
    if (score >= 80) return AppTheme.success;
    if (score >= 60) return const Color(0xFFF59E0B);
    if (score >= 40) return const Color(0xFFF97316);
    return AppTheme.error;
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 100,
      child: Column(
        children: [
          SizedBox(
            width: 80,
            height: 80,
            child: Stack(
              alignment: Alignment.center,
              children: [
                SizedBox(
                  width: 80,
                  height: 80,
                  child: CircularProgressIndicator(
                    value: score / 100,
                    strokeWidth: 6,
                    backgroundColor: AppTheme.slate700,
                    color: _color,
                    strokeCap: StrokeCap.round,
                  ),
                ),
                Text(
                  '${score.toInt()}%',
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w800,
                    fontSize: 20,
                    color: _color,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Text(
            label,
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: context.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}
