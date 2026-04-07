/// Compair - Compare Products Use Case
/// Blueprint Section 7.2, 8.1

import 'package:compair/core/errors.dart';
import 'package:compair/domain/entities/ai_entities.dart';
import 'package:compair/domain/entities/user_entity.dart';

/// Repository interface (Domain layer - no dependencies)
abstract class ComparisonRepository {
  Future<Result<ComparisonResult>> compareProducts({
    required List<String> productIds,
    required UserEntity user,
  });

  Future<Result<List<Map<String, dynamic>>>> getComparisons({
    required String userId,
    int limit = 20,
    String? lastDocId,
  });

  Future<Result<void>> saveComparison(Map<String, dynamic> comparison);

  Future<Result<void>> updateUserChoice({
    required String comparisonId,
    required String productId,
  });
}

/// Compare products use case
class CompareProductsUseCase {
  final ComparisonRepository _repository;

  CompareProductsUseCase(this._repository);

  /// Compare two or more products
  /// Blueprint Section 7.2 - Comparison AI Task
  Future<Result<ComparisonResult>> execute({
    required List<String> productIds,
    required UserEntity user,
  }) async {
    // Validation
    if (productIds.length < 2) {
      return const Failure(ValidationException(
        message: 'At least 2 products are required for comparison',
      ));
    }

    if (productIds.length > 5) {
      return const Failure(ValidationException(
        message: 'A maximum of 5 products can be compared',
      ));
    }

    return _repository.compareProducts(
      productIds: productIds,
      user: user,
    );
  }
}
