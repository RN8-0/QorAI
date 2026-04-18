/// Compair — Reusable shimmer skeleton widgets.
///
/// Uses `shimmer` package (already in pubspec) for a premium App Store-grade
/// loading state. All skeletons pick up the current theme (light/dark) so they
/// blend with the surface beneath them.
library;

import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

/// A rounded rectangle placeholder that shimmers with the brand palette.
class ShimmerBox extends StatelessWidget {
  final double? width;
  final double? height;
  final double radius;
  final EdgeInsetsGeometry? margin;

  const ShimmerBox({
    super.key,
    this.width,
    this.height,
    this.radius = 12,
    this.margin,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final base = isDark
        ? Colors.white.withValues(alpha: 0.06)
        : Colors.black.withValues(alpha: 0.05);
    final highlight = isDark
        ? Colors.white.withValues(alpha: 0.14)
        : Colors.white.withValues(alpha: 0.85);

    return Container(
      width: width,
      height: height,
      margin: margin,
      child: Shimmer.fromColors(
        baseColor: base,
        highlightColor: highlight,
        period: const Duration(milliseconds: 1400),
        child: Container(
          decoration: BoxDecoration(
            color: base,
            borderRadius: BorderRadius.circular(radius),
          ),
        ),
      ),
    );
  }
}

/// A product card placeholder: image box + title line + price line.
/// Matches the standard wide product card layout used on the home feed.
class ProductCardSkeleton extends StatelessWidget {
  final double width;
  final double height;

  const ProductCardSkeleton({
    super.key,
    required this.width,
    required this.height,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surface = isDark
        ? Colors.white.withValues(alpha: 0.03)
        : Colors.black.withValues(alpha: 0.03);

    return Container(
      width: width,
      height: height,
      margin: const EdgeInsets.only(right: 12),
      decoration: BoxDecoration(
        color: surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: isDark
              ? Colors.white.withValues(alpha: 0.04)
              : Colors.black.withValues(alpha: 0.04),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              flex: 58,
              child: ShimmerBox(width: double.infinity, radius: 14),
            ),
            const SizedBox(height: 12),
            ShimmerBox(width: width * 0.55, height: 10, radius: 6),
            const SizedBox(height: 8),
            ShimmerBox(width: width * 0.80, height: 12, radius: 6),
            const SizedBox(height: 10),
            Row(
              children: [
                ShimmerBox(width: width * 0.35, height: 22, radius: 11),
                const Spacer(),
                ShimmerBox(width: 22, height: 22, radius: 11),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Horizontal row of product card skeletons — matches a home feed section.
class ProductRowSkeleton extends StatelessWidget {
  final double height;
  final double cardWidth;
  final double cardHeight;
  final int itemCount;

  const ProductRowSkeleton({
    super.key,
    this.height = 246,
    this.cardWidth = 155,
    this.cardHeight = 214,
    this.itemCount = 5,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
        physics: const NeverScrollableScrollPhysics(),
        itemCount: itemCount,
        itemBuilder: (_, __) => Align(
          alignment: Alignment.topCenter,
          child: ProductCardSkeleton(width: cardWidth, height: cardHeight),
        ),
      ),
    );
  }
}
