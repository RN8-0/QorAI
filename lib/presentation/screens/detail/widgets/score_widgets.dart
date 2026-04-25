part of '../product_detail_screen.dart';

// ═══════════════════════════════════════════════════════════
// SCORE DUO — Tech Score + Your Match only
// ═══════════════════════════════════════════════════════════

String _scoreLevelLabel(BuildContext context, int score) {
  final languageCode =
      Localizations.localeOf(context).languageCode.toLowerCase();
  const labels = <String, List<String>>{
    'ar': ['ممتاز', 'جيد', 'متوسط', 'منخفض'],
    'de': ['Ausgezeichnet', 'Gut', 'Mittel', 'Niedrig'],
    'en': ['Excellent', 'Good', 'Fair', 'Low'],
    'es': ['Excelente', 'Bueno', 'Regular', 'Bajo'],
    'fr': ['Excellent', 'Bon', 'Moyen', 'Faible'],
    'it': ['Eccellente', 'Buono', 'Medio', 'Basso'],
    'ja': ['優秀', '良好', '普通', '低い'],
    'nl': ['Uitstekend', 'Goed', 'Gemiddeld', 'Laag'],
    'pl': ['Swietny', 'Dobry', 'Sredni', 'Niski'],
    'pt': ['Excelente', 'Bom', 'Medio', 'Baixo'],
    'sv': ['Utmarkt', 'Bra', 'Medel', 'Lag'],
    'tr': ['Mükemmel', 'İyi', 'Orta', 'Düşük'],
  };
  final localeLabels = labels[languageCode] ?? labels['en']!;
  if (score >= 80) return localeLabels[0];
  if (score >= 60) return localeLabels[1];
  if (score >= 40) return localeLabels[2];
  return localeLabels[3];
}

String _localizedMatchLoadingText(BuildContext context) {
  final languageCode =
      Localizations.localeOf(context).languageCode.toLowerCase();
  const labels = <String, String>{
    'ar': 'جارٍ التحليل...',
    'de': 'Wird analysiert...',
    'en': 'Analyzing...',
    'es': 'Analizando...',
    'fr': 'Analyse...',
    'it': 'Analisi...',
    'ja': '分析中...',
    'nl': 'Analyseren...',
    'pl': 'Analizowanie...',
    'pt': 'Analisando...',
    'sv': 'Analyserar...',
    'tr': 'Analiz ediliyor...',
  };
  return labels[languageCode] ?? labels['en']!;
}

class _ScoreDuo extends ConsumerStatefulWidget {
  final ProductEntity product;
  const _ScoreDuo({required this.product});

  @override
  ConsumerState<_ScoreDuo> createState() => _ScoreDuoState();
}

