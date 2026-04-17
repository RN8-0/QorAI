/// Compair - Subscription Service (Google Play Billing)
/// Direct Google Play integration via in_app_purchase package
///
/// Premium subscription management
/// Free tier limit control
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:compair/core/constants.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/core/pb_client.dart';

/// Subscription status
class SubscriptionStatus {
  final bool isPremium;
  final String? activeProductId;
  final DateTime? purchaseDate;
  final DateTime? expirationDate;

  const SubscriptionStatus({
    this.isPremium = false,
    this.activeProductId,
    this.purchaseDate,
    this.expirationDate,
  });

  static const free = SubscriptionStatus();
}

/// Daily usage counter
class UsageCounter {
  final int comparisons;
  final int aiQuestions;
  final int compareAi;
  final int detailAi;
  final int pcBuilderAi;
  final int linkPastes;
  final int subscriptionAnalyses;
  final String comparisonPeriodKey;
  final String aiPeriodKey;
  final String compareAiPeriodKey;
  final String detailAiPeriodKey;
  final String pcBuilderAiPeriodKey;
  final String linkPeriodKey;
  final String subscriptionPeriodKey;

  const UsageCounter({
    this.comparisons = 0,
    this.aiQuestions = 0,
    this.compareAi = 0,
    this.detailAi = 0,
    this.pcBuilderAi = 0,
    this.linkPastes = 0,
    this.subscriptionAnalyses = 0,
    required this.comparisonPeriodKey,
    required this.aiPeriodKey,
    required this.compareAiPeriodKey,
    required this.detailAiPeriodKey,
    required this.pcBuilderAiPeriodKey,
    required this.linkPeriodKey,
    required this.subscriptionPeriodKey,
  });

  UsageCounter copyWith({
    int? comparisons,
    int? aiQuestions,
    int? compareAi,
    int? detailAi,
    int? pcBuilderAi,
    int? linkPastes,
    int? subscriptionAnalyses,
    String? comparisonPeriodKey,
    String? aiPeriodKey,
    String? compareAiPeriodKey,
    String? detailAiPeriodKey,
    String? pcBuilderAiPeriodKey,
    String? linkPeriodKey,
    String? subscriptionPeriodKey,
  }) {
    return UsageCounter(
      comparisons: comparisons ?? this.comparisons,
      aiQuestions: aiQuestions ?? this.aiQuestions,
      compareAi: compareAi ?? this.compareAi,
      detailAi: detailAi ?? this.detailAi,
      pcBuilderAi: pcBuilderAi ?? this.pcBuilderAi,
      linkPastes: linkPastes ?? this.linkPastes,
      subscriptionAnalyses: subscriptionAnalyses ?? this.subscriptionAnalyses,
      comparisonPeriodKey: comparisonPeriodKey ?? this.comparisonPeriodKey,
      aiPeriodKey: aiPeriodKey ?? this.aiPeriodKey,
      compareAiPeriodKey: compareAiPeriodKey ?? this.compareAiPeriodKey,
      detailAiPeriodKey: detailAiPeriodKey ?? this.detailAiPeriodKey,
      pcBuilderAiPeriodKey: pcBuilderAiPeriodKey ?? this.pcBuilderAiPeriodKey,
      linkPeriodKey: linkPeriodKey ?? this.linkPeriodKey,
      subscriptionPeriodKey:
          subscriptionPeriodKey ?? this.subscriptionPeriodKey,
    );
  }
}

class SubscriptionService extends ChangeNotifier {
  final InAppPurchase _iap = InAppPurchase.instance;
  StreamSubscription<List<PurchaseDetails>>? _purchaseSubscription;

  SubscriptionStatus _status = SubscriptionStatus.free;
  SubscriptionStatus _profileStatus = SubscriptionStatus.free;
  late UsageCounter _usage;
  bool _initialized = false;

  List<ProductDetails> _products = [];
  Completer<Result<bool>>? _purchaseCompleter;
  Completer<void>? _initCompleter;

