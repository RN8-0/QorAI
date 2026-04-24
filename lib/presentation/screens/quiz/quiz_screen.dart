library;

import 'dart:ui';

import 'package:qor_ai/core/constants.dart';
import 'package:qor_ai/core/errors.dart';
import 'package:qor_ai/core/pb_client.dart';
import 'package:qor_ai/core/theme.dart';
import 'package:qor_ai/domain/entities/user_entity.dart';
import 'package:qor_ai/presentation/providers/providers.dart';
import 'package:qor_ai/routing/router.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:pocketbase/pocketbase.dart';

const List<String> _quizCategoryUniverse = [
  'smartphones',
  'tablets',
  'laptops',
  'desktops',
  'cpus',
  'gpus',
  'ram',
  'ssd',
  'motherboards',
  'psu',
  'cases',
  'coolers',
  'monitors',
  'keyboards',
  'mice',
  'webcams',
  'printers',
  'tvs',
  'projectors',
  'media-players',
  'headphones',
  'speakers',
  'soundbars',
  'microphones',
  'smartwatches',
  'smart-rings',
  'cameras',
  'action-cameras',
  'security-cameras',
  'ip-cameras',
  'dashcams',
  'gimbals',
  'tripods',
  'lenses',
  'consoles',
  'gamepads',
  'vr-headsets',
  'routers',
  'robot-vacuums',
  'powerbanks',
  'e-readers',
  'drones',
];

const List<String> _deviceCategoryUniverse = [
  'smartphones',
  'tablets',
  'laptops',
  'desktops',
  'monitors',
  'keyboards',
  'mice',
  'webcams',
  'printers',
  'tvs',
  'projectors',
  'media-players',
  'headphones',
  'speakers',
  'soundbars',
  'microphones',
  'smartwatches',
  'smart-rings',
  'cameras',
  'action-cameras',
  'security-cameras',
  'ip-cameras',
  'dashcams',
  'gimbals',
  'tripods',
  'lenses',
  'consoles',
  'gamepads',
  'vr-headsets',
  'routers',
  'robot-vacuums',
  'powerbanks',
  'e-readers',
  'drones',
];

String? _recordImageUrl(RecordModel record) {
  final data = record.data;
  final imageUrl = (data['imageURL'] ?? data['imageUrl'])?.toString();
  if (imageUrl != null && imageUrl.trim().isNotEmpty) {
    return imageUrl.trim();
  }

  final images = data['images'];
  if (images is List) {
    for (final item in images) {
      final value = item?.toString().trim();
      if (value != null && value.isNotEmpty) {
        return value;
      }
    }
  }

  return null;
}

DateTime? _recordDateValue(dynamic value) {
  if (value is String && value.trim().isNotEmpty) {
    return DateTime.tryParse(value.trim());
  }
  return null;
}

DateTime? _recordBestDate(RecordModel record) {
  final data = record.data;
  return _recordDateValue(data['lastUpdated']) ??
      _recordDateValue(data['createdAt']) ??
      _recordDateValue(data['scrapedAt']) ??
      _recordDateValue(record.getStringValue('updated')) ??
      _recordDateValue(record.getStringValue('created'));
}

double _quizCoverScore(RecordModel record) {
  final data = record.data;
  final techScore = (data['techScore'] as num?)?.toDouble() ?? 0;
  final trendScore = (data['trendScore'] as num?)?.toDouble() ?? 0;
  final referenceDate = _recordBestDate(record);
  final ageDays = referenceDate == null
      ? 9999
      : DateTime.now().difference(referenceDate).inDays;

  final recencyBonus = switch (ageDays) {
    <= 120 => 18.0,
    <= 240 => 12.0,
    <= 365 => 7.0,
    <= 540 => 2.0,
    <= 900 => -6.0,
    _ => -14.0,
  };

  return techScore + (trendScore * 0.08) + recencyBonus;
}

final quizCategoryVisualsProvider = FutureProvider<Map<String, String>>((
  ref,
) async {
  try {
    final bestByCategory = <String, ({double score, String image})>{};

    for (var page = 1; page <= 4; page++) {
      final result = await pb
          .collection(AppConstants.productsCollection)
          .getList(
            page: page,
            perPage: 200,
            sort: '-techScore,-trendScore,-created',
            fields:
                'category,imageURL,imageUrl,images,techScore,trendScore,lastUpdated,createdAt,scrapedAt',
          );

      for (final record in result.items) {
        final category = record.data['category']?.toString();
        if (category == null || !_quizCategoryUniverse.contains(category)) {
          continue;
        }

        final image = _recordImageUrl(record);
        if (image == null || image.isEmpty) continue;

        final score = _quizCoverScore(record);
        final existing = bestByCategory[category];
        if (existing == null || score > existing.score) {
          bestByCategory[category] = (score: score, image: image);
        }
      }
    }

    final missingCategories = _quizCategoryUniverse
        .where((category) => !bestByCategory.containsKey(category))
        .toList();

    if (missingCategories.isNotEmpty) {
      final fallbacks = await Future.wait(
        missingCategories.map((category) async {
          try {
            final result = await pb
                .collection(AppConstants.productsCollection)
                .getList(
                  page: 1,
                  perPage: 12,
                  sort: '-techScore,-trendScore,-created',
                  filter: 'category = "$category"',
                  fields:
                      'category,imageURL,imageUrl,images,techScore,trendScore,lastUpdated,createdAt,scrapedAt',
                );

            RecordModel? bestRecord;
            double bestScore = double.negativeInfinity;
            for (final record in result.items) {
              final image = _recordImageUrl(record);
              if (image == null || image.isEmpty) continue;
              final score = _quizCoverScore(record);
              if (score > bestScore) {
                bestScore = score;
                bestRecord = record;
              }
            }

            if (bestRecord == null) return null;
            final image = _recordImageUrl(bestRecord);
            if (image == null || image.isEmpty) return null;
            return MapEntry(category, image);
          } catch (_) {
            return null;
          }
        }),
      );

      for (final entry in fallbacks) {
        if (entry != null) {
          bestByCategory[entry.key] = (
            score: bestByCategory[entry.key]?.score ?? 0,
            image: entry.value,
          );
        }
      }
    }

    return {
      for (final entry in bestByCategory.entries) entry.key: entry.value.image,
    };
  } catch (e, st) {
    debugPrint('[Quiz] quizCategoryVisualsProvider failed: $e\n$st');
    return const {};
  }
});

class QuizScreen extends ConsumerStatefulWidget {
  const QuizScreen({super.key});

