part of '../product_detail_screen.dart';

// ═══════════════════════════════════════════════════════════
// SCORE DUO — Tech Score + Your Match only
// ═══════════════════════════════════════════════════════════

String _scoreLevelLabel(BuildContext context, int score) {
  final isTurkish =
      Localizations.localeOf(context).languageCode.toLowerCase() == 'tr';
  if (score >= 80) return isTurkish ? 'Mükemmel' : 'Excellent';
  if (score >= 60) return isTurkish ? 'İyi' : 'Good';
  if (score >= 40) return isTurkish ? 'Orta' : 'Fair';
  return isTurkish ? 'Düşük' : 'Low';
}

class _ScoreDuo extends ConsumerStatefulWidget {
  final ProductEntity product;
  const _ScoreDuo({required this.product});

  @override
  ConsumerState<_ScoreDuo> createState() => _ScoreDuoState();
}

class _ScoreDuoState extends ConsumerState<_ScoreDuo>
    with SingleTickerProviderStateMixin {
  bool _geminiTriggered = false;
  bool _reasonExpanded = false;

  bool get _isTurkish =>
      (ref.read(localeProvider)?.languageCode ?? 'en').toLowerCase() == 'tr';

  String _fallbackText({required String en, required String tr}) {
    return _isTurkish ? tr : en;
  }

  void _triggerGeminiFetch() {
    if (_geminiTriggered) return;
    _geminiTriggered = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref
          .read(geminiMatchScoreProvider(widget.product.id).notifier)
          .fetchMatchScore(product: widget.product);
    });
  }

  @override
  Widget build(BuildContext context) {
    final techScore = widget.product.techScore.toInt();
    final userAsync = ref.watch(userProfileProvider);
    final user = userAsync.valueOrNull;
    final quizDone = user != null && user.quizCompleted;

    // Trigger Gemini fetch when quiz is done
    if (quizDone) _triggerGeminiFetch();

    // Watch the Gemini match score provider
    final matchAsync = ref.watch(geminiMatchScoreProvider(widget.product.id));
    final matchResult = matchAsync.valueOrNull;
    final isLoading = matchAsync is AsyncLoading;

    final int? fitScore = matchResult?.matchScore;
    final String? reason = (matchResult?.reason.isNotEmpty ?? false)
        ? matchResult!.reason
        : null;

    if (techScore == 0 && fitScore == null && !quizDone && !isLoading) {
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
            boxShadow: [
              BoxShadow(
                color: Colors.white.withValues(alpha: 0.05),
                blurRadius: 8,
                offset: const Offset(0, 2),
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
                  child: isLoading
                      ? _buildMatchLoading(context)
                      : fitScore != null
                      ? _AnimatedScoreCell(
                          label: context.l10n?.yourMatch ?? 'Your Match',
                          score: fitScore,
                          color: matchColor,
                          icon: Icons.person_outline,
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
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      context.l10n?.yourMatch ?? 'Your Match',
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
                                      style: TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w700,
                                        color: AppTheme.primaryBlue,
                                      ),
                                    ),
                                  ],
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
                      maxLines: _reasonExpanded ? 10 : 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11,
                        fontStyle: FontStyle.italic,
                        color: context.textSecondary,
                        height: 1.3,
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

  Widget _buildMatchLoading(BuildContext context) {
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
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                context.l10n?.yourMatch ?? 'Your Match',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.slate500,
                  letterSpacing: 0.4,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                _fallbackText(en: 'Analyzing...', tr: 'Analiz ediliyor...'),
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.primaryBlue.withValues(alpha: 0.7),
                ),
              ),
            ],
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
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(widget.icon, size: 12, color: widget.color),
                      const SizedBox(width: 3),
                      Text(
                        widget.label,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.slate500,
                          letterSpacing: 0.4,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _scoreLevelLabel(context, currentScore),
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: widget.color,
                    ),
                  ),
                ],
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
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 12, color: color),
                  const SizedBox(width: 3),
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: AppTheme.slate500,
                      letterSpacing: 0.4,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 2),
              Text(
                score >= 80
                    ? 'Excellent'
                    : score >= 60
                    ? 'Good'
                    : score >= 40
                    ? 'Fair'
                    : 'Low',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: color,
                ),
              ),
            ],
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
