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
import 'package:qor_ai/core/pb_client.dart' show kPbBaseUrl;
import 'package:qor_ai/domain/entities/ai_entities.dart';
import 'package:qor_ai/services/cache_service.dart';
import 'package:qor_ai/services/webview_resolver.dart'
    show embeddedWebUrl, isDeepLinkTracker, isInterstitialTitle;

class MetadataService {
  final Dio _dio;
  final CacheService _cacheService;

  MetadataService({
    required Dio dio,
    required CacheService cacheService,
  })  : _dio = dio,
        _cacheService = cacheService;

  /// [next] bizi [current]'a GERİ döndüren bir ara sayfa mı (bot kapısı, giriş
  /// duvarı, çerez/bölge kapısı)? Evrensel imza: hedefin query'sinde bulunduğumuz
  /// URL'nin kendisi taşınır (`checkLoading?returnUrl=<current>`). Böyle bir hop
  /// KOVALANMAZ — ürün URL'si elimizdeyken kapının URL'sine geçmek kimliği
  /// (slug'ı) kaybettirir ve link "tanınamadı" olur.
  static bool _pointsBackTo(String next, String current) {
    try {
      final cur = Uri.parse(current);
      final bare = '${cur.origin}${cur.path}';
      for (final v in Uri.parse(next).queryParameters.values) {
        if (v.isEmpty) continue;
        if (v == current || v == bare) return true;
        final vb = Uri.tryParse(v);
        if (vb != null && vb.host == cur.host && vb.path == cur.path) return true;
      }
    } catch (_) {}
    return false;
  }

  /// Herhangi bir paylaşım/kısa linki gerçek ürün URL'sine çözer.
  ///
  /// **DOMAIN EZBERİ YOK.** Önceden yalnızca elle yazılmış bir kısa-link host
  /// listesi çözümleniyordu → listede olmayan HER platform patlıyordu (ölçülen
  /// örnek: Sahibinden `shbd.io/s/… → sahibinden.com/s/… → *.adj.st` — tracker'da
  /// takılıp 725 byte'lık boş sayfa alınıyordu, ürün tanınmıyordu). Artık HER
  /// link için yönlendirme zinciri takip edilir; hangi platform olursa olsun
  /// çalışır.
  ///
  /// **HEAD KULLANILMAZ.** Ölçülen kanıt (Sahibinden `shbd.io/s/…`): aynı link
  /// HEAD ve GET'e FARKLI zincir veriyor —
  ///   HEAD → `sahibinden.com/s/…` → `cs/checkLoading` (bot kapısı) → 403 ÇIKMAZ
  ///   GET  → `sahibinden.com/s/…` → `*.adj.st?adj_fallback=<gerçek ürün>` ✓
  /// Bot korumalı siteler HEAD'i şüpheli sayar (hiçbir tarayıcı HEAD atmaz) ve
  /// kapıya yollar. Eski kod HEAD'i önce deneyip "başarılı" (301) sayıyordu →
  /// GET'e HİÇ düşmüyor, kapıda ölüyordu. Ucuzluk GET + stream ile korunur:
  /// başlıklar gelir gelmez gövde iptal edilir → 3xx'te zaten gövde yok, 2xx'te
  /// de koca sayfa inmez.
  ///
  /// Hata olursa orijinal URL döner (çağıran koşulsuz kullanır).
  /// URL kısaltılmış görünüyor mu? DOMAIN LİSTESİ YOK (yeni bir kısaltıcı
  /// çıkınca kod güncellemek gerekmesin): imza YAPISALDIR — kısa host + kısa,
  /// okunaksız (sözcük içermeyen) yol. `amzn.eu/d/0j9wMEax`, `a.co/xxxx`,
  /// `ty.gl/xxxx` bu kalıba uyar; `amazon.com.tr/Apple-MacBook-Air/dp/…` uymaz.
  static bool _looksShortened(String url) {
    try {
      final u = Uri.parse(url);
      final host = u.host.replaceFirst(RegExp(r'^www\.'), '');
      final path = u.path.replaceAll(RegExp(r'^/|/$'), '');
      if (path.isEmpty) return false;
      // Yolda tire/alt çizgiyle ayrılmış gerçek kelimeler varsa ürün slug'ıdır.
      if (RegExp(r'[a-zA-Z]{4,}[-_][a-zA-Z]{3,}').hasMatch(path)) return false;
      final shortHost = host.length <= 12 || host.split('.').first.length <= 5;
      return shortHost && path.length <= 24;
    } catch (_) {
      return false;
    }
  }

