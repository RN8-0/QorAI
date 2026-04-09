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
  bool _loading = true;
  String? _error;
  bool _didSearch = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_didSearch) {
      _didSearch = true;
      _searchVideos();
    }
  }

  Future<void> _searchVideos() async {
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

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: context.dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Container(
              width: 38, height: 38,
              decoration: BoxDecoration(
                color: AppTheme.youtube.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12)),
              child: const Icon(Icons.play_circle_fill, size: 20, color: AppTheme.youtube),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(context.l10n?.youtubeReviews ?? 'YouTube Reviews',
                style: GoogleFonts.plusJakartaSans(fontSize: 15, fontWeight: FontWeight.w700, color: context.textPrimary)),
            ),
          ]),
          const SizedBox(height: 14),
          if (_loading)
            const Center(child: Padding(
              padding: EdgeInsets.all(16),
              child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.youtube),
            ))
          else if (_videos == null || _videos!.isEmpty)
            Text(_error != null ? 'Could not load videos' : 'No comparison videos found',
              style: GoogleFonts.plusJakartaSans(fontSize: 13, color: context.textTertiaryColor))
          else
            ...(_videos!.map((video) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _CompareVideoTile(video: video),
            ))),
        ],
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
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => _NativeCompareVideoPlayer(videoId: video.videoId, title: video.title),
    ));
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
  VideoPlayerController? _vpc;
  ChewieController? _chewie;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadVideo();
  }

  Future<void> _loadVideo() async {
    try {
      final yt = YoutubeExplode();
      final manifest = await yt.videos.streamsClient.getManifest(widget.videoId);
      yt.close();
      final muxed = manifest.muxed.sortByVideoQuality();
      if (muxed.isEmpty) {
        if (mounted) setState(() { _error = 'No streams found'; _loading = false; });
        return;
      }
      final streamUrl = muxed.first.url;
      _vpc = VideoPlayerController.networkUrl(streamUrl);
      await _vpc!.initialize();
      _chewie = ChewieController(
        videoPlayerController: _vpc!,
        autoPlay: true,
        allowFullScreen: true,
        allowMuting: true,
      );
      if (mounted) setState(() => _loading = false);
    } catch (e) {
      if (mounted) setState(() { _error = 'Could not load video'; _loading = false; });
    }
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
        title: Text(widget.title, style: const TextStyle(fontSize: 14), maxLines: 1, overflow: TextOverflow.ellipsis),
      ),
      body: _loading
        ? const Center(child: CircularProgressIndicator(color: Colors.red))
        : _error != null
          ? Center(child: Text(_error!, style: const TextStyle(color: Colors.white70)))
          : _chewie != null
            ? Chewie(controller: _chewie!)
            : const SizedBox.shrink(),
    );
  }
}


// ─── Benchmark Comparison Section (numerical table) ───
