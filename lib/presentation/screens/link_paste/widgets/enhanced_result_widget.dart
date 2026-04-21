part of '../link_paste_screen.dart';

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
    _scoreAnimation = Tween<double>(begin: 0, end: widget.result.enhancedScore)
        .animate(
          CurvedAnimation(
            parent: _scoreRevealController,
            curve: Curves.easeOutCubic,
          ),
        );
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
    final avgScore =
        result.factors.map((f) => f.score).reduce((a, b) => a + b) /
        factorCount;
    final variance =
        result.factors
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
    if (score >= 90)
      return context.l10n?.perfectMatch ?? 'Perfect Match! \u{1F3AF}';
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
      productName:
          base.metadata.title ?? (context.l10n?.productLabel ?? 'Product'),
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
                Icon(
                  Icons.check_circle_rounded,
                  color: context.surfaceVariantColor,
                  size: 18,
                ),
                const SizedBox(width: 10),
                Text(
                  context.l10n?.analysisSaved ?? 'Analysis saved!',
                  style: GoogleFonts.plusJakartaSans(
                    color: context.surfaceVariantColor,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            behavior: SnackBarBehavior.floating,
            backgroundColor: AppTheme.success,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
            margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          ),
        );
      },
      failure: (error) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              error.message,
              style: GoogleFonts.plusJakartaSans(
                color: context.surfaceVariantColor,
              ),
            ),
            behavior: SnackBarBehavior.floating,
            backgroundColor: AppTheme.error,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
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
    final title =
        base.metadata.title ?? (context.l10n?.productLabel ?? 'Product');
    final imageUrl = base.metadata.image;
    final category = base.category ?? '';
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
          child: Column(
            children: [
              Stack(
                children: [
                  // Image container — hidden when no image is available
                  if (imageUrl != null && imageUrl.isNotEmpty)
                    _LinkAnalysisImage(
                      imageUrl: imageUrl,
                      borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(16),
                      ),
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
                              horizontal: 14,
                              vertical: 7,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.black.withValues(alpha: 0.5),
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Text(
                              category,
                              style: GoogleFonts.plusJakartaSans(
                                color: context.surfaceVariantColor,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  // Animated score badge
                  Positioned(
                    top: 14,
                    right: 14,
                    child:
                        AnimatedBuilder(
                          animation: _scoreAnimation,
                          builder: (context, _) {
                            final animScore = _scoreAnimation.value;
                            return Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 14,
                                vertical: 8,
                              ),
                              decoration: BoxDecoration(
                                color: _getScoreColor(animScore),
                                borderRadius: BorderRadius.circular(24),
                                boxShadow: [
                                  BoxShadow(
                                    color: _getScoreColor(
                                      animScore,
                                    ).withValues(alpha: 0.4),
                                    blurRadius: 12,
                                    offset: const Offset(0, 4),
                                  ),
                                ],
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    Icons.favorite_rounded,
                                    size: 14,
                                    color: Colors.white,
                                  ),
                                  const SizedBox(width: 5),
                                  Text(
                                    '${animScore.toStringAsFixed(0)}% Match',
                                    style: GoogleFonts.plusJakartaSans(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w800,
                                      fontSize: 13,
                                    ),
                                  ),
                                ],
                              ),
                            );
                          },
                        ).animate().scale(
                          begin: const Offset(0.8, 0.8),
                          end: const Offset(1, 1),
                          duration: 400.ms,
                          curve: Curves.elasticOut,
                        ),
                  ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 20, 24, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 19,
                        fontWeight: FontWeight.w800,
                        color: context.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Text(
                          _getLabel(score),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: _getScoreColor(score),
                          ),
                        ),
                      ],
                    ),
                    if (base.metadata.siteName != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        context.l10n?.fromSite(base.metadata.siteName ?? '') ??
                            'from ${base.metadata.siteName}',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12,
                          color: context.textTertiaryColor,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.04),
        const SizedBox(height: 16),

        // Database match badge
        if (databaseMatch != null) ...[
          GlassContainer(
                padding: const EdgeInsets.all(16),
                usePrimaryTint: true,
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [AppTheme.success, AppTheme.scoreExcellent],
                        ),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(
                        Icons.verified_rounded,
                        size: 18,
                        color: context.surfaceVariantColor,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            context.l10n?.foundInDatabase ??
                                'Found in Compair Database',
                            style: GoogleFonts.plusJakartaSans(
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                              color: AppTheme.success,
                            ),
                          ),
                          Text(
                            databaseMatch.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              color: context.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: AppTheme.primaryBlue.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Column(
                        children: [
                          Text(
                            context.l10n?.techScoreLabel ?? 'Tech Score',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 9,
                              color: context.textTertiaryColor,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          Text(
                            '${databaseMatch.techScore.toStringAsFixed(0)}',
                            style: GoogleFonts.plusJakartaSans(
                              fontWeight: FontWeight.w800,
                              fontSize: 16,
                              color: AppTheme.primaryBlue,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              )
              .animate()
              .fadeIn(delay: 200.ms, duration: 400.ms)
              .slideY(begin: 0.04),
          const SizedBox(height: 12),
        ],

        // AI Confidence indicator
        GlassContainer(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(7),
                decoration: BoxDecoration(
                  color: AppTheme.accentCyan.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Icon(
                  Icons.psychology_alt_rounded,
                  size: 16,
                  color: AppTheme.accentCyan,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.l10n?.aiConfidence ?? 'AI Confidence',
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w600,
                        fontSize: 13,
                        color: context.textPrimary,
                      ),
                    ),
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
              Text(
                '${(confidence * 100).toStringAsFixed(0)}%',
                style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.w800,
                  fontSize: 15,
                  color: confidence >= 0.8
                      ? AppTheme.success
                      : confidence >= 0.6
                      ? AppTheme.scoreAverage
                      : AppTheme.scorePoor,
                ),
              ),
            ],
          ),
        ).animate().fadeIn(delay: 300.ms, duration: 400.ms),
        const SizedBox(height: 16),

        // Gauge
        _CompatibilityGauge(score: score, scoreAnimation: _scoreAnimation),
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
                      child: const Icon(
                        Icons.bar_chart_rounded,
                        size: 18,
                        color: AppTheme.primaryBlue,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      context.l10n?.compatibilityBreakdown ??
                          'Compatibility Breakdown',
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                        color: context.textPrimary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),
                ...result.factors.asMap().entries.map(
                  (entry) =>
                      Padding(
                            padding: const EdgeInsets.only(bottom: 14),
                            child: _FactorRow(factor: entry.value),
                          )
                          .animate()
                          .fadeIn(delay: (100 * entry.key).ms, duration: 300.ms)
                          .slideX(begin: 0.05),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],

        // Personal Fit Analysis
        if (result.personaScore != null || result.personaAnalysis != null) ...[
          Builder(
            builder: (ctx) {
              final isTr = Localizations.localeOf(ctx).languageCode == 'tr';
              final pScore = result.personaScore ?? 0;
              final pColor = pScore >= 80
                  ? AppTheme.success
                  : pScore >= 60
                  ? AppTheme.scoreGood
                  : pScore >= 40
                  ? AppTheme.scoreAverage
                  : AppTheme.scorePoor;
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
                              colors: [AppTheme.premiumPurple, AppTheme.neonPurple],
                            ),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(
                            Icons.biotech_rounded,
                            size: 18,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            isTr
                                ? 'Kişisel Uyum Analizi'
                                : 'Personal Fit Analysis',
                            style: GoogleFonts.plusJakartaSans(
                              fontWeight: FontWeight.w700,
                              fontSize: 16,
                              color: ctx.textPrimary,
                            ),
                          ),
                        ),
                        if (result.personaScore != null)
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 5,
                            ),
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                colors: [
                                  pColor.withValues(alpha: 0.2),
                                  AppTheme.premiumPurple.withValues(alpha: 0.15),
                                ],
                              ),
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(
                                color: pColor.withValues(alpha: 0.4),
                              ),
                            ),
                            child: Text(
                              '${pScore.toStringAsFixed(0)}%',
                              style: GoogleFonts.plusJakartaSans(
                                fontWeight: FontWeight.w800,
                                fontSize: 14,
                                color: pColor,
                              ),
                            ),
                          ),
                      ],
                    ),
                    if (result.personaAnalysis != null) ...[
                      const SizedBox(height: 14),
                      // Visual score bar
                      if (result.personaScore != null) ...[
                        ClipRRect(
                          borderRadius: BorderRadius.circular(6),
                          child: TweenAnimationBuilder<double>(
                            duration: const Duration(milliseconds: 900),
                            curve: Curves.easeOutCubic,
                            tween: Tween(begin: 0.0, end: pScore / 100),
                            builder: (_, v, __) => LinearProgressIndicator(
                              value: v,
                              minHeight: 8,
                              backgroundColor: AppTheme.slate700.withValues(alpha: 0.4),
                              color: pColor,
                            ),
                          ),
                        ),
                        const SizedBox(height: 14),
                      ],
                      MarkdownBody(
                        data: result.personaAnalysis!,
                        selectable: true,
                        styleSheet: MarkdownStyleSheet(
                          p: GoogleFonts.plusJakartaSans(
                            color: ctx.textSecondary,
                            fontSize: 14,
                            height: 1.7,
                          ),
                          strong: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
                            color: ctx.textPrimary,
                          ),
                          blockSpacing: 8,
                        ),
                      ),
                    ],
                  ],
                ),
              );
            },
          ).animate().fadeIn(delay: 200.ms, duration: 400.ms),
          const SizedBox(height: 16),
        ],

        // Pros & Cons
        if (result.prosForUser.isNotEmpty || result.consForUser.isNotEmpty) ...[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (result.prosForUser.isNotEmpty)
                Expanded(
                  child: _ProConCard(
                    title: context.l10n?.prosForYou ?? 'Pros for You',
                    items: result.prosForUser,
                    icon: Icons.thumb_up_rounded,
                    color: AppTheme.success,
                  ),
                ),
              if (result.prosForUser.isNotEmpty &&
                  result.consForUser.isNotEmpty)
                const SizedBox(width: 12),
              if (result.consForUser.isNotEmpty)
                Expanded(
                  child: _ProConCard(
                    title: context.l10n?.consForYou ?? 'Cons for You',
                    items: result.consForUser,
                    icon: Icons.thumb_down_rounded,
                    color: AppTheme.error,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),
        ],

        // Community & Internet Reviews
        if (result.communityScore != null || result.communityAnalysis != null) ...[
          Builder(
            builder: (ctx) {
              final isTr = Localizations.localeOf(ctx).languageCode == 'tr';
              final cScore = result.communityScore ?? 0;
              final cColor = cScore >= 75
                  ? AppTheme.success
                  : cScore >= 50
                  ? AppTheme.scoreGood
                  : cScore >= 30
                  ? AppTheme.scoreAverage
                  : AppTheme.scorePoor;
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
                            gradient: LinearGradient(
                              colors: [AppTheme.brandCyan, AppTheme.brandBlue],
                            ),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(
                            Icons.chat_bubble_outline_rounded,
                            size: 18,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                isTr
                                    ? 'Topluluk Yorumları'
                                    : 'Community Reviews',
                                style: GoogleFonts.plusJakartaSans(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 16,
                                  color: ctx.textPrimary,
                                ),
                              ),
                              Text(
                                'Reddit · YouTube · forums',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 11,
                                  color: ctx.textTertiaryColor,
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (result.communityScore != null)
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 5,
                            ),
                            decoration: BoxDecoration(
                              color: cColor.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(
                                color: cColor.withValues(alpha: 0.35),
                              ),
                            ),
                            child: Text(
                              '${cScore.toStringAsFixed(0)}%',
                              style: GoogleFonts.plusJakartaSans(
                                fontWeight: FontWeight.w800,
                                fontSize: 14,
                                color: cColor,
                              ),
                            ),
                          ),
                      ],
                    ),
                    if (result.communityAnalysis != null) ...[
                      const SizedBox(height: 14),
                      // Visual score bar
                      if (result.communityScore != null) ...[
                        ClipRRect(
                          borderRadius: BorderRadius.circular(6),
                          child: TweenAnimationBuilder<double>(
                            duration: const Duration(milliseconds: 900),
                            curve: Curves.easeOutCubic,
                            tween: Tween(begin: 0.0, end: cScore / 100),
                            builder: (_, v, __) => LinearProgressIndicator(
                              value: v,
                              minHeight: 8,
                              backgroundColor: AppTheme.slate700.withValues(alpha: 0.4),
                              color: cColor,
                            ),
                          ),
                        ),
                        const SizedBox(height: 14),
                      ],
                      MarkdownBody(
                        data: result.communityAnalysis!,
                        selectable: true,
                        styleSheet: MarkdownStyleSheet(
                          p: GoogleFonts.plusJakartaSans(
                            color: ctx.textSecondary,
                            fontSize: 14,
                            height: 1.7,
                          ),
                          strong: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
                            color: ctx.textPrimary,
                          ),
                          blockSpacing: 8,
                        ),
                      ),
                    ],
                  ],
                ),
              );
            },
          ).animate().fadeIn(delay: 100.ms, duration: 400.ms),
          const SizedBox(height: 16),
        ],

        // Overall AI Summary (moved to bottom, uses overallVerdict when available)
        if (result.detailedVerdict.isNotEmpty || result.overallVerdict != null) ...[
          Builder(
            builder: (ctx) {
              final isTr = Localizations.localeOf(ctx).languageCode == 'tr';
              final verdictText = result.overallVerdict ?? result.detailedVerdict;
              return GlassContainer(
                padding: const EdgeInsets.all(22),
                usePrimaryTint: true,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: [AppTheme.premiumPurple, AppTheme.neonPurple],
                            ),
                            borderRadius: BorderRadius.circular(10),
                            boxShadow: [
                              BoxShadow(
                                color: AppTheme.premiumPurple.withValues(alpha: 0.3),
                                blurRadius: 12,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: const Icon(
                            Icons.auto_awesome_rounded,
                            size: 18,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Text(
                          isTr ? 'Genel AI Özeti' : 'Overall AI Summary',
                          style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w700,
                            fontSize: 16,
                            color: ctx.textPrimary,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    MarkdownBody(
                      data: verdictText,
                      selectable: true,
                      styleSheet: MarkdownStyleSheet(
                        p: GoogleFonts.plusJakartaSans(
                          color: ctx.textSecondary,
                          fontSize: 14,
                          height: 1.7,
                        ),
                        strong: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                          color: ctx.textPrimary,
                        ),
                        em: GoogleFonts.plusJakartaSans(
                          fontStyle: FontStyle.italic,
                          fontSize: 14,
                          color: ctx.textSecondary,
                        ),
                        listBullet: GoogleFonts.plusJakartaSans(
                          fontSize: 14,
                          color: ctx.textSecondary,
                        ),
                        blockSpacing: 8,
                      ),
                    ),
                  ],
                ),
              );
            },
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
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: AppTheme.accentCyan.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(
                        Icons.swap_horiz_rounded,
                        color: AppTheme.accentCyan,
                        size: 18,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      context.l10n?.betterAlternatives ?? 'Better Alternatives',
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                        color: context.textPrimary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                ...result.alternatives.map(
                  (alt) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(
                      children: [
                        Container(
                          width: 6,
                          height: 6,
                          decoration: const BoxDecoration(
                            color: AppTheme.accentCyan,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            alt,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 14,
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
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: AppTheme.premiumPurple.withValues(
                              alpha: 0.1,
                            ),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(
                            Icons.inventory_2_rounded,
                            size: 18,
                            color: AppTheme.premiumPurple,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            context.l10n?.similarInDatabase ??
                                'Similar in Our Database',
                            style: GoogleFonts.plusJakartaSans(
                              fontWeight: FontWeight.w700,
                              fontSize: 15,
                              color: context.textPrimary,
                            ),
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: AppTheme.premiumPurple.withValues(
                              alpha: 0.1,
                            ),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            '${similarProducts.length}',
                            style: GoogleFonts.plusJakartaSans(
                              fontWeight: FontWeight.w700,
                              fontSize: 12,
                              color: AppTheme.premiumPurple,
                            ),
                          ),
                        ),
                      ],
                    ),
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
                              color: context.surfaceVariantColor.withValues(
                                alpha: 0.5,
                              ),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: AppTheme.slate700.withValues(alpha: 0.5),
                              ),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    if (product.imageURL.isNotEmpty)
                                      ClipRRect(
                                        borderRadius: BorderRadius.circular(6),
                                        child: Image.network(
                                          product.imageURL,
                                          width: 32,
                                          height: 32,
                                          fit: BoxFit.cover,
                                          errorBuilder: (_, __, ___) =>
                                              Container(
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
                                                  color: AppTheme.slate400,
                                                ),
                                              ),
                                        ),
                                      )
                                    else
                                      Container(
                                        width: 32,
                                        height: 32,
                                        decoration: BoxDecoration(
                                          color: AppTheme.slate700,
                                          borderRadius: BorderRadius.circular(
                                            6,
                                          ),
                                        ),
                                        child: const Icon(
                                          Icons.shopping_bag_rounded,
                                          size: 16,
                                          color: AppTheme.slate400,
                                        ),
                                      ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                        product.techScore.toStringAsFixed(0),
                                        style: GoogleFonts.plusJakartaSans(
                                          fontWeight: FontWeight.w800,
                                          fontSize: 18,
                                          color: AppTheme.primaryBlue,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                const Spacer(),
                                Text(
                                  product.name,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    color: context.textPrimary,
                                    height: 1.2,
                                  ),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
                  ],
                ),
              )
              .animate()
              .fadeIn(delay: 400.ms, duration: 400.ms)
              .slideY(begin: 0.04),
          const SizedBox(height: 16),
        ],

        // Action buttons
        Row(
          children: [
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
                          strokeWidth: 2.5,
                          color: context.surfaceVariantColor,
                        ),
                      )
                    : Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            _isSaved
                                ? Icons.bookmark_rounded
                                : Icons.bookmark_add_rounded,
                            color: context.surfaceVariantColor,
                            size: 20,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            _isSaved
                                ? (context.l10n?.saved ?? 'Saved')
                                : (context.l10n?.save ?? 'Save'),
                            style: GoogleFonts.plusJakartaSans(
                              fontWeight: FontWeight.w700,
                              color: context.surfaceVariantColor,
                              fontSize: 16,
                            ),
                          ),
                        ],
                      ),
              ),
            ),
          ],
        ),
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
            child: const Icon(
              Icons.shopping_bag_outlined,
              size: 44,
              color: AppTheme.slate600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            context.l10n?.productImage ?? 'Product Image',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 12,
              color: AppTheme.slate400,
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------
// MULTI-LINK COMPARE SHEET
// ---------------------------------------------------------------
