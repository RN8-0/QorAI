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
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

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
          subtitle: _t(
            'En az 3 kategori sec. Ana sayfa siralamasi ve oneriler buna gore sekillenecek.',
            'Pick at least 3 categories. Your home feed and recommendations will adapt to this.',
          ),
          algorithmHint: _t(
            'Ana sayfa algoritmasi, kategori onceligi ve AI yonlendirmesi bu secimi kullanir.',
            'Home ranking, category priority, and AI guidance use this signal.',
          ),
          type: _StepType.categories,
          isRequired: true,
          options: [
            _QuizOption(
              value: 'smartphones',
              labelTr: 'Telefonlar',
              labelEn: 'Phones',
              emoji: '📱',
            ),
            _QuizOption(
              value: 'laptops',
              labelTr: 'Laptoplar',
              labelEn: 'Laptops',
              emoji: '💻',
            ),
            _QuizOption(
              value: 'tablets',
              labelTr: 'Tabletler',
              labelEn: 'Tablets',
              emoji: '📟',
            ),
            _QuizOption(
              value: 'tvs',
              labelTr: 'TV',
              labelEn: 'TVs',
              emoji: '📺',
            ),
            _QuizOption(
              value: 'monitors',
              labelTr: 'Monitorler',
              labelEn: 'Monitors',
              emoji: '🖥️',
            ),
            _QuizOption(
              value: 'cpus',
              labelTr: 'Islemciler',
              labelEn: 'CPUs',
              emoji: '⚡',
            ),
            _QuizOption(
              value: 'gpus',
              labelTr: 'Ekran Kartlari',
              labelEn: 'GPUs',
              emoji: '🎮',
            ),
            _QuizOption(
              value: 'headphones',
              labelTr: 'Kulakliklar',
              labelEn: 'Headphones',
              emoji: '🎧',
            ),
            _QuizOption(
              value: 'smartwatches',
              labelTr: 'Akilli Saatler',
              labelEn: 'Smartwatches',
              emoji: '⌚',
            ),
            _QuizOption(
              value: 'cameras',
              labelTr: 'Kameralar',
              labelEn: 'Cameras',
              emoji: '📷',
            ),
            _QuizOption(
              value: 'consoles',
              labelTr: 'Konsollar',
              labelEn: 'Consoles',
              emoji: '🕹️',
            ),
            _QuizOption(
              value: 'speakers',
              labelTr: 'Hoparlorler',
              labelEn: 'Speakers',
              emoji: '🔊',
            ),
            _QuizOption(
              value: 'desktops',
              labelTr: 'Masaustu',
              labelEn: 'Desktops',
              emoji: '🖥️',
            ),
            _QuizOption(
              value: 'routers',
              labelTr: 'Ag Urunleri',
              labelEn: 'Networking',
              emoji: '📡',
            ),
            _QuizOption(
              value: 'drones',
              labelTr: 'Drone',
              labelEn: 'Drones',
              emoji: '🚁',
            ),
            _QuizOption(
              value: 'robot-vacuums',
              labelTr: 'Akilli Ev',
              labelEn: 'Smart Home',
              emoji: '🤖',
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
            'Uyumluluk ve aksesuar onerileri buna gore guclenir.',
            'Compatibility and accessory recommendations become more accurate with this.',
          ),
          algorithmHint: _t(
            'Ekosistem sinyali urun uyumlulugu ve butunlu deneyim icin kullanilir.',
            'Ecosystem affinity improves compatibility and continuity scoring.',
          ),
          type: _StepType.single,
          isRequired: true,
          options: [
            _QuizOption(
              value: 'apple',
              labelTr: 'Apple',
              labelEn: 'Apple',
              emoji: '🍎',
            ),
            _QuizOption(
              value: 'android',
              labelTr: 'Android',
              labelEn: 'Android',
              emoji: '🤖',
            ),
            _QuizOption(
              value: 'mixed',
              labelTr: 'Karisik',
              labelEn: 'Mixed',
              emoji: '🔄',
            ),
          ],
        ),
        _QuizStep(
          field: 'budgetRange',
          title: _t('Butcen hangi bantta?', 'What budget band fits you?'),
          subtitle: _t(
            'Fiyat/performans ile premium oneriler arasindaki dengeyi bu secim belirler.',
            'This controls the balance between value picks and premium recommendations.',
          ),
          algorithmHint: _t(
            'Fiyat bandi, one cikarilan urunlerin seviye ve segmentini ayarlar.',
            'Budget range changes which price tier the ranking engine prefers.',
          ),
          type: _StepType.single,
          isRequired: true,
          options: [
            _QuizOption(
              value: 'low',
              labelTr: 'Butce Dostu',
              labelEn: 'Budget',
              emoji: '💸',
            ),
            _QuizOption(
              value: 'mid',
              labelTr: 'Dengeli',
              labelEn: 'Balanced',
              emoji: '💎',
            ),
            _QuizOption(
              value: 'high',
              labelTr: 'Premium',
              labelEn: 'Premium',
              emoji: '👑',
            ),
            _QuizOption(
              value: 'any',
              labelTr: 'Farketmez',
              labelEn: 'Any',
              emoji: '✨',
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
          options: [
            _QuizOption(
              value: 'price',
              labelTr: 'Fiyat',
              labelEn: 'Price',
              emoji: '💰',
            ),
            _QuizOption(
              value: 'quality',
              labelTr: 'Kalite',
              labelEn: 'Quality',
              emoji: '⭐',
            ),
            _QuizOption(
              value: 'design',
              labelTr: 'Tasarim',
              labelEn: 'Design',
              emoji: '🎨',
            ),
            _QuizOption(
              value: 'ecosystem',
              labelTr: 'Uyum',
              labelEn: 'Ecosystem',
              emoji: '🔗',
            ),
            _QuizOption(
              value: 'performance',
              labelTr: 'Performans',
              labelEn: 'Performance',
              emoji: '⚡',
            ),
            _QuizOption(
              value: 'durability',
              labelTr: 'Dayaniklilik',
              labelEn: 'Durability',
              emoji: '🛡️',
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
          options: [
            _QuizOption(
              value: 'iphone',
              labelTr: 'iPhone',
              labelEn: 'iPhone',
              emoji: '📱',
              coverCategory: 'smartphones',
            ),
            _QuizOption(
              value: 'android_phone',
              labelTr: 'Android',
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
              value: 'mac',
              labelTr: 'Mac',
              labelEn: 'Mac',
              emoji: '💻',
              coverCategory: 'laptops',
            ),
            _QuizOption(
              value: 'windows_pc',
              labelTr: 'Windows PC',
              labelEn: 'Windows PC',
              emoji: '🖥️',
              coverCategory: 'desktops',
            ),
            _QuizOption(
              value: 'linux',
              labelTr: 'Linux',
              labelEn: 'Linux',
              emoji: '🐧',
              coverCategory: 'desktops',
            ),
            _QuizOption(
              value: 'smart_watch',
              labelTr: 'Akilli Saat',
              labelEn: 'Smart Watch',
              emoji: '⌚',
              coverCategory: 'smartwatches',
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
          options: [
            _QuizOption(
              value: 'research',
              labelTr: 'Detayli Arastirma',
              labelEn: 'Deep Research',
              emoji: '🔍',
            ),
            _QuizOption(
              value: 'quick_decision',
              labelTr: 'Hizli Karar',
              labelEn: 'Quick Decision',
              emoji: '⚡',
            ),
            _QuizOption(
              value: 'price_tracking',
              labelTr: 'Fiyat Takibi',
              labelEn: 'Price Tracking',
              emoji: '📉',
            ),
            _QuizOption(
              value: 'all',
              labelTr: 'Hepsi',
              labelEn: 'Everything',
              emoji: '🎯',
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
          options: [
            _QuizOption(value: '13-17', labelTr: '13-17', labelEn: '13-17', emoji: '🎮'),
            _QuizOption(value: '18-24', labelTr: '18-24', labelEn: '18-24', emoji: '📱'),
            _QuizOption(value: '25-34', labelTr: '25-34', labelEn: '25-34', emoji: '💻'),
            _QuizOption(value: '35-44', labelTr: '35-44', labelEn: '35-44', emoji: '🏠'),
            _QuizOption(value: '45-54', labelTr: '45-54', labelEn: '45-54', emoji: '📊'),
            _QuizOption(value: '55+', labelTr: '55+', labelEn: '55+', emoji: '✨'),
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
          options: [
            _QuizOption(
              value: 'student',
              labelTr: 'Ogrenci',
              labelEn: 'Student',
              emoji: '🎓',
            ),
            _QuizOption(
              value: 'engineer',
              labelTr: 'Muhendis',
              labelEn: 'Engineer',
              emoji: '⚙️',
            ),
            _QuizOption(
              value: 'designer',
              labelTr: 'Tasarimci',
              labelEn: 'Designer',
              emoji: '🎨',
            ),
            _QuizOption(
              value: 'manager',
              labelTr: 'Yonetici',
              labelEn: 'Manager',
              emoji: '💼',
            ),
            _QuizOption(
              value: 'healthcare',
              labelTr: 'Saglik',
              labelEn: 'Healthcare',
              emoji: '🏥',
            ),
            _QuizOption(
              value: 'teacher',
              labelTr: 'Egitmen',
              labelEn: 'Teacher',
              emoji: '📚',
            ),
            _QuizOption(
              value: 'finance',
              labelTr: 'Finans',
              labelEn: 'Finance',
              emoji: '💹',
            ),
            _QuizOption(
              value: 'other',
              labelTr: 'Diger',
              labelEn: 'Other',
              emoji: '🌐',
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
          options: [
            _QuizOption(
              value: 'spotify',
              labelTr: 'Spotify',
              labelEn: 'Spotify',
              emoji: '🎵',
            ),
            _QuizOption(
              value: 'netflix',
              labelTr: 'Netflix',
              labelEn: 'Netflix',
              emoji: '🎬',
            ),
            _QuizOption(
              value: 'youtube_premium',
              labelTr: 'YouTube Premium',
              labelEn: 'YouTube Premium',
              emoji: '▶️',
            ),
            _QuizOption(
              value: 'apple_music',
              labelTr: 'Apple Music',
              labelEn: 'Apple Music',
              emoji: '🎶',
            ),
            _QuizOption(
              value: 'icloud',
              labelTr: 'iCloud',
              labelEn: 'iCloud',
              emoji: '☁️',
            ),
            _QuizOption(
              value: 'google_one',
              labelTr: 'Google One',
              labelEn: 'Google One',
              emoji: '☁️',
            ),
            _QuizOption(
              value: 'game_pass',
              labelTr: 'Game Pass',
              labelEn: 'Game Pass',
              emoji: '🎮',
            ),
            _QuizOption(
              value: 'ps_plus',
              labelTr: 'PS Plus',
              labelEn: 'PS Plus',
              emoji: '🕹️',
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

  static const Map<String, List<String>> _relatedCategories = {
    'smartphones': ['tablets', 'smartwatches', 'headphones'],
    'laptops': ['monitors', 'desktops', 'headphones'],
    'tablets': ['smartphones', 'laptops', 'smartwatches'],
    'tvs': ['speakers', 'consoles', 'routers'],
    'monitors': ['laptops', 'desktops', 'gpus'],
    'cpus': ['gpus', 'desktops', 'monitors'],
    'gpus': ['cpus', 'monitors', 'desktops'],
    'headphones': ['speakers', 'smartphones', 'smartwatches'],
    'smartwatches': ['smartphones', 'headphones', 'tablets'],
    'cameras': ['drones', 'laptops', 'monitors'],
    'consoles': ['tvs', 'headphones', 'speakers'],
    'speakers': ['tvs', 'headphones', 'consoles'],
    'desktops': ['monitors', 'cpus', 'gpus'],
    'routers': ['smart-home', 'tvs', 'desktops'],
    'drones': ['cameras', 'smartphones', 'tablets'],
    'robot-vacuums': ['routers', 'smartwatches', 'speakers'],
  };

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

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(userProfileProvider).valueOrNull;
    final covers = ref.watch(categoryCoversProvider).valueOrNull ?? const <String, String>{};
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
                    onPageChanged: (index) => setState(() => _currentPage = index),
                    itemBuilder: (context, index) {
                      final currentStep = steps[index];
                      return _buildStepPage(
                        currentStep,
                        covers,
                      );
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
              valueColor: const AlwaysStoppedAnimation<Color>(AppTheme.brandCyan),
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
          const SizedBox(height: 10),
          Text(
            step.subtitle,
            style: TextStyle(
              fontSize: 14,
              height: 1.45,
              color: Colors.white.withValues(alpha: 0.72),
            ),
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.auto_awesome_rounded,
                  size: 15,
                  color: AppTheme.brandCyan,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    step.algorithmHint,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: Colors.white.withValues(alpha: 0.82),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          if (step.type == _StepType.categories)
            _buildCategoriesStep(step, covers)
          else
            _buildGenericCircleStep(step, covers),
        ],
      ),
    );
  }

  Widget _buildCategoriesStep(_QuizStep step, Map<String, String> covers) {
    final selectedCount = _interestCategories.length;
    final suggestions = _relatedSuggestions(step);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSelectedCounter(
          selectedCount,
          minimum: 3,
          text: _t(
            'En az 3 kategori sec',
            'Select at least 3 categories',
          ),
        ),
        const SizedBox(height: 18),
        Wrap(
          spacing: 14,
          runSpacing: 20,
          children: step.options.map((option) {
            return _buildCircleChoice(
              option: option,
              selected: _interestCategories.contains(option.value),
              onTap: () => _toggleMulti('interestCategories', option.value),
              imageUrl: covers[option.value],
              size: 96,
            );
          }).toList(),
        ),
        AnimatedSize(
          duration: const Duration(milliseconds: 280),
          curve: Curves.easeOutCubic,
          child: suggestions.isEmpty
              ? const SizedBox.shrink()
              : Padding(
                  padding: const EdgeInsets.only(top: 28),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _t('Benzer ilgi alanlari', 'Related interests'),
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: Colors.white.withValues(alpha: 0.95),
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        _t(
                          'Sectikce benzer kategoriler acilir. Spotify tarzinda zevk profilini boyle kuruyoruz.',
                          'Related categories expand as you select, building a taste profile like Spotify-style onboarding.',
                        ),
                        style: TextStyle(
                          fontSize: 13,
                          height: 1.45,
                          color: Colors.white.withValues(alpha: 0.66),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Wrap(
                        spacing: 12,
                        runSpacing: 14,
                        children: suggestions.map((value) {
                          final option = step.options.firstWhere(
                            (item) => item.value == value,
                          );
                          return _buildMiniCircleChoice(
                            option: option,
                            selected: _interestCategories.contains(value),
                            onTap: () =>
                                _toggleMulti('interestCategories', value),
                            imageUrl: covers[value],
                          );
                        }).toList(),
                      ),
                    ],
                  ),
                ),
        ),
      ],
    );
  }

  List<String> _relatedSuggestions(_QuizStep step) {
    final suggestions = <String>[];
    for (final selected in _interestCategories) {
      final related = _relatedCategories[selected] ?? const <String>[];
      for (final value in related) {
        final exists = step.options.any((option) => option.value == value);
        if (!exists || _interestCategories.contains(value) || suggestions.contains(value)) {
          continue;
        }
        suggestions.add(value);
      }
    }
    return suggestions.take(6).toList();
  }

  Widget _buildGenericCircleStep(
    _QuizStep step,
    Map<String, String> covers,
  ) {
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
            final imageUrl = option.coverCategory == null
                ? null
                : covers[option.coverCategory!];
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
              imageUrl: imageUrl,
              size: 94,
            );
          }).toList(),
        ),
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
  }) {
    final colors = _accentMap[option.value] ?? const [AppTheme.brandCyan, AppTheme.brandBlue];

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
                  gradient: selected
                      ? LinearGradient(colors: colors)
                      : null,
                  color: selected
                      ? null
                      : Colors.white.withValues(alpha: 0.05),
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
                padding: const EdgeInsets.all(4),
                child: Stack(
                  children: [
                    Positioned.fill(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: const Color(0xFF0C1622),
                        ),
                      ),
                    ),
                    if (imageUrl != null)
                      Positioned.fill(
                        child: ClipOval(
                          child: Image.network(
                            imageUrl,
                            fit: BoxFit.cover,
                            errorBuilder: (context, error, stackTrace) =>
                                const SizedBox.shrink(),
                          ),
                        ),
                      ),
                    Positioned.fill(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              Colors.transparent,
                              Colors.black.withValues(alpha: imageUrl == null ? 0.0 : 0.45),
                            ],
                          ),
                        ),
                      ),
                    ),
                    Center(
                      child: imageUrl == null
                          ? Text(
                              option.emoji,
                              style: TextStyle(fontSize: size * 0.3),
                            )
                          : const SizedBox.shrink(),
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

  Widget _buildMiniCircleChoice({
    required _QuizOption option,
    required bool selected,
    required VoidCallback onTap,
    String? imageUrl,
  }) {
    final colors = _accentMap[option.value] ?? const [AppTheme.brandCyan, AppTheme.brandBlue];

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        decoration: BoxDecoration(
          color: selected
              ? colors.first.withValues(alpha: 0.16)
              : Colors.white.withValues(alpha: 0.04),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: selected
                ? colors.first.withValues(alpha: 0.4)
                : Colors.white.withValues(alpha: 0.06),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(colors: colors),
              ),
              padding: const EdgeInsets.all(2),
              child: ClipOval(
                child: imageUrl == null
                    ? Center(
                        child: Text(
                          option.emoji,
                          style: const TextStyle(fontSize: 16),
                        ),
                      )
                    : Image.network(
                        imageUrl,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) =>
                            Center(
                          child: Text(
                            option.emoji,
                            style: const TextStyle(fontSize: 16),
                          ),
                        ),
                      ),
              ),
            ),
            const SizedBox(width: 10),
            Text(
              option.label(_isTurkish),
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: Colors.white.withValues(alpha: 0.88),
              ),
            ),
          ],
        ),
      ),
    );
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
      'subscriptions': _subscriptions.contains('none') ? <String>[] : _subscriptions,
      'country': country,
      'language': countryInfo?.language ?? (_isTurkish ? 'tr' : 'en'),
      'currency': countryInfo?.currency ?? detectedCurrency,
      'interestCategories': _interestCategories,
      'usageIntent': _usageIntent ?? 'all',
      'profession': _profession,
      'primaryCategory':
          _interestCategories.isNotEmpty ? _interestCategories.first : 'smartphones',
    };

    final result = await ref.read(authRepositoryProvider).updateUserProfile(
          uid: userId,
          quizData: payload,
        );

    if (!mounted) return;

    setState(() => _isSubmitting = false);

    switch (result) {
      case Success():
        ref.invalidate(userProfileProvider);
        ref.invalidate(homeFeedProvider);
        ref.invalidate(categoryCoversProvider);
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
    final heroCategory =
        _interestCategories.isNotEmpty ? _interestCategories.first : 'smartphones';
    final heroImage = covers[heroCategory];
    final topCategories = _interestCategories
        .take(3)
        .map(_labelForCategory)
        .join(' · ');
    final prioritySummary = _priorities
        .take(3)
        .map(_labelForPriority)
        .join(', ');

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
                                        errorBuilder: (context, error, stackTrace) =>
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
                                            Colors.black.withValues(alpha: 0.18),
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
                                      crossAxisAlignment: CrossAxisAlignment.start,
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
                                          _t(
                                            'Hazirsin',
                                            'You are ready',
                                          ),
                                          style: const TextStyle(
                                            fontSize: 32,
                                            fontWeight: FontWeight.w900,
                                            color: Colors.white,
                                          ),
                                        ),
                                        const SizedBox(height: 10),
                                        Text(
                                          _t(
                                            'Compair artik zevk profilini biliyor. Ana sayfa, AI onerileri ve kategori siralamasi buna gore tazelenecek.',
                                            'Compair now understands your taste profile. Home ranking and AI recommendations will refresh around it.',
                                          ),
                                          style: TextStyle(
                                            fontSize: 14,
                                            height: 1.5,
                                            color: Colors.white.withValues(alpha: 0.78),
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
                          _completionCard(
                            title: _t('Ana sayfa odagi', 'Home focus'),
                            body: topCategories.isEmpty
                                ? _t(
                                    'Kesif akisi davranis verin ile dengelenecek.',
                                    'Discovery will balance itself with your behavior data.',
                                  )
                                : topCategories,
                            color: AppTheme.brandCyan,
                            icon: Icons.home_rounded,
                          ),
                          const SizedBox(height: 12),
                          _completionCard(
                            title: _t('AI karar dili', 'AI decision language'),
                            body: prioritySummary.isEmpty
                                ? _t(
                                    'AI dengeli bir karar mantigi ile baslayacak.',
                                    'AI will start with a balanced decision model.',
                                  )
                                : prioritySummary,
                            color: AppTheme.neonPurple,
                            icon: Icons.psychology_alt_rounded,
                          ),
                          const SizedBox(height: 12),
                          _completionCard(
                            title: _t('Uyumluluk profili', 'Compatibility profile'),
                            body: _ecosystem == null
                                ? _t(
                                    'Uyumluluk davranis sinyalleri ile guclenecek.',
                                    'Compatibility will keep improving with behavior signals.',
                                  )
                                : _labelForEcosystem(_ecosystem!),
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

  String _labelForCategory(String value) {
    final option = _steps.first.options.firstWhere(
      (item) => item.value == value,
      orElse: () => _QuizOption(
        value: value,
        labelTr: value,
        labelEn: value,
        emoji: '✨',
      ),
    );
    return option.label(_isTurkish);
  }

  String _labelForPriority(String value) {
    final step = _steps.firstWhere((item) => item.field == 'priorities');
    final option = step.options.firstWhere(
      (item) => item.value == value,
      orElse: () => _QuizOption(
        value: value,
        labelTr: value,
        labelEn: value,
        emoji: '✨',
      ),
    );
    return option.label(_isTurkish);
  }

  String _labelForEcosystem(String value) {
    switch (value) {
      case 'apple':
        return _t('Apple odakli', 'Apple-first');
      case 'android':
        return _t('Android odakli', 'Android-first');
      case 'mixed':
        return _t('Karisik ekosistem', 'Mixed ecosystem');
      default:
        return value;
    }
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }
}

enum _StepType { single, multi, categories }

class _QuizStep {
  final String field;
  final String title;
  final String subtitle;
  final String algorithmHint;
  final _StepType type;
  final bool isRequired;
  final List<_QuizOption> options;

  const _QuizStep({
    required this.field,
    required this.title,
    required this.subtitle,
    required this.algorithmHint,
    required this.type,
    required this.isRequired,
    required this.options,
  });
}

class _QuizOption {
  final String value;
  final String labelTr;
  final String labelEn;
  final String emoji;
  final String? coverCategory;

  const _QuizOption({
    required this.value,
    required this.labelTr,
    required this.labelEn,
    required this.emoji,
    this.coverCategory,
  });

  String label(bool isTurkish) => isTurkish ? labelTr : labelEn;
}

class _HeaderButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;

  const _HeaderButton({
    required this.icon,
    required this.onTap,
  });

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
