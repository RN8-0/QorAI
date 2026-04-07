import 'package:firebase_remote_config/firebase_remote_config.dart';
import 'package:flutter/foundation.dart';

class RemoteConfigService {
  final FirebaseRemoteConfig _remoteConfig;

  RemoteConfigService(this._remoteConfig);

  Future<void> initialize() async {
    try {
      await _remoteConfig.setConfigSettings(RemoteConfigSettings(
        fetchTimeout: const Duration(minutes: 1),
        minimumFetchInterval: kDebugMode ? Duration.zero : const Duration(hours: 12),
      ));
      
      await _remoteConfig.setDefaults({
        'show_paywall_on_start': false,
        'ai_comparison_limit_free': 3,
        'premium_price_display': '₺199.99 / year',
        'feature_link_paste_enabled': true,
        // API keys — set real values in Firebase Console → Remote Config
        'deepseek_api_key': '',
        'revenuecat_apple_api_key': '',
        'revenuecat_android_api_key': '',
      });

      await _remoteConfig.fetchAndActivate();
    } catch (e) {
      debugPrint('Remote Config initialization failed: $e');
    }
  }

  bool get showPaywallOnStart => _remoteConfig.getBool('show_paywall_on_start');
  int get freeAiLimit => _remoteConfig.getInt('ai_comparison_limit_free');
  String get premiumPriceText => _remoteConfig.getString('premium_price_display');
  bool get isLinkPasteEnabled => _remoteConfig.getBool('feature_link_paste_enabled');

  /// DeepSeek API key — set in Firebase Console Remote Config
  String get deepSeekApiKey => _remoteConfig.getString('deepseek_api_key');

  /// RevenueCat keys — set in Firebase Console Remote Config per platform
  String get revenueCatAppleKey   => _remoteConfig.getString('revenuecat_apple_api_key');
  String get revenueCatAndroidKey => _remoteConfig.getString('revenuecat_android_api_key');
}
