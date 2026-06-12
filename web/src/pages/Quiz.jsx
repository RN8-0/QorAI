import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { updateProfile } from '../lib/pocketbase';
import { markQuizCompletedLocal } from '../lib/qorCoins';
import { trackEvent } from '../lib/analytics';
import { getCategoryVisuals } from '../lib/typesense';
import { QuizGlyph } from '../lib/quizIcons.jsx';
import SubLogo from '../components/SubLogo.jsx';
import { useI18n } from '../i18n/index.jsx';
import { useSeo } from '../lib/seo';
import './Quiz.css';

const CATEGORY_LABELS = {
  smartphones: ['Smartphones', 'Akıllı Telefonlar', 'Smartphones'],
  tablets: ['Tablets', 'Tabletler', 'Tablets'],
  laptops: ['Laptops', 'Dizüstü Bilgisayarlar', 'Laptops'],
  desktops: ['Desktops', 'Masaüstü Bilgisayarlar', 'Desktops'],
  cpus: ['Processors', 'İşlemciler', 'Prozessoren'],
  gpus: ['Graphics Cards', 'Ekran Kartları', 'Grafikkarten'],
  ram: ['RAM', 'RAM', 'RAM'],
  ssd: ['SSD & Storage', 'SSD ve Depolama', 'SSD & Speicher'],
  motherboards: ['Motherboards', 'Anakartlar', 'Mainboards'],
  psu: ['Power Supplies', 'Güç Kaynakları', 'Netzteile'],
  cases: ['PC Cases', 'Kasalar', 'PC-Gehäuse'],
  coolers: ['Coolers', 'Soğutucular', 'Kühler'],
  monitors: ['Monitors', 'Monitörler', 'Monitore'],
  keyboards: ['Keyboards', 'Klavyeler', 'Tastaturen'],
  mice: ['Mice', 'Fareler', 'Mäuse'],
  webcams: ['Webcams', 'Web Kameraları', 'Webcams'],
  printers: ['Printers', 'Yazıcılar', 'Drucker'],
  tvs: ['TVs', 'TV ve Ekranlar', 'TVs'],
  projectors: ['Projectors', 'Projektörler', 'Projektoren'],
  'media-players': ['Media Players', 'Medya Oynatıcılar', 'Media Player'],
  headphones: ['Headphones', 'Kulaklıklar', 'Kopfhörer'],
  speakers: ['Speakers', 'Hoparlörler', 'Lautsprecher'],
  soundbars: ['Soundbars', 'Soundbarlar', 'Soundbars'],
  microphones: ['Microphones', 'Mikrofonlar', 'Mikrofone'],
  smartwatches: ['Smartwatches', 'Akıllı Saatler', 'Smartwatches'],
  'smart-rings': ['Smart Rings', 'Akıllı Yüzükler', 'Smart Rings'],
  cameras: ['Cameras', 'Kameralar', 'Kameras'],
  'action-cameras': ['Action Cameras', 'Aksiyon Kameraları', 'Action-Kameras'],
  'security-cameras': ['Security Cameras', 'Güvenlik Kameraları', 'Sicherheitskameras'],
  'ip-cameras': ['IP Cameras', 'IP Kameralar', 'IP-Kameras'],
  dashcams: ['Dashcams', 'Araç Kameraları', 'Dashcams'],
  gimbals: ['Gimbals', 'Gimballer', 'Gimbals'],
  tripods: ['Tripods', 'Tripodlar', 'Stative'],
  lenses: ['Lenses', 'Lensler', 'Objektive'],
  consoles: ['Gaming Consoles', 'Oyun Konsolları', 'Spielkonsolen'],
  gamepads: ['Gamepads', 'Oyun Kolları', 'Gamepads'],
  'vr-headsets': ['VR Headsets', 'VR Başlıklar', 'VR-Headsets'],
  routers: ['Routers & Modems', 'Router ve Modemler', 'Router & Modems'],
  'robot-vacuums': ['Robot Vacuums', 'Robot Süpürgeler', 'Saugroboter'],
  powerbanks: ['Power Banks', 'Taşınabilir Şarj Cihazları', 'Powerbanks'],
  'e-readers': ['E-Readers', 'E-Okuyucular', 'E-Reader'],
  drones: ['Drones', 'Dronelar', 'Drohnen'],
};

