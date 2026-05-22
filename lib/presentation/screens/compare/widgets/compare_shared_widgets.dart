part of '../compare_screen.dart';

// ─── Compare full-screen image viewer (theme-aware backdrop) ─────────────────
class _CompareFullScreenImageViewer extends StatefulWidget {
  final List<String> images;
  const _CompareFullScreenImageViewer({required this.images});

  @override
  State<_CompareFullScreenImageViewer> createState() =>
      _CompareFullScreenImageViewerState();
}

class _CompareFullScreenImageViewerState
    extends State<_CompareFullScreenImageViewer> {
  late final PageController _pageController = PageController();
  int _index = 0;

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Always white backdrop in both themes.
    const bgColor = Colors.white;
    const fgColor = Colors.black;
    final dpr = MediaQuery.maybeDevicePixelRatioOf(context) ?? 2.0;
    final screenW = MediaQuery.sizeOf(context).width;
    final cacheWidth = (screenW * dpr).round().clamp(1080, 2400);

    return Scaffold(
      backgroundColor: bgColor,
      body: Stack(
        children: [
          PageView.builder(
            controller: _pageController,
            itemCount: widget.images.length,
            onPageChanged: (i) => setState(() => _index = i),
            itemBuilder: (ctx, i) => GestureDetector(
              onTap: () => Navigator.of(context).pop(),
              behavior: HitTestBehavior.opaque,
              child: Center(
                child: CachedNetworkImage(
                  imageUrl: widget.images[i],
                  fit: BoxFit.contain,
                  memCacheWidth: cacheWidth,
                  maxWidthDiskCache: cacheWidth,
                  placeholder: (_, _) => Center(
                    child: CircularProgressIndicator(
                      color: fgColor.withValues(alpha: 0.6),
                      strokeWidth: 2,
                    ),
                  ),
                  errorWidget: (_, _, _) => Icon(
                    Icons.broken_image,
                    color: fgColor.withValues(alpha: 0.5),
                    size: 64,
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            top: MediaQuery.of(context).padding.top + 12,
            right: 16,
            child: GestureDetector(
              onTap: () => Navigator.of(context).pop(),
              child: Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: fgColor.withValues(alpha: 0.08),
                  shape: BoxShape.circle,
                  border: Border.all(color: fgColor.withValues(alpha: 0.15)),
                ),
                child: Icon(Icons.close, color: fgColor, size: 20),
              ),
            ),
          ),
          if (widget.images.length > 1)
            Positioned(
              bottom: MediaQuery.of(context).padding.bottom + 24,
              left: 0,
              right: 0,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(widget.images.length, (i) {
                  final isActive = i == _index;
                  return AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    width: isActive ? 24 : 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: isActive
                          ? fgColor
                          : fgColor.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(4),
                    ),
                  );
                }),
              ),
            ),
        ],
      ),
    );
  }
}

// ─── Aggregated store-links card for compare prices tab ─────────────────────
class _CompareStoreLinksCard extends StatelessWidget {
  final List<MapEntry<String, String>> entries;
  const _CompareStoreLinksCard({required this.entries});

  @override
  Widget build(BuildContext context) {
    final isTr = Localizations.localeOf(context).languageCode == 'tr';
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
          Row(
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
              Text(
                isTr ? 'Mağaza Fiyatları' : 'Store Prices',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: context.textPrimary,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ...entries.map(
            (e) => _CompareStoreRow(name: e.key, url: e.value),
          ),
        ],
      ),
    );
  }
}

class _CompareStoreRow extends StatelessWidget {
  final String name;
  final String url;
  const _CompareStoreRow({required this.name, required this.url});

