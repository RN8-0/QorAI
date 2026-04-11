part of 'providers.dart';

final productsByCategoryProvider = FutureProvider.family<
    Result<List<ProductEntity>>, String>((ref, category) async {
  const categoryAliases = <String, List<String>>{
    'cpus':         ['cpus', 'cpu', 'processors', 'işlemciler', 'islemci'],
    'gpus':         ['gpus', 'gpu', 'graphics-cards', 'ekran-karti', 'ekran kartı'],
    'motherboards': ['motherboards', 'anakart', 'mainboard'],
    'ram':          ['ram', 'bellek-ram', 'memory'],
    'ssd':          ['ssd', 'ssds', 'storage', 'disk'],
    'psu':          ['psu', 'power-supply-psu', 'power-supply', 'güç kaynağı'],
    'cases':        ['cases', 'bilgisayar-kasasi', 'case', 'kasa'],
    'coolers':      ['coolers', 'islemci-sogutucu', 'cooler', 'soğutucu'],
    'monitors':     ['monitors', 'monitor', 'monitör'],
    'keyboards':    ['keyboards', 'keyboard', 'klavye'],
    'mice':         ['mice', 'mouse', 'fare'],
    'headsets':     ['headsets', 'headset', 'kulaklık', 'headphones'],
    'laptops':      ['laptops', 'laptop', 'dizüstü'],
    'smartphones':  ['smartphones', 'smartphone', 'telefon', 'cep-telefonu'],
    'tablets':      ['tablets', 'tablet'],
    'smartwatches': ['smartwatches', 'smartwatch', 'akıllı saat'],
    'cameras':      ['cameras', 'camera', 'kamera', 'fotoğraf makinesi'],
    'tvs':          ['tvs', 'tv', 'televizyon'],
    'speakers':     ['speakers', 'speaker', 'hoparlör'],
    'consoles':     ['consoles', 'console', 'oyun konsolu'],
    'routers':      ['routers', 'router', 'modem'],
    'dashcams':     ['dashcams', 'dashcam', 'araç kamerası'],
    'drones':       ['drones', 'drone'],
    'desktops':     ['desktops', 'desktop', 'masaüstü'],
    'earphones':    ['earphones', 'earphone', 'kulak içi kulaklık'],
    'printers':     ['printers', 'printer', 'yazıcı'],
    'projectors':   ['projectors', 'projector', 'projeksiyon'],
    'robot-vacuums':['robot-vacuums', 'robot vacuum', 'robot süpürge'],
    'webcams':      ['webcams', 'webcam', 'web kamerası'],
    'gamepads':     ['gamepads', 'gamepad', 'oyun kolu'],
    'media-players':['media-players', 'media player'],
    'action-cameras':['action-cameras', 'aksiyon-kamera', 'action camera'],
    'ip-cameras':   ['ip-cameras', 'ip-kamera', 'ip camera'],
    'smart-rings':  ['smart-rings', 'akıllı yüzük', 'smart ring'],
    'soundbars':    ['soundbars', 'soundbar'],
    'microphones':  ['microphones', 'microphone', 'mikrofon'],
    'vr-headsets':  ['vr-headsets', 'sanal gerçeklik', 'vr headset'],
    'gimbals':      ['gimbals', 'gimbal'],
    'tripods':      ['tripods', 'tripod'],
    'lenses':       ['lenses', 'lens'],
  };

  final normalizedCategory = category.toLowerCase().trim();
  final aliases = categoryAliases[normalizedCategory] ?? [normalizedCategory];

  // Defunct brands to suppress
  const defunctBrands = {
    'alcatel', 'micromax', 'karbonn', 'lava', 'intex', 'xolo',
    'coolpad', 'leeco', 'le eco', 'gionee', 'panasonic mobile',
    'blackberry', 'htc', 'zte', 'wiko', 'meizu', 'sharp mobile',
    'vernee', 'doogee', 'oukitel', 'umidigi', 'ulefone', 'cubot',
    'homtom', 'bluboo', 'elephone', 'leagoo', 'maze', 'nomu',
    'altus', 'vestel', 'casper', 'reeder', 'general mobile', 'turkcell',
    'grundig', 'beko', 'arçelik', 'hometech', 'vorcom', 'tcl mobile',
  };

  Result<List<ProductEntity>> _sortAndReturn(List<ProductEntity> products) {
    final deduped = deduplicateVariants(products);
    final filtered = deduped.where((p) {
      final brand = (p.brand ?? '').toLowerCase().trim();
      return !defunctBrands.contains(brand);
    }).toList();
    final sorted = List<ProductEntity>.from(filtered)
      ..sort((a, b) {
        final tsCmp = b.techScore.compareTo(a.techScore);
        if (tsCmp != 0) return tsCmp;
        return b.trendScore.compareTo(a.trendScore);
      });
    return Success(sorted);
  }

  // ── 1) Check static in-memory category cache (instant) ──
  if (_categoryCacheMap.containsKey(normalizedCategory)) {
    return _sortAndReturn(_categoryCacheMap[normalizedCategory]!);
  }

  // ── 2) Paginated Firestore query — always use serverAndCache for complete data ──
  final db = FirebaseFirestore.instance;
  const batchSize = 500;
  const maxTotal = 5000;

  Future<List<ProductEntity>> _paginatedLoad(String alias, Source source) async {
    final all = <ProductEntity>[];
    DocumentSnapshot? lastDoc;
    while (all.length < maxTotal) {
      var query = db.collection('products')
          .where('category', isEqualTo: alias)
          .limit(batchSize);
      if (lastDoc != null) query = query.startAfterDocument(lastDoc);
      final snap = await query
          .get(GetOptions(source: source))
          .timeout(const Duration(seconds: 20));
      if (snap.docs.isEmpty) break;
      for (final d in snap.docs) {
        try {
          all.add(ProductModel.fromFirestore(d) as ProductEntity);
        } catch (_) {}
      }
      lastDoc = snap.docs.last;
      if (snap.docs.length < batchSize) break;
    }
    return all;
  }

  for (final alias in aliases) {
    try {
      // Always fetch from server (with cache fallback) to get ALL products
      final all = await _paginatedLoad(alias, Source.serverAndCache);
      if (all.isNotEmpty) {
        _categoryCacheMap[normalizedCategory] = all;
        debugPrint('CATEGORY: loaded ${all.length} products for "$alias"');
        return _sortAndReturn(all);
      }
    } catch (e) {
      debugPrint('CATEGORY: query failed for "$alias": $e');
      // Try cache-only as last resort (offline mode)
      try {
        final cached = await _paginatedLoad(alias, Source.cache);
        if (cached.isNotEmpty) {
          _categoryCacheMap[normalizedCategory] = cached;
          return _sortAndReturn(cached);
        }
      } catch (_) {}
    }
  }

  // ── 3) Keyword fallback — search by product name/brand keywords ──
  const keywordMap = <String, List<String>>{
    'cpus':         ['işlemci', 'cpu', 'processor', 'ryzen', 'core i', 'intel core', 'amd ryzen'],
    'gpus':         ['ekran kartı', 'gpu', 'graphics', 'geforce', 'radeon', 'rtx', 'rx '],
    'motherboards': ['anakart', 'motherboard', 'mainboard'],
    'ram':          ['ram', 'bellek', 'memory', 'ddr4', 'ddr5'],
    'ssd':          ['ssd', 'nvme', 'm.2', 'solid state'],
    'psu':          ['power supply', 'psu', 'güç kaynağı'],
    'cases':        ['kasa', 'case', 'tower', 'chassis'],
    'coolers':      ['soğutucu', 'cooler', 'fan', 'heatsink'],
    'monitors':     ['monitor', 'monitör'],
    'keyboards':    ['keyboard', 'klavye', 'mechanical'],
    'mice':         ['mouse', 'fare', 'gaming mouse'],
    'headsets':     ['headset', 'kulaklık', 'headphone'],
  };
  try {
    final keywords = keywordMap[normalizedCategory];
    if (keywords != null) {
      // Broad query — get a large set and filter client-side
      final all = <ProductEntity>[];
      DocumentSnapshot? lastDoc;
      while (all.length < 2000) {
        var query = db.collection('products').limit(500);
        if (lastDoc != null) query = query.startAfterDocument(lastDoc);
        final snap = await query.get().timeout(const Duration(seconds: 20));
        if (snap.docs.isEmpty) break;
        for (final d in snap.docs) {
          try {
            final p = ProductModel.fromFirestore(d) as ProductEntity;
            final name = p.name.toLowerCase();
            final cat = p.category.toLowerCase();
            if (keywords.any((k) => name.contains(k) || cat.contains(k))) {
              all.add(p);
            }
          } catch (_) {}
        }
        lastDoc = snap.docs.last;
        if (snap.docs.length < 500) break;
      }
      if (all.isNotEmpty) {
        _categoryCacheMap[normalizedCategory] = all;
        return _sortAndReturn(all);
      }
    }
  } catch (e) {
    debugPrint('CATEGORY: keyword fallback failed: $e');
  }

  return const Success(<ProductEntity>[]);
});

/// Trend veriler - Section 6.1
final trendsProvider = FutureProvider<Result<List<TrendModel>>>((ref) {
  final country = ref.watch(selectedCountryProvider);
  final category = ref.watch(selectedCategoryProvider);
  return ref.read(productRepositoryProvider).getTrends(
        country: country,
        category: category,
      );
});