const QUIZ_CATEGORY_UNIVERSE = [
  'smartphones', 'tablets', 'laptops', 'desktops', 'cpus', 'gpus', 'ram', 'ssd',
  'motherboards', 'psu', 'cases', 'coolers', 'monitors', 'keyboards', 'mice',
  'webcams', 'printers', 'tvs', 'projectors', 'media-players', 'headphones',
  'speakers', 'soundbars', 'microphones', 'smartwatches', 'smart-rings',
  'cameras', 'action-cameras', 'security-cameras', 'ip-cameras', 'dashcams',
  'gimbals', 'tripods', 'lenses', 'consoles', 'gamepads', 'vr-headsets',
  'routers', 'robot-vacuums', 'powerbanks', 'e-readers', 'drones',
];

const DEVICE_CATEGORY_UNIVERSE = [
  'smartphones', 'tablets', 'laptops', 'desktops', 'monitors', 'keyboards',
  'mice', 'webcams', 'printers', 'tvs', 'projectors', 'media-players',
  'headphones', 'speakers', 'soundbars', 'microphones', 'smartwatches',
  'smart-rings', 'cameras', 'action-cameras', 'security-cameras', 'ip-cameras',
  'dashcams', 'gimbals', 'tripods', 'lenses', 'consoles', 'gamepads',
  'vr-headsets', 'routers', 'robot-vacuums', 'powerbanks', 'e-readers', 'drones',
];

function categoryOptions(list) {
  return list.map((id) => {
    const label = CATEGORY_LABELS[id] || [id, id, id];
    return [id, label[0], label[1], label[2]];
  });
}

// App slug -> the actual Typesense `category` value (its taxonomy differs).
const VISUAL_CATEGORY_ALIASES = {
  gpus: 'graphics_cards',
  consoles: 'gaming_consoles',
  'media-players': 'media_players',
  'smart-rings': 'smart_rings',
  'action-cameras': 'dashcams',
  'security-cameras': 'ip_cameras',
  'ip-cameras': 'ip_cameras',
  'vr-headsets': 'vr_headsets',
  'robot-vacuums': 'robot_vacuums',
  'e-readers': 'e_readers',
  cases: 'pc_cases',
  coolers: 'cpu_coolers',
  speakers: 'audio_systems',
  soundbars: 'audio_systems',
  cameras: 'camera_lenses',
  lenses: 'camera_lenses',
  tripods: 'gimbals',
};

function visualCategory(value) {
  return VISUAL_CATEGORY_ALIASES[value] || value;
}

function optionText(option, lang) {
  return lang === 'tr' ? option[2] : lang === 'de' ? option[3] : option[1];
}

const USES_PRODUCT_COVERS = new Set(['interestCategories', 'currentDevices']);

function optionArtwork(step, value, visuals) {
  if (!USES_PRODUCT_COVERS.has(step.field)) return '';
  return visuals[visualCategory(value)] || '';
}

const QUIZ_VISUAL_CATEGORIES = [...new Set(
  [...QUIZ_CATEGORY_UNIVERSE, ...DEVICE_CATEGORY_UNIVERSE].map(visualCategory),
)];

// Spotify-style progressive reveal: long steps start trimmed and open more
// options as the user selects (or taps "show more"); short steps show all.
const INITIAL_VISIBLE = {
  interestCategories: 15,
  currentDevices: 15,
  subscriptions: 15,
};
const REVEAL_BATCH = 9;

function initialVisibleFor(step) {
  return Math.min(step.options.length, INITIAL_VISIBLE[step.field] || step.options.length);
}

