part of '../compare_screen.dart';

// ─── Empty / Discover State ───────────────────────────────────────────────────

class _EmptyCompareState extends ConsumerWidget {
  final VoidCallback onTapSearch;
  final void Function(List<ProductEntity> products) onDirectCompare;
  const _EmptyCompareState({
    required this.onTapSearch,
    required this.onDirectCompare,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userComparisons = ref.watch(userComparisonsProvider);
    final recentlyViewed = ref.watch(recentlyViewedProductsProvider);
    final trending = ref.watch(trendingProductsProvider);
    final feedAsync = ref.watch(homeFeedProvider);
    final theme = Theme.of(context);
    final cs = theme.colorScheme;
    final isTurkish = Localizations.localeOf(context).languageCode == 'tr';

    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        16,
        4,
        16,
        MediaQuery.of(context).padding.bottom +
            AppTheme.navBarTotalClearance +
            24,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Geçmiş Karşılaştırmalar ──────────────────────────────────────
          userComparisons.when(
            data: (result) {
              final comps = result.when(
                success: (list) =>
                    list.where((c) => c.itemIds.length >= 2).take(5).toList(),
                failure: (_) => <ComparisonEntity>[],
              );
              if (comps.isEmpty) return const SizedBox.shrink();
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _SectionHeader(
                    icon: Icons.history_rounded,
                    label: isTurkish
                        ? 'Geçmiş Karşılaştırmalarınız'
                        : 'Your Comparison History',
                    color: cs.primary,
                  ),
                  const SizedBox(height: 10),
                  ...comps.asMap().entries.map(
                    (e) =>
                        _PastComparisonCard(
                              comparison: e.value,
                              onTap: onDirectCompare,
                            )
                            .animate()
                            .fadeIn(delay: (50 * e.key).ms, duration: 300.ms)
                            .slideX(begin: 0.04),
                  ),
                  const SizedBox(height: 20),
                ],
              );
            },
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),

