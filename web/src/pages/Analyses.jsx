// Analiz listesi — /analiz
//
// NEDEN AYRI BIR BOLUM: sitedeki her sey (spec tablosu, fiyat) Epey'den geliyor
// ve onlarca Turk sitesinde birebir ayni duruyor. Analizler sitenin BASKA
// HICBIR YERDE BULUNMAYAN tek icerigi; blogun icine gomulse "rehber" ile
// karisir ve kendi arama niyetini kaybeder.
//
// Kayitlar admin panelinden TEK TEK yayina alinir (status='published').
// Otomatik doldurulmaz — bkz. web/scripts/gen-analysis.mjs basligi.
import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { pb } from '../lib/pocketbase';
import { useI18n } from '../i18n/index.jsx';
import { useSeo, SITE_URL, hreflangAlternates } from '../lib/seo';
import {
  analysisKind, analysisKindShort, analysisLead, analysisRenderLangs, analysisSubject,
  analysisSubjectNames, analysisTitle,
} from '../lib/analysisRecord';
import './Analyses.css';

// ── ON-RENDER TOHUMU ──────────────────────────────────────────────────────
//
// /analiz sayfasi ON-RENDER EDILIYOR (web/scripts/seo.mjs -> analizListeBody)
// ve liste HTML'in icinde hazir geliyor. Ama React devralinca `.seo-prerender`
// blogu gizleniyor (index.html, `.js-ready`), yani ekranda kalan tek sey PB
// istegi donene kadar suren "Yükleniyor…" oluyordu.
//
// OLCULDU 2026-08-28, canli PB, ilk sayfa (22 kayit / 22 KB):
//   TTFB 0,5-1,4 sn — ustune SPA acilisi binince okuyucu saniyelerce bos
//   sayfa goruyor, istek takilirsa "yükleniyor" HIC bitmiyordu.
//
// seo.mjs ayni veriyi head'e JSON olarak da gomuyor; burada okunup ILK
// state olarak kullaniliyor. Tohum, `analysisTitle`/`analysisLead`/
// `analysisRenderLangs` fonksiyonlarinin okudugu alan adlarini tasidigi icin
// asagida hicbir dallanma yok: kayit PB'den mi tohumdan mi geldi, sayfanin
// umurunda degil.
let _tohum = null;
function analizTohumu() {
  if (_tohum) return _tohum;
  _tohum = [];
  try {
    const el = typeof document !== 'undefined' && document.getElementById('qor-analiz-seed');
    if (el) {
      const v = JSON.parse(el.textContent || '[]');
      if (Array.isArray(v)) _tohum = v;
    }
  } catch { _tohum = []; }
  return _tohum;
}

// PB istegi ASILI KALABILIR (tek host, soguk baslangic). Fetch'in kendi zaman
// asimi yok; korumasiz birakilinca `finally` hic kosmuyor ve sayfa sonsuza
// dek "yükleniyor" diyor. Bu, kullanicinin bildirdigi "hiç yüklenmiyor"
// halinin ta kendisiydi.
const PB_TIMEOUT_MS = 12000;
function zamanAsimli(promise) {
  return Promise.race([
    promise,
    new Promise((_, red) => { setTimeout(() => red(new Error('timeout')), PB_TIMEOUT_MS); }),
  ]);
}

