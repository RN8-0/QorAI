/// Qor AI — Gerçek tarayıcı motoruyla (sistem WebView) link çözümleyici.
///
/// **NEDEN VAR (cihazda ÖLÇÜLDÜ, 2026-07-17):** modern e-ticaret siteleri
/// istemciyi TLS parmak izinden (JA3) tanıyor. `https://www.sahibinden.com/s/…`
/// için aynı makine, aynı IP, BİREBİR aynı başlıklarla:
///   • `curl`                        → 301 ✓
///   • Dio                           → 403 ✗
///   • ham `dart:io` HttpClient      → 403 ✗
/// Yani sorun başlık/IP/Dio değil — Dart'ın kendi TLS yığını. HİÇBİR başlık
/// ayarıyla aşılamaz; sunucu tarafı da çare değil (datacenter ASN'leri daha sert
/// bloklanır). Cihazda bu kapıları geçebilen tek istemci sistem WebView'ı:
/// gerçek Chrome motoru, gerçek TLS imzası, kullanıcının kendi ev IP'si.
///
/// Bonus: gerçek tarayıcı olduğu için Cloudflare "Just a moment…" sınamasını
/// KENDİ ÇÖZER, JS ile render edilen SPA mağazaları çalışır ve JS yönlendirmeleri
/// takip edilir — hiçbiri HTTP istemcisiyle mümkün değil.
///
/// **DOMAIN EZBERİ YOK:** hiçbir site/kural gömülü değil; ne olursa olsun sayfayı
/// tarayıcı açar, kimliği standart işaretlerden (JSON-LD → OG → twitter → title)
/// okur.
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// Bir sayfadan okunan ürün kimliği + tarayıcının indiği NİHAİ adres.
class WebViewResolution {
  final String finalUrl;
  final String? title;
  final String? description;
  final String? image;
  final String? price;
  final String? siteName;

  const WebViewResolution({
    required this.finalUrl,
    this.title,
    this.description,
    this.image,
    this.price,
    this.siteName,
  });

  /// Gerçek bir ürün kimliği taşıyor mu? (ara/engel sayfası başlıkları sayılmaz)
  bool get hasIdentity => isUsablePageTitle(title);
}

/// Bot kapısı / sınama / hata ara sayfalarının başlıkları. Bunlar ÜRÜN ADI
/// DEĞİLDİR — kabul edilirlerse AI "Just a moment..." adlı bir ürün analiz eder
/// ya da uydurmaya kayar. Evrensel imzalar, site adı ezberi yok.
///
/// İki kademe, çünkü YANLIŞ POZİTİF gerçek ürünü reddettirir: "Front **Loading**
/// Washing Machine 8kg" ya da "Bosch Serie 6 **Error** Free" gibi adlar genel
/// kelimeleri masumca içerir. Bu yüzden genel kelimeler YALNIZ başlık kısaysa
/// sayılır — ara sayfa başlıkları daima kısadır, ürün adları uzundur.
bool isInterstitialTitle(String? title) {
  final t = title?.trim().toLowerCase() ?? '';
  if (t.isEmpty) return false;

  // Kesin imzalar — bir ürün adında ASLA geçmez, uzunluktan bağımsız.
  const strong = [
    'just a moment',
    'checking your browser',
    'attention required',
    'are you a robot',
    'robot check',
    'enter the characters you see',
    'security check',
    'güvenlik doğrulama',
    'access denied',
    'erişim engellendi',
    'ddos-guard',
    'captcha',
  ];
  if (strong.any(t.contains)) return true;

  // Genel kelimeler — ürün adlarında da geçebilir → yalnız KISA başlıkta sayılır.
  const weak = [
    'loading',
    'yükleniyor',
    'redirecting',
    'yönlendiriliyor',
    'please wait',
    'lütfen bekleyin',
    'bir dakika',
    'bir saniye',
    'cloudflare',
    'forbidden',
    'error',
    'hata',
    '404',
    'page not found',
    'sayfa bulunamadı',
  ];
  return t.length <= 25 && weak.any(t.contains);
}

