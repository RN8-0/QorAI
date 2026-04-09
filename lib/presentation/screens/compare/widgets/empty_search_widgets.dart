part of '../compare_screen.dart';

// ─── Empty State ───

class _EmptyCompareState extends ConsumerWidget {
  final VoidCallback onTapSearch;
  final void Function(List<ProductEntity> products) onDirectCompare;
  const _EmptyCompareState({
    required this.onTapSearch,
    required this.onDirectCompare,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final trending = ref.watch(trendingProductsProvider);
    final bool isDark = Theme.of(context).brightness == Brightness.dark;

    return SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(20, 12, 20,
          MediaQuery.of(context).padding.bottom + AppTheme.navBarTotalClearance + 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Hero section
          Center(child: Column(children: [
            Container(
              width: 80, height: 80,
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [
                  AppTheme.brandBlue.withValues(alpha: 0.16),
                  AppTheme.brandDeepBlue.withValues(alpha: 0.16)]),
                shape: BoxShape.circle),
              child: const Center(child: Icon(Icons.compare_arrows_rounded,
                  size: 40, color: AppTheme.brandBlue)),
            ),
            const SizedBox(height: 16),
            Text(context.l10n?.compareProducts ?? 'Compare Products', style: GoogleFonts.plusJakartaSans(
                fontSize: 20, fontWeight: FontWeight.w800,
                color: context.textPrimary)),
            const SizedBox(height: 6),
            Text(context.l10n?.selectProductsOrTry ?? 'Select products or try a popular comparison',
                textAlign: TextAlign.center,
                style: GoogleFonts.plusJakartaSans(fontSize: 13,
                    color: context.textSecondary)),
          ])).animate().fadeIn(duration: 400.ms).slideY(begin: 0.1),
          const SizedBox(height: 24),

          // Popular Comparisons
          Text(context.l10n?.popularComparisons ?? 'Popular Comparisons', style: GoogleFonts.plusJakartaSans(
              fontSize: 16, fontWeight: FontWeight.w700,
              color: context.textPrimary)),
          const SizedBox(height: 12),
          ..._buildPopularComparisons(context, ref),
          const SizedBox(height: 24),

          // Trending Products to Compare
          Text(context.l10n?.trendingProducts ?? 'Trending Products', style: GoogleFonts.plusJakartaSans(
              fontSize: 16, fontWeight: FontWeight.w700,
              color: context.textPrimary)),
          const SizedBox(height: 12),
          trending.when(
            data: (products) {
              // Enforce brand diversity — max 2 per brand
              final diverseProducts = <ProductEntity>[];
              final brandCount = <String, int>{};
              for (final p in products) {
                final brand = p.brand?.toLowerCase() ?? 'unknown';
                if ((brandCount[brand] ?? 0) >= 2) continue;
                brandCount[brand] = (brandCount[brand] ?? 0) + 1;
                diverseProducts.add(p);
                if (diverseProducts.length >= 16) break;
              }
              final top = diverseProducts;
              if (top.isEmpty) return const SizedBox.shrink();
              return Wrap(
                spacing: 8, runSpacing: 8,
                children: top.asMap().entries.map((e) {
                  final p = e.value;
                  return GestureDetector(
                    onTap: () {
                      HapticFeedback.selectionClick();
                      ref.read(comparisonStateProvider.notifier).toggleProduct(p.id);
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: context.surfaceVariantColor,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: context.dividerColor),
                        boxShadow: [BoxShadow(
                          color: (isDark ? Colors.black : Colors.black12).withValues(alpha: isDark ? 0.04 : 0.06),
                          blurRadius: 8, offset: const Offset(0, 2))]),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        if (p.imageUrl != null)
                          ClipRRect(
                            borderRadius: BorderRadius.circular(6),
                            child: CachedNetworkImage(
                              imageUrl: p.imageUrl!,
                              width: 28, height: 28, fit: BoxFit.contain,
                              errorWidget: (_, __, ___) => Icon(
                                  Icons.devices, size: 18, color: context.textTertiaryColor))),
                        if (p.imageUrl != null) const SizedBox(width: 8),
                        Flexible(child: Text(p.name,
                            maxLines: 1, overflow: TextOverflow.ellipsis,
                            style: GoogleFonts.plusJakartaSans(fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: context.textSecondary))),
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppTheme.brandBlue.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(8)),
                          child: Text('${p.techScore.toInt()}',
                              style: GoogleFonts.plusJakartaSans(fontSize: 10,
                                  fontWeight: FontWeight.w700, color: AppTheme.brandBlue))),
                      ]),
                    ),
                  ).animate().fadeIn(delay: (60 * e.key).ms, duration: 300.ms);
                }).toList(),
              );
            },
            loading: () => const Center(child: Padding(
                padding: EdgeInsets.all(20),
                child: CircularProgressIndicator(strokeWidth: 2))),
            error: (_, __) => const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildPopularComparisons(BuildContext context, WidgetRef ref) {
    // Use real products from homeFeed cache instead of hardcoded names
    final feedAsync = ref.watch(homeFeedProvider);
    final feed = feedAsync.valueOrNull;
    final bool isDark = Theme.of(context).brightness == Brightness.dark;

    if (feed == null) {
      return [const Center(child: Padding(
        padding: EdgeInsets.all(16),
        child: CircularProgressIndicator(strokeWidth: 2)))];
    }

    // Build comparison pairs from top 2 products in popular categories
    final comparisons = <Map<String, dynamic>>[];
    final categoryMeta = <String, Map<String, String>>{
      'smartphones': {'icon': '\u{1F4F1}', 'label': 'Smartphones'},
      'laptops': {'icon': '\u{1F4BB}', 'label': 'Laptops'},
      'tablets': {'icon': '\u{1F4F1}', 'label': 'Tablets'},
      'headphones': {'icon': '\u{1F3A7}', 'label': 'Audio'},
      'smartwatches': {'icon': '\u231A', 'label': 'Wearables'},
      'tvs': {'icon': '\u{1F4FA}', 'label': 'TVs'},
      'gpus': {'icon': '\u{1F3AE}', 'label': 'Graphics Cards'},
      'cameras': {'icon': '\u{1F4F7}', 'label': 'Cameras'},
    };

    for (final entry in categoryMeta.entries) {
      final catProducts = feed.byCategory[entry.key] ?? [];
      // Need at least 2 different-brand products
      if (catProducts.length >= 2) {
        final a = catProducts[0];
        ProductEntity? b;
        for (int i = 1; i < catProducts.length; i++) {
          if (catProducts[i].brand != a.brand) {
            b = catProducts[i];
            break;
          }
        }
        b ??= catProducts[1];
        comparisons.add({
          'a': a,
          'b': b,
          'icon': entry.value['icon']!,
          'cat': entry.value['label']!,
        });
      }
      if (comparisons.length >= 6) break;
    }

    if (comparisons.isEmpty) {
      return [Padding(
        padding: const EdgeInsets.all(12),
        child: Text(context.l10n?.loadingPopularComparisons ?? 'Loading popular comparisons...',
            style: GoogleFonts.plusJakartaSans(fontSize: 13, color: context.textTertiaryColor)),
      )];
    }

    return comparisons.asMap().entries.map((e) {
      final c = e.value;
      final i = e.key;
      final productA = c['a'] as ProductEntity;
      final productB = c['b'] as ProductEntity;
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: GestureDetector(
          onTap: () {
            HapticFeedback.mediumImpact();
            onDirectCompare([productA, productB]);
          },
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: context.surfaceVariantColor,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: context.dividerColor),
              boxShadow: [BoxShadow(
                color: (isDark ? Colors.black : Colors.black12).withValues(alpha: isDark ? 0.03 : 0.06),
                blurRadius: 8, offset: const Offset(0, 2))]),
            child: Row(children: [
              Text(c['icon'] as String, style: const TextStyle(fontSize: 24)),
              const SizedBox(width: 12),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${productA.name} vs ${productB.name}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.plusJakartaSans(fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary)),
                  const SizedBox(height: 2),
                  Text(c['cat'] as String, style: GoogleFonts.plusJakartaSans(
                      fontSize: 11, color: context.textTertiaryColor)),
                ])),
              Container(
                width: 32, height: 32,
                decoration: BoxDecoration(
                  color: AppTheme.brandBlue.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.compare_arrows_rounded,
                    size: 16, color: AppTheme.brandBlue)),
            ]),
          ),
        ),
      ).animate().fadeIn(delay: (80 * i).ms, duration: 300.ms)
        .slideX(begin: 0.05, duration: 300.ms);
    }).toList();
  }
}