  @override
  ConsumerState<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends ConsumerState<QuizScreen> {
  final PageController _pageController = PageController();

  int _currentPage = 0;
  bool _isSubmitting = false;
  bool _showCompletion = false;
  bool _didPrefill = false;

  String? _ageRange;
  String? _ecosystem;
  String? _budgetRange;
  String? _usageIntent;
  String? _profession;

  final List<String> _interestCategories = [];
  final List<String> _priorities = [];
  final List<String> _currentDevices = [];
  final List<String> _subscriptions = [];
  final Set<String> _prefetchedCoverUrls = <String>{};

  bool get _isTurkish => Localizations.localeOf(context).languageCode == 'tr';
  bool get _isDarkTheme => Theme.of(context).brightness == Brightness.dark;

  String _t(String tr, String en) => _isTurkish ? tr : en;
  Color get _pageBackground =>
      _isDarkTheme ? const Color(0xFF07101A) : const Color(0xFFF5F7FB);
  Color get _surfaceColor =>
      _isDarkTheme ? Colors.white.withValues(alpha: 0.05) : Colors.white;
  Color get _surfaceStrongColor => _isDarkTheme
      ? Colors.white.withValues(alpha: 0.08)
      : const Color(0xFFF0F4FA);
  Color get _borderColor => _isDarkTheme
      ? Colors.white.withValues(alpha: 0.08)
      : const Color(0xFFD8E1EC);
  Color get _primaryTextColor =>
      _isDarkTheme ? Colors.white : const Color(0xFF0F172A);
  Color get _secondaryTextColor => _isDarkTheme
      ? Colors.white.withValues(alpha: 0.72)
      : const Color(0xFF475569);
  Color get _mutedTextColor => _isDarkTheme
      ? Colors.white.withValues(alpha: 0.58)
      : const Color(0xFF64748B);
  Color get _buttonDisabledBg => _isDarkTheme
      ? Colors.white.withValues(alpha: 0.12)
      : const Color(0xFFE2E8F0);
  Color get _buttonDisabledFg =>
      _isDarkTheme ? Colors.white54 : const Color(0xFF64748B);
  Color get _selectionCheckColor => _isDarkTheme ? Colors.black : Colors.white;

  List<_QuizStep> get _steps => [
    _QuizStep(
      field: 'interestCategories',
      title: _t(
        'En çok hangi ürünleri keşfetmek istiyorsun?',
        'What do you want to discover most?',
      ),
      subtitle: _t('En az 3 kategori seç.', 'Pick at least 3 categories.'),
      algorithmHint: _t(
        'Ana sayfa algoritması, kategori önceliği ve AI yönlendirmesi bu seçimi kullanır.',
        'Home ranking, category priority, and AI guidance use this signal.',
      ),
      type: _StepType.categories,
      isRequired: true,
      options: _buildCategoryOptions(),
    ),
    _QuizStep(
      field: 'ecosystem',
      title: _t(
        'Hangi ekosistemi kullanıyorsun?',
        'Which ecosystem do you use?',
      ),
      subtitle: _t(
        'Kurulumuna en yakın ekosistemi seç.',
        'Choose the ecosystem closest to your setup.',
      ),
      algorithmHint: _t(
        'Ekosistem sinyali ürün uyumluluğu ve bütünlü deneyim için kullanılır.',
        'Ecosystem affinity improves compatibility and continuity scoring.',
      ),
      type: _StepType.single,
      displayStyle: _StepDisplay.list,
      isRequired: true,
      options: _buildEcosystemOptions(),
    ),
    _QuizStep(
      field: 'budgetRange',
      title: _t('Bütçen hangi bantta?', 'What budget band fits you?'),
      subtitle: _t('Bütçe seviyeni seç.', 'Choose your budget level.'),
      algorithmHint: _t(
        'Fiyat bandi, one cikarilan urunlerin seviye ve segmentini ayarlar.',
        'Budget range changes which price tier the ranking engine prefers.',
      ),
      type: _StepType.single,
      displayStyle: _StepDisplay.list,
      isRequired: true,
      options: const [
        _QuizOption(
          value: 'low',
          labelTr: 'Butce Dostu',
          labelEn: 'Budget',
          emoji: '💸',
          detailTr: 'Temel fiyat/performans',
          detailEn: 'Value first',
          coverCategory: 'powerbanks',
        ),
        _QuizOption(
          value: 'mid',
          labelTr: 'Dengeli',
          labelEn: 'Balanced',
          emoji: '💎',
          detailTr: 'Dengeli tercih',
          detailEn: 'Balanced pick',
          coverCategory: 'smartphones',
        ),
        _QuizOption(
          value: 'high',
          labelTr: 'Ust-Orta',
          labelEn: 'Upper Mid',
          emoji: '🚀',
          detailTr: 'Biraz daha guclu',
          detailEn: 'More powerful',
          coverCategory: 'laptops',
        ),
        _QuizOption(
          value: 'premium',
          labelTr: 'Premium',
          labelEn: 'Premium',
          emoji: '👑',
          detailTr: 'En ust seviye',
          detailEn: 'Top tier',
          coverCategory: 'cameras',
        ),
        _QuizOption(
          value: 'any',
          labelTr: 'Farketmez',
          labelEn: 'Any',
          emoji: '✨',
          detailTr: 'Kategoriye gore karar veririm',
          detailEn: 'I decide per category',
          coverCategory: 'headphones',
        ),
      ],
    ),
    _QuizStep(
      field: 'priorities',
      title: _t(
        'Karşılaştırmada senin için en önemli şey ne?',
        'What matters most when you compare?',
      ),
      subtitle: _t(
        'Birden fazla seçim yapabilirsin.',
        'You can choose more than one.',
      ),
      algorithmHint: _t(
        'Bu seçimler AI açıklamalarını ve puan ağırlıklarını etkiler.',
        'These selections influence AI explanations and score weighting.',
      ),
      type: _StepType.multi,
      isRequired: true,
      options: const [
        _QuizOption(
          value: 'price',
          labelTr: 'Fiyat',
          labelEn: 'Price',
          emoji: '💰',
          coverCategory: 'powerbanks',
        ),
        _QuizOption(
          value: 'quality',
          labelTr: 'Kalite',
          labelEn: 'Quality',
          emoji: '⭐',
          coverCategory: 'headphones',
        ),
        _QuizOption(
          value: 'design',
          labelTr: 'Tasarim',
          labelEn: 'Design',
          emoji: '🎨',
          coverCategory: 'tablets',
        ),
        _QuizOption(
          value: 'ecosystem',
          labelTr: 'Uyum',
          labelEn: 'Ecosystem',
          emoji: '🔗',
          coverCategory: 'smartwatches',
        ),
        _QuizOption(
          value: 'performance',
          labelTr: 'Performans',
          labelEn: 'Performance',
          emoji: '⚡',
          coverCategory: 'gpus',
        ),
        _QuizOption(
          value: 'durability',
          labelTr: 'Dayaniklilik',
          labelEn: 'Durability',
          emoji: '🛡️',
          coverCategory: 'robot-vacuums',
        ),
        _QuizOption(
          value: 'battery',
          labelTr: 'Pil Omru',
          labelEn: 'Battery Life',
          emoji: '🔋',
          coverCategory: 'smartphones',
        ),
        _QuizOption(
          value: 'camera',
          labelTr: 'Kamera Kalitesi',
          labelEn: 'Camera Quality',
          emoji: '📷',
          coverCategory: 'cameras',
        ),
        _QuizOption(
          value: 'portability',
          labelTr: 'Tasınabilirlik',
          labelEn: 'Portability',
          emoji: '🎒',
          coverCategory: 'e-readers',
        ),
        _QuizOption(
          value: 'gaming',
          labelTr: 'Gaming',
          labelEn: 'Gaming',
          emoji: '🎮',
          coverCategory: 'consoles',
        ),
        _QuizOption(
          value: 'creator',
          labelTr: 'Uretici Is Akisi',
          labelEn: 'Creator Workflow',
          emoji: '🎬',
          coverCategory: 'monitors',
        ),
        _QuizOption(
          value: 'productivity',
          labelTr: 'Verimlilik',
          labelEn: 'Productivity',
          emoji: '📈',
          coverCategory: 'laptops',
        ),
      ],
    ),
    _QuizStep(
      field: 'currentDevices',
      title: _t(
        'Şu an hangi cihazları aktif kullanıyorsun?',
        'Which devices do you actively use today?',
      ),
      subtitle: _t(
        'Veritabanındaki kategorilerden aktif kullandıklarını seç.',
        'Used to surface products that fit your existing setup.',
      ),
      algorithmHint: _t(
        'Mevcut cihazlar ekosistem puanını ve uyumluluk tahminlerini güçlendirir.',
        'Current devices reinforce ecosystem affinity and compatibility scoring.',
      ),
      type: _StepType.multi,
      isRequired: true,
      options: _buildCurrentDeviceOptions(),
    ),
    _QuizStep(
      field: 'usageIntent',
      title: _t(
        'En cok hangi amac icin satin aliyorsun?',
        'What are you mainly buying for?',
      ),
      subtitle: _t(
        'Bu secim match score ve ana sayfa kategorilerini dogrudan etkiler.',
        'This directly changes match scores and home-screen category priority.',
      ),
      algorithmHint: _t(
        'Gaming seçimi oyun odaklı ürünleri, üretkenlik seçimi ise iş/okul ürünlerini daha yukarı taşır.',
        'Choosing gaming lifts gaming-oriented gear, while productivity lifts work/school products.',
      ),
      type: _StepType.single,
      isRequired: true,
      options: const [
        _QuizOption(
          value: 'gaming_setup',
          labelTr: 'Oyun / Gaming',
          labelEn: 'Gaming & Esports',
          emoji: '🎮',
          coverCategory: 'consoles',
        ),
        _QuizOption(
          value: 'creator_setup',
          labelTr: 'İçerik Üretimi',
          labelEn: 'Creator Workflow',
          emoji: '🎬',
          coverCategory: 'cameras',
        ),
        _QuizOption(
          value: 'productivity_setup',
          labelTr: 'Okul / İş / Verimlilik',
          labelEn: 'School / Work / Productivity',
          emoji: '💼',
          coverCategory: 'laptops',
        ),
        _QuizOption(
          value: 'entertainment_setup',
          labelTr: 'Film / Müzik / Eğlence',
          labelEn: 'Movies / Music / Entertainment',
          emoji: '🎧',
          coverCategory: 'headphones',
        ),
        _QuizOption(
          value: 'price_tracking',
          labelTr: 'En İyi Fiyatı Yakalamak',
          labelEn: 'Price Tracking',
          emoji: '📉',
          coverCategory: 'powerbanks',
        ),
        _QuizOption(
          value: 'all',
          labelTr: 'Karışık Kullanım',
          labelEn: 'Mixed Usage',
          emoji: '🎯',
          coverCategory: 'monitors',
        ),
      ],
    ),
    _QuizStep(
      field: 'ageRange',
      title: _t(
        'Kendine en yakın yaş aralığını seç',
        'Pick the age range closest to you',
      ),
      subtitle: _t(
        'Öneri tonu ve keşif hızı buna göre ayarlanır.',
        'This helps tune exploration pace and recommendation tone.',
      ),
      algorithmHint: _t(
        'Yas araligi, yeni urunlere egilim ve aciklama derinligini etkiler.',
        'Age range influences recency preference and explanation depth.',
      ),
      type: _StepType.single,
      isRequired: true,
      options: const [
        _QuizOption(
          value: '13-17',
          labelTr: '13-17',
          labelEn: '13-17',
          emoji: '🎮',
          coverCategory: 'consoles',
        ),
        _QuizOption(
          value: '18-24',
          labelTr: '18-24',
          labelEn: '18-24',
          emoji: '📱',
          coverCategory: 'smartphones',
        ),
        _QuizOption(
          value: '25-34',
          labelTr: '25-34',
          labelEn: '25-34',
          emoji: '💻',
          coverCategory: 'laptops',
        ),
        _QuizOption(
          value: '35-44',
          labelTr: '35-44',
          labelEn: '35-44',
          emoji: '🏠',
          coverCategory: 'robot-vacuums',
        ),
        _QuizOption(
          value: '45-54',
          labelTr: '45-54',
          labelEn: '45-54',
          emoji: '📊',
          coverCategory: 'monitors',
        ),
        _QuizOption(
          value: '55+',
          labelTr: '55+',
          labelEn: '55+',
          emoji: '✨',
          coverCategory: 'e-readers',
        ),
      ],
    ),
    _QuizStep(
      field: 'profession',
      title: _t(
        'Sana en yakın profil hangisi?',
        'Which profile feels closest to you?',
      ),
      subtitle: _t(
        'Meslek bilgisi kategori önceliklerini daha akıllı hale getirir.',
        'Profession helps tune category priority more intelligently.',
      ),
      algorithmHint: _t(
        'Profil algoritması ilgi alanlarını ve kategori önceliklerini buna göre ince ayarlar.',
        'The profile algorithm fine-tunes category priority with this signal.',
      ),
      type: _StepType.single,
      isRequired: true,
      options: _buildProfessionOptions(),
    ),
    _QuizStep(
      field: 'subscriptions',
      title: _t(
        'Hangi servisler zaten hayatının içinde?',
        'Which services are already part of your stack?',
      ),
      subtitle: _t(
        'Kullandığın servisleri seç.',
        'Select the services you already use.',
      ),
      algorithmHint: _t(
        'Servis secimleri ekosistem yatkinligi ve abonelik yogunlugunu etkiler.',
        'Service choices influence ecosystem affinity and subscription density.',
      ),
      type: _StepType.multi,
      isRequired: true,
      options: _buildSubscriptionOptions(),
    ),
  ];

  static const Map<String, List<String>> _categoryLabels = {
    'smartphones': ['Akıllı Telefonlar', 'Smartphones'],
    'tablets': ['Tabletler', 'Tablets'],
    'laptops': ['Dizüstü Bilgisayarlar', 'Laptops'],
    'desktops': ['Masaüstü Bilgisayarlar', 'Desktops'],
    'cpus': ['İşlemciler', 'Processors'],
    'gpus': ['Ekran Kartları', 'Graphics Cards'],
    'ram': ['RAM', 'RAM'],
    'ssd': ['SSD ve Depolama', 'SSD & Storage'],
    'motherboards': ['Anakartlar', 'Motherboards'],
    'psu': ['Güç Kaynakları', 'Power Supplies'],
    'cases': ['Kasalar', 'PC Cases'],
    'coolers': ['Soğutucular', 'Coolers'],
    'monitors': ['Monitörler', 'Monitors'],
    'keyboards': ['Klavyeler', 'Keyboards'],
    'mice': ['Fareler', 'Mice'],
    'webcams': ['Web Kameraları', 'Webcams'],
    'printers': ['Yazıcılar', 'Printers'],
    'tvs': ['TV ve Ekranlar', 'TVs'],
    'projectors': ['Projektörler', 'Projectors'],
    'media-players': ['Medya Oynatıcılar', 'Media Players'],
    'headphones': ['Kulaklıklar', 'Headphones'],
    'speakers': ['Hoparlörler', 'Speakers'],
    'soundbars': ['Soundbarlar', 'Soundbars'],
    'microphones': ['Mikrofonlar', 'Microphones'],
    'smartwatches': ['Akıllı Saatler', 'Smartwatches'],
    'smart-rings': ['Akıllı Yüzükler', 'Smart Rings'],
    'cameras': ['Kameralar', 'Cameras'],
    'action-cameras': ['Aksiyon Kameraları', 'Action Cameras'],
    'security-cameras': ['Güvenlik Kameraları', 'Security Cameras'],
    'ip-cameras': ['IP Kameralar', 'IP Cameras'],
    'dashcams': ['Araç Kameraları', 'Dashcams'],
    'gimbals': ['Gimballer', 'Gimbals'],
    'tripods': ['Tripodlar', 'Tripods'],
    'lenses': ['Lensler', 'Lenses'],
    'consoles': ['Oyun Konsolları', 'Gaming Consoles'],
    'gamepads': ['Oyun Kolları', 'Gamepads'],
    'vr-headsets': ['VR Başlıklar', 'VR Headsets'],
    'routers': ['Router ve Modemler', 'Routers & Modems'],
    'robot-vacuums': ['Robot Süpürgeler', 'Robot Vacuums'],
    'powerbanks': ['Taşınabilir Şarj Cihazları', 'Power Banks'],
    'e-readers': ['E-Okuyucular', 'E-Readers'],
    'drones': ['Dronelar', 'Drones'],
  };

  List<_QuizOption> _buildCategoryOptions() {
    return _quizCategoryUniverse
        .map(
          (category) => _QuizOption(
            value: category,
            labelTr: _categoryLabels[category]![0],
            labelEn: _categoryLabels[category]![1],
            emoji: '✨',
            coverCategory: category,
          ),
        )
        .toList();
  }

  List<_QuizOption> _buildCurrentDeviceOptions() {
    return _deviceCategoryUniverse
        .map(
          (category) => _QuizOption(
            value: category,
            labelTr: _categoryLabels[category]![0],
            labelEn: _categoryLabels[category]![1],
            emoji: '✨',
            coverCategory: category,
          ),
        )
        .toList();
  }

  List<_QuizOption> _buildEcosystemOptions() {
    return const [
      _QuizOption(
        value: 'apple',
        labelTr: 'Apple',
        labelEn: 'Apple',
        emoji: '🍎',
        detailTr: 'iPhone, Mac, iPad, Watch',
        detailEn: 'iPhone, Mac, iPad, Watch',
      ),
      _QuizOption(
        value: 'android',
        labelTr: 'Android',
        labelEn: 'Android',
        emoji: '🤖',
        detailTr: 'Telefon, tablet ve saat',
        detailEn: 'Phones, tablets, and watches',
      ),
      _QuizOption(
        value: 'windows',
        labelTr: 'Windows',
        labelEn: 'Windows',
        emoji: '🪟',
        detailTr: 'Laptop, masaüstü ve ofis',
        detailEn: 'Laptops, desktops, and office',
      ),
      _QuizOption(
        value: 'samsung',
        labelTr: 'Samsung',
        labelEn: 'Samsung',
        emoji: '✨',
        detailTr: 'Galaxy telefon, tablet ve saat',
        detailEn: 'Galaxy phones, tablets, and watches',
      ),
      _QuizOption(
        value: 'google',
        labelTr: 'Google',
        labelEn: 'Google',
        emoji: '🔍',
        detailTr: 'Pixel, Nest ve Google One',
        detailEn: 'Pixel, Nest, and Google One',
      ),
      _QuizOption(
        value: 'xiaomi',
        labelTr: 'Xiaomi',
        labelEn: 'Xiaomi',
        emoji: '🟧',
        detailTr: 'Telefon, tablet ve giyilebilir ürünler',
        detailEn: 'Phones, tablets, and wearables',
      ),
      _QuizOption(
        value: 'huawei',
        labelTr: 'Huawei',
        labelEn: 'Huawei',
        emoji: '🌺',
        detailTr: 'Telefon, tablet ve giyilebilir ürünler',
        detailEn: 'Phones, tablets, and wearables',
      ),
      _QuizOption(
        value: 'mixed',
        labelTr: 'Karışık',
        labelEn: 'Mixed',
        emoji: '🔄',
        detailTr: 'Çapraz platform kurulum',
        detailEn: 'Cross-platform setup',
      ),
    ];
  }

  List<_QuizOption> _buildProfessionOptions() {
    return const [
      _QuizOption(
        value: 'student',
        labelTr: 'Öğrenci',
        labelEn: 'Student',
        emoji: '🎓',
        coverCategory: 'laptops',
      ),
      _QuizOption(
        value: 'engineer',
        labelTr: 'Mühendis',
        labelEn: 'Engineer',
        emoji: '⚙️',
        coverCategory: 'monitors',
      ),
      _QuizOption(
        value: 'designer',
        labelTr: 'Tasarımcı',
        labelEn: 'Designer',
        emoji: '🎨',
        coverCategory: 'tablets',
      ),
      _QuizOption(
        value: 'developer',
        labelTr: 'Yazılımcı',
        labelEn: 'Developer',
        emoji: '👨‍💻',
        coverCategory: 'keyboards',
      ),
      _QuizOption(
        value: 'content_creator',
        labelTr: 'İçerik Üreticisi',
        labelEn: 'Content Creator',
        emoji: '🎥',
        coverCategory: 'cameras',
      ),
      _QuizOption(
        value: 'video_editor',
        labelTr: 'Video Editörü',
        labelEn: 'Video Editor',
        emoji: '🎞️',
        coverCategory: 'monitors',
      ),
      _QuizOption(
        value: 'photographer',
        labelTr: 'Fotoğrafçı',
        labelEn: 'Photographer',
        emoji: '📸',
        coverCategory: 'cameras',
      ),
      _QuizOption(
        value: 'gamer',
        labelTr: 'Oyuncu',
        labelEn: 'Gamer',
        emoji: '🎮',
        coverCategory: 'consoles',
      ),
      _QuizOption(
        value: 'manager',
        labelTr: 'Yönetici',
        labelEn: 'Manager',
        emoji: '💼',
        coverCategory: 'smartphones',
      ),
      _QuizOption(
        value: 'product_manager',
        labelTr: 'Ürün Yöneticisi',
        labelEn: 'Product Manager',
        emoji: '🧭',
        coverCategory: 'laptops',
      ),
      _QuizOption(
        value: 'entrepreneur',
        labelTr: 'Girişimci',
        labelEn: 'Entrepreneur',
        emoji: '🚀',
        coverCategory: 'laptops',
      ),
      _QuizOption(
        value: 'healthcare',
        labelTr: 'Sağlık Profesyoneli',
        labelEn: 'Healthcare Professional',
        emoji: '🏥',
        coverCategory: 'smartwatches',
      ),
      _QuizOption(
        value: 'educator',
        labelTr: 'Eğitmen',
        labelEn: 'Educator',
        emoji: '📚',
        coverCategory: 'projectors',
      ),
      _QuizOption(
        value: 'finance',
        labelTr: 'Finans',
        labelEn: 'Finance',
        emoji: '💹',
        coverCategory: 'monitors',
      ),
      _QuizOption(
        value: 'data_analyst',
        labelTr: 'Veri Analisti',
        labelEn: 'Data Analyst',
        emoji: '📊',
        coverCategory: 'monitors',
      ),
      _QuizOption(
        value: 'architect',
        labelTr: 'Mimar',
        labelEn: 'Architect',
        emoji: '📐',
        coverCategory: 'tablets',
      ),
      _QuizOption(
        value: 'sales_marketing',
        labelTr: 'Satış / Pazarlama',
        labelEn: 'Sales / Marketing',
        emoji: '📣',
        coverCategory: 'smartphones',
      ),
      _QuizOption(
        value: 'lawyer',
        labelTr: 'Hukuk',
        labelEn: 'Legal',
        emoji: '⚖️',
        coverCategory: 'laptops',
      ),
      _QuizOption(
        value: 'researcher',
        labelTr: 'Araştırmacı',
        labelEn: 'Researcher',
        emoji: '🔬',
        coverCategory: 'tablets',
      ),
      _QuizOption(
        value: 'other',
        labelTr: 'Diğer',
        labelEn: 'Other',
        emoji: '🌐',
        coverCategory: 'smartphones',
      ),
    ];
  }

  List<_QuizOption> _buildSubscriptionOptions() {
    _QuizOption service(
      String value,
      String label, {
      String? labelTr,
      String? labelEn,
      String emoji = '✨',
      String? logoDomain,
    }) {
      return _QuizOption(
        value: value,
        labelTr: labelTr ?? label,
        labelEn: labelEn ?? label,
        emoji: emoji,
        logoDomain: logoDomain,
        preferContain: true,
      );
    }

    return [
      service('spotify', 'Spotify', emoji: '🎵', logoDomain: 'spotify.com'),
      service(
        'apple_music',
        'Apple Music',
        emoji: '🎶',
        logoDomain: 'music.apple.com',
      ),
      service(
        'youtube_premium',
        'YouTube Premium',
        emoji: '▶️',
        logoDomain: 'youtube.com',
      ),
      service('netflix', 'Netflix', emoji: '🎬', logoDomain: 'netflix.com'),
      service(
        'disney_plus',
        'Disney+',
        emoji: '🏰',
        logoDomain: 'disneyplus.com',
      ),
      service('max', 'Max', emoji: '🎞️', logoDomain: 'max.com'),
      service(
        'prime_video',
        'Prime Video',
        emoji: '📺',
        logoDomain: 'primevideo.com',
      ),
      service(
        'apple_tv_plus',
        'Apple TV+',
        emoji: '📺',
        logoDomain: 'tv.apple.com',
      ),
      service(
        'paramount_plus',
        'Paramount+',
        emoji: '🎬',
        logoDomain: 'paramountplus.com',
      ),
      service('peacock', 'Peacock', emoji: '🦚', logoDomain: 'peacocktv.com'),
      service(
        'discovery_plus',
        'discovery+',
        labelEn: 'Discovery+',
        emoji: '🌍',
        logoDomain: 'discoveryplus.com',
      ),
      service('hulu', 'Hulu', emoji: '🎬', logoDomain: 'hulu.com'),
      service(
        'crunchyroll',
        'Crunchyroll',
        emoji: '🎬',
        logoDomain: 'crunchyroll.com',
      ),
      service('mubi', 'MUBI', emoji: '🎬', logoDomain: 'mubi.com'),
      service('espn_plus', 'ESPN+', emoji: '🏈', logoDomain: 'espn.com'),
      service('dazn', 'DAZN', emoji: '🥊', logoDomain: 'dazn.com'),
      service(
        'nba_league_pass',
        'NBA League Pass',
        emoji: '🏀',
        logoDomain: 'nba.com',
      ),
      service('nfl_plus', 'NFL+', emoji: '🏈', logoDomain: 'nfl.com'),
      service('twitch', 'Twitch', emoji: '🟣', logoDomain: 'twitch.tv'),
      service(
        'youtube_music',
        'YouTube Music',
        emoji: '🎵',
        logoDomain: 'youtube.com',
      ),
      service(
        'amazon_music',
        'Amazon Music',
        emoji: '🎵',
        logoDomain: 'amazon.com',
      ),
      service('tidal', 'Tidal', emoji: '🎵', logoDomain: 'tidal.com'),
      service('deezer', 'Deezer', emoji: '🎵', logoDomain: 'deezer.com'),
      service(
        'soundcloud_go',
        'SoundCloud Go',
        emoji: '🎵',
        logoDomain: 'soundcloud.com',
      ),
      service('audible', 'Audible', emoji: '🎧', logoDomain: 'audible.com'),
      service('icloud', 'iCloud+', emoji: '☁️', logoDomain: 'apple.com'),
      service(
        'google_one',
        'Google One',
        emoji: '☁️',
        logoDomain: 'one.google.com',
      ),
      service(
        'microsoft_365',
        'Microsoft 365',
        emoji: '🧠',
        logoDomain: 'microsoft.com',
      ),
      service(
        'google_workspace',
        'Google Workspace',
        emoji: '🗂️',
        logoDomain: 'workspace.google.com',
      ),
      service('dropbox', 'Dropbox', emoji: '☁️', logoDomain: 'dropbox.com'),
      service('onedrive', 'OneDrive', emoji: '☁️', logoDomain: 'microsoft.com'),
      service('box', 'Box', emoji: '📦', logoDomain: 'box.com'),
      service('mega', 'MEGA', emoji: '📦', logoDomain: 'mega.io'),
      service(
        'amazon_prime',
        'Amazon Prime',
        emoji: '📦',
        logoDomain: 'amazon.com',
      ),
      service(
        'prime_gaming',
        'Prime Gaming',
        emoji: '🎮',
        logoDomain: 'gaming.amazon.com',
      ),
      service(
        'kindle_unlimited',
        'Kindle Unlimited',
        emoji: '📚',
        logoDomain: 'amazon.com',
      ),
      service('game_pass', 'Game Pass', emoji: '🎮', logoDomain: 'xbox.com'),
      service(
        'ps_plus',
        'PS Plus',
        emoji: '🕹️',
        logoDomain: 'playstation.com',
      ),
      service(
        'switch_online',
        'Switch Online',
        emoji: '🎯',
        logoDomain: 'nintendo.com',
      ),
      service(
        'geforce_now',
        'GeForce NOW',
        emoji: '☁️',
        logoDomain: 'nvidia.com',
      ),
      service(
        'google_play_pass',
        'Google Play Pass',
        emoji: '🎮',
        logoDomain: 'play.google.com',
      ),
      service('adobe_cc', 'Adobe CC', emoji: '🅰️', logoDomain: 'adobe.com'),
      service('canva', 'Canva', emoji: '🎨', logoDomain: 'canva.com'),
      service('figma', 'Figma', emoji: '🎨', logoDomain: 'figma.com'),
      service('capcut', 'CapCut Pro', emoji: '🎬', logoDomain: 'capcut.com'),
      service(
        'picsart',
        'Picsart Gold',
        emoji: '🖼️',
        logoDomain: 'picsart.com',
      ),
      service('notion', 'Notion', emoji: '📝', logoDomain: 'notion.so'),
      service('notion_ai', 'Notion AI', emoji: '🧠', logoDomain: 'notion.so'),
      service('slack', 'Slack', emoji: '💬', logoDomain: 'slack.com'),
      service('zoom', 'Zoom', emoji: '🎥', logoDomain: 'zoom.us'),
      service(
        'discord_nitro',
        'Discord Nitro',
        emoji: '💬',
        logoDomain: 'discord.com',
      ),
      service(
        'telegram_premium',
        'Telegram Premium',
        emoji: '✈️',
        logoDomain: 'telegram.org',
      ),
      service('jira', 'Jira', emoji: '🧩', logoDomain: 'atlassian.com'),
      service('trello', 'Trello', emoji: '🗂️', logoDomain: 'trello.com'),
      service('asana', 'Asana', emoji: '✅', logoDomain: 'asana.com'),
      service('miro', 'Miro', emoji: '🧠', logoDomain: 'miro.com'),
      service('monday', 'Monday.com', emoji: '📋', logoDomain: 'monday.com'),
      service('linear', 'Linear', emoji: '📐', logoDomain: 'linear.app'),
      service('clickup', 'ClickUp', emoji: '📈', logoDomain: 'clickup.com'),
      service(
        'grammarly',
        'Grammarly',
        emoji: '✍️',
        logoDomain: 'grammarly.com',
      ),
      service(
        'linkedin_premium',
        'LinkedIn Premium',
        emoji: '💼',
        logoDomain: 'linkedin.com',
      ),
      service(
        'linkedin_learning',
        'LinkedIn Learning',
        emoji: '🎓',
        logoDomain: 'linkedin.com',
      ),
      service('udemy', 'Udemy', emoji: '🎓', logoDomain: 'udemy.com'),
      service('coursera', 'Coursera', emoji: '🎓', logoDomain: 'coursera.org'),
      service('duolingo', 'Duolingo', emoji: '🎓', logoDomain: 'duolingo.com'),
      service(
        'skillshare',
        'Skillshare',
        emoji: '🎓',
        logoDomain: 'skillshare.com',
      ),
      service(
        'masterclass',
        'MasterClass',
        emoji: '🎓',
        logoDomain: 'masterclass.com',
      ),
      service('babbel', 'Babbel', emoji: '🎓', logoDomain: 'babbel.com'),
      service(
        'pluralsight',
        'Pluralsight',
        emoji: '🎓',
        logoDomain: 'pluralsight.com',
      ),
      service(
        'brilliant',
        'Brilliant',
        emoji: '🎓',
        logoDomain: 'brilliant.org',
      ),
      service(
        'chatgpt_plus',
        'ChatGPT Plus',
        emoji: '✳️',
        logoDomain: 'openai.com',
      ),
      service('claude', 'Claude Pro', emoji: '🤖', logoDomain: 'anthropic.com'),
      service(
        'google_ai_premium',
        'Google AI Premium',
        emoji: '🤖',
        logoDomain: 'one.google.com',
      ),
      service(
        'perplexity',
        'Perplexity Pro',
        emoji: '🤖',
        logoDomain: 'perplexity.ai',
      ),
      service('deepseek', 'DeepSeek', emoji: '🤖', logoDomain: 'deepseek.com'),
      service(
        'github_copilot',
        'GitHub Copilot',
        emoji: '🤖',
        logoDomain: 'github.com',
      ),
      service('cursor', 'Cursor Pro', emoji: '🤖', logoDomain: 'cursor.com'),
      service(
        'openrouter',
        'OpenRouter',
        emoji: '🤖',
        logoDomain: 'openrouter.ai',
      ),
      service(
        'midjourney',
        'Midjourney',
        emoji: '🤖',
        logoDomain: 'midjourney.com',
      ),
      service('runway', 'Runway', emoji: '🤖', logoDomain: 'runwayml.com'),
      service('suno', 'Suno', emoji: '🤖', logoDomain: 'suno.com'),
      service(
        'elevenlabs',
        'ElevenLabs',
        emoji: '🤖',
        logoDomain: 'elevenlabs.io',
      ),
      service('nordvpn', 'NordVPN', emoji: '🔐', logoDomain: 'nordvpn.com'),
      service(
        'expressvpn',
        'ExpressVPN',
        emoji: '🔐',
        logoDomain: 'expressvpn.com',
      ),
      service(
        'surfshark',
        'Surfshark',
        emoji: '🔐',
        logoDomain: 'surfshark.com',
      ),
      service('proton', 'Proton', emoji: '🔐', logoDomain: 'proton.me'),
      service(
        'bitwarden',
        'Bitwarden',
        emoji: '🔐',
        logoDomain: 'bitwarden.com',
      ),
      service(
        '1password',
        '1Password',
        emoji: '🔐',
        logoDomain: '1password.com',
      ),
      service('x_premium', 'X Premium', emoji: '💬', logoDomain: 'x.com'),
      service(
        'reddit_premium',
        'Reddit Premium',
        emoji: '💬',
        logoDomain: 'reddit.com',
      ),
      service(
        'snapchat_plus',
        'Snapchat+',
        emoji: '👻',
        logoDomain: 'snapchat.com',
      ),
      service(
        'meta_verified',
        'Meta Verified',
        emoji: '✔️',
        logoDomain: 'meta.com',
      ),
      service('strava', 'Strava', emoji: '🏃', logoDomain: 'strava.com'),
      service(
        'fitbit_premium',
        'Fitbit Premium',
        emoji: '⌚',
        logoDomain: 'fitbit.com',
      ),
      service('calm', 'Calm', emoji: '🧘', logoDomain: 'calm.com'),
      service(
        'headspace',
        'Headspace',
        emoji: '🧘',
        logoDomain: 'headspace.com',
      ),
      service(
        'myfitnesspal',
        'MyFitnessPal',
        emoji: '💪',
        logoDomain: 'myfitnesspal.com',
      ),
      service('apple_one', 'Apple One', emoji: '🍎', logoDomain: 'apple.com'),
      service(
        'apple_arcade',
        'Apple Arcade',
        emoji: '🎮',
        logoDomain: 'apple.com',
      ),
      service(
        'apple_fitness',
        'Apple Fitness+',
        emoji: '💪',
        logoDomain: 'apple.com',
      ),
      service(
        'google_cloud',
        'Google Cloud',
        emoji: '☁️',
        logoDomain: 'cloud.google.com',
      ),
      service('aws', 'AWS', emoji: '☁️', logoDomain: 'aws.amazon.com'),
      service('azure', 'Azure', emoji: '☁️', logoDomain: 'azure.microsoft.com'),
      service(
        'cloudflare',
        'Cloudflare',
        emoji: '☁️',
        logoDomain: 'cloudflare.com',
      ),
      service('vercel', 'Vercel', emoji: '▲', logoDomain: 'vercel.com'),
      const _QuizOption(
        value: 'none',
        labelTr: 'Hiçbiri',
        labelEn: 'None',
        emoji: '➖',
      ),
    ];
  }

  static const Map<String, List<Color>> _accentMap = {
    'smartphones': [Color(0xFF37C7FF), Color(0xFF2563EB)],
    'laptops': [Color(0xFF22C55E), Color(0xFF14B8A6)],
    'tablets': [Color(0xFF8B5CF6), Color(0xFF6366F1)],
    'tvs': [Color(0xFFFB7185), Color(0xFFF97316)],
    'monitors': [Color(0xFF0EA5E9), Color(0xFF38BDF8)],
    'cpus': [Color(0xFFF97316), Color(0xFFFB923C)],
    'gpus': [Color(0xFFA855F7), Color(0xFFEC4899)],
    'headphones': [Color(0xFFF43F5E), Color(0xFFFB7185)],
    'smartwatches': [Color(0xFF14B8A6), Color(0xFF22C55E)],
    'cameras': [Color(0xFFF59E0B), Color(0xFFFBBF24)],
    'consoles': [Color(0xFF6366F1), Color(0xFF8B5CF6)],
    'speakers': [Color(0xFFEF4444), Color(0xFFF97316)],
    'desktops': [Color(0xFF94A3B8), Color(0xFF64748B)],
    'routers': [Color(0xFF10B981), Color(0xFF14B8A6)],
    'drones': [Color(0xFF06B6D4), Color(0xFF0EA5E9)],
    'robot-vacuums': [Color(0xFF06B6D4), Color(0xFF22C55E)],
    'apple': [Color(0xFF60A5FA), Color(0xFF93C5FD)],
    'android': [Color(0xFF4ADE80), Color(0xFF22C55E)],
    'mixed': [Color(0xFFC084FC), Color(0xFF818CF8)],
    'low': [Color(0xFFFBBF24), Color(0xFFF59E0B)],
    'mid': [Color(0xFF22D3EE), Color(0xFF0EA5E9)],
    'high': [Color(0xFFF472B6), Color(0xFFE879F9)],
    'any': [Color(0xFF38BDF8), Color(0xFF22D3EE)],
  };

  static const Map<String, String> _logoSvgUrlByValue = {
    'apple': 'assets/icons/quiz_logos/apple.svg',
    'android': 'assets/icons/quiz_logos/android.svg',
    'windows': 'assets/icons/quiz_logos/windows.png',
    'samsung': 'assets/icons/quiz_logos/samsung.svg',
    'google': 'assets/icons/quiz_logos/google.svg',
    'huawei': 'assets/icons/quiz_logos/huawei.svg',
    'xiaomi': 'assets/icons/quiz_logos/xiaomi.svg',
    'spotify': 'assets/icons/quiz_logos/spotify.svg',
    'apple_music': 'assets/icons/quiz_logos/apple_music.svg',
    'youtube_premium': 'assets/icons/quiz_logos/youtube_premium.svg',
    'netflix': 'assets/icons/quiz_logos/netflix.svg',
    'disney_plus': 'assets/icons/quiz_logos/disney_plus.png',
    'max': 'assets/icons/quiz_logos/max.svg',
    'prime_video': 'assets/icons/quiz_logos/prime_video.png',
    'apple_tv_plus': 'assets/icons/quiz_logos/apple_tv_plus.svg',
    'paramount_plus': 'assets/icons/quiz_logos/paramount_plus.svg',
    'peacock': 'assets/icons/quiz_logos/peacock.png',
    'discovery_plus': 'assets/icons/quiz_logos/discovery_plus.png',
    'espn_plus': 'assets/icons/quiz_logos/espn_plus.png',
    'dazn': 'assets/icons/quiz_logos/dazn.svg',
    'nba_league_pass': 'assets/icons/quiz_logos/nba_league_pass.svg',
    'nfl_plus': 'assets/icons/quiz_logos/nfl_plus.png',
    'icloud': 'assets/icons/quiz_logos/icloud.svg',
    'google_one': 'assets/icons/quiz_logos/google_one.png',
    'microsoft_365': 'assets/icons/quiz_logos/microsoft_365.png',
    'google_workspace': 'assets/icons/quiz_logos/google.svg',
    'adobe_cc': 'assets/icons/quiz_logos/adobe_cc.png',
    'figma': 'assets/icons/quiz_logos/figma.svg',
    'notion': 'assets/icons/quiz_logos/notion.svg',
    'notion_ai': 'assets/icons/quiz_logos/notion.svg',
    'chatgpt_plus': 'assets/icons/quiz_logos/chatgpt_plus.png',
    'github_copilot': 'assets/icons/quiz_logos/github_copilot.svg',
    'game_pass': 'assets/icons/quiz_logos/game_pass.png',
    'ps_plus': 'assets/icons/quiz_logos/ps_plus.svg',
    'switch_online': 'assets/icons/quiz_logos/switch_online.png',
    'geforce_now': 'assets/icons/quiz_logos/geforce_now.svg',
    'google_play_pass': 'assets/icons/quiz_logos/google.svg',
    'twitch': 'assets/icons/quiz_logos/twitch.svg',
    'youtube_music': 'assets/icons/quiz_logos/youtube_music.svg',
    'amazon_music': 'assets/icons/quiz_logos/amazon_music.png',
    'tidal': 'assets/icons/quiz_logos/tidal.svg',
    'deezer': 'assets/icons/quiz_logos/deezer.svg',
    'soundcloud_go': 'assets/icons/quiz_logos/soundcloud_go.svg',
    'audible': 'assets/icons/quiz_logos/audible.svg',
    'hulu': 'assets/icons/quiz_logos/hulu.png',
    'crunchyroll': 'assets/icons/quiz_logos/crunchyroll.svg',
    'mubi': 'assets/icons/quiz_logos/mubi.svg',
    'dropbox': 'assets/icons/quiz_logos/dropbox.svg',
    'onedrive': 'assets/icons/quiz_logos/onedrive.png',
    'box': 'assets/icons/quiz_logos/box.svg',
    'mega': 'assets/icons/quiz_logos/mega.svg',
    'amazon_prime': 'assets/icons/quiz_logos/amazon.png',
    'prime_gaming': 'assets/icons/quiz_logos/amazon.png',
    'kindle_unlimited': 'assets/icons/quiz_logos/amazon.png',
    'canva': 'assets/icons/quiz_logos/canva.png',
    'capcut': 'assets/icons/quiz_logos/capcut.png',
    'picsart': 'assets/icons/quiz_logos/picsart.svg',
    'slack': 'assets/icons/quiz_logos/slack.png',
    'zoom': 'assets/icons/quiz_logos/zoom.svg',
    'discord_nitro': 'assets/icons/quiz_logos/discord_nitro.svg',
    'telegram_premium': 'assets/icons/quiz_logos/telegram_premium.svg',
    'jira': 'assets/icons/quiz_logos/jira.svg',
    'trello': 'assets/icons/quiz_logos/trello.svg',
    'asana': 'assets/icons/quiz_logos/asana.svg',
    'miro': 'assets/icons/quiz_logos/miro.svg',
    'monday': 'assets/icons/quiz_logos/monday.png',
    'linear': 'assets/icons/quiz_logos/linear.svg',
    'clickup': 'assets/icons/quiz_logos/clickup.svg',
    'grammarly': 'assets/icons/quiz_logos/grammarly.svg',
    'linkedin_premium': 'assets/icons/quiz_logos/linkedin_premium.png',
    'linkedin_learning': 'assets/icons/quiz_logos/linkedin_premium.png',
    'udemy': 'assets/icons/quiz_logos/udemy.svg',
    'coursera': 'assets/icons/quiz_logos/coursera.svg',
    'duolingo': 'assets/icons/quiz_logos/duolingo.svg',
    'skillshare': 'assets/icons/quiz_logos/skillshare.svg',
    'masterclass': 'assets/icons/quiz_logos/masterclass.png',
    'babbel': 'assets/icons/quiz_logos/babbel.png',
    'pluralsight': 'assets/icons/quiz_logos/pluralsight.svg',
    'brilliant': 'assets/icons/quiz_logos/brilliant.png',
    'claude': 'assets/icons/quiz_logos/claude.svg',
    'gemini': 'assets/icons/quiz_logos/gemini.svg',
    'perplexity': 'assets/icons/quiz_logos/perplexity.svg',
    'deepseek': 'assets/icons/quiz_logos/deepseek.png',
    'cursor': 'assets/icons/quiz_logos/cursor.svg',
    'openrouter': 'assets/icons/quiz_logos/openrouter.svg',
    'midjourney': 'assets/icons/quiz_logos/midjourney.png',
    'runway': 'assets/icons/quiz_logos/runway.png',
    'suno': 'assets/icons/quiz_logos/suno.svg',
    'elevenlabs': 'assets/icons/quiz_logos/elevenlabs.svg',
    'nordvpn': 'assets/icons/quiz_logos/nordvpn.svg',
    'expressvpn': 'assets/icons/quiz_logos/expressvpn.svg',
    'surfshark': 'assets/icons/quiz_logos/surfshark.svg',
    'proton': 'assets/icons/quiz_logos/proton.svg',
    'bitwarden': 'assets/icons/quiz_logos/bitwarden.svg',
    '1password': 'assets/icons/quiz_logos/1password.svg',
    'x_premium': 'assets/icons/quiz_logos/x_premium.svg',
    'reddit_premium': 'assets/icons/quiz_logos/reddit_premium.svg',
    'snapchat_plus': 'assets/icons/quiz_logos/snapchat_plus.svg',
    'meta_verified': 'assets/icons/quiz_logos/meta_verified.svg',
    'strava': 'assets/icons/quiz_logos/strava.svg',
    'fitbit_premium': 'assets/icons/quiz_logos/fitbit.svg',
    'calm': 'assets/icons/quiz_logos/calm.png',
    'headspace': 'assets/icons/quiz_logos/headspace.svg',
    'myfitnesspal': 'assets/icons/quiz_logos/myfitnesspal.png',
    'apple_one': 'assets/icons/quiz_logos/apple.svg',
    'apple_arcade': 'assets/icons/quiz_logos/apple.svg',
    'apple_fitness': 'assets/icons/quiz_logos/apple.svg',
    'google_cloud': 'assets/icons/quiz_logos/google_cloud.svg',
    'aws': 'assets/icons/quiz_logos/aws.png',
    'azure': 'assets/icons/quiz_logos/azure.png',
    'cloudflare': 'assets/icons/quiz_logos/cloudflare.svg',
    'vercel': 'assets/icons/quiz_logos/vercel.svg',
  };

  static const Map<String, IconData> _optionIcons = {
    'smartphones': Icons.smartphone_rounded,
    'tablets': Icons.tablet_mac_rounded,
    'laptops': Icons.laptop_mac_rounded,
    'desktops': Icons.desktop_windows_rounded,
    'cpus': Icons.memory_rounded,
    'gpus': Icons.videogame_asset_rounded,
    'ram': Icons.developer_board_rounded,
    'ssd': Icons.sd_storage_rounded,
    'motherboards': Icons.developer_board_rounded,
    'psu': Icons.electrical_services_rounded,
    'cases': Icons.inventory_2_rounded,
    'coolers': Icons.ac_unit_rounded,
    'monitors': Icons.monitor_rounded,
    'keyboards': Icons.keyboard_rounded,
    'mice': Icons.mouse_rounded,
    'webcams': Icons.videocam_rounded,
    'printers': Icons.print_rounded,
    'tvs': Icons.tv_rounded,
    'projectors': Icons.video_settings_rounded,
    'media-players': Icons.play_circle_fill_rounded,
    'headphones': Icons.headphones_rounded,
    'speakers': Icons.speaker_rounded,
    'soundbars': Icons.surround_sound_rounded,
    'microphones': Icons.mic_rounded,
    'smartwatches': Icons.watch_rounded,
    'smart-rings': Icons.radio_button_checked_rounded,
    'cameras': Icons.camera_alt_rounded,
    'action-cameras': Icons.sports_score_rounded,
    'security-cameras': Icons.shield_rounded,
    'ip-cameras': Icons.wifi_tethering_rounded,
    'dashcams': Icons.directions_car_filled_rounded,
    'gimbals': Icons.threed_rotation_rounded,
    'tripods': Icons.trip_origin_rounded,
    'lenses': Icons.camera_roll_rounded,
    'consoles': Icons.sports_esports_rounded,
    'gamepads': Icons.gamepad_rounded,
    'vr-headsets': Icons.view_in_ar_rounded,
    'routers': Icons.router_rounded,
    'robot-vacuums': Icons.cleaning_services_rounded,
    'powerbanks': Icons.battery_charging_full_rounded,
    'e-readers': Icons.menu_book_rounded,
    'drones': Icons.air_rounded,
    'low': Icons.wallet_rounded,
    'mid': Icons.balance_rounded,
    'high': Icons.auto_graph_rounded,
    'premium': Icons.workspace_premium_rounded,
    'any': Icons.tune_rounded,
    'mixed': Icons.hub_rounded,
    'apple': Icons.apple_rounded,
    'android': Icons.android_rounded,
    'windows': Icons.window_rounded,
    'samsung': Icons.phone_android_rounded,
    'google': Icons.travel_explore_rounded,
    'xiaomi': Icons.phone_android_rounded,
    'huawei': Icons.phone_android_rounded,
    'iphone': Icons.phone_iphone_rounded,
    'galaxy_phone': Icons.phone_android_rounded,
    'android_phone': Icons.phone_android_rounded,
    'ipad': Icons.tablet_mac_rounded,
    'android_tablet': Icons.tablet_android_rounded,
    'macbook': Icons.laptop_mac_rounded,
    'mac_desktop': Icons.desktop_mac_rounded,
    'windows_laptop': Icons.laptop_windows_rounded,
    'windows_pc': Icons.desktop_windows_rounded,
    'gaming_pc': Icons.computer_rounded,
    'chromebook': Icons.laptop_chromebook_rounded,
    'linux_pc': Icons.computer_rounded,
    'apple_watch': Icons.watch_rounded,
    'galaxy_watch': Icons.watch_rounded,
    'smart_tv': Icons.tv_rounded,
    'console': Icons.sports_esports_rounded,
    'camera_kit': Icons.camera_alt_rounded,
    'smart_speaker': Icons.speaker_rounded,
    'router': Icons.router_rounded,
    'robot_vacuum': Icons.cleaning_services_rounded,
    'e_reader': Icons.menu_book_rounded,
    'drone': Icons.air_rounded,
    'video_editor': Icons.movie_rounded,
    'photographer': Icons.camera_alt_rounded,
    'product_manager': Icons.route_rounded,
    'data_analyst': Icons.analytics_rounded,
    'lawyer': Icons.balance_rounded,
    'researcher': Icons.biotech_rounded,
  };

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(userProfileProvider).valueOrNull;
    final covers =
        ref.watch(quizCategoryVisualsProvider).valueOrNull ??
        const <String, String>{};
    if (covers.isNotEmpty) {
      _scheduleCoverPrefetch(covers);
    }
    final steps = _steps;
    final step = steps[_currentPage];

    if (user != null && !_didPrefill) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          _prefill(user);
        }
      });
    }

    if (_showCompletion) {
      return _buildCompletionScreen(covers);
    }

    return Scaffold(
      backgroundColor: _pageBackground,
      body: Stack(
        children: [
          _buildBackground(),
          SafeArea(
            child: Column(
              children: [
                _buildHeader(step, steps.length),
                Expanded(
                  child: PageView.builder(
                    controller: _pageController,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: steps.length,
                    onPageChanged: (index) =>
                        setState(() => _currentPage = index),
                    itemBuilder: (context, index) {
                      final currentStep = steps[index];
                      return _buildStepPage(currentStep, covers);
                    },
                  ),
                ),
                _buildBottomBar(step),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _prefill(UserEntity user) {
    setState(() {
      _ageRange ??= user.ageRange;
      _ecosystem ??= user.ecosystem.isEmpty ? null : user.ecosystem;
      _budgetRange ??= user.budgetRange.isEmpty ? null : user.budgetRange;
      _usageIntent ??= user.usageIntent;
      _profession ??= user.profession;

      _interestCategories
        ..clear()
        ..addAll(_dedupe(user.interestCategories));
      _priorities
        ..clear()
        ..addAll(_dedupe(user.priorities));
      _currentDevices
        ..clear()
        ..addAll(_dedupe(user.currentDevices));
      _subscriptions
        ..clear()
        ..addAll(_dedupe(user.subscriptions));

      _didPrefill = true;
    });
  }

  List<String> _dedupe(List<String> values) {
    final list = <String>[];
    for (final value in values) {
      if (value.trim().isEmpty || list.contains(value)) continue;
      list.add(value);
    }
    return list;
  }

  void _scheduleCoverPrefetch(Map<String, String> covers) {
    final urls = covers.values.where((url) => url.trim().isNotEmpty).toSet();
    final pending = urls.where((url) => _prefetchedCoverUrls.add(url)).toList();
    if (pending.isEmpty) return;

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      for (final url in pending) {
        precacheImage(
          CachedNetworkImageProvider(url),
          context,
        ).then((_) {}, onError: (_, stackTrace) {});
      }
    });
  }

  Widget _buildBackground() {
    return Stack(
      children: [
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  _isDarkTheme
                      ? const Color(0xFF07101A)
                      : const Color(0xFFFCFDFF),
                  _isDarkTheme
                      ? AppTheme.brandBlue.withValues(alpha: 0.18)
                      : const Color(0xFFEAF1FF),
                  _isDarkTheme
                      ? const Color(0xFF07101A)
                      : const Color(0xFFF5F7FB),
                ],
              ),
            ),
          ),
        ),
        _orb(
          _isDarkTheme ? AppTheme.brandCyan : const Color(0xFFBFDBFE),
          const Alignment(-0.9, -0.8),
          180,
        ),
        _orb(
          _isDarkTheme ? AppTheme.brandBlue : const Color(0xFFC7D2FE),
          const Alignment(1.1, -0.2),
          220,
        ),
        _orb(
          _isDarkTheme ? const Color(0xFF8B5CF6) : const Color(0xFFE2E8F0),
          const Alignment(-1.0, 0.8),
          220,
        ),
      ],
    );
  }

  Widget _orb(Color color, Alignment alignment, double size) {
    return Align(
      alignment: alignment,
      child: ImageFiltered(
        imageFilter: ImageFilter.blur(sigmaX: 70, sigmaY: 70),
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: color.withValues(alpha: _isDarkTheme ? 0.18 : 0.16),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(_QuizStep step, int totalSteps) {
    final progress = (_currentPage + 1) / totalSteps;

    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 8),
      child: Column(
        children: [
          Row(
            children: [
              _HeaderButton(
                icon: _currentPage == 0
                    ? Icons.close_rounded
                    : Icons.arrow_back_ios_new_rounded,
                onTap: () {
                  if (_currentPage == 0) {
                    context.pop();
                    return;
                  }
                  _pageController.previousPage(
                    duration: AppConstants.pageTransitionDuration,
                    curve: Curves.easeOutCubic,
                  );
                },
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Qor AI',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: AppTheme.brandCyan,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      _t(
                        'Adım ${_currentPage + 1} / $totalSteps',
                        'Step ${_currentPage + 1} / $totalSteps',
                      ),
                      style: TextStyle(
                        fontSize: 12,
                        color: _secondaryTextColor,
                      ),
                    ),
                  ],
                ),
              ),
              if (!step.isRequired)
                TextButton(
                  onPressed: _goNext,
                  child: Text(
                    _t('Atla', 'Skip'),
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: _primaryTextColor,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 5,
              backgroundColor: _surfaceStrongColor,
              valueColor: const AlwaysStoppedAnimation<Color>(
                AppTheme.brandCyan,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStepPage(_QuizStep step, Map<String, String> covers) {
    return SingleChildScrollView(
      physics: const BouncingScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(22, 14, 22, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Text(
            step.title,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 30,
              fontWeight: FontWeight.w900,
              height: 1.05,
              color: _primaryTextColor,
            ),
          ),
          if (step.subtitle.trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              step.subtitle,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                height: 1.35,
                color: _secondaryTextColor,
              ),
            ),
          ],
          const SizedBox(height: 20),
          if (step.type == _StepType.categories)
            _buildCategoriesStep(step, covers)
          else if (step.displayStyle == _StepDisplay.list)
            _buildListStep(step, covers)
          else
            _buildGenericCircleStep(step, covers),
        ],
      ),
    );
  }

  Widget _buildCategoriesStep(_QuizStep step, Map<String, String> covers) {
    final selectedCount = _interestCategories.length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        _buildSelectedCounter(
          selectedCount,
          minimum: 3,
          text: _t('En az 3 kategori seç', 'Select at least 3 categories'),
        ),
        const SizedBox(height: 16),
        LayoutBuilder(
          builder: (context, constraints) {
            final itemWidth = (constraints.maxWidth - 24) / 3;
            return Wrap(
              alignment: WrapAlignment.center,
              spacing: 12,
              runSpacing: 18,
              children: step.options.map((option) {
                return SizedBox(
                  width: itemWidth,
                  child: _buildCircleChoice(
                    option: option,
                    selected: _interestCategories.contains(option.value),
                    onTap: () =>
                        _toggleMulti('interestCategories', option.value),
                    imageUrl: _resolveOptionImageUrl(step, option, covers),
                    size: itemWidth.clamp(92.0, 110.0),
                  ),
                );
              }).toList(),
            );
          },
        ),
      ],
    );
  }

  Widget _buildGenericCircleStep(_QuizStep step, Map<String, String> covers) {
    final selectedValues = _selectedValues(step.field);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        if (step.type == _StepType.multi && selectedValues.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: _buildSelectedCounter(
              selectedValues.length,
              text: _t('Seçili', 'Selected'),
            ),
          ),
        LayoutBuilder(
          builder: (context, constraints) {
            final itemWidth = (constraints.maxWidth - 24) / 3;
            final circleSize = itemWidth.clamp(92.0, 106.0);
            return Wrap(
              alignment: WrapAlignment.center,
              spacing: 12,
              runSpacing: 18,
              children: step.options.map((option) {
                final selected = selectedValues.contains(option.value);
                return SizedBox(
                  width: itemWidth,
                  child: _buildCircleChoice(
                    option: option,
                    selected: selected,
                    onTap: () {
                      if (step.type == _StepType.single) {
                        _selectSingle(step.field, option.value);
                      } else {
                        _toggleMulti(step.field, option.value);
                      }
                    },
                    imageUrl: _resolveOptionImageUrl(step, option, covers),
                    size: circleSize,
                  ),
                );
              }).toList(),
            );
          },
        ),
      ],
    );
  }

  Widget _buildListStep(_QuizStep step, Map<String, String> covers) {
    final selectedValues = _selectedValues(step.field);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        if (step.type == _StepType.multi && selectedValues.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: _buildSelectedCounter(
              selectedValues.length,
              text: _t('Seçili', 'Selected'),
            ),
          ),
        ...step.options.map((option) {
          final selected = selectedValues.contains(option.value);
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 640),
              child: _buildListChoice(
                option: option,
                selected: selected,
                onTap: () {
                  if (step.type == _StepType.single) {
                    _selectSingle(step.field, option.value);
                  } else {
                    _toggleMulti(step.field, option.value);
                  }
                },
                imageUrl: _resolveOptionImageUrl(step, option, covers),
              ),
            ),
          );
        }),
      ],
    );
  }

  Widget _buildSelectedCounter(
    int count, {
    int? minimum,
    required String text,
  }) {
    final meetsMinimum = minimum == null || count >= minimum;

    return Align(
      alignment: Alignment.center,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: _surfaceColor,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: meetsMinimum
                ? AppTheme.brandCyan.withValues(alpha: 0.32)
                : _borderColor,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              meetsMinimum ? Icons.check_circle_rounded : Icons.circle_outlined,
              size: 16,
              color: meetsMinimum ? AppTheme.brandCyan : _buttonDisabledFg,
            ),
            const SizedBox(width: 8),
            Text(
              minimum == null ? '$count $text' : '$count / $minimum · $text',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: _primaryTextColor,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCircleChoice({
    required _QuizOption option,
    required bool selected,
    required VoidCallback onTap,
    required double size,
    String? imageUrl,
    bool dimmed = false,
  }) {
    final colors =
        _accentMap[option.value] ??
        const [AppTheme.brandCyan, AppTheme.brandBlue];
    return GestureDetector(
      onTap: onTap,
      child: AnimatedScale(
        duration: const Duration(milliseconds: 180),
        scale: selected ? 1.06 : 1,
        child: SizedBox(
          width: size,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AnimatedContainer(
                duration: const Duration(milliseconds: 220),
                width: size,
                height: size,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: selected ? LinearGradient(colors: colors) : null,
                  color: selected ? null : _surfaceColor,
                  border: Border.all(
                    color: selected
                        ? (_isDarkTheme
                              ? Colors.white.withValues(alpha: 0.2)
                              : const Color(0xFF93C5FD))
                        : _borderColor,
                    width: selected ? 2 : 1,
                  ),
                  boxShadow: selected
                      ? [
                          BoxShadow(
                            color: colors.first.withValues(
                              alpha: _isDarkTheme ? 0.32 : 0.18,
                            ),
                            blurRadius: 22,
                            offset: const Offset(0, 10),
                          ),
                        ]
                      : [
                          if (!_isDarkTheme)
                            const BoxShadow(
                              color: Color(0x120F172A),
                              blurRadius: 18,
                              offset: Offset(0, 8),
                            ),
                        ],
                ),
                padding: EdgeInsets.all(dimmed ? 5 : 4),
                child: Stack(
                  children: [
                    Positioned.fill(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    Positioned.fill(
                      child: ClipOval(
                        child: Padding(
                          padding: EdgeInsets.all(dimmed ? 16 : 14),
                          child: _buildOptionArtwork(
                            option: option,
                            imageUrl: imageUrl,
                            circular: true,
                          ),
                        ),
                      ),
                    ),
                    if (selected)
                      Positioned(
                        top: 4,
                        right: 4,
                        child: Container(
                          width: 24,
                          height: 24,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            color: AppTheme.brandCyan,
                          ),
                          child: Icon(
                            Icons.check_rounded,
                            size: 16,
                            color: _selectionCheckColor,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              Text(
                option.label(_isTurkish),
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                  color: selected ? _primaryTextColor : _secondaryTextColor,
                  height: 1.2,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildListChoice({
    required _QuizOption option,
    required bool selected,
    required VoidCallback onTap,
    String? imageUrl,
  }) {
    final colors =
        _accentMap[option.value] ??
        const [AppTheme.brandCyan, AppTheme.brandBlue];
    final detail = option.detail(_isTurkish);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(24),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(24),
            gradient: selected
                ? LinearGradient(
                    colors: [
                      colors.first.withValues(alpha: 0.34),
                      colors.last.withValues(alpha: 0.2),
                    ],
                  )
                : null,
            color: selected ? null : _surfaceColor,
            border: Border.all(
              color: selected
                  ? colors.first.withValues(alpha: 0.9)
                  : _borderColor,
              width: selected ? 1.4 : 1,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 58,
                height: 58,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                ),
                padding: const EdgeInsets.all(11),
                child: _buildOptionArtwork(option: option, imageUrl: imageUrl),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      option.label(_isTurkish),
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: _primaryTextColor,
                      ),
                    ),
                    if (detail != null && detail.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        detail,
                        style: TextStyle(
                          fontSize: 12,
                          height: 1.25,
                          color: _secondaryTextColor,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 12),
              AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: selected ? AppTheme.brandCyan : _surfaceStrongColor,
                ),
                child: Icon(
                  selected ? Icons.check_rounded : Icons.add_rounded,
                  color: selected ? _selectionCheckColor : _buttonDisabledFg,
                  size: 17,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildOptionArtwork({
    required _QuizOption option,
    required String? imageUrl,
    bool circular = false,
  }) {
    final icon = _optionIcons[option.value];

    final lowerUrl = imageUrl?.toLowerCase();
    final isAsset = imageUrl != null && imageUrl.startsWith('assets/');
    final isSvg = lowerUrl != null && lowerUrl.endsWith('.svg');

    if (isAsset) {
      if (isSvg) {
        return SvgPicture.asset(
          imageUrl,
          fit: BoxFit.contain,
          placeholderBuilder: (context) =>
              _buildOptionFallback(option: option, icon: icon),
        );
      }

      return Image.asset(
        imageUrl,
        fit: BoxFit.contain,
        errorBuilder: (context, error, stackTrace) =>
            _buildOptionFallback(option: option, icon: icon),
      );
    }

    if (imageUrl != null && isSvg) {
      return SvgPicture.network(
        imageUrl,
        fit: BoxFit.contain,
        placeholderBuilder: (context) =>
            _buildOptionFallback(option: option, icon: icon),
      );
    }

    if (imageUrl != null) {
      return CachedNetworkImage(
        imageUrl: imageUrl,
        fit: BoxFit.contain,
        fadeInDuration: const Duration(milliseconds: 120),
        memCacheWidth: circular ? 320 : null,
        maxWidthDiskCache: circular ? 320 : null,
        placeholder: (context, url) =>
            _buildOptionFallback(option: option, icon: icon),
        errorWidget: (context, url, error) =>
            _buildOptionFallback(option: option, icon: icon),
      );
    }

    return _buildOptionFallback(option: option, icon: icon, circular: circular);
  }

  Widget _buildOptionFallback({
    required _QuizOption option,
    required IconData? icon,
    bool circular = false,
  }) {
    final radius = circular ? 999.0 : 14.0;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(radius),
      ),
      child: Center(
        child: icon != null
            ? Icon(icon, color: const Color(0xFF0C1622), size: 28)
            : Text(option.emoji, style: const TextStyle(fontSize: 24)),
      ),
    );
  }

  bool _stepUsesProductCovers(String field) =>
      field == 'interestCategories' || field == 'currentDevices';

  String? _resolveOptionImageUrl(
    _QuizStep step,
    _QuizOption option,
    Map<String, String> covers,
  ) {
    final logoAsset = _logoSvgUrlByValue[option.value];
    if (logoAsset != null) return logoAsset;
    if (!_stepUsesProductCovers(step.field)) return null;
    return covers[option.coverCategory ?? option.value];
  }

  Widget _buildBottomBar(_QuizStep step) {
    final canContinue = _canContinue(step);
    final isLast = _currentPage == _steps.length - 1;

    return Padding(
      padding: const EdgeInsets.fromLTRB(22, 6, 22, 20),
      child: Column(
        children: [
          if (step.isRequired && !canContinue)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(
                step.field == 'interestCategories'
                    ? _t(
                        'Devam etmek için en az 3 kategori seç.',
                        'Select at least 3 categories to continue.',
                      )
                    : _t(
                        'Devam etmek için bu adımı tamamla.',
                        'Complete this step to continue.',
                      ),
                style: TextStyle(fontSize: 12, color: _mutedTextColor),
              ),
            ),
          SizedBox(
            width: double.infinity,
            child: GestureDetector(
              onTap: _isSubmitting || !canContinue
                  ? null
                  : _goNext,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(vertical: 18),
                decoration: BoxDecoration(
                  gradient: canContinue ? AppTheme.primaryGradient : null,
                  color: canContinue ? null : _buttonDisabledBg,
                  borderRadius: BorderRadius.circular(22),
                  boxShadow: canContinue ? [
                    BoxShadow(
                      color: AppTheme.brandCyan.withValues(alpha: 0.35),
                      blurRadius: 16,
                      offset: const Offset(0, 6),
                    ),
                  ] : null,
                ),
                child: _isSubmitting
                    ? Center(child: SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      ))
                    : Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            isLast
                                ? _t('Profilimi oluştur', 'Create my profile')
                                : _t('Devam et', 'Continue'),
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: canContinue ? Colors.white : _buttonDisabledFg,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Icon(
                            isLast
                                ? Icons.auto_awesome_rounded
                                : Icons.arrow_forward_rounded,
                            size: 20,
                            color: canContinue ? Colors.white : _buttonDisabledFg,
                          ),
                        ],
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  bool _canContinue(_QuizStep step) {
    // All steps are now required — no step can be skipped.
    switch (step.field) {
      case 'interestCategories':
        return _interestCategories.length >= 3;
      case 'ecosystem':
        return _ecosystem != null;
      case 'budgetRange':
        return _budgetRange != null;
      case 'ageRange':
        return _ageRange != null;
      // Multi-select steps: at least 1 item must be chosen.
      case 'priorities':
        return _priorities.isNotEmpty;
      case 'currentDevices':
        return _currentDevices.isNotEmpty;
      case 'subscriptions':
        return _subscriptions.isNotEmpty;
      case 'usageIntent':
        return _usageIntent != null;
      case 'profession':
        return _profession != null;
      default:
        return true;
    }
  }

  List<String> _selectedValues(String field) {
    switch (field) {
      case 'interestCategories':
        return _interestCategories;
      case 'priorities':
        return _priorities;
      case 'currentDevices':
        return _currentDevices;
      case 'subscriptions':
        return _subscriptions;
      case 'ecosystem':
        return _ecosystem == null ? const [] : [_ecosystem!];
      case 'budgetRange':
        return _budgetRange == null ? const [] : [_budgetRange!];
      case 'usageIntent':
        return _usageIntent == null ? const [] : [_usageIntent!];
      case 'ageRange':
        return _ageRange == null ? const [] : [_ageRange!];
      case 'profession':
        return _profession == null ? const [] : [_profession!];
      default:
        return const [];
    }
  }

  void _selectSingle(String field, String value) {
    HapticFeedback.selectionClick();
    setState(() {
      switch (field) {
        case 'ecosystem':
          _ecosystem = value;
          break;
        case 'budgetRange':
          _budgetRange = value;
          break;
        case 'usageIntent':
          _usageIntent = value;
          break;
        case 'ageRange':
          _ageRange = value;
          break;
        case 'profession':
          _profession = value;
          break;
      }
    });
  }

  void _toggleMulti(String field, String value) {
    HapticFeedback.lightImpact();
    setState(() {
      late final List<String> target;
      switch (field) {
        case 'interestCategories':
          target = _interestCategories;
          break;
        case 'priorities':
          target = _priorities;
          break;
        case 'currentDevices':
          target = _currentDevices;
          break;
        case 'subscriptions':
          target = _subscriptions;
          if (value == 'none') {
            target
              ..clear()
              ..add('none');
            return;
          }
          target.remove('none');
          break;
        default:
          return;
      }

      if (target.contains(value)) {
        target.remove(value);
      } else {
        target.add(value);
      }
    });
  }

  void _goNext() {
    final step = _steps[_currentPage];
    if (!_canContinue(step)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            step.field == 'interestCategories'
                ? _t(
                    'En az 3 kategori seçmeden devam edemezsin.',
                    'Select at least 3 categories before continuing.',
                  )
                : _t(
                    'Bu adım tamamlanmadan devam edemezsin.',
                    'Complete this step before continuing.',
                  ),
          ),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    if (_currentPage == _steps.length - 1) {
      _submitQuiz();
      return;
    }

    _pageController.nextPage(
      duration: AppConstants.pageTransitionDuration,
      curve: Curves.easeOutCubic,
    );
  }

  Future<void> _submitQuiz() async {
    if (_ecosystem == null || _budgetRange == null || _ageRange == null) {
      return;
    }

    setState(() => _isSubmitting = true);

    final country = ref.read(selectedCountryProvider);
    final countryInfo = SupportedCountries.countries[country];
    final detectedCurrency = ref.read(currencyProvider);
    final userId = ref.read(authStateProvider).valueOrNull;

    if (userId == null) {
      if (mounted) context.go(AppRoutes.login);
      return;
    }

    final payload = <String, dynamic>{
      'ageRange': _ageRange,
      'ecosystem': _ecosystem,
      'budgetRange': _budgetRange,
      'priorities': _priorities,
      'currentDevices': _currentDevices,
      'subscriptions': _subscriptions.contains('none')
          ? <String>[]
          : _subscriptions,
      'country': country,
      'language': countryInfo?.language ?? (_isTurkish ? 'tr' : 'en'),
      'currency': countryInfo?.currency ?? detectedCurrency,
      'interestCategories': _interestCategories,
      'usageIntent': _usageIntent ?? 'all',
      'profession': _profession,
      'primaryCategory': _interestCategories.isNotEmpty
          ? _interestCategories.first
          : 'smartphones',
    };

    final result = await ref
        .read(authRepositoryProvider)
        .updateUserProfile(uid: userId, quizData: payload);

    if (!mounted) return;

    setState(() => _isSubmitting = false);

    switch (result) {
      case Success():
        ref.invalidate(userProfileProvider);
        ref.invalidate(homeFeedProvider);
        ref.invalidate(categoryCoversProvider);
        ref.invalidate(quizCategoryVisualsProvider);
        setState(() => _showCompletion = true);
        return;
      case Failure(error: final error):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(error.message),
            behavior: SnackBarBehavior.floating,
          ),
        );
        return;
    }
  }

  Widget _buildCompletionScreen(Map<String, String> covers) {
    final heroCategory = _resolveCompletionHeroCategory(covers);
    final heroImage = covers[heroCategory];
    final topCategories = _interestCategories
        .take(4)
        .map(_labelForCategory)
        .toList();
    final heroTags = <String>[
      if (_ecosystem != null) _labelForEcosystem(_ecosystem!),
      if (_budgetRange != null) _labelForBudget(_budgetRange!),
      if (_profession != null) _labelForProfession(_profession!),
      if (_usageIntent != null) _labelForUsageIntent(_usageIntent!),
    ];

    return Scaffold(
      backgroundColor: _pageBackground,
      body: Stack(
        children: [
          _buildBackground(),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(22, 18, 22, 24),
              child: Column(
                children: [
                  Expanded(
                    child: SingleChildScrollView(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _buildCompletionHeroCard(
                            heroCategory: heroCategory,
                            heroImage: heroImage,
                          ),
                          const SizedBox(height: 16),
                          if (heroTags.isNotEmpty)
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: heroTags
                                  .map((tag) => _summaryChip(label: tag))
                                  .toList(),
                            ),
                          if (heroTags.isNotEmpty) const SizedBox(height: 14),
                          if (topCategories.isNotEmpty)
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: topCategories
                                  .map(
                                    (category) => _summaryChip(
                                      label: category,
                                      secondary: true,
                                    ),
                                  )
                                  .toList(),
                            ),
                          if (topCategories.isNotEmpty)
                            const SizedBox(height: 14),
                          _completionCard(
                            title: _t('Keşif profili', 'Discovery profile'),
                            body: _buildDiscoverySummary(),
                            color: AppTheme.brandCyan,
                            icon: Icons.auto_awesome_rounded,
                          ),
                          const SizedBox(height: 12),
                          _completionCard(
                            title: _t('Mevcut kurulum', 'Current setup'),
                            body: _buildSetupSummary(),
                            color: AppTheme.neonPurple,
                            icon: Icons.devices_rounded,
                          ),
                          const SizedBox(height: 12),
                          _completionCard(
                            title: _t(
                              'Karar öncelikleri',
                              'Decision priorities',
                            ),
                            body: _buildDecisionSummary(),
                            color: AppTheme.green500,
                            icon: Icons.psychology_alt_rounded,
                          ),
                          const SizedBox(height: 12),
                          _completionCard(
                            title: _t('Kullanım profili', 'Usage profile'),
                            body: _buildWorkProfileSummary(),
                            color: const Color(0xFFF59E0B),
                            icon: Icons.work_rounded,
                          ),
                          const SizedBox(height: 12),
                          _completionCard(
                            title: _t('Servis yoğunluğu', 'Service density'),
                            body: _buildSubscriptionSummary(),
                            color: AppTheme.green500,
                            icon: Icons.hub_rounded,
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: AppTheme.brandCyan,
                        foregroundColor: _selectionCheckColor,
                        padding: const EdgeInsets.symmetric(vertical: 18),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(22),
                        ),
                      ),
                      onPressed: () => _navigateToHomeWithAnimation(),
                      child: Text(
                        _t('Keşfe başla', 'Start exploring'),
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _navigateToHomeWithAnimation() {
    Navigator.of(context).push(
      PageRouteBuilder<void>(
        opaque: true,
        transitionDuration: const Duration(milliseconds: 400),
        pageBuilder: (_, __, ___) => _HomePreparationScreen(
          isTurkish: _isTurkish,
          onDone: () {
            if (mounted) context.go(AppRoutes.home);
          },
        ),
        transitionsBuilder: (_, anim, __, child) =>
            FadeTransition(opacity: anim, child: child),
      ),
    );
  }

  Widget _buildCompletionHeroCard({
    required String heroCategory,
    required String? heroImage,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: _surfaceColor,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(
          color: AppTheme.brandCyan.withValues(
            alpha: _isDarkTheme ? 0.22 : 0.18,
          ),
        ),
        boxShadow: [
          if (!_isDarkTheme)
            const BoxShadow(
              color: Color(0x120F172A),
              blurRadius: 22,
              offset: Offset(0, 10),
            ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 50,
            height: 50,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: AppTheme.brandCyan,
            ),
            child: const Icon(
              Icons.check_rounded,
              color: Colors.black,
              size: 26,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _t('Profilin hazır', 'Your profile is ready'),
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.2,
                        color: AppTheme.brandCyan,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _buildProfileHeadline(heroCategory),
                      style: TextStyle(
                        fontSize: 26,
                        height: 1.1,
                        fontWeight: FontWeight.w900,
                        color: _primaryTextColor,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      _buildProfileSubheadline(),
                      style: TextStyle(
                        fontSize: 14,
                        height: 1.5,
                        color: _secondaryTextColor,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 14),
              _buildCompletionThumbnail(
                heroCategory: heroCategory,
                heroImage: heroImage,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildCompletionThumbnail({
    required String heroCategory,
    required String? heroImage,
  }) {
    return Container(
      width: 96,
      height: 96,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: _borderColor),
      ),
      clipBehavior: Clip.antiAlias,
      child: heroImage != null
          ? Padding(
              padding: const EdgeInsets.all(10),
              child: CachedNetworkImage(
                imageUrl: heroImage,
                fit: BoxFit.contain,
                errorWidget: (context, url, error) =>
                    _buildCompletionThumbnailFallback(heroCategory),
              ),
            )
          : _buildCompletionThumbnailFallback(heroCategory),
    );
  }

  Widget _buildCompletionThumbnailFallback(String heroCategory) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors:
              _accentMap[heroCategory] ??
              const [AppTheme.brandCyan, AppTheme.brandBlue],
        ),
      ),
      child: Center(
        child: Icon(
          _optionIcons[heroCategory] ?? Icons.auto_awesome_rounded,
          size: 36,
          color: Colors.white,
        ),
      ),
    );
  }

  String _resolveCompletionHeroCategory(Map<String, String> covers) {
    final scores = <String, double>{};

    void addScore(String? category, double score) {
      if (category == null || category.isEmpty) return;
      scores.update(category, (value) => value + score, ifAbsent: () => score);
    }

    for (var index = 0; index < _interestCategories.length; index++) {
      addScore(_interestCategories[index], 24 - (index * 3));
    }

    for (var index = 0; index < _currentDevices.length; index++) {
      addScore(_currentDevices[index], 12 - (index * 1.5));
    }

    for (var index = 0; index < _priorities.length; index++) {
      addScore(
        _optionForField('priorities', _priorities[index])?.coverCategory,
        10 - index.toDouble(),
      );
    }

    addScore(_optionForField('usageIntent', _usageIntent)?.coverCategory, 8);
    addScore(_optionForField('profession', _profession)?.coverCategory, 7);
    addScore(_optionForField('budgetRange', _budgetRange)?.coverCategory, 5);
    addScore(_optionForField('ageRange', _ageRange)?.coverCategory, 4);

    if (scores.isNotEmpty) {
      final sorted = scores.entries.toList()
        ..sort((a, b) => b.value.compareTo(a.value));
      for (final entry in sorted) {
        if (covers.containsKey(entry.key)) return entry.key;
      }
      return sorted.first.key;
    }

    return _interestCategories.isNotEmpty
        ? _interestCategories.first
        : 'smartphones';
  }

  Widget _summaryChip({required String label, bool secondary = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: secondary
            ? _surfaceColor
            : AppTheme.brandCyan.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: secondary
              ? _borderColor
              : AppTheme.brandCyan.withValues(alpha: 0.22),
        ),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: _primaryTextColor,
        ),
      ),
    );
  }

  Widget _completionCard({
    required String title,
    required String body,
    required Color color,
    required IconData icon,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: _surfaceColor,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, color: color),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: _primaryTextColor,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  body,
                  style: TextStyle(
                    fontSize: 13,
                    height: 1.45,
                    color: _secondaryTextColor,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _buildProfileHeadline(String heroCategory) {
    final leadingCategory = _labelForCategory(heroCategory);
    return _t(
      '$leadingCategory odaklı keşif',
      '$leadingCategory-focused discovery',
    );
  }

  String _buildProfileSubheadline() {
    final ecosystem = _ecosystem == null
        ? null
        : _labelForEcosystem(_ecosystem!);
    final budget = _budgetRange == null ? null : _labelForBudget(_budgetRange!);
    final fragments = <String>[
      ?ecosystem,
      ?budget,
      if (_priorities.isNotEmpty) _labelForPriority(_priorities.first),
    ];
    final descriptor = fragments.isEmpty
        ? _t('dengeli bir profil', 'a balanced profile')
        : fragments.join(' · ');
    return _t(
      'Qor AI artık $descriptor sinyallerini ana sayfada, AI açıklamalarında ve kategori sıralamalarında kullanacak.',
      'Qor AI will now use your $descriptor signals across home ranking, AI explanations, and category priorities.',
    );
  }

  String _buildDiscoverySummary() {
    final categories = _interestCategories
        .take(4)
        .map(_labelForCategory)
        .toList();
    if (categories.isEmpty) {
      return _t(
        'Keşif akışı, davranış verilerin geldikçe daha isabetli hale gelecek.',
        'Discovery will become more accurate as your behavior data builds up.',
      );
    }

    final priorities = _priorities.take(3).map(_labelForPriority).toList();
    final categoryText = categories.join(', ');
    if (priorities.isEmpty) {
      return _t(
        'Ana odak alanların: $categoryText. Ana sayfa bu kategorileri daha görünür gösterecek.',
        'Your primary focus areas are $categoryText. Home will surface these categories more prominently.',
      );
    }

    return _t(
      'Ana odak alanların: $categoryText. Karar önceliklerin: ${priorities.join(', ')}.',
      'Your primary focus areas are $categoryText. Decision priorities: ${priorities.join(', ')}.',
    );
  }

  String _buildSetupSummary() {
    final ecosystem = _ecosystem == null
        ? _t('Karışık kurulum', 'Mixed setup')
        : _labelForEcosystem(_ecosystem!);
    final devices = _currentDevices.take(4).map(_labelForOwnedDevice).toList();
    if (devices.isEmpty) {
      return _t(
        '$ecosystem sinyali temel alınacak. Cihaz bağlantıları, kullanım arttıkça daha netleşecek.',
        '$ecosystem will be the core signal. Device compatibility will sharpen as you use the app.',
      );
    }

    return _t(
      '$ecosystem kurulumu algılandı. Aktif cihazların: ${devices.join(', ')}.',
      '$ecosystem setup detected. Active devices: ${devices.join(', ')}.',
    );
  }

  String _buildDecisionSummary() {
    if (_priorities.isEmpty) {
      return _t(
        'AI ilk aşamada fiyat, kalite ve uyumu dengeli ağırlıklarla değerlendirecek.',
        'AI will begin with balanced weights across price, quality, and compatibility.',
      );
    }
    return _t(
      'AI açıklamaları önce ${_priorities.take(3).map(_labelForPriority).join(', ')} başlıklarına odaklanacak.',
      'AI explanations will prioritize ${_priorities.take(3).map(_labelForPriority).join(', ')}.',
    );
  }

  String _buildWorkProfileSummary() {
    final profession = _profession == null
        ? _t('Genel kullanıcı', 'General user')
        : _labelForProfession(_profession!);
    final usage = _usageIntent == null
        ? _t('dengeli kullanım', 'balanced usage')
        : _labelForUsageIntent(_usageIntent!);
    final age = _ageRange ?? '';
    if (age.isEmpty) {
      return _t(
        '$profession profili ve $usage modu aktif.',
        '$profession profile with $usage mode is active.',
      );
    }
    return _t(
      '$profession profili, $usage modu ve $age davranış bandı birlikte değerlendirilecek.',
      '$profession profile, $usage mode, and the $age behavior band will work together.',
    );
  }

  String _buildSubscriptionSummary() {
    final filtered = _subscriptions.where((item) => item != 'none').toList();
    if (filtered.isEmpty) {
      return _t(
        'Daha sade bir servis profili algılandı. Qor AI, yeni servis ve ekosistem önerilerine daha açık kalacak.',
        'A lighter service profile was detected. Qor AI will stay more open to new service and ecosystem suggestions.',
      );
    }

    final labels = filtered.take(4).map(_labelForSubscription).toList();
    final density = filtered.length >= 6
        ? _t('yuksek', 'high')
        : filtered.length >= 3
        ? _t('orta', 'medium')
        : _t('hafif', 'light');
    return _t(
      '$density servis yoğunluğu algılandı: ${labels.join(', ')}.',
      '$density service density detected: ${labels.join(', ')}.',
    );
  }

  _QuizOption? _optionForField(String field, String? value) {
    if (value == null || value.isEmpty) return null;
    final step = _steps.firstWhere(
      (item) => item.field == field,
      orElse: () => _QuizStep(
        field: field,
        title: '',
        subtitle: '',
        algorithmHint: '',
        type: _StepType.single,
        isRequired: true,
        options: const [],
      ),
    );
    for (final option in step.options) {
      if (option.value == value) return option;
    }
    return null;
  }

  String _labelForCategory(String value) {
    final option = _steps.first.options.firstWhere(
      (item) => item.value == value,
      orElse: () =>
          _QuizOption(value: value, labelTr: value, labelEn: value, emoji: '✨'),
    );
    return option.label(_isTurkish);
  }

  String _labelForPriority(String value) {
    final step = _steps.firstWhere((item) => item.field == 'priorities');
    final option = step.options.firstWhere(
      (item) => item.value == value,
      orElse: () =>
          _QuizOption(value: value, labelTr: value, labelEn: value, emoji: '✨'),
    );
    return option.label(_isTurkish);
  }

  String _labelForEcosystem(String value) {
    switch (value) {
      case 'apple':
        return _t('Apple odaklı', 'Apple-first');
      case 'android':
        return _t('Android odaklı', 'Android-first');
      case 'windows':
        return _t('Windows odaklı', 'Windows-first');
      case 'samsung':
        return _t('Samsung odaklı', 'Samsung-first');
      case 'google':
        return _t('Google odaklı', 'Google-first');
      case 'xiaomi':
        return _t('Xiaomi odaklı', 'Xiaomi-first');
      case 'huawei':
        return _t('Huawei odaklı', 'Huawei-first');
      case 'mixed':
        return _t('Karışık ekosistem', 'Mixed ecosystem');
      default:
        return value;
    }
  }

  String _labelForBudget(String value) {
    final step = _steps.firstWhere((item) => item.field == 'budgetRange');
    final option = step.options.firstWhere(
      (item) => item.value == value,
      orElse: () =>
          _QuizOption(value: value, labelTr: value, labelEn: value, emoji: '✨'),
    );
    return option.label(_isTurkish);
  }

  String _labelForProfession(String value) {
    final step = _steps.firstWhere((item) => item.field == 'profession');
    final option = step.options.firstWhere(
      (item) => item.value == value,
      orElse: () =>
          _QuizOption(value: value, labelTr: value, labelEn: value, emoji: '✨'),
    );
    return option.label(_isTurkish);
  }

  String _labelForUsageIntent(String value) {
    final step = _steps.firstWhere((item) => item.field == 'usageIntent');
    final option = step.options.firstWhere(
      (item) => item.value == value,
      orElse: () =>
          _QuizOption(value: value, labelTr: value, labelEn: value, emoji: '✨'),
    );
    return option.label(_isTurkish);
  }

  String _labelForOwnedDevice(String value) {
    final step = _steps.firstWhere((item) => item.field == 'currentDevices');
    final option = step.options.firstWhere(
      (item) => item.value == value,
      orElse: () =>
          _QuizOption(value: value, labelTr: value, labelEn: value, emoji: '✨'),
    );
    return option.label(_isTurkish);
  }

  String _labelForSubscription(String value) {
    final step = _steps.firstWhere((item) => item.field == 'subscriptions');
    final option = step.options.firstWhere(
      (item) => item.value == value,
      orElse: () =>
          _QuizOption(value: value, labelTr: value, labelEn: value, emoji: '✨'),
    );
    return option.label(_isTurkish);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }
}

enum _StepType { single, multi, categories }

enum _StepDisplay { circle, list }

class _QuizStep {
  final String field;
  final String title;
  final String subtitle;
  final String algorithmHint;
  final _StepType type;
  final _StepDisplay displayStyle;
  final bool isRequired;
  final List<_QuizOption> options;

  const _QuizStep({
    required this.field,
    required this.title,
    required this.subtitle,
    required this.algorithmHint,
    required this.type,
    this.displayStyle = _StepDisplay.circle,
    required this.isRequired,
    required this.options,
  });
}

class _QuizOption {
  final String value;
  final String labelTr;
  final String labelEn;
  final String emoji;
  final String? detailTr;
  final String? detailEn;
  final String? coverCategory;
  final String? logoDomain;
  final bool preferContain;

  const _QuizOption({
    required this.value,
    required this.labelTr,
    required this.labelEn,
    required this.emoji,
    this.detailTr,
    this.detailEn,
    this.coverCategory,
    this.logoDomain,
    this.preferContain = false,
  });

  String label(bool isTurkish) => isTurkish ? labelTr : labelEn;

  String? detail(bool isTurkish) => isTurkish ? detailTr : detailEn;
}

class _HeaderButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;

  const _HeaderButton({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Ink(
        width: 42,
        height: 42,
        decoration: BoxDecoration(
          color: isDark ? Colors.white.withValues(alpha: 0.06) : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isDark
                ? Colors.white.withValues(alpha: 0.06)
                : AppTheme.dividerLightMode,
          ),
        ),
        child: Icon(
          icon,
          color: isDark ? Colors.white : AppTheme.textPrimaryLightMode,
        ),
      ),
    );
  }
}

// ─── HOME PREPARATION ANIMATION SCREEN ───────────────────────────────────────

class _HomePreparationScreen extends StatefulWidget {
  final bool isTurkish;
  final VoidCallback onDone;

  const _HomePreparationScreen({
    required this.isTurkish,
    required this.onDone,
  });

  @override
  State<_HomePreparationScreen> createState() =>
      _HomePreparationScreenState();
}

class _HomePreparationScreenState extends State<_HomePreparationScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _progress;
  int _stepIndex = 0;

  static const _stepsEn = [
    'Analyzing your profile…',
    'Personalizing category rankings…',
    'Calibrating AI match scores…',
    'Preparing your discovery feed…',
    'Homepage is ready for you!',
  ];

  static const _stepsTr = [
    'Profilin analiz ediliyor…',
    'Kategori sıralamaları kişiselleştiriliyor…',
    'AI eşleşme skorları kalibre ediliyor…',
    'Keşif akışın hazırlanıyor…',
    'Ana sayfa kişisel kullanım için hazır!',
  ];

  List<String> get _steps => widget.isTurkish ? _stepsTr : _stepsEn;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2800),
    );
    _progress = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut),
    );
    _ctrl.addListener(() {
      final idx = (_ctrl.value * (_steps.length - 1)).floor()
          .clamp(0, _steps.length - 1);
      if (idx != _stepIndex && mounted) {
        setState(() => _stepIndex = idx);
      }
    });
    _ctrl.forward().whenComplete(() {
      if (mounted) {
        setState(() => _stepIndex = _steps.length - 1);
        Future.delayed(const Duration(milliseconds: 600), widget.onDone);
      }
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? const Color(0xFF0A0F1E) : const Color(0xFFF0F4FF);
    final textPrimary = isDark ? Colors.white : const Color(0xFF0F172A);
    final textSecondary =
        isDark ? Colors.white60 : const Color(0xFF475569);

    return Scaffold(
      backgroundColor: bg,
      body: Stack(
        children: [
          // Soft background glow
          Positioned.fill(
            child: CustomPaint(painter: _GlowPainter()),
          ),
          SafeArea(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Spacer(flex: 2),
                // Circular progress indicator with percentage
                AnimatedBuilder(
                  animation: _progress,
                  builder: (_, __) {
                    final percent = (_progress.value * 100).round();
                    return SizedBox(
                      width: 160,
                      height: 160,
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          SizedBox.expand(
                            child: CircularProgressIndicator(
                              value: _progress.value,
                              strokeWidth: 8,
                              backgroundColor: isDark
                                  ? Colors.white.withValues(alpha: 0.08)
                                  : Colors.black.withValues(alpha: 0.08),
                              valueColor: const AlwaysStoppedAnimation(
                                AppTheme.brandCyan,
                              ),
                              strokeCap: StrokeCap.round,
                            ),
                          ),
                          Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                '$percent%',
                                style: TextStyle(
                                  fontSize: 36,
                                  fontWeight: FontWeight.w900,
                                  color: AppTheme.brandCyan,
                                  height: 1,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    );
                  },
                ),
                const SizedBox(height: 40),
                // Animated step text
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 350),
                  transitionBuilder: (child, anim) => FadeTransition(
                    opacity: anim,
                    child: SlideTransition(
                      position: Tween<Offset>(
                        begin: const Offset(0, 0.15),
                        end: Offset.zero,
                      ).animate(anim),
                      child: child,
                    ),
                  ),
                  child: Padding(
                    key: ValueKey(_stepIndex),
                    padding: const EdgeInsets.symmetric(horizontal: 40),
                    child: Text(
                      _steps[_stepIndex],
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: textPrimary,
                        height: 1.4,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  widget.isTurkish
                      ? 'Ana sayfa kişisel kullanım için hazırlanıyor'
                      : 'Preparing homepage for personal use',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 13,
                    color: textSecondary,
                  ),
                ),
                const Spacer(flex: 3),
                // Qor AI brand mark
                Padding(
                  padding: const EdgeInsets.only(bottom: 24),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.compare_arrows_rounded,
                          size: 16, color: AppTheme.brandCyan),
                      const SizedBox(width: 6),
                      Text(
                        'Qor AI',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.brandCyan,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _GlowPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..shader = RadialGradient(
        center: const Alignment(0, -0.3),
        radius: 0.8,
        colors: [
          AppTheme.brandCyan.withValues(alpha: 0.10),
          Colors.transparent,
        ],
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height));
    canvas.drawRect(
      Rect.fromLTWH(0, 0, size.width, size.height),
      paint,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}
