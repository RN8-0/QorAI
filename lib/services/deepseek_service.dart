/// Compair - DeepSeek AI Service (Text-based Intelligence)
///
/// Handles ALL text-only AI tasks. Gemini is used ONLY for:
///   - Google Search grounding (groundedQuery, enhancedSubscriptionAnalysis)
///   - Vision / image analysis (analyzeImage)
///
/// Model : deepseek-chat (V3)
/// Cost  : ~$0.27/1M input, ~$1.10/1M output (much cheaper than Gemini)
/// Endpoint: PocketBase proxy — $kPbBaseUrl/api/ai/deepseek
///           (pb_hooks/deepseek.pb.js forwards to DeepSeek API,
///            key never leaves the server).
library;

import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:compair/core/constants.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/core/pb_client.dart';
import 'package:compair/domain/entities/ai_entities.dart';
import 'package:compair/domain/entities/user_entity.dart';
import 'package:compair/services/ai_service.dart';
import 'package:compair/services/cache_service.dart';

/// DeepSeek V3 service — handles all text-based AI tasks for Compair.
/// Primary AI provider. Gemini is used ONLY for vision + web grounding.
class DeepSeekService implements AIService {
  final Dio _dio;
  final CacheService _cacheService;

  static const _proxyUrl = '$kPbBaseUrl/api/ai/deepseek';
  static const _model = 'deepseek-chat';

  DeepSeekService({
    required Dio dio,
    required CacheService cacheService,
  })  : _dio = dio,
        _cacheService = cacheService;

  // ─────────────────────────────────────────────────────────────────────────
  //  PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────

  /// Compare 2+ products side by side.
  @override
  Future<ComparisonResult> compare(CompareRequest req) async {
    final cacheKey = 'ds_cmp_${req.productIds.join('_')}_${req.country}';
    final cached = await _cacheService.get<Map<String, dynamic>>(cacheKey);
    if (cached != null) return _parseComparisonResult(cached);

    final lang = req.userProfile['language'] as String? ?? 'en';
    final response = await _jsonRequest(
      system: _comparisonSystemPrompt(lang),
      user: jsonEncode({
        'products': req.productIds,
        'userProfile': req.userProfile,
        'country': req.country,
        'category': req.category,
      }),
    );

    await _cacheService.set(cacheKey, response,
        duration: AppConstants.productCacheDuration);
    return _parseComparisonResult(response);
  }

  /// Generate personalized product recommendations.
  @override
  Future<RecommendationResult> recommend(RecommendRequest req) async {
    final cacheKey = 'ds_rec_${req.category}_${req.country}';
    final cached = await _cacheService.get<Map<String, dynamic>>(cacheKey);
    if (cached != null) return _parseRecommendationResult(cached);

    final lang = req.userProfile['language'] as String? ?? 'en';
    final langName = _languageName(lang);
    final response = await _jsonRequest(
      system:
          'You are Compair AI recommendation engine. '
          'Suggest the best products based on the user profile. '
          'Write the "reason" field in $langName. '
          'Return JSON: {"recommendations":[{"productId":"…","score":0-100,"reason":"…"}]}',
      user: jsonEncode({
        'userProfile': req.userProfile,
        'category': req.category,
        'country': req.country,
        'limit': req.limit,
      }),
    );

    await _cacheService.set(cacheKey, response,
        duration: AppConstants.trendCacheDuration);
    return _parseRecommendationResult(response);
  }

  /// Analyze a product URL against the user profile.
  @override
  Future<LinkAnalysisResult> analyzeLink(String url, UserEntity profile) async {
    debugPrint('[DeepSeek] analyzeLink called for: $url');
    final response = await _jsonRequest(
      system: _linkAnalysisSystemPrompt(profile.language),
      user: jsonEncode({
        'url': url,
        'userProfile': {
          'ecosystem': profile.ecosystem,
          'budgetRange': profile.budgetRange,
          'priorities': profile.priorities,
          'country': profile.country,
        },
      }),
      timeout: const Duration(seconds: 60),
    );

    return LinkAnalysisResult(
      url: url,
      metadata: OgMetadata(
        title: response['title'] as String?,
        image: response['image_url'] as String?,
        price: response['price'] as String?,
        siteName: response['site_name'] as String?,
      ),
      aiScore: (response['score'] as num?)?.toDouble() ?? 0.0,
      aiAnalysis: response['analysis'] as String? ?? '',
      category: response['category'] as String?,
      analyzedAt: DateTime.now(),
    );
  }

