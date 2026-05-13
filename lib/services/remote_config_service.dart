import 'package:qor_ai/core/constants.dart';
import 'package:qor_ai/data/datasources/pb_ds.dart';

/// Remote Config servisi — public PocketBase config koleksiyonunu kullanır.
class RemoteConfigService {
  final Map<String, dynamic> _config = {
    'show_paywall_on_start': false,
    'ai_comparison_limit_free': AppConstants.freeComparisonLimit,
    'premium_price_display': '₺199.99 / year',
    'feature_link_paste_enabled': true,
    'free_daily_ai_credit_limit': AppConstants.freeDailyAiCreditLimit,
    'signup_bonus_q_coins': AppConstants.signupBonusQCoins,
    'free_ai_question_limit': AppConstants.freeAiQuestionLimit,
    'free_link_paste_limit': AppConstants.freeLinkPasteLimit,
    'free_subscription_analysis_limit': AppConstants.freeSubscriptionAnalysisLimit,
  };
  PbDataSource? _pbDataSource;
  Future<void>? _loadFuture;

  RemoteConfigService._();

  factory RemoteConfigService.fromPb(
    PbDataSource ds, {
    Duration? deferredLoad,
  }) {
    final service = RemoteConfigService._();
    service._pbDataSource = ds;
    if (deferredLoad == null) {
      service._ensureLoaded();
    } else {
      Future.delayed(deferredLoad, service._ensureLoaded);
    }
    return service;
  }

  Future<void> _ensureLoaded() {
    if (_loadFuture != null) return _loadFuture!;
    final ds = _pbDataSource;
    if (ds == null) return Future.value();
    _loadFuture = _loadFromPb(ds);
    return _loadFuture!;
  }

  Future<void> _loadFromPb(PbDataSource ds) async {
    final remote = await ds.getPublicConfig();
    _config.addAll(remote);
  }

  Future<void> initialize() async {
    await _ensureLoaded();
  }

  bool   get showPaywallOnStart         => _config['show_paywall_on_start']            as bool?   ?? false;
  int    get freeAiLimit                => (_config['ai_comparison_limit_free']         as num?)?.toInt() ?? AppConstants.freeComparisonLimit;
  String get premiumPriceText           => _config['premium_price_display']             as String? ?? '₺199.99 / year';
  bool   get isLinkPasteEnabled         => _config['feature_link_paste_enabled']        as bool?   ?? true;
  int    get freeDailyAiCreditLimit     => (_config['free_daily_ai_credit_limit']       as num?)?.toInt() ?? AppConstants.freeDailyAiCreditLimit;
  int    get signupBonusQCoins          => (_config['signup_bonus_q_coins']             as num?)?.toInt() ?? AppConstants.signupBonusQCoins;
  int    get freeAiQuestionLimit        => (_config['free_ai_question_limit']           as num?)?.toInt() ?? AppConstants.freeAiQuestionLimit;
  int    get freeLinkPasteLimit         => (_config['free_link_paste_limit']            as num?)?.toInt() ?? AppConstants.freeLinkPasteLimit;
  int    get freeSubscriptionAnalysisLimit => (_config['free_subscription_analysis_limit'] as num?)?.toInt() ?? AppConstants.freeSubscriptionAnalysisLimit;
}
