part of '../link_paste_screen.dart';


class _FactorRow extends StatefulWidget {
  final CompatibilityFactor factor;
  const _FactorRow({required this.factor});

  @override
  State<_FactorRow> createState() => _FactorRowState();
}

class _FactorRowState extends State<_FactorRow>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _barAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );
    _barAnimation = Tween<double>(
      begin: 0,
      end: widget.factor.score / 100,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeOutCubic));
    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Color _barColor(double score) {
    if (score >= 80) return AppTheme.scoreExcellent;
    if (score >= 60) return AppTheme.scoreGood;
    if (score >= 40) return AppTheme.scoreAverage;
    return AppTheme.scorePoor;
  }

  @override
  Widget build(BuildContext context) {
    final factor = widget.factor;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Text(factor.emoji, style: const TextStyle(fontSize: 16)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(factor.label,
                style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                    color: context.textPrimary)),
          ),
          AnimatedBuilder(
            animation: _barAnimation,
            builder: (context, _) => Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
              decoration: BoxDecoration(
                color: _barColor(factor.score).withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                  '${(_barAnimation.value * 100).toStringAsFixed(0)}%',
                  style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                      color: _barColor(factor.score))),
            ),
          ),
        ]),
        const SizedBox(height: 8),
        AnimatedBuilder(
          animation: _barAnimation,
          builder: (context, _) => ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: _barAnimation.value,
              backgroundColor: AppTheme.slate700,
              color: _barColor(factor.score),
              minHeight: 6,
            ),
          ),
        ),
      ],
    );
  }
}

class _ProConCard extends StatelessWidget {
  final String title;
  final List<String> items;
  final IconData icon;
  final Color color;

  const _ProConCard({
    required this.title,
    required this.items,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return GlassContainer(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(icon, color: color, size: 18),
            const SizedBox(width: 6),
            Expanded(
              child: Text(title,
                  style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                      color: color)),
            ),
          ]),
          const SizedBox(height: 10),
          ...items.map((item) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(color == AppTheme.success ? '\u2705' : '\u26a0\ufe0f',
                        style: const TextStyle(fontSize: 12)),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(item,
                          style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              color: context.textSecondary,
                              height: 1.4)),
                    ),
                  ],
                ),
              )),
        ],
      ),
    );
  }
}

class _CompatibilityGauge extends StatelessWidget {
  final double score;
  final Animation<double>? scoreAnimation;
  const _CompatibilityGauge({required this.score, this.scoreAnimation});

  Color _getColor([double? s]) {
    final v = s ?? score;
    if (v >= 80) return AppTheme.scoreExcellent;
    if (v >= 60) return AppTheme.scoreGood;
    if (v >= 40) return AppTheme.scoreAverage;
    return AppTheme.scorePoor;
  }

  String _getLabel(BuildContext context, [double? s]) {
    final v = s ?? score;
    if (v >= 90) return context.l10n?.perfectMatch ?? 'Perfect Match! \u{1F3AF}';
    if (v >= 75) return context.l10n?.greatMatch ?? 'Great Match \u{1F44D}';
    if (v >= 60) return context.l10n?.goodMatch ?? 'Good Match';
    if (v >= 40) return context.l10n?.averageMatch ?? 'Average Match';
    return context.l10n?.lowMatch ?? 'Low Match';
  }

  @override
  Widget build(BuildContext context) {
    final gaugeWidget = scoreAnimation != null
        ? AnimatedBuilder(
            animation: scoreAnimation!,
            builder: (context, _) {
              final animScore = scoreAnimation!.value;
              return _buildGaugeContent(context, animScore);
            },
          )
        : _buildGaugeContent(context, score);

    return GlassContainer(
      padding: const EdgeInsets.all(24),
      child: gaugeWidget,
    );
  }

  Widget _buildGaugeContent(BuildContext context, double currentScore) {
    return Row(children: [
      SizedBox(
        width: 100,
        height: 100,
        child: CustomPaint(
          painter: _GaugePainter(score: currentScore, color: _getColor(currentScore)),
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('${currentScore.toStringAsFixed(0)}%',
                    style: GoogleFonts.plusJakartaSans(
                        fontSize: 26,
                        fontWeight: FontWeight.w800,
                        color: _getColor(currentScore))),
                Text('match',
                    style: GoogleFonts.plusJakartaSans(
                        fontSize: 10,
                        fontWeight: FontWeight.w500,
                        color: context.textTertiaryColor)),
              ],
            ),
          ),
        ),
      ),
      const SizedBox(width: 24),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(context.l10n?.yourCompatibility ?? 'Your Compatibility',
                style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                    color: context.textPrimary)),
            const SizedBox(height: 4),
            Text(_getLabel(context, currentScore),
                style: GoogleFonts.plusJakartaSans(
                    color: _getColor(currentScore),
                    fontWeight: FontWeight.w600,
                    fontSize: 15)),
            const SizedBox(height: 6),
            Text(context.l10n?.basedOnProfilePrefs ?? 'Based on your profile, quiz answers & preferences',
                style: GoogleFonts.plusJakartaSans(
                    color: context.textTertiaryColor, fontSize: 12)),
          ],
        ),
      ),
    ]);
  }
}

