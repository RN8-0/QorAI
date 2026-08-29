// ═══════════════════════════════════════════════════════════════════════════
// FAKTÖR SATIRLARI — karşılaştırma tablosunun ORTAK satır kümesi.
//
// NEDEN AYRI DOSYA: aynı kümeleme İKİ tüketicide koşuyor —
//   · site           web/src/components/AiCharts.jsx → HeatMatrix
//   · ön-render      web/scripts/seo.mjs → anFaktorMatrisi
// Ön-render Node'da koşuyor ve JSX dosyasını import edemez; ikinci bir kopya
// yazmak crawler'ın gördüğü tablo ile okuyucunun gördüğü tabloyu ayrıştırırdı
// (proje bu dersi spec çevirisinde bir kez ödedi).
//
// SIFIR BİR VERİ DEĞİL. Ölçüldü 2026-08-29 (canlı kayıt: S26 Ultra vs
// iPhone 17 Pro Max vs Xiaomi 17 Ultra): karşılaştırma raporu her ürünü KENDİ
// AI çağrısında üretiyor ve her çağrı kendi faktör etiketlerini uyduruyordu —
// Samsung "İşlemci Performansı", iPhone "Performans". Tablo etiketlerin
// BİRLEŞİMİNİ alıp eşleşmeyen hücreye 0 yazıyordu: 42 hücrenin 28'i sıfırdı ve
// okuyucu bunu "iPhone'un işlemcisi 0 puan" diye okuyordu.
//
// Üretim tarafı artık ortak eksende puanlıyor (admin/js/qor_ai_prompts.js
// §7.5) ama YAYINLANMIŞ ESKİ KAYITLAR düzelmez; bu dosya çizim tarafının
// savunması.
// ═══════════════════════════════════════════════════════════════════════════

const HEAT_STOP = new Set(['ve', 'ile', 'and', 'or', 'the', 'of', 'for', 'ya', 'veya']);
const HEAT_SYN = {
  batarya: 'pil', aku: 'pil', battery: 'pil',
  goruntu: 'ekran', display: 'ekran', panel: 'ekran',
  fotograf: 'kamera', camera: 'kamera',
  hiz: 'performans', performance: 'performans',
  gpu: 'graphics', grafik: 'graphics', cpu: 'processor', islemci: 'processor',
  saglamlik: 'dayaniklilik', deger: 'fiyat', value: 'fiyat', price: 'fiyat',
};

function heatTokens(label) {
  return String(label || '')
    .replace(/[İI]/g, 'i').replace(/[şŞ]/g, 's').replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u').replace(/[öÖ]/g, 'o').replace(/[çÇ]/g, 'c')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t && !HEAT_STOP.has(t))
    .map((t) => HEAT_SYN[t] || t);
}

function heatHit(t, tokens) {
  return tokens.some((u) => u === t
    || (u.length > 4 && t.length > 4 && u.slice(0, 5) === t.slice(0, 5)));
}

/** İki etiket AYNI KONUYU mu ölçüyor. Simetrik: burada eksen yok, iki serbest etiket var. */
export function sameFactorTopic(a, b) {
  const ta = heatTokens(a);
  const tb = heatTokens(b);
  if (!ta.length || !tb.length) return false;
  const fwd = ta.filter((t) => heatHit(t, tb)).length / ta.length;
  const back = tb.filter((t) => heatHit(t, ta)).length / tb.length;
  // KAPSAMA. Bir etiketin kelimeleri ötekinin İÇİNDEYSE aynı konudur:
  // "Performans" ⊂ "İşlemci Performansı", "Ekran" ⊂ "Ekran Kalitesi".
  // Bu kural olmadan üç üründen biri kısa etiket yazdığında satır ikiye
  // bölünüyor ve iki satır da yarım kalıyordu.
  if (fwd === 1 || back === 1) return true;
  // Baş kelime aynıysa ("Kamera …" ↔ "Kamera …") tek ortak kelime yeter;
  // değilse iki yönlü kapsama şart, yoksa "Kamera Performansı" ile
  // "İşlemci Performansı" aynı satıra düşerdi.
  const head = ta[0] === tb[0];
  return head ? Math.max(fwd, back) >= 0.5 : (fwd >= 0.6 && back >= 0.6);
}

