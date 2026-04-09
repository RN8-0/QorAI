part of '../product_detail_screen.dart';

class _AIAnalysisTab extends StatelessWidget {
  final ProductEntity product;
  final bool isDark;
  const _AIAnalysisTab({required this.product, required this.isDark});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: EdgeInsets.fromLTRB(16, 16, 16, MediaQuery.of(context).padding.bottom + 40),
      children: [
        _AIReviewAnalysisCard(product: product, isDark: isDark, cardBg: context.surfaceVariantColor),
        const SizedBox(height: 16),
        _PremiumFeaturesSection(product: product),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════
// PREMIUM FEATURES SECTION
// ═══════════════════════════════════════════════════════════

/// Delegates to SharedPremiumFeaturesSection + SharedBenchmarkCollapsibleCard.
class _PremiumFeaturesSection extends ConsumerWidget {
  final ProductEntity product;
  const _PremiumFeaturesSection({required this.product});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      children: [
        SharedPremiumFeaturesSection(
          product: product,
          onShowPriceHistory: () => _showPriceComparison(context, product),
        ),
        if (_hasBenchmarkSupport(product)) ...[
          const SizedBox(height: 10),
          _BenchmarkCollapsibleCard(product: product),
        ],
      ],
    );
  }

  bool _hasBenchmarkSupport(ProductEntity product) {
    final cat = product.categoryId.toLowerCase();
    return cat.contains('phone') || cat.contains('mobile') || cat.contains('smartphone') ||
        cat.contains('tablet') || cat.contains('laptop') || cat.contains('notebook') ||
        cat.contains('desktop') || cat.contains('cpu') || cat.contains('processor') ||
        cat.contains('gpu') || cat.contains('graphic') || cat.contains('camera') ||
        cat.contains('monitor') || cat.contains('display') || cat.contains('tv');
  }
}

class _BenchmarkCollapsibleCard extends StatelessWidget {
  final ProductEntity product;
  const _BenchmarkCollapsibleCard({required this.product});

  @override
  Widget build(BuildContext context) {
    return SharedBenchmarkCollapsibleCard(
      child: SharedBenchmarkScoresCard(product: product),
    );
  }
}