/// Search results (FutureProvider) - Section 10
final searchResultsProvider =
    FutureProvider.family<Result<List<ProductEntity>>, String>((ref, query) async {
  // Ignore the warm-up sentinel
  if (query == '___warm___') {
    return ref.read(productRepositoryProvider).searchProducts(query: '');
  }
  if (query.isEmpty) {
    // Show personalized products from homeFeed cache
    final feedAsync = ref.read(homeFeedProvider);
    final cached = feedAsync.valueOrNull;
    if (cached != null && cached.all.isNotEmpty) {
      // Personalize order using user profile
      final user = ref.read(userProfileProvider).valueOrNull;
      final products = cached.all.toList();

      if (user != null) {
        final algo = ref.read(profileAlgorithmServiceProvider);
        final behavior = ref.read(behaviorSignalsProvider).valueOrNull ?? BehaviorSignals.empty;
        products.sort((a, b) {
          final scoreA = algo.calculateTotalFitScore(
              user: user, product: a, behavior: behavior);
          final scoreB = algo.calculateTotalFitScore(
              user: user, product: b, behavior: behavior);
          return scoreB.compareTo(scoreA);
        });
      }

      return Success(products.take(500).toList());
    }
    return ref.read(productRepositoryProvider).getProducts(limit: 200);
  }

  // Require at least 2 characters for search
  if (query.trim().length < 2) return const Success(<ProductEntity>[]);

  // INSTANT LOCAL SEARCH: search homeFeed cache first (< 5ms)
  final normalizedQuery = query.toLowerCase().trim();
  final queryWords = normalizedQuery.split(RegExp(r'\s+'));
  List<ProductEntity> localResults = [];

  final feedAsync = ref.read(homeFeedProvider);
  final cached = feedAsync.valueOrNull;
  if (cached != null && cached.all.isNotEmpty) {
    localResults = cached.all.where((p) {
      final name = p.name.toLowerCase();
      final brand = (p.brand ?? '').toLowerCase();
      final category = p.category.toLowerCase();
      final searchable = '$name $brand $category';
      return queryWords.every((w) => searchable.contains(w));
    }).toList();
  }

  // ALWAYS call Cloud Function — don't short-circuit on local results
  try {
    final cloudResult = await ref.read(productRepositoryProvider)
        .searchProducts(query: query, limit: 100)
        .timeout(const Duration(seconds: 10));
    // Merge: deduplicate local + cloud
    final localIds = localResults.map((p) => p.id).toSet();
    final cloudProducts = cloudResult.when(
      success: (products) => products.where((p) => !localIds.contains(p.id)).toList(),
      failure: (_) => <ProductEntity>[],
    );
    final merged = [...localResults, ...cloudProducts];

    // Deduplicate variants (same product, different storage/color)
    final deduped = deduplicateVariants(merged);

    // Personalize results using match score
    final user = ref.read(userProfileProvider).valueOrNull;
    if (user != null && deduped.isNotEmpty) {
      final algo = ref.read(profileAlgorithmServiceProvider);
      final behavior = ref.read(behaviorSignalsProvider).valueOrNull ?? BehaviorSignals.empty;
      // Blend relevance + personalization
      deduped.sort((a, b) {
        final nameA = a.name.toLowerCase();
        final nameB = b.name.toLowerCase();
        double relA = 0, relB = 0;
        // Relevance scoring
        if (nameA.contains(normalizedQuery)) relA += 100;
        if (nameB.contains(normalizedQuery)) relB += 100;
        if (nameA.startsWith(normalizedQuery)) relA += 30;
        if (nameB.startsWith(normalizedQuery)) relB += 30;
        if ((a.brand ?? '').toLowerCase().contains(normalizedQuery)) relA += 50;
        if ((b.brand ?? '').toLowerCase().contains(normalizedQuery)) relB += 50;
        relA += a.trendScore * 5;
        relB += b.trendScore * 5;
        // Personalization scoring (0-100 scale, blended at 40%)
        final matchA = algo.calculateTotalFitScore(
            user: user, product: a, behavior: behavior);
        final matchB = algo.calculateTotalFitScore(
            user: user, product: b, behavior: behavior);
        final finalA = relA * 0.6 + matchA * 0.4;
        final finalB = relB * 0.6 + matchB * 0.4;
        return finalB.compareTo(finalA);
      });
    } else {
      // No user profile — sort by relevance only
      deduped.sort((a, b) {
        final nameA = a.name.toLowerCase();
        final nameB = b.name.toLowerCase();
        int scoreA = 0, scoreB = 0;
        if (nameA.contains(normalizedQuery)) scoreA += 100;
        if (nameB.contains(normalizedQuery)) scoreB += 100;
        if ((a.brand ?? '').toLowerCase().contains(normalizedQuery)) scoreA += 50;
        if ((b.brand ?? '').toLowerCase().contains(normalizedQuery)) scoreB += 50;
        scoreA += (a.trendScore * 10).toInt();
        scoreB += (b.trendScore * 10).toInt();
        return scoreB.compareTo(scoreA);
      });
    }

    AnalyticsService.instance.logProductSearch(query, deduped.length);
    return Success(deduped.take(100).toList());
  } catch (_) {
    // Timeout — return local results if any
    if (localResults.isNotEmpty) return Success(localResults.take(100).toList());
    return const Success(<ProductEntity>[]);
  }
});

// ════════════════════════════════════════════════════
// ─── HOME FEED PROVIDER (single query) ─── Section 6
// ════════════════════════════════════════════════════

/// Master home feed — ONE Firestore query powers all home screen sections.
/// Fetches top 300 products by trendScore DESC, then distributes locally.
/// This replaces 20+ individual queries with a single round-trip.
class HomeFeed {
  final List<ProductEntity> trending;
  final List<ProductEntity> featured;
  final Map<String, List<ProductEntity>> byCategory;
  final List<ProductEntity> newArrivals;
  final List<ProductEntity> discover;
  final List<ProductEntity> all;
  /// Categories ordered by user interest (strongest first)
  final List<String> priorityCategories;

  const HomeFeed({
    required this.trending,
    required this.featured,
    required this.byCategory,
    required this.newArrivals,
    this.discover = const [],
    required this.all,
    this.priorityCategories = const [],
  });
}

