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
  late final YoutubePlayerController _ytCtrl;

  static const _playerW = 300.0;
  static const _playerH = 169.0;

  @override
  void initState() {
    super.initState();
    _ytCtrl = YoutubePlayerController.fromVideoId(
      videoId: widget.videoId,
      autoPlay: true,
      params: const YoutubePlayerParams(
        showControls: true,
        showFullscreenButton: false,
      ),
    );
  }

  @override
  void dispose() {
    _ytCtrl.close();
    super.dispose();
  }

  void _openFullscreen() {
    Navigator.of(context, rootNavigator: true).push(
      PageRouteBuilder(
        fullscreenDialog: true,
        transitionDuration: const Duration(milliseconds: 250),
        reverseTransitionDuration: const Duration(milliseconds: 200),
        pageBuilder: (_, __, ___) => _FullscreenYouTubePlayer(
          videoId: widget.videoId,
          title: widget.title,
        ),
        transitionsBuilder: (_, anim, __, child) =>
            FadeTransition(opacity: anim, child: child),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    if (!_positionSet) {
      _dx = size.width - _playerW - 12;
      _dy = size.height - _playerH - 100;
      _positionSet = true;
    }

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
              Positioned.fill(
                child: YoutubePlayer(
                  controller: _ytCtrl,
                  aspectRatio: _playerW / _playerH,
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
}

// ═══════════════════════════════════════════════════════════
// FULLSCREEN PLAYER — WebView embed, 1080p+
// ═══════════════════════════════════════════════════════════

class _FullscreenYouTubePlayer extends StatefulWidget {
  final String videoId;
  final String title;
  // existingController kept for API compat but no longer used
  // ignore: unused_element
  const _FullscreenYouTubePlayer({
    required this.videoId,
    required this.title,
    VideoPlayerController? existingController,
  });

  @override
  State<_FullscreenYouTubePlayer> createState() =>
      _FullscreenYouTubePlayerState();
}

class _FullscreenYouTubePlayerState extends State<_FullscreenYouTubePlayer> {
  late final YoutubePlayerController _ytCtrl;
  bool _isLandscape = false;

  @override
  void initState() {
    super.initState();
    _ytCtrl = YoutubePlayerController.fromVideoId(
      videoId: widget.videoId,
      autoPlay: true,
      params: const YoutubePlayerParams(
        showControls: true,
        showFullscreenButton: true,
      ),
    );
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
    _ytCtrl.close();
    SystemChrome.setPreferredOrientations(DeviceOrientation.values);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final topPadding = MediaQuery.of(context).padding.top;
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          const Positioned.fill(child: ColoredBox(color: Colors.black)),
          Center(
            child: YoutubePlayer(
              controller: _ytCtrl,
              aspectRatio: 16 / 9,
            ),
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
// IN-APP PLAYER (liste kartından doğrudan açılır)
// ═══════════════════════════════════════════════════════════

class _InAppYouTubePlayer extends StatefulWidget {
  final String videoId;
  const _InAppYouTubePlayer({required this.videoId});

  @override
  State<_InAppYouTubePlayer> createState() => _InAppYouTubePlayerState();
}

class _InAppYouTubePlayerState extends State<_InAppYouTubePlayer> {
  late final YoutubePlayerController _ytCtrl;
  bool _isLandscape = false;

  @override
  void initState() {
    super.initState();
    _ytCtrl = YoutubePlayerController.fromVideoId(
      videoId: widget.videoId,
      autoPlay: true,
      params: const YoutubePlayerParams(
        showControls: true,
        showFullscreenButton: true,
      ),
    );
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
    _ytCtrl.close();
    SystemChrome.setPreferredOrientations(DeviceOrientation.values);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final topPadding = MediaQuery.of(context).padding.top;
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          const Positioned.fill(child: ColoredBox(color: Colors.black)),
          Center(
            child: YoutubePlayer(
              controller: _ytCtrl,
              aspectRatio: 16 / 9,
            ),
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
// YARDIMCI — mevcut en yüksek kaliteli muxed stream'i seç
// ═══════════════════════════════════════════════════════════

yt_explode.MuxedStreamInfo _bestMuxed(yt_explode.StreamManifest manifest) {
  final sorted = manifest.muxed.sortByBitrate();
  if (sorted.isEmpty) return manifest.muxed.withHighestBitrate();
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
