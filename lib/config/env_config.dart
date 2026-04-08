/// Compair - Environment Configuration
/// Blueprint Section 2.1

import 'package:firebase_remote_config/firebase_remote_config.dart';

enum Environment {
  development,
  staging,
  production,
}

class EnvConfig {
  static Environment _environment = Environment.development;

  static Environment get environment => _environment;

  static void init(Environment env) {
    _environment = env;
  }

  /// Gemini API Key (for AI chatbot + subscription scraper)
  /// Priority: 1) Firebase Remote Config  2) compile-time env var  3) dev hardcoded
  static String get geminiApiKey {
    try {
      final rcKey = FirebaseRemoteConfig.instance.getString('gemini_api_key');
      if (rcKey.isNotEmpty) return rcKey;
    } catch (_) {}
    const envKey = String.fromEnvironment('GEMINI_API_KEY', defaultValue: '');
    if (envKey.isNotEmpty) return envKey;
    // Development: set GEMINI_API_KEY env var or configure in Firebase Remote Config
    return '';
  }

  /// DeepSeek API Key
  /// Priority: 1) Firebase Remote Config  2) compile-time env var  3) dev hardcoded
  static String get deepSeekApiKey {
    // 1. Firebase Remote Config (set in Firebase Console for production)
    try {
      final rcKey = FirebaseRemoteConfig.instance.getString('deepseek_api_key');
      if (rcKey.isNotEmpty) return rcKey;
    } catch (_) {}

    // 2. Compile-time env var (CI/CD build flag)
    const envKey = String.fromEnvironment('DEEPSEEK_API_KEY', defaultValue: '');
    if (envKey.isNotEmpty) return envKey;

    // 3. Development fallback — NEVER ship this to production without Remote Config set
    // Development: set DEEPSEEK_API_KEY env var or configure in Firebase Remote Config
    return '';
  }

  /// Firebase Project bilgileri
  static bool get isProduction => _environment == Environment.production;
  static bool get isDevelopment => _environment == Environment.development;

  /// Algolia Config
  static String get algoliaAppId =>
      const String.fromEnvironment('ALGOLIA_APP_ID', defaultValue: '');
  static String get algoliaApiKey =>
      const String.fromEnvironment('ALGOLIA_API_KEY', defaultValue: '');

  /// RevenueCat Config — keys are set in Firebase Remote Config (Firebase Console)
  /// Apple key:   Remote Config key = 'revenuecat_apple_api_key'
  /// Android key: Remote Config key = 'revenuecat_android_api_key'
  static String get revenueCatAppleKey {
    try {
      final rcKey = FirebaseRemoteConfig.instance.getString('revenuecat_apple_api_key');
      if (rcKey.isNotEmpty) return rcKey;
    } catch (_) {}
    return const String.fromEnvironment('REVENUECAT_API_KEY', defaultValue: '');
  }

  static String get revenueCatAndroidKey {
    try {
      final rcKey = FirebaseRemoteConfig.instance.getString('revenuecat_android_api_key');
      if (rcKey.isNotEmpty) return rcKey;
    } catch (_) {}
    return const String.fromEnvironment('REVENUECAT_ANDROID_API_KEY', defaultValue: '');
  }

  /// Mixpanel Config - Section 2
  static String get mixpanelToken =>
      const String.fromEnvironment('MIXPANEL_TOKEN', defaultValue: '');

  /// YouTube Data API v3 Key
  static String get youtubeApiKey =>
      const String.fromEnvironment('YOUTUBE_API_KEY', defaultValue: '');

  /// Google Custom Search API Key
  static String get googleSearchApiKey =>
      const String.fromEnvironment('GOOGLE_SEARCH_API_KEY', defaultValue: '');

  /// Google Custom Search Engine ID
  static String get googleSearchEngineId =>
      const String.fromEnvironment('GOOGLE_SEARCH_ENGINE_ID', defaultValue: '');

  /// IP Geolocation API - Section 11.2
  static const String ipApiUrl = 'http://ip-api.com/json';
  static const String ipInfoUrl = 'https://ipinfo.io/json';
}