const STEPS = [
  {
    field: 'interestCategories',
    multiple: true,
    min: 3,
    title: { en: 'What do you want to discover most?', tr: 'En çok hangi ürünleri keşfetmek istiyorsun?', de: 'Was möchtest du am meisten entdecken?' },
    subtitle: { en: 'Pick at least 3 categories.', tr: 'En az 3 kategori seç.', de: 'Wähle mindestens 3 Kategorien.' },
    options: categoryOptions(QUIZ_CATEGORY_UNIVERSE),
  },
  {
    field: 'ecosystem',
    title: { en: 'Which ecosystem do you use?', tr: 'Hangi ekosistemi kullanıyorsun?', de: 'Welches Ökosystem nutzt du?' },
    subtitle: { en: 'Choose the one closest to your setup.', tr: 'Kurulumuna en yakın olanı seç.', de: 'Wähle das passendste.' },
    options: [
      ['apple', 'Apple', 'Apple', 'Apple'],
      ['android', 'Android', 'Android', 'Android'],
      ['windows', 'Windows', 'Windows', 'Windows'],
      ['samsung', 'Samsung', 'Samsung', 'Samsung'],
      ['google', 'Google', 'Google', 'Google'],
      ['xiaomi', 'Xiaomi', 'Xiaomi', 'Xiaomi'],
      ['huawei', 'Huawei', 'Huawei', 'Huawei'],
      ['mixed', 'Mixed', 'Karışık', 'Gemischt'],
    ],
  },
  {
    field: 'budgetRange',
    title: { en: 'What budget band fits you?', tr: 'Bütçen hangi bantta?', de: 'Welches Budget passt zu dir?' },
    subtitle: { en: 'Pick your usual spending level.', tr: 'Genel harcama seviyeni seç.', de: 'Wähle dein Ausgabenniveau.' },
    options: [
      ['low', 'Budget', 'Bütçe Dostu', 'Budget'],
      ['mid', 'Balanced', 'Dengeli', 'Ausgewogen'],
      ['high', 'Upper Mid', 'Üst-Orta', 'Obere Mittelklasse'],
      ['premium', 'Premium', 'Premium', 'Premium'],
      ['any', 'Any', 'Farketmez', 'Egal'],
    ],
  },
  {
    field: 'priorities',
    multiple: true,
    min: 1,
    title: { en: 'What matters most when you compare?', tr: 'Karşılaştırmada senin için en önemli şey ne?', de: 'Was zählt beim Vergleichen am meisten?' },
    subtitle: { en: 'You can choose more than one.', tr: 'Birden fazla seçim yapabilirsin.', de: 'Du kannst mehrere auswählen.' },
    options: [
      ['price', 'Price', 'Fiyat', 'Preis'],
      ['quality', 'Quality', 'Kalite', 'Qualität'],
      ['design', 'Design', 'Tasarım', 'Design'],
      ['ecosystem', 'Ecosystem', 'Uyum', 'Ökosystem'],
      ['performance', 'Performance', 'Performans', 'Leistung'],
      ['durability', 'Durability', 'Dayanıklılık', 'Haltbarkeit'],
      ['battery', 'Battery life', 'Pil ömrü', 'Akkulaufzeit'],
      ['camera', 'Camera quality', 'Kamera kalitesi', 'Kameraqualität'],
      ['portability', 'Portability', 'Taşınabilirlik', 'Mobilität'],
      ['gaming', 'Gaming', 'Oyun', 'Gaming'],
      ['creator', 'Creator workflow', 'Üretici iş akışı', 'Creator-Workflow'],
      ['productivity', 'Productivity', 'Üretkenlik', 'Produktivität'],
    ],
  },
  {
    field: 'currentDevices',
    multiple: true,
    min: 1,
    title: { en: 'Which devices do you actively use today?', tr: 'Şu an hangi cihazları aktif kullanıyorsun?', de: 'Welche Geräte nutzt du aktuell aktiv?' },
    subtitle: { en: 'Pick everything in your current setup.', tr: 'Mevcut kurulumundakileri seç.', de: 'Wähle alles aus deinem Setup.' },
    options: categoryOptions(DEVICE_CATEGORY_UNIVERSE),
  },
  {
    field: 'usageIntent',
    title: { en: 'What are you mainly buying for?', tr: 'En çok hangi amaç için satın alıyorsun?', de: 'Wofür kaufst du hauptsächlich?' },
    subtitle: { en: 'This shapes your home feed and AI picks.', tr: 'Bu, ana sayfanı ve AI seçimlerini şekillendirir.', de: 'Das prägt deinen Feed und die KI-Auswahl.' },
    options: [
      ['gaming_setup', 'Gaming & esports', 'Oyun / Gaming', 'Gaming & E-Sport'],
      ['creator_setup', 'Creator workflow', 'İçerik üretimi', 'Creator-Workflow'],
      ['productivity_setup', 'School / work / productivity', 'Okul / iş / verimlilik', 'Schule / Arbeit / Produktivität'],
      ['entertainment_setup', 'Movies / music / entertainment', 'Film / müzik / eğlence', 'Filme / Musik / Unterhaltung'],
      ['price_tracking', 'Price tracking', 'En iyi fiyatı yakalamak', 'Preisverfolgung'],
      ['all', 'Mixed usage', 'Karışık kullanım', 'Gemischte Nutzung'],
    ],
  },
  {
    field: 'ageRange',
    title: { en: 'Which age range fits you?', tr: 'Hangi yaş aralığındasın?', de: 'Welche Altersgruppe passt zu dir?' },
    subtitle: { en: 'Helps tune recommendation tone and pace.', tr: 'Öneri tonu ve keşif hızını ayarlar.', de: 'Stimmt Ton und Tempo der Empfehlungen ab.' },
    options: [
      ['13-17', '13-17', '13-17', '13-17'],
      ['18-24', '18-24', '18-24', '18-24'],
      ['25-34', '25-34', '25-34', '25-34'],
      ['35-44', '35-44', '35-44', '35-44'],
      ['45-54', '45-54', '45-54', '45-54'],
      ['55+', '55+', '55+', '55+'],
    ],
  },
  {
    field: 'profession',
    title: { en: 'Which profile is closest to you?', tr: 'Hangi profil sana daha yakın?', de: 'Welches Profil passt am besten?' },
    subtitle: { en: 'Fine-tunes which categories rank higher.', tr: 'Hangi kategorilerin öne çıkacağını ayarlar.', de: 'Stimmt die Kategorie-Priorität ab.' },
    options: [
      ['student', 'Student', 'Öğrenci', 'Student/in'],
      ['engineer', 'Engineer', 'Mühendis', 'Ingenieur/in'],
      ['designer', 'Designer', 'Tasarımcı', 'Designer/in'],
      ['developer', 'Developer', 'Yazılımcı', 'Entwickler/in'],
      ['content_creator', 'Content creator', 'İçerik üreticisi', 'Content Creator'],
      ['video_editor', 'Video editor', 'Video editörü', 'Video Editor'],
      ['photographer', 'Photographer', 'Fotoğrafçı', 'Fotograf/in'],
      ['gamer', 'Gamer', 'Oyuncu', 'Gamer/in'],
      ['manager', 'Manager', 'Yönetici', 'Manager/in'],
      ['product_manager', 'Product manager', 'Ürün yöneticisi', 'Produktmanager/in'],
      ['entrepreneur', 'Entrepreneur', 'Girişimci', 'Unternehmer/in'],
      ['healthcare', 'Healthcare', 'Sağlık', 'Gesundheit'],
      ['teacher', 'Teacher', 'Öğretmen', 'Lehrkraft'],
      ['finance', 'Finance', 'Finans', 'Finanzen'],
      ['other', 'Other', 'Diğer', 'Andere'],
    ],
  },
  {
    field: 'subscriptions',
    multiple: true,
    min: 1,
    title: { en: 'Which subscriptions are part of your life?', tr: 'Hangi abonelikler hayatında var?', de: 'Welche Abos nutzt du?' },
    subtitle: { en: 'Pick "none" if you do not use any.', tr: 'Kullanmıyorsan "Yok" seç.', de: 'Wähle "keine", wenn du keine nutzt.' },
    options: [
      ['none', 'None', 'Yok', 'Keine'],
      ['netflix', 'Netflix', 'Netflix', 'Netflix'],
      ['disney_plus', 'Disney+', 'Disney+', 'Disney+'],
      ['prime_video', 'Prime Video', 'Prime Video', 'Prime Video'],
      ['apple_tv_plus', 'Apple TV+', 'Apple TV+', 'Apple TV+'],
      ['spotify', 'Spotify', 'Spotify', 'Spotify'],
      ['youtube_music', 'YouTube Music', 'YouTube Music', 'YouTube Music'],
      ['youtube_premium', 'YouTube Premium', 'YouTube Premium', 'YouTube Premium'],
      ['apple_music', 'Apple Music', 'Apple Music', 'Apple Music'],
      ['icloud', 'iCloud+', 'iCloud+', 'iCloud+'],
      ['google_one', 'Google One', 'Google One', 'Google One'],
      ['microsoft_365', 'Microsoft 365', 'Microsoft 365', 'Microsoft 365'],
      ['google_workspace', 'Google Workspace', 'Google Workspace', 'Google Workspace'],
      ['dropbox', 'Dropbox', 'Dropbox', 'Dropbox'],
      ['amazon_prime', 'Amazon Prime', 'Amazon Prime', 'Amazon Prime'],
      ['game_pass', 'Game Pass', 'Game Pass', 'Game Pass'],
      ['ps_plus', 'PS Plus', 'PS Plus', 'PS Plus'],
      ['adobe_cc', 'Adobe CC', 'Adobe CC', 'Adobe CC'],
      ['canva', 'Canva', 'Canva', 'Canva'],
      ['notion', 'Notion', 'Notion', 'Notion'],
      ['chatgpt_plus', 'ChatGPT Plus', 'ChatGPT Plus', 'ChatGPT Plus'],
      ['claude', 'Claude Pro', 'Claude Pro', 'Claude Pro'],
      ['gemini', 'Gemini Advanced', 'Gemini Advanced', 'Gemini Advanced'],
      ['github_copilot', 'GitHub Copilot', 'GitHub Copilot', 'GitHub Copilot'],
      ['nordvpn', 'NordVPN', 'NordVPN', 'NordVPN'],
      ['x_premium', 'X Premium', 'X Premium', 'X Premium'],
      ['reddit_premium', 'Reddit Premium', 'Reddit Premium', 'Reddit Premium'],
    ],
  },
];