          // ── Son İncelenenler ──────────────────────────────────────────────
          recentlyViewed.when(
            data: (products) {
              if (products.isEmpty) return const SizedBox.shrink();
              // Deduplicate: show only one representative per model (no duplicate iPad variants etc.)
              final deduped = deduplicateVariants(products);
              final top = deduped.take(10).toList();
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _SectionHeader(
                    icon: Icons.remove_red_eye_rounded,
                    label: context.l10n?.recentlyViewed ?? 'Recently Viewed',
                    color: AppTheme.brandDeepBlue,
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    height: 110,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      padding: EdgeInsets.zero,
                      itemCount: top.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 10),
                      itemBuilder: (ctx, i) =>
                          _RecentProductChip(
                                product: top[i],
                                onTap: () {
                                  HapticFeedback.selectionClick();
                                  ref
                                      .read(comparisonStateProvider.notifier)
                                      .toggleProduct(top[i].id);
                                },
                              )
                              .animate()
                              .fadeIn(delay: (40 * i).ms, duration: 280.ms)
                              .slideX(begin: 0.06),
                    ),
                  ),
                  const SizedBox(height: 20),
                ],
              );
            },
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),

          // ── Popüler Karşılaştırmalar ─────────────────────────────────────
          _SectionHeader(
            icon: Icons.local_fire_department_rounded,
            label: context.l10n?.popularComparisons ?? 'Popular Comparisons',
            color: const Color(0xFFFF6B35),
          ),
          const SizedBox(height: 10),
          ..._buildPopularPairs(context, ref, feedAsync.valueOrNull),
          const SizedBox(height: 20),

          // ── Trend Ürünler ─────────────────────────────────────────────────
          _SectionHeader(
            icon: Icons.trending_up_rounded,
            label: context.l10n?.trendingProducts ?? 'Trending Products',
            color: cs.primary,
          ),
          const SizedBox(height: 10),
          trending.when(
            data: (products) {
              // Dedup variants first, then pick diverse brands
              final deduped = deduplicateVariants(products);
              final diverse = <ProductEntity>[];
              final brandCount = <String, int>{};
              for (final p in deduped) {
                final brand = p.brand?.toLowerCase() ?? 'x';
                if ((brandCount[brand] ?? 0) >= 2) continue;
                brandCount[brand] = (brandCount[brand] ?? 0) + 1;
                diverse.add(p);
                if (diverse.length >= 16) break;
              }
              if (diverse.isEmpty) return const SizedBox.shrink();
              return Wrap(
                spacing: 8,
                runSpacing: 8,
                children: diverse.asMap().entries.map((e) {
                  final p = e.value;
                  return _TrendChip(
                    product: p,
                    onTap: () {
                      HapticFeedback.selectionClick();
                      ref
                          .read(comparisonStateProvider.notifier)
                          .toggleProduct(p.id);
                    },
                  ).animate().fadeIn(delay: (50 * e.key).ms, duration: 280.ms);
                }).toList(),
              );
            },
            loading: () => const Center(
              child: Padding(
                padding: EdgeInsets.all(20),
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
            error: (_, __) => const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildPopularPairs(
    BuildContext context,
    WidgetRef ref,
    HomeFeed? feed,
  ) {
    final isTurkish = Localizations.localeOf(context).languageCode == 'tr';
    if (feed == null) {
      return [
        const Center(
          child: Padding(
            padding: EdgeInsets.all(16),
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      ];
    }

    final comparisons = <Map<String, dynamic>>[];
    final categoryMeta = <String, Map<String, String>>{
      'smartphones': {
        'icon': '📱',
        'label': isTurkish ? 'Akıllı Telefon' : 'Smartphone',
      },
      'laptops': {'icon': '💻', 'label': 'Laptop'},
      'tablets': {'icon': '�', 'label': 'Tablet'},
      'headphones': {
        'icon': '🎧',
        'label': isTurkish ? 'Ses Sistemi' : 'Audio',
      },
      'smartwatches': {
        'icon': '⌚',
        'label': isTurkish ? 'Giyilebilir' : 'Wearables',
      },
      'tvs': {'icon': '📺', 'label': isTurkish ? 'Televizyon' : 'TV'},
      'gpus': {
        'icon': '🎮',
        'label': isTurkish ? 'Ekran Kartı' : 'Graphics Card',
      },
      'cameras': {'icon': '📷', 'label': isTurkish ? 'Kamera' : 'Camera'},
      'monitors': {'icon': '🖥️', 'label': isTurkish ? 'Monitör' : 'Monitor'},
      'keyboards': {'icon': '⌨️', 'label': isTurkish ? 'Klavye' : 'Keyboard'},
    };

    // ── Behavior-based category ordering ──────────────────────────────────
    // Read user's viewed category signals from behavior provider
    final behavior = ref.watch(behaviorSignalsProvider).valueOrNull;
    final categoryViewScore = <String, double>{};
    if (behavior != null) {
      for (final entry in behavior.categoryViews.entries) {
        categoryViewScore[entry.key.toLowerCase()] =
            (categoryViewScore[entry.key.toLowerCase()] ?? 0) +
            entry.value.toDouble();
      }
    }
    // Sort categories: user's most viewed first, then by available products
    final sortedCategories = categoryMeta.keys.toList()
      ..sort((a, b) {
        final scoreA = categoryViewScore[a] ?? 0;
        final scoreB = categoryViewScore[b] ?? 0;
        if (scoreB != scoreA) return scoreB.compareTo(scoreA);
        // Tie-break: prefer categories with more products
        final countA = (feed.byCategory[a] ?? []).length;
        final countB = (feed.byCategory[b] ?? []).length;
        return countB.compareTo(countA);
      });

    // ── Small daily rotation seed (changes every day) ─────────────────────
    final today = DateTime.now();
    final rotationSeed = today.year * 10000 + today.month * 100 + today.day;
    final rng = Random(rotationSeed);

    for (final cat in sortedCategories) {
      final raw = feed.byCategory[cat] ?? [];
      if (raw.length < 2) continue;
      // Deduplicate variants before picking pairs
      final catProducts = deduplicateVariants(raw);
      if (catProducts.length < 2) continue;
      // Sort by combined score (trendScore * 0.4 + techScore * 0.6) for variety
      catProducts.sort((a, b) {
        final sA = a.techScore * 0.6 + a.trendScore * 0.4;
        final sB = b.techScore * 0.6 + b.trendScore * 0.4;
        return sB.compareTo(sA);
      });
      // Pick from top-5 candidates with daily rotation to vary picks
      final pool = catProducts.take(5).toList();
      // Shuffle pool with daily seed for variety
      final shuffled = List<ProductEntity>.from(pool)..shuffle(rng);
      final a = shuffled[0];
      // Pick B: strongly prefer different brand
      ProductEntity? b;
      for (final candidate in shuffled.skip(1)) {
        if ((candidate.brand ?? '').toLowerCase() !=
            (a.brand ?? '').toLowerCase()) {
          b = candidate;
          break;
        }
      }
      // Fallback: find any B from full catProducts with different name
      if (b == null) {
        for (int i = 1; i < catProducts.length; i++) {
          if (normalizeProductName(catProducts[i].name) !=
              normalizeProductName(a.name)) {
            b = catProducts[i];
            break;
          }
        }
      }
      if (b == null) continue;
      // Skip if A and B have the same normalized name
      if (normalizeProductName(a.name) == normalizeProductName(b.name))
        continue;
      comparisons.add({
        'a': a,
        'b': b,
        'icon': categoryMeta[cat]!['icon']!,
        'cat': categoryMeta[cat]!['label']!,
      });
      if (comparisons.length >= 6) break;
    }

    if (comparisons.isEmpty) {
      return [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Text(
            isTurkish ? 'Yükleniyor...' : 'Loading...',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 13,
              color: Theme.of(
                context,
              ).colorScheme.onSurface.withValues(alpha: 0.4),
            ),
          ),
        ),
      ];
    }

    return comparisons.asMap().entries.map((e) {
      final c = e.value;
      final a = c['a'] as ProductEntity;
      final b = c['b'] as ProductEntity;
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child:
            _PopularPairCard(
                  productA: a,
                  productB: b,
                  icon: c['icon'] as String,
                  category: c['cat'] as String,
                  onTap: () {
                    HapticFeedback.mediumImpact();
                    onDirectCompare([a, b]);
                  },
                )
                .animate()
                .fadeIn(delay: (70 * e.key).ms, duration: 300.ms)
                .slideX(begin: 0.04),
      );
    }).toList();
  }
}

// ─── Section Header ───────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  const _SectionHeader({
    required this.icon,
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 30,
          height: 30,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, size: 16, color: color),
        ),
        const SizedBox(width: 10),
        Text(
          label,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 15,
            fontWeight: FontWeight.w700,
            color: context.textPrimary,
          ),
        ),
      ],
    );
  }
}

