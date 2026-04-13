const fs = require('fs');

// ─── behavior_tracking_service.dart ─────────────────────────────────────────
fs.writeFileSync('lib/services/behavior_tracking_service.dart', `/// Compair — Behavior Tracking Service (stubbed for PocketBase migration)
/// Full subcollection tracking to be re-implemented with PocketBase later.
library;

import 'package:compair/core/pb_client.dart';

class BehaviorTrackingService {
  static final BehaviorTrackingService _instance = BehaviorTrackingService._();
  BehaviorTrackingService._();
  factory BehaviorTrackingService() => _instance;

  String? get _uid => pb.authStore.isValid ? pb.authStore.record?.id : null;

  void trackProductView(String productId, String category) {}
  void trackViewDuration(String productId, int seconds) {}
  void trackComparison(List<String> productIds) {}
  void trackPriceTap(String productId) {}
  void trackFavorite(String productId, bool isFavorited) {}
  void trackSearch(String query, {String? tappedProductId}) {}
  void trackCategoryVisit(String category) {}
  void trackScrollDepth(String screenId, double maxDepthPercent) {}
  void trackSpecFocus(String productId, String specKey) {}
  void trackAIChatQuery(String query, {String? relatedProductId}) {}
  void trackDismissal(String productId, String reason) {}
  void trackSessionSummary({
    required int durationSeconds,
    required int productsViewed,
    required int comparisons,
    required int searches,
    required List<String> categoriesVisited,
  }) {}
  void trackHourlyActivity() {}
  void trackQuizPreference(String key, String value) {}
  void trackTimePattern() {}
  void trackAffiliateTap(String productId) {}
}
`, 'utf8');

// ─── behavior_analysis_service.dart ─────────────────────────────────────────
fs.writeFileSync('lib/services/behavior_analysis_service.dart', `/// Compair — Behavior Analysis Service (stubbed for PocketBase migration)
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
`, 'utf8');

// ─── spec_direction_service.dart (remove Firestore, keep static logic) ───────
const specContent = fs.readFileSync('lib/services/spec_direction_service.dart', 'utf8');
const specFixed = specContent
  .replace("import 'package:cloud_firestore/cloud_firestore.dart';\n", '')
  .replace(/\/\/ Firestore overrides cache[\s\S]*?bool _loaded = false;/, '  // Overrides disabled — static directions only\n  bool _loaded = false;')
  .replace(/\/\/ 1\. Firestore async loading[\s\S]*?_firestoreOverrides[\s\S]*?_loaded = true;[\s\S]*?}/m, '  // stub: no overrides\n    _loaded = true;')
  .replace(/await FirebaseFirestore[\s\S]*?\.get\(\)[^;]*;[\s\S]*?if \(snap\.exists[\s\S]*?\}/g, '// no-op: overrides disabled');
// Just stub the loadOverrides method
const specFixed2 = specContent.replace(
  "import 'package:cloud_firestore/cloud_firestore.dart';\n",
  ''
);
// Write the simpler version - just remove the Firestore import and stub the load method
const specLines = specFixed2.split('\n');
let inLoadMethod = false;
let braceCount = 0;
const specOut = [];
for (let i = 0; i < specLines.length; i++) {
  const line = specLines[i];
  if (line.includes('Future<void> loadOverrides()') || (inLoadMethod && line.includes('Future<void> loadOverrides'))) {
    inLoadMethod = true;
    braceCount = 0;
  }
  if (inLoadMethod) {
    braceCount += (line.match(/\{/g) || []).length;
    braceCount -= (line.match(/\}/g) || []).length;
    if (braceCount <= 0 && line.includes('}')) {
      specOut.push('  Future<void> loadOverrides() async { _loaded = true; }');
      inLoadMethod = false;
    }
    continue;
  }
  // Also remove FirebaseFirestore references
  if (!line.includes('FirebaseFirestore') && !line.includes('_firestoreOverrides')) {
    specOut.push(line);
  } else if (line.includes('_firestoreOverrides')) {
    specOut.push(line.replace('_firestoreOverrides[', '// removed: ').replace(/= .*/, ''));
  }
}
fs.writeFileSync('lib/services/spec_direction_service.dart', specOut.join('\n'), 'utf8');

console.log('behavior_tracking_service.dart: done');
console.log('behavior_analysis_service.dart: done');
console.log('spec_direction_service.dart: done (partial)');
