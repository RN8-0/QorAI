/// Qor AI — Unified AI report renderer (web-parity).
///
/// Flutter port of `web/src/components/AiAnalysis.jsx` + `AiWorkboard.jsx`.
/// Renders the same two report shapes the website does, with the same section
/// order, the same score ring / attribute bars / pro-con cards / feature-match
/// grid / community block / alternative cards / price forecast / factor matrix:
///   • product_full_report  (single product detail)
///   • compare_full_report  (overview + per-product detail modals)
library;

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/presentation/widgets/product_image_box.dart';
import 'package:qor_ai/presentation/widgets/shared/ai_charts.dart';
import 'package:qor_ai/presentation/widgets/shared/ai_unified_report.dart';
import 'package:qor_ai/presentation/widgets/shared/scanning_arc.dart';

// Exact web palette so the app report matches the site 1:1.
const _green = Color(0xFF22C55E);
const _amber = Color(0xFFF59E0B);
const _red = Color(0xFFF43F5E);

Color _scoreColor(num n) => n >= 80 ? _green : (n >= 60 ? _amber : _red);

int _toInt(dynamic v) {
  if (v is num) return v.round();
  final n = double.tryParse(
    (v ?? '').toString().replaceAll(RegExp(r'[^\d.\-]'), ''),
  );
  return n == null ? 0 : n.round();
}

List<dynamic> _arr(dynamic v) {
  if (v is List) {
    return v.where((x) => x != null && x.toString().trim().isNotEmpty).toList();
  }
  return const [];
}

List<String> _strs(dynamic v) => _arr(v).map((x) => x.toString()).toList();

String _str(dynamic v) => (v ?? '').toString().trim();

typedef _L = String Function(String en, String tr, String de);

_L _localizer(String lang) {
  final code = lang.toLowerCase();
  return (en, tr, de) => code.startsWith('tr')
      ? tr
      : code.startsWith('de')
      ? de
      : en;
}

// ─── Public dispatcher ───────────────────────────────────────────────────────

class AiReportView extends StatelessWidget {
  final String kind; // 'productFull' | 'compareFull'
  final Map<String, dynamic> data;
  final String lang;
  final List<dynamic> products; // ProductEntity list (compare column alignment)

  const AiReportView({
    super.key,
    required this.kind,
    required this.data,
    required this.lang,
    this.products = const [],
  });

  @override
  Widget build(BuildContext context) {
    final l = _localizer(lang);
    final type = _str(data['type']);
    if (kind == 'compareFull' || type == 'compare_full_report') {
      return _CompareFullReport(data: data, l: l, products: products);
    }
    return _ProductFullReport(data: data, l: l);
  }
}

// ─── Shared atoms ────────────────────────────────────────────────────────────

class _ScoreRing extends StatelessWidget {
  final double value;
  const _ScoreRing({required this.value});
  static const String suffix = '/ 100';

