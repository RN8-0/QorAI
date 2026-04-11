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
// FLOATING YOUTUBE PLAYER (mini PiP — native Chewie player)
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
  bool _loading = true;
  bool _hasError = false;

  VideoPlayerController? _videoCtrl;
  ChewieController? _chewieCtrl;

  static const _playerW = 300.0;
  static const _playerH = 169.0;

  @override
  void initState() {
    super.initState();
    _initPlayer();
  }

  Future<void> _initPlayer() async {
    try {
      final yte = yt_explode.YoutubeExplode();
      final manifest = await yte.videos.streamsClient.getManifest(widget.videoId);
      yte.close();
      final url = manifest.muxed.withHighestBitrate().url.toString();
      _videoCtrl = VideoPlayerController.networkUrl(Uri.parse(url));
      await _videoCtrl!.initialize();
      _chewieCtrl = ChewieController(
        videoPlayerController: _videoCtrl!,
        autoPlay: true,
        looping: false,
        showControls: false,
        aspectRatio: 16 / 9,
        allowFullScreen: false,
        allowPlaybackSpeedChanging: false,
        placeholder: Container(color: Colors.black),
      );
      if (mounted) setState(() => _loading = false);
    } catch (_) {
      if (mounted) setState(() { _loading = false; _hasError = true; });
    }
  }

  @override
  void dispose() {
    _chewieCtrl?.dispose();
    _videoCtrl?.dispose();
    super.dispose();
  }

  void _openFullscreen() {
    if (_videoCtrl == null) return;
    _videoCtrl!.pause();
    setState(() => _hidden = true);
    Navigator.of(context, rootNavigator: true).push(PageRouteBuilder(
      fullscreenDialog: true,
      transitionDuration: const Duration(milliseconds: 250),
      reverseTransitionDuration: const Duration(milliseconds: 200),
      pageBuilder: (_, __, ___) => _CompareFullscreenPlayer(
        videoId: widget.videoId,
        title: widget.title,
        existingController: _videoCtrl,
      ),
      transitionsBuilder: (_, anim, __, child) =>
          FadeTransition(opacity: anim, child: child),
    )).then((_) {
      if (mounted) {
        setState(() => _hidden = false);
        _videoCtrl?.play();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_hidden) return const SizedBox.shrink();
    final size = MediaQuery.of(context).size;

    if (!_positionSet) {
      _dx = size.width - _playerW - 12;
      _dy = size.height - _playerH - 100;
      _positionSet = true;
    }

    final thumb = widget.thumbnailUrl.isNotEmpty
        ? widget.thumbnailUrl
        : 'https://img.youtube.com/vi/${widget.videoId}/mqdefault.jpg';

    return Positioned(
      left: _dx, top: _dy,
      child: Material(
        color: Colors.transparent,
        child: Container(
          width: _playerW, height: _playerH,
          decoration: BoxDecoration(
            color: Colors.black,
            borderRadius: BorderRadius.circular(14),
            boxShadow: [BoxShadow(
              color: Colors.black.withValues(alpha: 0.55),
              blurRadius: 24, offset: const Offset(0, 8))],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: Stack(children: [
              Positioned.fill(
                child: _loading
                    ? _buildLoading(thumb)
                    : _hasError
                        ? _buildError(thumb)
                        : GestureDetector(
                            onTap: _openFullscreen,
                            child: Chewie(controller: _chewieCtrl!),
                          ),
              ),
              // Üst şerit — DRAG + fullscreen + kapat
              Positioned(top: 0, left: 0, right: 0,
                child: GestureDetector(
                  behavior: HitTestBehavior.translucent,
                  onPanUpdate: (d) {
                    setState(() {
                      _dx = (_dx + d.delta.dx).clamp(0.0, size.width - _playerW);
                      _dy = (_dy + d.delta.dy).clamp(0.0, size.height - _playerH);
                    });
                  },
                  child: Container(
                    height: 36,
                    decoration: BoxDecoration(gradient: LinearGradient(
                      begin: Alignment.topCenter, end: Alignment.bottomCenter,
                      colors: [Colors.black.withValues(alpha: 0.7), Colors.transparent],
                    )),
                    child: Row(children: [
                      const SizedBox(width: 8),
                      Container(width: 24, height: 3,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.5),
                          borderRadius: BorderRadius.circular(2))),
                      const Spacer(),
                      if (!_loading && !_hasError)
                        _CmpIconBtn(icon: Icons.fullscreen_rounded, onTap: _openFullscreen),
                      _CmpIconBtn(icon: Icons.close_rounded, onTap: widget.onClose,
                        margin: const EdgeInsets.only(right: 6)),
                    ]),
                  ),
                )),
            ]),
          ),
        ),
      ),
    );
  }

  Widget _buildLoading(String thumb) {
    return Stack(fit: StackFit.expand, children: [
      Image.network(thumb, fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => Container(color: Colors.black)),
      Container(color: Colors.black.withValues(alpha: 0.5)),
      const Center(child: CircularProgressIndicator(color: Colors.red, strokeWidth: 2)),
    ]);
  }

  Widget _buildError(String thumb) {
    return GestureDetector(
      onTap: () {
        setState(() { _loading = true; _hasError = false; });
        _initPlayer();
      },
      child: Stack(fit: StackFit.expand, children: [
        Image.network(thumb, fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => Container(color: const Color(0xFF1A1A1A))),
        Container(color: Colors.black.withValues(alpha: 0.6)),
        Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(Icons.refresh_rounded, color: Colors.white.withValues(alpha: 0.7), size: 28),
          const SizedBox(height: 6),
          Text('Yeniden dene',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11, fontWeight: FontWeight.w600,
              color: Colors.white.withValues(alpha: 0.7))),
        ]),
      ]),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// FULLSCREEN COMPARE PLAYER — native Chewie
