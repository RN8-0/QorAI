/// Qor AI - Metadata Service (OG Tags, Web Scraping)
/// Blueprint Section 9.2
///
/// Extracts Open Graph metadata from URLs:
/// - og:title, og:description, og:image
/// - twitter:card metadata
/// - Fallback: <title>, <meta description>
/// - Price detection (price, amount)
library;

import 'dart:convert';

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
    // v2: eski anahtarlardaki ZEHİRLİ (title=null) kayıtları geçersiz kılar —
    // cihazlarda saatlerce "ürün tanınamadı" olarak yapışıp kalmışlardı.
    final cacheKey = 'og_meta_v2_${url.hashCode}';
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

      // Save to cache - 24 hours. SADECE kullanılabilir bir başlık varsa!
      // Başarısız/boş sonucu cache'lemek, tek bir kötü denemeyi SAATLERCE
      // kalıcılaştırıyordu (kullanıcı kaç kez denerse denesin aynı null döner,
      // yeni build kursa bile) → "ürün tanınamadı" yapışıp kalıyordu.
      if (_isUsableTitle(metadata.title, url)) {
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
      }

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

    // ─── JSON-LD (schema.org Product) — EN GÜVENİLİR, evrensel ───
    // Dünya genelindeki e-ticaret siteleri (Trendyol, Hepsiburada, Shopify,
    // WooCommerce, çoğu mağaza) ürün adı/fiyat/marka/görselini server-render
    // JSON-LD olarak gömer → JS gerektirmez, cihazın kendi isteğiyle okunur.
    final jsonLd = _extractJsonLdProduct(html);
    title = jsonLd.title;
    price = jsonLd.price;
    image = jsonLd.image;
    description = jsonLd.description;

    // ─── Open Graph Tags ───
    title ??= _extractMetaContent(html, 'og:title');
    description ??= _extractMetaContent(html, 'og:description');
    image ??= _extractMetaContent(html, 'og:image');
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
    price ??= _extractPrice(html);

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

  /// Extract product info from JSON-LD (schema.org Product). Universal across
  /// e-commerce sites worldwide; returns nulls when no Product node is found.
  ({String? title, String? price, String? image, String? brand, String? description})
  _extractJsonLdProduct(String html) {
    final blocks = RegExp(
      r'''<script[^>]*type\s*=\s*["']application/ld\+json["'][^>]*>(.*?)</script>''',
      caseSensitive: false,
      dotAll: true,
    ).allMatches(html);
    for (final block in blocks) {
      var raw = block.group(1)?.trim();
      if (raw == null || raw.isEmpty) continue;
      // Bazı siteler JSON-LD içinde satır sonları/HTML yorumları bırakır.
      raw = raw.replaceAll(RegExp(r'<!--.*?-->', dotAll: true), '').trim();
      dynamic decoded;
      try {
        decoded = jsonDecode(raw);
      } catch (_) {
        continue;
      }
      final product = _findProductNode(decoded);
      if (product == null) continue;
      final title = _jsonLdString(product['name']);
      if (title == null || title.trim().isEmpty) continue;
      return (
        title: _decodeHtmlEntities(title),
        price: _jsonLdPrice(product['offers']),
        image: _jsonLdImage(product['image']),
        brand: _jsonLdString(product['brand']) ??
            _jsonLdString((product['brand'] is Map)
                ? (product['brand'] as Map)['name']
                : null),
        description: () {
          final d = _jsonLdString(product['description']);
          return d == null ? null : _decodeHtmlEntities(d);
        }(),
      );
    }
    return (title: null, price: null, image: null, brand: null, description: null);
  }

  /// Recursively find a schema.org Product node (handles arrays + @graph).
  Map<String, dynamic>? _findProductNode(dynamic node, [int depth = 0]) {
    if (depth > 6 || node == null) return null;
    if (node is List) {
      for (final item in node) {
        final found = _findProductNode(item, depth + 1);
        if (found != null) return found;
      }
      return null;
    }
    if (node is Map) {
      final map = node.cast<String, dynamic>();
      final type = map['@type'];
      final isProduct = type == 'Product' ||
          (type is List && type.contains('Product')) ||
          (map.containsKey('name') &&
              (map.containsKey('offers') || map.containsKey('sku')));
      if (isProduct && (map['name'] != null)) return map;
      // @graph veya iç içe düğümler
      if (map['@graph'] != null) {
        final found = _findProductNode(map['@graph'], depth + 1);
        if (found != null) return found;
      }
      for (final v in map.values) {
        if (v is List || v is Map) {
          final found = _findProductNode(v, depth + 1);
          if (found != null) return found;
        }
      }
    }
    return null;
  }

  String? _jsonLdString(dynamic v) {
    if (v == null) return null;
    if (v is String) return v.trim().isEmpty ? null : v.trim();
    if (v is List && v.isNotEmpty) return _jsonLdString(v.first);
    if (v is Map) return _jsonLdString(v['name'] ?? v['@value']);
    return null;
  }

  String? _jsonLdImage(dynamic v) {
    if (v == null) return null;
    if (v is String) return v.trim().isEmpty ? null : v.trim();
    if (v is List && v.isNotEmpty) return _jsonLdImage(v.first);
    if (v is Map) return _jsonLdImage(v['url'] ?? v['contentUrl']);
    return null;
  }

  String? _jsonLdPrice(dynamic offers) {
    if (offers == null) return null;
    if (offers is List && offers.isNotEmpty) return _jsonLdPrice(offers.first);
    if (offers is Map) {
      final p = offers['price'] ??
          offers['lowPrice'] ??
          (offers['priceSpecification'] is Map
              ? (offers['priceSpecification'] as Map)['price']
              : null);
      if (p == null) return null;
      final s = p.toString().trim();
      return s.isEmpty ? null : s;
    }
    return null;
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

  /// Amazon <title> genelde "Amazon.com.tr: <ürün> : Elektronik" gibi önek/sonek
  /// taşır → ürün adını temizle. Boş/başlıksız için null.
  String? _cleanAmazonTitleTag(String? raw) {
    if (raw == null) return null;
    var t = raw.trim();
    if (t.isEmpty) return null;
    // "Amazon.com.tr:", "Amazon.com:", "Amazon:" öneki
    t = t.replaceFirst(
      RegExp(r'^\s*Amazon[^:]*:\s*', caseSensitive: false),
      '',
    );
    // " : Amazon..." veya " - Amazon..." soneki (kategori kuyruğu dahil)
    t = t.replaceFirst(RegExp(r'\s*[:|-]\s*Amazon.*$', caseSensitive: false), '');
    t = t.trim();
    // Yalnız "Amazon.com.tr" kaldıysa geçersiz.
    if (t.isEmpty || RegExp(r'^amazon', caseSensitive: false).hasMatch(t)) {
      return null;
    }
    return t;
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

  /// Cache'lenmeye değer GERÇEK bir ürün başlığı mı? Boş, domain adı veya
  /// "Amazon ASIN…" placeholder'ı KULLANILAMAZ — bunları cache'lemek başarısız
  /// bir denemeyi saatlerce kalıcı hale getirir.
  bool _isUsableTitle(String? title, String url) {
    final t = title?.trim() ?? '';
    if (t.isEmpty) return false;
    if (t.startsWith('Amazon ASIN') || t.startsWith('Amazon ISBN')) return false;
    if (t.toLowerCase() == _extractDomainName(url).toLowerCase()) return false;
    if (!t.contains(' ') &&
        RegExp(r'^[a-z0-9.-]+\.[a-z]{2,}$', caseSensitive: false).hasMatch(t)) {
      return false;
    }
    return true;
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
    // v2: eski anahtarlardaki ZEHİRLİ (title=null) kayıtları geçersiz kılar —
    // cihazlarda saatlerce "ürün tanınamadı" olarak yapışıp kalmışlardı.
    final cacheKey = 'og_meta_v2_${url.hashCode}';
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

      String? title;
      String? description;
      String? image;
      String? price;
      const siteName = 'Amazon';

      // TÜM yöntemleri dene — "bot sayfası" olsa bile og:title/productTitle
      // sıklıkla yine bulunur; erken çıkıp ürün adını kaybetme (kullanıcı:
      // "ürün adı nerede"). Amazon JSON-LD nadir ama zararsız, önce dene.
      final jsonLd = _extractJsonLdProduct(html);
      title = jsonLd.title;
      description = jsonLd.description;
      image = jsonLd.image;
      price = jsonLd.price;

      // OG tags (Amazon usually fills these)
      title ??= _extractMetaContent(html, 'og:title');
      description ??= _extractMetaContent(html, 'og:description');
      image ??= _extractMetaContent(html, 'og:image');

      // Amazon-specific title fallback
      title ??= _extractAmazonTitle(html);
      title ??= _cleanAmazonTitleTag(_extractTitleTag(html));

      // Hiçbir gerçek başlık yok VE bot/captcha sayfası → URL/ASIN'e düş.
      if ((title == null || title.trim().isEmpty) && _isAmazonBotPage(html)) {
        return OgMetadata(
          title: _extractAmazonTitleFromUrl(url),
          siteName: 'Amazon',
        );
      }

      // Amazon-specific price extraction (JSON-LD fiyatını ezme)
      price ??= _extractAmazonPrice(html);
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

      // Save to cache - 6 hours (Amazon prices can change). SADECE kullanılabilir
      // başlık varsa — başarısız sonucu cache'lemek "tanınamadı"yı saatlerce
      // yapıştırıyordu (bkz. fetchMetadata'daki aynı not).
      if (_isUsableTitle(metadata.title, url)) {
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
      }

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
