import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/core/utils.dart';
import 'package:compair/core/constants.dart';
import 'package:compair/domain/entities/product_entity.dart';
import 'package:compair/presentation/providers/providers.dart';
import 'package:compair/presentation/widgets/glass_container.dart';

class CollectionScreen extends ConsumerWidget {
  const CollectionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userAsync = ref.watch(userProfileProvider);

    return Scaffold(
      backgroundColor: context.backgroundColor,
      body: userAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (user) {
          final favoriteIds = user?.favorites ?? [];
          if (favoriteIds.isEmpty) {
            return const _EmptyState();
          }
          return _CollectionContent(productIds: favoriteIds);
        },
      ),
    );
  }
}

class _CollectionContent extends StatelessWidget {
  final List<String> productIds;
  const _CollectionContent({required this.productIds});

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      physics: const BouncingScrollPhysics(),
      slivers: [
        // App bar
        SliverToBoxAdapter(
          child: SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Title row
                  Row(
                    children: [
                      ShaderMask(
                        shaderCallback: (bounds) => const LinearGradient(
                          colors: [
                            AppTheme.neonCyan,
                            AppTheme.neonPurple,
                            AppTheme.neonPink,
                          ],
                        ).createShader(bounds),
                        child: Text(
                          context.l10n?.myFavorites ?? 'My Favorites',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 28,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                            letterSpacing: -0.5,
                          ),
                        ),
                      ),
                      const Spacer(),
                      // Item count badge
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [
                              AppTheme.primaryBlue.withValues(alpha: 0.15),
                              AppTheme.brandCyan.withValues(alpha: 0.10),
                            ],
                          ),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: AppTheme.primaryBlue.withValues(alpha: 0.3),
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.favorite_rounded,
                              size: 14,
                              color: AppTheme.primaryBlue,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              '${productIds.length}',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: AppTheme.primaryBlue,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    context.l10n?.favoritesSubtitle ??
                        'Products you\'ve saved appear here',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: context.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 20),
                ],
              ),
            ),
          ),
        ),
        // Grid
        SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          sliver: SliverGrid(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 14,
              crossAxisSpacing: 14,
              childAspectRatio: 0.68,
            ),
            delegate: SliverChildBuilderDelegate(
              (ctx, i) => _CollectionProductCard(productId: productIds[i]),
              childCount: productIds.length,
            ),
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: 100)),
      ],
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 120,
                height: 120,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      AppTheme.primaryBlue.withValues(alpha: 0.15),
                      AppTheme.brandCyan.withValues(alpha: 0.08),
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(36),
                  border: Border.all(
                    color: AppTheme.primaryBlue.withValues(alpha: 0.22),
                  ),
                ),
                child: const Icon(
                  Icons.favorite_rounded,
                  size: 56,
                  color: AppTheme.brandCyan,
                ),
              )
                  .animate(onPlay: (c) => c.repeat(reverse: true))
                  .scaleXY(begin: 1, end: 1.08, duration: 1400.ms, curve: Curves.easeInOut),
              const SizedBox(height: 28),
              Text(
                context.l10n?.noFavorites ?? 'No favorites yet',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: context.textPrimary,
                ),
                textAlign: TextAlign.center,
              ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.2),
              const SizedBox(height: 10),
              Text(
                context.l10n?.favoritesEmptySubtitle ??
                    'Tap the heart icon on any product to save it here.',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  color: context.textSecondary,
                  height: 1.5,
                ),
                textAlign: TextAlign.center,
              ).animate(delay: 120.ms).fadeIn(duration: 400.ms),
            ],
          ),
        ),
      ),
    );
  }
}

class _CollectionProductCard extends ConsumerWidget {
  final String productId;
  const _CollectionProductCard({required this.productId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final productAsync = ref.watch(productDetailProvider(productId));

    return productAsync.when(
      loading: () => _ShimmerCard(),
      error: (_, __) => _ErrorCard(),
      data: (result) {
        final product = result.when(success: (p) => p, failure: (_) => null);
        if (product == null) return _ErrorCard();
        return _ProductCard(product: product);
      },
    );
  }
}

class _ShimmerCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(18),
        boxShadow: AppTheme.subtleShadow,
      ),
      child: Center(
        child: SizedBox(
          width: 24,
          height: 24,
          child: CircularProgressIndicator(
            strokeWidth: 2.5,
            color: AppTheme.primaryBlue.withValues(alpha: 0.5),
          ),
        ),
      ),
    );
  }
}

