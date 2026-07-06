import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { updateProfile } from '../lib/pocketbase';
import { markQuizCompletedLocal, markQuizSkippedLocal, hasCompletedQuiz, saveQuizAnswersLocal, readQuizAnswersLocal } from '../lib/qorCoins';
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

const ALL_VISUAL_APP_CATEGORIES = [...new Set([...QUIZ_CATEGORY_UNIVERSE, ...DEVICE_CATEGORY_UNIVERSE])];
const QUIZ_VISUAL_CATEGORIES = [...new Set(ALL_VISUAL_APP_CATEGORIES.map(visualCategory))];

// getCategoryVisuals returns { tsCategory: [topImages] }. Assign a DISTINCT
// image to each app-category so steps whose categories share one Typesense
// category (cameras/lenses, speakers/soundbars, security/ip cameras…) never
// show the same picture twice.
function assignDistinctVisuals(lists) {
  const used = new Set();
  const cursor = {};
  const out = {};
  for (const value of ALL_VISUAL_APP_CATEGORIES) {
    const tsCat = visualCategory(value);
    const arr = lists[tsCat] || [];
    let chosen = '';
    let i = cursor[tsCat] || 0;
    for (; i < arr.length; i += 1) {
      if (!used.has(arr[i])) { chosen = arr[i]; i += 1; break; }
    }
    cursor[tsCat] = i;
    if (!chosen) chosen = arr[0] || ''; // data has fewer products than sharers
    if (chosen) { used.add(chosen); out[value] = chosen; }
  }
  return out;
}

function optionArtwork(step, value, coverMap) {
  if (!USES_PRODUCT_COVERS.has(step.field)) return '';
  return coverMap[value] || '';
}

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

