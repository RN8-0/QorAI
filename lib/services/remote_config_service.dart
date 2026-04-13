import 'package:flutter/foundation.dart';
import 'package:compair/data/datasources/pb_ds.dart';

/// Remote Config servisi — Firebase Remote Config yerine PocketBase app_config koleksiyonu kullanır.
/// app_config dökümanları: {key: string, value: any}
class RemoteConfigService {
  final Map<String, dynamic> _config = {
    'show_paywall_on_start': false,
    'ai_comparison_limit_free': 3,
    'premium_price_display': '₺199.99 / year',
    'feature_link_paste_enabled': true,
    'deepseek_api_key': '',
    'revenuecat_apple_api_key': '',
    'revenuecat_android_api_key': '',
    'gemini_api_key': '',
  };

  RemoteConfigService._();

  factory RemoteConfigService.fromPb(PbDataSource ds) {
    final service = RemoteConfigService._();
    // Arka planda yükle (app start'ı bloklamaz)
    service._loadFromPb(ds);
    return service;
  }

  Future<void> _loadFromPb(PbDataSource ds) async {
    try {
      final remote = await ds.getAppConfig();
      _config.addAll(remote);
      debugPrint('[RemoteConfig] Loaded ${remote.length} keys from PocketBase');
    } catch (e) {
      debugPrint('[RemoteConfig] Failed to load from PocketBase: $e');
    }
  }

  Future<void> initialize() async {
    // No-op — yükleme constructor'da başladı
  }

  bool   get showPaywallOnStart  => _config['show_paywall_on_start'] as bool?   ?? false;
  int    get freeAiLimit         => (_config['ai_comparison_limit_free'] as num?)?.toInt() ?? 3;
  String get premiumPriceText    => _config['premium_price_display']   as String? ?? '₺199.99 / year';
  bool   get isLinkPasteEnabled  => _config['feature_link_paste_enabled'] as bool? ?? true;
  String get deepSeekApiKey      => _config['deepseek_api_key']        as String? ?? '';
  String get revenueCatAppleKey  => _config['revenuecat_apple_api_key'] as String? ?? '';
  String get revenueCatAndroidKey=> _config['revenuecat_android_api_key'] as String? ?? '';
  String get geminiApiKey        => _config['gemini_api_key']          as String? ?? '';
}
