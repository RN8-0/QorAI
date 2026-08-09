/// <reference path="../pb_data/types.d.ts" />
// ════════════════════════════════════════════════════════════════════
//  Qor AI — kısa/paylaşım linki çözümleme ucu
//  --------------------------------------------------------------------
//  NEDEN SUNUCUDA: kısaltılmış Amazon linkleri (amzn.eu/d/…, a.co/…) ve
//  benzerleri CİHAZDAN çözülemiyor. Ölçülen kanıt (kayıtlı bulgu): aynı
//  URL'e `curl` 301 dönerken Dart'ın `Dio`/`dart:io` HttpClient'ı 403
//  alıyor — Dart'ın TLS parmak izi bot olarak sınıflanıyor. Yani bu iş
//  hiçbir HTTP istemcisi ayarıyla istemci tarafında çözülemez; tek yol
//  çözümlemeyi sunucuya taşımak.
//
//  Uygulama kısa linki buraya gönderir, sunucu yönlendirme zincirini
//  izler ve NİHAİ URL'i (mümkünse sayfa başlığını) döndürür.
//
//  GÜVENLİK (SSRF): yalnız http/https; iç ağ adreslerine (localhost,
//  127.*, 10.*, 172.16–31.*, 192.168.*, 169.254.*, ::1, .local) HER
//  HOP'ta bakılır ve engellenir; en fazla 5 yönlendirme; hop başına ve
//  toplamda zaman aşımı; gövde yalnızca <title> için ve sınırlı okunur.
//
//  NOT: PocketBase JSVM her routerAdd handler'ını İZOLE kapsamda koşturur
//  — dosya kapsamındaki fonksiyonlar GÖRÜNMEZ. Bu yüzden tüm yardımcılar
//  handler'ın İÇİNDE tanımlıdır (typesense_sync hatasının dersi).
//
//  Uç: GET /api/resolve-link?url=<encoded>
// ════════════════════════════════════════════════════════════════════

routerAdd('GET', '/api/resolve-link', (e) => {
  const MAX_HOPS = 5;
  const HOP_TIMEOUT_S = 8;
  const TOTAL_BUDGET_MS = 20000;
  const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36';

  // ── SSRF kalkanı ────────────────────────────────────────────────────
  // Yalnız şema + host denetimi yapılır (DNS çözümlemesi JSVM'de yok).
  // Amaç: saldırganın uygulamayı iç ağa istek attırmak için kullanmasını
  // engellemek. Her HOP'ta yeniden bakılır — bir yönlendirme bizi
  // 127.0.0.1'e göndermeye çalışırsa orada durulur.
  function hostOf(u) {
    try {
      const m = String(u).match(/^https?:\/\/([^/?#]+)/i);
      if (!m) return '';
      let h = m[1];
      const at = h.lastIndexOf('@');
      if (at >= 0) h = h.slice(at + 1);
      if (h.charAt(0) === '[') return h.slice(1, h.indexOf(']')).toLowerCase();
      const colon = h.lastIndexOf(':');
      if (colon > 0) h = h.slice(0, colon);
      return h.toLowerCase();
    } catch (_) { return ''; }
  }

  function isBlockedHost(h) {
    if (!h) return true;
    if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true;
    if (h.indexOf('.local') === h.length - 6 && h.length > 6) return true;
    if (h.indexOf('.internal') > 0) return true;
    // IPv4 literalleri
    const p = h.split('.');
    if (p.length === 4 && p.every((x) => /^\d{1,3}$/.test(x))) {
      const a = +p[0]; const b = +p[1];
      if (a === 127 || a === 10 || a === 0) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 169 && b === 254) return true;    // link-local / bulut metadata
      if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
      if (a >= 224) return true;                  // multicast / ayrılmış
    }
    // IPv6 özel aralıkları (fc00::/7 benzersiz-yerel, fe80::/10 link-local)
    if (/^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h)) return true;
    return false;
  }

  function isSafeUrl(u) {
    if (!/^https?:\/\//i.test(String(u || ''))) return false;
    return !isBlockedHost(hostOf(u));
  }

  // Göreli `Location`'ı mutlak hâle getirir (JSVM'de URL sınıfı yok).
  function absolutize(base, loc) {
    const l = String(loc || '').trim();
    if (!l) return '';
    if (/^https?:\/\//i.test(l)) return l;
    const m = String(base).match(/^(https?:)\/\/([^/?#]+)([^?#]*)/i);
    if (!m) return '';
    const scheme = m[1]; const host = m[2]; const path = m[3] || '/';
    if (l.indexOf('//') === 0) return scheme + l;
    if (l.charAt(0) === '/') return scheme + '//' + host + l;
    const dir = path.slice(0, path.lastIndexOf('/') + 1) || '/';
    return scheme + '//' + host + dir + l;
  }

  function titleOf(html) {
    const m = String(html || '').match(/<title[^>]*>([\s\S]{0,400}?)<\/title>/i);
    if (!m) return '';
    return m[1]
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);
  }

  const raw = String(e.request.url.query().get('url') || '').trim();
  if (!raw) return e.json(400, { error: 'url required' });
  if (raw.length > 2048) return e.json(400, { error: 'url too long' });
  if (!isSafeUrl(raw)) return e.json(400, { error: 'unsupported or blocked url' });

  const startedAt = Date.now();
  let current = raw;
  let title = '';
  let hops = 0;
  let status = 0;

  try {
    for (; hops < MAX_HOPS; hops++) {
      if (Date.now() - startedAt > TOTAL_BUDGET_MS) break;
      // $http.send yönlendirmeleri KENDİ izler; biz her hop'u tek tek
      // görmek (ve SSRF denetlemek) istediğimiz için 3xx'i elle çözeriz.
      const res = $http.send({
        url: current,
        method: 'GET',
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout: HOP_TIMEOUT_S,
        redirects: 0,
      });
      status = res.statusCode || 0;

      let loc = '';
      try {
        const hs = res.headers || {};
        const v = hs.Location || hs.location || hs['Location'] || hs['location'];
        loc = Array.isArray(v) ? (v[0] || '') : String(v || '');
      } catch (_) { loc = ''; }

      if (status >= 300 && status < 400 && loc) {
        const next = absolutize(current, loc);
        if (!next || next === current) break;
        if (!isSafeUrl(next)) break;   // SSRF: iç ağa yönlendirme → dur
        current = next;
        continue;
      }

      // 2xx → hedefteyiz, başlığı çıkar.
      if (status >= 200 && status < 300) {
        try { title = titleOf(res.raw || ''); } catch (_) { title = ''; }
      }
      break;
    }
  } catch (err) {
    // Ağ hatası: elimizdeki en iyi URL neyse onu döndür — uygulama
    // çözülemediğinde nazik uyarısını gösterir.
    return e.json(200, { url: current, resolved: current !== raw, hops: hops, title: '', error: String(err) });
  }

  return e.json(200, {
    url: current,
    resolved: current !== raw,
    hops: hops,
    status: status,
    title: title,
  });
});
