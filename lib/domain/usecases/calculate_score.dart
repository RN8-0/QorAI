/// Qor AI - Calculate Score Use Case
/// Blueprint Section 8.1, 8.2
///
/// Score Formula:
/// Total = Personal Fit × 0.40 + Community × 0.25 + Expert × 0.20 + P/P × 0.15

import 'package:qor_ai/domain/entities/comparison_entity.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';
import 'package:qor_ai/domain/entities/user_entity.dart';

class CalculateScoreUseCase {
  /// Calculate fitness score for a single product - Section 8.1
  ComparisonScore execute({
    required ProductEntity product,
    required UserEntity user,
    double? communityRating,
    double? expertRating,
  }) {
    final personalFit = _calculatePersonalFit(product, user);
    final community = _calculateCommunityScore(product, communityRating);
    final expert = _calculateExpertScore(product, expertRating);
    final valuePrice = _calculateValuePriceScore(product, user);

    return ComparisonScore.calculate(
      personalFit: personalFit,
      community: community,
      expert: expert,
      valuePrice: valuePrice,
    );
  }

  /// A) Personal Fit Score (40%) - Section 8.2
  double _calculatePersonalFit(ProductEntity product, UserEntity user) {
    double score = 0;

    // Ecosystem fit (0-25 points)
    score += _calculateEcosystemFit(product, user) * 25;

    // Budget fit (0-25 points)
    score += _calculateBudgetFit(product, user) * 25;

    // Priority match (0-25 points)
    score += _calculatePriorityMatch(product, user) * 25;

    // Current device compatibility (0-25 points)
    score += _calculateDeviceCompatibility(product, user) * 25;

    // Normalize to 100
    return score.clamp(0, 100);
  }

  /// Calculate ecosystem fit
  double _calculateEcosystemFit(ProductEntity product, UserEntity user) {
    final productEcosystem = _detectProductEcosystem(product);

    if (user.ecosystem == 'mixed') return 0.7;
    if (user.ecosystem == productEcosystem) return 1.0;
    return 0.3;
  }

  String _detectProductEcosystem(ProductEntity product) {
    final name = product.name.toLowerCase();
    final tags = product.tags.map((t) => t.toLowerCase()).toList();

    if (name.contains('apple') ||
        name.contains('iphone') ||
        name.contains('macbook') ||
        name.contains('ipad') ||
        tags.contains('apple')) {
      return 'apple';
    }
    if (name.contains('samsung') ||
        name.contains('android') ||
        name.contains('pixel') ||
        tags.contains('android')) {
      return 'android';
    }
    return 'mixed';
  }

  /// Calculate budget fit
  double _calculateBudgetFit(ProductEntity product, UserEntity user) {
    final price = product.prices[user.country] ?? product.prices.values.firstOrNull ?? 0;

    switch (user.budgetRange) {
      case 'low':
        if (price < 500) return 1.0;
        if (price < 1000) return 0.5;
        return 0.2;
      case 'mid':
        if (price >= 500 && price <= 1500) return 1.0;
        if (price < 500) return 0.7;
        return 0.4;
      case 'high':
        if (price >= 1000 && price <= 3000) return 1.0;
        if (price < 1000) return 0.5;
        return 0.7;
      case 'premium':
        return 0.8; // Doesn't matter = any price range accepted
      default:
        return 0.5;
    }
  }

  /// Calculate priority match
  double _calculatePriorityMatch(ProductEntity product, UserEntity user) {
    if (user.priorities.isEmpty) return 0.5;

    double matchScore = 0;
    int matchCount = 0;

    for (final priority in user.priorities) {
      final hasMatch = product.pros.any(
        (pro) => pro.toLowerCase().contains(priority.toLowerCase()),
      );
      if (hasMatch) matchCount++;
    }

    matchScore = matchCount / user.priorities.length;
    return matchScore;
  }

  /// Calculate current device compatibility
  double _calculateDeviceCompatibility(ProductEntity product, UserEntity user) {
    if (user.currentDevices.isEmpty) return 0.5;

    // Check integration with current devices
    final productTags = product.tags.map((t) => t.toLowerCase()).toSet();
    int compatibleCount = 0;

    for (final device in user.currentDevices) {
      if (productTags.contains(device.toLowerCase())) {
        compatibleCount++;
      }
    }

    return user.currentDevices.isNotEmpty
        ? (compatibleCount / user.currentDevices.length).clamp(0.0, 1.0)
        : 0.5;
  }

  /// B) Community Reviews Score (25%) - Section 8.2
  double _calculateCommunityScore(
      ProductEntity product, double? communityRating) {
    double score = 0;

    // App Store / Play Store rating (0-40 points)
    final storeRating = communityRating ?? product.ratings.community;
    score += (storeRating / 5.0) * 40;

    // Reddit sentiment analysis (0-30 points) - will come from AI
    score += 15; // Default middle value

    // In-app Qor AI user reviews (0-30 points)
    final reviewScore = product.ratings.count > 0
        ? (product.ratings.community / 5.0) * 30
        : 15;
    score += reviewScore;

    return score.clamp(0, 100);
  }

  /// C) Expert Evaluation Score (20%) - Section 8.2
  double _calculateExpertScore(ProductEntity product, double? expertRating) {
    double score = 0;

    // Tech sites average score (0-50 points)
    final techScore = expertRating ?? product.ratings.expert;
    score += (techScore / 10.0) * 50;

    // Professional review sites (0-50 points)
    score += (techScore / 10.0) * 50;

    return score.clamp(0, 100);
  }

  /// D) Price/Performance Score (15%) - Section 8.2
  double _calculateValuePriceScore(ProductEntity product, UserEntity user) {
    double score = 0;

    final price = product.prices[user.country] ?? product.prices.values.firstOrNull ?? 0;

    // Absolute price (0-40 points) - Lower price = higher score
    if (price <= 0) {
      score += 40; // Free
    } else if (price < 500) {
      score += 35;
    } else if (price < 1000) {
      score += 25;
    } else if (price < 2000) {
      score += 15;
    } else {
      score += 5;
    }

    // Price/feature ratio (0-30 points) - Based on spec count
    final specCount = product.specs.length;
    score += (specCount > 0 ? (specCount / 10).clamp(0.0, 1.0) * 30 : 15);

    // Price trend (0-30 points) - Default for now
    score += 15;

    return score.clamp(0, 100);
  }
}