// ─── Past Comparison Card ─────────────────────────────────────────────────────

class _PastComparisonCard extends ConsumerWidget {
  final ComparisonEntity comparison;
  final void Function(List<ProductEntity>) onTap;
  const _PastComparisonCard({required this.comparison, required this.onTap});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).colorScheme;
    final ids = comparison.itemIds.take(4).toList();

    // Load products from the comparison
    final products = <ProductEntity>[];
    bool loading = false;
    for (final id in ids) {
      final async = ref.watch(productDetailProvider(id));
      async.when(
        data: (result) =>
            result.when(success: (p) => products.add(p), failure: (_) {}),
        loading: () => loading = true,
        error: (_, __) {},
      );
    }

    final title = comparison.title?.isNotEmpty == true
        ? comparison.title!
        : products.isNotEmpty
        ? products.map((p) => p.name).join(' vs ')
        : ids.join(' vs ');

    return GestureDetector(
      onTap: () {
        if (products.length >= 2) onTap(products);
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: context.dividerColor),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          children: [
            // Product images
            SizedBox(
              width: 64,
              height: 40,
              child: Stack(
                children: products.take(2).toList().asMap().entries.map((e) {
                  return Positioned(
                    left: e.key * 22.0,
                    child: Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: context.surfaceColor,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: context.dividerColor),
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(9),
                        child: e.value.imageUrl != null
                            ? CachedNetworkImage(
                                imageUrl: e.value.imageUrl!,
                                width: 40,
                                height: 40,
                                fit: BoxFit.contain,
                                errorWidget: (_, __, ___) => Icon(
                                  Icons.devices,
                                  size: 18,
                                  color: context.textTertiaryColor,
                                ),
                              )
                            : Icon(
                                Icons.devices,
                                size: 18,
                                color: context.textTertiaryColor,
                              ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: context.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      Icon(
                        Icons.schedule_rounded,
                        size: 11,
                        color: context.textTertiaryColor,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        _timeAgo(context, comparison.createdAt),
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11,
                          color: context.textTertiaryColor,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: cs.primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                _timeAgoLabel(context),
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: cs.primary,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _timeAgo(BuildContext context, DateTime dt) {
    final isTurkish = Localizations.localeOf(context).languageCode == 'tr';
    return _timeAgoForLocale(isTurkish, dt);
  }

  String _timeAgoLabel(BuildContext context) {
    final isTurkish = Localizations.localeOf(context).languageCode == 'tr';
    return isTurkish ? 'Tekrar' : 'Replay';
  }

  String _timeAgoForLocale(bool isTurkish, DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inDays >= 30) {
      final months = (diff.inDays / 30).floor();
      return isTurkish ? '$months ay önce' : '$months mo ago';
    }
    if (diff.inDays >= 1) {
      return isTurkish ? '${diff.inDays} gün önce' : '${diff.inDays}d ago';
    }
    if (diff.inHours >= 1) {
      return isTurkish ? '${diff.inHours} saat önce' : '${diff.inHours}h ago';
    }
    return isTurkish ? 'Az önce' : 'Just now';
  }
}

// ─── Recently Viewed Chip ─────────────────────────────────────────────────────

class _RecentProductChip extends StatelessWidget {
  final ProductEntity product;
  final VoidCallback onTap;
  const _RecentProductChip({required this.product, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 90,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: context.dividerColor),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (product.imageUrl != null)
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: CachedNetworkImage(
                  imageUrl: product.imageUrl!,
                  width: 44,
                  height: 44,
                  fit: BoxFit.contain,
                  errorWidget: (_, __, ___) => Icon(
                    Icons.devices,
                    size: 24,
                    color: context.textTertiaryColor,
                  ),
                ),
              )
            else
              Icon(Icons.devices, size: 28, color: context.textTertiaryColor),
            const SizedBox(height: 6),
            Text(
              product.name,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 9,
                fontWeight: FontWeight.w600,
                color: context.textSecondary,
              ),
            ),
            const SizedBox(height: 4),
            if (product.techScore > 0)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                decoration: BoxDecoration(
                  color: cs.primary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  '${product.techScore.toInt()}',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: cs.primary,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ─── Popular Pair Card ────────────────────────────────────────────────────────

class _PopularPairCard extends StatelessWidget {
  final ProductEntity productA;
  final ProductEntity productB;
  final String icon;
  final String category;
  final VoidCallback onTap;
  const _PopularPairCard({
    required this.productA,
    required this.productB,
    required this.icon,
    required this.category,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: context.dividerColor),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          children: [
            // Product images side by side
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _ProductMini(product: productA),
                Container(
                  width: 24,
                  height: 24,
                  margin: const EdgeInsets.symmetric(horizontal: 6),
                  decoration: BoxDecoration(
                    color: cs.primary.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    Icons.compare_arrows_rounded,
                    size: 13,
                    color: cs.primary,
                  ),
                ),
                _ProductMini(product: productB),
              ],
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${productA.name} vs ${productB.name}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: context.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Row(
                    children: [
                      Text(icon, style: const TextStyle(fontSize: 11)),
                      const SizedBox(width: 4),
                      Text(
                        category,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11,
                          color: context.textTertiaryColor,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Icon(
              Icons.chevron_right_rounded,
              size: 18,
              color: context.textTertiaryColor,
            ),
          ],
        ),
      ),
    );
  }
}

class _ProductMini extends StatelessWidget {
  final ProductEntity product;
  const _ProductMini({required this.product});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: context.dividerColor),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(9),
        child: product.imageUrl != null
            ? CachedNetworkImage(
                imageUrl: product.imageUrl!,
                width: 40,
                height: 40,
                fit: BoxFit.contain,
                errorWidget: (_, __, ___) => Icon(
                  Icons.devices,
                  size: 18,
                  color: context.textTertiaryColor,
                ),
              )
            : Icon(Icons.devices, size: 18, color: context.textTertiaryColor),
      ),
    );
  }
}

// ─── Trend Chip ───────────────────────────────────────────────────────────────

class _TrendChip extends StatelessWidget {
  final ProductEntity product;
  final VoidCallback onTap;
  const _TrendChip({required this.product, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: context.dividerColor),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.03),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (product.imageUrl != null)
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: CachedNetworkImage(
                  imageUrl: product.imageUrl!,
                  width: 26,
                  height: 26,
                  fit: BoxFit.contain,
                  errorWidget: (_, __, ___) => Icon(
                    Icons.devices,
                    size: 16,
                    color: context.textTertiaryColor,
                  ),
                ),
              ),
            if (product.imageUrl != null) const SizedBox(width: 8),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 130),
              child: Text(
                product.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: context.textSecondary,
                ),
              ),
            ),
            if (product.techScore > 0) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: cs.primary.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '${product.techScore.toInt()}',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: cs.primary,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ─── Product Search List ──────────────────────────────────────────────────────