/// Sayfadan okunan başlık gerçek bir ürün kimliği sayılır mı?
bool isUsablePageTitle(String? title) {
  final t = title?.trim() ?? '';
  if (t.length < 3) return false;
  if (isInterstitialTitle(t)) return false;
  // Çıplak domain ("trendyol.com") kimlik değildir.
  if (!t.contains(' ') &&
      RegExp(r'^[a-z0-9.-]+\.[a-z]{2,}$', caseSensitive: false).hasMatch(t)) {
    return false;
  }
  return true;
}

/// Attribution / deep-link tracker host'ları. Bunlar ürün sayfasına HTTP ile
/// yönlendirmez — uygulamayı açmaya çalışır (`intent://`) ve gerçek web adresini
/// query/fragment içinde taşır. Bu yüzden **asla nihai adres sayılmazlar**:
/// tracker'ın yolu ürün slug'ının kopyasını taşıyabilir (`3swu.adj.st/ilan/…`),
/// yani "ürün gibi" görünür ama analiz edilemez.
///
/// Bu bir kolaylık listesi, kural değil: listede olmayan bir tracker'da da
/// çözümleme çalışır (gömülü URL çıkarımı + `intent://` yakalama ile).
const _deepLinkTrackerSuffixes = [
  'adj.st', 'adjust.com', 'go.link', 'onelink.me', 'app.link', 'page.link',
  'bnc.lt', 'tlnk.io', 'sng.link', 'branch.io', 'smart.link',
];

/// [url] bir attribution/deep-link tracker'ı mı (adj.st, onelink.me…)?
bool isDeepLinkTracker(String url) {
  try {
    final host = Uri.parse(url).host.toLowerCase();
    return _deepLinkTrackerSuffixes.any((s) => host == s || host.endsWith('.$s'));
  } catch (_) {
    return false;
  }
}

/// Bir URL / deep-link / intent içine GÖMÜLÜ gerçek web adresini çıkarır.
///
/// **PARAM ADI EZBERİ YOK:** ham metindeki her `http(s)://` ya da yüzde-kodlu
/// `https%3A%2F%2F` dizisi adaydır — adı ne olursa olsun (`adj_fallback`,
/// `S.browser_fallback_url`, `returnUrl`, `af_web_dp`…) bulur. Android intent'i
/// hedefi FRAGMENT'te taşır (`#Intent;…;S.browser_fallback_url=…;end`), orayı
/// `Uri.queryParameters` göremez — bu yüzden ham metin taranır.
///
/// En UZUN aday seçilir: aynı deep-link hem ana sayfayı hem tam ürün yolunu
/// taşır, uzun olan spesifik olandır. Ana sayfa / tracker / görsel adayları elenir.
String? embeddedWebUrl(String raw) {
  final candidates = <String>[];
  for (final m in RegExp(
    r'(https?(?::|%3[Aa])(?://|%2[Ff]%2[Ff])[^\s"''&;#]+)',
  ).allMatches(raw)) {
    var c = m.group(1)!;
    // Yüzde-kodlu adayı çöz (çift kodlama olabilir → iki tur).
    for (var i = 0; i < 2 && c.contains('%'); i++) {
      try {
        final d = Uri.decodeComponent(c);
        if (d == c) break;
        c = d;
      } catch (_) {
        break;
      }
    }
    if (isWebProductCandidate(c)) candidates.add(c);
  }
  if (candidates.isEmpty) return null;
  candidates.sort((a, b) => b.length.compareTo(a.length));
  return candidates.first;
}

/// Gömülü adaylar için: gerçek, spesifik bir web adresi mi? Çıplak ana sayfa
/// (bot kapıları `returnUrl=https://site.com` taşır), tracker ve görsel/asset
/// adresleri kimlik taşımaz.
bool isWebProductCandidate(String value) {
  final lower = value.toLowerCase();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return false;
  if (RegExp(r'\.(jpg|jpeg|png|webp|gif|svg)(\?|$)').hasMatch(lower)) return false;
  try {
    final u = Uri.parse(value);
    if (u.host.isEmpty) return false;
    if (u.path.isEmpty || u.path == '/') return false; // çıplak ana sayfa
    return !isDeepLinkTracker(value);
  } catch (_) {
    return false;
  }
}

