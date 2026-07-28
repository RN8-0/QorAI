/// Qor AI - Subscription Service (Google Play Billing)
/// Direct Google Play integration via in_app_purchase package
///
/// Premium subscription management
/// Free tier limit control
library;

import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:qor_ai/core/constants.dart';
import 'package:qor_ai/core/errors.dart';
import 'package:qor_ai/core/pb_client.dart';
import 'package:qor_ai/services/remote_config_service.dart';

/// Subscription status
class SubscriptionStatus {
  final bool isPremium;
  final String? activeProductId;
  final DateTime? purchaseDate;
  final DateTime? expirationDate;
  // Google Play purchase token — the only value the SERVER can verify against
  // Google Play to prove a subscription is real (so a client can't fake
  // isPremium). Captured on purchase, persisted, and mirrored into the user
  // record so a backend job can validate it.
  final String? purchaseToken;

  const SubscriptionStatus({
    this.isPremium = false,
    this.activeProductId,
    this.purchaseDate,
    this.expirationDate,
    this.purchaseToken,
  });

  static const free = SubscriptionStatus();
}

/// Daily usage counter
class UsageCounter {
  final int comparisons;
  final int aiQuestions;
  final int compareAi;
  final int detailAi;
  final int linkPastes;
  final int linkCompare;
  final int subscriptionAnalyses;
  final int productScan;
  final int detailMatchAi;
  final String comparisonPeriodKey;
  final String aiPeriodKey;
  final String compareAiPeriodKey;
  final String detailAiPeriodKey;
  final String linkPeriodKey;
  final String linkComparePeriodKey;
  final String subscriptionPeriodKey;
  final String productScanPeriodKey;
  final String detailMatchAiPeriodKey;

  const UsageCounter({
    this.comparisons = 0,
    this.aiQuestions = 0,
    this.compareAi = 0,
    this.detailAi = 0,
    this.linkPastes = 0,
    this.linkCompare = 0,
    this.subscriptionAnalyses = 0,
    this.productScan = 0,
    this.detailMatchAi = 0,
    required this.comparisonPeriodKey,
    required this.aiPeriodKey,
    required this.compareAiPeriodKey,
    required this.detailAiPeriodKey,
    required this.linkPeriodKey,
    required this.linkComparePeriodKey,
    required this.subscriptionPeriodKey,
    required this.productScanPeriodKey,
    required this.detailMatchAiPeriodKey,
  });

  UsageCounter copyWith({
    int? comparisons,
    int? aiQuestions,
    int? compareAi,
    int? detailAi,
    int? linkPastes,
    int? linkCompare,
    int? subscriptionAnalyses,
    int? productScan,
    int? detailMatchAi,
    String? comparisonPeriodKey,
    String? aiPeriodKey,
    String? compareAiPeriodKey,
    String? detailAiPeriodKey,
    String? linkPeriodKey,
    String? linkComparePeriodKey,
    String? subscriptionPeriodKey,
    String? productScanPeriodKey,
    String? detailMatchAiPeriodKey,
  }) {
    return UsageCounter(
      comparisons: comparisons ?? this.comparisons,
      aiQuestions: aiQuestions ?? this.aiQuestions,
      compareAi: compareAi ?? this.compareAi,
      detailAi: detailAi ?? this.detailAi,
      linkPastes: linkPastes ?? this.linkPastes,
      linkCompare: linkCompare ?? this.linkCompare,
      subscriptionAnalyses: subscriptionAnalyses ?? this.subscriptionAnalyses,
      productScan: productScan ?? this.productScan,
      detailMatchAi: detailMatchAi ?? this.detailMatchAi,
      comparisonPeriodKey: comparisonPeriodKey ?? this.comparisonPeriodKey,
      aiPeriodKey: aiPeriodKey ?? this.aiPeriodKey,
      compareAiPeriodKey: compareAiPeriodKey ?? this.compareAiPeriodKey,
      detailAiPeriodKey: detailAiPeriodKey ?? this.detailAiPeriodKey,
      linkPeriodKey: linkPeriodKey ?? this.linkPeriodKey,
      linkComparePeriodKey: linkComparePeriodKey ?? this.linkComparePeriodKey,
      subscriptionPeriodKey:
          subscriptionPeriodKey ?? this.subscriptionPeriodKey,
      productScanPeriodKey: productScanPeriodKey ?? this.productScanPeriodKey,
      detailMatchAiPeriodKey:
          detailMatchAiPeriodKey ?? this.detailMatchAiPeriodKey,
    );
  }
}