export const STEPS = [
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
      ['data_scientist', 'Data scientist', 'Veri bilimci', 'Data Scientist'],
      ['it_admin', 'IT / sysadmin', 'IT / Sistem', 'IT / Admin'],
      ['marketer', 'Marketing', 'Pazarlama', 'Marketing'],
      ['sales', 'Sales', 'Satış', 'Vertrieb'],
      ['consultant', 'Consultant', 'Danışman', 'Berater/in'],
      ['architect', 'Architect', 'Mimar', 'Architekt/in'],
      ['scientist', 'Scientist', 'Bilim insanı', 'Wissenschaftler/in'],
      ['lawyer', 'Lawyer', 'Avukat', 'Jurist/in'],
      ['writer', 'Writer', 'Yazar', 'Autor/in'],
      ['artist', 'Artist', 'Sanatçı', 'Künstler/in'],
      ['musician', 'Musician', 'Müzisyen', 'Musiker/in'],
      ['streamer', 'Streamer', 'Yayıncı', 'Streamer/in'],
      ['other', 'Other', 'Diğer', 'Andere'],
    ],
  },
  {
    field: 'hobbies',
    multiple: true,
    min: 1,
    title: { en: 'What are you into outside of work?', tr: 'İş dışında nelerle ilgilenirsin?', de: 'Was machst du in deiner Freizeit?' },
    subtitle: { en: 'Your hobbies sharpen which questions and picks Qor AI gives you.', tr: 'Hobilerin, Qor AI’ın sana soracağı soruları ve önerileri keskinleştirir.', de: 'Deine Hobbys schärfen die Fragen und Empfehlungen von Qor AI.' },
    options: [
      ['gaming', 'Gaming', 'Oyun', 'Gaming'],
      ['photography', 'Photography', 'Fotoğrafçılık', 'Fotografie'],
      ['video', 'Video & filmmaking', 'Video & film', 'Video & Film'],
      ['music', 'Music & audio', 'Müzik & ses', 'Musik & Audio'],
      ['coding', 'Coding', 'Kodlama', 'Programmieren'],
      ['pc_building', 'PC building', 'PC toplama', 'PC-Bau'],
      ['design', 'Design & art', 'Tasarım & sanat', 'Design & Kunst'],
      ['streaming', 'Movies & series', 'Film & dizi', 'Filme & Serien'],
      ['fitness', 'Fitness & sports', 'Fitness & spor', 'Fitness & Sport'],
      ['travel', 'Travel', 'Seyahat', 'Reisen'],
      ['reading', 'Reading', 'Okuma', 'Lesen'],
      ['smart_home', 'Smart home', 'Akıllı ev', 'Smart Home'],
      ['drones', 'Drones & RC', 'Drone & RC', 'Drohnen & RC'],
      ['diy', 'DIY & making', 'DIY & üretim', 'DIY & Basteln'],
      ['cooking', 'Cooking', 'Yemek', 'Kochen'],
      ['esports', 'Esports', 'E-spor', 'E-Sport'],
      ['cars', 'Cars & autos', 'Araba & oto', 'Autos'],
      ['outdoors', 'Outdoors & hiking', 'Doğa & yürüyüş', 'Outdoor & Wandern'],
      ['cycling', 'Cycling', 'Bisiklet', 'Radfahren'],
      ['investing', 'Investing', 'Yatırım', 'Investieren'],
      ['anime', 'Anime & manga', 'Anime & manga', 'Anime & Manga'],
      ['board_games', 'Board games', 'Kutu oyunları', 'Brettspiele'],
      ['podcasting', 'Podcasting', 'Podcast', 'Podcasting'],
      ['gardening', 'Gardening', 'Bahçe', 'Gärtnern'],
      ['fashion', 'Fashion', 'Moda', 'Mode'],
      ['other', 'Other', 'Diğer', 'Andere'],
    ],
  },
  {
    field: 'subscriptions',
    multiple: true,
    min: 1,
    title: { en: 'Which subscriptions are part of your life?', tr: 'Hangi abonelikler hayatında var?', de: 'Welche Abos nutzt du?' },
    subtitle: { en: 'Pick "none" if you do not use any.', tr: 'Kullanmıyorsan "Yok" seç.', de: 'Wähle "keine", wenn du keine nutzt.' },
    // [value, en, tr, de, simpleicons-slug] — slug guarantees a crisp,
    // brand-coloured SVG logo (no broken hot-links). Values mirror the app.
    options: [
      ['none', 'None', 'Yok', 'Keine', ''],
      ['netflix', 'Netflix', 'Netflix', 'Netflix', 'netflix'],
      ['disney_plus', 'Disney+', 'Disney+', 'Disney+', 'disneyplus'],
      ['prime_video', 'Prime Video', 'Prime Video', 'Prime Video', 'primevideo'],
      ['apple_tv_plus', 'Apple TV+', 'Apple TV+', 'Apple TV+', 'appletv'],
      ['max', 'Max', 'Max', 'Max', 'max'],
      ['hulu', 'Hulu', 'Hulu', 'Hulu', 'hulu'],
      ['crunchyroll', 'Crunchyroll', 'Crunchyroll', 'Crunchyroll', 'crunchyroll'],
      ['paramount_plus', 'Paramount+', 'Paramount+', 'Paramount+', 'paramountplus'],
      ['twitch', 'Twitch', 'Twitch', 'Twitch', 'twitch'],
      ['dazn', 'DAZN', 'DAZN', 'DAZN', 'dazn'],
      ['spotify', 'Spotify', 'Spotify', 'Spotify', 'spotify'],
      ['apple_music', 'Apple Music', 'Apple Music', 'Apple Music', 'applemusic'],
      ['youtube_music', 'YouTube Music', 'YouTube Music', 'YouTube Music', 'youtubemusic'],
      ['youtube_premium', 'YouTube Premium', 'YouTube Premium', 'YouTube Premium', 'youtube'],
      ['tidal', 'Tidal', 'Tidal', 'Tidal', 'tidal'],
      ['deezer', 'Deezer', 'Deezer', 'Deezer', 'deezer'],
      ['soundcloud_go', 'SoundCloud', 'SoundCloud', 'SoundCloud', 'soundcloud'],
      ['audible', 'Audible', 'Audible', 'Audible', 'audible'],
      ['icloud', 'iCloud+', 'iCloud+', 'iCloud+', 'icloud'],
      ['google_one', 'Google One', 'Google One', 'Google One', 'google'],
      ['microsoft_365', 'Microsoft 365', 'Microsoft 365', 'Microsoft 365', 'microsoft'],
      ['google_workspace', 'Google Workspace', 'Google Workspace', 'Google Workspace', 'google'],
      ['dropbox', 'Dropbox', 'Dropbox', 'Dropbox', 'dropbox'],
      ['onedrive', 'OneDrive', 'OneDrive', 'OneDrive', 'microsoftonedrive'],
      ['amazon_prime', 'Amazon Prime', 'Amazon Prime', 'Amazon Prime', 'amazonprime'],
      ['game_pass', 'Xbox Game Pass', 'Xbox Game Pass', 'Xbox Game Pass', 'xbox'],
      ['ps_plus', 'PlayStation Plus', 'PlayStation Plus', 'PlayStation Plus', 'playstation'],
      ['switch_online', 'Nintendo Online', 'Nintendo Online', 'Nintendo Online', 'nintendoswitch'],
      ['geforce_now', 'GeForce NOW', 'GeForce NOW', 'GeForce NOW', 'nvidia'],
      ['adobe_cc', 'Adobe CC', 'Adobe CC', 'Adobe CC', 'adobe'],
      ['canva', 'Canva', 'Canva', 'Canva', 'canva'],
      ['figma', 'Figma', 'Figma', 'Figma', 'figma'],
      ['notion', 'Notion', 'Notion', 'Notion', 'notion'],
      ['slack', 'Slack', 'Slack', 'Slack', 'slack'],
      ['zoom', 'Zoom', 'Zoom', 'Zoom', 'zoom'],
      ['grammarly', 'Grammarly', 'Grammarly', 'Grammarly', 'grammarly'],
      ['chatgpt_plus', 'ChatGPT Plus', 'ChatGPT Plus', 'ChatGPT Plus', 'openai'],
      ['claude', 'Claude Pro', 'Claude Pro', 'Claude Pro', 'anthropic'],
      ['google_ai_premium', 'Gemini Advanced', 'Gemini Advanced', 'Gemini Advanced', 'googlegemini'],
      ['perplexity', 'Perplexity Pro', 'Perplexity Pro', 'Perplexity Pro', 'perplexity'],
      ['github_copilot', 'GitHub Copilot', 'GitHub Copilot', 'GitHub Copilot', 'githubcopilot'],
      ['midjourney', 'Midjourney', 'Midjourney', 'Midjourney', 'midjourney'],
      ['nordvpn', 'NordVPN', 'NordVPN', 'NordVPN', 'nordvpn'],
      ['expressvpn', 'ExpressVPN', 'ExpressVPN', 'ExpressVPN', 'expressvpn'],
      ['surfshark', 'Surfshark', 'Surfshark', 'Surfshark', 'surfshark'],
      ['proton', 'Proton', 'Proton', 'Proton', 'proton'],
      ['1password', '1Password', '1Password', '1Password', '1password'],
      ['bitwarden', 'Bitwarden', 'Bitwarden', 'Bitwarden', 'bitwarden'],
      ['x_premium', 'X Premium', 'X Premium', 'X Premium', 'x'],
      ['reddit_premium', 'Reddit Premium', 'Reddit Premium', 'Reddit Premium', 'reddit'],
      ['discord_nitro', 'Discord Nitro', 'Discord Nitro', 'Discord Nitro', 'discord'],
      ['telegram_premium', 'Telegram Premium', 'Telegram Premium', 'Telegram Premium', 'telegram'],
      ['snapchat_plus', 'Snapchat+', 'Snapchat+', 'Snapchat+', 'snapchat'],
      ['linkedin_premium', 'LinkedIn Premium', 'LinkedIn Premium', 'LinkedIn Premium', 'linkedin'],
      ['duolingo', 'Duolingo', 'Duolingo', 'Duolingo', 'duolingo'],
      ['coursera', 'Coursera', 'Coursera', 'Coursera', 'coursera'],
      ['udemy', 'Udemy', 'Udemy', 'Udemy', 'udemy'],
      ['skillshare', 'Skillshare', 'Skillshare', 'Skillshare', 'skillshare'],
      ['strava', 'Strava', 'Strava', 'Strava', 'strava'],
      ['fitbit_premium', 'Fitbit Premium', 'Fitbit Premium', 'Fitbit Premium', 'fitbit'],
      ['headspace', 'Headspace', 'Headspace', 'Headspace', 'headspace'],
    ],
  },
];

