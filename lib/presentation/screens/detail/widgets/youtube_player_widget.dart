part of '../product_detail_screen.dart';

// ── In-App player (full-screen route) ─────────────────────

class _InAppYouTubePlayer extends StatefulWidget {
  final String videoId;
  const _InAppYouTubePlayer({required this.videoId});
  @override
  State<_InAppYouTubePlayer> createState() => _InAppYouTubePlayerState();
}

class _InAppYouTubePlayerState extends State<_InAppYouTubePlayer> {
  VideoPlayerController? _vpc;
  ChewieController? _chewie;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final url = await _getYouTubeStreamUrl(widget.videoId);
    if (!mounted) return;
    if (url == null) {
      setState(() { _loading = false; _error = 'Video yüklenemedi'; });
      return;
    }
    _vpc = VideoPlayerController.networkUrl(Uri.parse(url));
    await _vpc!.initialize();
    if (!mounted) return;
    _chewie = ChewieController(
      videoPlayerController: _vpc!,
      autoPlay: true,
      allowFullScreen: true,
      allowMuting: true,
      showControls: true,
    );
    setState(() => _loading = false);
  }

  @override
  void dispose() {
    _chewie?.dispose();
    _vpc?.dispose();
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
        leading: IconButton(icon: const Icon(Icons.close_rounded), onPressed: () => Navigator.of(context).pop()),
        title: Text(context.l10n?.video ?? 'Video', style: GoogleFonts.plusJakartaSans(fontSize: 16, fontWeight: FontWeight.w600, color: Colors.white)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
          : _error != null
              ? Center(child: Text(_error!, style: const TextStyle(color: Colors.white70)))
              : Chewie(controller: _chewie!),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// FLOATING YOUTUBE PLAYER (mini draggable — native video_player)
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
  bool _hidden = false; // hidden during fullscreen
  VideoPlayerController? _vpc;
  ChewieController? _chewie;
  bool _loading = true;
  String? _error;
  String? _streamUrl; // cached so fullscreen doesn't re-fetch

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final url = await _getYouTubeStreamUrl(widget.videoId);
    if (!mounted) return;
    if (url == null) {
      setState(() { _loading = false; _error = 'Yüklenemedi'; });
      return;
    }
    _streamUrl = url;
    _vpc = VideoPlayerController.networkUrl(Uri.parse(url));
    await _vpc!.initialize();
    if (!mounted) return;
    _chewie = ChewieController(
      videoPlayerController: _vpc!,
      autoPlay: true,
      showControls: true,
      allowFullScreen: false, // We handle fullscreen ourselves
      allowMuting: true,
    );
    setState(() => _loading = false);
  }

  @override
  void dispose() {
    _chewie?.dispose();
    _vpc?.dispose();
    super.dispose();
  }

  void _openFullscreen(BuildContext context) {
    final pos = _vpc?.value.position ?? Duration.zero;
    final url = _streamUrl;
    // Pause and hide mini player (don't destroy it)
    _vpc?.pause();
    setState(() => _hidden = true);
    Navigator.of(context, rootNavigator: true).push(PageRouteBuilder(
      fullscreenDialog: true,
      transitionDuration: const Duration(milliseconds: 200),
      reverseTransitionDuration: const Duration(milliseconds: 150),
      pageBuilder: (_, __, ___) => _FullscreenYouTubePlayer(
        videoId: widget.videoId,
        streamUrl: url,
        startAt: pos,
      ),
      transitionsBuilder: (_, anim, __, child) {
        return FadeTransition(opacity: anim, child: child);
      },
    )).then((_) {
      // Fullscreen closed — show mini player and resume
      if (mounted) {
        setState(() => _hidden = false);
        _vpc?.play();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_hidden) return const SizedBox.shrink();

    final size = MediaQuery.of(context).size;
    const playerW = 280.0;
    const playerH = 158.0; // 16:9 ratio

    if (!_positionSet) {
      _dx = size.width - playerW - 12;
      _dy = size.height - playerH - 100;
      _positionSet = true;
    }

    final thumb = widget.thumbnailUrl.isNotEmpty
        ? widget.thumbnailUrl
        : 'https://img.youtube.com/vi/${widget.videoId}/mqdefault.jpg';

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
              boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.5), blurRadius: 20, offset: const Offset(0, 6))],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Stack(children: [
                // Video or loading/error state
                if (_chewie != null && !_loading)
                  Positioned.fill(child: Chewie(controller: _chewie!))
                else if (_error != null)
                  Positioned.fill(child: Container(
                    color: Colors.black,
                    child: Center(child: Text(_error!, style: const TextStyle(color: Colors.white70, fontSize: 11))),
                  ))
                else
                  Stack(children: [
                    Positioned.fill(child: CachedNetworkImage(
                      imageUrl: thumb, fit: BoxFit.cover,
                      errorWidget: (_, __, ___) => Container(color: Colors.black))),
                    Positioned.fill(child: Container(color: Colors.black.withValues(alpha: 0.5))),
                    const Center(child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)),
                  ]),
                // Top bar: drag handle + fullscreen + close
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
                        decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.4), borderRadius: BorderRadius.circular(2))),
                      const Spacer(),
                      GestureDetector(
                        onTap: () => _openFullscreen(context),
                        child: Container(
                          width: 28, height: 28,
                          margin: const EdgeInsets.only(right: 4),
                          decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.55), shape: BoxShape.circle),
                          child: const Icon(Icons.fullscreen, size: 16, color: Colors.white),
                        )),
                      GestureDetector(
                        onTap: widget.onClose,
                        child: Container(
                          width: 28, height: 28,
                          margin: const EdgeInsets.only(right: 6),
                          decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.55), shape: BoxShape.circle),
                          child: const Icon(Icons.close, size: 14, color: Colors.white),
                        )),
                    ]),
                  )),
                // Bottom title
                Positioned(bottom: 0, left: 0, right: 0,
                  child: IgnorePointer(child: Container(
                    padding: const EdgeInsets.fromLTRB(8, 10, 8, 6),
                    decoration: BoxDecoration(gradient: LinearGradient(
                      begin: Alignment.bottomCenter, end: Alignment.topCenter,
                      colors: [Colors.black.withValues(alpha: 0.8), Colors.transparent],
                    )),
                    child: Text(widget.title,
                      style: GoogleFonts.plusJakartaSans(fontSize: 9, fontWeight: FontWeight.w600, color: Colors.white),
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
// FULLSCREEN YOUTUBE PLAYER (native video_player + chewie)
// ═══════════════════════════════════════════════════════════
class _FullscreenYouTubePlayer extends StatefulWidget {
  final String videoId;
  final String? streamUrl;
  final Duration startAt;
  const _FullscreenYouTubePlayer({
    required this.videoId,
    this.streamUrl,
    this.startAt = Duration.zero,
  });
  @override
  State<_FullscreenYouTubePlayer> createState() => _FullscreenYouTubePlayerState();
}

class _FullscreenYouTubePlayerState extends State<_FullscreenYouTubePlayer> {
  VideoPlayerController? _vpc;
  ChewieController? _chewie;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    // Use pre-fetched URL if available, otherwise fetch
    final url = widget.streamUrl ?? await _getYouTubeStreamUrl(widget.videoId);
    if (!mounted) return;
    if (url == null) {
      setState(() { _loading = false; _error = 'Video yüklenemedi'; });
      return;
    }
    _vpc = VideoPlayerController.networkUrl(Uri.parse(url));
    await _vpc!.initialize();
    if (!mounted) return;
    // Seek to position from mini player
    if (widget.startAt > Duration.zero) {
      await _vpc!.seekTo(widget.startAt);
    }
    _chewie = ChewieController(
      videoPlayerController: _vpc!,
      autoPlay: true,
      allowFullScreen: true,
      showControls: true,
      allowMuting: true,
    );
    setState(() => _loading = false);
  }

  @override
  void dispose() {
    _chewie?.dispose();
    _vpc?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(children: [
        if (_chewie != null && !_loading)
          Center(child: AspectRatio(
            aspectRatio: _vpc!.value.aspectRatio,
            child: Chewie(controller: _chewie!),
          ))
        else if (_error != null)
          Center(child: Text(_error!, style: const TextStyle(color: Colors.white70, fontSize: 14)))
        else
          const Center(child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2)),
        Positioned(top: 8, left: 8,
          child: SafeArea(child: GestureDetector(
            onTap: () => Navigator.of(context).pop(),
            child: Container(
              width: 36, height: 36,
              decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.6), shape: BoxShape.circle),
              child: const Icon(Icons.close, color: Colors.white, size: 18),
            ),
          ))),
      ]),
    );
  }
}
