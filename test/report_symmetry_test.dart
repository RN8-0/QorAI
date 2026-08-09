// Rapor simetrisi — kullanici sikayeti: "puanlar vs. yatay ortalanmiyor,
// sola kayiyor". `_UnifiedBody` DORT akista da (urun, karsilastirma, link,
// abonelik) kullanildigi icin bu test hepsini birden korur.
//
// Resim degil OLCUM: skor halkasinin ve karar rozetinin merkezi, raporun
// merkezine esit mi?
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/presentation/widgets/shared/ai_charts.dart'
    show DecisionBadge;
import 'package:qor_ai/presentation/widgets/shared/ai_report_adapters.dart';
import 'package:qor_ai/presentation/widgets/shared/ai_report_view.dart';

Map<String, dynamic> _report() {
  return subscriptionResultToUnified({
    'subscriptions': {
      'Netflix': {
        'compatibility_score': 79,
        'community_score': 68,
        'confidence': 72,
        'decision': 'consider',
        'headline': 'Izleme aliskanligina uyuyor.',
        'compatibility_explanation': 'Haftada 4-5 bolum izliyorsun.',
        'pros': ['Genis katalog'],
        'cons': ['Zam sikligi'],
        'factors': {'usage_fit': 84, 'value_match': 58, 'content_match': 88},
      },
    },
  }, 'tr')!;
}

void main() {
  testWidgets('skor halkasi ve karar rozeti YATAY ORTALI', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.lightTheme,
      home: Scaffold(
        body: SingleChildScrollView(
          child: SizedBox(
            key: const Key('root'),
            width: 1000,
            child: AiReportView(
              kind: 'productFull',
              data: _report(),
              lang: 'tr',
            ),
          ),
        ),
      ),
    ));
    await tester.pump(const Duration(seconds: 2));

    final rootCenter = tester.getCenter(find.byKey(const Key('root'))).dx;

    // Skor halkasi: 92x92 CustomPaint iceren SizedBox.
    final ring = find
        .byWidgetPredicate((w) => w is SizedBox && w.width == 92 && w.height == 92)
        .first;
    expect(
      (tester.getCenter(ring).dx - rootCenter).abs(),
      lessThan(1.0),
      reason: 'skor halkasi ortali degil',
    );

    final badge = find.byType(DecisionBadge).first;
    expect(
      (tester.getCenter(badge).dx - rootCenter).abs(),
      lessThan(1.0),
      reason: 'karar rozeti ortali degil',
    );
  });
}
