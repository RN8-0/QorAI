/// Compair - Gemini Flash 2.5 AI Service (Core Intelligence)
///
/// Unified AI backbone for the entire application.
/// Model : gemini-2.5-flash (multimodal: text + image + vision)
/// Endpoint: PocketBase proxy — $kPbBaseUrl/api/ai/gemini
///           (pb_hooks/gemini.pb.js forwards to Google AI Studio,
///            key never leaves the server).

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

/// Central Gemini Flash 2.5 service — the brain of Compair.
class GeminiService implements AIService {
  final Dio _dio;
  final CacheService _cacheService;

  // All Gemini calls now go through the PocketBase proxy hook
  // (pb_hooks/gemini.pb.js). The API key lives only on the server —
  // clients never see it.
  static const _proxyUrl = '$kPbBaseUrl/api/ai/gemini';

  // Heavy tier: flash primary → lite fallback
  // Lite tier: lite primary → flash fallback
  static const _heavyModel = AppConstants.geminiModel;
  static const _liteModel = AppConstants.geminiLiteModel;

  GeminiService({
    required Dio dio,
    required CacheService cacheService,
    @Deprecated('No longer used — key is server-side via PB proxy')
    String? apiKey,
  }) : _dio = dio,
       _cacheService = cacheService;

  // ─────────────────────────────────────────────────────────────────────────
  //  PUBLIC API — implements [AIService]
  // ─────────────────────────────────────────────────────────────────────────

  @override
  Future<ComparisonResult> compare(CompareRequest req) async {
    final cacheKey = 'cmp_${req.productIds.join('_')}_${req.country}';
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
      tier: AiTier.heavy,
    );

