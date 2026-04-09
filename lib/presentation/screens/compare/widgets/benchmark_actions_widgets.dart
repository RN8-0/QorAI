part of '../compare_screen.dart';

class _CompareBenchmarkSection extends ConsumerStatefulWidget {
  final List<ProductEntity> products;
  const _CompareBenchmarkSection({required this.products});

  @override
  ConsumerState<_CompareBenchmarkSection> createState() => _CompareBenchmarkSectionState();
}

class _CompareBenchmarkSectionState extends ConsumerState<_CompareBenchmarkSection> {
  final Map<String, Map<String, int>> _scores = {};
  List<String> _benchmarkNames = [];
  String _source = '';
  bool _loading = false;
  bool _loaded = false;
  bool _expanded = false;
  String? _error;

  @override
  void initState() {
    super.initState();
  }

  Future<void> _fetchScores() async {
    setState(() => _loading = true);
    try {
      final gemini = ref.read(geminiServiceProvider);
      final cat = (widget.products.first.category ?? '').toLowerCase();
      final brand = (widget.products.first.brand ?? '').toLowerCase();
      final isApple = brand.contains('apple');
      final productLabels = widget.products.map((p) => p.name).toList();

      // Category-specific benchmarks
      if (cat.contains('phone') || cat.contains('smartphone')) {
        if (isApple) {
          _benchmarkNames = ['Geekbench Single', 'Geekbench Multi', 'DxOMark'];
          _source = 'geekbench.com, dxomark.com';
        } else {
          _benchmarkNames = ['AnTuTu', 'Geekbench Multi', 'DxOMark'];
          _source = 'antutu.com, geekbench.com, dxomark.com';
        }
      } else if (cat.contains('laptop') || cat.contains('notebook')) {
        _benchmarkNames = ['Cinebench R23', 'PCMark 10', '3DMark'];
        _source = 'cinebench, pcmark, 3dmark';
      } else if (cat.contains('tablet')) {
        _benchmarkNames = ['Geekbench Single', 'Geekbench Multi'];
        _source = 'geekbench.com';
      } else {
        _benchmarkNames = ['Performance Score'];
        _source = 'Various';
      }

      final names = widget.products.map((p) => '${p.brand ?? ''} ${p.name}'.trim()).toList();
      final benchStr = _benchmarkNames.join(', ');

      final prompt = StringBuffer()
        ..writeln('Find REAL benchmark scores for these products:')
        ..writeln(names.map((n) => '- $n').join('\n'))
        ..writeln('')
        ..writeln('Benchmarks: $benchStr')
        ..writeln('')
        ..writeln('Return ONLY lines in format: ProductName|BenchmarkName|NumericScore')
        ..writeln('Example: iPhone 16 Pro|Geekbench Single|3300')
        ..writeln('')
        ..writeln('Only verified scores. Skip if not available.');

      final result = await gemini.groundedQuery(prompt.toString());

      for (final line in result.split('\n')) {
        final parts = line.split('|');
        if (parts.length < 3) continue;
        final pRaw = parts[0].trim();
        final bRaw = parts[1].trim();
        final sStr = parts[2].trim().replaceAll(RegExp(r'[^0-9.]'), '');
        final score = double.tryParse(sStr)?.toInt();
        if (score == null || score <= 0) continue;

        // Fuzzy match benchmark
        final matchedBench = _benchmarkNames.cast<String?>().firstWhere(
          (b) => bRaw.toLowerCase().contains(b!.split(' ').first.toLowerCase()),
          orElse: () => null,
        );
        if (matchedBench == null) continue;

        // Fuzzy match product
        String? matchedLabel;
        for (int i = 0; i < names.length; i++) {
          if (pRaw.toLowerCase().contains(names[i].toLowerCase().split(' ').take(2).join(' ')) ||
              names[i].toLowerCase().contains(pRaw.toLowerCase().split(' ').take(2).join(' '))) {
            matchedLabel = productLabels[i];
            break;
          }
        }
        if (matchedLabel == null) continue;

        _scores.putIfAbsent(matchedBench, () => {});
        _scores[matchedBench]![matchedLabel] = score;
      }

      if (mounted) setState(() { _loading = false; _loaded = true; });
    } catch (e) {
      if (mounted) setState(() { _error = 'Could not load benchmarks'; _loading = false; _loaded = true; });
    }
  }

