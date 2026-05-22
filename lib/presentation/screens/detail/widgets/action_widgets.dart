part of '../product_detail_screen.dart';

// ── Compare pool button + adjacent "Compare now" button (icon-only) ─────────
class _CompareTooltipButton extends ConsumerStatefulWidget {
  final ProductEntity product;
  const _CompareTooltipButton({required this.product});

  @override
  ConsumerState<_CompareTooltipButton> createState() =>
      _CompareTooltipButtonState();
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
      duration: const Duration(milliseconds: 220),
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

  void _showActionTooltip({required bool added, required int count}) {
    _removeTooltip();
    final box = _buttonKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null) return;
    final offset = box.localToGlobal(Offset.zero);
    final size = box.size;
    final isTr = Localizations.localeOf(context).languageCode == 'tr';
    final label = added
        ? (isTr ? 'Eklendi $count/4' : 'Added $count/4')
        : (isTr ? 'Çıkarıldı $count/4' : 'Removed $count/4');
    final color = Theme.of(context).colorScheme.primary;
    _fadeController.forward(from: 0);

    _tooltipEntry = OverlayEntry(
      builder: (ctx) => Positioned(
        top: offset.dy + size.height + 6,
        left: offset.dx + (size.width / 2) - 50,
        child: IgnorePointer(
          child: FadeTransition(
            opacity: _fadeController,
            child: Material(
              color: Colors.transparent,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 6,
                ),
                constraints: const BoxConstraints(minWidth: 100),
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: [
                    BoxShadow(
                      color: color.withValues(alpha: 0.3),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      added
                          ? Icons.check_circle_outline_rounded
                          : Icons.remove_circle_outline_rounded,
                      size: 14,
                      color: Colors.white,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      label,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
    Overlay.of(context).insert(_tooltipEntry!);
    Future.delayed(const Duration(milliseconds: 1500), () {
      if (mounted) {
        _fadeController.reverse().then((_) {
          if (mounted) _removeTooltip();
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final product = widget.product;
    final compareState = ref.watch(comparisonStateProvider);
    final isInCompare = compareState.selectedProductIds.contains(product.id);
    final poolCount = compareState.selectedProductIds.length;
    final primary = Theme.of(context).colorScheme.primary;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        // ── + Add/Remove this product to the pool ────────────────────────
        GestureDetector(
          key: _buttonKey,
          onTap: () {
            final authState = ref.read(authStateProvider);
            final isLoggedIn = authState.valueOrNull != null;
            if (!isLoggedIn) {
              ScaffoldMessenger.of(context).hideCurrentSnackBar();
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                content: Row(children: [
                  const Icon(Icons.lock_outline, color: Colors.white, size: 18),
                  const SizedBox(width: 8),
                  Text(
                    context.l10n?.signInToCompare ??
                        'Sign in to compare products',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ]),
                backgroundColor: primary,
                behavior: SnackBarBehavior.floating,
                margin: const EdgeInsets.fromLTRB(16, 0, 16, 80),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
                action: SnackBarAction(
                  label: context.l10n?.signIn ?? 'Sign In',
                  textColor: Colors.white,
                  onPressed: () => context.push(AppRoutes.login),
                ),
              ));
              return;
            }

            final wasIn = isInCompare;
            ref
                .read(comparisonStateProvider.notifier)
                .toggleProduct(product.id, productCategory: product.category);
            HapticFeedback.lightImpact();
            final newCount = ref
                .read(comparisonStateProvider)
                .selectedProductIds
                .length;
            _showActionTooltip(added: !wasIn, count: newCount);
          },
          child: Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: isInCompare
                  ? primary.withValues(alpha: 0.15)
                  : context.backgroundColor,
              shape: BoxShape.circle,
              border: Border.all(
                color: isInCompare
                    ? primary.withValues(alpha: 0.5)
                    : context.dividerColor,
              ),
              boxShadow: AppTheme.cardShadow,
            ),
            alignment: Alignment.center,
            child: Icon(
              isInCompare ? Icons.check_rounded : Icons.add_rounded,
              size: 20,
              color: isInCompare ? primary : context.textPrimary,
            ),
          ),
        ),
        // ── Pool badge button (count) → opens pool management sheet ──────
        if (poolCount >= 1) ...[
          const SizedBox(width: 6),
          _ComparePoolBadgeButton(count: poolCount),
        ],
        // ── Direct "Compare now" gradient button (only when ≥ 2) ─────────
        if (poolCount >= 2) ...[
          const SizedBox(width: 6),
          _CompareNowButton(count: poolCount),
        ],
      ],
    );
  }
}

/// Round count badge — tapping opens the pool sheet so the user can review
/// what's queued, remove items, or trigger the comparison.
class _ComparePoolBadgeButton extends StatelessWidget {
  final int count;
  const _ComparePoolBadgeButton({required this.count});

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        showComparePoolSheet(context);
      },
      child: Container(
        height: 38,
        constraints: const BoxConstraints(minWidth: 38),
        padding: const EdgeInsets.symmetric(horizontal: 8),
        decoration: BoxDecoration(
          color: primary.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(19),
          border: Border.all(color: primary.withValues(alpha: 0.4)),
          boxShadow: AppTheme.cardShadow,
        ),
        alignment: Alignment.center,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.layers_rounded, size: 16, color: primary),
            const SizedBox(width: 4),
            Text(
              '$count',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: primary,
                height: 1,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CompareNowButton extends StatelessWidget {
  final int count;
  const _CompareNowButton({required this.count});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        context.go(AppRoutes.compare);
      },
      child: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [AppTheme.primaryBlue, AppTheme.accentTeal],
          ),
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: AppTheme.primaryBlue.withValues(alpha: 0.3),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        alignment: Alignment.center,
        child: Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.center,
          children: [
            const Icon(
              Icons.compare_arrows_rounded,
              size: 20,
              color: Colors.white,
            ),
            Positioned(
              right: -4,
              top: -4,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 4,
                  vertical: 1,
                ),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppTheme.primaryBlue, width: 1),
                ),
                child: Text(
                  '$count',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    color: AppTheme.primaryBlue,
                    height: 1,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Round icon button used in top action bar ─────────────────────────────────
class _RoundIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onPressed;
  const _RoundIconButton({required this.icon, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 38,
      height: 38,
      decoration: BoxDecoration(
        color: context.backgroundColor,
        shape: BoxShape.circle,
        border: Border.all(color: context.dividerColor),
        boxShadow: AppTheme.cardShadow,
      ),
      child: IconButton(
        padding: EdgeInsets.zero,
        icon: Icon(icon, color: context.textPrimary, size: 18),
        onPressed: onPressed,
      ),
    );
  }
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
  /// Local override for optimistic UI. Resets to null once the real
  /// PB-backed userProfile reflects the new state.
  bool? _optimisticIsFav;

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
    final realIsFav =
        userAsync.valueOrNull?.favorites.contains(widget.productId) ?? false;
    // Optimistic state wins until the real value catches up.
    if (_optimisticIsFav != null && _optimisticIsFav == realIsFav) {
      _optimisticIsFav = null;
    }
    final isFav = _optimisticIsFav ?? realIsFav;

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
              final wasFav = _optimisticIsFav ?? isFavorite(ref, widget.productId);
              // Flip UI immediately for instant feedback.
              HapticFeedback.lightImpact();
              setState(() {
                _optimisticIsFav = !wasFav;
                _isToggling = true;
              });
              try {
                final result = await toggleFavorite(ref, widget.productId);
                if (!context.mounted) return;
                // Reconcile optimistic state with the real result.
                if (mounted) {
                  setState(() => _optimisticIsFav = result);
                }
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
                }
              } catch (e) {
                if (!context.mounted) return;
                // Roll back optimistic state on failure.
                if (mounted) {
                  setState(() => _optimisticIsFav = wasFav);
                }
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
