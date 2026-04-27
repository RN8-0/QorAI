part of 'providers.dart';

// ════════════════════════════════════════════════════
// ─── GEMINI CACHE NOTIFIER MIXIN (DRY base) ───
// ════════════════════════════════════════════════════

/// Shared mixin for Gemini AI cache notifiers.
/// Provides: loading guard, error handling, reset, gemini/deepseek access, disk cache.
mixin GeminiCacheNotifierMixin<T> on StateNotifier<AsyncValue<T?>> {
  Ref get cacheRef;

  GeminiService get gemini => cacheRef.read(geminiServiceProvider);
  DeepSeekService get deepseek => cacheRef.read(deepSeekServiceProvider);
  CacheService get _diskCache => cacheRef.read(cacheServiceProvider);

  /// Resets cached state to null.
  void reset() => state = const AsyncValue.data(null);

  /// Try to load a raw JSON string from disk cache.
  Future<String?> diskGet(String key) async {
    try {
      final cached = await _diskCache.get<String>(key);
      return cached;
    } catch (_) {
      return null;
    }
  }

  /// Save a raw JSON string to disk cache (24h TTL).
  Future<void> diskSet(String key, String value) async {
    try {
      await _diskCache.set(key, value, duration: const Duration(hours: 24));
    } catch (_) {}
  }

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

const Duration _premiumAiRequestTimeout = Duration(seconds: 18);

bool _isTurkishLanguage(String languageCode) {
  return languageCode.trim().toLowerCase().startsWith('tr');
}

bool _looksEnglishPredictionText(String text) {
  final lower = text.trim().toLowerCase();
  if (lower.isEmpty) return false;
  if (RegExp(r'[çğıöşü]').hasMatch(lower)) return false;

  const englishSignals = [
    'buy',
    'wait',
    'price',
    'trend',
    'drop',
    'sale',
    'because',
    'window',
    'likely',
    'forecast',
    'product',
    'discount',
    'timing',
  ];
  const turkishSignals = [
    'fiyat',
    'bekle',
    'al',
    'kampanya',
    'indirim',
    'ürün',
    'yakın',
    'olas',
    'düş',
    'yatay',
    'şimdi',
  ];

  final englishScore = englishSignals.where(lower.contains).length;
  final turkishScore = turkishSignals.where(lower.contains).length;
  return englishScore >= 2 && turkishScore == 0;
}

String _localizedPredictionField(
  String value,
  String fallback, {
  required String languageCode,
}) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) return fallback;
  if (!_isTurkishLanguage(languageCode)) return trimmed;
  return _looksEnglishPredictionText(trimmed) ? fallback : trimmed;
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

class LocalizedProductKey {
  final String productId;
  final String languageCode;

  const LocalizedProductKey({
    required this.productId,
    required this.languageCode,
  });

  String get normalizedLanguageCode => languageCode.trim().toLowerCase();

  @override
  bool operator ==(Object other) {
    return other is LocalizedProductKey &&
        other.productId == productId &&
        other.normalizedLanguageCode == normalizedLanguageCode;
  }

  @override
  int get hashCode => Object.hash(productId, normalizedLanguageCode);
}

final aiReviewCacheProvider =
    StateNotifierProvider.family<
      _AIReviewNotifier,
      AsyncValue<AIReviewResult?>,
      LocalizedProductKey
    >((ref, key) {
      return _AIReviewNotifier(ref, key);
    });

class _AIReviewNotifier extends StateNotifier<AsyncValue<AIReviewResult?>> {
  final Ref _ref;
  final String _productId;
  final String _languageCode;
  static const int _cacheVersion = 2;
  _AIReviewNotifier(this._ref, LocalizedProductKey key)
    : _productId = key.productId,
      _languageCode = key.normalizedLanguageCode.isEmpty
          ? 'en'
          : key.normalizedLanguageCode,
      super(const AsyncValue.data(null));

  CacheService get _cache => _ref.read(cacheServiceProvider);

  String get _stepKey => '${_productId}_review';

  void _emitStep(String tr, String en) {
    if (!mounted) return;
    try {
      _ref.read(aiOperationStepProvider(_stepKey).notifier).state =
          _languageCode == 'tr' ? tr : en;
    } catch (_) {}
  }

  void _clearStep() {
    if (!mounted) return;
    try {
      _ref.read(aiOperationStepProvider(_stepKey).notifier).state = '';
    } catch (_) {}
  }

  Future<void> startAnalysis(String productName) async {
    if (state is AsyncLoading) return;
    if (state.valueOrNull != null) return;
    state = const AsyncValue.loading();

    // Check disk cache first (24h TTL)
    final cacheKey = 'ai_review_v${_cacheVersion}_${_languageCode}_$_productId';
    _emitStep('Önbellek kontrol ediliyor…', 'Checking cache…');
    try {
      final cached = await _cache.get<String>(cacheKey);
      if (cached != null && cached.isNotEmpty) {
        final parsed = _parseReviewResponse(cached);
        if (parsed != null && !parsed.failed) {
          _clearStep();
          state = AsyncValue.data(parsed);
          return;
        }
      }
    } catch (_) {}

    _emitStep('Kullanıcı yorumları analiz ediliyor…', 'Analyzing user reviews…');
    try {
      final gemini = _ref.read(geminiServiceProvider);
      final langName = _getLanguageName(_languageCode);
      final response = await gemini
          .jsonFreeTextQuery(
        'You are a senior technology product analyst with expertise in consumer electronics. '
        'Based on your comprehensive knowledge of publicly available user reviews, Reddit threads, '
        'professional review sites (GSMArena, RTINGS, NotebookCheck, Tom\'s Hardware, etc.), '
        'YouTube teardowns and long-term reviews, and tech community feedback for "$productName", '
        'provide a thorough and professional consumer sentiment analysis.\n\n'
        'Be specific, cite real-world performance observations, and use professional tech-review language. '
        'Avoid generic statements — reference actual experiences, benchmarks, or community-noted issues.\n\n'
        'IMPORTANT: ALL text must be written in $langName language. Return ONLY valid JSON.\n\n'
        'JSON fields (all text in $langName):\n'
        '"summary": A comprehensive 4-5 sentence professional overview of community sentiment. '
        'Cover overall reception, standout strengths, notable weaknesses, and long-term ownership insights.\n'
        '"satisfaction": Integer 0-100 representing aggregated user satisfaction across all sources.\n'
        '"praised": Array of 4-5 specific, concrete features/aspects users consistently praise. '
        'Be precise (e.g., "Exceptional battery life — 6+ days reported by users" not just "battery").\n'
        '"criticized": Array of 3-4 specific, real-world issues users consistently report. '
        'Be honest and precise (e.g., "Thermal throttling under sustained CPU load" not just "heating").',
        language: _languageCode,
        maxTokens: 1400,
      )
          .timeout(
            _premiumAiRequestTimeout,
            onTimeout: () => throw Exception('ai review timeout'),
          );

      // Save raw response to disk cache
      if (response.isNotEmpty) {
        _cache
            .set(cacheKey, response, duration: const Duration(hours: 24))
            .catchError((_) {});
      }

      _emitStep('Sonuçlar hazırlanıyor…', 'Finalizing results…');
      final parsed = _parseReviewResponse(response);
      _clearStep();
      state = AsyncValue.data(parsed ?? const AIReviewResult(failed: true));
    } catch (e) {
      _clearStep();
      state = const AsyncValue.data(AIReviewResult(failed: true));
    }
  }

  AIReviewResult? _parseReviewResponse(String response) {
    if (response.isEmpty) return null;
    try {
      final start = response.indexOf('{');
      final end = response.lastIndexOf('}');
      if (start == -1 || end == -1 || end <= start) return null;
      final data = Map<String, dynamic>.from(
        jsonDecode(response.substring(start, end + 1)) as Map,
      );
      return AIReviewResult(
        summary: data['summary']?.toString() ?? '',
        satisfaction: data['satisfaction'] is num
            ? (data['satisfaction'] as num).toInt().clamp(0, 100)
            : int.tryParse(data['satisfaction']?.toString() ?? '') ?? 0,
        praised: (data['praised'] is List)
            ? (data['praised'] as List).map((e) => e.toString()).toList()
            : [],
        criticized: (data['criticized'] is List)
            ? (data['criticized'] as List).map((e) => e.toString()).toList()
            : [],
      );
    } catch (_) {
      return null;
    }
  }

  void reset() => state = const AsyncValue.data(null);

