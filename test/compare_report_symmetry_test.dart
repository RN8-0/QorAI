// KARSILASTIRMA/ABONELIK raporu simetrisi.
//
// BUG (kullanici, iki kez bildirdi): "abonelik analizinde puanlar solda
// kaliyor". Ilk denemede Wrap(alignment: center) yeterli sanildi ama
// `_ReportSection` govdesi Column(crossAxisAlignment: start) oldugu icin Wrap
// TIGHT genislik aliyor ve ortalama HICBIR SEY yapmiyordu. Bu test resim degil
// OLCUM: donut satirinin merkezi raporun merkezine esit mi?
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/presentation/widgets/shared/ai_charts.dart' show AicDonut;
import 'package:qor_ai/presentation/widgets/shared/ai_report_adapters.dart';
import 'package:qor_ai/presentation/widgets/shared/ai_report_view.dart';

Map<String, dynamic> _twoServices() {
  Map<String, dynamic> svc(int score, int pos) => {
        'compatibility_score': score,
        'community_score': pos,
        'compatibility_explanation': 'Aciklama.',
        'pros': ['Arti'],
        'cons': ['Eksi'],
        'community_sentiment': 'Yorum.',
        'sentiment_breakdown': {'positive': pos, 'neutral': 20, 'negative': 100 - pos - 20},
        'factors': {'usage_fit': score, 'value_match': score - 10},
      };
  return subscriptionResultToUnified({
    'subscriptions': {'Netflix': svc(68, 30), 'Disney+': svc(82, 45)},
    'winner': {'overall': 'Disney+', 'recommendation': 'Disney+ daha uygun.'},
  }, 'tr')!;
}

void main() {
  testWidgets('abonelik/karsilastirma raporunda donutlar YATAY ORTALI',
      (tester) async {
    tester.view.physicalSize = const Size(1080, 3000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final data = _twoServices();
    expect(data['type'], 'compare_full_report');

    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.lightTheme,
      home: Scaffold(
        body: SingleChildScrollView(
          child: SizedBox(
            key: const Key('root'),
            width: 1000,
            child: AiReportView(kind: 'compareFull', data: data, lang: 'tr'),
          ),
        ),
      ),
    ));
    await tester.pump(const Duration(seconds: 2));

    final rootCenter = tester.getCenter(find.byKey(const Key('root'))).dx;
    final donuts = find.byType(AicDonut);
    expect(donuts, findsNWidgets(2), reason: 'iki donut cizilmeli');

    // Iki donutun ORTAK merkezi raporun merkezine denk gelmeli.
    final a = tester.getCenter(donuts.at(0)).dx;
    final b = tester.getCenter(donuts.at(1)).dx;
    final groupCenter = (a + b) / 2;
    expect(
      (groupCenter - rootCenter).abs(),
      lessThan(2.0),
      reason: 'donut grubu ortali degil (merkez farki '
          '${(groupCenter - rootCenter).abs().toStringAsFixed(1)} px)',
    );
  });
}
