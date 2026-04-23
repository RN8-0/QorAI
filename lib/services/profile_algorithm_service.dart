/// Qor AI - Profile Algorithm Service
/// Blueprint Section 8, 10
///
/// User profile vector calculation and product compatibility score algorithm.
/// Creates a unique profile vector for each user.
/// Foundation for dynamic home page and personalized recommendations.
library;

import 'package:qor_ai/core/constants.dart';
import 'package:qor_ai/domain/entities/user_entity.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';

/// Lightweight snapshot of a user's behavioral signals.
/// Fetched once per session and cached in the provider layer.
class BehaviorSignals {
  /// category → view count (from product_views)
  final Map<String, int> categoryViews;

  /// productId → view count
  final Map<String, int> productViews;

  /// productId set of favorited items
  final Set<String> favorites;

  /// search queries (latest N)
  final List<String> recentSearches;

  /// spec keys user focuses on → count
  final Map<String, int> specFocus;

  /// preference keys from quiz answers → weight
  final Map<String, int> quizPreferences;

  /// hour → activity count
  final Map<int, int> hourActivity;

  const BehaviorSignals({
    this.categoryViews = const {},
    this.productViews = const {},
    this.favorites = const {},
    this.recentSearches = const [],
    this.specFocus = const {},
    this.quizPreferences = const {},
    this.hourActivity = const {},
  });

  static const empty = BehaviorSignals();

  /// Load behavior signals (stubbed — PocketBase behavior tracking TBD).
  static Future<BehaviorSignals> load(String uid) async {
    // TODO: implement PocketBase behavior signal aggregation
    return empty;
  }
}

/// Global algorithm aggregates from all users.
class GlobalAlgorithmSignals {
  /// category → total views across all users
  final Map<String, int> categoryPopularity;

  /// Total quiz submissions across all users
  final int totalQuizzes;

  const GlobalAlgorithmSignals({
    this.categoryPopularity = const {},
    this.totalQuizzes = 0,
  });

  static const empty = GlobalAlgorithmSignals();

  static Future<GlobalAlgorithmSignals> load() async {
    // TODO: implement PocketBase global signals aggregation
    return empty;
  }
}

/// Weight constants for the profile algorithm
class ProfileWeights {
  // Main compatibility score weights (Section 8.1)
  static const double personalFit = 0.40; // Personal fit 40%
  static const double communityScore = 0.25; // Community reviews 25%
  static const double expertScore = 0.20; // Expert evaluation 20%
  static const double pricePerformance = 0.15; // Price/Performance 15%

  // Personal fit sub-weights (Section 8.2A)
  static const double ecosystemMatch = 0.25; // Ecosystem match
  static const double budgetMatch = 0.25; // Budget match
  static const double priorityMatch = 0.25; // Priority match
  static const double deviceMatch = 0.25; // Current device match

  // Age group preferences (generation-based)
  static const Map<String, Map<String, double>> agePreferences = {
    '13-17': {
      'gaming': 0.9,
      'social': 0.8,
      'entertainment': 0.8,
      'tech': 0.7,
      'subscription': 0.6,
      'travel': 0.3,
      'productivity': 0.4,
    },
    '18-24': {
      'gaming': 0.7,
      'social': 0.9,
      'entertainment': 0.8,
      'tech': 0.8,
      'subscription': 0.7,
      'travel': 0.6,
      'productivity': 0.5,
    },
    '25-34': {
      'gaming': 0.5,
      'social': 0.6,
      'entertainment': 0.7,
      'tech': 0.8,
      'subscription': 0.8,
      'travel': 0.7,
      'productivity': 0.8,
    },
    '35-44': {
      'gaming': 0.4,
      'social': 0.5,
      'entertainment': 0.6,
      'tech': 0.7,
      'subscription': 0.7,
      'travel': 0.8,
      'productivity': 0.9,
    },
    '45-54': {
      'gaming': 0.3,
      'social': 0.4,
      'entertainment': 0.5,
      'tech': 0.6,
      'subscription': 0.6,
      'travel': 0.8,
      'productivity': 0.8,
    },
    '55+': {
      'gaming': 0.2,
      'social': 0.3,
      'entertainment': 0.5,
      'tech': 0.5,
      'subscription': 0.5,
      'travel': 0.9,
      'productivity': 0.6,
    },
  };

  // Budget segments (TRY-based - example)
  static const Map<String, Map<String, double>> budgetRanges = {
    'low': {'min': 0, 'max': 5000, 'multiplier': 0.7},
    'mid': {'min': 5000, 'max': 20000, 'multiplier': 1.0},
    'high': {'min': 20000, 'max': 50000, 'multiplier': 1.3},
    'premium': {'min': 50000, 'max': 999999, 'multiplier': 1.45},
    'any': {'min': 0, 'max': 999999, 'multiplier': 1.0},
  };
}

/// Profile algorithm service
class ProfileAlgorithmService {
  static const List<String> gamingFocusedCategories = [
    'gpus',
    'monitors',
    'keyboards',
    'mice',
    'headphones',
    'consoles',
    'gamepads',
    'vr-headsets',
    'desktops',
    'laptops',
    'cpus',
    'ram',
    'ssd',
    'coolers',
    'cases',
  ];

  static const List<String> creatorFocusedCategories = [
    'cameras',
    'lenses',
    'gimbals',
    'tripods',
    'monitors',
    'laptops',
    'microphones',
    'headphones',
    'tablets',
  ];

  static const List<String> productivityFocusedCategories = [
    'laptops',
    'monitors',
    'tablets',
    'smartphones',
    'keyboards',
    'mice',
    'webcams',
    'routers',
    'printers',
  ];

