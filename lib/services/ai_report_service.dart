/// Qor AI — Unified AI report service (web-parity).
///
/// Dart port of `web/src/components/AiAnalysis.jsx` prompt builders plus the
/// `web/src/pages/{ProductDetail,Compare}.jsx` orchestration:
///   • product detail → one researched `product_full_report`
///   • compare        → per-product `compare_full_report` sections + a verdict
///
/// Routing mirrors the app: Gemini (heavy JSON) first, DeepSeek fallback, and a
/// best-effort grounded research pass (Gemini-only, never blocks the report).
library;

import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qor_ai/core/constants.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';
import 'package:qor_ai/presentation/providers/providers.dart';

const _langNames = <String, String>{
  'tr': 'Turkish',
  'en': 'English',
  'es': 'Spanish',
  'fr': 'French',
  'it': 'Italian',
  'pt': 'Portuguese',
  'ru': 'Russian',
  'nl': 'Dutch',
  'pl': 'Polish',
  'sv': 'Swedish',
  'ja': 'Japanese',
  'ar': 'Arabic',
};

String _langName(String lang) =>
    _langNames[lang.toLowerCase().substring(0, lang.length >= 2 ? 2 : 1)] ??
    'English';

String _currentReportDate() => DateTime.now().toIso8601String().substring(0, 10);

/// Stage of the live workboard (mirrors web's prep → research → report).
enum AiReportStage { prep, research, report }

class AiReportService {
  // ── Context helpers ───────────────────────────────────────────────────────

  /// Flatten the localized, correction-cleaned spec sections into a compact
  /// "label: value; …" string for the prompt. English specs are the most
  /// reliable input for the model; the output language is controlled separately.
  static String _specsContext(ProductEntity p, {int limit = 40}) {
    final rows = <String>[];
    final seen = <String>{};
    void put(String k, String v) {
      final key = k.replaceAll(RegExp(r'\s+'), ' ').trim();
      final val = v.replaceAll(RegExp(r'\s+'), ' ').trim();
      if (key.isEmpty || val.isEmpty) return;
      final sig = key.toLowerCase();
      if (seen.contains(sig)) return;
      seen.add(sig);
      rows.add('$key: $val');
    }

    final sections = p.localizedSpecSections('en');
    if (sections.isNotEmpty) {
      for (final entry in sections.entries) {
        for (final row in entry.value.entries) {
          put(row.key, row.value);
          if (rows.length >= limit) break;
        }
        if (rows.length >= limit) break;
      }
    } else {
      p.keySpecs.forEach(put);
    }
    return rows.take(limit).join('; ');
  }

  static String _priceString(ProductEntity p) {
    final us = p.getPriceForCountry('US');
    if (us != null && us > 0) return '${us.toStringAsFixed(0)} USD';
    for (final entry in p.prices.entries) {
      if (entry.value > 0) return '${entry.value} ${entry.key}';
    }
    return '-';
  }

  /// Faithful (field-limited) port of web's `availabilityContextForProduct`.
  /// The app's [ProductEntity] does not carry GTIN/MPN, offer-rollup counts or
  /// best-offer freshness fields, so only the catalog signals that actually
  /// exist are emitted — we never invent availability evidence the catalog
  /// does not have. This grounds the model so it stops claiming an in-catalog
  /// product is "unannounced/not released".
  static String _availabilityContext(ProductEntity p) {
    final bits = <String>[
      'Current date: ${_currentReportDate()}',
      'Qor catalog record exists: ${p.id.isNotEmpty ? 'yes' : 'unknown'}',
    ];
    if (p.source.isNotEmpty) bits.add('Catalog source: ${p.source}');
    final created = p.createdAt;
    if (created != null) {
      bits.add('Catalog first seen: ${created.toIso8601String().substring(0, 10)}');
    }
    bits.add(
      'Catalog updated: ${p.lastUpdated.toIso8601String().substring(0, 10)}',
    );
    final price = _priceString(p);
    if (price != '-') bits.add('Approx catalog price: $price');
    return bits.join('\n');
  }

  /// Compact Qor-catalog alternatives payload (mirrors web `cleanProductForPrompt`)
  /// so the model can reuse REAL catalog products — with their image — as smart
  /// alternatives instead of inventing them.
  static List<Map<String, dynamic>> _catalogAlternatives(
    List<ProductEntity> products,
    String lang,
  ) {
    return products
        .take(8)
        .map(
          (p) => {
            'id': p.id,
            'name': p.nameForLanguage(lang),
            'brand': p.brand ?? '',
            'category': p.category,
            'techScore': p.techScore > 0 ? p.techScore.round() : 0,
            'imageUrl': p.imageUrl ?? '',
            'specs': _specsContext(p, limit: 18),
          },
        )
        .toList();
  }

  static ({
    String name,
    String brand,
    String category,
    String score,
    String price,
    String ks,
  })
  _productLine(ProductEntity p, String lang) {
    return (
      name: p.nameForLanguage(lang),
      brand: p.brand ?? '',
      category: p.category,
      score: p.techScore > 0 ? p.techScore.toStringAsFixed(0) : '-',
      price: _priceString(p),
      ks: _specsContext(p, limit: 42),
    );
  }

  static String _profileString(Map<String, dynamic> profile) {
    final parts = <String>[];
    profile.forEach((k, v) {
      if (v == null) return;
      if (v is List) {
        if (v.isEmpty) return;
        parts.add('$k: ${v.join(', ')}');
      } else {
        final s = v.toString().trim();
        if (s.isNotEmpty) parts.add('$k: $s');
      }
    });
    return parts.take(18).join('; ');
  }

  static String _quizLines(List<dynamic> answers) {
    final list = <String>[];
    for (var i = 0; i < answers.length; i++) {
      final a = answers[i];
      if (a is Map && a['answer'] != null) {
        list.add('${i + 1}. ${a['question']}: ${a['answer']}');
      }
    }
    return list.isEmpty
        ? 'No product-specific quiz answers were provided.'
        : list.join('\n');
  }

