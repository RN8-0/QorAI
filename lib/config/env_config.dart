/// Compair - Environment Configuration
/// Blueprint Section 2.1

/// API keys for RemoteConfig/PocketBase bakımı yapılıyor (firebase_remote_config kaldırıldı).
/// Öncelik sırası: 1) compile-time --dart-define  2) varsayılan (boş)

enum Environment {
  development,
  staging,
  production,
}

// RemoteConfigService instance'ına dışarıdan erişim için global setter
// (Providers yüklendikten sonra PocketBase'den gelen key'leri iletir)
String _pbGeminiKey = '';
String _pbDeepSeekKey = '';
String _pbRcAppleKey = '';
String _pbRcAndroidKey = '';

void setPbApiKeys({
  String gemini = '',
  String deepSeek = '',
  String rcApple = '',
  String rcAndroid = '',
}) {
  _pbGeminiKey = gemini;
  _pbDeepSeekKey = deepSeek;
  _pbRcAppleKey = rcApple;
  _pbRcAndroidKey = rcAndroid;
}

class EnvConfig {
  static Environment _environment = Environment.development;

  static Environment get environment => _environment;

  static void init(Environment env) {
    _environment = env;
  }

  static String get geminiApiKey {
    if (_pbGeminiKey.isNotEmpty) return _pbGeminiKey;
    return const String.fromEnvironment('GEMINI_API_KEY', defaultValue: '');
  }

  static String get deepSeekApiKey {
    if (_pbDeepSeekKey.isNotEmpty) return _pbDeepSeekKey;
    return const String.fromEnvironment('DEEPSEEK_API_KEY', defaultValue: '');
  }

  static bool get isProduction => _environment == Environment.production;
  static bool get isDevelopment => _environment == Environment.development;

  static String get revenueCatAppleKey {
    if (_pbRcAppleKey.isNotEmpty) return _pbRcAppleKey;
    return const String.fromEnvironment('REVENUECAT_API_KEY', defaultValue: '');
  }

  static String get revenueCatAndroidKey {
    if (_pbRcAndroidKey.isNotEmpty) return _pbRcAndroidKey;
    return const String.fromEnvironment('REVENUECAT_ANDROID_API_KEY', defaultValue: '');
  }

  static String get youtubeApiKey =>
      const String.fromEnvironment('YOUTUBE_API_KEY', defaultValue: '');

  static const String ipApiUrl = 'http://ip-api.com/json';
  static const String ipInfoUrl = 'https://ipinfo.io/json';
}