function tx(lang, value) {
  if (!value) return '';
  return value[lang] || value.en || '';
}

export function optionLabel(step, value, lang) {
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
    hobbies: fromArray(user?.hobbies),
    subscriptions: fromArray(user?.subscriptions).length ? fromArray(user?.subscriptions) : ['none'],
  };
}

// Some PocketBase deployments don't have every onboarding column (schema drift
// vs. the app), so they silently drop fields like interestCategories / hobbies /
// profession on save and echo them back empty — which made the summary show
// "—" everywhere. The profileVector JSON *does* persist and encodes every
// signal, so we rebuild the answers from it whenever a dedicated field is empty.
function valuesFromVector(vector, prefix) {
  return Object.keys(vector || {})
    .filter((k) => k.startsWith(prefix) && vector[k])
    .map((k) => k.slice(prefix.length))
    .filter(Boolean);
}

export function profileAnswers(user) {
  const base = emptyAnswers(user);
  // Locally-cached submitted answers (this browser) are the most reliable when
  // PB drops columns — overlay them first, then fill any remaining gaps from
  // the profileVector below.
  const cached = readQuizAnswersLocal(user?.id);
  if (cached) {
    for (const k of Object.keys(base)) {
      const cv = cached[k];
      if (Array.isArray(base[k])) { if (Array.isArray(cv) && cv.length) base[k] = cv; }
      else if (!base[k] && cv) base[k] = cv;
    }
  }
  const vector = user?.profileVector && typeof user.profileVector === 'object' ? user.profileVector : {};
  if (!base.interestCategories.length) base.interestCategories = valuesFromVector(vector, 'category_');
  if (!base.priorities.length) base.priorities = valuesFromVector(vector, 'priority_');
  if (!base.currentDevices.length) base.currentDevices = valuesFromVector(vector, 'device_');
  if (!base.hobbies.length) base.hobbies = valuesFromVector(vector, 'hobby_');
  if (!base.profession) base.profession = valuesFromVector(vector, 'profession_')[0] || '';
  if (!base.usageIntent) base.usageIntent = valuesFromVector(vector, 'usage_')[0] || '';
  if (!base.ageRange) base.ageRange = valuesFromVector(vector, 'age_')[0] || '';
  if (!base.ecosystem) {
    base.ecosystem = vector.apple_affinity ? 'apple'
      : vector.windows_affinity ? 'windows'
        : vector.google_affinity ? 'google'
          : vector.android_affinity ? 'android' : '';
  }
  if (!base.budgetRange && typeof vector.budget_score === 'number') {
    const b = vector.budget_score;
    base.budgetRange = b <= 0.25 ? 'low' : b <= 0.55 ? 'mid' : b <= 0.75 ? 'high' : 'premium';
  }
  const subsFromVec = valuesFromVector(vector, 'subscription_');
  if ((!base.subscriptions.length || (base.subscriptions.length === 1 && base.subscriptions[0] === 'none')) && subsFromVec.length) {
    base.subscriptions = subsFromVec;
  }
  return base;
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
  (answers.hobbies || []).filter((h) => h !== 'other').forEach((h) => { vector[`hobby_${h}`] = 1; });
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

// Every category/device option uses one consistent inline icon set (QuizGlyph),
// not catalog product photos — so the whole quiz looks uniform and each option
// has its own distinct glyph. Subscriptions keep their brand logos; age is text.
function OptionVisual({ step, option }) {
  const value = option[0];
  const label = optionText(option, 'en'); // SubLogo matches by canonical English name
  if (step.field === 'subscriptions' && value !== 'none') {
    return <SubLogo name={label} slug={option[4] || ''} size={64} radius={18} />;
  }
  if (step.field === 'ageRange') {
    return <span className="oq-age">{value}</span>;
  }
  return <span className="oq-glyph"><QuizGlyph field={step.field} value={value} /></span>;
}

export default function Quiz() {
  const { t, lang } = useI18n();
  const { user, openAuth } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  // Where to send the user once the quiz is done. The onboarding gate captures
  // whatever page they were on, but landing them on Terms / a policy page (or
  // back on the quiz) after finishing feels broken — fall back to Home for those.
  const POST_QUIZ_BLOCKED = ['/quiz', '/terms', '/privacy', '/refund', '/cookies', '/contact', '/about', '/faq'];
  const rawNext = params.get('next') || '/';
  const nextPath = POST_QUIZ_BLOCKED.some((p) => rawNext === p || rawNext.startsWith(`${p}?`) || rawNext.startsWith(`${p}/`)) ? '/' : rawNext;
  const L = (en, tr, de) => (lang === 'tr' ? tr : lang === 'de' ? de : en);

  useSeo({ title: `${t('quiz.title')} — Qor AI`, description: t('quiz.subtitle'), path: '/quiz' });

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState(() => emptyAnswers(user));
  // The exact selections the user submitted — kept so the completion summary
  // always shows what they picked, even if PocketBase drops some columns and
  // the refreshed `user` (which re-seeds `answers`) comes back sparse.
  const [finalAnswers, setFinalAnswers] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const [visuals, setVisuals] = useState({});
  const [brokenImages, setBrokenImages] = useState({});
  const [visibleCounts, setVisibleCounts] = useState({});

  // Seed the form from the saved profile only ONCE per account. The auth context
  // hands back a brand-new `user` object every time useUserSync refreshes it (tab
  // focus / visibility change) — and an OAuth signup fires a focus event the
  // instant the Google popup closes, right in the middle of the quiz. Re-seeding
  // on every `user` change wiped the early selections (categories, priorities,
  // devices, profession), so only the last steps survived to submit and the
  // summary came back as "—". Seeding once keeps in-progress answers intact.
  const seededForUser = useRef(null);
  useEffect(() => {
    if (!user) { openAuth(); return; }
    if (seededForUser.current !== user.id) {
      seededForUser.current = user.id;
      setAnswers(emptyAnswers(user));
    }
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

  const coverMap = useMemo(() => assignDistinctVisuals(visuals), [visuals]);

  if (!user) {
    return (
      <div className="oq-shell">
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

  // Skip onboarding: leave the quiz from any step and browse freely. Remembered
  // per user so the passive gate won't force them back. AI stays locked until
  // they actually complete it (hasCompletedQuiz), so nothing is unlocked here.
  function skip() {
    if (user) markQuizSkippedLocal(user.id);
    nav(nextPath, { replace: true });
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
      hobbies: 'profile',
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
    setFinalAnswers({ ...answers });
    saveQuizAnswersLocal(user.id, { ...answers });
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
        hobbies: answers.hobbies,
        primaryCategory,
        profileVector: buildVector(answers, primaryCategory),
        quizCompleted: true,
        quizHistory: [entry, ...(Array.isArray(user.quizHistory) ? user.quizHistory : [])].slice(0, 30),
      });
      // Survive PB schema drift: never bounce this browser back to the quiz.
      markQuizCompletedLocal(user.id);
      trackEvent('quiz_complete');
      setDone(true);
    } catch {
      setErr(L('Profile could not be saved. Try again.', 'Profil kaydedilemedi. Tekrar dene.', 'Profil konnte nicht gespeichert werden.'));
    } finally {
      setBusy(false);
    }
  }

  // Quiz is once-only: a freshly-finished (done) OR previously-completed user
  // sees the profile summary instead of the questions — no "retake".
  if (done || hasCompletedQuiz(user)) {
    // Prefer exactly what was just submitted; otherwise rebuild from the saved
    // profile (+ vector) so a returning user still sees a full recap.
    const view = finalAnswers || profileAnswers(user);
    const heroCat = view.interestCategories[0] || 'smartphones';
    const catLabels = (view.interestCategories || []).slice(0, 6).map((v) => optionLabel(STEPS[0], v, lang));
    const devLabels = (view.currentDevices || []).filter((x) => x !== 'none').slice(0, 5).map((v) => optionLabel(STEPS[4], v, lang));
    const prioLabels = (view.priorities || []).map((v) => optionLabel(STEPS[3], v, lang));
    const subs = (view.subscriptions || []).filter((x) => x !== 'none');
    const eco = view.ecosystem ? optionLabel(STEPS[1], view.ecosystem, lang) : '';
    const budget = view.budgetRange ? optionLabel(STEPS[2], view.budgetRange, lang) : '';
    const usage = view.usageIntent ? optionLabel(STEPS[5], view.usageIntent, lang) : '';
    const prof = view.profession ? optionLabel(STEPS[7], view.profession, lang) : '';
    const hobbyLabels = (view.hobbies || []).filter((x) => x !== 'other').map((v) => optionLabel(STEPS[8], v, lang));
    const age = view.ageRange || '';
    const dash = (arr) => arr.filter(Boolean).join(' · ') || '—';
    const chips = [eco, budget, prof, usage, ...catLabels.slice(0, 3)].filter(Boolean);
    const headline = catLabels.slice(0, 2).join(' · ') || t('quiz.title');
    const cards = [
      { tone: 'c', icon: 'all', title: L('Discovery profile', 'Keşif profili', 'Entdeckungsprofil'), body: dash(catLabels) },
      { tone: 'v', icon: 'mixed', title: L('Current setup', 'Mevcut kurulum', 'Aktuelles Setup'), body: dash([eco, ...devLabels]) },
      { tone: 'g', icon: 'quality', title: L('Decision priorities', 'Karar öncelikleri', 'Prioritäten'), body: dash(prioLabels) },
      { tone: 'a', icon: 'productivity', title: L('Usage & profile', 'Kullanım & profil', 'Nutzung & Profil'), body: dash([prof, usage, age]) },
      { tone: 'g', icon: 'gaming', title: L('Hobbies & interests', 'Hobiler & ilgi alanları', 'Hobbys & Interessen'), body: dash(hobbyLabels) },
      {
        tone: 'b', icon: 'ecosystem', title: L('Services', 'Servisler', 'Dienste'),
        body: subs.length
          ? `${subs.length} ${L('services', 'servis', 'Dienste')} · ${subs.slice(0, 4).map((s) => optionLabel(STEPS[9], s, lang)).join(', ')}`
          : L('No subscriptions', 'Abonelik yok', 'Keine Abos'),
      },
    ];
    return (
      <div className="oq-shell">
        <div className="oq-scroll">
          <div className="oq-summary">
            <div className="oq-sum-hero">
              <div className="oq-sum-thumb">
                <span className="oq-glyph"><QuizGlyph field="x" value={heroCat} /></span>
                <span className="oq-sum-thumb-check">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
                </span>
              </div>
              <div className="oq-sum-hero-text">
                <span className="oq-sum-eyebrow">{L('PROFILE READY', 'PROFİLİN HAZIR', 'PROFIL BEREIT')}</span>
                <h1>{headline}</h1>
                <p>{L('Qor AI now personalises every recommendation, link analysis and chat to this profile.', 'Qor AI artık tüm önerileri, link analizini ve sohbeti bu profile göre kişiselleştiriyor.', 'Qor AI personalisiert ab jetzt alles nach diesem Profil.')}</p>
              </div>
            </div>
            {chips.length > 0 && (
              <div className="oq-sum-chips">{chips.map((c, i) => <span key={`${c}-${i}`}>{c}</span>)}</div>
            )}
            <div className="oq-sum-cards">
              {cards.map((card) => (
                <div className={`oq-sum-card tone-${card.tone}`} key={card.title}>
                  <span className="oq-sum-card-icon"><QuizGlyph field="card" value={card.icon} /></span>
                  <div className="oq-sum-card-text">
                    <strong>{card.title}</strong>
                    <span>{card.body}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <footer className="oq-foot">
          <div className="oq-foot-row">
            <button className="oq-btn oq-btn-primary oq-btn-grow" onClick={() => nav(nextPath, { replace: true })}>
              {L('Start exploring', 'Keşfe başla', 'Loslegen')}
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </div>
        </footer>
      </div>
    );
  }

  const progress = ((step + 1) / total) * 100;
  const isLast = step + 1 >= total;

  return (
    <div className="oq-shell">
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
                    <span className="oq-art-media">
                      <OptionVisual step={current} option={o} />
                    </span>
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
        <button type="button" className="oq-skip-link" onClick={skip} disabled={busy}>
          {L('Skip for now — you can do this later', 'Şimdilik geç — sonra tamamlayabilirsin', 'Später — du kannst das später machen')}
        </button>
      </footer>
    </div>
  );
}