class WebViewResolver {
  /// Cihaz bir telefon → mobil UA en meşru görünen istektir.
  static const _mobileUa =
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

  /// Sayfadan ürün kimliğini okuyan EVRENSEL betik. Güven sırası:
  /// JSON-LD (schema.org Product) → Open Graph → Twitter Card → `<title>`.
  /// Dünyadaki e-ticaret sitelerinin ezici çoğunluğu bunlardan en az birini
  /// sunar; hiçbiri siteye özel değildir.
  static const _extractJs = r'''
(function () {
  function abs(u) {
    try { return u ? new URL(u, location.href).href : null; } catch (e) { return null; }
  }
  function meta(sel) {
    var e = document.querySelector(sel);
    var v = e && (e.getAttribute('content') || e.getAttribute('value'));
    return v && v.trim() ? v.trim() : null;
  }
  function str(v) {
    if (v == null) return null;
    if (typeof v === 'string') return v.trim() || null;
    if (typeof v === 'number') return String(v);
    if (Array.isArray(v)) return v.length ? str(v[0]) : null;
    if (typeof v === 'object') return str(v.name != null ? v.name : v['@value']);
    return null;
  }
  function imgOf(v) {
    if (v == null) return null;
    if (typeof v === 'string') return v.trim() || null;
    if (Array.isArray(v)) return v.length ? imgOf(v[0]) : null;
    if (typeof v === 'object') return imgOf(v.url != null ? v.url : v.contentUrl);
    return null;
  }
  function priceOf(o) {
    if (o == null) return null;
    if (Array.isArray(o)) return o.length ? priceOf(o[0]) : null;
    if (typeof o !== 'object') return null;
    var p = o.price != null ? o.price
          : o.lowPrice != null ? o.lowPrice
          : (o.priceSpecification && o.priceSpecification.price);
    return p == null ? null : String(p);
  }
  // ── JSON-LD: schema.org Product düğümünü bul (dizi + @graph + iç içe) ──
  function findProduct(node, depth) {
    if (node == null || depth > 6) return null;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) {
        var r = findProduct(node[i], depth + 1);
        if (r) return r;
      }
      return null;
    }
    if (typeof node !== 'object') return null;
    var t = node['@type'];
    var isProd = t === 'Product' || (Array.isArray(t) && t.indexOf('Product') >= 0)
      || (node.name && (node.offers || node.sku));
    if (isProd && node.name) return node;
    var keys = Object.keys(node);
    for (var k = 0; k < keys.length; k++) {
      var v = node[keys[k]];
      if (v && typeof v === 'object') {
        var f = findProduct(v, depth + 1);
        if (f) return f;
      }
    }
    return null;
  }
  var prod = null;
  var blocks = document.querySelectorAll('script[type="application/ld+json"]');
  for (var i = 0; i < blocks.length && !prod; i++) {
    try { prod = findProduct(JSON.parse(blocks[i].textContent), 0); } catch (e) {}
  }

  var title = (prod && str(prod.name))
    || meta('meta[property="og:title"]')
    || meta('meta[name="twitter:title"]')
    || (document.title || '').trim()
    || null;
  var image = (prod && imgOf(prod.image))
    || meta('meta[property="og:image"]')
    || meta('meta[name="twitter:image"]');
  var desc = (prod && str(prod.description))
    || meta('meta[property="og:description"]')
    || meta('meta[name="description"]');
  var price = (prod && priceOf(prod.offers))
    || meta('meta[property="product:price:amount"]')
    || meta('meta[itemprop="price"]');

  return JSON.stringify({
    url: location.href,
    title: title,
    image: abs(image),
    description: desc,
    price: price,
    siteName: meta('meta[property="og:site_name"]') || location.hostname
  });
})();
''';

