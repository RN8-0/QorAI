part of '../product_detail_screen.dart';

// ═══════════════════════════════════════════════════════════
// FLOATING YOUTUBE PLAYER (mini draggable PiP)
// Native media player — youtube_explode_dart stream URL
// ═══════════════════════════════════════════════════════════

class _FloatingYouTubePlayer extends StatefulWidget {
  final String videoId;
  final String title;
  final String thumbnailUrl;
  final VoidCallback onClose;
  const _FloatingYouTubePlayer({
    required this.videoId,
    required this.title,
    required this.thumbnailUrl,
    required this.onClose,
  });

  @override
  State<_FloatingYouTubePlayer> createState() => _FloatingYouTubePlayerState();
}

class _FloatingYouTubePlayerState extends State<_FloatingYouTubePlayer> {
  double _dx = -1;
  double _dy = -1;
  bool _positionSet = false;
  bool _hidden = false;

  VideoPlayerController? _videoCtrl;
  ChewieController? _chewieCtrl;
  bool _loading = true;
  bool _hasError = false;

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

      final stream = _bestMuxed(manifest);
      final url = stream.url.toString();

      _videoCtrl = VideoPlayerController.networkUrl(Uri.parse(url));
      await _videoCtrl!.initialize();

      _chewieCtrl = ChewieController(
        videoPlayerController: _videoCtrl!,
        autoPlay: true,
        looping: false,
        showControls: false, // mini'de kontroller yok — tap ile fullscreen açılır
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
    Navigator.of(context, rootNavigator: true).push(
      PageRouteBuilder(
        fullscreenDialog: true,
        transitionDuration: const Duration(milliseconds: 250),
        reverseTransitionDuration: const Duration(milliseconds: 200),
        pageBuilder: (_, __, ___) => _FullscreenYouTubePlayer(
          videoId: widget.videoId,
          title: widget.title,
          existingController: _videoCtrl,
        ),
        transitionsBuilder: (_, anim, __, child) =>
            FadeTransition(opacity: anim, child: child),
      ),
    ).then((_) {
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
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.55),
                blurRadius: 24, offset: const Offset(0, 8)),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: Stack(children: [
              // Video veya durum gösterimi
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
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.black.withValues(alpha: 0.7),
                          Colors.transparent,
                        ],
                      ),
                    ),
                    child: Row(children: [
                      const SizedBox(width: 8),
                      Container(
                        width: 24, height: 3,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.5),
                          borderRadius: BorderRadius.circular(2)),
                      ),
                      const Spacer(),
                      if (!_loading && !_hasError)
                        _MiniBtn(
                          icon: Icons.fullscreen_rounded,
                          onTap: _openFullscreen,
                        ),
                      _MiniBtn(
                        icon: Icons.close_rounded,
                        onTap: widget.onClose,
                        margin: const EdgeInsets.only(right: 6),
                      ),
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
          Icon(Icons.refresh_rounded,
            color: Colors.white.withValues(alpha: 0.7), size: 28),
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
// FULLSCREEN PLAYER — mevcut controller, video kesilmez
// ═══════════════════════════════════════════════════════════

class _FullscreenYouTubePlayer extends StatefulWidget {
  final String videoId;
  final String title;
  final VideoPlayerController? existingController;
  const _FullscreenYouTubePlayer({
    required this.videoId,
    required this.title,
    this.existingController,
  });

  @override
  State<_FullscreenYouTubePlayer> createState() =>
      _FullscreenYouTubePlayerState();
}

class _FullscreenYouTubePlayerState extends State<_FullscreenYouTubePlayer> {
  VideoPlayerController? _videoCtrl;
  ChewieController? _chewieCtrl;
  bool _loading = true;
  bool _ownController = false;
  bool _isLandscape = false;