  /// Calculate a single-product compatibility score.
  @override
  Future<double> calculateScore(ScoreRequest req) async {
    final response = await _jsonRequest(
      system:
          'Calculate a product compatibility score (0-100) for the given '
          'user profile. Return JSON: {"score": <number>}',
      user: jsonEncode({
        'product': req.productData,
        'userProfile': req.userProfile,
        'country': req.country,
      }),
    );
    return (response['score'] as num?)?.toDouble() ?? 0.0;
  }

  /// Natural-language question answering (single-turn).
  @override
  Future<String> askQuestion(String question, UserEntity profile) async {
    final currentYear = DateTime.now().year;
    final response = await _jsonRequest(
      system: _chatSystemPrompt(profile, currentYear),
      user: question,
    );
    return jsonEncode(response);
  }

  /// Multi-turn conversational chat.
  Future<String> chatConversation(
    List<Map<String, String>> messages,
    UserEntity profile,
  ) async {
    final currentYear = DateTime.now().year;

    final apiMessages = <Map<String, String>>[
      {'role': 'system', 'content': _chatSystemPrompt(profile, currentYear)},
      ...messages.map((m) {
            final role = m['role'] == 'user' ? 'user' : 'assistant';
            return {'role': role, 'content': m['text'] ?? ''};
          }),
    ];

    return _rawRequest(apiMessages);
  }

  /// Streaming multi-turn chat — yields text chunks as they arrive.
  /// DeepSeek supports SSE streaming natively.
  Stream<String> chatConversationStream(
    List<Map<String, String>> messages,
    UserEntity profile,
  ) async* {
    final currentYear = DateTime.now().year;

    final apiMessages = <Map<String, String>>[
      {'role': 'system', 'content': _chatSystemPrompt(profile, currentYear)},
      ...messages.map((m) {
            final role = m['role'] == 'user' ? 'user' : 'assistant';
            return {'role': role, 'content': m['text'] ?? ''};
          }),
    ];

    // PB proxy doesn't support SSE passthrough, so fall back to single-shot
    try {
      final text = await _rawRequest(
        apiMessages,
        timeout: const Duration(seconds: 60),
      );
      if (text.isNotEmpty) yield text;
    } catch (e) {
      throw AIServiceException(message: 'Chat failed: $e');
    }
  }

  /// Simple text-in / text-out query.
  Future<String> freeTextQuery(
    String prompt, {
    String? language,
  }) async {
    final langCode = language ?? 'en';
    final langName = _languageName(langCode);
    final systemMsg = langCode != 'en'
        ? 'IMPORTANT: You MUST respond entirely in $langName. All text, analysis, recommendations must be in $langName.'
        : 'You are a helpful AI assistant. Be concise and informative.';

    return _rawRequest([
      {'role': 'system', 'content': systemMsg},
      {'role': 'user', 'content': prompt},
    ]);
  }

  /// JSON-enforced free text query.
  Future<String> jsonFreeTextQuery(
    String prompt, {
    String? language,
    int maxTokens = 2048,
  }) async {
    final langCode = language ?? 'en';
    final langName = _languageName(langCode);
    final systemText = langCode != 'en'
        ? 'IMPORTANT: You MUST respond entirely in $langName. Return only valid JSON.'
        : 'Return only valid JSON with no markdown, no extra text.';

    return _rawRequest(
      [
        {'role': 'system', 'content': systemText},
        {'role': 'user', 'content': prompt},
      ],
      maxTokens: maxTokens,
      temperature: 0.3,
      jsonMode: true,
    );
  }