class SubscriptionService extends ChangeNotifier {
  static const String _legacyUsageStorageKey = 'freemium_usage_v2';
  static const String _usageStorageKeyPrefix = 'freemium_usage_v3_';
  static const String _usageNamespaceCacheKey = 'freemium_usage_namespace';
  static const String _dailyCreditsUsedField = 'dailyAiCreditsUsed';
  static const String _bonusQCoinsField = 'bonusQCoins';
  final InAppPurchase _iap = InAppPurchase.instance;
  final RemoteConfigService _remoteConfigService;
  StreamSubscription<List<PurchaseDetails>>? _purchaseSubscription;

  SubscriptionStatus _status = SubscriptionStatus.free;
  SubscriptionStatus _profileStatus = SubscriptionStatus.free;
  late UsageCounter _usage;
  bool _initialized = false;
  String _usageNamespace = 'guest_device';
  double _bonusQCoins = 0;
  bool _hasSyncedCredits = false;

  List<ProductDetails> _products = [];
  Completer<Result<bool>>? _purchaseCompleter;
  Completer<void>? _initCompleter;

  SubscriptionStatus get status {
    if (_profileStatus.isPremium) {
      return _profileStatus;
    }
    if (_status.isPremium) {
      return _status;
    }
    return _pocketBaseSnapshotStatus ?? SubscriptionStatus.free;
  }

  bool get isPremium => status.isPremium;
  bool get isInitialized => _initialized;
  List<ProductDetails> get products => _products;
  int get comparisonsUsed => _normalizedUsage().comparisons;
  int get aiQuestionsUsed => _normalizedUsage().aiQuestions;
  int get compareAiUsed => _normalizedUsage().compareAi;
  int get detailAiUsed => _normalizedUsage().detailAi;
  int get linkPastesUsed => _normalizedUsage().linkPastes;
  int get linkCompareUsed => _normalizedUsage().linkCompare;
  int get subscriptionAnalysesUsed => _normalizedUsage().subscriptionAnalyses;
  int get productScanUsed => _normalizedUsage().productScan;
  int get detailMatchAiUsed => _normalizedUsage().detailMatchAi;

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

  SubscriptionService({required RemoteConfigService remoteConfigService})
    : _remoteConfigService = remoteConfigService {
    _usage = _emptyUsage();
    // Pre-load usage from local storage immediately so the profile screen
    // shows correct quota values before full initialize() completes.
    unawaited(_preloadUsage());
  }

  /// Lightweight pre-load: restore usage counter from SharedPreferences
  /// without triggering the full IAP initialization. Called from constructor.
  Future<void> _preloadUsage() async {
    await _restoreUsageFromLocal();
    await _refreshSyncedDailyCredits(persistNormalized: false);
    notifyListeners();
  }