class _ProductSearchList extends ConsumerWidget {
  final List<String> selectedIds;
  final Function(String) onSelect;
  final Function(String) onRemove;

  const _ProductSearchList({
    required this.selectedIds,
    required this.onSelect,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = ref.watch(searchQueryProvider);
    final resultsAsync = ref.watch(searchResultsProvider(query));

    return resultsAsync.when(
      data: (result) => result.when(
        success: (rawProducts) {
          // Final safety dedup — ensures no variant duplicates regardless of source
          var products = deduplicateVariants(rawProducts);

          // When no query: enforce brand + category diversity
          // so the same brand/model doesn't dominate the list
          if (query.isEmpty) {
            final brandCount = <String, int>{};
            final catCount = <String, int>{};
            final diverseProducts = <ProductEntity>[];
            for (final p in products) {
              final brand = (p.brand ?? 'x').toLowerCase();
              final cat = p.category.toLowerCase();
              final bc = brandCount[brand] ?? 0;
              final cc = catCount[cat] ?? 0;
              if (bc >= 3 || cc >= 6) continue;
              brandCount[brand] = bc + 1;
              catCount[cat] = cc + 1;
              diverseProducts.add(p);
              if (diverseProducts.length >= 80) break;
            }
            products = diverseProducts;
          }
          if (products.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.search_off,
                    size: 48,
                    color: context.textTertiaryColor,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    context.l10n?.noProductsFound ?? 'No products found',
                    style: TextStyle(color: context.textSecondary),
                  ),
                ],
              ),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            itemCount: products.length,
            itemBuilder: (context, index) {
              final product = products[index];
              final isSelected = selectedIds.contains(product.id);
              return _SearchProductTile(
                product: product,
                isSelected: isSelected,
                onTap: () =>
                    isSelected ? onRemove(product.id) : onSelect(product.id),
              );
            },
          );
        },
        failure: (error) => Center(
          child: Text(
            context.l10n?.errorPrefix(error.message ?? '') ??
                'Error: ${error.message}',
            style: TextStyle(color: context.textPrimary),
          ),
        ),
      ),
      loading: () => const Center(
        child: CircularProgressIndicator(color: AppTheme.brandBlue),
      ),
      error: (err, _) => Center(
        child: Text(
          context.l10n?.anErrorOccurred('$err') ?? 'An error occurred: $err',
          style: TextStyle(color: context.textPrimary),
        ),
      ),
    );
  }
}

