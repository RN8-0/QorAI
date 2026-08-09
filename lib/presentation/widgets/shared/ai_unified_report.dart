/// Qor AI — ORTAK rapor gövdesi (web `AiReportView.jsx` paritesi).
///
/// 2026-08-08: Site tarafında ürün, karşılaştırma, link ve abonelik
/// analizlerinin hepsi tek bir şablona geçti. Uygulama hâlâ eski çok panelli
/// düzeni çiziyordu; bu dosya o şablonun Flutter karşılığıdır ve
/// `ai_report_view.dart` içindeki ürün + karşılaştırma raporları bunu kullanır.
///
/// Bölüm sırası web ile birebir aynıdır:
///   hero → KPI kutuları → radar + donut/denge → faktör listesi →
///   kritik noktalar → artı/eksi → quiz etkisi → topluluk (temalar, kaynaklar,
///   övgü/şikâyet, özet) → tam değerlendirme → sana uyumu → kime uygun →
///   özellik eşleşmesi → alternatifler → zamanlama → son karar → doğrulama.
library;

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/presentation/widgets/shared/ai_charts.dart';

typedef UrL = String Function(String en, String tr, String de);

int urInt(dynamic v) {
  if (v is num) return v.round();
  final n = double.tryParse(
    (v ?? '').toString().replaceAll(RegExp(r'[^\d.\-]'), ''),
  );
  return n == null ? 0 : n.round();
}

String urStr(dynamic v) => (v ?? '').toString().trim();

List<dynamic> urArr(dynamic v) => v is List
    ? v.where((x) => x != null && x.toString().trim().isNotEmpty).toList()
    : const [];

List<String> urStrs(dynamic v) => urArr(v).map((x) => x.toString()).toList();

/// `["a", {title, detail}]` karışık listeyi tek şekle indirir (web `bullets`).
List<({String title, String detail})> urBullets(dynamic v) {
  final out = <({String title, String detail})>[];
  for (final x in urArr(v)) {
    if (x is Map) {
      final t = urStr(x['title'] ?? x['name']);
      final d = urStr(x['detail'] ?? x['why']);
      if (t.isNotEmpty || d.isNotEmpty) out.add((title: t, detail: d));
    } else {
      final t = x.toString().trim();
      if (t.isNotEmpty) out.add((title: t, detail: ''));
    }
  }
  return out;
}

String urBandLabel(int s, UrL l) => s >= 85
    ? l('Excellent match', 'Mükemmel uyum', 'Exzellent')
    : s >= 70
    ? l('Strong match', 'Güçlü uyum', 'Starke Übereinstimmung')
    : s >= 50
    ? l('Fair match', 'Orta uyum', 'Mäßig')
    : l('Weak match', 'Zayıf uyum', 'Schwach');

/// Rapor bölümü başlığı — web `Sec` bileşeninin karşılığı.
class UrSection extends StatelessWidget {
  final String icon;
  final String title;
  final String meta;
  final Widget child;
  const UrSection({
    super.key,
    required this.icon,
    required this.title,
    required this.child,
    this.meta = '',
  });

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      child: Container(
        width: double.infinity,
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
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: Text(
                    '$icon $title',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: context.textPrimary,
                    ),
                  ),
                ),
                if (meta.isNotEmpty)
                  Text(
                    meta,
                    style: GoogleFonts.inter(
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700,
                      color: context.textSecondary,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 11),
            // İçerik TAM GENİŞLİK alır. Kapsayıcı Column
            // `crossAxisAlignment: start` olduğu için çocuk TIGHT genişlik
            // alıyordu: içinde `alignment: center` olan her şey (donut satırı,
            // ortalanmış grafik) sola yapışık kalıyor ve ortalama HİÇBİR ŞEY
            // yapmıyordu — kullanıcı bunu iki kez bildirdi. Sola dayalı
            // içerikler bundan etkilenmez.
            SizedBox(width: double.infinity, child: child),
          ],
        ),
      ),
    );
  }
}

/// Kime uygun / kime uygun değil kartları — yan yana, EŞİT yükseklikte.
class UrForWho extends StatelessWidget {
  final String bestFor;
  final String notFor;
  final UrL l;
  const UrForWho({
    super.key,
    required this.bestFor,
    required this.notFor,
    required this.l,
  });

  @override
  Widget build(BuildContext context) {
    if (bestFor.isEmpty && notFor.isEmpty) return const SizedBox.shrink();
    Widget card(String emoji, String title, String body, Color color) =>
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.07),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: color.withValues(alpha: 0.32)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$emoji $title',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    fontWeight: FontWeight.w900,
                    color: color,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  body,
                  style: GoogleFonts.inter(
                    fontSize: 12,
                    height: 1.45,
                    color: context.textPrimary,
                  ),
                ),
              ],
            ),
          ),
        );
    final cards = <Widget>[
      if (bestFor.isNotEmpty)
        card('👍', l('Perfect for', 'Tam uygun', 'Perfekt für'), bestFor, aicStrong),
      if (notFor.isNotEmpty)
        card('👎', l('Not for', 'Uygun değil', 'Nicht für'), notFor, aicWeak),
    ];
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < cards.length; i++) ...[
            if (i > 0) const SizedBox(width: 10),
            cards[i],
          ],
        ],
      ),
    );
  }
}

/// Doğrulama notları — "neyi doğruladık, neyi doğrulamadık".
class UrVerify extends StatelessWidget {
  final List<({String title, String detail})> items;
  final String title;
  final String icon;
  const UrVerify({
    super.key,
    required this.items,
    required this.title,
    this.icon = '🔍',
  });

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$icon $title',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 12.5,
              fontWeight: FontWeight.w800,
              color: context.textPrimary,
            ),
          ),
          const SizedBox(height: 7),
          for (final x in items)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                '• ${x.title}${x.detail.isEmpty ? '' : ' — ${x.detail}'}',
                style: GoogleFonts.inter(
                  fontSize: 11.5,
                  height: 1.45,
                  color: context.textSecondary,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
