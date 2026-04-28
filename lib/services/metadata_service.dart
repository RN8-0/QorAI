/// Qor AI - Metadata Service (OG Tags, Web Scraping)
/// Blueprint Section 9.2
///
/// Extracts Open Graph metadata from URLs:
/// - og:title, og:description, og:image
/// - twitter:card metadata
/// - Fallback: <title>, <meta description>
/// - Price detection (price, amount)
library;

import 'package:dio/dio.dart';
import 'package:qor_ai/domain/entities/ai_entities.dart';
import 'package:qor_ai/services/cache_service.dart';

class MetadataService {
  final Dio _dio;
  final CacheService _cacheService;

  MetadataService({
    required Dio dio,
    required CacheService cacheService,
  })  : _dio = dio,
        _cacheService = cacheService;

  /// Fetch OG Metadata from URL
  Future<OgMetadata> fetchMetadata(String url) async {
    // Cache check
    final cacheKey = 'og_meta_${url.hashCode}';
    final cached = await _cacheService.get<Map<String, dynamic>>(cacheKey);
    if (cached != null) {
      return OgMetadata(
        title: cached['title'],
        description: cached['description'],
        image: cached['image'],
        price: cached['price'],
        siteName: cached['siteName'],
      );
    }

    try {
      // Fetch HTML content
      final response = await _dio.get(
        url,
        options: Options(
          headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept':
                'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5,tr;q=0.3',
          },
          followRedirects: true,
          maxRedirects: 5,
          receiveTimeout: const Duration(seconds: 10),
        ),
      );

      final html = response.data.toString();
      final metadata = _parseMetadata(html, url);

      // Save to cache - 24 hours
      await _cacheService.set(
        cacheKey,
        {
          'title': metadata.title,
          'description': metadata.description,
          'image': metadata.image,
          'price': metadata.price,
          'siteName': metadata.siteName,
        },
        duration: const Duration(hours: 24),
      );

      return metadata;
    } on DioException {
      // Return empty metadata on error
      return OgMetadata(
        title: _extractDomainName(url),
        siteName: _extractDomainName(url),
      );
    } catch (e) {
      return OgMetadata(
        title: _extractDomainName(url),
        siteName: _extractDomainName(url),
      );
    }
  }

  /// Parse metadata from HTML
  OgMetadata _parseMetadata(String html, String url) {
    String? title;
    String? description;
    String? image;
    String? price;
    String? siteName;

    // ─── Open Graph Tags ───
    title = _extractMetaContent(html, 'og:title');
    description = _extractMetaContent(html, 'og:description');
    image = _extractMetaContent(html, 'og:image');
    siteName = _extractMetaContent(html, 'og:site_name');

    // ─── Twitter Card Fallback ───
    title ??= _extractMetaContent(html, 'twitter:title');
    description ??= _extractMetaContent(html, 'twitter:description');
    image ??= _extractMetaContent(html, 'twitter:image');

    // ─── Standard Meta Tags Fallback ───
    title ??= _extractMetaContent(html, 'title', isName: true);
    description ??= _extractMetaContent(html, 'description', isName: true);

    // ─── <title> Tag Fallback ───
    title ??= _extractTitleTag(html);

    // ─── Price Detection ───
    price = _extractPrice(html);

    // ─── Fix Image URL ───
    if (image != null && !image.startsWith('http')) {
      final uri = Uri.parse(url);
      if (image.startsWith('//')) {
        image = '${uri.scheme}:$image';
      } else if (image.startsWith('/')) {
        image = '${uri.scheme}://${uri.host}$image';
      } else {
        image = '${uri.scheme}://${uri.host}/$image';
      }
    }

    // Site name fallback
    siteName ??= _extractDomainName(url);

    return OgMetadata(
      title: title?.trim(),
      description: description?.trim(),
      image: image,
      price: price,
      siteName: siteName,
    );
  }

  /// Extract meta tag content
  String? _extractMetaContent(String html, String property, {bool isName = false}) {
    // property="og:title" or name="description" formats
    final attributeName = isName ? 'name' : 'property';

    // Pattern: <meta property="og:title" content="..." />
    final patterns = [
      RegExp(
        '<meta[^>]*$attributeName=["\']$property["\'][^>]*content=["\']([^"\']*)["\']',
        caseSensitive: false,
      ),
      RegExp(
        '<meta[^>]*content=["\']([^"\']*)["\'][^>]*$attributeName=["\']$property["\']',
        caseSensitive: false,
      ),
    ];

    for (final pattern in patterns) {
      final match = pattern.firstMatch(html);
      if (match != null && match.group(1)?.isNotEmpty == true) {
        return _decodeHtmlEntities(match.group(1)!);
      }
    }

    return null;
  }

  /// Extract <title> tag
  String? _extractTitleTag(String html) {
    final pattern = RegExp(
      '<title[^>]*>([^<]*)</title>',
      caseSensitive: false,
    );
    final match = pattern.firstMatch(html);
    if (match != null && match.group(1)?.isNotEmpty == true) {
      return _decodeHtmlEntities(match.group(1)!);
    }
    return null;
  }

  /// Extract price information
  String? _extractPrice(String html) {
    // Schema.org price
    final schemaPattern = RegExp(
      r'"price"\s*:\s*"?([0-9.,]+)"?',
      caseSensitive: false,
    );
    var match = schemaPattern.firstMatch(html);
    if (match != null) {
      return match.group(1);
    }

    // Meta tag price
    final metaPrice = _extractMetaContent(html, 'product:price:amount');
    if (metaPrice != null) {
      return metaPrice;
    }

    // Common price patterns
    final pricePatterns = [
      RegExp(r'class="[^"]*price[^"]*"[^>]*>[\s]*([₺$€£¥]?\s*[0-9.,]+)', caseSensitive: false),
      RegExp(r'data-price="([0-9.,]+)"'),
      RegExp(r'itemprop="price"[^>]*content="([0-9.,]+)"'),
    ];

    for (final pattern in pricePatterns) {
      match = pattern.firstMatch(html);
      if (match != null) {
        return match.group(1)?.trim();
      }
    }

    return null;
  }

  /// Extract domain name
  String _extractDomainName(String url) {
    try {
      final uri = Uri.parse(url);
      final host = uri.host;
      // Remove www.
      return host.startsWith('www.') ? host.substring(4) : host;
    } catch (e) {
      return url;
    }
  }

  /// HTML entity decode
  String _decodeHtmlEntities(String text) {
    return text
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&apos;', "'")
        .replaceAll('&#x27;', "'")
        .replaceAll('&nbsp;', ' ')
        .replaceAll('&#8211;', '-')
        .replaceAll('&#8212;', '-')
        .replaceAll('&#8220;', '"')
        .replaceAll('&#8221;', '"')
        .trim();
  }

  /// Site-specific parsers
  Future<OgMetadata> fetchMetadataForSite(String url) async {
    final domain = _extractDomainName(url).toLowerCase();

    // Site-specific handlers
    if (domain.contains('amazon')) {
      return _fetchAmazonMetadata(url);
    } else if (domain.contains('apple.com')) {
      return _fetchAppleMetadata(url);
    }

    // Default OG scraping
    return fetchMetadata(url);
  }

  /// Amazon custom metadata fetcher
  Future<OgMetadata> _fetchAmazonMetadata(String url) async {
    // Cache check
    final cacheKey = 'og_meta_${url.hashCode}';
    final cached = await _cacheService.get<Map<String, dynamic>>(cacheKey);
    if (cached != null) {
      return OgMetadata(
        title: cached['title'],
        description: cached['description'],
        image: cached['image'],
        price: cached['price'],
        siteName: cached['siteName'],
      );
    }

    try {
      final response = await _dio.get(
        url,
        options: Options(
          headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept':
                'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,tr;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0',
            'DNT': '1',
          },
          followRedirects: true,
          maxRedirects: 5,
          receiveTimeout: const Duration(seconds: 15),
        ),
      );

      final html = response.data.toString();

      // Return empty metadata if Amazon returned bot page
      if (_isAmazonBotPage(html)) {
        return OgMetadata(
          title: _extractAmazonTitleFromUrl(url),
          siteName: 'Amazon',
        );
      }

      String? title;
      String? description;
      String? image;
      String? price;
      const siteName = 'Amazon';

      // OG tags (Amazon usually fills these)
      title = _extractMetaContent(html, 'og:title');
      description = _extractMetaContent(html, 'og:description');
      image = _extractMetaContent(html, 'og:image');

      // Amazon-specific title fallback
      title ??= _extractAmazonTitle(html);
      title ??= _extractTitleTag(html);

      // Amazon-specific price extraction
      price = _extractAmazonPrice(html);
      price ??= _extractPrice(html);

      // Amazon-specific image fallback
      if (image == null || image.isEmpty) {
        image = _extractAmazonImage(html);
      }

      // Fix image URL
      if (image != null && !image.startsWith('http')) {
        final uri = Uri.parse(url);
        if (image.startsWith('//')) {
          image = '${uri.scheme}:$image';
        } else if (image.startsWith('/')) {
          image = '${uri.scheme}://${uri.host}$image';
        }
      }

      final metadata = OgMetadata(
        title: title?.trim(),
        description: description?.trim(),
        image: image,
        price: price,
        siteName: siteName,
      );

      // Save to cache - 6 hours (Amazon prices can change)
      await _cacheService.set(
        cacheKey,
        {
          'title': metadata.title,
          'description': metadata.description,
          'image': metadata.image,
          'price': metadata.price,
          'siteName': metadata.siteName,
        },
        duration: const Duration(hours: 6),
      );

      return metadata;
    } catch (_) {
      return OgMetadata(
        title: _extractAmazonTitleFromUrl(url),
        siteName: 'Amazon',
      );
    }
  }

  /// Amazon bot/CAPTCHA page check
  bool _isAmazonBotPage(String html) {
    return html.contains('api-services-support@amazon.com') ||
        html.contains('robot check') ||
        html.contains('Enter the characters you see below') ||
        html.contains('automated access');
  }

  /// Extract Amazon product title from HTML
  String? _extractAmazonTitle(String html) {
    final patterns = [
      RegExp(r'id="productTitle"[^>]*>\s*([^<]+)', caseSensitive: false),
      RegExp(r'id="title"[^>]*>\s*<span[^>]*>\s*([^<]+)', caseSensitive: false),
      RegExp(r'"productTitle"\s*:\s*"([^"]+)"', caseSensitive: false),
    ];
    for (final p in patterns) {
      final m = p.firstMatch(html);
      if (m != null && m.group(1)?.trim().isNotEmpty == true) {
        return _decodeHtmlEntities(m.group(1)!.trim());
      }
    }
    return null;
  }

  /// Guess Amazon product name from URL
  String? _extractAmazonTitleFromUrl(String url) {
    try {
      final uri = Uri.parse(url);
      final segments = uri.pathSegments;
      // The segment before /dp/ is usually the product name
      final dpIndex = segments.indexOf('dp');
      if (dpIndex > 0) {
        return segments[dpIndex - 1].replaceAll('-', ' ');
      }
    } catch (_) {}
    return null;
  }

  /// Extract Amazon price from HTML
  String? _extractAmazonPrice(String html) {
    final patterns = [
      // JSON-LD veya data attribute
      RegExp(r'"price"\s*:\s*"([0-9.,]+)"'),
      RegExp(r'data-asin-price="([0-9.,]+)"'),
      // New Amazon price structure
      RegExp(
        r'<span[^>]*class="[^"]*a-offscreen[^"]*"[^>]*>([^<]*[0-9][^<]*)</span>',
        caseSensitive: false,
      ),
      // Legacy Amazon price blocks
      RegExp(
        r'id="priceblock_ourprice"[^>]*>\s*([^<]+)',
        caseSensitive: false,
      ),
      RegExp(
        r'id="priceblock_dealprice"[^>]*>\s*([^<]+)',
        caseSensitive: false,
      ),
      // a-price-whole + a-price-fraction combination
      RegExp(
        r'class="[^"]*a-price-whole[^"]*"[^>]*>([0-9.,]+)',
        caseSensitive: false,
      ),
      // itemprop
      RegExp(r'itemprop="price"[^>]*content="([0-9.,]+)"'),
    ];

    for (final p in patterns) {
      final m = p.firstMatch(html);
      if (m != null) {
        final raw = m.group(1)?.trim() ?? '';
        if (raw.isNotEmpty && RegExp(r'[0-9]').hasMatch(raw)) {
          return _decodeHtmlEntities(raw);
        }
      }
    }
    return null;
  }

  /// Extract Amazon main product image from HTML
  String? _extractAmazonImage(String html) {
    final patterns = [
      RegExp(r'id="landingImage"[^>]*src="([^"]+)"', caseSensitive: false),
      RegExp(r'id="imgBlkFront"[^>]*src="([^"]+)"', caseSensitive: false),
      RegExp(r'"hiRes"\s*:\s*"(https://[^"]+)"'),
      RegExp(r'"large"\s*:\s*"(https://[^"]+m\.media-amazon\.com[^"]+)"'),
    ];
    for (final p in patterns) {
      final m = p.firstMatch(html);
      if (m != null && m.group(1)?.isNotEmpty == true) {
        return m.group(1);
      }
    }
    return null;
  }

  /// Apple Store custom metadata fetcher
  Future<OgMetadata> _fetchAppleMetadata(String url) async {
    return fetchMetadata(url);
  }
}