  static String _freshnessRules() {
    final date = _currentReportDate();
    return 'Freshness rules (current date: $date):\n'
        '- Prefer current web research and official/store evidence over model memory.\n'
        '- Never say a product is unannounced, not released, not on the market, or only an estimate if current research, official pages, retailer pages, or the Qor catalog indicate it exists.\n'
        '- If current web research is unavailable or weak, say the evidence is limited; do not fill the gap with old launch-status assumptions.\n'
        '- Do not base a current-generation product on the previous generation unless explicitly framed as a comparison.\n'
        '- Do not treat a laptop fan as a real weakness by itself. Mention fan noise only if research reports it as recurring, or phrase it as sustained-load behavior.\n'
        '- Judge portability against the same class. Around 2.1 kg is normal/acceptable for a 16-inch workstation laptop, not a severe flaw by default.';
  }

  static String _languageGate(String lang) {
    return 'LANGUAGE HARD GATE: Every user-facing sentence, label, list item, source description, button-like value, and explanation must be fully written in ${_langName(lang)}. '
        'Only brand names, official product/model names, source names such as Reddit/YouTube/Amazon, and technical standards such as Thunderbolt, Wi-Fi, RTX, macOS may remain as-is. '
        'Do not output English UI labels such as "quiz answers", "similar products", "retailer reviews", "buy", "wait", "source types", "best time", or "community/review research" when the requested language is not English.';
  }

  // ── Research prompts (grounded, text reply) ───────────────────────────────

  static String buildProductResearchPrompt(
    ProductEntity p,
    String lang,
    List<dynamic> quizAnswers,
  ) {
    final l = _productLine(p, lang);
    return 'Research the product "${l.name}" by ${l.brand.isEmpty ? 'unknown' : l.brand} for a Qor AI purchase report.\n'
        'Category: ${l.category}\nTech score in catalog: ${l.score}/100\nApprox catalog price: ${l.price}\nCatalog specs: ${l.ks}\n\n'
        'MARKET STATUS CONTEXT:\n${_availabilityContext(p)}\n\n'
        '${_freshnessRules()}\n${_languageGate(lang)}\n\n'
        'Use current web search. Focus on official spec pages, current retailer/store pages, public ownership/review sentiment from Reddit, YouTube reviews, large retailer reviews, specialist review sites, and recent market/price-cycle signals. '
        'First determine whether the product is announced/released/available today, then summarize ownership evidence. Do not invent direct quotes, exact review counts, or exact current prices. If evidence is weak, say so clearly.\n\n'
        'Product-specific quiz answers:\n${_quizLines(quizAnswers)}\n\n'
        'Reply in ${_langName(lang)} with concise research notes only; no JSON is required.';
  }

  static String buildCompareResearchPrompt(
    List<ProductEntity> products,
    String lang,
    List<dynamic> quizAnswers,
  ) {
    final lines = <String>[];
    for (var i = 0; i < products.length; i++) {
      final l = _productLine(products[i], lang);
      lines.add(
        '${i + 1}. ${l.name} (${l.brand.isEmpty ? '?' : l.brand}, ${l.category}) score=${l.score}/100 price=${l.price}; specs=${l.ks}',
      );
    }
    final marketCtx = <String>[];
    for (var i = 0; i < products.length; i++) {
      marketCtx.add('Product ${i + 1}:\n${_availabilityContext(products[i])}');
    }
    return 'Research these products for a Qor AI comparison report.\n\n'
        '${lines.join('\n')}\n\n'
        'MARKET STATUS CONTEXT:\n${marketCtx.join('\n\n')}\n\n'
        '${_freshnessRules()}\n${_languageGate(lang)}\n\n'
        'Use current web search. For each product, gather current availability/status, public sentiment from Reddit, YouTube, specialist reviews, retailer reviews, official spec pages, and price-cycle signals. '
        'Then note the decisive differences that matter for a buyer choosing one. Do not invent quotes, exact counts, or exact live prices.\n\n'
        'Comparison quiz answers:\n${_quizLines(quizAnswers)}\n\n'
        'Reply in ${_langName(lang)} with concise research notes only; no JSON is required.';
  }

  // ── Report prompts (JSON) ─────────────────────────────────────────────────

