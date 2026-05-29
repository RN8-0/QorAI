/**
 * Qor AI translation dictionary seeder.
 *
 * Pre-populates the shared tr_translation_dict in PocketBase with a curated
 * map of Turkish product-spec terms and their high-quality translations
 * into EN/DE/ES/FR/PT/RU. The scrape pipeline checks this dict BEFORE
 * calling Argos or DeepSeek, so every term we seed here turns into a free
 * cache hit during the full 100k scrape — no GPU time, no API spend, no
 * residue cleanup, and guaranteed quality because the strings come straight
 * out of this file.
 *
 * The mapping below covers the cross-category vocabulary the user has been
 * seeing leak into EN views (Apple Watch health terms, CPU/GPU spec keys,
 * smartphone connectivity, laptop ports, …). Add to the SEED object below
 * whenever a new Turkish term shows up that Argos butchers — `node
 * scripts/seed_translation_dict.js --confirm` reuploads the whole map.
 *
 * Usage:
 *   node scripts/seed_translation_dict.js          # dry-run, prints count
 *   node scripts/seed_translation_dict.js --confirm  # write to PB
 *
 * Safe to run after wipe_translation_dict.js — it rebuilds the shard
 * manifest from scratch.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function loadEnv(p) {
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}
const env = { ...loadEnv(path.join(__dirname, '..', 'migration', '.env')), ...process.env };
const PB_URL = (env.POCKETBASE_URL || '').replace(/\/$/, '');
const PB_EMAIL = env.POCKETBASE_ADMIN_EMAIL;
const PB_PASSWORD = env.POCKETBASE_ADMIN_PASSWORD;
const CONFIRM = process.argv.includes('--confirm');

if (!PB_URL || !PB_EMAIL || !PB_PASSWORD) {
  console.error('Missing POCKETBASE_URL / EMAIL / PASSWORD in migration/.env');
  process.exit(1);
}

const DICT_PB_KEY = 'tr_translation_dict';
const DICT_MANIFEST_KEY = `${DICT_PB_KEY}_manifest`;
const DICT_SHARD_PREFIX = `${DICT_PB_KEY}__part_`;
const DICT_SHARD_MAX_BYTES = 180000;

const LANGS = ['en', 'de', 'es', 'fr', 'pt', 'ru'];

// ════════════════════════════════════════════════════════════════════════
//  SEED — curated TR → EN / DE / ES / FR / PT / RU translations.
//
//  Format: 'turkish text': ['en', 'de', 'es', 'fr', 'pt', 'ru']
//  Keys are lowercased + trimmed when stored (dict lookup is
//  case-insensitive via normalizeDictSourceKey).
// ════════════════════════════════════════════════════════════════════════
const SEED = {
  // ── Section headers (used by every product type) ────────────────────────
  'TEMEL BİLGİLER':           ['Basic Information', 'Allgemeine Informationen', 'Información Básica', 'Informations Générales', 'Informações Básicas', 'Основная Информация'],
  'Temel Bilgiler':           ['Basic Information', 'Allgemeine Informationen', 'Información Básica', 'Informations Générales', 'Informações Básicas', 'Основная Информация'],
  'TEKNİK BİLGİLER':          ['Technical Information', 'Technische Daten', 'Información Técnica', 'Informations Techniques', 'Informações Técnicas', 'Технические Характеристики'],
  'Teknik Bilgiler':          ['Technical Information', 'Technische Daten', 'Información Técnica', 'Informations Techniques', 'Informações Técnicas', 'Технические Характеристики'],
  'GENEL BİLGİLER':           ['General Information', 'Allgemeine Informationen', 'Información General', 'Informations Générales', 'Informações Gerais', 'Общая Информация'],
  'Genel Bilgiler':           ['General Information', 'Allgemeine Informationen', 'Información General', 'Informations Générales', 'Informações Gerais', 'Общая Информация'],
  'PERFORMANS':               ['Performance', 'Leistung', 'Rendimiento', 'Performance', 'Desempenho', 'Производительность'],
  'Performans':               ['Performance', 'Leistung', 'Rendimiento', 'Performance', 'Desempenho', 'Производительность'],
  'ÖNE ÇIKANLAR':             ['Highlights', 'Highlights', 'Destacados', 'Points Forts', 'Destaques', 'Главные Особенности'],
  'Öne Çıkanlar':             ['Highlights', 'Highlights', 'Destacados', 'Points Forts', 'Destaques', 'Главные Особенности'],
  'BAĞLANTILAR':              ['Connectivity', 'Konnektivität', 'Conectividad', 'Connectivité', 'Conectividade', 'Подключения'],
  'Bağlantılar':              ['Connectivity', 'Konnektivität', 'Conectividad', 'Connectivité', 'Conectividade', 'Подключения'],
  'BAĞLANTILAR & ARAYÜZLER':  ['Connectivity & Interfaces', 'Konnektivität & Schnittstellen', 'Conectividad e Interfaces', 'Connectivité et Interfaces', 'Conectividade e Interfaces', 'Подключения и Интерфейсы'],
  'BELLEK':                   ['Memory', 'Speicher', 'Memoria', 'Mémoire', 'Memória', 'Память'],
  'Bellek':                   ['Memory', 'Speicher', 'Memoria', 'Mémoire', 'Memória', 'Память'],
  'DEPOLAMA':                 ['Storage', 'Speicher', 'Almacenamiento', 'Stockage', 'Armazenamento', 'Хранилище'],
  'DEPOLAMA & OPTİK SÜRÜCÜ':  ['Storage & Optical Drive', 'Speicher & Optisches Laufwerk', 'Almacenamiento y Unidad Óptica', 'Stockage et Lecteur Optique', 'Armazenamento e Unidade Óptica', 'Хранилище и Оптический Привод'],
  'EKRAN':                    ['Display', 'Display', 'Pantalla', 'Écran', 'Tela', 'Дисплей'],
  'TASARIM':                  ['Design', 'Design', 'Diseño', 'Conception', 'Design', 'Дизайн'],
  'KAMERA':                   ['Camera', 'Kamera', 'Cámara', 'Caméra', 'Câmera', 'Камера'],
  'PİL':                      ['Battery', 'Akku', 'Batería', 'Batterie', 'Bateria', 'Аккумулятор'],
  'PİL & DİĞER':              ['Battery & Other', 'Akku & Sonstiges', 'Batería y Otros', 'Batterie et Autres', 'Bateria e Outros', 'Аккумулятор и Прочее'],
  'SES':                      ['Audio', 'Audio', 'Audio', 'Audio', 'Áudio', 'Звук'],
  'SENSÖR':                   ['Sensors', 'Sensoren', 'Sensores', 'Capteurs', 'Sensores', 'Датчики'],
  'SENSÖRLER':                ['Sensors', 'Sensoren', 'Sensores', 'Capteurs', 'Sensores', 'Датчики'],
  'YAZILIM':                  ['Software', 'Software', 'Software', 'Logiciel', 'Software', 'Программное обеспечение'],
  'İŞLETİM SİSTEMİ':          ['Operating System', 'Betriebssystem', 'Sistema Operativo', 'Système d\'Exploitation', 'Sistema Operacional', 'Операционная Система'],
  'İŞLEMCİ':                  ['Processor', 'Prozessor', 'Procesador', 'Processeur', 'Processador', 'Процессор'],
  'İŞLEMCİ DESTEĞİ':          ['Processor Support', 'Prozessor-Unterstützung', 'Soporte de Procesador', 'Support du Processeur', 'Suporte ao Processador', 'Поддержка Процессора'],
  'GRAFİK':                   ['Graphics', 'Grafik', 'Gráficos', 'Graphismes', 'Gráficos', 'Графика'],
  'DAHİLİ GRAFİK':            ['Integrated Graphics', 'Integrierte Grafik', 'Gráficos Integrados', 'Graphismes Intégrés', 'Gráficos Integrados', 'Встроенная Графика'],
  'HARİCİ GRAFİK':            ['Discrete Graphics', 'Dedizierte Grafik', 'Gráficos Discretos', 'Graphismes Dédiés', 'Gráficos Dedicados', 'Дискретная Графика'],
  'BAĞLANTI & ARAYÜZLER':     ['Connectivity & Interfaces', 'Konnektivität & Schnittstellen', 'Conectividad e Interfaces', 'Connectivité et Interfaces', 'Conectividade e Interfaces', 'Подключения и Интерфейсы'],
  'KLAVYE':                   ['Keyboard', 'Tastatur', 'Teclado', 'Clavier', 'Teclado', 'Клавиатура'],
  'FARE':                     ['Mouse', 'Maus', 'Ratón', 'Souris', 'Mouse', 'Мышь'],
  'Servisler ve Uygulamalar': ['Services and Applications', 'Dienste und Anwendungen', 'Servicios y Aplicaciones', 'Services et Applications', 'Serviços e Aplicações', 'Сервисы и Приложения'],
  'Spor ve aktivite':         ['Sport and Activity', 'Sport und Aktivität', 'Deporte y Actividad', 'Sport et Activité', 'Esporte e Atividade', 'Спорт и Активность'],
  'Sağlık ve Kalori Takibi':  ['Health and Calorie Tracking', 'Gesundheits- und Kalorienverfolgung', 'Seguimiento de Salud y Calorías', 'Suivi Santé et Calories', 'Monitoramento de Saúde e Calorias', 'Отслеживание Здоровья и Калорий'],

  // ── CPU / GPU spec keys (CPU was user's main pain point) ────────────────
  'Desteklediği Teknolojiler':['Supported Technologies', 'Unterstützte Technologien', 'Tecnologías Compatibles', 'Technologies Prises en Charge', 'Tecnologias Suportadas', 'Поддерживаемые Технологии'],
  'Jenerasyon':               ['Generation', 'Generation', 'Generación', 'Génération', 'Geração', 'Поколение'],
  'PassMark Puanı (Tekil)':   ['PassMark Single-Thread Score', 'PassMark Single-Thread-Bewertung', 'Puntuación PassMark de Hilo Único', 'Score PassMark Mono-Thread', 'Pontuação PassMark Single-Thread', 'Оценка PassMark (Однопоточная)'],
  'PassMark Puanı (Çoğul)':   ['PassMark Multi-Thread Score', 'PassMark Multi-Thread-Bewertung', 'Puntuación PassMark Multihilo', 'Score PassMark Multi-Thread', 'Pontuação PassMark Multi-Thread', 'Оценка PassMark (Многопоточная)'],
  'Çıkış Dönemi':             ['Release Quarter', 'Veröffentlichungsquartal', 'Trimestre de Lanzamiento', 'Trimestre de Sortie', 'Trimestre de Lançamento', 'Квартал Выхода'],
  'Çıkış Yılı':               ['Release Year', 'Veröffentlichungsjahr', 'Año de Lanzamiento', 'Année de Sortie', 'Ano de Lançamento', 'Год Выхода'],
  'İşlemci Ailesi':           ['Processor Family', 'Prozessorfamilie', 'Familia de Procesadores', 'Famille de Processeurs', 'Família de Processadores', 'Семейство Процессоров'],
  'İşlemci Mimarisi':         ['Processor Architecture', 'Prozessorarchitektur', 'Arquitectura del Procesador', 'Architecture du Processeur', 'Arquitetura do Processador', 'Архитектура Процессора'],
  'İşlemci Modeli':           ['Processor Model', 'Prozessormodell', 'Modelo de Procesador', 'Modèle de Processeur', 'Modelo de Processador', 'Модель Процессора'],
  'İşlemci Serisi':           ['Processor Series', 'Prozessorserie', 'Serie de Procesadores', 'Série de Processeurs', 'Série de Processadores', 'Серия Процессоров'],
  'İşlemci Türü':             ['Processor Type', 'Prozessortyp', 'Tipo de Procesador', 'Type de Processeur', 'Tipo de Processador', 'Тип Процессора'],
  'İşlemci Üst Modeli':       ['Processor Variant', 'Prozessorvariante', 'Variante del Procesador', 'Variante du Processeur', 'Variante do Processador', 'Вариант Процессора'],
  'İşlemci Üreticisi':        ['Processor Manufacturer', 'Prozessorhersteller', 'Fabricante del Procesador', 'Fabricant du Processeur', 'Fabricante do Processador', 'Производитель Процессора'],
  'İşlemci Markası':          ['Processor Brand', 'Prozessormarke', 'Marca del Procesador', 'Marque du Processeur', 'Marca do Processador', 'Бренд Процессора'],
  'İşlemci Teknolojileri':    ['Processor Technologies', 'Prozessortechnologien', 'Tecnologías del Procesador', 'Technologies du Processeur', 'Tecnologias do Processador', 'Технологии Процессора'],
  'İşlemci Modeli':           ['Processor Model', 'Prozessormodell', 'Modelo de Procesador', 'Modèle de Processeur', 'Modelo de Processador', 'Модель Процессора'],
  'İşlemci Nesli':            ['Processor Generation', 'Prozessorgeneration', 'Generación del Procesador', 'Génération du Processeur', 'Geração do Processador', 'Поколение Процессора'],
  'İşlemci Çekirdeği':        ['Processor Cores', 'Prozessorkerne', 'Núcleos del Procesador', 'Cœurs du Processeur', 'Núcleos do Processador', 'Ядра Процессора'],
  'İşlemci Önbellek':         ['Processor Cache', 'Prozessor-Cache', 'Caché del Procesador', 'Cache du Processeur', 'Cache do Processador', 'Кэш Процессора'],
  'İşlemci Temel Frekans':    ['Processor Base Frequency', 'Prozessor-Basistakt', 'Frecuencia Base del Procesador', 'Fréquence de Base du Processeur', 'Frequência Base do Processador', 'Базовая Частота Процессора'],
  'İşlemci Artırılmış Frekans':['Processor Boost Frequency', 'Prozessor-Turbotakt', 'Frecuencia Turbo del Procesador', 'Fréquence Boost du Processeur', 'Frequência Turbo do Processador', 'Турбо-Частота Процессора'],
  'İşlemci Çekirdek Detayları':['Processor Core Details', 'Prozessorkern-Details', 'Detalles de Núcleos del Procesador', 'Détails des Cœurs du Processeur', 'Detalhes dos Núcleos do Processador', 'Подробности Ядер Процессора'],
  'İşlemci Çıkış Yılı':       ['Processor Release Year', 'Prozessor-Veröffentlichungsjahr', 'Año de Lanzamiento del Procesador', 'Année de Sortie du Processeur', 'Ano de Lançamento do Processador', 'Год Выхода Процессора'],
  'Performans Çekirdeği':     ['Performance Core', 'Performance-Kern', 'Núcleo de Rendimiento', 'Cœur de Performance', 'Núcleo de Desempenho', 'Производительное Ядро'],
  'Verimlilik Çekirdeği':     ['Efficiency Core', 'Effizienzkern', 'Núcleo de Eficiencia', 'Cœur d\'Efficacité', 'Núcleo de Eficiência', 'Эффективное Ядро'],
  'Verimlilik Çek.Düşük Frekans':['Efficiency Core Base Frequency', 'Effizienzkern-Basistakt', 'Frecuencia Base del Núcleo de Eficiencia', 'Fréquence de Base du Cœur d\'Efficacité', 'Frequência Base do Núcleo de Eficiência', 'Базовая Частота Эффективного Ядра'],
  'Verimlilik Çek.Turbo Frekans':['Efficiency Core Turbo Frequency', 'Effizienzkern-Turbotakt', 'Frecuencia Turbo del Núcleo de Eficiencia', 'Fréquence Turbo du Cœur d\'Efficacité', 'Frequência Turbo do Núcleo de Eficiência', 'Турбо-Частота Эффективного Ядра'],
  'Sanal Çekirdek':           ['Logical Cores', 'Logische Kerne', 'Núcleos Lógicos', 'Cœurs Logiques', 'Núcleos Lógicos', 'Логические Ядра'],
  'Çekirdek':                 ['Cores', 'Kerne', 'Núcleos', 'Cœurs', 'Núcleos', 'Ядра'],
  'Çekirdek Sayısı':          ['Core Count', 'Kernanzahl', 'Número de Núcleos', 'Nombre de Cœurs', 'Número de Núcleos', 'Количество Ядер'],
  'İş Parçacığı':             ['Threads', 'Threads', 'Subprocesos', 'Threads', 'Threads', 'Потоки'],
  'Önbellek':                 ['Cache', 'Cache', 'Caché', 'Cache', 'Cache', 'Кэш'],
  'Önbellek L1':              ['Cache L1', 'Cache L1', 'Caché L1', 'Cache L1', 'Cache L1', 'Кэш L1'],
  'Önbellek L2':              ['Cache L2', 'Cache L2', 'Caché L2', 'Cache L2', 'Cache L2', 'Кэш L2'],
  'Önbellek L3':              ['Cache L3', 'Cache L3', 'Caché L3', 'Cache L3', 'Cache L3', 'Кэш L3'],
  'Temel Frekans':            ['Base Frequency', 'Basistakt', 'Frecuencia Base', 'Fréquence de Base', 'Frequência Base', 'Базовая Частота'],
  'Artırılmış Frekans':       ['Boost Frequency', 'Turbotakt', 'Frecuencia Turbo', 'Fréquence Boost', 'Frequência Turbo', 'Турбо-Частота'],
  'Boost Frekansı':           ['Boost Frequency', 'Turbotakt', 'Frecuencia Turbo', 'Fréquence Boost', 'Frequência Turbo', 'Турбо-Частота'],
  'Bellek Hızı':              ['Memory Speed', 'Speichergeschwindigkeit', 'Velocidad de Memoria', 'Vitesse Mémoire', 'Velocidade da Memória', 'Скорость Памяти'],
  'Bellek Türü':              ['Memory Type', 'Speichertyp', 'Tipo de Memoria', 'Type de Mémoire', 'Tipo de Memória', 'Тип Памяти'],
  'Bellek Frekansı':          ['Memory Frequency', 'Speichertakt', 'Frecuencia de Memoria', 'Fréquence Mémoire', 'Frequência da Memória', 'Частота Памяти'],
  'Bellek (RAM)':             ['RAM', 'RAM', 'RAM', 'RAM', 'RAM', 'ОЗУ'],
  'Bellek Kanalı':            ['Memory Channel', 'Speicherkanal', 'Canal de Memoria', 'Canal Mémoire', 'Canal de Memória', 'Канал Памяти'],
  'Toplam Bellek Yuvası':     ['Total Memory Slots', 'Speichersteckplätze gesamt', 'Ranuras de Memoria Totales', 'Emplacements Mémoire Totaux', 'Slots de Memória Totais', 'Всего Слотов Памяти'],
  'ECC Bellek Desteği':       ['ECC Memory Support', 'ECC-Speicher-Unterstützung', 'Compatibilidad con Memoria ECC', 'Support Mémoire ECC', 'Suporte a Memória ECC', 'Поддержка Памяти ECC'],
  '2.Bellek Hızı':            ['Secondary Memory Speed', 'Sekundäre Speichergeschwindigkeit', 'Velocidad de Memoria Secundaria', 'Vitesse Mémoire Secondaire', 'Velocidade da Memória Secundária', 'Скорость Вторичной Памяти'],
  '2.Bellek Türü':            ['Secondary Memory Type', 'Sekundärer Speichertyp', 'Tipo de Memoria Secundaria', 'Type de Mémoire Secondaire', 'Tipo de Memória Secundária', 'Тип Вторичной Памяти'],
  'PCIe Sürümü':              ['PCIe Version', 'PCIe-Version', 'Versión PCIe', 'Version PCIe', 'Versão PCIe', 'Версия PCIe'],
  'PCIe Hattı Sayısı':        ['PCIe Lane Count', 'PCIe-Lane-Anzahl', 'Número de Carriles PCIe', 'Nombre de Lignes PCIe', 'Número de Pistas PCIe', 'Количество Линий PCIe'],
  'PCIe Arayüzü':             ['PCIe Interface', 'PCIe-Schnittstelle', 'Interfaz PCIe', 'Interface PCIe', 'Interface PCIe', 'Интерфейс PCIe'],
  'Isı Yayma Kapasitesi (TDP)':['Thermal Design Power (TDP)', 'Verlustleistung (TDP)', 'Potencia de Diseño Térmico (TDP)', 'Enveloppe Thermique (TDP)', 'Potência de Projeto Térmico (TDP)', 'Тепловыделение (TDP)'],
  'Isı Yayma Kapasitesi':     ['Thermal Design Power', 'Verlustleistung', 'Potencia de Diseño Térmico', 'Enveloppe Thermique', 'Potência de Projeto Térmico', 'Тепловыделение'],
  'TDP':                      ['TDP', 'TDP', 'TDP', 'TDP', 'TDP', 'TDP'],
  'Sıcaklık':                 ['Temperature', 'Temperatur', 'Temperatura', 'Température', 'Temperatura', 'Температура'],
  'Soket':                    ['Socket', 'Sockel', 'Zócalo', 'Socket', 'Soquete', 'Сокет'],
  'Transistör Mesafesi':      ['Process Node', 'Strukturbreite', 'Nodo de Proceso', 'Finesse de Gravure', 'Nó de Processo', 'Техпроцесс'],
  'Yapay Zeka (YZ)':          ['Artificial Intelligence (AI)', 'Künstliche Intelligenz (KI)', 'Inteligencia Artificial (IA)', 'Intelligence Artificielle (IA)', 'Inteligência Artificial (IA)', 'Искусственный Интеллект (ИИ)'],
  'Yapay Zeka':               ['Artificial Intelligence', 'Künstliche Intelligenz', 'Inteligencia Artificial', 'Intelligence Artificielle', 'Inteligência Artificial', 'Искусственный Интеллект'],
  'YZ Performansı':           ['AI Performance', 'KI-Leistung', 'Rendimiento de IA', 'Performance IA', 'Desempenho de IA', 'Производительность ИИ'],
  'YZ Çekirdeği':             ['AI Cores', 'KI-Kerne', 'Núcleos de IA', 'Cœurs IA', 'Núcleos de IA', 'Ядра ИИ'],
  'YZ Hızlandırıcı':          ['AI Accelerator', 'KI-Beschleuniger', 'Acelerador de IA', 'Accélérateur IA', 'Acelerador de IA', 'Ускоритель ИИ'],
  'Çarpan Kilidi':            ['Multiplier Lock', 'Multiplikatorsperre', 'Bloqueo del Multiplicador', 'Verrouillage du Multiplicateur', 'Bloqueio do Multiplicador', 'Блокировка Множителя'],
  'Kapalı (Kilitli)':         ['Locked', 'Gesperrt', 'Bloqueado', 'Verrouillé', 'Bloqueado', 'Заблокирован'],
  'Açık (Kilidi Açık)':       ['Unlocked', 'Entsperrt', 'Desbloqueado', 'Déverrouillé', 'Desbloqueado', 'Разблокирован'],
  'Kilitli':                  ['Locked', 'Gesperrt', 'Bloqueado', 'Verrouillé', 'Bloqueado', 'Заблокирован'],
  'Kilidi Açık':              ['Unlocked', 'Entsperrt', 'Desbloqueado', 'Déverrouillé', 'Desbloqueado', 'Разблокирован'],
  'Kilidi':                   ['Lock', 'Sperre', 'Bloqueo', 'Verrouillage', 'Bloqueio', 'Блокировка'],

  // GPU specifics
  'Dahili Grafik İşlemci':    ['Integrated Graphics', 'Integrierte Grafik', 'Gráficos Integrados', 'Graphismes Intégrés', 'Gráficos Integrados', 'Встроенная Графика'],
  'Grafik İşlemci Modeli':    ['Graphics Processor Model', 'Grafikprozessormodell', 'Modelo del Procesador Gráfico', 'Modèle de Processeur Graphique', 'Modelo do Processador Gráfico', 'Модель Графического Процессора'],
  'Grafik İşlemci Çekirdeği': ['Graphics Processor Cores', 'Grafikprozessorkerne', 'Núcleos del Procesador Gráfico', 'Cœurs du Processeur Graphique', 'Núcleos do Processador Gráfico', 'Ядра Графического Процессора'],
  'Grafik Kartı Gücü':        ['Graphics Card Power', 'Grafikkartenleistung', 'Potencia de la Tarjeta Gráfica', 'Puissance de la Carte Graphique', 'Potência da Placa Gráfica', 'Мощность Видеокарты'],
  'Grafik İşlem Gücü':        ['Graphics Processing Power', 'Grafikrechenleistung', 'Potencia de Procesamiento Gráfico', 'Puissance de Traitement Graphique', 'Potência de Processamento Gráfico', 'Мощность Графической Обработки'],
  'Dahili Grafik Modeli':     ['Integrated Graphics Model', 'Integrierte-Grafik-Modell', 'Modelo de Gráficos Integrados', 'Modèle de Graphismes Intégrés', 'Modelo de Gráficos Integrados', 'Модель Встроенной Графики'],
  'Dahili Grafik Azami Frekans':['Integrated Graphics Max Frequency', 'Integrierte-Grafik-Maximaltakt', 'Frecuencia Máxima de Gráficos Integrados', 'Fréquence Maximale des Graphismes Intégrés', 'Frequência Máxima dos Gráficos Integrados', 'Максимальная Частота Встроенной Графики'],
  'Dahili Grafik Diğer Özellikler':['Integrated Graphics Other Features', 'Sonstige Funktionen der integrierten Grafik', 'Otras Características de Gráficos Integrados', 'Autres Caractéristiques des Graphismes Intégrés', 'Outras Características dos Gráficos Integrados', 'Прочие Возможности Встроенной Графики'],
  'Harici Grafik İşlemcisi (GPU)':['Discrete GPU', 'Dedizierte GPU', 'GPU Discreto', 'GPU Dédié', 'GPU Dedicado', 'Дискретный GPU'],
  'GPU Mimarisi':             ['GPU Architecture', 'GPU-Architektur', 'Arquitectura de GPU', 'Architecture du GPU', 'Arquitetura da GPU', 'Архитектура GPU'],
  'GPU Çıkış Yılı':           ['GPU Release Year', 'GPU-Veröffentlichungsjahr', 'Año de Lanzamiento del GPU', 'Année de Sortie du GPU', 'Ano de Lançamento do GPU', 'Год Выхода GPU'],
  'GPU Markası':              ['GPU Brand', 'GPU-Marke', 'Marca del GPU', 'Marque du GPU', 'Marca do GPU', 'Бренд GPU'],
  'GPU Modeli':               ['GPU Model', 'GPU-Modell', 'Modelo del GPU', 'Modèle du GPU', 'Modelo do GPU', 'Модель GPU'],
  'GPU Serisi':               ['GPU Series', 'GPU-Serie', 'Serie del GPU', 'Série du GPU', 'Série do GPU', 'Серия GPU'],
  'GPU Çekirdek Hızı':        ['GPU Core Speed', 'GPU-Kerngeschwindigkeit', 'Velocidad de Núcleo del GPU', 'Vitesse du Cœur GPU', 'Velocidade do Núcleo GPU', 'Скорость Ядра GPU'],
  'GPU Azami Çekirdek Hızı':  ['GPU Maximum Core Speed', 'GPU-Maximalkerngeschwindigkeit', 'Velocidad Máxima del Núcleo GPU', 'Vitesse Maximale du Cœur GPU', 'Velocidade Máxima do Núcleo GPU', 'Максимальная Скорость Ядра GPU'],
  'GPU Bellek Miktarı':       ['GPU Memory', 'GPU-Speicher', 'Memoria del GPU', 'Mémoire du GPU', 'Memória do GPU', 'Память GPU'],
  'GPU Bellek Arayüzü':       ['GPU Memory Interface', 'GPU-Speicherschnittstelle', 'Interfaz de Memoria del GPU', 'Interface Mémoire du GPU', 'Interface de Memória do GPU', 'Интерфейс Памяти GPU'],
  'GPU Bellek Türü':          ['GPU Memory Type', 'GPU-Speichertyp', 'Tipo de Memoria del GPU', 'Type de Mémoire du GPU', 'Tipo de Memória do GPU', 'Тип Памяти GPU'],
  'GPU Diğer Özellikler':     ['GPU Other Features', 'Sonstige GPU-Funktionen', 'Otras Características del GPU', 'Autres Caractéristiques du GPU', 'Outras Características do GPU', 'Прочие Возможности GPU'],
  'GPU Transistör Mesafesi':  ['GPU Process Node', 'GPU-Strukturbreite', 'Nodo de Proceso del GPU', 'Finesse de Gravure du GPU', 'Nó de Processo do GPU', 'Техпроцесс GPU'],
  'Işın İzleme':              ['Ray Tracing', 'Raytracing', 'Trazado de Rayos', 'Lancer de Rayons', 'Ray Tracing', 'Трассировка Лучей'],
  'Işın İzleme Çekirdeği':    ['Ray Tracing Cores', 'Raytracing-Kerne', 'Núcleos de Trazado de Rayos', 'Cœurs de Lancer de Rayons', 'Núcleos de Ray Tracing', 'Ядра Трассировки Лучей'],
  'Gölgeleme Ünitesi':        ['Shading Units', 'Shader-Einheiten', 'Unidades de Sombreado', 'Unités d\'Ombrage', 'Unidades de Sombreamento', 'Шейдерные Блоки'],
  'Akıcı Oyun Çözünürlüğü':   ['Smooth Gaming Resolution', 'Flüssige Spielauflösung', 'Resolución Fluida de Juego', 'Résolution de Jeu Fluide', 'Resolução de Jogo Fluida', 'Плавное Игровое Разрешение'],
  'Çoklu GPU (SLI/CrossFire)':['Multi-GPU (SLI/CrossFire)', 'Multi-GPU (SLI/CrossFire)', 'Multi-GPU (SLI/CrossFire)', 'Multi-GPU (SLI/CrossFire)', 'Multi-GPU (SLI/CrossFire)', 'Multi-GPU (SLI/CrossFire)'],
  'Soğutma Tipi':             ['Cooling Type', 'Kühlungstyp', 'Tipo de Refrigeración', 'Type de Refroidissement', 'Tipo de Refrigeração', 'Тип Охлаждения'],
  'Fan Soğutmalı':            ['Fan Cooled', 'Lüftergekühlt', 'Refrigerado por Ventilador', 'Refroidi par Ventilateur', 'Refrigerado a Ar', 'Воздушное Охлаждение'],
  'Çift Rulmanlı Fan':        ['Dual Ball Bearing Fan', 'Doppelkugellagerlüfter', 'Ventilador de Doble Rodamiento', 'Ventilateur à Double Roulement', 'Ventilador de Rolamento Duplo', 'Вентилятор с Двойным Подшипником'],
  'Metal Ön Plaka':           ['Metal Backplate', 'Metall-Backplate', 'Placa Trasera Metálica', 'Plaque Arrière Métallique', 'Placa Traseira Metálica', 'Металлическая Задняя Пластина'],
  'HDCP Desteği':             ['HDCP Support', 'HDCP-Unterstützung', 'Compatibilidad HDCP', 'Support HDCP', 'Suporte HDCP', 'Поддержка HDCP'],

  // ── Display / Screen ────────────────────────────────────────────────────
  'Ekran Boyutu':             ['Display Size', 'Bildschirmgröße', 'Tamaño de Pantalla', 'Taille d\'Écran', 'Tamanho da Tela', 'Размер Дисплея'],
  'Ekran Çözünürlüğü':        ['Resolution', 'Auflösung', 'Resolución', 'Résolution', 'Resolução', 'Разрешение'],
  'Ekran Çözünürlük Biçimi':  ['Resolution Format', 'Auflösungsformat', 'Formato de Resolución', 'Format de Résolution', 'Formato de Resolução', 'Формат Разрешения'],
  'Ekran Teknolojisi':        ['Display Technology', 'Display-Technologie', 'Tecnología de Pantalla', 'Technologie d\'Écran', 'Tecnologia da Tela', 'Технология Дисплея'],
  'Ekran Yenileme Hızı':      ['Refresh Rate', 'Bildwiederholrate', 'Frecuencia de Actualización', 'Taux de Rafraîchissement', 'Taxa de Atualização', 'Частота Обновления'],
  'Ekran Parlaklığı':         ['Display Brightness', 'Bildschirmhelligkeit', 'Brillo de Pantalla', 'Luminosité de l\'Écran', 'Brilho da Tela', 'Яркость Дисплея'],
  'Ekran En Boy Oranı':       ['Aspect Ratio', 'Seitenverhältnis', 'Relación de Aspecto', 'Format d\'Image', 'Proporção da Tela', 'Соотношение Сторон'],
  'Ekran Diğer Özellikler':   ['Display Other Features', 'Sonstige Bildschirmfunktionen', 'Otras Características de Pantalla', 'Autres Caractéristiques de l\'Écran', 'Outras Características da Tela', 'Прочие Возможности Дисплея'],
  'Panel Tipi':               ['Panel Type', 'Paneltyp', 'Tipo de Panel', 'Type de Panneau', 'Tipo de Painel', 'Тип Панели'],
  'Dokunmatik Ekran':         ['Touchscreen', 'Touchscreen', 'Pantalla Táctil', 'Écran Tactile', 'Tela Sensível ao Toque', 'Сенсорный Экран'],
  'Değişken Yenileme Hızı Özellikleri':['Variable Refresh Rate Features', 'Variable Bildwiederholrate-Funktionen', 'Características de Frecuencia de Actualización Variable', 'Caractéristiques du Taux de Rafraîchissement Variable', 'Características de Taxa de Atualização Variável', 'Возможности Переменной Частоты Обновления'],
  'Yansımasız Mat Ekran':     ['Anti-glare Matte Display', 'Entspiegeltes mattes Display', 'Pantalla Mate Antirreflejos', 'Écran Mat Antireflet', 'Tela Mate Antirreflexo', 'Матовый Антибликовый Экран'],
  'Düşük Mavi Işık':          ['Low Blue Light', 'Geringes Blaulicht', 'Luz Azul Reducida', 'Faible Lumière Bleue', 'Baixa Luz Azul', 'Низкий Уровень Синего Света'],
  'Çentikli (Notch)':         ['Notched', 'Notch', 'Con Muesca', 'Avec Encoche', 'Com Recorte', 'С Вырезом'],
  'Piksel Yoğunluğu':         ['Pixel Density', 'Pixeldichte', 'Densidad de Píxeles', 'Densité de Pixels', 'Densidade de Pixels', 'Плотность Пикселей'],

  // ── Connectivity ────────────────────────────────────────────────────────
  'Bluetooth Özellikleri':    ['Bluetooth Features', 'Bluetooth-Funktionen', 'Características Bluetooth', 'Caractéristiques Bluetooth', 'Características Bluetooth', 'Возможности Bluetooth'],
  'Wi-Fi Teknolojisi':        ['Wi-Fi Technology', 'WLAN-Technologie', 'Tecnología Wi-Fi', 'Technologie Wi-Fi', 'Tecnologia Wi-Fi', 'Технология Wi-Fi'],
  'Wi-Fi Özellikleri':        ['Wi-Fi Features', 'WLAN-Funktionen', 'Características Wi-Fi', 'Caractéristiques Wi-Fi', 'Características Wi-Fi', 'Возможности Wi-Fi'],
  'Ethernet (LAN/RJ45)':      ['Ethernet (LAN/RJ45)', 'Ethernet (LAN/RJ45)', 'Ethernet (LAN/RJ45)', 'Ethernet (LAN/RJ45)', 'Ethernet (LAN/RJ45)', 'Ethernet (LAN/RJ45)'],
  'Ethernet Özellikleri':     ['Ethernet Features', 'Ethernet-Funktionen', 'Características Ethernet', 'Caractéristiques Ethernet', 'Características Ethernet', 'Возможности Ethernet'],
  'HDMI Versiyonu':           ['HDMI Version', 'HDMI-Version', 'Versión HDMI', 'Version HDMI', 'Versão HDMI', 'Версия HDMI'],
  'HDMI Özellikleri':         ['HDMI Features', 'HDMI-Funktionen', 'Características HDMI', 'Caractéristiques HDMI', 'Características HDMI', 'Возможности HDMI'],
  'USB 3.x':                  ['USB 3.x', 'USB 3.x', 'USB 3.x', 'USB 3.x', 'USB 3.x', 'USB 3.x'],
  'USB 3.x Adedi':            ['USB 3.x Count', 'USB 3.x Anzahl', 'Número de USB 3.x', 'Nombre d\'USB 3.x', 'Quantidade de USB 3.x', 'Количество USB 3.x'],
  'USB 3.x Özellikleri':      ['USB 3.x Features', 'USB 3.x Funktionen', 'Características USB 3.x', 'Caractéristiques USB 3.x', 'Características USB 3.x', 'Возможности USB 3.x'],
  'USB Type-C':               ['USB Type-C', 'USB Typ-C', 'USB Type-C', 'USB Type-C', 'USB Type-C', 'USB Type-C'],
  'USB Type-C Adedi':         ['USB Type-C Count', 'USB Typ-C Anzahl', 'Número de USB Type-C', 'Nombre d\'USB Type-C', 'Quantidade de USB Type-C', 'Количество USB Type-C'],
  'USB Type-C Özellikleri':   ['USB Type-C Features', 'USB Typ-C Funktionen', 'Características USB Type-C', 'Caractéristiques USB Type-C', 'Características USB Type-C', 'Возможности USB Type-C'],
  'USB Type-C Hızlı Şarj Özellikleri':['USB Type-C Fast Charging Features', 'USB Typ-C Schnellladefunktionen', 'Características de Carga Rápida USB Type-C', 'Caractéristiques de Charge Rapide USB Type-C', 'Características de Carregamento Rápido USB Type-C', 'Возможности Быстрой Зарядки USB Type-C'],
  'USB Type-C İle Hızlı Şarj':['USB Type-C Fast Charging', 'USB Typ-C Schnellladen', 'Carga Rápida por USB Type-C', 'Charge Rapide via USB Type-C', 'Carregamento Rápido via USB Type-C', 'Быстрая Зарядка через USB Type-C'],
  'Diğer Bağlantılar':        ['Other Connections', 'Sonstige Anschlüsse', 'Otras Conexiones', 'Autres Connexions', 'Outras Conexões', 'Прочие Подключения'],
  'Bluetooth':                ['Bluetooth', 'Bluetooth', 'Bluetooth', 'Bluetooth', 'Bluetooth', 'Bluetooth'],
  'NFC':                      ['NFC', 'NFC', 'NFC', 'NFC', 'NFC', 'NFC'],
  'GPS':                      ['GPS', 'GPS', 'GPS', 'GPS', 'GPS', 'GPS'],
  'SIM Desteği':              ['SIM Support', 'SIM-Unterstützung', 'Compatibilidad SIM', 'Support SIM', 'Suporte SIM', 'Поддержка SIM'],
  'eSIM Desteği':             ['eSIM Support', 'eSIM-Unterstützung', 'Compatibilidad eSIM', 'Support eSIM', 'Suporte eSIM', 'Поддержка eSIM'],
  'Hafıza Kartı Desteği':     ['Memory Card Support', 'Speicherkarten-Unterstützung', 'Compatibilidad con Tarjeta de Memoria', 'Support Carte Mémoire', 'Suporte a Cartão de Memória', 'Поддержка Карты Памяти'],

  // ── Storage ─────────────────────────────────────────────────────────────
  'Sabit Disk (HDD)':         ['Hard Disk (HDD)', 'Festplatte (HDD)', 'Disco Duro (HDD)', 'Disque Dur (HDD)', 'Disco Rígido (HDD)', 'Жесткий Диск (HDD)'],
  'Sabit Disk (SSD)':         ['Solid State Drive (SSD)', 'Solid-State-Drive (SSD)', 'Unidad de Estado Sólido (SSD)', 'Disque SSD', 'SSD', 'Твердотельный Накопитель (SSD)'],
  'Sabit Disk (SSD) Boyutu':  ['SSD Size', 'SSD-Größe', 'Tamaño de SSD', 'Capacité du SSD', 'Capacidade do SSD', 'Размер SSD'],
  'Sabit Disk (SSD) Tipi':    ['SSD Type', 'SSD-Typ', 'Tipo de SSD', 'Type de SSD', 'Tipo de SSD', 'Тип SSD'],
  'Depolama Desteği':         ['Storage Support', 'Speicher-Unterstützung', 'Soporte de Almacenamiento', 'Support de Stockage', 'Suporte de Armazenamento', 'Поддержка Хранилища'],
  'Depolama Tipi':            ['Storage Type', 'Speichertyp', 'Tipo de Almacenamiento', 'Type de Stockage', 'Tipo de Armazenamento', 'Тип Хранилища'],
  'Dahili Hafıza':            ['Internal Storage', 'Interner Speicher', 'Almacenamiento Interno', 'Stockage Interne', 'Armazenamento Interno', 'Внутреннее Хранилище'],
  'Maks. Hafıza Kartı Kapasitesi':['Max Memory Card Capacity', 'Maximale Speicherkartenkapazität', 'Capacidad Máxima de Tarjeta de Memoria', 'Capacité Maximale Carte Mémoire', 'Capacidade Máxima do Cartão de Memória', 'Максимальная Емкость Карты Памяти'],

  // ── Battery / Charging ──────────────────────────────────────────────────
  'Pil Gücü':                 ['Battery Power', 'Akkukapazität', 'Potencia de Batería', 'Capacité de la Batterie', 'Potência da Bateria', 'Емкость Аккумулятора'],
  'Pil Hücre Sayısı':         ['Battery Cell Count', 'Anzahl der Akkuzellen', 'Número de Celdas de Batería', 'Nombre de Cellules de Batterie', 'Número de Células da Bateria', 'Количество Ячеек Аккумулятора'],
  'Pil Özellikleri':          ['Battery Specifications', 'Akku-Spezifikationen', 'Especificaciones de Batería', 'Spécifications de la Batterie', 'Especificações da Bateria', 'Характеристики Аккумулятора'],
  'Pil Teknolojisi':          ['Battery Technology', 'Akkutechnologie', 'Tecnología de Batería', 'Technologie de la Batterie', 'Tecnologia da Bateria', 'Технология Аккумулятора'],
  'Pil Ömrü':                 ['Battery Life', 'Akkulaufzeit', 'Duración de Batería', 'Autonomie', 'Duração da Bateria', 'Время Работы от Аккумулятора'],
  'Ortalama Pil Ömrü':        ['Average Battery Life', 'Durchschnittliche Akkulaufzeit', 'Duración Promedio de Batería', 'Autonomie Moyenne', 'Duração Média da Bateria', 'Среднее Время Работы от Аккумулятора'],
  'Azami Pil Ömrü':           ['Maximum Battery Life', 'Maximale Akkulaufzeit', 'Duración Máxima de Batería', 'Autonomie Maximale', 'Duração Máxima da Bateria', 'Максимальное Время Работы от Аккумулятора'],
  'Pil Dolum Süresi':         ['Charging Time', 'Ladezeit', 'Tiempo de Carga', 'Temps de Charge', 'Tempo de Carregamento', 'Время Зарядки'],
  'Hızlı Şarj':               ['Fast Charging', 'Schnellladen', 'Carga Rápida', 'Charge Rapide', 'Carregamento Rápido', 'Быстрая Зарядка'],
  'Hızlı Şarj Özelliği':      ['Fast Charging Feature', 'Schnellladefunktion', 'Función de Carga Rápida', 'Fonction de Charge Rapide', 'Recurso de Carregamento Rápido', 'Функция Быстрой Зарядки'],
  'Hızlı Şarj Özellikleri':   ['Fast Charging Features', 'Schnellladefunktionen', 'Características de Carga Rápida', 'Caractéristiques de Charge Rapide', 'Características de Carregamento Rápido', 'Возможности Быстрой Зарядки'],
  'Hızlı Şarj Gücü':          ['Fast Charging Power', 'Schnellladeleistung', 'Potencia de Carga Rápida', 'Puissance de Charge Rapide', 'Potência de Carregamento Rápido', 'Мощность Быстрой Зарядки'],
  'Kablosuz Şarj':            ['Wireless Charging', 'Kabelloses Laden', 'Carga Inalámbrica', 'Charge Sans Fil', 'Carregamento Sem Fio', 'Беспроводная Зарядка'],
  'Ters Kablosuz Şarj':       ['Reverse Wireless Charging', 'Umgekehrtes kabelloses Laden', 'Carga Inalámbrica Inversa', 'Charge Sans Fil Inversée', 'Carregamento Sem Fio Reverso', 'Обратная Беспроводная Зарядка'],
  'Şarj Formatı':             ['Charging Format', 'Ladeformat', 'Formato de Carga', 'Format de Charge', 'Formato de Carregamento', 'Формат Зарядки'],
  'Şarj Bağlantı Noktası':    ['Charging Port', 'Ladeanschluss', 'Puerto de Carga', 'Port de Charge', 'Porta de Carregamento', 'Порт Зарядки'],
  'Sökülebilir Pil':          ['Removable Battery', 'Wechselbarer Akku', 'Batería Extraíble', 'Batterie Amovible', 'Bateria Removível', 'Съемный Аккумулятор'],

  // ── Camera (smartphones / tablets / smartwatches) ───────────────────────
  'Ön Kamera':                ['Front Camera', 'Frontkamera', 'Cámara Frontal', 'Caméra Frontale', 'Câmera Frontal', 'Фронтальная Камера'],
  'Arka Kamera':              ['Rear Camera', 'Rückkamera', 'Cámara Trasera', 'Caméra Arrière', 'Câmera Traseira', 'Задняя Камера'],
  'Ana Kamera':               ['Main Camera', 'Hauptkamera', 'Cámara Principal', 'Caméra Principale', 'Câmera Principal', 'Основная Камера'],
  'İkinci Arka Kamera':       ['Second Rear Camera', 'Zweite Rückkamera', 'Segunda Cámara Trasera', 'Deuxième Caméra Arrière', 'Segunda Câmera Traseira', 'Вторая Задняя Камера'],
  'Üçüncü Arka Kamera':       ['Third Rear Camera', 'Dritte Rückkamera', 'Tercera Cámara Trasera', 'Troisième Caméra Arrière', 'Terceira Câmera Traseira', 'Третья Задняя Камера'],
  'Dördüncü Arka Kamera':     ['Fourth Rear Camera', 'Vierte Rückkamera', 'Cuarta Cámara Trasera', 'Quatrième Caméra Arrière', 'Quarta Câmera Traseira', 'Четвертая Задняя Камера'],
  'Kamera Özellikleri':       ['Camera Features', 'Kamerafunktionen', 'Características de Cámara', 'Caractéristiques de la Caméra', 'Características da Câmera', 'Возможности Камеры'],
  'Kamera Çözünürlüğü':       ['Camera Resolution', 'Kameraauflösung', 'Resolución de Cámara', 'Résolution de la Caméra', 'Resolução da Câmera', 'Разрешение Камеры'],
  'Optik Yakınlaştırma':      ['Optical Zoom', 'Optischer Zoom', 'Zoom Óptico', 'Zoom Optique', 'Zoom Óptico', 'Оптический Зум'],
  'Dijital Yakınlaştırma':    ['Digital Zoom', 'Digitaler Zoom', 'Zoom Digital', 'Zoom Numérique', 'Zoom Digital', 'Цифровой Зум'],
  'Flaş':                     ['Flash', 'Blitz', 'Flash', 'Flash', 'Flash', 'Вспышка'],
  'Görüntü Sabitleyici (OIS)':['Optical Image Stabilization (OIS)', 'Optischer Bildstabilisator (OIS)', 'Estabilización Óptica de Imagen (OIS)', 'Stabilisation Optique de l\'Image (OIS)', 'Estabilização Óptica de Imagem (OIS)', 'Оптическая Стабилизация Изображения (OIS)'],
  'Video Kayıt':              ['Video Recording', 'Videoaufnahme', 'Grabación de Video', 'Enregistrement Vidéo', 'Gravação de Vídeo', 'Видеозапись'],

  // ── Smartwatch / health (Apple Watch was a big pain point) ──────────────
  'Sağlık':                   ['Health', 'Gesundheit', 'Salud', 'Santé', 'Saúde', 'Здоровье'],
  'Sağlık Tavsiyesi':         ['Health Advice', 'Gesundheitsempfehlung', 'Consejo de Salud', 'Conseil Santé', 'Conselho de Saúde', 'Рекомендации по Здоровью'],
  'Kalori Takibi':            ['Calorie Tracking', 'Kalorienverfolgung', 'Seguimiento de Calorías', 'Suivi des Calories', 'Monitoramento de Calorias', 'Отслеживание Калорий'],
  'Aktivite Takibi':           ['Activity Tracking', 'Aktivitätsverfolgung', 'Seguimiento de Actividad', 'Suivi d\'Activité', 'Monitoramento de Atividade', 'Отслеживание Активности'],
  'Mesafe Aktivite Takibi':   ['Distance Activity Tracking', 'Distanzbasierte Aktivitätsverfolgung', 'Seguimiento de Actividad por Distancia', 'Suivi d\'Activité par Distance', 'Monitoramento de Atividade por Distância', 'Отслеживание Активности по Расстоянию'],
  'Mesafe':                   ['Distance', 'Distanz', 'Distancia', 'Distance', 'Distância', 'Расстояние'],
  'Kalori':                   ['Calorie', 'Kalorie', 'Caloría', 'Calorie', 'Caloria', 'Калория'],
  'Nabız':                    ['Heart Rate', 'Herzfrequenz', 'Ritmo Cardíaco', 'Fréquence Cardiaque', 'Frequência Cardíaca', 'Частота Сердечных Сокращений'],
  'Nabız Takibi':             ['Heart Rate Tracking', 'Herzfrequenzverfolgung', 'Seguimiento del Ritmo Cardíaco', 'Suivi de la Fréquence Cardiaque', 'Monitoramento da Frequência Cardíaca', 'Отслеживание Частоты Сердечных Сокращений'],
  'Nabız Hızı':               ['Heart Rate', 'Herzfrequenz', 'Ritmo Cardíaco', 'Fréquence Cardiaque', 'Frequência Cardíaca', 'Частота Сердечных Сокращений'],
  'Kandaki Oksijen Seviyesi (SpO2)':['Blood Oxygen Level (SpO2)', 'Blutsauerstoffsättigung (SpO2)', 'Nivel de Oxígeno en Sangre (SpO2)', 'Niveau d\'Oxygène Sanguin (SpO2)', 'Nível de Oxigênio no Sangue (SpO2)', 'Уровень Кислорода в Крови (SpO2)'],
  'Oksijen Seviyesi':         ['Oxygen Level', 'Sauerstoffsättigung', 'Nivel de Oxígeno', 'Niveau d\'Oxygène', 'Nível de Oxigênio', 'Уровень Кислорода'],
  'Sağlık Nefes Seviyesi Görüntüleme':['Breathing Rate Tracking', 'Atemfrequenzverfolgung', 'Seguimiento de Frecuencia Respiratoria', 'Suivi du Rythme Respiratoire', 'Monitoramento da Frequência Respiratória', 'Отслеживание Частоты Дыхания'],
  'Nefes Seviyesi':           ['Breathing Rate', 'Atemfrequenz', 'Frecuencia Respiratoria', 'Rythme Respiratoire', 'Frequência Respiratória', 'Частота Дыхания'],
  'Stres Seviyesi':           ['Stress Level', 'Stresslevel', 'Nivel de Estrés', 'Niveau de Stress', 'Nível de Estresse', 'Уровень Стресса'],
  'Uyku Hareketsizlik':       ['Sleep Inactivity', 'Schlafinaktivität', 'Inactividad del Sueño', 'Inactivité du Sommeil', 'Inatividade do Sono', 'Бездействие во Сне'],
  'Uyku Takibi':              ['Sleep Tracking', 'Schlafverfolgung', 'Seguimiento del Sueño', 'Suivi du Sommeil', 'Monitoramento do Sono', 'Отслеживание Сна'],
  'Uyku Apnesi Bildirimi':    ['Sleep Apnea Notification', 'Schlafapnoe-Benachrichtigung', 'Notificación de Apnea del Sueño', 'Notification d\'Apnée du Sommeil', 'Notificação de Apneia do Sono', 'Уведомление об Апноэ во Сне'],
  'Uyku Apnesi':              ['Sleep Apnea', 'Schlafapnoe', 'Apnea del Sueño', 'Apnée du Sommeil', 'Apneia do Sono', 'Апноэ во Сне'],
  'Uyku':                     ['Sleep', 'Schlaf', 'Sueño', 'Sommeil', 'Sono', 'Сон'],
  'Elektriksel Nabız (ECG/EKG)':['Electrical Heart Rate (ECG/EKG)', 'Elektrische Herzfrequenz (EKG)', 'Frecuencia Cardíaca Eléctrica (ECG/EKG)', 'Fréquence Cardiaque Électrique (ECG)', 'Frequência Cardíaca Elétrica (ECG/EKG)', 'Электрическая Частота Сердечных Сокращений (ЭКГ)'],
  'Vücut Ritim Bildirimi':    ['Body Rhythm Notification', 'Körperrhythmus-Benachrichtigung', 'Notificación de Ritmo Corporal', 'Notification de Rythme Corporel', 'Notificação de Ritmo Corporal', 'Уведомление о Ритме Тела'],
  'Hiper Tansiyon Bildirimi': ['Hypertension Notification', 'Bluthochdruck-Benachrichtigung', 'Notificación de Hipertensión', 'Notification d\'Hypertension', 'Notificação de Hipertensão', 'Уведомление о Гипертонии'],
  'Ruh Hali Takibi':          ['Mood Tracking', 'Stimmungsverfolgung', 'Seguimiento del Estado de Ánimo', 'Suivi de l\'Humeur', 'Monitoramento de Humor', 'Отслеживание Настроения'],
  'Sağlık Tavsiyesi Kimlik':  ['Health ID', 'Gesundheits-ID', 'Identificación de Salud', 'Identifiant Santé', 'Identificação de Saúde', 'Идентификатор Здоровья'],
  'Konum Bilgisi':            ['Location Info', 'Standortinformationen', 'Información de Ubicación', 'Informations de Localisation', 'Informações de Localização', 'Информация о Местоположении'],
  'Konum Bilgisi Özellikleri':['Location Info Features', 'Standortinformationsfunktionen', 'Características de Información de Ubicación', 'Caractéristiques d\'Informations de Localisation', 'Características de Informações de Localização', 'Возможности Информации о Местоположении'],
  'Akıllı Bildirimler':       ['Smart Notifications', 'Smarte Benachrichtigungen', 'Notificaciones Inteligentes', 'Notifications Intelligentes', 'Notificações Inteligentes', 'Умные Уведомления'],
  'Alarm':                    ['Alarm', 'Alarm', 'Alarma', 'Alarme', 'Alarme', 'Будильник'],
  'Müzik Çalar Kontrolü':     ['Music Player Control', 'Musikplayer-Steuerung', 'Control de Reproductor de Música', 'Contrôle du Lecteur de Musique', 'Controle do Reprodutor de Música', 'Управление Музыкальным Плеером'],
  'Telefonumu Bul':           ['Find My Phone', 'Mein Telefon finden', 'Buscar Mi Teléfono', 'Trouver Mon Téléphone', 'Encontrar Meu Telefone', 'Найти Мой Телефон'],
  'Kamera Kontrolü':          ['Camera Control', 'Kamerasteuerung', 'Control de Cámara', 'Contrôle de la Caméra', 'Controle da Câmera', 'Управление Камерой'],
  'Takvim':                   ['Calendar', 'Kalender', 'Calendario', 'Calendrier', 'Calendário', 'Календарь'],
  'Dahili Medya Oynatıcı Navigasyonu (Harita)':['Built-in Media Player Navigation (Maps)', 'Integrierte Mediaplayer-Navigation (Karten)', 'Navegación del Reproductor Multimedia Integrado (Mapas)', 'Navigation du Lecteur Multimédia Intégré (Cartes)', 'Navegação do Reprodutor de Mídia Integrado (Mapas)', 'Навигация Встроенного Медиаплеера (Карты)'],
  'Hesap Makinesi':           ['Calculator', 'Taschenrechner', 'Calculadora', 'Calculatrice', 'Calculadora', 'Калькулятор'],
  'Siri Asistanı':            ['Siri Assistant', 'Siri-Assistent', 'Asistente Siri', 'Assistant Siri', 'Assistente Siri', 'Помощник Siri'],
  'Sesli Asistan':            ['Voice Assistant', 'Sprachassistent', 'Asistente de Voz', 'Assistant Vocal', 'Assistente de Voz', 'Голосовой Помощник'],
  'Akıllı Sesli Asistan':     ['Smart Voice Assistant', 'Smarter Sprachassistent', 'Asistente de Voz Inteligente', 'Assistant Vocal Intelligent', 'Assistente de Voz Inteligente', 'Умный Голосовой Помощник'],
  'Zamanlayıcı':              ['Timer', 'Timer', 'Temporizador', 'Minuterie', 'Timer', 'Таймер'],
  'Müzik Depolama':           ['Music Storage', 'Musikspeicher', 'Almacenamiento de Música', 'Stockage de Musique', 'Armazenamento de Música', 'Хранилище Музыки'],
  'Gelen Aramaları Yönetme':  ['Incoming Calls Management', 'Anrufverwaltung', 'Gestión de Llamadas Entrantes', 'Gestion des Appels Entrants', 'Gerenciamento de Chamadas Recebidas', 'Управление Входящими Вызовами'],
  'Bluetooth Kulaklık Eşleştirme':['Bluetooth Headphone Pairing', 'Bluetooth-Kopfhörer-Pairing', 'Emparejamiento de Auriculares Bluetooth', 'Appairage de Casque Bluetooth', 'Pareamento de Fone Bluetooth', 'Сопряжение Bluetooth-Наушников'],
  'Çağrı Geçmişi':            ['Call History', 'Anrufverlauf', 'Historial de Llamadas', 'Historique des Appels', 'Histórico de Chamadas', 'История Вызовов'],
  'Bağırma (Walkie-Talkie)':  ['Walkie-Talkie', 'Walkie-Talkie', 'Walkie-Talkie', 'Talkie-Walkie', 'Walkie-Talkie', 'Уоки-Токи'],
  'Çevrimdışı Haritalar':     ['Offline Maps', 'Offline-Karten', 'Mapas Sin Conexión', 'Cartes Hors Ligne', 'Mapas Offline', 'Офлайн-Карты'],
  'Dijital Crown':            ['Digital Crown', 'Digital Crown', 'Corona Digital', 'Couronne Numérique', 'Coroa Digital', 'Цифровая Коронка'],
  'El ile Cihaz Kontrolü':    ['Hand Gesture Device Control', 'Handgesten-Gerätesteuerung', 'Control del Dispositivo por Gestos', 'Contrôle de l\'Appareil par Gestes', 'Controle do Dispositivo por Gestos', 'Управление Устройством Жестами'],
  'Gelgit Grafikleri':        ['Tide Graphics', 'Gezeitendiagramme', 'Gráficos de Mareas', 'Graphiques de Marées', 'Gráficos de Marés', 'Графики Приливов'],
  'Güç Tasarrufu Modu':       ['Power Saving Mode', 'Energiesparmodus', 'Modo de Ahorro de Energía', 'Mode Économie d\'Énergie', 'Modo de Economia de Energia', 'Режим Энергосбережения'],
  'GymKit Radyo Yayını Yapmayın Modu':['GymKit Broadcasting Disabled Mode', 'GymKit-Übertragung deaktiviert', 'Modo de Transmisión GymKit Desactivada', 'Mode Diffusion GymKit Désactivée', 'Modo de Transmissão GymKit Desativada', 'Режим Отключения Трансляции GymKit'],
  'Sesli Komut Verme':        ['Voice Command', 'Sprachbefehl', 'Comando de Voz', 'Commande Vocale', 'Comando de Voz', 'Голосовая Команда'],
  'Sesli Mesaj':              ['Voice Message', 'Sprachnachricht', 'Mensaje de Voz', 'Message Vocal', 'Mensagem de Voz', 'Голосовое Сообщение'],
  'Sesli Not (Voice Memo)':   ['Voice Memo', 'Sprachnotiz', 'Nota de Voz', 'Note Vocale', 'Nota de Voz', 'Голосовая Заметка'],
  'Sesli Spotify':            ['Voice Spotify', 'Sprachgesteuertes Spotify', 'Spotify por Voz', 'Spotify Vocal', 'Spotify por Voz', 'Голосовое Управление Spotify'],
  'Ultra Geniş Bant (UWB)':   ['Ultra Wide Band (UWB)', 'Ultrabreitband (UWB)', 'Banda Ultra Ancha (UWB)', 'Ultra Large Bande (UWB)', 'Banda Ultralarga (UWB)', 'Сверхширокая Полоса (UWB)'],
  'Web Tarayıcı':             ['Web Browser', 'Webbrowser', 'Navegador Web', 'Navigateur Web', 'Navegador Web', 'Веб-Браузер'],
  'Hava Durumu':              ['Weather', 'Wetter', 'Tiempo', 'Météo', 'Tempo', 'Погода'],
  'Çoklu Spor Modu':          ['Multi-Sport Mode', 'Mehrsportmodus', 'Modo Multideporte', 'Mode Multi-Sport', 'Modo Multiesporte', 'Многоспортивный Режим'],
  'Kronometre':               ['Stopwatch', 'Stoppuhr', 'Cronómetro', 'Chronomètre', 'Cronômetro', 'Секундомер'],

  // ── Design / Body ───────────────────────────────────────────────────────
  'Ağırlık':                  ['Weight', 'Gewicht', 'Peso', 'Poids', 'Peso', 'Вес'],
  'Genişlik':                 ['Width', 'Breite', 'Ancho', 'Largeur', 'Largura', 'Ширина'],
  'Yükseklik':                ['Height', 'Höhe', 'Altura', 'Hauteur', 'Altura', 'Высота'],
  'Derinlik':                 ['Depth', 'Tiefe', 'Profundidad', 'Profondeur', 'Profundidade', 'Глубина'],
  'Kalınlık':                 ['Thickness', 'Dicke', 'Grosor', 'Épaisseur', 'Espessura', 'Толщина'],
  'Boyutlar':                 ['Dimensions', 'Abmessungen', 'Dimensiones', 'Dimensions', 'Dimensões', 'Размеры'],
  'Gövde Malzemesi':          ['Body Material', 'Gehäusematerial', 'Material de la Carcasa', 'Matériau du Boîtier', 'Material da Carcaça', 'Материал Корпуса'],
  'Renk':                     ['Color', 'Farbe', 'Color', 'Couleur', 'Cor', 'Цвет'],
  'Renk Seçenekleri':         ['Color Options', 'Farboptionen', 'Opciones de Color', 'Options de Couleur', 'Opções de Cor', 'Варианты Цвета'],
  'Su Geçirmez':              ['Waterproof', 'Wasserdicht', 'Resistente al Agua', 'Étanche', 'À Prova d\'Água', 'Водонепроницаемый'],
  'Toz Geçirmez':             ['Dustproof', 'Staubdicht', 'Resistente al Polvo', 'Résistant à la Poussière', 'À Prova de Poeira', 'Пылезащищенный'],
  'Su Dayanımı':              ['Water Resistance', 'Wasserbeständigkeit', 'Resistencia al Agua', 'Résistance à l\'Eau', 'Resistência à Água', 'Водостойкость'],

  // ── General product info ────────────────────────────────────────────────
  'Ürün Ailesi':              ['Product Family', 'Produktfamilie', 'Familia de Producto', 'Famille de Produit', 'Família do Produto', 'Семейство Продуктов'],
  'Ürün Serisi':              ['Product Series', 'Produktserie', 'Serie de Producto', 'Série de Produit', 'Série do Produto', 'Серия Продукта'],
  'Ürün Tipi':                ['Product Type', 'Produkttyp', 'Tipo de Producto', 'Type de Produit', 'Tipo de Produto', 'Тип Продукта'],
  'Ürün Kodu':                ['Product Code', 'Produktcode', 'Código de Producto', 'Code Produit', 'Código do Produto', 'Код Продукта'],
  'Ürün Amacı':               ['Product Purpose', 'Produktzweck', 'Propósito del Producto', 'Usage du Produit', 'Propósito do Produto', 'Назначение Продукта'],
  'Resmi Ürün':               ['Official Product', 'Offizielles Produkt', 'Producto Oficial', 'Produit Officiel', 'Produto Oficial', 'Официальный Продукт'],
  'Varyant':                  ['Variant', 'Variante', 'Variante', 'Variante', 'Variante', 'Вариант'],
  'VARYANT':                  ['VARIANT', 'VARIANTE', 'VARIANTE', 'VARIANTE', 'VARIANTE', 'ВАРИАНТ'],
  'Ürün Detayı':              ['Product Detail', 'Produktdetail', 'Detalle del Producto', 'Détail du Produit', 'Detalhe do Produto', 'Описание Продукта'],
  'Garanti':                  ['Warranty', 'Garantie', 'Garantía', 'Garantie', 'Garantia', 'Гарантия'],
  'Garantisi':                ['Warranty', 'Garantie', 'Garantía', 'Garantie', 'Garantia', 'Гарантия'],
  'İşletim Sistemi':          ['Operating System', 'Betriebssystem', 'Sistema Operativo', 'Système d\'Exploitation', 'Sistema Operacional', 'Операционная Система'],

  // ── Audio ───────────────────────────────────────────────────────────────
  'Hoparlör':                 ['Speaker', 'Lautsprecher', 'Altavoz', 'Haut-Parleur', 'Alto-Falante', 'Динамик'],
  'Hoparlörler':              ['Speakers', 'Lautsprecher', 'Altavoces', 'Haut-Parleurs', 'Alto-Falantes', 'Динамики'],
  'Hoparlör Özellikleri':     ['Speaker Specifications', 'Lautsprecher-Spezifikationen', 'Especificaciones de Altavoz', 'Spécifications des Haut-Parleurs', 'Especificações do Alto-Falante', 'Характеристики Динамика'],
  'Mikrofon':                 ['Microphone', 'Mikrofon', 'Micrófono', 'Microphone', 'Microfone', 'Микрофон'],
  'Çıkmaz Kulak (Walkie-Talkie)':['Walkie-Talkie', 'Walkie-Talkie', 'Walkie-Talkie', 'Talkie-Walkie', 'Walkie-Talkie', 'Уоки-Токи'],

  // ── Yes/No (mostly handled by trSpec bool, but seed anyway) ─────────────
  'Evet':                     ['Yes', 'Ja', 'Sí', 'Oui', 'Sim', 'Да'],
  'Hayır':                    ['No', 'Nein', 'No', 'Non', 'Não', 'Нет'],
  'Var':                      ['Yes', 'Ja', 'Sí', 'Oui', 'Sim', 'Да'],
  'Yok':                      ['No', 'Nein', 'No', 'Non', 'Não', 'Нет'],

  // ── Quarters / dates ────────────────────────────────────────────────────
  '1.Çeyrek':                 ['Q1', 'Q1', 'T1', 'T1', 'T1', '1-й Квартал'],
  '2.Çeyrek':                 ['Q2', 'Q2', 'T2', 'T2', 'T2', '2-й Квартал'],
  '3.Çeyrek':                 ['Q3', 'Q3', 'T3', 'T3', 'T3', '3-й Квартал'],
  '4.Çeyrек':                 ['Q4', 'Q4', 'T4', 'T4', 'T4', '4-й Квартал'],
  '4.Çeyrek':                 ['Q4', 'Q4', 'T4', 'T4', 'T4', '4-й Квартал'],

  // ── Common stop words / connectives Argos passes through ────────────────
  've':                       ['and', 'und', 'y', 'et', 'e', 'и'],
  'ile':                      ['with', 'mit', 'con', 'avec', 'com', 'с'],
  'için':                     ['for', 'für', 'para', 'pour', 'para', 'для'],
  'olarak':                   ['as', 'als', 'como', 'comme', 'como', 'как'],
  'gibi':                     ['like', 'wie', 'como', 'comme', 'como', 'как'],
  'Adet':                     ['', '', '', '', '', ''],
  'Adedi':                    ['Count', 'Anzahl', 'Cantidad', 'Nombre', 'Quantidade', 'Количество'],

  // ── Vehicle / units ─────────────────────────────────────────────────────
  'Adet Mikrofon':            ['Microphones', 'Mikrofone', 'Micrófonos', 'Microphones', 'Microfones', 'Микрофоны'],
  'Birim':                    ['Unit', 'Einheit', 'Unidad', 'Unité', 'Unidade', 'Единица'],
  'birim':                    ['units', 'Einheiten', 'unidades', 'unités', 'unidades', 'единиц'],
  'puan':                     ['points', 'Punkte', 'puntos', 'points', 'pontos', 'очков'],
  'Puan':                     ['Score', 'Punktzahl', 'Puntuación', 'Score', 'Pontuação', 'Оценка'],

  // ── Misc common Turkish leaks ───────────────────────────────────────────
  'Masaüstü':                 ['Desktop', 'Desktop', 'Sobremesa', 'Bureau', 'Desktop', 'Настольный'],
  'Sunucu':                   ['Server', 'Server', 'Servidor', 'Serveur', 'Servidor', 'Сервер'],
  'Dizüstü':                  ['Laptop', 'Laptop', 'Portátil', 'Ordinateur Portable', 'Notebook', 'Ноутбук'],
  'Mobil':                    ['Mobile', 'Mobil', 'Móvil', 'Mobile', 'Móvel', 'Мобильный'],
  'Donanım':                  ['Hardware', 'Hardware', 'Hardware', 'Matériel', 'Hardware', 'Оборудование'],
  'Donanım Teknolojileri':    ['Hardware Technologies', 'Hardware-Technologien', 'Tecnologías de Hardware', 'Technologies Matérielles', 'Tecnologias de Hardware', 'Аппаратные Технологии'],
  'Donanım Güvenilirlik Doğrulaması':['Hardware Reliability Verification', 'Hardware-Zuverlässigkeitsprüfung', 'Verificación de Fiabilidad del Hardware', 'Vérification de Fiabilité du Matériel', 'Verificação de Confiabilidade do Hardware', 'Проверка Надежности Оборудования'],

  // ════════════════════════════════════════════════════════════════════════
  // 2026-05-29 — atoms collected from a fresh smartwatches+laptops+CPU
  // sample scrape (find_untranslated_atoms.js). Every entry below was
  // observed leaking Turkish into the EN modal, so we map each one to its
  // proper English / DE / ES / FR / PT / RU translation here.
  // ════════════════════════════════════════════════════════════════════════

  // Argos-mangled fragments (English stem + Turkish suffix or partial)
  'Mesafesi':                 ['Process Node', 'Strukturbreite', 'Nodo de Proceso', 'Finesse de Gravure', 'Nó de Processo', 'Техпроцесс'],
  'GPU Mesafesi':             ['GPU Process Node', 'GPU-Strukturbreite', 'Nodo de Proceso del GPU', 'Finesse de Gravure du GPU', 'Nó de Processo do GPU', 'Техпроцесс GPU'],
  'Processor Ailesi':         ['Processor Family', 'Prozessorfamilie', 'Familia de Procesadores', 'Famille de Processeurs', 'Família de Processadores', 'Семейство Процессоров'],
  'Product Ailesi':           ['Product Family', 'Produktfamilie', 'Familia de Producto', 'Famille de Produit', 'Família do Produto', 'Семейство Продуктов'],
  '(Kilitli)':                ['(Locked)', '(Gesperrt)', '(Bloqueado)', '(Verrouillé)', '(Bloqueado)', '(Заблокирован)'],
  'Display Kilidi':           ['Screen Lock', 'Bildschirmsperre', 'Bloqueo de Pantalla', 'Verrouillage de l\'Écran', 'Bloqueio de Tela', 'Блокировка Экрана'],
  'Teknolojiler':             ['Technologies', 'Technologien', 'Tecnologías', 'Technologies', 'Tecnologias', 'Технологии'],
  '13.Nesil Intel Core':      ['13th Gen Intel Core', 'Intel Core 13. Generation', 'Intel Core de 13ª Generación', 'Intel Core 13e Génération', 'Intel Core de 13ª Geração', 'Intel Core 13-го поколения'],
  '14.Nesil Intel Core':      ['14th Gen Intel Core', 'Intel Core 14. Generation', 'Intel Core de 14ª Generación', 'Intel Core 14e Génération', 'Intel Core de 14ª Geração', 'Intel Core 14-го поколения'],
  '2.Nesil Intel Core Ultra': ['2nd Gen Intel Core Ultra', 'Intel Core Ultra 2. Generation', 'Intel Core Ultra de 2ª Generación', 'Intel Core Ultra 2e Génération', 'Intel Core Ultra de 2ª Geração', 'Intel Core Ultra 2-го поколения'],
  '13.Nesil Processors Intel UHD Graphics':['Intel UHD Graphics for 13th Gen Processors', 'Intel UHD Graphics für Prozessoren der 13. Generation', 'Intel UHD Graphics para Procesadores de 13ª Generación', 'Intel UHD Graphics pour Processeurs 13e Génération', 'Intel UHD Graphics para Processadores de 13ª Geração', 'Intel UHD Graphics для процессоров 13-го поколения'],
  '14.Nesil Processors Intel UHD Graphics':['Intel UHD Graphics for 14th Gen Processors', 'Intel UHD Graphics für Prozessoren der 14. Generation', 'Intel UHD Graphics para Procesadores de 14ª Generación', 'Intel UHD Graphics pour Processeurs 14e Génération', 'Intel UHD Graphics para Processadores de 14ª Geração', 'Intel UHD Graphics для процессоров 14-го поколения'],

  // Smartwatch display / material values
  'Gece Mode':                ['Night Mode', 'Nachtmodus', 'Modo Nocturno', 'Mode Nuit', 'Modo Noturno', 'Ночной Режим'],
  'Gece Modu':                ['Night Mode', 'Nachtmodus', 'Modo Nocturno', 'Mode Nuit', 'Modo Noturno', 'Ночной Режим'],
  'Gece Mode Glass':          ['Nightmode Glass', 'Nachtmodus-Glas', 'Cristal de Modo Nocturno', 'Verre Mode Nuit', 'Vidro de Modo Noturno', 'Стекло Ночного Режима'],
  'Sürekli Açık (Always-On)': ['Always-On', 'Always-On', 'Siempre Encendido', 'Toujours Activé', 'Sempre Ligado', 'Всегда Включён'],
  'Çiziklere Dayanıklı':      ['Scratch Resistant', 'Kratzfest', 'Resistente a Arañazos', 'Résistant aux Rayures', 'Resistente a Arranhões', 'Устойчив к Царапинам'],
  'Geniş Açılı OLED Cam':     ['Wide Angle OLED Glass', 'Weitwinkel-OLED-Glas', 'Cristal OLED de Ángulo Amplio', 'Verre OLED Grand Angle', 'Vidro OLED de Ângulo Amplio', 'Широкоугольное OLED Стекло'],
  'Safir Kristal':            ['Sapphire Crystal', 'Saphirkristall', 'Cristal de Zafiro', 'Cristal Saphir', 'Cristal de Safira', 'Сапфировое Стекло'],
  'Paslanmaz Çelik':          ['Stainless Steel', 'Edelstahl', 'Acero Inoxidable', 'Acier Inoxydable', 'Aço Inoxidável', 'Нержавеющая Сталь'],
  'Alüminyum':                ['Aluminum', 'Aluminium', 'Aluminio', 'Aluminium', 'Alumínio', 'Алюминий'],
  'Titanyum':                 ['Titanium', 'Titan', 'Titanio', 'Titane', 'Titânio', 'Титан'],
  'Mor':                      ['Purple', 'Violett', 'Morado', 'Violet', 'Roxo', 'Фиолетовый'],
  'Sarı':                     ['Yellow', 'Gelb', 'Amarillo', 'Jaune', 'Amarelo', 'Жёлтый'],
  'Kahverengi':               ['Brown', 'Braun', 'Marrón', 'Marron', 'Marrom', 'Коричневый'],
  'Turuncu':                  ['Orange', 'Orange', 'Naranja', 'Orange', 'Laranja', 'Оранжевый'],
  'Pembe':                    ['Pink', 'Pink', 'Rosa', 'Rose', 'Rosa', 'Розовый'],
  'Lacivert':                 ['Navy Blue', 'Marineblau', 'Azul Marino', 'Bleu Marine', 'Azul Marinho', 'Тёмно-Синий'],

  // Smartwatch microphones
  '3 Mikrofonlu':             ['3 Microphones', '3 Mikrofone', '3 Micrófonos', '3 Microphones', '3 Microfones', '3 Микрофона'],
  '2 Mikrofonlu':             ['2 Microphones', '2 Mikrofone', '2 Micrófonos', '2 Microphones', '2 Microfones', '2 Микрофона'],
  '4 Mikrofonlu':             ['4 Microphones', '4 Mikrofone', '4 Micrófonos', '4 Microphones', '4 Microfones', '4 Микрофона'],
  'Gürültü Önleyici Mikrofon':['Noise-Cancelling Microphone', 'Geräuschunterdrückendes Mikrofon', 'Micrófono con Cancelación de Ruido', 'Microphone à Réduction de Bruit', 'Microfone com Cancelamento de Ruído', 'Микрофон с Шумоподавлением'],

  // Health spec keys (whole-string entries the SPA looks up)
  'Sağlık ve Kalori Takibi':  ['Health and Calorie Tracking', 'Gesundheits- und Kalorienverfolgung', 'Seguimiento de Salud y Calorías', 'Suivi Santé et Calories', 'Monitoramento de Saúde e Calorias', 'Отслеживание Здоровья и Калорий'],
  'Health ve':                ['Health and', 'Gesundheit und', 'Salud y', 'Santé et', 'Saúde e', 'Здоровье и'],
  'Health ve Kalori Takibi':  ['Health and Calorie Tracking', 'Gesundheits- und Kalorienverfolgung', 'Seguimiento de Salud y Calorías', 'Suivi Santé et Calories', 'Monitoramento de Saúde e Calorias', 'Отслеживание Здоровья и Калорий'],
  'Health Tavsiyesi':         ['Health Advice', 'Gesundheitsempfehlung', 'Consejo de Salud', 'Conseil Santé', 'Conselho de Saúde', 'Рекомендации по Здоровью'],
  '(Heart Speed) Kalori Takibi':['Heart Rate / Calorie Tracking', 'Herzfrequenz / Kalorienverfolgung', 'Ritmo Cardíaco / Seguimiento de Calorías', 'Fréquence Cardiaque / Suivi des Calories', 'Frequência Cardíaca / Monitoramento de Calorias', 'Частота Пульса / Отслеживание Калорий'],
  'Nabız (Kalori Takibi)':    ['Heart Rate (Calorie Tracking)', 'Herzfrequenz (Kalorienverfolgung)', 'Ritmo Cardíaco (Seguimiento de Calorías)', 'Fréquence Cardiaque (Suivi des Calories)', 'Frequência Cardíaca (Monitoramento de Calorias)', 'Частота Пульса (Отслеживание Калорий)'],
  'Uyku Hareketsizlik Kandaki Oksijen Level (SpO2) Health Nefes Stres Level Display':
                              ['Sleep Inactivity / Blood Oxygen (SpO2) / Health Breathing / Stress Level Display', 'Schlafinaktivität / Blutsauerstoff (SpO2) / Gesundheits-Atmung / Stress-Level-Anzeige', 'Inactividad del Sueño / Oxígeno en Sangre (SpO2) / Respiración / Visualización del Nivel de Estrés', 'Inactivité du Sommeil / Oxygène Sanguin (SpO2) / Respiration Santé / Affichage du Niveau de Stress', 'Inatividade do Sono / Oxigênio no Sangue (SpO2) / Respiração / Visualização do Nível de Estresse', 'Бездействие во сне / Кислород в крови (SpO2) / Дыхание / Уровень стресса'],
  'Uyku Hareketsizlik Health Nefes Stres Level Display':
                              ['Sleep Inactivity / Health Breathing / Stress Level Display', 'Schlafinaktivität / Gesundheits-Atmung / Stress-Level-Anzeige', 'Inactividad del Sueño / Respiración Saludable / Pantalla de Nivel de Estrés', 'Inactivité du Sommeil / Respiration Santé / Affichage du Niveau de Stress', 'Inatividade do Sono / Respiração Saudável / Visualização do Nível de Estresse', 'Бездействие во сне / Здоровое дыхание / Уровень стресса'],
  'Uyku Kandaki Oksijen Level (SpO2) Health Nefes Elektriksel Heart (ECG/ECG)':
                              ['Sleep / Blood Oxygen (SpO2) / Health Breathing / Electrical Heart Rate (ECG/EKG)', 'Schlaf / Blutsauerstoff (SpO2) / Gesundheits-Atmung / Elektrische Herzfrequenz (EKG)', 'Sueño / Oxígeno en Sangre (SpO2) / Respiración Saludable / Frecuencia Cardíaca Eléctrica (ECG/EKG)', 'Sommeil / Oxygène Sanguin (SpO2) / Respiration Santé / Fréquence Cardiaque Électrique (ECG)', 'Sono / Oxigênio no Sangue (SpO2) / Respiração Saudável / Frequência Cardíaca Elétrica (ECG/EKG)', 'Сон / Кислород в крови (SpO2) / Здоровое дыхание / ЭКГ'],
  'Uyku Hareketsizlik Health Nefes Stres Level Display Ritim Notification Ruh Hali Takibi':
                              ['Sleep Inactivity / Breathing / Stress / Rhythm Notification / Mood Tracking', 'Schlafinaktivität / Atmung / Stress / Rhythmus-Benachrichtigung / Stimmungsverfolgung', 'Inactividad del Sueño / Respiración / Estrés / Notificación de Ritmo / Seguimiento del Estado de Ánimo', 'Inactivité du Sommeil / Respiration / Stress / Notification de Rythme / Suivi de l\'Humeur', 'Inatividade do Sono / Respiração / Estresse / Notificação de Ritmo / Monitoramento de Humor', 'Бездействие во сне / Дыхание / Стресс / Уведомление о ритме / Отслеживание настроения'],
  'Body Ritim Notification':  ['Body Rhythm Notification', 'Körperrhythmus-Benachrichtigung', 'Notificación de Ritmo Corporal', 'Notification de Rythme Corporel', 'Notificação de Ritmo Corporal', 'Уведомление о Ритме Тела'],
  'Body Ritim Notification Ruh Hali Takibi':
                              ['Body Rhythm Notification / Mood Tracking', 'Körperrhythmus-Benachrichtigung / Stimmungsverfolgung', 'Notificación de Ritmo Corporal / Seguimiento del Estado de Ánimo', 'Notification de Rythme Corporel / Suivi de l\'Humeur', 'Notificação de Ritmo Corporal / Monitoramento de Humor', 'Уведомление о ритме тела / Отслеживание настроения'],
  'Hiper Tansiyon Notification Ruh Hali Takibi':
                              ['Hypertension Notification / Mood Tracking', 'Bluthochdruck-Benachrichtigung / Stimmungsverfolgung', 'Notificación de Hipertensión / Seguimiento del Estado de Ánimo', 'Notification d\'Hypertension / Suivi de l\'Humeur', 'Notificação de Hipertensão / Monitoramento de Humor', 'Уведомление о гипертонии / Отслеживание настроения'],
  'Health Tavsiyesi Kimlik Uyku Apnesi Notification':
                              ['Health Recommendation / ID / Sleep Apnea Notification', 'Gesundheitsempfehlung / ID / Schlafapnoe-Benachrichtigung', 'Recomendación de Salud / ID / Notificación de Apnea del Sueño', 'Recommandation Santé / ID / Notification d\'Apnée du Sommeil', 'Recomendação de Saúde / ID / Notificação de Apneia do Sono', 'Рекомендация по здоровью / ID / Уведомление об апноэ во сне'],
  'Uyku Apnesi Notification': ['Sleep Apnea Notification', 'Schlafapnoe-Benachrichtigung', 'Notificación de Apnea del Sueño', 'Notification d\'Apnée du Sommeil', 'Notificação de Apneia do Sono', 'Уведомление об Апноэ во Сне'],
  'İlaç Hatırlatıcısı':       ['Medication Reminder', 'Medikamentenerinnerung', 'Recordatorio de Medicación', 'Rappel de Médicaments', 'Lembrete de Medicação', 'Напоминание о Лекарствах'],
  'Vücut Ateş Ölçer':         ['Body Temperature Sensor', 'Körpertemperatursensor', 'Sensor de Temperatura Corporal', 'Capteur de Température Corporelle', 'Sensor de Temperatura Corporal', 'Датчик Температуры Тела'],
  'Elektriksel Kalp Monitörü':['Electrical Heart Monitor', 'Elektrischer Herzmonitor', 'Monitor Cardíaco Eléctrico', 'Moniteur Cardiaque Électrique', 'Monitor Cardíaco Elétrico', 'Электрический Кардиомонитор'],
  'Elektriksel Heart (ECG/ECG)':['Electrical Heart Rate (ECG/EKG)', 'Elektrische Herzfrequenz (EKG)', 'Frecuencia Cardíaca Eléctrica (ECG/EKG)', 'Fréquence Cardiaque Électrique (ECG)', 'Frequência Cardíaca Elétrica (ECG/EKG)', 'Электрическая ЭКГ'],
  'Sim ile Saat Üzerinden':   ['Via SIM on Watch', 'Über SIM auf der Uhr', 'Vía SIM en el Reloj', 'Via SIM sur la Montre', 'Via SIM no Relógio', 'Через SIM на часах'],

  // Emergency / security
  'Acil Durum':               ['Emergency', 'Notfall', 'Emergencia', 'Urgence', 'Emergência', 'Экстренный'],
  'Acil Durum Çağrı':         ['Emergency Call', 'Notrufanruf', 'Llamada de Emergencia', 'Appel d\'Urgence', 'Chamada de Emergência', 'Экстренный Вызов'],
  'Acil Durum Calling (SOS)': ['Emergency Calling (SOS)', 'Notruf (SOS)', 'Llamada de Emergencia (SOS)', 'Appel d\'Urgence (SOS)', 'Chamada de Emergência (SOS)', 'Экстренный Вызов (SOS)'],
  'Acil Durum Smart Ev Compatibility Location Takibi':
                              ['Emergency Smart Home Compatibility / Location Tracking', 'Notfall-Smart-Home-Kompatibilität / Standortverfolgung', 'Compatibilidad de Casa Inteligente de Emergencia / Seguimiento de Ubicación', 'Compatibilité Maison Connectée d\'Urgence / Suivi de Localisation', 'Compatibilidade de Casa Inteligente de Emergência / Rastreamento de Localização', 'Совместимость с умным домом / Отслеживание местоположения'],
  'Location Info Acil Call':  ['Location Info Emergency Call', 'Standortinformations-Notruf', 'Llamada de Emergencia con Información de Ubicación', 'Appel d\'Urgence avec Informations de Localisation', 'Chamada de Emergência com Informações de Localização', 'Экстренный вызов с информацией о местоположении'],
  'Location Info Siren Audioi Acil Call':
                              ['Location Info / Siren / Audio Emergency Call', 'Standortinformation / Sirene / Audio-Notruf', 'Información de Ubicación / Sirena / Llamada de Emergencia por Audio', 'Informations de Localisation / Sirène / Appel d\'Urgence Audio', 'Informações de Localização / Sirene / Chamada de Emergência por Áudio', 'Информация о местоположении / Сирена / Голосовой экстренный вызов'],
  'Geriye Location Takibi':   ['Reverse Location Tracking', 'Rückwärts-Standortverfolgung', 'Seguimiento de Ubicación Inverso', 'Suivi de Localisation Inversé', 'Rastreamento de Localização Reverso', 'Обратное Отслеживание Местоположения'],
  'Security ve Protection':   ['Security and Protection', 'Sicherheit und Schutz', 'Seguridad y Protección', 'Sécurité et Protection', 'Segurança e Proteção', 'Безопасность и Защита'],
  'Kaza Algılama':            ['Crash Detection', 'Unfallerkennung', 'Detección de Choque', 'Détection d\'Accident', 'Detecção de Acidente', 'Обнаружение Аварии'],

  // Battery / charging — minutesda / hourslik pattern + Dolum
  'Battery Dolum Time':       ['Charging Time', 'Ladezeit', 'Tiempo de Carga', 'Temps de Charge', 'Tempo de Carregamento', 'Время Зарядки'],
  '15 minutesda 8 hourslik Use':['8 Hours Use in 15 Minutes', '8 Stunden Nutzung in 15 Minuten', '8 Horas de Uso en 15 Minutos', '8 Heures d\'Utilisation en 15 Minutes', '8 Horas de Uso em 15 Minutos', '8 часов использования за 15 минут'],
  '15 minutesda 12 hourslik use':['12 Hours Use in 15 Minutes', '12 Stunden Nutzung in 15 Minuten', '12 Horas de Uso en 15 Minutos', '12 Heures d\'Utilisation en 15 Minutes', '12 Horas de Uso em 15 Minutos', '12 часов использования за 15 минут'],
  '30 minutesda %80 Dolum':   ['80% Charge in 30 Minutes', '80% Aufladung in 30 Minuten', '80% de Carga en 30 Minutos', '80% de Charge en 30 Minutes', '80% de Carga em 30 Minutos', '80% заряда за 30 минут'],
  '45 minutesda %80 Dolum':   ['80% Charge in 45 Minutes', '80% Aufladung in 45 Minuten', '80% de Carga en 45 Minutos', '80% de Charge en 45 Minutes', '80% de Carga em 45 Minutos', '80% заряда за 45 минут'],
  '60 minutesda %80 Dolum':   ['80% Charge in 60 Minutes', '80% Aufladung in 60 Minuten', '80% de Carga en 60 Minutos', '80% de Charge en 60 Minutes', '80% de Carga em 60 Minutos', '80% заряда за 60 минут'],
  '90 minutesda %80 Dolum':   ['80% Charge in 90 Minutes', '80% Aufladung in 90 Minuten', '80% de Carga en 90 Minutos', '90% de Charge en 90 Minutes', '80% de Carga em 90 Minutos', '80% заряда за 90 минут'],
  '80 minutesda %100 Charging':['100% Charge in 80 Minutes', '100% Aufladung in 80 Minuten', '100% de Carga en 80 Minutos', '100% de Charge en 80 Minutes', '100% de Carga em 80 Minutos', '100% заряда за 80 минут'],
  'Li-Po (lithium polymer) 30 minutesda %50 Charging':
                              ['Li-Po (lithium polymer), 50% charge in 30 minutes', 'Li-Po (Lithium-Polymer), 50% Aufladung in 30 Minuten', 'Li-Po (polímero de litio), 50% de carga en 30 minutos', 'Li-Po (lithium polymère), 50% de charge en 30 minutes', 'Li-Po (polímero de lítio), 50% de carga em 30 minutos', 'Li-Po (литий-полимер), 50% заряда за 30 минут'],

  // Display / panel — extra long compound atoms
  'TÜV Rheinland Low Blue Light':['TÜV Rheinland Low Blue Light', 'TÜV Rheinland geringes Blaulicht', 'TÜV Rheinland Luz Azul Reducida', 'TÜV Rheinland Faible Lumière Bleue', 'TÜV Rheinland Baixa Luz Azul', 'TÜV Rheinland низкий уровень синего света'],
  'TÜV Rheinland Low Blue Light (Hardware Solution)':
                              ['TÜV Rheinland Low Blue Light (Hardware Solution)', 'TÜV Rheinland geringes Blaulicht (Hardware-Lösung)', 'TÜV Rheinland Luz Azul Reducida (Solución de Hardware)', 'TÜV Rheinland Faible Lumière Bleue (Solution Matérielle)', 'TÜV Rheinland Baixa Luz Azul (Solução de Hardware)', 'TÜV Rheinland низкий уровень синего света (Аппаратное решение)'],
  'TÜV Rheinland Low blue light Certificate':['TÜV Rheinland Low Blue Light Certificate', 'TÜV Rheinland-Zertifikat geringes Blaulicht', 'Certificado TÜV Rheinland de Luz Azul Reducida', 'Certificat TÜV Rheinland Faible Lumière Bleue', 'Certificado TÜV Rheinland de Baixa Luz Azul', 'Сертификат TÜV Rheinland о низком уровне синего света'],
  'TÜV Rheinland Low blue light Certificate ()':['TÜV Rheinland Low Blue Light Certificate', 'TÜV Rheinland-Zertifikat geringes Blaulicht', 'Certificado TÜV Rheinland de Luz Azul Reducida', 'Certificat TÜV Rheinland Faible Lumière Bleue', 'Certificado TÜV Rheinland de Baixa Luz Azul', 'Сертификат TÜV Rheinland о низком уровне синего света'],
  'TÜV Rheinland Low blue light certification ()':['TÜV Rheinland Low Blue Light Certification', 'TÜV Rheinland-Zertifizierung geringes Blaulicht', 'Certificación TÜV Rheinland de Luz Azul Reducida', 'Certification TÜV Rheinland Faible Lumière Bleue', 'Certificação TÜV Rheinland de Baixa Luz Azul', 'Сертификация TÜV Rheinland низкого уровня синего света'],
  'TÜV Rheinland High Game Performance':['TÜV Rheinland High Gaming Performance', 'TÜV Rheinland Hochleistungs-Gaming', 'TÜV Rheinland Alto Rendimiento de Juego', 'TÜV Rheinland Haute Performance de Jeu', 'TÜV Rheinland Alto Desempenho de Jogos', 'TÜV Rheinland Высокая игровая производительность'],
  'Fabrika Color Kalibrasyonu':['Factory Color Calibration', 'Werkskalibrierung der Farben', 'Calibración de Color de Fábrica', 'Calibration Couleur d\'Usine', 'Calibração de Cor de Fábrica', 'Заводская Цветовая Калибровка'],
  'Fabrika Renk Kalibrasyonu': ['Factory Color Calibration', 'Werkskalibrierung der Farben', 'Calibración de Color de Fábrica', 'Calibration Couleur d\'Usine', 'Calibração de Cor de Fábrica', 'Заводская Цветовая Калибровка'],

  // Smartwatch — sport / activity / sea
  'Multi Spor Mode':          ['Multi-Sport Mode', 'Mehrsportmodus', 'Modo Multideporte', 'Mode Multi-Sport', 'Modo Multiesporte', 'Многоспортивный Режим'],
  'Çoklu Spor Modu':          ['Multi-Sport Mode', 'Mehrsportmodus', 'Modo Multideporte', 'Mode Multi-Sport', 'Modo Multiesporte', 'Многоспортивный Режим'],
  'Hibrit Cooling (/Hava/Metal Plaka)':['Hybrid Cooling (Air/Metal Plate)', 'Hybridkühlung (Luft/Metallplatte)', 'Refrigeración Híbrida (Aire/Placa Metálica)', 'Refroidissement Hybride (Air/Plaque Métallique)', 'Refrigeração Híbrida (Ar/Placa Metálica)', 'Гибридное охлаждение (воздух/металлическая пластина)'],
  'Hibrit Soğutma':           ['Hybrid Cooling', 'Hybridkühlung', 'Refrigeración Híbrida', 'Refroidissement Hybride', 'Refrigeração Híbrida', 'Гибридное Охлаждение'],
  'Hava Status':              ['Weather', 'Wetter', 'Tiempo', 'Météo', 'Tempo', 'Погода'],
  'Hava Durumu':              ['Weather', 'Wetter', 'Tiempo', 'Météo', 'Tempo', 'Погода'],
  'Mesafe Aktivite Takibi ve History':['Distance Activity Tracking and History', 'Distanz-Aktivitätsverfolgung und Verlauf', 'Seguimiento de Actividad por Distancia e Historial', 'Suivi d\'Activité par Distance et Historique', 'Monitoramento de Atividade por Distância e Histórico', 'Отслеживание активности по расстоянию и история'],
  'Deniz Suyu Temperature Geri Rotation Hedef Belirleme':
                              ['Sea Water Temperature / Reverse Heading / Target Setting', 'Meerwassertemperatur / Rückwärtsrichtung / Zieleinstellung', 'Temperatura del Agua de Mar / Rumbo Inverso / Establecer Objetivo', 'Température de l\'Eau de Mer / Cap Inverse / Définir un Objectif', 'Temperatura da Água do Mar / Direção Reversa / Definir Objetivo', 'Температура морской воды / Обратное направление / Установка цели'],
  'Speed Rota (Parkur) Takibi Virtual Antreman Partneri':
                              ['Speed Route Tracking / Virtual Workout Partner', 'Geschwindigkeits-Streckenverfolgung / Virtueller Trainingspartner', 'Seguimiento de Ruta de Velocidad / Compañero de Entrenamiento Virtual', 'Suivi d\'Itinéraire de Vitesse / Partenaire d\'Entraînement Virtuel', 'Rastreamento de Rota de Velocidade / Parceiro de Treino Virtual', 'Отслеживание скоростного маршрута / Виртуальный партнёр по тренировке'],
  'Rota (Parkur) Takibi Virtual Antreman Partneri':
                              ['Route Tracking / Virtual Workout Partner', 'Streckenverfolgung / Virtueller Trainingspartner', 'Seguimiento de Ruta / Compañero de Entrenamiento Virtual', 'Suivi d\'Itinéraire / Partenaire d\'Entraînement Virtuel', 'Rastreamento de Rota / Parceiro de Treino Virtual', 'Отслеживание маршрута / Виртуальный партнёр по тренировке'],
  'Rota Takibi':              ['Route Tracking', 'Streckenverfolgung', 'Seguimiento de Ruta', 'Suivi d\'Itinéraire', 'Rastreamento de Rota', 'Отслеживание Маршрута'],
  'Parkur Takibi':            ['Course Tracking', 'Kurs-Verfolgung', 'Seguimiento de Recorrido', 'Suivi de Parcours', 'Rastreamento de Percurso', 'Отслеживание Курса'],
  'Sanal Antreman Partneri':  ['Virtual Workout Partner', 'Virtueller Trainingspartner', 'Compañero de Entrenamiento Virtual', 'Partenaire d\'Entraînement Virtuel', 'Parceiro de Treino Virtual', 'Виртуальный Партнёр по Тренировке'],
  'Antreman':                 ['Workout', 'Training', 'Entrenamiento', 'Entraînement', 'Treino', 'Тренировка'],
  'Smart Geri Rotation Hedef Belirleme':['Smart Reverse Rotation Target Setting', 'Smarte Rückwärtsrotation-Zieleinstellung', 'Configuración Inteligente de Objetivo de Rotación Inversa', 'Réglage Intelligent de Cible de Rotation Inverse', 'Configuração Inteligente de Alvo de Rotação Reversa', 'Умная установка цели обратного вращения'],
  'Smart Deniz Suyu Temperature Geri Rotation Hedef Belirleme':['Smart Sea Water Temperature / Reverse Heading / Target Setting', 'Smarte Meerwassertemperatur / Rückwärtsrichtung / Zieleinstellung', 'Temperatura Inteligente del Agua de Mar / Rumbo Inverso / Establecer Objetivo', 'Température Intelligente de l\'Eau de Mer / Cap Inverse / Définir un Objectif', 'Temperatura Inteligente da Água do Mar / Direção Reversa / Definir Objetivo', 'Умная температура морской воды / Обратное направление / Установка цели'],
  'Geri Rotation':            ['Reverse Heading', 'Rückwärtsrichtung', 'Rumbo Inverso', 'Cap Inverse', 'Direção Reversa', 'Обратное Направление'],
  'Geriye Yön':               ['Reverse Heading', 'Rückwärtsrichtung', 'Rumbo Inverso', 'Cap Inverse', 'Direção Reversa', 'Обратное Направление'],
  'Hedef Belirleme':          ['Target Setting', 'Zieleinstellung', 'Establecer Objetivo', 'Définir un Objectif', 'Definir Objetivo', 'Установка Цели'],
  'Deniz Suyu Sıcaklığı':     ['Sea Water Temperature', 'Meerwassertemperatur', 'Temperatura del Agua de Mar', 'Température de l\'Eau de Mer', 'Temperatura da Água do Mar', 'Температура Морской Воды'],
  'Deniz Suyu':               ['Sea Water', 'Meerwasser', 'Agua de Mar', 'Eau de Mer', 'Água do Mar', 'Морская Вода'],
  'Gelgit Grafikleri':        ['Tide Graphics', 'Gezeitendiagramme', 'Gráficos de Mareas', 'Graphiques de Marées', 'Gráficos de Marés', 'Графики Приливов'],
  'Gelgit Graphics':          ['Tide Graphics', 'Gezeitendiagramme', 'Gráficos de Mareas', 'Graphiques de Marées', 'Gráficos de Marés', 'Графики Приливов'],

  // Services / Apps section common atoms
  'Services ve Applications': ['Services and Applications', 'Dienste und Anwendungen', 'Servicios y Aplicaciones', 'Services et Applications', 'Serviços e Aplicações', 'Сервисы и Приложения'],
  'Sesli Komut':              ['Voice Command', 'Sprachbefehl', 'Comando de Voz', 'Commande Vocale', 'Comando de Voz', 'Голосовая Команда'],
  '1 x Uyku Modunda Charging Support':['1 x Sleep Mode Charging Support', '1 x Lade-Unterstützung im Schlafmodus', '1 x Carga Compatible en Modo Suspensión', '1 x Support de Charge en Mode Veille', '1 x Suporte de Carregamento em Modo de Suspensão', '1 x поддержка зарядки в спящем режиме'],
  '1 x Uyku Modunda Şarj Desteği':['1 x Sleep Mode Charging Support', '1 x Lade-Unterstützung im Schlafmodus', '1 x Carga Compatible en Modo Suspensión', '1 x Support de Charge en Mode Veille', '1 x Suporte de Carregamento em Modo de Suspensão', '1 x поддержка зарядки в спящем режиме'],
  'TÜV Rheinland Flicker Free':['TÜV Rheinland Flicker Free', 'TÜV Rheinland Flicker Free', 'TÜV Rheinland Sin Parpadeo', 'TÜV Rheinland Sans Scintillement', 'TÜV Rheinland Sem Cintilação', 'TÜV Rheinland без мерцания'],
  'Flicker Free':             ['Flicker Free', 'Flimmerfrei', 'Sin Parpadeo', 'Sans Scintillement', 'Sem Cintilação', 'Без Мерцания'],
};

// ──────────────────────────────────────────────────────────────────────────

function normalizeKey(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function buildTerms() {
  const terms = {};
  for (const [src, vals] of Object.entries(SEED)) {
    if (!vals || vals.length < LANGS.length) continue;
    const key = normalizeKey(src);
    if (!key) continue;
    const entry = { tr: src };
    LANGS.forEach((l, i) => { if (vals[i]) entry[l] = vals[i]; });
    terms[key] = entry;
  }
  return terms;
}

function buildShards(terms) {
  const shards = [];
  let shard = {};
  let bytes = 0;
  for (const [key, value] of Object.entries(terms)) {
    const entryBytes = Buffer.byteLength(JSON.stringify({ [key]: value }), 'utf8');
    if (Object.keys(shard).length && bytes + entryBytes > DICT_SHARD_MAX_BYTES) {
      shards.push(shard);
      shard = {};
      bytes = 0;
    }
    shard[key] = value;
    bytes += entryBytes;
  }
  if (Object.keys(shard).length) shards.push(shard);
  return shards;
}

async function auth() {
  const r = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASSWORD }),
  });
  if (!r.ok) throw new Error(`auth failed: HTTP ${r.status} ${await r.text()}`);
  return (await r.json()).token;
}

async function upsertRecord(token, key, value) {
  const search = await fetch(
    `${PB_URL}/api/collections/public_config/records?filter=${encodeURIComponent(`key="${key}"`)}&fields=id`,
    { headers: { Authorization: token } },
  );
  if (!search.ok) throw new Error(`search ${key}: HTTP ${search.status}`);
  const { items } = await search.json();
  const body = { key, value, updatedAt: new Date().toISOString() };
  if (items && items.length) {
    const r = await fetch(`${PB_URL}/api/collections/public_config/records/${items[0].id}`, {
      method: 'PATCH',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`update ${key}: HTTP ${r.status} ${await r.text()}`);
  } else {
    const r = await fetch(`${PB_URL}/api/collections/public_config/records`, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`create ${key}: HTTP ${r.status} ${await r.text()}`);
  }
}

(async () => {
  const terms = buildTerms();
  const shards = buildShards(terms);
  console.log(`Seed entries: ${Object.keys(terms).length} terms → ${shards.length} shard(s)`);
  if (!CONFIRM) {
    console.log('DRY RUN — pass --confirm to upload to PocketBase.');
    return;
  }
  const token = await auth();
  console.log('Authenticated to PocketBase.');
  const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const updatedAt = new Date().toISOString();
  for (let i = 0; i < shards.length; i++) {
    const key = `${DICT_SHARD_PREFIX}${String(i).padStart(4, '0')}`;
    await upsertRecord(token, key, {
      sharded: true,
      batchId,
      index: i,
      total: shards.length,
      terms: shards[i],
    });
    console.log(`  ✓ wrote ${key} (${Object.keys(shards[i]).length} entries)`);
  }
  await upsertRecord(token, DICT_MANIFEST_KEY, {
    sharded: true,
    batchId,
    totalShards: shards.length,
    totalTerms: Object.keys(terms).length,
    updatedAt,
  });
  console.log(`  ✓ wrote manifest`);
  await upsertRecord(token, DICT_PB_KEY, {
    sharded: true,
    manifestKey: DICT_MANIFEST_KEY,
    totalShards: shards.length,
    totalTerms: Object.keys(terms).length,
    updatedAt,
  });
  console.log(`  ✓ wrote pointer record`);
  console.log(`\nDone — seeded ${Object.keys(terms).length} terms across ${shards.length} shard(s).`);
})().catch(err => {
  console.error('Seeder failed:', err);
  process.exit(1);
});
