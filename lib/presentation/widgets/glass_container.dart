import 'package:flutter/material.dart';
import 'package:compair/core/theme.dart';

/// Glassmorphism card — adapts to light and dark themes.
class GlassContainer extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final BorderRadius? borderRadius;
  final bool usePrimaryTint;
  final VoidCallback? onTap;

  const GlassContainer({
    super.key,
    required this.child,
    this.padding,
    this.margin,
    this.borderRadius,
    this.usePrimaryTint = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final Color bg;
    final Color border;

    if (usePrimaryTint) {
      bg     = AppTheme.neonCyan.withValues(alpha: isDark ? 0.08 : 0.06);
      border = AppTheme.neonCyan.withValues(alpha: isDark ? 0.20 : 0.25);
    } else if (isDark) {
      bg     = Colors.white.withValues(alpha: 0.05);
      border = Colors.white.withValues(alpha: 0.08);
    } else {
      bg     = Colors.white.withValues(alpha: 0.80);
      border = Colors.black.withValues(alpha: 0.06);
    }

    final container = Container(
      margin: margin,
      padding: padding,
      decoration: BoxDecoration(
        color: bg,
        borderRadius: borderRadius ?? BorderRadius.circular(16),
        border: Border.all(color: border, width: 0.5),
        boxShadow: isDark ? AppTheme.cardShadow : [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.06),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: child,
    );

    if (onTap != null) {
      return GestureDetector(onTap: onTap, child: container);
    }
    return container;
  }
}
