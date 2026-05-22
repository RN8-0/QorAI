part of '../product_detail_screen.dart';

class _OverviewContent extends ConsumerWidget {
  final ProductEntity product;
  final String country;
  final bool isDark;
  const _OverviewContent({required this.product, required this.country, required this.isDark});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cardBg = context.surfaceVariantColor;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (product.description.isNotEmpty) ...[
            _DescCard(text: product.description, cardBg: cardBg, isDark: isDark),
            const SizedBox(height: 12),
          ],
          if (product.pros.isNotEmpty || product.cons.isNotEmpty) ...[
            _ProsConsCard(pros: product.pros, cons: product.cons, cardBg: cardBg),
            const SizedBox(height: 12),
          ],
          if (product.tags.isNotEmpty) ...[
            _TagsRow(tags: product.tags),
            const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }
}

// ignore: unused_element
class _OverviewTab extends ConsumerWidget {
  final ProductEntity product;
  final String country;
  final bool isDark;
  const _OverviewTab({required this.product, required this.country, required this.isDark});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cardBg = context.surfaceVariantColor;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
      children: [
        _KeySpecsHighlight(product: product),
        const SizedBox(height: 12),
        _DeferredVariantsSection(product: product),
        if (product.description.isNotEmpty) ...[
          _DescCard(text: product.description, cardBg: cardBg, isDark: isDark),
          const SizedBox(height: 12),
        ],
        if (product.pros.isNotEmpty || product.cons.isNotEmpty) ...[
          _ProsConsCard(pros: product.pros, cons: product.cons, cardBg: cardBg),
          const SizedBox(height: 12),
        ],
        if (product.tags.isNotEmpty) _TagsRow(tags: product.tags),
        const SizedBox(height: 16),
        _SimilarProductsSection(product: product, isDark: isDark),
      ],
    );
  }
}