  SubscriptionStatus get status {
    final pocketBaseStatus = _pocketBaseSnapshotStatus;
    if (!_status.isPremium &&
        !_profileStatus.isPremium &&
        pocketBaseStatus == null) {
      return _status;
    }
    return SubscriptionStatus(
      isPremium: true,
      activeProductId:
          _status.activeProductId ??
          _profileStatus.activeProductId ??
          pocketBaseStatus?.activeProductId,
      purchaseDate:
          _status.purchaseDate ??
          _profileStatus.purchaseDate ??
          pocketBaseStatus?.purchaseDate,
      expirationDate:
          _status.expirationDate ??
          _profileStatus.expirationDate ??
          pocketBaseStatus?.expirationDate,
    );
  }

  bool get isPremium => status.isPremium;
  bool get isInitialized => _initialized;
  List<ProductDetails> get products => _products;
  int get comparisonsUsed => _normalizedUsage().comparisons;
  int get aiQuestionsUsed => _normalizedUsage().aiQuestions;
  int get compareAiUsed => _normalizedUsage().compareAi;
  int get detailAiUsed => _normalizedUsage().detailAi;
  int get pcBuilderAiUsed => _normalizedUsage().pcBuilderAi;
  int get linkPastesUsed => _normalizedUsage().linkPastes;
  int get subscriptionAnalysesUsed => _normalizedUsage().subscriptionAnalyses;

  SubscriptionStatus? get _pocketBaseSnapshotStatus {
    try {
      if (!pb.authStore.isValid) return null;
      final record = pb.authStore.record;
      if (record == null) return null;
      final premiumFlag = record.data['isPremium'] == true;
      final details = record.data['userSubscriptionDetails'];
      if (details is Map) {
        final premium = details['premium'];
        if (premium is Map && premium.isNotEmpty) {
          final productId =
              premium['productId']?.toString() ??
              premium['activeProductId']?.toString();
          final purchaseDate = _firstAvailableDate(premium, const [
            'startedAt',
            'purchaseDate',
            'purchasedAt',
            'originalPurchaseDate',
            'created',
            'updatedAt',
          ]);
          final expirationDate = _firstAvailableDate(premium, const [
            'expiresAt',
            'expirationDate',
            'renewalDate',
            'renewsAt',
          ]);
          return SubscriptionStatus(
            isPremium: premiumFlag || productId != null || purchaseDate != null,
            activeProductId: productId,
            purchaseDate: purchaseDate,
            expirationDate: expirationDate,
          );
        }
      }
      return premiumFlag ? const SubscriptionStatus(isPremium: true) : null;
    } catch (_) {
      return null;
    }
  }

  DateTime? _firstAvailableDate(Map premium, List<String> keys) {
    for (final key in keys) {
      final value = premium[key];
      final parsed = _parseStoredDate(value?.toString());
      if (parsed != null) return parsed;
    }
    return null;
  }

  SubscriptionService() {
    _usage = _emptyUsage();
  }

  /// Initialize Google Play Billing
  Future<void> initialize() async {
    if (_initialized) return;
    if (_initCompleter != null) return _initCompleter!.future;
    _initCompleter = Completer<void>();

    try {
      await _restoreUsageFromLocal();

      final available = await _iap.isAvailable();
      if (!available) {
        debugPrint('⚠️ In-app purchases not available on this device');
        await _restoreFromLocal();
        _initialized = true;
        _initCompleter!.complete();
        return;
      }

      _purchaseSubscription = _iap.purchaseStream.listen(
        _handlePurchaseUpdates,
        onError: (error) {
          debugPrint('⚠️ Purchase stream error: $error');
        },
      );

      await _loadProducts();
      await _restoreFromLocal();

      _initialized = true;
      _initCompleter!.complete();
    } catch (e) {
      debugPrint('⚠️ Subscription service init failed: $e');
      _initialized = true;
      _initCompleter!.complete();
    }
  }

