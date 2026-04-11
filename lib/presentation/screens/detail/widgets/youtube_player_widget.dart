part of '../product_detail_screen.dart';

// ═══════════════════════════════════════════════════════════
// IN-APP YOUTUBE PLAYER (fullscreen route)
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
        enableCaption: false,
        playsInline: false,
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
          actions: [
            IconButton(
              icon: const Icon(Icons.open_in_new_rounded, size: 20),
              tooltip: 'YouTube\'da Aç',
              onPressed: () => _openInYouTube(widget.videoId),
            ),
          ],
        ),
        body: Center(child: player),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// FLOATING YOUTUBE PLAYER (mini draggable PiP)
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
  bool _playerError = false;
  bool _isPlaying = false;
  late YoutubePlayerController _controller;

  @override
  void initState() {
    super.initState();
    _controller = YoutubePlayerController(
      params: const YoutubePlayerParams(
        mute: false,
        showControls: false,
        enableCaption: false,
        playsInline: true,
      ),
    )..loadVideoById(videoId: widget.videoId);

    // Hata tespiti
    _controller.stream.listen((value) {
      if (!mounted) return;
      if (value.hasError) {
        setState(() => _playerError = true);
      }
      if (value.playerState == PlayerState.playing) {
        setState(() { _isPlaying = true; _playerError = false; });
      }
    });

    // 4 saniye sonra hâlâ oynatılmadıysa hata say
    Future.delayed(const Duration(seconds: 6), () {
      if (mounted && !_isPlaying) {
        setState(() => _playerError = true);
      }
    });
  }

  @override
  void dispose() {
    _controller.close();
    super.dispose();
  }

  void _openFullscreen() {
    _controller.pauseVideo();
    setState(() => _hidden = true);
    Navigator.of(context, rootNavigator: true).push(PageRouteBuilder(
      fullscreenDialog: true,
      transitionDuration: const Duration(milliseconds: 200),
      reverseTransitionDuration: const Duration(milliseconds: 150),
      pageBuilder: (_, __, ___) => _FullscreenYouTubePlayer(videoId: widget.videoId),
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

                // ── Hata durumu: thumbnail + YouTube'da Aç ──
                if (_playerError)
                  Positioned.fill(
                    child: _ErrorFallback(
                      videoId: widget.videoId,
                      thumbnailUrl: thumb,
                      title: widget.title,
                    ),
                  )
                else ...[
                  // YouTube IFrame player
                  Positioned.fill(
                    child: YoutubePlayer(
                      controller: _controller,
                      aspectRatio: playerW / playerH,
                    ),
                  ),
                  // Loading shimmer — player hazır olana kadar thumbnail göster
                  _YoutubeLoadingOverlay(
                    controller: _controller,
                    thumbnailUrl: thumb,
                  ),
                ],

                // ── Top overlay: drag handle + fullscreen + close ──
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
                      if (!_playerError)
                        _PipIconBtn(
                          icon: Icons.fullscreen,
                          onTap: _openFullscreen,
                        ),
                      _PipIconBtn(
                        icon: Icons.open_in_new_rounded,
                        onTap: () => _openInYouTube(widget.videoId),
                      ),
                      _PipIconBtn(
                        icon: Icons.close,
                        onTap: widget.onClose,
                        margin: const EdgeInsets.only(right: 6),
                      ),
                    ]),
                  )),

                // ── Bottom: title ──
                if (!_playerError)
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
        enableCaption: false,
        playsInline: false,
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
            child: SafeArea(child: Row(children: [
              GestureDetector(
                onTap: () => Navigator.of(context).pop(),
                child: Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.6),
                    shape: BoxShape.circle),
                  child: const Icon(Icons.close, color: Colors.white, size: 18),
                )),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: () => _openInYouTube(widget.videoId),
                child: Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.6),
                    shape: BoxShape.circle),
                  child: const Icon(Icons.open_in_new_rounded,
                    color: Colors.white, size: 16),
                )),
            ]))),
        ]),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// YARDIMCI WİDGET'LAR
// ═══════════════════════════════════════════════════════════

/// Hata/embed yasağı durumunda thumbnail + YouTube'da Aç butonu
class _ErrorFallback extends StatelessWidget {
  final String videoId;
  final String thumbnailUrl;
  final String title;
  const _ErrorFallback({
    required this.videoId,
    required this.thumbnailUrl,
    required this.title,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(fit: StackFit.expand, children: [
      Image.network(thumbnailUrl, fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => Container(color: Colors.black)),
      Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter, end: Alignment.bottomCenter,
            colors: [
              Colors.black.withValues(alpha: 0.3),
              Colors.black.withValues(alpha: 0.8),
            ])),
      ),
      Center(
        child: GestureDetector(
          onTap: () => _openInYouTube(videoId),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: BoxDecoration(
              color: const Color(0xFFFF0000),
              borderRadius: BorderRadius.circular(24)),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.play_arrow_rounded,
                color: Colors.white, size: 20),
              const SizedBox(width: 6),
              Text('YouTube\'da İzle',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12, fontWeight: FontWeight.w700,
                  color: Colors.white)),
            ]),
          ),
        ),
      ),
      Positioned(bottom: 8, left: 8, right: 8,
        child: Text(title,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 10, fontWeight: FontWeight.w600,
            color: Colors.white.withValues(alpha: 0.9)),
          maxLines: 2, overflow: TextOverflow.ellipsis)),
    ]);
  }
}

/// Player yüklenirken thumbnail gösterir, hazır olunca kaybolur
class _YoutubeLoadingOverlay extends StatefulWidget {
  final YoutubePlayerController controller;
  final String thumbnailUrl;
  const _YoutubeLoadingOverlay({
    required this.controller,
    required this.thumbnailUrl,
  });

  @override
  State<_YoutubeLoadingOverlay> createState() => _YoutubeLoadingOverlayState();
}

class _YoutubeLoadingOverlayState extends State<_YoutubeLoadingOverlay> {
  bool _visible = true;

  @override
  void initState() {
    super.initState();
    widget.controller.stream.listen((value) {
      if (!mounted) return;
      if (value.playerState != PlayerState.unknown) {
        setState(() => _visible = false);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!_visible) return const SizedBox.shrink();
    return Positioned.fill(
      child: Stack(fit: StackFit.expand, children: [
        Image.network(widget.thumbnailUrl, fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => Container(color: Colors.black)),
        Container(color: Colors.black.withValues(alpha: 0.35)),
        const Center(child: SizedBox(
          width: 28, height: 28,
          child: CircularProgressIndicator(
            strokeWidth: 2.5,
            valueColor: AlwaysStoppedAnimation<Color>(Colors.white)),
        )),
      ]),
    );
  }
}

/// PiP overlay'deki küçük ikon butonu
class _PipIconBtn extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final EdgeInsets margin;
  const _PipIconBtn({
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
          color: Colors.black.withValues(alpha: 0.55),
          shape: BoxShape.circle),
        child: Icon(icon, size: 14, color: Colors.white),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// YARDIMCI FONKSİYONLAR
// ═══════════════════════════════════════════════════════════

void _openInYouTube(String videoId) {
  final uri = Uri.parse('https://www.youtube.com/watch?v=$videoId');
  launchUrl(uri, mode: LaunchMode.externalApplication);
}

/// YouTube metadata (title, thumbnail) — sadece youtube_explode_dart kullanır
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
