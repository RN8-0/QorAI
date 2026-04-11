part of 'providers.dart';

// ════════════════════════════════════════════════════
// ─── GEMINI CACHE NOTIFIER MIXIN (DRY base) ───
// ════════════════════════════════════════════════════

/// Shared mixin for Gemini AI cache notifiers.
/// Provides: loading guard, error handling, reset, gemini access.
mixin GeminiCacheNotifierMixin<T> on StateNotifier<AsyncValue<T?>> {
  Ref get cacheRef;

  GeminiService get gemini => cacheRef.read(geminiServiceProvider);

  /// Resets cached state to null.
  void reset() => state = const AsyncValue.data(null);

  /// Runs query with loading guard: skips if already loading or has cached data.
  Future<void> guardedQuery(
    Future<T?> Function() queryFn, {
    T? Function()? onError,
  }) async {
    if (state is AsyncLoading) return;
    if (state.valueOrNull != null) return;
    state = const AsyncValue.loading();
    try {
      state = AsyncValue.data(await queryFn());
    } catch (e) {
      state = AsyncValue.data(onError?.call());
    }
  }
}


// ════════════════════════════════════════════════════
// ─── AI REVIEW SUMMARY CACHE ───
// ════════════════════════════════════════════════════

class AIReviewResult {
  final String summary;
  final int satisfaction;
  final List<String> praised;
  final List<String> criticized;
  final bool failed;
  const AIReviewResult({
    this.summary = '',
    this.satisfaction = 0,
    this.praised = const [],
    this.criticized = const [],
    this.failed = false,
  });
}

final aiReviewCacheProvider = StateNotifierProvider.family<
    _AIReviewNotifier, AsyncValue<AIReviewResult?>, String>((ref, productId) {
  return _AIReviewNotifier(ref, productId);
});

class _AIReviewNotifier extends StateNotifier<AsyncValue<AIReviewResult?>> {
  final Ref _ref;
  final String _productId;
  _AIReviewNotifier(this._ref, this._productId) : super(const AsyncValue.data(null));

  Future<void> startAnalysis(String productName, String language) async {
    if (state is AsyncLoading) return;
    if (state.valueOrNull != null) return;
    state = const AsyncValue.loading();
    try {
      final gemini = _ref.read(geminiServiceProvider);
      final langName = _getLanguageName(language);
      final response = await gemini.jsonFreeTextQuery(
        'You are a product sentiment analyst. Based on your knowledge of publicly available '
        'user reviews, Reddit threads, forum discussions, YouTube comments, and tech community '
        'feedback for "$productName", provide a consumer sentiment analysis.\n\n'
        'Focus on real user opinions from Reddit, tech forums, review sites, and general consumer feedback.\n\n'
        'IMPORTANT: ALL text must be written in $langName language.\n\n'
        'Return a JSON object with these fields:\n'
        '"summary": A 2-3 sentence overview of what users think. Write in $langName.\n'
        '"satisfaction": Integer 0-100 representing overall user satisfaction percentage\n'
        '"praised": Array of 3-4 specific features/aspects users consistently praise. Write in $langName.\n'
        '"criticized": Array of 2-3 specific issues users consistently criticize. Write in $langName.',
        language: language,
      );
      if (response.isNotEmpty) {
        try {
          final start = response.indexOf('{');
          final end = response.lastIndexOf('}');
          if (start == -1 || end == -1 || end <= start) throw const FormatException('No JSON');
          final data = Map<String, dynamic>.from(jsonDecode(response.substring(start, end + 1)) as Map);
          state = AsyncValue.data(AIReviewResult(
            summary: data['summary']?.toString() ?? '',
            satisfaction: data['satisfaction'] is num
                ? (data['satisfaction'] as num).toInt().clamp(0, 100)
                : int.tryParse(data['satisfaction']?.toString() ?? '') ?? 0,
            praised: (data['praised'] is List) ? (data['praised'] as List).map((e) => e.toString()).toList() : [],
            criticized: (data['criticized'] is List) ? (data['criticized'] as List).map((e) => e.toString()).toList() : [],
          ));
        } catch (_) {
          state = const AsyncValue.data(AIReviewResult(summary: 'Analysis failed. Please try again.', failed: true));
        }
      } else {
        state = const AsyncValue.data(AIReviewResult(failed: true));
      }
    } catch (e) {
      state = const AsyncValue.data(AIReviewResult(failed: true));
    }
  }

