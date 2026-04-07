import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/domain/entities/comparison_entity.dart';
import 'package:compair/domain/entities/product_entity.dart';
import 'package:compair/presentation/providers/providers.dart';
import 'package:compair/routing/router.dart';

const _accent = Color(0xFF6366F1);
const _accentLight = Color(0xFF8B5CF6);

class ComparisonsScreen extends ConsumerWidget {
  const ComparisonsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final comparisonsAsync = ref.watch(userComparisonsProvider);

    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.canPop() ? context.pop() : context.go(AppRoutes.home),
        ),
        title: ShaderMask(
          shaderCallback: (bounds) => const LinearGradient(
            colors: [_accent, _accentLight],
          ).createShader(bounds),
          child: Text(
            context.l10n?.myComparisons ?? 'My Comparisons',
            style: GoogleFonts.plusJakartaSans(
              color: Colors.white,
              fontWeight: FontWeight.w800,
              fontSize: 20,
            ),
          ),
        ),
        centerTitle: true,
      ),
      body: comparisonsAsync.when(
        loading: () => Center(child: CircularProgressIndicator(color: _accent)),
        error: (e, _) => Center(child: Text('Error: $e', style: TextStyle(color: context.textSecondary))),
        data: (result) => result.when(
          success: (comparisons) {
            if (comparisons.isEmpty) {
              return _EmptyState();
            }
            return ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
              itemCount: comparisons.length,
              itemBuilder: (ctx, i) => _ComparisonCard(comparison: comparisons[i]),
            );
          },
          failure: (err) => Center(child: Text('Failed: ${err.message}', style: TextStyle(color: context.textSecondary))),
        ),
      ),
      floatingActionButton: FloatingActionButton.small(
        onPressed: () => context.go(AppRoutes.compare),
        backgroundColor: _accent,
        child: const Icon(Icons.add_rounded, color: Colors.white, size: 20),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 80, height: 80,
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [_accent.withValues(alpha: 0.15), _accentLight.withValues(alpha: 0.1)]),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.compare_arrows_rounded, size: 40, color: _accent),
            ),
            const SizedBox(height: 24),
            Text(
              context.l10n?.noComparisonsYet ?? 'No comparisons yet',
              style: GoogleFonts.plusJakartaSans(fontSize: 20, fontWeight: FontWeight.w700, color: context.textPrimary),
            ),
            const SizedBox(height: 8),
            Text(
              context.l10n?.startComparingHistory ?? 'Start comparing products to see\nyour history here.',
              textAlign: TextAlign.center,
              style: GoogleFonts.plusJakartaSans(color: context.textTertiaryColor, fontSize: 14, height: 1.5),
            ),
          ],
        ),
      ),
    );
  }
}

class _ComparisonCard extends ConsumerWidget {
  final ComparisonEntity comparison;
  const _ComparisonCard({required this.comparison});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Fetch product details for images
    final productFutures = comparison.itemIds
        .map((id) => ref.watch(_getProductProvider(id)))
        .toList();

    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        // Load comparison into compare screen
        ref.read(compareSessionProvider.notifier).state = CompareSessionData(
          selectedProductIds: comparison.itemIds,
        );
        context.go(AppRoutes.compare);
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: _accent.withValues(alpha: 0.1)),
          boxShadow: [
            BoxShadow(color: _accent.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, 4)),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Title row
            Row(
              children: [
                Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [_accent, _accentLight]),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.compare_arrows_rounded, size: 18, color: Colors.white),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    comparison.title ?? 'Comparison',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 14, fontWeight: FontWeight.w700, color: context.textPrimary),
                    maxLines: 2, overflow: TextOverflow.ellipsis,
                  ),
                ),
                const Icon(Icons.chevron_right_rounded, size: 20, color: _accent),
              ],
            ),
            const SizedBox(height: 12),
            // Product images row
            SizedBox(
              height: 56,
              child: Row(
                children: [
                  ...productFutures.take(4).map((async) => Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: async.when(
                      data: (product) => _ProductThumb(product: product),
                      loading: () => _ProductThumbPlaceholder(),
                      error: (_, __) => _ProductThumbPlaceholder(),
                    ),
                  )),
                  const Spacer(),
                  // Date
                  Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        _formatDate(comparison.createdAt),
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11, color: context.textTertiaryColor, fontWeight: FontWeight.w500),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${comparison.itemIds.length} products',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11, color: _accent, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatDate(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date);
    if (diff.inDays == 0) return 'Today';
    if (diff.inDays == 1) return 'Yesterday';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return '${date.day}/${date.month}/${date.year}';
  }
}

class _ProductThumb extends StatelessWidget {
  final ProductEntity? product;
  const _ProductThumb({this.product});

  @override
  Widget build(BuildContext context) {
    if (product == null || product!.imageURL.isEmpty) return _ProductThumbPlaceholder();
    return Container(
      width: 56, height: 56,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _accent.withValues(alpha: 0.15)),
        color: context.surfaceColor,
      ),
      clipBehavior: Clip.antiAlias,
      child: CachedNetworkImage(
        imageUrl: product!.imageURL,
        fit: BoxFit.cover,
        errorWidget: (_, __, ___) => Icon(Icons.image_outlined, size: 20, color: context.textTertiaryColor),
      ),
    );
  }
}

class _ProductThumbPlaceholder extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 56, height: 56,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: _accent.withValues(alpha: 0.06),
        border: Border.all(color: _accent.withValues(alpha: 0.1)),
      ),
      child: Icon(Icons.image_outlined, size: 20, color: context.textTertiaryColor),
    );
  }
}

/// Provider to fetch single product
final _getProductProvider = FutureProvider.family<ProductEntity?, String>((ref, productId) async {
  if (productId.isEmpty) return null;
  final result = await ref.read(productRepositoryProvider).getProduct(productId);
  return result.when(
    success: (product) => product,
    failure: (_) => null,
  );
});
