import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/domain/entities/product_entity.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/services/youtube_service.dart';

/// Shared YouTube reviews card used by both detail and compare screens.
/// Lazy-loads YouTube review videos for a product.
///
/// When [collapsible] is true, renders as a compact expandable row:
/// title + subtitle on the left, chevron on the right. Tapping expands
/// inline and auto-fetches videos. Default state: collapsed.
class SharedYouTubeReviewsCard extends ConsumerStatefulWidget {
  final ProductEntity product;
  final bool isDark;
  final Color cardBg;

  /// Optional search query override (e.g. "product1 vs product2 review")
  final String? searchQuery;

  /// Callback when a video is tapped. Receives (url, title, thumbnailUrl).
  /// If null, no action is taken on tap.
  final void Function(String url, String title, String thumbnailUrl)? onVideoTap;

  /// Optional title override (e.g. "Comparison Videos")
  final String? titleOverride;

  /// When true, renders as a compact expandable section (collapsed by default).
  final bool collapsible;

  /// When true, hide the internal "YouTube Reviews" header row — useful when
  /// the surrounding sheet already shows a title.
  final bool hideHeader;

  const SharedYouTubeReviewsCard({
    super.key,
    required this.product,
    required this.isDark,
    required this.cardBg,
    this.searchQuery,
    this.onVideoTap,
    this.titleOverride,
    this.collapsible = false,
    this.hideHeader = false,
  });

  @override
  ConsumerState<SharedYouTubeReviewsCard> createState() => _SharedYouTubeReviewsCardState();
}