  void reset() => state = const AsyncValue.data(null);

  static String _getLanguageName(String code) {
    switch (code) {
      case 'tr': return 'Turkish';
      case 'de': return 'German';
      case 'fr': return 'French';
      case 'es': return 'Spanish';
      case 'pt': return 'Portuguese';
      case 'it': return 'Italian';
      case 'ja': return 'Japanese';
      case 'ko': return 'Korean';
      case 'zh': return 'Chinese';
      case 'ru': return 'Russian';
      case 'ar': return 'Arabic';
      case 'hi': return 'Hindi';
      default: return 'English';
    }
  }
}

// ════════════════════════════════════════════════════
// ─── EXPERT SCORES CACHE ───
// ════════════════════════════════════════════════════

class ExpertScoreEntry {
  final String source;
  final int score;
  final int maxScore;
  final String verdict;
  const ExpertScoreEntry({
    required this.source,
    required this.score,
    required this.maxScore,
    required this.verdict,
  });
}

class ExpertScoresResult {
  final List<ExpertScoreEntry> scores;
  final bool failed;
  const ExpertScoresResult({this.scores = const [], this.failed = false});
}

final expertScoresCacheProvider = StateNotifierProvider.family<
    _ExpertScoresNotifier, AsyncValue<ExpertScoresResult?>, String>((ref, productId) {
  return _ExpertScoresNotifier(ref, productId);
});

class _ExpertScoresNotifier extends StateNotifier<AsyncValue<ExpertScoresResult?>> {
  final Ref _ref;
  final String _productId;
  _ExpertScoresNotifier(this._ref, this._productId) : super(const AsyncValue.data(null));

  Future<void> fetchScores(String productName, String category) async {
    if (state is AsyncLoading) return;
    if (state.valueOrNull != null) return;
    state = const AsyncValue.loading();
    try {
      final gemini = _ref.read(geminiServiceProvider);
      final response = await gemini.jsonFreeTextQuery(
        'You are a tech product review aggregator. For the product "$productName" (category: $category), '
        'estimate typical review scores from well-known tech review sites.\n\n'
        'Only include sites that would actually review this type of product.\n'
        'For smartphones: GSMArena, Tom\'s Guide, PCMag, TechRadar\n'
        'For laptops: NotebookCheck, LaptopMag, Tom\'s Guide, PCMag\n'
        'For monitors/TVs: Rtings, Tom\'s Guide, PCMag\n'
        'For headphones/audio: Rtings, What Hi-Fi, SoundGuys\n'
        'For other products: pick 3-4 relevant review sites.\n\n'
        'Return JSON: {"expertScores": [{"source": "<site name>", "score": <int>, "maxScore": <int usually 100 or 10>, "verdict": "<one word: Excellent/Good/Average/Below Average>"}]}\n'
        'Include 3-4 sources maximum. If product is too new or niche, return empty array.',
      );
      if (response.isNotEmpty) {
        try {
          final cleaned = _cleanJsonString(response);
          final data = _decodeJsonMap(cleaned);
          if (data != null && data['expertScores'] is List) {
            final entries = (data['expertScores'] as List).map((e) {
              if (e is! Map) return null;
              return ExpertScoreEntry(
                source: e['source']?.toString() ?? '',
                score: _safeInt(e['score']),
                maxScore: _safeInt(e['maxScore'], 100),
                verdict: e['verdict']?.toString() ?? '',
              );
            }).whereType<ExpertScoreEntry>().where((e) => e.source.isNotEmpty && e.score > 0).toList();
            state = AsyncValue.data(ExpertScoresResult(scores: entries));
          } else {
            state = const AsyncValue.data(ExpertScoresResult(failed: true));
          }
        } catch (_) {
          state = const AsyncValue.data(ExpertScoresResult(failed: true));
        }
      } else {
        state = const AsyncValue.data(ExpertScoresResult(failed: true));
      }
    } catch (_) {
      state = const AsyncValue.data(ExpertScoresResult(failed: true));
    }
  }
}

// ════════════════════════════════════════════════════
// ─── DEEP ANALYSIS CACHE ───
// ════════════════════════════════════════════════════

// ─── JSON parse helpers ───

/// Safely converts dynamic value to int (handles both num and string)
int _safeInt(dynamic v, [int fallback = 0]) {
  if (v is num) return v.toInt();
  if (v is String) return int.tryParse(v) ?? fallback;
  return fallback;
}