  String _fmt(int s) {
    if (s >= 1000000) return '${(s / 1000000).toStringAsFixed(1)}M';
    if (s >= 10000) return '${(s / 1000).toStringAsFixed(0)}K';
    if (s >= 1000) return '${(s / 1000).toStringAsFixed(1)}K';
    return s.toString();
  }

  @override
  Widget build(BuildContext context) {
    final labels = widget.products.map((p) => p.name).toList();
    return GestureDetector(
      onTap: () {
        setState(() => _expanded = !_expanded);
        if (_expanded && !_loaded && !_loading) _fetchScores();
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppTheme.brandBlue.withValues(alpha: 0.15)),
          boxShadow: [BoxShadow(
            color: AppTheme.brandBlue.withValues(alpha: 0.08),
            blurRadius: 12, offset: const Offset(0, 4))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [AppTheme.brandBlue, Color(0xFF1E40AF)]),
                  borderRadius: BorderRadius.circular(12)),
                child: Icon(Icons.speed_rounded, color: context.surfaceVariantColor, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(context.l10n?.benchmarkScores ?? 'Benchmark Scores',
                    maxLines: 1, overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.plusJakartaSans(fontSize: 15, fontWeight: FontWeight.w700, color: context.textPrimary)),
                  const SizedBox(height: 2),
                  Text('AI-powered benchmark comparison',
                    style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textSecondary)),
                ],
              )),
              if (_loading)
                const SizedBox(width: 20, height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.brandBlue))
              else
                Icon(_expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                  color: AppTheme.brandBlue),
            ]),
            if (_expanded) ...[
              const SizedBox(height: 14),
              if (_loading)
                const Center(child: Padding(
                  padding: EdgeInsets.all(16),
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.brandBlue),
                ))
              else if (_error != null || (_loaded && _scores.isEmpty))
                Text(_error ?? 'No benchmark data found',
                  style: GoogleFonts.plusJakartaSans(fontSize: 13, color: context.textTertiaryColor))
              else if (_loaded) ...[
                Row(
                  children: [
                    Expanded(flex: 3, child: Text('Benchmark',
                      style: GoogleFonts.plusJakartaSans(fontSize: 11, fontWeight: FontWeight.w700, color: context.textSecondary))),
                    ...labels.map((l) => Expanded(flex: 2, child: Text(l,
                      style: GoogleFonts.plusJakartaSans(fontSize: 10, fontWeight: FontWeight.w700, color: context.textSecondary),
                      textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis))),
                  ],
                ),
                const Divider(height: 16),
                ..._benchmarkNames.where((b) => _scores.containsKey(b)).map((bench) {
                  final scores = _scores[bench]!;
                  int bestScore = 0;
                  for (final s in scores.values) {
                    if (s > bestScore) bestScore = s;
                  }
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(bench, style: GoogleFonts.plusJakartaSans(
                        fontSize: 12, fontWeight: FontWeight.w600, color: context.textPrimary)),
                      const SizedBox(height: 6),
                      ...labels.map((l) {
                        final s = scores[l];
                        final isBest = s != null && s == bestScore && scores.values.where((v) => v == bestScore).length == 1;
                        final maxVal = scores.values.fold<int>(1, (a, b) => a > b ? a : b);
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Row(children: [
                            SizedBox(width: 60, child: Text(
                              l.length > 10 ? '${l.substring(0, 10)}…' : l,
                              style: GoogleFonts.plusJakartaSans(fontSize: 10, color: context.textTertiaryColor),
                              maxLines: 1, overflow: TextOverflow.ellipsis)),
                            Expanded(child: ClipRRect(
                              borderRadius: BorderRadius.circular(3),
                              child: LinearProgressIndicator(
                                value: s != null ? s / maxVal : 0,
                                minHeight: 8,
                                backgroundColor: context.surfaceElevatedColor,
                                color: isBest ? AppTheme.scoreExcellent : AppTheme.brandBlue),
                            )),
                            const SizedBox(width: 8),
                            SizedBox(width: 40, child: Text(
                              s != null ? _fmt(s) : '—',
                              textAlign: TextAlign.right,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 12,
                                fontWeight: isBest ? FontWeight.w800 : FontWeight.w600,
                                color: isBest ? AppTheme.scoreExcellent : context.textPrimary),
                            )),
                          ]),
                        );
                      }),
                    ]),
                  );
                }),
                const SizedBox(height: 4),
                Text('Source: $_source',
                  style: GoogleFonts.plusJakartaSans(fontSize: 9, color: context.textTertiaryColor)),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

// ─── Bottom Actions: Suggested Products + Reset ───