  @override
  Widget build(BuildContext context) {
    final v = value.clamp(0, 100).toDouble();
    final pct = v / 100;
    final col = _scoreColor((pct * 100));
    // Açılışta yay 0→pct süpürülür ve sayı sayılarak dolar (web ai-ring paritesi).
    final reduced = MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    return SizedBox(
      width: 92,
      height: 92,
      child: TweenAnimationBuilder<double>(
        tween: Tween(begin: reduced ? pct : 0, end: pct),
        duration: reduced ? Duration.zero : const Duration(milliseconds: 900),
        curve: Curves.easeOutCubic,
        builder: (context, t, _) => Stack(
          alignment: Alignment.center,
          children: [
            SizedBox(
              width: 92,
              height: 92,
              child: CustomPaint(
                painter: _RingPainter(progress: t, color: col),
              ),
            ),
            Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  (t * 100).round().toString(),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                    color: col,
                    height: 1,
                  ),
                ),
                Text(
                  suffix,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: col.withValues(alpha: 0.8),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  final double progress;
  final Color color;
  _RingPainter({required this.progress, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final radius = (size.width - 8) / 2;
    final bg = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 8
      ..color = color.withValues(alpha: 0.14);
    final fg = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 8
      ..strokeCap = StrokeCap.round
      ..color = color;
    canvas.drawCircle(center, radius, bg);
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -1.5708,
      6.28318 * progress.clamp(0, 1),
      false,
      fg,
    );
  }

  @override
  bool shouldRepaint(_RingPainter old) =>
      old.progress != progress || old.color != color;
}


class _ProCon extends StatelessWidget {
  final String icon;
  final String title;
  final List<String> items;
  final Color color;
  const _ProCon({
    required this.icon,
    required this.title,
    required this.items,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.05),
        border: Border.all(color: color.withValues(alpha: 0.2)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$icon $title',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 12.5,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
          const SizedBox(height: 6),
          ...items.map(
            (x) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    icon == '✓' ? '✓' : '•',
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      height: 1.4,
                      fontWeight: FontWeight.w800,
                      color: color,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      x,
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        height: 1.4,
                        color: context.textPrimary,
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

class _ProConRow extends StatelessWidget {
  final List<String> pros;
  final List<String> cons;
  final _L l;
  final String? prosTitle;
  final String? consTitle;
  const _ProConRow({
    required this.pros,
    required this.cons,
    required this.l,
    this.prosTitle,
    this.consTitle,
  });

  @override
  Widget build(BuildContext context) {
    if (pros.isEmpty && cons.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: _ProCon(
              icon: '✓',
              title: prosTitle ?? l('Pros', 'Artılar', 'Pro'),
              items: pros,
              color: _green,
            ),
          ),
          if (pros.isNotEmpty && cons.isNotEmpty) const SizedBox(width: 8),
          Expanded(
            child: _ProCon(
              icon: '✕',
              title: consTitle ?? l('Cons', 'Eksiler', 'Contra'),
              items: cons,
              color: _red,
            ),
          ),
        ],
      ),
    );
  }
}

class _Paragraphs extends StatelessWidget {
  final String text;
  const _Paragraphs(this.text);

  @override
  Widget build(BuildContext context) {
    final raw = text.trim();
    if (raw.isEmpty) return const SizedBox.shrink();
    var parts = raw
        .split(RegExp(r'\n{2,}'))
        .map((x) => x.trim())
        .where((x) => x.isNotEmpty)
        .toList();
    if (parts.length <= 1) {
      final sentences = raw
          .split(RegExp(r'(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ0-9])'))
          .map((x) => x.trim())
          .where((x) => x.isNotEmpty)
          .toList();
      parts = [];
      for (var i = 0; i < sentences.length; i += 2) {
        parts.add(
          sentences.sublist(i, (i + 2).clamp(0, sentences.length)).join(' '),
        );
      }
    }
    if (parts.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final p in parts)
          Padding(
            padding: const EdgeInsets.only(bottom: 9),
            child: Text(
              p,
              style: GoogleFonts.inter(
                fontSize: 13,
                height: 1.55,
                color: context.textSecondary,
              ),
            ),
          ),
      ],
    );
  }
}

class _BulletList extends StatelessWidget {
  final List<String> items;
  const _BulletList(this.items);

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final item in items)
          Padding(
            padding: const EdgeInsets.only(bottom: 5),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '•',
                  style: GoogleFonts.inter(
                    fontSize: 12.5,
                    height: 1.45,
                    color: context.textTertiaryColor,
                  ),
                ),
                const SizedBox(width: 7),
                Expanded(
                  child: Text(
                    item,
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      height: 1.45,
                      color: context.textSecondary,
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _ReportSection extends StatelessWidget {
  final String eyebrow;
  final String title;
  final Widget child;
  const _ReportSection({
    required this.eyebrow,
    required this.title,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    // Isolate each section's painting so scrolling a long report doesn't
    // repaint every other section every frame (matters on low-end devices).
    return RepaintBoundary(
      child: Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppTheme.brandBlue.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  eyebrow,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 11,
                    fontWeight: FontWeight.w900,
                    color: AppTheme.brandBlue,
                  ),
                ),
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Text(
                  title,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 14.5,
                    fontWeight: FontWeight.w800,
                    color: context.textPrimary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
      ),
    );
  }
}


class _FeatureMatches extends StatelessWidget {
  final dynamic items;
  final _L l;
  const _FeatureMatches({required this.items, required this.l});

  @override
  Widget build(BuildContext context) {
    final list = _arr(items).map((x) {
      final m = x as Map;
      return (
        label: _str(m['label'] ?? m['name']),
        productValue: _str(m['productValue'] ?? m['value']),
        userNeed: _str(m['userNeed'] ?? m['need']),
        score: _toInt(m['score']),
        comment: _str(m['comment'] ?? m['detail']),
      );
    }).where((x) =>
        x.label.isNotEmpty || x.productValue.isNotEmpty || x.comment.isNotEmpty);
    if (list.isEmpty) return const SizedBox.shrink();
    return Column(
      children: [
        for (final x in list)
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(11),
            decoration: BoxDecoration(
              color: context.surfaceColor,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.dividerColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        x.label.isEmpty
                            ? l('Feature match', 'Özellik eşleşmesi', 'Merkmalsfit')
                            : x.label,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w800,
                          color: context.textPrimary,
                        ),
                      ),
                    ),
                    if (x.score > 0)
                      Text(
                        '${x.score}',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w800,
                          color: _scoreColor(x.score),
                        ),
                      ),
                  ],
                ),
                if (x.productValue.isNotEmpty)
                  _kv(context, l('Product', 'Ürün', 'Produkt'), x.productValue),
                if (x.userNeed.isNotEmpty)
                  _kv(context, l('Need', 'İhtiyaç', 'Bedarf'), x.userNeed),
                if (x.comment.isNotEmpty) ...[
                  const SizedBox(height: 5),
                  Text(
                    x.comment,
                    style: GoogleFonts.inter(
                      fontSize: 11.5,
                      height: 1.4,
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

  Widget _kv(BuildContext context, String k, String v) => Padding(
    padding: const EdgeInsets.only(top: 5),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '$k: ',
          style: GoogleFonts.inter(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: context.textTertiaryColor,
          ),
        ),
        Expanded(
          child: Text(
            v,
            style: GoogleFonts.inter(
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              color: context.textPrimary,
            ),
          ),
        ),
      ],
    ),
  );
}


class _AlternativeCards extends ConsumerWidget {
  final dynamic alternatives;
  final _L l;
  const _AlternativeCards({required this.alternatives, required this.l});

  /// Alternatif bir Qor-katalog ürününün id'sini çıkar: önce a['id'], yoksa
  /// a['url'] sonundaki kayıt id'si (web "/product/slug-RECORDID" biçimi).
  static String _altProductId(Map a) {
    final id = _str(a['id']).trim();
    if (id.isNotEmpty) return id;
    final url = _str(a['url']).trim();
    if (url.isEmpty) return '';
    final seg = url.split('?').first.split('#').first.split('/').last;
    // "galaxy-s25-ultra-RECORDID" → son "-" sonrası; ya da düz id.
    final dash = seg.contains('-') ? seg.split('-').last : seg;
    return dash.length >= 10 ? dash : seg;
  }

  Future<void> _openAlternative(
    BuildContext context,
    WidgetRef ref,
    Map a,
  ) async {
    final id = _altProductId(a);
    if (id.isNotEmpty && id.length >= 10) {
      context.push('/product/$id');
      return;
    }
    // id yok (harici ya da eski kayıtlı analiz) → katalogda isimle ara, varsa aç.
    final name = _str(a['name']).trim();
    if (name.isEmpty) return;
    try {
      final results = await ref
          .read(pbDataSourceProvider)
          .searchProducts(query: name, limit: 1);
      if (results.isEmpty) return;
      final match = results.first;
      // İsim makul ölçüde eşleşiyorsa aç (ilk kelime ortak).
      final n0 = name.toLowerCase();
      final n1 = match.name.toLowerCase();
      final firstWord = n0.split(RegExp(r'\s+')).first;
      if (n1.contains(firstWord) || n0.contains(n1.split(RegExp(r'\s+')).first)) {
        if (context.mounted) context.push('/product/${match.id}');
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = _arr(alternatives);
    if (list.isEmpty) return const SizedBox.shrink();
    return Column(
      children: [
        for (final a0 in list)
          Builder(
            builder: (context) {
              final a = a0 as Map;
              final specs = _arr(a['keySpecs']);
              final img = _str(a['imageUrl']);
              final tappable =
                  _altProductId(a).isNotEmpty ||
                  _str(a['source']) == 'qor_catalog';
              return GestureDetector(
                onTap: tappable ? () => _openAlternative(context, ref, a) : null,
                child: Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(11),
                decoration: BoxDecoration(
                  color: context.surfaceColor,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: tappable
                        ? AppTheme.brandCyan.withValues(alpha: 0.35)
                        : context.dividerColor,
                  ),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _thumb(context, img, 46),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  _str(a['name']),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w800,
                                    color: context.textPrimary,
                                  ),
                                ),
                              ),
                              Text(
                                _str(a['source']) == 'qor_catalog'
                                    ? l('Qor catalog', 'Qor kataloğu', 'Qor-Katalog')
                                    : l('External', 'Harici', 'Extern'),
                                style: GoogleFonts.inter(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                  color: context.textTertiaryColor,
                                ),
                              ),
                            ],
                          ),
                          if (_str(a['shortComment']).isNotEmpty) ...[
                            const SizedBox(height: 4),
                            Text(
                              _str(a['shortComment']),
                              style: GoogleFonts.inter(
                                fontSize: 12,
                                height: 1.4,
                                color: context.textSecondary,
                              ),
                            ),
                          ],
                          if (_str(a['difference']).isNotEmpty) ...[
                            const SizedBox(height: 4),
                            Text(
                              _str(a['difference']),
                              style: GoogleFonts.inter(
                                fontSize: 11.5,
                                height: 1.4,
                                fontStyle: FontStyle.italic,
                                color: context.textTertiaryColor,
                              ),
                            ),
                          ],
                          if (specs.isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Wrap(
                              spacing: 6,
                              runSpacing: 6,
                              children: [
                                for (final s in specs.take(4))
                                  _specPill(
                                    context,
                                    _str((s as Map)['label']),
                                    _str(s['value']),
                                  ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
                ),
              );
            },
          ),
      ],
    );
  }

  Widget _specPill(BuildContext context, String label, String value) =>
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: context.dividerColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: GoogleFonts.inter(
                fontSize: 9,
                color: context.textTertiaryColor,
              ),
            ),
            Text(
              value,
              style: GoogleFonts.inter(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: context.textPrimary,
              ),
            ),
          ],
        ),
      );
}

