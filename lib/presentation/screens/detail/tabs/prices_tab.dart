part of '../product_detail_screen.dart';

// ═══════════════════════════════════════════════════════════
// PRICES TAB
// Structure: 4 store links → variants → 4 more links → similar (horizontal)
// → remaining links (if any)
// ═══════════════════════════════════════════════════════════

class _PricesTabContent extends ConsumerWidget {
  final ProductEntity product;
  final String country;
  final bool isDark;
  const _PricesTabContent({
    required this.product,
    required this.country,
    required this.isDark,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final offersAsync = ref.watch(productOffersProvider(product.id));
    final liveOffers = _sortOffersForCountry(
      offersAsync.valueOrNull ?? const <ProductOfferModel>[],
      country,
    );
    final stores = product.getAffiliateLinksForCountry(country);
    final storeEntries = stores.isNotEmpty
        ? stores.entries.toList()
        : product.affiliateLinks.entries.toList();
    final fallbackEntries = _dedupeStoreEntries(storeEntries, liveOffers);

    final firstOfferChunk = liveOffers.take(4).toList();
    final secondOfferChunk = liveOffers.skip(4).take(4).toList();
    final restOfferChunk = liveOffers.skip(8).toList();

    final firstStoreChunk = firstOfferChunk.isEmpty
        ? fallbackEntries.take(4).toList()
        : const <MapEntry<String, String>>[];
    final secondStoreChunk = firstOfferChunk.isEmpty
        ? fallbackEntries.skip(4).take(4).toList()
        : fallbackEntries.take(4).toList();
    final restStoreChunk = firstOfferChunk.isEmpty
        ? fallbackEntries.skip(8).toList()
        : fallbackEntries.skip(4).toList();

    final hasAnyStores = liveOffers.isNotEmpty || fallbackEntries.isNotEmpty;
    final isLoadingOffers = offersAsync is AsyncLoading;

    // Amazon'u iki kez gösterme: "Canlı Fiyatlar"da zaten bir Amazon teklifi
    // (gerçek fiyatlı) varsa, üstteki genel Amazon arama kartını gizle.
    final hasLiveAmazon = liveOffers.any(
      (o) => o.store.toLowerCase().contains('amazon'),
    );

    return CustomScrollView(
      key: PageStorageKey<String>('prices-tab-${product.id}'),
      physics: const ClampingScrollPhysics(),
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Country-correct Amazon link (mirrors the web): TR shoppers get
                // amazon.com.tr (qorai-21); others their market. Canlı Fiyatlar'da
                // zaten Amazon varsa tekrar göstermemek için gizlenir.
                if (!hasLiveAmazon) ...[
                  _AmazonSearchCard(product: product, country: country),
                  const SizedBox(height: 16),
                ],
                if (firstOfferChunk.isNotEmpty) ...[
                  _OfferLinksCard(
                    product: product,
                    country: country,
                    offers: firstOfferChunk,
                  ),
                  const SizedBox(height: 16),
                ] else if (firstStoreChunk.isNotEmpty) ...[
                  _StoreLinksCard(
                    product: product,
                    country: country,
                    entries: firstStoreChunk,
                  ),
                  const SizedBox(height: 16),
                ] else if (isLoadingOffers && !hasAnyStores) ...[
                  _PriceLoadingCard(),
                  const SizedBox(height: 16),
                ] else if (!hasAnyStores) ...[
                  _PriceFallbackCard(product: product, country: country),
                  const SizedBox(height: 16),
                ],
                if (secondOfferChunk.isNotEmpty) ...[
                  _OfferLinksCard(
                    product: product,
                    country: country,
                    offers: secondOfferChunk,
                    compact: true,
                  ),
                  const SizedBox(height: 16),
                ],
                if (secondStoreChunk.isNotEmpty) ...[
                  _StoreLinksCard(
                    product: product,
                    country: country,
                    entries: secondStoreChunk,
                    compact: true,
                  ),
                  const SizedBox(height: 16),
                ],
              ],
            ),
          ),
        ),
        // Varyantlar (depolama/RAM farkları) — benzer ürünlerin hemen üstünde,
        // tıpkı benzer ürünler gibi kart halinde + fark bilgisiyle (web gibi).
        SliverToBoxAdapter(child: _CompactVariantsSection(product: product)),
        // Similar products — horizontal scrollable row
        SliverToBoxAdapter(child: _HorizontalSimilarSection(product: product)),
        if (restOfferChunk.isNotEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: _OfferLinksCard(
                product: product,
                country: country,
                offers: restOfferChunk,
                compact: true,
              ),
            ),
          ),
        if (restStoreChunk.isNotEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: _StoreLinksCard(
                product: product,
                country: country,
                entries: restStoreChunk,
                compact: true,
              ),
            ),
          ),
        SliverToBoxAdapter(
          child: SizedBox(height: MediaQuery.of(context).padding.bottom + 40),
        ),
      ],
    );
  }

  static List<ProductOfferModel> _sortOffersForCountry(
    List<ProductOfferModel> offers,
    String country,
  ) {
    final selected = country.trim().toUpperCase();
    final live = offers.where((offer) => offer.isLive).toList();
    int rank(ProductOfferModel offer) {
      final c = offer.country.trim().toUpperCase();
      if (c == selected) return 0;
      if (c.isEmpty) return 2;
      if (c == 'US') return 3;
      return 1;
    }

    live.sort((a, b) {
      final rankCompare = rank(a).compareTo(rank(b));
      if (rankCompare != 0) return rankCompare;
      if (a.isFresh != b.isFresh) return a.isFresh ? -1 : 1;
      if (a.hasExactPrice != b.hasExactPrice) {
        return a.hasExactPrice ? -1 : 1;
      }
      if (a.hasExactPrice && b.hasExactPrice && a.price != b.price) {
        return a.price.compareTo(b.price);
      }
      return a.displayStore.compareTo(b.displayStore);
    });
    return live;
  }

  static List<MapEntry<String, String>> _dedupeStoreEntries(
    List<MapEntry<String, String>> entries,
    List<ProductOfferModel> offers,
  ) {
    final seenUrls = offers
        .map((offer) => offer.url.trim().toLowerCase())
        .where((url) => url.isNotEmpty)
        .toSet();
    final result = <MapEntry<String, String>>[];
    for (final entry in entries) {
      final url = entry.value.trim();
      if (url.isEmpty) continue;
      final normalized = url.toLowerCase();
      if (seenUrls.contains(normalized)) continue;
      if (result.any((e) => e.value.trim().toLowerCase() == normalized)) {
        continue;
      }
      result.add(MapEntry(entry.key, url));
    }
    return result;
  }
}

