import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:go_router/go_router.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';
import 'package:qor_ai/presentation/widgets/product_image_box.dart';

/// Shared product card used in similar product grids.
/// Used by both detail screen and compare screen.
class SharedSimilarGridCard extends StatelessWidget {
  final ProductEntity product;
  const SharedSimilarGridCard({super.key, required this.product});

  @override
  Widget build(BuildContext context) {
    // Product photos are shot on white. Always render the image cell on pure
    // white in both themes so the product "floats" cleanly without a tinted
    // halo (was Color(0xFFF1F5F9) slate in light mode → mismatched look).
    const imageBg = Colors.white;

    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          ...AppTheme.cardShadow,
          BoxShadow(
            color: AppTheme.brandCyan.withValues(alpha: 0.06),
            blurRadius: 10,
            spreadRadius: -2,
          ),
        ],
      ),
      child: Material(
        color: context.surfaceVariantColor,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(
            color: AppTheme.brandCyan.withValues(alpha: 0.12),
            width: 0.8,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () {
            HapticFeedback.lightImpact();
            context.push('/product/${product.id}');
          },
          borderRadius: BorderRadius.circular(16),
          child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image section — fills remaining vertical space so button
            // always sits at the bottom regardless of name length.
            Expanded(
              child: ClipRRect(
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(16),
                ),
                // StackFit.expand forces the white backdrop to cover the
                // entire image slot. Without it, a non-positioned Container
                // only grew to its child's intrinsic height and the leftover
                // area exposed Material's dark surfaceVariantColor — that
                // was the "transparent/dark image" bug in compare/similar.
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    const ColoredBox(color: imageBg),
                    Padding(
                      padding: const EdgeInsets.all(6),
                      child: ProductImageBox(
                        imageUrl: product.imageUrl,
                        fallbackUrls: product.images,
                        borderRadius: BorderRadius.circular(10),
                        padding: EdgeInsets.zero,
                      ),
                    ),
                    if (product.techScore > 0)
                      Positioned(
                        top: 7,
                        right: 7,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: AppTheme.accentCyan.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: AppTheme.accentCyan.withValues(alpha: 0.3),
                              width: 0.5,
                            ),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(
                                Icons.local_fire_department_rounded,
                                size: 10,
                                color: AppTheme.accentCyan,
                              ),
                              const SizedBox(width: 2),
                              Text(
                                '${product.techScore.toInt()}',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                  color: AppTheme.accentCyan,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            // Details section — tight layout, button directly under name
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 6, 10, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (product.brand != null && product.brand!.isNotEmpty)
                    Text(product.brand!.toUpperCase(),
                        style: GoogleFonts.plusJakartaSans(
                            fontSize: 9, fontWeight: FontWeight.w600,
                            color: AppTheme.accentCyan,
                            letterSpacing: 0.6),
                        maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 2),
                  Text(product.nameForLanguage(
                        Localizations.localeOf(context).languageCode,
                      ),
                      maxLines: 2, overflow: TextOverflow.ellipsis,
                      softWrap: true,
                      style: GoogleFonts.plusJakartaSans(
                          fontSize: 12, fontWeight: FontWeight.w700,
                          color: context.textPrimary,
                          height: 1.15)),
                  const SizedBox(height: 6),
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
          ],
        ),
        ),
      ),
    );
  }
}