class _PriceForecastBlock extends StatelessWidget {
  final Map<String, dynamic> data;
  final _L l;
  const _PriceForecastBlock({required this.data, required this.l});

  @override
  Widget build(BuildContext context) {
    final trend = _str(data['trend']).toLowerCase();
    final color = trend == 'down' ? _green : (trend == 'up' ? _red : _amber);
    final label = trend == 'down'
        ? l('Likely to fall', 'Düşme eğiliminde', 'Fällt wahrscheinlich')
        : trend == 'up'
        ? l('Likely to rise', 'Yükselme eğiliminde', 'Steigt wahrscheinlich')
        : l('Likely stable', 'Sabit kalabilir', 'Bleibt eher stabil');
    final confidence = _toInt(data['confidence']);
    final buyOrWait = _str(data['buyOrWait']);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w800,
                      color: color,
                    ),
                  ),
                  if (confidence > 0)
                    Text(
                      '${l('Confidence', 'Güven', 'Sicherheit')}: $confidence%',
                      style: GoogleFonts.inter(
                        fontSize: 11,
                        color: context.textTertiaryColor,
                      ),
                    ),
                ],
              ),
            ),
            if (buyOrWait.isNotEmpty)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  buyOrWait,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: color,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (_str(data['expectedChange']).isNotEmpty)
              Expanded(
                child: _miniCell(
                  context,
                  l('Expected change', 'Beklenen değişim', 'Erwartete Änderung'),
                  _str(data['expectedChange']),
                ),
              ),
            if (_str(data['expectedChange']).isNotEmpty &&
                _str(data['bestTimeToBuy']).isNotEmpty)
              const SizedBox(width: 8),
            if (_str(data['bestTimeToBuy']).isNotEmpty)
              Expanded(
                child: _miniCell(
                  context,
                  l('Best time', 'En iyi zaman', 'Beste Zeit'),
                  _str(data['bestTimeToBuy']),
                ),
              ),
          ],
        ),
        const SizedBox(height: 10),
        _Paragraphs(_str(data['analysis']).isNotEmpty
            ? _str(data['analysis'])
            : _str(data['reasoning'])),
        _BulletList(_strs(data['drivers'])),
      ],
    );
  }

  Widget _miniCell(BuildContext context, String k, String v) => Container(
    padding: const EdgeInsets.all(9),
    decoration: BoxDecoration(
      color: context.surfaceColor,
      borderRadius: BorderRadius.circular(10),
      border: Border.all(color: context.dividerColor),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          k,
          style: GoogleFonts.inter(
            fontSize: 10,
            color: context.textTertiaryColor,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          v,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: context.textPrimary,
          ),
        ),
      ],
    ),
  );
}

// ─── Product full report ─────────────────────────────────────────────────────

/// ORTAK RAPOR GÖVDESİ — web `AiReportView.jsx` ile birebir bölüm sırası.
///
/// Ürün raporu ve karşılaştırmadaki her ürünün detayı bunu çizer; böylece
/// uygulama ile site aynı şablonu, aynı grafikleri kullanır.
class _UnifiedBody extends StatelessWidget {
  final _L l;
  final int score;
  final String headline;
  final String decision; // buy | consider | skip
  final int confidence;
  final int communityScore;
  final Map<String, int> sentiment;
  final dynamic factors;
  final dynamic criticalPoints;
  final dynamic quizInsights;
  final List<String> pros;
  final List<String> cons;
  final dynamic featureMatches;
  final dynamic communityThemes;
  final dynamic sources;
  final List<String> praise;
  final List<String> complaints;
  final String communityAnalysis;
  final String analysis;
  final String personaAnalysis;
  final String bestFor;
  final String notFor;
  final String overallVerdict;
  final List<({String title, String detail})> verification;
  final List<({String title, String detail})> reliability;
  final Widget? alternatives;
  final Widget? priceBlock;

  const _UnifiedBody({
    required this.l,
    required this.score,
    required this.headline,
    required this.decision,
    required this.confidence,
    required this.communityScore,
    required this.sentiment,
    required this.factors,
    required this.criticalPoints,
    required this.quizInsights,
    required this.pros,
    required this.cons,
    required this.featureMatches,
    required this.communityThemes,
    required this.sources,
    required this.praise,
    required this.complaints,
    required this.communityAnalysis,
    required this.analysis,
    required this.personaAnalysis,
    required this.bestFor,
    required this.notFor,
    required this.overallVerdict,
    required this.verification,
    required this.reliability,
    this.alternatives,
    this.priceBlock,
  });