  static const Map<String, List<String>> professionCategoryBoosts = {
    'student': ['laptops', 'tablets', 'headphones', 'smartphones', 'e-readers'],
    'engineer': ['laptops', 'monitors', 'cpus', 'gpus', 'keyboards', 'mice'],
    'designer': ['monitors', 'tablets', 'laptops', 'cameras', 'smartphones'],
    'developer': [
      'laptops',
      'monitors',
      'keyboards',
      'mice',
      'desktops',
      'routers',
    ],
    'content_creator': [
      'cameras',
      'microphones',
      'monitors',
      'laptops',
      'gimbals',
      'tripods',
    ],
    'video_editor': [
      'monitors',
      'laptops',
      'microphones',
      'headphones',
      'cameras',
    ],
    'photographer': ['cameras', 'lenses', 'tripods', 'gimbals', 'monitors'],
    'gamer': gamingFocusedCategories,
    'manager': [
      'smartphones',
      'laptops',
      'smartwatches',
      'tablets',
      'headphones',
    ],
    'product_manager': [
      'laptops',
      'smartphones',
      'tablets',
      'monitors',
      'headphones',
    ],
    'entrepreneur': [
      'smartphones',
      'laptops',
      'tablets',
      'monitors',
      'routers',
    ],
    'healthcare': ['tablets', 'smartwatches', 'smartphones', 'laptops'],
    'educator': ['laptops', 'tablets', 'projectors', 'webcams', 'headphones'],
    'teacher': ['laptops', 'tablets', 'projectors', 'webcams', 'headphones'],
    'finance': ['laptops', 'monitors', 'smartphones', 'tablets'],
    'data_analyst': ['laptops', 'monitors', 'tablets', 'keyboards'],
    'architect': ['monitors', 'laptops', 'tablets', 'gpus', 'desktops'],
    'sales_marketing': ['smartphones', 'laptops', 'tablets', 'cameras'],
    'lawyer': ['laptops', 'tablets', 'smartphones', 'headphones'],
    'researcher': ['laptops', 'tablets', 'e-readers', 'monitors'],
    'other': ['smartphones', 'laptops', 'headphones'],
  };

  static const Map<String, List<String>> usageIntentCategoryBoosts = {
    'gaming_setup': gamingFocusedCategories,
    'creator_setup': creatorFocusedCategories,
    'productivity_setup': productivityFocusedCategories,
    'entertainment_setup': [
      'tvs',
      'headphones',
      'speakers',
      'soundbars',
      'projectors',
      'media-players',
      'tablets',
    ],
    'price_tracking': ['smartphones', 'laptops', 'gpus', 'tvs', 'powerbanks'],
    'research': ['laptops', 'cameras', 'monitors', 'smartphones'],
    'quick_decision': [
      'smartphones',
      'headphones',
      'smartwatches',
      'powerbanks',
    ],
    'all': [],
  };

  static List<String> categoriesForProfession(String? profession) =>
      professionCategoryBoosts[profession] ?? const [];

  static List<String> categoriesForUsageIntent(String? usageIntent) =>
      usageIntentCategoryBoosts[usageIntent] ?? const [];

  /// Calculate user profile vector
  /// This vector converts the user's preferences into numerical values.
  /// Dimensions: ecosystem(2) + budget(1) + priorities(6) + categories(22) +
  ///             devices(5) + misc(3) + profession(8) + ageRange(6) + interests(N)
  /// → 100+ unique profile combinations across user base.
  Map<String, double> calculateProfileVector(UserEntity user) {
    final vector = <String, double>{};

    // 1. Ecosystem score (0-1)
    vector['apple_affinity'] = _calculateAppleAffinity(user);
    vector['android_affinity'] = _calculateAndroidAffinity(user);
    vector['windows_affinity'] = _calculateWindowsAffinity(user);
    vector['google_affinity'] = _calculateGoogleAffinity(user);

    // 2. Budget score (0-1)
    vector['budget_score'] = _calculateBudgetScore(user);

    // 3. Priority scores (0-1)
    for (final priority in [
      'price',
      'quality',
      'design',
      'ecosystem',
      'performance',
      'durability',
      'battery',
      'camera',
      'portability',
      'gaming',
      'creator',
      'productivity',
    ]) {
      vector['priority_$priority'] = user.priorities.contains(priority)
          ? 1.0
          : 0.0;
    }

    // 4. Category interest scores — all user interest categories + primaryCategory
    final userCategories = <String>{
      if (user.primaryCategory != null) user.primaryCategory!,
      ...user.interestCategories,
    };
    final productCategories = <String>[
      ...(AppCategories.subcategories[AppCategories.tech] ?? const <String>[]),
      'tech',
      'subscription',
      'gaming',
      'travel',
      'productivity',
      'entertainment',
    ];
    for (final category in productCategories) {
      vector['interest_$category'] = userCategories.contains(category)
          ? 1.0
          : 0.3;
    }
    // Dynamic interests from interestCategories (may include scraped categories)
    for (final cat in user.interestCategories) {
      if (!productCategories.contains(cat)) {
        vector['interest_$cat'] = 1.0;
      }
    }

    // 5. Profession dimension (one-hot encoding for distinct profile buckets)
    const professions = [
      'student',
      'engineer',
      'designer',
      'developer',
      'content_creator',
      'video_editor',
      'photographer',
      'gamer',
      'manager',
      'product_manager',
      'entrepreneur',
      'healthcare',
      'educator',
      'finance',
      'data_analyst',
      'architect',
      'sales_marketing',
      'lawyer',
      'researcher',
      'other',
    ];
    for (final p in professions) {
      vector['profession_$p'] = (user.profession == p) ? 1.0 : 0.0;
    }

    // 6. Age range dimension
    const ageRanges = ['13-17', '18-24', '25-34', '35-44', '45-54', '55+'];
    for (final a in ageRanges) {
      vector['age_$a'] = (user.ageRange == a) ? 1.0 : 0.0;
    }
    // Age-based recency preference: younger users prefer newer products more
    final ageIdx = ageRanges.indexOf(user.ageRange ?? '');
    vector['recency_preference'] = ageIdx >= 0
        ? (1.0 - (ageIdx * 0.1)).clamp(0.4, 1.0)
        : 0.7;

    // 7. Device ownership scores (0-1)
    vector['has_iphone'] = user.ecosystem == 'apple'
        ? 1.0
        : (user.currentDevices.contains('smartphones') ? 0.35 : 0.0);
    vector['has_android_phone'] =
        ({
          'android',
          'samsung',
          'google',
          'xiaomi',
          'huawei',
        }.contains(user.ecosystem))
        ? 1.0
        : (user.currentDevices.contains('smartphones') ? 0.55 : 0.0);
    vector['has_mac'] =
        user.ecosystem == 'apple' &&
            _hasAnyDevice(user, const ['laptops', 'desktops'])
        ? 1.0
        : 0.0;
    vector['has_windows'] =
        user.ecosystem == 'windows' &&
            _hasAnyDevice(user, const ['laptops', 'desktops', 'monitors'])
        ? 1.0
        : 0.0;
    vector['has_tablet'] = user.currentDevices.contains('tablets') ? 1.0 : 0.0;
    vector['has_watch'] = user.currentDevices.contains('smartwatches')
        ? 1.0
        : 0.0;
    vector['has_console'] = user.currentDevices.contains('consoles')
        ? 1.0
        : 0.0;

    // 8. Subscription density score (0-1)
    final subCount = user.subscriptions.length;
    vector['subscription_density'] = (subCount / 10).clamp(0.0, 1.0);

    // 9. Experience level (based on comparison and click count)
    vector['experience_level'] =
        ((user.comparisonsCount + user.affiliateClicks) / 100).clamp(0.0, 1.0);

    // 10. Premium user bonus
    vector['is_premium'] = user.isPremium ? 1.0 : 0.0;

    return vector;
  }