  /// Load product details from Play Store
  Future<void> _loadProducts() async {
    try {
      final ids = <String>{
        AppConstants.yearlySubscriptionId,
        AppConstants.monthlySubscriptionId,
      };

      final response = await _iap.queryProductDetails(ids);
      if (response.error != null) {
        debugPrint('⚠️ Product query error: ${response.error}');
      }
      if (response.notFoundIDs.isNotEmpty) {
        debugPrint(
          '⚠️ Products not found in Play Store: ${response.notFoundIDs}',
        );
      }
      _products = response.productDetails;

      // Sort: yearly first, monthly second
      _products.sort((a, b) {
        if (a.id == AppConstants.yearlySubscriptionId) return -1;
        if (b.id == AppConstants.yearlySubscriptionId) return 1;
        return 0;
      });

      debugPrint('✅ Loaded ${_products.length} products from Play Store');
      for (final p in _products) {
        debugPrint('   → ${p.id}: ${p.price} (${p.title})');
      }
    } catch (e) {
      debugPrint('⚠️ Failed to load products: $e');
    }
  }

  /// Handle purchase stream updates
  void _handlePurchaseUpdates(List<PurchaseDetails> purchases) {
    for (final purchase in purchases) {
      debugPrint(
        '📱 Purchase update: ${purchase.productID} → ${purchase.status}',
      );
      switch (purchase.status) {
        case PurchaseStatus.purchased:
        case PurchaseStatus.restored:
          _verifyAndDeliver(purchase);
          break;
        case PurchaseStatus.error:
          debugPrint('❌ Purchase error: ${purchase.error?.message}');
          _purchaseCompleter?.complete(
            Failure(
              ServerException(
                message: purchase.error?.message ?? 'Purchase failed',
              ),
            ),
          );
          _purchaseCompleter = null;
          if (purchase.pendingCompletePurchase) {
            _iap.completePurchase(purchase);
          }
          break;
        case PurchaseStatus.canceled:
          _purchaseCompleter?.complete(
            const Failure(ValidationException(message: 'Purchase cancelled')),
          );
          _purchaseCompleter = null;
          break;
        case PurchaseStatus.pending:
          debugPrint('⏳ Purchase pending...');
          break;
      }
    }
  }

  /// Verify and deliver purchase
  Future<void> _verifyAndDeliver(PurchaseDetails purchase) async {
    final purchaseDate = _parsePurchaseDate(purchase.transactionDate);
    final expirationDate = _estimateExpirationDate(
      purchase.productID,
      purchaseDate,
    );

    _status = SubscriptionStatus(
      isPremium: true,
      activeProductId: purchase.productID,
      purchaseDate: purchaseDate,
      expirationDate: expirationDate,
    );

    _usage = _emptyUsage();
    await _saveToLocal(
      productId: purchase.productID,
      purchaseDate: purchaseDate,
      expirationDate: expirationDate,
    );
    notifyListeners();

    if (purchase.pendingCompletePurchase) {
      await _iap.completePurchase(purchase);
    }

    _purchaseCompleter?.complete(const Success(true));
    _purchaseCompleter = null;
  }

