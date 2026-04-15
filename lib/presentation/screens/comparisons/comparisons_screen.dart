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

const _accent = AppTheme.brandBlue;
const _accentLight = AppTheme.brandSkyBlue;

class ComparisonsScreen extends ConsumerStatefulWidget {
  const ComparisonsScreen({super.key});

  @override
  ConsumerState<ComparisonsScreen> createState() => _ComparisonsScreenState();
}

class _ComparisonsScreenState extends ConsumerState<ComparisonsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.invalidate(userComparisonsProvider);
    });
  }

  Future<void> _refresh() async {
    ref.invalidate(userComparisonsProvider);
    await ref.read(userComparisonsProvider.future);
  }

  @override
  Widget build(BuildContext context) {
    final comparisonsAsync = ref.watch(userComparisonsProvider);

    return Scaffold(
      backgroundColor: context.backgroundColor,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () =>
              context.canPop() ? context.pop() : context.go(AppRoutes.home),
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
      body: Container(
        decoration: BoxDecoration(
          gradient: Theme.of(context).brightness == Brightness.dark
              ? AppTheme.meshBackgroundGradient
              : LinearGradient(
                  colors: [
                    context.backgroundColor,
                    AppTheme.brandBlue.withValues(alpha: 0.05),
                    AppTheme.brandCyan.withValues(alpha: 0.04),
                  ],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
        ),
        child: RefreshIndicator(
          color: _accent,
          onRefresh: _refresh,
          child: comparisonsAsync.when(
            loading: () => ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.only(top: 220),
              children: [
                Center(child: CircularProgressIndicator(color: _accent)),
              ],
            ),
            error: (e, _) => ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.only(top: 220),
              children: [
                Center(
                  child: Text(
                    'Error: $e',
                    style: TextStyle(color: context.textSecondary),
                  ),
                ),
              ],
            ),
            data: (result) => result.when(
              success: (comparisons) {
                if (comparisons.isEmpty) {
                  return _EmptyState(onRetry: _refresh);
                }
                return ListView.builder(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 108, 16, 100),
                  itemCount: comparisons.length,
                  itemBuilder: (ctx, i) =>
                      _ComparisonCard(comparison: comparisons[i], index: i),
                );
              },
              failure: (err) => ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.only(top: 220),
                children: [
                  Center(
                    child: Text(
                      'Failed: ${err.message}',
                      style: TextStyle(color: context.textSecondary),
                    ),
                  ),
                ],
              ),
            ),
          ),
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
  final Future<void> Function()? onRetry;

  const _EmptyState({this.onRetry});

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        Center(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(28, 120, 28, 32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 108,
                  height: 108,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        _accent.withValues(alpha: 0.18),
                        _accentLight.withValues(alpha: 0.08),
                      ],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(32),
                    border: Border.all(color: _accent.withValues(alpha: 0.16)),
                  ),
                  child: const Icon(
                    Icons.compare_arrows_rounded,
                    size: 48,
                    color: _accent,
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  context.l10n?.noComparisonsYet ?? 'No comparisons yet',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    color: context.textPrimary,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  context.l10n?.startComparingHistory ??
                      'Start comparing products to see\nyour history here.',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(
                    color: context.textTertiaryColor,
                    fontSize: 14,
                    height: 1.5,
                  ),
                ),
                const SizedBox(height: 22),
                FilledButton.icon(
                  onPressed: () => context.go(AppRoutes.compare),
                  style: FilledButton.styleFrom(
                    backgroundColor: _accent,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 18,
                      vertical: 14,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('Yeni karsilastirma baslat'),
                ),
                if (onRetry != null) ...[
                  const SizedBox(height: 12),
                  TextButton.icon(
                    onPressed: onRetry,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Gecmisi yenile'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ComparisonCard extends ConsumerWidget {
  final ComparisonEntity comparison;
  final int index;
  const _ComparisonCard({required this.comparison, required this.index});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Fetch product details for images
    final productFutures = comparison.itemIds
        .map((id) => ref.watch(_getProductProvider(id)))
        .toList();

    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        context.push(AppRoutes.comparisonResult, extra: comparison);
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              context.surfaceVariantColor,
              _accentLight.withValues(alpha: 0.05),
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: _accent.withValues(alpha: 0.1)),
          boxShadow: [
            BoxShadow(
              color: _accent.withValues(alpha: 0.08),
              blurRadius: 18,
              offset: const Offset(0, 8),
              spreadRadius: -10,
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Title row
            Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [_accent, _accentLight],
                    ),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(
                    Icons.compare_arrows_rounded,
                    size: 18,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    comparison.title ?? 'Comparison',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: context.textPrimary,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: _accent.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        '#${index + 1}',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: _accent,
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Icon(
                      Icons.chevron_right_rounded,
                      size: 20,
                      color: _accent,
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 12),
            // Product images row
            SizedBox(
              height: 56,
              child: Row(
                children: [
                  ...productFutures
                      .take(4)
                      .map(
                        (async) => Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: async.when(
                            data: (product) => _ProductThumb(product: product),
                            loading: () => _ProductThumbPlaceholder(),
                            error: (_, __) => _ProductThumbPlaceholder(),
                          ),
                        ),
                      ),
                  const Spacer(),
                  // Date
                  Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        _formatDate(comparison.createdAt),
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11,
                          color: context.textTertiaryColor,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${comparison.itemIds.length} urun',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11,
                          color: _accent,
                          fontWeight: FontWeight.w600,
                        ),
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
    if (diff.inDays == 0) return 'Bugun';
    if (diff.inDays == 1) return 'Dun';
    if (diff.inDays < 7) return '${diff.inDays} gun once';
    return '${date.day}/${date.month}/${date.year}';
  }
}

class _ProductThumb extends StatelessWidget {
  final ProductEntity? product;
  const _ProductThumb({this.product});

  @override
  Widget build(BuildContext context) {
    if (product == null || product!.imageURL.isEmpty)
      return _ProductThumbPlaceholder();
    return Container(
      width: 56,
      height: 56,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _accent.withValues(alpha: 0.15)),
        color: context.surfaceColor,
      ),
      clipBehavior: Clip.antiAlias,
      child: CachedNetworkImage(
        imageUrl: product!.imageURL,
        fit: BoxFit.cover,
        errorWidget: (_, __, ___) => Icon(
          Icons.image_outlined,
          size: 20,
          color: context.textTertiaryColor,
        ),
      ),
    );
  }
}

class _ProductThumbPlaceholder extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 56,
      height: 56,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: _accent.withValues(alpha: 0.06),
        border: Border.all(color: _accent.withValues(alpha: 0.1)),
      ),
      child: Icon(
        Icons.image_outlined,
        size: 20,
        color: context.textTertiaryColor,
      ),
    );
  }
}

/// Provider to fetch single product
final _getProductProvider = FutureProvider.family<ProductEntity?, String>((
  ref,
  productId,
) async {
  if (productId.isEmpty) return null;
  final result = await ref
      .read(productRepositoryProvider)
      .getProduct(productId);
  return result.when(success: (product) => product, failure: (_) => null);
});
