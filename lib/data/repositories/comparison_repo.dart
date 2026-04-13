/// Compair - Comparison Repository Implementation
/// Blueprint Section 3.1, 7.2
library;

import 'package:compair/core/errors.dart';
import 'package:compair/data/datasources/pb_ds.dart';
import 'package:compair/data/models/comparison_model.dart';
import 'package:compair/domain/entities/ai_entities.dart';
import 'package:compair/domain/entities/comparison_entity.dart';
import 'package:compair/domain/entities/user_entity.dart';
import 'package:flutter/foundation.dart';
import 'package:compair/services/ai_service.dart';
import 'package:uuid/uuid.dart';

class ComparisonRepositoryImpl {
  final PbDataSource _firebaseDS;
  final AIService _aiService;

  ComparisonRepositoryImpl({
    required PbDataSource firebaseDS,
    required AIService aiService,
  })  : _firebaseDS = firebaseDS,
        _aiService = aiService;

  /// Compare products - using AI
  Future<Result<ComparisonResult>> compareProducts({
    required List<String> productIds,
    required UserEntity user,
  }) async {
    try {
      // AI comparison request
      final request = CompareRequest(
        productIds: productIds,
        userProfile: {
          'ecosystem': user.ecosystem,
          'budgetRange': user.budgetRange,
          'priorities': user.priorities,
          'currentDevices': user.currentDevices,
          'subscriptions': user.subscriptions,
          'language': user.language,
        },
        country: user.country,
        category: '', // Will be determined from products
      );

      final result = await _aiService.compare(request);

      // Save to Firestore
      final comparison = ComparisonModel(
        id: const Uuid().v4(),
        userId: user.uid,
        itemIds: productIds,
        scores: result.scores.map((key, value) => MapEntry(
              key,
              ComparisonScore(
                totalScore: value.totalScore,
                personalFitScore: value.personalFit,
                communityScore: value.community,
                expertScore: value.expert,
                valuePriceScore: value.valuePrice,
                pros: value.pros,
                cons: value.cons,
              ),
            )),
        aiAnalysis: result.analysis,
        winnerId: result.winnerId,
        category: request.category,
        createdAt: DateTime.now(),
      );

      await _firebaseDS.createComparison(comparison);

      return Success(result);
    } on AIServiceException catch (e) {
      // AI fallback - Section 7.5
      return Failure(e);
    } catch (e) {
      return Failure(ServerException(message: e.toString()));
    }
  }

  /// User comparison history
  Future<Result<List<ComparisonEntity>>> getUserComparisons(
    String userId, {
    int limit = 20,
  }) async {
    try {
      final comparisons = await _firebaseDS.getUserComparisons(
        userId,
        limit: limit,
      );
      return Success(comparisons);
    } catch (e) {
      return Failure(FirestoreException(message: e.toString()));
    }
  }

  /// Save a manual comparison (without AI scores)
  Future<void> saveManualComparison({
    required String userId,
    required List<String> productIds,
    required String category,
    String? title,
  }) async {
    try {
      final comparison = ComparisonModel(
        id: const Uuid().v4(),
        userId: userId,
        itemIds: productIds,
        scores: const {},
        aiAnalysis: '',
        category: category,
        createdAt: DateTime.now(),
        title: title,
      );
      await _firebaseDS.createComparison(comparison);
    } catch (e) {
      debugPrint('saveManualComparison error: $e');
      rethrow;
    }
  }

  /// Update user choice - Section 10.1, 10.2
  Future<Result<void>> updateUserChoice({
    required String comparisonId,
    required String productId,
    required String userId,
  }) async {
    try {
      // 1. Update user choice in comparison
      await _firebaseDS.updateComparison(
        comparisonId: comparisonId,
        data: {
          'userChoiceId': productId,
          'updatedAt': DateTime.now().toIso8601String(),
        },
      );

      // 2. Add product to user's ownedProducts list (profile enrichment)
      await _firebaseDS.addToUserOwnedProducts(
        userId: userId,
        productId: productId,
      );

      return const Success(null);
    } catch (e) {
      return Failure(FirestoreException(message: e.toString()));
    }
  }

  /// Get admin-created comparisons
  Future<Result<List<ComparisonEntity>>> getPredefinedComparisons({
    String? category,
    int limit = 10,
  }) async {
    try {
      final comparisons = await _firebaseDS.getPredefinedComparisons(
        category: category,
        limit: limit,
      );
      return Success(comparisons);
    } catch (e) {
      return Failure(FirestoreException(message: e.toString()));
    }
  }
}
