import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:compair/core/pb_client.dart';
import 'package:google_fonts/google_fonts.dart';
import 'dart:math' as math;
import 'package:compair/core/theme.dart';
import 'package:compair/services/behavior_analysis_service.dart';
import 'package:compair/presentation/widgets/glass_container.dart';

final pi = math.pi;

class BehaviorReportScreen extends ConsumerWidget {
  const BehaviorReportScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final uid = pb.authStore.record?.id;

    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        title: Text(
          context.l10n?.behaviorReport ?? 'Behavior Report',
          style: GoogleFonts.plusJakartaSans(
            fontWeight: FontWeight.w700,
            fontSize: 20,
            color: context.textPrimary,
          ),
        ),
        backgroundColor: context.surfaceColor,
        elevation: 0,
        centerTitle: false,
      ),
      body: uid == null
          ? Center(child: Text(context.l10n?.notSignedIn ?? 'Not signed in'))
          : FutureBuilder<BehaviorProfile>(
              future: BehaviorAnalysisService().analyzeBehavior(uid),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (!snapshot.hasData) {
                  return Center(child: Text(context.l10n?.noBehaviorDataYet ?? 'No behavior data yet'));
                }
                final profile = snapshot.data!;
                return _BehaviorReportBody(profile: profile);
              },
            ),
    );
  }
}

class _BehaviorReportBody extends StatelessWidget {
  final BehaviorProfile profile;
  const _BehaviorReportBody({required this.profile});

  @override
  Widget build(BuildContext context) {
    final hasData = profile.categoryInterestScores.isNotEmpty;
    final completeness = hasData
        ? ((profile.strongInterestCategories.length / 5.0) * 100).clamp(0, 100).toInt()
        : 0;

    // Get top 5 categories sorted by score
    final topCategories = (profile.categoryInterestScores.entries.toList()
          ..sort((a, b) => b.value.compareTo(a.value)))
        .take(5)
        .toList();

    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      children: [
        // ─── Header Score Card ───
        _ScoreOverviewCard(
          completeness: completeness,
          purchaseIntent: profile.purchaseIntentScore,
          profileLabel: context.l10n?.profileComplete ?? 'Profile Complete',
        ),
        const SizedBox(height: 24),

        // ─── Category Scores with Circular Indicators ───
        if (hasData) ...[
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 16),
            child: Text(
              context.l10n?.categoryEngagement ?? 'Category Engagement',
              style: GoogleFonts.plusJakartaSans(
                fontWeight: FontWeight.w700,
                fontSize: 18,
                color: context.textPrimary,
              ),
            ),
          ),
          GridView.count(
            crossAxisCount: 2,
            mainAxisSpacing: 12,
            crossAxisSpacing: 12,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            children: topCategories.map((entry) {
              return _CircularScoreCard(
                category: entry.key,
                score: entry.value,
              );
            }).toList(),
          ),
          const SizedBox(height: 24),
        ],

        // ─── Interest Cloud ───
        if (profile.strongInterestCategories.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 12),
            child: Text(
              'Interest Cloud',
              style: GoogleFonts.plusJakartaSans(
                fontWeight: FontWeight.w700,
                fontSize: 18,
                color: context.textPrimary,
              ),
            ),
          ),
          GlassContainer(
            padding: const EdgeInsets.all(16),
            child: _InterestCloud(
              interests: profile.strongInterestCategories,
              scores: profile.categoryInterestScores,
            ),
          ),
          const SizedBox(height: 24),
        ],

        // ─── Detailed Category Breakdown ───
        if (hasData && topCategories.length > 0) ...[
          Padding(
            padding: const EdgeInsets.only(left: 4, bottom: 12),
            child: Text(
              'Score Breakdown',
              style: GoogleFonts.plusJakartaSans(
                fontWeight: FontWeight.w700,
                fontSize: 18,
                color: context.textPrimary,
              ),
            ),
          ),
          ...topCategories.map((entry) {
            return _CategoryScoreBar(
              category: entry.key,
              score: entry.value,
            );
          }).toList(),
          const SizedBox(height: 20),
        ],
      ],
    );
  }
}


/// ═══════════════════════════════════════════════════════════════════════════
/// ════════════════════════  SCORE OVERVIEW CARD  ════════════════════════════
/// ═══════════════════════════════════════════════════════════════════════════

class _ScoreOverviewCard extends StatelessWidget {
  final int completeness;
  final double purchaseIntent;
  final String profileLabel;

  const _ScoreOverviewCard({
    required this.completeness,
    required this.purchaseIntent,
    required this.profileLabel,
  });

  @override
  Widget build(BuildContext context) {
    return GlassContainer(
      usePrimaryTint: true,
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              // Left: Profile Completeness
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      profileLabel,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: context.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: 80,
                      height: 80,
                      child: _GradientCircularProgress(
                        value: completeness / 100.0,
                        size: 80,
                        strokeWidth: 5,
                        gradient: AppTheme.scoreGradient,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '$completeness%',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: context.textPrimary,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 20),
              // Right: Purchase Intent
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Purchase Intent',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: context.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: 80,
                      height: 80,
                      child: _GradientCircularProgress(
                        value: purchaseIntent,
                        size: 80,
                        strokeWidth: 5,
                        gradient: AppTheme.premiumGradient,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${(purchaseIntent * 100).round()}%',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: context.textPrimary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          // Subtitle
          Text(
            'Based on your engagement and browsing behavior',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 12,
              fontWeight: FontWeight.w400,
              color: context.textSecondary,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}

/// ═══════════════════════════════════════════════════════════════════════════
/// ════════════════════  GRADIENT CIRCULAR PROGRESS  ══════════════════════════
/// ═══════════════════════════════════════════════════════════════════════════

class _GradientCircularProgress extends StatelessWidget {
  final double value;
  final double size;
  final double strokeWidth;
  final LinearGradient gradient;

  const _GradientCircularProgress({
    required this.value,
    required this.size,
    required this.strokeWidth,
    required this.gradient,
  });

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size(size, size),
      painter: _GradientCircularProgressPainter(
        value: value.clamp(0, 1),
        strokeWidth: strokeWidth,
        gradient: gradient,
        dividerColor: context.dividerColor,
      ),
      child: Center(
        child: Text(
          '${(value * 100).round()}',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 16,
            fontWeight: FontWeight.w700,
            color: context.textPrimary,
          ),
        ),
      ),
    );
  }
}

class _GradientCircularProgressPainter extends CustomPainter {
  final double value;
  final double strokeWidth;
  final LinearGradient gradient;
  final Color dividerColor;

