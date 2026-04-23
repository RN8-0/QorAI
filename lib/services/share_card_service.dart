/// Qor AI — Share Card Service
///
/// Exports a side-by-side product comparison as a premium, branded PNG image
/// sized for social media (Instagram Story 1080×1920) and shares it via the
/// native share sheet (`share_plus`).
///
/// Flow:
///   1. Offscreen-render a ShareCard widget into a [RepaintBoundary].
///   2. Capture its pixels via [RenderRepaintBoundary.toImage].
///   3. Encode PNG → write to a temp file under [getTemporaryDirectory].
///   4. Hand the file off to [SharePlus] / [Share.shareXFiles].
///
/// Intentionally keeps layout decisions isolated here so the brand can evolve
/// without touching compare_screen.
library;

import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';

class ShareCardService {
  ShareCardService._();

  /// Target canvas: Instagram Story (1080×1920) at 3x for crisp export.
  static const double _targetWidth = 1080;
  static const double _targetHeight = 1920;
  static const double _pixelRatio = 1.0; // already sized at final px

  /// Entry point — renders + shares. Pops a brief scrim snackbar via
  /// [messenger] while the image bakes.
  static Future<void> shareComparison({
    required BuildContext context,
    required List<ProductEntity> products,
    String? headline,
  }) async {
    if (products.length < 2) return;
    final take = products.take(3).toList(); // max 3 — keeps layout tight
    HapticFeedback.mediumImpact();

    final messenger = ScaffoldMessenger.maybeOf(context);
    messenger?.showSnackBar(
      SnackBar(
        content: Row(
          children: const [
            SizedBox(
              width: 16, height: 16,
              child: CircularProgressIndicator(
                strokeWidth: 2, color: Colors.white,
              ),
            ),
            SizedBox(width: 12),
            Text('Preparing comparison card…'),
          ],
        ),
        duration: const Duration(seconds: 6),
        backgroundColor: AppTheme.brandDeepBlue,
        behavior: SnackBarBehavior.floating,
      ),
    );

    try {
      final bytes = await _renderCardBytes(
        context: context,
        products: take,
        headline: headline,
      );
      messenger?.hideCurrentSnackBar();

      final dir = await getTemporaryDirectory();
      final file = File(
        '${dir.path}/qor_ai_comparison_${DateTime.now().millisecondsSinceEpoch}.png',
      );
      await file.writeAsBytes(bytes);

      final subject = take.map((p) => p.name).join(' vs ');
      await Share.shareXFiles(
        [XFile(file.path, mimeType: 'image/png')],
        text: '$subject\n\nCompared with Qor AI — AI Product Advisor',
        subject: 'My Qor AI comparison',
      );
    } catch (e, st) {
      messenger?.hideCurrentSnackBar();
      messenger?.showSnackBar(
        SnackBar(
          content: Text('Could not create share card: $e'),
          backgroundColor: AppTheme.error,
          behavior: SnackBarBehavior.floating,
        ),
      );
      debugPrint('ShareCardService error: $e\n$st');
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // Internal: render widget tree offscreen → PNG bytes
  // ───────────────────────────────────────────────────────────────────────

  static Future<Uint8List> _renderCardBytes({
    required BuildContext context,
    required List<ProductEntity> products,
    String? headline,
  }) async {
    // 1. Pre-cache network images so they paint during the offscreen pass.
    await Future.wait(products.map((p) async {
      if (p.imageURL.isEmpty) return;
      try {
        await precacheImage(
          CachedNetworkImageProvider(p.imageURL),
          context,
        ).timeout(const Duration(seconds: 6));
      } catch (_) {/* non-fatal */}
    }));

    // 2. Build a detached render tree with PipelineOwner + BuildOwner.
    final repaintKey = GlobalKey();
    final mediaQuery = MediaQueryData(
      size: const Size(_targetWidth, _targetHeight),
      devicePixelRatio: _pixelRatio,
      platformBrightness: Brightness.dark,
    );

    final widget = MediaQuery(
      data: mediaQuery,
      child: Directionality(
        textDirection: TextDirection.ltr,
        child: RepaintBoundary(
          key: repaintKey,
          child: SizedBox(
            width: _targetWidth,
            height: _targetHeight,
            child: _ShareCard(products: products, headline: headline),
          ),
        ),
      ),
    );

    // Use a throwaway Overlay entry so the tree builds with the existing
    // pipeline (fonts/images cached on the root binding).
    final overlay = Overlay.of(context, rootOverlay: true);
    final entry = OverlayEntry(
      builder: (_) => Opacity(
        opacity: 0.0,
        child: IgnorePointer(
          ignoring: true,
          child: Align(
            alignment: Alignment.topLeft,
            child: widget,
          ),
        ),
      ),
    );
    overlay.insert(entry);

    try {
      // Let one frame paint.
      await _awaitFrames(2);

      final boundary = repaintKey.currentContext!
          .findRenderObject() as RenderRepaintBoundary;
      final image = await boundary.toImage(pixelRatio: _pixelRatio);
      final byteData =
          await image.toByteData(format: ui.ImageByteFormat.png);
      image.dispose();
      if (byteData == null) {
        throw StateError('toByteData returned null');
      }
      return byteData.buffer.asUint8List();
    } finally {
      entry.remove();
    }
  }

  static Future<void> _awaitFrames(int count) async {
    for (var i = 0; i < count; i++) {
      await WidgetsBinding.instance.endOfFrame;
    }
  }
}

// ─── Share card widget ─────────────────────────────────────────────────────

class _ShareCard extends StatelessWidget {
  final List<ProductEntity> products;
  final String? headline;
  const _ShareCard({required this.products, this.headline});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF000000),
            Color(0xFF0A1628),
            Color(0xFF061222),
          ],
        ),
      ),
      padding: const EdgeInsets.fromLTRB(64, 100, 64, 100),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Brand header
          Row(
            children: [
              Container(
                width: 72, height: 72,
                decoration: BoxDecoration(
                  gradient: AppTheme.primaryGradient,
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(
                      color: AppTheme.brandCyan.withValues(alpha: 0.55),
                      blurRadius: 32,
                    ),
                  ],
                ),
                child: const Icon(Icons.compare_arrows_rounded,
                    color: Colors.white, size: 42),
              ),
              const SizedBox(width: 24),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Qor AI',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 48,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -1.5,
                      color: Colors.white,
                      height: 1.0,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'AI Product Advisor',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 22,
                      fontWeight: FontWeight.w500,
                      color: AppTheme.brandCyan,
                      letterSpacing: 0.5,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 80),

          // Title
          Text(
            headline ?? 'My Comparison',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 62,
              fontWeight: FontWeight.w800,
              letterSpacing: -2,
              color: Colors.white,
              height: 1.1,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            '${products.length} products · ranked by Qor AI',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 24,
              fontWeight: FontWeight.w500,
              color: Colors.white.withValues(alpha: 0.64),
            ),
          ),
          const SizedBox(height: 64),

          // Product rows
          Expanded(
            child: Column(
              children: [
                for (var i = 0; i < products.length; i++) ...[
                  Expanded(
                    child: _ShareProductRow(
                      rank: i + 1,
                      product: products[i],
                      isBest: i == 0,
                    ),
                  ),
                  if (i != products.length - 1) const SizedBox(height: 24),
                ],
              ],
            ),
          ),

          const SizedBox(height: 48),

          // Footer CTA
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 36, vertical: 22),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(
                color: AppTheme.brandCyan.withValues(alpha: 0.25),
                width: 1.5,
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.auto_awesome_rounded,
                    color: AppTheme.brandCyan, size: 28),
                const SizedBox(width: 14),
                Text(
                  'Get your own picks · qorai.app',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 24,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ShareProductRow extends StatelessWidget {
  final int rank;
  final ProductEntity product;
  final bool isBest;
  const _ShareProductRow({
    required this.rank,
    required this.product,
    required this.isBest,
  });

  @override
  Widget build(BuildContext context) {
    final techScore = product.techScore.round();
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        gradient: isBest
            ? LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  AppTheme.brandDeepBlue.withValues(alpha: 0.45),
                  AppTheme.brandBlue.withValues(alpha: 0.25),
                  AppTheme.brandCyan.withValues(alpha: 0.15),
                ],
              )
            : null,
        color: isBest ? null : Colors.white.withValues(alpha: 0.05),
        border: Border.all(
          color: isBest
              ? AppTheme.brandCyan.withValues(alpha: 0.5)
              : Colors.white.withValues(alpha: 0.10),
          width: isBest ? 2 : 1,
        ),
      ),
      padding: const EdgeInsets.all(28),
      child: Row(
        children: [
          // Product image
          Container(
            width: 220, height: 220,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
            ),
            clipBehavior: Clip.antiAlias,
            child: product.imageURL.isNotEmpty
                ? CachedNetworkImage(
                    imageUrl: product.imageURL,
                    fit: BoxFit.contain,
                    errorWidget: (_, __, ___) => const Icon(
                      Icons.image_not_supported_rounded,
                      size: 64, color: Colors.black26,
                    ),
                  )
                : const Icon(Icons.image_not_supported_rounded,
                    size: 64, color: Colors.black26),
          ),
          const SizedBox(width: 28),

          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 6),
                      decoration: BoxDecoration(
                        color: isBest
                            ? AppTheme.brandCyan
                            : Colors.white.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(100),
                      ),
                      child: Text(
                        isBest ? 'BEST PICK' : '#$rank',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: isBest ? Colors.black : Colors.white,
                          letterSpacing: 1,
                        ),
                      ),
                    ),
                    const Spacer(),
                    if (product.brand != null && product.brand!.isNotEmpty)
                      Text(
                        product.brand!.toUpperCase(),
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: Colors.white.withValues(alpha: 0.6),
                          letterSpacing: 2,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 14),
                Text(
                  product.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 34,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                    letterSpacing: -0.5,
                    height: 1.15,
                  ),
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 18, vertical: 10),
                      decoration: BoxDecoration(
                        gradient: AppTheme.primaryGradient,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.bolt_rounded,
                              color: Colors.white, size: 22),
                          const SizedBox(width: 6),
                          Text(
                            '$techScore',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 26,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                              height: 1.0,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            '/100',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              color: Colors.white.withValues(alpha: 0.85),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
