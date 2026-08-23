// ── AYNI OLGUYU İKİNCİ KEZ YAZMA ────────────────────────────────────────────
//
// Rapor "bu üründe ne ters gidiyor" sorusunu DÖRT ayrı alana soruyor
// (`product.weaknesses` · `product.criticalPoints` · `product.reliabilityNotes`
// · `community.chronicIssues`) ve bir de `community.summary` içinde nesir
// olarak. Prompt'ta artık her birinin ayrı işi yazılı ve "tek olgu tek yer"
// kuralı var — ama model olasılıksal. Kaydığında okuyucu aynı şikâyeti beş
// bölümde görüyor; canlı S23 Ultra kaydında tam olarak bu oldu:
//
//   weaknesses        "Cihazın büyük ve ağır olması…"
//   criticalPoints    "Büyük ve Ağır Tasarım"
//   chronicIssues     "Cihazın büyük ve ağır olması, tek elle kullanımı…"
//   reliabilityNotes  "Batarya ve Yapışkan Sorunları"   (= chronicIssues)
//
// Burası prompt sınırının ARKASINDAKİ ikinci savunma: kaçan olgu sayfada bir
// kez çizilir, ilk göründüğü bölümde kalır.
//
// NEDEN ORTAK MODÜL: raporu İKİ ayrı yol çiziyor — site tarafında
// `AiReportView.jsx`, ön-render tarafında `web/scripts/seo.mjs`. Ağ yalnız
// birinde olursa crawler'ın gördüğü HTML ile kullanıcının gördüğü sayfa
// ayrışır; tekrar da tam olarak ön-render'da kalırdı.

const AYIRAC = /[^\p{L}\p{N}]+/u;

// Türkçe ekler kelimeyi uzatıyor ("adaptörü" ≠ "adaptör"), o yüzden
// karşılaştırma KÖKE yakın bir önek üzerinden yapılır. Diakritik de katlanır:
// aynı olgu bir yerde "şarj", başka yerde "sarj" yazılabiliyor.
export function kokler(metin) {
  const duz = String(metin || '')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
  return new Set(
    duz.split(AYIRAC)
      .filter((k) => k.length >= 5) // "ve/bir/the/and" gibi taşıyıcıları at
      .map((k) => k.slice(0, 6)),   // ekleri kırp
  );
}

export function metinOf(item) {
  if (!item) return '';
  if (typeof item === 'string') return item;
  return `${item.title || item.label || ''} ${item.detail || item.text || item.note || ''}`;
}

/**
 * `liste`den, `gorulen` içinde zaten geçen olguları düşürür ve kalanları
 * `gorulen`e ekler.
 *
 * Çağrı SIRASI anlamlıdır: olgu ilk göründüğü bölümde kalır, sonrakilerden
 * düşer. Bölümler sayfadaki sırayla çağrılmalı.
 *
 * Karşılaştırma KELİME KÜMESİ üzerinden, çünkü iki madde birebir aynı
 * yazılmıyor — aynı olguyu farklı cümleyle anlatıyor ("Kutu içeriğinde şarj
 * adaptörü yok" / "Kutu içeriğinde şarj adaptörü olmaması ek maliyet
 * yaratır"). Düz string eşitliği bunu yakalamaz, ortak kelime oranı yakalar.
 */
export function dropRestated(liste, gorulen) {
  if (!Array.isArray(liste) || !liste.length) return liste;
  const kalan = [];
  for (const item of liste) {
    const k = kokler(metinOf(item));
    // Çok kısa madde ("1 TB depolama") tesadüfen örtüşebilir — yargılama.
    if (k.size < 3) { kalan.push(item); continue; }
    const tekrar = gorulen.some((onceki) => {
      if (onceki.size < 3) return false;
      let ortak = 0;
      for (const t of k) if (onceki.has(t)) ortak += 1;
      return ortak / Math.min(k.size, onceki.size) >= 0.6;
    });
    if (tekrar) continue;
    gorulen.push(k);
    kalan.push(item);
  }
  return kalan;
}