HomeFeed _buildHomeFeed(List<ProductEntity> products, String country,
    {UserEntity? user, List<String> hiddenIds = const [], List<String> disabledCats = const []}) {
  final deduped = deduplicateVariants(products);
  final currentYear = DateTime.now().year;

  // ── Helper: extract release year (delegates to ProductFilter) ────────────
  int? getExactReleaseYear(ProductEntity p) => ProductFilter.getExactReleaseYear(p);

  // Relaxed year: either exact or estimated (for scoring only, NOT filtering)
  int estimateYear(ProductEntity p) {
    final exact = getExactReleaseYear(p);
    if (exact != null) return exact;
    final name = p.name.toLowerCase();
    final nameYearMatch = RegExp(r'20(1[5-9]|2[0-9])').firstMatch(name);
    if (nameYearMatch != null) {
      final y = int.tryParse(nameYearMatch.group(0)!);
      if (y != null && y > 2000 && y <= currentYear + 1) return y;
    }
    final ts = p.techScore;
    if (ts >= 60) return currentYear - 1;
    if (ts >= 40) return currentYear - 3;
    if (ts >= 20) return currentYear - 5;
    return currentYear - 8;
  }

  // ── Known old product name patterns ────────────────────────────────────────
  bool isKnownOldProduct(ProductEntity p) {
    final name = p.name.toLowerCase();
    if (name.contains('360fly')) return true;
    if (name.contains('3plus') || name.contains('3 plus')) return true;
    if (RegExp(r'aspire\s*3\s*a315').hasMatch(name)) return true;
    if (name.contains('1more s1001')) return true;
    return false;
  }

  // ── HARD FILTER: year >= 2020, known brands, no old products ──────────────
  final hiddenSet = hiddenIds.toSet();
  int filteredByHidden = 0, filteredByOldProduct = 0, filteredByBrand = 0, filteredByYear = 0;
  final rejectedBrands = <String>{};
  var pool = deduped.where((p) {
    if (hiddenSet.contains(p.id)) { filteredByHidden++; return false; }
    if (isKnownOldProduct(p)) { filteredByOldProduct++; return false; }
    if (!ProductFilter.isAllowed(p)) {
      final brand = ProductFilter.normalizeBrand((p.brand ?? '').toLowerCase().trim());
      if (ProductFilter.defunctBrands.contains(brand)) {
        filteredByBrand++;
      } else if (!ProductFilter.allowedBrands.contains(brand)) {
        filteredByBrand++;
        rejectedBrands.add(brand);
      } else {
        filteredByYear++;
      }
      return false;
    }
    return true;
  }).toList();

  debugPrint('=== COMPAIR: _buildHomeFeed pool: ${pool.length} products (from ${deduped.length} deduped, ${products.length} raw) ===');
  debugPrint('=== COMPAIR: filtered out — hidden:$filteredByHidden oldProduct:$filteredByOldProduct brand:$filteredByBrand year:$filteredByYear total:${filteredByHidden + filteredByOldProduct + filteredByBrand + filteredByYear} ===');
  if (rejectedBrands.isNotEmpty) {
    debugPrint('=== COMPAIR: rejected unknown brands: ${rejectedBrands.take(30).join(", ")} ===');
  }

  // ── Brand tier boost multiplier ────────────────────────────────────────────
  const tier1Brands = {
    'apple', 'samsung', 'sony', 'asus', 'msi', 'lg', 'dell', 'hp',
    'lenovo', 'acer', 'google', 'microsoft', 'nvidia', 'amd', 'intel',
  };
  const tier2Brands = {
    'xiaomi', 'huawei', 'oneplus', 'oppo', 'realme', 'honor', 'nothing',
    'razer', 'logitech', 'corsair', 'bose', 'sennheiser', 'jbl', 'marshall',
    'canon', 'nikon', 'fujifilm', 'dji', 'gopro', 'anker', 'garmin',
    'bang & olufsen', 'dyson', 'steelseries', 'hyperx', 'benq', 'viewsonic',
    'gigabyte', 'asrock', 'nzxt', 'cooler master', 'be quiet', 'crucial',
    'western digital', 'seagate', 'kingston', 'thermaltake', 'evga',
    'tp-link', 'netgear', 'arlo', 'ring', 'sonos', 'philips',
    'panasonic', 'tcl', 'hisense', 'vizio', 'roku', 'amazon',
  };
  double brandBoost(ProductEntity p) {
    final brand = (p.brand ?? '').toLowerCase().trim();
    if (tier1Brands.contains(brand)) return 1.15;
    if (tier2Brands.contains(brand)) return 1.08;
    return 0.90;
  }

  // ── USER PROFILE PERSONALIZATION BOOST ─────────────────────────────────────
  // Calculate behavior-based category & brand affinities from Hive viewed products
  final viewedCategoryScores = <String, double>{};
  final viewedBrandScores = <String, double>{};
  try {
    final box = Hive.box('user_data');
    final viewedRaw = box.get('viewed_products') as List<dynamic>? ?? [];
    for (var i = 0; i < viewedRaw.length; i++) {
      final item = viewedRaw[i];
      if (item is Map) {
        final cat = (item['category'] as String? ?? '').toLowerCase().trim();
        final brand = (item['brand'] as String? ?? '').toLowerCase().trim();
        // Recency weight: more recent views = stronger signal (exponential decay)
        final recencyWeight = 1.0 / (1 + i * 0.1);
        if (cat.isNotEmpty) {
          viewedCategoryScores[cat] = (viewedCategoryScores[cat] ?? 0) + recencyWeight;
        }
        if (brand.isNotEmpty) {
          viewedBrandScores[brand] = (viewedBrandScores[brand] ?? 0) + recencyWeight;
        }
      }
    }
  } catch (_) {}

  // Normalize scores to 0-1 range
  final maxCatScore = viewedCategoryScores.values.fold(1.0, (a, b) => a > b ? a : b);
  final maxBrandScore = viewedBrandScores.values.fold(1.0, (a, b) => a > b ? a : b);
  viewedCategoryScores.updateAll((k, v) => v / maxCatScore);
  viewedBrandScores.updateAll((k, v) => v / maxBrandScore);

  double userBoost(ProductEntity p) {
    if (user == null) return 1.0;
    double boost = 1.0;
    final cat = p.category.toLowerCase().trim();
    final brand = (p.brand ?? '').toLowerCase().trim();

    // ── BEHAVIOR-BASED BOOST (strongest signal) ──────────────────────────
    // Recently viewed categories get significant boost
    final viewedCatScore = viewedCategoryScores[cat] ?? 0.0;
    if (viewedCatScore > 0) {
      boost *= 1.0 + (viewedCatScore * 0.5); // Up to 1.5× for most viewed category
    }
    // Recently viewed brands get boost
    final viewedBrandScore = viewedBrandScores[brand] ?? 0.0;
    if (viewedBrandScore > 0) {
      boost *= 1.0 + (viewedBrandScore * 0.3); // Up to 1.3× for most viewed brand
    }

    // ── PROFILE-BASED BOOST ──────────────────────────────────────────────
    // Boost products in user's interest categories
    for (final interest in user.interestCategories) {
      if (cat == interest.toLowerCase() || cat.contains(interest.toLowerCase())) {
        boost *= 1.35;
        break;
      }
    }

    // Boost primary category
    if (user.primaryCategory != null &&
        cat == user.primaryCategory!.toLowerCase()) {
      boost *= 1.25;
    }

    // Ecosystem match (apple user → apple products boosted, android → android brands)
    if (user.ecosystem == 'apple' && brand == 'apple') boost *= 1.3;
    if (user.ecosystem == 'android' && {'samsung', 'xiaomi', 'oneplus', 'oppo',
        'realme', 'huawei', 'honor', 'nothing', 'google'}.contains(brand)) {
      boost *= 1.15;
    }

    // Budget match
    final price = p.getPriceForCountry(user.country) ?? 0;
    if (price > 0) {
      switch (user.budgetRange) {
        case 'low':
          if (price < 300) boost *= 1.2;
          else if (price > 1000) boost *= 0.7;
          break;
        case 'mid':
          if (price >= 200 && price <= 800) boost *= 1.15;
          break;
        case 'high':
          if (price >= 500 && price <= 2000) boost *= 1.15;
          break;
        case 'premium':
          if (price >= 800) boost *= 1.2;
          else if (price < 300) boost *= 0.7;
          break;
      }
    }

    // Profession-based category affinity
    final profCats = <String, List<String>>{
      'student': ['laptops', 'tablets', 'headphones', 'e-readers'],
      'engineer': ['laptops', 'monitors', 'keyboards', 'mice', 'gpus', 'cpus'],
      'designer': ['laptops', 'monitors', 'tablets', 'cameras', 'mice'],
      'gamer': ['gpus', 'monitors', 'keyboards', 'mice', 'headphones', 'gamepads', 'desktops'],
      'healthcare': ['tablets', 'smartwatches', 'smartphones'],
      'teacher': ['laptops', 'tablets', 'projectors', 'webcams'],
      'finance': ['laptops', 'monitors', 'smartphones'],
    };
    final pCats = profCats[user.profession] ?? [];
    if (pCats.contains(cat)) boost *= 1.15;

    // Profile vector match (if available)
    if (user.profileVector.isNotEmpty) {
      final catScore = user.profileVector[cat] ?? 0.0;
      if (catScore > 0.5) boost *= 1.0 + (catScore * 0.3);
    }

    return boost;
  }

  // ── YouTube-style composite score WITH user personalization ────────────────
  double youtubeScore(ProductEntity p) {
    final engagement = (p.trendScore / 10.0).clamp(0.0, 1.0);

    final year = estimateYear(p);
    final yearDiff = currentYear - year;
    double recency;
    if (yearDiff <= 0)      recency = 1.00;
    else if (yearDiff == 1) recency = 0.95;
    else if (yearDiff == 2) recency = 0.80;
    else if (yearDiff == 3) recency = 0.55;
    else if (yearDiff == 4) recency = 0.30;
    else if (yearDiff <= 6) recency = 0.15;
    else                    recency = 0.05;

    // Bonus for products with recent createdAt (freshly scraped = up-to-date)
    if (p.createdAt != null) {
      final daysSinceCreated = DateTime.now().difference(p.createdAt!).inDays;
      if (daysSinceCreated < 90) recency = (recency + 0.15).clamp(0.0, 1.0);
      else if (daysSinceCreated < 180) recency = (recency + 0.08).clamp(0.0, 1.0);
    }

    final quality = (p.techScore / 100.0).clamp(0.0, 1.0);

    return ((engagement * 0.30) + (recency * 0.30) + (quality * 0.25) + 0.15) *
        brandBoost(p) * userBoost(p);
  }

  // ── By category: scored, top 60 each with brand diversity ─────────────────
  final byCategory = <String, List<ProductEntity>>{};
  for (final p in pool) {
    final cat = p.category.toLowerCase().trim();
    if (cat.isNotEmpty) byCategory.putIfAbsent(cat, () => []).add(p);
  }

  debugPrint('=== COMPAIR: byCategory keys: ${byCategory.keys.join(",")} ===');
  for (final e in byCategory.entries) {
    debugPrint('=== COMPAIR:   ${e.key}: ${e.value.length} products ===');
  }

  // Remove admin-disabled categories
  if (disabledCats.isNotEmpty) {
    final disabledSet = disabledCats.map((c) => c.toLowerCase().trim()).toSet();
    byCategory.removeWhere((key, _) => disabledSet.contains(key));
  }

  // Sort by score and enforce brand diversity (max 6 per brand per category)
  for (final cat in byCategory.keys.toList()) {
    final all = byCategory[cat]!;
    all.sort((a, b) => youtubeScore(b).compareTo(youtubeScore(a)));

    final brandCount = <String, int>{};
    final diverse = <ProductEntity>[];
    for (final p in all) {
      final brand = (p.brand ?? '').toLowerCase().trim();
      final count = brandCount[brand] ?? 0;
      if (count < 6) {
        diverse.add(p);
        brandCount[brand] = count + 1;
      }
      if (diverse.length >= 80) break;
    }
    debugPrint('=== COMPAIR:   $cat: ${all.length} total → ${diverse.length} after diversity (brands: ${brandCount.entries.map((e) => '${e.key}:${e.value}').join(', ')}) ===');
    byCategory[cat] = diverse;
  }

  // ── TRENDING: YouTube-style top products (max 2 per brand, 3 per category) ─
  final allScored = pool
      .map((p) => (product: p, score: youtubeScore(p)))
      .toList()
    ..sort((a, b) => b.score.compareTo(a.score));

  final trendingCatCount = <String, int>{};
  final trendingBrandCount = <String, int>{};
  final trending = <ProductEntity>[];
  for (final s in allScored) {
    final cat = s.product.category.toLowerCase().trim();
    final brand = (s.product.brand ?? '').toLowerCase().trim();
    const nicheCategories = {'dashcams', 'gimbals', 'tripods', 'lenses', 'soundbars'};
    if (nicheCategories.contains(cat) && trending.length > 40) continue;
    final catCount = trendingCatCount[cat] ?? 0;
    final brandCnt = trendingBrandCount[brand] ?? 0;
    if (catCount < 5 && brandCnt < 3) {
      trending.add(s.product);
      trendingCatCount[cat] = catCount + 1;
      trendingBrandCount[brand] = brandCnt + 1;
    }
    if (trending.length >= 100) break;
  }

  // ── FEATURED: Best product per mainstream category (unique brands) ────────
  final featured = <ProductEntity>[];
  final seenBrands = <String>{};
  // Prioritize user's interest categories first
  final userInterests = user?.interestCategories
      .map((c) => c.toLowerCase().trim())
      .toList() ?? [];
  final featuredCategoriesBase = [
    'smartphones', 'laptops', 'tablets', 'headphones', 'smartwatches',
    'gpus', 'monitors', 'cameras', 'speakers', 'tvs',
  ];
  // Put user interest categories first
  final featuredCategories = <String>[
    ...userInterests.where((c) => byCategory.containsKey(c)),
    ...featuredCategoriesBase.where((c) => !userInterests.contains(c)),
  ];
  for (final cat in featuredCategories) {
    final catProducts = byCategory[cat] ?? [];
    for (final p in catProducts) {
      final brand = (p.brand ?? '').toLowerCase();
      if (p.imageURL.isNotEmpty && !seenBrands.contains(brand)) {
        featured.add(p);
        seenBrands.add(brand);
        break;
      }
    }
  }
  if (featured.length < 10) {
    for (final entry in byCategory.entries) {
      if (featuredCategories.contains(entry.key)) continue;
      for (final p in entry.value) {
        final brand = (p.brand ?? '').toLowerCase();
        if (p.imageURL.isNotEmpty && !seenBrands.contains(brand)) {
          featured.add(p);
          seenBrands.add(brand);
          break;
        }
      }
      if (featured.length >= 12) break;
    }
  }

  // ── NEW ARRIVALS: recent products with decent quality ─────────────────────
  // Prefer createdAt for genuinely new additions to the database
  final now = DateTime.now();
  var arrivalCandidates = allScored
      .where((s) {
        final p = s.product;
        // Truly new: added to DB in last 6 months
        if (p.createdAt != null && now.difference(p.createdAt!).inDays < 180) return true;
        // Fallback: estimated recent release with decent quality
        return estimateYear(p) >= currentYear - 1 && p.techScore >= 20;
      })
      .toList();
  if (arrivalCandidates.length < 10) {
    arrivalCandidates = allScored
        .where((s) => estimateYear(s.product) >= currentYear - 2)
        .take(200).toList();
  }
  // Sort by createdAt DESC, then by score
  arrivalCandidates.sort((a, b) {
    final aDate = a.product.createdAt ?? DateTime(2020);
    final bDate = b.product.createdAt ?? DateTime(2020);
    final dateComp = bDate.compareTo(aDate);
    if (dateComp != 0) return dateComp;
    return b.score.compareTo(a.score);
  });

  final arrivalsCatCount = <String, int>{};
  final arrivalsBrandCount = <String, int>{};
  final newArrivals = <ProductEntity>[];
  for (final s in arrivalCandidates) {
    final cat = s.product.category.toLowerCase().trim();
    final brand = (s.product.brand ?? '').toLowerCase().trim();
    final catCount = arrivalsCatCount[cat] ?? 0;
    final brandCnt = arrivalsBrandCount[brand] ?? 0;
    if (catCount < 5 && brandCnt < 2) {
      newArrivals.add(s.product);
      arrivalsCatCount[cat] = catCount + 1;
      arrivalsBrandCount[brand] = brandCnt + 1;
    }
    if (newArrivals.length >= 50) break;
  }

  // ── DISCOVER: High-quality hidden gems — products NOT in trending/featured ──
  final trendingIds = trending.map((p) => p.id).toSet();
  final featuredIds = featured.map((p) => p.id).toSet();
  final arrivalIds = newArrivals.map((p) => p.id).toSet();
  final shownIds = {...trendingIds, ...featuredIds, ...arrivalIds};

  final discoverCandidates = allScored
      .where((s) => !shownIds.contains(s.product.id)
                 && s.product.techScore >= 10)
      .toList();
  if (discoverCandidates.length < 10) {
    discoverCandidates.addAll(allScored
        .where((s) => !shownIds.contains(s.product.id)
                   && !discoverCandidates.any((d) => d.product.id == s.product.id))
        .toList());
  }
  // Shuffle for discovery feel with user-seed
  final userSeed = user?.uid.hashCode ?? DateTime.now().day;
  discoverCandidates.shuffle(Random(userSeed));
  final discoverBrandCount = <String, int>{};
  final discoverCatCount = <String, int>{};
  final discover = <ProductEntity>[];
  for (final s in discoverCandidates) {
    final cat = s.product.category.toLowerCase().trim();
    final brand = (s.product.brand ?? '').toLowerCase().trim();
    final bc = discoverBrandCount[brand] ?? 0;
    final cc = discoverCatCount[cat] ?? 0;
    if (bc < 1 && cc < 3) {
      discover.add(s.product);
      discoverBrandCount[brand] = bc + 1;
      discoverCatCount[cat] = cc + 1;
    }
    if (discover.length >= 30) break;
  }

  // Build priority category list based on behavior + profile
  final priorityCats = <String>[];
  // First: categories from behavior (most viewed first)
  final sortedViewedCats = viewedCategoryScores.entries.toList()
    ..sort((a, b) => b.value.compareTo(a.value));
  for (final e in sortedViewedCats) {
    if (byCategory.containsKey(e.key) && !priorityCats.contains(e.key)) {
      priorityCats.add(e.key);
    }
  }
  // Then: user's interest categories
  if (user != null) {
    for (final interest in user.interestCategories) {
      final cat = interest.toLowerCase().trim();
      if (byCategory.containsKey(cat) && !priorityCats.contains(cat)) {
        priorityCats.add(cat);
      }
    }
    // Primary category
    if (user.primaryCategory != null) {
      final primary = user.primaryCategory!.toLowerCase().trim();
      if (byCategory.containsKey(primary) && !priorityCats.contains(primary)) {
        priorityCats.insert(0, primary);
      }
    }
  }
  // Finally: remaining categories by product count
  for (final cat in byCategory.keys) {
    if (!priorityCats.contains(cat)) priorityCats.add(cat);
  }

  debugPrint('=== COMPAIR: homeFeed built — cats:${byCategory.keys.join(",")} '
             'newArrivals:${newArrivals.length} trending:${trending.length} discover:${discover.length} ===');

  return HomeFeed(
    trending: trending,
    featured: featured,
    byCategory: byCategory,
    newArrivals: newArrivals,
    discover: discover,
    all: pool,
    priorityCategories: priorityCats,
  );
}

