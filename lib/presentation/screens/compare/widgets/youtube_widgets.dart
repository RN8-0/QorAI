part of '../compare_screen.dart';

class _CompareYouTubeSection extends ConsumerStatefulWidget {
  final List<ProductEntity> products;
  const _CompareYouTubeSection({required this.products});

  @override
  ConsumerState<_CompareYouTubeSection> createState() =>
      _CompareYouTubeSectionState();
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
      if (mounted) {
        setState(() {
          _videos = _videoCache[cacheKey];
          _loading = false;
        });
      }
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
      if (mounted) {
        setState(() {
          _videos = videos;
          _loading = false;
        });
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = error.toString();
          _loading = false;
        });
      }
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
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.red.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(
                    Icons.play_circle_fill,
                    color: AppTheme.error,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    context.l10n?.youtubeReviews ?? 'YouTube Incelemeleri',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: context.textPrimary,
                    ),
                  ),
                ),
                Icon(
                  _expanded
                      ? Icons.expand_less_rounded
                      : Icons.expand_more_rounded,
                  color: theme.colorScheme.primary,
                ),
              ],
            ),
            if (_expanded) ...[
              const SizedBox(height: 12),
              if (_loading)
                Column(
                  children: List.generate(
                    3,
                    (index) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Container(
                        height: 68,
                        decoration: BoxDecoration(
                          color: context.surfaceColor,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 120,
                              height: 68,
                              decoration: BoxDecoration(
                                color: theme.colorScheme.primary.withValues(
                                  alpha: 0.08,
                                ),
                                borderRadius: BorderRadius.circular(8),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Container(
                                    height: 12,
                                    width: double.infinity,
                                    decoration: BoxDecoration(
                                      color: theme.colorScheme.primary.withValues(
                                        alpha: 0.08,
                                      ),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Container(
                                    height: 10,
                                    width: 100,
                                    decoration: BoxDecoration(
                                      color: theme.colorScheme.primary.withValues(
                                        alpha: 0.05,
                                      ),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      )
                          .animate(onPlay: (controller) => controller.repeat())
                          .shimmer(
                            duration: 1200.ms,
                            color: theme.colorScheme.primary.withValues(
                              alpha: 0.06,
                            ),
                          ),
                    ),
                  ),
                )
              else if (_videos == null || _videos!.isEmpty)
                Text(
                  _error != null
                      ? 'Video yuklenemedi'
                      : 'Karsilastirma videosu bulunamadi',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 13,
                    color: context.textTertiaryColor,
                  ),
                )
              else
                ..._videos!.map(
                  (video) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _CompareVideoTile(video: video),
                  ),
                ),
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
        child: Row(
          children: [
            Stack(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.network(
                    video.thumbnailUrl.isNotEmpty
                        ? video.thumbnailUrl
                        : 'https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg',
                    width: 120,
                    height: 68,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      width: 120,
                      height: 68,
                      color: Colors.grey[800],
                      child: const Icon(
                        Icons.play_circle_outline,
                        color: AppTheme.youtube,
                      ),
                    ),
                  ),
                ),
                if (video.duration.isNotEmpty)
                  Positioned(
                    bottom: 4,
                    right: 4,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 5,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.8),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        video.duration,
                        style: const TextStyle(
                          fontSize: 10,
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    video.title,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: context.textPrimary,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (video.channelTitle.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(
                      video.channelTitle,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11,
                        color: context.textTertiaryColor,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                  if (video.viewCount.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Text(
                          video.viewCount,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 10,
                            color: context.textTertiaryColor,
                          ),
                        ),
                        if (video.qualityBadge.isNotEmpty) ...[
                          const SizedBox(width: 4),
                          Text(
                            video.qualityBadge,
                            style: const TextStyle(fontSize: 10),
                          ),
                        ],
                      ],
                    ),
                  ],
                ],
              ),
            ),
            const Icon(
              Icons.play_circle_filled,
              size: 16,
              color: AppTheme.youtube,
            ),
          ],
        ),
      ),
    );
  }

  void _openVideo(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => _NativeCompareVideoPlayer(
          videoId: video.videoId,
          title: video.title,
        ),
      ),
    );
  }
}

class _CompareYouTubeQualityOption {
  final String label;
  final String url;
  final int rank;