  @override
  Widget build(BuildContext context) {
    final dist = factorDistribution(factors);
    final hasFactors = aicFactors(factors).isNotEmpty;
    final blocks = <Widget>[];

    void add(Widget w) => blocks.add(w);

    // 1 — Hero: skor + karar + tek cümle.
    add(
      Container(
        width: double.infinity,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: context.dividerColor),
        ),
        child: Column(
          // SIMETRI (kullanici istegi): skor halkasi ustte ORTADA, altindaki
          // her sey yatay ortali. Eskiden halka solda, metinler saginda sola
          // dayali duruyordu ve rapor "sola kaymis" gorunuyordu.
          crossAxisAlignment: CrossAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (score > 0) ...[
              _ScoreRing(value: score.toDouble()),
              const SizedBox(height: 10),
            ],
            Text(
              urBandLabel(score, l),
              textAlign: TextAlign.center,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 14,
                fontWeight: FontWeight.w900,
                color: _scoreColor(score),
              ),
            ),
            Text(
              l(
                'Personalized match score',
                'Kişiselleştirilmiş uyum skoru',
                'Personalisierter Match-Score',
              ),
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: context.textSecondary,
              ),
            ),
            if (headline.isNotEmpty) ...[
              const SizedBox(height: 7),
              Text(
                headline,
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(
                  fontSize: 13,
                  height: 1.5,
                  fontWeight: FontWeight.w600,
                  color: context.textPrimary,
                ),
              ),
            ],
            const SizedBox(height: 9),
            DecisionBadge(
              score: decision == 'buy'
                  ? 80
                  : decision == 'skip'
                  ? 30
                  : decision == 'consider'
                  ? 60
                  : score,
              l: l,
            ),
          ],
        ),
      ),
    );

    // 2 — KPI kutuları.
    add(
      AicStatTiles(
        items: [
          (
            icon: '🎯',
            label: l('Match', 'Uyum', 'Match'),
            value: score > 0 ? '$score' : '',
            color: _scoreColor(score),
            hint: urBandLabel(score, l),
          ),
          (
            icon: '🌐',
            label: l(
              'Owner satisfaction',
              'Kullanıcı memnuniyeti',
              'Zufriedenheit',
            ),
            value: communityScore > 0 ? '$communityScore' : '',
            color: _scoreColor(communityScore),
            hint: '',
          ),
          (
            icon: '🔬',
            label: l('Evidence', 'Kanıt gücü', 'Beleglage'),
            value: confidence > 0 ? '$confidence%' : '',
            color: null,
            hint: '',
          ),
        ],
      ),
    );

    // 3 — Grafikler: radar + sentiment donutu + faktör dengesi.
    if (hasFactors) add(AicRadarChart(factors: factors, l: l));
    add(SentimentDonut(breakdown: sentiment, l: l));
    add(
      DistributionBar(
        strong: dist.strong,
        balanced: dist.balanced,
        weak: dist.weak,
        l: l,
      ),
    );

    // 4 — Faktör faktör.
    if (hasFactors) {
      add(
        UrSection(
          icon: '📊',
          title: l('Factor by factor', 'Faktör faktör', 'Faktor für Faktor'),
          child: AicFactorList(factors: factors),
        ),
      );
    }

    // 5 — Kritik noktalar.
    add(AicCriticalPoints(items: criticalPoints, l: l));

    // 6 — Artılar / eksiler.
    if (pros.isNotEmpty || cons.isNotEmpty) {
      add(
        _ProConRow(
          pros: pros,
          cons: cons,
          l: l,
          prosTitle: l('Strengths', 'Güçlü yönler', 'Stärken'),
          consTitle: l('Weaknesses', 'Zayıf yönler', 'Schwächen'),
        ),
      );
    }

    // 7 — Quiz etkisi.
    add(AicQuizImpact(items: quizInsights, l: l));

    // 8 — Topluluk.
    add(AicCommunityThemes(themes: communityThemes, l: l));
    add(AicSourceChips(sources: sources, l: l));
    if (praise.isNotEmpty || complaints.isNotEmpty) {
      add(
        _ProConRow(
          pros: praise,
          cons: complaints,
          l: l,
          prosTitle: l(
            'What owners love',
            'Kullanıcıların sevdiği',
            'Was Nutzer lieben',
          ),
          consTitle: l(
            'What owners complain about',
            'Kullanıcıların şikâyeti',
            'Worüber Nutzer klagen',
          ),
        ),
      );
    }
    if (communityAnalysis.isNotEmpty) {
      add(
        UrSection(
          icon: '🌐',
          title: l('Community reception', 'Topluluk yorumu', 'Community-Echo'),
          meta: communityScore > 0 ? '$communityScore/100' : '',
          child: _Paragraphs(communityAnalysis),
        ),
      );
    }
    if (reliability.isNotEmpty) {
      add(
        UrVerify(
          items: reliability,
          icon: '🛠',
          title: l(
            'Reliability and support',
            'Güvenilirlik ve destek',
            'Zuverlässigkeit und Support',
          ),
        ),
      );
    }

    // 9 — Uzun metinler.
    if (analysis.isNotEmpty) {
      add(
        UrSection(
          icon: '📋',
          title: l('The full picture', 'Tam değerlendirme', 'Das ganze Bild'),
          child: _Paragraphs(analysis),
        ),
      );
    }
    if (personaAnalysis.isNotEmpty) {
      add(
        UrSection(
          icon: '👤',
          title: l('How it fits you', 'Sana uyumu', 'Wie es zu dir passt'),
          meta: score > 0 ? '$score/100' : '',
          child: _Paragraphs(personaAnalysis),
        ),
      );
    }

    // 10 — Kime uygun / değil.
    add(UrForWho(bestFor: bestFor, notFor: notFor, l: l));

    // 11 — Özellik-ihtiyaç eşleşmesi (varsayılan kapalı).
    if (urArr(featureMatches).isNotEmpty) {
      add(
        AiCollapsible(
          label:
              '🧩 ${l('Feature-by-need breakdown', 'Özellik–ihtiyaç eşleşmesi', 'Funktion-Bedarf-Abgleich')}',
          builder: (context) => _FeatureMatches(items: featureMatches, l: l),
        ),
      );
    }

    // 12 — Alternatifler ve zamanlama (çağıran verirse).
    if (alternatives != null) add(alternatives!);
    if (priceBlock != null) add(priceBlock!);

    // 13 — Son karar.
    if (overallVerdict.isNotEmpty) {
      add(
        UrSection(
          icon: '🏁',
          title: l('Final verdict', 'Son karar', 'Endgültiges Fazit'),
          child: _Paragraphs(overallVerdict),
        ),
      );
    }

    // 14 — Neyi doğruladık.
    if (verification.isNotEmpty) {
      add(
        UrVerify(
          items: verification,
          title: l(
            'What is verified, what is not',
            'Neyi doğruladık, neyi doğrulamadık',
            'Was belegt ist',
          ),
        ),
      );
    }

    final visible = blocks.where((w) => w is! SizedBox).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < visible.length; i++) ...[
          if (i > 0) const SizedBox(height: 12),
          visible[i],
        ],
      ],
    );
  }
}

class _ProductFullReport extends StatelessWidget {
  final Map<String, dynamic> data;
  final _L l;
  const _ProductFullReport({required this.data, required this.l});

  @override
  Widget build(BuildContext context) {
    final product = (data['product'] is Map)
        ? Map<String, dynamic>.from(data['product'])
        : <String, dynamic>{};
    final community = (data['community'] is Map)
        ? Map<String, dynamic>.from(data['community'])
        : <String, dynamic>{};
    final price = (data['priceForecast'] is Map)
        ? Map<String, dynamic>.from(data['priceForecast'])
        : <String, dynamic>{};
    final match = _toInt(product['matchScore'] ?? product['overallScore']);
    final satisfaction = _toInt(community['satisfaction']);
    return _UnifiedBody(
      l: l,
      score: match,
      headline: _str(product['headline']).isNotEmpty
          ? _str(product['headline'])
          : firstSentencesOf(_str(product['matchComment'])),
      decision: _str(product['decision']),
      confidence: _toInt(product['confidence']),
      communityScore: satisfaction,
      sentiment: normalizeSentiment(
        community['sentimentBreakdown'] ?? community['sentiment_breakdown'],
        satisfaction > 0 ? satisfaction : match,
      ),
      factors: product['factors'],
      criticalPoints: product['criticalPoints'],
      quizInsights: product['quizInsights'],
      pros: _strs(product['strengths']),
      cons: _strs(product['weaknesses']),
      featureMatches: product['featureMatches'],
      communityThemes: community['themes'],
      sources: community['sources'],
      praise: _strs(community['pros']),
      complaints: _strs(community['cons']),
      communityAnalysis: _str(community['summary']),
      analysis: _str(product['analysis']),
      personaAnalysis: _str(product['matchComment']),
      bestFor: _str(product['bestFor']),
      notFor: _str(product['notFor']),
      overallVerdict: _str(product['overallVerdict']),
      verification: urBullets(community['verificationNotes']),
      reliability: urBullets(product['reliabilityNotes']),
      alternatives: _arr(data['alternatives']).isEmpty
          ? null
          : UrSection(
              icon: '🔀',
              title: l(
                'Smart alternatives',
                'Akıllı alternatifler',
                'Intelligente Alternativen',
              ),
              child: _AlternativeCards(
                alternatives: data['alternatives'],
                l: l,
              ),
            ),
      priceBlock: price.isEmpty
          ? null
          : UrSection(
              icon: '⏱',
              title: l(
                'Timing and value',
                'Zamanlama ve değer',
                'Timing und Wert',
              ),
              child: _PriceForecastBlock(data: price, l: l),
            ),
    );
  }
}

// ─── Compare full report ─────────────────────────────────────────────────────

class _CompareScoreChart extends StatelessWidget {
  final dynamic chart;
  final _L l;
  const _CompareScoreChart({required this.chart, required this.l});

