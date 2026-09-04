// ═══════════════════════════════════════════════════════════════════════════
//  BLOG EDİTÖRÜ — GERİLEME TESTİ
//
//  Koşum:  node scripts/blog_kural_testi.mjs
//          node scripts/blog_kural_testi.mjs --live     (PB'deki 11 makaleyi de
//                                                        gerçek veriyle dener)
//
//  NEDEN VAR: `node --check` hiçbirini yakalamaz — sözdizimi doğru, DAVRANIŞ
//  yanlış olur. Bu projede bir kez `priceRulesBlock is not defined` denetimden
//  geçip dört prompt'u birden kıracaktı. Buradaki her kural fonksiyonu
//  GERÇEKTEN çağırır.
//
//  Kapsanan kurallar:
//    1. SSS PARİTESİ   admin çıkarıcısı ile seo.mjs → sssCikar BİREBİR aynı
//                      sonucu vermeli (ayrışırsa JS'li/JS'siz sayfa farklı
//                      yapısal veri gösterir)
//    2. BLOK MODELİ    eski `layout`+`desc` kayıtları blocks'a göç etmeli,
//                      hiçbir metin kaybolmadan; blok şekli sitenin okuduğu
//                      alanlarla eşleşmeli
//    3. META           metaTitle ≤60 / metaDescription ≤155, kelime sınırından
//    4. KATALOG        yanlış eşleşme negatif vakaları (canlıda kırıldı)
//    5. KAYIT YÜKÜ     PB şeması genişlemeyecek; `_livePrice` kayda girmeyecek
//    6. SAĞLIK         her tohumlanmış sorun yakalanmalı
//    7. SLUG KOPMASI   adres değişince 875 olay + yorumlar kopar, uyarı şart
//    8. PROMPT'LAR     gerçekten üretilip içindeki kurallar aranır
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';

await import('../admin/js/blog/blog_core.js');
await import('../admin/js/blog/blog_ai.js').catch(() => {});
const C = globalThis.BlogCore;
const AI = globalThis.BlogAi;

let hata = 0;
const yaz = (ok, ad, not = '') => {
  if (!ok) hata += 1;
  console.log(`  ${ok ? 'OK  ' : 'HATA'}  ${String(ad).padEnd(52)}${not}`);
};
const baslik = (t) => console.log(`\n${t}\n`);
const esit = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── seo.mjs'in KENDİ sssCikar'ını dosyadan söküp çalıştır ──────────────────
// seo.mjs import edilince main() koşuyor ve hiçbir şey export etmiyor, bu
// yüzden fonksiyonu KAYNAKTAN kesiyoruz. Avantajı: test yayınlanan kodun ta
// kendisini koşturur — biri seo.mjs'teki eşiği değiştirirse bu test düşer.
function seoSssCikar() {
  const src = fs.readFileSync('web/scripts/seo.mjs', 'utf8');
  const bas = src.indexOf('function sssCikar(');
  if (bas < 0) throw new Error('seo.mjs içinde sssCikar bulunamadı');
  let i = src.indexOf('{', bas);
  let derinlik = 0;
  let son = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') derinlik++;
    else if (src[i] === '}') { derinlik--; if (!derinlik) { son = i + 1; break; } }
  }
  if (son < 0) throw new Error('seo.mjs sssCikar gövdesi kapanmıyor');
  // eslint-disable-next-line no-new-func
  return new Function(`${src.slice(bas, son)}; return sssCikar;`)();
}

// ═══ 0) MODÜLLER GERÇEKTEN KOŞUYOR MU ════════════════════════════════════
baslik('0) MODÜL YÜKLEME — `node --check` YETMEZ, modül gerçekten koşturulur');
{
  // 2026-09-04: blog_ui_styles.js'te CSS template literal'inin İÇİNDEKİ bir
  // yorumda ters tırnak vardı; literal erken kapandı, `figure is not defined`
  // fırladı ve blog sekmesi HİÇ AÇILMADI. `node --check` bunu geçirdi.
  yaz(typeof globalThis.BlogCore === 'object', 'blog_core.js yüklendi ve BlogCore tanımlı');
  yaz(typeof globalThis.BlogAi === 'object', 'blog_ai.js yüklendi ve BlogAi tanımlı');
  await import('../admin/js/blog/blog_dnd.js');
  yaz(typeof globalThis.BlogDnd === 'object', 'blog_dnd.js yüklendi ve BlogDnd tanımlı');
  await import('../admin/js/blog/blog_ui_styles.js');
  yaz(typeof globalThis.blogInjectStyles === 'function', 'blog_ui_styles.js yüklendi ve stil enjektörü tanımlı');
  const stil = fs.readFileSync('admin/js/blog/blog_ui_styles.js', 'utf8');
  const govde = stil.split('var CSS = `')[1].split('`;')[0];
  yaz(!govde.includes('`'), 'CSS template literal gövdesinde ters tırnak YOK');
}
{
  // Ölü düğme avı: HTML'de kullanılan her data-bl/data-bli/data-blc adının
  // bir işleyicisi olmalı. Delegasyona geçince en olası gerileme bu.
  const kaynak = ['blog_ui.js', 'blog_ui2.js', 'blog_flows.js']
    .map((f) => fs.readFileSync(path.join('admin/js/blog', f), 'utf8')).join(String.fromCharCode(10));
  const kayitli = new Set();
  for (const m of kaynak.matchAll(/(?:ACT|INP|CHG)\.([A-Za-z_$][\w$]*)\s*=/g)) kayitli.add(m[1]);
  for (const m of kaynak.matchAll(/(?:ACT|INP|CHG)\[.([A-Za-z_$][\w$]*).\]\s*=/g)) kayitli.add(m[1]);
  const kullanilan = new Map();
  for (const m of kaynak.matchAll(/data-(bl|bli|blc)="([a-zA-Z_$][\w$]*)"/g)) kullanilan.set(m[2], m[1]);
  const eksik = [...kullanilan.keys()].filter((k) => !kayitli.has(k));
  yaz(eksik.length === 0, 'her data-bl/bli/blc adının işleyicisi var', eksik.join(', '));
  yaz(kullanilan.size > 25, 'delegasyon tablosu dolu', kullanilan.size + ' eylem');
  // Satır içi onclick kalmamalı — string HTML'de Türkçe karakter kaçış tuzağı.
  yaz(!/onclick=/.test(kaynak), 'satır içi onclick YOK (delegasyon)');
}