class _OfferLinksCard extends StatelessWidget {
  final ProductEntity product;
  final String country;
  final List<ProductOfferModel> offers;
  final bool compact;
  const _OfferLinksCard({
    required this.product,
    required this.country,
    required this.offers,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final pricedOffers = offers.where((offer) => offer.hasExactPrice).toList();
    final bestOffer = pricedOffers.isEmpty ? null : pricedOffers.first;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!compact)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [AppTheme.scoreExcellent, AppTheme.accentTeal],
                      ),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(
                      Icons.local_offer_outlined,
                      size: 14,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      Localizations.localeOf(context).languageCode == 'tr'
                          ? 'Canli Fiyatlar'
                          : 'Live Prices',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: context.textPrimary,
                      ),
                    ),
                  ),
                  if (bestOffer != null)
                    Text(
                      AppUtils.formatCurrency(
                        bestOffer.price,
                        bestOffer.currency,
                      ),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: AppTheme.scoreExcellent,
                      ),
                    ),
                ],
              ),
            ),
          ...offers.map(
            (offer) => _OfferLinkRow(
              offer: offer,
              selectedCountry: country,
              productId: product.id,
            ),
          ),
        ],
      ),
    );
  }
}

class _OfferLinkRow extends ConsumerWidget {
  final ProductOfferModel offer;
  final String selectedCountry;
  final String productId;
  const _OfferLinkRow({
    required this.offer,
    required this.selectedCountry,
    required this.productId,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = _resolveStoreBrand(
      '${offer.displayStore} ${offer.network}',
      url: offer.url,
    );
    final showCountry =
        offer.country.isNotEmpty &&
        offer.country != selectedCountry.trim().toUpperCase();
    final priceLabel = offer.hasExactPrice
        ? AppUtils.formatCurrency(offer.price, offer.currency)
        : (offer.priceText.isNotEmpty
              ? offer.priceText
              : (Localizations.localeOf(context).languageCode == 'tr'
                    ? 'Fiyati gor'
                    : 'Check price'));
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () async {
            final uri = Uri.tryParse(offer.url);
            if (uri == null) return;
            try {
              ref.read(behaviorTrackingProvider).trackAffiliateTap(productId);
            } catch (_) {}
            try {
              await launchUrl(uri, mode: LaunchMode.externalApplication);
            } catch (_) {}
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
            decoration: BoxDecoration(
              color: context.surfaceColor,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.dividerColor),
            ),
            child: Row(
              children: [
                _StoreLogo(brand: brand),
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
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary,
                        ),
                      ),
                      if (showCountry || offer.priceText.isNotEmpty)
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
                const SizedBox(width: 8),
                Icon(
                  Icons.open_in_new_rounded,
                  size: 16,
                  color: context.textTertiaryColor,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ─── Amazon search card — always present, country-correct (mirrors web) ───────
class _AmazonSearchCard extends ConsumerWidget {
  final ProductEntity product;
  final String country;
  const _AmazonSearchCard({required this.product, required this.country});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final url = amazonUrlForProduct(product, country);
    if (url.isEmpty) return const SizedBox.shrink();
    final brand = _resolveStoreBrand('amazon');
    final market = amazonMarketForCountry(country);
    final flag = amazonMarketFlag[market] ?? '🌍';
    final isTr = Localizations.localeOf(context).languageCode == 'tr';
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () async {
          final uri = Uri.tryParse(url);
          if (uri == null) return;
          try {
            ref.read(behaviorTrackingProvider).trackAffiliateTap(product.id);
          } catch (_) {}
          try {
            await launchUrl(uri, mode: LaunchMode.externalApplication);
          } catch (_) {}
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            color: context.surfaceVariantColor,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: context.dividerColor),
          ),
          child: Row(
            children: [
              _StoreLogo(brand: brand),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Amazon',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: context.textPrimary,
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        isTr
                            ? "$flag Amazon'da fiyatlara bak"
                            : '$flag Check prices on Amazon',
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
                isTr ? 'Fiyata bak' : 'See price',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: context.textSecondary,
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                Icons.open_in_new_rounded,
                size: 16,
                color: context.textTertiaryColor,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Store-links card (logo + name + link) ───────────────────────────────────
class _StoreLinksCard extends StatelessWidget {
  final ProductEntity product;
  final String country;
  final List<MapEntry<String, String>> entries;
  final bool compact;
  const _StoreLinksCard({
    required this.product,
    required this.country,
    required this.entries,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final countryInfo = SupportedCountries.countries[country];
    final localPrice = product.getPriceForCountry(country);
    final usPrice = product.getPriceForCountry('US');
    final price = localPrice ?? usPrice;
    final currency = localPrice != null
        ? (countryInfo?.currency ?? 'USD')
        : 'USD';

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!compact)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [AppTheme.scoreExcellent, AppTheme.accentTeal],
                      ),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(
                      Icons.local_offer_outlined,
                      size: 14,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      Localizations.localeOf(context).languageCode == 'tr'
                          ? 'Fiyatlar'
                          : 'Prices',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: context.textPrimary,
                      ),
                    ),
                  ),
                  if (price != null)
                    Text(
                      AppUtils.formatCurrency(price, currency),
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: AppTheme.scoreExcellent,
                      ),
                    ),
                ],
              ),
            ),
          ...entries.map(
            (e) =>
                _StoreLinkRow(name: e.key, url: e.value, productId: product.id),
          ),
        ],
      ),
    );
  }
}

