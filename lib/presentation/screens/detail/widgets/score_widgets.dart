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
    'tr': ['Mukemmel', 'Iyi', 'Orta', 'Dusuk'],
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

  // Memoize fit score so we don't re-run the algorithm on every rebuild
  // (provider watches cause frequent rebuilds — esp. during route anim).
  // Computed asynchronously (off the build path) to keep the first frame
  // after navigation fast.
  int? _cachedFitScore;
  String? _cachedFitScoreKey;
  bool _fitScoreScheduled = false;

  @override
  void initState() {
    super.initState();
    // Both the Gemini fetch and the local fit-score must run AFTER the first
    // frame — otherwise `state = AsyncValue.loading()` inside the notifier
    // throws "Tried to modify a provider while the widget tree was building",
    // which silently leaves the match card stuck on a spinner forever.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _maybeTriggerGeminiFetch();
      _maybeRecomputeFitScore();
    });
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

    final behavior =
        ref.read(behaviorSignalsProvider).valueOrNull ?? BehaviorSignals.empty;
    final memoKey = _fitScoreMemoKey(user, behavior);
    if (_cachedFitScoreKey == memoKey && _cachedFitScore != null) return;

    _fitScoreScheduled = true;
    // Run in a microtask so we yield to the frame scheduler first —
    // keeps the push animation jank-free on low-end devices.
    Future.microtask(() {
      if (!mounted) {
        _fitScoreScheduled = false;
        return;
      }
      final algo = ProfileAlgorithmService();
      final score = algo
          .calculateTotalFitScore(
            user: user,
            product: widget.product,
            behavior: behavior,
          )
          .round()
          .clamp(0, 100);
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
    final cacheKey = _currentCacheKey();
    if (_lastRequestedLanguage == cacheKey.normalizedLanguageCode) return;
    _lastRequestedLanguage = cacheKey.normalizedLanguageCode;
    ref
        .read(geminiMatchScoreProvider(cacheKey).notifier)
        .fetchMatchScore(product: widget.product);
  }

  @override
  Widget build(BuildContext context) {
    // Narrow watches with .select so rebuild storms during route push
    // animation are avoided.
    final languageCode = ref.watch(
      localeProvider.select(
        (l) => (l?.languageCode ?? 'en').toLowerCase(),
      ),
    );
    final cacheKey = LocalizedProductKey(
      productId: widget.product.id,
      languageCode: languageCode,
    );
    final techScore = widget.product.techScore.toInt();

    // React to user profile / behavior changes off-build.
    ref.listen<AsyncValue<UserEntity?>>(userProfileProvider, (_, __) {
      _maybeRecomputeFitScore();
      _maybeTriggerGeminiFetch();
    });
    ref.listen<AsyncValue<BehaviorSignals>>(behaviorSignalsProvider, (_, __) {
      _maybeRecomputeFitScore();
    });
    ref.listen<Locale?>(localeProvider, (_, __) {
      _maybeTriggerGeminiFetch();
    });

    final quizDone = ref.watch(
      userProfileProvider
          .select((u) => u.valueOrNull?.quizCompleted ?? false),
    );

    final int? localFitScore = quizDone ? _cachedFitScore : null;

    // Watch DeepSeek result for reason text / authoritative score.
    final matchAsync = ref.watch(geminiMatchScoreProvider(cacheKey));
    final matchResult = matchAsync.valueOrNull;
    final aiLoading = matchAsync.isLoading;

    // AI match score is authoritative when quota allows; fall back to local
    // algorithmic fit only when DeepSeek returned null (free quota exhausted).
    // While AI is still loading we deliberately suppress the local fit score
    // so the user does not see a flicker between random-looking algorithmic
    // value and the final AI value — show a loading indicator instead.
    final int? fitScore = matchResult?.matchScore ??
        (aiLoading && quizDone ? null : localFitScore);
    final bool showMatchLoading = quizDone && aiLoading && matchResult == null;
    final String? reason = (matchResult?.reason.isNotEmpty ?? false)
        ? matchResult!.reason
        : null;

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
          child: IntrinsicHeight(
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
                  VerticalDivider(
                    width: 1,
                    thickness: 1,
                    color: context.dividerColor,
                    indent: 12,
                    endIndent: 12,
                  ),
                ],
                Expanded(
                  child: fitScore != null
                      ? _AnimatedScoreCell(
                          label: context.l10n?.yourMatch ?? 'Your Match',
                          score: fitScore,
                          color: matchColor,
                          icon: Icons.person_outline,
                        )
                      : showMatchLoading
                          ? Padding(
                              padding: const EdgeInsets.symmetric(
                                vertical: 14,
                                horizontal: 16,
                              ),
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
                                          valueColor: AlwaysStoppedAnimation(
                                            AppTheme.primaryBlue,
                                          ),
                                        ),
                                        Icon(
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
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Text(
                                          context.l10n?.yourMatch ??
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
                                          _localizedMatchLoadingText(context),
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(
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
                            )
                          : GestureDetector(
                          onTap: () => context.push(AppRoutes.quiz),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                              vertical: 14,
                              horizontal: 16,
                            ),
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
                                      Text(
                                        context.l10n?.yourMatch ?? 'Your Match',
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
                                        style: TextStyle(
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
                        ),
                ),
              ],
            ),
          ),
        ),
        // Gemini reason text (tap to expand)
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
                      overflow:
                          _reasonExpanded ? TextOverflow.visible : TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 12,
                        fontStyle: FontStyle.italic,
                        color: context.textSecondary,
                        height: 1.4,
                      ),
                    ),
                  ),
                  InkWell(
                    onTap: () => _showMatchScoreInfo(context),
                    borderRadius: BorderRadius.circular(12),
                    child: Padding(
                      padding: const EdgeInsets.all(4),
                      child: Icon(
                        Icons.info_outline_rounded,
                        size: 14,
                        color: context.textTertiaryColor,
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

  void _showMatchScoreInfo(BuildContext context) {
    final l10n = context.l10n;
    final isTr = (l10n?.localeName ?? 'en').startsWith('tr');
    final title = isTr ? 'Eşleşme Skoru Nasıl Hesaplanır?' : 'How Is Your Match Score Calculated?';
    final intro = isTr
        ? 'Eşleşme skoru, bu ürünün senin profil ve tercihlerinle ne kadar uyumlu olduğunu 0–100 arasında gösterir. AI (Gemini) aşağıdaki sinyalleri bir arada değerlendirir:'
        : 'Your match score shows how well this product fits your profile and preferences on a 0–100 scale. Our AI (Gemini) blends the following signals:';
    final signals = isTr
        ? const [
            'Quiz öncelikleri ve ağırlık vektörü (performans, pil, fiyat, tasarım…)',
            'Kullanım amacı, meslek ve ekosistem tercihi (Apple / Android / Windows)',
            'Son baktığın ve favorilediğin ürünlerden çıkarılan davranış sinyalleri',
            'Ürünün teknik skoru, spesifikasyonları, artı/eksi yönleri',
            'Bütçe uyumu ve kategoriye özel öncelikler',
          ]
        : const [
            'Quiz priorities & weight vector (performance, battery, price, design…)',
            'Usage intent, profession, and ecosystem preference (Apple / Android / Windows)',
            'Behavior signals from products you viewed or favorited recently',
            'Product tech score, specs, pros & cons',
            'Budget fit and category-specific priorities',
          ];
    final bands = isTr
        ? const [
            ['88–100', 'Olağanüstü uyum', AppTheme.scoreExcellent],
            ['75–87', 'Güçlü uyum', AppTheme.brandCyan],
            ['62–74', 'Makul uyum', AppTheme.warning],
            ['50–61', 'Orta düzey', AppTheme.warning],
            ['< 50', 'Zayıf uyum', AppTheme.error],
          ]
        : const [
            ['88–100', 'Exceptional fit', AppTheme.scoreExcellent],
            ['75–87', 'Strong fit', AppTheme.brandCyan],
            ['62–74', 'Solid fit', AppTheme.warning],
            ['50–61', 'Mediocre fit', AppTheme.warning],
            ['< 50', 'Poor fit', AppTheme.error],
          ];

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 42,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 14),
                  decoration: BoxDecoration(
                    color: ctx.dividerColor,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              ),
              Row(
                children: [
                  Icon(Icons.auto_awesome, color: AppTheme.primaryBlue, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      title,
                      style: Theme.of(ctx).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                intro,
                style: TextStyle(
                  fontSize: 13,
                  height: 1.45,
                  color: ctx.textSecondary,
                ),
              ),
              const SizedBox(height: 14),
              ...signals.map(
                (s) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.check_circle_rounded,
                          size: 16, color: AppTheme.scoreExcellent),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          s,
                          style: const TextStyle(fontSize: 13, height: 1.4),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 14),
              Text(
                isTr ? 'Skor aralıkları' : 'Score bands',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: ctx.textTertiaryColor,
                  letterSpacing: 0.5,
                ),
              ),
              const SizedBox(height: 8),
              ...bands.map((b) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: Row(
                      children: [
                        Container(
                          width: 58,
                          padding: const EdgeInsets.symmetric(
                              vertical: 4, horizontal: 8),
                          decoration: BoxDecoration(
                            color: (b[2] as Color).withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            b[0] as String,
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: b[2] as Color,
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            b[1] as String,
                            style: const TextStyle(fontSize: 13),
                          ),
                        ),
                      ],
                    ),
                  )),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildMatchLoading(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
      child: Row(
        children: [
          SizedBox(
            width: 44,
            height: 44,
            child: Stack(
              alignment: Alignment.center,
              children: [
                SizedBox(
                  width: 44,
                  height: 44,
                  child: CircularProgressIndicator(
                    strokeWidth: 3,
                    color: AppTheme.primaryBlue.withValues(alpha: 0.4),
                  ),
                ),
                Icon(
                  Icons.auto_awesome,
                  size: 14,
                  color: AppTheme.primaryBlue.withValues(alpha: 0.6),
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
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.slate500,
                    letterSpacing: 0.4,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  _localizedMatchLoadingText(context),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.primaryBlue.withValues(alpha: 0.7),
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

class _ScoreTrio extends StatelessWidget {
  final ProductEntity product;
  const _ScoreTrio({required this.product});

  @override
  Widget build(BuildContext context) {
    // If no scores, show nothing or empty state
    if (product.techScore == 0 &&
        product.ratings.community == 0 &&
        product.ratings.expert == 0) {
      return const SizedBox.shrink();
    }

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        _CircularScore(
          label: context.l10n?.techScore ?? 'Tech Score',
          score: product.techScore.toInt(),
          color: AppTheme.primaryBlue,
          icon: Icons.memory,
        ),
        _CircularScore(
          label: context.l10n?.userScore ?? 'User Score',
          score: (product.ratings.community * 10).toInt(),
          color: AppTheme.accentCyan,
          icon: Icons.people,
        ),
        _CircularScore(
          label: context.l10n?.expertScore ?? 'Expert Score',
          score: product.ratings.expert.toInt(),
          color: AppTheme.premiumPurple,
          icon: Icons.star,
        ),
      ],
    );
  }
}

class _CircularScore extends StatelessWidget {
  final String label;
  final int score;
  final Color color;
  final IconData icon;

  const _CircularScore({
    required this.label,
    required this.score,
    required this.color,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        SizedBox(
          width: 70,
          height: 70,
          child: Stack(
            alignment: Alignment.center,
            children: [
              SizedBox(
                width: 70,
                height: 70,
                child: CircularProgressIndicator(
                  value: 1.0,
                  strokeWidth: 6,
                  color: context.surfaceVariantColor,
                ),
              ),
              SizedBox(
                width: 70,
                height: 70,
                child: ShaderMask(
                  shaderCallback: (bounds) => LinearGradient(
                    colors: [color.withValues(alpha: 0.6), color],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ).createShader(bounds),
                  child: CircularProgressIndicator(
                    value: score / 100,
                    strokeWidth: 6,
                    valueColor: AlwaysStoppedAnimation(context.textPrimary),
                    strokeCap: StrokeCap.round,
                  ),
                ),
              ),
              Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(icon, size: 16, color: color),
                  Text(
                    '$score',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: context.textPrimary,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: context.textSecondary,
          ),
        ),
      ],
    );
  }
}
