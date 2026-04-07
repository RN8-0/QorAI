/// Compair - Google Custom Search API Service
/// Searches the internet for product reviews and opinions.

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

class SearchResult {
  final String title;
  final String snippet;
  final String link;

  const SearchResult({
    required this.title,
    required this.snippet,
    required this.link,
  });
}

class GoogleSearchService {
  final Dio _dio;
  final String _apiKey;
  final String _searchEngineId;

  static const _baseUrl = 'https://www.googleapis.com/customsearch/v1';

  GoogleSearchService({
    required Dio dio,
    required String apiKey,
    required String searchEngineId,
  })  : _dio = dio,
        _apiKey = apiKey,
        _searchEngineId = searchEngineId;

  /// Searches for product reviews/opinions on the internet.
  /// [productName]: Product name
  /// [languageCode]: ISO 639-1 language code
  /// [maxResults]: Maximum number of results (1-10)
  Future<List<SearchResult>> searchReviews({
    required String productName,
    required String languageCode,
    int maxResults = 5,
  }) async {
    if (_apiKey.isEmpty || _searchEngineId.isEmpty) {
      debugPrint('=== COMPAIR: Google Search API keys not configured ===');
      return [];
    }

    try {
      final reviewKeyword = _getReviewKeyword(languageCode);
      final query = '$productName $reviewKeyword';

      final response = await _dio.get(
        _baseUrl,
        queryParameters: {
          'key': _apiKey,
          'cx': _searchEngineId,
          'q': query,
          'num': maxResults.clamp(1, 10),
          'lr': 'lang_$languageCode',
        },
      );

      if (response.statusCode != 200) return [];

      final items = response.data['items'] as List? ?? [];
      return items.map((item) => SearchResult(
        title: item['title']?.toString() ?? '',
        snippet: item['snippet']?.toString() ?? '',
        link: item['link']?.toString() ?? '',
      )).toList();
    } catch (e) {
      debugPrint('=== COMPAIR: Google Search error: $e ===');
      return [];
    }
  }

  String _getReviewKeyword(String languageCode) {
    switch (languageCode) {
      case 'tr':
        return 'kullanıcı yorumları inceleme';
      case 'de':
        return 'erfahrungen bewertung test';
      case 'fr':
        return 'avis utilisateurs test';
      case 'es':
        return 'opiniones usuarios análisis';
      case 'pt':
        return 'avaliação opinião análise';
      case 'it':
        return 'recensioni opinioni test';
      case 'ja':
        return 'レビュー 口コミ 評価';
      case 'ko':
        return '리뷰 후기 평가';
      case 'zh':
        return '评测 用户评价';
      case 'ru':
        return 'обзор отзывы пользователей';
      default:
        return 'user reviews opinions rating';
    }
  }
}
