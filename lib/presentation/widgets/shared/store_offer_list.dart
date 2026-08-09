/// Mağaza fiyat listesi — TEK KAYNAK (uygulama tarafı).
///
/// NEDEN: aynı liste hem ürün detayının Fiyatlar sekmesinde hem karşılaştırma
/// ekranında gerekiyor ve iki yerde AYRI AYRI yazılmıştı. Karşılaştırma tarafı
/// tek kutuya sıkıştırılmış "en iyi teklif" gösteriyordu; ürün sayfasındaki
/// alt alta, ucuzdan pahalıya liste yoktu. Artık iki ekran da BU widget'ı
/// çağırıyor: yeni bir mağaza fiyatı eklendiğinde ikisinde de kendi sırasına
/// girer, davranış tek yerde değişir.
///
/// Web karşılığı: `web/src/components/OfferList.jsx` (aynı sıralama kuralı).
library;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:qor_ai/core/amazon_link.dart' show amazonTagUrlForVisitor;
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/core/utils.dart';
import 'package:qor_ai/data/models/other_models.dart';
import 'package:qor_ai/presentation/providers/providers.dart'
    show behaviorTrackingProvider;
import 'package:qor_ai/services/ip_location_service.dart'
    show detectedCountryProvider;

// ─── Mağaza markası / logosu ────────────────────────────────────────────────

class StoreBrandData {
  final String displayName;
  final Color color;
  final IconData icon;
  final String? logoUrl;
  const StoreBrandData(this.displayName, this.color, this.icon, [this.logoUrl]);
}

/// Bir URL/serbest metinden alan adını (host) çıkarır; favicon logosu için.
/// Fiyat gibi "1.299" sayılarına yakalanmamak için son parça harf (TLD) olmalı.
String? extractStoreDomain(String? s) {
  if (s == null || s.trim().isEmpty) return null;
  final m = RegExp(
    r'([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.[a-z]{2,})',
    caseSensitive: false,
  ).firstMatch(s.toLowerCase());
  if (m == null) return null;
  return m.group(1)!.replaceFirst(RegExp(r'^www\.'), '');
}

const _brands = <List<Object>>[
  ['amazon', 'Amazon', 0xFFFF9900, 'amazon.com'],
  ['bestbuy', 'Best Buy', 0xFF003B70, 'bestbuy.com'],
  ['best buy', 'Best Buy', 0xFF003B70, 'bestbuy.com'],
  ['walmart', 'Walmart', 0xFF0071CE, 'walmart.com'],
  ['aliexpress', 'AliExpress', 0xFFE62E04, 'aliexpress.com'],
  ['trendyol', 'Trendyol', 0xFFF27A1A, 'trendyol.com'],
  ['hepsiburada', 'Hepsiburada', 0xFFFF6000, 'hepsiburada.com'],
  ['n11', 'n11', 0xFF923899, 'n11.com'],
  ['gittigidiyor', 'GittiGidiyor', 0xFFFFC600, 'gittigidiyor.com'],
  ['vatan', 'Vatan', 0xFFE60000, 'vatanbilgisayar.com'],
  ['teknosa', 'Teknosa', 0xFFE30613, 'teknosa.com'],
  ['mediamarkt', 'MediaMarkt', 0xFFE5121A, 'mediamarkt.com'],
  ['newegg', 'Newegg', 0xFFF7A028, 'newegg.com'],
  ['apple', 'Apple', 0xFF000000, 'apple.com'],
  ['samsung', 'Samsung', 0xFF1428A0, 'samsung.com'],
  ['google', 'Google Store', 0xFF4285F4, 'store.google.com'],
];

/// Bilinen markaları eşler; bilinmeyenlerde alan adından GERÇEK favicon çıkarır
/// (admin'den yeni bir mağaza eklendiğinde app güncellemesi GEREKMEZ).
StoreBrandData resolveStoreBrand(String rawName, {String? url}) {
  final n = (url == null ? rawName : '$rawName $url').toLowerCase().trim();
  for (final b in _brands) {
    if (n.contains(b[0] as String)) {
      return StoreBrandData(
        b[1] as String,
        Color(b[2] as int),
        b[0] == 'apple' ? Icons.apple : Icons.storefront_rounded,
        'https://www.google.com/s2/favicons?sz=64&domain=${b[3]}',
      );
    }
  }
  final domain = extractStoreDomain(url) ?? extractStoreDomain(rawName);
  final source = domain != null
      ? domain.split('.').first
      : rawName.replaceAll(RegExp(r'https?://\S+'), '');
  final display = source
      .split(RegExp(r'[\s_.-]+'))
      .where((p) => p.isNotEmpty)
      .map((p) => p[0].toUpperCase() + p.substring(1).toLowerCase())
      .join(' ');
  return StoreBrandData(
    display.isEmpty ? 'Store' : display,
    AppTheme.primaryBlue,
    Icons.storefront_rounded,
    domain != null
        ? 'https://www.google.com/s2/favicons?sz=64&domain=$domain'
        : null,
  );
}