/// Individual search result tile with TechScore badge
class _SearchProductTile extends StatelessWidget {
  final ProductEntity product;
  final bool isSelected;
  final VoidCallback onTap;

  const _SearchProductTile({
    required this.product,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 72,
      margin: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        gradient: isSelected
            ? LinearGradient(
                colors: [
                  AppTheme.brandBlue.withValues(alpha: 0.12),
                  AppTheme.brandDeepBlue.withValues(alpha: 0.06),
                ],
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
              )
            : null,
        color: isSelected ? null : context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(14),
        border: isSelected
            ? Border.all(
                color: AppTheme.brandDeepBlue.withValues(alpha: 0.5),
                width: 1.5,
              )
            : Border.all(color: context.dividerColor),
        boxShadow: isSelected
            ? [
                BoxShadow(
                  color: AppTheme.brandBlue.withValues(alpha: 0.18),
                  blurRadius: 12,
                  offset: const Offset(0, 3),
                ),
                ..._cardShadow,
              ]
            : _cardShadow,
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: ProductImageBox(
                    imageUrl: product.imageUrl,
                    width: 48,
                    height: 48,
                    borderRadius: BorderRadius.circular(10),
                    padding: const EdgeInsets.all(4),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        product.name,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: context.textPrimary,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        product.brand ?? product.subcategory,
                        style: TextStyle(
                          fontSize: 13,
                          color: context.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
                if (product.techScore > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? AppTheme.brandDeepBlue.withValues(alpha: 0.15)
                          : AppTheme.brandBlue.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '${product.techScore.round()}',
                      style: TextStyle(
                        fontSize: 11,
                        color: isSelected
                            ? AppTheme.brandDeepBlue
                            : AppTheme.brandBlue,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                const SizedBox(width: 8),
                isSelected
                    ? ShaderMask(
                        shaderCallback: (bounds) =>
                            _accentGradient.createShader(bounds),
                        child: const Icon(
                          Icons.check_circle,
                          color: Colors.white,
                          size: 24,
                        ),
                      )
                    : Icon(
                        Icons.add_circle_outline,
                        color: context.textTertiaryColor,
                        size: 22,
                      ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Direct Spec-by-Spec Comparison View ─────────────────────────────────────

// Normalize product name for compare pair deduplication
String normalizeProductName(String name) {
  return name
      .toLowerCase()
      .replaceAll(
        RegExp(r'\s*\(\d+\s*(?:gb|tb|mb)\)', caseSensitive: false),
        '',
      )
      .replaceAll(RegExp(r'\b\d+\s*(?:gb|tb|mb)\b', caseSensitive: false), '')
      .replaceAll(
        RegExp(r'\bwi-fi\s*\+\s*cellular\b', caseSensitive: false),
        '',
      )
      .replaceAll(RegExp(r'\bwi-fi\b', caseSensitive: false), '')
      .replaceAll(RegExp(r'\bcellular\b', caseSensitive: false), '')
      .replaceAll(RegExp(r'\b5g\b', caseSensitive: false), '')
      .replaceAll(RegExp(r'\blte\b', caseSensitive: false), '')
      .replaceAll(RegExp(r'[\s\-,/]+$'), '')
      .replaceAll(RegExp(r'\s{2,}'), ' ')
      .trim();
}
