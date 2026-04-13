import 'dart:convert';

import 'package:pocketbase/pocketbase.dart';
import 'package:dio/dio.dart';
import 'package:compair/config/env_config.dart';
import 'package:compair/core/pb_client.dart';
import 'package:compair/domain/entities/product_entity.dart';
import 'package:compair/services/behavior_analysis_service.dart';

class MatchScoreResult {
  final double score;       // 0-100
  final String explanation; // Gemini sentence
  final bool fromCache;

  const MatchScoreResult({
    required this.score,
    required this.explanation,
    this.fromCache = false,
  });
}

class MatchScoreService {
  const MatchScoreService();

  static const _cacheVersion = 4; // v4: admin-controlled algorithm weights

  static Map<String, dynamic>? _algoConfig;
  static DateTime? _algoConfigFetchedAt;

  /// Fetch algorithm config from PocketBase (cached for 10 minutes)
  Future<Map<String, dynamic>> _getAlgoConfig() async {
    if (_algoConfig != null &&
        _algoConfigFetchedAt != null &&
        DateTime.now().difference(_algoConfigFetchedAt!).inMinutes < 10) {
      return _algoConfig!;
    }
    try {
      final record = await pb.collection('app_config').getFirstListItem(
        'key = "algorithm"',
      );
      _algoConfig = record.data;
      _algoConfigFetchedAt = DateTime.now();
      return _algoConfig!;
    } catch (_) {}
    return {};
  }

