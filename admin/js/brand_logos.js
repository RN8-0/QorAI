/* ═══════════════════════════════════════════════════════════════════════════
   MARKA GÖRSELLERİ (elle yükleme)
   ---------------------------------------------------------------------------
   NEDEN VAR — ölçüldü 2026-08-28: abonelik karşılaştırmasında bazı servisler
   logosuz, harf rozetiyle çıkıyordu. Üç sebebi vardı:

     1. `admin/js/sub_logos.js` eşleme tablosu 103 logo dosyasının yalnızca
        ~40'ını adlandırıyordu; düz "HBO" karşılığı hiç yoktu.
     2. `web/scripts/postbuild.mjs` elle yazılmış 29 dosyalık bir listeyi
        kopyalıyordu; kalan 74 dosya yayında 404 dönüyordu.
     3. Hiçbir tablonun tanımadığı yeni bir servis/ürün için elle görsel
        verecek bir yol YOKTU.

   İlk ikisi kodda düzeltildi. Bu ekran üçüncüsü: ADA bağlı görsel yükleme.

   GÖRSEL ANALİZ KAYDINA DEĞİL ADA BAĞLANIR. "HBO" için bir kez yüklenen logo
   her karşılaştırmada, abonelik kartında, geçmişte ve uygulamada geçerli olur;
   analiz kaydına gömülseydi aynı görseli her rapor için yeniden yüklemek
   gerekirdi.

   Çözümleme sırası (web/src/components/SubLogo.jsx): ELLE YÜKLENEN → quiz
   slug'ı → yerel tablo → kayıttaki adres → Simple Icons → Clearbit → kelime
   rozeti. Elle yüklenen en başta, çünkü bu katmanın tek varlık sebebi
   ötekilerin yanlış ya da eksik kalması.

   Depo: PB `brand_logos` (okuma herkese açık, yazma yalnızca admin).
   ═══════════════════════════════════════════════════════════════════════════ */

const BRAND_LOGO_COLL = 'brand_logos';
const BRAND_LOGO_MAX_BYTES = 2 * 1024 * 1024;
const BRAND_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

let brandLogosState = { rows: [], loading: false, q: '' };

function brandLogoEsc(v) {
  return String(v == null ? '' : v).replace(/[<>&"]/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]
  ));
}

function brandLogoNormalize(ad) {
  const API = window.QorSubLogos;
  return API && API.normalizeName ? API.normalizeName(ad) : String(ad || '').toLowerCase().trim();
}

/** Kayıttan gösterilebilir adres. Tek kaynak: sub_logos.js. */
function brandLogoUrlOf(rec) {
  const API = window.QorSubLogos;
  if (API && API.overrideUrlFromRecord) return API.overrideUrlFromRecord(getPb().baseUrl, rec);
  return rec && rec.imageUrl ? rec.imageUrl : '';
}

async function brandLogosLoad() {
  brandLogosState.loading = true;
  brandLogosRender();
  try {
    brandLogosState.rows = await getPb().collection(BRAND_LOGO_COLL).getFullList({
      sort: 'key',
      // `fields` ASLA undefined bırakılmaz (destek kutusu dersi: SDK yalnız
      // `null`'ı atlar, `undefined` giderse PB boş nesne döndürür).
      fields: 'id,collectionId,key,label,kind,image,imageUrl,note,updated',
      $autoCancel: false,
    });
  } catch (e) {
    console.warn('[brandLogos] liste okunamadı', e);
    brandLogosState.rows = [];
  }
  brandLogosState.loading = false;
  brandLogosRender();
  // Liste her yenilendiginde paylasilan cozumleyici de tazelenir.
  if (window.QorSubLogos && window.QorSubLogos.setOverrides) {
    const harita = {};
    for (const r of brandLogosState.rows) {
      const url = brandLogoUrlOf(r);
      if (r && r.key && url) harita[r.key] = url;
    }
    window.QorSubLogos.setOverrides(harita);
  }
}

