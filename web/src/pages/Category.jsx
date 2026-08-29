import { useEffect, useMemo, useRef, useState } from 'react';
import { IconX } from '../components/GlyphIcons.jsx';
import { Navigate, useNavigationType, useParams, useSearchParams } from 'react-router-dom';
import { getCategoryPage } from '../lib/typesense';
import { useGeoCountry } from '../lib/geo';
import { catMeta, categoryLabel } from '../lib/format';
import { categoryPath } from '../lib/routes';
import { usePageContext } from '../lib/pageContext';
import { trackEvent } from '../lib/analytics';
import { useI18n } from '../i18n/index.jsx';
import ProductCard, { ProductCardSkeleton } from '../components/ProductCard.jsx';
import AdSlot from '../components/AdSlot.jsx';
import { AD_SLOTS } from '../lib/ads';
import { SITE_URL, useSeo, hreflangAlternates } from '../lib/seo';
import {
  compareTokenValues,
  featureFiltersForCategory,
  filterGroupsForCategory,
  formatRangeValue,
  lbl,
  prettyTokenValue,
  rangeInputSuffix,
  rangeMetaForTokens,
  rangeTokens,
  tokenValue,
} from '../lib/categoryFilters';
import './Category.css';

// Price sorts are intentionally gone — the site does not surface prices.
const SORTS = [
  { id: 'score', key: 'catalog.sortScore' },
  { id: 'trend', key: 'catalog.sortTrend' },
  { id: 'new', key: 'catalog.sortNew' },
];
const SCORES = [
  { id: 'high', key: 'catalog.scoreHigh' },
  { id: 'mid', key: 'catalog.scoreMid' },
  { id: 'low', key: 'catalog.scoreLow' },
];
const PER_PAGE = 24;
const COLLAPSED = 8;

function facetCounts(facets, field) {
  const f = (facets || []).find((x) => x.field_name === field);
  return f ? f.counts : [];
}

/* ── GERİ DÖNÜŞTE SAYFAYI OLDUĞU GİBİ BIRAKMA ────────────────────────────────
   Filtreler, sıralama, yüklenmiş liste ve kaydırma konumu bileşenin YEREL
   state'inde duruyordu; bir ürüne tıklayıp geri gelen kullanıcı her şeyi
   sıfırlanmış buluyordu — 10 sayfa "Daha fazla" yükleyip 4 filtre seçtikten
   sonra bu, işin tamamını çöpe atmak demek.
   Görünüm sekme ömrü boyunca (sessionStorage) kategori başına saklanır ve
   YALNIZCA geri/ileri (POP) gezinmesinde geri yüklenir: menüden kategoriye
   yeniden girmek tertemiz bir sayfa vermeye devam eder.

   NEDEN sessionStorage, adres çubuğu DEĞİL: filtreleri sorgu dizesine taşımak
   kaydırma konumunu ve "kaçıncı sayfaya kadar yüklendiğini" TAŞIMAZ — asıl
   şikâyet buydu. Ayrıca /category/<cat> adresleri ön-render ediliyor ve
   indeksleniyor; her filtre kombinasyonunu taranabilir bir adrese çevirmek
   ince içerikli sonsuz varyant üretirdi. */
const GORUNUM_ANAHTAR = (cat) => `qor:catview:${cat}`;
// Sekme ömrü zaten sınırlı; bu üst sınır "sabahtan kalma" bir listeyi geri
// yüklememek için. Fiyat ve puanlar gün içinde değişiyor.
const GORUNUM_TTL_MS = 30 * 60 * 1000;
// Saklanan kart sayısı üst sınırı. 10 sayfa geri yüklenip kullanıcı kaldığı
// yerden devam edebiliyor; sınırsız bırakmak sessionStorage kotasını
// (~5 MB/origin) tek kategoriyle doldurabilirdi.
const GORUNUM_MAX_KART = PER_PAGE * 10;