  /// Bir URL ne kadar "ürün sayfası" görünüyor? Kimlik taşıyan URL'yi bot
  /// kapısından / ana sayfadan ayırmak için — site ezberi YOK, yalnız yolun
  /// biçimine bakar.
  ///
  /// Neden gerekli (ölçüldü): zincir gerçek ilana varsa bile mağaza bizi
  /// `…/cs/checkLoading?returnUrl=<gerçek ürün>` kapısına atabiliyor. Sayfa
  /// içeriği alınamasa da **ürün URL'si elimizde** — ve slug'ında ürün adı yazılı
  /// (`…-hp-zbook-x-g1i-16-ultra7-265h-64gb-ram-1tb-ssd-…`). Yani kapıyı yenmek
  /// ZORUNDA değiliz; en "ürün gibi" URL'yi tutmak yeter, kimlik slug'dan çıkar.
  static int _slugScore(String url) {
    try {
      final u = Uri.parse(url);
      final path = u.path;
      if (path.isEmpty || path == '/') return 0; // çıplak ana sayfa
      var score = 0;
      for (final seg in path.split('/').where((s) => s.isNotEmpty)) {
        final words = seg.split(RegExp(r'[-_]')).where((w) => w.length > 1);
        // Tireyle ayrılmış çok kelimeli segment = insan okunur ürün slug'ı.
        if (words.length >= 3) score += words.length * 10;
      }
      score += path.length ~/ 8; // uzun yol → daha spesifik
      return score;
    } catch (_) {
      return 0;
    }
  }

  /// [url]'yi gerçek tarayıcı motorunda açar; nihai ÜRÜN adresini ve (sayfa
  /// okunabildiyse) kimliğini döndürür. Başarısız olursa `null` — çağıran eski
  /// davranışına devam eder.
  ///
  /// İki kazanç yolu, biri yeterli:
  ///   1. Sayfa açıldı → kimlik sayfadan okunur (JSON-LD/OG/title) — en zengini.
  ///   2. Sayfa bot kapısında takıldı → zincirde görülen EN ürün-gibi URL döner;
  ///      kimlik onun slug'ından çıkar. Uydurma değil: ad URL'nin kendisinde.
  Future<WebViewResolution?> resolve(
    String url, {
    Duration timeout = const Duration(seconds: 25),
  }) async {
    final completer = Completer<WebViewResolution?>();
    WebViewResolution? identified; // sayfadan kimlik okunabildiyse
    String? bestUrl; // en ürün-gibi adres (kapı/tracker değil)
    final visitCount = <String, int>{};
    Timer? settleTimer;
    late final WebViewController controller;

    /// Görülen her adresi (ve içine gömülü hedefi) aday olarak değerlendirir.
    /// Tracker'ın KENDİSİ asla aday olamaz — yolu ürün slug'ının kopyasını
    /// taşıyabilir (`3swu.adj.st/ilan/…-hp-zbook-…`), "ürün gibi" görünür ama
    /// analiz edilemez; yalnız İÇİNDEKİ gerçek adres işe yarar.
    void considerUrl(String candidate) {
      for (final u in [candidate, embeddedWebUrl(candidate)]) {
        if (u == null || !isWebProductCandidate(u)) continue;
        if (bestUrl == null || _slugScore(u) > _slugScore(bestUrl!)) bestUrl = u;
      }
    }

    void finish() {
      if (completer.isCompleted) return;
      settleTimer?.cancel();
      final resolved = identified;
      completer.complete(
        resolved != null
            ? WebViewResolution(
                // Kimlik sayfadan geldiyse bile adres olarak en ürün-gibi olanı
                // tercih et (kapı URL'si kimliği taşımaz).
                finalUrl: _slugScore(bestUrl ?? '') >
                        _slugScore(resolved.finalUrl)
                    ? bestUrl!
                    : resolved.finalUrl,
                title: resolved.title,
                description: resolved.description,
                image: resolved.image,
                price: resolved.price,
                siteName: resolved.siteName,
              )
            : (bestUrl == null ? null : WebViewResolution(finalUrl: bestUrl!)),
      );
    }

    try {
      controller = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setUserAgent(_mobileUa);

      await controller.setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (request) {
            final target = request.url;
            final scheme = Uri.tryParse(target)?.scheme.toLowerCase() ?? '';
            considerUrl(target);

            if (scheme == 'http' || scheme == 'https') {
              // Kapı döngüsü: aynı adrese tekrar tekrar dönüyorsak (bot sınaması
              // kendini çözemiyor) kovalamayı bırak — elimizde zaten ürün URL'si
              // var.
              final n = (visitCount[target] = (visitCount[target] ?? 0) + 1);
              if (n > 2) {
                debugPrint('[WebViewResolver] kapı döngüsü → dur: $target');
                finish();
                return NavigationDecision.prevent;
              }
              return NavigationDecision.navigate;
            }

            // `intent://…` / `sahibinden://…` — mağazanın uygulamasını AÇMA
            // (kullanıcı bizim ekranımızda). İçindeki web yedeğine geç; Android
            // intent'i bunu `S.browser_fallback_url` olarak FRAGMENT'te taşır →
            // `Uri.queryParameters` göremez, ham metinden okunur.
            final fallback = embeddedWebUrl(target);
            if (fallback != null) {
              unawaited(controller.loadRequest(Uri.parse(fallback)));
            }
            return NavigationDecision.prevent;
          },
          onPageFinished: (finishedUrl) async {
            if (finishedUrl == 'about:blank') return; // kontrolcünün boş sayfası
            debugPrint('[WebViewResolver] pageFinished: $finishedUrl');
            considerUrl(finishedUrl);
            try {
              final parsed = _parseJsResult(
                await controller.runJavaScriptReturningResult(_extractJs),
                finishedUrl,
              );
              if (parsed != null && parsed.hasIdentity) {
                identified = parsed;
                considerUrl(parsed.finalUrl);
                finish();
                return;
              }
            } catch (_) {}
            // Kimlik yok (sınama/ara sayfa): gerçek tarayıcı sınamayı çözüp asıl
            // sayfaya geçebilir → kısa süre daha bekle, sonra elimizdekiyle dön.
            settleTimer?.cancel();
            settleTimer = Timer(const Duration(seconds: 5), finish);
          },
          onWebResourceError: (e) {
            // Alt kaynak hataları (görsel/analytics) normaldir — sayfa yine de
            // kimlik verebilir. Ana çerçeve ölürse elimizdekiyle dön.
            debugPrint(
              '[WebViewResolver] resourceError: ${e.errorCode} ${e.description} '
              '(main=${e.isForMainFrame})',
            );
            if (e.isForMainFrame == true) {
              settleTimer?.cancel();
              settleTimer = Timer(const Duration(seconds: 2), finish);
            }
          },
        ),
      );