  const _CompareYouTubeQualityOption({
    required this.label,
    required this.url,
    required this.rank,
  });
}

Future<yt_explode.StreamManifest> _loadCompareYouTubeManifest(
  String videoId,
) async {
  final yte = yt_explode.YoutubeExplode();
  try {
    // safari client provides high-quality HLS streams (720p–1080p+).
    // android client is added as fallback for muxed streams.
    return await yte.videos.streamsClient.getManifest(
      videoId,
      ytClients: [
        yt_explode.YoutubeApiClient.safari,
        yt_explode.YoutubeApiClient.android,
      ],
    );
  } finally {
    yte.close();
  }
}

List<_CompareYouTubeQualityOption> _buildCompareQualityOptions(
  yt_explode.StreamManifest manifest,
) {
  final hlsStreams = manifest.hls
      .whereType<yt_explode.HlsMuxedStreamInfo>()
      .toList(growable: false);
  final Iterable<yt_explode.VideoStreamInfo> playableStreams =
      hlsStreams.isNotEmpty ? hlsStreams : manifest.muxed.sortByBitrate();

  final byLabel = <String, yt_explode.VideoStreamInfo>{};
  for (final stream in playableStreams) {
    final label = stream.qualityLabel.trim().isNotEmpty
        ? stream.qualityLabel.trim()
        : 'Best';
    byLabel[label] = stream;
  }

  return byLabel.entries
      .map(
        (entry) => _CompareYouTubeQualityOption(
          label: entry.key,
          url: entry.value.url.toString(),
          rank: _qualityRank(entry.key),
        ),
      )
      .toList()
    ..sort((a, b) {
      final rankCompare = b.rank.compareTo(a.rank);
      if (rankCompare != 0) return rankCompare;
      return b.label.compareTo(a.label);
    });
}

int _qualityRank(String label) {
  final match = RegExp(r'(\d+)').firstMatch(label);
  return int.tryParse(match?.group(1) ?? '') ?? 0;
}

_CompareYouTubeQualityOption _preferredCompareQuality(
  List<_CompareYouTubeQualityOption> options,
) {
  if (options.isEmpty) {
    throw StateError('No playable YouTube streams found');
  }
  for (final option in options) {
    if (option.rank >= 1080) return option;
  }
  return options.first;
}

String _compareQualitySheetTitle(BuildContext context) {
  return Localizations.localeOf(context).languageCode == 'tr'
      ? 'Kalite sec'
      : 'Choose quality';
}

String _compareRetryVideoLabel(BuildContext context) {
  return Localizations.localeOf(context).languageCode == 'tr'
      ? 'Tekrar Dene'
      : 'Retry';
}

String _compareVideoLoadErrorLabel(BuildContext context) {
  return Localizations.localeOf(context).languageCode == 'tr'
      ? 'Video yuklenemedi'
      : 'Video could not be loaded';
}

class _CompareYouTubePlaybackSession {
  _CompareYouTubePlaybackSession({required this.videoId});

  final String videoId;
  VideoPlayerController? _videoController;
  List<_CompareYouTubeQualityOption> _qualityOptions = const [];
  _CompareYouTubeQualityOption? _selectedQuality;
  Future<void>? _loadingTask;
  bool _disposed = false;

  VideoPlayerController? get videoController => _videoController;
  List<_CompareYouTubeQualityOption> get qualityOptions => _qualityOptions;
  _CompareYouTubeQualityOption? get selectedQuality => _selectedQuality;
  bool get isPlaying => _videoController?.value.isPlaying ?? false;
  Duration get currentPosition =>
      _videoController?.value.position ?? Duration.zero;

  Future<void> ensureInitialized() async {
    if (_disposed) return;
    if (_videoController != null && _qualityOptions.isNotEmpty) return;

    final existingTask = _loadingTask;
    if (existingTask != null) {
      await existingTask;
      return;
    }

    final nextTask = _loadInitial();
    _loadingTask = nextTask;
    try {
      await nextTask;
    } finally {
      if (identical(_loadingTask, nextTask)) {
        _loadingTask = null;
      }
    }
  }