// Known Firestore categories (ALL from scraper SOURCES config)
const _feedCategories = [
  'laptops', 'smartphones', 'tablets', 'headphones', 'smartwatches',
  'gpus', 'monitors', 'keyboards', 'mice', 'desktops', 'cameras',
  'speakers', 'tvs', 'consoles', 'routers', 'gamepads', 'webcams',
  'dashcams', 'media-players', 'cases', 'cpus', 'drones', 'robot-vacuums',
  'soundbars', 'microphones', 'smart-rings', 'e-readers', 'vr-headsets',
  'motherboards', 'ram', 'ssd', 'psu', 'coolers', 'printers',
  'projectors', 'gimbals', 'tripods', 'lenses',
];

/// In-memory feed cache for instant access across providers
HomeFeed? _inMemoryFeed;

/// Clear in-memory feed cache (called from pull-to-refresh)
void clearInMemoryFeedCache() {
  _inMemoryFeed = null;
}

/// Flag to prevent concurrent background refreshes
bool _isRefreshingFeed = false;

/// Completer to prevent concurrent first-time network fetches
Completer<HomeFeed>? _pendingFeedFetch;

final homeFeedProvider = FutureProvider<HomeFeed>((ref) async {
  ref.watch(selectedCountryProvider);
  final country = ref.read(selectedCountryProvider);
  final repo = ref.read(productRepositoryProvider);
  final cache = ref.read(cacheServiceProvider);
  final user = ref.read(userProfileProvider).valueOrNull;
  final feedSw = Stopwatch()..start();
  debugPrint('=== COMPAIR: homeFeedProvider — start (user: ${user?.uid ?? "anon"}) ===');

  // 0. In-memory cache (instant, < 1ms) — survives tab switches
  if (_inMemoryFeed != null && _inMemoryFeed!.all.isNotEmpty) {
    debugPrint('=== COMPAIR: homeFeed from IN-MEMORY: ${_inMemoryFeed!.all.length} products in ${feedSw.elapsedMilliseconds}ms ===');
    return _inMemoryFeed!;
  }

  // Cache key includes user UID for personalized feeds
  final cacheKey = 'home_feed_v29_${user?.uid ?? "anon"}';

  // Clear ALL old cache versions
  try {
    for (final ver in ['v17_modern', 'v18', 'v19', 'v20', 'v21', 'v22', 'v23', 'v24', 'v25', 'v26', 'v27', 'v28']) {
      final key = ver == 'v17_modern' ? 'home_feed_$ver' : 'home_feed_${ver}_${user?.uid ?? "anon"}';
      cache.delete(key);
    }
  } catch (_) {}

  // Start admin config fetch CONCURRENTLY (don't block product loading)
  final configFuture = _fetchAdminConfig();

  // 1. STALE-WHILE-REVALIDATE: Show cached data instantly, even if expired
  try {
    final staleResult = cache.getLocalStale<List<dynamic>>(cacheKey);
    if (staleResult.data != null && (staleResult.data as List).isNotEmpty) {
      final sw = Stopwatch()..start();
      final products = (staleResult.data as List)
          .map((item) => ProductModel.fromMap(Map<String, dynamic>.from(item as Map)))
          .cast<ProductEntity>()
          .toList();
      sw.stop();
      debugPrint('=== COMPAIR: homeFeed from HIVE cache (stale=${staleResult.isStale}): ${products.length} products in ${sw.elapsedMilliseconds}ms ===');

      // Await admin config only after cache hit (fast path)
      final config = await configFuture;

      ref.read(firebaseDataSourceProvider).setHomeFeedProducts(
          products.whereType<ProductModel>().toList());
      final feed = _buildHomeFeed(products, country, user: user,
          hiddenIds: config.hiddenIds, disabledCats: config.disabledCats);
      _inMemoryFeed = feed;

      debugPrint('=== COMPAIR: homeFeed READY (cache path) in ${feedSw.elapsedMilliseconds}ms ===');

      // If stale, trigger background refresh (fire-and-forget)
      if (staleResult.isStale && !_isRefreshingFeed) {
        _isRefreshingFeed = true;
        _backgroundRefreshFeed(ref, repo, cache, country, user, cacheKey,
            config.pinnedIds, config.hiddenIds, config.disabledCats).whenComplete(() {
          _isRefreshingFeed = false;
        });
      }

      return feed;
    }
  } catch (e) {
    debugPrint('=== COMPAIR: Hive cache read error: $e ===');
  }

  // 2. No cache at all — fetch from network (first-time load)
  // Use Completer to prevent duplicate concurrent network fetches
  if (_pendingFeedFetch != null) {
    debugPrint('=== COMPAIR: homeFeed — joining existing network fetch ===');
    return _pendingFeedFetch!.future;
  }
  _pendingFeedFetch = Completer<HomeFeed>();
  try {
    final config = await configFuture;
    final feed = await _fetchFeedFromNetwork(ref, repo, cache, country, user, cacheKey,
        config.pinnedIds, config.hiddenIds, config.disabledCats);
    debugPrint('=== COMPAIR: homeFeed READY (network path) in ${feedSw.elapsedMilliseconds}ms ===');
    _pendingFeedFetch!.complete(feed);
    _pendingFeedFetch = null;
    return feed;
  } catch (e) {
    _pendingFeedFetch!.completeError(e);
    _pendingFeedFetch = null;
    rethrow;
  }
});