/// Safely converts dynamic value to double (handles both num and string)
double _safeDouble(dynamic v, [double fallback = 0]) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? fallback;
  return fallback;
}

/// Cleans raw API response string before JSON decoding:
/// - Trims whitespace
/// - Removes BOM
/// - Strips markdown code fences (```json ... ```)
/// - Extracts first JSON object/array if surrounded by text
String _cleanJsonString(String raw) {
  var s = raw.trim();
  // Remove BOM
  s = s.replaceAll('\uFEFF', '');
  // Strip markdown code fences
  s = s.replaceFirst(RegExp(r'^```\w*\s*'), '');
  s = s.replaceFirst(RegExp(r'\s*```\s*$'), '');
  s = s.trim();
  // If it doesn't start with { or [, try to extract JSON
  if (!s.startsWith('{') && !s.startsWith('[')) {
    // Try object first, then array
    final objMatch = RegExp(r'(\{[\s\S]*\})', multiLine: true).firstMatch(s);
    if (objMatch != null) {
      s = objMatch.group(1)!;
    } else {
      final arrMatch = RegExp(r'(\[[\s\S]*\])', multiLine: true).firstMatch(s);
      if (arrMatch != null) s = arrMatch.group(1)!;
    }
  }
  // Remove trailing commas before } or ]
  s = s.replaceAll(RegExp(r',\s*([}\]])'), r'$1');
  return s;
}

/// Decodes a cleaned JSON string into a Map, handling edge cases
Map<String, dynamic> _decodeJsonMap(String raw) {
  final cleaned = _cleanJsonString(raw);
  final decoded = jsonDecode(cleaned);
  // If Gemini returns an array, take the first element
  if (decoded is List && decoded.isNotEmpty) {
    return decoded[0] as Map<String, dynamic>;
  }
  return decoded as Map<String, dynamic>;
}

// ─── Parsed result types for rich visual rendering ───

class DeepAnalysisResult {
  final int overallScore;
  final List<AnalysisAttribute> strengths;
  final List<AnalysisAttribute> weaknesses;
  final List<String> pros;
  final List<String> cons;
  final String verdict;
  final String? rawFallback; // fallback markdown if JSON parse fails
  const DeepAnalysisResult({
    this.overallScore = 0,
    this.strengths = const [],
    this.weaknesses = const [],
    this.pros = const [],
    this.cons = const [],
    this.verdict = '',
    this.rawFallback,
  });
}

class AnalysisAttribute {
  final String name;
  final int score;
  final String detail;
  const AnalysisAttribute({required this.name, required this.score, required this.detail});
}

class AlternativesResult {
  final List<AlternativeProduct> alternatives;
  final String? rawFallback;
  const AlternativesResult({this.alternatives = const [], this.rawFallback});
}

class AlternativeProduct {
  final String name;
  final String advantage;
  final String tradeoff;
  final String priceComparison;
  final String bestFor;
  final String whyBetter;
  const AlternativeProduct({
    required this.name,
    this.advantage = '',
    this.tradeoff = '',
    this.priceComparison = '',
    this.bestFor = '',
    this.whyBetter = '',
  });
}

class AdvisorResult {
  final String whoShouldBuy;
  final String whoShouldAvoid;
  final List<String> reasonsToBuy;
  final List<String> reasonsToSkip;
  final List<String> proTips;
  final double valueRating;
  final String ratingExplanation;
  final String? rawFallback;
  const AdvisorResult({
    this.whoShouldBuy = '',
    this.whoShouldAvoid = '',
    this.reasonsToBuy = const [],
    this.reasonsToSkip = const [],
    this.proTips = const [],
    this.valueRating = 0,
    this.ratingExplanation = '',
    this.rawFallback,
  });
}

class PredictionResult {
  final String trend; // "up", "down", "stable"
  final int trendPercentage;
  final String bestTimeToBuy;
  final String expectedDrop;
  final String buyOrWait; // "buy", "wait"
  final String reasoning;
  final String? rawFallback;
  const PredictionResult({
    this.trend = 'stable',
    this.trendPercentage = 0,
    this.bestTimeToBuy = '',
    this.expectedDrop = '',
    this.buyOrWait = 'buy',
    this.reasoning = '',
    this.rawFallback,
  });
}