/** Yerel tablonun ZATEN tanıdığı adlar — gereksiz yükleme yapılmasın diye
 *  ekranda ayrıca gösterilir. */
function brandLogosBilinen() {
  const API = window.QorSubLogos;
  if (!API || !API.LOCAL_LOGOS) return [];
  return Object.keys(API.LOCAL_LOGOS).sort();
}

function brandLogosRender() {
  const root = document.getElementById('brandLogosRoot');
  if (!root) return;
  const q = brandLogoNormalize(brandLogosState.q);
  const rows = brandLogosState.rows.filter((r) => !q
    || brandLogoNormalize(r.key).includes(q)
    || brandLogoNormalize(r.label).includes(q));

  const kartlar = rows.map((r) => {
    const url = brandLogoUrlOf(r);
    return `
      <div class="brandlogo-card">
        <div class="brandlogo-thumb">
          ${url ? `<img src="${brandLogoEsc(url)}" alt="${brandLogoEsc(r.key)}" loading="lazy">`
    : '<span class="brandlogo-empty">—</span>'}
        </div>
        <div class="brandlogo-meta">
          <strong>${brandLogoEsc(r.label || r.key)}</strong>
          <code>${brandLogoEsc(r.key)}</code>
          ${r.note ? `<small>${brandLogoEsc(r.note)}</small>` : ''}
        </div>
        <div class="brandlogo-actions">
          <button class="btn btn-ghost btn-sm" onclick="brandLogosReplace('${brandLogoEsc(r.id)}')">Değiştir</button>
          <button class="btn btn-danger btn-sm" onclick="brandLogosDelete('${brandLogoEsc(r.id)}','${brandLogoEsc(r.key)}')">Sil</button>
        </div>
      </div>`;
  }).join('');

  root.innerHTML = `
    <div class="card" style="margin:0 0 16px;padding:16px">
      <div class="card-title">🖼 Görsel yükle</div>
      <p class="muted" style="margin:0 0 12px">
        Karşılaştırılan ürün veya abonelik için logo çıkmıyorsa buraya adını yazıp bir görsel yükle.
        Görsel <b>ada</b> bağlanır: bir kez yüklersen sitede, uygulamada ve tüm raporlarda geçerli olur.
        Ad birebir aynı olmak zorunda değil — “Netflix Premium” yazsan da “netflix” kaydını bulur.
      </p>
      <div class="form-grid" style="align-items:end">
        <div class="form-field">
          <label>Ad <span class="muted">(ürün ya da abonelik)</span></label>
          <input id="brandLogoName" type="text" placeholder="örn. HBO" autocomplete="off">
        </div>
        <div class="form-field">
          <label>Tür</label>
          <select id="brandLogoKind">
            <option value="subscription">Abonelik</option>
            <option value="product">Ürün</option>
            <option value="other">Diğer</option>
          </select>
        </div>
        <div class="form-field">
          <label>Görsel <span class="muted">(PNG/JPG/WEBP/SVG, en çok 2 MB)</span></label>
          <input id="brandLogoFile" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml">
        </div>
        <div class="form-field">
          <label>ya da görsel adresi</label>
          <input id="brandLogoUrl" type="url" placeholder="https://…" autocomplete="off">
        </div>
        <div class="form-field">
          <button class="btn btn-primary" onclick="brandLogosSave()">Kaydet</button>
        </div>
      </div>
      <div id="brandLogoMsg" class="muted" style="margin-top:10px"></div>
    </div>

    <div class="card" style="margin:0 0 16px;padding:16px">
      <div class="card-title">Yüklenenler <span class="count-badge">${rows.length}</span></div>
      <input id="brandLogoSearch" type="text" placeholder="Ara…" value="${brandLogoEsc(brandLogosState.q)}"
        oninput="brandLogosState.q=this.value;brandLogosRender()" style="max-width:280px;margin-bottom:12px">
      ${brandLogosState.loading ? '<p class="muted">Yükleniyor…</p>'
    : rows.length ? `<div class="brandlogo-grid">${kartlar}</div>`
      : '<p class="muted">Henüz elle yüklenmiş görsel yok. Aşağıdaki adlar zaten yerel tablodan geliyor, onlar için yükleme gerekmez.</p>'}
    </div>

    <details class="card" style="margin:0;padding:16px">
      <summary style="cursor:pointer;font-weight:600">Yerel tablonun tanıdığı ${brandLogosBilinen().length} ad — bunlar için yükleme gerekmez</summary>
      <p class="muted" style="margin:10px 0 0;line-height:1.9">
        ${brandLogosBilinen().map((k) => `<code>${brandLogoEsc(k)}</code>`).join(' ')}
      </p>
    </details>`;

  const search = document.getElementById('brandLogoSearch');
  if (search && document.activeElement !== search && brandLogosState.q) {
    search.focus();
    search.setSelectionRange(search.value.length, search.value.length);
  }
}

