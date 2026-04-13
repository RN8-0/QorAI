/// Compair - Firebase Configuration (analytics + crashlytics only)
/// Blueprint Section 2, 21.1

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';

class FirebaseConfig {
  FirebaseConfig._();

  static FirebaseAnalytics? _analytics;

  /// Firebase initialization (analytics + crashlytics only)
  static Future<void> initialize() async {
    await Firebase.initializeApp();

    // Crashlytics - Section 21.1
    if (!kDebugMode) {
      FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;
    }

    // Analytics
    _analytics = FirebaseAnalytics.instance;
  }

  static FirebaseAnalytics get analytics =>
      _analytics ?? FirebaseAnalytics.instance;
}