/// Admin feed config (fetched concurrently with product loading)
class _FeedConfig {
  final List<String> pinnedIds;
  final List<String> hiddenIds;
  final List<String> disabledCats;
  const _FeedConfig({this.pinnedIds = const [], this.hiddenIds = const [], this.disabledCats = const []});
}

Future<_FeedConfig> _fetchAdminConfig() async {
  try {
    final configDoc = await FirebaseFirestore.instance
        .collection('app_config').doc('algorithm').get()
        .timeout(const Duration(seconds: 5));
    if (configDoc.exists) {
      final data = configDoc.data() ?? {};
      return _FeedConfig(
        pinnedIds: List<String>.from(data['pinnedProducts'] ?? []),
        hiddenIds: List<String>.from(data['hiddenProducts'] ?? []),
        disabledCats: List<String>.from(data['disabledCategories'] ?? []),
      );
    }
  } catch (_) {}
  return const _FeedConfig();
}

/// Background refresh: fetch fresh data and update cache silently
Future<void> _backgroundRefreshFeed(
  Ref ref,
  ProductRepository repo,
  CacheService cache,
  String country,
  UserEntity? user,
  String cacheKey,
  List<String> pinnedIds,
  List<String> hiddenIds,
  List<String> disabledCats,
) async {
  debugPrint('=== COMPAIR: Background feed refresh started ===');
  try {
    final products = await _fetchAllProducts(repo, user, disabledCats, pinnedIds);
    if (products.isNotEmpty && products.length > (_inMemoryFeed?.all.length ?? 0) * 0.5) {
      _saveProductsToCache(cache, products, cacheKey);
      ref.read(firebaseDataSourceProvider).setHomeFeedProducts(
          products.whereType<ProductModel>().toList());
      _inMemoryFeed = _buildHomeFeed(products, country, user: user,
          hiddenIds: hiddenIds, disabledCats: disabledCats);
      debugPrint('=== COMPAIR: Background refresh done: ${products.length} products ===');
    }
  } catch (e) {
    debugPrint('=== COMPAIR: Background refresh error: $e ===');
  }
}

/// First-time network fetch with progressive loading
Future<HomeFeed> _fetchFeedFromNetwork(
  Ref ref,
  ProductRepository repo,
  CacheService cache,
  String country,
  UserEntity? user,
  String cacheKey,
  List<String> pinnedIds,
  List<String> hiddenIds,
  List<String> disabledCats,
) async {
  debugPrint('=== COMPAIR: homeFeed — first-time network fetch ===');

  final products = await _fetchAllProducts(repo, user, disabledCats, pinnedIds);

  if (products.isEmpty) {
    debugPrint('=== COMPAIR: homeFeed EMPTY — all queries returned 0 docs ===');
    return const HomeFeed(trending: [], featured: [], byCategory: {}, newArrivals: [], all: []);
  }

  debugPrint('=== COMPAIR: Building feed from ${products.length} products... ===');

  // Save to cache asynchronously — don't block feed building
  Future.microtask(() => _saveProductsToCache(cache, products, cacheKey));

  ref.read(firebaseDataSourceProvider).setHomeFeedProducts(
      products.whereType<ProductModel>().toList());
  debugPrint('=== COMPAIR: setHomeFeedProducts done, building HomeFeed... ===');
  final feed = _buildHomeFeed(products, country, user: user,
      hiddenIds: hiddenIds, disabledCats: disabledCats);
  _inMemoryFeed = feed;
  debugPrint('=== COMPAIR: HomeFeed built — trending:${feed.trending.length} cats:${feed.byCategory.length} all:${feed.all.length} ===');
  return feed;
}

/// Core product fetching: BULK-FIRST strategy (single query, fast cold start)
Future<List<ProductEntity>> _fetchAllProducts(
  ProductRepository repo,
  UserEntity? user,
  List<String> disabledCats,
  List<String> pinnedIds,
) async {
  final allProducts = <ProductEntity>[];
  final seenIds = <String>{};

  void addProducts(List<ProductEntity> products) {
    for (final p in products) {
      if (seenIds.add(p.id)) allProducts.add(p);
    }
  }

  final sw = Stopwatch()..start();

  // ── Multi-category parallel fetch (diverse results, composite index) ──────
  // Fetch top products from each category in ONE parallel batch.
  // Uses category+techScore DESC composite index → fast per-query.
  final categories = _feedCategories.take(20).toList();
  debugPrint('=== COMPAIR: MULTI-CAT fetch — ${categories.length} categories, 50 each ===');

  try {
    final futures = categories.map((cat) => repo.getProducts(
      category: cat, limit: 80, orderBy: 'techScore', descending: true,
    ).timeout(const Duration(seconds: 45)).catchError((_) =>
      const Success<List<ProductEntity>>([])));
    final results = await Future.wait(futures.toList());
    for (var j = 0; j < results.length; j++) {
      final catName = categories[j];
      switch (results[j]) {
        case Success(data: final products):
          debugPrint('=== COMPAIR: CAT $catName: ${products.length} products ===');
          addProducts(products);
        default:
          debugPrint('=== COMPAIR: CAT $catName: FAILED ===');
      }
    }
  } catch (e) {
    debugPrint('=== COMPAIR: MULTI-CAT error: $e ===');
  }
  debugPrint('=== COMPAIR: MULTI-CAT got ${allProducts.length} products in ${sw.elapsedMilliseconds}ms ===');

  // If multi-cat returned nothing, try priority categories individually
  if (allProducts.isEmpty) {
    debugPrint('=== COMPAIR: MULTI-CAT empty, trying priority categories ===');
    for (final cat in const ['smartphones', 'laptops', 'tablets', 'headphones']) {
      try {
        final result = await repo.getProducts(
          category: cat, limit: 80, orderBy: 'techScore', descending: true,
        );
        switch (result) {
          case Success(data: final products):
            addProducts(products);
          default:
            break;
        }
      } catch (_) {}
      if (allProducts.length >= 50) break;
    }
  }

  sw.stop();
  debugPrint('=== COMPAIR: Total: ${allProducts.length} products in ${sw.elapsedMilliseconds}ms ===');

  // Fetch pinned products
  if (pinnedIds.isNotEmpty) {
    final missingPinned = pinnedIds.where((id) => !seenIds.contains(id)).toList();
    if (missingPinned.isNotEmpty) {
      try {
        final pinnedResult = await repo.getProductsByIds(missingPinned)
            .timeout(const Duration(seconds: 8));
        switch (pinnedResult) {
          case Success(data: final products):
            addProducts(products);
          default:
            break;
        }
      } catch (_) {}
    }
  }

  return allProducts;
}

void _saveProductsToCache(CacheService cache, List<ProductEntity> products, String cacheKey) {
  try {
    final maps = products.map((p) {
      final m = ProductModel.fromEntity(p).toFirestore();
      if (m['lastUpdated'] is Timestamp) {
        m['lastUpdated'] = (m['lastUpdated'] as Timestamp).toDate().toIso8601String();
      }
      if (m['createdAt'] is Timestamp) {
        m['createdAt'] = (m['createdAt'] as Timestamp).toDate().toIso8601String();
      }
      return m;
    }).toList();
    cache.setLocal(cacheKey, maps, duration: const Duration(hours: 12));
  } catch (_) {}
}

/// Convenience: trending products derived from home feed
final trendingProductsProvider = FutureProvider<List<ProductEntity>>((ref) async {
  final feed = await ref.watch(homeFeedProvider.future)
      .timeout(const Duration(seconds: 20));
  return feed.trending;
});

/// Convenience: featured products derived from home feed
final featuredProductsProvider = FutureProvider<List<ProductEntity>>((ref) async {
  final feed = await ref.watch(homeFeedProvider.future);
  return feed.featured;
});

/// Convenience: new arrivals derived from home feed
final newArrivalsProvider = FutureProvider<List<ProductEntity>>((ref) async {
  final feed = await ref.watch(homeFeedProvider.future);
  return feed.newArrivals;
});

/// Convenience: discover products derived from home feed (hidden gems)
final discoverProductsProvider = FutureProvider<List<ProductEntity>>((ref) async {
  final feed = await ref.watch(homeFeedProvider.future);
  return feed.discover;
});

/// Category cover photos derived from home feed (no extra queries)
final categoryCoversProvider = FutureProvider<Map<String, String>>((ref) async {
  final feed = await ref.watch(homeFeedProvider.future);
  final covers = <String, String>{};
  for (final entry in feed.byCategory.entries) {
    if (entry.value.isNotEmpty) {
      final best = entry.value.firstWhere(
        (p) => p.imageURL.isNotEmpty,
        orElse: () => entry.value.first,
      );
      if (best.imageURL.isNotEmpty) covers[entry.key] = best.imageURL;
    }
  }
  return covers;
});

