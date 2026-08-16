// ═══════════════════════════════════════════════════════════════════════════
//  /search?q=… — arama sonuclari.
//
//  NEDEN AYRI SAYFA: sonuc listesi ONCEDEN yalniz Home.jsx icinde
//  (`searchMode`) render ediliyordu. Bir urun/kategori/blog sayfasindayken
//  arama yapan kullanici ANA SAYFAYA atiliyor, aradigi sayfayi kaybediyordu.
//  Kendi rotasinda: her sayfadan calisir, adres paylasilabilir, tarayici geri
//  tusu dogru davranir, ana sayfanin agir akisi (feed) hic yuklenmez.
//
//  Ana sayfadaki `?q=` destegi KALDIRILMADI: eski linkler ve JSON-LD
//  SearchAction hedefi oraya isaret ediyordu.
//
//  Sonuclar `searchProductsLean` ile cekilir (`_raw` YOK): 40 sonuc icin
//  ~2,7 MB'lik gereksiz yuk boylece inmiyor; eksik kart etiketleri
//  enrichThinCards() ile ikinci ve kucuk bir istekte tamamlaniyor — ana sayfa
//  akisi da tam olarak bunu yapiyor.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { searchProductsLean, enrichThinCards } from '../lib/typesense';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard.jsx';
import { useI18n } from '../i18n/index.jsx';
import { useSeo } from '../lib/seo';
import { categoryLabel } from '../lib/format';
import './Search.css';

const LIMIT = 40;