  /// Calculate personal compatibility score for a product (0-100)
  /// Optionally boosted by behavioral signals.
  double calculatePersonalFitScore({
    required UserEntity user,
    required ProductEntity product,
    BehaviorSignals behavior = BehaviorSignals.empty,
  }) {
    double score = 0;

    // A) Ecosystem match (0-25 points)
    final ecosystemScore = _calculateEcosystemMatchScore(user, product);
    score += ecosystemScore * 25;

    // B) Budget match (0-25 points)
    final budgetScore = _calculateBudgetMatchScore(user, product);
    score += budgetScore * 25;

    // C) Priority match (0-25 points)
    final priorityScore = _calculatePriorityMatchScore(user, product);
    score += priorityScore * 25;

    // D) Current device compatibility (0-25 points)
    final deviceScore = _calculateDeviceCompatibilityScore(user, product);
    score += deviceScore * 25;

    // E) Behavior boost (up to ±15 points)
    final behaviorBoost = _calculateBehaviorBoost(product, behavior);
    score += behaviorBoost;

    return score.clamp(0, 100);
  }

  /// Calculate total compatibility score (all layers included)
  /// Blueprint Section 8.1 formula
  double calculateTotalFitScore({
    required UserEntity user,
    required ProductEntity product,
    double? communityScore, // 0-100
    double? expertScore, // 0-100
    double? pricePerformanceScore, // 0-100
    BehaviorSignals behavior = BehaviorSignals.empty,
  }) {
    // Personal fit (40%)
    final personalFit = calculatePersonalFitScore(
      user: user,
      product: product,
      behavior: behavior,
    );

    // Expert/Technical evaluation (25%) — use techScore as proxy when
    // expert rating is unavailable (scraped data rarely has expert reviews).
    final expert =
        expertScore ??
        (product.ratings.expert > 0
            ? product.ratings.expert
            : product.techScore.clamp(0, 100));

    // Community reviews (20%) — use trendScore as popularity proxy when
    // community rating is unavailable.
    final community =
        communityScore ??
        (product.ratings.community > 0
            ? product.ratings.community * 20
            : (product.trendScore * 10).clamp(0, 100));

    // Price/Performance (15%)
    final pricePerf =
        pricePerformanceScore ?? _calculatePricePerformanceScore(user, product);

    // Weighted total (weights: 0.50 + 0.20 + 0.15 + 0.15 = 1.0)
    // Personal fit dominates to make scores user-specific
    double total =
        (personalFit * 0.50) +
        (expert * 0.20) +
        (community * 0.15) +
        (pricePerf * 0.15);

    // Recency bonus/penalty: moderate impact to avoid score clustering
    final releaseYear = _getReleaseYear(product);
    if (releaseYear != null) {
      final currentYear = DateTime.now().year;
      final yearDiff = currentYear - releaseYear;
      if (yearDiff <= 0)
        total += 8; // This year / upcoming → +8
      else if (yearDiff == 1)
        total += 4; // Last year → +4
      else if (yearDiff == 2)
        total += 0; // 2 years ago → neutral
      else if (yearDiff == 3)
        total -= 5; // 3 years ago → -5
      else if (yearDiff == 4)
        total -= 12; // 4 years ago → -12
      else
        total -= 18; // 5+ years ago → -18
    }

    // Interest category boost: smaller to avoid uniform inflation
    if (user.interestCategories.contains(product.category.toLowerCase()) ||
        user.interestCategories.contains(product.category)) {
      total += 4;
    }
    // Primary category gets extra
    if (user.primaryCategory != null &&
        product.category.toLowerCase() == user.primaryCategory!.toLowerCase()) {
      total += 3;
    }

    total += _calculateUserIntentBoost(user, product);

    return total.clamp(0, 100);
  }

  /// Extract release year from product specs for recency scoring
  int? _getReleaseYear(ProductEntity product) {
    for (final key in [
      'release year',
      'Release Year',
      'release_year',
      'Release Date',
      'Piyasaya Çıkış Tarihi',
      'Yıl',
      'yıl',
      'year',
    ]) {
      final val = product.specs[key];
      if (val != null) {
        final digits = val.toString().replaceAll(RegExp(r'[^0-9]'), '');
        if (digits.length >= 4) {
          final y = int.tryParse(digits.substring(0, 4));
          if (y != null && y > 2000 && y <= DateTime.now().year + 1) return y;
        }
      }
    }
    return null;
  }