/// Daily AI trending provider — daily queries Gemini for the most searched tech products,
/// matches with Firestore products and returns them. Cached in Firestore (24 hours).
final aiDailyTrendingProvider = FutureProvider<List<ProductEntity>>((ref) async {
  final repo = ref.read(productRepositoryProvider);

  // 1. Check Firestore cache
  try {
    final db = FirebaseFirestore.instance;
    final cacheDoc = await db.collection('app_config').doc('trending_daily').get();
    if (cacheDoc.exists) {
      final data = cacheDoc.data() ?? {};
      final lastUpdated = (data['lastUpdated'] as Timestamp?)?.toDate();
      final cachedIds = List<String>.from(data['productIds'] ?? []);
      if (lastUpdated != null &&
          DateTime.now().difference(lastUpdated).inHours < 24 &&
          cachedIds.isNotEmpty) {
        final result = await repo.getProductsByIds(cachedIds);
        return result.when(success: (p) => p, failure: (_) => []);
      }
    }
  } catch (_) {}

  // 2. Load products from shared home feed (no extra Firestore query)
  final feed = await ref.read(homeFeedProvider.future);
  final allProducts = feed.all;
  if (allProducts.isEmpty) return allProducts;

  // 3. Call Gemini to get trending tech product types
  final apiKey = EnvConfig.geminiApiKey;
  if (apiKey.isEmpty) {
    return (allProducts.toList()..sort((a, b) => b.trendScore.compareTo(a.trendScore))).take(10).toList();
  }

  try {
    final dio = Dio();
    const prompt = '''List the top 10 most searched and trending consumer technology products right now in 2025. 
Return ONLY a JSON array of product name keywords (short, search-friendly). Example: ["iPhone 16 Pro", "Samsung Galaxy S25", "MacBook Air M4"]
Return only the JSON array, no explanation.''';

    final response = await dio.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      queryParameters: {'key': apiKey},
      data: {
        'contents': [{'parts': [{'text': prompt}]}],
        'generationConfig': {'temperature': 0.3, 'maxOutputTokens': 512},
      },
      options: Options(receiveTimeout: const Duration(seconds: 15)),
    );

    final text = response.data['candidates']?[0]?['content']?['parts']?[0]?['text'] as String? ?? '[]';
    final match = RegExp(r'\[.*?\]', dotAll: true).firstMatch(text);
    if (match == null) throw Exception('No JSON in response');
    final jsonStr = match.group(0)!;

    // Parse list from simple JSON array (no dart:convert needed for simple string arrays)
    final keywords = <String>[];
    final cleaned = jsonStr.replaceAll('[', '').replaceAll(']', '').replaceAll('"', '').replaceAll("'", '');
    for (final item in cleaned.split(',')) {
      final kw = item.trim().toLowerCase();
      if (kw.isNotEmpty) keywords.add(kw);
    }

    // 4. Match keywords to products in DB
    final matched = <ProductEntity>[];
    for (final kw in keywords) {
      final parts = kw.split(' ').where((s) => s.length > 2).toList();
      if (parts.isEmpty) continue;
      final product = allProducts.firstWhere(
        (p) => parts.every((part) =>
            p.name.toLowerCase().contains(part) ||
            (p.brand?.toLowerCase().contains(part) ?? false)),
        orElse: () => allProducts.firstWhere(
          (p) => p.name.toLowerCase().contains(parts.first),
          orElse: () => ProductEntity(id: '', name: '', category: '', subcategory: '', lastUpdated: DateTime(2000)),
        ),
      );
      if (product.id.isNotEmpty && !matched.any((m) => m.id == product.id)) {
        matched.add(product);
      }
      if (matched.length >= 10) break;
    }

    // Fill remaining with top trendScore
    if (matched.length < 10) {
      final remaining = allProducts
          .where((p) => !matched.any((m) => m.id == p.id))
          .toList()..sort((a, b) => b.trendScore.compareTo(a.trendScore));
      matched.addAll(remaining.take(10 - matched.length));
    }

    // 5. Save to Firestore cache
    try {
      await FirebaseFirestore.instance
          .collection('app_config')
          .doc('trending_daily')
          .set({
        'productIds': matched.map((p) => p.id).toList(),
        'lastUpdated': Timestamp.now(),
        'source': 'gemini',
      });
    } catch (_) {}

    return matched;
  } catch (_) {
    return (allProducts.toList()..sort((a, b) => b.trendScore.compareTo(a.trendScore))).take(10).toList();
  }
});

// ════════════════════════════════════════════════════
// ─── PERSONALIZED RECOMMENDATIONS ─── Section 6, 8
// ════════════════════════════════════════════════════

/// Personalized product recommendations - Section 6.1 "For You"
/// Uses home feed data — no extra Firestore queries.
final personalizedRecommendationsProvider = FutureProvider<List<ProductEntity>>((ref) async {
  final userAsync = ref.watch(userProfileProvider);
  final user = userAsync.valueOrNull;
  final feed = await ref.watch(homeFeedProvider.future);
  final behavior = await ref.watch(behaviorSignalsProvider.future);

  if (feed.all.isEmpty) return <ProductEntity>[];

  // If no user yet, show cross-category trending products as "For You"
  if (user == null) {
    final catCount = <String, int>{};
    final diverse = <ProductEntity>[];
    for (final p in feed.trending) {
      final cat = p.category.toLowerCase();
      final cnt = catCount[cat] ?? 0;
      if (cnt < 3) {
        diverse.add(p);
        catCount[cat] = cnt + 1;
      }
      if (diverse.length >= 50) break;
    }
    return diverse;
  }

  // ── Load analyzed product IDs to exclude re-recommendations ──
  final excludeIds = <String>{};
  try {
    final userDoc = await FirebaseFirestore.instance
        .collection('users').doc(user.uid).get();
    final data = userDoc.data();
    if (data != null && data['analyzedProducts'] is List) {
      for (final entry in (data['analyzedProducts'] as List)) {
        if (entry is Map && entry['productId'] != null) {
          excludeIds.add(entry['productId'].toString());
        }
      }
    }
  } catch (_) {}
  // Also exclude heavily viewed products (user already knows them)
  for (final entry in behavior.productViews.entries) {
    if (entry.value >= 5) excludeIds.add(entry.key);
  }

  final algorithmService = ref.read(profileAlgorithmServiceProvider);
  var allProducts = <ProductEntity>[];
  final existingIds = <String>{};

  // Get behavior-boosted category priorities
  final priorityCats = algorithmService.getCategoryPriority(user, behavior: behavior);

  // ── Ecosystem affinity filter ──
  final eco = user.ecosystem.toLowerCase();
  bool isEcoMatch(ProductEntity p) {
    final brand = (p.brand ?? '').toLowerCase();
    if (eco == 'apple') return brand == 'apple';
    if (eco == 'android') {
      return const {'samsung','xiaomi','oneplus','oppo','vivo','realme','google','motorola','huawei','honor','nothing'}
          .contains(brand);
    }
    return true; // mixed = no filter
  }

  // Pull products from top 12 priority categories — MAX 8 per category
  final topCats = priorityCats.isNotEmpty
      ? priorityCats.take(12).toList()
      : user.interestCategories.take(8).toList();

  // First pass: ecosystem-matched products from priority categories
  for (final cat in topCats) {
    final catLower = cat.toLowerCase().trim();
    final catProducts = feed.byCategory[catLower] ?? [];
    int added = 0;
    for (final p in catProducts) {
      if (!existingIds.contains(p.id) && !excludeIds.contains(p.id) && isEcoMatch(p)) {
        allProducts.add(p);
        existingIds.add(p.id);
        added++;
      }
      if (added >= 5) break;
    }
  }

  // Second pass: fill remaining slots from priority categories (any ecosystem)
  for (final cat in topCats) {
    final catLower = cat.toLowerCase().trim();
    final catProducts = feed.byCategory[catLower] ?? [];
    int added = 0;
    for (final p in catProducts) {
      if (!existingIds.contains(p.id) && !excludeIds.contains(p.id)) {
        allProducts.add(p);
        existingIds.add(p.id);
        added++;
      }
      if (added >= 4) break;
    }
  }

  // Fill with cross-category trending products for discovery
  if (allProducts.length < 60) {
    for (final p in feed.trending) {
      if (!existingIds.contains(p.id) && !excludeIds.contains(p.id)) {
        allProducts.add(p);
        existingIds.add(p.id);
      }
      if (allProducts.length >= 80) break;
    }
  }

  // Sort with full profile algorithm
  final sortedProducts = algorithmService.sortByRelevance(
    user: user,
    products: allProducts,
    behavior: behavior,
  );

  // Final diversity check: max 6 per category in output
  final outputCatCount = <String, int>{};
  final result = <ProductEntity>[];
  for (final p in sortedProducts) {
    final cat = p.category.toLowerCase();
    final cnt = outputCatCount[cat] ?? 0;
    if (cnt < 6) {
      result.add(p);
      outputCatCount[cat] = cnt + 1;
    }
    if (result.length >= 50) break;
  }
  return result;
});

/// Category priority based on user's interests + behavior
final userCategoryPriorityProvider = FutureProvider<List<String>>((ref) async {
  final userAsync = ref.watch(userProfileProvider);
  final user = userAsync.valueOrNull;

  if (user == null) {
    return ['smartphones', 'laptops', 'tablets', 'gpus'];
  }

  final behavior = await ref.watch(behaviorSignalsProvider.future);
  final algorithmService = ref.read(profileAlgorithmServiceProvider);
  return algorithmService.getCategoryPriority(user, behavior: behavior);
});

// ════════════════════════════════════════════════════
// ─── DYNAMIC HOME SECTIONS ───
// ════════════════════════════════════════════════════

/// "Top in [Category]" — products from user's most viewed category
final topInCategoryProvider = FutureProvider<({String category, List<ProductEntity> products})>((ref) async {
  final behavior = await ref.watch(behaviorSignalsProvider.future);
  final feed = await ref.watch(homeFeedProvider.future);

  // Find the most viewed category
  String topCat = '';
  int maxViews = 0;
  for (final entry in behavior.categoryViews.entries) {
    if (entry.value > maxViews) {
      maxViews = entry.value;
      topCat = entry.key.toLowerCase().trim();
    }
  }

  if (topCat.isEmpty || maxViews < 2) {
    return (category: '', products: <ProductEntity>[]);
  }

  final catProducts = feed.byCategory[topCat] ?? [];
  if (catProducts.isEmpty) return (category: '', products: <ProductEntity>[]);

  // Return top products, exclude first few they've likely already seen
  final viewedIds = behavior.productViews.keys.toSet();
  final fresh = catProducts.where((p) => !viewedIds.contains(p.id)).take(30).toList();
  if (fresh.length < 5) {
    // Not enough fresh products, show top ones
    return (category: topCat, products: catProducts.take(30).toList());
  }
  return (category: topCat, products: fresh);
});

