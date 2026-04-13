/// Compair - DeepSeek AI Service Implementation
/// Blueprint Section 7.1, 7.2, 7.3, 7.5
///
/// Model: deepseek-chat (MVP)
/// Cost: $0.14/1M input token, $0.28/1M output token
/// Endpoint: https://api.deepseek.com/v1/chat/completions
/// Rate Limit: 60 RPM (free tier)
/// Max Tokens: 4096 (output)

import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:compair/core/constants.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/domain/entities/ai_entities.dart';
import 'package:compair/domain/entities/user_entity.dart';
import 'package:compair/services/ai_service.dart';
import 'package:compair/services/cache_service.dart';

/// DeepSeek AI service - MVP implementation
class DeepSeekService implements AIService {
  final Dio _dio;
  final CacheService _cacheService;
  final String _apiKey;

  DeepSeekService({
    required Dio dio,
    required CacheService cacheService,
    required String apiKey,
  })  : _dio = dio,
        _cacheService = cacheService,
        _apiKey = apiKey {
    _dio.options = BaseOptions(
      baseUrl: AppConstants.deepSeekBaseUrl,
      connectTimeout: Duration(seconds: AppConstants.deepSeekTimeoutSeconds),
      receiveTimeout: Duration(seconds: AppConstants.deepSeekTimeoutSeconds),
      headers: {
        'Authorization': 'Bearer $_apiKey',
        'Content-Type': 'application/json',
      },
    );
  }

  /// Comparison - Section 7.2
  @override
  Future<ComparisonResult> compare(CompareRequest req) async {
    // Cache check - Section 7.4
    final cacheKey = 'compare_${req.productIds.join('_')}_${req.country}';
    final cached = await _cacheService.get<Map<String, dynamic>>(cacheKey);
    if (cached != null) {
      return _parseComparisonResult(cached);
    }

    // Prompt building - Section 7.3
    const systemPrompt = 'You are an expert product comparison assistant. Analyze products objectively based on specs, reviews, and value.';
    final userPrompt = _buildComparisonPrompt(req);

    final response = await _makeRequest(
      systemPrompt: systemPrompt,
      userPrompt: userPrompt,
    );

    final result = _parseComparisonResult(response);

    // Save to cache - 24 hours
    await _cacheService.set(
      cacheKey,
      response,
      duration: AppConstants.productCacheDuration,
    );

    return result;
  }

  /// Recommendation - Section 7.2
  @override
  Future<RecommendationResult> recommend(RecommendRequest req) async {
    final cacheKey = 'recommend_${req.category}_${req.country}';
    final cached = await _cacheService.get<Map<String, dynamic>>(cacheKey);
    if (cached != null) {
      return _parseRecommendationResult(cached);
    }

    final response = await _makeRequest(
      systemPrompt: 'You are the Compair AI recommendation engine. Recommend the most suitable products based on the user profile.',
      userPrompt: jsonEncode({
        'userProfile': req.userProfile,
        'category': req.category,
        'country': req.country,
        'limit': req.limit,
      }),
    );

    final result = _parseRecommendationResult(response);

    await _cacheService.set(
      cacheKey,
      response,
      duration: AppConstants.trendCacheDuration,
    );

    return result;
  }

  /// Link analizi - Section 9.1
  @override
  Future<LinkAnalysisResult> analyzeLink(String url, UserEntity profile) async {
    final response = await _makeRequest(
      systemPrompt: '''
You are Compair's link analysis engine. Analyze the given URL metadata and user profile
to generate a personalized compatibility percentage and detailed analysis.
Response in JSON format: {"score": 0-100, "analysis": "...", "category": "..."}
''',
      userPrompt: jsonEncode({
        'url': url,
        'userProfile': {
          'ecosystem': profile.ecosystem,
          'budgetRange': profile.budgetRange,
          'priorities': profile.priorities,
          'country': profile.country,
        },
      }),
    );

    return LinkAnalysisResult(
      url: url,
      metadata: const OgMetadata(),
      aiScore: (response['score'] as num?)?.toDouble() ?? 0.0,
      aiAnalysis: response['analysis'] ?? '',
      category: response['category'],
      analyzedAt: DateTime.now(),
    );
  }

