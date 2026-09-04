// Tek analiz sayfasi — /analiz/<slug> (ve /tr/analiz/<slug>)
//
// SAYFA KENDI GORUNUMUNU YAZMAZ. Urun sayfasinda "Analiz Et" dendiginde
// calisan raporun BIREBIR AYNISINI cizer: ayni bilesen, ayni sarmalayici
// (`.page > .container`, 1240px), ayni stil dosyasi (LinkAnalysis.css'teki
// `la-*` sinifları), ayni grafikler, ayni skor halkasi.
//
// GECMIS HATA — iki tanesi birden:
//   1. Sayfa `an-wrap { max-width:760px }` icinde ciziliyordu; urun sayfasindaki
//      analiz ise 1240px'lik container icinde. Ayni rapor iki farkli genislikte
//      iki farkli tasarim gibi goruunuyordu.
//   2. `la-*` stillerini tasiyan LinkAnalysis.css HIC import edilmiyordu
//      (AiReportView CSS'ini bilerek import etmiyor — bkz. o dosyadaki not),
//      yani rapor STILSIZ cikiyordu. Bu iki satirin toplami "sitedeki analizle
//      alakasi yok" goruntusuydu.
//
// Uc tur de yayinlanabilir: urun / link / abonelik. Fark yalnizca VERI
// SEKLINDE ve o fark lib/analysisRecord.js icinde tek yerde kapatiliyor.
import { Suspense, lazy, useEffect, useState } from 'react';

/* ── PB ISTEGI ASILI KALABILIR ────────────────────────────────────────────
   Tek host, soguk baslangic; fetch'in kendi zaman asimi yok. Korumasiz
   birakilinca `.then`/`.catch` HIC kosmuyor ve sayfa sonsuza dek
   "Yükleniyor…" diyor — kullanicinin "tıklanınca yükleniyor diyor ama sayfa
   gelmiyor" dedigi hal buydu.

   Ayni ders LISTE sayfasinda (pages/Analyses.jsx) ogrenilmis ve orada
   `zamanAsimli` ile kapatilmisti; TEK ANALIZ sayfasina uygulanmamisti. */
const PB_TIMEOUT_MS = 12000;
function zamanAsimli(promise) {
  return Promise.race([
    promise,
    new Promise((_, red) => { setTimeout(() => red(new Error('timeout')), PB_TIMEOUT_MS); }),
  ]);
}
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { pb } from '../lib/pocketbase';
import { getProduct } from '../lib/typesense';
import {
  amazonGoPath, formatPriceAmount, priceForCountry,
} from '../lib/format';
import { fetchProductOffers } from '../lib/offers';
import OfferList from '../components/OfferList.jsx';
import { useGeoCountry } from '../lib/geo';
import { useI18n } from '../i18n/index.jsx';
import { useSeo, SITE_URL, SEO_DEFAULT_LOCALE, truncate } from '../lib/seo';
import AiAnalysisView, { ProductFullReport } from '../components/AiAnalysis.jsx';
import AiReportView from '../components/AiReportView.jsx';
// Abonelik ve karsilastirma raporlari ORTAK sablonu kullanamiyor (veri sekli
// gercekten farkli), o yuzden kendi bilesenlerini cizerler. Ikisi de sitede
// zaten var olan bilesenler — burada IKINCI bir gorunum yazilmadi.
//
// TEMBEL: her ikisi de agir (Subscriptions.css + LinkAnalysis sayfa agaci) ve
// yayinlanan analizlerin cogu URUN analizi olacak; urun raporu icin bu
// agaclari indirmenin anlami yok.
const SubscriptionReportView = lazy(() => import('../components/SubscriptionReportView.jsx'));
const CompareResult = lazy(() => import('../pages/LinkAnalysis.jsx').then((m) => ({ default: m.CompareResult })));
import {
  analysisFaq, analysisKind, analysisKindShort, analysisLead, analysisMetaDescription,
  analysisMetaTitle, analysisQuiz, analysisQuizHidden, analysisRenderLangs, analysisReport, analysisSentimentIndex, analysisSubject,
  analysisTitle, analysisUnified,
} from '../lib/analysisRecord';
import { SentimentProvider } from '../lib/sentiment.jsx';
import './Analyses.css';
// `la-*` sinifları burada YASAR. AiReportView paylasilan modul oldugu icin
// CSS'ini kendisi import etmiyor; kullanan SAYFA import eder.
import './LinkAnalysis.css';


