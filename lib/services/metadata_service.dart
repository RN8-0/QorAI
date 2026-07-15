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

  /// Mobile-app "share" / short-link hosts. Buttons like Amazon's "Share" or
  /// Trendyol's "Paylaş" produce opaque short links (amzn.eu/d/…, ty.gl/…,
  /// a.co/…) that carry no product slug or ASIN. Downstream extraction (slug,
  /// ASIN, e-commerce domain detection) then fails and the AI wrongly rejects a
  /// real product as "not found". These must be resolved to the canonical
  /// product URL before analysis.
  static const Set<String> _shareLinkHosts = {
    // Amazon app / short share
    'amzn.to', 'amzn.eu', 'amzn.asia', 'amzn.in', 'amzn.com', 'a.co',
    // Trendyol app
    'ty.gl', 'tyml.gl',
    // Hepsiburada app
    'hb.gy',
    // AliExpress app
    's.click.aliexpress.com', 'a.aliexpress.com', 'star.aliexpress.com',
    // eBay
    'ebay.us', 'ebay.to',
    // Temu
    'temu.to',
    // Generic URL shorteners commonly used for product shares
    'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'cutt.ly', 'rebrand.ly',
    'shorturl.at', 'is.gd', 'ow.ly', 'buff.ly', 'spr.ly', 'trib.al',
  };

  /// Deep-link / attribution hosts that DON'T HTTP-redirect to the product
  /// page — they resolve the app deep link client-side and embed the real web
  /// URL inside a query parameter (e.g. Trendyol's ty.gl → *.adj.st with
  /// `adjust_redirect=https%3A%2F%2Fwww.trendyol.com…`). These must be
  /// unwrapped, not chased.
  static const List<String> _deepLinkTrackerSuffixes = [
    'adj.st', 'adjust.com', 'go.link', 'onelink.me', 'app.link', 'page.link',
    'bnc.lt', 'tlnk.io', 'sng.link',
  ];

  /// Query-parameter names (in priority order) that attribution services use to
  /// carry the real destination web URL.
  static const List<String> _deepLinkUrlParams = [
    'adjust_redirect', 'redirect', 'af_web_dp', 'af_dp', 'af_r',
    r'$desktop_url', r'$fallback_url', r'$android_url', 'url', 'link',
    'deep_link', 'deeplink', 'dl', 'destination', 'target',
  ];

  /// True when [url]'s host is a known short/share link that must be expanded.
  static bool _isShareShortLink(String url) {
    try {
      final uri = Uri.parse(url);
      final host = uri.host.toLowerCase().replaceFirst('www.', '');
      if (_shareLinkHosts.contains(host)) return true;
      // AliExpress path-based short links: aliexpress.com/e/_xxxxx
      if (host.contains('aliexpress.com') && uri.path.startsWith('/e/')) {
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  /// True when [url] is an attribution/deep-link tracker (adj.st, onelink.me…).
  static bool _isDeepLinkTracker(String url) {
    try {
      final host = Uri.parse(url).host.toLowerCase();
      return _deepLinkTrackerSuffixes.any(
        (s) => host == s || host.endsWith('.$s'),
      );
    } catch (_) {
      return false;
    }
  }

  /// True when [value] is a plain http(s) web URL to a real (non-tracker,
  /// non-short, non-asset) host — i.e. a usable product destination.
  static bool _looksLikeWebUrl(String value) {
    final lower = value.toLowerCase();
    if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
      return false;
    }
    // Skip embedded image/asset URLs (og:image and friends).
    if (RegExp(r'\.(jpg|jpeg|png|webp|gif|svg)(\?|$)').hasMatch(lower)) {
      return false;
    }
    try {
      final u = Uri.parse(value);
      if (u.host.isEmpty) return false;
      return !_isShareShortLink(value) && !_isDeepLinkTracker(value);
    } catch (_) {
      return false;
    }
  }

  /// Extract the real destination web URL embedded in a deep-link tracker URL.
  static String? _unwrapDeepLink(String url) {
    try {
      final qp = Uri.parse(url).queryParameters;
      for (final key in _deepLinkUrlParams) {
        final v = qp[key];
        if (v != null && _looksLikeWebUrl(v)) return v;
      }
      // Fallback: any query value that is a plain product web URL.
      for (final v in qp.values) {
        if (_looksLikeWebUrl(v)) return v;
      }
    } catch (_) {}
    return null;
  }

  /// Resolve a mobile-app / short share link to its canonical product URL.
  /// Returns the original URL unchanged for normal (already-full) URLs or when
  /// resolution fails, so callers can use the result unconditionally.
  ///
  /// Two mechanisms are combined: (1) HTTP redirects are walked without
  /// downloading bodies — the moment a `Location` points at a real product host
  /// we return it; this works even where the product page blocks bot scraping,
  /// since the short-link service still returns a 301/302. (2) Attribution
  /// deep-links (ty.gl → *.adj.st) don't redirect to the web page, so the real
  /// URL is unwrapped from their query parameters instead.
  Future<String> resolveShareUrl(String url) async {
    if (!_isShareShortLink(url) && !_isDeepLinkTracker(url)) return url;

    var current = url;
    try {
      for (var hop = 0; hop < 8; hop++) {
        // Already at a deep-link tracker → unwrap the embedded web URL rather
        // than chasing more redirects (adj.st won't 3xx to the product page).
        if (_isDeepLinkTracker(current)) {
          final unwrapped = _unwrapDeepLink(current);
          if (unwrapped == null || unwrapped == current) break;
          current = unwrapped;
          if (!_isShareShortLink(current) && !_isDeepLinkTracker(current)) {
            break;
          }
          continue;
        }

        final resp = await _dio.get(
          current,
          options: Options(
            headers: {
              'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept':
                  'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'tr,en-US;q=0.9,en;q=0.8',
            },
            followRedirects: false,
            // Accept 2xx and 3xx without throwing so we can read `Location`.
            validateStatus: (s) => s != null && s < 400,
            receiveTimeout: const Duration(seconds: 8),
            // NOT: sendTimeout YOK — gövdesiz GET'te bazı Dio sürümleri
            // "sendTimeout without a request body" ile PATLIYOR → çözümleme
            // sessizce başarısız olup kısa link tanınmıyordu.
          ),
        );

        final status = resp.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          final location = resp.headers.value('location');
          if (location == null || location.isEmpty) break;
          final next = Uri.parse(current).resolve(location).toString();
          if (next == current) break;
          current = next;
          // Reached a real product URL — stop before fetching its body.
          if (!_isShareShortLink(current) && !_isDeepLinkTracker(current)) {
            break;
          }
          continue;
        }

        // Non-redirect (200) — already at the destination page. `realUri`
        // reflects any redirects Dio itself followed; prefer it when present.
        final real = resp.realUri.toString();
        if (real.isNotEmpty && real != current) current = real;
        break;
      }
    } catch (_) {
      // On any failure keep the original link; analysis still attempts it.
      return url;
    }
    return current;
  }

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
