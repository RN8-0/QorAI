import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/domain/entities/product_entity.dart';
import 'package:compair/presentation/providers/providers.dart';
import 'package:compair/services/youtube_service.dart';

/// Shared YouTube reviews card used by both detail and compare screens.
/// Lazy-loads YouTube review videos for a product.
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

  const SharedYouTubeReviewsCard({
    super.key,
    required this.product,
    required this.isDark,
    required this.cardBg,
    this.searchQuery,
    this.onVideoTap,
    this.titleOverride,
  });

  @override
  ConsumerState<SharedYouTubeReviewsCard> createState() => _SharedYouTubeReviewsCardState();
}

class _SharedYouTubeReviewsCardState extends ConsumerState<SharedYouTubeReviewsCard> {
  bool _loading = false;
  bool _loaded = false;
  List<YouTubeVideo> _videos = [];

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
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: widget.cardBg,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: Colors.white.withValues(alpha: 0.04), blurRadius: 8)],
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
                child: const Icon(Icons.play_circle_fill, color: AppTheme.error, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  widget.titleOverride ?? context.l10n?.youtubeReviews ?? 'YouTube Reviews',
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (!_loaded && !_loading)
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _fetchVideos,
                icon: const Icon(Icons.play_arrow),
                label: Text(context.l10n?.loadReviewVideos ?? 'Load Review Videos'),
                style: FilledButton.styleFrom(
                  backgroundColor: theme.colorScheme.primary,
                  foregroundColor: theme.colorScheme.onPrimary,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ),
          if (_loading)
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
            ..._videos.map((video) => GestureDetector(
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
                                      placeholder: (_, __) => Container(
                                        width: 120, height: 68,
                                        color: widget.isDark ? AppTheme.slate800 : context.textTertiaryColor,
                                        child: const Icon(Icons.play_circle_outline, color: AppTheme.error),
                                      ),
                                      errorWidget: (_, __, ___) => Container(
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
                )),
        ],
      ),
    );
  }
}