  /// Score calculation
  @override
  Future<double> calculateScore(ScoreRequest req) async {
    final response = await _makeRequest(
      systemPrompt: 'Calculate product compatibility score. Return only a number between 0-100.',
      userPrompt: jsonEncode({
        'product': req.productData,
        'userProfile': req.userProfile,
        'country': req.country,
      }),
    );

    return (response['score'] as num?)?.toDouble() ?? 0.0;
  }

  /// Q&A - Section 7.2
  /// Response format: JSON {"message": "...", "options": ["...", "..."]}
  /// options can be empty array (when final recommendation is made)
  @override
  Future<String> askQuestion(String question, UserEntity profile) async {
    final currentYear = DateTime.now().year;
    final response = await _makeRequest(
      systemPrompt: '''
You are Compair's expert technology consultant.

## RESPONSE FORMAT (VERY IMPORTANT!)
Every response MUST be in the following JSON format:
{
  "message": "Message to display to the user",
  "options": ["Option 1", "Option 2", "Option 3", "Option 4"]
}

- "message": Your main message (can use emojis)
- "options": Buttons the user can select (2-4 items, short and clear)
- If making a final recommendation, options should be an empty array: []

## USER PROFILE
- Ecosystem: ${profile.ecosystem}
- Budget: ${profile.budgetRange}
- Priorities: ${profile.priorities.join(', ')}
- Country: ${profile.country}

## QUESTIONING FLOW

If the user asks a general question (e.g. "recommend a phone", "looking for a laptop"),
ask the following questions ONE BY ONE:

1. OPERATING SYSTEM
{
  "message": "📱 Which operating system do you prefer?",
  "options": ["iOS (iPhone)", "Android", "No preference"]
}

2. BUDGET
{
  "message": "💰 What's your budget?",
  "options": ["Under \$500", "\$500-\$1000", "\$1000-\$1500", "Over \$1500"]
}

3. USAGE PURPOSE
{
  "message": "🎯 What's your main usage purpose?",
  "options": ["Photo/Video", "Gaming", "Work/Productivity", "Daily use"]
}

4. PRIORITY
{
  "message": "⭐ What's the most important feature?",
  "options": ["Camera quality", "Battery life", "Performance", "Value for money"]
}

5. STORAGE
{
  "message": "💾 How much storage do you need?",
  "options": ["128 GB", "256 GB", "512 GB", "1 TB"]
}

## FINAL RECOMMENDATION
After all information is gathered:
{
  "message": "🏆 **Personalized Recommendation: Samsung Galaxy S24**\\n\\n📊 AnTuTu: 1,450,000\\n📸 DxOMark: 132\\n🔋 4,000 mAh\\n💰 ~\$799\\n\\n**Why this?**\\n✅ Matches your Android preference\\n✅ Within your budget\\n✅ Camera-focused",
  "options": []
}

## IMPORTANT RULES
- ONLY recommend $currentYear and ${currentYear - 1} products
- OLD models are FORBIDDEN (iPhone SE 2022, Galaxy A54, etc.)
- Current models: iPhone 16 series, Galaxy S24/S25, Pixel 9
- Always cite sources (AnTuTu, DxOMark scores)
- Use prices relevant to the user's country

## EXAMPLE DIALOGUE

User: "What's the best phone?"
{
  "message": "📱 I'll ask you a few questions to find the best phone for you. Which operating system do you prefer?",
  "options": ["iOS (iPhone)", "Android", "No preference"]
}

User: "Android"
{
  "message": "💰 Great! There are excellent Android options. What's your budget?",
  "options": ["Under \$500", "\$500-\$1000", "\$1000-\$1500", "Over \$1500"]
}

User: "\$1000-\$1500"
{
  "message": "🎯 With that budget, we can look at premium mid-range models. What's your main usage purpose?",
  "options": ["Photo/Video", "Gaming", "Work/Productivity", "Daily use"]
}
''',
      userPrompt: question,
    );

    // Return JSON response as string (will be parsed on the UI side)
    return jsonEncode(response);
  }

  /// Budget description
  String _getBudgetDescription(String budgetRange) {
    switch (budgetRange.toLowerCase()) {
      case 'low':
        return '(Looking for affordable options)';
      case 'mid':
        return '(Mid-range, price/performance focused)';
      case 'high':
        return '(Prefers premium segment)';
      case 'premium':
        return '(Wants the best, no budget constraints)';
      default:
        return '';
    }
  }