  Future<MatchScoreResult?> calculate({
    required String uid,
    required ProductEntity product,
  }) async {
    try {
      // ── Step 0: Cache check (1 day + version) ──
      try {
        final cacheResult = await pb.collection('users').getFirstListItem(
          'id = "$uid"',
        );
        final matchCache = (cacheResult.data['match_cache'] as Map<String, dynamic>?) ?? {};
        final productCache = (matchCache[product.id] as Map<String, dynamic>?);
        if (productCache != null) {
          final calculatedAt = DateTime.tryParse(productCache['calculated_at'] ?? '');
          final cachedVersion = productCache['version'] as int? ?? 0;
          if (calculatedAt != null &&
              cachedVersion == _cacheVersion &&
              DateTime.now().difference(calculatedAt).inDays < 1) {
            return MatchScoreResult(
              score: (productCache['score'] as num).toDouble(),
              explanation: productCache['explanation'] as String? ?? '',
              fromCache: true,
            );
          }
        }
      } catch (_) {}

      // ── Step 1: Gather User Context ──

      // Quiz weight vector — if absent, quiz not done → skip
      RecordModel? userRecord;
      try {
        userRecord = await pb.collection('users').getOne(uid);
      } catch (_) {
        return null;
      }

      final weightVector = (userRecord.data['weightVector'] as Map<String, dynamic>?);
      if (weightVector == null) return null;

      final weights = _parseWeights(weightVector);

      // Profile data (ecosystem, budget, priorities, country)
      final ecosystem = userRecord.data['ecosystem'] as String? ?? 'mixed';
      final budgetPref = userRecord.data['budgetRange'] as String?;
      final priorities = List<String>.from(userRecord.data['priorities'] ?? []);
      final userCountry = userRecord.data['country'] as String? ?? 'US';

      // Behavior analysis
      final behaviorProfile =
          await BehaviorAnalysisService().analyzeBehavior(uid);

      // Infer budget from recently viewed product prices
      final avgViewedPrice = await _inferAverageViewedPrice(
        uid: uid,
        recentIds: behaviorProfile.recentlyViewedProductIds,
        userCountry: userCountry,
      );

      // Recent search queries for AI context
      final recentSearches = await _fetchRecentSearches(uid);

      final hasRichBehavior =
          behaviorProfile.recentlyViewedProductIds.length >= 5 ||
              behaviorProfile.strongInterestCategories.isNotEmpty;

      // ── Step 2: Build User Profile String ──
      final userProfileText = _buildUserProfileText(
        weights: weights,
        behaviorProfile: behaviorProfile,
        ecosystem: ecosystem,
        budgetPref: budgetPref,
        priorities: priorities,
        avgViewedPrice: avgViewedPrice,
        recentSearches: recentSearches,
      );

      // ── Step 3: Build Product Summary ──
      final productPrice =
          product.prices[userCountry] ?? product.prices.values.firstOrNull;
      final productText = _buildProductText(product, productPrice);

      // Fetch admin algorithm config
      final algoConfig = await _getAlgoConfig();

      // ── Step 4: Heuristic Fallback Score ──
      final heuristicScore = _computeHeuristicScore(
        weights: weights,
        behaviorProfile: behaviorProfile,
        product: product,
        ecosystem: ecosystem,
        budgetPref: budgetPref,
        productPrice: productPrice,
        avgViewedPrice: avgViewedPrice,
        algoConfig: algoConfig,
      );

      // ── Step 5: AI Scoring ──
      final aiResult = await _getAiScore(
        userProfileText: userProfileText,
        productText: productText,
      );

      double finalScore;
      String explanation;

      if (aiResult != null) {
        final aiScore = aiResult.score.clamp(0.0, 100.0);
        final aiReason = aiResult.reason;

        // Blend AI vs heuristic based on behavior richness
        if (hasRichBehavior) {
          finalScore = aiScore * 0.8 + heuristicScore * 0.2;
        } else {
          finalScore = aiScore * 0.5 + heuristicScore * 0.5;
        }

        explanation = aiReason;
      } else {
        // AI unavailable — use heuristic only
        finalScore = heuristicScore;
        explanation = _heuristicExplanation(heuristicScore.round());
      }

      // ── Step 6: Algorithmic Guardrails ──

      // Budget penalty: if price > 2x user's average viewed price, cap at 55
      if (avgViewedPrice != null &&
          avgViewedPrice > 0 &&
          productPrice != null &&
          productPrice > avgViewedPrice * 2) {
        finalScore = finalScore.clamp(0.0, 55.0);
      }

      // Category bonus (stronger for interested categories)
      if (behaviorProfile.strongInterestCategories.any((c) =>
          product.category.toLowerCase().contains(c) ||
          c.contains(product.category.toLowerCase()))) {
        finalScore += 8;
      }

      finalScore = finalScore.clamp(0.0, 100.0);

      final result =
          MatchScoreResult(score: finalScore, explanation: explanation);

      // ── Step 7: Cache ──
      try {
        // Store match cache as a field on the user record
        final existingCache = (userRecord?.data['match_cache'] as Map<String, dynamic>?) ?? {};
        existingCache[product.id] = {
          'score': finalScore,
          'explanation': explanation,
          'calculated_at': DateTime.now().toIso8601String(),
          'product_id': product.id,
          'version': _cacheVersion,
        };
        await pb.collection('users').update(uid, body: {'match_cache': existingCache});
      } catch (_) {}

      return result;
    } catch (_) {
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // User profile helpers
  // ─────────────────────────────────────────────────────────────────────────

  String _buildUserProfileText({
    required Map<String, double> weights,
    required BehaviorProfile behaviorProfile,
    required String ecosystem,
    required String? budgetPref,
    required List<String> priorities,
    required double? avgViewedPrice,
    required List<String> recentSearches,
  }) {
    final buf = StringBuffer();

    // Stated preferences
    final topWeights = weights.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    final top5 =
        topWeights.take(5).map((e) => '${e.key}: ${e.value.toStringAsFixed(2)}');
    buf.writeln('Stated priority weights (top 5): ${top5.join(', ')}');

    if (priorities.isNotEmpty) {
      buf.writeln('Explicit priorities: ${priorities.take(3).join(', ')}');
    }

    // Ecosystem
    buf.writeln('Ecosystem preference: $ecosystem');

    // Budget
    if (budgetPref != null) {
      buf.writeln('Budget preference: $budgetPref');
    }
    if (avgViewedPrice != null && avgViewedPrice > 0) {
      buf.writeln(
          'Average price of recently viewed products: \$${avgViewedPrice.toStringAsFixed(0)}');
    }

    // Behavioral signals
    if (behaviorProfile.strongInterestCategories.isNotEmpty) {
      buf.writeln(
          'Strong interest categories: ${behaviorProfile.strongInterestCategories.join(', ')}');
    }

    final catScores = behaviorProfile.categoryInterestScores.entries
        .where((e) => e.value > 0.3)
        .toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    if (catScores.isNotEmpty) {
      final catText = catScores
          .take(5)
          .map((e) => '${e.key}: ${e.value.toStringAsFixed(2)}');
      buf.writeln('Category interest scores: ${catText.join(', ')}');
    }

    buf.writeln(
        'Purchase intent: ${behaviorProfile.purchaseIntentScore.toStringAsFixed(2)}');
    buf.writeln(
        'Products recently viewed: ${behaviorProfile.recentlyViewedProductIds.length}');

    if (recentSearches.isNotEmpty) {
      buf.writeln('Recent searches: ${recentSearches.take(5).join(', ')}');
    }

    return buf.toString().trim();
  }

  String _buildProductText(ProductEntity product, double? price) {
    final buf = StringBuffer();
    buf.writeln('Name: ${product.name}');
    buf.writeln('Brand: ${product.brand ?? 'Unknown'}');
    buf.writeln('Category: ${product.category}');
    buf.writeln('Subcategory: ${product.subcategory}');
    if (price != null) {
      buf.writeln('Price: \$${price.toStringAsFixed(0)}');
    }
    buf.writeln('Tech Score: ${product.techScore.toStringAsFixed(0)}/100');

    // Key specs (top 8)
    final keySpecs = product.keySpecs.entries.take(8);
    if (keySpecs.isNotEmpty) {
      buf.writeln(
          'Key Specs: ${keySpecs.map((e) => '${e.key}: ${e.value}').join(', ')}');
    }

    if (product.pros.isNotEmpty) {
      buf.writeln('Pros: ${product.pros.take(3).join('; ')}');
    }
    if (product.cons.isNotEmpty) {
      buf.writeln('Cons: ${product.cons.take(3).join('; ')}');
    }

    return buf.toString().trim();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AI Scoring via Gemini
  // ─────────────────────────────────────────────────────────────────────────

  Future<_AiScoreResult?> _getAiScore({
    required String userProfileText,
    required String productText,
  }) async {
    try {
      final apiKey = EnvConfig.geminiApiKey;
      if (apiKey.isEmpty) return null;

      final prompt = '''Given this user profile:
$userProfileText

And this product:
$productText

Rate the match on a scale of 0-100 considering:
1. How well product specs align with the stated priorities
2. Price vs apparent budget
3. Category relevance to browsing history
4. Brand/ecosystem compatibility
5. Technical quality relative to performance needs

IMPORTANT for the "reason" field: Address the user directly in second person. Use "you/your" NOT "the user/user's/their".
Example: "Your budget and ecosystem preference make this an excellent fit."

Respond ONLY with a JSON object: {"score": <0-100>, "reason": "<one sentence max 15 words, second person>"}''';

      final dio = Dio();
      final response = await dio.post(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$apiKey',
        options: Options(
          sendTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 15),
        ),
        data: {
          'contents': [
            {
              'parts': [
                {'text': prompt}
              ]
            }
          ],
          'generationConfig': {
            'temperature': 0.2,
            'maxOutputTokens': 128,
            'responseMimeType': 'application/json',
          },
        },
      );

      final text = response.data['candidates']?[0]?['content']?['parts']?[0]
          ?['text'] as String?;
      if (text == null || text.trim().isEmpty) return null;

      return _parseAiResponse(text.trim());
    } catch (_) {
      return null;
    }
  }

  _AiScoreResult? _parseAiResponse(String responseText) {
    // Try JSON parse first
    try {
      final json = jsonDecode(responseText) as Map<String, dynamic>;
      final score = (json['score'] as num?)?.toDouble();
      final reason = json['reason'] as String?;
      if (score != null) {
        return _AiScoreResult(
          score: score,
          reason: reason ?? _heuristicExplanation(score.round()),
        );
      }
    } catch (_) {
      // JSON parse failed — try regex fallback
    }

    // Regex fallback
    final scoreMatch =
        RegExp(r'"score"\s*:\s*(\d+(?:\.\d+)?)').firstMatch(responseText);
    final reasonMatch =
        RegExp(r'"reason"\s*:\s*"([^"]+)"').firstMatch(responseText);

    if (scoreMatch != null) {
      final score = double.tryParse(scoreMatch.group(1) ?? '');
      if (score != null) {
        return _AiScoreResult(
          score: score,
          reason: reasonMatch?.group(1) ?? _heuristicExplanation(score.round()),
        );
      }
    }

    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Heuristic Score (fallback + blending component)
  // ─────────────────────────────────────────────────────────────────────────

  double _computeHeuristicScore({
    required Map<String, double> weights,
    required BehaviorProfile behaviorProfile,
    required ProductEntity product,
    required String ecosystem,
    required String? budgetPref,
    required double? productPrice,
    required double? avgViewedPrice,
    Map<String, dynamic> algoConfig = const {},
  }) {
    // Read admin-configured boosts (percentages → decimals)
    final boosts = algoConfig['boosts'] as Map<String, dynamic>? ?? {};
    final ecosystemBonus = ((boosts['ecosystem'] as num?)?.toDouble() ?? 18) / 100;
    final budgetBonus = ((boosts['budget'] as num?)?.toDouble() ?? 15) / 100;
    final categoryBonus = ((boosts['categoryView'] as num?)?.toDouble() ?? 12) / 100;
    final quizBonus = ((boosts['quiz'] as num?)?.toDouble() ?? 15) / 100;
    // Adjust weights with behavior data
    final adjustedWeights = Map<String, double>.from(weights);
    for (final entry in behaviorProfile.behaviorWeightAdjustments.entries) {
      final current = adjustedWeights[entry.key] ?? 0.5;
      adjustedWeights[entry.key] = (current + entry.value).clamp(0.0, 1.0);
    }

    // Tech score contribution (0-1)
    final techNormalized = (product.techScore / 100).clamp(0.0, 1.0);

    // Weighted average of user priorities vs tech quality
    double sum = 0;
    double wSum = 0;
    for (final entry in adjustedWeights.entries) {
      sum += entry.value * techNormalized;
      wSum += entry.value;
    }
    double base = wSum > 0 ? sum / wSum : 0.5;

    // ── Ecosystem bonus/malus (admin-configurable) ──
    final brand = (product.brand ?? '').toLowerCase();
    if (ecosystem == 'apple') {
      if (brand == 'apple') {
        base += ecosystemBonus;
      } else if ({'samsung', 'google', 'oneplus', 'xiaomi'}.contains(brand)) {
        base -= ecosystemBonus * 0.22;
      } else {
        base -= ecosystemBonus * 0.55;
      }
    } else if (ecosystem == 'android') {
      if ({'samsung', 'google', 'oneplus', 'xiaomi', 'oppo', 'realme'}.contains(brand)) {
        base += ecosystemBonus * 0.78;
      } else if (brand == 'apple') {
        base -= ecosystemBonus * 0.44;
      }
    }

    // ── Price segment match (admin-configurable) ──
    final priceSegment = product.specs['price_segment'] as String?;
    if (priceSegment != null && budgetPref != null) {
      final segments = ['budget', 'mid_range', 'premium', 'flagship'];
      final userIdx = segments.indexOf(budgetPref);
      final prodIdx = segments.indexOf(priceSegment);
      if (userIdx >= 0 && prodIdx >= 0) {
        final diff = (userIdx - prodIdx).abs();
        if (diff == 0) {
          base += budgetBonus;
        } else if (diff == 1) {
          base += budgetBonus * 0.27;
        } else if (diff == 2) {
          base -= budgetBonus * 0.80;
        } else {
          base -= budgetBonus * 1.47;
        }
      }
    }

    // ── Price ratio penalty from viewed products (stronger) ──
    if (avgViewedPrice != null &&
        avgViewedPrice > 0 &&
        productPrice != null) {
      final ratio = productPrice / avgViewedPrice;
      if (ratio > 2.5) {
        base -= 0.25; // Way over budget
      } else if (ratio > 2.0) {
        base -= 0.18;
      } else if (ratio > 1.5) {
        base -= 0.10;
      } else if (ratio >= 0.8 && ratio <= 1.2) {
        base += 0.08; // Sweet spot — close to user's price range
      } else if (ratio < 0.5) {
        base += 0.02; // Much cheaper — slight positive
      }
    }

    // ── Category interest bonus (admin-configurable) ──
    final productCat = product.category.toLowerCase();
    if (behaviorProfile.strongInterestCategories.any((c) =>
        productCat.contains(c) || c.contains(productCat))) {
      base += categoryBonus;
    } else if (behaviorProfile.categoryInterestScores.entries
        .any((e) => e.value >= 0.3 && (productCat.contains(e.key) || e.key.contains(productCat)))) {
      base += categoryBonus * 0.40;
    }

    // ── Quiz-based boost ──
    if (behaviorProfile.behaviorWeightAdjustments.isNotEmpty) {
      base += quizBonus * 0.5;
    }

    // ── Recently viewed boost ──
    if (behaviorProfile.recentlyViewedProductIds.contains(product.id)) {
      base += 0.05;
    }

    // ── Purchase intent signal ──
    if (behaviorProfile.purchaseIntentScore > 0.5 &&
        behaviorProfile.strongInterestCategories.any((c) =>
            productCat.contains(c) || c.contains(productCat))) {
      base += 0.07; // User actively shopping in this category
    }

    // Scale to 0-100 with real spread (no soft-centering)
    return (base * 100).clamp(0.0, 100.0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Data Fetching
  // ─────────────────────────────────────────────────────────────────────────

  /// Infer average price from recently viewed products.
  Future<double?> _inferAverageViewedPrice({
    required String uid,
    required List<String> recentIds,
    required String userCountry,
  }) async {
    if (recentIds.isEmpty) return null;

    try {
      final idsToCheck = recentIds.take(20).toList();
      final prices = <double>[];

      // Batch fetch in groups of 20
      for (var i = 0; i < idsToCheck.length; i += 20) {
        final batch = idsToCheck.sublist(
            i, i + 20 > idsToCheck.length ? idsToCheck.length : i + 20);
        final filter = batch.map((id) => 'id = "$id"').join(' || ');
        final result = await pb.collection('products').getFullList(filter: filter);

        for (final record in result) {
          final pricesMap = record.data['prices'] as Map<String, dynamic>?;
          if (pricesMap != null) {
            final price = (pricesMap[userCountry] as num?)?.toDouble() ??
                (pricesMap.values.firstOrNull as num?)?.toDouble();
            if (price != null && price > 0) {
              prices.add(price);
            }
          }
        }
      }

      if (prices.isEmpty) return null;
      return prices.reduce((a, b) => a + b) / prices.length;
    } catch (_) {
      return null;
    }
  }

  /// Fetch recent search queries from behavior data.
  Future<List<String>> _fetchRecentSearches(String uid) async {
    // TODO: Implement with PocketBase behavior tracking
    return [];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Weights
  // ─────────────────────────────────────────────────────────────────────────

  Map<String, double> _parseWeights(Map<String, dynamic>? data) {
    if (data == null) {
      return {
        'performance': 0.7, 'battery': 0.6, 'camera': 0.5, 'display': 0.6,
        'portability': 0.5, 'price_sensitivity': 0.5, 'ecosystem_lock': 0.3,
        'gaming': 0.3, 'content_consumption': 0.6, 'productivity': 0.5,
        'build_quality': 0.6, 'audio_quality': 0.4,
      };
    }
    return {
      'performance': _toDouble(data['performance'], 0.7),
      'battery': _toDouble(data['battery'], 0.6),
      'camera': _toDouble(data['camera'], 0.5),
      'display': _toDouble(data['display'], 0.6),
      'portability': _toDouble(data['portability'], 0.5),
      'price_sensitivity': _toDouble(data['price_sensitivity'], 0.5),
      'ecosystem_lock': _toDouble(data['ecosystem_lock'], 0.3),
      'gaming': _toDouble(data['gaming'], 0.3),
      'content_consumption': _toDouble(data['content_consumption'], 0.6),
      'productivity': _toDouble(data['productivity'], 0.5),
      'build_quality': _toDouble(data['build_quality'], 0.6),
      'audio_quality': _toDouble(data['audio_quality'], 0.4),
    };
  }

  double _toDouble(dynamic v, double fallback) {
    if (v is num) return v.toDouble().clamp(0.0, 1.0);
    return fallback;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Explanation Fallback
  // ─────────────────────────────────────────────────────────────────────────

  String _heuristicExplanation(int score) {
    if (score >= 90) return 'Perfect match — this product is tailor-made for your needs.';
    if (score >= 80) return 'Excellent match for your preferences and ecosystem.';
    if (score >= 70) return 'Great fit across most of your stated priorities.';
    if (score >= 55) return 'Good match with a few trade-offs to consider.';
    if (score >= 40) return 'Partially matches your preferences — some compromises.';
    if (score >= 25) return 'Not the best fit for your stated priorities.';
    return 'Significant mismatch with your preferences and budget.';
  }
}

/// Internal result from AI scoring.
class _AiScoreResult {
  final double score;
  final String reason;

  const _AiScoreResult({required this.score, required this.reason});
}
