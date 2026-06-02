part of '../product_detail_screen.dart';

// ═══════════════════════════════════════════════════════════
// ERROR & LOADING
// ═══════════════════════════════════════════════════════════

class _LoadingScreen extends StatelessWidget {
  const _LoadingScreen();
  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}

class _ErrorScreen extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorScreen({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(elevation: 0),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 56, color: Colors.redAccent),
              const SizedBox(height: 16),
              Text(
                context.l10n?.couldNotLoadProduct ?? 'Could not load product',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 8),
              Text(
                message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppTheme.slate500, fontSize: 13),
              ),
              const SizedBox(height: 24),
              ElevatedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: Text(context.l10n?.tryAgain ?? 'Try Again'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Fullscreen Image Viewer ──────────────────────────────────────────────────

class _FullScreenImageViewer extends StatefulWidget {
  final List<String> images;
  final int initialIndex;
  final Animation<double> animation;

  const _FullScreenImageViewer({
    required this.images,
    required this.initialIndex,
    required this.animation,
  });

  @override
  State<_FullScreenImageViewer> createState() => _FullScreenImageViewerState();
}

class _FullScreenImageViewerState extends State<_FullScreenImageViewer> {
  late PageController _pageController;
  late int _currentIndex;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex;
    _pageController = PageController(initialPage: widget.initialIndex);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Always white backdrop (product photos are shot on white) — works in
    // both light and dark themes.
    const bgColor = Colors.white;
    const fgColor = Colors.black;
    final dpr = MediaQuery.maybeDevicePixelRatioOf(context) ?? 2.0;
    final screenW = MediaQuery.sizeOf(context).width;
    final screenH = MediaQuery.sizeOf(context).height;
    final fullCacheWidth = (screenW * dpr).round().clamp(720, 1200);
    final fullCacheHeight = (screenH * dpr).round().clamp(720, 1400);

    return Scaffold(
      backgroundColor: bgColor,
      body: Stack(
        children: [
          // Swipeable images — PageView drives the swipe gesture.
          // (InteractiveViewer was conflicting with horizontal swipe;
          // pinch-to-zoom removed for now in favor of reliable paging.)
          PageView.builder(
            controller: _pageController,
            itemCount: widget.images.length,
            dragStartBehavior: DragStartBehavior.down,
            physics: const _GentlePageScrollPhysics(),
            onPageChanged: (i) => setState(() => _currentIndex = i),
            itemBuilder: (context, index) => GestureDetector(
              onTap: () => Navigator.of(context).pop(),
              behavior: HitTestBehavior.opaque,
              child: Center(
                child: _HeroNetworkImage(
                  url: widget.images[index],
                  cacheWidth: fullCacheWidth,
                  cacheHeight: fullCacheHeight,
                  fallback: Icon(
                    Icons.broken_image,
                    color: fgColor.withValues(alpha: 0.5),
                    size: 64,
                  ),
                ),
              ),
            ),
          ),

          // Close button
          Positioned(
            top: MediaQuery.of(context).padding.top + 12,
            right: 16,
            child: GestureDetector(
              onTap: () => Navigator.of(context).pop(),
              child: Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: fgColor.withValues(alpha: 0.08),
                  shape: BoxShape.circle,
                  border: Border.all(color: fgColor.withValues(alpha: 0.15)),
                ),
                child: Icon(Icons.close, color: fgColor, size: 20),
              ),
            ),
          ),

          // Page indicator
          if (widget.images.length > 1)
            Positioned(
              bottom: MediaQuery.of(context).padding.bottom + 24,
              left: 0,
              right: 0,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(widget.images.length, (i) {
                  final isActive = i == _currentIndex;
                  return AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    width: isActive ? 24 : 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: isActive ? fgColor : fgColor.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(4),
                    ),
                  );
                }),
              ),
            ),
        ],
      ),
    );
  }
}
