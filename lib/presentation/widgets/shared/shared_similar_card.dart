import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:go_router/go_router.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';
import 'package:qor_ai/presentation/widgets/product_image_box.dart';
import 'package:qor_ai/presentation/widgets/shared/card_price_tag.dart';

/// Shared product card used in similar product grids.
/// Used by both detail screen and compare screen.
class SharedSimilarGridCard extends StatelessWidget {
  final ProductEntity product;
  const SharedSimilarGridCard({super.key, required this.product});

  @override
  Widget build(BuildContext context) {
    // Ana sayfadaki [_WideProductCard] ile BİREBİR aynı düzen/boyut (kullanıcı
    // isteği: "standart olmalı"). Görsel SABİT yükseklikte (132) → fiyat olsun
    // olmasın kart boyu DEĞİŞMEZ; fiyat/CTA Spacer ile en alta sabitlenir.
    final isDark = Theme.of(context).brightness == Brightness.dark;
    const imageBg = Colors.white;

    return Container(
      decoration: BoxDecoration(
        color: isDark ? context.surfaceVariantColor : Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: AppTheme.brandCyan.withValues(alpha: 0.15),
          width: 0.8,
        ),
        boxShadow: AppTheme.cardShadow,
      ),
      clipBehavior: Clip.antiAlias,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () {
            HapticFeedback.lightImpact();
            context.push('/product/${product.id}');
          },
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.max,
            children: [
              // ── Görsel: SABİT 132px (ana sayfa standardı) ──
              Stack(
                children: [
                  Container(
                    height: 132,
                    width: double.infinity,
                    color: imageBg,
                    padding: const EdgeInsets.all(6),
                    child: AspectRatio(
                      aspectRatio: 1.0,
                      child: ProductImageBox(
                        imageUrl: product.imageUrl,
                        fallbackUrls: product.allImages,
                        borderRadius: BorderRadius.circular(10),
                        padding: const EdgeInsets.all(12),
                        imageScale: 0.76,
                      ),
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
                          gradient: AppTheme.primaryGradient,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(
                              Icons.memory_rounded,
                              size: 10,
                              color: Colors.white,
                            ),
                            const SizedBox(width: 2),
                            Text(
                              '${product.techScore.toInt()}',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
              // ── Detay: kalan alanı doldurur; fiyat/CTA Spacer ile en altta ──
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(10, 6, 10, 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.max,
                    children: [
                      if (product.brand != null && product.brand!.isNotEmpty)
                        Text(
                          product.brand!.toUpperCase(),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 9,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.accentCyan,
                            letterSpacing: 0.6,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      const SizedBox(height: 3),
                      Text(
                        product.nameForLanguage(
                          Localizations.localeOf(context).languageCode,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        softWrap: true,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary,
                          height: 1.15,
                        ),
                      ),
                      const Spacer(),
                      CardPriceOrCta(product: product),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