function tx(lang, value) {
  if (!value) return '';
  return value[lang] || value.en || '';
}

function optionLabel(step, value, lang) {
  const match = step.options.find((o) => o[0] === value);
  if (!match) return String(value).replace(/[_-]+/g, ' ');
  return lang === 'tr' ? match[2] : lang === 'de' ? match[3] : match[1];
}

function emptyAnswers(user) {
  const fromArray = (v) => (Array.isArray(v) && v.length ? v : []);
  return {
    interestCategories: fromArray(user?.interestCategories),
    ecosystem: user?.ecosystem || '',
    budgetRange: user?.budgetRange || '',
    priorities: fromArray(user?.priorities),
    currentDevices: fromArray(user?.currentDevices),
    usageIntent: user?.usageIntent || '',
    ageRange: user?.ageRange || '',
    profession: user?.profession || '',
    subscriptions: fromArray(user?.subscriptions).length ? fromArray(user?.subscriptions) : ['none'],
  };
}

// Mirrors the app's onboarding profile vector (lib/.../quiz_screen.dart) so the
// same personalization signals feed the AI/algorithm on web and mobile.
function buildVector(answers, primaryCategory) {
  const vector = {
    budget_score: answers.budgetRange === 'low' ? 0.2
      : answers.budgetRange === 'mid' ? 0.5
        : answers.budgetRange === 'high' ? 0.7
          : answers.budgetRange === 'premium' ? 0.9
            : 0.5,
    apple_affinity: answers.ecosystem === 'apple' ? 1 : 0,
    android_affinity: ['android', 'samsung', 'google', 'xiaomi', 'huawei'].includes(answers.ecosystem) ? 1 : 0,
    windows_affinity: answers.ecosystem === 'windows' ? 1 : 0,
    google_affinity: answers.ecosystem === 'google' ? 1 : 0,
    [`primary_${primaryCategory}`]: 1,
  };
  answers.interestCategories.forEach((c) => { vector[`category_${c}`] = c === primaryCategory ? 1 : 0.75; });
  answers.priorities.forEach((p) => { vector[`priority_${p}`] = 1; });
  answers.currentDevices.filter((d) => d !== 'none').forEach((d) => { vector[`device_${d}`] = 1; });
  answers.subscriptions.filter((s) => s !== 'none').forEach((s) => { vector[`subscription_${s}`] = 1; });
  if (answers.usageIntent) vector[`usage_${answers.usageIntent}`] = 1;
  if (answers.profession) vector[`profession_${answers.profession}`] = 1;
  if (answers.ageRange) vector[`age_${answers.ageRange}`] = 1;
  return vector;
}