  @override
  Widget build(BuildContext context) {
    final rows = _arr(chart)
        .map((x) => (
              name: _str((x as Map)['name']),
              score: _toInt(x['score']),
              reason: _str(x['reason']),
            ))
        .where((x) => x.name.isNotEmpty)
        .toList();
    if (rows.isEmpty) return const SizedBox.shrink();
    final max = rows.map((r) => r.score).fold<int>(1, (a, b) => a > b ? a : b);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final r in rows)
          Padding(
            padding: const EdgeInsets.only(bottom: 9),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        r.name,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary,
                        ),
                      ),
                    ),
                    Text(
                      '${r.score}',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12.5,
                        fontWeight: FontWeight.w800,
                        color: _scoreColor(r.score),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                AnimatedBarFill(
                  pct: ((r.score / max) * 100).clamp(4, 100).toDouble(),
                  color: _scoreColor(r.score),
                ),
                if (r.reason.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    r.reason,
                    style: GoogleFonts.inter(
                      fontSize: 11,
                      color: context.textTertiaryColor,
                    ),
                  ),
                ],
              ],
            ),
          ),
        Text(
          l(
            'Final scores are personalized to the comparison quiz.',
            'Final puanlar karşılaştırma quizine göre kişiselleştirildi.',
            'Endwerte sind auf das Vergleichsquiz personalisiert.',
          ),
          style: GoogleFonts.inter(
            fontSize: 11,
            fontStyle: FontStyle.italic,
            color: context.textTertiaryColor,
          ),
        ),
      ],
    );
  }
}

class _FactorMatrix extends StatelessWidget {
  final dynamic rows;
  const _FactorMatrix({required this.rows});

  @override
  Widget build(BuildContext context) {
    final list = _arr(rows)
        .where((x) => _str((x as Map)['label']).isNotEmpty && x['scores'] is List)
        .toList();
    if (list.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final row0 in list)
          Builder(
            builder: (context) {
              final row = row0 as Map;
              final scores = _arr(row['scores']);
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _str(row['label']),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: context.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 5),
                    for (final s in scores)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Row(
                          children: [
                            SizedBox(
                              width: 96,
                              child: Text(
                                _str((s as Map)['name']),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: GoogleFonts.inter(
                                  fontSize: 10.5,
                                  color: context.textSecondary,
                                ),
                              ),
                            ),
                            Expanded(
                              child: AnimatedBarFill(
                                pct: _toInt(s['score']).toDouble().clamp(4, 100),
                                color: _scoreColor(_toInt(s['score'])),
                                height: 6,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              '${_toInt(s['score'])}',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                                color: _scoreColor(_toInt(s['score'])),
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              );
            },
          ),
      ],
    );
  }
}

class _CompareProductDetail extends StatelessWidget {
  final Map<String, dynamic> data;
  final _L l;
  const _CompareProductDetail({required this.data, required this.l});

  @override
  Widget build(BuildContext context) {
    final community = (data['community'] is Map)
        ? Map<String, dynamic>.from(data['community'])
        : <String, dynamic>{};
    final price = (data['priceForecast'] is Map)
        ? Map<String, dynamic>.from(data['priceForecast'])
        : <String, dynamic>{};
    final match = _toInt(data['matchScore']);
    final satisfaction = _toInt(community['satisfaction']);
    return _UnifiedBody(
      l: l,
      score: match,
      headline: _str(data['headline']).isNotEmpty
          ? _str(data['headline'])
          : firstSentencesOf(_str(data['matchComment'])),
      decision: _str(data['decision']),
      confidence: _toInt(data['confidence']),
      communityScore: satisfaction,
      sentiment: normalizeSentiment(
        community['sentimentBreakdown'] ?? community['sentiment_breakdown'],
        satisfaction > 0 ? satisfaction : match,
      ),
      factors: data['factors'],
      criticalPoints: data['criticalPoints'],
      quizInsights: data['quizInsights'],
      pros: _strs(data['pros']),
      cons: _strs(data['cons']),
      featureMatches: data['featureMatches'],
      communityThemes: community['themes'],
      sources: community['sources'],
      praise: _strs(community['pros']),
      complaints: _strs(community['cons']),
      communityAnalysis: _str(community['summary']),
      analysis: _str(data['analysis']),
      personaAnalysis: _str(data['matchComment']),
      bestFor: _str(data['bestFor']),
      notFor: _str(data['notFor']),
      overallVerdict: _str(data['overallVerdict']),
      verification: urBullets(community['verificationNotes']),
      reliability: urBullets(data['reliabilityNotes']),
      priceBlock: price.isEmpty
          ? null
          : UrSection(
              icon: '⏱',
              title: l(
                'Timing and value',
                'Zamanlama ve değer',
                'Timing und Wert',
              ),
              child: _PriceForecastBlock(data: price, l: l),
            ),
    );
  }
}

String _displayName(dynamic product, String lang) {
  try {
    return (product as dynamic).nameForLanguage(lang) as String;
  } catch (_) {
    try {
      return (product as dynamic).name as String;
    } catch (_) {
      return '';
    }
  }
}

String _displayImage(dynamic product) {
  try {
    final v = (product as dynamic).imageUrl;
    if (v is String) return v;
  } catch (_) {}
  return '';
}

/// Per-product community-satisfaction donuts, side by side (web mini-donuts).
class _CompareMiniDonuts extends StatelessWidget {
  final List<({Map<String, dynamic> ai, String image, String name})> columns;
  final _L l;
  const _CompareMiniDonuts({required this.columns, required this.l});

