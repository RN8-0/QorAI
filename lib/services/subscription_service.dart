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
  final int linkPastes;
  final String comparisonPeriodKey;
  final String aiPeriodKey;
  final String linkPeriodKey;

  const UsageCounter({
    this.comparisons = 0,
    this.aiQuestions = 0,
    this.linkPastes = 0,
    required this.comparisonPeriodKey,
    required this.aiPeriodKey,
    required this.linkPeriodKey,
  });

  UsageCounter copyWith({
    int? comparisons,
    int? aiQuestions,
    int? linkPastes,
    String? comparisonPeriodKey,
    String? aiPeriodKey,
    String? linkPeriodKey,
  }) {
    return UsageCounter(
      comparisons: comparisons ?? this.comparisons,
      aiQuestions: aiQuestions ?? this.aiQuestions,
      linkPastes: linkPastes ?? this.linkPastes,
      comparisonPeriodKey: comparisonPeriodKey ?? this.comparisonPeriodKey,
      aiPeriodKey: aiPeriodKey ?? this.aiPeriodKey,
      linkPeriodKey: linkPeriodKey ?? this.linkPeriodKey,
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
    if (!_status.isPremium && !_profileStatus.isPremium) {
      return _status;
    }
    return SubscriptionStatus(
      isPremium: true,
      activeProductId:
          _status.activeProductId ?? _profileStatus.activeProductId,
      purchaseDate: _status.purchaseDate ?? _profileStatus.purchaseDate,
      expirationDate: _status.expirationDate ?? _profileStatus.expirationDate,
    );
  }

  bool get isPremium => status.isPremium;
  bool get isInitialized => _initialized;
  List<ProductDetails> get products => _products;
  int get comparisonsUsed => _normalizedUsage().comparisons;
  int get aiQuestionsUsed => _normalizedUsage().aiQuestions;
  int get linkPastesUsed => _normalizedUsage().linkPastes;

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
        'linkPastes': _usage.linkPastes,
        'comparisonPeriodKey': _usage.comparisonPeriodKey,
        'aiPeriodKey': _usage.aiPeriodKey,
        'linkPeriodKey': _usage.linkPeriodKey,
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
        linkPastes: data['linkPastes'] as int? ?? 0,
        comparisonPeriodKey:
            data['comparisonPeriodKey'] as String? ?? _dailyPeriodKey(),
        aiPeriodKey: data['aiPeriodKey'] as String? ?? _dailyPeriodKey(),
        linkPeriodKey: data['linkPeriodKey'] as String? ?? _weeklyPeriodKey(),
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
      return Success(_status.isPremium);
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
      linkPeriodKey: _weeklyPeriodKey(),
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

  UsageCounter _normalizedUsage() {
    final dailyKey = _dailyPeriodKey();
    final weeklyKey = _weeklyPeriodKey();
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
    if (next.linkPeriodKey != weeklyKey) {
      next = next.copyWith(linkPastes: 0, linkPeriodKey: weeklyKey);
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
    if (isPremium) return true;
    return _normalizedUsage().comparisons < AppConstants.freeComparisonLimit;
  }

  /// Can an AI question be asked?
  bool get canAskAI {
    if (isPremium) return true;
    return _normalizedUsage().aiQuestions < AppConstants.freeAiQuestionLimit;
  }

  /// Can a link be pasted?
  bool get canPasteLink {
    if (isPremium) return true;
    return _normalizedUsage().linkPastes < AppConstants.freeLinkPasteLimit;
  }

  /// Record comparison usage
  Result<void> recordComparison() {
    final currentUsage = _normalizedUsage();
    if (!canCompare) {
      return Failure(
        UsageLimitException(
          featureName: 'comparison',
          currentUsage: currentUsage.comparisons,
          limit: AppConstants.freeComparisonLimit,
        ),
      );
    }
    _usage = currentUsage.copyWith(comparisons: currentUsage.comparisons + 1);
    unawaited(_saveUsageToLocal());
    notifyListeners();
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

  /// Remaining usage allowances
  int get remainingComparisons => isPremium
      ? -1 // Unlimited
      : AppConstants.freeComparisonLimit - _normalizedUsage().comparisons;

  int get remainingAIQuestions => isPremium
      ? -1
      : AppConstants.freeAiQuestionLimit - _normalizedUsage().aiQuestions;

  int get remainingLinkPastes => isPremium
      ? -1
      : AppConstants.freeLinkPasteLimit - _normalizedUsage().linkPastes;
}