function gorunumOku(cat, aktif) {
  if (!aktif || !cat) return null;
  try {
    const ham = sessionStorage.getItem(GORUNUM_ANAHTAR(cat));
    if (!ham) return null;
    const g = JSON.parse(ham);
    if (!g || g.v !== 1 || g.cat !== cat) return null;
    if (Date.now() - Number(g.t || 0) > GORUNUM_TTL_MS) return null;
    return g;
  } catch { return null; }
}

function gorunumYaz(cat, g) {
  if (!cat) return;
  const kirp = { ...g, v: 1, cat, t: Date.now() };
  try {
    sessionStorage.setItem(GORUNUM_ANAHTAR(cat), JSON.stringify(kirp));
  } catch {
    // Kota dolduysa listeyi düşürüp filtre + kaydırmayı yine de sakla: kısmi
    // geri yükleme (liste ilk sayfadan gelir) hiç geri yüklememekten iyidir.
    try {
      sessionStorage.setItem(GORUNUM_ANAHTAR(cat), JSON.stringify({ ...kirp, items: [], page: 1, hasMore: true }));
    } catch { /* sessionStorage tamamen kapalı olabilir (özel mod) */ }
  }
}

export default function Category() {
  const { t, lang } = useI18n();
  const L = (en, tr) => (lang === 'tr' ? tr : en);
  const [params] = useSearchParams();
  const routeParams = useParams();
  // Accept both the clean path URL (/category/smartphones) and the legacy query
  // URL (/category?cat=smartphones); the canonical always points to the path one.
  const cat = (routeParams.cat || params.get('cat') || '').toLowerCase();
  const meta = catMeta(cat);
  const catTitle = categoryLabel(cat, lang);
  const catPath = categoryPath(cat);
  const categoryDescription = cat
    ? t('category.seo', { cat: catTitle })
    : L('Browse every product category on Qor AI.',
        'Qor AI üzerindeki tüm ürün kategorilerine göz at.');

  usePageContext(
    cat
      ? `${lang === 'tr' ? 'Kategori sayfası' : 'Category page'}: ${catTitle}`
      : `${lang === 'tr' ? 'Tüm kategoriler sayfası' : 'All categories page'}`,
    cat
      ? { kind: 'category', title: catTitle, category: cat }
      : { kind: 'categories', title: '' },
  );

  useSeo({
    title: cat
      ? L(
          `Best ${catTitle} — Compare Specs & Prices | Qor AI`,
          `${catTitle} Karşılaştırma — Fiyat & Özellik | Qor AI`,
        )
      : `${L('All Categories', 'Tüm Kategoriler')} — Qor AI`,
    description: categoryDescription,
    path: catPath,
    htmlLang: lang,
    alternates: hreflangAlternates(catPath),
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'CollectionPage',
          '@id': `${SITE_URL}${catPath}#webpage`,
          url: `${SITE_URL}${catPath}`,
          name: cat ? `${catTitle} — Qor AI` : 'Qor AI Categories',
          description: categoryDescription,
          inLanguage: lang || 'tr',
          isPartOf: { '@id': `${SITE_URL}/#website` },
        },
        {
          '@type': 'BreadcrumbList',
          '@id': `${SITE_URL}${catPath}#breadcrumb`,
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Qor AI', item: `${SITE_URL}/` },
            { '@type': 'ListItem', position: 2, name: catTitle, item: `${SITE_URL}${catPath}` },
          ],
        },
      ],
    },
  });

  // Geri/ileri gezinmesi mi? Yalnız o durumda önceki görünüm geri yüklenir.
  // Aynı sekmede sert yenileme de POP sayılır ve bu İSTENEN davranış: kullanıcı
  // için "aynı sayfaya geri dönmek" ikisinde de aynı şey.
  const navTipi = useNavigationType();
  // KATEGORİ BAŞINA bir kez okunur. Her render'da yeniden okumak state'i geri
  // sarardı (snapshot'ı biz yazıyoruz); tek sefer okuyup önbelleklemek de
  // yetmez, çünkü bu bileşen kategori değişiminde YENİDEN MOUNT OLMUYOR —
  // /category/laptops'tan /category/tvs'e geçince eski kategorinin snapshot'ı
  // elde kalır ve yanlış kaydırma konumu geri yazılırdı.
  const gorunumRef = useRef({ cat: null, veri: null });
  if (gorunumRef.current.cat !== cat) {
    gorunumRef.current = { cat, veri: gorunumOku(cat, navTipi === 'POP') };
  }
  const gorunum = gorunumRef.current.veri;

  const [q, setQ] = useState(() => gorunum?.q || '');
  const paramSort = params.get('sort') || '';
  const [sort, setSort] = useState(() => {
    if (gorunum?.sort && SORTS.some((s) => s.id === gorunum.sort)) return gorunum.sort;
    return SORTS.some((s) => s.id === paramSort) ? paramSort : 'score';
  });
  const [score, setScore] = useState(() => gorunum?.score || 'all');
  const [brands, setBrands] = useState(() => gorunum?.brands || []);
  const [segments, setSegments] = useState(() => gorunum?.segments || []);
  const [tokens, setTokens] = useState(() => gorunum?.tokens || []);
  const [rangeFilters, setRangeFilters] = useState(() => gorunum?.rangeFilters || {});
  const [brandQuery, setBrandQuery] = useState('');
  const [brandsOpen, setBrandsOpen] = useState(() => !!gorunum?.brandsOpen);
  const [drawer, setDrawer] = useState(false);

  const [items, setItems] = useState(() => gorunum?.items || []);
  const [page, setPage] = useState(() => gorunum?.page || 1);
  const [hasMore, setHasMore] = useState(() => !!gorunum?.hasMore);
  // Geri yüklenmiş listede iskelet göstermek yanıp sönmeye yol açar.
  const [loading, setLoading] = useState(() => !(gorunum?.items?.length));
  const [more, setMore] = useState(false);
  // The full facet universe for the category — stable option list.
  const [universe, setUniverse] = useState([]);
  // Live facet counts for the current filter selection.
  const [liveFacets, setLiveFacets] = useState([]);

  // ── Facet option lists (stable universe + live counts) ──────────
  const countMap = (field) => {
    const m = {};
    facetCounts(liveFacets, field).forEach((c) => { m[c.value] = c.count; });
    return m;
  };
  const brandCounts = useMemo(() => countMap('brand'), [liveFacets]);
  const tokenCounts = useMemo(() => countMap('filterTokens'), [liveFacets]);

  const brandList = useMemo(
    () => facetCounts(universe, 'brand').map((c) => c.value).sort((a, b) => a.localeCompare(b)),
    [universe],
  );
  // filterTokens grouped by prefix -> { ram: [...], storage: [...], five_g: [...] }.
  // The category schema removes dirty cross-category tokens from the visible UI.
  const tokenGroups = useMemo(() => {
    const allowed = new Set(filterGroupsForCategory(cat).map((g) => g.prefix));
    featureFiltersForCategory(cat).forEach((f) => allowed.add(f.token.split(':')[0]));
    const groups = {};
    facetCounts(universe, 'filterTokens').forEach((c) => {
      const value = String(c.value || '');
      const i = value.indexOf(':');
      if (i < 1) return;
      const prefix = value.slice(0, i);
      if (!allowed.has(prefix)) return;
      (groups[prefix] = groups[prefix] || []).push(value);
    });
    Object.keys(groups).forEach((prefix) => {
      groups[prefix].sort((a, b) => compareTokenValues(prefix, a, b));
    });
    return groups;
  }, [cat, universe]);
  const filterGroups = useMemo(
    () => filterGroupsForCategory(cat).filter((g) => (tokenGroups[g.prefix] || []).length > 0),
    [cat, tokenGroups],
  );
  const availableFeatures = featureFiltersForCategory(cat)
    .filter((f) => (tokenGroups[f.token.split(':')[0]] || []).includes(f.token));
  const rangeFilterTokens = useMemo(() => (
    filterGroups.flatMap((g) => (
      g.kind === 'range'
        ? rangeTokens(tokenGroups[g.prefix] || [], g.prefix, rangeFilters[g.prefix], g.unit)
        : []
    ))
  ), [filterGroups, rangeFilters, tokenGroups]);
  const apiTokens = useMemo(
    () => [...new Set([...tokens, ...rangeFilterTokens])],
    [tokens, rangeFilterTokens],
  );
  const hasActiveRange = filterGroups.some((g) => {
    if (g.kind !== 'range') return false;
    const meta = rangeMetaForTokens(tokenGroups[g.prefix] || [], g.prefix, g.unit);
    const selected = rangeFilters[g.prefix];
    if (!meta || !selected) return false;
    const min = Math.max(meta.min, Math.min(Number(selected.min) || meta.min, Number(selected.max) || meta.max));
    const max = Math.min(meta.max, Math.max(Number(selected.min) || meta.min, Number(selected.max) || meta.max));
    return min > meta.min || max < meta.max;
  });

  // Ziyaretçinin ülkesi — fiyat sıralamasını GÖSTERİLEN yerli fiyata göre yapar.
  const geoCountry = useGeoCountry();

  // ÜLKE YALNIZ FİYAT SIRALAMASINDA sorguyu değiştirir (getCategoryPage sadece
  // priceUp/priceDown için `price{ÜLKE}` alanına geçer). `geoCountry` koşulsuz
  // anahtarın içindeyken, mount'tan sonra ülke çözülünce efekt İKİNCİ KEZ
  // koşuyor ve BİREBİR AYNI sorguyu tekrar atıyordu — ölçüldü (2026-08-15,
  // /category/smartphones): 1417 ms ve 1489 ms'de aynı `per_page=24` isteği.
  // Ülkeyi anahtara yalnızca sıralama gerçekten ona bağlıyken koyuyoruz.
  const sortUsesCountry = sort === 'priceUp' || sort === 'priceDown';
  const filterKey = [
    q, score, sort, brands.join(','), segments.join(','), apiTokens.join(','),
    JSON.stringify(rangeFilters), sortUsesCountry ? geoCountry : '',
  ].join('|');

  // Load the stable facet universe whenever the category changes.
  useEffect(() => {
    if (!cat) return;
    let live = true;
    getCategoryPage({ category: cat, page: 1, perPage: 1, facets: true })
      .then((r) => { if (live) setUniverse(r.facets); })
      .catch(() => {});
    return () => { live = false; };
  }, [cat]);

  /* Sıfırlayıcı efektler DURUMA bakarak korunuyor, "ilk koşuyu atla" sayacıyla
     DEĞİL. Sayaç yaklaşımı denendi ve dev'de sessizce bozuluyordu: StrictMode
     efektleri mount → unmount → mount diye iki kez koşturuyor, sayaç ilk
     koşuda tükeniyor ve İKİNCİ koşu geri yüklenen filtreleri siliyordu.
     Buradaki karşılaştırmalar idempotent — kaç kez koşarsa koşsun aynı sonuç. */
  // Filtreler yalnızca kategori GERÇEKTEN değişince sıfırlanır. Mount'ta zaten
  // sıfırlanacak bir şey yok (state ya boş ya da bilerek geri yüklenmiş).
  const sifirlananCat = useRef(cat);
  // Adresteki ?sort= yalnızca MOUNT SONRASI değişirse uygulanır; mount anındaki
  // değer geri yüklenen sıralamayı ezmemeli.
  const ilkSortParam = useRef(params.get('sort') || '');

  useEffect(() => {
    if (sifirlananCat.current === cat) return;
    sifirlananCat.current = cat;
    setQ('');
    setBrands([]);
    setSegments([]);
    setTokens([]);
    setRangeFilters({});
    setBrandQuery('');
    setBrandsOpen(false);
  }, [cat]);

  useEffect(() => {
    // `universe` ASENKRON geliyor; boşken `tokenGroups` da boş oluyor ve bu
    // efekt geri yüklenen token'ların HEPSİNİ siliyordu. Evren yüklenmeden
    // görünürlük kararı verilemez.
    if (!universe.length) return;
    const visible = new Set(Object.values(tokenGroups).flat());
    setTokens((prev) => prev.filter((tk) => visible.has(tk)));
  }, [tokenGroups, universe.length]);

  useEffect(() => {
    const next = params.get('sort') || '';
    if (gorunum && next === ilkSortParam.current) return;
    if (SORTS.some((s) => s.id === next)) setSort(next);
  }, [gorunum, params]);

  // Query the first page on any filter change.
  // Geri yüklenen listenin AİT OLDUĞU filtre anahtarı. Anahtar değişmediği
  // sürece sorgu atlanır: liste zaten elimizde ve yeniden sormak kullanıcıyı
  // 1. sayfaya geri sarardı — şikâyetin ta kendisi. Anahtar bir kez değişince
  // işaret düşürülür, yani aynı filtreye geri dönülürse taze sorgu atılır.
  const geriYuklenenAnahtar = useRef(
    gorunum && gorunum.items && gorunum.items.length ? null : false,
  );
  useEffect(() => {
    if (!cat) return;
    if (geriYuklenenAnahtar.current !== false) {
      if (geriYuklenenAnahtar.current === null) geriYuklenenAnahtar.current = filterKey;
      if (geriYuklenenAnahtar.current === filterKey) return;
      geriYuklenenAnahtar.current = false;
    }
    let live = true;
    setLoading(true);
    setPage(1);
    getCategoryPage({
      category: cat, q: q.trim(), brands, segment: segments[0], tokens: apiTokens,
      score, sort, page: 1, perPage: PER_PAGE, facets: true, country: geoCountry,
    })
      .then((r) => {
        if (!live) return;
        setItems(r.hits);
        setLiveFacets(r.facets);
        setHasMore(r.hits.length >= PER_PAGE && r.found > r.hits.length);
        if (q.trim()) trackEvent('category_search', { cat, query: q.trim() });
      })
      .catch(() => { if (live) { setItems([]); setHasMore(false); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [cat, filterKey]); // eslint-disable-line

  async function loadMore() {
    const next = page + 1;
    setMore(true);
    try {
      const r = await getCategoryPage({
        category: cat, q: q.trim(), brands, segment: segments[0], tokens: apiTokens,
        score, sort, page: next, perPage: PER_PAGE, country: geoCountry,
      });
      setItems((prev) => [...prev, ...r.hits]);
      setPage(next);
      setHasMore(r.hits.length >= PER_PAGE && r.found > next * PER_PAGE);
    } catch { /* keep current list */ }
    finally { setMore(false); }
  }

  // ── Görünümü sakla / kaydırmayı geri koy ──────────────────────────────────
  // Anlık durumun aynası: unmount temizliğinde state'in SON hâli okunabilsin.
  const durumRef = useRef(null);
  durumRef.current = { q, sort, score, brands, segments, tokens, rangeFilters, brandsOpen, items, page, hasMore };

  // Kaydırma konumu AYRI takip ediliyor. Unmount anında `window.scrollY`
  // okumak güvenilir değil: App rota değişiminde sayfayı başa sarıyor ve o
  // çağrı bu bileşenin temizliğiyle aynı commit'e düşebiliyor.
  const scrollRef = useRef(0);
  // "Hiç kaydırılmadı" ile "en başa kaydırıldı" AYNI ŞEY DEĞİL: ikisini de 0
  // saymak, listeyi başa sarıp ilk ürüne giren kullanıcıyı geri dönüşte eski
  // konuma atardı. Ayrı bir işaret bu ikisini ayırıyor.
  const kaydirildi = useRef(false);
  useEffect(() => {
    const kaydir = () => { kaydirildi.current = true; scrollRef.current = window.scrollY; };
    window.addEventListener('scroll', kaydir, { passive: true });
    return () => window.removeEventListener('scroll', kaydir);
  }, []);

  useEffect(() => () => {
    const d = durumRef.current;
    if (!d || !cat) return;
    // Kart sayısı sınırı aşıyorsa liste kırpılır VE sayfa sayacı kırpılan
    // uzunluğa çekilir: yoksa "Daha fazla" kırpılan aralığı atlayıp listede
    // delik bırakırdı.
    const kirpik = d.items.length > GORUNUM_MAX_KART;
    gorunumYaz(cat, {
      ...d,
      items: kirpik ? d.items.slice(0, GORUNUM_MAX_KART) : d.items,
      page: kirpik ? GORUNUM_MAX_KART / PER_PAGE : d.page,
      hasMore: kirpik ? true : d.hasMore,
      // Kullanıcı bu ziyarette HİÇ kaydırmadıysa geri yüklenen konum korunur.
      // Sıfır yazmak, ürüne girip hemen geri dönen kullanıcıyı sayfanın başına
      // atardı (dev'de StrictMode'un sahte unmount'u da tam bunu yapıyordu).
      scrollY: kaydirildi.current ? scrollRef.current : Number(gorunum?.scrollY || 0),
    });
  }, [cat, gorunum]);

  useEffect(() => {
    const y = Number(gorunum?.scrollY || 0);
    if (!y || !gorunum?.items?.length) return undefined;
    // İKİ kare bekleniyor. App rota değişiminde `scrollTo(0)` çağırıyor;
    // efektler çocuktan ebeveyne koştuğu için o çağrı BİZDEN SONRA çalışır ve
    // aynı commit'te yapılan geri koymayı ezerdi.
    let kare2 = 0;
    const kare1 = requestAnimationFrame(() => {
      kare2 = requestAnimationFrame(() => window.scrollTo({ top: y, left: 0, behavior: 'instant' }));
    });
    // Kartların yüksekliği geç oturursa (görsel yükleme, content-visibility)
    // sayfa başta kalabiliyor. TEK bir düzeltme denemesi — ve yalnızca hâlâ
    // en üstteysek, yani kullanıcı bu arada kendisi kaydırmadıysa.
    const zaman = setTimeout(() => {
      if (window.scrollY < 8) window.scrollTo({ top: y, left: 0, behavior: 'instant' });
    }, 250);
    return () => { cancelAnimationFrame(kare1); cancelAnimationFrame(kare2); clearTimeout(zaman); };
  }, []); // yalnız mount

  const hasFilters = q.trim() || brands.length || segments.length || tokens.length || hasActiveRange || score !== 'all';
  function clearFilters() {
    setQ(''); setBrands([]); setSegments([]); setTokens([]); setRangeFilters({}); setScore('all'); setBrandQuery('');
  }
  const toggle = (list, set, v) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const setRangeValue = (prefix, meta, next) => {
    setRangeFilters((prev) => {
      const current = prev[prefix] || { min: meta.min, max: meta.max };
      let min = Number(next.min ?? current.min);
      let max = Number(next.max ?? current.max);
      if (!Number.isFinite(min)) min = meta.min;
      if (!Number.isFinite(max)) max = meta.max;
      min = Math.max(meta.min, Math.min(meta.max, min));
      max = Math.max(meta.min, Math.min(meta.max, max));
      if (min > max) [min, max] = [max, min];
      if (min <= meta.min && max >= meta.max) {
        const copy = { ...prev };
        delete copy[prefix];
        return copy;
      }
      return { ...prev, [prefix]: { min, max } };
    });
  };

  const nearestRangeIndex = (values, value) => {
    const n = Number(value);
    let best = 0;
    values.forEach((candidate, index) => {
      if (Math.abs(candidate - n) < Math.abs(values[best] - n)) best = index;
    });
    return best;
  };

  const renderRangeGroup = (g) => {
    const groupTokens = tokenGroups[g.prefix] || [];
    const meta = rangeMetaForTokens(groupTokens, g.prefix, g.unit);
    if (!meta) return null;
    const selected = rangeFilters[g.prefix] || { min: meta.min, max: meta.max };
    const min = Math.max(meta.min, Math.min(Number(selected.min) || meta.min, Number(selected.max) || meta.max));
    const max = Math.min(meta.max, Math.max(Number(selected.min) || meta.min, Number(selected.max) || meta.max));
    const minIndex = nearestRangeIndex(meta.values, min);
    const maxIndex = nearestRangeIndex(meta.values, max);
    const selectedTokens = rangeTokens(groupTokens, g.prefix, { min, max }, g.unit);
    const effectiveTokens = selectedTokens.length ? selectedTokens : groupTokens;
    const count = effectiveTokens.reduce((sum, tk) => sum + (Number(tokenCounts[tk]) || 0), 0);
    return (
      <div className="cat-fgroup" key={g.prefix}>
        <h4>{lbl(g.label, lang)}</h4>
        <div className="cat-range-values">
          <strong>{formatRangeValue(min, g.unit)}</strong>
          <span>{formatRangeValue(max, g.unit)}</span>
          {count > 0 && <em>{count}</em>}
        </div>
        <div className="cat-range-slider">
          <input type="range" min="0" max={meta.values.length - 1} value={minIndex}
            onChange={(e) => setRangeValue(g.prefix, meta, { min: meta.values[Number(e.target.value)] })} />
          <input type="range" min="0" max={meta.values.length - 1} value={maxIndex}
            onChange={(e) => setRangeValue(g.prefix, meta, { max: meta.values[Number(e.target.value)] })} />
        </div>
        <div className="cat-range-inputs">
          <label>
            <input type="number" min={meta.min} max={meta.max} value={Math.round(min)}
              onChange={(e) => setRangeValue(g.prefix, meta, { min: e.target.value })} />
            <span>{rangeInputSuffix(g.unit)}</span>
          </label>
          <label>
            <input type="number" min={meta.min} max={meta.max} value={Math.round(max)}
              onChange={(e) => setRangeValue(g.prefix, meta, { max: e.target.value })} />
            <span>{rangeInputSuffix(g.unit)}</span>
          </label>
        </div>
      </div>
    );
  };

  const filteredBrands = brandList.filter(
    (b) => !brandQuery || b.toLowerCase().includes(brandQuery.toLowerCase()),
  );
  const visibleBrands = brandsOpen || brandQuery ? filteredBrands : filteredBrands.slice(0, COLLAPSED);

  if (!cat) {
    return <Navigate to="/" replace />;
  }

  const sidebar = (
    <aside className={'cat-side' + (drawer ? ' open' : '')}>
      <div className="cat-side-head">
        <h3>{t('catalog.filters')}</h3>
        {hasFilters && (
          <button className="cat-side-clear" onClick={clearFilters}>{t('catalog.clearFilters')}</button>
        )}
        <button className="cat-side-x" onClick={() => setDrawer(false)} aria-label="✕"><IconX size={14} width={2.4} /></button>
      </div>

      <div className="cat-fgroup">
        <input className="cat-brand-search" value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('category.searchIn')} />
      </div>

      <div className="cat-fgroup">
        <h4>{t('catalog.score')}</h4>
        <button className={'cat-fopt' + (score === 'all' ? ' on' : '')} onClick={() => setScore('all')}>
          {t('catalog.all')}
        </button>
        {SCORES.map((s) => (
          <button key={s.id} className={'cat-fopt' + (score === s.id ? ' on' : '')}
            onClick={() => setScore(s.id)}>
            ⚡ {t(s.key)}
          </button>
        ))}
      </div>

      {filterGroups.map((g) => {
        const groupTokens = tokenGroups[g.prefix] || [];
        if (g.kind === 'range' && rangeMetaForTokens(groupTokens, g.prefix, g.unit)) {
          return renderRangeGroup(g);
        }
        return (
          <div className="cat-fgroup" key={g.prefix}>
            <h4>{lbl(g.label, lang)}</h4>
            {groupTokens.map((tk) => (
              <label key={tk} className={'cat-check' + (tokens.includes(tk) ? ' on' : '')}>
                <input type="checkbox" checked={tokens.includes(tk)}
                  onChange={() => toggle(tokens, setTokens, tk)} />
                <span>{prettyTokenValue(tokenValue(tk, g.prefix), lang)}</span>
                {tokenCounts[tk] != null && <em>{tokenCounts[tk]}</em>}
              </label>
            ))}
          </div>
        );
      })}

      {availableFeatures.length > 0 && (
        <div className="cat-fgroup">
          <h4>{L('Features', 'Özellikler')}</h4>
          {availableFeatures.map((f) => (
            <label key={f.token} className={'cat-check' + (tokens.includes(f.token) ? ' on' : '')}>
              <input type="checkbox" checked={tokens.includes(f.token)}
                onChange={() => toggle(tokens, setTokens, f.token)} />
              <span>{lbl(f.label, lang)}</span>
              {tokenCounts[f.token] != null && <em>{tokenCounts[f.token]}</em>}
            </label>
          ))}
        </div>
      )}

      {brandList.length > 1 && (
        <div className="cat-fgroup">
          <h4>{t('catalog.brand')}</h4>
          {brandList.length > COLLAPSED && (
            <input className="cat-brand-search" value={brandQuery}
              onChange={(e) => setBrandQuery(e.target.value)}
              placeholder={t('catalog.brandSearch')} />
          )}
          {visibleBrands.map((b) => (
            <label key={b} className={'cat-check' + (brands.includes(b) ? ' on' : '')}>
              <input type="checkbox" checked={brands.includes(b)}
                onChange={() => toggle(brands, setBrands, b)} />
              <span>{b}</span>
              {brandCounts[b] != null && <em>{brandCounts[b]}</em>}
            </label>
          ))}
          {!brandQuery && filteredBrands.length > COLLAPSED && (
            <button className="cat-brand-more" onClick={() => setBrandsOpen((o) => !o)}>
              {brandsOpen
                ? t('catalog.showLess')
                : t('catalog.showAllBrands', { n: filteredBrands.length - COLLAPSED })}
            </button>
          )}
        </div>
      )}
    </aside>
  );

  return (
    <div className="catalog">
      <div className="cat-hero">
        <div className="container">
          <h1 style={{ '--cat-color': meta.color }}>{catTitle}</h1>
          <p>{t('catalog.subtitle')}</p>
        </div>
      </div>

      <div className="container cat-body">
        {sidebar}
        {drawer && <div className="cat-side-backdrop" onClick={() => setDrawer(false)} />}

        <div className="cat-main">
          <div className="cat-toolbar">
            <button className="cat-filter-btn" onClick={() => setDrawer(true)}>
              ☰ {t('catalog.filters')}
              {hasFilters && <i className="cat-filter-dot" />}
            </button>
            <div className="cat-sort">
              {SORTS.map((s) => (
                <button key={s.id} className={sort === s.id ? 'active' : ''} onClick={() => setSort(s.id)}>
                  {t(s.key)}
                </button>
              ))}
            </div>
          </div>

          <div className="cat-list">
            {loading
              ? Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)
              : items.map((p, i) => (
                  <div key={p.id} className="cat-list-item" style={{ '--row': i }}>
                    <ProductCard product={p} priority={i < 4} />
                  </div>
                ))}
          </div>

          {!loading && items.length === 0 && (
            <div className="cat-empty">
              <div className="cat-empty-icon">🔍</div>
              <h3>{t('catalog.emptyTitle')}</h3>
              <p>{q.trim() ? t('catalog.emptySearch', { q: q.trim() }) : t('catalog.emptyCat')}</p>
            </div>
          )}

          {!loading && items.length > 0 && <AdSlot slot={AD_SLOTS.category} />}

          {!loading && hasMore && (
            <div className="cat-more">
              <button className="btn btn-ghost btn-lg" disabled={more} onClick={loadMore}>
                {more ? t('common.loading') : t('category.more')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