  /// Plain text response API request (for Chat)
  Future<String> _makeTextRequest({
    required String systemPrompt,
    required String userPrompt,
  }) async {
    int retryCount = 0;

    while (retryCount < AppConstants.deepSeekMaxRetries) {
      try {
        final response = await _dio.post(
          '/chat/completions',
          data: {
            'model': AppConstants.deepSeekModel,
            'messages': [
              {'role': 'system', 'content': systemPrompt},
              {'role': 'user', 'content': userPrompt},
            ],
            'max_tokens': AppConstants.deepSeekMaxTokens,
            'temperature': 0.7,
            // No JSON format - plain text response
          },
        );

        final content = response.data['choices'][0]['message']['content'];
        return content.toString();
      } on DioException catch (e) {
        retryCount++;

        if (e.response?.statusCode == 429) {
          throw const AIServiceException(
            message: 'AI is busy, please try again.',
            isRateLimited: true,
          );
        }

        if (retryCount < AppConstants.deepSeekMaxRetries) {
          await Future.delayed(AppConstants.retryDelays[retryCount - 1]);
        }
      }
    }

    throw const AIServiceException(
      message: 'AI service is currently unavailable.',
    );
  }

  /// JSON response API request - Section 7.5 error handling
  Future<Map<String, dynamic>> _makeRequest({
    required String systemPrompt,
    required String userPrompt,
  }) async {
    int retryCount = 0;

    while (retryCount < AppConstants.deepSeekMaxRetries) {
      try {
        final response = await _dio.post(
          '/chat/completions',
          data: {
            'model': AppConstants.deepSeekModel,
            'messages': [
              {'role': 'system', 'content': systemPrompt},
              {'role': 'user', 'content': userPrompt},
            ],
            'max_tokens': AppConstants.deepSeekMaxTokens,
            'temperature': 0.7,
            'response_format': {'type': 'json_object'},
          },
        );

        final content = response.data['choices'][0]['message']['content'];
        return jsonDecode(content) as Map<String, dynamic>;
      } on DioException catch (e) {
        retryCount++;

        if (e.type == DioExceptionType.connectionTimeout ||
            e.type == DioExceptionType.receiveTimeout) {
          if (retryCount >= AppConstants.deepSeekMaxRetries) {
            throw AIServiceException(
              message: 'AI response timed out. Please try again.',
              isTimeout: true,
              retryCount: retryCount,
              originalError: e,
            );
          }
        }

        if (e.response?.statusCode == 429) {
          // Rate limit exceeded - Section 7.5
          throw const AIServiceException(
            message: 'AI is busy, please try again.',
            isRateLimited: true,
          );
        }

        // Exponential backoff - 1s, 2s, 4s
        if (retryCount < AppConstants.deepSeekMaxRetries) {
          await Future.delayed(AppConstants.retryDelays[retryCount - 1]);
        }
      }
    }

    throw const AIServiceException(
      message: 'AI service is currently unavailable.',
    );
  }

  /// Parse comparison result
  ComparisonResult _parseComparisonResult(Map<String, dynamic> data) {
    final scoresData = data['scores'] as Map<String, dynamic>? ?? {};
    final scores = scoresData.map((key, value) {
      final scoreMap = value as Map<String, dynamic>;
      return MapEntry(
        key,
        ProductScore(
          productId: key,
          totalScore: (scoreMap['totalScore'] as num?)?.toDouble() ?? 0.0,
          personalFit: (scoreMap['personalFit'] as num?)?.toDouble() ?? 0.0,
          community: (scoreMap['community'] as num?)?.toDouble() ?? 0.0,
          expert: (scoreMap['expert'] as num?)?.toDouble() ?? 0.0,
          valuePrice: (scoreMap['valuePrice'] as num?)?.toDouble() ?? 0.0,
          pros: List<String>.from(scoreMap['pros'] ?? []),
          cons: List<String>.from(scoreMap['cons'] ?? []),
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

  /// Parse recommendation result
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

  String _buildComparisonPrompt(CompareRequest req) {
    return jsonEncode({
      'products': req.productIds,
      'userProfile': req.userProfile,
      'country': req.country,
      'category': req.category,
    });
  }
}
