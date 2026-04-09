part of '../product_detail_screen.dart';

// ═══════════════════════════════════════════════════════════
// COMPARE TAB CONTENT
// ═══════════════════════════════════════════════════════════

class _CompareTabContent extends ConsumerWidget {
  final ProductEntity product;
  final bool isDark;
  const _CompareTabContent({required this.product, required this.isDark});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final compareState = ref.watch(comparisonStateProvider);
    final isInCompare = compareState.selectedProductIds.contains(product.id);
    final count = compareState.selectedProductIds.length;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 24),
      children: [
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: context.surfaceColor,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: context.dividerColor),
          ),
          child: Column(
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppTheme.primaryBlue.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.compare_arrows_rounded, size: 40, color: AppTheme.primaryBlue),
              ),
              const SizedBox(height: 16),
              Text(
                isInCompare ? 'Added to Compare List' : 'Compare This Product',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: isDark ? context.textPrimary : context.textPrimary,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                isInCompare
                    ? '$count product${count != 1 ? 's' : ''} in compare list. Tap "Add to Compare" below to toggle.'
                    : 'Add this product to your compare list to see a side-by-side AI comparison.',
                style: const TextStyle(
                  fontSize: 13,
                  color: AppTheme.slate400,
                  height: 1.5,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              if (compareState.selectedProductIds.isNotEmpty) ...[
                Divider(color: context.dividerColor),
                const SizedBox(height: 12),
                const Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'IN COMPARE LIST',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.2,
                      color: AppTheme.primaryBlue,
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                ...compareState.selectedProductIds.map((id) => Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: id == product.id
                        ? AppTheme.primaryBlue.withValues(alpha: 0.15)
                        : context.surfaceVariantColor,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: id == product.id
                          ? AppTheme.primaryBlue.withValues(alpha: 0.5)
                          : context.dividerColor,
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        id == product.id ? Icons.check_circle : Icons.circle_outlined,
                        color: id == product.id ? AppTheme.primaryBlue : AppTheme.slate600,
                        size: 18,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          id == product.id ? product.name : id,
                          style: TextStyle(
                            color: id == product.id ? (isDark ? context.textPrimary : context.textPrimary) : AppTheme.slate400,
                            fontSize: 13,
                            fontWeight: id == product.id ? FontWeight.w600 : FontWeight.normal,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                )),
                const SizedBox(height: 4),
                if (count >= 2)
                  SizedBox(
                    width: double.infinity,
                    height: 44,
                    child: ElevatedButton.icon(
                      onPressed: () => context.go('/compare'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primaryBlue,
                        foregroundColor: context.surfaceVariantColor,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        elevation: 0,
                      ),
                      icon: const Icon(Icons.compare_arrows, size: 18),
                      label: Text(context.l10n?.startAiComparison ?? context.l10n?.startAiComparison ?? 'Start AI Comparison', style: const TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════
// SHARED HELPER WIDGETS
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// VIEW TRACKER — records product view in Hive on first build
// ═══════════════════════════════════════════════════════════

class _ViewTracker extends ConsumerStatefulWidget {
  final String productId;
  const _ViewTracker({required this.productId});

  @override
  ConsumerState<_ViewTracker> createState() => _ViewTrackerState();
}

class _ViewTrackerState extends ConsumerState<_ViewTracker> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      recordProductView(ref, widget.productId);
    });
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