// ─── Single store row: logo + name → link ────────────────────────────────────
class _StoreLinkRow extends ConsumerWidget {
  final String name;
  final String url;
  final String productId;
  const _StoreLinkRow({
    required this.name,
    required this.url,
    required this.productId,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final brand = _resolveStoreBrand(name, url: url);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () async {
            final uri = Uri.tryParse(url);
            if (uri == null) return;
            // Track affiliate click — feeds the user's behavior signals (match
            // score boosts) and future affiliate analytics.
            try {
              ref.read(behaviorTrackingProvider).trackAffiliateTap(productId);
            } catch (_) {}
            try {
              await launchUrl(uri, mode: LaunchMode.externalApplication);
            } catch (_) {}
          },
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
            decoration: BoxDecoration(
              color: context.surfaceColor,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: context.dividerColor),
            ),
            child: Row(
              children: [
                _StoreLogo(brand: brand),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    brand.displayName,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: context.textPrimary,
                    ),
                  ),
                ),
                Icon(
                  Icons.open_in_new_rounded,
                  size: 16,
                  color: context.textTertiaryColor,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StoreBrandData {
  final String displayName;
  final Color color;
  final IconData icon;
  final String? logoUrl;
  const _StoreBrandData(
    this.displayName,
    this.color,
    this.icon, [
    this.logoUrl,
  ]);
}

/// Bir URL/serbest metinden alan adını (host) çıkarır; favicon logosu için.
/// Fiyat gibi "1.299" sayılarına yakalanmamak için son parça harf (TLD) olmalı.
String? _extractStoreDomain(String? s) {
  if (s == null || s.trim().isEmpty) return null;
  final m = RegExp(
    r'([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.[a-z]{2,})',
    caseSensitive: false,
  ).firstMatch(s.toLowerCase());
  if (m == null) return null;
  return m.group(1)!.replaceFirst(RegExp(r'^www\.'), '');
}

_StoreBrandData _resolveStoreBrand(String rawName, {String? url}) {
  final n = (url == null ? rawName : '$rawName $url').toLowerCase().trim();
  if (n.contains('amazon')) {
    return _StoreBrandData(
      'Amazon',
      const Color(0xFFFF9900),
      Icons.shopping_cart_rounded,
      'https://www.google.com/s2/favicons?sz=64&domain=amazon.com',
    );
  }
  if (n.contains('bestbuy') || n.contains('best buy')) {
    return _StoreBrandData(
      'Best Buy',
      const Color(0xFF003B70),
      Icons.storefront_rounded,
      'https://www.google.com/s2/favicons?sz=64&domain=bestbuy.com',
    );
  }
  if (n.contains('walmart')) {
    return _StoreBrandData(
      'Walmart',
      const Color(0xFF0071CE),
      Icons.storefront_rounded,
      'https://www.google.com/s2/favicons?sz=64&domain=walmart.com',
    );
  }
  if (n.contains('aliexpress') || n.contains('ali ')) {
    return _StoreBrandData(
      'AliExpress',
      const Color(0xFFE62E04),
      Icons.local_shipping_rounded,
      'https://www.google.com/s2/favicons?sz=64&domain=aliexpress.com',
    );
  }
  if (n.contains('trendyol')) {
    return _StoreBrandData(
      'Trendyol',
      const Color(0xFFF27A1A),
      Icons.shopping_bag_rounded,
      'https://www.google.com/s2/favicons?sz=64&domain=trendyol.com',
    );
  }
  if (n.contains('hepsiburada')) {
    return _StoreBrandData(
      'Hepsiburada',
      const Color(0xFFFF6000),
      Icons.shopping_bag_rounded,
      'https://www.google.com/s2/favicons?sz=64&domain=hepsiburada.com',
    );
  }
  if (n.contains('n11')) {
    return _StoreBrandData(
      'n11',
      const Color(0xFF923899),
      Icons.storefront_rounded,
      'https://www.google.com/s2/favicons?sz=64&domain=n11.com',
    );
  }
  if (n.contains('gittigidiyor')) {
    return _StoreBrandData(
      'GittiGidiyor',
      const Color(0xFFFFC600),
      Icons.storefront_rounded,
      'https://www.google.com/s2/favicons?sz=64&domain=gittigidiyor.com',
    );
  }
  if (n.contains('vatan')) {
    return _StoreBrandData(
      'Vatan',
      const Color(0xFFE60000),
      Icons.storefront_rounded,
      'https://www.google.com/s2/favicons?sz=64&domain=vatanbilgisayar.com',
    );
  }
  if (n.contains('teknosa')) {
    return _StoreBrandData(
      'Teknosa',
      const Color(0xFFE30613),
      Icons.storefront_rounded,
      'https://www.google.com/s2/favicons?sz=64&domain=teknosa.com',
    );
  }
  if (n.contains('mediamarkt')) {
    return _StoreBrandData(
      'MediaMarkt',
      const Color(0xFFE5121A),
      Icons.storefront_rounded,
      'https://www.google.com/s2/favicons?sz=64&domain=mediamarkt.com',
    );
  }
  if (n.contains('newegg')) {
    return _StoreBrandData(
      'Newegg',
      const Color(0xFFF7A028),
      Icons.memory_rounded,
      'https://www.google.com/s2/favicons?sz=64&domain=newegg.com',
    );
  }
  if (n.contains('apple')) {
    return _StoreBrandData(
      'Apple',
      const Color(0xFF000000),
      Icons.apple,
      'https://www.google.com/s2/favicons?sz=64&domain=apple.com',
    );
  }
  if (n.contains('samsung')) {
    return _StoreBrandData(
      'Samsung',
      const Color(0xFF1428A0),
      Icons.storefront_rounded,
      'https://www.google.com/s2/favicons?sz=64&domain=samsung.com',
    );
  }
  if (n.contains('google')) {
    return _StoreBrandData(
      'Google Store',
      const Color(0xFF4285F4),
      Icons.storefront_rounded,
      'https://www.google.com/s2/favicons?sz=64&domain=store.google.com',
    );
  }
  // Generic fallback — VERİ-ODAKLI: bilinmeyen/yeni eklenen merchant'lar için
  // alan adından gerçek favicon logosunu çıkar. Böylece admin'den yeni bir
  // affiliate (örn. Walmart, başka mağaza) eklenince app güncellemesi GEREKMEDEN
  // logosuyla listede yer alır. Domain yoksa jenerik mağaza ikonu gösterilir.
  final domain = _extractStoreDomain(url) ?? _extractStoreDomain(rawName);
  // Görünen ad: domain varsa kökünü (örn. "walmart"), yoksa URL'siz ham adı kullan.
  final source = domain != null
      ? domain.split('.').first
      : rawName.replaceAll(RegExp(r'https?://\S+'), '');
  final display = source
      .split(RegExp(r'[\s_.-]+'))
      .where((p) => p.isNotEmpty)
      .map((p) => p[0].toUpperCase() + p.substring(1).toLowerCase())
      .join(' ');
  return _StoreBrandData(
    display.isEmpty ? 'Store' : display,
    AppTheme.primaryBlue,
    Icons.storefront_rounded,
    domain != null
        ? 'https://www.google.com/s2/favicons?sz=64&domain=$domain'
        : null,
  );
}

class _StoreLogo extends StatelessWidget {
  final _StoreBrandData brand;
  const _StoreLogo({required this.brand});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 34,
      height: 34,
      decoration: BoxDecoration(
        color: brand.logoUrl == null
            ? brand.color.withValues(alpha: 0.12)
            : Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: brand.color.withValues(alpha: 0.2)),
      ),
      alignment: Alignment.center,
      child: brand.logoUrl == null
          ? Icon(brand.icon, size: 18, color: brand.color)
          : ClipRRect(
              borderRadius: BorderRadius.circular(7),
              child: CachedNetworkImage(
                imageUrl: brand.logoUrl!,
                width: 22,
                height: 22,
                fit: BoxFit.contain,
                fadeInDuration: Duration.zero,
                placeholder: (_, _) =>
                    Icon(brand.icon, size: 17, color: brand.color),
                errorWidget: (_, _, _) =>
                    Icon(brand.icon, size: 17, color: brand.color),
              ),
            ),
    );
  }
}