function brandLogoMsg(text, hata) {
  const el = document.getElementById('brandLogoMsg');
  if (el) {
    el.textContent = text;
    el.style.color = hata ? 'var(--danger, #EF4444)' : '';
  }
}

async function brandLogosSave() {
  const adEl = document.getElementById('brandLogoName');
  const fileEl = document.getElementById('brandLogoFile');
  const urlEl = document.getElementById('brandLogoUrl');
  const kindEl = document.getElementById('brandLogoKind');
  const label = String(adEl && adEl.value || '').trim();
  const key = brandLogoNormalize(label);
  const url = String(urlEl && urlEl.value || '').trim();
  const file = fileEl && fileEl.files && fileEl.files[0];

  if (!key) { brandLogoMsg('Önce bir ad yaz.', true); return; }
  if (!file && !url) { brandLogoMsg('Bir görsel yükle ya da bir adres yapıştır.', true); return; }
  if (file) {
    if (file.size > BRAND_LOGO_MAX_BYTES) {
      brandLogoMsg(`Görsel ${(file.size / 1048576).toFixed(1)} MB — sınır 2 MB.`, true);
      return;
    }
    if (BRAND_LOGO_TYPES.indexOf(file.type) < 0) {
      brandLogoMsg(`Bu tür desteklenmiyor (${file.type || 'bilinmiyor'}). PNG, JPG, WEBP ya da SVG olmalı.`, true);
      return;
    }
  }

  brandLogoMsg('Kaydediliyor…');
  try {
    const pb = getPb();
    // Aynı ad ikinci kez yüklenirse YENİ KAYIT açılmaz, mevcut olan güncellenir:
    // `key` benzersiz indeksli ve iki kayıt olsa hangisinin kazandığı belirsiz olurdu.
    let mevcut = null;
    try {
      mevcut = await pb.collection(BRAND_LOGO_COLL).getFirstListItem(
        `key="${key.replace(/"/g, '\\"')}"`, { $autoCancel: false },
      );
    } catch (_) { mevcut = null; }

    const form = new FormData();
    form.append('key', key);
    form.append('label', label);
    form.append('kind', (kindEl && kindEl.value) || 'subscription');
    if (file) form.append('image', file);
    // Dosya yüklendiyse adres alanı TEMİZLENİR: iki kaynak dolu kalırsa
    // hangisinin gösterildiği kayda bakmadan anlaşılmaz.
    form.append('imageUrl', file ? '' : url);

    if (mevcut) await pb.collection(BRAND_LOGO_COLL).update(mevcut.id, form);
    else await pb.collection(BRAND_LOGO_COLL).create(form);

    if (adEl) adEl.value = '';
    if (urlEl) urlEl.value = '';
    if (fileEl) fileEl.value = '';
    brandLogoMsg(`"${label}" kaydedildi. Sitede en geç 10 dakika içinde görünür.`);
    await brandLogosLoad();
  } catch (e) {
    console.error('[brandLogos] kaydedilemedi', e);
    brandLogoMsg('Kaydedilemedi: ' + (e && e.message ? e.message : 'bilinmeyen hata'), true);
  }
}