  @override
  Widget build(BuildContext context) {
    final donuts = <({String name, Map<String, int> sentiment})>[];
    for (final c in columns) {
      final community = (c.ai['community'] is Map)
          ? Map<String, dynamic>.from(c.ai['community'] as Map)
          : <String, dynamic>{};
      final sat = _toInt(community['satisfaction']);
      final bd = community['sentimentBreakdown'] ?? community['sentiment_breakdown'];
      if (sat <= 0 && bd == null) continue;
      donuts.add((
        name: c.name,
        sentiment: normalizeSentiment(bd, sat > 0 ? sat : _toInt(c.ai['matchScore'])),
      ));
    }
    if (donuts.length < 2) return const SizedBox.shrink();
    return _ReportSection(
      eyebrow: '💬',
      title: l('Community satisfaction', 'Topluluk memnuniyeti', 'Community-Zufriedenheit'),
      // SIMETRI: donutlar yatay scroll + Row icinde SOLA DAYALI duruyordu
      // (kullanici: "yatay olarak ortalanmiyor hala kenarda"). Wrap ile hem
      // ORTALANIR hem de cok servis oldugunda alt satira gecer — yatay kaydirma
      // gerekmez, hicbir donut ekran disinda kalmaz.
      child: Wrap(
        alignment: WrapAlignment.center,
        runAlignment: WrapAlignment.center,
        spacing: 16,
        runSpacing: 14,
        children: [
          for (final d in donuts)
            SizedBox(
              width: 104,
              child: Column(
                  children: [
                    AicDonut(
                      segments: [
                        (value: (d.sentiment['positive'] ?? 0).toDouble(), color: aicStrong),
                        (value: (d.sentiment['neutral'] ?? 0).toDouble(), color: aicBalanced),
                        (value: (d.sentiment['negative'] ?? 0).toDouble(), color: aicWeak),
                      ],
                      centerValue: '${d.sentiment['positive'] ?? 0}%',
                      size: 84,
                      thickness: 10,
                    ),
                    const SizedBox(height: 6),
                    SizedBox(
                      width: 100,
                      child: Text(
                        d.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary,
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

class _CompareFullReport extends StatelessWidget {
  final Map<String, dynamic> data;
  final _L l;
  final List<dynamic> products;
  const _CompareFullReport({
    required this.data,
    required this.l,
    required this.products,
  });

  String _norm(String s) =>
      s.toLowerCase().replaceAll(RegExp(r'\s+'), ' ').trim();

  @override
  Widget build(BuildContext context) {
    final aiProducts = _arr(data['products']).cast<dynamic>();
    final cmp = (data['comparison'] is Map)
        ? Map<String, dynamic>.from(data['comparison'])
        : <String, dynamic>{};
    final code = Localizations.localeOf(context).languageCode;

    // Align columns with the real product order (by name, fallback to index).
    final columns = <({Map<String, dynamic> ai, String image, String name})>[];
    if (products.isNotEmpty) {
      for (var i = 0; i < products.length; i++) {
        final name = _displayName(products[i], code);
        Map<String, dynamic> ai = {};
        for (final ap in aiProducts) {
          if (ap is Map && _norm(_str(ap['name'])) == _norm(name)) {
            ai = Map<String, dynamic>.from(ap);
            break;
          }
        }
        if (ai.isEmpty && i < aiProducts.length && aiProducts[i] is Map) {
          ai = Map<String, dynamic>.from(aiProducts[i] as Map);
        }
        columns.add((
          ai: ai,
          image: _displayImage(products[i]).isNotEmpty
              ? _displayImage(products[i])
              : _str(ai['imageUrl']),
          name: name,
        ));
      }
    } else {
      for (final ap in aiProducts) {
        if (ap is Map) {
          final m = Map<String, dynamic>.from(ap);
          columns.add((
            ai: m,
            image: _str(m['imageUrl']),
            name: _str(m['name']),
          ));
        }
      }
    }

    final winnerNorm = _norm(_str(cmp['winner']));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _ComparisonOverview(cmp: cmp, l: l),
        _CompareMiniDonuts(columns: columns, l: l),
        if (columns.isNotEmpty)
          _ReportSection(
            eyebrow: l('AI', 'AI', 'KI'),
            title: l('Open each detailed review', 'Her ürünün detaylı incelemesini aç',
                'Jede Detailanalyse öffnen'),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  l('Tap a product to open its full AI review in detail.',
                      'Tam AI incelemesini görmek için bir ürüne dokun.',
                      'Tippe ein Produkt für die vollständige KI-Analyse.'),
                  style: GoogleFonts.inter(
                    fontSize: 11.5,
                    color: context.textTertiaryColor,
                  ),
                ),
                const SizedBox(height: 10),
                for (final c in columns)
                  _CompareColumnCard(
                    name: c.name,
                    image: c.image,
                    ai: c.ai,
                    isWinner: winnerNorm.isNotEmpty && _norm(c.name) == winnerNorm,
                    l: l,
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

class _CompareColumnCard extends StatelessWidget {
  final String name;
  final String image;
  final Map<String, dynamic> ai;
  final bool isWinner;
  final _L l;
  const _CompareColumnCard({
    required this.name,
    required this.image,
    required this.ai,
    required this.isWinner,
    required this.l,
  });

  @override
  Widget build(BuildContext context) {
    final score = _toInt(ai['matchScore']);
    final summary = _firstSentences(_str(ai['matchComment']), 2);
    return GestureDetector(
      onTap: ai.isEmpty
          ? null
          : () => _openModal(context, name, image, ai, l),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isWinner
                ? _green.withValues(alpha: 0.5)
                : context.dividerColor,
            width: isWinner ? 1.4 : 1,
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _thumb(context, image, 52),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      if (isWinner) ...[
                        const Text('★', style: TextStyle(color: _green, fontSize: 13)),
                        const SizedBox(width: 4),
                      ],
                      Expanded(
                        child: Text(
                          name,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13.5,
                            fontWeight: FontWeight.w800,
                            color: context.textPrimary,
                          ),
                        ),
                      ),
                      if (score > 0)
                        Text(
                          '$score',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 16,
                            fontWeight: FontWeight.w900,
                            color: _scoreColor(score),
                          ),
                        ),
                    ],
                  ),
                  if (isWinner)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        l('AI pick', 'AI seçimi', 'KI-Wahl'),
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          color: _green,
                        ),
                      ),
                    ),
                  if (summary.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      summary,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.inter(
                        fontSize: 11.5,
                        height: 1.4,
                        color: context.textSecondary,
                      ),
                    ),
                  ],
                  const SizedBox(height: 6),
                  Text(
                    '${l('View full review', 'Detaylı incele', 'Vollständige Analyse')} →',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w800,
                      color: AppTheme.brandBlue,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

void _openModal(
  BuildContext context,
  String name,
  String image,
  Map<String, dynamic> ai,
  _L l,
) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) {
      return DraggableScrollableSheet(
        initialChildSize: 0.92,
        minChildSize: 0.5,
        maxChildSize: 0.96,
        expand: false,
        builder: (ctx, scrollController) {
          return Container(
            decoration: BoxDecoration(
              color: ctx.surfaceColor,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
            ),
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 12, 8),
                  child: Row(
                    children: [
                      _thumb(ctx, image, 44),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              l('Full AI review', 'Detaylı AI incelemesi', 'Vollständige KI-Analyse'),
                              style: GoogleFonts.inter(
                                fontSize: 11,
                                color: ctx.textTertiaryColor,
                              ),
                            ),
                            Text(
                              name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 15,
                                fontWeight: FontWeight.w800,
                                color: ctx.textPrimary,
                              ),
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        icon: Icon(Icons.close_rounded, color: ctx.textSecondary),
                        onPressed: () => Navigator.of(ctx).pop(),
                      ),
                    ],
                  ),
                ),
                Divider(height: 1, color: ctx.dividerColor),
                Expanded(
                  child: SingleChildScrollView(
                    controller: scrollController,
                    padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
                    child: _CompareProductDetail(data: ai, l: l),
                  ),
                ),
              ],
            ),
          );
        },
      );
    },
  );
}

class _ComparisonOverview extends StatelessWidget {
  final Map<String, dynamic> cmp;
  final _L l;
  const _ComparisonOverview({required this.cmp, required this.l});