/// Caches AI deep analysis results per product ID so they survive navigation.
final deepAnalysisCacheProvider = StateNotifierProvider.family<
    _DeepAnalysisNotifier, AsyncValue<DeepAnalysisResult?>, String>((ref, productId) {
  return _DeepAnalysisNotifier(ref, productId);
});

class _DeepAnalysisNotifier extends StateNotifier<AsyncValue<DeepAnalysisResult?>> {
  final Ref _ref;
  final String _productId;

  _DeepAnalysisNotifier(this._ref, this._productId) : super(const AsyncValue.data(null));

  Future<void> startAnalysis(String productName, String language, {String category = '', String? brand, int? year}) async {
    if (state is AsyncLoading) return;
    if (state.valueOrNull != null) return;
    state = const AsyncValue.loading();
    try {
      final gemini = _ref.read(geminiServiceProvider);
      final catInfo = category.isNotEmpty ? ' (Category: $category)' : '';
      final brandInfo = (brand != null && brand.isNotEmpty) ? ' by $brand' : '';
      final yearInfo = (year != null && year > 0) ? ', released around $year' : '';
      final result = await gemini.jsonFreeTextQuery(
        'You are a senior tech product analyst. The product name is exactly "$productName"$brandInfo$catInfo$yearInfo. '
        'Do NOT assume any typo in the product name — use it exactly as given.\n\n'
        'Return a JSON object with this EXACT structure:\n'
        '{\n'
        '  "overallScore": <number 0-100>,\n'
        '  "strengths": [{"name": "<aspect>", "score": <0-100>, "detail": "<1 sentence>"}],\n'
        '  "weaknesses": [{"name": "<aspect>", "score": <0-100>, "detail": "<1 sentence>"}],\n'
        '  "pros": ["<pro1>", "<pro2>", "<pro3>"],\n'
        '  "cons": ["<con1>", "<con2>", "<con3>"],\n'
        '  "verdict": "<2-3 sentence final verdict>"\n'
        '}\n\n'
        'Rules:\n'
        '- Provide 3-5 strengths and 2-4 weaknesses\n'
        '- Scores should be realistic and varied (not all 80-90)\n'
        '- Pros/cons should be concise (max 10 words each)\n'
        '- Be honest and specific, not generic praise',
        language: language,
      );
      state = AsyncValue.data(_parseDeepAnalysis(result));
    } catch (e) {
      state = AsyncValue.data(DeepAnalysisResult(rawFallback: 'Unable to generate analysis at this time.'));
    }
  }

  DeepAnalysisResult _parseDeepAnalysis(String raw) {
    try {
      final json = _decodeJsonMap(raw);
      return DeepAnalysisResult(
        overallScore: _safeInt(json['overallScore']),
        strengths: (json['strengths'] as List? ?? []).map((s) => AnalysisAttribute(
          name: s['name']?.toString() ?? '',
          score: _safeInt(s['score']),
          detail: s['detail']?.toString() ?? '',
        )).toList(),
        weaknesses: (json['weaknesses'] as List? ?? []).map((w) => AnalysisAttribute(
          name: w['name']?.toString() ?? '',
          score: _safeInt(w['score']),
          detail: w['detail']?.toString() ?? '',
        )).toList(),
        pros: (json['pros'] as List? ?? []).map((p) => p.toString()).toList(),
        cons: (json['cons'] as List? ?? []).map((c) => c.toString()).toList(),
        verdict: json['verdict']?.toString() ?? '',
      );
    } catch (e, st) {
      debugPrint('[DeepAnalysis] Parse error: $e\n$st\nRaw(200): ${raw.substring(0, raw.length < 200 ? raw.length : 200)}');
      return DeepAnalysisResult(rawFallback: raw);
    }
  }

  void reset() {
    state = const AsyncValue.data(null);
  }
}

// ════════════════════════════════════════════════════
// ─── PREMIUM AI CACHE PROVIDERS ───
// ════════════════════════════════════════════════════

/// Alternatives cache — survives tab switches
final alternativesCacheProvider = StateNotifierProvider.family<
    _AlternativesCacheNotifier, AsyncValue<AlternativesResult?>, String>((ref, productId) {
  return _AlternativesCacheNotifier(ref, productId);
});

class _AlternativesCacheNotifier extends StateNotifier<AsyncValue<AlternativesResult?>> {
  final Ref _ref;
  final String _productId;
  _AlternativesCacheNotifier(this._ref, this._productId) : super(const AsyncValue.data(null));

