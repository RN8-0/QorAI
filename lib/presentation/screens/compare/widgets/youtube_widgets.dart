part of '../compare_screen.dart';


class _CompareYouTubeSection extends ConsumerStatefulWidget {
  final List<ProductEntity> products;
  const _CompareYouTubeSection({required this.products});

  @override
  ConsumerState<_CompareYouTubeSection> createState() => _CompareYouTubeSectionState();
}

class _CompareYouTubeSectionState extends ConsumerState<_CompareYouTubeSection> {
  static final Map<String, List<YouTubeVideo>> _videoCache = {};

  List<YouTubeVideo>? _videos;
  bool _loading = false;
  String? _error;
  bool _didSearch = false;
  bool _expanded = false;

  Future<void> _searchVideos() async {
    if (_didSearch) return;
    _didSearch = true;
    setState(() => _loading = true);

    final ids = widget.products.map((p) => p.id).toList()..sort();
    final cacheKey = ids.join('|');

    if (_videoCache.containsKey(cacheKey)) {
      if (mounted) setState(() { _videos = _videoCache[cacheKey]; _loading = false; });
      return;
    }

    try {
      final youtubeService = ref.read(youtubeServiceProvider);
      final locale = Localizations.localeOf(context).languageCode;
      final names = widget.products.map((p) => p.name).join(' vs ');
      final videos = await youtubeService.searchReviewVideos(
        productName: '$names comparison',
        languageCode: locale,
        maxResults: 6,
      );
      _videoCache[cacheKey] = videos;
      if (mounted) setState(() { _videos = videos; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  void _toggleExpand() {
    setState(() => _expanded = !_expanded);
    if (_expanded && !_didSearch) {
      _searchVideos();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return GestureDetector(
      onTap: _toggleExpand,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: context.dividerColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header row — always visible
            Row(children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.red.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.play_circle_fill, color: AppTheme.error, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  context.l10n?.youtubeReviews ?? 'YouTube İncelemeleri',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 15, fontWeight: FontWeight.w700, color: context.textPrimary),
                ),
              ),
              Icon(
                _expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                color: theme.colorScheme.primary,
              ),
            ]),
            // Expandable content
            if (_expanded) ...[
              const SizedBox(height: 12),
              if (_loading)
                Column(children: List.generate(3, (i) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Container(
                    height: 68,
                    decoration: BoxDecoration(
                      color: context.surfaceColor,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(children: [
                      Container(
                        width: 120, height: 68,
                        decoration: BoxDecoration(
                          color: theme.colorScheme.primary.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(8)),
                      ),
                      const SizedBox(width: 10),
                      Expanded(child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(height: 12, width: double.infinity,
                            decoration: BoxDecoration(
                              color: theme.colorScheme.primary.withValues(alpha: 0.08),
                              borderRadius: BorderRadius.circular(4))),
                          const SizedBox(height: 6),
                          Container(height: 10, width: 100,
                            decoration: BoxDecoration(
                              color: theme.colorScheme.primary.withValues(alpha: 0.05),
                              borderRadius: BorderRadius.circular(4))),
                        ],
                      )),
                    ]),
                  ).animate(onPlay: (c) => c.repeat())
                    .shimmer(duration: 1200.ms, color: theme.colorScheme.primary.withValues(alpha: 0.06)),
                )))
              else if (_videos == null || _videos!.isEmpty)
                Text(_error != null ? 'Video yüklenemedi' : 'Karşılaştırma videosu bulunamadı',
                  style: GoogleFonts.plusJakartaSans(fontSize: 13, color: context.textTertiaryColor))
              else
                ...(_videos!.map((video) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _CompareVideoTile(video: video),
                ))),
            ],
          ],
        ),
      ),
    );
  }
}

