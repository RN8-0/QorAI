part of '../product_detail_screen.dart';

// ═══════════════════════════════════════════════════════════
// FLOATING YOUTUBE PLAYER (mini draggable PiP)
// Küçük sürüklenebilir player — YouTube IFrame kontrolleri
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
  bool _hasError = false;
  bool _showOverlay = true;
  late YoutubePlayerController _controller;

  static const _playerW = 300.0;
  static const _playerH = 169.0; // 16:9

  @override
  void initState() {
    super.initState();
    _controller = YoutubePlayerController(
      params: const YoutubePlayerParams(
        mute: false,
        showControls: true,
        showFullscreenButton: false, // Kendi fullscreen butonumuzu kullanıyoruz
        enableCaption: false,
        playsInline: true,
        color: 'white',
      ),
    )..loadVideoById(videoId: widget.videoId);

    _controller.stream.listen((value) {
      if (!mounted) return;
      if (value.hasError) {
        setState(() => _hasError = true);
      }
      // Video oynatılınca overlay'i gizle
      if (value.playerState == PlayerState.playing) {
        if (_showOverlay) setState(() => _showOverlay = false);
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
    Navigator.of(context, rootNavigator: true).push(
      PageRouteBuilder(
        fullscreenDialog: true,
        transitionDuration: const Duration(milliseconds: 250),
        reverseTransitionDuration: const Duration(milliseconds: 200),
        pageBuilder: (_, __, ___) => _FullscreenYouTubePlayer(
          videoId: widget.videoId,
          controller: _controller,
        ),
        transitionsBuilder: (_, anim, __, child) =>
            FadeTransition(opacity: anim, child: child),
      ),
    ).then((_) {
      if (mounted) setState(() => _hidden = false);
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
        child: GestureDetector(
          onPanUpdate: (d) {
            setState(() {
              _dx = (_dx + d.delta.dx).clamp(0.0, size.width - _playerW);
              _dy = (_dy + d.delta.dy).clamp(0.0, size.height - _playerH);
            });
          },
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
              child: _hasError
                  ? _InAppErrorWidget(videoId: widget.videoId, title: widget.title, thumbnailUrl: thumb, onClose: widget.onClose)
                  : Stack(children: [
                      // YouTube IFrame — tüm kontroller (oynat/durdur, ileri/geri, ses)
                      Positioned.fill(
                        child: YoutubePlayer(
                          controller: _controller,
                          aspectRatio: _playerW / _playerH,
                        ),
                      ),

                      // Yükleme sırasında thumbnail
                      if (_showOverlay)
                        Positioned.fill(
                          child: _ThumbnailOverlay(
                            thumbnailUrl: thumb,
                            onTap: () {
                              setState(() => _showOverlay = false);
                              _controller.playVideo();
                            },
                          ),
                        ),

                      // Sürükleme + fullscreen + kapat — sadece üst şeridi
                      Positioned(top: 0, left: 0, right: 0,
                        child: GestureDetector(
                          // Üst şeridi sürükleme için kullan
                          behavior: HitTestBehavior.translucent,
                          child: Container(
                            height: 36,
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                                colors: [
                                  Colors.black.withValues(alpha: 0.65),
                                  Colors.transparent,
                                ],
                              ),
                            ),
                            child: Row(children: [
                              const SizedBox(width: 8),
                              // Drag handle
                              Container(
                                width: 24, height: 3,
                                decoration: BoxDecoration(
                                  color: Colors.white.withValues(alpha: 0.5),
                                  borderRadius: BorderRadius.circular(2)),
                              ),
                              const Spacer(),
                              // Fullscreen
                              _MiniBtn(
                                icon: Icons.fullscreen_rounded,
                                onTap: _openFullscreen,
                              ),
                              // Kapat
                              _MiniBtn(
                                icon: Icons.close_rounded,
                                onTap: widget.onClose,
                                margin: const EdgeInsets.only(right: 6),
                              ),
                            ]),
                          ),
                        )),

                      // Alt şerit: başlık
                      Positioned(bottom: 0, left: 0, right: 0,
                        child: IgnorePointer(
                          child: Container(
                            padding: const EdgeInsets.fromLTRB(8, 12, 8, 6),
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.bottomCenter,
                                end: Alignment.topCenter,
                                colors: [
                                  Colors.black.withValues(alpha: 0.75),
                                  Colors.transparent,
                                ],
                              ),
                            ),
                            child: Text(widget.title,
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 9, fontWeight: FontWeight.w600,
                                color: Colors.white),
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                          ),
                        )),
                    ]),
            ),
          ),
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// FULLSCREEN YOUTUBE PLAYER
// Aynı controller — video kesmeden devam eder
// ═══════════════════════════════════════════════════════════

class _FullscreenYouTubePlayer extends StatefulWidget {
  final String videoId;
  final YoutubePlayerController? controller; // Var olan controller'ı al
  const _FullscreenYouTubePlayer({required this.videoId, this.controller});

  @override
  State<_FullscreenYouTubePlayer> createState() => _FullscreenYouTubePlayerState();
}

class _FullscreenYouTubePlayerState extends State<_FullscreenYouTubePlayer> {
  late YoutubePlayerController _controller;
  bool _ownController = false;

  @override
  void initState() {
    super.initState();
    if (widget.controller != null) {
      // Mini player'dan gelen controller'ı yeniden kullan
      _controller = widget.controller!;
      _ownController = false;
    } else {
      _ownController = true;
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
  }

  @override
  void dispose() {
    if (_ownController) _controller.close();
    else _controller.pauseVideo(); // Mini player'a dönünce duraklatılmış olsun
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return YoutubePlayerScaffold(
      controller: _controller,
      aspectRatio: 16 / 9,
      enableFullScreenOnVerticalDrag: true,
      builder: (ctx, player) => Scaffold(
        backgroundColor: Colors.black,
        body: Stack(children: [
          Center(child: player),
          // Geri butonu
          Positioned(
            top: 0, left: 0,
            child: SafeArea(
              child: IconButton(
                icon: Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.55),
                    shape: BoxShape.circle),
                  child: const Icon(Icons.arrow_back_rounded,
                    color: Colors.white, size: 20),
                ),
                onPressed: () => Navigator.of(context).pop(),
              ),
            )),
        ]),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// IN-APP YOUTUBE PLAYER (doğrudan fullscreen açılır)
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
      enableFullScreenOnVerticalDrag: true,
      builder: (ctx, player) => Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.black,
          foregroundColor: Colors.white,
          elevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_rounded),
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
// YARDIMCI WİDGET'LAR
// ═══════════════════════════════════════════════════════════

/// Yükleme sırasında thumbnail + oynat butonu
class _ThumbnailOverlay extends StatelessWidget {
  final String thumbnailUrl;
  final VoidCallback onTap;
  const _ThumbnailOverlay({required this.thumbnailUrl, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Stack(fit: StackFit.expand, children: [
        Image.network(thumbnailUrl, fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => Container(color: const Color(0xFF1A1A1A))),
        Container(color: Colors.black.withValues(alpha: 0.3)),
        Center(
          child: Container(
            width: 48, height: 48,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.92),
              shape: BoxShape.circle,
              boxShadow: [BoxShadow(
                color: Colors.black.withValues(alpha: 0.3),
                blurRadius: 12)]),
            child: const Icon(Icons.play_arrow_rounded,
              color: Color(0xFF1A1A1A), size: 30),
          ),
        ),
      ]),
    );
  }
}