  Future<void> startQuery(String productName, String category, String language) async {
    if (state is AsyncLoading) return;
    if (state.valueOrNull != null) return;
    state = const AsyncValue.loading();
    try {
      final gemini = _ref.read(geminiServiceProvider);
      final cat = category.isEmpty ? 'tech product' : category;
      final result = await gemini.jsonFreeTextQuery(
        'The product name is exactly "$productName" ($cat). Do NOT assume any typo in the name.\n\n'
        'Return a JSON object with this EXACT structure:\n'
        '{\n'
        '  "alternatives": [\n'
        '    {\n'
        '      "name": "<full product name>",\n'
        '      "advantage": "<one clear advantage over $productName>",\n'
        '      "tradeoff": "<one disadvantage or compromise>",\n'
        '      "priceComparison": "<cheaper/similar/pricier>",\n'
        '      "bestFor": "<target user in 5 words max>",\n'
        '      "whyBetter": "<brief reason this might be preferred>"\n'
        '    }\n'
        '  ]\n'
        '}\n\n'
        'Provide exactly 5 real alternative products. Be specific with actual product names.',
        language: language,
      );
      state = AsyncValue.data(_parseAlternatives(result));
    } catch (e) {
      state = AsyncValue.data(AlternativesResult(rawFallback: 'Unable to find alternatives at this time.'));
    }
  }

  AlternativesResult _parseAlternatives(String raw) {
    try {
      final json = _decodeJsonMap(raw);
      final alts = (json['alternatives'] as List? ?? []).map((a) => AlternativeProduct(
        name: a['name']?.toString() ?? '',
        advantage: a['advantage']?.toString() ?? '',
        tradeoff: a['tradeoff']?.toString() ?? '',
        priceComparison: a['priceComparison']?.toString() ?? '',
        bestFor: a['bestFor']?.toString() ?? '',
        whyBetter: a['whyBetter']?.toString() ?? '',
      )).toList();
      return AlternativesResult(alternatives: alts);
    } catch (e, st) {
      debugPrint('[Alternatives] Parse error: $e\n$st\nRaw(200): ${raw.substring(0, raw.length < 200 ? raw.length : 200)}');
      return AlternativesResult(rawFallback: raw);
    }
  }

  void reset() => state = const AsyncValue.data(null);
}

/// AI Advisor cache — survives tab switches
final advisorCacheProvider = StateNotifierProvider.family<
    _AdvisorCacheNotifier, AsyncValue<AdvisorResult?>, String>((ref, productId) {
  return _AdvisorCacheNotifier(ref, productId);
});

class _AdvisorCacheNotifier extends StateNotifier<AsyncValue<AdvisorResult?>> {
  final Ref _ref;
  final String _productId;
  _AdvisorCacheNotifier(this._ref, this._productId) : super(const AsyncValue.data(null));

  Future<void> startQuery(String productName, String category, String price, String language) async {
    if (state is AsyncLoading) return;
    if (state.valueOrNull != null) return;
    state = const AsyncValue.loading();
    try {
      final gemini = _ref.read(geminiServiceProvider);
      final cat = category.isEmpty ? 'tech product' : category;
      final result = await gemini.jsonFreeTextQuery(
        'As an expert tech advisor, the product name is exactly "$productName" ($cat, $price). Do NOT assume any typo in the name.\n\n'
        'Return a JSON object with this EXACT structure:\n'
        '{\n'
        '  "whoShouldBuy": "<2 sentence description of the ideal buyer>",\n'
        '  "whoShouldAvoid": "<2 sentence description of who should skip this>",\n'
        '  "reasonsToBuy": ["<reason1>", "<reason2>", "<reason3>"],\n'
        '  "reasonsToSkip": ["<reason1>", "<reason2>", "<reason3>"],\n'
        '  "proTips": ["<tip1>", "<tip2>"],\n'
        '  "valueRating": <number 1-10>,\n'
        '  "ratingExplanation": "<1 sentence explaining the rating>"\n'
        '}\n\n'
        'Be specific and honest. Reasons should be concise (max 15 words each).',
        language: language,
      );
      state = AsyncValue.data(_parseAdvisor(result));
    } catch (e) {
      state = AsyncValue.data(AdvisorResult(rawFallback: 'Unable to generate advice.'));
    }
  }