class StoreLogo extends StatelessWidget {
  final StoreBrandData brand;
  final double size;
  const StoreLogo({super.key, required this.brand, this.size = 34});

  @override
  Widget build(BuildContext context) {
    final inner = size * 0.65;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: brand.logoUrl == null
            ? brand.color.withValues(alpha: 0.12)
            : Colors.white,
        borderRadius: BorderRadius.circular(size * 0.3),
        border: Border.all(color: brand.color.withValues(alpha: 0.2)),
      ),
      alignment: Alignment.center,
      child: brand.logoUrl == null
          ? Icon(brand.icon, size: inner * 0.82, color: brand.color)
          : ClipRRect(
              borderRadius: BorderRadius.circular(size * 0.21),
              child: CachedNetworkImage(
                imageUrl: brand.logoUrl!,
                width: inner,
                height: inner,
                fit: BoxFit.contain,
                fadeInDuration: Duration.zero,
                placeholder: (_, _) =>
                    Icon(brand.icon, size: inner * 0.78, color: brand.color),
                errorWidget: (_, _, _) =>
                    Icon(brand.icon, size: inner * 0.78, color: brand.color),
              ),
            ),
    );
  }
}

// ─── Sıralama / seçim ───────────────────────────────────────────────────────

/// Seçili ülkenin GÖSTERİLEBİLİR tekliflerini sıralar: önce taze + gerçek
/// fiyatlılar, sonra ucuzdan pahalıya.
///
/// SIKI ÜLKE KURALI: yalnız `country` teklifleri — başka pazarın fiyatı ASLA
/// listeye girmez.
List<ProductOfferModel> sortOffersForCountry(
  List<ProductOfferModel> offers,
  String country,
) {
  final selected = country.trim().toUpperCase();
  final live = offers
      .where((o) => o.isDisplayable)
      .where((o) => o.country.trim().toUpperCase() == selected)
      .toList();
  live.sort((a, b) {
    if (a.isFresh != b.isFresh) return a.isFresh ? -1 : 1;
    if (a.hasExactPrice != b.hasExactPrice) return a.hasExactPrice ? -1 : 1;
    if (a.hasExactPrice && b.hasExactPrice && a.price != b.price) {
      return a.price.compareTo(b.price);
    }
    return a.displayStore.compareTo(b.displayStore);
  });
  return live;
}

/// Mağaza başına TEK (en iyi) teklif — aynı mağaza tekrar listelenmez ama
/// FARKLI mağazalar kaybolmaz. Giriş sırası korunur (ucuzdan pahalıya).
List<ProductOfferModel> bestPerStore(
  List<ProductOfferModel> sorted, {
  int limit = 10,
}) {
  final seen = <String>{};
  final out = <ProductOfferModel>[];
  for (final offer in sorted) {
    final key = (offer.store.isNotEmpty ? offer.store : offer.network)
        .trim()
        .toLowerCase();
    if (key.isEmpty || !seen.add(key)) continue;
    out.add(offer);
    if (out.length >= limit) break;
  }
  return out;
}

// ─── Liste ──────────────────────────────────────────────────────────────────

/// Mağazaları ALT ALTA, ucuzdan pahalıya listeler.
///
/// [compact] karşılaştırma kolonu içindir: aynı liste, aynı sıra, yalnız
/// ölçüler kolona sığacak kadar küçülür.
class StoreOfferList extends StatelessWidget {
  final List<ProductOfferModel> offers;
  final String country;
  final String productId;
  final bool compact;
  final int limit;

  const StoreOfferList({
    super.key,
    required this.offers,
    required this.country,
    required this.productId,
    this.compact = false,
    this.limit = 10,
  });

  @override
  Widget build(BuildContext context) {
    final rows = bestPerStore(
      sortOffersForCountry(offers, country),
      limit: limit,
    );
    if (rows.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final offer in rows)
          StoreOfferRow(
            offer: offer,
            selectedCountry: country,
            productId: productId,
            compact: compact,
          ),
      ],
    );
  }
}

class StoreOfferRow extends ConsumerWidget {
  final ProductOfferModel offer;
  final String selectedCountry;
  final String productId;
  final bool compact;