  @override
  Widget build(BuildContext context) {
    final brand = _resolveCompareStoreBrand(name);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () async {
            final uri = Uri.tryParse(url);
            if (uri == null) return;
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
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: brand.$2.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: brand.$2.withValues(alpha: 0.2)),
                  ),
                  child: Icon(brand.$3, size: 17, color: brand.$2),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    brand.$1,
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

(String, Color, IconData) _resolveCompareStoreBrand(String rawName) {
  final n = rawName.toLowerCase().trim();
  if (n.contains('amazon')) return ('Amazon', const Color(0xFFFF9900), Icons.shopping_cart_rounded);
  if (n.contains('ebay')) return ('eBay', const Color(0xFFE53238), Icons.gavel_rounded);
  if (n.contains('bestbuy') || n.contains('best buy')) return ('Best Buy', const Color(0xFF003B70), Icons.storefront_rounded);
  if (n.contains('walmart')) return ('Walmart', const Color(0xFF0071CE), Icons.storefront_rounded);
  if (n.contains('aliexpress')) return ('AliExpress', const Color(0xFFE62E04), Icons.local_shipping_rounded);
  if (n.contains('trendyol')) return ('Trendyol', const Color(0xFFF27A1A), Icons.shopping_bag_rounded);
  if (n.contains('hepsiburada')) return ('Hepsiburada', const Color(0xFFFF6000), Icons.shopping_bag_rounded);
  if (n.contains('n11')) return ('n11', const Color(0xFF923899), Icons.storefront_rounded);
  if (n.contains('vatan')) return ('Vatan', const Color(0xFFE60000), Icons.storefront_rounded);
  if (n.contains('teknosa')) return ('Teknosa', const Color(0xFFE30613), Icons.storefront_rounded);
  if (n.contains('mediamarkt')) return ('MediaMarkt', const Color(0xFFE5121A), Icons.storefront_rounded);
  if (n.contains('newegg')) return ('Newegg', const Color(0xFFF7A028), Icons.memory_rounded);
  if (n.contains('apple')) return ('Apple', Colors.black, Icons.apple);
  if (n.contains('samsung')) return ('Samsung', const Color(0xFF1428A0), Icons.storefront_rounded);
  if (n.contains('google')) return ('Google Store', const Color(0xFF4285F4), Icons.storefront_rounded);
  final display = rawName
      .split(RegExp(r'[\s_-]+'))
      .where((p) => p.isNotEmpty)
      .map((p) => p[0].toUpperCase() + p.substring(1).toLowerCase())
      .join(' ');
  return (display.isEmpty ? 'Store' : display, AppTheme.primaryBlue, Icons.storefront_rounded);
}

// ─── Compare image match-score badge (local algorithm) ─────────────────────
class _CompareMatchBadge extends ConsumerWidget {
  final ProductEntity product;
  const _CompareMatchBadge({required this.product});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final score = ref.watch(localMatchScoreProvider(product));
    if (score == null) return const SizedBox.shrink();
    final color = score >= 80
        ? AppTheme.scoreExcellent
        : score >= 60
            ? AppTheme.scoreAverage
            : score >= 40
                ? AppTheme.orange500
                : AppTheme.error;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.4)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 4,
            offset: const Offset(0, 1),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.person_outline, size: 9, color: color),
          const SizedBox(width: 2),
          Text(
            '$score',
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

// ─── Compare image tech-score badge with tap tooltip ────────────────────────
class _CompareScoreBadge extends StatefulWidget {
  final int score;
  final Color color;
  const _CompareScoreBadge({required this.score, required this.color});

  @override
  State<_CompareScoreBadge> createState() => _CompareScoreBadgeState();
}

class _CompareScoreBadgeState extends State<_CompareScoreBadge> {
  final _key = GlobalKey();
  OverlayEntry? _tooltipEntry;

  @override
  void dispose() {
    _removeTooltip();
    super.dispose();
  }

  void _removeTooltip() {
    _tooltipEntry?.remove();
    _tooltipEntry = null;
  }

  void _showTooltip() {
    _removeTooltip();
    final box = _key.currentContext?.findRenderObject() as RenderBox?;
    if (box == null) return;
    final offset = box.localToGlobal(Offset.zero);
    final size = box.size;
    final isTr = Localizations.localeOf(context).languageCode == 'tr';
    final title = isTr ? 'Teknik Skor' : 'Tech Score';
    final explanation = isTr
        ? 'Aynı kategorideki ürünlere göre normalize edilmiş teknik özelliklerin (yonga, ekran, pil, kamera vb.) toplam puanı.'
        : 'A combined score of the product\'s technical specs (chipset, display, battery, camera, etc.) normalized against products in the same category.';
    final screenWidth = MediaQuery.of(context).size.width;
    const bubbleWidth = 240.0;
    final rawLeft = offset.dx + size.width / 2 - bubbleWidth / 2;
    final left = rawLeft.clamp(8.0, screenWidth - bubbleWidth - 8.0);
    final top = offset.dy + size.height + 6;

    _tooltipEntry = OverlayEntry(
      builder: (ctx) => Stack(
        children: [
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.translucent,
              onTap: _removeTooltip,
            ),
          ),
          Positioned(
            left: left,
            top: top,
            width: bubbleWidth,
            child: Material(
              color: Colors.transparent,
              child: Container(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
                decoration: BoxDecoration(
                  color: Theme.of(context).brightness == Brightness.dark
                      ? const Color(0xFF1A1F2E)
                      : Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: widget.color.withValues(alpha: 0.3),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.18),
                      blurRadius: 18,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Icon(
                          Icons.memory_outlined,
                          size: 14,
                          color: widget.color,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          title,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: widget.color,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      explanation,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11.5,
                        height: 1.4,
                        color: Theme.of(context).brightness == Brightness.dark
                            ? Colors.white70
                            : const Color(0xFF475569),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
    Overlay.of(context).insert(_tooltipEntry!);
    Future.delayed(const Duration(seconds: 5), () {
      if (mounted) _removeTooltip();
    });
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      key: _key,
      onTap: _showTooltip,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.92),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: widget.color.withValues(alpha: 0.4)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.08),
              blurRadius: 4,
              offset: const Offset(0, 1),
            ),
          ],
        ),
        child: Text(
          '${widget.score}',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 10,
            fontWeight: FontWeight.w800,
            color: widget.color,
          ),
        ),
      ),
    );
  }
}

