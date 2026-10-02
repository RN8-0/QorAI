// Analiz listesi — /analiz
//
// NEDEN AYRI BIR BOLUM: sitedeki her sey (spec tablosu, fiyat) Epey'den geliyor
// ve onlarca Turk sitesinde birebir ayni duruyor. Analizler sitenin BASKA
// HICBIR YERDE BULUNMAYAN tek icerigi; blogun icine gomulse "rehber" ile
// karisir ve kendi arama niyetini kaybeder.
//
// Kayitlar admin panelinden TEK TEK yayina alinir (status='published').
// Otomatik doldurulmaz — bkz. web/scripts/gen-analysis.mjs basligi.
import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { pb } from '../lib/pocketbase';
import { useI18n } from '../i18n/index.jsx';
import { useSeo, SITE_URL, hreflangAlternates } from '../lib/seo';
import {
  analysisKind, analysisKindShort, analysisLead, analysisRenderLangs, analysisSubject,
  analysisSubjectNames, analysisTitle,
} from '../lib/analysisRecord';
import { categoryLabel } from '../lib/format';
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

/* Filtre cipleri de ON-RENDER'DAN gelir (seo.mjs -> qor-analiz-faset).
   Boylece cipler ilk karede cizilir ve istemci faset icin PB'ye HIC istek
   atmaz — o sorgu olculdu ve 1348 ms suruyordu. */
