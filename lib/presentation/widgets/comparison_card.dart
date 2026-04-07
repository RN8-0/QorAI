/// Compair - Comparison Card Widget
/// Blueprint Section 8
///
/// Comparison summary card
/// VS mode view
/// Quick score display

import 'package:flutter/material.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/domain/entities/comparison_entity.dart';

class ComparisonCard extends StatelessWidget {
  final ComparisonEntity comparison;
  final VoidCallback? onTap;

  const ComparisonCard({
    super.key,
    required this.comparison,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final items = comparison.productIds;
    final scores = comparison.scores;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(AppTheme.borderRadiusMedium),
          border: Border.all(
            color: AppTheme.brandCyan.withValues(alpha: 0.12),
            width: 0.8,
          ),
          boxShadow: [
            ...AppTheme.cardShadow,
            BoxShadow(
              color: AppTheme.brandCyan.withValues(alpha: 0.06),
              blurRadius: 12,
              spreadRadius: -2,
            ),
          ],
        ),
        child: Column(
          children: [
            // VS Header
            Row(
              children: items.map((id) {
                return Expanded(
                  child: Column(
                    children: [
                      CircleAvatar(
                        radius: 24,
                        backgroundColor: id == comparison.winnerId
                            ? AppTheme.warning
                            : context.surfaceVariantColor,
                        child: id == comparison.winnerId
                            ? const Text('🏆', style: TextStyle(fontSize: 20))
                            : Text(
                                id.substring(0, 1).toUpperCase(),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        id,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                        textAlign: TextAlign.center,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 4),
                      if (scores.containsKey(id))
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: AppTheme.getScoreColor(scores[id]!.total)
                                .withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            scores[id]!.total.toStringAsFixed(0),
                            style: TextStyle(
                              color:
                                  AppTheme.getScoreColor(scores[id]!.total),
                              fontWeight: FontWeight.w700,
                              fontSize: 14,
                            ),
                          ),
                        ),
                    ],
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 12),
            const Divider(),
            const SizedBox(height: 8),

            // Footer
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  comparison.categoryId.isEmpty ? (context.l10n?.comparisonCategoryGeneral ?? 'General') : comparison.categoryId,
                  style: TextStyle(
                    color: context.textTertiaryColor,
                    fontSize: 12,
                  ),
                ),
                Row(
                  children: [
                    Icon(
                      Icons.auto_awesome,
                      size: 14,
                      color: AppTheme.primaryBlue.withValues(alpha: 0.7),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      context.l10n?.comparisonBadgeAiAnalysis ?? 'AI Analysis',
                      style: TextStyle(
                        color: AppTheme.primaryBlue.withValues(alpha: 0.7),
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