  /// Save premium status locally
  Future<void> _saveToLocal({
    String? productId,
    required DateTime purchaseDate,
    DateTime? expirationDate,
  }) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('is_premium', true);
    if (productId != null && productId.isNotEmpty) {
      await prefs.setString('active_product_id', productId);
    } else {
      await prefs.remove('active_product_id');
    }
    await prefs.setString(
      'premium_purchase_date',
      purchaseDate.toIso8601String(),
    );
    if (expirationDate != null) {
      await prefs.setString(
        'premium_expiration_date',
        expirationDate.toIso8601String(),
      );
    } else {
      await prefs.remove('premium_expiration_date');
    }
    await _saveUsageToLocal();
  }

  Future<void> _saveUsageToLocal() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'freemium_usage_v2',
      jsonEncode({
        'comparisons': _usage.comparisons,
        'aiQuestions': _usage.aiQuestions,
        'compareAi': _usage.compareAi,
        'detailAi': _usage.detailAi,
        'pcBuilderAi': _usage.pcBuilderAi,
        'linkPastes': _usage.linkPastes,
        'subscriptionAnalyses': _usage.subscriptionAnalyses,
        'comparisonPeriodKey': _usage.comparisonPeriodKey,
        'aiPeriodKey': _usage.aiPeriodKey,
        'compareAiPeriodKey': _usage.compareAiPeriodKey,
        'detailAiPeriodKey': _usage.detailAiPeriodKey,
        'pcBuilderAiPeriodKey': _usage.pcBuilderAiPeriodKey,
        'linkPeriodKey': _usage.linkPeriodKey,
        'subscriptionPeriodKey': _usage.subscriptionPeriodKey,
      }),
    );
  }

  /// Restore from local storage
  Future<void> _restoreFromLocal() async {
    final prefs = await SharedPreferences.getInstance();
    final premium = prefs.getBool('is_premium') ?? false;
    final productId = prefs.getString('active_product_id');
    final purchaseDate = _parseStoredDate(
      prefs.getString('premium_purchase_date'),
    );
    final storedExpiration = _parseStoredDate(
      prefs.getString('premium_expiration_date'),
    );
    if (premium) {
      final effectivePurchaseDate = purchaseDate ?? DateTime.now();
      _status = SubscriptionStatus(
        isPremium: true,
        activeProductId: productId,
        purchaseDate: effectivePurchaseDate,
        expirationDate:
            storedExpiration ??
            (productId != null
                ? _estimateExpirationDate(productId, effectivePurchaseDate)
                : null),
      );
      notifyListeners();
    }
  }

  Future<void> syncProfileEntitlement({
    required bool isPremium,
    String? activeProductId,
    DateTime? purchaseDate,
    DateTime? expirationDate,
  }) async {
    final hadPremium = this.isPremium;
    final nextProfileStatus = isPremium
        ? SubscriptionStatus(
            isPremium: true,
            activeProductId: activeProductId,
            purchaseDate: purchaseDate,
            expirationDate: expirationDate,
          )
        : SubscriptionStatus.free;
    final changed =
        nextProfileStatus.isPremium != _profileStatus.isPremium ||
        nextProfileStatus.activeProductId != _profileStatus.activeProductId ||
        nextProfileStatus.purchaseDate != _profileStatus.purchaseDate ||
        nextProfileStatus.expirationDate != _profileStatus.expirationDate;
    if (!changed) return;

    _profileStatus = nextProfileStatus;

    if (!hadPremium && isPremium) {
      _usage = _emptyUsage();
      await _saveToLocal(
        productId: activeProductId,
        purchaseDate: purchaseDate ?? DateTime.now(),
        expirationDate: expirationDate,
      );
    }

    notifyListeners();
  }

  DateTime _parsePurchaseDate(String? transactionDate) {
    if (transactionDate == null || transactionDate.isEmpty) {
      return DateTime.now();
    }
    final millis = int.tryParse(transactionDate);
    if (millis != null) {
      return DateTime.fromMillisecondsSinceEpoch(millis);
    }
    return DateTime.tryParse(transactionDate) ?? DateTime.now();
  }

  DateTime? _parseStoredDate(String? value) {
    if (value == null || value.isEmpty) return null;
    return DateTime.tryParse(value);
  }

  DateTime _estimateExpirationDate(String productId, DateTime purchaseDate) {
    final trialEnds = purchaseDate.add(Duration(days: AppConstants.trialDays));
    if (productId == AppConstants.yearlySubscriptionId) {
      return trialEnds.add(const Duration(days: 365));
    }
    return trialEnds.add(const Duration(days: 30));
  }

  Future<void> _restoreUsageFromLocal() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('freemium_usage_v2');
    if (raw == null || raw.isEmpty) {
      _usage = _emptyUsage();
      return;
    }

    try {
      final data = jsonDecode(raw) as Map<String, dynamic>;
      _usage = UsageCounter(
        comparisons: data['comparisons'] as int? ?? 0,
        aiQuestions: data['aiQuestions'] as int? ?? 0,
        compareAi: data['compareAi'] as int? ?? 0,
        detailAi: data['detailAi'] as int? ?? 0,
        pcBuilderAi: data['pcBuilderAi'] as int? ?? 0,
        linkPastes: data['linkPastes'] as int? ?? 0,
        subscriptionAnalyses: data['subscriptionAnalyses'] as int? ?? 0,
        comparisonPeriodKey:
            data['comparisonPeriodKey'] as String? ?? _dailyPeriodKey(),
        aiPeriodKey: data['aiPeriodKey'] as String? ?? _dailyPeriodKey(),
        compareAiPeriodKey:
            data['compareAiPeriodKey'] as String? ?? _dailyPeriodKey(),
        detailAiPeriodKey:
            data['detailAiPeriodKey'] as String? ?? _dailyPeriodKey(),
        pcBuilderAiPeriodKey:
            data['pcBuilderAiPeriodKey'] as String? ?? _dailyPeriodKey(),
        linkPeriodKey: data['linkPeriodKey'] as String? ?? _weeklyPeriodKey(),
        subscriptionPeriodKey:
            data['subscriptionPeriodKey'] as String? ?? _monthlyPeriodKey(),
      );
      _usage = _normalizedUsage();
    } catch (_) {
      _usage = _emptyUsage();
    }
  }

  /// Purchase a product
  Future<Result<bool>> purchaseProduct(ProductDetails product) async {
    try {
      _purchaseCompleter = Completer<Result<bool>>();

      final purchaseParam = PurchaseParam(productDetails: product);
      final started = await _iap.buyNonConsumable(purchaseParam: purchaseParam);

      if (!started) {
        _purchaseCompleter = null;
        return const Failure(
          ServerException(message: 'Could not initiate purchase'),
        );
      }

      return await _purchaseCompleter!.future.timeout(
        const Duration(minutes: 5),
        onTimeout: () {
          _purchaseCompleter = null;
          return const Failure(ServerException(message: 'Purchase timed out'));
        },
      );
    } catch (e) {
      _purchaseCompleter = null;
      return Failure(ServerException(message: 'Purchase error: $e'));
    }
  }

  /// Restore purchases from Play Store
  Future<Result<bool>> restorePurchases() async {
    try {
      await _iap.restorePurchases();
      // The purchase stream will handle restored purchases
      await Future.delayed(const Duration(seconds: 3));
      return Success(isPremium);
    } catch (e) {
      return Failure(ServerException(message: 'Restore error: $e'));
    }
  }

  @override
  void dispose() {
    _purchaseSubscription?.cancel();
    super.dispose();
  }

  // ─── Free Tier Limit Control ───

  UsageCounter _emptyUsage() {
    return UsageCounter(
      comparisonPeriodKey: _dailyPeriodKey(),
      aiPeriodKey: _dailyPeriodKey(),
      compareAiPeriodKey: _dailyPeriodKey(),
      detailAiPeriodKey: _dailyPeriodKey(),
      pcBuilderAiPeriodKey: _dailyPeriodKey(),
      linkPeriodKey: _weeklyPeriodKey(),
      subscriptionPeriodKey: _monthlyPeriodKey(),
    );
  }

  String _dailyPeriodKey([DateTime? now]) {
    final date = now ?? DateTime.now();
    return '${date.year}-${date.month}-${date.day}';
  }

  String _weeklyPeriodKey([DateTime? now]) {
    final date = now ?? DateTime.now();
    final startOfWeek = DateTime(
      date.year,
      date.month,
      date.day,
    ).subtract(Duration(days: date.weekday - 1));
    return '${startOfWeek.year}-${startOfWeek.month}-${startOfWeek.day}';
  }

  String _monthlyPeriodKey([DateTime? now]) {
    final date = now ?? DateTime.now();
    return '${date.year}-${date.month}';
  }

  UsageCounter _normalizedUsage() {
    final dailyKey = _dailyPeriodKey();
    final weeklyKey = _weeklyPeriodKey();
    final monthlyKey = _monthlyPeriodKey();
    var changed = false;
    var next = _usage;

    if (next.comparisonPeriodKey != dailyKey) {
      next = next.copyWith(comparisons: 0, comparisonPeriodKey: dailyKey);
      changed = true;
    }
    if (next.aiPeriodKey != dailyKey) {
      next = next.copyWith(aiQuestions: 0, aiPeriodKey: dailyKey);
      changed = true;
    }
    if (next.compareAiPeriodKey != dailyKey) {
      next = next.copyWith(compareAi: 0, compareAiPeriodKey: dailyKey);
      changed = true;
    }
    if (next.detailAiPeriodKey != dailyKey) {
      next = next.copyWith(detailAi: 0, detailAiPeriodKey: dailyKey);
      changed = true;
    }
    if (next.pcBuilderAiPeriodKey != dailyKey) {
      next = next.copyWith(pcBuilderAi: 0, pcBuilderAiPeriodKey: dailyKey);
      changed = true;
    }
    if (next.linkPeriodKey != weeklyKey) {
      next = next.copyWith(linkPastes: 0, linkPeriodKey: weeklyKey);
      changed = true;
    }
    if (next.subscriptionPeriodKey != monthlyKey) {
      next = next.copyWith(
        subscriptionAnalyses: 0,
        subscriptionPeriodKey: monthlyKey,
      );
      changed = true;
    }

    if (changed) {
      _usage = next;
      unawaited(_saveUsageToLocal());
    }

    return next;
  }

  /// Can a comparison be made?
  bool get canCompare {
    return true;
  }

  /// Can an AI question be asked?
  bool get canAskAI {
    if (isPremium) return true;
    return _normalizedUsage().aiQuestions < AppConstants.freeAiQuestionLimit;
  }

  /// Can a premium AI feature be used? (compare screen)
  bool get canUseCompareAi {
    if (isPremium) return true;
    return _normalizedUsage().compareAi < AppConstants.freeCompareAiLimit;
  }

  /// Can a premium AI feature be used? (product detail screen)
  bool get canUseDetailAi {
    if (isPremium) return true;
    return _normalizedUsage().detailAi < AppConstants.freeDetailAiLimit;
  }

  /// Can PC Builder AI analysis be used?
  bool get canUsePcBuilderAi {
    if (isPremium) return true;
    return _normalizedUsage().pcBuilderAi < AppConstants.freePcBuilderAiLimit;
  }

  /// Can a link be pasted?
  bool get canPasteLink {
    if (isPremium) return true;
    return _normalizedUsage().linkPastes < AppConstants.freeLinkPasteLimit;
  }

  /// Can a subscription analysis be performed?
  bool get canAnalyzeSubscription {
    if (isPremium) return true;
    return _normalizedUsage().subscriptionAnalyses <
        AppConstants.freeSubscriptionAnalysisLimit;
  }

  /// Record comparison usage
  Result<void> recordComparison() {
    return const Success(null);
  }

  /// Record AI question usage
  Result<void> recordAIQuestion() {
    final currentUsage = _normalizedUsage();
    if (!canAskAI) {
      return Failure(
        UsageLimitException(
          featureName: 'ai_question',
          currentUsage: currentUsage.aiQuestions,
          limit: AppConstants.freeAiQuestionLimit,
        ),
      );
    }
    _usage = currentUsage.copyWith(aiQuestions: currentUsage.aiQuestions + 1);
    unawaited(_saveUsageToLocal());
    notifyListeners();
    return const Success(null);
  }

  /// Record compare AI feature usage
  Result<void> recordCompareAi() {
    final currentUsage = _normalizedUsage();
    if (!canUseCompareAi) {
      return Failure(
        UsageLimitException(
          featureName: 'compare_ai',
          currentUsage: currentUsage.compareAi,
          limit: AppConstants.freeCompareAiLimit,
        ),
      );
    }
    _usage = currentUsage.copyWith(compareAi: currentUsage.compareAi + 1);
    unawaited(_saveUsageToLocal());
    notifyListeners();
    return const Success(null);
  }

  /// Record detail AI feature usage
  Result<void> recordDetailAi() {
    final currentUsage = _normalizedUsage();
    if (!canUseDetailAi) {
      return Failure(
        UsageLimitException(
          featureName: 'detail_ai',
          currentUsage: currentUsage.detailAi,
          limit: AppConstants.freeDetailAiLimit,
        ),
      );
    }
    _usage = currentUsage.copyWith(detailAi: currentUsage.detailAi + 1);
    unawaited(_saveUsageToLocal());
    notifyListeners();
    return const Success(null);
  }

  /// Record PC Builder AI usage
  Result<void> recordPcBuilderAi() {
    final currentUsage = _normalizedUsage();
    if (!canUsePcBuilderAi) {
      return Failure(
        UsageLimitException(
          featureName: 'pc_builder_ai',
          currentUsage: currentUsage.pcBuilderAi,
          limit: AppConstants.freePcBuilderAiLimit,
        ),
      );
    }
    _usage = currentUsage.copyWith(pcBuilderAi: currentUsage.pcBuilderAi + 1);
    unawaited(_saveUsageToLocal());
    notifyListeners();
    return const Success(null);
  }

  /// Record link paste usage
  Result<void> recordLinkPaste() {
    final currentUsage = _normalizedUsage();
    if (!canPasteLink) {
      return Failure(
        UsageLimitException(
          featureName: 'link_paste',
          currentUsage: currentUsage.linkPastes,
          limit: AppConstants.freeLinkPasteLimit,
        ),
      );
    }
    _usage = currentUsage.copyWith(linkPastes: currentUsage.linkPastes + 1);
    unawaited(_saveUsageToLocal());
    notifyListeners();
    return const Success(null);
  }

  /// Record subscription analysis usage
  Result<void> recordSubscriptionAnalysis() {
    final currentUsage = _normalizedUsage();
    if (!canAnalyzeSubscription) {
      return Failure(
        UsageLimitException(
          featureName: 'subscription_analysis',
          currentUsage: currentUsage.subscriptionAnalyses,
          limit: AppConstants.freeSubscriptionAnalysisLimit,
        ),
      );
    }
    _usage = currentUsage.copyWith(
      subscriptionAnalyses: currentUsage.subscriptionAnalyses + 1,
    );
    unawaited(_saveUsageToLocal());
    notifyListeners();
    return const Success(null);
  }

  /// Remaining usage allowances
  int get remainingComparisons => -1;

  int get remainingAIQuestions => isPremium
      ? -1
      : AppConstants.freeAiQuestionLimit - _normalizedUsage().aiQuestions;

  int get remainingCompareAi => isPremium
      ? -1
      : AppConstants.freeCompareAiLimit - _normalizedUsage().compareAi;

  int get remainingDetailAi => isPremium
      ? -1
      : AppConstants.freeDetailAiLimit - _normalizedUsage().detailAi;

  int get remainingPcBuilderAi => isPremium
      ? -1
      : AppConstants.freePcBuilderAiLimit - _normalizedUsage().pcBuilderAi;

  int get remainingLinkPastes => isPremium
      ? -1
      : AppConstants.freeLinkPasteLimit - _normalizedUsage().linkPastes;

  int get remainingSubscriptionAnalyses => isPremium
      ? -1
      : AppConstants.freeSubscriptionAnalysisLimit -
            _normalizedUsage().subscriptionAnalyses;
}