  AdvisorResult _parseAdvisor(String raw) {
    try {
      final json = _decodeJsonMap(raw);
      return AdvisorResult(
        whoShouldBuy: json['whoShouldBuy']?.toString() ?? '',
        whoShouldAvoid: json['whoShouldAvoid']?.toString() ?? '',
        reasonsToBuy: (json['reasonsToBuy'] as List? ?? []).map((r) => r.toString()).toList(),
        reasonsToSkip: (json['reasonsToSkip'] as List? ?? []).map((r) => r.toString()).toList(),
        proTips: (json['proTips'] as List? ?? []).map((t) => t.toString()).toList(),
        valueRating: _safeDouble(json['valueRating']),
        ratingExplanation: json['ratingExplanation']?.toString() ?? '',
      );
    } catch (e, st) {
      debugPrint('[Advisor] Parse error: $e\n$st\nRaw(200): ${raw.substring(0, raw.length < 200 ? raw.length : 200)}');
      return AdvisorResult(rawFallback: raw);
    }
  }

  void reset() => state = const AsyncValue.data(null);
}

/// Price Prediction cache — survives tab switches
final predictionCacheProvider = StateNotifierProvider.family<
    _PredictionCacheNotifier, AsyncValue<PredictionResult?>, String>((ref, productId) {
  return _PredictionCacheNotifier(ref, productId);
});

class _PredictionCacheNotifier extends StateNotifier<AsyncValue<PredictionResult?>> {
  final Ref _ref;
  final String _productId;
  _PredictionCacheNotifier(this._ref, this._productId) : super(const AsyncValue.data(null));

  Future<void> startQuery(String productName, String category, String price, String language) async {
    if (state is AsyncLoading) return;
    if (state.valueOrNull != null) return;
    state = const AsyncValue.loading();
    try {
      final gemini = _ref.read(geminiServiceProvider);
      final cat = category.isEmpty ? 'tech product' : category;
      final result = await gemini.jsonFreeTextQuery(
        'The product name is exactly "$productName" ($cat, current price: $price). Do NOT assume any typo in the name.\n\n'
        'Return a JSON object with this EXACT structure:\n'
        '{\n'
        '  "trend": "<up/down/stable>",\n'
        '  "trendPercentage": <number 0-100>,\n'
        '  "bestTimeToBuy": "<when to buy, 1-2 sentences>",\n'
        '  "expectedDrop": "<expected price change description>",\n'
        '  "buyOrWait": "<buy/wait>",\n'
        '  "reasoning": "<2-3 sentence explanation of the prediction>"\n'
        '}\n\n'
        'Base analysis on typical tech product lifecycle and market patterns. '
        'trendPercentage is the expected price change amount in percent.',
        language: language,
      );
      state = AsyncValue.data(_parsePrediction(result));
    } catch (e) {
      state = AsyncValue.data(PredictionResult(rawFallback: 'Unable to predict prices.'));
    }
  }

  PredictionResult _parsePrediction(String raw) {
    try {
      final json = _decodeJsonMap(raw);
      return PredictionResult(
        trend: json['trend']?.toString() ?? 'stable',
        trendPercentage: _safeInt(json['trendPercentage']),
        bestTimeToBuy: json['bestTimeToBuy']?.toString() ?? '',
        expectedDrop: json['expectedDrop']?.toString() ?? '',
        buyOrWait: json['buyOrWait']?.toString() ?? 'buy',
        reasoning: json['reasoning']?.toString() ?? '',
      );
    } catch (e, st) {
      debugPrint('[Prediction] Parse error: $e\n$st\nRaw(200): ${raw.substring(0, raw.length < 200 ? raw.length : 200)}');
      return PredictionResult(rawFallback: raw);
    }
  }

  void reset() => state = const AsyncValue.data(null);
}

// ════════════════════════════════════════════════════
// ─── GEMINI MATCH SCORE CACHE ───
// ════════════════════════════════════════════════════

class GeminiMatchResult {
  final int matchScore;
  final String reason;
  final List<String> topMatchFactors;
  final List<String> missingFactors;
  final bool isFromGemini; // true = Gemini, false = local fallback
  const GeminiMatchResult({
    required this.matchScore,
    this.reason = '',
    this.topMatchFactors = const [],
    this.missingFactors = const [],
    this.isFromGemini = true,
  });
}

