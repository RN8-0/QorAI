/// Compair - Profile Quiz Screen
/// Blueprint Section 5.2, 5.3
///
/// REQUIRED QUESTIONS (cannot be skipped):
/// 1. Age group - Critical for profile algorithm
/// 2. Ecosystem - Apple/Android/Mixed
/// 3. Budget preference - Base for product recommendations
///
/// OPTIONAL QUESTIONS (can be skipped):
/// 4. Priorities (multiple choice)
/// 5. Current devices (multiple choice)
/// 6. Subscriptions (multiple choice)
/// 7. Country
/// 8. Interest categories (multiple choice)
/// 9. Usage intent
library;

import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:compair/core/constants.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/presentation/providers/providers.dart';
import 'package:compair/routing/router.dart';

class QuizScreen extends ConsumerStatefulWidget {
  const QuizScreen({super.key});

  @override
  ConsumerState<QuizScreen> createState() => _QuizScreenState();
}

class _QuizScreenState extends ConsumerState<QuizScreen>
    with SingleTickerProviderStateMixin {
  final PageController _pageController = PageController();
  int _currentPage = 0;
  bool _isSubmitting = false;
  bool _showCompletion = false;

  // Quiz answers
  String? _ageRange;
  String? _ecosystem;
  String? _budgetRange;
  final List<String> _priorities = [];
  final List<String> _currentDevices = [];
  final List<String> _subscriptions = [];
  String? _country;
  final List<String> _interestCategories = [];
  String? _usageIntent;
  String? _profession;

  late List<_QuizQuestion> _questions;
  bool _questionsInitialized = false;

  @override
  void initState() {
    super.initState();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_questionsInitialized) {
      _initQuestions();
      _questionsInitialized = true;
    }
  }

  void _initQuestions() {
    _questions = [
      // ═══════════════════════════════════════════════════════
      // REQUIRED QUESTIONS (First 3 questions - CANNOT BE SKIPPED)
      // ═══════════════════════════════════════════════════════

      // Question 1: Age Group (REQUIRED)
      _QuizQuestion(
        question: context.l10n?.quizAgeRange ?? 'What is your age range?',
        subtitle: context.l10n?.usedForPersonalizedRecs ?? 'Used for personalized recommendations',
        type: QuizQuestionType.single,
        isRequired: true,
        whyWeAsk:
            context.l10n?.whyAgeRange ?? 'Technology preferences and usage habits vary by age group. This helps us recommend the most suitable products for you.',
        options: [
          _QuizOption('13-17', context.l10n?.genAlphaZ ?? 'Gen Alpha/Z (13-17)', '🎮'),
          _QuizOption('18-24', context.l10n?.genZ ?? 'Gen Z (18-24)', '📱'),
          _QuizOption('25-34', context.l10n?.millennial ?? 'Millennial (25-34)', '💻'),
          _QuizOption('35-44', context.l10n?.xennial ?? 'Xennial (35-44)', '🏠'),
          _QuizOption('45-54', context.l10n?.genX ?? 'Gen X (45-54)', '📊'),
          _QuizOption('55+', context.l10n?.fiftyFivePlus ?? '55 and above', '🌟'),
        ],
        field: 'ageRange',
      ),

      // Question 2: Ecosystem (REQUIRED)
      _QuizQuestion(
        question: context.l10n?.quizEcosystem ?? 'Which ecosystem do you use?',
        subtitle: context.l10n?.importantForDeviceCompat ?? 'Important for device compatibility',
        type: QuizQuestionType.single,
        isRequired: true,
        whyWeAsk:
            context.l10n?.whyEcosystem ?? 'Apple and Android ecosystems work well with different products. We use this to suggest the most compatible devices.',
        options: [
          _QuizOption('apple', context.l10n?.apple ?? 'Apple', '🍎'),
          _QuizOption('android', context.l10n?.android ?? 'Android', '🤖'),
          _QuizOption('mixed', context.l10n?.mixed ?? 'Mixed', '🔄'),
        ],
        field: 'ecosystem',
      ),

      // Question 3: Budget (REQUIRED)
      _QuizQuestion(
        question: context.l10n?.quizBudget ?? 'What is your budget preference?',
        subtitle: context.l10n?.youCanChangeLater ?? 'You can change this later',
        type: QuizQuestionType.single,
        isRequired: true,
        whyWeAsk:
            context.l10n?.whyBudget ?? 'Your budget helps us recommend products within your preferred price range.',
        options: [
          _QuizOption('low', context.l10n?.budgetValue ?? 'Budget / Value', '💰'),
          _QuizOption('mid', context.l10n?.midRange ?? 'Mid-Range', '💎'),
          _QuizOption('high', context.l10n?.premium ?? 'Premium', '👑'),
          _QuizOption('any', context.l10n?.doesNotMatter ?? 'Does Not Matter', '🤷'),
        ],
        field: 'budgetRange',
      ),

      // ═══════════════════════════════════════════════════════
      // OPTIONAL QUESTIONS (Can be skipped)
      // ═══════════════════════════════════════════════════════

      // Question 4: Priorities
      _QuizQuestion(
        question: context.l10n?.quizPriorities ?? 'What are your priorities?',
        subtitle: context.l10n?.selectMultiple ?? 'Select multiple',
        type: QuizQuestionType.multi,
        isRequired: false,
        whyWeAsk:
            context.l10n?.whyPriorities ?? 'Knowing your priorities helps us understand what matters to you the most in our comparisons.',
        options: [
          _QuizOption('price', context.l10n?.price ?? 'Price', '💲'),
          _QuizOption('quality', context.l10n?.quality ?? 'Quality', '⭐'),
          _QuizOption('design', context.l10n?.design ?? 'Design', '🎨'),
          _QuizOption('ecosystem', context.l10n?.ecosystemFit ?? 'Ecosystem Fit', '🔗'),
          _QuizOption('performance', context.l10n?.performance ?? 'Performance', '⚡'),
          _QuizOption('durability', context.l10n?.durability ?? 'Durability', '🛡️'),
        ],
        field: 'priorities',
      ),

      // Question 5: Devices
      _QuizQuestion(
        question: context.l10n?.quizDevices ?? 'Which devices do you own?',
        subtitle: context.l10n?.selectMultiple ?? 'Select multiple',
        type: QuizQuestionType.multi,
        isRequired: false,
        whyWeAsk:
            context.l10n?.whyDevices ?? 'This allows us to consider compatibility when making new recommendations.',
        options: [
          _QuizOption('iphone', context.l10n?.iphone ?? 'iPhone', '📱'),
          _QuizOption('android_phone', context.l10n?.androidPhone ?? 'Android Phone', '📱'),
          _QuizOption('ipad', context.l10n?.ipad ?? 'iPad', '📱'),
          _QuizOption('android_tablet', context.l10n?.androidTablet ?? 'Android Tablet', '📱'),
          _QuizOption('mac', context.l10n?.mac ?? 'Mac', '💻'),
          _QuizOption('windows_pc', context.l10n?.windowsPc ?? 'Windows PC', '🖥️'),
          _QuizOption('linux', context.l10n?.linux ?? 'Linux', '🐧'),
          _QuizOption('smart_watch', context.l10n?.smartWatch ?? 'Smart Watch', '⌚'),
        ],
        field: 'currentDevices',
      ),

      // Question 6: Subscriptions
      _QuizQuestion(
        question: context.l10n?.quizSubscriptions ?? 'Which subscriptions do you have?',
        subtitle: context.l10n?.toAvoidRecommendingOwned ?? 'To avoid recommending what you already have',
        type: QuizQuestionType.multi,
        isRequired: false,
        whyWeAsk:
            context.l10n?.whySubscriptions ?? 'We will skip recommending what you already pay for and show you better alternatives.',
        options: [
          _QuizOption('netflix', 'Netflix', '🎬'),
          _QuizOption('spotify', 'Spotify', '🎵'),
          _QuizOption('youtube_premium', 'YouTube Premium', '▶️'),
          _QuizOption('apple_music', 'Apple Music', '🎵'),
          _QuizOption('disney_plus', 'Disney+', '🏰'),
          _QuizOption('icloud', 'iCloud', '☁️'),
          _QuizOption('google_one', 'Google One', '☁️'),
          _QuizOption('game_pass', 'Game Pass', '🎮'),
          _QuizOption('ps_plus', 'PlayStation Plus', '🎮'),
          _QuizOption('none', context.l10n?.none ?? 'None', '❌'),
        ],
        field: 'subscriptions',
      ),

      // Question 7: Country
      _QuizQuestion(
        question: context.l10n?.quizCountry ?? 'Which country are you in?',
        subtitle: context.l10n?.forPricingAndAvailability ?? 'For pricing and availability',
        type: QuizQuestionType.single,
        isRequired: false,
        whyWeAsk:
            context.l10n?.whyCountry ?? 'Prices and service availability vary by country. (Currently US Only)',
        options: [
          _QuizOption('US', context.l10n?.unitedStates ?? 'United States', '🇺🇸'),
        ],
        field: 'country',
      ),

      // Question 8: Product Categories (Spotify-style circle grid)
      _QuizQuestion(
        question: context.l10n?.quizProducts ?? 'What products interest you?',
        subtitle: context.l10n?.pickAtLeast3 ?? 'Pick at least 3 to personalize your feed',
        type: QuizQuestionType.multi,
        isRequired: false,
        whyWeAsk:
            context.l10n?.whyProducts ?? 'We\'ll show products from your favorite categories on the home screen and tailor recommendations to your interests.',
        options: [
          _QuizOption('smartphones', context.l10n?.smartphones ?? 'Smartphones', '📱'),
          _QuizOption('laptops', context.l10n?.laptops ?? 'Laptops', '💻'),
          _QuizOption('tablets', context.l10n?.tablets ?? 'Tablets', '📟'),
          _QuizOption('tvs', context.l10n?.tvs ?? 'TVs', '📺'),
          _QuizOption('monitors', context.l10n?.monitors ?? 'Monitors', '🖥️'),
          _QuizOption('cpus', context.l10n?.processors ?? 'Processors', '⚡'),
          _QuizOption('gpus', context.l10n?.graphicsCards ?? 'Graphics Cards', '🎮'),
          _QuizOption('headphones', context.l10n?.headphones ?? 'Headphones', '🎧'),
          _QuizOption('smartwatches', context.l10n?.smartwatches ?? 'Smartwatches', '⌚'),
          _QuizOption('cameras', context.l10n?.cameras ?? 'Cameras', '📷'),
          _QuizOption('consoles', context.l10n?.gaming ?? 'Gaming', '🕹️'),
          _QuizOption('speakers', context.l10n?.speakers ?? 'Speakers', '🔊'),
          _QuizOption('desktops', context.l10n?.desktops ?? 'Desktops', '🖥️'),
          _QuizOption('routers', context.l10n?.networking ?? 'Networking', '📡'),
          _QuizOption('drones', context.l10n?.drones ?? 'Drones', '🚁'),
          _QuizOption('robot-vacuums', context.l10n?.smartHome ?? 'Smart Home', '🤖'),
        ],
        field: 'interestCategories',
        useCircleGrid: true,
      ),

      // Question 9: Usage intent
      _QuizQuestion(
        question: context.l10n?.quizUsage ?? 'Why are you using Compair?',
        subtitle: context.l10n?.toOptimizeExperience ?? 'To optimize your experience',
        type: QuizQuestionType.single,
        isRequired: false,
        whyWeAsk:
            context.l10n?.whyUsage ?? 'This allows us to highlight the features that are most suitable to you.',
        options: [
          _QuizOption('research', context.l10n?.detailedResearch ?? 'Detailed Research', '🔍'),
          _QuizOption('quick_decision', context.l10n?.quickDecisions ?? 'Quick Decisions', '⚡'),
          _QuizOption('price_tracking', context.l10n?.priceTracking ?? 'Price Tracking', '📊'),
          _QuizOption('all', context.l10n?.everything ?? 'Everything', '🎯'),
        ],
        field: 'usageIntent',
      ),

      // Question 10: Profession
      _QuizQuestion(
        question: context.l10n?.quizProfession ?? 'What is your profession?',
        subtitle: context.l10n?.forSmarterAiRecs ?? 'For smarter AI recommendations',
        type: QuizQuestionType.single,
        isRequired: false,
        whyWeAsk:
            context.l10n?.whyProfession ?? 'Your profession helps us suggest the right products — an engineer has different needs than a student, designer, or manager.',
        options: [
          _QuizOption('student', context.l10n?.student ?? 'Student', '🎓'),
          _QuizOption('engineer', context.l10n?.engineerDev ?? 'Engineer / Developer', '⚙️'),
          _QuizOption('designer', context.l10n?.designerCreative ?? 'Designer / Creative', '🎨'),
          _QuizOption('manager', context.l10n?.businessManager ?? 'Business / Manager', '💼'),
          _QuizOption('healthcare', context.l10n?.healthcarePro ?? 'Healthcare Professional', '🏥'),
          _QuizOption('teacher', context.l10n?.educator ?? 'Educator', '📚'),
          _QuizOption('finance', context.l10n?.freelancer ?? 'Freelancer', '💰'),
          _QuizOption('other', context.l10n?.otherProfession ?? 'Other', '🌐'),
        ],
        field: 'profession',
      ),
    ];
  }

  bool get _isCurrentQuestionRequired =>
      _currentPage < _questions.length && _questions[_currentPage].isRequired;

  bool get _hasCurrentQuestionAnswer {
    if (_currentPage >= _questions.length) return false;
    final question = _questions[_currentPage];
    switch (question.field) {
      case 'ageRange':
        return _ageRange != null;
      case 'ecosystem':
        return _ecosystem != null;
      case 'budgetRange':
        return _budgetRange != null;
      case 'priorities':
        return _priorities.isNotEmpty;
      case 'currentDevices':
        return _currentDevices.isNotEmpty;
      case 'subscriptions':
        return _subscriptions.isNotEmpty;
      case 'country':
        return _country != null;
      case 'interestCategories':
        return _interestCategories.isNotEmpty;
      case 'usageIntent':
        return _usageIntent != null;
      case 'profession':
        return _profession != null;
      default:
        return false;
    }
  }

  void _selectOption(String field, String value) {
    setState(() {
      switch (field) {
        case 'ageRange':
          _ageRange = value;
          break;
        case 'ecosystem':
          _ecosystem = value;
          break;
        case 'budgetRange':
          _budgetRange = value;
          break;
        case 'country':
          _country = value;
          break;
        case 'usageIntent':
          _usageIntent = value;
          break;
        case 'profession':
          _profession = value;
          break;
      }
    });
  }

  void _toggleMultiOption(String field, String value) {
    setState(() {
      List<String> list;
      switch (field) {
        case 'priorities':
          list = _priorities;
          break;
        case 'currentDevices':
          list = _currentDevices;
          break;
        case 'subscriptions':
          list = _subscriptions;
          // If "None" is selected, clear others
          if (value == 'none') {
            list.clear();
            list.add('none');
            return;
          } else {
            list.remove('none');
          }
          break;
        case 'interestCategories':
          list = _interestCategories;
          break;
        default:
          return;
      }

      if (list.contains(value)) {
        list.remove(value);
      } else {
        list.add(value);
      }
    });
  }

  bool _isSelected(String field, String value) {
    switch (field) {
      case 'ageRange':
        return _ageRange == value;
      case 'ecosystem':
        return _ecosystem == value;
      case 'budgetRange':
        return _budgetRange == value;
      case 'priorities':
        return _priorities.contains(value);
      case 'currentDevices':
        return _currentDevices.contains(value);
      case 'subscriptions':
        return _subscriptions.contains(value);
      case 'country':
        return _country == value;
      case 'interestCategories':
        return _interestCategories.contains(value);
      case 'usageIntent':
        return _usageIntent == value;
      case 'profession':
        return _profession == value;
      default:
        return false;
    }
  }

  void _nextPage() {
    // Check answer for required questions
    if (_isCurrentQuestionRequired && !_hasCurrentQuestionAnswer) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(context.l10n?.youMustAnswerThis ?? 'You must answer this question'),
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppTheme.warning,
        ),
      );
      return;
    }

    if (_currentPage < _questions.length - 1) {
      _pageController.nextPage(
        duration: AppConstants.pageTransitionDuration,
        curve: Curves.easeInOut,
      );
    } else {
      _submitQuiz();
    }
  }

  void _skipQuestion() {
    if (_isCurrentQuestionRequired) {
      // Zorunlu sorular atlanamaz
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(context.l10n?.thisQuestionRequired ?? 'This question is required and cannot be skipped'),
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppTheme.error,
        ),
      );
      return;
    }

    if (_currentPage < _questions.length - 1) {
      _pageController.nextPage(
        duration: AppConstants.pageTransitionDuration,
        curve: Curves.easeInOut,
      );
    } else {
      _submitQuiz();
    }
  }

  Future<void> _submitQuiz() async {
    // Required field check
    if (_ageRange == null || _ecosystem == null || _budgetRange == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(context.l10n?.pleaseAnswerRequired ?? 'Please answer the required questions'),
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppTheme.error,
        ),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    final country = _country ?? 'TR';
    final countryInfo = SupportedCountries.countries[country];

    final quizData = {
      // Zorunlu alanlar
      'ageRange': _ageRange,
      'ecosystem': _ecosystem,
      'budgetRange': _budgetRange,
      // Opsiyonel alanlar
      'priorities': _priorities,
      'currentDevices': _currentDevices,
      'subscriptions':
          _subscriptions.contains('none') ? <String>[] : _subscriptions,
      'country': country,
      'language': countryInfo?.language ?? 'tr',
      'currency': countryInfo?.currency ?? 'TRY',
      'interestCategories': _interestCategories,
      'usageIntent': _usageIntent ?? 'all',
      'profession': _profession,
      // Primary category is now the first of interestCategories
      'primaryCategory':
          _interestCategories.isNotEmpty ? _interestCategories.first : 'tech',
    };

    final user = ref.read(authStateProvider).valueOrNull;
    if (user == null) {
      if (mounted) context.go(AppRoutes.login);
      return;
    }

    final result = await ref.read(authRepositoryProvider).updateUserProfile(
          uid: user.uid,
          quizData: quizData,
        );

    if (!mounted) return;
    setState(() => _isSubmitting = false);

    switch (result) {
      case Success():
        if (!mounted) return;
        setState(() => _showCompletion = true);
        return;
      case Failure(error: final error):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(context.l10n?.failedToSaveProfile(error.message) ?? 'Failed to save profile: ${error.message}'),
            behavior: SnackBarBehavior.floating,
          ),
        );
        context.go(AppRoutes.home);
    }
  }

  void _showWhyWeAsk(String reason) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          boxShadow: [
            BoxShadow(
              color: Colors.white.withValues(alpha: 0.08),
              blurRadius: 24,
              offset: const Offset(0, -8),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 20),
                decoration: BoxDecoration(
                  color: context.dividerColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFF1A150A), Color(0xFF1F180D)],
                    ),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Icon(
                    Icons.lightbulb_outline,
                    color: AppTheme.warning,
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  context.l10n?.whyWeAsk ?? 'Why we ask',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: context.textPrimary,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              reason,
              style: TextStyle(
                fontSize: 15,
                color: context.textTertiaryColor,
                height: 1.6,
              ),
            ),
            const SizedBox(height: 24),
            GestureDetector(
              onTap: () => Navigator.pop(context),
              child: Container(
                width: double.infinity,
                height: 48,
                decoration: BoxDecoration(
                  gradient: AppTheme.primaryGradient,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Center(
                  child: Text(
                    context.l10n?.gotIt ?? 'Got it',
                    style: TextStyle(
                      color: context.surfaceVariantColor,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  int _getMultiSelectCount(String field) {
    switch (field) {
      case 'priorities':
        return _priorities.length;
      case 'currentDevices':
        return _currentDevices.length;
      case 'subscriptions':
        return _subscriptions.length;
      case 'interestCategories':
        return _interestCategories.length;
      default:
        return 0;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_showCompletion) return _buildCompletionScreen();

    final progress = (_currentPage + 1) / _questions.length;
    final currentQuestion =
        _currentPage < _questions.length ? _questions[_currentPage] : null;

    final emojiGradients = [
      const [Color(0xFF0A0F1F), Color(0xFF0D1229)],
      const [Color(0xFF0A1A0F), Color(0xFF0D1F14)],
      const [Color(0xFF1A150A), Color(0xFF1F180D)],
      const [Color(0xFF1A0A14), Color(0xFF1F0D18)],
      const [Color(0xFF100A1A), Color(0xFF140D1F)],
      const [Color(0xFF0A141A), Color(0xFF0D181F)],
      const [Color(0xFF1A0A0A), Color(0xFF1F0D0D)],
      const [Color(0xFF1A0A0B), Color(0xFF1F0D0E)],
      const [Color(0xFF0A1A17), Color(0xFF0D1F1C)],
    ];

    return Scaffold(
      backgroundColor: context.surfaceColor,
      body: SafeArea(
        child: Column(
          children: [
            // ── Top Bar ──
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      if (_currentPage > 0)
                        GestureDetector(
                          onTap: () => _pageController.previousPage(
                            duration: AppConstants.pageTransitionDuration,
                            curve: Curves.easeInOut,
                          ),
                          child: ClipOval(
                            child: BackdropFilter(
                              filter:
                                  ImageFilter.blur(sigmaX: 10, sigmaY: 10),
                              child: Container(
                                width: 40,
                                height: 40,
                                decoration: BoxDecoration(
                                  color:
                                      context.textPrimary.withValues(alpha: 0.85),
                                  shape: BoxShape.circle,
                                  border: Border.all(
                                    color: context.surfaceVariantColor
                                        .withValues(alpha: 0.3),
                                  ),
                                ),
                                child: Icon(
                                  Icons.arrow_back_ios_new,
                                  size: 16,
                                  color: context.textPrimary,
                                ),
                              ),
                            ),
                          ),
                        )
                      else
                        const SizedBox(width: 40),
                      if (!_isCurrentQuestionRequired)
                        GestureDetector(
                          onTap: _skipQuestion,
                          child: Text(
                            context.l10n?.skip ?? 'Skip',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                              color: context.textSecondary,
                            ),
                          ),
                        )
                      else
                        const SizedBox(width: 40),
                    ],
                  ),
                  const SizedBox(height: 16),
                  TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0, end: progress),
                    duration: const Duration(milliseconds: 400),
                    curve: Curves.easeInOut,
                    builder: (context, value, _) {
                      return Container(
                        height: 6,
                        decoration: BoxDecoration(
                          color: context.surfaceVariantColor,
                          borderRadius: BorderRadius.circular(3),
                        ),
                        child: Align(
                          alignment: Alignment.centerLeft,
                          child: FractionallySizedBox(
                            widthFactor: value.clamp(0.0, 1.0),
                            child: ShaderMask(
                              shaderCallback: (bounds) =>
                                  const LinearGradient(
                                colors: [
                                  AppTheme.neonCyan,
                                  AppTheme.neonCyan,
                                ],
                              ).createShader(bounds),
                              child: Container(
                                decoration: BoxDecoration(
                                  color: context.surfaceVariantColor,
                                  borderRadius: BorderRadius.circular(3),
                                ),
                              ),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                  const SizedBox(height: 10),
                  Text(
                    context.l10n?.quizStepOf('${_currentPage + 1}', '${_questions.length}') ?? 'Step ${_currentPage + 1} of ${_questions.length}',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: context.textSecondary,
                    ),
                  ),
                ],
              ),
            ),

            // ── Questions PageView ──
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: _questions.length,
                onPageChanged: (index) =>
                    setState(() => _currentPage = index),
                itemBuilder: (context, index) {
                  final question = _questions[index];
                  final gradientColors = index < emojiGradients.length
                      ? emojiGradients[index]
                      : emojiGradients.last;
                  return _buildQuestionPage(question, gradientColors);
                },
              ),
            ),

            // ── Bottom: Why we ask + Continue ──
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
              child: Column(
                children: [
                  if (currentQuestion?.whyWeAsk != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: GestureDetector(
                        onTap: () =>
                            _showWhyWeAsk(currentQuestion!.whyWeAsk!),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.info_outline,
                                size: 14, color: AppTheme.neonCyan),
                            const SizedBox(width: 4),
                            Text(
                              context.l10n?.whyWeAsk ?? 'Why we ask',
                              style: const TextStyle(
                                fontSize: 12,
                                color: AppTheme.neonCyan,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  _buildContinueButton(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContinueButton() {
    final canContinue =
        !_isCurrentQuestionRequired || _hasCurrentQuestionAnswer;
    final isLastPage = _currentPage >= _questions.length - 1;

    return GestureDetector(
      onTap: _isSubmitting ? null : _nextPage,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        width: double.infinity,
        height: 56,
        decoration: BoxDecoration(
          gradient: canContinue ? AppTheme.primaryGradient : null,
          color: canContinue ? null : context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(16),
          boxShadow: canContinue ? AppTheme.primaryGlow : null,
        ),
        child: Center(
          child: _isSubmitting
              ? SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: context.surfaceVariantColor,
                  ),
                )
              : Text(
                  isLastPage ? (context.l10n?.createMyProfile ?? 'Create My Profile') : (context.l10n?.continueButton ?? 'Continue'),
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    color: canContinue
                        ? context.textPrimary
                        : context.textSecondary,
                  ),
                ),
        ),
      ),
    );
  }

  Widget _buildQuestionPage(
    _QuizQuestion question,
    List<Color> emojiGradientColors,
  ) {
    final isMulti = question.type == QuizQuestionType.multi;
    final multiCount =
        isMulti ? _getMultiSelectCount(question.field) : 0;
    final emoji = question.options.isNotEmpty
        ? question.options.first.emoji
        : '\u{1F4CB}';

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        children: [
          const SizedBox(height: 28),
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: emojiGradientColors),
              borderRadius: BorderRadius.circular(24),
            ),
            child: Center(
              child:
                  Text(emoji, style: const TextStyle(fontSize: 22)),
            ),
          ),
          const SizedBox(height: 20),
          Text(
            question.question,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w700,
              color: context.textPrimary,
              letterSpacing: -0.5,
              height: 1.2,
            ),
          ),
          if (question.subtitle != null) ...[
            const SizedBox(height: 8),
            Text(
              question.subtitle!,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                color: context.textTertiaryColor,
              ),
            ),
          ],
          const SizedBox(height: 24),
          if (isMulti && multiCount > 0)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 14, vertical: 6),
                decoration: BoxDecoration(
                  gradient: AppTheme.primaryGradient,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  '$multiCount selected',
                  style: TextStyle(
                    fontSize: 12,
                    color: context.surfaceVariantColor,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          Expanded(
            child: SingleChildScrollView(
              child: question.useCircleGrid
                  ? _buildCircleGrid(question)
                  : Column(
                      children: question.options.map((option) {
                        final selected =
                            _isSelected(question.field, option.value);
                        return _buildOptionCard(
                          option: option,
                          selected: selected,
                          isMulti: isMulti,
                          onTap: () {
                            if (isMulti) {
                              _toggleMultiOption(
                                  question.field, option.value);
                            } else {
                              _selectOption(question.field, option.value);
                            }
                          },
                        );
                      }).toList(),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Spotify-style Circle Grid for Category Selection ──────────────
  static const _circleColors = <String, List<Color>>{
    'smartphones': [AppTheme.neonCyan, Color(0xFF5856D6)],
    'laptops': [AppTheme.green500, AppTheme.emerald500],
    'tablets': [Color(0xFF5856D6), Color(0xFFAF52DE)],
    'tvs': [Color(0xFFFF6B35), AppTheme.amber500],
    'monitors': [Color(0xFF30B0C7), Color(0xFF32ADE6)],
    'cpus': [Color(0xFFFF2D55), Color(0xFFFF6482)],
    'gpus': [AppTheme.neonPurple, AppTheme.neonPurple],
    'headphones': [Color(0xFFFF375F), Color(0xFFFF6482)],
    'smartwatches': [Color(0xFF00C7BE), AppTheme.green500],
    'cameras': [AppTheme.amber500, Color(0xFFFFCC00)],
    'consoles': [Color(0xFF5856D6), AppTheme.neonCyan],
    'speakers': [Color(0xFFFF2D55), Color(0xFFFF6B35)],
    'desktops': [Color(0xFF8E8E93), Color(0xFF636366)],
    'routers': [AppTheme.emerald500, Color(0xFF00C7BE)],
    'drones': [Color(0xFF32ADE6), AppTheme.neonCyan],
    'robot-vacuums': [Color(0xFF00C7BE), Color(0xFF30B0C7)],
  };

  Widget _buildCircleGrid(_QuizQuestion question) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Wrap(
        spacing: 16,
        runSpacing: 20,
        alignment: WrapAlignment.center,
        children: question.options.map((option) {
          final selected = _isSelected(question.field, option.value);
          final colors = _circleColors[option.value] ?? [context.textTertiaryColor, context.textSecondary];
          return GestureDetector(
            onTap: () {
              HapticFeedback.lightImpact();
              _toggleMultiOption(question.field, option.value);
            },
            child: AnimatedScale(
              scale: selected ? 1.1 : 1.0,
              duration: const Duration(milliseconds: 250),
              curve: Curves.easeOutBack,
              child: SizedBox(
                width: 90,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 300),
                      curve: Curves.easeOutCubic,
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: selected
                            ? LinearGradient(
                                colors: colors,
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight)
                            : null,
                        color: selected ? null : context.surfaceVariantColor,
                        border: Border.all(
                          color: selected ? colors.first : context.dividerColor,
                          width: selected ? 3 : 1.5,
                        ),
                        boxShadow: selected
                            ? [BoxShadow(
                                color: colors.first.withValues(alpha: 0.35),
                                blurRadius: 16,
                                offset: const Offset(0, 4))]
                            : [],
                      ),
                      child: Center(
                        child: Text(option.emoji,
                            style: TextStyle(fontSize: selected ? 30 : 26)),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      option.label,
                      textAlign: TextAlign.center,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                        color: selected ? colors.first : context.textTertiaryColor,
                        height: 1.2,
                      ),
                    ),
                    if (selected)
                      Container(
                        margin: const EdgeInsets.only(top: 4),
                        width: 20, height: 20,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: LinearGradient(colors: colors),
                        ),
                        child: Icon(Icons.check_rounded,
                            color: context.surfaceVariantColor, size: 14),
                      ),
                  ],
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildOptionCard({
    required _QuizOption option,
    required bool selected,
    required bool isMulti,
    required VoidCallback onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedScale(
          scale: selected ? 1.02 : 1.0,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOutCubic,
          child: selected
              ? _buildSelectedOptionCard(option, isMulti)
              : _buildUnselectedOptionCard(option, isMulti),
        ),
      ),
    );
  }

  Widget _buildUnselectedOptionCard(_QuizOption option, bool isMulti) {
    return Container(
      height: 64,
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.white.withValues(alpha: 0.04),
            blurRadius: 2,
            offset: const Offset(0, 1),
          ),
          BoxShadow(
            color: Colors.white.withValues(alpha: 0.06),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
          BoxShadow(
            color: Colors.white.withValues(alpha: 0.04),
            blurRadius: 40,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: _buildOptionContent(option, false, isMulti),
    );
  }

  Widget _buildSelectedOptionCard(_QuizOption option, bool isMulti) {
    return Container(
      height: 64,
      decoration: BoxDecoration(
        gradient: AppTheme.primaryGradient,
        borderRadius: BorderRadius.circular(17),
      ),
      padding: const EdgeInsets.all(2),
      child: Container(
        decoration: BoxDecoration(
          color: context.surfaceVariantColor,
          borderRadius: BorderRadius.circular(15),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 14),
        child: _buildOptionContent(option, true, isMulti),
      ),
    );
  }

  Widget _buildOptionContent(
    _QuizOption option,
    bool selected,
    bool isMulti,
  ) {
    return Row(
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: selected
                ? AppTheme.neonCyan.withValues(alpha: 0.1)
                : context.surfaceColor,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Center(
            child: Text(option.emoji,
                style: const TextStyle(fontSize: 20)),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Text(
            option.label,
            style: TextStyle(
              fontSize: 16,
              fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
              color: context.textPrimary,
            ),
          ),
        ),
        isMulti
            ? _buildCheckboxIndicator(selected)
            : _buildRadioIndicator(selected),
      ],
    );
  }

  Widget _buildRadioIndicator(bool selected) {
    if (selected) {
      return Container(
        width: 22,
        height: 22,
        decoration: const BoxDecoration(
          gradient: AppTheme.primaryGradient,
          shape: BoxShape.circle,
        ),
        child:
            Icon(Icons.check, size: 14, color: context.surfaceVariantColor),
      );
    }
    return Container(
      width: 22,
      height: 22,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(
          color: context.dividerColor,
          width: 1.5,
        ),
      ),
    );
  }

  Widget _buildCheckboxIndicator(bool selected) {
    if (selected) {
      return Container(
        width: 22,
        height: 22,
        decoration: BoxDecoration(
          gradient: AppTheme.primaryGradient,
          borderRadius: BorderRadius.circular(6),
        ),
        child:
            Icon(Icons.check, size: 14, color: context.surfaceVariantColor),
      );
    }
    return Container(
      width: 22,
      height: 22,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: context.dividerColor,
          width: 1.5,
        ),
      ),
    );
  }

  Widget _buildCompletionScreen() {
    return Scaffold(
      backgroundColor: context.surfaceColor,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 40),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 80,
                  height: 80,
                  decoration: const BoxDecoration(
                    gradient: AppTheme.scoreGradient,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(Icons.check_rounded,
                      size: 40, color: context.surfaceVariantColor),
                ),
                const SizedBox(height: 32),
                ShaderMask(
                  shaderCallback: (bounds) =>
                      AppTheme.primaryGradient.createShader(bounds),
                  child: Text(
                    context.l10n?.youreAllSet ?? "You're All Set!",
                    style: TextStyle(
                      fontSize: 32,
                      fontWeight: FontWeight.w800,
                      color: context.surfaceVariantColor,
                      letterSpacing: -0.5,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  context.l10n?.personalizedFeedReady ?? 'Your personalized feed is ready',
                  style: TextStyle(
                    fontSize: 16,
                    color: context.textTertiaryColor,
                  ),
                ),
                const SizedBox(height: 40),
                GestureDetector(
                  onTap: () => context.go(AppRoutes.home),
                  child: Container(
                    width: double.infinity,
                    height: 56,
                    decoration: BoxDecoration(
                      gradient: AppTheme.primaryGradient,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: AppTheme.primaryGlow,
                    ),
                    child: Center(
                      child: Text(
                        context.l10n?.startExploring ?? 'Start Exploring \u2192',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: context.surfaceVariantColor,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }
}

// ─── Quiz Data Classes ───

enum QuizQuestionType { single, multi }

class _QuizQuestion {
  final String question;
  final String? subtitle;
  final QuizQuestionType type;
  final bool isRequired;
  final String? whyWeAsk;
  final List<_QuizOption> options;
  final String field;

  const _QuizQuestion({
    required this.question,
    this.subtitle,
    required this.type,
    required this.isRequired,
    this.whyWeAsk,
    required this.options,
    required this.field,
    this.useCircleGrid = false,
  });

  final bool useCircleGrid;
}

class _QuizOption {
  final String value;
  final String label;
  final String emoji;

  const _QuizOption(this.value, this.label, this.emoji);
}
