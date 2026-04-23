/// Qor AI - Environment Configuration
/// API keys loaded from --dart-define or PocketBase RemoteConfig.
library;

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

  static String get geminiApiKey {
    return const String.fromEnvironment('GEMINI_API_KEY', defaultValue: '');
  }

  static String get deepSeekApiKey {
    return const String.fromEnvironment('DEEPSEEK_API_KEY', defaultValue: '');
  }

  static bool get isProduction => _environment == Environment.production;
  static bool get isDevelopment => _environment == Environment.development;

  static String get revenueCatAppleKey {
    return const String.fromEnvironment('REVENUECAT_API_KEY', defaultValue: '');
  }

  static String get revenueCatAndroidKey {
    return const String.fromEnvironment('REVENUECAT_ANDROID_API_KEY', defaultValue: '');
  }
}
