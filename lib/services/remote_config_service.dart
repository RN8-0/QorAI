import 'package:qor_ai/core/constants.dart';
import 'package:qor_ai/data/datasources/pb_ds.dart';

/// Remote Config servisi — public PocketBase config koleksiyonunu kullanır.
class RemoteConfigService {
  final Map<String, dynamic> _config = {
    'show_paywall_on_start': false,
    'ai_comparison_limit_free': AppConstants.freeComparisonLimit,
    'premium_price_display': '₺199.99 / year',
    'feature_link_paste_enabled': true,
    'free_ai_question_limit': AppConstants.freeAiQuestionLimit,
    'free_link_paste_limit': AppConstants.freeLinkPasteLimit,
    'free_subscription_analysis_limit': AppConstants.freeSubscriptionAnalysisLimit,
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

  bool   get showPaywallOnStart         => _config['show_paywall_on_start']            as bool?   ?? false;
  int    get freeAiLimit                => (_config['ai_comparison_limit_free']         as num?)?.toInt() ?? AppConstants.freeComparisonLimit;
  String get premiumPriceText           => _config['premium_price_display']             as String? ?? '₺199.99 / year';
  bool   get isLinkPasteEnabled         => _config['feature_link_paste_enabled']        as bool?   ?? true;
  int    get freeAiQuestionLimit        => (_config['free_ai_question_limit']           as num?)?.toInt() ?? AppConstants.freeAiQuestionLimit;
  int    get freeLinkPasteLimit         => (_config['free_link_paste_limit']            as num?)?.toInt() ?? AppConstants.freeLinkPasteLimit;
  int    get freeSubscriptionAnalysisLimit => (_config['free_subscription_analysis_limit'] as num?)?.toInt() ?? AppConstants.freeSubscriptionAnalysisLimit;
}
