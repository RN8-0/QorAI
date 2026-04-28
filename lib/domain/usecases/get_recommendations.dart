/// Qor AI - Get Recommendations Use Case
/// Blueprint Section 6.1, 7.2
library;

import 'package:qor_ai/core/errors.dart';
import 'package:qor_ai/domain/entities/ai_entities.dart';
import 'package:qor_ai/domain/entities/user_entity.dart';

/// Recommendation repository interface
abstract class RecommendationRepository {
  Future<Result<RecommendationResult>> getRecommendations({
    required UserEntity user,
    required String category,
    int limit = 10,
  });

  Future<Result<List<Map<String, dynamic>>>> getTrendingProducts({
    required String country,
    required String category,
    int limit = 10,
  });

  Future<Result<List<Map<String, dynamic>>>> getMostChosenProducts({
    required String category,
    int limit = 10,
  });

  Future<Result<List<Map<String, dynamic>>>> getNewProducts({
    int limit = 10,
  });
}

/// Get personalized recommendations use case
/// Blueprint Section 6.1 - "Just For You" section
class GetRecommendationsUseCase {
  final RecommendationRepository _repository;

  GetRecommendationsUseCase(this._repository);

  Future<Result<RecommendationResult>> execute({
    required UserEntity user,
    required String category,
    int limit = 10,
  }) async {
    if (category.isEmpty) {
      return const Failure(ValidationException(
        message: 'Category must be specified',
      ));
    }

    return _repository.getRecommendations(
      user: user,
      category: category,
      limit: limit,
    );
  }
}

/// Get trending products use case - Section 6.1 "Trending This Week"
class GetTrendingProductsUseCase {
  final RecommendationRepository _repository;

  GetTrendingProductsUseCase(this._repository);

  Future<Result<List<Map<String, dynamic>>>> execute({
    required String country,
    required String category,
    int limit = 10,
  }) {
    return _repository.getTrendingProducts(
      country: country,
      category: category,
      limit: limit,
    );
  }
}
