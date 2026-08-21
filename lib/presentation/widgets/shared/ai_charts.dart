/// Qor AI — Animated analysis chart atoms (web `AiCharts.jsx` parity).
///
/// Shared building blocks used by every AI-analysis surface (product review,
/// compare, subscription, link analysis) so the app matches the website 1:1:
///   • [DecisionBadge]   — Buy / Consider / Skip pill, deterministic from score.
///   • [AnimatedBarFill] — factor bar that sweeps 0→value on mount.
///   • [SentimentDonut]  — community sentiment donut (Positive/Neutral/Negative)
///                          that draws its arcs from 0 like the web SVG.
///   • [DistributionBar] — factor balance (strong/balanced/weak), data-derived.
///   • [AiCollapsible]   — default-closed "Detaylı analiz" so long prose is
///                          one tap away instead of a wall of text.
///
/// Everything respects `MediaQuery.disableAnimations` (reduced-motion): the
/// charts snap straight to their final state instead of animating.
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/core/theme.dart';

// Web'in ikinci dalga grafikleri (radar, kritik noktalar, quiz etkisi,
// topluluk temaları, kaynak rozetleri, KPI kutuları) ayrı dosyada ama aynı
// kapıdan çıkar: bu dosyayı import eden herkes onlara da erişir.
export 'package:qor_ai/presentation/widgets/shared/ai_charts_ext.dart';

// Exact web palette (AiCharts.jsx CHART_COLORS) so app == site.
const Color aicStrong = Color(0xFF22C55E); // güçlü / pozitif
const Color aicBalanced = Color(0xFFF59E0B); // orta / nötr
const Color aicWeak = Color(0xFFF43F5E); // zayıf / negatif
const Color aicBrand = Color(0xFF3B82F6); // marka mavi

/// Localizer signature shared with `ai_report_view.dart` — `(en, tr, de)`.
typedef AicL = String Function(String en, String tr);

bool _reducedMotion(BuildContext c) =>
    MediaQuery.maybeOf(c)?.disableAnimations ?? false;

int _round(num v) => v.round();

// ─────────────────────────────────────────────────────────────────────────
//  Decision badge — Buy / Consider / Skip, deterministic from a 0-100 score.
// ─────────────────────────────────────────────────────────────────────────

enum AicDecision { buy, consider, skip }

AicDecision decisionFromScore(num score) {
  final s = score.toDouble();
  if (s >= 70) return AicDecision.buy;
  if (s >= 50) return AicDecision.consider;
  return AicDecision.skip;
}

class DecisionBadge extends StatelessWidget {
  final num score;
  final AicL l;
  const DecisionBadge({super.key, required this.score, required this.l});