class _ErrorCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(18),
        boxShadow: AppTheme.subtleShadow,
      ),
      child: Center(
        child: Icon(
          Icons.error_outline_rounded,
          color: context.textTertiaryColor,
          size: 32,
        ),
      ),
    );
  }
}

class _ProductCard extends ConsumerWidget {
  final ProductEntity product;
  const _ProductCard({required this.product});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final techScore = product.techScore;
    final scoreColor = techScore >= 80
        ? const Color(0xFF10B981)
        : techScore >= 60
        ? const Color(0xFFF59E0B)
        : const Color(0xFFEF4444);

    return GestureDetector(
      onTap: () => context.push('/product/${product.id}'),
      child: Container(
        decoration: BoxDecoration(
          color: isDark ? Colors.white.withValues(alpha: 0.06) : Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: isDark
                ? AppTheme.brandCyan.withValues(alpha: 0.15)
                : AppTheme.brandCyan.withValues(alpha: 0.10),
          ),
          boxShadow: AppTheme.cardShadow,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Image
            Expanded(
              flex: 5,
              child: Stack(
                children: [
                  ClipRRect(
                    borderRadius: const BorderRadius.vertical(
                      top: Radius.circular(18),
                    ),
                    child: Container(
                      width: double.infinity,
                      color: isDark
                          ? Colors.white.withValues(alpha: 0.03)
                          : const Color(0xFFF8FAFC),
                      child: product.imageURL.isNotEmpty
                          ? CachedNetworkImage(
                              imageUrl: product.imageURL,
                              fit: BoxFit.contain,
                              placeholder: (_, __) => Center(
                                child: Icon(
                                  Icons.image_outlined,
                                  size: 32,
                                  color: context.textTertiaryColor,
                                ),
                              ),
                              errorWidget: (_, __, ___) => Center(
                                child: Icon(
                                  Icons.broken_image_outlined,
                                  size: 32,
                                  color: context.textTertiaryColor,
                                ),
                              ),
                            )
                          : Center(
                              child: Icon(
                                Icons.image_outlined,
                                size: 32,
                                color: context.textTertiaryColor,
                              ),
                            ),
                    ),
                  ),
                  // Tech score badge
                  if (techScore > 0)
                    Positioned(
                      top: 8,
                      right: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: scoreColor.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: scoreColor.withValues(alpha: 0.4),
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.bolt_rounded,
                              size: 12,
                              color: scoreColor,
                            ),
                            const SizedBox(width: 2),
                            Text(
                              '${techScore.round()}',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                                color: scoreColor,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  // Category chip
                  Positioned(
                    top: 8,
                    left: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 6,
                        vertical: 3,
                      ),
                      decoration: BoxDecoration(
                        color: isDark
                            ? Colors.black.withValues(alpha: 0.5)
                            : Colors.white.withValues(alpha: 0.85),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        product.category.replaceAll('-', ' ').toUpperCase(),
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 8,
                          fontWeight: FontWeight.w700,
                          color: context.textSecondary,
                          letterSpacing: 0.5,
                        ),
                        maxLines: 1,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            // Info
            Expanded(
              flex: 3,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Brand
                    if (product.brand != null && product.brand!.isNotEmpty)
                      Text(
                        product.brand!.toUpperCase(),
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.primaryBlue,
                          letterSpacing: 0.8,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    const SizedBox(height: 3),
                    // Name
                    Expanded(
                      child: Text(
                        product.name,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary,
                          height: 1.25,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    // Price row
                    if (product.prices.isNotEmpty)
                      Container(
                        margin: const EdgeInsets.only(top: 4),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          gradient: AppTheme.primaryGradient,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          _formatPrice(product, ref),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 11,
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                          ),
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

  String _formatPrice(ProductEntity p, WidgetRef ref) {
    final country = ref.read(selectedCountryProvider);
    final currency = ref.read(currencyProvider);
    final price = p.getPriceForCountry(country);
    if (price != null) return AppUtils.formatCurrency(price, currency);
    final us = p.prices['US'];
    if (us != null) return AppUtils.formatCurrency(us, 'USD');
    if (p.prices.isNotEmpty) {
      final entry = p.prices.entries.first;
      final cc = SupportedCountries.countries[entry.key]?.currency ?? 'USD';
      return AppUtils.formatCurrency(entry.value, cc);
    }
    return '';
  }
}