// ═══ 1) SSS PARİTESİ ══════════════════════════════════════════════════════
baslik('1) SSS ÇIKARIMI — admin ↔ seo.mjs (ön-render) paritesi');
const seoSss = seoSssCikar();

const uzunCevap = 'Bu cevap kırk karakterden uzun olsun diye yazılmış gerçek bir cümledir.';
const SSS_VAKALARI = [
  ['iki geçerli çift',
    '<h2>Hangi telefon daha iyi?</h2><p>' + uzunCevap + '</p><h2>Pil ömrü ne kadar?</h2><p>' + uzunCevap + '</p>', ''],
  ['tek çift → SSS yok',
    '<h2>Hangi telefon daha iyi?</h2><p>' + uzunCevap + '</p>', ''],
  ['soru 12 karakterden kısa',
    '<h2>Ne olur?</h2><p>' + uzunCevap + '</p><h2>Pil ömrü ne kadar?</h2><p>' + uzunCevap + '</p><h2>Fiyatı nedir acaba?</h2><p>' + uzunCevap + '</p>', ''],
  ['cevap 40 karakterden kısa',
    '<h2>Hangi telefon daha iyi?</h2><p>Kısa.</p><h2>Pil ömrü ne kadar?</h2><p>' + uzunCevap + '</p><h2>Şarj süresi nedir?</h2><p>' + uzunCevap + '</p>', ''],
  ['soru işareti yok',
    '<h2>Hangi telefon daha iyi</h2><p>' + uzunCevap + '</p><h2>Pil ömrü ne kadar?</h2><p>' + uzunCevap + '</p>', ''],
  ['h3 de sayılır',
    '<h3>Hangi telefon daha iyi?</h3><p>' + uzunCevap + '</p><h3>Pil ömrü ne kadar?</h3><p>' + uzunCevap + '</p>', ''],
  ['h4 sayılmaz',
    '<h4>Hangi telefon daha iyi?</h4><p>' + uzunCevap + '</p><h4>Pil ömrü ne kadar?</h4><p>' + uzunCevap + '</p>', ''],
  ['cevap 900 karakterde kırpılır',
    '<h2>Hangi telefon daha iyi?</h2><p>' + 'x'.repeat(1500) + '</p><h2>Pil ömrü ne kadar?</h2><p>' + uzunCevap + '</p>', ''],
  ['SSS yalnız SONUÇ bölümünde',
    '<p>Giriş yazısı.</p>',
    '<h2>Hangi telefon daha iyi?</h2><p>' + uzunCevap + '</p><h2>Pil ömrü ne kadar?</h2><p>' + uzunCevap + '</p>'],
  ['biri gövdede biri sonuçta',
    '<h2>Hangi telefon daha iyi?</h2><p>' + uzunCevap + '</p>',
    '<h2>Pil ömrü ne kadar?</h2><p>' + uzunCevap + '</p>'],
  ['cevapta iç etiketler (ul/li/strong)',
    '<h2>Hangi telefon daha iyi?</h2><ul><li>' + uzunCevap + '</li></ul><h2>Pil ömrü ne kadar?</h2><p><strong>' + uzunCevap + '</strong></p>', ''],
  ['HTML varlıkları çözülür',
    '<h2>Ekran &amp; pil hangisi daha iyi?</h2><p>' + uzunCevap + '</p><h2>Fiyat &quot;uygun&quot; mu?</h2><p>' + uzunCevap + '</p>', ''],
  ['soru sonrası hemen başka başlık (cevapsız)',
    '<h2>Hangi telefon daha iyi?</h2><h2>Pil ömrü ne kadar?</h2><p>' + uzunCevap + '</p><h2>Şarj süresi nedir?</h2><p>' + uzunCevap + '</p>', ''],
  ['boş gövde', '', ''],
];
for (const [ad, body, concl] of SSS_VAKALARI) {
  const a = C.sssCikar(body, concl);
  const b = seoSss(body, concl);
  yaz(esit(a, b), `parite · ${ad}`, `admin=${a.length} seo=${b.length}`);
}
// Kırpma gerçekten 900 mü?
{
  const r = C.sssCikar('<h2>Hangi telefon daha iyi?</h2><p>' + 'x'.repeat(1500) + '</p><h2>Pil ömrü ne kadar?</h2><p>' + uzunCevap + '</p>', '');
  yaz(r[0] && r[0].a.length === 900, 'cevap tam 900 karakterde kırpılıyor', r[0] ? String(r[0].a.length) : 'yok');
}
// BlogPost.jsx (DOMParser'lı üçüncü taraf) — eşikleri KAYNAKTAN doğrula.
{
  const src = fs.readFileSync('web/src/pages/BlogPost.jsx', 'utf8');
  const bas = src.indexOf('const sssCiftleri');
  const govde = src.slice(bas, bas + 1400);
  yaz(/q\.length\s*<\s*12/.test(govde), 'BlogPost.jsx soru eşiği 12');
  yaz(/cevap\.length\s*>=\s*40/.test(govde), 'BlogPost.jsx cevap eşiği 40');
  yaz(/slice\(0,\s*900\)/.test(govde), 'BlogPost.jsx cevap kırpma 900');
  yaz(/hepsi\.length\s*>=\s*2/.test(src), 'BlogPost.jsx en az 2 çift kuralı');
  yaz(/sssCiftleri\(body\)\.concat\(sssCiftleri\(conclusion\)\)/.test(src),
    'BlogPost.jsx gövde + SONUÇ üzerinden çıkarıyor');
}

