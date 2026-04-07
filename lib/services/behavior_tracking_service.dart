import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class BehaviorTrackingService {
  static final BehaviorTrackingService _instance = BehaviorTrackingService._();
  BehaviorTrackingService._();
  factory BehaviorTrackingService() => _instance;

  String? get _uid => FirebaseAuth.instance.currentUser?.uid;
  DocumentReference _userDoc(String uid) =>
      FirebaseFirestore.instance.collection('users').doc(uid);

  DocumentReference get _globalAggregates =>
      FirebaseFirestore.instance.collection('algorithm_signals').doc('global_aggregates');

  // ─── Core Product Events ──────────────────────────────────────────────────

  void trackProductView(String productId, String category) {
    final uid = _uid; if (uid == null) return;
    _userDoc(uid)
        .collection('behavior').doc('product_views')
        .collection('items').doc(productId)
        .set({
          'productId': productId,
          'category': category,
          'viewCount': FieldValue.increment(1),
          'lastViewed': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true))
        .catchError((_) {});

    // General algorithm: aggregate category views across all users
    if (category.isNotEmpty) {
      _globalAggregates.set({
        'cat_$category': FieldValue.increment(1),
        'total_views': FieldValue.increment(1),
      }, SetOptions(merge: true)).catchError((_) {});
    }
  }

  void trackViewDuration(String productId, int seconds) {
    if (seconds <= 0) return;
    final uid = _uid; if (uid == null) return;
    _userDoc(uid)
        .collection('behavior').doc('product_views')
        .collection('items').doc(productId)
        .set({'totalTimeSeconds': FieldValue.increment(seconds)},
            SetOptions(merge: true))
        .catchError((_) {});
  }

  void trackComparison(List<String> productIds) {
    final uid = _uid; if (uid == null) return;
    _userDoc(uid)
        .collection('behavior').doc('comparisons')
        .collection('items').add({
          'productIds': productIds,
          'at': FieldValue.serverTimestamp(),
        })
        .then((_) {}, onError: (_) {});

    // General algorithm: track comparison frequency
    _globalAggregates.set({
      'total_comparisons': FieldValue.increment(1),
    }, SetOptions(merge: true)).catchError((_) {});
  }

  void trackPriceTap(String productId) {
    final uid = _uid; if (uid == null) return;
    _userDoc(uid)
        .collection('behavior').doc('price_taps')
        .collection('items').doc(productId)
        .set({
          'count': FieldValue.increment(1),
          'lastTapped': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true))
        .catchError((_) {});
  }

  void trackFavorite(String productId, bool isFavorited) {
    final uid = _uid; if (uid == null) return;
    _userDoc(uid)
        .collection('behavior').doc('favorites')
        .collection('items').doc(productId)
        .set({
          'isFavorited': isFavorited,
          'at': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true))
        .catchError((_) {});
  }

  void trackSearch(String query, {String? tappedProductId}) {
    if (query.trim().isEmpty) return;
    final uid = _uid; if (uid == null) return;
    _userDoc(uid)
        .collection('behavior').doc('searches')
        .collection('items').add({
          'query': query.trim(),
          'tappedProductId': tappedProductId,
          'at': FieldValue.serverTimestamp(),
        })
        .then((_) {}, onError: (_) {});

    // General algorithm: aggregate popular search terms
    _globalAggregates.set({
      'total_searches': FieldValue.increment(1),
    }, SetOptions(merge: true)).catchError((_) {});
  }

  void trackCategoryVisit(String category) {
    final uid = _uid; if (uid == null) return;
    _userDoc(uid)
        .collection('behavior').doc('category_visits')
        .collection('items').doc(category)
        .set({
          'count': FieldValue.increment(1),
          'lastVisited': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true))
        .catchError((_) {});
  }

  // ─── Extended Tracking: Scroll Depth ──────────────────────────────────────

  void trackScrollDepth(String screenId, double maxDepthPercent) {
    if (maxDepthPercent <= 0) return;
    final uid = _uid; if (uid == null) return;
    _userDoc(uid)
        .collection('behavior').doc('engagement')
        .collection('scroll_depth').doc(screenId)
        .set({
          'maxDepth': maxDepthPercent,
          'at': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true))
        .catchError((_) {});
  }

  // ─── Extended Tracking: Spec Focus ────────────────────────────────────────

  void trackSpecFocus(String productId, String specKey) {
    final uid = _uid; if (uid == null) return;
    _userDoc(uid)
        .collection('behavior').doc('spec_focus')
        .collection('items').doc('${productId}_$specKey')
        .set({
          'productId': productId,
          'specKey': specKey,
          'viewCount': FieldValue.increment(1),
          'lastViewed': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true))
        .catchError((_) {});
  }

  // ─── Extended Tracking: AI Chat Interactions ──────────────────────────────

  void trackAIChatQuery(String query, {String? relatedProductId}) {
    final uid = _uid; if (uid == null) return;
    _userDoc(uid)
        .collection('behavior').doc('ai_chat')
        .collection('items').add({
          'query': query,
          'relatedProductId': relatedProductId,
          'at': FieldValue.serverTimestamp(),
        })
        .then((_) {}, onError: (_) {});
  }

  // ─── Extended Tracking: Negative Signals ──────────────────────────────────

  void trackDismissal(String productId, String reason) {
    final uid = _uid; if (uid == null) return;
    _userDoc(uid)
        .collection('behavior').doc('dismissals')
        .collection('items').doc(productId)
        .set({
          'reason': reason,
          'count': FieldValue.increment(1),
          'at': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true))
        .catchError((_) {});
  }

  // ─── Extended Tracking: Session Summaries ─────────────────────────────────

  void trackSessionSummary({
    required int durationSeconds,
    required int productsViewed,
    required int comparisons,
    required int searches,
    required List<String> categoriesVisited,
  }) {
    final uid = _uid; if (uid == null) return;
    _userDoc(uid)
        .collection('behavior').doc('sessions')
        .collection('items').add({
          'duration': durationSeconds,
          'productsViewed': productsViewed,
          'comparisons': comparisons,
          'searches': searches,
          'categories': categoriesVisited,
          'at': FieldValue.serverTimestamp(),
        })
        .then((_) {}, onError: (_) {});
  }

  // ─── Extended Tracking: Time-of-day Patterns ──────────────────────────────

  void trackActiveHour() {
    final uid = _uid; if (uid == null) return;
    final hour = DateTime.now().hour.toString().padLeft(2, '0');
    _userDoc(uid)
        .collection('behavior').doc('time_patterns')
        .set({
          'hour_$hour': FieldValue.increment(1),
          'lastActive': FieldValue.serverTimestamp(),
        }, SetOptions(merge: true))
        .catchError((_) {});
  }

  // ─── Extended Tracking: Link Paste Events ─────────────────────────────────

  void trackLinkPaste(String url, String? detectedCategory) {
    final uid = _uid; if (uid == null) return;
    _userDoc(uid)
        .collection('behavior').doc('link_pastes')
        .collection('items').add({
          'url': url,
          'category': detectedCategory,
          'at': FieldValue.serverTimestamp(),
        })
        .then((_) {}, onError: (_) {});
  }

  /// Persist quiz answers for algorithm training.
  /// Stores both per-user answers (personal algorithm) and aggregate
  /// category preference signals (general algorithm).
  void trackQuizAnswers({
    required String url,
    required String? category,
    required List<Map<String, dynamic>> answeredQuestions,
    required double matchScore,
  }) {
    final uid = _uid;
    if (uid == null || answeredQuestions.isEmpty) return;

    // Personal algorithm: store full quiz session
    _userDoc(uid)
        .collection('behavior')
        .doc('quiz_answers')
        .collection('sessions')
        .add({
          'url': url,
          'category': category,
          'matchScore': matchScore,
          'answers': answeredQuestions,
          'at': FieldValue.serverTimestamp(),
        })
        .then((_) {}, onError: (_) {});

    // Personal algorithm: update preference weights from quiz answers
    final prefs = <String, int>{};
    for (final qa in answeredQuestions) {
      final answer = qa['selectedOption'] as String?;
      if (answer != null && answer.isNotEmpty) {
        final key = answer.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '_');
        prefs[key] = (prefs[key] ?? 0) + 1;
      }
    }
    if (prefs.isNotEmpty) {
      final updates = <String, dynamic>{};
      for (final entry in prefs.entries) {
        updates['pref_${entry.key}'] = FieldValue.increment(entry.value);
      }
      updates['totalQuizzes'] = FieldValue.increment(1);
      updates['lastQuizAt'] = FieldValue.serverTimestamp();
      if (category != null) {
        updates['cat_$category'] = FieldValue.increment(1);
      }
      _userDoc(uid)
          .collection('behavior')
          .doc('quiz_preferences')
          .set(updates, SetOptions(merge: true))
          .catchError((_) {});
    }

    // General algorithm: aggregate signals (anonymous)
    if (category != null) {
      FirebaseFirestore.instance
          .collection('algorithm_signals')
          .doc('quiz_aggregates')
          .set({
            'total_quizzes': FieldValue.increment(1),
            'cat_$category': FieldValue.increment(1),
            'avg_score_sum': FieldValue.increment(matchScore),
          }, SetOptions(merge: true))
          .catchError((_) {});
    }
  }
}