/**
 * Ürünlerin faktörlerini ORTAK satırlara kümeler.
 * @returns [{label, values: (number|null)[]}] — değer yoksa null, 0 DEĞİL.
 */
export function clusterFactorRows(products) {
  const cols = Array.isArray(products) ? products : [];
  const rows = [];
  cols.forEach((p, pi) => {
    (Array.isArray(p && p.factors) ? p.factors : []).forEach((f) => {
      if (!f || !f.label) return;
      const score = Number(f.score);
      if (!Number.isFinite(score)) return;
      const hit = rows.find((r) => r.values[pi] == null && sameFactorTopic(r.label, f.label));
      if (hit) {
        hit.values[pi] = score;
        // En kısa etiket satır başlığı olur: "Ekran" > "Ekran Parlaklığı ve
        // Kalitesi" — sütun başlıkları zaten dar.
        if (String(f.label).length < hit.label.length) hit.label = String(f.label);
      } else {
        const values = new Array(cols.length).fill(null);
        values[pi] = score;
        rows.push({ label: String(f.label), values });
      }
    });
  });
  return rows;
}

/**
 * Çizilecek NİHAİ satır kümesi — hem site hem ön-render bunu kullanır.
 *
 * 1. AI'ın kendi ortak matrisi (`comparison.factorMatrix`) varsa O kullanılır.
 * 2. Yoksa (ya da yarım kaldıysa) ürün faktörlerinden kümelenir.
 * 3. Bir satır ancak ürünlerin EN AZ İKİSİNDE ölçülmüşse çizilir; ölçülmeyen
 *    hücre `null` kalır — asla 0.
 * 4. Sıralama: önce tam ölçülmüş satırlar, sonra farkı BÜYÜK olanlar — kararı
 *    değiştiren satır en üstte.
 */
export function factorMatrixRows(products, matrix, limit = 12) {
  const cols = Array.isArray(products) ? products.filter((p) => p && p.name) : [];
  if (cols.length < 2) return [];
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

  let rows = [];
  const mx = Array.isArray(matrix) ? matrix : [];
  if (mx.length) {
    rows = mx
      .filter((r) => r && r.label && Array.isArray(r.scores))
      .map((r) => ({
        label: String(r.label),
        values: cols.map((c) => {
          const hit = r.scores.find((s) => s && norm(s.name) === norm(c.name));
          const v = hit ? Number(hit.score) : NaN;
          return Number.isFinite(v) ? v : null;
        }),
      }))
      .filter((r) => r.values.filter((v) => v != null).length >= 2);
  }
  if (rows.length < 3) {
    const clustered = clusterFactorRows(cols)
      .filter((r) => r.values.filter((v) => v != null).length >= 2);
    if (clustered.length > rows.length) rows = clustered;
  }
  const spread = (r) => {
    const vals = r.values.filter((v) => v != null);
    return vals.length > 1 ? Math.max(...vals) - Math.min(...vals) : 0;
  };
  return rows
    .map((r) => ({ ...r, filled: r.values.filter((v) => v != null).length }))
    .sort((a, b) => (b.filled - a.filled) || (spread(b) - spread(a)))
    .slice(0, limit);
}

/** Sütun başına ortalama (ölçülmemiş hücreler sayılmaz). */
export function factorColumnAverages(rows, colCount) {
  return Array.from({ length: colCount }, (_, i) => {
    const vals = rows.map((r) => r.values[i]).filter((v) => v != null);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  });
}

/** Sütun başına "kaç faktörde tek başına önde" sayısı. */
export function factorColumnWins(rows, colCount) {
  return Array.from({ length: colCount }, (_, i) => rows.filter((r) => {
    const vals = r.values.filter((v) => v != null);
    if (vals.length < 2 || r.values[i] == null) return false;
    const best = Math.max(...vals);
    return r.values[i] === best && vals.filter((v) => v === best).length === 1;
  }).length);
}
