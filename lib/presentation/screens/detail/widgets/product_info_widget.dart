part of '../product_detail_screen.dart';

/// Product name card — shown below the hero header
// ignore: unused_element
class _ProductNameCard extends StatelessWidget {
  final ProductEntity product;
  final bool isDark;
  const _ProductNameCard({required this.product, required this.isDark});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.white.withValues(alpha: 0.06),
            blurRadius: 10,
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (product.brand != null && product.brand!.isNotEmpty) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                gradient: AppTheme.primaryGradient,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                product.brand!,
                style: const TextStyle(
                  fontSize: 12,
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const SizedBox(height: 10),
          ],
          Text(
            product.name,
            style: TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.bold,
              color: isDark ? context.textPrimary : context.textPrimary,
              letterSpacing: -0.3,
            ),
          ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// DESCRIPTION CARD
// ═══════════════════════════════════════════════════════════

class _DescCard extends StatefulWidget {
  final String text;
  final Color cardBg;
  final bool isDark;
  const _DescCard({
    required this.text,
    required this.cardBg,
    required this.isDark,
  });

  @override
  State<_DescCard> createState() => _DescCardState();
}

class _DescCardState extends State<_DescCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: widget.cardBg,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(color: Colors.white.withValues(alpha: 0.04), blurRadius: 8),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _CardHeader(
            icon: Icons.info_outline,
            label: context.l10n?.about ?? 'About',
            color: AppTheme.slate400,
          ),
          const SizedBox(height: 10),
          Text(
            widget.text,
            maxLines: _expanded ? null : 3,
            overflow: _expanded ? null : TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 14,
              height: 1.6,
              color: widget.isDark
                  ? context.textSecondary
                  : context.textSecondary,
            ),
          ),
          if (widget.text.length > 120)
            TextButton(
              onPressed: () => setState(() => _expanded = !_expanded),
              style: TextButton.styleFrom(padding: EdgeInsets.zero),
              child: Text(
                _expanded
                    ? (context.l10n?.showLess ?? 'Show less')
                    : (context.l10n?.readMore ?? 'Read more'),
              ),
            ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// NAME + BRAND + PRICE COMBINED SECTION
// ═══════════════════════════════════════════════════════════

class _TitlePriceSection extends ConsumerWidget {
  final ProductEntity product;
  const _TitlePriceSection({required this.product});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = Localizations.localeOf(context).languageCode;
    // PB'nin o dildeki adını AYNEN göster. localizeProductName runtime çevirisi
    // zaten doğru olan adı bozuyordu ("Apple iPhone 17 Pro" → "Apple The iphone
    // 17 Pro"). nameForLanguage PB'nin lokalize adını (de/en/tr) verir — kaynak o.
    final displayName = product.nameForLanguage(locale);

    // Ad altındaki fiyat rozeti KALDIRILDI (kullanıcı isteği): fiyat zaten
    // "Fiyatlar" sekmesinde gösteriliyor, burada tekrar etmesi gereksiz.
    return Container(
      width: double.infinity,
      color: context.backgroundColor,
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (product.brand != null && product.brand!.isNotEmpty)
            Text(
              product.brand!.toUpperCase(),
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: AppTheme.primaryBlue,
                letterSpacing: 1.4,
              ),
            ),
          const SizedBox(height: 4),
          Text(
            displayName,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: context.textPrimary,
              height: 1.25,
              letterSpacing: -0.2,
            ),
          ),
        ],
      ),
    );
  }
}