  /// Personalized sorting for dynamic home page
  /// Sort product list by user profile relevance + behavior
  List<ProductEntity> sortByRelevance({
    required UserEntity user,
    required List<ProductEntity> products,
    BehaviorSignals behavior = BehaviorSignals.empty,
  }) {
    final scoredProducts = products.map((product) {
      final score = calculateTotalFitScore(
        user: user,
        product: product,
        behavior: behavior,
      );
      return _ScoredProduct(product, score);
    }).toList();

    scoredProducts.sort((a, b) => b.score.compareTo(a.score));

    return scoredProducts.map((sp) => sp.product).toList();
  }

  /// Category priority based on user's interests + behavior
  List<String> getCategoryPriority(
    UserEntity user, {
    BehaviorSignals behavior = BehaviorSignals.empty,
  }) {
    final categories = <String, double>{};
    final profileVector = calculateProfileVector(user);

    // Collect scores from interest categories in profile vector
    for (final entry in profileVector.entries) {
      if (entry.key.startsWith('interest_')) {
        final category = entry.key.replaceFirst('interest_', '');
        if (entry.value >= 0.8) {
          categories[category] = entry.value;
        }
      }
    }

    // Directly include user's interestCategories at full weight
    for (final cat in user.interestCategories) {
      categories[cat] = (categories[cat] ?? 0) + 1.0;
    }

    _applyRankedCategoryBoost(
      categories,
      categoriesForProfession(user.profession),
      start: 0.8,
      decay: 0.15,
    );
    _applyRankedCategoryBoost(
      categories,
      categoriesForUsageIntent(user.usageIntent),
      start: 1.05,
      decay: 0.14,
    );
    if (user.priorities.contains('gaming')) {
      _applyRankedCategoryBoost(
        categories,
        gamingFocusedCategories,
        start: 0.95,
        decay: 0.10,
      );
    }
    if (user.priorities.contains('creator')) {
      _applyRankedCategoryBoost(
        categories,
        creatorFocusedCategories,
        start: 0.75,
        decay: 0.10,
      );
    }
    if (user.priorities.contains('productivity')) {
      _applyRankedCategoryBoost(
        categories,
        productivityFocusedCategories,
        start: 0.75,
        decay: 0.10,
      );
    }

    // Move user's primary category to the top
    if (user.primaryCategory != null) {
      categories[user.primaryCategory!] =
          (categories[user.primaryCategory!] ?? 0) + 1.5;
    }

    // Boost from behavior: categories user actually browses
    if (behavior.categoryViews.isNotEmpty) {
      final maxViews = behavior.categoryViews.values.fold<int>(
        1,
        (a, b) => a > b ? a : b,
      );
      for (final e in behavior.categoryViews.entries) {
        final normalized = (e.value / maxViews).clamp(0.0, 1.0);
        categories[e.key] = (categories[e.key] ?? 0) + normalized * 1.2;
      }
    }

    // Sort and return
    final sorted = categories.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    return sorted.map((e) => e.key).toList();
  }

  // ═══════════════════════════════════════════════════════
  // BEHAVIOR BOOST (reads collected signals)
  // ═══════════════════════════════════════════════════════

  /// Returns a boost value (-15 to +15) based on behavior signals.
  double _calculateBehaviorBoost(
    ProductEntity product,
    BehaviorSignals behavior,
  ) {
    if (behavior.categoryViews.isEmpty &&
        behavior.productViews.isEmpty &&
        behavior.favorites.isEmpty) return 0;

    double boost = 0;

    // 1. Category affinity boost (0-6 pts)
    //    User who views lots of "laptops" should see laptops ranked higher
    final catViews = behavior.categoryViews[product.category] ?? 0;
    if (catViews > 0) {
      final totalViews = behavior.categoryViews.values.fold<int>(
        1,
        (a, b) => a + b,
      );
      final ratio = catViews / totalViews;
      boost += (ratio * 12).clamp(0, 6);
    }

    // 2. Direct product interest (0-4 pts)
    //    Previously viewed this exact product → strong signal
    final viewCount = behavior.productViews[product.id] ?? 0;
    if (viewCount > 0) {
      boost += (viewCount * 1.5).clamp(0, 4);
    }

    // 3. Favorited product boost (0-3 pts)
    if (behavior.favorites.contains(product.id)) {
      boost += 3;
    }

    // 4. Search relevance (0-3 pts)
    //    If user searched for terms matching this product
    if (behavior.recentSearches.isNotEmpty) {
      final productTerms =
          '${product.name} ${product.brand ?? ""} ${product.category}'
              .toLowerCase();
      for (final search in behavior.recentSearches.take(5)) {
        final terms = search.toLowerCase().split(' ');
        for (final term in terms) {
          if (term.length >= 3 && productTerms.contains(term)) {
            boost += 0.6;
            break;
          }
        }
      }
      boost = boost.clamp(-15, 15);
    }

    // 5. Negative signal: previously dismissed/unfavorited (0 to -3 pts)
    //    (Dismissals are tracked but not loaded in BehaviorSignals yet;
    //     this is a placeholder for future extension.)

    return boost.clamp(-15, 15);
  }

  // ═══════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════

  void _applyRankedCategoryBoost(
    Map<String, double> categories,
    List<String> boostedCats, {
    required double start,
    required double decay,
  }) {
    for (var i = 0; i < boostedCats.length; i++) {
      final boost = (start - (i * decay)).clamp(0.15, start);
      categories[boostedCats[i]] = (categories[boostedCats[i]] ?? 0) + boost;
    }
  }

