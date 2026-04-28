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
    final isInCompare = ref
        .watch(comparisonStateProvider)
        .selectedProductIds
        .contains(product.id);

    return GestureDetector(
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
                  style: GoogleFonts.plusJakartaSans(
                      fontSize: 13, fontWeight: FontWeight.w600, color: Colors.white)),
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
          if (newIds.length >= 2) {
            // Tüm yığını tek hedefe al: çift /compare push + yinelenen page key hatalarını önle
            context.go(AppRoutes.compare);
          } else {
            _showTooltip('${newIds.length}/4');
          }
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
              color: isInCompare
                  ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.5)
                  : context.dividerColor,
              width: 1,
            ),
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
    );
  }
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

// ignore: unused_element
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
    // ignore: unused_element_parameter
    this.isActive = false,
    // ignore: unused_element_parameter
    this.gradient,
    // ignore: unused_element_parameter
    this.borderColor,
    // ignore: unused_element_parameter
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
                if (!context.mounted) return;
                final messenger = ScaffoldMessenger.of(context);
                if (!wasFav && !result) {
                  // Adding was rejected → collection limit reached.
                  messenger.showSnackBar(
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
                  messenger.showSnackBar(
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
                if (!context.mounted) return;
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
