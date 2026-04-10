part of '../compare_screen.dart';

// ─── Benchmark cache TTL: 30 days ───
const _benchmarkCacheTtl = Duration(days: 30);

/// Generates a stable cache key for a set of product IDs + benchmarks
String _benchmarkCacheKey(List<String> productIds, List<String> benchmarkNames) {
  final raw = [...productIds]..sort();
  raw.addAll(benchmarkNames);
  final bytes = utf8.encode(raw.join('|'));
  return md5.convert(bytes).toString();
}

class _CompareBenchmarkSection extends ConsumerStatefulWidget {
  final List<ProductEntity> products;
  final bool autoFetch;
  const _CompareBenchmarkSection({required this.products, this.autoFetch = false});

  @override
  ConsumerState<_CompareBenchmarkSection> createState() => _CompareBenchmarkSectionState();
}

class _CompareBenchmarkSectionState extends ConsumerState<_CompareBenchmarkSection>
    with SingleTickerProviderStateMixin {
  /// productName → { benchmarkName → score }
  final Map<String, Map<String, int>> _scores = {};
  List<String> _benchmarkNames = [];
  String _source = '';
  bool _loading = false;
  bool _loaded = false;
  bool _expanded = false;
  String? _error;

  late AnimationController _barAnimCtrl;

  @override
  void initState() {
    super.initState();
    _barAnimCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );
    // Auto-fetch benchmark data in background when requested
    if (widget.autoFetch) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!_loaded && !_loading) _fetchScores();
      });
    }
  }

  @override
  void dispose() {
    _barAnimCtrl.dispose();
    super.dispose();
  }

  /// Determine which benchmarks to fetch based on category
  void _selectBenchmarks() {
    final cat = (widget.products.first.category).toLowerCase();
    final brands = widget.products.map((p) => (p.brand ?? '').toLowerCase()).toSet();
    final hasApple = brands.any((b) => b.contains('apple'));

    if (cat.contains('phone') || cat.contains('smartphone')) {
      _benchmarkNames = ['Geekbench Single-Core', 'Geekbench Multi-Core', 'AnTuTu', 'DxOMark Camera'];
      _source = 'geekbench.com, antutu.com, dxomark.com';
    } else if (cat.contains('laptop') || cat.contains('notebook')) {
      _benchmarkNames = ['Geekbench Single-Core', 'Geekbench Multi-Core', 'Cinebench R23 Multi', '3DMark Time Spy'];
      _source = 'geekbench.com, cinebench, 3dmark.com';
    } else if (cat.contains('tablet')) {
      _benchmarkNames = ['Geekbench Single-Core', 'Geekbench Multi-Core', 'AnTuTu'];
      _source = 'geekbench.com, antutu.com';
    } else if (cat.contains('cpu') || cat.contains('processor') || cat.contains('işlemci')) {
      _benchmarkNames = ['Cinebench R23 Single', 'Cinebench R23 Multi', 'Geekbench Single-Core', 'PassMark CPU'];
      _source = 'cinebench, geekbench.com, passmark.com';
    } else if (cat.contains('gpu') || cat.contains('ekran kartı') || cat.contains('graphics')) {
      _benchmarkNames = ['3DMark Time Spy', '3DMark Fire Strike', 'PassMark GPU'];
      _source = '3dmark.com, passmark.com';
    } else if (cat.contains('monitor') || cat.contains('tv') || cat.contains('televizyon')) {
      _benchmarkNames = ['Rtings Overall', 'Color Accuracy DeltaE'];
      _source = 'rtings.com';
    } else {
      _benchmarkNames = ['Geekbench Single-Core', 'Geekbench Multi-Core'];
      _source = 'geekbench.com';
    }
  }

  /// Try reading cached benchmarks from Firestore
  Future<bool> _readFirestoreCache() async {
    try {
      final db = FirebaseFirestore.instance;
      final productIds = widget.products.map((p) => p.id).toList();
      final cacheKey = _benchmarkCacheKey(productIds, _benchmarkNames);

      // Check first product's subcollection for the comparison cache doc
      final cacheDoc = await db
          .collection('products')
          .doc(productIds.first)
          .collection('benchmarkCache')
          .doc(cacheKey)
          .get()
          .timeout(const Duration(seconds: 8));

      if (!cacheDoc.exists) return false;

      final data = cacheDoc.data();
      if (data == null) return false;

      // Check TTL
      final cachedAt = data['cachedAt'];
      if (cachedAt is Timestamp) {
        final age = DateTime.now().difference(cachedAt.toDate());
        if (age > _benchmarkCacheTtl) return false;
      }

      // Parse cached scores
      final scoresMap = data['scores'];
      if (scoresMap is! Map) return false;

      for (final benchEntry in scoresMap.entries) {
        final benchName = benchEntry.key as String;
        final products = benchEntry.value;
        if (products is! Map) continue;
        _scores[benchName] = {};
        for (final prodEntry in products.entries) {
          final score = prodEntry.value;
          if (score is num && score > 0) {
            _scores[benchName]![prodEntry.key as String] = score.toInt();
          }
        }
      }
      return _scores.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  /// Save fetched benchmarks to Firestore for future use
  Future<void> _writeFirestoreCache() async {
    try {
      final db = FirebaseFirestore.instance;
      final productIds = widget.products.map((p) => p.id).toList();
      final cacheKey = _benchmarkCacheKey(productIds, _benchmarkNames);

      final scoresMap = <String, Map<String, int>>{};
      for (final entry in _scores.entries) {
        scoresMap[entry.key] = Map<String, int>.from(entry.value);
      }

      // Store under first product's subcollection
      await db
          .collection('products')
          .doc(productIds.first)
          .collection('benchmarkCache')
          .doc(cacheKey)
          .set({
        'scores': scoresMap,
        'benchmarkNames': _benchmarkNames,
        'productIds': productIds,
        'productNames': widget.products.map((p) => p.name).toList(),
        'cachedAt': FieldValue.serverTimestamp(),
      });

      // Also store under each individual product for per-product cache access
      for (final product in widget.products) {
        final perProductScores = <String, int>{};
        for (final bench in _benchmarkNames) {
          final s = _scores[bench]?[product.name];
          if (s != null && s > 0) perProductScores[bench] = s;
        }
        if (perProductScores.isNotEmpty) {
          await db
              .collection('products')
              .doc(product.id)
              .collection('benchmarkCache')
              .doc('latest')
              .set({
            'scores': perProductScores,
            'cachedAt': FieldValue.serverTimestamp(),
          }, SetOptions(merge: true));
        }
      }
    } catch (_) {
      // Cache write failure is non-critical
    }
  }

  /// Fetch benchmark scores via Gemini grounded query
  Future<void> _fetchFromGemini() async {
    final gemini = ref.read(geminiServiceProvider);
    // Normalize product names: trim, collapse whitespace, remove special chars
    String _normalize(String s) => s.trim().replaceAll(RegExp(r'\s+'), ' ');
    final names = widget.products.map((p) => _normalize('${p.brand ?? ''} ${p.name}')).toList();
    final labels = widget.products.map((p) => p.name).toList();
    final benchStr = _benchmarkNames.join(', ');

    // Build a numbered product list for clearer Gemini identification
    final numberedProducts = <String>[];
    for (int i = 0; i < names.length; i++) {
      numberedProducts.add('Product${i + 1}: ${names[i]}');
    }

    final prompt = StringBuffer()
      ..writeln('Find REAL published benchmark scores for these products:')
      ..writeln(numberedProducts.join('\n'))
      ..writeln('')
      ..writeln('Benchmarks needed: $benchStr')
      ..writeln('')
      ..writeln('RULES:')
      ..writeln('- Only report real verified scores from official benchmark databases')
      ..writeln('- Return ONLY lines in this exact format: ProductN|BenchmarkName|NumericScore')
      ..writeln('- Use the exact ProductN label (Product1, Product2, etc.) — NOT the product name')
      ..writeln('- Example: Product1|Geekbench Single-Core|3400')
      ..writeln('- Example: Product2|AnTuTu|2150000')
      ..writeln('- If a score is not available for a product, skip that line entirely')
      ..writeln('- No text, no explanations, just data lines');

    debugPrint('[Benchmark] Prompt:\n${prompt.toString()}');
    final result = await gemini.groundedQuery(prompt.toString());
    debugPrint('[Benchmark] Raw Gemini response:\n$result');

    for (final line in result.split('\n')) {
      final trimmed = line.trim();
      if (trimmed.isEmpty || !trimmed.contains('|')) continue;
      final parts = trimmed.split('|');
      if (parts.length < 3) continue;

      final pRaw = parts[0].trim();
      final bRaw = parts[1].trim();
      final sStr = parts[2].trim().replaceAll(RegExp(r'[^0-9.]'), '');
      final score = double.tryParse(sStr)?.toInt();
      if (score == null || score <= 0) continue;

      // Fuzzy match benchmark name
      final matchedBench = _benchmarkNames.cast<String?>().firstWhere(
        (b) {
          final bLow = bRaw.toLowerCase();
          final benchLow = b!.toLowerCase();
          final benchWords = benchLow.split(RegExp(r'[\s\-]+')).where((w) => w.length > 2).toList();
          return benchWords.every((w) => bLow.contains(w)) || bLow.contains(benchLow);
        },
        orElse: () => null,
      );
      if (matchedBench == null) {
        debugPrint('[Benchmark] No benchmark match for: "$bRaw"');
        continue;
      }

      // Match ProductN label first (preferred)
      String? matchedLabel;
      final pLow = pRaw.toLowerCase().trim();
      final productNMatch = RegExp(r'product\s*(\d+)').firstMatch(pLow);
      if (productNMatch != null) {
        final idx = int.tryParse(productNMatch.group(1)!);
        if (idx != null && idx >= 1 && idx <= labels.length) {
          matchedLabel = labels[idx - 1];
        }
      }

      // Fallback: fuzzy match product name
      if (matchedLabel == null) {
        for (int i = 0; i < names.length; i++) {
          final allWords = names[i].toLowerCase().split(' ').where((w) => w.length > 1).toList();
          final matchCount = allWords.where((w) => pLow.contains(w)).length;
          // More lenient: match 2 words OR >50% of words
          if (matchCount >= 2 || (allWords.isNotEmpty && matchCount / allWords.length > 0.5) ||
              pLow.contains(labels[i].toLowerCase().split(' ').take(2).join(' '))) {
            matchedLabel = labels[i];
            break;
          }
        }
      }
      if (matchedLabel == null) {
        debugPrint('[Benchmark] No product match for: "$pRaw"');
        continue;
      }

      _scores.putIfAbsent(matchedBench, () => {});
      _scores[matchedBench]![matchedLabel] = score;
      debugPrint('[Benchmark] Matched: $matchedLabel | $matchedBench = $score');
    }
  }

  /// Main fetch: cache first, then Gemini fallback (with retry)
  Future<void> _fetchScores() async {
    setState(() { _loading = true; _error = null; });
    try {
      _selectBenchmarks();

      // 1. Try Firestore cache
      final cached = await _readFirestoreCache();
      if (cached && _scores.isNotEmpty) {
        debugPrint('[Benchmark] Loaded from Firestore cache: ${_scores.length} benchmarks');
        if (mounted) {
          setState(() { _loading = false; _loaded = true; });
          _barAnimCtrl.forward();
        }
        return;
      }

      // 2. Fetch from Gemini (with single retry on empty result)
      await _fetchFromGemini();

      if (_scores.isEmpty) {
        debugPrint('[Benchmark] First attempt empty, retrying...');
        await _fetchFromGemini();
      }

      // 3. Cache results to Firestore (fire and forget)
      if (_scores.isNotEmpty) {
        debugPrint('[Benchmark] Got scores for ${_scores.length} benchmarks, caching...');
        _writeFirestoreCache();
      } else {
        debugPrint('[Benchmark] No scores found after retry');
      }

      if (mounted) {
        setState(() { _loading = false; _loaded = true; });
        _barAnimCtrl.forward();
      }
    } catch (e) {
      debugPrint('[Benchmark] Error: $e');
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
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return AnimatedContainer(
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
          // ── Header row — only this toggles ──
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () {
              setState(() => _expanded = !_expanded);
              if (_expanded && !_loaded && !_loading) _fetchScores();
            },
            child: Row(children: [
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
                    style: GoogleFonts.plusJakartaSans(fontSize: 11, color: context.textSecondary)),
                ],
              )),
              if (_loading)
                const SizedBox(width: 20, height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.brandBlue))
              else
                AnimatedRotation(
                  turns: _expanded ? 0.5 : 0,
                  duration: const Duration(milliseconds: 250),
                  child: const Icon(Icons.expand_more_rounded, color: AppTheme.brandBlue),
                ),
            ]),
          ),

          // ── Expanded content — taps absorbed ──
          if (_expanded) ...[
            const SizedBox(height: 16),
            GestureDetector(
              onTap: () {},
              child: _loading
                ? _buildShimmer(isDark)
                : (_error != null || (_loaded && _scores.isEmpty))
                  ? _buildEmptyState()
                  : _loaded
                    ? _buildScoresTable(labels, isDark)
                    : const SizedBox.shrink(),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildShimmer(bool isDark) {
    final base = isDark ? Colors.white.withValues(alpha: 0.06) : Colors.black.withValues(alpha: 0.06);
    return Column(
      children: List.generate(3, (i) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(width: 120, height: 14, decoration: BoxDecoration(
            color: base, borderRadius: BorderRadius.circular(4))),
          const SizedBox(height: 8),
          ...List.generate(widget.products.length, (_) => Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(children: [
              Container(width: 50, height: 10, decoration: BoxDecoration(
                color: base, borderRadius: BorderRadius.circular(3))),
              const SizedBox(width: 8),
              Expanded(child: Container(height: 10, decoration: BoxDecoration(
                color: base, borderRadius: BorderRadius.circular(3)))),
              const SizedBox(width: 8),
              Container(width: 36, height: 10, decoration: BoxDecoration(
                color: base, borderRadius: BorderRadius.circular(3))),
            ]),
          )),
        ]),
      )),
    );
  }

  Widget _buildEmptyState() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Column(children: [
        Icon(Icons.info_outline_rounded, size: 32,
          color: context.textTertiaryColor),
        const SizedBox(height: 8),
        Text(_error ?? (context.l10n?.benchmarkNotFound ?? 'Could not load benchmarks'),
          textAlign: TextAlign.center,
          style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textTertiaryColor)),
        const SizedBox(height: 12),
        GestureDetector(
          onTap: () {
            _scores.clear();
            _loaded = false;
            _error = null;
            _barAnimCtrl.reset();
            _fetchScores();
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
              color: AppTheme.brandBlue.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8)),
            child: Text(context.l10n?.retryBenchmark ?? 'Retry Benchmark Lookup',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.brandBlue)),
          ),
        ),
      ]),
    );
  }

  Widget _buildScoresTable(List<String> labels, bool isDark) {
    // Product colors for bars
    final barColors = [
      AppTheme.brandBlue,
      AppTheme.brandCyan,
      const Color(0xFF7C3AED),
      const Color(0xFFF59E0B),
    ];

    return AnimatedBuilder(
      animation: _barAnimCtrl,
      builder: (context, _) {
        final animVal = Curves.easeOutCubic.transform(_barAnimCtrl.value);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Product legend ──
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Wrap(
                spacing: 16, runSpacing: 6,
                children: List.generate(labels.length, (i) => Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 10, height: 10,
                      decoration: BoxDecoration(
                        color: barColors[i % barColors.length],
                        borderRadius: BorderRadius.circular(3)),
                    ),
                    const SizedBox(width: 6),
                    Text(labels[i].length > 22 ? '${labels[i].substring(0, 22)}…' : labels[i],
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11, fontWeight: FontWeight.w600, color: context.textSecondary)),
                  ],
                )),
              ),
            ),
            const Divider(height: 1),
            const SizedBox(height: 12),

            // ── Benchmark rows ──
            ..._benchmarkNames.map((bench) {
              final benchScores = _scores[bench] ?? {};
              // Find max score for this benchmark to scale bars
              int maxVal = 1;
              for (final s in benchScores.values) {
                if (s > maxVal) maxVal = s;
              }
              // If no scores at all for this benchmark, still show it with N/A
              final bestScore = benchScores.values.isEmpty ? 0
                  : benchScores.values.reduce((a, b) => a > b ? a : b);

              return Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Benchmark name
                    Text(bench,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12, fontWeight: FontWeight.w700, color: context.textPrimary)),
                    const SizedBox(height: 8),
                    // One bar per product
                    ...List.generate(labels.length, (i) {
                      final label = labels[i];
                      final score = benchScores[label];
                      final isBest = score != null && score == bestScore &&
                          benchScores.values.where((v) => v == bestScore).length == 1;
                      final barColor = barColors[i % barColors.length];
                      final ratio = score != null ? (score / maxVal) * animVal : 0.0;

                      return Padding(
                        padding: const EdgeInsets.only(bottom: 5),
                        child: Row(
                          children: [
                            // Product short label
                            SizedBox(
                              width: 52,
                              child: Text(
                                label.length > 8 ? '${label.substring(0, 8)}…' : label,
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 10, color: context.textTertiaryColor),
                                maxLines: 1, overflow: TextOverflow.ellipsis),
                            ),
                            const SizedBox(width: 6),
                            // Animated bar
                            Expanded(
                              child: Stack(
                                children: [
                                  // Background
                                  Container(
                                    height: 10,
                                    decoration: BoxDecoration(
                                      color: isDark
                                          ? Colors.white.withValues(alpha: 0.06)
                                          : Colors.black.withValues(alpha: 0.06),
                                      borderRadius: BorderRadius.circular(5)),
                                  ),
                                  // Filled bar
                                  FractionallySizedBox(
                                    widthFactor: ratio.clamp(0.0, 1.0),
                                    child: Container(
                                      height: 10,
                                      decoration: BoxDecoration(
                                        gradient: LinearGradient(
                                          colors: isBest
                                              ? [barColor, AppTheme.scoreExcellent]
                                              : [barColor.withValues(alpha: 0.7), barColor],
                                        ),
                                        borderRadius: BorderRadius.circular(5)),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            // Score value or N/A
                            SizedBox(
                              width: 44,
                              child: Text(
                                score != null ? _fmt(score) : 'N/A',
                                textAlign: TextAlign.right,
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 12,
                                  fontWeight: isBest ? FontWeight.w800 : FontWeight.w600,
                                  color: score == null
                                      ? context.textTertiaryColor
                                      : (isBest ? AppTheme.scoreExcellent : context.textPrimary)),
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
                  ],
                ),
              );
            }),

            // ── Source attribution ──
            const SizedBox(height: 4),
            Row(children: [
              Icon(Icons.verified_outlined, size: 12, color: context.textTertiaryColor),
              const SizedBox(width: 4),
              Expanded(child: Text('Source: $_source',
                style: GoogleFonts.plusJakartaSans(fontSize: 9, color: context.textTertiaryColor))),
            ]),
          ],
        );
      },
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
// SIMILAR TAB — 2-column grid (matches detail page similar_tab.dart exactly)
// ═══════════════════════════════════════════════════════════

class _CompareSimilarGrid extends ConsumerWidget {
  final String category;
  final Set<String> excludeIds;
  final Set<String> excludeVariantGroups;
  final double refScore;
  const _CompareSimilarGrid({
    required this.category,
    required this.excludeIds,
    this.excludeVariantGroups = const {},
    this.refScore = 50,
  });

  double _scoreForUser(ProductEntity p, List<String> viewedIds, List<String> searches) {
    double score = p.techScore;
    if (viewedIds.contains(p.id)) score += 8;
    final nameLower = p.name.toLowerCase();
    for (final s in searches) {
      if (nameLower.contains(s.toLowerCase())) { score += 10; break; }
    }
    return score;
  }

  List<ProductEntity> _rankAndFill(
    List<ProductEntity> primary,
    List<ProductEntity> fallback,
    List<String> viewedIds,
    List<String> searches,
  ) {
    // Merge primary + fallback, filter excluded IDs and variant groups
    final allCandidates = <ProductEntity>[...primary, ...fallback];
    final seen = <String>{};
    final seenNames = <String>{};
    final deduped = <ProductEntity>[];
    for (final p in allCandidates) {
      if (excludeIds.contains(p.id)) continue;
      if (excludeVariantGroups.isNotEmpty && excludeVariantGroups.contains(p.variantGroup)) continue;
      if (!seen.add(p.id)) continue;
      final normName = p.name.toLowerCase().replaceAll(RegExp(r'\s+'), ' ').trim();
      final nameKey = normName.length > 30 ? normName.substring(0, 30) : normName;
      if (!seenNames.add(nameKey)) continue;
      deduped.add(p);
    }

    // Score all candidates
    deduped.sort((a, b) => _scoreForUser(b, viewedIds, searches)
        .compareTo(_scoreForUser(a, viewedIds, searches)));

    // Brand diversity: max 3 per brand, take exactly 12
    final brandCount = <String, int>{};
    final result = <ProductEntity>[];
    for (final p in deduped) {
      final brand = (p.brand ?? '').toLowerCase().trim();
      if ((brandCount[brand] ?? 0) >= 3) continue;
      brandCount[brand] = (brandCount[brand] ?? 0) + 1;
      result.add(p);
      if (result.length >= 12) break;
    }

    // If still < 12 after brand filter, relax and fill from remaining
    if (result.length < 12) {
      final resultIds = result.map((p) => p.id).toSet();
      for (final p in deduped) {
        if (resultIds.contains(p.id)) continue;
        result.add(p);
        if (result.length >= 12) break;
      }
    }

    return result;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final viewedIds = ref.watch(viewedProductsProvider);
    final searches = ref.watch(recentSearchesProvider);

    // Primary source: homeFeed cache (fast)
    final feed = ref.watch(homeFeedProvider).valueOrNull;
    final primaryPool = feed?.byCategory[category] ?? <ProductEntity>[];

    // Secondary source: Firestore category query (ensures 12 products)
    final categoryAsync = ref.watch(productsByCategoryProvider(category));

    List<ProductEntity> fallbackPool = [];
    bool fallbackLoading = false;
    bool fallbackError = false;

    categoryAsync.when(
      data: (result) {
        switch (result) {
          case Success(data: final products):
            fallbackPool = products;
          case Failure():
            fallbackError = true;
        }
      },
      loading: () => fallbackLoading = true,
      error: (_, __) => fallbackError = true,
    );

    final ranked = _rankAndFill(primaryPool, fallbackPool, viewedIds, searches);

    if (ranked.isEmpty && fallbackLoading) {
      return const Center(child: CircularProgressIndicator(strokeWidth: 2));
    }

    if (ranked.isEmpty) {
      return Center(child: Text('No similar products found',
          style: GoogleFonts.plusJakartaSans(fontSize: 12, color: context.textTertiaryColor)));
    }

    return _buildGrid(context, ranked);
  }

  Widget _buildGrid(BuildContext context, List<ProductEntity> products) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: 0.72,
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
