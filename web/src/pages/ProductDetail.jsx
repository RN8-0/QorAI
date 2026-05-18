import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getProduct } from '../lib/typesense';
import { useCompare } from '../lib/compare';
import { useT } from '../i18n/index.jsx';
import { catMeta, scoreClass, scoreLabel, PLACEHOLDER_IMG } from '../lib/format';
import './ProductDetail.css';

// ─── Spec helpers ────────────────────────────────────────────────
const YES_RE = /^(yes|var|evet|true|ja|oui|sí|si|sim|tak|有り|نعم)$/i;
const NO_RE = /^(no|yok|hayır|hayir|nein|non|não|nao|nie|false|無し|لا)$/i;

// Icon for a spec section — fuzzy keyword match (TR + EN).
function sectionIcon(name) {
  const n = (name || '').toLowerCase();
  const has = (...k) => k.some((x) => n.includes(x));
  if (has('ekran', 'display', 'screen')) return '🖥️';
  if (has('batarya', 'pil', 'battery', 'güç', 'power')) return '🔋';
  if (has('kamera', 'camera')) return '📸';
  if (has('işlemci', 'islemci', 'processor', 'chip', 'cpu')) return '🧠';
  if (has('grafik', 'graphic', 'gpu', 'ekran kart')) return '🎮';
  if (has('bağlant', 'baglant', 'connect', 'i/o', 'ağ', 'network')) return '🔌';
  if (has('bellek', 'memory', 'ram', 'depolama', 'storage')) return '💾';
  if (has('tasarım', 'tasarim', 'design', 'boyut', 'dimension', 'ölçü')) return '📐';
  if (has('ses', 'audio', 'hoparlör', 'speaker')) return '🔊';
  if (has('sensör', 'sensor')) return '📡';
  if (has('işletim', 'isletim', 'os', 'yazılım', 'software')) return '💻';
  if (has('soğut', 'sogut', 'cooling')) return '❄️';
  if (has('özellik', 'ozellik', 'feature')) return '✨';
  if (has('temel', 'genel', 'general', 'core')) return 'ℹ️';
  return '📋';
}