  static String buildFullPrompt(
    ProductEntity p,
    String lang,
    Map<String, dynamic> profile, {
    List<dynamic> quizAnswers = const [],
    String research = '',
    List<ProductEntity> similarProducts = const [],
  }) {
    final l = _productLine(p, lang);
    final prof = _profileString(profile);
    final catalogAlts = _catalogAlternatives(similarProducts, lang);
    return 'You are Qor AI\'s senior product analyst and product advisor. Analyse "${l.name}" by ${l.brand.isEmpty ? 'unknown' : l.brand} (category: ${l.category}). '
        'Use the product name exactly as given. Do not replace it with a similar model.\n\n'
        '${_languageGate(lang)}\n\n'
        'CRITICAL OUTPUT ORDER: one single continuous report: match/advisor/deep analysis first, internet/community sentiment second, smart alternatives third, price forecast last.\n'
        '${_freshnessRules()}\n'
        'Use catalog specs and quiz answers as verified inputs. Use research notes only when they support a claim; if something is not verified, say it is uncertain. Never invent direct quotes, exact review counts, or exact live prices.\n'
        'Write like a professional buyer lab report: concrete, decisive, and detailed. Avoid generic praise. Mention exact catalog specs, compatibility constraints, who benefits, who should avoid it, and why.\n\n'
        'Return ONLY one valid JSON object with this exact structure:\n'
        '{\n'
        '  "type": "product_full_report",\n'
        '  "product": {\n'
        '    "name": "exact product name",\n'
        '    "matchScore": <0-100>,\n'
        '    "decision": "buy|consider|skip",\n'
        '    "confidence": <0-100>,\n'
        '    "headline": "one decisive sentence a buyer can act on",\n'
        '    "matchComment": "5-7 detailed sentences explaining quiz/profile fit, trade-offs, and who should care",\n'
        '    "reviewedInputs": ["<input/source label in requested language>"],\n'
        '    "factors": [{"label": "Usage fit", "score": <0-100>, "detail": "2 detailed sentences with evidence"}],\n'
        '    "criticalPoints": [{"title": "short warning/insight", "detail": "2 sentences on why it changes the decision", "severity": "high|mid|low"}],\n'
        '    "quizInsights": [{"topic": "what the question was about", "answer": "the user answer", "impact": <-100..100>, "note": "1-2 sentences on how it moved the score"}],\n'
        '    "featureMatches": [{"label": "feature/spec", "productValue": "catalog value", "userNeed": "need inferred from quiz/profile", "score": <0-100>, "comment": "2 detailed sentences"}],\n'
        '    "analysis": "8-11 substantial paragraphs, each 45-85 words: technical overview, performance/quality, compatibility, longevity, risks, buying advice; merge AI product advisor here",\n'
        '    "strengths": ["6 detailed strengths grounded in specs"],\n'
        '    "weaknesses": ["5 detailed weaknesses or caveats"],\n'
        '    "reliabilityNotes": [{"title": "durability/support/warranty note", "detail": "1-2 sentences"}],\n'
        '    "bestFor": "1-2 sentences describing the buyer this is perfect for",\n'
        '    "notFor": "1-2 sentences describing who should skip it",\n'
        '    "overallVerdict": "2-3 sentence closing verdict"\n'
        '  },\n'
        '  "community": {"satisfaction": <0-100>, "sentimentBreakdown": {"positive": <int>, "neutral": <int>, "negative": <int>}, "themes": [{"label": "recurring discussion topic", "strength": <0-100>, "sentiment": "positive|neutral|negative", "detail": "1 sentence"}], "summary": "5-7 substantial paragraphs synthesizing Reddit, YouTube, retailer reviews, forums and specialist reviews", "pros": ["6 recurring positives"], "cons": ["5 recurring negatives"], "sources": ["Reddit", "<source type in requested language>"], "verificationNotes": ["what is grounded", "what remains uncertain"]},\n'
        '  "alternatives": [{"name": "product name", "id": "copy the EXACT id from Qor catalog context when source is qor_catalog, otherwise empty", "imageUrl": "copy from Qor catalog context when available, otherwise empty", "url": "copy from Qor catalog context when available, otherwise empty", "source": "qor_catalog|external", "keySpecs": [{"label": "spec", "value": "value"}], "difference": "2-3 sentences vs target", "shortComment": "1-2 sentence recommendation"}],\n'
        '  "priceForecast": {"trend": "up|down|stable", "confidence": <0-100>, "expectedChange": "range or uncertainty", "bestTimeToBuy": "specific month/season/window", "buyOrWait": "buy|wait|watch", "drivers": ["5 concrete drivers"], "analysis": "5-7 substantial paragraphs with researched reasoning and caveats"}\n'
        '}\n\n'
        '${_fullReportRules()}\n'
        'MARKET / AVAILABILITY CONTEXT:\n${_availabilityContext(p)}\n\n'
        'PRODUCT CONTEXT:\nName: ${l.name}\nBrand: ${l.brand.isEmpty ? '-' : l.brand}\nCategory: ${l.category}\nQor AI Tech Score: ${l.score}/100\nApprox catalog price: ${l.price}\nCatalog specs: ${l.ks}\n\n'
        'PRODUCT-SPECIFIC QUIZ ANSWERS:\n${_quizLines(quizAnswers)}\n\n'
        '${prof.isNotEmpty ? 'USER PROFILE / USER-RECOGNITION SIGNALS:\n$prof\n\n' : ''}'
        '${catalogAlts.isNotEmpty ? 'QOR CATALOG ALTERNATIVES:\n${jsonEncode(catalogAlts)}\n\n' : ''}'
        'WEB RESEARCH NOTES:\n${research.isNotEmpty ? research : 'No grounded research notes were available; rely on catalog specs and clearly label uncertainty.'}';
  }

  static String _fullReportRules() {
    return 'Rules:\n'
        '- product.factors must include 8-10 varied factor scores for chart bars.\n'
        '- product.criticalPoints must include 4-6 things that genuinely change the decision (compatibility traps, hidden costs, ecosystem lock-in, service coverage) — not restated specs.\n'
        '- product.quizInsights must reference the ACTUAL quiz answers listed below, one entry per answered question (4-6). impact is negative when the answer works against this product.\n'
        '- community.sentimentBreakdown must be integer percentages summing to ~100 and never all-positive; community.themes must include 5-6 topics with varied sentiment.\n'
        '- featureMatches must include 8-10 spec/need matches using real catalog spec values where possible.\n'
        '- alternatives must include 3 products. Prefer Qor catalog alternatives if they fit; copy imageUrl AND id exactly from the context for those (source="qor_catalog"). External alternatives may have empty id/imageUrl/url.\n'
        '- priceForecast must not pretend to know live prices unless research notes include them.\n\n';
  }

  /// Prompt'un iki yarısının PAYLAŞTIĞI bağlam bloğu.
  static String _reportContext(
    ProductEntity p,
    String lang,
    Map<String, dynamic> profile,
    List<dynamic> quizAnswers,
    String research,
    List<ProductEntity> similarProducts,
  ) {
    final l = _productLine(p, lang);
    final prof = _profileString(profile);
    final catalogAlts = _catalogAlternatives(similarProducts, lang);
    return 'MARKET / AVAILABILITY CONTEXT:\n${_availabilityContext(p)}\n\n'
        'PRODUCT CONTEXT:\nName: ${l.name}\nBrand: ${l.brand.isEmpty ? '-' : l.brand}\nCategory: ${l.category}\nQor AI Tech Score: ${l.score}/100\nApprox catalog price: ${l.price}\nCatalog specs: ${l.ks}\n\n'
        'PRODUCT-SPECIFIC QUIZ ANSWERS:\n${_quizLines(quizAnswers)}\n\n'
        '${prof.isNotEmpty ? 'USER PROFILE / USER-RECOGNITION SIGNALS:\n$prof\n\n' : ''}'
        '${catalogAlts.isNotEmpty ? 'QOR CATALOG ALTERNATIVES:\n${jsonEncode(catalogAlts)}\n\n' : ''}'
        'WEB RESEARCH NOTES:\n${research.isNotEmpty ? research : 'No grounded research notes were available; rely on catalog specs and clearly label uncertainty.'}';
  }

