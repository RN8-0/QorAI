import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qor_ai/core/pb_client.dart';
import 'package:google_fonts/google_fonts.dart';
import 'dart:math' as math;
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/services/behavior_analysis_service.dart';

const double _twoPi = math.pi * 2;
const double _pi = math.pi;

String _t(BuildContext context, {required String en, required String tr}) {
  return Localizations.localeOf(context).languageCode == 'tr' ? tr : en;
}

class BehaviorReportScreen extends ConsumerWidget {
  const BehaviorReportScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final uid = pb.authStore.record?.id;

    return Scaffold(
      backgroundColor: context.backgroundColor,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: Text(
          context.l10n?.behaviorReport ?? 'Behavior Report',
          style: GoogleFonts.plusJakartaSans(
            fontWeight: FontWeight.w700,
            fontSize: 20,
            color: context.textPrimary,
          ),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
      ),
      body: uid == null
          ? Center(child: Text(context.l10n?.notSignedIn ?? 'Not signed in'))
          : FutureBuilder<BehaviorProfile>(
              future: BehaviorAnalysisService().analyzeBehavior(uid),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return _LoadingShimmer();
                }
                if (!snapshot.hasData) {
                  return _EmptyState();
                }
                return _BehaviorReportBody(profile: snapshot.data!);
              },
            ),
    );
  }
}

// ─── Loading Shimmer ─────────────────────────────────────────────────────────

class _LoadingShimmer extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 104, 16, 24),
      children: List.generate(
        5,
        (i) => Container(
          margin: const EdgeInsets.only(bottom: 16),
          height: i == 0 ? 140 : (i == 1 ? 180 : (i == 2 ? 200 : 120)),
          decoration: BoxDecoration(
            color: context.surfaceVariantColor,
            borderRadius: BorderRadius.circular(20),
          ),
        )
            .animate(onPlay: (c) => c.repeat())
            .shimmer(
              duration: 1200.ms,
              color: context.dividerColor.withValues(alpha: 0.3),
            ),
      ),
    );
  }
}