  double _calculateUserIntentBoost(UserEntity user, ProductEntity product) {
    final category = product.category.toLowerCase().trim();
    var boost = 0.0;

    boost +=
        _rankedCategoryMatch(
          category,
          categoriesForUsageIntent(user.usageIntent),
        ) *
        8.0;
    boost +=
        _rankedCategoryMatch(
          category,
          categoriesForProfession(user.profession),
        ) *
        6.0;
    if (user.priorities.contains('gaming')) {
      boost += _rankedCategoryMatch(category, gamingFocusedCategories) * 5.0;
    }
    if (user.priorities.contains('creator')) {
      boost += _rankedCategoryMatch(category, creatorFocusedCategories) * 4.0;
    }
    if (user.priorities.contains('productivity')) {
      boost +=
          _rankedCategoryMatch(category, productivityFocusedCategories) * 4.0;
    }

    final keywordBlob =
        '${product.name} ${product.tags.join(' ')} ${product.pros.join(' ')} ${product.specs}'
            .toLowerCase();
    if (_isGamingUser(user) &&
        [
          'gaming',
          'rtx',
          'fps',
          '144hz',
          '165hz',
          '240hz',
        ].any(keywordBlob.contains)) {
      boost += 3.0;
    }
    if (_isCreatorUser(user) &&
        [
          'creator',
          'video',
          'photo',
          '4k',
          'color gamut',
          'render',
        ].any(keywordBlob.contains)) {
      boost += 2.5;
    }
    if (_isProductivityUser(user) &&
        [
          'office',
          'multitask',
          'battery',
          'portable',
          'keyboard',
        ].any(keywordBlob.contains)) {
      boost += 2.0;
    }

    return boost.clamp(0.0, 14.0);
  }

  double _rankedCategoryMatch(String category, List<String> boostedCats) {
    final index = boostedCats.indexOf(category);
    if (index == -1) return 0.0;
    return (1.0 - (index * 0.08)).clamp(0.35, 1.0);
  }

  bool _isGamingUser(UserEntity user) {
    return user.usageIntent == 'gaming_setup' ||
        user.profession == 'gamer' ||
        user.priorities.contains('gaming');
  }

  bool _isCreatorUser(UserEntity user) {
    return user.usageIntent == 'creator_setup' ||
        const {
          'content_creator',
          'video_editor',
          'photographer',
        }.contains(user.profession) ||
        user.priorities.contains('creator');
  }

  bool _isProductivityUser(UserEntity user) {
    return user.usageIntent == 'productivity_setup' ||
        const {
          'developer',
          'engineer',
          'manager',
          'product_manager',
        }.contains(user.profession) ||
        user.priorities.contains('productivity');
  }

  double _neutralEcosystemBaseline(UserEntity user, ProductEntity product) {
    final category = product.category.toLowerCase().trim();
    if (gamingFocusedCategories.contains(category) && _isGamingUser(user)) {
      return 0.9;
    }
    if (creatorFocusedCategories.contains(category) && _isCreatorUser(user)) {
      return 0.86;
    }
    if (productivityFocusedCategories.contains(category) &&
        _isProductivityUser(user)) {
      return 0.84;
    }
    if (gamingFocusedCategories.contains(category) ||
        creatorFocusedCategories.contains(category) ||
        productivityFocusedCategories.contains(category)) {
      return 0.8;
    }
    return 0.68;
  }

  bool _hasAnyDevice(UserEntity user, List<String> candidates) {
    return user.currentDevices.any(candidates.contains);
  }

  double _calculateAppleAffinity(UserEntity user) {
    double score = 0;
    if (user.ecosystem == 'apple') score += 0.55;
    if (user.ecosystem == 'mixed') score += 0.2;
    if (user.currentDevices.contains('smartphones') &&
        user.ecosystem == 'apple') {
      score += 0.2;
    }
    if (user.currentDevices.contains('tablets') && user.ecosystem == 'apple') {
      score += 0.15;
    }
    if (_hasAnyDevice(user, const ['laptops', 'desktops']) &&
        user.ecosystem == 'apple') {
      score += 0.15;
    }
    if (user.currentDevices.contains('smartwatches') &&
        user.ecosystem == 'apple') {
      score += 0.12;
    }
    if (user.subscriptions.contains('icloud')) score += 0.1;
    if (user.subscriptions.contains('apple_music')) score += 0.1;
    return score.clamp(0.0, 1.0);
  }

  double _calculateAndroidAffinity(UserEntity user) {
    double score = 0;
    if (user.ecosystem == 'android') score += 0.45;
    if ({'samsung', 'google', 'xiaomi', 'huawei'}.contains(user.ecosystem)) {
      score += 0.5;
    }
    if (user.ecosystem == 'mixed') score += 0.2;
    if (user.currentDevices.contains('smartphones')) {
      score += 0.2;
    }
    if (user.currentDevices.contains('tablets')) score += 0.15;
    if (user.currentDevices.contains('smartwatches')) score += 0.12;
    if (_hasAnyDevice(user, const ['laptops', 'desktops'])) score += 0.08;
    if (user.subscriptions.contains('google_one')) score += 0.1;
    if (user.subscriptions.contains('youtube_premium')) score += 0.1;
    return score.clamp(0.0, 1.0);
  }

  double _calculateWindowsAffinity(UserEntity user) {
    double score = 0;
    if (user.ecosystem == 'windows') score += 0.55;
    if (user.ecosystem == 'mixed') score += 0.2;
    if (_hasAnyDevice(user, const ['laptops', 'desktops', 'monitors'])) {
      score += 0.25;
    }
    if (user.subscriptions.contains('microsoft_365')) score += 0.12;
    return score.clamp(0.0, 1.0);
  }

  double _calculateGoogleAffinity(UserEntity user) {
    double score = 0;
    if (user.ecosystem == 'google') score += 0.55;
    if (user.ecosystem == 'android') score += 0.25;
    if (user.ecosystem == 'xiaomi' || user.ecosystem == 'huawei') {
      score += 0.2;
    }
    if (user.ecosystem == 'mixed') score += 0.15;
    if (_hasAnyDevice(user, const ['smartphones', 'tablets', 'laptops'])) {
      score += 0.15;
    }
    if (user.subscriptions.contains('google_one')) score += 0.12;
    if (user.subscriptions.contains('youtube_premium')) score += 0.1;
    return score.clamp(0.0, 1.0);
  }

