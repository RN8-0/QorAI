/// Qor AI — Reusable shimmer skeleton widgets.
///
/// Uses `shimmer` package (already in pubspec) for a premium App Store-grade
/// loading state. All skeletons pick up the current theme (light/dark) so they
/// blend with the surface beneath them.
///
/// Performance note: keeping ONE `Shimmer.fromColors` per loading area (not
/// per child) keeps the animation controller count low. On weak devices the
/// difference between 1 and 20 controllers is visible jank.
library;

import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';

({Color base, Color highlight}) _shimmerColors(BuildContext context) {
  final isDark = Theme.of(context).brightness == Brightness.dark;
  return (
    base: isDark
        ? Colors.white.withValues(alpha: 0.06)
        : Colors.black.withValues(alpha: 0.05),
    highlight: isDark
        ? Colors.white.withValues(alpha: 0.14)
        : Colors.white.withValues(alpha: 0.85),
  );
}

/// A rounded rectangle placeholder that shimmers with the brand palette.
///
/// When used standalone (no ancestor [Shimmer]), this wraps itself in
/// [Shimmer.fromColors]. When used inside a [SharedShimmer] / [ProductRowSkeleton]
/// parent, it skips the wrap so the parent's single animation controller drives
/// every child — far cheaper on the GPU.
class ShimmerBox extends StatelessWidget {
  final double? width;
  final double? height;
  final double radius;
  final EdgeInsetsGeometry? margin;

  /// When true (default) wraps itself in a Shimmer. Set to false when this is
  /// already inside a SharedShimmer / parent Shimmer.fromColors.
  final bool wrapInShimmer;

  const ShimmerBox({
    super.key,
    this.width,
    this.height,
    this.radius = 12,
    this.margin,
    this.wrapInShimmer = true,
  });

  /// Internal constructor: skip the per-widget shimmer wrap when an ancestor
  /// already provides one. Use inside [ProductRowSkeleton] etc.
  const ShimmerBox.bare({
    super.key,
    this.width,
    this.height,
    this.radius = 12,
    this.margin,
  }) : wrapInShimmer = false;

  @override
  Widget build(BuildContext context) {
    final colors = _shimmerColors(context);
    final box = Container(
      width: width,
      height: height,
      margin: margin,
      decoration: BoxDecoration(
        color: colors.base,
        borderRadius: BorderRadius.circular(radius),
      ),
    );
    if (!wrapInShimmer) return box;
    return Shimmer.fromColors(
      baseColor: colors.base,
      highlightColor: colors.highlight,
      period: const Duration(milliseconds: 1400),
      child: box,
    );
  }
}

/// Wraps any subtree in a single shared [Shimmer] animation. Use this for
/// loading states that contain multiple placeholder boxes — drives every
/// child via one animation controller.
class SharedShimmer extends StatelessWidget {
  final Widget child;
  const SharedShimmer({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    final colors = _shimmerColors(context);
    return Shimmer.fromColors(
      baseColor: colors.base,
      highlightColor: colors.highlight,
      period: const Duration(milliseconds: 1400),
      child: child,
    );
  }
}

/// A product card placeholder: image box + title line + price line.
/// Matches the standard wide product card layout used on the home feed.
///
/// Standalone use wraps itself in shimmer. Inside [ProductRowSkeleton] it
/// renders bare (parent provides the shimmer).
class ProductCardSkeleton extends StatelessWidget {
  final double width;
  final double height;
  final bool _bare;

  const ProductCardSkeleton({
    super.key,
    required this.width,
    required this.height,
  }) : _bare = false;

  const ProductCardSkeleton._bare({
    required this.width,
    required this.height,
  }) : _bare = true;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surface = isDark
        ? Colors.white.withValues(alpha: 0.03)
        : Colors.black.withValues(alpha: 0.03);

    final card = Container(
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
            const Expanded(
              flex: 58,
              child: ShimmerBox.bare(width: double.infinity, radius: 14),
            ),
            const SizedBox(height: 12),
            ShimmerBox.bare(width: width * 0.55, height: 10, radius: 6),
            const SizedBox(height: 8),
            ShimmerBox.bare(width: width * 0.80, height: 12, radius: 6),
            const SizedBox(height: 10),
            Row(
              children: [
                ShimmerBox.bare(width: width * 0.35, height: 22, radius: 11),
                const Spacer(),
                const ShimmerBox.bare(width: 22, height: 22, radius: 11),
              ],
            ),
          ],
        ),
      ),
    );

    if (_bare) return card;
    return SharedShimmer(child: card);
  }
}

/// Horizontal row of product card skeletons — matches a home feed section.
/// Uses a single shared shimmer animation to keep controller count at 1
/// regardless of itemCount.
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
      child: SharedShimmer(
        child: ListView.builder(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 8),
          physics: const NeverScrollableScrollPhysics(),
          itemCount: itemCount,
          itemExtent: cardWidth + 12,
          itemBuilder: (_, __) => Align(
            alignment: Alignment.topCenter,
            child: ProductCardSkeleton._bare(
              width: cardWidth,
              height: cardHeight,
            ),
          ),
        ),
      ),
    );
  }
}
