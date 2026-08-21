// ═══════════════════════════════════════════════════════════════════════════
//  Ust bardaki GENISLEYEN arama (v2).
//
//  NEDEN v2 — v1'de CANLIDA olculen iki kirik davranis:
//
//  1) MOBILDE YARIM GORUNUYORDU. Acilan alan `.hs-wrap`a gore
//     `position:absolute; right:0` konumlaniyordu; `.hs-wrap` ust barin SOL
//     tarafinda (logonun hemen sagi) durdugu icin `calc(100vw - 28px)`
//     genisligindeki kutu SOLA dogru ekran disina tasiyordu. 390 px'te olculen:
//     input.left = -173 px, yani alanin ve icindeki yazinin yarisi ekran
//     disindaydi; ikon da tamamen kayboluyordu (scripts/_arama_tani.mjs).
//     Cozum: mobilde acilan alan ARTIK `.appbar-inner`a gore konumlanir
//     (`.hs` orada `position:static`), yani ust barin tam genisligini kaplar.
//
//  2) ARAMA YAPTIKTAN SONRA IKON ACMIYORDU. Buton `type={acik ? 'submit' :
//     'button'}` idi. Kapaliyken ikona basilinca React `acik=true` yapip
//     SENKRON yeniden render ediyor, buton daha click'in VARSAYILAN eylemi
//     calismadan once `type="submit"`e donusuyor ve tarayici formu
//     gonderiyordu. gonder() de `q` doluysa `setAcik(false)` yapiyor →
//     kutu aciliр aninda kapaniyordu. Ilk aramada gorunmuyordu cunku `q`
//     bosken gonder() erken cikip kapatmiyor. Cozum: buton HER ZAMAN
//     `type="button"`; gonderme islevi acikken onClick'ten cagriliyor.
//
//  Ayrica: sonuclar artik HER SAYFADAN ulasilabilen /search rotasina gidiyor
//  (once yalniz ana sayfa `?q=` render ediyordu), satirlarda karsilastirma
//  havuzuna dogrudan ekleyen "+" butonu var ve klavye ile gezinilebiliyor.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { searchProductsLean } from '../lib/typesense';
import { productPath, searchPath } from '../lib/routes';
import { displayProductName } from '../lib/productNames';
import { useCompare } from '../lib/compare';
import './HeaderSearch.css';

const ONERI = 6;