  // ── RAPOR İKİ PARALEL ÇAĞRI (web paritesi) ─────────────────────────────────
  //
  // NEDEN: tek çağrıda `product` + `community` + `alternatives` + `priceForecast`
  // isteniyordu. İstenen metin miktarı (8-11 paragraf analiz + 5-7 paragraf
  // topluluk özeti + 5-7 paragraf fiyat analizi) sağlayıcının çıktı sınırını
  // zorluyor; web'de bu KIRPILMAYA yol açtığı ölçülmüştü ve tek uzun üretim
  // beklemeyi de uzatıyor. İki yarı PARALEL koşar → duvar saati ~yarıya iner.
  //
  // ASİMETRİK: karar yarısı KRİTİKtir (boşsa rapor yok), topluluk/pazar yarısı
  // ZENGİNLEŞTİRMEdir (boşsa rapor yine çıkar, sadece daha sade).

  static String buildCoreReportPrompt(
    ProductEntity p,
    String lang,
    Map<String, dynamic> profile, {
    List<dynamic> quizAnswers = const [],
    String research = '',
    List<ProductEntity> similarProducts = const [],
  }) {
    final l = _productLine(p, lang);
    return 'You are Qor AI\'s senior product analyst and product advisor. Analyse "${l.name}" by ${l.brand.isEmpty ? 'unknown' : l.brand} (category: ${l.category}). '
        'Produce the PERSONAL DECISION half of a comprehensive match report. '
        'Use the product name exactly as given. Do not replace it with a similar model.\n\n'
        '${_languageGate(lang)}\n\n'
        '${_freshnessRules()}\n'
        'Use catalog specs and quiz answers as verified inputs. Use research notes only when they support a claim; if something is not verified, say it is uncertain. Never invent direct quotes, exact review counts, or exact live prices.\n'
        'Write like a professional buyer lab report: concrete, decisive, and detailed. Avoid generic praise. Mention exact catalog specs, compatibility constraints, who benefits, who should avoid it, and why.\n\n'
        'Return ONLY one valid JSON object with this exact structure:\n'
        '{\n'
        '  "product": {\n'
        '    "name": "exact product name",\n'
        '    "matchScore": <0-100>,\n'
        '    "decision": "buy|consider|skip",\n'
        '    "confidence": <0-100>,\n'
        '    "headline": "one decisive sentence a buyer can act on",\n'
        '    "matchComment": "5-7 detailed sentences explaining quiz/profile fit, trade-offs, and who should care",\n'
        '    "reviewedInputs": ["<input/source label in requested language>"],\n'
        '    "factors": [{"label": "Usage fit", "score": <0-100>, "detail": "2 detailed sentences with evidence"}],\n'
        '    "criticalPoints": [{"title": "short warning/insight", "detail": "2 sentences on why it changes the decision", "severity": "high|mid|low"}],\n'
        '    "quizInsights": [{"topic": "what the question was about", "answer": "the user answer", "impact": <-100..100>, "note": "1-2 sentences on how it moved the score"}],\n'
        '    "featureMatches": [{"label": "feature/spec", "productValue": "catalog value", "userNeed": "need inferred from quiz/profile", "score": <0-100>, "comment": "2 detailed sentences"}],\n'
        '    "analysis": "8-11 substantial paragraphs, each 45-85 words: technical overview, performance/quality, compatibility, longevity, risks, buying advice; merge AI product advisor here",\n'
        '    "strengths": ["6 detailed strengths grounded in specs"],\n'
        '    "weaknesses": ["5 detailed weaknesses or caveats"],\n'
        '    "reliabilityNotes": [{"title": "durability/support/warranty note", "detail": "1-2 sentences"}],\n'
        '    "bestFor": "1-2 sentences describing the buyer this is perfect for",\n'
        '    "notFor": "1-2 sentences describing who should skip it",\n'
        '    "overallVerdict": "2-3 sentence closing verdict"\n'
        '  }\n'
        '}\n\n'
        'Rules:\n'
        '- product.factors must include 8-10 varied factor scores for chart bars.\n'
        '- product.criticalPoints must include 4-6 things that genuinely change the decision (compatibility traps, hidden costs, ecosystem lock-in, service coverage) — not restated specs.\n'
        '- product.quizInsights must reference the ACTUAL quiz answers listed below, one entry per answered question (4-6). impact is negative when the answer works against this product.\n'
        '- featureMatches must include 8-10 spec/need matches using real catalog spec values where possible.\n\n'
        '${_reportContext(p, lang, profile, quizAnswers, research, similarProducts)}';
  }

  static String buildCommunityReportPrompt(
    ProductEntity p,
    String lang,
    Map<String, dynamic> profile, {
    List<dynamic> quizAnswers = const [],
    String research = '',
    List<ProductEntity> similarProducts = const [],
  }) {
    final l = _productLine(p, lang);
    return 'You are Qor AI\'s community-research and market analyst. For "${l.name}" by ${l.brand.isEmpty ? 'unknown' : l.brand} (category: ${l.category}), '
        'produce the COMMUNITY & MARKET half of the report. The personal-decision half is written separately — do NOT repeat it.\n\n'
        '${_languageGate(lang)}\n\n'
        '${_freshnessRules()}\n'
        'Use research notes only when they support a claim; if something is not verified, say it is uncertain. Never invent direct quotes, exact review counts, or exact live prices.\n\n'
        'Return ONLY one valid JSON object with this exact structure:\n'
        '{\n'
        '  "community": {"satisfaction": <0-100>, "sentimentBreakdown": {"positive": <int>, "neutral": <int>, "negative": <int>}, "themes": [{"label": "recurring discussion topic", "strength": <0-100>, "sentiment": "positive|neutral|negative", "detail": "1 sentence"}], "summary": "5-7 substantial paragraphs synthesizing Reddit, YouTube, retailer reviews, forums and specialist reviews", "pros": ["6 recurring positives"], "cons": ["5 recurring negatives"], "sources": ["Reddit", "<source type in requested language>"], "verificationNotes": ["what is grounded", "what remains uncertain"]},\n'
        '  "alternatives": [{"name": "product name", "id": "copy the EXACT id from Qor catalog context when source is qor_catalog, otherwise empty", "imageUrl": "copy from Qor catalog context when available, otherwise empty", "url": "copy from Qor catalog context when available, otherwise empty", "source": "qor_catalog|external", "keySpecs": [{"label": "spec", "value": "value"}], "difference": "2-3 sentences vs target", "shortComment": "1-2 sentence recommendation"}],\n'
        '  "priceForecast": {"trend": "up|down|stable", "confidence": <0-100>, "expectedChange": "range or uncertainty", "bestTimeToBuy": "specific month/season/window", "buyOrWait": "buy|wait|watch", "drivers": ["5 concrete drivers"], "analysis": "5-7 substantial paragraphs with researched reasoning and caveats"}\n'
        '}\n\n'
        'Rules:\n'
        '- community.sentimentBreakdown must be integer percentages summing to ~100 and never all-positive; community.themes must include 5-6 topics with varied sentiment.\n'
        '- alternatives must include 3 products. Prefer Qor catalog alternatives if they fit; copy imageUrl AND id exactly from the context for those (source="qor_catalog"). External alternatives may have empty id/imageUrl/url.\n'
        '- priceForecast must not pretend to know live prices unless research notes include them.\n\n'
        '${_reportContext(p, lang, profile, quizAnswers, research, similarProducts)}';
  }

