/// Qor AI - Score Card Widget
/// Blueprint Section 8.1
///
/// Score display: Total + 4 component breakdown
/// Color coded (green: 80+, orange: 50-79, red: <50)
/// Animated progress bar

import 'package:flutter/material.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/domain/entities/comparison_entity.dart';

class ScoreCard extends StatelessWidget {
  final String productName;
  final ComparisonScore score;
  final bool isWinner;
  final VoidCallback? onTap;

  const ScoreCard({
    super.key,
    required this.productName,
    required this.score,
    this.isWinner = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(AppTheme.borderRadiusMedium),
          border: isWinner
              ? Border.all(color: AppTheme.neonCyan, width: 2)
              : Border.all(color: context.dividerColor, width: 0.5),
          boxShadow: AppTheme.cardShadow,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Title + Winner badge
            Row(
              children: [
                if (isWinner)
                  Container(
                    margin: const EdgeInsets.only(right: 8),
                    child: const Text('🏆', style: TextStyle(fontSize: 20)),
                  ),
                Expanded(
                  child: Text(
                    productName,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                ),
                // Total score badge
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppTheme.getScoreColor(score.total)
                        .withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    score.total.toStringAsFixed(0),
                    style: TextStyle(
                      color: AppTheme.getScoreColor(score.total),
                      fontWeight: FontWeight.w700,
                      fontSize: 18,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Sub-scores
            _ScoreRow(
              label: context.l10n?.scorePersonalFit ?? 'Personal Fit',
              value: score.personalFit,
              weight: '40%',
              color: AppTheme.neonCyan,
            ),
            const SizedBox(height: 8),
            _ScoreRow(
              label: context.l10n?.scoreCommunity ?? 'Community',
              value: score.communityScore,
              weight: '25%',
              color: AppTheme.neonPurple,
            ),
            const SizedBox(height: 8),
            _ScoreRow(
              label: context.l10n?.scoreExpert ?? 'Expert',
              value: score.expertScore,
              weight: '20%',
              color: AppTheme.premiumPurple,
            ),
            const SizedBox(height: 8),
            _ScoreRow(
              label: context.l10n?.scorePriceValue ?? 'Price/Value',
              value: score.valuePrice,
              weight: '15%',
              color: AppTheme.neonPink,
            ),
          ],
        ),
      ),
    );
  }
}

class _ScoreRow extends StatelessWidget {
  final String label;
  final double value;
  final String weight;
  final Color color;

  const _ScoreRow({
    required this.label,
    required this.value,
    required this.weight,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '$label ($weight)',
              style: TextStyle(
                fontSize: 12,
                color: context.textSecondary,
              ),
            ),
            Text(
              value.toStringAsFixed(1),
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ),
        const SizedBox(height: 4),
        ClipRRect(
          borderRadius: BorderRadius.circular(3),
          child: TweenAnimationBuilder<double>(
            tween: Tween(begin: 0, end: value / 100),
            duration: const Duration(milliseconds: 800),
            curve: Curves.easeOutCubic,
            builder: (context, animValue, _) {
              return LinearProgressIndicator(
                value: animValue,
                backgroundColor: context.dividerColor,
                valueColor: AlwaysStoppedAnimation<Color>(color),
                minHeight: 6,
              );
            },
          ),
        ),
      ],
    );
  }
}