  double _calculateBudgetScore(UserEntity user) {
    switch (user.budgetRange) {
      case 'low':
        return 0.25;
      case 'mid':
        return 0.5;
      case 'high':
        return 0.75;
      case 'premium':
        return 0.92;
      case 'any':
        return 1.0;
      default:
        return 0.5;
    }
  }

  double _calculateEcosystemMatchScore(UserEntity user, ProductEntity product) {
    // Determine product ecosystem from specs or brand
    final productEcosystem = product.specs['ecosystem']
        ?.toString()
        .toLowerCase();
    final brand = (product.brand ?? '').toLowerCase();

    // Infer ecosystem from brand when spec is missing
    String inferredEcosystem;
    if (productEcosystem != null && productEcosystem.isNotEmpty) {
      inferredEcosystem = productEcosystem;
    } else if ({'apple', 'beats'}.contains(brand)) {
      inferredEcosystem = 'apple';
    } else if (brand == 'samsung') {
      inferredEcosystem = 'samsung';
    } else if (brand == 'google') {
      inferredEcosystem = 'google';
    } else if ({'xiaomi', 'poco'}.contains(brand)) {
      inferredEcosystem = 'xiaomi';
    } else if ({'huawei', 'honor'}.contains(brand)) {
      inferredEcosystem = 'huawei';
    } else if ({
      'microsoft',
      'dell',
      'hp',
      'lenovo',
      'asus',
      'acer',
      'msi',
      'razer',
      'surface',
      'framework',
    }.contains(brand)) {
      inferredEcosystem = 'windows';
    } else if ({
      'samsung',
      'xiaomi',
      'oppo',
      'vivo',
      'realme',
      'oneplus',
      'motorola',
      'huawei',
      'honor',
      'poco',
      'nothing',
      'google',
      'tecno',
      'infinix',
      'zte',
    }.contains(brand)) {
      inferredEcosystem = 'android';
    } else {
      // Neutral products (accessories, PC components, etc.)
      inferredEcosystem = 'neutral';
    }

    if (inferredEcosystem == 'neutral') {
      return _neutralEcosystemBaseline(user, product);
    }
    if (user.ecosystem == 'mixed') return 0.72;
    if (user.ecosystem == inferredEcosystem) return 1.0;
    if ({
          'android',
          'samsung',
          'google',
          'xiaomi',
          'huawei',
        }.contains(user.ecosystem) &&
        {
          'android',
          'samsung',
          'google',
          'xiaomi',
          'huawei',
        }.contains(inferredEcosystem)) {
      return 0.9;
    }
    if (user.ecosystem == 'samsung' &&
        {
          'samsung',
          'android',
          'google',
          'xiaomi',
          'huawei',
        }.contains(inferredEcosystem)) {
      return 0.92;
    }
    if (user.ecosystem == 'google' &&
        {
          'google',
          'android',
          'samsung',
          'xiaomi',
          'huawei',
        }.contains(inferredEcosystem)) {
      return 0.9;
    }
    if (user.ecosystem == 'xiaomi' &&
        {
          'xiaomi',
          'android',
          'google',
          'samsung',
          'huawei',
        }.contains(inferredEcosystem)) {
      return 0.9;
    }
    if (user.ecosystem == 'huawei' &&
        {
          'huawei',
          'android',
          'google',
          'samsung',
          'xiaomi',
        }.contains(inferredEcosystem)) {
      return 0.9;
    }
    if (user.ecosystem == 'windows' && inferredEcosystem == 'windows')
      return 0.96;
    if (user.ecosystem == 'apple' && inferredEcosystem == 'windows')
      return 0.58;
    if (user.ecosystem == 'windows' && inferredEcosystem == 'apple')
      return 0.52;
    if (user.ecosystem == 'apple' &&
        {
          'android',
          'samsung',
          'google',
          'xiaomi',
          'huawei',
        }.contains(inferredEcosystem)) {
      return 0.18;
    }
    if ({
          'android',
          'samsung',
          'google',
          'xiaomi',
          'huawei',
        }.contains(user.ecosystem) &&
        inferredEcosystem == 'apple') {
      return 0.18;
    }

    return 0.5;
  }

  double _calculateBudgetMatchScore(UserEntity user, ProductEntity product) {
    final userBudgetRange = ProfileWeights.budgetRanges[user.budgetRange];
    if (userBudgetRange == null) return 0.5;

    // Get price based on user's country
    final price = product.prices[user.country] ?? product.prices['US'] ?? 0.0;

    if (user.budgetRange == 'any')
      return 0.75; // Don't give full score for unset budget

    final maxBudget = userBudgetRange['max'] ?? 999999;
    final minBudget = userBudgetRange['min'] ?? 0;

    if (price <= maxBudget && price >= minBudget) {
      return 1.0;
    } else if (price < minBudget) {
      // Under budget - bonus
      return 0.9;
    } else {
      // Over budget
      final overBudgetRatio = (price - maxBudget) / maxBudget;
      return (1.0 - overBudgetRatio).clamp(0.0, 0.5);
    }
  }

