// ═══════════════════════════════════════════════════════════════
//  Oturumun SENKRON okunmasi — PocketBase SDK'si YUKLENMEDEN.
//
//  AuthProvider ilk render'da kullaniciyi bilmek ZORUNDA: ana sayfa akisinin
//  kisisellestirme anahtari (feedKey) buna gore hesaplaniyor ve yanlis
//  hesaplanirsa anlik-boyama onbellegi iskalayip iskelet flash'i yasaniyor
//  (auth.jsx'teki nota bakin). Bu yuzden SDK'yi beklemek YERINE ayni
//  localStorage kaydini kendimiz okuyoruz.
//
//  Format PocketBase 0.21 LocalAuthStore'dan birebir dogrulandi:
//    localStorage['pocketbase_auth'] = JSON.stringify({ token, model })
//  SDK yukseltilirse (0.22+ `record` alanina gecti) ikisi de desteklensin diye
//  her iki alan da okunuyor.
// ═══════════════════════════════════════════════════════════════

const ANAHTAR = 'pocketbase_auth';

// PocketBase'in isValid'i de tam olarak bunu yapar: token'in exp'ine bakar.
function tokenGecerli(token) {
  if (!token || typeof token !== 'string') return false;
  const parca = token.split('.');
  if (parca.length !== 3) return false;
  try {
    let b64 = parca[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const govde = JSON.parse(atob(b64));
    // exp yoksa token'i gecerli say (SDK de oyle davraniyor).
    return typeof govde.exp === 'number' ? govde.exp * 1000 > Date.now() : true;
  } catch {
    return false;
  }
}

export function seedAuth() {
  try {
    const ham = localStorage.getItem(ANAHTAR);
    if (!ham) return null;
    const d = JSON.parse(ham);
    if (!d || !tokenGecerli(d.token)) return null;
    return d.model || d.record || null;
  } catch {
    return null; // depolama kapali / bozuk kayit
  }
}
