// GÖREV 3 doğrulaması: LİNK ve ABONELİK analizleri artık ürün/karşılaştırma ile
// AYNI rapor şablonunu (`AiReportView` → `_UnifiedBody`) çiziyor mu?
//
// Ekranlar giriş + Q Coin kapısının arkasında olduğu için UI'dan koşturulamıyor;
// bu test tam olarak o render yolunu, gerçekçi bir AI yanıtıyla çalıştırır ve
// bölümlerin BEKLENEN SIRAYLA çıktığını doğrular.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/domain/entities/ai_entities.dart';
import 'package:qor_ai/presentation/widgets/shared/ai_report_adapters.dart';
import 'package:qor_ai/presentation/widgets/shared/ai_report_view.dart';

/// Şablonun Türkçe bölüm başlıkları — web'deki sırayla.
const _expectedOrder = <String>[
  'Faktör faktör',
  'Karar öncesi kritik noktalar',
  'Cevapların sonucu nasıl değiştirdi',
  'İnsanlar en çok neyi konuşuyor',
  'Topluluk yorumu',
  'Tam değerlendirme',
  'Sana uyumu',
  'Son karar',
];

Future<List<String>> _renderAndCollect(
  WidgetTester tester,
  Widget child,
) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.lightTheme,
      home: Scaffold(
        body: SingleChildScrollView(child: child),
      ),
    ),
  );
  await tester.pump(const Duration(seconds: 2));
  final texts = tester
      .widgetList<Text>(find.byType(Text))
      .map((t) => (t.data ?? '').trim())
      .where((s) => s.isNotEmpty)
      .toList();
  return texts;
}

void _expectOrder(List<String> texts, List<String> expected) {
  var cursor = -1;
  for (final section in expected) {
    // UrSection basligi "<emoji> <baslik>" olarak tek Text'te ciziliyor.
    final at = texts.indexWhere((t) => t.endsWith(section), cursor + 1);
    expect(at, greaterThan(cursor), reason: '"$section" bölümü sırada değil/yok');
    cursor = at;
  }
}

EnhancedAnalysisResult _fakeLinkResult() {
  return EnhancedAnalysisResult(
    baseResult: LinkAnalysisResult(
      url: 'https://www.amazon.com.tr/dp/B0TEST',
      metadata: const OgMetadata(title: 'Test Ürün X100'),
      aiScore: 82,
      aiAnalysis: 'Temel analiz metni.',
      category: 'laptops',
      analyzedAt: DateTime(2026, 8, 9),
    ),
    enhancedScore: 82,
    factors: const [
      CompatibilityFactor(label: 'Kullanım uyumu', score: 88, emoji: '🎯'),
      CompatibilityFactor(label: 'Fiyat/değer', score: 61, emoji: '💰'),
      CompatibilityFactor(label: 'Dayanıklılık', score: 47, emoji: '🛠'),
    ],
    detailedVerdict: 'Tam değerlendirme paragrafı burada.',
    prosForUser: const ['Hafif ve taşınabilir', 'Ekran kalitesi yüksek'],
    consForUser: const ['Fiyatı yüksek'],
    alternatives: const ['Alternatif Model A'],
    communityScore: 74,
    communityAnalysis: 'Topluluk genel olarak memnun ama şarj hızından şikâyetçi.',
    personaScore: 80,
    personaAnalysis: 'Senin kullanımına iyi uyuyor.',
    overallVerdict: 'Bu ürünü alabilirsin.',
    sentimentBreakdown: const {'positive': 62, 'neutral': 23, 'negative': 15},
    raw: const {
      'decision': 'buy',
      'confidence': 78,
      'headline': 'Günlük kullanım için güçlü bir seçim.',
      'bestFor': 'Taşınabilirliğe önem veren kullanıcılar.',
      'notFor': 'Ağır oyun oynayanlar.',
      'criticalPoints': [
        {'title': 'Bellek yükseltilemiyor', 'detail': 'Satın alırken doğru kapasiteyi seç.', 'severity': 'high'},
      ],
      'quizInsights': [
        {'topic': 'Kullanım amacı', 'answer': 'Ofis', 'impact': 20, 'note': 'Bu ürünün güçlü yanıyla örtüşüyor.'},
      ],
      'featureMatches': [
        {'label': 'Ağırlık', 'productValue': '1.24 kg', 'userNeed': 'Taşınabilirlik', 'score': 90, 'comment': 'Beklentini karşılıyor.'},
      ],
      'communityThemes': [
        {'label': 'Şarj hızı', 'strength': 70, 'sentiment': 'negative', 'detail': 'Sık dile getiriliyor.'},
      ],
      'praisePoints': ['Sessiz çalışıyor'],
      'complaintPoints': ['Şarj yavaş'],
      'sources': ['Reddit', 'YouTube'],
      'verificationNotes': ['Fiyatlar doğrulanmadı'],
      'priceOutlook': {'trend': 'down', 'bestTime': 'Kasım', 'note': 'İndirim dönemi yaklaşıyor.'},
    },
  );
}

