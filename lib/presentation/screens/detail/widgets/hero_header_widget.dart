part of '../product_detail_screen.dart';

// ═══════════════════════════════════════════════════════════
// HERO HEADER
// ═══════════════════════════════════════════════════════════

LocalizedProductKey _detailLocalizedProductKey(
  WidgetRef ref,
  BuildContext context,
  ProductEntity product,
) {
  final languageCode =
      (ref.read(localeProvider)?.languageCode ??
              Localizations.localeOf(context).languageCode)
          .toLowerCase();
  return LocalizedProductKey(productId: product.id, languageCode: languageCode);
}

// ignore: unused_element
Future<void> _requestDetailAiMatch(
  BuildContext context,
  WidgetRef ref,
  ProductEntity product,
) async {
  final isLoggedInNow = ref.read(authStateProvider).valueOrNull != null;
  if (!isLoggedInNow) {
    context.go(AppRoutes.login);
    return;
  }

  final user = ref.read(userProfileProvider).valueOrNull;
  if (user == null || !user.quizCompleted) {
    context.push(AppRoutes.quiz);
    return;
  }

  if (!await ensureEmailVerified(context, ref)) return;
  if (!context.mounted) return;

  final subscription = ref.read(subscriptionServiceProvider);
  if (!subscription.canUseDetailMatchAi) {
    showLimitReachedDialog(context, featureName: 'detail-match');
    return;
  }

  final cacheKey = _detailLocalizedProductKey(ref, context, product);
  final existing = ref.read(geminiMatchScoreProvider(cacheKey));
  if (existing.isLoading || existing.valueOrNull != null) return;

  ref
      .read(geminiMatchScoreProvider(cacheKey).notifier)
      .fetchMatchScore(product: product);
}

class _HeroHeader extends ConsumerStatefulWidget {
  final ProductEntity product;
  const _HeroHeader({required this.product});

  @override
  ConsumerState<_HeroHeader> createState() => _HeroHeaderState();
}

class _HeroHeaderState extends ConsumerState<_HeroHeader> {
  int _selectedIndex = 0;
  late final PageController _pageController = PageController();
  final Set<int> _precachedIndexes = <int>{};