  @override
  Widget build(BuildContext context) {
    final winner = _str(cmp['winner']);
    final hasContent = winner.isNotEmpty ||
        _arr(cmp['chart']).isNotEmpty ||
        _arr(cmp['factorMatrix']).isNotEmpty ||
        _arr(cmp['decisiveDifferences']).isNotEmpty ||
        _str(cmp['headToHead']).isNotEmpty ||
        _str(cmp['recommendation']).isNotEmpty;
    if (!hasContent) return const SizedBox.shrink();
    final winnerScore = _toInt(cmp['winnerScore']);
    return _ReportSection(
      eyebrow: l('AI overall comparison', 'AI genel karşılaştırma', 'KI-Gesamtvergleich'),
      title: l('Which one wins for you', 'Senin için hangisi kazanıyor', 'Was für dich gewinnt'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (winner.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: _green.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: _green.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  const Text('★', style: TextStyle(color: _green, fontSize: 18)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          l('Recommended pick', 'Önerilen seçim', 'Empfohlene Wahl'),
                          style: GoogleFonts.inter(
                            fontSize: 10.5,
                            color: context.textTertiaryColor,
                          ),
                        ),
                        Text(
                          winner,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 14.5,
                            fontWeight: FontWeight.w900,
                            color: context.textPrimary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (winnerScore > 0)
                    Text(
                      '$winnerScore',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                        color: _green,
                      ),
                    ),
                ],
              ),
            ),
          _CompareScoreChart(chart: cmp['chart'], l: l),
          const SizedBox(height: 6),
          _FactorMatrix(rows: cmp['factorMatrix']),
          if (_arr(cmp['decisiveDifferences']).isNotEmpty ||
              _str(cmp['headToHead']).isNotEmpty ||
              _str(cmp['recommendation']).isNotEmpty)
            AiCollapsible(
              label: '📖 ${l('Detailed comparison', 'Detaylı karşılaştırma', 'Detaillierter Vergleich')}',
              builder: (context) => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _BulletList(_strs(cmp['decisiveDifferences'])),
                  _Paragraphs(_str(cmp['headToHead'])),
                  if (_str(cmp['recommendation']).isNotEmpty)
                    Container(
                      margin: const EdgeInsets.only(top: 8),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppTheme.brandBlue.withValues(alpha: 0.06),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppTheme.brandBlue.withValues(alpha: 0.18)),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('✓', style: TextStyle(color: _green, fontSize: 15)),
                          const SizedBox(width: 8),
                          Expanded(child: _Paragraphs(_str(cmp['recommendation']))),
                        ],
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

String _firstSentences(String text, int n) {
  final raw = text.replaceAll(RegExp(r'\s+'), ' ').trim();
  if (raw.isEmpty) return '';
  final parts = raw.split(RegExp(r'(?<=[.!?])\s+'));
  return parts.length > n ? parts.take(n).join(' ') : raw;
}

Widget _thumb(BuildContext context, String url, double size) {
  if (url.trim().isEmpty) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: context.dividerColor),
      ),
      child: Icon(
        Icons.devices_other_rounded,
        size: size * 0.42,
        color: context.textTertiaryColor,
      ),
    );
  }
  // Use the app's standard product image box (white slot + BoxFit.scaleDown) so
  // product photos keep their real aspect ratio — identical to everywhere else
  // and to the PB/admin rendering — instead of looking stretched/wide.
  return ProductImageBox(
    imageUrl: url,
    width: size,
    height: size,
    borderRadius: BorderRadius.circular(10),
    padding: const EdgeInsets.all(4),
  );
}

// ─── Workboard (live progress) ───────────────────────────────────────────────

class AiReportWorkboard extends StatefulWidget {
  final String lang;
  final String mode; // 'product' | 'compare'
  final AiReportStageLite stage;

  /// Analizin (arka planda) GERÇEK başlama zamanı. Verilirse ilerleme bu
  /// zamandan TÜRETİLİR (widget-yerel sayaç yerine) → kullanıcı sayfadan çıkıp
  /// dönse bile ilerleme sıfırlanmaz/zıplamaz, arka plandaki işle SENKRON kalır.
  /// null ise eski adım-adım (stepper) davranışına düşer (link/abonelik).
  final DateTime? startedAt;

  const AiReportWorkboard({
    super.key,
    required this.lang,
    this.mode = 'product',
    this.stage = AiReportStageLite.prep,
    this.startedAt,
  });

  @override
  State<AiReportWorkboard> createState() => _AiReportWorkboardState();
}

/// Mirror of the service stage for the UI (kept here to avoid importing the
/// service into the widget layer just for an enum).
enum AiReportStageLite { prep, research, report }

