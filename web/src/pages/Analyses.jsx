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
import {
  analysisKind, analysisKindShort, analysisLead, analysisTitle,
} from '../lib/analysisRecord';
import './Analyses.css';

export default function Analyses() {
  const { lang } = useI18n();
  const L = (en, tr) => (lang === 'tr' ? tr : en);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  // Uc tur ayni listede durur; filtre yalnizca gorunumu daraltir (ayri rota
  // acmak dizine ince, neredeyse bos sayfalar eklerdi).
  const [tur, setTur] = useState('');

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

  const turler = ['product', 'link', 'subscription'].filter((k) => items.some((a) => analysisKind(a) === k));
  const gorunen = tur ? items.filter((a) => analysisKind(a) === tur) : items;
  // Filtre cipleri KISA adi kullanir: "Yapay Zeka Abonelik Analizi" bir cip
  // icin fazla uzun ve uc cip yan yana satiri dolduruyor.
  const turAdi = (k) => analysisKindShort({ kind: k }, lang);

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

      {turler.length > 1 && (
        <div className="an-filters">
          <button type="button" className={tur ? '' : 'on'} onClick={() => setTur('')}>
            {L('All', 'Tümü')}
          </button>
          {turler.map((k) => (
            <button key={k} type="button" className={tur === k ? 'on' : ''} onClick={() => setTur(k)}>
              {turAdi(k)}
            </button>
          ))}
        </div>
      )}

      <div className="an-list">
        {gorunen.map((a) => (
          <Link
            key={a.id}
            to={`/analiz/${a.slug}`}
            // Gorseli olmayan kayit (link/abonelik analizi) iki sutuna duser;
            // aksi halde metin 84px'lik gorsel sutununa sikisiyordu.
            className={`an-item${a.productImage ? '' : ' an-item-noimg'}`}
          >
            {a.productImage ? (
              <img src={a.productImage} alt={a.productName || ''} loading="lazy" />
            ) : null}
            <div>
              <h2>{analysisTitle(a, lang)}</h2>
              <p>{analysisLead(a, lang)}</p>
              <span className="an-meta">
                <span className="an-kind">{analysisKindShort(a, lang)}</span>
                {a.productBrand ? <span>{a.productBrand}</span> : null}
                {a.techScore ? <span className="an-score">Qor AI {a.techScore}/100</span> : null}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
