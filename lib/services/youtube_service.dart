// Qor AI - YouTube Review Fetcher
// Parses the public YouTube search HTML (ytInitialData) — no API key,
// no Google Cloud project dependency.

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

  // In-memory cache: key = "productName|langCode" → videos
  static final Map<String, _CachedResult> _cache = {};
  static const _cacheDuration = Duration(hours: 24);
  static const _maxCacheEntries = 200;

  YouTubeService({required Dio dio}) : _dio = dio;

  /// Enhanced review keywords per language — more specific for better results
  static String _reviewKeyword(String lang) {
    switch (lang) {
      case 'tr':
        return 'detaylı inceleme';
      case 'de':
        return 'ausführlicher Test';
      case 'fr':
        return 'test complet avis';
      case 'es':
        return 'análisis completo review';
      case 'it':
        return 'recensione completa';
      case 'pt':
        return 'análise completa';
      case 'ru':
        return 'подробный обзор';
      case 'ar':
        return 'مراجعة شاملة';
      case 'ja':
        return 'レビュー 詳細';
      case 'ko':
        return '리뷰 상세';
      case 'zh':
        return '详细评测';
      default:
        return 'detailed review';
    }
  }

  /// Clear expired cache entries
  void _cleanCache() {
    final now = DateTime.now();
    _cache.removeWhere((_, v) => now.isAfter(v.expiresAt));
    // Evict oldest if over limit
    while (_cache.length > _maxCacheEntries) {
      final oldestKey = _cache.entries
          .reduce(
            (a, b) => a.value.expiresAt.isBefore(b.value.expiresAt) ? a : b,
          )
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
      debugPrint('=== QOR AI: YouTube cache HIT for "$productName" ===');
      return cached.videos;
    }

    final keyword = _reviewKeyword(languageCode);
    final query = '$productName $keyword';

    final results = await _searchWithHtml(query, maxResults, languageCode);

    // Cache the results
    if (results.isNotEmpty) {
      _cache[cacheKey] = _CachedResult(
        videos: results,
        expiresAt: DateTime.now().add(_cacheDuration),
      );
    }

    debugPrint(
      '=== QOR AI: YouTube found ${results.length} videos for "$productName" ===',
    );
    return results;
  }

  /// Parse ytInitialData from YouTube search HTML
  /// Fetches up to 15 candidates, then filters to only embeddable videos via oEmbed.
  Future<List<YouTubeVideo>> _searchWithHtml(
    String query,
    int maxResults,
    String languageCode,
  ) async {
    try {
      final encoded = Uri.encodeComponent(query);
      final url = 'https://www.youtube.com/results?search_query=$encoded';

      final response = await _dio.get(
        url,
        options: Options(
          headers: {
            'User-Agent':
                'Mozilla/5.0 (Linux; Android 10; Pixel 3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            'Accept-Language': _acceptLanguageHeader(languageCode),
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

      // Filter: prefer horizontal, meaningful review videos with enough signal.
      final filtered = candidates.where((v) {
        final parsed = _parseViewText(v.viewCount);
        final durationMinutes = _parseDurationText(v.duration);
        return parsed >= 10000 && durationMinutes >= 5;
      }).toList();

      final pool = filtered.isNotEmpty ? filtered : candidates;
      pool.sort((a, b) {
        final relevanceA = _titleRelevanceScore(query, a.title);
        final relevanceB = _titleRelevanceScore(query, b.title);
        final relevanceCompare = relevanceB.compareTo(relevanceA);
        if (relevanceCompare != 0) return relevanceCompare;
        return b.viewCountRaw.compareTo(a.viewCountRaw);
      });

      // Check embeddability via oEmbed in parallel (fast HEAD check)
      final embeddable = await _filterEmbeddable(pool, maxResults);
      return embeddable;
    } catch (e) {
      debugPrint('=== QOR AI: YouTube HTML parse error: $e ===');
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
      final num =
          double.tryParse(upper.replaceAll(RegExp(r'[^0-9.]'), '')) ?? 0;
      return (num * 1000000000).round();
    }
    if (upper.contains('M')) {
      final num =
          double.tryParse(upper.replaceAll(RegExp(r'[^0-9.]'), '')) ?? 0;
      return (num * 1000000).round();
    }
    if (upper.contains('K')) {
      final num =
          double.tryParse(upper.replaceAll(RegExp(r'[^0-9.]'), '')) ?? 0;
      return (num * 1000).round();
    }
    return int.tryParse(cleaned.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0;
  }

  String _acceptLanguageHeader(String lang) {
    final normalized = lang.toLowerCase();
    const region = {
      'tr': 'tr-TR,tr;q=0.95,en;q=0.55',
      'de': 'de-DE,de;q=0.95,en;q=0.55',
      'fr': 'fr-FR,fr;q=0.95,en;q=0.55',
      'es': 'es-ES,es;q=0.95,en;q=0.55',
      'it': 'it-IT,it;q=0.95,en;q=0.55',
      'pt': 'pt-BR,pt;q=0.95,en;q=0.55',
      'ru': 'ru-RU,ru;q=0.95,en;q=0.55',
      'ar': 'ar-SA,ar;q=0.95,en;q=0.55',
      'ja': 'ja-JP,ja;q=0.95,en;q=0.55',
      'ko': 'ko-KR,ko;q=0.95,en;q=0.55',
      'zh': 'zh-CN,zh;q=0.95,en;q=0.55',
      'nl': 'nl-NL,nl;q=0.95,en;q=0.55',
      'pl': 'pl-PL,pl;q=0.95,en;q=0.55',
      'sv': 'sv-SE,sv;q=0.95,en;q=0.55',
    };
    return region[normalized] ?? 'en-US,en;q=0.9';
  }

  int _titleRelevanceScore(String query, String title) {
    final queryTokens = _searchTokens(query);
    final titleTokens = _searchTokens(title);
    if (queryTokens.isEmpty || titleTokens.isEmpty) return 0;
    var score = 0;
    for (final token in queryTokens) {
      if (titleTokens.contains(token)) score += token.length >= 4 ? 3 : 1;
    }
    final lowerTitle = title.toLowerCase();
    if (lowerTitle.contains('review') ||
        lowerTitle.contains('inceleme') ||
        lowerTitle.contains('test') ||
        lowerTitle.contains('comparison') ||
        lowerTitle.contains('karşılaştır')) {
      score += 4;
    }
    return score;
  }

  Set<String> _searchTokens(String value) {
    const stopWords = {
      'the',
      'and',
      'with',
      'for',
      'vs',
      'comparison',
      'review',
      'detailed',
      'detaylı',
      'inceleme',
      'karşılaştırma',
    };
    return value
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9ğüşöçıİĞÜŞÖÇ]+', unicode: true), ' ')
        .split(RegExp(r'\s+'))
        .where((token) => token.length >= 2 && !stopWords.contains(token))
        .toSet();
  }

  /// Checks each video via YouTube oEmbed API and returns only embeddable ones.
  Future<List<YouTubeVideo>> _filterEmbeddable(
    List<YouTubeVideo> candidates,
    int maxResults,
  ) async {
    final results = <YouTubeVideo>[];
    // Check in batches of 5 concurrently
    for (
      int i = 0;
      i < candidates.length && results.length < maxResults;
      i += 5
    ) {
      final batch = candidates.skip(i).take(5).toList();
      final checks =
          await Future.wait(batch.map((v) => _isEmbeddable(v.videoId))).timeout(
            const Duration(seconds: 10),
            onTimeout: () => List.filled(batch.length, false),
          );
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
    dynamic node,
    List<YouTubeVideo> results,
    int maxResults,
  ) {
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
              ? (lengthText['simpleText']?.toString() ??
                    _extractRuns(lengthText))
              : '';
          final durationMinutes = _parseDurationText(durationText);
          if (durationMinutes < 4) return;

          final channel = _extractRuns(vr['ownerText'] ?? vr['longBylineText']);
          final thumbnails = (vr['thumbnail']?['thumbnails'] as List?) ?? [];
          final thumb = thumbnails.isNotEmpty
              ? (thumbnails.last['url']?.toString() ?? '')
              : '';
          final viewText =
              vr['viewCountText']?['simpleText']?.toString() ??
              _extractRuns(vr['viewCountText']);
          results.add(
            YouTubeVideo(
              videoId: videoId,
              title: title,
              channelTitle: channel,
              thumbnailUrl: thumb,
              viewCount: viewText,
              duration: durationText,
              viewCountRaw: _parseViewText(viewText),
            ),
          );
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
    final parts = text
        .split(':')
        .map((p) => int.tryParse(p.trim()) ?? 0)
        .toList();
    if (parts.length == 3) return parts[0] * 60 + parts[1];
    if (parts.length == 2) return parts[0];
    return 0;
  }

  String _extractRuns(dynamic obj) {
    if (obj == null) return '';
    if (obj is Map) {
      final runs = obj['runs'] as List?;
      if (runs != null) {
        return runs.map((r) => r['text']?.toString() ?? '').join('');
      }
      final simple = obj['simpleText']?.toString();
      if (simple != null) return simple;
    }
    return '';
  }
}

class _CachedResult {
  final List<YouTubeVideo> videos;
  final DateTime expiresAt;
  const _CachedResult({required this.videos, required this.expiresAt});
}
