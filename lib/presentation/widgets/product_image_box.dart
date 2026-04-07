/// ProductImageBox — product image container with white background.
///
/// Always uses white background (matches product photo white bg from e-commerce).
/// Works in both light and dark mode — the white creates a clean product card look.
///
/// Use this everywhere a product image is shown in a card.
library;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:compair/core/theme.dart';
import 'package:flutter/material.dart';

class ProductImageBox extends StatelessWidget {
  const ProductImageBox({
    super.key,
    required this.imageUrl,
    this.width,
    this.height = 120,
    this.borderRadius,
    this.fit = BoxFit.contain,
    this.padding = const EdgeInsets.all(8),
  });

  final String? imageUrl;
  final double? width;
  final double height;
  final BorderRadius? borderRadius;
  final BoxFit fit;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    Widget imageWidget;
    if (imageUrl != null && imageUrl!.isNotEmpty) {
      imageWidget = CachedNetworkImage(
        imageUrl: imageUrl!,
        fit: fit,
        placeholder: (_, __) => const Center(
          child: SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(strokeWidth: 1.5),
          ),
        ),
        errorWidget: (_, __, ___) => const Icon(
          Icons.image_not_supported_outlined,
          color: Color(0xFF64748B),
          size: 32,
        ),
      );
    } else {
      imageWidget = const Icon(
        Icons.image_not_supported_outlined,
        color: Color(0xFF64748B),
        size: 32,
      );
    }

    return ClipRRect(
      borderRadius: borderRadius ?? BorderRadius.circular(12),
      child: Container(
        width: width,
        height: height,
        decoration: const BoxDecoration(color: Colors.white),
        child: Padding(padding: padding, child: imageWidget),
      ),
    );
  }
}