  Future<void> _loadInitial() async {
    final manifest = await _loadCompareYouTubeManifest(videoId);
    final options = _buildCompareQualityOptions(manifest);
    final initial = _preferredCompareQuality(options);
    await switchQuality(
      initial,
      options: options,
      resumeFrom: Duration.zero,
      autoplay: false,
    );
  }

  Future<void> play() async {
    await _videoController?.play();
  }

  Future<void> pause() async {
    await _videoController?.pause();
  }

  Future<void> switchQuality(
    _CompareYouTubeQualityOption option, {
    List<_CompareYouTubeQualityOption>? options,
    Duration? resumeFrom,
    bool autoplay = true,
  }) async {
    if (_disposed) return;

    final previousVideo = _videoController;
    final currentPosition = resumeFrom ??
        previousVideo?.value.position ??
        Duration.zero;
    final shouldPlay = autoplay || (previousVideo?.value.isPlaying ?? false);

    if (_selectedQuality?.label == option.label && previousVideo != null) {
      if (currentPosition > Duration.zero) {
        final duration = previousVideo.value.duration;
        final target = currentPosition > duration ? duration : currentPosition;
        await previousVideo.seekTo(target);
      }
      if (shouldPlay) {
        await previousVideo.play();
      }
      return;
    }

    final nextVideo = VideoPlayerController.networkUrl(
      Uri.parse(option.url),
      httpHeaders: const {
        'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Safari/605.1.15,gzip(gfe)',
        'Referer': 'https://www.youtube.com',
        'Origin': 'https://www.youtube.com',
      },
    );
    await nextVideo.initialize();
    if (currentPosition > Duration.zero) {
      final duration = nextVideo.value.duration;
      final target = currentPosition > duration ? duration : currentPosition;
      await nextVideo.seekTo(target);
    }

    _videoController = nextVideo;
    _qualityOptions = options ?? _qualityOptions;
    _selectedQuality = option;

    previousVideo?.dispose();
    if (shouldPlay) {
      await nextVideo.play();
    }
  }