// ═══════════════════════════════════════════════════════════

class _CompareFullscreenPlayer extends StatefulWidget {
  final String videoId;
  final String title;
  final VideoPlayerController? existingController;
  const _CompareFullscreenPlayer({
    required this.videoId,
    required this.title,
    this.existingController,
  });

  @override
  State<_CompareFullscreenPlayer> createState() => _CompareFullscreenPlayerState();
}

class _CompareFullscreenPlayerState extends State<_CompareFullscreenPlayer> {
  VideoPlayerController? _videoCtrl;
  ChewieController? _chewieCtrl;
  bool _loading = true;
  bool _ownController = false;
  bool _isLandscape = false;

  @override
  void initState() {
    super.initState();
    if (widget.existingController != null) {
      _videoCtrl = widget.existingController;
      _ownController = false;
      _setupChewie();
    } else {
      _ownController = true;
      _loadAndPlay();
    }
  }

  void _setupChewie() {
    _chewieCtrl = ChewieController(
      videoPlayerController: _videoCtrl!,
      autoPlay: true,
      looping: false,
      showControls: true,
      aspectRatio: 16 / 9,
      allowFullScreen: false,
      allowPlaybackSpeedChanging: true,
      materialProgressColors: ChewieProgressColors(
        playedColor: Colors.red,
        handleColor: Colors.red,
        backgroundColor: Colors.white24,
        bufferedColor: Colors.white38,
      ),
    );
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _loadAndPlay() async {
    try {
      final yte = yt_explode.YoutubeExplode();
      final manifest = await yte.videos.streamsClient.getManifest(widget.videoId);
      yte.close();
      final url = manifest.muxed.withHighestBitrate().url.toString();
      _videoCtrl = VideoPlayerController.networkUrl(Uri.parse(url));
      await _videoCtrl!.initialize();
      _setupChewie();
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _toggleOrientation() {
    setState(() => _isLandscape = !_isLandscape);
    if (_isLandscape) {
      SystemChrome.setPreferredOrientations([
        DeviceOrientation.landscapeLeft,
        DeviceOrientation.landscapeRight,
      ]);
    } else {
      SystemChrome.setPreferredOrientations([
        DeviceOrientation.portraitUp,
        DeviceOrientation.portraitDown,
      ]);
    }
  }

  @override
  void dispose() {
    SystemChrome.setPreferredOrientations(DeviceOrientation.values);
    _chewieCtrl?.dispose();
    if (_ownController) _videoCtrl?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(children: [
          if (!_loading && _chewieCtrl != null)
            Center(child: Chewie(controller: _chewieCtrl!))
          else
            const Center(child: CircularProgressIndicator(color: Colors.red)),
          // Geri butonu
          Positioned(
            top: 8, left: 4,
            child: IconButton(
              icon: Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.55),
                  shape: BoxShape.circle),
                child: const Icon(Icons.arrow_back_rounded, color: Colors.white, size: 20),
              ),
              onPressed: () => Navigator.of(context).pop(),
            ),
          ),
          // Ekran döndürme butonu
          Positioned(
            top: 8, right: 4,
            child: IconButton(
              icon: Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.55),
                  shape: BoxShape.circle),
                child: Icon(
                  _isLandscape
                      ? Icons.screen_lock_portrait_rounded
                      : Icons.screen_rotation_rounded,
                  color: Colors.white, size: 20),
              ),
              onPressed: _toggleOrientation,
            ),
          ),
        ]),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// NATIVE COMPARE VIDEO PLAYER (liste'den direkt açılır)
