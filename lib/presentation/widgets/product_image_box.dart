/// ProductImageBox — product image container with white background.
///
/// Always uses white background (matches product photo white bg from e-commerce).
/// Works in both light and dark mode — the white creates a clean product card look.
///
/// Supports fallback URLs: if the primary [imageUrl] fails to load, tries each
/// URL in [fallbackUrls] in order before showing the broken image icon.
///
/// Use this everywhere a product image is shown in a card.
library;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

class ProductImageBox extends StatefulWidget {
  const ProductImageBox({
    super.key,
    required this.imageUrl,
    this.fallbackUrls = const [],
    this.width,
    this.height = 120,
    this.borderRadius,
    this.fit = BoxFit.contain,
    this.padding = const EdgeInsets.all(8),
  });

  final String? imageUrl;
  /// Additional URLs to try if [imageUrl] fails (e.g. product.images list).
  final List<String> fallbackUrls;
  final double? width;
  final double height;
  final BorderRadius? borderRadius;
  final BoxFit fit;
  final EdgeInsetsGeometry padding;

  @override
  State<ProductImageBox> createState() => _ProductImageBoxState();
}

class _ProductImageBoxState extends State<ProductImageBox> {
  late List<String> _urls;
  int _idx = 0;

  @override
  void initState() {
    super.initState();
    _buildUrlList();
  }

  @override
  void didUpdateWidget(ProductImageBox oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.imageUrl != widget.imageUrl ||
        oldWidget.fallbackUrls != widget.fallbackUrls) {
      setState(() {
        _buildUrlList();
        _idx = 0;
      });
    }
  }

  void _buildUrlList() {
    final seen = <String>{};
    _urls = [
      if (widget.imageUrl != null && widget.imageUrl!.isNotEmpty)
        widget.imageUrl!,
      ...widget.fallbackUrls.where((u) => u.isNotEmpty),
    ].where((u) => seen.add(u)).toList();
  }

  void _onError(String failedUrl) {
    CachedNetworkImageProvider(failedUrl).evict();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _idx < _urls.length - 1) {
        setState(() => _idx++);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    Widget imageWidget;

    if (_urls.isNotEmpty && _idx < _urls.length) {
      final url = _urls[_idx];
      imageWidget = CachedNetworkImage(
        key: ValueKey(url),
        imageUrl: url,
        fit: widget.fit,
        placeholder: (_, __) => const Center(
          child: SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(strokeWidth: 1.5),
          ),
        ),
        errorWidget: (context, url, error) {
          _onError(url);
          return const Icon(
            Icons.image_not_supported_outlined,
            color: Color(0xFF64748B),
            size: 32,
          );
        },
      );
    } else {
      imageWidget = const Icon(
        Icons.image_not_supported_outlined,
        color: Color(0xFF64748B),
        size: 32,
      );
    }

    return ClipRRect(
      borderRadius: widget.borderRadius ?? BorderRadius.circular(12),
      child: Container(
        width: widget.width,
        height: widget.height,
        decoration: const BoxDecoration(color: Colors.white),
        child: Padding(padding: widget.padding, child: imageWidget),
      ),
    );
  }
}
