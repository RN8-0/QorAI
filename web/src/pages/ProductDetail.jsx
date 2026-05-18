import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getProduct } from '../lib/typesense';
import { useCompare } from '../lib/compare';
import { catMeta, scoreClass, scoreLabel, PLACEHOLDER_IMG } from '../lib/format';
import './ProductDetail.css';

export default function ProductDetail() {
  const { id } = useParams();
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
        <h2>Ürün bulunamadı</h2>
        <p>Bu ürün kaldırılmış ya da bağlantı hatalı olabilir.</p>
        <Link to="/catalog" className="btn btn-primary">Kataloğa Dön</Link>
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

  return (
    <div className="pd">
      <div className="container">
        <div className="pd-crumb">
          <Link to="/">Ana Sayfa</Link> <span>/</span>
          <Link to="/catalog">Katalog</Link> <span>/</span>
          <b>{p.name}</b>
        </div>

        {/* HERO */}
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
                <strong>Qor AI Teknik Skoru</strong>
                <span>Özellikler, gerçek yorumlar ve değere dayalı yapay zekâ puanı.</span>
              </div>
            </div>

            {subscores && (
              <div className="pd-subscores">
                {Object.entries(subscores).slice(0, 8).map(([k, v]) => {
                  const val = Math.max(0, Math.min(100, Number(v) || 0));
                  return (
                    <div className="pd-sub" key={k}>
                      <div className="pd-sub-row">
                        <span>{k}</span><b>{Math.round(val)}</b>
                      </div>
                      <div className="pd-sub-bar"><i style={{ width: `${val}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pd-actions">
              {has(p.id) ? (
                <>
                  <Link to="/compare" className="btn btn-primary">⚖️ Karşılaştırmayı Aç →</Link>
                  <button className="btn btn-ghost" onClick={() => toggle(p.id)}>✓ Listede</button>
                </>
              ) : (
                <button className="btn btn-primary"
                  onClick={() => { if (!toggle(p.id)) alert('En fazla 4 ürün karşılaştırabilirsin.'); }}>
                  ⚖️ Karşılaştırmaya Ekle
                </button>
              )}
              <button className="btn btn-ghost"
                onClick={() => window.dispatchEvent(new CustomEvent('qor-open-ai', {
                  detail: `${p.name} hakkında ne düşünüyorsun? Artıları ve eksileri neler?`,
                }))}>
                💬 Qor AI'a Sor
              </button>
            </div>
          </div>
        </div>

        {/* TABS */}
        <div className="pd-tabs">
          <button className={tab === 'specs' ? 'active' : ''} onClick={() => setTab('specs')}>
            Özellikler
          </button>
          <button className={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}>
            AI Analizi
          </button>
          <button className={tab === 'reviews' ? 'active' : ''} onClick={() => setTab('reviews')}>
            Yorumlar
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
                      <h4>👍 Artılar</h4>
                      <ul>{pros.map((x, i) => <li key={i}>{x}</li>)}</ul>
                    </div>
                  )}
                  {cons.length > 0 && (
                    <div className="pd-pc-col pd-cons">
                      <h4>👎 Eksiler</h4>
                      <ul>{cons.map((x, i) => <li key={i}>{x}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}

              {keySpecs && Object.keys(keySpecs).length > 0 && (
                <SpecBlock title="Öne Çıkan Özellikler" rows={Object.entries(keySpecs)} />
              )}

              {specSections &&
                Object.entries(specSections).map(([section, specs]) =>
                  specs && typeof specs === 'object' ? (
                    <SpecBlock key={section} title={section} rows={Object.entries(specs)} />
                  ) : null,
                )}

              {!keySpecs && !specSections && !p.description && (
                <div className="pd-note">Bu ürün için ayrıntılı özellik verisi henüz eklenmedi.</div>
              )}
            </div>
          )}

          {tab === 'ai' && (
            <div className="pd-note fade-up">
              🧠 Yapay zekâ analizi — bu ürün için kişiselleştirilmiş AI değerlendirmesi
              bir sonraki güncellemede burada olacak.
            </div>
          )}

          {tab === 'reviews' && (
            <div className="pd-note fade-up">
              💬 Kullanıcı yorumları ve değerlendirme — bir sonraki güncellemede burada olacak.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SpecBlock({ title, rows }) {
  const clean = rows.filter(([, v]) => v != null && String(v).trim() !== '');
  if (!clean.length) return null;
  return (
    <div className="pd-spec-block">
      <h3>{title}</h3>
      <div className="pd-spec-rows">
        {clean.map(([k, v]) => (
          <div className="pd-spec-row" key={k}>
            <span>{k}</span>
            <b>{String(v)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
