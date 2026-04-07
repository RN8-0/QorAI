/// Compair - Skeleton Loader / Shimmer Widgets
/// Blueprint Section 14.4 (Loading states)
///
/// Shimmer effect placeholder cards
/// Custom shimmer for each screen section
library;

import 'package:flutter/material.dart';
import 'package:shimmer/shimmer.dart';
import 'package:compair/core/theme.dart';

/// General shimmer container
class ShimmerBox extends StatelessWidget {
  final double width;
  final double height;
  final double borderRadius;

  const ShimmerBox({
    super.key,
    required this.width,
    required this.height,
    this.borderRadius = 8,
  });

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: const Color(0xFF1E293B),
      highlightColor: const Color(0xFF334155),
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(borderRadius),
        ),
      ),
    );
  }
}

/// Product card shimmer
class ProductCardSkeleton extends StatelessWidget {
  const ProductCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: const Color(0xFF1E293B),
      highlightColor: const Color(0xFF334155),
      child: Container(
        width: 160,
        margin: const EdgeInsets.only(right: 12),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(AppTheme.borderRadiusMedium),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image placeholder
            Container(
              height: 100,
              decoration: BoxDecoration(
                color: context.surfaceVariantColor,
                borderRadius: BorderRadius.vertical(
                  top: Radius.circular(AppTheme.borderRadiusMedium),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 120,
                    height: 14,
                    color: context.surfaceVariantColor,
                  ),
                  const SizedBox(height: 8),
                  Container(
                    width: 80,
                    height: 10,
                    color: context.surfaceVariantColor,
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

/// Horizontal list shimmer
class HorizontalListSkeleton extends StatelessWidget {
  final int itemCount;
  final double itemWidth;
  final double height;

  const HorizontalListSkeleton({
    super.key,
    this.itemCount = 3,
    this.itemWidth = 160,
    this.height = 180,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        physics: const NeverScrollableScrollPhysics(),
        itemCount: itemCount,
        itemBuilder: (context, index) => const ProductCardSkeleton(),
      ),
    );
  }
}

/// Category grid shimmer
class CategoryGridSkeleton extends StatelessWidget {
  const CategoryGridSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: const Color(0xFF1E293B),
      highlightColor: const Color(0xFF334155),
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 20),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 2.5,
        ),
        itemCount: 4,
        itemBuilder: (context, index) => Container(
          decoration: BoxDecoration(
            color: context.surfaceVariantColor,
            borderRadius: BorderRadius.circular(AppTheme.borderRadiusMedium),
          ),
        ),
      ),
    );
  }
}

/// Score card shimmer
class ScoreCardSkeleton extends StatelessWidget {
  const ScoreCardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: const Color(0xFF1E293B),
      highlightColor: const Color(0xFF334155),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(AppTheme.borderRadiusMedium),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(width: 120, height: 20, color: context.surfaceVariantColor),
                Container(width: 48, height: 32, color: context.surfaceVariantColor),
              ],
            ),
            const SizedBox(height: 20),
            ...List.generate(
              4,
              (index) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Container(width: 100, height: 10, color: context.surfaceVariantColor),
                        Container(width: 30, height: 10, color: context.surfaceVariantColor),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Container(
                      width: double.infinity,
                      height: 6,
                      color: context.surfaceVariantColor,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// List item shimmer
class ListItemSkeleton extends StatelessWidget {
  const ListItemSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: const Color(0xFF1E293B),
      highlightColor: const Color(0xFF334155),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: context.surfaceVariantColor,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(width: 160, height: 14, color: context.surfaceVariantColor),
                  const SizedBox(height: 8),
                  Container(width: 100, height: 10, color: context.surfaceVariantColor),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Detail page shimmer
class DetailPageSkeleton extends StatelessWidget {
  const DetailPageSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor: const Color(0xFF1E293B),
      highlightColor: const Color(0xFF334155),
      child: SingleChildScrollView(
        physics: const NeverScrollableScrollPhysics(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image
            Container(width: double.infinity, height: 300, color: context.surfaceVariantColor),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(width: 80, height: 24, color: context.surfaceVariantColor),
                  const SizedBox(height: 12),
                  Container(width: 250, height: 28, color: context.surfaceVariantColor),
                  const SizedBox(height: 8),
                  Container(width: 150, height: 16, color: context.surfaceVariantColor),
                  const SizedBox(height: 24),
                  Container(width: 180, height: 36, color: context.surfaceVariantColor),
                  const SizedBox(height: 24),
                  // Score card skeleton
                  Container(
                    width: double.infinity,
                    height: 200,
                    decoration: BoxDecoration(
                      color: context.surfaceVariantColor,
                      borderRadius:
                          BorderRadius.circular(AppTheme.borderRadiusMedium),
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
