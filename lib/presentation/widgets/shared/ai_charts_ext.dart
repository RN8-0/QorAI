/// Qor AI — Analiz grafiklerinin ikinci dalgası (web paritesi, 2026-08-08).
///
/// Site tarafında ürün / karşılaştırma / link / abonelik analizlerinin hepsi
/// TEK rapor şablonuna geçti (`web/src/components/AiReportView.jsx`). O
/// şablonun uygulamada karşılığı olmayan parçaları burada:
///   • [AicRadarChart]      — faktör profili örümcek ağı
///   • [AicFactorList]      — puana göre sıralı, açıklamalı faktör çubukları
///   • [AicCriticalPoints]  — "karar vermeden önce bunu bil"
///   • [AicQuizImpact]      — hangi cevap puanı ne yöne itti
///   • [AicCommunityThemes] — en çok konuşulan başlıklar
///   • [AicSourceChips]     — taranan kaynak türleri
///   • [AicStatTiles]       — KPI kutuları (tek kalan kutu ORTALANIR)
///
/// Davranış kuralları `ai_charts.dart` ile aynı: reduced-motion açıkken
/// animasyon yok, renk DAİMA veriden gelir (asla animasyona bağlı değil).
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/presentation/widgets/shared/ai_charts.dart';

bool _reduced(BuildContext c) =>
    MediaQuery.maybeOf(c)?.disableAnimations ?? false;

Color aicScoreColor(num n) =>
    n >= 70 ? aicStrong : (n >= 50 ? aicBalanced : aicWeak);

/// `{label, score, detail}` listesini güvenle okur.
List<({String label, double score, String detail})> aicFactors(dynamic raw) {
  if (raw is! List) return const [];
  final out = <({String label, double score, String detail})>[];
  for (final f in raw) {
    if (f is! Map) continue;
    final label = (f['label'] ?? f['name'] ?? '').toString().trim();
    if (label.isEmpty) continue;
    final s = f['score'] ?? f['value'] ?? 0;
    final score = s is num ? s.toDouble() : (double.tryParse(s.toString()) ?? 0);
    out.add((
      label: label.replaceAll('_', ' '),
      score: score.clamp(0, 100).toDouble(),
      detail: (f['detail'] ?? '').toString().trim(),
    ));
  }
  return out;
}

List<Map> _maps(dynamic raw) =>
    raw is List ? raw.whereType<Map>().toList() : const <Map>[];

String _s(dynamic v) => (v ?? '').toString().trim();

double _num(dynamic v) => v is num
    ? v.toDouble()
    : (double.tryParse(_s(v).replaceAll(',', '.')) ?? 0);

Widget _card(BuildContext context, {required Widget child}) => Container(
  width: double.infinity,
  padding: const EdgeInsets.all(14),
  decoration: BoxDecoration(
    color: context.surfaceVariantColor,
    borderRadius: BorderRadius.circular(16),
    border: Border.all(color: context.dividerColor),
  ),
  child: child,
);

Widget _title(BuildContext context, String text) => Padding(
  padding: const EdgeInsets.only(bottom: 10),
  child: Text(
    text,
    style: GoogleFonts.plusJakartaSans(
      fontSize: 12.5,
      fontWeight: FontWeight.w800,
      color: context.textPrimary,
    ),
  ),
);

// ─────────────────────────────────────────────────────────────────────────
//  Radar — faktör profili. Ağ 0'dan açılır.
// ─────────────────────────────────────────────────────────────────────────