  @override
  void initState() {
    super.initState();
    if (widget.existingController != null) {
      _videoCtrl = widget.existingController!;
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
      final url = _bestMuxed(manifest).url.toString();
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
    // Ekrandan çıkarken orientation sıfırla
    SystemChrome.setPreferredOrientations(DeviceOrientation.values);
    _chewieCtrl?.dispose();
    if (_ownController) _videoCtrl?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final topPadding = MediaQuery.of(context).padding.top;
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Video — tüm ekranı kaplar
          Positioned.fill(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: Colors.red))
                : _chewieCtrl != null
                    ? Chewie(controller: _chewieCtrl!)
                    : const Center(child: CircularProgressIndicator(color: Colors.red)),
          ),
          // Geri butonu — sol üst
          Positioned(
            top: topPadding + 8,
            left: 8,
            child: _FloatingOverlayBtn(
              icon: Icons.arrow_back_rounded,
              onTap: () => Navigator.of(context).pop(),
            ),
          ),
          // Döndür butonu — sağ üst
          Positioned(
            top: topPadding + 8,
            right: 8,
            child: _FloatingOverlayBtn(
              icon: _isLandscape
                  ? Icons.screen_lock_portrait_rounded
                  : Icons.screen_rotation_rounded,
              onTap: _toggleOrientation,
            ),
          ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// IN-APP PLAYER (liste kartından doğrudan açılır)
// ═══════════════════════════════════════════════════════════

class _InAppYouTubePlayer extends StatefulWidget {
  final String videoId;
  const _InAppYouTubePlayer({required this.videoId});

  @override
  State<_InAppYouTubePlayer> createState() => _InAppYouTubePlayerState();
}

class _InAppYouTubePlayerState extends State<_InAppYouTubePlayer> {
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
      final url = _bestMuxed(manifest).url.toString();
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
    final topPadding = MediaQuery.of(context).padding.top;
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          Positioned.fill(
            child: _loading
                ? const Center(child: CircularProgressIndicator(color: Colors.red))
                : _chewieCtrl != null
                    ? Chewie(controller: _chewieCtrl!)
                    : const Center(child: Icon(Icons.videocam_off_rounded, color: Colors.white54, size: 48)),
          ),
          Positioned(
            top: topPadding + 8,
            left: 8,
            child: _FloatingOverlayBtn(
              icon: Icons.arrow_back_rounded,
              onTap: () => Navigator.of(context).pop(),
            ),
          ),
          Positioned(
            top: topPadding + 8,
            right: 8,
            child: _FloatingOverlayBtn(
              icon: _isLandscape
                  ? Icons.screen_lock_portrait_rounded
                  : Icons.screen_rotation_rounded,
              onTap: _toggleOrientation,
            ),
          ),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// YARDIMCI WİDGET'LAR
// ═══════════════════════════════════════════════════════════

/// Fullscreen üzerinde yarı şeffaf yüzen buton (geri / döndür)
class _FloatingOverlayBtn extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _FloatingOverlayBtn({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 40, height: 40,
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.55),
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
        ),
        child: Icon(icon, size: 20, color: Colors.white),
      ),
    );
  }
}

class _MiniBtn extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final EdgeInsets margin;
  const _MiniBtn({
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

// ═══════════════════════════════════════════════════════════
// YARDIMCI — en yüksek kaliteli muxed stream seç (720p > 480p > en yüksek)
// ═══════════════════════════════════════════════════════════

yt_explode.MuxedStreamInfo _bestMuxed(yt_explode.StreamManifest manifest) {
  final sorted = manifest.muxed.sortByBitrate();
  if (sorted.isEmpty) return manifest.muxed.withHighestBitrate();

  // 720p varsa onu seç, yoksa 480p, yoksa en yüksek bitrate
  for (final q in [
    yt_explode.VideoQuality.high720,
    yt_explode.VideoQuality.medium480,
    yt_explode.VideoQuality.medium360,
  ]) {
    try {
      return sorted.firstWhere((s) => s.videoQuality == q);
    } catch (_) {}
  }
  return sorted.last;
}

// ═══════════════════════════════════════════════════════════
// METADATA (youtube_explode_dart — başlık/thumbnail)
// ═══════════════════════════════════════════════════════════

Future<({String title, String thumbnail})> _getYouTubeMetadata(String videoId) async {
  try {
    final yte = yt_explode.YoutubeExplode();
    final video = await yte.videos.get(videoId);
    yte.close();
    return (title: video.title, thumbnail: video.thumbnails.mediumResUrl);
  } catch (_) {
    return (title: '', thumbnail: 'https://img.youtube.com/vi/$videoId/mqdefault.jpg');
  }
}
