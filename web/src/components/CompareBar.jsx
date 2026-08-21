import { useEffect, useRef, useState } from 'react';
import { IconX } from './GlyphIcons.jsx';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCompare } from '../lib/compare';
import { useI18n } from '../i18n/index.jsx';
import { getProduct } from '../lib/typesense';
import ProductImg from './ProductImg.jsx';
import './CompareBar.css';

// Sticky bottom compare tray (Epey-style). Appears as soon as a product is
// queued; expands to show thumbnails + a Compare CTA. Hidden on the /compare
// page itself. Product thumbnails are fetched from the queued ids.
export default function CompareBar() {
  const { ids, remove, clear } = useCompare();
  const { lang } = useI18n();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(true);
  const [items, setItems] = useState([]);
  const kutu = useRef(null);
  const L = (en, tr) => (lang === 'tr' ? tr : en);

  // QOR BALONU BU CUBUGU ORTUYORDU. Olculdu (390x844): alt bar 84 px'e kadar,
  // cubuk `bottom: 64px`ten baslayip ~120'ye kadar cikiyor, balon ise
  // `bottom: 84px` + 58 px yukseklik ile 84–142 arasinda ve SAG kenarda —
  // yani tam olarak cubugun "Karsilastir" dugmesinin ustune biniyor
  // (kullanicinin profil ekran goruntusunde gorunen sey bu).
  // Cubugun GERCEK yuksekligi bir CSS degiskenine yaziliyor; balon da o kadar
  // yukari kayiyor. Sabit bir sayi yeterli olmazdi: cubuk mobilde satir
  // kaydiriyor (kucuk resimler alt satira geciyor) ve yuksekligi urun sayisina
  // gore degisiyor, ayrica katlanip acilabiliyor.
  useEffect(() => {
    const el = kutu.current;
    const kok = document.documentElement;
    if (!el) { kok.style.removeProperty('--cmpbar-h'); return undefined; }
    document.body.classList.add('qor-cmpbar-open');
    const yaz = () => kok.style.setProperty('--cmpbar-h', `${Math.round(el.getBoundingClientRect().height)}px`);
    yaz();
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(yaz); ro.observe(el); }
    return () => {
      ro?.disconnect();
      document.body.classList.remove('qor-cmpbar-open');
      kok.style.removeProperty('--cmpbar-h');
    };
  }, [ids.length, open, loc.pathname]);

  useEffect(() => {
    let live = true;
    if (!ids.length) { setItems([]); return undefined; }
    Promise.all(ids.map((id) => getProduct(id).catch(() => null)))
      .then((rows) => { if (live) setItems(rows.filter(Boolean)); });
    return () => { live = false; };
  }, [ids.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ids.length || loc.pathname === '/compare') return null;
  const canCompare = ids.length >= 2;

  return (
    <div className={'cmpbar' + (open ? ' open' : '')} ref={kutu}>
      <div className="cmpbar-inner">
        <button className="cmpbar-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="7" height="16" rx="1.4" /><rect x="14" y="4" width="7" height="16" rx="1.4" />
          </svg>
          <span className="cmpbar-title">{L('Compare', 'Karşılaştır')}</span>
          <span className="cmpbar-count">{ids.length}</span>
          <svg className={'cmpbar-caret' + (open ? ' up' : '')} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><polyline points="6 9 12 15 18 9" /></svg>
        </button>

        {open && (
          <div className="cmpbar-items">
            {items.map((p) => (
              <div className="cmpbar-thumb" key={p.id} title={p.name}>
                <ProductImg src={p.imageUrl || (p.images && p.images[0])} alt={p.name} size="card" />
                <button className="cmpbar-x" onClick={() => remove(p.id)} aria-label={L('Remove', 'Kaldır')}><IconX size={13} width={2.6} /></button>
              </div>
            ))}
            {items.length < ids.length && <div className="cmpbar-thumb cmpbar-thumb-load"><span className="skel" /></div>}
          </div>
        )}

        <div className="cmpbar-actions">
          <button className="cmpbar-clear" onClick={clear}>{L('Clear', 'Temizle')}</button>
          <button className="cmpbar-go" disabled={!canCompare} onClick={() => nav('/compare')}>
            {L('Compare', 'Karşılaştır')}{canCompare ? ` (${ids.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
