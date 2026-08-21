// Analiz listesi — /analiz
//
// NEDEN AYRI BIR BOLUM: sitedeki her sey (spec tablosu, fiyat) Epey'den geliyor
// ve onlarca Turk sitesinde birebir ayni duruyor. Analizler sitenin BASKA
// HICBIR YERDE BULUNMAYAN tek icerigi; blogun icine gomulse "rehber" ile
// karisir ve kendi arama niyetini kaybeder.
//
// Kayitlar admin panelinden TEK TEK yayina alinir (status='published').
// Otomatik doldurulmaz — bkz. web/scripts/gen-analysis.mjs basligi.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { pb } from '../lib/pocketbase';
import { useI18n } from '../i18n/index.jsx';
import { useSeo, SITE_URL, hreflangAlternates } from '../lib/seo';
import './Analyses.css';

export default function Analyses() {
  const { lang } = useI18n();
  const L = (en, tr) => (lang === 'tr' ? tr : en);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useSeo({
    title: L('AI Product Analyses — Qor AI', 'Yapay Zekâ Ürün Analizleri — Qor AI'),
    description: L(
      'In-depth AI analyses of popular tech products: what the specs mean in daily use, strengths, weaknesses and who each product is actually for.',
      'Popüler teknoloji ürünlerinin derinlemesine yapay zekâ analizleri: özellikler günlük kullanımda ne anlama geliyor, güçlü ve zayıf yanları, kime uygun.',
    ),
    path: '/analiz',
    htmlLang: lang,
    alternates: hreflangAlternates('/analiz'),
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': `${SITE_URL}/analiz#page`,
      url: `${SITE_URL}/analiz`,
      name: L('AI Product Analyses', 'Yapay Zekâ Ürün Analizleri'),
    },
  });

  useEffect(() => {
    let live = true;
    pb.collection('analyses')
      .getList(1, 60, { sort: '-publishedAt', $autoCancel: false })
      .then((r) => { if (live) setItems(r.items || []); })
      .catch(() => { if (live) setItems([]); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const t = (a, f) => a[`${f}_${lang}`] || a[`${f}_en`] || a[`${f}_tr`] || '';

  return (
    <main className="an-wrap">
      <header className="an-head">
        <h1>{L('AI Product Analyses', 'Yapay Zekâ Ürün Analizleri')}</h1>
        <p>
          {L(
            'Every analysis is written from the product\'s real catalogue specs and reviewed before publishing.',
            'Her analiz ürünün gerçek katalog özelliklerinden yazılır ve yayınlanmadan önce gözden geçirilir.',
          )}
        </p>
      </header>

      {loading && <p className="an-empty">{L('Loading…', 'Yükleniyor…')}</p>}
      {!loading && !items.length && (
        <p className="an-empty">{L('No analyses published yet.', 'Henüz yayınlanmış analiz yok.')}</p>
      )}

      <div className="an-list">
        {items.map((a) => (
          <Link key={a.id} to={`/analiz/${a.slug}`} className="an-item">
            {a.productImage ? (
              <img src={a.productImage} alt={a.productName || ''} loading="lazy" />
            ) : null}
            <div>
              <h2>{t(a, 'title') || a.productName}</h2>
              <p>{t(a, 'lead')}</p>
              <span className="an-meta">
                {a.productBrand ? `${a.productBrand} · ` : ''}
                {a.techScore ? <span className="an-score">Qor AI {a.techScore}/100</span> : null}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