  const StoreOfferRow({
    super.key,
    required this.offer,
    required this.selectedCountry,
    required this.productId,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Linksiz vitrin satırlarında domain `merchantProductId`'den gelir
    // (offer.storeDomain) — favicon böyle çözülür, aksi hâlde jenerik ikon.
    final brand = resolveStoreBrand(
      '${offer.store} ${offer.network}',
      url: offer.url.isNotEmpty ? offer.url : offer.storeDomain,
    );
    final showCountry =
        offer.country.isNotEmpty &&
        offer.country != selectedCountry.trim().toUpperCase();
    final isTr = Localizations.localeOf(context).languageCode == 'tr';
    // Dar kolonda kuruş yazılmaz — "₺105.999,00" sığmayıp kırpılıyordu.
    final priceLabel = offer.hasExactPrice
        ? (compact
              ? AppUtils.formatCurrencyCompact(offer.price, offer.currency)
              : AppUtils.formatCurrency(offer.price, offer.currency))
        : (offer.priceText.isNotEmpty && !compact
              ? offer.priceText
              : (isTr ? 'Fiyata bak' : 'Check price'));
    // Epey mağaza teklifleri LİNKSİZ gelir (vitrin fiyatı). Böyle satırlar
    // tıklanabilir görünmemeli: fiyat referansı olarak durur.
    final hasLink = offer.url.trim().isNotEmpty;

    return Padding(
      padding: EdgeInsets.only(bottom: compact ? 6 : 8),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: !hasLink
              ? null
              : () async {
                  // Amazon linkleri tıklama anında ziyaretçinin mağazasına göre
                  // yeniden etiketlenir (amazon_link.dart); diğerleri aynen.
                  final visitor = ref.read(detectedCountryProvider).valueOrNull;
                  final uri = Uri.tryParse(
                    amazonTagUrlForVisitor(offer.url, visitor),
                  );
                  if (uri == null) return;
                  try {
                    ref
                        .read(behaviorTrackingProvider)
                        .trackAffiliateTap(productId);
                  } catch (_) {}
                  try {
                    await launchUrl(uri, mode: LaunchMode.externalApplication);
                  } catch (_) {}
                },
          child: Container(
            padding: EdgeInsets.symmetric(
              horizontal: compact ? 8 : 10,
              vertical: compact ? 8 : 10,
            ),
            decoration: BoxDecoration(
              color: context.surfaceColor,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.dividerColor),
            ),
            // DAR KOLON (compact): logo + FİYAT. Mağaza adı BİLEREK yazılmaz —
            // kolon genişliği ~90-140 px; ad + fiyat yan yana sığmıyor, ad
            // sıfır genişliğe eziliyor ve fiyat "₺105.999,0" diye kırpılıyordu
            // (kullanıcı bug'ı). Logo mağazayı zaten belli ediyor; fiyat
            // FittedBox ile ASLA kırpılmaz.
            child: compact
                ? Row(
                    children: [
                      StoreLogo(brand: brand, size: 24),
                      const SizedBox(width: 6),
                      // FittedBox KULLANILMAZ: uzun bir fiyati ("₺105.999")
                      // kucultup kisa bir etiketi ("Fiyata bak") tam boyutta
                      // birakiyordu -> etiket fiyattan BUYUK gorunuyordu
                      // (kullanici bug'i). Sabit, kucuk bir punto ikisini de
                      // AYNI boyutta tutar; tasma olursa ellipsis.
                      Expanded(
                        child: Text(
                          priceLabel,
                          maxLines: 1,
                          textAlign: TextAlign.right,
                          overflow: TextOverflow.ellipsis,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w800,
                            color: offer.hasExactPrice
                                ? AppTheme.scoreExcellent
                                : context.textSecondary,
                          ),
                        ),
                      ),
                    ],
                  )
                : Row(
                    children: [
                      StoreLogo(brand: brand, size: 34),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              brand.displayName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: context.textSecondary,
                              ),
                            ),
                            if (showCountry ||
                                (offer.priceText.isNotEmpty &&
                                    !offer.hasExactPrice))
                              Padding(
                                padding: const EdgeInsets.only(top: 2),
                                child: Text(
                                  [
                                    if (showCountry) offer.country,
                                    if (offer.priceText.isNotEmpty &&
                                        !offer.hasExactPrice)
                                      offer.priceText,
                                  ].join(' · '),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 11,
                                    color: context.textTertiaryColor,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        priceLabel,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: offer.hasExactPrice
                              ? AppTheme.scoreExcellent
                              : context.textSecondary,
                        ),
                      ),
                      // Vitrin satırı tıklanmaz → "dışa aç" oku da GÖSTERİLMEZ.
                      if (hasLink) ...[
                        const SizedBox(width: 8),
                        Icon(
                          Icons.open_in_new_rounded,
                          size: 16,
                          color: context.textTertiaryColor,
                        ),
                      ],
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}
