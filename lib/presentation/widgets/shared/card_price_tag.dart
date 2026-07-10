import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/core/utils.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';
import 'package:qor_ai/presentation/providers/providers.dart';

/// Ürün kartlarının alt slotu.
///
/// Seçili teslimat ülkesinde fiyat VARSA fiyatı DÜZ YAZI olarak gösterir
/// (arka planda buton/pill YOK — kartın kendisi zaten tıklanabilir). Fiyat
/// yoksa BOŞ döner (buton/"Detayları Gör" gösterilmez). Sıkı ülke kuralı:
/// fiyat yalnız `product.prices[seçiliÜlke]` değerinden gelir.
class CardPriceOrCta extends ConsumerWidget {
  final ProductEntity product;

  /// Önceden hesaplanmış fiyat (opsiyonel). `null`/`0` ise üründen çözülür.
  final double? price;
  final double fontSize;

  const CardPriceOrCta({
    super.key,
    required this.product,
    this.price,
    this.fontSize = 14,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final country = ref.watch(selectedCountryProvider);
    final resolved = (price != null && price! > 0)
        ? price!
        : (product.getPriceForCountry(country) ?? 0);
    // Fiyat yoksa BOŞ — buton/CTA gösterme.
    if (resolved <= 0) return const SizedBox.shrink();

    return Text(
      AppUtils.formatCurrency(resolved, ref.watch(currencyProvider)),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: GoogleFonts.plusJakartaSans(
        fontSize: fontSize,
        fontWeight: FontWeight.w800,
        color: AppTheme.scoreExcellent,
      ),
    );
  }
}
