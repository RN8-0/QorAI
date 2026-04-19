/// Compair - Link Paste Screen (AI Quiz-Enhanced Analysis)
///
/// Flow: Paste URL -> AI validates product -> Generates quiz -> User answers ->
/// Enhanced compatibility score with detailed breakdown.
library;

import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:compair/core/theme.dart';
import 'package:compair/core/errors.dart';
import 'package:compair/domain/entities/ai_entities.dart';
import 'package:compair/domain/entities/user_entity.dart';
import 'package:compair/presentation/providers/providers.dart';
import 'package:compair/presentation/widgets/glass_container.dart';
import 'package:compair/presentation/widgets/gradient_button.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:compair/presentation/screens/link_paste/link_analysis_history_screen.dart';
import 'package:compair/core/constants.dart';
import 'package:compair/presentation/widgets/paywall_sheet.dart';
import 'package:compair/presentation/widgets/animated_gradient_input_shell.dart';

// ── Part files ──
part 'widgets/quiz_widgets.dart';
part 'widgets/enhanced_result_widget.dart';
part 'widgets/multi_compare_widget.dart';
part 'widgets/result_detail_widgets.dart';

bool _isTurkishLinkLocale(BuildContext context) =>
    Localizations.localeOf(context).languageCode.toLowerCase() == 'tr';

String _linkText(
  BuildContext context, {
  required String tr,
  required String en,
}) {
  return _isTurkishLinkLocale(context) ? tr : en;
}

class LinkPasteScreen extends ConsumerStatefulWidget {
  const LinkPasteScreen({super.key});

  @override
  ConsumerState<LinkPasteScreen> createState() => _LinkPasteScreenState();
}