export default function Search() {
  const { lang, t } = useI18n();
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);
  const [params] = useSearchParams();
  const nav = useNavigate();
  const q = (params.get('q') || '').trim();

  const [sonuc, setSonuc] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(!!q);
  const [terim, setTerim] = useState('');       // sonuclarin AIT OLDUGU sorgu
  const [katFiltre, setKatFiltre] = useState('');
  const girdi = useRef(null);

  // Arama sonuc sayfalari indekslenmez. Google ic arama sonuclarini acikca
  // "dusuk degerli" sayar; AdSense gecmisi (4 red, "dusuk degerli icerik")
  // dusunulunce bunu indexe acmak dogrudan zarar olurdu.
  useSeo({
    title: q
      ? L(`"${q}" search results — Qor AI`, `"${q}" arama sonuçları — Qor AI`, `"${q}" Suchergebnisse — Qor AI`)
      : L('Search — Qor AI', 'Arama — Qor AI', 'Suche — Qor AI'),
    description: L(
      'Search AI-scored tech products on Qor AI: compare specs, scores and live prices.',
      'Qor AI’da yapay zekâ puanlı teknoloji ürünlerini ara: özellikleri, puanları ve güncel fiyatları karşılaştır.',
      'Suche KI-bewertete Technikprodukte bei Qor AI: Specs, Scores und aktuelle Preise vergleichen.',
    ),
    path: '/search',
    htmlLang: lang,
    noindex: true,
  });

  useEffect(() => {
    setKatFiltre('');
    if (!q) { setSonuc([]); setYukleniyor(false); setTerim(''); return undefined; }
    let canli = true;
    setYukleniyor(true);
    searchProductsLean(q, LIMIT)
      .then(async (r) => {
        if (!canli) return;
        const liste = Array.isArray(r) ? r : [];
        // ONCE ham sonuclari bas — kullanici bekletilmesin; etiketler
        // zenginlestirme donunce yerine oturur (kart yuksekligi sabit,
        // dolayisiyla kayma olusmaz).
        setSonuc(liste);
        setTerim(q);
        setYukleniyor(false);
        if (!liste.length) return;
        try {
          const zengin = await enrichThinCards(liste);
          if (canli) setSonuc(Array.isArray(zengin) ? [...zengin] : liste);
        } catch { /* etiketler eksik kalir, sayfa calisir */ }
      })
      .catch(() => { if (canli) { setSonuc([]); setTerim(q); setYukleniyor(false); } });
    return () => { canli = false; };
  }, [q]);

  // Sonuclardaki kategoriler — "daralt" kisayolu. Sorgu genis oldugunda
  // (ornegin "samsung") kullaniciyi dogru kategoriye goturur.
  const kategoriler = useMemo(() => {
    const say = new Map();
    for (const p of sonuc) {
      const c = String(p.category || '').trim().toLowerCase();
      if (c) say.set(c, (say.get(c) || 0) + 1);
    }
    return [...say.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [sonuc]);

  const gosterilen = useMemo(
    () => (katFiltre ? sonuc.filter((p) => String(p.category || '').toLowerCase() === katFiltre) : sonuc),
    [sonuc, katFiltre],
  );

  const yenidenAra = (e) => {
    e.preventDefault();
    const s = girdi.current?.value.trim();
    if (s && s !== q) nav(`/search?q=${encodeURIComponent(s)}`);
  };

  return (
    <div className="page">
      <div className="container">
        <div className="sr-head">
          <h1 className="sr-title">
            {q ? (
              <>
                <span className="sr-title-lbl">{L('Results for', 'Sonuçlar', 'Ergebnisse für')}</span>
                <span className="sr-title-q">{q}</span>
              </>
            ) : L('Search', 'Arama', 'Suche')}
          </h1>
          {q && !yukleniyor && (
            <span className="sr-count">
              {!katFiltre && sonuc.length >= LIMIT ? `${LIMIT}+` : gosterilen.length}{' '}
              {L('products', 'ürün', 'Produkte')}
            </span>
          )}
        </div>

        {/* Sayfanin KENDI arama kutusu: ust bardaki kutu kapandiktan sonra
            sorguyu duzeltmek icin geri acmak gerekmesin. */}
        <form className="sr-box" onSubmit={yenidenAra} role="search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7.2" /><line x1="20.6" y1="20.6" x2="16.5" y2="16.5" />
          </svg>
          <input ref={girdi} defaultValue={q} key={q}
            placeholder={L('Search products…', 'Ürün ara…', 'Produkte suchen…')}
            aria-label={t('common.search')} type="search" enterKeyHint="search"
            autoComplete="off" spellCheck="false" />
          <button type="submit" className="btn btn-grad">{t('common.search')}</button>
        </form>

        {/* Kategori cipleri sonuclari YERINDE daraltir (yeni istek atmaz).
            Kategori sayfasina goturmek yaniltici olurdu: /category rotasi
            metin sorgusu okumuyor, yani ayni sorgu orada kaybolurdu. */}
        {kategoriler.length > 1 && (
          <div className="sr-cats">
            <span className="sr-cats-lbl">{L('Narrow down', 'Daralt', 'Eingrenzen')}</span>
            <button type="button" className={'sr-cat' + (!katFiltre ? ' on' : '')}
              onClick={() => setKatFiltre('')}>
              {L('All', 'Tümü', 'Alle')} <b>{sonuc.length}</b>
            </button>
            {kategoriler.map(([c, n]) => (
              <button key={c} type="button"
                className={'sr-cat' + (katFiltre === c ? ' on' : '')}
                onClick={() => setKatFiltre((v) => (v === c ? '' : c))}>
                {categoryLabel(c, lang)} <b>{n}</b>
              </button>
            ))}
          </div>
        )}

        {!q ? (
          <div className="card pad sr-empty">
            {L('Type a product name to search.', 'Aramak için bir ürün adı yaz.', 'Gib einen Produktnamen ein.')}
          </div>
        ) : yukleniyor ? (
          <div className="card-grid">
            {Array.from({ length: 12 }).map((_, i) => <ProductCardSkeleton key={i} />)}
          </div>
        ) : gosterilen.length ? (
          <div className="card-grid">
            {gosterilen.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        ) : (
          <div className="card pad sr-empty">
            <strong>{t('catalog.emptySearch', { q: terim || q })}</strong>
            <span>{L(
              'Check the spelling, try a shorter term, or browse by category.',
              'Yazımı kontrol et, daha kısa bir terim dene ya da kategorilere göz at.',
              'Prüfe die Schreibweise, versuche einen kürzeren Begriff oder stöbere in den Kategorien.',
            )}</span>
            <Link to="/category" className="btn btn-grad" style={{ marginTop: 6 }}>
              {L('All categories', 'Tüm kategoriler', 'Alle Kategorien')}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
