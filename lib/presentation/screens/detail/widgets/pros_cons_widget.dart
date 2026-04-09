part of '../product_detail_screen.dart';

// ═══════════════════════════════════════════════════════════
// PROS / CONS CARD
// ═══════════════════════════════════════════════════════════

class _ProsConsCard extends StatelessWidget {
  final List<String> pros, cons;
  final Color cardBg;
  const _ProsConsCard({required this.pros, required this.cons, required this.cardBg});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (pros.isNotEmpty) ...[
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: AppTheme.emerald500.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppTheme.emerald500.withValues(alpha: 0.1)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.check_circle_rounded, color: AppTheme.emerald500, size: 16),
                    SizedBox(width: 6),
                    Text(
                      (context.l10n?.advantages ?? 'Advantages').toUpperCase(),
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.2,
                        color: AppTheme.emerald500,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                ...pros.map((p) => _ProConItem(text: p, isPositive: true)),
              ],
            ),
          ),
          if (cons.isNotEmpty) const SizedBox(height: 10),
        ],
        if (cons.isNotEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: AppTheme.amber500.withValues(alpha: 0.05),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppTheme.amber500.withValues(alpha: 0.1)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(Icons.warning_rounded, color: AppTheme.amber500, size: 16),
                    SizedBox(width: 6),
                    Text(
                      (context.l10n?.disadvantages ?? 'Disadvantages').toUpperCase(),
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1.2,
                        color: AppTheme.amber500,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                ...cons.map((c) => _ProConItem(text: c, isPositive: false)),
              ],
            ),
          ),
      ],
    );
  }
}

class _ProConItem extends StatelessWidget {
  final String text;
  final bool isPositive;
  const _ProConItem({required this.text, required this.isPositive});

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context).languageCode;
    final displayText = (locale != 'en') ? spec_dict.translateSpec(text, locale) : text;
    return Padding(
      padding: const EdgeInsets.only(bottom: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            isPositive ? Icons.check_circle : Icons.cancel,
            size: 16,
            color: isPositive ? AppTheme.emerald500 : AppTheme.amber500,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              displayText,
              style: TextStyle(
                fontSize: 14,
                height: 1.4,
                color: isPositive ? AppTheme.emerald500 : AppTheme.amber500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