/// "Recently Analyzed" — products user has analyzed with AI
final recentlyAnalyzedProvider = FutureProvider<List<ProductEntity>>((ref) async {
  final userAsync = ref.watch(userProfileProvider);
  final user = userAsync.valueOrNull;
  if (user == null) return [];

  try {
    final userDoc = await FirebaseFirestore.instance
        .collection('users').doc(user.uid).get();
    final data = userDoc.data();
    if (data == null || data['analyzedProducts'] is! List) return [];

    final analyzed = (data['analyzedProducts'] as List).cast<Map<String, dynamic>>();
    if (analyzed.isEmpty) return [];

    // Get product IDs from analyzed history (most recent first)
    final productIds = analyzed
        .where((e) => e['productId'] != null)
        .map((e) => e['productId'].toString())
        .toSet()
        .take(10)
        .toList();

    if (productIds.isEmpty) return [];

    // Try to find these products in the home feed cache first
    final feed = await ref.watch(homeFeedProvider.future);
    final feedMap = {for (final p in feed.all) p.id: p};
    final result = <ProductEntity>[];
    for (final id in productIds) {
      if (feedMap.containsKey(id)) {
        result.add(feedMap[id]!);
      }
    }

    // If not enough in cache, fetch from Firestore
    if (result.length < productIds.length) {
      final missingIds = productIds.where((id) => !feedMap.containsKey(id)).toList();
      for (final id in missingIds.take(5)) {
        try {
          final pResult = await ref.read(productRepositoryProvider).getProduct(id);
          pResult.when(
            success: (p) => result.add(p),
            failure: (_) {},
          );
        } catch (_) {}
      }
    }

    return result;
  } catch (e) {
    debugPrint('[recentlyAnalyzed] Error: $e');
    return [];
  }
});

/// "Price Drop" / Value Picks — high techScore at lower price tiers
final valuePicsProvider = FutureProvider<List<ProductEntity>>((ref) async {
  final feed = await ref.watch(homeFeedProvider.future);
  final user = ref.read(userProfileProvider).valueOrNull;
  final country = ref.read(selectedCountryProvider);

  // Find products with high techScore but relatively low price
  final candidates = feed.all.where((p) {
    final score = p.techScore ?? 0;
    final price = p.getPriceForCountry(country) ?? 0;
    // Good value: high score, reasonable price
    return score >= 60 && price > 0 && price < 2000;
  }).toList();

  // Sort by value ratio (techScore / price)
  candidates.sort((a, b) {
    final priceA = a.getPriceForCountry(country) ?? 1;
    final priceB = b.getPriceForCountry(country) ?? 1;
    final ratioA = (a.techScore ?? 0) / priceA;
    final ratioB = (b.techScore ?? 0) / priceB;
    return ratioB.compareTo(ratioA);
  });

  // Ensure diversity
  final catCount = <String, int>{};
  final result = <ProductEntity>[];
  for (final p in candidates) {
    final cat = p.category.toLowerCase();
    final cnt = catCount[cat] ?? 0;
    if (cnt < 4) {
      result.add(p);
      catCount[cat] = cnt + 1;
    }
    if (result.length >= 30) break;
  }
  return result;
});

/// Calculate fit score for a specific product
final productFitScoreProvider = FutureProvider.family<double, String>((ref, productId) async {
  final userAsync = ref.watch(userProfileProvider);
  final user = userAsync.valueOrNull;

  if (user == null) return 0.0;

  final behavior = await ref.watch(behaviorSignalsProvider.future);
  final productResult = await ref.read(productRepositoryProvider).getProduct(productId);

  return productResult.when(
    success: (product) {
      final algorithmService = ref.read(profileAlgorithmServiceProvider);
      return algorithmService.calculateTotalFitScore(
          user: user, product: product, behavior: behavior);
    },
    failure: (_) => 0.0,
  );
});

/// User profile vector provider
final userProfileVectorProvider = Provider<Map<String, double>>((ref) {
  final userAsync = ref.watch(userProfileProvider);
  final user = userAsync.valueOrNull;

  if (user == null) return {};

  // Calculate profile vector
  final algorithmService = ref.read(profileAlgorithmServiceProvider);
  return algorithmService.calculateProfileVector(user);
});

/// Recently viewed product IDs (Firestore-backed, persistent across sessions)
final viewedProductsProvider = StreamProvider<List<String>>((ref) {
  final authState = ref.watch(authStateProvider);
  return authState.when(
    data: (user) {
      if (user == null) return Stream.value(<String>[]);
      return ref.read(firebaseDataSourceProvider).watchRecentlyViewed(user.uid);
    },
    loading: () => Stream.value(<String>[]),
    error: (_, __) => Stream.value(<String>[]),
  );
});

/// Record a product view (non-blocking, uses cached data)
Future<void> recordProductView(WidgetRef ref, String productId) async {
  try {
    await ref.read(hiveDataSourceProvider).addViewedProduct(productId);
    // Save to Firestore for persistence
    final user = ref.read(authStateProvider).valueOrNull;
    if (user != null) {
      ref.read(firebaseDataSourceProvider).addRecentlyViewed(user.uid, productId);
    }
    // Get product info from cache (no network call)
    String category = '';
    String? brand;
    final feedAsync = ref.read(homeFeedProvider);
    final cached = feedAsync.valueOrNull;
    if (cached != null) {
      final match = cached.all.where((p) => p.id == productId).firstOrNull;
      category = match?.category ?? '';
      brand = match?.brand;
    }
    ref.read(behaviorTrackingProvider).trackProductView(productId, category);
    ref.read(behaviorTrackingProvider).trackActiveHour();
    // Increment Firestore viewCount (fire-and-forget, non-blocking)
    ref.read(firebaseDataSourceProvider).incrementProductViewCount(productId);
    // Firebase Analytics
    AnalyticsService.instance.logProductView(productId, category, brand);
  } catch (_) {}
}

// ─── Freemium Usage Tracking ──────────────────────────────────────────────────

class FreemiumLimits {
  static const int comparisonsPerDay = 5;
  static const int aiChatsPerDay = 15;
  static const int linkAnalysesPerWeek = 3;
}

final freemiumUsageProvider = Provider.family<int, String>((ref, feature) {
  try {
    final period = feature == 'link_analysis' ? 'weekly' : 'daily';
    return ref.watch(hiveDataSourceProvider).getUsageCount(feature, period: period);
  } catch (_) {
    return 0;
  }
});

Future<bool> checkAndIncrementUsage(WidgetRef ref, String feature) async {
  final isPremium = ref.read(premiumProvider);
  if (isPremium) return true;

  final period = feature == 'link_analysis' ? 'weekly' : 'daily';
  final current = ref.read(hiveDataSourceProvider).getUsageCount(feature, period: period);
  final limit = switch (feature) {
    'comparison' => FreemiumLimits.comparisonsPerDay,
    'ai_chat' => FreemiumLimits.aiChatsPerDay,
    'link_analysis' => FreemiumLimits.linkAnalysesPerWeek,
    _ => 999,
  };
  if (current >= limit) return false;
  await ref.read(hiveDataSourceProvider).incrementUsage(feature, period: period);
  ref.invalidate(freemiumUsageProvider(feature));
  return true;
}

// ─── Spec Direction Service ───────────────────────────────────────────────────

final specDirectionServiceProvider = FutureProvider<SpecDirectionService>((ref) async {
  final service = SpecDirectionService();
  try {
    await service.loadFirestoreOverrides().timeout(const Duration(seconds: 5));
  } catch (_) {
    // Use default directions if Firestore is slow
  }
  return service;
});

/// Returns variants of a product (same base name, different storage/RAM)
final productVariantsProvider = FutureProvider.family<List<ProductEntity>, ProductEntity>((ref, product) async {
  final baseName = normalizeProductName(product.name);
  final baseGroup = product.variantGroup;

  List<ProductEntity> _filterVariants(List<ProductEntity> products) {
    final variants = products.where((p) {
      if (p.id == product.id) return false;
      if (baseGroup.isNotEmpty && p.variantGroup.isNotEmpty) {
        return p.variantGroup == baseGroup;
      }
      return normalizeProductName(p.name) == baseName;
    }).toList();
    variants.sort((a, b) => _storageCapacityMB(a).compareTo(_storageCapacityMB(b)));
    return variants;
  }

  // 1) Try from already-cached homeFeed (instant, no network)
  final feedAsync = ref.read(homeFeedProvider);
  final cached = feedAsync.valueOrNull;
  if (cached != null) {
    final catKey = (product.category ?? '').toLowerCase().trim();
    final catProducts = cached.byCategory[catKey] ?? [];
    // Also search all products in case category key doesn't match
    final allProducts = cached.trending;
    final pool = {...catProducts, ...allProducts}.toList();
    final variants = _filterVariants(pool);
    if (variants.isNotEmpty) return variants;
  }

  // 2) Fallback: small Firestore query (limit 30, not 200!)
  try {
    final result = await ref.read(productRepositoryProvider).getProducts(
      category: product.category,
      limit: 30,
    ).timeout(const Duration(seconds: 8));
    return result.when(
      success: (products) => _filterVariants(products),
      failure: (_) => [],
    );
  } catch (_) {
    return [];
  }
});

// End of file

// ════════════════════════════════════════════════════
// ─── SIMILAR PRODUCTS PROVIDER ───
// ════════════════════════════════════════════════════