class _GaugePainter extends CustomPainter {
  final double score;
  final Color color;
  _GaugePainter({required this.score, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = min(size.width, size.height) / 2 - 5;

    // Background arc
    final bgPaint = Paint()
      ..color = AppTheme.slate700
      ..style = PaintingStyle.stroke
      ..strokeWidth = 10
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -pi * 0.75, pi * 1.5, false, bgPaint,
    );

    // Gradient score arc
    final sweepAngle = (score / 100) * pi * 1.5;
    final rect = Rect.fromCircle(center: center, radius: radius);
    final gradientColors = score >= 60
        ? [AppTheme.scoreGood, color]
        : [AppTheme.scorePoor, color];
    final scorePaint = Paint()
      ..shader = SweepGradient(
        startAngle: -pi * 0.75,
        endAngle: -pi * 0.75 + sweepAngle,
        colors: gradientColors,
      ).createShader(rect)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 10
      ..strokeCap = StrokeCap.round;
    canvas.drawArc(rect, -pi * 0.75, sweepAngle, false, scorePaint);

    // Dot at end of arc
    if (score > 0) {
      final angle = -pi * 0.75 + sweepAngle;
      final dotX = center.dx + radius * cos(angle);
      final dotY = center.dy + radius * sin(angle);
      final dotPaint = Paint()
        ..color = Colors.white
        ..style = PaintingStyle.fill;
      canvas.drawCircle(Offset(dotX, dotY), 5, dotPaint);
      final dotGlow = Paint()
        ..color = color.withValues(alpha: 0.4)
        ..style = PaintingStyle.fill;
      canvas.drawCircle(Offset(dotX, dotY), 8, dotGlow);
    }
  }

  @override
  bool shouldRepaint(covariant _GaugePainter oldDelegate) =>
      oldDelegate.score != score || oldDelegate.color != color;
}

// ignore: unused_element
class _StepRow extends StatelessWidget {
  final String step;
  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;

  const _StepRow({
    required this.step,
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            gradient: LinearGradient(
                colors: [color, color.withValues(alpha: 0.7)]),
            borderRadius: BorderRadius.circular(10),
            boxShadow: [
              BoxShadow(
                color: color.withValues(alpha: 0.2),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Icon(icon, size: 18, color: context.surfaceVariantColor),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                      color: context.textPrimary)),
              Text(subtitle,
                  style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      color: context.textTertiaryColor,
                      fontWeight: FontWeight.w500)),
            ],
          ),
        ),
      ],
    );
  }
}

// ignore: unused_element
class _StepConnector extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 17),
      child: Container(
        width: 2,
        height: 20,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              AppTheme.primaryBlue.withValues(alpha: 0.3),
              AppTheme.primaryBlue.withValues(alpha: 0.08),
            ],
          ),
          borderRadius: BorderRadius.circular(1),
        ),
      ),
    );
  }
}

// ignore: unused_element
class _MiniFeatureCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;

  const _MiniFeatureCard({
    required this.icon,
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return GlassContainer(
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 10),
      child: Column(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, size: 20, color: color),
          ),
          const SizedBox(height: 8),
          Text(label,
              textAlign: TextAlign.center,
              style: GoogleFonts.plusJakartaSans(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: context.textSecondary,
                  height: 1.3)),
        ],
      ),
    );
  }
}

class _PowerCard extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String title;
  final String emoji;
  const _PowerCard({required this.icon, required this.color, required this.title, required this.emoji});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 100, height: 120,
      margin: const EdgeInsets.only(right: 10),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft, end: Alignment.bottomRight,
          colors: [color.withValues(alpha: 0.12), color.withValues(alpha: 0.04)]),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.15)),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(emoji, style: const TextStyle(fontSize: 24)),
          const SizedBox(height: 8),
          Text(title, textAlign: TextAlign.center,
            style: GoogleFonts.inter(
              fontSize: 11, fontWeight: FontWeight.w700,
              color: context.textPrimary, height: 1.2)),
        ],
      ),
    );
  }
}

// ignore: unused_element
class _CompactStep extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String title;
  final String step;
  const _CompactStep({required this.icon, required this.color, required this.title, required this.step});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 44, height: 44,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Stack(
            children: [
              Center(child: Icon(icon, size: 20, color: color)),
              Positioned(
                top: 2, right: 4,
                child: Container(
                  width: 14, height: 14,
                  decoration: BoxDecoration(color: color, shape: BoxShape.circle),
                  child: Center(child: Text(step,
                    style: GoogleFonts.inter(
                      fontSize: 8, fontWeight: FontWeight.w800, color: Colors.white))),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 6),
        Text(title, textAlign: TextAlign.center,
          style: GoogleFonts.inter(
            fontSize: 11, fontWeight: FontWeight.w600, color: context.textSecondary)),
      ],
    );
  }
}

// ignore: unused_element
class _StepArrow extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 18),
      child: Icon(Icons.arrow_forward_rounded, size: 16,
        color: AppTheme.brandBlue.withValues(alpha: 0.4)),
    );
  }
}

// ignore: unused_element
class _FeatureTile extends StatelessWidget {
  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;
  const _FeatureTile({required this.icon, required this.color, required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.12)),
      ),
      child: Row(
        children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [color, color.withValues(alpha: 0.6)]),
              borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, size: 18, color: Colors.white),
          ),
          const SizedBox(width: 10),
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: GoogleFonts.inter(
                fontSize: 12, fontWeight: FontWeight.w700, color: context.textPrimary)),
              Text(subtitle, style: GoogleFonts.inter(
                fontSize: 10, color: context.textTertiaryColor)),
            ],
          )),
        ],
      ),
    );
  }
}

