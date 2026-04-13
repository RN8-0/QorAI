/// Compair — Behavior Analysis Service (stubbed for PocketBase migration)
library;

class BehaviorProfile {
  final Map<String, double> categoryInterestScores;
  final Map<String, double> behaviorWeightAdjustments;
  final List<String> strongInterestCategories;
  final double purchaseIntentScore;
  final List<String> recentlyViewedProductIds;

  const BehaviorProfile({
    required this.categoryInterestScores,
    required this.behaviorWeightAdjustments,
    required this.strongInterestCategories,
    required this.purchaseIntentScore,
    required this.recentlyViewedProductIds,
  });

  static BehaviorProfile empty() => const BehaviorProfile(
    categoryInterestScores: {},
    behaviorWeightAdjustments: {},
    strongInterestCategories: [],
    purchaseIntentScore: 0.0,
    recentlyViewedProductIds: [],
  );
}

class BehaviorAnalysisService {
  static final BehaviorAnalysisService _instance = BehaviorAnalysisService._();
  BehaviorAnalysisService._();
  factory BehaviorAnalysisService() => _instance;

  Future<BehaviorProfile> analyzeBehavior(String uid) async {
    return BehaviorProfile.empty();
  }
}