  /// Kısa linki SUNUCUDA çözer.
  ///
  /// NEDEN: Dart'ın TLS parmak izi bot sayılıyor — aynı URL'e curl 301 dönerken
  /// Dio/dart:io 403 alıyor. Yani kısaltılmış Amazon linkleri (amzn.eu/d/…,
  /// a.co/…) CİHAZDAN çözülemez, hangi başlık/istemci ayarı denenirse denensin.
  /// Sunucu tarafındaki `/api/resolve-link` ucu zinciri izler ve nihai URL'i
  /// (varsa sayfa başlığını) döndürür. Başarısız olursa boş döner ve çağıran
  /// eski (yerel) yola devam eder.
  Future<({String url, String title})> _resolveViaServer(String url) async {
    try {
      final resp = await _dio
          .get<dynamic>(
            '$kPbBaseUrl/api/resolve-link',
            queryParameters: {'url': url},
            options: Options(
              responseType: ResponseType.json,
              validateStatus: (s) => s != null && s < 500,
            ),
          )
          .timeout(const Duration(seconds: 22));
      final data = resp.data;
      final map = data is String ? jsonDecode(data) : data;
      if (map is! Map) return (url: '', title: '');
      final resolved = (map['url'] ?? '').toString().trim();
      if (resolved.isEmpty || !resolved.startsWith('http')) {
        return (url: '', title: '');
      }
      return (url: resolved, title: (map['title'] ?? '').toString().trim());
    } catch (_) {
      return (url: '', title: '');
    }
  }

  /// Sunucuda çözülen başlıklar burada saklanır: `fetchMetadata` cihazdan
  /// sayfayı çekemediğinde (aynı 403) bu başlık kullanılır.
  final Map<String, String> _serverTitles = {};

  String? serverTitleFor(String url) {
    final t = _serverTitles[url];
    return (t != null && t.isNotEmpty) ? t : null;
  }

  Future<String> resolveShareUrl(String url) async {
    // KISA LİNK → ÖNCE SUNUCU. Cihazdan çözülemediği ölçüldü (403), bu yüzden
    // yerel zinciri boşuna denemek yalnızca gecikme üretir.
    if (_looksShortened(url)) {
      final server = await _resolveViaServer(url);
      if (server.url.isNotEmpty && server.url != url) {
        if (server.title.isNotEmpty) _serverTitles[server.url] = server.title;
        // Sunucudan gelen nihai URL hâlâ tracker/kısa olabilir → yerel zincir
        // onun üzerinden devam etsin.
        url = server.url;
      }
    }
    var current = url;
    try {
      for (var hop = 0; hop < 10; hop++) {
        final embedded = embeddedWebUrl(current);

        // Tracker'a geldiysek: kovalama (HTTP ile ürüne değil, app'e yönlendirir
        // → `intent://`), içindeki gerçek web URL'sini aç.
        if (isDeepLinkTracker(current)) {
          if (embedded == null || embedded == current) break;
          current = embedded;
          continue; // açılan URL de kısa/tracker olabilir → döngü sürsün
        }

        final hopResult = await _hop(current);
        final status = hopResult.status;

        // Bloklandı/kapı (403/429/5xx) veya ağ hatası (-1): daha ileri gidemeyiz.
        // Kapı URL'sinin içinde gerçek hedef varsa oradan devam et, yoksa
        // elimizdeki `current` en iyisi — sayfa kazınamasa bile slug'ından ürün
        // adı çıkar.
        if (status >= 400 || status <= 0) {
          if (embedded != null && embedded != current) {
            current = embedded;
            continue;
          }
          break;
        }

        final loc = hopResult.location;
        if (loc == null || loc.isEmpty) break; // 2xx → hedefteyiz

        final next = _absolutize(current, loc);
        if (next == null) {
          // Location http(s) DEĞİL (`intent://`, `sahibinden://`, `myapp://`) →
          // Uri.resolve bunda çöp üretir. Deep-link'in içindeki web fallback'ini
          // aç (Android intent'i `S.browser_fallback_url` taşır).
          final viaDeepLink = embeddedWebUrl(loc) ?? embedded;
          if (viaDeepLink != null && viaDeepLink != current) {
            current = viaDeepLink;
            continue;
          }
          break;
        }
        if (next == current) break;
        // Bizi geldiğimiz yere geri döndüren ara sayfa (bot kapısı/giriş duvarı)
        // → kovalama, ürün URL'sinde kal.
        if (_pointsBackTo(next, current)) break;
        current = next;
      }
    } catch (_) {
      return url;
    }
    return current;
  }

  /// `Location`'ı mutlak http(s) URL'ye çevirir. http(s) DIŞI şema (intent://,
  /// özel app şeması) için null → çağıran deep-link olarak ele alır.
  static String? _absolutize(String base, String location) {
    try {
      final resolved = Uri.parse(base).resolve(location);
      final scheme = resolved.scheme.toLowerCase();
      if (scheme != 'http' && scheme != 'https') return null;
      return resolved.toString();
    } catch (_) {
      return null;
    }
  }

