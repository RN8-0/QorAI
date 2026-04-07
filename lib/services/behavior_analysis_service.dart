import 'package:cloud_firestore/cloud_firestore.dart';

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
    try {
      final fs = FirebaseFirestore.instance;
      final behaviorBase = fs.collection('users').doc(uid).collection('behavior');

      final results = await Future.wait([
        behaviorBase.doc('product_views').collection('items').orderBy('lastViewed', descending: true).limit(50).get(),
        behaviorBase.doc('price_taps').collection('items').get(),
        behaviorBase.doc('favorites').collection('items').where('isFavorited', isEqualTo: true).get(),
        behaviorBase.doc('comparisons').collection('items').limit(30).get(),
        behaviorBase.doc('category_visits').collection('items').get(),
      ]);

      final viewsSnap = results[0];
      final priceTapsSnap = results[1];
      final favoritesSnap = results[2];
      final comparisonsSnap = results[3];
      final categoryVisitsSnap = results[4];

      final Map<String, double> rawScores = {};

      int totalViews = 0;
      int totalPriceTaps = 0;
      final List<String> recentlyViewed = [];

      for (final doc in viewsSnap.docs) {
        final d = doc.data();
        final cat = (d['category'] as String? ?? '').toLowerCase();
        final viewCount = (d['viewCount'] as num? ?? 0).toDouble();
        final totalTime = (d['totalTimeSeconds'] as num? ?? 0).toDouble();
        if (cat.isNotEmpty) {
          rawScores[cat] = (rawScores[cat] ?? 0) + viewCount * 0.3 + totalTime * 0.002;
        }
        totalViews += viewCount.toInt();
        recentlyViewed.add(doc.id);
      }

      for (final doc in priceTapsSnap.docs) {
        final d = doc.data();
        final count = (d['count'] as num? ?? 0).toDouble();
        totalPriceTaps += count.toInt();
      }

      for (final doc in favoritesSnap.docs) {
        final favViews = viewsSnap.docs.where((v) => v.id == doc.id).toList();
        if (favViews.isNotEmpty) {
          final cat = (favViews.first.data()['category'] as String? ?? '').toLowerCase();
          if (cat.isNotEmpty) rawScores[cat] = (rawScores[cat] ?? 0) + 0.5;
        }
      }

      for (final doc in comparisonsSnap.docs) {
        final ids = List<String>.from(doc.data()['productIds'] ?? []);
        for (final id in ids) {
          final matched = viewsSnap.docs.where((v) => v.id == id).toList();
          if (matched.isNotEmpty) {
            final cat = (matched.first.data()['category'] as String? ?? '').toLowerCase();
            if (cat.isNotEmpty) rawScores[cat] = (rawScores[cat] ?? 0) + 0.3;
          }
        }
      }

      for (final doc in categoryVisitsSnap.docs) {
        final count = (doc.data()['count'] as num? ?? 0).toDouble();
        final cat = doc.id.toLowerCase();
        rawScores[cat] = (rawScores[cat] ?? 0) + count * 0.2;
      }

      final maxScore = rawScores.values.fold(0.0, (a, b) => a > b ? a : b);
      final Map<String, double> categoryInterestScores = {};
      if (maxScore > 0) {
        for (final e in rawScores.entries) {
          categoryInterestScores[e.key] = (e.value / maxScore).clamp(0.0, 1.0);
        }
      }

      final strongInterestCategories = categoryInterestScores.entries
          .where((e) => e.value >= 0.6)
          .map((e) => e.key)
          .toList()
        ..sort((a, b) => categoryInterestScores[b]!.compareTo(categoryInterestScores[a]!));

      final purchaseIntentScore = totalViews > 0
          ? (totalPriceTaps / totalViews).clamp(0.0, 1.0)
          : 0.0;

      final Map<String, double> adjustments = {};

      double adj(String cat, double threshold) =>
          (categoryInterestScores[cat] ?? 0.0) >= threshold ? 1.0 : 0.0;

      if (adj('cameras', 0.7) > 0 || adj('camera', 0.7) > 0) {
        adjustments['camera'] = ((adjustments['camera'] ?? 0) + 0.2).clamp(-0.3, 0.3);
      }
      if (adj('gaming', 0.7) > 0) {
        adjustments['gaming'] = ((adjustments['gaming'] ?? 0) + 0.25).clamp(-0.3, 0.3);
      }
      if (adj('laptops', 0.6) > 0 || adj('desktops', 0.6) > 0) {
        adjustments['productivity'] = ((adjustments['productivity'] ?? 0) + 0.15).clamp(-0.3, 0.3);
        adjustments['performance'] = ((adjustments['performance'] ?? 0) + 0.10).clamp(-0.3, 0.3);
      }
      if (adj('headphones', 0.6) > 0 || adj('speakers', 0.6) > 0) {
        adjustments['audio_quality'] = ((adjustments['audio_quality'] ?? 0) + 0.2).clamp(-0.3, 0.3);
      }
      if (purchaseIntentScore > 0.5) {
        adjustments['price_sensitivity'] = ((adjustments['price_sensitivity'] ?? 0) - 0.1).clamp(-0.3, 0.3);
      }

      return BehaviorProfile(
        categoryInterestScores: categoryInterestScores,
        behaviorWeightAdjustments: adjustments,
        strongInterestCategories: strongInterestCategories,
        purchaseIntentScore: purchaseIntentScore,
        recentlyViewedProductIds: recentlyViewed.take(20).toList(),
      );
    } catch (_) {
      return BehaviorProfile.empty();
    }
  }
}