let _fasetTohum = null;
function analizFasetTohumu() {
  if (_fasetTohum) return _fasetTohum;
  _fasetTohum = { turler: [], kategoriler: [] };
  try {
    const el = typeof document !== 'undefined' && document.getElementById('qor-analiz-faset');
    if (el) {
      const v = JSON.parse(el.textContent || '{}');
      if (Array.isArray(v.turler) && Array.isArray(v.kategoriler)) _fasetTohum = v;
    }
  } catch { /* tohum yoksa PB'den ertelemeli cekilir */ }
  return _fasetTohum;
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
  /* KATEGORI FILTRESI (kullanici istegi, 2026-09-03): "ürün abonelik ne ise
     mesela akıllı telefon laptop tv gibi seçilince sadece o ürünler gelecek".
     Kayitta `category` zaten dolu; eksik olan yalnizca arayuzdu. */
  const [kategori, setKategori] = useState('');
  /* FASETLER PB'DEN, YUKLU SAYFADAN DEGIL.
     Onceden tur butonlari `items.some(...)` ile YUKLU 24 kayittan
     tureiliyordu: ilk sayfada karsilastirma kaydi yoksa "Karşılaştırma"
     butonu HIC basilmiyordu. Kullanicinin "bazen çıkıyor bazen çıkmıyor"
     dedigi ve mobilde de gorunmeyen sey buydu — olculdu 2026-09-03
     (canli /tr/analiz, 390px): `.an-filters` DOM'da hic yok.
     Fasetler tum yayindaki kayitlardan bir kez sayilir (iki alan, ~2 KB). */
  const [fasetler, setFasetler] = useState(analizFasetTohumu);
  // ARAMA. Onceden yoktu: okuyucu istedigi urunun analizini ancak listeyi
  // gozle tarayarak bulabiliyordu. Filtreleme YEREL — sayfada duran kayitlar
  // uzerinde calisir, PB'ye her tusa basista istek atmaz.
  const [q, setQ] = useState('');
  const aramaKutusu = useRef(null);
  /* ARAC CUBUGU YAPISKAN (2026-10-02).
     Arama kutusu `items.length > 0` iken ciziliyordu. Eslesmeyen bir arama
     PB'den bos liste donunce items bosaliyor, kutu DOM'dan SILINIYOR ve
     sayfa "Henüz yayınlanmış analiz yok" diyordu — okuyucunun yeniden
     yazabilecegi bir kutu kalmiyordu, tek cikis sayfayi yenilemekti.
     Yayinda analiz oldugu BIR KEZ bilindi mi (tohum, faset ya da dolu bir
     yanit) cubuk bir daha kalkmaz; bos sonuc "aramaya uyan yok" demektir. */
  const [analizVar, setAnalizVar] = useState(tohum.length > 0);
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

  /* FASET SAYIMI — ONCE TOHUM, GEREKIRSE PB.
     `seo.mjs` fasetleri build aninda head'e yaziyor: cipler ilk karede
     cikar ve istek atilmaz. Tohum yoksa (eski kabuk, yerel gelistirme)
     PB'ye dusulur — ama ERTELEYEREK: olculdu, bu sorgu 1348 ms suruyor
     (sayfadaki en yavas istek) ve listenin onune gecerse "geç yükleniyor"
     sikayetini buyutur. Once liste gelir, cipler saniyeler icinde eklenir. */
  useEffect(() => {
    if (fasetler.turler.length || fasetler.kategoriler.length) return undefined;
    let live = true;
    const zamanlayici = setTimeout(() => {
      pb.collection('analyses')
        .getFullList({ fields: 'kind,category', batch: 500, $autoCancel: false })
        .then((hepsi) => {
          if (!live) return;
          const t = new Set();
          const k = new Set();
          (hepsi || []).forEach((a) => {
            const tk = analysisKind(a);
            if (tk) t.add(tk);
            if (a.category) k.add(a.category);
          });
          setFasetler({
            turler: ['product', 'compare', 'link', 'subscription'].filter((x) => t.has(x)),
            kategoriler: [...k].sort(),
          });
        })
        .catch(() => { /* faset yoksa filtre cubugu cizilmez, liste calisir */ });
    }, 1200);
    return () => { live = false; clearTimeout(zamanlayici); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ARAMA DEBOUNCE. Her tusa PB istegi atmak tek hostu gereksiz yorar. */
  const [araGec, setAraGec] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setAraGec(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  /* PB FILTRESI — ARAMA VE FILTRE ARTIK SUNUCUDA.
     Onceden ikisi de YERELDI: yalnizca yuklu 24 kayit uzerinde calisiyordu.
     Olculdu 2026-09-03: PB'de 86 yayinda analiz var, sayfada 24 duruyordu ve
     "15 plus" aramasi "Eşleşen analiz yok" diyordu — kayit 3. sayfadaydi.
     Kullanicinin "iphone 15 plus var ama yok" dedigi buydu. */
  const pbFiltresi = () => {
    const parcalar = [];
    if (tur) parcalar.push(`kind = ${JSON.stringify(tur)}`);
    if (kategori) parcalar.push(`category = ${JSON.stringify(kategori)}`);
    if (araGec) {
      const s = JSON.stringify(`%${araGec}%`);
      parcalar.push(`(productName ~ ${s} || productBrand ~ ${s} || title_tr ~ ${s} || title_en ~ ${s} || slug ~ ${s})`);
    }
    return parcalar.join(' && ');
  };

  useEffect(() => {
    let live = true;
    // Ekranda gosterilecek bir sey varsa (tohum ya da onceki deneme) beklemeye
    // dusmeyiz: liste durur, tazelenmesi sessizce arkada olur.
    setLoading((onceki) => (items.length ? false : onceki || true));
    setHata(false);
    const filtre = pbFiltresi();
    setSayfa(1);
    zamanAsimli(pb.collection('analyses')
      .getList(1, SAYFA, { sort: '-publishedAt', fields: LIST_FIELDS, filter: filtre, $autoCancel: false }))
      .then((r) => {
        if (!live) return;
        setItems(r.items || []);
        setDevam(r.page < r.totalPages);
        if ((r.items || []).length) setAnalizVar(true);
      })
      // TOHUM SILINMEZ. Istek dustugunde elde duran listeyi bosaltmak,
      // okuyucuya "hic analiz yok" demek olurdu.
      .catch(() => { if (live) setHata(true); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tekrar, tur, kategori, araGec]);

  const dahaGetir = () => {
    if (yukleniyorDaha) return;
    setYukleniyorDaha(true);
    pb.collection('analyses')
      .getList(sayfa + 1, SAYFA, { sort: '-publishedAt', fields: LIST_FIELDS, filter: pbFiltresi(), $autoCancel: false })
      .then((r) => {
        setItems((o) => [...o, ...(r.items || [])]);
        setSayfa(r.page);
        setDevam(r.page < r.totalPages);
      })
      .catch(() => setDevam(false))
      .finally(() => setYukleniyorDaha(false));
  };

  const turler = fasetler.turler;
  /* Filtreleme PB'de yapiliyor; burada YEREL bir suzme YOK. Tek istisna
     tohum: PB yaniti gelene kadar ekranda duran on-render kayitlari filtreye
     uymayabilir, o yuzden filtre secikken tohum yerel olarak da suzulur. */
  const kucult = (s) => String(s || '').toLocaleLowerCase('tr');
  const ara = kucult(araGec).trim();
  const filtreSecili = Boolean(tur || kategori || ara);
  // `q` de sayilir: debounce suresince (300 ms) `ara` henuz eski/bos olabilir
  // ve cubuk o arada kalkmamali.
  const aracGoster = analizVar || fasetler.turler.length > 0 || filtreSecili || Boolean(q.trim());
  const aramayiTemizle = () => {
    setQ('');
    aramaKutusu.current?.focus();
  };
  const filtreleriTemizle = () => {
    setTur('');
    setKategori('');
  };
  const gorunen = (!filtreSecili || !loading) ? items : items
    .filter((a) => (tur ? analysisKind(a) === tur : true))
    .filter((a) => (kategori ? a.category === kategori : true))
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

      {aracGoster && (
        <div className="an-tools">
          <input
            ref={aramaKutusu}
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
          {/* KATEGORI: CIP DEGIL ACILIR MENU (kullanici karari, 2026-09-04).
              Cip seridi olarak 15 kategori 1440px'te uc satir kapliyor ve
              listenin kendisini ekranin altina itiyordu — "rasgele bir
              bicimde bu ekranda gozukmesin". Tur seridi CIP kaliyor: uc
              secenek tek satira sigiyor ve hangi turde oldugun sayfanin
              kimligi; kategori ise daralt-genislet islevi, menuye ait.

              GORUNUR ETIKET YOK: secicinin kendisi zaten "Tüm kategoriler"
              yaziyor, yanina bir de "Kategori" koymak ayni seyi iki kez
              soylemek olurdu. Ekran okuyucu `aria-label`den okuyor. */}
          {fasetler.kategoriler.length > 1 && (
            <label className="an-cat-select">
              <select
                value={kategori}
                onChange={(e) => setKategori(e.target.value)}
                aria-label={L('Filter by category', 'Kategoriye göre filtrele')}
              >
                <option value="">{L('All categories', 'Tüm kategoriler')}</option>
                {fasetler.kategoriler.map((k) => (
                  <option key={k} value={k}>{categoryLabel(k, lang)}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

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
      {/* BOS SONUC iki ayri sey: hic analiz yok MU, yoksa secili arama/filtreye
          uyan mi yok. Ikincisinde okuyucuya ne aradigi ve tek tikla geri donus
          yolu verilir; arama kutusu yerinde kalir. */}
      {!loading && !hata && !gorunen.length && (
        filtreSecili ? (
          <p className="an-empty" role="status">
            {ara
              ? L(`No analysis matches “${araGec}”.`, `“${araGec}” ile eşleşen bir analiz yok.`)
              : L('No analysis matches these filters.', 'Seçili filtrelere uyan bir analiz yok.')}
            {' '}
            <button type="button" className="an-retry" onClick={ara ? aramayiTemizle : filtreleriTemizle}>
              {ara ? L('Clear search', 'Aramayı temizle') : L('Clear filters', 'Filtreleri temizle')}
            </button>
          </p>
        ) : (
          <p className="an-empty">{L('No analyses published yet.', 'Henüz yayınlanmış analiz yok.')}</p>
        )
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
