part of '../product_detail_screen.dart';

// ═══════════════════════════════════════════════════════════
// BENCHMARK SCORES CARD — delegates to shared widget
// ═══════════════════════════════════════════════════════════

class _BenchmarkScoresCard extends StatelessWidget {
  final ProductEntity product;
  const _BenchmarkScoresCard({required this.product});

  @override
  Widget build(BuildContext context) => SharedBenchmarkScoresCard(product: product);
}
