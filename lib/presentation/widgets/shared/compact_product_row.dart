import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/core/utils.dart';
import 'package:qor_ai/core/constants.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';
import 'package:qor_ai/presentation/widgets/product_image_box.dart';

/// Slim, consistent row used by all search / category / filter lists.
/// Layout: [image] [name + brand + match score] ......... [price (right)]
class CompactProductRow extends ConsumerWidget {
  final ProductEntity product;
  final String country;

  /// Optional override for the navigation target. Defaults to /product/:id.
  final VoidCallback? onTap;

  const CompactProductRow({
    super.key,
    required this.product,
    required this.country,
    this.onTap,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final price = product.getPriceForCountry(country);
    final localCurrency =
        SupportedCountries.countries[country]?.currency ?? 'USD';
    final priceStr = price != null
        ? AppUtils.formatCurrency(price, localCurrency)
        : null;
    final techScore = product.techScore.toInt();
    final locale = Localizations.localeOf(context).languageCode;
    final displayName = product.nameForLanguage(locale);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () {
          HapticFeedback.lightImpact();
          if (onTap != null) {
            onTap!();
          } else {
            context.push('/product/${product.id}');
          }
        },
        child: Container(
          margin: const EdgeInsets.only(bottom: 6),
          padding: const EdgeInsets.fromLTRB(8, 8, 10, 8),
          decoration: BoxDecoration(
            color: context.surfaceColor,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: context.dividerColor.withValues(alpha: 0.5),
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Image
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(10),
                ),
                clipBehavior: Clip.antiAlias,
                child: ProductImageBox(
                  imageUrl: product.imageURL,
                  fallbackUrls: product.images,
                  width: 52,
                  height: 52,
                  borderRadius: BorderRadius.zero,
                  padding: const EdgeInsets.all(4),
                ),
              ),
              const SizedBox(width: 12),
              // Middle column: name + meta
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      displayName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w700,
                        color: context.textPrimary,
                        height: 1.2,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        if ((product.brand ?? '').isNotEmpty) ...[
                          Text(
                            product.brand!.toUpperCase(),
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 9.5,
                              fontWeight: FontWeight.w700,
                              color: AppTheme.accentCyan,
                              letterSpacing: 0.5,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Container(
                            width: 3,
                            height: 3,
                            decoration: BoxDecoration(
                              color: context.textTertiaryColor.withValues(
                                alpha: 0.5,
                              ),
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 6),
                        ],
                        // Personal match score is no longer pre-computed in
                        // lists — it is calculated dynamically on the product
                        // detail page (specs + price + profile aware).
                        if (techScore > 0)
                          _MiniScoreChip(
                            label: '$techScore',
                            icon: Icons.memory_outlined,
                            color: AppTheme.primaryBlue,
                          ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              // Right: price
              if (priceStr != null)
                Text(
                  priceStr,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: AppTheme.scoreExcellent,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

}

class _MiniScoreChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  const _MiniScoreChip({
    required this.label,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 9, color: color),
          const SizedBox(width: 2),
          Text(
            label,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 10,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}