final geminiMatchScoreProvider = StateNotifierProvider.family<
    _GeminiMatchScoreNotifier, AsyncValue<GeminiMatchResult?>, String>((ref, productId) {
  return _GeminiMatchScoreNotifier(ref, productId);
});

class _GeminiMatchScoreNotifier extends StateNotifier<AsyncValue<GeminiMatchResult?>> {
  final Ref _ref;
  final String _productId;
  _GeminiMatchScoreNotifier(this._ref, this._productId) : super(const AsyncValue.data(null));

  Future<void> fetchMatchScore({
    required ProductEntity product,
  }) async {
    if (state is AsyncLoading) return;
    if (state.valueOrNull != null) return;

    final userAsync = _ref.read(userProfileProvider);
    final user = userAsync.valueOrNull;
    if (user == null || !user.quizCompleted) return;

    state = const AsyncValue.loading();

    try {
      // 1. Check Firestore cache first (24h TTL)
      final cached = await _checkFirestoreCache(user.uid);
      if (cached != null) {
        state = AsyncValue.data(cached);
        return;
      }

      // 2. Call Gemini
      final gemini = _ref.read(geminiServiceProvider);
      final behaviorAsync = _ref.read(behaviorSignalsProvider);
      final behavior = behaviorAsync.valueOrNull ?? BehaviorSignals.empty;

      final profileJson = {
        'ecosystem': user.ecosystem,
        'budgetRange': user.budgetRange,
        'priorities': user.priorities,
        'currentDevices': user.currentDevices,
        'interestCategories': user.interestCategories,
        'primaryCategory': user.primaryCategory,
        'usageIntent': user.usageIntent,
        'profession': user.profession,
        'ageRange': user.ageRange,
        if (behavior.categoryViews.isNotEmpty)
          'recentCategoryViews': behavior.categoryViews,
        if (behavior.favorites.isNotEmpty)
          'favoritedProductCount': behavior.favorites.length,
      };

      // Build concise product JSON
      final topSpecs = <String, dynamic>{};
      var specCount = 0;
      for (final e in product.specs.entries) {
        if (specCount >= 15) break;
        final v = e.value?.toString() ?? '';
        if (v.isNotEmpty && v != 'null' && v != '?' && v != '{}') {
          topSpecs[e.key] = v;
          specCount++;
        }
      }

      final productJson = {
        'name': product.name,
        'brand': product.brand ?? '',
        'category': product.category,
        'techScore': product.techScore,
        'specs': topSpecs,
        if (product.pros.isNotEmpty) 'pros': product.pros.take(5).toList(),
        if (product.cons.isNotEmpty) 'cons': product.cons.take(5).toList(),
      };

      final langCode = user.language.isNotEmpty ? user.language : 'en';
      final prompt = 'You are a tech product recommendation expert. '
          'Analyze how well this product matches this specific user\'s needs and preferences.\n\n'
          'User profile:\n${jsonEncode(profileJson)}\n\n'
          'Product:\n${jsonEncode(productJson)}\n\n'
          'Score this product 0-100 for this user. Be realistic and differentiate:\n'
          '- 90-100: Perfect match (ecosystem, budget, priorities all align)\n'
          '- 70-89: Good match with minor trade-offs\n'
          '- 50-69: Decent but notable mismatches\n'
          '- 30-49: Poor match (wrong ecosystem, over budget, wrong priorities)\n'
          '- 0-29: Very poor match\n\n'
          'IMPORTANT for the "reason" field: Write the explanation addressing the user directly in second person. '
          'Do NOT use third person phrases like "the user", "user\'s", "their". '
          'Use "you", "your", "yours" instead. '
          'Example: "Your Apple ecosystem preference and high budget make this a perfect fit for you." '
          'NOT: "The user\'s Apple ecosystem preference makes this a good match."\n\n'
          'Return ONLY this JSON:\n'
          '{"matchScore": <int>, "reason": "<max 2 sentences, second person>", '
          '"topMatchFactors": ["<factor1>", "<factor2>", "<factor3>"], '
          '"missingFactors": ["<missing1>", "<missing2>"]}';

      final result = await gemini.jsonFreeTextQuery(prompt, language: langCode);
      final map = _decodeJsonMap(result);

      final score = _safeInt(map['matchScore'], 50).clamp(0, 100);
      final reason = (map['reason'] as String?) ?? '';
      final factors = (map['topMatchFactors'] as List?)
          ?.map((e) => e.toString()).toList() ?? [];
      final missing = (map['missingFactors'] as List?)
          ?.map((e) => e.toString()).toList() ?? [];

      final matchResult = GeminiMatchResult(
        matchScore: score,
        reason: reason,
        topMatchFactors: factors,
        missingFactors: missing,
        isFromGemini: true,
      );

      // Save to Firestore cache
      _saveToFirestoreCache(user.uid, matchResult);

      state = AsyncValue.data(matchResult);

      debugPrint('[GeminiMatch] Product: ${product.name}, Score: $score, Reason: $reason');
    } catch (e, st) {
      debugPrint('[GeminiMatch] Gemini failed, using local fallback: $e\n$st');
      // Fallback to local algorithm
      _fallbackToLocal(product);
    }
  }