class _CompareBottomActions extends ConsumerWidget {
  final List<ProductEntity> products;
  final VoidCallback onReset;
  const _CompareBottomActions({required this.products, required this.onReset});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final category = products.first.category.isNotEmpty
        ? products.first.category
        : products.first.subcategory;
    final excludeIds = products.map((p) => p.id).toSet();

    if (category.isEmpty) return const SizedBox.shrink();

    return Container(
      margin: const EdgeInsets.fromLTRB(0, 12, 0, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Suggested similar products header
          Text(context.l10n?.similarProducts ?? 'Similar Products',
            style: GoogleFonts.plusJakartaSans(fontSize: 15, fontWeight: FontWeight.w700, color: context.textPrimary)),
          const SizedBox(height: 4),
          Text('Products in the same category',
            style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textTertiaryColor)),
          const SizedBox(height: 12),

          // Suggested products horizontal list
          SizedBox(
            height: 140,
            child: _SuggestedProductsList(
              category: category,
              excludeIds: excludeIds,
            ),
          ),
        ],
      ),
    );
  }
}

class _SuggestedProductsList extends ConsumerWidget {
  final String category;
  final Set<String> excludeIds;
  const _SuggestedProductsList({required this.category, required this.excludeIds});

  List<ProductEntity> _homeFeedFallback(WidgetRef ref) {
    final feed = ref.read(homeFeedProvider).valueOrNull;
    if (feed == null) return [];
    final products = feed.byCategory[category] ?? [];
    return products.where((p) => !excludeIds.contains(p.id)).take(10).toList();
  }

  // Global brands that are well-known and high quality
  static const _globalBrands = {
    'apple', 'samsung', 'sony', 'lg', 'asus', 'acer', 'msi', 'lenovo',
    'hp', 'dell', 'xiaomi', 'honor', 'huawei', 'google', 'microsoft',
    'razer', 'corsair', 'logitech', 'steelseries', 'hyperx', 'nvidia',
    'amd', 'intel', 'gigabyte', 'asrock', 'evga', 'nzxt', 'be quiet',
    'cooler master', 'thermaltake', 'seasonic', 'western digital', 'wd',
    'seagate', 'kingston', 'crucial', 'bose', 'jbl', 'sennheiser',
    'anker', 'oppo', 'realme', 'oneplus', 'nothing', 'motorola',
    'benq', 'viewsonic', 'philips', 'tcl', 'hisense', 'panasonic',
    'canon', 'nikon', 'fujifilm', 'gopro', 'dji', 'marshall',
    'bang & olufsen', 'b&o', 'dyson', 'roborock', 'ecovacs',
    'garmin', 'fitbit', 'amazfit', 'whirlpool', 'bosch',
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final viewedIds = ref.watch(viewedProductsProvider);
    final searches = ref.watch(recentSearchesProvider);
    final productsAsync = ref.watch(productsByCategoryProvider(category));
    return productsAsync.when(
      data: (result) {
        return result.when(
          success: (products) {
            final available = products.where((p) => !excludeIds.contains(p.id)).toList();
            // Prefer global brands, user-aware scoring
            final globalProducts = <ProductEntity>[];
            final otherProducts = <ProductEntity>[];
            for (final p in available) {
              final brand = (p.brand ?? '').toLowerCase().trim();
              if (_globalBrands.contains(brand)) {
                globalProducts.add(p);
              } else {
                otherProducts.add(p);
              }
            }
            // Score and sort by user relevance
            double scoreProduct(ProductEntity p) {
              double score = p.techScore;
              // Small boost for viewed products (not dominating)
              if (viewedIds.contains(p.id)) score += 8;
              final nameLower = p.name.toLowerCase();
              for (final s in searches) {
                if (nameLower.contains(s.toLowerCase())) { score += 10; break; }
              }
              return score;
            }
            globalProducts.sort((a, b) => scoreProduct(b).compareTo(scoreProduct(a)));
            otherProducts.sort((a, b) => scoreProduct(b).compareTo(scoreProduct(a)));
            // Merge: globals first, then fill with others
            final merged = [...globalProducts, ...otherProducts];
            // Brand diversity: max 2 per brand
            final brandCount = <String, int>{};
            final filtered = <ProductEntity>[];
            for (final p in merged) {
              final brand = (p.brand ?? '').toLowerCase().trim();
              if ((brandCount[brand] ?? 0) < 2) {
                filtered.add(p);
                brandCount[brand] = (brandCount[brand] ?? 0) + 1;
              }
              if (filtered.length >= 15) break;
            }
            if (filtered.isEmpty) {
              return Center(child: Text('No suggestions available',
                style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textTertiaryColor)));
            }
            return _buildProductList(context, filtered);
          },
          failure: (_) {
            final fallback = _homeFeedFallback(ref);
            if (fallback.isNotEmpty) {
              return _buildProductList(context, fallback);
            }
            return _buildRetryView(context, ref);
          },
        );
      },
      loading: () => const Center(child: CircularProgressIndicator(strokeWidth: 2)),
      error: (_, __) {
        final fallback = _homeFeedFallback(ref);
        if (fallback.isNotEmpty) {
          return _buildProductList(context, fallback);
        }
        return _buildRetryView(context, ref);
      },
    );
  }

  Widget _buildRetryView(BuildContext context, WidgetRef ref) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Could not load suggestions',
            style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textTertiaryColor)),
          const SizedBox(height: 8),
          GestureDetector(
            onTap: () => ref.invalidate(productsByCategoryProvider(category)),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                color: AppTheme.brandDeepBlue.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text('Retry',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.brandDeepBlue)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProductList(BuildContext context, List<ProductEntity> products) {
    return ListView.builder(
      scrollDirection: Axis.horizontal,
      itemCount: products.length,
      itemBuilder: (context, index) {
        final p = products[index];
        return GestureDetector(
          onTap: () => context.push('/product/${p.id}'),
          child: Container(
            width: 100,
            margin: const EdgeInsets.only(right: 10),
            child: Column(
              children: [
                Container(
                  width: 80, height: 80,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: context.dividerColor),
                  ),
                  child: ProductImageBox(
                    imageUrl: p.imageUrl,
                    width: 76, height: 76,
                    borderRadius: BorderRadius.circular(14),
                    padding: const EdgeInsets.all(6),
                  ),
                ),
                const SizedBox(height: 6),
                Text(p.name,
                  style: GoogleFonts.plusJakartaSans(fontSize: 10, fontWeight: FontWeight.w600, color: context.textPrimary),
                  maxLines: 2, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center),
                Text('${p.techScore.toInt()}',
                  style: GoogleFonts.plusJakartaSans(fontSize: 10, fontWeight: FontWeight.w700, color: AppTheme.brandDeepBlue)),
              ],
            ),
          ),
        );
      },
    );
  }
}