  static String _getLanguageName(String code) {
    switch (code) {
      case 'tr':
        return 'Turkish';
      case 'de':
        return 'German';
      case 'fr':
        return 'French';
      case 'es':
        return 'Spanish';
      case 'pt':
        return 'Portuguese';
      case 'it':
        return 'Italian';
      case 'ja':
        return 'Japanese';
      case 'ko':
        return 'Korean';
      case 'zh':
        return 'Chinese';
      case 'ru':
        return 'Russian';
      case 'ar':
        return 'Arabic';
      case 'hi':
        return 'Hindi';
      default:
        return 'English';
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

final expertScoresCacheProvider =
    StateNotifierProvider.family<
      _ExpertScoresNotifier,
      AsyncValue<ExpertScoresResult?>,
      String
    >((ref, productId) {
      return _ExpertScoresNotifier(ref, productId);
    });

class _ExpertScoresNotifier
    extends StateNotifier<AsyncValue<ExpertScoresResult?>> {
  final Ref _ref;
  final String _productId;
  _ExpertScoresNotifier(this._ref, this._productId)
    : super(const AsyncValue.data(null));

  Future<void> fetchScores(String productName, String category) async {
    if (state is AsyncLoading) return;
    if (state.valueOrNull != null) return;
    state = const AsyncValue.loading();

    // Disk cache check
    final cacheKey = 'expert_scores_$_productId';
    final cache = _ref.read(cacheServiceProvider);
    try {
      final cached = await cache.get<String>(cacheKey);
      if (cached != null && cached.isNotEmpty) {
        final parsed = _parseScoresResponse(cached);
        if (parsed != null && !parsed.failed) {
          state = AsyncValue.data(parsed);
          return;
        }
      }
    } catch (_) {}

    try {
      final deepseek = _ref.read(deepSeekServiceProvider);
      final response = await deepseek.jsonFreeTextQuery(
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
        cache
            .set(cacheKey, response, duration: const Duration(hours: 24))
            .catchError((_) {});
        final parsed = _parseScoresResponse(response);
        state = AsyncValue.data(
          parsed ?? const ExpertScoresResult(failed: true),
        );
      } else {
        state = const AsyncValue.data(ExpertScoresResult(failed: true));
      }
    } catch (_) {
      state = const AsyncValue.data(ExpertScoresResult(failed: true));
    }
  }

  ExpertScoresResult? _parseScoresResponse(String response) {
    try {
      final cleaned = _cleanJsonString(response);
      final data = _decodeJsonMap(cleaned);
      if (data['expertScores'] is List) {
        final entries = (data['expertScores'] as List)
            .map((e) {
              if (e is! Map) return null;
              return ExpertScoreEntry(
                source: e['source']?.toString() ?? '',
                score: _safeInt(e['score']),
                maxScore: _safeInt(e['maxScore'], 100),
                verdict: e['verdict']?.toString() ?? '',
              );
            })
            .whereType<ExpertScoreEntry>()
            .where((e) => e.source.isNotEmpty && e.score > 0)
            .toList();
        return ExpertScoresResult(scores: entries);
      }
      return null;
    } catch (_) {
      return null;
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

  bool get hasUsableContent =>
      rawFallback == null &&
      (overallScore > 0 ||
          strengths.isNotEmpty ||
          weaknesses.isNotEmpty ||
          pros.isNotEmpty ||
          cons.isNotEmpty ||
          verdict.trim().isNotEmpty);
}

class AnalysisAttribute {
  final String name;
  final int score;
  final String detail;
  const AnalysisAttribute({
    required this.name,
    required this.score,
    required this.detail,
  });
}

class AlternativesResult {
  final List<AlternativeProduct> alternatives;
  final String? rawFallback;
  const AlternativesResult({this.alternatives = const [], this.rawFallback});

  bool get hasUsableContent =>
      rawFallback == null &&
      alternatives.any((alt) => alt.name.trim().isNotEmpty);
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

  bool get hasUsableContent =>
      rawFallback == null &&
      (whoShouldBuy.trim().isNotEmpty ||
          whoShouldAvoid.trim().isNotEmpty ||
          reasonsToBuy.isNotEmpty ||
          reasonsToSkip.isNotEmpty ||
          proTips.isNotEmpty ||
          valueRating > 0 ||
          ratingExplanation.trim().isNotEmpty);
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

  bool get hasUsableContent =>
      rawFallback == null &&
      (trendPercentage > 0 ||
          bestTimeToBuy.trim().isNotEmpty ||
          expectedDrop.trim().isNotEmpty ||
          reasoning.trim().isNotEmpty);
}

/// Caches AI deep analysis results per product ID so they survive navigation.
final deepAnalysisCacheProvider =
    StateNotifierProvider.family<
      _DeepAnalysisNotifier,
      AsyncValue<DeepAnalysisResult?>,
      LocalizedProductKey
    >((ref, key) {
      return _DeepAnalysisNotifier(ref, key);
    });

class _DeepAnalysisNotifier
    extends StateNotifier<AsyncValue<DeepAnalysisResult?>> {
  final Ref _ref;
  final String _productId;
  final String _languageCode;
  static const int _cacheVersion = 2;

  _DeepAnalysisNotifier(this._ref, LocalizedProductKey key)
    : _productId = key.productId,
      _languageCode = key.normalizedLanguageCode.isEmpty
          ? 'en'
          : key.normalizedLanguageCode,
      super(const AsyncValue.data(null));

  String get _stepKey => '${_productId}_deep';

  void _emitStep(String tr, String en) {
    if (!mounted) return;
    try {
      _ref.read(aiOperationStepProvider(_stepKey).notifier).state =
          _languageCode == 'tr' ? tr : en;
    } catch (_) {}
  }

  void _clearStep() {
    if (!mounted) return;
    try {
      _ref.read(aiOperationStepProvider(_stepKey).notifier).state = '';
    } catch (_) {}
  }

  Future<void> startAnalysis(
    String productName, {
    String category = '',
    String? brand,
    int? year,
  }) async {
    if (state is AsyncLoading) return;
    if (state.valueOrNull?.hasUsableContent == true) return;
    state = const AsyncValue.loading();

    // Disk cache check
    final cacheKey =
      'deep_analysis_v${_cacheVersion}_${_languageCode}_$_productId';
    final cache = _ref.read(cacheServiceProvider);
    _emitStep('Önbellek kontrol ediliyor…', 'Checking cache…');
    try {
      final cached = await cache.get<String>(cacheKey);
      if (cached != null && cached.isNotEmpty) {
        final parsed = _parseDeepAnalysis(cached);
        if (parsed.hasUsableContent) {
          _clearStep();
          state = AsyncValue.data(parsed);
          return;
        }
      }
    } catch (_) {}

    _emitStep('Teknik özellikler değerlendiriliyor…', 'Evaluating technical specs…');
    try {
      final gemini = _ref.read(geminiServiceProvider);
      final catInfo = category.isNotEmpty ? ' (Category: $category)' : '';
      final brandInfo = (brand != null && brand.isNotEmpty) ? ' by $brand' : '';
      final yearInfo = (year != null && year > 0)
          ? ', released around $year'
          : '';
      final result = await gemini
          .jsonFreeTextQuery(
        'You are a senior tech product analyst. The product name is exactly "$productName"$brandInfo$catInfo$yearInfo. '
        'Do NOT assume any typo in the product name — use it exactly as given.\n\n'
        'IMPORTANT: Return ONLY valid JSON. ALL text fields, list items, and the verdict MUST be fully written in ${_AIReviewNotifier._getLanguageName(_languageCode)}. '
        'If the selected language is Turkish, do not write explanatory text in English anywhere except official product or model names.\n\n'
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
        '- Pros/cons should be specific and informative (8-18 words each)\n'
        '- Verdict must include concrete technical or category-specific evidence\n'
        '- Be honest and specific, not generic praise',
        language: _languageCode,
        maxTokens: 1800,
      )
          .timeout(
            _premiumAiRequestTimeout,
            onTimeout: () => throw Exception('deep analysis timeout'),
          );
      // Save to disk cache
      if (result.isNotEmpty) {
        cache
            .set(cacheKey, result, duration: const Duration(hours: 24))
            .catchError((_) {});
      }
      _emitStep('Analiz tamamlandı!', 'Analysis complete!');
      await Future<void>.delayed(const Duration(milliseconds: 400));
      _clearStep();
      state = AsyncValue.data(_parseDeepAnalysis(result));
    } catch (e) {
      _clearStep();
      state = AsyncValue.data(
        DeepAnalysisResult(
          rawFallback: 'Unable to generate analysis at this time.',
        ),
      );
    }
  }

  DeepAnalysisResult _parseDeepAnalysis(String raw) {
    try {
      final json = _decodeJsonMap(raw);
      return DeepAnalysisResult(
        overallScore: _safeInt(json['overallScore']),
        strengths: (json['strengths'] as List? ?? [])
            .map(
              (s) => AnalysisAttribute(
                name: s['name']?.toString() ?? '',
                score: _safeInt(s['score']),
                detail: s['detail']?.toString() ?? '',
              ),
            )
            .toList(),
        weaknesses: (json['weaknesses'] as List? ?? [])
            .map(
              (w) => AnalysisAttribute(
                name: w['name']?.toString() ?? '',
                score: _safeInt(w['score']),
                detail: w['detail']?.toString() ?? '',
              ),
            )
            .toList(),
        pros: (json['pros'] as List? ?? []).map((p) => p.toString()).toList(),
        cons: (json['cons'] as List? ?? []).map((c) => c.toString()).toList(),
        verdict: json['verdict']?.toString() ?? '',
      );
    } catch (e, st) {
      debugPrint(
        '[DeepAnalysis] Parse error: $e\n$st\nRaw(200): ${raw.substring(0, raw.length < 200 ? raw.length : 200)}',
      );
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
final alternativesCacheProvider =
    StateNotifierProvider.family<
      _AlternativesCacheNotifier,
      AsyncValue<AlternativesResult?>,
      LocalizedProductKey
    >((ref, key) {
      return _AlternativesCacheNotifier(ref, key);
    });

class _AlternativesCacheNotifier
    extends StateNotifier<AsyncValue<AlternativesResult?>> {
  final Ref _ref;
  final String _productId;
  final String _languageCode;
  static const int _cacheVersion = 2;
  _AlternativesCacheNotifier(this._ref, LocalizedProductKey key)
    : _productId = key.productId,
      _languageCode = key.normalizedLanguageCode.isEmpty
          ? 'en'
          : key.normalizedLanguageCode,
      super(const AsyncValue.data(null));

  String get _stepKey => '${_productId}_alts';

  void _emitStep(String tr, String en) {
    if (!mounted) return;
    try {
      _ref.read(aiOperationStepProvider(_stepKey).notifier).state =
          _languageCode == 'tr' ? tr : en;
    } catch (_) {}
  }

  void _clearStep() {
    if (!mounted) return;
    try {
      _ref.read(aiOperationStepProvider(_stepKey).notifier).state = '';
    } catch (_) {}
  }

  Future<void> startQuery(String productName, String category) async {
    if (state is AsyncLoading) return;
    if (state.valueOrNull?.hasUsableContent == true) return;
    state = const AsyncValue.loading();

    // Disk cache check
    final cacheKey =
      'alternatives_v${_cacheVersion}_${_languageCode}_$_productId';
    final cache = _ref.read(cacheServiceProvider);
    _emitStep('Önbellek kontrol ediliyor…', 'Checking cache…');
    try {
      final cached = await cache.get<String>(cacheKey);
      if (cached != null && cached.isNotEmpty) {
        final parsed = _parseAlternatives(cached);
        if (parsed.hasUsableContent) {
          _clearStep();
          state = AsyncValue.data(parsed);
          return;
        }
      }
    } catch (_) {}

    _emitStep('Alternatif ürünler aranıyor…', 'Searching for alternatives…');
    try {
      final gemini = _ref.read(geminiServiceProvider);
      final result = await gemini
          .jsonFreeTextQuery(
        'IMPORTANT: Return ONLY valid JSON. ALL text fields, list items, and short explanations MUST be fully written in ${_AIReviewNotifier._getLanguageName(_languageCode)}. '
        'If the selected language is Turkish, do not use English in the explanation fields.\n\n'
        'Return a JSON object with this EXACT structure:\n'
        '{\n'
        '  "alternatives": [\n'
        '    {\n'
        '      "name": "<full product name>",\n'
        '      "advantage": "<one clear advantage over $productName>",\n'
        '      "tradeoff": "<one disadvantage or compromise>",\n'
        '      "priceComparison": "<cheaper/similar/pricier>",\n'
        '      "bestFor": "<target user profile, 1 sentence>",\n'
        '      "whyBetter": "<brief reason this might be preferred>"\n'
        '    }\n'
        '  ]\n'
        '}\n\n'
        'Provide exactly 5 real alternative products. '
        'Use complete model names and include concrete differences (performance, battery, camera, software, build quality, price band).',
        language: _languageCode,
        maxTokens: 900,
      )
          .timeout(
            _premiumAiRequestTimeout,
            onTimeout: () => throw Exception('alternatives timeout'),
          );
      if (result.isNotEmpty) {
        cache
            .set(cacheKey, result, duration: const Duration(hours: 24))
            .catchError((_) {});
      }
      _clearStep();
      state = AsyncValue.data(_parseAlternatives(result));
    } catch (e) {
      _clearStep();
      state = AsyncValue.data(
        AlternativesResult(
          rawFallback: 'Unable to find alternatives at this time.',
        ),
      );
    }
  }

  AlternativesResult _parseAlternatives(String raw) {
    try {
      final json = _decodeJsonMap(raw);
      final alts = (json['alternatives'] as List? ?? [])
          .map(
            (a) => AlternativeProduct(
              name: a['name']?.toString() ?? '',
              advantage: a['advantage']?.toString() ?? '',
              tradeoff: a['tradeoff']?.toString() ?? '',
              priceComparison: a['priceComparison']?.toString() ?? '',
              bestFor: a['bestFor']?.toString() ?? '',
              whyBetter: a['whyBetter']?.toString() ?? '',
            ),
          )
          .toList();
      return AlternativesResult(alternatives: alts);
    } catch (e, st) {
      debugPrint(
        '[Alternatives] Parse error: $e\n$st\nRaw(200): ${raw.substring(0, raw.length < 200 ? raw.length : 200)}',
      );
      return AlternativesResult(rawFallback: raw);
    }
  }

  void reset() => state = const AsyncValue.data(null);
}

/// AI Advisor cache — survives tab switches
final advisorCacheProvider =
    StateNotifierProvider.family<
      _AdvisorCacheNotifier,
      AsyncValue<AdvisorResult?>,
      LocalizedProductKey
    >((ref, key) {
      return _AdvisorCacheNotifier(ref, key);
    });

class _AdvisorCacheNotifier extends StateNotifier<AsyncValue<AdvisorResult?>> {
  final Ref _ref;
  final String _productId;
  final String _languageCode;
  static const int _cacheVersion = 2;
  _AdvisorCacheNotifier(this._ref, LocalizedProductKey key)
    : _productId = key.productId,
      _languageCode = key.normalizedLanguageCode.isEmpty
          ? 'en'
          : key.normalizedLanguageCode,
      super(const AsyncValue.data(null));

  String get _stepKey => '${_productId}_advisor';

  void _emitStep(String tr, String en) {
    if (!mounted) return;
    try {
      _ref.read(aiOperationStepProvider(_stepKey).notifier).state =
          _languageCode == 'tr' ? tr : en;
    } catch (_) {}
  }

  void _clearStep() {
    if (!mounted) return;
    try {
      _ref.read(aiOperationStepProvider(_stepKey).notifier).state = '';
    } catch (_) {}
  }

  Future<void> startQuery(
    String productName,
    String category,
    String price, {
    String productContext = '',
  }) async {
    if (state is AsyncLoading) return;
    if (state.valueOrNull?.hasUsableContent == true) return;
    state = const AsyncValue.loading();

    // Disk cache check
    final cacheKey = 'advisor_v${_cacheVersion}_${_languageCode}_$_productId';
    final cache = _ref.read(cacheServiceProvider);
    _emitStep('Önbellek kontrol ediliyor…', 'Checking cache…');
    try {
      final cached = await cache.get<String>(cacheKey);
      if (cached != null && cached.isNotEmpty) {
        final parsed = _parseAdvisor(cached);
        if (parsed.hasUsableContent) {
          _clearStep();
          state = AsyncValue.data(parsed);
          return;
        }
      }
    } catch (_) {}

    _emitStep('Satın alma tavsiyeleri hazırlanıyor…', 'Preparing buying advice…');
    try {
      final gemini = _ref.read(geminiServiceProvider);
      final result = await gemini
          .jsonFreeTextQuery(
        'IMPORTANT: Return ONLY valid JSON. ALL text fields and list items MUST be fully written in ${_AIReviewNotifier._getLanguageName(_languageCode)}. '
        'If the selected language is Turkish, do not use English in the advice text.\n\n'
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
        'Be specific and honest. Reasons should be detailed (12-24 words each) with concrete user impact.',
        language: _languageCode,
        maxTokens: 1100,
      )
          .timeout(
            _premiumAiRequestTimeout,
            onTimeout: () => throw Exception('advisor timeout'),
          );
      if (result.isNotEmpty) {
        cache
            .set(cacheKey, result, duration: const Duration(hours: 24))
            .catchError((_) {});
      }
      _clearStep();
      state = AsyncValue.data(_parseAdvisor(result));
    } catch (e) {
      _clearStep();
      state = AsyncValue.data(
        AdvisorResult(rawFallback: 'Unable to generate advice.'),
      );
    }
  }

  AdvisorResult _parseAdvisor(String raw) {
    try {
      final json = _decodeJsonMap(raw);
      return AdvisorResult(
        whoShouldBuy: json['whoShouldBuy']?.toString() ?? '',
        whoShouldAvoid: json['whoShouldAvoid']?.toString() ?? '',
        reasonsToBuy: (json['reasonsToBuy'] as List? ?? [])
            .map((r) => r.toString())
            .toList(),
        reasonsToSkip: (json['reasonsToSkip'] as List? ?? [])
            .map((r) => r.toString())
            .toList(),
        proTips: (json['proTips'] as List? ?? [])
            .map((t) => t.toString())
            .toList(),
        valueRating: _safeDouble(json['valueRating']),
        ratingExplanation: json['ratingExplanation']?.toString() ?? '',
      );
    } catch (e, st) {
      debugPrint(
        '[Advisor] Parse error: $e\n$st\nRaw(200): ${raw.substring(0, raw.length < 200 ? raw.length : 200)}',
      );
      return AdvisorResult(rawFallback: raw);
    }
  }

  void reset() => state = const AsyncValue.data(null);
}

/// Price Prediction cache — survives tab switches
final predictionCacheProvider =
    StateNotifierProvider.family<
      _PredictionCacheNotifier,
      AsyncValue<PredictionResult?>,
      LocalizedProductKey
    >((ref, key) {
      return _PredictionCacheNotifier(ref, key);
    });

class _PredictionCacheNotifier
    extends StateNotifier<AsyncValue<PredictionResult?>> {
  final Ref _ref;
  final String _productId;
  final String _languageCode;
  static const int _predictionCacheVersion = 4;
  _PredictionCacheNotifier(this._ref, LocalizedProductKey key)
    : _productId = key.productId,
      _languageCode = key.normalizedLanguageCode.isEmpty
          ? 'en'
          : key.normalizedLanguageCode,
      super(const AsyncValue.data(null));

  String get _stepKey => '${_productId}_prediction';

  void _emitStep(String tr, String en) {
    if (!mounted) return;
    try {
      _ref.read(aiOperationStepProvider(_stepKey).notifier).state =
          _languageCode == 'tr' ? tr : en;
    } catch (_) {}
  }

  void _clearStep() {
    if (!mounted) return;
    try {
      _ref.read(aiOperationStepProvider(_stepKey).notifier).state = '';
    } catch (_) {}
  }

  Future<void> startQuery(
    String productName,
    String category,
    String price, {
    String productContext = '',
  }) async {
    if (state is AsyncLoading) return;
    if (state.valueOrNull?.hasUsableContent == true) return;
    state = const AsyncValue.loading();
    final heuristic = _buildHeuristicPrediction(
      productName: productName,
      category: category,
      price: price,
      language: _languageCode,
      productContext: productContext,
    );

    // Disk cache check
    final normalizedLanguage = _languageCode;
    final cacheKey =
        'prediction_v${_predictionCacheVersion}_${normalizedLanguage}_$_productId';
    final cache = _ref.read(cacheServiceProvider);
    _emitStep('Fiyat verileri toplanıyor…', 'Collecting price data…');
    try {
      final cached = await cache.get<String>(cacheKey);
      if (cached != null && cached.isNotEmpty) {
        final parsed = _mergeWithHeuristic(_parsePrediction(cached), heuristic);
        if (parsed.hasUsableContent) {
          _clearStep();
          state = AsyncValue.data(parsed);
          return;
        }
      }
    } catch (_) {}

    _emitStep('Fiyat trendi analiz ediliyor…', 'Analyzing price trends…');
    try {
      final gemini = _ref.read(geminiServiceProvider);
      final cat = category.isEmpty ? 'tech product' : category;
      final result = await gemini
          .jsonFreeTextQuery(
        'Current year: ${DateTime.now().year}.\n'
        'IMPORTANT: Return ONLY valid JSON. ALL explanatory text fields MUST be fully written in ${_AIReviewNotifier._getLanguageName(_languageCode)}. '
        'If the selected language is Turkish, do not write English analysis text anywhere except official product/model names. '
        'The buyOrWait field must still be exactly either "buy" or "wait".\n\n'
        'Return a JSON object with this EXACT structure:\n'
        '{\n'
        '  "trend": "<up/down/stable>",\n'
        '  "trendPercentage": <number 0-100>,\n'
        '  "bestTimeToBuy": "<when to buy, 1-2 sentences>",\n'
        '  "expectedDrop": "<expected price change description>",\n'
        '  "buyOrWait": "<buy/wait>",\n'
        '  "reasoning": "<4-6 sentence explanation of the prediction with product-specific triggers>"\n'
        '}\n\n'
        'Analyze this specific product:\n'
        '- Product name: $productName\n'
        '- Category: $cat\n'
        '- Current observed price: ${price.isEmpty ? 'unknown' : price}\n'
        '${productContext.isEmpty ? '' : '- Product context: $productContext\n'}\n'
        'Base analysis on this specific product\'s category, brand, price tier, likely release timing, and notable specs. '
        'Use release timing and category replacement cycles to decide whether the product is more likely to drop soon or stay stable. '
        'If the product appears premium, mid-range, budget, new, or aging, reflect that difference in the answer. '
        'Different products must not receive the same percentage, buy/wait decision, or reasoning by default. '
        'Avoid stock phrases and explain the product-specific trigger behind the prediction. '
        'trendPercentage is the expected price change amount in percent.',
        language: _languageCode,
        maxTokens: 1200,
      )
          .timeout(
            _premiumAiRequestTimeout,
            onTimeout: () => throw Exception('prediction timeout'),
          );
      if (result.isNotEmpty) {
        cache
            .set(cacheKey, result, duration: const Duration(hours: 24))
            .catchError((_) {});
      }
      _clearStep();
      state = AsyncValue.data(
        _mergeWithHeuristic(_parsePrediction(result), heuristic),
      );
    } catch (e) {
      _clearStep();
      state = AsyncValue.data(heuristic);
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
      debugPrint(
        '[Prediction] Parse error: $e\n$st\nRaw(200): ${raw.substring(0, raw.length < 200 ? raw.length : 200)}',
      );
      return PredictionResult(rawFallback: raw);
    }
  }

  PredictionResult _mergeWithHeuristic(
    PredictionResult parsed,
    PredictionResult heuristic,
  ) {
    if (parsed.rawFallback != null) {
      return heuristic;
    }
    final reasoning = parsed.reasoning.trim();
    return PredictionResult(
      trend: _normalizeTrend(parsed.trend) ?? heuristic.trend,
      trendPercentage: parsed.trendPercentage > 0
          ? parsed.trendPercentage
          : heuristic.trendPercentage,
      bestTimeToBuy: _localizedPredictionField(
        parsed.bestTimeToBuy,
        heuristic.bestTimeToBuy,
        languageCode: _languageCode,
      ),
      expectedDrop: _localizedPredictionField(
        parsed.expectedDrop,
        heuristic.expectedDrop,
        languageCode: _languageCode,
      ),
      buyOrWait: _normalizeBuyOrWait(parsed.buyOrWait) ?? heuristic.buyOrWait,
      reasoning:
          !_looksGenericPrediction(reasoning) &&
              !_looksEnglishPredictionText(reasoning)
          ? reasoning
          : heuristic.reasoning,
    );
  }

  PredictionResult _buildHeuristicPrediction({
    required String productName,
    required String category,
    required String price,
    required String language,
    required String productContext,
  }) {
    final isTr = language.toLowerCase().startsWith('tr');
    final normalizedCategory = category.trim().toLowerCase();
    final normalizedName = productName.toLowerCase();
    final normalizedContext = productContext.toLowerCase();
    final releaseYear = _extractInt(
      productContext,
      RegExp(r'release year:\s*(20\d{2})'),
    );
    final techScore = _extractDouble(
      productContext,
      RegExp(r'tech score:\s*([0-9]+(?:\.[0-9]+)?)'),
    );
    final priceValue = _extractPriceValue(price);
    final currentYear = DateTime.now().year;
    final age = releaseYear == null ? null : currentYear - releaseYear;
    final fastCycle = {
      'smartphones',
      'laptops',
      'tablets',
      'gpus',
      'monitors',
      'smartwatches',
      'tvs',
      'cameras',
      'consoles',
    }.contains(normalizedCategory);
    final slowerCycle = {
      'headphones',
      'speakers',
      'keyboards',
      'mice',
      'webcams',
      'routers',
      'powerbanks',
    }.contains(normalizedCategory);
    final premium =
        (techScore != null && techScore >= 88) ||
        priceValue >= 1200 ||
        priceValue >= 50000 ||
        [
          'ultra',
          'pro',
          'max',
          'flagship',
          'rtx',
          'studio',
        ].any(normalizedName.contains);

    var trend = 'stable';
    var trendPercentage = 5;
    var buyOrWait = 'buy';

    if (age != null && age <= 0) {
      trend = 'down';
      trendPercentage = fastCycle ? 12 : 8;
      buyOrWait = premium || fastCycle ? 'wait' : 'buy';
    } else if (age == 1) {
      trend = 'down';
      trendPercentage = fastCycle ? 8 : 6;
      buyOrWait = premium ? 'wait' : 'buy';
    } else if (age != null && age >= 3) {
      trend = slowerCycle ? 'stable' : 'down';
      trendPercentage = slowerCycle ? 3 : 5;
      buyOrWait = 'buy';
    } else if (premium) {
      trend = 'down';
      trendPercentage = fastCycle ? 9 : 6;
      buyOrWait = 'wait';
    } else if (slowerCycle) {
      trend = 'stable';
      trendPercentage = 3;
      buyOrWait = 'buy';
    }

    final bestTimeToBuy = isTr
        ? switch (buyOrWait) {
            'wait' =>
              'Bir sonraki kampanya ya da yeni nesil duyurusu öncesi 1-3 ay izlemek daha mantıklı görünüyor.',
            _ =>
              'Fiyat hareketi sınırlı olduğu için uygun bir teklif yakalandığında hemen alınabilir.',
          }
        : switch (buyOrWait) {
            'wait' =>
              'Waiting for the next sale window or the next product-cycle announcement over the next 1-3 months looks smarter.',
            _ =>
              'Price movement looks limited, so buying as soon as you find a strong deal makes sense.',
          };

    final expectedDrop = isTr
        ? trend == 'down'
              ? 'Kısa vadede yaklaşık %$trendPercentage civarı bir geri çekilme potansiyeli var.'
              : 'Fiyatın yakın dönemde yatay kalması daha olası.'
        : trend == 'down'
        ? 'There is roughly a $trendPercentage% downside window in the near term.'
        : 'Pricing is more likely to stay flat in the near term.';

    final lifecycleText = age == null
        ? (isTr
              ? 'kategori döngüsü ve teknik seviye'
              : 'category cycle and technical tier')
        : age <= 1
        ? (isTr ? 'yeni ürün zamanı' : 'its recent release timing')
        : (isTr
              ? 'olgunlaşmış ürün dönemi'
              : 'its more mature lifecycle stage');
    final reasoning = isTr
        ? '${productName.trim()} için tahmin $lifecycleText, fiyat seviyesi ve ${normalizedContext.contains('brand:') ? 'marka konumu' : 'kategori hızı'} üzerinden kuruldu. ${buyOrWait == 'wait' ? 'Yeni ve premium yapıda olduğu için indirim marjı daha yüksek.' : 'Fiyat hareketi sınırlı olduğu için büyük bir düşüş beklentisi zayıf.'}'
        : 'The forecast for ${productName.trim()} is driven by $lifecycleText, its current price tier, and category pace. ${buyOrWait == 'wait' ? 'Because it looks newer or more premium, the discount window is more likely to improve soon.' : 'Because the pricing already looks settled, a major drop is less likely.'}';

    return PredictionResult(
      trend: trend,
      trendPercentage: trendPercentage,
      bestTimeToBuy: bestTimeToBuy,
      expectedDrop: expectedDrop,
      buyOrWait: buyOrWait,
      reasoning: reasoning,
    );
  }

  String? _normalizeTrend(String raw) {
    final value = raw.trim().toLowerCase();
    if (value.contains('düş') || value.contains('dus')) return 'down';
    if (value.contains('down') || value.contains('drop')) return 'down';
    if (value.contains('yüksel') || value.contains('yuksel')) return 'up';
    if (value.contains('up') || value.contains('rise')) return 'up';
    if (value.contains('sabit') || value.contains('yatay')) return 'stable';
    if (value.contains('stable') || value.contains('flat')) return 'stable';
    return null;
  }

  String? _normalizeBuyOrWait(String raw) {
    final value = raw.trim().toLowerCase();
    if (value.isEmpty) return null;
    if (value.contains('wait') || value.contains('bekle')) return 'wait';
    if (value.contains('buy') || value.contains('al')) return 'buy';
    return null;
  }

  bool _looksGenericPrediction(String text) {
    final lower = text.trim().toLowerCase();
    if (lower.isEmpty || lower.length < 24) return true;
    return lower.contains('unable to predict') ||
        lower.contains('prices vary') ||
        lower.contains('depends on the market') ||
        lower.contains('depends on market') ||
        lower.contains('belirsiz') ||
        lower.contains('değişken olabilir');
  }

  int? _extractInt(String source, RegExp regex) {
    final match = regex.firstMatch(source);
    return match == null ? null : int.tryParse(match.group(1)!);
  }

  double? _extractDouble(String source, RegExp regex) {
    final match = regex.firstMatch(source);
    return match == null ? null : double.tryParse(match.group(1)!);
  }

  double _extractPriceValue(String rawPrice) {
    final cleaned = rawPrice.replaceAll(RegExp(r'[^0-9,\.]'), '');
    if (cleaned.isEmpty) return 0;
    final normalized = cleaned.contains(',') && cleaned.contains('.')
        ? cleaned.replaceAll(',', '')
        : cleaned.replaceAll(',', '.');
    return double.tryParse(normalized) ?? 0;
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

/// Per-product AI step message provider.
/// Holds a short localized description of the current AI processing step
/// (e.g. "Profil verisi yükleniyor…"). Empty string = no active step.
/// Keyed by product ID so multiple detail pages don't interfere.
final aiMatchStepProvider = StateProvider.family<String, String>(
  (ref, productId) => '',
);

/// Generic AI operation step message provider.
/// Key format: "${productId}_${operation}" (e.g. "abc123_review", "abc123_deep")
/// Empty string = no active step.
final aiOperationStepProvider = StateProvider.family<String, String>(
  (ref, operationKey) => '',
);

String _encodeJsonString(Map<String, dynamic> payload) => jsonEncode(payload);

// ─── LOCAL FALLBACK ISOLATE HELPERS ─────────────────────────────────────────
// These top-level functions run in a background isolate via compute() so the
// main thread is never blocked by match-score / highlight computation.

class _FallbackIsolateParams {
  final UserEntity user;
  final ProductEntity product;
  final BehaviorSignals behavior;
  final String langCode;
  const _FallbackIsolateParams({
    required this.user,
    required this.product,
    required this.behavior,
    required this.langCode,
  });
}

class _FallbackIsolateResult {
  final int resolvedScore;
  final String reason;
  final List<String> topMatchFactors;
  final List<String> missingFactors;
  const _FallbackIsolateResult({
    required this.resolvedScore,
    required this.reason,
    required this.topMatchFactors,
    required this.missingFactors,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Isolate data-transfer types for _doFetchMatchScore (PREMIUM path)
// ────────────────────────────────────────────────────────────────────────────

class _HighlightsIsolateParams {
  final UserEntity user;
  final ProductEntity product;
  final Map<String, double> weightVector;
  final String langCode;
  const _HighlightsIsolateParams({
    required this.user,
    required this.product,
    required this.weightVector,
    required this.langCode,
  });
}

class _HighlightsIsolateResult {
  final List<String> focusAreas;
  final List<String> highlights;
  final List<String> tradeOffs;
  final String fallbackReason;
  const _HighlightsIsolateResult({
    required this.focusAreas,
    required this.highlights,
    required this.tradeOffs,
    required this.fallbackReason,
  });
}

/// Executed in a background isolate — builds focusAreas, productHighlights,
/// tradeOffs, and a local fallback reason without touching the main thread.
_HighlightsIsolateResult _computeHighlightsInIsolate(
    _HighlightsIsolateParams p) {
  // 1. Build focus areas
  final scores = <String, double>{};
  void addScore(String rawKey, double score) {
    final key = _normalizeFocusKeyFn(rawKey);
    if (key == null) return;
    final current = scores[key] ?? 0;
    if (score > current) scores[key] = score;
  }
  for (var i = 0; i < p.user.priorities.length; i++) {
    addScore(p.user.priorities[i], 1.0 - (i * 0.08));
  }
  for (final entry in p.weightVector.entries) {
    addScore(entry.key, entry.value);
  }
  final ranked = scores.entries.toList()
    ..sort((a, b) => b.value.compareTo(a.value));
  final nonEcosystem = ranked.where((e) => e.key != 'ecosystem').toList();
  final ecosystem = ranked.where((e) => e.key == 'ecosystem').toList();
  final ordered = <MapEntry<String, double>>[
    ...nonEcosystem,
    if (ecosystem.isNotEmpty &&
        (ecosystem.first.value >= 0.8 || nonEcosystem.length < 2))
      ecosystem.first,
  ];
  final focusAreas =
      ordered.take(4).map((e) => _focusLabelFn(e.key)).toList();

  // 2. Build product highlights
  final focusKeywords = focusAreas.map(_focusKeywordsForLabelFn).toList();
  final candidates = <({String text, double score})>[];

  double calcFocusScore(String source) {
    final lower = source.toLowerCase();
    var sc = 0.0;
    for (final keywords in focusKeywords) {
      if (keywords.any(lower.contains)) sc += 1.6;
    }
    return sc;
  }

  String localizeText(String text) {
    if (p.langCode != 'tr') return text;
    return text
        .replaceAll(
          RegExp(r'\bTech score\b', caseSensitive: false),
          'Teknik puan',
        )
        .replaceAll(RegExp(r'\bSupport\b', caseSensitive: false), 'Desteği')
        .replaceAll(RegExp(r':\s*Yes\b', caseSensitive: false), ': Var')
        .replaceAll(RegExp(r':\s*No\b', caseSensitive: false), ': Yok')
        .replaceAll(RegExp(r'\binch\b', caseSensitive: false), 'inç');
  }

  for (final pro in p.product.pros.take(5)) {
    candidates.add((
      text: localizeText(pro.trim()),
      score: 2.4 + calcFocusScore(pro),
    ));
  }
  for (final entry in p.product.keySpecs.entries) {
    final value = entry.value.toString().trim();
    if (value.isEmpty) continue;
    final text = localizeText('${entry.key}: $value');
    candidates.add((text: text, score: 1.4 + calcFocusScore(text)));
  }
  if (p.product.techScore >= 90) {
    candidates.add((
      text: localizeText(
        'Tech score ${p.product.techScore.toStringAsFixed(0)}/100',
      ),
      score: focusAreas.any((a) => a == 'Performance' || a == 'Gaming')
          ? 3.0
          : 1.5,
    ));
  }
  candidates.sort((a, b) => b.score.compareTo(a.score));
  final highlights = <String>[];
  for (final entry in candidates) {
    final normalized = entry.text.toLowerCase();
    if (highlights.any(
      (t) =>
          normalized.contains(t.toLowerCase()) ||
          t.toLowerCase().contains(normalized),
    )) continue;
    highlights.add(entry.text);
    if (highlights.length >= 6) break;
  }

  // 3. Build trade-offs
  final tradeOffs = <String>[];
  for (final con in p.product.cons.take(3)) {
    final text = con.trim();
    if (text.isNotEmpty) tradeOffs.add(text);
  }
  final lowerFocus = focusAreas.map((a) => a.toLowerCase()).toList();
  if (lowerFocus.contains('portability')) {
    final weightValue = p.product.keySpecs.entries
        .firstWhere(
          (e) => e.key.toLowerCase().contains('weight'),
          orElse: () => const MapEntry('', ''),
        )
        .value;
    if (weightValue.isNotEmpty) {
      tradeOffs.add(
        'Portability depends on its ${weightValue.toLowerCase()} weight.',
      );
    }
  }
  final finalTradeOffs = tradeOffs.take(3).toList();

  // 4. Build local fallback reason
  final isTr = p.langCode == 'tr';
  final first = highlights.isNotEmpty ? highlights.first : '';
  final second = highlights.length > 1 ? highlights[1] : '';
  final topIssue = finalTradeOffs.isNotEmpty ? finalTradeOffs.first : '';
  String fallbackReason;
  if (isTr) {
    if (first.isNotEmpty && second.isNotEmpty) {
      final base = '$first ve $second ile öne çıkıyor.';
      fallbackReason = topIssue.isNotEmpty
          ? '$base $topIssue ana taviz noktası olarak dikkat çekiyor.'
          : base;
    } else if (first.isNotEmpty && topIssue.isNotEmpty) {
      fallbackReason =
          '$first ile öne çıkıyor. $topIssue ana sınırı olarak görülmeli.';
    } else if (first.isNotEmpty) {
      fallbackReason = '$first ile öne çıkıyor.';
    } else if (topIssue.isNotEmpty) {
      fallbackReason = '$topIssue bu üründe dikkat edilmesi gereken ana nokta.';
    } else {
      fallbackReason =
          'Teknik seviye, genel denge ve kategori içindeki konumuyla dikkat çeken bir profil sunuyor.';
    }
  } else {
    if (first.isNotEmpty && second.isNotEmpty) {
      final base = '$first and $second stand out most.';
      fallbackReason = topIssue.isNotEmpty
          ? '$base $topIssue is the main trade-off to keep in mind.'
          : base;
    } else if (first.isNotEmpty && topIssue.isNotEmpty) {
      fallbackReason =
          '$first is the main standout. $topIssue is the clearest limitation.';
    } else if (first.isNotEmpty) {
      fallbackReason = '$first is the clearest standout.';
    } else if (topIssue.isNotEmpty) {
      fallbackReason = '$topIssue is the main limitation to keep in mind.';
    } else {
      fallbackReason =
          'It stands out through its overall technical balance and category position.';
    }
  }

  return _HighlightsIsolateResult(
    focusAreas: focusAreas,
    highlights: highlights,
    tradeOffs: finalTradeOffs,
    fallbackReason: fallbackReason,
  );
}

// ────────────────────────────────────────────────────────────────────────────

String? _normalizeFocusKeyFn(String raw) {
  final key = raw.trim().toLowerCase();
  switch (key) {
    case 'price':
    case 'price_sensitivity':
    case 'value':
      return 'price';
    case 'quality':
    case 'build_quality':
    case 'durability':
      return 'build_quality';
    case 'design':
      return 'design';
    case 'performance':
      return 'performance';
    case 'battery':
      return 'battery';
    case 'camera':
      return 'camera';
    case 'portability':
      return 'portability';
    case 'gaming':
      return 'gaming';
    case 'creator':
    case 'content_consumption':
    case 'display':
      return 'display';
    case 'productivity':
      return 'productivity';
    case 'audio_quality':
    case 'audio':
      return 'audio';
    case 'ecosystem':
    case 'ecosystem_lock':
      return 'ecosystem';
    default:
      return null;
  }
}

String _focusLabelFn(String key) {
  switch (key) {
    case 'price':
      return 'Value';
    case 'build_quality':
      return 'Build Quality';
    case 'design':
      return 'Design';
    case 'performance':
      return 'Performance';
    case 'battery':
      return 'Battery';
    case 'camera':
      return 'Camera';
    case 'portability':
      return 'Portability';
    case 'gaming':
      return 'Gaming';
    case 'display':
      return 'Display';
    case 'productivity':
      return 'Productivity';
    case 'audio':
      return 'Audio';
    case 'ecosystem':
      return 'Ecosystem';
    default:
      return key;
  }
}

List<String> _focusKeywordsForLabelFn(String label) {
  switch (label) {
    case 'Value':
      return ['price', 'value', 'affordable', 'budget'];
    case 'Build Quality':
      return ['build', 'quality', 'premium', 'durable', 'material'];
    case 'Design':
      return ['design', 'thin', 'slim', 'stylish'];
    case 'Performance':
      return ['performance', 'processor', 'cpu', 'gpu', 'ram', 'chip'];
    case 'Battery':
      return ['battery', 'mah', 'charging', 'runtime'];
    case 'Camera':
      return ['camera', 'photo', 'video', 'sensor', 'zoom', 'mp'];
    case 'Portability':
      return ['portable', 'light', 'weight', 'thin', 'compact'];
    case 'Gaming':
      return ['gaming', 'gpu', 'rtx', 'refresh', 'fps', 'cooling'];
    case 'Display':
      return ['display', 'screen', 'brightness', 'resolution', 'oled', 'hdr'];
    case 'Productivity':
      return [
        'productivity',
        'multitasking',
        'ram',
        'storage',
        'keyboard',
        'cpu',
      ];
    case 'Audio':
      return ['audio', 'speaker', 'dolby', 'anc', 'sound'];
    case 'Ecosystem':
      return ['ecosystem', 'apple', 'android', 'windows', 'google'];
    default:
      return const [];
  }
}

/// Executed in a background isolate — computes local fit score, highlights,
/// trade-offs, and a short reason string without touching the main thread.
_FallbackIsolateResult _computeFallbackInIsolate(_FallbackIsolateParams p) {
  // 1. Fit score via pure algorithm
  final algo = ProfileAlgorithmService();
  final fs = algo.calculateTotalFitScore(
    user: p.user,
    product: p.product,
    behavior: p.behavior,
  );

  // 2. Build focus areas (mirrors _GeminiMatchScoreNotifier._buildFocusAreas)
  final scores = <String, double>{};
  void addScore(String rawKey, double score) {
    final key = _normalizeFocusKeyFn(rawKey);
    if (key == null) return;
    final current = scores[key] ?? 0;
    if (score > current) scores[key] = score;
  }
  for (var i = 0; i < p.user.priorities.length; i++) {
    addScore(p.user.priorities[i], 1.0 - (i * 0.08));
  }
  final ranked = scores.entries.toList()
    ..sort((a, b) => b.value.compareTo(a.value));
  final nonEcosystem = ranked.where((e) => e.key != 'ecosystem').toList();
  final ecosystem = ranked.where((e) => e.key == 'ecosystem').toList();
  final ordered = <MapEntry<String, double>>[
    ...nonEcosystem,
    if (ecosystem.isNotEmpty &&
        (ecosystem.first.value >= 0.8 || nonEcosystem.length < 2))
      ecosystem.first,
  ];
  final focusAreas = ordered.take(4).map((e) => _focusLabelFn(e.key)).toList();

  // 3. Build product highlights (mirrors _buildProductHighlights + _localizeHighlightText)
  final focusKeywords = focusAreas.map(_focusKeywordsForLabelFn).toList();
  final candidates = <({String text, double score})>[];

  double calcFocusScore(String source) {
    final lower = source.toLowerCase();
    var sc = 0.0;
    for (final keywords in focusKeywords) {
      if (keywords.any(lower.contains)) sc += 1.6;
    }
    return sc;
  }

  String localizeText(String text) {
    if (p.langCode != 'tr') return text;
    return text
        .replaceAll(
          RegExp(r'\bTech score\b', caseSensitive: false),
          'Teknik puan',
        )
        .replaceAll(
          RegExp(r'\bSupport\b', caseSensitive: false),
          'Desteği',
        )
        .replaceAll(RegExp(r':\s*Yes\b', caseSensitive: false), ': Var')
        .replaceAll(RegExp(r':\s*No\b', caseSensitive: false), ': Yok')
        .replaceAll(RegExp(r'\binch\b', caseSensitive: false), 'inç');
  }

  for (final pro in p.product.pros.take(5)) {
    candidates.add((
      text: localizeText(pro.trim()),
      score: 2.4 + calcFocusScore(pro),
    ));
  }
  for (final entry in p.product.keySpecs.entries) {
    final value = entry.value.toString().trim();
    if (value.isEmpty) continue;
    final text = localizeText('${entry.key}: $value');
    candidates.add((text: text, score: 1.4 + calcFocusScore(text)));
  }
  if (p.product.techScore >= 90) {
    candidates.add((
      text: localizeText(
        'Tech score ${p.product.techScore.toStringAsFixed(0)}/100',
      ),
      score: focusAreas.any((a) => a == 'Performance' || a == 'Gaming')
          ? 3.0
          : 1.5,
    ));
  }
  candidates.sort((a, b) => b.score.compareTo(a.score));
  final highlights = <String>[];
  for (final entry in candidates) {
    final normalized = entry.text.toLowerCase();
    if (highlights.any(
      (t) =>
          normalized.contains(t.toLowerCase()) ||
          t.toLowerCase().contains(normalized),
    )) continue;
    highlights.add(entry.text);
    if (highlights.length >= 6) break;
  }

  // 4. Build trade-offs (mirrors _buildTradeOffs)
  final tradeOffs = <String>[];
  for (final con in p.product.cons.take(3)) {
    final text = con.trim();
    if (text.isNotEmpty) tradeOffs.add(text);
  }
  final lowerFocus = focusAreas.map((a) => a.toLowerCase()).toList();
  if (lowerFocus.contains('portability')) {
    final weightValue = p.product.keySpecs.entries
        .firstWhere(
          (e) => e.key.toLowerCase().contains('weight'),
          orElse: () => const MapEntry('', ''),
        )
        .value;
    if (weightValue.isNotEmpty) {
      tradeOffs.add(
        'Portability depends on its ${weightValue.toLowerCase()} weight.',
      );
    }
  }
  final finalTradeOffs = tradeOffs.take(3).toList();

  // 5. Build local reason (mirrors _buildLocalReason)
  final isTr = p.langCode == 'tr';
  final first = highlights.isNotEmpty ? highlights.first : '';
  final second = highlights.length > 1 ? highlights[1] : '';
  final topIssue = finalTradeOffs.isNotEmpty ? finalTradeOffs.first : '';
  String reason;
  if (isTr) {
    if (first.isNotEmpty && second.isNotEmpty) {
      final base = '$first ve $second ile öne çıkıyor.';
      reason = topIssue.isNotEmpty
          ? '$base $topIssue ana taviz noktası olarak dikkat çekiyor.'
          : base;
    } else if (first.isNotEmpty && topIssue.isNotEmpty) {
      reason = '$first ile öne çıkıyor. $topIssue ana sınırı olarak görülmeli.';
    } else if (first.isNotEmpty) {
      reason = '$first ile öne çıkıyor.';
    } else if (topIssue.isNotEmpty) {
      reason = '$topIssue bu üründe dikkat edilmesi gereken ana nokta.';
    } else {
      reason =
          'Teknik seviye, genel denge ve kategori içindeki konumuyla dikkat çeken bir profil sunuyor.';
    }
  } else {
    if (first.isNotEmpty && second.isNotEmpty) {
      final base = '$first and $second stand out most.';
      reason = topIssue.isNotEmpty
          ? '$base $topIssue is the main trade-off to keep in mind.'
          : base;
    } else if (first.isNotEmpty && topIssue.isNotEmpty) {
      reason = '$first is the main standout. $topIssue is the clearest limitation.';
    } else if (first.isNotEmpty) {
      reason = '$first is the clearest standout.';
    } else if (topIssue.isNotEmpty) {
      reason = '$topIssue is the main limitation to keep in mind.';
    } else {
      reason =
          'It stands out through its overall technical balance and category position.';
    }
  }

  final resolvedScore = fs > 0
      ? fs.toInt()
      : (p.product.techScore * 0.72).round().clamp(35, 80);

  return _FallbackIsolateResult(
    resolvedScore: resolvedScore,
    reason: reason,
    topMatchFactors: highlights.take(3).toList(),
    missingFactors: finalTradeOffs.take(2).toList(),
  );
}

// ────────────────────────────────────────────────────────────────────────────

final geminiMatchScoreProvider =
    StateNotifierProvider.family<
      _GeminiMatchScoreNotifier,
      AsyncValue<GeminiMatchResult?>,
      LocalizedProductKey
    >((ref, key) {
      return _GeminiMatchScoreNotifier(ref, key);
    });

class _GeminiMatchScoreNotifier
    extends StateNotifier<AsyncValue<GeminiMatchResult?>> {
  static const int _detailMatchCacheVersion = 8; // v8: enhanced user profile analysis
  final Ref _ref;
  final String _productId;
  final String _languageCode;
  _GeminiMatchScoreNotifier(this._ref, LocalizedProductKey key)
    : _productId = key.productId,
      _languageCode = key.normalizedLanguageCode.isEmpty
          ? 'en'
          : key.normalizedLanguageCode,
      super(const AsyncValue.data(null));

  Future<void> fetchMatchScore({
    required ProductEntity product,
    /// Karşılaştır ekranındaki toplu eşleşme: kotayı `recordCompareAi` karşılar;
    /// ürün detay `detailMatchAi` tüketimi yapılmaz.
    bool forCompareBatch = false,
  }) async {
    if (state is AsyncLoading) return;
    if (state.valueOrNull != null) return;

    final userAsync = _ref.read(userProfileProvider);
    final user = userAsync.valueOrNull;
    if (user == null || !user.quizCompleted) return;
    final sub = _ref.read(subscriptionServiceProvider);
    if (!sub.isPremium) {
      if (!forCompareBatch && !sub.canUseDetailMatchAi) {
        // Yield to the event loop before running background compute so the
        // call is safe from a widget life-cycle context and input events
        // can be processed before the isolate result arrives.
        await Future<void>.microtask(() {});
        if (!mounted) return;
        await _fallbackToLocal(product);
        return;
      }
    }

    // Defer the state mutation to the next microtask so this is safe even
    // when invoked from a widget life-cycle (initState/build) — otherwise
    // Riverpod throws "Tried to modify a provider while the widget tree
    // was building" and the UI is left with a broken spinner.
    await Future<void>.microtask(() {});
    if (!mounted) return;
    if (state is AsyncLoading) return;
    if (state.valueOrNull != null) return;

    state = const AsyncValue.loading();

    try {
      // 45s outer guard — Gemini heavy tier with 1024 thinking tokens takes
      // 15-30s. Previous 18s was firing before Gemini could respond, forcing
      // every call through the fallback path and showing 0% / empty results.
      await _doFetchMatchScore(
        product: product,
        user: user,
        forCompareBatch: forCompareBatch,
      ).timeout(
        const Duration(seconds: 45),
        onTimeout: () {
          throw Exception('match score outer timeout (45s)');
        },
      );
    } catch (e, st) {
      debugPrint('[GeminiMatch] failed: $e\n$st');
      _clearStep(product.id);
      try {
        await _fallbackToLocal(product);
      } catch (fallbackError) {
        debugPrint('[GeminiMatch] fallback also failed: $fallbackError');
      }
    } finally {
      // Defensive: never leave UI stuck on the spinner.
      _clearStep(product.id);
      if (state is AsyncLoading) {
        state = const AsyncValue.data(null);
      }
    }
  }
  String _stepMsg(String langCode, String tr, String en) =>
      langCode == 'tr' ? tr : en;

  void _emitStep(String productId, String langCode, String tr, String en) {
    if (!mounted) return;
    try {
      _ref
          .read(aiMatchStepProvider(productId).notifier)
          .state = _stepMsg(langCode, tr, en);
    } catch (_) {}
  }

  void _clearStep(String productId) {
    if (!mounted) return;
    try {
      _ref.read(aiMatchStepProvider(productId).notifier).state = '';
    } catch (_) {}
  }

  Future<void> _doFetchMatchScore({
    required ProductEntity product,
    required dynamic user,
    bool forCompareBatch = false,
  }) async {
    final profileLangCode = (user.language as String).trim().toLowerCase();
      final langCode = _languageCode.isNotEmpty
          ? _languageCode
          : (profileLangCode.isNotEmpty ? profileLangCode : 'en');

      // ── Step 1: Load user record & check cache ─────────────────────────────
      _emitStep(product.id, langCode,
          'Kullanıcı profili yükleniyor…', 'Loading user profile…');

      // 1. Fetch user record ONCE — extracts match_cache AND weightVector together.
      //    Using fields projection to reduce data transfer. Cap at 2s so a slow
      //    PB connection never blocks the UI longer than that.
      Map<String, dynamic>? userRecordData;
      try {
        final rec = await pb
            .collection('users')
            .getOne(user.uid, fields: 'match_cache,weightVector')
            .timeout(
              const Duration(seconds: 2),
              onTimeout: () => throw Exception('PB timeout'),
            );
        userRecordData = rec.data;
      } catch (_) {
        userRecordData = null;
      }

      // Check match cache from the single fetched record.
      final cached = userRecordData != null
          ? _parseMatchCacheFromData(userRecordData, langCode)
          : null;
      if (cached != null) {
        _clearStep(product.id);
        state = AsyncValue.data(cached);
        return;
      }

      // ── Step 2: Build profile & product context ────────────────────────────
      _emitStep(product.id, langCode,
          'Ürün analizi hazırlanıyor…', 'Preparing product analysis…');

      // 3. Call Gemini Flash (faster + cheaper than DeepSeek for short JSON tasks)
      final gemini = _ref.read(geminiServiceProvider);
      final behaviorAsync = _ref.read(behaviorSignalsProvider);
      final behavior = behaviorAsync.valueOrNull ?? BehaviorSignals.empty;
      // weightVector already fetched — parse from in-memory data (no extra PB call).
      final weightVector = _parseWeightVectorFromData(userRecordData?['weightVector']);

      // Yield before isolate dispatch — keeps first UI frame smooth while
      // widgets are mounting (postFrameCallback fires before route anim done).
      await Future<void>.delayed(Duration.zero);
      if (!mounted) return;

      // Build focusAreas / highlights / tradeOffs in a background isolate so
      // the main thread is completely free during this preparation phase.
      final hResult = await compute(
        _computeHighlightsInIsolate,
        _HighlightsIsolateParams(
          user: user as UserEntity,
          product: product,
          weightVector: weightVector,
          langCode: langCode,
        ),
      );
      if (!mounted) return;

      final focusAreas = hResult.focusAreas;
      final productHighlights = hResult.highlights;
      final tradeOffs = hResult.tradeOffs;
      final fallbackReason = hResult.fallbackReason;

      final profileJson = {
        'ecosystem': user.ecosystem,
        'budgetRange': user.budgetRange,
        'priorities': user.priorities,
        if (focusAreas.isNotEmpty) 'focusAreas': focusAreas,
        if (weightVector.isNotEmpty)
          'topWeights': _topWeightedTraits(weightVector),
        'currentDevices': user.currentDevices,
        'interestCategories': user.interestCategories,
        'primaryCategory': user.primaryCategory,
        'usageIntent': user.usageIntent,
        'profession': user.profession,
        'ageRange': user.ageRange,
        if ((user.gender as String?)?.isNotEmpty == true) 'gender': user.gender,
        if ((user.country as String).isNotEmpty) 'country': user.country,
        if ((user.currency as String).isNotEmpty) 'currency': user.currency,
        if (user.ownedProducts.isNotEmpty)
          'ownedProducts': user.ownedProducts.take(8).toList(),
        if (user.subscriptions.isNotEmpty)
          'subscriptions': user.subscriptions,
        if (behavior.categoryViews.isNotEmpty)
          'recentCategoryViews': behavior.categoryViews,
        if (behavior.favorites.isNotEmpty)
          'favoritedProductCount': behavior.favorites.length,
      };

      // Build concise product JSON (cap to 15 specs for richer analysis)
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
        if ((product.subcategory as String?)?.isNotEmpty == true)
          'subcategory': product.subcategory,
        'techScore': product.techScore,
        'highlights': productHighlights,
        if (tradeOffs.isNotEmpty) 'tradeOffs': tradeOffs,
        'specs': topSpecs,
        if (product.pros.isNotEmpty) 'pros': product.pros.take(5).toList(),
        if (product.cons.isNotEmpty) 'cons': product.cons.take(5).toList(),
        if (product.prices.isNotEmpty)
          'priceRange': product.prices.values.first,
      };

      // ── Step 3: Call AI ────────────────────────────────────────────────────
      _emitStep(product.id, langCode,
          'AI eşleşme skoru hesaplanıyor…', 'Calculating AI match score…');

      // Calibrated bands: higher floor (40), more generous mid-tier.
      // User feedback: prior 25-100 with 90+ exceptional felt consistently
      // underwhelming (most scores landed 55-70). New mapping rewards genuine
      // quality while preserving separation for poor fits.
      final langDisplay = _languageDisplayName(langCode);
      final prompt =
          'You are a senior tech analyst performing a detailed user-product compatibility analysis. '
          'Score this product 40-100 for this specific user profile (never below 40).\n'
          'Return ONLY valid JSON — no markdown, no extra text.\n'
          '⚠️ CRITICAL: ALL text fields in the JSON MUST be written in $langDisplay ($langCode). '
          'Using any other language is a critical error.\n\n'
          'reason: Write 4-6 professional, product-focused sentences (100-160 words) in $langDisplay. '
          'Structure it as: (1) Start with the product\'s strongest technical merit that aligns with this user\'s specific needs (profession, usageIntent, priorities). '
          '(2) Elaborate on 2-3 specific performance advantages backed by actual specs/numbers. '
          '(3) Assess budget fit using the user\'s budgetRange and currency/country context. '
          '(4) Mention 1-2 real trade-offs or limitations honest to this user\'s profile. '
          '(5) End with a clear, personalized verdict for this user. '
          'Use professional tech-review language. Be specific — cite specs, numbers, real use cases. '
          'Do NOT use "you/your" or first-person references. '
          'In Turkish: never use "kullanıcı" — use impersonal phrasing (e.g., "bu ürün ... sunar"). '
          'Never mention ecosystem/profile/devices/platform compatibility.\n\n'
          'Score bands: 88-100 exceptional match / 75-87 strong fit / 62-74 solid with minor trade-offs / '
          '50-61 adequate but compromised / 40-49 poor fit.\n'
          'Rules:\n'
          '- If techScore >= 85 and no major spec mismatch → score >= 75.\n'
          '- If product category matches user\'s primaryCategory or interestCategories → +5 bonus.\n'
          '- If product price exceeds user\'s budgetRange significantly → penalty -8 to -15.\n'
          '- If user owns similar devices (ownedProducts) → consider upgrade value.\n'
          'Signals to weigh: focusAreas/weightVector priorities, usageIntent, profession, ageRange, '
          'budgetRange vs priceRange, country/currency context, ownedProducts for upgrade context, '
          'techScore, specs (all 15 fields), pros/cons, behavioral signals (recentCategoryViews/favoritedProductCount).\n\n';
      final encodedProfileJson = await compute(_encodeJsonString, profileJson);
      final encodedProductJson = await compute(_encodeJsonString, productJson);
      if (!mounted) return;

      final promptWithPayload =
          '$prompt'
          'USER:$encodedProfileJson\n'
          'PRODUCT:$encodedProductJson\n\n'
          'JSON: {"matchScore":<int>,"reason":"<4-6 sentences in $langDisplay>",'
          '"topMatchFactors":["specific_strength_1","specific_strength_2","specific_strength_3"],'
          '"missingFactors":["specific_gap_1","specific_gap_2"]}';

      final result = await gemini
          .jsonFreeTextQuery(
            promptWithPayload,
            language: langCode,
            maxTokens: 2500, // increased for longer, more detailed responses
            tier: AiTier.heavy, // always use gemini-2.5-flash for match scoring
          )
          .timeout(
            const Duration(seconds: 25),
            onTimeout: () =>
                throw Exception('Gemini match score timeout (25s)'),
          );
      final map = _decodeJsonMap(result);

      // Calibrated clamp: minimum 40 matches prompt bands.
      var score = _safeInt(map['matchScore'], 60).clamp(40, 100);
      // Safety net: if techScore is strong (>=85) and Gemini returned a low
      // score without a compelling mismatch, nudge up by up to 8 points.
      if (product.techScore >= 85 && score < 70) {
        score = (score + 8).clamp(40, 100);
      }
      final reason = _sanitizeMatchReason(
        rawReason: ((map['reason'] as String?) ?? '').trim(),
        fallbackReason: fallbackReason,
      );
      final factors =
          (map['topMatchFactors'] as List?)
              ?.map((e) => e.toString())
              .toList() ??
          [];
      final missing =
          (map['missingFactors'] as List?)?.map((e) => e.toString()).toList() ??
          [];

      final matchResult = GeminiMatchResult(
        matchScore: score,
        reason: reason,
        topMatchFactors: factors,
        missingFactors: missing,
        isFromGemini: true,
      );

      // ── Step 4: Done — emit result ─────────────────────────────────────────
      _emitStep(product.id, langCode,
          'Sonuçlar hazır!', 'Results ready!');

      // Emit result FIRST so the UI updates immediately. Cache write +
      // quota recording happen fire-and-forget afterwards — they should
      // never delay the visible state transition.
      // Small delay so the "Results ready" step message is briefly visible.
      await Future<void>.delayed(const Duration(milliseconds: 300));
      _clearStep(product.id);
      if (!mounted) return; // orphaned future safety (45s outer timeout may have already returned)
      state = AsyncValue.data(matchResult);

      final subForQuota = _ref.read(subscriptionServiceProvider);
      if (!subForQuota.isPremium && !forCompareBatch) {
        subForQuota.recordDetailMatchAi();
      }

      unawaited(
        Future<void>(() async {
          try {
            await _saveToFirestoreCache(user.uid, matchResult, langCode);
          } catch (_) {}
        }),
      );

      debugPrint(
        '[GeminiMatch] Product: ${product.name}, Score: $score, Reason: $reason',
      );
    // Note: errors propagate up to fetchMatchScore for unified timeout/fallback handling.
  }

  /// Computes a local (non-AI) match result in a background isolate so the
  /// main thread is never blocked. State is set once compute() returns.
  Future<void> _fallbackToLocal(ProductEntity product) async {
    final userAsync = _ref.read(userProfileProvider);
    final user = userAsync.valueOrNull;
    if (user == null) {
      state = const AsyncValue.data(null);
      return;
    }
    final behaviorAsync = _ref.read(behaviorSignalsProvider);
    final behavior = behaviorAsync.valueOrNull ?? BehaviorSignals.empty;
    final langCode =
        (_ref.read(localeProvider)?.languageCode ?? 'en').toLowerCase();

    // All heavy computation happens in a background isolate.
    final result = await compute(
      _computeFallbackInIsolate,
      _FallbackIsolateParams(
        user: user,
        product: product,
        behavior: behavior,
        langCode: langCode,
      ),
    );

    if (!mounted) return;
    state = AsyncValue.data(
      GeminiMatchResult(
        matchScore: result.resolvedScore,
        reason: result.reason,
        topMatchFactors: result.topMatchFactors,
        missingFactors: result.missingFactors,
        isFromGemini: false,
      ),
    );
  }

  /// Parse match cache entry from already-fetched user record data.
  /// Avoids an extra PB network round-trip by reusing the single getOne result.
  GeminiMatchResult? _parseMatchCacheFromData(
    Map<String, dynamic> userRecordData,
    String langCode,
  ) {
    try {
      final matchCache =
          userRecordData['match_cache'] as Map<String, dynamic>? ?? {};
      final cached = matchCache[_productId] as Map<String, dynamic>?;
      if (cached == null) return null;
      final ts = DateTime.tryParse(cached['timestamp']?.toString() ?? '');
      if (ts == null) return null;
      final age = DateTime.now().difference(ts);
      if (age.inHours >= 24) return null;
      final cachedLanguage =
          (cached['language'] as String?)?.trim().toLowerCase();
      if (cachedLanguage == null || cachedLanguage != langCode) return null;
      final cachedVersion =
          (cached['detailMatchCacheVersion'] as num?)?.toInt();
      if (cachedVersion != _detailMatchCacheVersion) return null;
      final fallbackReason = langCode == 'tr'
          ? 'Teknik seviye, genel denge ve kategori içindeki konumuyla dikkat çeken bir profil sunuyor.'
          : 'It stands out through its overall technical balance and category position.';
      return GeminiMatchResult(
        matchScore: _safeInt(cached['matchScore'], 0),
        reason: _sanitizeMatchReason(
          rawReason: (cached['reason'] as String?) ?? '',
          fallbackReason: fallbackReason,
        ),
        topMatchFactors:
            (cached['topMatchFactors'] as List?)
                ?.map((e) => e.toString())
                .toList() ??
            [],
        missingFactors:
            (cached['missingFactors'] as List?)
                ?.map((e) => e.toString())
                .toList() ??
            [],
        isFromGemini: true,
      );
    } catch (_) {
      return null;
    }
  }

  /// Parse weightVector from already-fetched user record data (no extra PB call).
  Map<String, double> _parseWeightVectorFromData(dynamic raw) {
    if (raw is! Map) return const {};
    try {
      return (raw as Map<String, dynamic>).map((key, value) {
        final numeric = value is num ? value.toDouble() : 0.0;
        return MapEntry(key, numeric.clamp(0.0, 1.0));
      });
    } catch (_) {
      return const {};
    }
  }

  Future<void> _saveToFirestoreCache(
    String uid,
    GeminiMatchResult result,
    String langCode,
  ) async {
    try {
      // Fetch current match_cache to merge without overwriting other products.
      final userRecord = await pb
          .collection('users')
          .getOne(uid, fields: 'match_cache');
      final matchCache = Map<String, dynamic>.from(
        userRecord.data['match_cache'] as Map? ?? {},
      );
      final existingProductCache = Map<String, dynamic>.from(
        matchCache[_productId] as Map? ?? {},
      );
      matchCache[_productId] = {
        ...existingProductCache,
        'matchScore': result.matchScore,
        'reason': result.reason,
        'topMatchFactors': result.topMatchFactors,
        'missingFactors': result.missingFactors,
        'language': langCode,
        'timestamp': DateTime.now().toUtc().toIso8601String(),
        'detailMatchCacheVersion': _detailMatchCacheVersion,
      };
      await pb
          .collection('users')
          .update(uid, body: {'match_cache': matchCache});
    } catch (_) {}
  }

  List<Map<String, Object>> _topWeightedTraits(
    Map<String, double> weightVector,
  ) {
    final entries = weightVector.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    return entries
        .take(5)
        .map(
          (entry) => {
            'trait': _focusLabel(_normalizeFocusKey(entry.key) ?? entry.key),
            'weight': entry.value.toStringAsFixed(2),
          },
        )
        .toList();
  }

  String _languageDisplayName(String code) {
    const map = <String, String>{
      'ar': 'Arabic',
      'de': 'German',
      'en': 'English',
      'es': 'Spanish',
      'fr': 'French',
      'it': 'Italian',
      'ja': 'Japanese',
      'nl': 'Dutch',
      'pl': 'Polish',
      'pt': 'Portuguese',
      'sv': 'Swedish',
      'tr': 'Turkish',
    };
    return map[code.toLowerCase()] ?? 'English';
  }

  String _sanitizeMatchReason({
    required String rawReason,
    required String fallbackReason,
  }) {
    final compact = rawReason.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (compact.isEmpty) return fallbackReason;

    // Only ban fragments that leak internal profile/personalization data.
    // Removed 'fit', 'match', 'uygun', 'oncelik' — these are normal product
    // description words and their exclusion was causing sentences to be dropped,
    // leaving the reason text empty or cut off.
    const bannedFragments = [
      'kullanici profiliniz',
      'kullanıcı profiliniz',
      'user profile',
      'current devices',
      'mevcut cihaz',
      'cihazlariyla',
      'cihazlarıyla',
      'cihazlariniz',
      'cihazlarınız',
    ];

    final sentences = compact
        .split(RegExp(r'(?<=[.!?])\s+'))
        .map((sentence) => sentence.trim())
        .where((sentence) => sentence.isNotEmpty)
        .where((sentence) {
          final lower = sentence.toLowerCase();
          return !bannedFragments.any(lower.contains);
        })
        .take(4)
        .toList();

    if (sentences.isEmpty) return compact.isNotEmpty ? compact : fallbackReason;

    final joined = sentences.join(' ').trim();
    if (joined.isEmpty) return fallbackReason;
    if (joined.length <= 550) return joined;
    // Truncate at a sentence boundary when possible
    final lastDot = joined.lastIndexOf(RegExp(r'[.!?]'), 547);
    if (lastDot > 200) return joined.substring(0, lastDot + 1);
    return '${joined.substring(0, 547).trimRight()}...';
  }

  String? _normalizeFocusKey(String raw) {
    final key = raw.trim().toLowerCase();
    switch (key) {
      case 'price':
      case 'price_sensitivity':
      case 'value':
        return 'price';
      case 'quality':
      case 'build_quality':
      case 'durability':
        return 'build_quality';
      case 'design':
        return 'design';
      case 'performance':
        return 'performance';
      case 'battery':
        return 'battery';
      case 'camera':
        return 'camera';
      case 'portability':
        return 'portability';
      case 'gaming':
        return 'gaming';
      case 'creator':
      case 'content_consumption':
      case 'display':
        return 'display';
      case 'productivity':
        return 'productivity';
      case 'audio_quality':
      case 'audio':
        return 'audio';
      case 'ecosystem':
      case 'ecosystem_lock':
        return 'ecosystem';
      default:
        return null;
    }
  }

  String _focusLabel(String key) {
    switch (key) {
      case 'price':
        return 'Value';
      case 'build_quality':
        return 'Build Quality';
      case 'design':
        return 'Design';
      case 'performance':
        return 'Performance';
      case 'battery':
        return 'Battery';
      case 'camera':
        return 'Camera';
      case 'portability':
        return 'Portability';
      case 'gaming':
        return 'Gaming';
      case 'display':
        return 'Display';
      case 'productivity':
        return 'Productivity';
      case 'audio':
        return 'Audio';
      case 'ecosystem':
        return 'Ecosystem';
      default:
        return key;
    }
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
    await ref
        .read(pbDataSourceProvider)
        .addToUserOwnedProducts(userId: user.uid, productId: productId);
    return const Success(null);
  } catch (e) {
    return Failure(ServerException(message: 'Could not add to collection: $e'));
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
    await ref
        .read(pbDataSourceProvider)
        .saveLinkAnalysis(
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
    return Failure(ServerException(message: 'Could not save analysis: $e'));
  }
}