class _AiReportWorkboardState extends State<AiReportWorkboard>
    with SingleTickerProviderStateMixin {
  int _active = 0;

  // Orb pulse — transient (yalnızca yükleme ekranı görünürken çalışır), bu
  // yüzden sürekli-frame perf sorunu yaratmaz. Sürekli dönen tarama halkası
  // ayrı, self-contained [ScanningArc] widget'ıyla sağlanır.
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  )..repeat(reverse: true);

  // Adım ikonları (abonelik akışındaki gibi). steps ile aynı sırada.
  static const _icons = <String, List<IconData>>{
    'product': [
      Icons.inventory_2_rounded,
      Icons.person_rounded,
      Icons.travel_explore_rounded,
      Icons.auto_graph_rounded,
      Icons.swap_horizontal_circle_rounded,
      Icons.description_rounded,
    ],
    'compare': [
      Icons.inventory_2_rounded,
      Icons.person_rounded,
      Icons.travel_explore_rounded,
      Icons.compare_arrows_rounded,
      Icons.auto_graph_rounded,
      Icons.verified_rounded,
    ],
    'link': [
      Icons.link_rounded,
      Icons.person_rounded,
      Icons.travel_explore_rounded,
      Icons.auto_graph_rounded,
      Icons.swap_horizontal_circle_rounded,
      Icons.description_rounded,
    ],
  };

  static const _sets = <String, Map<String, dynamic>>{
    'product': {
      'title': ['Building your report', 'Raporun hazırlanıyor', 'Bericht wird erstellt'],
      'steps': [
        ['Reading catalog specs', 'Katalog özellikleri okunuyor', 'Katalogdaten werden gelesen'],
        ['Applying your profile & answers', 'Profilin ve cevapların uygulanıyor', 'Profil & Antworten werden angewendet'],
        ['Running current web research', 'Güncel web araştırması yapılıyor', 'Aktuelle Webrecherche läuft'],
        ['Scoring match factors', 'Uyum faktörleri puanlanıyor', 'Match-Faktoren werden bewertet'],
        ['Checking alternatives and price timing', 'Alternatifler ve fiyat zamanlaması kontrol ediliyor', 'Alternativen und Preis-Timing werden geprüft'],
        ['Composing the final report', 'Son rapor hazırlanıyor', 'Der Bericht wird zusammengestellt'],
      ],
    },
    'compare': {
      'title': ['Building the comparison', 'Karşılaştırma hazırlanıyor', 'Vergleich wird erstellt'],
      'steps': [
        ['Reading the selected products', 'Seçili ürünler okunuyor', 'Ausgewählte Produkte werden gelesen'],
        ['Applying your profile & answers', 'Profilin ve cevapların uygulanıyor', 'Profil & Antworten werden angewendet'],
        ['Running current web research', 'Güncel web araştırması yapılıyor', 'Aktuelle Webrecherche läuft'],
        ['Comparing specs head-to-head', 'Özellikler karşılıklı karşılaştırılıyor', 'Specs werden direkt verglichen'],
        ['Scoring the best fit for you', 'Sana en uygunu puanlanıyor', 'Beste Wahl wird bewertet'],
        ['Composing the verdict', 'Sonuç hazırlanıyor', 'Fazit wird erstellt'],
      ],
    },
    'link': {
      'title': ['Analyzing the link', 'Bağlantı analiz ediliyor', 'Link wird analysiert'],
      'steps': [
        ['Reading the product page', 'Ürün sayfası okunuyor', 'Produktseite wird gelesen'],
        ['Applying your profile & answers', 'Profilin ve cevapların uygulanıyor', 'Profil & Antworten werden angewendet'],
        ['Running current web research', 'Güncel web araştırması yapılıyor', 'Aktuelle Webrecherche läuft'],
        ['Scoring match factors', 'Uyum faktörleri puanlanıyor', 'Match-Faktoren werden bewertet'],
        ['Checking alternatives and price timing', 'Alternatifler ve fiyat zamanlaması kontrol ediliyor', 'Alternativen und Preis-Timing werden geprüft'],
        ['Composing the final report', 'Son rapor hazırlanıyor', 'Der Bericht wird zusammengestellt'],
      ],
    },
  };

  static const _stageCeil = {
    AiReportStageLite.prep: 1,
    AiReportStageLite.research: 2,
    AiReportStageLite.report: 99,
  };

  int get _ceil {
    final steps = (_sets[widget.mode]?['steps'] as List).length - 1;
    final c = _stageCeil[widget.stage] ?? steps;
    return c < steps ? c : steps;
  }

  bool get _timeBased => widget.startedAt != null;

  // Zaman-tabanlı ilerleme için düzenli yeniden çizim (0 → asimptotik ~0.96).
  Timer? _progressTimer;

  /// Aşamaya göre ilerleme TAVANI — gerçek aşamanın önüne geçmesin
  /// (araştırma sürerken "rapor bitti" görünmesin).
  double get _stageCapFrac => switch (widget.stage) {
    AiReportStageLite.prep => 0.30,
    AiReportStageLite.research => 0.62,
    AiReportStageLite.report => 0.96,
  };

  /// Geçen SÜREDEN türeyen ilerleme (0..1). Asimptotik: hiç 1'e ulaşmaz,
  /// analiz bitince workboard zaten AiReportView ile değişir.
  double get _timeFrac {
    final started = widget.startedAt;
    if (started == null) return 0;
    final sec = DateTime.now().difference(started).inMilliseconds / 1000.0;
    final t = 0.96 * (1 - math.exp(-sec / 20.0));
    final capped = t < _stageCapFrac ? t : _stageCapFrac;
    return capped.clamp(0.03, 0.98);
  }

  @override
  void didUpdateWidget(AiReportWorkboard old) {
    super.didUpdateWidget(old);
    if (_timeBased) {
      _startProgressTimer();
    } else {
      _progressTimer?.cancel();
      _progressTimer = null;
      _tick();
    }
  }

  @override
  void initState() {
    super.initState();
    if (_timeBased) {
      _startProgressTimer();
    } else {
      _tick();
    }
  }

  void _startProgressTimer() {
    if (_progressTimer != null) return;
    _progressTimer = Timer.periodic(const Duration(milliseconds: 250), (_) {
      if (!mounted) {
        _progressTimer?.cancel();
        return;
      }
      setState(() {});
    });
  }

  void _tick() {
    if (!mounted || _timeBased) return;
    if (_active >= _ceil) return;
    Future.delayed(Duration(milliseconds: _active == 0 ? 500 : 1300), () {
      if (!mounted) return;
      setState(() => _active = (_active + 1).clamp(0, _ceil));
      _tick();
    });
  }

  String _t(List<dynamic> a) {
    final code = widget.lang.toLowerCase();
    return (code.startsWith('tr')
            ? a[1]
            : code.startsWith('de')
            ? a[2]
            : a[0])
        .toString();
  }

  @override
  void dispose() {
    _progressTimer?.cancel();
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final set = _sets[widget.mode] ?? _sets['product']!;
    final steps = set['steps'] as List;
    final icons = _icons[widget.mode] ?? _icons['product']!;
    final total = steps.length;
    final double ringValue;
    final int percent;
    final int activeStep;
    if (_timeBased) {
      final frac = _timeFrac;
      ringValue = frac;
      percent = (frac * 100).round();
      activeStep = (frac * total).floor().clamp(0, total - 1);
    } else {
      final done = _active.clamp(0, total);
      ringValue = total == 0 ? 0.0 : done / total;
      percent = total == 0 ? 0 : ((done / total) * 100).round();
      activeStep = _active.clamp(0, total - 1);
    }
    final activeIdx = activeStep;
    final activeLabel = _t(steps[activeIdx] as List);
    final activeIcon = icons[activeIdx.clamp(0, icons.length - 1)];

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 22),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── Büyük orb: ilerleme halkası + nabız + çekirdek (ikon + %) ──
          Center(
            child: SizedBox(
              width: 150,
              height: 150,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  SizedBox(
                    width: 150,
                    height: 150,
                    child: TweenAnimationBuilder<double>(
                      duration: const Duration(milliseconds: 700),
                      curve: Curves.easeOutCubic,
                      tween: Tween(begin: 0, end: ringValue),
                      builder: (ctx, value, _) => CircularProgressIndicator(
                        value: value,
                        strokeWidth: 6,
                        strokeCap: StrokeCap.round,
                        backgroundColor: AppTheme.brandBlue.withValues(
                          alpha: 0.10,
                        ),
                        color: AppTheme.brandCyan,
                      ),
                    ),
                  ),
                  // Sürekli dönen tarama arkı — belirleyici halka bir aşamada
                  // beklerken bile bu döner, "işlem devam ediyor" hissi verir.
                  // İÇ halkada döner: dıştaki gerçek-ilerleme halkasıyla (150)
                  // ÇAKIŞMASIN diye belirgin şekilde küçük + ince (kullanıcı isteği).
                  const ScanningArc(
                    size: 112,
                    strokeWidth: 5,
                    color: AppTheme.brandCyan,
                  ),
                  AnimatedBuilder(
                    animation: _pulse,
                    builder: (ctx, _) => Container(
                      width: 108 + _pulse.value * 8,
                      height: 108 + _pulse.value * 8,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(
                          colors: [
                            AppTheme.brandBlue.withValues(
                              alpha: 0.22 + _pulse.value * 0.12,
                            ),
                            AppTheme.brandBlue.withValues(alpha: 0.0),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Container(
                    width: 84,
                    height: 84,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const LinearGradient(
                        colors: [AppTheme.brandBlue, AppTheme.brandDeepBlue],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: AppTheme.brandBlue.withValues(alpha: 0.35),
                          blurRadius: 18,
                          offset: const Offset(0, 6),
                        ),
                      ],
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(activeIcon, color: Colors.white, size: 26),
                        const SizedBox(height: 2),
                        Text(
                          '$percent%',
                          style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w900,
                            fontSize: 15,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          // ── Aktif adım etiketi ──
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 250),
            child: Text(
              activeLabel,
              key: ValueKey(activeLabel),
              textAlign: TextAlign.center,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 15.5,
                fontWeight: FontWeight.w800,
                color: context.textPrimary,
              ),
            ),
          ),
          const SizedBox(height: 18),
          // ── Adım listesi (timeline) ──
          for (var i = 0; i < steps.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 11),
              child: Row(
                children: [
                  Container(
                    width: 26,
                    height: 26,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: i < activeStep
                          ? _green
                          : (i == activeStep
                                ? AppTheme.brandBlue
                                : context.dividerColor),
                    ),
                    child: i < activeStep
                        ? const Icon(Icons.check, size: 15, color: Colors.white)
                        : Icon(
                            icons[i.clamp(0, icons.length - 1)],
                            size: 14,
                            color: i == activeStep
                                ? Colors.white
                                : context.textTertiaryColor,
                          ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      _t(steps[i] as List),
                      style: GoogleFonts.inter(
                        fontSize: 12.5,
                        fontWeight: i == activeStep
                            ? FontWeight.w700
                            : FontWeight.w500,
                        color: i <= activeStep
                            ? context.textPrimary
                            : context.textTertiaryColor,
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
