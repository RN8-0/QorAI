/// Compair - AI Service Interface
///
/// Abstract contract for the AI backend. The primary implementation
/// is [DeepSeekService] (DeepSeek V3 — much cheaper).
/// [GeminiService] is used ONLY for vision (analyzeImage) and
/// web-grounded queries (groundedQuery, enhancedSubscriptionAnalysis).
library;

import 'package:compair/domain/entities/ai_entities.dart';
import 'package:compair/domain/entities/user_entity.dart';

/// AI Service interface — every method receives user context for
/// personalized responses.
abstract class AIService {
  /// Compare 2+ products side by side.
  Future<ComparisonResult> compare(CompareRequest req);

  /// Generate personalized product recommendations.
  Future<RecommendationResult> recommend(RecommendRequest req);

  /// Analyze a product URL against the user profile.
  Future<LinkAnalysisResult> analyzeLink(String url, UserEntity profile);

  /// Calculate a single-product compatibility score.
  Future<double> calculateScore(ScoreRequest req);

  /// Natural-language question answering.
  Future<String> askQuestion(String question, UserEntity profile);
}
