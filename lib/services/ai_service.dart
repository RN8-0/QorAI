/// Qor AI - AI Service Interface
///
/// Abstract contract for the AI backend. The primary implementation
/// is [DeepSeekService] (DeepSeek V3 — much cheaper).
/// [GeminiService] is used ONLY for vision (analyzeImage) and
/// web-grounded queries (groundedQuery, enhancedSubscriptionAnalysis).
library;

import 'package:qor_ai/domain/entities/ai_entities.dart';
import 'package:qor_ai/domain/entities/user_entity.dart';

/// AI Service interface — every method receives user context for
/// personalized responses.
abstract class AIService {
  /// Compare 2+ products side by side.
  Future<ComparisonResult> compare(CompareRequest req);

  /// Generate personalized product recommendations.
  Future<RecommendationResult> recommend(RecommendRequest req);

  /// Analyze a product URL against the user profile.
  /// [metadata] — pre-fetched OG tags (title, description, price, etc.).
  /// Passing metadata lets text-only models (DeepSeek) understand what the
  /// product actually is without needing to visit the URL.
  Future<LinkAnalysisResult> analyzeLink(
    String url,
    UserEntity profile, {
    OgMetadata? metadata,
  });

  /// Calculate a single-product compatibility score.
  Future<double> calculateScore(ScoreRequest req);

  /// Natural-language question answering.
  Future<String> askQuestion(String question, UserEntity profile);
}
