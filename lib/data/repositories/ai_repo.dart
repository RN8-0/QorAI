/// Compair - AI Repository (including Link Analysis)
/// Blueprint Section 7, 9

import 'package:flutter/foundation.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/data/datasources/pb_ds.dart';
import 'package:compair/data/models/other_models.dart';
import 'package:compair/domain/entities/ai_entities.dart';
import 'package:compair/domain/entities/user_entity.dart';
import 'package:compair/services/ai_service.dart';
import 'package:compair/services/metadata_service.dart';

class AIRepository {
  final AIService _aiService;
  final PbDataSource _pbDS;
  final MetadataService? _metadataService;

  AIRepository({
    required AIService aiService,
    required PbDataSource pbDS,
    MetadataService? metadataService,
  }) : _aiService = aiService,
       _pbDS = pbDS,
       _metadataService = metadataService;

  /// Get recommendations - Section 7.2
  Future<Result<RecommendationResult>> getRecommendations({
    required UserEntity user,
    required String category,
    int limit = 10,
  }) async {
    try {
      final request = RecommendRequest(
        userProfile: {
          'ecosystem': user.ecosystem,
          'budgetRange': user.budgetRange,
          'priorities': user.priorities,
          'country': user.country,
        },
        category: category,
        country: user.country,
        limit: limit,
      );

      final result = await _aiService.recommend(request);
      return Success(result);
    } on AIServiceException catch (e) {
      return Failure(e);
    } catch (e) {
      return Failure(ServerException(message: e.toString()));
    }
  }

  /// Analyze link - Section 9.1
  /// 1. Fetch OG tags via Metadata Service (image, title, description)
  /// 2. Send metadata + user profile to AI
  /// 3. Save result to Firestore
  Future<Result<LinkAnalysisResult>> analyzeLink({
    required String url,
    required UserEntity user,
  }) async {
    try {
      // Step 1: Fetch metadata (including image)
      OgMetadata metadata = const OgMetadata();
      if (_metadataService != null) {
        try {
          metadata = await _metadataService.fetchMetadataForSite(url);
          debugPrint(
            '[AIRepo] Metadata fetched for $url: title=${metadata.title}',
          );
        } catch (e) {
          debugPrint(
            '[AIRepo] Metadata fetch failed for $url: $e — continuing',
          );
        }
      }

      // Step 2: AI analysis (enriched with metadata so the model knows
      //         what the product actually is without browsing the URL)
      debugPrint('[AIRepo] Starting AI analysis for: $url');
      final result = await _aiService.analyzeLink(url, user, metadata: metadata);
      debugPrint(
        '[AIRepo] AI analysis done: score=${result.aiScore}, category=${result.category}',
      );

      // Merge metadata with AI result (fill in info AI didn't return from metadata)
      final enrichedResult = LinkAnalysisResult(
        url: url,
        metadata: OgMetadata(
          title: result.metadata.title ?? metadata.title,
          description: result.metadata.description ?? metadata.description,
          image: result.metadata.image ?? metadata.image,
          price: result.metadata.price ?? metadata.price,
          siteName: result.metadata.siteName ?? metadata.siteName,
        ),
        aiScore: result.aiScore,
        aiAnalysis: result.aiAnalysis,
        category: result.category,
        analyzedAt: result.analyzedAt,
        isProduct: result.isProduct,
      );

      // Step 3: Save result to user_links collection
      final link = UserLinkModel(
        id: '',
        userId: user.uid,
        url: url,
        ogMetadata: OgMetadataModel(
          title: enrichedResult.metadata.title,
          description: enrichedResult.metadata.description,
          image: enrichedResult.metadata.image,
          price: enrichedResult.metadata.price,
        ),
        aiScore: enrichedResult.aiScore,
        aiAnalysis: enrichedResult.aiAnalysis,
        category: enrichedResult.category,
        createdAt: DateTime.now(),
      );

      if (user.uid.isEmpty || user.uid == 'anonymous') {
        debugPrint('[AIRepo] Skipping user_links save for anonymous session');
      } else {
        try {
          await _pbDS.saveUserLink(link);
        } catch (e) {
          debugPrint('[AIRepo] user_links save failed for $url: $e');
        }
      }

      return Success(enrichedResult);
    } on AIServiceException catch (e) {
      debugPrint('[AIRepo] analyzeLink AIServiceException: ${e.message}');
      return Failure(e);
    } catch (e) {
      debugPrint('[AIRepo] analyzeLink unexpected error: $e');
      return Failure(ServerException(message: e.toString()));
    }
  }

  /// AI question-answer - Section 7.2
  Future<Result<String>> askQuestion({
    required String question,
    required UserEntity user,
  }) async {
    try {
      final answer = await _aiService.askQuestion(question, user);
      return Success(answer);
    } on AIServiceException catch (e) {
      return Failure(e);
    } catch (e) {
      return Failure(ServerException(message: e.toString()));
    }
  }

  /// User links history
  Future<Result<List<UserLinkModel>>> getUserLinks(
    String userId, {
    int limit = 20,
  }) async {
    try {
      final links = await _pbDS.getUserLinks(userId, limit: limit);
      return Success(links);
    } catch (e) {
      return Failure(ServerException(message: e.toString()));
    }
  }
}