// ─── Product Search List (no category lock, with match badge) ───

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
    final user = ref.watch(userProfileProvider).valueOrNull;
    final algo = ref.read(profileAlgorithmServiceProvider);
    final behavior = ref.watch(behaviorSignalsProvider).valueOrNull ?? BehaviorSignals.empty;

    return resultsAsync.when(
      data: (result) => result.when(
        success: (products) {
          if (products.isEmpty) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.search_off, size: 48, color: context.textTertiaryColor),
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
              // Calculate match score if user profile exists
              final matchScore = user != null
                  ? algo.calculateTotalFitScore(
                      user: user, product: product, behavior: behavior)
                  : null;
              return _SearchProductTile(
                product: product,
                isSelected: isSelected,
                matchScore: matchScore,
                onTap: () => isSelected ? onRemove(product.id) : onSelect(product.id),
              );
            },
          );
        },
        failure: (error) => Center(
          child: Text(context.l10n?.errorPrefix(error.message ?? '') ?? 'Error: ${error.message}', style: TextStyle(color: context.textPrimary)),
        ),
      ),
      loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandBlue)),
      error: (err, _) => Center(
        child: Text(context.l10n?.anErrorOccurred('$err') ?? 'An error occurred: $err', style: TextStyle(color: context.textPrimary)),
      ),
    );
  }
}