function BackIcon({ close }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {close ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M15 5l-7 7 7 7" />}
    </svg>
  );
}

function OptionVisual({ step, option, visuals, broken, onBroken }) {
  const value = option[0];
  const label = optionText(option, 'en'); // SubLogo matches by canonical English name
  if (step.field === 'subscriptions' && value !== 'none') {
    return <SubLogo name={label} size={64} radius={18} />;
  }
  if (step.field === 'ageRange') {
    return <span className="oq-age">{value}</span>;
  }
  const image = optionArtwork(step, value, visuals);
  if (image && !broken) {
    return (
      <img className="oq-photo" src={image} alt="" loading="lazy"
        onError={onBroken} />
    );
  }
  return <span className="oq-glyph"><QuizGlyph field={step.field} value={value} /></span>;
}

export default function Quiz() {
  const { t, lang } = useI18n();
  const { user, openAuth } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const nextPath = params.get('next') || '/';
  const required = params.get('required') === '1';
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);

  useSeo({ title: `${t('quiz.title')} — Qor AI`, description: t('quiz.subtitle'), path: '/quiz' });

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(() => emptyAnswers(user));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const [summary, setSummary] = useState('');
  const [visuals, setVisuals] = useState({});
  const [brokenImages, setBrokenImages] = useState({});
  const [visibleCounts, setVisibleCounts] = useState({});

  useEffect(() => {
    if (!user) openAuth();
    else setAnswers(emptyAnswers(user));
  }, [openAuth, user]);

  useEffect(() => {
    let live = true;
    getCategoryVisuals(QUIZ_VISUAL_CATEGORIES).then((map) => {
      if (live) setVisuals(map || {});
    });
    return () => { live = false; };
  }, []);

  const current = STEPS[step];
  const total = STEPS.length;
  const selected = answers[current.field];
  const selectedCount = Array.isArray(selected) ? selected.length : (selected ? 1 : 0);
  const visibleCount = visibleCounts[current.field] || initialVisibleFor(current);
  const visibleOptions = current.options.slice(0, visibleCount);
  const hasMoreOptions = visibleCount < current.options.length;

  const canContinue = useMemo(() => {
    const value = answers[current.field];
    if (current.multiple) return Array.isArray(value) && value.length >= (current.min || 1);
    return Boolean(value);
  }, [answers, current]);

  if (!user) {
    return (
      <div className="oq-shell">
        <QuizBackdrop />
        <div className="oq-gate">
          <div className="oq-gate-badge">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>
          </div>
          <h1>{t('quiz.title')}</h1>
          <p>{L('Sign in to build your Qor AI profile.', 'Qor AI profilini oluşturmak için giriş yap.', 'Melde dich an, um dein Qor AI Profil zu erstellen.')}</p>
          <button className="oq-btn oq-btn-primary" onClick={openAuth}>{t('nav.signIn')}</button>
        </div>
      </div>
    );
  }

  function pick(value) {
    setErr('');
    if (!current.multiple) {
      setAnswers((a) => ({ ...a, [current.field]: value }));
      return;
    }
    setAnswers((a) => {
      const prev = Array.isArray(a[current.field]) ? a[current.field] : [];
      let nextVal;
      if (value === 'none') nextVal = prev.includes('none') ? [] : ['none'];
      else {
        const clean = prev.filter((x) => x !== 'none');
        nextVal = clean.includes(value) ? clean.filter((x) => x !== value) : [...clean, value];
      }
      return { ...a, [current.field]: nextVal };
    });
    if (hasMoreOptions) revealMore();
  }

  function revealMore() {
    setVisibleCounts((prev) => {
      const count = prev[current.field] || initialVisibleFor(current);
      const nextCount = Math.min(current.options.length, count + REVEAL_BATCH);
      if (nextCount === count) return prev;
      return { ...prev, [current.field]: nextCount };
    });
  }

  function goNext() {
    if (!canContinue) {
      setErr(current.field === 'interestCategories'
        ? L('Select at least 3 categories to continue.', 'Devam etmek için en az 3 kategori seç.', 'Wähle mindestens 3 Kategorien.')
        : L('Complete this step to continue.', 'Devam etmek için bu adımı tamamla.', 'Schließe diesen Schritt ab.'));
      return;
    }
    if (step + 1 >= total) submit();
    else setStep((s) => s + 1);
  }

  function goBack() {
    if (step === 0) { nav(nextPath, { replace: true }); return; }
    setErr('');
    setStep((s) => Math.max(0, s - 1));
  }

  function snapshot() {
    return STEPS.map((s) => {
      const raw = answers[s.field];
      const answer = Array.isArray(raw)
        ? raw.map((v) => optionLabel(s, v, lang)).join(', ')
        : optionLabel(s, raw, lang);
      return { field: s.field, question: tx(lang, s.title), answer };
    }).filter((x) => x.answer);
  }

  function grouped(answersList) {
    const groups = {
      interestCategories: 'interests',
      ecosystem: 'profile',
      budgetRange: 'profile',
      usageIntent: 'profile',
      ageRange: 'profile',
      profession: 'profile',
      priorities: 'preferences',
      currentDevices: 'devices',
      subscriptions: 'subscriptions',
    };
    return answersList.reduce((acc, item) => {
      const key = groups[item.field] || 'other';
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setErr('');
    const primaryCategory = answers.interestCategories[0] || 'smartphones';
    const submittedAt = new Date().toISOString();
    const answersList = snapshot();
    const recommendation = L(
      'Your profile is saved. Qor AI will now use your ecosystem, budget, priorities, devices and subscriptions across product AI, link analysis and subscription analysis.',
      'Profilin kaydedildi. Qor AI artık ürün AI analizi, link analizi ve abonelik analizinde ekosistemini, bütçeni, önceliklerini, cihazlarını ve aboneliklerini kullanacak.',
      'Dein Profil ist gespeichert. Qor AI nutzt jetzt Ökosystem, Budget, Prioritäten, Geräte und Abos für Produkt-KI, Link-Analyse und Abo-Analyse.',
    );
    const entry = {
      type: 'onboarding',
      mode: 'onboarding',
      category: primaryCategory,
      score: 100,
      timestamp: submittedAt,
      questionCount: answersList.length,
      answers: answersList,
      groupedAnswers: grouped(answersList),
      result: recommendation,
      recommendation,
    };
    const country = user.country || (lang === 'tr' ? 'TR' : lang === 'de' ? 'DE' : 'GB');
    const currency = user.currency || (lang === 'tr' ? 'TRY' : lang === 'de' ? 'EUR' : 'GBP');
    try {
      await updateProfile({
        ageRange: answers.ageRange,
        ecosystem: answers.ecosystem,
        budgetRange: answers.budgetRange,
        priorities: answers.priorities,
        currentDevices: answers.currentDevices.filter((x) => x !== 'none'),
        subscriptions: answers.subscriptions.includes('none') ? [] : answers.subscriptions,
        country,
        language: lang,
        currency,
        interestCategories: answers.interestCategories,
        usageIntent: answers.usageIntent || 'all',
        profession: answers.profession,
        primaryCategory,
        profileVector: buildVector(answers, primaryCategory),
        quizCompleted: true,
        quizHistory: [entry, ...(Array.isArray(user.quizHistory) ? user.quizHistory : [])].slice(0, 30),
      });
      // Survive PB schema drift: never bounce this browser back to the quiz.
      markQuizCompletedLocal(user.id);
      trackEvent('quiz_complete');
      setSummary(recommendation);
      setDone(true);
    } catch {
      setErr(L('Profile could not be saved. Try again.', 'Profil kaydedilemedi. Tekrar dene.', 'Profil konnte nicht gespeichert werden.'));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    const heroCat = answers.interestCategories[0];
    const heroImg = heroCat ? visuals[visualCategory(heroCat)] : '';
    const tags = [
      answers.ecosystem && optionLabel(STEPS[1], answers.ecosystem, lang),
      answers.budgetRange && optionLabel(STEPS[2], answers.budgetRange, lang),
      answers.profession && optionLabel(STEPS[7], answers.profession, lang),
      ...answers.interestCategories.slice(0, 3).map((v) => optionLabel(STEPS[0], v, lang)),
    ].filter(Boolean);
    return (
      <div className="oq-shell">
        <QuizBackdrop />
        <div className="oq-done">
          <div className="oq-done-hero">
            {heroImg
              ? <img src={heroImg} alt="" />
              : <span className="oq-done-spark"><QuizGlyph field="x" value="_default" /></span>}
            <span className="oq-done-check">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
            </span>
          </div>
          <div className="oq-done-head">{required ? L('Profile ready', 'Profil hazır', 'Profil bereit') : L('All set!', 'Hazır!', 'Fertig!')}</div>
          <h1>{L('Your Qor AI profile is live', 'Qor AI profilin hazır', 'Dein Qor AI Profil ist aktiv')}</h1>
          <p>{summary}</p>
          <div className="oq-done-tags">
            {tags.map((tg, i) => <span key={`${tg}-${i}`}>{tg}</span>)}
          </div>
          <div className="oq-foot-row oq-done-actions">
            <button className="oq-btn oq-btn-ghost" onClick={() => { setDone(false); setStep(0); }}>{t('quiz.restart')}</button>
            <button className="oq-btn oq-btn-primary" onClick={() => nav(nextPath, { replace: true })}>
              {L('Continue', 'Devam et', 'Weiter')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const progress = ((step + 1) / total) * 100;
  const isLast = step + 1 >= total;

  return (
    <div className="oq-shell">
      <QuizBackdrop />

      <header className="oq-top">
        <button className="oq-top-back" onClick={goBack} aria-label={t('quiz.back')}>
          <BackIcon close={step === 0} />
        </button>
        <div className="oq-top-meta">
          <span className="oq-brand">Qor AI</span>
          <span className="oq-stepno">{t('quiz.step', { n: step + 1, total })}</span>
        </div>
        <div className="oq-progress"><div className="oq-progress-bar" style={{ width: `${progress}%` }} /></div>
      </header>

      <div className="oq-scroll">
        <div key={step} className="oq-step">
          <h1 className="oq-title">{tx(lang, current.title)}</h1>
          {current.subtitle && <p className="oq-sub">{tx(lang, current.subtitle)}</p>}

          {current.multiple && (
            <div className={'oq-counter' + (canContinue ? ' ok' : '')}>
              <span className="oq-counter-dot">
                {canContinue
                  ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
                  : <span>{selectedCount}</span>}
              </span>
              {current.min > 1
                ? L(`Select at least ${current.min}`, `En az ${current.min} seç`, `Mindestens ${current.min} wählen`)
                : L('Multiple choices allowed', 'Birden fazla seçebilirsin', 'Mehrfachauswahl möglich')}
              <b>{selectedCount}{current.min > 1 ? `/${current.min}` : ''}</b>
            </div>
          )}

          <div className="oq-grid">
            {visibleOptions.map((o, idx) => {
              const value = o[0];
              const label = optionText(o, lang);
              const on = current.multiple
                ? Array.isArray(selected) && selected.includes(value)
                : selected === value;
              const imageKey = `${current.field}:${value}`;
              return (
                <button
                  key={value}
                  type="button"
                  className={'oq-choice' + (on ? ' on' : '')}
                  onClick={() => pick(value)}
                  aria-pressed={on}
                  style={{ '--i': idx % REVEAL_BATCH }}
                >
                  <span className="oq-art">
                    <OptionVisual
                      step={current}
                      option={o}
                      visuals={visuals}
                      broken={brokenImages[imageKey]}
                      onBroken={() => setBrokenImages((prev) => ({ ...prev, [imageKey]: true }))}
                    />
                    <span className="oq-check">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
                    </span>
                  </span>
                  <span className="oq-label">{label}</span>
                </button>
              );
            })}
          </div>

          {hasMoreOptions && (
            <button type="button" className="oq-more" onClick={revealMore}>
              {L('Show more options', 'Daha fazla seçenek', 'Mehr Optionen')}
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
          )}
        </div>
      </div>

      <footer className="oq-foot">
        {err && <div className="oq-err">{err}</div>}
        {required && step === 0 && !err && (
          <div className="oq-required-note">
            {L('Complete this once to unlock AI features.', 'AI özelliklerini açmak için bunu bir kez tamamla.', 'Schließe dies einmal ab, um KI-Funktionen freizuschalten.')}
          </div>
        )}
        <div className="oq-foot-row">
          {step > 0 && (
            <button className="oq-btn oq-btn-ghost" onClick={goBack} disabled={busy}>
              {t('quiz.back')}
            </button>
          )}
          <button className="oq-btn oq-btn-primary oq-btn-grow" onClick={goNext} disabled={busy}>
            {busy
              ? t('common.loading')
              : isLast
                ? L('Create my profile', 'Profilimi oluştur', 'Profil erstellen')
                : L('Continue', 'Devam et', 'Weiter')}
            {!busy && (
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                {isLast ? <path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z" /> : <path d="M5 12h14M13 6l6 6-6 6" />}
              </svg>
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}

function QuizBackdrop() {
  return (
    <div className="oq-bg" aria-hidden="true">
      <span className="oq-orb oq-orb-1" />
      <span className="oq-orb oq-orb-2" />
      <span className="oq-orb oq-orb-3" />
    </div>
  );
}