// ─── Empty State ─────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(
                colors: [
                  AppTheme.premiumBase.withValues(alpha: 0.18),
                  Colors.transparent,
                ],
              ),
            ),
            child: Icon(
              Icons.analytics_outlined,
              size: 64,
              color: AppTheme.premiumBase,
            ),
          )
              .animate(onPlay: (c) => c.repeat(reverse: true))
              .scale(
                begin: const Offset(0.95, 0.95),
                end: const Offset(1.05, 1.05),
                duration: 1800.ms,
                curve: Curves.easeInOut,
              ),
          const SizedBox(height: 16),
          Text(
            _t(context, en: 'No behavior data yet', tr: 'Henuz davranis verisi yok'),
            style: GoogleFonts.plusJakartaSans(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: context.textPrimary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _t(
              context,
              en: 'Start browsing products to see insights',
              tr: 'Urunlere goz atarak icgoruleri gorun',
            ),
            style: GoogleFonts.plusJakartaSans(
              fontSize: 13,
              color: context.textTertiaryColor,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Main Body ───────────────────────────────────────────────────────────────

class _BehaviorReportBody extends StatelessWidget {
  final BehaviorProfile profile;
  const _BehaviorReportBody({required this.profile});

  @override
  Widget build(BuildContext context) {
    final hasData = profile.categoryInterestScores.isNotEmpty;
    final completeness = profile.profileCompletenessScore;
    final purchaseIntent = profile.purchaseIntentScore;
    final topCategories =
        (profile.categoryInterestScores.entries.toList()
              ..sort((a, b) => b.value.compareTo(a.value)))
            .take(6)
            .toList();
    final recentCount = profile.recentlyViewedProductIds.length;
    final totalCategories = profile.categoryInterestScores.length;
    final strongCount = profile.strongInterestCategories.length;

    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Stack(
      children: [
        // Ambient background glows
        Positioned(
          top: -80,
          right: -60,
          child: _GlowOrb(
            size: 260,
            color: AppTheme.premiumBase.withValues(alpha: isDark ? 0.14 : 0.08),
          ),
        ),
        Positioned(
          top: 260,
          left: -50,
          child: _GlowOrb(
            size: 200,
            color: AppTheme.brandCyan.withValues(alpha: isDark ? 0.10 : 0.06),
          ),
        ),
        Positioned(
          top: 600,
          right: -40,
          child: _GlowOrb(
            size: 180,
            color: AppTheme.brandBlue.withValues(alpha: isDark ? 0.09 : 0.05),
          ),
        ),

        ListView(
          padding: const EdgeInsets.fromLTRB(16, 104, 16, 32),
          children: [
            // ─── Hero Snapshot ───
            _HeroSnapshotCard(
              completeness: completeness,
              purchaseIntent: purchaseIntent,
              topCategories: totalCategories,
              strongInterests: strongCount,
              recentProducts: recentCount,
            )
                .animate()
                .fadeIn(duration: 600.ms)
                .moveY(begin: 24, end: 0, curve: Curves.easeOutCubic),

            const SizedBox(height: 20),

            // ─── Score Rings ───
            _ScoreRingsSection(
              completeness: completeness,
              purchaseIntent: purchaseIntent,
            )
                .animate()
                .fadeIn(duration: 500.ms, delay: 120.ms)
                .moveY(begin: 18, end: 0, curve: Curves.easeOutCubic),

            const SizedBox(height: 24),

            // ─── Purchase Readiness Gauge ───
            _SectionHeader(
              icon: Icons.speed_rounded,
              gradient: LinearGradient(
                colors: [
                  AppTheme.scoreExcellent.withValues(alpha: 0.18),
                  AppTheme.scoreAverage.withValues(alpha: 0.10),
                ],
              ),
              iconColor: AppTheme.scoreExcellent,
              title: _t(
                context,
                en: 'Purchase Readiness',
                tr: 'Satin Alma Hazirligi',
              ),
              subtitle: _t(
                context,
                en: 'How close you are to your next purchase',
                tr: 'Bir sonraki alisverise ne kadar yakinsin',
              ),
              delay: 200,
            ),
            _PurchaseReadinessGauge(value: purchaseIntent)
                .animate()
                .fadeIn(duration: 500.ms, delay: 260.ms)
                .moveY(begin: 14, end: 0),
            const SizedBox(height: 26),

            // ─── Category Engagement ───
            if (hasData) ...[
              _SectionHeader(
                icon: Icons.category_rounded,
                gradient: LinearGradient(
                  colors: [
                    AppTheme.brandBlue.withValues(alpha: 0.18),
                    AppTheme.brandCyan.withValues(alpha: 0.10),
                  ],
                ),
                iconColor: AppTheme.brandBlue,
                title: _t(
                  context,
                  en: 'Category Engagement',
                  tr: 'Kategori Etkilesimi',
                ),
                subtitle: _t(
                  context,
                  en: 'Where your curiosity lives',
                  tr: 'Ilginin en cok oldugu alanlar',
                ),
                delay: 340,
              ),

              GridView.count(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.05,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: List.generate(topCategories.length, (i) {
                  final entry = topCategories[i];
                  return _AnimatedCategoryCard(
                    category: entry.key,
                    score: entry.value,
                    index: i,
                  )
                      .animate()
                      .fadeIn(duration: 400.ms, delay: (400 + i * 80).ms)
                      .scale(
                        begin: const Offset(0.85, 0.85),
                        end: const Offset(1, 1),
                        delay: (400 + i * 80).ms,
                        duration: 400.ms,
                        curve: Curves.easeOutBack,
                      );
                }),
              ),
              const SizedBox(height: 26),
            ],

            // ─── Interest Cloud ───
            if (profile.strongInterestCategories.isNotEmpty) ...[
              _SectionHeader(
                icon: Icons.bubble_chart_rounded,
                gradient: LinearGradient(
                  colors: [
                    AppTheme.premiumBase.withValues(alpha: 0.18),
                    AppTheme.premiumLight.withValues(alpha: 0.10),
                  ],
                ),
                iconColor: AppTheme.premiumBase,
                title: _t(context, en: 'Interest Cloud', tr: 'Ilgi Bulutu'),
                subtitle: _t(
                  context,
                  en: 'Stronger topics appear larger',
                  tr: 'Guclu konular daha buyuk gorunur',
                ),
                delay: 540,
              ),
              _InterestCloudCard(
                interests: profile.strongInterestCategories,
                scores: profile.categoryInterestScores,
              )
                  .animate()
                  .fadeIn(duration: 500.ms, delay: 600.ms)
                  .moveY(begin: 12, end: 0),
              const SizedBox(height: 26),
            ],

            // ─── Activity Pulse ───
            _SectionHeader(
              icon: Icons.favorite_rounded,
              gradient: LinearGradient(
                colors: [
                  AppTheme.scorePoor.withValues(alpha: 0.18),
                  AppTheme.brandBlue.withValues(alpha: 0.08),
                ],
              ),
              iconColor: AppTheme.scorePoor,
              title: _t(context, en: 'Activity Pulse', tr: 'Aktivite Nabzi'),
              subtitle: _t(
                context,
                en: 'A snapshot of your recent footprint',
                tr: 'Son hareketlerinin bir ozeti',
              ),
              delay: 700,
            ),
            _ActivityPulseStrip(
              recentProducts: recentCount,
              totalCategories: totalCategories,
              strongInterests: strongCount,
              readiness: purchaseIntent,
            )
                .animate()
                .fadeIn(duration: 500.ms, delay: 760.ms)
                .moveY(begin: 12, end: 0),
            const SizedBox(height: 26),

            // ─── Score Breakdown ───
            if (hasData && topCategories.isNotEmpty) ...[
              _SectionHeader(
                icon: Icons.bar_chart_rounded,
                gradient: LinearGradient(
                  colors: [
                    AppTheme.success.withValues(alpha: 0.16),
                    AppTheme.scoreExcellent.withValues(alpha: 0.08),
                  ],
                ),
                iconColor: AppTheme.success,
                title: _t(context, en: 'Score Breakdown', tr: 'Skor Dagilimi'),
                subtitle: _t(
                  context,
                  en: 'Relative weight per category',
                  tr: 'Kategoriye gore goreceli agirlik',
                ),
                delay: 880,
              ),
              ...List.generate(topCategories.length, (i) {
                final entry = topCategories[i];
                return _AnimatedScoreBar(
                  category: entry.key,
                  score: entry.value,
                  delay: 940 + i * 60,
                );
              }),
              const SizedBox(height: 26),
            ],

            // ─── Personalized Insights ───
            _SectionHeader(
              icon: Icons.auto_awesome_rounded,
              gradient: const LinearGradient(
                colors: [
                  Color(0x337C3AED),
                  Color(0x2200E5FF),
                ],
              ),
              iconColor: AppTheme.premiumBase,
              title: _t(context, en: 'Personalized Tips', tr: 'Kisisel Oneriler'),
              subtitle: _t(
                context,
                en: 'Smart nudges based on your profile',
                tr: 'Profiline gore akilli oneriler',
              ),
              delay: 1080,
            ),
            _InsightsSummaryCard(
              completeness: completeness,
              purchaseIntent: purchaseIntent,
              strongInterests: strongCount,
              recentProducts: recentCount,
            )
                .animate()
                .fadeIn(duration: 500.ms, delay: 1140.ms)
                .moveY(begin: 12, end: 0),
          ],
        ),
      ],
    );
  }
}

// ─── Shared: Section Header ──────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  final IconData icon;
  final LinearGradient gradient;
  final Color iconColor;
  final String title;
  final String subtitle;
  final int delay;

  const _SectionHeader({
    required this.icon,
    required this.gradient,
    required this.iconColor,
    required this.title,
    required this.subtitle,
    required this.delay,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 14, top: 2),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(9),
            decoration: BoxDecoration(
              gradient: gradient,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, size: 18, color: iconColor),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w800,
                    fontSize: 17,
                    color: context.textPrimary,
                    letterSpacing: -0.2,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    height: 1.35,
                    color: context.textTertiaryColor,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    )
        .animate()
        .fadeIn(duration: 400.ms, delay: delay.ms)
        .moveX(begin: -10, end: 0, duration: 400.ms, delay: delay.ms);
  }
}

// ─── Shared: Glow Orb ────────────────────────────────────────────────────────

class _GlowOrb extends StatelessWidget {
  final double size;
  final Color color;
  const _GlowOrb({required this.size, required this.color});

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(
            colors: [color, Colors.transparent],
          ),
        ),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 50, sigmaY: 50),
          child: const SizedBox(),
        ),
      )
          .animate(onPlay: (c) => c.repeat(reverse: true))
          .scale(
            begin: const Offset(0.95, 0.95),
            end: const Offset(1.08, 1.08),
            duration: 3200.ms,
            curve: Curves.easeInOut,
          ),
    );
  }
}