  /// Generate a personalized quiz for a product category.
  Future<ProductQuiz> generateQuiz({
    required String category,
    required String productTitle,
    required String url,
    String language = 'en',
  }) async {
    debugPrint('[DeepSeek] generateQuiz for: $productTitle ($category)');
    final response = await _jsonRequest(
      system: _quizGenerationPrompt(language),
      user: jsonEncode({
        'category': category,
        'productTitle': productTitle,
        'url': url,
      }),
      timeout: const Duration(seconds: 45),
    );

    final questions = (response['questions'] as List<dynamic>? ?? [])
        .asMap()
        .entries
        .map(
          (e) => QuizQuestion(
            id: 'q${e.key}',
            text: e.value['question'] as String? ?? '',
            options: List<String>.from(e.value['options'] ?? []),
          ),
        )
        .where((q) => q.text.isNotEmpty && q.options.length >= 2)
        .toList();

    debugPrint('[DeepSeek] generateQuiz got ${questions.length} questions');
    return ProductQuiz(
      id: '${category}_${DateTime.now().millisecondsSinceEpoch}',
      category: category,
      productTitle: productTitle,
      questions: questions,
      createdAt: DateTime.now(),
    );
  }

  /// Generate a personalized quiz for subscription analysis.
  Future<ProductQuiz> generateSubscriptionQuiz({
    required List<String> subscriptionNames,
    String language = 'en',
  }) async {
    final langName = _languageName(language);
    final names = subscriptionNames.join(', ');
    final isCompare = subscriptionNames.length > 1;

    final response = await _jsonRequest(
      system: '''
You are Compair's subscription quiz engine. Generate a SHORT personalized quiz
(4-5 questions) to understand the user's needs for: $names.

LANGUAGE: Generate ALL questions and options in $langName.

The goal: understand how the user uses ${isCompare ? 'these services' : 'this service'},
their specific habits, preferences, and expectations.

Rules:
- Questions must be relevant to the specific service type
- Each question has exactly 4 options
- Keep questions conversational with emoji
- NEVER ask about budget
- NEVER ask about brand preference
- ALL text must be in $langName

Return valid JSON:
{
  "questions": [
    {"question": "...", "options": ["...", "...", "...", "..."]},
    ...
  ]
}
''',
      user: jsonEncode({
        'subscriptions': subscriptionNames,
        'mode': isCompare ? 'compare' : 'single',
      }),
    );

    final questions = (response['questions'] as List<dynamic>? ?? [])
        .asMap()
        .entries
        .map(
          (e) => QuizQuestion(
            id: 'sq${e.key}',
            text: e.value['question'] as String? ?? '',
            options: List<String>.from(e.value['options'] ?? []),
          ),
        )
        .where((q) => q.text.isNotEmpty && q.options.length >= 2)
        .toList();

    return ProductQuiz(
      id: 'sub_${DateTime.now().millisecondsSinceEpoch}',
      category: 'subscription',
      productTitle: names,
      questions: questions,
      createdAt: DateTime.now(),
    );
  }