  Future<void> dispose() async {
    _disposed = true;
    _loadingTask = null;
    final videoController = _videoController;
    _videoController = null;
    videoController?.dispose();
  }
}

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
  static const _playerW = 300.0;
  static const _playerH = 169.0;

  double _dx = -1;
  double _dy = -1;
  bool _positionSet = false;
  bool _hidden = false;
  bool _loading = true;
  bool _hasError = false;

  late final _CompareYouTubePlaybackSession _session;
  ChewieController? _chewieCtrl;

  @override
  void initState() {
    super.initState();
    _session = _CompareYouTubePlaybackSession(videoId: widget.videoId);
    _initPlayer();
  }

  Future<void> _initPlayer() async {
    try {
      await _session.ensureInitialized();
      await _session.play();
      await _attachFloatingController();
      if (!mounted) return;
      setState(() {
        _loading = false;
        _hasError = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _hasError = true;
      });
    }
  }

  Future<void> _attachFloatingController() async {
    final videoController = _session.videoController;
    if (videoController == null) return;

    final previousChewie = _chewieCtrl;
    final nextChewie = ChewieController(
      videoPlayerController: videoController,
      autoPlay: false,
      looping: false,
      showControls: false,
      aspectRatio: 16 / 9,
      allowFullScreen: false,
      allowPlaybackSpeedChanging: false,
      placeholder: Container(color: Colors.black),
    );

    if (!mounted) {
      nextChewie.dispose();
      return;
    }

    setState(() {
      _chewieCtrl = nextChewie;
    });
    previousChewie?.dispose();
  }

  Future<void> _openFullscreen() async {
    if (_loading || _hasError) return;

    final wasPlaying = _session.isPlaying;
    final previousChewie = _chewieCtrl;
    _chewieCtrl = null;
    previousChewie?.dispose();

    if (!mounted) return;
    setState(() => _hidden = true);
    final shouldResume = await Navigator.of(context, rootNavigator: true)
        .push(
          PageRouteBuilder(
            fullscreenDialog: true,
            transitionDuration: const Duration(milliseconds: 250),
            reverseTransitionDuration: const Duration(milliseconds: 200),
            pageBuilder: (_, __, ___) => _CompareFullscreenPlayer(
              title: widget.title,
              session: _session,
              playOnOpen: wasPlaying,
            ),
            transitionsBuilder: (_, anim, __, child) =>
                FadeTransition(opacity: anim, child: child),
          ),
        );

    if (!mounted) return;
    if (shouldResume ?? false) {
      await _session.play();
    }
    await _attachFloatingController();
    if (!mounted) return;
    setState(() {
      _hidden = false;
      _loading = false;
      _hasError = false;
    });
  }

  Widget _buildPoster(String thumb, {required bool isLoading}) {
    return Stack(
      fit: StackFit.expand,
      children: [
        Image.network(
          thumb,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => const ColoredBox(color: Colors.black),
        ),
        ColoredBox(color: Colors.black.withValues(alpha: 0.55)),
        Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (isLoading)
                const SizedBox(
                  width: 26,
                  height: 26,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.4,
                    color: Colors.white,
                  ),
                )
              else
                const Icon(
                  Icons.refresh_rounded,
                  color: Colors.white70,
                  size: 28,
                ),
              const SizedBox(height: 8),
              Text(
                isLoading ? 'Loading video...' : 'Tap to retry',
                style: GoogleFonts.plusJakartaSans(
                  color: Colors.white,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  @override
  void dispose() {
    _chewieCtrl?.dispose();
    unawaited(_session.dispose());
    super.dispose();
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
      left: _dx,
      top: _dy,
      child: Material(
        color: Colors.transparent,
        child: Container(
          width: _playerW,
          height: _playerH,
          decoration: BoxDecoration(
            color: Colors.black,
            borderRadius: BorderRadius.circular(14),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.55),
                blurRadius: 24,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: Stack(
              children: [
                Positioned.fill(
                  child: _loading
                      ? _buildPoster(thumb, isLoading: true)
                      : _hasError || _chewieCtrl == null
                      ? GestureDetector(
                          onTap: () {
                            setState(() {
                              _loading = true;
                              _hasError = false;
                            });
                            _initPlayer();
                          },
                          child: _buildPoster(thumb, isLoading: false),
                        )
                      : GestureDetector(
                          onTap: _openFullscreen,
                          child: Chewie(controller: _chewieCtrl!),
                        ),
                ),
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: GestureDetector(
                    behavior: HitTestBehavior.translucent,
                    onPanUpdate: (details) {
                      setState(() {
                        _dx = (_dx + details.delta.dx)
                            .clamp(0.0, size.width - _playerW);
                        _dy = (_dy + details.delta.dy)
                            .clamp(0.0, size.height - _playerH);
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
                      child: Row(
                        children: [
                          const SizedBox(width: 8),
                          Container(
                            width: 24,
                            height: 3,
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.5),
                              borderRadius: BorderRadius.circular(2),
                            ),
                          ),
                          const Spacer(),
                          if (!_loading && !_hasError)
                            _CmpIconBtn(
                              icon: Icons.fullscreen_rounded,
                              onTap: _openFullscreen,
                            ),
                          _CmpIconBtn(
                            icon: Icons.close_rounded,
                            onTap: widget.onClose,
                            margin: const EdgeInsets.only(right: 6),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CompareFullscreenPlayer extends StatelessWidget {
  final String title;
  final _CompareYouTubePlaybackSession session;
  final bool playOnOpen;

  const _CompareFullscreenPlayer({
    required this.title,
    required this.session,
    required this.playOnOpen,
  });

  @override
  Widget build(BuildContext context) {
    return _NativeComparePlayerScreen(
      title: title.isNotEmpty ? title : 'Video',
      session: session,
      playOnOpen: playOnOpen,
      ownsSession: false,
    );
  }
}

class _NativeCompareVideoPlayer extends StatelessWidget {
  final String videoId;
  final String title;

  const _NativeCompareVideoPlayer({
    required this.videoId,
    required this.title,
  });

  @override
  Widget build(BuildContext context) {
    return _NativeComparePlayerScreen(
      title: title.isNotEmpty ? title : 'Video',
      session: _CompareYouTubePlaybackSession(videoId: videoId),
      playOnOpen: true,
      ownsSession: true,
    );
  }
}

class _NativeComparePlayerScreen extends StatefulWidget {
  final String title;
  final _CompareYouTubePlaybackSession session;
  final bool playOnOpen;
  final bool ownsSession;

  const _NativeComparePlayerScreen({
    required this.title,
    required this.session,
    required this.playOnOpen,
    required this.ownsSession,
  });

  @override
  State<_NativeComparePlayerScreen> createState() =>
      _NativeComparePlayerScreenState();
}

class _NativeComparePlayerScreenState extends State<_NativeComparePlayerScreen> {
  ChewieController? _chewieCtrl;
  bool _loading = true;
  bool _hasError = false;
  bool _switchingQuality = false;
  bool _isLandscape = false;

  @override
  void initState() {
    super.initState();
    _bindPlayer(playOnOpen: widget.playOnOpen);
  }
  
  Future<void> _applySystemUiMode() async {
    await SystemChrome.setEnabledSystemUIMode(
      _isLandscape ? SystemUiMode.immersiveSticky : SystemUiMode.edgeToEdge,
    );
  }

  Future<void> _bindPlayer({bool playOnOpen = false}) async {
    try {
      await widget.session.ensureInitialized();
      final videoController = widget.session.videoController;
      if (videoController == null) {
        throw StateError('Video controller missing');
      }

      final previousChewie = _chewieCtrl;
      final nextChewie = ChewieController(
        videoPlayerController: videoController,
        autoPlay: false,
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

      if (!mounted) {
        nextChewie.dispose();
        return;
      }

      if (playOnOpen && !widget.session.isPlaying) {
        await widget.session.play();
      }

      setState(() {
        _chewieCtrl = nextChewie;
        _loading = false;
        _switchingQuality = false;
        _hasError = false;
      });
      previousChewie?.dispose();
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _switchingQuality = false;
        _hasError = true;
      });
    }
  }

  Future<void> _switchQuality(
    _CompareYouTubeQualityOption option, {
    bool resumeFromCurrent = true,
  }) async {
    if (widget.session.selectedQuality?.label == option.label &&
        _chewieCtrl != null) {
      return;
    }

    final previousPosition = resumeFromCurrent
        ? widget.session.currentPosition
        : Duration.zero;
    final wasPlaying = widget.session.isPlaying;

    if (mounted) {
      setState(() {
        _loading = false;
        _switchingQuality = true;
        _hasError = false;
      });
    }

    try {
      await widget.session.switchQuality(
        option,
        resumeFrom: previousPosition,
        autoplay: wasPlaying,
      );
      await _bindPlayer(playOnOpen: false);
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _switchingQuality = false;
        _hasError = true;
      });
    }
  }

  Future<void> _showQualityPicker() async {
    final qualityOptions = widget.session.qualityOptions;
    if (qualityOptions.length < 2 || _switchingQuality) return;

    final selected = await showModalBottomSheet<_CompareYouTubeQualityOption>(
      context: context,
      backgroundColor: const Color(0xFF111827),
      builder: (context) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
                child: Row(
                  children: [
                    Text(
                      _compareQualitySheetTitle(context),
                      style: GoogleFonts.plusJakartaSans(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              for (final quality in qualityOptions)
                ListTile(
                  dense: true,
                  leading: Icon(
                    quality.label == widget.session.selectedQuality?.label
                        ? Icons.radio_button_checked_rounded
                        : Icons.radio_button_off_rounded,
                    color: quality.label == widget.session.selectedQuality?.label
                        ? AppTheme.primaryBlue
                        : Colors.white70,
                  ),
                  title: Text(
                    quality.label,
                    style: GoogleFonts.plusJakartaSans(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  trailing: quality.rank >= 1080
                      ? Text(
                          'HD',
                          style: GoogleFonts.plusJakartaSans(
                            color: AppTheme.brandCyan,
                            fontWeight: FontWeight.w700,
                          ),
                        )
                      : null,
                  onTap: () => Navigator.of(context).pop(quality),
                ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );

    if (!mounted || selected == null) return;
    if (selected.label == widget.session.selectedQuality?.label) return;
    await _switchQuality(selected);
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
    unawaited(_applySystemUiMode());
  }

  Widget _buildErrorState(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.videocam_off_rounded,
            color: Colors.white54,
            size: 48,
          ),
          const SizedBox(height: 12),
          Text(
            _compareVideoLoadErrorLabel(context),
            style: GoogleFonts.plusJakartaSans(
              color: Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.tonal(
            onPressed: () => _bindPlayer(playOnOpen: true),
            child: Text(_compareRetryVideoLabel(context)),
          ),
        ],
      ),
    );
  }

  void _closePlayer() {
    Navigator.of(context).pop(widget.session.isPlaying);
  }
  
  Widget _buildPlayerViewport() {
    final controller = widget.session.videoController;
    final rawAspectRatio = controller?.value.aspectRatio ?? 0;
    final aspectRatio = rawAspectRatio > 0 ? rawAspectRatio : 16 / 9;

    return LayoutBuilder(
      builder: (context, constraints) {
        var width = constraints.maxWidth;
        var height = width / aspectRatio;

        if (height > constraints.maxHeight) {
          height = constraints.maxHeight;
          width = height * aspectRatio;
        }

        return Center(
          child: SizedBox(
            width: width,
            height: height,
            child: Chewie(controller: _chewieCtrl!),
          ),
        );
      },
    );
  }

  Widget _buildLandscapeOverlay() {
    final topPadding = MediaQuery.of(context).padding.top;
    final qualityLabel = widget.session.selectedQuality?.label ?? 'HD';

    return Positioned(
      top: topPadding + 8,
      left: 8,
      right: 8,
      child: Row(
        children: [
          _CmpIconBtn(
            icon: Icons.arrow_back_rounded,
            onTap: _closePlayer,
          ),
          const Spacer(),
          if (widget.session.qualityOptions.length > 1)
            GestureDetector(
              onTap: _showQualityPicker,
              child: Container(
                height: 32,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                margin: const EdgeInsets.only(right: 8),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.68),
                  borderRadius: BorderRadius.circular(999),
                ),
                alignment: Alignment.center,
                child: Text(
                  qualityLabel,
                  style: GoogleFonts.plusJakartaSans(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          _CmpIconBtn(
            icon: Icons.screen_lock_portrait_rounded,
            onTap: _toggleOrientation,
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _chewieCtrl?.dispose();
    if (widget.ownsSession) {
      unawaited(widget.session.dispose());
    }
    SystemChrome.setPreferredOrientations(DeviceOrientation.values);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final qualityOptions = widget.session.qualityOptions;
    final useLandscapeChrome = _isLandscape;

    return PopScope<bool>(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        _closePlayer();
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        appBar: useLandscapeChrome
            ? null
            : AppBar(
                backgroundColor: Colors.black,
                foregroundColor: Colors.white,
                elevation: 0,
                leading: IconButton(
                  icon: const Icon(Icons.arrow_back_rounded),
                  onPressed: _closePlayer,
                ),
                title: Text(
                  widget.title,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: Colors.white,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                actions: [
                  if (qualityOptions.length > 1)
                    IconButton(
                      icon: Text(
                        widget.session.selectedQuality?.label ?? 'HD',
                        style: GoogleFonts.plusJakartaSans(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      onPressed: _showQualityPicker,
                      tooltip: _compareQualitySheetTitle(context),
                    ),
                  IconButton(
                    icon: Icon(
                      _isLandscape
                          ? Icons.screen_lock_portrait_rounded
                          : Icons.screen_rotation_rounded,
                    ),
                    onPressed: _toggleOrientation,
                    tooltip: _isLandscape ? 'Portrait' : 'Landscape',
                  ),
                ],
              ),
        body: _loading
            ? const Center(
                child: CircularProgressIndicator(color: Colors.red),
              )
            : _hasError || _chewieCtrl == null
            ? _buildErrorState(context)
            : Stack(
                children: [
                  Positioned.fill(child: _buildPlayerViewport()),
                  if (useLandscapeChrome) _buildLandscapeOverlay(),
                  if (_switchingQuality)
                    Positioned.fill(
                      child: ColoredBox(
                        color: Colors.black.withValues(alpha: 0.24),
                        child: const Center(
                          child: CircularProgressIndicator(color: Colors.white),
                        ),
                      ),
                    ),
                ],
              ),
      ),
    );
  }
}

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
        width: 28,
        height: 28,
        margin: margin,
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.6),
          shape: BoxShape.circle,
        ),
        child: Icon(icon, size: 15, color: Colors.white),
      ),
    );
  }
}