    await _cacheService.set(
      cacheKey,
      response,
      duration: AppConstants.productCacheDuration,
    );
    return _parseComparisonResult(response);
  }

  @override
  Future<RecommendationResult> recommend(RecommendRequest req) async {
    final cacheKey = 'rec_${req.category}_${req.country}';
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
      tier: AiTier.lite,
    );

    await _cacheService.set(
      cacheKey,
      response,
      duration: AppConstants.trendCacheDuration,
    );
    return _parseRecommendationResult(response);
  }

  @override
  Future<LinkAnalysisResult> analyzeLink(
    String url,
    UserEntity profile, {
    OgMetadata? metadata,
  }) async {
    debugPrint('[Gemini] analyzeLink called for: $url');
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
      thinkingBudget: 512,
      timeout: const Duration(seconds: 60),
      tier: AiTier.heavy,
    );
    debugPrint('[Gemini] analyzeLink response keys: ${response.keys}');

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
      isProduct: response['is_product'] as bool? ?? true,
    );
  }

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
      tier: AiTier.lite,
    );
    return (response['score'] as num?)?.toDouble() ?? 0.0;
  }

  @override
  Future<String> askQuestion(String question, UserEntity profile) async {
    final currentYear = DateTime.now().year;
    final response = await _jsonRequest(
      system: _chatSystemPrompt(profile, currentYear),
      user: question,
      tier: AiTier.lite,
    );
    return jsonEncode(response);
  }

  /// Multi-turn conversational chat with proper Gemini API content array.
  /// [messages] is a list of {"role": "user"|"model", "text": "..."}
  Future<String> chatConversation(
    List<Map<String, String>> messages,
    UserEntity profile,
  ) async {
    final currentYear = DateTime.now().year;

    final contents = messages
        .map(
          (m) => {
            'role': m['role'] == 'user' ? 'user' : 'model',
            'parts': [
              {'text': m['text'] ?? ''},
            ],
          },
        )
        .toList();

    final body = {
      'contents': contents,
      'systemInstruction': {
        'parts': [
          {'text': _chatSystemPrompt(profile, currentYear)},
        ],
      },
      'generationConfig': {'temperature': 0.7, 'maxOutputTokens': 1024},
    };

    final text = await _rawRequest(body, tier: AiTier.lite);
    return text;
  }

  /// Streaming multi-turn chat — yields text chunks as they arrive.
  Stream<String> chatConversationStream(
    List<Map<String, String>> messages,
    UserEntity profile,
  ) async* {
    final currentYear = DateTime.now().year;

    final contents = messages
        .map(
          (m) => {
            'role': m['role'] == 'user' ? 'user' : 'model',
            'parts': [
              {'text': m['text'] ?? ''},
            ],
          },
        )
        .toList();

    final body = {
      'contents': contents,
      'systemInstruction': {
        'parts': [
          {'text': _chatSystemPrompt(profile, currentYear)},
        ],
      },
      'generationConfig': {'temperature': 0.7, 'maxOutputTokens': 1024},
    };

    try {
      // Streaming is not supported through the PB proxy (JS hooks can't
      // easily passthrough SSE). Fall back to single-shot.
      final text = await _rawRequest(
        body,
        receiveTimeout: const Duration(seconds: 60),
        tier: AiTier.lite,
      );
      if (text.isNotEmpty) yield text;
    } catch (e) {
      throw AIServiceException(message: 'Chat failed: $e');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  MULTIMODAL — image + text (used by AI Chat for vision queries)
  // ─────────────────────────────────────────────────────────────────────────

  /// Send a vision request with a base64-encoded image.
  Future<String> analyzeImage({
    required String base64Image,
    required String mimeType,
    String? prompt,
    UserEntity? profile,
  }) async {
    final lang = profile?.language ?? 'en';
    final langName = _languageName(lang);
    final langSuffix = lang != 'en' ? ' Respond in $langName.' : '';
    final textPrompt =
        prompt ??
        'Identify this product and provide detailed specifications, '
            'pros/cons, and suggest suitable alternatives.$langSuffix';

    final parts = <Map<String, dynamic>>[
      {'text': textPrompt},
      {
        'inline_data': {'mime_type': mimeType, 'data': base64Image},
      },
    ];

    final body = {
      'contents': [
        {'parts': parts},
      ],
      if (lang != 'en')
        'systemInstruction': {
          'parts': [
            {'text': 'IMPORTANT: Respond entirely in $langName.'},
          ],
        },
      'generationConfig': {'temperature': 0.4, 'maxOutputTokens': 2048},
    };

    final text = await _rawRequest(body, tier: AiTier.heavy);
    return text;
  }

  /// Simple text-in / text-out query with optional language preference.
  Future<String> freeTextQuery(
    String prompt, {
    String? language,
    AiTier tier = AiTier.lite,
  }) async {
    final langCode = language ?? 'en';
    final langName = _languageName(langCode);
    final body = {
      'contents': [
        {
          'parts': [
            {'text': prompt},
          ],
        },
      ],
      if (langCode != 'en')
        'systemInstruction': {
          'parts': [
            {
              'text':
                  'IMPORTANT: You MUST respond entirely in $langName. All text, analysis, recommendations, and explanations must be in $langName.',
            },
          ],
        },
      'generationConfig': {'temperature': 0.7, 'maxOutputTokens': 2048},
    };
    return _rawRequest(body, tier: tier);
  }

  /// JSON-enforced free text query — returns a clean JSON string (no markdown wrapping).
  /// Use this when the prompt requests a JSON response structure.
  Future<String> jsonFreeTextQuery(
    String prompt, {
    String? language,
    int maxTokens = 2048,
    AiTier tier = AiTier.lite,
  }) async {
    final langCode = language ?? 'en';
    final langName = _languageName(langCode);
    final systemText = langCode != 'en'
        ? 'IMPORTANT: You MUST respond entirely in $langName. Return only valid JSON.'
        : 'Return only valid JSON with no markdown, no extra text.';
    final body = {
      'contents': [
        {
          'parts': [
            {'text': prompt},
          ],
        },
      ],
      'systemInstruction': {
        'parts': [
          {'text': systemText},
        ],
      },
      'generationConfig': {
        'temperature': 0.3,
        'maxOutputTokens': maxTokens,
        'responseMimeType': 'application/json',
      },
    };
    return _rawRequest(body, tier: tier);
  }

  /// Query Gemini with Google Search grounding for real-time factual data.
  Future<String> groundedQuery(String prompt, {int maxTokens = 2048}) async {
    final body = {
      'contents': [
        {
          'parts': [
            {'text': prompt},
          ],
        },
      ],
      'tools': [
        {'googleSearch': {}},
      ],
      'generationConfig': {'temperature': 0.1, 'maxOutputTokens': maxTokens},
    };
    // Grounded queries with web search need more time — use 90s timeout
    return _rawRequest(body, receiveTimeout: const Duration(seconds: 90), tier: AiTier.heavy);
  }

  // ── Subscription Intelligence ────────────────────────────────────────────────

  /// Generate a personalized quiz for subscription analysis.
  Future<ProductQuiz> generateSubscriptionQuiz({
    required List<String> subscriptionNames,
    String language = 'en',
  }) async {
    final langName = _languageName(language);
    final names = subscriptionNames.join(', ');
    final isCompare = subscriptionNames.length > 1;

    // Build service-specific context for better question generation
    // For unknown services, instruct AI to use its knowledge
    final knownDetails = <String>[];
    final unknownNames = <String>[];
    for (final name in subscriptionNames) {
      final key = name.toLowerCase().trim();
      final context = _subscriptionContext[key];
      if (context != null) {
        knownDetails.add('- $name: $context');
      } else {
        unknownNames.add(name);
      }
    }

    final serviceDetails = knownDetails.join('\n');
    final unknownSection = unknownNames.isNotEmpty
        ? '\n\nUNKNOWN SERVICES (use your knowledge to identify them):\n'
              '${unknownNames.map((n) => '- $n').join('\n')}\n'
              'For each unknown service: determine what type of service it is '
              '(streaming, music, gaming, productivity, AI, cloud, fitness, news, etc.) '
              'and generate questions appropriate for that service type. '
              'If you cannot identify the service, generate questions about: '
              'frequency of use, main use case, what features matter most, '
              'and whether they use similar alternatives.'
        : '';

    final response = await _jsonRequest(
      system:
          '''
You are Compair's subscription quiz engine. Generate a SHORT personalized quiz
(4-5 questions) to understand the user's needs for: $names.

LANGUAGE: Generate ALL questions and options in $langName.

${serviceDetails.isNotEmpty ? 'KNOWN SERVICE DETAILS:\n$serviceDetails' : ''}
$unknownSection

The goal: understand how the user uses ${isCompare ? 'these services' : 'this service'},
their specific habits, preferences, and expectations —
so we can compute an accurate compatibility score.

Rules:
- Questions MUST be directly related to the specific services being compared
- For streaming services (Netflix, Disney+, Amazon Prime etc.): ask about favorite genres, watching frequency, content preferences (movies vs series vs documentaries), whether they watch alone or with family, 4K/HDR importance
- For music services (Spotify, Apple Music, YouTube Music etc.): ask about music genres, playlist habits, podcast listening, offline usage, audio quality preferences, discovery vs familiar music
- For AI tools (ChatGPT, Claude, Gemini etc.): ask about use cases (coding, writing, research), frequency of use, output quality expectations, API usage needs
- For gaming services (Xbox Game Pass, PS Plus, EA Play etc.): ask about game genres, play frequency, multiplayer vs single player, cloud gaming interest
- For cloud storage (iCloud, Google One, Dropbox etc.): ask about storage needs, device ecosystem, sharing frequency, backup habits
- For unknown services: identify the service category and ask relevant questions for that type
- Each question has exactly 4 options
- Options should cover the full spectrum of use-cases for THAT specific service type
- Keep questions conversational with emoji
- NEVER ask generic questions like "What do you do in the evening?" — questions must be SERVICE-SPECIFIC
- NEVER ask about budget (we already know that)
- NEVER ask about brand preference
- Questions should feel fun, not like a survey
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
      tier: AiTier.heavy,
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

  /// Enhanced subscription analysis combining grounded web data, quiz answers,
  /// and user profile into a structured compatibility report.
  Future<Map<String, dynamic>> enhancedSubscriptionAnalysis({
    required List<String> subscriptionNames,
    required List<QuizQuestion> answeredQuestions,
    required UserEntity profile,
  }) async {
    final langName = _languageName(profile.language);
    final names = subscriptionNames.join(', ');
    final isCompare = subscriptionNames.length > 1;
    final qaPairs = answeredQuestions
        .where((q) => q.selectedOption != null)
        .map((q) => {'question': q.text, 'answer': q.selectedOption})
        .toList();

    // Step 1: Research phase — use googleSearch to gather real-time data
    final researchPrompt =
        '''
Research the following subscription services: $names

Find for each service:
1. Current monthly price in ${profile.currency} for ${profile.country}
2. Recent Reddit discussions and user opinions
3. Trustpilot/forum reviews summary
4. Key features and limitations
5. Recent news or changes

Provide a comprehensive research summary.
''';

    String researchData = '';
    try {
      researchData = await _rawRequest({
        'contents': [
          {
            'parts': [
              {'text': researchPrompt},
            ],
          },
        ],
        'tools': [
          {'googleSearch': {}},
        ],
        'generationConfig': {'temperature': 0.2, 'maxOutputTokens': 2048},
      }, receiveTimeout: const Duration(seconds: 60), tier: AiTier.heavy);
    } catch (e) {
      debugPrint(
        '=== COMPAIR: Research phase failed, continuing without: $e ===',
      );
    }

    // Step 2: Analysis phase — structured JSON output (NO googleSearch, forces JSON)
    final jsonSchema = isCompare
        ? '''{
  "subscriptions": {
    "<service_name>": {
      "price": "string - monthly price in ${profile.currency}",
      "compatibility_score": "integer 0-100",
      "compatibility_explanation": "string - 2-3 sentences why this score",
      "pros": ["string", "string", "string", "string", "string"],
      "cons": ["string", "string", "string"],
      "community_sentiment": "string - 2-3 sentence Reddit/forum summary",
      "best_for": "string - ideal user type",
      "factors": {
        "usage_fit": "integer 0-100",
        "value_match": "integer 0-100",
        "content_match": "integer 0-100",
        "ecosystem_fit": "integer 0-100",
        "lifestyle_match": "integer 0-100"
      }
    }
  },
  "winner": {
    "best_value": "string - service name",
    "best_content": "string - service name",
    "overall": "string - service name",
    "recommendation": "string - 3-4 sentence personalized recommendation explaining WHY"
  },
  "detailed_comparison": {
    "pricing_analysis": "string - 2-3 sentences comparing prices and value",
    "feature_comparison": "string - 2-3 sentences about feature differences",
    "user_experience": "string - 2-3 sentences about UX differences"
  }
}'''
        : '''{
  "subscriptions": {
    "$names": {
      "price": "string - monthly price in ${profile.currency}",
      "compatibility_score": "integer 0-100",
      "compatibility_explanation": "string - 2-3 sentences why this score",
      "pros": ["string", "string", "string", "string", "string"],
      "cons": ["string", "string", "string"],
      "community_sentiment": "string - 2-3 sentence Reddit/forum summary",
      "best_for": "string - ideal user type",
      "factors": {
        "usage_fit": "integer 0-100",
        "value_match": "integer 0-100",
        "content_match": "integer 0-100",
        "ecosystem_fit": "integer 0-100",
        "lifestyle_match": "integer 0-100"
      }
    }
  },
  "recommendation": "string - 3-4 sentence personalized recommendation"
}''';

    // Identify unknown services for the analysis prompt
    final unknownForAnalysis = subscriptionNames.where((name) {
      return _subscriptionContext[name.toLowerCase().trim()] == null;
    }).toList();

    String buildAnalysisPrompt({required bool includeResearchData}) =>
        '''
You are Compair's subscription intelligence analyst.
Analyze: $names

User Profile:
- Country: ${profile.country}, Language: ${profile.language}
- Age: ${profile.ageRange ?? 'unknown'}, Profession: ${profile.profession ?? 'unknown'}
- Budget: ${profile.budgetRange}, Priorities: ${profile.priorities.join(', ')}
- Ecosystem: ${profile.ecosystem}
- Current subscriptions: ${profile.subscriptions.isEmpty ? 'none' : profile.subscriptions.join(', ')}

Quiz Answers:
${qaPairs.map((q) => '- ${q['question']}: ${q['answer']}').join('\n')}

${includeResearchData && researchData.isNotEmpty ? 'Research Data:\n$researchData\n' : ''}
${unknownForAnalysis.isNotEmpty ? 'NOTE: The following service(s) may not be well-known: ${unknownForAnalysis.join(', ')}. '
                  'Use the research data above and your knowledge to identify what they are. '
                  'If you cannot identify a service, still analyze it based on available context '
                  'and clearly state in the compatibility_explanation that limited data was available.\n' : ''}

CRITICAL RULES:
- ALL text values MUST be in $langName language
- The "subscriptions" object MUST contain exactly ${subscriptionNames.length} entries, one for each service: ${subscriptionNames.map((n) => '"$n"').join(', ')}
- compatibility_score must be an integer 0-100 based on how well it fits THIS specific user
- pros must have exactly 5 items, cons exactly 3 items — keep each item concise (max 15 words)
- factors are 0-100 integers
- Be specific and personalized, not generic
- Include real pricing for ${profile.country}
- community_sentiment should be max 2 sentences

Return ONLY valid JSON matching this exact schema:
$jsonSchema
''';

    Future<String> runStructuredAnalysis({
      required bool includeResearchData,
      required int maxTokens,
    }) {
      return _rawRequest({
        'contents': [
          {
            'parts': [
              {
                'text': buildAnalysisPrompt(
                  includeResearchData: includeResearchData,
                ),
              },
            ],
          },
        ],
        'generationConfig': {
          'responseMimeType': 'application/json',
          'temperature': 0.3,
          'maxOutputTokens': maxTokens,
        },
      }, receiveTimeout: const Duration(seconds: 120), tier: AiTier.heavy);
    }

    String text;
    try {
      text = await runStructuredAnalysis(
        includeResearchData: true,
        maxTokens: 4096,
      );
    } on AIServiceException catch (e) {
      final shouldRetryCompact =
          researchData.isNotEmpty &&
          (e.isRateLimited ||
              e.message.toLowerCase().contains('busy') ||
              e.message.toLowerCase().contains('unavailable'));
      if (!shouldRetryCompact) rethrow;
      debugPrint(
        '=== COMPAIR: Retrying subscription analysis with compact prompt ===',
      );
      text = await runStructuredAnalysis(
        includeResearchData: false,
        maxTokens: 3072,
      );
    }

    // Parse JSON response — responseMimeType should guarantee valid JSON
    Map<String, dynamic>? parsed;
    try {
      var clean = text.trim();
      // Strip markdown code fences if present
      if (clean.startsWith('```')) {
        clean = clean
            .replaceFirst(RegExp(r'^```\w*\n?'), '')
            .replaceFirst(RegExp(r'\n?```$'), '');
      }
      // Try parsing entire response as JSON
      parsed = jsonDecode(clean) as Map<String, dynamic>?;
      debugPrint('=== COMPAIR: Sub analysis JSON parsed successfully ===');
    } catch (e) {
      debugPrint('=== COMPAIR: Sub analysis JSON parse failed: $e ===');
      // Try to extract JSON from mixed text response
      try {
        final jsonMatch = RegExp(r'\{[\s\S]*\}').firstMatch(text);
        if (jsonMatch != null) {
          parsed = jsonDecode(jsonMatch.group(0)!) as Map<String, dynamic>?;
          debugPrint('=== COMPAIR: Sub analysis JSON extracted from text ===');
        }
      } catch (_) {
        debugPrint('=== COMPAIR: JSON extraction also failed ===');
      }
    }

    // Extract scores from structured JSON or fallback to regex
    final scores = <String, double>{};
    if (parsed != null && parsed.containsKey('subscriptions')) {
      final subs = parsed['subscriptions'] as Map<String, dynamic>;
      for (final entry in subs.entries) {
        final data = entry.value as Map<String, dynamic>? ?? {};
        final score = (data['compatibility_score'] as num?)?.toDouble();
        if (score != null) scores[entry.key] = score.clamp(0, 100);
      }
    }

    // Regex fallback if JSON parse failed
    if (scores.isEmpty) {
      for (final name in subscriptionNames) {
        final pattern = RegExp(
          RegExp.escape(name) + r'[^\n]*?(\d{1,3})\s*%',
          caseSensitive: false,
        );
        final m = pattern.firstMatch(text);
        if (m != null) {
          final v = double.tryParse(m.group(1) ?? '');
          if (v != null && v >= 0 && v <= 100) scores[name] = v;
        }
      }
    }

    // Generate readable analysis text from structured data (NEVER show raw JSON)
    String analysisText = '';
    if (parsed != null && parsed.containsKey('subscriptions')) {
      final buf = StringBuffer();
      final subs = parsed['subscriptions'] as Map<String, dynamic>? ?? {};
      for (final entry in subs.entries) {
        final d = entry.value as Map<String, dynamic>? ?? {};
        buf.writeln('${entry.key} (${d['compatibility_score'] ?? '?'}%)');
        buf.writeln(d['compatibility_explanation'] ?? '');
        final pros = (d['pros'] as List?)?.cast<String>() ?? [];
        if (pros.isNotEmpty) {
          buf.writeln('\n✅ ${pros.join('\n✅ ')}');
        }
        final cons = (d['cons'] as List?)?.cast<String>() ?? [];
        if (cons.isNotEmpty) {
          buf.writeln('\n❌ ${cons.join('\n❌ ')}');
        }
        buf.writeln();
      }
      final winner = parsed['winner'] as Map<String, dynamic>?;
      if (winner != null && winner['recommendation'] != null) {
        buf.writeln(winner['recommendation']);
      }
      final rec = parsed['recommendation'] as String?;
      if (rec != null) buf.writeln(rec);
      analysisText = buf.toString().trim();
    }
    // If parsing failed or produced empty text, never show raw JSON
    if (analysisText.isEmpty) {
      analysisText = parsed != null
          ? 'Analysis complete. See the detailed results above.'
          : 'Analysis could not be fully parsed. Please try again.';
    }

    return {'analysis': analysisText, 'scores': scores, 'structured': parsed};
  }

  /// Generate a short personalized quiz for a product category.
  /// Returns 4-6 questions tailored to the product type.
  Future<ProductQuiz> generateQuiz({
    required String category,
    required String productTitle,
    required String url,
    String language = 'en',
  }) async {
    debugPrint('[Gemini] generateQuiz for: $productTitle ($category)');
    final response = await _jsonRequest(
      system: _quizGenerationPrompt(language),
      user: jsonEncode({
        'category': category,
        'productTitle': productTitle,
        'url': url,
      }),
      thinkingBudget: 512,
      timeout: const Duration(seconds: 45),
      tier: AiTier.heavy,
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

    debugPrint('[Gemini] generateQuiz got ${questions.length} questions');
    return ProductQuiz(
      id: '${category}_${DateTime.now().millisecondsSinceEpoch}',
      category: category,
      productTitle: productTitle,
      questions: questions,
      createdAt: DateTime.now(),
    );
  }

  /// Produce an enhanced compatibility analysis combining the base analysis,
  /// quiz answers, and full user profile.
  Future<EnhancedAnalysisResult> enhancedAnalysis({
    required LinkAnalysisResult baseResult,
    required List<QuizQuestion> answeredQuestions,
    required UserEntity profile,
  }) async {
    debugPrint('[Gemini] enhancedAnalysis for: ${baseResult.metadata.title}');
    debugPrint(
      '[Gemini] quiz answers count: ${answeredQuestions.where((q) => q.selectedOption != null).length}',
    );
    debugPrint(
      '[Gemini] user profile: ecosystem=${profile.ecosystem}, budget=${profile.budgetRange}, '
      'devices=${profile.currentDevices}, priorities=${profile.priorities}',
    );
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
      thinkingBudget: 1024,
      timeout: const Duration(seconds: 60),
      tier: AiTier.heavy,
    );

    // Parse factors — handle both num and string scores from Gemini
    double _parseScore(dynamic v) {
      if (v is num) return v.toDouble();
      if (v is String) return double.tryParse(v) ?? 0.0;
      return 0.0;
    }

    final rawFactors = response['factors'];
    debugPrint(
      '[Gemini] raw factors type: ${rawFactors.runtimeType}, value: $rawFactors',
    );
    final factors = (rawFactors is List ? rawFactors : <dynamic>[])
        .map((f) {
          if (f is! Map) return null;
          final label = (f['label'] ?? f['name'] ?? '') as String;
          final score = _parseScore(f['score'] ?? f['value']);
          final emoji = (f['emoji'] ?? f['icon'] ?? '📊') as String;
          debugPrint('[Gemini]   factor: $label = $score ($emoji)');
          return CompatibilityFactor(label: label, score: score, emoji: emoji);
        })
        .whereType<CompatibilityFactor>()
        .where((f) => f.label.isNotEmpty)
        .toList();

    final enhancedScore = _parseScore(
      response['enhancedScore'] ??
          response['enhanced_score'] ??
          response['score'],
    );
    debugPrint(
      '[Gemini] enhancedAnalysis for "${baseResult.metadata.title}": score=$enhancedScore, factors=${factors.length}, '
      'factorScores=[${factors.map((f) => '${f.label}:${f.score}').join(', ')}]',
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
  //  INTERNAL — HTTP helpers
  // ─────────────────────────────────────────────────────────────────────────

  /// Make a request that expects a JSON object back.
  Future<Map<String, dynamic>> _jsonRequest({
    required String system,
    required String user,
    int? thinkingBudget,
    Duration? timeout,
    AiTier tier = AiTier.lite,
  }) async {
    final body = <String, dynamic>{
      'contents': [
        {
          'parts': [
            {'text': user},
          ],
        },
      ],
      'systemInstruction': {
        'parts': [
          {'text': system},
        ],
      },
      'generationConfig': {
        'temperature': 0.7,
        'maxOutputTokens': 4096,
        'responseMimeType': 'application/json',
      },
    };

    // Always set thinking budget to control costs.
    // Thinking tokens are billed at output price ($2.50/1M for flash).
    final effectiveThinking = thinkingBudget ?? (tier == AiTier.heavy ? 1024 : 0);
    body['generationConfig'] = {
      ...(body['generationConfig'] as Map<String, dynamic>),
      'thinkingConfig': {'thinkingBudget': effectiveThinking},
    };

    final text = await _rawRequest(
      body,
      receiveTimeout: timeout ?? const Duration(seconds: 60),
      tier: tier,
    );

    try {
      return jsonDecode(text) as Map<String, dynamic>;
    } catch (e) {
      debugPrint(
        '[Gemini] JSON parse error: $e — raw text: ${text.length > 500 ? text.substring(0, 500) : text}',
      );
      // Try to extract JSON from the response
      final match = RegExp(r'\{.*\}', dotAll: true).firstMatch(text);
      if (match != null) {
        try {
          return jsonDecode(match.group(0)!) as Map<String, dynamic>;
        } catch (_) {}
      }
      return {'message': text, 'options': <String>[]};
    }
  }

  /// Low-level POST against the PocketBase Gemini proxy with retry.
  Future<String> _rawRequest(
    Map<String, dynamic> body, {
    Duration receiveTimeout = const Duration(seconds: 60),
    AiTier tier = AiTier.lite,
  }) async {
    // Inject thinking budget if not already set to control costs.
    // Thinking tokens are billed at output price ($2.50/1M for flash).
    final genConfig = body['generationConfig'] as Map<String, dynamic>? ?? {};
    if (!genConfig.containsKey('thinkingConfig')) {
      final budget = tier == AiTier.heavy ? 1024 : 0;
      body = {
        ...body,
        'generationConfig': {
          ...genConfig,
          'thinkingConfig': {'thinkingBudget': budget},
        },
      };
    }

    int retryCount = 0;

    while (retryCount < AppConstants.deepSeekMaxRetries) {
      final models = _candidateModels(tier);

      for (var i = 0; i < models.length; i++) {
        final model = models[i];
        final isLastModel = i == models.length - 1;
        final proxyBody = {'model': model, ...body};

        try {
          final response = await _dio.post(
            _proxyUrl,
            data: proxyBody,
            options: Options(
              receiveTimeout: receiveTimeout,
              sendTimeout: const Duration(seconds: 15),
              headers: {'Content-Type': 'application/json'},
            ),
          );

          // Check for prompt feedback / safety blocks first
          final promptFeedback =
              response.data['promptFeedback'] as Map<String, dynamic>?;
          if (promptFeedback != null) {
            final blockReason = promptFeedback['blockReason'] as String?;
            if (blockReason != null) {
              debugPrint('[Gemini] Request blocked: $blockReason');
              throw AIServiceException(
                message: 'Content was blocked by safety filter ($blockReason).',
              );
            }
          }

          final candidates = response.data['candidates'] as List?;
          if (candidates == null || candidates.isEmpty) {
            debugPrint(
              '[Gemini] Empty candidates from $model. Full response: ${response.data}',
            );
            throw const AIServiceException(
              message: 'AI returned an empty response.',
            );
          }

          final finishReason = candidates[0]['finishReason'] as String?;
          debugPrint('[Gemini] model=$model finishReason: $finishReason');
          if (finishReason == 'SAFETY') {
            debugPrint('[Gemini] Response blocked by safety filter');
            throw const AIServiceException(
              message: 'Response was blocked by safety filter.',
            );
          }
          if (finishReason == 'MAX_TOKENS') {
            debugPrint(
              '[Gemini] ⚠️ Response TRUNCATED — finishReason=MAX_TOKENS',
            );
          }

          final content = candidates[0]['content'];
          if (content == null) {
            debugPrint(
              '[Gemini] No content in candidate. Finish reason: $finishReason',
            );
            throw const AIServiceException(message: 'AI returned no content.');
          }
          final parts = content['parts'] as List?;
          if (parts == null || parts.isEmpty) {
            debugPrint(
              '[Gemini] No parts in content. Candidate: ${candidates[0]}',
            );
            throw const AIServiceException(message: 'AI returned no content.');
          }

          debugPrint('[Gemini] ✅ model=$model tier=$tier succeeded.');

          final buffer = StringBuffer();
          for (final part in parts) {
            final text = part['text'] as String?;
            if (text != null) {
              buffer.write(text);
            }
          }
          return buffer.toString();
        } on DioException catch (e) {
          final statusCode = e.response?.statusCode;
          final responseBody = e.response?.data;
          debugPrint(
            '[Gemini] DioException model=$model (attempt ${retryCount + 1}/${AppConstants.deepSeekMaxRetries}): '
            'status=$statusCode, type=${e.type}, '
            'message=${e.message}, '
            'body=${responseBody is String ? (responseBody.length > 300 ? responseBody.substring(0, 300) : responseBody) : responseBody}',
          );

          final shouldTryFallback =
              !isLastModel && _shouldFallbackModel(statusCode, responseBody);
          if (shouldTryFallback) {
            debugPrint(
              '[Gemini] Retrying with fallback model after $model failed.',
            );
            continue;
          }

          if (statusCode == 429) {
            throw const AIServiceException(
              message: 'AI is busy right now. Please try again shortly.',
              isRateLimited: true,
            );
          }

          if (statusCode == 400 || statusCode == 403 || statusCode == 404) {
            String detail = 'AI request failed (HTTP $statusCode).';
            if (responseBody is Map) {
              final errorMsg = responseBody['error']?['message'] as String?;
              if (errorMsg != null) {
                detail = errorMsg;
              }
            }
            debugPrint('[Gemini] Non-retryable error: $detail');
            throw AIServiceException(message: detail);
          }
        } on AIServiceException {
          rethrow;
        } catch (e) {
          debugPrint(
            '[Gemini] Unexpected error on $model (attempt ${retryCount + 1}/${AppConstants.deepSeekMaxRetries}): $e',
          );
          if (!isLastModel) {
            continue;
          }
        }
      }

      retryCount++;
      if (retryCount < AppConstants.deepSeekMaxRetries) {
        await Future.delayed(AppConstants.retryDelays[retryCount - 1]);
      }
    }

    throw const AIServiceException(
      message: 'AI service is temporarily unavailable.',
    );
  }

  List<String> _candidateModels(AiTier tier) {
    // Heavy tier: flash first (powerful), lite fallback (cheaper)
    // Lite tier:  lite first (cheap), flash fallback (powerful)
    if (tier == AiTier.heavy) {
      return [_heavyModel, _liteModel];
    }
    return [_liteModel, _heavyModel];
  }

  bool _shouldFallbackModel(int? statusCode, dynamic responseBody) {
    if (statusCode == 429 ||
        statusCode == 500 ||
        statusCode == 502 ||
        statusCode == 503 ||
        statusCode == 504) {
      return true;
    }

    final text = responseBody?.toString().toLowerCase() ?? '';
    return text.contains('resource_exhausted') ||
        text.contains('quota exceeded') ||
        text.contains('temporarily unavailable') ||
        text.contains('high demand') ||
        text.contains('unavailable');
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
      analysis: data['analysis'] as String? ?? '',
      winnerId: data['winner'] as String?,
      generatedAt: DateTime.now(),
    );
  }

  RecommendationResult _parseRecommendationResult(Map<String, dynamic> data) {
    final items = (data['recommendations'] as List<dynamic>? ?? [])
        .map(
          (e) => RecommendedProduct(
            productId: e['productId'] ?? '',
            score: (e['score'] as num?)?.toDouble() ?? 0.0,
            reason: e['reason'] ?? '',
          ),
        )
        .toList();

    return RecommendationResult(
      recommendations: items,
      generatedAt: DateTime.now(),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  SYSTEM PROMPTS (English)
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

PRODUCT VALIDATION: If the URL/metadata clearly indicates a non-product page
(news article, blog post, homepage, social media profile, video page, search
results page), set is_product to false, set score to 0, and set analysis to a
short explanation in $langName. Otherwise set is_product to true.

LANGUAGE: You MUST write the "analysis" field in $langName.

SCORING RULES:
- Score reflects how well this product fits the user's profile and needs
- Consider the user's ecosystem, budget, priorities, and country
- Budget phones for a budget-conscious user = higher score
- Premium phones for a budget-conscious user = lower score
- Score range: 20-95 (never 0 or 100, be realistic)
- Extract the actual product name, price, and category from the URL content

Return valid JSON:
{
  "is_product": true,
  "score": 20-95,
  "analysis": "Detailed analysis in $langName of how this product fits the user",
  "category": "product category (e.g., smartphones, laptops)",
  "title": "Product name/title",
  "image_url": "Direct URL to the product image (og:image or main product photo)",
  "price": "Price with currency symbol (e.g., \$999, €849)",
  "site_name": "Store/site name (e.g., Amazon, Best Buy)"
}
''';
  }

  static String _chatSystemPrompt(UserEntity profile, int currentYear) =>
      '''
You are Compair AI — a witty, knowledgeable tech consultant and the user's friendly advisor.

## YOUR PERSONALITY
- You're warm, conversational, and occasionally humorous — think of a smart friend who loves tech
- Use emoji naturally (not excessively) 
- Be honest about product weaknesses — users trust you MORE when you're candid
- Never be robotic or overly formal. You're a tech buddy, not a corporate chatbot
- Keep responses concise and to the point (max 3-4 short paragraphs)

## USER PROFILE
- Ecosystem: ${profile.ecosystem}
- Budget: ${profile.budgetRange}
- Priorities: ${profile.priorities.join(', ')}
- Country: ${profile.country}
- Profession: ${profile.profession}

## PAGE AWARENESS
You can see what the user is currently looking at in the app. When the context mentions a specific product or page, USE that information:
- If user is on a product page, you know which product they're viewing — comment on it proactively
- If user asks "should I buy this?", analyze the product they're viewing based on their profile
- If user is comparing products, you can see both products and give informed opinions
- Reference specific specs, prices, and features from the page context

## CONVERSATION FLOW
When the user asks a general question (e.g., "recommend a phone"), ask clarifying questions ONE AT A TIME before making a final recommendation. Use the user's profile to skip obvious questions (e.g., don't ask ecosystem if they already said Apple).

## LANGUAGE
- The user's preferred language is: ${profile.language}
- The user's country is: ${profile.country}
- ALWAYS respond in the SAME language the user writes in
- Default language: ${_languageName(profile.language)}
''';

  static String _quizGenerationPrompt(String language) {
    final langName = _languageName(language);
    return '''
You are Compair's product quiz engine. Generate a SHORT personalized quiz
(4-6 questions) to understand the user's needs for a specific product category.

LANGUAGE: Generate ALL questions and options in $langName.

The goal: understand how the user plans to use this product, their priorities,
living situation, habits, and expectations — so we can compute an accurate
compatibility score.

Rules:
- Questions must be relevant to the product CATEGORY (not a generic quiz)
- Each question has exactly 4 options
- Options should cover the full spectrum of use-cases
- Keep questions conversational with emoji
- NEVER ask about budget (we already know that)
- NEVER ask about brand preference
- Questions should feel fun, not like a survey
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
You are Compair's deep compatibility analyzer. Given a product, the user's quiz
answers, and their full profile, produce a comprehensive personalized match report.

LANGUAGE: Write ALL text (verdict, pros, cons, alternatives) in $langName.

CRITICAL SCORING RULES:
- Analyze the SPECIFIC product's specs, features, price, and category
- Score must reflect how well THIS SPECIFIC product matches THIS SPECIFIC user
- A budget phone should score LOW on Future-proofing but potentially HIGH on Budget Match
- A flagship phone should score differently from a mid-range phone
- enhancedScore is the weighted average of all factor scores
- Scores MUST be realistic and differentiated: do NOT default to the same score for every product
- Consider the product's actual market position, specs, and price tier when scoring
- If the product doesn't match the user's needs, scores should be LOW (20-40)
- If it's a perfect match, scores should be HIGH (80-95)
- NEVER give the same score to products with different specs/prices

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
  "prosForUser": ["Pro 1 specific to THIS user", "Pro 2", "Pro 3"],
  "consForUser": ["Con 1 specific to THIS user", "Con 2", "Con 3"],
  "alternatives": ["Alternative Product 1", "Alternative Product 2", "Alternative Product 3"]
}

Important:
- The enhancedScore should differ from initialScore based on quiz answers
- Factors must reflect the user's actual answers, not generic metrics
- Usage Fit: how well this product matches what the user actually needs based on quiz answers
- Budget Match: value for money relative to user's stated budget range
- Ecosystem Fit: compatibility with user's existing devices and ecosystem (Apple/Android/Windows)
- Future-proofing: how long this product will stay relevant for the user's use case
- Lifestyle Match: how well it fits user's daily routine, profession, and living situation
- Pros/cons must be personalized ("Since you mostly game, the GPU is overkill for you")
- Alternatives must be real, currently available products in a similar price range
- The verdict should explain WHY this product is or isn't right for THIS specific user
- All text must be in $langName
''';
  }

  static String _languageName(String code) {
    const map = {
      'en': 'English',
      'tr': 'Turkish',
      'de': 'German',
      'fr': 'French',
      'es': 'Spanish',
      'pt': 'Portuguese',
      'it': 'Italian',
      'ja': 'Japanese',
      'ko': 'Korean',
      'zh': 'Chinese',
      'ar': 'Arabic',
      'ru': 'Russian',
      'hi': 'Hindi',
      'nl': 'Dutch',
      'pl': 'Polish',
      'sv': 'Swedish',
    };
    return map[code] ?? 'English';
  }

  /// Known subscription service context for better quiz generation
  static const _subscriptionContext = <String, String>{
    'netflix':
        'Video streaming: movies, series, documentaries, anime. Originals like Stranger Things, Squid Game. Multiple profiles, offline download, 4K/HDR support.',
    'spotify':
        'Music & podcast streaming. 100M+ tracks, AI playlists (Discover Weekly, Daily Mix), offline mode, lyrics, social sharing, Spotify Wrapped.',
    'apple music':
        'Music streaming with lossless/spatial audio, 100M+ songs, Apple ecosystem integration, radio stations, music videos, karaoke mode.',
    'youtube premium':
        'Ad-free YouTube, background play, YouTube Music included, offline downloads, YouTube Originals.',
    'youtube music':
        'Music streaming from YouTube catalog, smart recommendations, music videos, live performances, covers.',
    'disney+':
        'Video streaming: Disney, Marvel, Star Wars, Pixar, National Geographic. Family content, IMAX Enhanced, GroupWatch.',
    'amazon prime':
        'Video streaming + fast delivery + Prime Gaming + Prime Reading. Thursday Night Football, Originals like The Boys, Rings of Power.',
    'hbo max':
        'Premium video streaming: HBO originals (Game of Thrones, The Last of Us), Warner Bros movies, DC content.',
    'apple tv+':
        'Apple original content: Ted Lasso, Severance, Foundation. Small but high-quality library, Apple ecosystem perks.',
    'chatgpt plus':
        'OpenAI GPT-4 access, faster responses, priority access, DALL-E image generation, Advanced Data Analysis, plugins, GPTs.',
    'claude pro':
        'Anthropic Claude AI: longer conversations, priority access, larger context window, better for coding and analysis.',
    'gemini advanced':
        'Google Gemini Ultra: deep reasoning, multimodal (text+image+code), Google Workspace integration.',
    'xbox game pass':
        'Gaming subscription: 100+ games on Xbox/PC/cloud, day-one releases, EA Play included in Ultimate, online multiplayer.',
    'ps plus':
        'PlayStation subscription: online multiplayer, monthly free games, game catalog (Extra/Premium tiers), cloud streaming.',
    'ea play':
        'EA games subscription: FIFA, Battlefield, Madden, early access to new releases, 10-hour trials.',
    'apple one':
        'Apple bundle: Apple Music + TV+ + Arcade + iCloud+ (+ Fitness/News in Premium). Ecosystem savings.',
    'icloud+':
        'Apple cloud storage: device backup, photos sync, Private Relay VPN, Hide My Email, custom email domain.',
    'google one':
        'Google cloud storage: Drive/Gmail/Photos storage, VPN, enhanced Google support, family sharing.',
    'dropbox':
        'Cloud storage & file sync, team collaboration, Smart Sync, document scanning, eSign.',
    'adobe cc':
        'Creative Cloud: Photoshop, Illustrator, Premiere Pro, After Effects, Lightroom. Industry-standard creative tools.',
    'notion':
        'All-in-one workspace: notes, docs, databases, project management, wikis, AI assistant.',
    'figma':
        'Collaborative design tool: UI/UX design, prototyping, design systems, FigJam whiteboard, Dev Mode.',
    'crunchyroll':
        'Anime streaming: largest anime library, simulcasts from Japan, manga, offline viewing.',
    'paramount+':
        'Video streaming: CBS content, Paramount movies, NFL, Champions League, Originals like Yellowstone.',
    'peacock':
        'NBCUniversal streaming: The Office, live sports, news, Bravo reality TV, Peacock Originals.',
    'deezer':
        'Music streaming: Flow AI recommendations, lyrics, podcasts, HiFi lossless audio, SongCatcher.',
    'tidal':
        'Music streaming: HiFi/Master quality, artist-owned, exclusive content, Dolby Atmos, Sony 360 Reality Audio.',
  };
}
