library;

import 'dart:ui';

import 'package:compair/core/constants.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/domain/entities/user_entity.dart';
import 'package:compair/presentation/providers/providers.dart';
import 'package:compair/routing/router.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

final quizCategoryVisualsProvider = FutureProvider<Map<String, String>>((
  ref,
) async {
  return const <String, String>{};
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

  bool get _isTurkish => Localizations.localeOf(context).languageCode == 'tr';

  String _t(String tr, String en) => _isTurkish ? tr : en;

  List<_QuizStep> get _steps => [
    _QuizStep(
      field: 'interestCategories',
      title: _t(
        'En cok hangi urunleri kesfetmek istiyorsun?',
        'What do you want to discover most?',
      ),
      subtitle: _t('En az 3 kategori sec.', 'Pick at least 3 categories.'),
      algorithmHint: _t(
        'Ana sayfa algoritmasi, kategori onceligi ve AI yonlendirmesi bu secimi kullanir.',
        'Home ranking, category priority, and AI guidance use this signal.',
      ),
      type: _StepType.categories,
      isRequired: true,
      options: const [
        _QuizOption(
          value: 'smartphones',
          labelTr: 'Akilli Telefonlar',
          labelEn: 'Smartphones',
          emoji: '📱',
        ),
        _QuizOption(
          value: 'tablets',
          labelTr: 'Tabletler',
          labelEn: 'Tablets',
          emoji: '📟',
        ),
        _QuizOption(
          value: 'laptops',
          labelTr: 'Dizustu Bilgisayarlar',
          labelEn: 'Laptops',
          emoji: '💻',
        ),
        _QuizOption(
          value: 'desktops',
          labelTr: 'Masaustu Bilgisayarlar',
          labelEn: 'Desktops',
          emoji: '🖥️',
        ),
        _QuizOption(
          value: 'cpus',
          labelTr: 'Islemciler',
          labelEn: 'Processors',
          emoji: '⚡',
        ),
        _QuizOption(
          value: 'gpus',
          labelTr: 'Ekran Kartlari',
          labelEn: 'Graphics Cards',
          emoji: '🎮',
        ),
        _QuizOption(value: 'ram', labelTr: 'RAM', labelEn: 'RAM', emoji: '🧠'),
        _QuizOption(
          value: 'ssd',
          labelTr: 'SSD ve Depolama',
          labelEn: 'SSD & Storage',
          emoji: '💾',
        ),
        _QuizOption(
          value: 'motherboards',
          labelTr: 'Anakartlar',
          labelEn: 'Motherboards',
          emoji: '🧩',
        ),
        _QuizOption(
          value: 'psu',
          labelTr: 'Guc Kaynaklari',
          labelEn: 'Power Supplies',
          emoji: '🔌',
        ),
        _QuizOption(
          value: 'cases',
          labelTr: 'Kasalar',
          labelEn: 'PC Cases',
          emoji: '🗄️',
        ),
        _QuizOption(
          value: 'coolers',
          labelTr: 'Sogutucular',
          labelEn: 'Coolers',
          emoji: '🌀',
        ),
        _QuizOption(
          value: 'monitors',
          labelTr: 'Monitorler',
          labelEn: 'Monitors',
          emoji: '🖥️',
        ),
        _QuizOption(
          value: 'keyboards',
          labelTr: 'Klavyeler',
          labelEn: 'Keyboards',
          emoji: '⌨️',
        ),
        _QuizOption(
          value: 'mice',
          labelTr: 'Fareler',
          labelEn: 'Mice',
          emoji: '🖱️',
        ),
        _QuizOption(
          value: 'webcams',
          labelTr: 'Web Kameralar',
          labelEn: 'Webcams',
          emoji: '📹',
        ),
        _QuizOption(
          value: 'printers',
          labelTr: 'Yazicilar',
          labelEn: 'Printers',
          emoji: '🖨️',
        ),
        _QuizOption(
          value: 'tvs',
          labelTr: 'TV ve Ekranlar',
          labelEn: 'TVs',
          emoji: '📺',
        ),
        _QuizOption(
          value: 'projectors',
          labelTr: 'Projektorler',
          labelEn: 'Projectors',
          emoji: '📽️',
        ),
        _QuizOption(
          value: 'media-players',
          labelTr: 'Medya Oynaticilar',
          labelEn: 'Media Players',
          emoji: '▶️',
        ),
        _QuizOption(
          value: 'headphones',
          labelTr: 'Kulakliklar',
          labelEn: 'Headphones',
          emoji: '🎧',
        ),
        _QuizOption(
          value: 'speakers',
          labelTr: 'Hoparlorler',
          labelEn: 'Speakers',
          emoji: '🔊',
        ),
        _QuizOption(
          value: 'soundbars',
          labelTr: 'Soundbarlar',
          labelEn: 'Soundbars',
          emoji: '🎼',
        ),
        _QuizOption(
          value: 'microphones',
          labelTr: 'Mikrofonlar',
          labelEn: 'Microphones',
          emoji: '🎙️',
        ),
        _QuizOption(
          value: 'smartwatches',
          labelTr: 'Akilli Saatler',
          labelEn: 'Smartwatches',
          emoji: '⌚',
        ),
        _QuizOption(
          value: 'smart-rings',
          labelTr: 'Akilli Yuzukler',
          labelEn: 'Smart Rings',
          emoji: '💍',
        ),
        _QuizOption(
          value: 'cameras',
          labelTr: 'Kameralar',
          labelEn: 'Cameras',
          emoji: '📷',
        ),
        _QuizOption(
          value: 'action-cameras',
          labelTr: 'Aksiyon Kameralari',
          labelEn: 'Action Cameras',
          emoji: '🏄',
        ),
        _QuizOption(
          value: 'security-cameras',
          labelTr: 'Guvenlik Kameralari',
          labelEn: 'Security Cameras',
          emoji: '🛡️',
        ),
        _QuizOption(
          value: 'ip-cameras',
          labelTr: 'IP Kameralar',
          labelEn: 'IP Cameras',
          emoji: '🌐',
        ),
        _QuizOption(
          value: 'dashcams',
          labelTr: 'Arac Kameralari',
          labelEn: 'Dashcams',
          emoji: '🚗',
        ),
        _QuizOption(
          value: 'gimbals',
          labelTr: 'Gimballar',
          labelEn: 'Gimbals',
          emoji: '🎥',
        ),
        _QuizOption(
          value: 'tripods',
          labelTr: 'Tripodlar',
          labelEn: 'Tripods',
          emoji: '📸',
        ),
        _QuizOption(
          value: 'lenses',
          labelTr: 'Lensler',
          labelEn: 'Lenses',
          emoji: '🔍',
        ),
        _QuizOption(
          value: 'consoles',
          labelTr: 'Oyun Konsollari',
          labelEn: 'Gaming Consoles',
          emoji: '🕹️',
        ),
        _QuizOption(
          value: 'gamepads',
          labelTr: 'Oyun Kollari',
          labelEn: 'Gamepads',
          emoji: '🎮',
        ),
        _QuizOption(
          value: 'vr-headsets',
          labelTr: 'VR Basliklar',
          labelEn: 'VR Headsets',
          emoji: '🥽',
        ),
        _QuizOption(
          value: 'routers',
          labelTr: 'Router ve Modemler',
          labelEn: 'Routers & Modems',
          emoji: '📡',
        ),
        _QuizOption(
          value: 'robot-vacuums',
          labelTr: 'Robot Supurgeler',
          labelEn: 'Robot Vacuums',
          emoji: '🤖',
        ),
        _QuizOption(
          value: 'powerbanks',
          labelTr: 'Tasinabilir Sarj Cihazlari',
          labelEn: 'Power Banks',
          emoji: '🔋',
        ),
        _QuizOption(
          value: 'e-readers',
          labelTr: 'E-Okuyucular',
          labelEn: 'E-Readers',
          emoji: '📚',
        ),
        _QuizOption(
          value: 'drones',
          labelTr: 'Dronelar',
          labelEn: 'Drones',
          emoji: '🚁',
        ),
      ],
    ),
    _QuizStep(
      field: 'ecosystem',
      title: _t(
        'Hangi ekosistemi kullaniyorsun?',
        'Which ecosystem do you use?',
      ),
      subtitle: _t(
        'Kurulumuna en yakin ekosistemi sec.',
        'Choose the ecosystem closest to your setup.',
      ),
      algorithmHint: _t(
        'Ekosistem sinyali urun uyumlulugu ve butunlu deneyim icin kullanilir.',
        'Ecosystem affinity improves compatibility and continuity scoring.',
      ),
      type: _StepType.single,
      displayStyle: _StepDisplay.list,
      isRequired: true,
      options: const [
        _QuizOption(
          value: 'apple',
          labelTr: 'Apple',
          labelEn: 'Apple',
          emoji: '🍎',
          detailTr: 'iPhone, Mac, iPad',
          detailEn: 'iPhone, Mac, iPad',
          logoDomain: 'apple.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'android',
          labelTr: 'Android',
          labelEn: 'Android',
          emoji: '🤖',
          detailTr: 'Telefon, tablet, saat',
          detailEn: 'Phones, tablets, watches',
          logoDomain: 'android.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'windows',
          labelTr: 'Windows',
          labelEn: 'Windows',
          emoji: '🪟',
          detailTr: 'Laptop, masaustu, ofis',
          detailEn: 'Laptops, desktops, office',
          logoDomain: 'microsoft.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'samsung',
          labelTr: 'Samsung',
          labelEn: 'Samsung',
          emoji: '✨',
          detailTr: 'Telefon, tablet, saat',
          detailEn: 'Phones, tablets, watches',
          logoDomain: 'samsung.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'google',
          labelTr: 'Google',
          labelEn: 'Google',
          emoji: '🔍',
          detailTr: 'Pixel, Home, One',
          detailEn: 'Pixel, Home, One',
          logoDomain: 'google.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'mixed',
          labelTr: 'Karisik',
          labelEn: 'Mixed',
          emoji: '🔄',
          detailTr: 'Capraz platform',
          detailEn: 'Cross-platform',
        ),
      ],
    ),
    _QuizStep(
      field: 'budgetRange',
      title: _t('Butcen hangi bantta?', 'What budget band fits you?'),
      subtitle: _t('Butce seviyeni sec.', 'Choose your budget level.'),
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
        'Karsilastirmada senin icin en onemli sey ne?',
        'What matters most when you compare?',
      ),
      subtitle: _t(
        'Birden fazla secim yapabilirsin.',
        'You can choose more than one.',
      ),
      algorithmHint: _t(
        'Bu secimler AI aciklamalarini ve puan agirliklarini etkiler.',
        'These selections influence AI explanations and score weighting.',
      ),
      type: _StepType.multi,
      isRequired: false,
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
        'Su an hangi cihazlari aktif kullaniyorsun?',
        'Which devices do you actively use today?',
      ),
      subtitle: _t(
        'Uyumlu urunleri daha iyi filtrelemek icin kullanilir.',
        'Used to surface products that fit your existing setup.',
      ),
      algorithmHint: _t(
        'Mevcut cihazlar ekosistem puanini ve uyumluluk tahminlerini guclendirir.',
        'Current devices reinforce ecosystem affinity and compatibility scoring.',
      ),
      type: _StepType.multi,
      isRequired: false,
      options: const [
        _QuizOption(
          value: 'iphone',
          labelTr: 'iPhone',
          labelEn: 'iPhone',
          emoji: '📱',
          coverCategory: 'smartphones',
          logoDomain: 'apple.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'galaxy_phone',
          labelTr: 'Samsung Phone',
          labelEn: 'Samsung Phone',
          emoji: '📱',
          coverCategory: 'smartphones',
          logoDomain: 'samsung.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'android_phone',
          labelTr: 'Android Phone',
          labelEn: 'Android Phone',
          emoji: '📱',
          coverCategory: 'smartphones',
        ),
        _QuizOption(
          value: 'ipad',
          labelTr: 'iPad',
          labelEn: 'iPad',
          emoji: '📟',
          coverCategory: 'tablets',
        ),
        _QuizOption(
          value: 'android_tablet',
          labelTr: 'Android Tablet',
          labelEn: 'Android Tablet',
          emoji: '📟',
          coverCategory: 'tablets',
        ),
        _QuizOption(
          value: 'macbook',
          labelTr: 'MacBook',
          labelEn: 'MacBook',
          emoji: '💻',
          coverCategory: 'laptops',
          logoDomain: 'apple.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'mac_desktop',
          labelTr: 'iMac / Mac Studio',
          labelEn: 'iMac / Mac Studio',
          emoji: '🖥️',
          coverCategory: 'desktops',
          logoDomain: 'apple.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'windows_laptop',
          labelTr: 'Windows Laptop',
          labelEn: 'Windows Laptop',
          emoji: '💻',
          coverCategory: 'laptops',
          logoDomain: 'microsoft.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'windows_pc',
          labelTr: 'Windows PC',
          labelEn: 'Windows PC',
          emoji: '🖥️',
          coverCategory: 'desktops',
          logoDomain: 'microsoft.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'gaming_pc',
          labelTr: 'Gaming PC',
          labelEn: 'Gaming PC',
          emoji: '🕹️',
          coverCategory: 'gpus',
        ),
        _QuizOption(
          value: 'chromebook',
          labelTr: 'Chromebook',
          labelEn: 'Chromebook',
          emoji: '💻',
          coverCategory: 'laptops',
          logoDomain: 'google.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'linux_pc',
          labelTr: 'Linux PC',
          labelEn: 'Linux PC',
          emoji: '🐧',
          coverCategory: 'desktops',
        ),
        _QuizOption(
          value: 'apple_watch',
          labelTr: 'Apple Watch',
          labelEn: 'Apple Watch',
          emoji: '⌚',
          coverCategory: 'smartwatches',
          logoDomain: 'apple.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'galaxy_watch',
          labelTr: 'Samsung Watch',
          labelEn: 'Samsung Watch',
          emoji: '⌚',
          coverCategory: 'smartwatches',
          logoDomain: 'samsung.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'smart_tv',
          labelTr: 'Smart TV',
          labelEn: 'Smart TV',
          emoji: '📺',
          coverCategory: 'tvs',
        ),
        _QuizOption(
          value: 'console',
          labelTr: 'Konsol',
          labelEn: 'Console',
          emoji: '🎮',
          coverCategory: 'consoles',
        ),
        _QuizOption(
          value: 'camera_kit',
          labelTr: 'Kamera',
          labelEn: 'Camera',
          emoji: '📷',
          coverCategory: 'cameras',
        ),
        _QuizOption(
          value: 'smart_speaker',
          labelTr: 'Akilli Hoparlor',
          labelEn: 'Smart Speaker',
          emoji: '🔊',
          coverCategory: 'speakers',
        ),
        _QuizOption(
          value: 'router',
          labelTr: 'Router',
          labelEn: 'Router',
          emoji: '📡',
          coverCategory: 'routers',
        ),
        _QuizOption(
          value: 'robot_vacuum',
          labelTr: 'Robot Supurge',
          labelEn: 'Robot Vacuum',
          emoji: '🤖',
          coverCategory: 'robot-vacuums',
        ),
        _QuizOption(
          value: 'e_reader',
          labelTr: 'E-Okuyucu',
          labelEn: 'E-Reader',
          emoji: '📚',
          coverCategory: 'e-readers',
        ),
        _QuizOption(
          value: 'drone',
          labelTr: 'Drone',
          labelEn: 'Drone',
          emoji: '🚁',
          coverCategory: 'drones',
        ),
      ],
    ),
    _QuizStep(
      field: 'usageIntent',
      title: _t(
        'Compairi en cok ne icin kullanacaksin?',
        'How will you use Compair most?',
      ),
      subtitle: _t(
        'Arayuzde hangi deneyimin onde olacagini belirler.',
        'This decides which experience gets emphasized across the app.',
      ),
      algorithmHint: _t(
        'Kullanim amaci hizli karar, detayli arastirma ve fiyat odagi arasinda denge kurar.',
        'Usage intent shifts emphasis between fast decisions, deep research, and price focus.',
      ),
      type: _StepType.single,
      isRequired: false,
      options: const [
        _QuizOption(
          value: 'research',
          labelTr: 'Detayli Arastirma',
          labelEn: 'Deep Research',
          emoji: '🔍',
          coverCategory: 'laptops',
        ),
        _QuizOption(
          value: 'quick_decision',
          labelTr: 'Hizli Karar',
          labelEn: 'Quick Decision',
          emoji: '⚡',
          coverCategory: 'smartphones',
        ),
        _QuizOption(
          value: 'price_tracking',
          labelTr: 'Fiyat Takibi',
          labelEn: 'Price Tracking',
          emoji: '📉',
          coverCategory: 'powerbanks',
        ),
        _QuizOption(
          value: 'creator_setup',
          labelTr: 'Uretici Seti',
          labelEn: 'Creator Setup',
          emoji: '🎬',
          coverCategory: 'cameras',
        ),
        _QuizOption(
          value: 'gaming_setup',
          labelTr: 'Gaming Kurulumu',
          labelEn: 'Gaming Setup',
          emoji: '🎮',
          coverCategory: 'consoles',
        ),
        _QuizOption(
          value: 'all',
          labelTr: 'Hepsi',
          labelEn: 'Everything',
          emoji: '🎯',
          coverCategory: 'monitors',
        ),
      ],
    ),
    _QuizStep(
      field: 'ageRange',
      title: _t(
        'Kendine en yakin yas araligini sec',
        'Pick the age range closest to you',
      ),
      subtitle: _t(
        'Oneri tonu ve kesif hizi buna gore ayarlanir.',
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
        'Sana en yakin profil hangisi?',
        'Which profile feels closest to you?',
      ),
      subtitle: _t(
        'Meslek bilgisi kategori onceliklerini daha akilli hale getirir.',
        'Profession helps tune category priority more intelligently.',
      ),
      algorithmHint: _t(
        'Profil algoritmasi ilgi alanlarini ve kategori onceliklerini buna gore ince ayarlar.',
        'The profile algorithm fine-tunes category priority with this signal.',
      ),
      type: _StepType.single,
      isRequired: false,
      options: const [
        _QuizOption(
          value: 'student',
          labelTr: 'Ogrenci',
          labelEn: 'Student',
          emoji: '🎓',
          coverCategory: 'laptops',
        ),
        _QuizOption(
          value: 'engineer',
          labelTr: 'Muhendis',
          labelEn: 'Engineer',
          emoji: '⚙️',
          coverCategory: 'cpus',
        ),
        _QuizOption(
          value: 'designer',
          labelTr: 'Tasarimci',
          labelEn: 'Designer',
          emoji: '🎨',
          coverCategory: 'monitors',
        ),
        _QuizOption(
          value: 'developer',
          labelTr: 'Yazilimci',
          labelEn: 'Developer',
          emoji: '👨‍💻',
          coverCategory: 'keyboards',
        ),
        _QuizOption(
          value: 'content_creator',
          labelTr: 'Icerik Ureticisi',
          labelEn: 'Content Creator',
          emoji: '🎥',
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
          labelTr: 'Yonetici',
          labelEn: 'Manager',
          emoji: '💼',
          coverCategory: 'smartphones',
        ),
        _QuizOption(
          value: 'entrepreneur',
          labelTr: 'Girisimci',
          labelEn: 'Entrepreneur',
          emoji: '🚀',
          coverCategory: 'laptops',
        ),
        _QuizOption(
          value: 'healthcare',
          labelTr: 'Saglik',
          labelEn: 'Healthcare',
          emoji: '🏥',
          coverCategory: 'smartwatches',
        ),
        _QuizOption(
          value: 'educator',
          labelTr: 'Egitmen',
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
          value: 'architect',
          labelTr: 'Mimar',
          labelEn: 'Architect',
          emoji: '📐',
          coverCategory: 'tablets',
        ),
        _QuizOption(
          value: 'sales_marketing',
          labelTr: 'Satis / Pazarlama',
          labelEn: 'Sales / Marketing',
          emoji: '📣',
          coverCategory: 'smartphones',
        ),
        _QuizOption(
          value: 'other',
          labelTr: 'Diger',
          labelEn: 'Other',
          emoji: '🌐',
          coverCategory: 'smartphones',
        ),
      ],
    ),
    _QuizStep(
      field: 'subscriptions',
      title: _t(
        'Hangi servisler zaten hayatinin icinde?',
        'Which services are already part of your stack?',
      ),
      subtitle: _t(
        'Compair zaten kullandigin servisleri yeniden onermemek icin bunu kullanir.',
        'Compair uses this to avoid recommending services you already pay for.',
      ),
      algorithmHint: _t(
        'Servis secimleri ekosistem yatkinligi ve abonelik yogunlugunu etkiler.',
        'Service choices influence ecosystem affinity and subscription density.',
      ),
      type: _StepType.multi,
      isRequired: false,
      options: const [
        _QuizOption(
          value: 'spotify',
          labelTr: 'Spotify',
          labelEn: 'Spotify',
          emoji: '🎵',
          logoDomain: 'spotify.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'apple_music',
          labelTr: 'Apple Music',
          labelEn: 'Apple Music',
          emoji: '🎶',
          logoDomain: 'music.apple.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'youtube_premium',
          labelTr: 'YouTube Premium',
          labelEn: 'YouTube Premium',
          emoji: '▶️',
          logoDomain: 'youtube.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'netflix',
          labelTr: 'Netflix',
          labelEn: 'Netflix',
          emoji: '🎬',
          logoDomain: 'netflix.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'disney_plus',
          labelTr: 'Disney+',
          labelEn: 'Disney+',
          emoji: '🏰',
          logoDomain: 'disneyplus.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'max',
          labelTr: 'Max',
          labelEn: 'Max',
          emoji: '🎞️',
          logoDomain: 'max.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'prime_video',
          labelTr: 'Prime Video',
          labelEn: 'Prime Video',
          emoji: '📺',
          logoDomain: 'primevideo.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'icloud',
          labelTr: 'iCloud+',
          labelEn: 'iCloud+',
          emoji: '☁️',
          logoDomain: 'apple.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'google_one',
          labelTr: 'Google One',
          labelEn: 'Google One',
          emoji: '☁️',
          logoDomain: 'one.google.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'microsoft_365',
          labelTr: 'Microsoft 365',
          labelEn: 'Microsoft 365',
          emoji: '🧠',
          logoDomain: 'microsoft.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'adobe_cc',
          labelTr: 'Adobe CC',
          labelEn: 'Adobe CC',
          emoji: '🅰️',
          logoDomain: 'adobe.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'figma',
          labelTr: 'Figma',
          labelEn: 'Figma',
          emoji: '🎨',
          logoDomain: 'figma.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'notion',
          labelTr: 'Notion',
          labelEn: 'Notion',
          emoji: '📝',
          logoDomain: 'notion.so',
          preferContain: true,
        ),
        _QuizOption(
          value: 'chatgpt_plus',
          labelTr: 'ChatGPT Plus',
          labelEn: 'ChatGPT Plus',
          emoji: '✳️',
          logoDomain: 'openai.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'github_copilot',
          labelTr: 'GitHub Copilot',
          labelEn: 'GitHub Copilot',
          emoji: '🤖',
          logoDomain: 'github.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'game_pass',
          labelTr: 'Game Pass',
          labelEn: 'Game Pass',
          emoji: '🎮',
          logoDomain: 'xbox.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'ps_plus',
          labelTr: 'PS Plus',
          labelEn: 'PS Plus',
          emoji: '🕹️',
          logoDomain: 'playstation.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'switch_online',
          labelTr: 'Switch Online',
          labelEn: 'Switch Online',
          emoji: '🎯',
          logoDomain: 'nintendo.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'geforce_now',
          labelTr: 'GeForce NOW',
          labelEn: 'GeForce NOW',
          emoji: '☁️',
          logoDomain: 'nvidia.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'twitch',
          labelTr: 'Twitch',
          labelEn: 'Twitch',
          emoji: '🟣',
          logoDomain: 'twitch.tv',
          preferContain: true,
        ),
        _QuizOption(
          value: 'none',
          labelTr: 'Hicbiri',
          labelEn: 'None',
          emoji: '➖',
        ),
      ],
    ),
  ];

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
    'apple': 'https://cdn.simpleicons.org/apple/000000',
    'android': 'https://cdn.simpleicons.org/android/3DDC84',
    'windows': 'https://cdn.simpleicons.org/windows11/0078D4',
    'samsung': 'https://cdn.simpleicons.org/samsung/1428A0',
    'google': 'https://cdn.simpleicons.org/google/4285F4',
    'spotify': 'https://cdn.simpleicons.org/spotify/1DB954',
    'apple_music': 'https://cdn.simpleicons.org/applemusic/FA243C',
    'youtube_premium': 'https://cdn.simpleicons.org/youtube/FF0000',
    'netflix': 'https://cdn.simpleicons.org/netflix/E50914',
    'disney_plus': 'https://cdn.simpleicons.org/disneyplus/113CCF',
    'max': 'https://cdn.simpleicons.org/hbomax/5822B4',
    'prime_video': 'https://cdn.simpleicons.org/primevideo/1F2E3D',
    'icloud': 'https://cdn.simpleicons.org/icloud/3693F3',
    'google_one': 'https://cdn.simpleicons.org/googleone/4285F4',
    'microsoft_365': 'https://cdn.simpleicons.org/microsoftoffice/D83B01',
    'adobe_cc': 'https://cdn.simpleicons.org/adobecreativecloud/DA1F26',
    'figma': 'https://cdn.simpleicons.org/figma/F24E1E',
    'notion': 'https://cdn.simpleicons.org/notion/000000',
    'chatgpt_plus': 'https://cdn.simpleicons.org/openai/10A37F',
    'github_copilot': 'https://cdn.simpleicons.org/github/181717',
    'game_pass': 'https://cdn.simpleicons.org/xbox/107C10',
    'ps_plus': 'https://cdn.simpleicons.org/playstation/003791',
    'switch_online': 'https://cdn.simpleicons.org/nintendo/E60012',
    'geforce_now': 'https://cdn.simpleicons.org/nvidia/76B900',
    'twitch': 'https://cdn.simpleicons.org/twitch/9146FF',
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
  };

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(userProfileProvider).valueOrNull;
    final covers =
        ref.watch(quizCategoryVisualsProvider).valueOrNull ??
        const <String, String>{};
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
      backgroundColor: const Color(0xFF07101A),
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
                  const Color(0xFF07101A),
                  AppTheme.brandBlue.withValues(alpha: 0.18),
                  const Color(0xFF07101A),
                ],
              ),
            ),
          ),
        ),
        _orb(const Color(0xFF00E5FF), const Alignment(-0.9, -0.8), 180),
        _orb(const Color(0xFF3B82F6), const Alignment(1.1, -0.2), 220),
        _orb(const Color(0xFF8B5CF6), const Alignment(-1.0, 0.8), 220),
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
            color: color.withValues(alpha: 0.18),
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
                      'Compair',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: AppTheme.brandCyan,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      _t(
                        'Adim ${_currentPage + 1} / $totalSteps',
                        'Step ${_currentPage + 1} / $totalSteps',
                      ),
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.white.withValues(alpha: 0.74),
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
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                )
              else
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 7,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    _t('Zorunlu', 'Required'),
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: Colors.white.withValues(alpha: 0.85),
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
              backgroundColor: Colors.white.withValues(alpha: 0.08),
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
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            step.title,
            style: const TextStyle(
              fontSize: 30,
              fontWeight: FontWeight.w900,
              height: 1.05,
              color: Colors.white,
            ),
          ),
          if (step.subtitle.trim().isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              step.subtitle,
              style: TextStyle(
                fontSize: 13,
                height: 1.35,
                color: Colors.white.withValues(alpha: 0.72),
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
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSelectedCounter(
          selectedCount,
          minimum: 3,
          text: _t('En az 3 kategori sec', 'Select at least 3 categories'),
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
                    imageUrl: _resolveOptionImageUrl(option, covers),
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
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (step.type == _StepType.multi && selectedValues.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: _buildSelectedCounter(
              selectedValues.length,
              text: _t('Secili', 'Selected'),
            ),
          ),
        Wrap(
          spacing: 14,
          runSpacing: 18,
          children: step.options.map((option) {
            final selected = selectedValues.contains(option.value);
            return _buildCircleChoice(
              option: option,
              selected: selected,
              onTap: () {
                if (step.type == _StepType.single) {
                  _selectSingle(step.field, option.value);
                } else {
                  _toggleMulti(step.field, option.value);
                }
              },
              imageUrl: _resolveOptionImageUrl(option, covers),
              size: 94,
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildListStep(_QuizStep step, Map<String, String> covers) {
    final selectedValues = _selectedValues(step.field);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (step.type == _StepType.multi && selectedValues.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: _buildSelectedCounter(
              selectedValues.length,
              text: _t('Secili', 'Selected'),
            ),
          ),
        ...step.options.map((option) {
          final selected = selectedValues.contains(option.value);
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
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
              imageUrl: _resolveOptionImageUrl(option, covers),
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

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: meetsMinimum
              ? AppTheme.brandCyan.withValues(alpha: 0.32)
              : Colors.white.withValues(alpha: 0.08),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            meetsMinimum ? Icons.check_circle_rounded : Icons.circle_outlined,
            size: 16,
            color: meetsMinimum ? AppTheme.brandCyan : Colors.white54,
          ),
          const SizedBox(width: 8),
          Text(
            minimum == null ? '$count $text' : '$count / $minimum · $text',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: Colors.white.withValues(alpha: 0.88),
            ),
          ),
        ],
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
                  color: selected ? null : Colors.white.withValues(alpha: 0.05),
                  border: Border.all(
                    color: selected
                        ? Colors.white.withValues(alpha: 0.2)
                        : Colors.white.withValues(alpha: 0.08),
                    width: selected ? 2 : 1,
                  ),
                  boxShadow: selected
                      ? [
                          BoxShadow(
                            color: colors.first.withValues(alpha: 0.32),
                            blurRadius: 22,
                            offset: const Offset(0, 10),
                          ),
                        ]
                      : null,
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
                      child: Padding(
                        padding: EdgeInsets.all(dimmed ? 16 : 14),
                        child: _buildOptionArtwork(
                          option: option,
                          imageUrl: imageUrl,
                          circular: true,
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
                          child: const Icon(
                            Icons.check_rounded,
                            size: 16,
                            color: Colors.black,
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
                  color: Colors.white.withValues(alpha: selected ? 0.98 : 0.75),
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
            color: selected ? null : Colors.white.withValues(alpha: 0.05),
            border: Border.all(
              color: selected
                  ? colors.first.withValues(alpha: 0.9)
                  : Colors.white.withValues(alpha: 0.08),
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
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                      ),
                    ),
                    if (detail != null && detail.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        detail,
                        style: TextStyle(
                          fontSize: 12,
                          height: 1.25,
                          color: Colors.white.withValues(alpha: 0.68),
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
                  color: selected
                      ? AppTheme.brandCyan
                      : Colors.white.withValues(alpha: 0.08),
                ),
                child: Icon(
                  selected ? Icons.check_rounded : Icons.add_rounded,
                  color: selected ? Colors.black : Colors.white70,
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

    if (imageUrl != null && imageUrl.toLowerCase().endsWith('.svg')) {
      return SvgPicture.network(
        imageUrl,
        fit: BoxFit.contain,
        placeholderBuilder: (context) =>
            _buildOptionFallback(option: option, icon: icon),
      );
    }

    if (imageUrl != null) {
      return Image.network(
        imageUrl,
        fit: BoxFit.contain,
        errorBuilder: (context, error, stackTrace) =>
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

  String? _resolveOptionImageUrl(
    _QuizOption option,
    Map<String, String> covers,
  ) {
    return _logoSvgUrlByValue[option.value];
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
                        'Devam etmek icin en az 3 kategori sec.',
                        'Select at least 3 categories to continue.',
                      )
                    : _t(
                        'Devam etmek icin bu adimi tamamla.',
                        'Complete this step to continue.',
                      ),
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.white.withValues(alpha: 0.58),
                ),
              ),
            ),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: canContinue
                    ? AppTheme.brandCyan
                    : Colors.white.withValues(alpha: 0.12),
                foregroundColor: canContinue ? Colors.black : Colors.white54,
                padding: const EdgeInsets.symmetric(vertical: 18),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(22),
                ),
              ),
              onPressed: _isSubmitting
                  ? null
                  : () {
                      if (!canContinue) return;
                      _goNext();
                    },
              child: _isSubmitting
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          isLast
                              ? _t('Profilimi olustur', 'Create my profile')
                              : _t('Devam et', 'Continue'),
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(width: 10),
                        Icon(
                          isLast
                              ? Icons.auto_awesome_rounded
                              : Icons.arrow_forward_rounded,
                          size: 20,
                        ),
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }

  bool _canContinue(_QuizStep step) {
    if (!step.isRequired) return true;

    switch (step.field) {
      case 'interestCategories':
        return _interestCategories.length >= 3;
      case 'ecosystem':
        return _ecosystem != null;
      case 'budgetRange':
        return _budgetRange != null;
      case 'ageRange':
        return _ageRange != null;
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
                    'En az 3 kategori secmeden devam edemezsin.',
                    'Select at least 3 categories before continuing.',
                  )
                : _t(
                    'Bu adim tamamlanmadan devam edemezsin.',
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
    final heroCategory = _interestCategories.isNotEmpty
        ? _interestCategories.first
        : 'smartphones';
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
      backgroundColor: const Color(0xFF07101A),
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
                          Container(
                            width: double.infinity,
                            height: 280,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(32),
                              gradient: const LinearGradient(
                                colors: [Color(0xFF102033), Color(0xFF0A1624)],
                              ),
                            ),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(32),
                              child: Stack(
                                children: [
                                  if (heroImage != null)
                                    Positioned.fill(
                                      child: Image.network(
                                        heroImage,
                                        fit: BoxFit.cover,
                                        errorBuilder:
                                            (context, error, stackTrace) =>
                                                const SizedBox.shrink(),
                                      ),
                                    ),
                                  Positioned.fill(
                                    child: DecoratedBox(
                                      decoration: BoxDecoration(
                                        gradient: LinearGradient(
                                          begin: Alignment.topCenter,
                                          end: Alignment.bottomCenter,
                                          colors: [
                                            Colors.black.withValues(
                                              alpha: 0.18,
                                            ),
                                            Colors.black.withValues(alpha: 0.2),
                                            const Color(0xFF07101A),
                                          ],
                                        ),
                                      ),
                                    ),
                                  ),
                                  Padding(
                                    padding: const EdgeInsets.all(24),
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Container(
                                          width: 58,
                                          height: 58,
                                          decoration: const BoxDecoration(
                                            shape: BoxShape.circle,
                                            color: AppTheme.brandCyan,
                                          ),
                                          child: const Icon(
                                            Icons.check_rounded,
                                            color: Colors.black,
                                            size: 30,
                                          ),
                                        ),
                                        const Spacer(),
                                        Text(
                                          _buildProfileHeadline(),
                                          style: const TextStyle(
                                            fontSize: 30,
                                            fontWeight: FontWeight.w900,
                                            color: Colors.white,
                                          ),
                                        ),
                                        const SizedBox(height: 10),
                                        Text(
                                          _buildProfileSubheadline(),
                                          style: TextStyle(
                                            fontSize: 14,
                                            height: 1.5,
                                            color: Colors.white.withValues(
                                              alpha: 0.78,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 18),
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
                            title: _t('Kesif DNA', 'Discovery DNA'),
                            body: _buildDiscoverySummary(),
                            color: AppTheme.brandCyan,
                            icon: Icons.auto_awesome_rounded,
                          ),
                          const SizedBox(height: 12),
                          _completionCard(
                            title: _t('Kurulu ekosistem', 'Current setup'),
                            body: _buildSetupSummary(),
                            color: AppTheme.neonPurple,
                            icon: Icons.devices_rounded,
                          ),
                          const SizedBox(height: 12),
                          _completionCard(
                            title: _t('AI karar dili', 'AI decision language'),
                            body: _buildDecisionSummary(),
                            color: AppTheme.green500,
                            icon: Icons.psychology_alt_rounded,
                          ),
                          const SizedBox(height: 12),
                          _completionCard(
                            title: _t('Kullanim profili', 'Usage profile'),
                            body: _buildWorkProfileSummary(),
                            color: const Color(0xFFF59E0B),
                            icon: Icons.work_rounded,
                          ),
                          const SizedBox(height: 12),
                          _completionCard(
                            title: _t('Servis yogunlugu', 'Service density'),
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
                        foregroundColor: Colors.black,
                        padding: const EdgeInsets.symmetric(vertical: 18),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(22),
                        ),
                      ),
                      onPressed: () => context.go(AppRoutes.home),
                      child: Text(
                        _t('Kesfe basla', 'Start exploring'),
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

  Widget _summaryChip({required String label, bool secondary = false}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: secondary
            ? Colors.white.withValues(alpha: 0.06)
            : AppTheme.brandCyan.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: secondary
              ? Colors.white.withValues(alpha: 0.08)
              : AppTheme.brandCyan.withValues(alpha: 0.22),
        ),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: Colors.white.withValues(alpha: 0.92),
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
        color: Colors.white.withValues(alpha: 0.05),
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
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  body,
                  style: TextStyle(
                    fontSize: 13,
                    height: 1.45,
                    color: Colors.white.withValues(alpha: 0.72),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _buildProfileHeadline() {
    final leadingCategory = _interestCategories.isNotEmpty
        ? _labelForCategory(_interestCategories.first)
        : _t('Tech kesfi', 'Tech discovery');
    return _t('$leadingCategory icin hazirsin', 'Ready for $leadingCategory');
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
      'Compair artik $descriptor sinyallerini ana sayfa, AI aciklamalari ve kategori siralamalarina yansitacak.',
      'Compair will now reflect your $descriptor signals across home ranking, AI explanations, and category priorities.',
    );
  }

  String _buildDiscoverySummary() {
    final categories = _interestCategories
        .take(4)
        .map(_labelForCategory)
        .toList();
    if (categories.isEmpty) {
      return _t(
        'Kesif akisi davranis verilerinle birlikte dengeli sekilde sekillenecek.',
        'Discovery will balance itself progressively with your behavior data.',
      );
    }

    final priorities = _priorities.take(3).map(_labelForPriority).toList();
    final categoryText = categories.join(', ');
    if (priorities.isEmpty) {
      return _t(
        'Ana odak: $categoryText. Ana sayfa bu alanlari daha yukari tasiyacak.',
        'Primary focus: $categoryText. Home will push these categories higher.',
      );
    }

    return _t(
      'Ana odak: $categoryText. Karar dili: ${priorities.join(', ')}.',
      'Primary focus: $categoryText. Decision language: ${priorities.join(', ')}.',
    );
  }

  String _buildSetupSummary() {
    final ecosystem = _ecosystem == null
        ? _t('Karisik kurulum', 'Mixed setup')
        : _labelForEcosystem(_ecosystem!);
    final devices = _currentDevices.take(4).map(_labelForOwnedDevice).toList();
    if (devices.isEmpty) {
      return _t(
        '$ecosystem sinyali baz alinacak; cihaz baglantilari kullandikca netlesecek.',
        '$ecosystem will be the base signal; device compatibility will sharpen as you use the app.',
      );
    }

    return _t(
      '$ecosystem kurulumu algilandi. Aktif cihazlar: ${devices.join(', ')}.',
      '$ecosystem setup detected. Active devices: ${devices.join(', ')}.',
    );
  }

  String _buildDecisionSummary() {
    if (_priorities.isEmpty) {
      return _t(
        'AI ilk etapta fiyat, kalite ve uyumu dengeli agirliklarla kullanacak.',
        'AI will begin with balanced weights across price, quality, and compatibility.',
      );
    }
    return _t(
      'AI aciklamalari once ${_priorities.take(3).map(_labelForPriority).join(', ')} odaklariyla sekillenecek.',
      'AI explanations will prioritize ${_priorities.take(3).map(_labelForPriority).join(', ')}.',
    );
  }

  String _buildWorkProfileSummary() {
    final profession = _profession == null
        ? _t('Genel kullanici', 'General user')
        : _labelForProfession(_profession!);
    final usage = _usageIntent == null
        ? _t('dengeli kullanim', 'balanced usage')
        : _labelForUsageIntent(_usageIntent!);
    final age = _ageRange ?? '';
    if (age.isEmpty) {
      return _t(
        '$profession profili ve $usage modu aktif.',
        '$profession profile with $usage mode is active.',
      );
    }
    return _t(
      '$profession profili, $usage modu ve $age davranis bandi birlikte kullanilacak.',
      '$profession profile, $usage mode, and the $age behavior band will work together.',
    );
  }

  String _buildSubscriptionSummary() {
    final filtered = _subscriptions.where((item) => item != 'none').toList();
    if (filtered.isEmpty) {
      return _t(
        'Sade bir servis profili algilandi. Compair yeni servis ve ekosistem onerilerine daha acik olacak.',
        'A lighter service profile was detected. Compair will stay more open to new service and ecosystem suggestions.',
      );
    }

    final labels = filtered.take(4).map(_labelForSubscription).toList();
    final density = filtered.length >= 6
        ? _t('yuksek', 'high')
        : filtered.length >= 3
        ? _t('orta', 'medium')
        : _t('hafif', 'light');
    return _t(
      '$density servis yogunlugu algilandi: ${labels.join(', ')}.',
      '$density service density detected: ${labels.join(', ')}.',
    );
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
        return _t('Apple odakli', 'Apple-first');
      case 'android':
        return _t('Android odakli', 'Android-first');
      case 'windows':
        return _t('Windows odakli', 'Windows-first');
      case 'samsung':
        return _t('Galaxy odakli', 'Galaxy-first');
      case 'google':
        return _t('Google odakli', 'Google-first');
      case 'mixed':
        return _t('Karisik ekosistem', 'Mixed ecosystem');
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
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Ink(
        width: 42,
        height: 42,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
        ),
        child: Icon(icon, color: Colors.white),
      ),
    );
  }
}
