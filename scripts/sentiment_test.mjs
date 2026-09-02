// ═══════════════════════════════════════════════════════════════════════════
//  DUYGU SINIFLANDIRICI SOZLESME TESTI — 30 gercekci cumle
//
//  Kosum:  node scripts/sentiment_test.mjs
//
//  Bu bir birim testi DEGIL, sozlesme testidir: gercek AI sinifllandiricisini
//  cagirir (scripts/sentiment_lib.mjs) ve beklenen etiketlerle karsilastirir.
//  Prompt degistiginde ONCE bunu kosur, sonra goce/uretime dokunuruz.
//
//  Fixture'lar bilerek ZOR secildi. Her biri kelime tabanli bir siniflandiriciyi
//  yaniltacak en az bir kalip tasiyor: inkar, taviz baglaci (although/while/
//  despite), karisik duygu, karsilastirma, olumlu kelime iceren sikayet,
//  olumsuz kelime iceren ovgu, ve hukum bildirmeyen duz olgu cumleleri.
// ═══════════════════════════════════════════════════════════════════════════
import { etiketle } from './sentiment_lib.mjs';

const FIXTURE = [
  // ── 10 POSITIVE ────────────────────────────────────────────────────────
  ['The A19 Pro chip delivers exceptional performance across demanding games and pro apps.', 'positive'],
  ['Although the phone is expensive, its sustained performance is exceptional under load.', 'positive'],
  ['Battery life is not bad at all — most owners finish a full day with charge to spare.', 'positive'],
  ['No overheating problems were reported even during long 4K recording sessions.', 'positive'],
  ['Despite the plastic back, build quality holds up remarkably well after a year of use.', 'positive'],
  ['It never stutters in daily use, and app launches stay instant months into ownership.', 'positive'],
  ['Compared with its predecessor, low-light photography is a clear and visible step up.', 'positive'],
  ['While it lacks a telephoto lens, the main and ultrawide sensors perform admirably.', 'positive'],
  ['Software support runs to 2030, which is longer than any Android rival in this price band.', 'positive'],
  ['The 120W charger fills the battery in 19 minutes, removing the usual overnight routine.', 'positive'],

  // ── 10 NEGATIVE ────────────────────────────────────────────────────────
  ['The 60Hz display might feel dated to users accustomed to higher refresh rates, impacting the perceived smoothness of interactions.', 'negative'],
  ['While the display is bright, its 60Hz refresh rate feels dated for a flagship in 2026.', 'negative'],
  ['While efficient, the 40W charging conflicts with the buyer’s preference for fast top-ups.', 'negative'],
  ['Despite the excellent display, the phone suffers from noticeable throttling under sustained load.', 'negative'],
  ['Reports of accelerated battery degradation could require a replacement sooner than expected.', 'negative'],
  ['The continued use of the Lightning port instead of USB-C is an inconvenience for most buyers.', 'negative'],
  ['It does not deliver the low-light quality its marketing promises, falling short of rivals.', 'negative'],
  ['Storage is limited to 128 GB with no expansion, which becomes a real constraint within a year.', 'negative'],
  ['Owners repeatedly mention coil whine under load, and support has been slow to respond.', 'negative'],
  ['The camera is good, but the price puts it above better-equipped competitors.', 'negative'],

  // ── 10 NEUTRAL ─────────────────────────────────────────────────────────
  ['The device has a 6.3-inch Super Retina XDR OLED display.', 'neutral'],
  ['Apple released this model in September 2025 alongside the rest of the lineup.', 'neutral'],
  ['It ships with 12 GB of RAM and 512 GB of non-expandable storage.', 'neutral'],
  ['Current listings place it between 33,249 TL and 39,049 TL on refurbished platforms.', 'neutral'],
  ['The chipset is built on a 3 nm process and pairs with a six-core GPU.', 'neutral'],
  ['This analysis covers the 512 GB variant sold in the Turkish market.', 'neutral'],
  ['Apple typically announces its next iPhone generation in September.', 'neutral'],
  ['The phone measures 149.6 x 71.5 x 8.25 mm and weighs 199 grams.', 'neutral'],
  ['Two colourways are offered at launch, with a third added later in the cycle.', 'neutral'],
  ['Warranty is one year as standard and can be extended through AppleCare+.', 'neutral'],

  // ── TURKCE (12) — ayni zor kaliplar, Turkce sozdiziminde ────────────────
  ['512 GB depolama alanı, çoğu kullanıcı için fazlasıyla yeterli.', 'positive'],
  ['Cihazın uzun yazılım desteği ve dayanıklı yapısı, 4-5 yıllık kullanımı rahatça karşılıyor.', 'positive'],
  ['Pahalı olmasına rağmen performansı sınıfının açık ara önünde.', 'positive'],
  ['Günlük kullanımda kasma ya da ısınma sorunu bildirilmemiş.', 'positive'],
  ['Kamera tarafında 48 MP sistem, düşük ışıkta bile temiz sonuç veriyor.', 'positive'],
  ['60 Hz ekran, bu fiyat sınıfındaki rakiplerin gerisinde kalıyor.', 'negative'],
  ['Parlak ekrana rağmen 60 Hz tazeleme hızı akıcılık beklentisini karşılamıyor.', 'negative'],
  ['Verimli olsa da 40W şarj, hızlı doldurma isteyen kullanıcıya uymuyor.', 'negative'],
  ['iOS 26 sonrası yaşanan donma ve aşırı ısınma şikâyetleri tekrar ediyor.', 'negative'],
  ['Depolama 128 GB ile sınırlı ve genişletilemiyor, bu da bir yıl içinde darboğaz oluyor.', 'negative'],
  ['Cihaz 6,3 inç Super Retina XDR OLED ekrana sahiptir.', 'neutral'],
  ['Model Eylül 2025’te tanıtıldı ve Türkiye’de aynı yıl satışa sunuldu.', 'neutral'],
];

const main = async () => {
  const metinler = FIXTURE.map(([t]) => t);
  const beklenen = FIXTURE.map(([, s]) => s);
  console.log(`[test] ${metinler.length} cumle siniflandiriliyor...\n`);
  const gelen = await etiketle(metinler, { grup: 15 });

  let hata = 0;
  FIXTURE.forEach(([t], i) => {
    const ok = gelen[i] === beklenen[i];
    if (!ok) hata += 1;
    const isaret = ok ? 'ok  ' : 'HATA';
    if (!ok) {
      console.log(`${isaret} bek=${beklenen[i].padEnd(8)} gelen=${String(gelen[i]).padEnd(8)} ${t.slice(0, 72)}`);
    }
  });

  const gecen = metinler.length - hata;
  console.log(`\n[test] ${gecen}/${metinler.length} dogru`);
  const grup = (ad, a, b) => {
    const d = beklenen.slice(a, b).filter((x, i) => x === gelen[a + i]).length;
    console.log(`   ${ad.padEnd(9)} ${d}/${b - a}`);
  };
  grup('EN poz', 0, 10); grup('EN neg', 10, 20); grup('EN notr', 20, 30);
  grup('TR poz', 30, 35); grup('TR neg', 35, 40); grup('TR notr', 40, 42);
  process.exit(hata > 0 ? 1 : 0);
};

main().catch((e) => { console.error('[test] hata:', e.message); process.exit(2); });