  /// Produce an enhanced compatibility analysis.
  Future<EnhancedAnalysisResult> enhancedAnalysis({
    required LinkAnalysisResult baseResult,
    required List<QuizQuestion> answeredQuestions,
    required UserEntity profile,
  }) async {
    debugPrint('[DeepSeek] enhancedAnalysis for: ${baseResult.metadata.title}');
    final qaPairs = answeredQuestions
        .where((q) => q.selectedOption != null)
        .map((q) => {'question': q.text, 'answer': q.selectedOption})
        .toList();

    final response = await _jsonRequest(
      system: _enhancedAnalysisPrompt(profile.language),
      user: jsonEncode({
        'product': {
          'url': baseResult.url,
          'title': baseResult.metadata.title,
          'description': baseResult.metadata.description,
          'category': baseResult.category,
          'initialScore': baseResult.aiScore,
          'initialAnalysis': baseResult.aiAnalysis,
        },
        'quizAnswers': qaPairs,
        'userProfile': {
          'ecosystem': profile.ecosystem,
          'budgetRange': profile.budgetRange,
          'priorities': profile.priorities,
          'country': profile.country,
          'ageRange': profile.effectiveAgeRange,
          'interestCategories': profile.interestCategories,
          'currentDevices': profile.currentDevices,
        },
      }),
      timeout: const Duration(seconds: 60),
    );

    double parseScore(dynamic v) {
      if (v is num) return v.toDouble();
      if (v is String) return double.tryParse(v) ?? 0.0;
      return 0.0;
    }

    final rawFactors = response['factors'];
    final factors = (rawFactors is List ? rawFactors : <dynamic>[])
        .map((f) {
          if (f is! Map) return null;
          final label = (f['label'] ?? f['name'] ?? '') as String;
          final score = parseScore(f['score'] ?? f['value']);
          final emoji = (f['emoji'] ?? f['icon'] ?? '📊') as String;
          return CompatibilityFactor(label: label, score: score, emoji: emoji);
        })
        .whereType<CompatibilityFactor>()
        .where((f) => f.label.isNotEmpty)
        .toList();

    final enhancedScore = parseScore(
      response['enhancedScore'] ??
          response['enhanced_score'] ??
          response['score'],
    );

    return EnhancedAnalysisResult(
      baseResult: baseResult,
      enhancedScore: enhancedScore > 0 ? enhancedScore : baseResult.aiScore,
      factors: factors,
      detailedVerdict:
          (response['verdict'] ??
                  response['detailed_verdict'] ??
                  response['analysis'] ??
                  baseResult.aiAnalysis)
              as String,
      prosForUser: List<String>.from(
        response['prosForUser'] ??
            response['pros_for_user'] ??
            response['pros'] ??
            [],
      ),
      consForUser: List<String>.from(
        response['consForUser'] ??
            response['cons_for_user'] ??
            response['cons'] ??
            [],
      ),
      alternatives: List<String>.from(response['alternatives'] ?? []),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  INTERNAL — HTTP helpers (OpenAI-compatible format)
  // ─────────────────────────────────────────────────────────────────────────

  /// Make a request that expects a JSON object back.
  Future<Map<String, dynamic>> _jsonRequest({
    required String system,
    required String user,
    Duration? timeout,
  }) async {
    final text = await _rawRequest(
      [
        {'role': 'system', 'content': system},
        {'role': 'user', 'content': user},
      ],
      timeout: timeout ?? const Duration(seconds: 60),
      jsonMode: true,
    );

    try {
      return jsonDecode(text) as Map<String, dynamic>;
    } catch (e) {
      debugPrint('[DeepSeek] JSON parse error: $e — raw: ${text.length > 500 ? text.substring(0, 500) : text}');
      final match = RegExp(r'\{.*\}', dotAll: true).firstMatch(text);
      if (match != null) {
        try {
          return jsonDecode(match.group(0)!) as Map<String, dynamic>;
        } catch (_) {}
      }
      return {'message': text, 'options': <String>[]};
    }
  }

  /// Low-level POST against the PocketBase DeepSeek proxy with retry.
  Future<String> _rawRequest(
    List<Map<String, String>> messages, {
    Duration timeout = const Duration(seconds: 60),
    int maxTokens = 4096,
    double temperature = 0.7,
    bool jsonMode = false,
  }) async {
    int retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        final body = <String, dynamic>{
          'model': _model,
          'messages': messages,
          'max_tokens': maxTokens,
          'temperature': temperature,
        };
        if (jsonMode) {
          body['response_format'] = {'type': 'json_object'};
        }

        final response = await _dio.post(
          _proxyUrl,
          data: body,
          options: Options(
            receiveTimeout: timeout,
            sendTimeout: const Duration(seconds: 15),
            headers: {'Content-Type': 'application/json'},
          ),
        );

        // Handle PB proxy error responses
        if (response.data is Map && response.data['error'] != null) {
          final error = response.data['error'] as String;
          if (error == 'rate_limited') {
            throw const AIServiceException(
              message: 'AI is busy right now. Please try again shortly.',
              isRateLimited: true,
            );
          }
          throw AIServiceException(message: 'DeepSeek error: $error');
        }

        // Parse OpenAI-compatible response
        final choices = response.data['choices'] as List?;
        if (choices == null || choices.isEmpty) {
          debugPrint('[DeepSeek] Empty choices. Full response: ${response.data}');
          throw const AIServiceException(
            message: 'AI returned an empty response.',
          );
        }

        final content =
            choices[0]['message']?['content'] as String? ?? '';
        if (content.isEmpty) {
          throw const AIServiceException(message: 'AI returned no content.');
        }

        debugPrint('[DeepSeek] ✅ Request succeeded. Content length: ${content.length}');
        return content;
      } on DioException catch (e) {
        final statusCode = e.response?.statusCode;
        debugPrint(
          '[DeepSeek] DioException (attempt ${retryCount + 1}/$maxRetries): '
          'status=$statusCode, type=${e.type}',
        );

        if (statusCode == 429) {
          throw const AIServiceException(
            message: 'AI is busy right now. Please try again shortly.',
            isRateLimited: true,
          );
        }

        if (statusCode == 400 || statusCode == 403 || statusCode == 404) {
          String detail = 'AI request failed (HTTP $statusCode).';
          if (e.response?.data is Map) {
            final errorMsg =
                e.response?.data['error']?['message'] as String?;
            if (errorMsg != null) detail = errorMsg;
          }
          throw AIServiceException(message: detail);
        }

        retryCount++;
        if (retryCount < maxRetries) {
          await Future.delayed(AppConstants.retryDelays[retryCount - 1]);
        }
      } on AIServiceException {
        rethrow;
      } catch (e) {
        debugPrint('[DeepSeek] Unexpected error (attempt ${retryCount + 1}/$maxRetries): $e');
        retryCount++;
        if (retryCount < maxRetries) {
          await Future.delayed(AppConstants.retryDelays[retryCount - 1]);
        }
      }
    }

    throw const AIServiceException(
      message: 'AI service is temporarily unavailable.',
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  RESULT PARSERS
  // ─────────────────────────────────────────────────────────────────────────

  ComparisonResult _parseComparisonResult(Map<String, dynamic> data) {
    final scoresData = data['scores'] as Map<String, dynamic>? ?? {};
    final scores = scoresData.map((key, value) {
      final m = value as Map<String, dynamic>;
      return MapEntry(
        key,
        ProductScore(
          productId: key,
          totalScore: (m['totalScore'] as num?)?.toDouble() ?? 0.0,
          personalFit: (m['personalFit'] as num?)?.toDouble() ?? 0.0,
          community: (m['community'] as num?)?.toDouble() ?? 0.0,
          expert: (m['expert'] as num?)?.toDouble() ?? 0.0,
          valuePrice: (m['valuePrice'] as num?)?.toDouble() ?? 0.0,
          pros: List<String>.from(m['pros'] ?? []),
          cons: List<String>.from(m['cons'] ?? []),
        ),
      );
    });

    return ComparisonResult(
      scores: scores,
      analysis: data['analysis'] ?? '',
      winnerId: data['winner'],
      generatedAt: DateTime.now(),
    );
  }

  RecommendationResult _parseRecommendationResult(Map<String, dynamic> data) {
    final items = (data['recommendations'] as List<dynamic>? ?? [])
        .map((e) => RecommendedProduct(
              productId: e['productId'] ?? '',
              score: (e['score'] as num?)?.toDouble() ?? 0.0,
              reason: e['reason'] ?? '',
            ))
        .toList();

    return RecommendationResult(
      recommendations: items,
      generatedAt: DateTime.now(),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  SYSTEM PROMPTS (identical to GeminiService for consistency)
  // ─────────────────────────────────────────────────────────────────────────

  static String _comparisonSystemPrompt(String language) {
    final langName = _languageName(language);
    return '''
You are the Compair AI comparison engine. You receive a list of product IDs,
user profile data and their country. Your job is to produce a deep, fair,
spec-by-spec comparison and pick a winner based on the user's priorities.

LANGUAGE: You MUST write ALL text (analysis, pros, cons) in $langName.

Return valid JSON:
{
  "scores": {
    "<productId>": {
      "totalScore": 0-100,
      "personalFit": 0-100,
      "community": 0-100,
      "expert": 0-100,
      "valuePrice": 0-100,
      "pros": ["...", "..."],
      "cons": ["...", "..."]
    }
  },
  "analysis": "Detailed markdown comparison text in $langName",
  "winner": "<productId>"
}
''';
  }

  static String _linkAnalysisSystemPrompt(String language) {
    final langName = _languageName(language);
    return '''
You are Compair's link analysis engine. Given a product URL and user profile,
analyze the product and compute a personalized compatibility score.

LANGUAGE: You MUST write the "analysis" field in $langName.

SCORING RULES:
- Score reflects how well this product fits the user's profile and needs
- Consider the user's ecosystem, budget, priorities, and country
- Score range: 20-95 (never 0 or 100, be realistic)

Return valid JSON:
{
  "score": 20-95,
  "analysis": "Detailed analysis in $langName",
  "category": "product category",
  "title": "Product name/title",
  "image_url": "Product image URL if known",
  "price": "Price with currency symbol",
  "site_name": "Store/site name"
}
''';
  }

  static String _chatSystemPrompt(UserEntity profile, int currentYear) => '''
You are Compair AI — a witty, knowledgeable tech consultant and the user's friendly advisor.

## YOUR PERSONALITY
- Warm, conversational, occasionally humorous — a smart tech buddy
- Use emoji naturally (not excessively)
- Be honest about product weaknesses
- Keep responses concise (max 3-4 short paragraphs)

## USER PROFILE
- Ecosystem: ${profile.ecosystem}
- Budget: ${profile.budgetRange}
- Priorities: ${profile.priorities.join(', ')}
- Country: ${profile.country}
- Profession: ${profile.profession}

## PAGE AWARENESS
You can see what the user is currently looking at. When context mentions a specific product, use that information proactively.

## CONVERSATION FLOW
When asked general questions, ask clarifying questions ONE AT A TIME before making recommendations. Use the user's profile to skip obvious questions.

## LANGUAGE
- User's preferred language: ${profile.language}
- Country: ${profile.country}
- ALWAYS respond in the SAME language the user writes in
- Default: ${_languageName(profile.language)}
''';

  static String _quizGenerationPrompt(String language) {
    final langName = _languageName(language);
    return '''
You are Compair's product quiz engine. Generate a SHORT personalized quiz
(4-6 questions) to understand the user's needs for a specific product category.

LANGUAGE: Generate ALL questions and options in $langName.

Rules:
- Questions must be relevant to the product CATEGORY
- Each question has exactly 4 options
- Keep questions conversational with emoji
- NEVER ask about budget or brand preference
- ALL text must be in $langName

Return valid JSON:
{
  "questions": [
    {"question": "...", "options": ["...", "...", "...", "..."]},
    ...
  ]
}
''';
  }

  static String _enhancedAnalysisPrompt(String language) {
    final langName = _languageName(language);
    return '''
You are Compair's deep compatibility analyzer. Given a product, quiz answers,
and user profile, produce a comprehensive personalized match report.

LANGUAGE: Write ALL text in $langName.

SCORING RULES:
- Score must reflect how well THIS SPECIFIC product matches THIS SPECIFIC user
- Scores MUST be realistic and differentiated
- If product doesn't match: 20-40. If perfect match: 80-95.

Return valid JSON:
{
  "enhancedScore": 0-100,
  "factors": [
    {"label": "Usage Fit", "score": 0-100, "emoji": "🎯"},
    {"label": "Budget Match", "score": 0-100, "emoji": "💰"},
    {"label": "Ecosystem Fit", "score": 0-100, "emoji": "🔗"},
    {"label": "Future-proofing", "score": 0-100, "emoji": "🚀"},
    {"label": "Lifestyle Match", "score": 0-100, "emoji": "🏠"}
  ],
  "verdict": "2-3 paragraph personalized explanation in $langName",
  "prosForUser": ["Pro 1", "Pro 2", "Pro 3"],
  "consForUser": ["Con 1", "Con 2", "Con 3"],
  "alternatives": ["Alt 1", "Alt 2", "Alt 3"]
}
''';
  }

  static String _languageName(String code) {
    const map = {
      'en': 'English', 'tr': 'Turkish', 'de': 'German',
      'fr': 'French', 'es': 'Spanish', 'pt': 'Portuguese',
      'it': 'Italian', 'ja': 'Japanese', 'ko': 'Korean',
      'zh': 'Chinese', 'ar': 'Arabic', 'ru': 'Russian',
      'hi': 'Hindi', 'nl': 'Dutch', 'pl': 'Polish', 'sv': 'Swedish',
    };
    return map[code] ?? 'English';
  }
}