  /// Tek hop: durum kodu + ham `Location`. GET atar ama gövdeyi İNDİRMEZ —
  /// yanıt stream olarak açılır ve başlıklar gelir gelmez iptal edilir.
  Future<({int status, String? location})> _hop(String url) async {
    try {
      final resp = await _dio.get<ResponseBody>(
        url,
        options: Options(
          responseType: ResponseType.stream,
          headers: {
            'User-Agent': _mobileUa,
            'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
            'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
            'Upgrade-Insecure-Requests': '1',
          },
          followRedirects: false,
          // 3xx/4xx/5xx'i istisna saymadan al ki `Location` ve kapı durumu
          // okunabilsin.
          validateStatus: (s) => s != null && s < 600,
          receiveTimeout: const Duration(seconds: 8),
        ),
      );
      // Gövdeyi ISTEMIYORUZ: bağlantıyı hemen kapat (koca sayfa inmesin).
      try {
        await resp.data?.stream.listen(null, cancelOnError: true).cancel();
      } catch (_) {}
      return (
        status: resp.statusCode ?? 0,
        location: resp.headers.value('location'),
      );
    } catch (_) {
      return (status: -1, location: null);
    }
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
      var metadata = _parseMetadata(html, url);
      // Cihaz sayfayı çekemediyse (bot koruması → boş/çöp başlık) sunucunun
      // çözümleme sırasında okuduğu <title> devreye girer.
      if (!_isUsableTitle(metadata.title, url)) {
        final fromServer = serverTitleFor(url);
        if (fromServer != null && _isUsableTitle(fromServer, url)) {
          metadata = OgMetadata(
            title: fromServer,
            description: metadata.description,
            image: metadata.image,
            price: metadata.price,
            siteName: metadata.siteName ?? _extractDomainName(url),
          );
        }
      }

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
      // Cihaz sayfayı çekemedi (bot koruması dâhil) — sunucunun okuduğu başlık
      // varsa onu kullan, yoksa alan adına düş.
      return OgMetadata(
        title: serverTitleFor(url) ?? _extractDomainName(url),
        siteName: _extractDomainName(url),
      );
    } catch (e) {
      return OgMetadata(
        title: serverTitleFor(url) ?? _extractDomainName(url),
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
    // Bot kapısı/sınama sayfasının başlığı ("Just a moment…", "Erişim
    // engellendi") ürün adı DEĞİLDİR. Bunu cache'lemek tek bir engellenmiş
    // denemeyi SAATLERCE kalıcılaştırır ve AI'a ürün adı diye "Just a moment..."
    // besler.
    if (isInterstitialTitle(t)) return false;
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

  /// Cihaz bir telefon → mobil UA en meşru görünen istektir ve Amazon'da ~5x
  /// küçük (dolayısıyla hızlı) mobil sayfayı getirir.
  static const _mobileUa =
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
  static const _desktopUa =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

  /// Tek bir Amazon HTML çekimi. Hata olursa null (çağıran yeniden dener).
  /// NOT: `Accept-Encoding`'de 'br' REKLAMI YAPMA — Dart brotli'yi açamaz,
  /// yanıt çöpe döner ve hiçbir regex tutmaz. gzip'i Dart zaten otomatik açar.
  Future<String?> _fetchAmazonHtml(String url, String ua) async {
    try {
      final response = await _dio.get(
        url,
        options: Options(
          headers: {
            'User-Agent': ua,
            'Accept':
                'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
            'Upgrade-Insecure-Requests': '1',
          },
          followRedirects: true,
          maxRedirects: 5,
          receiveTimeout: const Duration(seconds: 15),
        ),
      );
      final body = response.data?.toString();
      return (body == null || body.isEmpty) ? null : body;
    } catch (_) {
      return null;
    }
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
      // 1) MOBİL UA ile dene. Cihaz zaten bir telefon → mobil istek en meşru
      //    görünendir; Amazon mobil sayfayı verir: ~222KB (masaüstü 1.2MB) →
      //    ~5x daha hızlı. NOT: mobil sayfada id="productTitle" YOKTUR, ürün adı
      //    <title>'da gelir → _cleanAmazonTitleTag yakalar (cihazda ölçüldü).
      var html = await _fetchAmazonHtml(url, _mobileUa);

      // 2) Amazon AYNI IP'den art arda isteklerde hız-sınırı uygulayıp ~1.5KB'lık
      //    bot/captcha sayfası döndürüyor (ölçüldü; kısa bir bekleme sonrası aynı
      //    IP gerçek sayfayı yeniden veriyor). Bot sayfası geldiyse kısa bekle ve
      //    MASAÜSTÜ UA ile bir kez daha dene.
      if (html == null || _isAmazonBotPage(html)) {
        await Future<void>.delayed(const Duration(milliseconds: 1200));
        html = await _fetchAmazonHtml(url, _desktopUa) ?? html;
      }
      if (html == null) {
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