void main() {
  testWidgets('link analizi tek sablonu ve bolum sirasini kullanir', (tester) async {
    tester.view.physicalSize = const Size(1080, 6000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final unified = linkResultToUnified(_fakeLinkResult());
    expect(unified['type'], 'product_full_report');
    // Sablonun bekledigi alanlar adaptorden gecmis mi?
    final product = unified['product'] as Map<String, dynamic>;
    final community = unified['community'] as Map<String, dynamic>;
    expect(product['decision'], 'buy');
    expect(product['criticalPoints'], isNotEmpty);
    expect(product['quizInsights'], isNotEmpty);
    expect(product['bestFor'], isNotEmpty);
    expect(product['notFor'], isNotEmpty);
    expect(community['themes'], isNotEmpty);
    expect(community['sentimentBreakdown'], isNotNull);
    expect(unified['priceForecast'], isNotNull);

    final texts = await _renderAndCollect(
      tester,
      AiReportView(kind: 'productFull', data: unified, lang: 'tr'),
    );
    _expectOrder(texts, _expectedOrder);
  });

  testWidgets('abonelik analizi tek sablonu ve bolum sirasini kullanir', (tester) async {
    tester.view.physicalSize = const Size(1080, 6000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final structured = <String, dynamic>{
      'subscriptions': {
        'Netflix': {
          'category': 'streaming',
          'compatibility_score': 79,
          'compatibility_explanation': 'İzleme alışkanlığına uyuyor.',
          'pros': ['Geniş katalog', 'Çoklu profil'],
          'cons': ['Zam sıklığı'],
          'community_sentiment': 'Katalog beğeniliyor, fiyat artışı eleştiriliyor.',
          'sentiment_breakdown': {'positive': 55, 'neutral': 25, 'negative': 20},
          'best_for': 'Dizi izleyicileri.',
          'not_for': 'Sadece canlı spor izleyenler.',
          'overall_verdict': 'Aylık plan mantıklı.',
          'decision': 'consider',
          'confidence': 72,
          'factors': {'usage_fit': 84, 'value_match': 58, 'content_match': 88},
          'critical_points': [
            {'title': 'Yıllık zam', 'detail': 'Bütçeni etkileyebilir.', 'severity': 'mid'},
          ],
          'quiz_insights': [
            {'topic': 'İzleme sıklığı', 'answer': 'Her gün', 'impact': 25, 'note': 'Aboneliği değerli kılıyor.'},
          ],
          'community_themes': [
            {'label': 'Fiyat artışı', 'strength': 80, 'sentiment': 'negative', 'detail': 'Yaygın şikâyet.'},
          ],
          'praise_points': ['Orijinal yapımlar'],
          'complaint_points': ['Zam'],
          'sources': ['Reddit'],
          'verification_notes': ['Fiyatlar bölgeye göre değişir'],
        },
      },
    };

    final unified = subscriptionResultToUnified(structured, 'tr');
    expect(unified, isNotNull);
    expect(unified!['type'], 'product_full_report');
    final product = unified['product'] as Map<String, dynamic>;
    expect(product['name'], 'Netflix');
    expect(product['decision'], 'consider');
    expect(product['factors'], isA<List<dynamic>>());
    expect((product['factors'] as List).length, 3);
    expect(product['criticalPoints'], isNotEmpty);

    final texts = await _renderAndCollect(
      tester,
      AiReportView(kind: 'productFull', data: unified, lang: 'tr'),
    );
    _expectOrder(texts, _expectedOrder);
  });

  test('iki abonelik karsilastirma raporu sekline cevrilir', () {
    final unified = subscriptionResultToUnified({
      'subscriptions': {
        'Netflix': {'compatibility_score': 79, 'pros': [], 'cons': []},
        'Disney+': {'compatibility_score': 64, 'pros': [], 'cons': []},
      },
      'winner': {'overall': 'Netflix', 'recommendation': 'Netflix daha uygun.'},
    }, 'tr');
    expect(unified, isNotNull);
    expect(unified!['type'], 'compare_full_report');
    expect((unified['products'] as List).length, 2);
    expect((unified['comparison'] as Map)['winner'], 'Netflix');
  });
}