class _RadarPainter extends CustomPainter {
  final List<({String label, double score, String detail})> factors;
  final double t;
  final Color color;
  final Color grid;
  final Color text;
  _RadarPainter({
    required this.factors,
    required this.t,
    required this.color,
    required this.grid,
    required this.text,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final n = factors.length;
    if (n < 3) return;
    final center = Offset(size.width / 2, size.height / 2);
    // Etiketler için kenarda pay bırak.
    final radius = math.min(size.width, size.height) / 2 - 26;
    if (radius <= 0) return;

    Offset at(int i, double r) {
      final a = -math.pi / 2 + (2 * math.pi * i) / n;
      return Offset(center.dx + math.cos(a) * r, center.dy + math.sin(a) * r);
    }

    final gridPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = grid;
    for (var ring = 1; ring <= 4; ring++) {
      final path = Path();
      for (var i = 0; i < n; i++) {
        final p = at(i, radius * ring / 4);
        if (i == 0) {
          path.moveTo(p.dx, p.dy);
        } else {
          path.lineTo(p.dx, p.dy);
        }
      }
      path.close();
      canvas.drawPath(path, gridPaint);
    }
    for (var i = 0; i < n; i++) {
      canvas.drawLine(center, at(i, radius), gridPaint);
    }

    final poly = Path();
    for (var i = 0; i < n; i++) {
      final p = at(i, radius * (factors[i].score / 100) * t);
      if (i == 0) {
        poly.moveTo(p.dx, p.dy);
      } else {
        poly.lineTo(p.dx, p.dy);
      }
    }
    poly.close();
    canvas.drawPath(poly, Paint()..color = color.withValues(alpha: 0.18));
    canvas.drawPath(
      poly,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2
        ..strokeJoin = StrokeJoin.round
        ..color = color,
    );
    for (var i = 0; i < n; i++) {
      canvas.drawCircle(
        at(i, radius * (factors[i].score / 100) * t),
        2.6,
        Paint()..color = color,
      );
    }

    // Kısa etiketler — uzun isimler radarı boğuyor, ilk kelime yeter.
    for (var i = 0; i < n; i++) {
      final first = factors[i].label.split(RegExp(r'\s+')).first;
      final short = first.length > 11 ? '${first.substring(0, 10)}…' : first;
      final tp = TextPainter(
        text: TextSpan(
          text: short,
          style: GoogleFonts.inter(
            fontSize: 9.5,
            fontWeight: FontWeight.w700,
            color: text,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      final p = at(i, radius + 14);
      tp.paint(canvas, Offset(p.dx - tp.width / 2, p.dy - tp.height / 2));
    }
  }

  @override
  bool shouldRepaint(_RadarPainter old) => old.t != t || old.factors != factors;
}

class AicRadarChart extends StatelessWidget {
  final dynamic factors;
  final AicL l;
  final double size;
  const AicRadarChart({
    super.key,
    required this.factors,
    required this.l,
    this.size = 230,
  });

  @override
  Widget build(BuildContext context) {
    final rows = aicFactors(factors);
    if (rows.length < 3) return const SizedBox.shrink();
    final use = rows.length > 8 ? rows.sublist(0, 8) : rows;
    final reduced = _reduced(context);
    return _card(
      context,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _title(
            context,
            '🕸 ${l('Factor profile', 'Faktör profili', 'Faktorprofil')}',
          ),
          Center(
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: reduced ? 1 : 0, end: 1),
              duration: reduced
                  ? Duration.zero
                  : const Duration(milliseconds: 900),
              curve: Curves.easeOutCubic,
              builder: (_, t, _) => CustomPaint(
                size: Size(size, size),
                painter: _RadarPainter(
                  factors: use,
                  t: t.clamp(0.0, 1.0),
                  color: aicBrand,
                  grid: context.dividerColor,
                  text: context.textSecondary,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  Faktör listesi — puana göre sıralı, açıklamalı çubuklar.
// ─────────────────────────────────────────────────────────────────────────

class AicFactorList extends StatelessWidget {
  final dynamic factors;
  const AicFactorList({super.key, required this.factors});

  @override
  Widget build(BuildContext context) {
    final rows = aicFactors(factors)
      ..sort((a, b) => b.score.compareTo(a.score));
    if (rows.isEmpty) return const SizedBox.shrink();
    return Column(
      children: [
        for (var i = 0; i < rows.length; i++)
          Padding(
            padding: EdgeInsets.only(bottom: i == rows.length - 1 ? 0 : 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        rows[i].label,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary,
                        ),
                      ),
                    ),
                    Text(
                      '${rows[i].score.round()}',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        fontWeight: FontWeight.w900,
                        color: aicScoreColor(rows[i].score),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                AnimatedBarFill(
                  pct: rows[i].score.clamp(3, 100).toDouble(),
                  color: aicScoreColor(rows[i].score),
                ),
                if (rows[i].detail.isNotEmpty) ...[
                  const SizedBox(height: 5),
                  Text(
                    rows[i].detail,
                    style: GoogleFonts.inter(
                      fontSize: 11.5,
                      height: 1.45,
                      color: context.textSecondary,
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

// ─────────────────────────────────────────────────────────────────────────
//  Kritik noktalar — "karar vermeden önce bunu bil".
// ─────────────────────────────────────────────────────────────────────────

class AicCriticalPoints extends StatelessWidget {
  final dynamic items;
  final AicL l;
  const AicCriticalPoints({super.key, required this.items, required this.l});

  @override
  Widget build(BuildContext context) {
    final rows = _maps(
      items,
    ).where((x) => _s(x['title']).isNotEmpty || _s(x['detail']).isNotEmpty).toList();
    if (rows.isEmpty) return const SizedBox.shrink();
    Color tone(String s) =>
        s == 'high' ? aicWeak : (s == 'low' ? aicBrand : aicBalanced);
    String label(String s) => s == 'high'
        ? l('Critical', 'Kritik', 'Kritisch')
        : s == 'low'
        ? l('Note', 'Not', 'Hinweis')
        : l('Important', 'Önemli', 'Wichtig');
    return _card(
      context,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _title(
            context,
            '🚨 ${l('Critical points before you decide', 'Karar öncesi kritik noktalar', 'Kritische Punkte vor der Entscheidung')}',
          ),
          for (var i = 0; i < rows.length; i++)
            Padding(
              padding: EdgeInsets.only(bottom: i == rows.length - 1 ? 0 : 10),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(11),
                decoration: BoxDecoration(
                  color: context.surfaceColor,
                  borderRadius: BorderRadius.circular(13),
                  border: Border(
                    left: BorderSide(
                      color: tone(_s(rows[i]['severity'])),
                      width: 3,
                    ),
                    top: BorderSide(color: context.dividerColor),
                    right: BorderSide(color: context.dividerColor),
                    bottom: BorderSide(color: context.dividerColor),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label(_s(rows[i]['severity'])).toUpperCase(),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 9.5,
                        letterSpacing: 0.6,
                        fontWeight: FontWeight.w900,
                        color: tone(_s(rows[i]['severity'])),
                      ),
                    ),
                    if (_s(rows[i]['title']).isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 3),
                        child: Text(
                          _s(rows[i]['title']),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w800,
                            color: context.textPrimary,
                          ),
                        ),
                      ),
                    if (_s(rows[i]['detail']).isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          _s(rows[i]['detail']),
                          style: GoogleFonts.inter(
                            fontSize: 11.5,
                            height: 1.45,
                            color: context.textSecondary,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  Quiz etkisi — hangi cevap puanı ne yöne kaç puan itti.
// ─────────────────────────────────────────────────────────────────────────

class AicQuizImpact extends StatelessWidget {
  final dynamic items;
  final AicL l;
  const AicQuizImpact({super.key, required this.items, required this.l});

  @override
  Widget build(BuildContext context) {
    final rows = _maps(
      items,
    ).where((x) => _s(x['answer']).isNotEmpty || _s(x['note']).isNotEmpty).toList();
    if (rows.isEmpty) return const SizedBox.shrink();
    final reduced = _reduced(context);
    return _card(
      context,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _title(
            context,
            '🧠 ${l('How your answers shaped this', 'Cevapların sonucu nasıl değiştirdi', 'Wie deine Antworten gewirkt haben')}',
          ),
          for (var i = 0; i < rows.length; i++)
            Padding(
              padding: EdgeInsets.only(bottom: i == rows.length - 1 ? 0 : 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (_s(rows[i]['topic'] ?? rows[i]['question']).isNotEmpty)
                    Text(
                      _s(rows[i]['topic'] ?? rows[i]['question']),
                      style: GoogleFonts.inter(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.3,
                        color: context.textSecondary,
                      ),
                    ),
                  if (_s(rows[i]['answer']).isNotEmpty)
                    Text(
                      '“${_s(rows[i]['answer'])}”',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w800,
                        color: context.textPrimary,
                      ),
                    ),
                  const SizedBox(height: 6),
                  _ImpactMeter(
                    value: _num(rows[i]['impact']).clamp(-100.0, 100.0),
                    reduced: reduced,
                  ),
                  if (_s(rows[i]['note']).isNotEmpty) ...[
                    const SizedBox(height: 5),
                    Text(
                      _s(rows[i]['note']),
                      style: GoogleFonts.inter(
                        fontSize: 11.5,
                        height: 1.45,
                        color: context.textSecondary,
                      ),
                    ),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Ortadan iki yöne açılan etki çubuğu. Renk DEĞERDEN gelir; animasyon yalnızca
/// genişliği sürer (reduced-motion'da anında son hâline oturur).
class _ImpactMeter extends StatelessWidget {
  final double value;
  final bool reduced;
  const _ImpactMeter({required this.value, required this.reduced});

  @override
  Widget build(BuildContext context) {
    final color = value >= 8 ? aicStrong : (value <= -8 ? aicWeak : aicBalanced);
    return LayoutBuilder(
      builder: (context, c) {
        final half = c.maxWidth / 2;
        return SizedBox(
          height: 10,
          child: Stack(
            children: [
              Positioned.fill(
                child: Center(
                  child: Container(
                    height: 8,
                    decoration: BoxDecoration(
                      color: context.dividerColor,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
              ),
              Positioned(
                left: half - 0.5,
                top: 0,
                bottom: 0,
                child: Container(
                  width: 1,
                  color: context.textSecondary.withValues(alpha: 0.5),
                ),
              ),
              TweenAnimationBuilder<double>(
                tween: Tween(begin: reduced ? 1 : 0, end: 1),
                duration: reduced
                    ? Duration.zero
                    : const Duration(milliseconds: 650),
                curve: Curves.easeOutCubic,
                builder: (_, t, _) {
                  final w = half * (value.abs() / 100) * t;
                  return Positioned(
                    left: value >= 0 ? half : half - w,
                    top: 1,
                    child: Container(
                      width: w,
                      height: 8,
                      decoration: BoxDecoration(
                        color: color,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                  );
                },
              ),
            ],
          ),
        );
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  Topluluk temaları — en çok konuşulan başlıklar.
// ─────────────────────────────────────────────────────────────────────────

class AicCommunityThemes extends StatelessWidget {
  final dynamic themes;
  final AicL l;
  const AicCommunityThemes({super.key, required this.themes, required this.l});

  @override
  Widget build(BuildContext context) {
    final rows = _maps(
      themes,
    ).where((x) => _s(x['label']).isNotEmpty).take(8).toList();
    if (rows.isEmpty) return const SizedBox.shrink();
    Color col(String s) =>
        s == 'positive' ? aicStrong : (s == 'negative' ? aicWeak : aicBalanced);
    String face(String s) =>
        s == 'positive' ? '👍' : (s == 'negative' ? '👎' : '🤔');
    return _card(
      context,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _title(
            context,
            '🗣 ${l('What people keep talking about', 'İnsanlar en çok neyi konuşuyor', 'Worüber am meisten gesprochen wird')}',
          ),
          for (var i = 0; i < rows.length; i++)
            Padding(
              padding: EdgeInsets.only(bottom: i == rows.length - 1 ? 0 : 11),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${face(_s(rows[i]['sentiment']))} ${_s(rows[i]['label'])}',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            color: context.textPrimary,
                          ),
                        ),
                      ),
                      Text(
                        '${_num(rows[i]['strength']).clamp(0, 100).round()}%',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w900,
                          color: col(_s(rows[i]['sentiment'])),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  AnimatedBarFill(
                    pct: _num(rows[i]['strength']).clamp(4, 100).toDouble(),
                    color: col(_s(rows[i]['sentiment'])),
                  ),
                  if (_s(rows[i]['detail']).isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 5),
                      child: Text(
                        _s(rows[i]['detail']),
                        style: GoogleFonts.inter(
                          fontSize: 11.5,
                          height: 1.45,
                          color: context.textSecondary,
                        ),
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  Kaynak rozetleri — hangi kaynak türleri tarandı.
// ─────────────────────────────────────────────────────────────────────────

class AicSourceChips extends StatelessWidget {
  final dynamic sources;
  final AicL l;
  const AicSourceChips({super.key, required this.sources, required this.l});

  @override
  Widget build(BuildContext context) {
    if (sources is! List) return const SizedBox.shrink();
    final rows = (sources as List)
        .map((x) => x.toString().trim())
        .where((x) => x.isNotEmpty)
        .take(10)
        .toList();
    if (rows.isEmpty) return const SizedBox.shrink();
    return Wrap(
      spacing: 7,
      runSpacing: 7,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        Text(
          '🔎 ${l('Scanned', 'Tarandı', 'Gescannt')}:',
          style: GoogleFonts.inter(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            color: context.textSecondary,
          ),
        ),
        for (final s in rows)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
            decoration: BoxDecoration(
              color: context.surfaceVariantColor,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: context.dividerColor),
            ),
            child: Text(
              s,
              style: GoogleFonts.inter(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: context.textPrimary,
              ),
            ),
          ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  KPI kutuları — uyum / yaşam uyumu / memnuniyet / kanıt gücü.
// ─────────────────────────────────────────────────────────────────────────

typedef AicStat = ({
  String icon,
  String label,
  String value,
  Color? color,
  String hint,
});

class AicStatTiles extends StatelessWidget {
  final List<AicStat> items;
  const AicStatTiles({super.key, required this.items});

  @override
  Widget build(BuildContext context) {
    final rows = items.where((x) => x.value.trim().isNotEmpty).toList();
    if (rows.isEmpty) return const SizedBox.shrink();
    return LayoutBuilder(
      builder: (context, c) {
        // İki sütun; tek kalan kutu ORTALANIR (simetri kuralı).
        const gap = 10.0;
        final w = (c.maxWidth - gap) / 2;
        return Wrap(
          spacing: gap,
          runSpacing: gap,
          alignment: WrapAlignment.center,
          children: [
            for (final x in rows)
              SizedBox(
                width: w,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: context.surfaceVariantColor,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: context.dividerColor),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        '${x.icon} ${x.label}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.inter(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w800,
                          color: context.textSecondary,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        x.value,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 19,
                          fontWeight: FontWeight.w900,
                          color: x.color ?? context.textPrimary,
                        ),
                      ),
                      if (x.hint.isNotEmpty)
                        Text(
                          x.hint,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.inter(
                            fontSize: 10,
                            color: context.textSecondary,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}
