part of '../product_detail_screen.dart';

class _AIAnalysisTab extends StatelessWidget {
  final ProductEntity product;
  final bool isDark;
  // ignore: unused_element_parameter
  const _AIAnalysisTab({required this.product, required this.isDark});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: EdgeInsets.fromLTRB(
        16,
        16,
        16,
        MediaQuery.of(context).padding.bottom + 40,
      ),
      children: [
        // AI review summary removed — algorithm-only scoring; no token cost.
        _PremiumFeaturesSection(product: product),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════
// PREMIUM FEATURES SECTION
// ═══════════════════════════════════════════════════════════

/// Delegates to SharedPremiumFeaturesSection.
class _PremiumFeaturesSection extends ConsumerWidget {
  final ProductEntity product;
  const _PremiumFeaturesSection({required this.product});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isPremium = ref.watch(premiumProvider);
    return SharedPremiumFeaturesSection(
      product: product,
      onShowPriceHistory: () {
        ref.read(behaviorTrackingProvider).trackPriceTap(product.id);
        _showPriceComparison(context, product, isPremium: isPremium);
      },
    );
  }
}