export default function AnalysisPost() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  // ?id=<kayit> — ADMIN ONIZLEMESI. Admin paneli raporu KENDI cizmez, sitedeki
  // bu sayfayi iframe icinde gosterir; ikinci bir rapor gorunumu tutmak iki
  // tasarimin ayrismasi demek (proje bu dersi bir kez odedi).
  //
  // Taslak kayit `getFirstListItem` ile GELMEZ: listRule yalniz yayinda
  // olanlari donduruyor. viewRule herkese acik oldugu icin `getOne(id)`
  // taslagi da getirir — yayin kapisi listRule'da kaliyor, yani taslak
  // adresten TAHMIN EDILEREK bulunamaz, yalnizca id bilinerek acilir.
  const onizlemeId = String(params.get('id') || '').trim();
  const { lang, t } = useI18n();
  const L = (en, tr) => (lang === 'tr' ? tr : en);
  const [a, setA] = useState(null);
  const [durum, setDurum] = useState('loading');
  // "Tekrar dene" bunu artirir; fetch effect'i yeniden kosar.
  const [tekrar, setTekrar] = useState(0);

  useEffect(() => {
    let live = true;
    setDurum('loading');
    const istek = onizlemeId
      ? pb.collection('analyses').getOne(onizlemeId, { $autoCancel: false })
      : pb.collection('analyses')
        .getFirstListItem(`slug="${String(slug || '').replace(/"/g, '')}"`, { $autoCancel: false });
    zamanAsimli(istek)
      .then((r) => { if (live) { setA(r); setDurum('ok'); } })
      /* ZAMAN ASIMI ile GERCEKTEN YOK AYRI SEY.
         Ikisini de 'yok' saymak, PB takildiginda okuyucuya "Analiz
         bulunamadı" diye YANLIS bilgi verirdi; bu sayfa cogu zaman
         ON-RENDER edilmis, yani icerik gercekten var. */
      .catch((e) => {
        if (!live) return;
        setA(null);
        setDurum(e && e.message === 'timeout' ? 'zamanasimi' : 'yok');
      });
    return () => { live = false; };
  }, [slug, onizlemeId, tekrar]);

  // ── SAYFA DILI ile RAPOR DILI AYRISAMAZ ────────────────────────────────
  //
  // `analysisReport()` istenen dilde rapor yoksa OTEKI dile duser. Bu, raporu
  // hic gostermemekten iyi olabilir ama sayfa cevresi (basliklar, rozetler,
  // "Good for you" / "Watch outs") sayfanin DILINDE ciziliyor: sonuc Ingilizce
  // kabuk + Turkce rapor oluyordu. Canli ornek: /analiz/apple-iphone-17-pro-512gb
  // — kaydin `report_en`'i YOK, ON-RENDER o adresi hic uretmiyor, ama SPA
  // rotasi yine de aciliyordu.
  //
  // Cozum: o dilde rapor yoksa raporu OLAN dile YONLENDIR. Boylece adres
  // kumesi on-render'in urettigiyle ayni kalir ve okuyucu tek dilde bir sayfa
  // gorur. Yonlendirme `replace` cunku geri tusu kirilmamali.
  const mevcutDiller = a ? analysisRenderLangs(a, SEO_DEFAULT_LOCALE) : [];
  const dilYok = Boolean(a) && mevcutDiller.length > 0 && !mevcutDiller.includes(lang);
  const hedefDil = dilYok ? mevcutDiller[0] : lang;

  useEffect(() => {
    if (!dilYok || onizlemeId) return;
    // Dil onegi BrowserRouter `basename`'inden geliyor, yani rota degil ADRES
    // degismeli: tam sayfa gecisi.
    const onek = hedefDil === SEO_DEFAULT_LOCALE ? '' : `/${hedefDil}`;
    window.location.replace(`${onek}/analiz/${slug || ''}`);
  }, [dilYok, hedefDil, slug, onizlemeId]);

  // PB'DE FIYAT VARSA RAPORDA DA GORUNSUN. Analiz kaydi fiyat tasimiyor
  // (yalniz `productId`); urunun kendisi Typesense'te. Tek ek istek, yalnizca
  // urun analizinde ve yalnizca id varsa. Fiyat yoksa hicbir sey cizilmez.
  const [fiyat, setFiyat] = useState(null);
  // URUN KAYDI ve TEKLIFLER — analiz sayfasinda SATIN ALMA YOLU yoktu.
  //
  // Olculdu (2026-09-01): 19 analiz sayfasinin hicbirinde magaza linki yok.
  // `AiReportView` bir `StoreCta` ciziyor ama o yalnizca raporun kendisinde
  // AMAZON URL'i olan akislarda (link analizi) calisiyor; urun analizinde
  // boyle bir alan yok, dolayisiyla dugme sessizce hic gorunmuyordu.
  //
  // Trafigi getiren sayfalar bunlar ve gelir modeli affiliate. Karar
  // verdirip okuyucuyu bos birakan bir sayfa, isini yarim yapiyor.
  // YENI BILESEN YAZILMADI: urun sayfasindaki `OfferList` aynen kullaniliyor
  // (siralama saf ucuzdan pahaliya, Amazon sabitlenmez).
  const [urun, setUrun] = useState(null);
  const [teklifler, setTeklifler] = useState([]);
  const geoCountry = useGeoCountry();
  // ── FIYATIN ULKESI ────────────────────────────────────────────────────────
  // TEK KAYNAK: ziyaretcinin baglandigi ulke. Elle secici 2026-09-02'de
  // kaldirildi — urun sayfasinda da kaldirildi, iki sayfa ayni kurali
  // konusuyor. Amazon linki de ayni ulkenin vitrinine gider.
  const ulke = String(geoCountry || '').toUpperCase();
  useEffect(() => {
    let live = true;
    const pid = a && a.productId ? String(a.productId) : '';
    if (!pid || !ulke) { setFiyat(null); setUrun(null); setTeklifler([]); return undefined; }
    getProduct(pid)
      .then((p) => {
        if (!live || !p) return;
        setUrun(p);
        // SECILI ULKENIN FIYATI YOKSA FIYAT YOKTUR.
        // Burada `lowestPriceUSD` yedegi vardi ve olculdu: Almanya secilince
        // iPhone 17 Pro "$3.324" gosteriyordu — bu Turkiye fiyatinin (116.219 TL)
        // dolara cevrilmis hali, Almanya'da boyle bir teklif YOK. Yani okuyucuya
        // kendi pazarinda gecerli olmayan bir fiyat vaat ediliyordu.
        const pc = priceForCountry(p, ulke);
        setFiyat(pc && pc.price > 0 ? pc : null);
      })
      .catch(() => { if (live) { setFiyat(null); setUrun(null); } });
    // Teklifler AYRI istek: fiyat kutusu Typesense'ten, magaza listesi PB'den
    // gelir (urun sayfasindaki ayrimin aynisi).
    fetchProductOffers(pid)
      .then((items) => { if (live) setTeklifler(items); })
      .catch(() => { if (live) setTeklifler([]); });
    return () => { live = false; };
  }, [a && a.productId, ulke]);

  const kind = a ? analysisKind(a) : 'product';
  const ham = a ? analysisReport(a, lang) : null;
  const unified = a ? analysisUnified(a, lang) : null;
  const konu = a ? analysisSubject(a, lang) : '';
  const baslik = a ? analysisTitle(a, lang) : L('Analysis', 'Analiz');
  const faq = a ? analysisFaq(a, lang) : [];
  const quiz = a ? analysisQuiz(a, lang) : [];
  // Govdedeki quiz blogunun gizlenip gizlenmeyecegi TEK KAYNAKTAN gelir
  // (analysisRecord.js). Onceden `quiz.length > 0` idi; kunye kapatilinca bu
  // ifade false'a dusuyor ve quiz kunyeden cikip GOVDENIN icinde yeniden
  // beliriyordu — tam olarak kaldirmak istedigimiz sey.
  const gizleQuiz = a ? analysisQuizHidden(a, lang) : true;
  const yol = `/analiz/${slug || ''}`;
  // hreflang, ON-RENDER'IN GERCEKTEN URETTIGI adresleri gostermek zorunda.
  // `hreflangAlternates()` her iki dili birden yazar; bir analizin yalnizca tek
  // dilde raporu varsa o kume var olmayan bir sayfayi alternatif diye gosterir.
  // Kural TEK YERDE: lib/analysisRecord.js -> analysisRenderLangs().
  const diller = a ? analysisRenderLangs(a, SEO_DEFAULT_LOCALE) : [];
  const dilAdresi = (l) => `${SITE_URL}${l === SEO_DEFAULT_LOCALE ? '' : `/${l}`}${yol}`;
  const alternates = diller.length
    ? [
      ...diller.map((l) => ({ hreflang: l, href: dilAdresi(l) })),
      { hreflang: 'x-default', href: dilAdresi(diller.includes(SEO_DEFAULT_LOCALE) ? SEO_DEFAULT_LOCALE : diller[0]) },
    ]
    : null;

  useSeo({
    title: a ? truncate(analysisMetaTitle(a, lang), 68) : L('Analysis', 'Analiz'),
    description: a ? truncate(analysisMetaDescription(a, lang), 158) : '',
    path: yol,
    htmlLang: lang,
    image: a ? a.productImage : undefined,
    imageAlt: konu,
    type: 'article',
    // Onizleme adresi (?id=) DIZINE GIRMEZ: ayni icerigin ikinci bir adresi
    // olurdu ve taslaklar da oradan gorunurdu.
    noindex: !a || Boolean(onizlemeId),
    alternates,
    jsonLd: a ? {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Article',
          '@id': `${SITE_URL}${yol}#article`,
          headline: baslik,
          description: analysisLead(a, lang) || undefined,
          image: a.productImage || undefined,
          datePublished: a.publishedAt || a.created,
          dateModified: a.updated,
          inLanguage: lang,
          author: { '@type': 'Organization', name: 'Qor AI' },
          publisher: { '@type': 'Organization', name: 'Qor AI' },
          mainEntityOfPage: { '@id': `${SITE_URL}${yol}#page` },
        },
        ...(faq.length ? [{
          '@type': 'FAQPage',
          '@id': `${SITE_URL}${yol}#faq`,
          mainEntity: faq.map((f) => ({
            '@type': 'Question',
            name: f.q,
            acceptedAnswer: { '@type': 'Answer', text: f.a },
          })),
        }] : []),
        {
          '@type': 'BreadcrumbList',
          '@id': `${SITE_URL}${yol}#breadcrumb`,
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Qor AI', item: `${SITE_URL}/` },
            { '@type': 'ListItem', position: 2, name: L('Analyses', 'Analizler'), item: `${SITE_URL}/analiz` },
            { '@type': 'ListItem', position: 3, name: baslik, item: `${SITE_URL}${yol}` },
          ],
        },
      ],
    } : undefined,
  });

  // Yonlendirme sirasinda KARISIK sayfayi bir an bile gosterme: efekt adresi
  // degistirene kadar yukleme durumunda kal.
  if (durum === 'loading' || dilYok) {
    return (
      <div className="page an-post">
        <div className="container"><p className="an-empty">{L('Loading…', 'Yükleniyor…')}</p></div>
      </div>
    );
  }
  /* ZAMAN ASIMI: "bulunamadı" DEMEZ. Icerik buyuk olasilikla duruyor,
     yalnizca istek donmedi — okuyucuya dogru sebebi ve tek tikla yeniden
     deneme yolunu ver. Sayfayi yenilemek zorunda birakmak, kullanicinin
     acikca sikayet ettigi seydi. */
  if (durum === 'zamanasimi') {
    return (
      <div className="page an-post">
        <div className="container">
          <p className="an-empty">
            {L('The analysis could not be loaded — the server did not respond in time.',
              'Analiz yüklenemedi — sunucu zamanında yanıt vermedi.')}
          </p>
          <div className="an-bar" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn btn-primary" onClick={() => setTekrar((n) => n + 1)}>
              {L('Try again', 'Tekrar dene')}
            </button>
            <Link className="btn btn-ghost" to="/analiz">{L('All analyses', 'Tüm analizler')}</Link>
          </div>
        </div>
      </div>
    );
  }
  if (!a) {
    return (
      <div className="page an-post">
        <div className="container">
          <p className="an-empty">{L('Analysis not found.', 'Analiz bulunamadı.')}</p>
          <p className="an-back"><Link to="/analiz">{L('← All analyses', '← Tüm analizler')}</Link></p>
        </div>
      </div>
    );
  }

  return (
    <div className="page an-post">
      {/* Urun sayfasiyla AYNI sarmalayici ve AYNI genislik. */}
      <div className="container" style={{ maxWidth: 1240 }}>
        <nav className="an-crumbs">
          <Link to="/">Qor AI</Link>{' › '}
          <Link to="/analiz">{L('Analyses', 'Analizler')}</Link>
        </nav>

        <h1>{baslik}</h1>

        <div className={`an-strip${a.productImage ? '' : ' an-strip-noimg'}`}>
          {a.productImage ? <img src={a.productImage} alt={konu} /> : null}
          <div>
            <strong>{konu}</strong>
            <div className="an-meta">
              <span className="an-kind">{analysisKindShort(a, lang)}</span>
              {a.productBrand ? <span>{a.productBrand}</span> : null}
              {a.techScore ? <span className="an-score">Qor AI {a.techScore}/100</span> : null}
              {/* KATALOG FIYATI KUNYEDE. Fiyat sayfada zaten vardi ama raporun
                  ICINDE, skor kutucuklarinin arasinda (AiReportView ->
                  StatTiles) — yani okuyucunun bir ekran kaydirmasi gerekiyordu
                  ve ustteki kunyeye bakan "fiyat yok" sanıyordu. Ayni `fiyat`
                  state'i besliyor, ikinci bir istek YOK.
                  ON-RENDER'A GIRMEZ: statik HTML gunlerce yasiyor, oraya
                  yazilan fiyat bayatlar (SEO Faz 0'da "fiyat vaadi" tam olarak
                  bu yuzden temizlenmisti). Rakam istemcide, canli katalogdan.
                  Bayatlik AYRIMI RENKLE DEGIL ETIKETLE — rakam her halukarda
                  `--price` (bkz. ProductCard.css, `.is-stale`). */}
              {fiyat && fiyat.price > 0 ? (
                <span className={`an-price${fiyat.stale ? ' is-stale' : ''}`}>
                  {formatPriceAmount(fiyat.price, fiyat.currency, lang)}
                  {fiyat.stale && fiyat.ageDays ? (
                    <small title={L('This price was not verified recently', 'Bu fiyat yakın zamanda doğrulanmadı')}>
                      {fiyat.ageDays} {L('d ago', 'gün önce')}
                    </small>
                  ) : null}
                </span>
              ) : null}
            </div>
            {kind === 'product' && a.productSlug ? (
              <Link to={`/product/${a.productSlug}`}>
                {L('View product page →', 'Ürün sayfasına git →')}
              </Link>
            ) : null}
          </div>
        </div>

        {/* ── FIYATLAR — URUN ADININ HEMEN ALTINDA ─────────────────────────
            Onceden raporun EN ALTINDAYDI: okuyucu karari verdikten sonra
            fiyati gormek icin butun analizi kaydirmak zorundaydi. Kompakt
            surum (`compact`) dikeyde yer kaplamasin diye. Ulke secici urun
            sayfasindakiyle AYNI kaynaktan besleniyor. */}
        {teklifler.length > 0 && (
          <section className="an-offers">
            <div className="an-offers-head">
              <h2>{L('Where to buy', 'Nereden alınır')}</h2>
            </div>
            <OfferList
              offers={teklifler}
              country={ulke}
              lang={lang}
              geoCountry={geoCountry}
              compact
              amazonHref={urun ? amazonGoPath(urun, ulke) : ''}
            />
          </section>
        )}

        {/* ANALIZI URETEN QUIZ — RAPORUN USTUNDE.
            Okuyucu quizi cozmedi; "92/100 uyum" kimin uyumu oldugu
            soylenmeden anlamsiz. Rapordaki "cevaplarin neyi degistirdi"
            blogu ayri bir soruyu yanitliyor (her cevap puani ne oynatti),
            o yuzden ikisi de duruyor. */}
        {quiz.length > 0 && (
          <section className="an-quiz">
            <h2>{L('Answers this analysis was built on', 'Bu analiz şu cevaplara göre yapıldı')}</h2>
            <ol>
              {quiz.map((q, i) => (
                <li key={i}>
                  {q.soru && <q>{q.soru}</q>}
                  {q.cevap && <b>{q.cevap}</b>}
                  {q.etki != null && q.etki !== 0 && (
                    <i className={q.etki > 0 ? 'up' : 'down'}>
                      {q.etki > 0 ? '+' : ''}{q.etki}
                    </i>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Sitede o analizi kim ciziyorsa BURADA DA O cizer:
              urun               -> ProductFullReport      (urun sayfasindaki)
              abonelik           -> SubscriptionReportView (Abonelikler sayfasindaki)
              urun karsilastirma -> AiAnalysisView         (Karsilastir sayfasindaki)
              link (2+ urun)     -> CompareResult          (Link Analizi sayfasindaki)
              link (tek urun)    -> AiReportView           (ortak sablon)
            Hicbiri icin ikinci bir gorunum yazilmadi.

            IKI FARKLI KARSILASTIRMA SEKLI VAR ve karistirilmalari sayfayi
            SESSIZCE bozuyordu:
              · link karsilastirmasi -> products[].score, winner.best,
                UST SEVIYE decisiveDifferences        -> CompareResult
              · urun karsilastirmasi -> products[].matchScore, comparison.*
                (type: compare_full_report)           -> AiAnalysisView
            Kosul yalnizca `Array.isArray(ham.products)` idi, yani ADMINDE
            uretilen her urun karsilastirmasi link gorunumune dusuyordu:
            butun puanlar 0, kazanan listenin ilki, farklar ve head-to-head
            hic gorunmuyordu. Ilginc olan, ON-RENDER'IN DOGRU cizmesiydi
            (scripts/seo.mjs -> anKarsilastirmaGovde `comparison.*` okuyor) —
            yani crawler saglam sayfayi, okuyucu bozugunu goruyordu. */}
        {/* DUYGU SAGLAYICISI RAPORUN TAMAMINI SARAR. Dort akis da (urun,
            karsilastirma, link, abonelik) ayni motoru okur — tur basina ayri
            sentiment fonksiyonu YOK (bkz. lib/sentiment.jsx). */}
        <SentimentProvider index={a ? analysisSentimentIndex(a, lang) : null}>
        <Suspense fallback={<p className="an-empty">{L('Loading…', 'Yükleniyor…')}</p>}>
          {kind === 'product' && ham?.product ? (
            <ProductFullReport data={ham} L={L} lang={lang} hideQuiz={gizleQuiz} techScore={a.techScore} priceInfo={fiyat} />
          ) : kind === 'subscription' && Array.isArray(ham?.services) ? (
            <SubscriptionReportView
              result={ham}
              winnerName={ham?.winner?.best || ham?.winner?.overall || ham?.winner?.name || ''}
              L={L}
              t={t}
              hideQuiz={gizleQuiz}
            />
          ) : (ham?.type === 'compare_full_report' || ham?.comparison) && Array.isArray(ham?.products) ? (
            /* hideQuiz: kunye USTTE ciziliyor. Onsuz ayni sorular her urunun
               raporunda bir daha cikardi (12 urun = 12 tekrar) ve on-render
               bunlari HIC cizmiyor — yani crawler ile okuyucu farkli sayfa
               gorurdu. Ayni prop urun/abonelik/link akislarinda da bu isi
               yapiyor. */
            <AiAnalysisView kind="compareFull" data={ham} lang={lang} hideQuiz={gizleQuiz} />
          ) : Array.isArray(ham?.products) ? (
            <CompareResult data={ham} L={L} lang={lang} hideQuiz={gizleQuiz} />
          ) : unified ? (
            <AiReportView data={unified} L={L} lang={lang} showHead={false} hideQuiz={gizleQuiz} />
          ) : (
            <p className="an-empty">{L('This analysis has no report data.', 'Bu analizde rapor verisi yok.')}</p>
          )}
        </Suspense>
        </SentimentProvider>


        <p className="an-back"><Link to="/analiz">{L('← All analyses', '← Tüm analizler')}</Link></p>
      </div>
    </div>
  );
}
