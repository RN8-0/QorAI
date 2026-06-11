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
    this.height,
    this.borderRadius,
    this.fit = BoxFit.scaleDown,
    this.padding = const EdgeInsets.all(8),
    this.imageScale = 0.86,
  });

  final String? imageUrl;

  /// Additional URLs to try if [imageUrl] fails (e.g. product.images list).
  final List<String> fallbackUrls;
  final double? width;

  /// If null, fills parent vertical space (caller must provide constraints).
  final double? height;
  final BorderRadius? borderRadius;
  final BoxFit fit;
  final EdgeInsetsGeometry padding;

  /// Scales the photo inside its white slot so product cutouts do not look
  /// oversized in compact cards. Keep between 0 and 1.
  final double imageScale;

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

  // epey CDN size variants live as a filename prefix
  // (k_/s_/t_/c_/m_/b_ + no-prefix original). Compact cards need fast first
  // paint more than maximum resolution, so medium is tried before heavier
  // variants and each failure steps to the next candidate.
  static final _epey = RegExp(
    r'^(https?://resim\.epey\.com/[^/]+/)(k_|s_|t_|c_|m_|b_)?(.+)$',
  );
  static List<String> _expand(String url) {
    final m = _epey.firstMatch(url);
    if (m == null) return [url];
    final path = m.group(1)!;
    final file = m.group(3)!;
    return ['${path}m_$file', '${path}b_$file', '$path$file'];
  }

  // Ad / banner / sponsor / placeholder junk that occasionally leaks into a
  // product's image list. We never display these — they are not product photos.
  static final _bad = RegExp(
    r'(reklam|advert|\bads?\b|banner|kampanya|sponsor|promosyon|site-logo|favicon|yukleniyor|loading|placeholder)',
    caseSensitive: false,
  );
  static bool _isBad(String url) => url.isEmpty || _bad.hasMatch(url);

  void _buildUrlList() {
    final seen = <String>{};
    final sources = <String>[
      if (widget.imageUrl != null && !_isBad(widget.imageUrl!))
        widget.imageUrl!,
      ...widget.fallbackUrls.where((u) => !_isBad(u)),
    ];
    _urls = [
      for (final s in sources)
        for (final cand in _expand(s))
          if (seen.add(cand.toLowerCase())) cand,
    ];
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
      // Decode to physical pixels, not logical — halves memory vs full-res.
      final dpr = MediaQuery.maybeDevicePixelRatioOf(context) ?? 2.0;
      // Width bazlı cache: görsel, yükseklik değil genişlik boyutunda decode edilmeli.
      // width verilmişse onu, yoksa height fallback — height-only'de caller'ın
      // explicit width geçmesi önerilir (_WideProductCard gibi).
      final targetW = widget.width ?? widget.height ?? 140.0;
      final targetH = widget.height ?? widget.width ?? 140.0;
      final cacheW = (targetW * dpr).round().clamp(120, 720);
      final cacheH = (targetH * dpr).round().clamp(120, 720);
      imageWidget = CachedNetworkImage(
        key: ValueKey(url),
        imageUrl: url,
        fit: widget.fit,
        memCacheWidth: cacheW,
        memCacheHeight: cacheH,
        maxWidthDiskCache: cacheW,
        maxHeightDiskCache: cacheH,
        fadeInDuration: Duration.zero,
        fadeOutDuration: Duration.zero,
        filterQuality: FilterQuality.medium,
        placeholder: (_, _) => const ColoredBox(color: Color(0xFFF1F5F9)),
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
        child: Padding(
          padding: widget.padding,
          child: Center(
            child: FractionallySizedBox(
              widthFactor: widget.imageScale.clamp(0.1, 1.0),
              heightFactor: widget.imageScale.clamp(0.1, 1.0),
              child: imageWidget,
            ),
          ),
        ),
      ),
    );
  }
}