  @override
  void didUpdateWidget(covariant _HeroHeader oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.product.id != widget.product.id) {
      _selectedIndex = 0;
      _precachedIndexes.clear();
      if (_pageController.hasClients) {
        _pageController.jumpToPage(0);
      }
    }
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final allImages = widget.product.allImages;
    final dpr = MediaQuery.maybeDevicePixelRatioOf(context) ?? 2.0;
    final screenWidth = MediaQuery.sizeOf(context).width;
    const heroBaseHeight = 300.0;
    // Hero is padded and product images are mostly cutouts; decoding far beyond
    // the visible slot wastes memory and causes GC stutter on mid-range phones.
    final heroCacheWidth = (screenWidth * dpr).round().clamp(540, 960);
    final heroCacheHeight = (heroBaseHeight * dpr).round().clamp(540, 960);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _precacheAdjacentImages(
        allImages: allImages,
        centerIndex: _selectedIndex,
        cacheWidth: heroCacheWidth,
        cacheHeight: heroCacheHeight,
      );
    });

    // Flat white backdrop in both themes: transparent product PNGs need a light
    // background, and a single tone (no gradient) matches the app's white
    // surfaces exactly — no visible seam between the hero and the card below.
    const imageBg = Colors.white;

    return SliverToBoxAdapter(
      child: Container(
        height: heroBaseHeight,
        decoration: const BoxDecoration(color: imageBg),
        child: Stack(
          children: [
            // ── Swipeable main image ──
            Positioned.fill(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: allImages.isNotEmpty
                    ? () {
                        Navigator.of(context).push(
                          PageRouteBuilder(
                            opaque: false,
                            barrierColor: Colors.transparent,
                            pageBuilder:
                                (context, animation, secondaryAnimation) {
                                  return _FullScreenImageViewer(
                                    images: allImages,
                                    initialIndex: _selectedIndex,
                                    animation: animation,
                                  );
                                },
                            transitionsBuilder:
                                (
                                  context,
                                  animation,
                                  secondaryAnimation,
                                  child,
                                ) {
                                  return FadeTransition(
                                    opacity: animation,
                                    child: child,
                                  );
                                },
                          ),
                        );
                      }
                    : null,
                child: Padding(
                  // A touch more breathing room so medium-res product images
                  // aren't upscaled edge-to-edge (which reads as blurry).
                  padding: const EdgeInsets.fromLTRB(34, 18, 34, 38),
                  child: allImages.isEmpty
                      ? Center(
                          child: _CategoryEmoji(
                            cat: widget.product.categoryId,
                          ),
                        )
                      : PageView.builder(
                          controller: _pageController,
                          itemCount: allImages.length,
                          dragStartBehavior: DragStartBehavior.down,
                          physics: const _GentlePageScrollPhysics(),
                          onPageChanged: (i) {
                            if (i == _selectedIndex) return;
                            setState(() => _selectedIndex = i);
                            _precacheAdjacentImages(
                              allImages: allImages,
                              centerIndex: i,
                              cacheWidth: heroCacheWidth,
                              cacheHeight: heroCacheHeight,
                            );
                          },
                          itemBuilder: (context, i) {
                            return Hero(
                              tag: 'product_image_${widget.product.id}_$i',
                              child: _HeroNetworkImage(
                                url: allImages[i],
                                cacheWidth: heroCacheWidth,
                                cacheHeight: heroCacheHeight,
                                fallback: _CategoryEmoji(
                                  cat: widget.product.categoryId,
                                ),
                              ),
                            );
                          },
                        ),
                ),
              ),
            ),
            // ── Score badges (Tech + Match, stacked, top-right) ──
            Positioned(
              top: 12,
              right: 14,
              child: _HeroScoreStack(product: widget.product),
            ),
            // ── Page indicator dots ──
            if (allImages.length > 1)
              Positioned(
                left: 0,
                right: 0,
                bottom: 12,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(allImages.length, (i) {
                    final isActive = _selectedIndex == i;
                    return AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      margin: const EdgeInsets.symmetric(horizontal: 3),
                      width: isActive ? 20 : 6,
                      height: 6,
                      decoration: BoxDecoration(
                        color: isActive
                            ? AppTheme.primaryBlue
                            : context.textTertiaryColor.withValues(alpha: 0.4),
                        borderRadius: BorderRadius.circular(3),
                      ),
                    );
                  }),
                ),
              ),
          ],
        ),
      ),
    );
  }

  void _precacheAdjacentImages({
    required List<String> allImages,
    required int centerIndex,
    required int cacheWidth,
    required int cacheHeight,
  }) {
    if (allImages.length < 2) return;
    for (final index in <int>[centerIndex + 1, centerIndex - 1]) {
      if (index < 0 || index >= allImages.length) continue;
      if (!_precachedIndexes.add(index)) continue;
      final url = _HeroNetworkImage.bestCandidate(allImages[index]);
      Future<void>.delayed(const Duration(milliseconds: 220), () {
        if (!mounted) return;
        precacheImage(
          CachedNetworkImageProvider(
            url,
            maxWidth: cacheWidth,
            maxHeight: cacheHeight,
          ),
          context,
        ).catchError((_) {});
      });
    }
  }
}

class _GentlePageScrollPhysics extends PageScrollPhysics {
  const _GentlePageScrollPhysics({super.parent});

  @override
  _GentlePageScrollPhysics applyTo(ScrollPhysics? ancestor) {
    return _GentlePageScrollPhysics(parent: buildParent(ancestor));
  }

  @override
  double get minFlingDistance => 4;

  @override
  double get minFlingVelocity => 40;

  @override
  double? get dragStartDistanceMotionThreshold => 1;
}

// ─── Compact score stack rendered inside the hero (top-right) ───
class _HeroScoreStack extends ConsumerWidget {
  final ProductEntity product;
  const _HeroScoreStack({required this.product});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final techScore = product.techScore.toInt();
    // Hybrid match score: show the instant, free local heuristic immediately,
    // then upgrade to the richer AI result (specs + price + profile analyzed)
    // once the on-demand AI match has been computed for this product.
    final heuristic = ref.watch(localMatchScoreProvider(product));
    final cacheKey = _detailLocalizedProductKey(ref, context, product);
    final aiMatch = ref.watch(geminiMatchScoreProvider(cacheKey)).valueOrNull;
    final fitScore = aiMatch?.matchScore ?? heuristic;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (techScore > 0) ...[
          _HeroScoreCircle(
            score: techScore,
            color: AppTheme.primaryBlue,
            kind: _ScoreKind.tech,
          ),
          const SizedBox(height: 8),
        ],
        _HeroScoreCircle(
          score: fitScore ?? 0,
          color: fitScore == null
              ? AppTheme.slate500
              : fitScore >= 80
                  ? AppTheme.scoreExcellent
                  : fitScore >= 60
                      ? AppTheme.warning
                      : AppTheme.error,
          kind: _ScoreKind.match,
          dimmed: fitScore == null,
        ),
      ],
    );
  }
}

