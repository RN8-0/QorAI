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
    final stores = product.getAffiliateLinksForCountry(country);
    final storeEntries = stores.isNotEmpty
        ? stores.entries.toList()
        : product.affiliateLinks.entries.toList();

    // Split store links into pre-variants (first 4) and post-variants (next 4),
    // remainder shown after the similar products row.
    final firstChunk = storeEntries.take(4).toList();
    final secondChunk = storeEntries.skip(4).take(4).toList();
    final restChunk = storeEntries.skip(8).toList();

    final hasAnyStores = storeEntries.isNotEmpty;

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
                if (firstChunk.isNotEmpty) ...[
                  _StoreLinksCard(
                    product: product,
                    country: country,
                    entries: firstChunk,
                  ),
                  const SizedBox(height: 16),
                ] else if (!hasAnyStores) ...[
                  _PriceFallbackCard(product: product, country: country),
                  const SizedBox(height: 16),
                ],
                _CompactVariantsSection(product: product),
                const SizedBox(height: 16),
                if (secondChunk.isNotEmpty) ...[
                  _StoreLinksCard(
                    product: product,
                    country: country,
                    entries: secondChunk,
                    compact: true,
                  ),
                  const SizedBox(height: 16),
                ],
              ],
            ),
          ),
        ),
        // Similar products — horizontal scrollable row
        SliverToBoxAdapter(child: _HorizontalSimilarSection(product: product)),
        if (restChunk.isNotEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: _StoreLinksCard(
                product: product,
                country: country,
                entries: restChunk,
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
    final brand = _resolveStoreBrand(name);
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
  const _StoreBrandData(this.displayName, this.color, this.icon);
}

_StoreBrandData _resolveStoreBrand(String rawName) {
  final n = rawName.toLowerCase().trim();
  if (n.contains('amazon')) {
    return _StoreBrandData(
      'Amazon',
      const Color(0xFFFF9900),
      Icons.shopping_cart_rounded,
    );
  }
  if (n.contains('bestbuy') || n.contains('best buy')) {
    return _StoreBrandData(
      'Best Buy',
      const Color(0xFF003B70),
      Icons.storefront_rounded,
    );
  }
  if (n.contains('walmart')) {
    return _StoreBrandData(
      'Walmart',
      const Color(0xFF0071CE),
      Icons.storefront_rounded,
    );
  }
  if (n.contains('aliexpress') || n.contains('ali ')) {
    return _StoreBrandData(
      'AliExpress',
      const Color(0xFFE62E04),
      Icons.local_shipping_rounded,
    );
  }
  if (n.contains('trendyol')) {
    return _StoreBrandData(
      'Trendyol',
      const Color(0xFFF27A1A),
      Icons.shopping_bag_rounded,
    );
  }
  if (n.contains('hepsiburada')) {
    return _StoreBrandData(
      'Hepsiburada',
      const Color(0xFFFF6000),
      Icons.shopping_bag_rounded,
    );
  }
  if (n.contains('n11')) {
    return _StoreBrandData(
      'n11',
      const Color(0xFF923899),
      Icons.storefront_rounded,
    );
  }
  if (n.contains('gittigidiyor')) {
    return _StoreBrandData(
      'GittiGidiyor',
      const Color(0xFFFFC600),
      Icons.storefront_rounded,
    );
  }
  if (n.contains('vatan')) {
    return _StoreBrandData(
      'Vatan',
      const Color(0xFFE60000),
      Icons.storefront_rounded,
    );
  }
  if (n.contains('teknosa')) {
    return _StoreBrandData(
      'Teknosa',
      const Color(0xFFE30613),
      Icons.storefront_rounded,
    );
  }
  if (n.contains('mediamarkt')) {
    return _StoreBrandData(
      'MediaMarkt',
      const Color(0xFFE5121A),
      Icons.storefront_rounded,
    );
  }
  if (n.contains('newegg')) {
    return _StoreBrandData(
      'Newegg',
      const Color(0xFFF7A028),
      Icons.memory_rounded,
    );
  }
  if (n.contains('apple')) {
    return _StoreBrandData('Apple', const Color(0xFF000000), Icons.apple);
  }
  if (n.contains('samsung')) {
    return _StoreBrandData(
      'Samsung',
      const Color(0xFF1428A0),
      Icons.storefront_rounded,
    );
  }
  if (n.contains('google')) {
    return _StoreBrandData(
      'Google Store',
      const Color(0xFF4285F4),
      Icons.storefront_rounded,
    );
  }
  // Generic fallback — title-case the raw name.
  final display = rawName
      .split(RegExp(r'[\s_-]+'))
      .where((p) => p.isNotEmpty)
      .map((p) => p[0].toUpperCase() + p.substring(1).toLowerCase())
      .join(' ');
  return _StoreBrandData(
    display.isEmpty ? 'Store' : display,
    AppTheme.primaryBlue,
    Icons.storefront_rounded,
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
        color: brand.color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: brand.color.withValues(alpha: 0.2)),
      ),
      alignment: Alignment.center,
      child: Icon(brand.icon, size: 18, color: brand.color),
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

        final seen = <String>{};
        final unique = <ProductEntity>[];
        for (final v in all) {
          final key = v.configKey.isNotEmpty
              ? v.configKey
              : _CompactVariantChip._compactLabel(v);
          if (seen.contains(key)) {
            if (v.id == product.id) {
              unique.removeWhere(
                (u) =>
                    (u.configKey.isNotEmpty
                        ? u.configKey
                        : _CompactVariantChip._compactLabel(u)) ==
                    key,
              );
              unique.add(v);
            }
            continue;
          }
          seen.add(key);
          unique.add(v);
        }
        if (unique.length <= 1) return const SizedBox.shrink();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: 8),
              child: Text(
                Localizations.localeOf(context).languageCode == 'tr'
                    ? 'Mevcut Modeller'
                    : 'Available Models',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: context.textSecondary,
                  letterSpacing: 0.4,
                ),
              ),
            ),
            SizedBox(
              height: 30,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: unique.length,
                separatorBuilder: (_, _) => const SizedBox(width: 6),
                itemBuilder: (context, i) => _CompactVariantChip(
                  product: unique[i],
                  isSelected: unique[i].id == product.id,
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _CompactVariantChip extends StatelessWidget {
  final ProductEntity product;
  final bool isSelected;
  const _CompactVariantChip({required this.product, required this.isSelected});

  /// Compact label: just storage (+ RAM only when both differ).
  /// Examples: "256 GB", "512 GB / 8 GB RAM"
  static String _compactLabel(ProductEntity p) {
    final storage = _VariantChip._extractStorageOnly(p);
    final ram = _VariantChip._extractRam(p);
    if (ram != null && ram != storage) {
      return '$storage / $ram';
    }
    return storage;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.colorScheme.primary;
    final label = _compactLabel(product);
    return GestureDetector(
      onTap: isSelected
          ? null
          : () => context.replace('/product/${product.id}'),
      child: Container(
        height: 30,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: isSelected
              ? primary.withValues(alpha: 0.12)
              : context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(15),
          border: Border.all(
            color: isSelected
                ? primary.withValues(alpha: 0.45)
                : context.dividerColor,
            width: 1,
          ),
        ),
        child: Text(
          label,
          overflow: TextOverflow.ellipsis,
          maxLines: 1,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 11.5,
            fontWeight: FontWeight.w700,
            color: isSelected ? primary : context.textPrimary,
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
                        Icons.widgets_rounded,
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
