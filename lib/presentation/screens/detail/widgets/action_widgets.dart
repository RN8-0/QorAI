part of '../product_detail_screen.dart';

// ── Compare Tooltip Button (replaces SnackBar with positioned bubble) ──
class _CompareTooltipButton extends ConsumerStatefulWidget {
  final ProductEntity product;
  const _CompareTooltipButton({required this.product});

  @override
  ConsumerState<_CompareTooltipButton> createState() => _CompareTooltipButtonState();
}

class _CompareTooltipButtonState extends ConsumerState<_CompareTooltipButton>
    with SingleTickerProviderStateMixin {
  final _buttonKey = GlobalKey();
  OverlayEntry? _tooltipEntry;
  late AnimationController _fadeController;

  @override
  void initState() {
    super.initState();
    _fadeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );
  }

  @override
  void dispose() {
    _removeTooltip();
    _fadeController.dispose();
    super.dispose();
  }

  void _removeTooltip() {
    _tooltipEntry?.remove();
    _tooltipEntry = null;
  }

  void _showTooltip(String text) {
    _removeTooltip();

    final renderBox = _buttonKey.currentContext?.findRenderObject() as RenderBox?;
    if (renderBox == null) return;

    final offset = renderBox.localToGlobal(Offset.zero);
    final size = renderBox.size;
    final primaryColor = Theme.of(context).colorScheme.primary;

    _fadeController.forward(from: 0);

    _tooltipEntry = OverlayEntry(
      builder: (ctx) => Positioned(
        top: offset.dy + size.height + 4,
        left: offset.dx + (size.width / 2) - 30,
        child: FadeTransition(
          opacity: _fadeController,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Triangle pointing up
              CustomPaint(
                size: const Size(12, 6),
                painter: _TrianglePainter(color: primaryColor),
              ),
              // Bubble
              Container(
                constraints: const BoxConstraints(maxWidth: 80, maxHeight: 32),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: primaryColor,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  text,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );

    Overlay.of(context).insert(_tooltipEntry!);

    Future.delayed(const Duration(milliseconds: 1500), () {
      if (_tooltipEntry != null && mounted) {
        _fadeController.reverse().then((_) {
          if (mounted) _removeTooltip();
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final product = widget.product;
    final compare = ref.watch(comparisonStateProvider);
    final isInCompare = compare.selectedProductIds.contains(product.id);
    final poolSize = compare.selectedProductIds.length;
    final poolCategoryMatch = compare.poolCategory == null ||
        compare.poolCategory == product.category;
    final canOpenCompare = poolSize >= 2 &&
        poolSize <= 4 &&
        poolCategoryMatch;
    final poolReady = canOpenCompare;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          key: _buttonKey,
          onTap: () {
            // Require login
            final authState = ref.read(authStateProvider);
            final isLoggedIn = authState.valueOrNull != null;
            if (!isLoggedIn) {
              ScaffoldMessenger.of(context).hideCurrentSnackBar();
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                content: Row(children: [
                  const Icon(Icons.lock_outline, color: Colors.white, size: 18),
                  const SizedBox(width: 8),
                  Text(context.l10n?.signInToCompare ?? 'Sign in to compare products',
                      style: GoogleFonts.plusJakartaSans(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white)),
                ]),
                backgroundColor: Theme.of(context).colorScheme.primary,
                behavior: SnackBarBehavior.floating,
                margin: const EdgeInsets.fromLTRB(16, 0, 16, 80),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                action: SnackBarAction(
                  label: context.l10n?.signIn ?? 'Sign In',
                  textColor: Colors.white,
                  onPressed: () => context.push(AppRoutes.login),
                ),
              ));
              return;
            }

            final isAlreadyIn = ref
                .read(comparisonStateProvider)
                .selectedProductIds
                .contains(product.id);

            ref
                .read(comparisonStateProvider.notifier)
                .toggleProduct(product.id, productCategory: product.category);
            HapticFeedback.lightImpact();

            if (!isAlreadyIn) {
              final newIds = ref.read(comparisonStateProvider).selectedProductIds;
              _showTooltip('${newIds.length}/4');
            }
          },
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 128),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              decoration: BoxDecoration(
                color: isInCompare
                    ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.15)
                    : context.surfaceVariantColor,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: poolReady
                      ? Theme.of(context).colorScheme.primary
                      : (isInCompare
                          ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.5)
                          : context.dividerColor),
                  width: poolReady ? 2 : 1,
                ),
                boxShadow: poolReady
                    ? [
                        BoxShadow(
                          color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.25),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ]
                    : null,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    isInCompare ? Icons.check_circle : Icons.compare_arrows_rounded,
                    color: isInCompare
                        ? Theme.of(context).colorScheme.primary
                        : context.textPrimary,
                    size: 16,
                  ),
                  const SizedBox(width: 5),
                  Flexible(
                    child: Text(
                      isInCompare
                          ? (context.l10n?.added ?? 'Added')
                          : (context.l10n?.compareAction ?? 'Compare'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: isInCompare
                            ? Theme.of(context).colorScheme.primary
                            : context.textPrimary,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        if (poolSize > 0 && poolCategoryMatch) ...[
          const SizedBox(width: 6),
          _ComparePoolStrip(product: product),
        ],
        if (canOpenCompare) ...[
          const SizedBox(width: 6),
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.2),
              shape: BoxShape.circle,
              border: Border.all(
                color: Theme.of(context).colorScheme.primary,
                width: 2,
              ),
              boxShadow: AppTheme.cardShadow,
            ),
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                onTap: () {
                  HapticFeedback.selectionClick();
                  context.push(AppRoutes.compare);
                },
                customBorder: const CircleBorder(),
                child: Center(
                  child: Icon(
                    Icons.view_column_rounded,
                    size: 18,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

/// Karşılaştırma havuzundaki (aynı kategori) ürünler: küçük önizleme kutuları
class _ComparePoolStrip extends ConsumerWidget {
  final ProductEntity product;
  const _ComparePoolStrip({required this.product});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final comp = ref.watch(comparisonStateProvider);
    final ids = comp.selectedProductIds;
    if (ids.isEmpty) return const SizedBox.shrink();

    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 128, minHeight: 32),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var i = 0; i < ids.length; i++) ...[
              if (i > 0) const SizedBox(width: 4),
              _ComparePoolSlotTile(
                key: ValueKey('compare_pool_${ids[i]}'),
                productId: ids[i],
                isCurrent: ids[i] == product.id,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ComparePoolSlotTile extends ConsumerWidget {
  final String productId;
  final bool isCurrent;
  const _ComparePoolSlotTile({
    super.key,
    required this.productId,
    required this.isCurrent,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(productDetailProvider(productId));
    return async.when(
      data: (r) {
        return r.when(
          success: (p) {
            final url = p.imageUrl;
            if (url == null || url.isEmpty) {
              return _poolSlotPlaceholder(context, isCurrent);
            }
            return Semantics(
              button: true,
              label: 'Karşılaştırmadan kaldır',
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  onTap: () {
                    HapticFeedback.selectionClick();
                    ref
                        .read(comparisonStateProvider.notifier)
                        .toggleProduct(productId);
                  },
                  borderRadius: BorderRadius.circular(6),
                  child: Container(
                    width: 30,
                    height: 32,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(
                        color: isCurrent
                            ? Theme.of(context).colorScheme.primary
                            : context.dividerColor,
                        width: isCurrent ? 2 : 1,
                      ),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: CachedNetworkImage(
                        imageUrl: url,
                        fit: BoxFit.cover,
                        memCacheWidth: 90,
                        placeholder: (c, _) => ColoredBox(
                          color: context.surfaceVariantColor,
                        ),
                        errorWidget: (c, errUrl, err) => _poolSlotPlaceholder(
                          context,
                          isCurrent,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            );
          },
          failure: (_) => _poolSlotPlaceholder(context, isCurrent),
        );
      },
      loading: () => Container(
        width: 30,
        height: 32,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: context.dividerColor, width: 1),
        ),
        child: const SizedBox(
          width: 14,
          height: 14,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
      error: (err, st) => _poolSlotPlaceholder(context, isCurrent),
    );
  }
}

Widget _poolSlotPlaceholder(BuildContext context, bool isCurrent) {
  return Container(
    width: 30,
    height: 32,
    alignment: Alignment.center,
    decoration: BoxDecoration(
      color: context.surfaceVariantColor,
      borderRadius: BorderRadius.circular(6),
      border: Border.all(
        color: isCurrent
            ? Theme.of(context).colorScheme.primary
            : context.dividerColor,
        width: isCurrent ? 2 : 1,
      ),
    ),
    child: Icon(
      Icons.shopping_bag_outlined,
      size: 12,
      color: context.textTertiaryColor,
    ),
  );
}

/// Triangle painter for tooltip arrow
class _TrianglePainter extends CustomPainter {
  final Color color;
  _TrianglePainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color;
    final path = Path()
      ..moveTo(size.width / 2, 0)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _QuickActionBtn extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool isActive;
  final Gradient? gradient;
  final Color? borderColor;
  final Color? textColor;
  final VoidCallback onTap;

  const _QuickActionBtn({
    required this.icon,
    required this.label,
    required this.onTap,
    this.isActive = false,
    this.gradient,
    this.borderColor,
    this.textColor,
  });

  @override
  Widget build(BuildContext context) {
    final fg = textColor ?? (isActive ? AppTheme.primaryBlue : AppTheme.slate600);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 44,
        decoration: BoxDecoration(
          gradient: gradient,
          color: gradient == null
              ? (isActive ? AppTheme.primaryBlue.withValues(alpha: 0.08) : context.surfaceVariantColor)
              : null,
          borderRadius: BorderRadius.circular(12),
          border: gradient == null
              ? Border.all(color: borderColor ?? (isActive ? AppTheme.primaryBlue : context.dividerColor), width: 1.5)
              : null,
          boxShadow: [BoxShadow(
            color: (gradient != null ? AppTheme.primaryBlue : Colors.black).withValues(alpha: gradient != null ? 0.2 : 0.04),
            blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: gradient != null ? context.textPrimary : fg, size: 17),
            const SizedBox(width: 5),
            Text(label, style: TextStyle(
              fontSize: 12, fontWeight: FontWeight.w700,
              color: gradient != null ? Colors.white : fg)),
          ],
        ),
      ),
    );
  }
}

// ── Price Comparison Sheet ───────────────────────────────────────────
void _showPriceComparison(BuildContext context, ProductEntity product, {bool isPremium = false}) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (ctx) => _PriceComparisonSheet(product: product, isPremium: isPremium),
  );
}

// ═══════════════════════════════════════════════════════════
// FAVORITE BUTTON
// ═══════════════════════════════════════════════════════════

class _FavoriteButton extends ConsumerStatefulWidget {
  final String productId;
  final bool isDark;
  const _FavoriteButton({required this.productId, required this.isDark});

  @override
  ConsumerState<_FavoriteButton> createState() => _FavoriteButtonState();
}

class _FavoriteButtonState extends ConsumerState<_FavoriteButton> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  bool _isToggling = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Watch the profile so icon state tracks PB realtime updates.
    final userAsync = ref.watch(userProfileProvider);
    final isFav =
        userAsync.valueOrNull?.favorites.contains(widget.productId) ?? false;
    return IconButton(
      icon: AnimatedSwitcher(
        duration: const Duration(milliseconds: 200),
        transitionBuilder: (child, animation) =>
            ScaleTransition(scale: animation, child: child),
        child: Icon(
          isFav ? Icons.favorite : Icons.favorite_border,
          key: ValueKey(isFav),
          color: isFav ? Colors.redAccent : null,
        ),
      ),
      onPressed: _isToggling
          ? null
          : () async {
              setState(() => _isToggling = true);
              try {
                final wasFav = isFavorite(ref, widget.productId);
                final result = await toggleFavorite(ref, widget.productId);
                if (!mounted) return;
                if (!wasFav && !result) {
                  // Adding was rejected → collection limit reached.
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                        'Collection limit reached: ${AppConstants.freeCollectionLimit} items. Go Premium!',
                      ),
                      action: SnackBarAction(
                        label: 'Premium',
                        onPressed: () => showPaywallSheet(context),
                      ),
                    ),
                  );
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      duration: const Duration(milliseconds: 1200),
                      backgroundColor: result
                          ? Colors.redAccent.withValues(alpha: 0.9)
                          : Colors.grey.shade700,
                      content: Row(
                        children: [
                          Icon(
                            result
                                ? Icons.favorite_rounded
                                : Icons.favorite_border_rounded,
                            color: Colors.white,
                            size: 18,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            result ? 'Added to favorites' : 'Removed from favorites',
                          ),
                        ],
                      ),
                    ),
                  );
                }
              } catch (e) {
                if (!mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    backgroundColor: Colors.redAccent,
                    content: Text('Could not update favorites: $e'),
                  ),
                );
              }
              if (mounted) setState(() => _isToggling = false);
            },
    );
  }
}