  double _calculatePriorityMatchScore(UserEntity user, ProductEntity product) {
    if (user.priorities.isEmpty) {
      // No priorities set — use techScore as quality heuristic
      // High tech score products get better match for everyone
      return (product.techScore / 100).clamp(0.3, 0.9);
    }

    double matchCount = 0;
    final productPros = product.pros.join(' ').toLowerCase();
    final productSpecs = product.specs.toString().toLowerCase();
    final productTags = product.tags.join(' ').toLowerCase();
    final productName = product.name.toLowerCase();
    final productCategory = product.category.toLowerCase();

    bool hasKeyword(List<String> keywords) {
      for (final keyword in keywords) {
        if (productPros.contains(keyword) ||
            productSpecs.contains(keyword) ||
            productTags.contains(keyword) ||
            productName.contains(keyword)) {
          return true;
        }
      }
      return false;
    }

    for (final priority in user.priorities) {
      // Simple keyword matching - NLP could be used in production
      switch (priority) {
        case 'price':
          if (productPros.contains('fiyat') ||
              productPros.contains('uygun') ||
              productPros.contains('ekonomik')) {
            matchCount++;
          }
          break;
        case 'quality':
          if (productPros.contains('kalite') ||
              productPros.contains('quality') ||
              productPros.contains('premium') ||
              productPros.contains('dayanıklı') ||
              productPros.contains('durable')) {
            matchCount++;
          }
          break;
        case 'design':
          if (productPros.contains('tasarım') ||
              productPros.contains('design') ||
              productPros.contains('şık') ||
              productPros.contains('stylish') ||
              productPros.contains('estetik')) {
            matchCount++;
          }
          break;
        case 'performance':
          if (productPros.contains('hızlı') ||
              productPros.contains('fast') ||
              productPros.contains('güçlü') ||
              productPros.contains('powerful') ||
              productSpecs.contains('performans') ||
              productSpecs.contains('performance') ||
              product.techScore >= 85) {
            matchCount++;
          }
          break;
        case 'ecosystem':
          // Ecosystem match is calculated separately
          matchCount += 0.5;
          break;
        case 'durability':
          if (productPros.contains('dayanıklı') ||
              productPros.contains('durable') ||
              productPros.contains('sağlam') ||
              productPros.contains('sturdy') ||
              productSpecs.contains('ip68')) {
            matchCount++;
          }
          break;
        case 'battery':
          if (productPros.contains('battery') ||
              productPros.contains('pil') ||
              productPros.contains('long-lasting') ||
              productSpecs.contains('mah')) {
            matchCount++;
          }
          break;
        case 'camera':
          if (productPros.contains('camera') ||
              productPros.contains('kamera') ||
              productPros.contains('photo') ||
              productSpecs.contains('mp') ||
              productSpecs.contains('optical zoom')) {
            matchCount++;
          }
          break;
        case 'portability':
          if (productPros.contains('portable') ||
              productPros.contains('hafif') ||
              productPros.contains('lightweight') ||
              productSpecs.contains('weight')) {
            matchCount++;
          }
          break;
        case 'gaming':
          if (gamingFocusedCategories.contains(productCategory) ||
              hasKeyword([
                'gaming',
                'oyun',
                'refresh rate',
                '144hz',
                '165hz',
                '240hz',
                'rtx',
                'fps',
                'geforce',
              ])) {
            matchCount++;
          }
          break;
        case 'creator':
          if (creatorFocusedCategories.contains(productCategory) ||
              hasKeyword([
                'creator',
                'editing',
                'render',
                'color gamut',
                '4k',
                'video',
                'photo',
                'color accuracy',
              ])) {
            matchCount++;
          }
          break;
        case 'productivity':
          if (productivityFocusedCategories.contains(productCategory) ||
              hasKeyword([
                'productivity',
                'office',
                'multitask',
                'battery',
                'screen size',
                'keyboard',
                'portable',
              ])) {
            matchCount++;
          }
          break;
      }
    }

    double keywordScore = user.priorities.isNotEmpty
        ? matchCount / user.priorities.length
        : 0.0;

    // If keyword matching found little, use techScore as a quality proxy
    // High techScore products partially satisfy 'quality' and 'performance' priorities
    if (keywordScore < 0.3) {
      final techProxy = (product.techScore / 100).clamp(0.0, 1.0);
      // Blend: 60% keyword, 40% tech proxy
      return (keywordScore * 0.6 + techProxy * 0.4).clamp(0.0, 1.0);
    }
    return keywordScore.clamp(0.0, 1.0);
  }

