/// Tek rapor şablonu adaptörleri (web `reportAdapters.js` karşılığı).
///
/// Web'de dört AI akışı (ürün, karşılaştırma, link, abonelik) TEK bileşenle
/// çizilir. Uygulamada ürün + karşılaştırma zaten `_UnifiedBody`'yi kullanıyordu;
/// link ve abonelik ekranları kendi çok panelli eski düzenlerini çiziyordu.
///
/// Bu dosya, link/abonelik AI çıktısını ÜRÜN RAPORU şekline
/// (`product_full_report`) çevirir — böylece `AiReportView` hiçbir değişiklik
/// olmadan aynı bölümleri, AYNI SIRAYLA üretir:
///   hero → KPI → radar → sentiment donutu → faktör dengesi → faktör faktör →
///   kritik noktalar → artı/eksi → quiz etkisi → topluluk temaları →
///   kaynak rozetleri → övgü/şikâyet → topluluk özeti → tam değerlendirme →
///   sana uyumu → kime uygun/değil → özellik-ihtiyaç → alternatifler →
///   zamanlama → son karar → doğrulama notları
library;

import 'package:qor_ai/domain/entities/ai_entities.dart';

int _asInt(dynamic v) {
  if (v is num) return v.round();
  if (v is String) return int.tryParse(v.trim()) ?? 0;
  return 0;
}

List<dynamic> _arr(dynamic v) => v is List ? v : const [];

String _s(dynamic v) => v == null ? '' : v.toString().trim();

/// Skordan karar türetir (AI `decision` alanını doldurmadığı eski kayıtlar için).
String _decisionFor(dynamic explicit, int score) {
  final d = _s(explicit).toLowerCase();
  if (d == 'buy' || d == 'consider' || d == 'skip') return d;
  if (score >= 75) return 'buy';
  if (score >= 55) return 'consider';
  return 'skip';
}

/// Alternatif listesini şablonun beklediği kart şekline çevirir. Link/abonelik
/// promptları düz metin listesi döndürüyor ("Model adı"); ürün raporu ise nesne
/// bekliyor. İkisini de kabul et.
List<Map<String, dynamic>> _alternatives(dynamic raw, dynamic fallback) {
  final src = _arr(raw).isNotEmpty ? _arr(raw) : _arr(fallback);
  final out = <Map<String, dynamic>>[];
  for (final a in src) {
    if (a is Map) {
      out.add({
        'name': _s(a['name'] ?? a['title']),
        'difference': _s(a['difference'] ?? a['why'] ?? a['detail']),
        'shortComment': _s(a['shortComment'] ?? a['comment']),
        'source': 'external',
      });
    } else {
      final name = _s(a);
      if (name.isNotEmpty) out.add({'name': name, 'source': 'external'});
    }
  }
  return out;
}

/// `priceOutlook` (link/abonelik) → `priceForecast` (şablon).
Map<String, dynamic>? _priceForecast(dynamic raw) {
  if (raw is! Map) return null;
  final trend = _s(raw['trend']);
  final best = _s(raw['bestTime'] ?? raw['bestTimeToBuy']);
  final note = _s(raw['note'] ?? raw['analysis']);
  if (trend.isEmpty && best.isEmpty && note.isEmpty) return null;
  return {
    'trend': trend.isEmpty ? 'stable' : trend,
    'bestTimeToBuy': best,
    'analysis': note,
    if (raw['confidence'] != null) 'confidence': _asInt(raw['confidence']),
    if (raw['drivers'] is List) 'drivers': raw['drivers'],
  };
}

/// LİNK ANALİZİ → tek şablon verisi.
///
/// Eski kayıtlarda [EnhancedAnalysisResult.raw] boştur; o durumda yalnız
/// entity'de zaten bulunan alanlar doldurulur ve şablon eksik bölümleri
/// sessizce atlar (boş bölüm çizilmez).
Map<String, dynamic> linkResultToUnified(EnhancedAnalysisResult r) {
  final raw = r.raw;
  final score = r.enhancedScore.round();
  final community = _asInt(raw['communityScore']) > 0
      ? _asInt(raw['communityScore'])
      : (r.communityScore ?? 0).round();

  final factors = r.factors
      .map(
        (f) => {
          'label': f.label,
          'score': f.score.round(),
          if (f.emoji.isNotEmpty) 'emoji': f.emoji,
        },
      )
      .toList();

  return <String, dynamic>{
    'type': 'product_full_report',
    'product': {
      'name': r.baseResult.metadata.title ?? '',
      'matchScore': score,
      'decision': _decisionFor(raw['decision'], score),
      'confidence': _asInt(raw['confidence']),
      'headline': _s(raw['headline']),
      'matchComment': r.personaAnalysis ?? _s(raw['personaAnalysis']),
      'factors': factors.isNotEmpty ? factors : raw['factors'],
      'criticalPoints': raw['criticalPoints'],
      'quizInsights': raw['quizInsights'],
      'featureMatches': raw['featureMatches'],
      'analysis': r.detailedVerdict,
      'strengths': r.prosForUser,
      'weaknesses': r.consForUser,
      'reliabilityNotes': raw['reliabilityNotes'],
      'bestFor': _s(raw['bestFor']),
      'notFor': _s(raw['notFor']),
      'overallVerdict': r.overallVerdict ?? _s(raw['overallVerdict']),
    },
    'community': {
      'satisfaction': community,
      'sentimentBreakdown': r.sentimentBreakdown ?? raw['sentimentBreakdown'],
      'themes': raw['communityThemes'],
      'summary': r.communityAnalysis ?? _s(raw['communityAnalysis']),
      'pros': raw['praisePoints'],
      'cons': raw['complaintPoints'],
      'sources': raw['sources'],
      'verificationNotes': raw['verificationNotes'],
    },
    'alternatives': _alternatives(raw['alternatives'], r.alternatives),
    if (_priceForecast(raw['priceOutlook'] ?? raw['priceForecast']) != null)
      'priceForecast': _priceForecast(raw['priceOutlook'] ?? raw['priceForecast']),
  };
}