  static String buildCompareProductPrompt(
    ProductEntity product,
    String lang,
    Map<String, dynamic> profile, {
    List<dynamic> quizAnswers = const [],
    String research = '',
    List<String> peerNames = const [],
  }) {
    final l = _productLine(product, lang);
    final prof = _profileString(profile);
    final peers = peerNames.where((n) => n.isNotEmpty && n != l.name).toList();
    return 'You are Qor AI\'s senior product analyst. Produce ONE product\'s section of a multi-product comparison report. Evaluate ONLY "${l.name}" by ${l.brand.isEmpty ? 'unknown' : l.brand} (category: ${l.category}), but judge it in the CONTEXT of being compared against: ${peers.isEmpty ? 'the other selected products' : peers.join(', ')}.\n\n'
        '${_languageGate(lang)}\n\n${_freshnessRules()}\n\n'
        'Use catalog specs and quiz answers as verified inputs; use research notes only when they support a claim. Write like a professional buyer lab report: concrete, decisive, detailed. Never invent direct quotes, exact review counts, or exact live prices.\n\n'
        'Return ONLY one valid JSON object for THIS product with this exact structure:\n'
        '{\n'
        '  "name": "exact product name",\n'
        '  "matchScore": <0-100>,\n'
        '  "decision": "buy|consider|skip",\n'
        '  "confidence": <0-100>,\n'
        '  "headline": "one decisive sentence",\n'
        '  "matchComment": "5-6 detailed sentences on fit, trade-offs and who should care, relative to the other compared products",\n'
        '  "factors": [{"label": "factor", "score": <0-100>, "detail": "2 evidence-based sentences"}],\n'
        '  "criticalPoints": [{"title": "short warning/insight", "detail": "2 sentences", "severity": "high|mid|low"}],\n'
        '  "quizInsights": [{"topic": "topic", "answer": "the user answer", "impact": <-100..100>, "note": "1-2 sentences"}],\n'
        '  "featureMatches": [{"label": "feature/spec", "productValue": "catalog value", "userNeed": "need", "score": <0-100>, "comment": "2 evidence-based sentences"}],\n'
        '  "analysis": "5-7 substantial paragraphs, each 45-85 words",\n'
        '  "pros": ["6 detailed pros"],\n'
        '  "cons": ["5 detailed cons"],\n'
        '  "bestFor": "1-2 sentences",\n'
        '  "notFor": "1-2 sentences",\n'
        '  "overallVerdict": "2-3 sentence closing verdict for THIS product",\n'
        '  "community": {"satisfaction": <0-100>, "sentimentBreakdown": {"positive": <int>, "neutral": <int>, "negative": <int>}, "themes": [{"label": "topic", "strength": <0-100>, "sentiment": "positive|neutral|negative", "detail": "1 sentence"}], "summary": "3-4 substantial paragraphs", "pros": ["themes"], "cons": ["themes"], "sources": ["source types"]},\n'
        '  "priceForecast": {"trend": "up|down|stable", "confidence": <0-100>, "expectedChange": "range or uncertainty", "bestTimeToBuy": "window", "buyOrWait": "buy|wait|watch", "drivers": ["drivers"], "analysis": "2-3 substantial paragraphs"}\n'
        '}\n\n'
        'Rules:\n- Include 8-10 factor scores and 8-10 feature matches.\n- Include 4-6 criticalPoints, 4-6 quizInsights tied to the ACTUAL quiz answers below, and 4-6 community.themes with varied sentiment.\n- Scores realistic and varied.\n- Stay within the requested counts so the JSON object is COMPLETE and valid — never truncate mid-object.\n\n'
        'MARKET / AVAILABILITY CONTEXT:\n${_availabilityContext(product)}\n\n'
        'PRODUCT:\nName: ${l.name}\nBrand: ${l.brand.isEmpty ? '-' : l.brand}\nCategory: ${l.category}\nQor AI Tech Score: ${l.score}/100\nApprox catalog price: ${l.price}\nCatalog specs: ${l.ks}\n\n'
        'COMPARED AGAINST: ${peers.isEmpty ? '-' : peers.join(', ')}\n\n'
        'COMPARISON QUIZ ANSWERS:\n${_quizLines(quizAnswers)}\n\n'
        '${prof.isNotEmpty ? 'USER PROFILE / USER-RECOGNITION SIGNALS:\n$prof\n\n' : ''}'
        'WEB RESEARCH NOTES:\n${research.isNotEmpty ? research : 'No grounded research notes were available; rely on catalog specs and clearly label uncertainty.'}';
  }

