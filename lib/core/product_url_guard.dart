/// Ürün linki kapısı — web `linkAnalysis.js` (`NON_PRODUCT_HOSTS` +
/// `looksLikeProductUrl`) ile BİREBİR aynı.
///
/// BUG (kullanıcı, 2026-08-10): uygulamada Link Analizi bir YouTube videosunu
/// ("Bilo Aga – Peki Kafga Çıkmasın") ÜRÜN sanıp %72 uyum puanı üretti.
/// Web'de aynı link reddediliyor.
///
/// Kök neden: app `isProduct`'ı YALNIZCA "başlık düzgün mü" (hasRealIdentity)
/// sorusuna bakarak veriyordu. Video/forum/haber sayfalarının başlığı gayet
/// düzgündür → hepsi ürün sayılıyordu. AI'ın `is_product: false` cevabı ise
/// sadece e-ticaret alan adlarında dikkate alınıyordu — tam tersi olmalı.
library;

/// Ürün SATMAYAN, bilinen alan adları. Bir link buradan geliyorsa AI'a hiç
/// sorulmadan reddedilir (boşuna Q Coin ve süre harcanmasın).
const _nonProductHosts = <String>[
  'quora.com', 'reddit.com', 'youtube.com', 'youtu.be', 'twitter.com', 'x.com',
  'facebook.com', 'fb.com', 'fb.watch', 'instagram.com', 'tiktok.com',
  'threads.net', 'wikipedia.org', 'fandom.com', 'medium.com', 'substack.com',
  'linkedin.com', 'pinterest.com', 'github.com', 'gitlab.com',
  'stackoverflow.com', 'stackexchange.com', 'google.com', 'bing.com',
  'duckduckgo.com', 'yahoo.com', 'yandex.com', 'whatsapp.com', 't.me',
  'telegram.org', 'discord.com', 'discord.gg', 'twitch.tv', 'spotify.com',
  'soundcloud.com', 'netflix.com', 'wikihow.com',
];

/// `url` ürün sayfası OLABİLİR mi? Açıkça ürün olmayan (sosyal/forum/video/
/// arama) bir link ya da çıplak mağaza ana sayfası `false` döner; buradan
/// geçen her şeyde son sözü AI söyler.
bool looksLikeProductUrl(String url) {
  final Uri? u = Uri.tryParse(url.trim());
  if (u == null || !u.hasScheme || !(u.isScheme('http') || u.isScheme('https'))) {
    return false;
  }
  final host = u.host.toLowerCase().replaceFirst(RegExp(r'^www\.'), '');
  if (host.isEmpty) return false;
  for (final d in _nonProductHosts) {
    if (host == d || host.endsWith('.$d')) return false;
  }
  final path = u.path.replaceAll(RegExp(r'/+$'), '');
  // Çıplak ana sayfa ürün değildir.
  if (path.isEmpty && u.query.isEmpty) return false;
  return true;
}