/// Abonelik motorunun `factors` alanı MAP'tir (`{usage_fit: 80, ...}`), şablon
/// ise liste bekler. Etiketler kullanıcı diline çevrilir.
List<Map<String, dynamic>> _subFactors(dynamic raw, String lang) {
  if (raw is List) return raw.whereType<Map>().map(Map<String, dynamic>.from).toList();
  if (raw is! Map) return const [];
  final tr = lang.startsWith('tr');
  const labels = {
    'usage_fit': ['Usage fit', 'Kullanım uyumu'],
    'value_match': ['Value for money', 'Fiyat/değer'],
    'content_match': ['Content match', 'İçerik uyumu'],
    'ecosystem_fit': ['Ecosystem fit', 'Ekosistem uyumu'],
    'lifestyle_match': ['Lifestyle match', 'Yaşam tarzı uyumu'],
  };
  final out = <Map<String, dynamic>>[];
  raw.forEach((k, v) {
    final key = k.toString();
    final pair = labels[key];
    final label = pair == null
        ? key.replaceAll('_', ' ')
        : (tr ? pair[1] : pair[0]);
    out.add({'label': label, 'score': _asInt(v)});
  });
  return out;
}

/// Tek bir abonelik servisinin bloğunu şablonun ürün şekline çevirir.
Map<String, dynamic> _subServiceToUnifiedProduct(
  String name,
  Map<String, dynamic> s,
  String lang,
) {
  final match = _asInt(s['compatibility_score'] ?? s['score']);
  return <String, dynamic>{
    'name': name,
    'matchScore': match,
    'decision': _decisionFor(s['decision'], match),
    'confidence': _asInt(s['confidence']),
    'headline': _s(s['headline']),
    'matchComment': _s(s['compatibility_explanation']),
    'factors': _subFactors(s['factors'], lang),
    'criticalPoints': s['critical_points'] ?? s['criticalPoints'],
    'quizInsights': s['quiz_insights'] ?? s['quizInsights'],
    'featureMatches': s['feature_matches'] ?? s['featureMatches'],
    'analysis': _s(s['analysis'] ?? s['compatibility_explanation']),
    'strengths': s['pros'],
    'weaknesses': s['cons'],
    'reliabilityNotes': s['reliability_notes'] ?? s['reliabilityNotes'],
    'bestFor': _s(s['best_for'] ?? s['bestFor']),
    'notFor': _s(s['not_for'] ?? s['notFor']),
    'overallVerdict': _s(s['overall_verdict'] ?? s['overallVerdict']),
    'community': {
      'satisfaction': _asInt(s['community_score'] ?? s['communityScore']),
      'sentimentBreakdown': s['sentiment_breakdown'] ?? s['sentimentBreakdown'],
      'themes': s['community_themes'] ?? s['communityThemes'],
      'summary': _s(s['community_sentiment'] ?? s['communityAnalysis']),
      'pros': s['praise_points'] ?? s['praisePoints'],
      'cons': s['complaint_points'] ?? s['complaintPoints'],
      'sources': s['sources'],
      'verificationNotes': s['verification_notes'] ?? s['verificationNotes'],
    },
    if (_priceForecast(s['price_outlook'] ?? s['priceOutlook']) != null)
      'priceForecast': _priceForecast(s['price_outlook'] ?? s['priceOutlook']),
  };
}

/// ABONELİK ANALİZİ → tek şablon verisi.
///
/// Motor `{subscriptions: {ad: {...}}, winner: {...}, detailed_comparison: {...}}`
/// döndürür. TEK servis varsa ürün raporu, BİRDEN FAZLA servis varsa
/// karşılaştırma raporu şekline çevrilir — her iki durumda da `AiReportView`
/// aynı `_UnifiedBody`'yi, aynı bölüm sırasıyla çizer.
Map<String, dynamic>? subscriptionResultToUnified(
  Map<String, dynamic>? structured,
  String lang,
) {
  if (structured == null) return null;
  final subs = structured['subscriptions'];
  if (subs is! Map || subs.isEmpty) return null;

  final entries = <Map<String, dynamic>>[];
  subs.forEach((k, v) {
    if (v is Map) {
      entries.add(
        _subServiceToUnifiedProduct(
          k.toString(),
          Map<String, dynamic>.from(v),
          lang,
        ),
      );
    }
  });
  if (entries.isEmpty) return null;

  if (entries.length == 1) {
    final p = Map<String, dynamic>.from(entries.first);
    final community = p.remove('community');
    final price = p.remove('priceForecast');
    return <String, dynamic>{
      'type': 'product_full_report',
      'product': p,
      'community': ?community,
      'alternatives': const <Map<String, dynamic>>[],
      'priceForecast': ?price,
    };
  }

  final winner = structured['winner'] is Map
      ? Map<String, dynamic>.from(structured['winner'] as Map)
      : const <String, dynamic>{};
  final detail = structured['detailed_comparison'] is Map
      ? Map<String, dynamic>.from(structured['detailed_comparison'] as Map)
      : const <String, dynamic>{};
  return <String, dynamic>{
    'type': 'compare_full_report',
    'products': entries,
    'comparison': {
      'winner': _s(winner['overall'] ?? winner['best_content']),
      'recommendation': _s(winner['recommendation']),
      'summary': [
        _s(detail['service_fit_summary']),
        _s(detail['feature_comparison']),
        _s(detail['user_experience']),
      ].where((x) => x.isNotEmpty).join('\n\n'),
    },
  };
}