class _ScoreDuoState extends ConsumerState<_ScoreDuo>
    with SingleTickerProviderStateMixin {
  String? _lastRequestedLanguage;
  bool _reasonExpanded = false;
  ProviderSubscription<AsyncValue<UserEntity?>>? _userProfileSub;
  ProviderSubscription<AsyncValue<BehaviorSignals>>? _behaviorSignalsSub;
  ProviderSubscription<Locale?>? _localeSub;

  // Memoize fit score so we don't re-run the algorithm on every rebuild.
  int? _cachedFitScore;
  String? _cachedFitScoreKey;
  bool _fitScoreScheduled = false;

  // True from the moment we know the Gemini fetch will happen until it
  // completes. Prevents the local fit score from flashing briefly before
  // the loading indicator appears (which caused the "goes up then down"
  // oscillation the user reported).
  bool _geminiFetchTriggered = false;

  @override
  void initState() {
    super.initState();
    _userProfileSub = ref.listenManual<AsyncValue<UserEntity?>>(
      userProfileProvider,
      (previous, next) {
        _maybeRecomputeFitScore();
        _maybeTriggerGeminiFetch();
      },
    );
    _behaviorSignalsSub = ref.listenManual<AsyncValue<BehaviorSignals>>(
      behaviorSignalsProvider,
      (previous, next) {
        _maybeRecomputeFitScore();
      },
    );
    _localeSub = ref.listenManual<Locale?>(
      localeProvider,
      (previous, next) {
        _maybeTriggerGeminiFetch();
      },
    );
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      Future<void>.delayed(const Duration(milliseconds: 350), () {
        if (!mounted) return;
        // Let the first route frames settle before starting AI work.
        _prearmGeminiFetchFlag();
        _maybeTriggerGeminiFetch();
        _maybeRecomputeFitScore();
      });
    });
  }

  @override
  void dispose() {
    _userProfileSub?.close();
    _behaviorSignalsSub?.close();
    _localeSub?.close();
    super.dispose();
  }

  /// Sets _geminiFetchTriggered = true if an AI fetch will happen,
  /// so the local score never flashes before the loading indicator.
  void _prearmGeminiFetchFlag() {
    if (!mounted) return;
    final user = ref.read(userProfileProvider).valueOrNull;
    if (user == null || !user.quizCompleted) return;
    final isPremium = ref.read(
      subscriptionServiceProvider.select((service) => service.isPremium),
    );
    if (!isPremium) return;
    final cacheKey = _currentCacheKey();
    final existing = ref.read(geminiMatchScoreProvider(cacheKey));
    if (existing.valueOrNull != null) return; // Already have result — no loading needed
    if (mounted) setState(() => _geminiFetchTriggered = true);
  }

  String _currentLanguageCode() {
    final locale = ref.read(localeProvider);
    if (locale != null && locale.languageCode.isNotEmpty) {
      return locale.languageCode.toLowerCase();
    }
    // Safe context fallback — in initState the inherited widget tree may not
    // be fully ready, so guard with a try/catch.
    try {
      return Localizations.localeOf(context).languageCode.toLowerCase();
    } catch (_) {
      return 'en';
    }
  }

  LocalizedProductKey _currentCacheKey() {
    return LocalizedProductKey(
      productId: widget.product.id,
      languageCode: _currentLanguageCode(),
    );
  }

  // Stable memo key — independent of BehaviorSignals identity
  // (which is reference-based and changes whenever the FutureProvider
  // re-emits). Uses structural signals instead.
  String _fitScoreMemoKey(UserEntity user, BehaviorSignals behavior) {
    return '${widget.product.id}|${user.uid}|${user.quizCompleted}|'
        '${behavior.favorites.length}|${behavior.productViews.length}|'
        '${behavior.categoryViews.length}';
  }

  void _maybeRecomputeFitScore() {
    if (!mounted) return;
    if (_fitScoreScheduled) return;

    final user = ref.read(userProfileProvider).valueOrNull;
    if (user == null || !user.quizCompleted) return;
    final isPremium = ref.read(
      subscriptionServiceProvider.select((service) => service.isPremium),
    );
    // Premium: skip algorithm if AI fetch is running or already returned a score
    if (isPremium) {
      final cacheKey = _currentCacheKey();
      final matchAsync = ref.read(geminiMatchScoreProvider(cacheKey));
      final aiStillPending =
          _geminiFetchTriggered ||
          matchAsync is AsyncLoading ||
          _lastRequestedLanguage != cacheKey.normalizedLanguageCode;
      if (matchAsync.valueOrNull != null || aiStillPending) return;
    }

    final behavior =
        ref.read(behaviorSignalsProvider).valueOrNull ?? BehaviorSignals.empty;
    final memoKey = _fitScoreMemoKey(user, behavior);
    if (_cachedFitScoreKey == memoKey && _cachedFitScore != null) return;

    _fitScoreScheduled = true;
    // Keep the route transition responsive, but don't leave completed-quiz
    // users waiting seconds before the match state appears.
    Future.delayed(const Duration(milliseconds: 450), () async {
      if (!mounted) {
        _fitScoreScheduled = false;
        return;
      }
      // Run fit score computation in a background isolate so the main thread
      // stays fully free for touch/scroll events.
      final score = await compute(
        _computeFitScoreIsolate,
        _FitScoreParams(
          user: user,
          product: widget.product,
          behavior: behavior,
        ),
      );
      _fitScoreScheduled = false;
      if (!mounted) return;
      if (_cachedFitScoreKey == memoKey && _cachedFitScore == score) return;
      setState(() {
        _cachedFitScore = score;
        _cachedFitScoreKey = memoKey;
      });
    });
  }

  void _maybeTriggerGeminiFetch() {
    if (!mounted) return;
    final user = ref.read(userProfileProvider).valueOrNull;
    if (user == null || !user.quizCompleted) return;
    final isPremium = ref.read(
      subscriptionServiceProvider.select((service) => service.isPremium),
    );
    if (!isPremium) return;
    final cacheKey = _currentCacheKey();
    if (_lastRequestedLanguage == cacheKey.normalizedLanguageCode) return;
    _lastRequestedLanguage = cacheKey.normalizedLanguageCode;
    final existing = ref.read(geminiMatchScoreProvider(cacheKey));
    if (existing.isLoading || existing.valueOrNull != null) return;
    // Arm the flag before calling fetchMatchScore so there's no window
    // where localFitScore shows through before aiLoading becomes true.
    if (mounted) {
      setState(() => _geminiFetchTriggered = true);
    }
    ref
        .read(geminiMatchScoreProvider(cacheKey).notifier)
        .fetchMatchScore(product: widget.product);
  }

  @override
  Widget build(BuildContext context) {
    final languageCode = ref.watch(
      localeProvider.select((l) => (l?.languageCode ?? 'en').toLowerCase()),
    );
    final cacheKey = LocalizedProductKey(
      productId: widget.product.id,
      languageCode: languageCode,
    );
    final techScore = widget.product.techScore.toInt();
    final authUser = ref.watch(
      authStateProvider.select((state) => state.valueOrNull),
    );
    final userProfileAsync = ref.watch(userProfileProvider);
    final userProfile = userProfileAsync.valueOrNull;

    final quizDone = userProfile?.quizCompleted ?? false;
    final isUserProfileLoading = userProfileAsync.isLoading;
    final isMatchProfileResolving =
        authUser != null && (isUserProfileLoading || userProfile == null);
    final isPremium = ref.watch(
      subscriptionServiceProvider.select((service) => service.isPremium),
    );

    final int? localFitScore = quizDone ? _cachedFitScore : null;

    final matchAsync = ref.watch(geminiMatchScoreProvider(cacheKey));
    final matchResult = matchAsync.valueOrNull;
    final aiLoading = matchAsync.isLoading;

    if (_geminiFetchTriggered && matchAsync is AsyncData) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || !_geminiFetchTriggered) return;
        setState(() => _geminiFetchTriggered = false);
      });
    }

    final waitingForAI =
        quizDone &&
        (_geminiFetchTriggered || aiLoading) &&
        matchResult == null;
    final fitScore = matchResult?.matchScore ??
        (waitingForAI ? null : localFitScore);
    final showMatchLoading = waitingForAI;
    final reason = (matchResult?.reason.isNotEmpty ?? false)
        ? matchResult!.reason
        : null;
    final showFreeAiRequest =
        quizDone &&
        !isPremium &&
        matchResult == null &&
        !showMatchLoading &&
        !isMatchProfileResolving;

    if (quizDone &&
        matchResult == null &&
        !showMatchLoading &&
        _cachedFitScore == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _maybeRecomputeFitScore();
      });
    }

    if (techScore == 0 && fitScore == null && !quizDone && !showMatchLoading) {
      return const SizedBox.shrink();
    }

    final matchColor = fitScore == null
        ? AppTheme.slate700
        : fitScore >= 80
        ? AppTheme.scoreExcellent
        : fitScore >= 60
        ? AppTheme.warning
        : AppTheme.error;

    final Widget matchChild;
    if (fitScore != null) {
      matchChild = RepaintBoundary(
        child: _AnimatedScoreCell(
          label: context.l10n?.yourMatch ?? 'Your Match',
          score: fitScore,
          color: matchColor,
          icon: Icons.person_outline,
        ),
      );
    } else if (showMatchLoading) {
      matchChild = Padding(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox(
              width: 44,
              height: 44,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  CircularProgressIndicator(
                    strokeWidth: 3,
                    valueColor: AlwaysStoppedAnimation(AppTheme.primaryBlue),
                  ),
                  const Icon(
                    Icons.auto_awesome,
                    size: 16,
                    color: AppTheme.primaryBlue,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    context.l10n?.yourMatch ?? 'Your Match',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.slate500,
                      letterSpacing: 0.4,
                    ),
                  ),
                  const SizedBox(height: 2),
                  _AiStepText(productId: widget.product.id),
                ],
              ),
            ),
          ],
        ),
      );
    } else if (isMatchProfileResolving) {
      matchChild = Padding(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                context.l10n?.computingMatch ?? 'Eşleşme hesaplanıyor...',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.primaryBlue,
                ),
              ),
            ),
          ],
        ),
      );
    } else if (showFreeAiRequest && _cachedFitScore == null) {
      matchChild = Padding(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox(
              width: 44,
              height: 44,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  CircularProgressIndicator(
                    strokeWidth: 3,
                    valueColor: AlwaysStoppedAnimation(AppTheme.primaryBlue),
                  ),
                  const Icon(
                    Icons.calculate_outlined,
                    size: 16,
                    color: AppTheme.primaryBlue,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                context.l10n?.yourMatch ?? 'Your Match',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.primaryBlue,
                ),
              ),
            ),
          ],
        ),
      );
    } else {
      matchChild = GestureDetector(
        onTap: () {
          final isLoggedInNow =
              ref.read(authStateProvider).valueOrNull != null;
          if (!isLoggedInNow) {
            context.go(AppRoutes.login);
            return;
          }
          context.push(AppRoutes.quiz);
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              SizedBox(
                width: 44,
                height: 44,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    CircularProgressIndicator(
                      value: 1.0,
                      strokeWidth: 3,
                      color: context.surfaceVariantColor,
                    ),
                    Icon(
                      Icons.lock_outline_rounded,
                      size: 16,
                      color: context.textSecondary,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                      'Your Match',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppTheme.slate500,
                        letterSpacing: 0.4,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      context.l10n?.takeQuiz ?? 'Take Quiz',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.primaryBlue,
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

    return Column(
      children: [
        Container(
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 0),
          decoration: BoxDecoration(
            color: context.surfaceVariantColor,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppTheme.brandBlue.withValues(alpha: 0.10)),
            boxShadow: [
              ...AppTheme.cardShadow,
              BoxShadow(
                color: AppTheme.brandCyan.withValues(alpha: 0.05),
                blurRadius: 10,
                spreadRadius: -2,
              ),
            ],
          ),
          child: Row(
            children: [
              if (techScore > 0) ...[
                Expanded(
                  child: _ScoreCell(
                    label: context.l10n?.techScore ?? 'Tech Score',
                    score: techScore,
                    color: AppTheme.primaryBlue,
                    icon: Icons.memory_outlined,
                  ),
                ),
                Container(
                  width: 1,
                  height: 52,
                  margin: const EdgeInsets.symmetric(vertical: 12),
                  color: context.dividerColor,
                ),
              ],
              Expanded(child: matchChild),
            ],
          ),
        ),
        if (reason != null && fitScore != null)
          GestureDetector(
            onTap: () => setState(() => _reasonExpanded = !_reasonExpanded),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 6, 20, 0),
              child: Row(
                children: [
                  Icon(
                    Icons.auto_awesome,
                    size: 12,
                    color: matchColor.withValues(alpha: 0.7),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      reason,
                      maxLines: _reasonExpanded ? 100 : 1,
                      overflow: _reasonExpanded
                          ? TextOverflow.visible
                          : TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12,
                        fontStyle: FontStyle.italic,
                        color: context.textSecondary,
                        height: 1.4,
                      ),
                    ),
                  ),
                  Icon(
                    _reasonExpanded ? Icons.expand_less : Icons.expand_more,
                    size: 14,
                    color: context.textTertiaryColor,
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }

}

/// Animated score cell with count-up animation
class _AnimatedScoreCell extends StatefulWidget {
  final String label;
  final int score;
  final Color color;
  final IconData icon;
  const _AnimatedScoreCell({
    required this.label,
    required this.score,
    required this.color,
    required this.icon,
  });

  @override
  State<_AnimatedScoreCell> createState() => _AnimatedScoreCellState();
}

class _AnimatedScoreCellState extends State<_AnimatedScoreCell>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );
    _animation = Tween<double>(
      begin: 0,
      end: widget.score.toDouble(),
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic));
    _controller.forward();
  }

  @override
  void didUpdateWidget(_AnimatedScoreCell oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.score != widget.score) {
      _animation =
          Tween<double>(
            begin: _animation.value,
            end: widget.score.toDouble(),
          ).animate(
            CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic),
          );
      _controller
        ..reset()
        ..forward();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _animation,
      builder: (context, _) {
        final currentScore = _animation.value.toInt();
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              SizedBox(
                width: 44,
                height: 44,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    CircularProgressIndicator(
                      value: 1.0,
                      strokeWidth: 3,
                      color: context.surfaceVariantColor,
                    ),
                    CircularProgressIndicator(
                      value: _animation.value / 100,
                      strokeWidth: 3,
                      backgroundColor: Colors.transparent,
                      valueColor: AlwaysStoppedAnimation<Color>(widget.color),
                      strokeCap: StrokeCap.round,
                    ),
                    Text(
                      '$currentScore',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: widget.color,
                        height: 1,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Icon(widget.icon, size: 12, color: widget.color),
                        const SizedBox(width: 3),
                        Expanded(
                          child: Text(
                            widget.label,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.slate500,
                              letterSpacing: 0.4,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _scoreLevelLabel(context, currentScore),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: widget.color,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Tiny Consumer that watches ONLY the AI step message so that step changes
/// don't cause the entire _ScoreDuo tree to rebuild.
class _AiStepText extends ConsumerWidget {
  final String productId;
  const _AiStepText({required this.productId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final msg = ref.watch(aiMatchStepProvider(productId));
    final text = msg.isNotEmpty ? msg : _localizedMatchLoadingText(context);
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 280),
      child: Text(
        key: ValueKey(text),
        text,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: AppTheme.primaryBlue,
        ),
      ),
    );
  }
}

class _ScoreCell extends StatelessWidget {
  final String label;
  final int score;
  final Color color;
  final IconData icon;
  const _ScoreCell({
    required this.label,
    required this.score,
    required this.color,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(
            width: 44,
            height: 44,
            child: Stack(
              alignment: Alignment.center,
              children: [
                CircularProgressIndicator(
                  value: 1.0,
                  strokeWidth: 3,
                  color: context.surfaceVariantColor,
                ),
                CircularProgressIndicator(
                  value: score / 100,
                  strokeWidth: 3,
                  backgroundColor: Colors.transparent,
                  valueColor: AlwaysStoppedAnimation<Color>(color),
                  strokeCap: StrokeCap.round,
                ),
                Text(
                  '$score',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: color,
                    height: 1,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Icon(icon, size: 12, color: color),
                    const SizedBox(width: 3),
                    Expanded(
                      child: Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.slate500,
                          letterSpacing: 0.4,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  _scoreLevelLabel(context, score),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: color,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── ISOLATE HELPERS for background fit-score computation ────────────────────

class _FitScoreParams {
  final UserEntity user;
  final ProductEntity product;
  final BehaviorSignals behavior;
  const _FitScoreParams({
    required this.user,
    required this.product,
    required this.behavior,
  });
}

int _computeFitScoreIsolate(_FitScoreParams params) {
  final algo = ProfileAlgorithmService();
  return algo
      .calculateTotalFitScore(
        user: params.user,
        product: params.product,
        behavior: params.behavior,
      )
      .round()
      .clamp(0, 100);
}