  @override
  Widget build(BuildContext context) {
    final kind = decisionFromScore(score);
    final (String label, String icon, Color color) = switch (kind) {
      AicDecision.buy => (l('Buy', 'Al'), '✓', aicStrong),
      AicDecision.consider => (l('Consider', 'Düşün'), '~', aicBalanced),
      AicDecision.skip => (l('Skip', 'Geç'), '✕', aicWeak),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            icon,
            style: TextStyle(color: color, fontWeight: FontWeight.w900, fontSize: 12),
          ),
          const SizedBox(width: 5),
          Text(
            label,
            style: GoogleFonts.plusJakartaSans(
              color: color,
              fontWeight: FontWeight.w800,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  Count-up number — animates 0→target on mount (for score readouts).
// ─────────────────────────────────────────────────────────────────────────

class AicCountUp extends StatelessWidget {
  final num value;
  final TextStyle? style;
  final String suffix;
  const AicCountUp({super.key, required this.value, this.style, this.suffix = ''});

  @override
  Widget build(BuildContext context) {
    final v = value.toDouble();
    final reduced = _reducedMotion(context);
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: reduced ? v : 0, end: v),
      duration: reduced ? Duration.zero : const Duration(milliseconds: 900),
      curve: Curves.easeOutCubic,
      builder: (_, t, _) => Text('${t.round()}$suffix', style: style),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  Animated bar fill — sweeps 0→pct on mount (factor bars, score bars).
// ─────────────────────────────────────────────────────────────────────────

class AnimatedBarFill extends StatelessWidget {
  final double pct; // 0-100
  final Color color;
  final bool gradient;
  final double height;
  const AnimatedBarFill({
    super.key,
    required this.pct,
    required this.color,
    this.gradient = false,
    this.height = 7,
  });

  @override
  Widget build(BuildContext context) {
    final v = (pct.clamp(0, 100)) / 100.0;
    final reduced = _reducedMotion(context);
    return ClipRRect(
      borderRadius: BorderRadius.circular(6),
      child: SizedBox(
        height: height,
        child: Stack(
          children: [
            Container(color: color.withValues(alpha: 0.14)),
            TweenAnimationBuilder<double>(
              tween: Tween(begin: reduced ? v : 0, end: v),
              duration: reduced ? Duration.zero : const Duration(milliseconds: 750),
              curve: Curves.easeOutCubic,
              builder: (_, t, _) => FractionallySizedBox(
                alignment: Alignment.centerLeft,
                widthFactor: t.clamp(0.0, 1.0),
                child: Container(
                  decoration: BoxDecoration(
                    color: gradient ? null : color,
                    gradient: gradient
                        ? LinearGradient(
                            colors: [color.withValues(alpha: 0.5), color],
                          )
                        : null,
                    borderRadius: BorderRadius.circular(6),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  Sentiment helpers — parse / derive the {positive, neutral, negative} split.
// ─────────────────────────────────────────────────────────────────────────

/// Fallback when the AI gave no breakdown: derive from a 0-100 satisfaction —
/// positive=sat, negative≈(100-sat)*0.65, neutral=remainder (AiCharts.jsx §4B).
Map<String, int> deriveSentiment(num satisfaction) {
  final sat = satisfaction.clamp(0, 100).round();
  final positive = sat;
  final negative = ((100 - sat) * 0.65).round();
  final neutral = math.max(0, 100 - positive - negative);
  return {'positive': positive, 'neutral': neutral, 'negative': negative};
}

/// Normalizes an AI-provided sentiment map to percentages summing to 100; if the
/// map is empty/missing, derives one from [satisfactionFallback].
Map<String, int> normalizeSentiment(dynamic raw, num satisfactionFallback) {
  if (raw is Map) {
    final positive = math.max(0, _round((raw['positive'] as num?) ?? 0));
    final neutral = math.max(0, _round((raw['neutral'] as num?) ?? 0));
    final negative = math.max(0, _round((raw['negative'] as num?) ?? 0));
    final total = positive + neutral + negative;
    if (total > 0) {
      final p = ((positive / total) * 100).round();
      final n = ((negative / total) * 100).round();
      return {'positive': p, 'negative': n, 'neutral': math.max(0, 100 - p - n)};
    }
  }
  return deriveSentiment(satisfactionFallback);
}

/// Buckets factor scores into strong (≥70) / balanced (≥50) / weak (<50).
({int strong, int balanced, int weak}) factorDistribution(dynamic factors) {
  var strong = 0, balanced = 0, weak = 0;
  if (factors is List) {
    for (final f in factors) {
      num s = 0;
      if (f is Map) {
        final raw = f['score'] ?? f['value'] ?? 0;
        s = raw is num ? raw : num.tryParse(raw.toString()) ?? 0;
      }
      if (s >= 70) {
        strong++;
      } else if (s >= 50) {
        balanced++;
      } else {
        weak++;
      }
    }
  }
  return (strong: strong, balanced: balanced, weak: weak);
}

// ─────────────────────────────────────────────────────────────────────────
//  Donut — arcs sweep from the top (−90°) as one animation, like the web SVG.
// ─────────────────────────────────────────────────────────────────────────

class _DonutPainter extends CustomPainter {
  final List<({double value, Color color})> segments;
  final double t; // 0..1 sweep progress
  final double thickness;
  final Color trackColor;
  _DonutPainter({
    required this.segments,
    required this.t,
    required this.thickness,
    required this.trackColor,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final total = segments.fold<double>(0, (a, b) => a + b.value);
    if (total <= 0) return;
    final center = size.center(Offset.zero);
    final radius = (size.width - thickness) / 2;
    final rect = Rect.fromCircle(center: center, radius: radius);

    final track = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = thickness
      ..color = trackColor;
    canvas.drawArc(rect, 0, 2 * math.pi, false, track);

    final sweepTotal = 2 * math.pi * t.clamp(0.0, 1.0);
    var start = -math.pi / 2;
    var drawn = 0.0;
    for (final s in segments) {
      final full = (s.value / total) * 2 * math.pi;
      final remaining = sweepTotal - drawn;
      if (remaining <= 0) break;
      final sweep = math.min(full, remaining);
      final paint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = thickness
        ..color = s.color;
      canvas.drawArc(rect, start, sweep, false, paint);
      start += full;
      drawn += full;
    }
  }

  @override
  bool shouldRepaint(_DonutPainter old) => old.t != t || old.segments != segments;
}

class AicDonut extends StatelessWidget {
  final List<({double value, Color color})> segments;
  final String centerValue;
  final String centerLabel;
  final double size;
  final double thickness;
  const AicDonut({
    super.key,
    required this.segments,
    this.centerValue = '',
    this.centerLabel = '',
    this.size = 124,
    this.thickness = 15,
  });

  @override
  Widget build(BuildContext context) {
    final segs = segments.where((s) => s.value > 0).toList();
    if (segs.isEmpty) return const SizedBox.shrink();
    final reduced = _reducedMotion(context);
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          TweenAnimationBuilder<double>(
            tween: Tween(begin: reduced ? 1 : 0, end: 1),
            duration: reduced ? Duration.zero : const Duration(milliseconds: 850),
            curve: Curves.easeOutCubic,
            builder: (_, t, _) => CustomPaint(
              size: Size(size, size),
              painter: _DonutPainter(
                segments: segs,
                t: t,
                thickness: thickness,
                trackColor: context.dividerColor,
              ),
            ),
          ),
          if (centerValue.isNotEmpty || centerLabel.isNotEmpty)
            Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (centerValue.isNotEmpty)
                  Text(
                    centerValue,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: size < 110 ? 18 : 22,
                      fontWeight: FontWeight.w900,
                      color: context.textPrimary,
                      height: 1,
                    ),
                  ),
                if (centerLabel.isNotEmpty)
                  Text(
                    centerLabel,
                    style: GoogleFonts.inter(
                      fontSize: 9.5,
                      color: context.textTertiaryColor,
                    ),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}

/// Community-satisfaction donut with legend. [breakdown] is the normalized
/// `{positive, neutral, negative}` map; center shows the big positive %.
class SentimentDonut extends StatelessWidget {
  final Map<String, int> breakdown;
  final AicL l;
  final bool compact;
  const SentimentDonut({
    super.key,
    required this.breakdown,
    required this.l,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final pos = (breakdown['positive'] ?? 0).toDouble();
    final neu = (breakdown['neutral'] ?? 0).toDouble();
    final neg = (breakdown['negative'] ?? 0).toDouble();
    if (pos + neu + neg <= 0) return const SizedBox.shrink();
    final rows = <({String label, double value, Color color})>[
      (label: l('Positive', 'Olumlu'), value: pos, color: aicStrong),
      (label: l('Neutral', 'Nötr'), value: neu, color: aicBalanced),
      (label: l('Negative', 'Olumsuz'), value: neg, color: aicWeak),
    ];
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '💬 ${l('Community satisfaction', 'Topluluk memnuniyeti')}',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 12.5,
              fontWeight: FontWeight.w800,
              color: context.textPrimary,
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              AicDonut(
                segments: rows.map((r) => (value: r.value, color: r.color)).toList(),
                centerValue: '${pos.round()}%',
                centerLabel: l('positive', 'olumlu'),
                size: compact ? 96 : 118,
                thickness: compact ? 12 : 15,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final r in rows)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 6),
                        child: Row(
                          children: [
                            Container(
                              width: 10,
                              height: 10,
                              decoration: BoxDecoration(
                                color: r.color,
                                borderRadius: BorderRadius.circular(3),
                              ),
                            ),
                            const SizedBox(width: 7),
                            Expanded(
                              child: Text(
                                r.label,
                                style: GoogleFonts.inter(
                                  fontSize: 11.5,
                                  color: context.textSecondary,
                                ),
                              ),
                            ),
                            Text(
                              '${r.value.round()}%',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w800,
                                color: context.textPrimary,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  Distribution bar — factor balance (strong / balanced / weak).
// ─────────────────────────────────────────────────────────────────────────

class DistributionBar extends StatelessWidget {
  final int strong;
  final int balanced;
  final int weak;
  final AicL l;
  const DistributionBar({
    super.key,
    required this.strong,
    required this.balanced,
    required this.weak,
    required this.l,
  });

  @override
  Widget build(BuildContext context) {
    final total = strong + balanced + weak;
    if (total <= 0) return const SizedBox.shrink();
    final reduced = _reducedMotion(context);
    Widget seg(int n, Color color) {
      if (n <= 0) return const SizedBox.shrink();
      return Expanded(
        flex: n,
        child: Container(color: color),
      );
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '⚖️ ${l('Factor balance', 'Faktör dengesi')}',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 12.5,
              fontWeight: FontWeight.w800,
              color: context.textPrimary,
            ),
          ),
          const SizedBox(height: 10),
          // Bütün track 0→1 açılır (reduced-motion'da anında).
          TweenAnimationBuilder<double>(
            tween: Tween(begin: reduced ? 1 : 0, end: 1),
            duration: reduced ? Duration.zero : const Duration(milliseconds: 750),
            curve: Curves.easeOutCubic,
            builder: (_, t, _) => ClipRRect(
              borderRadius: BorderRadius.circular(7),
              child: FractionallySizedBox(
                alignment: Alignment.centerLeft,
                widthFactor: t.clamp(0.0, 1.0),
                child: SizedBox(
                  height: 14,
                  child: Row(
                    children: [
                      seg(strong, aicStrong),
                      seg(balanced, aicBalanced),
                      seg(weak, aicWeak),
                    ],
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 12,
            runSpacing: 4,
            children: [
              _legend(context, aicStrong, '$strong ${l('strong', 'güçlü')}'),
              _legend(context, aicBalanced, '$balanced ${l('balanced', 'dengeli')}'),
              _legend(context, aicWeak, '$weak ${l('weak', 'zayıf')}'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _legend(BuildContext context, Color color, String text) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 9,
            height: 9,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(3),
            ),
          ),
          const SizedBox(width: 5),
          Text(
            text,
            style: GoogleFonts.inter(fontSize: 11, color: context.textSecondary),
          ),
        ],
      );
}

// ─────────────────────────────────────────────────────────────────────────
//  Collapsible — default-closed "Detaylı analiz". Body is built lazily.
// ─────────────────────────────────────────────────────────────────────────

class AiCollapsible extends StatefulWidget {
  final String label;
  final WidgetBuilder builder;
  final bool defaultOpen;
  const AiCollapsible({
    super.key,
    required this.label,
    required this.builder,
    this.defaultOpen = false,
  });

  @override
  State<AiCollapsible> createState() => _AiCollapsibleState();
}

class _AiCollapsibleState extends State<AiCollapsible> {
  late bool _open = widget.defaultOpen;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () => setState(() => _open = !_open),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 11, horizontal: 4),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      widget.label,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: AppTheme.brandBlue,
                      ),
                    ),
                  ),
                  AnimatedRotation(
                    turns: _open ? 0.5 : 0,
                    duration: const Duration(milliseconds: 200),
                    child: Icon(
                      Icons.keyboard_arrow_down_rounded,
                      color: AppTheme.brandBlue,
                      size: 22,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        if (_open)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: widget.builder(context),
          ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  Text helper — first N sentences (hero one-liner).
// ─────────────────────────────────────────────────────────────────────────

String firstSentencesOf(String? text, {int count = 1}) {
  final raw = (text ?? '').replaceAll(RegExp(r'\s+'), ' ').trim();
  if (raw.isEmpty) return '';
  final parts = raw
      .split(RegExp(r'(?<=[.!?])\s+'))
      .where((s) => s.trim().isNotEmpty)
      .toList();
  if (parts.isEmpty) return raw;
  return parts.take(count).join(' ');
}
