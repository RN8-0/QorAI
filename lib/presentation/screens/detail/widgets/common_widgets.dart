part of '../product_detail_screen.dart';

// ═══════════════════════════════════════════════════════════
// BOTTOM BAR (legacy — kept for reference)
// ═══════════════════════════════════════════════════════════

// ignore: unused_element
class _BottomBar extends StatelessWidget {
  final ProductEntity product;
  final WidgetRef ref;
  final BuildContext context;
  const _BottomBar({
    required this.product,
    required this.ref,
    required this.context,
  });

  @override
  Widget build(BuildContext _) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [AppTheme.primaryBlue, AppTheme.accentTeal],
        ),
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: AppTheme.primaryBlue.withValues(alpha: 0.4),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () async {
            final result = await addToCollection(ref, product.id);
            if (!context.mounted) return;
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(
                  result.when(
                    success: (_) =>
                        context.l10n?.addedToCollection ??
                        '✅ Added to collection!',
                    failure: (e) => e.message,
                  ),
                ),
                behavior: SnackBarBehavior.floating,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            );
          },
          child: Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.shopping_bag_outlined,
                  color: context.surfaceVariantColor,
                  size: 20,
                ),
                SizedBox(width: 10),
                Text(
                  'I Bought This',
                  style: TextStyle(
                    color: context.surfaceVariantColor,
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// NEW BOTTOM BAR — View Deals
// ═══════════════════════════════════════════════════════════

// ignore: unused_element
class _NewBottomBar extends ConsumerWidget {
  final ProductEntity product;
  const _NewBottomBar({required this.product});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tabController = DefaultTabController.of(context);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 30),
      child: Container(
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(100),
          border: Border.all(color: context.dividerColor, width: 1.5),
          boxShadow: [
            BoxShadow(
              color: Colors.white.withValues(alpha: 0.08),
              blurRadius: 20,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            // Details → Specs tab
            Expanded(
              child: InkWell(
                onTap: () => tabController.animateTo(0),
                borderRadius: BorderRadius.circular(50),
                child: Container(
                  height: 52,
                  decoration: BoxDecoration(
                    color: Colors.transparent,
                    borderRadius: BorderRadius.circular(50),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.list_alt_rounded,
                        color: AppTheme.slate500,
                        size: 20,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Details',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.slate600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            // Reviews tab
            Expanded(
              child: InkWell(
                onTap: () => tabController.animateTo(1),
                borderRadius: BorderRadius.circular(50),
                child: Container(
                  height: 52,
                  decoration: BoxDecoration(
                    color: Colors.transparent,
                    borderRadius: BorderRadius.circular(50),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.rate_review_outlined,
                        color: AppTheme.slate500,
                        size: 20,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        context.l10n?.reviews ?? 'Reviews',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.slate600,
                        ),
                      ),
                    ],
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

// ═══════════════════════════════════════════════════════════
// STICKY TAB BAR DELEGATE
// ═══════════════════════════════════════════════════════════

class _StickyTabBarDelegate extends SliverPersistentHeaderDelegate {
  @override
  double get minExtent => 48;

  @override
  double get maxExtent => 48;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    final controller = DefaultTabController.of(context);
    return Container(
      color: context.surfaceColor,
      child: AnimatedBuilder(
        animation: controller.animation!,
        builder: (context, _) {
          final isPremiumSelected =
              (controller.animation?.value.round() ?? controller.index) == 3;
          final activeTabColor = isPremiumSelected
              ? AppTheme.premiumGold
              : Theme.of(context).colorScheme.primary;
          return TabBar(
            isScrollable: true,
            tabAlignment: TabAlignment.center,
            labelColor: activeTabColor,
            unselectedLabelColor: context.textTertiaryColor,
            indicatorSize: TabBarIndicatorSize.tab,
            dividerColor: Colors.transparent,
            padding: const EdgeInsets.symmetric(horizontal: 8),
            labelPadding: const EdgeInsets.symmetric(horizontal: 14),
            indicator: BoxDecoration(
              border: Border(
                bottom: BorderSide(color: activeTabColor, width: 2.5),
              ),
            ),
            labelStyle: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
            unselectedLabelStyle: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
            tabs: [
              Tab(text: context.l10n?.specsTab ?? 'Specs'),
              Tab(text: context.l10n?.reviews ?? 'Reviews'),
              Tab(text: context.l10n?.similarTab ?? 'Similar'),
              Tab(text: context.l10n?.proTab ?? 'Premium'),
            ],
          );
        },
      ),
    );
  }

  @override
  bool shouldRebuild(_StickyTabBarDelegate oldDelegate) => false;
}

class _CardHeader extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  const _CardHeader({
    required this.icon,
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: color),
        const SizedBox(width: 8),
        Text(
          label,
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
            color: color,
          ),
        ),
      ],
    );
  }
}

// ignore: unused_element
class _SectionLabel extends StatelessWidget {
  final String label;
  final Color color;
  const _SectionLabel({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        letterSpacing: 1.2,
        color: color,
      ),
    );
  }
}

// ignore: unused_element
class _Badge extends StatelessWidget {
  final String label;
  final Color color;
  const _Badge({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.4)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _CategoryEmoji extends StatelessWidget {
  final String? cat;
  const _CategoryEmoji({this.cat});

  @override
  Widget build(BuildContext context) {
    const map = {
      'smartphones': '📱',
      'laptops': '💻',
      'tablets': '📟',
      'headphones': '🎧',
      'wearables': '⌚',
      'tvs': '📺',
      'monitors': '🖥️',
      'cameras': '📷',
    };
    return Text(map[cat] ?? '📦', style: const TextStyle(fontSize: 72));
  }
}

// ignore: unused_element
class _ImagePlaceholder extends StatelessWidget {
  const _ImagePlaceholder();
  @override
  Widget build(BuildContext context) {
    return const Center(child: CircularProgressIndicator(strokeWidth: 2));
  }
}
