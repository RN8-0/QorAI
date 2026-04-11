part of '../product_detail_screen.dart';

// ═══════════════════════════════════════════════════════════
// FLOATING YOUTUBE PLAYER (mini draggable PiP)
// WebView tabanlı — video direkt mini ekranda oynar
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
  bool _loading = true;
  late final WebViewController _controller;

  static const _playerW = 300.0;
  static const _playerH = 169.0; // 16:9

  // Mobil YouTube — embed kısıtlaması yok
  String get _youtubeUrl =>
      'https://m.youtube.com/watch?v=${widget.videoId}&autoplay=1';

  static const _mobileUA =
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setUserAgent(_mobileUA)
      ..setBackgroundColor(Colors.black)
      ..setNavigationDelegate(NavigationDelegate(
        onPageFinished: (_) {
          if (mounted) setState(() => _loading = false);
        },
        onWebResourceError: (_) {
          if (mounted) setState(() => _loading = false);
        },
        onNavigationRequest: (req) => _allowNav(req.url),
      ))
      ..loadRequest(Uri.parse(_youtubeUrl));
  }

  NavigationDecision _allowNav(String url) {
    final host = Uri.tryParse(url)?.host ?? '';
    const allowed = [
      'youtube.com', 'googlevideo.com', 'ytimg.com',
      'googleapis.com', 'google.com', 'gstatic.com',
    ];
    return allowed.any((d) => host.contains(d))
        ? NavigationDecision.navigate
        : NavigationDecision.prevent;
  }

  void _openFullscreen() {
    setState(() => _hidden = true);
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
              // WebView — video direkt oynar
              Positioned.fill(
                child: WebViewWidget(controller: _controller),
              ),

              // Yüklenirken spinner
              if (_loading)
                Positioned.fill(
                  child: Container(
                    color: Colors.black,
                    child: const Center(
                      child: CircularProgressIndicator(
                        color: Colors.red, strokeWidth: 2),
                    ),
                  ),
                ),

              // Üst şerit — DRAG HANDLE + fullscreen + kapat
              // (sadece bu şerit sürüklemeyi yakalar, video kontrollerine dokunmaz)
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
                      // Drag handle göstergesi
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
// FULLSCREEN YOUTUBE PLAYER — WebView tabanlı
// ═══════════════════════════════════════════════════════════

class _FullscreenYouTubePlayer extends StatefulWidget {
  final String videoId;
  final String title;
  const _FullscreenYouTubePlayer({required this.videoId, required this.title});

  @override
  State<_FullscreenYouTubePlayer> createState() =>
      _FullscreenYouTubePlayerState();
}

class _FullscreenYouTubePlayerState extends State<_FullscreenYouTubePlayer> {
  late final WebViewController _webViewController;
  bool _loading = true;

  String get _youtubeUrl =>
      'https://m.youtube.com/watch?v=${widget.videoId}&autoplay=1&fs=1';

  static const _mobileUA =
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

  @override
  void initState() {
    super.initState();
    _webViewController = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setUserAgent(_mobileUA)
      ..setBackgroundColor(Colors.black)
      ..setNavigationDelegate(NavigationDelegate(
        onPageStarted: (_) {
          if (mounted) setState(() => _loading = true);
        },
        onPageFinished: (_) {
          if (mounted) setState(() => _loading = false);
        },
        onWebResourceError: (_) {
          if (mounted) setState(() => _loading = false);
        },
        onNavigationRequest: (request) {
          final host = Uri.tryParse(request.url)?.host ?? '';
          const allowed = [
            'youtube.com', 'googlevideo.com', 'ytimg.com',
            'googleapis.com', 'google.com', 'gstatic.com',
            'accounts.google.com',
          ];
          return allowed.any((d) => host.contains(d))
              ? NavigationDecision.navigate
              : NavigationDecision.prevent;
        },
      ))
      ..loadRequest(Uri.parse(_youtubeUrl));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
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
        title: Text(
          widget.title.isNotEmpty ? widget.title : 'Video',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 14, fontWeight: FontWeight.w600, color: Colors.white),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
      body: Stack(children: [
        WebViewWidget(controller: _webViewController),
        if (_loading)
          const Center(
            child: CircularProgressIndicator(color: Colors.red),
          ),
      ]),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// IN-APP YOUTUBE PLAYER (liste kartından doğrudan açılır)
// ═══════════════════════════════════════════════════════════

class _InAppYouTubePlayer extends StatefulWidget {
  final String videoId;
  const _InAppYouTubePlayer({required this.videoId});

  @override
  State<_InAppYouTubePlayer> createState() => _InAppYouTubePlayerState();
}

class _InAppYouTubePlayerState extends State<_InAppYouTubePlayer> {
  late final WebViewController _webViewController;
  bool _loading = true;

  String get _youtubeUrl =>
      'https://m.youtube.com/watch?v=${widget.videoId}&autoplay=1&fs=1';

  static const _mobileUA =
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

  @override
  void initState() {
    super.initState();
    _webViewController = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setUserAgent(_mobileUA)
      ..setBackgroundColor(Colors.black)
      ..setNavigationDelegate(NavigationDelegate(
        onPageStarted: (_) {
          if (mounted) setState(() => _loading = true);
        },
        onPageFinished: (_) {
          if (mounted) setState(() => _loading = false);
        },
        onWebResourceError: (_) {
          if (mounted) setState(() => _loading = false);
        },
        onNavigationRequest: (request) {
          final host = Uri.tryParse(request.url)?.host ?? '';
          const allowed = [
            'youtube.com', 'googlevideo.com', 'ytimg.com',
            'googleapis.com', 'google.com', 'gstatic.com',
          ];
          return allowed.any((d) => host.contains(d))
              ? NavigationDecision.navigate
              : NavigationDecision.prevent;
        },
      ))
      ..loadRequest(Uri.parse(_youtubeUrl));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
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
      body: Stack(children: [
        WebViewWidget(controller: _webViewController),
        if (_loading)
          const Center(
            child: CircularProgressIndicator(color: Colors.red),
          ),
      ]),
    );
  }
}

// ═══════════════════════════════════════════════════════════
// YARDIMCI WİDGET'LAR
// ═══════════════════════════════════════════════════════════

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