// ═══ 2) BLOK MODELİ ═══════════════════════════════════════════════════════
baslik('2) BLOK MODELİ — eski kayıt göçü ve site render sözleşmesi');
// Canlıdaki gerçek eski öğe şekli (ölçüldü 2026-09-03: 5 öğe, hepsi left).
const eskiOge = () => ({
  brand: 'Samsung', id: 'p1', name: 'Galaxy S26 Ultra', slug: 'galaxy-s26-ultra',
  techScore: 96, imageUrl: 'https://resim.epey.com/1/m_s26.jpg', layout: 'left',
  desc_tr: 'İlk paragraf TR.', desc_en: 'First paragraph EN.', desc_de: 'Erster Absatz DE.',
  desc2_tr: 'İkinci paragraf TR.', desc2_en: 'Second paragraph EN.', desc2_de: 'Zweiter Absatz DE.',
});
for (const layout of ['split', 'top', 'text', 'left', 'right']) {
  const p = Object.assign(eskiOge(), { layout });
  C.ensureBlocks(p);
  const metinler = p.blocks.filter((b) => b.t === 'text').map((b) => b.tr).join(' ');
  const gorsel = p.blocks.filter((b) => b.t === 'image');
  yaz(metinler.includes('İlk paragraf TR.') && metinler.includes('İkinci paragraf TR.'),
    `göç · layout=${layout} · TR metinlerin ikisi de korundu`);
  yaz(p.blocks.every((b) => b.t !== 'text' || typeof b.en === 'string'),
    `göç · layout=${layout} · EN alanı var`);
  yaz(layout === 'text' ? gorsel.length === 0 : gorsel.length === 1,
    `göç · layout=${layout} · görsel bloğu ${layout === 'text' ? 'yok' : 'bir tane'}`);
  if (gorsel.length) {
    const beklenen = layout === 'left' ? 'left' : layout === 'right' ? 'right' : 'full';
    yaz(gorsel[0].pos === beklenen, `göç · layout=${layout} · görsel pos=${beklenen}`, gorsel[0].pos);
  }
}
{
  // Almanca metin SİLİNMEZ — render edilmiyor ama kaybedilmiyor da.
  const p = eskiOge(); C.ensureBlocks(p);
  yaz(p.blocks.some((b) => b.de === 'Erster Absatz DE.'), 'göç · Almanca metin kaybolmuyor');
}
{
  // ZATEN blocks olan öğeye DOKUNULMAZ (canlıdaki 62 öğe).
  const bloklar = [{ t: 'text', style: 'bullets', tr: '- a\n- b', en: '- a\n- b', de: 'x' }];
  const p = { kind: 'product', id: 'x', name: 'A', blocks: bloklar, layout: 'left', desc_tr: 'ESKİ' };
  const once = JSON.stringify(p.blocks);
  C.ensureBlocks(p);
  yaz(JSON.stringify(p.blocks) === once, 'blocks varsa İÇERİĞE dokunulmuyor');
}
{
  const p = { kind: 'product', id: 'x', name: 'A', blocks: [] };
  C.ensureBlocks(p);
  yaz(p.blocks.length === 1 && p.blocks[0].t === 'text', 'boş blocks → bir metin bloğu');
}
{
  // normalizeBlock sitenin okuduğu alanları üretmeli, bilinmeyeni korumalı.
  const g = C.normalizeBlock({ type: 'image', url: 'https://a/b.png', pos: 'sag', size: 'xxl', w: '55', cap: 'alt', de: 'D' });
  yaz(g.t === 'image' && g.pos === 'right' && g.size === 'm' && g.w === 55 && g.cap_tr === 'alt' && g.de === 'D',
    'normalizeBlock · görsel: geçersiz pos/size düşer, w sayı, bilinmeyen korunur',
    JSON.stringify(g));
  yaz(!('type' in g), 'normalizeBlock · ham `type` alanı temizlenir');
  const t = C.normalizeBlock({ type: 'text', style: 'baslik', tr: 'a', en: 'b', de: 'c' });
  yaz(t.t === 'text' && t.style === 'paragraph' && t.de === 'c', 'normalizeBlock · metin: geçersiz style → paragraph');
  const w = C.normalizeBlock({ t: 'image', url: 'u', w: 5 });
  yaz(w.w === '', 'normalizeBlock · 15\'ten küçük genişlik yok sayılır');
}
{
  // Sitenin (BlogPost.jsx) okuduğu alan adları değişmemiş olmalı.
  const src = fs.readFileSync('web/src/pages/BlogPost.jsx', 'utf8');
  yaz(/b\.t === 'image'/.test(src), 'site render · görsel bloğu `b.t === image` okuyor');
  yaz(/b\.pos \|\| 'full'/.test(src), 'site render · `pos` varsayılanı full');
  yaz(/b\.size \|\| 'm'/.test(src), 'site render · `size` varsayılanı m');
  yaz(/Number\(b\.w\)/.test(src), 'site render · `w` manuel genişlik');
  yaz(/b\[`cap_\$\{postLang\}`\]/.test(src), 'site render · `cap_<dil>` altyazı');
  yaz(/renderBlockText\(txt, b\.style/.test(src), 'site render · `style` blok tipi');
  for (const s of C.BLOCK_STYLES) {
    yaz(s === 'paragraph' ? true : new RegExp(`'${s}'`).test(src), `site render · style="${s}" tanınıyor`);
  }
  for (const p of C.IMG_POS) yaz(new RegExp(`fig-${p}`).test(fs.readFileSync('web/src/pages/Blog.css', 'utf8')), `site css · fig-${p} var`);
  for (const s of C.IMG_SIZES) yaz(new RegExp(`pp-${s}`).test(fs.readFileSync('web/src/pages/Blog.css', 'utf8')), `site css · pp-${s} var`);
}

// ═══ 3) META SINIRLARI ════════════════════════════════════════════════════
baslik('3) META — sınırlar ve kelime sınırından kırpma');
{
  const uzun = 'Bu bir çok uzun meta başlığıdır ve altmış karakteri kesinlikle aşmaktadır efendim';
  const k = C.clampText(uzun, 60);
  yaz(k.length <= 60, 'metaTitle 60 karakteri aşmıyor', String(k.length));
  yaz(!/\s$/.test(k) && uzun.startsWith(k.split(' ').slice(0, -1).join(' ')), 'kırpma kelime sınırından');
  yaz(uzun.slice(0, k.length + 1).includes(k) && (uzun[k.length] === ' ' || uzun[k.length] === undefined || /[\s,;:–—-]/.test(uzun[k.length])),
    'kelime ORTASINDAN kesilmiyor', JSON.stringify(k));
  const d = C.clampText('x'.repeat(400), 155);
  yaz(d.length <= 155, 'metaDescription 155 karakteri aşmıyor', String(d.length));
  yaz(C.clampText('kısa', 60) === 'kısa', 'sınırın altındaki metin dokunulmuyor');
  const sonNoktalama = C.clampText('Bir iki üç dört beş altı, yedi sekiz', 27);
  yaz(!/[\s,;:–—-]$/.test(sonNoktalama), 'kırpma sonunda noktalama bırakmıyor', JSON.stringify(sonNoktalama));
}
{
  const a = { metaTitle_tr: 'A'.repeat(120), metaDescription_tr: 'B'.repeat(400), metaTitle_en: 'C'.repeat(90) };
  C.sanitizeArticle(a, []);
  yaz(a.metaTitle_tr.length <= 60 && a.metaDescription_tr.length <= 155 && a.metaTitle_en.length <= 60,
    'sanitizeArticle iki dilde de sınırları uyguluyor');
}
{
  // Öğe adındaki "1. " öneki — site sırayı KENDİ basar ("1. 1. iPad Pro").
  const p = [{ kind: 'custom', id: 'c1', name: '1. iPad Pro', name_tr: '2) NordVPN — 12,99 $/ay', name_en: '3 - Midjourney | En İyi: Sanat', blocks: [] }];
  C.sanitizeArticle({}, p);
  yaz(p[0].name === 'iPad Pro', 'öğe adı · "1. " öneki silindi', p[0].name);
  yaz(p[0].name_tr === 'NordVPN — 12,99 $/ay', 'öğe adı · fiyat eki KORUNDU', p[0].name_tr);
  yaz(p[0].name_en === 'Midjourney', 'öğe adı · "| En İyi: …" kuyruğu atıldı', p[0].name_en);
}
{
  // Blok metnine sızan ham HTML düz metne inmeli (site markdown render eder).
  const p = [{ kind: 'product', id: 'x', name: 'A', blocks: [{ t: 'text', tr: '<p><strong>Güçlü</strong> pil</p><ul><li>A</li></ul>', en: '' }] }];
  C.sanitizeArticle({}, p);
  yaz(p[0].blocks.find((b) => b.t === 'text').tr === '**Güçlü** pil\n- A',
    'blok metni · HTML düz metne indi', JSON.stringify(p[0].blocks.find((b) => b.t === 'text').tr));
}
{
  /* AI'IN İŞARETLEDİĞİ YUVAYA KOY, ARTIK BOŞ BLOK BIRAKMA.
     Ölçüldü 2026-09-04 canlı koşuda: her öğede bir fotoğraf VE bir "görsel yok"
     yer tutucusu duruyordu; modelin bıraktığı boş blok siliniyordu değil,
     fotoğraf başa ekleniyordu. */
  const p = [{ kind: 'product', id: 'x', name: 'A', image: 'https://a/b.jpg',
    blocks: [{ t: 'text', tr: 'm', en: 'm' }, { t: 'image', url: '', pos: 'left', size: 'l' }, { t: 'image', url: '', pos: 'full', size: 'm' }] }];
  C.sanitizeArticle({}, p);
  const g = p[0].blocks.filter((b) => b.t === 'image');
  yaz(g.length === 1 && g[0].url === 'https://a/b.jpg', 'görsel · katalog fotoğrafı AI yuvasına girdi', JSON.stringify(g));
  yaz(g[0].pos === 'left' && g[0].size === 'l', 'görsel · modelin seçtiği pos/size korundu');
  yaz(!p[0].blocks.some((b) => b.t === 'image' && !b.url), 'görsel · artık boş görsel bloğu YOK');
}
{
  // Görselsiz öğede TEK yuva kalır — yazarın elle koyacağı yer (kural 1).
  const q = [{ kind: 'custom', id: 'y', name: 'B',
    blocks: [{ t: 'text', tr: 'm', en: 'm' }, { t: 'image', url: '', pos: 'right', size: 'm' }, { t: 'image', url: '', pos: 'full', size: 'm' }] }];
  C.sanitizeArticle({}, q);
  const bos = q[0].blocks.filter((b) => b.t === 'image');
  yaz(bos.length === 1 && !bos[0].url, 'görsel · görselsiz öğede tek boş yuva kalıyor', String(bos.length));
}
{
  // Görseli olan ama blokta görseli olmayan öğeye otomatik görsel bloğu.
  const p = [{ kind: 'product', id: 'x', name: 'A', image: 'https://a/b.png', blocks: [{ t: 'text', tr: 'x', en: 'y' }] }];
  C.sanitizeArticle({}, p);
  yaz(p[0].blocks[0].t === 'image' && p[0].blocks[0].url === 'https://a/b.png',
    'görseli olan öğeye görsel bloğu eklendi');
}

// ═══ 4) KATALOG EŞLEŞTİRME ════════════════════════════════════════════════
baslik('4) KATALOG — canlıda kırılmış negatif vakalar');
const KATALOG = [
  { id: '1', brand: 'MSI', name: 'MSI Stealth A16 AI+ A3XWJG Laptop (32 GB / 1 TB)' },
  { id: '2', brand: 'Google', name: 'Google Pixel Buds Pro 2 Kablosuz Kulaklık' },
  { id: '3', brand: 'Sonos', name: 'Sonos Arc Ultra Soundbar' },
  { id: '4', brand: 'Xiaomi', name: 'Xiaomi Redmi Note 5 Pro (64 GB)' },
  { id: '5', brand: 'Apple', name: 'Apple MacBook Air 13.6" M4 Dizüstü Bilgisayar' },
  { id: '6', brand: 'HP', name: 'HP Pavilion 14 Laptop (16 GB / 512 GB)' },
  { id: '7', brand: 'Sony', name: 'Sony WH-1000XM6 Kablosuz Kulaklık' },
  { id: '8', brand: 'Lenovo', name: 'Lenovo IdeaPad Slim 3 83K2001WTR015 Laptop' },
  { id: '9', brand: 'Oppo', name: 'Oppo Reno (CPH1917)' },
  { id: '10', brand: 'Samsung', name: 'Samsung Galaxy Book4 Pro (SM-X930) Laptop' },
];
const NEGATIF = [
  ['Leonardo AI', 'katalogda olmayan hizmet ürüne bağlanmamalı'],
  ['Google AI Pro Nano Banana 2', 'AI aboneliği kulaklığa bağlanmamalı'],
  ['Sonos Ace Ultra', 'kulaklık soundbar\'a bağlanmamalı (rakip hat adı)'],
  ['Xiaomi Redmi Note 14 Pro', 'Note 14 ≠ Note 5 (nesil numarası)'],
  ['HP Pavilion Plus 14', '"Plus" sert ayırt edici'],
  ['Sony WH-1000XM5', 'XM5 ≠ XM6 (komşu nesil)'],
];
for (const [q, ad] of NEGATIF) {
  const r = C.bestMatch(q, KATALOG);
  yaz(r === null, `negatif · ${q}`, r ? `→ ${r.doc.name}` : '(eşleşme yok) ' + ad);
}
const POZITIF = [
  ['Apple MacBook Air M4 (2026)', '5', 'yıl yumuşak sınıf'],
  ['Lenovo IdeaPad Slim 3 15IAN8', '8', 'farklı kodlama sistemi'],
  ['Sony WH-1000XM6', '7', 'tam eşleşme'],
];
for (const [q, id, ad] of POZITIF) {
  const r = C.bestMatch(q, KATALOG);
  yaz(r && r.doc.id === id, `pozitif · ${q}`, r ? `→ ${r.doc.name}` : `BULUNAMADI (${ad})`);
}
yaz(C.matchScore('Sonos Ace Ultra', 'Sonos Arc Ultra Soundbar').ok === false, 'matchScore · rakip hat adı kapısı');
yaz(C.matchScore('Apple iPad Pro M5', 'Apple iPad Pro 11" (M5) Wi-Fi Tablet (12 GB / 256 GB)').ok === true,
  'matchScore · uzun katalog adı F1 yüzünden elenmiyor');
yaz(C.MATCH_STOPWORDS.has('ai') && !C.MATCH_STOPWORDS.has('pro') && !C.MATCH_STOPWORDS.has('ultra'),
  'stopword listesi · pro/ultra ayırt edici kalmalı');

// ═══ 5) KAYIT YÜKÜ ════════════════════════════════════════════════════════
baslik('5) KAYIT YÜKÜ — PB `articles` şeması genişlemeyecek');
{
  const a = {
    title_tr: 'Başlık', title_en: 'Title', slug_tr: 'baslik', status: 'draft',
    category: 'smartphones', cover: 'https://a/b.png', author: ' Ali ',
    publishedAt: '2026-09-01T09:00', template: 'topn', id: 'abc', updated: 'x',
    metaTitle_tr: ' M ', tags_tr: ' a, b ',
  };
  const p = [
    { kind: 'product', id: 'p1', name: 'A', slug: 'a', blocks: [], _livePrice: '1.000 TL' },
    { kind: 'custom', id: 'c1', name_tr: ' Özel Öğe ', name_en: 'Custom', blocks: [] },
    { kind: 'custom', id: 'c2', name_tr: '', name_en: '', blocks: [] },
  ];
  const d = C.savePayload(a, p, { status: 'published' });
  const fazla = Object.keys(d).filter((k) => C.SAVE_KEYS.indexOf(k) < 0);
  yaz(fazla.length === 0, 'yalnızca şemada olan alanlar yazılıyor', fazla.join(',') || '');
  const eksik = C.SAVE_KEYS.filter((k) => !(k in d));
  yaz(eksik.length === 0, 'şemadaki her alan yazılıyor', eksik.join(','));
  yaz(!('template' in d), '`template` PB\'ye YAZILMIYOR (şemada yok)');
  yaz(!('id' in d) && !('updated' in d), 'okuma alanları (id/updated) yüke sızmıyor');
  yaz(d.products.every((x) => !('_livePrice' in x)), '`_livePrice` kayda girmiyor');
  yaz(d.products.length === 2, 'adsız özel öğe düşürüldü', String(d.products.length));
  yaz(d.products[1].name === 'Özel Öğe' && d.products[1].slug === 'ozel-oge', 'özel öğe adı+slug türetildi');
  yaz(d.status === 'published', 'forceStatus uygulanıyor');
  yaz(d.author === 'Ali' && d.metaTitle_tr === 'M' && d.tags_tr === 'a, b', 'boşluklar kırpıldı');
  yaz(d.slug === 'baslik' && d.slug_en === 'title', 'slug türetme (tr slug\'tan, en başlıktan)');
}
{
  // Dokunulmamış bir makale kaydedilince blok içeriği DEĞİŞMEMELİ.
  const p = [{
    kind: 'product', id: 'p1', name: 'A', slug: 'a', imageUrl: 'https://a/b.png',
    blocks: [
      { t: 'image', url: 'https://a/b.png', pos: 'right', size: 'm' },
      { t: 'text', style: 'subheading', tr: 'Artıları:', en: 'Pros:', de: 'Vorteile:' },
      { t: 'text', style: 'bullets', tr: '- uzun pil\n- parlak ekran', en: '- long battery', de: 'x' },
    ],
  }];
  const once = JSON.stringify(p[0].blocks);
  const d = C.savePayload({ title_tr: 'T', slug_tr: 't' }, p, {});
  yaz(JSON.stringify(d.products[0].blocks) === once, 'kayıt · blok içeriği birebir korunuyor');
  yaz(d.products[0].blocks[2].de === 'x', 'kayıt · Almanca kalıntı silinmiyor');
}

// ═══ 6) SAĞLIK DENETİMİ ═══════════════════════════════════════════════════
baslik('6) SAĞLIK — her tohumlanmış sorun yakalanmalı');
const saglikVar = (a, p, parca) => C.articleHealth(a, p).some((x) => x.text.includes(parca));
{
  yaz(saglikVar({ title_en: 'T', slug_en: 't' }, [], 'TR başlığı yok'), 'TR başlık eksik → kritik');
  yaz(saglikVar({ title_tr: 'T' }, [], 'TR adresi (slug) boş'), 'TR slug eksik → kritik');
  yaz(saglikVar({ title_tr: 'T', slug_tr: 'x', title_en: 'T', slug_en: 'x' }, [], 'aynı adresi kullanıyor'), 'iki dil aynı slug → kritik');
  yaz(saglikVar({ title_tr: 'T', slug_tr: 't', metaTitle_tr: 'A'.repeat(70) }, [], '70 karakter'), 'meta başlık taşması');
  yaz(saglikVar({ title_tr: 'T', slug_tr: 't', metaDescription_tr: 'A'.repeat(200) }, [], '200 karakter'), 'meta açıklama taşması');
  yaz(saglikVar({ title_tr: 'T', slug_tr: 't' }, [], 'Kapak görseli yok'), 'kapak eksik → kritik');
  yaz(saglikVar({ title_tr: 'T', slug_tr: 't' }, [], 'Hiç içerik öğesi yok'), 'öğesiz makale');
  yaz(saglikVar({ title_tr: 'T', slug_tr: 't' }, [{ name: 'A', blocks: [] }], '"A" öğesinde görsel yok'), 'görselsiz öğe');
  yaz(saglikVar({ title_tr: 'T', slug_tr: 't' }, [], 'ince içerik'), 'kısa içerik uyarısı');
  yaz(saglikVar({ title_tr: 'T', slug_tr: 't', slug: 'baska' }, [], 'farklı'), 'kanonik slug ≠ TR slug');
  yaz(saglikVar({ title_tr: 'T', slug_tr: 't', body_tr: '<a href="/tr/blog/x">y</a>' }, [], '/tr/blog/ linki'),
    '/tr/blog/ iç linki → kritik (yumuşak 404)');
  yaz(saglikVar({ title_tr: 'T', slug_tr: 't', body_tr: '<a href="#">y</a>' }, [], 'boş/yer tutucu link'), 'href="#" yer tutucu link');
}
{
  // SSS: aday var ama kapıdan geçmiyor → FAQPage üretilmeyecek uyarısı
  const a = {
    title_tr: 'T', slug_tr: 't',
    conclusion_tr: '<h2>Hangi telefon daha iyi?</h2><p>Kısa.</p><h2>Pil ömrü ne kadar?</h2><p>Yine kısa.</p>',
  };
  yaz(saglikVar(a, [], 'FAQPage yapısal verisi çıkmayacak'), 'SSS · cevaplar kısa → uyarı');
  const b = {
    title_tr: 'T', slug_tr: 't',
    conclusion_tr: '<h2>Hangi telefon daha iyi?</h2><p>' + uzunCevap + '</p><h2>Pil ömrü ne kadar?</h2><p>' + uzunCevap + '</p>',
  };
  yaz(!saglikVar(b, [], 'FAQPage yapısal verisi çıkmayacak'), 'SSS · geçerli iki çift → uyarı yok');
  yaz(C.faqDurumu(b, 'tr').count === 2, 'faqDurumu · geçerli çift sayısı', String(C.faqDurumu(b, 'tr').count));
  yaz(C.faqDurumu(a, 'tr').kisaCevap === 2, 'faqDurumu · elenme sebebi sayılıyor');
}
{
  // Sağlıklı makale hiç KRİTİK üretmemeli.
  const a = {
    title_tr: 'Başlık', title_en: 'Title', slug_tr: 'baslik', slug_en: 'title', slug: 'baslik',
    lead_tr: 'Özet', lead_en: 'Lead', category: 'smartphones', cover: 'https://a/b.png',
    metaDescription_tr: 'd', metaDescription_en: 'd', tags_tr: 'a', tags_en: 'a',
    body_tr: '<p>' + 'kelime '.repeat(320) + '</p>', body_en: '<p>x</p>',
  };
  const p = [{ kind: 'product', id: 'p1', name: 'A', blocks: [{ t: 'image', url: 'https://a/b.png' }, { t: 'text', tr: 'x', en: 'y' }] }];
  const krit = C.articleHealth(a, p).filter((x) => x.level === 'error');
  yaz(krit.length === 0, 'sağlıklı makalede kritik sorun yok', krit.map((x) => x.text).join(' | '));
}

// ═══ 7) SLUG KOPMASI ══════════════════════════════════════════════════════
baslik('7) SLUG — adres değişince istatistik ve yorumlar kopar');
{
  yaz(C.slugKopmaUyarisi('a', 'a', {}, 0) === null, 'slug değişmediyse uyarı yok');
  yaz(C.slugKopmaUyarisi('', 'yeni', {}, 0) === null, 'yeni makalede uyarı yok');
  const u = C.slugKopmaUyarisi('eski-adres', 'yeni-adres', { view: 1240, read: 180, like: 42 }, 3);
  yaz(u !== null, 'slug değişince uyarı üretiliyor');
  yaz(u.metin.includes('1240 görüntülenme') && u.metin.includes('180 okuma') && u.metin.includes('3 yorum'),
    'uyarı gerçek sayıları taşıyor', u.kopan.join(', '));
  yaz(u.metin.includes('eski-adres') && u.metin.includes('yeni-adres'), 'uyarı iki adresi de gösteriyor');
  const bos = C.slugKopmaUyarisi('eski', 'yeni', {}, 0);
  yaz(bos.metin.includes('kayıp beklenmiyor'), 'istatistiksiz yazıda dili yumuşuyor');
}

// ═══ 8) PROMPT'LAR — ALTIN KOPYAYA KARŞI ══════════════════════════════════
if (!AI) {
  baslik("8) PROMPT'LAR — blog_ai.js yüklenemedi, ATLANDI");
  hata += 1;
} else {
  baslik("8) PROMPT'LAR — eski metinden TEK CÜMLE bile düşmemeli");
  /* NEDEN VAR: 2026-09-04'te yeniden yazım sırasında prompt metinleri
     "toparlanırken" kurallar sessizce düştü. Konu sihirbazı genel geçer,
     rekabeti yüksek, trend olmayan konular önermeye başladı; kullanıcı
     bildirdi. Düşenler: konu prompt'unda fiyat bağlamı ve BAYAT KAYNAK
     kuralı, yazar prompt'unda "170'in altında kalan varsa GERİ DÖN" ve
     "doldurma değil".
     Bu bölüm eski metni (scripts/fixtures/blog_prompt_golden.json, commit
     6716ebd9) cümle cümle arar. Bir kuralı bilerek değiştirmek gerekirse
     ALTIN KOPYAYI da güncelle — sessiz kısaltma bir daha olmayacak. */
  const G = JSON.parse(fs.readFileSync('scripts/fixtures/blog_prompt_golden.json', 'utf8'));
  const uret = {
    konu: () => AI.konuPrompt(15, '', ['Eski Başlık']),
    arastirma: () => AI.arastirmaPrompt('Best Student Laptops 2026'),
    yazar: () => AI.yazarPrompt({ title: 'X', angle: 'A', keyword: 'K', intent: 'I' }, 'NOTLAR', 'en', null),
    komut: () => AI.komutPrompt('girişi kısalt', { tr: {}, en: {}, items: [] }),
    qa: () => AI.qaPrompt({ lang: 'tr', items: [] }),
    junk: () => AI.junkPrompt(['A', 'B']),
    ceviri: () => AI.ceviriPrompt({ title: 'x', items: [] }, 'en'),
    claude: () => AI.claudePrompt(['smartphones']),
    autoSchema: () => AI.autoSchemaPrompt('ham'),
  };
  /* `markaAlan` altın kopyada DURUYOR ama artık ÜRETİLMİYOR: kullanıcının
     kararıyla AI görsel arama yolu tamamen kaldırıldı (2026-09-04, "ben
     görselleri ekleyebilirim, ai görsel bulmasına gerek yok"). Altın kopyadan
     silmiyorum — kaydı kalsın, geri getirmek gerekirse metni orada. */
  // komutPrompt'ta BİLEREK değişen tek yer: öğe işlemleri (brief §6.2).
  const BILINCLI_SAPMA = {
    komut: ['İçerik öğelerini (ürün kartları) bu çağrıda değiştiremezsin', 'Kullanıcı ürün eklenmesini/çıkarılmasını istiyorsa'],
  };
  /* ALTIN KOPYA KAYNAK BİÇİMİNDE, ÜRETİLEN ÇALIŞMA ZAMANI BİÇİMİNDE.
     Altın metin eski dosyadan template literal olarak sökülmüştü; içinde hem
     ${...} ifadeleri hem de kaynak-düzeyi kaçışlar (\n gibi) var. Kıyaslamadan
     önce ifadeleri atıp kaçışları çöz — yoksa gerçek kayıp ile biçim farkı
     birbirine karışır. */
  const SENTINEL = String.fromCharCode(0);
  const ifadeleriAt = (t) => {
    let out = '';
    let depth = 0;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (c === '$' && t[i + 1] === '{') { depth++; i++; out += SENTINEL; continue; }
      if (c === '}' && depth > 0) { depth--; continue; }
      if (!depth) out += c;
    }
    return out;
  };
  const kacisCoz = (t) => t.replace(new RegExp('\\\\(.)', 'g'),
    (m, c) => (c === 'n' ? String.fromCharCode(10) : c === 't' ? String.fromCharCode(9) : c));
  const norm = (t) => String(t).replace(/\s+/g, ' ').trim();
  const altin = (t) => norm(kacisCoz(ifadeleriAt(String(t))));
  for (const [ad, fn] of Object.entries(uret)) {
    let uretilen = '';
    try { uretilen = norm(fn()); } catch (e) { yaz(false, `üretilebiliyor · ${ad}`, e.message); continue; }
    yaz(uretilen.length > 100, `üretilebiliyor · ${ad}`, `${uretilen.length} krk`);
    // Altın metni cümlelere böl; şablon değişkeni içerenleri ve çok kısaları atla.
    // `yazar` prompt'unun AYNA bloğu yalnız ikinci dil çağrısında çıkar;
    // iki çağrının BİRLEŞİMİ altın metnin tamamını kapsamalı.
    if (ad === 'yazar') uretilen += ' ' + norm(AI.yazarPrompt({ title: 'X' }, 'N', 'tr', { lang: { title: 'X' } }));
    const cumleler = altin(G[ad]).split(/(?<=[.:?]) /)
      .map((c) => c.trim())
      .filter((c) => c.length >= 30 && !c.includes(SENTINEL));
    const eksik = cumleler.filter((c) => !uretilen.includes(c))
      .filter((c) => !(BILINCLI_SAPMA[ad] || []).some((b) => c.includes(b)));
    yaz(eksik.length === 0, `altın kopyadan cümle düşmemiş · ${ad}`,
      eksik.length ? `${eksik.length} EKSİK → ${eksik[0].slice(0, 70)}…` : `${cumleler.length} cümle`);
  }
  // Kaybedilip geri alınan kuralları AYRICA, adıyla sabitle.
  const konu = uret.konu();
  const yazar = uret.yazar();
  const komut = uret.komut();
  yaz(/USD\/EUR\/GBP üzerinden ve küresel bir hareket olarak/.test(konu), 'konu · fiyat KÜRESEL bağlam kuralı');
  yaz(/o kaynak bayattır — o konuyu ya at ya da güncel kaynakla değiştir/.test(konu), 'konu · BAYAT KAYNAK kuralı');
  yaz(/Kendi hafızandan genel geçer konu üretme/.test(konu), 'konu · genel geçer konu yasağı');
  yaz(/bulamadıysan o konuyu ÖNERME/.test(konu), 'konu · kanıtsız konu önerilmez');
  yaz(/90 günden daha geriye giden bir olayı/.test(konu), 'konu · 90 günlük tazelik penceresi');
  yaz(/Tıklama tuzağı başlık yazma/.test(konu), 'konu · clickbait yasağı');
  yaz(/altında kalan varsa GERİ DÖN ve o öğeyi genişlet/.test(yazar), 'yazar · 170 kelime GERİ DÖN kuralı');
  yaz(/doldurma değil/.test(yazar), 'yazar · SSS doldurma yasağı');
  yaz(/sayı, ölçüm, karşılaştırma, kime uygun değil/.test(yazar), 'yazar · somut bilgi numaralandırması');
  yaz(/url" alanını HER ZAMAN boş bırak/.test(yazar), 'yazar · görsel URL yasağı (kural 1)');
  yaz(/"op": "remove"/.test(komut), 'komut · öğe işlemleri (brief §6.2)');
  // KURAL 1 — GÖRSELLERİ AI BULMASIN. Bu yol iki kez geri geldi, bir daha gelmesin.
  yaz(AI.markaAlanPrompt === undefined, 'görsel · marka alan adı SORULMUYOR');
  yaz(AI.logoCandidates === undefined, 'görsel · favicon/logo adayı ÜRETİLMİYOR');
  yaz(AI.firstLoadableImage === undefined, 'görsel · logo yoklama yolu YOK');
  {
    const src = fs.readFileSync('admin/js/blog/blog_ai.js', 'utf8');
    yaz(!/s2\/favicons|icons\.duckduckgo/.test(src), 'görsel · favicon servisi kaynakta geçmiyor');
  }
  yaz(!/bu çağrıda değiştiremezsin/.test(komut), 'komut · eski "öğelere dokunamazsın" yasağı kalktı');
}

// ═══ 9) CANLI VERİ (opsiyonel) ════════════════════════════════════════════
if (process.argv.includes('--live')) {
  baslik('9) CANLI — PB\'deki gerçek makaleler editörden geçip bozulmuyor mu');
  const envYol = 'migration/.env';
  const env = Object.fromEntries(fs.readFileSync(envYol, 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  const U = (env.POCKETBASE_URL || '').replace(/\/$/, '');
  const auth = await (await fetch(`${U}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
  })).json();
  const arts = await (await fetch(`${U}/api/collections/articles/records?perPage=200`, { headers: { Authorization: auth.token } })).json();
  let bozuk = 0;
  let deKorundu = 0;
  for (const a of arts.items) {
    const p = JSON.parse(JSON.stringify(a.products || []));
    const oncekiMetin = p.map((x) => (x.blocks || []).filter((b) => b.t === 'text').map((b) => b.tr).join('')).join('');
    p.forEach((x) => C.ensureBlocks(x));
    const d = C.savePayload(a, p, {});
    const sonraMetin = d.products.map((x) => (x.blocks || []).filter((b) => b.t === 'text').map((b) => b.tr).join('')).join('');
    if (oncekiMetin && oncekiMetin !== sonraMetin) { bozuk += 1; console.log(`    ! ${a.slug}: metin değişti`); }
    if (JSON.stringify(d.products).includes('"de"')) deKorundu += 1;
  }
  yaz(bozuk === 0, `${arts.items.length} canlı makale · göç sonrası TR metin değişmiyor`, bozuk ? `${bozuk} bozuk` : '');
  yaz(deKorundu > 0, 'Almanca kalıntı korunuyor (silinmiyor)', `${deKorundu} makale`);
  const livePriceKalan = arts.items.filter((a) => JSON.stringify(C.savePayload(a, a.products || [], {})).includes('_livePrice'));
  yaz(livePriceKalan.length === 0, 'canlı kayıtlardaki `_livePrice` ilk kaydetmede temizleniyor');
}

console.log(`\n${hata ? `✗ ${hata} kural düştü` : '✓ tüm kurallar geçti'}\n`);
process.exit(hata ? 1 : 0);