/// Video embed edilemeyen durumlarda uygulama içi hata
class _InAppErrorWidget extends StatelessWidget {
  final String videoId;
  final String title;
  final String thumbnailUrl;
  final VoidCallback onClose;
  const _InAppErrorWidget({
    required this.videoId,
    required this.title,
    required this.thumbnailUrl,
    required this.onClose,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(fit: StackFit.expand, children: [
      Image.network(thumbnailUrl, fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => Container(color: const Color(0xFF1A1A1A))),
      Container(color: Colors.black.withValues(alpha: 0.6)),
      Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(Icons.videocam_off_rounded,
          color: Colors.white.withValues(alpha: 0.5), size: 32),
        const SizedBox(height: 8),
        Text('Video oynatılamıyor',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 12, fontWeight: FontWeight.w600,
            color: Colors.white.withValues(alpha: 0.7))),
        const SizedBox(height: 4),
        Text('Bu video gömülü oynatmaya kapalı',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 10, color: Colors.white.withValues(alpha: 0.4)),
          textAlign: TextAlign.center),
      ]),
      Positioned(top: 6, right: 6,
        child: _MiniBtn(icon: Icons.close_rounded, onTap: onClose)),
    ]);
  }
}

/// Mini overlay'deki ikon butonu
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
// METADATA (youtube_explode_dart — sadece başlık/thumbnail)
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
