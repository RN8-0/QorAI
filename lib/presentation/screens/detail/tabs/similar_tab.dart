part of '../product_detail_screen.dart';

// ═══════════════════════════════════════════════════════════
// SIMILAR PRODUCTS TAB
// ═══════════════════════════════════════════════════════════

class _SimilarProductsTab extends ConsumerWidget {
  final ProductEntity product;
  final bool isDark;
  const _SimilarProductsTab({required this.product, required this.isDark});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).padding.bottom + 40),
      children: [
        _SimilarProductsSection(product: product, isDark: isDark),
      ],
    );
  }
}

// ── Similar Products Section (2-Column Grid) ──
class _SimilarProductsSection extends ConsumerWidget {
  final ProductEntity product;
  final bool isDark;
  const _SimilarProductsSection({required this.product, required this.isDark});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final similarAsync = ref.watch(similarProductsProvider(product));

    return similarAsync.when(
      loading: () => _SimilarShimmer(isDark: isDark),
      error: (_, __) => Center(
        child: Padding(
          padding: const EdgeInsets.only(top: 48),
          child: Column(
            children: [
              Icon(Icons.widgets_outlined, size: 48,
                  color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.3)),
              const SizedBox(height: 12),
              Text('No similar products found',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 14, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5))),
            ],
          ),
        ),
      ),
      data: (products) {
        if (products.isEmpty) return Center(
          child: Padding(
            padding: const EdgeInsets.only(top: 48),
            child: Column(
              children: [
                Icon(Icons.widgets_outlined, size: 48,
                    color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.3)),
                const SizedBox(height: 12),
                Text('No similar products found',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 14, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5))),
              ],
            ),
          ),
        );
        // Flat list sorted by techScore, top 12
        final sorted = List<ProductEntity>.from(products)
          ..sort((a, b) => b.techScore.compareTo(a.techScore));
        final top = sorted.take(12).toList();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: 14),
              child: Row(children: [
                Container(
                  width: 30, height: 30,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [AppTheme.primaryBlue, Color(0xFF7C3AED)]),
                    borderRadius: BorderRadius.circular(8)),
                  child: const Icon(Icons.widgets_rounded, size: 16, color: Colors.white),
                ),
                const SizedBox(width: 10),
                Text(context.l10n?.similarProducts ?? 'Similar Products',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 16, fontWeight: FontWeight.w700,
                    color: context.textPrimary)),
              ]),
            ),
            // 2-column grid
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 0.72,
              ),
              itemCount: top.length,
              itemBuilder: (context, i) => _SimilarGridCard(product: top[i]),
            ),
          ],
        );
      },
    );
  }
}

/// Grid card matching home screen _WideProductCard design.
class _SimilarGridCard extends StatelessWidget {
  final ProductEntity product;
  const _SimilarGridCard({required this.product});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final imageBg = isDark ? Colors.white : const Color(0xFFF1F5F9);

    return GestureDetector(
      onTap: () => context.push('/product/${product.id}'),
      child: Container(
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: AppTheme.brandCyan.withValues(alpha: 0.12),
            width: 0.8,
          ),
          boxShadow: [
            BoxShadow(
              color: AppTheme.brandCyan.withValues(alpha: 0.06),
              blurRadius: 10,
              spreadRadius: -2,
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image section
            Stack(children: [
              Container(
                height: 100, width: double.infinity,
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: imageBg,
                  borderRadius: const BorderRadius.vertical(
                      top: Radius.circular(16))),
                child: ProductImageBox(
                  imageUrl: product.imageUrl,
                  height: 88,
                  borderRadius: BorderRadius.circular(10),
                  padding: EdgeInsets.zero,
                ),
              ),
              if (product.techScore > 0)
                Positioned(top: 7, right: 7, child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 6, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppTheme.accentCyan.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: AppTheme.accentCyan.withValues(alpha: 0.3),
                      width: 0.5)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.local_fire_department_rounded,
                        size: 10, color: AppTheme.accentCyan),
                    const SizedBox(width: 2),
                    Text('${product.techScore.toInt()}',
                        style: GoogleFonts.plusJakartaSans(
                            fontSize: 10, fontWeight: FontWeight.w700,
                            color: AppTheme.accentCyan)),
                  ]),
                )),
            ]),
            // Details section
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 4, 10, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (product.brand != null && product.brand!.isNotEmpty)
                          Text(product.brand!.toUpperCase(),
                              style: GoogleFonts.plusJakartaSans(
                                  fontSize: 9, fontWeight: FontWeight.w600,
                                  color: AppTheme.accentCyan,
                                  letterSpacing: 0.6),
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 2),
                        Text(product.name,
                            maxLines: 2, overflow: TextOverflow.ellipsis,
                            softWrap: true,
                            style: GoogleFonts.plusJakartaSans(
                                fontSize: 12, fontWeight: FontWeight.w700,
                                color: context.textPrimary,
                                height: 1.15)),
                      ],
                    ),
                    SizedBox(
                      width: double.infinity,
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 5),
                        decoration: BoxDecoration(
                          gradient: AppTheme.primaryGradient,
                          borderRadius: BorderRadius.circular(12)),
                        child: Text(
                            context.l10n?.viewDetails ?? 'View Details',
                            textAlign: TextAlign.center,
                            style: GoogleFonts.plusJakartaSans(
                                fontSize: 10, fontWeight: FontWeight.w600,
                                color: Colors.white)),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Quick compare ⚡ button that adds/removes a product from comparison.