// ─── Lightweight reviews card used inside the compare reviews sheet ─────────
class _CompareUserReviewsCard extends ConsumerWidget {
  final ProductEntity product;
  const _CompareUserReviewsCard({required this.product});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reviewsAsync = ref.watch(productReviewsProvider(product.id));
    final isTr = Localizations.localeOf(context).languageCode == 'tr';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: context.dividerColor),
      ),
      child: reviewsAsync.when(
        loading: () => const Center(
          child: Padding(
            padding: EdgeInsets.all(20),
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
        error: (_, _) => Text(
          isTr ? 'Yorumlar yüklenemedi' : 'Could not load reviews',
          style: GoogleFonts.plusJakartaSans(fontSize: 13),
        ),
        data: (reviews) {
          if (reviews.isEmpty) {
            return Column(
              children: [
                Icon(
                  Icons.rate_review_outlined,
                  size: 32,
                  color: context.textTertiaryColor,
                ),
                const SizedBox(height: 8),
                Text(
                  isTr ? 'Henüz yorum yok' : 'No reviews yet',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: context.textPrimary,
                  ),
                ),
                const SizedBox(height: 12),
                GestureDetector(
                  onTap: () => context.push('/product/${product.id}'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [AppTheme.primaryBlue, AppTheme.neonPurple],
                      ),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.edit_note_rounded,
                          size: 16,
                          color: Colors.white,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          isTr ? 'Yorum yaz' : 'Write a review',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            );
          }
          final sorted = List<ReviewModel>.from(reviews)
            ..sort((a, b) {
              final scoreA = a.likedBy.length - a.dislikedBy.length;
              final scoreB = b.likedBy.length - b.dislikedBy.length;
              return scoreB.compareTo(scoreA);
            });

          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      '${reviews.length} ${isTr ? 'yorum' : 'reviews'}',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: context.textSecondary,
                      ),
                    ),
                  ),
                  GestureDetector(
                    onTap: () => context.push('/product/${product.id}'),
                    child: Text(
                      isTr ? 'Tümünü gör' : 'See all',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.brandBlue,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              ...sorted.take(3).map((r) => _CompareReviewPreviewTile(review: r)),
              const SizedBox(height: 8),
              Center(
                child: GestureDetector(
                  onTap: () => context.push('/product/${product.id}'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [AppTheme.primaryBlue, AppTheme.neonPurple],
                      ),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.edit_note_rounded,
                          size: 16,
                          color: Colors.white,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          isTr ? 'Yorum yaz' : 'Write a review',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _CompareReviewPreviewTile extends StatelessWidget {
  final ReviewModel review;
  const _CompareReviewPreviewTile({required this.review});

  @override
  Widget build(BuildContext context) {
    final diff = DateTime.now().difference(review.createdAt);
    String timeAgo;
    if (diff.inDays > 30) {
      timeAgo = '${diff.inDays ~/ 30}mo';
    } else if (diff.inDays > 0) {
      timeAgo = '${diff.inDays}d';
    } else if (diff.inHours > 0) {
      timeAgo = '${diff.inHours}h';
    } else {
      timeAgo = 'just now';
    }
    final name = review.authorDisplayName.trim().isNotEmpty
        ? review.authorDisplayName
        : 'User';
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.surfaceColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: context.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 14,
                backgroundColor: AppTheme.brandBlue.withValues(alpha: 0.15),
                child: Text(
                  name.isNotEmpty ? name[0].toUpperCase() : '?',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: AppTheme.brandBlue,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  name,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: context.textPrimary,
                  ),
                ),
              ),
              Text(
                timeAgo,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 11,
                  color: context.textTertiaryColor,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            review.text,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 13,
              height: 1.4,
              color: context.textPrimary,
            ),
          ),
          if (review.likedBy.isNotEmpty || review.dislikedBy.isNotEmpty) ...[
            const SizedBox(height: 6),
            Row(
              children: [
                Icon(
                  Icons.thumb_up_alt_outlined,
                  size: 12,
                  color: context.textTertiaryColor,
                ),
                const SizedBox(width: 3),
                Text(
                  '${review.likedBy.length}',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 11,
                    color: context.textTertiaryColor,
                  ),
                ),
                const SizedBox(width: 10),
                Icon(
                  Icons.thumb_down_alt_outlined,
                  size: 12,
                  color: context.textTertiaryColor,
                ),
                const SizedBox(width: 3),
                Text(
                  '${review.dislikedBy.length}',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 11,
                    color: context.textTertiaryColor,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

// ─── Compare Reviews sheet — product picker + reviews list ────────────────────
class _CompareReviewsSheet extends StatefulWidget {
  final List<ProductEntity> products;
  const _CompareReviewsSheet({required this.products});

  @override
  State<_CompareReviewsSheet> createState() => _CompareReviewsSheetState();
}

class _CompareReviewsSheetState extends State<_CompareReviewsSheet> {
  late ProductEntity _selectedProduct;

  @override
  void initState() {
    super.initState();
    _selectedProduct = widget.products.first;
  }

  @override
  Widget build(BuildContext context) {
    final isTr = Localizations.localeOf(context).languageCode == 'tr';
    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (ctx, scrollController) => Container(
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          children: [
            const SizedBox(height: 10),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: context.dividerColor,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 12, 12),
              child: Row(
                children: [
                  Icon(
                    Icons.mode_comment_outlined,
                    size: 20,
                    color: context.textPrimary,
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      isTr ? 'Yorumlar' : 'Reviews',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: context.textPrimary,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: Icon(
                      Icons.close_rounded,
                      color: context.textPrimary,
                    ),
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
            // Product picker chips (one per compared product)
            SizedBox(
              height: 40,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: widget.products.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (_, i) {
                  final p = widget.products[i];
                  final selected = p.id == _selectedProduct.id;
                  return GestureDetector(
                    onTap: () => setState(() => _selectedProduct = p),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 8,
                      ),
                      decoration: BoxDecoration(
                        color: selected
                            ? AppTheme.brandBlue.withValues(alpha: 0.15)
                            : context.surfaceVariantColor,
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                          color: selected
                              ? AppTheme.brandBlue.withValues(alpha: 0.5)
                              : context.dividerColor,
                        ),
                      ),
                      child: Text(
                        p.name,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12,
                          fontWeight: selected
                              ? FontWeight.w700
                              : FontWeight.w500,
                          color: selected
                              ? AppTheme.brandBlue
                              : context.textPrimary,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: 12),
            Divider(height: 1, color: context.dividerColor),
            Expanded(
              child: ListView(
                key: ValueKey(_selectedProduct.id),
                controller: scrollController,
                padding: EdgeInsets.fromLTRB(
                  16,
                  16,
                  16,
                  MediaQuery.of(context).padding.bottom + 16,
                ),
                children: [
                  _CompareUserReviewsCard(product: _selectedProduct),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Data class for a single spec comparison row.
class _CompareSpecRow {
  final String label;
  final List<String> values;
  const _CompareSpecRow({required this.label, required this.values});
}

/// Keeps TabBarView children alive across tab switches.
class _KeepAliveTab extends StatefulWidget {
  final Widget child;
  const _KeepAliveTab({required this.child});
  @override
  State<_KeepAliveTab> createState() => _KeepAliveTabState();
}

class _KeepAliveTabState extends State<_KeepAliveTab>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;
  @override
  Widget build(BuildContext context) {
    super.build(context);
    return widget.child;
  }
}

// ─── Tab Bar Delegate ─────────────────────────────────────────────────────────

class _ShimmerBlock extends StatefulWidget {
  final double width;
  final double height;
  const _ShimmerBlock({required this.width, required this.height});
  @override
  State<_ShimmerBlock> createState() => _ShimmerBlockState();
}

class _ShimmerBlockState extends State<_ShimmerBlock>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (_, _) => Container(
        width: widget.width,
        height: widget.height,
        margin: const EdgeInsets.only(bottom: 2),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(6),
          gradient: LinearGradient(
            begin: Alignment(-1.0 + 2.0 * _ctrl.value, 0),
            end: Alignment(-1.0 + 2.0 * _ctrl.value + 1, 0),
            colors: [
              Colors.grey.withValues(alpha: 0.12),
              Colors.grey.withValues(alpha: 0.24),
              Colors.grey.withValues(alpha: 0.12),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── In-App YouTube Comparison Videos (uses YouTubeService) ───


