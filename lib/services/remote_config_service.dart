import 'package:compair/data/datasources/pb_ds.dart';

/// Remote Config servisi — public PocketBase config koleksiyonunu kullanır.
class RemoteConfigService {
  final Map<String, dynamic> _config = {
    'show_paywall_on_start': false,
    'ai_comparison_limit_free': 3,
    'premium_price_display': '₺199.99 / year',
    'feature_link_paste_enabled': true,
  };

  RemoteConfigService._();

  factory RemoteConfigService.fromPb(PbDataSource ds) {
    final service = RemoteConfigService._();
    service._loadFromPb(ds);
    return service;
  }

  Future<void> _loadFromPb(PbDataSource ds) async {
    final remote = await ds.getPublicConfig();
    _config.addAll(remote);
  }

  Future<void> initialize() async {
    // No-op — yükleme constructor'da başladı.
  }

  bool   get showPaywallOnStart  => _config['show_paywall_on_start'] as bool?   ?? false;
  int    get freeAiLimit         => (_config['ai_comparison_limit_free'] as num?)?.toInt() ?? 3;
  String get premiumPriceText    => _config['premium_price_display']   as String? ?? '₺199.99 / year';
  bool   get isLinkPasteEnabled  => _config['feature_link_paste_enabled'] as bool? ?? true;
}
