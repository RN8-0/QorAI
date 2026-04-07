/// Compair - Firebase Configuration
/// Blueprint Section 2, 21.1

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:firebase_performance/firebase_performance.dart';
import 'package:firebase_remote_config/firebase_remote_config.dart';
import 'package:flutter/foundation.dart';

class FirebaseConfig {
  FirebaseConfig._();

  static FirebaseAnalytics? _analytics;
  static FirebaseRemoteConfig? _remoteConfig;

  /// Firebase initialization
  static Future<void> initialize() async {
    await Firebase.initializeApp();

    // Crashlytics - Section 21.1
    if (!kDebugMode) {
      FlutterError.onError = FirebaseCrashlytics.instance.recordFlutterFatalError;
    }

    // Performance Monitoring - Section 21.1
    await FirebasePerformance.instance.setPerformanceCollectionEnabled(!kDebugMode);

    // Analytics
    _analytics = FirebaseAnalytics.instance;

    // Remote Config - Section 7.3, 16
    _remoteConfig = FirebaseRemoteConfig.instance;
    await _remoteConfig!.setConfigSettings(RemoteConfigSettings(
      fetchTimeout: const Duration(minutes: 1),
      minimumFetchInterval: kDebugMode
          ? const Duration(minutes: 5)
          : const Duration(hours: 1),
    ));
    await _remoteConfig!.setDefaults(_defaultRemoteConfig);
    await _remoteConfig!.fetchAndActivate();
  }

  static FirebaseAnalytics get analytics =>
      _analytics ?? FirebaseAnalytics.instance;

  static FirebaseRemoteConfig get remoteConfig =>
      _remoteConfig ?? FirebaseRemoteConfig.instance;

  /// Remote Config default values
  static const Map<String, dynamic> _defaultRemoteConfig = {
    // AI Prompt templates - Section 7.3
    'ai_comparison_system_prompt': _defaultComparisonPrompt,
    'ai_recommendation_system_prompt': '',
    'ai_link_analysis_system_prompt': '',

    // Feature flags
    'feature_link_paste_enabled': true,
    'feature_premium_enabled': true,
    'feature_trends_enabled': true,

    // Limits
    'free_daily_comparison_limit': 5,
    'free_daily_ai_question_limit': 3,
    'free_daily_link_paste_limit': 3,

    // Pricing
    'monthly_pro_price': 4.99,
    'yearly_pro_price': 29.99,

    // AI model selection
    'ai_provider': 'deepseek', // deepseek, claude, gpt
  };

  /// Default comparison prompt - Section 7.3
  static const String _defaultComparisonPrompt = '''
You are Compair's AI decision engine. Task: compare products/services
based on the user's profile and provide personal compatibility percentages.

RULES:
- Calculate a 0-100 compatibility percentage for each product
- Score formula: Personal Fit 40% + Community 25% + Expert 20% + V/P 15%
- Write 3-5 pros (✓) and 1-3 cons (✗) for each recommendation
- Consider the user's budget, ecosystem, and priority preferences
- Response must be in JSON format

USER PROFILE: {userProfile}
PRODUCTS TO COMPARE: {products}
COUNTRY: {country}
''';

  /// Get value from Remote Config
  static String getString(String key) => remoteConfig.getString(key);
  static bool getBool(String key) => remoteConfig.getBool(key);
  static int getInt(String key) => remoteConfig.getInt(key);
  static double getDouble(String key) => remoteConfig.getDouble(key);
}