class _SharedYouTubeReviewsCardState extends ConsumerState<SharedYouTubeReviewsCard>
    with SingleTickerProviderStateMixin {
  bool _loading = false;
  bool _loaded = false;
  bool _expanded = false;
  List<YouTubeVideo> _videos = [];
  late final AnimationController _chevronController;
  late final Animation<double> _chevronTurns;

  @override
  void initState() {
    super.initState();
    _chevronController = AnimationController(
      duration: const Duration(milliseconds: 250),
      vsync: this,
    );
    _chevronTurns = Tween<double>(begin: 0, end: 0.25).animate(
      CurvedAnimation(parent: _chevronController, curve: Curves.easeInOut),
    );
    // Non-collapsible mode doesn't need expand state; also auto-fetches
    if (!widget.collapsible) {
      _expanded = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && !_loaded && !_loading) _fetchVideos();
      });
    }
  }

  @override
  void dispose() {
    _chevronController.dispose();
    super.dispose();
  }

  Future<void> _fetchVideos() async {
    setState(() => _loading = true);
    try {
      final youtubeService = ref.read(youtubeServiceProvider);
      final locale = Localizations.localeOf(context).languageCode;

      final videos = await youtubeService.searchReviewVideos(
        productName: widget.searchQuery ?? widget.product.name,
        languageCode: locale,
        maxResults: 6,
      );

      if (mounted) {
        setState(() {
          _videos = videos;
          _loaded = true;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loaded = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.collapsible) return _buildCollapsible(context);
    return _buildClassic(context);
  }

  /// Compact expandable row for compare screen
  Widget _buildCollapsible(BuildContext context) {
    final title = widget.titleOverride ?? context.l10n?.youtubeReviews ?? 'YouTube Reviews';
    final subtitle = _loaded && _videos.isNotEmpty
        ? '${_videos.length} review videos found'
        : (context.l10n?.tapToLoadVideos ?? 'Tap to see review videos');

    return Container(
      decoration: BoxDecoration(
        color: widget.cardBg,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.white.withValues(alpha: 0.04), blurRadius: 8)],
      ),
      child: Column(
        children: [
          // Compact header row — always visible
          InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: _toggleExpand,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(7),
                    decoration: BoxDecoration(
                      color: Colors.red.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.play_circle_fill, color: AppTheme.error, size: 18),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                            if (_loaded && _videos.isNotEmpty) ...[
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: AppTheme.error.withValues(alpha: 0.12),
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  '${_videos.length}',
                                  style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: AppTheme.error),
                                ),
                              ),
                            ],
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(subtitle, style: TextStyle(fontSize: 11, color: AppTheme.slate500)),
                      ],
                    ),
                  ),
                  if (_loading)
                    const SizedBox(
                      width: 20, height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  else
                    RotationTransition(
                      turns: _chevronTurns,
                      child: Icon(
                        Icons.chevron_right_rounded,
                        size: 24,
                        color: AppTheme.slate500,
                      ),
                    ),
                ],
              ),
            ),
          ),
          // Expandable video list
          AnimatedCrossFade(
            firstChild: const SizedBox.shrink(),
            secondChild: _loaded
                ? Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                    child: _videos.isEmpty
                        ? Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text('No review videos found',
                              style: TextStyle(fontSize: 13, color: AppTheme.slate500)),
                          )
                        : Column(children: _videos.map((v) => _buildVideoRow(v)).toList()),
                  )
                : const SizedBox.shrink(),
            crossFadeState: _expanded && _loaded
                ? CrossFadeState.showSecond
                : CrossFadeState.showFirst,
            duration: const Duration(milliseconds: 250),
          ),
        ],
      ),
    );
  }

  void _toggleExpand() {
    setState(() => _expanded = !_expanded);
    if (_expanded) {
      _chevronController.forward();
      if (!_loaded && !_loading) _fetchVideos();
    } else {
      _chevronController.reverse();
    }
  }

  /// Classic layout — auto-fetches videos and shows them directly.
  Widget _buildClassic(BuildContext context) {
    return Container(
      padding: EdgeInsets.all(widget.hideHeader ? 0 : 16),
      decoration: widget.hideHeader
          ? null
          : BoxDecoration(
              color: widget.cardBg,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: Colors.white.withValues(alpha: 0.04),
                  blurRadius: 8,
                ),
              ],
            ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!widget.hideHeader) ...[
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
                    widget.titleOverride ??
                        context.l10n?.youtubeReviews ??
                        'YouTube Reviews',
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
          ],
          if (_loading || (!_loaded && !_loading))
            const Center(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          if (_loaded && _videos.isEmpty)
            Text(
              'No review videos found',
              style: TextStyle(fontSize: 13, color: AppTheme.slate500),
            ),
          if (_loaded && _videos.isNotEmpty)
            ..._videos.map((video) => _buildVideoRow(video)),
        ],
      ),
    );
  }

  /// Shared video row widget used by both classic and collapsible modes
  Widget _buildVideoRow(YouTubeVideo video) {
    return GestureDetector(
      onTap: widget.onVideoTap != null
          ? () => widget.onVideoTap!(video.watchUrl, video.title, video.thumbnailUrl)
          : null,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Stack(
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: video.thumbnailUrl.isNotEmpty
                      ? CachedNetworkImage(
                          imageUrl: video.thumbnailUrl,
                          width: 120,
                          height: 68,
                          fit: BoxFit.cover,
                          placeholder: (_, _) => Container(
                            width: 120, height: 68,
                            color: widget.isDark ? AppTheme.slate800 : context.textTertiaryColor,
                            child: const Icon(Icons.play_circle_outline, color: AppTheme.error),
                          ),
                          errorWidget: (_, _, _) => Container(
                            width: 120, height: 68,
                            color: widget.isDark ? AppTheme.slate800 : context.textTertiaryColor,
                            child: const Icon(Icons.play_circle_outline, color: AppTheme.error),
                          ),
                        )
                      : Container(
                          width: 120, height: 68,
                          color: widget.isDark ? AppTheme.slate800 : context.textTertiaryColor,
                          child: const Icon(Icons.play_circle_outline, color: AppTheme.error, size: 32),
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
                      child: Text(
                        video.duration,
                        style: const TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.w600),
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
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 3),
                  Text(
                    video.channelTitle,
                    style: TextStyle(fontSize: 11, color: AppTheme.slate500),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (video.viewCount.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Text(
                          video.viewCount,
                          style: const TextStyle(fontSize: 10, color: AppTheme.slate400),
                        ),
                        if (video.qualityBadge.isNotEmpty) ...[
                          const SizedBox(width: 4),
                          Text(video.qualityBadge, style: const TextStyle(fontSize: 10)),
                        ],
                      ],
                    ),
                  ],
                ],
              ),
            ),
            const Icon(Icons.play_circle_filled, size: 16, color: AppTheme.error),
          ],
        ),
      ),
    );
  }
}
