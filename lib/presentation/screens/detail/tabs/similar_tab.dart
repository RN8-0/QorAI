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
    return CustomScrollView(
      key: PageStorageKey<String>('similar-tab-${product.id}'),
      primary: true,
      physics: const ClampingScrollPhysics(),
      slivers: [
        SliverPadding(
          padding: EdgeInsets.fromLTRB(
            16,
            16,
            16,
            MediaQuery.of(context).padding.bottom + 40,
          ),
          sliver: _SimilarProductsSection(product: product, isDark: isDark),
        ),
      ],
    );
  }
}

const int _kSimilarTabLimit = 26;

List<ProductEntity> _takeEvenSimilarProducts(
  Iterable<ProductEntity> products, {
  int maxItems = _kSimilarTabLimit,
}) {
  final raw = products.take(maxItems).toList();
  if (raw.length.isOdd && raw.length > 1) {
    return raw.sublist(0, raw.length - 1);
  }
  return raw;
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
      loading: () => SliverToBoxAdapter(child: _SimilarShimmer(isDark: isDark)),
      error: (error, stackTrace) => SliverFillRemaining(
        hasScrollBody: false,
        child: _SimilarEmptyState(isDark: isDark),
      ),
      data: (products) {
        if (products.isEmpty) {
          return SliverFillRemaining(
            hasScrollBody: false,
            child: _SimilarEmptyState(isDark: isDark),
          );
        }
        final top = _takeEvenSimilarProducts(products);

        return SliverMainAxisGroup(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.only(left: 4, bottom: 14),
                child: Row(
                  children: [
                    Container(
                      width: 30,
                      height: 30,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [AppTheme.primaryBlue, Color(0xFF7C3AED)],
                        ),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(
                        Icons.widgets_rounded,
                        size: 16,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      context.l10n?.similarProducts ?? 'Similar Products',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: context.textPrimary,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            SliverGrid(
              delegate: SliverChildBuilderDelegate(
                (context, index) => _SimilarGridCard(product: top[index]),
                childCount: top.length,
              ),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                childAspectRatio: 0.82,
              ),
            ),
          ],
        );
      },
    );
  }
}

class _SimilarEmptyState extends StatelessWidget {
  final bool isDark;
  const _SimilarEmptyState({required this.isDark});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 48),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.widgets_outlined,
            size: 48,
            color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.3),
          ),
          const SizedBox(height: 12),
          Text(
            context.l10n?.noSimilarProductsFound ??
                'No similar products found',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 14,
              color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5),
            ),
          ),
        ],
      ),
    );
  }
}

/// Grid card matching home screen _WideProductCard design.
/// Delegates to SharedSimilarGridCard from shared widgets.
class _SimilarGridCard extends StatelessWidget {
  final ProductEntity product;
  const _SimilarGridCard({required this.product});

  @override
  Widget build(BuildContext context) => SharedSimilarGridCard(product: product);
}

/// Quick compare ⚡ button that adds/removes a product from comparison.
// ignore: unused_element
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
      builder: (_, _) {
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
                separatorBuilder: (_, _) => const SizedBox(width: 12),
                itemBuilder: (_, _) => _shimmerBox(140, 200, base, highlight, radius: 16),
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

