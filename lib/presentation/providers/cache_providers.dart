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
  _AIReviewNotifier(this._ref, LocalizedProductKey key)
    : _productId = key.productId,
      _languageCode = key.normalizedLanguageCode.isEmpty
          ? 'en'
          : key.normalizedLanguageCode,
      super(const AsyncValue.data(null));

  CacheService get _cache => _ref.read(cacheServiceProvider);

  Future<void> startAnalysis(String productName) async {
    if (state is AsyncLoading) return;
    if (state.valueOrNull != null) return;
    state = const AsyncValue.loading();

    // Check disk cache first (24h TTL)
    final cacheKey = 'ai_review_${_languageCode}_$_productId';
    try {
      final cached = await _cache.get<String>(cacheKey);
      if (cached != null && cached.isNotEmpty) {
        final parsed = _parseReviewResponse(cached);
        if (parsed != null && !parsed.failed) {
          state = AsyncValue.data(parsed);
          return;
        }
      }
    } catch (_) {}

    try {
      final deepseek = _ref.read(deepSeekServiceProvider);
      final langName = _getLanguageName(_languageCode);
      final response = await deepseek.jsonFreeTextQuery(
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
        language: _languageCode,
      );

      // Save raw response to disk cache
      if (response.isNotEmpty) {
        _cache
            .set(cacheKey, response, duration: const Duration(hours: 24))
            .catchError((_) {});
      }

      final parsed = _parseReviewResponse(response);
      state = AsyncValue.data(parsed ?? const AIReviewResult(failed: true));
    } catch (e) {
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

  _DeepAnalysisNotifier(this._ref, LocalizedProductKey key)
    : _productId = key.productId,
      _languageCode = key.normalizedLanguageCode.isEmpty
          ? 'en'
          : key.normalizedLanguageCode,
      super(const AsyncValue.data(null));

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
    final cacheKey = 'deep_analysis_${_languageCode}_$_productId';
    final cache = _ref.read(cacheServiceProvider);
    try {
      final cached = await cache.get<String>(cacheKey);
      if (cached != null && cached.isNotEmpty) {
        final parsed = _parseDeepAnalysis(cached);
        if (parsed.hasUsableContent) {
          state = AsyncValue.data(parsed);
          return;
        }
      }
    } catch (_) {}

    try {
      final deepseek = _ref.read(deepSeekServiceProvider);
      final catInfo = category.isNotEmpty ? ' (Category: $category)' : '';
      final brandInfo = (brand != null && brand.isNotEmpty) ? ' by $brand' : '';
      final yearInfo = (year != null && year > 0)
          ? ', released around $year'
          : '';
      final result = await deepseek.jsonFreeTextQuery(
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
        language: _languageCode,
      );
      // Save to disk cache
      if (result.isNotEmpty) {
        cache
            .set(cacheKey, result, duration: const Duration(hours: 24))
            .catchError((_) {});
      }
      state = AsyncValue.data(_parseDeepAnalysis(result));
    } catch (e) {
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
  _AlternativesCacheNotifier(this._ref, LocalizedProductKey key)
    : _productId = key.productId,
      _languageCode = key.normalizedLanguageCode.isEmpty
          ? 'en'
          : key.normalizedLanguageCode,
      super(const AsyncValue.data(null));

  Future<void> startQuery(String productName, String category) async {
    if (state is AsyncLoading) return;
    if (state.valueOrNull?.hasUsableContent == true) return;
    state = const AsyncValue.loading();

    // Disk cache check
    final cacheKey = 'alternatives_${_languageCode}_$_productId';
    final cache = _ref.read(cacheServiceProvider);
    try {
      final cached = await cache.get<String>(cacheKey);
      if (cached != null && cached.isNotEmpty) {
        final parsed = _parseAlternatives(cached);
        if (parsed.hasUsableContent) {
          state = AsyncValue.data(parsed);
          return;
        }
      }
    } catch (_) {}

    try {
      final deepseek = _ref.read(deepSeekServiceProvider);
      final result = await deepseek.jsonFreeTextQuery(
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
        language: _languageCode,
      );
      if (result.isNotEmpty) {
        cache
            .set(cacheKey, result, duration: const Duration(hours: 24))
            .catchError((_) {});
      }
      state = AsyncValue.data(_parseAlternatives(result));
    } catch (e) {
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
  _AdvisorCacheNotifier(this._ref, LocalizedProductKey key)
    : _productId = key.productId,
      _languageCode = key.normalizedLanguageCode.isEmpty
          ? 'en'
          : key.normalizedLanguageCode,
      super(const AsyncValue.data(null));

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
    final cacheKey = 'advisor_${_languageCode}_$_productId';
    final cache = _ref.read(cacheServiceProvider);
    try {
      final cached = await cache.get<String>(cacheKey);
      if (cached != null && cached.isNotEmpty) {
        final parsed = _parseAdvisor(cached);
        if (parsed.hasUsableContent) {
          state = AsyncValue.data(parsed);
          return;
        }
      }
    } catch (_) {}

    try {
      final deepseek = _ref.read(deepSeekServiceProvider);
      final result = await deepseek.jsonFreeTextQuery(
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
        language: _languageCode,
      );
      if (result.isNotEmpty) {
        cache
            .set(cacheKey, result, duration: const Duration(hours: 24))
            .catchError((_) {});
      }
      state = AsyncValue.data(_parseAdvisor(result));
    } catch (e) {
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
  static const int _predictionCacheVersion = 3;
  _PredictionCacheNotifier(this._ref, LocalizedProductKey key)
    : _productId = key.productId,
      _languageCode = key.normalizedLanguageCode.isEmpty
          ? 'en'
          : key.normalizedLanguageCode,
      super(const AsyncValue.data(null));

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
    try {
      final cached = await cache.get<String>(cacheKey);
      if (cached != null && cached.isNotEmpty) {
        final parsed = _mergeWithHeuristic(_parsePrediction(cached), heuristic);
        if (parsed.hasUsableContent) {
          state = AsyncValue.data(parsed);
          return;
        }
      }
    } catch (_) {}

    try {
      final deepseek = _ref.read(deepSeekServiceProvider);
      final cat = category.isEmpty ? 'tech product' : category;
      final result = await deepseek.jsonFreeTextQuery(
        'Current year: ${DateTime.now().year}.\n'
        'Return a JSON object with this EXACT structure:\n'
        '{\n'
        '  "trend": "<up/down/stable>",\n'
        '  "trendPercentage": <number 0-100>,\n'
        '  "bestTimeToBuy": "<when to buy, 1-2 sentences>",\n'
        '  "expectedDrop": "<expected price change description>",\n'
        '  "buyOrWait": "<buy/wait>",\n'
        '  "reasoning": "<2-3 sentence explanation of the prediction>"\n'
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
      );
      if (result.isNotEmpty) {
        cache
            .set(cacheKey, result, duration: const Duration(hours: 24))
            .catchError((_) {});
      }
      state = AsyncValue.data(
        _mergeWithHeuristic(_parsePrediction(result), heuristic),
      );
    } catch (e) {
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
      bestTimeToBuy: parsed.bestTimeToBuy.trim().isNotEmpty
          ? parsed.bestTimeToBuy.trim()
          : heuristic.bestTimeToBuy,
      expectedDrop: parsed.expectedDrop.trim().isNotEmpty
          ? parsed.expectedDrop.trim()
          : heuristic.expectedDrop,
      buyOrWait: parsed.buyOrWait.trim().isNotEmpty
          ? parsed.buyOrWait.trim()
          : heuristic.buyOrWait,
      reasoning: !_looksGenericPrediction(reasoning)
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
              'Bir sonraki kampanya ya da yeni nesil duyurusu oncesi 1-3 ay izlemek daha mantikli gorunuyor.',
            _ =>
              'Fiyat hareketi sinirli oldugu icin uygun bir teklif yakalandiginda hemen alinabilir.',
          }
        : switch (buyOrWait) {
            'wait' =>
              'Waiting for the next sale window or the next product-cycle announcement over the next 1-3 months looks smarter.',
            _ =>
              'Price movement looks limited, so buying as soon as you find a strong deal makes sense.',
          };

    final expectedDrop = isTr
        ? trend == 'down'
              ? 'Kisa vadede yaklasik %$trendPercentage civari bir geri cekilme potansiyeli var.'
              : 'Fiyatin yakin donemde yatay kalmasi daha olasi.'
        : trend == 'down'
        ? 'There is roughly a $trendPercentage% downside window in the near term.'
        : 'Pricing is more likely to stay flat in the near term.';

    final lifecycleText = age == null
        ? (isTr
              ? 'kategori dongusu ve teknik seviye'
              : 'category cycle and technical tier')
        : age <= 1
        ? (isTr ? 'yeni urun zamani' : 'its recent release timing')
        : (isTr
              ? 'olgunlasmis urun donemi'
              : 'its more mature lifecycle stage');
    final reasoning = isTr
        ? '${productName.trim()} icin tahmin $lifecycleText, fiyat seviyesi ve ${normalizedContext.contains('brand:') ? 'marka konumu' : 'kategori hizi'} uzerinden kuruldu. ${buyOrWait == 'wait' ? 'Yeni ve premium yapida oldugu icin indirim marji daha yuksek.' : 'Fiyat hareketi sinirli oldugu icin buyuk bir dusus beklentisi zayif.'}'
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
    if (value.contains('down') || value.contains('drop')) return 'down';
    if (value.contains('up') || value.contains('rise')) return 'up';
    if (value.contains('stable') || value.contains('flat')) return 'stable';
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
        lower.contains('degisken olabilir');
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
  static const int _detailMatchCacheVersion = 6; // v6: explicit lang in prompt + loading state fix
  final Ref _ref;
  final String _productId;
  final String _languageCode;
  _GeminiMatchScoreNotifier(this._ref, LocalizedProductKey key)
    : _productId = key.productId,
      _languageCode = key.normalizedLanguageCode.isEmpty
          ? 'en'
          : key.normalizedLanguageCode,
      super(const AsyncValue.data(null));

  Future<void> fetchMatchScore({required ProductEntity product}) async {
    if (state is AsyncLoading) return;
    if (state.valueOrNull != null) return;

    final userAsync = _ref.read(userProfileProvider);
    final user = userAsync.valueOrNull;
    if (user == null || !user.quizCompleted) return;

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
      await _doFetchMatchScore(product: product, user: user).timeout(
        const Duration(seconds: 12),
        onTimeout: () {
          throw Exception('match score outer timeout (12s)');
        },
      );
    } catch (e, st) {
      debugPrint('[GeminiMatch] failed: $e\n$st');
      _fallbackToLocal(product);
    } finally {
      // Defensive: never leave UI stuck on the spinner.
      if (state is AsyncLoading) {
        state = const AsyncValue.data(null);
      }
    }
  }

  Future<void> _doFetchMatchScore({
    required ProductEntity product,
    required dynamic user,
  }) async {
    final profileLangCode = (user.language as String).trim().toLowerCase();
      final langCode = _languageCode.isNotEmpty
          ? _languageCode
          : (profileLangCode.isNotEmpty ? profileLangCode : 'en');

      // 1. Check PocketBase cache first (24h TTL) — but cap at 2s; if PB is
      // slow we treat it as a cache miss and proceed to Gemini.
      GeminiMatchResult? cached;
      try {
        cached = await _checkFirestoreCache(user.uid, langCode).timeout(
          const Duration(seconds: 2),
          onTimeout: () => null,
        );
      } catch (_) {
        cached = null;
      }
      if (cached != null) {
        state = AsyncValue.data(cached);
        return;
      }

      // 2. Quota gate — free users limited to N AI match analyses per day.
      // On miss, return null so UI falls back to local algorithmic score only.
      final sub = _ref.read(subscriptionServiceProvider);
      if (!sub.isPremium && !sub.canUseDetailMatchAi) {
        state = const AsyncValue.data(null);
        return;
      }

      // 3. Call Gemini Flash (faster + cheaper than DeepSeek for short JSON tasks)
      final gemini = _ref.read(geminiServiceProvider);
      final behaviorAsync = _ref.read(behaviorSignalsProvider);
      final behavior = behaviorAsync.valueOrNull ?? BehaviorSignals.empty;
      final weightVector = await _loadWeightVector(user.uid);

      // Yield before building prompt — keeps first UI frame smooth while
      // widgets are mounting (postFrameCallback fires before route anim done).
      await Future<void>.delayed(Duration.zero);
      if (!mounted) return;

      final focusAreas = _buildFocusAreas(
        user: user,
        weightVector: weightVector,
      );
      final productHighlights = _buildProductHighlights(
        product: product,
        focusAreas: focusAreas,
      );
      final tradeOffs = _buildTradeOffs(
        product: product,
        focusAreas: focusAreas,
      );

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
        if (behavior.categoryViews.isNotEmpty)
          'recentCategoryViews': behavior.categoryViews,
        if (behavior.favorites.isNotEmpty)
          'favoritedProductCount': behavior.favorites.length,
      };

      // Build concise product JSON (cap to 10 specs — less context = faster LLM)
      final topSpecs = <String, dynamic>{};
      var specCount = 0;
      for (final e in product.specs.entries) {
        if (specCount >= 10) break;
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
        'highlights': productHighlights,
        if (tradeOffs.isNotEmpty) 'tradeOffs': tradeOffs,
        'specs': topSpecs,
        if (product.pros.isNotEmpty) 'pros': product.pros.take(4).toList(),
        if (product.cons.isNotEmpty) 'cons': product.cons.take(4).toList(),
      };

      final fallbackReason = _buildLocalReason(
        highlights: productHighlights,
        tradeOffs: tradeOffs,
      );
      // Calibrated bands: higher floor (40), more generous mid-tier.
      // User feedback: prior 25-100 with 90+ exceptional felt consistently
      // underwhelming (most scores landed 55-70). New mapping rewards genuine
      // quality while preserving separation for poor fits.
      final prompt =
          'Score this product 40-100 for this user (never <40). Return ONLY JSON.\n'
          'reason: 3-4 product-focused sentences (60-110 words) in language "$langCode" '
          '(${_languageDisplayName(langCode)}). Mention 2-3 strengths + 1 real limitation. '
          'Do NOT use "you/your". In Turkish never use "kullanici"; use formal "siz" if unavoidable. '
          'Never mention ecosystem/compatibility/profile/devices/platform.\n'
          'Bands: 88-100 exceptional fit / 75-87 strong fit / 62-74 solid with minor compromises / '
          '50-61 mediocre / 40-49 poor fit.\n'
          'If techScore >= 85 and no major mismatch, score >= 75.\n'
          'Signals: weight vector, priorities, usage intent, profession, ecosystem, '
          'recent views/favorites, techScore, specs, pros/cons, budget vs price.\n\n'
          'USER:${jsonEncode(profileJson)}\n'
          'PRODUCT:${jsonEncode(productJson)}\n\n'
          'JSON: {"matchScore":<int>,"reason":"<text>",'
          '"topMatchFactors":["f1","f2","f3"],"missingFactors":["m1","m2"]}';

      final result = await gemini
          .jsonFreeTextQuery(
            prompt,
            language: langCode,
            maxTokens: 1500,
            // tier:lite + _rawRequest forces thinkingBudget=0 → no reasoning
            // tokens billed; cheap & fast.
          )
          .timeout(
            const Duration(seconds: 12),
            onTimeout: () =>
                throw Exception('Gemini match score timeout (12s)'),
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

      // Emit result FIRST so the UI updates immediately. Cache write +
      // quota recording happen fire-and-forget afterwards — they should
      // never delay the visible state transition.
      state = AsyncValue.data(matchResult);

      unawaited(
        Future<void>(() async {
          try {
            await _saveToFirestoreCache(user.uid, matchResult, langCode);
          } catch (_) {}
        }),
      );

      if (!sub.isPremium) {
        sub.recordDetailMatchAi();
      }

      debugPrint(
        '[GeminiMatch] Product: ${product.name}, Score: $score, Reason: $reason',
      );
    // Note: errors propagate up to fetchMatchScore for unified timeout/fallback handling.
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
    final fs = algo.calculateTotalFitScore(
      user: user,
      product: product,
      behavior: behavior,
    );
    final focusAreas = _buildFocusAreas(user: user, weightVector: const {});
    final highlights = _buildProductHighlights(
      product: product,
      focusAreas: focusAreas,
    );
    final tradeOffs = _buildTradeOffs(
      product: product,
      focusAreas: focusAreas,
    );
    // If the weight-based algorithm returns 0 (rare, happens when the user has
    // no weight signals yet), derive a sensible baseline from techScore so the
    // UI never shows an empty match card — the spinner problem the user saw.
    final resolvedScore = fs > 0
        ? fs.toInt()
        : (product.techScore * 0.72).round().clamp(35, 80);
    state = AsyncValue.data(
      GeminiMatchResult(
        matchScore: resolvedScore,
        reason: _buildLocalReason(
          highlights: highlights,
          tradeOffs: tradeOffs,
        ),
        topMatchFactors: highlights.take(3).toList(),
        missingFactors: tradeOffs.take(2).toList(),
        isFromGemini: false,
      ),
    );
  }

  Future<GeminiMatchResult?> _checkFirestoreCache(
    String uid,
    String langCode,
  ) async {
    try {
      final userRecord = await pb.collection('users').getOne(uid);
      final matchCache =
          userRecord.data['match_cache'] as Map<String, dynamic>? ?? {};
      final cached = matchCache[_productId] as Map<String, dynamic>?;
      if (cached == null) return null;
      final ts = DateTime.tryParse(cached['timestamp']?.toString() ?? '');
      if (ts == null) return null;
      final age = DateTime.now().difference(ts);
      if (age.inHours >= 24) return null; // expired
      final cachedLanguage = (cached['language'] as String?)
          ?.trim()
          .toLowerCase();
      if (cachedLanguage == null || cachedLanguage != langCode) return null;
      final cachedVersion = (cached['detailMatchCacheVersion'] as num?)
          ?.toInt();
      if (cachedVersion != _detailMatchCacheVersion) return null;
      final fallbackReason = _buildLocalReason(
        highlights: const [],
        tradeOffs: const [],
      );
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

  Future<void> _saveToFirestoreCache(
    String uid,
    GeminiMatchResult result,
    String langCode,
  ) async {
    try {
      final userRecord = await pb.collection('users').getOne(uid);
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

  Future<Map<String, double>> _loadWeightVector(String uid) async {
    try {
      final userRecord = await pb.collection('users').getOne(uid);
      final raw = userRecord.data['weightVector'] as Map<String, dynamic>?;
      if (raw == null) return const {};
      return raw.map((key, value) {
        final numeric = value is num ? value.toDouble() : 0.0;
        return MapEntry(key, numeric.clamp(0.0, 1.0));
      });
    } catch (_) {
      return const {};
    }
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

  List<String> _buildFocusAreas({
    required UserEntity user,
    required Map<String, double> weightVector,
  }) {
    final scores = <String, double>{};

    void addScore(String rawKey, double score) {
      final key = _normalizeFocusKey(rawKey);
      if (key == null) return;
      final current = scores[key] ?? 0;
      if (score > current) scores[key] = score;
    }

    for (var i = 0; i < user.priorities.length; i++) {
      addScore(user.priorities[i], 1.0 - (i * 0.08));
    }
    for (final entry in weightVector.entries) {
      addScore(entry.key, entry.value);
    }

    final ranked = scores.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final nonEcosystem = ranked
        .where((entry) => entry.key != 'ecosystem')
        .toList();
    final ecosystem = ranked
        .where((entry) => entry.key == 'ecosystem')
        .toList();
    final ordered = <MapEntry<String, double>>[
      ...nonEcosystem,
      if (ecosystem.isNotEmpty &&
          (ecosystem.first.value >= 0.8 || nonEcosystem.length < 2))
        ecosystem.first,
    ];

    return ordered.take(4).map((entry) => _focusLabel(entry.key)).toList();
  }

  List<String> _buildProductHighlights({
    required ProductEntity product,
    required List<String> focusAreas,
  }) {
    final highlights = <({String text, double score})>[];
    final focusKeywords = focusAreas.map(_focusKeywordsForLabel).toList();

    double focusScore(String source) {
      final lower = source.toLowerCase();
      var score = 0.0;
      for (final keywords in focusKeywords) {
        if (keywords.any(lower.contains)) score += 1.6;
      }
      return score;
    }

    for (final pro in product.pros.take(5)) {
      final score = 2.4 + focusScore(pro);
      highlights.add((text: pro.trim(), score: score));
    }

    for (final entry in product.keySpecs.entries) {
      final value = entry.value.toString().trim();
      if (value.isEmpty) continue;
      final text = '${entry.key}: $value';
      final score = 1.4 + focusScore(text);
      highlights.add((text: text, score: score));
    }

    if (product.techScore >= 90) {
      highlights.add((
        text: 'Tech score ${product.techScore.toStringAsFixed(0)}/100',
        score:
            focusAreas.any((area) => area == 'Performance' || area == 'Gaming')
            ? 3.0
            : 1.5,
      ));
    }

    highlights.sort((a, b) => b.score.compareTo(a.score));
    final deduped = <String>[];
    for (final entry in highlights) {
      final normalized = entry.text.toLowerCase();
      if (deduped.any(
        (text) =>
            normalized.contains(text.toLowerCase()) ||
            text.toLowerCase().contains(normalized),
      )) {
        continue;
      }
      deduped.add(entry.text);
      if (deduped.length >= 6) break;
    }
    return deduped;
  }

  List<String> _buildTradeOffs({
    required ProductEntity product,
    required List<String> focusAreas,
  }) {
    final issues = <String>[];
    for (final con in product.cons.take(3)) {
      final text = con.trim();
      if (text.isNotEmpty) issues.add(text);
    }

    final lowerFocus = focusAreas.map((area) => area.toLowerCase()).toList();
    if (lowerFocus.contains('portability')) {
      final weightValue = product.keySpecs.entries
          .firstWhere(
            (entry) => entry.key.toLowerCase().contains('weight'),
            orElse: () => const MapEntry('', ''),
          )
          .value;
      if (weightValue.isNotEmpty) {
        issues.add(
          'Portability depends on its ${weightValue.toLowerCase()} weight.',
        );
      }
    }

    return issues.take(3).toList();
  }

  String _buildLocalReason({
    required List<String> highlights,
    required List<String> tradeOffs,
  }) {
    final langCode = (_ref.read(localeProvider)?.languageCode ?? 'en')
        .toLowerCase();
    final isTr = langCode == 'tr';
    final firstHighlight = highlights.isNotEmpty ? highlights.first : '';
    final secondHighlight = highlights.length > 1 ? highlights[1] : '';
    final topTradeOff = tradeOffs.isNotEmpty ? tradeOffs.first : '';

    if (isTr) {
      if (firstHighlight.isNotEmpty && secondHighlight.isNotEmpty) {
        final base = '$firstHighlight ve $secondHighlight ile one cikiyor.';
        if (topTradeOff.isNotEmpty) {
          return '$base $topTradeOff ana taviz noktasi olarak dikkat cekiyor.';
        }
        return base;
      }
      if (firstHighlight.isNotEmpty && topTradeOff.isNotEmpty) {
        return '$firstHighlight ile one cikiyor. $topTradeOff ana siniri olarak gorulmeli.';
      }
      if (firstHighlight.isNotEmpty) {
        return '$firstHighlight ile one cikiyor.';
      }
      if (topTradeOff.isNotEmpty) {
        return '$topTradeOff bu urunde dikkat edilmesi gereken ana nokta.';
      }
      return 'Teknik seviye, genel denge ve kategori icindeki konumuyla dikkat ceken bir profil sunuyor.';
    }

    if (firstHighlight.isNotEmpty && secondHighlight.isNotEmpty) {
      final base = '$firstHighlight and $secondHighlight stand out most.';
      if (topTradeOff.isNotEmpty) {
        return '$base $topTradeOff is the main trade-off to keep in mind.';
      }
      return base;
    }
    if (firstHighlight.isNotEmpty && topTradeOff.isNotEmpty) {
      return '$firstHighlight is the main standout. $topTradeOff is the clearest limitation.';
    }
    if (firstHighlight.isNotEmpty) {
      return '$firstHighlight is the clearest standout.';
    }
    if (topTradeOff.isNotEmpty) {
      return '$topTradeOff is the main limitation to keep in mind.';
    }
    return 'It stands out through its overall technical balance and category position.';
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

  List<String> _focusKeywordsForLabel(String label) {
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