      await controller.loadRequest(Uri.parse(url));
      return await completer.future.timeout(timeout, onTimeout: () {
        debugPrint('[WebViewResolver] timeout → en iyi aday: $bestUrl');
        return identified ?? (bestUrl == null ? null : WebViewResolution(finalUrl: bestUrl!));
      });
    } catch (e) {
      debugPrint('[WebViewResolver] resolve failed for $url: $e');
      return bestUrl == null ? null : WebViewResolution(finalUrl: bestUrl!);
    } finally {
      settleTimer?.cancel();
      // WebView'ı serbest bırak — arka planda ağ/JS çalışmaya devam etmesin.
      try {
        await controller.loadRequest(Uri.parse('about:blank'));
      } catch (_) {}
    }
  }

  /// `runJavaScriptReturningResult` platforma göre JSON *string*'i ya düz ya da
  /// bir kez daha tırnaklanmış/kaçışlanmış döndürür → iki turlu çöz.
  static WebViewResolution? _parseJsResult(Object? raw, String fallbackUrl) {
    var s = raw?.toString().trim() ?? '';
    if (s.isEmpty || s == 'null') return null;
    for (var i = 0; i < 2; i++) {
      try {
        final decoded = jsonDecode(s);
        if (decoded is Map) {
          final m = decoded.cast<String, dynamic>();
          String? f(String k) {
            final v = m[k];
            if (v == null) return null;
            final t = v.toString().trim();
            return t.isEmpty || t == 'null' ? null : t;
          }

          return WebViewResolution(
            finalUrl: f('url') ?? fallbackUrl,
            title: f('title'),
            description: f('description'),
            image: f('image'),
            price: f('price'),
            siteName: f('siteName'),
          );
        }
        if (decoded is String) {
          s = decoded; // bir kat daha kaçışlanmış → tekrar çöz
          continue;
        }
        return null;
      } catch (_) {
        return null;
      }
    }
    return null;
  }

}
