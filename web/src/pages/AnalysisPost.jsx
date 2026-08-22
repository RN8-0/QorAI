// Tek analiz sayfasi — /analiz/<slug>
//
// SAYFA KENDI GORUNUMUNU YAZMAZ. Urun sayfasinda "Analiz Et" dendiginde
// calisan raporun BIREBIR AYNISINI cizer: ayni bilesen (ProductFullReport),
// ayni veri sekli (`product_full_report`), ayni grafikler, ayni skor halkasi,
// ayni kritik noktalar / quiz etkisi / topluluk temalari.
//
// Ilk surumde buraya blog benzeri AYRI bir gorunum yazilmisti — yanlisti:
// yayinlanan analiz, urun sayfasinda calisan analizden farkli gorunuyordu.
// Ikinci bir gorunum tutmak iki tasarimin zamanla ayrismasi demek.
//
// Kayit ham raporu `analyses.report` alaninda tutar; admin paneli yalnizca
// hangi raporun YAYINDA oldugunu belirler.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { pb } from '../lib/pocketbase';
import { useI18n } from '../i18n/index.jsx';
import { useSeo, SITE_URL, hreflangAlternates, truncate } from '../lib/seo';
import { ProductFullReport } from '../components/AiAnalysis.jsx';
import './Analyses.css';

export default function AnalysisPost() {
  const { slug } = useParams();
  const { lang } = useI18n();
  const L = (en, tr) => (lang === 'tr' ? tr : en);
  const [a, setA] = useState(null);
  const [durum, setDurum] = useState('loading');

  useEffect(() => {
    let live = true;
    setDurum('loading');
    pb.collection('analyses')
      .getFirstListItem(`slug="${String(slug || '').replace(/"/g, '')}"`, { $autoCancel: false })
      .then((r) => { if (live) { setA(r); setDurum('ok'); } })
      .catch(() => { if (live) { setA(null); setDurum('yok'); } });
    return () => { live = false; };
  }, [slug]);

  const rapor = a && a.report && typeof a.report === 'object' && a.report.product ? a.report : null;
  const urunAdi = a ? (a.productName || '') : '';
  const manset = rapor?.product?.headline || '';
  const baslik = urunAdi ? `${urunAdi} — ${L('AI Analysis', 'Yapay Zekâ Analizi')}` : L('Analysis', 'Analiz');
  const faq = a ? (a[`faq_${lang}`] || a.faq_tr || a.faq_en || []) : [];

  useSeo({
    title: a ? truncate(baslik, 68) : L('Analysis', 'Analiz'),
    description: a ? truncate(manset || rapor?.product?.overallVerdict || '', 158) : '',
    path: `/analiz/${slug || ''}`,
    htmlLang: lang,
    image: a ? a.productImage : undefined,
    imageAlt: urunAdi,
    type: 'article',
    noindex: !a,
    alternates: hreflangAlternates(`/analiz/${slug || ''}`),
    jsonLd: a ? {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Article',
          '@id': `${SITE_URL}/analiz/${a.slug}#article`,
          headline: baslik,
          description: manset || undefined,
          image: a.productImage || undefined,
          datePublished: a.publishedAt || a.created,
          dateModified: a.updated,
          author: { '@type': 'Organization', name: 'Qor AI' },
          publisher: { '@type': 'Organization', name: 'Qor AI' },
          mainEntityOfPage: { '@id': `${SITE_URL}/analiz/${a.slug}#page` },
        },
        ...(faq.length ? [{
          '@type': 'FAQPage',
          '@id': `${SITE_URL}/analiz/${a.slug}#faq`,
          mainEntity: faq.map((f) => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: { '@type': 'Answer', text: f.a },
          })),
        }] : []),
        {
          '@type': 'BreadcrumbList',
          '@id': `${SITE_URL}/analiz/${a.slug}#breadcrumb`,
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Qor AI', item: `${SITE_URL}/` },
            { '@type': 'ListItem', position: 2, name: L('Analyses', 'Analizler'), item: `${SITE_URL}/analiz` },
            { '@type': 'ListItem', position: 3, name: baslik, item: `${SITE_URL}/analiz/${a.slug}` },
          ],
        },
      ],
    } : undefined,
  });

  if (durum === 'loading') return <main className="an-wrap"><p className="an-empty">{L('Loading…', 'Yükleniyor…')}</p></main>;
  if (!a) {
    return (
      <main className="an-wrap">
        <p className="an-empty">{L('Analysis not found.', 'Analiz bulunamadı.')}</p>
        <p className="an-back"><Link to="/analiz">{L('← All analyses', '← Tüm analizler')}</Link></p>
      </main>
    );
  }

  return (
    <main className="an-wrap an-post">
      <nav className="an-crumbs">
        <Link to="/">Qor AI</Link>{' › '}
        <Link to="/analiz">{L('Analyses', 'Analizler')}</Link>
      </nav>

      <h1>{baslik}</h1>

      <div className="an-strip">
        {a.productImage ? <img src={a.productImage} alt={urunAdi} /> : null}
        <div>
          <strong>{urunAdi}</strong>
          <div className="an-meta">
            {a.productBrand ? <span>{a.productBrand}</span> : null}
            {a.techScore ? <span className="an-score">Qor AI {a.techScore}/100</span> : null}
          </div>
          {a.productSlug ? (
            <Link to={`/product/${a.productSlug}`}>
              {L('View product page →', 'Ürün sayfasına git →')}
            </Link>
          ) : null}
        </div>
      </div>

      {/* Urun sayfasindaki raporun AYNISI — ayni bilesen, ayni grafikler. */}
      {rapor
        ? <ProductFullReport data={rapor} L={L} lang={lang} />
        : <p className="an-empty">{L('This analysis has no report data.', 'Bu analizde rapor verisi yok.')}</p>}

      <p className="an-back"><Link to="/analiz">{L('← All analyses', '← Tüm analizler')}</Link></p>
    </main>
  );
}
