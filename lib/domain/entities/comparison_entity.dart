/// Qor AI - Comparison Entity (Domain Layer - Pure Dart)
/// Blueprint Section 4.3
library;

import 'package:equatable/equatable.dart';

class ComparisonEntity extends Equatable {
  final String id;
  final String userId;
  final List<String> itemIds; // Compared product/service IDs
  final Map<String, ComparisonScore> scores; // productId -> score
  final String aiAnalysis; // DeepSeek AI analysis result
  final String? winnerId; // Highest scored product ID
  final String? userChoiceId; // User's chosen product ID
  final String? title; // E.g.: iPhone 16 Pro vs S24 Ultra
  final bool isFeatured; // Featured comparisons on homepage
  final bool isPredefined; // Admin-created curated comparisons (Battles)
  final String category;
  final DateTime createdAt;
  final bool isPublic;
  final int occurrenceCount;

  const ComparisonEntity({
    required this.id,
    required this.userId,
    required this.itemIds,
    this.scores = const {},
    this.aiAnalysis = '',
    this.winnerId,
    this.userChoiceId,
    required this.category,
    required this.createdAt,
    this.isPublic = false,
    this.title,
    this.isFeatured = false,
    this.isPredefined = false,
    this.occurrenceCount = 1,
  });

  /// Convenience getters for screens
  List<String> get productIds => itemIds;
  String get categoryId => category;

  @override
  List<Object?> get props => [id, userId, createdAt];
}

/// Fitness Percentage Sub-Scores - Section 8.1, 8.2
class ComparisonScore extends Equatable {
  final double totalScore; // Total fitness percentage (0-100)
  final double personalFitScore; // Personal Fit (40% weight)
  final double communityScore; // Community Reviews (25% weight)
  final double expertScore; // Expert Evaluation (20% weight)
  final double valuePriceScore; // Price/Performance (15% weight)
  final List<String> pros; // Pros (3-5 items)
  final List<String> cons; // Cons (1-3 items)

  const ComparisonScore({
    required this.totalScore,
    required this.personalFitScore,
    required this.communityScore,
    required this.expertScore,
    required this.valuePriceScore,
    this.pros = const [],
    this.cons = const [],
  });

  /// Convenience getters for screens
  double get total => totalScore;
  double get personalFit => personalFitScore;
  double get valuePrice => valuePriceScore;

  @override
  List<Object?> get props => [totalScore];

  /// Score formula - Section 8.1
  /// Total = Personal Fit × 0.40 + Community × 0.25 + Expert × 0.20 + P/P × 0.15
  factory ComparisonScore.calculate({
    required double personalFit,
    required double community,
    required double expert,
    required double valuePrice,
    List<String> pros = const [],
    List<String> cons = const [],
  }) {
    final total =
        (personalFit * 0.40) +
        (community * 0.25) +
        (expert * 0.20) +
        (valuePrice * 0.15);

    return ComparisonScore(
      totalScore: total.clamp(0, 100),
      personalFitScore: personalFit.clamp(0, 100),
      communityScore: community.clamp(0, 100),
      expertScore: expert.clamp(0, 100),
      valuePriceScore: valuePrice.clamp(0, 100),
      pros: pros,
      cons: cons,
    );
  }
}