// ─── Hero Snapshot Card ──────────────────────────────────────────────────────

class _HeroSnapshotCard extends StatefulWidget {
  final int completeness;
  final double purchaseIntent;
  final int topCategories;
  final int strongInterests;
  final int recentProducts;

  const _HeroSnapshotCard({
    required this.completeness,
    required this.purchaseIntent,
    required this.topCategories,
    required this.strongInterests,
    required this.recentProducts,
  });

  @override
  State<_HeroSnapshotCard> createState() => _HeroSnapshotCardState();
}

class _HeroSnapshotCardState extends State<_HeroSnapshotCard>
    with SingleTickerProviderStateMixin {
  late AnimationController _shimmer;

  @override
  void initState() {
    super.initState();
    _shimmer = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3800),
    )..repeat();
  }

  @override
  void dispose() {
    _shimmer.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final intentPct = (widget.purchaseIntent * 100).round();

    return Container(
      padding: const EdgeInsets.fromLTRB(18, 20, 18, 18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppTheme.premiumDeep.withValues(alpha: 0.22),
            AppTheme.premiumBase.withValues(alpha: 0.14),
            AppTheme.brandCyan.withValues(alpha: 0.08),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: AppTheme.premiumBase.withValues(alpha: 0.18),
        ),
        boxShadow: [
          BoxShadow(
            color: AppTheme.premiumBase.withValues(alpha: 0.12),
            blurRadius: 28,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Stack(
        children: [
          // Shimmering gradient sweep
          Positioned.fill(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: AnimatedBuilder(
                animation: _shimmer,
                builder: (_, __) {
                  return CustomPaint(
                    painter: _SweepPainter(progress: _shimmer.value),
                  );
                },
              ),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 54,
                    height: 54,
                    decoration: BoxDecoration(
                      gradient: AppTheme.premiumGradient,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: AppTheme.premiumBase.withValues(alpha: 0.4),
                          blurRadius: 16,
                          offset: const Offset(0, 6),
                        ),
                      ],
                    ),
                    child: const Icon(
                      Icons.insights_rounded,
                      color: Colors.white,
                      size: 28,
                    ),
                  )
                      .animate(onPlay: (c) => c.repeat(reverse: true))
                      .scale(
                        begin: const Offset(1, 1),
                        end: const Offset(1.05, 1.05),
                        duration: 1600.ms,
                        curve: Curves.easeInOut,
                      ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _t(
                            context,
                            en: 'Personal Insight Snapshot',
                            tr: 'Kisisel Icgoru Ozeti',
                          ),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 17,
                            fontWeight: FontWeight.w800,
                            color: context.textPrimary,
                            letterSpacing: -0.3,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _t(
                            context,
                            en: 'Interests, intent, and profile strength.',
                            tr: 'Ilgi alanlarin, niyetin ve profil gucun.',
                          ),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12,
                            height: 1.4,
                            color: context.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              // Live stat pills
              Row(
                children: [
                  Expanded(
                    child: _HeroStatPill(
                      label: _t(context, en: 'Profile', tr: 'Profil'),
                      value: '${widget.completeness}%',
                      color: AppTheme.scoreExcellent,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _HeroStatPill(
                      label: _t(context, en: 'Intent', tr: 'Niyet'),
                      value: '$intentPct%',
                      color: AppTheme.premiumBase,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _HeroStatPill(
                      label: _t(context, en: 'Focus', tr: 'Odak'),
                      value: '${widget.strongInterests}',
                      color: AppTheme.brandCyan,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _HeroStatPill(
                      label: _t(context, en: 'Recent', tr: 'Son'),
                      value: '${widget.recentProducts}',
                      color: AppTheme.brandBlue,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _HeroStatPill extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _HeroStatPill({
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            color.withValues(alpha: 0.14),
            color.withValues(alpha: 0.05),
          ],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      child: Column(
        children: [
          Text(
            value,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: color,
              letterSpacing: -0.4,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              color: context.textTertiaryColor,
              letterSpacing: 0.4,
            ),
          ),
        ],
      ),
    );
  }
}

class _SweepPainter extends CustomPainter {
  final double progress;
  _SweepPainter({required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final dx = size.width * (progress * 2 - 0.5);
    final shader = LinearGradient(
      colors: [
        Colors.transparent,
        Colors.white.withValues(alpha: 0.06),
        Colors.transparent,
      ],
      stops: const [0.0, 0.5, 1.0],
      begin: Alignment.centerLeft,
      end: Alignment.centerRight,
    ).createShader(
      Rect.fromLTWH(dx - size.width * 0.5, 0, size.width, size.height),
    );
    canvas.drawRect(rect, Paint()..shader = shader);
  }

  @override
  bool shouldRepaint(covariant _SweepPainter old) => old.progress != progress;
}

// ─── Score Rings Section ─────────────────────────────────────────────────────

class _ScoreRingsSection extends StatelessWidget {
  final int completeness;
  final double purchaseIntent;

  const _ScoreRingsSection({
    required this.completeness,
    required this.purchaseIntent,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: _AnimatedRingCard(
            label: _t(context, en: 'Profile Complete', tr: 'Profil Tamamlanma'),
            value: completeness / 100.0,
            displayValue: '$completeness%',
            gradient: AppTheme.scoreGradient,
            accent: AppTheme.scoreExcellent,
            icon: Icons.person_rounded,
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _AnimatedRingCard(
            label: _t(context, en: 'Purchase Intent', tr: 'Satin Alma Niyeti'),
            value: purchaseIntent,
            displayValue: '${(purchaseIntent * 100).round()}%',
            gradient: AppTheme.premiumGradient,
            accent: AppTheme.premiumBase,
            icon: Icons.shopping_bag_rounded,
          ),
        ),
      ],
    );
  }
}

class _AnimatedRingCard extends StatefulWidget {
  final String label;
  final double value;
  final String displayValue;
  final LinearGradient gradient;
  final Color accent;
  final IconData icon;

  const _AnimatedRingCard({
    required this.label,
    required this.value,
    required this.displayValue,
    required this.gradient,
    required this.accent,
    required this.icon,
  });

  @override
  State<_AnimatedRingCard> createState() => _AnimatedRingCardState();
}

class _AnimatedRingCardState extends State<_AnimatedRingCard>
    with TickerProviderStateMixin {
  late AnimationController _progress;
  late AnimationController _pulse;
  late Animation<double> _progressAnim;

  @override
  void initState() {
    super.initState();
    _progress = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1300),
    );
    _progressAnim = Tween<double>(begin: 0, end: widget.value).animate(
      CurvedAnimation(parent: _progress, curve: Curves.easeOutCubic),
    );
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..repeat(reverse: true);
    Future.delayed(const Duration(milliseconds: 400), () {
      if (mounted) _progress.forward();
    });
  }

  @override
  void dispose() {
    _progress.dispose();
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: widget.accent.withValues(alpha: 0.18)),
        boxShadow: AppTheme.cardShadow,
      ),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              color: widget.accent.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(widget.icon, size: 16, color: widget.accent),
          ),
          const SizedBox(height: 8),
          Text(
            widget.label,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: context.textSecondary,
              letterSpacing: 0.2,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 14),
          AnimatedBuilder(
            animation: Listenable.merge([_progressAnim, _pulse]),
            builder: (_, __) {
              final scale = 1 + _pulse.value * 0.02;
              return Transform.scale(
                scale: scale,
                child: SizedBox(
                  width: 94,
                  height: 94,
                  child: CustomPaint(
                    painter: _GradientRingPainter(
                      value: _progressAnim.value.clamp(0, 1),
                      strokeWidth: 7,
                      gradient: widget.gradient,
                      bgColor: context.dividerColor,
                      glowColor: widget.accent,
                    ),
                    child: Center(
                      child: Text(
                        widget.displayValue,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          color: context.textPrimary,
                          letterSpacing: -0.4,
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

// ─── Gradient Ring Painter ───────────────────────────────────────────────────

class _GradientRingPainter extends CustomPainter {
  final double value;
  final double strokeWidth;
  final LinearGradient gradient;
  final Color bgColor;
  final Color? glowColor;

  _GradientRingPainter({
    required this.value,
    required this.strokeWidth,
    required this.gradient,
    required this.bgColor,
    this.glowColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.width - strokeWidth) / 2;
    final rect = Rect.fromCircle(center: center, radius: radius);

    canvas.drawCircle(
      center,
      radius,
      Paint()
        ..color = bgColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth,
    );

    if (value > 0) {
      if (glowColor != null) {
        canvas.drawArc(
          rect,
          -_pi / 2,
          _twoPi * value,
          false,
          Paint()
            ..color = glowColor!.withValues(alpha: 0.35)
            ..style = PaintingStyle.stroke
            ..strokeWidth = strokeWidth + 2
            ..strokeCap = StrokeCap.round
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6),
        );
      }
      canvas.drawArc(
        rect,
        -_pi / 2,
        _twoPi * value,
        false,
        Paint()
          ..shader = gradient.createShader(rect)
          ..style = PaintingStyle.stroke
          ..strokeWidth = strokeWidth
          ..strokeCap = StrokeCap.round,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _GradientRingPainter old) =>
      old.value != value || old.glowColor != glowColor;
}

// ─── Purchase Readiness Gauge ────────────────────────────────────────────────

class _PurchaseReadinessGauge extends StatefulWidget {
  final double value;
  const _PurchaseReadinessGauge({required this.value});

  @override
  State<_PurchaseReadinessGauge> createState() =>
      _PurchaseReadinessGaugeState();
}

class _PurchaseReadinessGaugeState extends State<_PurchaseReadinessGauge>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    );
    _anim = Tween<double>(begin: 0, end: widget.value).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic),
    );
    Future.delayed(const Duration(milliseconds: 400), () {
      if (mounted) _controller.forward();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String _zoneLabel(BuildContext context, double v) {
    if (v >= 0.66) {
      return _t(context, en: 'High readiness', tr: 'Yuksek hazirlik');
    }
    if (v >= 0.33) {
      return _t(context, en: 'Warming up', tr: 'Isiniyor');
    }
    return _t(context, en: 'Exploring', tr: 'Kesif modu');
  }

  Color _zoneColor(double v) {
    if (v >= 0.66) return AppTheme.scoreExcellent;
    if (v >= 0.33) return AppTheme.scoreAverage;
    return AppTheme.scorePoor;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 20),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: context.dividerColor),
        boxShadow: AppTheme.cardShadow,
      ),
      child: Column(
        children: [
          SizedBox(
            height: 150,
            child: AnimatedBuilder(
              animation: _anim,
              builder: (_, __) {
                final v = _anim.value.clamp(0.0, 1.0);
                return CustomPaint(
                  size: const Size(double.infinity, 150),
                  painter: _GaugePainter(
                    value: v,
                    bgColor: context.dividerColor,
                    labelColor: context.textTertiaryColor,
                  ),
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Text(
                          '${(v * 100).round()}%',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 34,
                            fontWeight: FontWeight.w800,
                            color: context.textPrimary,
                            letterSpacing: -1,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 12),
          AnimatedBuilder(
            animation: _anim,
            builder: (_, __) {
              final color = _zoneColor(_anim.value);
              return Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 7,
                ),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      color.withValues(alpha: 0.18),
                      color.withValues(alpha: 0.06),
                    ],
                  ),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: color.withValues(alpha: 0.3)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: color,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color: color.withValues(alpha: 0.5),
                            blurRadius: 6,
                          ),
                        ],
                      ),
                    )
                        .animate(onPlay: (c) => c.repeat(reverse: true))
                        .scale(
                          begin: const Offset(0.9, 0.9),
                          end: const Offset(1.3, 1.3),
                          duration: 900.ms,
                          curve: Curves.easeInOut,
                        ),
                    const SizedBox(width: 8),
                    Text(
                      _zoneLabel(context, _anim.value),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: color,
                        letterSpacing: 0.2,
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _GaugePainter extends CustomPainter {
  final double value;
  final Color bgColor;
  final Color labelColor;

  _GaugePainter({
    required this.value,
    required this.bgColor,
    required this.labelColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final strokeWidth = 16.0;
    final center = Offset(size.width / 2, size.height - 8);
    final radius = math.min(size.width / 2, size.height) - strokeWidth / 2 - 8;
    final rect = Rect.fromCircle(center: center, radius: radius);

    // Background track
    canvas.drawArc(
      rect,
      _pi,
      _pi,
      false,
      Paint()
        ..color = bgColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.round,
    );

    // Zone bands
    final bands = [
      (_pi, _pi / 3, AppTheme.scorePoor),
      (_pi + _pi / 3, _pi / 3, AppTheme.scoreAverage),
      (_pi + 2 * _pi / 3, _pi / 3, AppTheme.scoreExcellent),
    ];
    for (final (start, sweep, color) in bands) {
      canvas.drawArc(
        rect,
        start,
        sweep - 0.04,
        false,
        Paint()
          ..color = color.withValues(alpha: 0.2)
          ..style = PaintingStyle.stroke
          ..strokeWidth = strokeWidth,
      );
    }

    // Progress arc
    canvas.drawArc(
      rect,
      _pi,
      _pi * value,
      false,
      Paint()
        ..shader = const LinearGradient(
          colors: [
            AppTheme.scorePoor,
            AppTheme.scoreAverage,
            AppTheme.scoreExcellent,
          ],
        ).createShader(rect)
        ..style = PaintingStyle.stroke
        ..strokeWidth = strokeWidth
        ..strokeCap = StrokeCap.round,
    );

    // Needle
    final angle = _pi + _pi * value;
    final needleEnd = Offset(
      center.dx + (radius - strokeWidth / 2 - 4) * math.cos(angle),
      center.dy + (radius - strokeWidth / 2 - 4) * math.sin(angle),
    );
    canvas.drawLine(
      center,
      needleEnd,
      Paint()
        ..color = labelColor
        ..strokeWidth = 3
        ..strokeCap = StrokeCap.round,
    );
    canvas.drawCircle(
      center,
      7,
      Paint()..color = labelColor,
    );
    canvas.drawCircle(
      center,
      3,
      Paint()..color = Colors.white,
    );
  }

  @override
  bool shouldRepaint(covariant _GaugePainter old) => old.value != value;
}

// ─── Animated Category Card ──────────────────────────────────────────────────

class _AnimatedCategoryCard extends StatefulWidget {
  final String category;
  final double score;
  final int index;

  const _AnimatedCategoryCard({
    required this.category,
    required this.score,
    required this.index,
  });

  @override
  State<_AnimatedCategoryCard> createState() => _AnimatedCategoryCardState();
}

class _AnimatedCategoryCardState extends State<_AnimatedCategoryCard>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _progressAnim;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    );
    _progressAnim = Tween<double>(begin: 0, end: widget.score).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic),
    );
    Future.delayed(Duration(milliseconds: 500 + widget.index * 100), () {
      if (mounted) _controller.forward();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  LinearGradient _gradientForScore(double s) {
    if (s >= 0.7) return AppTheme.scoreGradient;
    if (s >= 0.4) {
      return const LinearGradient(
        colors: [AppTheme.scoreAverage, Color(0xFFFFB84D)],
      );
    }
    return const LinearGradient(
      colors: [AppTheme.scorePoor, Color(0xFFF87171)],
    );
  }

  Color _accentForScore(double s) {
    if (s >= 0.7) return AppTheme.scoreExcellent;
    if (s >= 0.4) return AppTheme.scoreAverage;
    return AppTheme.scorePoor;
  }

  @override
  Widget build(BuildContext context) {
    final accent = _accentForScore(widget.score);
    final grad = _gradientForScore(widget.score);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: accent.withValues(alpha: 0.22)),
        boxShadow: [
          BoxShadow(
            color: accent.withValues(alpha: 0.10),
            blurRadius: 14,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          AnimatedBuilder(
            animation: _progressAnim,
            builder: (_, __) => SizedBox(
              width: 64,
              height: 64,
              child: CustomPaint(
                painter: _GradientRingPainter(
                  value: _progressAnim.value.clamp(0, 1),
                  strokeWidth: 5,
                  gradient: grad,
                  bgColor: context.dividerColor,
                ),
                child: Center(
                  child: Text(
                    '${(_progressAnim.value * 100).round()}',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: context.textPrimary,
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            widget.category,
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: context.textPrimary,
              height: 1.3,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Interest Cloud Card ─────────────────────────────────────────────────────

class _InterestCloudCard extends StatelessWidget {
  final List<String> interests;
  final Map<String, double> scores;

  const _InterestCloudCard({required this.interests, required this.scores});

  @override
  Widget build(BuildContext context) {
    final sorted =
        (interests.toList()
              ..sort((a, b) => (scores[b] ?? 0).compareTo(scores[a] ?? 0)))
            .take(12)
            .toList();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: context.dividerColor),
      ),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        alignment: WrapAlignment.center,
        children: List.generate(sorted.length, (i) {
          final interest = sorted[i];
          final score = scores[interest] ?? 0.0;
          final sizeIdx = score >= 0.75 ? 3 : (score >= 0.5 ? 2 : 1);
          final color = score >= 0.75
              ? AppTheme.premiumBase
              : (score >= 0.5 ? AppTheme.brandCyan : AppTheme.slate400);
          final sizes = [11.0, 12.0, 13.0, 14.0];
          final pads = [
            const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
            const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          ];

          return Container(
            padding: pads[sizeIdx],
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  color.withValues(alpha: 0.18),
                  color.withValues(alpha: 0.06),
                ],
              ),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: color.withValues(alpha: 0.3)),
            ),
            child: Text(
              interest,
              style: GoogleFonts.plusJakartaSans(
                fontSize: sizes[sizeIdx],
                fontWeight: FontWeight.w700,
                color: color,
              ),
            ),
          )
              .animate()
              .fadeIn(duration: 350.ms, delay: (650 + i * 55).ms)
              .scale(
                begin: const Offset(0.75, 0.75),
                end: const Offset(1, 1),
                delay: (650 + i * 55).ms,
                duration: 350.ms,
                curve: Curves.easeOutBack,
              );
        }),
      ),
    );
  }
}

// ─── Activity Pulse Strip ────────────────────────────────────────────────────

class _ActivityPulseStrip extends StatelessWidget {
  final int recentProducts;
  final int totalCategories;
  final int strongInterests;
  final double readiness;

  const _ActivityPulseStrip({
    required this.recentProducts,
    required this.totalCategories,
    required this.strongInterests,
    required this.readiness,
  });

  @override
  Widget build(BuildContext context) {
    final items = [
      _PulseItem(
        icon: Icons.visibility_rounded,
        label: _t(context, en: 'Recent views', tr: 'Son gorunen'),
        value: '$recentProducts',
        color: AppTheme.brandBlue,
      ),
      _PulseItem(
        icon: Icons.apps_rounded,
        label: _t(context, en: 'Categories', tr: 'Kategoriler'),
        value: '$totalCategories',
        color: AppTheme.brandCyan,
      ),
      _PulseItem(
        icon: Icons.star_rounded,
        label: _t(context, en: 'Strong interests', tr: 'Guclu ilgiler'),
        value: '$strongInterests',
        color: AppTheme.premiumBase,
      ),
      _PulseItem(
        icon: Icons.trending_up_rounded,
        label: _t(context, en: 'Momentum', tr: 'Momentum'),
        value: '${(readiness * 100).round()}%',
        color: AppTheme.scoreExcellent,
      ),
    ];

    return SizedBox(
      height: 116,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 2),
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (_, i) => _PulseChip(item: items[i], index: i),
      ),
    );
  }
}

class _PulseItem {
  final IconData icon;
  final String label;
  final String value;
  final Color color;
  _PulseItem({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });
}

class _PulseChip extends StatelessWidget {
  final _PulseItem item;
  final int index;
  const _PulseChip({required this.item, required this.index});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 140,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            item.color.withValues(alpha: 0.14),
            item.color.withValues(alpha: 0.04),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: item.color.withValues(alpha: 0.22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Container(
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(
              color: item.color.withValues(alpha: 0.18),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(item.icon, size: 16, color: item.color),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                item.value,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: context.textPrimary,
                  letterSpacing: -0.5,
                ),
              ),
              Text(
                item.label,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: context.textTertiaryColor,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ],
      ),
    )
        .animate()
        .fadeIn(duration: 400.ms, delay: (800 + index * 70).ms)
        .moveX(
          begin: 20,
          end: 0,
          duration: 400.ms,
          delay: (800 + index * 70).ms,
          curve: Curves.easeOutCubic,
        );
  }
}

// ─── Animated Score Bar ──────────────────────────────────────────────────────

class _AnimatedScoreBar extends StatefulWidget {
  final String category;
  final double score;
  final int delay;

  const _AnimatedScoreBar({
    required this.category,
    required this.score,
    required this.delay,
  });

  @override
  State<_AnimatedScoreBar> createState() => _AnimatedScoreBarState();
}

class _AnimatedScoreBarState extends State<_AnimatedScoreBar>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _barAnim;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
    _barAnim = Tween<double>(begin: 0, end: widget.score).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic),
    );
    Future.delayed(Duration(milliseconds: widget.delay), () {
      if (mounted) _controller.forward();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Color _barColor(double s) {
    if (s >= 0.7) return AppTheme.scoreExcellent;
    if (s >= 0.4) return AppTheme.scoreAverage;
    return AppTheme.scorePoor;
  }

  @override
  Widget build(BuildContext context) {
    final color = _barColor(widget.score);

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: context.dividerColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    widget.category,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: context.textPrimary,
                    ),
                  ),
                ),
                AnimatedBuilder(
                  animation: _barAnim,
                  builder: (_, __) => Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.14),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      '${(_barAnim.value * 100).round()}%',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: color,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            AnimatedBuilder(
              animation: _barAnim,
              builder: (_, __) => ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: Stack(
                  children: [
                    Container(
                      height: 8,
                      color: context.dividerColor,
                    ),
                    FractionallySizedBox(
                      widthFactor: _barAnim.value.clamp(0.0, 1.0),
                      child: Container(
                        height: 8,
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [
                              color.withValues(alpha: 0.7),
                              color,
                            ],
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: color.withValues(alpha: 0.4),
                              blurRadius: 6,
                            ),
                          ],
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
    )
        .animate()
        .fadeIn(duration: 400.ms, delay: widget.delay.ms)
        .moveX(begin: 16, end: 0, delay: widget.delay.ms, duration: 400.ms);
  }
}

// ─── Insights Summary Card ───────────────────────────────────────────────────

class _InsightsSummaryCard extends StatelessWidget {
  final int completeness;
  final double purchaseIntent;
  final int strongInterests;
  final int recentProducts;

  const _InsightsSummaryCard({
    required this.completeness,
    required this.purchaseIntent,
    required this.strongInterests,
    required this.recentProducts,
  });

  List<_Tip> _tips(BuildContext context) {
    final tips = <_Tip>[];

    if (completeness < 70) {
      tips.add(
        _Tip(
          icon: Icons.person_add_alt_1_rounded,
          color: AppTheme.brandBlue,
          title: _t(
            context,
            en: 'Complete your profile',
            tr: 'Profilini tamamla',
          ),
          body: _t(
            context,
            en:
                'Adding a few more details sharpens every recommendation you receive.',
            tr:
                'Birkac detay eklemen oneri kalitesini belirgin sekilde artirir.',
          ),
        ),
      );
    } else {
      tips.add(
        _Tip(
          icon: Icons.verified_rounded,
          color: AppTheme.scoreExcellent,
          title: _t(
            context,
            en: 'Profile looking great',
            tr: 'Profilin harika gorunuyor',
          ),
          body: _t(
            context,
            en: 'Your profile has enough signal for accurate suggestions.',
            tr: 'Profilin dogru oneriler icin yeterince sinyal veriyor.',
          ),
        ),
      );
    }

    if (purchaseIntent >= 0.6) {
      tips.add(
        _Tip(
          icon: Icons.local_fire_department_rounded,
          color: AppTheme.scorePoor,
          title: _t(
            context,
            en: 'High purchase energy',
            tr: 'Yuksek alim enerjisi',
          ),
          body: _t(
            context,
            en:
                'You are close to a decision — review your favorites before you buy.',
            tr:
                'Karara yakinsin — satin almadan once favorilerini gozden gecir.',
          ),
        ),
      );
    } else if (purchaseIntent >= 0.3) {
      tips.add(
        _Tip(
          icon: Icons.explore_rounded,
          color: AppTheme.scoreAverage,
          title: _t(context, en: 'Still exploring', tr: 'Hala kesifte'),
          body: _t(
            context,
            en: 'Great time to compare a few options side-by-side.',
            tr: 'Iki-uc secenegi yan yana karsilastirmak icin ideal zaman.',
          ),
        ),
      );
    } else {
      tips.add(
        _Tip(
          icon: Icons.tips_and_updates_rounded,
          color: AppTheme.brandCyan,
          title: _t(
            context,
            en: 'Try a discovery session',
            tr: 'Bir kesif oturumu dene',
          ),
          body: _t(
            context,
            en:
                'Browse a few trending categories — your interest map will sharpen fast.',
            tr:
                'Birkac populer kategoriye goz at — ilgi haritan hizla sekillenir.',
          ),
        ),
      );
    }

    if (strongInterests >= 3) {
      tips.add(
        _Tip(
          icon: Icons.bolt_rounded,
          color: AppTheme.premiumBase,
          title: _t(
            context,
            en: 'Focused interests detected',
            tr: 'Odakli ilgiler belirlendi',
          ),
          body: _t(
            context,
            en:
                'We will prioritize products that match your $strongInterests strongest topics.',
            tr:
                '$strongInterests guclu ilginle eslesen urunleri one cikaracagiz.',
          ),
        ),
      );
    } else {
      tips.add(
        _Tip(
          icon: Icons.center_focus_strong_rounded,
          color: AppTheme.premiumBase,
          title: _t(
            context,
            en: 'Broaden your horizons',
            tr: 'Ufkunu genislet',
          ),
          body: _t(
            context,
            en: 'Try a new category or two to discover unexpected matches.',
            tr:
                'Yeni bir-iki kategori dene; beklenmedik eslesmeler kesfedebilirsin.',
          ),
        ),
      );
    }

    return tips;
  }

  @override
  Widget build(BuildContext context) {
    final tips = _tips(context);
    return Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppTheme.premiumBase.withValues(alpha: 0.09),
            AppTheme.brandCyan.withValues(alpha: 0.04),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: AppTheme.premiumBase.withValues(alpha: 0.14),
        ),
      ),
      child: Column(
        children: List.generate(tips.length, (i) {
          return Padding(
            padding: EdgeInsets.only(top: i == 0 ? 0 : 8),
            child: _InsightTipRow(tip: tips[i], index: i),
          );
        }),
      ),
    );
  }
}

class _Tip {
  final IconData icon;
  final Color color;
  final String title;
  final String body;
  _Tip({
    required this.icon,
    required this.color,
    required this.title,
    required this.body,
  });
}

class _InsightTipRow extends StatelessWidget {
  final _Tip tip;
  final int index;
  const _InsightTipRow({required this.tip, required this.index});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: tip.color.withValues(alpha: 0.18)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  tip.color.withValues(alpha: 0.22),
                  tip.color.withValues(alpha: 0.08),
                ],
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(tip.icon, size: 18, color: tip.color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tip.title,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: context.textPrimary,
                    letterSpacing: -0.1,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  tip.body,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    height: 1.45,
                    color: context.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    )
        .animate()
        .fadeIn(duration: 400.ms, delay: (1200 + index * 90).ms)
        .moveY(
          begin: 10,
          end: 0,
          delay: (1200 + index * 90).ms,
          duration: 400.ms,
        );
  }
}