/// Finds truly similar products: same category, persona-aware scoring,
/// variant exclusion, brand diversity. Uses homeFeed cache + Firestore.
final similarProductsProvider = FutureProvider.family<List<ProductEntity>, ProductEntity>(
  (ref, product) async {
    try {
      final catKey = product.category.toLowerCase().trim();

      // Load user profile + behavior for persona-aware scoring
      final userAsync = ref.read(userProfileProvider);
      final user = userAsync.valueOrNull;
      BehaviorSignals behavior = BehaviorSignals.empty;
      ProfileAlgorithmService? algorithmService;
      if (user != null) {
        try {
          behavior = await ref.read(behaviorSignalsProvider.future)
              .timeout(const Duration(seconds: 4), onTimeout: () => BehaviorSignals.empty);
        } catch (_) {}
        algorithmService = ref.read(profileAlgorithmServiceProvider);
      }

      // Recently viewed product IDs for boosting/awareness
      final viewedAsync = ref.read(viewedProductsProvider);
      final viewedIds = viewedAsync.valueOrNull ?? [];
      final recentViewedSet = viewedIds.take(10).toSet();

      // 1) Build product pool from multiple sources
      List<ProductEntity> pool = [];
      final ds = ref.read(firebaseDataSourceProvider);
      
      try {
        if (ds.isCacheReady) {
          final cached = await ds.getAllCachedProducts();
          pool = cached.cast<ProductEntity>().toList();
        }
      } catch (_) {}
      
      // 2) Parallel: homeFeed cache + Firestore query
      final futures = <Future>[];
      
      futures.add((() async {
        try {
          final feed = await ref.read(homeFeedProvider.future)
              .timeout(const Duration(seconds: 3));
          final ids = pool.map((p) => p.id).toSet();
          for (final p in feed.all) {
            if (!ids.contains(p.id)) pool.add(p);
          }
        } catch (_) {}
      })());

      futures.add((() async {
        try {
          final result = await ref.read(productRepositoryProvider)
              .getProducts(category: product.category, limit: 80)
              .timeout(const Duration(seconds: 8));
          result.when(
            success: (products) {
              final ids = pool.map((p) => p.id).toSet();
              for (final p in products) {
                if (!ids.contains(p.id)) pool.add(p);
              }
            },
            failure: (_) {},
          );
        } catch (_) {}
      })());

      await Future.wait(futures);

      if (pool.isEmpty) return [];

      // Remove self from pool
      pool.removeWhere((p) => p.id == product.id);

      // ── Variant exclusion: remove same variantGroup and similar names ──
      final selfVariantGroup = product.variantGroup;
      final selfNormName = normalizeProductName(product.name);
      pool.removeWhere((p) {
        // Exclude same variant group
        if (selfVariantGroup.isNotEmpty && p.variantGroup.isNotEmpty &&
            p.variantGroup == selfVariantGroup) {
          return true;
        }
        // Exclude products with same normalized name (storage/RAM variants)
        if (normalizeProductName(p.name) == selfNormName) {
          return true;
        }
        return false;
      });

      // Deduplicate remaining pool by variantGroup (keep best techScore representative)
      final variantBest = <String, ProductEntity>{};
      final nameBest = <String, ProductEntity>{};
      final deduped = <ProductEntity>[];
      final dedupeIds = <String>{};
      for (final p in pool) {
        bool dominated = false;
        if (p.variantGroup.isNotEmpty) {
          final existing = variantBest[p.variantGroup];
          if (existing != null) {
            dominated = true;
            // Keep the one with higher techScore
            if (p.techScore > existing.techScore) {
              dedupeIds.remove(existing.id);
              deduped.removeWhere((x) => x.id == existing.id);
              variantBest[p.variantGroup] = p;
            } else {
              continue;
            }
          } else {
            variantBest[p.variantGroup] = p;
          }
        }
        if (!dominated) {
          final normName = normalizeProductName(p.name);
          if (nameBest.containsKey(normName)) {
            final existing = nameBest[normName]!;
            if (p.techScore > existing.techScore) {
              dedupeIds.remove(existing.id);
              deduped.removeWhere((x) => x.id == existing.id);
              nameBest[normName] = p;
            } else {
              continue;
            }
          } else {
            nameBest[normName] = p;
          }
        }
        if (dedupeIds.add(p.id)) deduped.add(p);
      }

      // Separate same-category products
      final sameCat = deduped.where((p) =>
          p.category.toLowerCase().trim() == catKey).toList();

      // Graduated expansion to find at least 4 results
      List<ProductEntity> candidates = [];
      final techScore = product.techScore;

      // Step 1: same category + techScore ±20
      if (candidates.length < 4) {
        final step = sameCat.where((p) =>
            (p.techScore - techScore).abs() <= 20 && p.techScore > 0).toList();
        _addUnique(candidates, step);
      }

      // Step 2: same category + techScore ±40
      if (candidates.length < 4) {
        final step = sameCat.where((p) =>
            (p.techScore - techScore).abs() <= 40 && p.techScore > 0).toList();
        _addUnique(candidates, step);
      }

      // Step 3: same category, no techScore filter
      if (candidates.length < 4) {
        _addUnique(candidates, sameCat);
      }

      // Step 4: parent category match (peripherals grouping)
      if (candidates.length < 4) {
        final parentCats = _getRelatedCategories(catKey);
        if (parentCats.isNotEmpty) {
          final related = deduped.where((p) {
            final pCat = p.category.toLowerCase().trim();
            return parentCats.contains(pCat) && pCat != catKey;
          }).toList();
          _addUnique(candidates, related);
        }
      }

      if (candidates.isEmpty) return [];

      // ── Score candidates with persona-aware algorithm ──
      List<MapEntry<ProductEntity, double>> scored = candidates.map((p) {
        double score = 0;

        // Persona fit score (0-100 range, weighted to 0-35)
        if (user != null && algorithmService != null) {
          final fitScore = algorithmService.calculateTotalFitScore(
            user: user, product: p, behavior: behavior);
          score += fitScore * 0.35;
        }

        // Category match bonus
        if (p.category.toLowerCase().trim() == catKey) score += 15;

        // Tech score similarity (important for "similar" products)
        final techDiff = (p.techScore - techScore).abs();
        if (techDiff <= 5) score += 20;
        else if (techDiff <= 10) score += 15;
        else if (techDiff <= 15) score += 10;
        else if (techDiff <= 25) score += 5;
        else score += 1;

        // Brand diversity bonus — strongly prefer different brands
        if (p.brand?.toLowerCase() != product.brand?.toLowerCase()) {
          score += 12;
        }

        // Recently viewed category boost (user is interested in this type)
        if (recentViewedSet.isNotEmpty) {
          final viewedCats = <String>{};
          final feed = ref.read(homeFeedProvider).valueOrNull;
          if (feed != null) {
            for (final vid in recentViewedSet) {
              final vp = feed.all.where((x) => x.id == vid).firstOrNull;
              if (vp != null) viewedCats.add(vp.category.toLowerCase().trim());
            }
          }
          if (viewedCats.contains(p.category.toLowerCase().trim())) {
            score += 5;
          }
        }

        // Trend score bonus
        if (p.trendScore > 75) score += 4;
        else if (p.trendScore > 50) score += 2;

        // Price proximity bonus
        final pAnyPrice = p.prices.values.isNotEmpty ? p.prices.values.first : 0.0;
        final prodAnyPrice = product.prices.values.isNotEmpty ? product.prices.values.first : 0.0;
        if (pAnyPrice > 0 && prodAnyPrice > 0) {
          final priceDiff = ((pAnyPrice - prodAnyPrice) / prodAnyPrice).abs();
          if (priceDiff <= 0.15) score += 8;
          else if (priceDiff <= 0.3) score += 5;
          else if (priceDiff <= 0.5) score += 2;
        }

        return MapEntry(p, score);
      }).toList();

      scored.sort((a, b) => b.value.compareTo(a.value));

      // Take top results with strict brand diversity (max 3 per brand)
      final result = <ProductEntity>[];
      final brandCount = <String, int>{};
      for (final entry in scored) {
        final brand = entry.key.brand?.toLowerCase() ?? 'unknown';
        if ((brandCount[brand] ?? 0) >= 3) continue;
        brandCount[brand] = (brandCount[brand] ?? 0) + 1;
        result.add(entry.key);
        if (result.length >= 12) break;
      }

      return result;
    } catch (_) {
      return [];
    }
  },
);

/// Add unique products to candidates list (by id)
void _addUnique(List<ProductEntity> target, List<ProductEntity> source) {
  final ids = target.map((p) => p.id).toSet();
  for (final p in source) {
    if (!ids.contains(p.id)) {
      target.add(p);
      ids.add(p.id);
    }
  }
}

/// Map categories to related parent groups for fallback matching
Set<String> _getRelatedCategories(String category) {
  const groups = <Set<String>>[
    // Peripherals
    {'mouse', 'mice', 'fare', 'keyboard', 'klavye', 'keyboards',
     'mousepad', 'webcam', 'headset'},
    // Mobile
    {'smartphone', 'smartphones', 'akıllı telefon', 'phone', 'telefon',
     'tablet', 'tablets'},
    // Computing
    {'laptop', 'laptops', 'dizüstü', 'notebook', 'chromebook',
     'desktop', 'masaüstü'},
    // Display
    {'monitor', 'monitors', 'monitör', 'tv', 'tvs', 'televizyon',
     'television'},
    // Audio
    {'headphone', 'headphones', 'kulaklık', 'earbuds', 'earphone',
     'speaker', 'speakers', 'hoparlör', 'soundbar'},
    // Storage
    {'ssd', 'ssds', 'hdd', 'hdds', 'hard disk', 'external storage',
     'usb flash', 'nas'},
    // Components
    {'gpu', 'gpus', 'ekran kartı', 'graphics card',
     'cpu', 'cpus', 'işlemci', 'processor',
     'ram', 'memory', 'motherboard', 'anakart',
     'psu', 'power supply', 'case', 'kasa'},
    // Wearables
    {'smartwatch', 'smartwatches', 'akıllı saat', 'fitness tracker',
     'wearable'},
    // Cameras
    {'camera', 'cameras', 'fotoğraf makinesi', 'action camera',
     'drone'},
    // Networking
    {'router', 'routers', 'modem', 'mesh', 'access point',
     'network switch'},
    // Power
    {'power bank', 'power banks', 'charger', 'şarj cihazı'},
  ];

  for (final group in groups) {
    if (group.any((g) => category.contains(g) || g.contains(category))) {
      return group;
    }
  }
  return {};
}