  double _calculateDeviceCompatibilityScore(
    UserEntity user,
    ProductEntity product,
  ) {
    if (user.currentDevices.isEmpty) {
      if (user.interestCategories.contains(product.category) ||
          user.interestCategories.contains(product.subcategory)) {
        return 0.75;
      }
      return 0.55;
    }

    final category = product.category.toLowerCase();
    final brand = (product.brand ?? '').toLowerCase();
    final ownedCategories = user.currentDevices
        .map((item) => item.toLowerCase())
        .toSet();
    double compatibility = 0.5;
    final hasApplePhone =
        ownedCategories.contains('smartphones') && user.ecosystem == 'apple';
    final hasAndroidPhone =
        ownedCategories.contains('smartphones') && user.ecosystem != 'apple';
    final hasMac =
        _hasAnyDevice(user, const ['laptops', 'desktops']) &&
        user.ecosystem == 'apple';
    final hasWindows =
        _hasAnyDevice(user, const ['laptops', 'desktops', 'monitors']) &&
        user.ecosystem == 'windows';
    final hasTablet = ownedCategories.contains('tablets');

    if (ownedCategories.contains(category)) {
      return 0.96;
    }

    // Smartphones
    if (category == 'smartphones') {
      if (brand == 'apple' && hasApplePhone)
        compatibility = 0.95;
      else if (brand == 'apple' && user.ecosystem == 'apple')
        compatibility = 0.90;
      else if (brand == 'samsung' &&
          (hasAndroidPhone || user.ecosystem == 'samsung'))
        compatibility = 0.9;
      else if (brand == 'google' &&
          (hasAndroidPhone || user.ecosystem == 'google'))
        compatibility = 0.88;
      else if ({'xiaomi', 'poco'}.contains(brand) &&
          (hasAndroidPhone || user.ecosystem == 'xiaomi'))
        compatibility = 0.88;
      else if ({'huawei', 'honor'}.contains(brand) &&
          (hasAndroidPhone || user.ecosystem == 'huawei'))
        compatibility = 0.86;
      else if (brand != 'apple' && hasAndroidPhone)
        compatibility = 0.85;
      else if ({
        'android',
        'samsung',
        'google',
        'xiaomi',
        'huawei',
      }.contains(user.ecosystem))
        compatibility = 0.80;
      else if (user.ecosystem == 'mixed')
        compatibility = 0.70;
      else
        compatibility = 0.40;
    }
    // Laptops & Desktops
    else if (category == 'laptops' || category == 'desktops') {
      if (brand == 'apple' && (hasMac || user.ecosystem == 'apple'))
        compatibility = 0.95;
      else if ({
            'microsoft',
            'dell',
            'hp',
            'lenovo',
            'asus',
            'acer',
            'msi',
            'razer',
          }.contains(brand) &&
          (hasWindows || user.ecosystem == 'windows')) {
        compatibility = 0.9;
      } else if (brand != 'apple' && hasWindows) {
        compatibility = 0.85;
      } else if (_hasAnyDevice(user, const ['laptops', 'desktops'])) {
        compatibility = 0.78;
      } else if (user.ecosystem == 'mixed')
        compatibility = 0.70;
      else
        compatibility = 0.45;
    }
    // Tablets
    else if (category == 'tablets') {
      if (brand == 'apple' &&
          (ownedCategories.contains('tablets') || user.ecosystem == 'apple'))
        compatibility = 0.95;
      else if (brand != 'apple' &&
          (ownedCategories.contains('tablets') ||
              {
                'android',
                'samsung',
                'google',
                'xiaomi',
                'huawei',
              }.contains(user.ecosystem))) {
        compatibility = 0.85;
      } else if (user.ecosystem == 'mixed')
        compatibility = 0.70;
      else
        compatibility = 0.45;
    }
    // Smartwatches
    else if (category == 'smartwatches') {
      if (brand == 'apple' && hasApplePhone)
        compatibility = 0.95;
      else if (brand == 'samsung' && hasAndroidPhone)
        compatibility = 0.90;
      else if (brand == 'google' && hasAndroidPhone)
        compatibility = 0.88;
      else if ({'xiaomi', 'huawei', 'honor', 'amazfit'}.contains(brand) &&
          hasAndroidPhone)
        compatibility = 0.86;
      else if ({'garmin', 'fitbit', 'amazfit'}.contains(brand))
        compatibility = 0.75;
      else if (user.ecosystem == 'mixed')
        compatibility = 0.70;
      else
        compatibility = 0.45;
    }
    // Headphones, Speakers (universal)
    else if ({'headphones', 'speakers', 'earbuds'}.contains(category)) {
      compatibility = 0.75;
      if (brand == 'apple' && user.ecosystem == 'apple')
        compatibility = 0.90;
      else if (brand == 'samsung' &&
          {
            'android',
            'samsung',
            'google',
            'xiaomi',
            'huawei',
          }.contains(user.ecosystem))
        compatibility = 0.85;
    }
    // PC Components (GPUs, CPUs, etc.)
    else if ({
      'gpus',
      'cpus',
      'keyboards',
      'mice',
      'monitors',
      'webcams',
      'gamepads',
    }.contains(category)) {
      if (hasWindows)
        compatibility = 0.85;
      else if (hasMac)
        compatibility = 0.60;
      else if (hasTablet)
        compatibility = 0.55;
      else
        compatibility = 0.50;
    }
    // Cameras, Drones, Dashcams (universal)
    else if ({'cameras', 'drones', 'dashcams'}.contains(category)) {
      compatibility = 0.70;
      if (user.interestCategories.contains(category)) compatibility = 0.85;
    }
    // TVs, Consoles, Routers, Robot Vacuums (universal)
    else if ({
      'tvs',
      'consoles',
      'routers',
      'robot-vacuums',
      'media-players',
    }.contains(category)) {
      compatibility = 0.65;
      if (user.interestCategories.contains(category)) compatibility = 0.80;
    }
    // Cases
    else if (category == 'cases') {
      if (user.ecosystem == 'apple' && brand == 'apple')
        compatibility = 0.95;
      else if (ownedCategories.contains('smartphones'))
        compatibility = 0.75;
      else
        compatibility = 0.50;
    }
    // Subscription (existing logic)
    else if (category == 'subscription') {
      compatibility = 0.5 + (user.currentDevices.length * 0.1).clamp(0.0, 0.5);
    }

    return compatibility;
  }

  double _calculatePricePerformanceScore(
    UserEntity user,
    ProductEntity product,
  ) {
    // Use techScore as quality proxy (always populated from scraper)
    final qualityScore = product.techScore.clamp(0.0, 100.0);
    final price = product.prices[user.country] ?? product.prices['US'] ?? 0;

    if (price <= 0) {
      // No price data — return tech score scaled down as reasonable default
      return (qualityScore * 0.7).clamp(0, 100);
    }

    // Normalized quality: 0-1
    final normalizedQuality = qualityScore / 100;
    // Price efficiency: cheaper = higher score (category-agnostic)
    final priceScore = (5000 / (price + 500)).clamp(0.0, 1.0);

    return ((normalizedQuality * 0.6) + (priceScore * 0.4)) * 100;
  }
}

/// Scored product helper class
class _ScoredProduct {
  final ProductEntity product;
  final double score;

  _ScoredProduct(this.product, this.score);
}

/// Compatibility score result
class FitScoreResult {
  final double totalScore;
  final double personalFitScore;
  final double communityScore;
  final double expertScore;
  final double pricePerformanceScore;
  final List<String> pros;
  final List<String> cons;
  final String recommendation;

  const FitScoreResult({
    required this.totalScore,
    required this.personalFitScore,
    required this.communityScore,
    required this.expertScore,
    required this.pricePerformanceScore,
    required this.pros,
    required this.cons,
    required this.recommendation,
  });
}