  _GradientCircularProgressPainter({
    required this.value,
    required this.strokeWidth,
    required this.gradient,
    required this.dividerColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.width - strokeWidth) / 2;

    // Background circle
    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..color = dividerColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth,
    );

    // Gradient progress arc
    final rect = Rect.fromCircle(center: center, radius: radius);
    final paint = Paint()
      ..shader = gradient.createShader(rect)
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    canvas.drawArc(
      rect,
      -pi / 2,
      (2 * pi * value),
      false,
      paint,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => true;
}

/// ═══════════════════════════════════════════════════════════════════════════
/// ═══════════════════════  CIRCULAR SCORE CARD  ════════════════════════════
/// ═══════════════════════════════════════════════════════════════════════════

class _CircularScoreCard extends StatelessWidget {
  final String category;
  final double score;

  const _CircularScoreCard({
    required this.category,
    required this.score,
  });

  @override
  Widget build(BuildContext context) {
    return GlassContainer(
      padding: const EdgeInsets.all(12),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          SizedBox(
            width: 60,
            height: 60,
            child: _GradientCircularProgress(
              value: score,
              size: 60,
              strokeWidth: 4,
              gradient: _getGradientForScore(score),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            category,
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: context.textPrimary,
              height: 1.3,
            ),
          ),
        ],
      ),
    );
  }

  LinearGradient _getGradientForScore(double score) {
    if (score >= 0.7) {
      return AppTheme.scoreGradient; // Green
    } else if (score >= 0.4) {
      return const LinearGradient(
        colors: [AppTheme.scoreAverage, Color(0xFFFFB84D)],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      );
    } else {
      return const LinearGradient(
        colors: [AppTheme.scorePoor, Color(0xFFF87171)],
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      );
    }
  }
}

/// ═══════════════════════════════════════════════════════════════════════════
/// ════════════════════════  INTEREST CLOUD  ════════════════════════════════
/// ═══════════════════════════════════════════════════════════════════════════

class _InterestCloud extends StatelessWidget {
  final List<String> interests;
  final Map<String, double> scores;

  const _InterestCloud({
    required this.interests,
    required this.scores,
  });

  @override
  Widget build(BuildContext context) {
    // Sort interests by score
    final sortedInterests = (interests.toList()
          ..sort((a, b) => (scores[b] ?? 0.0).compareTo(scores[a] ?? 0.0)))
        .take(12)
        .toList();

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      alignment: WrapAlignment.center,
      children: sortedInterests.map((interest) {
        final score = scores[interest] ?? 0.0;
        final sizeIndex = _getSizeIndex(score);
        final color = _getColorForScore(score);

        return _InterestChip(
          label: interest,
          score: score,
          sizeIndex: sizeIndex,
          color: color,
        );
      }).toList(),
    );
  }

  int _getSizeIndex(double score) {
    if (score >= 0.75) return 3; // Large
    if (score >= 0.5) return 2;  // Medium
    return 1; // Small
  }

  Color _getColorForScore(double score) {
    if (score >= 0.75) return AppTheme.primaryBlue;
    if (score >= 0.5) return AppTheme.accentCyan;
    return AppTheme.slate400;
  }
}

class _InterestChip extends StatelessWidget {
  final String label;
  final double score;
  final int sizeIndex; // 1: small, 2: medium, 3: large
  final Color color;

  const _InterestChip({
    required this.label,
    required this.score,
    required this.sizeIndex,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final sizes = [11.0, 12.0, 13.0, 14.0];
    final paddings = [
      const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
      const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
    ];

    final fontSize = sizes[sizeIndex.clamp(1, 3)];
    final padding = paddings[sizeIndex.clamp(1, 3)];

    return Container(
      padding: padding,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            color.withValues(alpha: 0.15),
            color.withValues(alpha: 0.08),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: color.withValues(alpha: 0.3),
          width: 1,
        ),
      ),
      child: Text(
        label,
        style: GoogleFonts.plusJakartaSans(
          fontSize: fontSize,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }
}

/// ═══════════════════════════════════════════════════════════════════════════
/// ════════════════════  CATEGORY SCORE BAR  ═════════════════════════════════
/// ═══════════════════════════════════════════════════════════════════════════

class _CategoryScoreBar extends StatelessWidget {
  final String category;
  final double score;

  const _CategoryScoreBar({
    required this.category,
    required this.score,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GlassContainer(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    category,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: context.textPrimary,
                    ),
                  ),
                ),
                Text(
                  '${(score * 100).round()}%',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.primaryBlue,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: score,
                backgroundColor: context.dividerColor,
                valueColor: AlwaysStoppedAnimation(
                  _getGradientColor(score),
                ),
                minHeight: 6,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Color _getGradientColor(double score) {
    if (score >= 0.7) return AppTheme.scoreExcellent;
    if (score >= 0.4) return AppTheme.scoreAverage;
    return AppTheme.scorePoor;
  }
}
