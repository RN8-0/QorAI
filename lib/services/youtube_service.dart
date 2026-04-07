// Compair - YouTube Data API v3 Service
// Uses YouTube Data API v3 to fetch product review videos.
// Falls back to parsing YouTube HTML search page if no API key.

import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

class YouTubeVideo {
  final String videoId;
  final String title;
  final String channelTitle;
  final String thumbnailUrl;
  final String viewCount;
  final String publishedAt;
  final String duration;
  final int viewCountRaw;

  const YouTubeVideo({
    required this.videoId,
    required this.title,
    required this.channelTitle,
    required this.thumbnailUrl,
    this.viewCount = '',
    this.publishedAt = '',
    this.duration = '',
    this.viewCountRaw = 0,
  });

  String get watchUrl => 'https://www.youtube.com/watch?v=$videoId';

  /// Quality badge based on view count
  String get qualityBadge {
    if (viewCountRaw >= 1000000) return '⭐';
    if (viewCountRaw >= 100000) return '🔥';
    if (viewCountRaw >= 10000) return '👍';
    return '';
  }

  /// Whether this is a high-quality review (>10K views)
  bool get isHighQuality => viewCountRaw >= 10000;
}

class YouTubeService {
  final Dio _dio;
  final String _apiKey;

  static const _baseUrl = 'https://www.googleapis.com/youtube/v3';

  // In-memory cache: key = "productName|langCode" → videos
  static final Map<String, _CachedResult> _cache = {};
  static const _cacheDuration = Duration(hours: 24);
  static const _maxCacheEntries = 200;

  YouTubeService({required Dio dio, required String apiKey})
      : _dio = dio,
        _apiKey = apiKey;

  /// Enhanced review keywords per language — more specific for better results
  static String _reviewKeyword(String lang) {
    switch (lang) {
      case 'tr': return 'detaylı inceleme';
      case 'de': return 'ausführlicher Test';
      case 'fr': return 'test complet avis';
      case 'es': return 'análisis completo review';
      case 'it': return 'recensione completa';
      case 'pt': return 'análise completa';
      case 'ru': return 'подробный обзор';
      case 'ar': return 'مراجعة شاملة';
      case 'ja': return 'レビュー 詳細';
      case 'ko': return '리뷰 상세';
      case 'zh': return '详细评测';
      default:   return 'detailed review';
    }
  }

  /// Clear expired cache entries
  void _cleanCache() {
    final now = DateTime.now();
    _cache.removeWhere((_, v) => now.isAfter(v.expiresAt));
    // Evict oldest if over limit
    while (_cache.length > _maxCacheEntries) {
      final oldestKey = _cache.entries
          .reduce((a, b) => a.value.expiresAt.isBefore(b.value.expiresAt) ? a : b)
          .key;
      _cache.remove(oldestKey);
    }
  }

  Future<List<YouTubeVideo>> searchReviewVideos({
    required String productName,
    required String languageCode,
    int maxResults = 8,
  }) async {
    // Check cache first
    final cacheKey = '$productName|$languageCode';
    _cleanCache();
    final cached = _cache[cacheKey];
    if (cached != null) {
      debugPrint('=== COMPAIR: YouTube cache HIT for "$productName" ===');
      return cached.videos;
    }

    final keyword = _reviewKeyword(languageCode);
    final query = '$productName $keyword';

    List<YouTubeVideo> results = [];

    if (_apiKey.isNotEmpty) {
      try {
        results = await _searchWithApi(query, languageCode, maxResults);
      } catch (e) {
        debugPrint('=== COMPAIR: YouTube API error, falling back: $e ===');
      }
    }

    if (results.isEmpty) {
      results = await _searchWithHtml(query, maxResults);
    }

    // Cache the results
    if (results.isNotEmpty) {
      _cache[cacheKey] = _CachedResult(
        videos: results,
        expiresAt: DateTime.now().add(_cacheDuration),
      );
    }

    debugPrint('=== COMPAIR: YouTube found ${results.length} videos for "$productName" ===');
    return results;
  }

