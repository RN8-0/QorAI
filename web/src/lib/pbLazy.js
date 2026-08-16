// ═══════════════════════════════════════════════════════════════
//  PocketBase SDK'yi KRITIK YOLDAN cikarir.
//
//  SDK 34,2 KB ile vendor chunk'inin en buyuk ikinci parcasiydi (olculdu:
//  scripts/_tbt_ab.mjs + vite.config.analiz.js modul raporu), ama ilk boyamada
//  HICBIR ISE yaramiyor: oturum zaten localStorage'da duruyor (bkz. authSeed.js)
//  ve cikis yapmis ziyaretcide SDK hic gerekmiyor.
//
//  Kural: SDK yalnizca GERCEK bir API cagrisinda yuklenir. Senkron oturum
//  bilgisi icin authSeed.js kullan — buradaki her sey async'tir.
// ═══════════════════════════════════════════════════════════════

let mod = null;
let bekleyen = null;
const dinleyiciler = new Set();

// Yuklu ise modulun kendisi, degilse null. Senkron kontrol icin.
export function pbYuklu() {
  return mod;
}

export function pbMod() {
  if (mod) return Promise.resolve(mod);
  if (!bekleyen) {
    bekleyen = import('./pocketbase').then((m) => {
      mod = m;
      for (const cb of dinleyiciler) { try { cb(m); } catch { /* abone hatasi digerlerini kesmesin */ } }
      dinleyiciler.clear();
      return m;
    });
  }
  return bekleyen;
}

// SDK NE ZAMAN yuklenirse yuklensin haber ver. AuthProvider bunu kullaniyor:
// cikisli ziyaretcide SDK hic inmez, ama kullanici giris yapinca (AuthModal
// SDK'yi yukler) oturum aboneligi yine de kurulmalidir.
export function pbYuklendiginde(cb) {
  if (mod) { cb(mod); return () => {}; }
  dinleyiciler.add(cb);
  return () => dinleyiciler.delete(cb);
}
