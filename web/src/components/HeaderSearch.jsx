// ═══════════════════════════════════════════════════════════════════════════
//  Ust bardaki GENISLEYEN arama.
//
//  NEDEN: arama yalnizca ana sayfanin hero'sundaydi; kullanici bir urun ya da
//  kategori sayfasindayken arama yapamiyordu (rakiplerde — Akakce, Epey —
//  arama HER sayfada ust barda). Hero'daki kutu kaldirildi, arama buraya
//  tasindi ve her sayfada erisilebilir oldu.
//
//  Davranis: ikona basilinca alan saga dogru animasyonla acilir (ikon da
//  onunde kayar). MOBILDE saga genisleyecek yer yok (390 px) — orada ust bara
//  oturan tam genislikte bir katman acilir. Yazarken oneriler ANINDA altta
//  listelenir; Enter ya da "Ara" tam sonuc sayfasina (/?q=…) gider.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { searchProducts } from '../lib/typesense';
import { productPath } from '../lib/routes';
import { displayProductName } from '../lib/productNames';
import './HeaderSearch.css';

export default function HeaderSearch() {
  const { lang, t } = useI18n();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const nav = useNavigate();
  const [acik, setAcik] = useState(false);
  const [q, setQ] = useState('');
  const [sonuc, setSonuc] = useState([]);
  const [araniyor, setAraniyor] = useState(false);
  const kutu = useRef(null);
  const girdi = useRef(null);

  // Disari tiklayinca kapat (bos ise). Icinde yazi varken kazayla kapanip
  // kullanicinin yazdigini kaybetmesi sinir bozucu olurdu.
  useEffect(() => {
    if (!acik) return undefined;
    const dis = (e) => {
      if (kutu.current && !kutu.current.contains(e.target)) {
        setAcik(false);
        setSonuc([]);
      }
    };
    const esc = (e) => { if (e.key === 'Escape') { setAcik(false); setSonuc([]); } };
    document.addEventListener('mousedown', dis);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', dis); document.removeEventListener('keydown', esc); };
  }, [acik]);

  // Acilinca odagi input'a ver — animasyon bitmeden odaklamak mobilde
  // klavyeyi acip animasyonu tiksirtiyor, o yuzden kisa gecikme.
  useEffect(() => {
    if (!acik) return undefined;
    const z = setTimeout(() => girdi.current?.focus(), 180);
    return () => clearTimeout(z);
  }, [acik]);

  // Oneriler: yazma durunca ara (debounce). Her tusa istek atmak Typesense'i
  // gereksiz yoruyor ve sonuclar sirasiz donuyordu.
  useEffect(() => {
    const s = q.trim();
    if (!s) { setSonuc([]); setAraniyor(false); return undefined; }
    setAraniyor(true);
    let canli = true;
    const z = setTimeout(async () => {
      try {
        // searchProducts(query, limit) DIZI dondurur — obje degil.
        const r = await searchProducts(s, 6);
        if (canli) setSonuc(Array.isArray(r) ? r.slice(0, 6) : []);
      } catch { if (canli) setSonuc([]); } finally { if (canli) setAraniyor(false); }
    }, 280);
    return () => { canli = false; clearTimeout(z); };
  }, [q]);

  const gonder = (e) => {
    e?.preventDefault?.();
    const s = q.trim();
    if (!s) { girdi.current?.focus(); return; }
    setAcik(false);
    setSonuc([]);
    nav(`/?q=${encodeURIComponent(s)}`);
  };

  const urunAc = (p) => {
    setAcik(false);
    setQ('');
    setSonuc([]);
    nav(productPath(p));
  };

  return (
    <div className={'hs-wrap' + (acik ? ' hs-open' : '')} ref={kutu}>
      <form className="hs-form" onSubmit={gonder} role="search">
        <button
          type={acik ? 'submit' : 'button'}
          className="iconbtn hs-btn"
          onClick={() => { if (!acik) setAcik(true); }}
          aria-label={t('common.search')}
          aria-expanded={acik}
          title={t('common.search')}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
        <input
          ref={girdi}
          className="hs-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={L('Search products by name…', 'Ürün adıyla ara…', 'Produkt nach Name suchen…')}
          aria-label={t('common.search')}
          autoComplete="off"
          tabIndex={acik ? 0 : -1}
        />
        {acik && q && (
          <button type="button" className="hs-clear" onClick={() => { setQ(''); girdi.current?.focus(); }}
            aria-label={L('Clear', 'Temizle', 'Löschen')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </form>

      {acik && q.trim() && (
        <div className="hs-panel">
          {araniyor && !sonuc.length ? (
            <div className="hs-state">{L('Searching products…', 'Ürünler aranıyor…', 'Produkte werden gesucht…')}</div>
          ) : !sonuc.length ? (
            <div className="hs-state">{L('No matching products yet.', 'Henüz eşleşen ürün yok.', 'Noch keine passenden Produkte.')}</div>
          ) : (
            <>
              {sonuc.map((p) => (
                <button key={p.id} type="button" className="hs-row" onClick={() => urunAc(p)}>
                  <span className="hs-row-img">
                    {p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" /> : null}
                  </span>
                  <span className="hs-row-copy">
                    <span className="hs-row-name">{displayProductName(p, lang)}</span>
                    {p.brand ? <span className="hs-row-brand">{p.brand}</span> : null}
                  </span>
                </button>
              ))}
              <button type="button" className="hs-all" onClick={gonder}>
                {L(`See all results for "${q.trim()}"`, `"${q.trim()}" için tüm sonuçlar`, `Alle Ergebnisse für "${q.trim()}"`)}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