  /// Official YouTube Data API v3 search with duration and view filtering
  Future<List<YouTubeVideo>> _searchWithApi(
      String query, String languageCode, int maxResults) async {
    // Fetch more candidates to filter from (3x desired for quality filtering)
    final fetchCount = (maxResults * 3).clamp(10, 25);

    final searchResponse = await _dio.get(
      '$_baseUrl/search',
      queryParameters: {
        'part': 'snippet',
        'q': query,
        'type': 'video',
        'order': 'viewCount',
        'maxResults': fetchCount,
        'relevanceLanguage': languageCode,
        'videoEmbeddable': 'true',
        'videoDuration': 'long', // 20+ minutes (full reviews, not shorts)
        'key': _apiKey,
      },
    );

    if (searchResponse.statusCode != 200) return [];
    final items = searchResponse.data['items'] as List? ?? [];
    if (items.isEmpty) return [];

    final videoIds = items
        .map((item) => item['id']?['videoId']?.toString() ?? '')
        .where((id) => id.isNotEmpty)
        .toList();

    // Fetch both statistics AND contentDetails for duration
    Map<String, Map<String, dynamic>> videoDetails = {};
    try {
      final detailsResponse = await _dio.get(
        '$_baseUrl/videos',
        queryParameters: {
          'part': 'statistics,contentDetails',
          'id': videoIds.join(','),
          'key': _apiKey,
        },
      );
      if (detailsResponse.statusCode == 200) {
        final detailItems = detailsResponse.data['items'] as List? ?? [];
        for (final item in detailItems) {
          final id = item['id']?.toString() ?? '';
          videoDetails[id] = {
            'viewCount': item['statistics']?['viewCount']?.toString() ?? '0',
            'duration': item['contentDetails']?['duration']?.toString() ?? '',
          };
        }
      }
    } catch (_) {}

    // Build video list with all metadata
    final allVideos = <YouTubeVideo>[];
    for (final item in items) {
      final videoId = item['id']?['videoId']?.toString() ?? '';
      if (videoId.isEmpty) continue;

      final snippet = item['snippet'] ?? {};
      final thumbnail = snippet['thumbnails']?['high']?['url']?.toString() ??
          snippet['thumbnails']?['medium']?['url']?.toString() ??
          snippet['thumbnails']?['default']?['url']?.toString() ??
          '';
      final details = videoDetails[videoId] ?? {};
      final rawViews = int.tryParse(details['viewCount'] ?? '0') ?? 0;
      final duration = details['duration']?.toString() ?? '';
      final durationMinutes = _parseDurationMinutes(duration);

      // Filter: minimum 10K views AND at least 10 minutes long
      if (rawViews < 10000) continue;
      if (durationMinutes < 10) continue;

      allVideos.add(YouTubeVideo(
        videoId: videoId,
        title: snippet['title']?.toString() ?? '',
        channelTitle: snippet['channelTitle']?.toString() ?? '',
        thumbnailUrl: thumbnail,
        viewCount: _formatViewCount(rawViews.toString()),
        publishedAt: snippet['publishedAt']?.toString() ?? '',
        duration: _formatDuration(duration),
        viewCountRaw: rawViews,
      ));
    }

    // Sort by views (most popular first)
    allVideos.sort((a, b) => b.viewCountRaw.compareTo(a.viewCountRaw));

    return allVideos.take(maxResults).toList();
  }

