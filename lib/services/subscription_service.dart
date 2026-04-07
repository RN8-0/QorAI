/// Compair - Subscription Service (Google Play Billing)
/// Direct Google Play integration via in_app_purchase package
///
/// Premium subscription management
/// Free tier limit control
library;

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:compair/core/constants.dart';
import 'package:compair/core/errors.dart';

/// Subscription status
class SubscriptionStatus {
  final bool isPremium;
  final String? activeProductId;
  final DateTime? expirationDate;

  const SubscriptionStatus({
    this.isPremium = false,
    this.activeProductId,
    this.expirationDate,
  });

  static const free = SubscriptionStatus();
}

/// Daily usage counter
class UsageCounter {
  final int comparisons;
  final int aiQuestions;
  final int linkPastes;
  final DateTime date;

  const UsageCounter({
    this.comparisons = 0,
    this.aiQuestions = 0,
    this.linkPastes = 0,
    required this.date,
  });

  UsageCounter copyWith({
    int? comparisons,
    int? aiQuestions,
    int? linkPastes,
  }) {
    return UsageCounter(
      comparisons: comparisons ?? this.comparisons,
      aiQuestions: aiQuestions ?? this.aiQuestions,
      linkPastes: linkPastes ?? this.linkPastes,
      date: date,
    );
  }

  /// Reset if day has changed
  bool get isExpired {
    final now = DateTime.now();
    return date.year != now.year ||
        date.month != now.month ||
        date.day != now.day;
  }
}

class SubscriptionService extends ChangeNotifier {
  final InAppPurchase _iap = InAppPurchase.instance;
  StreamSubscription<List<PurchaseDetails>>? _purchaseSubscription;

  SubscriptionStatus _status = SubscriptionStatus.free;
  UsageCounter _usage = UsageCounter(date: DateTime.now());
  bool _initialized = false;

  List<ProductDetails> _products = [];
  Completer<Result<bool>>? _purchaseCompleter;
  Completer<void>? _initCompleter;

  SubscriptionStatus get status => _status;
  bool get isPremium => _status.isPremium;
  bool get isInitialized => _initialized;
  List<ProductDetails> get products => _products;

  /// Initialize Google Play Billing
  Future<void> initialize() async {
    if (_initialized) return;
    if (_initCompleter != null) return _initCompleter!.future;
    _initCompleter = Completer<void>();

    try {
      final available = await _iap.isAvailable();
      if (!available) {
        debugPrint('⚠️ In-app purchases not available on this device');
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
        debugPrint('⚠️ Products not found in Play Store: ${response.notFoundIDs}');
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
      debugPrint('📱 Purchase update: ${purchase.productID} → ${purchase.status}');
      switch (purchase.status) {
        case PurchaseStatus.purchased:
        case PurchaseStatus.restored:
          _verifyAndDeliver(purchase);
          break;
        case PurchaseStatus.error:
          debugPrint('❌ Purchase error: ${purchase.error?.message}');
          _purchaseCompleter?.complete(
            Failure(ServerException(
              message: purchase.error?.message ?? 'Purchase failed',
            )),
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
    _status = SubscriptionStatus(
      isPremium: true,
      activeProductId: purchase.productID,
    );

    await _saveToLocal(purchase.productID);
    notifyListeners();

    if (purchase.pendingCompletePurchase) {
      await _iap.completePurchase(purchase);
    }

    _purchaseCompleter?.complete(const Success(true));
    _purchaseCompleter = null;
  }

  /// Save premium status locally
  Future<void> _saveToLocal(String productId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('is_premium', true);
    await prefs.setString('active_product_id', productId);
  }

  /// Restore from local storage
  Future<void> _restoreFromLocal() async {
    final prefs = await SharedPreferences.getInstance();
    final premium = prefs.getBool('is_premium') ?? false;
    final productId = prefs.getString('active_product_id');
    if (premium && productId != null) {
      _status = SubscriptionStatus(
        isPremium: true,
        activeProductId: productId,
      );
      notifyListeners();
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
          return const Failure(
            ServerException(message: 'Purchase timed out'),
          );
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

  /// Get daily counter (reset if day has changed)
  UsageCounter get _currentUsage {
    if (_usage.isExpired) {
      _usage = UsageCounter(date: DateTime.now());
    }
    return _usage;
  }

  /// Can a comparison be made?
  bool get canCompare {
    if (isPremium) return true;
    return _currentUsage.comparisons < AppConstants.freeComparisonLimit;
  }

  /// Can an AI question be asked?
  bool get canAskAI {
    if (isPremium) return true;
    return _currentUsage.aiQuestions < AppConstants.freeAiQuestionLimit;
  }

  /// Can a link be pasted?
  bool get canPasteLink {
    if (isPremium) return true;
    return _currentUsage.linkPastes < AppConstants.freeLinkPasteLimit;
  }

  /// Record comparison usage
  Result<void> recordComparison() {
    if (!canCompare) {
      return Failure(UsageLimitException(
        featureName: 'comparison',
        currentUsage: _currentUsage.comparisons,
        limit: AppConstants.freeComparisonLimit,
      ));
    }
    _usage = _currentUsage.copyWith(
      comparisons: _currentUsage.comparisons + 1,
    );
    return const Success(null);
  }

  /// Record AI question usage
  Result<void> recordAIQuestion() {
    if (!canAskAI) {
      return Failure(UsageLimitException(
        featureName: 'ai_question',
        currentUsage: _currentUsage.aiQuestions,
        limit: AppConstants.freeAiQuestionLimit,
      ));
    }
    _usage = _currentUsage.copyWith(
      aiQuestions: _currentUsage.aiQuestions + 1,
    );
    return const Success(null);
  }

  /// Record link paste usage
  Result<void> recordLinkPaste() {
    if (!canPasteLink) {
      return Failure(UsageLimitException(
        featureName: 'link_paste',
        currentUsage: _currentUsage.linkPastes,
        limit: AppConstants.freeLinkPasteLimit,
      ));
    }
    _usage = _currentUsage.copyWith(
      linkPastes: _currentUsage.linkPastes + 1,
    );
    return const Success(null);
  }

  /// Remaining usage allowances
  int get remainingComparisons => isPremium
      ? -1 // Unlimited
      : AppConstants.freeComparisonLimit - _currentUsage.comparisons;

  int get remainingAIQuestions => isPremium
      ? -1
      : AppConstants.freeAiQuestionLimit - _currentUsage.aiQuestions;

  int get remainingLinkPastes => isPremium
      ? -1
      : AppConstants.freeLinkPasteLimit - _currentUsage.linkPastes;
}