class _PriceLoadingCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 26, horizontal: 16),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.dividerColor),
      ),
      child: Column(
        children: [
          const SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          const SizedBox(height: 10),
          Text(
            Localizations.localeOf(context).languageCode == 'tr'
                ? 'Fiyatlar yukleniyor'
                : 'Loading prices',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 13,
              color: context.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Fallback when no stores: just show price summary ────────────────────────
class _PriceFallbackCard extends StatelessWidget {
  final ProductEntity product;
  final String country;
  const _PriceFallbackCard({required this.product, required this.country});

  @override
  Widget build(BuildContext context) {
    final countryInfo = SupportedCountries.countries[country];
    final localPrice = product.getPriceForCountry(country);
    final usPrice = product.getPriceForCountry('US');
    final price = localPrice ?? usPrice;
    final currency = localPrice != null
        ? (countryInfo?.currency ?? 'USD')
        : 'USD';
    if (price == null) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 16),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: context.dividerColor),
        ),
        child: Column(
          children: [
            Icon(
              Icons.price_change_outlined,
              size: 32,
              color: context.textTertiaryColor,
            ),
            const SizedBox(height: 8),
            Text(
              Localizations.localeOf(context).languageCode == 'tr'
                  ? 'Henüz fiyat bilgisi yok'
                  : 'No price information yet',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 13,
                color: context.textSecondary,
              ),
            ),
          ],
        ),
      );
    }
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.dividerColor),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AppTheme.scoreExcellent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(
              Icons.local_offer_outlined,
              color: AppTheme.scoreExcellent,
              size: 18,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  localPrice == null
                      ? 'Approx. price (USD)'
                      : 'Price in $country',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 11,
                    color: context.textSecondary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  AppUtils.formatCurrency(price, currency),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: context.textPrimary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Compact variants row — storage-only labels, horizontal scroll ──────────
class _CompactVariantsSection extends ConsumerWidget {
  final ProductEntity product;
  const _CompactVariantsSection({required this.product});

  // Web paritesi (ProductDetail.jsx variantSpecKind/Value/pickVariantDiffKinds):
  // varyantın FARKLI olan GERÇEK spec değerini keySpecs'ten okuyup gösterir
  // (isim regex'i değil). Böylece MacBook gibi storage'ı AYNI ama işlemci/çekirdek
  // farklı (18CPU/32GPU) varyantlarda doğru fark yazılır; "2 TB" iki kez değil.
  static const _priority = [
    'ram',
    'storage',
    'processor',
    'screen',
    'battery',
    'color',
  ];

  static String _specKind(String label, String value) {
    final t = '$label $value'.toLowerCase();
    if (RegExp(r'\bram\b|bellek|memory|arbeitsspeicher').hasMatch(t)) {
      return 'ram';
    }
    if (RegExp(r'storage|depolama|ssd|hdd|kapasite|speicher').hasMatch(t) &&
        !RegExp(r'batar|pil|battery|akku').hasMatch(t)) {
      return 'storage';
    }
    if (RegExp(
      r'işlemci|islemci|processor|\bcpu\b|\bgpu\b|graphics|grafik|chip|yonga|çip',
    ).hasMatch(t)) {
      return 'processor';
    }
    if (RegExp(r'ekran|screen|display|inch|inç|zoll|bildschirm').hasMatch(t)) {
      return 'screen';
    }
    if (RegExp(r'batar|pil|battery|akku|mah|\bwh\b').hasMatch(t)) {
      return 'battery';
    }
    if (RegExp(r'renk|colou?r|farbe').hasMatch(t)) {
      return 'color';
    }
    return '';
  }

  static String? _specValueForKind(ProductEntity p, String kind) {
    for (final e in p.keySpecs.entries) {
      final value = e.value.toString();
      if (_specKind(e.key, value) == kind) {
        final v = value.trim();
        if (v.isNotEmpty) return v;
      }
    }
    // keySpecs eksikse isimden türet (storage/ram).
    if (kind == 'storage') {
      final s = _VariantChip._extractStorageOnly(p);
      if (s.isNotEmpty) return s;
    }
    if (kind == 'ram') {
      return _VariantChip._extractRam(
        p,
      )?.replaceAll(RegExp(r'\s*RAM$', caseSensitive: false), '');
    }
    return null;
  }

  static String _kindLabel(String kind, bool isTr) {
    switch (kind) {
      case 'ram':
        return 'RAM';
      case 'storage':
        return isTr ? 'Depolama' : 'Storage';
      case 'processor':
        return isTr ? 'İşlemci/GPU' : 'Processor/GPU';
      case 'screen':
        return isTr ? 'Ekran' : 'Screen';
      case 'battery':
        return isTr ? 'Batarya' : 'Battery';
      case 'color':
        return isTr ? 'Renk' : 'Color';
    }
    return kind;
  }

  static List<String> _diffKinds(List<ProductEntity> variants) {
    final out = <String>[];
    for (final k in _priority) {
      final vals = <String>{};
      for (final v in variants) {
        final val = _specValueForKind(v, k);
        if (val != null && val.isNotEmpty) vals.add(val.toLowerCase());
      }
      if (vals.length >= 2) out.add(k);
      if (out.length >= 3) break;
    }
    return out;
  }

  /// Spec'lerden fark çıkmadığında kart için ismin ayırt edici model etiketi
  /// (CPU/GPU/RAM/depolama/ekran karması — _variantLabelFor).
  static String _fallbackLabel(ProductEntity p) {
    final lbl = _VariantChip._variantLabelFor(p);
    return lbl.length > 26 ? '${lbl.substring(0, 25)}…' : lbl;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final variantsAsync = ref.watch(productVariantsProvider(product));
    return variantsAsync.when(
      loading: () => const SizedBox.shrink(),
      error: (_, _) => const SizedBox.shrink(),
      data: (variants) {
        if (variants.isEmpty) return const SizedBox.shrink();
        final all = [product, ...variants]
          ..sort((a, b) => a.name.compareTo(b.name));

        // DEDUP = tam ürün ADI (lowercase): configKey/specs Apple/Xiaomi'de
        // bozuk/paylaşımlı; tek güvenilir ayraç isim. Aynı isim = gerçek dup;
        // "(512 GB)" vs "(1 TB)" / farklı CPU-GPU = farklı isim → ayrı kart.
        // Seçili ürünü temsilci olarak koru.
        final seen = <String>{};
        final unique = <ProductEntity>[];
        for (final v in all) {
          final key = v.name.toLowerCase().trim();
          if (seen.contains(key)) {
            if (v.id == product.id) {
              unique.removeWhere((u) => u.name.toLowerCase().trim() == key);
              unique.add(v);
            }
            continue;
          }
          seen.add(key);
          unique.add(v);
        }
        if (unique.length <= 1) return const SizedBox.shrink();

        final isTr =
            Localizations.localeOf(context).languageCode.toLowerCase() == 'tr';
        final diffKinds = _diffKinds(unique);
        // Seçili (mevcut) varyantı başa al.
        unique.sort((a, b) {
          if (a.id == product.id) return -1;
          if (b.id == product.id) return 1;
          return 0;
        });

        return Padding(
          padding: const EdgeInsets.only(top: 4, bottom: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: Row(
                  children: [
                    Container(
                      width: 30,
                      height: 30,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [Color(0xFF06B6D4), Color(0xFF3B82F6)],
                        ),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(
                        Icons.layers_rounded,
                        size: 16,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        isTr ? 'Varyantlar' : 'Variants',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              SizedBox(
                height: 214,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: unique.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 10),
                  itemBuilder: (context, i) => SizedBox(
                    width: 158,
                    child: _VariantGridCard(
                      product: unique[i],
                      isSelected: unique[i].id == product.id,
                      diffKinds: diffKinds,
                      isTr: isTr,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// Varyant kartı — benzer ürün kartıyla aynı görünüm; alt bilgide bu varyantın
/// FARKLI olan spec değerlerini (depolama/RAM/ekran...) gösterir.
class _VariantGridCard extends StatelessWidget {
  final ProductEntity product;
  final bool isSelected;
  final List<String> diffKinds;
  final bool isTr;
  const _VariantGridCard({
    required this.product,
    required this.isSelected,
    required this.diffKinds,
    required this.isTr,
  });

  @override
  Widget build(BuildContext context) {
    final cyan = AppTheme.brandCyan;
    final shown = diffKinds.take(2).toList();
    // Kartta gösterilecek (değer, etiket) hücreleri. Fark bulunan spec türleri
    // varsa onları; yoksa ismin ayırt edici kısmını (model etiketi) göster.
    final List<(String, String)> cells = shown.isEmpty
        ? [(_CompactVariantsSection._fallbackLabel(product), isTr ? 'Sürüm' : 'Version')]
        : [
            for (final k in shown)
              (
                _CompactVariantsSection._specValueForKind(product, k) ?? '—',
                _CompactVariantsSection._kindLabel(k, isTr),
              ),
          ];
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        boxShadow: AppTheme.cardShadow,
      ),
      child: Material(
        color: context.surfaceVariantColor,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(
            color: isSelected ? cyan : cyan.withValues(alpha: 0.12),
            width: isSelected ? 1.6 : 0.8,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: isSelected
              ? null
              : () {
                  HapticFeedback.lightImpact();
                  context.replace('/product/${product.id}');
                },
          borderRadius: BorderRadius.circular(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: const BorderRadius.vertical(
                    top: Radius.circular(16),
                  ),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      const ColoredBox(color: Colors.white),
                      Padding(
                        padding: const EdgeInsets.all(6),
                        child: ProductImageBox(
                          imageUrl: product.imageUrl,
                          fallbackUrls: product.images,
                          borderRadius: BorderRadius.circular(10),
                          padding: EdgeInsets.zero,
                        ),
                      ),
                      if (isSelected)
                        Positioned(
                          top: 7,
                          left: 7,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 7,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: cyan,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              isTr ? 'Şu an' : 'Current',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 9,
                                fontWeight: FontWeight.w700,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(10, 7, 10, 9),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (final cell in cells) ...[
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              cell.$1,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w800,
                                color: context.textPrimary,
                              ),
                            ),
                            const SizedBox(height: 1),
                            Text(
                              cell.$2,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 9,
                                fontWeight: FontWeight.w600,
                                color: context.textTertiaryColor,
                                letterSpacing: 0.2,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
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

// ─── Horizontal similar products row ────────────────────────────────────────
class _HorizontalSimilarSection extends ConsumerWidget {
  final ProductEntity product;
  const _HorizontalSimilarSection({required this.product});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final similarAsync = ref.watch(similarProductsProvider(product));
    return similarAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 24, horizontal: 16),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      error: (_, _) => const SizedBox.shrink(),
      data: (products) {
        if (products.isEmpty) return const SizedBox.shrink();
        final isDark = Theme.of(context).brightness == Brightness.dark;
        final list = products.take(12).toList();
        return Padding(
          padding: const EdgeInsets.only(top: 4, bottom: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: Row(
                  children: [
                    Container(
                      width: 30,
                      height: 30,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [AppTheme.primaryBlue, Color(0xFF7C3AED)],
                        ),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(
                        Icons.hub_rounded,
                        size: 16,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        context.l10n?.similarProducts ?? 'Similar Products',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: context.textPrimary,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              SizedBox(
                height: 210,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: list.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 10),
                  itemBuilder: (context, i) => SizedBox(
                    width: 150,
                    child: SharedSimilarGridCard(product: list[i]),
                  ),
                ),
              ),
              // Keep isDark referenced (silences analyzer in any future variant).
              SizedBox(height: isDark ? 0 : 0),
            ],
          ),
        );
      },
    );
  }
}
