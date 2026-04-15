library;

import 'dart:ui';

import 'package:compair/core/constants.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/core/pb_client.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/domain/entities/user_entity.dart';
import 'package:compair/presentation/providers/providers.dart';
import 'package:compair/routing/router.dart';
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
      isRequired: false,
      options: _buildCurrentDeviceOptions(),
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
        'Kullanım amacı hızlı karar, detaylı araştırma ve fiyat odağı arasında denge kurar.',
        'Usage intent shifts emphasis between fast decisions, deep research, and price focus.',
      ),
      type: _StepType.single,
      isRequired: false,
      options: const [
        _QuizOption(
          value: 'research',
          labelTr: 'Detaylı Araştırma',
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
        'Kendine en yakın yaş aralığını seç',
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
      isRequired: false,
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
          value: 'youtube_music',
          labelTr: 'YouTube Music',
          labelEn: 'YouTube Music',
          emoji: '🎵',
          logoDomain: 'youtube.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'amazon_music',
          labelTr: 'Amazon Music',
          labelEn: 'Amazon Music',
          emoji: '🎵',
          logoDomain: 'amazon.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'tidal',
          labelTr: 'Tidal',
          labelEn: 'Tidal',
          emoji: '🎵',
          logoDomain: 'tidal.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'deezer',
          labelTr: 'Deezer',
          labelEn: 'Deezer',
          emoji: '🎵',
          logoDomain: 'deezer.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'hulu',
          labelTr: 'Hulu',
          labelEn: 'Hulu',
          emoji: '🎬',
          logoDomain: 'hulu.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'crunchyroll',
          labelTr: 'Crunchyroll',
          labelEn: 'Crunchyroll',
          emoji: '🎬',
          logoDomain: 'crunchyroll.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'mubi',
          labelTr: 'MUBI',
          labelEn: 'MUBI',
          emoji: '🎬',
          logoDomain: 'mubi.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'dropbox',
          labelTr: 'Dropbox',
          labelEn: 'Dropbox',
          emoji: '☁️',
          logoDomain: 'dropbox.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'onedrive',
          labelTr: 'OneDrive',
          labelEn: 'OneDrive',
          emoji: '☁️',
          logoDomain: 'onedrive.live.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'canva',
          labelTr: 'Canva',
          labelEn: 'Canva',
          emoji: '🎨',
          logoDomain: 'canva.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'slack',
          labelTr: 'Slack',
          labelEn: 'Slack',
          emoji: '💬',
          logoDomain: 'slack.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'zoom',
          labelTr: 'Zoom',
          labelEn: 'Zoom',
          emoji: '🎥',
          logoDomain: 'zoom.us',
          preferContain: true,
        ),
        _QuizOption(
          value: 'jira',
          labelTr: 'Jira',
          labelEn: 'Jira',
          emoji: '🧩',
          logoDomain: 'atlassian.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'grammarly',
          labelTr: 'Grammarly',
          labelEn: 'Grammarly',
          emoji: '✍️',
          logoDomain: 'grammarly.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'linkedin_premium',
          labelTr: 'LinkedIn Premium',
          labelEn: 'LinkedIn Premium',
          emoji: '💼',
          logoDomain: 'linkedin.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'udemy',
          labelTr: 'Udemy',
          labelEn: 'Udemy',
          emoji: '🎓',
          logoDomain: 'udemy.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'coursera',
          labelTr: 'Coursera',
          labelEn: 'Coursera',
          emoji: '🎓',
          logoDomain: 'coursera.org',
          preferContain: true,
        ),
        _QuizOption(
          value: 'duolingo',
          labelTr: 'Duolingo',
          labelEn: 'Duolingo',
          emoji: '🎓',
          logoDomain: 'duolingo.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'claude',
          labelTr: 'Claude Pro',
          labelEn: 'Claude Pro',
          emoji: '🤖',
          logoDomain: 'anthropic.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'gemini',
          labelTr: 'Gemini Advanced',
          labelEn: 'Gemini Advanced',
          emoji: '🤖',
          logoDomain: 'gemini.google.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'perplexity',
          labelTr: 'Perplexity Pro',
          labelEn: 'Perplexity Pro',
          emoji: '🤖',
          logoDomain: 'perplexity.ai',
          preferContain: true,
        ),
        _QuizOption(
          value: 'midjourney',
          labelTr: 'Midjourney',
          labelEn: 'Midjourney',
          emoji: '🤖',
          logoDomain: 'midjourney.com',
          preferContain: true,
        ),
        _QuizOption(
          value: 'elevenlabs',
          labelTr: 'ElevenLabs',
          labelEn: 'ElevenLabs',
          emoji: '🤖',
          logoDomain: 'elevenlabs.io',
          preferContain: true,
        ),
        _QuizOption(
          value: 'nordvpn',
          labelTr: 'NordVPN',
          labelEn: 'NordVPN',
          emoji: '🔐',
          logoDomain: 'nordvpn.com',
          preferContain: true,
        ),
        _QuizOption(
          value: '1password',
          labelTr: '1Password',
          labelEn: '1Password',
          emoji: '🔐',
          logoDomain: '1password.com',
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
    'icloud': 'assets/icons/quiz_logos/icloud.svg',
    'google_one': 'assets/icons/quiz_logos/google_one.png',
    'microsoft_365': 'assets/icons/quiz_logos/microsoft_365.png',
    'adobe_cc': 'assets/icons/quiz_logos/adobe_cc.png',
    'figma': 'assets/icons/quiz_logos/figma.svg',
    'notion': 'assets/icons/quiz_logos/notion.svg',
    'chatgpt_plus': 'assets/icons/quiz_logos/chatgpt_plus.png',
    'github_copilot': 'assets/icons/quiz_logos/github_copilot.svg',
    'game_pass': 'assets/icons/quiz_logos/game_pass.png',
    'ps_plus': 'assets/icons/quiz_logos/ps_plus.svg',
    'switch_online': 'assets/icons/quiz_logos/switch_online.png',
    'geforce_now': 'assets/icons/quiz_logos/geforce_now.svg',
    'twitch': 'assets/icons/quiz_logos/twitch.svg',
    'youtube_music': 'assets/icons/quiz_logos/youtube_music.svg',
    'amazon_music': 'assets/icons/quiz_logos/amazon_music.png',
    'tidal': 'assets/icons/quiz_logos/tidal.svg',
    'deezer': 'assets/icons/quiz_logos/deezer.svg',
    'hulu': 'assets/icons/quiz_logos/hulu.png',
    'crunchyroll': 'assets/icons/quiz_logos/crunchyroll.svg',
    'mubi': 'assets/icons/quiz_logos/mubi.svg',
    'dropbox': 'assets/icons/quiz_logos/dropbox.svg',
    'onedrive': 'assets/icons/quiz_logos/onedrive.png',
    'canva': 'assets/icons/quiz_logos/canva.png',
    'slack': 'assets/icons/quiz_logos/slack.png',
    'zoom': 'assets/icons/quiz_logos/zoom.svg',
    'jira': 'assets/icons/quiz_logos/jira.svg',
    'grammarly': 'assets/icons/quiz_logos/grammarly.svg',
    'linkedin_premium': 'assets/icons/quiz_logos/linkedin_premium.png',
    'udemy': 'assets/icons/quiz_logos/udemy.svg',
    'coursera': 'assets/icons/quiz_logos/coursera.svg',
    'duolingo': 'assets/icons/quiz_logos/duolingo.svg',
    'claude': 'assets/icons/quiz_logos/claude.svg',
    'gemini': 'assets/icons/quiz_logos/gemini.svg',
    'perplexity': 'assets/icons/quiz_logos/perplexity.svg',
    'midjourney': 'assets/icons/quiz_logos/midjourney.png',
    'elevenlabs': 'assets/icons/quiz_logos/elevenlabs.svg',
    'nordvpn': 'assets/icons/quiz_logos/nordvpn.svg',
    '1password': 'assets/icons/quiz_logos/1password.svg',
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
                )
              else
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 7,
                  ),
                  decoration: BoxDecoration(
                    color: _surfaceStrongColor,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    _t('Zorunlu', 'Required'),
                    style: TextStyle(
                      fontSize: 11,
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
            child: FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: canContinue
                    ? AppTheme.brandCyan
                    : _buttonDisabledBg,
                foregroundColor: canContinue
                    ? _selectionCheckColor
                    : _buttonDisabledFg,
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
                              ? _t('Profilimi oluştur', 'Create my profile')
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
                          Container(
                            width: double.infinity,
                            height: 280,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(32),
                              gradient: LinearGradient(
                                colors: _isDarkTheme
                                    ? const [
                                        Color(0xFF102033),
                                        Color(0xFF0A1624),
                                      ]
                                    : const [Colors.white, Color(0xFFEAF4FF)],
                              ),
                            ),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(32),
                              child: Stack(
                                children: [
                                  if (heroImage != null)
                                    Positioned.fill(
                                      child: CachedNetworkImage(
                                        imageUrl: heroImage,
                                        fit: BoxFit.cover,
                                        errorWidget: (context, url, error) =>
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
                                            if (_isDarkTheme)
                                              Colors.black.withValues(
                                                alpha: 0.18,
                                              )
                                            else
                                              Colors.white.withValues(
                                                alpha: 0.10,
                                              ),
                                            if (_isDarkTheme)
                                              Colors.black.withValues(
                                                alpha: 0.2,
                                              )
                                            else
                                              Colors.white.withValues(
                                                alpha: 0.48,
                                              ),
                                            if (_isDarkTheme)
                                              const Color(0xFF07101A)
                                            else
                                              AppTheme.backgroundLightMode,
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
                                          style: TextStyle(
                                            fontSize: 30,
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
                            title: _t('Keşif DNA', 'Discovery DNA'),
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
                      onPressed: () => context.go(AppRoutes.home),
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

  String _buildProfileHeadline() {
    final leadingCategory = _interestCategories.isNotEmpty
        ? _labelForCategory(_interestCategories.first)
        : _t('Tech keşfi', 'Tech discovery');
    return _t('$leadingCategory için hazırsın', 'Ready for $leadingCategory');
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
      'Compair artık $descriptor sinyallerini ana sayfa, AI açıklamaları ve kategori sıralamalarına yansıtacak.',
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
        'Keşif akışı davranış verilerinle birlikte dengeli şekilde şekillenecek.',
        'Discovery will balance itself progressively with your behavior data.',
      );
    }

    final priorities = _priorities.take(3).map(_labelForPriority).toList();
    final categoryText = categories.join(', ');
    if (priorities.isEmpty) {
      return _t(
        'Ana odak: $categoryText. Ana sayfa bu alanları daha yukarı taşıyacak.',
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
        ? _t('Karışık kurulum', 'Mixed setup')
        : _labelForEcosystem(_ecosystem!);
    final devices = _currentDevices.take(4).map(_labelForOwnedDevice).toList();
    if (devices.isEmpty) {
      return _t(
        '$ecosystem sinyali baz alınacak; cihaz bağlantıları kullandıkça netleşecek.',
        '$ecosystem will be the base signal; device compatibility will sharpen as you use the app.',
      );
    }

    return _t(
      '$ecosystem kurulumu algılandı. Aktif cihazlar: ${devices.join(', ')}.',
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
      '$profession profili, $usage modu ve $age davranış bandı birlikte kullanılacak.',
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
