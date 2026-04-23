import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';
import 'package:qor_ai/core/errors.dart';
import 'package:intl/intl.dart';

class RecentlyViewedScreen extends ConsumerWidget {
  const RecentlyViewedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final viewedAsync = ref.watch(viewedProductsProvider);
    final viewed = viewedAsync.valueOrNull ?? [];

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded,
              color: context.textPrimary, size: 20),
          onPressed: () => context.pop(),
        ),
        title: Text(
          'Recently Viewed',
          style: TextStyle(
            color: context.textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        centerTitle: true,
      ),
      body: viewed.isEmpty
          ? _EmptyState()
          : ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              itemCount: viewed.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, index) {
                return _ViewedProductCard(productId: viewed[index])
                    .animate()
                    .fadeIn(
                      duration: 300.ms,
                      delay: (index * 50).ms,
                    )
                    .slideY(begin: 0.05, end: 0);
              },
            ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.history_rounded,
              size: 64, color: context.textTertiaryColor),
          const SizedBox(height: 16),
          Text(
            'No recently viewed products',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: context.textSecondary,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Products you view will appear here',
            style: TextStyle(
              fontSize: 13,
              color: context.textTertiaryColor,
            ),
          ),
        ],
      ),
    );
  }
}

class _ViewedProductCard extends ConsumerWidget {
  final String productId;
  const _ViewedProductCard({required this.productId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final productAsync = ref.watch(productDetailProvider(productId));
    return productAsync.when(
      data: (result) {
        return switch (result) {
          Success(data: final product) => _buildCard(context, product),
          Failure() => const SizedBox.shrink(),
        };
      },
      loading: () => _buildShimmer(context),
      error: (_, __) => const SizedBox.shrink(),
    );
  }

  Widget _buildCard(BuildContext context, ProductEntity product) {
    final priceText = _formatPrice(product.prices);

    return Material(
      color: context.surfaceVariantColor,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: () => context.push('/product/${product.id}'),
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              // Product image
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: AppTheme.surfaceVariantLight,
                    width: 1,
                  ),
                ),
                clipBehavior: Clip.antiAlias,
                padding: const EdgeInsets.all(6),
                child: product.imageURL.isNotEmpty
                    ? CachedNetworkImage(
                        imageUrl: product.imageURL,
                        fit: BoxFit.contain,
                        memCacheWidth: 192,
                        maxWidthDiskCache: 192,
                        fadeInDuration: const Duration(milliseconds: 100),
                        placeholder: (_, __) => Icon(
                          Icons.devices_rounded,
                          color:
                              AppTheme.primaryBlue.withValues(alpha: 0.3),
                          size: 28,
                        ),
                        errorWidget: (_, __, ___) => Icon(
                          Icons.devices_rounded,
                          color:
                              AppTheme.primaryBlue.withValues(alpha: 0.3),
                          size: 28,
                        ),
                      )
                    : Icon(
                        Icons.devices_rounded,
                        color: AppTheme.primaryBlue.withValues(alpha: 0.3),
                        size: 28,
                      ),
              ),
              const SizedBox(width: 14),

              // Product info
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      product.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: context.textPrimary,
                        height: 1.3,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        if (product.brand != null &&
                            product.brand!.isNotEmpty) ...[
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppTheme.primaryBlue
                                  .withValues(alpha: 0.08),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              product.brand!,
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: AppTheme.primaryBlue,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                        ],
                        if (priceText.isNotEmpty)
                          Text(
                            priceText,
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: AppTheme.success,
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),

              // Chevron
              Icon(
                Icons.chevron_right_rounded,
                size: 22,
                color: context.textTertiaryColor,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildShimmer(BuildContext context) {
    return Container(
      height: 88,
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Center(
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: AppTheme.primaryBlue.withValues(alpha: 0.3),
          ),
        ),
      ),
    );
  }

  String _formatPrice(Map<String, double> prices) {
    if (prices.isEmpty) return '';
    if (prices.containsKey('TR')) {
      final f = NumberFormat('#,###', 'tr_TR');
      return '₺${f.format(prices['TR']!.round())}';
    }
    if (prices.containsKey('US')) {
      return '\$${prices['US']!.round()}';
    }
    final first = prices.entries.first;
    return '${first.value.round()} ${first.key}';
  }
}