export default function ProductDetail() {
  const { id } = useParams();
  const t = useT();
  const { has, toggle } = useCompare();
  const [p, setP] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('specs');
  const [activeImg, setActiveImg] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    getProduct(id)
      .then((prod) => { if (live) { setP(prod); setActiveImg(0); setTab('specs'); } })
      .catch(() => {})
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [id]);

  if (loading) {
    return (
      <div className="container pd">
        <div className="pd-top">
          <div className="skel pd-skel-img" />
          <div style={{ flex: 1 }}>
            <div className="skel" style={{ height: 14, width: '30%' }} />
            <div className="skel" style={{ height: 30, width: '75%', marginTop: 12 }} />
            <div className="skel" style={{ height: 80, width: '100%', marginTop: 18 }} />
          </div>
        </div>
      </div>
    );
  }

  if (!p) {
    return (
      <div className="container pd-missing">
        <div className="pd-missing-icon">🔍</div>
        <h2>{t('pd.notFound')}</h2>
        <p>{t('pd.notFoundDesc')}</p>
        <Link to="/catalog" className="btn btn-primary">{t('pd.backToCatalog')}</Link>
      </div>
    );
  }

  const meta = catMeta(p.category);
  const images = (Array.isArray(p.images) && p.images.length ? p.images : [p.imageUrl]).filter(Boolean);
  const subscores = p.techSubscores && typeof p.techSubscores === 'object' ? p.techSubscores : null;
  const specSections = p.specSections && typeof p.specSections === 'object' ? p.specSections : null;
  const keySpecs = p.keySpecs && typeof p.keySpecs === 'object' ? p.keySpecs : null;
  const pros = Array.isArray(p.pros) ? p.pros.filter(Boolean) : [];
  const cons = Array.isArray(p.cons) ? p.cons.filter(Boolean) : [];

  // Build the brick list: key specs first, then every spec section.
  const bricks = [];
  if (keySpecs && Object.keys(keySpecs).length > 0) {
    bricks.push({ title: t('pd.keySpecs'), icon: '⭐', rows: Object.entries(keySpecs) });
  }
  if (specSections) {
    for (const [section, specs] of Object.entries(specSections)) {
      if (specs && typeof specs === 'object') {
        bricks.push({ title: section, icon: sectionIcon(section), rows: Object.entries(specs) });
      }
    }
  }

  return (
    <div className="pd">
      <div className="container">
        <div className="pd-crumb">
          <Link to="/">{t('nav.home')}</Link> <span>/</span>
          <Link to="/catalog">{t('nav.catalog')}</Link> <span>/</span>
          <b>{p.name}</b>
        </div>

        <div className="pd-top">
          <div className="pd-gallery">
            <div className="pd-main-img">
              <img src={images[activeImg] || PLACEHOLDER_IMG} alt={p.name}
                onError={(e) => { e.currentTarget.src = PLACEHOLDER_IMG; }} />
            </div>
            {images.length > 1 && (
              <div className="pd-thumbs">
                {images.slice(0, 6).map((src, i) => (
                  <button key={i} className={'pd-thumb' + (i === activeImg ? ' active' : '')}
                    onClick={() => setActiveImg(i)}>
                    <img src={src} alt="" onError={(e) => { e.currentTarget.src = PLACEHOLDER_IMG; }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="pd-info">
            <span className="pd-cat">{meta.icon} {meta.label}</span>
            {p.brand && <div className="pd-brand">{p.brand}</div>}
            <h1 className="pd-name">{p.name}</h1>

            <div className="pd-score-box">
              <div className={'pd-score-ring ' + scoreClass(p.techScore)}>
                <b>{scoreLabel(p.techScore)}</b>
                <small>/ 100</small>
              </div>
              <div className="pd-score-text">
                <strong>{t('pd.scoreTitle')}</strong>
                <span>{t('pd.scoreDesc')}</span>
              </div>
            </div>

            {subscores && (
              <div className="pd-subscores">
                {Object.entries(subscores).slice(0, 8).map(([k, v]) => {
                  const val = Math.max(0, Math.min(100, Number(v) || 0));
                  return (
                    <div className="pd-sub" key={k}>
                      <div className="pd-sub-row"><span>{k}</span><b>{Math.round(val)}</b></div>
                      <div className="pd-sub-bar"><i style={{ width: `${val}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pd-actions">
              {has(p.id) ? (
                <>
                  <Link to="/compare" className="btn btn-primary">{t('pd.openCompare')}</Link>
                  <button className="btn btn-ghost" onClick={() => toggle(p.id)}>{t('pd.inList')}</button>
                </>
              ) : (
                <button className="btn btn-primary"
                  onClick={() => { if (!toggle(p.id)) alert(t('pd.maxAlert', { max: 4 })); }}>
                  {t('pd.addCompare')}
                </button>
              )}
              <button className="btn btn-ghost"
                onClick={() => window.dispatchEvent(new CustomEvent('qor-open-ai', {
                  detail: t('pd.askAiQuestion', { name: p.name }),
                }))}>
                {t('pd.askAi')}
              </button>
            </div>
          </div>
        </div>

        <div className="pd-tabs">
          <button className={tab === 'specs' ? 'active' : ''} onClick={() => setTab('specs')}>
            {t('pd.tabSpecs')}
          </button>
          <button className={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}>
            {t('pd.tabAi')}
          </button>
          <button className={tab === 'reviews' ? 'active' : ''} onClick={() => setTab('reviews')}>
            {t('pd.tabReviews')}
          </button>
        </div>

        <div className="pd-tab-body">
          {tab === 'specs' && (
            <div className="pd-specs fade-up">
              {p.description && <p className="pd-desc">{p.description}</p>}

              {(pros.length > 0 || cons.length > 0) && (
                <div className="pd-pc">
                  {pros.length > 0 && (
                    <div className="pd-pc-col pd-pros">
                      <h4>{t('pd.pros')}</h4>
                      <ul>{pros.map((x, i) => <li key={i}>{x}</li>)}</ul>
                    </div>
                  )}
                  {cons.length > 0 && (
                    <div className="pd-pc-col pd-cons">
                      <h4>{t('pd.cons')}</h4>
                      <ul>{cons.map((x, i) => <li key={i}>{x}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}

              {bricks.length > 0 ? (
                <div className="pd-bricks">
                  {bricks.map((b, i) => <SpecBrick key={i} brick={b} />)}
                </div>
              ) : (
                !p.description && <div className="pd-note">{t('pd.noSpecs')}</div>
              )}
            </div>
          )}

          {tab === 'ai' && <div className="pd-note fade-up">{t('pd.aiSoon')}</div>}
          {tab === 'reviews' && <div className="pd-note fade-up">{t('pd.reviewsSoon')}</div>}
        </div>
      </div>
    </div>
  );
}

// One spec section — admin-panel "brick": coloured header + key/value rows.
function SpecBrick({ brick }) {
  const rows = brick.rows.filter(([, v]) => v != null && String(v).trim() !== '');
  if (!rows.length) return null;
  return (
    <div className="pd-brick">
      <div className="pd-brick-head">
        <span>{brick.icon}</span> {brick.title}
      </div>
      <div className="pd-brick-body">
        {rows.map(([k, v]) => {
          const s = String(v).trim();
          const yes = YES_RE.test(s);
          const no = NO_RE.test(s);
          const lines = s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
          return (
            <div className="pd-srow" key={k}>
              <div className="pd-sk">{k}</div>
              <div className={'pd-sv' + (yes ? ' yes' : no ? ' no' : '')}>
                {yes ? `✓ ${s}` : no ? `✗ ${s}`
                  : lines.length > 1
                    ? lines.map((ln, i) => <div key={i} className="pd-sv-line">{ln}</div>)
                    : s}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