  /// Parse ISO 8601 duration (PT10M30S) to minutes
  int _parseDurationMinutes(String iso8601) {
    if (iso8601.isEmpty) return 0;
    final match = RegExp(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?').firstMatch(iso8601);
    if (match == null) return 0;
    final hours = int.tryParse(match.group(1) ?? '0') ?? 0;
    final minutes = int.tryParse(match.group(2) ?? '0') ?? 0;
    return hours * 60 + minutes;
  }

  /// Format ISO 8601 duration to human readable (e.g. "12:30", "1:05:20")
  String _formatDuration(String iso8601) {
    if (iso8601.isEmpty) return '';
    final match = RegExp(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?').firstMatch(iso8601);
    if (match == null) return '';
    final hours = int.tryParse(match.group(1) ?? '0') ?? 0;
    final minutes = int.tryParse(match.group(2) ?? '0') ?? 0;
    final seconds = int.tryParse(match.group(3) ?? '0') ?? 0;
    if (hours > 0) {
      return '$hours:${minutes.toString().padLeft(2, '0')}:${seconds.toString().padLeft(2, '0')}';
    }
    return '$minutes:${seconds.toString().padLeft(2, '0')}';
  }

  /// Unofficial fallback: parse ytInitialData from YouTube search HTML
  /// Fetches up to 15 candidates, then filters to only embeddable videos via oEmbed.
  Future<List<YouTubeVideo>> _searchWithHtml(
      String query, int maxResults) async {
    try {
      final encoded = Uri.encodeComponent(query);
      final url = 'https://www.youtube.com/results?search_query=$encoded';

      final response = await _dio.get(
        url,
        options: Options(
          headers: {
            'User-Agent':
                'Mozilla/5.0 (Linux; Android 10; Pixel 3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml',
          },
          responseType: ResponseType.plain,
          receiveTimeout: const Duration(seconds: 15),
        ),
      );

      final html = response.data as String;
      const marker = 'var ytInitialData = ';
      final start = html.indexOf(marker);
      if (start == -1) return [];

      final jsonStart = start + marker.length;
      int depth = 0;
      int end = jsonStart;
      for (int i = jsonStart; i < html.length; i++) {
        if (html[i] == '{') depth++;
        if (html[i] == '}') depth--;
        if (depth == 0 && i > jsonStart) {
          end = i + 1;
          break;
        }
      }

      final jsonStr = html.substring(jsonStart, end);
      final data = jsonDecode(jsonStr) as Map<String, dynamic>;

      // Extract up to 20 candidates (more for filtering)
      final candidates = <YouTubeVideo>[];
      _extractVideos(data, candidates, 20);

      if (candidates.isEmpty) return [];

      // Filter: prefer videos with higher view counts from HTML parsing
      final filtered = candidates.where((v) {
        final parsed = _parseViewText(v.viewCount);
        return parsed >= 10000;
      }).toList();

      final pool = filtered.isNotEmpty ? filtered : candidates;

      // Check embeddability via oEmbed in parallel (fast HEAD check)
      final embeddable = await _filterEmbeddable(pool, maxResults);
      return embeddable;
    } catch (e) {
      debugPrint('=== COMPAIR: YouTube HTML parse error: $e ===');
      return [];
    }
  }

  /// Parse view count text like "1.2M views" or "450K views" to raw number
  int _parseViewText(String text) {
    if (text.isEmpty) return 0;
    final cleaned = text.replaceAll(RegExp(r'[^0-9.,KMBkmbGg]'), '').trim();
    if (cleaned.isEmpty) return 0;
    final upper = cleaned.toUpperCase();
    if (upper.contains('B') || upper.contains('G')) {
      final num = double.tryParse(upper.replaceAll(RegExp(r'[^0-9.]'), '')) ?? 0;
      return (num * 1000000000).round();
    }
    if (upper.contains('M')) {
      final num = double.tryParse(upper.replaceAll(RegExp(r'[^0-9.]'), '')) ?? 0;
      return (num * 1000000).round();
    }
    if (upper.contains('K')) {
      final num = double.tryParse(upper.replaceAll(RegExp(r'[^0-9.]'), '')) ?? 0;
      return (num * 1000).round();
    }
    return int.tryParse(cleaned.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;
  }

  /// Checks each video via YouTube oEmbed API and returns only embeddable ones.
  Future<List<YouTubeVideo>> _filterEmbeddable(
      List<YouTubeVideo> candidates, int maxResults) async {
    final results = <YouTubeVideo>[];
    // Check in batches of 5 concurrently
    for (int i = 0; i < candidates.length && results.length < maxResults; i += 5) {
      final batch = candidates.skip(i).take(5).toList();
      final checks = await Future.wait(
        batch.map((v) => _isEmbeddable(v.videoId)),
      ).timeout(const Duration(seconds: 10), onTimeout: () =>
          List.filled(batch.length, false));
      for (int j = 0; j < batch.length; j++) {
        if (checks[j]) {
          results.add(batch[j]);
          if (results.length >= maxResults) break;
        }
      }
    }
    // If none passed filter, return first N anyway as fallback
    return results.isNotEmpty ? results : candidates.take(maxResults).toList();
  }

  /// Returns true if the video allows embedding (YouTube oEmbed returns 200).
  Future<bool> _isEmbeddable(String videoId) async {
    try {
      final resp = await _dio.get(
        'https://www.youtube.com/oembed',
        queryParameters: {
          'url': 'https://www.youtube.com/watch?v=$videoId',
          'format': 'json',
        },
        options: Options(
          validateStatus: (s) => true,
          sendTimeout: const Duration(seconds: 5),
          receiveTimeout: const Duration(seconds: 5),
        ),
      );
      return resp.statusCode == 200;
    } catch (_) {
      return false;
    }
  }

  void _extractVideos(
      dynamic node, List<YouTubeVideo> results, int maxResults) {
    if (results.length >= maxResults) return;

    if (node is Map) {
      // Skip Shorts shelf entirely
      if (node.containsKey('reelShelfRenderer')) return;

      if (node.containsKey('videoRenderer')) {
        final vr = node['videoRenderer'] as Map<String, dynamic>? ?? {};
        final videoId = vr['videoId']?.toString() ?? '';
        if (videoId.isNotEmpty) {
          // Skip YouTube Shorts
          final navEndpoint = vr['navigationEndpoint'] as Map? ?? {};
          if (navEndpoint.containsKey('reelWatchEndpoint')) return;

          final lengthText = vr['lengthText'];
          if (lengthText == null) return;

          final title = _extractRuns(vr['title']);
          if (title.toLowerCase().contains('#short')) return;

          // Parse duration from lengthText and skip short videos (<4 min)
          final durationText = lengthText is Map
              ? (lengthText['simpleText']?.toString() ?? _extractRuns(lengthText))
              : '';
          final durationMinutes = _parseDurationText(durationText);
          if (durationMinutes < 4) return;

          final channel = _extractRuns(vr['ownerText'] ?? vr['longBylineText']);
          final thumbnails = (vr['thumbnail']?['thumbnails'] as List?) ?? [];
          final thumb = thumbnails.isNotEmpty
              ? (thumbnails.last['url']?.toString() ?? '')
              : '';
          final viewText = vr['viewCountText']?['simpleText']?.toString() ??
              _extractRuns(vr['viewCountText']);
          results.add(YouTubeVideo(
            videoId: videoId,
            title: title,
            channelTitle: channel,
            thumbnailUrl: thumb,
            viewCount: viewText,
            duration: durationText,
            viewCountRaw: _parseViewText(viewText),
          ));
        }
        return;
      }
      for (final value in node.values) {
        _extractVideos(value, results, maxResults);
        if (results.length >= maxResults) return;
      }
    } else if (node is List) {
      for (final item in node) {
        _extractVideos(item, results, maxResults);
        if (results.length >= maxResults) return;
      }
    }
  }

  /// Parse duration text like "12:30" or "1:05:20" to minutes
  int _parseDurationText(String text) {
    if (text.isEmpty) return 0;
    final parts = text.split(':').map((p) => int.tryParse(p.trim()) ?? 0).toList();
    if (parts.length == 3) return parts[0] * 60 + parts[1];
    if (parts.length == 2) return parts[0];
    return 0;
  }

  String _extractRuns(dynamic obj) {
    if (obj == null) return '';
    if (obj is Map) {
      final runs = obj['runs'] as List?;
      if (runs != null) {
        return runs
            .map((r) => r['text']?.toString() ?? '')
            .join('');
      }
      final simple = obj['simpleText']?.toString();
      if (simple != null) return simple;
    }
    return '';
  }

  /// Formats view count into a readable format (e.g. "1.2M", "450K")
  String _formatViewCount(String count) {
    final n = int.tryParse(count) ?? 0;
    if (n >= 1000000) {
      return '${(n / 1000000).toStringAsFixed(1)}M views';
    } else if (n >= 1000) {
      return '${(n / 1000).toStringAsFixed(0)}K views';
    }
    return '$n views';
  }
}

class _CachedResult {
  final List<YouTubeVideo> videos;
  final DateTime expiresAt;
  const _CachedResult({required this.videos, required this.expiresAt});
}