  static String buildCompareVerdictPrompt(
    List<ProductEntity> products,
    List<Map<String, dynamic>> reports,
    String lang,
    Map<String, dynamic> profile, {
    List<dynamic> quizAnswers = const [],
    String research = '',
  }) {
    final names = products.map((p) => p.nameForLanguage(lang)).toList();
    final summaries = reports.map((r) {
      return {
        'name': r['name'],
        'matchScore': r['matchScore'],
        'summary': _firstSentences((r['matchComment'] ?? '').toString(), 3),
        'pros': (r['pros'] is List)
            ? (r['pros'] as List).take(4).toList()
            : [],
        'cons': (r['cons'] is List)
            ? (r['cons'] as List).take(4).toList()
            : [],
        'topFactors': (r['factors'] is List)
            ? (r['factors'] as List)
                  .take(8)
                  .map((f) => {'label': f['label'], 'score': f['score']})
                  .toList()
            : [],
      };
    }).toList();
    final prof = _profileString(profile);
    return 'You are Qor AI\'s senior comparison analyst. Each product already has its own full review (compact summaries below). Produce ONLY the final cross-product comparison verdict.\n\n'
        '${_languageGate(lang)}\n\n${_freshnessRules()}\n\n'
        'Return ONLY one valid JSON object with this exact structure:\n'
        '{\n'
        '  "winner": "exact product name — must be exactly one of: ${names.join(' | ')}",\n'
        '  "winnerScore": <0-100>,\n'
        '  "scoreGap": <number>,\n'
        '  "chart": [{"name": "product", "score": <0-100>, "reason": "short reason"}],\n'
        '  "factorMatrix": [{"label": "factor", "scores": [{"name": "product", "score": <0-100>}]}],\n'
        '  "decisiveDifferences": ["5-6 detailed differences"],\n'
        '  "headToHead": "5-7 substantial paragraphs",\n'
        '  "recommendation": "5-7 substantial paragraphs explaining which one to buy and why"\n'
        '}\n\n'
        'Rules:\n- chart must include EVERY product (${names.length} total) by exact name.\n- factorMatrix: 6-8 shared factors, each scored for every product by exact name.\n- winner MUST be one of the listed names exactly.\n- Be decisive and concrete.\n\n'
        'PRODUCTS (in column order): ${names.join(', ')}\n\n'
        'PER-PRODUCT REVIEW SUMMARIES:\n${jsonEncode(summaries)}\n\n'
        'COMPARISON QUIZ ANSWERS:\n${_quizLines(quizAnswers)}\n\n'
        '${prof.isNotEmpty ? 'USER PROFILE / USER-RECOGNITION SIGNALS:\n$prof\n\n' : ''}'
        'WEB RESEARCH NOTES:\n${research.isNotEmpty ? research : 'No grounded research notes were available.'}';
  }

  static String _firstSentences(String text, int n) {
    final raw = text.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (raw.isEmpty) return '';
    final parts = raw.split(RegExp(r'(?<=[.!?])\s+'));
    return parts.length > n ? parts.take(n).join(' ') : raw;
  }

  // ── Freshness quality gate (mirrors web hasStaleAvailabilityClaims) ────────
  // Detects stale "not released / unannounced / based on previous-gen" wording
  // in EN/TR/DE so the product report can be rewritten once before it ships.

  static final List<RegExp> _staleAvailabilityPatterns = [
    RegExp(
      r'hen[üu]z\s+(?:duyurulmam[ıi]ş|tan[ıi]t[ıi]lmam[ıi]ş|piyasada\s+de[ğg]il|sat[ıi]şa\s+[çc][ıi]kmam[ıi]ş|[çc][ıi]kmad[ıi])',
      caseSensitive: false,
    ),
    RegExp(
      r'(?:daha|hen[üu]z)\s+(?:piyasada|sat[ıi]şta)\s+(?:de[ğg]il|yok)',
      caseSensitive: false,
    ),
    RegExp(
      r'performans\s+tahmin(?:i|leri).{0,90}(?:M4|[öo]nceki\s+nesil|previous generation)',
      caseSensitive: false,
    ),
    RegExp(r'M4\s+Max.{0,90}(?:dayan|baz|temel|based)', caseSensitive: false),
    RegExp(
      r'\b(?:unannounced|not yet announced|not yet released|not yet launched|not yet available)\b',
      caseSensitive: false,
    ),
    RegExp(
      r'\bnot\s+(?:yet\s+)?(?:on the market|released|launched)\b',
      caseSensitive: false,
    ),
    RegExp(
      r'performance\s+estimates?.{0,90}(?:M4|previous generation)',
      caseSensitive: false,
    ),
  ];

  static bool hasStaleAvailabilityClaims(String? raw) {
    final text = raw ?? '';
    if (text.isEmpty) return false;
    return _staleAvailabilityPatterns.any((re) => re.hasMatch(text));
  }

  static String withFreshnessRetryInstruction(
    String prompt,
    List<String> productNames,
  ) {
    final names = productNames
        .map((x) => x.trim())
        .where((x) => x.isNotEmpty)
        .join(', ');
    return '$prompt\n\nQUALITY GATE RETRY:\n'
        'The previous answer was rejected because it contained stale release/availability claims. Rewrite the JSON from scratch.\n'
        '${names.isNotEmpty ? 'Products that must keep exact names: $names\n' : ''}'
        '${_freshnessRules()}'
        '\nForbidden stale wording includes: unannounced, not on the market, not released, not yet available, based on M4 Max estimates, or equivalent Turkish wording unless current web research explicitly proves it.';
  }

  // ── JSON parsing (mirrors web parseAiJson) ────────────────────────────────

  static Map<String, dynamic>? parseAiJson(String? raw) {
    if (raw == null || raw.trim().isEmpty) return null;
    var s = raw.trim();
    final fence = RegExp(r'```(?:json)?\s*([\s\S]*?)```', caseSensitive: false)
        .firstMatch(s);
    if (fence != null) s = fence.group(1)!.trim();
    final a = s.indexOf('{');
    final b = s.lastIndexOf('}');
    if (a != -1 && b != -1 && b > a) s = s.substring(a, b + 1);
    try {
      final decoded = json.decode(s);
      return decoded is Map ? Map<String, dynamic>.from(decoded) : null;
    } catch (_) {}
    try {
      final cleaned = s.replaceAll(RegExp(r',\s*([}\]])'), r'$1');
      final decoded = json.decode(cleaned);
      return decoded is Map ? Map<String, dynamic>.from(decoded) : null;
    } catch (_) {
      return null;
    }
  }

