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
  analysisKind, analysisKindShort, analysisLead, analysisRenderLangs, analysisTitle,
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
  // ARAMA. Onceden yoktu: okuyucu istedigi urunun analizini ancak listeyi
  // gozle tarayarak bulabiliyordu. Filtreleme YEREL — sayfada duran kayitlar
  // uzerinde calisir, PB'ye her tusa basista istek atmaz.
  const [q, setQ] = useState('');
  // SAYFALAMA. `getList(1, 60)` sabit tavani vardi: 60'inci analizden sonrasi
  // hicbir yerden ULASILAMAZ oluyordu (sitemap'te var, sitede yok). Sayfa
  // sayfa yuklenir, "daha fazla" ile devam eder.
  const SAYFA = 24;
  const [sayfa, setSayfa] = useState(1);
  const [devam, setDevam] = useState(false);
  const [yukleniyorDaha, setYukleniyorDaha] = useState(false);

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
      .getList(1, SAYFA, { sort: '-publishedAt', $autoCancel: false })
      .then((r) => {
        if (!live) return;
        setItems(r.items || []);
        setDevam(r.page < r.totalPages);
      })
      .catch(() => { if (live) setItems([]); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const dahaGetir = () => {
    if (yukleniyorDaha) return;
    setYukleniyorDaha(true);
    pb.collection('analyses')
      .getList(sayfa + 1, SAYFA, { sort: '-publishedAt', $autoCancel: false })
      .then((r) => {
        setItems((o) => [...o, ...(r.items || [])]);
        setSayfa(r.page);
        setDevam(r.page < r.totalPages);
      })
      .catch(() => setDevam(false))
      .finally(() => setYukleniyorDaha(false));
  };

  const turler = ['product', 'compare', 'link', 'subscription'].filter((k) => items.some((a) => analysisKind(a) === k));
  // Arama urun adina, baslıga ve markaya bakar — okuyucu "s23" ya da "samsung"
  // yazip bulabilsin. Turkce kucultme sart: "İ".toLowerCase() noktali "i̇"
  // uretir ve "iphone" aramasi kendi baslıgini bulamaz.
  const kucult = (s) => String(s || '').toLocaleLowerCase('tr');
  const ara = kucult(q).trim();
  const gorunen = items
    .filter((a) => (tur ? analysisKind(a) === tur : true))
    .filter((a) => (ara
      ? [a.productName, a.productBrand, analysisTitle(a, lang), a.slug]
        .some((v) => kucult(v).includes(ara))
      : true));
  // Filtre cipleri KISA adi kullanir: "Yapay Zeka Abonelik Analizi" bir cip
  // icin fazla uzun ve uc cip yan yana satiri dolduruyor.
  const turAdi = (k) => analysisKindShort({ kind: k }, lang);

  // Kaydin RAPORU OLMAYAN dile link verme. Ornek: iPhone analizinin yalnizca
  // Turkce raporu var; Ingilizce sitede satiri gosterip `/analiz/<slug>`e
  // baglamak okuyucuyu Ingilizce kabuk + Turkce rapor karisimina goturuyordu
  // (AnalysisPost artik yonlendiriyor, ama en dogrusu ilk tiklamada dogru
  // adrese gitmek). Kural TEK YERDE: analysisRenderLangs().
  // Ayni dildeyse ROTA (Link), baska dildeyse ADRES (<a>) doner: BrowserRouter
  // `basename` ile kurulu, yani <Link> her zaman ICINDE bulundugu dilin
  // agacinda kalir — dil degistiren bir hedefi rota olarak veremeyiz.
  const analizAdresi = (a) => {
    const diller = analysisRenderLangs(a, 'en');
    if (!diller.length || diller.includes(lang)) {
      return { to: `/analiz/${a.slug}`, harici: false };
    }
    const hedef = diller[0];
    const onek = hedef === 'en' ? '' : `/${hedef}`;
    return { href: `${onek}/analiz/${a.slug}`, harici: true };
  };

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

      {!loading && items.length > 0 && (
        <div className="an-tools">
          <input
            type="search"
            className="an-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={L('Search by product or brand…', 'Ürün ya da marka ara…')}
            aria-label={L('Search analyses', 'Analizlerde ara')}
          />
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
        </div>
      )}

      {!loading && items.length > 0 && !gorunen.length && (
        <p className="an-empty">
          {L('No analysis matches that search.', 'Bu aramaya uyan analiz yok.')}
        </p>
      )}

      <div className="an-list">
        {gorunen.map((a) => {
          const hedef = analizAdresi(a);
          // Gorseli olmayan kayit (link/abonelik analizi) iki sutuna duser;
          // aksi halde metin 84px'lik gorsel sutununa sikisiyordu.
          const sinif = `an-item${a.productImage ? '' : ' an-item-noimg'}`;
          const govde = (
            <>
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
            </>
          );
          return hedef.harici
            ? <a key={a.id} href={hedef.href} className={sinif}>{govde}</a>
            : <Link key={a.id} to={hedef.to} className={sinif}>{govde}</Link>;
        })}
      </div>

      {/* Arama acikken "daha fazla" yaniltici olurdu: yerel filtre yalnizca
          YUKLENMIS kayitlara bakar, buton ise sonraki sayfayi getirir. */}
      {devam && !ara && (
        <div className="an-more">
          <button type="button" onClick={dahaGetir} disabled={yukleniyorDaha}>
            {yukleniyorDaha ? L('Loading…', 'Yükleniyor…') : L('Load more', 'Daha fazla')}
          </button>
        </div>
      )}
    </main>
  );
}