// ═══════════════════════════════════════════════════════════
// SIMILAR TAB — Suggested products per compared item (user-aware)
// ═══════════════════════════════════════════════════════════

class _CompareSuggestedList extends ConsumerWidget {
  final String category;
  final Set<String> excludeIds;
  /// variantGroups to explicitly filter out (same model variants)
  final Set<String> excludeVariantGroups;
  const _CompareSuggestedList({
    required this.category,
    required this.excludeIds,
    this.excludeVariantGroups = const {},
  });

  /// Score a product for the user: viewed > searched > trending > techScore
  double _scoreForUser(ProductEntity p, List<String> viewedIds, List<String> searches) {
    double score = p.techScore;
    // Small boost for viewed products — not dominating the ranking
    if (viewedIds.contains(p.id)) score += 8;
    final nameLower = p.name.toLowerCase();
    for (final s in searches) {
      if (nameLower.contains(s.toLowerCase())) { score += 10; break; }
    }
    return score;
  }

  List<ProductEntity> _rankProducts(
      List<ProductEntity> all, List<String> viewedIds, List<String> searches) {
    final filtered = all
        .where((p) => !excludeIds.contains(p.id))
        .where((p) => !excludeVariantGroups.contains(p.variantGroup))
        .toList();
    // Separate global brands from local/obscure ones
    final globalProducts = <ProductEntity>[];
    final otherProducts = <ProductEntity>[];
    for (final p in filtered) {
      final brand = (p.brand ?? '').toLowerCase().trim();
      if (_SuggestedProductsList._globalBrands.contains(brand)) {
        globalProducts.add(p);
      } else {
        otherProducts.add(p);
      }
    }
    globalProducts.sort((a, b) => _scoreForUser(b, viewedIds, searches)
        .compareTo(_scoreForUser(a, viewedIds, searches)));
    otherProducts.sort((a, b) => _scoreForUser(b, viewedIds, searches)
        .compareTo(_scoreForUser(a, viewedIds, searches)));
    final merged = [...globalProducts, ...otherProducts];
    // Brand diversity: max 3 per brand
    final brandCount = <String, int>{};
    final result = <ProductEntity>[];
    for (final p in merged) {
      final brand = (p.brand ?? '').toLowerCase().trim();
      if ((brandCount[brand] ?? 0) >= 3) continue;
      brandCount[brand] = (brandCount[brand] ?? 0) + 1;
      result.add(p);
      if (result.length >= 12) break;
    }
    return result;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final viewedIds = ref.watch(viewedProductsProvider);
    final searches = ref.watch(recentSearchesProvider);
    final feed = ref.watch(homeFeedProvider).valueOrNull;
    List<ProductEntity> products = [];

    if (feed != null) {
      final catProducts = feed.byCategory[category] ?? [];
      products = _rankProducts(catProducts, viewedIds, searches);
    }

    if (products.isEmpty) {
      final async = ref.watch(productsByCategoryProvider(category));
      return async.when(
        data: (result) => result.when(
          success: (all) {
            final ranked = _rankProducts(all, viewedIds, searches);
            return ranked.isEmpty
                ? Center(child: Text('No similar products found', style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textTertiaryColor)))
                : _buildList(context, ranked);
          },
          failure: (_) => Center(child: Text('Could not load', style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textTertiaryColor))),
        ),
        loading: () => const Center(child: CircularProgressIndicator(strokeWidth: 2)),
        error: (_, __) => Center(child: Text('Error', style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textTertiaryColor))),
      );
    }

    return _buildList(context, products);
  }

  Widget _buildList(BuildContext context, List<ProductEntity> products) {
    return ListView.separated(
      scrollDirection: Axis.horizontal,
      itemCount: products.length,
      separatorBuilder: (_, __) => const SizedBox(width: 8),
      itemBuilder: (context, i) {
        final p = products[i];
        return GestureDetector(
          onTap: () => context.push('/product/${p.id}'),
          child: Container(
            width: 100,
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: context.surfaceVariantColor,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: context.dividerColor),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                ProductImageBox(imageUrl: p.imageUrl, width: 60, height: 60,
                  borderRadius: BorderRadius.circular(8), padding: const EdgeInsets.all(4)),
                const SizedBox(height: 4),
                Text(p.name, maxLines: 2, overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(fontSize: 9, fontWeight: FontWeight.w600, color: context.textPrimary)),
                if (p.techScore > 0) ...[
                  const SizedBox(height: 2),
                  Text('${p.techScore.toInt()}', style: GoogleFonts.plusJakartaSans(
                    fontSize: 9, fontWeight: FontWeight.w700, color: AppTheme.brandDeepBlue)),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}

// ═══════════════════════════════════════════════════════════
// SIMILAR TAB — 2-column grid (matches detail page similar_tab.dart)
// ═══════════════════════════════════════════════════════════

class _CompareSimilarGrid extends ConsumerWidget {
  final String category;
  final Set<String> excludeIds;
  final Set<String> excludeVariantGroups;
  final double refScore; // average techScore of compared products for range expansion
  const _CompareSimilarGrid({
    required this.category,
    required this.excludeIds,
    this.excludeVariantGroups = const {},
    this.refScore = 50,
  });

  double _scoreForUser(ProductEntity p, List<String> viewedIds, List<String> searches) {
    double score = p.techScore;
    // Small boost for viewed products — not dominating the ranking
    if (viewedIds.contains(p.id)) score += 8;
    final nameLower = p.name.toLowerCase();
    for (final s in searches) {
      if (nameLower.contains(s.toLowerCase())) { score += 10; break; }
    }
    return score;
  }

  List<ProductEntity> _rankProducts(
      List<ProductEntity> all, List<String> viewedIds, List<String> searches) {
    final filtered = all
        .where((p) => !excludeIds.contains(p.id))
        .where((p) => excludeVariantGroups.isEmpty || !excludeVariantGroups.contains(p.variantGroup))
        .toList();
    // Deduplicate by product ID
    final seen = <String>{};
    final unique = <ProductEntity>[];
    for (final p in filtered) {
      if (seen.add(p.id)) unique.add(p);
    }

    // Also deduplicate by normalized name to avoid near-identical products
    final seenNames = <String>{};
    final nameDeduped = <ProductEntity>[];
    for (final p in unique) {
      final normName = p.name.toLowerCase().replaceAll(RegExp(r'\s+'), ' ').trim();
      // Use first 30 chars as key to catch variants
      final nameKey = normName.length > 30 ? normName.substring(0, 30) : normName;
      if (seenNames.add(nameKey)) nameDeduped.add(p);
    }

    // Kademeli genişleme: first ±20, then ±40, then unlimited
    List<ProductEntity> scored = [];
    for (final range in [20.0, 40.0, double.infinity]) {
      final inRange = nameDeduped.where((p) =>
        range == double.infinity || (p.techScore - refScore).abs() <= range
      ).toList();
      final globalProducts = <ProductEntity>[];
      final otherProducts = <ProductEntity>[];
      for (final p in inRange) {
        final brand = (p.brand ?? '').toLowerCase().trim();
        if (_SuggestedProductsList._globalBrands.contains(brand)) {
          globalProducts.add(p);
        } else {
          otherProducts.add(p);
        }
      }
      globalProducts.sort((a, b) => _scoreForUser(b, viewedIds, searches)
          .compareTo(_scoreForUser(a, viewedIds, searches)));
      otherProducts.sort((a, b) => _scoreForUser(b, viewedIds, searches)
          .compareTo(_scoreForUser(a, viewedIds, searches)));
      scored = [...globalProducts, ...otherProducts];
      if (scored.length >= 12) break;
    }
    // Brand diversity: max 3 per brand
    final brandCount = <String, int>{};
    final result = <ProductEntity>[];
    for (final p in scored) {
      final brand = (p.brand ?? '').toLowerCase().trim();
      if ((brandCount[brand] ?? 0) >= 3) continue;
      brandCount[brand] = (brandCount[brand] ?? 0) + 1;
      result.add(p);
      if (result.length >= 12) break;
    }
    return result;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final viewedIds = ref.watch(viewedProductsProvider);
    final searches = ref.watch(recentSearchesProvider);
    final feed = ref.watch(homeFeedProvider).valueOrNull;
    List<ProductEntity> products = [];

    if (feed != null) {
      final catProducts = feed.byCategory[category] ?? [];
      products = _rankProducts(catProducts, viewedIds, searches);
    }

    if (products.isEmpty) {
      final async = ref.watch(productsByCategoryProvider(category));
      return async.when(
        data: (result) => result.when(
          success: (all) {
            final ranked = _rankProducts(all, viewedIds, searches);
            return ranked.isEmpty
                ? Center(child: Text('No similar products found',
                    style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textTertiaryColor)))
                : _buildGrid(context, ranked);
          },
          failure: (_) => Center(child: Text('Could not load',
              style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textTertiaryColor))),
        ),
        loading: () => const Center(child: CircularProgressIndicator(strokeWidth: 2)),
        error: (_, __) => Center(child: Text('Error',
            style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textTertiaryColor))),
      );
    }

    return _buildGrid(context, products);
  }

  Widget _buildGrid(BuildContext context, List<ProductEntity> products) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
        childAspectRatio: 0.68,
      ),
      itemCount: products.length,
      itemBuilder: (context, i) => SharedSimilarGridCard(product: products[i]),
    );
  }
}