// ═══════════════════════════════════════════════════════════

class _NativeCompareVideoPlayer extends StatefulWidget {
  final String videoId;
  final String title;
  const _NativeCompareVideoPlayer({required this.videoId, required this.title});

  @override
  State<_NativeCompareVideoPlayer> createState() => _NativeCompareVideoPlayerState();
}

class _NativeCompareVideoPlayerState extends State<_NativeCompareVideoPlayer> {
  VideoPlayerController? _videoCtrl;
  ChewieController? _chewieCtrl;
  bool _loading = true;
  bool _isLandscape = false;

  @override
  void initState() {
    super.initState();
    _loadAndPlay();
  }

  Future<void> _loadAndPlay() async {
    try {
      final yte = yt_explode.YoutubeExplode();
      final manifest = await yte.videos.streamsClient.getManifest(widget.videoId);
      yte.close();
      final url = manifest.muxed.withHighestBitrate().url.toString();
      _videoCtrl = VideoPlayerController.networkUrl(Uri.parse(url));
      await _videoCtrl!.initialize();
      _chewieCtrl = ChewieController(
        videoPlayerController: _videoCtrl!,
        autoPlay: true,
        looping: false,
        showControls: true,
        aspectRatio: 16 / 9,
        allowFullScreen: false,
        allowPlaybackSpeedChanging: true,
        materialProgressColors: ChewieProgressColors(
          playedColor: Colors.red,
          handleColor: Colors.red,
          backgroundColor: Colors.white24,
          bufferedColor: Colors.white38,
        ),
      );
      if (mounted) setState(() => _loading = false);
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _toggleOrientation() {
    setState(() => _isLandscape = !_isLandscape);
    if (_isLandscape) {
      SystemChrome.setPreferredOrientations([
        DeviceOrientation.landscapeLeft,
        DeviceOrientation.landscapeRight,
      ]);
    } else {
      SystemChrome.setPreferredOrientations([
        DeviceOrientation.portraitUp,
        DeviceOrientation.portraitDown,
      ]);
    }
  }

  @override
  void dispose() {
    SystemChrome.setPreferredOrientations(DeviceOrientation.values);
    _chewieCtrl?.dispose();
    _videoCtrl?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        elevation: 0,
        title: Text(widget.title,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 14, fontWeight: FontWeight.w600, color: Colors.white),
          maxLines: 1, overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(
            icon: Icon(
              _isLandscape
                  ? Icons.screen_lock_portrait_rounded
                  : Icons.screen_rotation_rounded,
              color: Colors.white),
            onPressed: _toggleOrientation,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Colors.red))
          : _chewieCtrl != null
              ? Center(child: Chewie(controller: _chewieCtrl!))
              : const Center(
                  child: Icon(Icons.videocam_off_rounded, color: Colors.white54, size: 48)),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// YARDIMCI WİDGET'LAR (Compare)
// ═══════════════════════════════════════════════════════════



class _CmpIconBtn extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final EdgeInsets margin;
  const _CmpIconBtn({
    required this.icon,
    required this.onTap,
    this.margin = const EdgeInsets.only(right: 4),
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 28, height: 28,
        margin: margin,
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.6),
          shape: BoxShape.circle),
        child: Icon(icon, size: 15, color: Colors.white),
      ),
    );
  }
}