class _QuickCompareButton extends ConsumerWidget {
  final String productId;
  final bool isSelected;

  const _QuickCompareButton({
    required this.productId,
    required this.isSelected,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GestureDetector(
      onTap: () {
        ref.read(comparisonStateProvider.notifier).toggleProduct(productId);
        final nowSelected = !isSelected;
        ScaffoldMessenger.of(context).hideCurrentSnackBar();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              nowSelected ? 'Added to compare ⚡' : 'Removed from compare',
              style: GoogleFonts.plusJakartaSans(
                  fontSize: 12, fontWeight: FontWeight.w600)),
            duration: const Duration(seconds: 1),
            behavior: SnackBarBehavior.floating,
            backgroundColor: nowSelected
                ? AppTheme.brandCyan.withValues(alpha: 0.9)
                : AppTheme.slate600,
          ),
        );
      },
      child: Container(
        width: 26, height: 26,
        decoration: BoxDecoration(
          color: isSelected
              ? AppTheme.brandCyan.withValues(alpha: 0.2)
              : context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(7),
          border: Border.all(
            color: isSelected
                ? AppTheme.brandCyan.withValues(alpha: 0.5)
                : AppTheme.brandCyan.withValues(alpha: 0.15),
            width: 0.8,
          ),
        ),
        child: Icon(
          Icons.bolt_rounded,
          size: 15,
          color: isSelected ? AppTheme.brandCyan : context.textTertiaryColor,
        ),
      ),
    );
  }
}


/// Shimmer skeleton shown while similar products load
class _SimilarShimmer extends StatefulWidget {
  final bool isDark;
  const _SimilarShimmer({required this.isDark});

  @override
  State<_SimilarShimmer> createState() => _SimilarShimmerState();
}

class _SimilarShimmerState extends State<_SimilarShimmer>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))
      ..repeat();
    _anim = Tween<double>(begin: -1.5, end: 2.5).animate(
        CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final base = widget.isDark ? Colors.white.withValues(alpha: 0.06) : Colors.black.withValues(alpha: 0.06);
    final highlight = widget.isDark ? Colors.white.withValues(alpha: 0.12) : Colors.black.withValues(alpha: 0.12);

    return AnimatedBuilder(
      animation: _anim,
      builder: (_, __) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header skeleton
            Row(children: [
              _shimmerBox(30, 30, base, highlight, radius: 8),
              const SizedBox(width: 10),
              _shimmerBox(120, 16, base, highlight, radius: 4),
            ]),
            const SizedBox(height: 16),
            // Product cards row
            SizedBox(
              height: 200,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: 4,
                separatorBuilder: (_, __) => const SizedBox(width: 12),
                itemBuilder: (_, __) => _shimmerBox(140, 200, base, highlight, radius: 16),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _shimmerBox(double w, double h, Color base, Color highlight, {double radius = 8}) {
    return Container(
      width: w, height: h,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        gradient: LinearGradient(
          begin: Alignment(_anim.value - 1, 0),
          end: Alignment(_anim.value, 0),
          colors: [base, highlight, base],
        ),
      ),
    );
  }
}