  // ── AI calls (Gemini heavy JSON → DeepSeek fallback) ──────────────────────

  /// Web-parity grounded research persona (askQorAiGrounded system text).
  static String _researchSystem(String lang) {
    return "You are Qor AI's web research assistant. Current date: ${_currentReportDate()}. "
        'You MUST use the provided Google Search grounding tool for product status, official specs, market availability, review/community sentiment, and price-cycle signals. '
        'Do not answer from model memory for launch status or availability. If search evidence is thin, say exactly what is uncertain instead of guessing. '
        'Reply in ${_langName(lang)}. Summarize evidence, source types, current market status, and uncertainty. '
        'Do not invent quotes, exact prices, or review counts.';
  }

  static Future<Map<String, dynamic>?> _askJson(
    WidgetRef ref,
    String prompt,
    String lang, {
    int maxTokens = 8192,
    double temperature = 0.45,
    DateTime? deadline,
  }) async {
    // TOPLAM SÜRE BÜTÇESİ (web `lib/ai.js` paritesi). Eskiden her denemenin
    // kendi 60 sn'lik zaman aşımı vardı ama TOPLAM sınır YOKTU: yavaş (hata
    // vermeyen, sadece geç dönen) bir sağlayıcıda 2×60 sn Gemini + DeepSeek
    // arka arkaya koşabiliyor ve kullanıcı "analiz hiç bitmiyor" durumunda
    // kalıyordu. Artık her deneme KALAN süreye göre kısılır; süre bitince
    // elde olanla devam edilir.
    int leftMs() => deadline == null
        ? 60000
        : deadline.difference(DateTime.now()).inMilliseconds;
    Duration slice(int capSeconds) {
      final left = leftMs();
      final ms = left <= 0 ? 0 : (left < capSeconds * 1000 ? left : capSeconds * 1000);
      return Duration(milliseconds: ms);
    }

    final gemini = ref.read(geminiServiceProvider);
    for (var attempt = 0; attempt < 2; attempt++) {
      if (leftMs() <= 3000) break;
      try {
        final result = await gemini
            .jsonFreeTextQuery(
              prompt,
              language: lang,
              maxTokens: maxTokens,
              tier: AiTier.heavy,
              temperature: temperature,
            )
            .timeout(slice(60));
        final parsed = parseAiJson(result);
        if (parsed != null) return parsed;
      } catch (e) {
        debugPrint('[Qor AI report] gemini attempt $attempt failed: $e');
      }
    }
    if (leftMs() <= 3000) return null;
    try {
      final deepseek = ref.read(deepSeekServiceProvider);
      final result = await deepseek
          .jsonFreeTextQuery(
            prompt,
            language: lang,
            maxTokens: maxTokens,
            temperature: temperature,
          )
          .timeout(slice(60));
      return parseAiJson(result);
    } catch (e) {
      debugPrint('[Qor AI report] deepseek fallback failed: $e');
      return null;
    }
  }

  static Future<String> _askGrounded(
    WidgetRef ref,
    String prompt,
    String lang, {
    int maxTokens = 2048,
  }) async {
    try {
      final gemini = ref.read(geminiServiceProvider);
      return await gemini
          .groundedQuery(
            prompt,
            maxTokens: maxTokens,
            system: _researchSystem(lang),
            temperature: 0.2,
          )
          .timeout(const Duration(seconds: 40));
    } catch (e) {
      debugPrint('[Qor AI report] grounded research unavailable: $e');
      return '';
    }
  }

  /// MALİYET: Grounded research (Google Search) en pahalı kalemdir (~istek
  /// başına ücret). Aynı ürünün araştırması dakikalık değişmediği için ürün+dil
  /// bazında 24s cache'lenir → aynı ürün tekrar analiz edilince yeniden
  /// grounding YAPILMAZ (kişisel rapor yine taze üretilir, o ucuz/non-grounded).
  /// Quiz cevapları araştırmayı değil raporu kişiselleştirdiğinden cache anahtarı
  /// ürün+dil ile sınırlıdır (maksimum cache isabeti).
  static Future<String> _cachedGroundedResearch(
    WidgetRef ref,
    ProductEntity product,
    String lang,
    List<dynamic> quizAnswers,
  ) async {
    final cache = ref.read(cacheServiceProvider);
    final key = 'ai_research_${product.id}_$lang';
    try {
      final cached = await cache.getLocalStaleAsync<String>(key);
      if (cached.data != null && cached.data!.isNotEmpty && !cached.isStale) {
        debugPrint('[Qor AI report] ✅ research cache HIT ($key)');
        return cached.data!;
      }
    } catch (_) {}
    final research = await _askGrounded(
      ref,
      buildProductResearchPrompt(product, lang, quizAnswers),
      lang,
    );
    if (research.isNotEmpty) {
      try {
        await cache.setLocal(
          key,
          research,
          duration: const Duration(hours: 24),
        );
      } catch (_) {}
    }
    return research;
  }

  // ── Orchestration ─────────────────────────────────────────────────────────

  /// Builds a `product_full_report` for one product. Returns null only when the
  /// model never produced parseable JSON.
  /// HIZ: web araştırmasını quiz gösterilirken paralel başlatmak için. Rapor
  /// çağrısı bu future'ı bekler; kullanıcı quiz'i yanıtlarken araştırma çoktan
  /// bitmiş olur. Ekstra çağrı yok — sadece daha erken başlatılmış olur.
  static Future<String> prefetchProductResearch(
    WidgetRef ref,
    ProductEntity product,
    String lang, {
    List<dynamic> quizAnswers = const [],
  }) {
    return _cachedGroundedResearch(ref, product, lang, quizAnswers);
  }

