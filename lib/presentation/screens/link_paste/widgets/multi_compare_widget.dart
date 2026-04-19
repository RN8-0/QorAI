part of '../link_paste_screen.dart';

/// Image widget for link analysis results — hides itself if image fails to load.
class _LinkAnalysisImage extends StatefulWidget {
  final String imageUrl;
  final BorderRadius borderRadius;

  const _LinkAnalysisImage({
    required this.imageUrl,
    required this.borderRadius,
  });

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
      child: Container(
        color: Colors.white,
        width: double.infinity,
        height: 200,
        child: Image.network(
          widget.imageUrl,
          height: 200,
          width: double.infinity,
          fit: BoxFit.contain,
          errorBuilder: (_, __, ___) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) setState(() => _hidden = true);
            });
            return const SizedBox.shrink();
          },
        ),
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
          _error =
              context.l10n?.pleaseSignInFirst ??
              _linkText(
                context,
                tr: 'Devam etmek icin once giris yapin.',
                en: 'Please sign in first.',
              );
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
        await ref
            .read(linkQuizProvider.notifier)
            .analyzeAndStartQuiz(url, user);
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
      if (mounted) {
        setState(
          () => _error = _linkText(
            context,
            tr: 'Karsilastirma icin en az 2 urun gerekiyor.',
            en: 'Need at least 2 products to compare.',
          ),
        );
      }
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
          _error =
              '${_linkText(context, tr: 'AI karsilastirmasi basarisiz', en: 'AI comparison failed')}: '
              '${e.toString().length > 80 ? e.toString().substring(0, 80) : e}';
        });
      }
    }
  }

  String _buildAiComparison(
    List<EnhancedAnalysisResult> results,
    Set<String> categories,
  ) {
    final isSameCategory = categories.length <= 1;
    final buf = StringBuffer();

    buf.writeln(
      isSameCategory
          ? '## ${_linkText(context, tr: 'Ayni Kategori Karsilastirmasi', en: 'Same-Category Comparison')}'
          : '## ${_linkText(context, tr: 'Kategoriler Arasi Karsilastirma', en: 'Cross-Category Comparison')}',
    );
    buf.writeln('');

    // Rank by score
    final sorted = List<EnhancedAnalysisResult>.from(results)
      ..sort((a, b) => b.enhancedScore.compareTo(a.enhancedScore));

    for (int i = 0; i < sorted.length; i++) {
      final r = sorted[i];
      final title =
          r.baseResult.metadata.title ??
          '${context.l10n?.productLabel ?? 'Product'} ${i + 1}';
      final medal = i == 0 ? '🥇' : (i == 1 ? '🥈' : (i == 2 ? '🥉' : ''));
      buf.writeln('$medal **#${i + 1} $title**');
      buf.writeln(
        '${context.l10n?.matchScoreLabel ?? _linkText(context, tr: 'Eslesme Puani', en: 'Match Score')}: ${r.enhancedScore.toStringAsFixed(0)}%',
      );
      if (r.prosForUser.isNotEmpty) {
        buf.writeln('✅ ${r.prosForUser.first}');
      }
      if (r.consForUser.isNotEmpty) {
        buf.writeln('⚠️ ${r.consForUser.first}');
      }
      buf.writeln('');
    }

    buf.writeln('---');
    buf.writeln(
      '**${_linkText(context, tr: 'Sizin icin en iyi secim', en: 'Best for you')}:** ${sorted.first.baseResult.metadata.title ?? (context.l10n?.productLabel ?? 'Product')}',
    );
    buf.writeln(
      _linkText(
        context,
        tr: 'Profiliniz, oncelikleriniz ve butceniz baz alindi.',
        en: 'Based on your profile, preferences, and budget.',
      ),
    );

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
                    child: Icon(
                      Icons.compare_arrows_rounded,
                      color: context.surfaceVariantColor,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          context.l10n?.multiLinkCompare ??
                              'Multi-Link Compare',
                          style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w800,
                            fontSize: 18,
                            color: context.textPrimary,
                          ),
                        ),
                        Text(
                          context.l10n?.addLinksToFindBest ??
                              'Add links to find your best match',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13,
                            color: context.textSecondary,
                          ),
                        ),
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
                          result.baseResult.metadata.title ??
                              'Product ${i + 1}',
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
                            const Icon(
                              Icons.error_outline_rounded,
                              color: AppTheme.error,
                              size: 18,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _error!,
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 13,
                                  color: AppTheme.error,
                                ),
                              ),
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
                          gradient: LinearGradient(
                            colors: [
                              AppTheme.primaryBlue.withValues(alpha: 0.08),
                              AppTheme.neonPurple.withValues(alpha: 0.05),
                            ],
                          ),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: AppTheme.primaryBlue.withValues(alpha: 0.15),
                          ),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2.5,
                                color: AppTheme.primaryBlue,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Text(
                              _isComparing
                                  ? (context.l10n?.aiComparing ??
                                        'AI comparing products...')
                                  : _linkText(
                                      context,
                                      tr: 'Urun analiz ediliyor ${_analyzingIndex + 1}/${widget.allUrls.length}...',
                                      en: 'Analyzing product ${_analyzingIndex + 1}/${widget.allUrls.length}...',
                                    ),
                              style: GoogleFonts.plusJakartaSans(
                                fontWeight: FontWeight.w600,
                                fontSize: 14,
                                color: context.textPrimary,
                              ),
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
                    ? [AppTheme.gold, AppTheme.goldOrange]
                    : [
                        AppTheme.primaryBlue.withValues(alpha: 0.15),
                        AppTheme.primaryBlue.withValues(alpha: 0.05),
                      ],
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
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [AppTheme.gold, AppTheme.goldOrange],
                      ),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      context.l10n?.bestMatch ?? 'Best Match',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: context.surfaceVariantColor,
                      ),
                    ),
                  ),
                Text(
                  name,
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                    color: context.textPrimary,
                  ),
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
            child: Text(
              '${score.toStringAsFixed(0)}%',
              style: GoogleFonts.plusJakartaSans(
                fontWeight: FontWeight.w800,
                fontSize: 14,
                color: scoreColor,
              ),
            ),
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
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppTheme.primaryBlue,
                    ),
                  )
                : Icon(Icons.link_rounded, size: 18, color: AppTheme.slate400),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isCurrentlyAnalyzing
                      ? _linkText(
                          context,
                          tr: 'Analiz ediliyor...',
                          en: 'Analyzing...',
                        )
                      : _linkText(
                          context,
                          tr: 'Bekleniyor...',
                          en: 'Waiting...',
                        ),
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                    color: context.textPrimary,
                  ),
                ),
                Text(
                  Uri.tryParse(url)?.host ?? url,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 11,
                    color: context.textSecondary,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildComparisonResult() {
    final allResults = _results
        .where((r) => r != null)
        .cast<EnhancedAnalysisResult>()
        .toList();

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
                        colors: [AppTheme.gold, AppTheme.goldOrange],
                      ),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(
                      Icons.emoji_events_rounded,
                      color: context.surfaceVariantColor,
                      size: 18,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    context.l10n?.aiRanking ?? 'AI Ranking',
                    style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                      color: context.textPrimary,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              ...List.generate(sorted.length, (i) {
                final r = sorted[i];
                final title =
                    r.baseResult.metadata.title ??
                    '${context.l10n?.productLabel ?? 'Product'} ${i + 1}';
                final medal = i == 0
                    ? '🥇'
                    : (i == 1 ? '🥈' : (i == 2 ? '🥉' : ''));
                final scoreColor = r.enhancedScore >= 80
                    ? AppTheme.scoreExcellent
                    : (r.enhancedScore >= 60
                          ? AppTheme.scoreGood
                          : AppTheme.scoreAverage);
                final isBest = i == 0;

                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: isBest
                        ? AppTheme.gold.withValues(alpha: 0.06)
                        : context.surfaceVariantColor,
                    borderRadius: BorderRadius.circular(14),
                    border: isBest
                        ? Border.all(
                            color: AppTheme.gold.withValues(alpha: 0.3),
                          )
                        : null,
                  ),
                  child: Row(
                    children: [
                      Text(
                        medal.isNotEmpty ? medal : '${i + 1}',
                        style: GoogleFonts.plusJakartaSans(fontSize: 20),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              title,
                              style: GoogleFonts.plusJakartaSans(
                                fontWeight: FontWeight.w700,
                                fontSize: 13,
                                color: context.textPrimary,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),

                            if (r.prosForUser.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Text(
                                  '✅ ${r.prosForUser.first}',
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 11,
                                    color: AppTheme.success,
                                  ),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: scoreColor.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          '${r.enhancedScore.toStringAsFixed(0)}%',
                          style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w800,
                            fontSize: 14,
                            color: scoreColor,
                          ),
                        ),
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
                  const Icon(
                    Icons.auto_awesome_rounded,
                    color: AppTheme.primaryBlue,
                    size: 20,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    context.l10n?.aiVerdict ?? 'AI Verdict',
                    style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                      color: context.textPrimary,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                _linkText(
                  context,
                  tr: '${sorted.first.baseResult.metadata.title ?? (context.l10n?.productLabel ?? 'Urun')} sizin icin en iyi eslesme; uyumluluk puani ${sorted.first.enhancedScore.toStringAsFixed(0)}%.',
                  en: '${sorted.first.baseResult.metadata.title ?? (context.l10n?.productLabel ?? 'Product')} is your best match with a ${sorted.first.enhancedScore.toStringAsFixed(0)}% compatibility score.',
                ),
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 14,
                  color: context.textPrimary,
                  height: 1.5,
                ),
              ),
              if (sorted.length > 1) ...[
                const SizedBox(height: 8),
                Text(
                  _linkText(
                    context,
                    tr: 'En iyi ve en dusuk eslesme arasinda ${(sorted.first.enhancedScore - sorted.last.enhancedScore).toStringAsFixed(0)} puan fark var.',
                    en: 'Score difference: ${(sorted.first.enhancedScore - sorted.last.enhancedScore).toStringAsFixed(0)} points between best and worst match.',
                  ),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 13,
                    color: context.textSecondary,
                    height: 1.4,
                  ),
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
