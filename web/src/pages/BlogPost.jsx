import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { pb } from '../lib/pocketbase';
import { useI18n } from '../i18n/index.jsx';
import { useSeo, SITE_URL } from '../lib/seo';
import { productPath } from '../lib/routes';
import './Blog.css';

export default function BlogPost() {
  const { slug } = useParams();
  const { lang } = useI18n();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const [post, setPost] = useState(null);
  const [status, setStatus] = useState('loading');

  const pick = (a, f) => (a ? (a[`${f}_${lang}`] || a[`${f}_tr`] || a[`${f}_en`] || '') : '');

  useEffect(() => {
    let live = true;
    setStatus('loading');
    pb.collection('articles').getFirstListItem(`slug="${slug}" && status="published"`)
      .then((rec) => { if (live) { setPost(rec); setStatus('ok'); } })
      .catch(() => { if (live) setStatus('notfound'); });
    return () => { live = false; };
  }, [slug]);

  const title = pick(post, 'title');
  const lead = pick(post, 'lead');
  const body = pick(post, 'body');
  const cover = post?.cover || '';
  const products = Array.isArray(post?.products) ? post.products : [];
  const url = `${SITE_URL}/blog/${slug}`;

  useSeo({
    title: title ? `${title} | Qor AI` : 'Qor AI Blog',
    description: lead,
    image: cover || undefined,
    path: `/blog/${slug}`,
    type: 'article',
    noindex: status === 'notfound',
    jsonLd: post ? {
      '@context': 'https://schema.org',
      '@type': 'Article',
      '@id': `${url}#article`,
      headline: title,
      description: lead,
      ...(cover ? { image: [cover] } : {}),
      datePublished: post.created,
      dateModified: post.updated,
      author: { '@type': 'Organization', name: 'Qor AI' },
      publisher: { '@type': 'Organization', name: 'Qor AI', logo: { '@type': 'ImageObject', url: `${SITE_URL}/assets/qor_logo_512.png?v=20260605a` } },
      mainEntityOfPage: url,
    } : null,
  });

  if (status === 'notfound') {
    return (
      <div className="container blog-page">
        <div className="blog-hero"><h1>{L('Article not found', 'Yazı bulunamadı', 'Artikel nicht gefunden')}</h1></div>
        <Link to="/blog" className="btn btn-primary">{L('All guides', 'Tüm rehberler', 'Alle Ratgeber')}</Link>
      </div>
    );
  }
  if (status === 'loading') {
    return <div className="container blog-page"><div className="blog-article blog-card-skel" style={{ minHeight: 400 }} /></div>;
  }

  return (
    <div className="container blog-page">
      <article className="blog-article">
        <nav className="blog-crumb">
          <Link to="/">Qor AI</Link> › <Link to="/blog">{L('Blog', 'Blog', 'Blog')}</Link>
        </nav>
        <h1>{title}</h1>
        {lead ? <p className="blog-lead">{lead}</p> : null}
        {cover ? <div className="blog-cover"><img src={cover} alt={title} /></div> : null}

        {/* AI/admin-authored HTML body (h2/p/ul). Source is our own content. */}
        <div className="blog-body" dangerouslySetInnerHTML={{ __html: body }} />

        {products.length > 0 && (
          <section className="blog-products">
            <h2>{L('Featured products', 'Öne çıkan ürünler', 'Empfohlene Produkte')}</h2>
            <div className="blog-prod-grid">
              {products.filter((p) => p && p.id && p.name).map((p) => (
                <Link key={p.id} to={productPath({ id: p.id, slug: p.slug, name: p.name })} className="blog-prod-card">
                  {p.imageUrl ? <div className="blog-prod-img"><img src={p.imageUrl} alt={p.name} loading="lazy" /></div> : null}
                  <div className="blog-prod-info">
                    {p.brand ? <span className="blog-prod-brand">{p.brand}</span> : null}
                    <span className="blog-prod-name">{p.name}</span>
                    {p.techScore ? <span className="blog-prod-score">{p.techScore}/100</span> : null}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="blog-foot">
          <Link to="/blog" className="btn btn-ghost">{L('← All guides', '← Tüm rehberler', '← Alle Ratgeber')}</Link>
        </div>
      </article>
    </div>
  );
}