class _CompareVideoTile extends StatelessWidget {
  final YouTubeVideo video;
  const _CompareVideoTile({required this.video});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => _openVideo(context),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: context.dividerColor),
        ),
        child: Row(children: [
          // Thumbnail with duration badge
          Stack(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.network(
                  video.thumbnailUrl.isNotEmpty
                      ? video.thumbnailUrl
                      : 'https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg',
                  width: 120, height: 68, fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    width: 120, height: 68, color: Colors.grey[800],
                    child: const Icon(Icons.play_circle_outline, color: AppTheme.youtube),
                  ),
                ),
              ),
              if (video.duration.isNotEmpty)
                Positioned(
                  bottom: 4, right: 4,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.8),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(video.duration,
                      style: const TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.w600)),
                  ),
                ),
            ],
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(video.title,
                  style: GoogleFonts.plusJakartaSans(fontSize: 12, fontWeight: FontWeight.w600, color: context.textPrimary),
                  maxLines: 2, overflow: TextOverflow.ellipsis),
                if (video.channelTitle.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(video.channelTitle,
                    style: GoogleFonts.plusJakartaSans(fontSize: 11, color: context.textTertiaryColor),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
                if (video.viewCount.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Row(children: [
                    Text(video.viewCount,
                      style: GoogleFonts.plusJakartaSans(fontSize: 10, color: context.textTertiaryColor)),
                    if (video.qualityBadge.isNotEmpty) ...[
                      const SizedBox(width: 4),
                      Text(video.qualityBadge, style: const TextStyle(fontSize: 10)),
                    ],
                  ]),
                ],
              ],
            ),
          ),
          const Icon(Icons.play_circle_filled, size: 16, color: AppTheme.youtube),
        ]),
      ),
    );
  }

  void _openVideo(BuildContext context) {
    // Video tap is now handled by onVideoTap callback in SharedYouTubeReviewsCard.
    // This tile is only used in the old _CompareYouTubeSection (legacy).
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => _NativeCompareVideoPlayer(videoId: video.videoId, title: video.title),
    ));
  }
}

// ═══════════════════════════════════════════════════════════
// FLOATING YOUTUBE PLAYER (mini PiP — youtube_player_iframe)
// ═══════════════════════════════════════════════════════════

class _CompareFloatingPlayer extends StatefulWidget {
  final String videoId;
  final String title;
  final String thumbnailUrl;
  final VoidCallback onClose;
  const _CompareFloatingPlayer({
    required this.videoId,
    required this.title,
    required this.thumbnailUrl,
    required this.onClose,
  });

  @override
  State<_CompareFloatingPlayer> createState() => _CompareFloatingPlayerState();
}

class _CompareFloatingPlayerState extends State<_CompareFloatingPlayer> {
  double _dx = -1;
  double _dy = -1;
  bool _positionSet = false;
  bool _hidden = false;
  late YoutubePlayerController _controller;

  @override
  void initState() {
    super.initState();
    _controller = YoutubePlayerController(
      params: const YoutubePlayerParams(
        mute: false,
        showControls: false,
        strictRelatedVideos: true,
      ),
    )..loadVideoById(videoId: widget.videoId);
  }

  @override
  void dispose() {
    _controller.close();
    super.dispose();
  }

