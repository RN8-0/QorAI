// Tek analiz sayfasi — /analiz/<slug>
//
// Sayfa Article + FAQPage semasi tasir. FAQ bloklari admin panelinde elle
// duzenlenir ve insanlarin arama kutusuna GERCEKTEN yazdigi sorulari hedefler
// ("batarya omru nasil", "oyun icin uygun mu") — sayfa basliklarinin tekrari
// degil. Uzun kuyruk trafigin girisi bu.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { pb } from '../lib/pocketbase';
import { useI18n } from '../i18n/index.jsx';
import { useSeo, SITE_URL, hreflangAlternates, truncate } from '../lib/seo';
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

  const t = (f) => (a ? (a[`${f}_${lang}`] || a[`${f}_en`] || a[`${f}_tr`] || '') : '');
  const faq = a ? (a[`faq_${lang}`] || a.faq_en || a.faq_tr || []) : [];
  const baslik = t('title') || (a ? a.productName : '');

  useSeo({
    title: a ? truncate(t('metaTitle') || baslik, 68) : L('Analysis', 'Analiz'),
    description: a ? truncate(t('metaDescription') || t('lead'), 158) : '',
    path: `/analiz/${slug || ''}`,
    htmlLang: lang,
    image: a ? a.productImage : undefined,
    imageAlt: a ? a.productName : undefined,
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
          description: t('lead'),
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
        <p><Link to="/analiz">{L('← All analyses', '← Tüm analizler')}</Link></p>
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
      {t('lead') && <p className="an-lead">{t('lead')}</p>}

      <div className="an-strip">
        {a.productImage && <img src={a.productImage} alt={a.productName || ''} />}
        <div>
          <strong>{a.productName}</strong>
          <div className="an-meta">
            {a.productBrand ? `${a.productBrand} · ` : ''}
            {a.techScore ? <span className="an-score">Qor AI {a.techScore}/100</span> : null}
          </div>
          {a.productSlug && (
            <Link to={`/product/${a.productSlug}`}>
              {L('View product page →', 'Ürün sayfasına git →')}
            </Link>
          )}
        </div>
      </div>

      {/* Govde admin panelinde uretilir/duzenlenir; izin verilen etiketler
          h2/h3/p/ul/li/strong/em (analysis_prompt.js analizHtml). */}
      <article className="an-body" dangerouslySetInnerHTML={{ __html: t('body') }} />

      {t('verdict') && (
        <section className="an-verdict">
          <h2>{L('Verdict', 'Sonuç')}</h2>
          <div dangerouslySetInnerHTML={{ __html: t('verdict') }} />
        </section>
      )}

      {!!faq.length && (
        <section className="an-faq">
          <h2>{L('Frequently asked questions', 'Sık sorulan sorular')}</h2>
          {faq.map((f, i) => (
            <div key={i}>
              <h3>{f.q}</h3>
              <p>{f.a}</p>
            </div>
          ))}
        </section>
      )}

      <p style={{ marginTop: 24 }}>
        <Link to="/analiz">{L('← All analyses', '← Tüm analizler')}</Link>
      </p>
    </main>
  );
}