  void _fallbackToLocal(ProductEntity product) {
    final userAsync = _ref.read(userProfileProvider);
    final user = userAsync.valueOrNull;
    if (user == null) {
      state = const AsyncValue.data(null);
      return;
    }
    final algo = _ref.read(profileAlgorithmServiceProvider);
    final behaviorAsync = _ref.read(behaviorSignalsProvider);
    final behavior = behaviorAsync.valueOrNull ?? BehaviorSignals.empty;
    final fs = algo.calculateTotalFitScore(user: user, product: product, behavior: behavior);
    if (fs > 0) {
      state = AsyncValue.data(GeminiMatchResult(
        matchScore: fs.toInt(),
        reason: '',
        isFromGemini: false,
      ));
    } else {
      state = const AsyncValue.data(null);
    }
  }

  Future<GeminiMatchResult?> _checkFirestoreCache(String uid) async {
    try {
      final doc = await FirebaseFirestore.instance
          .collection('users').doc(uid)
          .collection('matchScores').doc(_productId)
          .get();
      if (!doc.exists) return null;
      final data = doc.data()!;
      final ts = data['timestamp'] as Timestamp?;
      if (ts == null) return null;
      final age = DateTime.now().difference(ts.toDate());
      if (age.inHours >= 24) return null; // expired
      return GeminiMatchResult(
        matchScore: _safeInt(data['matchScore'], 0),
        reason: (data['reason'] as String?) ?? '',
        topMatchFactors: (data['topMatchFactors'] as List?)
            ?.map((e) => e.toString()).toList() ?? [],
        missingFactors: (data['missingFactors'] as List?)
            ?.map((e) => e.toString()).toList() ?? [],
        isFromGemini: true,
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> _saveToFirestoreCache(String uid, GeminiMatchResult result) async {
    try {
      await FirebaseFirestore.instance
          .collection('users').doc(uid)
          .collection('matchScores').doc(_productId)
          .set({
        'matchScore': result.matchScore,
        'reason': result.reason,
        'topMatchFactors': result.topMatchFactors,
        'missingFactors': result.missingFactors,
        'timestamp': FieldValue.serverTimestamp(),
      });
    } catch (_) {}
  }

  void reset() => state = const AsyncValue.data(null);
}

/// Add product to collection
Future<Result<void>> addToCollection(WidgetRef ref, String productId) async {
  final userAsync = ref.read(userProfileProvider);
  final user = userAsync.valueOrNull;
  if (user == null) {
    return const Failure(AuthException(message: 'You need to be signed in'));
  }
  try {
    await ref.read(firebaseDataSourceProvider).addToUserOwnedProducts(
          userId: user.uid,
          productId: productId,
        );
    return const Success(null);
  } catch (e) {
    return Failure(FirestoreException(message: 'Could not add to collection: $e'));
  }
}

/// Save a link analysis result to Firestore
Future<Result<void>> saveLinkAnalysis(
  WidgetRef ref, {
  required String url,
  required String productName,
  required double score,
  required String analysis,
  String? imageUrl,
  String? category,
}) async {
  final userAsync = ref.read(userProfileProvider);
  final user = userAsync.valueOrNull;
  if (user == null) {
    return const Failure(AuthException(message: 'You need to be signed in'));
  }
  try {
    await ref.read(firebaseDataSourceProvider).saveLinkAnalysis(
          userId: user.uid,
          url: url,
          productName: productName,
          score: score,
          analysis: analysis,
          imageUrl: imageUrl,
          category: category,
        );
    return const Success(null);
  } catch (e) {
    return Failure(
        FirestoreException(message: 'Could not save analysis: $e'));
  }
}