export default function HeaderSearch() {
  const { lang, t } = useI18n();
  const L = (en, tr) => (lang === 'tr' ? tr : en);
  const nav = useNavigate();
  const loc = useLocation();
  const { has, tryAdd, remove } = useCompare();

  const [acik, setAcik] = useState(false);
  const [q, setQ] = useState('');
  const [sonuc, setSonuc] = useState([]);
  const [araniyor, setAraniyor] = useState(false);
  const [imlec, setImlec] = useState(-1);      // klavye ile secili satir
  const [uyari, setUyari] = useState('');      // "farkli kategori" bildirimi
  const kutu = useRef(null);
  const girdi = useRef(null);
  const uyariZ = useRef(null);

  const kapat = useCallback(() => { setAcik(false); setSonuc([]); setImlec(-1); }, []);

  // ── Disari tiklayinca kapan ──────────────────────────────────────────────
  // `pointerdown` (mousedown degil): mobilde dokunus da yakalanir. Panelin
  // KENDI icindeki dokunuslar kutu.contains ile eleniyor, dolayisiyla mobil
  // klavye acilip kapanmasi paneli kapatmaz.
  // ESC BELGE DUZEYINDE dinlenir, input'un onKeyDown'unda DEGIL: olculdu —
  // kullanici bir satirin "+" dugmesine bastiktan sonra odak o dugmede
  // kaliyor ve input'a bagli ESC hic tetiklenmiyordu (panel acik takiliyordu).
  useEffect(() => {
    if (!acik) return undefined;
    const dis = (e) => { if (kutu.current && !kutu.current.contains(e.target)) kapat(); };
    const esc = (e) => { if (e.key === 'Escape') kapat(); };
    document.addEventListener('pointerdown', dis);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', dis);
      document.removeEventListener('keydown', esc);
    };
  }, [acik, kapat]);

  // Rota degisince kapan — geri/ileri tusu da dahil. Aksi halde bir oneriye
  // tiklayip urune gidildikten sonra panel acik kaliyordu.
  useEffect(() => { kapat(); }, [loc.key, kapat]);

  // Acilinca odagi input'a ver. Gecikme: mobilde klavyenin animasyonla ayni
  // anda acilmasi genisleme animasyonunu tiksirtiyor.
  useEffect(() => {
    if (!acik) return undefined;
    const z = setTimeout(() => girdi.current?.focus(), 170);
    return () => clearTimeout(z);
  }, [acik]);

  // Panel acikken arka planin kaymasi mobilde ust bari da beraberinde
  // oynatiyordu; ust bar sticky oldugu icin panel "titriyor" gorunuyordu.
  useEffect(() => {
    if (!acik) return undefined;
    document.body.classList.add('qor-hs-open');
    return () => document.body.classList.remove('qor-hs-open');
  }, [acik]);

  // ── Oneriler (debounce) ──────────────────────────────────────────────────
  useEffect(() => {
    const s = q.trim();
    setImlec(-1);
    if (!s) { setSonuc([]); setAraniyor(false); return undefined; }
    setAraniyor(true);
    let canli = true;
    const z = setTimeout(async () => {
      try {
        const r = await searchProductsLean(s, ONERI);
        if (canli) setSonuc(Array.isArray(r) ? r.slice(0, ONERI) : []);
      } catch { if (canli) setSonuc([]); } finally { if (canli) setAraniyor(false); }
    }, 260);
    return () => { canli = false; clearTimeout(z); };
  }, [q]);

  useEffect(() => () => clearTimeout(uyariZ.current), []);

  const gonder = useCallback((terim) => {
    const s = String(terim ?? q).trim();
    if (!s) { girdi.current?.focus(); return; }
    const hedef = searchPath(s);
    kapat();
    // Ayni sorgu tekrar gonderilirse gecmise ayni adresi UST USTE yigmayalim;
    // yoksa geri tusu bir ise yaramayan adimlara takiliyor.
    nav(hedef, { replace: `${loc.pathname}${loc.search}` === hedef });
  }, [kapat, loc.pathname, loc.search, nav, q]);

  const urunAc = useCallback((p) => {
    kapat();
    setQ('');
    nav(productPath(p));
  }, [kapat, nav]);

  // Satirdaki "+" — karsilastirma havuzuna dogrudan ekler. ProductCard'daki
  // davranisin birebir ayni: farkli kategori reddedilir ve uyari gosterilir.
  const karsilastir = (e, p) => {
    e.preventDefault();
    e.stopPropagation();
    if (has(p.id)) { remove(p.id); return; }
    const r = tryAdd(p);
    if (!r.ok && r.reason === 'category') {
      setUyari(L('Different category', 'Farklı kategori'));
      clearTimeout(uyariZ.current);
      uyariZ.current = setTimeout(() => setUyari(''), 2400);
    }
  };

  // ── Klavye ───────────────────────────────────────────────────────────────
  const tus = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); kapat(); return; }
    if (!sonuc.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setImlec((i) => (i + 1) % sonuc.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setImlec((i) => (i <= 0 ? sonuc.length : i) - 1); }
    else if (e.key === 'Enter' && imlec >= 0) { e.preventDefault(); urunAc(sonuc[imlec]); }
  };

  const panelAcik = acik && q.trim().length > 0;

  return (
    <div className={'hs' + (acik ? ' hs-open' : '')} ref={kutu}>
      <form
        className="hs-form"
        onSubmit={(e) => { e.preventDefault(); gonder(); }}
        role="search"
      >
        {/* HER ZAMAN type="button" — bkz. dosya basindaki (2) numarali not.
            IKON AC/KAPA DUGMESIDIR, gonderme dugmesi DEGIL: acikken tekrar
            basmak kutuyu kapatir. Gonderme Enter ile (mobilde klavyenin
            "ara" tusu — enterKeyHint) ya da panelin altindaki "Tum
            sonuclari gor" ile yapilir. */}
        <button
          type="button"
          className="hs-btn"
          onClick={() => (acik ? kapat() : setAcik(true))}
          aria-label={acik ? L('Close search', 'Aramayı kapat') : t('common.search')}
          aria-expanded={acik}
          title={acik ? L('Close search', 'Aramayı kapat') : t('common.search')}
        >
          <span className="hs-btn-ring" aria-hidden="true" />
          {acik ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><line x1="20.4" y1="20.4" x2="16.5" y2="16.5" />
            </svg>
          )}
        </button>

        <input
          ref={girdi}
          className="hs-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={tus}
          placeholder={L('Search products…', 'Ürün ara…')}
          aria-label={t('common.search')}
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          enterKeyHint="search"
          type="search"
          role="combobox"
          aria-expanded={panelAcik}
          aria-controls="hs-panel"
          aria-autocomplete="list"
          aria-activedescendant={imlec >= 0 && sonuc[imlec] ? `hs-row-${sonuc[imlec].id}` : undefined}
          tabIndex={acik ? 0 : -1}
        />

        {acik && q && (
          <button type="button" className="hs-clear"
            onClick={() => { setQ(''); girdi.current?.focus(); }}
            aria-label={L('Clear', 'Temizle')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        {/* Ayri bir "geri" dugmesi KALDIRILDI: ikonun kendisi kapatiyor,
            ikinci bir kapatma dugmesi yalnizca kalabalik yapiyordu. */}
      </form>

      {panelAcik && (
        <div className="hs-panel" id="hs-panel" role="listbox" aria-label={t('common.search')}>
          {araniyor && !sonuc.length ? (
            /* Yavas agda "aranıyor…" yazisi yerine gercek satir iskeleti:
               panel yuksekligi sonuclar gelince zipplamiyor. */
            <div className="hs-skel-wrap" aria-live="polite" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div className="hs-row hs-skel" key={i}>
                  <span className="hs-row-img skel" />
                  <span className="hs-row-copy">
                    <span className="skel hs-skel-line" style={{ width: '72%' }} />
                    <span className="skel hs-skel-line sm" style={{ width: '38%' }} />
                  </span>
                </div>
              ))}
            </div>
          ) : !sonuc.length ? (
            <div className="hs-state">
              <strong>{L('No products matched.', 'Eşleşen ürün yok.')}</strong>
              <span>{L('Try a shorter or more common term.', 'Daha kısa ya da daha genel bir terim dene.')}</span>
            </div>
          ) : (
            <>
              <div className="hs-rows">
                {sonuc.map((p, i) => {
                  const ekli = has(p.id);
                  return (
                    <div
                      key={p.id}
                      id={`hs-row-${p.id}`}
                      role="option"
                      aria-selected={i === imlec}
                      className={'hs-row' + (i === imlec ? ' on' : '')}
                      onMouseEnter={() => setImlec(i)}
                    >
                      <button type="button" className="hs-row-main" onClick={() => urunAc(p)} tabIndex={-1}>
                        <span className="hs-row-img">
                          {p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" decoding="async" /> : null}
                        </span>
                        <span className="hs-row-copy">
                          <span className="hs-row-name">{displayProductName(p, lang)}</span>
                          {p.brand ? <span className="hs-row-brand">{p.brand}</span> : null}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={'hs-row-cmp' + (ekli ? ' on' : '')}
                        onClick={(e) => karsilastir(e, p)}
                        title={ekli
                          ? L('In compare', 'Karşılaştırmada')
                          : L('Add to compare', 'Karşılaştırmaya ekle')}
                        aria-label={ekli
                          ? L('Remove from compare', 'Karşılaştırmadan çıkar')
                          : L('Add to compare', 'Karşılaştırmaya ekle')}
                      >
                        {ekli ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
              <button type="button" className="hs-all" onClick={() => gonder()}>
                {L('See all results', 'Tüm sonuçları gör')}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="18" y2="12" /><polyline points="13 6 19 12 13 18" /></svg>
              </button>
            </>
          )}
          {uyari && <div className="hs-uyari" role="status">{uyari}</div>}
        </div>
      )}
    </div>
  );
}
