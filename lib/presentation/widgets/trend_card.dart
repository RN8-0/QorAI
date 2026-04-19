/// Compair - Trend Card Widget
/// Blueprint Section 6.2

import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/domain/entities/product_entity.dart';

class TrendCard extends StatelessWidget {
  final ProductEntity product;
  final VoidCallback? onTap;

  const TrendCard({
    super.key,
    required this.product,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 200,
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(AppTheme.borderRadiusMedium),
          border: Border.all(
            color: AppTheme.brandCyan.withValues(alpha: 0.12),
            width: 0.8,
          ),
          boxShadow: [
            ...AppTheme.cardShadow,
            BoxShadow(
              color: AppTheme.brandCyan.withValues(alpha: 0.06),
              blurRadius: 12,
              spreadRadius: -2,
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Product image
            Expanded(
              flex: 3,
              child: Stack(
                children: [
                  Container(
                    width: double.infinity,
                    decoration: BoxDecoration(
                      color: context.surfaceColor,
                      borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(AppTheme.borderRadiusMedium),
                      ),
                    ),
                    child: product.imageUrl != null
                        ? CachedNetworkImage(
                            imageUrl: product.imageUrl!,
                            fit: BoxFit.contain,
                            memCacheWidth: 600,
                            maxWidthDiskCache: 600,
                            fadeInDuration: const Duration(milliseconds: 100),
                            placeholder: (_, __) => Center(
                              child: Icon(
                                Icons.image_outlined,
                                size: 40,
                                color: context.textTertiaryColor,
                              ),
                            ),
                            errorWidget: (_, __, ___) => Icon(
                              Icons.broken_image_outlined,
                              size: 40,
                              color: context.textTertiaryColor,
                            ),
                          )
                        : Center(
                            child: Icon(
                              Icons.devices,
                              size: 40,
                              color: context.textTertiaryColor,
                            ),
                          ),
                  ),
                  // Trend badge
                  if (product.trendScore > 0)
                    Positioned(
                      top: 8,
                      right: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: AppTheme.neonPink,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.local_fire_department,
                              color: context.surfaceVariantColor,
                              size: 12,
                            ),
                            const SizedBox(width: 2),
                            Text(
                              '${product.trendScore.toStringAsFixed(0)}',
                              style: TextStyle(
                                color: context.surfaceVariantColor,
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
            // Product info
            Expanded(
              flex: 2,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      product.name,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    if (product.brand != null)
                      Text(
                        product.brand!,
                        style: TextStyle(
                          color: context.textTertiaryColor,
                          fontSize: 12,
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
}