/// Individual search result tile with optional match score badge
class _SearchProductTile extends StatelessWidget {
  final ProductEntity product;
  final bool isSelected;
  final double? matchScore;
  final VoidCallback onTap;

  const _SearchProductTile({
    required this.product,
    required this.isSelected,
    this.matchScore,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final matchPct = matchScore != null ? matchScore!.round().clamp(0, 100) : null;
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
            ? Border.all(color: AppTheme.brandDeepBlue.withValues(alpha: 0.5), width: 1.5)
            : Border.all(color: context.dividerColor),
        boxShadow: isSelected
            ? [
                BoxShadow(color: AppTheme.brandBlue.withValues(alpha: 0.18), blurRadius: 12, offset: const Offset(0, 3)),
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
                // Product image
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: ProductImageBox(
                    imageUrl: product.imageUrl,
                    width: 48, height: 48,
                    borderRadius: BorderRadius.circular(10),
                    padding: const EdgeInsets.all(4),
                  ),
                ),
                const SizedBox(width: 12),
                // Name + brand
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
                        style: TextStyle(fontSize: 13, color: context.textSecondary),
                      ),
                    ],
                  ),
                ),
                // Match score badge
                if (matchPct != null) ...[
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: LinearGradient(
                        colors: matchPct >= 70
                            ? [const Color(0xFF22C55E), const Color(0xFF16A34A)]
                            : matchPct >= 40
                                ? [const Color(0xFFF59E0B), const Color(0xFFD97706)]
                                : [const Color(0xFFEF4444), const Color(0xFFDC2626)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                    ),
                    child: Center(
                      child: Text(
                        '$matchPct',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                ],
                // TechScore badge
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
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
                        color: isSelected ? AppTheme.brandDeepBlue : AppTheme.brandBlue,
                        fontWeight: FontWeight.w600),
                  ),
                ),
                const SizedBox(width: 8),
                // Select/deselect icon
                isSelected
                    ? ShaderMask(
                        shaderCallback: (bounds) => _accentGradient.createShader(bounds),
                        child: const Icon(Icons.check_circle, color: Colors.white, size: 24),
                      )
                    : Icon(Icons.add_circle_outline, color: context.textTertiaryColor, size: 22),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Direct Spec-by-Spec Comparison View ───
