part of '../product_detail_screen.dart';

// ═══════════════════════════════════════════════════════════
// IN-APP YOUTUBE PLAYER (fullscreen route)
// youtube_player_iframe — official YT embed, no stream expiry
// ═══════════════════════════════════════════════════════════

class _InAppYouTubePlayer extends StatefulWidget {
  final String videoId;
  const _InAppYouTubePlayer({required this.videoId});
  @override
  State<_InAppYouTubePlayer> createState() => _InAppYouTubePlayerState();
}

class _InAppYouTubePlayerState extends State<_InAppYouTubePlayer> {
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
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.close_rounded),
            onPressed: () => Navigator.of(context).pop(),
          ),
          title: Text(
            context.l10n?.video ?? 'Video',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 16, fontWeight: FontWeight.w600, color: Colors.white),
          ),
        ),
        body: Center(child: player),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// FLOATING YOUTUBE PLAYER (mini draggable PiP)
// youtube_player_iframe embedded in draggable overlay
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
      pageBuilder: (_, __, ___) => _FullscreenYouTubePlayer(
        videoId: widget.videoId,
      ),
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
              boxShadow: [BoxShadow(
                color: Colors.black.withValues(alpha: 0.5),
                blurRadius: 20, offset: const Offset(0, 6))],
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: Stack(children: [
                // YouTube IFrame player
                Positioned.fill(
                  child: YoutubePlayer(
                    controller: _controller,
                    aspectRatio: playerW / playerH,
                  ),
                ),
                // Gradient overlay top
                Positioned(top: 0, left: 0, right: 0,
                  child: Container(
                    height: 36,
                    decoration: BoxDecoration(gradient: LinearGradient(
                      begin: Alignment.topCenter, end: Alignment.bottomCenter,
                      colors: [
                        Colors.black.withValues(alpha: 0.7),
                        Colors.transparent],
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
                          child: const Icon(Icons.fullscreen,
                            size: 16, color: Colors.white),
                        )),
                      GestureDetector(
                        onTap: widget.onClose,
                        child: Container(
                          width: 28, height: 28,
                          margin: const EdgeInsets.only(right: 6),
                          decoration: BoxDecoration(
                            color: Colors.black.withValues(alpha: 0.55),
                            shape: BoxShape.circle),
                          child: const Icon(Icons.close,
                            size: 14, color: Colors.white),
                        )),
                    ]),
                  )),
                // Title bottom
                Positioned(bottom: 0, left: 0, right: 0,
                  child: IgnorePointer(child: Container(
                    padding: const EdgeInsets.fromLTRB(8, 10, 8, 6),
                    decoration: BoxDecoration(gradient: LinearGradient(
                      begin: Alignment.bottomCenter, end: Alignment.topCenter,
                      colors: [
                        Colors.black.withValues(alpha: 0.8),
                        Colors.transparent],
                    )),
                    child: Text(widget.title,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 9, fontWeight: FontWeight.w600,
                        color: Colors.white),
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
// FULLSCREEN YOUTUBE PLAYER (route)
// ═══════════════════════════════════════════════════════════

class _FullscreenYouTubePlayer extends StatefulWidget {
  final String videoId;
  const _FullscreenYouTubePlayer({required this.videoId});
  @override
  State<_FullscreenYouTubePlayer> createState() => _FullscreenYouTubePlayerState();
}

class _FullscreenYouTubePlayerState extends State<_FullscreenYouTubePlayer> {
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

// ═══════════════════════════════════════════════════════════
// youtube_explode_dart — ONLY for metadata (title, thumbnail)
// ═══════════════════════════════════════════════════════════

/// Fetches video metadata (title, thumbnail) only — no stream extraction.
Future<({String title, String thumbnail})> _getYouTubeMetadata(String videoId) async {
  try {
    final yte = yt_explode.YoutubeExplode();
    final video = await yte.videos.get(videoId);
    yte.close();
    return (
      title: video.title,
      thumbnail: video.thumbnails.mediumResUrl,
    );
  } catch (_) {
    return (
      title: '',
      thumbnail: 'https://img.youtube.com/vi/$videoId/mqdefault.jpg',
    );
  }
}