class _LinkPasteScreenState extends ConsumerState<LinkPasteScreen>
    with TickerProviderStateMixin {
  // === TAB SYSTEM ===
  late TabController _tabController;

  // === SINGLE ANALYSIS TAB ===
  final TextEditingController _singleUrlController = TextEditingController();
  final FocusNode _singleFocusNode = FocusNode();
  String? _detectedClipboardUrl; // Legacy - kept for old widgets
  String? _lastSavedSingleHistoryKey;
  String? _lastSavedCompareHistoryKey;
  bool _singleSubmitInFlight = false;

  // === COMPARE TAB (up to 4 links) ===
  final List<TextEditingController> _compareControllers = List.generate(
    4,
    (_) => TextEditingController(),
  );
  final List<FocusNode> _compareFocusNodes = List.generate(
    4,
    (_) => FocusNode(),
  );
  int _visibleCompareFields = 2; // Start with 2, expandable to 4
  // Compare state now managed by compareAnalysisProvider (survives navigation)

  // Legacy multi-link state (kept for backward compat)
  List<String> _multiLinkUrls = [];
  List<EnhancedAnalysisResult> _multiLinkResults = [];
  int _currentMultiLinkIndex = 0;
  bool get _isMultiLinkFlow => _multiLinkUrls.length > 1;
  bool get _multiLinkComplete =>
      _isMultiLinkFlow && _multiLinkResults.length >= _multiLinkUrls.length;

  // Keep single-controller alias for backward compat in analysis
  List<TextEditingController> get _urlControllers => [_singleUrlController];
  List<FocusNode> get _focusNodes => [_singleFocusNode];
  TextEditingController get _urlController => _singleUrlController;
  FocusNode get _focusNode => _singleFocusNode;

  late AnimationController _pulseController;
  late AnimationController _orbController;
  late AnimationController _quizEntryController;
  late Animation<double> _orbScaleAnimation;
  late Animation<double> _orbOpacityAnimation;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);

    // Only reset if the previous state was idle (don't interrupt ongoing analysis)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final current = ref.read(linkQuizProvider);
      if (current.phase == LinkFlowPhase.idle) {
        ref.read(linkQuizProvider.notifier).reset();
      }
    });
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);

    _orbController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    )..repeat(reverse: true);

    _quizEntryController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );

    _orbScaleAnimation = Tween<double>(begin: 1.0, end: 1.2).animate(
      CurvedAnimation(parent: _orbController, curve: Curves.easeInOutSine),
    );
    _orbOpacityAnimation = Tween<double>(begin: 0.5, end: 0.8).animate(
      CurvedAnimation(parent: _orbController, curve: Curves.easeInOutSine),
    );

    _checkClipboard();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _singleUrlController.dispose();
    _singleFocusNode.dispose();
    for (final c in _compareControllers) {
      c.dispose();
    }
    for (final f in _compareFocusNodes) {
      f.dispose();
    }
    _pulseController.dispose();
    _orbController.dispose();
    _quizEntryController.dispose();
    super.dispose();
  }

  Future<void> _checkClipboard() async {
    // Clipboard detection disabled — users paste manually via the paste button
  }

  void _showLinkSnackBar(
    String message, {
    Color backgroundColor = AppTheme.error,
  }) {
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        content: Text(
          message,
          style: GoogleFonts.plusJakartaSans(
            color: context.surfaceVariantColor,
          ),
        ),
        behavior: SnackBarBehavior.floating,
        backgroundColor: backgroundColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  bool _isValidUrl(String text) {
    final uri = Uri.tryParse(text.trim());
    if (uri == null) return false;
    final isWebUrl = uri.scheme == 'http' || uri.scheme == 'https';
    if (!isWebUrl) return false;
    final host = uri.host.trim();
    return host.isNotEmpty && (host.contains('.') || host == 'localhost');
  }

  String? _extractUrlCandidate(String text) {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return null;

    final match = RegExp("https?://[^\\s<>\"'`]+").firstMatch(trimmed);
    var candidate = (match?.group(0) ?? trimmed)
        .replaceAll(RegExp(r'[)\],.;]+$'), '')
        .trim();
    if (candidate.startsWith('//')) {
      candidate = 'https:$candidate';
    } else if (!candidate.toLowerCase().startsWith('http://') &&
        !candidate.toLowerCase().startsWith('https://')) {
      if (candidate.toLowerCase().startsWith('www.') ||
          (!candidate.contains(' ') && candidate.contains('.'))) {
        candidate = 'https://$candidate';
      }
    }

    final uri = Uri.tryParse(candidate);
    if (uri == null) return null;
    final normalized = uri
        .replace(scheme: uri.scheme.toLowerCase(), host: uri.host.toLowerCase())
        .toString();
    return _isValidUrl(normalized) ? normalized : null;
  }

  Future<void> _pasteClipboardInto(
    TextEditingController controller, {
    bool onlyWhenEmpty = false,
    bool showInvalidFeedback = true,
  }) async {
    if (onlyWhenEmpty && controller.text.trim().isNotEmpty) {
      return;
    }
    final invalidClipboardMessage = _linkText(
      context,
      tr: 'Panoda gecerli bir baglanti bulunamadi.',
      en: 'No valid URL was found in the clipboard.',
    );
    final data = await Clipboard.getData(Clipboard.kTextPlain);
    final pastedUrl = _extractUrlCandidate(data?.text ?? '');
    if (pastedUrl == null) {
      if (showInvalidFeedback) {
        _showLinkSnackBar(invalidClipboardMessage);
      }
      return;
    }

    setState(() {
      controller.text = pastedUrl;
      controller.selection = TextSelection.collapsed(
        offset: controller.text.length,
      );
    });
  }

  /// Tracks which focus nodes are in "edit mode" (double-tapped)
  final Set<FocusNode> _editModeFocusNodes = {};

  Widget _buildModernUrlField({
    required TextEditingController controller,
    required FocusNode focusNode,
    required String hintText,
    required IconData prefixIconData,
    Widget? trailing,
    TextInputAction textInputAction = TextInputAction.next,
    ValueChanged<String>? onSubmitted,
  }) {
    final isEditMode = _editModeFocusNodes.contains(focusNode);
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () {
        // Single tap: paste only, no keyboard
        unawaited(_pasteClipboardInto(controller, onlyWhenEmpty: true, showInvalidFeedback: false));
      },
      onDoubleTap: () {
        // Double tap: enter edit mode, open keyboard
        setState(() => _editModeFocusNodes.add(focusNode));
        focusNode.requestFocus();
        focusNode.addListener(() {
          if (!focusNode.hasFocus && mounted) {
            setState(() => _editModeFocusNodes.remove(focusNode));
          }
        });
      },
      child: AnimatedGradientInputShell(
        child: AbsorbPointer(
          absorbing: !isEditMode,
          child: TextField(
            controller: controller,
            focusNode: focusNode,
            readOnly: !isEditMode,
            keyboardType: TextInputType.url,
            textInputAction: textInputAction,
            autocorrect: false,
            enableSuggestions: false,
            style: GoogleFonts.inter(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              color: context.textPrimary,
            ),
            onTapOutside: (_) {
              focusNode.unfocus();
              setState(() => _editModeFocusNodes.remove(focusNode));
            },
            onSubmitted: onSubmitted,
            decoration: InputDecoration(
              hintText: hintText,
              hintStyle: GoogleFonts.inter(
                fontSize: 13,
                fontWeight: FontWeight.w400,
                color: context.textTertiaryColor.withValues(alpha: 0.6),
              ),
              prefixIcon: Padding(
                padding: const EdgeInsets.only(left: 14, right: 8),
                child: Icon(
                  prefixIconData,
                  color: AppTheme.brandBlue.withValues(alpha: 0.7),
                  size: 18,
                ),
              ),
              prefixIconConstraints: const BoxConstraints(
                minWidth: 0,
                minHeight: 0,
              ),
              suffixIcon: trailing != null
                  ? Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: trailing,
                    )
                  : null,
              border: InputBorder.none,
              filled: false,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 0,
                vertical: 12,
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _resetLinkFields() {
    _singleUrlController.clear();
    _multiLinkUrls = [];
    _multiLinkResults = [];
    _currentMultiLinkIndex = 0;
    _lastSavedSingleHistoryKey = null;
  }

  void _resetCompareFields() {
    for (final c in _compareControllers) {
      c.clear();
    }
    _visibleCompareFields = 2;
    _lastSavedCompareHistoryKey = null;
  }

  void _resetAllFlows() {
    ref.read(linkQuizProvider.notifier).reset();
    ref.read(compareAnalysisProvider.notifier).reset();
    if (!mounted) {
      _resetLinkFields();
      _resetCompareFields();
      return;
    }
    setState(() {
      _resetLinkFields();
      _resetCompareFields();
    });
  }

  /// Continue to next product in multi-link flow (sequential quiz per product)
  Future<void> _continueToNextProduct() async {
    final quizState = ref.read(linkQuizProvider);
    if (quizState.enhancedResult != null) {
      _multiLinkResults.add(quizState.enhancedResult!);
    }
    _currentMultiLinkIndex++;

    if (_currentMultiLinkIndex >= _multiLinkUrls.length) {
      ref.read(linkQuizProvider.notifier).reset();
      if (mounted) {
        setState(() {});
      }
      return;
    }

    ref.read(linkQuizProvider.notifier).reset();
    final user = ref.read(userProfileProvider).valueOrNull;
    if (user == null) return;

    final nextUrl = _multiLinkUrls[_currentMultiLinkIndex];
    ref.read(behaviorTrackingProvider).trackLinkPaste(nextUrl, null);
    await ref
        .read(linkQuizProvider.notifier)
        .analyzeAndStartQuiz(nextUrl, user);
    if (mounted) _quizEntryController.forward(from: 0.0);
  }

  UserEntity _getOrCreateUser() {
    final userAsync = ref.read(userProfileProvider);
    final country = ref.read(selectedCountryProvider);
    final currency = ref.read(currencyProvider);
    return userAsync.valueOrNull ??
        UserEntity(
          uid: 'anonymous',
          email: '',
          displayName: 'User',
          country: country,
          language: Localizations.localeOf(context).languageCode,
          currency: currency,
          priorities: const [],
          subscriptions: const [],
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );
  }

  /// Single Analysis tab — start quiz flow for one URL
  Future<void> _startSingleAnalysis() async {
    if (_singleSubmitInFlight) return;
    final startFailureMessage = _linkText(
      context,
      tr: 'Analiz baslatilamadi. Lutfen tekrar deneyin.',
      en: 'Analysis could not be started. Please try again.',
    );
    final normalizedUrl = _extractUrlCandidate(_singleUrlController.text);
    final url = normalizedUrl ?? _singleUrlController.text.trim();
    if (normalizedUrl != null && _singleUrlController.text != normalizedUrl) {
      _singleUrlController.text = normalizedUrl;
    }
    if (url.isEmpty || !_isValidUrl(url)) {
      _showLinkSnackBar(
        context.l10n?.pleaseEnterValidUrl ?? 'Please enter a valid product URL',
      );
      return;
    }

    setState(() => _singleSubmitInFlight = true);
    _singleFocusNode.unfocus();
    HapticFeedback.selectionClick();
    try {
      ref.read(behaviorTrackingProvider).trackLinkPaste(url, null);
      await ref
          .read(linkQuizProvider.notifier)
          .analyzeAndStartQuiz(url, _getOrCreateUser());
      final latestState = ref.read(linkQuizProvider);
      if (latestState.phase == LinkFlowPhase.idle &&
          latestState.error != null &&
          latestState.error!.trim().isNotEmpty) {
        _showLinkSnackBar(latestState.error!);
      } else if (mounted) {
        _quizEntryController.forward(from: 0.0);
      }
    } catch (e, st) {
      debugPrint('[LinkPaste] EXCEPTION: $e\n$st');
      _showLinkSnackBar(startFailureMessage);
    } finally {
      if (mounted) {
        setState(() => _singleSubmitInFlight = false);
      }
    }
  }

  /// Compare tab — analyze all URLs via background-safe provider
  Future<void> _startCompareAnalysis() async {
    final validUrls = <String>[];
    for (final controller in _compareControllers.take(_visibleCompareFields)) {
      final normalized = _extractUrlCandidate(controller.text);
      if (normalized != null) {
        controller.text = normalized;
        validUrls.add(normalized);
      }
    }

    if (validUrls.length < 2) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            _linkText(
              context,
              tr: 'Lutfen en az 2 gecerli urun baglantisi girin.',
              en: 'Please enter at least 2 valid product URLs.',
            ),
            style: GoogleFonts.plusJakartaSans(
              color: context.surfaceVariantColor,
            ),
          ),
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppTheme.error,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      );
      return;
    }

    for (final fn in _compareFocusNodes) {
      fn.unfocus();
    }

    final user = _getOrCreateUser();
    final lang = Localizations.localeOf(context).languageCode;
    ref
        .read(compareAnalysisProvider.notifier)
        .startAnalysis(validUrls, user, lang);
  }

  void _onCompareQuizAnswer(int index, String answer) {
    ref.read(compareAnalysisProvider.notifier).answerQuestion(index, answer);
  }

  Future<void> _onCompareQuizSubmit() async {
    final user = _getOrCreateUser();
    final lang = Localizations.localeOf(context).languageCode;
    ref.read(compareAnalysisProvider.notifier).submitQuiz(user, lang);
  }

  void _onCompareQuizSkip() {
    final user = _getOrCreateUser();
    final lang = Localizations.localeOf(context).languageCode;
    ref.read(compareAnalysisProvider.notifier).skipQuiz(user, lang);
  }

  // Legacy _startAnalysis for backward compat
  Future<void> _startAnalysis(String url) async => _startSingleAnalysis();

  @override
  Widget build(BuildContext context) {
    final quizState = ref.watch(linkQuizProvider);
    ref.listen<LinkQuizState>(linkQuizProvider, (prev, next) {
      if (!mounted) return;
      final error = next.error?.trim();
      if (error != null &&
          error.isNotEmpty &&
          error != prev?.error &&
          next.phase == LinkFlowPhase.idle) {
        final isInfo = error.contains('ℹ️') || error.contains('tanıyamadık') || error.contains('couldn\'t identify');
        _showLinkSnackBar(
          error.replaceAll('ℹ️ ', '').replaceAll('❌ ', ''),
          backgroundColor: isInfo ? Colors.amber.shade800 : AppTheme.error,
        );
      }
    });
    ref.listen<bool>(premiumProvider, (prev, next) {
      if (!mounted || prev == next || !next) return;
      final currentQuiz = ref.read(linkQuizProvider);
      if (currentQuiz.error != null ||
          currentQuiz.phase == LinkFlowPhase.idle) {
        ref.read(linkQuizProvider.notifier).reset();
      }
      ref.read(compareAnalysisProvider.notifier).reset();
    });
    final compareState = ref.watch(compareAnalysisProvider);
    ref.listen<CompareAnalysisState>(compareAnalysisProvider, (prev, next) {
      if (!mounted) return;
      final error = next.error?.trim();
      if (error != null && error.isNotEmpty && error != prev?.error) {
        final isInfo = error.contains('ℹ️') || error.contains('tanıyamadık') || error.contains('couldn\'t identify');
        _showLinkSnackBar(
          error.replaceAll('ℹ️ ', '').replaceAll('❌ ', ''),
          backgroundColor: isInfo ? Colors.amber.shade800 : AppTheme.error,
        );
      }
    });
    final isWorking =
        quizState.phase == LinkFlowPhase.analyzing ||
        quizState.phase == LinkFlowPhase.quizLoading ||
        quizState.phase == LinkFlowPhase.computing ||
        compareState.isWorking;

    // Show back button when in active flow or comparison ready
    final showBack =
        quizState.phase != LinkFlowPhase.idle ||
        compareState.phase != ComparePhase.idle;

    return Scaffold(
      backgroundColor: context.backgroundColor,
      body: Stack(
        children: [
          _buildBackgroundOrbs(),
          NestedScrollView(
            headerSliverBuilder: (context, innerBoxScrolled) => [
              SliverAppBar(
                backgroundColor: context.backgroundColor,
                pinned: true,
                toolbarHeight: 56,
                leading: showBack
                    ? IconButton(
                        icon: Icon(
                          Icons.arrow_back_rounded,
                          color: context.textPrimary,
                        ),
                        onPressed: () {
                          HapticFeedback.mediumImpact();
                          _resetAllFlows();
                        },
                      )
                    : Padding(
                        padding: const EdgeInsets.only(left: 12),
                        child: Center(
                          child: Image.asset(
                            'assets/logo/compair_logo.png',
                            width: 32,
                            height: 32,
                          ),
                        ),
                      ),
                centerTitle: true,
                title: Builder(
                  builder: (context) {
                    final isDark =
                        Theme.of(context).brightness == Brightness.dark;
                    final titleText = compareState.phase == ComparePhase.done
                        ? (context.l10n?.compare ?? 'Compare')
                        : _getTitle(quizState.phase);
                    if (isDark) {
                      return ShaderMask(
                        shaderCallback: (bounds) => const LinearGradient(
                          colors: [
                            AppTheme.brandBlue,
                            AppTheme.brandSkyBlue,
                            AppTheme.brandCyan,
                          ],
                        ).createShader(bounds),
                        child: Text(
                          titleText,
                          style: GoogleFonts.inter(
                            fontWeight: FontWeight.w800,
                            fontSize: 17,
                            color: Colors.white,
                            letterSpacing: -0.5,
                          ),
                        ),
                      );
                    }
                    return Text(
                      titleText,
                      style: GoogleFonts.inter(
                        fontWeight: FontWeight.w800,
                        fontSize: 17,
                        color: AppTheme.brandBlue,
                        letterSpacing: -0.5,
                      ),
                    );
                  },
                ),
                actions: [
                  if (showBack)
                    _buildAppBarAction(
                      icon: Icons.refresh_rounded,
                      onPressed: () {
                        HapticFeedback.mediumImpact();
                        _resetAllFlows();
                      },
                      tooltip: context.l10n?.startOver ?? 'Start over',
                    ),
                  // History butonu yalnızca her iki flow da idle iken gösterilir
                  if (!showBack)
                    _buildAppBarAction(
                      icon: Icons.manage_history_rounded,
                      onPressed: _showAnalysisHistory,
                      tooltip:
                          context.l10n?.analysisHistoryTooltip ??
                          'Analysis History',
                    ),
                  const SizedBox(width: 4),
                ],
                // Tab bar at the bottom of the app bar (only when idle)
                bottom:
                    (quizState.phase == LinkFlowPhase.idle &&
                        compareState.phase == ComparePhase.idle)
                    ? PreferredSize(
                        preferredSize: const Size.fromHeight(48),
                        child: _buildTabBar(),
                      )
                    : null,
              ),
            ],
            body: _buildBody(quizState, isWorking),
          ),
        ],
      ),
    );
  }

  Widget _buildTabBar() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(
          color: context.textTertiaryColor.withValues(alpha: 0.1),
        ),
      ),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(
          gradient: const LinearGradient(
            colors: [
              AppTheme.brandBlue,
              AppTheme.brandDeepBlue,
              AppTheme.brandCyan,
            ],
          ),
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: AppTheme.brandBlue.withValues(alpha: 0.3),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        indicatorSize: TabBarIndicatorSize.tab,
        labelColor: Colors.white,
        unselectedLabelColor: context.textTertiaryColor,
        labelStyle: GoogleFonts.inter(
          fontWeight: FontWeight.w700,
          fontSize: 13,
        ),
        unselectedLabelStyle: GoogleFonts.inter(
          fontWeight: FontWeight.w500,
          fontSize: 13,
        ),
        dividerColor: Colors.transparent,
        splashBorderRadius: BorderRadius.circular(24),
        tabs: [
          Tab(text: '🔍  ${context.l10n?.singleAnalysis ?? 'Single Analysis'}'),
          Tab(text: '⚡  ${context.l10n?.compare ?? 'Compare'}'),
        ],
      ),
    );
  }

  Widget _buildBody(LinkQuizState quizState, bool isWorking) {
    final compareState = ref.watch(compareAnalysisProvider);

    // Compare results view
    if (compareState.phase == ComparePhase.done &&
        compareState.results.length >= 2) {
      return SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        child: Column(
          children: [
            _buildMultiLinkComparison(),
            Builder(
              builder: (_) {
                Future.microtask(
                  () => _saveCompareHistory(compareState.results),
                );
                return const SizedBox.shrink();
              },
            ),
            SizedBox(
              height:
                  AppTheme.navBarTotalClearance +
                  MediaQuery.of(context).padding.bottom +
                  60,
            ),
          ],
        ),
      );
    }

    // Compare analyzing view (Task 2: no scroll, centered)
    if (compareState.phase == ComparePhase.analyzing ||
        compareState.phase == ComparePhase.analyzingFirst) {
      return _buildCompareAnalyzingView();
    }

    // Compare quiz view — reuse same _QuizView from Single Analysis
    if (compareState.phase == ComparePhase.quiz &&
        compareState.quiz != null &&
        compareState.firstBaseResult != null) {
      return SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        child: Column(
          children: [
            _QuizView(
              quiz: compareState.quiz!,
              answeredQuestions: compareState.quizAnswers,
              currentIndex: compareState.quizIndex,
              baseResult: compareState.firstBaseResult!,
              onAnswer: _onCompareQuizAnswer,
              onSubmit: _onCompareQuizSubmit,
              onSkip: _onCompareQuizSkip,
            ),
            SizedBox(
              height:
                  AppTheme.navBarTotalClearance +
                  MediaQuery.of(context).padding.bottom +
                  60,
            ),
          ],
        ),
      );
    }

    // Compare error
    if (compareState.error != null && compareState.phase != ComparePhase.idle) {
      return SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        child: Column(
          children: [
            _buildError(compareState.error!),
            const SizedBox(height: 16),
            GestureDetector(
              onTap: () => ref.read(compareAnalysisProvider.notifier).reset(),
              child: Text(
                context.l10n?.tryAgain ?? 'Try Again',
                style: GoogleFonts.inter(
                  color: AppTheme.brandBlue,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      );
    }

    // Active single analysis flow (quiz/result/analyzing)
    if (quizState.phase != LinkFlowPhase.idle) {
      // Analyzing/computing phases: fixed centered, no scroll
      if (quizState.phase == LinkFlowPhase.analyzing ||
          quizState.phase == LinkFlowPhase.quizLoading ||
          quizState.phase == LinkFlowPhase.computing) {
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Center(child: _buildPhaseTimeline(quizState.phase)),
        );
      }
      // Quiz and result phases: scrollable
      return SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        child: Column(
          children: [
            if (quizState.phase == LinkFlowPhase.quiz &&
                quizState.quiz != null &&
                quizState.baseResult != null)
              _QuizView(
                quiz: quizState.quiz!,
                answeredQuestions: quizState.answeredQuestions,
                currentIndex: quizState.currentQuestionIndex,
                baseResult: quizState.baseResult!,
                onAnswer: (idx, answer) {
                  ref
                      .read(linkQuizProvider.notifier)
                      .answerQuestion(idx, answer);
                },
                onSubmit: () async {
                  await ref
                      .read(linkQuizProvider.notifier)
                      .submitQuiz(_getOrCreateUser());
                },
                onSkip: () {
                  ref.read(linkQuizProvider.notifier).skipQuiz();
                },
              ),

            if (quizState.phase == LinkFlowPhase.result &&
                quizState.enhancedResult != null) ...[
              _EnhancedResultView(result: quizState.enhancedResult!),
              // History'e kaydet (sadece bir kez)
              Builder(
                builder: (_) {
                  final r = quizState.enhancedResult!;
                  final name = r.baseResult.metadata.title ?? '';
                  final url = _singleUrlController.text.trim();
                  if (name.isNotEmpty && url.isNotEmpty) {
                    Future.microtask(
                      () => _saveToHistory(
                        url: url,
                        productName: name,
                        score: r.enhancedScore,
                        result: r,
                      ),
                    );
                  }
                  return const SizedBox.shrink();
                },
              ),
            ],

            SizedBox(
              height:
                  AppTheme.navBarTotalClearance +
                  MediaQuery.of(context).padding.bottom +
                  60,
            ),
          ],
        ),
      );
    }

    // Idle state — show tabs
    return TabBarView(
      controller: _tabController,
      children: [_buildSingleAnalysisTab(isWorking), _buildCompareTab()],
    );
  }

  /// TAB 1: Single Analysis
  Widget _buildSingleAnalysisTab(bool isWorking) {
    final quizState = ref.watch(linkQuizProvider);
    final singleWorking = isWorking || _singleSubmitInFlight;
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      child: Column(
        children: [
          // Single URL input card
          GlassContainer(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [AppTheme.brandBlue, AppTheme.brandSkyBlue],
                        ),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Icon(
                        Icons.link_rounded,
                        color: Colors.white,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            context.l10n?.pasteProductLinkCardTitle ??
                                'Paste Product Link',
                            style: GoogleFonts.plusJakartaSans(
                              fontWeight: FontWeight.w800,
                              fontSize: 16,
                              color: context.textPrimary,
                              letterSpacing: -0.3,
                            ),
                          ),
                          Text(
                            context.l10n?.pasteProductLinkSubtitle ??
                                'Get AI-powered analysis with quiz',
                            style: GoogleFonts.inter(
                              fontSize: 12,
                              color: context.textTertiaryColor,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                  ],
                ),
                const SizedBox(height: 16),
                _buildModernUrlField(
                  controller: _singleUrlController,
                  focusNode: _singleFocusNode,
                  textInputAction: TextInputAction.go,
                  hintText: 'https://www.amazon.com/product...',
                  onSubmitted: (_) => _startSingleAnalysis(),
                  prefixIconData: Icons.link_rounded,
                ),
                const SizedBox(height: 14),
                // Supported stores text
                Center(
                  child: Text(
                    context.l10n?.allShoppingSitesSupported ??
                        'Tüm alışveriş siteleri desteklenir',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.inter(
                      fontSize: 12,
                      color: context.textTertiaryColor,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                // Analyze button
                Opacity(
                  opacity: singleWorking ? 0.7 : 1,
                  child: GradientButton(
                    width: double.infinity,
                    height: 54,
                    borderRadius: BorderRadius.circular(27),
                    gradient: const LinearGradient(
                      colors: [
                        AppTheme.brandBlue,
                        AppTheme.brandDeepBlue,
                        AppTheme.brandSkyBlue,
                      ],
                    ),
                    onPressed: singleWorking
                        ? null
                        : () {
                            FocusScope.of(context).unfocus();
                            _startSingleAnalysis();
                          },
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (singleWorking) ...[
                          const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.2,
                              valueColor: AlwaysStoppedAnimation<Color>(
                                Colors.white,
                              ),
                            ),
                          ),
                        ] else ...[
                          const Icon(
                            Icons.auto_awesome,
                            color: Colors.white,
                            size: 20,
                          ),
                        ],
                        const SizedBox(width: 8),
                        Text(
                          context.l10n?.analyzeWithAi ?? 'Analyze with AI',
                          style: GoogleFonts.inter(
                            fontWeight: FontWeight.w700,
                            fontSize: 15,
                            color: Colors.white,
                            letterSpacing: -0.3,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          if (quizState.error != null) ...[
            _buildError(quizState.error!),
            const SizedBox(height: 16),
          ],
          // How it works — new modernized design
          _buildInfoCards(),
          SizedBox(
            height:
                AppTheme.navBarTotalClearance +
                MediaQuery.of(context).padding.bottom +
                60,
          ),
        ],
      ),
    );
  }

  Widget _buildLinkUsageBadge() {
    final sub = ref.watch(subscriptionServiceProvider);
    if (sub.isPremium) return const SizedBox.shrink();

    final remaining = sub.remainingLinkPastes;
    final total = AppConstants.freeLinkPasteLimit;
    final progress = (total - remaining) / total;
    final isLow = remaining <= 1;
    final barColor = isLow ? AppTheme.error : AppTheme.brandBlue;
    final usageLabel = _linkText(
      context,
      tr: 'Link Analizi',
      en: 'Link Analysis',
    );
    final periodLabel = _linkText(
      context,
      tr: '$remaining/$total hafta',
      en: '$remaining/$total week',
    );
    final ctaLabel = _linkText(context, tr: 'Premium', en: 'Premium');

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => showPaywallSheet(context),
        borderRadius: BorderRadius.circular(16),
        child: Container(
          constraints: const BoxConstraints(minWidth: 108, maxWidth: 132),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: context.surfaceElevatedColor,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: isLow
                  ? AppTheme.error.withValues(alpha: 0.28)
                  : AppTheme.brandBlue.withValues(alpha: 0.14),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.link_rounded, size: 14, color: barColor),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      usageLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.inter(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: context.textPrimary,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                periodLabel,
                style: GoogleFonts.inter(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: barColor,
                ),
              ),
              const SizedBox(height: 6),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: LinearProgressIndicator(
                  value: progress.clamp(0.0, 1.0),
                  minHeight: 3,
                  backgroundColor: barColor.withValues(alpha: 0.12),
                  valueColor: AlwaysStoppedAnimation<Color>(barColor),
                ),
              ),
              const SizedBox(height: 6),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.auto_awesome_rounded,
                    size: 12,
                    color: AppTheme.brandSkyBlue,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    ctaLabel,
                    style: GoogleFonts.inter(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.brandSkyBlue,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// TAB 2: Compare (2-4 products)
  Widget _buildCompareTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      child: Column(
        children: [
          GlassContainer(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [AppTheme.brandCyan, AppTheme.brandBlue],
                        ),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Icon(
                        Icons.compare_arrows_rounded,
                        color: Colors.white,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            context.l10n?.compareProducts ?? 'Compare Products',
                            style: GoogleFonts.plusJakartaSans(
                              fontWeight: FontWeight.w800,
                              fontSize: 16,
                              color: context.textPrimary,
                              letterSpacing: -0.3,
                            ),
                          ),
                          Text(
                            context.l10n?.compareProductsSubtitle ??
                                'Add 2-4 product links to compare',
                            style: GoogleFonts.inter(
                              fontSize: 12,
                              color: context.textTertiaryColor,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                // URL input fields (2-4)
                ...List.generate(
                  _visibleCompareFields,
                  (i) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _buildCompareUrlField(i),
                  ),
                ),
                // Add product button (if less than 4)
                if (_visibleCompareFields < 4)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: GestureDetector(
                      onTap: () => setState(() {
                        _visibleCompareFields++;
                      }),
                      child: Container(
                        height: 52,
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            colors: [
                              AppTheme.brandBlue.withValues(alpha: 0.10),
                              AppTheme.brandCyan.withValues(alpha: 0.05),
                            ],
                          ),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: AppTheme.brandBlue.withValues(alpha: 0.3),
                          ),
                          boxShadow: [
                            BoxShadow(
                              color: AppTheme.brandBlue.withValues(alpha: 0.08),
                              blurRadius: 14,
                              offset: const Offset(0, 6),
                            ),
                          ],
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.add_rounded,
                              color: AppTheme.brandBlue,
                              size: 20,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              context.l10n?.addProductLabel ?? 'Add Product',
                              style: GoogleFonts.inter(
                                fontWeight: FontWeight.w600,
                                fontSize: 13,
                                color: AppTheme.brandBlue,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                const SizedBox(height: 6),
                // Compare button
                GestureDetector(
                  onTap: _startCompareAnalysis,
                  child: Container(
                    height: 54,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [
                          AppTheme.brandCyan,
                          AppTheme.brandBlue,
                          AppTheme.brandDeepBlue,
                        ],
                      ),
                      borderRadius: BorderRadius.circular(27),
                      boxShadow: [
                        BoxShadow(
                          color: AppTheme.brandCyan.withValues(alpha: 0.35),
                          blurRadius: 20,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(
                          Icons.compare_arrows_rounded,
                          color: Colors.white,
                          size: 20,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          context.l10n?.compare ?? 'Compare',
                          style: GoogleFonts.inter(
                            fontWeight: FontWeight.w700,
                            fontSize: 15,
                            color: Colors.white,
                            letterSpacing: -0.3,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          // How comparison works
          _buildCompareInfoCards(),
          SizedBox(
            height:
                AppTheme.navBarTotalClearance +
                MediaQuery.of(context).padding.bottom +
                60,
          ),
        ],
      ),
    );
  }

  Widget _buildCompareUrlField(int index) {
    return _buildModernUrlField(
      controller: _compareControllers[index],
      focusNode: _compareFocusNodes[index],
      hintText:
          context.l10n?.pasteProductUrlNumbered(index + 1) ??
          'Paste product URL ${index + 1}...',
      prefixIconData: Icons.link_rounded,
      trailing: _visibleCompareFields > 2
          ? IconButton(
              icon: Icon(
                Icons.close_rounded,
                color: AppTheme.error.withValues(alpha: 0.78),
                size: 18,
              ),
              style: IconButton.styleFrom(
                backgroundColor: AppTheme.error.withValues(alpha: 0.08),
              ),
              onPressed: () {
                setState(() {
                  _compareControllers[index].clear();
                  for (int j = index; j < _visibleCompareFields - 1; j++) {
                    _compareControllers[j].text =
                        _compareControllers[j + 1].text;
                  }
                  _compareControllers[_visibleCompareFields - 1].clear();
                  _visibleCompareFields--;
                });
              },
            )
          : null,
    );
  }

  Widget _buildCompareAnalyzingView() {
    final cState = ref.watch(compareAnalysisProvider);
    final isFirstPhase = cState.phase == ComparePhase.analyzingFirst;
    final isTr = Localizations.localeOf(context).languageCode == 'tr';

    IconData stepIcon(AnalysisStepType type) {
      switch (type) {
        case AnalysisStepType.scanLink:
          return Icons.link_rounded;
        case AnalysisStepType.aiAnalysis:
          return Icons.psychology_rounded;
        case AnalysisStepType.profileMatch:
          return Icons.person_rounded;
      }
    }

    final compareSteps = cState.steps;
    final totalSteps = compareSteps.isNotEmpty ? compareSteps.length : 3;
    final doneCount = compareSteps.where((s) => s.isDone).length;
    final progress = compareSteps.isNotEmpty ? doneCount / totalSteps : 0.0;
    final percent = (progress * 100).toInt();

    // Find active step
    final AnalysisStep? activeStep = compareSteps.isEmpty
        ? null
        : compareSteps.where((s) => s.isActive).isEmpty
            ? null
            : compareSteps.firstWhere((s) => s.isActive);

    // Active detail text
    String activeDetail;
    if (isFirstPhase) {
      activeDetail = isTr
          ? 'İlk ürün taranıyor, quiz hazırlanıyor...'
          : 'Scanning first product, preparing quiz...';
    } else if (activeStep != null) {
      switch (activeStep.type) {
        case AnalysisStepType.scanLink:
          final idx = compareSteps.indexOf(activeStep);
          final url =
              idx < cState.validUrls.length ? cState.validUrls[idx] : '';
          final host = Uri.tryParse(url)?.host ?? url;
          final short = host.startsWith('www.') ? host.substring(4) : host;
          final shortUrl =
              short.length > 30 ? '${short.substring(0, 30)}...' : short;
          activeDetail = isTr ? '$shortUrl taranıyor...' : 'Scanning $shortUrl...';
        case AnalysisStepType.aiAnalysis:
          activeDetail = isTr
              ? 'AI derin analiz yapıyor...'
              : 'AI performing deep analysis...';
        case AnalysisStepType.profileMatch:
          activeDetail = isTr
              ? 'Profilinizle eşleştiriliyor...'
              : 'Matching with your profile...';
      }
    } else {
      activeDetail =
          isTr ? 'Analiz tamamlanıyor...' : 'Finishing analysis...';
    }

    // Heading
    final heading = isFirstPhase
        ? (isTr ? 'İlk Ürün Analiz Ediliyor' : 'Analyzing First Product')
        : (isTr ? 'Ürünler Karşılaştırılıyor' : 'Comparing Products');

    // Fixed phase steps for analyzingFirst visual
    final fixedPhaseSteps = <(IconData, String, String)>[
      (
        Icons.link_rounded,
        isTr ? 'Bağlantı Taranıyor' : 'Scanning Link',
        isTr
            ? 'URL ve ürün metadata\'sı çekiliyor'
            : 'Fetching URL and product metadata',
      ),
      (
        Icons.fingerprint_rounded,
        isTr ? 'Ürün Tanımlanıyor' : 'Identifying Product',
        isTr
            ? 'AI ürün özelliklerini çıkartıyor'
            : 'AI extracting product details',
      ),
      (
        Icons.quiz_rounded,
        isTr ? 'Quiz Hazırlanıyor' : 'Preparing Quiz',
        isTr
            ? 'Kişisel sorular oluşturuluyor'
            : 'Generating personalized questions',
      ),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 28, 20, 0),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // Animated orb
          Center(
            child: SizedBox(
              width: 120,
              height: 120,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  SizedBox(
                    width: 120,
                    height: 120,
                    child: isFirstPhase
                        ? CircularProgressIndicator(
                            strokeWidth: 5,
                            strokeCap: StrokeCap.round,
                            backgroundColor:
                                AppTheme.brandBlue.withValues(alpha: 0.1),
                            color: AppTheme.brandCyan,
                          )
                        : TweenAnimationBuilder<double>(
                            duration: const Duration(milliseconds: 600),
                            curve: Curves.easeOutCubic,
                            tween: Tween(begin: 0.0, end: progress),
                            builder: (_, v, w) => CircularProgressIndicator(
                              value: v,
                              strokeWidth: 5,
                              strokeCap: StrokeCap.round,
                              backgroundColor:
                                  AppTheme.brandBlue.withValues(alpha: 0.08),
                              color: AppTheme.brandCyan,
                            ),
                          ),
                  ),
                  AnimatedBuilder(
                    animation: _pulseController,
                    builder: (_, ac) => Container(
                      width: 90 + _pulseController.value * 6,
                      height: 90 + _pulseController.value * 6,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: RadialGradient(
                          colors: [
                            AppTheme.brandBlue.withValues(
                              alpha: 0.2 + _pulseController.value * 0.12,
                            ),
                            AppTheme.brandBlue.withValues(alpha: 0),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Container(
                    width: 70,
                    height: 70,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const LinearGradient(
                        colors: [AppTheme.brandBlue, AppTheme.brandDeepBlue],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      boxShadow: [
                        BoxShadow(
                          color: AppTheme.brandBlue.withValues(alpha: 0.4),
                          blurRadius: 24,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(
                          Icons.compare_arrows_rounded,
                          color: Colors.white,
                          size: 20,
                        )
                            .animate(onPlay: (c) => c.repeat(reverse: true))
                            .scale(
                              begin: const Offset(1, 1),
                              end: const Offset(1.1, 1.1),
                              duration: 1200.ms,
                            ),
                        const SizedBox(height: 2),
                        Text(
                          isFirstPhase ? '...' : '$percent%',
                          style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w900,
                            fontSize: 12,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          // Heading + active detail
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 300),
            child: Column(
              key: ValueKey(
                isFirstPhase ? 'first' : (activeStep?.label ?? 'none'),
              ),
              children: [
                Text(
                  heading,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                    color: context.textPrimary,
                    letterSpacing: -0.3,
                  ),
                ),
                const SizedBox(height: 6),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text(
                    activeDetail,
                    textAlign: TextAlign.center,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      color: context.textSecondary,
                      height: 1.5,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),

          // URL chips (only for analyzing phase)
          if (!isFirstPhase && cState.validUrls.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: Wrap(
                spacing: 8,
                runSpacing: 6,
                alignment: WrapAlignment.center,
                children: cState.validUrls.asMap().entries.map((e) {
                  final idx = e.key;
                  final url = e.value;
                  final step =
                      idx < compareSteps.length ? compareSteps[idx] : null;
                  final host = Uri.tryParse(url)?.host ?? url;
                  final short =
                      host.startsWith('www.') ? host.substring(4) : host;
                  final displayText =
                      short.length > 20 ? '${short.substring(0, 20)}…' : short;

                  Color chipColor;
                  IconData chipIcon;
                  if (step?.isDone == true) {
                    chipColor = AppTheme.success;
                    chipIcon = Icons.check_circle_rounded;
                  } else if (step?.isActive == true) {
                    chipColor = AppTheme.brandBlue;
                    chipIcon = Icons.hourglass_top_rounded;
                  } else if (step?.hasError == true) {
                    chipColor = AppTheme.error;
                    chipIcon = Icons.error_rounded;
                  } else {
                    chipColor = context.textTertiaryColor;
                    chipIcon = Icons.link_rounded;
                  }

                  return Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: chipColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: chipColor.withValues(alpha: 0.3),
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        step?.isActive == true
                            ? SizedBox(
                                width: 12,
                                height: 12,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  valueColor:
                                      AlwaysStoppedAnimation(chipColor),
                                ),
                              )
                            : Icon(chipIcon, size: 12, color: chipColor),
                        const SizedBox(width: 5),
                        Text(
                          displayText,
                          style: GoogleFonts.inter(
                            fontSize: 11,
                            color: chipColor,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ),

          // Steps list
          if (isFirstPhase)
            GlassContainer(
              padding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 12,
              ),
              child: Column(
                children: fixedPhaseSteps.asMap().entries.map((e) {
                  final idx = e.key;
                  final (icon, label, detail) = e.value;
                  final isActiveStep = idx == 0;
                  final textColor = isActiveStep
                      ? AppTheme.brandBlue
                      : context.textTertiaryColor;
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 7),
                    child: Row(
                      children: [
                        isActiveStep
                            ? SizedBox(
                                width: 28,
                                height: 28,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.5,
                                  valueColor: const AlwaysStoppedAnimation(
                                    AppTheme.brandBlue,
                                  ),
                                  backgroundColor:
                                      AppTheme.slate700.withValues(alpha: 0.3),
                                ),
                              )
                            : Container(
                                width: 28,
                                height: 28,
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: context.surfaceVariantColor,
                                ),
                                child: Icon(
                                  icon,
                                  size: 14,
                                  color: context.textTertiaryColor,
                                ),
                              ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                label,
                                style: GoogleFonts.inter(
                                  fontSize: 13,
                                  fontWeight: isActiveStep
                                      ? FontWeight.w600
                                      : FontWeight.w500,
                                  color: textColor,
                                ),
                              ),
                              Text(
                                detail,
                                style: GoogleFonts.inter(
                                  fontSize: 11,
                                  color: context.textTertiaryColor,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            )
          else if (compareSteps.isNotEmpty)
            GlassContainer(
              padding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 12,
              ),
              child: Column(
                children: compareSteps.asMap().entries.map((entry) {
                  final i = entry.key;
                  final step = entry.value;
                  return _buildAnalysisStepRow(step, stepIcon(step.type), i);
                }).toList(),
              ),
            ),
          const SizedBox(height: 40),
        ],
      ),
    );
  }

  String _localizedCompareStepLabel(AnalysisStep step, int index) {
    switch (step.type) {
      case AnalysisStepType.scanLink:
        final productLabel =
            context.l10n?.productSlotLabel(index + 1) ?? 'Product ${index + 1}';
        return '${context.l10n?.scanStep ?? 'Scan'} • $productLabel';
      case AnalysisStepType.aiAnalysis:
        return context.l10n?.stepAnalyzeTitle ?? 'AI Analysis';
      case AnalysisStepType.profileMatch:
        return context.l10n?.smartCompatibility ?? 'Smart Compatibility';
    }
  }

  Widget _buildAnalysisStepRow(
    AnalysisStep step,
    IconData stepIcon,
    int index,
  ) {
    final Widget icon;
    final Color textColor;
    if (step.isDone) {
      icon =
          Container(
            width: 28,
            height: 28,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                colors: [AppTheme.success, AppTheme.scoreExcellent],
              ),
            ),
            child: const Icon(
              Icons.check_rounded,
              color: Colors.white,
              size: 16,
            ),
          ).animate().scale(
            begin: const Offset(0, 0),
            end: const Offset(1, 1),
            duration: 300.ms,
            curve: Curves.elasticOut,
          );
      textColor = context.textPrimary;
    } else if (step.hasError) {
      icon = Container(
        width: 28,
        height: 28,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: AppTheme.error.withValues(alpha: 0.15),
        ),
        child: Icon(Icons.close_rounded, color: AppTheme.error, size: 16),
      );
      textColor = AppTheme.error;
    } else if (step.isActive) {
      icon = SizedBox(
        width: 28,
        height: 28,
        child: CircularProgressIndicator(
          strokeWidth: 2.5,
          valueColor: const AlwaysStoppedAnimation(AppTheme.brandBlue),
          backgroundColor: context.surfaceVariantColor,
        ),
      );
      textColor = AppTheme.brandBlue;
    } else {
      icon = Container(
        width: 28,
        height: 28,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: context.surfaceVariantColor,
        ),
        child: Icon(stepIcon, color: context.textTertiaryColor, size: 14),
      );
      textColor = context.textTertiaryColor;
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          icon,
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              _localizedCompareStepLabel(step, index),
              style: GoogleFonts.inter(
                fontSize: 13,
                fontWeight: step.isDone || step.isActive
                    ? FontWeight.w600
                    : FontWeight.w500,
                color: textColor,
              ),
            ),
          ),
          if (step.isDone)
            Text(
              '✓',
              style: TextStyle(
                color: AppTheme.success,
                fontSize: 14,
                fontWeight: FontWeight.w700,
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildCompareInfoCards() {
    final isTr = Localizations.localeOf(context).languageCode == 'tr';
    final steps = [
      (
        Icons.add_link_rounded,
        isTr ? '2-4 Bağlantı Ekle' : 'Add 2-4 Links',
        isTr
            ? 'Karşılaştırmak istediğin ürün URL\'lerini yapıştır'
            : 'Paste product URLs you want to compare',
        AppTheme.brandBlue,
      ),
      (
        Icons.forum_rounded,
        isTr ? 'İnternet Yorumları' : 'Community Voice',
        isTr
            ? 'Her ürün için Reddit, Trustpilot ve forumlardan gerçek yorumlar taranır'
            : 'Real reviews scanned from Reddit, Trustpilot & forums for each product',
        AppTheme.brandCyan,
      ),
      (
        Icons.auto_awesome_rounded,
        isTr ? 'AI Analizi' : 'AI Analysis',
        isTr
            ? 'AI ürünleri yan yana karşılaştırır ve sıralar'
            : 'AI compares products side-by-side and ranks them',
        AppTheme.brandSkyBlue,
      ),
      (
        Icons.leaderboard_rounded,
        isTr ? 'Sıralı Sonuç' : 'Ranked Result',
        isTr
            ? 'Artıları, eksileri ve kazananla birlikte detaylı karşılaştırma'
            : 'Detailed side-by-side with pros, cons and the winner',
        AppTheme.brandDeepBlue,
      ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Row(
            children: [
              Container(
                width: 4,
                height: 20,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [AppTheme.brandBlue, AppTheme.brandCyan],
                  ),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: 10),
              Text(
                isTr ? 'Karşılaştırma Nasıl Çalışır' : 'How Comparison Works',
                style: GoogleFonts.plusJakartaSans(
                  fontWeight: FontWeight.w800,
                  fontSize: 16,
                  color: context.textPrimary,
                  letterSpacing: -0.3,
                ),
              ),
            ],
          ),
        ),
        ...List.generate(steps.length, (i) {
          final (icon, title, desc, color) = steps[i];
          final isLast = i == steps.length - 1;
          return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Column(
                      children: [
                        Container(
                          width: 34,
                          height: 34,
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: [color, color.withValues(alpha: 0.65)],
                            ),
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: color.withValues(alpha: 0.28),
                                blurRadius: 10,
                                offset: const Offset(0, 3),
                              ),
                            ],
                          ),
                          child: Center(
                            child: Text(
                              '0${i + 1}',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                                letterSpacing: -0.3,
                              ),
                            ),
                          ),
                        ),
                        if (!isLast)
                          Container(
                            width: 2,
                            height: 20,
                            margin: const EdgeInsets.symmetric(vertical: 2),
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                                colors: [
                                  color.withValues(alpha: 0.35),
                                  color.withValues(alpha: 0.05),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: context.isDarkMode
                              ? color.withValues(alpha: 0.06)
                              : Colors.white.withValues(alpha: 0.85),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: color.withValues(
                              alpha: context.isDarkMode ? 0.15 : 0.18,
                            ),
                          ),
                          boxShadow: context.isDarkMode
                              ? null
                              : AppTheme.cardShadowLight,
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 38,
                              height: 38,
                              decoration: BoxDecoration(
                                color: color.withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Icon(icon, size: 20, color: color),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    title,
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 13.5,
                                      fontWeight: FontWeight.w700,
                                      color: context.textPrimary,
                                      letterSpacing: -0.2,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    desc,
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.w500,
                                      color: context.textTertiaryColor,
                                      height: 1.35,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              )
              .animate()
              .fadeIn(delay: (80 * i).ms, duration: 380.ms)
              .slideX(begin: 0.04);
        }),
      ],
    );
  }

  Widget _buildAppBarAction({
    required IconData icon,
    required VoidCallback onPressed,
    required String tooltip,
  }) {
    return Container(
      margin: const EdgeInsets.only(right: 4),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(color: Colors.white.withValues(alpha: 0.06), blurRadius: 8),
        ],
      ),
      child: IconButton(
        icon: Icon(icon, color: AppTheme.slate500, size: 20),
        onPressed: onPressed,
        tooltip: tooltip,
        splashRadius: 20,
      ),
    );
  }

  Widget _buildMultiLinkProgress() {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: AppTheme.brandBlue.withValues(alpha: 0.3),
          width: 1.5,
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AppTheme.brandBlue, AppTheme.brandCyan],
              ),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(
              Icons.compare_arrows_rounded,
              color: Colors.white,
              size: 18,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  context.l10n?.productProgress(
                        _currentMultiLinkIndex + 1,
                        _multiLinkUrls.length,
                      ) ??
                      'Product ${_currentMultiLinkIndex + 1} of ${_multiLinkUrls.length}',
                  style: GoogleFonts.inter(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                    color: context.textPrimary,
                    letterSpacing: -0.3,
                  ),
                ),
                const SizedBox(height: 4),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: (_currentMultiLinkIndex + 1) / _multiLinkUrls.length,
                    backgroundColor: context.surfaceVariantColor,
                    valueColor: const AlwaysStoppedAnimation(
                      AppTheme.brandBlue,
                    ),
                    minHeight: 4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms);
  }

  Widget _buildPhaseTimeline(LinkFlowPhase phase) {
    final isTr =
        Localizations.localeOf(context).languageCode.toLowerCase() == 'tr';
    final steps = [
      _PhaseStep(
        label: isTr ? 'Bağlantı Doğrulanıyor' : 'Validating Link',
        detail: isTr
            ? 'URL formatı ve erişilebilirlik kontrol ediliyor'
            : 'Checking URL format and accessibility',
        icon: Icons.link_rounded,
        isDone: phase.index >= LinkFlowPhase.analyzing.index,
        isActive: phase == LinkFlowPhase.analyzing,
      ),
      _PhaseStep(
        label: isTr ? 'Ürün Tanımlanıyor' : 'Identifying Product',
        detail: isTr
            ? 'Sayfa içeriğinden ürün bilgisi ve özellikler çıkartılıyor'
            : 'Extracting product info and specs from page content',
        icon: Icons.fingerprint_rounded,
        isDone: phase.index >= LinkFlowPhase.quizLoading.index,
        isActive: phase == LinkFlowPhase.analyzing,
      ),
      _PhaseStep(
        label: isTr
            ? 'İnternet Yorumları Taranıyor'
            : 'Scanning Community Reviews',
        detail: isTr
            ? 'Reddit, forum, YouTube ve mağaza yorumları toplanıyor'
            : 'Gathering Reddit, forum, YouTube & store reviews',
        icon: Icons.forum_rounded,
        isDone: phase.index >= LinkFlowPhase.quizLoading.index,
        isActive: phase == LinkFlowPhase.analyzing,
      ),
      _PhaseStep(
        label: isTr ? 'Kişisel Quiz Hazırlanıyor' : 'Preparing Personal Quiz',
        detail: isTr
            ? 'AI kullanıma özel sorular oluşturuyor'
            : 'AI is generating usage-tailored questions',
        icon: Icons.psychology_alt_rounded,
        isDone: phase.index >= LinkFlowPhase.quiz.index,
        isActive: phase == LinkFlowPhase.quizLoading,
      ),
      _PhaseStep(
        label: isTr ? 'Uyumluluk Hesaplanıyor' : 'Computing Compatibility',
        detail: isTr
            ? 'Profilin + cevapların + yorumlar birleştirilip skor üretiliyor'
            : 'Blending your profile + answers + reviews into a score',
        icon: Icons.auto_graph_rounded,
        isDone: phase.index >= LinkFlowPhase.result.index,
        isActive: phase == LinkFlowPhase.computing,
      ),
    ];

    final doneCount = steps.where((s) => s.isDone).length;
    final percent = ((doneCount / steps.length) * 100).toInt();
    final activeStep = steps.firstWhere(
      (s) => s.isActive,
      orElse: () => steps.first,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 28),
        // Hero orb
        Center(
          child: SizedBox(
            width: 120,
            height: 120,
            child: Stack(
              alignment: Alignment.center,
              children: [
                SizedBox(
                  width: 120,
                  height: 120,
                  child: TweenAnimationBuilder<double>(
                    duration: const Duration(milliseconds: 800),
                    curve: Curves.easeOutCubic,
                    tween: Tween(begin: 0, end: doneCount / steps.length),
                    builder: (ctx, value, _) => CircularProgressIndicator(
                      value: value,
                      strokeWidth: 6,
                      strokeCap: StrokeCap.round,
                      backgroundColor: AppTheme.brandBlue.withValues(
                        alpha: 0.08,
                      ),
                      color: AppTheme.brandCyan,
                    ),
                  ),
                ),
                AnimatedBuilder(
                  animation: _pulseController,
                  builder: (ctx, _) => Container(
                    width: 90 + _pulseController.value * 6,
                    height: 90 + _pulseController.value * 6,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(
                        colors: [
                          AppTheme.brandBlue.withValues(
                            alpha: 0.25 + _pulseController.value * 0.15,
                          ),
                          AppTheme.brandBlue.withValues(alpha: 0.0),
                        ],
                      ),
                    ),
                  ),
                ),
                Container(
                  width: 70,
                  height: 70,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: const LinearGradient(
                      colors: [AppTheme.brandBlue, AppTheme.brandDeepBlue],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: AppTheme.brandBlue.withValues(alpha: 0.4),
                        blurRadius: 24,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(activeStep.icon, color: Colors.white, size: 20)
                          .animate(onPlay: (c) => c.repeat(reverse: true))
                          .scale(
                            begin: const Offset(1, 1),
                            end: const Offset(1.1, 1.1),
                            duration: 1200.ms,
                            curve: Curves.easeInOut,
                          ),
                      const SizedBox(height: 4),
                      Text(
                        '$percent%',
                        style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w900,
                          fontSize: 14,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        Center(
          child: AnimatedSwitcher(
            duration: const Duration(milliseconds: 300),
            child: Column(
              key: ValueKey(activeStep.label),
              children: [
                Text(
                  activeStep.label,
                  textAlign: TextAlign.center,
                  style: GoogleFonts.plusJakartaSans(
                    fontWeight: FontWeight.w800,
                    fontSize: 15,
                    color: context.textPrimary,
                    letterSpacing: -0.3,
                  ),
                ),
                const SizedBox(height: 6),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Text(
                    activeStep.detail,
                    textAlign: TextAlign.center,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      color: context.textSecondary,
                      height: 1.5,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: context.isDarkMode
                ? Colors.white.withValues(alpha: 0.03)
                : Colors.white.withValues(alpha: 0.85),
            borderRadius: BorderRadius.circular(22),
            border: Border.all(
              color: AppTheme.brandBlue.withValues(
                alpha: context.isDarkMode ? 0.15 : 0.12,
              ),
              width: 0.8,
            ),
            boxShadow: context.isDarkMode ? null : AppTheme.cardShadowLight,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: steps.asMap().entries.map((entry) {
              final i = entry.key;
              final step = entry.value;
              final isLast = i == steps.length - 1;
              return _buildTimelineStep(step, isLast, i);
            }).toList(),
          ),
        ),
        const SizedBox(height: 14),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: AppTheme.brandCyan.withValues(
              alpha: context.isDarkMode ? 0.06 : 0.05,
            ),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: AppTheme.brandCyan.withValues(
                alpha: context.isDarkMode ? 0.2 : 0.15,
              ),
              width: 0.8,
            ),
          ),
          child: Row(
            children: [
              const Icon(
                Icons.verified_rounded,
                color: AppTheme.brandCyan,
                size: 16,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  isTr
                      ? 'Kaynaklar: Reddit · Trustpilot · Forum · YouTube · Mağaza · Resmi site'
                      : 'Sources: Reddit · Trustpilot · Forums · YouTube · Store · Official',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    color: context.textSecondary,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    ).animate().fadeIn(duration: 400.ms);
  }

  Widget _buildTimelineStep(_PhaseStep step, bool isLast, int index) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 32,
            child: Column(
              children: [
                step.isDone
                    ? AnimatedContainer(
                        duration: const Duration(milliseconds: 400),
                        width: 28,
                        height: 28,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: LinearGradient(
                            colors: [AppTheme.success, AppTheme.scoreExcellent],
                          ),
                        ),
                        child: Center(
                          child: Icon(
                            Icons.check_rounded,
                            size: 15,
                            color: context.surfaceVariantColor,
                          ),
                        ),
                      ).animate().scale(
                        begin: const Offset(0.5, 0.5),
                        end: const Offset(1, 1),
                        duration: 400.ms,
                        curve: Curves.elasticOut,
                      )
                    : step.isActive
                    ? AnimatedBuilder(
                        animation: _pulseController,
                        builder: (context, child) {
                          return Container(
                            width: 28,
                            height: 28,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              gradient: const LinearGradient(
                                colors: [
                                  AppTheme.primaryBlue,
                                  AppTheme.neonPurple,
                                ],
                              ),
                              boxShadow: [
                                BoxShadow(
                                  color: AppTheme.primaryBlue.withValues(
                                    alpha: 0.3 + _pulseController.value * 0.3,
                                  ),
                                  blurRadius: 6 + _pulseController.value * 6,
                                  spreadRadius: _pulseController.value * 2,
                                ),
                              ],
                            ),
                            child: Center(
                              child: SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: context.surfaceVariantColor,
                                ),
                              ),
                            ),
                          );
                        },
                      )
                    : AnimatedContainer(
                        duration: const Duration(milliseconds: 400),
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: context.isDarkMode
                              ? Colors.white.withValues(alpha: 0.06)
                              : AppTheme.slate200,
                        ),
                        child: Center(
                          child: Icon(
                            step.icon,
                            size: 13,
                            color: context.isDarkMode
                                ? AppTheme.slate400
                                : AppTheme.slate500,
                          ),
                        ),
                      ),
                if (!isLast)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      decoration: BoxDecoration(
                        color: step.isDone
                            ? AppTheme.success.withValues(alpha: 0.4)
                            : (context.isDarkMode
                                  ? Colors.white.withValues(alpha: 0.06)
                                  : AppTheme.slate200),
                        borderRadius: BorderRadius.circular(1),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    step.label,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 14,
                      fontWeight: step.isActive
                          ? FontWeight.w700
                          : FontWeight.w600,
                      color: step.isDone
                          ? AppTheme.success
                          : step.isActive
                          ? AppTheme.primaryBlue
                          : context.textPrimary,
                    ),
                  ),
                  if (step.detail.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      step.detail,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w500,
                        height: 1.35,
                        color: context.textTertiaryColor,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProgressSteps(LinkFlowPhase phase) {
    final steps = [
      context.l10n?.scanStep ?? 'Scan',
      context.l10n?.aiQuiz ?? 'Quiz',
      context.l10n?.analyzeStep ?? 'Analyze',
      context.l10n?.resultLabel ?? 'Result',
    ];
    final activeIndex = switch (phase) {
      LinkFlowPhase.analyzing => 0,
      LinkFlowPhase.quizLoading => 1,
      LinkFlowPhase.quiz => 1,
      LinkFlowPhase.computing => 2,
      LinkFlowPhase.result => 3,
      _ => -1,
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: GlassContainer(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        child: Row(
          children: List.generate(steps.length, (i) {
            final done = i < activeIndex;
            final active = i == activeIndex;
            return Expanded(
              child: Row(
                children: [
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 400),
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: done
                          ? const LinearGradient(
                              colors: [
                                AppTheme.success,
                                AppTheme.scoreExcellent,
                              ],
                            )
                          : active
                          ? AppTheme.primaryGradient
                          : null,
                      color: (!done && !active)
                          ? context.surfaceVariantColor
                          : null,
                      boxShadow: active
                          ? [
                              BoxShadow(
                                color: AppTheme.primaryBlue.withValues(
                                  alpha: 0.3,
                                ),
                                blurRadius: 8,
                                spreadRadius: 1,
                              ),
                            ]
                          : null,
                    ),
                    child: Center(
                      child: done
                          ? Icon(
                              Icons.check_rounded,
                              size: 13,
                              color: context.surfaceVariantColor,
                            )
                          : Text(
                              '${i + 1}',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                                color: active
                                    ? context.textPrimary
                                    : AppTheme.slate400,
                              ),
                            ),
                    ),
                  ),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text(
                      steps[i],
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 10,
                        fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                        color: done
                            ? AppTheme.success
                            : active
                            ? AppTheme.primaryBlue
                            : AppTheme.slate400,
                      ),
                      overflow: TextOverflow.ellipsis,
                      maxLines: 1,
                    ),
                  ),
                  if (i < steps.length - 1)
                    Expanded(
                      child: Container(
                        height: 2,
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        decoration: BoxDecoration(
                          gradient: done
                              ? const LinearGradient(
                                  colors: [
                                    AppTheme.success,
                                    AppTheme.scoreExcellent,
                                  ],
                                )
                              : null,
                          color: done ? null : AppTheme.slate700,
                          borderRadius: BorderRadius.circular(1),
                        ),
                      ),
                    ),
                ],
              ),
            );
          }),
        ),
      ),
    );
  }

  String _getTitle(LinkFlowPhase phase) {
    switch (phase) {
      case LinkFlowPhase.idle:
        return context.l10n?.aiLinkAnalysis ?? 'AI Link Analysis';
      case LinkFlowPhase.analyzing:
      case LinkFlowPhase.quizLoading:
        return context.l10n?.analyzing ?? 'Analyzing...';
      case LinkFlowPhase.quiz:
        return context.l10n?.quickQuiz ?? 'Quick Quiz';
      case LinkFlowPhase.computing:
        return context.l10n?.computing ?? 'Computing...';
      case LinkFlowPhase.result:
        return context.l10n?.yourMatch ?? 'Your Match';
    }
  }

  Widget _buildBackgroundOrbs() {
    return Stack(
      children: [
        Positioned(
          top: -100,
          right: -100,
          child: AnimatedBuilder(
            animation: _orbController,
            builder: (context, child) {
              return Transform.scale(
                scale: _orbScaleAnimation.value,
                child: Container(
                  width: 400,
                  height: 400,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        AppTheme.primaryBlue.withValues(
                          alpha: _orbOpacityAnimation.value * 0.3,
                        ),
                        AppTheme.primaryBlue.withValues(alpha: 0.0),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        Positioned(
          bottom: 100,
          left: -50,
          child: Container(
            width: 300,
            height: 300,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(
                colors: [
                  AppTheme.accentCyan.withValues(alpha: 0.15),
                  AppTheme.accentCyan.withValues(alpha: 0.0),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildInputCard(bool isWorking) {
    final validCount = _urlControllers
        .where((c) => c.text.trim().isNotEmpty && _isValidUrl(c.text.trim()))
        .length;

    return Column(
      children: [
        // All link input fields
        for (int i = 0; i < _urlControllers.length; i++) ...[
          _buildLinkField(i, isWorking),
          if (i < _urlControllers.length - 1) const SizedBox(height: 8),
        ],

        // Add link button (show when < 4 links and the last field has valid URL)
        if (_urlControllers.length < 4 &&
            _urlControllers.last.text.trim().isNotEmpty &&
            _isValidUrl(_urlControllers.last.text.trim()))
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: GestureDetector(
              onTap: () {
                setState(() {
                  _urlControllers.add(TextEditingController());
                  _focusNodes.add(FocusNode());
                });
                // Focus the new field
                WidgetsBinding.instance.addPostFrameCallback((_) {
                  _focusNodes.last.requestFocus();
                });
              },
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: AppTheme.brandBlue.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: AppTheme.brandBlue.withValues(alpha: 0.2),
                    style: BorderStyle.solid,
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(
                      Icons.add_link_rounded,
                      color: AppTheme.brandBlue,
                      size: 16,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '+ Add link (${_urlControllers.length}/4)',
                      style: GoogleFonts.inter(
                        fontWeight: FontWeight.w600,
                        fontSize: 12,
                        color: AppTheme.brandBlue,
                      ),
                    ),
                  ],
                ),
              ),
            ).animate().fadeIn(duration: 300.ms),
          ),
        const SizedBox(height: 12),

        // Clipboard detected banner (notification only, no duplicate analyze button)
        if (_detectedClipboardUrl != null) ...[
          GestureDetector(
            onTap: () {
              _urlController.text = _detectedClipboardUrl!;
              setState(() => _detectedClipboardUrl = null);
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    AppTheme.brandBlue.withValues(alpha: 0.08),
                    AppTheme.brandSkyBlue.withValues(alpha: 0.05),
                  ],
                ),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: AppTheme.brandBlue.withValues(alpha: 0.2),
                ),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.content_paste_go_rounded,
                    color: AppTheme.brandBlue,
                    size: 16,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _detectedClipboardUrl!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: GoogleFonts.inter(
                        fontSize: 12,
                        color: context.textSecondary,
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: AppTheme.brandBlue.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      context.l10n?.pasteLink ?? 'Paste',
                      style: GoogleFonts.inter(
                        fontWeight: FontWeight.w700,
                        fontSize: 11,
                        color: AppTheme.brandBlue,
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  GestureDetector(
                    onTap: () => setState(() => _detectedClipboardUrl = null),
                    child: Icon(
                      Icons.close_rounded,
                      size: 14,
                      color: context.textTertiaryColor.withValues(alpha: 0.5),
                    ),
                  ),
                ],
              ),
            ),
          ).animate().fadeIn(duration: 300.ms),
          const SizedBox(height: 12),
        ],

        // Analyze button
        isWorking
            ? _buildPulsingButton()
            : Align(
                alignment: Alignment.center,
                child:
                    GestureDetector(
                          onTap: () => _startAnalysis(_urlController.text),
                          child: Container(
                            height: 46,
                            padding: const EdgeInsets.symmetric(horizontal: 20),
                            decoration: BoxDecoration(
                              gradient: const LinearGradient(
                                colors: [
                                  AppTheme.brandBlue,
                                  AppTheme.brandDeepBlue,
                                  AppTheme.brandSkyBlue,
                                ],
                                begin: Alignment.centerLeft,
                                end: Alignment.centerRight,
                              ),
                              borderRadius: BorderRadius.circular(14),
                              boxShadow: [
                                BoxShadow(
                                  color: AppTheme.brandBlue.withValues(
                                    alpha: 0.35,
                                  ),
                                  blurRadius: 16,
                                  offset: const Offset(0, 6),
                                  spreadRadius: -4,
                                ),
                              ],
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  validCount > 1
                                      ? Icons.compare_arrows_rounded
                                      : Icons.auto_awesome_rounded,
                                  color: Colors.white,
                                  size: 18,
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  validCount > 1
                                      ? '${context.l10n?.compare ?? 'Compare'} ($validCount)'
                                      : context.l10n?.analyzeWithAi ??
                                            'Analyze with AI',
                                  style: GoogleFonts.inter(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 14,
                                    color: Colors.white,
                                    letterSpacing: -0.3,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        )
                        .animate(onPlay: (c) => c.repeat())
                        .shimmer(
                          duration: 3000.ms,
                          color: Colors.white.withValues(alpha: 0.1),
                        ),
              ),
        const SizedBox(height: 8),

        // Store tags - minimal inline
        Wrap(
          spacing: 6,
          runSpacing: 6,
          alignment: WrapAlignment.center,
          children: [
            for (final store in [
              'Amazon',
              'eBay',
              'Best Buy',
              'Trendyol',
              'AliExpress',
              '100+',
            ])
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: context.surfaceVariantColor.withValues(alpha: 0.6),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  store,
                  style: GoogleFonts.inter(
                    fontSize: 10,
                    fontWeight: FontWeight.w500,
                    color: context.textTertiaryColor.withValues(alpha: 0.7),
                  ),
                ),
              ),
          ],
        ),
      ],
    ).animate().fadeIn(duration: 500.ms).slideY(begin: 0.03);
  }

  Widget _buildLinkField(int index, bool isWorking) {
    final controller = _urlControllers[index];
    final focusNode = _focusNodes[index];
    final isFirst = index == 0;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: AnimatedBuilder(
        animation: _orbController,
        builder: (context, child) {
          return Container(
            padding: const EdgeInsets.all(2),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(26),
              gradient: SweepGradient(
                colors: isFirst
                    ? const [
                        AppTheme.brandBlue,
                        AppTheme.brandSkyBlue,
                        AppTheme.brandCyan,
                        AppTheme.brandDeepBlue,
                        AppTheme.brandBlue,
                      ]
                    : const [
                        AppTheme.brandBlue,
                        AppTheme.brandCyan,
                        AppTheme.brandDeepBlue,
                        AppTheme.brandBlue,
                      ],
                transform: GradientRotation(_orbController.value * 2 * pi),
              ),
            ),
            child: child,
          );
        },
        child: ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: Container(
            decoration: BoxDecoration(
              color: context.surfaceElevatedColor,
              borderRadius: BorderRadius.circular(24),
            ),
            child: TextField(
              controller: controller,
              focusNode: focusNode,
              style: GoogleFonts.inter(
                color: context.textPrimary,
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
              decoration: InputDecoration(
                hintText: isFirst
                    ? (context.l10n?.pasteProductUrl ??
                          'Paste any product URL...')
                    : 'Link ${index + 1} — paste URL...',
                hintStyle: GoogleFonts.inter(
                  color: context.textTertiaryColor.withValues(alpha: 0.6),
                  fontWeight: FontWeight.w400,
                  fontSize: 13,
                ),
                prefixIcon: Padding(
                  padding: const EdgeInsets.only(left: 14, right: 8),
                  child: Icon(
                    Icons.link_rounded,
                    color: AppTheme.brandBlue.withValues(alpha: 0.7),
                    size: 18,
                  ),
                ),
                prefixIconConstraints: const BoxConstraints(
                  minWidth: 0,
                  minHeight: 0,
                ),
                suffixIcon: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (controller.text.isNotEmpty)
                      GestureDetector(
                        onTap: () {
                          controller.clear();
                          setState(() {});
                        },
                        child: Icon(
                          Icons.close_rounded,
                          size: 15,
                          color: context.textTertiaryColor.withValues(
                            alpha: 0.5,
                          ),
                        ),
                      ),
                    if (!isFirst)
                      GestureDetector(
                        onTap: () {
                          setState(() {
                            _urlControllers[index].dispose();
                            _urlControllers.removeAt(index);
                            _focusNodes[index].dispose();
                            _focusNodes.removeAt(index);
                          });
                        },
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 6),
                          child: Icon(
                            Icons.remove_circle_outline_rounded,
                            size: 16,
                            color: AppTheme.error.withValues(alpha: 0.7),
                          ),
                        ),
                      ),
                    if (isFirst)
                      Container(
                        margin: const EdgeInsets.only(left: 4, right: 6),
                        padding: const EdgeInsets.all(6),
                        decoration: BoxDecoration(
                          color: AppTheme.brandBlue.withValues(alpha: 0.1),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: GestureDetector(
                          onTap: () async {
                            final clipData = await Clipboard.getData(
                              Clipboard.kTextPlain,
                            );
                            if (clipData?.text != null) {
                              controller.text = clipData!.text!.trim();
                              setState(() {});
                            }
                          },
                          child: const Icon(
                            Icons.content_paste_rounded,
                            color: AppTheme.brandBlue,
                            size: 14,
                          ),
                        ),
                      ),
                  ],
                ),
                border: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 0,
                  vertical: 12,
                ),
              ),
              keyboardType: TextInputType.url,
              onChanged: (_) => setState(() {}),
              onSubmitted: isFirst ? (url) => _startAnalysis(url) : null,
            ),
          ),
        ),
      ),
    );
  }

  Widget _storeChip(String name, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      margin: const EdgeInsets.only(right: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.15)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(
            name,
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPulsingButton() {
    return AnimatedBuilder(
      animation: _pulseController,
      builder: (context, child) {
        return Container(
          height: 56,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            gradient: LinearGradient(
              colors: [
                AppTheme.primaryBlue,
                Color.lerp(
                  AppTheme.primaryBlue,
                  AppTheme.premiumPurple,
                  _pulseController.value,
                )!,
              ],
            ),
            boxShadow: [
              BoxShadow(
                color: AppTheme.primaryBlue.withValues(alpha: 0.3),
                blurRadius: 12 + (_pulseController.value * 8),
                spreadRadius: _pulseController.value * 2,
              ),
            ],
          ),
          child: Center(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    color: context.surfaceVariantColor,
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  context.l10n?.aiIsAnalyzing ?? 'AI is analyzing...',
                  style: GoogleFonts.plusJakartaSans(
                    color: context.surfaceVariantColor,
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildError(String error) {
    // Use info style (amber) for non-critical messages, error (red) for failures
    final isInfo = error.contains('ℹ️') || error.contains('tanıyamadık') || error.contains('couldn\'t identify');
    final color = isInfo ? Colors.amber : AppTheme.error;
    final icon = isInfo ? Icons.info_outline_rounded : Icons.error_outline_rounded;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Text(
              error.replaceAll('ℹ️ ', '').replaceAll('❌ ', ''),
              style: GoogleFonts.plusJakartaSans(
                color: color,
                fontSize: 14,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms);
  }

  /// Multi-link comparison view (shown after all products are analyzed)
  Widget _buildMultiLinkComparison() {
    final compareState = ref.watch(compareAnalysisProvider);
    final results = compareState.results.isNotEmpty
        ? compareState.results
        : _multiLinkResults;
    final sorted = List<EnhancedAnalysisResult>.from(results)
      ..sort((a, b) => b.enhancedScore.compareTo(a.enhancedScore));
    final winner = sorted.first;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Header
        Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [AppTheme.gold, AppTheme.goldOrange],
                  ),
                  borderRadius: BorderRadius.circular(14),
                  boxShadow: [
                    BoxShadow(
                      color: AppTheme.gold.withValues(alpha: 0.3),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.emoji_events_rounded,
                  color: Colors.white,
                  size: 24,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      context.l10n?.comparisonResults ?? 'Comparison Results',
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w800,
                        fontSize: 18,
                        color: context.textPrimary,
                      ),
                    ),
                    Text(
                      context.l10n?.productsAnalyzed(results.length) ??
                          '${results.length} products analyzed',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 12,
                        color: context.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ).animate().fadeIn(duration: 400.ms),

        // Ranking cards
        GlassContainer(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [AppTheme.gold, AppTheme.goldOrange],
                      ),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(
                      Icons.leaderboard_rounded,
                      color: context.surfaceVariantColor,
                      size: 18,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    context.l10n?.aiRanking ?? 'AI Ranking',
                    style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                      color: context.textPrimary,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              ...List.generate(sorted.length, (i) {
                final r = sorted[i];
                final title = r.baseResult.metadata.title ?? 'Product ${i + 1}';
                final medal = i == 0
                    ? '🥇'
                    : (i == 1 ? '🥈' : (i == 2 ? '🥉' : ''));
                final scoreColor = r.enhancedScore >= 80
                    ? AppTheme.scoreExcellent
                    : (r.enhancedScore >= 60
                          ? AppTheme.scoreGood
                          : AppTheme.scoreAverage);
                final isBest = i == 0;

                return Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        gradient: isBest
                            ? LinearGradient(
                                colors: [
                                  AppTheme.gold.withValues(
                                    alpha: context.isDarkMode ? 0.1 : 0.08,
                                  ),
                                  AppTheme.goldOrange.withValues(
                                    alpha: context.isDarkMode ? 0.06 : 0.04,
                                  ),
                                ],
                              )
                            : null,
                        color: !isBest
                            ? (context.isDarkMode
                                  ? Colors.white.withValues(alpha: 0.03)
                                  : Colors.white.withValues(alpha: 0.85))
                            : null,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: isBest
                              ? AppTheme.gold.withValues(alpha: 0.35)
                              : scoreColor.withValues(
                                  alpha: context.isDarkMode ? 0.15 : 0.18,
                                ),
                          width: isBest ? 1.3 : 1,
                        ),
                        boxShadow: context.isDarkMode
                            ? null
                            : AppTheme.cardShadowLight,
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              gradient: isBest
                                  ? const LinearGradient(
                                      colors: [
                                        AppTheme.gold,
                                        AppTheme.goldOrange,
                                      ],
                                    )
                                  : null,
                              color: !isBest
                                  ? scoreColor.withValues(alpha: 0.12)
                                  : null,
                              shape: BoxShape.circle,
                              boxShadow: isBest
                                  ? [
                                      BoxShadow(
                                        color: AppTheme.gold.withValues(
                                          alpha: 0.3,
                                        ),
                                        blurRadius: 8,
                                        offset: const Offset(0, 2),
                                      ),
                                    ]
                                  : null,
                            ),
                            child: Text(
                              medal.isNotEmpty ? medal : '${i + 1}',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: medal.isNotEmpty ? 20 : 14,
                                fontWeight: FontWeight.w900,
                                color: medal.isNotEmpty ? null : scoreColor,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  title,
                                  style: GoogleFonts.plusJakartaSans(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 13.5,
                                    color: context.textPrimary,
                                    letterSpacing: -0.2,
                                  ),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                if (r.prosForUser.isNotEmpty)
                                  Padding(
                                    padding: const EdgeInsets.only(top: 4),
                                    child: Row(
                                      children: [
                                        Icon(
                                          Icons.check_circle_rounded,
                                          size: 12,
                                          color: AppTheme.success,
                                        ),
                                        const SizedBox(width: 4),
                                        Expanded(
                                          child: Text(
                                            r.prosForUser.first,
                                            style: GoogleFonts.plusJakartaSans(
                                              fontSize: 11,
                                              fontWeight: FontWeight.w600,
                                              color: AppTheme.success,
                                            ),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                if (r.consForUser.isNotEmpty)
                                  Padding(
                                    padding: const EdgeInsets.only(top: 2),
                                    child: Row(
                                      children: [
                                        Icon(
                                          Icons.warning_rounded,
                                          size: 12,
                                          color: AppTheme.warning,
                                        ),
                                        const SizedBox(width: 4),
                                        Expanded(
                                          child: Text(
                                            r.consForUser.first,
                                            style: GoogleFonts.plusJakartaSans(
                                              fontSize: 11,
                                              fontWeight: FontWeight.w600,
                                              color: AppTheme.warning,
                                            ),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 8,
                            ),
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                colors: [
                                  scoreColor.withValues(alpha: 0.2),
                                  scoreColor.withValues(alpha: 0.1),
                                ],
                              ),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(
                                color: scoreColor.withValues(alpha: 0.3),
                              ),
                            ),
                            child: Text(
                              '${r.enhancedScore.toStringAsFixed(0)}%',
                              style: GoogleFonts.plusJakartaSans(
                                fontWeight: FontWeight.w900,
                                fontSize: 14,
                                color: scoreColor,
                                letterSpacing: -0.3,
                              ),
                            ),
                          ),
                        ],
                      ),
                    )
                    .animate(delay: (i * 100).ms)
                    .fadeIn(duration: 300.ms)
                    .slideX(begin: 0.05);
              }),
            ],
          ),
        ).animate(delay: 200.ms).fadeIn(duration: 400.ms),

        const SizedBox(height: 16),

        // AI Verdict — personalized recommendation using Gemini's actual verdict
        GlassContainer(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [AppTheme.brandBlue, AppTheme.brandSkyBlue],
                      ),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      Icons.auto_awesome_rounded,
                      color: Colors.white,
                      size: 18,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    context.l10n?.aiVerdict ?? 'AI Verdict',
                    style: GoogleFonts.plusJakartaSans(
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                      color: context.textPrimary,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              // Show Gemini's actual detailed verdict if available
              if (winner.detailedVerdict.isNotEmpty &&
                  winner.detailedVerdict != winner.baseResult.aiAnalysis)
                Text(
                  winner.detailedVerdict,
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 14,
                    color: context.textPrimary,
                    height: 1.5,
                  ),
                )
              else ...[
                Text(
                  '${winner.baseResult.metadata.title ?? "Product 1"} is your best match with a ${winner.enhancedScore.toStringAsFixed(0)}% compatibility score.',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 14,
                    color: context.textPrimary,
                    height: 1.5,
                  ),
                ),
                if (sorted.length > 1) ...[
                  const SizedBox(height: 8),
                  Text(
                    'Score difference: ${(winner.enhancedScore - sorted.last.enhancedScore).toStringAsFixed(0)} points between best and worst match.',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13,
                      color: context.textSecondary,
                      height: 1.4,
                    ),
                  ),
                ],
              ],
            ],
          ),
        ).animate(delay: 400.ms).fadeIn(duration: 400.ms),

        const SizedBox(height: 16),

        // Individual product breakdowns — full width cards
        ...List.generate(sorted.length, (i) {
          final r = sorted[i];
          final title = r.baseResult.metadata.title ?? 'Product ${i + 1}';
          final medal = i == 0
              ? '🥇'
              : (i == 1 ? '🥈' : (i == 2 ? '🥉' : '#${i + 1}'));
          final isTr =
              Localizations.localeOf(context).languageCode == 'tr';
          final scoreColor = r.enhancedScore >= 80
              ? AppTheme.scoreExcellent
              : r.enhancedScore >= 60
              ? AppTheme.scoreGood
              : AppTheme.scoreAverage;
          final pScore = r.personaScore ?? 0;
          final pColor = pScore >= 80
              ? AppTheme.success
              : pScore >= 60
              ? AppTheme.scoreGood
              : pScore >= 40
              ? AppTheme.scoreAverage
              : AppTheme.scorePoor;
          final cScore = r.communityScore ?? 0;
          final cColor = cScore >= 75
              ? AppTheme.success
              : cScore >= 50
              ? AppTheme.scoreGood
              : cScore >= 30
              ? AppTheme.scoreAverage
              : AppTheme.scorePoor;

          return Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: GlassContainer(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(medal, style: const TextStyle(fontSize: 18)),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              title,
                              style: GoogleFonts.plusJakartaSans(
                                fontWeight: FontWeight.w700,
                                fontSize: 14,
                                color: context.textPrimary,
                              ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 4,
                            ),
                            decoration: BoxDecoration(
                              color: scoreColor.withValues(alpha: 0.12),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              '${r.enhancedScore.toStringAsFixed(0)}%',
                              style: GoogleFonts.plusJakartaSans(
                                fontWeight: FontWeight.w800,
                                fontSize: 13,
                                color: scoreColor,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      // Score breakdown bars from factors
                      ...r.factors
                          .take(5)
                          .map(
                            (f) => _buildComparisonScoreBar(
                              f.label,
                              f.score,
                              context,
                            ),
                          ),
                      // Pros for You
                      if (r.prosForUser.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Text(
                          context.l10n?.prosForYou ?? 'Pros for You',
                          style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                            color: AppTheme.success,
                          ),
                        ),
                        const SizedBox(height: 6),
                        ...r.prosForUser
                            .take(3)
                            .map(
                              (p) => Padding(
                                padding: const EdgeInsets.only(bottom: 6),
                                child: Row(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      '✅ ',
                                      style: TextStyle(fontSize: 12),
                                    ),
                                    Expanded(
                                      child: Text(
                                        p,
                                        style: GoogleFonts.plusJakartaSans(
                                          fontSize: 12,
                                          color: context.textSecondary,
                                          height: 1.4,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                      ],
                      // Cons for You
                      if (r.consForUser.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Text(
                          context.l10n?.consForYou ?? 'Cons for You',
                          style: GoogleFonts.plusJakartaSans(
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                            color: AppTheme.warning,
                          ),
                        ),
                        const SizedBox(height: 6),
                        ...r.consForUser
                            .take(3)
                            .map(
                              (c) => Padding(
                                padding: const EdgeInsets.only(bottom: 6),
                                child: Row(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      '⚠️ ',
                                      style: TextStyle(fontSize: 12),
                                    ),
                                    Expanded(
                                      child: Text(
                                        c,
                                        style: GoogleFonts.plusJakartaSans(
                                          fontSize: 12,
                                          color: context.textSecondary,
                                          height: 1.4,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                      ],
                      // Personal Fit
                      if (r.personaScore != null ||
                          r.personaAnalysis != null) ...[
                        const SizedBox(height: 12),
                        const Divider(height: 1),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(6),
                              decoration: BoxDecoration(
                                gradient: const LinearGradient(
                                  colors: [
                                    AppTheme.premiumPurple,
                                    AppTheme.neonPurple,
                                  ],
                                ),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: const Icon(
                                Icons.biotech_rounded,
                                size: 14,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                isTr ? 'Kişisel Uyum' : 'Personal Fit',
                                style: GoogleFonts.plusJakartaSans(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12,
                                  color: pColor,
                                ),
                              ),
                            ),
                            if (r.personaScore != null)
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: pColor.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: pColor.withValues(alpha: 0.3),
                                  ),
                                ),
                                child: Text(
                                  '${r.personaScore!.toStringAsFixed(0)}%',
                                  style: GoogleFonts.inter(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: pColor,
                                  ),
                                ),
                              ),
                          ],
                        ),
                        if (r.personaScore != null) ...[
                          const SizedBox(height: 8),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: TweenAnimationBuilder<double>(
                              duration: const Duration(milliseconds: 800),
                              curve: Curves.easeOutCubic,
                              tween: Tween(
                                begin: 0.0,
                                end: r.personaScore! / 100,
                              ),
                              builder: (_, v, w) =>
                                  LinearProgressIndicator(
                                    value: v,
                                    minHeight: 5,
                                    backgroundColor:
                                        AppTheme.slate700.withValues(
                                          alpha: 0.3,
                                        ),
                                    color: pColor,
                                  ),
                            ),
                          ),
                        ],
                        if (r.personaAnalysis != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            r.personaAnalysis!,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              color: context.textSecondary,
                              height: 1.5,
                            ),
                            maxLines: 5,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ],
                      // Community Reviews
                      if (r.communityScore != null ||
                          r.communityAnalysis != null) ...[
                        const SizedBox(height: 12),
                        const Divider(height: 1),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(6),
                              decoration: BoxDecoration(
                                gradient: const LinearGradient(
                                  colors: [
                                    AppTheme.brandCyan,
                                    AppTheme.brandSkyBlue,
                                  ],
                                ),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: const Icon(
                                Icons.forum_rounded,
                                size: 14,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                isTr
                                    ? 'Topluluk Yorumları'
                                    : 'Community Reviews',
                                style: GoogleFonts.plusJakartaSans(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12,
                                  color: cColor,
                                ),
                              ),
                            ),
                            if (r.communityScore != null)
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 3,
                                ),
                                decoration: BoxDecoration(
                                  color: cColor.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(
                                    color: cColor.withValues(alpha: 0.3),
                                  ),
                                ),
                                child: Text(
                                  '${r.communityScore!.toStringAsFixed(0)}%',
                                  style: GoogleFonts.inter(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: cColor,
                                  ),
                                ),
                              ),
                          ],
                        ),
                        if (r.communityScore != null) ...[
                          const SizedBox(height: 8),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: TweenAnimationBuilder<double>(
                              duration: const Duration(milliseconds: 800),
                              curve: Curves.easeOutCubic,
                              tween: Tween(
                                begin: 0.0,
                                end: r.communityScore! / 100,
                              ),
                              builder: (_, v, w) =>
                                  LinearProgressIndicator(
                                    value: v,
                                    minHeight: 5,
                                    backgroundColor:
                                        AppTheme.slate700.withValues(
                                          alpha: 0.3,
                                        ),
                                    color: cColor,
                                  ),
                            ),
                          ),
                        ],
                        if (r.communityAnalysis != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            r.communityAnalysis!,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              color: context.textSecondary,
                              height: 1.5,
                            ),
                            maxLines: 5,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ],
                      ],
                      // AI Summary / Overall Verdict
                      if (r.overallVerdict != null ||
                          r.detailedVerdict.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        const Divider(height: 1),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(6),
                              decoration: BoxDecoration(
                                gradient: const LinearGradient(
                                  colors: [
                                    AppTheme.gold,
                                    AppTheme.goldOrange,
                                  ],
                                ),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: const Icon(
                                Icons.auto_awesome_rounded,
                                size: 14,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              isTr ? 'AI Özeti' : 'AI Summary',
                              style: GoogleFonts.plusJakartaSans(
                                fontWeight: FontWeight.w700,
                                fontSize: 12,
                                color: context.textPrimary,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          r.overallVerdict ?? r.detailedVerdict,
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12,
                            color: context.textSecondary,
                            height: 1.5,
                          ),
                          maxLines: 6,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ],
                  ),
                ),
              )
              .animate(delay: (600 + i * 150).ms)
              .fadeIn(duration: 300.ms)
              .slideY(begin: 0.03);
        }),

        // Better Alternatives section (from the winner's alternatives list)
        if (winner.alternatives.isNotEmpty) ...[
          const SizedBox(height: 16),
          GlassContainer(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [AppTheme.brandCyan, AppTheme.brandSkyBlue],
                        ),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(
                        Icons.lightbulb_rounded,
                        color: Colors.white,
                        size: 18,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Better Alternatives',
                      style: GoogleFonts.plusJakartaSans(
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                        color: context.textPrimary,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  'Based on your profile, you might also consider:',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    color: context.textSecondary,
                  ),
                ),
                const SizedBox(height: 8),
                ...winner.alternatives
                    .take(3)
                    .map(
                      (alt) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                          decoration: BoxDecoration(
                            color: context.surfaceVariantColor,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Row(
                            children: [
                              Icon(
                                Icons.arrow_forward_rounded,
                                color: AppTheme.brandBlue,
                                size: 16,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  alt,
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 13,
                                    color: context.textPrimary,
                                    fontWeight: FontWeight.w600,
                                  ),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
              ],
            ),
          ).animate(delay: 900.ms).fadeIn(duration: 400.ms),
        ],

        const SizedBox(height: 16),

        // Start over button
        GestureDetector(
          onTap: () {
            HapticFeedback.mediumImpact();
            _resetAllFlows();
          },
          child: Container(
            height: 48,
            decoration: BoxDecoration(
              color: context.surfaceVariantColor,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: context.textTertiaryColor.withValues(alpha: 0.2),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  Icons.refresh_rounded,
                  color: context.textSecondary,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Text(
                  context.l10n?.startOver ?? 'Start Over',
                  style: GoogleFonts.inter(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                    color: context.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ).animate(delay: 1000.ms).fadeIn(duration: 300.ms),
      ],
    );
  }

  /// Score bar for comparison view
  Widget _buildComparisonScoreBar(
    String label,
    double score,
    BuildContext ctx,
  ) {
    final color = score >= 80
        ? AppTheme.scoreExcellent
        : (score >= 60 ? AppTheme.scoreGood : AppTheme.scoreAverage);
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          SizedBox(
            width: 72,
            child: Text(
              label,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 11,
                color: ctx.textSecondary,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Expanded(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: score / 100.0,
                minHeight: 6,
                backgroundColor: ctx.surfaceVariantColor,
                valueColor: AlwaysStoppedAnimation<Color>(color),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '${score.toStringAsFixed(0)}',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildInfoCards() {
    final isTr = Localizations.localeOf(context).languageCode == 'tr';
    final steps = [
      (
        Icons.link_rounded,
        isTr ? 'Bağlantıyı Yapıştır' : 'Paste Link',
        isTr
            ? 'Herhangi bir mağazadan ürün bağlantısını ekle'
            : 'Drop any product URL from 100+ stores',
        AppTheme.brandBlue,
      ),
      (
        Icons.forum_rounded,
        isTr ? 'İnternet Yorumları' : 'Community Voice',
        isTr
            ? 'Reddit · Trustpilot · YouTube ve forumlardan gerçek deneyimler'
            : 'Real opinions from Reddit, Trustpilot, forums & YouTube',
        AppTheme.brandCyan,
      ),
      (
        Icons.psychology_rounded,
        isTr ? 'Kişisel Quiz' : 'Personal Quiz',
        isTr
            ? 'Kısa sorularla ihtiyaçlarını tanıyalım'
            : 'Quick questions tailored to your needs',
        AppTheme.brandSkyBlue,
      ),
      (
        Icons.diamond_rounded,
        isTr ? 'Eşleşme Skoru' : 'Match Score',
        isTr
            ? 'Sana özel uyumluluk puanını al'
            : 'Get your personalized compatibility score',
        AppTheme.brandDeepBlue,
      ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 20),

        // Section header with subtle accent line
        Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: Row(
            children: [
              Container(
                width: 4,
                height: 20,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [AppTheme.brandBlue, AppTheme.brandCyan],
                  ),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: 10),
              Text(
                isTr ? 'Nasıl çalışır' : 'How it works',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: context.textPrimary,
                  letterSpacing: -0.3,
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 5,
                ),
                decoration: BoxDecoration(
                  color: AppTheme.brandCyan.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: AppTheme.brandCyan.withValues(alpha: 0.15),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.auto_awesome_rounded,
                      size: 11,
                      color: AppTheme.brandCyan,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      isTr ? 'AI + İnternet' : 'AI + Web',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 10.5,
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

        // Vertical flow steps
        ...List.generate(steps.length, (i) {
          final (icon, title, desc, color) = steps[i];
          final isLast = i == steps.length - 1;
          return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Column(
                      children: [
                        Container(
                          width: 34,
                          height: 34,
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              colors: [color, color.withValues(alpha: 0.65)],
                            ),
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: color.withValues(alpha: 0.28),
                                blurRadius: 10,
                                offset: const Offset(0, 3),
                              ),
                            ],
                          ),
                          child: Center(
                            child: Text(
                              '0${i + 1}',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                                letterSpacing: -0.3,
                              ),
                            ),
                          ),
                        ),
                        if (!isLast)
                          Container(
                            width: 2,
                            height: 20,
                            margin: const EdgeInsets.symmetric(vertical: 2),
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                begin: Alignment.topCenter,
                                end: Alignment.bottomCenter,
                                colors: [
                                  color.withValues(alpha: 0.35),
                                  color.withValues(alpha: 0.05),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: context.isDarkMode
                              ? color.withValues(alpha: 0.06)
                              : Colors.white.withValues(alpha: 0.85),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: color.withValues(
                              alpha: context.isDarkMode ? 0.15 : 0.18,
                            ),
                          ),
                          boxShadow: context.isDarkMode
                              ? null
                              : AppTheme.cardShadowLight,
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 38,
                              height: 38,
                              decoration: BoxDecoration(
                                color: color.withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Icon(icon, size: 20, color: color),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    title,
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 13.5,
                                      fontWeight: FontWeight.w700,
                                      color: context.textPrimary,
                                      letterSpacing: -0.2,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    desc,
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.w500,
                                      color: context.textTertiaryColor,
                                      height: 1.35,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              )
              .animate()
              .fadeIn(delay: (80 * i).ms, duration: 380.ms)
              .slideX(begin: 0.04);
        }),

        const SizedBox(height: 18),

        // AI Powers - horizontal scroll cards
        SizedBox(
          height: 120,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              _PowerCard(
                icon: Icons.forum_rounded,
                color: AppTheme.brandCyan,
                title: isTr ? 'İnternet\nYorumları' : 'Community\nReviews',
                emoji: '💬',
              ),
              _PowerCard(
                icon: Icons.memory_rounded,
                color: AppTheme.brandBlue,
                title: context.l10n?.specAnalysis ?? 'Spec\nAnalysis',
                emoji: '🔬',
              ),
              _PowerCard(
                icon: Icons.swap_horiz_rounded,
                color: AppTheme.brandSkyBlue,
                title: context.l10n?.smartAlternatives ?? 'Smart\nAlternatives',
                emoji: '🔄',
              ),
              _PowerCard(
                icon: Icons.star_rounded,
                color: AppTheme.scoreAverage,
                title: context.l10n?.reviewDigest ?? 'Review\nDigest',
                emoji: '⭐',
              ),
              _PowerCard(
                icon: Icons.person_rounded,
                color: AppTheme.brandDeepBlue,
                title: context.l10n?.personalMatch ?? 'Personal\nMatch',
                emoji: '🎯',
              ),
            ],
          ),
        ),

        const SizedBox(height: 16),
      ],
    );
  }

  Widget _storePill(String name, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.12)),
      ),
      child: Text(
        name,
        style: GoogleFonts.plusJakartaSans(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════
  // ANALYSIS HISTORY — Görev 11
  // ═══════════════════════════════════════════════════════════

  static const _historyKey = 'link_analysis_history_v1';

  Future<List<Map<String, dynamic>>> _loadHistory() async {
    try {
      final cache = ref.read(cacheServiceProvider);
      final raw = await cache.get<String>(_historyKey);
      if (raw == null || raw.isEmpty) return [];
      final list = (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
      return list;
    } catch (_) {
      return [];
    }
  }

  Future<void> _saveToHistory({
    required String url,
    required String productName,
    required double score,
    EnhancedAnalysisResult? result,
  }) async {
    final historyKey = '$url|${result?.enhancedScore ?? score}';
    if (_lastSavedSingleHistoryKey == historyKey) return;
    _lastSavedSingleHistoryKey = historyKey;

    final entry = {
      'id': DateTime.now().microsecondsSinceEpoch.toString(),
      'type': 'single',
      'url': url,
      'productName': productName,
      'score': score,
      if (result != null) 'analysis': result.detailedVerdict,
      if (result != null && result.baseResult.category != null)
        'category': result.baseResult.category,
      if (result != null && result.baseResult.metadata.image != null)
        'imageUrl': result.baseResult.metadata.image,
      'timestamp': DateTime.now().toIso8601String(),
      if (result != null) 'result': result.toJson(),
    };

    // Anında yerel listeye ekle (optimistic update — geçmiş ekranı anında görsün)
    try {
      ref
          .read(pendingLinkAnalysisHistoryProvider.notifier)
          .update(
            (list) => [entry, ...list.where((e) => e['id'] != entry['id'])],
          );
    } catch (_) {}

    // Firebase'e kaydet (giriş yapmış kullanıcı için)
    try {
      final auth = ref.read(authStateProvider).valueOrNull;
      if (auth != null) {
        ref
            .read(pbDataSourceProvider)
            .saveLinkAnalysisHistory(auth, entry)
            .then((_) => ref.invalidate(linkAnalysisHistoryProvider))
            .catchError((_) {});
      }
    } catch (_) {}

    // Yerel cache'e de kaydet (yedek / çevrimdışı erişim için)
    try {
      final cache = ref.read(cacheServiceProvider);
      final history = await _loadHistory();
      history.removeWhere((e) => e['url'] == url);
      history.insert(0, entry);
      final trimmed = history.take(30).toList();
      await cache.set<String>(
        _historyKey,
        jsonEncode(trimmed),
        duration: const Duration(days: 30),
      );
    } catch (_) {}
  }

  Future<void> _saveCompareHistory(List<EnhancedAnalysisResult> results) async {
    if (results.length < 2) return;
    final urls = results.map((result) => result.baseResult.url).toList();
    final historyKey = urls.join('|');
    if (_lastSavedCompareHistoryKey == historyKey) return;
    _lastSavedCompareHistoryKey = historyKey;

    final products = results.map((result) {
      final title = result.baseResult.metadata.title?.trim();
      return (title == null || title.isEmpty)
          ? (context.l10n?.productLabel ?? 'Product')
          : title;
    }).toList();
    final averageScore =
        results.fold<double>(0, (sum, result) => sum + result.enhancedScore) /
        results.length;
    final entry = {
      'id': DateTime.now().microsecondsSinceEpoch.toString(),
      'type': 'compare',
      'title': products.join(' vs '),
      'productName': products.join(' vs '),
      'products': products,
      'urls': urls,
      'score': averageScore,
      'analysis': '',
      'timestamp': DateTime.now().toIso8601String(),
      'results': results.map((result) => result.toJson()).toList(),
    };

    try {
      ref
          .read(pendingLinkAnalysisHistoryProvider.notifier)
          .update(
            (list) => [entry, ...list.where((e) => e['id'] != entry['id'])],
          );
    } catch (_) {}

    try {
      final auth = ref.read(authStateProvider).valueOrNull;
      if (auth != null) {
        ref
            .read(pbDataSourceProvider)
            .saveLinkAnalysisHistory(auth, entry)
            .then((_) => ref.invalidate(linkAnalysisHistoryProvider))
            .catchError((_) {});
      }
    } catch (_) {}
  }

  void _showAnalysisHistory() {
    Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute(builder: (_) => const LinkAnalysisHistoryScreen()),
    );
  }

  String _formatDate(DateTime? dt) {
    if (dt == null) return '';
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inMinutes < 1) return 'Az önce';
    if (diff.inHours < 1) return '${diff.inMinutes}dk önce';
    if (diff.inDays < 1) return '${diff.inHours}sa önce';
    if (diff.inDays < 7) return '${diff.inDays}g önce';
    return '${dt.day}/${dt.month}/${dt.year}';
  }

  Widget _moreStoresPill() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppTheme.slate700),
      ),
      child: Text(
        context.l10n?.plusMore('100') ?? '+ 100 more',
        style: GoogleFonts.plusJakartaSans(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: context.textTertiaryColor,
        ),
      ),
    );
  }
}
