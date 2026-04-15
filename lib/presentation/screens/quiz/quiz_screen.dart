/// Compair - Profile Quiz Screen
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
  bool _questionsInitialized = false;
  bool _didPrefill = false;

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

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_questionsInitialized) return;
    _initQuestions();
    _questionsInitialized = true;
  }

  void _initQuestions() {
    _questions = [
      _QuizQuestion(
        question: context.l10n?.quizAgeRange ?? 'What is your age range?',
        subtitle:
            context.l10n?.usedForPersonalizedRecs ??
            'Used to tune your recommendation style and shopping pace.',
        type: QuizQuestionType.single,
        isRequired: true,
        whyWeAsk:
            context.l10n?.whyAgeRange ??
            'Technology preferences and usage habits vary by age group. This helps us recommend the most suitable products for you.',
        field: 'ageRange',
        options: [
          _QuizOption('13-17', context.l10n?.genAlphaZ ?? 'Gen Alpha/Z (13-17)', '🎮'),
          _QuizOption('18-24', context.l10n?.genZ ?? 'Gen Z (18-24)', '📱'),
          _QuizOption('25-34', context.l10n?.millennial ?? 'Millennial (25-34)', '💻'),
          _QuizOption('35-44', context.l10n?.xennial ?? 'Xennial (35-44)', '🏠'),
          _QuizOption('45-54', context.l10n?.genX ?? 'Gen X (45-54)', '📊'),
          _QuizOption('55+', context.l10n?.fiftyFivePlus ?? '55 and above', '🌟'),
        ],
      ),
      _QuizQuestion(
        question: context.l10n?.quizEcosystem ?? 'Which ecosystem do you use?',
        subtitle:
            context.l10n?.importantForDeviceCompat ??
            'This drives compatibility, accessory fit, and cross-device suggestions.',
        type: QuizQuestionType.single,
        isRequired: true,
        whyWeAsk:
            context.l10n?.whyEcosystem ??
            'Apple and Android ecosystems work well with different products. We use this to suggest the most compatible devices.',
        field: 'ecosystem',
        options: [
          _QuizOption('apple', context.l10n?.apple ?? 'Apple', '🍎'),
          _QuizOption('android', context.l10n?.android ?? 'Android', '🤖'),
          _QuizOption('mixed', context.l10n?.mixed ?? 'Mixed', '🔄'),
        ],
      ),
      _QuizQuestion(
        question: context.l10n?.quizBudget ?? 'What is your budget preference?',
        subtitle:
            context.l10n?.youCanChangeLater ??
            'We use this to decide when to show flagship picks versus value winners.',
        type: QuizQuestionType.single,
        isRequired: true,
        whyWeAsk:
            context.l10n?.whyBudget ??
            'Your budget helps us recommend products within your preferred price range.',
        field: 'budgetRange',
        options: [
          _QuizOption('low', context.l10n?.budgetValue ?? 'Budget / Value', '💰'),
          _QuizOption('mid', context.l10n?.midRange ?? 'Mid-Range', '💎'),
          _QuizOption('high', context.l10n?.premium ?? 'Premium', '👑'),
          _QuizOption('any', context.l10n?.doesNotMatter ?? 'Does Not Matter', '🤷'),
        ],
      ),
      _QuizQuestion(
        question: context.l10n?.quizPriorities ?? 'What matters most when you compare?',
        subtitle:
            context.l10n?.selectMultiple ??
            'Choose the signals Compair should amplify first.',
        type: QuizQuestionType.multi,
        isRequired: false,
        whyWeAsk:
            context.l10n?.whyPriorities ??
            'Knowing your priorities helps us understand what matters to you the most in our comparisons.',
        field: 'priorities',
        options: [
          _QuizOption('price', context.l10n?.price ?? 'Price', '💲'),
          _QuizOption('quality', context.l10n?.quality ?? 'Quality', '⭐'),
          _QuizOption('design', context.l10n?.design ?? 'Design', '🎨'),
          _QuizOption('ecosystem', context.l10n?.ecosystemFit ?? 'Ecosystem Fit', '🔗'),
          _QuizOption('performance', context.l10n?.performance ?? 'Performance', '⚡'),
          _QuizOption('durability', context.l10n?.durability ?? 'Durability', '🛡️'),
        ],
      ),
      _QuizQuestion(
        question: context.l10n?.quizDevices ?? 'What do you already use every day?',
        subtitle:
            context.l10n?.selectMultiple ??
            'We use this to improve continuity and avoid awkward recommendations.',
        type: QuizQuestionType.multi,
        isRequired: false,
        whyWeAsk:
            context.l10n?.whyDevices ??
            'This allows us to consider compatibility when making new recommendations.',
        field: 'currentDevices',
        options: [
          _QuizOption('iphone', context.l10n?.iphone ?? 'iPhone', '📱'),
          _QuizOption('android_phone', context.l10n?.androidPhone ?? 'Android Phone', '📱'),
          _QuizOption('ipad', context.l10n?.ipad ?? 'iPad', '📟'),
          _QuizOption('android_tablet', context.l10n?.androidTablet ?? 'Android Tablet', '📟'),
          _QuizOption('mac', context.l10n?.mac ?? 'Mac', '💻'),
          _QuizOption('windows_pc', context.l10n?.windowsPc ?? 'Windows PC', '🖥️'),
          _QuizOption('linux', context.l10n?.linux ?? 'Linux', '🐧'),
          _QuizOption('smart_watch', context.l10n?.smartWatch ?? 'Smart Watch', '⌚'),
        ],
      ),
      _QuizQuestion(
        question: context.l10n?.quizSubscriptions ?? 'Which services are already in your stack?',
        subtitle:
            context.l10n?.toAvoidRecommendingOwned ??
            'This helps Compair avoid redundant subscription advice.',
        type: QuizQuestionType.multi,
        isRequired: false,
        whyWeAsk:
            context.l10n?.whySubscriptions ??
            'We will skip recommending what you already pay for and show you better alternatives.',
        field: 'subscriptions',
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
      ),
      _QuizQuestion(
        question: context.l10n?.quizCountry ?? 'Where should pricing and stock be optimized for?',
        subtitle:
            context.l10n?.forPricingAndAvailability ??
            'Regional pricing, availability, and subscription coverage can change recommendations.',
        type: QuizQuestionType.single,
        isRequired: false,
        whyWeAsk:
            context.l10n?.whyCountry ??
            'Prices and service availability vary by country.',
        field: 'country',
        options: [
          _QuizOption('US', context.l10n?.unitedStates ?? 'United States', '🇺🇸'),
        ],
      ),
      _QuizQuestion(
        question: context.l10n?.quizProducts ?? 'What should dominate your home feed?',
        subtitle:
            context.l10n?.pickAtLeast3 ??
            'Choose a few categories so Compair can build a taste graph around real products.',
        type: QuizQuestionType.multi,
        isRequired: false,
        whyWeAsk:
            context.l10n?.whyProducts ??
            'We use these categories to rank your home feed, personalize suggestions, and bias AI toward what you actually care about.',
        field: 'interestCategories',
        useVisualGrid: true,
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
      ),
      _QuizQuestion(
        question: context.l10n?.quizUsage ?? 'How do you want to use Compair?',
        subtitle:
            context.l10n?.toOptimizeExperience ??
            'This affects whether we push deeper analysis, faster decisions, or price-led signals.',
        type: QuizQuestionType.single,
        isRequired: false,
        whyWeAsk:
            context.l10n?.whyUsage ??
            'This allows us to highlight the features that are most suitable to you.',
        field: 'usageIntent',
        options: [
          _QuizOption('research', context.l10n?.detailedResearch ?? 'Detailed Research', '🔍'),
          _QuizOption('quick_decision', context.l10n?.quickDecisions ?? 'Quick Decisions', '⚡'),
          _QuizOption('price_tracking', context.l10n?.priceTracking ?? 'Price Tracking', '📊'),
          _QuizOption('all', context.l10n?.everything ?? 'Everything', '🎯'),
        ],
      ),
      _QuizQuestion(
        question: context.l10n?.quizProfession ?? 'Which perspective should Compair optimize around?',
        subtitle:
            context.l10n?.forSmarterAiRecs ??
            'Profession gives the algorithm better context for fit and productivity needs.',
        type: QuizQuestionType.single,
        isRequired: false,
        whyWeAsk:
            context.l10n?.whyProfession ??
            'Your profession helps us suggest the right products — an engineer has different needs than a student, designer, or manager.',
        field: 'profession',
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
      ),
    ];
  }

  bool get _isCurrentQuestionRequired =>
      _currentPage < _questions.length && _questions[_currentPage].isRequired;

  bool get _hasCurrentQuestionAnswer {
    if (_currentPage >= _questions.length) return false;
    switch (_questions[_currentPage].field) {
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

  void _prefillFromUser(UserEntity user) {
    if (_didPrefill || !mounted) return;

    setState(() {
      _ageRange ??= user.ageRange;
      _ecosystem ??= user.ecosystem.isEmpty ? null : user.ecosystem;
      _budgetRange ??= user.budgetRange.isEmpty ? null : user.budgetRange;
      _country ??= user.country.isEmpty ? null : user.country;
      _usageIntent ??= user.usageIntent;
      _profession ??= user.profession;

      if (_priorities.isEmpty) {
        _priorities.addAll(_dedupe(user.priorities));
      }
      if (_currentDevices.isEmpty) {
        _currentDevices.addAll(_dedupe(user.currentDevices));
      }
      if (_subscriptions.isEmpty) {
        _subscriptions.addAll(_dedupe(user.subscriptions));
      }
      if (_interestCategories.isEmpty) {
        _interestCategories.addAll(_dedupe(user.interestCategories));
      }
      _didPrefill = true;
    });
  }

  List<String> _dedupe(List<String> values) {
    final result = <String>[];
    for (final value in values) {
      if (value.trim().isEmpty || result.contains(value)) continue;
      result.add(value);
    }
    return result;
  }

  void _selectOption(String field, String value) {
    HapticFeedback.selectionClick();
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
    HapticFeedback.lightImpact();
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
          if (value == 'none') {
            list
              ..clear()
              ..add('none');
            return;
          }
          list.remove('none');
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
    if (_isCurrentQuestionRequired && !_hasCurrentQuestionAnswer) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            context.l10n?.youMustAnswerThis ?? 'You must answer this question',
          ),
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppTheme.warning,
        ),
      );
      return;
    }

    if (_currentPage < _questions.length - 1) {
      _pageController.nextPage(
        duration: AppConstants.pageTransitionDuration,
        curve: Curves.easeOutCubic,
      );
    } else {
      _submitQuiz();
    }
  }

  void _skipQuestion() {
    if (_isCurrentQuestionRequired) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            context.l10n?.thisQuestionRequired ??
                'This question is required and cannot be skipped',
          ),
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppTheme.error,
        ),
      );
      return;
    }

    if (_currentPage < _questions.length - 1) {
      _pageController.nextPage(
        duration: AppConstants.pageTransitionDuration,
        curve: Curves.easeOutCubic,
      );
    } else {
      _submitQuiz();
    }
  }

  Future<void> _submitQuiz() async {
    if (_ageRange == null || _ecosystem == null || _budgetRange == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            context.l10n?.pleaseAnswerRequired ??
                'Please answer the required questions',
          ),
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppTheme.error,
        ),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    final country = _country ?? ref.read(selectedCountryProvider);
    final countryInfo = SupportedCountries.countries[country];
    final detectedCurrency = ref.read(currencyProvider);

    final quizData = <String, dynamic>{
      'ageRange': _ageRange,
      'ecosystem': _ecosystem,
      'budgetRange': _budgetRange,
      'priorities': _priorities,
      'currentDevices': _currentDevices,
      'subscriptions':
          _subscriptions.contains('none') ? <String>[] : _subscriptions,
      'country': country,
      'language': countryInfo?.language ?? 'en',
      'currency': countryInfo?.currency ?? detectedCurrency,
      'interestCategories': _interestCategories,
      'usageIntent': _usageIntent ?? 'all',
      'profession': _profession,
      'primaryCategory':
          _interestCategories.isNotEmpty ? _interestCategories.first : 'tech',
    };

    final user = ref.read(authStateProvider).valueOrNull;
    if (user == null) {
      if (mounted) context.go(AppRoutes.login);
      return;
    }

    final result = await ref.read(authRepositoryProvider).updateUserProfile(
      uid: user,
      quizData: quizData,
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
            content: Text(
              context.l10n?.failedToSaveProfile(error.message) ??
                  'Failed to save profile: ${error.message}',
            ),
            behavior: SnackBarBehavior.floating,
          ),
        );
        context.go(AppRoutes.home);
    }
  }

  void _showWhyWeAsk(String reason) {
    final palette = _paletteForQuestion(_questions[_currentPage]);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: context.surfaceColor,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
            border: Border.all(
              color: palette.primary.withValues(alpha: 0.24),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.28),
                blurRadius: 30,
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
                  width: 44,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 20),
                  decoration: BoxDecoration(
                    color: context.dividerColor,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              ),
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          palette.primary.withValues(alpha: 0.2),
                          palette.secondary.withValues(alpha: 0.16),
                        ],
                      ),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Icon(
                      palette.icon,
                      color: palette.primary,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Text(
                      context.l10n?.whyWeAsk ?? 'Why we ask',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: context.textPrimary,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Text(
                reason,
                style: TextStyle(
                  fontSize: 15,
                  height: 1.6,
                  color: context.textSecondary,
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: palette.primary,
                    foregroundColor: Colors.black,
                    padding: const EdgeInsets.symmetric(vertical: 15),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  onPressed: () => Navigator.of(context).pop(),
                  child: Text(context.l10n?.gotIt ?? 'Got it'),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final userAsync = ref.watch(userProfileProvider);
    final coversAsync = ref.watch(categoryCoversProvider);

    final user = userAsync.valueOrNull;
    if (user != null && !_didPrefill) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _prefillFromUser(user);
      });
    }

    if (_showCompletion) {
      return _buildCompletionScreen(coversAsync.valueOrNull ?? const {});
    }

    final progress = (_currentPage + 1) / _questions.length;
    final currentQuestion = _questions[_currentPage];
    final palette = _paletteForQuestion(currentQuestion);
    final covers = coversAsync.valueOrNull ?? const <String, String>{};

    return Scaffold(
      backgroundColor: context.surfaceColor,
      body: Stack(
        children: [
          _buildBackdrop(palette),
          SafeArea(
            child: Column(
              children: [
                _buildHeader(progress, palette),
                Expanded(
                  child: PageView.builder(
                    controller: _pageController,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: _questions.length,
                    onPageChanged: (index) {
                      setState(() => _currentPage = index);
                    },
                    itemBuilder: (context, index) {
                      return _buildQuestionPage(
                        _questions[index],
                        _paletteForQuestion(_questions[index]),
                        covers,
                      );
                    },
                  ),
                ),
                _buildFooter(currentQuestion, palette),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBackdrop(_QuestionPalette palette) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            context.surfaceColor,
            palette.primary.withValues(alpha: 0.08),
            context.surfaceColor,
          ],
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            top: -80,
            right: -40,
            child: _buildBlurOrb(palette.primary, 180),
          ),
          Positioned(
            top: 220,
            left: -60,
            child: _buildBlurOrb(palette.secondary, 160),
          ),
          Positioned(
            bottom: -70,
            right: 40,
            child: _buildBlurOrb(AppTheme.brandBlue, 220),
          ),
        ],
      ),
    );
  }

  Widget _buildBlurOrb(Color color, double size) {
    return ImageFiltered(
      imageFilter: ImageFilter.blur(sigmaX: 55, sigmaY: 55),
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: color.withValues(alpha: 0.16),
        ),
      ),
    );
  }

  Widget _buildHeader(double progress, _QuestionPalette palette) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 8),
      child: Column(
        children: [
          Row(
            children: [
              _RoundIconButton(
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
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Compair Taste Profile',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.3,
                        color: palette.primary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      context.l10n?.quizStepOf(
                            '${_currentPage + 1}',
                            '${_questions.length}',
                          ) ??
                          'Step ${_currentPage + 1} of ${_questions.length}',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: context.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              if (!_isCurrentQuestionRequired)
                TextButton(
                  onPressed: _skipQuestion,
                  child: Text(
                    context.l10n?.skip ?? 'Skip',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: context.textSecondary,
                    ),
                  ),
                )
              else
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: AppTheme.warning.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(99),
                  ),
                  child: Text(
                    'Required',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.warning,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 14),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 6,
              backgroundColor: context.surfaceVariantColor,
              valueColor: AlwaysStoppedAnimation<Color>(palette.primary),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFooter(_QuizQuestion currentQuestion, _QuestionPalette palette) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 18),
      child: Column(
        children: [
          if (currentQuestion.whyWeAsk != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: InkWell(
                borderRadius: BorderRadius.circular(99),
                onTap: () => _showWhyWeAsk(currentQuestion.whyWeAsk!),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 8,
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.info_outline_rounded,
                        size: 14,
                        color: palette.primary,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        context.l10n?.whyWeAsk ?? 'Why we ask',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: palette.primary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          _buildContinueButton(palette),
        ],
      ),
    );
  }

  Widget _buildContinueButton(_QuestionPalette palette) {
    final canContinue = !_isCurrentQuestionRequired || _hasCurrentQuestionAnswer;
    final isLastPage = _currentPage >= _questions.length - 1;

    return AnimatedOpacity(
      duration: const Duration(milliseconds: 180),
      opacity: _isSubmitting ? 0.86 : 1,
      child: InkWell(
        borderRadius: BorderRadius.circular(24),
        onTap: _isSubmitting ? null : _nextPage,
        child: Ink(
          height: 62,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(24),
            gradient: canContinue
                ? LinearGradient(
                    colors: [palette.primary, palette.secondary],
                  )
                : null,
            color: canContinue ? null : context.surfaceVariantColor,
            boxShadow: canContinue
                ? [
                    BoxShadow(
                      color: palette.primary.withValues(alpha: 0.28),
                      blurRadius: 20,
                      offset: const Offset(0, 8),
                    ),
                  ]
                : null,
          ),
          child: Center(
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
                        isLastPage
                            ? 'Save my Compair profile'
                            : (context.l10n?.continueButton ?? 'Continue'),
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: canContinue
                              ? Colors.black
                              : context.textSecondary,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Icon(
                        isLastPage
                            ? Icons.auto_awesome_rounded
                            : Icons.arrow_forward_rounded,
                        color: canContinue ? Colors.black : context.textSecondary,
                      ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }

  Widget _buildQuestionPage(
    _QuizQuestion question,
    _QuestionPalette palette,
    Map<String, String> covers,
  ) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
      child: SingleChildScrollView(
        physics: const BouncingScrollPhysics(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildHeroCard(question, palette, covers),
            const SizedBox(height: 18),
            _buildSelectionSummary(question, palette),
            const SizedBox(height: 14),
            if (question.useVisualGrid)
              _buildVisualGrid(question, palette, covers)
            else
              ...question.options.map(
                (option) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _buildOptionCard(
                    question: question,
                    option: option,
                    palette: palette,
                  ),
                ),
              ),
            const SizedBox(height: 10),
            _buildAlgorithmNote(question, palette),
            const SizedBox(height: 18),
          ],
        ),
      ),
    );
  }

  Widget _buildHeroCard(
    _QuizQuestion question,
    _QuestionPalette palette,
    Map<String, String> covers,
  ) {
    final heroImage = _heroImageForQuestion(question, covers);

    return Container(
      constraints: const BoxConstraints(minHeight: 214),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.16),
            blurRadius: 30,
            offset: const Offset(0, 18),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(28),
        child: Stack(
          children: [
            Positioned.fill(
              child: Container(color: context.surfaceVariantColor),
            ),
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
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      Colors.black.withValues(alpha: heroImage == null ? 0.0 : 0.18),
                      palette.primary.withValues(alpha: 0.26),
                      context.surfaceColor.withValues(alpha: 0.96),
                    ],
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(22),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _buildPill(
                        icon: palette.icon,
                        label: _questionSectionTitle(question),
                        color: palette.primary,
                      ),
                      _buildPill(
                        icon: Icons.hub_rounded,
                        label: _questionSignalLabel(question),
                        color: palette.secondary,
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Text(
                    question.question,
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w900,
                      height: 1.06,
                      letterSpacing: -0.8,
                      color: context.textPrimary,
                    ),
                  ),
                  if (question.subtitle != null) ...[
                    const SizedBox(height: 10),
                    Text(
                      question.subtitle!,
                      style: TextStyle(
                        fontSize: 14,
                        height: 1.45,
                        color: context.textSecondary,
                      ),
                    ),
                  ],
                  const SizedBox(height: 18),
                  Row(
                    children: [
                      _HeroMetric(
                        label: 'Home',
                        value: _homeMetricPreview(question.field),
                      ),
                      const SizedBox(width: 10),
                      _HeroMetric(
                        label: 'AI',
                        value: _aiMetricPreview(question.field),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPill({
    required IconData icon,
    required String label,
    required Color color,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSelectionSummary(
    _QuizQuestion question,
    _QuestionPalette palette,
  ) {
    final labels = _selectedLabels(question);
    final isMulti = question.type == QuizQuestionType.multi;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor.withValues(alpha: 0.82),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(
          color: palette.primary.withValues(alpha: 0.12),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                isMulti ? Icons.layers_rounded : Icons.adjust_rounded,
                size: 18,
                color: palette.primary,
              ),
              const SizedBox(width: 8),
              Text(
                labels.isEmpty
                    ? (isMulti
                        ? 'Select the signals you want Compair to learn.'
                        : 'Choose one option to continue.')
                    : (isMulti
                        ? '${labels.length} selected'
                        : 'Current selection'),
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: context.textPrimary,
                ),
              ),
            ],
          ),
          if (labels.isNotEmpty) ...[
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: labels
                  .take(question.useVisualGrid ? 6 : 4)
                  .map(
                    (label) => Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 7,
                      ),
                      decoration: BoxDecoration(
                        color: palette.primary.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(99),
                      ),
                      child: Text(
                        label,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: palette.primary,
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildOptionCard({
    required _QuizQuestion question,
    required _QuizOption option,
    required _QuestionPalette palette,
  }) {
    final isMulti = question.type == QuizQuestionType.multi;
    final selected = _isSelected(question.field, option.value);
    final accent = _accentForOption(question.field, option.value, palette);
    final caption = _captionForOption(question.field, option.value);

    return InkWell(
      borderRadius: BorderRadius.circular(24),
      onTap: () {
        if (isMulti) {
          _toggleMultiOption(question.field, option.value);
        } else {
          _selectOption(question.field, option.value);
        }
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          border: Border.all(
            color: selected
                ? accent.withValues(alpha: 0.5)
                : Colors.white.withValues(alpha: 0.06),
            width: selected ? 1.6 : 1,
          ),
          gradient: selected
              ? LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    accent.withValues(alpha: 0.18),
                    accent.withValues(alpha: 0.06),
                  ],
                )
              : null,
          color: selected ? null : context.surfaceVariantColor.withValues(alpha: 0.92),
          boxShadow: [
            BoxShadow(
              color: accent.withValues(alpha: selected ? 0.16 : 0.06),
              blurRadius: selected ? 20 : 12,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: accent.withValues(alpha: selected ? 0.18 : 0.1),
                borderRadius: BorderRadius.circular(18),
              ),
              alignment: Alignment.center,
              child: Text(option.emoji, style: const TextStyle(fontSize: 24)),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    option.label,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: context.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    caption,
                    style: TextStyle(
                      fontSize: 13,
                      height: 1.35,
                      color: context.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 10),
            _buildSelectionIndicator(isMulti: isMulti, selected: selected, accent: accent),
          ],
        ),
      ),
    );
  }

  Widget _buildSelectionIndicator({
    required bool isMulti,
    required bool selected,
    required Color accent,
  }) {
    if (!selected) {
      return Container(
        width: isMulti ? 24 : 22,
        height: isMulti ? 24 : 22,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(isMulti ? 8 : 22),
          border: Border.all(
            color: Colors.white.withValues(alpha: 0.22),
            width: 1.4,
          ),
        ),
      );
    }

    return Container(
      width: isMulti ? 24 : 22,
      height: isMulti ? 24 : 22,
      decoration: BoxDecoration(
        color: accent,
        borderRadius: BorderRadius.circular(isMulti ? 8 : 22),
      ),
      alignment: Alignment.center,
      child: const Icon(Icons.check_rounded, color: Colors.black, size: 16),
    );
  }

  Widget _buildVisualGrid(
    _QuizQuestion question,
    _QuestionPalette palette,
    Map<String, String> covers,
  ) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = (constraints.maxWidth - 12) / 2;
        return Wrap(
          spacing: 12,
          runSpacing: 12,
          children: question.options.map((option) {
            final selected = _isSelected(question.field, option.value);
            final imageUrl = covers[option.value];
            final accent = _accentForOption(question.field, option.value, palette);

            return SizedBox(
              width: width,
              child: InkWell(
                borderRadius: BorderRadius.circular(24),
                onTap: () => _toggleMultiOption(question.field, option.value),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 220),
                  height: 136,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(
                      color: selected
                          ? accent.withValues(alpha: 0.62)
                          : Colors.white.withValues(alpha: 0.08),
                      width: selected ? 2 : 1,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: accent.withValues(alpha: selected ? 0.22 : 0.08),
                        blurRadius: selected ? 20 : 14,
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(24),
                    child: Stack(
                      children: [
                        Positioned.fill(
                          child: Container(color: context.surfaceVariantColor),
                        ),
                        if (imageUrl != null)
                          Positioned.fill(
                            child: Image.network(
                              imageUrl,
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
                                  accent.withValues(alpha: imageUrl == null ? 0.28 : 0.08),
                                  Colors.black.withValues(alpha: 0.18),
                                  Colors.black.withValues(alpha: 0.76),
                                ],
                              ),
                            ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Align(
                                alignment: Alignment.topRight,
                                child: Container(
                                  width: 30,
                                  height: 30,
                                  decoration: BoxDecoration(
                                    color: selected
                                        ? accent
                                        : Colors.black.withValues(alpha: 0.28),
                                    shape: BoxShape.circle,
                                    border: Border.all(
                                      color: Colors.white.withValues(alpha: 0.18),
                                    ),
                                  ),
                                  child: Icon(
                                    selected
                                        ? Icons.check_rounded
                                        : Icons.add_rounded,
                                    color: selected ? Colors.black : Colors.white,
                                    size: 18,
                                  ),
                                ),
                              ),
                              const Spacer(),
                              Text(
                                option.label,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w800,
                                  height: 1.1,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                _categoryCardCaption(option.value),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.82),
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          }).toList(),
        );
      },
    );
  }

  Widget _buildAlgorithmNote(
    _QuizQuestion question,
    _QuestionPalette palette,
  ) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        color: palette.secondary.withValues(alpha: 0.08),
        border: Border.all(color: palette.secondary.withValues(alpha: 0.16)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: palette.secondary.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(Icons.auto_awesome_rounded, color: palette.secondary),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Algorithm impact',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: context.textPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  _algorithmImpactCopy(question.field),
                  style: TextStyle(
                    fontSize: 13,
                    height: 1.45,
                    color: context.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCompletionScreen(Map<String, String> covers) {
    final primaryCategory = _interestCategories.isNotEmpty
        ? _interestCategories.first
        : 'smartphones';
    final heroImage = covers[primaryCategory];
    final prioritizedCategories = _interestCategories
        .take(3)
        .map((category) => _optionLabel('interestCategories', category))
        .join(' • ');
    final aiPriorityText = _priorities
        .take(3)
        .map((priority) => _optionLabel('priorities', priority))
        .join(', ');
    final currentStackText = _currentDevices
        .take(3)
        .map((device) => _optionLabel('currentDevices', device))
        .join(', ');
    final palette = _paletteForQuestion(
      _questions.firstWhere(
        (q) => q.field == 'interestCategories',
        orElse: () => _questions.first,
      ),
    );

    return Scaffold(
      backgroundColor: context.surfaceColor,
      body: Stack(
        children: [
          _buildBackdrop(palette),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
              child: Column(
                children: [
                  Expanded(
                    child: SingleChildScrollView(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: double.infinity,
                            constraints: const BoxConstraints(minHeight: 260),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(30),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.08),
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black.withValues(alpha: 0.16),
                                  blurRadius: 28,
                                  offset: const Offset(0, 20),
                                ),
                              ],
                            ),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(30),
                              child: Stack(
                                children: [
                                  Positioned.fill(
                                    child: Container(
                                      color: context.surfaceVariantColor,
                                    ),
                                  ),
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
                                            palette.primary.withValues(alpha: 0.16),
                                            Colors.black.withValues(alpha: 0.12),
                                            context.surfaceColor,
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
                                          decoration: BoxDecoration(
                                            shape: BoxShape.circle,
                                            color: palette.primary,
                                          ),
                                          alignment: Alignment.center,
                                          child: const Icon(
                                            Icons.check_rounded,
                                            color: Colors.black,
                                            size: 30,
                                          ),
                                        ),
                                        const SizedBox(height: 18),
                                        Text(
                                          context.l10n?.youreAllSet ??
                                              "You're all set",
                                          style: TextStyle(
                                            fontSize: 30,
                                            fontWeight: FontWeight.w900,
                                            height: 1.05,
                                            letterSpacing: -0.9,
                                            color: context.textPrimary,
                                          ),
                                        ),
                                        const SizedBox(height: 10),
                                        Text(
                                          'Compair now has enough signal to reshape your home feed, sharpen AI guidance, and rank products around your real priorities.',
                                          style: TextStyle(
                                            fontSize: 15,
                                            height: 1.5,
                                            color: context.textSecondary,
                                          ),
                                        ),
                                        const SizedBox(height: 18),
                                        Wrap(
                                          spacing: 8,
                                          runSpacing: 8,
                                          children: [
                                            if (_ecosystem != null)
                                              _buildCompletionChip(
                                                _optionLabel('ecosystem', _ecosystem!),
                                              ),
                                            if (_budgetRange != null)
                                              _buildCompletionChip(
                                                _optionLabel('budgetRange', _budgetRange!),
                                              ),
                                            if (_profession != null)
                                              _buildCompletionChip(
                                                _optionLabel('profession', _profession!),
                                              ),
                                            if (_interestCategories.isNotEmpty)
                                              _buildCompletionChip(
                                                _optionLabel(
                                                  'interestCategories',
                                                  _interestCategories.first,
                                                ),
                                              ),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 18),
                          _buildCompletionInsight(
                            icon: Icons.home_rounded,
                            title: 'Home feed',
                            subtitle: _interestCategories.isEmpty
                                ? 'Trending tech mix with behavior-based reordering.'
                                : '$prioritizedCategories will be prioritized first.',
                            color: AppTheme.brandCyan,
                          ),
                          const SizedBox(height: 12),
                          _buildCompletionInsight(
                            icon: Icons.psychology_alt_rounded,
                            title: 'AI compare guidance',
                            subtitle: _priorities.isEmpty
                                ? 'Balanced advice tuned by ecosystem and budget.'
                                : 'AI will bias toward $aiPriorityText when explaining winners.',
                            color: AppTheme.neonPurple,
                          ),
                          const SizedBox(height: 12),
                          _buildCompletionInsight(
                            icon: Icons.tune_rounded,
                            title: 'Recommendation profile',
                            subtitle: _currentDevices.isEmpty
                                ? 'New picks will stay broad until your activity adds more signal.'
                                : 'Compatibility will respect your current stack: $currentStackText.',
                            color: AppTheme.green500,
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      style: FilledButton.styleFrom(
                        backgroundColor: palette.primary,
                        foregroundColor: Colors.black,
                        padding: const EdgeInsets.symmetric(vertical: 18),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(22),
                        ),
                      ),
                      onPressed: () => context.go(AppRoutes.home),
                      child: Text(
                        context.l10n?.startExploring ?? 'Start exploring',
                        style: const TextStyle(fontWeight: FontWeight.w800),
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

  Widget _buildCompletionChip(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(99),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: context.textPrimary,
        ),
      ),
    );
  }

  Widget _buildCompletionInsight({
    required IconData icon,
    required String title,
    required String subtitle,
    required Color color,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: color.withValues(alpha: 0.18)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(16),
            ),
            alignment: Alignment.center,
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
                    color: context.textPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 13,
                    height: 1.45,
                    color: context.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  _QuestionPalette _paletteForQuestion(_QuizQuestion question) {
    switch (question.field) {
      case 'ageRange':
        return const _QuestionPalette(
          primary: Color(0xFF7C3AED),
          secondary: Color(0xFFA855F7),
          icon: Icons.timeline_rounded,
        );
      case 'ecosystem':
        return const _QuestionPalette(
          primary: AppTheme.brandCyan,
          secondary: AppTheme.brandBlue,
          icon: Icons.devices_rounded,
        );
      case 'budgetRange':
        return const _QuestionPalette(
          primary: Color(0xFFFFB020),
          secondary: Color(0xFFFF7A18),
          icon: Icons.account_balance_wallet_rounded,
        );
      case 'priorities':
        return const _QuestionPalette(
          primary: Color(0xFF14B8A6),
          secondary: Color(0xFF22C55E),
          icon: Icons.auto_graph_rounded,
        );
      case 'currentDevices':
        return const _QuestionPalette(
          primary: Color(0xFF60A5FA),
          secondary: Color(0xFF22D3EE),
          icon: Icons.memory_rounded,
        );
      case 'subscriptions':
        return const _QuestionPalette(
          primary: Color(0xFF22C55E),
          secondary: Color(0xFF86EFAC),
          icon: Icons.subscriptions_rounded,
        );
      case 'country':
        return const _QuestionPalette(
          primary: Color(0xFFF97316),
          secondary: Color(0xFFFB7185),
          icon: Icons.public_rounded,
        );
      case 'interestCategories':
        return const _QuestionPalette(
          primary: AppTheme.brandCyan,
          secondary: AppTheme.neonPurple,
          icon: Icons.grid_view_rounded,
        );
      case 'usageIntent':
        return const _QuestionPalette(
          primary: Color(0xFFF43F5E),
          secondary: Color(0xFFFB7185),
          icon: Icons.rocket_launch_rounded,
        );
      case 'profession':
        return const _QuestionPalette(
          primary: Color(0xFF38BDF8),
          secondary: Color(0xFF818CF8),
          icon: Icons.work_rounded,
        );
      default:
        return const _QuestionPalette(
          primary: AppTheme.brandCyan,
          secondary: AppTheme.brandBlue,
          icon: Icons.auto_awesome_rounded,
        );
    }
  }

  String _questionSectionTitle(_QuizQuestion question) {
    switch (question.field) {
      case 'ageRange':
        return 'Behavior';
      case 'ecosystem':
        return 'Compatibility';
      case 'budgetRange':
        return 'Price fit';
      case 'priorities':
        return 'Decision style';
      case 'currentDevices':
        return 'Current stack';
      case 'subscriptions':
        return 'Service graph';
      case 'country':
        return 'Region';
      case 'interestCategories':
        return 'Feed DNA';
      case 'usageIntent':
        return 'Intent';
      case 'profession':
        return 'Persona';
      default:
        return 'Profile';
    }
  }

  String _questionSignalLabel(_QuizQuestion question) {
    switch (question.field) {
      case 'interestCategories':
        return 'Drives home ranking';
      case 'priorities':
        return 'Refines compare scoring';
      case 'ecosystem':
        return 'Improves fit signals';
      case 'budgetRange':
        return 'Controls price bands';
      default:
        return 'Shapes recommendations';
    }
  }

  String _homeMetricPreview(String field) {
    switch (field) {
      case 'interestCategories':
        return 'Priority sections';
      case 'ecosystem':
        return 'Accessory fit';
      case 'budgetRange':
        return 'Value vs flagship';
      case 'currentDevices':
        return 'Cross-device picks';
      default:
        return 'Personalized order';
    }
  }

  String _aiMetricPreview(String field) {
    switch (field) {
      case 'priorities':
        return 'Better winner logic';
      case 'profession':
        return 'Context-aware advice';
      case 'usageIntent':
        return 'Faster guidance';
      default:
        return 'Sharper explanations';
    }
  }

  String _algorithmImpactCopy(String field) {
    switch (field) {
      case 'ageRange':
        return 'Compair adjusts explanation depth, shortlist style, and discovery pacing using your age-range signal.';
      case 'ecosystem':
        return 'This feeds compatibility scoring so recommendations stay coherent with your existing device world.';
      case 'budgetRange':
        return 'Your budget signal helps the ranking engine separate flagship flex picks from value-heavy winners.';
      case 'priorities':
        return 'These priorities become the algorithmic weights behind compare guidance and product fit scoring.';
      case 'currentDevices':
        return 'Current devices strengthen ecosystem affinity and reduce mismatched recommendations.';
      case 'subscriptions':
        return 'Subscription data prevents repetitive suggestions and helps AI surface adjacent, more useful alternatives.';
      case 'country':
        return 'Region improves pricing relevance, currency display, and availability-sensitive ranking.';
      case 'interestCategories':
        return 'Selected categories feed directly into home priority order and category-level recommendation boosts.';
      case 'usageIntent':
        return 'Intent changes how aggressively Compair emphasizes research depth, speed, or price monitoring.';
      case 'profession':
        return 'Profession gives the persona model better context for productivity, workflow, and recommendation fit.';
      default:
        return 'This answer improves how Compair personalizes product discovery and AI guidance.';
    }
  }

  String? _heroImageForQuestion(
    _QuizQuestion question,
    Map<String, String> covers,
  ) {
    if (question.field == 'interestCategories' && _interestCategories.isNotEmpty) {
      return covers[_interestCategories.first];
    }

    final categoryKey = switch (question.field) {
      'ecosystem' => 'smartphones',
      'budgetRange' => 'laptops',
      'priorities' => 'smartphones',
      'currentDevices' => 'desktops',
      'subscriptions' => 'headphones',
      'country' => 'smartphones',
      'interestCategories' => 'smartphones',
      'usageIntent' => 'monitors',
      'profession' => 'laptops',
      _ => 'smartphones',
    };

    return covers[categoryKey];
  }

  List<String> _selectedLabels(_QuizQuestion question) {
    switch (question.field) {
      case 'ageRange':
        return _ageRange == null ? const [] : [_optionLabel('ageRange', _ageRange!)];
      case 'ecosystem':
        return _ecosystem == null
            ? const []
            : [_optionLabel('ecosystem', _ecosystem!)];
      case 'budgetRange':
        return _budgetRange == null
            ? const []
            : [_optionLabel('budgetRange', _budgetRange!)];
      case 'priorities':
        return _priorities.map((v) => _optionLabel('priorities', v)).toList();
      case 'currentDevices':
        return _currentDevices
            .map((v) => _optionLabel('currentDevices', v))
            .toList();
      case 'subscriptions':
        return _subscriptions
            .map((v) => _optionLabel('subscriptions', v))
            .toList();
      case 'country':
        return _country == null ? const [] : [_optionLabel('country', _country!)];
      case 'interestCategories':
        return _interestCategories
            .map((v) => _optionLabel('interestCategories', v))
            .toList();
      case 'usageIntent':
        return _usageIntent == null
            ? const []
            : [_optionLabel('usageIntent', _usageIntent!)];
      case 'profession':
        return _profession == null
            ? const []
            : [_optionLabel('profession', _profession!)];
      default:
        return const [];
    }
  }

  String _optionLabel(String field, String value) {
    final question = _questions.firstWhere(
      (q) => q.field == field,
      orElse: () => _questions.first,
    );
    for (final option in question.options) {
      if (option.value == value) return option.label;
    }
    return value;
  }

  String _captionForOption(String field, String value) {
    const captions = <String, String>{
      'ageRange:13-17': 'Fast, trend-driven picks with stronger gaming and mobile bias.',
      'ageRange:18-24': 'Balanced between style, performance, and ecosystem momentum.',
      'ageRange:25-34': 'Productivity-first with strong value versus flagship trade-offs.',
      'ageRange:35-44': 'Practical recommendations with stability and long-term value.',
      'ageRange:45-54': 'Less noise, more confidence and reliable ownership value.',
      'ageRange:55+': 'Simple, trustworthy picks with easy-to-understand guidance.',
      'ecosystem:apple': 'Bias suggestions toward Apple-friendly products and accessory fit.',
      'ecosystem:android': 'Favor Android flexibility, value, and ecosystem breadth.',
      'ecosystem:mixed': 'Keep recommendations neutral and interoperability-friendly.',
      'budgetRange:low': 'Surface the smartest value picks first.',
      'budgetRange:mid': 'Balance performance, longevity, and price.',
      'budgetRange:high': 'Push stronger premium options and best-in-class upgrades.',
      'budgetRange:any': 'Keep the engine wide open for the best overall fit.',
      'priorities:price': 'Compair will reward smarter value and price/performance wins.',
      'priorities:quality': 'Build quality and trust rise in the ranking.',
      'priorities:design': 'Industrial design and aesthetics get more weight.',
      'priorities:ecosystem': 'Compatibility and continuity move closer to the top.',
      'priorities:performance': 'Raw power and benchmark strength matter more.',
      'priorities:durability': 'Longevity and ownership confidence get boosted.',
      'usageIntent:research': 'More detail, context, and deeper product reasoning.',
      'usageIntent:quick_decision': 'Shorter, faster recommendations with clearer winners.',
      'usageIntent:price_tracking': 'Focus more on value shifts and price-sensitive picks.',
      'usageIntent:all': 'Keep the full Compair experience balanced.',
      'profession:student': 'Portable, value-led, and versatile picks get favored.',
      'profession:engineer': 'Performance, compatibility, and workstation fit go up.',
      'profession:designer': 'Displays, design quality, and creative workflows matter more.',
      'profession:manager': 'Reliable, polished, and time-saving choices get prioritized.',
      'profession:healthcare': 'Clarity, battery, mobility, and trust grow in weight.',
      'profession:teacher': 'Practical, shareable, and easy-to-manage products rise.',
      'profession:finance': 'Efficiency, polish, and productivity-focused gear gets boosted.',
      'profession:other': 'Keep the persona model broad while behavior fills the gaps.',
    };

    return captions['$field:$value'] ??
        'Compair will use this signal to refine ranking, home feed ordering, and AI explanations.';
  }

  String _categoryCardCaption(String value) {
    const captions = <String, String>{
      'smartphones': 'Daily drivers, cameras, and flagship battles.',
      'laptops': 'Work, study, gaming, and creator picks.',
      'tablets': 'Portable productivity and media choices.',
      'tvs': 'Living-room performance and entertainment upgrades.',
      'monitors': 'Desk setups, refresh rates, and color quality.',
      'cpus': 'Build planning and raw compute performance.',
      'gpus': 'Gaming, rendering, and upgrade-heavy hardware picks.',
      'headphones': 'Audio quality, ANC, and commuting comfort.',
      'smartwatches': 'Health tracking and ecosystem accessories.',
      'cameras': 'Photo, video, and creator-focused kits.',
      'consoles': 'Gaming hardware, bundles, and ecosystem plays.',
      'speakers': 'Room-filling sound and compact audio gear.',
      'desktops': 'Prebuilt systems and power-user setups.',
      'routers': 'Networking speed, stability, and smart home backbone.',
      'drones': 'Aerial capture and enthusiast gear.',
      'robot-vacuums': 'Automation and practical smart-home upgrades.',
    };
    return captions[value] ?? 'Add this to your priority feed.';
  }

  Color _accentForOption(String field, String value, _QuestionPalette palette) {
    const accents = <String, Color>{
      'ecosystem:apple': Color(0xFF93C5FD),
      'ecosystem:android': Color(0xFF4ADE80),
      'ecosystem:mixed': Color(0xFFC084FC),
      'budgetRange:low': Color(0xFFFBBF24),
      'budgetRange:mid': Color(0xFF60A5FA),
      'budgetRange:high': Color(0xFFF472B6),
      'budgetRange:any': Color(0xFF22D3EE),
      'interestCategories:smartphones': AppTheme.brandCyan,
      'interestCategories:laptops': Color(0xFF22C55E),
      'interestCategories:tablets': Color(0xFF8B5CF6),
      'interestCategories:tvs': Color(0xFFFB7185),
      'interestCategories:monitors': Color(0xFF38BDF8),
      'interestCategories:cpus': Color(0xFFFF6B35),
      'interestCategories:gpus': Color(0xFFB517FF),
      'interestCategories:headphones': Color(0xFFF43F5E),
      'interestCategories:smartwatches': Color(0xFF14B8A6),
      'interestCategories:cameras': Color(0xFFF59E0B),
      'interestCategories:consoles': Color(0xFF6366F1),
      'interestCategories:speakers': Color(0xFFEF4444),
      'interestCategories:desktops': Color(0xFF94A3B8),
      'interestCategories:routers': Color(0xFF10B981),
      'interestCategories:drones': Color(0xFF0EA5E9),
      'interestCategories:robot-vacuums': Color(0xFF06B6D4),
      'subscriptions:spotify': Color(0xFF1ED760),
      'subscriptions:netflix': Color(0xFFE50914),
    };

    return accents['$field:$value'] ?? palette.primary;
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }
}

enum QuizQuestionType { single, multi }

class _QuizQuestion {
  final String question;
  final String? subtitle;
  final QuizQuestionType type;
  final bool isRequired;
  final String? whyWeAsk;
  final List<_QuizOption> options;
  final String field;
  final bool useVisualGrid;

  const _QuizQuestion({
    required this.question,
    this.subtitle,
    required this.type,
    required this.isRequired,
    this.whyWeAsk,
    required this.options,
    required this.field,
    this.useVisualGrid = false,
  });
}

class _QuizOption {
  final String value;
  final String label;
  final String emoji;

  const _QuizOption(this.value, this.label, this.emoji);
}

class _QuestionPalette {
  final Color primary;
  final Color secondary;
  final IconData icon;

  const _QuestionPalette({
    required this.primary,
    required this.secondary,
    required this.icon,
  });
}

class _RoundIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;

  const _RoundIconButton({
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: Ink(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: context.surfaceVariantColor.withValues(alpha: 0.9),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        ),
        child: Icon(icon, size: 18, color: context.textPrimary),
      ),
    );
  }
}

class _HeroMetric extends StatelessWidget {
  final String label;
  final String value;

  const _HeroMetric({
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.06),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: context.textTertiaryColor,
              ),
            ),
            const SizedBox(height: 5),
            Text(
              value,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: context.textPrimary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
