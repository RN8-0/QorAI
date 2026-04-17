import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:go_router/go_router.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/domain/entities/product_entity.dart';
import 'package:compair/presentation/widgets/product_image_box.dart';

/// Shared product card used in similar product grids.
/// Used by both detail screen and compare screen.
class SharedSimilarGridCard extends StatelessWidget {
  final ProductEntity product;
  const SharedSimilarGridCard({super.key, required this.product});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final imageBg = isDark ? Colors.white : const Color(0xFFF1F5F9);

    return GestureDetector(
      onTap: () => context.push('/product/${product.id}'),
      child: Container(
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: AppTheme.brandCyan.withValues(alpha: 0.12),
            width: 0.8,
          ),
          boxShadow: [
            ...AppTheme.cardShadow,
            BoxShadow(
              color: AppTheme.brandCyan.withValues(alpha: 0.06),
              blurRadius: 10,
              spreadRadius: -2,
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image section
            Stack(children: [
              Container(
                height: 100, width: double.infinity,
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: imageBg,
                  borderRadius: const BorderRadius.vertical(
                      top: Radius.circular(16))),
                child: ProductImageBox(
                  imageUrl: product.imageUrl,
                  fallbackUrls: product.images,
                  height: 88,
                  borderRadius: BorderRadius.circular(10),
                  padding: EdgeInsets.zero,
                ),
              ),
              if (product.techScore > 0)
                Positioned(top: 7, right: 7, child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 6, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppTheme.accentCyan.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: AppTheme.accentCyan.withValues(alpha: 0.3),
                      width: 0.5)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.local_fire_department_rounded,
                        size: 10, color: AppTheme.accentCyan),
                    const SizedBox(width: 2),
                    Text('${product.techScore.toInt()}',
                        style: GoogleFonts.plusJakartaSans(
                            fontSize: 10, fontWeight: FontWeight.w700,
                            color: AppTheme.accentCyan)),
                  ]),
                )),
            ]),
            // Details section
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 4, 10, 8),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (product.brand != null && product.brand!.isNotEmpty)
                          Text(product.brand!.toUpperCase(),
                              style: GoogleFonts.plusJakartaSans(
                                  fontSize: 9, fontWeight: FontWeight.w600,
                                  color: AppTheme.accentCyan,
                                  letterSpacing: 0.6),
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                        const SizedBox(height: 2),
                        Text(product.name,
                            maxLines: 2, overflow: TextOverflow.ellipsis,
                            softWrap: true,
                            style: GoogleFonts.plusJakartaSans(
                                fontSize: 12, fontWeight: FontWeight.w700,
                                color: context.textPrimary,
                                height: 1.15)),
                      ],
                    ),
                    SizedBox(
                      width: double.infinity,
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 5),
                        decoration: BoxDecoration(
                          gradient: AppTheme.primaryGradient,
                          borderRadius: BorderRadius.circular(12)),
                        child: Text(
                            context.l10n?.viewDetails ?? 'View Details',
                            textAlign: TextAlign.center,
                            style: GoogleFonts.plusJakartaSans(
                                fontSize: 10, fontWeight: FontWeight.w600,
                                color: Colors.white)),
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