function brandLogosReplace(id) {
  const rec = brandLogosState.rows.find((r) => r.id === id);
  if (!rec) return;
  const adEl = document.getElementById('brandLogoName');
  const kindEl = document.getElementById('brandLogoKind');
  if (adEl) adEl.value = rec.label || rec.key;
  if (kindEl && rec.kind) kindEl.value = rec.kind;
  brandLogoMsg(`"${rec.label || rec.key}" için yeni bir görsel seç ve Kaydet'e bas.`);
  const fileEl = document.getElementById('brandLogoFile');
  if (fileEl) fileEl.click();
}

async function brandLogosDelete(id, key) {
  if (!confirm(`"${key}" için yüklenen görsel silinsin mi?\n\nSilindikten sonra yerel tabloya ya da otomatik kaynaklara geri döner.`)) return;
  try {
    await getPb().collection(BRAND_LOGO_COLL).delete(id);
    brandLogoMsg(`"${key}" silindi.`);
    await brandLogosLoad();
  } catch (e) {
    console.error('[brandLogos] silinemedi', e);
    brandLogoMsg('Silinemedi: ' + (e && e.message ? e.message : 'bilinmeyen hata'), true);
  }
}

/* Elle yüklenen görselleri PAYLAŞILAN çözümleyiciye yükler.
   Admin de site ile AYNI logoyu göstermek zorunda: `analyses.js -> subLogo()`
   ve yayınlanan kaydın görseli `QorSubLogos.logoUrl()` üzerinden geçiyor, o da
   geçersiz kılmayı ancak harita doldurulduysa görür. Doldurulmazsa admin
   önizlemesi sitede görünenden FARKLI olur ve yükleme yapılmış mı anlaşılmaz. */
async function brandLogosSyncOverrides() {
  const API = window.QorSubLogos;
  if (!API || !API.setOverrides) return;
  try {
    const rows = await getPb().collection(BRAND_LOGO_COLL).getFullList({
      sort: 'key',
      fields: 'id,collectionId,key,image,imageUrl',
      $autoCancel: false,
    });
    const harita = {};
    for (const r of rows) {
      const url = brandLogoUrlOf(r);
      if (r && r.key && url) harita[r.key] = url;
    }
    API.setOverrides(harita);
  } catch (e) {
    // Geçersiz kılma bir ZENGİNLEŞTİRME katmanı; yerel tablo zaten çalışıyor.
    console.warn('[brandLogos] geçersiz kılmalar okunamadı', e);
  }
}

// Panel açılır açılmaz bir kez; `getPb()` pb_client.js'ten gelir ve okuma
// herkese açık olduğu için oturum beklenmez.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { brandLogosSyncOverrides(); });
} else {
  brandLogosSyncOverrides();
}

/** Analiz ekranından çağrılır: bir konu adını forma taşıyıp bu görünüme geçer. */
function brandLogosOpenFor(name) {
  if (typeof showView === 'function') showView('brandlogos');
  brandLogosLoad().then(() => {
    const adEl = document.getElementById('brandLogoName');
    if (adEl) { adEl.value = String(name || ''); adEl.focus(); }
  });
}

window.brandLogosState = brandLogosState;
window.brandLogosLoad = brandLogosLoad;
window.brandLogosRender = brandLogosRender;
window.brandLogosSave = brandLogosSave;
window.brandLogosReplace = brandLogosReplace;
window.brandLogosDelete = brandLogosDelete;
window.brandLogosOpenFor = brandLogosOpenFor;
window.brandLogosSyncOverrides = brandLogosSyncOverrides;
