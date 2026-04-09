part of '../product_detail_screen.dart';

// ═══════════════════════════════════════════════════════════
// HERO HEADER
// ═══════════════════════════════════════════════════════════

class _HeroHeader extends StatefulWidget {
  final ProductEntity product;
  const _HeroHeader({required this.product});

  @override
  State<_HeroHeader> createState() => _HeroHeaderState();
}

class _HeroHeaderState extends State<_HeroHeader> {
  int _selectedIndex = 0;

  @override
  Widget build(BuildContext context) {
    final allImages = widget.product.allImages;

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final imageBg = isDark ? Colors.white : Colors.white;

    return SliverToBoxAdapter(
      child: Container(
        height: 280,
        decoration: BoxDecoration(
          color: imageBg,
          gradient: isDark ? null : LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              const Color(0xFFF8FAFC),
              Colors.white,
            ],
          ),
        ),
        child: Stack(
          children: [
            // ── Row: thumbnail strip (left) + main image (right) ──
            Positioned.fill(
              child: Row(
                children: [
                  // LEFT — vertical thumbnail strip
                  if (allImages.length > 1)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(12, 12, 8, 12),
                      child: SingleChildScrollView(
                        child: Column(
                          children: List.generate(allImages.length.clamp(0, 8), (i) {
                            final isSelected = _selectedIndex == i;
                            return GestureDetector(
                              onTap: () => setState(() => _selectedIndex = i),
                              child: AnimatedContainer(
                                duration: const Duration(milliseconds: 200),
                                margin: const EdgeInsets.only(bottom: 8),
                                width: 56,
                                height: 56,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: isSelected
                                        ? AppTheme.primaryBlue
                                        : context.textTertiaryColor,
                                    width: isSelected ? 2 : 1,
                                  ),
                                  color: isSelected
                                      ? AppTheme.primaryBlue.withValues(alpha: 0.06)
                                      : imageBg,
                                  boxShadow: isSelected
                                      ? [BoxShadow(color: AppTheme.primaryBlue.withValues(alpha: 0.2), blurRadius: 6)]
                                      : null,
                                ),
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(9),
                                  child: CachedNetworkImage(
                                    imageUrl: allImages[i],
                                    fit: BoxFit.contain,
                                    placeholder: (_, __) => const Center(
                                      child: SizedBox(
                                        width: 16, height: 16,
                                        child: CircularProgressIndicator(strokeWidth: 1.5, color: AppTheme.slate600),
                                      ),
                                    ),
                                    errorWidget: (_, __, ___) => const Icon(Icons.image_not_supported_outlined, color: AppTheme.slate600, size: 20),
                                  ),
                                ),
                              ),
                            );
                          }),
                        ),
                      ),
                    ),

                  // RIGHT — main selected image
                  Expanded(
                    child: GestureDetector(
                      onTap: allImages.isNotEmpty ? () {
                        Navigator.of(context).push(PageRouteBuilder(
                          opaque: false,
                          barrierColor: Colors.black87,
                          pageBuilder: (context, animation, secondaryAnimation) {
                            return _FullScreenImageViewer(
                              images: allImages,
                              initialIndex: _selectedIndex,
                              animation: animation,
                            );
                          },
                          transitionsBuilder: (context, animation, secondaryAnimation, child) {
                            return FadeTransition(opacity: animation, child: child);
                          },
                        ));
                      } : null,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(4, 16, 16, 16),
                        child: allImages.isEmpty
                            ? Center(child: _CategoryEmoji(cat: widget.product.categoryId))
                            : Hero(
                                tag: 'product_image_${widget.product.id}_$_selectedIndex',
                                child: AnimatedSwitcher(
                                  duration: const Duration(milliseconds: 220),
                                  transitionBuilder: (child, anim) =>
                                      FadeTransition(opacity: anim, child: child),
                                  child: CachedNetworkImage(
                                    key: ValueKey(_selectedIndex),
                                    imageUrl: allImages[_selectedIndex],
                                    fit: BoxFit.contain,
                                    placeholder: (_, __) => const Center(
                                      child: CircularProgressIndicator(color: AppTheme.slate600, strokeWidth: 2),
                                    ),
                                    errorWidget: (_, __, ___) =>
                                        _CategoryEmoji(cat: widget.product.categoryId),
                                  ),
                                ),
                              ),
                      ),
                    ),
                  ),
                ],
              ),
            ),

          ],
        ),
      ),
    );
  }
}

class _HeroScoreBadge extends StatelessWidget {
  final int score;
  const _HeroScoreBadge({required this.score});

  @override
  Widget build(BuildContext context) {
    final bool isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: 50,
      height: 50,
      decoration: BoxDecoration(
        color: context.surfaceColor,
        shape: BoxShape.circle,
        boxShadow: [BoxShadow(color: (isDark ? Colors.black : Colors.black12).withValues(alpha: isDark ? 0.3 : 0.06), blurRadius: 8, offset: const Offset(0, 2))],
        border: Border.all(color: AppTheme.primaryBlue, width: 2.5),
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox(
            width: 44,
            height: 44,
            child: CircularProgressIndicator(
              value: score / 100,
              strokeWidth: 3,
              backgroundColor: AppTheme.primaryBlue.withValues(alpha: 0.15),
              valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.primaryBlue),
            ),
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '$score',
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: AppTheme.primaryBlue, height: 1.0),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
