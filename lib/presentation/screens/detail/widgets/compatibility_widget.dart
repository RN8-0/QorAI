part of '../product_detail_screen.dart';

// ═══════════════════════════════════════════════════════════
// USER COMPATIBILITY CARD (new)
// ═══════════════════════════════════════════════════════════

// ignore: unused_element
class _CompatibilityCard extends ConsumerWidget {
  final ProductEntity product;
  final bool isDark;
  final Color cardBg;
  const _CompatibilityCard({required this.product, required this.isDark, required this.cardBg});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(userProfileProvider);
    final user = userAsync.valueOrNull;
    if (user == null || !user.quizCompleted) return const SizedBox.shrink();

    // Use Gemini match score (same as _ScoreDuo)
    final matchAsync = ref.watch(
      geminiMatchScoreProvider(
        LocalizedProductKey(
          productId: product.id,
          languageCode: Localizations.localeOf(context).languageCode,
        ),
      ),
    );
    final matchResult = matchAsync.valueOrNull;
    
    if (matchResult == null) return const SizedBox.shrink();

    final fitScore = matchResult.matchScore.toDouble();
    if (fitScore <= 0) return const SizedBox.shrink();

    final reason = matchResult.reason;

    final color = fitScore >= 80
        ? AppTheme.scoreExcellent
        : fitScore >= 60
            ? AppTheme.warning
            : AppTheme.error;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [color.withValues(alpha: 0.05), color.withValues(alpha: 0.1)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              SizedBox(
                width: 56,
                height: 56,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    SizedBox(
                      width: 56,
                      height: 56,
                      child: CircularProgressIndicator(
                        value: fitScore / 100,
                        strokeWidth: 5,
                        backgroundColor: color.withValues(alpha: 0.15),
                        valueColor: AlwaysStoppedAnimation<Color>(color),
                      ),
                    ),
                    Text(
                      '${fitScore.toInt()}%',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: color,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Your Match',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: context.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      reason.isNotEmpty ? reason :
                      fitScore >= 80
                          ? 'Great match for your preferences!'
                          : fitScore >= 60
                              ? 'Good match, with some trade-offs'
                              : 'May not fit your preferences well',
                      style: TextStyle(
                        fontSize: 12,
                        color: isDark ? AppTheme.slate400 : AppTheme.slate600,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              Icon(
                fitScore >= 70 ? Icons.thumb_up : Icons.thumbs_up_down,
                color: color,
                size: 24,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