  void _openFullscreen(BuildContext context) {
    _controller.pauseVideo();
    setState(() => _hidden = true);
    Navigator.of(context, rootNavigator: true).push(PageRouteBuilder(
      fullscreenDialog: true,
      transitionDuration: const Duration(milliseconds: 200),
      reverseTransitionDuration: const Duration(milliseconds: 150),
      pageBuilder: (_, __, ___) => _CompareFullscreenPlayer(videoId: widget.videoId),
      transitionsBuilder: (_, anim, __, child) =>
          FadeTransition(opacity: anim, child: child),
    )).then((_) {
      if (mounted) {
        setState(() => _hidden = false);
        _controller.playVideo();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_hidden) return const SizedBox.shrink();
    final size = MediaQuery.of(context).size;
    const playerW = 280.0;
    const playerH = 158.0;

    if (!_positionSet) {
      _dx = size.width - playerW - 12;
      _dy = size.height - playerH - 100;
      _positionSet = true;
    }

    return Positioned(
      left: _dx, top: _dy,
      child: Material(
        color: Colors.transparent,
        child: GestureDetector(
          onPanUpdate: (d) {
            setState(() {
              _dx = (_dx + d.delta.dx).clamp(0.0, size.width - playerW);
              _dy = (_dy + d.delta.dy).clamp(0.0, size.height - playerH);
            });
          },
          child: Container(
            width: playerW, height: playerH,
            decoration: BoxDecoration(
              color: Colors.black,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [BoxShadow(
                color: Colors.black.withValues(alpha: 0.5),
                blurRadius: 20, offset: const Offset(0, 6))],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Stack(children: [
                Positioned.fill(
                  child: YoutubePlayer(
                    controller: _controller,
                    aspectRatio: playerW / playerH,
                  ),
                ),
                Positioned(top: 0, left: 0, right: 0,
                  child: Container(
                    height: 36,
                    decoration: BoxDecoration(gradient: LinearGradient(
                      begin: Alignment.topCenter, end: Alignment.bottomCenter,
                      colors: [Colors.black.withValues(alpha: 0.7), Colors.transparent],
                    )),
                    child: Row(children: [
                      const SizedBox(width: 8),
                      Container(width: 28, height: 3,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.4),
                          borderRadius: BorderRadius.circular(2))),
                      const Spacer(),
                      GestureDetector(
                        onTap: () => _openFullscreen(context),
                        child: Container(
                          width: 28, height: 28,
                          margin: const EdgeInsets.only(right: 4),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.55),
                            shape: BoxShape.circle),
                          child: const Icon(Icons.fullscreen, size: 16, color: Colors.white),
                        )),
                      GestureDetector(
                        onTap: widget.onClose,
                        child: Container(
                          width: 28, height: 28,
                          margin: const EdgeInsets.only(right: 6),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.55),
                            shape: BoxShape.circle),
                          child: const Icon(Icons.close, size: 14, color: Colors.white),
                        )),
                    ]),
                  )),
                Positioned(bottom: 0, left: 0, right: 0,
                  child: IgnorePointer(child: Container(
                    padding: const EdgeInsets.fromLTRB(8, 10, 8, 6),
                    decoration: BoxDecoration(gradient: LinearGradient(
                      begin: Alignment.bottomCenter, end: Alignment.topCenter,
                      colors: [Colors.black.withValues(alpha: 0.8), Colors.transparent],
                    )),
                    child: Text(widget.title,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 9, fontWeight: FontWeight.w600, color: Colors.white),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  ))),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// FULLSCREEN + NATIVE COMPARE VIDEO PLAYER (youtube_player_iframe)
// ═══════════════════════════════════════════════════════════

class _CompareFullscreenPlayer extends StatefulWidget {
  final String videoId;
  const _CompareFullscreenPlayer({required this.videoId});
  @override
  State<_CompareFullscreenPlayer> createState() => _CompareFullscreenPlayerState();
}

class _CompareFullscreenPlayerState extends State<_CompareFullscreenPlayer> {
  late YoutubePlayerController _controller;

  @override
  void initState() {
    super.initState();
    _controller = YoutubePlayerController(
      params: const YoutubePlayerParams(
        mute: false,
        showControls: true,
        showFullscreenButton: true,
        strictRelatedVideos: true,
      ),
    )..loadVideoById(videoId: widget.videoId);
  }

  @override
  void dispose() {
    _controller.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return YoutubePlayerScaffold(
      controller: _controller,
      aspectRatio: 16 / 9,
      builder: (context, player) => Scaffold(
        backgroundColor: Colors.black,
        body: Stack(children: [
          Center(child: player),
          Positioned(
            top: 8, left: 8,
            child: SafeArea(child: GestureDetector(
              onTap: () => Navigator.of(context).pop(),
              child: Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.6),
                  shape: BoxShape.circle),
                child: const Icon(Icons.close, color: Colors.white, size: 18),
              ),
            ))),
        ]),
      ),
    );
  }
}

class _NativeCompareVideoPlayer extends StatefulWidget {
  final String videoId;
  final String title;
  const _NativeCompareVideoPlayer({required this.videoId, required this.title});

  @override
  State<_NativeCompareVideoPlayer> createState() => _NativeCompareVideoPlayerState();
}

class _NativeCompareVideoPlayerState extends State<_NativeCompareVideoPlayer> {
  late YoutubePlayerController _controller;

  @override
  void initState() {
    super.initState();
    _controller = YoutubePlayerController(
      params: const YoutubePlayerParams(
        mute: false,
        showControls: true,
        showFullscreenButton: true,
        strictRelatedVideos: true,
      ),
    )..loadVideoById(videoId: widget.videoId);
  }

  @override
  void dispose() {
    _controller.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return YoutubePlayerScaffold(
      controller: _controller,
      aspectRatio: 16 / 9,
      builder: (context, player) => Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.black,
          foregroundColor: Colors.white,
          title: Text(widget.title,
            style: const TextStyle(fontSize: 14),
            maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
        body: Center(child: player),
      ),
    );
  }
}