export default function Analyses() {
  const { lang } = useI18n();
  const L = (en, tr) => (lang === 'tr' ? tr : en);
  const tohum = analizTohumu();
  const [items, setItems] = useState(tohum);
  // Tohum varsa "yükleniyor" HIC gorunmez: liste ilk karede cizilir, PB
  // dogrulamasi arka planda kosar.
  const [loading, setLoading] = useState(tohum.length === 0);
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
  // BOS LISTE ile BASARISIZ ISTEK ayni sey degil. Eskiden `catch` items'i
  // bosaltiyordu ve sayfa "Henüz yayınlanmış analiz yok" diyordu — okuyucuya
  // yanlis bilgi, ve tekrar denemenin tek yolu sayfayi yenilemekti.
  const [hata, setHata] = useState(false);
  const [tekrar, setTekrar] = useState(0);

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

  // ── LISTE ALANLARI ────────────────────────────────────────────────────────
  //
  // OLCULDU 2026-08-25, canli PB, 24 kayitlik ilk sayfa:
  //   `fields` YOK  ->  836 KB / 631 ms
  //   asagidaki set ->   14 KB / 128 ms
  //
  // Fark tamamen `report_tr` + `report_en`: kayit basina ~45 KB'lik rapor
  // JSON'u indiriliyordu ve liste ondan TEK BIR SEY okuyor — "bu dilde rapor
  // var mi". Sayfa "yükleniyor da kalıyor" sikayetinin kaynagi buydu; yavas
  // baglantida 836 KB'lik istegin zaman asimi da yok.
  //
  // `report_*.type` / `.researched` / `.confidence` NOKTA YOLLARI: PB JSON
  // alaninin ALT ANAHTARINI dondurebiliyor. Uc anahtar birden isteniyor cunku
  // tek bir anahtar dort rapor seklinin hepsinde yok — urun/karsilastirma
  // `type` tasir, link/abonelik `researched` + `confidence` tasir. Alan
  // NULL ise PB `null` doner (bos obje degil), yani varlik testi guvenli.
  const LIST_FIELDS = [
    'id', 'slug', 'kind', 'category', 'productName', 'productBrand', 'productImage',
    'techScore', 'publishedAt', 'views', 'likes',
    'title_tr', 'title_en', 'lead_tr', 'lead_en', 'subjectNames',
    'report_tr.type', 'report_tr.researched', 'report_tr.confidence',
    'report_en.type', 'report_en.researched', 'report_en.confidence',
  ].join(',');

  useEffect(() => {
    let live = true;
    // Ekranda gosterilecek bir sey varsa (tohum ya da onceki deneme) beklemeye
    // dusmeyiz: liste durur, tazelenmesi sessizce arkada olur.
    setLoading((onceki) => (items.length ? false : onceki || true));
    setHata(false);
    zamanAsimli(pb.collection('analyses')
      .getList(1, SAYFA, { sort: '-publishedAt', fields: LIST_FIELDS, $autoCancel: false }))
      .then((r) => {
        if (!live) return;
        setItems(r.items || []);
        setDevam(r.page < r.totalPages);
      })
      // TOHUM SILINMEZ. Istek dustugunde elde duran listeyi bosaltmak,
      // okuyucuya "hic analiz yok" demek olurdu.
      .catch(() => { if (live) setHata(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tekrar]);

  const dahaGetir = () => {
    if (yukleniyorDaha) return;
    setYukleniyorDaha(true);
    pb.collection('analyses')
      .getList(sayfa + 1, SAYFA, { sort: '-publishedAt', fields: LIST_FIELDS, $autoCancel: false })
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
      {/* BOS LISTE ile BASARISIZ ISTEK ayni sey degil. Istek dustugunde
          "Henüz yayınlanmış analiz yok" yazmak okuyucuya YANLIS bilgi verir
          ve tekrar denemenin tek yolu sayfayi yenilemek olurdu. */}
      {!loading && !items.length && hata && (
        <p className="an-empty">
          {L('The analyses could not be loaded.', 'Analizler yüklenemedi.')}
          {' '}
          <button type="button" className="an-retry" onClick={() => setTekrar((n) => n + 1)}>
            {L('Try again', 'Tekrar dene')}
          </button>
        </p>
      )}
      {!loading && !items.length && !hata && (
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
          // KARSILASTIRMADA MARKA DEGIL URUNLERIN TAMAMI. `productBrand` yalniz
          // ILK urunun markasi; uc telefonluk kayit listede tek kelime
          // ("Samsung") olarak duruyordu ve basliktaki iki addan sonra ucuncu
          // urun satirda HIC gecmiyordu. Tek konulu analizlerde (urun/link)
          // ad zaten baslikta, orada marka bilgi katiyor — o yuzden ayrim
          // KONU SAYISINA gore, tur adina gore degil.
          const konular = analysisSubjectNames(a, lang);
          const govde = (
            <>
              {/* alt metni de KODSUZ: `productName` ham katalog adini tasiyor,
                  `analysisSubject` ise urun kodundan arindirilmis hali. */}
              {a.productImage ? (
                <img src={a.productImage} alt={analysisSubject(a, lang)} loading="lazy" />
              ) : null}
              <div>
                <h2>{analysisTitle(a, lang)}</h2>
                <p>{analysisLead(a, lang)}</p>
                <span className="an-meta">
                  <span className="an-kind">{analysisKindShort(a, lang)}</span>
                  {konular.length > 1 ? (
                    <span className="an-vs">
                      {/* Ayirac AD SPANININ DISINDA ve icinde GERCEK bosluk
                          tasiyor. Icine alinsaydi satirin tamami tek bir
                          kirilmaz dizi olurdu: adlar `nowrap`, aralarinda da
                          bosluk karakteri olmadigi icin tarayicinin
                          kirabilecegi hicbir nokta kalmiyor ve 390px ekranda
                          satir 623px'e tasiyordu. */}
                      {konular.map((ad, i) => (
                        <Fragment key={`${ad}-${i}`}>
                          {i > 0 ? <i aria-hidden="true"> vs </i> : null}
                          <span>{ad}</span>
                        </Fragment>
                      ))}
                    </span>
                  ) : a.productBrand ? <span>{a.productBrand}</span> : null}
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