// ═══════════════════════════════════════════════════════════

class _CompareDiscoverSection extends ConsumerWidget {
  final Set<String> excludeIds;
  const _CompareDiscoverSection({required this.excludeIds});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feedAsync = ref.watch(homeFeedProvider);
    final viewedIds = ref.watch(viewedProductsProvider);
    final searches = ref.watch(recentSearchesProvider);
    return feedAsync.when(
      data: (feed) {
        // Collect top-scoring product from each category
        // Boost products the user has viewed or searched
        final discoverProducts = <ProductEntity>[];
        for (final entry in feed.byCategory.entries) {
          final catProducts = entry.value
              .where((p) => !excludeIds.contains(p.id))
              .toList()
            ..sort((a, b) {
              double scoreA = a.techScore + (viewedIds.contains(a.id) ? 200 : 0);
              double scoreB = b.techScore + (viewedIds.contains(b.id) ? 200 : 0);
              for (final s in searches) {
                if (a.name.toLowerCase().contains(s.toLowerCase())) scoreA += 100;
                if (b.name.toLowerCase().contains(s.toLowerCase())) scoreB += 100;
              }
              return scoreB.compareTo(scoreA);
            });
          if (catProducts.isNotEmpty) discoverProducts.add(catProducts.first);
        }
        // Also add trending products
        final trending = feed.trending.where((p) => !excludeIds.contains(p.id)).take(5).toList();
        for (final tp in trending) {
          if (!discoverProducts.any((p) => p.id == tp.id)) discoverProducts.add(tp);
        }
        discoverProducts.sort((a, b) => b.techScore.compareTo(a.techScore));

        if (discoverProducts.isEmpty) return const SizedBox.shrink();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 8),
            Row(children: [
              Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: AppTheme.brandDeepBlue.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.explore_rounded, color: AppTheme.brandDeepBlue, size: 18),
              ),
              const SizedBox(width: 10),
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(context.l10n?.exploreProducts ?? 'Discover', style: GoogleFonts.plusJakartaSans(fontSize: 14, fontWeight: FontWeight.w700, color: context.textPrimary)),
                Text(context.l10n?.discoverPopular ?? 'Popular products from every category', style: GoogleFonts.plusJakartaSans(fontSize: 11, color: context.textTertiaryColor)),
              ]),
            ]),
            const SizedBox(height: 10),
            SizedBox(
              height: 140,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: discoverProducts.take(10).length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (context, i) {
                  final p = discoverProducts[i];
                  return GestureDetector(
                    onTap: () => context.push('/product/${p.id}'),
                    child: Container(
                      width: 100,
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: context.surfaceVariantColor,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: context.dividerColor),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          ProductImageBox(imageUrl: p.imageUrl, width: 60, height: 60,
                            borderRadius: BorderRadius.circular(8), padding: const EdgeInsets.all(4)),
                          const SizedBox(height: 4),
                          Text(p.category.replaceAll('_', ' '), style: GoogleFonts.plusJakartaSans(
                            fontSize: 8, fontWeight: FontWeight.w600, color: AppTheme.brandDeepBlue)),
                          Text(p.name, maxLines: 2, overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.center,
                            style: GoogleFonts.plusJakartaSans(fontSize: 9, fontWeight: FontWeight.w600, color: context.textPrimary)),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}

/// Renders AI text with basic formatting: strips code fences, bolds headers,
/// and applies bullet/numbered list styling.
class _FormattedAiText extends StatelessWidget {
  final String text;
  const _FormattedAiText({required this.text});

  @override
  Widget build(BuildContext context) {
    // Strip markdown code fences and clean up
    var clean = text.trim();
    // Remove code fences: ```json, ```
    clean = clean.replaceAll(RegExp(r'```(?:json)?\s*\n?'), '');
    clean = clean.replaceAll(RegExp(r'\n?```'), '');

    // If text looks like raw JSON (starts with { and contains typical JSON patterns),
    // try to extract readable content
    if (clean.startsWith('{') && clean.contains('"')) {
      try {
        final parsed = jsonDecode(clean) as Map<String, dynamic>;
        return _buildFromJson(context, parsed);
      } catch (_) {
        // Not valid JSON, continue with text formatting
      }
    }

    final lines = clean.split('\n');
    final widgets = <Widget>[];

    for (final rawLine in lines) {
      final line = rawLine.trim();
      if (line.isEmpty) {
        widgets.add(const SizedBox(height: 6));
        continue;
      }

      // Skip JSON-like lines (curly braces, quotes at start)
      if (line.startsWith('{') || line.startsWith('}') ||
          line.startsWith('"') || line.startsWith('[') || line.startsWith(']')) {
        continue;
      }

      // Headers: ## text, # text
      if (line.startsWith('## ')) {
        final headerText = line.substring(3).trim();
        widgets.add(Container(
          margin: const EdgeInsets.only(top: 14, bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            gradient: LinearGradient(colors: [
              AppTheme.brandBlue.withValues(alpha: 0.12),
              AppTheme.brandDeepBlue.withValues(alpha: 0.08),
            ]),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(children: [
            const Icon(Icons.auto_awesome, size: 14, color: AppTheme.brandDeepBlue),
            const SizedBox(width: 6),
            Expanded(child: Text(headerText, style: GoogleFonts.plusJakartaSans(
              fontSize: 14, fontWeight: FontWeight.w700, color: context.textPrimary))),
          ]),
        ));
        continue;
      }

      if (line.startsWith('# ')) {
        final headerText = line.substring(2).trim();
        widgets.add(Padding(
          padding: const EdgeInsets.only(top: 12, bottom: 6),
          child: Text(headerText, style: GoogleFonts.plusJakartaSans(
            fontSize: 15, fontWeight: FontWeight.w800, color: context.textPrimary)),
        ));
        continue;
      }

      // Bold-only line: **Winner: Product X**
      final boldMatch = RegExp(r'^\*\*(.+?)\*\*:?\s*(.*)$').firstMatch(line);
      if (boldMatch != null) {
        widgets.add(Padding(
          padding: const EdgeInsets.only(top: 6, bottom: 2),
          child: RichText(text: TextSpan(children: [
            TextSpan(text: boldMatch.group(1)!, style: GoogleFonts.plusJakartaSans(
              fontSize: 13, fontWeight: FontWeight.w700, color: context.textPrimary)),
            if (boldMatch.group(2)!.isNotEmpty)
              TextSpan(text: ' ${boldMatch.group(2)!}', style: GoogleFonts.plusJakartaSans(
                fontSize: 13, color: context.textSecondary)),
          ])),
        ));
        continue;
      }

      // Bullet lists: - item, * item, • item
      if (RegExp(r'^[\-\*•]\s+').hasMatch(line)) {
        final content = line.replaceFirst(RegExp(r'^[\-\*•]\s+'), '');
        widgets.add(Padding(
          padding: const EdgeInsets.only(left: 8, bottom: 4),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 6, height: 6,
              margin: const EdgeInsets.only(top: 6, right: 8),
              decoration: const BoxDecoration(
                color: AppTheme.brandDeepBlue,
                shape: BoxShape.circle,
              ),
            ),
            Expanded(child: _buildRichLine(context, content)),
          ]),
        ));
        continue;
      }

      // Numbered lists: 1. item, 2) item
      final numMatch = RegExp(r'^(\d+)[.\)]\s+(.*)').firstMatch(line);
      if (numMatch != null) {
        widgets.add(Padding(
          padding: const EdgeInsets.only(left: 8, bottom: 4),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 22, height: 22,
              margin: const EdgeInsets.only(right: 8, top: 1),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [AppTheme.brandBlue, AppTheme.brandDeepBlue]),
                borderRadius: BorderRadius.circular(6)),
              child: Center(child: Text(numMatch.group(1)!, style: GoogleFonts.plusJakartaSans(
                fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white))),
            ),
            Expanded(child: _buildRichLine(context, numMatch.group(2)!)),
          ]),
        ));
        continue;
      }

      // Regular paragraph
      widgets.add(Padding(
        padding: const EdgeInsets.only(bottom: 3),
        child: _buildRichLine(context, line),
      ));
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: widgets);
  }

  /// Build formatted content from parsed JSON
  Widget _buildFromJson(BuildContext context, Map<String, dynamic> data) {
    final widgets = <Widget>[];

    // Winner
    if (data['winner'] != null) {
      widgets.add(Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [AppTheme.scoreExcellent, AppTheme.scoreExcellent]),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(children: [
          const Text('🏆', style: TextStyle(fontSize: 18)),
          const SizedBox(width: 8),
          Expanded(child: Text('Winner: ${data['winner']}',
            style: GoogleFonts.plusJakartaSans(fontSize: 14, fontWeight: FontWeight.w700, color: Colors.white))),
          if (data['winner_score'] != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(8)),
              child: Text('${data['winner_score']}%', style: GoogleFonts.plusJakartaSans(
                fontSize: 12, fontWeight: FontWeight.w700, color: Colors.white)),
            ),
        ]),
      ));
    }

    // Recommendation
    if (data['recommendation'] != null) {
      widgets.add(Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppTheme.brandBlue.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTheme.brandBlue.withValues(alpha: 0.2)),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('💡', style: TextStyle(fontSize: 16)),
          const SizedBox(width: 8),
          Expanded(child: Text(data['recommendation'],
            style: GoogleFonts.plusJakartaSans(fontSize: 13, height: 1.5, color: context.textPrimary))),
        ]),
      ));
    }

    // Verdict
    if (data['verdict'] != null) {
      widgets.add(Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(data['verdict'],
          style: GoogleFonts.plusJakartaSans(fontSize: 13, fontStyle: FontStyle.italic, color: context.textSecondary)),
      ));
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: widgets);
  }

  /// Renders a line with inline **bold** support
  Widget _buildRichLine(BuildContext context, String line) {
    final spans = <TextSpan>[];
    final parts = line.split(RegExp(r'(\*\*[^*]+\*\*)'));
    for (final part in parts) {
      if (part.startsWith('**') && part.endsWith('**')) {
        spans.add(TextSpan(
          text: part.substring(2, part.length - 2),
          style: GoogleFonts.plusJakartaSans(
            fontSize: 13, fontWeight: FontWeight.w700, color: context.textPrimary),
        ));
      } else {
        spans.add(TextSpan(
          text: part,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 13, height: 1.6, color: context.textSecondary),
        ));
      }
    }
    return RichText(text: TextSpan(children: spans));
  }
}