  static Future<Map<String, dynamic>?> runProductReport({
    required WidgetRef ref,
    required ProductEntity product,
    required String lang,
    Map<String, dynamic> profile = const {},
    List<dynamic> quizAnswers = const [],
    List<ProductEntity> similarProducts = const [],
    Future<String>? researchFuture,
    void Function(AiReportStage stage)? onStage,
  }) async {
    onStage?.call(AiReportStage.prep);
    onStage?.call(AiReportStage.research);
    // Önceden başlatılmış (paralel) araştırma varsa onu kullan; boş/başarısızsa
    // güvenli şekilde normal araştırmaya düş.
    String research = '';
    if (researchFuture != null) {
      research = await researchFuture.catchError((_) => '');
    }
    if (research.isEmpty) {
      research = await _cachedGroundedResearch(ref, product, lang, quizAnswers);
    }
    onStage?.call(AiReportStage.report);
    final startedAt = DateTime.now();
    // Rapor üretimi için TOPLAM bütçe: bu süre dolunca elde ne varsa onunla
    // devam edilir (tazelik yeniden denemesi de bu bütçeden pay alır).
    final deadline = startedAt.add(const Duration(seconds: 150));

    // İKİ YARI PARALEL. Karar yarısı kritik, topluluk/pazar yarısı
    // zenginleştirme: ikincisi boş dönerse rapor yine üretilir.
    final corePrompt = buildCoreReportPrompt(
      product,
      lang,
      profile,
      quizAnswers: quizAnswers,
      research: research,
      similarProducts: similarProducts,
    );
    final coreFuture = _askJson(
      ref,
      corePrompt,
      lang,
      maxTokens: 8192,
      temperature: 0.45,
      deadline: deadline,
    );
    final communityFuture = _askJson(
      ref,
      buildCommunityReportPrompt(
        product,
        lang,
        profile,
        quizAnswers: quizAnswers,
        research: research,
        similarProducts: similarProducts,
      ),
      lang,
      maxTokens: 8192,
      temperature: 0.45,
      deadline: deadline,
    ).catchError((_) => null);

    final halves = await Future.wait([coreFuture, communityFuture]);
    final core = halves[0];
    final extra = halves[1];
    if (core == null) return null;

    final data = <String, dynamic>{...core};
    if (extra != null) {
      for (final key in const ['community', 'alternatives', 'priceForecast']) {
        final v = extra[key];
        if (v != null) data[key] = v;
      }
    }
    // Tazelik kapısı yalnız KARAR yarısını yeniden üretir; topluluk yarısı
    // yeniden çağrılmaz (fazladan istek = fazladan bekleme + maliyet).
    final prompt = corePrompt;

    // Freshness quality gate: if the report still carries stale launch/
    // availability claims, rewrite once at the model's stricter pass (mirrors
    // web ProductDetail's hasStaleAvailabilityClaims retry). A parseable report
    // beats erroring out, so we only swap when the retry came back clean and
    // there is still time budget left.
    if (hasStaleAvailabilityClaims(jsonEncode(data)) &&
        DateTime.now().difference(startedAt).inSeconds < 95) {
      final retry = await _askJson(
        ref,
        withFreshnessRetryInstruction(prompt, [product.nameForLanguage(lang)]),
        lang,
        maxTokens: 8192,
        temperature: 0.25,
        deadline: deadline,
      );
      // Yeniden deneme YALNIZ karar yarısını üretir → topluluk/alternatif/fiyat
      // bölümlerinin üzerine yazma, yoksa rapor yarım kalır.
      if (retry != null && !hasStaleAvailabilityClaims(jsonEncode(retry))) {
        final p = retry['product'];
        if (p != null) data['product'] = p;
      }
    }
    data['type'] = 'product_full_report';
    return data;
  }

  /// Builds a `compare_full_report`: per-product sections (run with limited
  /// concurrency so each completes within the provider cap) + a verdict.
  static Future<Map<String, dynamic>?> runCompareReport({
    required WidgetRef ref,
    required List<ProductEntity> products,
    required String lang,
    Map<String, dynamic> profile = const {},
    List<dynamic> quizAnswers = const [],
    void Function(AiReportStage stage)? onStage,
  }) async {
    if (products.length < 2) return null;
    onStage?.call(AiReportStage.prep);
    onStage?.call(AiReportStage.research);
    final research = await _askGrounded(
      ref,
      buildCompareResearchPrompt(products, lang, quizAnswers),
      lang,
      maxTokens: 2048,
    );
    onStage?.call(AiReportStage.report);

    final peerNames = products.map((p) => p.nameForLanguage(lang)).toList();
    final reports = await _mapWithConcurrency<ProductEntity, Map<String, dynamic>?>(
      products,
      5,
      (p) async {
        final parsed = await _askJson(
          ref,
          buildCompareProductPrompt(
            p,
            lang,
            profile,
            quizAnswers: quizAnswers,
            research: research,
            peerNames: peerNames,
          ),
          lang,
          maxTokens: 8192,
          temperature: 0.42,
        );
        if (parsed == null) return null;
        parsed['name'] = parsed['name'] ?? p.nameForLanguage(lang);
        parsed['imageUrl'] = p.imageUrl ?? parsed['imageUrl'] ?? '';
        return parsed;
      },
    );
    final okReports = reports.whereType<Map<String, dynamic>>().toList();
    if (okReports.length < 2) return null;

    Map<String, dynamic> verdict = {};
    final v = await _askJson(
      ref,
      buildCompareVerdictPrompt(
        products,
        okReports,
        lang,
        profile,
        quizAnswers: quizAnswers,
        research: research,
      ),
      lang,
      maxTokens: 6144,
      temperature: 0.40,
    );
    if (v != null) verdict = v;

    return {
      'type': 'compare_full_report',
      'products': okReports,
      'comparison': verdict,
    };
  }

  static Future<List<R>> _mapWithConcurrency<T, R>(
    List<T> items,
    int limit,
    Future<R> Function(T) fn,
  ) async {
    final results = List<R?>.filled(items.length, null);
    var index = 0;
    Future<void> worker() async {
      while (true) {
        final i = index++;
        if (i >= items.length) break;
        results[i] = await fn(items[i]);
      }
    }

    final workers = List.generate(
      limit.clamp(1, items.length),
      (_) => worker(),
    );
    await Future.wait(workers);
    return results.cast<R>();
  }
}
