import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/core/errors.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/domain/entities/comparison_entity.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/routing/router.dart';

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
    final isDark = Theme.of(context).brightness == Brightness.dark;

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
          gradient: isDark
              ? AppTheme.meshBackgroundGradient
              : LinearGradient(
                  colors: [
                    context.backgroundColor,
                    const Color(0xFFEAF6FF),
                    const Color(0xFFF5FBFF),
                    AppTheme.brandCyan.withValues(alpha: 0.06),
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
                return ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 100, 16, 100),
                  children: [
                    _ComparisonHero(
                      count: comparisons.length,
                      latest: comparisons.first,
                    ),
                    const SizedBox(height: 18),
                    ...comparisons.map(
                      (comparison) => _ComparisonCard(comparison: comparison),
                    ),
                  ],
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
    );
  }
}

class _ComparisonHero extends StatelessWidget {
  final int count;
  final ComparisonEntity latest;

  const _ComparisonHero({required this.count, required this.latest});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: isDark
            ? LinearGradient(
                colors: [
                  AppTheme.brandDeepBlue.withValues(alpha: 0.26),
                  AppTheme.brandBlue.withValues(alpha: 0.20),
                  AppTheme.brandCyan.withValues(alpha: 0.16),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              )
            : const LinearGradient(
                colors: [
                  Color(0xFFD9F0FF),
                  Color(0xFFF6FBFF),
                  Color(0xFFE8F8FF),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(
          color: isDark
              ? AppTheme.brandBlue.withValues(alpha: 0.24)
              : AppTheme.brandBlue.withValues(alpha: 0.14),
        ),
        boxShadow: isDark
            ? AppTheme.cardShadow
            : [
                BoxShadow(
                  color: AppTheme.brandBlue.withValues(alpha: 0.12),
                  blurRadius: 30,
                  offset: const Offset(0, 16),
                ),
              ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 46,
                height: 46,
                decoration: BoxDecoration(
                  gradient: AppTheme.primaryGradient,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(
                  Icons.auto_graph_rounded,
                  color: Colors.white,
                  size: 22,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.l10n?.comparisonHistory ?? 'Comparison History',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: context.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Son karsilastirmalariniz burada akilli bir ozetle listelenir.',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        height: 1.45,
                        color: context.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _HeroMetric(label: 'Toplam', value: '$count'),
              _HeroMetric(
                label: 'Son urun sayisi',
                value: '${latest.itemIds.length}',
              ),
              _HeroMetric(
                label: 'Tekrar',
                value: '${latest.occurrenceCount}x',
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _HeroMetric extends StatelessWidget {
  final String label;
  final String value;

  const _HeroMetric({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: 108,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: isDark
            ? Colors.white.withValues(alpha: 0.05)
            : Colors.white.withValues(alpha: 0.82),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.08)
              : AppTheme.brandBlue.withValues(alpha: 0.10),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: _accent,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: context.textSecondary,
            ),
          ),
        ],
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
                GestureDetector(
                  onTap: () => context.go(AppRoutes.compare),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 18,
                      vertical: 14,
                    ),
                    decoration: BoxDecoration(
                      gradient: AppTheme.primaryGradient,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: AppTheme.cardShadow,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.add_rounded, color: Colors.white, size: 18),
                        const SizedBox(width: 8),
                        Text(
                          'Yeni karsilastirma baslat',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
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
        context.push(AppRoutes.comparisonResult, extra: comparison);
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 14),
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          gradient: Theme.of(context).brightness == Brightness.dark
              ? LinearGradient(
                  colors: [
                    context.surfaceVariantColor,
                    AppTheme.brandBlue.withValues(alpha: 0.10),
                    AppTheme.brandCyan.withValues(alpha: 0.08),
                  ],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                )
              : const LinearGradient(
                  colors: [
                    Color(0xFFF7FCFF),
                    Color(0xFFDFF3FF),
                    Color(0xFFF1FAFF),
                  ],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
            color: Theme.of(context).brightness == Brightness.dark
                ? AppTheme.brandCyan.withValues(alpha: 0.16)
                : AppTheme.brandBlue.withValues(alpha: 0.12),
          ),
          boxShadow: Theme.of(context).brightness == Brightness.dark
              ? AppTheme.cardShadow
              : [
                  BoxShadow(
                    color: AppTheme.brandBlue.withValues(alpha: 0.16),
                    blurRadius: 28,
                    offset: const Offset(0, 16),
                  ),
                ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    gradient: AppTheme.primaryGradient,
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: const Icon(
                    Icons.compare_arrows_rounded,
                    size: 20,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        comparison.title ?? 'Comparison',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: context.textPrimary,
                          letterSpacing: -0.3,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        '${comparison.occurrenceCount} kez karsilastirildi',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: _accent,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(
                      alpha: Theme.of(context).brightness == Brightness.dark
                          ? 0.06
                          : 0.8,
                    ),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(
                    Icons.chevron_right_rounded,
                    size: 20,
                    color: _accent,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white.withValues(
                  alpha: Theme.of(context).brightness == Brightness.dark
                      ? 0.04
                      : 0.78,
                ),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(
                  color: Theme.of(context).brightness == Brightness.dark
                      ? Colors.white.withValues(alpha: 0.06)
                      : AppTheme.brandBlue.withValues(alpha: 0.08),
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: productFutures
                          .take(4)
                          .map(
                            (async) => async.when(
                              data: (product) => _ProductThumb(product: product),
                              loading: () => _ProductThumbPlaceholder(),
                              error: (error, stackTrace) =>
                                  _ProductThumbPlaceholder(),
                            ),
                          )
                          .toList(),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      _MetaPill(
                        icon: Icons.calendar_today_rounded,
                        text: _formatDateLabel(comparison.createdAt),
                      ),
                      const SizedBox(height: 6),
                      _MetaPill(
                        icon: Icons.schedule_rounded,
                        text: _formatTime(comparison.createdAt),
                      ),
                      const SizedBox(height: 6),
                      _MetaPill(
                        icon: Icons.layers_rounded,
                        text: '${comparison.itemIds.length} urun',
                        accent: true,
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

  String _formatDateLabel(DateTime date) {
    final local = date.toLocal();
    return '${local.day.toString().padLeft(2, '0')}.${local.month.toString().padLeft(2, '0')}.${local.year}';
  }

  String _formatTime(DateTime date) {
    final local = date.toLocal();
    final hour = local.hour.toString().padLeft(2, '0');
    final minute = local.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }
}

class _ProductThumb extends StatelessWidget {
  final ProductEntity? product;
  const _ProductThumb({this.product});

  @override
  Widget build(BuildContext context) {
    if (product == null || product!.imageURL.isEmpty) {
      return _ProductThumbPlaceholder();
    }
    return Container(
      width: 56,
      height: 56,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _accent.withValues(alpha: 0.15)),
        color: Colors.white,
      ),
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: CachedNetworkImage(
          imageUrl: product!.imageURL,
          fit: BoxFit.contain,
          memCacheWidth: 168,
          maxWidthDiskCache: 168,
          fadeInDuration: const Duration(milliseconds: 100),
          placeholder: (_, __) => const ColoredBox(color: Colors.white),
          errorWidget: (context, url, error) => Icon(
            Icons.image_outlined,
            size: 20,
            color: context.textTertiaryColor,
          ),
        ),
      ),
    );
  }
}

class _MetaPill extends StatelessWidget {
  final IconData icon;
  final String text;
  final bool accent;

  const _MetaPill({
    required this.icon,
    required this.text,
    this.accent = false,
  });

  @override
  Widget build(BuildContext context) {
    final bgColor = accent
        ? _accent.withValues(alpha: 0.12)
        : context.surfaceVariantColor.withValues(alpha: 0.8);
    final textColor = accent ? _accent : context.textSecondary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: textColor),
          const SizedBox(width: 6),
          Text(
            text,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: textColor,
            ),
          ),
        ],
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
        color: Colors.white,
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