  /// Initialize Google Play Billing
  Future<void> initialize() async {
    if (_initialized) return;
    if (_initCompleter != null) return _initCompleter!.future;
    _initCompleter = Completer<void>();

    try {
      await _remoteConfigService.initialize();
      await _restoreUsageFromLocal();
      await _refreshSyncedDailyCredits();
      notifyListeners();

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

      // Silently restore any active Play Store subscriptions.
      // This handles the case where the user deleted their account and re-logged in —
      // the Play Store subscription is still active even though the PB record is new.
      try {
        await _iap.restorePurchases();
      } catch (_) {}

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
    // For Android this is the Play purchase token; the backend uses it to verify
    // the subscription with Google. Capturing it doesn't change activation.
    final purchaseToken = purchase.verificationData.serverVerificationData;

    _status = SubscriptionStatus(
      isPremium: true,
      activeProductId: purchase.productID,
      purchaseDate: purchaseDate,
      expirationDate: expirationDate,
      purchaseToken: purchaseToken,
    );

    _usage = _emptyUsage();
    await _saveToLocal(
      productId: purchase.productID,
      purchaseDate: purchaseDate,
      expirationDate: expirationDate,
      purchaseToken: purchaseToken,
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
    String? purchaseToken,
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
    if (purchaseToken != null && purchaseToken.isNotEmpty) {
      await prefs.setString('premium_purchase_token', purchaseToken);
    }
    await _saveUsageToLocal();
  }

  Future<void> _clearLocalPremiumCacheOnly() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('is_premium');
    await prefs.remove('active_product_id');
    await prefs.remove('premium_purchase_date');
    await prefs.remove('premium_expiration_date');
    _status = SubscriptionStatus.free;
  }

  Future<void> _saveUsageToLocal() async {
    final prefs = await SharedPreferences.getInstance();
    final storageKey = await _usageStorageKey(prefs);
    await prefs.setString(
      storageKey,
      jsonEncode({
        'comparisons': _usage.comparisons,
        'aiQuestions': _usage.aiQuestions,
        'compareAi': _usage.compareAi,
        'detailAi': _usage.detailAi,
        'linkPastes': _usage.linkPastes,
        'linkCompare': _usage.linkCompare,
        'subscriptionAnalyses': _usage.subscriptionAnalyses,
        'productScan': _usage.productScan,
        'comparisonPeriodKey': _usage.comparisonPeriodKey,
        'aiPeriodKey': _usage.aiPeriodKey,
        'compareAiPeriodKey': _usage.compareAiPeriodKey,
        'detailAiPeriodKey': _usage.detailAiPeriodKey,
        'linkPeriodKey': _usage.linkPeriodKey,
        'linkComparePeriodKey': _usage.linkComparePeriodKey,
        'subscriptionPeriodKey': _usage.subscriptionPeriodKey,
        'productScanPeriodKey': _usage.productScanPeriodKey,
        'detailMatchAi': _usage.detailMatchAi,
        'detailMatchAiPeriodKey': _usage.detailMatchAiPeriodKey,
      }),
    );
  }

  /// Clear locally cached premium flags AND freemium usage on account deletion.
  /// This prevents:
  ///   (a) premium status bleeding into a different user's session,
  ///   (b) freemium quota bypass by delete-then-re-register on the same device.
  /// Play Store will re-deliver the entitlement via restorePurchases() when
  /// initialize() is called for the next session.
  Future<void> clearLocalPremium() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('is_premium');
    await prefs.remove('active_product_id');
    await prefs.remove('premium_purchase_date');
    await prefs.remove('premium_expiration_date');
    _status = SubscriptionStatus.free;
    _profileStatus = SubscriptionStatus.free;
    _usageNamespace = 'guest_device';
    _resetSyncedCreditsCache();
    await _restoreUsageFromLocal();
    // Reset init flag so initialize() will re-run (and call restorePurchases)
    // the next time the subscription service is needed for the new account.
    _initialized = false;
    _initCompleter = null;
    notifyListeners();
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
        purchaseToken: prefs.getString('premium_purchase_token'),
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

    if (isPremium) {
      _usage = _emptyUsage();
      await _saveToLocal(
        productId: activeProductId,
        purchaseDate: purchaseDate ?? DateTime.now(),
        expirationDate: expirationDate,
      );
    } else {
      await _clearLocalPremiumCacheOnly();
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
    final storageKey = await _usageStorageKey(prefs);
    final raw = prefs.getString(storageKey) ?? prefs.getString(_legacyUsageStorageKey);
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
        linkPastes: data['linkPastes'] as int? ?? 0,
        linkCompare: data['linkCompare'] as int? ?? 0,
        subscriptionAnalyses: data['subscriptionAnalyses'] as int? ?? 0,
        productScan: data['productScan'] as int? ?? 0,
        detailMatchAi: data['detailMatchAi'] as int? ?? 0,
        comparisonPeriodKey:
            data['comparisonPeriodKey'] as String? ?? _dailyPeriodKey(),
        aiPeriodKey: data['aiPeriodKey'] as String? ?? _dailyPeriodKey(),
        compareAiPeriodKey:
            data['compareAiPeriodKey'] as String? ?? _dailyPeriodKey(),
        detailAiPeriodKey:
            data['detailAiPeriodKey'] as String? ?? _dailyPeriodKey(),
        linkPeriodKey: data['linkPeriodKey'] as String? ?? _dailyPeriodKey(),
        linkComparePeriodKey:
            data['linkComparePeriodKey'] as String? ?? _dailyPeriodKey(),
        subscriptionPeriodKey:
            data['subscriptionPeriodKey'] as String? ?? _dailyPeriodKey(),
        productScanPeriodKey:
            data['productScanPeriodKey'] as String? ?? _dailyPeriodKey(),
        detailMatchAiPeriodKey:
            data['detailMatchAiPeriodKey'] as String? ?? _dailyPeriodKey(),
      );
      _usage = _normalizedUsage();
      if (prefs.getString(storageKey) == null) {
        await prefs.setString(storageKey, raw);
      }
    } catch (_) {
      _usage = _emptyUsage();
    }
  }

  Future<void> refreshUsageIdentity({bool force = false}) async {
    final nextNamespace = _resolveUsageNamespace();
    if (!force && nextNamespace == _usageNamespace) return;
    await _restoreUsageFromLocal();
    await _refreshSyncedDailyCredits();
    notifyListeners();
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

  /// Restore purchases from Play Store.
  ///
  /// Uses a Completer so we resolve as soon as the purchase stream delivers a
  /// restored item, rather than always waiting a fixed 3 s. Falls back to the
  /// locally cached status after a 10 s timeout so the UI never hangs forever.
  Future<Result<bool>> restorePurchases() async {
    // Make sure the purchase stream is active before requesting restore.
    if (!_initialized) {
      await initialize();
    }

    final completer = Completer<bool>();

    // Watch the purchase stream for a `restored` status update.
    // We use a one-shot listener that resolves the completer on first hit.
    StreamSubscription<List<PurchaseDetails>>? restoreListener;
    restoreListener = _iap.purchaseStream.listen((purchases) {
      for (final p in purchases) {
        if (p.status == PurchaseStatus.restored ||
            p.status == PurchaseStatus.purchased) {
          if (!completer.isCompleted) completer.complete(true);
          restoreListener?.cancel();
          return;
        }
        if (p.status == PurchaseStatus.error) {
          if (!completer.isCompleted) completer.complete(false);
          restoreListener?.cancel();
          return;
        }
      }
    });

    try {
      await _iap.restorePurchases();
    } catch (e) {
      restoreListener.cancel();
      return Failure(ServerException(message: 'Restore error: $e'));
    }

    // Wait up to 10 s for the stream to deliver; fall back to cached status.
    try {
      await completer.future.timeout(const Duration(seconds: 10));
    } on TimeoutException {
      // No restored item arrived — check local/PB snapshot before giving up.
    } finally {
      restoreListener.cancel();
    }

    // Give the _verifyAndDeliver async path a moment to finish writing state.
    await Future.delayed(const Duration(milliseconds: 300));
    return Success(isPremium);
  }

  @override
  void dispose() {
    _purchaseSubscription?.cancel();
    super.dispose();
  }

  // ─── Free Tier Limit Control ───

  UsageCounter _emptyUsage() {
    final dk = _dailyPeriodKey();
    return UsageCounter(
      comparisonPeriodKey: dk,
      aiPeriodKey: dk,
      compareAiPeriodKey: dk,
      detailAiPeriodKey: dk,
      linkPeriodKey: dk,
      linkComparePeriodKey: dk,
      subscriptionPeriodKey: dk,
      productScanPeriodKey: dk,
      detailMatchAiPeriodKey: dk,
    );
  }

  String _dailyPeriodKey([DateTime? now]) {
    final date = now ?? DateTime.now();
    return '${date.year}-${date.month}-${date.day}';
  }

  String _resolveUsageNamespace() {
    try {
      if (!pb.authStore.isValid) return 'guest_device';
      final record = pb.authStore.record;
      if (record == null) return 'guest_device';
      final rawEmail = record.data['email']?.toString().trim().toLowerCase();
      if (rawEmail != null && rawEmail.isNotEmpty) {
        return rawEmail.replaceAll(RegExp(r'[^a-z0-9]'), '_');
      }
      final rawId = record.id.trim().toLowerCase();
      if (rawId.isNotEmpty) {
        return 'user_$rawId';
      }
    } catch (_) {}
    return 'guest_device';
  }

  Future<String> _usageStorageKey(SharedPreferences prefs) async {
    final namespace = _resolveUsageNamespace();
    _usageNamespace = namespace;
    await prefs.setString(_usageNamespaceCacheKey, namespace);
    return '$_usageStorageKeyPrefix$namespace';
  }

  double _asDouble(dynamic value) {
    if (value is num) return value.toDouble();
    return double.tryParse(value?.toString() ?? '') ?? 0;
  }

  void _resetSyncedCreditsCache() {
    _bonusQCoins = 0;
    _hasSyncedCredits = false;
  }

  /// Live Q balance (`bonusQCoins` on the user record — the SAME field the
  /// website spends from, so app and web are always the same number).
  /// Premium → -1 meaning "unlimited".
  double get qBalance => isPremium ? -1 : _bonusQCoins;

  /// Whether the balance was ever read from the server. When false the balance
  /// is simply UNKNOWN — it must never be treated as zero (that is what used to
  /// lock users out of every AI feature).
  bool get hasQBalance => _hasSyncedCredits;

  /// Re-reads the balance from PocketBase. Call after login, on app resume and
  /// whenever a screen wants a guaranteed-fresh number.
  Future<void> refreshQBalance() async {
    await _refreshSyncedDailyCredits();
    notifyListeners();
  }

  Future<void> _refreshSyncedDailyCredits({
    bool persistNormalized = true,
  }) async {
    if (!pb.authStore.isValid) {
      _resetSyncedCreditsCache();
      return;
    }

    try {
      await _remoteConfigService.initialize();
      final uid = pb.authStore.record?.id;
      if (uid == null || uid.isEmpty) {
        _resetSyncedCreditsCache();
        return;
      }

      final record = await pb
          .collection(AppConstants.usersCollection)
          .getOne(uid)
          .timeout(_qNetworkTimeout);
      // Lifetime model: `dailyAiCreditsUsed` is dead weight kept only for
      // back-compat with older clients. `bonusQCoins` IS the balance and it
      // never resets — the user spends it until it runs out.
      _bonusQCoins = _asDouble(record.data[_bonusQCoinsField]);
      _hasSyncedCredits = true;
    } catch (_) {
      // Keep the last known balance if we already had one: a network blip must
      // not look like "you are out of Q".
      if (!_hasSyncedCredits) _resetSyncedCreditsCache();
    }
  }

  /// Q ile ilgili HER ağ çağrısı zaman aşımlı olmalı: harcamalar tek bir
  /// kuyrukta seri koşuyor, takılan tek bir istek TÜM AI'ı kilitlerdi.
  static const Duration _qNetworkTimeout = Duration(seconds: 12);

  Future<void> _persistQBalance(double balance) async {
    final uid = pb.authStore.record?.id;
    if (uid == null || uid.isEmpty) return;

    await pb
        .collection(AppConstants.usersCollection)
        .update(
          uid,
          body: {
            _bonusQCoinsField: balance,
            _dailyCreditsUsedField: 0,
          },
        )
        .timeout(_qNetworkTimeout);
  }

  /// Harcamalar SERİ koşar. Aksi halde iki eşzamanlı istek (çift dokunuş, aynı
  /// anda iki panel) aynı bakiyeyi okur, ikisi de "yeter" der ve kullanıcı
  /// bakiyesinden fazlasını harcar — ikinci yazma birincinin düşüşünü de ezer.
  Future<void> _spendQueue = Future<void>.value();

  /// Authoritative spend — mirrors `spendQorCoins()` on the website:
  /// read the live record, compare against the cost, debit, log the ledger.
  /// Reading the server on every spend is what keeps app and web in sync.
  Future<Result<void>> spendQCoins(String featureName) {
    final completer = Completer<Result<void>>();
    _spendQueue = _spendQueue.then((_) async {
      try {
        completer.complete(await _spendQCoinsLocked(featureName));
      } catch (e) {
        completer.complete(
          Failure(ServerException(message: 'Q spend failed: $e')),
        );
      }
    });
    return completer.future;
  }

  Future<Result<void>> _spendQCoinsLocked(String featureName) async {
    if (isPremium) return const Success(null);

    final cost = AppConstants.creditCostForFeature(featureName).toDouble();
    if (cost <= 0) return const Success(null);

    final uid = pb.authStore.isValid ? pb.authStore.record?.id : null;
    if (uid == null || uid.isEmpty) {
      return Failure(
        const AuthException(message: 'Sign in to use AI features'),
      );
    }

    double? balance;
    try {
      final record = await pb
          .collection(AppConstants.usersCollection)
          .getOne(uid)
          .timeout(_qNetworkTimeout);
      if (record.data['isPremium'] == true) {
        _hasSyncedCredits = true;
        _bonusQCoins = _asDouble(record.data[_bonusQCoinsField]);
        notifyListeners();
        return const Success(null);
      }
      balance = _asDouble(record.data[_bonusQCoinsField]);
      _bonusQCoins = balance;
      _hasSyncedCredits = true;
    } catch (e) {
      // Server unreachable — fall back to the last known balance rather than
      // blocking a user who actually has Q.
      if (_hasSyncedCredits) {
        balance = _bonusQCoins;
      } else {
        debugPrint('⚠️ Q balance read failed: $e');
        return Failure(
          const NetworkException(
            message: 'Q balance unavailable',
            code: 'QOR_BALANCE_UNAVAILABLE',
          ),
        );
      }
    }

    if (balance + 1e-9 < cost) {
      notifyListeners();
      return Failure(
        InsufficientQCoinsException(
          featureName: featureName,
          cost: cost,
          balance: balance,
        ),
      );
    }

    final next = max(0.0, ((balance - cost) * 10).round() / 10);
    _bonusQCoins = next;
    _hasSyncedCredits = true;
    notifyListeners();

    // The debit is persisted best-effort: a write failure must never block a
    // user who has already been charged locally. The next refresh re-reads the
    // server value, so the balance self-heals either way.
    unawaited(() async {
      try {
        await _persistQBalance(next);
      } catch (e) {
        debugPrint('⚠️ Q balance persist failed: $e');
      }
    }());
    unawaited(_logQCoinSpend(featureName, cost, next));
    return const Success(null);
  }

  // Append a spend row to the `qcoin_transactions` ledger so the admin panel
  // shows exactly where a user's Q Coins went (matches the website behaviour).
  // Best-effort — a failed ledger write must never block the AI feature.
  Future<void> _logQCoinSpend(
    String feature,
    double cost,
    double balanceAfter,
  ) async {
    if (cost <= 0) return;
    final uid = pb.authStore.record?.id;
    if (uid == null || uid.isEmpty) return;
    try {
      await pb
          .collection('qcoin_transactions')
          .create(
            body: {
              'userId': uid,
              'type': 'spend',
              'feature': feature,
              'amount': -cost,
              'balanceAfter': balanceAfter,
              'source': 'app',
            },
          )
          .timeout(_qNetworkTimeout);
    } catch (_) {}
  }

  UsageCounter _normalizedUsage() {
    final dailyKey = _dailyPeriodKey();
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
    if (next.linkPeriodKey != dailyKey) {
      next = next.copyWith(linkPastes: 0, linkPeriodKey: dailyKey);
      changed = true;
    }
    if (next.linkComparePeriodKey != dailyKey) {
      next = next.copyWith(linkCompare: 0, linkComparePeriodKey: dailyKey);
      changed = true;
    }
    if (next.subscriptionPeriodKey != dailyKey) {
      next = next.copyWith(
        subscriptionAnalyses: 0,
        subscriptionPeriodKey: dailyKey,
      );
      changed = true;
    }
    if (next.productScanPeriodKey != dailyKey) {
      next = next.copyWith(productScan: 0, productScanPeriodKey: dailyKey);
      changed = true;
    }
    if (next.detailMatchAiPeriodKey != dailyKey) {
      next = next.copyWith(
        detailMatchAi: 0,
        detailMatchAiPeriodKey: dailyKey,
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

  num creditCostForFeature(String featureName) =>
      AppConstants.creditCostForFeature(featureName);

  /// Optimistic, synchronous UI hint. It answers "should I grey this out?",
  /// never "may this run?" — `spendQCoins()` is the only authority.
  /// When the balance has not been read yet we answer TRUE: an unknown balance
  /// is not an empty balance.
  bool canAfford(String featureName) {
    if (isPremium) return true;
    if (!_hasSyncedCredits) return true;
    return _bonusQCoins + 1e-9 >= AppConstants.creditCostForFeature(featureName);
  }

  bool get canAskAI => canAfford('ai_chat');
  bool get canUseCompareAi => canAfford('compare_ai');
  bool get canUseDetailAi => canAfford('detail_ai');
  bool get canPasteLink => canAfford('link_analysis');
  bool get canUseLinkCompare => canAfford('link_compare');
  bool get canAnalyzeSubscription => canAfford('subscription_analysis');
  bool get canScanProduct => canAfford('product_scan');
  bool get canUseDetailMatchAi => canAfford('detail_match');

  /// Record comparison usage (free — comparisons cost no Q)
  Result<void> recordComparison() {
    return const Success(null);
  }

  Future<Result<void>> _spend(String featureName, UsageCounter Function(UsageCounter) bump) async {
    final result = await spendQCoins(featureName);
    if (result.isFailure) return result;
    _usage = bump(_normalizedUsage());
    unawaited(_saveUsageToLocal());
    notifyListeners();
    return const Success(null);
  }

  Future<Result<void>> recordAIQuestion() =>
      _spend('ai_chat', (u) => u.copyWith(aiQuestions: u.aiQuestions + 1));

  Future<Result<void>> recordCompareAi() =>
      _spend('compare_ai', (u) => u.copyWith(compareAi: u.compareAi + 1));

  Future<Result<void>> recordDetailAi() =>
      _spend('detail_ai', (u) => u.copyWith(detailAi: u.detailAi + 1));

  Future<Result<void>> recordDetailMatchAi() => _spend(
    'detail_match',
    (u) => u.copyWith(detailMatchAi: u.detailMatchAi + 1),
  );

  Future<Result<void>> recordLinkPaste() =>
      _spend('link_analysis', (u) => u.copyWith(linkPastes: u.linkPastes + 1));

  Future<Result<void>> recordSubscriptionAnalysis() => _spend(
    'subscription_analysis',
    (u) => u.copyWith(subscriptionAnalyses: u.subscriptionAnalyses + 1),
  );

  Future<Result<void>> recordLinkCompare() =>
      _spend('link_compare', (u) => u.copyWith(linkCompare: u.linkCompare + 1));

  Future<Result<void>> recordProductScan() =>
      _spend('product_scan', (u) => u.copyWith(productScan: u.productScan + 1));

  /// Remaining usage allowances — how many runs the CURRENT balance buys.
  int get remainingComparisons => -1;

  int _runsFor(num cost) =>
      isPremium ? -1 : (_bonusQCoins / cost).floor();

  int get remainingAIQuestions => _runsFor(AppConstants.aiChatCreditCost);
  int get remainingCompareAi => _runsFor(AppConstants.compareAiCreditCost);
  int get remainingDetailAi => _runsFor(AppConstants.detailAiCreditCost);
  int get remainingLinkPastes => _runsFor(AppConstants.linkAnalysisCreditCost);
  int get remainingLinkCompare => _runsFor(AppConstants.linkCompareCreditCost);
  int get remainingSubscriptionAnalyses =>
      _runsFor(AppConstants.subscriptionAnalysisCreditCost);
  int get remainingProductScan => _runsFor(AppConstants.productScanCreditCost);
  int get detailMatchAiRemaining =>
      _runsFor(AppConstants.detailMatchAiCreditCost);
}
