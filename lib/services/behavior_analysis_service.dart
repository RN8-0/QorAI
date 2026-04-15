/// Compair — Behavior Analysis Service
library;

import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import 'package:compair/core/constants.dart';
import 'package:compair/core/pb_client.dart';
import 'package:compair/data/models/user_model.dart';

class BehaviorProfile {
  final Map<String, double> categoryInterestScores;
  final Map<String, double> behaviorWeightAdjustments;
  final List<String> strongInterestCategories;
  final double purchaseIntentScore;
  final List<String> recentlyViewedProductIds;
  final int profileCompletenessScore;

  const BehaviorProfile({
    required this.categoryInterestScores,
    required this.behaviorWeightAdjustments,
    required this.strongInterestCategories,
    required this.purchaseIntentScore,
    required this.recentlyViewedProductIds,
    required this.profileCompletenessScore,
  });

  static BehaviorProfile empty() => const BehaviorProfile(
    categoryInterestScores: {},
    behaviorWeightAdjustments: {},
    strongInterestCategories: [],
    purchaseIntentScore: 0.0,
    recentlyViewedProductIds: [],
    profileCompletenessScore: 0,
  );
}

class BehaviorAnalysisService {
  static final BehaviorAnalysisService _instance = BehaviorAnalysisService._();
  BehaviorAnalysisService._();
  factory BehaviorAnalysisService() => _instance;

  List<Map<String, dynamic>> _asMapList(dynamic raw) {
    if (raw is! List) {
      return const [];
    }
    return raw
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }

  Map<String, int> _asIntMap(dynamic raw) {
    if (raw is! Map) {
      return const {};
    }
    return raw.map(
      (key, value) => MapEntry(key.toString(), (value as num?)?.toInt() ?? 0),
    );
  }

  int _profileCompleteness(UserModel user) {
    final checks = <bool>[
      user.displayName.trim().isNotEmpty,
      user.email.trim().isNotEmpty,
      (user.photoURL ?? '').trim().isNotEmpty,
      user.quizCompleted,
      user.priorities.isNotEmpty,
      user.currentDevices.isNotEmpty,
      user.interestCategories.isNotEmpty,
      user.budgetRange.trim().isNotEmpty && user.budgetRange != 'mid',
      user.ecosystem.trim().isNotEmpty && user.ecosystem != 'mixed',
      (user.ageRange ?? '').trim().isNotEmpty,
      (user.profession ?? '').trim().isNotEmpty,
      user.profileVector.isNotEmpty,
    ];
    final completed = checks.where((value) => value).length;
    return ((completed / checks.length) * 100).round();
  }

  Future<List<String>> _recentlyViewedIds(String uid) async {
    try {
      final result = await pb
          .collection('recently_viewed')
          .getList(
            page: 1,
            perPage: 30,
            filter: 'userId = "$uid"',
            sort: '-created',
          );
      final seen = <String>{};
      final ids = <String>[];
      for (final item in result.items) {
        final productId = (item.data['productId'] as String? ?? '').trim();
        if (productId.isEmpty || !seen.add(productId)) {
          continue;
        }
        ids.add(productId);
      }
      return ids;
    } catch (e) {
      debugPrint('[BehaviorAnalysis] recently_viewed load failed: $e');
      return [];
    }
  }

  Future<BehaviorProfile> analyzeBehavior(String uid) async {
    try {
      final record = await pb
          .collection(AppConstants.usersCollection)
          .getOne(uid);
      final user = UserModel.fromPb(record);
      final data = Map<String, dynamic>.from(record.data);

      final viewHistory = _asMapList(data['productViewHistory']);
      final categoryVisits = _asMapList(data['categoryVisitHistory']);
      final searchHistory = _asMapList(data['searchHistory']);
      final comparisonHistory = _asMapList(data['comparisonHistory']);
      final affiliateTapHistory = _asMapList(data['affiliateTapHistory']);
      final aiChatHistory = _asMapList(data['aiChatHistory']);
      final favoriteHistory = _asMapList(data['favoriteHistory']);
      final categoryViewCounts = _asIntMap(data['categoryViewCounts']);
      final categoryVisitCounts = _asIntMap(data['categoryVisitCounts']);

      final categoryScores = <String, double>{};

      void bump(String category, double value) {
        final normalized = category.trim().toLowerCase();
        if (normalized.isEmpty) {
          return;
        }
        categoryScores.update(
          normalized,
          (current) => current + value,
          ifAbsent: () => value,
        );
      }

      for (final entry in viewHistory) {
        bump((entry['category'] as String?) ?? '', 1.4);
      }
      for (final entry in categoryVisits) {
        bump((entry['category'] as String?) ?? '', 0.9);
      }
      for (final entry in user.interestCategories) {
        bump(entry, 1.1);
      }
      if ((user.primaryCategory ?? '').trim().isNotEmpty) {
        bump(user.primaryCategory!, 1.8);
      }
      categoryViewCounts.forEach((category, count) {
        bump(category, count * 0.35);
      });
      categoryVisitCounts.forEach((category, count) {
        bump(category, count * 0.25);
      });

      final sortedCategories = categoryScores.entries.toList()
        ..sort((a, b) => b.value.compareTo(a.value));
      final maxScore = sortedCategories.isEmpty
          ? 1.0
          : sortedCategories.first.value;
      final normalizedScores = <String, double>{
        for (final entry in sortedCategories)
          entry.key: double.parse((entry.value / maxScore).toStringAsFixed(3)),
      };

      final strongInterestCategories = sortedCategories
          .where(
            (entry) =>
                entry.value >= math.max(1.5, maxScore * 0.45) ||
                user.interestCategories.contains(entry.key),
          )
          .take(5)
          .map((entry) => entry.key)
          .toList();

      final recentIds = await _recentlyViewedIds(uid);
      if (recentIds.isEmpty) {
        for (final entry in viewHistory) {
          final productId = (entry['productId'] as String? ?? '').trim();
          if (productId.isNotEmpty && !recentIds.contains(productId)) {
            recentIds.add(productId);
          }
          if (recentIds.length >= 20) {
            break;
          }
        }
      }

      final comparisonCount = math.max(
        user.comparisonsCount,
        comparisonHistory.length,
      );
      final affiliateCount = math.max(
        user.affiliateClicks,
        affiliateTapHistory.length,
      );
      final favoriteCount = math.max(
        user.favorites.length,
        favoriteHistory.where((item) => item['isFavorited'] == true).length,
      );
      final recentSearchCount = searchHistory.take(20).length;
      final aiUsageCount = aiChatHistory.take(20).length;

      final purchaseIntent =
          (recentIds.take(10).length * 0.07 +
                  comparisonCount * 0.12 +
                  affiliateCount * 0.14 +
                  favoriteCount * 0.08 +
                  recentSearchCount * 0.04 +
                  aiUsageCount * 0.03)
              .clamp(0.0, 1.0);

      return BehaviorProfile(
        categoryInterestScores: normalizedScores,
        behaviorWeightAdjustments: {
          for (final entry in sortedCategories.take(6))
            entry.key: double.parse(
              (entry.value / (maxScore == 0 ? 1 : maxScore)).toStringAsFixed(3),
            ),
        },
        strongInterestCategories: strongInterestCategories,
        purchaseIntentScore: purchaseIntent,
        recentlyViewedProductIds: recentIds.take(20).toList(),
        profileCompletenessScore: _profileCompleteness(user),
      );
    } catch (e) {
      debugPrint('[BehaviorAnalysis] analyzeBehavior failed: $e');
      return BehaviorProfile.empty();
    }
  }
}
