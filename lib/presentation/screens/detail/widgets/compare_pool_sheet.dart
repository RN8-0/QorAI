part of '../product_detail_screen.dart';

// ═══════════════════════════════════════════════════════════
// COMPARE POOL SHEET
// Bottom sheet that shows the queued (pool) products, lets the user
// remove items, and provides a single "Compare now" CTA which goes
// straight to the comparison results (skipping the compare landing).
// ═══════════════════════════════════════════════════════════

void showComparePoolSheet(BuildContext context) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    useSafeArea: true,
    builder: (ctx) => const _ComparePoolSheet(),
  );
}

class _ComparePoolSheet extends ConsumerWidget {
  const _ComparePoolSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final compareState = ref.watch(comparisonStateProvider);
    final ids = compareState.selectedProductIds.toList();
    final count = ids.length;
    final canCompare = count >= 2;
    final isTr = Localizations.localeOf(context).languageCode == 'tr';
    final primary = Theme.of(context).colorScheme.primary;

    return DraggableScrollableSheet(
      initialChildSize: 0.55,
      minChildSize: 0.4,
      maxChildSize: 0.85,
      expand: false,
      builder: (sheetCtx, scrollController) {
        return Container(
          decoration: BoxDecoration(
            color: context.surfaceColor,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              const SizedBox(height: 10),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.dividerColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 12),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 12, 12),
                child: Row(
                  children: [
                    Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        color: primary.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Icon(Icons.layers_rounded, color: primary, size: 18),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            isTr ? 'Karşılaştırma Havuzu' : 'Compare Pool',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: context.textPrimary,
                            ),
                          ),
                          Text(
                            isTr
                                ? '$count / 4 ürün — en az 2 ürün gerekli'
                                : '$count / 4 products — at least 2 to compare',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 11,
                              color: context.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (count > 0)
                      TextButton(
                        onPressed: () {
                          ref
                              .read(comparisonStateProvider.notifier)
                              .clearSelection();
                          Navigator.of(sheetCtx).pop();
                        },
                        child: Text(
                          isTr ? 'Temizle' : 'Clear',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: AppTheme.error,
                          ),
                        ),
                      ),
                    IconButton(
                      icon: Icon(Icons.close_rounded, color: context.textPrimary),
                      onPressed: () => Navigator.of(sheetCtx).pop(),
                    ),
                  ],
                ),
              ),
              Divider(height: 1, color: context.dividerColor),
              Expanded(
                child: ids.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.compare_arrows_rounded,
                                size: 40,
                                color: context.textTertiaryColor,
                              ),
                              const SizedBox(height: 10),
                              Text(
                                isTr
                                    ? 'Havuz boş — ürün detay sayfasından + butonuna basarak ekle'
                                    : 'Pool is empty — tap + on a product page to add it',
                                textAlign: TextAlign.center,
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 13,
                                  color: context.textSecondary,
                                ),
                              ),
                            ],
                          ),
                        ),
                      )
                    : ListView.builder(
                        controller: scrollController,
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                        itemCount: ids.length,
                        itemBuilder: (context, i) =>
                            _PoolItemRow(productId: ids[i]),
                      ),
              ),
              // ── Sticky CTA: direct comparison ───────────────────────────
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
                  child: SizedBox(
                    width: double.infinity,
                    height: 50,
                    child: GestureDetector(
                      onTap: canCompare
                          ? () {
                              HapticFeedback.mediumImpact();
                              Navigator.of(sheetCtx).pop();
                              // Direct route to comparison — compare screen
                              // auto-starts comparison on initState when the
                              // pool has 2+ products (no intermediate UI).
                              context.go(AppRoutes.compare);
                            }
                          : null,
                      child: Opacity(
                        opacity: canCompare ? 1.0 : 0.45,
                        child: Container(
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: [
                                AppTheme.primaryBlue,
                                AppTheme.accentTeal,
                              ],
                            ),
                            borderRadius: BorderRadius.circular(14),
                            boxShadow: canCompare
                                ? [
                                    BoxShadow(
                                      color: AppTheme.primaryBlue.withValues(
                                        alpha: 0.3,
                                      ),
                                      blurRadius: 10,
                                      offset: const Offset(0, 4),
                                    ),
                                  ]
                                : null,
                          ),
                          alignment: Alignment.center,
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(
                                Icons.compare_arrows_rounded,
                                color: Colors.white,
                                size: 20,
                              ),
                              const SizedBox(width: 8),
                              Text(
                                canCompare
                                    ? (isTr
                                        ? '$count ürünü karşılaştır'
                                        : 'Compare $count products')
                                    : (isTr
                                        ? 'En az 2 ürün ekle'
                                        : 'Add at least 2 products'),
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

// ─── Single pool product row: image + name + remove X ───────────────────────
class _PoolItemRow extends ConsumerWidget {
  final String productId;
  const _PoolItemRow({required this.productId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final productAsync = ref.watch(productDetailProvider(productId));
    return productAsync.when(
      loading: () => _PoolItemSkeleton(),
      error: (_, _) => const SizedBox.shrink(),
      data: (result) => result.when(
        success: (product) => _PoolItemTile(product: product),
        failure: (_) => const SizedBox.shrink(),
      ),
    );
  }
}

class _PoolItemTile extends ConsumerWidget {
  final ProductEntity product;
  const _PoolItemTile({required this.product});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: context.dividerColor),
      ),
      child: Row(
        children: [
          // Product image
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: Container(
              width: 50,
              height: 50,
              color: Colors.white,
              padding: const EdgeInsets.all(4),
              child: ProductImageBox(
                imageUrl: product.imageUrl,
                fallbackUrls: product.images,
                padding: EdgeInsets.zero,
              ),
            ),
          ),
          const SizedBox(width: 12),
          // Name + brand
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (product.brand != null && product.brand!.isNotEmpty)
                  Text(
                    product.brand!.toUpperCase(),
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.primaryBlue,
                      letterSpacing: 0.6,
                    ),
                  ),
                Text(
                  product.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: context.textPrimary,
                    height: 1.2,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          // Remove X
          GestureDetector(
            onTap: () {
              HapticFeedback.lightImpact();
              ref
                  .read(comparisonStateProvider.notifier)
                  .toggleProduct(product.id, productCategory: product.category);
            },
            child: Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AppTheme.error.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.close_rounded,
                size: 16,
                color: AppTheme.error,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PoolItemSkeleton extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      height: 70,
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(14),
      ),
      child: const Center(
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
    );
  }
}