enum _ScoreKind { tech, match }

class _HeroScoreCircle extends StatefulWidget {
  final int score;
  final Color color;
  final _ScoreKind kind;
  final bool dimmed;
  const _HeroScoreCircle({
    required this.score,
    required this.color,
    required this.kind,
    this.dimmed = false,
  });

  @override
  State<_HeroScoreCircle> createState() => _HeroScoreCircleState();
}

class _HeroScoreCircleState extends State<_HeroScoreCircle> {
  final _key = GlobalKey();
  OverlayEntry? _tooltipEntry;

  @override
  void dispose() {
    _removeTooltip();
    super.dispose();
  }

  void _removeTooltip() {
    _tooltipEntry?.remove();
    _tooltipEntry = null;
  }

  void _showTooltip() {
    _removeTooltip();
    final box = _key.currentContext?.findRenderObject() as RenderBox?;
    if (box == null) return;
    final offset = box.localToGlobal(Offset.zero);
    final size = box.size;
    final lang = Localizations.localeOf(context).languageCode.toLowerCase();
    final isTr = lang == 'tr';
    final title = widget.kind == _ScoreKind.tech
        ? (isTr ? 'Teknik Skor' : 'Tech Score')
        : (isTr ? 'Senin Eşleşmen' : 'Your Match');
    final explanation = widget.kind == _ScoreKind.tech
        ? (isTr
            ? 'Aynı kategorideki ürünlere göre normalize edilmiş teknik özelliklerin (yonga, ekran, pil, kamera vb.) toplam puanı.'
            : 'A combined score of the product\'s technical specs (chipset, display, battery, camera, etc.) normalized against products in the same category.')
        : (isTr
            ? 'Quiz cevaplarına ve davranışlarına göre AI tarafından hesaplanan, bu ürünün senin için ne kadar uygun olduğunu gösteren puan.'
            : 'A personalized AI-calculated score showing how well this product fits you, based on your quiz answers and behavior signals.');

    final screenWidth = MediaQuery.of(context).size.width;
    const bubbleWidth = 260.0;
    final rawLeft = offset.dx + size.width - bubbleWidth;
    final left = rawLeft.clamp(8.0, screenWidth - bubbleWidth - 8.0);
    final top = offset.dy + size.height + 6;

    _tooltipEntry = OverlayEntry(
      builder: (ctx) => Stack(
        children: [
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.translucent,
              onTap: _removeTooltip,
            ),
          ),
          Positioned(
            left: left,
            top: top,
            width: bubbleWidth,
            child: Material(
              color: Colors.transparent,
              child: Container(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                decoration: BoxDecoration(
                  color: Theme.of(context).brightness == Brightness.dark
                      ? const Color(0xFF1A1F2E)
                      : Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: widget.color.withValues(alpha: 0.3)),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.18),
                      blurRadius: 18,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Icon(
                          widget.kind == _ScoreKind.tech
                              ? Icons.memory_outlined
                              : Icons.person_outline,
                          size: 14,
                          color: widget.color,
                        ),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            title,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 13,
                              fontWeight: FontWeight.w800,
                              color: widget.color,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      explanation,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11.5,
                        height: 1.4,
                        color: Theme.of(context).brightness == Brightness.dark
                            ? Colors.white70
                            : const Color(0xFF475569),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
    Overlay.of(context).insert(_tooltipEntry!);
    Future.delayed(const Duration(seconds: 5), () {
      if (mounted) _removeTooltip();
    });
  }

  @override
  Widget build(BuildContext context) {
    final color = widget.color;
    final dimmed = widget.dimmed;
    return GestureDetector(
      key: _key,
      onTap: _showTooltip,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.94),
          shape: BoxShape.circle,
          border: Border.all(
            color: color.withValues(alpha: dimmed ? 0.22 : 0.45),
            width: 1,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.08),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        alignment: Alignment.center,
        child: Stack(
          alignment: Alignment.center,
          children: [
            SizedBox(
              width: 36,
              height: 36,
              child: CircularProgressIndicator(
                value: widget.score > 0 ? widget.score / 100 : 0,
                strokeWidth: 2.5,
                backgroundColor: color.withValues(alpha: 0.12),
                valueColor: AlwaysStoppedAnimation<Color>(color),
                strokeCap: StrokeCap.round,
              ),
            ),
            Text(
              widget.score > 0 ? '${widget.score}' : '–',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: color,
                height: 1,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ignore: unused_element
class _HeroAiMatchTrigger extends StatelessWidget {
  final num amount;
  final VoidCallback onTap;

  const _HeroAiMatchTrigger({required this.amount, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(10, 7, 7, 7),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.72),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: AppTheme.primaryBlue.withValues(alpha: 0.28),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.18),
              blurRadius: 12,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.auto_awesome_rounded,
              size: 14,
              color: AppTheme.brandCyan,
            ),
            const SizedBox(width: 6),
            Text(
              'AI',
              style: GoogleFonts.plusJakartaSans(
                color: Colors.white,
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.3,
              ),
            ),
            const SizedBox(width: 8),
            IgnorePointer(
              child: QorAmountBadge(
                amount: amount,
                color: AppTheme.brandBlue,
                fontSize: 10,
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ignore: unused_element
class _HeroScoreBadge extends StatelessWidget {
  final int score;
  const _HeroScoreBadge({required this.score});

  @override
  Widget build(BuildContext context) {
    final bool isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: 50,
      height: 50,
      decoration: BoxDecoration(
        color: context.surfaceColor,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: (isDark ? Colors.black : Colors.black12).withValues(
              alpha: isDark ? 0.3 : 0.06,
            ),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
        border: Border.all(color: AppTheme.primaryBlue, width: 2.5),
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox(
            width: 44,
            height: 44,
            child: CircularProgressIndicator(
              value: score / 100,
              strokeWidth: 3,
              backgroundColor: AppTheme.primaryBlue.withValues(alpha: 0.15),
              valueColor: const AlwaysStoppedAnimation<Color>(
                AppTheme.primaryBlue,
              ),
            ),
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '$score',
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w900,
                  color: AppTheme.primaryBlue,
                  height: 1.0,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Hero product image with a sharpest-first epey variant chain and a graceful
/// fallback: big (b_) -> no-prefix -> medium (m_) -> category emoji. The size
/// variant is upgraded in-place and each failure steps down (never blank).
class _HeroNetworkImage extends StatefulWidget {
  const _HeroNetworkImage({
    required this.url,
    required this.cacheWidth,
    required this.cacheHeight,
    required this.fallback,
  });

  final String url;
  final int cacheWidth;
  final int cacheHeight;
  final Widget fallback;

  static final _epey = RegExp(
    r'^(https?://resim\.epey\.com/[^/]+/)(k_|s_|t_|c_|m_|b_)?(.+)$',
  );

  static List<String> _expand(String url) {
    final m = _epey.firstMatch(url);
    if (m == null) return [url];
    final path = m.group(1)!;
    final file = m.group(3)!;
    return ['${path}b_$file', '$path$file', '${path}m_$file'];
  }

  static String bestCandidate(String url) => _expand(url).first;

  @override
  State<_HeroNetworkImage> createState() => _HeroNetworkImageState();
}

class _HeroNetworkImageState extends State<_HeroNetworkImage> {
  late List<String> _urls;
  int _idx = 0;

  @override
  void initState() {
    super.initState();
    _urls = _HeroNetworkImage._expand(widget.url);
  }

  @override
  void didUpdateWidget(_HeroNetworkImage old) {
    super.didUpdateWidget(old);
    if (old.url != widget.url) {
      _urls = _HeroNetworkImage._expand(widget.url);
      _idx = 0;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_idx >= _urls.length) return Center(child: widget.fallback);
    final url = _urls[_idx];
    return CachedNetworkImage(
      key: ValueKey(url),
      imageUrl: url,
      fit: BoxFit.contain,
      memCacheWidth: widget.cacheWidth,
      memCacheHeight: widget.cacheHeight,
      maxWidthDiskCache: widget.cacheWidth,
      maxHeightDiskCache: widget.cacheHeight,
      filterQuality: FilterQuality.medium,
      fadeInDuration: const Duration(milliseconds: 120),
      placeholder: (_, _) => const ColoredBox(color: Colors.white),
      errorWidget: (_, failed, _) {
        CachedNetworkImageProvider(
          failed,
          maxWidth: widget.cacheWidth,
          maxHeight: widget.cacheHeight,
        ).evict();
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted && _idx < _urls.length) setState(() => _idx++);
        });
        return const ColoredBox(color: Colors.white);
      },
    );
  }
}
